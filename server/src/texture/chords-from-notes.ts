/**
 * 工程内音符 → 和弦序列（P7「IX 织体生成」的和弦来源之一：「MIDI 分析」）
 *
 * 与音频路线的区别：音频侧走 STFT→chroma（`dsp.chroma`），这里直接由**音符**按时值加权
 * 累出 12 维音高类向量，再喂**同一套** `detectChord` / `detectKeyKrumhansl`
 * ⇒ 判定口径与 `sv_analyze_chord` 完全一致，只是"证据"从频谱换成音符。
 *
 * 形状对齐 `[IX]旋律和弦生成.js` 的 `analyzeMelody()` 产物（`chordAnalysis`），
 * 便于与宿主机里那个侧边栏脚本互操作：
 *   { key: { name, tonic, mode, confidence }, windows: [{ name, startBlick, durationBlick, bar, ... }] }
 *
 * 窗口字段名与 `audio/chords.ts` 的 `ChordSeg`（name/startBlick/durationBlick）**结构兼容**，
 * 因此可直接喂 `chordsToNotes()` 出柱式/分解/琶音骨架。
 */

import { detectChord, detectKeyKrumhansl } from "../audio/dsp.js";

/** 1 四分音符 = 705600000 blick（协议常量，与桥一致） */
export const QUARTER = 705600000;

export interface TextureNoteIn {
  pitch: number;
  onsetBlick: number;
  durationBlick: number;
}

export interface ChordWindow {
  name: string;            // 和弦名；"-" = 本窗无有效和弦
  startBlick: number;
  durationBlick: number;
  bar: number;             // 1 起
  pcs: number[];           // 本窗出现过的音高类（0=C）
  noteCount: number;
  score: number;
  alternatives: { name: string; score: number }[];
  /** 仅 `analysisFromSegs` 会置：本小节没有独立和弦段，是**沿用前一个和弦**补出来的 */
  carried?: boolean;
}

export interface NoteChordAnalysis {
  key: { name: string; tonic: number; mode: "major" | "minor"; confidence: number };
  windows: ChordWindow[];
  pitchClassVector: number[];
  blickPerBeat: number;
  beatsPerMeasure: number;
  blickPerBar: number;
}

export interface AnalyzeNotesOptions {
  /** 每窗拍数（默认 = 一小节）；想"两拍一和弦"传 2 */
  segBeats?: number;
  /** 每小节拍数（默认 4） */
  beatsPerMeasure?: number;
  /** 起始位置（默认取音符最早 onset） */
  startBlick?: number;
  /** 窗口总长（默认覆盖到最后一个音符结束） */
  totalBlick?: number;
  /** 和弦候选数（默认 4，给"替代和弦"用） */
  maxCandidates?: number;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const pcOf = (pitch: number): number => ((Math.round(pitch) % 12) + 12) % 12;

function normalize(vec: number[]): number[] {
  const sum = vec.reduce((a, b) => a + b, 0);
  if (sum <= 0) return vec.slice();
  return vec.map((v) => v / sum);
}

/**
 * 由音符推和弦。**纯本地、无依赖宿主**（测试可离线跑）。
 *
 * 权重口径：音符在与窗口的重叠时长（截断到窗口内），
 * 这样跨小节的长音不会被整段算进某一小节。
 */
export function analyzeChordsFromNotes(
  notes: TextureNoteIn[],
  opts: AnalyzeNotesOptions = {},
): NoteChordAnalysis {
  const beatsPerMeasure = opts.beatsPerMeasure ?? 4;
  const blickPerBeat = QUARTER;
  const blickPerBar = blickPerBeat * beatsPerMeasure;
  const segBeats = opts.segBeats ?? beatsPerMeasure;
  const windowBlick = Math.max(1, Math.round(segBeats * blickPerBeat));

  const valid = notes
    .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.onsetBlick) && Number.isFinite(n.durationBlick))
    .map((n) => ({ pitch: Math.round(n.pitch), onsetBlick: Math.round(n.onsetBlick), durationBlick: Math.max(1, Math.round(n.durationBlick)) }));
  valid.sort((a, b) => a.onsetBlick - b.onsetBlick);

  // 全局音高类向量（时值加权）→ 调性
  const globalVec = new Array(12).fill(0);
  for (const n of valid) globalVec[pcOf(n.pitch)] += n.durationBlick;
  const keyRes = detectKeyKrumhansl(Float32Array.from(normalize(globalVec)));
  const tonicName = keyRes.key.split(/\s+/)[0];
  const tonic = Math.max(0, NOTE_NAMES.indexOf(tonicName));

  const out: NoteChordAnalysis = {
    key: {
      name: keyRes.key,
      tonic,
      mode: keyRes.scale,
      confidence: keyRes.confidence,
    },
    windows: [],
    pitchClassVector: globalVec,
    blickPerBeat,
    beatsPerMeasure,
    blickPerBar,
  };
  if (valid.length === 0) return out;

  const firstOnset = opts.startBlick ?? valid[0].onsetBlick;
  const lastEnd = valid.reduce((m, n) => Math.max(m, n.onsetBlick + n.durationBlick), 0);
  const total = opts.totalBlick ?? Math.max(windowBlick, lastEnd - firstOnset);
  const numWindows = Math.max(1, Math.ceil(total / windowBlick));

  for (let w = 0; w < numWindows; w++) {
    const start = firstOnset + w * windowBlick;
    const end = start + windowBlick;
    const vec = new Array(12).fill(0);
    const pcs: number[] = [];
    let noteCount = 0;
    for (const n of valid) {
      const nStart = n.onsetBlick;
      const nEnd = n.onsetBlick + n.durationBlick;
      const overlap = Math.min(nEnd, end) - Math.max(nStart, start);
      if (overlap <= 0) continue;
      const pc = pcOf(n.pitch);
      vec[pc] += overlap;
      if (!pcs.includes(pc)) pcs.push(pc);
      noteCount++;
    }
    const norm = normalize(vec);
    const cands = noteCount > 0 ? detectChord(Float32Array.from(norm), opts.maxCandidates ?? 4) : [];
    const top = cands[0];
    out.windows.push({
      name: top ? top.name : "-",
      startBlick: start,
      durationBlick: windowBlick,
      bar: Math.floor(start / blickPerBar) + 1,
      pcs: pcs.sort((a, b) => a - b),
      noteCount,
      score: top ? top.score : 0,
      alternatives: cands.slice(1).map((c) => ({ name: c.name, score: c.score })),
    });
  }
  return out;
}

