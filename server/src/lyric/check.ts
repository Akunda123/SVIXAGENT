// 作词检查器（纯函数）：**给已经写好（填好）的词做复核**，只出问题清单 + 替换意见，绝不改词。
//
// 定位与触发（用户 2026-09-19）：
//   · 用于**已经写好/已填进工程**的词；由**用户提出检查**，或**填词完成后提醒**（提醒 ≠ 自动跑检查）
//   · 输出 = 问题 + 替换意见；改不改由用户定
//
// 判据：
//   ① 倒字 —— 旋律走向 vs 字的本调（映射规律由用户给定，见 SUNG_RULES）
//   ② 谐音 —— 重点：倒字后"听起来像什么"（用 homophones 表给候选字）；**非倒字的谐音**也给轻量提示
//   ③ 韵脚 —— 首句漏押 / 段内换韵 / 虚字充韵脚
//   ④ 词格 —— 字数 vs 音符数；连续 `-`（延音）多时给"可以加什么字"的替换思路
//   ⑤ 上下文 —— 整首逻辑是否通顺（机械信号 + 逐句清单交给模型/人判）
//
// ⚠️ 参考级声明：拼音/声调来自 pinyin-pro，多音字与轻声不一定准 ⇒ 凡涉及声调的结论按"参考"对待（见 verdict.caveat）。

import { pinyin } from "pinyin-pro";
import { HOMOPHONES } from "./homophones.js";

export type LyricSeverity = "error" | "warn" | "info";

export interface LyricIssue {
  id: string;
  severity: LyricSeverity;
  message: string;
  where?: { line?: number; index?: number; bar?: number; beat?: number; char?: string };
  evidence?: Record<string, unknown>;
}

export interface LyricNote {
  pitch: number;
  startBeat: number;
  durBeats: number;
  lyric: string;
}

/** 一个"字"（含它占用的所有音符 —— 拖腔/延音都算同一个字） */
export interface Syllable {
  char: string;
  lineIndex: number;
  startBeat: number;
  durBeats: number;
  pitches: number[];
  noteCount: number;
  /** 连续 `-`（延音）个数 */
  hyphens: number;
}

export interface LyricReport {
  ok: boolean;
  charCount: number;          // 汉字数（不含标点/延音）
  noteCount: number;
  sentenceCount: number;
  sectionCount: number;
  metrics: {
    toneMismatch: number;     // 倒字数
    homophone: number;        // 谐音提示数
    rhymeIssues: number;
    wordCountIssues: number;
    padRuns: number;          // 连续延音段数
  };
  sentences: { section: number; text: string; chars: number; notes: number; endChar: string; endFinal: string }[];
  issues: LyricIssue[];
  verdict: { blocking: number; warnings: number; infos: number; text: string; advice: string; caveat: string };
}

export interface LyricOptions {
  /** 歌词文本（可含段落标记 [Verse]/[Chorus] 或空行分段） */
  lyrics?: string;
  /** 与工程对齐的音符（含 lyric）；有它才能判倒字/谐音/词格 */
  notes?: LyricNote[];
  timeSig?: number;
}

// ---------------------------------------------------------------- 常量与表

/** 用户给定的**旋律走向 → 声调**规律（2026-09-19；改动需用户确认） */
export const SUNG_RULES = {
  /** 幅度阈值（半音）：达到即算"大幅" */
  bigLeap: 3,
  describe: [
    "无音高变化 ⇒ 一声",
    "向上 ⇒ 二声",
    "先向下后向上 ⇒ 三声",
    "大幅向上（≥3 半音）也 ⇒ 三声",
    "大幅向下（≥3 半音）⇒ 四声",
  ],
};

/** 虚字：拿它当韵脚 = 充数 */
const FILLER_CHARS = new Set("的了着吗呢吧啊呀哦嘛么之乎者也与和及或就都还也又很".split(""));

/** 声母表（用于从音节里剥出韵母） */
const INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];

const PUNCT = /[，。！？；：、,.!?;:\s…—-]+/;

function isCJK(ch: string): boolean {
  const cp = ch.codePointAt(0) || 0;
  return cp >= 0x4e00 && cp <= 0x9fff;
}

