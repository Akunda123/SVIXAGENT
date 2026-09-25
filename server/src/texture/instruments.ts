/**
 * 乐器 → 织体**推荐**与**硬约束**（P7「IX 织体生成」，2026-09-19 用户定：先管乐 + 弦乐）
 *
 * 两类信息分开：
 *  ① **推荐**（软）：乐器 × 段落 → 候选织体 + 理由 ⇒ 交给用户选（"推荐→用户选"那条路）。
 *  ② **约束**（硬，可关）：管乐**必须留气口**、弦乐**连续同型要换弓**、两者都有**音域**上下限。
 *     约束由 `applyInstrumentRules()` 落到音符上，并把**做了什么**如实回报（`applied`）。
 *
 * ⚠️ 用户乐器以后可能增加 ⇒ 加一件就是加一条 `INSTRUMENTS` 记录；**不要在别处硬编码乐器名**。
 */

import { parseChordName } from "../audio/chords.js";
import type { NoteChordAnalysis } from "./chords-from-notes.js";
import type { TemplateNoteOut } from "./template.js";

/** 织体类型（前 3 个对齐 `sv_write_chords.pattern`，后 5 个是织体学里的型）*/
export type TextureType =
  | "block"      // 柱式
  | "broken"     // 分解
  | "arpeggio"   // 琶音
  | "sustain"    // 长音铺底
  | "ostinato"   // 固定音型
  | "riff"       // 节奏型动机
  | "counter"    // 对位低音/副旋律
  | "imitate";   // 模板模仿（首小节 → 其余）

export type Section = "intro" | "verse" | "pre" | "chorus" | "bridge" | "outro";

export type Family = "wind" | "string";

export interface InstrumentDef {
  id: string;
  /** 匹配用别名（中/英/常见写法）；匹配时忽略大小写与空格 */
  names: string[];
  family: Family;
  /** 实用音域（MIDI，含端点）*/
  range: [number, number];
  /** 首选织体（按优先级）*/
  preferred: TextureType[];
  /** 备选（能用但不是第一选择）*/
  alt: TextureType[];
  /** 基本不要用 */
  avoid: TextureType[];
  /** 一句要点（给用户看）*/
  note: string;
}

