// 旋律生成算法 v2：结构引擎（主题 / 句法 / 气口 / 终止落音 / 单一高点）+ 和弦对齐 + 避免音护栏。
// 输入设定（key/mood/bpm/小节数/可选和弦进行），输出音符序列（pitch + 拍位置 + 时值）。
// 纯函数、种子确定性、无外部依赖。预留"模型位"(modelHook)：
//   LLM 只需给"结构意图"（句法/高点/落音/密度），音符一律由本引擎渲染 —— 见 skills/composition/references/主旋律生成.md。

import {
  ScaleType, parseRootPitch, isMinorKey, scalePitches, chordPitchClasses,
  Chord, parseChordName, mulberry32,
} from "./theory.js";

export interface MelodyNote {
  pitch: number;       // MIDI（0-127，C4=60）
  startBeat: number;   // 起始拍（0 起，支持小数）
  durBeats: number;    // 时值（拍）
  vel: number;         // 力度 0-1（<0.5 视为伴奏层，> =0.5 为主旋律层）
}

export type Mood = "bright" | "happy" | "sad" | "dark" | "tense" | "calm" | "epic";

export interface GenOptions {
  key: string;             // 如 "C"/"Am"/"F major"
  mood?: Mood;
  bpm?: number;            // 默认 120
  barCount?: number;       // 默认 8
  timeSig?: number;        // 每小节拍数，默认 4
  chordProgression?: string[];  // 如 ["C","G","Am","F"]（音名，可含类型 "C"/"Am7"/"Fmaj7"/"Gsus4"）
  useArpeggio?: boolean;   // 伴奏是否铺琶音
  seed?: number;           // 随机种子（确定性）
  phraseBars?: number;     // 一句几小节（默认 4）
  breathBeats?: number;    // 句末气口拍数（默认按情绪 0.5~1）
  highPointBar?: number;   // 高点落在第几小节（1 起；默认 ⌈barCount×2/3⌉）
  modelHook?: (ctx: { key: string; mood: string; bpm: number; bars: number; chords: string[]; scale: ScaleType }) => any;
}

/** 结构计划（可单独取用：给 LLM / 给用户看"这版的结构是什么"） */
export interface MelodyPlan {
  key: string;
  mood: Mood;
  scale: ScaleType;
  barCount: number;
  timeSig: number;
  phraseBars: number;
  phraseCount: number;
  highPointBar: number;      // 1 起
  breathBeats: number;
  chords: string[];
  phrases: {
    index: number;
    bars: [number, number];  // 起止小节（1 起，含端点）
    role: "A" | "A'" | "B" | "A''";   // 主题 / 模进 / 对比 / 回归
    energy: number;          // 0-1（决定密度）
    cell: string;            // 节奏细胞名
    cadence: string;         // 落音规则名（半终止/完全终止/色彩终止）
    anchorStep: number;      // 主题锚点（音阶级数位移）
  }[];
}

// ---------------------------------------------------------------- 情绪档案

interface MoodProfile {
  scale: ScaleType;
  breath: number;      // 句末气口（拍）
  energy: number;      // 整体能量（0-1）→ 决定密度基线
  span: number;        // 高点相对起点跨几个音阶级数
  leapRate: number;    // 跳进概率（0-1）
  cadenceMid: number;  // 半终止落音（相对主音的半音数）
  cadenceFinal: number;// 完全终止落音
}

const MOODS: Record<Mood, MoodProfile> = {
  bright: { scale: "major",  breath: 0.5, energy: 0.60, span: 5, leapRate: 0.20, cadenceMid: 7, cadenceFinal: 0 },
  happy:  { scale: "major",  breath: 0.5, energy: 0.60, span: 5, leapRate: 0.20, cadenceMid: 7, cadenceFinal: 0 },
  sad:    { scale: "minor",  breath: 1.0, energy: 0.30, span: 4, leapRate: 0.10, cadenceMid: 9, cadenceFinal: 0 },
  dark:   { scale: "minor",  breath: 1.0, energy: 0.30, span: 4, leapRate: 0.10, cadenceMid: 9, cadenceFinal: 0 },
  calm:   { scale: "major",  breath: 1.0, energy: 0.25, span: 3, leapRate: 0.05, cadenceMid: 4, cadenceFinal: 0 },
  tense:  { scale: "minor",  breath: 0.5, energy: 0.70, span: 5, leapRate: 0.25, cadenceMid: 11, cadenceFinal: 0 },
  epic:   { scale: "major",  breath: 0.5, energy: 0.80, span: 6, leapRate: 0.30, cadenceMid: 7,  cadenceFinal: 0 },
};

