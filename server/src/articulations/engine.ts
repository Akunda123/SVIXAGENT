/**
 * **IX 技法（articulations）规则引擎**（2026-09-21；`sv_apply_articulations` MCP 工具与
 * `tools/apply-articulations.cjs` **共用同一份实现** —— 谁都不许再抄第二遍规则）
 *
 * 设计原则：
 *   · 纯函数（除 `loadArticulationData` 读文件外无副作用）⇒ 可离线单测（`server/tests/articulations.mjs`）
 *   · **单一事实源 = 技能里的两份 JSON**：`skills/sv-ix/references/articulation-matrix.json`（支持集 + 全局互斥图）
 *     与 `articulation-rules.json`（10 条走向规则 + 6 个风格档 + 安全规则）。本模块**只读不复制**
 *   · 路线 A（用户 2026-09-21 定）：**默认不写**，只覆盖命中规则的少数音符，其余留给宿主 Smart Articulation
 *
 * ⚠️ 路径解析：开发态 `repo/server/dist/articulations/engine.js` ⇒ `../../../skills`；
 *    打包态（`resources/server` + `resources/dsh/skills`）⇒ `../../../dsh/skills`；亦可用 `AKDAGENT_SKILLS_DIR`。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 1 四分音符（= 1 拍）的 blick 数；组内 onset/duration 都用它换算 */
export const QUARTER = 705600000;

export interface NoteLike {
  index: number;        // 组内下标（1 起，Lua 口径）
  onset: number;        // blick
  dur: number;          // blick
  pitch: number;
  fixed: boolean;       // articulationsFixed
  arts: string[];       // 已有技法
  phrase?: number;      // 由 splitPhrases 填
}

export interface StyleTier {
  label?: string;
  minBeatsScale: number;
  leapSemitones: number;
  runCount: number;
  shortBeats: number;
}

export interface PlanEntry {
  index: number;
  rule?: string;
  why?: string;
  want?: string;
  onset?: number;
  pitch?: number;
  phrase?: number;
  before?: string[];
  remove?: string[];
  set?: string[];       // 有 set 才是「写入目标」
  skip?: string;
}

export interface MatrixData {
  knownKeys: string[];
  implicitKeys: Record<string, string>;
  mutexGraph: Record<string, string[]>;
  instruments: { name: string; family?: string; supported: string[] }[];
}

export interface RuleDef {
  id: string; event: string; criterion: Record<string, unknown>; why: string;
  set?: string[]; setAnyOf?: string[][]; fallback?: string[] | null; familyHint?: string[];
}

export interface RulesData {
  status: string;
  phraseSplit: { by: string; minGapBeats: number; noGapMeans?: string };
  styleTiers: Record<string, StyleTier>;
  priority: string[];
  safetyRules: { id: string; text: string }[];
  rules: RuleDef[];
}

function skillsDirCandidates(): string[] {
  const env = process.env.AKDAGENT_SKILLS_DIR;
  return [
    env ? path.join(env, "sv-ix", "references") : "",
    path.resolve(HERE, "../../../skills/sv-ix/references"),        // 开发态：repo/server/dist/articulations → repo/skills
    path.resolve(HERE, "../../../dsh/skills/sv-ix/references"),    // 打包态：resources/server + resources/dsh/skills
    path.resolve(HERE, "../../../../skills/sv-ix/references"),     // 万一多嵌一层
    path.resolve(process.cwd(), "skills/sv-ix/references"),
  ].filter((x) => x !== "");
}

function readSkillJson<T>(file: string): T {
  for (const dir of skillsDirCandidates()) {
    const p = path.join(dir, file);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as T;
  }
  throw new Error(
    `找不到技能数据 ${file}（技法矩阵/规则表是单一事实源，必须随包分发）。` +
    `已试：${skillsDirCandidates().join(" · ")}；可用环境变量 AKDAGENT_SKILLS_DIR 指定技能根目录。`,
  );
}