export const INSTRUMENTS: InstrumentDef[] = [
  // ---------- 管乐 ----------
  {
    id: "flute", names: ["长笛", "flute", "短笛", "piccolo", "picc"], family: "wind", range: [60, 96],
    preferred: ["broken", "arpeggio"], alt: ["sustain", "riff"], avoid: ["counter"],
    note: "中高音区快速音型最像；低音区没共鸣，别在 C4 以下铺长音",
  },
  {
    id: "oboe", names: ["双簧管", "oboe", "英国管", "engl", "cor anglais"], family: "wind", range: [58, 91],
    preferred: ["sustain", "counter"], alt: ["broken"], avoid: ["arpeggio", "ostinato"],
    note: "音色太突出 ⇒ 适合长音与对位副旋律，密集十六分会抢旋律",
  },
  {
    id: "clarinet", names: ["单簧管", "黑管", "clarinet", "cl"], family: "wind", range: [50, 91],
    preferred: ["broken", "sustain"], alt: ["counter", "block"], avoid: [],
    note: "音域宽、音色温 ⇒ 内声部首选；与旋律同度齐奏会被吃掉",
  },
  {
    id: "bassoon", names: ["巴松", "大管", "bassoon", "bsn"], family: "wind", range: [34, 75],
    preferred: ["sustain", "counter"], alt: ["block"], avoid: ["arpeggio", "ostinato"],
    note: "木管低音层：长音根音（必要时 + 五音）与对位走句最稳",
  },
  {
    id: "sax", names: ["萨克斯", "sax", "saxophone", "中音萨克斯", "次中音萨克斯", "alto sax", "tenor sax"], family: "wind", range: [49, 80],
    preferred: ["riff", "broken"], alt: ["sustain"], avoid: ["block"],
    note: "riff 与切分最出味；密柱式会糊成一片",
  },
  {
    id: "trumpet", names: ["小号", "trumpet", "tp", "trb"], family: "wind", range: [55, 84],
    preferred: ["riff", "block"], alt: ["sustain"], avoid: ["arpeggio", "ostinato"],
    note: "短促有力：riff 与柱式齐奏；连续分解换气跟不上",
  },
  {
    id: "horn", names: ["圆号", "法国号", "horn", "french horn", "hr"], family: "wind", range: [41, 77],
    preferred: ["sustain", "block"], alt: ["counter"], avoid: ["riff", "arpeggio"],
    note: "柔和中音区：长音铺底与柱式；快速音型不适合",
  },
  {
    id: "lowbrass", names: ["长号", "大号", "trombone", "tuba", "tbn", "tb"], family: "wind", range: [28, 72],
    preferred: ["sustain", "block"], alt: ["riff", "counter"], avoid: ["arpeggio"],
    note: "低音铜管：长音根音/柱式低音层；长号可做短 riff，大号不要走句",
  },
  // ---------- 弦乐 ----------
  {
    id: "violin", names: ["小提琴", "violin", "vn", "vl"], family: "string", range: [55, 103],
    preferred: ["sustain", "broken"], alt: ["block", "counter"], avoid: [],
    note: "主歌长音/分解、副歌柱式齐奏；别压到低音区（G3 以下没劲）",
  },
  {
    id: "viola", names: ["中提琴", "viola", "va"], family: "string", range: [48, 88],
    preferred: ["broken", "counter"], alt: ["sustain"], avoid: [],
    note: "内声部：分解与切分；与一提琴同度会互相干涉",
  },
  {
    id: "cello", names: ["大提琴", "cello", "vc"], family: "string", range: [36, 76],
    preferred: ["counter", "block"], alt: ["sustain"], avoid: ["arpeggio"],
    note: "低音线首选：对位走句与柱式低音层；长音只给根音",
  },
  {
    id: "contrabass", names: ["低音提琴", "倍低音", "contrabass", "double bass", "cb", "db"], family: "string", range: [28, 60],
    preferred: ["sustain", "counter"], alt: [], avoid: ["broken", "arpeggio", "riff"],
    note: "只做长音根音或行走低音；任何快速音型都会糊",
  },
  {
    id: "strings", names: ["弦乐群", "弦乐组", "strings", "string section", "弦乐"], family: "string", range: [36, 96],
    preferred: ["block", "sustain"], alt: ["ostinato", "counter"], avoid: [],
    note: "群奏柱式（副歌）与长音（intro）；群奏分解会散，各声部不要同度",
  },
];

/** 归一化匹配键：去空白、去分隔符、转小写 */
const norm = (s: string): string => s.toLowerCase().replace(/[\s_\-·.]/g, "");

/** 按用户给的名字找乐器（中/英/别名皆可）；找不到返回 null */
export function findInstrument(input: string): InstrumentDef | null {
  if (!input) return null;
  const key = norm(input);
  for (const inst of INSTRUMENTS) {
    if (inst.names.some((n) => norm(n) === key)) return inst;
  }
  // 退化：包含匹配（用户可能写"中音萨克斯（alto）"这种）
  for (const inst of INSTRUMENTS) {
    if (inst.names.some((n) => key.includes(norm(n)) || norm(n).includes(key))) return inst;
  }
  return null;
}

/** 段落 → 织体倾向（对齐 `sv-texture` §2 那张表；只用于排序，不做硬门）*/
const SECTION_PREFERENCE: Record<Section, TextureType[]> = {
  intro: ["sustain", "broken"],
  verse: ["broken", "ostinato", "sustain"],
  pre: ["broken", "riff", "ostinato"],
  chorus: ["block", "arpeggio", "riff"],
  bridge: ["sustain", "counter"],
  outro: ["block", "ostinato", "sustain"],
};

export interface TextureSuggestion {
  instrument: string;
  section?: Section;
  /** 推荐顺序（首选在前）*/
  candidates: { texture: TextureType; rank: "首选" | "备选"; reason: string }[];
  /** 该乐器基本不要用的 */
  avoid: TextureType[];
  range: [number, number];
  note: string;
}

/**
 * 「推荐 → 用户选」的推荐函数：乐器 ± 段落 ⇒ 候选织体清单。
 * 排序规则：乐器首选 ∩ 段落倾向 > 乐器首选 > 段落倾向 > 乐器备选；乐器 avoid 一律剔除。
 */
