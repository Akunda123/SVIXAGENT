#!/usr/bin/env node
/**
 * 音符级 `dynamics`（力度包络）曲线的**校验器 + 文件路线写入器**（2026-09-21 落为常驻工具）。
 *
 * 来历：IX（Instrument X）**没有 API** 能写/读音符级力度曲线（见 tools/known-bugs.json 的 `IX-002`：
 * 10 种 setAttributes 写法全被静默忽略、getAttributes 里也读不到），**唯一通路 = 改 .ixp 再重载**。
 *
 * 早在 2026-09-14 就摸清了磁盘结构（`knowledge/docs/InstrumentX-API枚举.md` §6.2.2）：
 *   音符顶层键 `dynamics` = `{ "mode": "linear"|"cubic", "points": [x0,y0, x1,y1, …] }`
 *   · `x` = **音符内相对 blick**（0 … note.duration）
 *   · `y` = **相对 `attributes.dynamic` 的偏移** —— 2026-09-21 在 **405 个音符**（ixptest / gemee /
 *     ixp测试 / dyn测试 / 本仓工程）上全量核对得出：**`y ∈ [−dynamic, 1−dynamic]`**，
 *     也就是「绝对力度 = `dynamic + y` ∈ [0,1]」；两端都有精确命中样本。
 *
 * 两个子命令（**写入默认 dry-run**）：
 *   node tools/ixp-dynamics.cjs <file.ixp> [<file2.ixp> …]     # 只校验（y 规则 / x 范围 / mode / 点数）
 *   node tools/ixp-dynamics.cjs --write --file <ixp> --pitch 60 \
 *        --base 0.5 --points "0:0.15, 0.5:0.5, 1:0.9" [--mode cubic] [--apply]
 *     · `--points` 里 t 是**音符内目标时值比例**（0~1），值是**绝对力度**（0~1）
 *     · `--mode` 默认 **`linear`** —— **实测（2026-09-21）：宿主载入时会把 `cubic` 归一成 `linear`**，
 *       保存写出的也是 linear ⇒ **写 cubic 等于白写**（旁证：真实工程 `gemee.ixp` 392 条 = linear 388 / cubic 4，
 *       那 4 条是"画完就存、没重载"的）。仍可显式给 `--mode cubic`（写进文件是 cubic，但宿主一载入就按 linear 处理）
 *     · 不给 `--apply` 只打印"会写什么"；给了就：**先 .bak** → **外科式插入**（只动目标音符那段文本，
 *       不整文件 JSON 往返 —— 实测整文件重排会把风格改掉）→ 回读校验
 *
 * ⚠️ 改文件前先让用户保存、改完让用户**重载**（重载前别再保存，否则宿主的旧内存会覆盖）。
 * ⚠️ 别拿这个工具去改"用户正在编辑、还没保存"的工程。
 */
const fs = require('node:fs')
const path = require('node:path')

const MODES = ['linear', 'cubic']
const EPS = 1e-3            // y 边界容差（float32 存储会有一点点舍入）
const X_TOL = 2             // x 超出音符时长多少 blick 之内算合法（防舍入）

/** 读 .ixp：剥掉尾部空白/NUL（SV 家族有尾 NUL 的历史），返回 { raw, json } */
function readIxp(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const text = raw.replace(/[\u0000\s]+$/, '')
  return { raw, text, json: JSON.parse(text) }
}

/** 遍历所有音符组里的音符：yields { group, note } */
function eachNote(json, fn) {
  for (const g of json.library || []) {
    for (const n of g.notes || []) fn(g, n)
  }
}

/**
 * 校验一个音符的 dynamics 曲线。
 * @returns {string[]} 问题列表（空 = 合法）
 */
