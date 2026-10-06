#!/usr/bin/env node
/**
 * 守卫：**思考审计工具**（`tools/dump-reasoning.cjs`）不许悄悄坏。
 *
 * 为什么有它（2026-10-06，用户问「为什么用了这么长时间 / 思考了什么」）：这个工具是我们**唯一**能回答
 * "推理占几成、想了什么"的东西（`sessionStats` 只给聚合值，推理与正文混在一起）。它的正确性建立在两个
 * **格式假设**上 —— 日志是**多帧 zstd**、推理在 `reasoning-chunks` 的 `data.texts[]` —— 假设一破，
 * 它就会安静地给出错数字（比坏掉更糟）。所以：① 关键判据在位；② **跑它自己的合成自测**（多帧 + 截断尾巴）。
 *
 * 用法：node tools/check-reasoning-dump.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'dump-reasoning.cjs');
let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

console.log('== ① 工具在位 + 关键判据 ==');
if (!fs.existsSync(TOOL)) {
  fail('缺 tools/dump-reasoning.cjs');
} else {
  const src = fs.readFileSync(TOOL, 'utf8');
  for (const [what, re] of [
    ['按 magic 28 B5 2F FD 切帧', /0x28, 0xb5, 0x2f, 0xfd/],
    ['逐帧 zstdDecompressSync', /zstdDecompressSync\(buf\.subarray\(/],
    ['并帧要并到成功（不可只试几次）', /while \(j <= limit\)/],
    /* ⛔ 上界**必须**是"已解出内容到哪 / 或 EOF"，不能是"一直并到 buf.length" ——
     * `zstdDecompressSync(两帧)` 不报错、只解第 1 帧（静默丢帧），所以只要切片能跨过真帧边界，
     * 就会把后面的帧整段咽掉（2026-10-06 红灯的真因）。这条把它钉在代码里。 */
    ['切片不许跨过真帧边界（防静默丢帧）', /const limit = i < frameStarts \? frameStarts : offs\.length/],
    ['推理取 reasoning-chunks 的 data.texts', /data\.texts/],
    ['有 --selftest', /--selftest/],
    ['统计推理与正文**分开**', /reasonChars[\s\S]{0,400}textChars/],
  ]) (re.test(src) ? ok(what) : fail('缺 ' + what));
}

console.log('\n== ② 跑它自己的合成自测（多帧 + 截断尾巴，不依赖真机日志）==');
try {
  const out = execFileSync(process.execPath, [TOOL, '--selftest'], { encoding: 'utf8' });
  const m = out.match(/自测：(\d+) 通过 \/ (\d+) 失败/);
  if (!m) fail('自测没打出结果行（工具被改坏了？）');
  else if (Number(m[2]) !== 0) {
    fail(`自测 ${m[1]} 过 / ${m[2]} 败：`);
    for (const line of out.split('\n')) if (line.includes('✗')) console.log('        ' + line.trim());
  } else ok(`自测 ${m[1]}/${Number(m[1]) + Number(m[2])} 全过（合成 3 帧 + 截断尾巴）`);
} catch (e) {
  fail('自测跑不起来：' + (e && e.message ? e.message.split('\n')[0] : String(e)));
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ 思考审计工具守卫通过');
