/**
 * **`ace_vocal_params` 的内核** —— ACE 人声参数曲线（`air`/`falsetto`/`tension`/`energy`/`dynamic`…）
 * 的**读花名册 → 校验 → 写 → 读回**（走 `acestudio-cli vocalparam`，ACE **不走我们的桥**）。
 *
 * 事实源（全部有出处；**不按声库名推断、不跨引擎抄数值**）：
 *   · `acestudio-cli help vocalparam layers` —— `params[]` 的字段：`param` / `available` / `unavailableReason` /
 *     `scale` / `valueRange{min,max}` / `layers[]{layer,role,shape,sparse,access}`；另有 `engineGeneration` 与
 *     `vocalControlRoute`。**`pitch` 在这个 surface 上 `available:false`**（原文：the channel stores a delta while
 *     the draw primitive takes absolute pitch…）⇒ 音高线只能走 `.acep` 文件路（`acep` 的 `rap-curve`）。
 *   · `acestudio-cli help vocalparam write` —— 写**必须点名 `--layer`**；`--pos-begin` **dense 必填、points/scalar 拒绝**；
 *     `effective` 永远不可写；`--if-match` 是 ETag 语义。
 *   · `acestudio-cli help curve-encoding` —— 三种形状：`dense`（每 tick 一值，`--encoding base64` 是
 *     `{dtype:"f64le",count,data}`、`null` = 空档）、`points`（`[[tick,value],…]` 锚点，`[tick,null]` = 空档标记）、
 *     `scalar`（一个数）。
 *   · `skills/ace-params/SKILL.md` §5b / `help vocalparam write` —— **dense 的每一段连续 run 至少 2 个 tick**
 *     （值的 run 与 `null` 空档的 run 都算；单元素载荷、孤立一个值、单戳一个 `null` 都会被**直接拒**）
 *     ⇒ 我们**在本地先查**，别白跑一次。
 *   · `skills/ace-params/SKILL.md` §8 + `ace` 技能 §5 第 3 条 —— **越界一律 `INVALID_ARG`，从不 clamp**
 *     ⇒ 我们**也绝不 clamp**：越界就**如实拒**并把合法区间回给用户。
 *     ⚠️ 这一点**故意与 `sv_write_automation` 相反**（SV 侧按取值域 clamp）—— 见 `tools.ts` 里两个工具的描述。
 *   · 写进的值**读回来会变**（f32 级精度：实测写 `1.2` 读回 `1.2000000476837158`）⇒ 读回比对按**容差**，
 *     不按写入值做逐位比对（`ace-params` §5 末尾）。
 */
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type AceRunner, type RunResult } from './index.js';

/* ─────────────────────────── 形状与花名册 ─────────────────────────── */

export type ParamShape = 'dense' | 'points' | 'scalar' | string;

export interface ParamLayer {
  layer: string;
  role?: string;
  shape: ParamShape;
  sparse?: boolean;
  access?: string;
}

export interface ParamInfo {
  param: string;
  displayName?: string;
  available: boolean;
  unavailableReason?: string;
  /** ⚠️ 不可用参数**不带** scale/valueRange（实测 `formant`/`pitch` 两行都是空的）⇒ 两个字段都可选 */
  scale?: string;
  valueRange?: { min?: number; max?: number };
  layers: ParamLayer[];
}

export interface Roster {
  clipUuid?: string;
  engineGeneration?: string;
  vocalControlRoute?: string;
  paramCount?: number;
  params: ParamInfo[];
}

