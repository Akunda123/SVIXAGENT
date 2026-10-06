/**
 * **BPM 包络（可变速度）测量** —— 完全不依赖宿主（不需要 SV / IX / ACE 在线）。
 *
 * 为什么单独做这一件（用户 2026-10-06 提：「完全不依赖 SV2 的可变 bpm 测量，上次那个不好用」）：
 *   · 老路子把测量埋在 `sv_analyze_audio` 里、把**应用**放在 `sv_apply_tempo`（走桥写 SV2 的 tempo 标）
 *     ⇒ **不独立**（没有 SV2 就什么都拿不到），而且**没法自证准不准**。
 *   · 老路子只报**一个** BPM（`detect` 给的是均匀网格）⇒ 像 118–122 这种小幅浮动的伴奏会被硬拉直。
 *
 * 现行做法（依据调研，见 `docs/识谱接入.md` 旁注）：
 *   · **引擎用 `beatTrack`（Ellis《Beat Tracking by Dynamic Programming》JNMR 2007，MIT，随 `@audio/beat` 分发）**
 *     —— `@audio/beat` 的 README 明说它适用 "irregular timing / live performance / **rubato**"，
 *     而 `detect` 是"metronomic 专用"。带 `bpm` 先验 + `tightness`（越大越钉死）即可跟着浮动走。
 *   · 逐拍间隔 → BPM，**中值平滑** → **包络**（逐拍点 + 每 N 拍的 tempo mark 段落）。
 *   · 产物：**点击轨 WAV**（听一遍就知道准不准 —— 这是"好用"的关键）、**MIDI tempo 轨**（拖进任何 DAW）、
 *     **CSV**（Excel 看曲线）、JSON。宿主只是**可选**的后续消费者。
 *
 * 纪律：**不做静默判断** —— 倍频歧义、拍点太少、段间跳变、抖动全部进 `warnings`；
 *      代表值取**中位数**（不是均值），避免个别漏拍把整曲值带偏。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeMidi } from "midi-file";
import { readMonoFromWav } from "./analyze.js";

export interface TempoEnvelopePoint {
  /** 第几拍（0 起） */
  beat: number;
  /** 该拍在本曲中的秒数 */
  timeSec: number;
  /** 平滑后的 BPM（**包络值**，推荐用它） */
  bpm: number;
  /** 原始（未平滑）BPM：60 / 与上一拍的间隔 */
  raw: number;
  /** 小节号（1 起，按 `beatsPerBar` 折算） */
  bar: number;
  /** 小节内第几拍（1 起） */
  beatInBar: number;
}

export interface TempoSegment {
  /** 段起点（秒） */
  startSec: number;
  /** 该段 BPM（段内所有拍间隔的**中值**） */
  bpm: number;
  /** 段内拍数（末段可能不足） */
  beats: number;
  /** 段起点所在小节（1 起） */
  bar: number;
}

export interface MeasureTempoOptions {
  /** 速度先验（拍到大致 BPM 就给，能显著压掉倍频错误） */
  bpmHint?: number;
  /** 速度**硬下限**（默认 40）—— 与 `bpmMax` 一起**把搜索锁进区间**：
   *  例：明明该是 78 却被锁到 117（= 78×1.5，附点/6-8 拍感的 3:2 关系）⇒ 给 `bpmMin:60,bpmMax:90` 重测。
   *  ⚠️ 区间里若**一个候选都没有**，工具**明确报错**（把找到的候选列出来），不会静默返回区间外的值。 */
  bpmMin?: number;
  /** 速度**硬上限**（默认 220） */
  bpmMax?: number;
  /** DP 拍点跟踪的"钉死程度"（默认 680；**越小越能跟浮动**，越大越像节拍器） */
  tightness?: number;
  /** 每段几拍（默认 4 = 一小节） */
  segmentBeats?: number;
  /** 每小节几拍（默认 4；只影响 bar/beatInBar 标注与小节重音） */
  beatsPerBar?: number;
  startSec?: number;
  endSec?: number;
  /** 包络平滑窗（拍，默认 **8** = 回归窗 ±4 拍 ≈ ±2 秒）。
   *  ⚠️ 2026-10-06 真机调过：默认 4（±2 拍 ≈ ±0.9 秒）会把**真实演奏的呼吸**放大成 ±7 BPM 的假波动
   *  （只有吉他+人声的素材上实测：range 14.9 → 放宽到 8 后 8.4、放宽到 16 后 5.7）。
   *  想更细（跟得更紧）传 4；想更稳传 16。 */
  smoothBeats?: number;
  /** 是否把拍点**吸附到 onset 峰值**（默认 true —— 这一步决定了包络准不准，见测量流程 ②b） */
  snapToOnsets?: boolean;
  /**
   * **集成跟踪**（默认 true）：稀疏 onset 素材（**只有吉他+人声、没有鼓**）上，库里的自由 DP 跟踪是
   * "临界"的 —— 先验差 0.2 BPM 就可能从 162 拍跳到 174 拍（实测 2026-10-06）。
   * 所以对几组「先验 × 松紧」各跑一次，用**最能解释实际 onset**的那组（吸附率 + 覆盖 − 跳变惩罚），
   * 并把**组间分歧**当不确定度如实报出来（分歧大 ⇒ 这份素材本身拍点不稳，别硬信包络）。
   */
  ensemble?: boolean;
  /** 集成跑几组（默认 4；每组 ≈ 一次 STFT，73s 音频约 1.7s） */
  ensembleRuns?: number;
  /** 产物目录（默认：与输入音频同目录） */
  outDir?: string;
  /** 是否落产物（默认 true） */
  writeArtifacts?: boolean;
}

