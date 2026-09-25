/**
 * 和弦序列提取模块：逐帧 chroma → 互相关模板评分 → 时间序列 → 合并去噪。
 * 用于 sv_write_chords：把一段音频的和弦随时间变化提取成每小节一条的和弦表。
 */

import { readMonoFromWav, AnalyzeResult } from "./analyze.js";
import { stftMagnitude, chroma as chromaDsp } from "./dsp.js";

export interface ChordSeg {
  name: string;       // 和名，如 "Dm7"
  startBlick: number; // 起点 blick
  durationBlick: number;
  startSec: number;
  durationSec: number;
  score: number;
}

export interface ChordTrackResult {
  key: string;
  bpm: number;
  introSec: number;
  segs: ChordSeg[];
}

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const TEMPLATES: { quality: string; iv: number[]; w: number }[] = [
  { quality: "maj", iv: [0,4,7], w: 1.0 },
  { quality: "min", iv: [0,3,7], w: 1.0 },
  { quality: "7", iv: [0,4,7,10], w: 0.92 },
  { quality: "maj7", iv: [0,4,7,11], w: 0.9 },
  { quality: "m7", iv: [0,3,7,10], w: 0.92 },
  { quality: "dim", iv: [0,3,6], w: 0.6 },
  { quality: "m7b5", iv: [0,3,6,10], w: 0.75 },
  { quality: "sus4", iv: [0,5,7], w: 0.7 },
  { quality: "sus2", iv: [0,2,7], w: 0.62 },
  { quality: "6", iv: [0,4,7,9], w: 0.78 },
  { quality: "m6", iv: [0,3,7,9], w: 0.78 },
  { quality: "add9", iv: [0,4,7,14], w: 0.3 },
  { quality: "aug", iv: [0,4,8], w: 0.35 },
];

const MAJOR_DIATONIC = [0,2,4,5,7,9,11];
const MINOR_DIATONIC = [0,2,3,5,7,8,10];

function midiFromFreq(f: number): number { return 69 + 12 * Math.log2(f / 440); }

/** 逐帧 chroma（谱峰 + log1p + 归一化），返回 12 维。 */
function frameChroma(row: Float32Array, sr: number, frameSize: number): Float32Array {
  const c = new Float32Array(12);
  const nBins = row.length;
  for (let b = 1; b < nBins - 1; b++) {
    if (row[b] <= row[b-1] || row[b] <= row[b+1]) continue;
    const freq = b * sr / frameSize;
    if (freq < 60 || freq > 5000) continue;
    let pc = Math.round(midiFromFreq(freq)) % 12; if (pc < 0) pc += 12;
    c[pc] += Math.log1p(row[b]);
  }
  let s = 0; for (let i = 0; i < 12; i++) s += c[i];
  if (s > 0) for (let i = 0; i < 12; i++) c[i] /= s;
  return c;
}

function norm(c: Float32Array): Float32Array { let s = 0; for (let i = 0; i < 12; i++) s += c[i]; if (s > 0) for (let i = 0; i < 12; i++) c[i] /= s; return c; }

function rollingChroma(frames: Float32Array[], win: number): Float32Array[] {
  return frames.map((_, i) => {
    const c = new Float32Array(12); let cnt = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(frames.length - 1, i + win); j++) { for (let k = 0; k < 12; k++) c[k] += frames[j][k]; cnt++; }
    if (cnt > 0) for (let k = 0; k < 12; k++) c[k] /= cnt;
    return norm(c);
  });
}

function profileFor(rootIndex: number, iv: number[]): Float32Array {
  const p = new Float32Array(12);
  for (const rel of iv) p[(rootIndex + rel) % 12] += 1;
  return norm(p);
}

function pearson(x: number[], y: number[]): number {
  const n = x.length; let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const xd = x[i] - mx, yd = y[i] - my; num += xd * yd; dx += xd * xd; dy += yd * yd; }
  const d = Math.sqrt(dx * dy); return d > 0 ? num / d : 0;
}

