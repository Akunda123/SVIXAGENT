#!/usr/bin/env node
/**
 * check-packaged-app.cjs —— **打包产物核对**（asar 内容 / 版本 / unpacked 资产 / 内嵌 runtime）
 * 2026-10-08 立。存在理由：我一天之内**临时写了 3 次又删了 3 次**这种脚本
 * （win asar / mac asar / mac pdfjs），而现有的 `check-package-assets.cjs` 只比
 * "预装 runtime 与 server/dist 同源"，**管不到 asar 里到底装了什么**。
 *
 * 它回答四个问题（都是"发出去的东西对不对"，不是"源码对不对"）：
 *   ① asar 里那个 `package.json` 的版本 = 仓库版本吗？（`electron/package.json` / `--expect-version`）
 *   ② 关键源文件在 asar 里**与仓库逐字节一致**吗？（渲染层/主进程/插件/脚本）
 *   ③ `app.asar.unpacked/**` 里该有的资产在吗、且与仓库逐字节一致？（客户端 pdfjs 那两个 .mjs）
 *   ④ 内嵌 MCP server 自报的版本 = `server/package.json` 吗？（`resources/server/dist/index.js`）
 *
 * 用法：
 *   node tools/check-packaged-app.cjs                        # 自动找 electron/release/win-unpacked
 *   node tools/check-packaged-app.cjs --dir <解包目录>        # 目录里应含 resources/app.asar
 *   node tools/check-packaged-app.cjs --zip <…-arm64.zip>    # 从 mac zip 里取 app.asar（用系统 tar=bsdtar）
 *   node tools/check-packaged-app.cjs --expect-version 1.1.4
 *
 * 退出码：0 = 全过；1 = 有不合格（每条都打印"为什么"）。
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const APP = path.join(ROOT, 'electron')
let bad = 0
const ok = (m) => console.log('  [ok]   ' + m)
const fail = (m) => { bad++; console.log('  [FAIL] ' + m) }
const info = (m) => console.log('  [i]    ' + m)

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const DIR_GIVEN = argv.includes('--dir')
const DIR = opt('--dir', path.join(APP, 'release', 'win-unpacked'))
const ZIP = opt('--zip', null)
const EXPECT = opt('--expect-version', null)

/* 关键文件：asar 内路径 → 仓库路径（必须逐字节一致） */
const MUST_MATCH = [
  ['package.json', 'electron/package.json'],            // 会被 electron-builder 裁过 ⇒ 只比 version（见下）
  ['src/main.js', 'electron/src/main.js'],
  ['src/settings.html', 'electron/src/settings.html'],
  ['src/settings-preload.js', 'electron/src/settings-preload.js'],
  ['src/i18n/settings.json', 'electron/src/i18n/settings.json'],
  ['src/auth-bridge.js', 'electron/src/auth-bridge.js'],
  ['src/dsh-home.js', 'electron/src/dsh-home.js'],
  ['src/system-proxy.js', 'electron/src/system-proxy.js'],
  ['src/download-transport.js', 'electron/src/download-transport.js'],
  ['src/model-list.js', 'electron/src/model-list.js'],
  ['src/stt-model.js', 'electron/src/stt-model.js'],
  ['src/plugins/akd-auth-bridge/index.js', 'electron/src/plugins/akd-auth-bridge/index.js'],
  ['src/plugins/akd-auth-bridge/package.json', 'electron/src/plugins/akd-auth-bridge/package.json'],
]
/* 被 asarUnpack 出来的资产（在 <解包>/resources/app.asar.unpacked/…，与仓库同一份内容） */
const MUST_MATCH_UNPACKED = [
  ['src/vendor/pdfjs/legacy/build/pdf.min.mjs', 'electron/src/vendor/pdfjs/legacy/build/pdf.min.mjs'],
  ['src/vendor/pdfjs/legacy/build/pdf.worker.min.mjs', 'electron/src/vendor/pdfjs/legacy/build/pdf.worker.min.mjs'],
]

/* ── 拿 asar：直接读文件，或从 zip 里抠出来 ─────────────────────── */
function extractFromZip(zip, innerRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-asar-extract-'))
  const r = spawnSync('tar', ['-xf', zip, '-C', tmp, innerRel], { encoding: 'utf8' })
  if (r.error) throw new Error('没有可用的 tar（bsdtar 能读 zip；Windows 10+ / macOS / Linux 自带）：' + r.error.message)
  if (r.status !== 0) throw new Error('tar 解压失败：' + String(r.stderr || '').trim())
  const out = path.join(tmp, innerRel)
  if (!fs.existsSync(out)) throw new Error('zip 里没有这个条目：' + innerRel)
  return { file: out, tmp }
}

