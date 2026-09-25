/**
 * 歌词语种判定（**按语义，不只看文字系统**）
 *
 * 依据（用户 2026-09-18 强调）：**用汉语拼音或日语罗马字写的词，仍然是中文 / 日文，不是英语**。
 * 规则与判据的**正本**：`skills/akdagent-playbook/SKILL.md` **§0.6c**（本文只是它的实现）。
 *
 * 三级判定：
 *   ① 字形：CJK ⇒ mandarin · 假名 ⇒ japanese · 谚文 ⇒ korean
 *   ② 拉丁字母**按词法再判**：声调符号 / `ni3` 式 ⇒ 拼音(mandarin)；`x/q/zh/v` ⇒ 拼音；
 *      日语罗马字特征（`tsu` / `shi` / `kya` / 长音 / `-masu` 等）或**常用日语词** ⇒ japanese；
 *      命中**常用英文词** ⇒ english；全部可切成拼音音节的 ⇒ **低置信**地偏 mandarin（要与上下文一起看）
 *   ③ 上下文（多数派 / 相邻音符 / 用户提示）由调用方处理；**两可的一律报出来让用户确认，不猜**
 */
import { PINYIN_SYLLABLE_SET } from "./pinyin-syllables.js";

export type LyricLang = "mandarin" | "english" | "japanese" | "korean" | "cantonese" | "spanish" | "";
export type Confidence = "high" | "low";
export type Level = "glyph" | "pinyin" | "romaji" | "english" | "ambiguous" | "empty";

export interface Classification {
  lang: LyricLang;
  level: Level;
  confidence: Confidence;
  reason: string;
}

/** 文字系统判定（第 ① 级）：只对有把握的字形给结论，拉丁字母返回 ""（要进第 ② 级） */
export function classifyGlyph(ch: string): LyricLang | "" {
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch)) return "mandarin";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(ch)) return "japanese";
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(ch)) return "korean";
  return "";
}

/** 带声调的元音符号（`nǐ hǎo`） */
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
/** `ni3` / `lv4` 这种"音节 + 数字声调" */
const PINYIN_NUM = /^[a-zü]+[1-5]$/i;
/** 拼音独有、罗马字基本不出现的拼写特征 */
const PINYIN_ONLY = /(^|[^a-z])(x|q)|zh|(^|[^a-z])v[a-z]/i;
/** 日语罗马字特征（与拼音不同形的那些；`shi`/`chi`/`ka` 这类两边都合法的**不列**，靠日语词表与上下文） */
const ROMAJI_MARKERS = [
  "tsu", "kya", "kyu", "kyo", "rya", "ryu", "ryo", "gya", "gyu", "gyo", "sha", "shu", "sho",
  "ja", "ju", "jo", "cha", "chu", "cho", "nya", "hya", "bya", "pya", "mya", "ss", "ou", "uu",
  "masu", "desu", "suru", "shita", "koto", "n'",
];
/** 常用日语词（罗马字）—— 命中即可判 japanese（`sakura` / `kimi` 这种其实"全部可切成拼音音节"，所以必须有词表） */
const ROMAJI_WORDS = new Set([
  "arigatou", "arigato", "sakura", "kimi", "boku", "watashi", "ore", "anata", "sayonara", "daijoubu",
  "aishiteru", "suki", "yume", "hikari", "kaze", "sora", "umi", "hoshi", "namida", "kokoro",
  "tomodachi", "ashita", "kyou", "kako", "mirai", "sekai", "inochi", "kotoba", "uta", "koe",
  "shinjitsu", "yakusoku", "omoide", "futari", "hitori", "genki", "ganbatte", "itai", "kanashii",
  "ureshii", "samishii", "aitai", "zutto", "motto", "sugoi", "kawaii", "kirei", "shiawase", "natsu",
  "fuyu", "haru", "aki", "ame", "yuki", "tsuki", "taiyou", "niji", "hana", "michi",
]);
/** 常用英文词 —— 命中即可判 english（用在"既不像拼音也不像罗马字"之后） */
const ENGLISH_WORDS = new Set([
  "the", "and", "you", "your", "love", "heart", "night", "tonight", "day", "time", "life", "world",
  "city", "light", "lights", "dream", "dreams", "eyes", "eye", "fire", "rain", "home", "hello",
  "goodbye", "baby", "girl", "boy", "man", "woman", "we", "are", "is", "am", "be", "to", "of",
  "in", "on", "at", "my", "me", "i", "it", "she", "he", "they", "we", "all", "never", "ever",
  "forever", "hold", "kiss", "stay", "go", "run", "fly", "feel", "know", "want", "need", "let",
  "down", "up", "out", "away", "again", "one", "two", "three", "song", "sing", "dance", "smile",
  "tears", "cry", "broken", "whole", "free", "true", "real", "star", "stars", "moon", "sun",
  "sky", "sea", "road", "way", "mind", "soul", "pain", "lost", "found", "here", "there", "where",
]);