export interface MeasureTempoResult {
  ok: true;
  input: string;
  durationSec: number;
  sampleRate: number;
  /** 代表 BPM = 包络的**中位数** */
  bpm: number;
  bpmHintUsed: number | null;
  tightness: number;
  confidence: number;
  beatCount: number;
  /** 吸附到 onset 峰的拍数 / 没能吸附的拍数（后者多 ⇒ 素材是连奏/弱起，包络可信度下降） */
  snappedBeats: number;
  unsnappedBeats: number;
  firstBeatSec: number;
  beatsPerBar: number;
  /** 覆盖时长（首拍→末拍）与全曲时长的比（低 ⇒ 首尾没排上拍，要看警告） */
  coverage: number;
  stats: { min: number; max: number; median: number; range: number; driftBpmPerMin: number; jitterMs: number };
  envelope: TempoEnvelopePoint[];
  segments: TempoSegment[];
  candidates: { bpm: number; confidence: number }[];
  /** **集成跟踪**信息：几组解各得多少分、选中的是哪组、以及**组间分歧**（= 这份素材的不确定度） */
  ensemble: { runs: number; spreadBpm: number[]; chosen: string; snapRate: number; scores: string[] };
  warnings: string[];
  artifacts: { csv?: string; midi?: string; click?: string; json?: string };
}

/* ───────────────────────── 倍频纠正 ───────────────────────── */

