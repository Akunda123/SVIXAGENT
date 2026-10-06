/**
 * MCP 工具：**`write_notes`** —— 音符块 → 宿主（**统一写入器**，宿主无关）。
 *
 * 为什么需要它（用户 2026-10-05「一块写了」清单第 4 项）：
 *   生成类（旋律 / 和声 / 和弦 / 织体）的产物以前只能落到 **SV / IX**（各自走桥的写操作）；
 *   **ACE 没有写入端** ⇒ 在 ACE 上生成的旋律无处可去。本工具用**唯一中间格式 MusicXML** 把这条补上：
 *
 *       音符数组 → MusicXML（`audio/musicxml-writer.ts`）→ SV/IX（`sv_import_musicxml` 的执行体）
 *                                                    ↘ ACE（`ace_import_musicxml` 的执行体）
 *
 *   ⇒ 生成类工具**不必各自适配三个宿主**，也**不必各自实现护栏**（预览 / 权利确认 / 指纹 / 不重叠检查
 *   都在两条既有导入链里，本工具只做"换口径 + 转交"，**不重写逻辑**）。
 *
 * 三条硬纪律（与既有工具一致，别在这里打折扣）：
 *   · **默认 `dryRun:true`**（只出产物 + 预览，不写工程）；写宿主必须 `dryRun:false` **且** `confirmRights:true`。
 *   · **产物一定落盘**：`.musicxml`（不写宿主时它就是交付物，可自己拿去 MuseScore / Sibelius 看）。
 *     **绝不覆盖已有文件**（同名自动加序号）。`outPath` 必须是**绝对**路径。
 *   · **ACE 默认单声部**（`polyphonic:false`）：ACE Sing 轨是单音、重叠会**整笔拒写**（见
 *     `docs/识谱接入.md` §3.6b）。压单声部时的**每一次丢弃/截短都记进 `warnings`** 并回报，绝不静默。
 *
 * ⚠️ 命名：本工具**不带 `sv_` / `ace_` 前缀** —— 它同时服务三个目标，带前缀会误导（`sv_*` 那些分析类工具
 *   其实是宿主无关的，那是历史包袱；新工具不再这么起名）。
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { notesToMusicXmlResult, type WriteNoteQ } from "./audio/musicxml-writer.js";
import { importMusicXml } from "./audio/musicxml-import.js";
import { importMusicXmlToAce } from "./ace/tool-import.js";

/** 产物目录：客户端工作目录下的 `generated/`。
 *  ⚠️ 环境变量名要跟着客户端走：`main.js` 用的是 **`AKDAGENT_HOME_DIR`**（`AKDAGENT_HOME` 是旧名/其它工具的叫法）
 *  —— 2026-10-06 复核发现本文件原先只读 `AKDAGENT_HOME`，客户端根本不设它 ⇒ 描述里那句对用户是空话。
 *  取不到任何一个就退 `~/.dsh-akdagent/generated`。 */
