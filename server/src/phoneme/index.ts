/**
 * 音素替换 —— 纯逻辑层（候选 / 分类 / 校验 / 批量替换）
 *
 * 设计取自用户写的参考脚本 `音素替换.js`（留档 `docs/ref-音素替换.js`，2026-09-22）：
 *   · **元音**：按"同类"给候选 —— 该音素出现在哪几个元音类里，就把这几类的并集按参考顺序排出（`sortDedupe`）
 *   · **辅音**：按"字母近似"给候选 —— 取音素里的字母（小写、仅 a-z、去重、排序），
 *     在本语言辅音表里找"小写形式含任一字幕"的项（保持表内顺序）
 *   · 参考 JS 是**交互式**（宿主弹出 ComboBox 逐音素选）；我们把它拆成
 *     **查（sv_list_phonemes）→ 替换（sv_replace_phonemes）** 两步，供对话使用
 *
 * 与参考 JS 的**已知差异**（如实记录）：
 *   ① JS 的候选数据是它内嵌的**经验分组**（6 语言 × 元音 6 类 + 参考顺序 + 辅音全集），我们把它抽进
 *      `data.ts` 的 `NEAR_GROUPS`（同一份数据，逐字抽出，可 `tools/gen-phoneme-data.cjs --check` 复核）；
 *   ② **合法性**另以官方表为准（`knowledge/docs/音素表.json` → `LANG_TABLES`）：官方 7 张表里的音素才算"表内"，
 *      用户裁定「**表外音素直接拒写**」；`cl` / `sil` / `br` 属 Common，任何语言都放行。
 */
import { LANG_TABLES, LANG_ORDER, NEAR_GROUPS } from "./data.js";

export { LANG_TABLES, LANG_ORDER, NEAR_GROUPS };

export type PhKind = "vowel" | "consonant" | "common" | "unknown";

const low = (x: unknown) => String(x ?? "").trim().toLowerCase();

/** 宿主 `computed.phonemes[].language` 与实际声库语种名的归一（也认官方表名，如 `English - ARPABET`） */
export function normLang(x: unknown): string | null {
  const n = low(x);
  if (!n) return null;
  for (const L of LANG_ORDER) if (n.includes(L)) return L;
  if (n.includes("common")) return "common";
  return null;
}

/** Common Phonemes（`cl` 长音 · `sil` 静音 · `br` 呼吸）—— 任何语言都合法 */
export function commonSet(): Set<string> {
  const t = LANG_TABLES.common;
  const s = new Set<string>();
  if (t) for (const it of [...t.vowels, ...t.consonants]) s.add(it.p);
  return s;
}

/** 某语言的官方表集合（元音 / 辅音） */
export function tableSets(lang: string | null): { vowels: Set<string>; consonants: Set<string>; xsampa: Set<string> } {
  const t = lang ? LANG_TABLES[lang] : undefined;
  const all = [...(t?.vowels ?? []), ...(t?.consonants ?? [])];
  return {
    vowels: new Set((t?.vowels ?? []).map((x) => x.p)),
    consonants: new Set((t?.consonants ?? []).map((x) => x.p)),
    /* 🆕 2026-11-02（SV2 2.3.0）：官方表同时给出 X-SAMPA 写法；用户切到 X-SAMPA 模式时写的就是这一套
     *   ⇒ 合法性判据要把两套都认，否则「表外音素拒写」会误伤新模式下合法的 token。 */
    /* 注意：`isAllowed` 用 low() 归一后比较，这里也要**统一小写**（否则 `M+` 这类大写 X-SAMPA 永远匹配不上）。 */
    xsampa: new Set(all.map((x) => x.xs).filter((x): x is string => !!x).map((x) => x.toLowerCase())),
  };
}

/** 该音素是否在**参考 js 的辅音清单**里（两份数据不一致时以"任一份认它"为准，见 isAllowed 说明） */
export function inNearConsonants(p: string, lang: string | null): boolean {
  const key = low(p);
  const near = lang ? NEAR_GROUPS[lang] : undefined;
  return !!near && near.consonants.some((c) => low(c) === key);
}

/** 该音素是否在**参考 js 的元音清单**里（族数据 ∪ Vowels0 参考顺序） */
export function inNearVowels(p: string, lang: string | null): boolean {
  const key = low(p);
  const near = lang ? NEAR_GROUPS[lang] : undefined;
  if (!near) return false;
  if (near.vowelOrder.some((c) => low(c) === key)) return true;
  return near.vowelClasses.some((cls) => cls.some((c) => low(c) === key));
}