/** 把候选折到 [40,220]，并给出与先验的对数距离（无先验就用"越靠近 120 越可信"的弱偏好）。 */
function pickTempo(
  cands: { bpm: number; confidence: number }[],
  hint?: number,
  min = 40,
  max = 220,
): { bpm: number; from: string } | null {
  const pool: { bpm: number; confidence: number; from: string; score: number }[] = [];
  for (const c of cands) {
    if (!Number.isFinite(c.bpm) || c.bpm <= 0) continue;
    for (const [mul, tag] of [[1, "原值"], [2, "×2"], [0.5, "÷2"], [3, "×3"], [1 / 3, "÷3"], [1.5, "×1.5"], [2 / 3, "÷1.5"]] as const) {
      const b = c.bpm * mul;
      if (b < min || b > max) continue;                       // ← 硬性区间（含 1.5 倍关系：附点/6-8 拍感）
      const dist = hint ? Math.abs(Math.log(b / hint)) : Math.abs(Math.log(b / 120)) * 0.35;
      pool.push({ bpm: b, confidence: c.confidence, from: `${c.bpm.toFixed(1)}${tag === "原值" ? "" : tag}`, score: dist - c.confidence * 0.25 });
    }
  }
  if (!pool.length) return null;
  pool.sort((a, b) => a.score - b.score);
  return { bpm: pool[0].bpm, from: pool[0].from };
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ───────────────────────── 主测量 ───────────────────────── */

export async function measureTempoEnvelope(input: string, opts: MeasureTempoOptions = {}): Promise<MeasureTempoResult> {
  const abs = path.resolve(String(input || ""));
  if (!existsSync(abs)) throw new Error("读不到这个音频文件：" + abs);
  if (path.extname(abs).toLowerCase() !== ".wav") {
    throw new Error("只收 **WAV**（其它格式先走 `sv_convert_audio` 转 44.1k 立体声 WAV）：" + abs);
  }
  const beatsPerBar = Math.max(1, Math.floor(opts.beatsPerBar ?? 4));
  const segmentBeats = Math.max(1, Math.floor(opts.segmentBeats ?? 4));
  const smoothBeats = Math.max(1, Math.floor(opts.smoothBeats ?? 8));
  const tightness = Number.isFinite(opts.tightness as number) ? Number(opts.tightness) : 680;
  /* 速度**硬区间**（默认 40–220）：候选池与引擎的 minBpm/maxBpm 都用它。 */
  const bpmMin = Number.isFinite(opts.bpmMin as number) ? Number(opts.bpmMin) : 40;
  const bpmMax = Number.isFinite(opts.bpmMax as number) ? Number(opts.bpmMax) : 220;
  if (!(bpmMax > bpmMin)) throw new Error(`bpmMin/bpmMax 不合法：${bpmMin} / ${bpmMax}（要求 bpmMax > bpmMin）`);
  const warnings: string[] = [];

  const { signal, sr } = readMonoFromWav(abs, opts.startSec ?? 0, opts.endSec);
  if (!signal.length) throw new Error("音频是空的：" + abs);
  const durationSec = Math.round((signal.length / sr) * 1000) / 1000;
  if (durationSec < 5) warnings.push(`音频只有 ${durationSec}s —— 少于 5s 时 BPM 估计不可靠，建议整段（或 ≥ 8 小节）再测`);

  const { detect, tempo, beatTrack } = await import("@audio/beat");

  // ① 初值 + 候选（自由检测），并补几个子区间，便于识别倍频歧义
  const cands: { bpm: number; confidence: number }[] = [];
  let detBpm = 0, detConf = 0;
  try {
    const det = detect(signal, { fs: sr });
    detBpm = det.bpm || 0;
    detConf = det.confidence || 0;
    if (detBpm) cands.push({ bpm: detBpm, confidence: detConf });
  } catch { /* 继续用 tempo() 的候选 */ }
  try {
    const tr = tempo(signal, { fs: sr, minBpm: 40, maxBpm: 220 });
    if (tr && tr.bpm) cands.push({ bpm: tr.bpm, confidence: tr.confidence });
    for (const c of (tr && tr.candidates) || []) cands.push({ bpm: c.bpm, confidence: c.confidence });
  } catch { /* optional */ }
  // 补几个子区间候选：**以用户要的区间为准**（有 bpmMin/bpmMax 时不再乱扫区间外）
  const bands: [number, number][] = [
    [Math.max(bpmMin, 80), Math.min(bpmMax, 140)],
    [Math.max(bpmMin, 110), Math.min(bpmMax, 135)],
    [bpmMin, Math.min(bpmMax, bpmMin + 30)],
    [Math.max(bpmMin, bpmMax - 30), bpmMax],
  ];
  for (const [lo, hi] of bands) {
    if (cands.length >= 6 || !(hi > lo)) break;
    try {
      const d2 = detect(signal, { fs: sr, minBpm: lo, maxBpm: hi });
      if (d2 && d2.bpm) cands.push({ bpm: d2.bpm, confidence: d2.confidence });
    } catch { /* optional */ }
  }

  const picked = pickTempo(cands, opts.bpmHint, bpmMin, bpmMax);
  if (!picked) {
    const found = cands.map((c) => c.bpm.toFixed(1)).join(", ");
    if (!cands.length) {
      // 一个候选都没有 ⇒ 原因在**音频本身**（不是区间）：静音/太短/无节拍。别把锅推给用户的区间。
      throw new Error(`测不到拍点（音频太短 / 太静 / 没有节拍？）：${abs}`);
    }
    throw new Error(
      `在 **${bpmMin}–${bpmMax} BPM** 区间里找不到候选（检测到的候选：${found}）。\n` +
      `要么放宽 \`bpmMin\`/\`bpmMax\`，要么确认这个区间是否对 —— 我们**不会静默给你区间外的值**。`
    );
  }
  const chosen = picked;
  const hint = Number.isFinite(opts.bpmHint as number) ? Number(opts.bpmHint) : null;
  if (Math.abs(chosen.bpm - (detBpm || chosen.bpm)) > 1) {
    warnings.push(`倍频纠正：自由检测给 ${detBpm.toFixed(1)}，实际采用 **${chosen.bpm.toFixed(1)}**（来自 ${chosen.from}${hint ? `，先验 ${hint}` : ""}）`);
  }

  // ② 拍点：**带先验的 DP 跟踪**（rubato 自适应）—— 不是 detect 的均匀网格
  let beats: number[] = [];
  let trackConf = 0;
  const ensembleInfo: { runs: number; spreadBpm: number[]; chosen: string; snapRate: number; scores: string[] } = {
    runs: 0, spreadBpm: [0, 0], chosen: "", snapRate: 0, scores: [],
  };
  try {
    const tri = (b: number) => { const bt = beatTrack(signal, { fs: sr, bpm: b, tightness, minBpm: bpmMin, maxBpm: bpmMax }); return bt && bt.beats ? Array.from(bt.beats as Float64Array) : []; };
    const wantEnsemble = opts.ensemble !== false;
    // 先单独跑一次"基准"（顺带拿 confidence）
    const base = beatTrack(signal, { fs: sr, bpm: chosen.bpm, tightness, minBpm: bpmMin, maxBpm: bpmMax });
    trackConf = (base && base.confidence) || 0;
    beats = base && base.beats ? Array.from(base.beats as Float64Array) : [];

    if (wantEnsemble) {
      // 先拿一份 onset 峰（细 hop）——既用于**打分**，也用于 ②b 的吸附
      const { onsets: onsetFn } = await import("@audio/beat");
      const peaksForScore = Array.from(onsetFn(signal, { fs: sr, hopSize: 128, frameSize: 1024 }) as Float64Array).sort((a, b) => a - b);
      const dedup = (ps: number[]) => { const c: number[] = []; for (const p of ps) if (!c.length || p - c[c.length - 1] > 0.03) c.push(p); return c; };
      const pk = dedup(peaksForScore);
      /** 解释度打分：吸附率高、跳变少、拍数接近"按 BPM 应有"的更好 */
      const scoreOf = (bs: number[]) => {
        if (bs.length < 8) return { score: -1, snapRate: 0, jumps: 0 };
        let snapped = 0;
        for (let i = 0; i < bs.length; i++) {
          const period = i > 0 ? bs[i] - bs[i - 1] : (bs[1] - bs[0]);
          const lim = Math.min(0.16, Math.max(0.02, period / 6));
          let bestD = Number.POSITIVE_INFINITY;
          for (const p of pk) { const d = Math.abs(p - bs[i]); if (d < bestD) bestD = d; if (p > bs[i] + lim) break; }
          if (bestD <= lim) snapped++;
        }
        const snapRate = snapped / bs.length;
        const expect = ((bs[bs.length - 1] - bs[0]) / 60) * chosen.bpm + 1;
        const countPen = Math.min(0.5, Math.abs(bs.length - expect) / Math.max(1, expect));
        const segs = Math.max(1, Math.floor(bs.length / segmentBeats));
        let jumps = 0;
        for (let k = 1; k < segs; k++) {
          const a = 60 / Math.max(1e-6, (bs[Math.min(bs.length - 1, k * segmentBeats)] - bs[Math.min(bs.length - 1, (k - 1) * segmentBeats)]) / segmentBeats);
          const b2 = 60 / Math.max(1e-6, (bs[Math.min(bs.length - 1, (k + 1) * segmentBeats)] - bs[Math.min(bs.length - 1, k * segmentBeats)]) / segmentBeats);
          if (Math.abs(a - b2) > 12) jumps++;
        }
        const jumpPen = Math.min(0.3, jumps / Math.max(1, segs));
        return { score: snapRate - countPen - jumpPen, snapRate, jumps };
      };
      const priors = [chosen.bpm, chosen.bpm * 0.985, chosen.bpm * 1.015].slice(0, Math.max(1, Math.min(3, Math.ceil((opts.ensembleRuns ?? 4) / 2))));
      const tights = [tightness, tightness * 1.7];
      let best = { bs: beats, score: -2, snapRate: 0, prior: chosen.bpm, tight: tightness };
      const allBpm: number[] = [];
      for (const prior of priors) {
        for (const tg of tights) {
          const bs = beats.length && Math.abs(prior - chosen.bpm) < 1e-9 && Math.abs(tg - tightness) < 1e-9 ? beats : tri(prior);
          if (bs.length < 8) continue;
          const sc = scoreOf(bs);
          const bpmOf = 60 / ((bs[bs.length - 1] - bs[0]) / (bs.length - 1));
          allBpm.push(Math.round(bpmOf * 10) / 10);
          ensembleInfo.scores.push(`${prior.toFixed(1)}@${Math.round(tg)}=${sc.score.toFixed(3)}(吸附${(sc.snapRate * 100).toFixed(0)}%)`);
          if (sc.score > best.score) best = { bs, score: sc.score, snapRate: sc.snapRate, prior, tight: tg };
        }
      }
      if (best.score > -2) {
        beats = best.bs;
        ensembleInfo.runs = allBpm.length;
        ensembleInfo.spreadBpm = allBpm.length ? [Math.min(...allBpm), Math.max(...allBpm)] : [0, 0];
        ensembleInfo.chosen = `${best.prior.toFixed(1)}@${Math.round(best.tight)}`;
        ensembleInfo.snapRate = Math.round(best.snapRate * 1000) / 1000;
      }
    }
  } catch (e) {
    warnings.push("拍点跟踪失败，退回自由检测的拍点：" + (e instanceof Error ? e.message : String(e)));
  }
  if (beats.length < 2) {
    try {
      const det = detect(signal, { fs: sr });
      beats = det && det.beats ? Array.from(det.beats as Float64Array) : [];
      if (beats.length >= 2) warnings.push("用了**自由检测**的拍点（均匀网格）—— 浮动速度下会偏，建议给 `bpmHint` 重测");
    } catch { /* 下面统一报错 */ }
  }
  if (beats.length < 2) throw new Error("测不到拍点（音频太短/太静/无节奏？）：" + abs);
  if (beats.length < 8) warnings.push(`只找到 ${beats.length} 个拍点 —— 包络不可信，建议给更长的片段或先给 \`bpmHint\``);

  /* ②b **把拍点吸附到 onset 峰值**（关键一步，2026-10-06 单测逼出来的）：
   *    Ellis DP 给的是"音乐上合理"的拍位网格，在 click / 打击型素材上会落在击点**旁边**
   *    （实测：稳态 120 的点击轨上抖动 21 ms、包络 range 5.6 BPM、首拍偏移差 64 ms ⇒ 这就是"上次那个不好用"）。
   *    把每拍吸到最近的 onset 峰（限 ±min(0.16s, 拍长/6)）⇒ 间隔立刻变准。
   *    吸附后若拍序不再严格递增就**整段放弃**（宁可不吸，也不产出错乱的拍点），并记 warning。 */
  let snapped = 0, unsnapped = 0;
  if (opts.snapToOnsets !== false) {
    try {
      const { onsets: onsetFn } = await import("@audio/beat");
      // ⚠️ **细 hop**：默认 hop（512）在 22.05 kHz 下 ≈ 23 ms/帧 —— 拍点时间的量化噪声就是它
      //    （实测稳态 120 的包络被它抖出 5 BPM 假波动）。这里用 128（≈5.8 ms）专门取 onset 时刻。
      const peaks = Array.from(onsetFn(signal, { fs: sr, hopSize: 128, frameSize: 1024 }) as Float64Array).sort((a, b) => a - b);
      const clean: number[] = [];
      for (const p of peaks) if (!clean.length || p - clean[clean.length - 1] > 0.03) clean.push(p); // 同一击点的多次触发去重
      const out: number[] = [];
      for (let i = 0; i < beats.length; i++) {
        const period = beats.length > 1 ? (i > 0 ? beats[i] - beats[i - 1] : beats[1] - beats[0]) : 0.5;
        const lim = Math.min(0.16, Math.max(0.02, period / 6));
        let best = -1, bestD = Number.POSITIVE_INFINITY;
        for (const p of clean) {
          const d = Math.abs(p - beats[i]);
          if (d < bestD) { bestD = d; best = p; }
          if (p > beats[i] + lim) break;
        }
        if (best >= 0 && bestD <= lim) { out.push(best); snapped++; } else { out.push(beats[i]); unsnapped++; }
      }
      let monotone = true;
      for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) { monotone = false; break; }
      if (monotone) beats = out;
      else { warnings.push("吸附到 onset 会让拍序非单调 ⇒ 放弃吸附（包络可能偏抖）"); snapped = 0; }
    } catch (e) {
      warnings.push("onset 吸附不可用（继续用原始拍点）：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  /* ③ 逐拍 BPM = **局部线性回归的斜率**（+ 中值平滑）。
   *    为什么不用"相邻两拍直接换算"（2026-10-06 单测逼出来的）：onset/ODF 是**按帧**给的，
   *    默认 hop 在 22.05 kHz 下 ≈ 23 ms/帧 ⇒ 拍点时间天然带 ±20 ms 量化噪声；
   *    直接换算会让稳态 120 的包络抖出 5 BPM 的假波动（实测 range 5.6、jitter 21 ms）。
   *    用 ±`smoothBeats` 拍做一次最小二乘拟合取斜率，量化噪声被平均掉，且**照样跟得上浮动**。 */
  const raw: number[] = [0];
  for (let i = 1; i < beats.length; i++) {
    const dt = beats[i] - beats[i - 1];
    raw.push(dt > 1e-6 ? 60 / dt : 0);
  }
  const half = Math.max(1, Math.floor(smoothBeats / 2));
  /** 第 i 拍处的局部速度（BPM）：对 [i-half, i+half] 的 (拍序, 时间) 做最小二乘，斜率 = 秒/拍 */
  const localBpm = (i: number): number => {
    const lo = Math.max(0, i - half), hi = Math.min(beats.length - 1, i + half);
    const n = hi - lo + 1;
    if (n < 3) return raw[i] > 0 ? raw[i] : chosen.bpm;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = lo; k <= hi; k++) { sx += k; sy += beats[k]; sxx += k * k; sxy += k * beats[k]; }
    const den = n * sxx - sx * sx;
    const slope = den > 1e-12 ? (n * sxy - sx * sy) / den : 0;   // 秒/拍
    return slope > 1e-9 ? 60 / slope : (raw[i] > 0 ? raw[i] : chosen.bpm);
  };
  const envelope: TempoEnvelopePoint[] = beats.map((t, i) => ({
    beat: i,
    timeSec: Math.round(t * 1000) / 1000,
    bpm: Math.round(localBpm(i) * 100) / 100,
    raw: Math.round((raw[i] || 0) * 100) / 100,
    bar: Math.floor(i / beatsPerBar) + 1,
    beatInBar: (i % beatsPerBar) + 1,
  }));

  // ④ 段（每 segmentBeats 拍一个 tempo mark）—— ⚠️ 段值取**平滑包络**的中值（不是原始间隔的中值）：
  //    否则会出现"包络 range 8.4 却报 6 处跳变 >8"这种自相矛盾的报告（段比包络更抖），
  //    而且导进 DAW 的 tempo 轨也会一抖一抖。2026-10-06 真机发现。
  const segments: TempoSegment[] = [];
  for (let i = 0; i + 1 < beats.length; i += segmentBeats) {
    const end = Math.min(i + segmentBeats, beats.length - 1);
    const vals = envelope.slice(i, end + 1).map((p) => p.bpm).filter((v) => v > 0);
    if (!vals.length) continue;
    segments.push({
      startSec: Math.round(beats[i] * 1000) / 1000,
      bpm: Math.round(median(vals) * 100) / 100,
      beats: end - i,
      bar: Math.floor(i / beatsPerBar) + 1,
    });
  }

  // ⑤ 统计（用平滑后的包络；代表值是中位数，不是均值）
  //   ⚠️ **只统计"内部"拍**（掐掉首尾各 `half` 拍）：回归窗口在两端被截断，端点的速度估计会外推失真
  //   （实测：稳态 120 的包络 range 3.3 里，几乎全是端点贡献；掐掉后是 <1）。
  const halfStat = Math.min(half, Math.max(0, Math.floor((envelope.length - 2) / 2)));
  const interior = envelope.slice(halfStat, envelope.length - halfStat || undefined);
  const envVals = (interior.length >= 4 ? interior : envelope).slice(1).map((p) => p.bpm).filter((v) => v > 0);
  // ⚠️ 别用 `Math.max(...arr)`：长音频（几万拍）会把调用栈撑爆 ⇒ reduce
  const sMin = envVals.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  const sMax = envVals.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
  const med = median(envVals);
  // 漂移：包络对时间的线性回归斜率（BPM/分钟）—— 118→122 这类小幅浮动看得出方向
  //   ⚠️ 必须用**同一组点**（曾经 xs 取整段、ys 取内部段 ⇒ 长度不匹配 ⇒ drift 变 NaN/null 被单测抓到）
  const statPts = (interior.length >= 4 ? interior : envelope).filter((p) => p.bpm > 0);
  let drift = 0;
  {
    const n = statPts.length;
    if (n >= 4) {
      const t0 = statPts[0].timeSec;
      const xs = statPts.map((p) => p.timeSec - t0);
      const ys = statPts.map((p) => p.bpm);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0, den = 0;
      for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
      drift = den > 1e-9 ? (num / den) * 60 : 0;
    }
  }
  const diffs = envelope.slice(1).map((p) => Math.abs(p.raw - p.bpm)).filter((v) => v > 0);
  // 抖动的**毫秒**换算：拍长 = 60/bpm ⇒ Δt ≈ 60·Δbpm / bpm²（别写成 Δbpm/bpm·60，那会大两个数量级）
  const avgDiffBpm = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const jitterMs = med > 0 ? Math.round((60 * avgDiffBpm / (med * med)) * 1000) : 0;

  // ⑥ 警告：抖动、跳变、覆盖不足
  if (jitterMs > 60) warnings.push(`逐拍抖动较大（原始值与包络平均差 ${jitterMs} ms）—— 可能是弱起拍/装饰音被当拍点；调大 \`tightness\` 或给 \`bpmHint\` 再测`);
  {
    let jump = 0;
    for (let i = 1; i < segments.length; i++) {
      const d = Math.abs(segments[i].bpm - segments[i - 1].bpm);
      if (d > 8) jump++;
    }
    if (jump) warnings.push(`有 ${jump} 处相邻段 BPM 跳变 > 8（可能漏拍/多拍）—— 看点击轨核对`);
  }
  const cover = (beats[beats.length - 1] - beats[0]) / durationSec;
  if (cover < 0.6) warnings.push(`拍点只覆盖了全曲的 ${(cover * 100).toFixed(0)}%（首/尾可能没排上拍）—— 看点击轨核对`);
  if (unsnapped > beats.length * 0.3) {
    warnings.push(`${unsnapped}/${beats.length} 个拍点附近**没有 onset 峰**（连奏/弱起素材？）⇒ 这些拍的包络靠平滑值撑着，听点击轨确认`);
  }
  /* 集成分歧 = **不要硬信包络**的信号。稀疏 onset（例如只有吉他+人声、没有鼓）上，库里的自由 DP 是临界的：
   * 先验差 0.2 BPM 就可能从 162 拍跳到 174 拍（2026-10-06 实测）⇒ 把"几组解差多少"如实报出来。 */
  if (ensembleInfo.runs > 1) {
    const spread = ensembleInfo.spreadBpm[1] - ensembleInfo.spreadBpm[0];
    if (spread > Math.max(2, 0.04 * med)) {
      warnings.push(`集成跟踪的 ${ensembleInfo.runs} 组解分歧较大（${ensembleInfo.spreadBpm[0]}–${ensembleInfo.spreadBpm[1]} BPM）⇒ **这份素材的拍点本身不稳**（稀疏 onset？例如只有吉他+人声），包络只能当参考；给 \`bpmHint\`、换更清晰的素材、或听点击轨逐段核对`);
    } else {
      warnings.push(`集成跟踪：${ensembleInfo.runs} 组解一致（分歧 ${spread.toFixed(1)} BPM，选中 ${ensembleInfo.chosen}，吸附率 ${(ensembleInfo.snapRate * 100).toFixed(0)}%）`);
    }
  }

  // ⑦ 产物（默认落盘：默认与输入同目录）
  const artifacts: MeasureTempoResult["artifacts"] = {};
  const base = path.basename(abs, path.extname(abs));
  const result: MeasureTempoResult = {
    ok: true,
    input: abs,
    durationSec,
    sampleRate: sr,
    bpm: Math.round(med * 10) / 10,
    bpmHintUsed: hint,
    tightness,
    confidence: Math.round((trackConf || detConf) * 1000) / 1000,
    beatCount: beats.length,
    snappedBeats: snapped,
    unsnappedBeats: unsnapped,
    firstBeatSec: Math.round(beats[0] * 1000) / 1000,
    beatsPerBar,
    coverage: Math.round(cover * 1000) / 1000,
    stats: {
      min: Math.round(sMin * 10) / 10,
      max: Math.round(sMax * 10) / 10,
      median: Math.round(med * 10) / 10,
      range: Math.round((sMax - sMin) * 10) / 10,
      driftBpmPerMin: Math.round(drift * 100) / 100,
      jitterMs,
    },
    envelope,
    segments,
    candidates: cands.slice(0, 8).map((c) => ({ bpm: Math.round(c.bpm * 10) / 10, confidence: Math.round(c.confidence * 1000) / 1000 })),
    ensemble: ensembleInfo,
    warnings,
    artifacts,
  };
  if (opts.writeArtifacts !== false) {
    try {
      const dir = opts.outDir ? path.resolve(opts.outDir) : path.dirname(abs);
      // ⚠️ 指定的 outDir 可能还不存在（真机核对时就踩到：ENOENT，产物静默拿不到）⇒ 先建目录
      mkdirSync(dir, { recursive: true });
      const csvPath = path.join(dir, `${base}.tempo-envelope.csv`);
      const midiPath = path.join(dir, `${base}.tempo-map.mid`);
      const clickPath = path.join(dir, `${base}.click.wav`);
      const jsonPath = path.join(dir, `${base}.tempo-envelope.json`);
      writeFileSync(csvPath, envelopeToCsv(result.envelope, result.segments), "utf8");
      writeFileSync(midiPath, envelopeToMidi(result.segments, { bpmFallback: result.bpm }));
      writeFileSync(clickPath, renderClickWav(result.envelope, { sampleRate: sr, beatsPerBar }));
      writeFileSync(jsonPath, JSON.stringify({ bpm: result.bpm, stats: result.stats, segments: result.segments, warnings }, null, 2) + "\n", "utf8");
      artifacts.csv = csvPath; artifacts.midi = midiPath; artifacts.click = clickPath; artifacts.json = jsonPath;
    } catch (e) {
      warnings.push("产物没落盘：" + (e instanceof Error ? e.message : String(e)));
    }
  }
  return result;
}

/* ───────────────────────── 产物 ───────────────────────── */

/** 包络 + 段 → CSV（`#` 开头是注释，Excel 能直接开）。 */
export function envelopeToCsv(env: TempoEnvelopePoint[], segments: TempoSegment[]): string {
  const out: string[] = [];
  out.push("# AKDAgent BPM 包络（时间 → 速度）。bpm_envelope = 中值平滑后的包络值（推荐用这个）；bpm_raw = 与上一拍间隔直接换算的原始值");
  out.push("# 段（每段一个 tempo mark，可直接喂 DAW / sv_apply_tempo）");
  out.push("seg_bar,seg_start_sec,seg_bpm,seg_beats");
  for (const s of segments) out.push(`${s.bar},${s.startSec},${s.bpm},${s.beats}`);
  out.push("");
  out.push("# 逐拍包络");
  out.push("bar,beat_in_bar,time_sec,bpm_envelope,bpm_raw");
  for (const p of env) out.push(`${p.bar},${p.beatInBar},${p.timeSec},${p.bpm},${p.raw}`);
  return out.join("\n") + "\n";
}

/**
 * 段 → **MIDI tempo 轨**（format 1 / 单轨 / 480 PPQ）。
 * 用途：把测出的浮动速度**拖进任何 DAW** 当参考（完全不经过 SV/ACE）。
 * ⚠️ 时间→tick 必须**按当前 tempo 累积**（tempo 一变，秒与 tick 就不是线性关系了）。
 */
export function envelopeToMidi(segments: TempoSegment[], opts: { bpmFallback?: number; ppq?: number } = {}): Buffer {
  const ppq = opts.ppq ?? 480;
  // ⚠️ `midi-file` 的**写**形状是 `{ deltaTime, meta:true, type:"setTempo", microsecondsPerBeat }`
  //    （`{ setTempo: {...} }` 那是**读**回来的形状 —— 2026-10-06 单测报 "Unrecognized event type: undefined" 就是这个）。
  type Ev = { deltaTime: number; meta?: boolean; type?: string; microsecondsPerBeat?: number; text?: string };
  const events: Ev[] = [];
  let absTick = 0, prevAbsTick = 0, prevSec = segments.length ? segments[0].startSec : 0;
  let prevBpm = segments.length ? segments[0].bpm : (opts.bpmFallback ?? 120);
  for (const s of segments) {
    absTick += Math.max(0, Math.round(((s.startSec - prevSec) * ppq * prevBpm) / 60));
    events.push({ deltaTime: absTick - prevAbsTick, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60000000 / Math.max(1, s.bpm)) });
    prevAbsTick = absTick;
    prevSec = s.startSec;
    prevBpm = s.bpm;
  }
  if (!events.length) {
    events.push({ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60000000 / (opts.bpmFallback ?? 120)) });
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const midi = writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: ppq }, tracks: [events as never] });
  return Buffer.from(midi);
}

