/**
 * AKDAgent Electron 主进程 — 全内嵌模式（悬浮球形态）
 *
 * 职责：
 *   1. 悬浮球（orb）：64x64 无边框透明置顶小圆球，可拖动；点击展开/收起聊天窗
 *   2. 聊天窗（chat）：加载内嵌 DSH web 前端（独立端口 3180+），✕ 隐藏到球
 *   3. 内嵌 host：node <dshRoot>/node_modules/@deepseek-ai/dsh/lib/bin.js web --port <port> --no-open
 *      （0.1.5-rc.2 的 npm 树布局；旧源码树 `apps/cli/{src,lib}/bin.js` 仍兼容）
 *      数据根隔离在 ~/.dsh-akdagent（只抄凭据/设置；profile 由运行时按随包模板生成）
 *      新版 web 面要会话：抓 stdout 的 `dsh web: …?token=…` 换 cookie，/api/* 与 mux 都带 Cookie
 *   4. 托盘：显示/隐藏聊天、退出；退出时 taskkill /T 清掉 host 进程树
 *
 * 注意：AKDAgentBridge.lua 可在设置「SV 集成」页一键部署到各 SV scripts 目录。
 */
'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, shell, dialog, Notification } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const crypto = require('node:crypto')
const net = require('node:net')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const yaml = require('js-yaml')
const WebSocket = require('ws')
const sttModel = require('./stt-model.js')
const { createPanelBridge } = require('./panel-bridge.js')
const { querySvProjectName, querySvHostType, startProjectEventWatch, probeBridge, probeBridgeHeartbeat } = require('./sv-bridge-client.js')
const { HOSTS, pickActiveHost, orderCandidates, typeOf: hostTypeOf } = require('./host-pick.js')
const { ensureHome } = require('./dsh-home.js')
const util = require('node:util')

/* ── 日志安全网（2026-09-19 修「打包版静默退出」）──────────────────────
 * 事故：打包版是 GUI 子系统进程，**没有可写的 stdout/stderr**，任何 `console.log`
 *   都会抛 `Error: EPIPE: broken pipe, write`（栈：Socket._write ← console.value ←
 *   console.log ← spawnHost）。该异常从 `app.whenReady()` 回调里冒出来 ⇒
 *   **spawnHost 之后的代码全都不执行**（host 起不来、窗口不建）⇒ 进程静默退出：
 *   用户看不到任何提示，也没有日志可查（开发态有终端所以完全正常）。
 * 对策：
 *   ① 所有 `console.*` 改走**自己的写盘**（userData/akdagent.log；写盘永不上抛）；
 *   ② 仍尽力往 stdout 写一次（开发态终端照旧可见），失败就吞掉；
 *   ③ 未捕获异常 / 未处理 rejection **只记日志、不弹框**（弹框会冻住启动流程）；
 *   ④ stdout/stderr 的 'error' 事件也兜住（EPIPE 常以 error 事件形式出现）。
 * 日志：`%APPDATA%\<app>\akdagent.log`，超过 2MB 轮转为 `akdagent.log.1`。
 */
const SAFE_LOG_MAX_BYTES = 2 * 1024 * 1024
let safeLogPath = null
let safeLogBroken = false

;(function installSafeLogging() {
  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    safeLogPath = path.join(dir, 'akdagent.log')
    try {
      if (fs.statSync(safeLogPath).size > SAFE_LOG_MAX_BYTES) fs.renameSync(safeLogPath, safeLogPath + '.1')
    } catch { /* 没这个文件就当没有 */ }
  } catch {
    try { safeLogPath = path.join(process.env.TEMP || '.', 'akdagent-electron.log') } catch { safeLogPath = null }
  }

  const native = {
    log: console.log.bind(console), info: console.info.bind(console), warn: console.warn.bind(console),
    error: console.error.bind(console), debug: console.debug.bind(console),
  }
  const LEVELS = { log: 'INFO', info: 'INFO', warn: 'WARN', error: 'ERROR', debug: 'DEBUG' }

  const emit = (level, args) => {
    let line
    try { line = util.format(...args) }
    catch { line = args.map((a) => { try { return String(a) } catch { return '?' } }).join(' ') }
    if (safeLogPath && !safeLogBroken) {
      try { fs.appendFileSync(safeLogPath, `${new Date().toISOString()} ${level} ${line}\n`, 'utf8') }
      catch { safeLogBroken = true }   // 磁盘满/权限不足：放弃写盘，别让日志本身变成崩溃源
    }
    // 打包版没有 stdout ⇒ 这一步必然 EPIPE，吞掉即可（事件型错误见下面的 'error' 兜底）
    try { (level === 'ERROR' ? native.error : native.log)(line) } catch { /* EPIPE：忽略 */ }
  }

  for (const name of Object.keys(native)) console[name] = (...args) => emit(LEVELS[name], args)
  for (const s of [process.stdout, process.stderr]) { try { s.on('error', () => {}) } catch { /* 忽略 */ } }

  process.on('uncaughtException', (err) =>
    emit('ERROR', ['[akdagent] uncaughtException: ' + ((err && err.stack) || String(err))]))
  process.on('unhandledRejection', (reason) =>
    emit('ERROR', ['[akdagent] unhandledRejection: ' + ((reason && reason.stack) || String(reason))]))
})()

// ── 深色原生窗口外观（2026-09-19 用户要求：设置 / 密钥窗的白色标题栏要跟应用同风格）──
//   ① **标题栏**：`nativeTheme.themeSource = 'dark'` ⇒ Windows 原生标题栏（应用名 + 最小化/关闭）走**深色**；
//   ② **底色**：各窗口 `backgroundColor` 设成设置页的 `--bg`（#2e2e2e），避免加载瞬间**白闪**。
//   ⚠️ 若以后要"完全自定义标题栏颜色"（非系统深灰），改用 `titleBarStyle:'hidden'` + `titleBarOverlay`
//      —— 那需要页面自带可拖拽区（`-webkit-app-region: drag`），改动更大，先按低风险方案。
nativeTheme.themeSource = 'dark'
// Windows 系统通知（宿主升级提示）需要 AppUserModelID，否则 toast 可能不显示或显示成 "electron"
if (process.platform === 'win32') app.setAppUserModelId('com.akdagent.client')

/* ── 单实例锁（2026-09-17 事故后加）──────────────────────────────────
 * 为什么必须有：两个客户端共用同一个 `DSH_HOME`（~/.dsh-akdagent）与同一张段表 ⇒
 *   **同一个会话 id**；两个内嵌 host 各自从相同的 seq 基线往后追加 ⇒ 会话日志里同一段
 *   seq 被写两遍、提交区出现回退 ⇒ DSH 读日志时报
 *   `corrupt session log: seq gap in committed region at line N (expected X, got Y)`
 *   ⇒ 会话再也 resume 不了（实测事故：2026-09-17，两个实例同时开着，`akdagent-orb-temp-g1` 写坏）。
 * 拿不到锁的第二个进程**立刻退出**，绝不参与写。
 */
const hasSingleLock = app.requestSingleInstanceLock()
if (!hasSingleLock) {
  console.log('[akdagent] 已有实例在运行 ⇒ 本进程直接退出（防止两个 host 写坏同一个会话）')
  app.quit()
} else {
  app.on('second-instance', () => {
    // 用户又双击了一次：把已有实例的悬浮球显示出来（而不是开第二个）
    try { showOrbFromTray() } catch { /* 窗口还没建好就算了 */ }
  })
}

// 客户端界面语言（**与 DSH 的 locale.preference 相互独立**），见 src/i18n/README.md
const i18n = require('./i18n')

const isPackaged = app.isPackaged

/* 用户主目录。**绝不写死 `C:/Users/<name>`** —— 那是机器绑定，而且本文件是**随安装包分发**
 * 的 app 代码（进 asar、不走脱敏）⇒ 真实用户名会直接进发布包。2026-09-19 事故后改正，
 * 守卫见 `tools/check-abs-paths.cjs`。Windows 上 `USERPROFILE` 正常都有，`os.homedir()` 兜底。
 * 2026-09-25：把 `USERPROFILE` 限定在 win32 —— mac 上它**通常不存在**（靠兜底才对），
 * 但万一被外部环境变量注入了就会指向一个不存在的地方，那才是真麻烦。 */
const HOME_DIR = (process.platform === 'win32' ? process.env.USERPROFILE : null) || os.homedir()

// ── DSH 设置读写（~/.dsh/settings.yaml） ───────────────────────────
const SETTINGS_PATH = path.join(HOME_DIR, '.dsh', 'settings.yaml')
// 聊天「段表」：记录每个会话段的工程归属（显示全量 + 模型只喂当前段），见 docs/聊天记录归属设计.md
const orbSegments = require('./orb-segments.js')
const ORB_SEGMENTS_PATH = path.join(app.getPath('userData'), 'orb-segments.json')
orbSegments.init(ORB_SEGMENTS_PATH)

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {}
    return yaml.load(fs.readFileSync(SETTINGS_PATH, 'utf8')) || {}
  } catch (e) {
    console.error('[akdagent] read settings failed:', e.message)
    return {}
  }
}

function writeSettings(obj) {
  const dir = path.dirname(SETTINGS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // 保持紧凑但可读的 YAML（2 空格缩进）
  const out = yaml.dump(obj, { indent: 2, lineWidth: -1 })
  fs.writeFileSync(SETTINGS_PATH, out, 'utf8')
  mirrorDshFileToIsolatedHome('settings.yaml', out)
}

/** 合并局部设置到 settings.yaml（只动给定路径，保留其他键） */
function patchSettings(patch) {
  const cur = readSettings()
  const next = { ...cur, ...patch }
  writeSettings(next)
  return readSettings()
}

// ── 路径解析 ────────────────────────────────────────────────────────
/* 内嵌 host 的 DSH 根。**开发态不许写死绝对路径** —— 2026-09-19 事故：这里写死了**项目外**的
 * `Downloads/deepseek-harness-master/...`，用户删掉那个 checkout 后 ⇒ 入口不存在 + cwd 不存在
 * ⇒ `spawn … ENOENT`，还要白等满 90s 才弹一句「did not become ready in time」，**真因被埋**。
 * 现改为**按候选验证**：取第一个真有宿主入口的（打包态仍固定用包内 `resources/dsh`）。
 *
 * 两代布局都要认（2026-09-21 升级 0.1.5-rc.2）：
 *   · npm 树（**新，0.1.5-rc.2 起**）`node_modules/@deepseek-ai/dsh/lib/bin.js`
 *     —— 发行版就是 `npm i @deepseek-ai/dsh` 的 prefix；无符号链接、无 esbuild 依赖。
 *   · 源码 checkout（旧，0.1.0-rc.5）`apps/cli/{src,lib}/bin.js`
 *     —— 只作开发态兜底，仓库里那份 527 MB 源码树已被 npm 树取代。 */
const CLI_ENTRY_NPM = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
const CLI_ENTRY_SRC = 'apps/cli/src/bin.ts'
const CLI_ENTRY_LIB = 'apps/cli/lib/bin.js'

function resolveDshRoot() {
  if (isPackaged) return path.join(process.resourcesPath, 'dsh')
  // 显式指定一律尊重（坏了也指到它，便于定位；不静默回落，免得"设了却没生效"更难查）
  if (process.env.AKDAGENT_DSH_ROOT) return process.env.AKDAGENT_DSH_ROOT
  const candidates = [
    // 仓内随包运行时（由 electron/scripts/build-runtime.ps1 维护，与打包态同源）
    path.join(__dirname, '..', '..', 'dsh-runtime', 'dsh'),
  ]
  const hasEntry = (r) =>
    fs.existsSync(path.join(r, CLI_ENTRY_NPM)) ||
    fs.existsSync(path.join(r, CLI_ENTRY_SRC)) ||
    fs.existsSync(path.join(r, CLI_ENTRY_LIB))
  return candidates.find(hasEntry) || candidates[0]
}

/** 宿主入口 + 是否走 tsx 源码路线（两代布局统一在这里判定） */
function hostEntryFor(dshRoot) {
  if (fs.existsSync(path.join(dshRoot, CLI_ENTRY_NPM))) return { entry: CLI_ENTRY_NPM, useTsx: false, npmTree: true }
  const useTsx = !isPackaged && canRunTsxSource(dshRoot)
  return { entry: useTsx ? CLI_ENTRY_SRC : CLI_ENTRY_LIB, useTsx, npmTree: false }
}

/* 该 root 能否走「tsx + 源码」路线：需要 `@esbuild` 平台包。
 * ⚠️ 构建脚本 `build-runtime.ps1` 的裁剪清单里有 **`@esbuild`**（打包态因此只能跑编译产物）
 * ⇒ 仓内 `dsh-runtime/dsh` 同样**不能**走 tsx，必须回落 `apps/cli/lib/bin.js`，
 * 否则报 `Cannot find package '@esbuild/win32-x64'`。 */
function canRunTsxSource(root) {
  if (!fs.existsSync(path.join(root, 'apps/cli/src/bin.ts'))) return false
  try {
    const nm = path.join(root, 'node_modules', '@esbuild')
    return fs.existsSync(nm) && fs.readdirSync(nm).length > 0
  } catch {
    return false
  }
}

/* ⚠️ 内嵌 node 的**文件名随平台不同**：Windows 是 `node.exe`，macOS/Linux 是 `node`
 *   （`tools/stage-node-runtime.cjs` 按 `--platform` 决定拷哪个名字，electron-builder 的
 *    `extraResources: {from: ../dsh-runtime/node, to: node}` 原样搬进 `Resources/node/`）。
 *   2026-09-25：以前这里硬编码 `node.exe` ⇒ **mac 包起来后 resolveNodeBin() 指向一个不存在的文件**，
 *   内嵌 DSH host 与语音输入子进程全部 spawn 失败（Windows 上永远看不出来）。 */
function nodeBinName() { return process.platform === 'win32' ? 'node.exe' : 'node' }

function resolveNodeBin() {
  if (isPackaged) return path.join(process.resourcesPath, 'node', nodeBinName())
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles
    const candidate = pf && path.join(pf, 'nodejs', 'node.exe')
    if (candidate && fs.existsSync(candidate)) return candidate
  } else {
    /* 开发态：Finder 启动的 .app 只有最小 PATH，Homebrew 的 node 不在里面 ⇒ 显式找一遍 */
    for (const c of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']) {
      if (fs.existsSync(c)) return c
    }
  }
  return 'node'
}

function assetPath(name) {
  const base = isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', 'assets')
  const p = path.join(base, name)
  return fs.existsSync(p) ? p : undefined
}

/* ── P23：内嵌 host 的落盘记录 + 存活探测（防"两个 host 写同一个会话"）──────
 * 记录我们**自己 spawn 的** host 端口/pid；下次启动先问一句"它还活着吗"：
 *   活着 ⇒ 直接复用（永远只有一个 host）；没活 ⇒ 才新起一个。
 * 探测用一次 HTTP 请求：**有应答**就说明端口上是个 DSH host（应答内容不关心）。 */
function hostRecordPath() { return path.join(app.getPath('userData'), 'embedded-host.json') }
function loadHostRecord() {
  try { return JSON.parse(fs.readFileSync(hostRecordPath(), 'utf8')) || null } catch { return null }
}
function saveHostRecord(port, pid, session) {
  try {
    const rec = { port, pid: pid || null, at: Date.now() }
    // 0.1.5-rc.2：复用孤儿 host 时需要同一套会话凭据（token URL + cookie）才能调 /api/*
    if (session && session.tokenUrl) rec.tokenUrl = session.tokenUrl
    if (session && session.cookie) rec.cookie = session.cookie
    fs.writeFileSync(hostRecordPath(), JSON.stringify(rec), 'utf8')
  }
  catch (e) { console.log('[akdagent] 内嵌 host 记录写入失败（不影响运行）：' + e.message) }
}
function probeHost(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok) => { if (!done) { done = true; resolve(ok) } }
    const body = JSON.stringify({ type: 'client-request', rpcId: 'adopt-' + Date.now(), method: 'ping', payload: {} })
    const req = http.request({ host: '127.0.0.1', port, path: '/api/ping', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); finish(true) })            // 有 HTTP 应答 ⇒ 端口上有 host
    req.on('error', () => finish(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); finish(false) })
    req.write(body); req.end()
  })
}

// ── 端口 / 就绪探测 ────────────────────────────────────────────────
function findFreePort(start = 3180, end = 3199) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p > end) return reject(new Error(`no free port in ${start}-${end}`))
      const srv = net.createServer()
      srv.once('error', () => tryPort(p + 1))
      srv.listen(p, '127.0.0.1', () => {
        const port = srv.address().port
        srv.close(() => resolve(port))
      })
    }
    tryPort(start)
  })
}

/* ── 0.1.5-rc.2 网页鉴权（实测 2026-09-21）───────────────────────────
 * 新版把整个 web 面（HTML **和** /api/*）都锁上了：
 *   GET  /                -> 401 `dsh web authentication required; reopen the URL printed by dsh web.`
 *   GET  /?token=<tk>     -> 303 + Set-Cookie ⇒ 跟随后 200（tk 由 stdout 的 `dsh web: <url>` 打出）
 *   POST /probe           -> 405（旧就绪端点已废，waitForWeb 不能再等它）
 *   GET  /api/ping        -> 401（老客户端靠"有应答就算活"仍成立）
 *   ?token= 对 /api/* **无效**，只认 cookie ⇒ 必须先换 cookie，再给 /api/* 与 mux WS 带上 Cookie 头。
 * cookie 是 HttpOnly 的，只在 303/200 的 Set-Cookie 里出现。 */
function httpGet(port, p, opts = {}) {
  const { cookie = null, timeoutMs = 4000 } = opts
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: p, headers: cookie ? { Cookie: cookie } : {} },
      (res) => {
        const sc = res.headers['set-cookie']
        res.resume()
        resolve({
          status: res.statusCode || 0,
          setCookie: sc && sc.length ? sc.map((c) => c.split(';')[0]).join('; ') : null,
          location: res.headers.location || null,
        })
      },
    )
    req.on('error', () => resolve({ status: 0 }))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0 }) })
  })
}

/** 用 token URL 走完 303 跳转链，收集会话 cookie（最多 4 跳） */
async function establishHostSession(tokenUrl) {
  let url = tokenUrl
  let cookie = null
  for (let hop = 0; hop < 4 && url; hop++) {
    let u
    try { u = new URL(url) } catch { break }
    const r = await httpGet(Number(u.port || 80), u.pathname + u.search, { cookie })
    if (r.setCookie) cookie = r.setCookie
    if (r.status >= 300 && r.status < 400 && r.location) {
      try { url = new URL(r.location, url).toString() } catch { break }
      continue
    }
    break
  }
  return cookie
}

function waitForWeb(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) {
        return reject(new Error(hostTokenUrl
          ? 'embedded dsh host is up but refused our session (token/cookie handshake failed)'
          : 'embedded dsh host did not become ready in time'))
      }
      // 新版：先拿 token URL 换 cookie；旧运行时没有 token 行，这步自动跳过
      if (!hostCookie && hostTokenUrl) {
        const c = await establishHostSession(hostTokenUrl)
        if (c) {
          hostCookie = c
          console.log('[akdagent] 已用 token URL 换取宿主会话 cookie（0.1.5-rc.2 网页鉴权）')
        }
      }
      const r = await httpGet(port, '/', { cookie: hostCookie })
      if (r.status === 200) return resolve()
      setTimeout(tick, 500)
    }
    tick()
  })
}

// ── 内嵌 host ──────────────────────────────────────────────────────
/** electron 内嵌 host 的独立 DSH 数据根（与 watchdog 的 ~/.dsh 隔离，避免会话/提问冲突）
 *  `AKDAGENT_DSH_HOME_DIR` 可覆盖：只给**测试/仿真**用（干净用户机验证）*/
const AKDAGENT_DSH_HOME = process.env.AKDAGENT_DSH_HOME_DIR
  || path.join(HOME_DIR, '.dsh-akdagent')
const DSH_SOURCE_HOME = path.join(HOME_DIR, '.dsh')

/** 把 `~/.dsh` 那份凭据/设置**即时镜像**一份进内嵌 host 的隔离家目录。
 *  为什么（2026-09-26 修）：客户端只往 `~/.dsh` 写（CREDENTIALS_PATH / SETTINGS_PATH），
 *  宿主读的却是隔离家目录 ⇒ "只在首次创建时抄一次"会漏掉**用户后填的** key
 *  （干净机器必然踩：先建目录、后填 key ⇒ 宿主永远没 key ⇒ 每轮 AUTH/401）。
 *  两道保险：① 写入时即时镜像（这里）；② dsh-home.js 的 ensureHome 每次启动再补齐。 */
function mirrorDshFileToIsolatedHome(name, text) {
  try {
    if (!AKDAGENT_DSH_HOME) return
    fs.mkdirSync(AKDAGENT_DSH_HOME, { recursive: true })
    fs.writeFileSync(path.join(AKDAGENT_DSH_HOME, name), text, 'utf8')
  } catch { /* 镜像失败不影响主流程（ensureHome 下次启动还会补） */ }
}

/** 首次启动 + 运行时换代：初始化/迁移独立 DSH_HOME（实现与测试见 src/dsh-home.js）
 *  只抄 credentials/settings；profile 交给运行时按随包模板生成。 */
function ensureAkdagentDshHome() {
  try {
    ensureHome({
      home: AKDAGENT_DSH_HOME,
      sourceHome: DSH_SOURCE_HOME,
      dshRoot: resolveDshRoot(),
      log: (m) => console.log(m),
    })
  } catch (e) {
    console.error('[akdagent] ensureAkdagentDshHome failed: ' + e.message)
  }
}

/** P13：保证内嵌 host 的 profile 里有 `mcp-akdagent` 注册，且指向**随包分发**的 server。
 *
 * 为什么需要：干净用户机上既没有开发机那份 `server/dist`，profile 里也没有注册
 * ⇒ 包内 `mcp__sv__*` 一颗工具都没有（用户 2026-09-19 记为 P13）。
 * 做法：**只在缺注册时写入**（已存在一律不动，尊重用户手改）；写前备份 `.bak-autoreg`。
 */
/**
 * MCP server 自检：**真起一次**，走 `initialize` + `tools/list`，确认"握得上手"。
 *
 * 为什么必须有（2026-09-26 用户机事故）：客户端会往 profile 里写一条 MCP 注册；
 * 如果那个 server 在用户机上起不来/握不上手，DSH 的**请求扩展准备**阶段就可能失败 ⇒
 * 用户侧表现是「**每条消息都 回合结束（error）**」，而客户端日志里只有反复刷的重连噪音
 * （`[dsh:err] [akdagent-mcp] server ready…`），根本定位不到。
 * 所以：**注册前先自检；不自检通过就不注册** —— 宁可少 44 个工具，也不能让聊天整轮失败。
 * 已存在的注册**一律不动**（只体检 + 留痕），避免把用户本来能用的配置改坏。
 */
function mcpSelfTest(nodeBin, serverEntry, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let child = null
    let done = false
    let buf = ''
    let errTail = ''
    const finish = (r) => {
      if (done) return
      done = true
      try { if (child) child.kill() } catch { /* 忽略 */ }
      resolve(r)
    }
    const timer = setTimeout(() => finish({ ok: false, why: `${timeoutMs}ms 内没跑完 initialize+tools/list` }), timeoutMs)
    try {
      child = spawn(nodeBin, [serverEntry], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      clearTimeout(timer)
      return finish({ ok: false, why: 'spawn 失败：' + e.message })
    }
    child.stdout.on('data', (d) => {
      buf += String(d)
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        let msg = null
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.id === 1 && !done) {
          try {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n')
          } catch { /* exit 分支会兜住 */ }
        } else if (msg.id === 2) {
          clearTimeout(timer)
          const n = msg.result && Array.isArray(msg.result.tools) ? msg.result.tools.length : 0
          finish(n > 0 ? { ok: true, tools: n } : { ok: false, why: 'tools/list 返回空' })
        }
      }
    })
    child.stderr.on('data', (d) => { errTail = (errTail + String(d)).slice(-600) })
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, why: '进程错误：' + e.message }) })
    child.on('exit', (code) => {
      if (done) return
      clearTimeout(timer)
      const tail = errTail.trim().split('\n').filter(Boolean).slice(-1)[0] || ''
      finish({ ok: false, why: `进程提前退出（code=${code}）${tail ? ' · ' + tail : ''}` })
    })
    try {
      child.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'akdagent-selftest', version: '1' } },
      }) + '\n')
    } catch (e) {
      clearTimeout(timer)
      finish({ ok: false, why: '写 initialize 失败：' + e.message })
    }
  })
}

