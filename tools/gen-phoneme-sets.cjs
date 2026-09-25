#!/usr/bin/env node
/**
 * 从 `knowledge/docs/音素表.json`（由 tools/extract-phoneme-table.cjs 从官方页面抽出）生成
 * **按语言的音素类别表 / 辅音集**，供 Node 侧（未来的 A：辅音抢时间）与文档使用。
 *
 * 用法：node tools/gen-phoneme-sets.cjs [--check]
 * 产物：server/src/lyric/phoneme-sets.ts（**自动生成，别手改**）
 *
 * 类别归并（官方 Category → 我们的大类）：
 *   Vowel, Diphthong            → vowel
 *   Semivowel                  → glide（半元音：/w/ /j/ 等，作韵头时也算"前置音"）
 *   Coda                       → coda（韵尾，中文 phoneset 专有）
 *   Stop, Affricate, Fricative, Aspirate, Nasal, Liquid → consonant（**dur[0] 要压的对象就在这几类**）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', '音素表.json');
const OUT = path.join(ROOT, 'server', 'src', 'lyric', 'phoneme-sets.ts');

const BIG = {
  Vowel: 'vowel', Diphthong: 'vowel', Semivowel: 'glide', Coda: 'coda',
  Stop: 'consonant', Affricate: 'consonant', Fricative: 'consonant',
  Aspirate: 'consonant', Nasal: 'consonant', Liquid: 'consonant',
};

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const langs = {};
for (const t of data.tables) {
  const entries = [];
  for (const g of t.groups) {
    for (const r of g.rows) {
      entries.push({ phoneme: r.phoneme, category: r.category || null, big: BIG[r.category] || (r.category ? 'other' : 'special'), example: r.example || null, description: r.description || null });
    }
  }
  langs[t.language] = entries;
}

const cons = (name) => (langs[name] || []).filter((e) => e.big === 'consonant').map((e) => e.phoneme);
const body = `/**
 * **按语言的音素类别表 / 辅音集**（自动生成，别手改）
 *
 * 生成：\`node tools/gen-phoneme-sets.cjs\`（源 = \`knowledge/docs/音素表.json\` = 官方 *Phoneme Reference* 页面抽取）
 * 用途：① 判"某个音素是不是辅音"（**按语言**，比跨语种粗集准）
 *      ② A（短音符的辅音抢前一个音符）里定位"要压 dur 的那一项"
 *      ⚠️ 优先用宿主的计算属性判辅音（SV2 \`activity\` 非 null），**这张表是回退依据**（尤其 SV1）。
 */
export interface PhonemeEntry {
  phoneme: string;
  /** 官方 Category（Vowel / Diphthong / Stop / Affricate / Fricative / Aspirate / Nasal / Liquid / Semivowel / Coda） */
  category: string | null;
  /** 归并后的大类：vowel · glide · coda · consonant · other · special */
  big: 'vowel' | 'glide' | 'coda' | 'consonant' | 'other' | 'special';
  example: string | null;
  description: string | null;
}

/** 语言（phoneset）→ 音素条目。键与官方表一致：English - ARPABET / Japanese - ROMAJI / Mandarin Chinese - XSAMPA … */
export const PHONEME_TABLES: Record<string, PhonemeEntry[]> = ${JSON.stringify(langs, null, 2)};

/** 各语言的**辅音集**（Stop / Affricate / Fricative / Aspirate / Nasal / Liquid） */
export const CONSONANTS_BY_LANGUAGE: Record<string, string[]> = ${JSON.stringify(Object.fromEntries(Object.keys(langs).map((k) => [k, cons(k)])), null, 2)};

/** 判辅音（按语言；大小写敏感——SV 音素表区分大小写，如 \`A\` 是元音、\`a\` 也是元音） */
export function isConsonant(phoneme: string, language?: string): boolean {
  if (language && CONSONANTS_BY_LANGUAGE[language]) return CONSONANTS_BY_LANGUAGE[language].includes(phoneme);
  return Object.values(CONSONANTS_BY_LANGUAGE).some((list) => list.includes(phoneme));
}
`;

if (process.argv.includes('--check')) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === body;
  console.log((same ? '✅ 一致' : '❌ 不一致 ⇒ 重新生成') + '（' + Object.keys(langs).length + ' 种语言）');
  process.exit(same ? 0 : 1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body, 'utf8');
console.log('✅ 已生成 ' + path.relative(ROOT, OUT));
for (const k of Object.keys(langs)) {
  const c = cons(k);
  console.log('- ' + k + '：' + langs[k].length + ' 条 · 辅音 ' + c.length + ' 个 → ' + c.join(' '));
}