/** 读花名册（`vocalparam layers`）。**每次现读** —— 等级随引擎世代变（`ace-params` §1）。 */
export function readRoster(run: AceRunner, clipUuid: string, param?: string): Roster {
  const args = ['vocalparam', 'layers', '--clip-uuid', clipUuid];
  if (param) args.push('--param', param);
  const r = run(args);
  const j = r.json as Record<string, unknown> | null;
  if (!j || !Array.isArray(j.params)) {
    throw new Error('读不到参数花名册（`vocalparam layers`）：' + (r.stderr || r.stdout || `exit ${r.code}`));
  }
  return {
    clipUuid: typeof j.clipUuid === 'string' ? j.clipUuid : clipUuid,
    engineGeneration: typeof j.engineGeneration === 'string' ? j.engineGeneration : undefined,
    vocalControlRoute: typeof j.vocalControlRoute === 'string' ? j.vocalControlRoute : undefined,
    paramCount: typeof j.paramCount === 'number' ? j.paramCount : undefined,
    params: (j.params as Record<string, unknown>[]).map(toParamInfo),
  };
}

function toParamInfo(p: Record<string, unknown>): ParamInfo {
  const vr = (p.valueRange ?? null) as { min?: number; max?: number } | null;
  return {
    param: String(p.param ?? ''),
    displayName: typeof p.displayName === 'string' ? p.displayName : undefined,
    available: p.available === true,
    unavailableReason: typeof p.unavailableReason === 'string' ? p.unavailableReason : undefined,
    scale: typeof p.scale === 'string' && p.scale ? p.scale : undefined,
    valueRange: vr && (typeof vr.min === 'number' || typeof vr.max === 'number') ? vr : undefined,
    layers: Array.isArray(p.layers)
      ? (p.layers as Record<string, unknown>[]).map((l) => ({
          layer: String(l.layer ?? ''),
          role: typeof l.role === 'string' ? l.role : undefined,
          shape: String(l.shape ?? ''),
          sparse: typeof l.sparse === 'boolean' ? l.sparse : undefined,
          access: typeof l.access === 'string' ? l.access : undefined,
        }))
      : [],
  };
}

/** 读一层（或 `effective`）。回包固定四块：`layers[]` / `effective` / `unvoiced[]` / 元数据（`ace-params` §4b）。 */
export interface ParamRead {
  param: string;
  clipUuid?: string;
  engineGeneration?: string;
  displayName?: string;
  scale?: string;
  valueRange?: { min?: number; max?: number };
  posBegin?: number;
  count?: number;
  fingerprint?: string;
  unvoiced?: unknown;
  layers: { layer: string; access?: string; role?: string; shape?: string; sparse?: boolean; points?: unknown[]; drew?: string; drawnRanges?: unknown }[];
  effective?: { layer: string; access?: string; points?: unknown[] } | null;
}

