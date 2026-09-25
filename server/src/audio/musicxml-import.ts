/**
 * `sv_import_musicxml` 的执行体（2026-09-21 P5 抽出：护栏 + 映射 + 预览/写入分步）
 *
 * 为什么单独成文件：① 工具体只剩 schema 与 `serial()` 包装 ② **可被真机探针直接调用**（不必等宿主重启）
 * ③ 与 `sv_apply_articulations`（`server/src/articulations/index.ts`）同构。
 *
 * 七条护栏的落点：
 *   ① 路径（URL/相对/`.svp`·`.ixp`/扩展名）→ `musicxml-guard.guardMusicXmlPath`
 *   ② DTD/实体 → `scanXmlSafety`（**parser 内部也拒**，双保险）
 *   ③ SHA-256 一致 → 预览算一次，写前**再算一次**比对
 *   ④ 512 上限 → `checkNoteCap`
 *   ⑤ 只读预览默认 → `dryRun !== false` 直接返回报告，不碰工程
 *   ⑥ 权利确认 → 写入必须 `confirmRights: true`
 *   ⑦ tempo 只汇报 → 报告里 `sourceTempo.applied = false`，本模块**从不**写 tempo 标记
 *   另：**复调/和弦默认拒绝**（多 `<voice>` 混一条时间线会算错音位）→ `detectPolyphony` + `allowPolyphony`
 */
import { readFileSync } from "node:fs";
import { executeOp } from "../protocol.js";
import { parseMusicXML, type MxPart } from "./musicxml.js";
import {
  guardMusicXmlPath, guardFileReadable, scanXmlSafety, sha256OfFile, checkNoteCap,
  detectPolyphony, isPolyphonic, RIGHTS_NOTE,
} from "./musicxml-guard.js";
import { resolveInstrument, type InstrumentResolution } from "./ix-library-map.js";

const QUARTER = 705600000;
const PREVIEW_CAP = 20;

export interface ImportMusicXmlOptions {
  input: string;
  part?: number;
  groupName?: string;
  trackIndex?: number;
  lyrics?: string;
  dryRun?: boolean;
  confirmRights?: boolean;
  allowPolyphony?: boolean;
  host?: "sv" | "ix";
}

/**
 * GM / 声部名 → **IX 实际安装库名**的解析（2026-09-21 用户裁定「可以直接映射库名」后落地）。
 * 表与规则在 `ix-library-map.ts`（纯函数、可离线单测）；这里只做"取哪一路"的接线。
 */
export function resolveInstrumentForPart(part: Pick<MxPart, "name" | "midiInstruments">): InstrumentResolution {
  return resolveInstrument(part);
}