/** 把窗口压成 `chords.ts` 的 `ChordSeg` 形状（喂 `chordsToNotes` 用） */
export function windowsToSegs(
  analysis: NoteChordAnalysis,
  opts: { skipEmpty?: boolean } = {},
): { name: string; startBlick: number; durationBlick: number }[] {
  const skipEmpty = opts.skipEmpty ?? true;
  return analysis.windows
    .filter((w) => (skipEmpty ? w.name !== "-" : true))
    .map((w) => ({ name: w.name, startBlick: w.startBlick, durationBlick: w.durationBlick }));
}

/**
 * **音频分析**结果（`audio/chord-track.ts` 的 `ChordSeg[]`）→ 与本模块同形的分析结果。
 * 用途：`sv_write_texture` 的 `chordSource:"audio"` —— 音频路线复用 `sv_write_chords` 同一套扒带链路，
 * 这里只做形状转换，保证下游（模板实例化 / 渲染 / 硬约束）**只有一条代码路径**。
 *
 * ⚠️ 两处必须做的归整（2026-09-19 用真实 WAV 实测踩到）：
 *  ① **起点量化到十六分音符** —— 扒带给的 `startBlick` 有浮点误差（实测 7.99 拍），
 *     直接 `floor` 会把"第 3 小节"标成第 2 小节；
 *  ② **一律按"每小节一个窗口"展开** —— 一个和弦段可能横跨多小节（2 小节一个和弦很常见），
 *     若一个段只出一个窗口，后面那几小节就没有织体（会漏）；没有段覆盖的小节按 `fillGaps`
 *     沿用前一个和弦并标 `carried:true`（如实告知是补出来的），否则记 `"-"` 跳过。
 */