let cached: { matrix: MatrixData; rules: RulesData } | null = null;
export function loadArticulationData(): { matrix: MatrixData; rules: RulesData } {
  if (!cached) {
    cached = {
      matrix: readSkillJson<MatrixData>("articulation-matrix.json"),
      rules: readSkillJson<RulesData>("articulation-rules.json"),
    };
  }
  return cached;
}

/**
 * 剥壳到真正的 Lua 返回值。两层壳都可能出现：
 *   · MCP 路径：`executeOp` 已剥掉 fileIpc 响应壳 ⇒ 给到的是 `{resultType, result}`
 *   · 直连 `fileIpcSend`（tools/*.cjs）：拿到的是响应体 `{ok, result:{resultType, result}}`
 * ⚠️ 只认「同时有 ok 与 result」的外壳，避免把 Lua 自己返回的 `{ok=true, ...}` 误剥。
 */
export function unwrapResult<T = unknown>(v: unknown): T | null {
  let cur: unknown = v;
  for (let i = 0; i < 4; i++) {
    if (cur === null || cur === undefined) return null;
    if (typeof cur !== "object") return cur as T;
    const o = cur as Record<string, unknown>;
    if ("resultType" in o) { cur = o.result; continue; }
    if ("ok" in o && "result" in o) { cur = o.result; continue; }
    return cur as T;
  }
  return cur as T;
}

/** 互斥判定（按矩阵里的全局互斥图） */
export function conflicts(matrix: MatrixData, a: string, b: string): boolean {
  const g = matrix.mutexGraph || {};
  return (g[a] || []).includes(b) || (g[b] || []).includes(a);
}

/** 把 want 加进已有技法里：先按互斥图剔除冲突项（幂等：已有 want 不重复加） */
export function prune(matrix: MatrixData, existing: string[], want: string): { removed: string[]; next: string[] } {
  const ex = existing || [];
  return {
    removed: ex.filter((k) => conflicts(matrix, k, want)),
    next: [...ex.filter((k) => !conflicts(matrix, k, want) && k !== want), want],
  };
}

/**
 * **一整组技法的自洽化**（给"统一给某批音符设同一组技法"用，如 `sv_write_texture` / `sv_write_chords`
 * 的 `articulations` 参数）：按给出顺序保留，丢掉与已保留项互斥的、以及重复的。
 * ⚠️ 只解**组内自相冲突**；**该乐器到底支不支持**读不出来（API 读不到乐器）⇒ 那部分只能如实告知、留给宿主判。
 */
export function pruneList(matrix: MatrixData, list: string[]): { used: string[]; dropped: { key: string; conflictsWith: string[] }[] } {
  const used: string[] = [];
  const dropped: { key: string; conflictsWith: string[] }[] = [];
  for (const k of list || []) {
    if (used.includes(k)) { dropped.push({ key: k, conflictsWith: ["（重复）"] }); continue; }
    const bad = used.filter((u) => conflicts(matrix, u, k));
    if (bad.length > 0) { dropped.push({ key: k, conflictsWith: bad }); continue; }
    used.push(k);
  }
  return { used, dropped };
}

/** 风格档（缺省用 (default)） */
export function tierOf(rules: RulesData, style?: string): { key: string; tier: StyleTier } {
  const tiers = rules.styleTiers || {};
  // ⚠️ 表里有 `_note` 这类说明性键（值是字符串，不是档位）⇒ 只认「值是对象」的键
  const usable = (k: string) => tiers[k] !== undefined && typeof tiers[k] === "object" && tiers[k] !== null;
  const key = style && usable(style) ? style : "(default)";
  return { key, tier: tiers[key] };
}

/**
 * 乐句切分：**按旋律缺口**（用户口径：有缺口按缺口、没缺口就不切、不做乐句级规则）。
 * 就地给每个音符写 `phrase`（1 起）。
 */
export function splitPhrases(notes: NoteLike[], minGapBeats: number): { phraseCount: number; hasGap: boolean } {
  const sorted = [...notes].sort((a, b) => a.onset - b.onset);
  let phrase = 0;
  let prevEnd: number | null = null;
  for (const n of sorted) {
    if (prevEnd === null || n.onset - prevEnd >= minGapBeats * QUARTER) phrase++;
    n.phrase = phrase;
    prevEnd = n.onset + n.dur;
  }
  return { phraseCount: phrase, hasGap: phrase > 1 };
}

