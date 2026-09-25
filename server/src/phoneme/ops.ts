/**
 * 音素替换 —— **宿主交互层**（只读列表 + 批量替换）
 *
 * 工具：`sv_list_phonemes`（只读）· `sv_replace_phonemes`（写，默认 dry-run）
 *
 * 读什么：
 *   · `get_lyrics_attrs` —— 每音符的歌词 / `languageOverride` / **手动音素串**（`getPhonemes()`，没手改过=空串）
 *   · `get_phonemes`（桥 0.3.23 新增）—— **整组的实际发音串**（含 T2P 默认）＝"替换"的正确基准
 *   · `get_computed_attributes`（SV2 2.1.1+）—— 每个音素**实际生效语种**（判候选与校验用；取不到就退回 languageOverride）
 *
 * 范围口径（用户 2026-09-22 裁定）：**`indices` → 选中的音符 → 全组**。
 * 写入口径：**表外音素直接拒写**（用户裁定）—— 两份清单（官方表 ∪ 参考 js 的 Consonants0/Vowels0）取并集；
 *          另有 `strict:"official"` 可只认官方表（korean `pp`/`tt` 只在参考表、官方表另有 3 个 ⇒ 边界待用户最终确认）。
 */
import { executeOp } from "../protocol.js";
import {
  LANG_ORDER, normLang, classify, rankCandidates, validateTokens, applyReplacements, tokenize,
  LANG_TABLES, languagesOf, foreignTokens,
} from "./index.js";

export interface PhArgs {
  indices?: number[];
  language?: string;
  topN?: number;
  crossLanguage?: boolean;
  strict?: "union" | "official";
  host?: "sv" | "ix";
}

/** 调桥（host 按协议塞进 args；桥是单通道 ⇒ 调用方必须串行化） */
async function call(op: string, args: Record<string, unknown>, host?: "sv" | "ix"): Promise<any> {
  return await executeOp(op, host ? { ...args, host } : args) as any;
}

export interface GroupState {
  ok: boolean;
  reason?: string;
  host?: string;
  notes: any[];
  /** 实际发音串（按组内下标对齐）；`null` = 宿主/桥不支持该 op ⇒ 只能退回首动串 */
  effective: string[] | null;
  effectiveHint?: string;
  /** 每个音符的实际语种（来自 computed；取不到则缺键） */
  langOf: Map<number, string | null>;
}

/** 一次读齐：工程状态 + 实际发音串 + 每音符语种（尽力，缺了不致命） */
export async function readGroupState(host?: "sv" | "ix"): Promise<GroupState> {
  const attrs = await call("get_lyrics_attrs", {}, host);
  if (!attrs || attrs.current === false) {
    return { ok: false, reason: "没有当前组（先在宿主里选中一个音符组）", notes: [], effective: null, langOf: new Map() };
  }
  const notes: any[] = attrs.notes ?? [];
  let effective: string[] | null = null;
  let effectiveHint: string | undefined;
  try {
    const ph = await call("get_phonemes", {}, host);
    if (ph && ph.ok && Array.isArray(ph.phonemes)) effective = ph.phonemes.map((x: unknown) => String(x ?? ""));
    else effectiveHint = ph?.hint || ph?.err || "get_phonemes 未返回可用数据";
  } catch (e) {
    effectiveHint = "get_phonemes 调用失败：" + (e instanceof Error ? e.message : String(e));
  }
  const langOf = new Map<number, string | null>();
  try {
    const cmp = await call("get_computed_attributes", { waitMs: 0 }, host);
    if (cmp && Array.isArray(cmp.notes)) {
      for (const n of cmp.notes) {
        const first = Array.isArray(n?.phonemes) ? n.phonemes.find((q: any) => q && q.language) : null;
        if (first) langOf.set(Number(n.index), normLang(first.language));
      }
    }
  } catch { /* SV1 / 不支持 ⇒ 靠 languageOverride 或显式参数 */ }
  return { ok: true, host: attrs.host, notes, effective, effectiveHint, langOf };
}

