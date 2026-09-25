#!/usr/bin/env node
/**
 * 从**两份真源**生成服务端用的音素数据（`server/src/phoneme/data.ts`）
 *
 * 真源 ①：`knowledge/docs/音素表.json` —— 官方 *Phoneme Reference* 抽取（7 张表：语言 → 元音/辅音 + 例词）
 *         用途：**合法性判据**（"表外音素拒写"）+ 候选显示时的例词
 * 真源 ②：参考 JS（默认读留档 `docs/ref-音素替换.js`，可用 `--ref` 指到宿主里的活文件）
 *         —— 用户写的 `音素替换.js`，内含**经验候选分组**：6 语言的 Vowels[6 类] / Vowels0（参考顺序）/ Consonants0
 *         用途：**近似候选**（元音取同类、辅音取字母近似），与那份脚本的行为保持一致
 *
 * 为什么生成而不是运行时读：MCP server 跑在打包后的 `resources/server/dist`，
 * 读 `resources/knowledge/**` 要走平台相关路径；把数据**编译进 dist** 最稳，且生成器保证两份真源不漂。
 *
 * 用法：node tools/gen-phoneme-data.cjs [--ref <音素替换.js>] [--check]
 *   `--check` = 只比对现有产物是否与真源一致（CI 用），不一致 exit 1
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const OPT = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const REF = OPT('--ref', path.join(ROOT, 'docs', 'ref-音素替换.js'));
const TABLE = path.join(ROOT, 'knowledge', 'docs', '音素表.json');
const OUT = path.join(ROOT, 'server', 'src', 'phoneme', 'data.ts');

// ── ① 官方表 → 语言分组（元音/辅音 + 例词）────────────────────────────
const table = JSON.parse(fs.readFileSync(TABLE, 'utf8'));
const langs = [];
for (const t of table.tables) {
  const name = String(t.language);
  const vowels = [], consonants = [];
  for (const g of t.groups) {
    const isV = /vowel/i.test(g.title);          // "Vowels…" / "Vowels and Semivowels…"
    for (const r of g.rows) {
      const item = { p: r.phoneme, cat: r.category || null, ex: r.example || null };
      (isV ? vowels : consonants).push(item);
    }
  }
  langs.push({ table: name, key: keyOf(name), vowels, consonants });
}

/** 官方表名 → 语言键（与参考 JS 的 languageArr 对齐；Common 单列） */
function keyOf(name) {
  const n = name.toLowerCase();
  if (n.includes('common')) return 'common';
  if (n.includes('english')) return 'english';
  if (n.includes('japanese')) return 'japanese';
  if (n.includes('mandarin')) return 'mandarin';
  if (n.includes('cantonese')) return 'cantonese';
  if (n.includes('spanish')) return 'spanish';
  if (n.includes('korean')) return 'korean';
  return n.replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
}

// ── ② 参考 JS → 经验候选分组 ─────────────────────────────────────────
const js = fs.readFileSync(REF, 'utf8');
function grab(name) {
  const m = new RegExp('var\\s+' + name + '\\s*=\\s*(\\[\\s*\\[[\\s\\S]*?\\]\\s*\\])\\s*\\n').exec(js);
  if (!m) throw new Error('从参考 JS 里找不到 ' + name);
  // eslint-disable-next-line no-eval
  return eval(m[1]);                                  // 纯字面量，安全
}
const Vowels = grab('Vowels');        // [6 类][6 语言] -> 该类的音素
const Vowels0 = grab('Vowels0');      // [6 语言] -> 参考顺序（全集）
const Consonants0 = grab('Consonants0'); // [6 语言] -> 辅音全集（按字母近似用）
const LANG_ARR = (/var\s+languageArr\s*=\s*(\[[^\]]*\])/.exec(js) || [])[1];
const langOrder = LANG_ARR ? eval(LANG_ARR) : ['mandarin', 'english', 'japanese', 'cantonese', 'spanish', 'korean'];

const near = {};
langOrder.forEach((L, li) => {
  near[L] = {
    vowelClasses: Vowels.map((cls) => (cls[li] || []).filter((x) => typeof x === 'string')),
    vowelOrder: (Vowels0[li] || []).filter((x) => typeof x === 'string'),
    consonants: (Consonants0[li] || []).filter((x) => typeof x === 'string'),
  };
});

// ── ②b 合并「我们的修订层」（`tools/phoneme-overrides.cjs`；原 js 逐字不动，修订单独一层、可回退）──
const OV = require('./phoneme-overrides.cjs');
const applied = [];
// ②b-1 引擎实测音素 ⇒ 补进**官方表**（这样 isAllowed/classify/candidates 都认它）
const addedSymbols = [];
for (const [L, spec] of Object.entries(OV.addAllowedSymbols || {})) {
  const t = langs.find((x) => x.key === L);
  if (!t) { console.error('  ⚠️ addAllowedSymbols 里的语言 ' + L + ' 不在官方表里，已跳过'); continue; }
  for (const [kind, items] of Object.entries(spec || {})) {
    if (!Array.isArray(t[kind])) { console.error('  ⚠️ 未知分组 ' + kind + '（只认 vowels / consonants）'); continue; }
    for (const p of items) {
      if (t[kind].some((x) => x.p.toLowerCase() === String(p).toLowerCase())) continue;
      t[kind].push({ p: String(p), cat: 'engine-observed', ex: null, observed: true });
      addedSymbols.push('  + ' + L + '/' + kind + ' ← ' + p + '（引擎实测）');
    }
  }
}
for (const [L, clsMap] of Object.entries(OV.addToVowelClasses || {})) {
  if (!near[L]) { console.error('  ⚠️ 修订层里的语言 ' + L + ' 不在参考 js 里，已跳过'); continue; }
  for (const [k, items] of Object.entries(clsMap)) {
    const idx = Number(k);
    if (!(idx >= 0 && idx < 6)) { console.error('  ⚠️ 族号越界：' + L + '[' + k + ']'); continue; }
    const cur = near[L].vowelClasses[idx] || (near[L].vowelClasses[idx] = []);
    for (const it of items) {
      if (cur.some((x) => String(x).toLowerCase() === String(it).toLowerCase())) continue;
      cur.push(it);
      applied.push('  + ' + L + ' 族' + idx + ' ← ' + it);
    }
  }
}

