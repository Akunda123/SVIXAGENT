/**
 * host-pick 单测（纯 node，**不需要 electron**）：`node dev/test-host-pick.cjs`
 *
 * 为什么值得测：这段是"当前是哪台宿主"的唯一判据，错了的表现是**静默**的
 * （IX 皮肤不变蓝 / 工程名显示成 SV 的 / ping 打错宿主），真机上很难一眼看出。
 * 2026-09-25 加：改这个文件时请连着跑一遍。
 */
'use strict'

const { HOSTS, HOST_TYPE, pickActiveHost, orderCandidates, typeOf, pickHostType, ACE_HOST_TYPE } = require('../src/host-pick.js')

const checks = []
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  checks.push({ ok, name })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → 得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`}`)
}

console.log('=== 常量 ===')
check('HOSTS = [sv, ix]', HOSTS, ['sv', 'ix'])
check('HOST_TYPE.ix = instrument-x', HOST_TYPE.ix, 'instrument-x')

console.log('=== pickActiveHost ===')
check('都没活动、都没桥 ⇒ 兜底 sv', pickActiveHost({}, {}), 'sv')
check('都没活动、只有 ix 活着 ⇒ ix', pickActiveHost({}, { ix: true }), 'ix')
check('都没活动、两台都活着 ⇒ sv（固定兜底顺序）', pickActiveHost({}, { sv: true, ix: true }), 'sv')
check('ix 活动更新 ⇒ ix', pickActiveHost({ sv: 1000, ix: 2000 }, {}), 'ix')
check('sv 活动更新 ⇒ sv', pickActiveHost({ sv: 5000, ix: 2000 }, {}), 'sv')
check('持平 ⇒ 先看的 sv', pickActiveHost({ sv: 3000, ix: 3000 }, {}), 'sv')
check('活动是 0/null/undefined ⇒ 退回看桥', pickActiveHost({ sv: 0, ix: null }, { ix: true }), 'ix')
check('活动时间戳是字符串也认', pickActiveHost({ ix: '1700000000000' }, {}), 'ix')
check('没传参不炸', pickActiveHost(), 'sv')

console.log('=== orderCandidates ===')
check("当前 ix ⇒ [ix, sv]", orderCandidates('ix'), ['ix', 'sv'])
check("当前 sv ⇒ [sv, ix]", orderCandidates('sv'), ['sv', 'ix'])
check('未知/空 ⇒ [sv, ix]', orderCandidates('nope'), ['sv', 'ix'])
check('undefined ⇒ [sv, ix]', orderCandidates(), ['sv', 'ix'])

console.log('=== typeOf ===')
check('sv ⇒ sv', typeOf('sv'), 'sv')
check('ix ⇒ instrument-x', typeOf('ix'), 'instrument-x')
check('未知 ⇒ null（调用方别切皮肤）', typeOf('nope'), null)

/* ── 第三套皮肤：ACE Studio（2026-10-03 加）──
 * 用户定的是**保守档**：ACE 只在 SV/IX 都不可用时才上（绝不遮住能干活的目标）；
 * 没装/没开（aceOnline=false）时这套皮肤**等于不存在**（永远退回 sv/ix）。 */
console.log('=== pickHostType（含 ACE 第三皮肤）===')
check('ACE 在线 + 都没活动/没桥 ⇒ 上 ACE 皮肤', pickHostType({ aceOnline: true }), ACE_HOST_TYPE)
check('ACE 不在 ⇒ 永不出现（兜底 sv）', pickHostType({ aceOnline: false }), 'sv')
check('ACE 在线但 ix 桥活着 ⇒ ix（保守档：不遮能干活的目标）', pickHostType({ fresh: { ix: true }, aceOnline: true }), 'instrument-x')
check('ACE 在线但 sv 桥活着 ⇒ sv', pickHostType({ fresh: { sv: true }, aceOnline: true }), 'sv')
check('ACE 在线但 ix 有活动 ⇒ ix（活动优先）', pickHostType({ activity: { ix: 2000 }, aceOnline: true }), 'instrument-x')
check('ACE 在线 + sv 桥死了但 ix 活 ⇒ ix', pickHostType({ fresh: { sv: false, ix: true }, aceOnline: true }), 'instrument-x')
check('都没传参 ⇒ sv（不切皮肤）', pickHostType(), 'sv')
check('ACE_HOST_TYPE 常量 = ace-studio', ACE_HOST_TYPE, 'ace-studio')
check('ACE 不在 HOSTS 里（它不是桥宿主，不该被 pickActiveHost 选中）', HOSTS.includes('ace'), false)

const failed = checks.filter((c) => !c.ok)
console.log(`\n=== ${checks.length - failed.length}/${checks.length} 通过 ===`)
if (failed.length) {
  console.log('失败项：')
  for (const f of failed) console.log(' - ' + f.name)
}
process.exit(failed.length ? 1 : 0)