/**
 * 走向规则引擎（10 条；规格见 `skills/sv-ix/references/articulation-rules.{json,md}`）。
 * @param notes 已按 onset 排序、每音带 {index,onset,dur,pitch,phrase,fixed,arts}
 * @param tier  风格档
 * @param hasGap 乐句是否真被缺口切开（否则乐句级规则不触发）
 */
export function planRules(
  notes: NoteLike[], rules: RulesData, tier: StyleTier, hasGap: boolean,
): { index: number; rule: string; want: string; why: string }[] {
  const beatsOf = (n: NoteLike) => n.dur / QUARTER;
  const minBeats = (x: number) => x * (tier.minBeatsScale || 1);
  const runCount = tier.runCount || 3;
  const shortBeats = tier.shortBeats || 0.5;
  const leap = tier.leapSemitones || 7;
  // ⚠️ 乐句级规则要读 `phrase`：**没切过句就别当有句法**（否则 undefined 相等会把整组误判成同一句、
  //    凭空冒出句末/高点判定）。调用方正常路径是 `plan()`，它内部已经 splitPhrases。
  const gapLevel = hasGap && notes.some((n) => typeof n.phrase === "number");
  const assigned = new Map<number, { index: number; rule: string; want: string; why: string }>();
  const claim = (n: NoteLike, rule: string, want: string, why: string) => {
    if (!assigned.has(n.index)) assigned.set(n.index, { index: n.index, rule, want, why });
  };

  // 乐句最高点（乐句级：无缺口不算）
  const phraseMax = new Map<number, NoteLike>();
  if (gapLevel) {
    for (const n of notes) {
      const cur = phraseMax.get(n.phrase as number);
      if (cur === undefined || n.pitch > cur.pitch) phraseMax.set(n.phrase as number, n);
    }
  }

  // 1) sameNoteRepeat：同音连续 ≥ runCount、每个 ≤ shortBeats
  for (let i = 0; i < notes.length;) {
    let j = i + 1;
    while (j < notes.length && notes[j].pitch === notes[i].pitch) j++;
    const run = notes.slice(i, j);
    if (run.length >= runCount && run.every((n) => beatsOf(n) <= shortBeats + 1e-9)) {
      run.forEach((n) => claim(n, "sameNoteRepeat", "Tremolo", "同音 " + run.length + " 个 ≤ " + shortBeats + " 拍"));
    }
    i = j;
  }

  // 2) twoNoteAlternation：A-B-A-B… ≥ runCount 次交替、音程 ≤ 2 半音
  for (let i = 0; i + 2 < notes.length; i++) {
    const iv = Math.abs(notes[i].pitch - notes[i + 1].pitch);
    if (iv === 0 || iv > 2) continue;
    let k = i;
    while (k + 1 < notes.length && Math.abs(notes[k].pitch - notes[k + 1].pitch) === iv) k++;
    const span = k - i + 1;
    if (span - 1 >= runCount) {
      const want = iv === 2 ? "Trill Major" : "Trill Minor";
      for (let m = i; m <= k; m++) claim(notes[m], "twoNoteAlternation", want, "两音交替 " + (span - 1) + " 次 · 音程 " + iv + " 半音");
      i = k;
    }
  }

  // 3) leapIn：与前音音程 ≥ leapSemitones
  for (let i = 1; i < notes.length; i++) {
    const iv = Math.abs(notes[i].pitch - notes[i - 1].pitch);
    if (iv >= leap) claim(notes[i], "leapIn", "Portamento", "大跳 " + iv + " 半音（阈值 " + leap + "）");
  }

  // 4) highPointApproach：乐句最高点且上行进入（乐句级）
  if (gapLevel) {
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const top = phraseMax.get(n.phrase as number);
      if (!top || top.index !== n.index) continue;
      const prev = i > 0 ? notes[i - 1] : null;
      if (prev && prev.phrase === n.phrase && n.pitch - prev.pitch >= 2) {
        claim(n, "highPointApproach", "Accent", "乐句最高点（上行 " + (n.pitch - prev.pitch) + " 半音进入）");
      }
    }
  }

  // 5) fallResolution：高点之后回落 ≥3 半音且落在句末（乐句级）
  if (gapLevel) {
    for (const n of notes) {
      const top = phraseMax.get(n.phrase as number);
      if (!top) continue;
      const isLastOfPhrase = !notes.some((m) => m.phrase === n.phrase && m.onset > n.onset);
      if (isLastOfPhrase && top.index !== n.index && top.pitch - n.pitch >= 3) {
        claim(n, "fallResolution", "Fall", "句末回落 " + (top.pitch - n.pitch) + " 半音");
      }
    }
  }

  // 6) staccatoRun：连续 ≥ runCount 个 ≤ shortBeats、且非同音重复
  for (let i = 0; i < notes.length;) {
    let j = i;
    while (j < notes.length && beatsOf(notes[j]) <= shortBeats + 1e-9) j++;
    const run = notes.slice(i, j);
    const samePitch = run.length > 1 && run.every((n) => n.pitch === run[0].pitch);
    if (run.length >= runCount && !samePitch) {
      run.forEach((n) => claim(n, "staccatoRun", "Staccato", "连续 " + run.length + " 个 ≤ " + shortBeats + " 拍"));
    }
    i = j > i ? j : i + 1;
  }

  // 7) stepwiseRun：同向级进 ≥ runCount 音、每步 ≤ 2 半音
  for (let i = 0; i + 1 < notes.length;) {
    const dir = Math.sign(notes[i + 1].pitch - notes[i].pitch);
    let k = i;
    while (k + 1 < notes.length) {
      const d = notes[k + 1].pitch - notes[k].pitch;
      if (d === 0 || Math.abs(d) > 2 || Math.sign(d) !== dir) break;
      k++;
    }
    const span = k - i + 1;
    if (dir !== 0 && span >= runCount) {
      for (let m = i; m <= k; m++) claim(notes[m], "stepwiseRun", "Slur", "同向级进 " + span + " 音");
      i = k;
    } else i++;
  }

  // 8) phraseEndLong：句末长音（乐句级；无缺口不触发）
  if (gapLevel) {
    for (const n of notes) {
      const isLastOfPhrase = !notes.some((m) => m.phrase === n.phrase && m.onset > n.onset);
      if (isLastOfPhrase && beatsOf(n) >= minBeats(2)) {
        claim(n, "phraseEndLong", "Tenuto", "句末长音 " + beatsOf(n).toFixed(2) + " 拍（阈值 " + minBeats(2) + "）");
      }
    }
  }

  // 9/10) saxScoop / doitExit（族由规则表限定；支持集二次过滤在 plan() 里）
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const prev = i > 0 ? notes[i - 1] : null;
    const next = i + 1 < notes.length ? notes[i + 1] : null;
    if (prev && n.pitch - prev.pitch >= 3 && beatsOf(n) >= minBeats(1)) {
      claim(n, "saxScoop", "Scoop", "上行 " + (n.pitch - prev.pitch) + " 半音进入长音");
    }
    if (next && next.pitch - n.pitch <= -3 && beatsOf(n) >= minBeats(1)) {
      claim(n, "doitExit", "Doit", "下行 " + (n.pitch - next.pitch) + " 半音离开长音");
    }
  }

  const order = new Map((rules.priority || []).map((id, i) => [id, i] as const));
  return [...assigned.values()].sort((a, b) => (order.get(a.rule) ?? 999) - (order.get(b.rule) ?? 999));
}