/** 范围：indices → 选中的音符 → 全组（0 起组内下标） */
export async function resolveScope(st: GroupState, indices: number[] | undefined, host?: "sv" | "ix"): Promise<{ indices: number[]; source: string }> {
  const all = st.notes.map((n) => Number(n.index)).filter((x) => Number.isFinite(x));
  if (indices && indices.length) return { indices: [...new Set(indices)].sort((a, b) => a - b), source: "indices" };
  try {
    const sel = await call("get_selected_notes", {}, host);
    const picked = (sel?.notes ?? []).map((n: any) => (typeof n.indexInParent === "number" ? n.indexInParent : null)).filter((x: any) => x !== null);
    if (picked.length) return { indices: [...new Set<number>(picked)].sort((a, b) => a - b), source: "selection" };
  } catch { /* 选区读不到 ⇒ 落全组 */ }
  return { indices: all, source: "whole-group" };
}

/** 该音符用什么语种判候选/校验：显式参数 > computed 实际语种 > languageOverride > 未知 */
export function langForNote(st: GroupState, idx: number, explicit?: string): string | null {
  const ex = normLang(explicit);
  if (ex) return ex;
  if (st.langOf.has(idx)) return st.langOf.get(idx) ?? null;
  const n = st.notes.find((x) => Number(x.index) === idx);
  return normLang(n?.languageOverride) ?? null;
}

/** 该音符的"当前音素串"：实际发音优先，退回首动串 */
export function currentOf(st: GroupState, idx: number): { s: string; source: "effective" | "manual" | "none" } {
  const eff = st.effective?.[idx];
  if (typeof eff === "string" && eff.trim() !== "") return { s: eff.trim(), source: "effective" };
  const n = st.notes.find((x) => Number(x.index) === idx);
  const man = typeof n?.phonemes === "string" ? n.phonemes.trim() : "";
  if (man) return { s: man, source: "manual" };
  return { s: "", source: "none" };
}

export interface ListRow {
  index: number;
  lyrics?: string | null;
  language: string | null;
  phonemes: string;
  source: string;
  tokens: { p: string; kind: string; candidates: { p: string; score: number; why: string; ex?: string | null }[] }[];
  note?: string;
}

