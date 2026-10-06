#!/usr/bin/env node
/**
 * **思考审计**：把会话日志里的"推理（reasoning）"读出来并量化。
 *
 * 为什么有它（2026-10-06，用户问「为什么用了这么长时间」→「思考了什么」）：
 *   `sessionStats` 只给聚合值（`llmMs` / `decodeMs` / `decodeTokens`），**推理 token 与正文 token 混在一起**，
 *   于是"是不是一直在想""想占几成"都答不了。实测下来真源在会话日志里 —— 推理文本**是存着的**，而且量极大
 *   （某会话 ≈49.5 万字符 ≈ 31 万 token 的推理，比可见回答大一个数量级）⇒ 这就是"慢"的主体。
 *
 * 格式（**照 DSH 自己的读法**，不是猜；见 `@deepseek-ai/dsh-session-persistence-jsonl/lib/worker.cjs`
 *      的 `createZstdDecompress` + `zstdDecompressSync(source.subarray(start, end))`）：
 *   · 日志 = `<AKDAGENT_HOME>/sessions/<cwd 编码>/<会话 id>/session[.vN].jsonl.zstd`；
 *   · 文件 = **一串独立的 zstd 帧**（每次 append 一帧），帧头 magic `28 B5 2F FD`；
 *     ⚠️ 所以 `zstdDecompressSync(整份)` **只解第一帧**、流式解压会在第二帧报 `prefix_unknown`；
 *   · **末尾可能是被截断的尾巴**（DSH 那边叫 `truncation-repair`）⇒ 解不开就跳过、只计数；
 *   · 推理文本在 `type:"reasoning-chunks"` 事件的 **`data.texts[]`**（每片 2~8 字符的流式增量）⇒ **按序拼接**。
 *
 * 用法：
 *   node tools/dump-reasoning.cjs                     # 列表：各会话的推理量/正文量/工具调用（按推理量排序）
 *   node tools/dump-reasoning.cjs --session <子串>     # 某会话详情（前几段推理）
 *   node tools/dump-reasoning.cjs --session <子串> --out <文件.md>   # 导出该会话的完整推理
 *   node tools/dump-reasoning.cjs --home <目录>        # 换一个家（默认 $AKDAGENT_HOME 或 ~/.dsh-akdagent）
 *   node tools/dump-reasoning.cjs --selftest           # 合成多帧 + 截断尾巴的**自测**（不需要真机日志）
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const opt = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const has = (name) => process.argv.includes(name);

/** 扫 magic 切帧后逐帧解压；返回 `{text, frames, ok, tail}`（`tail` = 结尾解不开的截断帧）。
 *  ⚠️ 三条必须这样写（2026-10-06 自测抓到两条，第三条是把它修对时补的）：
 *   ① **不能只并几帧就放弃** —— 压缩数据里**可能恰好出现 magic 字节**（小帧更容易），
 *      被当成新帧起点后切早了 ⇒ 要从这个起点**一直往后并到某个 offset 或 EOF**，直到解得出；
 *   ② 解成功后**跳到这一帧真正结束的那个 offset**，否则那些"假起点"会被反复当帧处理；
 *   ③ ⛔ **切片绝不能跨过"还没被证实是假帧"的帧边界**（`while (j <= limit)` 的上界）——
 *      `zstdDecompressSync(多帧 Buffer)` **不报错、只解第 1 帧、后面几帧静默丢掉**（实测：
 *      `f1+f2` 只回 f1 的内容，连内容量字段都不提意见）。旧版把切片一路扩到 `buf.length`，
 *      一旦某个前缀起点解得出来，就会把**后面所有真帧**一起咽掉——这正是"三帧只映出第一帧"。
 *      所以只有已证实是假帧（起点落在已解出内容之内）的前缀才允许被并进切片。 */
function decodeFrames(buf) {
  const offs = [];
  for (let i = 0; i + 4 <= buf.length; i++) if (buf.compare(MAGIC, 0, 4, i, i + 4) === 0) offs.push(i);
  let text = '', ok = 0, empty = 0, frameStarts = 0, i = 0;
  while (i < offs.length) {
    /* 并帧的上界：**已解出的内容到哪，就只许并到哪**。
     *   · 起点在已解出内容之内（`i < frameStarts`）= 已证实是假帧 ⇒ 可并到该帧真正的结尾；
     *   · 起点在内容之后（`i >= frameStarts`）= 新帧 ⇒ 只能"并到 EOF"（末个 offset 情形）。
     *   其它真帧边界（`offs[frameStarts..]`）一律不许并 —— 并了就是把两帧喂给解码器，见 ③。 */
    const limit = i < frameStarts ? frameStarts : offs.length;
    let j = i + 1, end = -1, got = null;
    while (j <= limit) {                          // ← 上界不是 offs.length：不许并到未证实的真帧边界之后
      const e = j < offs.length ? offs[j] : buf.length;
      try { got = zlib.zstdDecompressSync(buf.subarray(offs[i], e)); end = e; break; } catch { j++; }
    }
    if (end < 0) { i++; continue; }               // 到上界都解不开 ⇒ 跳过这个假起点
    if (!got.length) empty++;                     // 解出**空帧**（截断尾巴常见）——不是真内容
    text += got.toString('utf8');
    ok++;
    while (frameStarts < offs.length && offs[frameStarts] < end) frameStarts++;   // 本帧真正吃到的起点
    i = frameStarts;
  }
  return { text, frames: offs.length, ok, empty, tail: offs.length - frameStarts };
}