/**
 * 跳过原因文案。⚠️ 区分两种 fixed：**有技法**（用户/别人手写过）与**空技法**
 *   —— `setArticulations` 会把音符永久置 `articulationsFixed=true`（宿主实测：写一次就锁定，
 *      连写空表也一样，API 清不掉、只能 Ctrl+Z 或 UI 里重开 Smart）⇒ 空 fixed 是常见状态，别一律说成"已有技法"。
 */
function fixedSkipReason(n: NoteLike): string {
  return (n.arts && n.arts.length > 0)
    ? "fixed（已有显式技法 " + n.arts.join(",") + "，force 可覆盖）"
    : "fixed（宿主已锁定为「无技法」——setArticulations 会永久置 fixed，force 可覆盖）";
}

export interface PlanOptions {
  notes: NoteLike[];
  matrix: MatrixData;
  rules: RulesData;
  supported: string[];       // 该轨运行时支持集（宿主读回）
  style?: string;
  segments?: string[];       // "beats=A-B,技法" / "phrases=1,3,技法"
  wantRules?: boolean;
  force?: boolean;
}

export interface PlanResult {
  style: string;
  tierKey: string;
  tier: StyleTier;
  phraseCount: number;
  hasGap: boolean;
  noteCount: number;
  entries: PlanEntry[];
  targets: PlanEntry[];
  errors: string[];
}