export function readParam(run: AceRunner, clipUuid: string, param: string, layer?: string, opts: { encoding?: 'json' | 'base64'; rangeBegin?: number; rangeEnd?: number } = {}): ParamRead {
  const args = ['vocalparam', 'read', '--clip-uuid', clipUuid, '--param', param];
  if (layer) args.push('--layer', layer);
  /* ⚠️ 大回包的两条活路（都是实测/官方口径）：
   *   · `--encoding base64`：dense 层每 tick 一值 ⇒ 整条 4 分钟 clip 的 **JSON 是 39.4 MB**、base64 是 2.3 MB
   *     （`help curve-encoding`：`{dtype:"f64le",count,data}`，空档 = NaN 位型）；
   *   · `--range-begin/--range-end`（clip-local tick，end 开区间）：只取一段。
   *   ⚠️ `--encoding` 只作用于 dense 层；points/scalar 永远走纯 JSON（它们的 tick 自带）。 */
  if (opts.encoding === 'base64') args.push('--encoding', 'base64');
  if (typeof opts.rangeBegin === 'number') args.push('--range-begin', String(opts.rangeBegin));
  if (typeof opts.rangeEnd === 'number') args.push('--range-end', String(opts.rangeEnd));
  const r = run(args);
  const j = r.json as Record<string, unknown> | null;
  if (!j || (!Array.isArray(j.layers) && !j.effective)) {
    throw new Error(`读不到 ${param} 的曲线（\`vocalparam read\`）：` + (r.stderr || r.stdout || `exit ${r.code}`));
  }
  const eff = (j.effective ?? null) as Record<string, unknown> | null;
  return {
    param: String(j.param ?? param),
    clipUuid: typeof j.clipUuid === 'string' ? j.clipUuid : undefined,
    engineGeneration: typeof j.engineGeneration === 'string' ? j.engineGeneration : undefined,
    displayName: typeof j.displayName === 'string' ? j.displayName : undefined,
    scale: typeof j.scale === 'string' ? j.scale : undefined,
    valueRange: (j.valueRange ?? undefined) as ParamRead['valueRange'],
    posBegin: typeof j.posBegin === 'number' ? j.posBegin : undefined,
    count: typeof j.count === 'number' ? j.count : undefined,
    fingerprint: typeof j.fingerprint === 'string' ? j.fingerprint : undefined,
    unvoiced: j.unvoiced,
    layers: Array.isArray(j.layers) ? (j.layers as Record<string, unknown>[]).map((l) => ({
      layer: String(l.layer ?? ''), access: l.access as string | undefined, role: l.role as string | undefined,
      shape: l.shape as string | undefined, sparse: l.sparse as boolean | undefined,
      points: isBase64Envelope(l.points) ? decodeF64leEnvelope(l.points) : (Array.isArray(l.points) ? (l.points as unknown[]) : undefined),
      drew: isBase64Envelope(l.points) ? 'base64' : Array.isArray(l.points) ? 'json' : undefined,
      drawnRanges: l.drawnRanges,
    })) : [],
    effective: eff ? {
      layer: String(eff.layer ?? 'effective'), access: eff.access as string | undefined,
      points: isBase64Envelope(eff.points) ? decodeF64leEnvelope(eff.points) : (Array.isArray(eff.points) ? (eff.points as unknown[]) : undefined),
    } : null,
  };
}

/** base64 信封（`help curve-encoding`）。 */
export interface F64leEnvelope { dtype: string; count: number; data: string }
export function isBase64Envelope(v: unknown): v is F64leEnvelope {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && typeof (v as F64leEnvelope).data === 'string' && typeof (v as F64leEnvelope).count === 'number';
}

/** 解 base64 载荷（**NaN 位型 = 空档 ⇒ 还原成 `null`**，与 json 形态对齐）。 */
export function decodeF64leEnvelope(env: F64leEnvelope): (number | null)[] {
  const buf = Buffer.from(env.data, 'base64');
  const n = Math.min(env.count, Math.floor(buf.length / 8));
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const v = buf.readDoubleLE(i * 8);
    out.push(Number.isNaN(v) ? null : v);
  }
  return out;
}

/* ─────────────────────────── 校验（越界拒、不 clamp） ─────────────────────────── */

export type PayloadKind = 'dense' | 'points' | 'scalar';

export interface WritePayload {
  kind: PayloadKind;
  /** dense：每 tick 一值（`null` = 抹掉该 tick）；points：锚点值（`null` = 空档标记）；scalar：单值 */
  values?: (number | null)[];
  anchors?: [number, number | null][];
  scalar?: number;
  posBegin?: number;
}

export interface PayloadCheck {
  ok: boolean;
  /** 逐条拒绝理由（照 `error.hint` 的口气：说清**哪一条、什么区间**）——我们**不改用户的数** */
  errors: string[];
  warnings: string[];
  legalRange?: { min?: number; max?: number };
  /** 真正要发给 CLI 的 `--points` 文本（JSON） */
  pointsJson?: string;
  posBegin?: number;
  /** base64 载荷（`--encoding base64` 时给） */
  base64?: { dtype: 'f64le'; count: number; data: string };
}