/** "shou3" → { syll: "shou", tone: 3 }；轻声（0）记 5 */
function splitTone(syllableTone: string): { syll: string; tone: number } {
  const m = syllableTone.match(/^([a-zü]+)([0-5])$/i);
  if (!m) return { syll: syllableTone.toLowerCase(), tone: 0 };
  const t = Number(m[2]);
  return { syll: m[1].toLowerCase(), tone: t === 0 ? 5 : t };
}

/** 剥声母得韵母（够用即可：作词检查只看韵脚是否成组） */
function finalOf(syll: string): string {
  for (const ini of INITIALS) {
    if (syll.startsWith(ini) && syll.length > ini.length) return syll.slice(ini.length);
  }
  return syll;
}

/** 取字的本调（1-4 · 轻声 5）；非中文或取不到返回 0 */
function lexicalTone(ch: string): number {
  if (!isCJK(ch)) return 0;
  try {
    const arr = pinyin(ch, { toneType: "num", type: "array" }) as string[];
    return splitTone(arr[0] || "").tone;
  } catch {
    return 0;
  }
}

/** 取字的音节（不带调） */
function syllableOf(ch: string): string {
  if (!isCJK(ch)) return "";
  try {
    const arr = pinyin(ch, { toneType: "num", type: "array" }) as string[];
    return splitTone(arr[0] || "").syll;
  } catch {
    return "";
  }
}

/** 旋律走向 → 被唱成几调（用户给定规律） */
export function sungToneOf(pitches: number[]): { tone: number; shape: string; delta: number; span: number } {
  if (pitches.length <= 1) return { tone: 1, shape: "无音高变化", delta: 0, span: 0 };
  const first = pitches[0], last = pitches[pitches.length - 1];
  const max = Math.max(...pitches), min = Math.min(...pitches);
  const span = max - min;
  const delta = last - first;
  const minIdx = pitches.indexOf(min);
  const downFirst = first - min;
  const upTotal = max - first;
  const dipInMiddle = minIdx > 0 && minIdx < pitches.length - 1 && last > min;
  if (span <= 1) return { tone: 1, shape: "无音高变化", delta, span };
  if (dipInMiddle && downFirst >= 2) return { tone: 3, shape: "先向下后向上", delta, span };
  if (upTotal >= SUNG_RULES.bigLeap) return { tone: 3, shape: "大幅向上", delta, span };
  if (downFirst >= SUNG_RULES.bigLeap) return { tone: 4, shape: "大幅向下", delta, span };
  if (delta > 0) return { tone: 2, shape: "向上", delta, span };
  if (delta < 0) return { tone: 4, shape: "向下", delta, span };
  return { tone: 1, shape: "无音高变化", delta, span };
}

// ---------------------------------------------------------------- 对齐

/** 从"音符 + 歌词"对齐出音节序列（`-` 归到前一个字，算它的延音） */
export function alignSyllables(notes: LyricNote[], timeSig = 4): Syllable[] {
  const sorted = [...notes]
    .map((n, i) => ({ ...n, i }))
    .sort((a, b) => a.startBeat - b.startBeat || a.i - b.i);
  const out: Syllable[] = [];
  for (const n of sorted) {
    const ch = (n.lyric || "").trim();
    const bar = Math.floor(n.startBeat / timeSig) + 1;
    if (ch === "-" || ch === "") {
      const prev = out[out.length - 1];
      if (prev) {
        prev.pitches.push(n.pitch);
        prev.noteCount++;
        prev.durBeats = Number((n.startBeat + n.durBeats - prev.startBeat).toFixed(3));
        if (ch === "-") prev.hyphens++;
      }
      continue;
    }
    out.push({
      char: ch, lineIndex: 0, startBeat: n.startBeat, durBeats: n.durBeats,
      pitches: [n.pitch], noteCount: 1, hyphens: 0,
    });
    void bar;
  }
  // 把音符平均分给"文本行"（无显式行信息时，用气口/小节近似成一行一句）
  return out;
}

/** 把纯文本切成"段落 → 句子" */
function splitText(text: string): { sections: string[][]; lines: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const sections: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (/^\[.*\]$/.test(line) || /^#/.test(line)) {           // [Verse] 之类的段落标记
      if (cur.length) { sections.push(cur); cur = []; }
      continue;
    }
    cur.push(line);
  }
  if (cur.length) sections.push(cur);
  if (!sections.length) sections.push([]);
  return { sections, lines };
}

