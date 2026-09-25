/**
 * `sv_apply_articulations` 的执行体（2026-09-21，P20/路线 A）
 *
 * 职责边界：**规则全在 `engine.ts`（与 `tools/apply-articulations.cjs` 共用）**，本文件只做宿主交互：
 *   ① 读（`run_script` readonly）：目标组的音符 + 该轨支持集
 *   ② 算：`plan()` —— 段落级批量开关 + 10 条走向规则
 *   ③ 写（默认不写）：`dryRun=false` 且**有明确写入目标**时才 `applyCode` 落盘，写完回读
 *
 * ⚠️ 纪律（用户 2026-09-21 定的路线 A）：
 *   · **默认 dry-run**，只覆盖命中规则的少数音符 ⇒ 其余音符保持 `articulationsFixed=false`，
 *     继续交给宿主 Smart Articulation（它的决定读不出来，别以为我们接管了全部）
 *   · 跳过 `articulationsFixed=true` 的音符（除非 force）—— 那是用户/别人已经手写过的
 *   · 互斥靠矩阵的**全局互斥图**消解；不支持/无退路的规则**如实跳过并报告**
 *   · 只动技法（`setArticulations`），不碰音高/时值/力度/歌词
 */
import { executeOp } from "../protocol.js";
import {
  applyCode, fetchGroupCode, loadArticulationData, plan, unwrapResult,
  type NoteLike, type PlanEntry, type PlanResult,
} from "./engine.js";

export * from "./engine.js";

export interface ArticulationsOptions {
  group?: string;
  style?: string;
  segments?: string[];
  rules?: boolean;
  force?: boolean;
  dryRun?: boolean;
  host?: "sv" | "ix";
  /** 单次宿主调用超时（ms），默认 20s（读整轨/整组元素多时留富余） */
  timeoutMs?: number;
}

interface ReadGroupResult {
  group?: string;
  noteCount?: number;
  supported?: string[];
  notes?: NoteLike[];
  err?: string;
}

interface ApplyResult {
  ok?: boolean;
  group?: string;
  err?: string;
  log?: { index: number; writeOk: boolean; readback: string; fixed: string }[];
}