/**
 * 把「一轮失败」的 error 归类成一句人话（2026-09-26 加）。
 *
 * 为什么需要：用户机上"一发消息就 回合结束（error）"，我们手里只有一个 code（甚至只有一句话），
 * 排查全靠猜。实测签名（隔离宿主 + probe 量出来的）：
 *   · 密钥无效 ⇒ `{code:'AUTH', status:401, message:'Authentication Fails…'}`，**1.4 秒**就报
 *   · 传输失败 ⇒ `{code:'TRANSPORT', …}`
 * 这里把它翻成"下一步该查什么"，并落日志 + 落 userData/last-turn-error.json（方便用户回传）。
 */
function turnErrorHint(e) {
  if (!e || typeof e !== 'object') return ''
  const code = String(e.code || '').toUpperCase()
  const status = Number(e.status || 0)
  const msg = String(e.message || '')
  if (code === 'AUTH' || status === 401) return '提供方拒绝了密钥（401 / AUTH）：key 无效或过期，或者这把 key 不属于当前选中的提供方'
  if (status === 402 || /balance|quota|欠费|insufficient/i.test(msg)) return '提供方账户额度/余额问题（402）：去提供方后台看余额与结算状态'
  if (status === 429 || /rate.?limit|too many|限流/i.test(msg)) return '被限流，或该 key 没有这个模型的权限（429）：稍后重试，或换模型 / 换 key'
  if (status === 403) return '提供方拒绝访问（403）：key 权限不足，或该模型未对这把 key 开放'
  if (code === 'TRANSPORT' || /fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|getaddrinfo|socket hang up/i.test(msg)) return '网络到提供方不通（TRANSPORT）：本机网络 / 代理 / DNS 的问题（可在浏览器里试试打不打得到提供方接口域名）'
  if (code === 'REQUEST_EXTENSION') return 'DSH 在发请求前的「扩展准备」阶段失败（REQUEST_EXTENSION）：通常是 profile 里某条插件条目解析不了（看 akdagent.log 里 dsh-home 的体检日志）'
  if (status >= 500) return '提供方服务端错误（5xx）：过一会儿再试'
  return ''
}

async function ensureMcpRegistration() {
  try {
    const serverEntry = isPackaged
      ? path.join(process.resourcesPath, 'server', 'dist', 'index.js')
      : path.join(__dirname, '..', '..', 'server', 'dist', 'index.js')
    if (!fs.existsSync(serverEntry)) {
      console.log('[akdagent] 未找到 MCP server 入口，跳过注册：' + serverEntry)
      return
    }
    const webDir = path.join(AKDAGENT_DSH_HOME, 'profiles', 'web')
    fs.mkdirSync(webDir, { recursive: true })
    const patch = path.join(webDir, 'cordis.patch.yml')
    const text = fs.existsSync(patch)
      ? fs.readFileSync(patch, 'utf8')
      : '# dsh profile patch（由 AKDAgent 客户端维护；用户手改的部分保留）\n'
    const alreadyRegistered = /id:\s*mcp-akdagent/.test(text)
    const nodeBin = shortPathIfSpaced(resolveNodeBin()).replace(/\\/g, '/')

    /* ── 自检（2026-09-26 新增）──────────────────────────────────────────────
     * 每次启动都真起一次 server 做 initialize + tools/list，并把结果留痕到
     * userData/mcp-selftest.json ⇒ 以后"聊天一直报回合结束（error）"这类报障，
     * 一眼就能看出是不是 MCP 起不来（旧版这里完全无痕，只能靠用户猜）。 */
    const st = await mcpSelfTest(nodeBin, serverEntry)
    try {
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'mcp-selftest.json'),
        JSON.stringify({ at: new Date().toISOString(), ok: st.ok, tools: st.tools || 0, why: st.why || '', serverEntry, nodeBin }, null, 2),
        'utf8'
      )
    } catch { /* 写不了就算了，不影响注册逻辑 */ }

    if (!st.ok) {
      console.error(`[akdagent] MCP 自检未通过：${st.why}`)
      if (alreadyRegistered) {
        console.error('[akdagent] 注册已存在 ⇒ 保持不动（不动用户配置）。若"每条消息都 回合结束（error）"，'
          + '可把 profile 里 `id: mcp-akdagent` 那段整段注释掉再试 —— 只是没有 mcp__sv__* 工具，聊天照常')
      } else {
        console.error('[akdagent] ⇒ 本次**不写入** MCP 注册（宁可少 44 个工具，也不能让每轮请求都失败）')
      }
      return
    }
    console.log(`[akdagent] MCP 自检通过：tools/list = ${st.tools} 个工具`)
    if (alreadyRegistered) {
      console.log('[akdagent] MCP 注册已存在（保留现状）')
      return
    }
    const block = [
      '',
      '# AKDAgent：把 Lua 桥封装成 MCP 工具（mcp__sv__*）。由客户端启动时自动写入（P13）。',
      '- insert:',
      '    - id: mcp-akdagent',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: sv',
      '        transport: stdio',
      `        command: '${nodeBin}'`,
      `        args: ['${serverEntry.replace(/\\/g, '/')}']`,
      '        toolCallTimeoutMs: 900000',
      '',
    ].join('\n')
    if (fs.existsSync(patch)) fs.copyFileSync(patch, patch + '.bak-autoreg')
    fs.writeFileSync(patch, text.replace(/\s*$/, '') + '\n' + block, 'utf8')
    console.log(`[akdagent] 已写入 MCP 注册：${serverEntry}（node=${nodeBin}）`)
  } catch (e) {
    console.error('[akdagent] ensureMcpRegistration failed: ' + e.message)
  }
}

/** 路径带空格时取 Windows 8.3 短路径（`C:\Program Files\…` → `C:\PROGRA~1\…`）；拿不到就原样返回 */
function shortPathIfSpaced(p) {
  if (!p || !p.includes(' ')) return p
  const usable = (s) => !!s && !s.includes(' ') && fs.existsSync(s)
  // ① cmd 的 `for %~sI`。
  //    ⚠️ 必须 windowsVerbatimArguments：否则 Node 会把「带引号+空格」的整串命令再套一层引号，
  //    cmd 解析就坏掉（实测第一次就是这么失败的：拿到空的短路径）。
  try {
    const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `for %I in ("${p}") do @echo %~sI`],
      { windowsHide: true, encoding: 'utf8', windowsVerbatimArguments: true })
    const out = String(r.stdout || '').trim().split(/\r?\n/).pop() || ''
    if (usable(out)) return out
  } catch { /* 继续兜底 */ }
  // ② FileSystemObject 的 ShortPath（卷上关了 8.3 生成时 cmd 那套也就没辙，这里仍试一次）
  try {
    const ps = `(New-Object -ComObject Scripting.FileSystemObject).GetFile('${p.replace(/'/g, "''")}').ShortPath`
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, encoding: 'utf8' })
    const out = String(r.stdout || '').trim().split(/\r?\n/).pop() || ''
    if (usable(out)) return out
  } catch { /* 保持原路径 */ }
  return p
}

/** 让内嵌 host 的 MCP 注册用**不含空格**的 node 路径（P11 · 用户 2026-09-19 要求做掉）。
 *
 * 为什么必须做：包内那套旧运行时（0.1.0-rc.5）会把 `command` **按空格切开** ⇒
 *   `C:/Program Files/nodejs/node.exe` 变成 `Files/nodejs/node.exe`，子进程直接
 *   `Cannot find module '…\resources\dsh\Files\nodejs\node.exe'`（实测 36 次重试全这样、MCP 起不来）。
 *   开发树运行时没这个毛病 ⇒ **只有发布形态中招**（所以开发态一直看不出来）。
 * 做法：能算出无空格路径就**幂等改写** profile 的 cordis.patch.yml（首次先备份 `.bak-mcpcmd`）；拿不到就不动用户配置。
 *   · 优先用**包内自带** node（`resources/node/node.exe`）
 *   · 路径带空格时取 8.3 短路径
 */
function ensureSpaceFreeMcpCommand() {
  try {
    const patch = path.join(AKDAGENT_DSH_HOME, 'profiles', 'web', 'cordis.patch.yml')
    if (!fs.existsSync(patch)) return
    const src = fs.readFileSync(patch, 'utf8')
    const idx = src.indexOf('mcp-akdagent')
    if (idx < 0) return
    // 只改 mcp-akdagent 之后的第一处 command:（不碰别的插件）
    const re = /(command:\s*['"]?)([^'"\r\n]+)(['"]?)/
    const m = re.exec(src.slice(idx))
    if (!m) return
    const current = m[2].trim()
    // 打包态也用 resolveNodeBin()：它已经按平台给出 `Resources/node/node(.exe)`（见该函数注释）
    const preferred = resolveNodeBin()
    const candidate = shortPathIfSpaced(fs.existsSync(preferred) ? preferred : current)
    if (!candidate || candidate === current || candidate.includes(' ')) {
      console.log(`[akdagent] MCP command 保持原样（拿不到无空格路径）：${current}`)
      return
    }
    const bak = patch + '.bak-mcpcmd'
    if (!fs.existsSync(bak)) fs.copyFileSync(patch, bak)
    fs.writeFileSync(patch, src.slice(0, idx) + src.slice(idx).replace(re, `$1${candidate}$3`), 'utf8')
    console.log(`[akdagent] MCP command → ${candidate}（去空格；规避旧运行时把 command 按空格切开的 bug · P11）`)
  } catch (e) {
    console.error('[akdagent] ensureSpaceFreeMcpCommand failed: ' + e.message)
  }
}