/** dense 的"每一段连续 run 至少 2 tick"预检（`help vocalparam write` / `ace-params` §5b 门槛 1）。 */
export function denseRunViolations(values: readonly (number | null)[]): { start: number; len: number; kind: 'values' | 'gap' }[] {
  const out: { start: number; len: number; kind: 'values' | 'gap' }[] = [];
  let i = 0;
  while (i < values.length) {
    const isGap = values[i] === null;
    let j = i;
    while (j < values.length && (values[j] === null) === isGap) j++;
    if (j - i < 2) out.push({ start: i, len: j - i, kind: isGap ? 'gap' : 'values' });
    i = j;
  }
  return out;
}

/** 把一个数字夹…… **不**：这里只判合法区间（**绝不 clamp**，口径见文件头）。 */
function rangeErrors(values: readonly (number | null)[], range: { min?: number; max?: number } | undefined, label: (i: number) => string): string[] {
  if (!range || (range.min === undefined && range.max === undefined)) return [];
  const bad: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (!Number.isFinite(v)) { bad.push(`${label(i)} = ${v} 不是有限数`); continue; }
    if ((range.min !== undefined && v < range.min) || (range.max !== undefined && v > range.max)) {
      bad.push(`${label(i)} = ${v} 越界（合法区间 [${range.min ?? '-∞'}, ${range.max ?? '+∞'}]）`);
    }
  }
  return bad;
}

/** `help curve-encoding`：base64 载荷 = IEEE-754 binary64 **小端**，空档 = NaN 位型。 */
export function encodeF64le(values: readonly (number | null)[]): { dtype: 'f64le'; count: number; data: string } {
  const buf = Buffer.alloc(values.length * 8);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buf.writeDoubleLE(v === null || v === undefined ? Number.NaN : v, i * 8);
  }
  return { dtype: 'f64le', count: values.length, data: buf.toString('base64') };
}

/**
 * 校验载荷（纯函数，单测直接打）：
 *   ① 形状必须与该层**声明的** `shape` 一致（`help vocalparam write`：the verbs follow the declaration）；
 *   ② 越界 ⇒ **拒**（列出每个越界项与合法区间；**不 clamp**）；
 *   ③ dense ⇒ 每段 run ≥ 2 tick（否则引擎直接拒）；
 *   ④ points ⇒ tick 升序、不重复；
 *   ⑤ `--pos-begin` 只在 dense 出现（points/scalar 给了会被拒）。
 */
