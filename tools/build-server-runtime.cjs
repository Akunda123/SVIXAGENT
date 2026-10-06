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
/**
 * 目标平台/架构（🆕 2026-09-21：原先**写死 win32/x64** ⇒ 想支持 macOS 必须参数化）。
 * 默认 = 当前机器（在 Windows 上跑就还是 win32/x64，**行为与从前完全一致**）。
 */
const PLATFORM = opt('--platform', process.platform)
const ARCH = opt('--arch', process.arch)
/**
 * `--out <dir>`：组装到别处。⚠️ **默认值随目标平台变**（2026-10-06 修）：
 *   · 目标 = 本机 ⇒ `dist/server-runtime`（electron-builder 打包读的固定路径）
 *   · 目标 ≠ 本机 ⇒ `dist/server-runtime-<platform>-<arch>`
 * 起因：`--platform darwin --arch x64` **不带 `--out`** 时原先写死默认路径 ⇒ 静默把本机那份 **win32 runtime
 * **覆盖掉**（`check-package-assets` 报「台账 = darwin/x64，与本机 win32 不一致」）。跨平台产物**不许**落在打包路径上。
 */
const OUT_EXPLICIT = process.argv.includes('--out')
const DEFAULT_OUT = (PLATFORM === process.platform && ARCH === process.arch)
  ? path.join(ROOT, 'dist', 'server-runtime')
  : path.join(ROOT, 'dist', `server-runtime-${PLATFORM}-${ARCH}`)