function spawnHost(port) {
  const nodeBin = resolveNodeBin()
  const dshRoot = resolveDshRoot()
  /* 入口分两套（2026-09-19 修「打包版起不来 host」）：
   *   · 打包态 ⇒ **编译产物** `apps/cli/lib/bin.js`：构建脚本把 `@esbuild` 当
   *     "build only" 裁掉了（scripts/build-runtime.ps1 §2a），而 `tsx` 运行时**需要**
   *     esbuild ⇒ 打包态再走 `--import tsx/esm …/src/bin.ts` 必然
   *     `Cannot find package '@esbuild/win32-x64'`。编译产物在包里（apps/cli/lib/），
   *     不依赖 esbuild。
   *   · 开发态 ⇒ 源码 + tsx（源 checkout 里 esbuild/tsx 都在，改完即生效）。
   * ⚠️ 改这里要先确认构建脚本的裁剪清单，两边必须一致（见 sv-project-format/待办 §打包）。 */
  const { entry, useTsx, npmTree } = hostEntryFor(dshRoot)
  hostTokenUrl = null
  hostCookie = null
  // 新版 web app 会自己拉起浏览器；内嵌启动必须禁掉。旧运行时不认这个 flag，故只在 npm 树上加。
  const tail = npmTree ? ['--no-open'] : []
  const args = useTsx
    ? ['--import', 'tsx/esm', entry, 'web', '--port', String(port), ...tail]
    : [entry, 'web', '--port', String(port), ...tail]
  const env = { ...process.env }
  delete env.DSH_OPEN_INBOX
  // 独立 DSH_HOME：与 watchdog（~/.dsh）隔离，避免共用会话存储导致提问应答冲突
  ensureAkdagentDshHome()
  // P13：profile 里要有 MCP 注册（指向随包分发的 server）——干净机器靠这一步
  ensureMcpRegistration()
  // P11：MCP 注册的 node 路径必须**不含空格**（旧运行时会按空格切开 command ⇒ MCP 起不来）
  ensureSpaceFreeMcpCommand()
  env.DSH_HOME = AKDAGENT_DSH_HOME
  // 随应用分发的技能（打包运行时内含 skills/，开发模式下可能不存在则跳过）
  const skillsDir = path.join(dshRoot, 'skills')
  if (fs.existsSync(skillsDir)) env.DSH_BUNDLED_SKILL_DIR = skillsDir

  const entryAbs = path.join(dshRoot, entry)
  if (!fs.existsSync(entryAbs)) {
    /* **立即失败并报真因**（2026-09-19 事故）：原先只打一行日志就继续 spawn ⇒ cwd 不存在
     * ⇒ `spawn … ENOENT`，再白等满 90s 才弹「did not become ready in time」，真因被埋。 */
    throw new Error(
      '内嵌 dsh host 入口不存在 / embedded dsh entry missing:\n  ' + entryAbs + '\n' +
      'dshRoot = ' + dshRoot + '\n' +
      (process.env.AKDAGENT_DSH_ROOT
        ? '（来自环境变量 AKDAGENT_DSH_ROOT）'
        : '（开发态取仓内 dsh-runtime/dsh；也可用 AKDAGENT_DSH_ROOT 指定 DSH 源码 checkout）')
    )
  }
  console.log(`[akdagent] spawning embedded host: ${nodeBin} ${args.join(' ')} (cwd=${dshRoot}, DSH_HOME=${AKDAGENT_DSH_HOME})`)
  const child = spawn(nodeBin, args, { cwd: dshRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  // host 的输出**同时**进日志文件（console.* 已被上面的安全网接管）——打包版没终端时，
  // 这里是排查「host 为什么没起来」的唯一证据来源。
  child.stdout.on('data', (d) => {
    const text = String(d)
    // 0.1.5-rc.2：stdout 只有这一行有意义 —— 带 token 的访问地址。抓下来，waitForWeb 用它换 cookie。
    if (!hostTokenUrl) {
      const m = text.match(/dsh web:\s*(http\S+)/)
      if (m) {
        hostTokenUrl = m[1]
        console.log('[akdagent] 捕获宿主 token URL（用于换取会话 cookie）')
      }
    }
    console.log('[dsh] ' + text.replace(/\s+$/, ''))
  })
  child.stderr.on('data', (d) => console.error('[dsh:err] ' + String(d).replace(/\s+$/, '')))
  child.on('error', (e) => {
    // spawn 本身失败（node.exe 路径不对 / 权限）：不处理会变成未捕获的 'error' 事件
    console.error(`[akdagent] 内嵌 host spawn 失败：${e.message}（nodeBin=${nodeBin}）`)
  })
  child.on('exit', (code, signal) => {
    console.log(`[akdagent] embedded host exited: code=${code} signal=${signal}`)
    if (!quitting) {
      // 别立刻退：子进程 stderr 是**异步管道**，退出瞬间最后一坨（往往正是崩溃堆栈）
      // 可能在 'exit' 之后才到 —— 2026-09-21 排查宿主死因时就因为立刻 quitApp 丢了证据。
      setTimeout(() => { if (!quitting) quitApp() }, 500)
    }
  })
  return child
}

function killTree(pid) {
  try {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
  } catch {
    /* ignore */
  }
}

// ── 窗口状态 ───────────────────────────────────────────────────────
let orbWin = null
let settingsWin = null
/** 设置窗要直达的页（`ready-to-show` 之前就记下，等页面就绪再发 —— 见 openSettings） */
let settingsPendingPage = null
let tray = null
let hostChild = null
let hostReady = false
let quitting = false
let dragOffset = null

// ── DSH Agent 代理状态（orb 对话面板的真实对话通道） ────────────────
let hostPort = null            // 内嵌 host 端口（whenReady 中确定）
let hostTokenUrl = null        // 0.1.5-rc.2：stdout 里那行 `dsh web: http://…/?token=…`
let hostCookie = null          // 用上一步换来的会话 cookie（/api/* 与 mux WS 都必须带）
let orbSessionId = null        // orb 面板当前绑定的 DSH 会话（= 当前段的会话）
let orbSegId = null            // 当前段的 segId（段表 orb-segments.js）
let orbProjectKey = null       // 当前工程 key（有路径的工程才有；临时段为 null）
let agentRpcSeq = 0            // RPC id 自增
let muxSocket = null           // /api/remote.mux WebSocket（0.1.5-rc.2 起；旧名 /api/events.mux）
let muxRetryDelay = 1000       // 断线重连退避（毫秒）
let muxRetryTimer = null

function setOrbStatus(ready) {
  hostReady = ready
  // 桥状态灯：host 就绪 ⇒ 开始每 5s 采样心跳；host 掉了 ⇒ 停表并立即落回"未就绪"
  if (ready) startBridgePoll()
  else { stopBridgePoll(); bridgePillKey = ''; refreshBridgePill() }
  resendOrbState()
  // 🆕 2026-09-25：**设置页也要**（它自己不会轮询；以前只在打开时拿一次 ⇒ 早开的设置页永远"未就绪"）
  pushHostStatusToSettings()
}

/* ── 悬浮球三态指示灯（2026-09-21 用户选"三态单点"）───────────────────
 *   🟢 host 就绪 + 至少一座桥心跳新鲜（≤15s）
 *   🟡 host 就绪，但桥心跳过期 / 从没运行过（tooltip 给出可操作原因）
 *   ⚪ host 未就绪（还在启动，或已退出）
 *  采样**只读心跳文件、绝不 ping 宿主**（probeBridgeHeartbeat）——
 *  这是用户口径：判断"桥在不在"看心跳就够，别每 5s 去敲宿主。
 *  ⚠️ 文案不在主进程组：这里只给 {level, code, args}，由 orb 页用 I.t() 组串 ⇒ 切语种
 *  时 orb 自己重排（见 orb.html renderOrbPill），与 settings 的 main.bridge.* 互不干扰。 */
const BRIDGE_POLL_MS = 5000
let bridgePollTimer = null
let bridgePill = { level: 'down', code: 'orb.bridge.hostDown', args: [] }
let bridgePillKey = ''          // 推送去重：载荷没变就不重推给 orb
let bridgeLogKey = ''           // 日志去重：只按"状态"（level+code）打，别每 5s 刷一行（心跳秒数会一直变）

/** 由两次心跳探针算出三态（纯函数，无副作用，便于单测） */
function computeBridgePill(ready, sv, ix) {
  const tagOf = (p) => (p.host === 'ix' ? 'IX' : 'SV')
  if (!ready) return { level: 'down', code: 'orb.bridge.hostDown', args: [] }
  const all = [sv, ix].filter(Boolean)
  const fresh = all.filter((p) => p.fresh)
  if (fresh.length) {
    // 两座桥都新鲜就都列出来（SV 与 IX 可同时开着）
    const label = fresh.map(tagOf).join(' ｜ ')
    let age = Infinity
    for (const p of fresh) if (p.ageSec < age) age = p.ageSec
    return { level: 'ok', code: 'orb.bridge.ok', args: [label, age] }
  }
  const withHb = all.filter((p) => typeof p.ageSec === 'number')
  if (withHb.length) {
    // 都过期 ⇒ 报最近还有心跳的那座（ageSec 最小 = 停得最晚），信息量最大
    const p = withHb.slice().sort((a, b) => a.ageSec - b.ageSec)[0]
    return { level: 'warn', code: 'orb.bridge.stale', args: [tagOf(p), p.ageSec] }
  }
  return { level: 'warn', code: 'orb.bridge.none', args: [] }
}

/** 采样一次两座桥的心跳并（在状态变化时）推给 orb */
function refreshBridgePill() {
  let sv = null
  let ix = null
  try { sv = probeBridgeHeartbeat('sv') } catch { /* 探针本身不抛，这里只兜底 */ }
  try { ix = probeBridgeHeartbeat('ix') } catch { /* 同上 */ }
  const next = computeBridgePill(hostReady, sv, ix)
  const key = next.level + '|' + next.code + '|' + next.args.join(',')
  const stateKey = next.level + '|' + next.code
  if (key !== bridgePillKey) {
    bridgePill = next
    bridgePillKey = key
    sendOrbStatus()
  }
  // 日志留痕：只在**状态**变化时打一行（排障时一眼看出球上那点为什么是这个颜色）
  if (stateKey !== bridgeLogKey) {
    bridgeLogKey = stateKey
    console.log('[bridge] 状态灯 → ' + next.level + ' · ' + next.code + (next.args.length ? ' ' + next.args.join(' ') : ''))
  }
}

function startBridgePoll() {
  if (bridgePollTimer) return
  refreshBridgePill()                                  // 立刻来一次，别让球先灰 5 秒
  bridgePollTimer = setInterval(refreshBridgePill, BRIDGE_POLL_MS)
  if (bridgePollTimer.unref) bridgePollTimer.unref()   // 定时器不该拖着进程不退出
}

function stopBridgePoll() {
  if (bridgePollTimer) { clearInterval(bridgePollTimer); bridgePollTimer = null }
}

/** 把「host 就绪 + 桥三态」推给悬浮球（三态灯的唯一出口） */
function sendOrbStatus() {
  if (!orbWin || orbWin.isDestroyed()) return
  orbWin.webContents.send('akdagent-status', {
    ready: !!hostReady, level: bridgePill.level, code: bridgePill.code, args: bridgePill.args,
  })
}

/** 补推 orb 的全部状态（三态灯 + agent 就绪 + 宿主类型）。
 *  为什么必须有：这几路推送都是"变化驱动"的 —— 页面若还没建好（或从托盘重建过，
 *  showOrbFromTray → createOrbWindow），那一次 send 打到 null 就永远丢了，
 *  球会一直停在初态（灰灯 / 无宿主图标）。所以 did-finish-load 与 setOrbStatus 都走这里。 */
function resendOrbState() {
  sendOrbStatus()
  notifyAgentReady()
  /* 宿主皮肤：先把上次算出的类型**同步**推过去（窗口从托盘重建时别干等 ping 往返），
   * 再按"当前宿主"刷新一次（可能有变）。 */
  if (lastOrbHostType !== null) sendOrbHostType(lastOrbHostType)
  refreshOrbHostType(true).catch(() => { /* 忽略：宿主类型只是图标，取不到就不切 */ })
}

/** agent 对话通道是否就绪（host 就绪且 mux 事件流已连接） */
function agentReadyState() {
  return !!(hostReady && muxSocket && muxSocket.readyState === WebSocket.OPEN)
}

/** 向 orb 推送连接状态（未就绪显示"正在连接"，就绪显示"连接完成"） */
function notifyAgentReady() {
  if (orbWin && !orbWin.isDestroyed()) {
    orbWin.webContents.send('akdagent-agent-ready', agentReadyState())
  }
}

function createOrbWindow() {
  // 初始位置：屏幕右下角（工作区 + 24px 边距）
  const { workArea } = screen.getPrimaryDisplay()
  const orbX = workArea.x + workArea.width - 64 - 24
  const orbY = workArea.y + workArea.height - 64 - 24
  orbWin = new BrowserWindow({
    x: orbX,
    y: orbY,
    width: 64,
    height: 64,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'orb-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  orbWin.loadFile(path.join(__dirname, 'orb.html'))
  // 页面（重）加载完成后补推一遍状态：三态灯/agent 就绪/宿主类型都是"变化才推"，
  // 窗口重建（托盘「显示悬浮球」）后若不补推，球就停在初态（2026-09-21 修）
  orbWin.webContents.on('did-finish-load', () => {
    if (!orbWin || orbWin.isDestroyed()) return
    resendOrbState()
    // 启动后强制校正位置：确保 orb 贴回工作区右下角（防止上次会话 resize 漂移出界）
    const { workArea } = screen.getDisplayNearestPoint(orbWin.getBounds())
    const w = 64
    const h = 64
    const maxX = workArea.x + workArea.width - w
    const maxY = workArea.y + workArea.height - h
    const cur = orbWin.getBounds()
    if (cur.x < workArea.x || cur.y < workArea.y || cur.x > maxX || cur.y > maxY) {
      orbWin.setBounds({ x: Math.max(workArea.x, Math.min(cur.x, maxX)), y: Math.max(workArea.y, Math.min(cur.y, maxY)), width: w, height: h })
      console.log('[akdagent] orb position corrected')
    }
    // 区域外点击穿透（延迟启用避免透明窗口不渲染）
    setTimeout(() => {
      if (orbWin && !orbWin.isDestroyed()) orbWin.setIgnoreMouseEvents(true, { forward: true })
    }, 300)
  })
  orbWin.on('closed', () => {
    console.log('[akdagent] orb window closed')
    orbWin = null
  })
  // 显示/隐藏（含「隐藏到托盘」）时重建托盘菜单：菜单里那一项要在
  // 「隐藏到托盘 ↔ 显示悬浮球」之间切换文案
  orbWin.on('show', () => refreshTrayMenu())
  orbWin.on('hide', () => refreshTrayMenu())
  orbWin.on('render-process-gone', (_e, details) => {
    console.log('[akdagent] orb renderer gone:', JSON.stringify(details))
  })
}

function createSettingsWindow() {
  settingsWin = new BrowserWindow({
    width: 680,
    height: 720,
    minWidth: 560,
    minHeight: 520,
    resizable: true,
    show: false,
    title: i18n.t('app.settingsTitle'),
    icon: assetPath('icon.ico'),
    backgroundColor: '#2e2e2e',   // 与设置页 --bg 一致（防白闪）
    // 自定义标题栏：`titleBarOverlay` 能指定**精确颜色**（系统深色会被 Windows 强调色染成深蓝）
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#2e2e2e', symbolColor: 'rgb(179,179,179)', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin.loadFile(path.join(__dirname, 'settings.html'))
  settingsWin.on('closed', () => {
    console.log('[akdagent] settings window closed')
    settingsWin = null
  })
}

/** 给窗口**真正**拿到键盘焦点（2026-09-25 加，治「有光标但敲键没字」）。
 *
 *  为什么不能只调 `win.focus()`：Electron 里「窗口是活动的」与「渲染进程拿到键盘焦点」是两件事
 *  （`win.isFocused()` vs `win.webContents.isFocused()`）。用户报的那种症状 =
 *  窗口可见、点进去还画着光标，但 key 事件被 OS 送去了**别的窗口** ⇒ 敲键一个字符都不出。
 *  ⇒ 显示后显式给 `webContents.focus()`，并在 +250ms / +900ms **自查**：若渲染进程仍没焦点，
 *     补一次（必要时用 `setAlwaysOnTop(true)→false` 这种 Windows 上把窗口顶到前台的常规手法），
 *     且**打日志**——下次再犯，`akdagent.log` 会直接告诉我们它当时到底有没有焦点。 */
function ensureWindowKeyboardFocus(win, tag) {
  if (!win || win.isDestroyed()) return
  const give = (why) => {
    try { win.focus() } catch { /* 忽略 */ }
    try { win.webContents.focus() } catch { /* 忽略 */ }
    if (why) console.log(`[${tag}] ${why} ⇒ 补 focus（winFocused=${win.isFocused()} wcFocused=${win.webContents.isFocused()}）`)
  }
  give(null)
  for (const delay of [250, 900]) {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return
      if (win.webContents.isFocused()) return
      if (!win.isFocused()) {
        // Windows：短暂 alwaysOnTop 能把窗口可靠地顶到前台（不这么做时 setForegroundWindow 会被前台锁拒掉）
        try { win.setAlwaysOnTop(true); win.setAlwaysOnTop(false) } catch { /* 忽略 */ }
      }
      give(`显示后 ${delay}ms 渲染进程仍没键盘焦点`)
    }, delay)
  }
}

// ── API 密钥检测 + 首次启动弹窗 ────────────────────────────────────
let keyPromptWin = null

/** 凭据文件有**两种格式**（用户 2026-09-19 报"老是弹密钥提示"的根因）：
 *   · 老格式（扁平）：`DEEPSEEK_API_KEY: <key>`
 *   · 新格式（DSH 2026-09-18 起）：`version/refs/records`，密钥在 **`refs.DEEPSEEK_API_KEY`**
 *  客户端原先只按扁平键读 ⇒ 新格式下永远判"没配密钥" ⇒ **每次启动都弹窗**。下面这组函数两种都认。 */
function credRefs(creds) {
  return creds && typeof creds === 'object' && creds.refs && typeof creds.refs === 'object' ? creds.refs : null
}
function getCred(creds, name) {
  if (!creds || !name) return undefined
  const refs = credRefs(creds)
  return (refs && refs[name]) || creds[name]
}
function setCred(creds, name, value) {
  const refs = credRefs(creds)
  if (refs) refs[name] = value
  else creds[name] = value
}
function delCred(creds, name) {
  const refs = credRefs(creds)
  if (refs && refs[name] !== undefined) delete refs[name]
  if (creds[name] !== undefined) delete creds[name]
}

/** 检查 DeepSeek API key 是否已配置 */
function hasDeepSeekKey() {
  const creds = readCredentials()
  return !!getCred(creds, 'DEEPSEEK_API_KEY')
}

function createKeyPromptWindow() {
  if (keyPromptWin && !keyPromptWin.isDestroyed()) {
    ensureWindowKeyboardFocus(keyPromptWin, 'key-prompt')
    return
  }
  keyPromptWin = new BrowserWindow({
    width: 600,
    height: 320,
    resizable: false,
    show: false,
    /* ⛔ 这里**不能**用 `modal: true` + `parent: settingsWin`（2026-09-25 实测定案）。
     *   Windows 上模态子窗会把**父窗口整个禁用**（`BrowserWindow.isEnabled() === false`）
     *   ⇒ 设置窗看得见、但键鼠根本到不了页面 = 用户报的「输入框打不进字」。
     *   而且它是**顺序依赖**的：设置窗开着时建密钥窗才带 parent（启动弹窗时 settingsWin 还不存在
     *   ⇒ parent=undefined ⇒ 不模态），所以"有时好有时坏"、关掉设置窗重开就恢复。
     *   实测：带 modal ⇒ 设置窗 isEnabled=false / isFocused=false /
     *   document.hasFocus=false；去掉 modal+parent ⇒ isEnabled=true 且密钥窗照样在前台。
     *   ⇒ 密钥窗做成**独立窗口**：不抢禁用、不随设置窗生死，行为与正常启动弹窗一致。
     *   这条有守卫钉着（tools/check-package-assets.cjs 的"模态子窗"检查），别再手滑加回来。 */
    title: i18n.t('app.keyPromptTitle'),
    icon: assetPath('icon.ico'),
    backgroundColor: '#2e2e2e',   // 与设置页 --bg 一致（防白闪）
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#2e2e2e', symbolColor: 'rgb(179,179,179)', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'key-prompt-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  /* ⛔ 2026-09-25：**演示页已删除**（用户录完视频后删掉）。
     这里原来是一条 `AKDAGENT_KEY_PROMPT_DEMO=1 ⇒ 载入 key-prompt.demo.html` 的分支；
     那份演示页是"与线上页只差 3 处"的临时副本（密钥链接指向 /api_keys、点确定不写真实凭据），
     录完即弃 ⇒ 连同分支一起删掉 —— 否则它会随包分发（`files: src/**` ⇒ 进 asar）。
     以后要再录：临时复制一份 key-prompt.html 改那 3 处，**别把它留在仓里**。 */
  keyPromptWin.loadFile(path.join(__dirname, 'key-prompt.html'))
  // 页面画出来再显示；显示后同样**显式给渲染进程焦点**（密钥输入框最怕"有光标但敲键没字"）
  keyPromptWin.once('ready-to-show', () => {
    keyPromptWin.show()
    ensureWindowKeyboardFocus(keyPromptWin, 'key-prompt')
  })
  keyPromptWin.on('closed', () => {
    keyPromptWin = null
  })
}

/** 首次启动：无 key 则弹窗（仅当窗口都就绪后） */
function maybeShowKeyPrompt() {
  const has = hasDeepSeekKey()
  console.log('[akdagent] DeepSeek key: ' + (has ? 'configured（不再弹窗）' : 'MISSING ⇒ 弹密钥窗'))
  if (has) return
  // 等 orb 和 settings 都创建后再弹（作为 settings 的模态）
  setTimeout(() => createKeyPromptWindow(), 500)
}

ipcMain.on('akdagent-key-save', (_e, key) => {
  const creds = readCredentials()
  if (key && String(key).trim()) {
    setCred(creds, 'DEEPSEEK_API_KEY', String(key).trim())   // 新格式写进 refs，老格式写顶层
    writeCredentials(creds)
    console.log('[akdagent] DeepSeek API key saved（写到 ' + (credRefs(creds) ? 'refs' : '顶层') + '）')
  }
  if (keyPromptWin) keyPromptWin.close()
})

ipcMain.on('akdagent-key-cancel', () => {
  if (keyPromptWin) keyPromptWin.close()
})

ipcMain.on('akdagent-key-open-settings', (_e, page) => {
  if (keyPromptWin) keyPromptWin.close()
  openSettings(page)          // page 可选：'model' / 'conv' / 'sv' / 'status' / 'about'
})

/** 用系统浏览器打开外部链接（**只允许 http/https**；任何弹窗里点外链都走这里，
 *  避免 BrowserWindow 被导航走、也避免 file:// 之类被利用）*/
ipcMain.on('akdagent-open-external', (_e, url) => {
  const u = String(url || '').trim()
  // 只放行 http(s) 与 mailto:（2026-09-25：关于页要能点开邮箱）；
  // file:// javascript: data: 之类一律拒 —— 渲染进程给什么都不能让它开任意东西。
  if (!/^https?:\/\//i.test(u) && !/^mailto:[^\s@]+@[^\s@]+$/i.test(u)) {
    console.log('[akdagent] open-external 拒绝非 http(s)/mailto 链接: ' + u)
    return
  }
  shell.openExternal(u).catch((err) => console.log('[akdagent] openExternal 失败: ' + err.message))
})

function createTray() {
  /* ⚠️ 托盘图标**分平台**：`nativeImage.createFromPath()` 在 macOS 上**读不了 .ico**（返回空图 ⇒
   *   菜单栏上一个空白位）；而且 mac 菜单栏图标按 22pt 排版，32px 的 PNG 直接塞进去偏大。
   *   所以：Windows 用 .ico，macOS 用 tray.png 缩到 18×18。 */
  let img
  if (process.platform === 'darwin') {
    const p = assetPath('tray.png') || assetPath('icon.png')
    img = p ? nativeImage.createFromPath(p).resize({ width: 18, height: 18 }) : nativeImage.createEmpty()
  } else {
    const p = assetPath('icon.ico') || assetPath('tray.png')
    img = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
  }
  tray = new Tray(img)
  tray.setToolTip(i18n.t('app.trayTooltip'))
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => toggleOrbPanel())
}

/** 托盘菜单：语种切换后要重建（buildTrayMenu 每次现取文案）
 *  注意：`orb.menu.showOrb` / `hideToTray` 的文案按**当前悬浮球可见性**取，
 *  所以隐藏/显示之后要调 `refreshTrayMenu()` 重建一次。 */
function buildTrayMenu() {
  const orbVisible = !!(orbWin && !orbWin.isDestroyed() && orbWin.isVisible())
  return Menu.buildFromTemplate([
    { label: i18n.t('orb.menu.toggleChat'), click: () => toggleOrbPanel() },
    { label: i18n.t(orbVisible ? 'orb.menu.hideToTray' : 'orb.menu.showOrb'), click: () => toggleOrbWindow() },
    { type: 'separator' },
    // 🆕 帮助（2026-09-25 用户定：悬浮球右键 + 托盘右键都放；同一个 openHelp）
    { label: i18n.t('orb.menu.settings'), click: () => openSettings() },
    { label: i18n.t('orb.menu.help'), click: () => openHelp() },
    { type: 'separator' },
    { label: i18n.t('orb.menu.quit'), click: () => quitApp() },
  ])
}

/** 托盘菜单重建（可见性/语种变化后调用） */
function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu())
}

// ── 客户端界面语言（i18n） ─────────────────────────────────────────
/**
 * 渲染层取字典：**同步 IPC**（preload 在沙箱里不能读文件，只能向主进程要）。
 * 按发送者判断该给哪个窗口的命名空间（common 打底 + 该窗口自己的）。
 */
function i18nNamespaceOf(sender) {
  const pairs = [
    [orbWin, 'orb'],
    [settingsWin, 'settings'],
    [keyPromptWin, 'keyPrompt'],
  ]
  for (const [win, ns] of pairs) {
    if (win && !win.isDestroyed() && win.webContents === sender) return ns
  }
  return 'common'
}

ipcMain.on('akdagent-i18n-sync', (e) => {
  e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor(i18nNamespaceOf(e.sender)) }
})

/** 当前语种与可选语种（设置页语言行用） */
ipcMain.handle('akdagent-get-ui-prefs', () => ({
  locale: i18n.getLocale(),
  locales: i18n.LOCALES.map((l) => ({ id: l, label: i18n.LOCALE_LABELS[l] })),
  firstRun: i18n.isFirstRun(),
}))

/**
 * 切换客户端界面语言：落盘 → 广播给所有窗口（preload 更新字典后让页面重排文案）→ 重建托盘/菜单。
 * **不重载窗口**：重载会丢掉聊天面板里没发出去的草稿和面板开合状态。
 * 同时把新文案回推给设置页（它的下拉框要显示"已切换"）。
 */
ipcMain.handle('akdagent-set-ui-locale', (_e, next) => {
  const r = i18n.setLocale(next)
  if (!r.ok) return r
  const payload = {
    locale: i18n.getLocale(),
    labels: i18n.LOCALE_LABELS,
  }
  for (const win of [orbWin, settingsWin, keyPromptWin]) {
    if (!win || win.isDestroyed()) continue
    win.webContents.send('akdagent-i18n-update', {
      ...payload,
      dict: i18n.dictFor(i18nNamespaceOf(win.webContents)),
    })
  }
  // 原生菜单/托盘不吃页面字典，得用主进程侧文案重建
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(i18n.t('app.trayTooltip'))
    refreshTrayMenu()
  }
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.setTitle(i18n.t('app.settingsTitle'))
  if (keyPromptWin && !keyPromptWin.isDestroyed()) keyPromptWin.setTitle(i18n.t('app.keyPromptTitle'))
  console.log(`[i18n] 界面语言切成 ${i18n.getLocale()}`)
  return r
})

// ── 悬浮球右键菜单 ────────────────────────────────────────────────
/** 把 host 状态推给**已经开着**的设置窗口（2026-09-25 修）。
 *
 *  起因（用户报「设置里运行状态一直显示未就绪」）：`setOrbStatus()` 只把状态推给悬浮球，
 *  设置页**只在打开的那一刻**拿一次（openSettings / requestStatus）⇒ 启动头十几秒内打开设置，
 *  它会永远停在「未就绪 / 等待启动…」，而内嵌 host 其实早就 ready 了（实测：app 11:30:11 启动，
 *  11:30:25 host 就绪，设置页却一直红着）。所以 host 状态一变就补一次推送。 */
function pushHostStatusToSettings() {
  if (!settingsWin || settingsWin.isDestroyed()) return
  settingsWin.webContents.send('akdagent-host-status', hostReady, '')
}

/** 打开集中设置窗口。
 *
 *  ⚠️ 2026-09-25（用户报「**刚启动后第一次**开设置窗，配置预设模型那里输不进去：有光标、敲键没字」）：
 *   原来这里是 `loadFile()` 之后**立刻** `show()+focus()`。首次打开要现加载页面（启动那会儿主进程
 *   还在忙 spawn / 加载 STT 模型），窗口可能**先可见、渲染进程还没拿到键盘焦点** —— 用户点进输入框
 *   看到光标，敲键却进不去（key 事件被 OS 送去了别的窗口）。第二次打开页面已在缓存里，就正常了。
 *   ⇒ 现在：**等 `ready-to-show` 再显示**（1.5s 兜底，页面加载失败时也不能"点了设置没反应"），
 *     显示后走 `ensureWindowKeyboardFocus()`（显式 `webContents.focus()` + 两次自查补 focus + 打日志）。 */
const SETTINGS_REVEAL_FALLBACK_MS = 1500
function revealSettingsWindow() {
  if (!settingsWin || settingsWin.isDestroyed()) return
  if (!settingsWin.isVisible()) settingsWin.show()
  ensureWindowKeyboardFocus(settingsWin, 'settings')
}

function openSettings(page) {
  const fresh = !settingsWin || settingsWin.isDestroyed()
  if (fresh) createSettingsWindow()
  const want = (page && /^[a-z]+$/.test(String(page))) ? String(page) : null

  if (settingsWin.isVisible()) {          // 已经显示过：直接前置 + 补焦点
    ensureWindowKeyboardFocus(settingsWin, 'settings')
    pushHostStatusToSettings()
    if (want) settingsWin.webContents.send('akdagent-settings-goto', want)
    return
  }

  /* 还没显示过：等页面画出来（ready-to-show）再显示；要跳的页等显示后再发 */
  settingsPendingPage = want
  let revealed = false
  const doReveal = (why) => {
    if (revealed) return
    revealed = true
    clearTimeout(fallback)
    revealSettingsWindow()
    pushHostStatusToSettings()
    if (settingsPendingPage && settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('akdagent-settings-goto', settingsPendingPage)
      settingsPendingPage = null
    }
    if (why) console.log(`[settings] ${why} ⇒ 仍然显示（"点了设置却什么都没出来"才是最糟的）`)
  }
  settingsWin.once('ready-to-show', () => doReveal(null))
  const fallback = setTimeout(() => doReveal(`ready-to-show 等了 ${SETTINGS_REVEAL_FALLBACK_MS}ms 还没来`), SETTINGS_REVEAL_FALLBACK_MS)
}

/** 应用内帮助页（2026-09-25 用户定：把演示/说明页挂到**悬浮球右键 → 帮助**）。
 *
 *  文件来路：`electron/src/help/index.html`（由 `tools/gen-demo-data.cjs` 从
 *  `README-发布版草案-v2.md` 生成 —— 与 `docs/demo/index.html` 同一份，**别手改**；
 *  唯一的相对依赖是 `bg.png`，一并复制过去）。它在 `files: src/**` 里 ⇒ 进 asar，
 *  `loadFile` 读 asar 内的页面没问题（bg.png 也照样能相对取到）。
 *  窗口**不带 node/预加载**：帮助页是纯静态内容，没必要给它任何能力。 */
let helpWin = null
function openHelp() {
  if (helpWin && !helpWin.isDestroyed()) { helpWin.show(); ensureWindowKeyboardFocus(helpWin, 'help'); return }
  helpWin = new BrowserWindow({
    width: 1180, height: 820, minWidth: 720, minHeight: 520,
    title: i18n.t('help.windowTitle'),
    autoHideMenuBar: true,
    backgroundColor: '#141117',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  helpWin.loadFile(path.join(__dirname, 'help', 'index.html'))
  helpWin.on('closed', () => { helpWin = null })
}

function showOrbContextMenu() {
  if (!orbWin || orbWin.isDestroyed()) return
  const menu = Menu.buildFromTemplate([
    { label: i18n.t('orb.menu.settings'), click: () => openSettings() },
    { label: i18n.t('orb.menu.toggleChat'), click: () => toggleOrbPanel() },
    // 🆕 帮助（与"设置"同级：新手第一眼要找的东西）
    { label: i18n.t('orb.menu.help'), click: () => openHelp() },
    { label: i18n.t('orb.menu.hideToTray'), click: () => hideOrbToTray() },
    { type: 'separator' },
    { label: i18n.t('orb.menu.quit'), click: () => quitApp() },
  ])
  // 不传 window / x / y：popup 默认在当前光标屏幕位置弹出（Electron 文档行为）。
  // 传坐标或 window 时存在窗口相对/屏幕坐标语义歧义，会导致菜单错位。
  menu.popup()
}

/** 悬浮球窗口是否可见（托盘菜单文案与"从托盘回来"都用它） */
function orbVisible() {
  return !!(orbWin && !orbWin.isDestroyed() && orbWin.isVisible())
}

/**
 * 隐藏到托盘（用户 2026-09-17 要求）：只 `hide()` 悬浮球，**不退出**——
 * 托盘图标、内嵌 host、桥链路、侧栏面板都照常活着；从托盘菜单/点托盘图标即可回来。
 * 不弹通知、不改焦点（用户既有要求：不抢焦点）。
 */
function hideOrbToTray() {
  if (!orbWin || orbWin.isDestroyed()) return
  orbWin.hide()
  refreshTrayMenu()                      // 托盘文案切成「显示悬浮球」
  console.log('[akdagent] 悬浮球已隐藏到托盘（进程照常运行）')
}

/** 从托盘把悬浮球显示回来。
 *
 *  ⚠️ 2026-09-25：这里必须用 **`showInactive()`**，不是 `show()`。
 *  用户报「刚启动后第一次开设置窗，输入框有光标但敲键没字」——那是**键盘焦点状态不同步**
 *  （OS 把键盘给了别的窗口，而设置窗的渲染进程还以为自己活着 ⇒ 还画着光标）。
 *  悬浮球是个 64px 的球、**不需要键盘焦点**，但 `show()` 会**激活**它 ⇒ 它常在启动/第二次实例
 *  （`second-instance` → 这里）把焦点从用户正在打字的窗口抢走。
 *  `showInactive()` = 显示但不激活：球照常出现在右下角，键盘焦点不动。
 *  （用户点球上的输入框时，点击本来就会激活它 ⇒ 对话面板不受影响。） */
function showOrbFromTray() {
  if (!orbWin || orbWin.isDestroyed()) {
    createOrbWindow()                    // 万一窗口被销毁过，重建一个
    refreshTrayMenu()
    return
  }
  if (typeof orbWin.showInactive === 'function') orbWin.showInactive()
  else orbWin.show()                     // 兜底（旧 Electron）
  refreshTrayMenu()
}

/** 显示/隐藏悬浮球（托盘菜单项） */
function toggleOrbWindow() {
  if (orbVisible()) hideOrbToTray()
  else showOrbFromTray()
}

/** 切换悬浮球自带的文本对话面板（orb.html 的 #chat-overlay），而非独立 DSH 窗口 */
function toggleOrbPanel() {
  if (!orbWin || orbWin.isDestroyed()) return
  // 从托盘回来时先把球显示出来，否则"点了没反应"（用户看不到任何变化）
  if (!orbWin.isVisible()) showOrbFromTray()
  orbWin.webContents.send('akdagent-toggle-orb-panel')
}

function quitApp() {
  quitting = true
  stopBridgePoll()               // 桥状态轮询（5s）停掉，别在退出路上还读心跳
  if (hostChild) killTree(hostChild.pid)
  app.quit()
}

// ── IPC ────────────────────────────────────────────────────────────
ipcMain.on('akdagent-toggle-chat', () => toggleOrbPanel())
ipcMain.on('akdagent-quit', () => quitApp())
ipcMain.on('akdagent-context-menu', () => showOrbContextMenu())

// ── 设置窗口 IPC ──────────────────────────────────────────────────
ipcMain.on('akdagent-request-status', () => { pushHostStatusToSettings() })

/** 打开聊天（设置页按钮）：切到悬浮球文本面板 */
ipcMain.on('akdagent-open-chat', () => toggleOrbPanel())

/** 检查桥连接（**真检查**，2026-09-13 重写）：
 *  旧实现只回内嵌 DSH host 状态 ⇒ 永远"已连接"，与 SV 桥无关（用户当场发现"一点就自己连上了"）。
 *  现在：心跳新鲜度（≤15s）+ 真实 ping 往返；sv 不灵则看 ix。 */
ipcMain.on('akdagent-check-bridge', async () => {
  const reply = (ok, msg) => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('akdagent-bridge-status', ok, msg)
    }
  }
  try {
    /* 先探**当前宿主**（最近在用的那台），再探另一台兜底 —— 原来写死 sv 优先，
     * 同时开两台时永远只报 SV（见 host-pick.js 的说明）。 */
    const [first, second] = orderCandidates(activeHost())
    const a = await probeBridge(first)
    const b = a.online ? null : await probeBridge(second)
    const hit = a.online ? a : (b && b.online ? b : null)
    if (hit) {
      const tag = hit.host === 'ix' ? 'IX' : 'SV'
      reply(true, i18n.t('main.bridge.online', tag, hit.hostName, hit.version) +
        i18n.t('main.bridge.onlineDetail', hit.bridge, hit.ageSec, hit.rttMs, hit.ops) +
        (hit.isSV2 === false ? i18n.t('main.bridge.sv1Tag') : ''))
      return
    }
    // 都不在线：把两座桥的最有价值原因拼出来
    const parts = []
    if (a.reason) parts.push(i18n.t('main.bridge.offlineDetail', first, a.reason))
    if (b && b.reason) parts.push(i18n.t('main.bridge.offlineDetail', second, b.reason))
    reply(false, parts.join(i18n.t('main.bridge.reasonSep')) || i18n.t('main.bridge.offline'))
  } catch (e) {
    reply(false, i18n.t('main.bridge.checkFailed', e.message))
  }
})

/** 读注册表：开机自启是否真的开着（HKCU Run）
 *  ⚠️ 值名 = **产品名**（2026-09-22 改名 AKDAgent；改名后旧值 `AKDAgent` 不再被读，属一次性残留） */
function getAutostartEnabled() {
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    const r = spawnSync('reg', ['query', key, '/v', 'AKDAgent'], { windowsHide: true })
    return r && r.status === 0 && String(r.stdout || '').includes('AKDAgent')
  } catch {
    return false
  }
}

