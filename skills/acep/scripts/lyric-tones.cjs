#!/usr/bin/env node
/* ACE 歌词 → **声调序列**（0–4，可直接喂 `skills/acep/scripts/acep.cjs rap-curve --tones`）
 *
 * 口径（与 SV1「语调教.js」/ `rap-curve` 的调型表一致）：
 *   普通话 **阴平 1 · 阳平 2 · 上声 3 · 去声 4 · 轻声 → 0**；延音 `-` / 非中文 / 定不出 → **1（不动）**，保持逐音符 1:1 对齐。
 *
 * 两条定调路径（**纯规则、无 AI**）：
 *   ① **有上下文（推荐）**：仓里装了 `pinyin-pro`（`server/node_modules/pinyin-pro`）⇒ 把连续中文段拼成整段交给它**分词定音**
 *      （多音字按词取音：银行 yín háng / 行走 xíng zǒu）。可用 `--no-pinyin-pro` 关掉这条，验证回退路径。
 *   ② **零依赖回退**：查 `references/char-tone.json`（由 `tools/gen-char-tone.cjs` 从 pinyin-pro 的字典反解，21k 字）
 *      —— 单音字给调；**多音字/表外字给 1 并在表里标 `需上下文`**（单字查表本来就定不了多音字）。
 *
 * 用法：
 *   node scripts/lyric-tones.cjs                                  # 连 CLI 读当前工程（第一个 Sing 轨/片段）
 *   node scripts/lyric-tones.cjs --track 4 --clip 1 [--notes u1,u2]
 *   node scripts/lyric-tones.cjs --json <clip-note-content.json>   # 吃 CLI 的 JSON（离线）
 *   node scripts/lyric-tones.cjs --acep <file.acep> [--track N --clip M]   # 读工程文件（经 acep.cjs unpack）
 *   --out <tones.txt>        只把声调串写成文件（给别的工具消费）
 *   --no-pinyin-pro          强制走纯查表回退
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..', '..');
const ACEP_TOOL = path.join(HERE, 'acep.cjs');
const TABLE = path.join(HERE, '..', 'references', 'char-tone.json');
const CLI = process.env.AKDAGENT_ACE_CLI || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ACE Studio', 'acestudio-cli.exe');
const PINYIN_PRO_CANDIDATES = [
  path.join(ROOT, 'server', 'node_modules', 'pinyin-pro'),
  path.join(ROOT, 'node_modules', 'pinyin-pro'),
  'pinyin-pro',
];

const argv = process.argv.slice(2);
const arg = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const isCJK = (ch) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch);
const TONE_TO_JS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 0, 0: 0 };

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '').replace(/^\uFEFF/, '').trim(), err: (r.stderr || '').replace(/^\uFEFF/, '').trim() };
}

/* ── 取歌词 ── */
function fromCli(track, clip) {
  let t = track;
  if (t === null) {
    const j = JSON.parse(run(CLI, ['track', 'list', '--json']).out);
    const sing = (j.tracks || []).find((x) => x.trackType === 'Sing');
    if (!sing) throw new Error('工程里没有 Sing 轨');
    t = sing.trackIndex;
  }
  const c = clip === null ? 0 : clip;
  const r = run(CLI, ['clip', 'note-content', '--track-index', String(t), '--clip-index', String(c), '--json']);
  if (r.code !== 0) throw new Error('读音符失败：' + (r.err.split('\n')[0] || r.out));
  return { where: `CLI 当前工程 track[${t}] clip[${c}]`, notes: JSON.parse(r.out).notes || [] };
}
function fromJson(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const notes = j.notes || (j.tracks && j.tracks[0] && j.tracks[0].patterns ? j.tracks[0].patterns[0].notes : null);
  if (!notes) throw new Error('这个 JSON 里找不到 notes[]');
  return { where: 'JSON ' + file, notes };
}
function fromAcep(file, track, clip) {
  const tmp = path.join(os.tmpdir(), 'lyric-tones-' + Date.now() + '.json');
  const r = run(process.execPath, [ACEP_TOOL, 'unpack', file, tmp]);
  if (r.code !== 0) throw new Error('unpack 失败：' + (r.err.split('\n')[0] || r.out));
  const tree = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  const tracks = tree.tracks || [];
  let t = track;
  const p = clip === null ? 0 : clip;
  if (t === null) {
    t = tracks.findIndex((x) => Array.isArray(x.patterns) && x.patterns.some((q) => (q.notes || []).length));
    if (t < 0) throw new Error('文件里没有带音符的轨');
  }
  const notes = (tracks[t].patterns[p].notes || []).slice().sort((a, b) => a.pos - b.pos);
  return { where: `文件 ${path.basename(file)} track[${t}] pattern[${p}]`, notes };
}