/** 该音素在官方表里属于哪一类（供展示与校验）
 *  ⚠️ 官方表与参考 js 的清单**并不完全一致**（korean `pp`/`tt` 只在参考表；官方表另有 5 个它们没有）
 *     ⇒ 分类要**两份都认**，否则普通话 `d`（官方 XSAMPA 无）这类会被误判成"未知"再退化错分支。 */
export function classify(p: string, lang: string | null): PhKind {
  const key = low(p);
  if (commonSet().has(key)) return "common";
  const { vowels, consonants } = tableSets(lang);
  if (consonants.has(key) || inNearConsonants(key, lang)) return "consonant";
  if (vowels.has(key) || inNearVowels(key, lang)) return "vowel";
  // 语言未知 / 该语言两份清单里都没有 ⇒ 看全语言（并集），仍然认得出来
  for (const L of LANG_ORDER) {
    const s = tableSets(L);
    if (s.consonants.has(key) || inNearConsonants(key, L)) return "consonant";
    if (s.vowels.has(key) || inNearVowels(key, L)) return "vowel";
  }
  /* 🆕 2026-11-02（2.3.0 两套写法）：X-SAMPA 的 token 在"简化音素"表里查不到
   *   ⇒ 先映射成同一条目的简化写法再判一次（否则 SV1 上传来的 X-SAMPA 会被判 unknown）。 */
  const pair = spellingPair(p, lang);
  if (pair) {
    const k2 = low(pair.phoneme);
    const s2 = tableSets(lang);
    if (s2.consonants.has(k2)) return "consonant";
    if (s2.vowels.has(k2)) return "vowel";
  }
  return "unknown";
}

/** 该音素在**哪些语言**的清单里（官方表 ∪ 参考脚本清单；不含 common）—— 用于"跨语种/外来音素"显示 */
export function languagesOf(p: string): string[] {
  const key = low(p);
  const out: string[] = [];
  for (const L of LANG_ORDER) {
    const s = tableSets(L);
    if (s.vowels.has(key) || s.consonants.has(key) || inNearConsonants(key, L) || inNearVowels(key, L)) out.push(L);
  }
  return out;
}

/**
 * 这些 token 分别落在哪些语言的表里（**并集**，不含 common）。
 * ⚠️ **别拿它判"混语种"** —— 很多音素是**多语种共有**的（`o` 同时属于 mandarin/cantonese/japanese/spanish/korean），
 *    按"出现在哪些表里"判会把单语种也误判成混语种（2026-09-22 实测踩到）。判"外来音素"请用 `foreignTokens`。
 */
export function languagesOfTokens(tokens: string[]): string[] {
  const s = new Set<string>();
  for (const t of tokens) for (const L of languagesOf(t)) s.add(L);
  return [...s].sort();
}

/**
 * **外来音素**：不在该音符语种的表里、也不属 common 的 token。
 * 用途 = 混语种提醒的正确判据（用户 2026-09-22：「**修改语种会修改该音符所有音素**，只改一个时记得**提醒拆分**」）。
 * 语种未知（`lang = null`）⇒ 无法判定，返回空数组（不误报）。
 */
export function foreignTokens(tokens: string[], lang: string | null): string[] {
  if (!lang) return [];
  return tokens.filter((t) => !isAllowed(t, lang, false));
}

/** 「表内」判据：**官方表 ∪ 参考 js 的清单**（该语言）+ Common。
 *  ⚠️ 两份数据不一致（korean `pp`/`tt` 只在参考表、官方表另有 5 个）⇒ 默认**取并集**（宁可放行已知清单里的），
 *     真要用"只认官方表"的严格口径可传 `strict:"official"`。用户 2026-09-22 裁定「表外音素直接拒写」= 走这里。 */
export function isAllowed(p: string, lang: string | null, crossLanguage = false, strict: "union" | "official" = "union"): boolean {
  const key = low(p);
  if (!key) return false;
  if (commonSet().has(key)) return true;
  const nearOk = (L: string | null) => strict === "official" ? false : (inNearConsonants(key, L) || inNearVowels(key, L));
  if (crossLanguage) {
    for (const L of LANG_ORDER) {
      const s = tableSets(L);
      if (s.vowels.has(key) || s.consonants.has(key) || s.xsampa.has(key) || nearOk(L)) return true;
    }
    return false;
  }
  const s = tableSets(lang);
  return s.vowels.has(key) || s.consonants.has(key) || s.xsampa.has(key) || nearOk(lang);
}

