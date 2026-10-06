/**
 * MCP 工具：**`ace_import_musicxml`** —— MusicXML → ACE 音符块。
 *
 * 契约（用户 2026-10-05 定，见 `docs/识谱接入.md` §3.4 / §3.6 / §3.6b）：
 *   · **默认只读预览**：读目标轨/clip 的现有音符与 `fingerprint` → 算落位 → **问用户写在哪**（needConfirm 形态）；
 *     预览必须报四件事：**落点**（哪轨/哪 clip）· **现有音符区间与条数** · **交叠清单**（会顶掉谁 / 我要丢谁）·
 *     **是否要拆线**（Sing 单音：拆成几条）。
 *   · **写**：`dryRun:false` + `confirmRights:true` 才写；带 `--if-match <fingerprint>`（陈旧写守卫）；
 *     **绝不替用户裁现有音**（引擎自身也是"宁可拒、不解析"）。
 *   · **不写**：`dryRun` 时除了预览，还可以把音符**导出成 MIDI**（`writeMidi:true`）当中间产物。
 *   · ⚠️ **写后立刻读回可能陈旧**（本机实测：ACE 报 `addedCount:3`、指纹已变，但 `note-content` 仍返回旧的 242 音）
 *     ⇒ 一律**以写响应为准**（`addedCount` / `noteUuids`），读回只作参考并标明"可能滞后"。
 *
 * 🆕 2026-10-06：执行体抽成**可复用的 `importMusicXmlToAce()`**（工具行为**一个字没变**：同一套预览四件事 /
 * `needConfirm` / `dryRun` / `confirmRights` / `--if-match` / `writeMidi` 路径）。理由：宿主无关的"统一音符块写入器"
 * 要复用这条链（MusicXML → 音符 → 预览 → 确认 → 写），不该再抄一份 ▶ 见 `qToMidiBytes` / `uniqueMidiPath` 的导出说明。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseMusicXMLFile } from '../audio/musicxml.js';
import { toMidiBytes } from '../melody/writer.js';
import { previewImport, writeNotes, listClips, listTracks } from './import-io.js';
import type { FitNote } from './fit-notes.js';

/** SV 的时间单位：1 个四分音符 = 705600000 blick（`melody/writer.ts` 的口径）。 */
const BLICK_PER_QUARTER = 705_600_000;
void BLICK_PER_QUARTER;   // ⚠️ 保留常量仅作参考：本模块给 MIDI 写出传的是**拍**（见下），不是 blick

/**
 * 拍 → MIDI 字节。
 * ⚠️ 两个坑（都是实测/读源码得到的，别照直觉写）：
 *   ① `melody/generator.ts::MelodyNote` 的字段是 **`startBeat`/`durBeats`/`vel`**（单位**拍**，
 *      `melody/writer.ts` 自己按 `ppq=480` 换成 tick）—— **不是** `onset`/`duration`，也**不是** blick
 *      （`audio/harmony.ts` 里另有一个**同名**接口用 blick，别混）；
 *   ② 那个 `MelodyNote` **没有 lyrics 字段** ⇒ **MIDI 中间产物不含歌词**（要歌词得自己写 meta 事件，属后续）。
 *
 * 导出给"**不写工程时给 MIDI 中间产物**"那条路复用（宿主无关的写入器 / 生成类工具）：
 * 入参 = 拍为单位的音符数组（`startQ`/`durQ`/`pitch`，`vel` 固定 0.8 ⇒ 走主旋律层）+ BPM；出参 = `.mid` 字节。
 */
export function qToMidiBytes(
  q: readonly { startQ: number; durQ: number; pitch: number }[],
  bpm: number,
): Uint8Array {
  return toMidiBytes(
    q.map((n) => ({
      pitch: n.pitch,
      startBeat: n.startQ,
      durBeats: Math.max(0.01, n.durQ),
      vel: 0.8,               // ≥0.5 ⇒ 主旋律层（<0.5 会被 writer 当伴奏层）
    })),
    { bpm },
  );
}

/**
 * `x.musicxml` → `x.mid`（已存在则 `x-2.mid`…；**绝不覆盖**）。
 * 导出理由同上：任何"顺手在源文件旁落一个中间产物"的地方都该用这条命名规则（`omr/dolce.ts` 的
 * 「绝不覆盖已存在的产物」是同一条纪律）。入参 = 任意源文件路径；出参 = 一个**当前不存在**的同名 `.mid` 路径。
 */
export function uniqueMidiPath(input: string): string {
  const base = path.join(path.dirname(input), path.basename(input, path.extname(input)));
  for (let i = 1; i < 1000; i++) {
    const p = i === 1 ? base + '.mid' : `${base}-${i}.mid`;
    if (!existsSync(p)) return p;
  }
  return `${base}-${Date.now()}.mid`;
}

