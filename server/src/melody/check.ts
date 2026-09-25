// 旋律判据校验器（Step C）：把 skills/composition/references/主旋律生成.md 里"给人看的清单"
// 变成机器可跑的判据 —— 生成 → 校验 → 修 → 再校验 的回路靠它闭上。
// 纯函数、不碰宿主、不联网；既能校验 sv_generate_melody 的产物，也能校验工程里已有的旋律。
//
// 覆盖：三证据（全五声 / 句法 / 跨八度）· 方向性（上行要回走）· 单一高点与 2/3 位置 ·
//       避免音（高小二度 = 硬伤）· 强拍和弦内音比例 · 同音堆叠 · 气口 · 密度曲线 · 终止落音。

import {
  ScaleType, isMinorKey, parseRootPitch, scalePitchClasses,
  majorPentatonicClasses, parseChordName,
  Chord, pitchName, pitchClassName,
} from "./theory.js";

export interface CheckNote {
  pitch: number;        // MIDI
  startBeat: number;    // 起始拍（0 起）
  durBeats: number;     // 时值（拍）
}

export type Severity = "error" | "warn" | "info";

export interface CheckIssue {
  id: string;
  severity: Severity;
  message: string;
  where?: { bar?: number; beat?: number; noteIndex?: number };
  evidence?: Record<string, unknown>;
}

export interface CheckOptions {
  key?: string;                // "C"/"Am"/"F major"；省略则用 Krumhansl 自动推断
  chordProgression?: string[]; // 与生成时同一份（逐小节循环）
  timeSig?: number;            // 每小节拍数（默认 4）
  phraseBars?: number;         // 一句几小节（默认 4）
  bpm?: number;
}

export interface CheckReport {
  ok: boolean;
  noteCount: number;
  bars: number;
  key: { name: string; effectiveName: string; scale: ScaleType; root: number; inferred: boolean; confidence: "high" | "low"; correlation: number };
  range: { lowest: number; lowestName: string; highest: number; highestName: string; span: number };
  metrics: {
    scaleFit: number;          // 调内音比例
    pentatonicFit: number;     // 五声音阶覆盖比例
    chordToneOnStrong: number | null;  // 强拍落在和弦内音的比例（无和弦则 null）
    phraseCount: number;
    phraseSpans: number[];     // 每句音域跨度（半音）
    breathGaps: number[];      // 每句末气口（拍）
    notesPerPhrase: number[];
    maxLeap: number;           // 相邻音最大音程（半音）
    shortestNote: number;      // 最短时值（拍）
    shortRunCount: number;     // 大段短音符段数
  };
  issues: CheckIssue[];
  verdict: { blocking: number; warnings: number; infos: number; text: string; advice: string };
}

// ---------------------------------------------------------------- Krumhansl 调性推断

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

function inferKey(notes: CheckNote[]): { pc: number; minor: boolean; corr: number } {
  const hist = new Array(12).fill(0);
  for (const nt of notes) hist[((nt.pitch % 12) + 12) % 12] += Math.max(0.25, nt.durBeats);
  let best = { pc: 0, minor: false, corr: -2 };
  for (let r = 0; r < 12; r++) {
    for (const [prof, minor] of [[KK_MAJOR, false], [KK_MINOR, true]] as [number[], boolean][]) {
      const w = new Array(12).fill(0);
      for (let pc = 0; pc < 12; pc++) w[pc] = prof[(((pc - r) % 12) + 12) % 12];
      const c = pearson(hist, w);
      if (c > best.corr) best = { pc: r, minor, corr: Number(c.toFixed(4)) };
    }
  }
  return best;
}

// ---------------------------------------------------------------- 小工具

const sortNotes = (notes: CheckNote[]) =>
  notes.slice().sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);

const barOf = (beat: number, timeSig: number) => Math.floor(beat / timeSig);
const beatInBar = (beat: number, timeSig: number) => beat - barOf(beat, timeSig) * timeSig;
const pcOf = (pitch: number) => ((pitch % 12) + 12) % 12;

function chordTonesNear(chord: Chord, pitch: number): number[] {
  const out: number[] = [];
  for (let oct = -2; oct <= 2; oct++) for (const t of chord.tones) out.push(t + oct * 12);
  return out;
}

/** 音程名（只看六度以上，用于"大跳"判据的可读描述） */
function intervalName(semis: number): string {
  const table: Record<number, string> = {
    9: "大六度", 10: "小七度", 11: "大七度", 12: "八度",
    13: "小九度", 14: "大九度", 15: "小十度", 16: "大十度",
  };
  return table[semis] || `${semis} 半音`;
}

