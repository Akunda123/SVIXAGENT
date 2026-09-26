#!/usr/bin/env node
/**
 * 读 DSH 会话日志（`session.v3.jsonl.zstd`）——**多帧拼接的 zstd**，Node 的流式解压只吃第一帧
 * 就会报 `Unknown frame descriptor`，所以这里自己走帧结构，逐帧 `zstdDecompressSync`。
 *
 * 为什么需要：用户报「一发消息就 回合结束（error）」时，**客户端日志里没有那一轮的 reason**
 * （客户端不记 turn/end 的 reason），但 DSH 会把事件持久化进会话日志 ⇒ 让用户把这一个文件发来即可。
 *
 * 用法：
 *   node tools/read-session-log.cjs <session.v3.jsonl.zstd> [--turns N] [--lines N] [--grep 关键词]
 * 输出：总行数、按类型统计、最后 N 条 turn/end 的完整 reason，以及可选的关键词命中行。
 */
const fs = require('fs');
const zlib = require('zlib');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('用法：node tools/read-session-log.cjs <session.v3.jsonl.zstd> [--turns N] [--lines N] [--grep kw]');
  process.exit(2);
}
const num = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const turnsN = num('--turns', 6);
const tailN = num('--lines', 8);
const kwIdx = args.indexOf('--grep');
const kw = kwIdx >= 0 ? args[kwIdx + 1] : null;

const MAGIC = 0xfd2fb528; // zstd magic bytes 28 b5 2f fd read as little-endian uint32
const buf = fs.readFileSync(file);
console.log(`文件 ${file}  ${(buf.length / 1048576).toFixed(1)} MB`);

/** 从一个 zstd 帧起点算出它的结束位置（走 header + blocks）。 */
function frameEnd(b, p) {
  if (b.readUInt32LE(p) !== MAGIC) return -1;
  p += 4;
  const fhd = b[p++];
  const fcsFlag = fhd >> 6;
  const singleSegment = (fhd >> 5) & 1;
  const hasChecksum = (fhd >> 2) & 1;
  const dictIdFlag = fhd & 3;
  if (!singleSegment) p += 1; // Window_Descriptor
  p += dictIdFlag === 0 ? 0 : dictIdFlag === 1 ? 1 : dictIdFlag === 2 ? 2 : 4;
  if (fcsFlag === 0) { if (singleSegment) p += 1; }
  else if (fcsFlag === 1) p += 2;
  else if (fcsFlag === 2) p += 4;
  else p += 8;
  for (;;) {
    if (p + 3 > b.length) return -1;
    const h = b.readUIntLE(p, 3);
    p += 3;
    const last = h & 1;
    const type = (h >> 1) & 3;
    const size = h >> 3;
    if (type === 0 || type === 2) p += size;
    else if (type === 1) p += 1;
    else return -1; // reserved
    if (p > b.length) return -1;
    if (last) break;
  }
  if (hasChecksum) p += 4;
  return p;
}

let p = 0;
let frames = 0;
let bad = 0;
let text = '';
const keepTail = [];      // 尾部若干行
const keepTurns = [];     // 尾部若干 turn/end
const counts = new Map();
const hits = [];
let lineCount = 0;

function feed(s) {
  text += s;
  let idx;
  while ((idx = text.indexOf('\n')) >= 0) {
    const line = text.slice(0, idx);
    text = text.slice(idx + 1);
    if (!line.trim()) continue;
    lineCount++;
    let obj = null;
    try { obj = JSON.parse(line); } catch (_) {}
    const t = obj && (obj.type || (obj.data && obj.data.type)) || '?';
    counts.set(t, (counts.get(t) || 0) + 1);
    if (keepTail.length >= tailN) keepTail.shift();
    keepTail.push(line);
    const isTurnEnd = /"turn\/end"/.test(line);
    if (isTurnEnd) {
      if (keepTurns.length >= turnsN) keepTurns.shift();
      keepTurns.push(line);
    }
    if (kw && line.includes(kw)) { if (hits.length < 20) hits.push(line); }
  }
}

while (p + 4 <= buf.length) {
  if (buf.readUInt32LE(p) !== MAGIC) { bad++; break; }
  const end = frameEnd(buf, p);
  if (end < 0 || end > buf.length) { bad++; break; }
  const frame = buf.subarray(p, end);
  try {
    feed(zlib.zstdDecompressSync(frame).toString('utf8'));
    frames++;
  } catch (e) {
    bad++;
    console.log(`  ! frame ${frames + 1} 解压失败: ${e.message}`);
    break;
  }
  p = end;
}

console.log(`帧数 ${frames}（异常 ${bad}），解出 ${lineCount} 行`);
console.log('事件类型统计：' + [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join('  '));

if (hits.length) {
  console.log(`\n== --grep ${kw} 命中（前 ${hits.length} 条）==`);
  hits.forEach((h) => console.log('  ' + h.slice(0, 1200)));
}

console.log(`\n== 最后 ${keepTurns.length} 条 turn/end ==`);
if (!keepTurns.length) console.log('  （没有 turn/end）');
keepTurns.forEach((h) => {
  try {
    const o = JSON.parse(h);
    const d = o.data || o;
    console.log('  ' + JSON.stringify(d.reason || d).slice(0, 1500));
  } catch (_) { console.log('  ' + h.slice(0, 1000)); }
});

console.log(`\n== 最后 ${keepTail.length} 行（原样，截断）==`);
keepTail.forEach((h) => console.log('  ' + h.slice(0, 500)));