function findLogs(home) {
  const out = [];
  const root = path.join(home, 'sessions');
  if (!fs.existsSync(root)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.jsonl(\.zstd)?$/.test(e.name)) out.push(p);
    }
  })(root);
  return out;
}

/** 统计一个日志：推理/正文/工具/轮次。返回 `{...stats, reasoningText}`。 */
function analyze(file) {
  const buf = fs.readFileSync(file);
  const dec = /\.zstd$/.test(file) ? decodeFrames(buf) : { text: buf.toString('utf8'), frames: 1, ok: 1, tail: 0 };
  const stats = { file, bytes: buf.length, frames: dec.frames, framesOk: dec.ok, tail: dec.tail,
    lines: 0, reasonEvents: 0, reasonChars: 0, textEvents: 0, textChars: 0, toolCalls: 0, turns: 0, steps: 0, reasoningText: '' };
  for (const ln of dec.text.split('\n')) {
    if (!ln) continue;
    let j; try { j = JSON.parse(ln); } catch { continue; }
    stats.lines++;
    const t = j.type || (j.event && j.event.type) || '';
    if (/^reasoning/.test(t)) {
      stats.reasonEvents++;
      const arr = j && j.data && j.data.texts;
      if (Array.isArray(arr)) { const s = arr.join(''); stats.reasonChars += s.length; stats.reasoningText += s; }
    } else if (/^text-chunks|^assistant\/chunk/.test(t)) {
      stats.textEvents++;
      const arr = j && j.data && (j.data.texts || j.data.chunks);
      if (Array.isArray(arr)) stats.textChars += arr.join('').length;
    } else if (t === 'tool/call') stats.toolCalls++;
    else if (t === 'step/start') stats.steps++;
    else if (t === 'turn/start' || t === 'assistant/message') stats.turns++;
  }
  return stats;
}

const tok = (chars) => Math.round(chars / 1.6);      // 粗估：中文/英文混排约 1.6 字符/token

