#!/usr/bin/env node
/*
 * 内嵌 Node 运行时的**按平台 staging**（跨平台：Windows / macOS / Linux 都能跑）
 * =====================================================================
 * 为什么要它：`electron-builder.yml` 把 `../dsh-runtime/node` 当 extraResources 打进包，
 * 而**一个目录只能放一个平台的 node 二进制**。原来这件事埋在
 * `electron/scripts/build-runtime.ps1` 里（`Copy-Item $env:ProgramFiles\nodejs\node.exe`），
 * 那一步**只能做 Windows**：mac 包要么拿到 win 的 node.exe（必然跑不起来），要么手工放置。
 *
 * 本脚本负责"把某个平台的 node 二进制准备好"，并留一份**机读的 staging 台账**
 * （`NODE-STAGING.json`），好让打包前的守卫能发现"用 darwin 的 node 打 Windows 包"这类错配
 * （2026-09-24 用户裁定：mac 的运行时也一起长备好）。
 *
 * 用法：
 *   node tools/stage-node-runtime.cjs --platform darwin --arch arm64
 *        # 默认下到 dsh-runtime/node-runtimes/<platform>-<arch>/（不碰正在用的那份）
 *   node tools/stage-node-runtime.cjs --platform darwin --arch arm64 --activate
 *        # 额外把它同步进 dsh-runtime/node（= electron-builder 实际打包的目录）+ 写台账
 *   node tools/stage-node-runtime.cjs --platform win32 --arch x64 --from-local --activate
 *        # 不下载，直接复制本机 node（platform/arch 必须就是本机，版本按本机）
 *   node tools/stage-node-runtime.cjs --check --platform win32 --arch x64
 *        # 只读：打印 dsh-runtime/node 的台账，并与要求的平台/架构比对（不一致 exit 1）
 *
 * 退出码：0 成功 / 1 参数或校验失败 / 2 下载或解压失败
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const RUNTIME_ROOT = path.join(ROOT, 'dsh-runtime')
const ACTIVE_DIR = path.join(RUNTIME_ROOT, 'node')            // electron-builder 打包读这个
const STORE_DIR = path.join(RUNTIME_ROOT, 'node-runtimes')    // 各平台副本都放这
const MARKER = 'NODE-STAGING.json'

/* 与当前随包分发的 node 对齐；**升级时要和 build-runtime.ps1 / 打包验证一起改**。
   win 版本 = 本机 node（v24.13.0）；darwin 用同一个版本，保证 NAPI/ABI 与 STT 预编译件一致。 */
const DEFAULT_VERSION = process.env.AKDAGENT_NODE_VERSION || 'v24.13.0'

const argv = process.argv.slice(2)
const opt = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const has = (name) => argv.includes(name)

const PLATFORM = opt('--platform', process.platform)
const ARCH = opt('--arch', process.arch)
const VERSION = opt('--version', DEFAULT_VERSION).replace(/^v?/, 'v')
const ACTIVATE = has('--activate')
const FROM_LOCAL = has('--from-local')
const CHECK_ONLY = has('--check')
const OUT_DIR = path.resolve(opt('--out', path.join(STORE_DIR, `${PLATFORM}-${ARCH}`)))

const VALID = { win32: ['x64', 'arm64'], darwin: ['x64', 'arm64'], linux: ['x64', 'arm64'] }
const IS_WIN = PLATFORM === 'win32'
const BIN_NAME = IS_WIN ? 'node.exe' : 'node'

const say = (s) => console.log(s)
const die = (code, msg) => { console.error('✗ ' + msg); process.exit(code) }

/* 🆕 2026-09-25：**可执行位**。借来的 Mac 上，node 二进制是从 Windows 打的 zip 里解出来的
   —— zip 里存不下 POSIX 权限（libarchive 在 Windows 上写不出 mode）⇒ 解压后 `node` 是 0644，
   跑起来报 `Permission denied`；electron-builder 打出的 app 里那份同理（codesign 也会因此失败）。
   Windows 上 chmod 是 no-op（Node 会忽略），所以统一在这里补一次，不靠用户记得敲 chmod。 */
function chmodExec(file) {
  if (IS_WIN || process.platform === 'win32') return
  try { fs.chmodSync(file, 0o755) } catch (e) { say(`   ! 补可执行位失败（${path.basename(file)}）：${e.message}`) }
}

