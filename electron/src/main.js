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

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, shell, dialog, Notification, net: electronNet } = require('electron')
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
const { HOSTS, pickActiveHost, orderCandidates, typeOf: hostTypeOf, pickHostType, ACE_HOST_TYPE } = require('./host-pick.js')
const { ensureHome, normalizeCredentialsDoc, CRED_REF_RE, writeFileAtomic } = require('./dsh-home.js')
const { ensureAuthBridge, readAuthState, writeAuthCmd } = require('./auth-bridge.js')
const fileIpc = require('./file-ipc.js')
const util = require('node:util')
/* 🆕 2026-10-07：系统代理探测（把"系统里配的代理"变成宿主能吃的 HTTP(S)_PROXY）。
 * 只在起宿主前探一次并缓存；`networkChildEnv()` 是**唯一**给子进程配网络环境的入口。 */
const { decideProxy, childEnvWithProxy } = require('./system-proxy.js')
/* 🆕 2026-10-08：STT 模型下载走 Electron 网络栈（跟随系统代理）。 */
const { createElectronDownloader } = require('./download-transport.js')
let proxyDecision = null
/** 上次探测的时刻 + 重探节流窗口（见 `bringUpHost` 里的重探）。 */
let networkProbedAt = 0
const NETWORK_REPROBE_MS = 20000
/** 子进程要用的 env（在启动时快照的 process.env 基础上叠加代理决定）。
 *  ⛔ 绝不改 `process.env`：`app.relaunch()` 必须继承启动时的原环境。 */
function networkChildEnv() {
  return childEnvWithProxy(process.env, proxyDecision)
}
/** 路由指纹：只用来判断"这次探到的和上次是不是同一条路"（不含任何凭据）。 */
function routeFingerprint(d) {
  if (!d) return ''
  return [d.use, d.proxy || '', (d.httpProxy || ''), (d.httpsProxy || '')].join('|')
}
/** 探一次网络路由并缓存 + 记日志。
 *  🆕 2026-10-08：**不再只在启动时探一次** —— `bringUpHost` 每次起宿主前也会调（见那里），
 *  这样"宿主崩了重试 / 手动重启宿主"这些路径都会重新看一眼系统代理（用户中途开代理的场景）。
 *  ⚠️ 但它**不会**改变一个已运行宿主的路由：宿主是在 boot 第一步按 env 装 undici dispatcher 的，
 *     改了代理必须**重启宿主**才生效 —— 所以路由变了这里会明确打一行"需要重启助手"。
 *  fail-soft：任何异常都退回直连，绝不因此拦住启动。 */
async function probeNetworkRoute(reason) {
  const before = routeFingerprint(proxyDecision)
  try {
    proxyDecision = await decideProxy({ env: process.env })
  } catch (e) {
    proxyDecision = { use: 'direct', detail: '探测系统代理异常（' + ((e && e.message) || e) + '）⇒ 直连', note: [] }
  }
  const after = routeFingerprint(proxyDecision)
  networkProbedAt = Date.now()
  console.log(`[akdagent] 网络路由（${reason}）：` + proxyDecision.detail
    + (proxyDecision.proxy ? '（' + proxyDecision.proxy + '）' : ''))
  if (before && before !== after) {
    console.log('[akdagent]   · 网络路由**变了**（' + before + ' → ' + after + '）⇒ 已在跑的宿主不会自动切换，'
      + '需要重启助手才生效（宿主只在 boot 第一步按 env 装代理 dispatcher）')
  }
  for (const n of proxyDecision.note || []) if (n) console.log('[akdagent]   · ' + n)
  return proxyDecision
}

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
      /* 🆕 2026-10-07（"再次检查"时补的一个洞）：**日志落盘前也要脱敏**。
       *   为什么现在才补：这一轮把日志尾部（`logTail`）写进了**用户回传的** `host-crash.json`，
       *   而排障说明也让用户直接把 `akdagent.log` 发来 ⇒ 日志里若有明文密钥，等于我们主动收集它。
       *   宿主 stderr / 厂商错误原文里出现 `token=…`、`api_key: …` 这种回显是完全可能的
       *   （例：`[dsh] dsh web: http://127.0.0.1:PORT/?token=…` 那行本身就带一个会话 token）。
       *   ⇒ 在**唯一写盘点**统一遮掉。代价：日志里看不到 key 形状 —— 那个本来由
       *   `keyShapeWarning()` 单独报（只看形状、不泄漏值）。 */
      try { fs.appendFileSync(safeLogPath, `${new Date().toISOString()} ${level} ${redactForCrash(line)}\n`, 'utf8') }
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

/* ── 子进程输出的**分级转发**（2026-10-05，用户裁「6 做」）────────────────────────
 * 以前 `child.stderr.on('data')` 一律 `console.error` ⇒ 日志里全是 ERROR，其中包括：
 *   · `(node:29008) [MODULE_TYPELESS_PACKAGE_JSON] Warning: …`  ← Node 的无害警告
 *   · `[stt] [stt-server] model loaded / listening on http://127.0.0.1:3190`  ← 正常启动
 *   · `[akdagent] turn/end reason = {"kind":"aborted","reason":{"kind":"user"}}` ← 用户自己按了停
 * 后果两条：① 用户翻日志以为坏了（当年"启动横幅被当 ERROR"就是这个坑，为此把横幅改成默认静音）；
 * ② **真故障被淹**（401 / 宿主动模态框 / 凭据被拒 都埋在这一屏 ERROR 里）。
 * 判据：Node 警告降 WARN、已知正常生命周期行降 INFO、**其余保持 ERROR**（真故障仍要显眼）。 */
const CHILD_LINE_WARN = /\(node:\d+\)|Warning:|DeprecationWarning|ExperimentalWarning|MODULE_TYPELESS_PACKAGE_JSON/
/* ⚠️ 前缀是**子进程自己打印**的 `[stt-server]`（`[stt]` 那个方括号是我们转发时加的 tag）——
 *   第一版写成 `^\[stt\]` ⇒ 真实行匹配不上、`model loaded` 照样记 ERROR（是本守卫的样本表抓出来的）。 */
const CHILD_LINE_INFO = /^\[stt(-server)?\][^\n]*\b(model loaded|listening on https?:\/\/127\.0\.0\.1:)/i
/* ⚠️ 2026-10-05 实测补：Node 那条 `MODULE_TYPELESS_PACKAGE_JSON` 警告是**四行**的，只有第一行含 "Warning" ⇒
 *   首行降 WARN 后，后三行（`Reparsing as ES module…` / `To eliminate this warning…` / `(Use \`node --trace-warnings…`）
 *   仍是 ERROR，日志里看着还是"有错"。这行专门认这三句。 */
