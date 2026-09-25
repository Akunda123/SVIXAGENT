/**
 * 音频分析模块：基于纯 JS DSP + @audio/beat 的本地音频特征提取（无 essentia）。
 *
 * 能力：响度(RMS)、BPM、节拍序列、调性(Krumhansl)、频谱质心、音高中位数。
 * 输入：WAV 文件（任意采样率，内部重采样并转 mono）。
 *
 * 依赖：
 *   - @audio/beat（纯 JS，节拍/BPM 检测，无需 Web Audio）
 *   - ./dsp.js（自研 STFT/chroma/Krumhansl/能量/音区，替代 essentia）
 */

import { accessSync, constants as fsConstants, readFileSync } from "node:fs";
import { resolve } from "node:path";

// 只动态 import @audio/beat（ESM），dsp 是同一 TS 编译产物可静态 import
export interface AnalyzeResult {
  durationSec: number;
  sampleRate: number;
  startSec: number;
  endSec: number;
  rms: number;
  bpm?: number;
  /** BPM 候选（如 150/120/75 各自置信度），供用户判断/校 BPM */
  bpmCandidates?: { bpm: number; confidence: number }[];
  key?: string;
  spectralCentroid?: number;
  pitchMedian?: number;
  pitchHz?: number;
  /** 节拍跟踪：第一拍偏移（秒）+ 拍位置数组 */
  firstBeatSec?: number;
  beatTicks?: number[];
  /** 音高置信度上限（预留） */
  confidence?: number;
  /** Krumhansl 调性置信度（0..1） */
  keyConfidence?: number;
  [k: string]: unknown;
}

/** 读 WAV 指定时间窗口 → 单声道 Float32Array（保留原始采样率）。导出供其他模块复用。 */
export function readMonoFromWav(path: string, startSec = 0, endSec?: number): { signal: Float32Array; sr: number } {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error(`not a RIFF/WAV file: ${path}`);
  let p = 12;
  let ch = 2;
  let sr = 44100;
  let bits = 16;
  let data = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const sz = buf.readUInt32LE(p + 4);
    if (id === "fmt ") {
      ch = buf.readUInt16LE(p + 10);
      sr = buf.readUInt32LE(p + 12);
      bits = buf.readUInt16LE(p + 22);
    }
    if (id === "data") { data = p + 8; break; }
    p += 8 + sz + (sz % 2);
  }
  if (!data) throw new Error("no data chunk");
  const dataSize = buf.readUInt32LE(p + 4);
  const total = Math.floor(Math.min(dataSize, buf.length - data) / (ch * (bits / 8)));
  const start = Math.min(Math.floor(startSec * sr), total - 1);
  const end = endSec === undefined ? total : Math.min(Math.floor(endSec * sr), total);
  const n = Math.max(0, end - start);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) {
      if (bits === 32) s += buf.readFloatLE(data + ((start + i) * ch + c) * 4);
      else s += buf.readInt16LE(data + ((start + i) * ch + c) * 2) / 32768;
    }
    mono[i] = s / ch;
  }
  return { signal: mono, sr };
}

/**
 * 分析音频文件特征（可指定时间窗口）。
 * @param inputPath WAV 文件路径
 * @param startSec 起始秒（默认 0）
 * @param endSec 结束秒（默认文件末尾）
 * @returns 特征结果
 */