/** 写注册表开关开机自启；返回**回读后的真实状态**（不信自己的写操作） */
function setAutostartEnabled(enabled) {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  const exe = process.execPath
  try {
    if (enabled) {
      spawnSync('reg', ['add', key, '/v', 'AKDAgent', '/t', 'REG_SZ', '/d', `"${exe}"`, '/f'], { windowsHide: true })
    } else {
      spawnSync('reg', ['delete', key, '/v', 'AKDAgent', '/f'], { windowsHide: true })
    }
  } catch {
    /* ignore */
  }
  return getAutostartEnabled()
}

/** 当前是否置顶（以悬浮球为准；它没了就看设置窗） */
function getAlwaysOnTop() {
  const w = [orbWin, settingsWin].find((x) => x && !x.isDestroyed())
  return w ? w.isAlwaysOnTop() : false
}

/** 向设置窗推送（未打开就丢弃） */
function sendToSettings(channel, ...args) {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send(channel, ...args)
}

/** 悬浮球/设置窗状态：设置页加载时主动查询，避免错过推送后按钮停在猜的文案上 */
ipcMain.handle('akdagent-get-orb-state', () => ({
  autostart: getAutostartEnabled(),
  alwaysOnTop: getAlwaysOnTop(),
}))

/** 开机自启开关（Windows：HKCU Run 注册表） */
ipcMain.on('akdagent-toggle-autostart', () => {
  const next = setAutostartEnabled(!getAutostartEnabled())
  sendToSettings('akdagent-autostart-changed', next)
})

/** 置顶开关：**必须回推新状态**——旧实现只改窗口、不回话，设置页按钮文案永远停在初始值，
 *  用户点完看不到任何变化（2026-09-13 用户报「置顶按钮点不动」） */
ipcMain.on('akdagent-toggle-always-top', () => {
  const next = !getAlwaysOnTop()
  for (const w of [orbWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.setAlwaysOnTop(next)
  }
  sendToSettings('akdagent-always-top-changed', next)
})

/** 悬浮球贴回当前屏幕右下角（拖丢/多屏变化后复位） */
ipcMain.on('akdagent-orb-reset-position', () => {
  if (!orbWin || orbWin.isDestroyed()) {
    sendToSettings('akdagent-orb-position-reset', false)
    return
  }
  const { workArea } = screen.getDisplayNearestPoint(orbWin.getBounds())
  const [w, h] = orbWin.getSize()
  orbWin.setBounds({
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + workArea.height - h - 24,
    width: w,
    height: h,
  })
  sendToSettings('akdagent-orb-position-reset', true)
})

ipcMain.on('akdagent-open-bridge-doc', () => {
  const { shell } = require('electron')
  // 开发模式打开仓库 README；打包后 README 不随应用分发，回退到打开应用目录
  // 相对本文件定位（只有开发态才有这个目录；**不要写死开发机绝对路径**）
  const devReadme = path.join(__dirname, '..', '..', 'README.md')
  if (fs.existsSync(devReadme)) {
    shell.openExternal('file:///' + devReadme.replace(/\\/g, '/'))
  } else {
    shell.openPath(path.dirname(process.execPath))
  }
})

ipcMain.handle('akdagent-get-version', () => {
  try {
    return require('../package.json').version
  } catch {
    return '1.0.1'
  }
})

// ── 设置读写（settings.yaml） ──────────────────────────────────────
/** 读取完整设置 + 展平常用项（模型列表/默认模型/语言/推理等级） */
ipcMain.handle('akdagent-get-settings', () => {
  const s = readSettings()
  const llm = s['llm-deepseek'] || {}
  const adm = s['agent-default-model'] || {}
  const locale = s['locale'] || {}
  return {
    raw: s,
    models: Array.isArray(llm.models) ? llm.models : [],
    defaultModel: adm.model || '',
    provider: adm.provider || '',
    reasoningEffort: adm.reasoningEffort || 'high',
    language: locale.preference || 'zh',
    theme: (s['ui-theme'] || {}).preference || 'dark',
  }
})

/** 更新默认模型（agent-default-model） */
ipcMain.handle('akdagent-set-default-model', (_e, modelId) => {
  const s = readSettings()
  const adm = s['agent-default-model'] || {}
  adm.model = modelId
  s['agent-default-model'] = adm
  writeSettings(s)
  return { ok: true, model: modelId }
})

/** 更新语言（locale.preference） */
ipcMain.handle('akdagent-set-language', (_e, lang) => {
  const s = readSettings()
  s['locale'] = { ...(s['locale'] || {}), preference: lang }
  writeSettings(s)
  return { ok: true, language: lang }
})

/** 更新推理等级（agent-default-model.reasoningEffort） */
ipcMain.handle('akdagent-set-reasoning-effort', (_e, level) => {
  const s = readSettings()
  const adm = s['agent-default-model'] || {}
  adm.reasoningEffort = level
  s['agent-default-model'] = adm
  writeSettings(s)
  return { ok: true, reasoningEffort: level }
})

// ── SV 集成（scripts 目录配置 + 桥脚本部署 + Agent 工作目录） ───────
/** settings.yaml 里 sv.scriptsDirs：多个 SV 版本的 scripts 目录列表 */
const SV_CONFIG_KEY = 'sv'

function getSvConfig() {
  const s = readSettings()
  const sv = s[SV_CONFIG_KEY] || {}
  const scriptsDirs = Array.isArray(sv.scriptsDirs) ? sv.scriptsDirs : []
  return { scriptsDirs }
}

function setSvConfig(cfg) {
  const s = readSettings()
  s[SV_CONFIG_KEY] = cfg
  writeSettings(s)
}

/** 每个 scripts 目录的派生信息（Agent 目录 = scripts 的上级 + Agent；桥脚本 = scripts/Agent 子目录）
 *  🆕 2026-09-25：一并给出**面板**的状态与"这个宿主要不要面板"，供设置页的目录列表显示徽标 + 手动部署。 */
function svDirInfo(scriptsDir) {
  const agentDir = path.join(path.dirname(scriptsDir), 'Agent')
  // ⛔ 只能部署 **Lua 桥**：旧的 JS 剪贴板桥已退役（`SVAgentBridge.js`，归档目录 `legacy/` 亦于 2026-09-19 删除），不得再分发/部署
  const bridgeTarget = path.join(scriptsDir, 'Agent', 'AKDAgentBridge.lua')
  const panelTarget = path.join(scriptsDir, 'Agent', 'AKDAgentPanel.js')
  const bundle = (p) => { try { return fs.readFileSync(p) } catch { return null } }
  const same = (a, b) => { const x = bundle(a), y = bundle(b); return !!(x && y && x.equals(y)) }
  const src = bridgeSourcePath()
  const pSrc = panelSourcePath()
  return {
    scriptsDir,
    agentDir,
    exists: fs.existsSync(scriptsDir),
    bridgeInstalled: fs.existsSync(bridgeTarget),
    // 面板（只有 SV2 / IX 需要）：是否已装、是否与随包那份一致、这个目录该不该装
    kind: hostKindOfScriptsDir(scriptsDir),
    panelInstalled: fs.existsSync(panelTarget),
    panelCurrent: same(panelTarget, pSrc),
    panelWanted: wantsPanel(scriptsDir),
    bridgePath: bridgeTarget,
    panelPath: panelTarget,
    bridgeSource: src,
  }
}

/** 桥脚本源：打包后取 resources/assets，开发模式取仓库 sv/lua 目录（electron/ 的上一级） */
function bridgeSourcePath() {
  const bundled = path.join(process.resourcesPath, 'assets', 'AKDAgentBridge.lua')
  if (fs.existsSync(bundled)) return bundled
  const dev = path.join(__dirname, '..', '..', 'sv', 'lua', 'AKDAgentBridge.lua')
  return fs.existsSync(dev) ? dev : null
}

/** 面板脚本源（2026-09-25 加）：与桥同样的取法（打包后 resources/assets，开发态仓库 sv/panel） */
function panelSourcePath() {
  const bundled = path.join(process.resourcesPath, 'assets', 'AKDAgentPanel.js')
  if (fs.existsSync(bundled)) return bundled
  const dev = path.join(__dirname, '..', '..', 'sv', 'panel', 'AKDAgentPanel.js')
  return fs.existsSync(dev) ? dev : null
}

/** 从一个 scripts 目录**认宿主**（2026-09-25）—— 决定要不要给它装面板。
 *
 *  为什么必须认：面板是 **JS 侧栏脚本（SidePanelSection）**，只有 **SV2 / IX** 有侧栏；
 *  **SV1 与 OPSV（SV1 引擎）没有侧栏、也没有 `project scriptData`** ⇒ 面板在那边没意义，
 *  而且 SV1 的脚本菜单会把 `scripts\Agent\` 里的 `.js` 也列出来 ⇒ 多一个"点了就出事"的菜单项
 *  （用户 2026-09-25 明确：面板误放到 SV1 **会**出问题）⇒ **不装**。
 *  ⚠️ **认不出来的一律不装**（默认拒绝）：宁可少装一个文件，也不往未知宿主里塞一个会崩的脚本。
 *  返回 'sv1' | 'sv2' | 'ix' | 'opsv' | null */
function hostKindOfScriptsDir(dir) {
  const p = String(dir || '').replace(/[\\/]+/g, '/').toLowerCase()
  if (!p) return null
  if (p.includes('/instrument x/')) return 'ix'
  if (p.includes('/synthesizer v studio 2/')) return 'sv2'
  if (p.includes('/opsv/')) return 'opsv'                       // 便携(flat)版 = SV1 引擎
  if (p.includes('/synthesizer v studio/')) return 'sv1'
  return null
}
/** 这个 scripts 目录要不要装面板（只有 sv2 / ix 要） */
function wantsPanel(dir) {
  const k = hostKindOfScriptsDir(dir)
  return k === 'sv2' || k === 'ix'
}

/** 自动检测常见 SV scripts 目录（SV1 文档目录 / SV2 AppData / OPSV 便携版等） */
ipcMain.handle('akdagent-scan-sv-scripts', () => {
  const user = HOME_DIR
  const appdata = process.env.APPDATA || path.join(user, 'AppData', 'Roaming')
  const candidates = [
    path.join(user, 'Documents', 'Dreamtonics', 'Synthesizer V Studio', 'scripts'),
    path.join(appdata, 'Dreamtonics', 'Synthesizer V Studio 2', 'scripts'),
    path.join(user, 'Documents', 'Dreamtonics', 'Synthesizer V Studio 2', 'scripts'),
    path.join(user, 'Documents', 'OPSV', 'Dreamtonics', 'Synthesizer V Studio', 'scripts'),
    path.join(appdata, 'Dreamtonics', 'Instrument X', 'scripts'),
  ]
  const found = [...new Set(candidates)].filter((p) => fs.existsSync(p))
  return { found }
})

/** 读取完整 SV 集成配置 */
ipcMain.handle('akdagent-get-sv-config', () => {
  const cfg = getSvConfig()
  return {
    scriptsDirs: cfg.scriptsDirs,
    entries: cfg.scriptsDirs.map(svDirInfo),
    bridgeSource: bridgeSourcePath(),
    panelSource: panelSourcePath(),
  }
})

/** 添加一个 scripts 目录（去重） */
ipcMain.handle('akdagent-add-sv-scripts-dir', (_e, dir) => {
  const d = String(dir || '').trim().replace(/\/+$/, '')
  if (!d) return { ok: false, error: i18n.t('main.sv.dirEmpty') }
  const cfg = getSvConfig()
  if (cfg.scriptsDirs.includes(d)) return { ok: true, already: true }
  cfg.scriptsDirs = [...cfg.scriptsDirs, d]
  setSvConfig(cfg)
  return { ok: true, entries: cfg.scriptsDirs.map(svDirInfo) }
})

/** 移除一个 scripts 目录 */
ipcMain.handle('akdagent-remove-sv-scripts-dir', (_e, dir) => {
  const cfg = getSvConfig()
  cfg.scriptsDirs = cfg.scriptsDirs.filter((d) => d !== dir)
  setSvConfig(cfg)
  return { ok: true, entries: cfg.scriptsDirs.map(svDirInfo) }
})

/** 一键部署：对每个 scripts 目录
 *   ① 复制桥脚本（AKDAgentBridge.lua）—— **所有**目录（SV1 / SV2 / IX / OPSV 都要）
 *   ② **只有 SV2 / IX** 额外复制侧栏面板（AKDAgentPanel.js）；SV1 / OPSV 与认不出的目录跳过
 *      （理由见 hostKindOfScriptsDir 的注释：那两个宿主没有侧栏 ⇒ 面板会是个"点了就出事"的菜单项）
 *   ③ 清掉退役的 Lua 面板（AKDAgentPanel.lua）—— 旧版本遗留，留着同样是菜单地雷（先备份）
 *   ④ 创建 Agent 工作目录（提取的伴奏 / 日志等） */
ipcMain.handle('akdagent-deploy-sv-bridge', () => {
  const src = bridgeSourcePath()
  const panelSrc = panelSourcePath()
  const cfg = getSvConfig()
  const results = cfg.scriptsDirs.map((scriptsDir) => {
    const r = { scriptsDir, kind: hostKindOfScriptsDir(scriptsDir), ok: false, error: '', steps: [], panel: 'skipped' }
    try {
      if (!src) throw new Error(i18n.t('main.deploy.srcMissing'))
      if (!fs.existsSync(scriptsDir)) throw new Error(i18n.t('main.deploy.dirMissing'))
      // 1) 桥脚本 → <scriptsDir>/Agent/AKDAgentBridge.lua（scripts 下子目录，SV 可读到）
      const targetDir = path.join(scriptsDir, 'Agent')
      fs.mkdirSync(targetDir, { recursive: true })
      const target = path.join(targetDir, 'AKDAgentBridge.lua')
      fs.copyFileSync(src, target)
      r.steps.push(i18n.t('main.deploy.bridgeStep', target))
      // 2) 侧栏面板：只有 SV2 / IX 装
      if (wantsPanel(scriptsDir)) {
        if (!panelSrc) {
          r.panel = 'missing-src'
          r.steps.push(i18n.t('main.deploy.panelNoSrc'))
        } else {
          const panelTarget = path.join(targetDir, 'AKDAgentPanel.js')
          fs.copyFileSync(panelSrc, panelTarget)
          r.panel = 'deployed'
          r.steps.push(i18n.t('main.deploy.panelStep', panelTarget))
        }
      } else {
        r.panel = 'skipped'
        r.steps.push(i18n.t('main.deploy.panelSkipped', r.kind || 'unknown'))
      }
      // 3) 退役的 Lua 面板（曾经的面板方案，2026-09-15 换成 JS）：留着就是菜单地雷 ⇒ 备份后删掉
      const retired = path.join(targetDir, 'AKDAgentPanel.lua')
      if (fs.existsSync(retired)) {
        const bak = retired + '.bak-retired-' + new Date().toISOString().slice(0, 10)
        try { fs.copyFileSync(retired, bak); fs.rmSync(retired, { force: true }); r.steps.push(i18n.t('main.deploy.retiredPanelStep', bak)) }
        catch (e) { r.steps.push(i18n.t('main.deploy.retiredPanelFail', e.message)) }
      }
      // 4) Agent 工作目录（提取的伴奏 / 日志等）
      const agentDir = path.join(path.dirname(scriptsDir), 'Agent')
      fs.mkdirSync(agentDir, { recursive: true })
      r.steps.push(i18n.t('main.deploy.agentStep', agentDir))
      r.ok = true
    } catch (e) {
      r.error = e.message
    }
    return r
  })
  return { results, bridgeSource: src, panelSource: panelSrc }
})

/** 🆕 2026-09-25（用户：可以在目录列表里手动部署面板）—— **单个目录**单独部署一个文件。
 *  与"一键部署"的区别：这里**尊重手动意愿**，不做宿主推断拦截；
 *  认不出/认出是 SV1·OPSV 而用户仍要装面板时，**照装**但在结果里带一条明确警告（用户自己决定）。 */
ipcMain.handle('akdagent-deploy-sv-file', (_e, dir, what) => {
  const steps = []
  const scriptsDir = String(dir || '')
  const kind = hostKindOfScriptsDir(scriptsDir)
  try {
    if (!scriptsDir) throw new Error(i18n.t('main.deploy.dirMissing'))
    if (!fs.existsSync(scriptsDir)) throw new Error(i18n.t('main.deploy.dirMissing'))
    const targetDir = path.join(scriptsDir, 'Agent')
    fs.mkdirSync(targetDir, { recursive: true })
    if (what === 'panel') {
      const src = panelSourcePath()
      if (!src) throw new Error(i18n.t('main.deploy.panelNoSrc'))
      const target = path.join(targetDir, 'AKDAgentPanel.js')
      fs.copyFileSync(src, target)
      steps.push(i18n.t('main.deploy.panelStep', target))
      if (!wantsPanel(scriptsDir)) steps.push(i18n.t('main.deploy.panelForcedWarn', kind || 'unknown'))
    } else {
      const src = bridgeSourcePath()
      if (!src) throw new Error(i18n.t('main.deploy.srcMissing'))
      const target = path.join(targetDir, 'AKDAgentBridge.lua')
      fs.copyFileSync(src, target)
      steps.push(i18n.t('main.deploy.bridgeStep', target))
    }
    return { ok: true, steps, kind, info: svDirInfo(scriptsDir) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), steps, kind }
  }
})

