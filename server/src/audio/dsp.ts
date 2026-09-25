/**
 * 音频 DSP 基础工具（纯 JS，无外部依赖）：STFT、chroma（12 音级能量曲线）、
 * 频谱质心、能量/RMS、音高中位数、Krumhansl 调性、和弦模板匹配。
 *
 * 这些被 analyze.ts（纯音频分析）与 emotion.ts（情感映射）复用，
 * 用于替代 essentia.js 的 DSP 部分。输入均为 Float32Array 单声道采样 + 采样率。
 */

/** FFT（迭代式 Cooley-Tukey，就地，n 为 2 的幂）。re/im 为 Float64Array。 */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  // 位反转
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/** 归一到 2 的幂 */
function nextPow2(n: number): number {
  let p = 1; while (p < n) p <<= 1; return p;
}

/** Hann 窗 */
function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

export interface StftResult {
  /** 每帧的复数谱 magnitude（[nFrames][nBins]） */
  mag: Float32Array[];
  nFrames: number;
  nBins: number;
  hop: number;
  frameSize: number;
  fs: number;
}

/**
 * 计算 STFT 幅度谱（Hann 窗）。返回按帧组织的幅度数组。
 * @param signal 单声道采样
 * @param fs 采样率
 * @param frameSize 帧长（2 的幂，默认 2048）
 * @param hop 帧移（默认 512）
 */
export function stftMagnitude(signal: Float32Array, fs: number, frameSize = 2048, hop = 512): StftResult {
  const n = signal.length;
  const window = hann(frameSize);
  const nFrames = Math.max(1, Math.floor((n - frameSize) / hop) + 1);
  const nBins = frameSize / 2 + 1;
  const mag: Float32Array[] = [];
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);
  for (let t = 0; t < nFrames; t++) {
    const base = t * hop;
    re.fill(0); im.fill(0);
    for (let i = 0; i < frameSize; i++) {
      const idx = base + i;
      re[i] = (idx < n ? signal[idx] : 0) * window[i];
    }
    // 取下一个 2 的幂（frameSize 已是 2 的幂）
    fft(re, im);
    const row = new Float32Array(nBins);
    for (let b = 0; b < nBins; b++) row[b] = Math.hypot(re[b], im[b]);
    mag.push(row);
  }
  return { mag, nFrames, nBins, hop, frameSize, fs };
}

function midiFromFreq(freq: number): number { return 69 + 12 * Math.log2(freq / 440); }

/**
 * 计算 chroma（12 音级能量曲线，C..B）。
 * 将每个频率 bin 的能量归到其音级（freq 映射到 midi%12），做时域累积归一化。
 * @param signal 单声道采样
 * @param fs 采样率
 * @returns 12 元素归一化 chroma（和为 1）
 */
export function chroma(signal: Float32Array, fs: number): Float32Array {
  const { mag, nFrames, nBins } = stftMagnitude(signal, fs);
  const chroma = new Float32Array(12);
  for (let t = 0; t < nFrames; t++) {
    const row = mag[t];
    // 谱峰提取：只取局部极大值 bin（抑制纯音旁瓣泄漏到邻近音级）
    for (let b = 1; b < nBins - 1; b++) {
      if (row[b] <= row[b - 1] || row[b] <= row[b + 1]) continue; // 非峰
      const freq = b * fs / 2048;
      if (freq < 60 || freq > 5000) continue;
      let pc = Math.round(midiFromFreq(freq)) % 12; if (pc < 0) pc += 12;
      // log1p 压缩：压制强谐波，让不同音级能量更均衡
      chroma[pc] += Math.log1p(row[b]);
    }
  }
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] /= sum;
  return chroma;
}

export interface KeyResult {
  key: string;       // 如 "C major"
  scale: "major" | "minor";
  confidence: number;
}

// Krumhansl-Schmuckler key profiles（12 元素：C..B）
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Krumhansl-Schmuckler 调性检测：对 24 个调（12 根 × 大小调）用其 profile
 * 与观测 chroma 做皮尔逊相关，取相关最高者。
 * @param chroma 12 元素归一化 chroma
 */
