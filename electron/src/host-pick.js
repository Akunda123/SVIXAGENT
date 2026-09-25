/**
 * 「当前是哪台宿主」的**唯一判定处**（2026-09-25 新增）。
 *
 * 为什么需要：客户端原先在四处写死/偏向 `sv`，同时开 SV 与 IX 时 IX 侧全都不对 ——
 *   ① 面板中继（`panel-bridge.js` 的 `state.host` 单值 + `startPanelBridge()` 按
 *      `['sv','ix']` 顺序 sv 优先、且启动后 `return` 不再采样）⇒ IX 侧栏永远"还没连上悬浮球"；
 *   ② orb 宿主皮肤（`querySvHostType()` 里 `svCall('ping')` 不传 host ⇒ `HOST_DEFAULT='sv'`）
 *      ⇒ IX 皮肤（蓝主题/IX logo/ixagent-text/标题）是死代码；
 *   ③ 工程名（`querySvProjectName()` 同样默认 sv）⇒ 在 IX 里干活却显示 SV 的工程名；
 *   ④ 设置页「检查桥」（sv 在线就不看 ix）⇒ 报告口径只有 SV。
 *
 * 本模块**只做纯计算**（无 IO、无 electron 依赖）⇒ 可用 `node` 直接单测
 * （见 `electron/dev/test-host-pick.cjs`）；取样（读心跳）、面板中继、推送都在 `main.js`。
 *
 * 判据（用户 2026-09-25 定：两台都要能同时用）：
 *   ① **有活动就用最近活动的那台** —— 活动 = 该宿主的面板事件 / 面板里发过话 / 心跳里
 *      `lastSeq`·`opsRun`·`reqSeen` 变过（说明 agent 正在那台上干活）；
 *   ② 都没有活动 ⇒ 用**桥活着**的那台（只有 IX 开也能亮 IX 皮肤）；
 *   ③ 都没有 ⇒ 兜底 `sv`（皮肤不乱切）。
 */
'use strict'

/** 采样顺序（**只在"完全没有信号"时当兜底**，不代表优先级） */
const HOSTS = ['sv', 'ix']

/** 宿主 id → 推给 orb 的宿主类型（orb 用它切皮肤；见 orb.html 的 onHostType） */
const HOST_TYPE = { sv: 'sv', ix: 'instrument-x' }

/**
 * 选"当前宿主"。
 * @param {Record<string, number>} [activity] 宿主 → 最近活动时间戳（ms）；没活动写 0/省略
 * @param {Record<string, boolean>} [fresh]   宿主 → 桥心跳是否新鲜
 * @returns {'sv'|'ix'}
 */
function pickActiveHost (activity = {}, fresh = {}) {
  let best = null
  let bestAt = 0
  for (const h of HOSTS) {
    const at = Number(activity[h]) || 0
    if (at > bestAt) { bestAt = at; best = h }
  }
  if (best) return best                              // ① 谁最近被用过谁是当前宿主
  for (const h of HOSTS) if (fresh[h]) return h       // ② 没活动：谁桥活着用谁
  return HOSTS[0]                                     // ③ 都没有：兜底（不切皮肤）
}

/** ping / 取工程名时的候选顺序：当前宿主优先，另一台兜底 */
function orderCandidates (active) {
  const a = HOSTS.includes(active) ? active : HOSTS[0]
  return [a].concat(HOSTS.filter((h) => h !== a))
}

/** 宿主 id → orb 宿主类型（未知宿主返回 null ⇒ 调用方别推、别切皮肤） */
function typeOf (host) {
  return HOST_TYPE[host] || null
}

module.exports = { HOSTS, HOST_TYPE, pickActiveHost, orderCandidates, typeOf }
