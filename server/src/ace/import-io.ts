/**
 * ACE 工程读写（薄 I/O 层）：**读**轨/clip/音符 → **算**落位 → **写** `note add`。
 *
 * 实测钉死的形状（2026-10-05，本机 ACE 2.1.x + acestudio-cli 0.17.0）：
 *   · `track list` → `{contentTrackCount, tracks:[{trackIndex,trackName,trackType,trackUuid,soundSourceName,clipCount}]}`
 *   · `clip list --track-index N` → `{clipCount, clips:[{clipUuid,clipName,clipType,clipBegin,clipBeginSec,
 *                                    clipEnd,clipEndSec,nativeUnit,noteCount,enabled}]}`
 *   · `clip note-content --track-index N --clip-index M` → `{fingerprint, noteCount, notes:[{pos,dur,endPos,
 *                                    pitch,lyric,language,syllable,headConsonants,tailConsonants,noteUuid}]}`
 *   · `note add --clip-uuid <UUID> --notes '<JSON>' [--if-match <fp>] [-y] [--wait-busy 5s]`
 *     —— `pos`/`dur` 是 **clip-local ticks**；`--if-match` = 读到的 `fingerprint`（陈旧写守卫）
 *
 * ⚠️ 纪律（见 `docs/识谱接入.md` §3.6 / §3.6b）：
 *   · **SING 轨单音**、结果有重叠 ⇒ 引擎整笔拒（`NOTE_OVERLAP`）；**Instrument / GenericMidi 复调**允许重叠；
 *   · 引擎"**宁可拒、不做解析**"⇒ 我们**绝不替用户裁现有音**，冲突就报出来让用户先自己挪/删；
 *   · 写前必须带 `--if-match`（读到的 fingerprint）——**没有它就是在无守护地覆盖**。
 */
import { runAceCli, type RunResult, type AceRunner } from './index.js';
import { type FitNote } from './fit-notes.js';
import {
  planNotesForClip, ticksPerSecondFromClip, toAcePayload, mxToTicks,
  type AceClipKind, type AceNotePayload, type MxNoteQ, type PlanResult, type TickMath,
} from './musicxml-to-ace.js';

export interface AceTrack {
  trackIndex: number;
  trackName: string;
  trackType: string;
  trackUuid: string;
  soundSourceName?: string;
  clipCount: number;
  region?: string;
}

export interface AceClip {
  clipUuid: string;
  clipName: string;
  clipType: string;
  clipBegin: number;
  clipBeginSec?: number;
  clipEnd: number;
  clipEndSec?: number;
  noteCount: number;
  enabled?: boolean;
  nativeUnit?: string;
}

export interface AceNoteRaw {
  pos: number;
  dur: number;
  endPos?: number;
  pitch: number;
  lyric?: string;
  language?: string;
  noteUuid?: string;
}

/**
 * 读轨列表。ACE 不在线 ⇒ 抛（错误文本原样带出，别吞）。
 * `run` 默认 = `runAceCli`；离线单测注入假运行器时传它（别在别处另造一套读法）。
 */
export function listTracks(run: AceRunner = runAceCli): AceTrack[] {
  const r = run(['track', 'list']);
  if (!r.json || !Array.isArray((r.json as any).tracks)) throw new Error('读不到轨列表：' + (r.stderr || r.stdout || `exit ${r.code}`));
  return (r.json as any).tracks as AceTrack[];
}

/** 读某条轨上的 clip。 */
export function listClips(trackIndex: number, run: AceRunner = runAceCli): AceClip[] {
  const r = run(['clip', 'list', '--track-index', String(trackIndex)]);
  if (!r.json || !Array.isArray((r.json as any).clips)) throw new Error('读不到 clip 列表：' + (r.stderr || r.stdout || `exit ${r.code}`));
  return (r.json as any).clips as AceClip[];
}

/** 读某个 clip 的音符 + **fingerprint**（写的时候必须带回 `--if-match`）。 */
export function readClipNotes(trackIndex: number, clipIndex: number, run: AceRunner = runAceCli): { fingerprint: string; notes: AceNoteRaw[] } {
  const r = run(['clip', 'note-content', '--track-index', String(trackIndex), '--clip-index', String(clipIndex)]);
  const j: any = r.json;
  if (!j || !Array.isArray(j.notes)) throw new Error('读不到音符：' + (r.stderr || r.stdout || `exit ${r.code}`));
  return { fingerprint: String(j.fingerprint || ''), notes: j.notes as AceNoteRaw[] };
}

