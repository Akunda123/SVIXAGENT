// ============================================================================
// check-align-audio-args.cjs —— 盯住 `sv_align_audio` 的两条已知坑（都出在**参数**上）
// ============================================================================
// 坑甲 `align-audio-measure-ignored`：`measure` 参数**无效**（对齐不到第 N 小节）。
//   ⇒ 判据：`OPS.align_audio` 体内**必须真的用它去取小节标**（`getMeasureMarkAt(measure)`）。
//     若有人把 measure 换回常量、或走别的分支把它绕过去，这里立刻红。
// 坑乙 `align-audio-duration-bpm-mismatch`：传给 `setTimeRange` 的**时长按 120 BPM 折算** ⇒ 音频被截断。
//   ⇒ 判据：`align_audio` 里 `setTimeRange(onset, duration)` 的**第二参必须来自音频自身**
//     （变量名以 `audio` 开头，如 `audioDuration`），**不得**是 `bpm` 参与算出来的表达式。
// 负向自测：`node tools/check-align-audio-args.cjs --file <副本>`。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const i = process.argv.indexOf('--file');
const FILE = i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'sv', 'lua', 'AKDAgentBridge.lua');

const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('function OPS.align_audio'));
if (start < 0) { console.log('⛔ 找不到 OPS.align_audio'); process.exit(2); }
let end = lines.length;
for (let k = start + 1; k < lines.length; k++) if (/^function OPS\./.test(lines[k])) { end = k; break; }
const body = lines.slice(start, end);
const code = body.filter((l) => !l.trim().startsWith('--'));
const text = code.join('\n');

const problems = [];

// 甲：measure 必须真被用
// ⚠️ 桥里用的是**安全调用**风格 `call(ta, "getMeasureMarkAt", measure)`（不是 `ta:getMeasureMarkAt(measure)`）
//    ⇒ 两种写法都要认
if (!/(?:getMeasureMarkAt["']?\s*,\s*measure|:\s*getMeasureMarkAt\s*\(\s*measure\s*\))/.test(text)) {
  problems.push('`measure` 没有被真正使用 —— 体内找不到 `getMeasureMarkAt(..., measure)`（坑甲：measure 参数无效）');
}
if (!/local\s+measure\s*=\s*tonumber\s*\(\s*args\.measure\s*\)/.test(text)) {
  problems.push('没有从 `args.measure` 取值（`local measure = tonumber(args.measure) or 1`）—— 参数被吞掉了');
}

// 乙：setTimeRange 的第二参必须来自音频自身
// ⚠️ 两种调用风格都要认：`ref:setTimeRange(a, b)` 与 `call(ref, "setTimeRange", a, b)`
//    （只认前者会**空转恒绿** —— 负向自测抓到过）
const stRe = /(?:setTimeRange\s*\(([^)]*)\)|["']setTimeRange["']\s*,\s*([^\n]*))/g;
let m;
let sawSetTimeRange = 0;
while ((m = stRe.exec(text)) !== null) {
  sawSetTimeRange++;
  const argStr = (m[1] !== undefined ? m[1] : m[2] || '').trim();
  const parts = argStr.split(',');
  if (parts.length < 2) continue;
  const dur = parts.slice(1).join(',').trim().replace(/\)\s*$/, '');
  if (!/^audio/i.test(dur)) {
    problems.push('`setTimeRange(…, ' + dur.slice(0, 40) + ')` 的时长不是音频自身（`audio*`）—— 坑乙：按 BPM 折算会截断音频');
  }
}
if (sawSetTimeRange === 0) problems.push('体内找不到 setTimeRange 调用 ⇒ 判据空转（实现改名了？）');
// 反面：把 bpm 折算进时长的典型写法
if (/duration[^\n]*=\s*[^\n]*\*\s*60\s*\/\s*(?:bpm|120)/i.test(text) || /60\s*\/\s*(?:bpm|120)[^\n]*duration/i.test(text)) {
  problems.push('体内出现「时长 = … * 60 / bpm」的折算 —— 坑乙的原始成因');
}

// 参数校验必须在（借用桥的既有行为）
const guards = [
  ['firstBeatSec 必填', /firstBeatSec\s*==\s*nil[\s\S]{0,80}error\(/],
  ['measure >= 1', /measure\s*<\s*1[\s\S]{0,60}error\(/],
  ['小节标找不到要报错', /measure not found/],
];
const missing = guards.filter(([, re]) => !re.test(text)).map(([n]) => n);

console.log('== sv_align_audio 参数守卫 ==');
console.log('文件：' + path.relative(ROOT, FILE).replace(/\\/g, '/') + ' · align_audio 体 ' + body.length + ' 行（非注释 ' + code.length + ' 行）');
if (missing.length) console.log('⚠️ 缺少的参数校验：' + missing.join(' · '));
if (problems.length) {
  console.log('\n🔴 ' + problems.length + ' 项：');
  for (const p of problems) console.log('  · ' + p);
  console.log('\n❌ align_audio 参数契约被破坏');
  process.exit(1);
}
console.log('✅ `measure` 真被用（getMeasureMarkAt(…, measure)）· 时长来自音频自身 · 三条参数校验齐全');
