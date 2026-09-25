#!/usr/bin/env node
/**
 * 「11 风格配方 §A 三件套参数表」守卫（离线，不需要 SV 在线）
 *   ① 覆盖：§A.2 主表必须覆盖 §1.1–1.7 / §2.1–2.7 / §3.1–3.3 / §4 每个风格小节（呼麦=不适用也要有行）
 *   ② 范围：§A.2 里每个数都落在 `08 §2.1` 的 UI 滑杆范围内（**范围以 08 为唯一权威**，本脚本解析它，不另抄一份）
 *   ③ 一致：§A.1 的「范围」列与 08 一致；§A.1 的「现行默认」列与 `sv/lua/AKDAgentBridge.lua` 的 `PIT.DEFAULTS` 逐字一致
 *   ④ 表头：§A.2 标题自报的行数必须与表里实际行数一致
 * 用法：node tools/check-style-pit-table.cjs [被检文档.md]
 *   （可选参数只为**负向自测**：拿一份改坏的副本跑，确认守卫真的会报错）
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const DOC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'skills', 'sv-scripting', 'references', '11-风格配方.md')
const PIT08 = path.join(ROOT, 'skills', 'sv-scripting', 'references', '08-pit-drawing.md')
const LUA = path.join(ROOT, 'sv', 'lua', 'AKDAgentBridge.lua')

const EXPECTED = [
  '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7',
  '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7',
  '3.1', '3.2', '3.3', '4',
]
// 小节里**故意不**给 Pit 三件套的：2.8 民族通用注意 · 3.4 声库与 EQ
const ALLOW_NO_ROW = ['2.8', '3.4']

const FIELDS = {
  音头: ['tF0Left', 'dF0Left', 'tF0Offset'],
  音尾: ['tF0Right', 'dF0Right'],
  颤音: ['tF0VbrStart', 'tF0VbrLeft/tF0VbrRight', 'dF0Vbr', 'fF0Vbr', '中心偏移'],
}

const nums = (s) => (s.match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number)
/** 先剥括号（括号里常有 `；`，先切分会被切坏），再做其它归一 */
const stripParen = (s) => s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
const norm = (s) => s.replace(/−/g, '-').replace(/~/g, '~').trim()

