// ============================================================================
// orb 聊天「段表」—— 聊天记录的工程归属 + 跨工程连续性（2026-09-13）
// ============================================================================
// 规格见 docs/聊天记录归属设计.md。要点：
//   · **显示层**：全量时间线 + 工程分隔线（切工程/导出/手动新会话都不清空）
//   · **模型层**：一个"段"= 一个 DSH 会话 ⇒ 天然"只喂当前工程段"；更早内容用摘要文本补
//   · 归属用**段（seq 区间）**而不是逐条标签 ⇒ 收编 = 改一个字段，**零复制、不 fork**
//   · **收编**：临时段（projectKey=null）在有路径的工程出现时**原地过继**给该工程
//     （其会话直接成为该工程的活动 generation —— 因此不需要 fork/复制）
//   · **导出**：记 exportedUpToSeq + 换新 generation ⇒ 旧段"不再喂模型"（日志仍在，可显示/可再导出）
//   · **临时段只归档不显示**：会话已由 DSH 落盘，本模块不删任何文件
//
// 本文件是**纯逻辑**（不依赖 electron/DSH），便于单测：tests 见 tools/test-orb-segments.cjs
// ============================================================================

const fs = require('node:fs')
const path = require('node:path')

const VERSION = 1

let stateFile = null
let st = null

function emptyState() {
  return {
    version: VERSION,
    /** 段列表（按 createdAt 排序语义）：归属与模型上下文的边界 */
    segments: [],
    /** 活动段 id */
    active: null,
    /** 每工程已用过的 generation 号（切回复用最后一个 generation） */
    gens: {},
  }
}

function init(file) {
  stateFile = file
  st = load()
  return st
}

function load() {
  try {
    const raw = fs.readFileSync(stateFile, 'utf8')
    const j = JSON.parse(raw)
    if (!j || j.version !== VERSION || !Array.isArray(j.segments)) return emptyState()
    return j
  } catch {
    return emptyState()
  }
}

function save() {
  if (!stateFile) return
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    const tmp = stateFile + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(st, null, 1), 'utf8')
    fs.renameSync(tmp, stateFile)   // 原子替换，避免半截文件
  } catch (e) {
    console.log('[orb-segments] save failed: ' + e.message)
  }
}

const nowIso = () => new Date().toISOString()
const normKey = (k) => (k ? String(k).replace(/\\/g, '/').toLowerCase() : null)

function newSegId() {
  const n = (st.segments.length + 1).toString().padStart(3, '0')
  return 's' + n + '-' + Date.now().toString(36).slice(-4)
}

function activeSegment() {
  if (!st) return null
  return st.segments.find((s) => s.segId === st.active) || null
}

/** 该工程最后一个 generation 号（无则 0） */
function lastGen(projectKey) {
  const k = projectKey == null ? 'temp' : normKey(projectKey)
  return (st.gens && st.gens[k]) || 0
}

/** 会话 id 只能用安全字符：不合规就把 key 压成 sha1 前 12 位（main.js 传进来的通常已是 12-hex） */
function sanitizeKey(key) {
  const s = String(key == null ? 'temp' : key)
  if (/^[a-z0-9_-]{1,24}$/.test(s)) return s
  return require('node:crypto').createHash('sha1').update(s).digest('hex').slice(0, 12)
}

/** 只读预测"下一个会用到的会话 id"（**不占号**；占号在 openSegment 里发生） */
function nextSessionId(projectKey) {
  const key = projectKey == null ? 'temp' : sanitizeKey(normKey(projectKey))
  return `akdagent-orb-${key}-g${lastGen(projectKey) + 1}`
}

function bumpGen(projectKey, gen) {
  const k = projectKey == null ? 'temp' : normKey(projectKey)
  st.gens = st.gens || {}
  st.gens[k] = Math.max(st.gens[k] || 0, gen)
}

/** 惰性确保存在活动段（用于"没加载工程就聊天"的临时段） */
function ensureSegment() {
  const cur = activeSegment()
  if (cur) return cur
  return openSegment(null, 'temp')
}

