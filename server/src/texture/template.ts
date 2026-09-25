/**
 * 模板织体：**首小节 → 模仿写出其余**（P7「IX 织体生成」的写入核心）
 *
 * 算法照搬已实测可用的 `[IX]模板织体生成.js`（TextureGen，IX 侧边栏 761 行）：
 *   ① 模板音符 → 「和弦内序位 degree ＋ 八度 octave」（和弦音）；
 *      非和弦音不丢，改用「相对模板小节根音的音程 interval」表达；
 *   ② 套到目标小节 = 目标和弦根音 ＋ 同序位音（序位超出目标和弦音数就**折回**、并进八度），
 *      非和弦音**吸附到目标和弦里最近的音**（保证落在和弦内）；
 *   ③ 模板小节**原样保留**，其余小节按窗口覆盖；
 *   ④ 模板跨多小节时，按 `barIndex` 在目标小节上**循环**（周期 = 模板小节数）。
 *
 * 与 JS 的差异（有意）：根音基准、音域过滤、转位/八度整体平移做成**显式参数**，
 * 并把"被跳过的音符/小节"如实报出来（JS 是静默 continue）。
 */

import { parseChordName } from "../audio/chords.js";
import type { NoteChordAnalysis, TextureNoteIn } from "./chords-from-notes.js";

/** 模板小节根音的基准音高（与 JS 一致：C3 = 48） */
const ROOT_BASE = 48;

export interface TemplateVoice {
  barIndex: number;      // 模板内第几小节（0 起）
  offsetBlick: number;   // 相对本小节起点
  durationBlick: number;
  degree: number;        // 和弦音序位（1 起；0 = 非和弦音）
  octave: number;        // 相对根音八度的偏移
  interval: number;      // 非和弦音：相对模板小节根音的半音数
  pitch: number;         // 模板里的原始音高
  lyrics?: string;
  dynamic?: number;
  isChordTone: boolean;
}

export interface TemplateAbstract {
  voices: TemplateVoice[];
  numBars: number;
  templateBar: number;         // 1 起（模板首小节）
  templateStartBlick: number;  // 模板首小节线
  templateEndBlick: number;    // 模板末小节线（= 末音符所在小节的下一小节线）
  skipped: number;             // 因所在小节无和弦而被跳过的音符数
}

export interface TemplateNoteOut {
  pitch: number;
  onsetBlick: number;
  durationBlick: number;
  lyrics?: string;
  dynamic?: number;
}

export interface InstantiateOptions {
  /** 生成范围（小节号，1 起；默认 = 模板首小节 ~ 最后一个有和弦的小节）*/
  rangeStartBar?: number;
  rangeEndBar?: number;
  /** 模板小节原样保留（默认 true）*/
  preserveTemplate?: boolean;
  /** 和弦转位：所有音整体移动几个"和弦内序位"（±1 = 上一/下一个和弦音）*/
  voicingShift?: number;
  /** 整体八度平移（半音数，12 的倍数最常用）*/
  octaveShift?: number;
  /** 音域过滤（含端点），超出即丢弃并计数 */
  pitchRange?: [number, number];
}

export interface InstantiateResult {
  notes: TemplateNoteOut[];
  bars: number[];         // 实际写出的小节号
  emptyBars: number[];    // 窗口存在但没有可用模板音的小节
  preservedBars: number[];// 因是模板小节而原样保留的小节
  droppedOutOfRange: number;
}

/** 找某小节的和弦名（按窗口 bar 精确匹配，与 JS 同口径）*/
function chordAt(analysis: NoteChordAnalysis, bar: number): string | null {
  for (const w of analysis.windows) if (w.bar === bar && w.name && w.name !== "-") return w.name;
  return null;
}

/**
 * ① 模板抽象：把模板音符换算成「和弦序位 + 八度」。
 * @param notes 模板音符（绝对 blick onset）
 */
/** 模板输入音符（可选带歌词/力度，会被带进生成结果）*/
export type TemplateNoteIn = TextureNoteIn & { lyrics?: string; dynamic?: number };