/** `sv_list_phonemes` 主体 */
export async function listPhonemes(a: PhArgs): Promise<Record<string, unknown>> {
  const st = await readGroupState(a.host);
  if (!st.ok) return { ok: false, reason: st.reason };
  const scope = await resolveScope(st, a.indices, a.host);
  const langs = new Set<string>();
  const rows: ListRow[] = [];
  for (const idx of scope.indices) {
    const n = st.notes.find((x) => Number(x.index) === idx);
    const lang = langForNote(st, idx, a.language);
    if (lang) langs.add(lang);
    const cur = currentOf(st, idx);
    const toks = tokenize(cur.s);
    const row: ListRow = {
      index: idx, lyrics: n?.lyrics ?? null, language: lang,
      phonemes: cur.s, source: cur.source,
      tokens: toks.map((p) => {
        const cands = rankCandidates(p, lang, { topN: a.topN, crossLanguage: a.crossLanguage === true });
        const t: ListRow["tokens"][number] = {
          p, kind: classify(p, lang),
          candidates: cands.map((c) => ({ p: c.p, score: c.score, why: c.why, ex: c.ex ?? null })),
        };
        // 无相似信息 ⇒ **如实标注**，别让"按表序列出的清单"冒充"相似候选"（2026-09-22 实测 english `k` 会这样）
        if (cands.length && cands[0].score === 0) {
          (t as any).note = "无相似信息（族 / 字母都不重合）⇒ 下面只是**本语言同类清单（按表序）**，不代表相似度；要按需挑可 topN:0 全列";
        }
        if (!cands.length) (t as any).note = "无候选：该音素不在任何语言的清单里（请核对拼写），或该语种与它没有同族/同字母的音素";
        return t;
      }),
    };
    if (!toks.length) row.note = "该音符没有音素串（实际发音也读不到）⇒ 可能是静音/呼吸音，或宿主还没算出渲染结果";
    const noCand = row.tokens.filter((t) => !t.candidates.length);
    if (noCand.length) row.note = (row.note ? row.note + "；" : "") +
      "这些音素没有候选：" + noCand.map((t) => t.p).join(" ") + "（不在任何语言的清单里 ⇒ 请核对拼写）";
    rows.push(row);
  }
  return {
    ok: true,
    host: st.host,
    scope: { source: scope.source, notes: scope.indices.length, groupNotes: st.notes.length },
    languages: [...langs],
    effectiveSource: st.effective ? "get_phonemes（实际发音，含 T2P 默认）" : ("回退：手动音素串（" + (st.effectiveHint ?? "get_phonemes 不可用") + "）"),
    // ⚠️ 真机（SV1）踩到：SV2 才有 computed 的 `phonemes[].language` ⇒ SV1 上若用户没显式给 language、
    //    音符也没有 languageOverride，则**读不到语种** ⇒ 候选/校验只能按"全语言"退化。如实提示。
    ...(langs.size ? {} : {
      hint: "读不到语种（SV1 没有 computed 接口，且音符没有 languageOverride）⇒ 候选与校验按**全语言**退化。" +
            "建议显式传 `language`（如 language:\"japanese\"），或在宿主里给该轨/音符设好语种。",
    }),
    notes: rows,
    legend: {
      候选条数: "自适应：取 score ≥ 最高分 50% 的一档（最少 3、最多 10）；无相似信息时给短清单",
      元音: "Jaccard（共享族数 ÷ 并集族数）＋ 族内参考顺序邻近",
      辅音: "字母重合率（沿用参考脚本的『字母近似』直觉）",
      族数据: "来自用户的参考脚本（听感手工分类）；其中 mandarin `j` / japanese `u` / cantonese `y` 由我们的修订层补进了族",
    },
    caveats: [
      "本工具**只读**；要写入用 sv_replace_phonemes",
      "候选的『相似』是启发式（族/Jaccard/字母），听感仍以你为准",
      "⚠️ **改语种 = 该音符的全部音素按新语种重算**（T2P 重来）。只想改**一个**音素却要换语种 ⇒ 先把该音符**拆成两个**（各带自己的语种），否则整串都会变。",
    ],
  };
}

export interface ReplaceArgs extends PhArgs {
  mode?: "map" | "set";
  replacements?: { from: string; to: string }[];
  items?: { index: number; phonemes: string }[];
  dryRun?: boolean;
}