export function checkPayload(p: WritePayload, layer: ParamLayer, param: ParamInfo, opts: { posBeginFallback?: number; encoding?: 'json' | 'base64' } = {}): PayloadCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const range = param.valueRange;
  const declared = String(layer.shape);

  if (p.kind !== declared) {
    return {
      ok: false, legalRange: range,
      errors: [
        `载荷形状与这一层**声明的** \`shape\` 不一致：\`${layer.layer}\` 是 \`${declared}\`，你给的是 \`${p.kind}\`` +
          '（`help vocalparam layers`：shape 是**声明出来的**，动词照它走 —— dense 必须给 `--pos-begin`，points/scalar 反而**不许**给）',
      ],
      warnings,
    };
  }

  if (p.kind === 'dense') {
    const values = p.values;
    if (!values || !values.length) return { ok: false, errors: ['dense 载荷为空 —— 没有要写的 tick'], warnings, legalRange: range };
    const posBegin = p.posBegin ?? opts.posBeginFallback;
    if (posBegin === undefined || posBegin === null) {
      return { ok: false, errors: ['dense 必须给 `posBegin`（`--pos-begin`）—— 官方原话：posBegin is required for a dense write'], warnings, legalRange: range };
    }
    errors.push(...rangeErrors(values, range, (i) => `tick ${posBegin + i}`));
    const bad = denseRunViolations(values);
    if (bad.length) {
      errors.push(
        `dense 的**每一段连续 run 至少 2 个 tick**（\`help vocalparam write\` 的硬规则）⇒ 这些 run 只有 1 tick，引擎会**直接拒**：` +
          bad.slice(0, 8).map((b) => `tick ${posBegin + b.start}（${b.kind === 'gap' ? 'null 空档' : '值'}）`).join(' · ') +
          (bad.length > 8 ? ` …还有 ${bad.length - 8} 段` : '') +
          '。要精确落到某个 tick，就写一段**越过它两侧**的 run，写完读回确认。',
      );
    }
    if (bad.length) return { ok: false, errors, warnings, legalRange: range, posBegin };
    if (errors.length) return { ok: false, errors, warnings, legalRange: range, posBegin };
    if (opts.encoding === 'base64') {
      // `help curve-encoding`：base64 = `{"dtype":"f64le","count":N,"data":"…"}`，**空档 = NaN 位型**
      const env = encodeF64le(values);
      return {
        ok: true, errors, warnings, legalRange: range, posBegin,
        base64: env, pointsJson: JSON.stringify(env),
      };
    }
    return { ok: true, errors, warnings, legalRange: range, posBegin, pointsJson: JSON.stringify(values) };
  }

  if (p.kind === 'points') {
    const anchors = p.anchors;
    if (!anchors || !anchors.length) return { ok: false, errors: ['points 载荷为空 —— 没有锚点'], warnings, legalRange: range };
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i]!;
      if (!Array.isArray(a) || a.length !== 2) { errors.push(`第 ${i} 个锚点不是 \`[tick, value]\``); continue; }
      if (i > 0 && !(a[0] > anchors[i - 1]![0])) errors.push(`锚点 tick 必须**升序且不重复**：第 ${i} 个 tick=${a[0]}，第 ${i - 1} 个 tick=${anchors[i - 1]![0]}`);
    }
    errors.push(...rangeErrors(anchors.map((a) => a[1] ?? null), range, (i) => `tick ${anchors[i]?.[0]}`));
    if (errors.length) return { ok: false, errors, warnings, legalRange: range };
    if (p.posBegin !== undefined) warnings.push('`--pos-begin` 对 points 形状会被引擎拒 ⇒ 我们**没有**发它（points 自带 tick）');
    return { ok: true, errors, warnings, legalRange: range, pointsJson: JSON.stringify(anchors) };
  }

  // scalar
  if (typeof p.scalar !== 'number') return { ok: false, errors: ['scalar 载荷要给一个数（`scalarValue`）'], warnings, legalRange: range };
  errors.push(...rangeErrors([p.scalar], range, () => 'scalar'));
  if (p.posBegin !== undefined) warnings.push('`--pos-begin` 对 scalar 形状会被引擎拒 ⇒ 我们**没有**发它');
  if (errors.length) return { ok: false, errors, warnings, legalRange: range };
  return { ok: true, errors, warnings, legalRange: range, pointsJson: JSON.stringify(p.scalar) };
}

/* ─────────────────────────── 写前的门（拒写判据，全在这里 ⇒ 可离线单测） ─────────────────────────── */

export type Gate<T> = { ok: true; value: T } | { ok: false; error: string; detail?: Record<string, unknown> };

/**
 * 门 ①：参数必须在花名册里、且 `available:true`。
 * 出处：`help vocalparam layers` —— "Naming a parameter the roster does not list is refused with the reason"；
 * `pitch` 在这个 surface 上就是 `available:false`（原因见 `unavailableReason`），**读写都拒**，
 * 而且**不接受换格式重试**（"全有全无"，`ace-params` §7）。
 */