// ── ① 权威范围：从 08 §2.1「参数取值范围」的表里解析（**必须限定在该节内**，
//      否则会读到 §2.1b/§2.1c 的"实测档位"表，那是作品里出现过的值、不是范围）────────
const t08 = fs.readFileSync(PIT08, 'utf8')
const l08 = t08.split('\n')
const s = l08.findIndex((l) => /^### 2\.1 参数取值范围/.test(l))
if (s < 0) throw new Error('在 08 里找不到 §2.1 参数取值范围')
let e = l08.findIndex((l, i) => i > s && /^### /.test(l))
if (e < 0) e = l08.length
const RANGE = {}
for (const line of l08.slice(s, e)) {
  if (!/^\|\s*`/.test(line)) continue
  const cells = line.split('|').map((c) => c.trim())
  const names = [...cells[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
  const m = /(-?[\d.]+)\s*~\s*(-?[\d.]+)/.exec(cells[2].replace(/−/g, '-'))
  if (!names.length || !m) continue
  for (const n of names) if (!(n in RANGE)) RANGE[n] = [Number(m[1]), Number(m[2])]   // 首个（= §2.1 表本体）为准
}
const RANGE_FOR = (field) => {
  if (field === 'tF0VbrLeft/tF0VbrRight') return RANGE.tF0VbrLeft || RANGE.tF0VbrRight
  if (field === '中心偏移') return RANGE.pF0Vbr          // 中心偏移是"整段上下移"，量级同 pF0Vbr 的 UI 归一化
  return RANGE[field]
}

const fails = []
const warns = []
let checked = 0

// ── ② §A.2 主表：覆盖 + 取值 ─────────────────────────────────────────
const doc = fs.readFileSync(DOC, 'utf8')
const docLines = doc.split('\n')
const rows = new Map()
let tableRows = 0
let inTable = false
for (const line of docLines) {
  if (/^\|\s*风格（节）/.test(line)) { inTable = true; continue }
  if (!inTable) continue
  if (!line.startsWith('|')) break
  if (/^\|\s*-{3}/.test(line)) continue
  const cells = line.split('|').slice(1, -1).map((c) => c.trim())
  if (cells.length < 4) continue
  tableRows++
  const key = /^\*\*\s*(\d(?:\.\d)?)/.exec(cells[0])
  if (!key) continue
  rows.set(key[1], cells)
}

for (const k of EXPECTED) if (!rows.has(k)) fails.push(`§A.2 缺风格 ${k} 的行`)
for (const k of rows.keys()) if (!EXPECTED.includes(k)) fails.push(`§A.2 多出未登记的风格 ${k}（新风格要同步 EXPECTED）`)

// ── ④ 表头**自称的行数**必须与表里实际行数一致 ───────────────────────────
// 2026-09-21 加：表头曾写「26 行」而表里只有 18 行，且**没有任何检查盯着**（改表忘改表头就长期对不上）。
const claim = /^### A\.2[^\n]*?（\s*(\d+)\s*行/m.exec(doc)
if (!claim) fails.push('§A.2 标题里没有「（N 行 · …）」自报行数 —— 表头要自报行数，这条检查才盯得住')
else if (Number(claim[1]) !== tableRows) fails.push(`§A.2 标题自称 ${claim[1]} 行，表里实际 ${tableRows} 行（改表必须同步改表头）`)
if (tableRows !== rows.size) warns.push(`§A.2 有 ${tableRows} 行、认出 ${rows.size} 个风格行 —— 首列不是「**N.N 名字」的行请人工看一眼`)

// 文档里的小节标题（防止新增小节却忘了补表）
for (const m of doc.matchAll(/^### (\d\.\d+)\s/gm)) {
  const k = m[1]
  if (!EXPECTED.includes(k) && !ALLOW_NO_ROW.includes(k)) fails.push(`文档有 ### ${k}，但 §A.2 没有它的行、也没登记进 ALLOW_NO_ROW`)
}

const cellChecks = [
  ['① 音头', '音头'], ['② 音尾', '音尾'], ['③ 颤音', '颤音'],
]
for (const [k, cells] of rows) {
  if (k === '2.7') continue                        // 呼麦：整行「不适用」
  cellChecks.forEach(([label, group], ci) => {
    const fields = FIELDS[group]
    const raw = cells[ci + 1] || ''
    if (/见\s*\d|同\s*\d|不适用|不用|不做/.test(raw)) return   // 指针行 / 明示"这一项不做"
    // 一个单元格里可能先用一句话交代"基本不加"，后面才给 5 段值 ⇒ 取**能凑满字段数**的那一段
    const parts = stripParen(raw).split(/；|;/).map(norm)
    let segs = []
    for (const p of parts) {
      const ss = p.split('·').map((x) => x.trim()).filter(Boolean)
      if (ss.length === fields.length) { segs = ss; break }
      if (ss.length > segs.length) segs = ss
    }
    if (segs.length !== fields.length) {
      fails.push(`${k} ${label}：段数 ${segs.length} ≠ 字段数 ${fields.length} —— 「${raw.slice(0, 60)}」`)
      return
    }
    segs.forEach((seg, si) => {
      const field = fields[si]
      const rg = RANGE_FOR(field)
      const vs = nums(seg)
      if (!vs.length) { warns.push(`${k} ${label}/${field}：该段没写数（「${seg.slice(0, 24)}」）`); return }
      for (const v of vs) {
        checked++
        if (!rg) { warns.push(`${k} ${field}：08 里查不到范围，跳过（${v}）`); continue }
        if (v < rg[0] || v > rg[1]) fails.push(`${k} ${label}/${field} = ${v} 越界（08 范围 ${rg[0]} ~ ${rg[1]}）`)
      }
    })
  })
}

// ── ③ §A.1：范围列 + 现行默认列 ──────────────────────────────────────
const a1 = new Map()
let inA1 = false
for (const line of docLines) {
  if (/^### A\.1/.test(line)) { inA1 = true; continue }
  if (inA1 && /^### A\.2/.test(line)) break
  if (!inA1 || !line.startsWith('|')) continue
  const cells = line.split('|').slice(1, -1).map((c) => c.trim())
  if (cells.length < 5) continue
  for (const f of [...cells[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])) a1.set(f, { range: cells[3], def: cells[4] })
}
for (const [f, { range, def }] of a1) {
  const rg = RANGE_FOR(f)
  if (f === 'pF0Vbr') continue                     // 弧度（−π~π）与 08 的 UI 归一化（−1~1）口径不同，按说明跳过
  const vs = nums(range.replace(/−/g, '-'))
  if (rg && vs.length >= 2 && (vs[0] !== rg[0] || vs[1] !== rg[1])) {
    fails.push(`§A.1 ${f} 范围「${range}」与 08（${rg[0]} ~ ${rg[1]}）不一致`)
  }
  if (!def) fails.push(`§A.1 ${f} 没写现行默认`)
}

// 现行默认 vs Lua PIT.DEFAULTS
const lua = fs.readFileSync(LUA, 'utf8')
const blk = /PIT\.DEFAULTS\s*=\s*\{([\s\S]*?)\}/.exec(lua)
if (!blk) fails.push('在 AKDAgentBridge.lua 里找不到 PIT.DEFAULTS')
else {
  const luaDef = {}
  for (const m of blk[1].matchAll(/(\w+)\s*=\s*(-?[\d.]+)/g)) luaDef[m[1]] = Number(m[2])
  const a1Def = {}
  for (const [f, { def }] of a1) {
    const vs = nums(def.replace(/−/g, '-'))
    const names = f.split(/\s*\/\s*/)
    names.forEach((n, i) => { if (vs[i] !== undefined) a1Def[n] = vs[i] })
  }
  for (const k of Object.keys(luaDef)) {
    if (!(k in a1Def)) { fails.push(`§A.1 缺 ${k} 的现行默认（Lua 里是 ${luaDef[k]}）`); continue }
    if (a1Def[k] !== luaDef[k]) fails.push(`§A.1 ${k} 默认写成 ${a1Def[k]}，Lua PIT.DEFAULTS 是 ${luaDef[k]}`)
  }
}

// ── 输出 ────────────────────────────────────────────────────────────
console.log(`权威范围（解析自 08 §2.1）：${Object.keys(RANGE).length} 个字段`)
console.log(`§A.2 主表：${rows.size} 行 · 已校验数值 ${checked} 个`)
warns.forEach((w) => console.log(`  [i]  ${w}`))
fails.forEach((f) => console.log(`  [FAIL] ${f}`))
console.log(
  fails.length
    ? `\n❌ ${fails.length} 处不合格`
    : `\n✅ 全通过：覆盖 ${rows.size}/${EXPECTED.length} 个风格 · ${checked} 个数全部在 08 范围内 · §A.1 范围与默认值与 08 / PIT.DEFAULTS 一致`,
)
process.exit(fails.length ? 1 : 0)