// ---------------------------------------------------------------- 主校验

export function checkMelody(rawNotes: CheckNote[], opts: CheckOptions = {}): CheckReport {
  const timeSig = opts.timeSig && opts.timeSig > 0 ? opts.timeSig : 4;
  const phraseBars = opts.phraseBars && opts.phraseBars > 0 ? opts.phraseBars : 4;
  const notes = sortNotes(rawNotes || []);
  const issues: CheckIssue[] = [];

  // ---- 调性（给定优先，否则推断）
  let keyName = opts.key || "";
  let inferred = false;
  let confidence: "high" | "low" = "high";
  let correlation = 1;
  if (!keyName) {
    inferred = true;
    const k = inferKey(notes);
    keyName = pitchClassName(k.pc) + (k.minor ? "m" : "");
    correlation = k.corr;
    confidence = k.corr >= 0.75 ? "high" : "low";
  }
  const root = ((parseRootPitch(keyName) % 12) + 12) % 12;
  // 大小调判定：key 写明就照办（"Am" ⇒ 小调 / "F major" ⇒ 大调）；
  // 只给了主音（"C"）时，按音符实测取更贴合的那个调式 —— 因为生成侧此时是由 mood 决定调式的。
  const explicitMinor = isMinorKey(keyName);
  const explicitMajor = /\bmajor\b/i.test(keyName);
  let scaleType: ScaleType = explicitMinor ? "minor" : "major";
  let modeAssumed = false;
  if (!inferred && !explicitMinor && !explicitMajor && notes.length) {
    const majPcs = scalePitchClasses(root, "major"), minPcs = scalePitchClasses(root, "minor");
    const fitMaj = notes.filter((n) => majPcs.includes(pcOf(n.pitch))).length;
    const fitMin = notes.filter((n) => minPcs.includes(pcOf(n.pitch))).length;
    if (fitMin > fitMaj) { scaleType = "minor"; modeAssumed = true; }
  }
  const scalePcs = scalePitchClasses(root, scaleType);
  const pentaPcs = scaleType === "minor"
    ? scalePitchClasses(root, "pentatonicMinor")
    : majorPentatonicClasses(root);
  if (modeAssumed) {
    issues.push({
      id: "mode-assumed", severity: "info",
      message: `key 只给了主音 ${pitchClassName(root)}，按实测取小调计算调内音（大调只有 ${notes.filter((n) => scalePitchClasses(root, "major").includes(pcOf(n.pitch))).length} 个音在调内）`,
      evidence: { keyName, effectiveMode: scaleType },
    });
  }
  if (inferred && confidence === "low") {
    issues.push({
      id: "key-uncertain", severity: "info",
      message: `调性不明确（推断 ${keyName}，相关系数 ${correlation}），调内音判据仅供参考；建议显式传入 key`,
      evidence: { inferredKey: keyName, correlation },
    });
  }

  if (notes.length === 0) {
    return {
      ok: false, noteCount: 0, bars: 0,
      key: { name: keyName, effectiveName: pitchClassName(root) + (scaleType === 'minor' ? 'm' : ''), scale: scaleType, root, inferred, confidence, correlation },
      range: { lowest: 0, lowestName: "", highest: 0, highestName: "", span: 0 },
      metrics: { scaleFit: 0, pentatonicFit: 0, chordToneOnStrong: null, phraseCount: 0, phraseSpans: [], breathGaps: [], notesPerPhrase: [], maxLeap: 0, shortestNote: 0, shortRunCount: 0 },
      issues: [{ id: "empty", severity: "error", message: "没有音符可校验" }],
      verdict: { blocking: 1, warnings: 0, infos: 0, text: "1 处硬伤 · 0 处警告 · 0 条提示", advice: "先给音符（工程当前组或 notes 参数）" },
    };
  }

  const pitches = notes.map((n) => n.pitch);
  const lowest = Math.min(...pitches), highest = Math.max(...pitches);
  const bars = Math.max(1, Math.ceil((notes[notes.length - 1].startBeat + notes[notes.length - 1].durBeats) / timeSig));
  const phraseCount = Math.ceil(bars / phraseBars);
  const chords: Chord[] = (opts.chordProgression && opts.chordProgression.length ? opts.chordProgression : []).map(parseChordName);
  const chordOfBar = (bar: number) => (chords.length ? chords[bar % chords.length] : null);

  // ---- ① 调内音比例 / 全五声
  const inScale = notes.filter((n) => scalePcs.includes(pcOf(n.pitch))).length;
  const scaleFit = Number((inScale / notes.length).toFixed(3));
  const inPenta = notes.filter((n) => pentaPcs.includes(pcOf(n.pitch))).length;
  const pentatonicFit = Number((inPenta / notes.length).toFixed(3));
  if (scaleFit < 0.85) {
    issues.push({
      id: "scale-fit", severity: "warn",
      message: `调内音比例只有 ${(scaleFit * 100).toFixed(0)}%（${keyName}），有 ${notes.length - inScale} 个音在调外`,
      evidence: { scaleFit, key: keyName },
    });
  }
  if (pentatonicFit >= 0.999 && notes.length >= 8) {
    issues.push({
      id: "pentatonic-only", severity: "info",
      message: "全部落在五声音阶：古风/国风可用，现代流行会显得平（可在关键处引入 4/7 音）",
      evidence: { pentatonicFit },
    });
  }

  // ---- ② 音域 / 跨八度
  if (highest - lowest > 19) {
    issues.push({
      id: "range-wide", severity: "info",
      message: `全曲音域 ${highest - lowest} 个半音（${pitchName(lowest)}–${pitchName(highest)}），人声可能吃力`,
      evidence: { span: highest - lowest },
    });
  }

  // ---- ③ 句法（每句音域跨度 / 气口 / 密度）
  const phraseSpans: number[] = [], breathGaps: number[] = [], notesPerPhrase: number[] = [];
  const phraseOfBar = (bar: number) => Math.floor(bar / phraseBars);
  for (let p = 0; p < phraseCount; p++) {
    const from = p * phraseBars, to = (p + 1) * phraseBars;
    const inPhrase = notes.filter((n) => {
      const b = barOf(n.startBeat, timeSig);
      return b >= from && b < to;
    });
    notesPerPhrase.push(inPhrase.length);
    if (inPhrase.length === 0) continue;
    const ps = inPhrase.map((n) => n.pitch);
    const span = Math.max(...ps) - Math.min(...ps);
    phraseSpans.push(span);
    if (span > 12) {
      issues.push({
        id: "octave-leap", severity: "warn",
        where: { bar: from + 1 },
        message: `第 ${p + 1} 句音域跨了 ${span} 个半音（超过八度）：一句跨八度唱不动、也留不下气口`,
        evidence: { phrase: p + 1, span },
      });
    }
    const last = inPhrase[inPhrase.length - 1];
    const phraseEnd = to * timeSig;
    const gap = Number((phraseEnd - (last.startBeat + last.durBeats)).toFixed(3));
    breathGaps.push(gap);
    if (gap < 0.5) {
      issues.push({
        id: "breath", severity: "warn",
        where: { bar: to },
        message: `第 ${p + 1} 句句末没有气口（只剩 ${gap} 拍）：人声喘不上气，句读也听不出来`,
        evidence: { phrase: p + 1, gap },
      });
    }

    // 方向性：连续上行 ≥3 且到句尾仍在高点附近 ⇒ 上行后没回走
    let run = 0, maxRun = 0;
    for (let i = 1; i < inPhrase.length; i++) {
      if (inPhrase[i].pitch > inPhrase[i - 1].pitch) { run++; maxRun = Math.max(maxRun, run); }
      else run = 0;
    }
    if (maxRun >= 3 && Math.max(...ps) - last.pitch < 2) {
      issues.push({
        id: "no-return", severity: "info",
        where: { bar: from + 1 },
        message: `第 ${p + 1} 句连续上行 ${maxRun} 个音后没有回走：旋律是弧线不是直线（上行后要有回收）`,
        evidence: { phrase: p + 1, maxRun },
      });
    }
  }

  // ---- ④ 高点：唯一性 + 位置（~2/3）
  const peakNotes = notes.filter((n) => n.pitch === highest);
  const peakBars = [...new Set(peakNotes.map((n) => barOf(n.startBeat, timeSig)))];
  if (peakBars.length > 1) {
    issues.push({
      id: "highpoint-not-unique", severity: "warn",
      message: `最高音 ${pitchName(highest)} 出现在 ${peakBars.length} 个不同小节（第 ${peakBars.map((b) => b + 1).join("、")} 小节）：高点只该放一次`,
      evidence: { highest, bars: peakBars.map((b) => b + 1) },
    });
  }
  const peakPos = Number(((peakBars[0] * timeSig + beatInBar(peakNotes[0].startBeat, timeSig)) / (bars * timeSig)).toFixed(3));
  if (peakPos < 0.45 || peakPos > 0.92) {
    issues.push({
      id: "highpoint-position", severity: "info",
      message: `高点落在全曲 ${(peakPos * 100).toFixed(0)}% 处：黄金分割（约 2/3）附近最顺耳`,
      evidence: { peakPos },
    });
  }

  // ---- ⑤ 和弦相关：避免音（硬伤）+ 强拍和弦内音比例
  let chordToneOnStrong: number | null = null;
  if (chords.length) {
    const avoidHits: { bar: number; beat: number; pitch: number; chordTone: number }[] = [];
    let strong = 0, strongChordTone = 0;
    for (const n of notes) {
      const bar = barOf(n.startBeat, timeSig);
      const chord = chordOfBar(bar)!;
      const cts = chord.tones.map((t) => pcOf(t));
      const isChordTone = cts.includes(pcOf(n.pitch));
      const isStrong = Math.floor(beatInBar(n.startBeat, timeSig)) % 2 === 0;
      if (isStrong) {
        strong++;
        if (isChordTone) strongChordTone++;
      }
      if (isChordTone) continue;   // 和弦音本身不算避免音
      for (const ct of chordTonesNear(chord, n.pitch)) {
        if (n.pitch - ct === 1) {
          avoidHits.push({ bar: bar + 1, beat: Number(beatInBar(n.startBeat, timeSig).toFixed(2)), pitch: n.pitch, chordTone: ct });
          break;
        }
      }
    }
    chordToneOnStrong = strong ? Number((strongChordTone / strong).toFixed(3)) : null;
    if (avoidHits.length) {
      issues.push({
        id: "avoid-note", severity: "error",
        where: { bar: avoidHits[0].bar, beat: avoidHits[0].beat },
        message: `避免音（硬伤）${avoidHits.length} 处：旋律音比和弦内音高小二度，最刺耳。首处 第 ${avoidHits[0].bar} 小节第 ${avoidHits[0].beat} 拍 ${pitchName(avoidHits[0].pitch)} vs 和弦音 ${pitchName(avoidHits[0].chordTone)}。⚠️ 和弦取自传入的 chordProgression —— 若是 sv_analyze_chord 扒出来的，仅供参考、慎用（扒和弦不一定准）；用户自己定的和弦才按硬伤处理`,
        evidence: { hits: avoidHits.slice(0, 12), total: avoidHits.length },
      });
    }
    if (chordToneOnStrong !== null && chordToneOnStrong < 0.6) {
      issues.push({
        id: "chord-weak", severity: "warn",
        message: `强拍只有 ${(chordToneOnStrong * 100).toFixed(0)}% 落在和弦内音上：强拍该踩和弦音，色彩音留给弱拍`,
        evidence: { chordToneOnStrong },
      });
    }
    if (chordToneOnStrong !== null && chordToneOnStrong >= 0.95 && notes.length >= 8) {
      issues.push({
        id: "too-chordy", severity: "info",
        message: "几乎全是和弦内音（通篇 do-mi-so）：没有经过音/挂留音，听感偏儿歌",
        evidence: { chordToneOnStrong },
      });
    }
  }

  // ---- ⑥ 重叠（违规：旋律是单声部，音与音不许叠 —— 与桥侧 LAYOUT 口径一致）
  const overlaps: { bar: number; beat: number; amount: number }[] = [];
  for (let i = 1; i < notes.length; i++) {
    const prevEnd = notes[i - 1].startBeat + notes[i - 1].durBeats;
    if (prevEnd > notes[i].startBeat + 0.01) {
      overlaps.push({
        bar: barOf(notes[i].startBeat, timeSig) + 1,
        beat: Number(beatInBar(notes[i].startBeat, timeSig).toFixed(2)),
        amount: Number((prevEnd - notes[i].startBeat).toFixed(3)),
      });
    }
  }
  if (overlaps.length) {
    issues.push({
      id: "overlap", severity: "error",
      where: { bar: overlaps[0].bar, beat: overlaps[0].beat },
      message: `音符重叠 ${overlaps.length} 处（单声部旋律不许叠）：首处 第 ${overlaps[0].bar} 小节第 ${overlaps[0].beat} 拍，前一个音多出 ${overlaps[0].amount} 拍 —— 把前一个音的时值收到下一个音的起点`,
      evidence: { hits: overlaps.slice(0, 12), total: overlaps.length },
    });
  }

  // ---- ⑦ 单一音重复（用户 2026-09-19 点名的三条主要检查之一）
  //   (a) 连续同音 ≥3 次；(b) 某一个音占了整段的 ≥1/3（单音打转 = 旋律没走）
  const repeats: { bar: number; pitch: number; run: number }[] = [];
  let run = 1;
  for (let i = 1; i <= notes.length; i++) {
    if (i < notes.length && notes[i].pitch === notes[i - 1].pitch) { run++; continue; }
    if (run >= 3) repeats.push({ bar: barOf(notes[i - 1].startBeat, timeSig) + 1, pitch: notes[i - 1].pitch, run });
    run = 1;
  }
  if (repeats.length) {
    issues.push({
      id: "repeat", severity: "warn",
      where: { bar: repeats[0].bar },
      message: `同音连续 ≥3 次共 ${repeats.length} 处（首个：第 ${repeats[0].bar} 小节 ${pitchName(repeats[0].pitch)} ×${repeats[0].run}）：旋律卡在一个音上，改成相邻音级走动、或并成一个长音`,
      evidence: { repeats: repeats.slice(0, 6) },
    });
  }
  const hist = new Map<number, number>();
  for (const n of notes) hist.set(n.pitch, (hist.get(n.pitch) || 0) + 1);
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && notes.length >= 8 && top[1] >= 4 && top[1] / notes.length >= 0.3) {
    issues.push({
      id: "monotone", severity: "warn",
      message: `单音打转：${pitchName(top[0])} 占了 ${top[1]}/${notes.length}（${((top[1] / notes.length) * 100).toFixed(0)}%）—— 旋律要"走起来"，同一个音别当落脚点反复用`,
      evidence: { pitch: top[0], count: top[1], total: notes.length },
    });
  }

  // ---- ⑧ 大跳（六度以上 = ≥9 半音；用户点名的三条主要检查之一）
  const leaps: { bar: number; beat: number; from: number; to: number; semis: number; interval: string; dir: string }[] = [];
  for (let i = 1; i < notes.length; i++) {
    const d = notes[i].pitch - notes[i - 1].pitch;
    if (Math.abs(d) >= 9) {
      leaps.push({
        bar: barOf(notes[i].startBeat, timeSig) + 1,
        beat: Number(beatInBar(notes[i].startBeat, timeSig).toFixed(2)),
        from: notes[i - 1].pitch, to: notes[i].pitch,
        semis: Math.abs(d), interval: intervalName(Math.abs(d)), dir: d > 0 ? "上" : "下",
      });
    }
  }
  if (leaps.length) {
    issues.push({
      id: "leap", severity: "warn",
      where: { bar: leaps[0].bar, beat: leaps[0].beat },
      message: `六度以上大跳 ${leaps.length} 处：首处 第 ${leaps[0].bar} 小节第 ${leaps[0].beat} 拍 ${pitchName(leaps[0].from)} → ${pitchName(leaps[0].to)}（${leaps[0].dir}行 ${leaps[0].semis} 半音 = ${leaps[0].interval}）—— 大跳之后要**反向级进**走回来，或拆成"跳进 + 经过音"两级`,
      evidence: { hits: leaps.slice(0, 10), total: leaps.length, maxLeap: Math.max(...leaps.map((l) => l.semis)) },
    });
  }

  // ---- ⑨ 大段短音符（吐字不清风险；用户 2026-09-19 补充）
  const SHORT_BEATS = 0.5;   // ≤ 八分音符算"短"
  const RUN_MIN = 6;         // 连续 ≥6 个短音 ≈ 1.5 小节塞满字
  const shortRuns: { fromBar: number; toBar: number; count: number; shortest: number }[] = [];
  {
    let run = 0, start = 0, shortest = 99;
    for (let i = 0; i <= notes.length; i++) {
      const isShort = i < notes.length && notes[i].durBeats <= SHORT_BEATS + 1e-6;
      if (isShort) {
        if (run === 0) { start = i; shortest = notes[i].durBeats; } else shortest = Math.min(shortest, notes[i].durBeats);
        run++;
        continue;
      }
      if (run >= RUN_MIN) {
        shortRuns.push({
          fromBar: barOf(notes[start].startBeat, timeSig) + 1,
          toBar: barOf(notes[i - 1].startBeat, timeSig) + 1,
          count: run, shortest,
        });
      }
      run = 0; shortest = 99;
    }
  }
  if (shortRuns.length) {
    issues.push({
      id: "short-run", severity: "warn",
      where: { bar: shortRuns[0].fromBar },
      message: `大段短音符 ${shortRuns.length} 段：首段 第 ${shortRuns[0].fromBar}-${shortRuns[0].toBar} 小节连续 ${shortRuns[0].count} 个 ≤${SHORT_BEATS} 拍的音（最短 ${shortRuns[0].shortest} 拍）—— 字挤在一起会**吐字不清**：留一个长音或气口，把其中几个字拉长`,
      evidence: { runs: shortRuns.slice(0, 8), total: shortRuns.length, thresholdBeats: SHORT_BEATS },
    });
  }

  // ---- ⑩ 密度曲线
  if (phraseCount >= 2) {
    const uniq = [...new Set(notesPerPhrase)];
    if (uniq.length === 1) {
      issues.push({
        id: "flat-density", severity: "info",
        message: `每句音符数都是 ${uniq[0]}：密度没有变化，段落推不起来（进副歌要么更密、要么更空）`,
        evidence: { notesPerPhrase },
      });
    } else if (notesPerPhrase[notesPerPhrase.length - 1] < notesPerPhrase[0]) {
      issues.push({
        id: "density-down", severity: "info",
        message: `最后一句（${notesPerPhrase[notesPerPhrase.length - 1]} 音）比第一句（${notesPerPhrase[0]} 音）还稀：除非刻意收束，否则末段该更满`,
        evidence: { notesPerPhrase },
      });
    }
  }

  // ---- ⑧ 终止落音（完全终止落主音；其余句落属/色彩音）
  for (let p = 0; p < phraseCount; p++) {
    const from = p * phraseBars, to = (p + 1) * phraseBars;
    const inPhrase = notes.filter((n) => { const b = barOf(n.startBeat, timeSig); return b >= from && b < to; });
    if (!inPhrase.length) continue;
    const last = inPhrase[inPhrase.length - 1];
    const pc = pcOf(last.pitch);
    const isFinal = p === phraseCount - 1;
    const okFinal = pc === root;
    const okMid = [root + 7, root + 4, root + 9, root + 11].map((x) => ((x % 12) + 12) % 12).includes(pc);
    if (isFinal && !okFinal) {
      issues.push({
        id: "cadence-final", severity: "info",
        where: { bar: to },
        message: `末句落音是 ${pitchClassName(pc)}，不是主音 ${pitchClassName(root)}：完全终止落主音才收得住`,
        evidence: { lastPitch: last.pitch },
      });
    } else if (!isFinal && !okMid && !okFinal) {
      issues.push({
        id: "cadence-mid", severity: "info",
        where: { bar: to },
        message: `第 ${p + 1} 句落音 ${pitchClassName(pc)} 偏随意：句中句尾落属音/三音/六音更稳（半终止）`,
        evidence: { phrase: p + 1, lastPitch: last.pitch },
      });
    }
  }

  const blocking = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  const infos = issues.filter((i) => i.severity === "info").length;
  // 纪律（用户 2026-09-19）：**校验器只出清单，绝不自动改音符** —— 改不改由用户定
  const advice = issues.length
    ? `建议清单（只列不改，是否修改由你定）：${issues.map((i) => i.id).join("、")}`
    : "全部判据通过（没有要改的）";

  return {
    ok: blocking === 0,
    noteCount: notes.length,
    bars,
    key: { name: keyName, effectiveName: pitchClassName(root) + (scaleType === 'minor' ? 'm' : ''), scale: scaleType, root, inferred, confidence, correlation },
    range: { lowest, lowestName: pitchName(lowest), highest, highestName: pitchName(highest), span: highest - lowest },
    metrics: {
      scaleFit, pentatonicFit, chordToneOnStrong,
      phraseCount, phraseSpans, breathGaps, notesPerPhrase,
      maxLeap: (() => { let m = 0; for (let i = 1; i < notes.length; i++) m = Math.max(m, Math.abs(notes[i].pitch - notes[i - 1].pitch)); return m; })(),
      shortestNote: Math.min(...notes.map((n) => n.durBeats)),
      shortRunCount: shortRuns.length,
    },
    issues: [...issues].sort((a, b) => {
      const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    }),
    verdict: { blocking, warnings, infos, text: `${blocking} 处硬伤 · ${warnings} 处警告 · ${infos} 条提示`, advice },
  };
}