/** 主入口：护栏 → 解析 → 体检 → （默认只读预览）→ 写入。返回**可直接 JSON 化**的报告。 */
export async function importMusicXml(opts: ImportMusicXmlOptions): Promise<Record<string, unknown>> {
  const start = Date.now();
  const elapsed = () => ({ elapsedMs: Date.now() - start });

  // ① 路径护栏
  const g1 = guardMusicXmlPath(opts.input);
  if (!g1.ok) return { ok: false, guard: "path", error: g1.error, hint: g1.hint, ...elapsed() };
  // 可读性 + 体量
  const g2 = guardFileReadable(g1.path);
  if (!g2.ok) return { ok: false, guard: "file", error: g2.error, ...elapsed() };
  const raw = readFileSync(g1.path, "utf8");
  // ② XML 安全面
  const g3 = scanXmlSafety(raw);
  if (!g3.ok) return { ok: false, guard: "xml-safety", error: g3.error, hint: g3.hint, ...elapsed() };
  // ③ 指纹（预览用；写前会再算一次）
  const fp = sha256OfFile(g1.path);

  // 解析
  const score = parseMusicXML(raw);
  if (score.parts.length === 0) return { ok: false, error: "MusicXML 没有可用 part", file: g1.path, hash: fp.hash, ...elapsed() };
  const partSummary = score.parts.map((p, i) => ({
    index: i + 1, id: p.id, name: p.name,
    noteCount: p.notes.filter((n) => !n.rest).length,
    tempo: p.tempo,
    midiProgram: p.midiInstruments?.[0]?.program,
  }));

  // 选 part（含音符；默认第一个）
  const partIdx = (opts.part !== undefined ? opts.part - 1 : 0);
  let mxPart = score.parts[partIdx];
  if (!mxPart || mxPart.notes.filter((n) => !n.rest).length === 0) {
    mxPart = score.parts.find((p) => p.notes.some((n) => !n.rest)) as typeof mxPart;
  }
  if (!mxPart) return { ok: false, error: "MusicXML 里没有任何带音符的 part", file: g1.path, hash: fp.hash, partSummary, ...elapsed() };
  const notes = mxPart.notes.filter((n) => !n.rest);

  // ④ 音符数上限
  const g4 = checkNoteCap(notes.length);
  if (!g4.ok) {
    return { ok: false, guard: "note-cap", error: g4.error, hint: g4.hint, file: g1.path, hash: fp.hash, partSummary, ...elapsed() };
  }
  // 复调/和弦体检（默认拒绝）
  const poly = detectPolyphony(notes);
  if (isPolyphonic(poly) && opts.allowPolyphony !== true) {
    return {
      ok: false, guard: "polyphony",
      error: `该 part 不是单声部旋律：声部 ${poly.voices.length ? "[" + poly.voices.join(",") + "]" : "（未标 voice）"} · 同 onset 多音处 ${poly.chordOnsets} 个 · 最大同时音数 ${poly.maxStack}`,
      hint: "多声部/和弦混在一条时间线上会互相叠加时值 ⇒ 音位漂移。换一个单声部 part（见 partSummary），或确要导就显式 allowPolyphony:true",
      detail: poly, file: g1.path, hash: fp.hash, partSummary, ...elapsed(),
    };
  }

  // 音符载荷（blick + 歌词 + 技法 + 力度 + tie）
  // ⚠️ 2026-09-21 复核修：此前本段被一次 PowerShell 文本往返事故揉成一行，`articulations`/`tieStart`
  //    落在 `//` 之后 ⇒ 技法映射算好了却**根本没发出去**（死代码）。现已逐项发送。
  const notePayload = notes.map((n) => ({
    pitch: n.pitch,
    onsetBlicks: Math.round(n.onset * QUARTER),
    durationBlicks: Math.max(1, Math.round(n.duration * QUARTER)),
    lyrics: n.lyrics || opts.lyrics || "",
    ...(n.dynamic !== undefined ? { dynamic: n.dynamic } : {}),
    ...(n.articulations && n.articulations.length > 0 ? { articulations: n.articulations } : {}),
    ...(n.tieStart ? { tieStart: true } : {}),
    ...(n.tieStop ? { tieStop: true } : {}),
  }));
  const inst = resolveInstrument(mxPart);

  const preview: Record<string, unknown> = {
    ok: true,
    dryRun: opts.dryRun !== false,
    file: g1.path,
    hash: fp.hash,
    bytes: fp.bytes,
    partSummary,
    selectedPart: {
      index: score.parts.indexOf(mxPart) + 1,
      id: mxPart.id, name: mxPart.name,
      noteCount: notes.length,
      keyFifths: mxPart.keyFifths,
      beatsPerMeasure: mxPart.beatsPerMeasure,
      midiProgram: mxPart.midiInstruments?.[0]?.program,
      instrument: inst.library ? inst.library.name : null,
      instrumentSource: inst.source,
      instrumentMatched: inst.matched,
      instrumentGm0: inst.gm0,
      instrumentNote: inst.note,
    },
    counts: {
      notes: notes.length,
      withArticulations: notes.filter((n) => n.articulations && n.articulations.length > 0).length,
      withDynamic: notes.filter((n) => n.dynamic !== undefined).length,
      withLyrics: notes.filter((n) => (n.lyrics || "").length > 0).length,
      polyphony: poly,
    },
    // ⑦ 源 tempo 只汇报
    sourceTempo: { value: mxPart.tempo ?? null, applied: false, note: "只汇报、不套进工程；要套用请显式走 sv_apply_tempo" },
    mappingWarnings: mxPart.warnings ?? [],
    preview: notePayload.slice(0, PREVIEW_CAP),
    previewTruncated: notePayload.length > PREVIEW_CAP,
    ...elapsed(),
  };

  // ⑤ 默认只读预览
  if (opts.dryRun !== false) {
    return { ...preview, hint: "预览模式（默认）。核对 hash / 声部 / 计数 / 预览后，传 dryRun:false + confirmRights:true 才会写入工程" };
  }
  // ⑥ 权利确认
  if (opts.confirmRights !== true) {
    return { ...preview, ok: false, guard: "rights", error: "缺少权利确认 ⇒ 不写工程", rights: RIGHTS_NOTE, hint: "确认后带 confirmRights:true 重跑", ...elapsed() };
  }
  // ③ 写前再算一次哈希（TOCTOU）
  const fp2 = sha256OfFile(g1.path);
  if (fp2.hash !== fp.hash) {
    return {
      ...preview, ok: false, guard: "hash-changed",
      error: `文件在校验后发生了变化（预览 hash ${fp.hash.slice(0, 12)}… ≠ 现在 ${fp2.hash.slice(0, 12)}…）⇒ 拒绝写入`,
      hint: "重新跑一次预览，确认内容无误再写", ...elapsed(),
    };
  }

  // 写入（复用 write_chords 的显式音符通道：建 NoteGroup + 音符 + 技法/力度，ref offset = 0）
  const writeRes = await executeOp("write_chords", {
    notes: notePayload,
    groupName: opts.groupName || "Import",
    trackIndex: opts.trackIndex,
    instrument: inst.library,
    host: opts.host,
  }, { timeoutMs: 15000, intervalMs: 150 });

  return { ...preview, dryRun: false, written: writeRes, ...elapsed() };
}