export function abstractTemplate(
  notes: TemplateNoteIn[],
  analysis: NoteChordAnalysis,
  opts: { startBlick?: number; endBlick?: number } = {},
): TemplateAbstract {
  const bar = analysis.blickPerBar;
  const valid = notes
    .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.onsetBlick))
    .map((n) => ({ ...n, pitch: Math.round(n.pitch), onsetBlick: Math.round(n.onsetBlick), durationBlick: Math.max(1, Math.round(n.durationBlick || bar / 4)) }));

  if (valid.length === 0) {
    return { voices: [], numBars: 0, templateBar: 1, templateStartBlick: 0, templateEndBlick: 0, skipped: 0 };
  }

  // 模板小节范围：按"音符 onset 所在小节"取（JS 同口径，避免尾音跨小节误判）
  const firstBar = Math.floor(Math.min(...valid.map((n) => n.onsetBlick)) / bar);
  const lastBar = Math.floor(Math.max(...valid.map((n) => n.onsetBlick)) / bar);
  const startBlick = opts.startBlick ?? firstBar * bar;
  const endBlick = opts.endBlick ?? (lastBar + 1) * bar;
  const numBars = Math.max(1, Math.round((endBlick - startBlick) / bar));

  const voices: TemplateVoice[] = [];
  let skipped = 0;
  for (const n of valid) {
    const noteBar = Math.floor(n.onsetBlick / bar) + 1;          // 1 起
    const chordName = chordAt(analysis, noteBar);
    if (!chordName) { skipped++; continue; }                      // 该小节无和弦 ⇒ 跳过（同 JS）
    const parsed = parseChordName(chordName);
    if (!parsed) { skipped++; continue; }
    const rootPitch = ROOT_BASE + parsed.rootPc;
    const pc = ((n.pitch % 12) + 12) % 12;

    let degree = 0, octave = 0;
    for (let c = 0; c < parsed.intervals.length; c++) {
      const rel = ((parsed.rootPc + parsed.intervals[c]) % 12 + 12) % 12;
      if (rel === pc) {
        degree = c + 1;
        octave = Math.round((n.pitch - rootPitch - parsed.intervals[c]) / 12);
        break;
      }
    }
    const barIdx = Math.floor(n.onsetBlick / bar) - Math.floor(startBlick / bar);
    voices.push({
      barIndex: barIdx,
      offsetBlick: n.onsetBlick - (Math.floor(n.onsetBlick / bar) * bar),
      durationBlick: n.durationBlick,
      degree,
      octave,
      interval: n.pitch - rootPitch,
      pitch: n.pitch,
      lyrics: (n as { lyrics?: string }).lyrics,
      dynamic: (n as { dynamic?: number }).dynamic,
      isChordTone: degree > 0,
    });
  }
  voices.sort((a, b) => (a.barIndex - b.barIndex) || (a.offsetBlick - b.offsetBlick));
  return {
    voices,
    numBars,
    templateBar: Math.floor(startBlick / bar) + 1,
    templateStartBlick: startBlick,
    templateEndBlick: endBlick,
    skipped,
  };
}

/** 目标和弦里离 rawPitch 最近的音（枚举和弦音 × 上下一个八度，同 JS）*/
function snapToChord(rawPitch: number, rootPitch: number, intervals: number[]): number {
  let best = rawPitch, bestD = Infinity;
  for (const iv of intervals) {
    for (let oct = -1; oct <= 1; oct++) {
      const cand = rootPitch + iv + (Math.round((rawPitch - rootPitch - iv) / 12) + oct) * 12;
      const d = Math.abs(cand - rawPitch);
      if (d < bestD) { bestD = d; best = cand; }
    }
  }
  return best;
}

/**
 * ② 实例化：按每个目标小节的和弦重建音符。
 */
