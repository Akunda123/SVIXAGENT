/**
 * MCP 工具定义与注册  * 工具语义采用"先读后写"设计：模型先调用 sv_get_selected_notes 查看选中内容  * 再调用写操作，避免盲操作  */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOp } from "./protocol.js";
import { separateVocals, convertAudio, separateVocalsDual } from "./audio.js";
import { analyzeAudio, computeTempoMarks } from "./audio/analyze.js";
import { generateHarmony, detectKey } from "./audio/harmony.js";
// ⚠️ 不要在这里静态 import note-extract：它会静态拉 onnxruntime-node，原生绑定加载失败
//    时整颗 server 起不来（2026-09-26 改）。见 sv_extract_notes 里的动态 import。
import { analyzeEmotion } from "./audio/emotion.js";
import { chroma as chromaDsp, detectChord } from "./audio/dsp.js";
import { parseLrc, alignLyricsToNotes, type NoteTime } from "./audio/lyric-align.js";
import { listByVocoder, listStyles, combineStyles, createStyle, adjustStyle } from "./style-combine.js";
import { generateMelody, melodyPlan, checkMelody, toMidiBytes, toMidiData, parseRootPitch, isMinorKey, type MelodyNote, type CheckNote } from "./melody/index.js";
import { extractChordTrack } from "./audio/chord-track.js";
import { chordsToNotes } from "./audio/chords.js";
import { parseMusicXML, type MxNote } from "./audio/musicxml.js";
import { importMusicXml } from "./audio/musicxml-import.js";
import {
  analyzeChordsFromNotes, analysisFromProgression, analysisFromSegs, abstractTemplate, renderTexture,
  findInstrument, suggestTextures, applyInstrumentRules, INSTRUMENTS,
  type TextureType, type Section, type TemplateNoteOut,
} from "./texture/index.js";
import { planGroupLanguage } from "./lyric/language.js";
import { tonesOfGroup } from "./lyric/tone.js";
import { checkLyrics, type LyricNote } from "./lyric/check.js";
import { runArticulations, loadArticulationData, pruneList, applyToGroupCode, unwrapResult } from "./articulations/index.js";
import { listPhonemes, replacePhonemes } from "./phoneme/ops.js";