/**
 * 总规划：段落级批量开关 + 走向规则（与 `tools/apply-articulations.cjs` 的主流程逐行对应）。
 * **只算不写**；`errors` 非空时应报给用户而不是硬写。
 */
export function plan(opts: PlanOptions): PlanResult {
  const { notes, matrix, rules, supported, style, segments, wantRules, force } = opts;
  const sup = new Set(supported || []);
  const { key: tierKey, tier } = tierOf(rules, style);
  const gapBeats = (rules.phraseSplit && rules.phraseSplit.minGapBeats) || 1;
  const { phraseCount, hasGap } = splitPhrases(notes, gapBeats);
  const sorted = [...notes].sort((a, b) => a.onset - b.onset);
  const entries: PlanEntry[] = [];
  const errors: string[] = [];

  // ① 段落级批量开关
  for (const seg of segments || []) {
    const parts = String(seg).split(",");
    const sel = parts[0].trim();
    const tech = parts.slice(1).join(",").trim();
    if (!tech) { errors.push("段落规格缺技法：" + seg); continue; }
    if (!sup.has(tech)) {
      errors.push("该轨不支持技法「" + tech + "」（支持集：" + [...sup].join(" / ") + "）");
      continue;
    }
    let picked: NoteLike[] = [];
    const mBeats = /^beats=\s*([\d.]+)\s*-\s*([\d.]+)$/.exec(sel);
    const mPhr = /^phrases=\s*([\d,]+)$/.exec(sel);
    if (mBeats) {
      const a = Number(mBeats[1]) * QUARTER;
      const b = Number(mBeats[2]) * QUARTER;
      picked = notes.filter((n) => n.onset >= a - 1 && n.onset < b);
    } else if (mPhr) {
      const want = new Set(mPhr[1].split(",").map((x) => Number(x.trim())));
      picked = notes.filter((n) => want.has(n.phrase as number));
    } else {
      errors.push("段落指认只支持 beats=A-B 或 phrases=1,3（v1）：" + sel);
      continue;
    }
    for (const n of picked) {
      if (n.fixed && !force) { entries.push({ index: n.index, skip: fixedSkipReason(n), want: tech }); continue; }
      if (n.arts.length === 1 && n.arts[0] === tech) { entries.push({ index: n.index, skip: "已是 " + tech, want: tech }); continue; }
      const { removed, next } = prune(matrix, n.arts, tech);
      entries.push({
        index: n.index, onset: n.onset, pitch: n.pitch, phrase: n.phrase, rule: "segment",
        want: tech, before: n.arts.slice(), remove: removed, set: next,
      });
    }
  }

  // ② 走向规则
  if (wantRules) {
    for (const rp of planRules(sorted, rules, tier, hasGap)) {
      const n = notes.find((x) => x.index === rp.index);
      if (!n) continue;
      const rule = rules.rules.find((r) => r.id === rp.rule) || ({} as RuleDef);
      // 族外规则静默跳过：criterion.family 限定了族（如萨克斯），而该乐器连这条规则的键都不支持
      if (rule.criterion && rule.criterion.family) {
        const own = [...(rule.set || []), ...((rule.setAnyOf || []).flat()), ...(rule.fallback || [])];
        if (!own.some((k) => sup.has(k))) continue;
      }
      let want = rp.want;
      let extra = "";
      if (!sup.has(want)) {
        const fbk = Array.isArray(rule.fallback) ? rule.fallback.find((k) => sup.has(k)) : null;
        if (!fbk) {
          entries.push({ index: n.index, rule: rp.rule, why: rp.why, skip: "不支持 " + want + "（且无可用退路）", want });
          continue;
        }
        extra = "（" + want + " 不支持 ⇒ 退 " + fbk + "）";
        want = fbk;
      }
      if (n.fixed && !force) {
        entries.push({ index: n.index, rule: rp.rule, why: rp.why, want, skip: fixedSkipReason(n) });
        continue;
      }
      if (n.arts.length === 1 && n.arts[0] === want) {
        entries.push({ index: n.index, rule: rp.rule, want, skip: "已是 " + want });
        continue;
      }
      const { removed, next } = prune(matrix, n.arts, want);
      entries.push({
        index: n.index, onset: n.onset, pitch: n.pitch, phrase: n.phrase, rule: rp.rule,
        why: rp.why + extra, want, before: n.arts.slice(), remove: removed, set: next,
      });
    }
  }

  return {
    style: style || "(default)", tierKey, tier, phraseCount, hasGap,
    noteCount: notes.length, entries, targets: entries.filter((p) => p.set), errors,
  };
}