// ── SV Flat 版（数据目录）检测 + nofs JSON 读写 ────────────────────
/** flat 版数据目录候选位置（自动探测：找到含 JSON nofs 的 databases 即确认） */
function candidateFlatDirs() {
  const user = HOME_DIR
  const appdata = process.env.APPDATA || path.join(user, 'AppData', 'Roaming')
  const docs = path.join(user, 'Documents')
  const dirs = [
    path.join(docs, 'OPSV', 'Dreamtonics', 'Synthesizer V Studio'),
    path.join(docs, 'Dreamtonics', 'Synthesizer V Studio Flat'),
    path.join(appdata, 'Dreamtonics', 'Synthesizer V Studio Flat'),
    path.join(docs, 'Synthesizer V Studio Flat'),
  ]
  // 追加设置页配置的 scripts 目录的上级（用户可能把 flat 装在任何位置）
  try {
    const sv = readSettings()['sv'] || {}
    if (Array.isArray(sv.scriptsDirs)) {
      for (const sd of sv.scriptsDirs) {
        // scripts 的上级 + "Synthesizer V Studio Flat"/原目录名
        const parent = path.dirname(String(sd))
        dirs.push(path.join(parent, 'Synthesizer V Studio Flat'))
        dirs.push(parent)  // scripts 上级可能就是数据根（scripts/ 与 databases/ 同级）
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(dirs.map((d) => d.replace(/[\\/]+$/, '')))]
}

/** 探测 flat 数据目录：候选位置中找 databases 且任一 nofs 是 JSON */
function findFlatDataDir() {
  for (const root of candidateFlatDirs()) {
    const dbDir = path.join(root, 'databases')
    if (!fs.existsSync(dbDir)) continue
    try {
      const dir = fs.readdirSync(dbDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(dbDir, d.name))
        .find((d) => fs.readdirSync(d).some((f) => f.endsWith('.nofs')))
      if (dir) {
        const file = fs.readdirSync(dir).find((f) => f.endsWith('.nofs'))
        // 去空白后以 { 开头（兼容美化 JSON 的 {\r\n 与紧凑 {"）
        const head = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\s/g, '').slice(0, 1)
        if (head === '{') return { dataDir: root, dbDir }
      }
    } catch {
      /* 该候选不可读，跳过 */
    }
  }
  return null
}

/** 检测当前是否运行 flat 版：进程 + 数据目录 + nofs JSON 三重信号 */
function detectFlatSv() {
  let proc = false
  // ⚠️ `synthv-flat.exe` 与 tasklist 都是 Windows 专属：mac 上直接跳过（以前靠 spawnSync 抛错被
  //    catch 兜住，虽然不崩，但"用异常当控制流"会掩盖真问题）。mac 只靠数据目录信号判断。
  if (process.platform === 'win32') {
    try {
      proc = !!spawnSync('tasklist', ['/FI', 'IMAGENAME eq synthv-flat.exe', '/NH'], { windowsHide: true })
        .stdout.toString().includes('synthv-flat')
    } catch {
      proc = false
    }
  }
  const found = findFlatDataDir()
  const dataDir = found ? found.dataDir : ''
  const dbDir = found ? found.dbDir : ''
  const dirExists = !!found
  const nofsJson = !!found
  return { isFlat: proc || dirExists, proc, dirExists, nofsJson, dataDir, dbDir }
}

/** flat 状态（设置页 SV 集成用） */
ipcMain.handle('akdagent-sv-flat-status', () => {
  const s = detectFlatSv()
  if (!s.isFlat) return { ok: true, isFlat: false }
  const dbs = fs.existsSync(s.dbDir)
    ? fs.readdirSync(s.dbDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const nofs = fs.readdirSync(path.join(s.dbDir, d.name)).filter((f) => f.endsWith('.nofs'))
          return { name: d.name, nofs: nofs.map((f) => ({ file: f, path: path.join(s.dbDir, d.name, f) })) }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : []
  return { ok: true, isFlat: true, proc: s.proc, nofsJson: s.nofsJson, dataDir: s.dataDir, dbDir: s.dbDir, databases: dbs }
})

/** 弹出系统目录选择器（用户 2026-09-14 要求：目录输入框留空时走这里，别逼人手打路径）。
 *  父窗口传 settingsWin ⇒ 模态挂在设置窗上；取消返回 { ok:false, cancelled:true }。*/
ipcMain.handle('akdagent-pick-directory', async (_e, opts) => {
  const o = opts && typeof opts === 'object' ? opts : {}
  const defaultPath = o.defaultPath || path.join(HOME_DIR, 'Documents')
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined
  const args = {
    title: o.purpose === 'scripts' ? i18n.t('main.sv.pickScriptsTitle') : i18n.t('main.sv.pickDirTitle'),
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: i18n.t('main.sv.pickDirButton'),
  }
  try {
    const r = parent ? await dialog.showOpenDialog(parent, args) : await dialog.showOpenDialog(args)
    if (r.canceled || !r.filePaths || !r.filePaths.length) return { ok: false, cancelled: true }
    return { ok: true, path: r.filePaths[0] }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 列出全部声库的 styles（只给"名字 + vocoder + 路径"，**不返回 data**，
 *  选中后再按路径 readNofs 取具体条目——避免一次把 1000+ 条 256 hex 全塞给渲染层）。
 *  用途：编辑 nofs 时"从现有 style 复制"，**页面按 vocoder 过滤**（跨 vocoder 不可移植）。 */
let flatStylesCache = null   // { at, dir, items }；写文件后失效
ipcMain.handle('akdagent-list-flat-styles', () => {
  try {
    const found = findFlatDataDir()
    if (!found) return { ok: false, error: i18n.t('main.flat.noDataDir') }
    const now = Date.now()
    if (flatStylesCache && flatStylesCache.dir === found.dataDir && now - flatStylesCache.at < 30000) {
      return { ok: true, dataDir: found.dataDir, items: flatStylesCache.items, cached: true }
    }
    const items = []
    for (const d of fs.readdirSync(found.dbDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const dir = path.join(found.dbDir, d.name)
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.nofs'))) {
        try {
          const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
          if (!Array.isArray(o.styles) || !o.styles.length) continue
          items.push({
            db: d.name,
            file: f,
            path: path.join(dir, f),
            vocoder: String(o.vocoder || ''),
            styles: o.styles.map((s) => String(s && s.name)).filter(Boolean),
          })
        } catch {
          /* 非 JSON / 损坏的声库跳过 */
        }
      }
    }
    flatStylesCache = { at: now, dir: found.dataDir, items }
    return { ok: true, dataDir: found.dataDir, items, cached: false }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 读 nofs（JSON 解析） */
ipcMain.handle('akdagent-read-nofs', (_e, nofsPath) => {
  try {
    const p = String(nofsPath || '')
    const found = findFlatDataDir()
    const root = found ? found.dataDir : ''
    if (!root || !p || !p.includes(root) || !p.endsWith('.nofs')) {
      return { ok: false, error: i18n.t('main.flat.badPath') }
    }
    if (!fs.existsSync(p)) return { ok: false, error: i18n.t('main.flat.noFile') }
    const raw = fs.readFileSync(p, 'utf8')
    let data
    try { data = JSON.parse(raw) } catch { return { ok: false, error: i18n.t('main.flat.badJson') } }
    return { ok: true, path: p, data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 写 nofs（先备份 .bak，再写美化 JSON） */
ipcMain.handle('akdagent-write-nofs', (_e, nofsPath, data) => {
  try {
    const p = String(nofsPath || '')
    const found = findFlatDataDir()
    const root = found ? found.dataDir : ''
    if (!root || !p || !p.includes(root) || !p.endsWith('.nofs')) {
      return { ok: false, error: i18n.t('main.flat.badPath') }
    }
    if (!fs.existsSync(p)) return { ok: false, error: i18n.t('main.flat.noFile') }
    if (data === undefined || data === null || typeof data !== 'object') {
      return { ok: false, error: i18n.t('main.flat.badData') }
    }
    // 备份
    const bak = p + '.bak'
    if (!fs.existsSync(bak)) fs.copyFileSync(p, bak)
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
    flatStylesCache = null   // 刚写过的文件要让"从现有 style 复制"重新扫（新条目立刻可选）
    return { ok: true, path: p, backup: bak }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 添加模型（llm-deepseek.models）；同 id 覆盖更新 */
ipcMain.handle('akdagent-add-model', (_e, m) => {
  const s = readSettings()
  const llm = s['llm-deepseek'] || {}
  const models = Array.isArray(llm.models) ? llm.models.slice() : []
  const entry = { id: String(m.id || '').trim() }
  if (!entry.id) return { ok: false, error: i18n.t('main.model.idEmpty') }
  if (m.name) entry.name = String(m.name).trim()
  if (m.description) entry.description = String(m.description).trim()
  if (m.supportsImage) entry.input = ['text', 'image']
  const idx = models.findIndex((x) => x.id === entry.id)
  if (idx >= 0) models[idx] = entry
  else models.push(entry)
  llm.models = models
  s['llm-deepseek'] = llm
  writeSettings(s)
  return { ok: true, model: entry, models }
})

/** 删除模型；若为当前默认模型则默认模型置空 */
ipcMain.handle('akdagent-remove-model', (_e, id) => {
  const s = readSettings()
  const llm = s['llm-deepseek'] || {}
  const models = Array.isArray(llm.models) ? llm.models.filter((x) => x.id !== id) : []
  llm.models = models
  s['llm-deepseek'] = llm
  const adm = s['agent-default-model'] || {}
  if (adm.model === id) {
    adm.model = models.length > 0 ? models[0].id : ''
    s['agent-default-model'] = adm
  }
  writeSettings(s)
  return { ok: true, defaultModel: adm.model || '', models }
})

// ── 提供方管理（模型页） ──────────────────────────────────────────
const CREDENTIALS_PATH = path.join(HOME_DIR, '.dsh', '.credentials.yaml')

function readCredentials() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return {}
    return yaml.load(fs.readFileSync(CREDENTIALS_PATH, 'utf8')) || {}
  } catch {
    return {}
  }
}

function writeCredentials(obj) {
  const dir = path.dirname(CREDENTIALS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const out = yaml.dump(obj, { indent: 2, lineWidth: -1 })
  fs.writeFileSync(CREDENTIALS_PATH, out, 'utf8')
  mirrorDshFileToIsolatedHome('.credentials.yaml', out)
}

/** 常见 pi-ai 提供方预设（route id → 显示名）。完整目录在 pi-ai 内建 data，这里只列常用。 */
const PI_AI_PROVIDER_PRESETS = [
  'openai', 'anthropic', 'google', 'groq', 'mistral', 'openrouter',
  'xai', 'moonshotai', 'deepseek', 'cerebras', 'together', 'huggingface',
]

/** 读取所有提供方（DeepSeek 专用 + pi-ai routes）及密钥状态 */
ipcMain.handle('akdagent-get-providers', () => {
  const s = readSettings()
  const creds = readCredentials()
  const adm = s['agent-default-model'] || {}
  const llmDeepseek = s['llm-deepseek'] || {}
  const piAi = s['llm-pi-ai'] || {}
  const piProviders = (piAi.providers || {})

  const providers = []

  // DeepSeek 专用插件路由（llm-deepseek 命名空间，provider id = deepseek-official）
  providers.push({
    id: 'deepseek-official',
    displayName: 'DeepSeek',
    namespace: 'llm-deepseek',
    kind: 'deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    hasKey: !!getCred(creds, 'DEEPSEEK_API_KEY'),
    models: Array.isArray(llmDeepseek.models) ? llmDeepseek.models : [],
    defaultModel: adm.provider === 'deepseek-official' ? adm.model : '',
    isDefault: adm.provider === 'deepseek-official',
  })

  // pi-ai routes（llm-pi-ai.providers.<route>）
  for (const [route, profile] of Object.entries(piProviders)) {
    const p = profile || {}
    const keyEnv = p.apiKeyEnv || ''
    providers.push({
      id: route,
      displayName: p.displayName || route,
      namespace: 'llm-pi-ai',
      kind: 'pi-ai',
      apiKeyEnv: keyEnv,
      hasKey: !!keyEnv && !!getCred(creds, keyEnv),
      models: Array.isArray(p.models) ? p.models : [],
      baseURL: p.baseURL || '',
      api: p.api || '',
      defaultModel: adm.provider === route ? adm.model : '',
      isDefault: adm.provider === route,
    })
  }

  return {
    providers,
    defaultProvider: adm.provider || '',
    defaultModel: adm.model || '',
    reasoningEffort: adm.reasoningEffort || 'high',
    language: (s['locale'] || {}).preference || 'zh',
    presets: PI_AI_PROVIDER_PRESETS,
    credentialKeys: Object.keys(creds).map((k) => ({ key: k, configured: true })),
  }
})

/** 设置某个提供方为默认（agent-default-model.provider/model） */
ipcMain.handle('akdagent-set-default-provider', (_e, providerId, modelId) => {
  const s = readSettings()
  s['agent-default-model'] = {
    ...(s['agent-default-model'] || {}),
    provider: providerId,
    model: modelId || (s['agent-default-model'] || {}).model || '',
  }
  writeSettings(s)
  return { ok: true, provider: providerId, model: modelId }
})

/** 更新提供方 API 密钥（写 credentials.yaml；keyEnv 为空时按命名空间推断） */
ipcMain.handle('akdagent-set-provider-key', (_e, providerId, keyEnv, keyValue) => {
  const env = keyEnv || 'DEEPSEEK_API_KEY'
  const creds = readCredentials()
  if (keyValue && keyValue.trim()) {
    setCred(creds, env, keyValue.trim())      // 新格式 ⇒ refs；老格式 ⇒ 顶层
  } else {
    delCred(creds, env)
  }
  writeCredentials(creds)
  return { ok: true, apiKeyEnv: env, configured: !!getCred(creds, env) }
})

/** 添加 pi-ai 提供方（预设 route：只写 apiKeyEnv + displayName，模型用内建目录） */
ipcMain.handle('akdagent-add-pi-provider', (_e, route, opts) => {
  const s = readSettings()
  const piAi = s['llm-pi-ai'] || {}
  const providers = { ...(piAi.providers || {}) }
  if (providers[route]) return { ok: false, error: i18n.t('main.provider.exists', route) }
  const profile = {
    displayName: (opts && opts.displayName) || route,
  }
  if (opts && opts.apiKeyEnv) profile.apiKeyEnv = opts.apiKeyEnv
  if (opts && opts.baseURL) profile.baseURL = opts.baseURL
  if (opts && opts.api) profile.api = opts.api
  providers[route] = profile
  piAi.providers = providers
  s['llm-pi-ai'] = piAi
  writeSettings(s)
  return { ok: true }
})

/** 删除 pi-ai 提供方；DeepSeek 专用提供方不可删 */
ipcMain.handle('akdagent-remove-pi-provider', (_e, route) => {
  const s = readSettings()
  const piAi = s['llm-pi-ai'] || {}
  const providers = { ...(piAi.providers || {}) }
  delete providers[route]
  piAi.providers = providers
  s['llm-pi-ai'] = piAi
  const adm = s['agent-default-model'] || {}
  if (adm.provider === route) {
    adm.provider = ''
    adm.model = ''
    s['agent-default-model'] = adm
  }
  writeSettings(s)
  return { ok: true }
})

/** 编辑 pi-ai 提供方的模型列表（models 数组） */
ipcMain.handle('akdagent-update-pi-models', (_e, route, models) => {
  const s = readSettings()
  const piAi = s['llm-pi-ai'] || {}
  const providers = { ...(piAi.providers || {}) }
  const p = providers[route]
  if (!p) return { ok: false, error: i18n.t('main.provider.notFound', route) }
  p.models = Array.isArray(models) ? models : []
  providers[route] = p
  piAi.providers = providers
  s['llm-pi-ai'] = piAi
  writeSettings(s)
  return { ok: true }
})

/** 🆕 2026-09-25（用户选 B）：改 pi-ai 提供方的**覆写字段** —— Base URL / API 协议 / 模型列表。
 *
 *  语义（关键）：**有值 ⇒ 写；null / '' / [] ⇒ 删掉该键**（= 回到提供方内建默认）。
 *  为什么必须"删"而不是写空串：内建目录（baseURL / api / 模型）都在 pi-ai 插件里，
 *  写 `baseURL: ''` 会被当成"显式空地址"而不是"没覆写" ⇒ 请求当场坏。
 *  profile 形状 = settings.yaml 的 `llm-pi-ai.providers.<route>`（getProviders 里同名字段读回）。 */
ipcMain.handle('akdagent-set-pi-provider-fields', (_e, route, fields) => {
  const s = readSettings()
  const piAi = s['llm-pi-ai'] || {}
  const providers = { ...(piAi.providers || {}) }
  const cur = providers[route]
  if (!cur) return { ok: false, error: i18n.t('main.provider.notFound', route) }
  const next = { ...cur }
  const applied = []
  for (const f of ['baseURL', 'api', 'models']) {
    if (!fields || !(f in fields)) continue
    const v = fields[f]
    const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) {
      if (f in next) { delete next[f]; applied.push('-' + f) }
    } else if (f === 'models') {
      next.models = Array.isArray(v) ? v : []
      applied.push('+' + f + ':' + next.models.length)
    } else {
      next[f] = String(v)
      applied.push('+' + f)
    }
  }
  providers[route] = next
  piAi.providers = providers
  s['llm-pi-ai'] = piAi
  writeSettings(s)
  return { ok: true, applied, profile: next }
})

let dragTimer = null
ipcMain.on('akdagent-drag-start', () => {
  if (!orbWin) return
  const [x, y] = orbWin.getPosition()
  const cursor = screen.getCursorScreenPoint()
  // 绝对坐标法：记录按下时光标与窗口的偏移（getCursorScreenPoint 为 DIP，与 setPosition 一致）
  dragOffset = { dx: cursor.x - x, dy: cursor.y - y }
  // 主进程定时轮询光标定位——完全不依赖渲染层 mousemove 事件流
  // （窗口移动会污染渲染层事件坐标，快速拖动时事件驱动版会偏移；
  //   轮询每 8ms 直接问 OS 光标位置，稳定不漂移）
  clearInterval(dragTimer)
  dragTimer = setInterval(() => {
    if (!dragOffset || !orbWin || orbWin.isDestroyed()) return
    const c = screen.getCursorScreenPoint()
    const tx = c.x - dragOffset.dx
    const ty = c.y - dragOffset.dy
    const [px, py] = orbWin.getPosition()
    if (tx !== px || ty !== py) {
      orbWin.setPosition(tx, ty)
    }
  }, 8)
})
ipcMain.on('akdagent-drag-move', () => {
  // 渲染层无需传坐标；轮询由 drag-start 启动的定时器驱动
})
ipcMain.on('akdagent-drag-end', () => {
  dragOffset = null
  clearInterval(dragTimer)
  dragTimer = null
})

// ── 动态窗口尺寸（右下角锚定：右缘固定、宽度增长时左移；下缘固定、高度增长时上移） ──
ipcMain.on('akdagent-resize', (_e, w, h) => {
  if (!orbWin || orbWin.isDestroyed()) return
  if (dragOffset) return // 拖动中冻结 resize：窗口尺寸变化会使 dragOffset 失效，球漂移
  const [cw, ch] = orbWin.getSize()
  w = Math.max(64, Math.round(w))
  h = Math.max(64, Math.round(h))
  if (w === cw && h === ch) return
  const [x, y] = orbWin.getPosition()
  // 右下角锚定：宽增左移、高增上移；缩回时右缘/下缘保持
  let newX = x + cw - w
  let newY = y - (h - ch)
  // 关键修复：clamp 到工作区，防止窗口位置漂移出屏幕（球体被切一半）
  const { workArea } = screen.getDisplayNearestPoint({ x, y })
  const maxX = workArea.x + workArea.width - w
  const maxY = workArea.y + workArea.height - h
  newX = Math.max(workArea.x, Math.min(newX, maxX))
  newY = Math.max(workArea.y, Math.min(newY, maxY))
  orbWin.setBounds({ x: newX, y: newY, width: w, height: h })
})

// ── 点击穿透开关（渲染层根据鼠标位置调用） ──
ipcMain.on('akdagent-set-ignore', (_e, ignore) => {
  if (!orbWin || orbWin.isDestroyed()) return
  orbWin.setIgnoreMouseEvents(!!ignore, { forward: true })
})

// ── DSH Agent 代理（orb 对话面板真实对话通道） ───────────────────────
/* 契约（2026-09-21 换代：0.1.0-rc.5 的 apiproxy → 0.1.5-rc.2 的 Typert RPC）
 *
 * 旧版（已废，会 404）：
 *   POST /api/<method>        body {type:'client-request',rpcId,method,payload:<args 无壳>}
 *   POST /api/respond         body {type:'client-response',rpcId,result:{ok,value}}
 *   ws  /api/events.mux       帧 {type:'server-request',rpcId,method,payload:{type:…}}
 *
 * 新版（实测于 0.1.5-rc.2）：
 *   · 一元：POST /api/<endpoint>   body {type:'client-request',rpcId,method,payload:{args}}
 *       - 端点**斜杠式**且**进路径**：/api/session/list、/api/session/create、/api/skills/list…
 *       - args 按**描述符参数名**装：多数是 `request`，session/list 是 `_request`，
 *         无参端点（session/canOpenWorkspacePath、session/modelCatalog）用 `{}`。
 *       - 形如 fileReferences/list 有两个位置参数时并列进 args。
 *       → {type:'server-response',rpcId,result:{ok:true,value}|{ok:false,error:{code,message,details}}}
 *     错误码：gateway/arguments-invalid（args 字段不符）、gateway/input-invalid（值超界）…
 *   · 流：ws://127.0.0.1:<port>/api/remote.mux
 *       客户端发 {type:'open',streamId,endpoint,payload:{args}} / {type:'cancel',streamId}
 *       主机回   {type:'item',streamId,value} | {type:'error',streamId,error} | {type:'end',streamId}
 *       - 应用事件流 endpoint='$events'：首帧 value={type:'ready',clientId,host:{home}}，
 *         随后 {type:'emit',event,args} / {type:'waterfall',event,eventId,agentId,request} /
 *         {type:'cancel',eventId}
 *       - 会话日志流 endpoint='session/follow'：首帧 value={type:'snapshot',header,cursor,records,…}
 *         （records = 历史！随后 {type:'event',event} 与 {type:'assistant-stream',frame}）
 *   · waterfall 回执：一元 endpoint '$events/result'
 *       payload {args:{request:{clientId,eventId,outcome:{kind:'result'|'next'|'rejected',…}}}}
 *
 * 适配策略：**在 main.js 内把新帧翻译回旧帧形状**再交给 orb/panelBridge
 *   ⇒ 渲染层（orb.html / panel-bridge.js）一行不用改。
 * 鉴权：HTTP 与 WS 都必须带会话 cookie（见上面 httpGet/establishHostSession）。
 * 信任栅栏：不发送 Origin 头（node:http / ws 默认不带，天然通过）。 */
const MUX_PATH = '/api/remote.mux'
const EVENT_STREAM_ENDPOINT = '$events'          // 应用事件（审批/提问 waterfall）
const EVENT_RESULT_ENDPOINT = '$events/result'   // waterfall 回执的一元端点
const FOLLOW_ENDPOINT = 'session/follow'         // 会话日志（历史快照 + 实时事件）

function agentRpcId() {
  agentRpcSeq += 1
  return `svh-${Date.now()}-${agentRpcSeq}`
}

/** 一元 RPC：POST /api/<endpoint>；成功返回 result.value，失败抛错（err.code 带宿主错误码） */
function dshCall(endpoint, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!hostPort) return reject(new Error(i18n.t('main.agent.hostNotReady')))
    const body = JSON.stringify({
      type: 'client-request',
      rpcId: agentRpcId(),
      method: endpoint,
      payload: { args: args || {} },
    })
    const req = http.request(
      { host: '127.0.0.1', port: hostPort, path: `/api/${endpoint}`, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(hostCookie ? { Cookie: hostCookie } : {}),
        } },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            const j = JSON.parse(d)
            if (j && j.type === 'server-response') {
              if (j.result && j.result.ok) return resolve(j.result.value)
              const e = (j.result && j.result.error) || {}
              const err = new Error(e.message || e.code || `${endpoint} failed`)
              err.code = e.code
              err.details = e.details
              return reject(err)
            }
            reject(new Error(`${endpoint}: unexpected response`))
          } catch (e) { reject(e) }
        })
      },
    )
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`${endpoint}: timeout`)) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/** session/prompt 的 requestId：新版要求**客户端自铸**（用于乐观消息与持久消息对账） */
function agentRequestId() {
  agentRpcSeq += 1
  return `svp-${Date.now()}-${agentRpcSeq}`
}

/** 组一份 session/prompt 的 args（新版的参数名是 request，且多了必填 requestId） */
function promptArgs(sessionId, text, mode = 'queue') {
  let tz
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* 取不到就不带 */ }
  return { request: {
    requestId: agentRequestId(),
    sessionId,
    mode,                                   // 'queue' 排队 | 'steer' 插话
    content: [{ type: 'text', text: String(text) }],
    ...(tz ? { clientTimeZone: tz } : {}),
  } }
}

/* ── waterfall 回执 + 历史 + 新帧→旧帧适配 ───────────────────────────
 * waterfall（审批/提问）是 Host 推给客户端的**带应答**事件：新帧只带 eventId，
 * 回执必须带上首帧 ready 给的 clientId。这里登记 eventId → {clientId,kind}，
 * dshRespond 再按旧形状（orb 传什么）翻成 {clientId,eventId,outcome}。 */
const agentPendingEvents = new Map()   // eventId → { clientId, kind, at }
let agentEventClientId = null          // $events 流首帧 ready 给的 clientId

/** 应答 approval/question（参数沿用旧形状；内部翻成 $events/result 的 RemoteEventResult） */
function dshRespond(eventId, value) {
  const key = String(eventId)
  const rec = agentPendingEvents.get(key)
  // 形状按 UI 传来的字段判：审批带 `outcome`，提问带 `answer`
  //（这样"登记表里没有、但宿主仍挂着"的题也能提交 —— 以宿主为准，别在本地先拒）
  const kind = rec ? rec.kind : (value && value.answer ? 'question' : 'approval')
  const clientId = (rec && rec.clientId) || agentEventClientId
  const payload = kind === 'approval' ? (value && value.outcome) : ((value && value.answer) || value)
  if (!clientId) return Promise.reject(new Error('host session not ready（$events 未收到 ready 帧）'))
  /* ⚠️ 载荷形状（2026-09-21 实测踩到）：`{args:{clientId,eventId,outcome}}`
   *    —— 宿主用 parseRemoteEventResultPayload() 要求 payload **恰好只有 args** 一个键，
   *       且 args **恰好**是那三个键（exactKeys）。写成 `{args:{request:{…}}}` 会被判
   *       `gateway/internal: api gateway: invalid Remote event result`（= 用户看到的"选项提交失败"）。
   *    dshCall 已经负责套 `{args}` ⇒ 这里直接给平铺对象。 */
  return dshCall(EVENT_RESULT_ENDPOINT, {
    clientId,
    eventId: key,
    outcome: { kind: 'result', value: payload },
  }).then((v) => {
    agentPendingEvents.delete(key)
    /* 提交成功后**本地广播**「已解决」。
     * 为什么必须我们自己广播：旧协议里是**宿主**推 `question/resolved` / `approval/resolved`，
     * 而 0.1.5-rc.2 的 `$events` **只在撤销时**发 `{type:'cancel'}`（答完不发）⇒ 面板答了、球的
     * 选项面板没人清（用户 2026-09-21 实测："面板有反馈，悬浮窗卡在选项处"），反向同理。
     * 广播给三个消费方（面板 / 系统通知 / 悬浮球）：球收到就 `clearOptionPanels()`，
     * 面板收到就按 askId 忘掉那一道题。 */
    muxDeliver({ type: 'server-request', rpcId: key, payload: {
      type: kind === 'approval' ? 'approval/resolved' : 'question/resolved',
      askId: (rec && rec.askId) || undefined,
    } })
    // 面板按 `r.accepted === false` 判失败、球按 `r.ok` 判 —— 两个字段都给，别只给一个
    return { ok: true, accepted: true, value: v }
  }).catch((e) => {
    /* 宿主拒绝（例如面板从落盘台账恢复出来的**旧题**：宿主早没这道题了）时，
     * 别再往上抛原始错误 —— 面板看 `accepted === false` + `reason`、球看 `ok:false` + `error`，
     * 两边都要给全，并把原因说清楚（否则用户只看到一句"提交失败"）。 */
    const msg = String((e && e.message) || e)
    console.log(`[akdagent] 选项提交被宿主拒绝（${key}）：${msg}`)
    return { ok: false, accepted: false, error: msg, reason: msg }
  })
}

/** 取某会话的历史：新版没有 session.history ⇒ 开一次 session/follow，
 *  取首帧 snapshot 的 records（形状与旧 session.history 一致：`{type:'event',event:{type,seq,time,data}}`）后立刻关闭。
 *  ⚠️ 返回里把 records 放进 `events` 字段：调用方（导出/摘要/面板）读的都是 `r.events`。 */
function dshHistory(sessionId, maxMessages = 50, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!hostPort) return reject(new Error(i18n.t('main.agent.hostNotReady')))
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; st.close(); reject(new Error('session/follow snapshot timeout')) } }, timeoutMs)
    const st = openHostStream(FOLLOW_ENDPOINT, {
      // ⚠️ assistantStream 的类型是**字面量 true**（`assistantStream?: true`）——
      //    传 false 会被判 gateway/input-invalid（实测）。这里只要快照，索性不带。
      request: { address: { kind: 'session', sessionId }, maxMessages },
    }, {
      onValue: (v) => {
        if (done || !v) return
        if (v.type === 'snapshot') {
          done = true
          clearTimeout(timer)
          st.close()
          resolve({ events: v.records || [], header: v.header, cursor: v.cursor, hasMore: !!v.hasMore, projections: v.projections })
        }
      },
      onError: (e) => { if (!done) { done = true; clearTimeout(timer); st.close(); reject(new Error((e && e.message) || 'session/follow failed')) } },
      onEnd: () => { if (!done) { done = true; clearTimeout(timer); st.close(); reject(new Error('session/follow ended before snapshot')) } },
    })
  })
}

/** 新帧 → 旧帧（渲染层 orb.html / panel-bridge.js 一行都不用改）
 *  $events 的 waterfall/emit/cancel 与 session/follow 的 event 都从这里过。 */