const OUT = path.resolve(opt('--out', DEFAULT_OUT))
const VALID = { win32: ['x64', 'arm64'], darwin: ['x64', 'arm64'], linux: ['x64', 'arm64'] }
if (!VALID[PLATFORM] || !VALID[PLATFORM].includes(ARCH)) {
  console.error(`✗ 不支持的平台/架构组合：--platform ${PLATFORM} --arch ${ARCH}（可用：win32/darwin/linux × x64/arm64）`)
  process.exit(2)
}
/* 跨平台组装**显式**写进打包路径 ⇒ 大声警告（十有八九是忘了 `--out`，那会覆盖本机那份） */
if (OUT_EXPLICIT && PLATFORM !== process.platform &&
    path.resolve(OUT) === path.resolve(ROOT, 'dist', 'server-runtime')) {
  console.warn(`  ⚠️ 你把**跨平台**（${PLATFORM}/${ARCH}）产物写进了 electron-builder 的默认路径 dist/server-runtime` +
    ` —— 这会**覆盖本机**那份；确认是有意的再继续（否则用 --out dist/server-runtime-${PLATFORM}-${ARCH}）`)
}
if (!OUT_EXPLICIT && PLATFORM !== process.platform) {
  console.log(`  ℹ️ 跨平台组装：未给 --out ⇒ 输出到 ${path.relative(ROOT, OUT)}（本机那份 dist/server-runtime 不动）`)
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

// ①' 识谱引擎（vendor/dolce-omr）——**必须进包**，否则 `sv_omr_image` 在用户机上找不到引擎
//     驱动按两条布局找它：打包版 = `<runtime>/dolce-omr`（这里拷的位置），开发树 = `<repo>/vendor/dolce-omr`。
const dolceSrc = path.join(ROOT, 'vendor', 'dolce-omr')
if (fs.existsSync(path.join(dolceSrc, 'dist-cli', 'index.js'))) {
  /* ⚠️⚠️ 2026-10-06 真事故：`vendor/dolce-omr/node_modules` 是**开发树里的一条 junction**
   * （指向 `server/node_modules`，只为让简谱那路在开发树解析得到 `onnxruntime-node`）。
   * `copyDir` 会**跟着它去拷** ⇒ 三次构建全部 `EPERM: copyfile` 崩在这里，
   * 而 runtimes 变成**半拷贝的残缺状态**（打包守卫随即报"退役 JS 桥/STT/跨平台 staging"）。
   * ⇒ 拷 vendor 时**排除 `node_modules` 与一切符号链接/junction**：运行时自带 `<runtime>/node_modules`，
   *   根本不需要这份 junction。 */
  const skipVendorJunk = (s, e) => !(e && typeof e.isSymbolicLink === 'function' && e.isSymbolicLink()) && path.basename(s) !== 'node_modules'
  copyDir(dolceSrc, path.join(OUT, 'dolce-omr'), skipVendorJunk)
  if (fs.existsSync(path.join(OUT, 'dolce-omr', 'node_modules'))) {
    rmrf(path.join(OUT, 'dolce-omr', 'node_modules'))
    console.log('  ! 已清掉误拷进 runtimes 的 dolce-omr/node_modules（junction 的产物）')
  }
  console.log('  ✓ dolce-omr/（识谱引擎）' + sizeMB(path.join(OUT, 'dolce-omr')).toFixed(1) + ' MB')
} else {
  console.error('  ✗ vendor/dolce-omr 不存在（或缺 dist-cli/index.js）—— 打出来的包**没有识谱能力**（见 vendor/dolce-omr/SOURCE.md）')
}

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

/* ③''' sharp 的**原生件**也按平台裁（2026-10-06 真事故：darwin 的两个 runtime 里混进了
 * `@img/sharp-win32-x64` 的 libvips dll / .node —— `npm i --cpu=wasm32 sharp` 仍会把宿主平台的原生件拉下来）。
 * 保留：目标平台的 `sharp-<platform>-<arch>` + 跨平台的 `sharp-wasm32*`（我们实际用的是 wasm 那份）。 */
{
  const imgRoot = path.join(dstNM, '@img')
  if (fs.existsSync(imgRoot)) {
    const want = `sharp-${PLATFORM}-${ARCH}`
    for (const e of fs.readdirSync(imgRoot)) {
      if (e === want || e.includes('wasm32')) continue
      if (/^sharp-(win32|darwin|linux)/.test(e)) {
        rmrf(path.join(imgRoot, e))
        console.log(`  ✓ @img/${e} 已按平台删除（目标 ${PLATFORM}/${ARCH}）`)
      }
    }
  }
}

/* ③'' 裁识谱依赖（2026-10-05）：`pdfjs-dist` / `pdf-lib` 装上共 52 MB，而 Node 真正会加载的只是一小部分
 *   （实测：pdfjs-dist 33.3 MB = legacy 15.7 + build 11.9 + wasm 1.5 + web 1.3 + cmaps 1.1 + standard_fonts 0.8
 *     + image_decoders 0.6 + types 0.4；pdf-lib 18.6 MB = dist 13.5 + cjs 1.8 + es 1.7 + ts3.4 0.7 + src 0.7）。
 *   ⚠️ 保留集是**保守**的：`cmaps/`（CJK 文本）与 `standard_fonts/`、`wasm/`（内嵌图解码）都留着 ——
 *      它们各只有 1 MB 上下，删错了会在某些 PDF 上**静默**出问题，不值得省。
 *   ⚠️ 改这里之后**必须**跑一次 `tools/check-omr-runtime.cjs`（用打包布局真跑一张谱子图），
 *      只测"文件在不在"证明不了 Node 还能解析出 `legacy/build/pdf.mjs`。 */
const PRUNE_KEEP = {
  'pdfjs-dist': ['legacy', 'wasm', 'standard_fonts', 'iccs', 'cmaps'],
  'pdf-lib': ['cjs', 'es'],
}
for (const [dep, keep] of Object.entries(PRUNE_KEEP)) {
  const d = path.join(dstNM, dep)
  if (!fs.existsSync(d)) continue
  const before = sizeMB(d)
  for (const e of fs.readdirSync(d)) {
    if (keep.includes(e)) continue
    if (/^(package\.json|LICENSE|README)/i.test(e)) continue
    rmrf(path.join(d, e))
  }
  console.log(`  ✓ ${dep} 已裁 ${before.toFixed(1)} → ${sizeMB(d).toFixed(1)} MB（保留 ${keep.join(' / ')}）`)
}

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
  /* ⚠️ 2026-10-05 修：Windows 上**不能**无 shell 地 spawn `npm.cmd` —— Node ≥ 20.12（本机 24.13）
   *   拒绝执行 `.cmd`/`.bat`（CVE-2024-27980 加固）⇒ 直接 `EINVAL`、`status === null`；
   *   而老代码把这个失败**误报成"该版本对目标平台可能没有二进制"** ⇒ 排查方向全错（实际一个字节都没下载）。
   *   修法取**不走 shell** 的那条：直接 `node <npm>/bin/npm-cli.js …`（官方安装器的布局），
   *   `shell:true` 只是兜底 —— 它会触发 DEP0190（args 与 shell 同用不安全），能不用就不用。 */
  if (!/^[0-9A-Za-z.\-]+$/.test(ONNX_VER)) {
    console.error(`✗ --onnx-version 只接受版本号字符（收到 ${JSON.stringify(ONNX_VER)}）`)
    process.exit(2)
  }
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const useNodeNpm = fs.existsSync(npmCli)
  const bin = useNodeNpm ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  const argv = useNodeNpm ? [npmCli, ...args] : args
  const r = spawnSync(bin, argv,
    { cwd: tmp, stdio: 'inherit', shell: !useNodeNpm && process.platform === 'win32' })
  const src = path.join(tmp, 'node_modules', 'onnxruntime-node')
  if (r.status !== 0 || !fs.existsSync(src)) {
    const why = r.error ? `spawn 失败：${r.error.message}` : `exit=${r.status}`
    console.error(`✗ onnxruntime-node@${ONNX_VER} 装失败（${why}）`)
    console.error('   若 spawn 报 EINVAL/ENOENT ⇒ 是调用方式问题（npm 是否在 PATH、是否要给 shell:true）；')
    console.error(`   若装成功但目录里没有 ${PLATFORM}/${ARCH} 的二进制 ⇒ 才是"该版本没这个平台的包"，换版本再试。`)
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