/* ── 路径 ①：pinyin-pro（按词定音） ── */
let pinyinPro = null;
if (!argv.includes('--no-pinyin-pro')) {
  for (const c of PINYIN_PRO_CANDIDATES) { try { pinyinPro = require(c); break; } catch { /* 继续找 */ } }
}
function tonesByPinyinPro(notes) {
  const out = new Array(notes.length).fill(null);
  let i = 0;
  while (i < notes.length) {
    const first = [...String(notes[i].lyric || '')].filter(isCJK).pop();
    if (!first || String(notes[i].lyric) === '-') { i++; continue; }
    const idx = [];
    let text = '';
    let j = i;
    while (j < notes.length) {
      const s = String(notes[j].lyric || '');
      if (s === '-') { j++; continue; }
      const cj = [...s].filter(isCJK).pop();
      if (!cj) break;
      idx.push(j); text += cj; j++;
    }
    if (!idx.length) { i++; continue; }
    const py = pinyinPro.pinyin(text, { toneType: 'num', type: 'array' });
    idx.forEach((k, n) => { out[k] = py[n] === undefined ? null : py[n]; });
    i = j;
  }
  return out;
}

/* ── 路径 ②：纯查表 ── */
let TABLE_DATA = null;
function loadTable() {
  if (TABLE_DATA) return TABLE_DATA;
  const j = JSON.parse(fs.readFileSync(TABLE, 'utf8'));
  const map = new Map();                      // char -> tone(1..5)（单音字）
  for (const t of ['1', '2', '3', '4', '5']) for (const c of (j.tones[t] || '')) map.set(c, Number(t));
  const poly = new Set([...(j.poly || '')]);
  TABLE_DATA = { map, poly, source: j.source };
  return TABLE_DATA;
}
function tonesByTable(notes) {
  const { map, poly } = loadTable();
  return notes.map((n) => {
    const lyr = String(n.lyric || '');
    if (lyr === '-') return { tone: 1, why: 'tenuto ⇒ 不动' };
    const c = [...lyr].filter(isCJK).pop();
    if (!c) return { tone: 1, why: '非中文/空 ⇒ 不动' };
    if (poly.has(c)) return { tone: 1, why: `「${c}」是多音字 ⇒ 需上下文（纯查表定不了）`, ambiguous: true };
    const t = map.get(c);
    if (t === undefined) return { tone: 1, why: `「${c}」不在表里 ⇒ 不动`, ambiguous: true };
    return { tone: TONE_TO_JS[t], why: t === 5 ? '轻声 → 0' : '', table: true };
  });
}

/* ── 主 ── */
let src;
if (arg('--json')) src = fromJson(arg('--json'));
else if (arg('--acep')) src = fromAcep(arg('--acep'), arg('--track') === null ? null : Number(arg('--track')), arg('--clip') === null ? null : Number(arg('--clip')));
else src = fromCli(arg('--track') === null ? null : Number(arg('--track')), arg('--clip') === null ? null : Number(arg('--clip')));