function moodProfile(mood: Mood): MoodProfile {
  return MOODS[mood] ?? MOODS.happy;
}

// ---------------------------------------------------------------- 节奏细胞
// 4/4 下定义；其它拍号按 k = timeSig/4 拉伸。

const CELLS: Record<string, [number, number][]> = {
  long:  [[0, 2], [2, 2]],
  half:  [[0, 2], [2, 1], [3, 1]],
  walk:  [[0, 1], [1, 1], [2, 1], [3, 1]],
  march: [[0, 1], [1, 1], [2, 1], [3, 1]],
  lyric: [[0, 1.5], [1.5, 1], [3, 1.5]],
  sync:  [[0, 1], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
  drive: [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
  push:  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
};

/** 能量 → 节奏细胞名（密度曲线就落在这里） */
function cellForEnergy(energy: number, mood: Mood): keyof typeof CELLS {
  if (mood === "calm") return energy < 0.4 ? "long" : "lyric";
  if (mood === "sad" || mood === "dark") return energy < 0.4 ? "half" : "lyric";
  if (mood === "tense") return energy < 0.6 ? "sync" : "drive";
  if (mood === "epic") return energy < 0.5 ? "march" : "walk";
  if (energy < 0.35) return "long";
  if (energy < 0.5) return "half";
  if (energy < 0.62) return "walk";
  if (energy < 0.75) return "sync";
  return "drive";
}

// 主题：以"音阶级数位移"表达的动机轮廓（0 = 锚点音）
const THEMES: number[][] = [
  [0, 1, 2],
  [0, -1, -2],
  [0, 2, 1],
  [0, 1, 0, -1],
  [0, 2, 4],
  [0, -1, 1],
];

// ---------------------------------------------------------------- 工具函数

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function nearestIndex(pitches: number[], target: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pitches.length; i++) {
    const d = Math.abs(pitches[i] - target);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** 拍型 → 实际小节内节奏（按 timeSig 拉伸；只保留落在小节内的音） */
function cellToRhythm(cell: [number, number][], timeSig: number): [number, number][] {
  const k = timeSig / 4;
  const out: [number, number][] = [];
  for (const [s, d] of cell) {
    const start = s * k, dur = d * k;
    if (start >= timeSig) continue;
    out.push([start, Math.min(dur, timeSig - start)]);
  }
  return out;
}

/** 句末小节：前半自由 + 落音（留出气口） */
function cadenceBarRhythm(
  timeSig: number, breath: number, cadenceDur: number, energy: number,
): { fill: [number, number][]; cadPos: number; cadDur: number } {
  const cadDur = Math.min(cadenceDur, Math.max(0.5, timeSig - breath - 0.5));
  const cadPos = Math.max(0.5, timeSig - cadDur - breath);
  const fill: [number, number][] = [];
  if (energy >= 0.6 && cadPos >= 2) {
    fill.push([0, 0.5], [0.5, 0.5], [1, cadPos - 1.5]);
  } else if (cadPos >= 2) {
    fill.push([0, 1], [1, cadPos - 1]);
  } else {
    fill.push([0, cadPos]);
  }
  return { fill, cadPos, cadDur };
}

/** pitch 附近的全部和弦音（跨八度） */
function chordToneNear(chord: Chord, pitch: number): number[] {
  const out: number[] = [];
  for (let oct = -2; oct <= 2; oct++) {
    for (const t of chord.tones) out.push(t + oct * 12);
  }
  return out;
}

/** 强拍吸附：就近取和弦内音（限 maxDist 半音内），否则保持原音 */
function snapToChord(pitch: number, chord: Chord, maxDist = 2): number {
  let best = pitch, bestD = maxDist + 0.5;
  for (const ct of chordToneNear(chord, pitch)) {
    const d = Math.abs(ct - pitch);
    if (d < bestD) { bestD = d; best = ct; }
  }
  return best;
}

/** 避免音护栏（硬红线）：高小二度 = 旋律音比和弦内音高 1 个半音 ⇒ 降半音。
 *  例外：音本身就是和弦内音（pitch - ct === 0）时不判——和弦音永远不是"避免音"。 */
function fixAvoidNote(pitch: number, chord: Chord): { pitch: number; fixed: boolean } {
  const tones = chordToneNear(chord, pitch);
  if (tones.some((ct) => pitch - ct === 0)) return { pitch, fixed: false };
  if (tones.some((ct) => pitch - ct === 1)) return { pitch: pitch - 1, fixed: true };
  return { pitch, fixed: false };
}

/** 就近音阶吸附（保持方向：优先不低于目标的音阶音） */
function snapToScale(pitch: number, scale: number[]): number {
  return scale[nearestIndex(scale, pitch)];
}

/** 统一挑音：在生成侧一次把"**六度以上大跳 / 单音打转 / 避免音 / 越峰值 / 出调**"全管住。
 *  用途来自用户 2026-09-19 给的旋律检查清单（大跳 · 单音重复 · 吐字）——检查能抓到，就别让引擎再产出来。 */
function pickPitch(o: {
  scale: number[]; desiredIdx: number; ceilIdx: number; floorIdx?: number; lastPitch: number;
  chord: Chord; use: Map<number, number>; maxLeap: number;
  forcePc?: number; preferChordTone?: boolean;
}): number {
  const { scale, desiredIdx, ceilIdx, lastPitch, chord, use, maxLeap } = o;
  const floorIdx = o.floorIdx ?? 0;
  const ctPcs = chord.tones.map((t) => ((t % 12) + 12) % 12);
  const pcOf = (p: number) => ((p % 12) + 12) % 12;
  const build = (leapCap: number, strict: boolean) => {
    const out: { p: number; j: number }[] = [];
    for (let j = floorIdx; j < scale.length; j++) {
      if (j > ceilIdx) continue;
      const p = scale[j];
      if (p > 84 || p < 55) continue;
      if (Math.abs(p - lastPitch) > leapCap) continue;
      if (o.forcePc !== undefined && pcOf(p) !== ((o.forcePc % 12) + 12) % 12) continue;
      if (strict && fixAvoidNote(p, chord).fixed) continue;
      out.push({ p, j });
    }
    return out;
  };
  // 兜底顺序：**先放过大跳（warn），最后才放过避免音（error）** —— 错的优先级不能反
  let pool = build(maxLeap, true);
  if (!pool.length) pool = build(maxLeap + 2, true);
  if (!pool.length && o.forcePc !== undefined) pool = build(maxLeap + 2, false);
  if (!pool.length) pool = build(12, false);
  if (!pool.length) pool = build(24, false);
  if (!pool.length) return scale[clamp(desiredIdx, 0, scale.length - 1)];
  const score = (c: { p: number; j: number }) =>
    (use.get(c.p) || 0) * 8                                   // 本句用过就扣分 ⇒ 治"单音打转"
    + Math.abs(c.j - desiredIdx)                              // 离目标音级越近越好
    + (o.preferChordTone && !ctPcs.includes(pcOf(c.p)) ? 6 : 0);
  pool.sort((a, b) => score(a) - score(b));
  return pool[0].p;
}

/** 句内音域收口：一句之内不超过 maxSpan 个半音（跨八度 = 唱不动）。
 *  处理顺序：先试着把最低音抬八度（不许超过峰值），抬不动就把最高音降八度。keep = 高点音，永不移动。 */
function clampPhraseSpan(ns: MelodyNote[], maxSpan: number, peakPitch: number, keep: MelodyNote | null): void {
  for (let guard = 0; guard < 12; guard++) {
    if (ns.length < 2) return;
    const pitches = ns.map((n) => n.pitch);
    const lo = Math.min(...pitches), hi = Math.max(...pitches);
    if (hi - lo <= maxSpan) return;
    const lowest = ns.find((n) => n.pitch === lo)!;
    const highest = ns.filter((n) => n !== keep).sort((a, b) => b.pitch - a.pitch)[0];
    if (lowest !== keep && lowest.pitch + 12 <= Math.min(peakPitch, 84) && (hi - (lo + 12)) <= maxSpan) {
      lowest.pitch += 12;
    } else if (highest && highest.pitch - 12 >= 55) {
      highest.pitch -= 12;
    } else if (lowest !== keep && lowest.pitch + 12 <= 84) {
      lowest.pitch += 12;
    } else {
      return;
    }
  }
}

// ---------------------------------------------------------------- 结构计划

export function melodyPlan(opts: GenOptions): MelodyPlan {
  const mood = (opts.mood ?? "happy") as Mood;
  const prof = moodProfile(mood);
  // 调式：key 里写明了大小调就以 key 为准（"Am" ⇒ 小调，"F major" ⇒ 大调）；
  // 只给了主音（"C"/"F"）时，才由 mood 决定大小调。
  const keyStr = opts.key ?? "C";
  const scaleType: ScaleType = isMinorKey(keyStr)
    ? "minor"
    : /\bmajor\b/i.test(keyStr) ? "major" : prof.scale;
  const barCount = Math.max(1, opts.barCount ?? 8);
  const timeSig = opts.timeSig ?? 4;
  const phraseBars = Math.max(1, Math.min(opts.phraseBars ?? 4, barCount));
  const phraseCount = Math.ceil(barCount / phraseBars);
  const highPointBar = clamp(opts.highPointBar ?? Math.ceil((barCount * 2) / 3), 1, barCount);
  const breathBeats = opts.breathBeats ?? prof.breath;
  const prog = opts.chordProgression && opts.chordProgression.length
    ? opts.chordProgression
    : ["C", "G", "Am", "F"];

  // 句法角色：A（主题）→ A'（模进）→ B（对比）→ A''（回归+扩张）
  const plans = [
    { role: "A" as const, anchorStep: 0, invert: false, augment: false },
    { role: "A'" as const, anchorStep: 1, invert: false, augment: false },
    { role: "B" as const, anchorStep: 2, invert: true, augment: false },
    { role: "A''" as const, anchorStep: 0, invert: false, augment: true },
  ];

  const phrases: MelodyPlan["phrases"] = [];
  for (let p = 0; p < phraseCount; p++) {
    const from = p * phraseBars + 1;
    const to = Math.min(barCount, from + phraseBars - 1);
    const role = phraseCount === 1 ? plans[0] : p === phraseCount - 1 && phraseCount > 3 ? plans[3] : plans[Math.min(p, 3)];
    // 能量：整体情绪基线 + 段落推进（最后一句最高，但受情绪上限约束）
    const ramp = phraseCount > 1 ? p / (phraseCount - 1) : 0;
    const energy = clamp(prof.energy * (0.75 + 0.5 * ramp), 0.15, 0.95);
    phrases.push({
      index: p,
      bars: [from, to],
      role: role.role,
      energy: Number(energy.toFixed(2)),
      cell: cellForEnergy(energy, mood),
      cadence: p === phraseCount - 1 ? "完全终止（落主音）" : "半终止（落属/色彩音）",
      anchorStep: role.anchorStep,
    });
  }

  return {
    key: opts.key,
    mood,
    scale: scaleType,
    barCount,
    timeSig,
    phraseBars,
    phraseCount,
    highPointBar,
    breathBeats,
    chords: prog,
    phrases,
  };
}

// ---------------------------------------------------------------- 主生成

export function generateMelody(opts: GenOptions): MelodyNote[] {
  const {
    key = "C", mood = "happy" as Mood, bpm = 120,
    useArpeggio = false, seed = 12345,
  } = opts;

  const plan = melodyPlan(opts);
  const prof = moodProfile(plan.mood);
  const { barCount, timeSig, breathBeats, highPointBar } = plan;

  const root = parseRootPitch(key);
  const scale = scalePitches(root, plan.scale, 55, 84);   // G3..C6 常用主旋律区
  const chords: Chord[] = plan.chords.map(parseChordName);

  const rng = mulberry32(seed);
  const notes: MelodyNote[] = [];

  // 起点音级：主音 + 八度（落在旋律中音区）
  const baseIdx = nearestIndex(scale, root + 12);
  const span = Math.min(prof.span, scale.length - 1 - baseIdx, 6);
  const peakBarIdx = highPointBar - 1;

  // 峰值音：从"想要的跨度"向外挑一个**在该小节和弦上不是避免音**的音，
  // 且优先和弦内音 —— 否则峰值音会被避免音护栏降半音，高点就塌了（实测踩过）。
  const peakChord = chords[peakBarIdx % chords.length];
  const chrPcs = chordPitchClasses(peakChord);
  const desiredPeak = clamp(baseIdx + Math.max(2, span), 0, scale.length - 1);
  let peakIdx = desiredPeak;
  {
    const lo = clamp(baseIdx + 2, 0, scale.length - 1);   // 峰值必须真的高于起点
    const scored = scale.map((p, i) => ({
      i,
      score: (i < lo ? 5000 : 0)
        + (chrPcs.includes(p % 12) ? 0 : 40)
        + (fixAvoidNote(p, peakChord).fixed ? 1000 : 0)
        + Math.abs(i - desiredPeak) * 8,
    })).sort((x, y) => x.score - y.score);
    peakIdx = scored[0].i;
  }

  // 高点以外的所有小节，音级上限 = 峰值 - 1 ⇒ 保证"高点唯一"
  const ceilIdxFor = (bar: number) => (bar === peakBarIdx ? peakIdx : Math.max(0, peakIdx - 1));

  // 轮廓：升到高点、再回落（相对锚点 baseIdx 的音阶级数偏移）
  const contour: number[] = [];
  for (let b = 0; b < barCount; b++) {
    if (b < peakBarIdx) contour.push(Math.round((span * (b + 1)) / (peakBarIdx + 1)));
    else if (b === peakBarIdx) contour.push(span);
    else {
      const t = (b - peakBarIdx) / Math.max(1, barCount - 1 - peakBarIdx);
      contour.push(Math.round(span * (1 - t)) - (b === barCount - 1 ? 1 : 0));
    }
  }
  if (contour[barCount - 1] > 0) contour[barCount - 1] = Math.max(0, contour[barCount - 1] - 1); // 收束回低位

  // 主题（每句共享，按句法角色做模进/倒影）
  const themeSteps = THEMES[Math.floor(rng() * THEMES.length)];

  let lastPitch = scale[clamp(baseIdx + 2, 0, scale.length - 1)];
  let prevPitch = lastPitch;
  let peakNote: MelodyNote | null = null;

  for (const phrase of plan.phrases) {
    const [fromBar, toBar] = phrase.bars;
    const role = phraseRole(phrase.index, plan.phraseCount);
    const anchorIdx = clamp(baseIdx + role.anchorStep, 0, peakIdx);
    const cellName = phrase.cell as keyof typeof CELLS;
    const augment = role.augment ? 1.5 : 1;
    const phraseStart = notes.length;   // 本句音符起点（用于句末统一收口）
    const phraseUse = new Map<number, number>();   // 本句各音用了多少次（挑音时扣分，治"单音打转"）
    // 本句音级窗口：**按构造保证整句不超过八度**（这样"句内跨八度"这条判据根本不会触发）
    const hasPeakBar = peakBarIdx >= fromBar - 1 && peakBarIdx <= toBar - 1;
    const phraseHiIdx = hasPeakBar ? peakIdx : Math.max(0, peakIdx - 1);
    let phraseLoIdx = 0;
    for (let j = 0; j <= phraseHiIdx; j++) if (scale[phraseHiIdx] - scale[j] <= 12) { phraseLoIdx = j; break; }

    for (let bar = fromBar - 1; bar < toBar; bar++) {
      const barStart = bar * timeSig;
      const chord = chords[bar % chords.length];
      const isCadenceBar = bar === toBar - 1;
      const isPeakBar = bar === peakBarIdx;
      const barTarget = clamp(anchorIdx + contour[bar], 0, ceilIdxFor(bar));

      const energy = phrase.energy;
      const rhythm: [number, number][] = [];
      let cadPos = -1, cadDur = 0;

      if (isCadenceBar) {
        const cad = cadenceBarRhythm(timeSig, breathBeats, 1.5, energy);
        rhythm.push(...cad.fill);
        cadPos = cad.cadPos; cadDur = cad.cadDur;
        rhythm.push([cad.cadPos, cad.cadDur]);   // 落音本身
      } else {
        const cell = cellToRhythm(CELLS[cellName] ?? CELLS.walk, timeSig);
        for (const [s, d] of cell) rhythm.push([s, Math.min(d * augment, timeSig - s)]);
        // 句内气口（抒情类情绪）：第二小节抽掉一拍
        if ((plan.mood === "sad" || plan.mood === "dark" || plan.mood === "calm")
            && bar === fromBar) {
          const drop = rhythm.findIndex(([s]) => s >= timeSig / 2 && s < timeSig / 2 + 0.01);
          if (drop >= 0) rhythm.splice(drop, 1);
        }
      }

      // 时值收口：单声部旋律不许重叠 —— 一个音的时值不得超过下一个音的起点，也不得越过小节线。
      // （A'' 句会把时值 ×1.5，这里必须兜住，否则 0.75 拍的音会塞进 0.5 拍的格子里 ⇒ 15 处重叠，实测踩过。）
      rhythm.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < rhythm.length; k++) {
        const nextStart = k + 1 < rhythm.length ? rhythm[k + 1][0] : timeSig;
        rhythm[k][1] = Math.max(0.0625, Math.min(rhythm[k][1], nextStart - rhythm[k][0]));
      }

      // 本小节的目标音级：高点小节逐音爬向峰值，其余小节由"主题轮廓 + 小节目标"给出
      let idx = clamp(barTarget, 0, ceilIdxFor(bar));
      let motifCursor = 0;

      for (let i = 0; i < rhythm.length; i++) {
        const [start, dur] = rhythm[i];
        if (start >= timeSig) continue;
        const beatPos = barStart + start;
        const isCadence = isCadenceBar && Math.abs(start - cadPos) < 1e-6;
        const isStrong = Math.abs(start % 2) < 1e-6;   // 1、3 拍（4/4 下）
        const isPeakNote = isPeakBar && i === 1;       // 峰值落在小节第 2 个音（通常是强拍）

        if (!isCadence) {
          if (isPeakBar) {
            idx = clamp(peakIdx - Math.max(0, Math.abs(i - 1)), 0, peakIdx);   // 爬上去再回落
          } else {
            const step = themeSteps[motifCursor % themeSteps.length] * (role.invert ? -1 : 1);
            const base = anchorIdx + step;
            const pull = Math.round((barTarget - base) * (i / Math.max(1, rhythm.length - 1)));
            idx = clamp(base + pull, 0, ceilIdxFor(bar));
            motifCursor++;
          }
        }

        // 落音：完全终止落主音，半终止按情绪落属音/色彩音（在想要的音级里取离前音最近的那个）
        let forcePc: number | undefined;
        if (isCadence) {
          forcePc = (root + (phrase.index === plan.phraseCount - 1 ? prof.cadenceFinal : prof.cadenceMid)) % 12;
        }

        // 统一挑音：调内 · 不越峰值 · **与前一音 ≤8 半音（六度以上大跳一律不许）** ·
        // 不是避免音 · 强拍偏和弦内音 · **本句用过的音要扣分（治"单音打转"）**
        const pitch = pickPitch({
          scale, desiredIdx: idx,
          ceilIdx: Math.min(ceilIdxFor(bar), phraseHiIdx),
          floorIdx: phraseLoIdx,
          lastPitch, chord, use: phraseUse, maxLeap: 8, forcePc, preferChordTone: isStrong && !isCadence,
        });

        // 力度：强拍重、弱拍轻（供 SV 直接落 dynamics）
        const baseVel = plan.mood === "calm" ? 0.68 : plan.mood === "epic" ? 0.82 : 0.75;
        const vel = clamp(baseVel + (isStrong ? 0.12 : 0) + (isPeakBar ? 0.03 : 0) + (rng() - 0.5) * 0.06, 0.55, 0.97);

        notes.push({ pitch, startBeat: beatPos, durBeats: Math.max(0.25, dur), vel: Number(vel.toFixed(3)) });
        if (isPeakNote) peakNote = notes[notes.length - 1];
        phraseUse.set(pitch, (phraseUse.get(pitch) || 0) + 1);
        prevPitch = lastPitch;
        lastPitch = pitch;
      }

      // 伴奏琶音：跟和弦音走，低八度（vel < 0.5 ⇒ writer 归入伴奏轨）
      if (useArpeggio) {
        const arp = chord.tones.map((t) => t - 12);
        const seq = [...arp, arp[0] + 12];
        const per = Math.max(1, Math.round(seq.length / Math.max(1, timeSig)));
        for (let b = 0; b < timeSig; b++) {
          const idxA = Math.min(seq.length - 1, Math.floor(b * per));
          notes.push({ pitch: clamp(seq[idxA], 40, 72), startBeat: barStart + b, durBeats: 0.5, vel: 0.4 });
        }
      }
    }

    // 句末收口：pickPitch 已按"句内 ≤ 八度"的窗口构造，这里只在必要时兜一下（不移动音符，避免制造大跳）
  }

  notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);

  // 高点唯一性收口：非高点小节的音不许碰到峰值；更高的一律降八度（保持音级）
  const peakPitch = scale[peakIdx];
  for (const n of notes) {
    if (n.vel < 0.5) continue;   // 伴奏层不参与
    const bar = Math.floor(n.startBeat / timeSig);
    if (n.pitch > peakPitch) n.pitch -= 12;
    if (bar !== peakBarIdx && n.pitch === peakPitch) n.pitch -= 12;
  }
  // 同音堆叠收口：连续 ≥3 个同音 ⇒ 改走相邻音级（不许碰到峰值；优先不改动"唯一高点"那个音）
  // 若找不到合格候选（例如 G5 在 C 和弦上，邻音 F5 是避免音、A5 又撞峰值），就把第 3 个音并进前一个音
  // —— 拉长同一个音比硬塞一个错音好，段内音域也不会因此变大。
  const drop = new Set<MelodyNote>();
  for (let i = 2; i < notes.length; i++) {
    const a = notes[i - 2], b = notes[i - 1], c = notes[i];
    if (a.vel < 0.5 || b.vel < 0.5 || c.vel < 0.5) continue;
    if (a.pitch !== b.pitch || b.pitch !== c.pitch) continue;
    const chord = chords[Math.floor(c.startBeat / timeSig) % chords.length];
    const atPeak = notes.filter((n) => n.pitch === peakPitch).length;
    // 该音所在句的音域窗口（换八度不许把一句撑过八度）
    const [fb, tb] = plan.phrases[Math.min(plan.phrases.length - 1, Math.floor(Math.floor(c.startBeat / timeSig) / plan.phraseBars))].bars;
    const winFrom = (fb - 1) * timeSig, winTo = tb * timeSig;
    const spanOk = (cand: number): boolean => {
      const ps = notes.filter((n) => n.vel >= 0.5 && n.startBeat >= winFrom && n.startBeat < winTo).map((n) => n.pitch);
      ps.push(cand);
      return Math.max(...ps) - Math.min(...ps) <= 12;
    };
    const tryMove = (t: MelodyNote): boolean => {
      if (t === peakNote && atPeak <= 1) return false;   // 唯一高点不许动
      const at = nearestIndex(scale, t.pitch);
      // 候选：相邻音级 / 上下八度（同音名换八度，调性不变）；要求不是避免音、不碰峰值、不撑破句内音域
      const cands = [at + 1, at - 1, at + 2, at - 2]
        .map((j) => scale[clamp(j, 0, scale.length - 1)])
        .filter((p, k, arr) => p !== t.pitch && p < peakPitch && !fixAvoidNote(p, chord).fixed
          && Math.abs(p - t.pitch) <= 8 && spanOk(p) && arr.indexOf(p) === k)
        .sort((x, y) => Math.abs(x - t.pitch) - Math.abs(y - t.pitch));
      if (!cands.length) return false;
      t.pitch = cands[0];
      return true;
    };
    if (!tryMove(c) && !tryMove(b)) {
      if (c !== peakNote) {
        b.durBeats = Number((c.startBeat + c.durBeats - b.startBeat).toFixed(4));
        drop.add(c);
      }
    }
  }
  for (const v of drop) {
    const k = notes.indexOf(v);
    if (k >= 0) notes.splice(k, 1);
  }

  notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);

  // 预留模型位：外部（如 LLM）可整体覆盖旋律
  if (opts.modelHook) {
    const hookResult = opts.modelHook({
      key, mood, bpm, bars: barCount,
      chords: plan.chords, scale: plan.scale,
    });
    if (Array.isArray(hookResult) && hookResult.length) return hookResult as MelodyNote[];
  }

  return notes;
}

// 句法角色查表（与 melodyPlan 内保持一致）
function phraseRole(index: number, phraseCount: number): { role: string; anchorStep: number; invert: boolean; augment: boolean } {
  const table = [
    { role: "A", anchorStep: 0, invert: false, augment: false },
    { role: "A'", anchorStep: 1, invert: false, augment: false },
    { role: "B", anchorStep: 2, invert: true, augment: false },
    { role: "A''", anchorStep: 0, invert: false, augment: true },
  ];
  if (phraseCount === 1) return table[0];
  if (index === phraseCount - 1 && phraseCount > 3) return table[3];
  return table[Math.min(index, 3)];
}