const CHILD_LINE_WARN_CONT = /^Reparsing as ES module\b|^To eliminate this warning\b|^\(Use `node --trace-warnings/
/** 把一段子进程输出按**逐行**分级写日志（`tag` 形如 `[dsh:err]` / `[stt]`） */
function logChildOutput(tag, text) {
  for (const raw of String(text).replace(/\s+$/, '').split('\n')) {
    if (!raw.trim()) continue
    const line = tag + ' ' + raw
    if (CHILD_LINE_WARN.test(raw) || CHILD_LINE_WARN_CONT.test(raw)) console.warn(line)
    else if (CHILD_LINE_INFO.test(raw)) console.log(line)
    else console.error(line)
  }
}

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
 * 但万一被外部环境变量注入了就会指向一个不存在的地方，那才是真麻烦。
 * 🆕 2026-09-27：`AKDAGENT_HOME_DIR` 可覆盖（**只给测试/仿真用**，与 `AKDAGENT_DSH_HOME_DIR` 同族）：
 *   于是 `.dsh`（源）+ `.dsh-akdagent`（隔离家目录）一起挪到临时目录 ⇒ 能**不碰真实数据**地
 *   模拟"干净机器"（没凭据 / 没配 SV 目录 / 首次启动）。
 *   ⚠️ **别用覆盖 `USERPROFILE` 的办法**：Electron 会解析不出 `userData`（实测 `Failed to get 'userData' path`），
 *   连单实例锁都会误判成"已有实例在运行"。 */
const HOME_DIR = process.env.AKDAGENT_HOME_DIR
  || (process.platform === 'win32' ? process.env.USERPROFILE : null)
  || os.homedir()

// ── DSH 设置读写 ───────────────────────────────────────────────────
// ⛔ 2026-09-28（用户报「AKDAgent 夺舍了 DSH」· 方案 ABCD）：**与用户自己的 DSH 彻底分离**
//   · `SOURCE_*` = 用户自己那份 `~/.dsh` ⇒ **只读**（首次导入 / 界面展示的回退），我们一个字都不写、也不建那个目录；
//   · `OWNED_*`  = 我们自己的那份（隔离家目录 `~/.dsh-akdagent`）⇒ **读写目标**，宿主真正读的就是它。
//   （`OWNED_*` 在下面 `AKDAGENT_DSH_HOME` 定义处声明 —— 那两个常量依赖它。）
const SOURCE_SETTINGS_PATH = path.join(HOME_DIR, '.dsh', 'settings.yaml')
// 聊天「段表」：记录每个会话段的工程归属（显示全量 + 模型只喂当前段），见 docs/聊天记录归属设计.md
const orbSegments = require('./orb-segments.js')
const ORB_SEGMENTS_PATH = path.join(app.getPath('userData'), 'orb-segments.json')
orbSegments.init(ORB_SEGMENTS_PATH)

function readSettings() {
  /* 先读**我们自己的**（宿主读的那份），没有再退回用户的源（**只读**：首次导入 / 界面展示用）。
   * ⛔ 一律不写源；写走 writeSettings（→ OWNED）。 */
  for (const p of [OWNED_SETTINGS_PATH, SOURCE_SETTINGS_PATH]) {
    try {
      if (!fs.existsSync(p)) continue
      return yaml.load(fs.readFileSync(p, 'utf8')) || {}
    } catch (e) {
      console.error('[akdagent] read settings failed (' + p + '):', e.message)
    }
  }
  return {}
}

function writeSettings(obj) {
  const dir = path.dirname(OWNED_SETTINGS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })   // 建的是**我们自己的**目录（不是 ~/.dsh）
  // 保持紧凑但可读的 YAML（2 空格缩进）
  const out = yaml.dump(obj, { indent: 2, lineWidth: -1 })
  // 原子写（2026-09-27）：宿主 chokidar 守着这份文件，别让它在"已清空还没写完"的瞬间读到半截
  /* 🆕 2026-10-05：**如实回报写盘结果**（返回 false = 没写进去）——
   *   以前这里失败只 `console.error` 就往回走 ⇒ 每个写设置的 IPC 都回 `ok:true`，
   *   而界面**早就准备好**显示错误了（settings.html 里多处 `if (!r || r.ok === false) alert(r.error || …)`）
   *   ⇒ 于是"settings.yaml 只读 / 被杀软锁住 / 磁盘满"时用户被骗：明明改了默认模型、重启又变回去，
   *     与当年那条「界面说配好了、宿主其实没 key」是同一类哑失败（H4）。 */
  /* 🆕 2026-10-07：同样**显式 0600**。settings.yaml 里会有内联密钥（api-key 登录流就写在这），
   *   而 `~/.dsh-akdagent` 是隔离家目录 ⇒ 没有理由让同机其他人读得到。（宿主对 settings 不做权限校验，
   *   这条是安全默认，不是它逼的；凭据那条才是硬要求 —— 见 writeCredentials。） */
  const wrote = writeFileAtomic(OWNED_SETTINGS_PATH, out, { mode: 0o600 })
  if (!wrote) console.error('[akdagent] 写 settings.yaml 失败（权限/杀软？）：' + OWNED_SETTINGS_PATH)
  // ⛔ 不再镜像回 `~/.dsh`（源只读）：宿主读的就是上面这份
  return wrote
}

/** 合并局部设置到 settings.yaml（只动给定路径，保留其他键）；**返回是否真的写进去了**（2026-10-05） */
function patchSettings(patch) {
  const cur = readSettings()
  const next = { ...cur, ...patch }
  const wrote = writeSettings(next)
  return { settings: readSettings(), wrote }
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
    /* `v` = **启动这个宿主的客户端版本**（2026-09-26 加）。复用判定要比它：老客户端起的宿主
     *  体内没有客户端侧的修复（凭据同步等），复用它 = 「升级了却还在跑旧逻辑」—— 本次事故
     *  （装 1.0.1 仍报错、手工 copy 却好）就是这个：复用了 1.0.0 时期起的孤儿宿主。
     *
     * 🆕 2026-10-05（用户裁「8 做」）：**只落 `tokenUrl`，不再落 `cookie`**。
     *   0.1.5-rc.2 的复用确实要同一套会话凭据，但 `cookie` 可以用 `tokenUrl` **现换**（bringUpHost 里就是
     *   这么做的）⇒ 没必要把一份 30 天有效的 `dsh-auth-…` 明文留在 %APPDATA% 里（它对"复用"不是必需的）。
     *   老记录里的 `cookie` 字段被忽略、下次写盘即被清掉。 */
    const rec = { port, pid: pid || null, at: Date.now(), v: app.getVersion() }
    if (session && session.tokenUrl) rec.tokenUrl = session.tokenUrl
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
      /* 宿主已经死了就别等了（2026-09-27）：以前要干等到 90 秒上限才报"没起来"，
       * 而真正的原因（boot 报错）早就写进 stderr 了 ⇒ 现在立刻失败，让启动重试马上接手。 */
      if (hostExited) {
        return reject(new Error('宿主进程在就绪前退出（' + (hostExitInfo ? 'code=' + hostExitInfo.code : '未知') + '）'))
      }
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

/* ── 「谁的」两份路径（2026-09-28 · 方案 ABCD）────────────────────────────
 * 用户报「AKDAgent 夺舍了 DSH」⇒ 定下：**用户那份 `~/.dsh` 只读，我们只写自己那份。**
 *   · OWNED_*  = `~/.dsh-akdagent/*`（隔离家目录）⇒ **一切写入的唯一目标**；宿主读的就是它。
 *   · SOURCE_* = `~/.dsh/*`（用户自己的 DSH）⇒ **只读**：首次导入（见 dsh-home.ensureHome）
 *                与 readSettings/readCredentials 的回退；**绝不写、绝不建目录、绝不 .bak**。 */
const OWNED_CREDENTIALS_PATH = path.join(AKDAGENT_DSH_HOME, '.credentials.yaml')
const OWNED_SETTINGS_PATH = path.join(AKDAGENT_DSH_HOME, 'settings.yaml')
const SOURCE_CREDENTIALS_PATH = path.join(DSH_SOURCE_HOME, '.credentials.yaml')

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
 * 所以：**注册前先自检；不自检通过就不注册** —— 宁可少 44 个 SV/IX 工具，也不能让聊天整轮失败。
 * 已存在的注册**一律不动**（只体检 + 留痕），避免把用户本来能用的配置改坏。
 *
 * 🆕 2026-10-05（用户裁「调大 + 失败重试一次」）：**预算 6s → 20s，且失败重试一次**。
 *   起因：本机日志 2026-10-04T03:30 落过一次 `ok:false / why:'6000ms 内没跑完 initialize+tools/list'`，
 *   而实测（`tools/measure-mcp-handshake.cjs`，官方 SDK 客户端）本机 `initialize+tools/list` 只要 **~0.5 s**
 *   ⇒ 那次是"机器正忙"的环境性问题。但**干净机器第一次冷启动**要先过 Defender 扫 86 MB `node_modules`
 *   + 240 MB `models`，而"自检不过 ⇒ 不写注册" ⇒ 一次偶发超时 = **用户一颗 mcp__sv__* 工具都没有**，
 *   界面上还完全看不出来（球是绿的、聊天能用）。所以：预算放宽到 20s（≈40× 余量），且给第二次机会
 *   （第二次基本命中文件缓存），并把**每次的 why 与第几次通过**都留痕到 `mcp-selftest.json`。
 */
const MCP_SELFTEST_TIMEOUT_MS = 20000
const MCP_SELFTEST_ATTEMPTS = 2

/** 单次自检：真起一次 server，做 initialize + tools/list（超时/退出/空列表都算不过） */
function mcpSelfTestOnce(nodeBin, serverEntry, timeoutMs = MCP_SELFTEST_TIMEOUT_MS) {
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
      child = spawn(nodeBin, [serverEntry], { env: networkChildEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
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
 * 带重试的自检（2026-10-05，用户裁「调大 + 失败重试一次」）。
 * 返回 `{ok, tools?, why?, attempts, tried[]}`：`attempts` = 第几次通过（或总共试了几次），
 * `tried` = 每次失败的原因（落进 `mcp-selftest.json`，报障时一眼看出"是偶发还是真起不来"）。
 */
async function mcpSelfTest(nodeBin, serverEntry, timeoutMs = MCP_SELFTEST_TIMEOUT_MS, attempts = MCP_SELFTEST_ATTEMPTS) {
  const tried = []
  const n = Math.max(1, attempts | 0)
  for (let i = 1; i <= n; i++) {
    const r = await mcpSelfTestOnce(nodeBin, serverEntry, timeoutMs)
    if (r.ok) {
      if (i > 1) console.log(`[akdagent] MCP 自检第 ${i}/${n} 次通过（前 ${i - 1} 次：${tried.join(' / ')}）`)
      return { ...r, attempts: i, tried }
    }
    tried.push(r.why)
    /* 只有"还有下一次"时才报第几次 —— 最后一次不重复刷（下面 !ok 分支会统一报） */
    if (i < n) console.error(`[akdagent] MCP 自检第 ${i}/${n} 次未通过：${r.why} ⇒ 立刻重试一次`)
  }
  return { ok: false, why: tried[tried.length - 1] || '自检失败', attempts: n, tried }
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
  /* 🆕 2026-10-05（用户裁「i18n 走」）：这一层的文案**全部搬进字典**（`main.turnError.*` × 4 语）。
   *   ⚠️ 两条纪律：① 这些行是 `textContent` 渲染 ⇒ 字典里**不许有 markdown**；
   *   ② 判据仍是**抠出来真跑**（守卫 §⑨：14 条样本 + 实证原文），所以文案改了不会偷偷失效。 */
  if (code === 'AUTH' || status === 401) return i18n.t('main.turnError.auth')
  if (status === 402 || /balance|quota|欠费|insufficient/i.test(msg)) return i18n.t('main.turnError.balance')
  if (status === 429 || /rate.?limit|too many|限流/i.test(msg)) return i18n.t('main.turnError.rateLimit')
  if (status === 403) return i18n.t('main.turnError.forbidden')
  if (code === 'TRANSPORT' || /fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|getaddrinfo|socket hang up/i.test(msg)) return i18n.t('main.turnError.transport')
  if (code === 'REQUEST_EXTENSION') return i18n.t('main.turnError.extension')
  /* 🆕 2026-09-27（用户现场实测）：宿主里没有可解析的默认模型时，每一轮都以这句结束 ——
   * 用户界面上只看到"回合结束（error）"，不可能知道要去配模型。这条映射就是给那一刻用的。 */
  if (/has no provider\/model|no provider\/model/i.test(msg)) return i18n.t('main.turnError.noModel')
  /* 🆕 2026-10-05（用户拿回的 `last-turn-error.json` 实证 · 1.0.3 报障的真因）：
   *   **模型名写错**是"配置好之后还是 error"的第三张脸。实测原文：
   *     `{code:'INVALID_REQUEST', status:400, message:'The supported API model names are deepseek-flash,
   *      deepseek-v4-pro, but you passed DeepSeek-V4.1-Flash. (request_id: …)'}`
   *   用户把**显示名**当 id 填了 —— DSH 内建目录里 `id:"deepseek-flash"` 的 `name` 恰好是
   *   `DeepSeek-V41-Flash`（`@deepseek-ai/dsh-llm-deepseek/lib/index.js` 实测），跟 id 一点不像；
   *   而 1.0.3 的设置页**看不到内置目录**、只能手打 id（见交接文档 §19 那条隐患）⇒ 必然踩。
   *   ⇒ 这条映射**把提供方自己给的"支持哪些"解析出来**摆给用户，并指路"点选、别手打"。
   *   ⚠️ "有名字/有清单"四种组合各有一条文案（占位符为空会让句子读不通，所以**由代码选键**）。 */
  if (status === 400 && /model/i.test(msg)
      && /supported API model names|but you passed|invalid model|model not found|does not exist/i.test(msg)) {
    /* ⚠️ 模型名里**可以有点**（实证 `DeepSeek-V4.1-Flash`）⇒ 别把 `.` 当分隔符写进字符集，
     *    否则捕获到一半（守卫 §⑨ 第一次跑就抓到 `DeepSeek-V4`）；改成"捕到空白/逗号为止，再削尾部标点"。 */
    const passed = ((msg.match(/but you passed\s+([^\s,;)]+)/i) || [])[1] || '').replace(/[.,;:]+$/, '')
    const sup = ((msg.match(/supported API model names are\s+(.+?)(?:,\s*but you passed|[.;]|$)/i) || [])[1] || '').trim()
    if (passed && sup) return i18n.t('main.turnError.badModelFull', passed, sup)
    if (passed) return i18n.t('main.turnError.badModelOnlyName', passed)
    if (sup) return i18n.t('main.turnError.badModelOnlyList', sup)
    return i18n.t('main.turnError.badModelBare')
  }
  if (status >= 500) return i18n.t('main.turnError.server')
  /* 🆕 2026-10-05：**不再返回空串**（空串 = 用户什么也看不到）——交给 turnErrorRaw() 兜底。
   *   旧行为：`return ''` ⇒ 调用点 `if (hint)` 不成立 ⇒ 界面只剩「回合结束（error）」。 */
  return turnErrorRaw(e)
}

/**
 * 兜底：映射翻不出来时，把**原始签名**摆到用户眼前（2026-10-05，用户裁「做」）。
 *
 * 起因：1.0.3 用户报「配置好之后对话还是直接输出 error」。那一刻的必然序列：
 *   reason 的 code/message 不在上面那张映射表里 ⇒ 旧 `turnErrorHint()` 返回**空串** ⇒
 *   ① 悬浮球那条提示**根本不推**（`if (hint)` 不成立）；② 对话里只剩 `orb.turn.end` 渲染的
 *   「回合结束（error）」—— 用户没有线索，我们手里也没有（`last-turn-error.json` 他不会主动去找）。
 * ⇒ 现在：code / HTTP status / message 各取一点（message 截 200 字），走 i18n 拼成一句话。
 * ⚠️ 本函数**只依赖 i18n**、不碰本文件其它符号 —— `tools/check-turn-error-log.cjs` 会把它
 *   连同 `turnErrorHint()` 一起抠出来真跑样本表（源码看着对 ≠ 真能出话）。
 */
function turnErrorRaw(e) {
  if (!e || typeof e !== 'object') return ''
  const bits = []
  const code = String(e.code == null ? '' : e.code).trim()
  const status = Number(e.status || 0)
  const msg = String(e.message == null ? '' : e.message).replace(/\s+/g, ' ').trim()
  if (code) bits.push(code)
  if (status) bits.push('HTTP ' + status)
  if (msg) bits.push(msg.length > 200 ? msg.slice(0, 200) + '…' : msg)
  if (!bits.length) {
    // 连 message/status/code 都没有（例如 reason 本身才是线索）⇒ 原样序列化，别交白卷
    let s = ''
    try { s = JSON.stringify(e) } catch { s = '' }
    if (s && s !== '{}' && s !== 'null') bits.push(s.length > 200 ? s.slice(0, 200) + '…' : s)
  }
  if (!bits.length) return ''
  return i18n.t('main.turnError.raw', bits.join(' · '))
}

/** 把"这一轮为什么失败"推给**所有**用户看得见的对话界面（2026-10-05）。
 *  以前只推悬浮球（`notifyOrb`），两个侧栏面板一个字都没有；而且映射不中时连悬浮球也不推。
 *  ⚠️ 调用方必须保证**顺序**：先把 `turn/end` 事件送进对话，再调本函数 ——
 *     否则「⚠ 原因」会排在「回合结束（error）」**上面**，读起来像两条无关的消息。 */
function pushTurnFailNotice(text) {
  if (!text) return
  notifyOrb('warn', text)
  for (const h of HOSTS) {
    const b = panelBridges[h]
    if (!b || !b.status.ready) continue
    try { b.pushOutput(text) } catch (e) { console.log(`[panel] 推失败原因异常（host=${h}）：` + e.message) }
  }
}

/** 往悬浮球/面板推一条**用户可见**的提示（2026-09-27）。
 *  为什么需要：诊断信息以前只写日志 —— 界面上永远只有一句"回合结束（error）"，
 *  而用户不可能去看 akdagent.log。有了它，"为什么错、去哪儿配"能直接摆在用户面前。 */
function notifyOrb(level, text) {
  try {
    if (!text) return
    if (orbWin && !orbWin.isDestroyed()) {
      orbWin.webContents.send('akdagent-notice', { level: level || 'warn', text: String(text) })
    }
  } catch { /* 推送失败不影响主流程 */ }
}

/**
 * 开机自检：**聊天要能用，必须有一个"可解析"的默认模型**（provider + model，且该 model 在列表里）。
 *
 * 为什么（2026-09-27 用户现场）：设置里把模型删空（或从没选过）之后，宿主每一轮都以
 * `agent "…" has no provider/model` 失败；而界面上只有「回合结束（error）」，
 * 用户不可能知道要去配模型 —— 只能报"又 error 了"。这里开机就说清楚。
 * @returns {boolean} 配置是否可用（读不到设置时返回 true，不打扰）
 */
function checkAgentModelConfigured() {
  try {
    const s = readSettings()
    const adm = s['agent-default-model'] || {}
    const provider = String(adm.provider || '')
    const model = String(adm.model || '')
    const dsModels = ((s['llm-deepseek'] || {}).models) || []
    const piProviders = ((s['llm-pi-ai'] || {}).providers) || {}
    let ok = false
    let why = ''
    if (!provider || !model) {
      why = i18n.t('main.model.notSet')
    } else if (provider === 'deepseek-official') {
      /* ⚠️ 2026-10-03 修（残留）：`llm-deepseek.models` 是**自定义 / 覆盖**列表 —— **空 ≠ 没有模型**：
       *   空的时候宿主用**运行时内置目录**（deepseek-flash / deepseek-v4-flash / deepseek-v4-pro /
       *   deepseek-v4-flash-vision-exp），产品文案也是这么写的（settings.json 的
       *   `settings.model.emptyHintBuiltin`：空列表 ⇒ 用 DSH 内置目录）。
       *   旧判据把空列表当成"模型列表为空"⇒ **每次启动都误报**
       *   「默认模型「deepseek-flash」不在模型列表里（可能已被删掉）」并弹悬浮球
       *   （现场：客户端日志 2026-09-27T09:58 与 2026-10-03T12:51 各一条），可模型其实是好的。
       *   ⇒ 现在：空列表 ⇒ 交给内置目录（不判、不报）；只有**配了自定义列表**时才要求命中。 */
      ok = !dsModels.length || dsModels.some((m) => m && m.id === model)
      if (!ok) why = i18n.t('main.model.notInList', model)
    } else {
      const p = piProviders[provider]
      /* ⚠️ 2026-10-05（**与 deepseek 那条同一个坑，上次只修了 deepseek**）：
       *   pi-ai 的 `providers.<route>.models` 同样是**覆写**列表 —— **空 = 删键回提供方内建目录**
       *   （settings.html 的删除逻辑自带注释"空数组 ⇒ 删键（回内建目录）"，空列表时界面还专门显示
       *     `settings.model.emptyHintPiAi` 提示）。旧判据要求"必须命中 p.models" ⇒
       *   用户把列表删光（= 回内建）后，**每次启动都会误报**「默认模型不在模型列表里（可能已被删掉）」
       *   并弹悬浮球，而模型其实是好的（与 2026-10-03 那条现场一模一样）。
       *   ⇒ 规则对齐 deepseek：**提供方在、且没配自定义列表 ⇒ 不判**；配了列表才要求命中。
       *   （提供方路由整个不存在 ⇒ 仍然报，那是真的没配。） */
      const custom = p && Array.isArray(p.models) ? p.models : []
      ok = !!p && (!custom.length || custom.some((m) => m && m.id === model))
      if (!ok) why = i18n.t('main.model.notInList', model)
    }
    if (ok) {
      /* 🆕 2026-10-05（1.0.3 报障 `but you passed DeepSeek-V4.1-Flash`）：上面那两条只判"在不在**用户列表**里"，
       *   而用户把**显示名**当 id 填进去时，它**确实在列表里** ⇒ 一路绿灯，直到每轮 400 才发现。
       *   ⇒ 再拿**宿主真目录**（`session/modelCatalog`）复核一次"这个 id 到底存不存在"。
       *   ⚠️ 只在**没有自定义列表**时查：有自定义列表 ⇒ 以用户的列表为准（目录里查不到是正常的，
       *      10-03 / 10-05 两次"空列表误报"的教训就在上面）。读不到目录（宿主没起）⇒ **不猜、不报**。 */
      const custom = provider === 'deepseek-official'
        ? (dsModels.length > 0)
        : (() => { const p = piProviders[provider]; return !!(p && Array.isArray(p.models) && p.models.length) })()
      if (!custom) checkAgentModelInCatalog(provider, model).catch(() => { /* 目录问题不打扰用户 */ })
      return true
    }
    console.log('[akdagent] ⚠ 默认模型不可用：' + why + '（聊天会每轮以 no provider/model 失败）')
    notifyOrb('warn', why)
    return false
  } catch (e) {
    console.log('[akdagent] 模型自检出错（忽略）：' + (e && e.message ? e.message : e))
    return true
  }
}

/**
 * 拿**宿主真目录**复核默认模型（2026-10-05，1.0.3 报障 `but you passed DeepSeek-V4.1-Flash`）。
 *
 * 实证：用户把显示名当 id 用（宿主目录里 `id:"deepseek-flash"` 的 `name` 是 `DeepSeek-V41-Flash`），
 * 而那一版设置页**看不到目录**、只能手打 ⇒ 每一轮 400 `INVALID_REQUEST`，界面上却只有「回合结束（error）」。
 * 只判**没法自己发现**的那种情况（目录里查得到的提供方 + 目录非空 + id 不在其中）。
 * 读不到目录 / 目录里没这个提供方 ⇒ **不猜、不报**（宁可少提醒，也别再造一次"空列表误报"）。
 */
async function checkAgentModelInCatalog(provider, model) {
  let cat = null
  try { cat = await readModelCatalog(false) } catch { return }
  const groups = (cat && Array.isArray(cat.groups)) ? cat.groups : []
  const g = groups.find((x) => x && x.id === provider)
  const ids = (g && Array.isArray(g.models) ? g.models : []).map((m) => m && m.id).filter(Boolean)
  if (!ids.length) return
  if (ids.includes(model)) return
  const hint = i18n.t('main.model.notInCatalog', model, ids.join(' / '))
  console.error('[akdagent] ⚠ 默认模型不在宿主目录里：' + hint)
  notifyOrb('warn', hint)
}

async function ensureMcpRegistration() {  try {
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
    /* ⚠️ 只认**活着的**行（行首 `- id:`）—— 消毒器会把"运行时解析不到"的条目**注释掉**，
     *   用子串判断会把注释行当成"已注册" ⇒ 永不补回（2026-10-07 订阅登录桥就是被这个形状咬的）。 */
    const alreadyRegistered = /^\s*-\s*id:\s*mcp-akdagent\s*$/m.test(text)
    const nodeBin = shortPathIfSpaced(resolveNodeBin()).replace(/\\/g, '/')

    /* ── 自检（2026-09-26 新增）──────────────────────────────────────────────
     * 每次启动都真起一次 server 做 initialize + tools/list，并把结果留痕到
     * userData/mcp-selftest.json ⇒ 以后"聊天一直报回合结束（error）"这类报障，
     * 一眼就能看出是不是 MCP 起不来（旧版这里完全无痕，只能靠用户猜）。 */
    const st = await mcpSelfTest(nodeBin, serverEntry)
    try {
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'mcp-selftest.json'),
        JSON.stringify({
          at: new Date().toISOString(), ok: st.ok, tools: st.tools || 0, why: st.why || '',
          /* 🆕 2026-10-05：把"第几次通过 / 每次为什么没过"也留痕 ——
           *   报障时一句话分清"偶发超时（第 2 次过了）"与"真起不来（两次都失败）"。
           *   预算也从 6s 放宽到 20s（见 mcpSelfTest 注释）。 */
          attempts: st.attempts || 0, tried: st.tried || [], timeoutMs: MCP_SELFTEST_TIMEOUT_MS,
          serverEntry, nodeBin,
        }, null, 2),
        'utf8'
      )
    } catch { /* 写不了就算了，不影响注册逻辑 */ }

    if (!st.ok) {
      console.error(`[akdagent] MCP 自检未通过（试了 ${st.attempts} 次、每次 ${MCP_SELFTEST_TIMEOUT_MS}ms 预算）：${st.why}`)
      if (alreadyRegistered) {
        console.error('[akdagent] 注册已存在 ⇒ 保持不动（不动用户配置）。若"每条消息都 回合结束（error）"，'
          + '可把 profile 里 `id: mcp-akdagent` 那段整段注释掉再试 —— 只是没有 mcp__sv__* 工具，聊天照常')
      } else {
        console.error('[akdagent] ⇒ 本次**不写入** MCP 注册（宁可少 44 个 SV/IX 工具，也不能让每轮请求都失败）')
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
  const env = networkChildEnv()
  /* ⛔ 2026-09-28（方案 D · 与用户自己的 DSH 彻底分离）：**别把用户环境里的 `DSH_*` 继承给内嵌宿主。**
   *   以前是 `{...process.env}` 原样透传（只删了 `DSH_OPEN_INBOX`）⇒ 用户自己设过的 `DSH_*`
   *   （profile / 端口 / 各种开关，或者指向他自己的家目录）会被内嵌宿主吃进去，行为变得不可预测 ——
   *   这正是"两个 DSH 互相串"的一条。现在：先清掉所有继承来的 `DSH_*`，**只留下面我们自己设的两个**。 */
  const droppedDshEnv = []
  for (const k of Object.keys(env)) {
    if (/^DSH_/i.test(k)) { droppedDshEnv.push(k); delete env[k] }
  }
  if (droppedDshEnv.length) {
    console.log('[akdagent] 已隔离环境变量：忽略继承来的 ' + droppedDshEnv.join(', ') +
      '（内嵌宿主只用我们设的 DSH_HOME / DSH_BUNDLED_SKILL_DIR）')
  }
  /* ⛔ 凭据/设置的启动同步**不在这里**（2026-09-26 热修）：
   *  `spawnHost()` 只在"没得复用"时被调（ready 段的 `if (!hostPort)`）⇒ 一旦复用孤儿 host
   *  就整段跳过 ⇒ 用户「装了新版还是每轮 AUTH/401」，而手工 copy 凭据却立刻好
   *  （宿主对 `$DSH_HOME/.credentials.yaml` 是 chokidar 热重载，与客户端版本无关）。
   *  ⇒ 已移到 ready 段**复用判定之前**（搜 `ensureAkdagentDshHome()` 的另一个调用点）。
   *  下面两条留在原地是对的：它们改的是 profile 里的 MCP 注册，复用旧 host 时改了也不生效
   *  （要新起的宿主才会读），而凭据是热重载的 ⇒ 两者处理方式本来就不同。 */
  // P13：profile 里要有 MCP 注册（指向随包分发的 server）——干净机器靠这一步
  ensureMcpRegistration()
  // P11：MCP 注册的 node 路径必须**不含空格**（旧运行时会按空格切开 command ⇒ MCP 起不来）
  ensureSpaceFreeMcpCommand()
  /* 订阅登录（OAuth）桥：profile 里挂 `@deepseek-ai/dsh-authorization` 服务 + 我们的只读快照插件。
   * ⚠️ 与上面两条同类：改的是 **profile**（宿主只在**新起**时读）⇒ 复用孤儿宿主时本次改动不生效。
   * ⛔ fail-soft：`auth-bridge.js` 保证"名字解析不到就不写那一行" —— 坏 patch 会让宿主整棵插件树加载失败。 */
  try {
    const ab = ensureAuthBridge({
      home: AKDAGENT_DSH_HOME,
      srcDir: path.join(__dirname, 'plugins', 'akd-auth-bridge'),
      log: console.log,
    })
    if (!ab || !ab.ok) console.error('[akdagent] 订阅登录桥落位失败：' + ((ab && ab.why) || '未知'))
  } catch (e) {
    console.error('[akdagent] 订阅登录桥落位异常：' + e.message)
  }
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
  /* 🆕 2026-10-07（由 mac 用户回传的 `host-crash.json` 暴露的**取证缺陷**，真实案例：
   *   `{"code":1,"ranMs":7,"readyBeforeExit":false,"stderrTail":[]}` —— 看起来"只活了 7 毫秒、还没有任何输出"，
   *   实际是：就绪前退出会**立刻重试**（`HOST_MAX_ATTEMPTS=2`），而第一次的退出回调是 **500ms 后**才跑，
   *   那时 `hostSpawnedAt` 已被第二次 spawn 改写、`hostStderrTail` 已被清空 ⇒ **崩溃那次的证据被自己擦掉了**，
   *   `ranMs` 也变成"距第二次 spawn 7ms"这种没有意义的数。用户以为发了现场，我们什么都看不到。
   * ⇒ 现在：**每一次 spawn 的起始时刻与 stderr 尾巴由本次闭包持有**，退出回调只用它们（不受后续重试影响）；
   *   `hostStderrTail` / `hostSpawnedAt` 降级成"最新一次"的镜像，供别处（就绪后死亡的弹框/日志）继续读。 */
  const attemptSeq = ++hostSpawnSeq
  const attemptStartedAt = Date.now()
  const attemptStderr = []
  hostStderrTail = attemptStderr
  hostSpawnedAt = attemptStartedAt
  hostExited = false                  // 新一轮：清掉上一轮的生死标记（waitForWeb 就靠它快速失败）
  hostExitInfo = null
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
  child.stderr.on('data', (d) => {
    noteHostStderr(d)                       // 留一份现场（宿主异常退出时落 host-crash.json）
    logChildOutput('[dsh:err]', d)          // 2026-10-05：分级转发（Node 警告 → WARN、正常行 → INFO、其余 ERROR）
  })
  child.on('error', (e) => {
    // spawn 本身失败（node.exe 路径不对 / 权限）：不处理会变成未捕获的 'error' 事件
    console.error(`[akdagent] 内嵌 host spawn 失败：${e.message}（nodeBin=${nodeBin}）`)
  })
  child.on('exit', (code, signal) => {
    console.log(`[akdagent] embedded host exited: code=${code} signal=${signal}`)
    /* 标记"这一轮的宿主已经没了"（2026-09-27）：`waitForWeb` 靠它**立刻中止**，
     * 而不是傻等 90 秒才报"没起来" —— 启动重试才能在 1 秒内接上。 */
    hostExited = true
    hostExitInfo = { code, signal, at: new Date().toISOString() }
    if (quitting) return
    // 别立刻退：子进程 stderr 是**异步管道**，退出瞬间最后一坨（往往正是崩溃堆栈）
    // 可能在 'exit' 之后才到 —— 2026-09-21 排查宿主死因时就因为立刻 quitApp 丢了证据。
    setTimeout(() => {
      if (quitting) return
      /* 宿主退出分两种（2026-09-27 起分开处理）：
       *   ① **就绪前**退出（`hostReady === false`）：典型是 boot 失败（凭据读不了就是这一类）。
       *      这里**只落现场、不弹框、不退客户端** —— 决定权交给启动流程（`bringUpHost` 的重试循环），
       *      它会先自愈（规范化/挪走读不了的凭据）再重来一次。以前在这直接退 = 用户看到的"闪退"。
       *   ② **就绪后**死亡：客户端与宿主是一体的 ⇒ 弹框 + 退出，但**必须留现场**（以前是静默消失）。 */
      const ranMs = Date.now() - attemptStartedAt     // ⚠️ 用**本次** spawn 的起始时刻（不再读全局 hostSpawnedAt）
      let crashPath = ''
      try {
        crashPath = path.join(app.getPath('userData'), 'host-crash.json')
        fs.writeFileSync(crashPath, JSON.stringify({
          at: new Date().toISOString(), code, signal, ranMs, readyBeforeExit: hostReady,
          /* 🆕 2026-10-07：**哪一次尝试**（1 = 首次；2 = 自愈后重试）+ 日志尾巴。
           *   为什么加日志尾巴：宿主崩前那几行常常只在**日志文件**里（stdout/stderr 不一定都有），
           *   而用户回传时最方便的就是这一个文件 ⇒ 一份 host-crash.json 就够定位，不必再要 akdagent.log。 */
          attempt: attemptSeq,
          logPath: safeLogPath || '',
          logTail: tailOfLogLines(40),
          stderrTail: attemptStderr.slice(-40),         // ⚠️ 本次 spawn 自己的尾巴（以前读全局数组 ⇒ 重试后必空）
        }, null, 2), 'utf8')
      } catch { crashPath = '' }
      const firstErr = attemptStderr.slice().reverse().find((l) => /error|failed|FATAL|unknown|refus/i.test(l)) || attemptStderr.slice(-1)[0] || ''
      const head = `⚠ 内嵌宿主退出（code=${code} signal=${signal}`
        + (ranMs === null ? '' : ` · 存活 ${Math.round(ranMs / 1000)}s`) + ` · 第 ${attemptSeq} 次尝试）`
      if (!hostReady) {
        console.error(`[akdagent] ${head} —— 在**就绪前**退出 ⇒ 交给启动重试逻辑（自愈后重来一次）；现场：${crashPath || '(写不了)'}`)
        if (firstErr) console.error('[akdagent]   宿主最后一条像样的错误：' + firstErr)
        return
      }
      console.error(`[akdagent] ${head} —— 已经就绪过 ⇒ 客户端跟着退出；现场：${crashPath || '(写不了)'}`)
      if (firstErr) console.error('[akdagent]   宿主最后一条像样的错误：' + firstErr)
      if (process.env.AKDAGENT_NO_DIALOG !== '1') {
        try {
          dialog.showErrorBox('AKDAgent 内嵌宿主异常退出',
            '内嵌 DSH 宿主进程在运行中退出，客户端无法继续工作。\n\n'
            + `退出码：${code}（signal=${signal}）\n`
            + `存活：${ranMs === null ? '未知' : Math.round(ranMs / 1000) + ' 秒'}\n`
            + (firstErr ? `最后一条错误：\n${firstErr}\n\n` : '\n')
            + `日志：${safeLogPath || '(不可用)'}\n现场（可直接发给我们）：${crashPath || '(不可用)'}`)
        } catch { /* 弹框失败就只留日志 */ }
      }
      quitApp('内嵌宿主运行中退出')
    }, 500)
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

/**
 * 起一次内嵌宿主：能复用孤儿就复用，否则新起，然后等它就绪（**失败就抛**）。
 *
 * 为什么抽成函数（2026-09-27）：要让"宿主起不来"变成"**自愈后重试一次**"，而不是客户端跟着退。
 * 宿主 boot 失败最常见的原因是凭据/设置读不了，而那种情况自愈一次就能好
 *（`ensureAkdagentDshHome()` 会把读不了的凭据规范化或挪走）。
 *
 * @param {number} attempt 第几次（0 = 首次；>0 = 重试 ⇒ **不复用**旧宿主，要一个全新的）
 */
async function bringUpHost(attempt) {
  /* 每次都要跑：同步凭据/设置 + 规范化 + 起宿主前的自检自愈。
   * （2026-09-26 的教训：这段以前挂在 spawnHost 里 ⇒ 复用孤儿宿主时整段被跳过。） */
  ensureAkdagentDshHome()
  /* 🆕 2026-10-07：老的自定义提供方补 `apiKeyEnv`（用户报「保存了也显示未配置」的那个 bug 的产物）。
   * 放在起宿主**之前**：宿主读 settings 的那一刻它就得在。 */
  migratePiProviderKeyEnvs()
  /* 🆕 2026-10-08（B 组优化）：**起宿主前重探一次网络路由**（不再"只在启动时探一次"）。
   *   覆盖：宿主崩了要重试、用户中途把代理开起来/换节点、代理进程重启导致端口变了。
   *   ⚠️ 只在缓存**超过 20 秒**时才重探（避免重试链路上每次都花掉一次可达性探测的时间）。 */
  if (Date.now() - networkProbedAt > NETWORK_REPROBE_MS) await probeNetworkRoute('spawn')
  const prevHost = loadHostRecord()
  const clientVersion = app.getVersion()
  if (attempt === 0 && prevHost && prevHost.port && await probeHost(prevHost.port)) {
    // 0.1.5-rc.2：宿主有鉴权 ⇒ 复用必须带上上次换到的会话 cookie，并**实测确认还能用**。
    // 不能"因为端口有应答就复用"：新版裸请求一律 401，复用等于让 /api/* 全废。
    hostPort = prevHost.port
    hostTokenUrl = prevHost.tokenUrl || null
    /* 🆕 2026-10-05（用户裁「8 做」）：**记录里不再存 cookie**，改用它带回来的 `tokenUrl` **现换一次**会话。
     *   以前这里直接 `hostCookie = prevHost.cookie`，而那份 `dsh-auth-…`（约 30 天有效）是**明文躺在
     *   `%APPDATA%\AKDAgent\embedded-host.json` 里**的凭据；对"复用孤儿宿主"它并非必需 ——
     *   `tokenUrl` 足够换回一个会话（`establishHostSession`，见下面 404 行处同一用法）。
     *   兼容：老记录里可能还有 `cookie` 字段，读到也忽略（不再使用、也不再写回）。 */
    hostCookie = null
    if (hostTokenUrl) {
      try {
        hostCookie = await establishHostSession(hostTokenUrl)
      } catch (e) {
        console.log('[akdagent] 用记录里的 tokenUrl 换会话失败（' + ((e && e.message) || e) + '）⇒ 按"复用不了"处理')
      }
    }
    const alive = await httpGet(hostPort, '/', { cookie: hostCookie })
    /* 复用条件里再加一条**版本一致**（2026-09-26 热修 · 治本）：老客户端起的宿主体内没有
     *  本次的客户端侧修复，复用它 = "升级了但还在跑旧逻辑"。记录里**没有 `v`**（≤1.0.1 写的，
     *  版本戳是本次才加的）一律当不一致 ⇒ 杀掉重起一次，之后记录里就有 `v` 了。 */
    if (alive.status === 200 && prevHost.v === clientVersion) {
      console.log(`[akdagent] 复用上一次的内嵌 host（端口 ${hostPort} · pid ${prevHost.pid || '?'} · v${prevHost.v}）—— 避免起第二个 host`)
    } else if (alive.status === 200) {
      // 版本不一致：**必须**换新宿主，否则升级后的客户端侧逻辑永远不生效
      console.log(`[akdagent] 上一次的内嵌 host 是 v${prevHost.v || '(无版本记录)'} 起的（当前客户端 v${clientVersion}）⇒ 杀掉重起，避免用旧逻辑跑`)
      if (prevHost.pid) killTree(prevHost.pid)
      hostPort = null; hostTokenUrl = null; hostCookie = null
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
  return { prevHost }
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
/* 宿主现场取证（2026-09-27 加）：宿主 stderr 的最后若干行 + 它是什么时候起来的。
 * 为什么：宿主一退客户端就跟着退（用户看到"过了一会就闪退"），而**退之前那几行 stderr
 * 往往正是真因**（例如 `credentials-local: unknown top-level key "…"`）。以前只有日志文件，
 * 用户报障时给不出、我们也问不到 ⇒ 现在落成一份 `userData/host-crash.json` 直接回传即可。 */
let hostSpawnedAt = 0
/* 🆕 2026-10-07：第几次 spawn（1 = 首次；2 = 自愈后重试）。崩溃现场要带这个数，
 *   否则"起不来"的报告分不清是首次还是重试（两次的现象往往不一样）。 */
let hostSpawnSeq = 0
/* 本轮宿主的生死（2026-09-27）：`hostExited` 让 `waitForWeb` 立刻放弃等待；
 * `hostExitInfo` 把退出码带给"启动失败"的报错文案（用户回传时一眼能看到原因）。 */
let hostExited = false
let hostExitInfo = null
/** 宿主最多起几次（1 次失败 + 1 次自愈重试）；再失败就是真起不来，交给外层弹框 + 退出 */
const HOST_MAX_ATTEMPTS = 2
/* 🆕 2026-10-07：每次 spawn 的 stderr 尾巴。
 *   以前是 `const hostStderrTail = []` + 每次 spawn `length = 0` 复用同一个数组 ⇒ 重试后把上一次的证据擦掉
 *   （见 spawnHost 里那段注释）。现在**每次 spawn 换一个新数组**，所以它必须是 `let`。 */
let hostStderrTail = []
const HOST_STDERR_TAIL_MAX = 60
/* 🆕 2026-10-05：脱敏**补形状**。原来只认 `sk-…`（2026-09-27 加），于是
 *   Google `AIza…` / HuggingFace `hf_…` / Groq `gsk_…` / xAI `xai-…` / GitHub `ghp_…`
 *   这些**不以 sk- 开头**的密钥会被原样写进 `userData/host-crash.json` —— 而那份文件正是
 *   用户报障时**回传给我们**的东西（§13 起就是这么用的）⇒ 等于把密钥交出去。
 *   另外拦"带标签的赋值形态"（`api_key: xxx` / `token=xxx`），那是 stderr 里最可能出现的样子。 */
function redactForCrash(s) {
  return String(s)
    .replace(/(sk-[A-Za-z0-9_\-]{6,})/g, 'sk-***')
    .replace(/\b(AIza[0-9A-Za-z_\-]{10,})/g, 'AIza***')
    .replace(/\b(hf_[A-Za-z0-9]{6,})/g, 'hf_***')
    .replace(/\b(gsk_[A-Za-z0-9]{6,})/g, 'gsk_***')
    .replace(/\b(xai-[A-Za-z0-9]{6,})/g, 'xai-***')
    .replace(/\b(ghp_[A-Za-z0-9]{6,})/g, 'ghp_***')
    .replace(/(secret\s*:\s*)\S+/gi, '$1***')
    .replace(/((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token)\s*[:=]\s*)([^\s,;'"]{6,})/gi, '$1***')
}
function noteHostStderr(text) {
  for (const raw of String(text).replace(/\s+$/, '').split('\n')) {
    if (!raw) continue
    hostStderrTail.push(redactForCrash(raw).slice(0, 500))
    while (hostStderrTail.length > HOST_STDERR_TAIL_MAX) hostStderrTail.shift()
  }
}
/** 读日志文件最后 n 行（**先脱敏**）——写进 `host-crash.json` 随用户回传。
 *  🆕 2026-10-07：宿主崩前那几行常常只在日志文件里（stdout/stderr 不一定都有），
 *  而用户回传时最方便的就是那一个 JSON ⇒ 有了它就不必再让用户去找 `akdagent.log`。
 *  只读文件尾部 64 KB（日志可能上百 MB，绝不能整个读进来）。 */
function tailOfLogLines(n) {
  try {
    if (!safeLogPath) return []
    const st = fs.statSync(safeLogPath)
    if (!st.size) return []
    const want = Math.min(st.size, 64 * 1024)
    const fd = fs.openSync(safeLogPath, 'r')
    const buf = Buffer.alloc(want)
    try { fs.readSync(fd, buf, 0, want, st.size - want) } finally { fs.closeSync(fd) }
    return buf.toString('utf8').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter(Boolean)
      .slice(-n).map((l) => redactForCrash(l).slice(0, 500))
  } catch { return [] }
}
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

/* ══ ACE Studio 在线检测（2026-10-03 加；用户：「能检测 ace 是否开启吗」→「做进客户端状态显示」）══
 * 为什么客户端要管这件事：ACE Studio 现在也是"能干活的目标"（4 个官方技能已随包，走 `acestudio-cli`），
 *   但它**不走我们的桥** —— 它只有一个前置条件：**ACE 在跑 且 开了 External Agent Access**。
 *   客户端便宜地看出这件事，用户/AI 就不用去猜"为什么命令报 bridge not reachable"。
 *
 * 判据（2026-10-03 真机实测开/关两态；依据 `acestudio-cli help interaction-model`）：
 *   ① 桥握手文件 `%LOCALAPPDATA%\Timedomain\ACE Studio\mcp-bridge.json`
 *      —— ACE **开了 External Agent Access** 时才写，CLI 与 MCP 都靠它找本地 socket + token；
 *         ACE 关掉后它被删掉（实测：关掉即不存在）。⇒ 免费、且是**强条件**；
 *         **盲点**：ACE 崩溃/被杀时可能残留 ⇒ 所以要有"文件在但 CLI 不可达 = 可疑"这一态。
 *   ② CLI 探针 `acestudio-cli project info --json`：exit 0 = 在线；exit 3 = 桥不可达（实测 ~61ms）。
 *      ⇒ 权威，但每次要 spawn 一个 ~10MB 进程 ⇒ **只在状态变化时 / 用户点按钮时才探**，不放进 5s 轮询。
 *   ③ 进程名（`ACE Studio`）**故意不用**：它只说明 app 开着，不说明开关开着 —— 会把"读得到"判成"能干活"。
 *
 * 纪律：**只读**（不写 ACE 的任何文件/注册表），与"只写自己的家"一致。
 * UI 口径（用户 2026-10-03 定）：**没装 ACE 的机器整行/整个点都隐藏**（不占位），
 *   所以 `level=null` 表示"别显示"。 */
const ACE_LOCAL_DIR = process.env.LOCALAPPDATA || path.join(HOME_DIR, 'AppData', 'Local')
const ACE_BRIDGE_JSON = path.join(ACE_LOCAL_DIR, 'Timedomain', 'ACE Studio', 'mcp-bridge.json')
const ACE_PROBE_TIMEOUT_MS = 4000

/** ACE CLI 的候选位置 —— **不许写死绝对路径**（check-abs-paths 会拦；也要照顾自定义安装目录） */
function aceCliCandidates() {
  const out = []
  const push = (p) => { if (p && !out.includes(p)) out.push(p) }
  if (process.env.AKDAGENT_ACE_CLI) push(process.env.AKDAGENT_ACE_CLI)   // 测试/特殊安装用
  const bases = [
    [process.env.ProgramFiles, ['ACE Studio']],
    [process.env['ProgramFiles(x86)'], ['ACE Studio']],
    [process.env.LOCALAPPDATA, ['ACE Studio', path.join('Programs', 'ACE Studio')]],
  ]
  for (const [base, subs] of bases) {
    if (!base) continue
    for (const sub of subs) push(path.join(base, sub, 'acestudio-cli.exe'))
  }
  return out
}
function findAceCli() {
  for (const p of aceCliCandidates()) {
    try { if (fs.existsSync(p)) return p } catch { /* 试下一个 */ }
  }
  return null
}
function aceBridgeFileExists() {
  try { return fs.existsSync(ACE_BRIDGE_JSON) } catch { return false }
}

/** 快判（免费，纯函数便于单测）：装没装 / 桥文件在不在 */
function computeAceQuick(hasCli, hasBridgeFile) {
  return { installed: !!(hasCli || hasBridgeFile), hasCli: !!hasCli, hasBridgeFile: !!hasBridgeFile }
}
/** 合判：快判 + 最近一次深探结果 ⇒ {level, code, args}（level=null ⇒ UI 不显示） */
function computeAcePill(quick, deep) {
  if (!quick || !quick.installed) return { level: null, code: null, args: [] }
  if (!quick.hasBridgeFile) return { level: 'down', code: 'orb.ace.offline', args: [] }
  /* 找不到 CLI（自定义安装 / 只留了桥文件）就没法复核 ⇒ **以桥文件为准判在线**，
   * 否则会永远停在"检测中"（比误报还糟：用户以为一直在转圈） */
  if (!quick.hasCli) return { level: 'ok', code: 'orb.ace.online', args: [] }
  if (!deep) return { level: 'warn', code: 'orb.ace.unverified', args: [] }        // 文件在，但还没复核
  if (deep.code === 0) return { level: 'ok', code: 'orb.ace.online', args: [] }
  return { level: 'warn', code: 'orb.ace.suspect', args: [] }                      // 文件在但 CLI 不可达（多半残留）
}

let aceDeep = null                 // 最近一次 CLI 深探：{ code, at, note }
let aceProbeRunning = false
let aceQuickKey = ''
let aceKey = ''
let acePill = { level: null, code: null, args: [] }
let aceLogKey = ''

function aceStatusPayload() {
  const quick = computeAceQuick(findAceCli(), aceBridgeFileExists())
  const pill = computeAcePill(quick, aceDeep)
  return {
    installed: quick.installed,
    hasCli: quick.hasCli,
    hasBridgeFile: quick.hasBridgeFile,
    cli: findAceCli() || '',
    bridgeJson: ACE_BRIDGE_JSON,
    level: pill.level,
    code: pill.code,
    probeCode: aceDeep ? aceDeep.code : null,
    probedAt: aceDeep ? aceDeep.at : 0,
  }
}

/** 重算 ACE 状态；**变了才推**给球（与桥状态各自独立变化） */
function applyAceState(opts) {
  const force = !!(opts && opts.force)
  const quick = computeAceQuick(findAceCli(), aceBridgeFileExists())
  const qk = (quick.installed ? '1' : '0') + (quick.hasBridgeFile ? '1' : '0')
  if (qk !== aceQuickKey) {
    aceQuickKey = qk
    /* 文件刚出现/刚消失 ⇒ 之前那次深探结论作废，并按需复核一次 */
    if (!quick.hasBridgeFile) aceDeep = null
    if (quick.hasBridgeFile && !aceProbeRunning) probeAceCliDeep()
  } else if (force && quick.hasBridgeFile && !aceProbeRunning) {
    probeAceCliDeep()
  }
  const next = computeAcePill(quick, aceDeep)
  const nk = String(next.level) + '|' + next.code
  const changed = nk !== aceKey
  if (changed) {
    acePill = next
    aceKey = nk
    if (aceLogKey !== nk) {
      aceLogKey = nk
      console.log('[ace] 状态 → ' + String(next.level) + ' · ' + String(next.code) +
        (quick.hasCli ? '（cli: ' + findAceCli() + '）' : '') +
        (aceDeep ? ' 探针 exit=' + aceDeep.code : ''))
    }
    if (!(opts && opts.silent)) sendOrbStatus()
    sendAceStatusToSettings()
    /* ACE 在线状态一变，第三套皮肤可能该切（或该退回去）—— 异步刷新，失败不影响状态 */
    try { refreshOrbHostType().catch(() => { /* 皮肤只是外观 */ }) } catch { /* 同上 */ }
  }
  return changed
}

function sendAceStatusToSettings() {
  try {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('akdagent-ace-status-push', aceStatusPayload())
    }
  } catch { /* 窗口没了就算了 */ }
}

/** CLI 深探（**异步**，绝不阻塞主进程）：只问一句"桥可达吗" —— exit 0 = 在线 */
function probeAceCliDeep() {
  const cli = findAceCli()
  if (!cli) { aceDeep = null; applyAceState({ silent: true }); return }
  if (aceProbeRunning) return
  aceProbeRunning = true
  let settled = false
  let child = null
  let timer = null
  const done = (code, note) => {
    if (settled) return
    settled = true
    aceProbeRunning = false
    if (timer) clearTimeout(timer)
    aceDeep = { code, at: Date.now(), note: note || '' }
    console.log('[ace] CLI 探针 project info → exit=' + code + (note ? '（' + note + '）' : '') +
      (code === 0 ? '：ACE 在线' : '：桥不可达（ACE 没开 / 没开 External Agent Access / 文件残留）'))
    applyAceState()
  }
  try {
    child = spawn(cli, ['project', 'info', '--json'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (e) { done(-1, e && e.message ? e.message : String(e)); return }
  timer = setTimeout(() => { try { child.kill() } catch { /* 已退 */ } done(-2, 'timeout ' + ACE_PROBE_TIMEOUT_MS + 'ms') }, ACE_PROBE_TIMEOUT_MS)
  if (child.on) {
    child.on('error', (e) => done(-3, e && e.message ? e.message : String(e)))
    child.on('close', (code) => done(typeof code === 'number' ? code : -4, ''))
  }
}

/* ══ ACE 检测结束 ══ */

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

/* 🆕 2026-09-27 · **桥被宿主模态脚本错误框冻住** ⇒ 在球上给"关框 → Ctrl+S → 重跑桥"三步。
 *  事故背景（用户真机）：宿主弹 `setAttributes: 无效的输入类型。` 这种**模态**框，框一弹宿主主线程停，
 *  桥的轮询链跟着停（心跳不再更新、之后每笔请求都超时），而 Lua 侧一行日志都写不出来 ——
 *  用户只看到"球变黄了 / 工具突然都不动了"，不知道该干什么。
 *
 *  判据全在面包屑里（`akdagent-lastop-<host>.json`，桥每笔请求执行前落盘）：
 *    ① 桥**不新鲜**（还在动就不是冻住）；② `stage="running"`；
 *    ③ 属于**当前这次**桥运行（session 一致）；④ 那一笔**没跑完**（心跳 opsRun < 面包屑 reqSeen）。
 *  ⚠️ 同一 `(host, session, op)` 只提示一次（别每 5s 刷屏）；文案走 i18n（四语）。 */
const frozenNotified = new Set()
function notifyFrozenBridges(probes) {
  for (const p of probes) {
    if (!p || p.fresh || typeof p.ageSec !== 'number') continue   // 桥还在动 / 从没跑过 ⇒ 不提示
    let c = null
    try { c = fileIpc.frozenCrumb(p.host) } catch { /* 读不到就当没这回事 */ }
    if (!c) continue
    const key = p.host + '|' + c.session + '|' + c.op
    if (frozenNotified.has(key)) continue
    frozenNotified.add(key)
    const tag = p.host === 'ix' ? 'Instrument X' : 'Synthesizer V'
    notifyOrb('warn', i18n.t('orb.bridge.frozen', tag, c.op))
    console.log('[bridge] ⛔ 判定为「被脚本错误框冻住」：host=' + p.host + ' op=' + c.op +
      ' session=' + c.session + ' ageSec=' + p.ageSec)
  }
}

/** 采样一次两座桥的心跳并（在状态变化时）推给 orb */
function refreshBridgePill() {
  let sv = null
  let ix = null
  try { sv = probeBridgeHeartbeat('sv') } catch { /* 探针本身不抛，这里只兜底 */ }
  try { ix = probeBridgeHeartbeat('ix') } catch { /* 同上 */ }
  try { notifyFrozenBridges([sv, ix]) } catch { /* 提示失败不影响状态灯 */ }
  /* ACE 那一路状态（跟桥同一拍算；**不 spawn**，只在"快判变化/用户点按钮"时才深探） */
  let aceChanged = false
  try { aceChanged = applyAceState({ silent: true }) } catch { /* ACE 状态算不出来不影响桥三态 */ }
  let next = computeBridgePill(hostReady, sv, ix)
  /* 🆕 2026-10-03（用户：「检测到 ace 在线应该变绿才对」）：ACE 皮肤激活时用 **ACE 自己的在线判据**点灯 ——
   *   ACE 没有我们的桥、没有心跳，若还按桥的三态算，在线也只会是"没跑过桥脚本"的黄灯。
   *   在线 ⇒ 绿灯（orb.ace.online）；不在线 ⇒ 灰灯（皮肤很快会被 host-pick 切回去）。 */
  if (lastOrbHostType === ACE_HOST_TYPE) {
    next = acePill.level === 'ok'
      ? { level: 'ok', code: 'orb.ace.online', args: [] }
      : { level: 'down', code: 'orb.ace.offline', args: [] }
  }
  const key = next.level + '|' + next.code + '|' + next.args.join(',')
  const stateKey = next.level + '|' + next.code
  if (key !== bridgePillKey || aceChanged) {
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
/* ⚠️ 只写 `refs`（2026-09-27 修 —— "过了一会就闪退"的真因）：
 *  以前这里按"有没有 `refs` 段"判新旧格式，文件不存在 / 没有 `refs` 就**写到顶层** ⇒ 产出
 *  `version: 1` + `records` + **顶层键**的混合文档 ⇒ 宿主凭据层见顶层未知键直接抛
 *  （`unknown top-level key "DEEPSEEK_API_KEY"`）⇒ **宿主 boot 失败** ⇒ 进程退出 ⇒ 客户端 500ms 后
 *  跟着退出 = 用户看到的"闪退"，且**重装也没用**（每次启动都同步过去那份）。
 *  可那正是**全新机器**的必然形态：DSH 先写 `version: 1` + `records`（会话授权），**还没有 refs**
 *  ⇒ 用户一填 key 就把自己弄得起不来。宿主只认 `version`/`refs`/`records`（规则详见 dsh-home.js 顶部）。 */
function setCred(creds, name, value) {
  if (!creds || typeof creds !== 'object') return
  if (!creds.refs || typeof creds.refs !== 'object') creds.refs = {}
  if (creds.version === undefined) creds.version = 1
  creds.refs[name] = value
  delete creds[name]            // 顶层同名键必须清掉：它就是宿主拒读的那个键
}
function delCred(creds, name) {
  const refs = credRefs(creds)
  if (refs && refs[name] !== undefined) delete refs[name]
  if (creds[name] !== undefined) delete creds[name]
}

/** 解析某一份凭据文件；**null 表示读不了**（宿主也读不了 ⇒ 界面不该说"已配置"）。 */
function readCredentialsFrom(p) {
  try { return yaml.load(fs.readFileSync(p, 'utf8')) || {} } catch { return null }
}

/** 宿主**真正会读**的那份凭据：隔离家目录优先，没有才退回源 `~/.dsh`。
 *  为什么（2026-09-27 改）：界面与"要不要弹密钥窗"以前只看**源**那份 ⇒ 会出现
 *  「界面上明明配好了、宿主其实没 key」这种错觉 —— §10 的每轮 AUTH/401 和 §11 的闪退，
 *  用户侧看到的第一个假象都是它。判断必须和宿主一致。 */
function effectiveCredentials() {
  try {
    if (fs.existsSync(OWNED_CREDENTIALS_PATH)) return { doc: readCredentialsFrom(OWNED_CREDENTIALS_PATH), from: 'isolated', path: OWNED_CREDENTIALS_PATH }
  } catch { /* 忽略，退回源 */ }
  // 回退读**用户那份**（只读）—— 只在"我们这份还不存在"时发生；我们从不写它
  return { doc: readCredentials(), from: 'source', path: SOURCE_CREDENTIALS_PATH }
}

/** 文档里有没有某个 api-key：`refs.<name>`，或某条 record 的 `env.<name>`（后者是 DSH 自己的写法）。 */
function docHasApiKey(doc, name) {
  if (!doc || typeof doc !== 'object') return false
  if (getCred(doc, name)) return true
  const recs = doc.records && typeof doc.records === 'object' ? doc.records : null
  if (recs) {
    for (const v of Object.values(recs)) {
      if (!v || typeof v !== 'object') continue
      const env = v.env && typeof v.env === 'object' ? v.env : null
      if (env && typeof env[name] === 'string' && env[name]) return true
    }
  }
  return false
}

/** 检查 DeepSeek API key 是否已配置（**按宿主实际读的那份**判，见 effectiveCredentials） */
function hasDeepSeekKey() {
  return docHasApiKey(effectiveCredentials().doc, 'DEEPSEEK_API_KEY')
}

/* ── 密钥"像不像密钥"：**非阻塞**提示（2026-10-05，用户裁「7 做」）──────────────────
 * 以前只判"有没有非空字符串"（`docHasApiKey`）⇒ 界面显示"已配置"，可 6 个字符的占位串也一样算数
 * （本机实测 `ANTHROPIC_API_KEY` 的值就只有 6 个字符）⇒ 用户以为配好了，直到 401 才发现。
 * ⚠️ **只提示、不拦**：自定义提供方的 key 形状无法穷举，硬拒会挡住合法用法。 */
const KEY_PREFIX_HINTS = {
  DEEPSEEK_API_KEY: /^sk-/, OPENAI_API_KEY: /^sk-/, ANTHROPIC_API_KEY: /^sk-ant-/,
  MOONSHOT_API_KEY: /^sk-/, OPENROUTER_API_KEY: /^sk-or-/, GOOGLE_API_KEY: /^AIza/,
  GROQ_API_KEY: /^gsk_/, XAI_API_KEY: /^xai-/, HUGGINGFACE_API_KEY: /^hf_/,
}
function keyShapeWarning(name, value) {
  const v = String(value || '')
  if (!v) return ''
  if (/^["'`]|["'`]$/.test(v.trim())) return i18n.t('main.key.warnQuotes')
  if (/\s/.test(v.trim())) return i18n.t('main.key.warnWhitespace')
  if (v.trim().length < 20) return i18n.t('main.key.warnTooShort', v.trim().length)
  const want = KEY_PREFIX_HINTS[String(name).toUpperCase()]
  if (want && !want.test(v.trim())) return i18n.t('main.key.warnPrefix', name)
  return ''
}

/** 宿主是**继承客户端环境**拉起来的（`{...process.env}`）⇒ 环境里若有同名的 key，宿主可能优先用它。
 *  与凭据文件里的不一致时极难查（"文件里明明是新的"）。只在确实存在时打一行警示（2026-09-27）。 */
function warnCredentialEnvShadowing() {
  const names = ['DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MOONSHOT_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY']
  const hit = names.filter((n) => process.env[n])
  if (hit.length) {
    console.log('[akdagent] ⚠ 进程环境里有 ' + hit.join(', ') + '：宿主会继承它（我们是按 {...process.env} 拉起宿主的）'
      + ' ⇒ 若与凭据文件里的 key 不一致，会出现"文件里是对的、实际用的却是环境变量"的难查现象')
  }
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

/* ── 通用「HTML 确认框」窗口（2026-09-27 · 用户要求：提醒/确认一律 HTML，不用原生 MessageBox）
 * 为什么不用原生：`dialog.showMessageBox` 在 Windows 上是系统样式，跟 AKDAgent 的深色界面完全两张皮；
 *   而且原生框在无人值守场景下会把主进程冻在模态循环里（只能靠 AKDAGENT_NO_DIALOG 整体关掉）。
 *
 * 用法：`const ok = await askConfirm({ title, message, detail, okLabel, cancelLabel, icon })`
 *   · **关窗 / Esc / 直接回车 = 取消**（resolve(false)）—— 安全默认，调用方不必再兜底
 *   · 同一时刻只允许一个：并发时后到的直接按"取消"收尾，避免叠窗
 *   · **非模态**：不用 `parent` / `modal`（那会把父窗整个禁用 —— 见 createKeyPromptWindow 的教训）
 *   · `AKDAGENT_NO_DIALOG=1` ⇒ 不开窗、直接 false（无人值守测试不会被挂住）
 */
let confirmWin = null
let pendingConfirm = null

function askConfirm(opts) {
  return new Promise((resolve) => {
    if (process.env.AKDAGENT_NO_DIALOG === '1') {
      console.log('[akdagent] AKDAGENT_NO_DIALOG=1 ⇒ 跳过确认框（按"取消"处理）：' + ((opts && opts.title) || ''))
      resolve(false)
      return
    }
    if (pendingConfirm) { resolve(false); return }
    if (confirmWin && !confirmWin.isDestroyed()) { resolve(false); return }
    pendingConfirm = { resolve }
    try {
      confirmWin = new BrowserWindow({
        width: 620, height: 430, minWidth: 520, minHeight: 320,
        show: false, alwaysOnTop: true,
        title: (opts && opts.title) || 'AKDAgent',
        icon: assetPath('icon.ico'),
        backgroundColor: '#2e2e2e',
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#2e2e2e', symbolColor: 'rgb(179,179,179)', height: 32 },
        webPreferences: {
          preload: path.join(__dirname, 'confirm-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      confirmWin.loadFile(path.join(__dirname, 'confirm.html'))
      confirmWin.once('ready-to-show', () => {
        if (confirmWin && !confirmWin.isDestroyed()) {
          confirmWin.show()
          ensureWindowKeyboardFocus(confirmWin, 'confirm')
        }
      })
      confirmWin.webContents.once('did-finish-load', () => {
        if (confirmWin && !confirmWin.isDestroyed()) {
          confirmWin.webContents.send('akdagent-confirm-init', opts || {})
        }
      })
      confirmWin.on('closed', () => {
        if (pendingConfirm) { const p = pendingConfirm; pendingConfirm = null; p.resolve(false) }
        confirmWin = null
      })
    } catch (e) {
      pendingConfirm = null
      console.log('[akdagent] 确认框打不开 ⇒ 按"取消"处理：' + (e && e.message ? e.message : e))
      resolve(false)
    }
  })
}

ipcMain.on('akdagent-confirm-answer', (_e, ok) => {
  if (!pendingConfirm) return
  const p = pendingConfirm
  pendingConfirm = null
  if (confirmWin && !confirmWin.isDestroyed()) confirmWin.close()
  p.resolve(!!ok)
})

/** 首次启动：无 key 则弹窗（仅当窗口都就绪后）—— 判据是**宿主实际会读的那份**（2026-09-27 改） */
function maybeShowKeyPrompt() {
  const has = hasDeepSeekKey()
  const eff = effectiveCredentials()      // 只为把"判据是哪一份"写进日志（两次读文件，可忽略）
  console.log('[akdagent] DeepSeek key: ' + (has ? 'configured（不再弹窗）' : 'MISSING ⇒ 弹密钥窗')
    + '（判据 = ' + (eff.from === 'isolated' ? '宿主读的隔离家目录那份' : '源 ~/.dsh 那份')
    + (eff.doc === null ? ' · ⚠ 那份**读不了**' : '') + '）')
  if (has) return
  // 等 orb 和 settings 都创建后再弹（作为 settings 的模态）
  setTimeout(() => createKeyPromptWindow(), 500)
}

ipcMain.on('akdagent-key-save', (_e, key) => {
  try {
    const creds = readCredentials()
    if (key && String(key).trim()) {
      setCred(creds, 'DEEPSEEK_API_KEY', String(key).trim())   // 只写 refs（顶层键会被宿主拒读，见 setCred 注释）
      writeCredentials(creds)
      console.log('[akdagent] DeepSeek API key saved（写到 refs: DEEPSEEK_API_KEY）')
    }
    if (keyPromptWin) keyPromptWin.close()
  } catch (e) {
    /* 以前这里失败是**哑的**：窗口照关、用户以为存好了（§11 那类"界面上明明配好了"的来历之一）。
     * 现在当场说清楚：不关窗 + 弹一次原生框（含日志路径）。 */
    console.error('[akdagent] 保存 API key 失败：' + (e && e.message ? e.message : e))
    if (process.env.AKDAGENT_NO_DIALOG !== '1') {
      try {
        dialog.showErrorBox('AKDAgent 保存 API Key 失败',
          String((e && e.message) || e) + '\n\n日志：' + (safeLogPath || '(不可用)'))
      } catch { /* 忽略 */ }
    }
  }
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
    { label: i18n.t('orb.menu.quit'), click: () => quitApp('托盘菜单') },
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
    [svSetupWin, 'svSetup'],
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
    { label: i18n.t('orb.menu.quit'), click: () => quitApp('托盘菜单') },
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

/** 退出客户端。`reason` 只用于**留痕**（2026-09-27 加）：
 *  以前日志里"用户自己退的"和"宿主死了带着退的"长得一模一样（都是 `embedded host exited: code=1`），
 *  21 次退出一次都分不出来 —— 用户报"闪退"时我们只能猜。现在每次退出都写明来源。 */
function quitApp(reason) {
  quitting = true
  console.log('[akdagent] 退出请求（' + (reason || '未标注来源') + '）')
  stopBridgePoll()               // 桥状态轮询（5s）停掉，别在退出路上还读心跳
  if (hostChild) killTree(hostChild.pid)
  app.quit()
}

// ── IPC ────────────────────────────────────────────────────────────
ipcMain.on('akdagent-toggle-chat', () => toggleOrbPanel())
ipcMain.on('akdagent-quit', () => quitApp('界面按钮'))
ipcMain.on('akdagent-context-menu', () => showOrbContextMenu())

// ── 设置窗口 IPC ──────────────────────────────────────────────────
ipcMain.on('akdagent-request-status', () => { pushHostStatusToSettings() })

/* ACE Studio 状态（设置页状态区那一行）：拉一次当前状态 + 按钮触发一次**真探针**（CLI，异步）。
 * 为什么按钮才深探：CLI 是个 ~10MB 的进程，真跑一次要 spawn（实测 ~61ms，冷启动可能被 AV 拖慢）
 * ⇒ 5s 轮询里只做免费的"桥文件在不在"，用户点按钮才去问一次"到底可不可达"。 */
ipcMain.handle('akdagent-ace-status', () => {
  try { probeAceCliDeep() } catch { /* 探针失败也先把当前状态回给界面 */ }
  return aceStatusPayload()
})
ipcMain.on('akdagent-check-ace', () => {
  try { probeAceCliDeep() } catch { /* 忽略：界面上会看到状态没变 */ }
})

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
  if (!writeSettings(s)) return { ok: false }
  return { ok: true, model: modelId }
})

/** 更新语言（locale.preference） */
ipcMain.handle('akdagent-set-language', (_e, lang) => {
  const s = readSettings()
  s['locale'] = { ...(s['locale'] || {}), preference: lang }
  if (!writeSettings(s)) return { ok: false }
  return { ok: true, language: lang }
})

/** 更新推理等级（agent-default-model.reasoningEffort） */
ipcMain.handle('akdagent-set-reasoning-effort', (_e, level) => {
  const s = readSettings()
  const adm = s['agent-default-model'] || {}
  adm.reasoningEffort = level
  s['agent-default-model'] = adm
  if (!writeSettings(s)) return { ok: false }
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
  return writeSettings(s)          // 🆕 2026-10-05：把写盘结果回给调用方（IPC 那头据此报 ok/false）
}

/** 有没有配过任何 SV scripts 目录（读不到配置时返回 true —— 宁可少提醒，也别在异常时烦用户） */
function hasSvScriptsDir() {
  try { return getSvConfig().scriptsDirs.filter(Boolean).length > 0 } catch { return true }
}

/**
 * 🆕 2026-09-27（用户要求）：**一个 scripts 目录都没指定** ⇒ 提醒一次。
 *
 * 为什么值得提醒：没配目录 = 桥脚本没地方可部署 = SV/IX 侧所有工具都用不了，
 * 而界面上**看不出任何异常**（球是绿的、聊天也能用）—— 用户只会觉得"工具怎么都不管用"。
 *
 * 通道与节流：原生弹窗（带「去设置 SV 集成」/「稍后」）+ 日志；**每个客户端版本只弹一次**
 * （记在 `settings.yaml` 的 `sv.noDirNoticeShownFor`）—— 提醒是帮忙，不是唠叨。
 * 先把标记落盘再弹：万一用户不点、或进程被杀，也不会下次又来。
 */
function notifyMissingSvDirs() {
  try {
    if (hasSvScriptsDir()) return
    const s = readSettings()
    const sv = s[SV_CONFIG_KEY] || {}
    if (sv.noDirNoticeShownFor === app.getVersion()) return
    s[SV_CONFIG_KEY] = { ...sv, noDirNoticeShownFor: app.getVersion() }
    writeSettings(s)
    let found = []
    try { found = scanSvScriptsDirs() } catch { /* 忽略 */ }
    console.log('[akdagent] ⚠ 没有指定任何 SV scripts 目录（SV/IX 侧的工具都用不了）'
      + (found.length ? '；自动检测到 ' + found.length + ' 个候选：' + found.join(' , ') : '；自动检测也没找到候选')
      + ' ⇒ 打开 SV 配置向导')
    if (process.env.AKDAGENT_NO_DIALOG === '1') return
    /* 🆕 2026-09-27（用户改的流程）：不再弹原生提示框，改成**打开 HTML 配置向导窗口** ——
     * 没配目录不是"通知一下"就完了，它需要用户动手（挑目录 + 部署），向导里三步走完。 */
    openSvSetup()
  } catch (e) {
    console.log('[akdagent] 提醒 SV 目录时出错（忽略）：' + (e && e.message ? e.message : e))
  }
}

/**
 * 开发辅助（2026-09-27）：把 **SV 配置向导的三步**真跑一遍（scan → 全选 → 部署），
 * 每步结果写进日志 —— 用于验收（人不用手点），也能在改动后第一时间发现"某一步断了"。
 *
 * 用法：`AKDAGENT_DEV_WIZARD_RUN=1`，**并配合 `AKDAGENT_HOME_DIR=<临时目录>`** ——
 * 向导会真往 scripts 目录里写桥/面板脚本，别拿真实 SV 安装做实验。
 */
function devRunSvWizard() {
  if (process.env.AKDAGENT_DEV_WIZARD_RUN !== '1') return
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (code) => {
    if (!svSetupWin || svSetupWin.isDestroyed()) return Promise.resolve(null)
    return svSetupWin.webContents.executeJavaScript(code)
  }
  ;(async () => {
    await wait(2500)
    console.log('[akdagent] 开发辅助：向导三步自测 —— ① 点「自动检索目录」')
    await js(`document.getElementById('btn-scan').click()`)
    await wait(1500)
    /* ⚠️ 只勾**第一行**再部署：`svScriptsDirCandidates()` 里 AppData 那几个候选**不受 HOME_DIR 影响**
     * （APPDATA 是真实环境变量）⇒ 用假 HOME 自测时，全勾会写进**用户真实的** SV2/IX 目录。
     * 只勾第一行（Documents 下那个，随假 HOME 走）就只碰临时树。 */
    const ticked = await js(`(() => {
      const rows = [...document.querySelectorAll('#list .row')];
      rows.forEach((r, i) => {
        const cb = r.querySelector('input');
        const want = i === 0;
        if (cb.checked !== want) { cb.checked = want; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      return rows.length;
    })()`)
    console.log('[akdagent] 开发辅助：共 ' + ticked + ' 行，只勾第 1 行（避免碰真实 AppData 下的宿主目录）')
    const list = await js(`(() => {
      const rows = [...document.querySelectorAll('#list .row')];
      return { rows: rows.length, checked: rows.filter((r) => r.querySelector('input').checked).length,
               paths: rows.map((r) => r.querySelector('.path').textContent),
               badges: rows.map((r) => (r.querySelector('.badges') || {}).textContent || '') };
    })()`)
    console.log('[akdagent] 开发辅助：② 第 2 步列表 = ' + JSON.stringify(list))
    console.log('[akdagent] 开发辅助：③ 点「一键部署」')
    await js(`document.getElementById('btn-deploy').click()`)
    await wait(3000)
    const res = await js(`(() => {
      const rs = [...document.querySelectorAll('#results .result')];
      return { count: rs.length, lines: rs.map((r) => r.textContent) };
    })()`)
    console.log('[akdagent] 开发辅助：第 3 步结果 = ' + JSON.stringify(res))
    console.log('[akdagent] 开发辅助：向导三步自测结束')
  })().catch((e) => console.log('[akdagent] 开发辅助：向导自测出错：' + (e && e.message ? e.message : e)))
}

/**
 * 开发辅助（2026-09-27）：把「SV 集成 → 某行的『部署面板』」这条**真实路径**点一遍
 * （渲染层 → IPC → 主进程确认窗），用于实机验收那个确认框。
 *
 * 用法：`AKDAGENT_DEV_CLICK_PANEL=1`（会自己把设置窗开到 SV 页）。
 * 为什么需要它：这个确认窗**只有"人在设置页点按钮"才出得来**，验收时不该靠手点；
 * ⚠️ 它只**点一下真按钮**，不绕过任何逻辑（确认窗、默认取消、`cancelled` 回报都照走）。
 */
function devClickSvPanelDeploy() {
  if (process.env.AKDAGENT_DEV_CLICK_PANEL !== '1') return
  const dirs = (getSvConfig().scriptsDirs || []).filter(Boolean)
  const dir = dirs.find((d) => ['sv1', 'opsv'].includes(hostKindOfScriptsDir(d))) || dirs[0]
  if (!dir) { console.log('[akdagent] 开发辅助：没有任何 scripts 目录可点（先加一个再来）'); return }
  const label = i18n.dictFor('settings')['settings.sv.deployPanelBtn'] || '部署面板'
  console.log('[akdagent] 开发辅助 AKDAGENT_DEV_CLICK_PANEL=1 ⇒ 将模拟点「' + label + '」：' + dir)
  openSettings('sv')
  let tries = 0
  const attempt = () => {
    tries += 1
    if (tries > 15) { console.log('[akdagent] 开发辅助：设置页没等到可点的行，放弃'); return }
    if (!settingsWin || settingsWin.isDestroyed()) { setTimeout(attempt, 800); return }
    const code = `(() => {
      const rows = Array.from(document.querySelectorAll('#sv-dir-list .row'));
      const row = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(dir)}));
      if (!row) return 'row-not-found';
      const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === ${JSON.stringify(label)});
      if (!btn) return 'btn-not-found';
      btn.click();
      return 'clicked';
    })()`
    settingsWin.webContents.executeJavaScript(code)
      .then((r) => {
        console.log('[akdagent] 开发辅助：模拟点「部署面板」⇒ ' + r + '（第 ' + tries + ' 次）')
        if (r !== 'clicked') setTimeout(attempt, 800)
      })
      .catch((e) => { console.log('[akdagent] 开发辅助：点击注入失败：' + (e && e.message)); setTimeout(attempt, 800) })
  }
  setTimeout(attempt, 1500)
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

/** 常见 SV / IX 的 scripts 目录候选（SV1 文档目录 / SV2 AppData 与文档 / OPSV 便携版 / IX） */
function svScriptsDirCandidates() {
  const user = HOME_DIR
  const appdata = process.env.APPDATA || path.join(user, 'AppData', 'Roaming')
  return [
    path.join(user, 'Documents', 'Dreamtonics', 'Synthesizer V Studio', 'scripts'),
    path.join(appdata, 'Dreamtonics', 'Synthesizer V Studio 2', 'scripts'),
    path.join(user, 'Documents', 'Dreamtonics', 'Synthesizer V Studio 2', 'scripts'),
    path.join(user, 'Documents', 'OPSV', 'Dreamtonics', 'Synthesizer V Studio', 'scripts'),
    path.join(appdata, 'Dreamtonics', 'Instrument X', 'scripts'),
  ]
}

/** 真的存在于磁盘上的候选目录（去重） */
function scanSvScriptsDirs() {
  return [...new Set(svScriptsDirCandidates())].filter((p) => fs.existsSync(p))
}

/** 自动检测常见 SV scripts 目录（设置页「自动检测」按钮用） */
ipcMain.handle('akdagent-scan-sv-scripts', () => ({ found: scanSvScriptsDirs() }))

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
  /* 🆕 2026-09-27（用户）：一个目录都没配时别再"跑一遍空操作" —— 界面上什么都没发生，
   * 用户会以为按钮坏了。这里明确回报 `no-dirs` + 把自动检测的结果一起给界面（让它能一键补上）。 */
  if (!cfg.scriptsDirs.filter(Boolean).length) {
    let found = []
    try { found = scanSvScriptsDirs() } catch { /* 忽略 */ }
    console.log('[akdagent] 一键部署被跳过：还没有指定任何 SV scripts 目录'
      + (found.length ? '（自动检测到 ' + found.length + ' 个候选）' : '（自动检测也没找到候选）'))
    return { ok: false, reason: 'no-dirs', found }
  }
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

/* ── SV 配置向导（2026-09-27 · 用户定的流程）───────────────────────────────
 * 为什么单独开一个窗口（而不是弹个原生框）：**没配 scripts 目录**这件事不是"通知一下"就完了，
 * 它需要用户动手（挑目录 + 部署），而设置页那一堆行对第一次来的用户太重。所以给一个**三步向导**：
 *   ① 说明为什么需要 → ② 自动检索所有候选目录、列出让你勾选（也可以「浏览…」手动加）
 *   → ③ 一键部署（复用设置页那套部署逻辑），最后告诉你去 SV 里跑一次桥脚本。
 * 触发：启动时 `hasSvScriptsDir()` 为假（每个客户端版本一次，见 notifyMissingSvDirs）。
 * 老的自然语言弹窗（MessageBox）已被这个窗口取代 —— 文案与按钮都在 `sv-setup.html` 里。 */
let svSetupWin = null

function createSvSetupWindow() {
  if (svSetupWin && !svSetupWin.isDestroyed()) {
    ensureWindowKeyboardFocus(svSetupWin, 'sv-setup')
    return
  }
  svSetupWin = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 640,
    minHeight: 520,
    show: false,
    title: i18n.dictFor('svSetup')['svSetup.title'] || 'SV 集成配置向导',
    icon: assetPath('icon.ico'),
    backgroundColor: '#2e2e2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#2e2e2e', symbolColor: 'rgb(179,179,179)', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'sv-setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  svSetupWin.loadFile(path.join(__dirname, 'sv-setup.html'))
  /* 渲染层排障（2026-09-27 加）：向导第一版曾经**整页空白** —— 页面脚本在 `window.svi18n` 上抛错，
   * 而主进程这边一点日志都没有（只能靠用户截图猜）。这类"窗口活着但界面是死的"必须留痕。 */
  svSetupWin.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // 过滤 Electron 自带的开发告警（各页面都有，属噪音；与 test-settings-clicks.cjs 同一口径）
    if (level >= 2 && !/Security Warning|Content Security/.test(message)) {
      console.log(`[sv-setup] 渲染层错误：${message} @${String(sourceId).split(/[\\/]/).pop()}:${line}`)
    }
  })
  svSetupWin.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[sv-setup] preload 失败：' + preloadPath + ' → ' + ((error && error.message) || error))
  })
  svSetupWin.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[sv-setup] 页面加载失败：' + code + ' ' + desc)
  })
  svSetupWin.once('ready-to-show', () => {
    svSetupWin.show()
    ensureWindowKeyboardFocus(svSetupWin, 'sv-setup')
  })
  svSetupWin.on('closed', () => {
    console.log('[akdagent] SV 配置向导已关闭')
    svSetupWin = null
  })
}

/** 打开配置向导（已开着就前置） */
function openSvSetup() {
  if (svSetupWin && !svSetupWin.isDestroyed()) {
    ensureWindowKeyboardFocus(svSetupWin, 'sv-setup')
    return
  }
  createSvSetupWindow()
}

/** 向导第 2 步用：把"能自动找到的目录"连同每个目录的宿主类型/已装状态一起给它 */
ipcMain.handle('akdagent-sv-setup-scan', () => {
  const configured = new Set(getSvConfig().scriptsDirs.filter(Boolean))
  const found = scanSvScriptsDirs()
  // 已配置但这次没扫到的目录也列出来（用户手填过的路径不该在向导里消失）
  const all = [...new Set([...found, ...configured])]
  return {
    entries: all.map((dir) => {
      const info = svDirInfo(dir)
      return {
        scriptsDir: info.scriptsDir,
        kind: info.kind,
        exists: info.exists,
        bridgeInstalled: info.bridgeInstalled,
        panelInstalled: info.panelInstalled,
        panelWanted: info.panelWanted,
        alreadyConfigured: configured.has(dir),
      }
    }),
    candidates: svScriptsDirCandidates().map((p) => ({ path: p, exists: fs.existsSync(p) })),
  }
})

/** 向导关闭（window-all-closed 不能把 App 带走：这里有球/设置窗，一般不会触发，但语义要明确） */
ipcMain.on('akdagent-sv-setup-close', () => {
  if (svSetupWin && !svSetupWin.isDestroyed()) svSetupWin.close()
})

/** 设置页「配置向导…」按钮：随时能重新打开向导（不只看启动那一次） */
ipcMain.on('akdagent-open-sv-setup', () => openSvSetup())

/**
 * 🆕 2026-09-27（用户要求）：往**没有侧栏**的宿主部署面板前的**确认**。
 *
 * 触发面：用户点「部署面板」而该目录被认成 `sv1` / `opsv`，或者**根本认不出**（null）。
 * 为什么要挡一下：这两类宿主没有 `SidePanelSection`（也没有 project scriptData），面板在那边
 * 不生效；而且 SV1 的脚本菜单会把 `scripts/Agent/*.js` 也列出来 ⇒ 多一个"点了就出事"的菜单项
 *（用户 2026-09-25 明确：面板误放到 SV1 **会**出问题）。以前是"照装 + 事后警告"，现在把决定权
 * 摆在动手**之前**。
 * 🆕 2026-09-27 二改（用户："面板加载的提醒也是 html"）：从原生 `showMessageBoxSync` 换成
 *   我们自己画的 HTML 确认窗（`confirm.html` + `askConfirm()`）。
 * @returns {Promise<boolean>} true = 用户确认要装
 */
async function confirmPanelDeploy(scriptsDir, kind) {
  const label = kind || i18n.t('main.deploy.kindUnknown')
  const ok = await askConfirm({
    icon: '⚠️',
    title: i18n.t('main.deploy.panelConfirmTitle'),
    message: i18n.t('main.deploy.panelConfirmMessage', label),
    detail: i18n.t('main.deploy.panelConfirmDetail', scriptsDir),
    okLabel: i18n.t('main.deploy.panelConfirmOk'),
    cancelLabel: i18n.t('common.cancel'),
  })
  // 留痕：验证/排障时一眼看出"问过没有、用户选了哪个"
  console.log(`[akdagent] 面板部署确认（HTML 窗口）：${label} · ${scriptsDir} ⇒ ${ok ? '用户选择"仍然部署"' : '用户取消（未部署）'}`)
  return ok
}

/** 🆕 2026-09-25（用户：可以在目录列表里手动部署面板）—— **单个目录**单独部署一个文件。
 *  与"一键部署"的区别：这里**尊重手动意愿**，不做宿主推断拦截；
 *  认不出/认出是 SV1·OPSV 而用户仍要装面板时，**照装**但在结果里带一条明确警告（用户自己决定）。 */
ipcMain.handle('akdagent-deploy-sv-file', async (_e, dir, what) => {
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
      /* 🆕 2026-09-27（用户）：SV1 / OPSV（或认不出的宿主）点「部署面板」时**先弹窗确认** ——
       * 面板在那边不生效，还会在脚本菜单里多一个点了就出事的项。确认了才装（并照旧附一条警告）。 */
      if (!wantsPanel(scriptsDir) && !(await confirmPanelDeploy(scriptsDir, kind))) {
        return { ok: false, cancelled: true, kind, steps: [i18n.t('main.deploy.panelCancelled')] }
      }
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
  if (!writeSettings(s)) return { ok: false }
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
  if (!writeSettings(s)) return { ok: false }
  /* 🆕 2026-09-27：把"列表空了"明确回报给界面 —— 以前这里静默把 model 写成空串，
   * 宿主随后每一轮都 `no provider/model`，而用户只看到"回合结束（error）"。 */
  return { ok: true, defaultModel: adm.model || '', models, noModels: models.length === 0 }
})

// ── 提供方管理（模型页） ──────────────────────────────────────────
/* ⛔ 2026-09-28（方案 ABCD）：凭据**只写我们自己的那份**（`~/.dsh-akdagent/.credentials.yaml` —— 宿主读的就是它）；
 *   用户那份 `~/.dsh/.credentials.yaml` 一律**只读**（只在我们这份还不存在时读它做回退/导入，见 dsh-home.ensureHome）。 */
function readCredentials() {
  for (const p of [OWNED_CREDENTIALS_PATH, SOURCE_CREDENTIALS_PATH]) {
    try {
      if (!fs.existsSync(p)) continue
      return yaml.load(fs.readFileSync(p, 'utf8')) || {}
    } catch { /* 试下一份 */ }
  }
  return {}
}

function writeCredentials(obj) {
  const dir = path.dirname(OWNED_CREDENTIALS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })   // 建的是**我们自己的**目录（不是 ~/.dsh）
  /* 落盘前**统一规范化**（2026-09-27）：顶层杂键搬进 `refs`、保证 `version: 1`、清掉形状不对的
   * records 条目 —— 写出去的文件必须**宿主读得了**（宿主 boot 读不懂就直接失败 ⇒ 客户端跟着退）。 */
  const { doc } = normalizeCredentialsDoc(obj)
  const out = yaml.dump(doc, { indent: 2, lineWidth: -1 })
  // 原子写（宿主 chokidar 守着它）；失败就抛，交给 IPC 回报界面（别做哑失败）
  /* ⛔ `{ mode: 0o600 }` 不是"锦上添花"，是**宿主的硬要求**（2026-10-07 · mac 用户 `logic` 的日志）：
   *   宿主 `dsh-credentials-local` 启动时 `assertOwnerOnly` ⇒ 644 直接拒绝加载 ⇒ 宿主起不来。
   *   POSIX 上默认 umask 022 写出来就是 644 ⇒ 不指定就等着 mac 用户"配完 key 下次启动闪退"。 */
  if (!writeFileAtomic(OWNED_CREDENTIALS_PATH, out, { mode: 0o600 })) throw new Error('写 ' + OWNED_CREDENTIALS_PATH + ' 失败（权限 / 杀软？）')
  // ⛔ 不再写/镜像回 `~/.dsh`（源只读）
}

/** 常见 pi-ai 提供方预设（route id → 显示名）。完整目录在 pi-ai 内建 data，这里只列常用。
 *  ⚠️ 这里的每个 id 必须是 **pi-ai 目录里真实存在的 route**（`getBuiltinProviders()`）——写错一个字母
 *    就会加出一张"卡片在、模型一个都出不来"的卡（而 `keyEnv` 照样对，因为它是 `route.toUpperCase()+'_API_KEY'`）。
 *    2026-10-07 查过一遍：12 个 id 与目录逐一核对**全部命中**（没写这个守卫，靠的是人工核 —— 见 docs/待办.md）。 */
const PI_AI_PROVIDER_PRESETS = [
  'openai', 'anthropic', 'google', 'groq', 'mistral', 'openrouter',
  'xai', 'moonshotai', 'deepseek', 'cerebras', 'together', 'huggingface',
]

/** 读取所有提供方（DeepSeek 专用 + pi-ai routes）及密钥状态 */
ipcMain.handle('akdagent-get-providers', () => {
  const s = readSettings()
  /* 界面上的"已配置"必须按**宿主实际会读的那份**判（2026-09-27 改）——
   * 以前只看源 `~/.dsh` ⇒ 出现"界面说已配置、宿主其实没 key"（假象源头见 effectiveCredentials）。 */
  const eff = effectiveCredentials()
  const creds = eff.doc && typeof eff.doc === 'object' ? eff.doc : {}
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
    hasKey: docHasApiKey(creds, 'DEEPSEEK_API_KEY'),
    /* 🆕 2026-10-05（⑦ 的**展示侧**补齐）：**已存在**的密钥若有问题，也要在界面上说一句。
     *   以前 `keyShapeWarning` 只在"点保存"那一刻提示 ⇒ 像本机那个 6 个字符的 `ANTHROPIC_API_KEY`
     *   早就躺在文件里，界面照样显示"已配置"，直到 401 才发现。
     *   ⚠️ 只回**提示文本**，绝不回密钥值（界面永远拿不到值）。 */
    keyWarn: keyShapeWarning('DEEPSEEK_API_KEY', getCred(creds, 'DEEPSEEK_API_KEY') || ''),
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
      hasKey: !!keyEnv && docHasApiKey(creds, keyEnv),
      keyWarn: keyEnv ? keyShapeWarning(keyEnv, getCred(creds, keyEnv) || '') : '',   // 🆕 ⑦ 展示侧（只回文本）
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
    /* 已配置的凭据 = **refs 里的键**（2026-09-27 修：以前列的是顶层键，新格式下会变成
     * `version/refs/records` 三个噪音词）；另附"这份是谁的、读得了吗"，便于排障时一眼看清。 */
    credentialKeys: Object.keys((creds && typeof creds.refs === 'object' && creds.refs) || {})
      .map((k) => ({ key: k, configured: true })),
    credentialSource: eff.from,
    credentialReadable: eff.doc !== null,
  }
})

/* ── 模型目录 / **会话模型**（2026-10-05，用户裁「4 做」「5 做」）────────────────────
 * 背景：设置页的「默认模型」**只对"还没有会话级选择"的 Agent 生效**
 *   （宿主 `dsh-agent-default-model` 的原话："Default model selection for an Agent **without a
 *   session-specific selection**"）⇒ 用户在设置里改完，**当前会话可能还在用旧模型**，
 *   而客户端此前**没有任何地方**能看出"这次会话实际用哪个模型"（`session/selectModel` 一次都没调过）。
 *
 * 真机形状（2026-10-05 用 `tools/measure-mcp-handshake.cjs` 同款隔离 host 实测，未猜）：
 *   · `session/modelCatalog`（无参）→
 *       `{ default:{provider,model,reasoningEffort?}, routableProviders:[providerId…],
 *          groups:[{ id, name, models:[{ id, name, description?, reasoning:{ efforts:[{id,name,description}], defaultEffort } }] }],
 *          failures:[…] }`
 *   · `session/selectModel` → 请求 `{request:{sessionId, provider, model, reasoningEffort?}}`
 *       → 回 `{selected:{provider, model, reasoningEffort}}`
 *   · `session/list` → `items[].projections.values.modelSelection = { lastUsed, next:{provider,model,reasoningEffort} }`
 *       ⇒ **会话模型直接从 `next` 读**（不必去追 `model/selection` 事件流）
 */
let modelCatalogCache = { at: 0, value: null }
/** 读模型目录（默认 30s 缓存：它要问宿主，别每次点开设置都打一遍） */
async function readModelCatalog(force = false) {
  if (!force && modelCatalogCache.value && Date.now() - modelCatalogCache.at < 30000) return modelCatalogCache.value
  const v = await dshCall('session/modelCatalog', {}, 15000)
  modelCatalogCache = { at: Date.now(), value: v }
  return v
}
ipcMain.handle('akdagent-model-catalog', async (_e, force) => {
  try {
    const v = await readModelCatalog(force === true)
    return { ok: true, ...v }
  } catch (e) {
    return { ok: false, error: i18n.t('main.model.catalogFailed', (e && e.message) || String(e)) }
  }
})

/** 读"本会话"的模型选择；`sessionId` 省略时用球当前绑的会话（再退到**同一 workspace** 里最近的会话） */
async function readSessionModel(sessionId) {
  const r = await dshCall('session/list', { _request: {} }, 15000)
  const items = (r && r.items) || []
  /* ⚠️ 2026-10-05 实测补：**会话库按 workspace(cwd) 分目录，而 `session/list` 把所有 workspace 的会话
   *   一起返回**（本机三套：打包版 `…\Programs\AKDAgent\resources\dsh` · 开发 checkout
   *   `Documents\SVAgent\dsh-runtime\dsh` · 一个**已删的旧 checkout**）。若不按 cwd 过滤，
   *   `pool[0]`（= 最近的那条）很可能是**别的 workspace** 的会话 ⇒ 界面上就是"显示错值"。 */
  let root = null
  try { root = path.resolve(resolveDshRoot()).toLowerCase() } catch { root = null }
  const sameWs = root ? items.filter((x) => x && typeof x.cwd === 'string' && path.resolve(x.cwd).toLowerCase() === root) : items
  const pool = sameWs.length ? sameWs : items
  const want = sessionId || orbSessionId
  const exact = want ? pool.find((x) => x && x.sessionId === want) : null
  const it = exact || pool[0] || null
  const ms = it && it.projections && it.projections.values && it.projections.values.modelSelection
  return {
    sessionId: it ? it.sessionId : null,
    next: (ms && ms.next) || null,
    lastUsed: (ms && ms.lastUsed) || null,
    /* 没找到"我们绑定的那个会话"（如球还没绑、或它属于别的 workspace）⇒ 这是"最近一个会话"的值，
     * 界面应当照这个措辞显示，别冒充"本会话"。 */
    fallback: !(exact && exact.sessionId === want),
    workspaceFiltered: !!root && sameWs.length !== items.length,
    sessionCount: items.length,
  }
}
ipcMain.handle('akdagent-session-model', async (_e, sessionId) => {
  try {
    return { ok: true, ...(await readSessionModel(sessionId)) }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) }
  }
})

/** 切**本会话**的模型（Session-local，不动 agent-default-model） */
ipcMain.handle('akdagent-select-session-model', async (_e, sessionId, provider, model, reasoningEffort) => {
  const sid = sessionId || orbSessionId
  if (!sid) return { ok: false, error: i18n.t('main.model.noSession') }
  if (!provider || !model) return { ok: false, error: i18n.t('main.model.notSet') }
  try {
    const request = { sessionId: sid, provider, model }
    if (reasoningEffort) request.reasoningEffort = reasoningEffort
    const r = await dshCall('session/selectModel', { request }, 20000)
    modelCatalogCache.at = 0                 // 目录里的 `default` 可能随选择变 ⇒ 下次重新读
    const back = await readSessionModel(sid).catch(() => null)
    const selected = (r && r.selected) || (back && back.next) || { provider, model }
    /* 推给球与设置窗（两边都显示"本会话模型"） */
    for (const w of [orbWin, settingsWin]) {
      try { if (w && !w.isDestroyed()) w.webContents.send('akdagent-session-model', selected) } catch { /* 忽略 */ }
    }
    console.log(`[akdagent] 本会话模型已切换：${selected.provider}/${selected.model}` +
      (back && back.lastUsed ? `（上一轮实际用：${back.lastUsed.provider}/${back.lastUsed.model}）` : ''))
    return { ok: true, selected, sessionId: sid }
  } catch (e) {
    const msg = (e && e.message) || String(e)
    const code = (e && e.code) || ''
    return { ok: false, error: code ? `${msg}（${code}）` : msg }
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
  if (!writeSettings(s)) return { ok: false }
  return { ok: true, provider: providerId, model: modelId }
})

/** 把一个 provider route/id 派生成**合法的凭据名**（宿主的引用文法见 `CRED_REF_RE`）。
 *  2026-10-07（用户报「自定义提供方保存 apikey 也显示未配置」）：
 *   · 界面上 keyEnv 留空时，密钥是按**派生名**写进去的，但 profile 里没写 apiKeyEnv
 *     ⇒ 列表判据 `!!keyEnv && docHasApiKey(...)` 永远为假 ⇒ 卡片一直显示「未配置 API 密钥」；
 *   · 更糟的是卡片那条路把空 keyEnv 递给后端，而后端老代码 `keyEnv || 'DEEPSEEK_API_KEY'`
 *     会把**自定义提供方的密钥写进 DEEPSEEK_API_KEY**（顺手覆盖用户真的 DeepSeek 密钥）。
 *  ⇒ 统一在这里派生（并清洗成合法字符），后端与界面都用它。 */
function deriveKeyEnvName(providerId) {
  const id = String(providerId == null ? '' : providerId).trim()
  if (!id) return ''
  const name = id.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+/, '').replace(/_+$/, '')
  if (!name || /^[0-9]/.test(name)) return ''
  return name + '_API_KEY'
}

/** 解析"这次到底该写哪个凭据名"：显式传入 → 该 provider 的 profile → 从 id 派生。
 *  @returns {{env:string, repaired:boolean}} repaired = 顺手把 profile 的 apiKeyEnv 补上了 */
function resolveKeyEnvName(settings, providerId, keyEnv) {
  const explicit = String(keyEnv == null ? '' : keyEnv).trim()
  const piAi = (settings && settings['llm-pi-ai']) || {}
  const providers = piAi.providers || {}
  const profile = providers[providerId] && typeof providers[providerId] === 'object' ? providers[providerId] : null
  const fromProfile = profile ? String(profile.apiKeyEnv || '').trim() : ''
  const env = explicit || fromProfile || deriveKeyEnvName(providerId)
  /* profile 里没有（或与解析结果不一致）⇒ 补上：宿主要靠它知道去 refs 里读哪个名字，
   * 否则就算密钥写对了，宿主也用不上（这正是用户"看着配好了、其实没配"的另一半）。 */
  let repaired = false
  if (env && profile && fromProfile !== env) {
    profile.apiKeyEnv = env
    repaired = true
  }
  return { env, repaired }
}

/** 一次性修复（2026-10-07，用户报「自定义提供方保存 apikey 也显示未配置」）：
 *  给**没写 apiKeyEnv** 的 pi-ai 提供方补上凭据名 —— 只在该 route 的**派生名那份凭据确实存在**时才补
 *  （不猜、不乱写：命中了说明"密钥当初就是按派生名写进去的"，正是那个 bug 的产物）。
 *  补上之后：列表会显示「已配置」、宿主也知道去 `refs` 里读哪个名字。失败不影响启动。 */
function migratePiProviderKeyEnvs() {
  const fixed = []
  try {
    const s = readSettings()
    const piAi = s['llm-pi-ai'] || {}
    const providers = piAi.providers || {}
    const creds = readCredentials()
    for (const route of Object.keys(providers)) {
      const profile = providers[route]
      if (!profile || typeof profile !== 'object') continue
      if (String(profile.apiKeyEnv || '').trim()) continue      // 已经有了 ⇒ 不动
      const derived = deriveKeyEnvName(route)
      if (!derived || !CRED_REF_RE.test(derived)) continue
      if (!getCred(creds, derived)) continue                   // 库里没有 ⇒ 不猜
      profile.apiKeyEnv = derived
      fixed.push(route + '→' + derived)
    }
    if (fixed.length) {
      if (writeSettings(s)) console.log('[akdagent] 已给提供方补上凭据名 apiKeyEnv：' + fixed.join(' · '))
      else console.log('[akdagent] 补 apiKeyEnv 时写 settings.yaml 失败（下次启动再试）')
    }
  } catch (e) {
    console.log('[akdagent] 补 apiKeyEnv 失败（不影响启动）：' + ((e && e.message) || e))
    return []
  }
  return fixed
}

/** 更新提供方 API 密钥（写 credentials.yaml；keyEnv 为空时按 profile / id 推断，**绝不默认成 DeepSeek**） */
ipcMain.handle('akdagent-set-provider-key', (_e, providerId, keyEnv, keyValue) => {
  const s = readSettings()
  const { env, repaired } = resolveKeyEnvName(s, providerId, keyEnv)
  /* 凭据名必须符合宿主的引用文法 `/^[A-Za-z_][A-Za-z0-9_]*$/`（2026-09-27）：
   * 名字里带 `-` / `.` 之类的键，宿主读凭据时会直接抛错 ⇒ **整个宿主起不来**。
   * 名字来自界面上的自由输入（自定义提供方的 keyEnv 框）⇒ 在这里拦下来并把原因交给界面，
   * 而不是写进去等下次启动炸。 */
  if (!env || !CRED_REF_RE.test(env)) {
    return { ok: false, error: `凭据名 "${env || '(空)'}" 不合法：只能用字母/数字/下划线、且不能以数字开头（宿主会拒绝启动）` }
  }
  try {
    const creds = readCredentials()
    let warn = ''
    if (keyValue && keyValue.trim()) {
      const v = keyValue.trim()
      warn = keyShapeWarning(env, v)          // 🆕 2026-10-05：形状提示（**不拦**，见函数注释）
      setCred(creds, env, v)
    } else delCred(creds, env)
    writeCredentials(creds)
    if (repaired) {
      /* 顺手把 profile 的 apiKeyEnv 补上（self-repair）。写失败不影响本次密钥落库 ⇒ 只留痕，
       * 下次用户再保存会重试（界面上会显示"未配置"，正好提示他再点一次）。 */
      const wrote = writeSettings(s)
      if (!wrote) console.log('[akdagent] set-provider-key：补 apiKeyEnv 时写 settings.yaml 失败（keyEnv=' + env + '）')
    }
    return { ok: true, apiKeyEnv: env, repaired, configured: !!getCred(creds, env), warn }
  } catch (e) {
    // 以前这里异常会直接冒到渲染层（而且界面还没接住）⇒ 用户以为存好了；现在如实回报
    return { ok: false, error: '写入凭据失败：' + (e && e.message ? e.message : e) }
  }
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
  if (!writeSettings(s)) return { ok: false }
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
  if (!writeSettings(s)) return { ok: false }
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
  if (!writeSettings(s)) return { ok: false }
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
  if (!writeSettings(s)) return { ok: false }
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

/** 刷新 orb 宿主皮肤：按候选顺序真 ping（哪台活着就是哪台），变了才推。
 *  🆕 2026-10-03：皮肤判据抽到 host-pick.pickHostType —— 多了一套 **ACE Studio 第三皮肤**（紫）。
 *  它没有桥/心跳/活动信号 ⇒ 用户定的是**保守档**：有活动或桥活着的 SV/IX 优先，
 *  两者都没有、**ACE 在线**时才切 ACE；ACE 不在（没装/没开）时这套皮肤等于不存在。 */
async function refreshOrbHostType (force) {
  const fresh = {}
  for (const h of HOSTS) { try { fresh[h] = hostFresh(h) } catch { fresh[h] = false } }
  const decided = pickHostType({ activity: hostActivity, fresh, aceOnline: acePill.level === 'ok' })
  /* ACE 皮肤**不走 ping**（它没有我们的桥）⇒ 判成 ACE 就直接用；其余仍按老路真 ping 确认 */
  const type = decided === ACE_HOST_TYPE ? decided : await querySvHostType(orderCandidates(activeHost()))
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
        /* 🆕 2026-10-05：本轮失败的"人话原因"先攒在 `turnFail` 里，**等事件送进对话之后再推**
         *   （顺序的理由见文件下方 `pushTurnFailNotice` 的注释）。 */
        let turnFail = ''
        /* 一轮结束时把 reason 落日志（2026-09-26 新增）。
         * 旧版这里完全无痕：用户报「一发消息就 回合结束（error）」时，我们只有 UI 上那句话，
         * 定位不了（只有反复刷的 MCP 重连噪音）。console.* 已被顶部日志安全网接管 ⇒ 直接进 akdagent.log。 */
        try {
          const ev = v.event || {}
          if (ev.type === 'turn/end') {
            const r = (ev.data && ev.data.reason) || ev.reason
            if (r && r.kind && r.kind !== 'completed') {
              /* 🆕 2026-10-05（用户裁「6 做」）：**用户主动中止不是故障** ——
               *   以前它也走 console.error + 覆盖 `last-turn-error.json`（本机那份文件里就躺着
               *   `{"kind":"aborted","reason":{"kind":"user"}}`）⇒ 日志一屏 ERROR、报障文件还被"中止"占着。
               *   现在：中止只记 INFO、不写 last-turn-error.json、不推悬浮球；其它 reason 一律照旧（ERROR + 落盘）。 */
              const userAbort = r.kind === 'aborted' && String((r.reason && r.reason.kind) || '') === 'user'
              if (userAbort) {
                console.log('[akdagent] turn/end = 用户主动中止（不是故障，只记 INFO）')
              } else {
              /* 🆕 2026-10-05：映射不中就兜底（旧版这里 `turnErrorHint()` 返回空串 ⇒ 什么都不推，
               *   用户只看得到「回合结束（error）」）；`|| turnErrorRaw(r)` 再兜一层"连 error 字段都没有"的情况。 */
              const hint = turnErrorHint(r.error) || turnErrorRaw(r.error) || turnErrorRaw(r)
              turnFail = hint
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
          }
        } catch { /* 记日志失败不影响主流程 */ }
        // 会话日志事件：形状与旧版一致（`{type,seq,time,data}`），原样给渲染层
        const delivered = muxDeliver({ type: 'server-request', rpcId: null, payload: {
          type: 'session/event', sessionId, event: v.event } })
        /* 🆕 2026-10-05（用户裁「把失败原因直接写进对话」）：见 `pushTurnFailNotice` 的注释 ——
         *   必须**在事件之后**推，否则对话里「⚠ 原因」排在「回合结束（error）」前面。 */
        if (turnFail) pushTurnFailNotice(turnFail)
        return delivered
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

/* ───────── 客户端 PDF → PNG 渲染（识谱用；用户 2026-10-05 裁「① 客户端渲染」）─────────
 * 为什么在客户端做：识谱引擎吃**位图**，而 FL Studio 导出的谱子 PDF **两条引擎路都读不出**
 * （无内嵌位图 + 文字层是无 ToUnicode 自定义编码）；而用户手边最常有的就是 PDF。
 * 客户端自带 Chromium（有真 canvas）⇒ 用隐藏窗把每页渲成 PNG，再把 **PNG 路径**当附件交给 `sv_omr_image`。
 *
 * ⚠️ 前置条件（打包时要做，见 `electron/src/pdf-render.html` 头部注释）：
 *    `pdfjs-dist` 的 **min legacy 构建**（`pdf.min.mjs` + `pdf.worker.min.mjs`，共 ≈1.8 MB）要随包落到
 *    `<app>/src/vendor/pdfjs/legacy/build/`（由 `node tools/stage-pdfjs.cjs` 落位；渲染页按这个相对路径 import）。
 *    **别把 33 MB 全塞进包**；打包时 `asarUnpack` 要含 `src/vendor/pdfjs/**`（worker 从 asar 里读有坑）。
 * ⚠️ 渲染页返回的是**字节数组**；落盘只在主进程做（路径纪律只有一处）。
 */
const OMR_RENDER_DIR = path.join(AKDAGENT_DSH_HOME, 'omr-render')

/** PDF → 每页 PNG，落在 `OMR_RENDER_DIR`（`<AKDAGENT_DSH_HOME>/omr-render/<名字>-pNN.png`）；返回文件清单（**失败就抛，不静默**）。 */
async function renderPdfToPngs(pdfPath, { dpi = 300, maxPages = 20 } = {}) {
  if (!path.isAbsolute(String(pdfPath || ''))) throw new Error('只收**绝对**本地路径：' + String(pdfPath || ''))
  const abs = path.resolve(String(pdfPath))
  if (!fs.existsSync(abs)) throw new Error('读不到这个 PDF：' + abs)
  if (path.extname(abs).toLowerCase() !== '.pdf') throw new Error('只认 .pdf：' + abs)
  fs.mkdirSync(OMR_RENDER_DIR, { recursive: true })

  const page = path.join(__dirname, 'pdf-render.html')
  if (!fs.existsSync(page)) throw new Error('缺渲染页（打包漏了 src/pdf-render.html）：' + page)

  /* 渲染资产**预检**：打包漏了 vendor 时，错误必须**能照做**。
   * 实测（2026-10-06 复核）：html 在、pdfjs 不在时 `executeJavaScript` 只会 reject 一句
   * 「Script failed to execute… Check the renderer console」（隐藏窗没有 devtools，用户无从下手），
   * 而且下面那句"渲染没出图"的兜底文案还会把原因误指成「PDF 损坏 / 加密 / 空页」。 */
  const vDir = path.join(__dirname, 'vendor', 'pdfjs', 'legacy', 'build')
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    if (!fs.existsSync(path.join(vDir, f))) {
      throw new Error('缺客户端 pdfjs 渲染资产（' + f + '）⇒ 打包漏了 src/vendor/pdfjs：' +
        '出包前跑 `node tools/stage-pdfjs.cjs`，并确认 electron-builder 的 asarUnpack 含 `src/vendor/pdfjs/**`')
    }
  }

  /* 隐藏窗 + **关掉后台节流**：隐藏窗默认会被节流（rAF/timer 变慢），把 pdfjs 的渲染循环拖死 ——
   * 这条是 2026-10-05 截帮助页时踩过的同一类坑（隐藏窗里 rAF 被节流 ⇒ 调了也不动）。 */
  const win = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, nodeIntegration: false },
  })
  try {
    await win.loadFile(page)
    const pages = await win.webContents.executeJavaScript(
      `window.renderPdfToPngs(${JSON.stringify({ path: abs, dpi, maxPages })})`, true)
    if (!Array.isArray(pages) || !pages.length) throw new Error('渲染没出图（PDF 损坏 / 加密 / 全是空页？）')
    const base = path.basename(abs, path.extname(abs))
    const out = []
    for (const [i, p] of pages.entries()) {
      const idx = Number(p && p.index) || i + 1
      const file = path.join(OMR_RENDER_DIR, `${base}-p${String(idx).padStart(2, '0')}.png`)
      fs.writeFileSync(file, Buffer.from(p.bytes))
      out.push({ path: file, width: p.width, height: p.height, dpi: p.effectiveDpi })
    }
    console.log(`[akdagent] PDF 渲染：${out.length} 页 → ${OMR_RENDER_DIR}`)
    return out
  } finally {
    try { win.destroy() } catch { /* 忽略 */ }
  }
}

/* ───────── 客户端 音频 → WAV 解码（用户 2026-10-06 裁「走 C：Chromium 解码」）─────────
 * 为什么在客户端做：内置解码器只有 mpg123（**只认 MP3**）+ 我们自己的 WAV 读取器；
 * 用户从手机/DAW 拿来的是 **m4a(AAC)** ⇒ 喂 mpg123 出一段**噪声**（用户亲报「转换的 wav 是乱的」）。
 * 客户端自带的 Chromium **本来就能解** AAC/ALAC/FLAC/Opus/Vorbis/WAV ⇒ **零新增字节**（包里的 `ffmpeg.dll` 2.79 MB 本来就在）。
 *
 * ✅ 正确性证据（2026-10-06，用户那份 11.8 MB `obj_*.m4a` 实测）：382.9 s · 48 kHz 立体声，
 *   `decodeAudioData` **447 ms**；逐秒 RMS 与**真 ffmpeg** 出的 44.1k WAV 对照 = **平均差 0.002 dB · 相关系数 1.000000 · 时长差 0.003 s**。
 * ⛔ 别再走 libav.js：`variant-default` **没有 AAC 解码器/MP4 解复用器**（上游变体表 + 实测 `Could not open source file`），
 *   `variant-aac` 在 npm 不存在、官方 280 MB 全量 zip 的 168 个变体里也没有模块化 aac —— 只用自己 emscripten 现编。详见 `docs/待办.md` 2026-10-06 那条。
 *
 * 输出 = **源采样率的 16bit WAV**（不做重采样）：服务端 `prepareWav()` 本来就会读成 44.1k 立体声，少一处重采样少一处失真。
 */
const AUDIO_CONVERT_DIR = path.join(AKDAGENT_DSH_HOME, 'audio-convert')

/** 哪些容器值得交给 Chromium 试一次（**提示性**白名单：服务端才是判官，这里只决定"值不值得试"）。
 *  `.wav`/`.mp3` 故意**不在表里** —— 内置解码器本来就能用，不该多绕一圈。 */
const AUDIO_DECODE_EXTS = new Set([
  '.m4a', '.m4b', '.m4r', '.aac', '.mp4', '.mov', '.3gp',   // AAC / ALAC（MP4 家族）
  '.flac', '.ogg', '.oga', '.opus', '.webm', '.weba',       // FLAC / Ogg / WebM
  '.aif', '.aiff', '.aifc', '.caf', '.wma',                 // AIFF / CAF / WMA（能不能解看 Chromium，解不了会如实报）
])

/** 音频文件 → 16bit WAV，落在 `AUDIO_CONVERT_DIR`（`<AKDAGENT_DSH_HOME>/audio-convert/<名字>-<hash8>.wav`）。
 *  hash 取"路径+大小+修改时间" ⇒ 同一个文件重复拖不会重复转（缓存命中直接覆盖同名产物）。
 *  **失败就抛，不静默**（调用方把原因写进附件条）。 */
async function decodeAudioToWav(srcPath, { maxSeconds = 1800, chunkBytes = 8 * 1024 * 1024 } = {}) {
  if (!path.isAbsolute(String(srcPath || ''))) throw new Error('只收**绝对**本地路径：' + String(srcPath || ''))
  const abs = path.resolve(String(srcPath))
  if (!fs.existsSync(abs)) throw new Error('读不到这个音频：' + abs)
  const st = fs.statSync(abs)
  if (!st.isFile()) throw new Error('不是文件（目录？）：' + abs)

  const page = path.join(__dirname, 'audio-decode.html')
  if (!fs.existsSync(page)) throw new Error('缺解码页（打包漏了 src/audio-decode.html）：' + page)

  fs.mkdirSync(AUDIO_CONVERT_DIR, { recursive: true })
  const tag = crypto.createHash('sha1').update(`${abs}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 8)
  const out = path.join(AUDIO_CONVERT_DIR, `${path.basename(abs, path.extname(abs))}-${tag}.wav`)

  /* 隐藏窗 + **关后台节流**（隐藏窗默认被节流；与 PDF 渲染同一条坑）。沙箱/无 node 即可：
   * 解码页只走 fetch(file://) + Web Audio，不需要任何 Node 能力。 */
  const win = new BrowserWindow({
    show: false, width: 640, height: 480,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, nodeIntegration: false },
  })
  try {
    await win.loadFile(page)
    const info = await win.webContents.executeJavaScript(
      `window.akdAudioDecode(${JSON.stringify({ path: abs, maxSeconds })})`, true)
    if (!info || !(info.bytes > 44)) throw new Error('解码没出数据（Chromium 认不出这个音频？）')

    /* 分块拉（base64）后顺序落盘：一份 6.4 分钟的 m4a → WAV ≈73 MB，一次性从 executeJavaScript 返回会顶爆序列化。 */
    const fd = fs.openSync(out, 'w')
    try {
      for (let off = 0; off < info.bytes; off += chunkBytes) {
        const len = Math.min(chunkBytes, info.bytes - off)
        const b64 = await win.webContents.executeJavaScript(`window.akdAudioChunk(${off}, ${len})`, true)
        fs.writeSync(fd, Buffer.from(String(b64), 'base64'))
      }
    } finally { fs.closeSync(fd) }

    // 产物自检：长度对 + 真 WAV（不给"解码说成功但其实空"留面）
    const got = fs.statSync(out).size
    if (got !== info.bytes) throw new Error(`写出长度不对：${got} ≠ ${info.bytes}（${out}）`)
    const head = Buffer.alloc(12)
    const hfd = fs.openSync(out, 'r')
    try { fs.readSync(hfd, head, 0, 12, 0) } finally { fs.closeSync(hfd) }
    if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error('产物不是 WAV：' + out)

    console.log(`[akdagent] 音频解码：${path.basename(abs)} → ${path.basename(out)}` +
      `（${(got / 1048576).toFixed(1)} MB · 源 ${info.srcRate} Hz ${info.srcChannels}ch ${info.srcSeconds.toFixed(1)}s` +
      `${info.truncated ? ' · **已截断**' : ''} · ${info.decodeMs} ms）`)
    return {
      path: out, dir: AUDIO_CONVERT_DIR, bytes: got, seconds: info.seconds,
      srcRate: info.srcRate, srcChannels: info.srcChannels, srcSeconds: info.srcSeconds, truncated: !!info.truncated,
    }
  } finally {
    try { await win.webContents.executeJavaScript('window.akdAudioRelease()', true) } catch { /* 忽略 */ }
    try { win.destroy() } catch { /* 忽略 */ }
  }
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

/** 拖拽/粘贴进来的路径：只回「存在吗 / 是目录还是文件 / 多大 / 基名」——
 *  **不读文件内容、不写盘**（附件只把绝对路径拼进消息，工具侧自己再走护栏）。
 *  路径用 `path.resolve` 归一（粘贴来的可能是 `"C:\a\b.pdf"` 去掉引号后的相对/绝对混写）。 */
/* PDF → PNG（识谱用）：把用户拖进来的 `.pdf` **换成 PNG 路径**再交给智能体。
 * 为什么必须有这个口子：识谱引擎吃**位图**，而用户手边最常有的就是 PDF（见 renderPdfToPngs 的说明）。
 * 失败**不静默**：返回 `{ ok:false, error }`，界面把它写进附件条提示（用户能看懂、能自己转图）。 */
ipcMain.handle('akdagent-pdf-render', async (_e, p, opts) => {
  try {
    const files = await renderPdfToPngs(String(p || ''), {
      dpi: (opts && opts.dpi) || 300,
      maxPages: (opts && opts.maxPages) || 20,
    })
    return { ok: true, count: files.length, files, dir: OMR_RENDER_DIR }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) }
  }
})

/* 音频 → WAV（内置解码器只认 MP3/WAV；m4a/AAC、FLAC、Ogg 这些靠客户端 Chromium 解，见 decodeAudioToWav）。
 * 只在这些扩展名上被前端调用（`.wav`/`.mp3` 不走这里）；失败**不静默**：`{ ok:false, error }` 会写进附件条。 */
ipcMain.handle('akdagent-audio-decode', async (_e, p, opts) => {
  try {
    const r = await decodeAudioToWav(String(p || ''), { maxSeconds: (opts && opts.maxSeconds) || 1800 })
    return {
      ok: true, file: r.path, base: path.basename(r.path), dir: r.dir,
      seconds: r.seconds, srcRate: r.srcRate, srcChannels: r.srcChannels, truncated: r.truncated,
    }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) }
  }
})

/* 订阅登录（OAuth）：① 只读快照 + ② 当前尝试（界面一次拿全，少一次竞态）。 */
ipcMain.handle('akdagent-auth-flows', () => {
  try {
    return readAuthState(AKDAGENT_DSH_HOME)
  } catch (e) {
    return { ok: false, why: (e && e.message) || String(e) }
  }
})

/* 订阅登录：**下命令**给宿主插件（写 cmd.json，插件 400ms 轮询）。
 * 三个动作：开始一次登录 / 回答一个 prompt / 取消。全程只写文件，不碰网络（网络是宿主与厂商之间的事）。 */
ipcMain.handle('akdagent-auth-begin', (_e, key, method) => {
  try {
    if (!key) return { ok: false, why: 'no-key' }
    return writeAuthCmd(AKDAGENT_DSH_HOME, 'begin', { key: String(key), method: String(method || 'oauth') })
  } catch (e) { return { ok: false, why: (e && e.message) || String(e) } }
})
ipcMain.handle('akdagent-auth-answer', (_e, promptId, value) => {
  try {
    if (!promptId) return { ok: false, why: 'no-prompt' }
    return writeAuthCmd(AKDAGENT_DSH_HOME, 'answer', { promptId: String(promptId), value: String(value == null ? '' : value) })
  } catch (e) { return { ok: false, why: (e && e.message) || String(e) } }
})
ipcMain.handle('akdagent-auth-cancel', () => {
  try {
    return writeAuthCmd(AKDAGENT_DSH_HOME, 'cancel', {})
  } catch (e) { return { ok: false, why: (e && e.message) || String(e) } }
})

ipcMain.handle('akdagent-file-stat', (_e, p) => {
  try {
    const full = path.resolve(String(p || '').trim())
    const st = fs.statSync(full)
    const ext = st.isDirectory() ? '' : path.extname(full).toLowerCase()
    /* `audioConvertible`：这条路**只做判断、不读内容** —— 由主进程当"要不要转音频"的唯一权威
     *（列表在 main.js 的 AUDIO_DECODE_EXTS；渲染层不再抄一份，免得两处清单各自腐烂）。 */
    return {
      ok: true, path: full, base: path.basename(full), isDir: st.isDirectory(), size: st.size,
      ext, audioConvertible: !st.isDirectory() && AUDIO_DECODE_EXTS.has(ext),
    }
  } catch (e) {
    return { ok: false, error: e && e.code ? e.code : String((e && e.message) || e) }
  }
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
    /* 🆕 2026-10-07（用户报「OpenAI Plus 登录 403 地区不受支持，换网络也没用」）：
     *   **起宿主之前**探一次系统代理 —— 宿主与它拉起的子进程只认环境变量，而 Node 不读
     *   Windows「系统代理」/ macOS 系统设置 ⇒ 用户设成"系统代理"时助手一直直连出去。
     *   详细口径见 `electron/src/system-proxy.js` 顶部注释（只看 ProxyEnable、注入前探一次可达性、
     *   SOCKS/PAC 不采、绝不改 process.env）。**失败一律 fail-soft**：探不到就直连，绝不拦启动。 */
    await probeNetworkRoute('startup')
    /* 🆕 2026-10-08（用户「stt 也做成跟系统」）：语音模型下载改走 **Electron net**
     *   （Chromium 网络栈 ⇒ 天生跟随系统代理，连 PAC / SOCKS 都支持）。
     *   原来的 Node `https.get` 既不读系统代理、也不读 `HTTP(S)_PROXY` ⇒
     *   设了"系统代理"的用户**语音模型根本下不下来**（国内尤其明显）。
     *   fail-soft：注入失败就退回 Node https（日志里说明），绝不因此拦住启动。 */
    try {
      sttModel.setDownloadTransport(createElectronDownloader({ net: electronNet, fs }))
      console.log('[akdagent] STT 模型下载：走 Electron 网络栈（跟随系统代理）')
    } catch (e) {
      console.log('[akdagent] STT 下载器接入失败（退回 Node https，可能不跟随代理）：' + ((e && e.message) || e))
    }
    // 隐藏所有窗口的应用菜单栏（orb/聊天/设置/弹窗都不显示菜单）
    Menu.setApplicationMenu(null)
    createTray()
    createOrbWindow()
    spawnSttServer()
    // ── P23 孤儿 host 防护（2026-09-17）──────────────────────────────
    // 客户端被强杀/崩溃时，内嵌 host 会残留（quitApp 的 killTree 没机会跑）。下次启动若再新起一个，
    // 就变成**两个 host 写同一个会话** ⇒ DSH 会话日志损坏（实测事故）。单实例锁只挡"两个客户端"，
    // 挡不住孤儿 host ⇒ 这里：**上一次的 host 还活着就复用它**（复用它永远只有一个 host）。
    /* ⚠️ 每次启动都同步凭据/设置 —— **必须在复用判定之前**（2026-09-26 热修，本次事故的真因）。
     *  以前它挂在 `spawnHost()` 里，而 `spawnHost()` 只在"没得复用"时调 ⇒ 一旦复用孤儿 host
     *  （客户端被强杀/卸载残留；记录里的 cookie 有效期 **30 天**，实测到期日 = 签发 +30d）就整段跳过
     *  ⇒ 宿主永远拿不到用户后填的 key ⇒ 每轮 AUTH/401，而手工 copy 凭据**立刻就好**。
     *  宿主读的就是隔离家目录那份、且对它 chokidar 热重载 ⇒ 复用同版本 host 时同步同样生效，
     *  所以这里**无条件**跑（复用与新起两条路都覆盖）。 */
    warnCredentialEnvShadowing()
    /* 起宿主 + **失败自愈重试一次**（2026-09-27）。
     * 以前：宿主在就绪前退出 ⇒ 客户端直接跟着退（用户看到"过了一会就闪退"，且重装也没用）。
     * 现在：先在原地自愈（`ensureAkdagentDshHome()` 会把"宿主读不了"的凭据规范化/挪走 —— 实测那正是
     * boot 失败最常见的原因），再重来一次；两次都起不来才弹框 + 退出（并把宿主的报错一起摆出来）。 */
    let hostUp = false
    let lastErr = null
    for (let attempt = 0; attempt < HOST_MAX_ATTEMPTS && !hostUp; attempt++) {
      try {
        await bringUpHost(attempt)
        hostUp = true
      } catch (e) {
        lastErr = e
        const msg = (e && e.message) || String(e)
        if (attempt + 1 < HOST_MAX_ATTEMPTS) {
          console.error(`[akdagent] 宿主启动失败（${msg}）⇒ 先自愈再重试（第 ${attempt + 2}/${HOST_MAX_ATTEMPTS} 次）`)
          hostPort = null; hostTokenUrl = null; hostCookie = null
        }
      }
    }
    if (!hostUp) {
      const tail = hostStderrTail.slice().reverse().find((l) => /error|failed|FATAL|unknown|refus/i.test(l)) || ''
      throw new Error('内嵌宿主起不来：' + ((lastErr && lastErr.message) || '未知原因')
        + (hostExitInfo ? `（宿主退出 code=${hostExitInfo.code}）` : '')
        + (tail ? '\n宿主最后一条错误：' + tail : ''))
    }
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
    /* 🆕 2026-09-27（用户）：一个 SV scripts 目录都没指定 ⇒ 提醒一次（每个版本一次，不做唠叨）。
     * 延后 1.5s：让球/设置窗先画出来，也让"密钥窗"那种启动弹窗先落地，别挤在一起。 */
    setTimeout(() => notifyMissingSvDirs(), 1500)
    /* 🆕 2026-09-27：开机就检查"默认模型能不能解析" —— 缺了直接推到球上（否则用户只会看到每轮 error） */
    setTimeout(() => checkAgentModelConfigured(), 2000)
    // 开发辅助：模拟点「SV 集成 → 部署面板」（验收那个原生确认框；env 门控，默认无副作用）
    devClickSvPanelDeploy()
  } catch (e) {
    console.error('[akdagent] failed to start:', e)
    /* 启动失败**不能静默退出**（用户只会觉得"点了没反应"，我们也没日志）：
     * 除日志外弹一次原生错误框。自动化验证用 AKDAGENT_NO_DIALOG=1 关掉，
     * 否则模态框会挡住无人值守的测试（看起来"活着"其实在等点击）。 */
    if (process.env.AKDAGENT_NO_DIALOG !== '1') {
      try {
        let crashPath = ''
        try { crashPath = path.join(app.getPath('userData'), 'host-crash.json') } catch { crashPath = '' }
        dialog.showErrorBox('AKDAgent 启动失败 / failed to start',
          String((e && e.message) || e)
          + '\n\n日志 / log: ' + (safeLogPath || '(不可用)')
          + (crashPath ? '\n宿主现场 / host crash: ' + crashPath : ''))
      } catch { /* 弹框失败就算了，日志仍然有 */ }
    }
    quitApp('启动失败')
  }
})

app.on('window-all-closed', () => {
  console.log('[akdagent] window-all-closed (all windows gone)')
  quitApp('窗口全关（悬浮球与设置窗都没了）')
})

app.on('before-quit', () => {
  console.log('[akdagent] before-quit（进程退出中）')
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
      // 2026-10-05：分级 —— `model loaded` / `listening on` 是正常生命周期，记 INFO 而不是 ERROR
      logChildOutput('[stt]', d)
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
