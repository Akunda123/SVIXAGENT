#!/usr/bin/env node
/* 生成 `skills/acep/references/char-tone.json`：**汉字 → 声调**（纯查表用，给「歌词→声调序列」的零依赖回退路径）
 *
 * 数据源：本仓 `server/node_modules/pinyin-pro` 的字典 `dist/esm/data/dict1.mjs`
 *   （形态：`'bǎng páng pāng': ['膀']` —— 一个"读音串"对应一批同音字；读音带调号、空格分隔多音）
 * 产出（紧凑，按调分组）：
 *   { source, note, tones: { "1": "…", "2": "…", "3": "…", "4": "…", "5": "…" }, poly: ["行","膀",…] }
 *   · `tones[t]` = 该声调（1 阴平 · 2 阳平 · 3 上声 · 4 去声 · 5 轻声/无调号）的字串
 *   · `poly` = **多音字**（>1 个读音）⇒ 单字查表定不了调，要靠上下文（pinyin-pro 分词）或人工
 *
 * 用法：node tools/gen-char-tone.cjs [--check]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DICT = path.join(ROOT, 'server', 'node_modules', 'pinyin-pro', 'dist', 'esm', 'data', 'dict1.mjs');
const PKG = path.join(ROOT, 'server', 'node_modules', 'pinyin-pro', 'package.json');
const OUT = path.join(ROOT, 'skills', 'acep', 'references', 'char-tone.json');
const CHECK = process.argv.includes('--check');

if (!fs.existsSync(DICT)) { console.error('找不到 pinyin-pro 字典：' + DICT); process.exit(2); }

/** 带调拼音 → { pinyin, tone }（1..4；无调号 = 5 轻声/中性） */
const MARKS = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ',
};
function toneOf(syll) {
  for (const [base, marks] of Object.entries(MARKS)) {
    const idx = [...marks].findIndex((m) => syll.includes(m));
    if (idx >= 0) return { pinyin: syll.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, base).replace(/ü/g, 'v'), tone: idx + 1 };
  }
  return { pinyin: syll.replace(/ü/g, 'v'), tone: 5 };
}

const text = fs.readFileSync(DICT, 'utf8');
// 容忍两种键写法：'…' 或裸键；值可跨行
const re = /^\s*(?:'([^']*)'|([^\s:][^:]*?))\s*:\s*\[([\s\S]*?)\]/gm;
const charTones = new Map();   // char -> Set(tone)
let entries = 0, readings = 0;
let m;
while ((m = re.exec(text))) {
  const key = (m[1] || m[2] || '').trim();
  if (!key || /^(import|const|export|const map)/.test(key)) continue;
  const chars = (m[3].match(/'([^']*)'/g) || []).map((s) => s.slice(1, -1));
  if (!chars.length) continue;
  entries++;
  const sylls = key.split(/\s+/).filter(Boolean);
  const tones = new Set(sylls.map((s) => toneOf(s).tone));
  readings += sylls.length;
  for (const c of chars) {
    if (!charTones.has(c)) charTones.set(c, new Set());
    for (const t of tones) charTones.get(c).add(t);
  }
}

const byTone = { 1: [], 2: [], 3: [], 4: [], 5: [] };
const poly = [];
for (const [c, set] of charTones) {
  const ts = [...set].sort();
  if (ts.length > 1) poly.push(c);
  else byTone[ts[0]].push(c);
}
poly.sort();
for (const t of [1, 2, 3, 4, 5]) byTone[t].sort();

const version = (() => { try { return JSON.parse(fs.readFileSync(PKG, 'utf8')).version; } catch { return '?'; } })();
const out = {
  source: `pinyin-pro ${version} dist/esm/data/dict1.mjs`,
  note: 'tone: 1 阴平 · 2 阳平 · 3 上声 · 4 去声 · 5 轻声/无调号（喂 ACE rap 音高线时 5→0）。poly = 多音字，单字定不了调。',
  tones: { 1: byTone[1].join(''), 2: byTone[2].join(''), 3: byTone[3].join(''), 4: byTone[4].join(''), 5: byTone[5].join('') },
  poly: poly.join(''),
};

const json = JSON.stringify(out);
console.log(`字典条目 ${entries} · 读音 ${readings} · 唯一字 ${charTones.size}`);
console.log(`单音字：1 阴平 ${byTone[1].length} · 2 阳平 ${byTone[2].length} · 3 上声 ${byTone[3].length} · 4 去声 ${byTone[4].length} · 5 轻声 ${byTone[5].length}`);
console.log(`多音字 ${poly.length}`);
console.log(`产出 JSON ${json.length} 字符（${(Buffer.byteLength(json) / 1024).toFixed(1)} KB）`);

if (CHECK) {
  if (!fs.existsSync(OUT)) { console.error('❌ 缺少 ' + path.relative(ROOT, OUT)); process.exit(1); }
  const cur = fs.readFileSync(OUT, 'utf8');
  const same = cur === json;
  console.log(same ? '✅ 与现有文件一致' : '⚠️ 与现有文件不一致（跑不带 --check 的版本可重写）');
  process.exit(same ? 0 : 1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json, 'utf8');
console.log('已写 ' + path.relative(ROOT, OUT));
