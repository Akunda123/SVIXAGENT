#!/usr/bin/env node
/**
 * 音素**符号普查**（真机探针 · 2026-09-22）
 *
 * 干什么：每语种一批音节（歌词 + `languageOverride`）⇒ 读 `getComputedAttributesForGroup`
 *         拿**引擎实际吐出的音素符号** ⇒ 与 `server/src/phoneme/data.ts`（官方表 + 参考脚本清单 + 引擎实测层）
 *         做**全量差集**，并把结果落盘到 `docs/音素实测-引擎输出.md`。
 *
 * 为什么需要：我们"表外音素直接拒写"的判据靠两份表，**引擎可能吐出两份表都没有的符号** ——
 *   2026-09-22 的 16 音素探针就是这么发现韩语 `dz\`（官方表只有 `dz\h`）的，否则会**误拒合法音素**。
 *   换声库 / 换语言 / 宿主升级后重跑一次，就能确认清单还覆盖得住。
 *
 * 用法：node tools/probe-phoneme-sweep.mjs --make    # 建普查组（写操作，含撤销点）
 *       node tools/probe-phoneme-sweep.mjs           # 只读：读普查组 → 差集 + 落盘
 * 前置：宿主（SV2 2.1.1+）在线、**该组必须有歌手（voice）**、桥已部署（`--make` 需要 run_script）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const { executeOp } = await import(new URL('../server/dist/protocol.js', import.meta.url).href);
const P = await import(new URL('../server/dist/phoneme/index.js', import.meta.url).href);

const MAKE = process.argv.includes('--make');
const GROUP = 'akdagent-phoneme-sweep';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 音节表（每语种一批，覆盖常见声母韵母/拗音/韵尾）—— 想扩就往下加 */
const SWEEP = {
  mandarin: ['ba', 'pa', 'ma', 'fa', 'da', 'ta', 'na', 'la', 'ga', 'ka', 'ha', 'ji', 'qi', 'xi',
    'zha', 'cha', 'sha', 'ra', 'za', 'ca', 'sa', 'duo', 'tuo', 'guo', 'huo', 'jia', 'qia', 'xia',
    'xie', 'ye', 'yao', 'you', 'wei', 'wan', 'wen', 'weng', 'ying', 'yong', 'ai', 'ei', 'ao', 'ou',
    'an', 'en', 'ang', 'eng', 'ong', 'er', 'nv', 'lv', 'ju', 'qu', 'xu', 'yu'],
  japanese: ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so',
    'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho',
    'ma', 'mi', 'mu', 'me', 'mo', 'ya', 'yu', 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', 'n',
    'kya', 'kyu', 'kyo', 'sha', 'shu', 'sho', 'cha', 'chu', 'cho', 'nya', 'nyu', 'nyo',
    'gya', 'gyu', 'gyo', 'ja', 'ju', 'jo', 'bya', 'byu', 'byo', 'pya', 'pyu', 'pyo'],
  cantonese: ['si', 'syu', 'seoi', 'saam', 'sam', 'gwaa', 'gwai', 'neoi', 'zung', 'hok', 'jan',
    'jat', 'nga', 'ngau', 'keoi', 'heoi', 'deoi', 'leoi', 'zeon', 'ceon', 'seon', 'wai', 'waan',
    'jyun', 'tyun', 'dyun', 'm', 'ng', 'a', 'e', 'i', 'o', 'u', 'yu'],
  korean: ['a', 'eo', 'o', 'u', 'eu', 'i', 'ae', 'e', 'ga', 'na', 'da', 'ra', 'ma', 'ba', 'sa',
    'ja', 'cha', 'ka', 'ta', 'pa', 'ha', 'kka', 'tta', 'ppa', 'jja', 'ssa', 'gya', 'nya', 'dya',
    'rya', 'mya', 'bya', 'sya', 'ya'],
  english: ['cat', 'bat', 'hat', 'mat', 'pat', 'rat', 'sat', 'that', 'thank', 'think', 'ship',
    'sheep', 'joy', 'jump', 'zoo', 'zip', 'yes', 'you', 'we', 'wet', 'red', 'bed', 'dog', 'boy',
    'how', 'buy', 'go', 'see', 'food', 'bird', 'father', 'about'],
  spanish: ['perro', 'pero', 'gato', 'casa', 'cinco', 'cena', 'llave', 'ano', 'nino', 'jota',
    'rojo', 'vaca', 'queso', 'gente', 'hijo', 'ayer', 'bueno', 'ciudad', 'hielo', 'fuego'],
};

const items = [];
for (const [L, arr] of Object.entries(SWEEP)) for (const syl of arr) items.push([L, syl]);
const luaItems = '{' + items.map(([L, s]) => '{' + JSON.stringify(s) + ',' + JSON.stringify(L) + '}').join(',') + '}';
console.log('普查音节数：' + items.length + '（' + Object.entries(SWEEP).map(([L, a]) => L + ' ' + a.length).join(' · ') + '）');

