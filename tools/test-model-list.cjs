#!/usr/bin/env node
/**
 * test-model-list.cjs —— 单测：`electron/src/model-list.js` 的 `sanitizeModelList()`。
 *
 * 背景（2026-10-08 用户报的原始现场）：
 *   `INVALID_MODEL_INFO — adapter returned invalid exact model metadata for provider "bailian" model "qwen3.8-max"`
 *   根因：设置页「显示名称」留空 ⇒ settings.yaml 里那条模型是 `name: ""`；而宿主的判据是
 *   「name 必须是非空字符串」（`dsh-llm/lib/index.js:2053`）——pi-ai 那边 `name: entry.name ?? … ?? entry.id`
 *   的兜底**不兜空字符串**（`??` 只兜 null/undefined）⇒ 直接硬拒。
 *
 * 本文件把"清洗口径"钉住：空 name ⇒ 用 id · 没有 id ⇒ 丢掉 · 空 description / 非正整数数值键 ⇒ 删键 ·
 * 未知键保留 · 同 id 后者覆盖前者 · 非数组输入 ⇒ 空列表。
 *
 * 用法：node tools/test-model-list.cjs
 */
'use strict'
const assert = require('node:assert')
const { sanitizeModelList } = require('../electron/src/model-list.js')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name) }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 220) : '')) }
}

console.log('== ① 用户报的那个现场：显示名留空（name: ""）==')
{
  const { models, repaired } = sanitizeModelList([{ id: 'qwen3.8-max', name: '', description: '', supportsImage: false }])
  ok('name 被补成模型 ID（这就是 INVALID_MODEL_INFO 的修法）', models.length === 1 && models[0].name === 'qwen3.8-max', models)
  ok('id 原样保留', models[0].id === 'qwen3.8-max')
  ok('空的 description 被删键（不算字符串内容）', !('description' in models[0]), models[0])
  ok('supportsImage 是布尔 ⇒ 保留', models[0].supportsImage === false)
  ok('如实记账（说了改了哪两处）', repaired.some((r) => /显示名为空/.test(r)) && repaired.some((r) => /描述是空的/.test(r)), repaired)
}

console.log('\n== ② name 缺省（undefined）与只有空白字符 ==')
{
  const a = sanitizeModelList([{ id: 'm1' }])
  ok('name 缺省 ⇒ 用 id（不记账，因为本来就没写）', a.models[0].name === 'm1' && a.repaired.length === 0, a)
  const b = sanitizeModelList([{ id: 'm2', name: '   ' }])
  ok('全是空格 ⇒ 也算空（用 id）', b.models[0].name === 'm2', b.models)
  const c = sanitizeModelList([{ id: '  m3  ', name: ' 显示名 ' }])
  ok('id / name 都 trim', c.models[0].id === 'm3' && c.models[0].name === '显示名', c.models)
}

console.log('\n== ③ 没有 id 的条目一律丢掉（宁可不显示，也不写宿主读不了的）==')
{
  const r = sanitizeModelList([{ name: 'x' }, { id: '' }, { id: '   ' }, 'not-an-object', null, { id: 'ok' }])
  ok('只剩那一条有合法 id 的', r.models.length === 1 && r.models[0].id === 'ok', r.models)
  ok('每一条都记了账', r.repaired.filter((x) => /丢掉/.test(x)).length === 5, r.repaired)
}

console.log('\n== ④ 数值键：非正整数一律删掉（宿主会给 INVALID_MODEL_CONTEXT / _MAX_TOKENS）==')
{
  const r = sanitizeModelList([
    { id: 'a', contextWindow: 0, maxTokens: -1 },
    { id: 'b', contextWindow: 128000, maxTokens: 8192 },
    { id: 'c', contextWindow: 1.5, maxTokens: '8192' },
  ])
  ok('0 / 负数 ⇒ 两个键都删', !('contextWindow' in r.models[0]) && !('maxTokens' in r.models[0]), r.models[0])
  ok('正整数 ⇒ 原样保留', r.models[1].contextWindow === 128000 && r.models[1].maxTokens === 8192, r.models[1])
  ok('小数 / 字符串 ⇒ 删', !('contextWindow' in r.models[2]) && !('maxTokens' in r.models[2]), r.models[2])
  ok('每条都记账', r.repaired.filter((x) => /正整数/.test(x)).length === 4, r.repaired)
}