/**
 * 算 tick 数学（**从真实 clip 反算**，绝不硬编码 1080）：
 * `pos/dur` 是 clip-local ticks ⇒ 还需知道 clip 的**绝对起点 tick**（用于把绝对时间换成 clip-local）。
 */
export function tickMathForClip(clip: AceClip, bpm: number, offsetQ = 0): TickMath {
  const tps = ticksPerSecondFromClip(clip);
  if (!tps) throw new Error('这条 clip 没给 tick/sec 对（clipBegin/clipBeginSec 缺）⇒ 算不出 tick 率，别猜');
  if (!(bpm > 0)) throw new Error('需要 BPM 才能把音乐时间换成 tick（从工程/用户读，别默认 120）');
  return { bpm, ticksPerSecond: tps, clipStartTick: clip.clipBegin, offsetQ };
}

/** 把 `note-content` 的原始音符（clip-local）换成**绝对 tick** 的 FitNote（用于与我们的音对账）。 */
export function rawNotesToAbsolute(raw: readonly AceNoteRaw[], math: TickMath): FitNote[] {
  return raw.map((n) => ({
    start: n.pos + math.clipStartTick,
    dur: n.dur,
    pitch: n.pitch,
    lyric: n.lyric,
    tag: `ACE ${n.noteUuid ? n.noteUuid.slice(1, 9) : 'note'} p${n.pitch}`,
  }));
}

/**
 * 解析"要动哪个 clip"（**别让每个工具各写一套**）：
 * 给了 `clipUuid` 就按 uuid 在（指定轨或全轨）里找；否则 `trackIndex`（默认 0）+ `clipIndex`（默认 0）。
 */
export interface ResolvedClip {
  track: AceTrack;
  clip: AceClip;
  clipIndex: number;
  /** `clip note-content` 的指纹（`--if-match` 用）；`withNotes:false` 或读不到时为 undefined */
  fingerprint?: string;
  notes?: AceNoteRaw[];
  /** 从 `clipBegin`/`clipBeginSec` 反算的 tick 率（拿不到 = null；**绝不硬编码 1080**） */
  ticksPerSecond: number | null;
}

export function resolveClip(
  run: AceRunner,
  opts: { trackIndex?: number; clipIndex?: number; clipUuid?: string; withNotes?: boolean },
): ResolvedClip {
  const tracks = listTracks(run);
  if (!tracks.length) throw new Error('工程里没有轨（先在 ACE 里建一条轨）');
  const candidates = opts.trackIndex === undefined ? tracks : tracks.filter((t) => t.trackIndex === opts.trackIndex);
  if (!candidates.length) throw new Error(`没有 trackIndex=${opts.trackIndex} 这条轨`);
  let found: { track: AceTrack; clip: AceClip; clipIndex: number } | null = null;
  for (const track of candidates) {
    const clips = listClips(track.trackIndex, run);
    if (!clips.length) continue;
    if (opts.clipUuid) {
      const i = clips.findIndex((c) => c.clipUuid === opts.clipUuid || c.clipUuid === `{${opts.clipUuid}}`);
      if (i >= 0) { found = { track, clip: clips[i]!, clipIndex: i }; break; }
      if (opts.trackIndex !== undefined) {
        throw new Error(`轨「${track.trackName}」上没有 clipUuid=${opts.clipUuid}（这条轨有 ${clips.length} 个 clip）`);
      }
      continue;
    }
    const i = opts.clipIndex ?? 0;
    const clip = clips[i];
    if (!clip) throw new Error(`轨「${track.trackName}」上只有 ${clips.length} 个 clip，没有第 ${i} 个`);
    found = { track, clip, clipIndex: i };
    break;
  }
  if (!found) throw new Error(opts.clipUuid ? `整个工程里都没有 clipUuid=${opts.clipUuid}` : '工程里没有 clip（ACE 里音符必须挂在 clip 上）');

  let tps: number | null = null;
  try { tps = ticksPerSecondFromClip(found.clip as never); } catch { tps = null; }
  const out: ResolvedClip = { ...found, ticksPerSecond: tps };
  if (opts.withNotes !== false) {
    const { fingerprint, notes } = readClipNotes(found.track.trackIndex, found.clipIndex, run);
    out.fingerprint = fingerprint;
    out.notes = notes;
  }
  return out;
}