/**
 * 包络 → **点击轨 WAV**：每拍一个短促 click，小节首拍加重音。
 * 为什么值得落盘：**听一遍就知道测准没测准** —— 老路子只能"写进 SV2 再听"，这台机器上等于没法自证。
 */
export function renderClickWav(
  env: TempoEnvelopePoint[],
  opts: { sampleRate?: number; beatsPerBar?: number; lengthSec?: number; clickMs?: number; gain?: number } = {},
): Buffer {
  const sr = opts.sampleRate ?? 44100;
  const bpb = opts.beatsPerBar ?? 4;
  const clickMs = opts.clickMs ?? 35;
  const gain = opts.gain ?? 0.7;
  const last = env.length ? env[env.length - 1].timeSec : 0;
  const totalSec = opts.lengthSec ?? Math.max(last + 1, 1);
  const n = Math.max(1, Math.round(totalSec * sr));
  const pcm = new Int16Array(n);
  const clickN = Math.max(8, Math.round((clickMs / 1000) * sr));
  env.forEach((p) => {
    const start = Math.round(p.timeSec * sr);
    const accent = p.beatInBar === 1 ? 1.0 : 0.55;          // 小节首拍更响
    const freq = p.beatInBar === 1 ? 1600 : 1000;            // 且更高
    for (let k = 0; k < clickN && start + k < n; k++) {
      const decay = Math.exp(-6 * (k / clickN));
      const s = Math.sin((2 * Math.PI * freq * k) / sr) * decay * gain * accent;
      const v = Math.max(-1, Math.min(1, pcm[start + k] / 32768 + s));
      pcm[start + k] = Math.round(v * 32767);
    }
  });
  // WAV 头（16-bit 单声道）
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);          // fmt chunk 大小
  buf.writeUInt16LE(1, 20);           // PCM
  buf.writeUInt16LE(1, 22);           // 单声道
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);      // byte rate
  buf.writeUInt16LE(2, 32);           // block align
  buf.writeUInt16LE(16, 34);          // bits
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, dataBytes).copy(buf, 44);
  return buf;
}