console.log('\n== ⑤ 未知键保留 · supportsImage 非布尔删 · 同 id 后者覆盖 ==')
{
  const unique = sanitizeModelList([{ id: 'x', name: 'X', vendorField: { deep: 1 }, supportsImage: 'yes' }])
  ok('未知键原样保留（用户/未来版本塞的东西不归我们丢）', unique.models[0].vendorField && unique.models[0].vendorField.deep === 1, unique.models[0])
  ok('supportsImage 非布尔 ⇒ 删', !('supportsImage' in unique.models[0]), unique.models[0])

  /* ⚠️ 重复 id 的口径是「**整体**以最后一条为准」（不是逐字段合并）——
   *   所以第一条的未知键**不会**被带过来。这是刻意的：用户最后提交的那条就是他的意图。 */
  const dup = sanitizeModelList([{ id: 'x', name: 'X', vendorField: 1 }, { id: 'x', name: 'X2' }])
  ok('同 id 只留一条、整体以最后一条为准', dup.models.length === 1 && dup.models[0].name === 'X2' && !('vendorField' in dup.models[0]), dup.models)
  ok('记账说了重复', dup.repaired.some((x) => /重复出现/.test(x)), dup.repaired)
}

console.log('\n== ⑥ 非法输入不抛（界面/别的客户端可能传来任何形状）==')
{
  for (const bad of [undefined, null, 'x', 42, {}, { 0: 'a' }]) {
    let threw = false
    let r = null
    try { r = sanitizeModelList(bad) } catch (_) { threw = true }
    ok(`${JSON.stringify(bad)} ⇒ 空列表且不抛`, !threw && Array.isArray(r.models) && r.models.length === 0, r)
  }
  const empty = sanitizeModelList([])
  ok('空数组 ⇒ 空列表、无记账（这是"回内建目录"的正常用法）', empty.models.length === 0 && empty.repaired.length === 0, empty)
}

console.log('\n== ⑦ 清洗后的形状必须能过"宿主那三条硬判据"（本地模拟一遍）==')
{
  const hostCheck = (m) => typeof m.id === 'string' && m.id.length > 0
    && typeof m.name === 'string' && m.name.length > 0
    && (m.description === undefined || typeof m.description === 'string')
    && (m.contextWindow === undefined || (Number.isInteger(m.contextWindow) && m.contextWindow > 0))
    && (m.maxTokens === undefined || (Number.isInteger(m.maxTokens) && m.maxTokens > 0))
  const cases = [
    [{ id: 'qwen3.8-max', name: '', description: '', supportsImage: false }],
    [{ id: 'a', contextWindow: 0 }, { id: 'b' }, { id: 'c', name: 'C', maxTokens: 1 }],
    [{ id: 'd', description: '   ' }],
  ]
  for (const c of cases) {
    const { models } = sanitizeModelList(c)
    ok(`${JSON.stringify(c).slice(0, 60)}… 清洗后全部过宿主判据`, models.length > 0 && models.every(hostCheck), models)
  }
}