function validateNote(note, where) {
  const problems = []
  const cur = note.dynamics
  if (cur === undefined) return problems
  const tag = where + ' pitch=' + note.pitch
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return [tag + '：dynamics 不是对象']
  if (!MODES.includes(cur.mode)) problems.push(tag + '：mode 必须是 linear|cubic，实为 ' + JSON.stringify(cur.mode))
  const pts = cur.points
  if (!Array.isArray(pts)) return problems.concat(tag + '：points 不是数组')
  if (pts.length % 2 !== 0) problems.push(tag + '：points 长度为奇数（' + pts.length + '），应为 [x,y,…] 成对')
  const d = note.attributes && typeof note.attributes.dynamic === 'number' ? note.attributes.dynamic : null
  if (d === null) problems.push(tag + '：有曲线但 attributes.dynamic 不是数字（y 无从解释）')
  const dur = typeof note.duration === 'number' ? note.duration : null
  let prevX = -Infinity
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i]
    const y = pts[i + 1]
    if (typeof x !== 'number' || typeof y !== 'number') { problems.push(tag + '：第 ' + (i / 2 + 1) + ' 个点不是数字'); continue }
    if (x < -X_TOL || (dur !== null && x > dur + X_TOL)) problems.push(tag + '：第 ' + (i / 2 + 1) + ' 个点 x=' + x + ' 超出 [0, duration=' + dur + ']')
    if (x < prevX) problems.push(tag + '：第 ' + (i / 2 + 1) + ' 个点 x=' + x + ' 小于前一个 x=' + prevX + '（应递增）')
    prevX = x
    if (d !== null && (y < -d - EPS || y > 1 - d + EPS)) {
      problems.push(tag + '：第 ' + (i / 2 + 1) + ' 个点 y=' + y + ' 越界，应落在 [−dynamic, 1−dynamic] = [' +
        (-d).toFixed(6) + ', ' + (1 - d).toFixed(6) + ']')
    }
  }
  return problems
}

/** 校验整个文件：返回 { file, curves, problems } */
function validateFile(file) {
  const { json } = readIxp(file)
  const problems = []
  const curves = []
  eachNote(json, (g, n) => {
    if (n.dynamics === undefined) return
    const where = 'group="' + g.name + '"'
    problems.push(...validateNote(n, where))
    const pts = (n.dynamics.points || [])
    const ys = []
    for (let i = 1; i < pts.length; i += 2) ys.push(pts[i])
    const d = n.attributes ? n.attributes.dynamic : null
    curves.push({
      group: g.name, pitch: n.pitch, mode: n.dynamics.mode, points: pts.length / 2,
      dynamic: d, yMin: ys.length ? Math.min(...ys) : null, yMax: ys.length ? Math.max(...ys) : null,
    })
  })
  return { file, curves, problems }
}

/** 定位某个音符对象在原文里的 [start, end]（含花括号），靠 uuid 值定位再配平花括号 */
function noteObjectBounds(text, uuid) {
  if (uuid) {
    const at = text.indexOf('"' + uuid + '"')
    if (at < 0) return null
    let start = text.lastIndexOf('{', at)
    if (start < 0) return null
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) return { start, end: i + 1 } }
    }
    return null
  }
  return null
}

/** 在音符对象文本里找 `"dynamics"` 的**值**范围（用于替换）*/
function dynamicsValueBounds(objText) {
  const m = /"dynamics"\s*:\s*/.exec(objText)
  if (!m) return null
  const vs = m.index + m[0].length
  const ch = objText[vs]
  if (ch === '{' || ch === '[') {
    const open = ch
    const close = ch === '{' ? '}' : ']'
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = vs; i < objText.length; i++) {
      const c = objText[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === open) depth++
      else if (c === close) { depth--; if (depth === 0) return { start: vs, end: i + 1 } }
    }
    return null
  }
  // 标量：扫到深度 0 的 , 或 }
  let i = vs
  while (i < objText.length && objText[i] !== ',' && objText[i] !== '}') i++
  return { start: vs, end: i }
}

function serializeDynamics(mode, points) {
  return '{"mode": "' + mode + '", "points": [' + points.join(', ') + ']}'
}

/**
 * 在**音符对象文本**里把 `attributes.dynamic`（标量基准）设成 `valueText`（没有就插入）。
 * 为什么必须一起写：y 是「相对 attributes.dynamic 的偏移」⇒ 只改 y 不改标量，含义就变了。
 */