export function generatedDir(): string {
  const env = (process.env.AKDAGENT_HOME || process.env.AKDAGENT_HOME_DIR || "").trim();
  const base = env ? env : path.join(os.homedir(), ".dsh-akdagent");
  const dir = path.join(base, "generated");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 同名不覆盖（自动加 `-2` / `-3`…）——与 `sv_omr_image` 同一条纪律。 */
export function uniqueMusicXmlPath(p: string): string {
  if (!existsSync(p)) return p;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  for (let i = 2; i < 1000; i++) {
    const cand = path.join(dir, `${base}-${i}${ext}`);
    if (!existsSync(cand)) return cand;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

/** 输入音符：起点/时值**两种口径都收** —— `onsetQ`/`durQ`（四分音符 = 拍）或 `startBeat`/`durBeats`（生成类）。 */
interface NoteInput {
  pitch: number;
  onsetQ?: number;
  startBeat?: number;
  durQ?: number;
  durBeats?: number;
  lyric?: string;
  vel?: number;
  velocity?: number;
}

function toNoteQ(list: readonly NoteInput[], offsetQ: number): { notes: WriteNoteQ[]; skipped: number } {
  const out: WriteNoteQ[] = [];
  let skipped = 0;
  for (const n of list || []) {
    const onset = n.onsetQ !== undefined ? n.onsetQ : n.startBeat;
    const dur = n.durQ !== undefined ? n.durQ : n.durBeats;
    const pitch = Number(n.pitch);
    if (!Number.isFinite(pitch) || !Number.isFinite(Number(onset)) || !Number.isFinite(Number(dur)) || Number(dur) <= 0) {
      skipped++;
      continue;
    }
    out.push({
      pitch,
      onsetQ: Number(onset) + offsetQ,
      durQ: Number(dur),
      lyric: n.lyric,
      velocity: n.velocity !== undefined ? n.velocity : n.vel,
    });
  }
  return { notes: out, skipped };
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
}

/** 默认是否保留和弦：**只有 ACE 默认压单声部**（Sing 轨是单音、重叠会被引擎整笔拒写）。 */
export function defaultPolyphonic(target: "sv" | "ix" | "ace"): boolean {
  return target !== "ace";
}

export function registerWriteNotes(server: McpServer): void {
  const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

  server.tool(
    "write_notes",
    "**统一音符块写入器**（宿主无关）：把一串音符写成 **MusicXML**，再转交给 **SV / IX / ACE** 的导入链落进工程。" +
      "适合：生成类工具（旋律 / 和声 / 和弦 / 织体）的产物要落到任一宿主时；或你手上已有一串音高+时值想直接写进工程。" +
      "**默认 `dryRun:true`** = 只写 `.musicxml` 产物（可自己拿去 MuseScore/Sibelius 看）+ 出预览，**不碰工程**；" +
      "要真写进宿主：`dryRun:false` **且** `confirmRights:true`（权利确认与既有导入工具同一条纪律）。" +
      "⚠️ **ACE 默认压成单声部**（`polyphonic:false`）：Sing 轨是单音、重叠会被引擎**整笔拒写**；" +
      "压平过程中的每次丢弃/截短都会写进 `warnings` 如实报给你。SV/IX 默认保留和弦（`polyphonic:true`）。" +
      "⚠️ 音符两种口径都收：`onsetQ`/`durQ`（**四分音符 = 拍**）或 `startBeat`/`durBeats`（生成类口径）；" +
      "`pitch` 是 MIDI（C4 = 60）。产物落在 `$AKDAGENT_HOME/generated/`（可用 `outPath` 指定绝对路径，同名不覆盖）。",
    {
      notes: z
        .array(
          z.object({
            pitch: z.number().describe("MIDI 音高（C4 = 60）"),
            onsetQ: z.number().optional().describe("起点（**四分音符 = 拍**，从 0 起）"),
            startBeat: z.number().optional().describe("起点（拍；与 onsetQ 二选一，等价）"),
            durQ: z.number().optional().describe("时值（四分音符 = 拍）"),
            durBeats: z.number().optional().describe("时值（拍；与 durQ 二选一，等价）"),
            lyric: z.string().optional().describe("歌词（可选；`-` = 延音）"),
            vel: z.number().optional().describe("力度 0~1 或 0~127（可选）"),
            velocity: z.number().optional().describe("同上（两种写法都收）"),
          }),
        )
        .describe("要写的音符（必须能凑出 pitch + 起点 + 时值；凑不出的会被剔除并在 skipped 里报数）"),
      target: z.enum(["sv", "ix", "ace"]).describe("写到哪：sv = Synthesizer V Studio · ix = Instrument X · ace = ACE Studio"),
      trackIndex: z.number().optional().describe("目标轨道索引（0 起；省略 = 各导入链的默认：第一条非音频轨）"),
      clipIndex: z.number().optional().describe("仅 ACE：目标 clip 索引（0 起，默认 0）"),
      groupName: z.string().optional().describe("仅 SV/IX：音符组名（省略 = Import）"),
      bpm: z.number().optional().describe("把拍换算成宿主 tick 用的 BPM（省略 = 各导入链自己取/报错不猜）"),
      offsetQ: z.number().optional().describe("整体时间轴偏移（拍）：想从第 5 小节起就给 16（4/4 下）"),
      polyphonic: z.boolean().optional().describe("保留和弦（SV/IX 默认 true；ACE 默认 false = 压单声部，Sing 轨必须）"),
      title: z.string().optional().describe("写进 MusicXML 的标题（可选）"),
      partName: z.string().optional().describe("写进 MusicXML 的声部名（可选）"),
      beats: z.number().optional().describe("每小节拍数（默认 4，仅影响谱面切分）"),
      beatType: z.number().optional().describe("以几分音符为一拍（默认 4）"),
      fifths: z.number().optional().describe("调号升号数（负 = 降号；默认 0 = C；只影响等音写法，不改音高）"),
      outPath: z.string().optional().describe("`.musicxml` 产物路径（**必须绝对**；省略 = 自动落在生成的目录里，同名不覆盖）"),
      dryRun: z.boolean().optional().describe("省略/true = 只出产物与预览（**默认**）；false 才写宿主"),
      confirmRights: z.boolean().optional().describe("写宿主必须显式确认**有权使用这些音符**（版权纪律），不带就不写"),
      writeMidi: z.boolean().optional().describe("仅 ACE：同时导出一份 MIDI 中间产物（默认 false）"),
      midiPath: z.string().optional().describe("仅 ACE：MIDI 输出路径（绝对；省略 = 与产物同名同目录）"),
    },
    async (args) => {
      const target = args.target;
      const offsetQ = Number(args.offsetQ) || 0;
      if (args.outPath !== undefined && !path.isAbsolute(String(args.outPath))) {
        return json({ ok: false, error: "outPath 必须是**绝对**路径（与其它导入工具同一条纪律）" });
      }
      // midiPath 同样只认绝对路径：相对路径会被 `path.resolve` 解析到**服务进程的 CWD**（不是用户以为的地方）
      if (args.midiPath !== undefined && !path.isAbsolute(String(args.midiPath))) {
        return json({ ok: false, error: "midiPath 必须是**绝对**路径（相对路径会落到服务进程的工作目录）" });
      }
      const { notes, skipped } = toNoteQ((args.notes || []) as NoteInput[], offsetQ);
      if (!notes.length) {
        return json({
          ok: false,
          error: "没有可用音符：每条至少要有 `pitch` + 起点（`onsetQ` 或 `startBeat`）+ 时值（`durQ` 或 `durBeats`，> 0）",
          skipped,
        });
      }
      // ACE 默认单声部（Sing 轨硬规则）；SV/IX 默认保留和弦
      const polyphonic = args.polyphonic !== undefined ? args.polyphonic : defaultPolyphonic(target);
      const built = notesToMusicXmlResult(notes, {
        title: args.title,
        partName: args.partName,
        tempoBpm: args.bpm,
        beats: args.beats,
        beatType: args.beatType,
        fifths: args.fifths,
        polyphonic,
      });
      // ⚠️ 规划阶段可能把音符**全剔掉**（音高越界 / 时值非法）——那时落盘的 `.musicxml` 一个 <note> 都没有，
      //   宿主只会回一句"没有任何带音符的 part"（用户看不出是我们剔除的）。所以这里**直接判失败**并不落盘。
      if (!built.notes.length) {
        return json({
          ok: false,
          error: "没有可写入的音符：全部被剔除（音高越界 / 时值非法 / 非数）——看 `warnings` 的逐条原因",
          skipped,
          warnings: built.warnings,
        });
      }
      const out = args.outPath
        ? uniqueMusicXmlPath(String(args.outPath))
        : uniqueMusicXmlPath(path.join(generatedDir(), `write-notes-${stamp()}.musicxml`));
      writeFileSync(out, built.xml, "utf8");

      const base = {
        ok: true,
        target,
        artifact: out,
        noteCount: built.notes.length,
        skipped,
        polyphonic,
        warnings: built.warnings,
      };

      if (target === "ace") {
        const result = await importMusicXmlToAce({
          input: out,
          trackIndex: args.trackIndex,
          clipIndex: args.clipIndex,
          bpm: args.bpm,
          // ⚠️ **不要**把 `offsetQ` 传给 ACE：偏移已经烘进 MusicXML 的 onset 了（见上 `toNoteQ(…, offsetQ)`）。
          //    ACE 侧的 `offsetQ` 是另一套语义（进 `tickMathForClip`，指 clip 在工程时间轴上的位置），
          //    两边一起加就会**偏移两遍**（2026-10-06 复核发现）。
          dryRun: args.dryRun,
          confirmRights: args.confirmRights,
          writeMidi: args.writeMidi === true,   // ⚠️ 显式钉成 true 才写：ACE 侧那个工具的默认是 true，而本工具的文档写的是**默认 false**（2026-10-06 复核抓到不一致）
          midiPath: args.midiPath,
        });
        return json({
          ...base,
          note: "ACE 侧：默认只读预览；写要 dryRun:false + confirmRights:true。产物 `.musicxml` 已落盘，可直接交给其它宿主或自己看。",
          result,
        });
      }

      const result = await importMusicXml({
        input: out,
        groupName: args.groupName,
        trackIndex: args.trackIndex,
        dryRun: args.dryRun,
        confirmRights: args.confirmRights,
        allowPolyphony: polyphonic,
        host: target,
      });
      return json({
        ...base,
        note: "SV/IX 侧：默认只读预览；写要 dryRun:false + confirmRights:true。产物 `.musicxml` 已落盘。",
        result,
      });
    },
  );
}