export function suggestTextures(instrument: string, section?: Section): TextureSuggestion | null {
  const inst = findInstrument(instrument);
  if (!inst) return null;
  const secPref = section ? SECTION_PREFERENCE[section] : [];
  const pool: { texture: TextureType; rank: "首选" | "备选"; score: number; reason: string }[] = [];

  const push = (t: TextureType, rank: "首选" | "备选"): void => {
    if (inst.avoid.includes(t)) return;
    if (pool.some((p) => p.texture === t)) return;
    const inPref = inst.preferred.includes(t);
    const inAlt = inst.alt.includes(t);
    const secIdx = secPref.indexOf(t);
    let score = 0;
    if (inPref) score += 10;
    if (inAlt) score += 5;
    if (secIdx >= 0) score += 8 - secIdx * 2;             // 段落倾向越靠前越高
    if (inPref && secIdx === 0) score += 3;               // 双料首选
    const reasons: string[] = [];
    if (inPref) reasons.push(`${inst.id} 的首选织体`);
    else if (inAlt) reasons.push(`${inst.id} 的备选织体`);
    if (section && secIdx >= 0) reasons.push(`${section} 段落倾向`);
    pool.push({ texture: t, rank, score, reason: reasons.join(" + ") || "段落/乐器通用" });
  };

  inst.preferred.forEach((t) => push(t, "首选"));
  inst.alt.forEach((t) => push(t, "备选"));
  if (section) secPref.forEach((t) => push(t, "备选"));

  pool.sort((a, b) => b.score - a.score);
  return {
    instrument: inst.id,
    section,
    candidates: pool.map(({ texture, rank, reason }) => ({ texture, rank, reason })),
    avoid: inst.avoid,
    range: inst.range,
    note: inst.note,
  };
}

export interface InstrumentRuleResult {
  notes: TemplateNoteOut[];
  applied: string[];        // 人话记录："管乐气口：每 2 小节末留 ≥ 0.5 拍（动了 N 处）"
  droppedOutOfRange: number;
  droppedByBreath: number;
  /** 为进音域而整八度上/下移的音数（2026-09-21 起：不再"一越界就丢"）*/
  liftedIntoRange?: number;
}

/**
 * 把音高**整八度**挪进乐器音域（2026-09-21 加 · P7 真机验收发现）：
 * 旧行为"越界就丢"会让整小节没音 —— 实测长笛（60–96）遇 C 和弦（root 48 / 五音 55 双双 < 60）⇒ **该小节全空**。
 * 现在：先按 ±12 找最近的合法八度；**挪不进去才丢**（下游仍会过滤并计数）。
 */
export function liftIntoRange(pitch: number, range: [number, number]): number {
  const [lo, hi] = range;
  if (pitch >= lo && pitch <= hi) return pitch;
  for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) {
    const p = pitch + k * 12;
    if (p >= lo && p <= hi) return p;
  }
  return pitch;   // 音域窄于一个八度等情形 ⇒ 交下游丢弃
}

/**
 * 落**硬约束**到音符（可关）：
 *  - 音域：超出乐器实用音域 ⇒ 丢（并计数）。
 *  - 管乐**气口**：每 2 小节为一组，组内**最后一个音**必须在小节线前 ≥ `breathBeats` 拍结束；
 *    晚于该点的音**丢掉**（它会把呼吸缝吃掉），能截的截短。
 *  - 弦乐**换弓**：连续同音型最多 2 小节 ⇒ 每第 3 小节做一次**镜像**（以该小节和弦根音为轴），
 *    镜像后超出音域的音丢弃（计数）。
 * 说明：这是"**保证能唱/能拉**"的下限约束，不是音乐判断；`applied` 会说明动了哪几小节。
 */