/**
 * **两套写法**（2026-11-02，SV2 2.3.0 起）：
 *   · 简化音素（2.3.0 默认，如 mandarin `zh` / `ir`）—— 官方表的 `phoneme` 列
 *   · X-SAMPA（SV1 与 SV2 < 2.3.0 的写法，2.3.0 也可切换，如 `ts\\` / `i\\`）—— 官方表的 `xsampa` 列
 * ⚠️ **SV1 没有更新、仍是 X-SAMPA**（用户 2026-11-02 提醒）⇒ 判据/写回要按"该宿主/该音符实际用的那套"来，
 *    不能一律当简化音素处理；两套在 `isAllowed` 里都算合法。
 */
export type PhonemeStyle = "simplified" | "xsampa" | "unknown";

function langItems(lang: string | null) {
  const t = lang ? LANG_TABLES[lang] : undefined;
  return t ? [...t.vowels, ...t.consonants] : [];
}

/** 同一音素的两套写法（找不到就 null）。命中 `phoneme` 或 `xsampa` 任一列都算。 */
export function spellingPair(p: string, lang: string | null): { phoneme: string; xsampa: string | null } | null {
  const key = low(p);
  for (const it of langItems(lang)) {
    if (low(it.p) === key) return { phoneme: it.p, xsampa: it.xs ?? null };
    if (it.xs && low(it.xs) === key) return { phoneme: it.p, xsampa: it.xs };
  }
  return null;
}

/** 这个 token 在该语言里属于哪套写法（同形时按简化音素算） */
export function styleOf(p: string, lang: string | null): PhonemeStyle {
  const key = low(p);
  for (const it of langItems(lang)) {
    if (low(it.p) === key) return "simplified";
    if (it.xs && low(it.xs) === key) return "xsampa";
  }
  return "unknown";
}

/** 把 token 换成目标写法；换不了（不在表里 / 没有对应写法）就原样返回 */
export function toStyle(p: string, lang: string | null, style: PhonemeStyle): string {
  if (style !== "xsampa" && style !== "simplified") return p;
  const pair = spellingPair(p, lang);
  if (!pair) return p;
  return style === "xsampa" ? (pair.xsampa ?? p) : pair.phoneme;
}

/**
 * **没有全局开关**（2026-11-02 复核：宿主设置里没有"X-SAMPA 音素"项，脚本 API 也没有设置接口）
 * ⇒ 新写 / 空串时按**宿主版本**给默认写法：
 *   · SV1（1.x）与 SV2 < 2.3.0 —— 历来就是 X-SAMPA
 *   · SV2 ≥ 2.3.0（versionNumber ≥ 131840）—— 默认简化音素
 * 有现成 token 时**永远以实际 token 为准**（detectStyle），不用这个默认值。
 */
export const SV_2_3_0_VERSION = 131840;

export function defaultStyleForHost(hostVersionNumber: number | null | undefined, isSv2?: boolean | null): PhonemeStyle {
  if (isSv2 === false) return "xsampa";
  const n = Number(hostVersionNumber ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "simplified";
  return n >= SV_2_3_0_VERSION ? "simplified" : "xsampa";
}

/** 一串 token 整体偏哪套写法（多数派；平票/都不认识 ⇒ simplified 优先，最后 unknown） */
export function detectStyle(tokens: string[], lang: string | null): PhonemeStyle {
  let s = 0;
  let x = 0;
  for (const tk of tokens) {
    const st = styleOf(tk, lang);
    if (st === "simplified") s++;
    else if (st === "xsampa") x++;
  }
  if (x > s) return "xsampa";
  if (s > 0) return "simplified";
  return "unknown";
}

/** 照参考 JS：小写 → 只留 a-z → 去重 → 按字符升序 */
export function lettersOf(p: string): string[] {
  const s = low(p);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of s) {
    if (ch >= "a" && ch <= "z" && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  }
  return out.sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0));
}

