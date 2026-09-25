#!/usr/bin/env node
/**
 * 一次性：把 ixp 的**音符结构**与**音符级 dynamics** 原文打出来（只读文件）。
 * 用法：node tools/_show-ixp-note.cjs [工程路径]
 */
const fs = require('fs')
const path = require('path')
const { DOCUMENTS } = require('./lib-paths.cjs')

const P = process.argv[2]
  || path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores/ixp测试.ixp')
const Q = 705600000
const raw = fs.readFileSync(P, 'utf8')
const o = JSON.parse(raw.replace(/[\u0000\s]+$/, ''))
const b = (x) => `${x}（${(x / Q).toFixed(4)} 拍）`

console.log('文件：' + P)
console.log('mtime：' + fs.statSync(P).mtime.toLocaleString())

// 收集所有音符
const notes = []
for (const g of o.library || []) for (const n of g.notes || []) notes.push({ group: g.name, n })

// 所有音符出现过的键
const keys = new Set()
for (const { n } of notes) for (const k of Object.keys(n)) keys.add(k)
console.log(`\n音符总数 ${notes.length} · 出现过的键（${keys.size}）：${[...keys].join(', ')}`)

// 找一个带 dynamics 的、和一个不带的
const withDyn = notes.find((x) => x.n.dynamics)
const withoutDyn = notes.find((x) => !x.n.dynamics)

if (withDyn) {
  const { group, n } = withDyn
  console.log(`\n${'='.repeat(70)}\n一、带 dynamics 的音符（组「${group}」）——完整原文\n${'='.repeat(70)}`)
  // dynamics 的 points 太长，先单独截断展示
  const shown = JSON.parse(JSON.stringify(n))
  if (shown.dynamics && shown.dynamics.points) {
    shown.dynamics.points = `[…共 ${n.dynamics.points.length} 个数 = ${n.dynamics.points.length / 2} 个点，见下]`
  }
  console.log(JSON.stringify(shown, null, 2))

  const pts = n.dynamics.points || []
  const xs = []
  const ys = []
  for (let i = 0; i + 1 < pts.length; i += 2) { xs.push(pts[i]); ys.push(pts[i + 1]) }
  console.log('\n-- dynamics 结构分析 --')
  console.log('mode        : ' + n.dynamics.mode)
  console.log('点数        : ' + xs.length + `（points 是**扁平交替数组**：x0,y0,x1,y1,…）`)
  console.log('x 范围      : ' + Math.min(...xs) + ' … ' + Math.max(...xs) + `（${(Math.min(...xs) / Q).toFixed(3)} ~ ${(Math.max(...xs) / Q).toFixed(3)} 拍）`)
  console.log('音符 duration: ' + b(n.duration))
  console.log('x 最大值 vs duration: ' + (Math.max(...xs) === n.duration ? '**正好等于 duration**（x 是音符内相对时间）' : Math.max(...xs) > n.duration ? '**超出 duration**' : '小于 duration'))
  console.log('y 范围      : ' + Math.min(...ys).toFixed(6) + ' … ' + Math.max(...ys).toFixed(6))
  console.log('attributes.dynamic = ' + n.attributes.dynamic + ' ⇒ y 是**相对该值的偏移**（首点 y=0 即落在它上面）')
  console.log('前 6 个点   : ' + pts.slice(0, 12).join(', '))
  console.log('后 6 个点   : ' + pts.slice(-12).join(', '))
}

if (withoutDyn) {
  const { group, n } = withoutDyn
  console.log(`\n${'='.repeat(70)}\n二、**没有** dynamics 的音符（组「${group}」）——对比键差异\n${'='.repeat(70)}`)
  console.log(JSON.stringify(n, null, 2))
  const missing = [...keys].filter((k) => !(k in n))
  console.log('\n该音符缺的键：' + (missing.join(', ') || '（无）'))
}

// 结构模板
console.log(`\n${'='.repeat(70)}\n三、ixp 音符结构模板（三端通用字段 + IX 独有）\n${'='.repeat(70)}`)
console.log(`{
  "uuid":     "<16 hex>",          // 音符 uuid（SV1 没有这个键）
  "onset":    <blick>,             // **组内局部时间**，可为负
  "duration": <blick>,
  "pitch":    <midi 0-127>,
  "detune":   0,
  "attributes": {                  // ← 见下"属性键"清单
    "muted": false,
    "dynamic": 0.380870401859283,  // 可选：力度 0~1
    "articulations": ["Accent"],   // 可选：技法
    "articulationsFixed": false,   // 可选：技法是否固定
    "dF0VbrMod": …, "cTimeDispersion": …, "cPitchDispersion": …, "fF0VbrMod": …   // 可选：音高类属性（IX 也有）
  },
  "takes": {                       // SV2/IX 的 take 记法（取代 SV1 的 pitchTakes/timbreTakes）
    "activeTakeId": 3,
    "takes": [ { "id": 0, "seedPitch": 0, "seedTimbre": 0, "liked": false }, … ]
  },
  "dynamics": {                    // ⭐ **IX 独有**：音符内部的力度包络；不画就没有这个键
    "mode": "cubic",
    "points": [x0,y0, x1,y1, …]    // 扁平交替；x = 音符内相对 blick，y = 相对 attributes.dynamic 的偏移
  }
}`)
