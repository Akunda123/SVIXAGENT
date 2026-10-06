/**
 * **`ace_vocal_params` 的离线单测**（不碰 ACE、不碰用户工程、不联网）
 * 运行：cd server && node tests/ace-vocalparams.mjs
 *
 * 为什么这些要单测：ACE 的参数写入有**两条只在实际写的时候才暴露**的坑，而它们都该在本地先挡住 ——
 *   · **越界一律 `INVALID_ARG`，引擎从不 clamp**（`skills/ace-params/SKILL.md` §8）⇒ 我们**也不许 clamp**：
 *     否则"用户写 1.4"会静默变成 1.0，与用户在 ACE 里看到的不一致。这点**故意与 `sv_write_automation` 相反**。
 *   · **dense 的每一段连续 run 至少 2 个 tick**（`help vocalparam write`）⇒ 单元素载荷、孤立一个值、单戳一个 `null`
 *     都会被**直接拒**；不本地先查就是白跑一次（还可能要用户等一次 busy 门）。
 * 夹具的字段名逐条抄自真机 `vocalparam layers/read --json` 的回包（2026-10-05 本机 ACE 2.1.8 / CLI 0.17.0）。
 */
import { registerTools } from '../dist/tools.js';
import {
  readRoster, readParam, gateParam, gateLayer, makePayload, checkPayload, denseRunViolations,
  buildWriteArgs, summarizeWriteAccepted, compareReadBack, summarizePoints, encodeF64le,
  decodeF64leEnvelope, isBase64Envelope, pointsArg, cleanupPoints,
} from '../dist/ace/vocal-params.js';
import { prepareAceWrite, acceptedVsReadBack, classifyCliFailure } from '../dist/ace/prewrite.js';
import { existsSync, readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 400) : '')); }
};

const res = (json, code = 0, stderr = '') => ({ code, json, stdout: json ? JSON.stringify(json) : '', stderr, cmd: 'fake-acestudio-cli', args: [] });

/* ───────────────── 合成夹具（v2 / singing-mamba 那一代，字段名抄真机） ───────────────── */

const LAYERS = {
  clipUuid: '{c0}', engineGeneration: 'singing-mamba', vocalControlRoute: 'dynamic', paramCount: 5,
  params: [
    { param: 'dynamic', displayName: 'Dynamic', available: true, scale: 'control', valueRange: { min: -1, max: 1 },
      layers: [{ layer: 'user', access: 'read-write', role: 'override', shape: 'points', sparse: true }] },
    { param: 'air', displayName: 'Air', available: true, scale: 'model', valueRange: { min: 0, max: 1 },
      layers: [{ layer: 'baseline', access: 'read-only', role: 'analyzed-pristine', shape: 'dense', sparse: false },
        { layer: 'user', access: 'read-write', role: 'override', shape: 'dense', sparse: true }] },
    { param: 'tension', displayName: 'Tension', available: true, scale: 'model', valueRange: { min: 0, max: 1 },
      layers: [{ layer: 'baseline', access: 'read-only', role: 'analyzed-pristine', shape: 'dense', sparse: false },
        { layer: 'user', access: 'read-write', role: 'override', shape: 'dense', sparse: true }] },
    { param: 'formant', displayName: 'Formant', available: false, layers: [],
      unavailableReason: "the clip's singing-mamba engine generation has no formant parameter" },
    { param: 'pitch', displayName: 'Pitch', available: false, scale: 'semitones', layers: [],
      unavailableReason: 'pitch curves are not on this surface yet: the channel stores a delta while the draw primitive takes absolute pitch, and anchors and vibrato ride on top' },
  ],
};