/** 把无空格拉丁串贪心切成音节（从长到短匹配已知音节集合） */
function greedySplit(s: string, set: ReadonlySet<string>): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let matched = "";
    for (let len = 6; len >= 1; len--) {
      const part = s.slice(i, i + len);
      if (part.length === len && set.has(part)) { matched = part; break; }
    }
    if (!matched) return null;
    out.push(matched);
    i += matched.length;
  }
  return out.length ? out : null;
}

function latinTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(TONE_MARK, (m) => TONE_FOLD[m] ?? m)
    .replace(/[^a-z0-9'\u00c0-\u024f\s-]/g, " ")
    .split(/[\s'-]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

const TONE_FOLD: Record<string, string> = {
  ā: "a", á: "a", ǎ: "a", à: "a", ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i", ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u", ǖ: "v", ǘ: "v", ǚ: "v", ǜ: "v", ü: "v",
};

/**
 * 判**一条歌词**的语种（音符级）。
 * ⚠️ 返回 `confidence: "low"` 时**不要擅自写语言** —— 交给调用方用上下文定夺，或直接问用户。
 */
export function classifyLyric(text: string): Classification {
  const raw = (text ?? "").trim();
  if (!raw || raw === "-" || /^[\s\p{P}\p{S}]*$/u.test(raw)) {
    return { lang: "", level: "empty", confidence: "high", reason: "空 / 延音 / 纯标点 ⇒ 跳过" };
  }
  // ① 字形：整条都是同一种非拉丁文字 ⇒ 直接定
  const glyphs = [...raw].map(classifyGlyph).filter(Boolean) as LyricLang[];
  if (glyphs.length === [...raw.replace(/\s/g, "")].length && glyphs.length > 0) {
    const uniq = [...new Set(glyphs)];
    if (uniq.length === 1) {
      return { lang: uniq[0], level: "glyph", confidence: "high", reason: "字形（非拉丁文字）" };
    }
  }
  // ② 拉丁字母：按词法/语义再判
  if (TONE_MARK.test(raw)) return { lang: "mandarin", level: "pinyin", confidence: "high", reason: "带声调符号 ⇒ 汉语拼音" };
  const tokens = latinTokens(raw);
  if (tokens.length > 0 && tokens.every((t) => PINYIN_NUM.test(t))) {
    return { lang: "mandarin", level: "pinyin", confidence: "high", reason: "音节+数字声调（如 ni3）⇒ 汉语拼音" };
  }
  const stripped = tokens.map((t) => t.replace(/[0-9]/g, ""));
  const joined = stripped.join("");
  if (PINYIN_ONLY.test(" " + raw.toLowerCase() + " ")) {
    return { lang: "mandarin", level: "pinyin", confidence: "high", reason: "含拼音独有拼写（x / q / zh / v）⇒ 汉语拼音" };
  }
  const wordHit = stripped.find((t) => ROMAJI_WORDS.has(t));
  if (wordHit) return { lang: "japanese", level: "romaji", confidence: "high", reason: `命中常用日语词「${wordHit}」⇒ 日语罗马字` };
  // ⚠️ 英文词要**先于**"全部可切成拼音音节"那条判：`hello` 能被切成 he+l+lo 这种拼音碎片，
  //    但整词命中英文词表时它就是英文（否则会被误判成"低置信 mandarin"而白白放过）。
  const allEnglish = stripped.length > 0 && stripped.every((t) => ENGLISH_WORDS.has(t));
  if (allEnglish) {
    return { lang: "english", level: "english", confidence: "high", reason: `整条都是常用英文词（${stripped.join(" ")}）⇒ 英语` };
  }
  const markerHit = ROMAJI_MARKERS.find((m) => joined.includes(m));
  const pinyinSplit = joined ? greedySplit(joined, PINYIN_SYLLABLE_SET) : null;
  const allPinyin = pinyinSplit !== null && pinyinSplit.length > 0;
  if (markerHit && !allPinyin) {
    return { lang: "japanese", level: "romaji", confidence: "high", reason: `含日语罗马字特征「${markerHit}」⇒ 日语罗马字` };
  }
  const enHit = stripped.find((t) => ENGLISH_WORDS.has(t));
  if (allPinyin) {
    return {
      lang: "mandarin", level: "pinyin", confidence: "low",
      reason: `全部可切成拼音音节（${pinyinSplit!.join("-")}）⇒ 偏中文，但罗马字也可能同形`,
    };
  }
  if (enHit) return { lang: "english", level: "english", confidence: "high", reason: `命中常用英文词「${enHit}」⇒ 英语` };
  if (markerHit) return { lang: "japanese", level: "romaji", confidence: "high", reason: `含日语罗马字特征「${markerHit}」⇒ 日语罗马字` };
  return { lang: "", level: "ambiguous", confidence: "low", reason: "拉丁字母但既不像拼音/罗马字也不像常用英文 ⇒ 待用户确认" };
}

export interface NoteLangDecision {
  index: number;
  lyrics: string;
  lang: LyricLang;
  reason: string;
  /** 该音符**当前**的语言覆盖（"" = 继承） */
  currentOverride: string;
  /** 建议动作 */
  action: "skip" | "keep" | "set" | "ask";
}

export interface GroupLangPlan {
  majority: LyricLang | "";
  majorityCount: number;
  totalJudged: number;
  decisions: NoteLangDecision[];
  /** 需要写语言的音符（少数派 + 高置信 + 与期望不同） */
  toSet: { index: number; language: LyricLang }[];
  /** 拿不准、要问用户的音符 */
  toAsk: { index: number; lyrics: string; reason: string }[];
}

/**
 * 对**一组音符**出方案：按"多数派 = 主语言"给少数派音符单独设语种。
 * ⚠️ 纪律：**只在用户反馈多语言混杂时调用**；只动少数派；拿不准的报 `toAsk` 让用户定。
 */
export function planGroupLanguage(
  notes: { index: number; lyrics: string; languageOverride?: string }[]
): GroupLangPlan {
  const decided: { index: number; lyrics: string; cls: Classification; currentOverride: string }[] = [];
  const decisions: NoteLangDecision[] = [];
  for (const n of notes) {
    const cls = classifyLyric(n.lyrics);
    const currentOverride = n.languageOverride ?? "";
    decided.push({ index: n.index, lyrics: n.lyrics, cls, currentOverride });
  }
  // 多数派只数"高置信"的判定（低置信的不参与投票，免得把结果带偏）
  const votes = new Map<LyricLang, number>();
  for (const d of decided) {
    if (d.cls.lang && d.cls.confidence === "high") votes.set(d.cls.lang, (votes.get(d.cls.lang) ?? 0) + 1);
  }
  let majority: LyricLang | "" = "";
  let majorityCount = 0;
  for (const [lang, c] of votes) if (c > majorityCount) { majority = lang; majorityCount = c; }
  const judged = decided.filter((d) => d.cls.lang !== "").length;

  const toSet: { index: number; language: LyricLang }[] = [];
  const toAsk: { index: number; lyrics: string; reason: string }[] = [];
  for (const d of decided) {
    const base: NoteLangDecision = {
      index: d.index, lyrics: d.lyrics, lang: d.cls.lang, reason: d.cls.reason,
      currentOverride: d.currentOverride, action: "skip",
    };
    if (d.cls.lang === "") { base.action = "ask"; toAsk.push({ index: d.index, lyrics: d.lyrics, reason: d.cls.reason }); }
    else if (d.cls.confidence === "low") {
      // 低置信：**一律报出来**（与多数派一致时只是"仅供参考"，不一致时不擅自改）
      if (d.cls.lang === majority) {
        base.action = "keep";
        toAsk.push({ index: d.index, lyrics: d.lyrics, reason: "低置信（与多数派一致，仅供参考）：" + d.cls.reason });
      } else {
        base.action = "ask";
        toAsk.push({ index: d.index, lyrics: d.lyrics, reason: "低置信且与多数派不同：" + d.cls.reason });
      }
    } else if (d.cls.lang === majority) {
      // 与主语言一致（且高置信）⇒ 保持继承（既有覆盖不动，避免"顺手统一"）
      base.action = "keep";
    } else {
      base.action = "set";
      toSet.push({ index: d.index, language: d.cls.lang });
    }
    decisions.push(base);
  }
  return { majority, majorityCount, totalJudged: judged, decisions, toSet, toAsk };
}