/* ─────────────────────────── 宿主侧 Lua 片段（真机验证过，勿随意改写） ─────────────────────────── */

/**
 * 读目标组：组名 + 每音符（onset/dur/pitch/fixed/arts）+ 该轨支持集。
 * ⚠️ `getSupportedArticulations` 只对**当前轨**生效；`getArticulationState` 只对**当前组 + 选中音符**生效
 *    ⇒ 必须 `setCurrentTrack` + `setCurrentGroup`（`selectGroup` 不够，实测静默失败）。
 */
export function fetchGroupCode(groupName?: string): string {
  return `
local proj = SV:getProject()
local ed = SV:getMainEditor()
local out = {}
local g, ref, tr = nil, nil, ed:getCurrentTrack()
if ${groupName ? "true" : "false"} then
  for ti = 1, proj:getNumTracks() do
    local t = proj:getTrack(ti)
    for k = 1, t:getNumGroups() do
      local r = t:getGroupReference(k)
      if r then
        local ok, tgt = pcall(function() return r:getTarget() end)
        if ok and tgt then
          local nm = ''
          pcall(function() nm = tgt:getName() end)
          if nm == '${groupName || ""}' then g = tgt ref = r tr = t end
        end
      end
    end
  end
else
  g = ed:getCurrentGroup():getTarget()
  ref = ed:getCurrentGroup()
end
if g == nil then return { err = 'group not found' } end
pcall(function() ed:setCurrentTrack(tr) end)
pcall(function() ed:setCurrentGroup(ref) end)
local sup = {}
if ed['getSupportedArticulations'] ~= nil then
  local ok, s = pcall(function() return ed:getSupportedArticulations() end)
  if ok and type(s) == 'table' then for _, x in ipairs(s) do sup[#sup + 1] = tostring(x) end end
end
local notes = {}
for j = 1, g:getNumNotes() do
  local n = g:getNote(j)
  local okA, a = pcall(function() return n:getAttributes() end)
  local arts, fixed = {}, false
  if okA and type(a) == 'table' then
    if type(a.articulations) == 'table' then for _, x in ipairs(a.articulations) do arts[#arts + 1] = tostring(x) end end
    fixed = (a.articulationsFixed == true)
  end
  notes[#notes + 1] = { index = j, onset = n:getOnset(), dur = n:getDuration(), pitch = n:getPitch(), fixed = fixed, arts = arts }
end
return { group = g:getName(), noteCount = g:getNumNotes(), supported = sup, notes = notes }
`
}

