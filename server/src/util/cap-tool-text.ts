/**
 * 工具回包的**上下文护栏**：大回包默认截断（2026-10-06，用户问「为什么用了这么长时间」之后的第 2 条）。
 *
 * 起因（实测）：一次 `clip note-content`（242 个音）回了 **68k 字符**；会话记录的 `sessionStats` 显示
 * **message 上下文累计 34 万 token**、LLM 22.4 min vs 工具 4.1 min ⇒ **大回包是首字延迟与总时长的主因之一**。
 *
 * 规则（两条，够用且不丢信息）：
 *   ① **数组字段切片**：结果是带 `notes` / `tracks` / `clips` / `items` 的对象时，把该数组切到
 *      `[offset, offset+limit)`，并加 `_truncated`（原长 / offset / limit / hint）—— 让调用方知道**还有多少**、
 *      怎么拿全量（`limit:0` = 不限）。
 *   ② **整体字节上限**：无论什么形状，最终文本超过 `maxBytes` 就硬截断并注明**完整长度**。
 *
 * ⚠️ 纪律：**截断永远要自述**（`_truncated` / "已截断"），不许静默少给 —— 否则调用方会以为那是全部。
 */

export interface CapOptions {
  /** 数组字段每次回多少条（默认 50；**0 = 不限**） */
  limit?: number;
  /** 从第几条开始（默认 0） */
  offset?: number;
  /** 文本硬上限（字符，默认 32000） */
  maxBytes?: number;
  /** 优先切哪个数组字段（默认按 notes → tracks → clips → items 顺序找第一个"超长"的） */
  arrayFields?: readonly string[];
}

export const DEFAULT_LIMIT = 50;
export const DEFAULT_MAX_CHARS = 32_000;

/** 按 `CapOptions` 处理一个已解析的回包对象；返回 `{ payload, truncated }`（`truncated` 供日志/回报）。 */
export function capToolPayload<T>(payload: T, opts: CapOptions = {}): { payload: T; truncated: null | { field: string; total: number; offset: number; limit: number } } {
  const limit = opts.limit === undefined ? DEFAULT_LIMIT : opts.limit;
  const offset = Math.max(0, opts.offset || 0);
  const fields = opts.arrayFields || ['notes', 'tracks', 'clips', 'items'];
  if (limit <= 0) return { payload, truncated: null };          // limit:0 ⇒ 明确要全量
  if (!payload || typeof payload !== 'object') return { payload, truncated: null };
  let obj = payload as Record<string, unknown>;

  /* ① **先压 `stdout` 冗余**：真实 `ace_cli` 回包把同一份内容给了两遍 —— 解析版 `json` + 原文 `stdout`
   * （实测 `clip note-content` 50982 字符里它是大头；只切 `json.notes` 不够，原文里 242 条还在）。
   * ⚠️ 顺序很重要：这个必须**在**数组切片之前（切片那条会提前 return；第一版就是这么漏掉的 ——
   *    `tests/ace-cap-tool-text.mjs` 用真实回包抓到）。 */
  if (obj.json && typeof obj.stdout === 'string' && obj.stdout.length > 400) {
    obj = { ...obj, stdout: obj.stdout.slice(0, 200) + `…（stdout 原文已省略：原 ${obj.stdout.length} 字符；数据见 json 字段）`,
      _stdoutTruncated: { total: obj.stdout.length } };
  }

  /* ② 数组字段切片（可能嵌一层：`{ok, json:{notes:[…]}}`） */
  for (const holder of [obj, obj.json as Record<string, unknown> | undefined]) {
    if (!holder || typeof holder !== 'object') continue;
    for (const k of fields) {
      const arr = holder[k];
      if (Array.isArray(arr) && arr.length > offset + limit) {
        const sliced = arr.slice(offset, offset + limit);
        /* ⚠️ **不改调用方的对象**（原地改会让"同一个 payload 再 cap 一次"拿到被改过的数组 ——
         * 2026-10-06 由测试复用同一个 payload 抓到的假失败）。 */
        const next = { ...holder, [k]: sliced, _truncated: {
          field: k, total: arr.length, offset, limit,
          hint: `默认只回前 ${limit} 条（共 ${arr.length}）；要更多传 offset/limit，要全量传 limit:0`,
        } };
        return { payload: (holder === obj ? next : { ...obj, json: next }) as T, truncated: { field: k, total: arr.length, offset, limit } };
      }
    }
  }
  return { payload: obj as T, truncated: null };
}

/** 文本硬上限：超了就截断并**注明完整长度**（绝不静默）。 */
export function capToolText(text: string, maxBytes = DEFAULT_MAX_CHARS): string {
  if (text.length <= maxBytes) return text;
  return text.slice(0, maxBytes) + `\n…（已截断：完整 ${text.length} 字符；用 offset/limit 分页取，或按工具提示看落盘文件）`;
}

/** 一步到位：`capToolPayload` + `JSON.stringify` + `capToolText`。 */
export function capToolResult(payload: unknown, opts: CapOptions = {}): string {
  const { payload: capped } = capToolPayload(payload, opts);
  return capToolText(JSON.stringify(capped, null, 2), opts.maxBytes ?? DEFAULT_MAX_CHARS);
}