function openSegment(projectKey, kind, projectName) {
  const key = projectKey == null ? null : normKey(projectKey)
  const gen = lastGen(key) + 1
  // ‼️ 开段即**占号**（bumpGen），并把 id 一口气定下来：
  //    否则"开段"与"取名"会各消耗一次号 ⇒ 号跑偏 / 两段撞同一个 id
  bumpGen(key, gen)
  const sid = `akdagent-orb-${key == null ? 'temp' : sanitizeKey(key)}-g${gen}`
  const seg = {
    segId: newSegId(),
    projectKey: key,
    projectName: projectName || null,   // 可读名（分隔线显示用）
    kind: kind || (key ? 'project' : 'temp'),
    sessionId: sid,          // 已定；真正在 DSH 里 create 由 ensureOrbSession 做
    sessionReady: false,     // DSH 侧是否已创建
    gen,
    fromSeq: 0,
    toSeq: null,
    exportedUpToSeq: null,
    exportedFile: null,
    pendingSummary: false,   // 下一次 prompt 前是否需要注入摘要
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  st.segments.push(seg)
  st.active = seg.segId
  return seg
}

/**
 * 工程"出现/切换"（桥推送）。
 *   · 活动段是**临时段**且本次有工程 ⇒ **原地过继**（改 projectKey + kind），会话保持不变（零复制）
 *   · 活动段属于**别的工程** ⇒ 新开该工程的段（复用该工程最后一个 generation 的会话，若存在）
 *   · 活动段已属于同一工程 ⇒ 不动
 * 返回 { seg, retagged, switched }
 */
function noteProject(projectKey, projectName) {
  const key = projectKey == null ? null : normKey(projectKey)
  const cur = activeSegment()
  // 临时工程（无路径）：不切换、不建段（保持现状，避免 no-project 震荡）
  if (key == null) return { seg: cur, retagged: false, switched: false }
  if (cur && cur.projectKey == null) {
    // 收编：临时段原地过继给该工程
    cur.projectKey = key
    cur.projectName = projectName || cur.projectName || null
    cur.kind = 'project'
    cur.updatedAt = nowIso()
    bumpGen(key, cur.gen)
    save()
    return { seg: cur, retagged: true, switched: false }
  }
  if (cur && cur.projectKey === key) {
    if (projectName && cur.projectName !== projectName) { cur.projectName = projectName; save() }
    return { seg: cur, retagged: false, switched: false }
  }
  // 切到另一个工程：新段（会话尽量复用该工程最后一个 gen）
  const seg = openSegment(key, 'project', projectName)
  save()
  return { seg, retagged: false, switched: true }
}

/** 标记该段的会话已在 DSH 侧创建（正常路径下 id 即段自带的那个；fork 等场景可覆盖） */
function registerSession(segId, sessionId) {
  const seg = st.segments.find((s) => s.segId === segId)
  if (!seg) return null
  if (sessionId) seg.sessionId = sessionId
  seg.sessionReady = true
  seg.updatedAt = nowIso()
  const m = String(seg.sessionId).match(/-g(\d+)$/)
  if (m) {
    bumpGen(seg.projectKey, parseInt(m[1], 10))
    seg.gen = parseInt(m[1], 10)
  }
  save()
  return seg
}

function setSegmentEnd(segId, seq) {
  const seg = st.segments.find((s) => s.segId === segId)
  if (!seg || typeof seq !== 'number') return
  seg.toSeq = seq
  seg.updatedAt = nowIso()
  save()
}

function markExported(segId, seq, file) {
  const seg = st.segments.find((s) => s.segId === segId)
  if (!seg) return null
  seg.exportedUpToSeq = seq
  seg.exportedFile = file || null
  seg.updatedAt = nowIso()
  save()
  return seg
}

function requestSummary(segId, flag) {
  const seg = st.segments.find((s) => s.segId === segId)
  if (!seg) return null
  seg.pendingSummary = !!flag
  save()
  return seg
}

/** 供渲染层用：按创建顺序返回段（含 projectKey/kind，用于画分隔线） */
function displaySegments() {
  return st.segments.map((s) => ({
    segId: s.segId,
    projectKey: s.projectKey,
    projectName: s.projectName || null,
    kind: s.kind,
    sessionId: s.sessionId,
    gen: s.gen,
    exportedUpToSeq: s.exportedUpToSeq,
    exportedFile: s.exportedFile,
    createdAt: s.createdAt,
  }))
}

/** seq → 段（用于把历史事件打上归属；同一会话内 seq 单调） */
function findSegmentBySeq(sessionId, seq) {
  const own = st.segments.filter((s) => s.sessionId === sessionId)
  if (!own.length) return null
  for (const s of own) {
    const from = s.fromSeq || 0
    const to = s.toSeq == null ? Infinity : s.toSeq
    if (seq >= from && seq <= to) return s
  }
  return own[own.length - 1]   // 落在已知区间外（新事件）⇒ 归最后一段
}

/** 导出该「记录组」的段（按时间序）—— **与球上时间线的口径对齐**（用户 2026-09-19 裁定）。
 *
 *  为什么必须成组：球上的时间线是 `displaySegments()`（**全部段**），而导出原先只取
 *  `activeSegment()` ⇒ **屏幕上看得见的记录导不出来**（用户实测：导出的那段刚开、只有 3 个事件
 *  ⇒ 落成 159 B 的空文件，而记录其实在别的段里）。
 *  范围规则（用户裁定）：
 *    · 活动段**属于某工程** ⇒ 该工程的**全部段** + **紧邻其在先的未归属临时段**；
 *      依据 = 设计文档 §「收编时机＝加载/保存工程时，把**加载前的临时段**并入该工程」——
 *      旧实现只并了**活动那一个**，其余临时段成了永久孤儿（显示得出来、导不出来）。
 *    · 活动段**本身就是未归属段** ⇒ 以它结尾的那一串连续未归属段。
 *  ⚠️ 依赖 `st.segments` 的**数组顺序 = 时间顺序**（开段/收编/登记孤儿都按此维护）。
 */
function exportSegments() {
  if (!st) return []
  const cur = activeSegment()
  if (!cur) return []
  const all = st.segments
  const end = all.indexOf(cur)
  if (end < 0) return [cur]
  if (cur.projectKey == null) {
    let start = end
    while (start - 1 >= 0 && all[start - 1].projectKey == null) start--
    return all.slice(start, end + 1)
  }
  const owned = all.filter((s) => s.projectKey === cur.projectKey)
  if (!owned.length) return [cur]
  const firstOwned = all.indexOf(owned[0])
  let start = firstOwned
  while (start - 1 >= 0 && all[start - 1].projectKey == null) start--
  return [...all.slice(start, firstOwned), ...owned]
}

/** 把「DSH 里有、段表里没有」的 `akdagent-orb-*` 会话登记成段（kind='orphan'、未归属）。
 *
 *  为什么：早期版本用过别的会话命名（`akdagent-orb-no-project`、`akdagent-orb-<hash>`），
 *  这些会话**不在段表里** ⇒ 球上不显示、导出也永远带不上（2026-09-19 实测三个：
 *  15151 / 291 / 24829 事件，**内容都在**）。
 *  ⚠️ 排除 `akdagent-orb-summary-*`（模型摘要用的一次性会话，进段表就是污染）。
 *  ⚠️ **插到数组最前面**：它们是**最早**的会话（早于 `-g<N>` 命名方案），而 `exportSegments()`
 *     依赖"数组顺序 = 时间顺序"⇒ 只能前插，不能追加到末尾。
 *  @returns 新增段数
 */
function adoptSessions(sessionIds) {
  if (!st || !Array.isArray(sessionIds)) return 0
  const known = new Set(st.segments.map((s) => s.sessionId))
  const fresh = []
  for (const raw of sessionIds) {
    const sid = String(raw || '')
    if (!sid.startsWith('akdagent-orb-')) continue
    if (sid.startsWith('akdagent-orb-summary-')) continue
    if (known.has(sid)) continue
    known.add(sid)
    fresh.push({
      segId: 's' + String(st.segments.length + fresh.length + 1).padStart(3, '0') + '-' + Date.now().toString(36).slice(-4),
      projectKey: null,
      projectName: null,
      kind: 'orphan',
      sessionId: sid,
      sessionReady: true,        // DSH 里早就存在
      gen: 0,                    // 不属于任何 generation 序列
      fromSeq: 0,
      toSeq: null,
      exportedUpToSeq: null,
      exportedFile: null,
      pendingSummary: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
  }
  if (!fresh.length) return 0
  st.segments.unshift(...fresh)
  save()
  return fresh.length
}

const snapshot = () => JSON.parse(JSON.stringify(st || emptyState()))

module.exports = {
  VERSION,
  init,
  save,
  snapshot,
  activeSegment,
  ensureSegment,
  openSegment,
  noteProject,
  registerSession,
  setSegmentEnd,
  markExported,
  requestSummary,
  displaySegments,
  findSegmentBySeq,
  nextSessionId,
  lastGen,
  exportSegments,
  adoptSessions,
}