console.log('\n== ⑧ 图片键翻译（两家适配器读的键名不同；界面给的是 supportsImage）==')
{
  /* 出处：DeepSeek 读 `inputModalities`（dsh-llm-deepseek/lib/index.js:1504 / :1620 / schema :1879），
   *       pi-ai 读 `input`（dsh-llm-pi-ai/lib/index.js:682 / :973 / :1845）；
   *       而 `supportsImage` 是**我们界面自己的键**，宿主树里没有任何地方读它（全树检索确认）。 */
  const dsOn = sanitizeModelList([{ id: 'd1', supportsImage: true }], { imageKey: 'inputModalities' })
  ok('DeepSeek：勾了 ⇒ 写 inputModalities',
    JSON.stringify(dsOn.models[0].inputModalities) === '["text","image"]', dsOn.models[0])
  ok('DeepSeek：supportsImage 不落盘（死键）', !('supportsImage' in dsOn.models[0]), dsOn.models[0])
  ok('DeepSeek：不会写出 pi-ai 的 input 键', !('input' in dsOn.models[0]), dsOn.models[0])

  const dsOff = sanitizeModelList([{ id: 'd2', supportsImage: false }], { imageKey: 'inputModalities' })
  ok('DeepSeek：没勾 ⇒ inputModalities = ["text"]', JSON.stringify(dsOff.models[0].inputModalities) === '["text"]', dsOff.models[0])

  const piOn = sanitizeModelList([{ id: 'p1', supportsImage: true }], { imageKey: 'input' })
  ok('pi-ai：勾了 ⇒ 写 input', JSON.stringify(piOn.models[0].input) === '["text","image"]', piOn.models[0])
  ok('pi-ai：不会写出 DeepSeek 的 inputModalities 键', !('inputModalities' in piOn.models[0]), piOn.models[0])

  /* 老版本（≤1.1.4）在 DeepSeek 那条路上写的是 `input` —— 下次写盘时顺手迁移 */
  const mig1 = sanitizeModelList([{ id: 'old', name: 'OLD', input: ['text', 'image'] }], { imageKey: 'inputModalities' })
  ok('迁移：DeepSeek 条目上的老 input ⇒ 改成 inputModalities',
    JSON.stringify(mig1.models[0].inputModalities) === '["text","image"]' && !('input' in mig1.models[0]), mig1.models[0])
  ok('迁移：如实记账', mig1.repaired.some((r) => /input 已改写成 inputModalities/.test(r)), mig1.repaired)

  const mig2 = sanitizeModelList([{ id: 'old2', inputModalities: ['text', 'image'] }], { imageKey: 'input' })
  ok('迁移：pi-ai 条目上的 inputModalities ⇒ 改成 input',
    JSON.stringify(mig2.models[0].input) === '["text","image"]' && !('inputModalities' in mig2.models[0]), mig2.models[0])

  const both = sanitizeModelList([{ id: 'b', supportsImage: true, input: ['text'] }], { imageKey: 'inputModalities' })
  ok('两个键同时在 + 有勾选 ⇒ 以勾选为准，另一家的键删掉',
    JSON.stringify(both.models[0].inputModalities) === '["text","image"]' && !('input' in both.models[0]), both.models[0])

  const bad = sanitizeModelList([{ id: 'x', input: ['audio'] }, { id: 'y', input: [] }], { imageKey: 'input' })
  ok('非法模态（audio）⇒ 删键（不让宿主去抛）', !('input' in bad.models[0]), bad.models[0])
  ok('空数组 ⇒ 也不写（pi-ai 的 declaredInput 把 [] 当"没声明"，写了等于没写）', !('input' in bad.models[1]), bad.models[1])
  ok('两条都记账', bad.repaired.filter((r) => /不是合法的模态数组/.test(r)).length === 2, bad.repaired)

  const keep = sanitizeModelList([{ id: 'k', input: ['text', 'image'] }], { imageKey: 'input' })
  ok('没勾选信息但本家键已经对了 ⇒ 原样保留、不记账', JSON.stringify(keep.models[0].input) === '["text","image"]' && keep.repaired.length === 0, keep)

  const noOpt = sanitizeModelList([{ id: 'n', supportsImage: true, input: ['text'] }])
  ok('不传 imageKey ⇒ 保持旧行为（不翻译、别的键不动）',
    noOpt.models[0].supportsImage === true && JSON.stringify(noOpt.models[0].input) === '["text"]', noOpt.models[0])
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail ? 1 : 0)
