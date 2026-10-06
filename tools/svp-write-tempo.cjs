#!/usr/bin/env node
/**
 * `svp-write-tempo.cjs` —— 把**测出的速度包络**写进一个 `.svp`（只写新文件，绝不改你的源工程）
 *
 * 为什么需要：`measure_tempo` 产出的是「时间 → BPM」包络，而 SV 工程里速度标存的是
 *   `time.tempo[] = [{ position: <blick>, bpm }]`（实测对照见 `knowledge/docs/工程文件结构-实测对比-SV1-SV2-IX.md`）。
 *   这一步把秒级包络换算成 blick 并落成文件 —— **不需要开 SV、不需要跑桥**。
 *
 * 用法：
 *   node tools/svp-write-tempo.cjs --base <底板.svp> --tempo <包络.json> --out <新.svp> [--bar-beats 4] [--force] [--dry-run]
 *
 * 输入 `--tempo` 两种都收：
 *   ① `measure_tempo` 落的 `.tempo-envelope.json`（读里面的 `segments[{startSec,bpm}]`）——推荐
 *   ② 直接给数组：`[{seconds,bpm}, …]` 或 `[{position,bpm}, …]`（后者已是 blick，就不再换算）
 *
 * ⛔ 安全纪律（与 `svp-inject-audio.cjs` 同款）：
 *   · **只写 `--out`**，且 `--out` 不得等于 `--base`；目标已存在要显式 `--force`
 *   · 源文件**只读**（跑完比对 sha256，变了就报错退出）
 *   · 保留底板的一切其他字段，**并保留文件尾部的 `\0`**（SV1 的 `.svp` 尾部有 NUL 字节 ——
 *     实测：`…false}}\u0000`，丢了可能不被认；见对照文档 §3）
 *   · 不猜不静默：写入条数、首末标、文件大小全部打印出来
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf(n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const has = (n) => A.includes(n);

const BASE = opt('--base');
const TEMPO = opt('--tempo');
const OUT = opt('--out');
const BAR_BEATS = Math.max(1, Number(opt('--bar-beats', '4')) || 4);
const FORCE = has('--force');
const DRY = has('--dry-run');

/** 1 个四分音符 = 705600000 blick（三端一致） */
const QUARTER = 705600000;

function die(msg) { console.error('✗ ' + msg); process.exit(2); }
function sha(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

if (!BASE || !TEMPO || !OUT) die('用法：--base <底板.svp> --tempo <包络.json> --out <新.svp> [--bar-beats 4] [--force] [--dry-run]');
if (path.resolve(BASE) === path.resolve(OUT)) die('--out 不能等于 --base（源文件只读；请另给一个新文件名）');
if (fs.existsSync(OUT) && !FORCE) die(`--out 已存在：${OUT}（确认要覆盖就加 --force）`);
if (!fs.existsSync(BASE)) die('读不到底板：' + BASE);
if (!fs.existsSync(TEMPO)) die('读不到包络：' + TEMPO);

// ── 读包络 ────────────────────────────────────────────────
let segs = [];
{
  const raw = JSON.parse(fs.readFileSync(TEMPO, 'utf8'));
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.segments) ? raw.segments : null);
  if (!arr || !arr.length) die('包络里没有 segments（也不像 {seconds,bpm} 数组）：' + TEMPO);
  segs = arr
    .map((s) => ({
      seconds: typeof s.seconds === 'number' ? s.seconds : (typeof s.startSec === 'number' ? s.startSec : (typeof s.position === 'number' ? null : undefined)),
      bpm: Number(s.bpm),
      position: typeof s.position === 'number' ? s.position : null,
    }))
    .filter((s) => Number.isFinite(s.bpm) && s.bpm > 0);
  if (!segs.length) die('包络解析后没有有效段');
}
const alreadyBlick = segs.every((s) => s.position !== null && s.seconds === null);