/** 工具调用结果统一格式化为文本块（DSH mcp-client 会拼 text 块） */
function textResult(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * 「统一给这一批音符设同一组技法」参数的解析（`sv_write_texture` / `sv_write_chords` 的 `articulations`）。
 * 只做**组内自洽化**（按实测全局互斥图丢掉自相冲突/重复项）；**该轨到底支不支持读不出来**
 * （IX API 读不到乐器）⇒ 那部分交给宿主，如实回报，别假装校验过。
 * ⚠️ 技能 JSON 缺失时**降级放行**（不让织体/和弦工具因为缺表而整个失败）。
 */
function resolveUniformArticulations(requested?: string[]): {
  used: string[];
  report: { requested: string[]; used: string[]; dropped: { key: string; conflictsWith: string[] }[]; note: string } | null;
} {
  if (!requested || requested.length === 0) return { used: [], report: null };
  let used = requested.slice();
  let dropped: { key: string; conflictsWith: string[] }[] = [];
  let note = "只解**组内自相冲突**与重复（按实测全局互斥图）。⚠️ **该轨支不支持读不出来**（IX API 读不到乐器）⇒ 写入成功 ≠ 真实可用；要逐音确认请用 `sv_apply_articulations` 看计划/回读，或读 `getArticulationState().incompatible`。" +
    " 另：`setArticulations` 会把音符永久置 `articulationsFixed=true`（API 清不掉，只能 Ctrl+Z 或 UI 重开 Smart）。";
  try {
    const { matrix } = loadArticulationData();
    const r = pruneList(matrix, requested);
    used = r.used;
    dropped = r.dropped;
  } catch (e) {
    note = "⚠️ 读不到技法矩阵（" + (e instanceof Error ? e.message : String(e)) + "）⇒ **没做互斥消解**，原样透传；" + note;
  }
  return { used, report: { requested, used, dropped, note } };
}

/** 从调性字符串（如 "F major" / "D minor"）解析根音音级（0-11，C=0）；解析失败返回 -1 */
function keyToPc(key: string): number {
  const m = key.match(/([A-G])(#|b)?/);
  if (!m) return -1;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[m[1]];
  if (pc === undefined) return -1;
  if (m[2] === "#") pc = (pc + 1) % 12;
  else if (m[2] === "b") pc = (pc + 11) % 12;
  return pc;
}

/** GM program → IX 声库的映射表已随 P5 移到 `audio/musicxml-import.ts`（本文件不再留第二份） */

/** 可选的目标宿主参数（多宿主并存时用 分别控制"SV1/SV2  IX） */
const HOST_SCHEMA = {
  host: z.enum(["sv", "ix"]).optional().describe("目标宿主：sv=Synthesizer V Studio（默认，自动探测），ix=Instrument X"),
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 读「计算类」接口（计算音高 / 计算属性）。
 * 宿主侧 op **只读一次**（op 处理器同步返回，不能在里面阻塞等待，否则冻宿主界面）⇒ 未算完时**在 Node 侧轮询重试**。
 * 判据 = op 回的 `notReady`（音高：有值帧数 == 0；属性：条目数 == 0）。
 * ⚠️ 轮询超时后**照实回传** `notReady=true` + `timedOut`，并保留宿主的 `checks` / `hint`，
 *    让模型先按「渲染前置条件（组挂没挂到轨道 / 窗口覆盖没覆盖）+ 语种与声库是否兼容」自查。
 */
async function readComputed(
  op: string,
  args: Record<string, unknown>,
  waitMs: number | undefined,
  host: "sv" | "ix" | undefined
): Promise<{ content: { type: "text"; text: string }[] }> {
  const budget = waitMs === undefined ? 8000 : Math.max(0, waitMs);
  const t0 = Date.now();
  let attempts = 0;
  let last: Record<string, unknown> = {};
  for (;;) {
    attempts += 1;
    const r = (await executeOp(op, host ? { ...args, host } : { ...args })) as Record<string, unknown> | null;
    last = (r ?? {}) as Record<string, unknown>;
    const elapsed = Date.now() - t0;
    const retryable = last.notReady === true && last.ok !== false && last.unsupported !== true;
    if (!retryable || elapsed >= budget) break;
    const gap = Math.min(Number(last.retryAfterMs) || 500, Math.max(0, budget - elapsed));
    await sleep(gap);
  }
  return textResult({ ...last, attempts, waitedMs: Date.now() - t0, timedOut: last.notReady === true });
}

/**
 * 「混合语种：只改少数派」（用户 2026-09-18 提出；纪律见 `skills/akdagent-playbook/SKILL.md` §0.6b / §0.6c）
 * 默认 **dry-run**：先出方案（谁判成什么语、依据哪一级、要改哪几个），确认后才 `apply: true` 写入。
 * 两可的（`san` / `ka` / `ni` 这种既像拼音又像罗马字的）**一律不擅自改**，报 `toAsk` 让用户定。
 */
async function fixMixedLyricLanguage(apply: boolean, host: "sv" | "ix" | undefined) {
  const raw = (await executeOp("get_lyrics_attrs", host ? { host } : {})) as {
    current?: boolean; groupName?: string;
    notes?: { index: number; lyrics: string; languageOverride?: string; musicalType?: string }[];
  } | null;
  if (!raw || raw.current === false) return textResult({ ok: false, reason: "没有当前组（先在宿主里选中一个组）" });
  const notes = raw.notes ?? [];
  const plan = planGroupLanguage(notes);
  const base = {
    groupName: raw.groupName,
    noteCount: notes.length,
    majority: plan.majority,
    majorityCount: plan.majorityCount,
    note: "语言是用户的决定：只在用户反馈「多语言混杂」时才动，且只改少数派（playbook §0.6b / §0.6c）",
    decisions: plan.decisions,
    toSet: plan.toSet,
    toAsk: plan.toAsk,
  };
  if (!apply) {
    return textResult({ ok: true, applied: false, dryRun: true, ...base, hint: "确认无误后加 apply:true 才真正写入" });
  }
  if (plan.toSet.length === 0) {
    return textResult({ ok: true, applied: false, dryRun: false, ...base, hint: "没有需要单独设语种的音符" });
  }
  const write = (await executeOp("set_note_languages", { items: plan.toSet, ...(host ? { host } : {}) })) as Record<string, unknown>;
  const back = (await executeOp("get_lyrics_attrs", host ? { host } : {})) as { notes?: { index: number; lyrics: string; languageOverride?: string }[] } | null;
  return textResult({
    ok: true, applied: true, dryRun: false, ...base, write,
    readBack: (back?.notes ?? []).map((n) => ({ index: n.index, lyrics: n.lyrics, languageOverride: n.languageOverride })),
  });
}

/**
 * 「按歌词自动标记说唱声调」（用户 2026-09-18 提出；配方见 `skills/sv-lyricist/references/说唱词流.md` §5.3）
 * 依据：`setRapAccent("1"…"5")` = 五个声调（**5 = 轻声**，用户订正；真机已验证可写可回读）。
 * 默认 **dry-run**；非中文歌词自动跳过；只标 `musicalType === "rap"` 之外的音符会照标但在回报里点出来。
 */
async function markMandarinTones(apply: boolean, onlyRap: boolean, host: "sv" | "ix" | undefined) {
  const raw = (await executeOp("get_lyrics_attrs", host ? { host } : {})) as {
    current?: boolean; groupName?: string;
    notes?: { index: number; lyrics: string; rapAccent?: string; musicalType?: string }[];
  } | null;
  if (!raw || raw.current === false) return textResult({ ok: false, reason: "没有当前组（先在宿主里选中一个组）" });
  const notes = raw.notes ?? [];
  const decisions = tonesOfGroup(notes.map((n) => ({ index: n.index, lyrics: n.lyrics, rapAccent: n.rapAccent ?? "" })));
  const notRap = notes.filter((n) => (n.musicalType ?? "") !== "rap").map((n) => n.index);
  const targets = decisions.filter((d) => {
    if (d.action !== "set") return false;
    if (!onlyRap) return true;
    const n = notes.find((x) => x.index === d.index);
    return (n?.musicalType ?? "") === "rap";
  });
  const base = {
    groupName: raw.groupName,
    noteCount: notes.length,
    counts: { total: decisions.length, willSet: targets.length, skip: decisions.filter((d) => d.action === "skip").length },
    notRapNotes: notRap,
    decisions,
    caveats: [
      "rapAccent 是普通话专属（文档原文）；非中文歌词一律跳过",
      "5 = 轻声（用户订正）；1 阴平 · 2 阳平 · 3 上声 · 4 去声",
      onlyRap ? "只标 musicalType=rap 的音符（onlyRap=true）" : "不限定 musicalType（onlyRap=false）",
    ],
  };
  if (!apply) {
    return textResult({ ok: true, applied: false, dryRun: true, ...base, hint: "确认无误后加 apply:true 才真正写入" });
  }
  if (targets.length === 0) {
    return textResult({ ok: true, applied: false, dryRun: false, ...base, hint: "没有可标记的音符（要么非中文、要么都被 onlyRap 过滤掉了）" });
  }
  const items = targets.map((t) => ({ index: t.index, accent: t.accent as string }));
  const write = (await executeOp("set_note_rap_accents", { items, ...(host ? { host } : {}) })) as Record<string, unknown>;
  const back = (await executeOp("get_lyrics_attrs", host ? { host } : {})) as { notes?: { index: number; lyrics: string; rapAccent?: string }[] } | null;
  return textResult({
    ok: true, applied: true, dryRun: false, ...base, write,
    readBack: (back?.notes ?? []).map((n) => ({ index: n.index, lyrics: n.lyrics, rapAccent: n.rapAccent })),
  });
}

/**
 * A：**短音符的辅音"吃掉"前一个音符**（唱歌/rap 都会出）—— 出方案 / 写回。
 * 依据：`skills/sv-project-format/SKILL.md`「短音符的辅音吃掉前一个音符」+ `api/Note.md` 第 25/26 条。
 *   **SV2**：改 `attributes.phonemes[0].leftOffset` —— **负值 = 辅音往左延伸 = 抢前一个音符**；
 *          往 0 方向收，**但绝不设 0（0 = 提前量归零 = 辅音消失，真机听感确认）**。
 *   **SV1**：改 `attributes.dur[0]`（比例数组，第 1 项 = 辅音；`null` 当 1）—— 用户口径：压到 50%~80%。
 * 默认 **dry-run**；⚠️ 引擎会消费写入，**但 SV2 不回显到 computed ⇒ 效果只能听感验收**。
 */
async function fixConsonantIntrusion(opts: {
  apply: boolean; shortQuarter: number; leftRatio: number; durFactor: number;
  indices?: number[]; host?: "sv" | "ix";
}) {
  const host = opts.host;
  const raw = (await executeOp("get_lyrics_attrs", host ? { host } : {})) as any;
  if (!raw || raw.current === false) return textResult({ ok: false, reason: "没有当前组（先在宿主里选中一个组）" });
  const notes: any[] = raw.notes ?? [];
  const isSv2 = raw.hasComputedAttributes !== false;      // 有 computed 接口 ⇒ 按 SV2 处理
  const sorted = [...notes].sort((a, b) => (a.onsetBlick ?? 0) - (b.onsetBlick ?? 0));
  const plan: any[] = [];
  const sv2Items: any[] = [];
  const sv1Items: any[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i], next = sorted[i + 1];
    const forced = (opts.indices ?? []).includes(cur.index);
    if (!forced && cur.durationQuarter > opts.shortQuarter + 1e-9) continue;
    const row: any = {
      shortNote: { index: cur.index, lyrics: cur.lyrics, durQuarter: cur.durationQuarter },
      nextNote: { index: next.index, lyrics: next.lyrics },
    };
    // —— SV2：音素属性
    const pa: any[] = next.phonemeAttrs ?? [];
    const lo = pa.length > 0 ? pa[0]?.leftOffset : undefined;
    const floorAbs = 0.06;                                   // 已验证 −0.05 左右"相对正确" ⇒ 不比这更大就别动
    if (typeof lo === "number" && lo < 0 && Math.abs(lo) <= floorAbs) {
      row.sv2 = {
        currentLeftOffset: lo, changed: false,
        why: `绝对值 ≤ ${floorAbs} ⇒ 已在合理区间（用户实测 −0.05 相对正确）⇒ **不改**`,
      };
    } else if (typeof lo === "number" && lo < 0) {
      let sug = Number((lo * opts.leftRatio).toFixed(5));
      if (sug > -0.01) sug = -0.01;                        // 留余量：0 会让辅音消失
      row.sv2 = { currentLeftOffset: lo, suggestedLeftOffset: sug, why: "负值=辅音往左延伸抢前音；往 0 收，但不设 0（0=辅音消失）" };
      sv2Items.push({
        index: next.index,
        phonemes: pa.map((q: any, j: number) => {
          const item: any = {};
          for (const k of ["position", "leftOffset", "strength", "activity"]) {
            if (q && q[k] !== undefined && q[k] !== null) item[k] = q[k];
          }
          if (j === 0) item.leftOffset = sug;
          return item;
        }),
      });
    } else if (pa.length === 0) {
      row.sv2 = "该音符没有 phonemes 项（引擎只在被编辑/需要时才写）⇒ SV2 读不到也改不了这一处；可改前一个音符时值、或拆音";
    } else {
      row.sv2 = "leftOffset 非负 ⇒ 未构成侵占，无需改";
    }
    // —— SV1：dur 比例数组
    const dur = next.dur;
    if (Array.isArray(dur) && dur.length > 0) {
      const cur0 = typeof dur[0] === "number" && !Number.isNaN(dur[0]) ? dur[0] : 1;   // null ⇒ 默认 1
      const sug0 = Number((cur0 * opts.durFactor).toFixed(3));
      row.sv1 = { currentDur0: cur0, suggestedDur0: sug0 };
      const out = dur.slice();
      out[0] = sug0;
      sv1Items.push({ index: next.index, dur: out });
    } else {
      const one = [Number(opts.durFactor.toFixed(3))];
      row.sv1 = { currentDur0: null, suggestedDur: one, why: "还没有 dur 数组 ⇒ 建议写 1 项（只设辅音那一项，其余默认 1）" };
      sv1Items.push({ index: next.index, dur: one });
    }
    plan.push(row);
  }
  const base = {
    host: isSv2 ? "sv2" : "sv1",
    noteCount: notes.length,
    params: { shortQuarter: opts.shortQuarter, leftRatio: opts.leftRatio, durFactor: opts.durFactor, indices: opts.indices ?? null },
    plan,
    caveats: [
      "SV2 的 phonemes 写入**引擎会消费**，但**不回显到 computed** ⇒ 效果只能听感验收",
      "SV2 的 leftOffset = 0 会让**辅音消失**，故建议值留了余量",
      "SV1 的 dur 是**比例**数组（第 1 项 = 辅音），SV2 写了读不回",
      "本工具只动音素属性；**不改歌词、不改语言、不改时值**",
    ],
  };
  if (!opts.apply || plan.length === 0) {
    return textResult({
      ok: true, applied: false, dryRun: true, ...base,
      hint: plan.length === 0
        ? "没有命中：没有短音符（可调 shortQuarter）或组内没有下一位音符"
        : "确认后加 apply:true 才真正写入",
    });
  }
  const payloadS2 = sv2Items.length ? await executeOp("set_note_phoneme_attrs", { items: sv2Items, ...(host ? { host } : {}) }) : null;
  const payloadS1 = sv1Items.length ? await executeOp("set_note_dur", { items: sv1Items, ...(host ? { host } : {}) }) : null;
  return textResult({ ok: true, applied: true, dryRun: false, ...base, write: { phonemeAttrs: payloadS2, dur: payloadS1 } });
}

export function registerTools(server: McpServer): void {
  // 通道只有**一对** req/res 文件（`akdagent-req-<host>.json` / `-res-`）⇒ 并发请求会互相覆盖、
  // 后写者把先写者的请求顶掉，先写者则永远等不到自己 id 的响应。所以所有工具调用**必须串行化**。
  // （串行的原因早已不是剪贴板，而是**请求/响应只有一对文件**，结论一样：**不能并发**。）
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn);
    chain = run.catch(() => undefined);
    return run;
  };

  server.tool(
    "sv_ping",
    "检 Synthesizer V Studio 桥脚本是否在线，返回宿主名称/版本/isSV2。调用其 sv_* 工具前建议先调用本工具确认桥已启动。⚠️ **先看 `hostOutdated`**：为 true 时（目前只有 **IX 1.0.0** 会）宿主过旧 —— 读点类 API（getPoints/getAllPoints/getLinear/getDefinition）会弹框冻住桥，**请先让用户升级宿主（≥1.0.1）**再做读点类操作；其余字段含 hostWarning 原文。可 host 指定目标宿主（sv/ix）",
    { ...HOST_SCHEMA },
    async ({ host }) => serial(() => executeOp("ping", host ? { host } : {}, { timeoutMs: 3000, intervalMs: 150 }).then(textResult))
  );

  server.tool(
    "sv_get_selected_notes",
    "读取当前 Synthesizer V Studio 中选中的音符列表。返回每个音符的 index（**本次选中结果数组内的序号，0 起**，≠ 组内下标）、pitch（MIDI 音高，C4=60）、onsetQuarter/durationQuarter/endQuarter（以四分音符为单位）、lyrics（歌词）。写操作前先用它了解选中内容。可 host 指定目标宿主（sv/ix）",
    { ...HOST_SCHEMA },
    async ({ host }) => serial(() => executeOp("get_selected_notes", host ? { host } : {}).then(textResult))
  );

  server.tool(
    "sv_get_current_group",
    "读取当前编辑的音符组信息：名称、UUID、音符数量、时间偏移、音高偏移。可 host 指定目标宿主（sv/ix）",
    { ...HOST_SCHEMA },
    async ({ host }) => serial(() => executeOp("get_current_group", host ? { host } : {}).then(textResult))
  );

  server.tool(
    "sv_get_project_info",
    "读取当前工程信息：文件名、时长、轨道列表（名称与组数量）、NoteGroup 库数量。可 host 指定目标宿主（sv/ix）",
    { ...HOST_SCHEMA },
    async ({ host }) => serial(() => executeOp("get_project_info", host ? { host } : {}).then(textResult))
  );

  server.tool(
    "sv_get_computed_pitch",
    "读取宿主**计算出的音高曲线**（SV2 2.1.1+；SV1 无此接口）。返回 values（半音 / MIDI 音高浮点）、numeric（有值帧数）、nulls（未算出帧数）、firstFrame/lastFrame、notReady、waitedMs。⚠️ 宿主回的是「长度 = numFrames、未算出的帧为 **null**」的数组（**不是空数组**）⇒ 本工具按帧判类型统计，并在 notReady 时**自动轮询重试**（Node 侧等待，不冻宿主）。若最终仍全 null，先看 checks：① 该组是否经 NoteGroupReference 挂到轨道、且窗口覆盖采样区间 ② 词的语种是否与声库兼容（不兼容 ⇒ 无音素 ⇒ 不渲染）—— 这两条比「渲染没算完」更常见。可 host 指定目标宿主（sv/ix）",
    {
      startBlick: z.number().int().optional().describe("起始**绝对**位置（blick，1 四分音符 = 705600000）；省略 = 当前组引用的 timeOffset"),
      intervalBlick: z.number().int().min(1).optional().describe("采样间隔（blick）；省略 = 四分音符/8"),
      numFrames: z.number().int().min(1).max(4096).optional().describe("采样帧数（默认 32，上限 4096）"),
      waitMs: z.number().int().min(0).max(60000).optional().describe("未就绪时的最长轮询时间（默认 8000ms；0 = 只读一次、不重试）"),
      ...HOST_SCHEMA,
    },
    async ({ startBlick, intervalBlick, numFrames, waitMs, host }) =>
      serial(() => readComputed("get_computed_pitch", { startBlick, intervalBlick, numFrames }, waitMs, host))
  );

  server.tool(
    "sv_get_computed_attributes",
    "读取宿主**计算出的音符属性**（SV2 2.1.1+）：每个音符的 accent（重音）、rapTone/rapIntonation（说唱语调，仅 rap 音符有值）、phonemes[]（symbol/language/activity/position —— 含**实际生效语种**）。这是说唱（重音 / 语调）与「这组到底用什么语种在唱」的正路。返回 count/notes/languages（去重排序）/accents/notReady/waitedMs；为空时同样先按「渲染前置条件 + 语种与声库是否兼容」自查，不要先怀疑渲染延迟。可 host 指定目标宿主（sv/ix）",
    {
      waitMs: z.number().int().min(0).max(60000).optional().describe("为空时的最长轮询时间（默认 8000ms；0 = 只读一次、不重试）"),
      ...HOST_SCHEMA,
    },
    async ({ waitMs, host }) => serial(() => readComputed("get_computed_attributes", {}, waitMs, host))
  );

  server.tool(
    "sv_fix_mixed_lyric_language",
    "**混合语种**：扫描当前组所有音符的歌词，**按语义**判每个音符的语种（① 字形：CJK⇒中文·假名⇒日文·谚文⇒韩文 ② **拉丁字母按词法再判**：带声调符号或 `ni3` 式数字 ⇒ **拼音=中文**；`tsu`/`shi`/长音/`-masu` 或常用日语词 ⇒ **罗马字=日文**；命中常用英文词 ⇒ 英文 ③ 两可时看上下文），出「只给**少数派**音符单独设语种」的方案（写 `Note#setLanguageOverride`，逐个回读）。⚠️ **默认 dry-run**（`apply:true` 才写入）；⚠️ **语言纪律**：用户比我们清楚声库语种，**只在用户反馈「多语言混杂」时**才做，且只改少数派；两可的一律报 `toAsk` 让用户定（`skills/akdagent-playbook/SKILL.md` §0.6b / §0.6c）。可 host 指定目标宿主（sv/ix）",
    {
      apply: z.boolean().optional().describe("true = 真的写入（只动少数派音符并回读）；默认 false = 只出方案"),
      ...HOST_SCHEMA,
    },
    async ({ apply, host }) => serial(() => fixMixedLyricLanguage(apply === true, host))
  );

  server.tool(
    "sv_mark_mandarin_tones",
    "**中文声调自动标记**（用户觉得 **rap 声调不准**时用）：读当前组歌词，**按词**查普通话声调（`pinyin-pro`，多音字按词定音；歌词自带调号/`ni3` 式数字时直接读），逐音符写 `Note#setRapAccent`（**1 阴平 · 2 阳平 · 3 上声 · 4 去声 · 5 轻声** —— 用户 2026-09-18 订正；真机已验证可写可回读）。⚠️ **默认 dry-run**（`apply:true` 才写入）；非中文歌词自动跳过（rapAccent 是普通话专属）；`onlyRap` 默认 true（只标 `musicalType` 为 rap 的音符）。⚠️ **不改歌词、不改语言**。可 host 指定目标宿主（sv/ix）",
    {
      apply: z.boolean().optional().describe("true = 真的写入并回读；默认 false = 只出方案"),
      onlyRap: z.boolean().optional().describe("true（默认）= 只标 musicalType=rap 的音符；false = 组内所有中文音符都标"),
      ...HOST_SCHEMA,
    },
    async ({ apply, onlyRap, host }) => serial(() => markMandarinTones(apply === true, onlyRap !== false, host))
  );

  server.tool(
    "sv_fix_consonant_intrusion",
    "**修「短音符的辅音吃掉前一个音符」**（唱歌 / rap 都会出）：扫当前组找**短音符**（默认 ≤ 0.25 四分音符 = 16 分音符；也可用 `indices` 点名）→ 取**它后面那个音符**的起首辅音 → 出「收多少」的方案。**SV2**：读 `attributes.phonemes[0].leftOffset`（**负值 = 辅音往左延伸 = 抢前一个音符**）⇒ 建议**往 0 方向收**（`leftRatio` 默认 0.3；**绝不设 0 —— `0` = 辅音消失**）。**SV1**：读 `attributes.dur[0]`（比例数组第 1 项 = 辅音）⇒ 建议**压到 `durFactor`**（默认 0.65）。⚠️ **默认 dry-run**；⚠️ 引擎会消费写入但**SV2 不回显到 computed** ⇒ **效果只能听感验收**；⚠️ 只动音素属性，**不改歌词 / 语言 / 时值**。可 host 指定目标宿主（sv/ix）",
    {
      apply: z.boolean().optional().describe("true = 真正写入并回读；默认 false = 只出方案"),
      shortQuarter: z.number().min(0.0625).max(4).optional().describe("短音符阈值（四分音符为单位；默认 0.25 = 16 分音符）"),
      leftRatio: z.number().min(0.05).max(1).optional().describe("SV2：leftOffset 绝对值乘以该比例（默认 0.3）"),
      durFactor: z.number().min(0.1).max(1).optional().describe("SV1：dur[0] 乘以该系数（默认 0.65，即压到 65%）"),
      indices: z.array(z.number().int().min(0)).optional().describe("点名要处理的音符（**0 起**，指「短音符」本身；省略 = 按阈值自动找）"),
      ...HOST_SCHEMA,
    },
    async ({ apply, shortQuarter, leftRatio, durFactor, indices, host }) =>
      serial(() => fixConsonantIntrusion({
        apply: apply === true,
        shortQuarter: shortQuarter ?? 0.25,
        leftRatio: leftRatio ?? 0.3,
        durFactor: durFactor ?? 0.65,
        indices,
        host,
      }))
  );

  // 音素候选（只读）—— 给「音素替换」提供**可选项**（用户 2026-09-22 的 P22）
  server.tool(
    "sv_list_phonemes",
    "**列出可替换的音素候选**（只读）：读目标音符的**实际发音音素串**（`SV:getPhonemesForGroup`，含 T2P 默认；拿不到则退回首动串），" +
    "按**每个音符的实际语种**（SV2 读 computed 的 `phonemes[].language`；SV1 退 `languageOverride`，可用 `language` 显式指定）" +
    "给每个音素列出**按相似度排名的候选**：元音 = 同族（Jaccard：共享族数 ÷ 并集族数）＋族内参考顺序邻近；辅音 = 字母近似（沿用参考脚本 `音素替换.js` 的直觉）。" +
    "候选条数**自适应**：取 score ≥ 最高分 50% 的一档（最少 3、最多 10）；无相似信息时给短清单（`topN` 可显式覆盖，0 = 全列）。" +
    "族数据来自用户那份**听感手工分类**的参考脚本（其中 mandarin `j` / japanese `u` / cantonese `y` 由我们的修订层补进了族）。" +
    "范围：`indices` → 选中的音符 → 全组。⚠️ 相似是**启发式**，听感仍以你为准。可 host 指定目标宿主（sv/ix；音素是人声专属，IX 上无意义）",
    {
      indices: z.array(z.number().int().min(0)).optional().describe("目标音符的组内下标（**0 起**）；省略 ⇒ 选中的音符 → 全组"),
      language: z.string().optional().describe("显式指定语种（mandarin/english/japanese/cantonese/spanish/korean/common），覆盖自动判定"),
      topN: z.number().int().min(0).optional().describe("每个音素给几个候选；省略 ⇒ 自适应（≥最高分 50%，最少 3 最多 10）；0 = 全列"),
      crossLanguage: z.boolean().optional().describe("允许跨语种候选（默认 false = 只在本语言里挑）"),
      ...HOST_SCHEMA,
    },
    async ({ indices, language, topN, crossLanguage, host }) =>
      serial(() => listPhonemes({ indices, language, topN, crossLanguage, host }).then(textResult))
  );

  // 批量替换音素（写；默认 dry-run）
  server.tool(
    "sv_replace_phonemes",
    "**批量替换音素**（写；**默认 dry-run**）：基于**实际发音串**（`SV:getPhonemesForGroup`，含 T2P 默认）改音素 —— " +
    "`mode:\"map\"`（默认）按 `replacements`（`[{from,to}]`，**音素 token 精确匹配**，不是子串替换）批量换；`mode:\"set\"` 按 `items` 逐音符整串写（**空串 = 清掉手动音素、回到 T2P 默认**）。" +
    "范围：`indices` → 选中的音符 → 全组（用户 2026-09-22 裁定）。" +
    "⛔ **表外音素直接拒写**（用户裁定）：目标串里任何 token 不在清单里（官方表 ∪ 参考脚本清单；`strict:\"official\"` 可只认官方表）⇒ **一个都不写**，并给出近邻候选；" +
    "跨语种音素需显式 `crossLanguage:true`（**我们不会替你改语种**）。写前 `newUndoRecord`、写完**回读**。" +
    "⚠️ SV2 的 phonemes 写入**引擎会消费但不回显到 computed** ⇒ **效果只能听感验收**。先 `sv_list_phonemes` 拿候选再替换是最顺的路。可 host 指定目标宿主（sv/ix；IX 上直接拒绝）",
    {
      mode: z.enum(["map", "set"]).optional().describe("map（默认）=按 replacements 批量换 token；set=按 items 逐音符整串写"),
      replacements: z.array(z.object({ from: z.string(), to: z.string() })).optional().describe("mode=map：音素 token 替换表，如 [{from:'u',to:'U'}]（精确匹配 token）"),
      items: z.array(z.object({ index: z.number().int().min(0), phonemes: z.string() })).optional().describe("mode=set：[{index, phonemes}]，index 为**组内下标（0 起）**；phonemes 空串 = 清掉手动音素"),
      indices: z.array(z.number().int().min(0)).optional().describe("限定范围（组内下标，0 起）；省略 ⇒ 选中的音符 → 全组"),
      language: z.string().optional().describe("校验用的语种（覆盖自动判定）"),
      crossLanguage: z.boolean().optional().describe("允许目标音素来自其它语种的清单（默认 false）"),
      strict: z.enum(["union", "official"]).optional().describe("拒写判据的严格度：union（默认，官方表 ∪ 参考脚本清单）／official（只认官方表）"),
      dryRun: z.boolean().optional().describe("默认 true = 只出计划（旧串 → 新串、命中明细、非法项）；false 才真正写入并回读"),
      ...HOST_SCHEMA,
    },
    async ({ mode, replacements, items, indices, language, crossLanguage, strict, dryRun, host }) =>
      serial(() => replacePhonemes({ mode, replacements, items, indices, language, crossLanguage, strict, dryRun, host }).then(textResult))
  );

  server.tool(
    "sv_get_layout",
    "读**当前组的布局报告**（只读，不改任何东西）：把组内音符按 onset 排序，逐对比较 → 返回 `overlapCount`（**重叠 = 违规，必须报给用户**）、`gapCount`（**缝隙 = 允许，仅告知**）、`smallGapCount`（**短缝 ≤ 1/16 拍**，单列）、以及前 5 条样例与 `policy` 原文。⚠️ **2026-09-18 用户新口径：不再要求「不留缝」** —— 留缝允许但要告知，**消缝必须经用户同意**；**我们生成新音符默认不留短缝**。另返回 `isMain`（当前组是不是 SV2 主组）与 `hostIsSv2`。可 host 指定目标宿主（sv/ix）",
    { ...HOST_SCHEMA },
    async ({ host }) => serial(() => executeOp("get_layout", host ? { host } : {}).then(textResult))
  );

  server.tool(
    "sv_transpose_selected_notes",
    "将当前选中的音符整体移调。semitones 为半音数（整数）：正数升高、负数降低，例如 -12 表示降低一个八度 7 表示升高纯五度。操作会先创建撤销记录，可 SV 内撤销。可 host 指定目标宿主（sv/ix）",
    { semitones: z.number().int().min(-48).max(48).describe("移调半音数，负数为降"), ...HOST_SCHEMA },
    async ({ semitones, host }) =>
      serial(() => executeOp("transpose_selected_notes", { semitones, host }).then(textResult))
  );

  server.tool(
    "sv_set_selected_lyrics",
    "将当前选中的音符歌词统一设置为指定文本（如 'la'、'啊'、'love'）。操作会先创建撤销记录。可 host 指定目标宿主（sv/ix）",
    { lyrics: z.string().min(1).max(128).describe("要设置的歌词文本"), ...HOST_SCHEMA },
    async ({ lyrics, host }) => serial(() => executeOp("set_selected_lyrics", { lyrics, host }).then(textResult))
  );

  // 歌词逐字/按词对位到当前选中的音符（歌词-音符对位   
server.tool(
    "sv_apply_lyrics",
    "把一段歌词逐字/按词分配到当前选中的音符（歌词-音符对位）。中文按单字切分、英 含空格按词切分，按音符顺序逐个 setLyrics。音符多于字符时剩余 '-'，字符多于音符则多余忽略。适合把写好的歌词按音符顺序填 SV 旋律。操作会先创建撤销记录。可 host 指定目标宿主（sv/ix）",
    { lyrics: z.string().min(1).describe("歌词文本（中文逐字、英文按词；支持空格/标点分隔）"), ...HOST_SCHEMA },
    async ({ lyrics, host }) =>
      serial(() => executeOp("apply_lyrics", { lyrics, host }).then((r) => textResult({ ok: true, ...(r as object) })))
  );

  // 歌词时序对齐：读当前组音 onset 时间，按 LRC 时间戳把歌词对位到音   
server.tool(
    "sv_align_lyrics",
    "歌词时序对齐：读取当前组音符 onset 时间（秒），按歌 LRC 的时间戳，把每段歌词的字/词按到达顺序对位到对应时间段的音符，并回填歌词。歌词用 LRC 格式（每 [mm:ss.xx] 歌词文本）。音符落在无歌词段时 '-'. 适合给带时间戳的歌词按音符时序自动填词。可 host 指定目标宿主（sv/ix）",
    {
      lrc: z.string().describe("LRC 歌词文本（每 '[mm:ss.xx] 歌词'，可含多 多段）"),
      apply: z.boolean().optional().describe("是否把对齐的歌词回填到音符（默认 false，只返回对齐映射）"),
      ...HOST_SCHEMA,
    },
    async ({ lrc, apply, host }) => {
      const start = Date.now();
      try {
        // 1. 读当前组音符（用 get_melody_notes  onsetSeconds         
const melodyRes = (await executeOp("get_melody_notes", { host }, { timeoutMs: 8000, intervalMs: 150 })) as {
          current?: boolean;
          notes?: { onsetSeconds: number; durationSeconds?: number; pitch?: number; lyrics?: string }[];
        };
        const notes = (melodyRes.notes || []).map((n) => ({ onsetSec: n.onsetSeconds, durationSec: n.durationSeconds, midi: n.pitch }));
        if (notes.length === 0) {
          return textResult({ ok: false, error: "当前组没有音符，请先创建音符再对齐歌", elapsedMs: Date.now() - start });
        }
        // 2. 解析 LRC + 对齐
        const segs = parseLrc(lrc);
        const res = alignLyricsToNotes(notes as NoteTime[], segs);
        // 3. 回填（可选）：把对齐后的歌词按音符顺序设         
let filled = false;
        if (apply) {
          const lyricsText = res.aligned.map((a) => a.lyric).join("");
          await executeOp("apply_lyrics", { lyrics: lyricsText, host }, { timeoutMs: 8000, intervalMs: 150 });
          filled = true;
        }
        return textResult({
          ok: true,
          noteCount: res.noteCount,
          aligned: res.aligned.map((a) => ({ onsetSec: Math.round(a.onsetSec * 100) / 100, lyric: a.lyric })),
          bySegment: res.bySegment,
          filled,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 把正确歌词按音符顺序填到指定轨道（可指定轨道，也可不指定用当前轨   
server.tool(
    "sv_fill_lyrics_to_track",
    "把一段歌词（正确歌词）按音符顺序/时间填到指定轨道的音符（歌词-音符对位，可指定正式轨）。track 可填轨道名称（如 'Track 2'）或数字索引（**0 起**的轨道下标）；省略则用当前轨。中文逐字、英文按词切分，'-' 停顿保留。适合：已有空音符轨，把写好的正确歌词按序填入。操作会创建撤销记录。可 host 指定目标宿主（sv/ix）",
    {
      lyrics: z.string().describe("歌词文本（中文逐字、英文按词；'-' 表示停顿/留空）"),
      track: z.string().optional().describe("目标轨道名称或数字索引（**0 起**；省略=当前轨）"),
      ...HOST_SCHEMA,
    },
    async ({ lyrics, track, host }) => {
      const start = Date.now();
      try {
        const res = await executeOp("fill_track_lyrics", { lyrics, track, host }, { timeoutMs: 8000, intervalMs: 150 });
        return textResult({ ok: true, ...(res as object), elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  server.tool(
    "sv_playback",
    "控制 Synthesizer V Studio 的播放：play 播放 / pause 暂停 / stop 停止 / toggle 播放暂停切换 / seek 跳转到指定秒数（需 position 参数）。可 host 指定目标宿主（sv/ix）",
    {
      action: z.enum(["play", "pause", "stop", "toggle", "seek"]).describe("播放动作"),
      position: z.number().optional().describe("seek 时的目标位置（秒）"),
      ...HOST_SCHEMA,
    },
    async ({ action, position, host }) =>
      serial(() =>
        executeOp("playback", position === undefined ? { action, host } : { action, position, host }).then(textResult)
      )
  );

  // 音频分离（本地计算，不经过宿主通道，因此不 serial 串行链）
  server.tool(
    "sv_separate_vocals",
    "将音频文件（wav/mp3）分离为人声与伴奏，使用内置 MDX-Net 模型（Kim_Vocal_2，本地离线推理）。输入可为任意 mpg123 可解码格式，非 44.1kHz 会自动转码重采样。返 vocal.wav  accompaniment.wav 的路径、音频时长与处理分片数。注意：CPU 推理较慢，约 3-5 倍于音频时长（如 3 分钟歌曲约需 10 分钟）",
    {
      input: z.string().describe("输入音频文件绝对路径（wav/mp3）"),
      outDir: z.string().optional().describe("输出目录（默认输入文件同目录 <文件 _separated/）"),
      model: z.enum(["Kim_Vocal_2.onnx", "UVR-MDX-NET-Inst_HQ_3.onnx"]).optional().describe("分离模型（默认 Kim_Vocal_2；UVR-MDX-NET-Inst_HQ_3 为乐器优先，伴奏更净）"),
    },
    async ({ input, outDir, model }) => {
      const start = Date.now();
      try {
        const res = await separateVocals(input, outDir, model);
        return textResult({
          ok: true,
          vocal: res.vocal,
          accompaniment: res.accompaniment,
          seconds: Math.round(res.seconds),
          chunks: res.chunks,
          prepped: res.prepped,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 双模型分离：人声+伴奏都干净（人声用 Kim_Vocal_2，伴奏用 Inst_HQ_3   
server.tool(
    "sv_separate_vocals_dual",
    "双模型分离人声与伴奏，两者都尽可能干净：人声用 Kim_Vocal_2（人声优先模型，取 vocal），伴奏 UVR-MDX-NET-Inst_HQ_3（乐器优先模型，取其 vocal  纯伴奏）。适合需要同時干净人声+纯伴奏的场景（如人声 SV、伴奏进 IX）。注意：跑两个模型，耗时约两个单模型之和（约20min/3分钟歌曲）。输 wav/mp3",
    {
      input: z.string().describe("输入音频文件绝对路径（wav/mp3）"),
      outDir: z.string().optional().describe("输出目录（默认输入文件同目录 <文件 _dual/）"),
      vocal: z.boolean().optional().describe("是否提取人声（默认 true；用 Kim_Vocal_2 人声模型，取 vocal）"),
      accompaniment: z.boolean().optional().describe("是否提取伴奏（默认 true；用 Inst_HQ_3 乐器模型，取 vocal  纯伴奏）"),
    },
    async ({ input, outDir, vocal, accompaniment }) => {
      const start = Date.now();
      try {
        const res = await separateVocalsDual(input, outDir, vocal ?? true, accompaniment ?? true);
        return textResult({
          ok: true,
          vocal: res.vocal,
          accompaniment: res.accompaniment,
          seconds: Math.round(res.seconds),
          chunks: res.chunks,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 音频格式转换（本地计算，不经过宿主通道，不依赖 SV   
server.tool(
    "sv_convert_audio",
    "将音频文件（mp3/wav/m4a/其他 mpg123 可解码格式）转换 44.1kHz 立体 WAV。完全本地处理（mpg123-decoder WASM 解码 + 重采样），不需 Synthesizer V 在线。可用于把任意音频转 SV 可导入的 WAV 格式",
    {
      input: z.string().describe("输入音频文件绝对路径"),
      outPath: z.string().optional().describe("输出 WAV 路径（默认输入同目录、同 .wav）"),
      maxSeconds: z.number().optional().describe("可选：只保留前 N "),
    },
    async ({ input, outPath, maxSeconds }) => {
      const start = Date.now();
      try {
        const res = await convertAudio(input, outPath, maxSeconds);
        return textResult({
          ok: true,
          output: res.output,
          seconds: Math.round(res.seconds),
          srcSr: res.srcSr,
          fromWav: res.fromWav,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 音频分析（纯 JS DSP，本地计算，不依 SV   
server.tool(
    "sv_analyze_audio",
    "分析音频文件（WAV）的特征：响 RMS、BPM、节拍序列、调性（key，Krumhansl）、频谱质心、音高中位数（Hz）。可指定时间窗口（startSec/endSec）分析局部片段。纯 JS DSP（@audio/beat + 自研 chroma/Krumhansl），不需 Synthesizer V 在线。输入需 WAV（可 sv_convert_audio 转换）",
    {
      input: z.string().describe("输入 WAV 文件绝对路径"),
      startSec: z.number().optional().describe("起始秒（默认 0）"),
      endSec: z.number().optional().describe("结束秒（默认文件末尾）"),
      bpm: z.number().optional().describe("指定 BPM（可选）：用它重新对齐拍 返回 bpm 的节拍序列；省略则自由检测并返回 bpmCandidates"),
    },
    async ({ input, startSec, endSec, bpm }) => {
      const start = Date.now();
      try {
        const res = await analyzeAudio(input, startSec ?? 0, endSec, { bpm });
        return textResult({ ok: true, ...res, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 音频情感分析（四象限 Valence-Arousal，基于已有物理特征）
  server.tool(
    "sv_analyze_emotion",
    "分析音频文件（WAV）的情感：基于调性大/小调、BPM、RMS 能量、音高中位数，映射到四象限（Valence-Arousal）得情感标签（喜 宁静/愤 悲伤）。返 { valence, arousal, quadrant, label, emoji, features }。可选时间窗口（startSec/endSec）。完全本地、零下载，无需 Synthesizer V 在线。输入需 WAV（可 sv_convert_audio  sv_separate_vocals 预处理）",
    {
      input: z.string().describe("输入 WAV 文件绝对路径"),
      startSec: z.number().optional().describe("起始秒（默认 0）"),
      endSec: z.number().optional().describe("结束秒（默认文件末尾）"),
    },
    async ({ input, startSec, endSec }) => {
      const start = Date.now();
      try {
        const res = await analyzeEmotion(input, startSec ?? 0, endSec);
        return textResult({ ok: true, ...res, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 干声  音符块（CREPE onnx 音高检测，本地离线   
server.tool(
    "sv_extract_notes",
    "从干声（人声 WAV）提取音符块（音高+起止时间），基于 CREPE onnx 音高检测模型（本地推理，精度高）。返回 [{midi（C4=60  onsetSec, durationSec, confidence, freqHz}]。可用于干声 MIDI /  SV 音符。输入需 WAV（建议先 sv_separate_vocals  sv_convert_audio 预处理）",
    { input: z.string().describe("输入 WAV 文件绝对路径") },
    async ({ input }) => {
      const start = Date.now();
      try {
        // ⚠️ **动态 import**（2026-09-26 改）：note-extract 静态 import onnxruntime-node，
        //    而 onnxruntime 的原生绑定（*_binding.node）在干净用户机上可能加载不了
        //    （最常见：缺 Microsoft Visual C++ 运行库；也见过杀软拦截）。
        //    静态 import 会让**整颗 MCP server 起不来**（exit 1），44 个工具全陪葬；
        //    改成运行时懒加载后，只有这一个工具报错，其余照常可用。
        const { extractNotes } = await import("./audio/note-extract.js");
        const res = await extractNotes(input);
        return textResult({ ok: true, ...res, elapsedMs: Date.now() - start });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const friendly = /onnxruntime|napi-v6|\.node\b/i.test(msg)
          ? `${msg}\n⇒ ONNX 运行库没能加载（常见原因：缺 Microsoft Visual C++ 2015-2022 Redistributable；或被安全软件拦了）。只有这一个工具受影响，其它工具照常可用。`
          : msg;
        return textResult({ ok: false, error: friendly, elapsedMs: Date.now() - start });
      }
    }
  );

  // 旋律生成（乐理规则算  MIDI / 音符 JSON，供 SV 人声 / IX 乐器   
server.tool(
    "sv_generate_melody",
    "用乐理规则算法生成旋律 MIDI/音符序列（主旋律 + 可选伴奏琶音），供人声 SV 或乐器进 IX。**v2 结构引擎**：主题(动机)跨小节发展（A→A'模进→B对比→A''回归）、句法分句、句末气口、句尾终止落音、单一高点（默认 2/3 处）、强拍踩和弦内音、自动压掉避免音（高小二度）、**时值收口（单声部不许重叠）**。参数：key(如 C/Am/F)、mood(bright/sad/epic/calm/tense...)、bpm、barCount(小节)、chordProgression(和弦进行，如 ['C','G','Am','F'])、useArpeggio(伴奏琶音)、phraseBars(一句几小节,默认4)、highPointBar(高点小节)、breathBeats(句末气口拍数)、seed。返回音 JSON + 结构 plan；若 outPath 则同时写 .mid。纯本地，不需宿主在线。**生成后不自动体检** —— 用户若要求复核那段旋律，再用 `sv_check_melody`（由用户指出才开始检测）",
    {
      key: z.string().describe(" 音名，如 'C'/'Am'/'F major'"),
      mood: z.enum(["bright", "happy", "sad", "dark", "tense", "calm", "epic"]).optional().describe("情绪/风格（默认 happy）"),
      bpm: z.number().optional().describe("速度（默认 120）"),
      barCount: z.number().optional().describe("小节数（默认 8）"),
      chordProgression: z.array(z.string()).optional().describe("和弦进行，如 ['C','G','Am','F']（省略则默认 I-V-vi-IV）"),
      useArpeggio: z.boolean().optional().describe("是否铺伴奏琶音（默认 false）"),
      phraseBars: z.number().optional().describe("一句几小节（默认 4；决定分句与气口位置）"),
      highPointBar: z.number().optional().describe("旋律高点落在第几小节（1 起；默认 ⌈小节数×2/3⌉）"),
      breathBeats: z.number().optional().describe("句末气口拍数（默认按情绪 0.5~1.0）"),
      seed: z.number().optional().describe("随机种子（确定性测试）"),
      outPath: z.string().optional().describe("输出 .mid 文件路径（省略则不写文件，只返回音符 JSON）"),
    },
    async ({ key, mood, bpm, barCount, chordProgression, useArpeggio, phraseBars, highPointBar, breathBeats, seed, outPath }) => {
      const start = Date.now();
      try {
        const genOpts = { key, mood, bpm, barCount, chordProgression, useArpeggio, phraseBars, highPointBar, breathBeats, seed };
        const plan = melodyPlan(genOpts);
        const notes = generateMelody(genOpts);
        let midiPath: string | null = null;
        let midiData = toMidiData(notes, { bpm });
        if (outPath) {
          const bytes = toMidiBytes(notes, { bpm });
          const fs = await import("node:fs");
          fs.writeFileSync(outPath, Buffer.from(bytes));
          midiPath = outPath;
        }
        // 只返回可序列化的音符摘要 + 调性信息（ sv_generate_harmony 协同：同调同和弦         
const keyRoot = ((parseRootPitch(key) - 60) % 12 + 12) % 12; // 0-11 根音
        const noteSummary = notes.map((n) => ({
          pitch: n.pitch, startBeat: n.startBeat, durBeats: n.durBeats, vel: n.vel,
        }));
        return textResult({
          ok: true,
          noteCount: notes.length,
          notes: noteSummary,
          keyRoot,
          keyName: key,
          isMinor: isMinorKey(key),
          chordProgression: chordProgression ?? plan.chords,
          plan: {
            scale: plan.scale,
            phraseBars: plan.phraseBars,
            phraseCount: plan.phraseCount,
            highPointBar: plan.highPointBar,
            breathBeats: plan.breathBeats,
            phrases: plan.phrases,
          },
          midiPath,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 旋律判据校验（把 composition skill 的"人的清单"变成机器可跑的判据）
  server.tool(
    "sv_check_melody",
    "**给已经写好的旋律做复核**（人工写的 / 自动生成的 / 别人给的都适用），并按判据列出一份**建议清单 + 严重度（error/warn/info）** —— **只列不改，是否修改由用户定**。<br>⚠️ **触发纪律：由用户指出才开始检测**（用户说「这段旋律帮我看看 / 有没有问题 / 帮我修一下」）—— **不要**在新生成一版之后自作主张地顺手跑，也不要把它当生成器的验收门。<br>**主要检查（用户点名）**：①不留气口 ②六度以上大跳（相邻音 ≥9 半音）③单一音重复（连续同音 ≥3 / 某音占比 ≥1/3）④大段短音符（吐字不清：连续 ≥6 个 ≤0.5 拍）。其余：调内音比例 / 全五声 / 单句跨八度 / 单一高点与 2/3 位置 / 强拍是否踩和弦内音 / 密度曲线 / 终止落音 / 音符重叠（error）。**避免音等和弦相关判据依赖 chordProgression —— 若是 sv_analyze_chord 扒来的和弦，仅供参考、慎用**。<br>输入二选一：**不传 notes ⇒ 读 SV 当前组的旋律**（需宿主在线）；**传 notes ⇒ 直接校验**（pitch + startBeat/durBeats，或 onsetBlicks/durationBlicks）。key 省略则用 Krumhansl 自动推断。纯本地判据，不联网",
    {
      notes: z.array(z.object({
        pitch: z.number().describe("MIDI 音高（C4=60）"),
        startBeat: z.number().optional().describe("起始拍（0 起）"),
        durBeats: z.number().optional().describe("时值（拍）"),
        onsetBlicks: z.number().optional().describe("或用 blick 表达起点（1 四分音符 = 705600000）"),
        durationBlicks: z.number().optional().describe("或用 blick 表达时值"),
      })).optional().describe("要校验的音符；省略则读 SV 当前组"),
      key: z.string().optional().describe("调性（如 'C'/'Am'）；省略则自动推断（Krumhansl）"),
      chordProgression: z.array(z.string()).optional().describe("和弦进行（逐小节循环），用于避免音与强拍和弦内音判据"),
      timeSig: z.number().optional().describe("每小节拍数（默认 4）"),
      phraseBars: z.number().optional().describe("一句几小节（默认 4）"),
      bpm: z.number().optional().describe("速度（仅用于回显，判据不依赖）"),
      ...HOST_SCHEMA,
    },
    async ({ notes, key, chordProgression, timeSig, phraseBars, bpm, host }) => {
      const start = Date.now();
      const QUARTER = 705600000;
      try {
        let input: CheckNote[] = [];
        let source = "notes";
        if (notes && notes.length) {
          input = notes.map((n) => {
            const startBeat = n.startBeat ?? (n.onsetBlicks !== undefined ? n.onsetBlicks / QUARTER : 0);
            const durBeats = n.durBeats ?? (n.durationBlicks !== undefined ? n.durationBlicks / QUARTER : 1);
            return { pitch: n.pitch, startBeat, durBeats };
          });
        } else {
          const res = (await executeOp("get_melody_notes", { host }, { timeoutMs: 8000, intervalMs: 150 })) as {
            current?: boolean;
            notes?: { pitch: number; onsetBlicks: number; durationBlicks: number }[];
          };
          const raw = res.notes || [];
          if (!res.current || raw.length === 0) {
            return textResult({ ok: false, error: "当前组没有音符：请先在 SV 中打开含旋律的音符组，或用 notes 参数直接给音符", elapsedMs: Date.now() - start });
          }
          const minOnset = Math.min(...raw.map((n) => n.onsetBlicks));
          input = raw.map((n) => ({
            pitch: n.pitch,
            startBeat: (n.onsetBlicks - minOnset) / QUARTER,   // 相对首个音归零 ⇒ 判据看的是相对结构
            durBeats: n.durationBlicks / QUARTER,
          }));
          source = "sv-current-group";
        }

        const report = checkMelody(input, { key, chordProgression, timeSig, phraseBars, bpm });
        return textResult({
          ok: true,
          source,
          report,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 作词检查（给已经写好的词做复核：倒字/谐音/韵脚/词格/上下文）
  server.tool(
    "sv_check_lyrics",
    "**给已经写好（或已填进工程）的歌词做复核**：按判据列出**问题清单 + 替换意见**，**只列不改**（改不改由用户定，一次只改一处）。<br>⚠️ **触发：用户提出检查，或填词完成后提醒**（提醒 ≠ 自动跑）—— 不要主动对着刚写的词顺手跑。<br>判据：①**倒字** —— 旋律走向 vs 字的本调；**映射规律（用户给定）**：无音高变化=一声 · 向上=二声 · 先向下后向上=三声 · 大幅向上（≥3 半音）也是三声 · 大幅向下（≥3 半音）=四声 ②**谐音（重点）** —— 倒字之后「听起来像什么」，用同音字表给候选字；**非倒字的同音相撞**也给轻量提示 ③**韵脚** —— 首句漏押 / 段内换韵 / 虚字充韵脚 ④**词格** —— 字数 vs 音符数；**连续 `-`（延音）多时给替换思路**（可塞几个字、往本段韵脚靠）⑤**上下文** —— 机器只给弱信号（人称/视角、相邻句无共同实词）与逐句清单，**逻辑是否通顺需人/模型判**。<br>⚠️ **参考级声明**：拼音/声调来自 pinyin-pro，**多音字与轻声不一定准** ⇒ 倒字/谐音这类涉及声调的结论按参考对待，以人耳为准。<br>输入：`lyrics`（整词文本，可带 `[Verse]` 之类段落标记）与/或 `notes`（pitch + startBeat/durBeats + lyric）；都不传则读 **SV 当前组的音符+歌词**（需宿主在线）",
    {
      lyrics: z.string().optional().describe("歌词文本（可选；可带 [Verse]/[Chorus] 段落标记，或空行分段）"),
      notes: z.array(z.object({
        pitch: z.number(),
        startBeat: z.number().optional(),
        durBeats: z.number().optional(),
        onsetBlicks: z.number().optional(),
        durationBlicks: z.number().optional(),
        lyric: z.string().describe("这个音符上的字；延音写 `-`"),
      })).optional().describe("与工程对齐的音符（有它才能判倒字/谐音/词格）"),
      timeSig: z.number().optional().describe("每小节拍数（默认 4）"),
      ...HOST_SCHEMA,
    },
    async ({ lyrics, notes, timeSig, host }) => {
      const start = Date.now();
      const QUARTER = 705600000;
      try {
        let input: LyricNote[] = [];
        let source = "text";
        if (notes && notes.length) {
          input = notes.map((n) => ({
            pitch: n.pitch,
            startBeat: n.startBeat ?? (n.onsetBlicks !== undefined ? n.onsetBlicks / QUARTER : 0),
            durBeats: n.durBeats ?? (n.durationBlicks !== undefined ? n.durationBlicks / QUARTER : 1),
            lyric: n.lyric,
          }));
          source = "notes";
        } else if (!lyrics) {
          const res = (await executeOp("get_melody_notes", { host }, { timeoutMs: 8000, intervalMs: 150 })) as {
            current?: boolean;
            notes?: { pitch: number; onsetBlicks: number; durationBlicks: number; lyrics?: string }[];
          };
          const raw = res.notes || [];
          if (!res.current || raw.length === 0) {
            return textResult({ ok: false, error: "没有词可查：请给 lyrics 或 notes，或先在 SV 里打开含歌词的音符组", elapsedMs: Date.now() - start });
          }
          const minOnset = Math.min(...raw.map((n) => n.onsetBlicks));
          input = raw.map((n) => ({
            pitch: n.pitch,
            startBeat: (n.onsetBlicks - minOnset) / QUARTER,
            durBeats: n.durationBlicks / QUARTER,
            lyric: n.lyrics ?? "",
          }));
          source = "sv-current-group";
        }

        const report = checkLyrics({ lyrics, notes: input, timeSig });
        return textResult({ ok: true, source, report, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 和声生成（主旋律 + 伴奏调  和声组写 SV   
server.tool(
    "sv_generate_harmony",
    "根据当前主旋律音符（SV 当前组）和伴奏音频的调性，生成和声部并写入新的和声组轨道。流程：①读 SV 当前组主旋律音符 ②分析伴奏 WAV 的调性（纯 JS Krumhansl）③生成和声（三 六度等，调内校正）④桥脚本创建和声组。需 SV 在线（读主旋律 / 写和声组走**文件通道桥**）；伴奏分析本地",
    {
      accompaniment: z.string().optional().describe("伴奏 WAV 路径（用于调性检测；省略则用主旋律音符自动检测调性）"),
      direction: z.enum(["up", "down"]).optional().describe("和声方向（默认 up）"),
      interval: z.enum(["3rd", "6th", "5th", "4th", "2nd", "7th", "1st"]).optional().describe("和声音程（默认 3rd）"),
      avoidDissonance: z.boolean().optional().describe("是否避让不协和音（默认 true）"),
      keyRoot: z.number().optional().describe("调性根音（0-11，C=0）——来自 sv_generate_melody 的 keyRoot，与旋律同调协同；省略则用伴奏分析或旋律检"),
      groupName: z.string().optional().describe("和声组名称（默认 Harmony）"),
      target: z.enum(["auto", "main", "new"]).optional().describe("写哪里：**auto**（默认）＝SV1 写主组、SV2/IX 新建组；**main**＝强制写主组（仅 SV1；SV2/IX 会直接报错，因为主组不能 addNote）；**new**＝强制新建具名组（带同名幂等替换）"),
      allowAppend: z.boolean().optional().describe("主组里**已有音符**时是否允许追加（默认 false）⇒ false 时**不写任何东西**，只返回 `{needConfirm:true, existingNoteCount, endQuarter, hint}`，让调用方先问用户（追加到末尾 / 从指定小节起 / 还是新建组），确认后再带 true 重调"),
      ...HOST_SCHEMA,
    },
    async ({ accompaniment, direction, interval, avoidDissonance, keyRoot, groupName, target, allowAppend, host }) => {
      const start = Date.now();
      try {
        // 1. 读主旋律
        const melodyRes = (await executeOp("get_melody_notes", { host }, { timeoutMs: 8000, intervalMs: 150 })) as {
          current?: boolean;
          notes?: { pitch: number; onsetBlicks: number; durationBlicks: number; lyrics?: string }[];
        };
        const notes = melodyRes.notes || [];
        if (!melodyRes.current || notes.length === 0) {
          return textResult({ ok: false, error: "当前组没有音符，请先在 SV 中打开包含主旋律的音符组" });
        }

        // 2. 调性：优先伴奏分析，否则用主旋律检         
let keyName = "";
        if (accompaniment) {
          const analysis = await analyzeAudio(accompaniment, 0, undefined);
          keyName = analysis.key || "";
        }

        // 3. 生成和声
        const directionNum = direction === "down" ? -1 : 1;
        const intervalMap: Record<string, number> = {
          "3rd": 2, "6th": 5, "5th": 4, "4th": 3, "2nd": 1, "7th": 6, "1st": 0,
        };
        const harmonyNotes = generateHarmony(
          notes.map((n) => ({ pitch: n.pitch, onset: n.onsetBlicks, duration: n.durationBlicks, lyrics: n.lyrics })),
          {
            direction: directionNum as 1 | -1,
            interval: intervalMap[interval ?? "3rd"],
            avoidDissonance: avoidDissonance ?? true,
            // 协同：优先用外部传入 keyRoot（来自生成旋律），其次由 harmony 内部 detectKey
            keyRoot,
          }
        );

        // 4. 写入 SV 和声         
const writeRes = await executeOp("create_harmony_group", {
          notes: harmonyNotes.map((n) => ({
            pitch: n.pitch,
            onsetBlicks: n.onset,
            durationBlicks: n.duration,
            lyrics: n.lyrics,
          })),
          groupName: groupName || "Harmony",
          target,
          allowAppend,
          host,
        }, { timeoutMs: 8000, intervalMs: 150 });

        const melodyKey = detectKey(notes.map((n) => n.pitch));
        return textResult({
          ok: true,
          melodyNoteCount: notes.length,
          detectedKey: keyName || `auto-${melodyKey}`,
          harmonyNoteCount: harmonyNotes.length,
          written: writeRes,
          sample: harmonyNotes.slice(0, 5).map((n) => ({ pitch: n.pitch, intervalSteps: n.intervalSteps })),
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 通用 SV 脚本执行（agent  sv-scripting skill 文档现场写脚本）
  server.tool(
    "sv_run_script",
    "在 Synthesizer V / Instrument X 内执行一段 **Lua** 脚本（桥是 Lua 桥，run_script op 用 load 执行）。脚本应为函数体（支持 return 返回值），可使用宿主全局对象（SV:getProject / SV:getMainEditor 等）与注入的 scope 变量。⚠️ Lua 绑定与 JS 不同：① 方法用**冒号**调用（SV:getProject()）；② 索引**从 1 起**（getNote(1) 是第一个音符，getIndexInParent() 同样 1 起）。安全要求：写操作必须调用 SV:getProject():newUndoRecord()（先建撤销点）；只读查询传 readonly:true。技能文档（sv-scripting 等）里的示例多为 **JS** 写法（SV.getProject()、索引 0 起），抄用前请按上面两条改写。示例：'local p = SV:getProject(); p:newUndoRecord(); local g = SV:getMainEditor():getCurrentGroup():getTarget(); g:getNote(1):setPitch(72); return { ok = true }'",
    {
      code: z.string().describe("Lua 脚本函数体（冒号调用、索引 1 起；支持 return）"),
      readonly: z.boolean().optional().describe("只读查询 true（跳 newUndoRecord 要求）；写操作必须省略并 code 里含 newUndoRecord()"),
      scope: z.record(z.string(), z.unknown()).optional().describe("注入到脚本作用域的变量（ {selectedNotes: [...]}）"),
      host: z.enum(["sv", "ix"]).optional().describe("目标宿主：sv=Synthesizer V Studio（默认，自动探测），ix=Instrument X"),
    },
    async ({ code, readonly, scope, host }) => {
      const start = Date.now();
      try {
        const res = await executeOp("run_script", { code, scope, readonly, host }, { timeoutMs: 10000, intervalMs: 150 });
        return textResult({ ok: true, result: res, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 音频轨对齐： BPM + 第一拍偏移， SV 内音频轨移到锚点（小节线  已有音符   
server.tool(
    "sv_align_audio",
    "测音频 BPM 与第一拍偏移，并把 Synthesizer V 内音频轨（instrumental 轨）移动到锚点，使音频节拍对齐。anchor='measure'（默认）对齐到第 measure 小节起点；anchor='note' 对齐到当前组第一个音符的 onset。前奏处理： introBeats（拍数） introSec（秒）让前奏铺在音符之前。两段式微调：先 anchor='measure' 对齐到第 1 小节，用户听出第一拍与小节线差几拍后，再用 shiftBeats 微调。位置用【绝 onset】表达（音频轨起 blick），不依 time offset。流程：①本地分析伴奏 WAV  BPM  firstBeatSec（第一拍在音频内的秒数）②桥脚本找到音频轨、用 setTimeRange(onset,duration) 设绝 onset 使第一拍落到锚点（可选同时设 tempo mark 匹配 BPM）。需 SV 在线；伴奏分析本地。输入需 WAV",
    {
      input: z.string().describe("伴奏/音频 WAV 绝对路径（用来测第一拍偏移）"),
      bpm: z.number().optional().describe("指定 BPM（可选）：若自动检测的 BPM 有歧义（如 150 实际 120），用它重算第一拍偏移，避免对拍带偏"),
      anchor: z.enum(["measure", "note"]).optional().describe("对齐锚点：measure=对齐小节线（默认）；（note=对齐当前组第一个音 onset）"),
      measure: z.number().optional().describe("对齐到第几小节起点（1 起，默认 1；仅 anchor='measure' 用）"),
      introBeats: z.number().optional().describe("前奏拍数：前 N 拍铺在音符之前（ anchor='note'，有 BPM 时更准）"),
      introSec: z.number().optional().describe("前奏秒数：换算成拍铺在音符之前（ anchor='note' 且无 introBeats 时用）"),
      audioTrackIndex: z.number().optional().describe("音频轨所在的轨道索引（0 起）；（省略时自动找第一个 instrumental 轨）"),
      shiftBeats: z.number().optional().describe("在锚点基础上额外偏移的拍数（可正可负； measure/none 都有效。先对齐到小节线，用户听出第一拍差几拍时用它微调）"),
      setBpm: z.boolean().optional().describe("是否在锚点设 tempo mark 匹配 BPM（默认 false）"),
      ...HOST_SCHEMA,
    },
    async ({ input, bpm, anchor, measure, introBeats, introSec, shiftBeats, audioTrackIndex, setBpm, host }) => {
      const start = Date.now();
      try {
        // 1. 本地分析：测 BPM + 第一拍偏移（可指 bpm         
const analysis = await analyzeAudio(input, 0, undefined, { bpm });
        if (!analysis.firstBeatSec || !analysis.bpm) {
          return textResult({
            ok: false,
            error: "未能检测到节拍（音频需至少 10 秒，且节拍清晰）。可先用 sv_analyze_audio 检查",
            bpm: analysis.bpm,
            firstBeatSec: analysis.firstBeatSec,
            elapsedMs: Date.now() - start,
          });
        }
        // 2. 桥脚本移动音频轨对齐
        const alignRes = await executeOp("align_audio", {
          firstBeatSec: analysis.firstBeatSec,
          bpm: setBpm ? analysis.bpm : undefined,
          anchor,
          measure,
          introBeats,
          introSec,
          shiftBeats,
          audioTrackIndex,
          host,
        }, { timeoutMs: 10000, intervalMs: 150 });

        return textResult({
          ok: true,
          bpm: analysis.bpm,
          firstBeatSec: analysis.firstBeatSec,
          align: alignRes,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 浮动 BPM 打标：按 BeatTracker 拍序列逐段 tempo mark（小节线贴合 BPM 浮动   
server.tool(
    "sv_apply_tempo",
    "按音频的实际浮动 BPM 在 Synthesizer V 工程 TimeAxis 上逐段 tempo 标，使小节线贴合音频（适合 BPM 浮动 120-122 的伴奏）。流程：①本 BeatTracker 测每拍时间戳，按 segmentBeats 拍（默认一小节）算局 BPM ②桥脚本逐段 addTempoMark（可选先清旧标）。适合：用户在 SV 新建空白工程 + 拖入伴奏后调用，让后续加的音符合上浮动拍点。输入需 WAV",
    {
      input: z.string().describe("伴奏/音频 WAV 绝对路径（用来测逐拍时间戳）"),
      bpm: z.number().optional().describe("指定 BPM（可选）：若自动检测的 BPM 有歧义，用它重算逐拍时间戳（beatTrack 按指 bpm 打拍），避免小节线被错误 BPM 带偏"),
      segmentBeats: z.number().optional().describe("每段拍数（默认 4 = 一小节）"),
      beatOffsetSec: z.number().optional().describe("第一拍锚定到工程的秒数（即第 N 小节起点对应的秒；默认用音频第一拍偏 firstBeatSec）。第 1 小节留空 前奏留空时长"),
      measureStart: z.number().optional().describe("从第几小节开始正式排拍（默认 2；第 1 小节留空）"),
      clearExisting: z.boolean().optional().describe("是否先清除现 tempo mark（默认 false）"),
      ...HOST_SCHEMA,
    },
    async ({ input, bpm, segmentBeats, beatOffsetSec, measureStart, clearExisting, host }) => {
      const start = Date.now();
      try {
        // 1. 本地分析：拿每拍时间戳（可指 bpm         
const analysis = await analyzeAudio(input, 0, undefined, { bpm });
        const ticks = analysis.beatTicks;
        if (!ticks || ticks.length < 4) {
          return textResult({
            ok: false,
            error: "未能检测到足够节拍（音频需至少 10 秒且节拍清晰）",
            beatTicks: ticks,
            elapsedMs: Date.now() - start,
          });
        }
        // 2. 算浮 BPM 分段。基准时 = measureStart 小节起点对应的秒数         //    若给 firstBeatSec（第一拍偏移），基 = 第一拍所在位置         //    measureStart（默 2）： N 小节起点留空，第 N 小节起排拍         //    简化：beatOffsetSec 直接  2 小节起点的秒   前奏留空时长）         
const offsetSec = beatOffsetSec ?? analysis.firstBeatSec ?? 0;
        const marks = computeTempoMarks(ticks, offsetSec, segmentBeats ?? 4);
        if (marks.length === 0) {
          return textResult({ ok: false, error: "无法从节拍序列计 tempo 分段", elapsedMs: Date.now() - start });
        }
        // 3. 桥打标（seconds 由桥 getBlickFromSeconds 换算         
const alignTempoRes = await executeOp("apply_tempo", {
          tempoMarks: marks.map((m) => ({ seconds: m.seconds, bpm: m.bpm })),
          clearExisting: !!clearExisting,
          host,
        }, { timeoutMs: 10000, intervalMs: 150 });

        return textResult({
          ok: true,
          segmentBeats: segmentBeats ?? 4,
          beatOffsetSec: offsetSec,
          segmentCount: marks.length,
          bpmRange: (() => { const b = marks.map((m) => m.bpm); return b.length ? { min: Math.min(...b), max: Math.max(...b) } : null; })(),
          tempo: alignTempoRes,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // ── 声库风格移植（flat  nofs JSON，纯本地文件操作，无需 SV 在线 ──
  server.tool(
    "sv_list_voice_styles",
    "列出 flat 版全部声库， vocoder 分组（refresh 自动忽略）。每组列出声库名与各自的 styles 名称。用于找 vocoder 声库之间的风格移植目标",
    {},
    async () => textResult(listByVocoder())
  );

  server.tool(
    "sv_list_voice_styles_detail",
    "列出指定声库 styles 详情（名 + data 摘要 + 长度）。用 voice 指定声库目录名， 'POPY AI'",
    { voice: z.string().describe("声库目录名， 'POPY AI' / 'ROSE AI'") },
    async ({ voice }) => textResult(listStyles(voice))
  );

  server.tool(
    "sv_combine_voice_styles",
    "把源声库的指 styles 复制到目标声库（同 vocoder 才能移植；refresh 忽略）。styleNames 用源声库 style 名称（如 'Powerful','Mellow'）；renameAs 可选，把新 style 改名（如 {Powerful:'popy-powerful'}）避免混淆。写前自动备 .bak",
    {
      targetVoice: z.string().describe("目标声库目录名（要把 styles 加进去的）， 'ROSE AI'"),
      sourceVoice: z.string().describe("源声库目录名（提 styles 的），如 'POPY AI'"),
      styleNames: z.array(z.string()).describe("要复制的 style 名称列表，如 ['Powerful','Mellow']"),
      renameAs: z.record(z.string(), z.string()).optional().describe("可选： style 改名映射，如 {Powerful:'popy-powerful'}"),
    },
    async ({ targetVoice, sourceVoice, styleNames, renameAs }) =>
      textResult(combineStyles(targetVoice, sourceVoice, styleNames, renameAs))
  );

  server.tool(
    "sv_style_create",
    "在目标声库新建一 style。name 必填；data 来源二选一：baseOnVoiceStyle（如 'POPY AI/Powerful' 复制 data，需 vocoder）或 random:true（随机生 32 个浮点数向量，范围 -0.2~0.2）。可 adjust 微调浮点数：{index: 单个下标}  {count: 随机 N 个}，amplitude 为增量幅度（默认 0.01）。data 编码 = 256 大写 hex = 32  float32。写前自动备 .bak",
    {
      targetVoice: z.string().describe("目标声库目录名， 'ROSE AI'"),
      name: z.string().describe(" style 名称，如 'Dreamy'"),
      baseOnVoiceStyle: z.string().optional().describe("复制来源 声库 style ，如 'POPY AI/Powerful'"),
      random: z.boolean().optional().describe("true = 随机生成 data（与 baseOnVoiceStyle 二选一）"),
      adjust: z.object({
        index: z.number().int().min(0).optional().describe("只微调第 N 个浮点数（0~31）"),
        count: z.number().int().min(1).optional().describe("随机微调 N 个浮点数（省 = 全部 32 个）"),
        amplitude: z.number().min(0.0001).optional().describe("微调增量幅度（默认 0.01）"),
      }).optional().describe("微调浮点数参"),
    },
    async ({ targetVoice, name, baseOnVoiceStyle, random, adjust }) =>
      textResult(createStyle(targetVoice, name, { baseOnVoiceStyle, random, adjust }))
  );

  server.tool(
    "sv_style_adjust",
    "调整已有 style 的浮点数向量（data = 32 个 float32）。index 指定微调单个下标（0~31）；省略则随机微调 count 个（默认全部）。amplitude 为增量幅度（默认 0.01）。写前自动备 .bak",
    {
      targetVoice: z.string().describe("声库目录名， 'ROSE AI'"),
      styleName: z.string().describe("要调整的 style 名称"),
      index: z.number().int().min(0).optional().describe("只微调第 N 个浮点数（0~31）"),
      count: z.number().int().min(1).optional().describe("随机微调 N 个（省略 = 全部）"),
      amplitude: z.number().min(0.0001).optional().describe("增量幅度（默认 0.01）"),
    },
    async ({ targetVoice, styleName, index, count, amplitude }) =>
      textResult(adjustStyle(targetVoice, styleName, { index, count, amplitude }))
  );

  // 音频和弦估计（纯音频 chroma 模板匹配，无 MIDI   
server.tool(
    "sv_analyze_chord",
    "估计音频文件（WAV）的和弦：直接从波形算 chroma（12 音级能量曲线），再与和弦模板（大 小三/七和弦等）匹配打分。纯音频、无 MIDI、无需音符提取。返回最优候选（ root/quality/score）与 chroma 向量。适合伴奏/和弦清晰的音频；纯干声（单旋律无伴奏）和弦判定意义有限。输入需 WAV（可 sv_convert_audio  sv_separate_vocals 预处理）。可选时间窗口",
    {
      input: z.string().describe("输入 WAV 文件绝对路径"),
      startSec: z.number().optional().describe("起始秒（默认 0）"),
      endSec: z.number().optional().describe("结束秒（默认文件末尾）"),
      maxCandidates: z.number().int().min(1).max(5).optional().describe("返回候选数（默认 1）"),
    },
    async ({ input, startSec, endSec, maxCandidates }) => {
      const start = Date.now();
      try {
        //  WAV mono（复 analyze 的读取逻辑         
const { readMonoFromWav } = await import("./audio/analyze.js");
        const { signal, sr } = readMonoFromWav(input, startSec ?? 0, endSec);
        const ch = chromaDsp(signal, sr);
        const cands = detectChord(ch, maxCandidates ?? 1);
        return textResult({
          ok: true,
          chord: cands[0]?.name,
          candidates: cands,
          chroma: Array.from(ch).map((x) => Math.round(x * 1000) / 1000),
          durationSec: Math.round((signal.length / sr) * 10) / 10,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 和弦序列提取并写 SV/IX 工程（和弦伴奏音符轨   
server.tool(
    "sv_write_chords",
    "分析音频的和弦随时间变化，把和弦拆成实际音符写入当前宿主工程的和弦伴奏音符轨（可播放）。流程：①本地分析伴奏 WAV 得调性/BPM ②逐段（默认一小节）提取和弦序列（互相关模板评 + 调性校正）③用 chordsToNotes 把每个和弦成柱式/琶音音符 ④桥脚本 create NoteGroup+音符 写入目标轨道。位置用绝对 blick onset，ref offset  0。适合：把一首歌的和弦铺进工程，供人 旋律叠唱或伴奏参考。注意：带人声混音的 chroma 判定不准，建议用纯伴奏 WAV；和弦为参考级非转录级",
    {
      input: z.string().describe("伴奏/音频 WAV 绝对路径（用来提和弦序列）"),
      bpm: z.number().optional().describe("指定 BPM（默认 120）；检测有歧义时用"),
      keyRoot: z.number().optional().describe("调性根音（0-11，C=0，F=5）。省略则用伴奏分"),
      keyMode: z.enum(["major", "minor"]).optional().describe("调性大小调（默认 major）"),
      segBeats: z.number().optional().describe("每段拍数（默认 4 = 一小节）"),
      pattern: z.enum(["block", "broken", "arpeggio"]).optional().describe("琶音模式：block 柱式（默认）/ broken 分解 / arpeggio 琶音"),
      articulations: z.array(z.string()).optional().describe("🆕 统一给本次写入的**所有**和弦音符设同一组技法（IX；如 ['Pizz.']）。和弦音符在**桥端**由 chordSegs 展开 ⇒ 本工具在写完后用返回的组名**再补一次** `setArticulations`（不需要改桥）。写入前按实测全局互斥图做组内自洽化；⚠️ 只解自相冲突，**支不支持读不出来**⇒ 写入成功 ≠ 可用"),
      groupName: z.string().optional().describe("和弦音符组名（默认 Chords；target=\"main\" 时忽略）"),
      target: z.enum(["auto", "main", "new"]).optional().describe("写哪里：**auto**（默认）＝SV1 写主组、SV2/IX 新建组；**main**＝强制写主组（仅 SV1；SV2/IX 会直接报错，因为主组不能 addNote）；**new**＝强制新建具名组（带同名幂等替换）"),
      allowAppend: z.boolean().optional().describe("主组里**已有音符**时是否允许追加（默认 false）⇒ false 时**不写任何东西**，只返回 `{needConfirm:true, existingNoteCount, endQuarter, hint}`，让调用方先问用户（追加到末尾 / 从指定小节起 / 还是新建组），确认后再带 true 重调"),
      trackIndex: z.number().optional().describe("目标轨道索引（0 起）；（省略时自动选第一个非音频轨）"),
      startMeasure: z.number().optional().describe("从第几小节开始写（默认 1；用于跳过前奏空置）"),
      ...HOST_SCHEMA,
    },
    async ({ input, bpm, keyRoot, keyMode, segBeats, pattern, groupName, trackIndex, startMeasure, host, articulations, target, allowAppend }) => {
      const start = Date.now();
      try {
        // 1. 本地分析：调性（必要时）+ BPM
        const analysis = await analyzeAudio(input, 0, undefined, { bpm });
        const effBpm = analysis.bpm ?? bpm ?? 120;
        // 调性根音：keyRoot 显式 > 分析结果
        const keyPc = keyRoot !== undefined
          ? ((keyRoot % 12) + 12) % 12
          : analysis.key ? keyToPc(analysis.key) : -1;
        const mode = keyMode ?? (analysis.key?.toLowerCase().includes("minor") ? "minor" : "major");

        // 2. 提取和弦序列
        const track = await extractChordTrack(input, {
          bpm: effBpm,
          keyRoot: keyPc,
          keyMode: mode as "major" | "minor",
          segBeats: segBeats ?? 4,
          introSec: 0,
        });

        // 3. 转音符；可选跳过前奏（startMeasure 1 起）
        const startBlickOffset = startMeasure && startMeasure > 1
          ? (startMeasure - 1) * 4 * 705600000
          : 0;
        const segs = track.segs.map((s) => ({
          name: s.name,
          startBlick: Math.max(0, s.startBlick - startBlickOffset),
          durationBlick: s.durationBlick,
        })).filter((s) => s.startBlick >= 0);
        // 本地算音符（校验用；不随载荷发送，避免请求载荷超长）
        const notesPreview = chordsToNotes(segs, { pattern: pattern ?? "block", octaveShift: -12 });

        // 4. 写入工程：只传短的和弦序列（chordSegs），音符展开在桥端完成（避免大载 ENAMETOOLONG         
const writeRes = await executeOp("write_chords", {
          chordSegs: segs.map((s) => ({ name: s.name, startBlick: s.startBlick, durationBlick: s.durationBlick })),
          pattern: pattern ?? "block",
          octaveShift: -12,
          groupName: groupName || "Chords",
          trackIndex,
          target,
          allowAppend,
          host,
        }, { timeoutMs: 10000, intervalMs: 150 });

        // 🆕 2026-09-25：主组非空且未 allowAppend ⇒ 桥返回 needConfirm（**没写任何东西**）
        //   ⇒ 直接把"先问用户"透传出去，别继续走后面的技法补写（那会去找一个并不存在的新组）
        const needConfirm = (writeRes as { needConfirm?: boolean } | null)?.needConfirm === true;
        if (needConfirm) {
          return textResult({ ok: false, needConfirm: true, target: "main",
            existingNoteCount: (writeRes as { existingNoteCount?: number }).existingNoteCount,
            endQuarter: (writeRes as { endQuarter?: number }).endQuarter,
            hint: (writeRes as { hint?: string }).hint,
            key: track.key, bpm: track.bpm, noteCount: notesPreview.length,
            elapsedMs: Date.now() - start });
        }

        // 5. 统一技法（可选）：chordSegs 在桥端展开 ⇒ 拿不到逐音载荷；等组建完，用回包里的组名补一次 setArticulations
        const uniArts = resolveUniformArticulations(articulations);
        let artsApplied: Record<string, unknown> | null = uniArts.report;
        if (uniArts.used.length > 0) {
          const gName = (writeRes as { groupName?: string } | null)?.groupName;
          if (!gName) {
            artsApplied = { ...(uniArts.report as object), applied: null, warning: "写入回包没有 groupName ⇒ 定位不到新组，技法**没写**" };
          } else {
            const raw = await executeOp("run_script", { code: applyToGroupCode(gName, uniArts.used), host }, { timeoutMs: 20000, intervalMs: 150 });
            const res = unwrapResult<{ ok?: boolean; group?: string; noteCount?: number; written?: number; empty?: number; sample?: string; err?: string }>(raw);
            artsApplied = {
              ...(uniArts.report as object),
              applied: res,
              warning: !res || !res.ok
                ? "技法补写失败（组「" + gName + "」）：" + JSON.stringify(raw).slice(0, 200)
                : (res.empty ? `${res.empty}/${res.noteCount} 个音符回读为空（该轨不支持或互斥被宿主回滚）⇒ 技法没进去` : undefined),
            };
          }
        }

        return textResult({
          ok: true,
          key: track.key,
          bpm: track.bpm,
          pattern: pattern ?? "block",
          segCount: track.segs.length,
          noteCount: notesPreview.length,
          segs: track.segs.map((s) => ({ name: s.name, startSec: s.startSec, durationSec: s.durationSec })),
          articulations: artsApplied,
          written: writeRes,
          elapsedMs: Date.now() - start,
        });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 织体生成（IX 为主）—— P7；规范 skills/sv-texture/SKILL.md + docs/待办.md P7
  server.tool(
    "sv_write_texture",
    "按乐器铺织体（伴奏型）到当前宿主，主要给 IX 用，SV 侧同样可写。**和弦来源三种**：① notes（默认）＝从工程内音符按小节推和弦（与 IX 侧边栏「旋律和弦生成」同口径，复用 detectChord/detectKeyKrumhansl）② progression＝显式和弦进行（用户直接给）③ audio＝分析音频 WAV（走与 sv_write_chords 同一套扒带链路，需 audioPath）。**织体两种路子**：① imitate＝**用户写好的首小节作模板**，按每个目标小节的和弦重建（序位+八度映射，非和弦音吸附到和弦内；算法照搬已实测的 IX 侧边栏 TextureGen）② 具名织体 block/broken/arpeggio（复用 chordsToNotes）/ sustain/counter（简单版）/ ostinato/riff（与 imitate 同一条映射，**模板允许多个小节**，按周期循环）。**乐器**决定音域与硬约束：管乐自动留气口（每 2 小节组尾 ≥0.5 拍）、弦乐每 3 小节做一次换弓镜像，`applied` 里如实回报动了什么。**写入规则**：IX 的 main 组不能 addNote ⇒ 一律新建组（名字默认 `<乐器>-<织体>`，同名幂等替换）。⚠️ 未收录乐器会返回支持清单；v1 不做 riff 加花与对位旋律线，会降级并如实告知（别当成已覆盖）",
    {
      instrument: z.string().describe("乐器（中/英/别名）：小提琴/violin · 中提琴/viola · 大提琴/cello · 低音提琴/double bass · 弦乐群/strings · 长笛/flute · 双簧管/oboe · 单簧管/clarinet · 巴松/bassoon · 萨克斯/sax · 小号/trumpet · 圆号/horn · 长号/trombone/大号/tuba"),
      texture: z.enum(["imitate", "block", "broken", "arpeggio", "sustain", "ostinato", "riff", "counter"]).optional().describe("织体型；imitate＝按模板首小节模仿（默认）。block 柱式 · broken 分解 · arpeggio 琶音 · sustain 长音铺底 · counter 低音走句 · ostinato/riff＝模板取第 1 小节循环"),
      section: z.enum(["intro", "verse", "pre", "chorus", "bridge", "outro"]).optional().describe("段落（用户指定）⇒ 参与推荐排序"),
      chordSource: z.enum(["notes", "progression", "audio"]).optional().describe("和弦来源：notes＝工程内音符（默认）／progression＝显式进行／audio＝分析音频 WAV（走与 sv_write_chords 同一套扒带链路）"),
      progression: z.array(z.string()).optional().describe("和弦进行（chordSource=progression 时用），逐小节循环，如 ['C','G','Am','F']"),
      audioPath: z.string().optional().describe("伴奏/音频 WAV 绝对路径（chordSource=audio 时必填；建议纯伴奏）"),
      templateBars: z.number().optional().describe("模板取当前组的前几小节（默认 1）"),
      templateNotes: z.array(z.object({ pitch: z.number(), onsetBlick: z.number(), durationBlick: z.number() })).optional().describe("显式模板音符（绝对 blick）；给了就用它当模板，不依赖宿主选区"),
      rangeStartBar: z.number().optional().describe("生成范围起始小节（1 起；默认=第一个有和弦的小节）"),
      rangeEndBar: z.number().optional().describe("生成范围结束小节（1 起，含；默认=最后一个有和弦的小节）"),
      segBeats: z.number().optional().describe("和弦窗口拍数（默认=一小节；2＝两拍一和弦）"),
      beatsPerMeasure: z.number().optional().describe("每小节拍数（默认 4）"),
      bpm: z.number().optional().describe("BPM（仅 chordSource=audio 用；检测有歧义时显式给）"),
      keyRoot: z.number().optional().describe("调性根音 0-11（仅 audio；省略用分析结果）"),
      keyMode: z.enum(["major", "minor"]).optional().describe("调性大小调（仅 audio；默认 major）"),
      voicingShift: z.number().optional().describe("和弦转位：整体移动几个和弦内序位（±1 = 上/下一个和弦音）"),
      octaveShift: z.number().optional().describe("整体八度平移（半音数，12 的倍数最常用）"),
      articulations: z.array(z.string()).optional().describe("🆕 统一给本次写入的**所有**音符设同一组技法（IX；如 ['Pizz.'] 或 ['Con Sordino','Tenuto']）。写入前按实测全局互斥图做**组内自洽化**（丢掉自相冲突/重复项并在回报里列出）；⚠️ 只解自相冲突，**支不支持读不出来**（IX API 读不到乐器）⇒ 写入成功 ≠ 可用。逐音精修仍请用 sv_apply_articulations"),
      applyInstrumentRules: z.boolean().optional().describe("是否套乐器硬约束（管乐气口 / 弦乐换弓 / 音域），默认 true"),
      breathBeats: z.number().optional().describe("管乐气口长度（拍，默认 0.5）"),
      groupName: z.string().optional().describe("新组名（默认 <乐器>-<织体>；target=\"main\" 时忽略）"),
      target: z.enum(["auto", "main", "new"]).optional().describe("写哪里：**auto**（默认）＝SV1 写主组、SV2/IX 新建组；**main**＝强制写主组（仅 SV1；SV2/IX 会直接报错，因为主组不能 addNote）；**new**＝强制新建具名组（带同名幂等替换）"),
      allowAppend: z.boolean().optional().describe("主组里**已有音符**时是否允许追加（默认 false）⇒ false 时**不写任何东西**，只返回 `{needConfirm:true, existingNoteCount, endQuarter, hint}`，让调用方先问用户（追加到末尾 / 从指定小节起 / 还是新建组），确认后再带 true 重调"),
      trackIndex: z.number().optional().describe("目标轨道索引（0 起）；省略自动选第一个非音频轨"),
      dryRun: z.boolean().optional().describe("只算不写：返回和弦、织体计划、音符预览与规则回报，不改工程"),
      ...HOST_SCHEMA,
    },
    async ({
      instrument, texture, section, chordSource, progression, audioPath, templateBars, templateNotes,
      rangeStartBar, rangeEndBar, segBeats, beatsPerMeasure, bpm, keyRoot, keyMode,
      voicingShift, octaveShift, applyInstrumentRules: applyRules, breathBeats,
      groupName, trackIndex, dryRun, host, articulations, target, allowAppend,
    }) => {
      const start = Date.now();
      try {
        // 0. 乐器：未收录 ⇒ 给支持清单 + 推荐（不猜）
        const inst = findInstrument(instrument);
        if (!inst) {
          return textResult({
            ok: false,
            error: `未收录乐器「${instrument}」`,
            supported: INSTRUMENTS.map((i) => ({ id: i.id, names: i.names, family: i.family, range: i.range })),
            hint: "把乐器名（中文或英文）给我，我按同表加一行；或从上面清单里选一个",
            elapsedMs: Date.now() - start,
          });
        }
        const suggestion = suggestTextures(instrument, section as Section | undefined);
        const useTexture = (texture ?? "imitate") as TextureType;

        // 1. 读音符（工程内）：模板与和弦都从这里来
        let groupNotes: { pitch: number; onsetBlick: number; durationBlick: number; lyrics?: string }[] = [];
        let groupNameRead: string | undefined;
        let timeOffset = 0;
        const needRead = chordSource !== "progression" || !templateNotes;
        if (needRead) {
          const read = await executeOp("get_melody_notes", host ? { host } : {}, { timeoutMs: 8000, intervalMs: 150 }) as {
            current?: boolean; groupName?: string; timeOffsetBlicks?: number;
            notes?: { pitch: number; onsetBlicks: number; durationBlicks: number; lyrics?: string }[];
          };
          timeOffset = read?.timeOffsetBlicks ?? 0;
          groupNameRead = read?.groupName;
          groupNotes = (read?.notes ?? []).map((n) => ({
            pitch: n.pitch, onsetBlick: timeOffset + n.onsetBlicks, durationBlick: n.durationBlicks, lyrics: n.lyrics,
          }));
        }

        // 2. 和弦分析（三条来源：工程内音符 / 显式进行 / 音频 WAV）
        const bpm4 = beatsPerMeasure ?? 4;
        let audioInfo: { key: string; bpm: number; segCount: number; introSec: number; carriedWindows?: number } | null = null;
        let analysis;
        if (chordSource === "progression") {
          analysis = analysisFromProgression(progression ?? [], {
            bars: rangeEndBar ?? Math.max(4, progression?.length ?? 4),
            beatsPerMeasure: bpm4,
          });
        } else if (chordSource === "audio") {
          if (!audioPath) throw new Error("chordSource=audio 需要 audioPath（伴奏 WAV 绝对路径）");
          // 先拿调性/BPM（与 sv_write_chords 同一步）：**不先做这步，扒带出来的 key 是空的、A# 也不会被校正成 Bb**
          const aA = await analyzeAudio(audioPath, 0, undefined, { bpm });
          const effBpm = aA.bpm ?? bpm ?? 120;
          const keyPc = keyRoot !== undefined
            ? ((keyRoot % 12) + 12) % 12
            : aA.key ? keyToPc(aA.key) : -1;
          const mode = keyMode ?? (aA.key?.toLowerCase().includes("minor") ? "minor" : "major");
          const track = await extractChordTrack(audioPath, {
            bpm: effBpm,
            keyRoot: keyPc,
            keyMode: mode as "major" | "minor",
            segBeats: segBeats ?? bpm4,
            introSec: 0,
          });
          analysis = analysisFromSegs(track.segs, { keyName: track.key || aA.key || "", beatsPerMeasure: bpm4 });
          audioInfo = {
            key: track.key, bpm: track.bpm, segCount: track.segs.length, introSec: track.introSec,
            carriedWindows: analysis.windows.filter((w) => w.carried).length,
          };
        } else {
          analysis = analyzeChordsFromNotes(groupNotes, {
            segBeats: segBeats ?? bpm4,
            beatsPerMeasure: bpm4,
            maxCandidates: 4,
          });
        }

        // 3. 模板：显式 templateNotes > 当前组前 templateBars 小节
        const bar = analysis.blickPerBar;
        let templateAb = null as ReturnType<typeof abstractTemplate> | null;
        if (useTexture === "imitate" || useTexture === "ostinato" || useTexture === "riff") {
          if (templateNotes && templateNotes.length > 0) {
            templateAb = abstractTemplate(templateNotes, analysis);
          } else if (groupNotes.length > 0) {
            const nBars = Math.max(1, Math.round(templateBars ?? 1));
            const firstBar = Math.min(...groupNotes.map((n) => Math.floor(n.onsetBlick / bar)));
            const tpl = groupNotes.filter((n) => {
              const b = Math.floor(n.onsetBlick / bar);
              return b >= firstBar && b < firstBar + nBars;
            });
            templateAb = abstractTemplate(tpl, analysis, {
              startBlick: firstBar * bar,
              endBlick: (firstBar + nBars) * bar,
            });
          }
        }

        // 4. 渲染 + 乐器硬约束
        const rendered = renderTexture(analysis, inst, useTexture, templateAb, {
          rangeStartBar, rangeEndBar, voicingShift, octaveShift,
        });
        const ruled = applyInstrumentRules(rendered.notes, inst, analysis, {
          breathBeats, apply: applyRules ?? true,
        });

        const chords = analysis.windows
          .filter((w) => w.name !== "-")
          .map((w) => ({ bar: w.bar, chord: w.name, score: w.score, alts: w.alternatives.slice(0, 2).map((a) => a.name) }));

        // 4.5 统一技法参数（可选）：组内自洽化后随逐音载荷一起写（桥的显式音符通道认 articulations）
        const uniArts = resolveUniformArticulations(articulations);

        const report = {
          ok: true,
          instrument: { id: inst.id, family: inst.family, range: inst.range, note: inst.note },
          suggestion,
          texture: { requested: useTexture, used: rendered.usedTexture, skeletonOnly: rendered.skeletonOnly },
          chordSource: chordSource ?? "notes",
          audio: audioInfo,
          key: analysis.key,
          readFrom: { group: groupNameRead, notes: groupNotes.length, timeOffsetBlicks: timeOffset },
          template: templateAb ? { bars: templateAb.numBars, voices: templateAb.voices.length, skipped: templateAb.skipped, templateBar: templateAb.templateBar } : null,
          range: rendered.range,
          chords,
          plan: {
            noteCount: rendered.notes.length,
            afterRules: ruled.notes.length,
            rulesApplied: ruled.applied,
            droppedOutOfRange: ruled.droppedOutOfRange,
            droppedByBreath: ruled.droppedByBreath,
            liftedIntoRange: ruled.liftedIntoRange ?? 0,
          },
          warnings: [...rendered.warnings, ...(ruled.droppedOutOfRange > 0 ? [`${ruled.droppedOutOfRange} 个音超出 ${inst.id} 音域 ${inst.range[0]}–${inst.range[1]} 被丢弃`] : []),
            ...(uniArts.report && uniArts.report.dropped.length > 0
              ? [`articulations 里 ${uniArts.report.dropped.length} 项因与已保留技法互斥/重复被剔除：` +
                 uniArts.report.dropped.map((d) => `${d.key}（与 ${d.conflictsWith.join("/")} 冲突）`).join("、")]
              : [])],
          articulations: uniArts.report,
          preview: ruled.notes.slice(0, 24).map((n) => ({ pitch: n.pitch, onsetQuarter: Math.round((n.onsetBlick / 705600000) * 1000) / 1000, durationQuarter: Math.round((n.durationBlick / 705600000) * 1000) / 1000 })),
          elapsedMs: Date.now() - start,
        };

        if (dryRun) return textResult({ ...report, dryRun: true });
        if (ruled.notes.length === 0) {
          return textResult({ ...report, ok: false, error: "算出来 0 个音符 ⇒ 不写工程（检查模板小节是否有和弦、范围是否为空、音域是否过窄）" });
        }

        // 5. 写入：复用 write_chords op 的显式音符通道（建 NoteGroup + 音符，timeOffset=0）
        const writeRes = await executeOp("write_chords", {
          notes: ruled.notes.map((n: TemplateNoteOut) => ({
            pitch: n.pitch,
            onsetBlicks: n.onsetBlick,
            durationBlicks: n.durationBlick,
            ...(n.lyrics ? { lyrics: n.lyrics } : {}),
            ...(n.dynamic !== undefined ? { dynamic: n.dynamic } : {}),
            ...(uniArts.used.length > 0 ? { articulations: uniArts.used } : {}),
          })),
          groupName: groupName || `${inst.id}-${rendered.usedTexture}`,
          trackIndex,
          target,
          allowAppend,
          host,
        }, { timeoutMs: 15000, intervalMs: 150 });

        const needConfirm = (writeRes as { needConfirm?: boolean } | null)?.needConfirm === true;
        if (needConfirm) {
          return textResult({ ok: false, needConfirm: true, target: "main", dryRun: false,
            existingNoteCount: (writeRes as { existingNoteCount?: number }).existingNoteCount,
            endQuarter: (writeRes as { endQuarter?: number }).endQuarter,
            hint: (writeRes as { hint?: string }).hint, elapsedMs: Date.now() - start });
        }
        return textResult({ ...report, written: writeRes, dryRun: false });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // IX 技法（articulations）自动标注 —— P20 路线 A；规范 skills/sv-ix/references/articulation-rules.md
  server.tool(
    "sv_apply_articulations",
    "按**旋律走向**自动标注 IX 技法（articulations），或做**段落级批量开关**。**默认 dry-run**（只出计划，不改工程）。" +
    "两条入口（可同时给）：① rules=true ⇒ 跑 **10 条走向规则**（句末长音 Tenuto / 大跳进入 Portamento / 乐句最高点 Accent / 句末回落 Fall / 同音重复 Tremolo / 两音交替 Trill / 同向级进 Slur / 短音连跑 Staccato / 萨克斯 Scoop·Doit），按 style 风格档调阈值；② segments=[\"beats=16-40,Pizz.\", \"phrases=1,3,Con Sordino\"] ⇒ 把某段音符统一设成一个技法（beats=A-B 用组内四分音符拍；phrases=1,3 按《旋律缺口》切句，缺口阈值 1 拍）。" +
    "**路线 A（用户 2026-09-21 定）**：只覆盖命中规则的**少数**音符，其余保持 articulationsFixed=false，继续交给宿主 **Smart Articulation**（它的决定读不出来，别以为我们接管了全部）。" +
    "**安全规则**：跳过已 articulationsFixed=true 的音符（除非 force）；只写该轨 `getSupportedArticulations()` 里有的键（不支持则退 rules 表里的 fallback，没退路就如实跳过）；互斥按实测**全局互斥图**消解（如 Pizz. 与 Arco/C. Legno 冲突）；族外规则（如萨克斯 Scoop）在该乐器上静默跳过；**只动技法**，不碰音高/时值/力度/歌词。" +
    "只用于 **Instrument X（IX）**（SV2 无技法）；**省略 host 默认走 ix**。写前自动 newUndoRecord()，写完**逐个回读**并报告回读为空的音符（回读空 = 没写进去，多为该轨不支持或互斥被宿主回滚）；可 Ctrl+Z 撤销。" +
    "⚠️ 风格档（style）五档阈值**已由用户 2026-09-21 定稿**（「阈值就这么定了」）⇒ 现行规范：Adagio/Allegro/con Fuoco/Pop/Ballade/(default)。",
    {
      group: z.string().optional().describe("目标音符组名（完全一致；省略=宿主当前组）"),
      rules: z.boolean().optional().describe("跑 10 条走向规则（建议开）"),
      segments: z.array(z.string()).optional().describe('段落级批量开关，元素形如 "beats=A-B,技法" 或 "phrases=1,3,技法"（技法名用宿主口径，如 Pizz. / Con Sordino / C. Legno / Bridge / Fingerb. / Stem / Straight / Cup）'),
      style: z.string().optional().describe("风格档：Adagio / Allegro / con Fuoco / Pop / Ballade / (default)；未知值回落 (default)。档位只影响阈值（minBeatsScale/leapSemitones/runCount/shortBeats），**五档数值已由用户 2026-09-21 定稿**（现行规范）"),
      force: z.boolean().optional().describe("连已有显式技法（articulationsFixed=true）的音符也改；默认 false=跳过它们"),
      dryRun: z.boolean().optional().describe("省略或 true=只出计划不写工程；false=真写入（写前 newUndoRecord，写完回读）"),
      ...HOST_SCHEMA,
    },
    async ({ group, rules, segments, style, force, dryRun, host }) =>
      serial(() => runArticulations({ group, rules, segments, style, force, dryRun, host })
        .then(textResult)
        .catch((e) => textResult({ ok: false, error: e instanceof Error ? e.message : String(e) }))),
  );

  // Pit（音高线）绘 — 规范 skills/sv-scripting/references/08-pit-drawing.md
  server.tool(
    "sv_write_pit",
    "绘制/改写音高线（Pit，即 SV 的 pitch 曲线）。🆕 **默认只改算出来的重音音符**（`plan` 省略 ⇒ `accent`：按重音检测挑命中的少数音符，其余保持 auto、零改动）—— 想把整段或整个选区都画满，必须**显式传 `plan:explicit`**（2026-09-22 用户重申的原始设想；此前默认是 explicit，曾在 462 音的真轨上把整条当目标）。按当前宿主自动分流：SV2 生成 PitchControlCurve 打点写入；SV1 改手动模式并 12 个音符属性。算法取 08-pit-drawing.md 的基准九段（音头/颤音/音尾/左右连接）并叠加方向修正层：音头过冲方向 = 旋律进行方向（上行→上、下行或同音→下），音尾按右过渡表（后音高→下、后音低或相同→上），dF0 为负则反向。参数默认从音符自身读取（SV2  ScriptData、SV1  attributes），取不到再 NoteGroupReference.getVoice()，最后才用脚本默认 — 所以常规使用无需 params。彩蛋：text 里含 C47 / C047 / 震撼哭腔（不强制带括号）时，全音符颤音幅度拉 2)+频率拉满(10)+开 。⚠️ **仅 IX**：目标里含**同 onset 音符（和弦/齐奏）**且走 curve 路线时，结果会带 `chordStarts`/`chordNotes`/`chordHint` 一条**如实警告**：本工具按**单声部骨架**画曲线（点值 = 全局轮廓 − 本音音高）⇒ 同 onset 的同伴音会被拉到骨架音高（真机实测同和弦两音 yAtOnset = 0 与 −4）⇒ **柱式和弦可能被压成同度**；且 IX 侧该处宿主实现是**暴力移植**、本身有 bug（已知缺陷 IX-005；具体情况与是否修未知）⇒ **和弦音高线不要当成已验证**。**只告知、不阻止**；要逐音精确控制就让 indices 只给一个。⛔ **这条只在 IX**：SV1 走 attr 路线（逐音符属性、无共享骨架）、SV2 的骨架是既定设计 ⇒ **二者都不提示**（用户口径：IX 的参数编辑限制不许外溢到 SV） ",
    {
      indices: z.array(z.number()).optional().describe("目标音符的组内下标（0 起）。省略则优先 SV 里选中的音符，否则全组；**这个范围同时是 accent 的评分域**（默认只在该范围内挑重音来写）"),
      mode: z.enum(["auto", "curve", "attr"]).optional().describe("落地方式：auto（默认，按宿主自动）／curve（SV2 打点）／attr（SV1 写属性）"),
      clear: z.enum(["all", "none"]).optional().describe("clear=all 先清掉全组旧曲线；默认只删**本音符自己那条**（靠曲线自带的 scriptData.akdagentNoteIndex 认领 ⇒ 和弦里同 onset 的音互不误删；旧版无标记的曲线仅在 onset 唯一时按锚点删）"),
      // ⚠️ 每个字段都写**单位 + 权威范围**（真源 = skills/sv-scripting/references/08-pit-drawing.md §2.1「参数取值范围」，
      //    由 tools/check-style-pit-table.cjs 校验）。2026-09-20 用户报「对 sv 部分参数上下限不敏感、写错数值量级」
      //    ⇒ 模型在工具层就得看得见量级，而不是去猜（此前这些字段**连 description 都没有**）。
      params: z.object({
        tF0Offset: z.number().optional().describe("音头提前量（秒）· 范围 −0.5 ~ 0.5 · 常用 −0.035"),
        tF0Left: z.number().optional().describe("左过渡时长（秒）· 范围 0.01 ~ 0.5 · 默认 0.07"),
        tF0Right: z.number().optional().describe("右过渡时长（秒）· 范围 0.01 ~ 0.5 · 默认 0.07"),
        dF0Left: z.number().optional().describe("音头深度（半音）· 范围 −6 ~ 6 · 默认 0.15 · ⚠️ 两代符号相反，实现会自动换算"),
        dF0Right: z.number().optional().describe("音尾深度（半音）· 范围 −6 ~ 6 · 默认 0.15"),
        tF0VbrStart: z.number().optional().describe("颤音起点（秒，相对音头）· 范围 0 ~ 1 · 默认按 k×时值算"),
        tF0VbrLeft: z.number().optional().describe("颤音渐入时长（秒）· 范围 0.02 ~ 0.5"),
        tF0VbrRight: z.number().optional().describe("颤音渐出时长（秒）· 范围 0.02 ~ 0.5"),
        dF0Vbr: z.number().optional().describe("颤音深度（半音）· 范围 0 ~ 2 · 默认 1（有效幅度 = 本值 × vibratoEnv）"),
        fF0Vbr: z.number().optional().describe("颤音频率（Hz）· UI 范围 1 ~ 10 · 默认 5.5。⚠️ **可有意超范围**（实测 55 可用，怒音靠它），但**数百量级会让宿主闪退**（见已知缺陷 SV-002）"),
        pF0Vbr: z.number().optional().describe("颤音相位（UI 归一化）· 范围 −1 ~ 1（对应相位 ±π）"),
      }).optional().describe("统一套用的参数覆盖（SV1 语义：dF0 走旋律方向、负=反向）。省略则逐音符从工程读取。⚠️ 各字段单位见上——**别把归一化值（±1）当单位值写**"),
      text: z.string().optional().describe("自然语言指令原文，用于识别彩蛋触发词 C47 / C047 / 震撼哭腔"),
      egg: z.boolean().optional().describe("直接强制彩蛋：全音符颤音幅度拉满+频率拉满+开 "),
      dryRun: z.boolean().optional().describe("只计算不写入（安全预览）：返回模式、每条曲线的点数/跨度/y 范围/onset 处取值，不改工程"),
      plan: z.enum(["explicit", "accent"]).optional().describe("**省略时的默认口径（2026-09-22 用户重申原始设想）**：给了 `indices` ⇒ `explicit`（按点名写）；没给 ⇒ **`accent`**（只写重音检测命中的少数音符，非重音位保持 auto、**零改动**）。`explicit`=把整个范围都写（要「整段画」必须显式传它）；`accent`=按 07 文档的重音检测挑（Top-N 比例默认 0.4，可用 accentTargetRatio 调）"),
      accentThreshold: z.number().optional().describe("绝对阈值（仅在 accentTargetRatio<=0 时生效；默认 2）"),
      accentTargetRatio: z.number().optional().describe("按目标比例取 Top-N 重音（默认 0.4 = 约 40% 音符）。比例法比绝对阈值更稳：分数是整数档，阈值很难精确命中某个占比；给 <=0 则退回绝对阈值模式"),
      graceRatio: z.number().optional().describe("'-' 音符并入前一单元的时值比例（默认 0.5 0.5 更宽松判倚音）"),
      midAmp: z.number().optional().describe("一般重音的下音头幅度（默认 1.5 半音）"),
      strongAmp: z.number().optional().describe("强重音的音头幅度（默认 2.5 半音）"),
      strongDelta: z.number().optional().describe("判定「强重音」需高出阈值的分差（默认 2）"),
      tailAmp: z.number().optional().describe("组尾（句尾）的上音尾幅度（默认 2 半音）"),
      accentGesture: z.enum(["melody", "down", "up"]).optional().describe("音头手势：melody（默认，过冲方向=旋律进行方向，按 §6.2 已确认规律）／down（一律下音头）／up（一律上音头）。注 SV1 语义 dF0 符号是「是否反向」，实现会自动换算成正确符号"),
      longNoteBeats: z.number().optional().describe("长音符判定（拍，默认 1.5）：影响评测加权与颤音起点"),
      longNoteWeight: z.number().optional().describe("长音符在重音评分里的权重（默认 2，原为 1；两档：≥longNoteBeats 与 ≥longNoteBeats×8/3 各加一份）"),
      vbrStartRatio: z.number().optional().describe("颤音起点总缩放（默认 1）"),
      vbrStartMax: z.number().optional().describe("颤音起点上限秒数（默认 1 = SV UI 上限）"),
      vbrKBase: z.number().optional().describe("颤音起点基准比例（默认 0.5 = 时值一半；短音符恒为 0 从头颤）"),
      vbrKTail: z.number().optional().describe("句尾长音收尾的调整量（默认 +0.15 → 更晚颤）"),
      vbrKStrong: z.number().optional().describe("强重音（情绪推进）的调整量（默认 0.15 → 略早颤）"),
      vbrKLong: z.number().optional().describe("超长音（≥2×longNoteBeats）的调整量（默认 +0.1 → 略晚颤）"),
      ...HOST_SCHEMA,
    },
    async ({ indices, mode, clear, params, text, egg, dryRun, host,
      plan, accentThreshold, graceRatio, midAmp, strongAmp, strongDelta, tailAmp, accentGesture,
      longNoteBeats, longNoteWeight, vbrStartRatio, vbrStartMax,
      vbrKBase, vbrKTail, vbrKStrong, vbrKLong, accentTargetRatio }) => {
      const start = Date.now();
      try {
        const opArgs: Record<string, unknown> = { indices, mode, clear, params, text, egg, dryRun, host,
          plan, accentThreshold, graceRatio, midAmp, strongAmp, strongDelta, tailAmp, accentGesture,
          longNoteBeats, longNoteWeight, vbrStartRatio, vbrStartMax,
          vbrKBase, vbrKTail, vbrKStrong, vbrKLong, accentTargetRatio };
        // 载荷预算（**历史**：旧剪贴板通道  UTF-16LE base64  PS -EncodedCommand  7× 膨胀；现役文件通道无此限）         //  Windows 命令行上 ~32767，故原始 JSON 需控制 ~4000 字符         
const payloadLen = JSON.stringify(opArgs).length;
        if (payloadLen > 4000) {
          throw new Error(
            `载荷过大（{payloadLen} 字符，上限约 4000）：请勿对大量音符传 params/perNote。` +
            `参数默认会从音符自身（SV2  ScriptData／SV1  attributes）读取，无需传输 — ` +
            `先用脚本 sv_run_script 把参数写到音符上，再只传 indices。`
          );
        }
        const res = await executeOp("write_pit", opArgs, { timeoutMs: 30000, intervalMs: 150 });
        return textResult({ ok: true, request: opArgs, written: res, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // MusicXML 乐谱 → 音符 → 导入 SV/IX 工程（P5：护栏整组 + tech/dynamics/instrument 映射复核后落地）
  server.tool(
    "sv_import_musicxml",
    "解析 MusicXML（.musicxml/.xml）乐谱成音符并写入目标轨道。**默认只读预览**（`dryRun:false` 才写）—— 先给文件 SHA-256、可选声部清单、音符/和弦/声部计数、一条有界预览与映射回报，你点头再写。" +
    "**护栏（P5，2026-09-21 落地）**：① 只收**绝对本地路径**（URL / 相对路径 / `.svp`·`.ixp` 一律拒）② 拒含 `<!DOCTYPE>`/`<!ENTITY>` 的 XML（外部实体面）③ **SHA-256 一致性**：预览后文件若被改过，写之前会拒 ④ 音符数上限 **512**，超限拒绝（不硬吞）" +
    "⑤ **权利确认**：写必须带 `confirmRights:true`（「网上搜得到」不等于授权）⑥ **源文件 tempo 只汇报、绝不自动套进工程**（真要套用走 `sv_apply_tempo`）⑦ **复调/和弦默认拒绝**（多 `<voice>` 混在一条时间线上会算错音位），确要导请显式 `allowPolyphony:true`。" +
    "**映射（复核后现行版）**：技法 ← `<articulations>`/`<technical>`/`<ornaments>`/tie·slur（⚠️ `<harmon-mute>`（铜管弱音器）→ **`Stem`**、`<harmonic>`（弦乐泛音）→ `Harmonics` —— 旧版把 harmon mute 当泛音是错的）；力度 ← note `velocity` > note 记号 > **小节级 `<dynamics>`/`<sound dynamics>` running state**（旧实现只读 note 级 ⇒ 力度记号从没生效）；乐器 ← `part-list/midi-instrument` 的 GM program。**未映射项（弓向 up-bow/down-bow · 空弦 · `<technical><stopped>` 等）如实回报、不猜**。",
    {
      input: z.string().describe("MusicXML 文件的**绝对本地路径**（.musicxml/.xml；URL 与相对路径会被拒）"),
      part: z.number().optional().describe("取第几个声部/part（1 起）；省略取第一个含音符 part"),
      groupName: z.string().optional().describe("音符组名（默认 Import）"),
      trackIndex: z.number().optional().describe("目标轨道索引（0 起）；（省略时自动选第一个非音频轨）"),
      lyrics: z.string().optional().describe("音符歌词填充（默认保 MusicXML 歌词；无歌词则用该词填充）"),
      dryRun: z.boolean().optional().describe("省略或 true = **只读预览不写工程**（护栏第 ⑤ 条）；false 才写入"),
      confirmRights: z.boolean().optional().describe("写操作必须显式确认**有权使用这份乐谱**（护栏第 ⑥ 条）；不带就不写"),
      allowPolyphony: z.boolean().optional().describe("该 part 含多个 `<voice>` 或和弦时：默认**拒绝**（会算错音位）；确要导请显式 true"),
      ...HOST_SCHEMA,
    },
    async ({ input, part, groupName, trackIndex, lyrics, dryRun, confirmRights, allowPolyphony, host }) =>
      serial(() => importMusicXml({ input, part, groupName, trackIndex, lyrics, dryRun, confirmRights, allowPolyphony, host })
        .then(textResult)
        .catch((e) => textResult({ ok: false, error: e instanceof Error ? e.message : String(e) }))),
  );

  // 装饰音（**拆音符**路线）—— 规范 skills/sv-scripting/references/07-melody-accent-pitch-params.md §1.7 / §1.8
  server.tool(
    "sv_apply_ornaments",
    "给音符加**装饰音**，一次一种、可套多个目标音符。**八型**：" +
    "① `graceFront` 前倚音（默认**下方**邻音挤入）· ③ `graceBack` 后倚音（音高取后一音）· `spikeUp` 向上尖尖（R&B 招牌）· `mordent` 波音（主-邻-主）· `turn` 回音（主-上邻-主-下邻-主）· ⑤ `tailRun` 音尾音阶行进（2~5 步递减）—— **这六个拆音符**；" +
    "④ `anticipate` 反向预备 · `slide` 滑音 —— 这两个**只写音符属性**（`dF0Left` / `tF0Left`），**仅 SV1**（SV2 的音高在曲线上，v1 未接）。" +
    "⚠️ **现行口径（用户 2026-09-23 真机裁定）**：**装饰音 = 拆分音符，SV2 同样拆音符、不画曲线**；**歌词规则** = 第一段承接原歌词、其余段一律 `-`；" +
    "**拆出来的新音符默认是「自动音高」**（一般够用）—— 要手动音高才传 `manual:true`（会 `setPitchAutoMode(false)`）。" +
    "**默认 `dryRun`**（只出切分计划、不碰工程）；真写要显式 `dryRun:false`（写前 `newUndoRecord()`，可 Ctrl+Z）。" +
    "音程默认**按风格档**（通俗系 1.5 / 民族·戏曲·美声·通用 2，见 `style`），持续时长不足（主音剩不下 `minMain`）时**如实报原因、不硬切**。",
    {
      ornament: z.enum(["graceFront", "graceBack", "spikeUp", "mordent", "turn", "tailRun", "anticipate", "slide"])
        .describe("装饰音类型（一次一种；要叠加两种就调两次）"),
      indices: z.array(z.number()).optional().describe("目标音符的组内下标（**0 起**）。省略 ⇒ 优先 SV 里选中的音符，否则全组"),
      interval: z.number().optional().describe("装饰音程（**半音，只给量、不带符号**；方向由 dir 决定）。省略 ⇒ 按 style 的风格档（通俗系 1.5 / 民族·戏曲·美声·通用 2）"),
      dir: z.enum(["above", "below"]).optional().describe("方向：above=上方 / below=下方。省略 ⇒ 各型默认（前倚音 below · 上尖 above · 波音 above · 音尾行进 below）"),
      len: z.number().optional().describe("装饰音时长（**拍**，四分音符 = 1）。省略 ⇒ 各型默认（前倚音/后倚音/波音/回音/行进 0.125 · 上尖 0.0625）"),
      headLen: z.number().optional().describe("波音/回音**首段本音**的长度（拍，默认 0.125）"),
      steps: z.number().optional().describe("音尾音阶行进的步数（**2~5**，默认 3；超出会夹到区间内）"),
      df: z.number().optional().describe("过渡处的 `dF0Left` 幅度（半音，默认 1.0；只对前倚音/上尖/反向预备有效）。SV1 语义：**正 = 走旋律方向**"),
      style: z.string().optional().describe("风格档，决定 interval 的默认：pop/通俗·rb·rap ⇒ 1.5；minzu/民族·xiqu/戏曲·bel/美声·general/通用 ⇒ 2"),
      manual: z.boolean().optional().describe("拆出来的**新音符**是否设手动音高（默认 false = 保持自动音高，用户 2026-09-23 口径：「一般够用」）"),
      dyn: z.boolean().optional().describe("是否**同时**配配套动态（默认 false）。按 07 §2.5 只给三种装饰配：前倚音/上尖 ⇒ 挖坑 · 后倚音 ⇒ 尾部渐弱 · 音尾行进 ⇒ 每步递减；波音/回音/反向预备/滑音**不配**。⚠️ 形状**闭合**（首尾回基线）—— 实测「自动化写一个点会把整组变成那个值」，所以必须先读基线再写闭合形状"),
      dynDepth: z.number().optional().describe("动态深度覆盖（默认：前倚音/上尖用发声 −0.25；后倚音用响度 −2 dB）。**默认值是拟的**，可覆盖"),
      dynStep: z.number().optional().describe("音尾行进的每步递减量（默认 −1.5 dB）"),
      dryRun: z.boolean().optional().describe("省略或 true = 只出计划（每段的起点/时长/音高/歌词/属性 + 动态计划与基线），**不碰工程**；false 才真写"),
      ...HOST_SCHEMA,
    },
    async ({ ornament, indices, interval, dir, len, headLen, steps, df, style, manual, dyn, dynDepth, dynStep, dryRun, host }) => {
      const start = Date.now();
      try {
        const opArgs: Record<string, unknown> = { ornament, indices, interval, dir, len, headLen, steps, df, style, manual, dyn, dynDepth, dynStep, dryRun, host };
        const res = await executeOp("apply_ornaments", opArgs, { timeoutMs: 30000, intervalMs: 150 });
        return textResult({ ok: true, request: opArgs, result: res, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );

  // 参数自动化（张力 / 响度 / 气声 / 发声 / 性别 / 颤音包络 / 音高偏移 / 声线）
  server.tool(
    "sv_write_automation",
    "写当前音符组的**参数自动化点**（`NoteGroup#getParameter` + `Automation#add`）。参数名（大小写不敏感）：`tension` 张力 · `loudness` 响度 · `breathiness` 气声 · `voicing` 发声 · `gender` 性别 · `vibratoEnv` 颤音包络 · `pitchDelta` 音高偏移 · `vocalMode_*` 声线。" +
    "**写前按取值域硬编码 clamp**（`loudness −48~12 dB` / `tension −1~1` / `breathiness −1~1` / `voicing 0~1` / `gender −1~1` / `vibratoEnv 0~2` / `pitchDelta ±1200 cents` / `vocalMode_* 0~150`），超出即夹到边界并在回包里标 `clamped`。" +
    "**回读只用单点采样**（`Automation#get(b)`）—— `getPoints`/`getAllPoints`/`getLinear`/`getDefinition`/`remove(index)` 在**已知缺陷清单（IX-001，调用即冻桥）**上，一律不调。" +
    "**默认 `dryRun`**（只出计划）；真写要显式 `dryRun:false`（写前 `newUndoRecord()`，可 Ctrl+Z）。",
    {
      parameter: z.string().describe("参数名（大小写不敏感）：tension / loudness / breathiness / voicing / gender / vibratoEnv / pitchDelta / vocalMode_*"),
      points: z.array(z.object({
        onsetQuarter: z.number().describe("位置（**拍**，四分音符 = 1；组内相对位置）"),
        value: z.number().describe("参数值（量纲见工具说明；超域会被 clamp）"),
      })).optional().describe("要写的点（至少一个；同位置重复会覆盖）。⚠️ **实测：写一个点会让该参数在整组变成那个值** ⇒ 做「局部」的形（坑/渐弱/递减）务必**闭合**（首尾回基线），并先用 `probe` 读基线"),
      probe: z.array(z.number()).optional().describe("**只读采样**（位置数组，单位拍）：走 `Automation#get` 单点采样，**不写工程、不建 undo**。用途：写局部形状前先读基线。给了 probe 就忽略 points"),
      dryRun: z.boolean().optional().describe("省略或 true = 只出计划（含 clamp 结果），**不碰工程**；false 才真写"),
      ...HOST_SCHEMA,
    },
    async ({ parameter, points, probe, dryRun, host }) => {
      const start = Date.now();
      try {
        const opArgs: Record<string, unknown> = { parameter, points, probe, dryRun, host };
        const res = await executeOp("set_automation", opArgs, { timeoutMs: 30000, intervalMs: 150 });
        return textResult({ ok: true, request: opArgs, result: res, elapsedMs: Date.now() - start });
      } catch (e) {
        return textResult({ ok: false, error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - start });
      }
    }
  );
}