export function gateParam(roster: Roster, param: string): Gate<ParamInfo> {
  const info = roster.params.find((p) => p.param === param);
  if (!info) {
    return {
      ok: false,
      error: `花名册里没有参数 \`${param}\``,
      detail: {
        availableParams: roster.params.filter((p) => p.available).map((p) => p.param),
        unavailableParams: roster.params.filter((p) => !p.available).map((p) => ({ param: p.param, reason: p.unavailableReason })),
        vocalControlRoute: roster.vocalControlRoute, engineGeneration: roster.engineGeneration,
      },
    };
  }
  if (!info.available) {
    return {
      ok: false,
      error: `参数 \`${param}\` 在这条 clip 上 **available:false** ⇒ 读写都会被 ACE 拒（**不 clamp、不换格式重试**）`,
      detail: {
        unavailableReason: info.unavailableReason,
        hint: param === 'pitch'
          ? '`pitch` 在这个 surface 上不存在（通道存 delta、draw 原语收 absolute）⇒ 人声音高线只能走 `.acep` 文件路（`acep` 的 `rap-curve` / `anchor` / `vibrato`）'
          : '换参数，或换声库/引擎世代（层与可用性由 clip 的**引擎世代**决定，别按声库名推断）',
      },
    };
  }
  return { ok: true, value: info };
}

/**
 * 门 ②：`--layer` **必填**（没有默认值 —— "guessing which layer a caller meant is exactly the mistake this
 * surface exists to prevent"），且必须是该参数**列出来的、可写**的层。
 * `baseline`（只读）与 `effective`（合并结果，永远不可写）在这里被拒。
 */
export function gateLayer(info: ParamInfo, layer: string | undefined): Gate<ParamLayer> {
  const list = info.layers.map((l) => `${l.layer}:${l.access}:${l.shape}`);
  if (!layer) {
    return { ok: false, error: `写**必须点名 \`layer\`**（ACE 没有默认层；可选：${list.join(' · ') || '这条 clip 上这个参数一个可写层都没有'}）`, detail: { layers: list } };
  }
  const lay = info.layers.find((l) => l.layer === layer);
  if (!lay) return { ok: false, error: `参数 \`${info.param}\` 上没有 \`${layer}\` 这一层（有：${list.join(' · ')}）`, detail: { layers: list } };
  if (lay.access !== 'read-write') {
    return { ok: false, error: `层 \`${layer}\` 是 **${lay.access}**（只读 / \`effective\` 永远不可写 —— 合并规则归引擎）⇒ 拒写`, detail: { layers: list } };
  }
  return { ok: true, value: lay };
}

/** 门 ③：**一次只给一种载荷形状**（`values` dense / `anchors` points / `scalarValue` scalar）。 */
export function makePayload(a: { values?: (number | null)[]; anchors?: (number | null)[][]; scalarValue?: number; posBegin?: number }): Gate<WritePayload> {
  const kinds = [a.values !== undefined ? 'dense' : null, a.anchors !== undefined ? 'points' : null, a.scalarValue !== undefined ? 'scalar' : null].filter(Boolean) as string[];
  if (kinds.length !== 1) {
    return {
      ok: false,
      error: kinds.length === 0
        ? '没有载荷：给 `values`（dense 每 tick 一值）/ `anchors`（points 锚点）/ `scalarValue`（scalar）三者之一'
        : `一次只能给一种载荷形状（现在是 ${kinds.join(' + ')}）`,
    };
  }
  if (a.values !== undefined) return { ok: true, value: { kind: 'dense', values: a.values, posBegin: a.posBegin } };
  if (a.anchors !== undefined) return { ok: true, value: { kind: 'points', anchors: a.anchors as [number, number | null][], posBegin: a.posBegin } };
  return { ok: true, value: { kind: 'scalar', scalar: a.scalarValue, posBegin: a.posBegin } };
}

/* ─────────────────────────── 读的摘要（别把 28 万个点倒进上下文） ─────────────────────────── */

/**
 * 摘要一条曲线（**只取样，不搬运**）。理由：
 *   · dense 层是**每 tick 一值** —— 实测一条 clip 的 `tension` 读回来是 **282240** 个数（`ace-params` §5），
 *     原样回给模型会直接吃掉上下文（`ace_cli` 早就因为同一个原因加了 `capToolResult`）；
 *   · `ace-params` §4b 纪律 1：**别拿 "effective 有变化" 当 "有人画过"** ⇒ 本摘要把
 *     **可写层的非空计数**（`nonNull` / `drawnRangesCount`）单独报出来，那才是"谁画过"的判据。
 */
