#!/usr/bin/env node
/**
 * 把 MCP server 组装成**随包分发**的精简运行时（P13：发布版自带 MCP server）。
 *
 * 为什么需要：干净用户机上没有开发机那份 `server/dist`，也没有 profile 里的注册
 * ⇒ 包内 `mcp__sv__*` 一颗工具都没有（用户 2026-09-19 记录为 P13）。
 *
 * 产物：`dist/server-runtime/`（electron-builder 以 extraResources 放到 `resources/server`）
 *   ├─ dist/            编译产物（server/dist 全量）
 *   ├─ node_modules/    生产依赖（**按平台裁剪**：onnxruntime 只留目标平台那份）
 *   └─ models/          onnx 模型（--no-models 可跳过，见下）
 *
 * 体积要点（实测 2026-09-19）：server/node_modules = 308 MB，其中 onnxruntime-node 占 258 MB，
 *   而它 **win32/x64 只有 61 MB**（其余是 darwin/linux/win-arm64）⇒ 裁平台后增量可接受。
 *
 * 用法：
 *   node tools/build-server-runtime.cjs                          # 默认：带模型 + **当前平台**
 *   node tools/build-server-runtime.cjs --no-models              # 不带模型（分离/提取类工具会报"模型缺失"）
 *   node tools/build-server-runtime.cjs --platform darwin --arch arm64   # 🆕 为 macOS(Apple Silicon) 组装
 *   node tools/build-server-runtime.cjs --platform darwin --arch x64     # 🆕 macOS(Intel)
 *   node tools/build-server-runtime.cjs --platform darwin --arch arm64 --out dist/server-runtime-darwin-arm64
 *                                                               # 🆕 组装到别处（不动正在用的那份）
 *   node tools/build-server-runtime.cjs --platform darwin --arch x64 --out dist/server-runtime-darwin-x64 \
 *        --onnx-version 1.23.2                                  # 🆕 **给这个目标钉 onnxruntime 版本**
 *   （平台名用 Node 口径：win32 / darwin / linux；arch：x64 / arm64）
 *
 * ⚠️ `--onnx-version` 为什么存在（2026-09-25，Intel mac 支持）：`onnxruntime-node` 自 1.24 起
 *   **不再发布 darwin/x64 的二进制**（上游 microsoft/onnxruntime#27961）⇒ 1.27 装出来没有
 *   `bin/napi-v6/darwin/x64/`，而 `server/src/tools.ts` **顶层 import** 了用它的模块 ⇒ 缺了会
 *   整个 server 起不来（这就是"mac 只支持 Apple Silicon"的硬来源）。实测 **1.23.2 的 npm 包里自带
 *   `darwin/x64` 的 dylib + binding**（`bin/napi-v6/darwin/x64/{libonnxruntime.1.23.2.dylib,onnxruntime_binding.node}`）
 *   ⇒ 给 darwin/x64 这一份单独钉旧版即可。只在**目标平台**生效：临时目录里按 `--os/--cpu` 装好后
 *   替换产物里那份 onnxruntime-node（本机 node_modules 与别的平台产物都不受影响）。
 * ⚠️ 产物目录里会写一份 `STAGING.json` 台账（平台/架构/有没有模型）。**这个目录是"当前要打包的那份"**：
 *    为 mac 组装完再打 Windows 包，就会把 darwin 裁过的依赖塞进 Windows 安装包
 *    ⇒ `tools/check-package-assets.cjs` 会拿台账拦住（2026-09-24 加）。
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const SERVER = path.join(ROOT, 'server')
const WITH_MODELS = !process.argv.includes('--no-models')
const opt = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d }
/** `--out <dir>`：组装到别处（默认 dist/server-runtime —— 那是 electron-builder 打包读的固定路径） */
const OUT = path.resolve(opt('--out', path.join(ROOT, 'dist', 'server-runtime')))
/**
 * 目标平台/架构（🆕 2026-09-21：原先**写死 win32/x64** ⇒ 想支持 macOS 必须参数化）。
 * 默认 = 当前机器（在 Windows 上跑就还是 win32/x64，**行为与从前完全一致**）。
 */
const PLATFORM = opt('--platform', process.platform)
const ARCH = opt('--arch', process.arch)
const VALID = { win32: ['x64', 'arm64'], darwin: ['x64', 'arm64'], linux: ['x64', 'arm64'] }
if (!VALID[PLATFORM] || !VALID[PLATFORM].includes(ARCH)) {
  console.error(`✗ 不支持的平台/架构组合：--platform ${PLATFORM} --arch ${ARCH}（可用：win32/darwin/linux × x64/arm64）`)
  process.exit(2)
}

