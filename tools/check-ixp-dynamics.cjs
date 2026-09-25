#!/usr/bin/env node
/**
 * `ixp-dynamics.cjs` 的守卫（2026-09-21）—— 自带**正负向自测**，不依赖真工程、不碰宿主。
 *
 * 判据来自 405 个真实音符的实测（见 tools/known-bugs.json 的 `IX-002`）：
 *   音符级 `dynamics` = `{mode: "linear"|"cubic", points: [x,y,…]}`，
 *   `x ∈ [0, note.duration]` 递增、`y ∈ [−attributes.dynamic, 1−attributes.dynamic]`。
 *
 * 做法：在 %TEMP% 造一批合成 .ixp（合法 3 例 + 违规 6 例），逐个跑校验器、断言 exit code；
 * 再跑一次 `--write --apply` 往返（写 → 回读 → 校验 → 确认只动了目标音符那段文本）。
 * 还可追加真实文件：`node tools/check-ixp-dynamics.cjs <file.ixp> …`（自测之后一并校验）
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const VALIDATOR = path.join(__dirname, 'ixp-dynamics.cjs')
const TMP = path.join(os.tmpdir(), 'ixp-dyn-selftest')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

const DUR = 705600000
const baseIxp = (noteExtra) => ({
  version: 201,
  time: { meter: [{ index: 0, numerator: 4, denominator: 4 }], tempo: [{ position: 0, bpm: 120 }] },
  library: [{
    name: 'selftest', uuid: 'g-1',
    notes: [Object.assign({ uuid: 'n-1', onset: 0, duration: DUR, pitch: 60, detune: 0, attributes: { dynamic: 0.5 }, takes: [] }, noteExtra || {})],
  }],
  tracks: [{ name: 'T', dispColor: 'ff489ce5', groups: [{ groupID: 'g-1' }] }],
})

let failed = 0
let n = 0
function check(name, cond, detail) {
  n++
  if (cond) { console.log('  [ok]   ' + name); return }
  failed++
  console.log('  [FAIL] ' + name + (detail ? '\n         ' + detail : ''))
}

function writeFixture(file, obj) {
  const p = path.join(TMP, file)
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8')
  return p
}

function run(args) {
  return spawnSync(process.execPath, [VALIDATOR, ...args], { encoding: 'utf8' })
}

console.log('== 正/负向自测（合成 .ixp）==')
const cases = [
  { name: '无曲线（合法）', obj: baseIxp(), expect: 0, keyword: null },
  { name: 'linear 合法（两端贴边）', obj: baseIxp({ dynamics: { mode: 'linear', points: [0, -0.5, DUR / 2, 0, DUR, 0.5] } }), expect: 0, keyword: null },
  { name: 'cubic 合法（不贴边）', obj: baseIxp({ dynamics: { mode: 'cubic', points: [0, -0.1, DUR, 0.2] } }), expect: 0, keyword: null },
  { name: 'y 过大（> 1−dynamic）', obj: baseIxp({ dynamics: { mode: 'linear', points: [0, 0, DUR, 0.6] } }), expect: 1, keyword: '越界' },
  { name: 'y 过小（< −dynamic）', obj: baseIxp({ dynamics: { mode: 'linear', points: [0, -0.6, DUR, 0] } }), expect: 1, keyword: '越界' },
  { name: 'x 超出音符时长', obj: baseIxp({ dynamics: { mode: 'linear', points: [0, 0, DUR + 5000, 0.1] } }), expect: 1, keyword: '超出' },
  { name: 'x 不递增', obj: baseIxp({ dynamics: { mode: 'linear', points: [0, 0, DUR, 0.1, DUR / 2, 0.2] } }), expect: 1, keyword: '递增' },
  { name: '点数成单', obj: baseIxp({ dynamics: { mode: 'linear', points: [0, 0, DUR] } }), expect: 1, keyword: '奇数' },
  { name: 'mode 非法', obj: baseIxp({ dynamics: { mode: 'spline', points: [0, 0, DUR, 0.1] } }), expect: 1, keyword: 'mode' },
]
for (const c of cases) {
  const p = writeFixture(c.name.replace(/[（(].*?[)）]/g, '').trim().replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, '_') + '.ixp', c.obj)
  const r = run(['--json', p])
  const parsed = (() => { try { return JSON.parse(r.stdout || '{}') } catch { return null } })()
  const problems = parsed && parsed.files && parsed.files[0] ? parsed.files[0].problems : []
  if (c.expect === 0) check(c.name + ' → exit 0', r.status === 0, 'exit=' + r.status + ' stdout=' + String(r.stdout).slice(0, 200))
  else {
    check(c.name + ' → exit 1', r.status === 1, 'exit=' + r.status)
    check(c.name + ' → 报出原因含「' + c.keyword + '」', problems.some((x) => x.includes(c.keyword)), JSON.stringify(problems))
  }
}

console.log('\n== 写入往返（外科式插入）==')
const target = writeFixture('write_target.ixp', baseIxp({ scriptData: { keep: 'me' } }))
const before = fs.readFileSync(target, 'utf8')
const w = run(['--write', '--file', target, '--pitch', '60', '--base', '0.5', '--points', '0:0.2, 1:0.9', '--mode', 'linear', '--apply'])
check('--write --apply 退出 0', w.status === 0, 'exit=' + w.status + ' out=' + String(w.stdout).slice(0, 300))
const after = JSON.parse(fs.readFileSync(target, 'utf8'))
const noteAfter = after.library[0].notes[0]
check('回读有 dynamics', !!noteAfter.dynamics, JSON.stringify(noteAfter.dynamics))
check('mode=linear', noteAfter.dynamics && noteAfter.dynamics.mode === 'linear')
check('points = [0,-0.3, DUR,0.4]（绝对 0.2 → 0.9，base 0.5）',
  noteAfter.dynamics && JSON.stringify(noteAfter.dynamics.points) === JSON.stringify([0, -0.3, DUR, 0.4]),
  JSON.stringify(noteAfter.dynamics && noteAfter.dynamics.points))
check('未动目标音符以外的内容（version/tracks/scriptData 保持不变）',
  after.version === 201 && after.tracks.length === 1 && noteAfter.scriptData && noteAfter.scriptData.keep === 'me')
check('生成 .bak', fs.readdirSync(TMP).some((f) => f.startsWith('write_target.ixp.bak-')))
check('单行风格仍是单行（外科式插入没有整文件重排）', !fs.readFileSync(target, 'utf8').includes('\n  "version"'), '文件被重排了')
check('dry-run 不写盘', (() => {
  const p = writeFixture('dry.ixp', baseIxp())
  const b4 = fs.readFileSync(p, 'utf8')
  const r = run(['--write', '--file', p, '--pitch', '60', '--points', '0:0.3, 1:0.7'])
  return r.status === 0 && fs.readFileSync(p, 'utf8') === b4
})())
check('绝对力度越界（1.2）被拒 → exit 2', (() => {
  const p = writeFixture('reject_abs.ixp', baseIxp())
  const r = run(['--write', '--file', p, '--pitch', '60', '--points', '0:1.2, 1:0.5', '--apply'])
  return r.status === 2 && String(r.stderr).includes('0~1')
})())
check('--base 越界（1.5）被拒 → exit 2', (() => {
  const p = writeFixture('reject_base.ixp', baseIxp())
  const r = run(['--write', '--file', p, '--pitch', '60', '--base', '1.5', '--points', '0:0.5, 1:0.9', '--apply'])
  return r.status === 2
})())
check('base ≠ 音符原 dynamic 时，attributes.dynamic 被一起写成 base', (() => {
  const p = writeFixture('base_change.ixp', baseIxp({ attributes: { dynamic: 0.2 } }))
  const r = run(['--write', '--file', p, '--pitch', '60', '--base', '0.6', '--points', '0:0.5, 1:0.9', '--mode', 'linear', '--apply'])
  if (r.status !== 0) return false
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  const nt = j.library[0].notes[0]
  return nt.attributes.dynamic === 0.6 &&
    JSON.stringify(nt.dynamics.points) === JSON.stringify([0, -0.1, DUR, 0.3]) &&
    run([p]).status === 0
})())

const real = process.argv.slice(2)
if (real.length) {
  console.log('\n== 真实工程（' + real.length + ' 个）==')
  const r = run(real)
  console.log(String(r.stdout).split('\n').slice(-3).join('\n'))
  check('真实工程校验 exit 0（' + real.map((f) => path.basename(f)).join(', ') + '）', r.status === 0, 'exit=' + r.status)
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log('\n' + (failed ? '❌ ' + failed + '/' + n + ' 失败' : '✅ ' + n + '/' + n + ' 全通过'))
process.exit(failed ? 1 : 0)