export function summarizePoints(points: unknown, opts: { max?: number } = {}): Record<string, unknown> | null {
  // 兼容两种线上形态：json 数组，或 base64 信封（dense 层大回包的形态）
  const arr: unknown[] | null = Array.isArray(points)
    ? points
    : isBase64Envelope(points) ? decodeF64leEnvelope(points) : null;
  if (!arr) return null;
  const max = opts.max ?? 24;
  let nonNull = 0, min: number | null = null, maxV: number | null = null;
  let firstNonNullAt: number | null = null, lastNonNullAt: number | null = null;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    nonNull++;
    if (firstNonNullAt === null) firstNonNullAt = i;
    lastNonNullAt = i;
    if (min === null || v < min) min = v;
    if (maxV === null || v > maxV) maxV = v;
  }
  const step = arr.length > max ? Math.ceil(arr.length / max) : 1;
  const samples: { tick: number; value: number | null }[] = [];
  for (let i = 0; i < arr.length && samples.length < max; i += step) {
    const v = arr[i];
    samples.push({ tick: i, value: typeof v === 'number' && Number.isFinite(v) ? v : null });
  }
  return {
    count: arr.length,
    /** ⚠️ **非空 = 被画过**（`null` 是空档 / 未画；sparse 层只在画过的地方有值） */
    nonNull,
    gaps: arr.length - nonNull,
    min, max: maxV,
    firstNonNullAt, lastNonNullAt,
    samples,
    sampleStep: step,
    note: '点太多 ⇒ 只回取样（每 sampleStep 个取 1）。判"有没有人画过"看 **nonNull**（不是 effective 有没有变化）。',
  };
}

/* ─────────────────────────── 写 + 读回 ─────────────────────────── */

/** 组 `vocalparam write` 的参数（**纯函数**，单测直接断言）。
 *  `pointsFile` 给的是**临时文件路径** ⇒ 发 `@<path>`（官方原话：Points do not go on a command line）。 */
export function buildWriteArgs(a: { clipUuid: string; param: string; layer: string; pointsJson: string; posBegin?: number; encoding?: 'json' | 'base64'; ifMatch?: string; waitBusy?: string; pointsFile?: string }): string[] {
  const args = ['vocalparam', 'write', '--clip-uuid', a.clipUuid, '--param', a.param, '--layer', a.layer];
  if (a.posBegin !== undefined) args.push('--pos-begin', String(a.posBegin));
  args.push('--points', a.pointsFile ? '@' + a.pointsFile : a.pointsJson);
  if (a.encoding && a.encoding !== 'json') args.push('--encoding', a.encoding);
  if (a.ifMatch) args.push('--if-match', a.ifMatch);
  if (a.waitBusy) args.push('--wait-busy', a.waitBusy);
  return args;
}

/**
 * 载荷**要不要落盘**再喂给 CLI。
 *
 * 为什么必须有这条（2026-10-06 真机+官方口径）：`--points` 走**命令行参数**，
 * 而 Windows 的整条命令行上限约 **32 KB** ⇒ 一段几 KB 的 dense 载荷（1 小节 = 1920 个值 ≈ 10 KB）就悬了，
 * 整条 clip 的载荷（282240 个值 ≈ 2 MB）**必然起不来**。官方口径也是这句：
 * "A curve is bulk data. Read it from a file or a pipe: `--points @curve.json`"。
 *
 * ⇒ 超过 `threshold` 字符就写临时文件，返回 `@路径`（调用方**用完负责删**：`cleanupPoints()`）。
 */
export function pointsArg(pointsJson: string, opts: { threshold?: number; dir?: string } = {}): { arg: string; tempPath?: string; inline: boolean; bytes: number } {
  const threshold = opts.threshold ?? 2000;
  if (pointsJson.length <= threshold) return { arg: pointsJson, inline: true, bytes: pointsJson.length };
  const dir = opts.dir ?? tmpdir();
  const file = path.join(dir, `akdagent-ace-points-${process.pid}-${Date.now().toString(36)}.json`);
  writeFileSync(file, pointsJson, 'utf8');
  return { arg: '@' + file, tempPath: file, inline: false, bytes: pointsJson.length };
}