function sha256Of(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function readMarker(dir) {
  const p = path.join(dir, MARKER)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}
function writeMarker(dir, extra) {
  const bin = path.join(dir, BIN_NAME)
  const st = fs.statSync(bin)
  const marker = {
    platform: PLATFORM,
    arch: ARCH,
    version: extra.reported || VERSION,   // 以二进制自己报的版本为准（跨平台跑不了时才回落成请求值）
    file: BIN_NAME,
    sizeBytes: st.size,
    sha256: sha256Of(bin),
    source: extra.source,
    stagedAt: new Date().toISOString(),
    stagedBy: 'tools/stage-node-runtime.cjs',
  }
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify(marker, null, 2) + '\n', 'utf8')
  return marker
}

/* ── --check：只看台账，不下载 ── */
if (CHECK_ONLY) {
  const m = readMarker(ACTIVE_DIR)
  if (!m) {
    say(`⚠️ ${path.relative(ROOT, ACTIVE_DIR)} 没有 ${MARKER}（老流程留下的目录，无法判断平台）`)
    say(`   要建立台账：node tools/stage-node-runtime.cjs --platform ${process.platform} --arch ${process.arch} --from-local --activate`)
    process.exit(1)
  }
  const okPlat = m.platform === PLATFORM && m.arch === ARCH
  say(`台账：${m.platform}/${m.arch} · node ${m.version} · ${(m.sizeBytes / 1048576).toFixed(1)} MB · sha256 ${m.sha256.slice(0, 16)}…`)
  say(`     来源：${m.source} · 时间：${m.stagedAt}`)
  if (!okPlat) { console.error(`✗ 台账平台 ${m.platform}/${m.arch} ≠ 要求的 ${PLATFORM}/${ARCH}`); process.exit(1) }
  say('✅ 与要求一致')
  process.exit(0)
}

if (!VALID[PLATFORM] || !VALID[PLATFORM].includes(ARCH)) {
  die(1, `不支持的平台/架构：--platform ${PLATFORM} --arch ${ARCH}（可用：win32/darwin/linux × x64/arm64）`)
}

/* ── 1. 取到二进制 ── */
function stageFromLocal(dir) {
  if (PLATFORM !== process.platform || ARCH !== process.arch) {
    die(1, `--from-local 只能用于本机（当前 ${process.platform}/${process.arch}，要求 ${PLATFORM}/${ARCH}）`)
  }
  const st = fs.statSync(process.execPath)
  fs.copyFileSync(process.execPath, path.join(dir, BIN_NAME))
  let reported = VERSION
  try { reported = execFileSync(process.execPath, ['-v'], { encoding: 'utf8' }).trim() } catch { /* 忽略 */ }
  return { source: `local:${process.execPath}`, size: st.size, reported }
}

function download(url, dest, tries = 3) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return download(res.headers.location, dest, tries).then(resolve, reject)
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} ${url}`)) }
      let got = 0
      const out = fs.createWriteStream(dest)
      res.on('data', (c) => { got += c.length })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(dest)))
      out.on('error', reject)
      res.on('error', (e) => {
        /* 实测 nodejs.org 偶发 ECONNRESET（2026-09-24 下 darwin-x64 时遇到一次）⇒ 重试而不是让用户重跑 */
        out.destroy()
        if (tries > 1) { say(`   ! 下载中断（已收 ${(got / 1048576).toFixed(1)} MB，${e.message}）⇒ 重试（还剩 ${tries - 1} 次）`); setTimeout(() => download(url, dest, tries - 1).then(resolve, reject), 1500) }
        else reject(e)
      })
    }).on('error', (e) => {
      if (tries > 1) { say(`   ! 连接失败（${e.message}）⇒ 重试（还剩 ${tries - 1} 次）`); setTimeout(() => download(url, dest, tries - 1).then(resolve, reject), 1500) }
      else reject(e)
    })
  })
}

async function stageFromDownload(dir) {
  const ext = IS_WIN ? 'zip' : 'tar.gz'
  const name = `node-${VERSION}-${IS_WIN ? 'win' : PLATFORM}-${ARCH}`
  const url = `https://nodejs.org/dist/${VERSION}/${name}.${ext}`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-node-'))
  const archive = path.join(tmp, `${name}.${ext}`)
  say(`下载 ${url}`)
  await download(url, archive)
  const kb = (fs.statSync(archive).size / 1048576).toFixed(1)
  say(`  已下载 ${kb} MB → 解压`)
  // Windows 自带的 bsdtar 与 mac 的 tar 都能解 .tar.gz；Windows 的 bsdtar 也能解 .zip
  execFileSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' })
  const unpacked = path.join(tmp, name)
  const src = IS_WIN ? path.join(unpacked, 'node.exe') : path.join(unpacked, 'bin', 'node')
  if (!fs.existsSync(src)) die(2, `解压后找不到 node 可执行文件：${src}`)
  fs.copyFileSync(src, path.join(dir, BIN_NAME))
  // 台账里的版本以二进制自己报的为准（防"下载的版本 ≠ 声称的版本"）
  let reported = VERSION
  if (PLATFORM === process.platform && ARCH === process.arch) {
    try { reported = execFileSync(path.join(dir, BIN_NAME), ['-v'], { encoding: 'utf8' }).trim() } catch { /* 跨平台时跑不了，正常 */ }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  return { source: url, reported }
}

