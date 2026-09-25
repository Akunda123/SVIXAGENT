#!/usr/bin/env node
/**
 * **技法规则表守卫**（2026-09-21 立）—— 盯住 `skills/sv-ix/references/articulation-rules.{json,md}`
 *
 * 为什么要有它：规则表是**要落进工具的行为**（路线 A：只覆盖少数音符）。它一旦和
 * ① 技法矩阵（支持集/互斥图）② 技能文档 ③ `status`（草案 vs 已确认） 脱节，
 * 就会出现"工具写了某乐器不支持的键""同一条规则里塞了两个互斥技法""草案被当成定稿用"这类问题。
 *
 * 检查：
 *   1) 结构：status / rules / priority / safetyRules 齐备；rule 要有 id / event / criterion / why
 *   2) 词表：set、setAnyOf 的每一项、fallback 里的键，都必须落在技法矩阵的 knownKeys ∪ implicitKeys 里
 *   3) 互斥：**同一条规则里同时给的键**不许自相冲突（按矩阵 mutexGraph 逐对查）
 *   4) 族名：familyHint 必须是矩阵里出现过的 family（或 all）
 *   5) 优先级：priority 里的 id 必须都存在、不重复
 *   6) 文档锚点：.md 里必须出现每条规则 id（与安全规则 id）、以及两个 JSON 的文件名
 *   7) 状态一致：status=draft ⇒ .md 标题里带「草案」；status=confirmed ⇒ 标题里**不许**有「草案」
 *   8) 提示（不计 exit）：某条规则的键在所有乐器支持集里都不存在 ⇒ 该规则永远不会命中
 *
 * 用法：node tools/check-articulation-rules.cjs [--json]
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const REF = path.join(ROOT, 'skills', 'sv-ix', 'references')
const RULES_JSON = path.join(REF, 'articulation-rules.json')
const RULES_MD = path.join(REF, 'articulation-rules.md')
const MATRIX_JSON = path.join(REF, 'articulation-matrix.json')
const AS_JSON = process.argv.includes('--json')

const problems = []
const infos = []
const bad = (m) => problems.push(m)
const info = (m) => infos.push(m)

function readJson(p, what) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) {
    console.error('[FAIL] 读/解析 ' + what + ' 失败：' + e.message)
    process.exit(2)
  }
}
const rules = readJson(RULES_JSON, 'articulation-rules.json')
const matrix = readJson(MATRIX_JSON, 'articulation-matrix.json')
const md = fs.readFileSync(RULES_MD, 'utf8')

const vocab = new Set([...(matrix.knownKeys || []), ...Object.keys(matrix.implicitKeys || {})])
const graph = matrix.mutexGraph || {}
const families = new Set((matrix.instruments || []).map((i) => i.family).filter(Boolean))
const supportedAnywhere = new Set()
for (const it of matrix.instruments || []) for (const k of it.supported || []) supportedAnywhere.add(k)

// 1) 结构
if (!['draft', 'confirmed'].includes(rules.status)) bad('status 必须是 draft 或 confirmed，实为 ' + JSON.stringify(rules.status))
if (!Array.isArray(rules.rules) || !rules.rules.length) bad('rules 为空')
for (const key of ['safetyRules', 'priority']) if (!Array.isArray(rules[key])) bad('缺数组字段：' + key)
if (typeof rules.dependsOn !== 'string' || !rules.dependsOn.includes('articulation-matrix.json')) {
  bad('dependsOn 必须写明依赖 articulation-matrix.json')
}

// 1b) 乐句切分（用户 2026-09-21 口径：按缺口切；无缺口不切、不做乐句级规则）
if (!rules.phraseSplit || typeof rules.phraseSplit !== 'object') bad('缺 phraseSplit（乐句怎么切）')
else {
  if (rules.phraseSplit.by !== 'gap') bad('phraseSplit.by 必须是 "gap"（本仓口径：按旋律缺口切）')
  if (typeof rules.phraseSplit.minGapBeats !== 'number' || rules.phraseSplit.minGapBeats <= 0) bad('phraseSplit.minGapBeats 必须是正数')
  if (!rules.phraseSplit.noGapMeans) bad('phraseSplit 必须写明 noGapMeans（无缺口怎么办）')
}

// 1c) 风格档（阈值按官方五个 performanceDirection 缩放）
const OFFICIAL_TIERS = ['Adagio', 'Allegro', 'con Fuoco', 'Pop', 'Ballade']
const SCALE_KEYS = ['minBeatsScale', 'leapSemitones', 'runCount', 'shortBeats']
const tiers = rules.styleTiers || {}
for (const t of OFFICIAL_TIERS) {
  if (!tiers[t]) { bad('styleTiers 缺官方风格档：' + t); continue }
  for (const k of SCALE_KEYS) {
    const v = tiers[t][k]
    if (typeof v !== 'number' || !(v > 0)) bad('styleTiers[' + t + '].' + k + ' 必须是正数，实为 ' + JSON.stringify(v))
  }
}
if (!tiers['(default)']) bad('styleTiers 缺 (default)（未指定风格时用它）')
const symbolsDefined = new Set()
for (const t of Object.keys(tiers)) {
  if (t.startsWith('_')) continue
  for (const k of Object.keys(tiers[t])) symbolsDefined.add(k)
}
for (const k of SCALE_KEYS) if (!symbolsDefined.has(k)) bad('风格档里没有定义缩放量：' + k)

const ids = new Set()
function checkKeySet(set, where) {
  if (!Array.isArray(set) || !set.length) { bad(where + '：set 必须是非空数组'); return }
  for (const k of set) if (!vocab.has(k)) bad(where + '：出现矩阵词表外的键「' + k + '」')
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const a = set[i]
      const b = set[j]
      if ((graph[a] || []).includes(b) || (graph[b] || []).includes(a)) {
        bad(where + '：同一条规则里同时给了互斥的两个键「' + a + '」与「' + b + '」（矩阵互斥图判定冲突）')
      }
    }
  }
  if (set.length > 1) info(where + '：一次给 ' + set.length + ' 个技法（安全规则 onePerNote 建议默认 1 个）')
}

for (const r of rules.rules || []) {
  if (!r || typeof r.id !== 'string' || !r.id) { bad('有规则缺 id'); continue }
  if (ids.has(r.id)) bad('规则 id 重复：' + r.id)
  ids.add(r.id)
  const where = 'rule[' + r.id + ']'
  for (const f of ['event', 'criterion', 'why']) if (!r[f]) bad(where + '：缺字段 ' + f)
  if (r.set !== undefined) checkKeySet(r.set, where)
  if (r.setAnyOf !== undefined) {
    if (!Array.isArray(r.setAnyOf) || !r.setAnyOf.length) bad(where + '：setAnyOf 必须是非空数组的数组')
    else r.setAnyOf.forEach((alt, i) => checkKeySet(alt, where + '.setAnyOf[' + i + ']'))
  }
  if (r.set === undefined && r.setAnyOf === undefined) bad(where + '：既没有 set 也没有 setAnyOf')
  if (r.fallback !== undefined && r.fallback !== null) checkKeySet(r.fallback, where + '.fallback')
  for (const f of (r.familyHint || [])) if (f !== 'all' && !families.has(f)) bad(where + '：familyHint 里的族名「' + f + '」不在矩阵里')
  const keys = [...(r.set || []), ...((r.setAnyOf || []).flat()), ...(r.fallback || [])]
  if (keys.length && !keys.some((k) => supportedAnywhere.has(k) || Object.keys(matrix.implicitKeys || {}).includes(k))) {
    info(where + '：这些键「' + keys.join(', ') + '」在所有乐器的支持集里都没出现 ⇒ 该规则永远不会命中')
  }
  // 判据里引用的风格缩放量必须真的定义在 styleTiers 里（避免写了 minBeatsScale 却没人定义）
  const critText = JSON.stringify(r.criterion || {})
  for (const sym of SCALE_KEYS) {
    if (critText.includes(sym) && !symbolsDefined.has(sym)) bad(where + '：判据引用了未定义的缩放量 ' + sym)
  }
}

// 段等级
for (const s of rules.segmentLevel || []) {
  const where = 'segmentLevel[' + (s && s.id ? s.id : '?') + ']'
  if (!s || !s.id) { bad('有 segmentLevel 条目缺 id'); continue }
  if (ids.has(s.id)) bad('id 重复（与规则同名）：' + s.id)
  ids.add(s.id)
  if (!Array.isArray(s.setAnyOf) || !s.setAnyOf.length) bad(where + '：setAnyOf 必须是非空数组的数组')
  else s.setAnyOf.forEach((alt, i) => checkKeySet(alt, where + '.setAnyOf[' + i + ']'))
  for (const f of (s.familyHint || [])) if (f !== 'all' && !families.has(f)) bad(where + '：familyHint 里的族名「' + f + '」不在矩阵里')
}

// 5) 优先级
const seenPrio = new Set()
for (const id of rules.priority || []) {
  if (!ids.has(id)) bad('priority 里的 id 不存在于规则/段等级：' + id)
  if (seenPrio.has(id)) bad('priority 重复：' + id)
  seenPrio.add(id)
}
for (const id of ids) if (!seenPrio.has(id)) info('规则「' + id + '」没有出现在 priority 里（若它不参与逐音竞争可忽略）')

// 6) 文档锚点
for (const id of ids) if (!md.includes(id)) bad('.md 里找不到 id「' + id + '」（文档与 JSON 脱节）')
for (const f of ['articulation-rules.json', 'articulation-matrix.json', 'apply-articulations.cjs']) {
  if (!md.includes(f)) bad('.md 里没有提到「' + f + '」')
}
for (const t of [...OFFICIAL_TIERS, '(default)']) if (!md.includes(t)) bad('.md 里没有风格档「' + t + '」')
if (!md.includes('缺口')) bad('.md 里没有写明"乐句按缺口切"（用户 2026-09-21 口径）')
for (const k of SCALE_KEYS) if (!md.includes(k)) bad('.md 里没有提到缩放量「' + k + '」')

// 7) 状态一致
const firstLine = md.split('\n').find((l) => l.trim().startsWith('#')) || ''
const mdSaysDraft = firstLine.includes('草案')
if (rules.status === 'draft' && !mdSaysDraft) bad('.json status=draft，但 .md 标题里没有「草案」标记')
if (rules.status === 'confirmed' && mdSaysDraft) bad('.json status=confirmed，但 .md 标题里还写着「草案」')

// 8) 文档承诺的选择器 vs **引擎真实现**（2026-09-21 补：曾出现 .md/.json 写 bars=5-12、而引擎只有 beats=/phrases=）
//    规矩：提到 `bars=` 就必须**同文写明未实现**；引擎里必须能找到 beats=/phrases= 这两条已实现的选择器。
const ENGINE = path.join(ROOT, 'server', 'src', 'articulations', 'engine.ts')
const TOOLS_TS = path.join(ROOT, 'server', 'src', 'tools.ts')
const rulesJsonText = fs.readFileSync(RULES_JSON, 'utf8')
const BARS = /bars\s*=/
if (BARS.test(md) && !md.includes('未实现') && !md.includes('尚未实现')) {
  bad('.md 里出现 `bars=`，但没写明「未实现/尚未实现」（v1 只实现 beats= / phrases= ⇒ 不能把它当已支持）')
}
if (BARS.test(rulesJsonText) && !rulesJsonText.includes('未实现') && !rulesJsonText.includes('尚未实现')) {
  bad('articulation-rules.json 里出现 `bars=`，但没有写明"未实现/尚未实现"')
}
if (!fs.existsSync(ENGINE)) {
  bad('缺规则引擎唯一实现 server/src/articulations/engine.ts（MCP 工具与 CLI 都依赖它）')
} else {
  const eng = fs.readFileSync(ENGINE, 'utf8')
  for (const sel of ['beats=', 'phrases=']) {
    if (!eng.includes(sel)) bad('引擎里找不到已实现的选择器 ' + sel + '（文档却写着支持它）')
  }
  if (BARS.test(eng)) info('引擎里也出现了 bars= —— 若真实现了 bars=，请同步更新 .md/.json 的"未实现"说法')
}
if (!fs.existsSync(TOOLS_TS) || !fs.readFileSync(TOOLS_TS, 'utf8').includes('sv_apply_articulations')) {
  bad('.md/.json 提到 MCP 工具 sv_apply_articulations，但 server/src/tools.ts 里没有注册它')
}
info('选择器：引擎实现 beats= / phrases=；bars= ' + (BARS.test(rulesJsonText) ? '文档提到且已标注未实现' : '未提及'))

info('规则 ' + (rules.rules || []).length + ' 条 + 段等级 ' + (rules.segmentLevel || []).length + ' 条 · 词表 ' + vocab.size +
  ' · status=' + rules.status + ' · 族名 ' + [...families].join('/'))

if (AS_JSON) console.log(JSON.stringify({ ok: problems.length === 0, problems, infos }, null, 2))
else {
  console.log('== 技法规则表守卫 ==')
  console.log('规则：' + path.relative(ROOT, RULES_JSON))
  console.log('文档：' + path.relative(ROOT, RULES_MD))
  for (const i of infos) console.log('  [i] ' + i)
  for (const p of problems) console.log('  [FAIL] ' + p)
  console.log(problems.length ? '\n❌ ' + problems.length + ' 处问题' : '\n✅ 通过')
}
process.exit(problems.length ? 1 : 0)
