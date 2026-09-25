/**
 * 中文歌词 → 普通话声调（给说唱"自动标记声调"用）
 *
 * 依据（用户 2026-09-18 订正）：`Note#setRapAccent("1"…"5")` 的 5 档**就是五个声调** ——
 *   `1` 阴平 · `2` 阳平 · `3` 上声 · `4` 去声 · **`5` = 轻声**。
 * 配方正本：`skills/sv-lyricist/references/说唱词流.md` §5.3。
 *
 * 关键点：
 *   - **按词定音**：pinyin-pro 会做分词，多音字（行/重/长/还/得/了…）在词里取正确读音 ⇒ 传**整条词**，别按单字查。
 *   - pinyin-pro 的 `toneType: 'num'` 里**轻声是 `0`** ⇒ 要映射成 SV 的 `5`。
 *   - 歌词本身就是带调拼音（`nǐ hǎo` / `ni3 hao3`）时 ⇒ **直接读**，不用查词典（用户提到的用途之一）。
 */
import { pinyin } from "pinyin-pro";

export type RapAccent = "1" | "2" | "3" | "4" | "5";

export interface ToneDecision {
  index: number;
  lyrics: string;
  /** 参与判定的汉字（多字时取第一个汉字） */
  char?: string;
  /** 该字的拼音（带数字声调，如 `zhong1`） */
  syllable?: string;
  /** SV 的声调档（1-4 = 四声 · 5 = 轻声） */
  accent?: RapAccent;
  action: "set" | "skip";
  reason: string;
  /** 该音符**当前**的 rapAccent（"" = 未设） */
  currentAccent?: string;
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const TONE_MARK: Record<string, number> = {
  ā: 1, á: 2, ǎ: 3, à: 4, ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4, ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4, ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
};

/** 数字声调 → SV 档位（pinyin-pro 的 0 = 轻声 ⇒ 5） */
export function toneToAccent(tone: number): RapAccent | undefined {
  if (tone >= 1 && tone <= 4) return String(tone) as RapAccent;
  if (tone === 0 || tone === 5) return "5";
  return undefined;
}

/** 歌词里是否已有现成声调（带调号，或 `ni3` 式）——有就直接读，不查词典 */
export function toneFromLyric(text: string): RapAccent | undefined {
  const raw = (text ?? "").trim();
  for (const ch of raw) if (TONE_MARK[ch.toLowerCase()] !== undefined) return String(TONE_MARK[ch.toLowerCase()]) as RapAccent;
  const m = raw.match(/[a-zü]+([1-5])\b/i);
  if (m) return toneToAccent(Number(m[1]));
  return undefined;
}

/** 判一条歌词的声调（非中文 ⇒ 返回 skip） */
export function toneOfLyric(lyric: string, index: number, currentAccent = ""): ToneDecision {
  const raw = (lyric ?? "").trim();
  const direct = toneFromLyric(raw);
  if (direct) {
    return { index, lyrics: raw, accent: direct, action: "set", currentAccent, reason: "歌词自带声调（调号 / 数字）⇒ 直接读" };
  }
  const chars = [...raw];
  const at = chars.findIndex((c) => CJK.test(c));
  if (at < 0) {
    return { index, lyrics: raw, action: "skip", currentAccent, reason: "非中文歌词 ⇒ 不标（rap accent 只用于普通话）" };
  }
  const char = chars[at];
  // ⚠️ 传**整条词**让 pinyin-pro 分词定音，再取第一个汉字对应的那一项
  let arr: string[] = [];
  try {
    arr = pinyin(raw, { toneType: "num", type: "array", nonZh: "consecutive" }) as unknown as string[];
  } catch {
    arr = [];
  }
  const syl = (arr[at] ?? "").toString();
  const m = syl.match(/([0-5])$/);
  if (!m) {
    return { index, lyrics: raw, char, action: "skip", currentAccent, reason: `取不到声调（${char} → ${syl || "空"}）⇒ 跳过` };
  }
  const accent = toneToAccent(Number(m[1]));
  if (!accent) return { index, lyrics: raw, char, syllable: syl, action: "skip", currentAccent, reason: "声调值超出 1-5 ⇒ 跳过" };
  return {
    index, lyrics: raw, char, syllable: syl, accent, action: "set", currentAccent,
    reason: `按词定音 ${char} → ${syl}${accent === "5" ? "（轻声）" : ""}`,
  };
}

export function tonesOfGroup(notes: { index: number; lyrics: string; rapAccent?: string }[]): ToneDecision[] {
  return notes.map((n) => toneOfLyric(n.lyrics, n.index, n.rapAccent ?? ""));
}

/**
 * 逐字声调（**证明"按词定音"用**：多音字在词里取正确读音）。
 * 例：`tonesOfText("银行")` → 银 `yin2` / 行 `hang2`；`tonesOfText("行走")` → 行 `xing2` / 走 `zou3`。
 */
export function tonesOfText(text: string): { char: string; syllable: string; accent?: RapAccent }[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  let arr: string[] = [];
  try {
    arr = pinyin(raw, { toneType: "num", type: "array", nonZh: "consecutive" }) as unknown as string[];
  } catch {
    arr = [];
  }
  const out: { char: string; syllable: string; accent?: RapAccent }[] = [];
  [...raw].forEach((ch, i) => {
    if (!CJK.test(ch)) return;
    const syl = (arr[i] ?? "").toString();
    const m = syl.match(/([0-5])$/);
    out.push({ char: ch, syllable: syl, accent: m ? toneToAccent(Number(m[1])) : undefined });
  });
  return out;
}
