/**
 * 和弦落地模块：把和弦序列转换成实际音符（柱式 / 琶音），用于写入 SV/IX 工程。
 *
 * 输入：和弦表 [{ name, startBlick, durationBlick }]（每小节一个和弦，blick 单位）
 * 输出：音符数组 [{ pitch, onset, duration }]
 *
 * 与和声用的 harmony.ts 协同：pitch 为 MIDI（C4=60），时间一律 blick。
 */

export interface ChordSeg {
  name: string;        // 和名，如 "Dm7" / "F" / "C7"
  startBlick: number;  // 起点 blick
  durationBlick: number; // 时长 blick（通常一小节）
}

export interface ChordNote {
  pitch: number;
  onset: number;       // blick
  duration: number;    // blick
  lyrics?: string;
}

export interface ChordsWriteOptions {
  /** 琶音模式: "block" 柱式（默认）| "broken" 琶音（分解）| "arpeggio" 全琶音 */
  pattern?: "block" | "broken" | "arpeggio";
  /** 起始基准八度（C4=60 左右）。柱式取 root 附近；默认根据 root 找合适音区 */
  octaveShift?: number;
}

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

// 和弦：根音名字 → 半音偏移（配第2/3、第5、第7等）
// 注意 "A#" 也是 "Bb"，F major 下以 Dm7/F/C/Bb 为主
interface ChordDef {
  interval: number[]; // 相对根音的音程（半音），含 0=根音
}
const CHORD_DEFS: Record<string, number[]> = {
  // 三和弦
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "5": [0, 7],
  // 七和弦
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  m6: [0, 3, 7, 9],
  "6": [0, 4, 7, 9],
  add9: [0, 4, 7, 14],
};

// 解析和名 → {rootPc, intervals}。支持 "Dm7"/"F"/"C7"/"Bb"/"A#"/"Gsus4" 等。
export function parseChordName(name: string): { rootPc: number; intervals: number[] } | null {
  if (!name) return null;
  const s = name.trim();
  // 根音：字母（可带 #/b）
  let i = 0;
  let root = s[0];
  if (root.length !== 1 || !/[A-G]/.test(root)) return null;
  i = 1;
  let acc = "";
  while (i < s.length && (s[i] === "#" || s[i] === "b")) { acc += s[i]; i++; }
  // 根音音级
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[root];
  if (base === undefined) return null;
  let rootPc = base;
  if (acc === "#") rootPc = (rootPc + 1) % 12;
  else if (acc === "b") rootPc = (rootPc + 11) % 12;

  // 后缀 → 和弦质
  const rest = s.slice(i);
  const quality = qualityFromSuffix(rest);
  const intervals = CHORD_DEFS[quality] || CHORD_DEFS.maj;
  return { rootPc: ((rootPc % 12) + 12) % 12, intervals };
}

function qualityFromSuffix(rest: string): string {
  const r = rest;
  // 按确定性匹配（长后缀优先）
  const table: [string, string][] = [
    ["major", "maj"], ["minor", "min"],
    ["dim7", "dim7"], ["m7b5", "m7b5"], ["maj7", "maj7"],
    ["min7", "m7"], ["min", "min"], ["m7", "m7"], ["m6", "m6"],
    ["sus2", "sus2"], ["sus4", "sus4"], ["add9", "add9"],
    ["dim", "dim"], ["aug", "aug"], ["maj", "maj"],
    ["m", "min"], ["7", "7"], ["6", "6"], ["5", "5"],
  ];
  for (const [suf, q] of table) {
    if (r === suf) return q;
  }
  // 默认大调（无后缀）
  return "maj";
}

