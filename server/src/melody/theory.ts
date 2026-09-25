// 乐理基础：音阶、和弦、调内音、琶音构建。纯函数，无外部依赖。
// MIDI note: C4=60 是惯例（midi-file 也用 0-127，C4=60 对应 noteNumber）。

export type ScaleType = "major" | "minor" | "pentatonicMajor" | "pentatonicMinor";

// 音阶半音间隔（relative to root, 0=root）
const SCALE_STEPS: Record<ScaleType, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],        // 大调 (Ionian)
  minor:            [0, 2, 3, 5, 7, 8, 10],        // 自然小调 (Aeolian)
  pentatonicMajor:  [0, 2, 4, 7, 9],               // 大调五声
  pentatonicMinor:  [0, 3, 5, 7, 10],              // 小调五声
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 把 "C"/"Am"/"F#" 之类的 key 解析成根音 MIDI pitch (根音所在八度的 C4 基址)
export function parseRootPitch(key: string): number {
  let s = key.trim();
  let sharp = false, flat = false;
  const first = s[0].toUpperCase();
  s = s.slice(1);
  if (s.startsWith("#")) { sharp = true; s = s.slice(1); }
  else if (s.startsWith("b")) { flat = true; s = s.slice(1); }
  // 判断大小调（含 "m" 结尾，或 "minor"）
  const isMinor = /m$|minor$/i.test(s.trim());
  let base = NOTE_NAMES.indexOf(first);
  if (base < 0) base = 0;
  if (sharp) base = (base + 1) % 12;
  if (flat) base = (base - 1 + 12) % 12;
  // root pitch: 以 C4=60 为基准，把根音放到 [60, 71]
  let root = 60 + base;
  // 若根音高于 B4(71) 也无需处理；根音 pitch = 60..71
  return root;
}

// 判断 key 是否小调
export function isMinorKey(key: string): boolean {
  return /m$|minor$/i.test(key.trim());
}

// 返回一个调内的音阶 MIDI pitch 列表（覆盖 octave 区间 [low, high]，含端点重复）
export function scalePitches(root: number, type: ScaleType, low: number, high: number): number[] {
  const steps = SCALE_STEPS[type];
  const out: number[] = [];
  // 从 root 所在八度开始，逐八度扩展
  let oct = Math.floor((low - root) / 12) * 12;
  let rootPos = root + oct;
  // 兜底：确保能覆盖 low..high
  let guard = 0;
  while (rootPos <= high + 12 && guard < 50) {
    for (const st of steps) {
      const p = rootPos + st;
      if (p >= low && p <= high) out.push(p);
    }
    rootPos += 12;
    guard++;
  }
  // 去重排序
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface Chord {
  root: number;      // 根音 MIDI
  type: string;      // "maj"/"min"/"maj7"/"min7"/"dim"/"sus4"
  tones: number[];   // 组成音 MIDI（含根音，升序，限一 octave）
}

const CHORD_INTERVALS: Record<string, number[]> = {
  maj:   [0, 4, 7],
  min:   [0, 3, 7],
  maj7:  [0, 4, 7, 11],
  min7:  [0, 3, 7, 10],
  dim:   [0, 3, 6],
  sus4:  [0, 5, 7],
};

// 构建一个和弦（基于某根音 pitch + 和弦类型），tones 为一个八度内升序 pitch
export function buildChord(root: number, type: string): Chord {
  const iv = CHORD_INTERVALS[type] || CHORD_INTERVALS.maj;
  return { root, type, tones: iv.map((i) => root + i) };
}

// 根据和弦级数（Scale degree, 1-7, 大小调）推导和弦类型 + 根音
// 大调：I ii iii IV V vi vii° ；小调：i ii° III iv v VI VII
export function chordForDegree(degree: number, key: string): { root: number; type: string } {
  const minor = isMinorKey(key);
  const root = parseRootPitch(key);
  const scaleDegrees = minor
    ? ["maj", "dim", "maj", "min", "min", "maj", "maj"]   // i ii° III iv v VI VII (近似)
    : ["maj", "min", "min", "maj", "maj", "min", "dim"];    // I ii iii IV V vi vii°
  const idx = ((degree - 1) % 7 + 7) % 7;
  const type = scaleDegrees[idx];
  // 根音 = 调根音 + 音阶度数（用大/小调的音阶间隔）
  const step = minor
    ? [0, 2, 3, 5, 7, 8, 10][idx]
    : [0, 2, 4, 5, 7, 9, 11][idx];
  return { root: root + step, type };
}

// 琶音：把和弦音按低→高→低展开（去重 octave 内重复，可选跨 octave）
export function arpeggio(chord: Chord, octaves = 1): number[] {
  const seq: number[] = [];
  for (let o = 0; o <= octaves; o++) {
    for (const t of chord.tones) {
      const p = t + o * 12;
      if (!seq.includes(p)) seq.push(p);
    }
  }
  return seq;
}

// 简单随机（seed 可传入便于确定性测试）
export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 把 MIDI pitch 显示成音名（如 60 -> C4）
export function pitchName(pitch: number): string {
  const oct = Math.floor(pitch / 12) - 1;
  return NOTE_NAMES[((pitch % 12) + 12) % 12] + oct;
}

// 音级名（0-11 → "C"/"C#"…）
export function pitchClassName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

// 某调（根音 + 音阶类型）的音级集合（0-11，12 个音级里的子集）
export function scalePitchClasses(root: number, type: ScaleType): number[] {
  const r = ((root % 12) + 12) % 12;
  return SCALE_STEPS[type].map((s) => (r + s) % 12);
}

// 是否五声音阶类型（大调五声 / 小调五声）
export function isPentatonicType(type: ScaleType): boolean {
  return type === "pentatonicMajor" || type === "pentatonicMinor";
}

// 大调五声（去掉 4、7 音级）—— 用于"全五声"检查
export function majorPentatonicClasses(root: number): number[] {
  return scalePitchClasses(root, "pentatonicMajor");
}

// 粗略解析和弦名（"C"/"Am"/"Am7"/"Fmaj7"/"Gsus4"/"Bdim"）→ Chord
export function parseChordName(name: string): Chord {
  const m = name.trim().match(/^([A-Ga-g])([#b]?)/);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[(m?.[1] || "C").toUpperCase()] ?? 0;
  if (m?.[2] === "#") pc = (pc + 1) % 12;
  else if (m?.[2] === "b") pc = (pc + 11) % 12;
  let type = "maj";
  if (/min7|m7\b/.test(name)) type = "min7";
  else if (/maj7/.test(name)) type = "maj7";
  else if (/sus4/.test(name)) type = "sus4";
  else if (/dim/.test(name)) type = "dim";
  else if (/min|m$/.test(name)) type = "min";
  return buildChord(60 + pc, type);   // 根音落在 C4 八度
}

// 和弦音级集合（0-11）
export function chordPitchClasses(chord: Chord): number[] {
  return chord.tones.map((t) => ((t % 12) + 12) % 12);
}