/** `sv_replace_phonemes` 主体 */
export async function replacePhonemes(a: ReplaceArgs): Promise<Record<string, unknown>> {
  if (a.host === "ix") {
    return { ok: false, reason: "音素（phonemes）是**人声**专属 —— Instrument X 是乐器宿主，本功能不适用" };
  }
  const mode = a.mode ?? "map";
  const st = await readGroupState(a.host);
  if (!st.ok) return { ok: false, reason: st.reason };
  const scope = await resolveScope(st, a.indices, a.host);

  if (mode === "map" && (!a.replacements || !a.replacements.length)) {
    return { ok: false, reason: "mode=map 需要 replacements（[{from,to}]，按音素 token 精确匹配）" };
  }
  if (mode === "set" && (!a.items || !a.items.length)) {
    return { ok: false, reason: "mode=set 需要 items（[{index, phonemes}]，空串=清掉手动音素回到 T2P 默认）" };
  }

  const plan: any[] = [];
  const writeItems: { index: number; phonemes: string }[] = [];
  const badAll: any[] = [];
  for (const idx of scope.indices) {
    const lang = langForNote(st, idx, a.language);
    const cur = currentOf(st, idx);
    let next = cur.s;
    let detail: unknown = null;
    if (mode === "map") {
      const r = applyReplacements(cur.s, a.replacements!);
      next = r.next; detail = r.detail;
    } else {
      const hit = a.items!.find((it) => Number(it.index) === idx);
      if (!hit) continue;                                   // set 模式：没点名的音符不动
      next = String(hit.phonemes ?? "").trim();
    }
    const toks = tokenize(next);
    const v = validateTokens(toks, lang, { crossLanguage: a.crossLanguage === true });
    // 混语种检测（用户 2026-09-22 的提醒）：**相对该音符语种**判"外来音素"——
    //   不能用"token 出现在哪些表里"（`o` 这类多语种共有的会误报；实测踩到）
    const foreign = foreignTokens(toks, lang);
    const foreignLangs = [...new Set(foreign.flatMap((t) => languagesOf(t)))].sort();
    // 交叉校验：结果串里是否仍含"表外"token（strict 口径由 validateTokens 内部按 isAllowed 处理）
    const row = {
      index: idx, lyrics: st.notes.find((x) => Number(x.index) === idx)?.lyrics ?? null,
      language: lang, from: cur.s, fromSource: cur.source, to: next, changed: next !== cur.s,
      replaced: detail,
      invalid: v.bad,
      ...(foreign.length ? { foreignTokens: foreign, foreignLanguages: foreignLangs } : {}),
    };
    plan.push(row);
    if (!v.ok) badAll.push({ index: idx, invalid: v.bad, suggestions: v.suggestions, crossLanguageNeeded: v.crossLanguageNeeded });
    else if (next !== cur.s) writeItems.push({ index: idx, phonemes: next });
  }

  const mixedRows = plan.filter((r) => Array.isArray(r.foreignTokens) && r.foreignTokens.length)
    .map((r) => ({ index: r.index, result: r.to, foreignTokens: r.foreignTokens, foreignLanguages: r.foreignLanguages }));
  const base = {
    host: st.host,
    mode,
    scope: { source: scope.source, notes: scope.indices.length, groupNotes: st.notes.length },
    effectiveSource: st.effective ? "实际发音（get_phonemes）" : "手动音素串（get_phonemes 不可用）",
    plan,
    // 混语种提醒（用户 2026-09-22：「修改语种会修改该音符所有音素，只改一个时记得提醒拆分」）
    ...(mixedRows.length ? { warnings: [
      "⚠️ 结果串里混了多个语种的音素：" + JSON.stringify(mixedRows),
      "注意：**在宿主里改语种 ⇒ 该音符的全部音素按新语种重算**（T2P 重来）；而本工具的写入是**整串** setPhonemes（整串被钉住）。",
      "**只想改一个音素**却要跨语种 ⇒ 请先把该音符**拆成两个**（各带自己的语种），否则整串都会跟着变。",
    ] } : {}),
    caveats: [
      "SV2 的 phonemes 写入**引擎会消费**，但**不回显到 computed** ⇒ 效果只能**听感验收**；回读的是 getPhonemes()（手动串）",
      "空串 = 清掉手动音素、回到 T2P 默认发音",
      "只动音素；**不改歌词、不改语种**（跨语种候选需显式 crossLanguage，且**不会替你写 languageOverride**）",
      "⚠️ **改语种 = 该音符的全部音素按新语种重算**（T2P 重来）；而本工具写入是**整串** `setPhonemes`（整串被钉住）。" +
      "**只想改一个音素**却要换语种 ⇒ 请先把该音符**拆成两个**（各带自己的语种），否则整串都会跟着变。",
    ],
  };

  // 表外音素 ⇒ **直接拒写**（用户 2026-09-22 裁定），且**一个都不写**（全有或全无）
  if (badAll.length) {
    return { ok: false, applied: false, rejected: true, ...base, invalid: badAll,
      hint: "有音素不在清单里 ⇒ 按你的口径**拒写**（一个都没写）。先用 sv_list_phonemes 拿候选，或用 crossLanguage:true 允许跨语种音素" };
  }
  if (a.dryRun !== false) {
    return { ok: true, applied: false, dryRun: true, ...base, willWrite: writeItems,
      hint: writeItems.length ? "确认后传 dryRun:false 才真正写入" : "没有任何改动（替换规则没命中，或目标串与现状相同）" };
  }
  if (!writeItems.length) return { ok: true, applied: false, dryRun: false, ...base, hint: "没有任何改动" };

  const res = await call("set_note_phonemes", { items: writeItems }, a.host);
  return { ok: true, applied: true, dryRun: false, ...base, write: res,
    readBack: { changed: res?.changed ?? null, applied: res?.applied ?? null, failed: res?.failed ?? null } };
}
