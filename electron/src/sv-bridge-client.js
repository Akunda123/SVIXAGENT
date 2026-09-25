/**
 * 与宿主（Synthesizer V / Instrument X）的桥客户端 —— **纯文件通道**。
 *
 * 2026-09-12：**剪贴板通道整体退役**。原来是"JS 桥只能借剪贴板"（JS 沙箱零宿主对象），
 * 现在 Lua 桥用 `io`/`os` 走文件通道，且 op 已全部移植完毕（现役 **29 个**，见 `skills/akdagent-protocol` 的操作清单）⇒ 剪贴板相关代码
 * （PowerShell 读写剪贴板、命令前缀探测、SVPROJ 剪贴板推送监听）全部删除。
 *
 * 对外接口保持不变（main.js 无需改动）：svCall / querySvProjectName / querySvHostType /
 * startProjectEventWatch / stopProjectEventWatch。
 */
const fileipc = require('./file-ipc.js')
// 界面文案（设置页/聊天面板会显示这里抛出的错误与 info.reason），见 i18n/README.md
const i18n = require('./i18n')

const HOST_DEFAULT = 'sv'
let seq = 0
/** 工程名缓存：**一台宿主一份**（`projCache[host]`，见 querySvProjectName） */
let projCache = { sv: { name: null, at: 0 }, ix: { name: null, at: 0 } }
const PROJ_CACHE_MS = 5000   // 工程名缓存 5 秒
/** 心跳新鲜判定（秒）—— probeBridge（真 ping）与 probeBridgeHeartbeat（只看心跳）共用，
 *  悬浮球三态指示灯也按这个阈值判"在线"。 */
const HEARTBEAT_FRESH_SEC = 15

/**
 * 调桥一个 op，返回 result。
 *
 * 通道：**只有文件通道**。桥不在线、或桥没声明该 op ⇒ 立刻抛出可操作的错误
 * （不再回落剪贴板 —— 用户 2026-09-12 裁定：宁可报错，也不碰剪贴板）。
 *
 * @param {string} op 桥操作名，如 get_project_info
 * @param {object} [args]
 * @param {{timeoutMs?:number, host?:string}} [opts]
 * @returns {Promise<any>}
 */
async function svCall(op, args, opts = {}) {
  const host = (opts && opts.host) || HOST_DEFAULT
  const timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 3000

  const svc = fileipc.canServe(op, host)
  if (!svc.ok) {
    const extra = svc.advertisedOps ? i18n.t('main.bridge.advertisedOps', svc.advertisedOps.join(', ')) : ''
    throw new Error(i18n.t('main.bridge.notServing', svc.reason, extra))
  }
  const r = await fileipc.fileIpcSend(op, args || {}, { host, timeoutMs })
  if (r.ok) return r.result
  throw new Error(i18n.t('main.bridge.opFailed', op, r.error))
}

/** 查询宿主当前工程文件名（**按宿主**缓存 5 秒；无桥/无工程时返回 null）。
 *  ⚠️ 2026-09-25：以前不分宿主（且写死默认宿主 `sv`）⇒ 在 IX 里干活时显示的是 SV 的工程名。
 *  现在缓存也是一台一份（`projCache[host]`），别退回去用单份缓存。 */
async function querySvProjectName(host = HOST_DEFAULT) {
  const h = host === 'ix' ? 'ix' : 'sv'
  const now = Date.now()
  const c = projCache[h]
  if (c && now - c.at < PROJ_CACHE_MS) return c.name
  try {
    const info = await svCall('get_project_info', {}, { host: h, timeoutMs: 3000 })
    const fn = info && info.fileName
    projCache[h] = { name: (fn && typeof fn === 'string' && fn.length > 0 ? fn : null), at: now }
  } catch {
    projCache[h] = { name: null, at: now }
  }
  return projCache[h].name
}

let eventTimer = null
let eventCallback = null

/**
 * 启动工程切换事件监听（**轮询式**）。
 *
 * 原实现监听剪贴板里的 `SVPROJ:` 推送（那是 JS 桥的行为）。剪贴板退役后改为
 * **轮询工程名**：每 `pollProjectMs`（默认 5 秒）查一次，**变了才回调**（去重保证不重复触发）。
 * 注意 `querySvProjectName` 自身还有 5 秒缓存。
 */
function startProjectEventWatch(cb, intervalMs = 800, pollProjectMs = 5000) {
  eventCallback = cb
  if (eventTimer) return
  let lastFiredName = null
  let nextPollAt = Date.now() + pollProjectMs
  const fire = (name) => {
    if (name === lastFiredName) return
    lastFiredName = name
    if (eventCallback) eventCallback(name)
  }
  const tick = async () => {
    if (!eventCallback) return
    if (Date.now() < nextPollAt) return
    nextPollAt = Date.now() + pollProjectMs
    try {
      fire(await querySvProjectName())
    } catch {
      /* 桥不可达时忽略（下次再试） */
    }
  }
  eventTimer = setInterval(tick, intervalMs)
}

/** 停止工程切换事件监听 */
function stopProjectEventWatch() {
  if (eventTimer) {
    clearInterval(eventTimer)
    eventTimer = null
  }
  eventCallback = null
}