// ── 秒 → blick（按 tempo 分段累加；tempo 一变，秒与 blick 就不是线性关系）────────
const marks = [];
{
  let pos = 0;
  if (alreadyBlick) {
    for (const s of segs) marks.push({ position: Math.round(s.position), bpm: Math.round(s.bpm * 100) / 100 });
  } else {
    let prevSec = 0;
    let prevBpm = segs[0].bpm;
    // 第一段起点若 > 0（前奏），按首段速度折算
    const first = segs[0].seconds ?? 0;
    if (first > 0) pos += Math.round((first * prevBpm / 60) * QUARTER);
    marks.push({ position: pos, bpm: Math.round(prevBpm * 100) / 100 });
    for (let i = 1; i < segs.length; i++) {
      const t = segs[i].seconds;
      if (t === null || t === undefined) die('这一段既没有 seconds 也没有 position，无法换算');
      pos += Math.max(0, Math.round(((t - prevSec) * prevBpm / 60) * QUARTER));
      marks.push({ position: pos, bpm: Math.round(segs[i].bpm * 100) / 100 });
      prevSec = t;
      prevBpm = segs[i].bpm;
    }
  }
}
// 位置必须严格递增（SV 也会这么要求）
for (let i = 1; i < marks.length; i++) {
  if (marks[i].position <= marks[i - 1].position) die(`第 ${i + 1} 条 tempo 标的位置没有递增（${marks[i - 1].position} → ${marks[i].position}）—— 包络里可能有重复/倒退的时间戳`);
}

// ── 读底板：**保留尾部字节** ────────────────────────────────
const baseBuf = fs.readFileSync(BASE);
const baseSha = crypto.createHash('sha256').update(baseBuf).digest('hex');
const text = baseBuf.toString('utf8');
const end = text.lastIndexOf('}');
if (end < 0) die('底板不是 JSON（找不到 `}`）：' + BASE);
const tail = Buffer.from(text.slice(end + 1), 'utf8');
let doc;
try { doc = JSON.parse(text.slice(0, end + 1)); } catch (e) { die('底板 JSON 解析失败：' + e.message); }
if (!doc.time || typeof doc.time !== 'object') die('底板里没有 time 段（不是 SV 工程？）');

// ── 写 ────────────────────────────────────────────────────
const before = (doc.time.tempo || []).length;
const firstBpm = marks[0].bpm;
doc.time.tempo = marks;
if (!doc.time.meter || !doc.time.meter.length) doc.time.meter = [{ index: 0, numerator: BAR_BEATS, denominator: 4 }];
// 空白工程的 tempo[0] 往往是 120：这里**必须**设成实测首段速度，否则网格整体错位
const outJson = JSON.stringify(doc);
const outBuf = Buffer.concat([Buffer.from(outJson, 'utf8'), tail]);

console.log(`底板   ：${path.basename(BASE)}  version=${doc.version}  轨=${(doc.tracks || []).length}  原 tempo 标=${before}`);
console.log(`包络   ：${segs.length} 段${alreadyBlick ? '（已是 blick，直接采用）' : '（秒 → blick 累加换算）'}`);
console.log(`将写入 ：${marks.length} 条 tempo 标 · 首 ${marks[0].position}/${marks[0].bpm} BPM · 末 ${marks[marks.length - 1].position}/${marks[marks.length - 1].bpm} BPM`);
console.log(`         （尾部字节保留 ${tail.length} 个：${JSON.stringify(tail.toString('latin1'))}）`);
if (DRY) { console.log('--dry-run：没有写任何文件'); process.exit(0); }

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, outBuf);
// 源文件必须没被动过
if (sha(BASE) !== baseSha) die('源文件在本次运行中被改动了（不该发生）——请检查');
// 自检：写出来的能解回来、tempo 条数与值对得上
{
  const back = fs.readFileSync(OUT);
  const bt = back.toString('utf8');
  const be = bt.lastIndexOf('}');
  const bj = JSON.parse(bt.slice(0, be + 1));
  const okCount = (bj.time.tempo || []).length === marks.length;
  const okFirst = (bj.time.tempo || [])[0] && bj.time.tempo[0].bpm === firstBpm;
  const okTail = tail.length === 0 ? true : back.slice(-tail.length).equals(tail);   // ⚠️ `slice(-0)` 是**整个** Buffer ⇒ 空尾必须单独判（否则假失败）
  console.log(`写好了 ：${OUT}  ${back.length} 字节`);
  console.log(`自检   ：条数 ${okCount ? '✓' : '✗'} · 首标 ${okFirst ? '✓' : '✗'} · 尾部 ${okTail ? '✓' : '✗'}`);
  if (!okCount || !okFirst || !okTail) process.exit(1);
}