/** 删掉 `pointsArg` 落下的临时文件（**尽力而为**，失败不抛 —— 别让清理失败盖掉写入结论）。 */
export function cleanupPoints(tempPath?: string): void {
  if (!tempPath) return;
  try { rmSync(tempPath, { force: true }); } catch { /* 尽力而为 */ }
}

export function writeParam(run: AceRunner, args: string[]): RunResult & { accepted: Record<string, unknown> | null } {
  const r = run(args, 180_000);
  const j = (r.json ?? null) as Record<string, unknown> | null;
  return { ...r, accepted: j };
}

/** 写回包要报的（`help vocalparam write`：`{param,layer,posBegin,count,clearedCount,fingerprint}`）。 */
export function summarizeWriteAccepted(a: Record<string, unknown> | null): Record<string, unknown> {
  if (!a) return { json: null };
  return { param: a.param, layer: a.layer, posBegin: a.posBegin, count: a.count, clearedCount: a.clearedCount, fingerprint: a.fingerprint };
}

/**
 * 读回核对：把"我们写的这段"与"读回来的"对齐比对。
 * ⚠️ 两条实测口径（`ace-params` §5 / §4b）：
 *   ① 值读回会变（f32 级）⇒ 比对用**相对容差**（默认 1e-6），不要求逐位相等；
 *   ② `null`（空档）要**分别计数** —— 写 `null` 是"抹掉"，读回该处应为 `null`（`clearedCount` 会告诉你抹了多少 tick）。
 */
export function compareReadBack(a: {
  wrote: readonly (number | null)[];
  posBegin: number;
  read: { posBegin?: number; layers: { layer: string; points?: unknown[] }[] };
  layer: string;
  tolerance?: number;
}): Record<string, unknown> {
  const tol = a.tolerance ?? 1e-6;
  const layerRead = a.read.layers.find((l) => l.layer === a.layer);
  if (!layerRead || !Array.isArray(layerRead.points)) {
    return { layerFound: false, note: `读回里没有 \`${a.layer}\` 这一层（可能刚写完还没刷新，或该层不存在）` };
  }
  const rp = layerRead.points;
  const rBegin = a.read.posBegin ?? 0;
  let checked = 0, agree = 0, gapAgree = 0, gapDisagree = 0;
  const mismatched: { tick: number; wrote: number | null; read: number | null }[] = [];
  for (let i = 0; i < a.wrote.length; i++) {
    const tick = a.posBegin + i;
    const idx = tick - rBegin;
    if (idx < 0 || idx >= rp.length) continue;
    const got = rp[idx];
    const gotNum = typeof got === 'number' ? got : null;
    const want = a.wrote[i] ?? null;
    checked++;
    if (want === null || gotNum === null) {
      if (want === null && gotNum === null) gapAgree++; else gapDisagree++;
      continue;
    }
    if (Math.abs(gotNum - want) <= tol * Math.max(1, Math.abs(want))) agree++;
    else if (mismatched.length < 8) mismatched.push({ tick, wrote: want, read: gotNum });
  }
  return {
    layerFound: true,
    checkedTicks: checked,
    valuesAgree: agree,
    gapAgree,
    /** ⚠️ 值不一致 / 空档对不上都要**照实报**（§3.6c：读回只作参考，但差别必须说） */
    valueMismatch: mismatched.length,
    gapMismatch: gapDisagree,
    sample: mismatched.length ? mismatched : undefined,
    tolerance: tol,
    note: `读回按 **f32 级容差 ${tol}** 比对（实测写 1.2 读回 1.2000000476837158 ⇒ 不按写入值逐位比）`,
  };
}