/**
 * 查询宿主类型（`'sv' | 'instrument-x' | null`）—— 供 orb 切皮肤。
 *
 * ⚠️ 2026-09-25 修：原来是一句 `svCall('ping', {}, { timeoutMs: 2000 })`，**没传 host**
 *   ⇒ 走 `HOST_DEFAULT = 'sv'`：SV 桥活着就永远回 `'sv'`，SV 桥不在就 catch 回 `null`
 *   ⇒ orb 的 IX 皮肤（蓝主题 / IX logo / ixagent-text / 标题）**永远进不去**（死代码）。
 *   现在按**候选顺序**逐台 ping（调用方用 `host-pick.orderCandidates(当前宿主)` 传进来），
 *   谁活着用谁 —— 只有 IX 开着也能亮 IX 皮肤。
 * @param {string[]} [candidates] 候选宿主顺序；省略时 `['sv','ix']`
 */
async function querySvHostType(candidates) {
  const list = (Array.isArray(candidates) && candidates.length) ? candidates : ['sv', 'ix']
  for (const host of list) {
    const h = host === 'ix' ? 'ix' : 'sv'
    try {
      const info = await svCall('ping', {}, { host: h, timeoutMs: 2000 })
      if (info && info.host) return h === 'ix' ? 'instrument-x' : 'sv'
    } catch {
      /* 这台不在线/没宣布 ping ⇒ 试下一台 */
    }
  }
  return null
}

/**
 * 真·桥自检（2026-09-13 新增）：**心跳新鲜度 + 真实 ping 往返**。
 * 之前的"检查桥连接"是个占位实现（只回内嵌 DSH host 状态 ⇒ 永远"已连接"，与 SV 桥无关）。
 * @param {string} [host] 'sv' | 'ix'
 * @returns {Promise<{host:string,online:boolean,fresh:boolean,ageSec:number|null,hostName?:string,
 *   version?:string,bridge?:string,ops?:number,rttMs?:number,reason?:string}>}
 */
async function probeBridge(host = HOST_DEFAULT) {
  const info = { host, online: false, fresh: false, ageSec: null }
  let hb = null
  try {
    hb = fileipc.readHeartbeat(host)
    info.ageSec = hb ? Math.round(fileipc.heartbeatAgeSec(host)) : null
  } catch {
    /* 读心跳失败按"无心跳"处理 */
  }
  if (!hb) {
    info.reason = i18n.t('main.bridge.noHeartbeat')
    return info
  }
  info.hostName = hb.hostName
  info.version = hb.version
  info.bridge = hb.bridge
  info.ops = (hb.ops && hb.ops.length) || 0
  info.isSV2 = hb.isSV2
  info.fresh = typeof info.ageSec === 'number' && info.ageSec <= HEARTBEAT_FRESH_SEC
  if (!info.fresh) {
    info.reason = i18n.t('main.bridge.staleHeartbeat', info.ageSec)
    return info
  }
  // 心跳新鲜 ⇒ 再做一次真实往返（证明"能干活"而不只是"心跳在跳"）
  try {
    const t0 = Date.now()
    const p = await svCall('ping', {}, { host, timeoutMs: 4000 })
    info.online = true
    info.rttMs = Date.now() - t0
    if (p) {
      info.hostName = p.host || info.hostName
      info.version = p.version || info.version
      info.bridge = p.bridge || info.bridge
      info.isSV2 = p.isSV2
      info.ops = (p.ops && p.ops.length) || info.ops
      info.dir = p.dir
    }
  } catch (e) {
    info.reason = i18n.t('main.bridge.pingFailed', e.message)
  }
  return info
}

/**
 * **心跳-only 探针**（2026-09-21 新增，给悬浮球三态指示灯用）：只读心跳文件，**绝不 ping 宿主**。
 *
 * 为什么不复用 probeBridge()：那个在心跳新鲜时会再发一次真 ping（4s 超时，见上），
 * 而悬浮球要 5s 轮询一次 —— 频繁敲宿主既没必要也可能打扰（用户 2026-09-21 口径：
 * 判断"桥在不在"只看心跳，不去敲它；要证"能干活"才用 probeBridge）。
 *
 * 同步、纯文件读，不会抛（读失败按"无心跳"处理）。
 *
 * @param {string} [host] 'sv' | 'ix'
 * @returns {{host:string,fresh:boolean,ageSec:number|null,hostName?:string,version?:string,
 *   bridge?:string,isSV2?:boolean,ops?:number,reason?:'noHeartbeat'|'staleHeartbeat'}}
 *   ⚠️ `reason` 这里是**代码**（不是本地化文本，与 probeBridge 的 reason 不同）——
 *   由调用方（悬浮球）组 i18n 文案。
 */
function probeBridgeHeartbeat(host = HOST_DEFAULT) {
  const info = { host, fresh: false, ageSec: null }
  let hb = null
  try {
    hb = fileipc.readHeartbeat(host)
    info.ageSec = hb ? Math.round(fileipc.heartbeatAgeSec(host)) : null
  } catch {
    /* 读心跳失败按"无心跳"处理 */
  }
  if (!hb) {
    info.reason = 'noHeartbeat'
    return info
  }
  info.hostName = hb.hostName
  info.version = hb.version
  info.bridge = hb.bridge
  info.isSV2 = hb.isSV2
  info.ops = (hb.ops && hb.ops.length) || 0
  info.fresh = typeof info.ageSec === 'number' && info.ageSec <= HEARTBEAT_FRESH_SEC
  if (!info.fresh) info.reason = 'staleHeartbeat'
  return info
}

module.exports = {
  svCall, querySvProjectName, querySvHostType, startProjectEventWatch, stopProjectEventWatch,
  probeBridge, probeBridgeHeartbeat, HEARTBEAT_FRESH_SEC,
}