// ── ②c `--audit`：打印"落不进任何族"的音素（修订依据，供人工听感复核）──
if (argv.includes('--audit')) {
  console.log('== Vowels0 里"不在任何族"的音素（原脚本会给空候选）==');
  const pre = {};                                       // 用**修订前**的数据审计
  langOrder.forEach((L, li) => {
    const cls = Vowels.map((c) => (c[li] || []).filter((x) => typeof x === 'string'));
    const uni = new Set(); cls.forEach((c) => c.forEach((x) => uni.add(x)));
    const v0 = (Vowels0[li] || []).filter((x) => typeof x === 'string');
    const orphan = v0.filter((x) => !uni.has(x));
    if (orphan.length) console.log('  ' + L.padEnd(10) + orphan.join(' '));
  });
  console.log('\n== 本次修订层生效 ==');
  if (applied.length || addedSymbols.length) {
    addedSymbols.forEach((x) => console.log(x));
    applied.forEach((x) => console.log(x));
  } else console.log('  （无）');
  console.log('\n== 官方表 vs 参考 js 的辅音差集（「拒写边界」待用户裁定）==');
  langs.forEach((l) => {
    const li = langOrder.indexOf(l.key);
    if (li < 0) return;
    const c0 = (Consonants0[li] || []).filter((x) => typeof x === 'string');
    const off = new Set(l.consonants.map((x) => x.p.toLowerCase()));
    const onlyC0 = c0.filter((x) => !off.has(x.toLowerCase()));
    const onlyOff = [...off].filter((x) => !c0.some((y) => y.toLowerCase() === x));
    if (onlyC0.length || onlyOff.length) {
      console.log('  ' + l.key.padEnd(10) + '只在参考表: ' + (onlyC0.join(' ') || '—') + '   |  只在官方表: ' + (onlyOff.join(' ') || '—'));
    }
  });
}

// ── ③ 产出 TS ────────────────────────────────────────────────────────
const banner = [
  '/**',
  ' * ⚠️ 本文件由 `tools/gen-phoneme-data.cjs` 生成 —— **别手改**。',
  ' *',
  ' * 真源 ①（合法性 + 例词）：`knowledge/docs/音素表.json`（官方 Phoneme Reference 抽取）',
  ' * 真源 ②（近似候选分组）：`docs/ref-音素替换.js`（用户写的参考脚本，留档副本；可用 --ref 指到宿主里的活文件）',
  ' *',
  ' * 改真源后重跑：node tools/gen-phoneme-data.cjs（然后 npm --prefix server run build）',
  ' */',
  '',
  'export interface PhonemeItem { p: string; cat: string | null; ex: string | null; observed?: boolean }',
  'export interface LangTable { table: string; key: string; vowels: PhonemeItem[]; consonants: PhonemeItem[] }',
  'export interface NearGroup { vowelClasses: string[][]; vowelOrder: string[]; consonants: string[] }',
  '',
  '/** 官方表：语言键 → { 官方表名, 元音(含例词), 辅音(含例词) } */',
  'export const LANG_TABLES: Record<string, LangTable> = ' + JSON.stringify(
    Object.fromEntries(langs.map((l) => [l.key, l])), null, 2).replace(/\n/g, '\n') + ';',
  '',
  '/** 参考 JS 的 6 语言顺序（mandarin/english/japanese/cantonese/spanish/korean） */',
  'export const LANG_ORDER: string[] = ' + JSON.stringify(langOrder) + ';',
  '',
  '/** 经验近似分组：语言键 → { 元音 6 类(同 JS), 元音参考顺序, 辅音全集 } */',
  'export const NEAR_GROUPS: Record<string, NearGroup> = ' + JSON.stringify(near, null, 2).replace(/\n/g, '\n') + ';',
  '',
].join('\n');

if (argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur === banner) { console.log('✅ 音素数据与真源一致'); process.exit(0); }
  console.error('❌ 音素数据与真源不一致 —— 重跑：node tools/gen-phoneme-data.cjs');
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, banner, 'utf8');
const nv = langs.reduce((a, l) => a + l.vowels.length + l.consonants.length, 0);
console.log('wrote ' + path.relative(ROOT, OUT) + '\n  语言表 ' + langs.length + ' 张 / 音素 ' + nv + ' 个 · 近似分组 ' + Object.keys(near).length + ' 组');