/** MusicXML 一个 part 的音符 → 我们的 `FitNote`（**绝对拍**，`startQ/durQ` 的换算交给 tick 数学）。 */
function partToQNotes(notes: readonly { pitch: number; onset: number; duration: number; lyrics?: string; rest?: boolean; tieStop?: boolean }[]) {
  const out: { startQ: number; durQ: number; pitch: number; lyric?: string; tenuto?: boolean }[] = [];
  for (const n of notes) {
    if (n.rest || n.pitch < 0) continue;
    // 延续音：`<tie type="stop">` 且自身没歌词 ⇒ ACE 里写**字面 `-`**（一个音节 + 若干 tenuto）
    const tenuto = !n.lyrics && !!n.tieStop;
    out.push({ startQ: n.onset, durQ: n.duration, pitch: n.pitch, lyric: n.lyrics || undefined, tenuto });
  }
  return out;
}

/** `ace_import_musicxml` 的入参（与 MCP schema 一一对应 ⇒ 工具层只做转调）。 */
export interface AceImportMusicXmlArgs {
  input: string;
  part?: number;
  trackIndex?: number;
  clipIndex?: number;
  bpm?: number;
  offsetQ?: number;
  dryRun?: boolean;
  confirmRights?: boolean;
  writeMidi?: boolean;
  midiPath?: string;
}

/**
 * **执行体**：MusicXML → 预览 → （确认后）写 ACE 音符块。返回**可 JSON 化**的对象（错误也是对象，不抛）。
 * 行为与抽出来之前**完全一致**（工具 handler 现在只做 `json(await importMusicXmlToAce({…}))`）。
 */