/** rootPc + 音程 → 一个可演奏的 MIDI 音高（围绕 referencePitch 就近取音）。 */
function pitchNear(rootPc: number, rel: number, referencePitch: number): number {
  // 目标音名 = rootPc + rel（可超过一个八度）
  const targetPc = ((rootPc + rel) % 12 + 12) % 12;
  // 从 referencePitch 出发，找是 targetPc 的最近的 MIDI 值
  let best = referencePitch, bestDiff = Infinity;
  for (let oct = 0; oct < 2; oct++) {
    for (const cand of [Math.floor(referencePitch / 12) * 12 + targetPc + oct * 12,
                        Math.floor(referencePitch / 12) * 12 + targetPc - oct * 12]) {
      if (cand >= 36 && cand <= 96) {
        const d = Math.abs(cand - referencePitch);
        if (d < bestDiff) { bestDiff = d; best = cand; }
      }
    }
  }
  return best;
}

/**
 * 把和弦序列转成音符序列。
 * @param segs 和弦段（每小节）
 * @param opts 琶音模式 / 八度/
 */
export function chordsToNotes(segs: ChordSeg[], opts: ChordsWriteOptions = {}): ChordNote[] {
  const pattern = opts.pattern || "block";
  const octaveShift = opts.octaveShift || 0;
  const notes: ChordNote[] = [];

  for (const seg of segs) {
    const parsed = parseChordName(seg.name);
    if (!parsed) continue;
    const { rootPc, intervals } = parsed;

    // 基准音区：围绕 C4=60，octaveShift 下移（默认 -12 → 根音落在低音区）
    const referencePitch = 60 + octaveShift;

    if (pattern === "arpeggio" || pattern === "broken") {
      // 琶音：根音先（最低），其余按音高排列上行
      const n = intervals.length;
      const subDur = Math.floor(seg.durationBlick / n);
      const sorted = voicing(intervals, rootPc, referencePitch);
      for (let k = 0; k < n; k++) {
        const onset = seg.startBlick + k * subDur;
        notes.push({ pitch: sorted[k], onset, duration: subDur, lyrics: "" });
      }
    } else {
      // 柱式 block：根音在最低、上方音在一个八度内爬升，整小节同 onset
      const onset = seg.startBlick;
      const sorted = voicing(intervals, rootPc, referencePitch);
      for (const p of sorted) {
        notes.push({ pitch: p, onset, duration: seg.durationBlick, lyrics: "" });
      }
    }
  }
  return notes;
}

/**
 * 生成和弦的实际发声（音高集合）：根音固定在最底，其余音在根音之上、一个八度内爬升。
 * @param intervals 相对根音的半音（含 0=根音）
 * @param rootPc 根音音级（0-11）
 * @param referencePitch 参考 midi（根音围绕它取最近值）
 */
function voicing(intervals: number[], rootPc: number, referencePitch: number): number[] {
  // 根音：reference 附近最近的 root 音（不强制下方，取最近，落低音区）
  const rootPitch = pitchAtPc(rootPc, referencePitch, false);
  const out: number[] = [];
  for (const rel of intervals) {
    // 目标音级 = rootPc + rel
    const targetPc = (rootPc + rel) % 12;
    // 从 rootPitch 起，找 ≥ rootPitch 的最近该音级（保证在根音上方）
    let cand = rootPitch + ((targetPc - (rootPitch % 12) + 12) % 12);
    if (cand < rootPitch) cand += 12;
    // 若超出根音一个八度过多（如 rel 大），回退到根音同七度内
    while (cand > rootPitch + 12) cand -= 12;
    if (out.indexOf(cand) === -1) out.push(cand);
  }
  return out.sort((a, b) => a - b);
}

/** 取指定音级（pc）的 MIDI 音高，围绕 reference；preferBelow 时取 ≤reference 的最近值（低音）。 */
function pitchAtPc(pc: number, reference: number, preferBelow = false): number {
  const targetPc = ((pc % 12) + 12) % 12;
  const base = Math.floor(reference / 12) * 12; // reference 所在八度的 C
  const below = base + targetPc - (targetPc > (reference % 12) ? 12 : 0);
  const above = below + 12;
  if (preferBelow) {
    // 取 ≤ reference 的最近（即 below；若 below 仍 > reference 则再减八度）
    return below <= reference ? below : below - 12;
  }
  return Math.abs(above - reference) < Math.abs(below - reference) ? above : below;
}