/** onnxruntime-node 里要保留的平台目录（相对 bin/napi-v6/） */
const KEEP_ORT = [path.join(PLATFORM === 'win32' ? 'win32' : PLATFORM, ARCH)]

function sizeMB(p) {
  let sum = 0
  const walk = (d) => {
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) walk(f)
      else { try { sum += fs.statSync(f).size } catch { /* 忽略 */ } }
    }
  }
  if (fs.existsSync(p)) walk(p)
  return sum / 1024 / 1024
}

/** 复制目录（可带过滤：返回 false 表示跳过） */
function copyDir(src, dst, filter) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (filter && !filter(s, e)) continue
    if (e.isDirectory()) copyDir(s, d, filter)
    else fs.copyFileSync(s, d)
  }
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* 忽略 */ }
}

console.log('== 组装 dist/server-runtime（P13：包内自带 MCP server）==')
console.log('   目标平台：' + PLATFORM + '/' + ARCH + (PLATFORM === process.platform && ARCH === process.arch ? '（= 当前机器）' : '（⚠️ 跨平台组装：只影响依赖裁剪，**宿主侧 node 运行时与 STT 依赖要另备**）'))
rmrf(OUT)
fs.mkdirSync(OUT, { recursive: true })

// ① 编译产物
const distSrc = path.join(SERVER, 'dist')
if (!fs.existsSync(path.join(distSrc, 'index.js'))) {
  console.error('✗ server/dist/index.js 不存在 —— 先 `cd server && npm run build`')
  process.exit(1)
}
copyDir(distSrc, path.join(OUT, 'dist'))
// package.json 必须带上：server 是 ESM（"type":"module"），缺了它会触发
// MODULE_TYPELESS_PACKAGE_JSON 警告（Node 得靠语法猜、白付一次重解析开销）。
fs.copyFileSync(path.join(SERVER, 'package.json'), path.join(OUT, 'package.json'))
console.log('  ✓ dist/ + package.json  ' + sizeMB(path.join(OUT, 'dist')).toFixed(1) + ' MB')

// ② 生产依赖（按 package.json 的 dependencies 白名单，避免把 devDeps 带进去）
const pkg = JSON.parse(fs.readFileSync(path.join(SERVER, 'package.json'), 'utf8'))
const prodDeps = Object.keys(pkg.dependencies || {})
const srcNM = path.join(SERVER, 'node_modules')
const dstNM = path.join(OUT, 'node_modules')
fs.mkdirSync(dstNM, { recursive: true })
for (const dep of prodDeps) {
  const s = path.join(srcNM, dep)
  if (!fs.existsSync(s)) { console.warn('  ! 依赖缺失，跳过：' + dep); continue }
  copyDir(s, path.join(dstNM, dep))
}
// 传递依赖：从顶层 node_modules 里按"生产依赖闭包"补齐（简化：把不在白名单但被 require 到的顶层包也带上）
// 这里采用保守做法——把顶层所有目录都扫一遍，跳过明显的开发依赖与巨型无用包。
const DEV_SKIP = new Set(['typescript', '@types', '.bin', '.package-lock.json'])
for (const e of fs.readdirSync(srcNM, { withFileTypes: true })) {
  if (!e.isDirectory()) continue
  if (DEV_SKIP.has(e.name)) continue
  if (prodDeps.includes(e.name)) continue
  if (e.name.startsWith('@')) {
    // scope 目录：逐个成员判断（如 @audio/beat 已在白名单里）
    for (const m of fs.readdirSync(path.join(srcNM, e.name), { withFileTypes: true })) {
      if (!m.isDirectory()) continue
      const full = e.name + '/' + m.name
      if (prodDeps.includes(full) || DEV_SKIP.has(m.name)) continue
      copyDir(path.join(srcNM, e.name, m.name), path.join(dstNM, e.name, m.name))
    }
    continue
  }
  copyDir(path.join(srcNM, e.name), path.join(dstNM, e.name))
}
// ③ 裁掉 onnxruntime 里**非目标平台**的二进制（258 MB → 单平台约 60 MB）

/* ③' `--onnx-version <v>`：给**这个目标**换上指定版本的 onnxruntime-node（必须在裁剪之前做）。
 * 场景：darwin/x64 从 1.24 起就没有官方二进制了 ⇒ 钉 1.23.2（它的 npm 包自带 darwin/x64）。
 * 做法：临时目录里 `npm install --os=<platform> --cpu=<arch> --ignore-scripts onnxruntime-node@<v>`
 * （`--ignore-scripts`：二进制就在 tarball 里，不需要它的 postinstall 再去下载），然后**整包替换**。 */
