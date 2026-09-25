// ============================================================================
// check-tempo-mark-replace.cjs —— 盯住 **tempo-mark-no-update** 这个宿主行为
// ============================================================================
// 坑（真机记录，`tools/known-bugs.json` 的 `tempo-mark-no-update`）：
//   `TimeAxis.addTempoMark(blick, bpm)` **不会更新同位置已有的标**（官方文档说"会更新"，实测不更新）
//   ⇒ 若直接 add，结果是"改了 BPM 却没生效"——浮动 BPM 逐段打标时尤其致命（整条时间轴对不上音频）。
// 现行做法（桥 0.3.30）：`apply_tempo` 每次 `addTempoMark` 之前**先 `removeTempoMark(同位置)`**。
// 本守卫就是用**源码顺序**把这条不变量钉住：
//   在 `OPS.apply_tempo` 的函数体内，**每一个 `addTempoMark(` 之前都必须出现过 `removeTempoMark(`**。
//   （只须出现"更靠前"即可，不要求同一行——因为桥里是循环体，删在前、加在后。）
// 负向自测：`node tools/check-tempo-mark-replace.cjs --file <副本>`（把 remove 那行删掉应 exit 1）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const i = process.argv.indexOf('--file');
const FILE = i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'sv', 'lua', 'AKDAgentBridge.lua');

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split(/\r?\n/);

// 找到 OPS.apply_tempo 的函数体（到下一个 `function OPS.` 为止）
const start = lines.findIndex((l) => l.includes('function OPS.apply_tempo'));
if (start < 0) { console.log('⛔ 找不到 OPS.apply_tempo'); process.exit(2); }
let end = lines.length;
for (let k = start + 1; k < lines.length; k++) if (/^function OPS\./.test(lines[k])) { end = k; break; }
const body = lines.slice(start, end);

// ⚠️ 判据必须**锚在写标的那个循环里**：`clearExisting` 分支里也有 `removeTempoMark`，
//    拿它当"已经删过"会假通过（负向自测当场抓到这个 false-negative）。
const loopAt = body.findIndex((l) => /for\s+j\s*=\s*1\s*,\s*#marks/.test(l));
if (loopAt < 0) { console.log('⛔ apply_tempo 里找不到写标循环（for j = 1, #marks）'); process.exit(2); }

// ⚠️ 桥里用的是**安全调用风格** `call(ta, "addTempoMark", blick, bpm)` —— 方法名后**不跟左括号**。
//    第一版只认 `addTempoMark(` ⇒ **一个都没匹配到、守卫恒绿（vacuous）**，负向自测当场抓到。
const RE_ADD = /(?:addTempoMark\s*\(|["']addTempoMark["']\s*,)/;
const RE_REM = /(?:removeTempoMark\s*\(|["']removeTempoMark["']\s*,)/;

const hits = [];
let seenRemove = false;
body.slice(loopAt).forEach((ln, k) => {
  const t = ln.trim();
  const isComment = t.startsWith('--');
  if (!isComment && RE_REM.test(ln)) seenRemove = true;
  if (!isComment && RE_ADD.test(ln) && !seenRemove) {
    hits.push({ line: start + loopAt + k + 1, text: t.slice(0, 110) });
  }
});
// 防空转：循环里**至少要有一个** addTempoMark，否则本守卫等于没查
if (!body.slice(loopAt).some((l) => !l.trim().startsWith('--') && RE_ADD.test(l))) {
  console.log('⛔ 循环里找不到 addTempoMark ⇒ 守卫会空转，判据失效（实现改名了？）');
  process.exit(2);
}
if (!body.slice(loopAt).some((l) => !l.trim().startsWith('--') && RE_REM.test(l))) {
  hits.push({ line: start + loopAt + 1, text: '（循环内完全没有 removeTempoMark）' });
}

console.log('== tempo 标「先删同位置、再写」守卫 ==');
console.log('文件：' + path.relative(ROOT, FILE).replace(/\\/g, '/') + ' · apply_tempo 体 ' + body.length + ' 行');
if (hits.length) {
  console.log('\n🔴 ' + hits.length + ' 处 `addTempoMark` 之前没有 `removeTempoMark`：');
  for (const h of hits) console.log('  · 第 ' + h.line + ' 行  ' + h.text);
  console.log('\n❌ addTempoMark 不会更新同位置已有的标（文档说会）—— 直接 add 等于“改了 BPM 却没生效”');
  process.exit(1);
}
console.log('✅ 每个 addTempoMark 之前都有 removeTempoMark（同位置先删再写）');