export function instantiateTemplate(
  ab: TemplateAbstract,
  analysis: NoteChordAnalysis,
  opts: InstantiateOptions = {},
): InstantiateResult {
  const bar = analysis.blickPerBar;
  const preserve = opts.preserveTemplate ?? true;
  const voicingShift = opts.voicingShift ?? 0;
  const octaveShift = opts.octaveShift ?? 0;
  const range = opts.pitchRange;

  const out: InstantiateResult = { notes: [], bars: [], emptyBars: [], preservedBars: [], droppedOutOfRange: 0 };
  if (ab.voices.length === 0 || ab.numBars === 0) return out;

  const sorted = analysis.windows.slice().sort((a, b) => a.bar - b.bar);
  const withChord = sorted.filter((w) => w.name && w.name !== "-");
  if (withChord.length === 0) return out;

  const startBar = opts.rangeStartBar ?? withChord[0].bar;
  const endBar = opts.rangeEndBar ?? withChord[withChord.length - 1].bar;

  for (const w of sorted) {
    if (w.bar < startBar || w.bar > endBar) continue;
    if (!w.name || w.name === "-") continue;

    // 模板小节原样保留（不重写、不清空）
    if (preserve && w.startBlick >= ab.templateStartBlick && w.startBlick < ab.templateEndBlick) {
      out.preservedBars.push(w.bar);
      continue;
    }
    const parsed = parseChordName(w.name);
    if (!parsed) continue;
    const rootPitch = ROOT_BASE + parsed.rootPc;
    const iv = parsed.intervals;

    // 模板小节循环：目标第 n 小节 → 模板第 ((n-1) mod numBars) 小节
    const tplBar = ((w.bar - 1) % ab.numBars + ab.numBars) % ab.numBars;
    const voices = ab.voices.filter((v) => v.barIndex === tplBar);
    if (voices.length === 0) { out.emptyBars.push(w.bar); continue; }

    let wrote = 0;
    for (const v of voices) {
      let pitch: number;
      if (v.isChordTone && iv.length > 0) {
        const deg = v.degree - 1 + voicingShift;
        const wrap = ((deg % iv.length) + iv.length) % iv.length;
        const carry = Math.floor(deg / iv.length);
        pitch = rootPitch + iv[wrap] + (v.octave + carry) * 12 + octaveShift;
      } else {
        pitch = snapToChord(rootPitch + v.interval + octaveShift, rootPitch, iv);
      }
      if (pitch < 0 || pitch > 127) { out.droppedOutOfRange++; continue; }
      if (range && (pitch < range[0] || pitch > range[1])) { out.droppedOutOfRange++; continue; }
      const onset = w.startBlick + v.offsetBlick;
      out.notes.push({
        pitch,
        onsetBlick: onset,
        durationBlick: v.durationBlick,
        lyrics: v.lyrics,
        dynamic: v.dynamic,
      });
      wrote++;
    }
    if (wrote > 0) out.bars.push(w.bar);
    else out.emptyBars.push(w.bar);
  }
  out.notes.sort((a, b) => (a.onsetBlick - b.onsetBlick) || (a.pitch - b.pitch));
  return out;
}

/**
 * ③ 音型变换（弦乐"换弓"、颜色变化用）：对某几小节做镜像/反向。
 * 只在同一层内改音高关系，不动节奏 —— 用于"连续同音型 ≤ 2 小节"这条乐器约束。
 */
export function transformBars(
  notes: TemplateNoteOut[],
  bars: number[],
  mode: "mirror" | "octave",
  analysis: NoteChordAnalysis,
  octaveDelta = 12,
): TemplateNoteOut[] {
  const set = new Set(bars);
  return notes.map((n) => {
    const b = Math.floor(n.onsetBlick / analysis.blickPerBar) + 1;
    if (!set.has(b)) return n;
    if (mode === "octave") return { ...n, pitch: n.pitch + octaveDelta };
    // mirror：以本小节和弦根音为轴对称
    const w = analysis.windows.find((x) => x.bar === b);
    const parsed = w ? parseChordName(w.name) : null;
    const axis = parsed ? ROOT_BASE + parsed.rootPc : 60;
    return { ...n, pitch: axis - (n.pitch - axis) };
  });
}