const READ_AIR = {
  clipUuid: '{c0}', param: 'air', displayName: 'Air', engineGeneration: 'singing-mamba',
  scale: 'model', valueRange: { min: 0, max: 1 }, posBegin: 0, count: 6, fingerprint: '2:vocalparam-curve:abcd1234',
  unvoiced: [{ begin: 0, end: 96 }],
  layers: [
    { layer: 'baseline', access: 'read-only', role: 'analyzed-pristine', shape: 'dense', sparse: false, points: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
    { layer: 'user', access: 'read-write', role: 'override', shape: 'dense', sparse: true, points: [null, null, 0.62, 0.62, null, null] },
  ],
  effective: { layer: 'effective', access: 'read-only', role: 'merged', shape: 'dense', points: [0.5, 0.5, 0.55, 0.55, 0.5, 0.5] },
};

const TRACK = { trackIndex: 0, trackName: 'Elirah', trackType: 'Sing', trackUuid: '{t0}', clipCount: 1 };
const CLIP = { clipUuid: '{c0}', clipName: 'C', clipType: 'sing', clipBegin: 3360, clipBeginSec: 3360 / 1080.00108000108, clipEnd: 7200, clipEndSec: 7200 / 1080.00108000108, noteCount: 3 };
const DIRTY_TEMP = { dirty: true, isNewProject: true, isTempProject: true, projectName: '', projectPath: '' };

function makeRunner(overrides = {}) {
  const calls = [];
  const base = (args) => {
    const a = args[0], b = args[1];
    if (a === 'track' && b === 'list') return res({ contentTrackCount: 1, tracks: [TRACK] });
    if (a === 'clip' && b === 'list') return res({ clipCount: 1, clips: [CLIP] });
    if (a === 'vocalparam' && b === 'layers') return res(LAYERS);
    if (a === 'vocalparam' && b === 'read') return res(READ_AIR);
    if (a === 'project' && b === 'dirty') return res(DIRTY_TEMP);
    if (a === 'project' && b === 'save') return res({ saved: true });
    return res(null, 2, 'unexpected: ' + args.join(' '));
  };
  const key = (args) => (args[0] || '') + ' ' + (args[1] || '');
  const run = (args, timeoutMs) => { calls.push(args.slice()); return (overrides[key(args)] || base)(args, timeoutMs); };
  run.calls = calls;
  return run;
}
const a_key = (args) => args[0] + ' ' + (args[1] || '');

/* ───────────────── ① 注册 + 描述里的承诺 ───────────────── */

console.log('== ① 工具注册与明写的硬口径 ==');
const registered = new Map();
{
  registerTools({ tool: (name, desc, schema, fn) => registered.set(name, { desc, schema, fn }) });
  const t = registered.get('ace_vocal_params');
  ok("注册了 ace_vocal_params", !!t);
  const keys = Object.keys(t?.schema || {});
  ok("schema 含三种载荷 + layer/posBegin/encoding/dryRun/saveFirst",
    ['values', 'anchors', 'scalarValue', 'layer', 'posBegin', 'encoding', 'dryRun', 'saveFirst', 'param'].every((k) => keys.includes(k)), keys);
  ok("描述写明「越界直接拒，绝不 clamp」并与 sv_write_automation 划清",
    /越界直接拒/.test(t.desc) && /绝不 clamp/.test(t.desc) && /sv_write_automation/.test(t.desc));
  ok("描述写明「每次现读花名册」+「dense 每段 run ≥ 2 tick」+「写后读回分开报」",
    /每次现读/.test(t.desc) && /至少 2 tick|至少 2 个 tick/.test(t.desc) && /读回/.test(t.desc));
}

/* ───────────────── ② 花名册解析（每次现读） ───────────────── */

console.log('\n== ② 花名册（`vocalparam layers`）：可用性/尺度/范围/层与形状 ==');
{
  const run = makeRunner();
  const r = readRoster(run, '{c0}');
  ok("读出发动机世代 + 路由（**别按声库名推断**）", r.engineGeneration === 'singing-mamba' && r.vocalControlRoute === 'dynamic', { g: r.engineGeneration, route: r.vocalControlRoute });
  const air = r.params.find((p) => p.param === 'air');
  ok("air = model [0,1]，层 = baseline(ro/dense) + user(rw/dense/sparse)",
    air.scale === 'model' && air.valueRange.max === 1 && air.layers.length === 2 && air.layers[1].layer === 'user' && air.layers[1].shape === 'dense' && air.layers[1].sparse === true, air);
  const dyn = r.params.find((p) => p.param === 'dynamic');
  ok("dynamic 只有 user 层、形状是 points（锚点）", dyn.available === true && dyn.layers.length === 1 && dyn.layers[0].shape === 'points' && dyn.scale === 'control', dyn);
  const formant = r.params.find((p) => p.param === 'formant');
  ok("formant available:false 带原因、层为空、且**没有** valueRange（实测它不带这两个字段）",
    formant.available === false && formant.layers.length === 0 && formant.valueRange === undefined && /no formant parameter/.test(formant.unavailableReason), formant);
  const two = makeRunner();
  readRoster(two, '{c0}'); readRoster(two, '{c0}');
  ok("花名册**每次现读**（同一进程里调两次就发两次命令，不缓存）",
    two.calls.filter((c) => a_key(c) === 'vocalparam layers').length === 2, two.calls.map(a_key));
}

/* ───────────────── ③ 三道门：未知参数 / 不可用参数 / 层 ───────────────── */

console.log('\n== ③ 三道门（未知参数 · available:false · 层只读/缺 layer） ==');
{
  const roster = readRoster(makeRunner(), '{c0}');
  const g1 = gateParam(roster, 'power');
  ok("未知参数 ⇒ 拒，并把可选清单回给用户（路由也带出来）",
    !g1.ok && /没有参数/.test(g1.error) && g1.detail.availableParams.includes('air') && g1.detail.vocalControlRoute === 'dynamic', g1);
  const g2 = gateParam(roster, 'pitch');
  ok("pitch ⇒ 拒 + 原样带出 unavailableReason", !g2.ok && /available:false/.test(g2.error) && /delta/.test(g2.detail.unavailableReason), g2);
  ok("pitch 的处置指向文件路（`.acep` 的 rap-curve）", /rap-curve/.test(g2.detail.hint), g2.detail.hint);
  const g3 = gateParam(roster, 'air');
  ok("air 可用 ⇒ 放行", g3.ok && g3.value.param === 'air');

  const air = g3.value;
  const l1 = gateLayer(air, undefined);
  ok("`--layer` 必填（不猜调用方想写哪层）", !l1.ok && /必须点名/.test(l1.error), l1);
  const l2 = gateLayer(air, 'baseline');
  ok("baseline 是只读 ⇒ 拒", !l2.ok && /read-only/.test(l2.error), l2);
  const l3 = gateLayer(air, 'effective');
  ok("effective 永远不可写 ⇒ 拒（合并规则归引擎）", !l3.ok && /effective/.test(l3.error), l3);
  const l4 = gateLayer(air, 'user');
  ok("user 可写 ⇒ 放行，并带回声明的形状", l4.ok && l4.value.layer === 'user' && l4.value.shape === 'dense', l4);
}

/* ───────────────── ④ 载荷形状互斥 ───────────────── */

console.log('\n== ④ 一次只给一种载荷形状 ==');
{
  ok("什么都不给 ⇒ 拒（说清三种形状）", !makePayload({}).ok && /三者之一/.test(makePayload({}).error));
  const two = makePayload({ values: [0.1, 0.1], anchors: [[0, 0.1]] });
  ok("两种一起给 ⇒ 拒", !two.ok && /只能给一种/.test(two.error), two);
  ok("values ⇒ dense", makePayload({ values: [0.1, 0.1] }).value.kind === 'dense');
  ok("anchors ⇒ points", makePayload({ anchors: [[0, 0.1]] }).value.kind === 'points');
  ok("scalarValue ⇒ scalar", makePayload({ scalarValue: 0.3 }).value.kind === 'scalar');
}

/* ───────────────── ⑤ 越界一律拒、绝不 clamp（与 sv_write_automation 故意不同） ───────────────── */

console.log('\n== ⑤ 越界 ⇒ 拒 + 回合法区间；**不 clamp** ==');
{
  const roster = readRoster(makeRunner(), '{c0}');
  const info = roster.params.find((p) => p.param === 'air');
  const user = info.layers.find((l) => l.layer === 'user');
  const values = [0, 0.5, 1.4, 1.4];
  const chk = checkPayload({ kind: 'dense', values, posBegin: 0 }, user, info, {});
  ok("越界 ⇒ ok:false", chk.ok === false, chk);
  ok("逐条点名越界 tick 与**合法区间**（两个越界点都列出来，不合并）",
    chk.errors.length === 2 && chk.errors.some((e) => /tick 2 = 1\.4/.test(e) && /\[0, 1\]/.test(e)) && /tick 3 = 1\.4/.test(chk.errors[1]), chk.errors);
  ok("legalRange 原样回给用户", chk.legalRange.min === 0 && chk.legalRange.max === 1, chk.legalRange);
  ok("**没有 clamp**：越界时一个 pointsJson 都没有产出（没有「偷偷夹到边界」这种东西）", chk.pointsJson === undefined, chk.pointsJson);
  ok("**不改调用方的数组**（既不 clamp 也不就地改）", values[2] === 1.4 && values[3] === 1.4, values);
  ok("合法载荷 ⇒ 放行且原样序列化（不做任何数值加工）", checkPayload({ kind: 'dense', values: [0, 0.5], posBegin: 0 }, user, info, {}).pointsJson === '[0,0.5]');

  // 越界时**不该**只报第一个：两个越界点都要报
  const multi = checkPayload({ kind: 'dense', values: [2, 2, -3, -3], posBegin: 0 }, user, info, {});
  ok("多处越界 ⇒ 全部列出（4 条）", multi.errors.length === 4, multi.errors);

  const scalarBad = checkPayload({ kind: 'scalar', scalar: 1.25 }, { layer: 'global', access: 'read-write', shape: 'scalar' }, info, {});
  ok("scalar 越界也拒（同一套区间判据）", !scalarBad.ok && /越界/.test(scalarBad.errors[0]), scalarBad);
}

/* ───────────────── ⑥ dense 的两条硬门槛：每段 run ≥ 2 tick / posBegin 必填 ───────────────── */

console.log('\n== ⑥ dense 的两条硬门槛（`help vocalparam write`） ==');
{
  const roster = readRoster(makeRunner(), '{c0}');
  const info = roster.params.find((p) => p.param === 'air');
  const user = info.layers.find((l) => l.layer === 'user');

  const v1 = denseRunViolations([null, null, 0.62, null, null]);
  ok("孤零零一个值 ⇒ 报出那段 1-tick 的 run", v1.length === 1 && v1[0].start === 2 && v1[0].kind === 'values', v1);
  const v2 = denseRunViolations([0.5, 0.5, null, 0.5, 0.5]);
  ok("在值的 run 里只戳一个 null ⇒ 也报（null 的 run 只有 1 tick）", v2.length === 1 && v2[0].kind === 'gap', v2);
  const v3 = denseRunViolations([0.62, null, null]);
  ok("载荷**边缘**只有 1 tick ⇒ 也报（载荷外的邻居不算）", v3.length === 1 && v3[0].start === 0 && v3[0].kind === 'values', v3);
  ok("两个 tick 的 run ⇒ 合法（最短可接受形状）", denseRunViolations([0.5, 0.5, null, null]).length === 0);

  const c1 = checkPayload({ kind: 'dense', values: [null, null, 0.62, null, null], posBegin: 1920 }, user, info, {});
  ok("`[null,null,0.62,null,null]` ⇒ 拒，并点名 tick 1922 + 告诉怎么写",
    !c1.ok && c1.errors.some((e) => /至少 2 个 tick/.test(e) && /tick 1922/.test(e) && /越过它两侧/.test(e)), c1.errors);
  const c2 = checkPayload({ kind: 'dense', values: [0.62], posBegin: 0 }, user, info, {});
  ok("单元素载荷 ⇒ 拒", !c2.ok && /至少 2 个 tick/.test(c2.errors.join('')), c2.errors);
  const c3 = checkPayload({ kind: 'dense', values: [0.6, 0.6], posBegin: 1920 }, user, info, {});
  ok("`[0.6,0.6]` + posBegin ⇒ 放行（合法最短形状）", c3.ok && c3.posBegin === 1920, c3);

  const c4 = checkPayload({ kind: 'dense', values: [0.6, 0.6] }, user, info, {});
  ok("dense 缺 posBegin 且没有回退值 ⇒ 拒（官方原话：posBegin is required for a dense write）",
    !c4.ok && /posBegin/.test(c4.errors.join('')), c4.errors);
  const c5 = checkPayload({ kind: 'dense', values: [0.6, 0.6] }, user, info, { posBeginFallback: 0 });
  ok("有回退（现读回包的 posBegin）⇒ 放行", c5.ok && c5.posBegin === 0, c5);
}

/* ───────────────── ⑦ 形状按层**声明的** shape 走 ───────────────── */

console.log('\n== ⑦ 形状必须等于该层声明的 `shape` ==');
{
  const roster = readRoster(makeRunner(), '{c0}');
  const air = roster.params.find((p) => p.param === 'air');
  const dyn = roster.params.find((p) => p.param === 'dynamic');
  const airUser = air.layers.find((l) => l.layer === 'user');
  const dynUser = dyn.layers.find((l) => l.layer === 'user');

  const w1 = checkPayload({ kind: 'points', anchors: [[0, 0.5]] }, airUser, air, {});
  ok("给 dense 层发 points ⇒ 拒（说清声明的是 dense）", !w1.ok && /shape/.test(w1.errors[0]) && /dense/.test(w1.errors[0]), w1.errors);
  const w2 = checkPayload({ kind: 'dense', values: [0.5, 0.5], posBegin: 0 }, dynUser, dyn, {});
  ok("给 points 层发 dense ⇒ 拒（说清声明的是 points）", !w2.ok && /points/.test(w2.errors[0]), w2.errors);
  const w3 = checkPayload({ kind: 'points', anchors: [[0, -0.5], [960, 0.8]] }, dynUser, dyn, {});
  ok("dynamic 的 points（负值偏 Soft/Breathy、正值偏 Power/Chest）⇒ 放行", w3.ok && w3.pointsJson === '[[0,-0.5],[960,0.8]]', w3);
  const w4 = checkPayload({ kind: 'points', anchors: [[0, 5], [960, 0.8]] }, dynUser, dyn, {});
  ok("points 越界（dynamic 是 [-1,1]）也拒", !w4.ok && /越界/.test(w4.errors[0]), w4.errors);
}

/* ───────────────── ⑧ points 的锚点规矩 + base64 编码 ───────────────── */

console.log('\n== ⑧ points 锚点规矩 · `--pos-begin` 只属于 dense · base64 载荷 ==');
{
  const roster = readRoster(makeRunner(), '{c0}');
  const dyn = roster.params.find((p) => p.param === 'dynamic');
  const dynUser = dyn.layers.find((l) => l.layer === 'user');

  const unsorted = checkPayload({ kind: 'points', anchors: [[960, 0.2], [0, 0.8]] }, dynUser, dyn, {});
  ok("锚点 tick 必须升序 ⇒ 否则拒", !unsorted.ok && /升序/.test(unsorted.errors[0]), unsorted.errors);
  const dup = checkPayload({ kind: 'points', anchors: [[0, 0.2], [0, 0.8]] }, dynUser, dyn, {});
  ok("锚点 tick 不许重复 ⇒ 拒", !dup.ok && /升序|重复/.test(dup.errors[0]), dup.errors);
  const gapMark = checkPayload({ kind: 'points', anchors: [[0, null], [960, null]] }, dynUser, dyn, {});
  ok("全 gap 载荷 = 擦除形式（`[tick,null]` 是空档标记）⇒ 放行", gapMark.ok && gapMark.pointsJson === '[[0,null],[960,null]]', gapMark);
  const withPb = checkPayload({ kind: 'points', anchors: [[0, 0.5]], posBegin: 0 }, dynUser, dyn, {});
  ok("points 给 posBegin ⇒ 我们**不发**它，并留一条 warning 说明", withPb.ok && withPb.warnings.some((w) => /pos-begin/.test(w)), withPb);

  const air = roster.params.find((p) => p.param === 'air');
  const airUser = air.layers.find((l) => l.layer === 'user');
  const b64 = checkPayload({ kind: 'dense', values: [0.5, 0.5, null, null, 0.25, 0.25], posBegin: 0 }, airUser, air, { encoding: 'base64' });
  ok("base64 ⇒ `--points` 变成 `{dtype,count,data}` 信封", b64.ok && JSON.parse(b64.pointsJson).dtype === 'f64le' && JSON.parse(b64.pointsJson).count === 6, b64.pointsJson || b64.errors);
  const env = JSON.parse(b64.pointsJson);
  const buf = Buffer.from(env.data, 'base64');
  ok("base64 里 **null = NaN 位型**（空档不是 0）",
    Number.isNaN(buf.readDoubleLE(16)) && Number.isNaN(buf.readDoubleLE(24)) && buf.readDoubleLE(0) === 0.5 && buf.readDoubleLE(32) === 0.25,
    [buf.readDoubleLE(0), buf.readDoubleLE(16), buf.readDoubleLE(32)]);
  ok("我们自己编码的 f64le 信封自洽（count×8 == 字节数）", buf.length === env.count * 8, buf.length);
  ok("base64 走的是**同一条** run 规则（单 tick 的 null 一样被拒）",
    !checkPayload({ kind: 'dense', values: [0.5, 0.5, null, 0.25, 0.25], posBegin: 0 }, airUser, air, { encoding: 'base64' }).ok,
    checkPayload({ kind: 'dense', values: [0.5, 0.5, null, 0.25, 0.25], posBegin: 0 }, airUser, air, { encoding: 'base64' }).errors);
  ok("encodeF64le 直接可用（NaN 位型）", Number.isNaN(Buffer.from(encodeF64le([null, 1]).data, 'base64').readDoubleLE(0)));
}

/* ───────────────── ⑨ 写参数组装（dense 有 --pos-begin；points 没有） ───────────────── */

console.log('\n== ⑨ `vocalparam write` 参数组装 ==');
{
  const dense = buildWriteArgs({ clipUuid: '{c0}', param: 'air', layer: 'user', pointsJson: '[0.6,0.6]', posBegin: 1920, ifMatch: 'FP', waitBusy: '5s' });
  ok("dense ⇒ 带 `--pos-begin 1920`（官方原话：dense 必填）", dense.includes('--pos-begin') && dense[dense.indexOf('--pos-begin') + 1] === '1920', dense);
  ok("写一律点名 `--layer`（没有默认值）", dense.includes('--layer') && dense[dense.indexOf('--layer') + 1] === 'user', dense);
  ok("带 `--if-match`（ETag 语义）与 `--wait-busy`", dense.includes('--if-match') && dense.includes('--wait-busy'), dense);
  const points = buildWriteArgs({ clipUuid: '{c0}', param: 'dynamic', layer: 'user', pointsJson: '[[0,0.5]]' });
  ok("points ⇒ **不**带 `--pos-begin`（会被引擎拒）", !points.includes('--pos-begin'), points);
  const b64 = buildWriteArgs({ clipUuid: '{c0}', param: 'air', layer: 'user', pointsJson: '{"dtype":"f64le","count":2,"data":"AA=="}', posBegin: 0, encoding: 'base64' });
  ok("base64 ⇒ 带 `--encoding base64`", b64.includes('--encoding') && b64[b64.indexOf('--encoding') + 1] === 'base64', b64);
  const json = buildWriteArgs({ clipUuid: '{c0}', param: 'air', layer: 'user', pointsJson: '[0.5,0.5]', posBegin: 0, encoding: 'json' });
  ok("encoding:json（默认）⇒ **不**带 `--encoding`", !json.includes('--encoding'), json);

  /* ⚠️ 载荷传输（真机踩过 + 官方口径）：`--points` 是命令行参数，Windows 上限约 32 KB
   * ⇒ 长曲线必须 `--points @<file>`（"A curve is bulk data. Read it from a file or a pipe"）。 */
  const shortPts = pointsArg('[0.6,0.6]');
  ok("短载荷 ⇒ 直接进命令行（不落文件）", shortPts.inline === true && shortPts.tempPath === undefined && shortPts.arg === '[0.6,0.6]', shortPts);
  const longPts = pointsArg(JSON.stringify(new Array(5000).fill(0.5)));
  ok("长载荷（5000 个值 ≈ 25 KB）⇒ 落临时文件 + `@<file>`",
    longPts.inline === false && !!longPts.tempPath && longPts.arg === '@' + longPts.tempPath && existsSync(longPts.tempPath), longPts);
  ok("落盘的载荷内容与要发的一字不差", readFileSync(longPts.tempPath, 'utf8') === JSON.stringify(new Array(5000).fill(0.5)));
  const fileArgs = buildWriteArgs({ clipUuid: '{c0}', param: 'air', layer: 'user', pointsJson: 'X', pointsFile: longPts.tempPath, posBegin: 0 });
  ok("`pointsFile` ⇒ `--points @<file>`（不是把 2 MB JSON 塞进 argv）", fileArgs[fileArgs.indexOf('--points') + 1] === '@' + longPts.tempPath, fileArgs);
  cleanupPoints(longPts.tempPath);
  ok("`cleanupPoints` 用完就删（别把用户目录当地盘）", !existsSync(longPts.tempPath));
  ok("`cleanupPoints(undefined)` 安全（不抛）", cleanupPoints(undefined) === undefined);
}

/* ───────────────── ⑩ 写响应 × 读回：f32 容差 + 空档分开算 + 两块分开报 ───────────────── */

console.log('\n== ⑩ 「ACE 接受了」vs「读回看到」（§3.6c；值读回会变，是 f32 精度） ==');
{
  const wrote = [0.5, 0.5, 0.25, 0.25];
  const after = { posBegin: 0, layers: [{ layer: 'user', points: [0.5, 0.5, 0.25, 0.3] }] };
  const cmp = compareReadBack({ wrote, posBegin: 0, read: after, layer: 'user' });
  ok("逐 tick 比对：3 个对上、1 个对不上 ⇒ valueMismatch=1 且带样例",
    cmp.layerFound === true && cmp.checkedTicks === 4 && cmp.valuesAgree === 3 && cmp.valueMismatch === 1 && cmp.sample[0].tick === 3, cmp);
  ok("比对用的是 f32 级容差（不按写入值做逐位比）", /f32/.test(cmp.note) && cmp.tolerance === 1e-6, cmp.note);

  const f32 = compareReadBack({ wrote: [1.2, 0.8], posBegin: 0, read: { posBegin: 0, layers: [{ layer: 'user', points: [1.2000000476837158, 0.800000011920929] }] }, layer: 'user' });
  ok("写 1.2 读回 1.2000000476837158 ⇒ 算**一致**（实测就是这样）", f32.valueMismatch === 0 && f32.valuesAgree === 2, f32);

  const gaps = compareReadBack({ wrote: [null, null, 0.4, 0.4], posBegin: 0, read: { posBegin: 0, layers: [{ layer: 'user', points: [null, null, 0.4, 0.4] }] }, layer: 'user' });
  ok("空档单独计数（写 null = 抹掉，读回也应是 null）", gaps.gapAgree === 2 && gaps.gapMismatch === 0 && gaps.valuesAgree === 2, gaps);

  const noLayer = compareReadBack({ wrote: [0.5], posBegin: 0, read: { layers: [] }, layer: 'user' });
  ok("读回里没有这一层 ⇒ 如实说「可能还没刷新」而不是假装一致", noLayer.layerFound === false && /还没刷新|不存在/.test(noLayer.note), noLayer);

  const accepted = summarizeWriteAccepted({ param: 'air', layer: 'user', posBegin: 0, count: 4, clearedCount: 0, fingerprint: '2:vocalparam-curve:ffff' });
  ok("写响应只取要看的字段（param/layer/posBegin/count/clearedCount/fingerprint）",
    accepted.count === 4 && accepted.clearedCount === 0 && accepted.fingerprint === '2:vocalparam-curve:ffff', accepted);
  const cleared = summarizeWriteAccepted({ param: 'air', layer: 'user', posBegin: 1920, count: 480, clearedCount: 480 });
  ok("clearedCount 报「这次抹掉了多少 tick」（写 null 时 > 0）", cleared.clearedCount === 480, cleared);

  const av = acceptedVsReadBack(accepted, cmp, false);
  ok("报告分两块 + consistent=false（写响应 ≠ 读回）", av.accepted.count === 4 && av.readBack.valueMismatch === 1 && av.consistent === false, av);
  ok("note 提醒以 ACE 界面为准", /界面/.test(av.note), av.note);
}

/* ───────────────── ⑪ 读的摘要：别把 28 万个点倒进上下文 ───────────────── */

console.log('\n== ⑪ 读摘要（dense 每 tick 一值；判「有人画过」看 nonNull） ==');
{
  const pts = new Array(282240).fill(null);
  pts[0] = 0.2; pts[1] = 0.2; pts[1000] = 0.9;
  const s = summarizePoints(pts, { max: 8 });
  ok("只回取样（≤ max 条），但计数/值域/非空数是全量的",
    s.count === 282240 && s.samples.length === 8 && s.sampleStep > 1, { n: s.samples.length, step: s.sampleStep });
  ok("nonNull = 被画过的 tick 数（**这才是「谁画过」的判据**，不是 effective 有没有变化）", s.nonNull === 3 && s.gaps === 282237, { nonNull: s.nonNull });
  ok("min/max 与首末非空位置都在", s.min === 0.2 && s.max === 0.9 && s.firstNonNullAt === 0 && s.lastNonNullAt === 1000, s);
  ok("摘要自述「点太多只回取样」", /取样/.test(s.note), s.note);
  ok("没有点 ⇒ null（不假装空数组）", summarizePoints(undefined) === null);
  ok("空数组 ⇒ count 0", summarizePoints([]).count === 0);
}

/* ───────────────── ⑫ 读回包解析（真机字段名） ───────────────── */

console.log('\n== ⑫ `vocalparam read` 回包解析（层/effective/posBegin/指纹/unvoiced） ==');
{
  const run = makeRunner();
  const r = readParam(run, '{c0}', 'air', 'user');
  ok("元数据：engineGeneration/scale/valueRange/posBegin/count/fingerprint",
    r.engineGeneration === 'singing-mamba' && r.scale === 'model' && r.posBegin === 0 && r.count === 6 && r.fingerprint === '2:vocalparam-curve:abcd1234', r);
  ok("layers 逐层带回 access/role/shape/sparse/points", r.layers.length === 2 && r.layers[1].sparse === true && r.layers[1].points.length === 6, r.layers.map((l) => l.layer));
  ok("effective 单独一块（只读的合并结果）", r.effective && r.effective.access === 'read-only' && r.effective.points.length === 6, r.effective);
  ok("unvoiced 段原样带回", Array.isArray(r.unvoiced) && r.unvoiced.length === 1, r.unvoiced);
  ok("读命令带了 `--layer user`", run.calls.some((c) => c.includes('--layer') && c[c.indexOf('--layer') + 1] === 'user'), run.calls);

  const bad = makeRunner({ 'vocalparam read': () => res(null, 1, 'error[INVALID_ARG]: parameter "formant" is not available') });
  let threw = null;
  try { readParam(bad, '{c0}', 'formant', 'envelope'); } catch (e) { threw = e.message; }
  ok("读失败 ⇒ 抛且带出引擎原文（不静默返回空）", !!threw && /formant/.test(threw), threw);

  /* ⚠️ 大回包的两条活路（真机实测：整条 clip 的 dense JSON 回包 = **39.4 MB**，base64 = 2.3 MB）：
   *   · 读默认 `--encoding base64`（信封 `{dtype:'f64le',count,data}`，空档 = NaN 位型）；
   *   · `--range-begin/--range-end`（clip-local tick，end 开区间）只取一段。 */
  const enc = makeRunner();
  readParam(enc, '{c0}', 'air', 'user', { encoding: 'base64', rangeBegin: 960, rangeEnd: 1920 });
  const encArgs = enc.calls[0];
  ok("读可带 `--encoding base64`（39 MB → 2.3 MB）", encArgs.includes('--encoding') && encArgs[encArgs.indexOf('--encoding') + 1] === 'base64', encArgs);
  ok("读可带 `--range-begin/--range-end`（只取一段）",
    encArgs[encArgs.indexOf('--range-begin') + 1] === '960' && encArgs[encArgs.indexOf('--range-end') + 1] === '1920', encArgs);
  const plain = makeRunner();
  readParam(plain, '{c0}', 'air', 'user');
  ok("不传 options ⇒ 不发 `--encoding`/`--range-*`（保持原样命令）", !plain.calls[0].includes('--encoding') && !plain.calls[0].includes('--range-begin'), plain.calls[0]);

  // base64 形态的读回也要能摘要（NaN ⇒ null）
  const envLayer = { layer: 'user', access: 'read-write', shape: 'dense', sparse: true, points: encodeF64le([0.5, 0.5, null, null, 0.25, 0.25]) };
  const envRun = makeRunner({ 'vocalparam read': () => res({ ...READ_AIR, layers: [envLayer] }) });
  const envRead = readParam(envRun, '{c0}', 'air', 'user', { encoding: 'base64' });
  ok("base64 信封被解成数组（NaN ⇒ null，与 json 形态对齐）",
    Array.isArray(envRead.layers[0].points) && envRead.layers[0].points.length === 6 && envRead.layers[0].points[2] === null && envRead.layers[0].points[0] === 0.5,
    envRead.layers[0].points);
  ok("层上标明 points 的来源形态（json / base64）", envRead.layers[0].drew === 'base64', envRead.layers[0].drew);
  ok("isBase64Envelope 认信封、不认数组", isBase64Envelope(encodeF64le([1, 2])) === true && isBase64Envelope([1, 2]) === false && isBase64Envelope(null) === false);
  ok("decodeF64leEnvelope 小端解值（含 NaN ⇒ null）",
    JSON.stringify(decodeF64leEnvelope(encodeF64le([1.5, null]))) === JSON.stringify([1.5, null]), decodeF64leEnvelope(encodeF64le([1.5, null])));
}

/* ───────────────── ⑬ 写前纪律 + 失败分类（与 ace_lyrics 同一套） ───────────────── */

console.log('\n== ⑬ 写前纪律（dirty 先 save）与失败分类 ==');
{
  const r = makeRunner();
  const p = prepareAceWrite(r, {});
  ok("dirty:true ⇒ 默认 `project save` 后再写（并自述）", p.ok && p.savedBeforeWrite === true, p);
  ok("临时工程 ⇒ 提醒「接受 ≠ 内容还在」（§3.6c）", p.notices.some((n) => /界面/.test(n)), p.notices);
  const p2 = prepareAceWrite(makeRunner(), { saveFirst: false });
  ok("saveFirst:false + dirty ⇒ 不写", !p2.ok && /project.*save/.test(p2.block), p2.block);

  const inv = classifyCliFailure(res(null, 1, 'error[INVALID_ARG]: value 1.4 out of range [0, 1]'));
  ok("INVALID_ARG ⇒ 记住 ACE 从不 clamp、照 hint 改", inv.code === 'INVALID_ARG' && /不 clamp|不会替你夹值/.test(inv.hint), inv);
  const stale = classifyCliFailure(res(null, 1, 'error[STALE_WRITE]: curve fingerprint mismatch'));
  ok("STALE_WRITE ⇒ 重读指纹（防覆盖别人的画）", stale.code === 'STALE_WRITE', stale);
  const busy = classifyCliFailure(res(null, 1, 'error[USER_BUSY]: undo bracket open'));
  ok("USER_BUSY ⇒ --wait-busy / 稍后", busy.code === 'USER_BUSY', busy);
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