function adaptEventFrame(value) {
  if (!value || !value.type) return null
  if (value.type === 'ready') { agentEventClientId = value.clientId || null; return null }
  if (value.type === 'cancel') {
    const rec = agentPendingEvents.get(String(value.eventId))
    agentPendingEvents.delete(String(value.eventId))
    return { type: 'server-request', rpcId: value.eventId,
      payload: { type: rec && rec.kind === 'approval' ? 'approval/resolved' : 'question/resolved' } }
  }
  if (value.type === 'waterfall') {
    const req = value.request || {}
    const base = { type: 'server-request', rpcId: value.eventId, method: value.event }
    if (value.event === 'approval/request') {
      // askId = 面板台账里这道题的身份（审批就是 eventId；提问是题目 id）——
      // 提交成功后靠它广播"已解决"，让**另一个**渲染层把选项面板清掉（见 dshRespond）
      agentPendingEvents.set(String(value.eventId), { clientId: value.clientId || agentEventClientId,
        kind: 'approval', askId: String(value.eventId), at: Date.now() })
      return { ...base, payload: { type: 'approval/requested', approvalId: value.eventId,
        toolName: req.toolName, reason: req.reason, sessionId: null } }
    }
    if (value.event === 'user-questions/request') {
      const qs = Array.isArray(req.questions) ? req.questions : []
      agentPendingEvents.set(String(value.eventId), { clientId: value.clientId || agentEventClientId,
        kind: 'question', askId: qs[0] && qs[0].id !== undefined ? String(qs[0].id) : null, at: Date.now() })
      return { ...base, payload: { type: 'question/requested', sessionId: null,
        questions: qs.map((q) => ({ id: q.id, question: q.question, detail: q.detail, title: q.header,
          options: q.options, multi: !!q.multiSelect, multiSelect: !!q.multiSelect, intent: q.intent })) } }
    }
    return null
  }
  if (value.type === 'emit') {
    // 普通通知（非应答类）。会话事件优先走 session/follow（见 connectAgentMux），
    // 这里只兜底带 sessionId 的 session/event 通知，形状与旧版一致。
    const a = (Array.isArray(value.args) && value.args[0]) || {}
    if (value.event === 'session/event') {
      return { type: 'server-request', rpcId: null, payload: {
        type: 'session/event', sessionId: a.sessionId || null, event: a.event || a } }
    }
    return null
  }
  return null
}

/** 连接 mux 事件流，把帧原样推给 orb 渲染进程；断线指数退避重连 */
// ── 侧栏面板桥（SidePanelSection ↔ 会话）──────────────────────────────
// 链路：面板(JS) ⇄ project scriptData ⇄ Lua 桥 0.3.7 ⇄ jsonl ⇄ 本进程。
// 为什么这样绕：SidePanelSection 只能用 JS 写，而 SV 的 JS 沙箱**没有文件能力**，
//   所以两侧必须由桥搬运（设计 + 测试清单见 docs/SidePanel桥设计.md）。
// ⚠️ 政策：不出网；异常只打日志，不影响悬浮球。
let panelBridgeTimer = null

/** 宿主活动台账（ms）：面板里动过 / agent 在那台上干过活。
 *  用途：① 选「当前宿主」给 orb 切皮肤（host-pick）② ping / 取工程名的候选顺序。 */
const hostActivity = {}
let orbHostTypeTimer = null
let lastOrbHostType = null

/** 每台宿主**各一个**面板中继实例（2026-09-25 修）。
 *
 *  以前只有一个实例（`state.host` 单值），`startPanelBridge()` 按 `['sv','ix']` 顺序采样、
 *  **sv 优先**且启动后直接 `return`（不再采样）⇒ SV 一开着，IX 的侧栏就永远显示
 *  「⚠️ 还没连上悬浮球」：判据是 `akdagent-client-ix.json`（桥 `AKDAgentBridge.lua` 里
 *  「客户端每 ~5s 写、超 20s 视为未连接」），而那份文件从来没人写。
 *  现在两台**同时**服务：各自写各自的 `client-<host>.json` / `panel-in-<host>.jsonl` /
 *  偏移文件，互不干扰（文件路径本来就带 `-<host>`）。
 *  ⚠️ 两块面板镜像是**同一个悬浮球会话**（`getSessionId` 都指 `orbSessionId`）
 *  ⇒ 在任一块里说话/答题都作用于同一个会话；某台答题后由 `respond` 收掉另一台的过期按钮。 */
const panelBridges = {}
for (const h of HOSTS) {
  panelBridges[h] = createPanelBridge({
    log: (m) => console.log(m),
    t: (k, ...a) => i18n.t(k, ...a),
    tmpDir: process.env.TEMP || require('node:os').tmpdir(),
    appVersion: app.getVersion(),      // 写进在线心跳，供面板显示"悬浮球已连接"
    sendPrompt: async (text) => {
      await waitHostReady()
      const sessionId = await ensureOrbSession()
      noteHostActivity(h)              // 从这块面板发的话 ⇒ 这台是"当前宿主"
      return dshCall('session/prompt', promptArgs(sessionId, text))
    },
    // 面板做了动作（答题/提交/跳过）⇒ 也让另一块面板把过期选项收掉
    respond: (rpcId, value) => {
      const r = dshRespond(rpcId, value)
      for (const other of HOSTS) {
        if (other === h) continue
        try { panelBridges[other].clearAsk() } catch { /* 没起来就算了 */ }
      }
      return r
    },
    cancel: async () => { try { await dshCall('session/cancel', { request: { sessionId: orbSessionId } }) } catch { /* 忽略 */ } },
    // 消息镜像只认悬浮球/面板正在用的那个会话（宿主里可能还有别的会话在跑）
    getSessionId: () => orbSessionId,
    // 面板里一动（用户打字/点选项）⇒ 记这台"最近活动"，orb 皮肤据此切
    onActivity: () => noteHostActivity(h),
  })
}

/** 任一台面板中继就绪（提问/确认要不要发系统通知时用） */
const anyPanelReady = () => HOSTS.some((h) => panelBridges[h] && panelBridges[h].status.ready)

/** 记一次宿主活动；「当前宿主」可能因此变化 ⇒ 去刷新 orb 皮肤（防抖 400ms） */
function noteHostActivity (host) {
  if (!HOSTS.includes(host)) return
  hostActivity[host] = Date.now()
  if (orbHostTypeTimer) return
  orbHostTypeTimer = setTimeout(() => {
    orbHostTypeTimer = null
    refreshOrbHostType().catch(() => { /* 忽略：宿主类型只是图标 */ })
  }, 400)
  if (orbHostTypeTimer.unref) orbHostTypeTimer.unref()
}

/** 桥心跳是否新鲜（判"这台还活着"） */
function hostFresh (host) {
  try { return !!probeBridgeHeartbeat(host).fresh } catch { return false }
}

/** 当前宿主：最近活动的那台 → 桥活着的那台 → 兜底 sv（判据与单测见 src/host-pick.js） */
function activeHost () {
  const fresh = {}
  for (const h of HOSTS) fresh[h] = hostFresh(h)
  return pickActiveHost(hostActivity, fresh)
}

function sendOrbHostType (type) {
  if (orbWin && !orbWin.isDestroyed()) orbWin.webContents.send('akdagent-host-type', type)
}

/** 刷新 orb 宿主皮肤：按候选顺序真 ping（哪台活着就是哪台），变了才推 */
async function refreshOrbHostType (force) {
  const type = await querySvHostType(orderCandidates(activeHost()))
  if (!force && type === lastOrbHostType) return type
  lastOrbHostType = type
  sendOrbHostType(type)
  return type
}

/** 面板链路只在**桥自称支持**时启动（心跳 `panel:true`，桥 0.3.7+ 且有 project scriptData）。
 *
 * ⚠️ 2026-09-25 实机修（用户报「面板不响应 electron」）—— 原来这里是「每 10s 读一次，满 30 次
 *    （5 分钟）就永久放弃」，两个缺陷叠在一起会让面板**一辈子起不来**：
 *   ① **放弃是永久的**：客户端先开、面板后挂载（或宿主的桥比客户端晚跑）⇒ 过了那 5 分钟窗口，
 *      后面心跳就算变成 panel:true 也再没人看。实机日志原话：
 *        `10:20:59 [panel] 桥未宣称支持面板（心跳 panel:true）⇒ 面板链路不启动`
 *      而 10:29 采样时心跳**已经是** panel:true（SV2 面板挂载了）—— 时间差就是症状本身。
 *   ② **SV1 与 SV2 共用同一个心跳文件**（host id 都是 `sv`）⇒ 两台桥互相覆盖，
 *      单次采样可能连读几分钟都是另一台的 `panel:false`。所以这里改成**一个周期内连采 3 次**
 *      （间隔 250ms），只要有一拍读到 panel:true 就启动。
 *
 * ⚠️ 2026-09-25 第二修（用户报「IX 连不上 electron」，并定「让 IX 与 SV 同时可用」）——
 *    上面的版本**只服务最先找到的那台**（`['sv','ix']` 顺序 ⇒ sv 优先，而且启动后直接
 *    `return` 不再采样）⇒ SV 与 IX 同时开着时，IX 的侧栏永远等不到 `akdagent-client-ix.json`。
 *    现在：**两台各自一个中继、同时服务**；每个周期都重新采样，所以
 *      ③ 面板后挂载（或宿主的桥后跑）⇒ 下一轮就会补上启动；
 *      ④ 宿主关了/面板卸了（心跳过期或 `panel:false`）⇒ **停掉那台的中继**，
 *         `akdagent-client-<host>.json` 随之消失 ⇒ 面板会如实显示"还没连上悬浮球"
 *         （而不是我们一直举着一份过期在线标志骗它）。
 *    另外每轮顺带用心跳里的 `lastSeq/opsRun/reqSeen` 变化来记"这台在干活"（给 orb 切皮肤用）。
 *    （host id 的根因修法 —— 给 SV1/SV2 分不同通道 —— 属于协议级改动，另议。） */
const PANEL_TICK_MS = 10000;
const PANEL_BURST = 3;
const PANEL_BURST_GAP_MS = 250;
function startPanelBridge() {
  const dir = process.env.TEMP || require('node:os').tmpdir();
  const readHb = (h) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, `akdagent-hb-${h}.json`), 'utf8')); } catch { return null; }
  };
  /* 同一通道被几个"宿主身份"写过（SV1/SV2 共用 `sv` ⇒ 会看到两个） */
  const seenIdent = new Map();
  /* 心跳里"在动"的指纹（判 agent 正在哪台上干活；ts 每拍都变，不能用它） */
  const hbSig = {};
  let waited = 0;
  let lastWaitLog = 0;
  let collisionLogged = false;

  /** 采样一轮：更新活动台账 + 该起的起、该停的停；返回本轮有没有"宣称支持面板"的宿主 */
  const sampleOnce = () => {
    let anyPanel = false;
    for (const h of HOSTS) {
      const hb = readHb(h);
      if (!hb) continue;
      if (h === 'sv') {
        const ident = `${hb.isSV2 ? 'SV2' : 'SV1'} ${hb.hostVersionNumber || '?'}`;
        if (!seenIdent.has(h)) seenIdent.set(h, new Set());
        seenIdent.get(h).add(ident);
        if (!collisionLogged && seenIdent.get(h).size > 1) {
          collisionLogged = true;
          console.log(`[panel] ⚠️ 两个 sv 宿主在共用同一通道（${[...seenIdent.get(h)].join(' / ')}）`
            + ` ⇒ 心跳与请求文件会互相覆盖，面板链路可能起不来；请只开一台同类宿主`);
        }
      }
      /* ① 活动：心跳里的计数器变过 ⇒ agent 正在这台干活（给"当前宿主"用） */
      const sig = `${hb.lastSeq}|${hb.opsRun}|${hb.reqSeen}`;
      if (hbSig[h] !== undefined && hbSig[h] !== sig) noteHostActivity(h);
      hbSig[h] = sig;
      /* ② 中继起停：panel:true 且心跳新鲜才服务 */
      const fresh = hostFresh(h);
      const want = hb.panel === true && fresh;
      const st = panelBridges[h].status;
      if (want && !st.ready) {
        panelBridges[h].start(h);
        console.log(`[panel] 面板链路已启动（host=${h}）`);
      } else if (!want && st.ready) {
        panelBridges[h].stop();
        console.log(`[panel] 面板链路已停止（host=${h}：${fresh ? '未宣称支持面板' : '心跳过期/宿主已关'}）`);
      }
      if (want) anyPanel = true;
    }
    return anyPanel;
  };

  const tick = async () => {
    let anyPanel = false;
    for (let i = 0; i < PANEL_BURST; i += 1) {
      anyPanel = sampleOnce() || anyPanel;
      /* 两台中继都已就绪 ⇒ 不必连采 3 次（连采是为了跨过 SV1/SV2 共用通道时的互相覆盖） */
      if (HOSTS.every((h) => panelBridges[h].status.ready)) break;
      if (i < PANEL_BURST - 1) await new Promise((r) => setTimeout(r, PANEL_BURST_GAP_MS));
    }
    if (!anyPanel) {
      waited += 1;
      const now = Date.now();
      if (waited === 1 || now - lastWaitLog >= 300000) {
        lastWaitLog = now;
        console.log(`[panel] 等面板挂载（心跳还没有 panel:true，已等 ~${Math.round(waited * PANEL_TICK_MS / 1000)}s）—— 会一直等，不放弃`);
      }
    }
    panelBridgeTimer = setTimeout(() => { tick().catch(() => {}); }, PANEL_TICK_MS);
    if (panelBridgeTimer.unref) panelBridgeTimer.unref();
  };
  tick().catch(() => {});
}

/** 悬浮球藏在托盘里时，若来了「提问 / 工具确认」⇒ 弹一条系统通知（点一下把球叫回来）
 *  用户 2026-09-17 要求。球在场时**不打扰**；同 3 秒内不连弹（一问一确认可能挨着来）。 */
let lastHiddenNotifyAt = 0
function maybeNotifyHiddenAsk(frame) {
  const p = frame && frame.payload
  if (!p || (p.type !== 'question/requested' && p.type !== 'approval/requested')) return
  if (orbVisible()) return                                  // 球看得见 ⇒ 用户自己会发现
  /* 面板链路在 ⇒ 侧栏面板就能看到题目/确认（面板会把选项与题面都显示出来）⇒ 不必打扰
   *（用户 2026-09-17：「如果面板正在连接就不需要弹了吧」；2026-09-25：两台任一就绪即算） */
  if (anyPanelReady()) return
  if (Date.now() - lastHiddenNotifyAt < 3000) return
  lastHiddenNotifyAt = Date.now()
  const isQ = p.type === 'question/requested'
  const q = isQ && Array.isArray(p.questions) && p.questions[0] ? p.questions[0] : null
  const title = i18n.t(isQ ? 'notice.hiddenAsk.question' : 'notice.hiddenAsk.approval')
  const raw = isQ ? String((q && q.question) || '') : i18n.t('notice.hiddenAsk.tool', p.toolName || '?')
  const body = (raw ? raw + ' — ' : '') + i18n.t('notice.hiddenAsk.body')
  try {
    if (!Notification.isSupported()) { console.log('[hidden-notice] ' + title + ' — ' + body); return }
    const n = new Notification({ title, body })
    n.on('click', () => showOrbFromTray())                  // 点通知 = 把球显示回来
    n.show()
    console.log('[hidden-notice] 已提醒（球在托盘、且面板链路不在）：' + title)
  } catch (e) { console.log('[hidden-notice] 弹通知失败：' + e.message) }
}

/* ── mux 逻辑流（0.1.5-rc.2 的 /api/remote.mux）───────────────────────
 * 一条共享 socket 承载多条逻辑流，按 streamId 路由；断线指数退避重连，
 * 重连后自动重开所有登记中的流（follow 会重发 snapshot ⇒ 消费方按新基线接管）。 */
let muxStreamSeq = 0
const muxStreams = new Map()   // streamId → { endpoint, args, onValue, onError, onEnd, sent }
let eventsStream = null        // $events 订阅（审批/提问 waterfall）
let followStream = null        // 当前绑定会话的 session/follow（实时事件）
let followSessionId = null

function muxSendOpen(streamId, st) {
  if (!muxSocket || muxSocket.readyState !== WebSocket.OPEN || st.sent) return
  try {
    muxSocket.send(JSON.stringify({ type: 'open', streamId, endpoint: st.endpoint, payload: { args: st.args || {} } }))
    st.sent = true
  } catch (e) { console.log('[akdagent] mux open 发送失败：' + e.message) }
}

/** 打开一条 mux 逻辑流；返回 { streamId, close() } */
function openHostStream(endpoint, args, handlers) {
  muxStreamSeq += 1
  const streamId = `svs-${muxStreamSeq}`
  const st = { endpoint, args: args || {}, sent: false, onValue: null, onError: null, onEnd: null, ...handlers }
  muxStreams.set(streamId, st)
  muxEnsureConnected()
  muxSendOpen(streamId, st)
  return {
    streamId,
    close() {
      muxStreams.delete(streamId)
      try {
        if (muxSocket && muxSocket.readyState === WebSocket.OPEN) muxSocket.send(JSON.stringify({ type: 'cancel', streamId }))
      } catch { /* 关流失败无所谓 */ }
    },
  }
}

function muxEnsureConnected() {
  if (muxSocket || quitting || !hostPort) return
  const url = `ws://127.0.0.1:${hostPort}${MUX_PATH}`
  let ws
  try {
    // 新版 mux 也走会话鉴权 ⇒ 握手必须带 Cookie 头（ws 支持 headers 选项）
    ws = new WebSocket(url, hostCookie ? { headers: { Cookie: hostCookie } } : undefined)
  } catch (e) {
    console.log('[akdagent] mux 建连失败：' + e.message)
    scheduleMuxReconnect()
    return
  }
  muxSocket = ws
  ws.on('open', () => {
    muxRetryDelay = 1000
    console.log(`[akdagent] agent mux connected（${muxStreams.size} 条流）`)
    for (const [id, st] of muxStreams) { st.sent = false; muxSendOpen(id, st) }
    notifyAgentReady()
  })
  ws.on('message', (data) => {
    let f
    try { f = JSON.parse(data.toString()) } catch { return }
    const st = f && f.streamId ? muxStreams.get(f.streamId) : null
    if (!st) return
    if (f.type === 'item') {
      try { st.onValue && st.onValue(f.value) } catch (e) { console.log('[akdagent] mux 帧处理异常：' + e.message) }
    } else if (f.type === 'error') {
      try { st.onError && st.onError(f.error) } catch { /* 忽略 */ }
    } else if (f.type === 'end') {
      try { st.onEnd && st.onEnd() } catch { /* 忽略 */ }
    }
  })
  ws.on('close', () => {
    if (muxSocket !== ws) return
    muxSocket = null
    for (const st of muxStreams.values()) st.sent = false
    console.log('[akdagent] agent mux closed, reconnecting…')
    notifyAgentReady()
    scheduleMuxReconnect()
  })
  ws.on('error', () => { /* close 会触发重连 */ })
}

/** 适配后的旧帧交给三个消费方（面板 / 系统通知 / 悬浮球） */
function muxDeliver(oldFrame) {
  if (!oldFrame) return
  // 面板链路先吃一帧（问题/工具确认要推给侧栏）——**别放在 orbWin 判空之后**，
  // 否则悬浮球窗口关掉时面板也跟着哑掉。
  /* 会话帧**广播给两台中继**（两块面板镜像同一个悬浮球会话）；哪台没起就跳过 */
  for (const h of HOSTS) {
    const b = panelBridges[h]
    if (!b || !b.status.ready) continue
    try { b.onMuxFrame(oldFrame) } catch (e) { console.log(`[panel] mux 帧处理异常（host=${h}）：` + e.message) }
  }
  try { maybeNotifyHiddenAsk(oldFrame) } catch (e) { console.log('[hidden-notice] 异常（已忽略）：' + e.message) }
  if (!orbWin || orbWin.isDestroyed()) return
  orbWin.webContents.send('akdagent-agent-event', oldFrame)
}

function connectAgentMux() {
  // $events 订阅（幂等）：审批/提问 waterfall 都从这条流来
  if (!eventsStream) {
    eventsStream = openHostStream(EVENT_STREAM_ENDPOINT, {}, {
      onValue: (v) => muxDeliver(adaptEventFrame(v)),
      onError: (e) => console.log('[akdagent] $events 流错误：' + ((e && e.message) || JSON.stringify(e))),
      onEnd: () => { console.log('[akdagent] $events 流结束'); eventsStream = null },
    })
  }
  muxEnsureConnected()
}

/** 绑定/切换当前会话的实时日志流（历史仍走 dshHistory 的按需快照） */
function followBoundSession(sessionId) {
  if (followStream && followSessionId === sessionId) return
  if (followStream) { followStream.close(); followStream = null }
  followSessionId = sessionId || null
  if (!sessionId) return
  /* ⚠️ `assistant-stream` 的 **chunk 帧不带 turn/step**（只有 start/end 带）——
   * 2026-09-21 实测：直接 `turn: f.turn` 会让渲染层收到 `turn=undefined`，于是
   * orb 的 `assistant/message` 兜底守卫（`curTurn.turn === d.turn`）不成立 ⇒ **同一条正文渲染两遍**。
   * 所以按 attemptId 记住 start 帧的 turn，chunk 帧带上它；断线重连用 snapshot 的
   * `assistantStream.activeAttempt` 续上。 */
  const streamTurns = new Map()   // attemptId → turn
  followStream = openHostStream(FOLLOW_ENDPOINT, {
    request: { address: { kind: 'session', sessionId }, assistantStream: true },
  }, {
    onValue: (v) => {
      if (!v) return
      if (v.type === 'event') {
        /* 一轮结束时把 reason 落日志（2026-09-26 新增）。
         * 旧版这里完全无痕：用户报「一发消息就 回合结束（error）」时，我们只有 UI 上那句话，
         * 定位不了（只有反复刷的 MCP 重连噪音）。console.* 已被顶部日志安全网接管 ⇒ 直接进 akdagent.log。 */
        try {
          const ev = v.event || {}
          if (ev.type === 'turn/end') {
            const r = (ev.data && ev.data.reason) || ev.reason
            if (r && r.kind && r.kind !== 'completed') {
              const hint = turnErrorHint(r.error)
              console.error('[akdagent] turn/end reason = ' + JSON.stringify(r).slice(0, 2000))
              if (hint) console.error('[akdagent] ⇒ 可能的原因：' + hint)
              try {
                fs.writeFileSync(
                  path.join(app.getPath('userData'), 'last-turn-error.json'),
                  JSON.stringify({ at: new Date().toISOString(), sessionId, reason: r, hint }, null, 2),
                  'utf8'
                )
              } catch { /* 写不了就算了 */ }
            }
          }
        } catch { /* 记日志失败不影响主流程 */ }
        // 会话日志事件：形状与旧版一致（`{type,seq,time,data}`），原样给渲染层
        return muxDeliver({ type: 'server-request', rpcId: null, payload: {
          type: 'session/event', sessionId, event: v.event } })
      }
      if (v.type === 'assistant-stream') {
        // 新版把流式正文单列成 assistant-stream 帧；渲染层认 `assistant/live-chunk`
        const f = v.frame || {}
        if (f.type === 'start') { streamTurns.set(f.attemptId, f.turn); return }
        if (f.type === 'end') { streamTurns.delete(f.attemptId); return }
        if (f.type === 'chunk') {
          return muxDeliver({ type: 'server-request', rpcId: null, payload: {
            type: 'session/event', sessionId,
            event: { type: 'assistant/live-chunk',
              data: { chunk: f.chunk, turn: streamTurns.get(f.attemptId) } } } })
        }
        return
      }
      // snapshot：本轮不做增量重放（历史由 dshHistory 按需取），只记一行日志 +
      // 用开帧里的活跃尝试续上 attemptId→turn（断线重连后 chunk 帧仍能带上正确 turn）
      if (v.type === 'snapshot') {
        const active = v.assistantStream && v.assistantStream.activeAttempt
        if (active && active.attemptId) streamTurns.set(active.attemptId, active.turn)
        console.log(`[akdagent] follow snapshot: ${sessionId} cursor=${v.cursor} records=${(v.records || []).length}`)
      }
    },
    onError: (e) => console.log('[akdagent] follow 流错误：' + ((e && e.message) || JSON.stringify(e))),
    onEnd: () => { console.log('[akdagent] follow 流结束'); followStream = null },
  })
}

/** 收拾一次性会话（旧版靠 `session.archive`）。
 *  ⚠️ 0.1.5-rc.2 的端点清单里**没有归档**（session/* 共 16 个端点，无 archive）
 *  ⇒ 这里只能什么都不做：一次性会话留在宿主里，但它不在段表 ⇒ 不显示、不导出。
 *  将来 DSH 若补上归档端点，只改这一处。 */
function archiveSession(_sessionId) { /* no-op：新版无 session/archive 端点 */ }

function scheduleMuxReconnect() {
  if (quitting || !hostPort) return
  clearTimeout(muxRetryTimer)
  muxRetryTimer = setTimeout(() => {
    muxRetryDelay = Math.min(muxRetryDelay * 2, 15000)
    connectAgentMux()
  }, muxRetryDelay)
}

/** 从 SV 工程文件名派生稳定会话 key（同一工程复用同一会话，切换工程自动换会话） */
function projectKeyFromName(fileName) {
  const base = String(fileName || '').replace(/\\/g, '/')
  if (!base) return 'no-project'
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 12)
}