/** 一行 → 句子（按标点切） */
function splitSentences(line: string): string[] {
  return line.split(PUNCT).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ---------------------------------------------------------------- 主检查

export function checkLyrics(opts: LyricOptions = {}): LyricReport {
  const timeSig = opts.timeSig && opts.timeSig > 0 ? opts.timeSig : 4;
  const notes = opts.notes || [];
  const syllables = notes.length ? alignSyllables(notes, timeSig) : [];
  const text = (opts.lyrics || notes.map((n) => n.lyric).join("")).trim();
  const { sections, lines } = splitText(text);
  const issues: LyricIssue[] = [];

  // 逐句：优先用文本切句；有音符时把音节按顺序分配给句子（按下标近似对齐）
  const sentenceList: { section: number; text: string }[] = [];
  sections.forEach((lines2, si) => {
    for (const line of lines2) for (const s of splitSentences(line)) sentenceList.push({ section: si, text: s });
  });
  if (!sentenceList.length) sentenceList.push({ section: 0, text: text.replace(PUNCT, "") });

  // ---- ① 倒字 + ② 谐音（需要音符）
  let mismatch = 0, homophones = 0;
  const mismatchList: { char: string; lex: number; sung: number; shape: string; heard: string }[] = [];
  if (syllables.length) {
    for (const syl of syllables) {
      if (!isCJK(syl.char)) continue;
      const lex = lexicalTone(syl.char);
      if (lex === 0 || lex === 5) continue;                      // 取不到 / 轻声不判
      const sung = sungToneOf(syl.pitches);
      if (sung.tone === lex) continue;
      mismatch++;
      const base = syllableOf(syl.char);
      const heard = base ? base + sung.tone : `?${sung.tone}`;
      mismatchList.push({ char: syl.char, lex, sung: sung.tone, shape: sung.shape, heard });
      issues.push({
        id: "tone-mismatch", severity: "warn",
        where: { bar: Math.floor(syl.startBeat / timeSig) + 1, char: syl.char },
        message: `倒字：**${syl.char}**（本调 ${lex} 声）被唱成 ${sung.tone} 声 —— 旋律${sung.shape}（${syl.pitches.join("→")}）`,
        evidence: { char: syl.char, lexicalTone: lex, sungTone: sung.tone, shape: sung.shape, pitches: syl.pitches, heardAs: heard },
      });
      // 谐音：把"被唱成的音"拿去反查同音字（重点：会不会听起来像别的字）
      const cands = (HOMOPHONES[heard] || []).filter((c) => c !== syl.char);
      if (cands.length) {
        homophones++;
        issues.push({
          id: "homophone", severity: "warn",
          where: { bar: Math.floor(syl.startBeat / timeSig) + 1, char: syl.char },
          message: `谐音（由倒字引起）：**${syl.char}** 听起来像「${heard}」⇒ 可能被听成 ${cands.slice(0, 6).join(" / ")}（参考级，需人耳确认）`,
          evidence: { char: syl.char, heardAs: heard, candidates: cands.slice(0, 8) },
        });
      }
    }
    // 非倒字的谐音：同音字里出现了"歌词里也有的字" ⇒ 连读容易被听串
    const allChars = new Set(syllables.map((s) => s.char));
    for (const syl of syllables) {
      if (!isCJK(syl.char)) continue;
      const base = syllableOf(syl.char);
      const lex = lexicalTone(syl.char);
      if (!base || !lex) continue;
      const bucket = HOMOPHONES[base + lex] || [];
      const clash = bucket.filter((c) => c !== syl.char && allChars.has(c));
      if (clash.length) {
        issues.push({
          id: "homophone-echo", severity: "info",
          where: { bar: Math.floor(syl.startBeat / timeSig) + 1, char: syl.char },
          message: `同音相撞：「${syl.char}」与词里已有的「${clash.join(" / ")}」同音（${base}${lex}）—— 连读可能被听串，检查是否刻意`,
          evidence: { char: syl.char, clash, syllable: base + lex },
        });
      }
    }
  }

  // ---- ③ 韵脚（按段落看句末字）
  let rhymeIssues = 0;
  const perSection: { section: number; ends: { text: string; endChar: string; final: string }[] }[] = [];
  for (const s of sentenceList) {
    const chars = [...s.text].filter(isCJK);
    const endChar = chars[chars.length - 1] || "";
    const final = endChar ? finalOf(syllableOf(endChar)) : "";
    let bucket = perSection.find((p) => p.section === s.section);
    if (!bucket) { bucket = { section: s.section, ends: [] }; perSection.push(bucket); }
    bucket.ends.push({ text: s.text, endChar, final });
  }
  for (const sec of perSection) {
    const ends = sec.ends.filter((e) => e.final);
    if (ends.length < 2) continue;
    const groups = new Map<string, number>();
    for (const e of ends) groups.set(e.final, (groups.get(e.final) || 0) + 1);
    const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    // 首句漏押
    if (ends[0].final !== top[0] && top[1] >= 2) {
      rhymeIssues++;
      issues.push({
        id: "rhyme-first", severity: "warn",
        message: `首句漏押：第 ${sec.section + 1} 段第一句落「${ends[0].endChar}」（韵母 ${ends[0].final}），而该段多数句落 ${top[0]} —— 新手第一通病，回头把首句改成同韵`,
        evidence: { section: sec.section + 1, first: ends[0], majority: top[0], groups: sorted },
      });
    }
    // 段内换韵（两组各 ≥2）
    if (sorted.length >= 2 && sorted[1][1] >= 2) {
      rhymeIssues++;
      issues.push({
        id: "rhyme-shift", severity: "warn",
        message: `段内换韵：第 ${sec.section + 1} 段出现 ${sorted.length} 组韵脚（${sorted.map(([f, n]) => `${f}×${n}`).join(" · ")}）—— 一段之内守同一个韵，换韵只发生在段与段之间`,
        evidence: { section: sec.section + 1, groups: sorted },
      });
    }
    // 虚字充韵脚
    const fillers = ends.filter((e) => FILLER_CHARS.has(e.endChar));
    if (fillers.length) {
      rhymeIssues++;
      issues.push({
        id: "rhyme-filler", severity: "warn",
        message: `虚字充韵脚：${fillers.map((f) => `「${f.endChar}」`).join("、")} 当句尾韵脚 —— 把虚字前面那个实词提到句尾`,
        evidence: { fillers: fillers.map((f) => f.endChar) },
      });
    }
  }

  // ---- ④ 词格（字数 vs 音符数）+ 延音多的替换思路
  let wordCountIssues = 0, padRuns = 0;
  if (syllables.length) {
    const notesPerChar = syllables.map((s) => s.noteCount);
    const totalChars = syllables.length;
    const avg = notesPerChar.reduce((a, b) => a + b, 0) / Math.max(1, totalChars);
    void avg;
    for (const syl of syllables) {
      if (syl.hyphens >= 3 || syl.noteCount >= 4) {
        padRuns++;
        const room = Math.max(1, syl.noteCount - 1);
        issues.push({
          id: "pad-room", severity: "info",
          where: { bar: Math.floor(syl.startBeat / timeSig) + 1, char: syl.char },
          message: `延音偏长：「${syl.char}」占了 ${syl.noteCount} 个音符（其中 \`-\` ×${syl.hyphens}）—— 这里还塞得下约 ${room} 个字：**换思路**＝把单字改双音节词/叠词，或按本段韵脚挑同韵字；也可保留长音抒情（由用户定）`,
          evidence: { char: syl.char, noteCount: syl.noteCount, hyphens: syl.hyphens, room },
        });
      }
    }
    // 句级字数 vs 音符数（用"按顺序把音节分给句子"的近似口径）
    let cursor = 0;
    for (const s of sentenceList) {
      const chars = [...s.text].filter(isCJK);
      const take = syllables.slice(cursor, cursor + chars.length);
      cursor += chars.length;
      const notesUsed = take.reduce((a, b) => a + b.noteCount, 0);
      const diff = chars.length - notesUsed;
      if (chars.length && Math.abs(diff) >= 3) {
        wordCountIssues++;
        issues.push({
          id: "word-count", severity: "warn",
          message: `词格对不齐：「${s.text.slice(0, 12)}…」一句 ${chars.length} 字 / ${notesUsed} 个音符（差 ${diff > 0 ? "+" : ""}${diff}）—— ${diff > 0 ? "字多音符少，唱不下：删字或把长音加回来" : "音符多字少，太空：加字或用延音（`-`）"}`,
          evidence: { sentence: s.text, chars: chars.length, notes: notesUsed, diff },
        });
      }
    }
  }

  // ---- ⑤ 上下文（机械信号 + 交给模型/人判的清单）
  const sectionTexts = sections.map((ls) => ls.join("\n"));
  const personRe = /(我们|你们|他们|她们|它们|我|你|他|她|它)/g;
  const personCounts = new Map<string, number>();
  for (const m of sectionTexts.join("").matchAll(personRe)) personCounts.set(m[1], (personCounts.get(m[1]) || 0) + 1);
  const personKinds = [...personCounts.keys()].length;
  if (personKinds >= 3) {
    issues.push({
      id: "person-shift", severity: "info",
      message: `人称/视角较多（${[...personCounts.entries()].map(([k, v]) => `${k}×${v}`).join(" · ")}）—— 视角切换的单位只能是段落，检查有没有在句中间换人`,
      evidence: { persons: Object.fromEntries(personCounts) },
    });
  }
  // 相邻句"去虚字后无共同字" ⇒ 逻辑跳跃的弱信号（参考级）
  const contentChars = (s: string) => new Set([...s].filter((c) => isCJK(c) && !FILLER_CHARS.has(c)));
  for (let i = 1; i < sentenceList.length; i++) {
    if (sentenceList[i].section !== sentenceList[i - 1].section) continue;
    const a = contentChars(sentenceList[i - 1].text), b = contentChars(sentenceList[i].text);
    const shared = [...a].filter((c) => b.has(c));
    if (a.size >= 3 && b.size >= 3 && shared.length === 0) {
      issues.push({
        id: "logic-jump", severity: "info",
        message: `上下文弱信号：「${sentenceList[i - 1].text.slice(0, 8)}…」→「${sentenceList[i].text.slice(0, 8)}…」两句没有任何共同实词 —— 请人/模型确认前后是否真的不相关（参考级，不构成结论）`,
        evidence: { prev: sentenceList[i - 1].text, next: sentenceList[i].text },
      });
    }
  }
  issues.push({
    id: "context-review", severity: "info",
    message: `整首逻辑通顺与否**机器判不了**：下面是逐句清单（${sentenceList.length} 句 / ${sections.length} 段），请通读确认有没有前后完全不相关、铺垫缺失、角色冗余之类的问题（对应 \`references/结构与叙事.md\`）`,
    evidence: { sentences: sentenceList.map((s, i) => ({ i, section: s.section + 1, text: s.text })) },
  });

  const blocking = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  const infos = issues.filter((i) => i.severity === "info").length;
  const order: Record<LyricSeverity, number> = { error: 0, warn: 1, info: 2 };
  const sentencesOut = sentenceList.map((s, i) => {
    const chars = [...s.text].filter(isCJK);
    const endChar = chars[chars.length - 1] || "";
    return {
      section: s.section + 1, text: s.text, chars: chars.length,
      notes: syllables.slice(i, i + 1).reduce((a, b) => a + b.noteCount, 0),
      endChar, endFinal: endChar ? finalOf(syllableOf(endChar)) : "",
    };
  });

  return {
    ok: blocking === 0,
    charCount: syllables.length || sentenceList.reduce((a, s) => a + [...s.text].filter(isCJK).length, 0),
    noteCount: notes.length,
    sentenceCount: sentenceList.length,
    sectionCount: sections.length,
    metrics: {
      toneMismatch: mismatch,
      homophone: homophones,
      rhymeIssues,
      wordCountIssues,
      padRuns,
    },
    sentences: sentencesOut,
    issues: [...issues].sort((a, b) => order[a.severity] - order[b.severity]),
    verdict: {
      blocking, warnings, infos,
      text: `${blocking} 处硬伤 · ${warnings} 处警告 · ${infos} 条提示`,
      advice: issues.length
        ? `问题清单 + 替换意见（**只列不改**，改不改由用户定；一次只改一处）：${[...new Set(issues.map((i) => i.id))].join("、")}`
        : "没发现要改的（倒字/谐音/韵脚/词格都过）",
      caveat: "拼音与声调来自 pinyin-pro：**多音字与轻声不一定准**，凡涉及声调的结论（倒字/谐音/重音）按**参考级**对待，以人耳为准；韵脚与字数这类客观项可硬看。",
    },
  };
}