export function applyInstrumentRules(
  notes: TemplateNoteOut[],
  inst: InstrumentDef,
  analysis: NoteChordAnalysis,
  opts: { breathBeats?: number; bowChangeBars?: number; apply?: boolean } = {},
): InstrumentRuleResult {
  const apply = opts.apply ?? true;
  const breathBeats = opts.breathBeats ?? 0.5;
  const bowChangeBars = opts.bowChangeBars ?? 2;
  const out: InstrumentRuleResult = { notes: notes.slice(), applied: [], droppedOutOfRange: 0, droppedByBreath: 0 };
  const bar = analysis.blickPerBar;
  const halfBeat = Math.round(analysis.blickPerBeat * breathBeats);

  // ① 音域：**先整八度挪进域内**（2026-09-21 起不再"一越界就丢"），挪不进去才丢
  let lifted = 0;
  out.notes = out.notes.map((n) => {
    const p = liftIntoRange(n.pitch, inst.range);
    if (p !== n.pitch) lifted++;
    return p === n.pitch ? n : { ...n, pitch: p };
  });
  const before = out.notes.length;
  out.notes = out.notes.filter((n) => n.pitch >= inst.range[0] && n.pitch <= inst.range[1]);
  out.droppedOutOfRange = before - out.notes.length;
  out.liftedIntoRange = lifted;
  if (lifted > 0) out.applied.push(`音域：${lifted} 个音整八度移入 ${inst.range[0]}–${inst.range[1]}`);
  if (out.droppedOutOfRange > 0) out.applied.push(`音域：丢弃 ${out.droppedOutOfRange} 个超出 ${inst.range[0]}–${inst.range[1]} 且挪不进去的音`);
  if (!apply) return out;

  // ② 管乐气口：每 breathBars(默认2) 小节一组，组尾留缝
  if (inst.family === "wind") {
    const bars = [...new Set(out.notes.map((n) => Math.floor(n.onsetBlick / bar)))].sort((a, b) => a - b);
    let touched = 0, dropped = 0;
    for (const b of bars) {
      const groupIdx = Math.floor((b - bars[0]) / 2);
      const isGroupEnd = !bars.includes(b + 1) || Math.floor((b + 1 - bars[0]) / 2) !== groupIdx;
      if (!isGroupEnd) continue;
      const barEnd = (b + 1) * bar;
      const inBar = out.notes.filter((n) => Math.floor(n.onsetBlick / bar) === b);
      if (inBar.length === 0) continue;
      const last = inBar.reduce((m, n) => (n.onsetBlick > m.onsetBlick ? n : m));
      const limit = barEnd - halfBeat - last.onsetBlick;
      if (limit <= 0) { out.notes = out.notes.filter((n) => n !== last); dropped++; touched++; continue; }
      if (last.durationBlick > limit) { last.durationBlick = limit; touched++; }
    }
    out.droppedByBreath = dropped;
    out.applied.push(`管乐气口：每 2 小节组尾留 ≥ ${breathBeats} 拍（动 ${touched} 处 · 丢 ${dropped} 个尾音）`);
  }

  // ③ 弦乐换弓：每第 (bowChangeBars+1) 小节镜像一次
  if (inst.family === "string") {
    const bars = [...new Set(out.notes.map((n) => Math.floor(n.onsetBlick / bar)))].sort((a, b) => a - b);
    const targets: number[] = [];
    for (let i = 0; i < bars.length; i++) if (i % (bowChangeBars + 1) === bowChangeBars) targets.push(bars[i] + 1); // 1 起
    if (targets.length > 0) {
      const beforeLen = out.notes.length;
      let mirrorLifted = 0;
      const mirrored = out.notes.map((n) => {
        const b = Math.floor(n.onsetBlick / bar) + 1;
        if (!targets.includes(b)) return n;
        // 镜像轴 = 该小节和弦的根音（与 template.transformBars 同口径），查不到才退回 C4
        const w = analysis.windows.find((x) => x.bar === b);
        const parsed = w ? parseChordName(w.name) : null;
        const axis = parsed ? 48 + parsed.rootPc : 60;
        const m = axis - (n.pitch - axis);
        const p = liftIntoRange(m, inst.range);   // 镜像后越界 ⇒ 先整八度挪进来（2026-09-21）
        if (p !== m) mirrorLifted++;
        return { ...n, pitch: p };
      }).filter((n) => n.pitch >= inst.range[0] && n.pitch <= inst.range[1]);
      out.notes = mirrored;
      const mirrorDropped = beforeLen - out.notes.length;
      out.liftedIntoRange = (out.liftedIntoRange ?? 0) + mirrorLifted;
      out.applied.push(`弦乐换弓：第 ${targets.join("/")} 小节镜像` +
        (mirrorLifted > 0 ? `（${mirrorLifted} 个镜像音整八度移入域内` : "（") +
        ` · 丢 ${mirrorDropped} 个挪不进去的）`);
    }
  }
  out.notes.sort((a, b) => (a.onsetBlick - b.onsetBlick) || (a.pitch - b.pitch));
  return out;
}

/** 供 skill 文档/工具输出用：一行候选摘要 */
export function describeSuggestion(s: TextureSuggestion): string {
  const top = s.candidates.slice(0, 3).map((c) => `${c.texture}(${c.rank})`).join(" / ");
  return `${s.instrument}${s.section ? " · " + s.section : ""}：${top}`;
}
