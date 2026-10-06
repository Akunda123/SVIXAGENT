/**
 * ACE 音符落位：**把任意音符集合压成"严格不重叠"的单线，并与目标轨现有内容对账**。
 *
 * 为什么单独成模块：ACE 的铁律（用户 2026-10-05 给定）——
 *   · **clip 不重叠，note 也不重叠**；ACE 比 SV 严格：SV 允许放置重叠只是**不发声**，
 *     而 **ACE 重叠会把原来那个音符顶掉**（破坏性 ⇒ 这条链上唯一的破坏性操作）。
 *   ⇒ 全部压平/对账逻辑必须是**纯函数**：可单测、可在没装 ACE 的机器上验证
 *     （`server/tests/ace-fit-notes.mjs`）。I/O（读 `clip list`/`note list`、写 `note add`）留在调用方。
 *
 * 时间一律用**秒**（ACE CLI 侧的口径由调用方换算）；区间按**半开** `[start, start+dur)` 判重叠
 * ⇒ 首尾相接（`a.end === b.start`）**不算**重叠。
 */

/** 一个带区间的音符（时间单位：秒）。 */
export interface FitNote {
  start: number;
  dur: number;
  pitch: number;
  lyric?: string;
  /** 来源标记（回报里要能指回原谱：第几小节第几音） */
  tag?: string;
}

/** 只要区间的东西（clip / 待写范围）—— 与 FitNote 同口径，便于共用判据。 */
export interface Span {
  start: number;
  dur: number;
}

export const noteEnd = (n: Span): number => n.start + n.dur;

/** 两个区间是否**真的**交叠（半开区间：首尾相接不算）。ACE 的"不重叠"按此判。 */
export function overlaps(a: Span, b: Span): boolean {
  return a.start < noteEnd(b) && b.start < noteEnd(a);
}

/** 同 onset 判断（浮点容差，默认 1 ms）。 */
export const sameOnset = (a: Span, b: Span, tol = 0.001): boolean => Math.abs(a.start - b.start) <= tol;

export interface FlattenOptions {
  /** 同 onset 多音（和弦）留哪个：默认 `highest`（旋律线通常在最上） */
  keep?: 'highest' | 'lowest';
  /** 跨音交叠时把**前一个音**裁到后音起点前这么多秒（默认 0.01；`0` = 允许首尾相接） */
  minGapSec?: number;
  /** 太短的音直接丢（默认 0.03 s） */
  minDurSec?: number;
  /** 最多拆几条线（和弦/复调）；默认 `Infinity` */
  maxLines?: number;
}

export interface FlattenReport {
  /** 拆出来的若干条单线（**每条内部严格不重叠**） */
  lines: FitNote[][];
  /** 被丢掉的音（和弦里没留的、太短的、超出 maxLines 的） */
  dropped: FitNote[];
  /** 被裁短的音 */
  trimmed: { note: FitNote; oldDur: number; newDur: number }[];
  /** 原集合里检测到的交叠对数（≥1 就说明原谱有和弦/复调 ⇒ 回报里要点出来） */
  overlapPairs: number;
}

/**
 * 把音符集合压成**若干条严格不重叠的单线**（区间着色，贪心）。
 *   ① 按 onset 升序（同时长音优先占位）；
 *   ② 同 onset 的多音 = 和弦 ⇒ 只留 `keep` 那一个（其余进 `dropped`）；
 *   ③ 逐个安放：找第一条能放下的线（该线末音 `end ≤ 本音 start`）；放不下就新开线（超过 maxLines ⇒ 丢）；
 *   ④ 防御：若仍与线上末音交叠（跨音/长音）⇒ 先裁短末音，裁不动就换线。
 */