/** 音符清单的返回上限（超长组只给头部，避免 MCP 回包过大） */
const NOTE_PREVIEW_CAP = 400;

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export async function runArticulations(opts: ArticulationsOptions): Promise<Record<string, unknown>> {
  const start = Date.now();
  // ⚠️ 技法（articulations）**只有 IX 有**（SV2 没有这套 API）⇒ 省略 host 时默认 ix，
  //    否则协议层会回落 "sv"，在这个工具上等于必然打到错的宿主。
  const host = opts.host ?? "ix";
  const timeoutMs = opts.timeoutMs ?? 20000;
  const { matrix, rules } = loadArticulationData();

  if (!opts.segments?.length && !opts.rules) {
    return {
      ok: false,
      error: "至少要给一个目标：segments（段落级批量开关）或 rules=true（走向规则）",
      hint: 'segments 例：["beats=16-40,Pizz."] 或 ["phrases=1,3,Con Sordino"]；rules 例：rules=true, style="Adagio"',
      styles: Object.keys(rules.styleTiers),
      elapsedMs: Date.now() - start,
    };
  }

  // ① 读：目标组音符 + 该轨支持集（readonly —— 只切当前轨/当前组，不改工程）
  const readRaw = await executeOp(
    "run_script",
    { code: fetchGroupCode(opts.group), readonly: true, host },
    { timeoutMs, intervalMs: 150 },
  );
  const data = unwrapResult<ReadGroupResult>(readRaw);
  if (!data || !data.notes) {
    return {
      ok: false,
      error: data?.err === "group not found"
        ? `找不到组「${opts.group}」（名字要完全一致；省略 group 则用宿主当前组）`
        : "读组失败：" + JSON.stringify(readRaw).slice(0, 300),
      elapsedMs: Date.now() - start,
    };
  }

  const notes = data.notes;
  const supported = data.supported || [];
  const supportedSet = new Set(supported);

  // ② 算
  const planned: PlanResult = plan({
    notes, matrix, rules, supported,
    style: opts.style, segments: opts.segments, wantRules: opts.rules, force: opts.force,
  });

  const skipped = planned.entries.filter((p) => p.skip);
  const fixedSkipped = skipped.filter((p) => (p.skip || "").startsWith("fixed")).length;
  const warnings: string[] = [];
  if (!planned.hasGap) warnings.push("组内无 ≥ " + ((rules.phraseSplit && rules.phraseSplit.minGapBeats) || 1) + " 拍的旋律缺口 ⇒ 不切乐句、乐句级规则（句末长音 / 高点 / 回落）一律不触发");
  if (supported.length === 0) warnings.push("该轨 `getSupportedArticulations()` 为空 ⇒ 任何技法都写不进去（先确认轨道已分配乐器）");
  if (fixedSkipped > 0) warnings.push(fixedSkipped + " 个音符已有显式技法（articulationsFixed=true）被跳过；要覆盖请传 force=true");
  if (planned.targets.length > 0) warnings.push("写完后这些音符的 articulationsFixed 会变 true ⇒ 宿主 Smart Articulation 不再自动决定它们");

  const report: Record<string, unknown> = {
    ok: planned.errors.length === 0,
    dryRun: opts.dryRun !== false,
    group: data.group ?? opts.group ?? "(当前组)",
    host: host ?? "自动探测",
    style: planned.style,
    tierKey: planned.tierKey,
    tier: planned.tier,
    supported,
    readFrom: { noteCount: data.noteCount ?? notes.length, supportedCount: supported.length },
    phrases: { count: planned.phraseCount, hasGap: planned.hasGap, by: rules.phraseSplit?.by, minGapBeats: rules.phraseSplit?.minGapBeats },
    notes: notes.slice(0, NOTE_PREVIEW_CAP).map((n) => ({
      index: n.index, onsetBeats: round3(n.onset / 705600000), durBeats: round3(n.dur / 705600000),
      pitch: n.pitch, phrase: n.phrase, fixed: n.fixed, arts: n.arts,
    })),
    notesTruncated: notes.length > NOTE_PREVIEW_CAP,
    plan: planned.entries,
    planSummary: {
      entries: planned.entries.length,
      toWrite: planned.targets.length,
      skipped: skipped.length,
      skipReasons: skipped.reduce<Record<string, number>>((acc, p) => {
        const k = (p.skip || "").split("（")[0];
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    },
    warnings,
    elapsedMs: Date.now() - start,
  };

  if (planned.errors.length > 0) {
    return { ...report, ok: false, error: planned.errors.join("；"), errors: planned.errors };
  }
  if (opts.dryRun !== false) {
    report.hint = "dry-run 未写工程。确认计划后传 dryRun=false 落盘（写前自动 newUndoRecord()，可 Ctrl+Z 撤销）";
    report.elapsedMs = Date.now() - start;
    return report;
  }
  if (planned.targets.length === 0) {
    return { ...report, ok: false, error: "没有任何音符需要写（全被跳过或规则未命中）⇒ 不改工程" };
  }

  // ③ 写：只写有 set 的目标；写完回读
  const targets = planned.targets.map((p: PlanEntry) => ({ index: p.index, set: p.set as string[] }));
  const applyRaw = await executeOp(
    "run_script",
    { code: applyCode(targets, opts.group), host },
    { timeoutMs, intervalMs: 150 },
  );
  const res = unwrapResult<ApplyResult>(applyRaw);
  if (!res || !res.ok) {
    return { ...report, ok: false, error: "写入失败：" + JSON.stringify(applyRaw).slice(0, 300) };
  }
  const log = res.log || [];
  const bad = log.filter((l) => !l.writeOk || !l.readback);
  return {
    ...report,
    dryRun: false,
    applied: {
      group: res.group ?? data.group,
      written: log.length,
      readback: log,
      mismatch: bad.length > 0 ? bad : null,
      note: "回读为空 = 该音符技法没进去（多为该轨不支持或互斥被宿主回滚）；可 Ctrl+Z 撤销",
    },
    warning: bad.length > 0 ? `${bad.length} 个音符写入后回读为空，请复核（note#${bad.map((b) => b.index).join(", ")}）` : undefined,
    elapsedMs: Date.now() - start,
  };
}