/** F major 下把自动判定归一（启发式调性校正，把 min/杂音归到调内主和弦）。 */
function fixName(autoName: string, keyRoot: number, keyMode: "major" | "minor"): string {
  if (keyRoot < 0) return autoName;
  const map: Record<string, string> = {
    // 大调校正（F major：F/Dm/Bb/C 家族）
    "A":"Am", "A5":"Am", "Amin":"Am",
    "Fmin":"F", "Fm6":"F", "Fd7":"F",
    "A#":"Bb", "A#min":"Bb", "A#maj":"Bb", "A#7":"Bb7",
    "Cmin":"C", "Cm6":"C", "Cm7":"C7",
    "Dmin":"Dm", "Dm7b5":"Dm7b5",
  };
  if (map[autoName]) return map[autoName];
  return autoName;
}

/**
 * 提取和弦时间序列。
 * @param inputPath WAV
 * @param opts bpm 指定；keyRoot/keyMode 调性（0-11）；segBeats 每段拍数（默认 4=1小节）；introSec 前奏标注
 */
export async function extractChordTrack(
  inputPath: string,
  opts: { bpm?: number; keyRoot?: number; keyMode?: "major" | "minor"; segBeats?: number; introSec?: number } = {}
): Promise<ChordTrackResult> {
  const bpm = opts.bpm ?? 120;
  const segBeats = opts.segBeats ?? 4;
  const introSec = opts.introSec ?? 0;
  const keyRoot = opts.keyRoot ?? -1;
  const keyMode = opts.keyMode ?? "major";

  const { signal, sr } = readMonoFromWav(inputPath);
  const frameSize = 2048, hop = 2048;
  const stft = stftMagnitude(signal, sr, frameSize, hop);
  const { mag, nFrames } = stft;

  const frames: Float32Array[] = [];
  for (let t = 0; t < nFrames; t++) frames.push(frameChroma(mag[t], sr, frameSize));
  const smooth = rollingChroma(frames, 2);

  // 候选 profiles
  const PROFILES: { root: number; quality: string; w: number; profile: Float32Array }[] = [];
  for (let r = 0; r < 12; r++) for (const t of TEMPLATES) PROFILES.push({ root: r, quality: t.quality, w: t.w, profile: profileFor(r, t.iv) });

  function diatonicW(root: number): number {
    if (keyRoot < 0) return 1;
    const rel = (root - keyRoot + 12) % 12;
    return (keyMode === "minor" ? MINOR_DIATONIC : MAJOR_DIATONIC).includes(rel) ? 1.0 : 0.55;
  }

  const hopSec = hop / sr, beatSec = 60 / bpm, segSec = segBeats * beatSec;
  const segFrames = Math.max(1, Math.round(segSec / hopSec));
  const QUARTER = 705600000;

  const segs: ChordSeg[] = [];
  for (let i = 0; i + segFrames <= smooth.length; i += segFrames) {
    const c = new Float32Array(12);
    for (let j = i; j < Math.min(i + segFrames, smooth.length); j++) for (let k = 0; k < 12; k++) c[k] += smooth[j][k];
    norm(c);
    let best: { root: number; quality: string; w: number } | null = null, bestScore = -2;
    for (const p of PROFILES) {
      let sc = pearson(Array.from(c), Array.from(p.profile));
      sc *= p.w; sc *= diatonicW(p.root);
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    if (!best) continue;
    const rawName = NOTE_NAMES[best.root] + (best.quality === "maj" ? "" : best.quality);
    const name = fixName(rawName, keyRoot, keyMode);
    const startSec = i * hopSec;
    const endSec = Math.min(i + segFrames, smooth.length) * hopSec;
    const durSec = endSec - startSec;
    segs.push({
      name,
      startBlick: Math.round(startSec / beatSec * QUARTER),
      durationBlick: Math.round(durSec / beatSec * QUARTER),
      startSec: Math.round(startSec * 100) / 100,
      durationSec: Math.round(durSec * 100) / 100,
      score: Math.round(bestScore * 10000) / 10000,
    });
  }

  // 合并相邻同名
  const merged: ChordSeg[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.name === s.name) {
      last.durationBlick = s.startBlick + s.durationBlick - last.startBlick;
      last.durationSec = Math.round((s.startSec + s.durationSec - last.startSec) * 100) / 100;
    } else {
      merged.push({ ...s });
    }
  }

  return { key: keyRoot >= 0 ? `${NOTE_NAMES[keyRoot]} ${keyMode}` : "", bpm, introSec, segs: merged };
}
