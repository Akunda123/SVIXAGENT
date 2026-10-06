/**
 * MusicXML 音符 → **ACE `note add` 的载荷**（纯函数，不碰 ACE ⇒ 可单测）。
 *
 * 实测钉死的三件事（`acestudio-cli help note-exclusivity` / `note add --help`，2026-10-05）：
 *   ① `note add` 的 `pos`/`dur` 是 **clip-local ticks**（**相对 clip 起点**，不是绝对时间！）；
 *   ② tick 是**固定时间栅格**，不是 tempo 相对 ⇒ 从 `clip list` 的 `clipBegin`/`clipBeginSec` 反算
 *      （本机 1080 tick/s），**不能硬编码**；
 *   ③ **Sing 轨单音**（重叠整笔被拒 `NOTE_OVERLAP`）、**Instrument / GenericMidi 复调**（允许重叠）。
 *
 * ⇒ 本模块只做"把音乐时间换成 tick、把歌词按 Sing 轨的音节规则摊开"这两件；
 *   是否拆线/是否冲突由 `fit-notes.ts` 与本模块的 `planNotesForClip` 决定，**写入与拒绝交给 ACE**。
 */
import { flattenToMonophonic, noteEnd, type FitNote } from './fit-notes.js';

/** MusicXML 侧的一个音符（时值以**四分音符**为单位，调用方从 `<divisions>` 换算好）。 */
export interface MxNoteQ {
  /** 起点（四分音符数，相对乐曲开头） */
  startQ: number;
  /** 时值（四分音符数） */
  durQ: number;
  /** MIDI 音高 */
  pitch: number;
  /** 歌词（无 = undefined；延续音语义由调用方给 `tenuto: true`） */
  lyric?: string;
  /** 是不是"延续音"（同一音节的后继音）⇒ ACE 里 `lyric` 写**字面 `-`** */
  tenuto?: boolean;
  /** 语种覆盖（一般别给 —— 轨有默认语言） */
  language?: string;
}

/** ACE `note add --notes` 的一条（字段名与 CLI 完全一致）。 */
export interface AceNotePayload {
  pos: number;
  dur: number;
  pitch: number;
  lyric?: string;
  language?: string;
  articulation?: string;
}

export interface TickMath {
  /** 每分钟四分音符数（= BPM）。缺省时**必须先向用户/工程读出来**，别猜。 */
  bpm: number;
  /** 每秒多少个 ACE tick（从 `clip list` 的 `clipBegin`/`clipBeginSec` 反算） */
  ticksPerSecond: number;
  /** 目标 clip 的起点（**绝对 tick**；`note add` 的 pos 是相对它的 ⇒ 要减掉） */
  clipStartTick: number;
  /** 时间轴整体偏移（四分音符数；例如想把第 5 小节对到 clip 开头 ⇒ 传 4） */
  offsetQ?: number;
}

/** 一个四分音符换算成 tick（本机 1080 tick/s、130bpm ⇒ 498.46…）。 */
export function quarterToTicks(math: TickMath): number {
  if (!(math.bpm > 0)) throw new Error('bpm 必须 > 0（请从工程/用户读，不要默认 120）');
  if (!(math.ticksPerSecond > 0)) throw new Error('ticksPerSecond 必须 > 0（从 clip list 的 clipBegin/clipBeginSec 反算）');
  return (60 / math.bpm) * math.ticksPerSecond;
}

/** 从 `clip list` 的一条 clip 反算 tick 率（两条数据都在 ⇒ 交叉校验）。 */
export function ticksPerSecondFromClip(c: { clipBegin?: number; clipBeginSec?: number; clipEnd?: number; clipEndSec?: number }): number | null {
  const cands: number[] = [];
  if (c.clipBegin && c.clipBeginSec) cands.push(c.clipBegin / c.clipBeginSec);
  if (c.clipEnd && c.clipEndSec) cands.push(c.clipEnd / c.clipEndSec);
  if (!cands.length) return null;
  const avg = cands.reduce((a, b) => a + b, 0) / cands.length;
  // 两条差得太多说明读错了字段 ⇒ 如实报错，别凑合
  if (cands.length === 2 && Math.abs(cands[0] - cands[1]) > 0.5) {
    throw new Error(`clip 的 tick 率两处不一致（${cands[0]} vs ${cands[1]}）—— 字段读错了？`);
  }
  return avg;
}

/** MusicXML 音符 → **绝对 tick** 的中间形态（`dur`/`start` 都是 tick）。 */
export function mxToTicks(notes: readonly MxNoteQ[], math: TickMath): FitNote[] {
  const perQ = quarterToTicks(math);
  const off = (math.offsetQ || 0) * perQ;
  return notes.map((n, i) => ({
    start: (n.startQ * perQ) - off,
    dur: Math.max(1, Math.round(n.durQ * perQ)),
    pitch: n.pitch,
    lyric: n.tenuto ? '-' : n.lyric,
    tag: `#${i + 1}${n.tenuto ? '(tenuto)' : ''}`,
  }));
}