/* ─────────────────────────── 自测 ─────────────────────────── */
if (has('--selftest')) {
  let pass = 0, fail = 0;
  const ok = (c, what, extra = '') => { if (c) { pass++; console.log('  ✓ ' + what); } else { fail++; console.log('  ✗ ' + what + (extra ? '  ← ' + extra : '')); } };
  const mk = (lines) => lines.map((o) => JSON.stringify(o)).join('\n') + '\n';
  const f1 = zlib.zstdCompressSync(Buffer.from(mk([{ type: 'reasoning-chunks', data: { texts: ['想', '了', '一下'] } }])));
  const f2 = zlib.zstdCompressSync(Buffer.from(mk([{ type: 'text-chunks', data: { texts: ['回答'] } }])));
  const f3 = zlib.zstdCompressSync(Buffer.from(mk([{ type: 'tool/call', name: 'x' }])));
  const whole = Buffer.concat([f1, f2, f3]);
  const tmp = path.join(os.tmpdir(), `akdagent-reasoning-selftest-${process.pid}.jsonl.zstd`);
  fs.writeFileSync(tmp, whole);
  try {
    const d = decodeFrames(whole);
    ok(d.frames === 3 && d.ok === 3, '**多帧**能全解（3 帧）', JSON.stringify({ frames: d.frames, ok: d.ok }));
    /* ⚠️ 断言必须**按 JSONL 解析后**比对，**不能拿原始文本做子串**（2026-10-06 抓到的真因）：
     *   `texts:['想','了','一下']` 序列化出来是 `["想","了","一下"]` —— 字符是**独立的 JSON 元素**，
     *   原始文本里**根本不存在** `想了一下` 这个连续子串 ⇒ 原来那条 `d.text.includes('想了一下')`
     *   是个**永远不可能成立**的断言（红灯的真身），而"坏掉也没人发现"的风险来自它太弱：
     *   多帧被解码器静默丢帧时，只要第 1 帧内容在，它也照样"过"。 */
    const dec = d.text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const byType = (t) => dec.filter((j) => j && j.type === t);
    const joined = (t) => byType(t).flatMap((j) => (j.data && j.data.texts) || []).join('');
    ok(joined('reasoning-chunks') === '想了一下' && joined('text-chunks') === '回答' && byType('tool/call').length === 1,
      '三帧内容都拼回来了', JSON.stringify({ reasoning: joined('reasoning-chunks'), text: joined('text-chunks'), tools: byType('tool/call').length }));
    /* 这一条专防"多帧被静默丢帧"：喂给解码器的切片**永远不许跨过一个真帧边界**。
     * `zstdDecompressSync(f1+f2)` 不报错、只解 f1 ⇒ 丢了也没症状；解出空帧或没把三帧都解出，就是丢帧。 */
    ok(d.ok === 3 && d.empty === 0, '每一帧都独立解出内容（没有把两帧一起喂给解码器）', JSON.stringify({ ok: d.ok, empty: d.empty }));
    const s = analyze(tmp);
    // ⚠️ `想了一下` 是 **4** 个字（'想'+'了'+'一下'）—— 第一版我写成 3，纯测试期望错
    ok(s.reasonEvents === 1 && s.reasonChars === 4 && s.reasoningText === '想了一下', 'reasoning 事件按序拼接正确', JSON.stringify({ ev: s.reasonEvents, chars: s.reasonChars, txt: s.reasoningText }));
    ok(s.toolCalls === 1 && s.textChars === 2, '工具调用/正文分别计数', JSON.stringify({ tool: s.toolCalls, text: s.textChars }));
    /* 尾巴那一段**只断言"不抛错、前面的读得到"**，不断言 `tail` 计数 ——
     * 实测：Node 对"magic + 垃圾"仍会当空帧解出来（真帧 / 空帧的归属因此不是我们能定的）；
     * 断言编解码器的容错细节属于**过度指定**，真正要保证的是"坏尾巴不会让整个工具崩、前面的照读"。 */
    const cut = Buffer.concat([f1, f2, MAGIC, Buffer.from([0, 0, 0, 0])]);
    let d2 = null, threw = '';
    try { d2 = decodeFrames(cut); } catch (e) { threw = String(e && e.message); }
    ok(!threw && !!d2 && d2.text.includes('回答'), '坏尾巴不抛错，且前面的内容照样读到', threw || JSON.stringify({ ok: d2.ok, tail: d2.tail }));
  } finally { try { fs.unlinkSync(tmp); } catch { /* 忽略 */ } }
  console.log(`\n===== 自测：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
}

/* ─────────────────────────── 正常用法 ─────────────────────────── */
const home = opt('--home') || process.env.AKDAGENT_HOME || path.join(os.homedir(), '.dsh-akdagent');
const logs = findLogs(home);
if (!logs.length) {
  console.error(`没找到会话日志（找的是 ${path.join(home, 'sessions')}）—— 用 --home 指定别的家`);
  process.exit(2);
}
const want = opt('--session');
const out = opt('--out');

if (want) {
  const hit = logs.filter((f) => f.includes(want));
  if (!hit.length) { console.error('没有匹配的会话：' + want); process.exit(2); }
  const s = analyze(hit.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]);
  console.log(`${s.file}\n  帧 ${s.framesOk}/${s.frames}（截断尾巴 ${s.tail}）· ${s.lines} 行 · ${(s.bytes / 1048576).toFixed(2)} MB`);
  console.log(`  推理 ${s.reasonEvents} 事件 / ${s.reasonChars} 字符 ≈ **${tok(s.reasonChars)} token**`);
  console.log(`  正文 ${s.textChars} 字符 ≈ ${tok(s.textChars)} token · 工具调用 ${s.toolCalls} · 步 ${s.steps}`);
  if (out) { fs.writeFileSync(out, s.reasoningText, 'utf8'); console.log(`  ✓ 推理全文已导出 → ${out}（${s.reasoningText.length} 字符）`); }
  else {
    const step = Math.max(1, Math.floor(s.reasoningText.length / 3));
    for (let i = 0; i < 3; i++) {
      const seg = s.reasoningText.slice(i * step, i * step + 200).replace(/\s+/g, ' ').trim();
      if (seg) console.log(`  片段${i + 1}：${seg}`);
    }
    console.log('  （要全文加 --out <文件>）');
  }
  process.exit(0);
}

const rows = logs.map(analyze).sort((a, b) => b.reasonChars - a.reasonChars).slice(0, 12);
console.log(`家：${home} · 会话日志 ${logs.length} 个（按推理量排前 ${rows.length}）\n`);
console.log('会话'.padEnd(46) + '推理事件'.padStart(9) + '推理token'.padStart(11) + '正文token'.padStart(11) + '工具'.padStart(6) + '帧(尾)'.padStart(10));
for (const r of rows) {
  const rel = r.file.replace(path.join(home, 'sessions'), '').replace(/\\session[^\\]*\.jsonl(\.zstd)?$/, '').replace(/^\\/, '');
  console.log(rel.slice(-45).padEnd(46) + String(r.reasonEvents).padStart(9) + String(tok(r.reasonChars)).padStart(11) + String(tok(r.textChars)).padStart(11) + String(r.toolCalls).padStart(6) + '  ' + `${r.framesOk}/${r.frames}(${r.tail})`);
}
const total = rows.reduce((n, r) => n + r.reasonChars, 0);
console.log(`\n合计（前 ${rows.length} 个会话）推理 ≈ ${tok(total)} token —— 对照：` + '`sessionStats.decodeTokens` 是"推理+正文"的和，所以**推理往往是大头**。');
console.log('看某个会话：`node tools/dump-reasoning.cjs --session <子串>`（加 `--out <文件>` 导出全文）');