/** 照参考 JS 的 `sortAndDeduplicate`：去重；在参考顺序里的按参考顺序排，其余按原序殿后 */
export function sortDedupe(list: string[], order: string[]): string[] {
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const x of list) if (x && !seen.has(x)) { seen.add(x); uniq.push(x); }
  const pos = new Map<string, number>();
  order.forEach((x, i) => { if (!pos.has(x)) pos.set(x, i); });
  const inRef = uniq.filter((x) => pos.has(x)).sort((a, b) => (pos.get(a)! - pos.get(b)!));
  const rest = uniq.filter((x) => !pos.has(x));
  return [...inRef, ...rest];
}

export interface CandResult { kind: PhKind; list: string[]; note?: string }

/**
 * 近似候选（**照参考 JS 的两条路**）：
 *   · 辅音 ⇒ 字母近似（本语言辅音全集里，小写含任一字幕的项，保持表内顺序）
 *   · 元音 ⇒ 同类合并（含它的那几个元音类的并集，按参考顺序排）
 * 语言表缺失时退化为"官方表里该语言的全部同类音素"（并在 note 里说明）。
 */
export function candidatesFor(p: string, lang: string | null): CandResult {
  const key = low(p);
  const kind = classify(key, lang);
  const near = lang ? NEAR_GROUPS[lang] : undefined;

  if (kind === "consonant" && near && near.consonants.length) {
    if (near.consonants.some((c) => low(c) === key)) {
      const letters = lettersOf(key);
      const seen = new Set<string>();
      const list: string[] = [];
      for (const c of near.consonants) {
        const lc = low(c);
        if (lc === key) continue;                       // 自己不算候选
        if (letters.some((L) => lc.includes(L)) && !seen.has(lc)) { seen.add(lc); list.push(c); }
      }
      if (list.length) return { kind, list, note: "辅音：按字母近似匹配（同参考脚本）" };
      // ⚠️ 没有字母近亲（如普通话 `x`：只有它自己含 x）⇒ 你的 js 这时 ComboBox 里也只有它自己，
      //    等于没得选；这里退化成"本语言全部辅音"（排序阶段按字母重合度+表内顺序给序）
      const all = [...tableSets(lang).consonants];
      return { kind, list: all, note: "辅音：本语言没有字母近亲 ⇒ 列出该语言全部辅音（参考脚本此时只有一个选项）" };
    }
  }

  if (kind === "vowel" && near && near.vowelClasses.length) {
    const hit: string[] = [];
    for (const cls of near.vowelClasses) {
      if (cls.some((x) => low(x) === key)) for (const x of cls) if (low(x) !== key) hit.push(x);
    }
    if (hit.length) {
      return {
        kind,
        list: sortDedupe(hit, near.vowelOrder),
        note: "元音：取同类音素并按参考顺序（同参考脚本）",
      };
    }
  }

  // 退化：用官方表里该语言（或全表）的同类音素
  const s = tableSets(lang);
  if (kind === "consonant" || kind === "vowel") {
    const pool = kind === "consonant" ? [...s.consonants] : [...s.vowels];
    if (pool.length) return { kind, list: pool, note: "退化：官方表里该语言的全部同类音素（参考脚本的分类数据里没有它）" };
    const all: string[] = [];
    for (const L of LANG_ORDER) {
      const t = tableSets(L);
      all.push(...(kind === "consonant" ? [...t.consonants] : [...t.vowels]));
    }
    return { kind, list: [...new Set(all)], note: "退化：所有语言表的同类音素并集" };
  }
  // 真未知（两份清单都没有）⇒ 不硬猜，如实报空
  return { kind, list: [], note: "该音素不在任何语言的清单里（官方表与参考脚本都没有）—— 请先确认拼写或语种" };
}

export function tokenize(str: string | null | undefined): string[] {
  return String(str ?? "").split(/\s+/).filter(Boolean);
}

/** 该音素属于本语言的哪几个族（0..5）；不在族里 ⇒ 空数组
 *  ⚠️ 族数据里有**大写音素**（`A`/`AU`/`U`/`N`/`E`…）⇒ 必须一律小写比对（2026-09-22 踩过：
 *     大写不归一 ⇒ 普通话 `A` 只认到族 0，漏掉族 4） */
export function classesOf(p: string, lang: string | null): number[] {
  const key = low(p);
  const near = lang ? NEAR_GROUPS[lang] : undefined;
  if (!near) return [];
  const out: number[] = [];
  near.vowelClasses.forEach((cls, k) => { if (cls.some((x) => low(x) === key)) out.push(k); });
  return out;
}