export async function importMusicXmlToAce(args: AceImportMusicXmlArgs): Promise<Record<string, unknown>> {
  const { input, part, trackIndex, clipIndex, bpm, offsetQ, dryRun, confirmRights, writeMidi, midiPath } = args;
  try {
    const score = parseMusicXMLFile(input);
    const withNotes = score.parts.filter((p) => p.notes.some((n) => !n.rest && n.pitch >= 0));
    if (!withNotes.length) return { ok: false, error: '这份 MusicXML 里没有音符' };
    const p = part ? withNotes[part - 1] : withNotes[0];
    if (!p) return { ok: false, error: `没有第 ${part} 个含音符的 part（共 ${withNotes.length} 个）` };

    const useBpm = bpm || p.tempo || 0;
    if (!(useBpm > 0)) {
      return {
        ok: false,
        error: '需要 BPM 才能把音乐时间换成 ACE 的 tick：这份 MusicXML 里没有 tempo，请显式传 bpm（**不默认 120**）',
      };
    }
    const q = partToQNotes(p.notes);

    /* 🆕 **MIDI 中间产物**（用户 2026-10-05 定：「如果不写也可以提供中间产物 midi」）：
     * 默认就出 —— 预览/被拦/真写三种情况都留一份 `.mid`，用户可以在 DAW / ACE / SV 里自己再处理。
     * ⚠️ 绝不覆盖同名文件（`uniqueMidiPath` 自动加序号）。 */
    let midiOut: string | null = null;
    let midiErr: string | null = null;
    if (writeMidi !== false) {
      try {
        const bytes = qToMidiBytes(q, useBpm);
        midiOut = midiPath ? path.resolve(midiPath) : uniqueMidiPath(input);
        writeFileSync(midiOut, bytes);
      } catch (e) {
        midiErr = (e instanceof Error ? e.message : String(e)).slice(0, 200);   // 出 MIDI 失败**不拦**主流程，如实报
      }
    }

    // ⚠️ 传的是**拍**（不是 tick）：tick 率要先读到 clip 才能反算，顺序不能颠倒（换算在 previewImport 内部做）
    const preview = previewImport({ qNotes: q, bpm: useBpm, trackIndex, clipIndex, offsetQ });

    const base = {
      file: input,
      part: { index: withNotes.indexOf(p) + 1, id: p.id, name: p.name },
      notesInPart: q.length,
      target: { trackIndex: preview.track.trackIndex, trackName: preview.track.trackName, clipName: preview.clip.clipName, clipUuid: preview.clipUuid, clipType: preview.clip.clipType },
      existingCount: preview.existingCount,
      payloadCount: preview.payload.length,
      conflicts: preview.conflicts.map((c) => ({ mine: { start: c.mine.start, dur: c.mine.dur, pitch: c.mine.pitch }, willOverwrite: c.theirs })),
      selfOverlaps: preview.selfOverlaps,
      lines: preview.lines.map((l) => l.length),
      dropped: preview.dropped.length,
      bpm: useBpm,
      tickPerSecond: preview.math.ticksPerSecond,
      /** 中间产物 MIDI（"不写"时的交付物） */
      midiPath: midiOut,
      midiError: midiErr ?? undefined,
    };

    if (dryRun !== false) {
      return {
        ok: preview.ok, phase: 'preview', ...base,
        needConfirm: preview.ok ? { ask: '写进这条 clip 吗？', clipUuid: preview.clipUuid, payloadCount: preview.payload.length } : undefined,
        reason: preview.reason,
        hint: preview.ok
          ? '确认后带 dryRun:false + confirmRights:true 重调即可写入（会带 --if-match 守卫）'
          : '**没有写**：按上面的 conflicts/lines 先处理（挪或删挡路的音、或换 clip/换轨、或指定只写某一条线）',
      };
    }

    if (!confirmRights) return { ok: false, error: '写操作必须带 confirmRights:true（护栏）', ...base };
    if (!preview.ok) return { ok: false, error: '落位计划不通过 ⇒ 不写（见 reason/conflicts/lines）', ...base, reason: preview.reason };

    const w = writeNotes({ clipUuid: preview.clipUuid, payload: preview.payload, ifMatch: preview.ifMatch, waitBusy: '5s' });
    let readBack: unknown = null;
    try {
      const clips = listClips(preview.track.trackIndex);
      readBack = { noteCountAccordingToClipList: clips[clipIndex ?? 0]?.noteCount, note: '刚写完的读回**可能滞后**（实测）⇒ 以 addedCount/noteUuids 为准' };
    } catch { /* 读回失败不影响写入结论 */ }
    return {
      ok: w.code === 0, phase: 'write', ...base,
      addedCount: (w.json as { addedCount?: number } | null)?.addedCount ?? null,
      noteUuids: (w.json as { noteUuids?: string[] } | null)?.noteUuids ?? null,
      exitCode: w.code, guarded: w.guarded, stderr: w.stderr || undefined, readBack,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function registerAceImportMusicXml(server: McpServer, host?: string): void {
  void host;
  server.tool(
    'ace_import_musicxml',
    '**MusicXML → ACE 音符块**（走 `acestudio-cli`，ACE 不走桥）。**默认只读预览**：读目标轨/clip 现有音符与指纹，' +
    '报四件事（落点 · 现有音符区间与条数 · 交叠清单 · 是否要拆线），**问用户写在哪**；`dryRun:false` + `confirmRights:true` 才写，' +
    '写时带 `--if-match` 陈旧写守卫。' +
    '⛔ **铁律（实测 `help note-exclusivity`）**：**Sing 轨单音**（结果有重叠 ⇒ 引擎整笔拒 `NOTE_OVERLAP`）、' +
    '**Instrument / GenericMidi 轨复调**（允许重叠）；引擎"**宁可拒、不解析**"⇒ 我们**绝不替你裁现有音**，' +
    '冲突就报出来（先自己挪/删，那是独立可撤销的一步）。' +
    '⚠️ `pos/dur` 是 **clip-local ticks**（相对 clip 起点），tick 率从 `clip list` 反算（本机 1080/s，**不硬编码**）；' +
    '⚠️ **写后立刻读回可能陈旧**（实测）⇒ 以写响应 `addedCount`/`noteUuids` 为准。',
    {
      input: z.string().describe('MusicXML 文件的**绝对本地路径**（.musicxml/.xml）'),
      part: z.number().optional().describe('取第几个 part（1 起）；省略取第一个含音符的 part'),
      trackIndex: z.number().optional().describe('目标 ACE 轨索引（0 起）；省略取第一条轨'),
      clipIndex: z.number().optional().describe('目标 clip 索引（0 起，默认 0）'),
      bpm: z.number().optional().describe('把音乐时间换成 tick 用的 BPM；省略优先取 MusicXML 里的 tempo，再不行**报错不猜**'),
      offsetQ: z.number().optional().describe('时间轴偏移（拍）：想把第 5 小节对到 clip 开头就传 4'),
      dryRun: z.boolean().optional().describe('省略/true = **只读预览**（默认）；false 才写'),
      confirmRights: z.boolean().optional().describe('写操作必须显式确认**有权使用这份乐谱**'),
      writeMidi: z.boolean().optional().describe('是否同时导出**中间产物 MIDI**（默认 true —— "不写"时这就是交付物）'),
      midiPath: z.string().optional().describe('MIDI 输出路径（绝对；省略 = 与乐谱同名同目录的 `.mid`，已存在则自动加序号，**绝不覆盖**）'),
    },
    async ({ input, part, trackIndex, clipIndex, bpm, offsetQ, dryRun, confirmRights, writeMidi, midiPath }) => {
      const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
      try {
        return json(await importMusicXmlToAce({ input, part, trackIndex, clipIndex, bpm, offsetQ, dryRun, confirmRights, writeMidi, midiPath }));
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}

/** ACE 不在线时给调用方一句能照做的话（工具层复用）。 */
export function aceOfflineHint(): string {
  try {
    listTracks();
    return '';
  } catch (e) {
    return 'ACE 不在线或没开 External Agent Access：' + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
}