export function detectKeyKrumhansl(chromaVec: Float32Array): KeyResult {
  const profile = Array.from(chromaVec);
  let bestScore = -Infinity, bestKey = "C major", bestScale: "major" | "minor" = "major", bestConf = 0;
  for (let root = 0; root < 12; root++) {
    for (const [scale, prof] of [["major", KS_MAJOR], ["minor", KS_MINOR]] as [string, number[]][]) {
      // 旋转 profile 到该 root
      const rotated = new Array(12);
      for (let i = 0; i < 12; i++) rotated[i] = prof[(i - root + 12) % 12];
      const r = pearson(profile, rotated);
      if (r > bestScore) {
        bestScore = r;
        bestKey = `${NOTE_NAMES[root]} ${scale}`;
        bestScale = scale as "major" | "minor";
        bestConf = (r + 1) / 2; // 归一化到 0..1
      }
    }
  }
  return { key: bestKey, scale: bestScale, confidence: Math.round(bestConf * 100) / 100 };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xd = xs[i] - mx, yd = ys[i] - my;
    num += xd * yd; dx += xd * xd; dy += yd * yd;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

// ---------- 和弦模板匹配 ----------
export interface ChordCandidate {
  name: string;       // "Am", "C", "G7"...
  root: string;
  quality: string;
  score: number;      // 0..1
}

// 和弦模板（Pitch Class 集合，相对根音的半音间隔）
const CHORD_TEMPLATES: { quality: string; intervals: number[] }[] = [
  { quality: "major", intervals: [0, 4, 7] },
  { quality: "minor", intervals: [0, 3, 7] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "aug", intervals: [0, 4, 8] },
  { quality: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", intervals: [0, 5, 7] },
  { quality: "5", intervals: [0, 7] },
  { quality: "7", intervals: [0, 4, 7, 10] },
  { quality: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "m7", intervals: [0, 3, 7, 10] },
  { quality: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "m7b5", intervals: [0, 3, 6, 10] },
];

/** 和弦质 → 名称后缀（**统一用短名**：major 无后缀、minor 写 m；2026-09-19 归一，此前会吐 "Aminor" 这种长名）*/
const QUALITY_SUFFIX: Record<string, string> = {
  major: "", minor: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
  "5": "5", "7": "7", maj7: "maj7", m7: "m7", dim7: "dim7", m7b5: "m7b5",
};

/**
 * 从 chroma 估计最可能的和弦（音频直转，无需 MIDI/音符）。
 * 对每个根音 × 模板，计算其成员音级在 chroma 上的能量占比。
 * @param chromaVec 12 元素归一化 chroma
 * @param maxCandidates 返回候选数（默认 1）
 */
export function detectChord(chromaVec: Float32Array, maxCandidates = 1): ChordCandidate[] {
  const cands: ChordCandidate[] = [];
  for (let root = 0; root < 12; root++) {
    for (const tmpl of CHORD_TEMPLATES) {
      let inside = 0, outside = 0;
      for (let pc = 0; pc < 12; pc++) {
        const rel = (pc - root + 12) % 12;
        const isIn = tmpl.intervals.includes(rel);
        if (isIn) inside += chromaVec[pc]; else outside += chromaVec[pc];
      }
      // 得分：模板内能量占比（且有足够覆盖）
      const total = inside + outside;
      const score = total > 0 ? inside / total : 0;
      const coverage = inside / (tmpl.intervals.length * 0.3); // 期望每个和弦音约有 ~0.3 能量
      const suffix = QUALITY_SUFFIX[tmpl.quality] ?? tmpl.quality;
      cands.push({
        name: `${NOTE_NAMES[root]}${suffix}`,
        root: NOTE_NAMES[root],
        quality: tmpl.quality,
        score: Math.round(Math.min(1, score * (coverage > 0 ? coverage : 0.1)) * 100) / 100,
      });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, maxCandidates);
}

/**
 * 频谱质心（加权平均频率，Hz）。
 */
export function spectralCentroid(signal: Float32Array, fs: number): number {
  const { mag, nFrames, nBins } = stftMagnitude(signal, fs);
  let num = 0, den = 0;
  for (let t = 0; t < nFrames; t++) {
    const row = mag[t];
    for (let b = 1; b < nBins; b++) {
      const freq = b * fs / 2048;
      const m = row[b];
      num += freq * m; den += m;
    }
  }
  return den > 0 ? num / den : 0;
}

/** 响度 RMS（分帧取均值）。 */
export function rms(signal: Float32Array, frameSize = 2048, hop = 512): number {
  let sum = 0, count = 0;
  const n = signal.length;
  for (let off = 0; off + frameSize <= n; off += hop) {
    let s = 0;
    for (let i = 0; i < frameSize; i++) s += signal[off + i] * signal[off + i];
    sum += Math.sqrt(s / frameSize); count++;
  }
  return count > 0 ? sum / count : 0;
}

/** 音高中位数（Hz）：取能量最高的 bins 的中位频率（粗略但够用于情感/音区）。 */
export function pitchMedian(signal: Float32Array, fs: number): number {
  const { mag, nFrames, nBins } = stftMagnitude(signal, fs, 4096, 1024);
  const freqs: number[] = [];
  for (let t = 0; t < nFrames; t++) {
    const row = mag[t];
    let mi = 0, mp = -1;
    for (let b = 1; b < nBins; b++) { if (row[b] > mp) { mp = row[b]; mi = b; } }
    const freq = mi * fs / 4096;
    if (freq > 60 && freq < 2000) freqs.push(freq);
  }
  if (freqs.length === 0) return 0;
  freqs.sort((a, b) => a - b);
  return freqs[Math.floor(freqs.length / 2)];
}