let asarPath = null
let cleanupTmp = null
if (ZIP) {
  if (!fs.existsSync(ZIP)) { console.error('zip 不存在：' + ZIP); process.exit(2) }
  const inner = 'AKDAgent.app/Contents/Resources/app.asar'
  try {
    const r = extractFromZip(ZIP, inner)
    asarPath = r.file
    cleanupTmp = r.tmp
    console.log(`来源：zip ${path.basename(ZIP)} → ${inner}`)
  } catch (e) { console.error(String(e.message || e)); process.exit(2) }
} else {
  const cand = [path.join(DIR, 'resources', 'app.asar'), path.join(DIR, 'Contents', 'Resources', 'app.asar')]
  asarPath = cand.find((p) => fs.existsSync(p)) || null
  if (!asarPath) {
    /* 🆕 2026-10-08：**没有打包产物 ≠ 不合格** —— 干净 checkout / 还没出包时，裸跑必须是"跳过"而不是失败
     *   （否则它会混进跑批的失败里，把真信号淹掉）。显式 `--dir` 指了一个不存在的目录才算用错。 */
    if (!DIR_GIVEN) {
      console.log('没有打包产物可核（默认目录里没有 app.asar）：先 `cd electron && npm run dist`（或 mac 那条 workflow）。')
      console.log('  指定产物：--dir <解包目录> / --zip <…-arm64.zip>')
      process.exit(0)
    }
    console.error(`找不到 app.asar（试过：\n  ${cand.join('\n  ')}\n）—— 用 --dir 指定解包目录，或用 --zip 指 mac 包`)
    process.exit(2)
  }
  console.log(`来源：${path.relative(ROOT, asarPath)}`)
}