const ONNX_VER = opt('--onnx-version', '')
if (ONNX_VER) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-ort-'))
  fs.writeFileSync(path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'akdagent-ort-stage', version: '1.0.0', private: true }, null, 2), 'utf8')
  const args = ['install', '--os=' + PLATFORM, '--cpu=' + ARCH, '--ignore-scripts',
    '--no-audit', '--no-fund', '--loglevel=error', 'onnxruntime-node@' + ONNX_VER]
  console.log(`  … 给 ${PLATFORM}/${ARCH} 装 onnxruntime-node@${ONNX_VER}（临时目录，不动本机）`)
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
    { cwd: tmp, stdio: 'inherit', shell: false })
  const src = path.join(tmp, 'node_modules', 'onnxruntime-node')
  if (r.status !== 0 || !fs.existsSync(src)) {
    console.error(`✗ onnxruntime-node@${ONNX_VER} 装失败（exit=${r.status}）—— 该版本对 ${PLATFORM}/${ARCH} 可能也没有二进制`)
    process.exit(3)
  }
  const keepDir = path.join(src, 'bin', 'napi-v6', PLATFORM === 'win32' ? 'win32' : PLATFORM, ARCH)
  if (!fs.existsSync(keepDir)) {
    console.error(`✗ onnxruntime-node@${ONNX_VER} 里没有 ${PLATFORM}/${ARCH} 的二进制（${keepDir}）—— 换一个版本再试`)
    process.exit(3)
  }
  rmrf(path.join(dstNM, 'onnxruntime-node'))
  copyDir(src, path.join(dstNM, 'onnxruntime-node'))
  console.log(`  ✓ onnxruntime-node 已换成 ${ONNX_VER}（自带 ${PLATFORM}/${ARCH} 二进制）`)
  try { rmrf(tmp) } catch { /* 临时目录清不掉就算了 */ }
}

const ortBin = path.join(dstNM, 'onnxruntime-node', 'bin', 'napi-v6')
if (fs.existsSync(ortBin)) {
  for (const os of fs.readdirSync(ortBin)) {
    const osDir = path.join(ortBin, os)
    if (os !== PLATFORM) { rmrf(osDir); continue }
    for (const arch of fs.readdirSync(osDir)) {
      if (!KEEP_ORT.includes(path.join(os, arch))) rmrf(path.join(osDir, arch))
    }
  }
  console.log('  ✓ node_modules/    已裁平台（仅保留 ' + KEEP_ORT.join(', ') + '）')
}
console.log('  ✓ node_modules/    ' + sizeMB(dstNM).toFixed(1) + ' MB')

// ④ 模型（可跳过）
if (WITH_MODELS) {
  const mSrc = path.join(SERVER, 'models')
  if (fs.existsSync(mSrc)) {
    copyDir(mSrc, path.join(OUT, 'models'))
    console.log('  ✓ models/          ' + sizeMB(path.join(OUT, 'models')).toFixed(1) + ' MB')
  } else {
    console.warn('  ! server/models 不存在，跳过')
  }
} else {
  console.log('  -- models/ 已跳过（--no-models）')
}

// ⑤ 台账：把"这份产物是给哪个平台/架构的、带没带模型"写进去，供打包前守卫核对
//    （2026-09-24：用户要把 mac 运行时一起长备好 ⇒ 同一个 dist/ 下会同时存在多平台产物，
//     而 electron-builder 只从 dist/server-runtime 取 ⇒ 必须能机检出"错平台"）
const staging = {
  platform: PLATFORM,
  arch: ARCH,
  withModels: WITH_MODELS,
  keepOrt: KEEP_ORT.join(','),
  builtAt: new Date().toISOString(),
  builtBy: 'tools/build-server-runtime.cjs',
}
fs.writeFileSync(path.join(OUT, 'STAGING.json'), JSON.stringify(staging, null, 2) + '\n', 'utf8')

console.log('== 完成：' + path.relative(ROOT, OUT) + ' = ' + sizeMB(OUT).toFixed(1) + ' MB ==')
console.log('   台账：STAGING.json → ' + PLATFORM + '/' + ARCH + (WITH_MODELS ? ' + models' : ' 无模型'))
console.log('   入口：dist/index.js（electron-builder → resources/server/dist/index.js）')