export interface RankedCand {
  p: string;
  score: number;              // 0..1，越大越像
  sharedClasses: number[];    // 与本音素共享的族（元音用）
  sharedLetters: string[];    // 与本音素共享的字母（辅音用）
  sameLang: boolean;
  ex?: string | null;
  why: string;                // 一句话说明"为什么排这儿"（给人看/给模型解释用）
}

/**
 * **相似度排名**（用户 2026-09-22：「你实现的是该音素族相似性比较高的前几个选项」；`topN` 由实现自主定）
 *
 * ⚠️ 这是**启发式**，不是用户原始数据里的现成排序（他的 js 是"尽量列全"，顺序是人工排的族内顺序）：
 *   · **元音**：score = 共享族数 / 并集族数（Jaccard）；同分时按族内参考顺序（`vowelOrder`）**邻近度**决胜
 *   · **辅音**：score = 共享字母数 / 本音素字母数（沿用 JS 的"字母近似"直觉）；同分按表内顺序
 *   · 同语言候选默认优先（跨语种要显式开）
 *
 * **候选条数 = 自适应**（`opts.topN` 省略时）：
 *   · 有相似信息（最高分 > 0）⇒ 取 **score ≥ 最高分 × 0.5** 的那一档，**至少 3 个、至多 10 个**
 *     （只给"同一档像的"，不拿明显不像的凑数）
 *   · 无相似信息（最高分 = 0，如"落不进任何族"的音素）⇒ 给同语言清单的**前 6 个**，并在 note 里如实说明
 *   · 传 `topN: n` ⇒ 固定 n 条；传 `topN: 0` ⇒ 全列（调试/核对用）
 */