let notes = src.notes.slice().sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
if (arg('--notes')) {
  const want = new Set(String(arg('--notes')).split(/[,\s]+/).filter(Boolean).map((s) => s.replace(/[{}]/g, '')));
  const all = notes;
  notes = all.filter((n) => want.has(String(n.uuid || n.noteUuid || '').replace(/[{}]/g, '')));
  if (!notes.length) { console.error('❌ --notes 里没有一个音符落在该片段'); process.exit(3); }
}

let rows, mode;
if (pinyinPro) {
  mode = 'pinyin-pro（按词定音）';
  const py = tonesByPinyinPro(notes);
  rows = notes.map((n, i) => {
    const lyr = String(n.lyric || '');
    let tone = 1, why = '';
    const p = py[i];
    if (lyr === '-') why = 'tenuto（延续前一音节）⇒ 不动';
    else if (p) {
      // ⚠️ 2026-10-05 修：`pinyin-pro` 的 `toneType:'num'` 对**轻声音节**返回的是 **`de0`（0）**，不是 `de5`。
      //    原先正则写 `[1-5]` ⇒ 轻声字一个都匹配不上，全被当成"定不出"回退成 1（「的」→ 1，应为 0）。
      //    ⇒ 现在同时收 0 与 5，都映射到 0（脚本口径：轻声音 = 0 = 音高不动）。
      const m = String(p).match(/^([a-zü]+)([0-5])$/i);
      if (m) {
        const t = Number(m[2]);
        tone = t === 0 ? 0 : TONE_TO_JS[t];
        why = t === 0 || t === 5 ? '轻声 → 0' : '';
      } else why = '拼音形状不认识 ⇒ 不动';
    } else if (lyr) why = '非中文/定不出 ⇒ 不动';
    else why = '空歌词 ⇒ 不动';
    return { pos: n.pos, dur: n.dur, pitch: n.pitch, lyric: lyr, pinyin: p || '', tone, why };
  });
} else {
  mode = '纯查表回退（references/char-tone.json）';
  const t = tonesByTable(notes);
  rows = notes.map((n, i) => ({ pos: n.pos, dur: n.dur, pitch: n.pitch, lyric: String(n.lyric || ''), pinyin: '', tone: t[i].tone, why: t[i].why }));
}

const tones = rows.map((r) => r.tone).join('');
console.log(`来源     ${src.where}`);
console.log(`定调     ${mode}${pinyinPro ? '' : '   ⚠️ 多音字需上下文，回退路径会把它们标出来'}`);
console.log(`音符     ${notes.length} 个（按 onset 排序）\n`);
console.log(`声调串   ${tones}\n`);
console.log('  #  pos     dur  pitch  歌词      拼音      调  说明');
rows.forEach((r, i) => {
  console.log(`  ${String(i).padStart(2)}  ${String(r.pos).padStart(6)}  ${String(r.dur).padStart(4)}  ${String(r.pitch).padStart(4)}  ${JSON.stringify(r.lyric).padEnd(9)} ${(r.pinyin || '-').padEnd(8)} ${String(r.tone).padStart(2)}  ${r.why}`);
});
const amb = rows.filter((r) => r.why.includes('多音字') || r.why.includes('不在表里')).length;
console.log(`\n统计：可定调 ${rows.filter((r) => r.why === '' || r.why === '轻声 → 0').length} · 不动/其它 ${rows.length - rows.filter((r) => r.why === '' || r.why === '轻声 → 0').length}${amb ? ` · ⚠️ 需上下文 ${amb}` : ''}`);
console.log(`\n下一步（画成 rap 音高线）：`);
console.log(`  node scripts/acep.cjs rap-curve <file.acep> --tones "${tones}" --track <N> --clip <M>    # 先干跑，再 --out <目录> 或 --in-place`);

if (arg('--out')) {
  fs.writeFileSync(arg('--out'), tones + '\n', 'utf8');
  console.log(`\n已写声调串：${arg('--out')}（${tones.length} 个数字，每音符一个）`);
}