export function flattenToMonophonic(notes: readonly FitNote[], opts: FlattenOptions = {}): FlattenReport {
  const keep = opts.keep ?? 'highest';
  const minGap = opts.minGapSec ?? 0.01;
  const minDur = opts.minDurSec ?? 0.03;
  const maxLines = opts.maxLines ?? Number.POSITIVE_INFINITY;

  const dropped: FitNote[] = [];
  const trimmed: FlattenReport['trimmed'] = [];
  const clean: FitNote[] = [];
  for (const n of notes) {
    if (!(n.dur > 0) || n.dur < minDur) { dropped.push(n); continue; }
    clean.push({ ...n });
  }

  const sorted = clean.slice().sort((a, b) => a.start - b.start || b.dur - a.dur || a.pitch - b.pitch);
  let overlapPairs = 0;
  const dedup: FitNote[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const group = [cur];
    while (i + 1 < sorted.length && sameOnset(sorted[i + 1], cur)) group.push(sorted[++i]);
    if (group.length > 1) {
      overlapPairs += group.length - 1;
      group.sort((a, b) => (keep === 'highest' ? b.pitch - a.pitch : a.pitch - b.pitch));
      dedup.push(group[0]);
      for (const g of group.slice(1)) dropped.push(g);
    } else dedup.push(cur);
  }

  const lines: FitNote[][] = [];
  for (const n of dedup) {
    let placed = false;
    for (const line of lines) {
      const last = line[line.length - 1];
      const lastEnd = noteEnd(last);
      if (lastEnd <= n.start) { line.push(n); placed = true; break; }
      /* 放不下：**默认宁可新开一条线**（ACE 铁律是"绝不破坏"——裁短是破坏），
       * 只有当**不能再开新线**（已到 maxLines）时才退而裁短末音留缝。 */
      if (lines.length >= maxLines) {
        const newDur = n.start - last.start - minGap;
        if (newDur >= minDur) {
          trimmed.push({ note: last, oldDur: last.dur, newDur });
          last.dur = newDur;
          line.push(n); placed = true; break;
        }
      }
    }
    if (!placed) {
      if (lines.length < maxLines) lines.push([n]);
      else { dropped.push(n); overlapPairs++; }
    }
  }

  return { lines: lines.filter((l) => l.length), dropped, trimmed, overlapPairs };
}

export interface Conflict {
  /** 我们的音（`conflictsWithClips` 里 pitch = -1，代表"待写区间"） */
  mine: FitNote;
  /** 冲突对象 */
  theirs: { kind: 'note' | 'clip'; label: string; start: number; end: number };
}

/** 与目标轨**现有音符**对账：逐条列出会顶掉谁（**只报不改**）。 */
export function conflictsWithNotes(
  mine: readonly FitNote[],
  theirs: readonly (FitNote & { label?: string })[],
): Conflict[] {
  const out: Conflict[] = [];
  for (const m of mine) {
    for (const t of theirs) {
      if (overlaps(m, t)) {
        out.push({
          mine: m,
          theirs: { kind: 'note', label: t.label || t.tag || `pitch ${t.pitch}`, start: t.start, end: noteEnd(t) },
        });
      }
    }
  }
  return out;
}

/** 与目标轨**现有 clip** 对账：clip 之间也不许压。 */
export function conflictsWithClips(
  planned: Span,
  clips: readonly { label: string; start: number; dur: number }[],
): Conflict[] {
  const out: Conflict[] = [];
  const mine: FitNote = { start: planned.start, dur: planned.dur, pitch: -1, tag: '(待写区间)' };
  for (const c of clips) {
    if (overlaps(planned, c)) {
      out.push({ mine, theirs: { kind: 'clip', label: c.label, start: c.start, end: noteEnd(c) } });
    }
  }
  return out;
}

/** 一组音符的总跨度（预览里报"要占哪段时间"）。 */
export function spanOf(notes: readonly FitNote[]): Span {
  if (!notes.length) return { start: 0, dur: 0 };
  const start = Math.min(...notes.map((n) => n.start));
  const stop = Math.max(...notes.map((n) => noteEnd(n)));
  return { start, dur: stop - start };
}

/** 候选落点：在目标轨上找一个**不与现有 clip 交叠**的空档，够放下 `need` 秒。 */
export function findFreeSlot(
  need: number,
  clips: readonly { start: number; dur: number }[],
  preferStart = 0,
): number {
  const busy = clips
    .filter((c) => c.dur > 0)
    .map((c) => ({ start: c.start, end: noteEnd(c) }))
    .sort((a, b) => a.start - b.start);
  let at = Math.max(0, preferStart);
  for (const b of busy) {
    if (at + need <= b.start) return at;   // 现有 clip 之前就能放下
    if (at < b.end) at = b.end;            // 被压住 ⇒ 挪到它后面
  }
  return at;
}