export function analysisFromSegs(
  segs: { name: string; startBlick: number; durationBlick: number }[],
  opts: { keyName?: string; beatsPerMeasure?: number; fillGaps?: boolean } = {},
): NoteChordAnalysis {
  const beatsPerMeasure = opts.beatsPerMeasure ?? 4;
  const blickPerBar = QUARTER * beatsPerMeasure;
  const fillGaps = opts.fillGaps ?? true;
  const keyName = opts.keyName && opts.keyName.trim() ? opts.keyName.trim() : "C major";
  const parts = keyName.split(/\s+/);
  const tonic = Math.max(0, NOTE_NAMES.indexOf(parts[0]));
  const mode: "major" | "minor" = (parts[1] ?? "major").toLowerCase().startsWith("min") ? "minor" : "major";
  const sixteenth = QUARTER / 4;
  const snap = (b: number): number => Math.round(b / sixteenth) * sixteenth;
  const barOf = (b: number): number => Math.floor(snap(b) / blickPerBar) + 1;

  const clean = segs
    .filter((s) => s.name && s.name !== "-")
    .map((s) => {
      const start = snap(s.startBlick);                       // 起点量化（治 7.99 拍那种浮点误差）
      const end = start + Math.max(sixteenth, s.durationBlick); // 终点**不量化**，否则会多吃一小节
      return { name: s.name, startBar: barOf(start), endBar: Math.floor((end - 1) / blickPerBar) + 1 };
    })
    .sort((a, b) => a.startBar - b.startBar);

  const windows: ChordWindow[] = [];
  if (clean.length === 0) {
    return {
      key: { name: keyName, tonic, mode, confidence: 0 },
      windows,
      pitchClassVector: new Array(12).fill(0),
      blickPerBeat: QUARTER,
      beatsPerMeasure,
      blickPerBar,
    };
  }
  const lastBar = clean.reduce((m, s) => Math.max(m, s.endBar), clean[0].endBar);
  let prevName = clean[0].name;
  for (let bar = clean[0].startBar; bar <= lastBar; bar++) {
    const hit = clean.find((s) => bar >= s.startBar && bar <= s.endBar);
    const name = hit ? hit.name : (fillGaps ? prevName : "-");
    if (hit) prevName = hit.name;
    windows.push({
      name,
      startBlick: (bar - 1) * blickPerBar,
      durationBlick: blickPerBar,
      bar,
      pcs: [],
      noteCount: 0,
      score: hit ? 1 : 0,
      alternatives: [],
      ...(hit ? {} : { carried: true }),
    });
  }
  return {
    key: { name: keyName, tonic, mode, confidence: 1 },
    windows,
    pitchClassVector: new Array(12).fill(0),
    blickPerBeat: QUARTER,
    beatsPerMeasure,
    blickPerBar,
  };
}

/** 取"第 n 小节（1 起）"的和弦名；没有则返回 null */
export function chordAtBar(analysis: NoteChordAnalysis, bar: number): string | null {
  for (const w of analysis.windows) if (w.bar === bar && w.name !== "-") return w.name;
  return null;
}

/**
 * 显式和弦进行 → 与 `analyzeChordsFromNotes` 同形的分析结果。
 * 用途：用户直接给 `['C','G','Am','F']`（不依赖音频、也不依赖工程内音符）时的第三种和弦来源。
 * @param progression 逐小节循环的和弦名
 * @param opts.bars 总小节数；opts.startBar 起始小节（1 起，默认 1）
 */
export function analysisFromProgression(
  progression: string[],
  opts: { bars?: number; startBar?: number; beatsPerMeasure?: number; key?: { tonic: number; mode: "major" | "minor" } } = {},
): NoteChordAnalysis {
  const beatsPerMeasure = opts.beatsPerMeasure ?? 4;
  const blickPerBar = QUARTER * beatsPerMeasure;
  const bars = Math.max(1, opts.bars ?? progression.length);
  const startBar = Math.max(1, opts.startBar ?? 1);
  const windows: ChordWindow[] = [];
  for (let i = 0; i < bars; i++) {
    const bar = startBar + i;
    const name = progression.length > 0 ? progression[i % progression.length] : "-";
    windows.push({
      name,
      startBlick: (bar - 1) * blickPerBar,
      durationBlick: blickPerBar,
      bar,
      pcs: [],
      noteCount: 0,
      score: 1,
      alternatives: [],
    });
  }
  return {
    key: {
      name: opts.key ? `${NOTE_NAMES[opts.key.tonic]} ${opts.key.mode}` : "C major",
      tonic: opts.key ? opts.key.tonic : 0,
      mode: opts.key ? opts.key.mode : "major",
      confidence: opts.key ? 1 : 0,
    },
    windows,
    pitchClassVector: new Array(12).fill(0),
    blickPerBeat: QUARTER,
    beatsPerMeasure,
    blickPerBar,
  };
}