export function rankCandidates(
  p: string,
  lang: string | null,
  opts: { topN?: number; crossLanguage?: boolean; kind?: PhKind } = {},
): RankedCand[] {
  const key = low(p);
  const kind = opts.kind ?? classify(key, lang);
  const pool = candidatesFor(key, lang).list;
  const tgtClasses = classesOf(key, lang);
  const order = (lang && NEAR_GROUPS[lang]?.vowelOrder) || [];
  const ordIdx = new Map<string, number>();
  order.forEach((x, i) => { if (!ordIdx.has(x)) ordIdx.set(x, i); });
  // 官方表顺序（元音在前、辅音在后）—— 元音的参考顺序里没有它时（辅音就是这样）拿它当次序基准
  const tblIdx = new Map<string, number>();
  if (lang && LANG_TABLES[lang]) {
    [...LANG_TABLES[lang].vowels, ...LANG_TABLES[lang].consonants].forEach((it, i) => {
      const k = low(it.p);
      if (!tblIdx.has(k)) tblIdx.set(k, i);
    });
  }
  const idxOf = (q: string): number => {
    const k = low(q);
    if (ordIdx.has(k)) return ordIdx.get(k)!;
    if (tblIdx.has(k)) return tblIdx.get(k)!;
    return 1e6;
  };
  const tgtIdx = idxOf(key);
  const tgtLetters = lettersOf(key);
  const table = tableSets(lang);
  const exOf = (q: string): string | null => {
    const t = lang ? LANG_TABLES[lang] : undefined;
    const hit = [...(t?.vowels ?? []), ...(t?.consonants ?? [])].find((it) => low(it.p) === low(q));
    return hit?.ex ?? null;
  };

  const rows: RankedCand[] = [];
  // ⚠️ **语种未知**（SV1 没有 computed，用户也没显式给 language、音符也没 languageOverride）时**不做语种过滤**：
  //    否则 `tableSets(null)` 为空 ⇒ sameLang 恒 false ⇒ 候选被滤空 ⇒ 工具会误报"无候选"（2026-09-22 真机 SV1 上发现）
  const unknownLang = !lang;
  for (const q of pool) {
    if (low(q) === key) continue;                             // 自己不进候选
    const sameLang = table.vowels.has(low(q)) || table.consonants.has(low(q)) ||
      inNearConsonants(q, lang) || inNearVowels(q, lang);   // ⚠️ **两份清单都算"本语言"**：
      //    只查官方表会把 korean `M_`/`pp`/`tt` 这类"只在参考 js 清单里"的候选误过滤掉（2026-09-22 实测：korean `w` 因此报无候选）
    if (!opts.crossLanguage && !sameLang && !unknownLang) continue;
    let score = 0, why = "";
    const sharedClasses = classesOf(q, lang);
    const inter = sharedClasses.filter((k) => tgtClasses.includes(k));
    const sharedLetters = lettersOf(q).filter((L) => tgtLetters.includes(L));
    if (kind === "consonant") {
      score = tgtLetters.length ? sharedLetters.length / tgtLetters.length : 0;
      why = sharedLetters.length ? "共享字母 " + sharedLetters.join("") : "字母不重合（无相近信息）";
    } else {
      // Jaccard：共享族数 / 并集族数 —— 比"共享数/自身族数"更能区分（后者会大片并列 1.0）
      const union = new Set<number>([...sharedClasses, ...tgtClasses]);
      score = union.size ? inter.length / union.size : 0;
      why = inter.length
        ? "共享族 #" + inter.join(",#") + "（" + inter.length + "/" + union.size + " 族）"
        : "无同族（无相近信息）";
    }
    rows.push({ p: q, score: Math.round(score * 1000) / 1000, sharedClasses: inter, sharedLetters, sameLang, ex: exOf(q), why });
  }
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 同分时**官方表成员优先**（真机依据 2026-09-22：引擎 T2P 原生吐的就是官方写法 ——
    //   韩语 `ppa→p_t`、`tta→t_t`、`kka→k_t`；参考脚本里的 `pp`/`tt` 是另一种**可接受**的写法，
    //   实测写 `pp 6` 后 computed 就是 `pp 6`（引擎不归一化）⇒ 两种都能写，但候选先给官方的）
    const oa = table.vowels.has(low(a.p)) || table.consonants.has(low(a.p));
    const ob = table.vowels.has(low(b.p)) || table.consonants.has(low(b.p));
    if (oa !== ob) return oa ? -1 : 1;
    const da = Math.abs(idxOf(a.p) - tgtIdx);
    const db = Math.abs(idxOf(b.p) - tgtIdx);
    if (da !== db) return da - db;
    if (a.sameLang !== b.sameLang) return a.sameLang ? -1 : 1;
    return a.p < b.p ? -1 : a.p > b.p ? 1 : 0;
  });
  // 条数策略：显式 topN 优先；省略 ⇒ 自适应（见函数头说明）
  if (opts.topN !== undefined) return opts.topN > 0 ? rows.slice(0, opts.topN) : rows;
  if (!rows.length) return rows;
  const max = rows[0].score;
  if (max <= 0) return rows.slice(0, 6);                     // 无相似信息 ⇒ 短清单，别拿 0 分凑数
  const keep = rows.filter((r) => r.score >= max * 0.5);
  const n = Math.min(10, Math.max(3, keep.length));
  return rows.slice(0, n);
}


export interface ValidateResult {
  ok: boolean;
  bad: string[];
  suggestions: Record<string, string[]>;
  crossLanguageNeeded: Record<string, string[]>;
}

/** 校验：**表外音素直接拒写**（用户 2026-09-22 裁定）；拒时给出近邻候选 */
export function validateTokens(tokens: string[], lang: string | null, opts: { crossLanguage?: boolean } = {}): ValidateResult {
  const bad: string[] = [];
  const suggestions: Record<string, string[]> = {};
  const crossLanguageNeeded: Record<string, string[]> = {};
  for (const t of tokens) {
    if (isAllowed(t, lang, opts.crossLanguage === true)) continue;
    bad.push(t);
    const c = candidatesFor(t, lang);
    suggestions[t] = c.list.slice(0, 12);
    const others = languagesOf(t);
    if (others.length) crossLanguageNeeded[t] = others;
  }
  return { ok: bad.length === 0, bad, suggestions, crossLanguageNeeded };
}

/** 批量替换：**按音素 token 精确匹配**（不是子串替换），返回新串与命中次数 */
export function applyReplacements(cur: string | null | undefined, reps: { from: string; to: string }[]): { next: string; hits: number; detail: { from: string; to: string; n: number }[] } {
  const toks = tokenize(cur);
  const detail = reps.map((r) => ({ from: r.from, to: r.to, n: 0 }));
  const out = toks.map((t) => {
    for (const d of detail) {
      if (t === d.from) { d.n++; return d.to; }
    }
    return t;
  });
  return { next: out.join(" "), hits: detail.reduce((a, d) => a + d.n, 0), detail };
}