/** 绝对 tick → clip-local，并落成 ACE 载荷（**Song 轨的 `lyric` 规则在这里统一**）。 */
export function toAcePayload(
  notes: readonly (FitNote & { language?: string; articulation?: string })[],
  math: TickMath,
): AceNotePayload[] {
  return notes.map((n) => {
    const pos = Math.round(n.start) - math.clipStartTick;
    const dur = Math.max(1, Math.round(n.dur));
    const out: AceNotePayload = { pos, dur, pitch: n.pitch };
    if (n.lyric !== undefined) out.lyric = n.lyric;
    if (n.language) out.language = n.language;         // ⚠️ 能不给就别给（轨有默认语言）
    if (n.articulation) out.articulation = n.articulation;
    return out;
  });
}

/** 目标 clip 的类型（决定能不能写和弦）。 */
export type AceClipKind = 'Sing' | 'Instrument' | 'GenericMidi' | 'Audio' | 'Chord' | string;

export interface PlanInput {
  notes: readonly (FitNote & { language?: string; articulation?: string })[];
  math: TickMath;
  /** 目标 clip 类型（从 `clip list` 的 `clipType` 来） */
  clipKind: AceClipKind;
  /** 目标 clip 里**现有**音符（绝对 tick；来自 `note-content` 换算） */
  existing?: readonly FitNote[];
}

export interface PlanResult {
  ok: boolean;
  /** 要写进 ACE 的载荷（`ok:false` 时为空 —— **绝不半写**） */
  payload: AceNotePayload[];
  /** 会不会与现有音符冲突（有交集 ⇒ `ok:false`，绝不裁现有音） */
  conflicts: { mine: FitNote; theirs: { label: string; start: number; end: number } }[];
  /** 自己内部的音之间交叠对数（Sing 轨 >0 就要先拆线） */
  selfOverlaps: number;
  /** Sing 轨拆出来的线（>1 条 ⇒ 需要多条轨/多个 clip，**要问用户**） */
  lines: FitNote[][];
  /** 丢掉的音（和弦里没留的等等） */
  dropped: FitNote[];
  reason?: string;
}

/**
 * 落位计划（**只算不写**）：
 *   · Sing 轨：先压成单线（`flattenToMonophonic`）；若拆出 >1 条线 ⇒ **不自动写**，报给用户选；
 *   · Instrument / GenericMidi：允许多音，原样进（但要报"与现有音重叠"——那两类**允许**重叠，
 *     所以重叠**不算冲突**，只是如实告知）；
 *   · Audio / Chord：没有 pitched notes ⇒ 直接拒。
 */
export function planNotesForClip(input: PlanInput): PlanResult {
  const { notes, math, clipKind } = input;
  const existing = input.existing || [];
  if (clipKind === 'Audio' || clipKind === 'Chord') {
    return { ok: false, payload: [], conflicts: [], selfOverlaps: 0, lines: [], dropped: [], reason: `clip 类型 ${clipKind} 没有 pitched notes，写不进去` };
  }
  const isSing = String(clipKind).toLowerCase() === 'sing';

  if (!isSing) {
    // 复调轨：原样；重叠允许 ⇒ 只如实告知，不算冲突
    const payload = toAcePayload(notes as never, math);
    const overlapInfo = existing.length
      ? notes.filter((n) => existing.some((e) => n.start < noteEnd(e) && e.start < noteEnd(n))).length
      : 0;
    return {
      ok: payload.length > 0, payload, conflicts: [], selfOverlaps: overlapInfo,
      lines: [notes as FitNote[]], dropped: [],
      reason: overlapInfo ? `该 clip 是 ${clipKind}（复调，允许重叠）—— 其中 ${overlapInfo} 个音与现有音重叠，已如实告知但**不拦**` : undefined,
    };
  }

  // Sing：单音 ⇒ 先压平
  const flat = flattenToMonophonic(notes as FitNote[]);
  if (flat.lines.length > 1) {
    return {
      ok: false, payload: [], conflicts: [], selfOverlaps: flat.overlapPairs, lines: flat.lines, dropped: flat.dropped,
      reason: `Sing clip 是**单音**：这批音要拆成 ${flat.lines.length} 条线才能放下 —— 请选一条线写，或拆到多条轨/多个 clip（我不自动拆）`,
    };
  }
  const line = flat.lines[0] || [];
  const conflicts = existing.flatMap((e) => line.filter((n) => n.start < noteEnd(e) && e.start < noteEnd(n))
    .map((n) => ({ mine: n, theirs: { label: e.tag || `pitch ${e.pitch}`, start: e.start, end: noteEnd(e) } })));
  if (conflicts.length) {
    return {
      ok: false, payload: [], conflicts, selfOverlaps: flat.overlapPairs, lines: flat.lines, dropped: flat.dropped,
      reason: `与现有 ${conflicts.length} 个音冲突 —— ACE 会整笔拒（NOTE_OVERLAP）。**绝不替你裁现有音**：请先自己挪/删，或换 clip / 换空闲区间`,
    };
  }
  return {
    ok: line.length > 0, payload: toAcePayload(line as never, math), conflicts: [], selfOverlaps: flat.overlapPairs,
    lines: flat.lines, dropped: flat.dropped,
  };
}