/**
 * 桥主动推送工程切换事件。**新语义（2026-09-13，见 docs/聊天记录归属设计.md）**：
 *   · 有路径的工程出现 ⇒ 若当前是临时段则**原地过继**（改归属、会话不变、零复制）；
 *     若是别的工程则**新开该工程的段**（切回时复用该工程最后一个 generation）。
 *   · 空名（未保存/临时）⇒ 不切段、不建段（保持现状，避免 no-project 震荡）。
 *   · **不再清空面板**：只通知渲染层在时间线当前位置画「工程分隔线」。
 *   · 不 archive 任何会话（切工程后旧段仍可显示/可切回）。
 */
function onSvProjectSwitched(projectName) {
  const hasPath = !!String(projectName || '').trim()
  const projectKey = hasPath ? projectKeyFromName(projectName) : null
  if (!hasPath) {
    if (orbWin && !orbWin.isDestroyed()) orbWin.webContents.send('akdagent-project-switched', '')
    console.log('[akdagent] project (un)saved -> blank, keep segment')
    return
  }
  const r = orbSegments.noteProject(projectKey, projectName)
  orbProjectKey = projectKey
  bindOrbSession(r && r.seg ? r.seg.sessionId : null)   // 段自带 id（尚未 create 时惰性创建）
  if (orbWin && !orbWin.isDestroyed()) {
    orbWin.webContents.send('akdagent-project-switched', {
      project: projectName || null,
      segId: r && r.seg ? r.seg.segId : null,
      kind: r && r.seg ? r.seg.kind : null,
      retagged: !!(r && r.retagged),
      switched: !!(r && r.switched),
    })
  }
  console.log(`[akdagent] project -> ${projectName} · seg=${r && r.seg ? r.seg.segId : '?'} · ` +
    `retagged=${!!(r && r.retagged)} switched=${!!(r && r.switched)} · session=${orbSessionId}`)
}

/** 探测某 sessionId 是否已存在（`session/list` 返回全部会话） */
async function sessionExists(sessionId) {
  try {
    const r = await dshCall('session/list', { _request: {} })
    const items = Array.isArray(r && r.items) ? r.items : []
    return items.some((it) => it && it.sessionId === sessionId)
  } catch {
    return false
  }
}

/** 把「DSH 里有、段表里没有」的 `akdagent-orb-*` 会话登记成段（孤儿）。
 *  为什么：早期版本用过别的会话命名（`akdagent-orb-no-project` / `akdagent-orb-<hash>`），
 *  那些会话**不在段表里** ⇒ 球上不显示、导出永远带不上（2026-09-19 实测三个共 4 万+ 事件，
 *  内容都在）。登记后它们就是普通未归属段：能显示，也能被"紧邻临时段"规则带进导出。
 *  只在启动时跑一次；失败不影响启动。 */
async function adoptOrphanSessions() {
  try {
    const r = await dshCall('session/list', { _request: {} })
    const items = Array.isArray(r && r.items) ? r.items : []
    const n = orbSegments.adoptSessions(items.map((x) => x && x.sessionId))
    if (n) console.log(`[akdagent] 登记了 ${n} 个段表外的孤儿会话（早期命名）⇒ 现在能显示与被导出`)
  } catch (e) {
    console.log('[akdagent] 孤儿会话登记失败（忽略）：' + e.message)
  }
}

/** 会话在当前运行时里**能不能用**。
 *
 *  为什么需要：0.1.5-rc.2 的 v0→v1 迁移器**拒收**旧内嵌运行时（0.1.0-rc.5）写的 v0 日志
 *  （实测报错：`refuses this format v0 Session: user/message N source form must be one of
 *   instructions, catalog, snapshot, notice, relay, recall`，而旧日志里用户消息的 source 是
 *  `{kind:'user', rpcId}`，没有那个 form）。被拒的会话**既读不了历史、也发不了消息**
 *  （`session/prompt` 直接 `gateway/internal: resume failed`）。
 *  ⇒ 段表里的老会话必须先探一次：能用就复用，不能用就**给这一段新开一个会话**，
 *     旧 id 记到 `userData/legacy-sessions.json`（将来若做抢救/回退旧运行时好找回来）。 */
const unusableSessions = new Set()
async function sessionUsable(sessionId) {
  if (!sessionId) return false
  if (unusableSessions.has(sessionId)) return false
  try {
    await dshHistory(sessionId, 1, 8000)     // 取一次快照：能出快照就是能用
    return true
  } catch (e) {
    unusableSessions.add(sessionId)
    console.log(`[akdagent] 会话 ${sessionId} 在当前运行时不可用：${e.message}`)
    return false
  }
}

/** 记下"某段曾经用过的、新版读不了的会话 id"（只追加，供将来抢救/回退查） */
function noteLegacySession(segId, sessionId) {
  try {
    const p = path.join(app.getPath('userData'), 'legacy-sessions.json')
    let m = {}
    try { m = JSON.parse(fs.readFileSync(p, 'utf8')) || {} } catch { /* 首次 */ }
    const list = Array.isArray(m[segId]) ? m[segId] : (m[segId] ? [m[segId]] : [])
    if (!list.includes(sessionId)) {
      list.push(sessionId)
      m[segId] = list
      fs.writeFileSync(p, JSON.stringify(m, null, 2), 'utf8')
    }
  } catch { /* 记不上不影响使用 */ }
}

/** 确保当前段的 DSH 会话存在（**不再按工程归档/切换**；切段由段表负责）。
 *  · 段自带 sessionId（开段即占号并定 id）⇒ 只需确保它在 DSH 里被创建
 *  · 重启恢复：段表持久化 ⇒ 同一段的 id 不变，DSH 里已存在则直接复用（历史自动回来）
 *  · **旧 v0 日志**：新版读不了/续不了 ⇒ 给这一段新开会话（旧 id 记档），否则一发消息就报错
 *  · 临时段：projectKey=null，同样按需建会话（"不保存"落在"不归属任何工程"，
 *    收编后它会成为该工程的 generation —— 见段表 noteProject()） */
async function ensureOrbSession() {
  const seg = orbSegments.ensureSegment()
  orbSegId = seg.segId
  if (seg.sessionId && await sessionExists(seg.sessionId)) {
    if (await sessionUsable(seg.sessionId)) {
      if (!seg.sessionReady) orbSegments.registerSession(seg.segId, seg.sessionId)  // 重启恢复
      return bindOrbSession(seg.sessionId)
    }
    // 读不了的旧会话：同一段换一个新 id（旧 id 留档；段表 registerSession 会更新）
    noteLegacySession(seg.segId, seg.sessionId)
    const freshId = orbSegments.nextSessionId(seg.projectKey)
    const created = await dshCall('session/create', { request: { sessionId: freshId } })
    orbSegments.registerSession(seg.segId, created.sessionId)
    return bindOrbSession(created.sessionId)
  }
  const created = await dshCall('session/create', { request: { sessionId: seg.sessionId } })
  orbSegments.registerSession(seg.segId, created.sessionId)
  return bindOrbSession(created.sessionId)
}

/**
 * 绑定/解绑「当前会话」并**通知悬浮球**（2026-09-17 消息对齐·补反向）。
 *
 * 为什么必须由主进程下发：悬浮球按 `mySessionId` 过滤 mux 帧
 * （`if (!mySessionId || p.sessionId !== mySessionId) return`），而它原先只在
 * **从球里发过消息**时才从返回值里拿到 id。用户只在侧栏面板里打字时，球永远拿不到 id
 * ⇒ 帧全被丢掉 ⇒ 现象就是「面板的消息没同步到球里」（用户实测反馈）。
 * 主进程是会话 id 的唯一权威（面板发消息也走 ensureOrbSession）⇒ 由这里统一下发。
 */
function bindOrbSession(id) {
  const next = id || null
  if (orbSessionId === next) return next
  const prev = orbSessionId
  orbSessionId = next
  // 换会话 ⇒ 把**旧会话那一轮停掉**（2026-09-17）：旧会话不停的话，它产出的提问/输出会一直
  //   广播过来（用户实测"它一直在问我上个工程的问题"），而且它还会继续占队列。
  if (prev && prev !== next) {
    dshCall('session/cancel', { request: { sessionId: prev } })
      .then(() => console.log('[akdagent] 已停掉旧会话当前轮：' + prev))
      .catch((e) => console.log('[akdagent] 停旧会话失败（忽略）：' + e.message))
  }
  // 换会话 ⇒ 把实时日志流也切过去（新版靠 session/follow 做镜像，不再有全局 mux 会话事件）
  followBoundSession(next)
  if (orbWin && !orbWin.isDestroyed()) {
    orbWin.webContents.send('akdagent-session-bound', { sessionId: next, segId: orbSegId || null })
  }
  console.log('[akdagent] orb 会话绑定 → ' + (next || '(未绑定)'))
  return next
}

// ── Agent IPC（orb 渲染进程 ↔ 主进程代理） ────────────────────────
// ⛔ 2026-09-17 起：侧栏面板的消息**只由 panel-bridge 镜像 mux 会话**产生（单一真相源），
//    悬浮球不再推 processing/output/resetTurn —— 旧路径（渲染那轮才推）正是面板与悬浮球
//    "内容不一样"的根因（窗口没开就没人推）。本通道保留只为兼容/排查，收到也**不再转发**，
//    否则同一轮会在面板里出现两遍。
ipcMain.handle('akdagent-panel-push', (_e, p) => {
  const kind = p && p.kind
  console.log('[panel] 收到渲染进程推送 kind=' + kind + '（已忽略：面板消息现由主进程镜像会话）')
  return { ok: false, ignored: true, reason: 'mirror-owned' }
})