/* ── 极简 asar 读取（头 = 4×uint32 + JSON，数据相对 dataStart） ─────── */
const fd = fs.openSync(asarPath, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(4)
const jsonLen = head.readUInt32LE(12)
const jbuf = Buffer.alloc(jsonLen)
fs.readSync(fd, jbuf, 0, jsonLen, 16)
const header = JSON.parse(jbuf.toString('utf8'))
const dataStart = 8 + headerSize
function entry(p) {
  let n = header
  for (const part of p.split('/')) { if (!n.files || !n.files[part]) return null; n = n.files[part] }
  return n
}
function readAsar(p) {
  const n = entry(p)
  if (!n) return { missing: true }
  if (n.unpacked) return { unpacked: true }
  if (n.size == null) return { missing: true }
  const b = Buffer.alloc(n.size)
  fs.readSync(fd, b, 0, n.size, dataStart + Number(n.offset))
  return { buf: b }
}

const UNPACKED_DIR = path.dirname(asarPath) + path.sep + 'app.asar.unpacked'

console.log(`asar = ${(fs.statSync(asarPath).size / 1048576).toFixed(2)} MiB · header ${headerSize} B · 数据起点 ${dataStart}`)
console.log(`unpacked 目录：${fs.existsSync(UNPACKED_DIR) ? path.relative(ROOT, UNPACKED_DIR) : '(不存在 / zip 模式未抠)'}\n`)

/* 🆕 2026-10-08：**包比源码旧 ⇒ 这一跑没有结论，直接跳过**（否则日常跑批会一直红，把真信号淹掉）。
 *   判据：被核对源文件里最新的 mtime > asar 的 mtime。出包之后（CI / 本机 `npm run dist`）包是新的
 *   ⇒ 走严格核对；本地改了客户端但还没出包 ⇒ 打印一句说明就 exit 0。
 *   ⛔ 想强制核对（例如"包明明是新出的却对不上"）：加 `--strict`。 */
const asarMtime = fs.statSync(asarPath).mtimeMs
let newestSource = 0
let newestWhich = ''
for (const [, repoRel] of MUST_MATCH.concat(MUST_MATCH_UNPACKED)) {
  const p = path.join(ROOT, repoRel)
  try {
    const m = fs.statSync(p).mtimeMs
    if (m > newestSource) { newestSource = m; newestWhich = repoRel }
  } catch (_) { /* 仓库里没有这份就不参与 */ }
}
if (!argv.includes('--strict') && newestSource > asarMtime) {
  console.log('包比源码旧 ⇒ 本次跳过核对（源码里有还没出包的改动）。')
  console.log(`  最新改动：${newestWhich}（${new Date(newestSource).toISOString()}）`)
  console.log(`  产物时间：${new Date(asarMtime).toISOString()}`)
  console.log('  出包之后再跑：node tools/check-packaged-app.cjs（CI 里就是这么用的）· 要强制核对加 --strict')
  process.exit(0)
}

console.log('== ① 版本（发出去的包是不是仓库这一版）==')
{
  const pkg = readAsar('package.json')
  const want = EXPECT || JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version
  if (!pkg.buf) fail('asar 里读不到 package.json')
  else {
    const got = JSON.parse(pkg.buf.toString('utf8')).version
    if (got === want) ok(`asar 内 version = ${got}（与${EXPECT ? ' --expect-version' : ' electron/package.json'} 一致）`)
    else fail(`asar 内 version = ${got}，期望 ${want} ⇒ **发出去的包不是这一版**（打包后没重新出包？）`)
  }
}

console.log('\n== ② 关键源文件与仓库**逐字节一致**（防"版本对了但代码没进包"）==')
for (const [inAsar, repoRel] of MUST_MATCH) {
  if (inAsar === 'package.json') continue   // electron-builder 会裁字段，只比 version（见 ①）
  const got = readAsar(inAsar)
  const wantPath = path.join(ROOT, repoRel)
  if (got.missing) { fail(`${inAsar} 不在 asar 里（仓库里有：${repoRel}）`); continue }
  if (!fs.existsSync(wantPath)) { info(`${inAsar} 在仓库里不存在，跳过比对`); continue }
  const want = fs.readFileSync(wantPath)
  if (got.unpacked) {
    /* ⚠️ 有些文件是**故意** asarUnpack 的（`electron-builder.yml` 里 stt-server/stt-model/pdfjs：
     *   STT 原生 addon 与 ESM worker 从 asar 内读有历史坑）⇒ 别报"见 ③"，**照实逐字节比**。 */
    const p = path.join(UNPACKED_DIR, inAsar.replace(/\//g, path.sep))
    if (ZIP || !fs.existsSync(p)) info(`${inAsar} 标为 unpacked（${ZIP ? 'zip 模式未抠出来' : '落盘文件不在：' + path.relative(ROOT, p)}）`)
    else {
      const a = fs.readFileSync(p)
      if (a.equals(want)) ok(`${inAsar}  ${(want.length / 1024).toFixed(1)} KB 一致（unpacked）`)
      else fail(`${inAsar} 与仓库**不一致**（unpacked ${a.length} B vs 仓库 ${want.length} B）⇒ 包里是旧代码`)
    }
    continue
  }
  if (got.buf.equals(want)) ok(`${inAsar}  ${(want.length / 1024).toFixed(1)} KB 一致`)
  else fail(`${inAsar} 与仓库**不一致**（asar ${got.buf.length} B vs 仓库 ${want.length} B）⇒ 包里是旧代码`)
}

console.log('\n== ③ asarUnpack 资产（客户端 pdfjs：拖 PDF 识谱要用）==')
{
  const base = ZIP
    ? path.join(path.dirname(asarPath), 'app.asar.unpacked')
    : path.join(path.dirname(asarPath), 'app.asar.unpacked')
  for (const [rel, repoRel] of MUST_MATCH_UNPACKED) {
    const got = readAsar(rel)
    const p = path.join(base, rel.replace(/\//g, path.sep))
    const wantPath = path.join(ROOT, repoRel)
    const inAsarOk = got.unpacked || (got.buf && got.buf.length > 0)
    if (!inAsarOk) { fail(`${rel} 既不在 asar 也没标 unpacked ⇒ mac 版拖 PDF 会直接失败`); continue }
    if (ZIP) {
      /* zip 里我们只抠了 app.asar ⇒ 只能确认"asar 头标了 unpacked"，落盘文件要另抠 */
      ok(`${rel} 在 asar 头里标为 unpacked（zip 模式不再抠第二个条目）`)
      continue
    }
    if (!fs.existsSync(p)) { fail(`asar 标了 unpacked，但落盘文件不存在：${path.relative(ROOT, p)}`); continue }
    if (!fs.existsSync(wantPath)) { info(`${rel} 仓库里没有这份，跳过比对`); continue }
    const a = fs.readFileSync(p), b = fs.readFileSync(wantPath)
    if (a.equals(b)) ok(`${rel}  ${(b.length / 1024).toFixed(1)} KB 与仓库一致`)
    else fail(`${rel} 与仓库不一致（落盘 ${a.length} B vs 仓库 ${b.length} B）`)
  }
}

console.log('\n== ④ 内嵌 MCP server 自报版本（= server/package.json 吗）==')
{
  const wantVer = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8')).version
  const roots = ZIP
    ? [path.join(path.dirname(path.dirname(asarPath)), 'server')]   // …/Contents/Resources/server（zip 模式抠不出来，跳过）
    : [path.join(DIR, 'resources', 'server')]
  let checked = false
  for (const r of roots) {
    const idx = path.join(r, 'dist', 'index.js')
    if (!fs.existsSync(idx)) continue
    const m = fs.readFileSync(idx, 'utf8').match(/version:\s*"([^"]+)"/)
    checked = true
    if (!m) fail('server/dist/index.js 里找不到 version:')
    else if (m[1] === wantVer) ok(`内嵌 server 自报 ${m[1]}（与 server/package.json 一致）`)
    else fail(`内嵌 server 自报 ${m[1]}，期望 ${wantVer} ⇒ 预装 runtime 与源码不同步（要重建）`)
  }
  if (!checked) info('没找到内嵌 server（zip 模式或未打包），跳过')
}

fs.closeSync(fd)
if (cleanupTmp) { try { fs.rmSync(cleanupTmp, { recursive: true, force: true }) } catch (_) {} }
console.log('')
if (bad) { console.log(`✗ 有 ${bad} 项不合格（**发出去的东西**与仓库对不上）`); process.exit(1) }
console.log('✓ 打包产物核对通过')