export async function analyzeAudio(inputPath: string, startSec = 0, endSec?: number, opts?: { bpm?: number }): Promise<AnalyzeResult> {
  const input = resolve(inputPath);
  try {
    accessSync(input, fsConstants.R_OK);
  } catch {
    throw new Error(`input file not readable: ${input}`);
  }

  const { signal, sr } = readMonoFromWav(input, startSec, endSec);
  if (signal.length === 0) throw new Error("empty audio");

  const { detect, tempo, beatTrack } = await import("@audio/beat");
  const dsp = await import("./dsp.js");

  const result: AnalyzeResult = {
    durationSec: Math.round((signal.length / sr) * 10) / 10,
    sampleRate: sr,
    startSec,
    endSec: endSec ?? Math.round((signal.length / sr) * 10) / 10,
    rms: 0,
  };

  // 响度 RMS
  result.rms = Math.round(dsp.rms(signal) * 1000) / 1000;

  // BPM + 节拍序列（@audio/beat：detect 得主 bpm/拍点；tempo 得候选；beatTrack 支持指定 bpm 重算）
  if (signal.length / sr >= 5) {
    try {
      // 主 BPM（自由检测） + 拍点
      const det = detect(signal, { fs: sr });
      if (det.bpm) {
        result.bpm = Math.round(det.bpm * 10) / 10;
        result.confidence = det.confidence;
      }
      // BPM 候选：用 tempo()（内部 comb + 候选），取 candidates；若 candidates 为空，则在多个区间 detect 补充
      try {
        const tr = tempo(signal, { fs: sr, minBpm: 60, maxBpm: 200 });
        const cands: { bpm: number; confidence: number }[] = [];
        if (tr && tr.bpm) cands.push({ bpm: Math.round(tr.bpm * 10) / 10, confidence: tr.confidence });
        if (tr && tr.candidates) {
          for (const c of tr.candidates) {
            cands.push({ bpm: Math.round(c.bpm * 10) / 10, confidence: c.confidence });
          }
        }
        // 补区间候选：110-130 / 140-160 / 60-90（诊断 BPM 歧义）
        for (const [lo, hi] of [[110, 130], [140, 160], [60, 90], [90, 110]] as const) {
          if (cands.length >= 4) break;
          const d2 = detect(signal, { fs: sr, minBpm: lo, maxBpm: hi });
          if (d2 && d2.bpm) {
            const b = Math.round(d2.bpm * 10) / 10;
            if (!cands.some((c) => Math.abs(c.bpm - b) < 1)) {
              cands.push({ bpm: b, confidence: d2.confidence });
            }
          }
        }
        // 去重排序（按置信度降）、去极端（取 40-220 合理范围）
        const seen = new Map<number, number>();
        for (const c of cands) {
          if (c.bpm >= 40 && c.bpm <= 220 && !seen.has(Math.round(c.bpm))) seen.set(Math.round(c.bpm), c.confidence);
        }
        result.bpmCandidates = [...seen.entries()]
          .map(([bpm, confidence]) => ({ bpm, confidence }))
          .sort((a, b) => b.confidence - a.confidence);
      } catch { /* candidates optional */ }

      // 拍点：优先用指定 bpm（beatTrack），否则自由 detect 拍点
      const beatArr = opts?.bpm
        ? (() => {
            const bt = beatTrack(signal, { fs: sr, bpm: opts.bpm });
            return bt && bt.beats ? Array.from(bt.beats as Float64Array) : null;
          })()
        : (det.beats ? Array.from(det.beats as Float64Array) : null);
      if (beatArr && beatArr.length >= 2) {
        const arr = beatArr.map((t) => Math.round(t * 100) / 100);
        result.beatTicks = arr;
        result.firstBeatSec = arr[0];
        // 若指定了 bpm，主值也用指定值
        if (opts?.bpm) result.bpm = opts.bpm;
      }
    } catch { /* skip */ }
  }

  // 调性（Krumhansl，基于 chroma）
  try {
    const key = dsp.detectKeyKrumhansl(dsp.chroma(signal, sr));
    result.key = key.key;
    result.keyConfidence = key.confidence;
  } catch { /* skip */ }

  // 频谱质心
  try { result.spectralCentroid = Math.round(dsp.spectralCentroid(signal, sr)); } catch { /* skip */ }

  // 音高中位数（Hz）
  try {
    const pm = dsp.pitchMedian(signal, sr);
    if (pm > 0) {
      result.pitchMedian = Math.round(pm * 10) / 10;
      result.pitchHz = Math.round(pm);
    }
  } catch { /* skip */ }

  return result;
}

/**
 * 由 BeatTracker 的拍时间戳数组算出浮动 BPM 的 tempo mark 序列。
 * 注入 beatOffsetSec：第一拍在工程中的锚定时刻（默认 0）。
 * 段起点时刻 = beatOffsetSec + 该段首拍相对第一拍的秒数。
 * @param beatTicks 每拍秒数（BeatTracker ticks）
 * @param beatOffsetSec 第一拍锚定到工程的时刻（秒；第 2 小节起点）
 * @param segmentBeats 每段拍数（默认 4 = 一小节）
 * @returns [{ seconds, bpm }]
 */
export function computeTempoMarks(beatTicks: number[], beatOffsetSec = 0, segmentBeats = 4): { seconds: number; bpm: number }[] {
  const out: { seconds: number; bpm: number }[] = [];
  if (!Array.isArray(beatTicks) || beatTicks.length < 2) return out;
  const seg = Math.max(1, Math.floor(segmentBeats));
  for (let i = 0; i + seg <= beatTicks.length; i += seg) {
    const t0 = beatTicks[i];
    const t1 = beatTicks[i + seg];
    const avg = (t1 - t0) / seg;
    if (avg > 0) {
      out.push({
        seconds: Math.round((beatOffsetSec + (t0 - beatTicks[0])) * 100) / 100,
        bpm: Math.round((60 / avg) * 10) / 10,
      });
    }
  }
  return out;
}