ipcMain.handle('akdagent-agent-send', async (_e, text) => {
  try {
    await waitHostReady()                          // host 没起来时别急着重试失败
    const sessionId = await ensureOrbSession()
    const seg = orbSegments.activeSegment()
    let payload = String(text)
    // 段的"待注入摘要"（导出换 gen / 收编后首轮）：调一次模型生成；失败退规则摘要
    if (seg && seg.pendingSummary) {
      try {
        const all = orbSegments.snapshot().segments || []
        const src = all.find((s) => s.segId === (seg.summaryFromSegId || seg.segId)) || seg
        const transcript = await segmentTranscriptText(src)
        let summary = null
        try { summary = await modelSummary(transcript) } catch { /* 退化 */ }
        if (!summary) summary = ruleSummary(transcript)
        if (summary) {
          payload = i18n.t('main.summary.prefix') + '\n' + summary + '\n\n————\n\n' + payload
        }
        orbSegments.requestSummary(seg.segId, false)
      } catch (e) {
        console.log('[akdagent] summary inject failed: ' + e.message)
      }
    }
    const r = await dshCall('session/prompt', promptArgs(sessionId, payload))
    return { ok: true, sessionId, accepted: !!r.accepted }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 新会话（手动）：**在当前工程段内插一个新段**（不清空显示、不归档旧会话）。
 *  见 docs/聊天记录归属设计.md「4.3 手动新会话」：段 kind='manual-split'，
 *  默认**不注入摘要**（用户要的是"真·新会话"）。 */
ipcMain.handle('akdagent-agent-new', async () => {
  try {
    const cur = orbSegments.activeSegment()
    const projectKey = (cur && cur.projectKey) || orbProjectKey || null
    const seg = orbSegments.openSegment(projectKey, 'manual-split')
    orbSegId = seg.segId
    bindOrbSession(null)                      // 惰性创建（下次发送时 ensureOrbSession）
    const created = await dshCall('session/create', { request: { sessionId: seg.sessionId } })
    orbSegments.registerSession(seg.segId, created.sessionId)
    bindOrbSession(created.sessionId)
    return {
      ok: true, sessionId: orbSessionId, segId: seg.segId, gen: seg.gen,
      project: projectKey, projectName: await querySvProjectName(activeHost()).catch(() => null),
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 查询当前会话状态（面板打开时用：工程名 + 当前段）。
 *  **新语义**：不再"随工程切换就清空面板"（stale 恒为 false，仅保留字段兼容旧渲染层）。
 *  面板改为**全量时间线 + 工程分隔线**，切工程只追加分隔线、不丢内容。 */
ipcMain.handle('akdagent-agent-session-state', async () => {
  try {
    // 用缓存探测（SV 桥不可达时快速返回 no-project），不阻塞提问
    const projectName = await querySvProjectName(activeHost())
    const cur = orbSegments.activeSegment()
    return {
      ok: true,
      project: projectName || null,
      stale: false,                      // 兼容字段：不再清空
      segId: cur ? cur.segId : null,
      segKind: cur ? cur.kind : null,
      segProjectKey: cur ? cur.projectKey : null,
      gen: cur ? cur.gen : null,
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 等内嵌 host 就绪（面板可能比 host 先起来 ⇒ 直接调会 ECONNREFUSED）。
 *  hostReady 由 waitForWeb/状态推送维护；超时返回 false（调用方照常尝试并容错）。 */
async function waitHostReady(timeoutMs = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (hostReady) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/** 拉取**合并时间线**：按段表顺序，把各段会话的历史拼成一条流，并给每个事件打上段信息
 *  （渲染层据此在段边界画「工程分隔线」）。切工程/导出/手动新会话都只追加段，**不清空**。
 *  单段失败不影响其他段（返回 events 里带 error 标记，不抛）。 */
ipcMain.handle('akdagent-agent-history', async () => {
  try {
    await waitHostReady()                          // ⚠️ 面板可能比内嵌 host 先起（否则 ECONNREFUSED）
    await ensureOrbSession().catch(() => null)     // 确保当前段有会话（失败也让历史尽可能返回）
    const segs = orbSegments.displaySegments()
    const events = []
    for (const seg of segs) {
      if (!seg.sessionId) continue
      let list = []
      let err = null
      try {
        const r = await dshHistory(seg.sessionId)
        list = Array.isArray(r.events) ? r.events : []
      } catch (e) {
        err = e.message
      }
      if (err) { console.log(`[akdagent] history of seg ${seg.segId} failed: ${err}`); continue }
      for (const item of list) {
        const ev = item && item.event ? item.event : item
        if (!ev || typeof ev !== 'object') continue
        events.push({
          ...ev,
          // 段信息（渲染层用；不污染 DSH 事件本身）
          __seg: {
            segId: seg.segId, projectKey: seg.projectKey, projectName: seg.projectName || null,
            kind: seg.kind, gen: seg.gen, exportedUpToSeq: seg.exportedUpToSeq,
          },
        })
      }
    }
    return { ok: true, events, segments: segs }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 事件 → 纯文本（与 orb.html 的 extractText 同形：取 content 里 type=text 的块）。*/
function eventText(ev) {
  const msg = ev && ev.data ? (ev.data.message || ev.data) : null
  if (!msg || !Array.isArray(msg.content)) return ''
  return msg.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('').trim()
}

/** 工具结果文本（tool/result.message 是 ToolResultMessage：取 content 里的 text 块，取不到退 JSON 摘要）*/
function toolResultText(msg) {
  if (!msg) return ''
  if (Array.isArray(msg.content)) {
    const t = msg.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('').trim()
    if (t) return t
  }
  try { return JSON.stringify(msg).slice(0, 600) } catch { return '' }
}

const clip = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/** 事件数组 → markdown 记录（导出用；**含工具行**：工具名/参数摘要/结果/失败/中断/待办）
 *  文案跟随**客户端界面语言**（导出产物是给用户看的，英文界面下不该是中文表头）。*/
/** 事件 → 正文（用户/助手/工具行/中断/待办）—— 单段导出、多段导出、摘要三处共用 */
function renderEventsBody(events) {
  const body = []
  for (const ev of events || []) {
    if (!ev || typeof ev !== 'object') continue
    const d = ev.data || {}
    if (ev.type === 'user/message') {
      const t = eventText(ev)
      if (t) body.push(`${i18n.t('main.export.roleUser')}\n\n${t}\n`)
    } else if (ev.type === 'assistant/message') {
      const t = eventText(ev)
      if (t) body.push(`${i18n.t('main.export.roleAssistant')}\n\n${t}\n`)
    } else if (ev.type === 'tool/call') {
      // 工具调用：名字 + 参数摘要（arguments 是 JSON 字符串）
      body.push(`- 🔧 \`${d.name || '?'}\` ${clip(d.arguments, 300)}`)
    } else if (ev.type === 'tool/result') {
      const err = d.error ? `  ❌ \`${d.error.name || ''}/${d.error.code || ''}\`` : ''
      body.push(`  - ↳ ${clip(toolResultText(d.message), 400)}${err}`)
    } else if (ev.type === 'turn/end' && d.reason && d.reason.kind === 'interrupted') {
      body.push(i18n.t('main.export.interrupted'))
    } else if (ev.type === 'todo/write' && Array.isArray(d.todos)) {
      const lines = d.todos.slice(0, 30).map((x) => `  - [${x && x.status ? x.status : '?'}] ${clip(x && x.text, 120)}`)
      if (lines.length) body.push(`${i18n.t('main.export.todos')}\n${lines.join('\n')}`)
    }
  }
  return body.join('\n')
}

function renderTranscript(events, seg) {
  const who = seg && seg.projectKey
    ? i18n.t('main.export.ownerProject', seg.projectName || seg.projectKey)
    : i18n.t('main.export.ownerTemp')
  const head = [
    i18n.t('main.export.title'),
    ``,
    i18n.t('main.export.owner', who),
    i18n.t('main.export.segment', seg ? seg.segId : '?', seg ? seg.gen : '?'),
    i18n.t('main.export.exportedAt', new Date().toLocaleString()),
    ``,
    `---`,
    ``,
  ].join('\n')
  return head + '\n' + renderEventsBody(events) + '\n'
}

/** 多段导出：**一份文档、按段分节**。
 *  用户 2026-09-19 裁定范围 = 「当前工程全部段 + 紧邻它之前的未归属临时段」（见 orb-segments.exportSegments）。
 *  为什么不能各段各写一份：那样会重复整套表头，且用户要的是"我看到的记录"= 一份可读的档。 */
function renderTranscriptMulti(parts, activeSeg) {
  const list = Array.isArray(parts) ? parts : []
  const owner = activeSeg && activeSeg.projectKey
    ? i18n.t('main.export.ownerProject', activeSeg.projectName || activeSeg.projectKey)
    : i18n.t('main.export.ownerTemp')
  const head = [
    i18n.t('main.export.title'),
    ``,
    i18n.t('main.export.owner', owner),
    i18n.t('main.export.segmentsIncluded', list.map((p) => p.seg.segId).join(' · '), list.length),
    i18n.t('main.export.exportedAt', new Date().toLocaleString()),
    ``,
    `---`,
    ``,
  ].join('\n')
  const chunks = []
  for (const p of list) {
    const s = p.seg
    const where = s.projectKey
      ? i18n.t('main.export.ownerProject', s.projectName || s.projectKey)
      : (s.kind === 'orphan' ? i18n.t('main.export.ownerOrphan') : i18n.t('main.export.ownerTemp'))
    chunks.push(i18n.t('main.export.sectionHeader', s.segId, s.gen, where))
    chunks.push(renderEventsBody(p.events) || i18n.t('main.export.sectionEmpty'))
  }
  return head + '\n' + chunks.join('\n\n') + '\n'
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 规则摘要兜底（模型摘要失败时用；零成本）
 *  ⚠️ 挑行用的正则**必须跟着界面语言走**：表头是 `## 用户`/`## 助手` 的本地化版本，
 *  写死中文会让英文界面下挑不到任何一行（导出表头与这里是一对，改一处必须改两处）。*/
function ruleSummary(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim())
  const userH = i18n.t('main.export.roleUser').replace(/^#+\s*/, '')
  const asstH = i18n.t('main.export.roleAssistant').replace(/^#+\s*/, '')
  const re = new RegExp(`^#{1,3} |^${escapeRe(userH)}|^${escapeRe(asstH)}`)
  const pick = lines.filter((l) => re.test(l)).slice(0, 30)
  const tail = lines.slice(-40)
  return [i18n.t('main.summary.ruleHeader'), ...pick, '…', ...tail].join('\n').slice(0, 4000)
}

/** 取某段的历史文本（供摘要用）*/
async function segmentTranscriptText(seg) {
  if (!seg || !seg.sessionId) return ''
  try {
    const r = await dshHistory(seg.sessionId)
    const evs = (Array.isArray(r.events) ? r.events : []).map((x) => (x && x.event) || x)
    return renderTranscript(evs, seg)
  } catch {
    return ''
  }
}

/** 模型摘要（用户裁定：调一次模型生成，质量优先）。
 *  实现：开一个**一次性会话**（不进段表），把记录喂给它、轮询取回 assistant 文本，然后归档。
 *  失败返回 null（由调用方退回规则摘要）。 */
async function modelSummary(transcript) {
  if (!transcript || transcript.length < 40) return null
  const sid = 'akdagent-orb-summary-' + Date.now().toString(36)
  try {
    await dshCall('session/create', { request: { sessionId: sid } })
    // 整段提示词按界面语言取（含"用什么语言写摘要"那句），见 i18n/common.json 的 main.summary.prompt
    const summaryPrompt = i18n.t('main.summary.prompt') +
      '\n\n' + i18n.t('main.summary.begin') + '\n' + String(transcript).slice(-24000) + '\n' + i18n.t('main.summary.end')
    await dshCall('session/prompt', promptArgs(sid, summaryPrompt))
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 700))
      try {
        const h = await dshHistory(sid)
        const evs = (Array.isArray(h.events) ? h.events : []).map((x) => (x && x.event) || x)
        const last = [...evs].reverse().find((e) => e && e.type === 'assistant/message')
        const t = last ? eventText(last) : ''
        if (t && t.length > 20) {
          archiveSession(sid)
          return t
        }
      } catch { /* 继续等 */ }
    }
  } catch (e) {
    console.log('[akdagent] modelSummary failed: ' + e.message)
  }
  archiveSession(sid)
  return null
}

/** 导出「当前记录组」→ md 文件；随后**换 generation**（旧段不再喂模型），显示层继续追加。
 *  范围 = `orbSegments.exportSegments()`（用户 2026-09-19 裁定：该工程全部段 + 紧邻其在先的未归属临时段）
 *  —— 旧实现只导 `activeSegment()`，导致**屏幕上看得见的记录导不出来**（实测落成 159 B 空文件）。 */
ipcMain.handle('akdagent-orb-export', async () => {
  try {
    const cur = orbSegments.activeSegment()
    if (!cur) return { ok: false, error: i18n.t('main.export.noSegment') }
    const segs = orbSegments.exportSegments()
    if (!segs.length) return { ok: false, error: i18n.t('main.export.noSegment') }
    if (!segs.some((s) => s.sessionId)) return { ok: false, error: i18n.t('main.export.noSession') }

    // 逐段取历史。⚠️ `session.history` 的形状是 `{event:{type,seq,time,data}}` ⇒
    //    **seq 在内层**！旧代码取 `x.seq` ⇒ 恒为 undefined ⇒ lastSeq 永远是 0
    //    （实测两次导出都记成 `exportedUpToSeq=0`，连带 orb 的"已导出"标记也不显示）。
    const parts = []
    let lastSeq = 0
    for (const s of segs) {
      if (!s.sessionId) { parts.push({ seg: s, events: [] }); continue }
      let items = []
      try {
        const r = await dshHistory(s.sessionId)
        items = Array.isArray(r.events) ? r.events : []
      } catch (e) {
        console.log(`[akdagent] export: 段 ${s.segId} 的历史取不到（跳过该段）：${e.message}`)
      }
      for (const x of items) {
        const ev = (x && x.event) || x
        if (ev && typeof ev.seq === 'number') lastSeq = Math.max(lastSeq, ev.seq)
      }
      parts.push({ seg: s, events: items.map((x) => (x && x.event) || x) })
    }
    const md = renderTranscriptMulti(parts, cur)

    // 落盘位置：优先工程目录（有路径的工程），否则 userData
    const projectFile = await querySvProjectName(activeHost()).catch(() => null)
    let dir = app.getPath('userData')
    if (projectFile && /[\\/]/.test(projectFile)) dir = path.dirname(projectFile)
    const base = cur.projectKey ? cur.projectKey.slice(0, 12) : 'temp'
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const file = path.join(dir, `${i18n.t('main.export.fileNamePrefix')}-${base}-${stamp}.md`)
    fs.writeFileSync(file, md, 'utf8')

    // 被导出的**每一段**都打上标记（它们都"不再喂模型"）
    for (const p of parts) orbSegments.markExported(p.seg.segId, lastSeq, file)
    // 换 generation：新段（同工程）⇒ 旧段不再喂模型；新段首个 prompt 前注入摘要
    const next = orbSegments.openSegment(cur.projectKey, cur.projectKey ? 'project' : 'temp')
    next.summaryFromSegId = cur.segId
    orbSegments.requestSummary(next.segId, true)
    orbSegments.save()
    orbSegId = next.segId
    bindOrbSession(null)                      // 换段：先解绑，等下次 ensureOrbSession 再绑新的
    console.log(`[akdagent] exported ${parts.length} seg(s) [${parts.map((p) => p.seg.segId).join(', ')}] ` +
      `(upToSeq=${lastSeq}) -> ${file}; next seg ${next.segId} g${next.gen}`)
    return { ok: true, file, exportedUpToSeq: lastSeq, segments: parts.map((p) => p.seg.segId),
             segId: next.segId, gen: next.gen }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 应答 approval（outcome: allowed-once | rejected）或 question（answer 对象） */
ipcMain.handle('akdagent-agent-respond', async (_e, rpcId, value) => {
  try {
    const r = await dshRespond(String(rpcId), value)
    if (r.accepted) return { ok: true }
    return { ok: false, error: r.reason || i18n.t('main.agent.respondRejected') }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('akdagent-agent-cancel', async () => {
  try {
    if (!orbSessionId) return { ok: true }
    await dshCall('session/cancel', { request: { sessionId: orbSessionId } })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/** 查询 agent 连接状态（orb 加载/打开面板时用，防错过推送） */
ipcMain.handle('akdagent-agent-ready-query', () => agentReadyState())

// ── 生命周期 ───────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 单实例锁没拿到（上面已 app.quit）⇒ 这里什么都不做（避免第二个 host 起起来写坏会话）
  if (!hasSingleLock) return
  try {
    // 客户端界面语言：首次启动按**系统语言**自动选（写入 userData/ui-prefs.json），
    // 之后以该文件为准。必须在建托盘/窗口之前初始化——它们的文案从这里取。
    i18n.init(app)
    // 隐藏所有窗口的应用菜单栏（orb/聊天/设置/弹窗都不显示菜单）
    Menu.setApplicationMenu(null)
    createTray()
    createOrbWindow()
    spawnSttServer()
    // ── P23 孤儿 host 防护（2026-09-17）──────────────────────────────
    // 客户端被强杀/崩溃时，内嵌 host 会残留（quitApp 的 killTree 没机会跑）。下次启动若再新起一个，
    // 就变成**两个 host 写同一个会话** ⇒ DSH 会话日志损坏（实测事故）。单实例锁只挡"两个客户端"，
    // 挡不住孤儿 host ⇒ 这里：**上一次的 host 还活着就复用它**（复用它永远只有一个 host）。
    const prevHost = loadHostRecord()
    if (prevHost && prevHost.port && await probeHost(prevHost.port)) {
      // 0.1.5-rc.2：宿主有鉴权 ⇒ 复用必须带上上次换到的会话 cookie，并**实测确认还能用**。
      // 不能"因为端口有应答就复用"：新版裸请求一律 401，复用等于让 /api/* 全废。
      hostPort = prevHost.port
      hostTokenUrl = prevHost.tokenUrl || null
      hostCookie = prevHost.cookie || null
      const alive = await httpGet(hostPort, '/', { cookie: hostCookie })
      if (alive.status === 200) {
        console.log(`[akdagent] 复用上一次的内嵌 host（端口 ${hostPort} · pid ${prevHost.pid || '?'}）—— 避免起第二个 host`)
      } else {
        // 复用不了就得**杀掉它再重起**：留着一个没人能调的 host 等于两个 host 写同一会话（会损坏日志）
        console.log(`[akdagent] 上一次的 host 在端口 ${hostPort} 上不可用（HTTP ${alive.status}）⇒ 杀掉孤儿 host，重起一个`)
        if (prevHost.pid) killTree(prevHost.pid)
        hostPort = null; hostTokenUrl = null; hostCookie = null
      }
    }
    if (!hostPort) {
      hostPort = await findFreePort()
      hostChild = spawnHost(hostPort)
      saveHostRecord(hostPort, hostChild && hostChild.pid)
    }
    await waitForWeb(hostPort)
    // 会话建好后再落一次盘：复用孤儿 host 时要靠这里的 token/cookie
    saveHostRecord(hostPort, (hostChild && hostChild.pid) || (prevHost && prevHost.pid) || null,
      { tokenUrl: hostTokenUrl, cookie: hostCookie })
    setOrbStatus(true)
    connectAgentMux()
    adoptOrphanSessions()          // fire-and-forget：把段表外的早期孤儿会话登记进来（能显示/能导出）
    // 启动自检①：宿主版本向前更新时，去查 API 文档站时间戳、提示是否要更新本地 api 文档
    //（非阻塞 fire-and-forget：离线/失败都不影响启动；机制见 skills/sv-scripting/api/_sync.json）
    // ⚠️ 分发政策（2026-09-14 定案「不走 github，不自动检测」）⇒ 该自检已改为**纯离线比对 + 本地提示**，
    //   不再抓文档站；查站/复检是开发侧手动动作（tools/api-docs-sync.cjs --check、tools/known-bugs.cjs --check）。
    checkApiDocsVersion()
    // 启动自检②：用户装了新版 SV/IX ⇒ 离线比对包内基线，弹一次系统通知提醒下载最新安装包
    //（不出网、不自动下载；同一 宿主@版本 只提示一次，记录在 userData/host-notice.json）
    checkHostUpgradeNotice()
    // 侧栏面板链路：等桥心跳宣称 panel:true 再启动（最迟重试 30 次 × 10s）
    startPanelBridge()
    // 监听 SV 桥主动推送的工程切换事件（方案 B：桥侧检测，主进程被动接收）
    startProjectEventWatch(onSvProjectSwitched)
    // 开发辅助：AKDAGENT_OPEN_SETTINGS=1 启动即打开设置窗口
    if (process.env.AKDAGENT_OPEN_SETTINGS === '1') setTimeout(openSettings, 800)
    /* 开发辅助：AKDAGENT_OPEN_KEY_PROMPT=1 启动即弹「配置 API 密钥」窗
       —— 录演示视频用（正常逻辑是"无 key 才弹"，配好 key 的人看不到它）。
       不动真实凭据：它只是把那个窗口开出来；「确定」会把输入写进凭据（填或留空都行），
       「稍后配置」只关窗、不会退出应用。
       ⚠️ 它**不是**设置窗的模态子窗（曾经是 —— 那会让设置窗整个不可输入，见 createKeyPromptWindow 注释）。 */
    if (process.env.AKDAGENT_OPEN_KEY_PROMPT === '1') {
      console.log('[akdagent] 开发辅助 AKDAGENT_OPEN_KEY_PROMPT=1 ⇒ 强制打开密钥窗')
      setTimeout(() => createKeyPromptWindow(), 1200)
    }
    // 首次启动：无 DeepSeek key 则弹配置窗（等 settings 就绪后）
    maybeShowKeyPrompt()
  } catch (e) {
    console.error('[akdagent] failed to start:', e)
    /* 启动失败**不能静默退出**（用户只会觉得"点了没反应"，我们也没日志）：
     * 除日志外弹一次原生错误框。自动化验证用 AKDAGENT_NO_DIALOG=1 关掉，
     * 否则模态框会挡住无人值守的测试（看起来"活着"其实在等点击）。 */
    if (process.env.AKDAGENT_NO_DIALOG !== '1') {
      try {
        dialog.showErrorBox('AKDAgent 启动失败 / failed to start',
          String((e && e.message) || e) + '\n\n日志 / log: ' + (safeLogPath || '(不可用)'))
      } catch { /* 弹框失败就算了，日志仍然有 */ }
    }
    quitApp()
  }
})

app.on('window-all-closed', () => {
  console.log('[akdagent] window-all-closed (all windows gone)')
  quitApp()
})

app.on('before-quit', () => {
  quitting = true
  if (hostChild) killTree(hostChild.pid)
  stopSttServer()
})

// ── STT（语音转文字，可选功能：设置里下载模型后启用） ──────────────
// sherpa-onnx 原生 addon 的 ABI 与 Electron 不匹配，故由系统 node 跑独立
// STT 服务（stt-server.js）。模型下载到 userData/stt-models，仅当模型存在
// 才 spawn 服务并通知悬浮球显示语音图标。支持三档模型（light/std/precise）。
const STT_PORT = 3190
/** 端口被旧实例占着时的重试策略（STT_PORT 固定 ⇒ 只能重试，不能换端口） */
const STT_MAX_RETRY = 3
const STT_RETRY_DELAY_MS = 500
let sttChild = null
let sttReady = false
let sttModelId = 'light'
/** 自增令牌：每次 spawn / stop 都换号，作废在途的 exit 与 poll 回调（防旧实例改掉新实例的状态） */
let sttSpawnToken = 0
/** STT 最近一次失败原因（给设置页显示用：打包版曾因 asar 路径静默不可用，用户看不到任何提示） */
let sttLastError = ''

/** 查占用某端口的进程 PID（Windows：netstat -ano）；查不到返回 null。
 *  只用来**告诉用户**是谁占的（自动杀陌生 PID 风险更大，不动手）。 */
function findPortOwner(port) {
  try {
    const r = spawnSync('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true })
    if (!r || r.status !== 0) return null
    // 形如：  TCP    127.0.0.1:3190    0.0.0.0:0    LISTENING    12345
    for (const line of String(r.stdout || '').split(/\r?\n/)) {
      const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
      if (m && Number(m[1]) === Number(port)) return Number(m[2])
    }
    return null
  } catch {
    return null
  }
}

function currentSttModelId() {
  // 优先用已安装的模型；多个已安装时用配置的（sttModelId），否则取第一个
  const installed = sttModel.MODEL_IDS.filter((id) => sttModel.isModelInstalled(app.getPath('userData'), id))
  if (installed.length === 0) return null
  if (installed.includes(sttModelId)) return sttModelId
  return installed[0]
}

function notifySttStatus() {
  const installed = sttModel.isModelInstalled(app.getPath('userData'), currentSttModelId() || 'light')
  if (orbWin && !orbWin.isDestroyed()) {
    orbWin.webContents.send('akdagent-stt-status', installed && sttReady)
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('akdagent-stt-status', {
      installed,
      ready: sttReady,
      error: sttLastError,                    // 语音为什么不可用（打包版曾静默无提示）
      activeId: currentSttModelId(),
      installedModels: sttModel.MODEL_IDS.filter((id) => sttModel.isModelInstalled(app.getPath('userData'), id)),
    })
  }
}

// 启动自检：宿主（SV1/SV2/IX）版本号若"向前更新"，就去查 API 文档站的 JSDoc 生成时间戳，
// 判断本地 skills/sv-scripting/api/*.md 是否需要更新（机制与基线见 skills/sv-scripting/api/_sync.json）。
// 非阻塞：离线、桥没起、工具缺失都只打日志，绝不影响启动。
function checkApiDocsVersion() {
  try {
    const tool = path.join(__dirname, '..', '..', 'tools', 'api-docs-sync.cjs')
    if (!fs.existsSync(tool)) {
      console.log('[api-docs] 未找到 tools/api-docs-sync.cjs（打包版可能未附带），跳过启动自检')
      return
    }
    const child = spawn(resolveNodeBin(), [tool, '--startup'], {
      cwd: path.dirname(tool),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // ⚠️ 不要用 process.stdout.write：打包版没有可写 stdout ⇒ EPIPE 会从数据回调里抛出去
    //    （就是"静默退出"事故的形态之一）。console.* 已由顶部安全网接管（写盘 + 尽力写终端）。
    child.stdout.on('data', (d) => console.log('[api-docs] ' + String(d).replace(/\s+$/, '')))
    child.stderr.on('data', (d) => console.error('[api-docs] ' + String(d).replace(/\s+$/, '')))
    child.on('error', (e) => console.log('[api-docs] 启动自检无法运行：' + e.message))
  } catch (e) {
    console.log('[api-docs] 启动自检异常（已忽略）：' + e.message)
  }
}

/** 工具路径解析：开发态在 <repo>/tools/，打包态在 resources/knowledge/tools/（见 electron-builder.yml extraResources） */
function resolveToolPath(name) {
  const cands = [
    path.join(__dirname, '..', '..', 'tools', name),
    process.resourcesPath ? path.join(process.resourcesPath, 'knowledge', 'tools', name) : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'tools', name) : null,
  ].filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch { /* 忽略 */ } }
  return null
}

// 启动自检②：宿主（SV/IX）升级 ⇒ **离线**比对包内基线（skills/sv-scripting/api/_sync.json 的 hostVersions），
// 弹**一次**系统通知提醒"去下载最新安装包"。
// ⚠️ 政策（用户 2026-09-14 定案）：更新 = 重新分发安装包；客户端**不出网、不自动检测、不自动下载**。
//    这里只读本地文件（工具内部只读 _sync.json + 桥心跳文件），同一 宿主@版本 只提示一次。
function checkHostUpgradeNotice() {
  try {
    const tool = resolveToolPath('host-version-notice.cjs')
    if (!tool) { console.log('[host-notice] 未找到 tools/host-version-notice.cjs（打包版可能未附带），跳过'); return }
    const child = spawn(resolveNodeBin(), [tool, '--json'], {
      cwd: path.dirname(tool),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buf = ''
    child.stdout.on('data', (d) => { buf += String(d) })
    child.stderr.on('data', (d) => console.log('[host-notice] ' + String(d).trim()))
    child.on('error', (e) => console.log('[host-notice] 无法运行：' + e.message))
    child.on('close', () => {
      let payload = null
      try { payload = JSON.parse(buf.trim().split('\n').pop() || 'null') }
      catch (e) { console.log('[host-notice] 结果解析失败：' + e.message); return }
      if (!payload || !payload.notice) { console.log('[host-notice] 宿主版本未超过包内基线 ⇒ 不提示'); return }
      showHostNotice(payload.notice)
    })
  } catch (e) {
    console.log('[host-notice] 异常（已忽略）：' + e.message)
  }
}

function showHostNotice(n) {
  const stateFile = path.join(app.getPath('userData'), 'host-notice.json')
  let seen = {}
  try { seen = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {} } catch { /* 首次或文件损坏都当空 */ }
  const key = n.host + '@' + n.to
  if (seen[key]) { console.log('[host-notice] ' + key + ' 已提示过，跳过'); return }
  const title = i18n.t('notice.hostUpgraded.title')
  const body = i18n.t('notice.hostUpgraded.body', n.hostLabel, n.from, n.to)
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
    else console.log('[host-notice] ' + title + ' — ' + body)
  } catch (e) { console.log('[host-notice] 弹出通知失败：' + e.message) }
  try {
    seen[key] = new Date().toISOString()
    fs.writeFileSync(stateFile, JSON.stringify(seen, null, 1), 'utf8')
  } catch { /* 写不了就下次再提示，不致命 */ }
  console.log('[host-notice] 已提示用户：' + n.hostLabel + ' ' + n.from + ' → ' + n.to)
}

/** 起 STT 服务：**先停旧实例**再 spawn（STT_PORT 固定，旧进程还占着 3190 时新实例会 EADDRINUSE 起崩）。 */
/** STT 服务脚本的**实盘**路径。
 * ⚠️ 打包后 `__dirname` 落在 `app.asar` 里：**asar 路径不能当外部进程的 cwd**（spawn 直接 ENOENT），
 *    而且**系统 node 读不了 asar 内的 js** ⇒ 必须走 asarUnpack 出来的 `app.asar.unpacked`（见 electron-builder.yml）。
 *    （用户 2026-09-19 报的问题：打包版 `stt server spawn 失败：… ENOENT`，语音静默不可用。） */
function resolveSttServerPath() {
  const packed = path.join(__dirname, 'stt-server.js')
  if (!isPackaged) return packed
  const unpacked = packed.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  return fs.existsSync(unpacked) ? unpacked : packed
}

/** STT 子进程的 cwd：必须是**实盘目录**（asar 路径会让 spawn 直接报 ENOENT，且报错内容具有误导性） */
function sttServerCwd() {
  const dir = path.dirname(resolveSttServerPath())
  try {
    if (fs.statSync(dir).isDirectory()) return dir
  } catch { /* 落到下面 */ }
  return app.getPath('userData')
}

function spawnSttServer(id) {
  stopSttServer()
  const targetId = id || currentSttModelId()
  if (!targetId || !sttModel.isModelInstalled(app.getPath('userData'), targetId)) {
    notifySttStatus()
    return
  }
  sttModelId = targetId
  sttLastError = ''                               // 新一轮启动：先清掉上次的失败原因

  /** 单次尝试；端口被占（stderr 出现 EADDRINUSE）由 exit 回调退避重试 */
  const startOnce = (attempt) => {
    const token = ++sttSpawnToken                 // 本次实例的号：后续 stop/spawn 会让它过期
    const nodeBin = resolveNodeBin()
    const serverPath = resolveSttServerPath()
    const modelDir = sttModel.modelDir(app.getPath('userData'), targetId)
    const kind = sttModel.getModelDef(targetId).kind
    console.log(`[akdagent] spawning stt server (model=${targetId} kind=${kind} attempt=${attempt})`)
    const child = spawn(nodeBin, [serverPath, `--port=${STT_PORT}`, `--model=${modelDir}`, `--kind=${kind}`], {
      cwd: sttServerCwd(),          // ⚠️ 实盘目录；asar 路径会让 spawn 报 ENOENT（打包版曾因此静默不可用）
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    sttChild = child
    let addrInUse = false
    let spawnError = null
    child.stderr.on('data', (d) => {
      if (String(d).includes('EADDRINUSE')) addrInUse = true
      // 同 spawnHost：走 console（安全网接管），不直写 process.stderr（打包版 EPIPE）
      console.error('[stt] ' + String(d).replace(/\s+$/, ''))
    })
    // spawn 本身失败（找不到 node.exe 等）时 Node 会发 'error'；**不挂这个监听会直接崩主进程**
    child.on('error', (e) => {
      spawnError = e
      if (token !== sttSpawnToken) return
      console.error(`[akdagent] stt server spawn 失败：${e.message}`)
      sttLastError = `spawn 失败：${e.message}`        // 显示给用户（别静默）
      sttChild = null
      sttReady = false
      notifySttStatus()
    })
    child.on('exit', (code) => {
      if (token !== sttSpawnToken) return          // 过期实例：状态已被新实例接管，不许再改
      if (spawnError) return                       // 已在 'error' 里收尾（spawn 失败后还会来一次 exit）
      console.log(`[akdagent] stt server exited: ${code}`)
      sttChild = null
      sttReady = false
      if (!addrInUse) sttLastError = `stt server 提前退出（exit ${code}）`   // 非端口占用：如实报给界面
      notifySttStatus()
      if (!addrInUse) return
      if (attempt <= STT_MAX_RETRY) {
        console.log(`[akdagent] 端口 ${STT_PORT} 被占用，${STT_RETRY_DELAY_MS}ms 后重试（第 ${attempt} 次）`)
        setTimeout(() => {
          if (token !== sttSpawnToken) return       // 等待期间用户又切了模型 ⇒ 这条重试链作废
          stopSttServer()                           // 重试同样先停旧实例
          startOnce(attempt + 1)
        }, STT_RETRY_DELAY_MS)
      } else {
        // 重试用尽：多半是 taskkill 没杀掉的顽固孤儿占着端口 ⇒ **报出占用者 PID**，
        // 否则用户只看到"起不来"，无从下手（自动杀陌生 PID 风险更大，只指路不动手）
        const owner = findPortOwner(STT_PORT)
        console.error(`[akdagent] stt server 启动失败：端口 ${STT_PORT} 一直被占用（已重试 ${STT_MAX_RETRY} 次），保持未就绪` +
          (owner ? `；占用者 PID=${owner}（可 taskkill /PID ${owner} /F 结束）` : ''))
      }
    })
    const poll = () => {
      if (token !== sttSpawnToken) return          // 过期实例：别把新实例的状态改成"就绪"
      http.get({ host: '127.0.0.1', port: STT_PORT, path: '/health', timeout: 1500 }, (res) => {
        res.resume()
        if (token !== sttSpawnToken) return
        if (res.statusCode === 200) {
          sttReady = true
          sttLastError = ''
          console.log('[akdagent] stt server ready')
          notifySttStatus()
        } else {
          setTimeout(poll, 500)
        }
      }).on('error', () => { if (token === sttSpawnToken) setTimeout(poll, 500) })
    }
    setTimeout(poll, 800)
  }
  startOnce(1)
}

function stopSttServer() {
  sttSpawnToken += 1            // 作废在途的 poll/exit 回调（旧实例不再改状态）
  if (sttChild) {
    killTree(sttChild.pid)
    sttChild = null
    sttReady = false
    // 被杀实例的 exit 回调已被 token 判为过期（不会再推状态）⇒ 这里补一次"未就绪"，
    // 否则切模型的重启窗口内设置页/悬浮球会短暂停在旧的"已就绪"。
    notifySttStatus()
  }
}

/** POST 音频到 STT 服务，返回识别文本 */
function sttTranscribeHttp(audioArray) {
  return new Promise((resolve, reject) => {
    if (!sttReady) {
      reject(new Error(i18n.t('main.stt.notReady')))
      return
    }
    const samples = audioArray instanceof Float32Array ? audioArray : new Float32Array(audioArray || [])
    const body = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
    const req = http.request(
      { host: '127.0.0.1', port: STT_PORT, path: '/stt', method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length } },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            const j = JSON.parse(d)
            if (j.ok) resolve(j.text)
            else reject(new Error(j.error || i18n.t('main.stt.error')))
          } catch {
            reject(new Error(i18n.t('main.stt.invalidResponse')))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── STT IPC ──
/** 查询 STT 状态（模型选项、已装模型、服务是否就绪） */
ipcMain.handle('akdagent-stt-status', () => {
  const installedModels = sttModel.MODEL_IDS.filter((id) => sttModel.isModelInstalled(app.getPath('userData'), id))
  return {
    models: sttModel.MODEL_IDS.map((id) => ({
      id,
      label: sttModel.getModelDef(id).label,
      // 界面按当前语种渲染（label 仅作中文兜底）
      nameKey: sttModel.getModelDef(id).nameKey,
      descKey: sttModel.getModelDef(id).descKey,
      kind: sttModel.getModelDef(id).kind,
      installed: installedModels.includes(id),
    })),
    installedModels,
    activeId: currentSttModelId(),
    ready: sttReady,
    error: sttLastError,                       // 语音不可用的原因（有值就在设置页显示，别静默）
  }
})

/** 下载 STT 模型（进度事件 akdagent-stt-download-progress） */
ipcMain.handle('akdagent-stt-download', async (e, id) => {
  const targetId = id || 'light'
  try {
    await sttModel.downloadModel(app.getPath('userData'), targetId, (done, total, file) => {
      e.sender.send('akdagent-stt-download-progress', { done, total, file })
    })
    // 切换到刚下载的模型
    stopSttServer()
    spawnSttServer(targetId)
    return { ok: true, id: targetId }
  } catch (err) {
    console.error('[akdagent] stt download failed:', err.message)
    return { ok: false, error: err.message }
  }
})

/** 切换当前 STT 模型（已下载的模型间切换） */
ipcMain.handle('akdagent-stt-select', (_e, id) => {
  if (!sttModel.MODEL_IDS.includes(id)) return { ok: false, error: i18n.t('main.stt.unknownModel') }
  if (!sttModel.isModelInstalled(app.getPath('userData'), id)) return { ok: false, error: i18n.t('main.stt.notInstalled') }
  if (id !== currentSttModelId()) {
    stopSttServer()
    spawnSttServer(id)
  }
  return { ok: true, id }
})

/** 删除 STT 模型并停掉服务（若删的是当前模型） */
ipcMain.handle('akdagent-stt-remove', (_e, id) => {
  const targetId = id || currentSttModelId() || 'light'
  if (targetId === currentSttModelId()) {
    stopSttServer()
  }
  sttModel.removeModel(app.getPath('userData'), targetId)
  notifySttStatus()
  return { ok: true }
})

ipcMain.handle('akdagent-stt-transcribe', async (_e, audioArray) => {
  try {
    const text = await sttTranscribeHttp(audioArray)
    return { ok: true, text }
  } catch (e) {
    console.error('[akdagent] stt transcribe failed:', e.message)
    return { ok: false, error: e.message }
  }
})