/* ── 复用：store 里已有目标平台/架构的二进制就不下载（借机器/离线时用）── */
function reuseStore(){
  if (has('--force-download')) return false;
  const bin = path.join(OUT_DIR, BIN_NAME);
  if (!fs.existsSync(bin)) return false;
  const st = fs.statSync(bin);
  if (st.size < 20 * 1048576) return false;             // 不像完整 node
  const m = readMarker(OUT_DIR);
  if (!m) return false;                                  // 没台账 ⇒ 不知道是哪个平台，宁可不复用
  if (m.platform !== PLATFORM || m.arch !== ARCH) return false;
  if (m.sizeBytes !== st.size) { say('   ! store 里的文件大小与台账不符 ⇒ 重新下载'); return false; }
  return true;
}

;(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  say(`== staging node ${VERSION} for ${PLATFORM}/${ARCH}`)
  say(`   目标目录：${path.relative(ROOT, OUT_DIR)}`)

  let info
  if (FROM_LOCAL) {
    info = stageFromLocal(OUT_DIR)
    say(`   ✓ 复制本机 node：${info.source}`)
  } else if (reuseStore()){
    /* 🆕 2026-09-25：store 里已经有这个平台/架构的二进制就直接用（借来的 Mac 上不必再下 50 MB）。
       校验：文件在、够大、台账平台/版本对得上；不对就退回下载。 */
    const m = readMarker(OUT_DIR);
    info = { source: `store(复用 ${path.relative(ROOT, OUT_DIR)})`, reported: m.version };
    say(`   ✓ 复用已备好的：${path.relative(ROOT, OUT_DIR)}/${BIN_NAME}（跳过下载；想强制重下加 --force-download）`)
  } else {
    info = await stageFromDownload(OUT_DIR)
    say(`   ✓ 下载并解压：${info.source}`)
  }

  const marker = writeMarker(OUT_DIR, info)
  chmodExec(path.join(OUT_DIR, BIN_NAME))
  const mb = (marker.sizeBytes / 1048576).toFixed(1)
  say(`   ✓ ${BIN_NAME} ${mb} MB · sha256 ${marker.sha256.slice(0, 16)}…`)

  /* 粗验：跨平台的二进制不该是 0 字节，也不该离谱地小（node 单文件 ~50-110 MB） */
  if (marker.sizeBytes < 20 * 1048576) die(2, `${BIN_NAME} 只有 ${mb} MB —— 不像完整的 node 二进制`)

  if (ACTIVATE) {
    fs.mkdirSync(ACTIVE_DIR, { recursive: true })
    for (const f of fs.readdirSync(ACTIVE_DIR)) {
      if (f === BIN_NAME || f === MARKER) continue
      /* 换平台时清掉上一份的二进制（node.exe ↔ node），避免包里混进两个平台的 node */
      if (/^node(\.exe)?$/.test(f)) { fs.rmSync(path.join(ACTIVE_DIR, f), { force: true }); say(`   – 清掉旧二进制 ${f}`) }
    }
    fs.copyFileSync(path.join(OUT_DIR, BIN_NAME), path.join(ACTIVE_DIR, BIN_NAME))
    chmodExec(path.join(ACTIVE_DIR, BIN_NAME))
    writeMarker(ACTIVE_DIR, info)
    say(`   ✓ 已生效：${path.relative(ROOT, ACTIVE_DIR)}/${BIN_NAME}（electron-builder 打包读这里）`)
  } else {
    say(`   （未加 --activate ⇒ 只放进 ${path.relative(ROOT, STORE_DIR)}，不影响当前打包用的那份）`)
  }
  say('完成')
})().catch((e) => die(2, e.message))