/** 写技法：targets = [{index, set:[...]}]；写前 `newUndoRecord()`，写完**回读** */export function applyCode(targets: { index: number; set: string[] }[], groupName?: string): string {
  const list = targets.map((t) => "{ index = " + t.index + ", arts = { " +
    t.set.map((k) => "'" + String(k).replace(/'/g, "\\'") + "'").join(", ") + " } }").join(", ");
  return `
local proj = SV:getProject()
proj:newUndoRecord()
local ed = SV:getMainEditor()
local g = nil
if ${groupName ? "true" : "false"} then
  for ti = 1, proj:getNumTracks() do
    local t = proj:getTrack(ti)
    for k = 1, t:getNumGroups() do
      local r = t:getGroupReference(k)
      if r then
        local ok, tgt = pcall(function() return r:getTarget() end)
        if ok and tgt then
          local nm = ''
          pcall(function() nm = tgt:getName() end)
          if nm == '${groupName || ""}' then g = tgt end
        end
      end
    end
  end
else
  g = ed:getCurrentGroup():getTarget()
end
if g == nil then return { ok = false, err = 'group not found' } end
local targets = { ${list} }
local log = {}
for _, t in ipairs(targets) do
  local n = g:getNote(t.index)
  local okW = pcall(function() n:setArticulations(t.arts) end)
  local okA, a = pcall(function() return n:getAttributes() end)
  local back = ''
  if okA and type(a) == 'table' and type(a.articulations) == 'table' then
    local p = {}
    for _, x in ipairs(a.articulations) do p[#p + 1] = tostring(x) end
    back = table.concat(p, ',')
  end
  log[#log + 1] = { index = t.index, writeOk = okW, readback = back, fixed = tostring(okA and a.articulationsFixed) }
end
return { ok = true, group = g:getName(), log = log }
`
}

/**
 * **给整组音符统一设同一组技法**（2026-09-21 为"暴露 articulations"加）。
 * 用途：`sv_write_chords` 走的是 `chordSegs`（音符在桥端展开）⇒ 拿不到逐音载荷，
 * 就等它建完组、用返回的 `groupName` 再补这一次调用；`sv_write_texture` 则直接走逐音载荷（不需要本片段）。
 * ⚠️ 同样只调已确认存在的成员（`setArticulations` → 退化 `setAttributes`），写前 `newUndoRecord()`，写完逐音回读。
 */
export function applyToGroupCode(groupName: string, arts: string[]): string {
  const safeName = String(groupName).replace(/'/g, "\\'");
  const list = (arts || []).map((k) => "'" + String(k).replace(/'/g, "\\'") + "'").join(", ");
  return `
local proj = SV:getProject()
proj:newUndoRecord()
local g = nil
for ti = 1, proj:getNumTracks() do
  local t = proj:getTrack(ti)
  for k = 1, t:getNumGroups() do
    local r = t:getGroupReference(k)
    if r then
      local ok, tgt = pcall(function() return r:getTarget() end)
      if ok and tgt then
        local nm = ''
        pcall(function() nm = tgt:getName() end)
        if nm == '${safeName}' then g = tgt end
      end
    end
  end
end
if g == nil then return { ok = false, err = 'group not found' } end
local arts = { ${list} }
local wrote, empty, sample = 0, 0, ''
for j = 1, g:getNumNotes() do
  local n = g:getNote(j)
  local okW = pcall(function() n:setArticulations(arts) end)
  local okA, a = pcall(function() return n:getAttributes() end)
  local back = ''
  if okA and type(a) == 'table' and type(a.articulations) == 'table' then
    local p = {}
    for _, x in ipairs(a.articulations) do p[#p + 1] = tostring(x) end
    back = table.concat(p, ',')
  end
  if okW and back ~= '' then wrote = wrote + 1 else empty = empty + 1 end
  if sample == '' then sample = back end
end
return { ok = true, group = g:getName(), noteCount = g:getNumNotes(), written = wrote, empty = empty, sample = sample }
`
}