export interface ImportPreview extends PlanResult {
  track: AceTrack;
  clip: AceClip;
  math: TickMath;
  /** 现有音符数（供回报"这个 clip 现在有多少音"） */
  existingCount: number;
  /** 要写进哪条 clip（uuid）+ 陈旧写守卫 token */
  clipUuid: string;
  ifMatch: string;
}

/**
 * **只读**预览：读轨/clip/现有音符 → 换算 → 出落位计划（**一个字都不写**）。
 *
 * ⚠️ `qNotes` 给的是 **四分音符为单位**（MusicXML 口径）——**换算在内部做**，因为 tick 率要靠
 * 先读到的 clip 反算（先有 clip 才有 tick 率，顺序不能颠倒）。调用方**别**自己先换成 tick。
 */
export function previewImport(opts: {
  qNotes: readonly MxNoteQ[];
  bpm: number;
  trackIndex?: number;
  clipIndex?: number;
  offsetQ?: number;
}, run: AceRunner = runAceCli): ImportPreview {
  const tracks = listTracks(run);
  if (!tracks.length) throw new Error('工程里没有轨（先在 ACE 里建一条音轨）');
  const track = opts.trackIndex === undefined ? tracks[0] : tracks.find((t) => t.trackIndex === opts.trackIndex);
  if (!track) throw new Error(`没有 trackIndex=${opts.trackIndex} 这条轨`);
  const clips = listClips(track.trackIndex, run);
  if (!clips.length) throw new Error(`轨「${track.trackName}」上没有 clip（ACE 里音符必须挂在 clip 上）`);
  const clipIndex = opts.clipIndex ?? 0;
  const clip = clips[clipIndex];
  if (!clip) throw new Error(`这条轨上只有 ${clips.length} 个 clip，没有第 ${clipIndex} 个`);

  const math = tickMathForClip(clip, opts.bpm, opts.offsetQ || 0);
  const { fingerprint, notes: raw } = readClipNotes(track.trackIndex, clipIndex, run);
  const existing = rawNotesToAbsolute(raw, math);
  const notes = mxToTicks(opts.qNotes, math);            // 拍 → 绝对 tick（clip-local 留给写入时换算）
  const planned = planNotesForClip({
    notes, math, clipKind: clip.clipType as AceClipKind, existing,
  });
  return { ...planned, track, clip, math, existingCount: existing.length, clipUuid: clip.clipUuid, ifMatch: fingerprint };
}

/**
 * **真写**：`note add`。调用方必须已经拿到用户的确认（或明确授权），并且**必须先 previewImport**。
 * @param ifMatch 来自 `previewImport().ifMatch`；**不给就是无守护覆盖**（函数仍允许，但会在返回里提醒）
 */
export function writeNotes(opts: {
  clipUuid: string;
  payload: readonly AceNotePayload[];
  ifMatch?: string;
  yes?: boolean;
  waitBusy?: string;
}): RunResult & { guarded: boolean } {
  if (!opts.payload.length) throw new Error('payload 为空 —— 不写（避免空写触发 ACE 的 UI 反应）');
  const args = ['note', 'add', '--clip-uuid', opts.clipUuid, '--notes', JSON.stringify(opts.payload)];
  if (opts.ifMatch) args.push('--if-match', opts.ifMatch);
  if (opts.waitBusy) args.push('--wait-busy', opts.waitBusy);
  if (opts.yes !== false) args.push('-y');   // 默认无人值守；显式 false 才交给 ACE 弹确认
  const r = runAceCli(args);
  return { ...r, guarded: !!opts.ifMatch };
}

/** 便捷：算好载荷（clip-local）+ 写。**不做冲突检查** —— 那是 `previewImport` 的职责，别绕过它。 */
export function payloadForClip(notes: readonly FitNote[], math: TickMath): AceNotePayload[] {
  return toAcePayload(notes as never, math);
}
