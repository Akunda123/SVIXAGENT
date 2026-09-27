/**
 * Electron 侧的文件通道客户端（自包含实现）。
 *
 * ⚠️ **为什么不复用 `server/dist/fileipc.js`**：Electron 打包后（release/win-unpacked）
 *    只有自己的资源目录，跨目录 require 会在发行版里失效 ⇒ 这里做一份**自包含**实现。
 *
 * 2026-09-12：**剪贴板通道已整体退役**（JS 桥删除）⇒ 本模块是 Electron 与宿主之间的
 *   **唯一**通道。桥不在线时**明确报错**，不再回落剪贴板。
 *
 * 报文协议：请求 `{v,seq,id,op,args}` → 响应 `{v,id,seq,ok,result|error}`。
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
// 桥错误会经聊天面板 / 设置页直接显示给用户 ⇒ 文案走 i18n（客户端界面语言，与 DSH 语言无关）
const i18n = require('./i18n')

const MAX_AGE_SEC = 15
let seqCounter = 0

function resolveIpcDir() {
  const env = process.env.AKDAGENT_IPC_DIR
  if (env) return env
  const cands = []
  if (process.env.USERPROFILE) cands.push(path.join(process.env.USERPROFILE, 'AKDAgent', 'ipc'))
  cands.push(os.tmpdir())
  for (const d of cands) {
    try {
      fs.accessSync(d, fs.constants.W_OK)
      return d
    } catch { /* 试下一个 */ }
  }
  return os.tmpdir()
}

const fileFor = (dir, kind, host) => path.join(dir, `akdagent-${kind}-${host}.json`)

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function readHeartbeat(host = 'sv', dir) {
  return readJson(fileFor(resolveIpcDir(dir), 'hb', host))
}

/**
 * 读桥落的「肇事 op 面包屑」（`akdagent-lastop-<host>.json`）。
 * 🆕 2026-09-27：桥**每笔请求执行前**落盘 `stage="running"`、跑完改 `done/failed`。
 *   为什么需要：宿主弹的脚本错误框是**模态**的 ⇒ 框一弹宿主主线程停、桥的轮询链停、
 *   Lua 侧一行日志都写不出来 ⇒ 事后只知道"桥不在了"，不知道是哪一笔造成的。
 *   有这个文件，就能**指名肇事 op**，并把"关框 → Ctrl+S → 重跑桥"三步摆到用户面前。
 */
function readLastOp(host = 'sv', dir) {
  return readJson(fileFor(resolveIpcDir(dir), 'lastop', host))
}

/**
 * 这条面包屑是不是「**当前这次桥运行**、且那一笔**没跑完**」？（⇒ 多半是被模态框冻住了）
 *
 * 两个必须的互校（否则会冤枉）：
 *   · `hb.session !== crumb.session` ⇒ 那是**上一次桥运行**留下的旧面包屑（桥重启后文件还在盘上）；
 *   · `hb.opsRun >= crumb.reqSeen` ⇒ 那一笔**已经跑完了**（opsRun 在 op 跑完后才自增）。
 * 返回 `null` 或 `{ op, ts, session, args }`。
 */
function frozenCrumb(host = 'sv', dir) {
  const c = readLastOp(host, dir)
  if (!c || !c.op || c.stage !== 'running') return null
  const hb = readHeartbeat(host, dir)
  if (hb && typeof hb.session === 'number' && typeof c.session === 'number' && hb.session !== c.session) return null
  if (hb && typeof hb.opsRun === 'number' && typeof c.reqSeen === 'number' && hb.opsRun >= c.reqSeen) return null
  return { op: String(c.op), ts: c.ts, session: c.session, args: c.args }
}

function heartbeatAgeSec(host = 'sv', dir) {
  const hb = readHeartbeat(host, dir)
  if (!hb || typeof hb.ts !== 'number') return null
  return Math.floor(Date.now() / 1000) - hb.ts
}

function isBridgeAlive(host = 'sv', dir, maxAgeSec = MAX_AGE_SEC) {
  const age = heartbeatAgeSec(host, dir)
  return age !== null && age <= maxAgeSec
}

/**
 * 这个 op 现在能不能被服务？判据 = ① 有心跳 ② 心跳新鲜 ③ 心跳声明了该 op。
 * （不再有白名单：桥自报 `ops` 就是能力清单 —— 桥是 Lua 桥，op 语义只有一种。）
 */
function canServe(op, host = 'sv', dir, maxAgeSec = MAX_AGE_SEC) {
  const hb = readHeartbeat(host, dir)
  if (!hb) return { ok: false, reason: i18n.t('main.ipc.noHeartbeat') }
  const age = heartbeatAgeSec(host, dir)
  if (age === null) return { ok: false, reason: i18n.t('main.ipc.hbNoTs') }
  if (age > maxAgeSec) return { ok: false, reason: i18n.t('main.ipc.hbStale', age) }
  const ops = Array.isArray(hb.ops) ? hb.ops : []
  if (!ops.includes(op)) return { ok: false, reason: i18n.t('main.ipc.opNotDeclared', op), advertisedOps: ops }
  return { ok: true, reason: i18n.t('main.ipc.hbFresh', age), advertisedOps: ops }
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)          // Windows 的 rename 可覆盖（MoveFileEx REPLACE_EXISTING）
}

/** 发一个请求并等响应；**永不抛异常**（失败返回 {ok:false,error}），便于调用方统一处理 */
async function fileIpcSend(op, args = {}, opts = {}) {
  const host = opts.host || 'sv'
  const dir = resolveIpcDir(opts.dir)
  const timeoutMs = opts.timeoutMs || 10000
  const pollMs = opts.pollMs || 40
  const seq = Date.now() * 1000 + (seqCounter = (seqCounter + 1) % 1000)
  const id = `electron-${seq}`
  const t0 = Date.now()
  const reqFile = fileFor(dir, 'req', host)
  const resFile = fileFor(dir, 'res', host)

  try { fs.unlinkSync(resFile) } catch { /* 旧响应，忽略 */ }
  try {
    writeAtomic(reqFile, JSON.stringify({ v: 1, seq, id, op, args }))
  } catch (e) {
    return { ok: false, error: i18n.t('main.ipc.writeFailed', e.message), elapsedMs: Date.now() - t0, seq }
  }
  while (Date.now() - t0 < timeoutMs) {
    const res = readJson(resFile)
    // 以 id（字符串，无损）匹配：不依赖 seq 的数值精度（Lua 侧曾把大整数写成科学计数法）
    if (res && res.id === id) {
      return res.ok
        ? { ok: true, result: res.result, elapsedMs: Date.now() - t0, seq }
        : { ok: false, error: String(res.error || 'unknown'), elapsedMs: Date.now() - t0, seq }
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return { ok: false, error: i18n.t('main.ipc.noResponse', timeoutMs, seq), elapsedMs: Date.now() - t0, seq }
}

module.exports = {
  resolveIpcDir,
  readHeartbeat,
  heartbeatAgeSec,
  isBridgeAlive,
  canServe,
  fileIpcSend,
  readLastOp,
  frozenCrumb,
}