function setAttributesDynamic(objText, valueText) {
  const m = /"attributes"\s*:\s*\{/.exec(objText)
  if (!m) return objText
  const braceStart = m.index + m[0].length - 1
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = braceStart; i < objText.length; i++) {
    const c = objText[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (end < 0) return objText
  const inner = objText.slice(braceStart + 1, end - 1)
  const dm = /"dynamic"\s*:\s*/.exec(inner)
  let newInner
  if (dm) {
    const vs = dm.index + dm[0].length
    let i = vs
    while (i < inner.length && inner[i] !== ',' && inner[i] !== '}') i++
    newInner = inner.slice(0, vs) + valueText + inner.slice(i)
  } else {
    newInner = inner + (inner.trim() ? ', ' : '') + '"dynamic": ' + valueText
  }
  return objText.slice(0, braceStart + 1) + newInner + objText.slice(end - 1)
}

/** 把 (t 比例, 绝对力度) 换算成 points：x = round(t*duration)，y = 绝对 − base */
function buildPoints(duration, base, spec) {
  const items = String(spec).split(',').map((s) => s.trim()).filter(Boolean)
  if (items.length < 2) throw new Error('--points 至少给两个点，形如 "0:0.2, 1:0.9"')
  const xs = []
  const ys = []
  for (const it of items) {
    const [ts, vs] = it.split(':')
    const t = Number(ts)
    const v = Number(vs)
    if (!Number.isFinite(t) || !Number.isFinite(v)) throw new Error('点格式错：' + it + '（应为 t:绝对值）')
    if (t < 0 || t > 1) throw new Error('t 必须落在 0~1（音符内比例）：' + it)
    if (v < 0 || v > 1) throw new Error('绝对力度必须落在 0~1：' + it)
    xs.push(Math.round(t * duration))
    ys.push(Number((v - base).toFixed(6)))
  }
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[j] < xs[i]) throw new Error('x 必须递增（t 从小到大）')
    }
  }
  return { xs, ys, points: xs.flatMap((x, i) => [x, ys[i]]) }
}

