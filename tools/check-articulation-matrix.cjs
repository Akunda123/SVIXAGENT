#!/usr/bin/env node
/**
 * **技法矩阵守卫**（2026-09-21 立）—— 盯住 `skills/sv-ix/references/articulation-matrix.json`
 *
 * 为什么要有它：那张表是**实测单一事实源**（IX 的支持集 + 互斥图），将来会被
 * ① 规则引擎（按旋律走向配技法）② 技能文档 ③ 我们的手工判断 三处引用。
 * 一旦它和"真实测量的东西"或"文档里写的"漂移，就会像 2026-09-20 那次一样**整轮验在旧结论上**。
 *
 * 离线检查（默认，秒级）：
 *   1) 结构：instruments / mutexGraph / knownKeys / implicitKeys 齐备且类型对
 *   2) 词表：每个 supported、每个 mutex 的键与目标，都必须落在 knownKeys ∪ implicitKeys 里
 *   3) 一致性：**implicitKeys 不许出现在任何 supported 里**（"隐式键"的定义就是不在支持集里）
 *   4) 对照轨：必须存在一条 supported 为空且名字含「未指定乐器」的条目（2026-09-21 的对照发现）
 *   5) 去重：乐器名不重复；tracksMeasured 不重复
 *   6) 互斥图自洽：无自冲突、无重复目标
 *   7) 文档锚点：每个乐器名都出现在 `skills/sv-ix/references/技法实测.md`；
 *      该文档必须提到 `articulation-matrix.json` 与 `setCurrentGroup`（方法事实）
 *
 * 真机漂移（可选）：`--live`
 *   跑 `tools/probe-ix-articulations.cjs --caps --json`，按 **tracksMeasured 的轨号**逐轨比对支持集；
 *   有任何差异 ⇒ exit 1（IX 升级后必跑；需要用同一份工程、且宿主在线）。
 *
 * 用法：node tools/check-articulation-matrix.cjs [--live] [--json]
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const JSON_PATH = path.join(ROOT, 'skills', 'sv-ix', 'references', 'articulation-matrix.json')
const DOC_PATH = path.join(ROOT, 'skills', 'sv-ix', 'references', '技法实测.md')
const LIVE = process.argv.includes('--live')
const AS_JSON = process.argv.includes('--json')

const problems = []
const infos = []
function bad(msg) { problems.push(msg) }
function info(msg) { infos.push(msg) }

let j
try {
  j = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
} catch (e) {
  console.error('[FAIL] 读/解析 ' + JSON_PATH + ' 失败：' + e.message)
  process.exit(2)
}
const doc = fs.readFileSync(DOC_PATH, 'utf8')

// 1) 结构
for (const k of ['schema', 'measuredAt', 'host', 'instruments', 'mutexGraph', 'knownKeys', 'implicitKeys', 'facts']) {
  if (j[k] === undefined) bad('顶层缺字段：' + k)
}
const instruments = Array.isArray(j.instruments) ? j.instruments : []
const known = new Set(j.knownKeys || [])
const implicit = new Set(Object.keys(j.implicitKeys || {}))
if (!instruments.length) bad('instruments 为空')
if (!known.size) bad('knownKeys 为空')

// 2/3/4/5) 逐乐器
const seenName = new Set()
const seenTrack = new Set()
let emptyControl = 0
for (const it of instruments) {
  if (!it || typeof it.name !== 'string' || !it.name) { bad('有乐器条目的 name 不合法'); continue }
  if (seenName.has(it.name)) bad('乐器名重复：' + it.name)
  seenName.add(it.name)
  if (!Array.isArray(it.supported)) { bad(it.name + '：supported 不是数组'); continue }
  for (const t of (it.tracksMeasured || [])) {
    if (seenTrack.has(t)) bad('tracksMeasured 重复：轨 ' + t)
    seenTrack.add(t)
  }
  for (const k of it.supported) {
    if (implicit.has(k)) bad(it.name + '：implicitKeys 里的「' + k + '」不该出现在 supported 里')
    else if (!known.has(k)) bad(it.name + '：supported 出现未登记的词「' + k + '」')
  }
  if (it.supported.length === 0) {
    emptyControl++
    if (!/未指定乐器|none|empty/i.test(it.name)) bad('有 supported 为空的条目，但名字不像「未指定乐器」对照轨：' + it.name)
  }
  if (!doc.includes(it.name)) bad('文档锚点：`技法实测.md` 里找不到乐器名「' + it.name + '」')
}
if (emptyControl === 0) bad('缺「未指定乐器 = 0 项」的对照条目（2026-09-21 的关键发现）')

// 6) 互斥图
for (const [k, arr] of Object.entries(j.mutexGraph || {})) {
  if (!known.has(k) && !implicit.has(k)) bad('mutexGraph 的键未登记：' + k)
  if (!Array.isArray(arr)) { bad('mutexGraph[' + k + '] 不是数组'); continue }
  const dup = new Set()
  for (const t of arr) {
    if (t === k) bad('mutexGraph[' + k + '] 自冲突')
    if (!known.has(t) && !implicit.has(t)) bad('mutexGraph[' + k + '] 指向未登记的词：' + t)
    if (dup.has(t)) bad('mutexGraph[' + k + '] 目标重复：' + t)
    dup.add(t)
  }
}
// 互斥图的键应覆盖"在任一乐器 supported 里出现过的词"
const usedWords = new Set()
for (const it of instruments) for (const k of (it.supported || [])) usedWords.add(k)
for (const k of usedWords) if (j.mutexGraph[k] === undefined) bad('词「' + k + '」在某乐器支持集里，但 mutexGraph 没有它的行')

// 7) 文档锚点
for (const anchor of ['articulation-matrix.json', 'setCurrentGroup']) {
  if (!doc.includes(anchor)) bad('文档锚点：`技法实测.md` 里找不到「' + anchor + '」')
}
info('乐器行 = ' + instruments.length + '（其中空支持集对照 = ' + emptyControl + '）· 词表 = ' + known.size +
  ' + 隐式 ' + implicit.size + ' · 互斥图 = ' + Object.keys(j.mutexGraph || {}).length + ' 行')

// 8) 真机漂移（可选）
let live = null
if (LIVE) {
  const probe = path.join(__dirname, 'probe-ix-articulations.cjs')
  const r = spawnSync(process.execPath, [probe, '--caps', '--json'], { encoding: 'utf8' })
  if (r.status !== 0) {
    bad('--live 取真机数据失败（桥离线？）：' + String(r.stderr || r.stdout).slice(0, 200))
  } else {
    let liveData
    try { liveData = JSON.parse(r.stdout) } catch (e) { bad('--live 输出不是 JSON：' + e.message) }
    if (liveData) {
      const byTrack = new Map((liveData.tracks || []).map((t) => [t.index, t.supported || []]))
      let compared = 0
      for (const it of instruments) {
        for (const t of (it.tracksMeasured || [])) {
          if (!byTrack.has(t)) { info('--live：轨 ' + t + ' 不在当前工程里（跳过）'); continue }
          compared++
          const now = byTrack.get(t).slice().sort().join('|')
          const want = (it.supported || []).slice().sort().join('|')
          if (now !== want) {
            bad('真机漂移：轨 ' + t + '（' + it.name + '）\n      matrix: ' + want + '\n      live  : ' + now)
          }
        }
      }
      info('--live 比对了 ' + compared + ' 条轨')
    }
  }
}

if (AS_JSON) console.log(JSON.stringify({ ok: problems.length === 0, problems, infos }, null, 2))
else {
  console.log('== 技法矩阵守卫 ==')
  console.log('数据：' + path.relative(ROOT, JSON_PATH))
  console.log('文档：' + path.relative(ROOT, DOC_PATH))
  for (const i of infos) console.log('  [i] ' + i)
  for (const p of problems) console.log('  [FAIL] ' + p)
  console.log(problems.length ? '\n❌ ' + problems.length + ' 处问题' : '\n✅ 通过' + (LIVE ? '（含真机漂移比对）' : '（离线结构 + 文档锚点）'))
}
process.exit(problems.length ? 1 : 0)