if (MAKE) {
  // ⚠️ Lua 里 `[[` 是长字符串的开始 ⇒ 表用 `{ {...} }` 写，别把 JSON.stringify 的数组直接塞进来。
  const code = `
local proj = SV:getProject()
proj:newUndoRecord()
local ed = SV:getMainEditor()
local track = ed:getCurrentTrack()
local Q = SV.QUARTER
local grp = SV:create('NoteGroup')
grp:setName('${GROUP}')
local its = ${luaItems}
for i = 1, #its do
  local nt = SV:create('Note')
  nt:setPitch(60 + (i % 7))
  nt:setLyrics(its[i][1])
  nt:setLanguageOverride(its[i][2])
  nt:setTimeRange((i - 1) * Q, Q)
  grp:addNote(nt)
end
local ref = SV:create('NoteGroupReference')
ref:setTarget(grp)
ref:setTimeOffset(0)
proj:addNoteGroup(grp)
track:addGroupReference(ref)
ed:setCurrentGroup(ref)
return { group = grp:getName(), notes = grp:getNumNotes() }
`;
  const w = await executeOp('run_script', { code, host: 'sv' }, { timeoutMs: 40000, intervalMs: 200 });
  console.log('建普查组：' + JSON.stringify(w && w.result ? w.result : w));
  await sleep(5000);
}

let cmp = null;
for (let i = 0; i < 20; i++) {
  cmp = await executeOp('get_computed_attributes', { host: 'sv', waitMs: 0 }, { timeoutMs: 30000, intervalMs: 200 });
  const withPh = ((cmp && cmp.notes) || []).filter((x) => (x.phonemes || []).length).length;
  process.stdout.write('\r  轮询 ' + (i + 1) + '：有音素 ' + withPh + '/' + items.length + '   ');
  if (withPh >= items.length * 0.95) break;
  await sleep(2500);
}
console.log('');

const notes = (cmp && cmp.notes) || [];
const byLang = {};
const gaps = [];
let emptyNotes = 0;
for (const n of notes) {
  const [want, syl] = items[n.index] || ['?', '?'];
  const syms = (n.phonemes || []).map((p) => p.symbol);
  const langs = [...new Set((n.phonemes || []).map((p) => p.language))];
  if (!syms.length) { emptyNotes++; continue; }
  const L = langs[0] || want;
  byLang[L] = byLang[L] || { symbols: new Set(), syllables: 0, failed: [] };
  byLang[L].syllables++;
  for (const s of syms) {
    byLang[L].symbols.add(s);
    if (!P.isAllowed(s, L, true)) gaps.push({ lang: L, syllable: syl, symbol: s });
  }
  if (langs[0] && langs[0] !== want) byLang[L].failed.push(syl + '(要' + want + ')');
}

console.log('\n== 每语种：引擎实际吐出的符号 ==');
for (const [L, v] of Object.entries(byLang)) {
  console.log('  [' + L + '] 成功音节 ' + v.syllables + ' · 符号 ' + v.symbols.size + ' 个：' + [...v.symbols].sort().join(' '));
  if (v.failed.length) console.log('      ⚠️ 语种被判成别的：' + v.failed.slice(0, 8).join(' ') + (v.failed.length > 8 ? ' …' : ''));
}
console.log('\n空音素音符：' + emptyNotes + '（语种与声库不兼容 / 音节不合法；先查该组有没有歌手）');
const uniq = [...new Map(gaps.map((g) => [g.symbol, g])).values()];
console.log('❌ 差集（引擎在用、我们清单没有）：' + uniq.length + (uniq.length ? '  ' + JSON.stringify(uniq) : ' ✅ 无'));

const md = [];
md.push('# 音素实测 · 引擎实际输出（SV2 普查）', '');
md.push('> 生成：`node tools/probe-phoneme-sweep.mjs`（`--make` 建组后只读复跑）· 2026-09-22 · SV2 2.2.1 · 英文声库 · 组 `' + GROUP + '`', '');
md.push('方法：每语种一批音节（歌词 + `languageOverride`）⇒ 读 `getComputedAttributesForGroup` 的 `phonemes[].symbol`，');
md.push('与 `server/src/phoneme/data.ts`（官方表 + 参考脚本清单 + **引擎实测层**）做差集。');
md.push('', '| 语种 | 成功音节 | 引擎符号数 | 实际吐出的符号 |', '|---|---|---|---|');
for (const [L, v] of Object.entries(byLang)) md.push('| ' + L + ' | ' + v.syllables + ' | ' + v.symbols.size + ' | `' + [...v.symbols].sort().join('` `') + '` |');
md.push('', '## 差集（引擎在用、我们清单没有）', '');
md.push(uniq.length ? uniq.map((g) => '- `' + g.symbol + '`（' + g.lang + ' · 音节 `' + g.syllable + '`）').join('\n') : '✅ 无缺口', '');
md.push('', '## 空音素（' + emptyNotes + ' 个）', '', '语种与声库不兼容或音节不合法；排查先看该组是否有歌手（voice）。', '');
const out = path.join(ROOT, 'docs', '音素实测-引擎输出.md');
fs.writeFileSync(out, md.join('\n'), 'utf8');
console.log('记录已写入 ' + path.relative(ROOT, out));