function main() {
  const argv = process.argv.slice(2)
  const FLAG = (n) => argv.includes(n)
  const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
  const AS_JSON = FLAG('--json')

  if (FLAG('--write')) {
    const file = OPT('--file')
    if (!file) { console.error('用法：--write --file <ixp> --pitch <n> [--base 0..1] --points "t:abs,…" [--mode cubic|linear] [--apply]'); process.exit(2) }
    const { text, json } = readIxp(file)
    const wantPitch = OPT('--pitch') === null ? null : Number(OPT('--pitch'))
    const uuid = OPT('--uuid')
    const groupName = OPT('--group')
    let target = null
    eachNote(json, (g, n) => {
      if (target) return
      if (groupName && g.name !== groupName) return
      if (uuid ? n.uuid === uuid : (wantPitch !== null && n.pitch === wantPitch)) target = { g, n }
    })
    if (!target) { console.error('[FAIL] 没找到目标音符（--uuid / --group+--pitch）'); process.exit(1) }
    const note = target.n
    const base = OPT('--base') === null ? (note.attributes && typeof note.attributes.dynamic === 'number' ? note.attributes.dynamic : 0.5) : Number(OPT('--base'))
    if (!(base >= 0 && base <= 1)) { console.error('[FAIL] --base 必须落在 0~1'); process.exit(2) }
    const mode = OPT('--mode') || 'linear'
    if (!MODES.includes(mode)) { console.error('[FAIL] --mode 只能是 ' + MODES.join('|')); process.exit(2) }
    const spec = OPT('--points')
    if (!spec) { console.error('[FAIL] 缺 --points "0:0.15, 0.5:0.5, 1:0.9"'); process.exit(2) }
    let built
    try { built = buildPoints(note.duration, base, spec) } catch (e) { console.error('[FAIL] ' + e.message); process.exit(2) }
    const { points } = built
    for (const y of points.filter((_, i) => i % 2 === 1)) {
      if (y < -base - EPS || y > 1 - base + EPS) { console.error('[FAIL] 换算出的 y=' + y + ' 越界（y 必须在 [−base, 1−base]）'); process.exit(1) }
    }
    const value = serializeDynamics(mode, points)
    const bounds = noteObjectBounds(text, note.uuid)
    if (!bounds) { console.error('[FAIL] 定位不到音符对象（缺 uuid？）—— 本工具只做外科式插入，不做整文件重排'); process.exit(1) }
    const objText = text.slice(bounds.start, bounds.end)
    const vb = dynamicsValueBounds(objText)
    let newObj = vb ? (objText.slice(0, vb.start) + value + objText.slice(vb.end)) : (objText.slice(0, -1) + ', "dynamics": ' + value + '}')
    newObj = setAttributesDynamic(newObj, String(base))
    const out = text.slice(0, bounds.start) + newObj + text.slice(bounds.end)

    if (!AS_JSON) {
      console.log('file      : ' + file)
      console.log('target    : group="' + target.g.name + '" pitch=' + note.pitch + ' uuid=' + note.uuid)
      console.log('base      : ' + base + '（**同时写进 attributes.dynamic**）   mode=' + mode + '   duration=' + note.duration)
      console.log('points    : ' + JSON.stringify(points))
      console.log('绝对力度  : ' + points.filter((_, i) => i % 2 === 1).map((y) => (base + y).toFixed(4)).join(' -> '))
      console.log('改法      : ' + (vb ? '替换已存在的 dynamics 值' : '在音符对象末尾插入 dynamics 键') + ' + 改 attributes.dynamic，只动这一段文本；长度 ' + text.length + ' -> ' + out.length)
    }
    if (!FLAG('--apply')) {
      if (AS_JSON) console.log(JSON.stringify({ file, dryRun: true, pitch: note.pitch, base, mode, points }))
      else console.log('\n（dry-run：加 --apply 才真写；写前自动 .bak）')
      process.exit(0)
    }
    const bak = file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
    fs.copyFileSync(file, bak)
    fs.writeFileSync(file, out, 'utf8')
    const back = validateFile(file)
    if (!AS_JSON) console.log('已写      : ' + file + '（备份 ' + path.basename(bak) + '）')
    if (back.problems.length) {
      if (!AS_JSON) { console.log('[FAIL] 写后自检不通过：'); back.problems.forEach((p) => console.log('  - ' + p)) }
      else console.log(JSON.stringify({ file, applied: true, bak, problems: back.problems }))
      process.exit(1)
    }
    if (!AS_JSON) console.log('写后自检  : ✅ 通过（' + back.curves.length + ' 条曲线）')
    else console.log(JSON.stringify({ file, applied: true, bak, curves: back.curves }))
    process.exit(0)
  }

  const files = argv.filter((a) => !a.startsWith('--'))
  if (!files.length) {
    console.error('用法：node tools/ixp-dynamics.cjs <file.ixp> [<file2.ixp> …]  # 校验')
    console.error('      node tools/ixp-dynamics.cjs --write --file … （见文件头注释）')
    process.exit(2)
  }
  let bad = 0
  let totalCurves = 0
  const report = []
  for (const f of files) {
    let r
    try { r = validateFile(f) } catch (e) { console.error('[FAIL] ' + f + ' 解析失败：' + e.message); bad++; continue }
    totalCurves += r.curves.length
    report.push(r)
    if (!AS_JSON) {
      console.log('== ' + path.basename(f) + '  curves=' + r.curves.length + (r.problems.length ? '  PROBLEMS=' + r.problems.length : '  ✅'))
      for (const c of r.curves) {
        console.log('   group="' + c.group + '" pitch=' + c.pitch + ' mode=' + c.mode + ' pts=' + c.points +
          ' dynamic=' + c.dynamic + ' y=[' + c.yMin + ', ' + c.yMax + ']')
      }
      r.problems.forEach((p) => console.log('   [FAIL] ' + p))
    }
    if (r.problems.length) bad++
  }
  if (AS_JSON) console.log(JSON.stringify({ files: report, totalCurves, bad }))
  else console.log('\n文件 ' + files.length + ' 个 · 曲线 ' + totalCurves + ' 条 · 有问题的文件 ' + bad)
  process.exit(bad ? 1 : 0)
}

if (require.main === module) main()
module.exports = {
  readIxp, eachNote, validateNote, validateFile, buildPoints, serializeDynamics,
  noteObjectBounds, dynamicsValueBounds, setAttributesDynamic, MODES,
}
