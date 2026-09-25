// ============================================================================
// check-no-crash-api.cjs —— **禁止调用已知会冻桥 / 不存在的 API**（静态守卫）
// ============================================================================
// 为什么存在（两条都是真机踩出来的）：
//   ① **IX-001**：`Automation` 的读点类 API 在 IX 1.0.0 上**调用即冻桥**（1.0.1 已修）——
//      现役桥只保留一道"宿主版本检测"防线；**但没有任何东西阻止后来的人再写一次**那些调用。
//      ⛔ 禁调：`getPoints()` / `getAllPoints()` / `getLinear()` / `getDefinition()` / `remove(单参)`
//      （读点只许 `Automation#get(b)` 单点采样；删点只许区间重载 `remove(begin, end)`）。
//   ② **`Note` 没有 `getTimeRange()`**（2026-09-23 真机踩到：`attempt to call a nil value`）——
//      只有 `setTimeRange(onset, duration)`；读要用 `getOnset()` / `getDuration()`。
//   ③ **IX-006**（2026-09-25）：**"调用不存在的东西"才会死人，正常调用没事** ——
//      `dynamics` **不是组级 automation**（是音符级力度包络），但 `getAutomation("dynamics")`
//      **不报错**、还返回一个像模像样的**假对象**；在它上面读点/写点会**毒坏宿主内存 ⇒ 延时崩宿主**
//      （一天两次：`0xc0000409` @0x1561bf1 / `0xc0000005` @0xf1d8ef，空工程也复现）。
//      ⇒ 本守卫**新增**下面第 ④ 段：知识/技能里不许把 `dynamics` 列成 automation 类型、
//        桥必须硬拒它。⚠️ **不动上面 BANNED 那张表**（用户 2026-09-25 口径：
//        「正常调用是可以的，别调用不存在的东西就行」—— 禁的是"不存在/假对象"，不是整个 API 族）。
// 判据：**只认"调用"（方法名后紧跟左括号）**，且**跳过纯注释行**（注释里写名字是允许的）。
// 反例自测：`node tools/check-no-crash-api.cjs --file <副本>` 指向故意写坏的副本应 exit 1。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARG_FILE = (() => { const i = process.argv.indexOf('--file'); return i >= 0 ? process.argv[i + 1] : null; })();

// ⛔ 禁调清单：[正则, 说明, 只在这些文件上查？null=全部]
// ⚠️ **`getPoints` 必须区别对待**：`PitchControlCurve#getPoints()` 是**合法且官方**的读点接口
//    （我们的探针脚本 `sv/lua/verify-*.cjs` 就是在用它验曲线）；**冻桥的是 `Automation#getPoints`**。
//    静态分不清接收者类型 ⇒ 对 `getPoints` 采取"**除测试/探针外一律禁**"（生产桥里本来就没有它）。
const BANNED = [
  [/\bgetPoints\s*\(/, 'Automation#getPoints —— IX 1.0.0 冻桥（IX-001）；读点用 get(b) 单点采样', 'getPoints'],
  [/\bgetAllPoints\s*\(/, 'Automation#getAllPoints —— 同上（IX-001）；且 PitchControlCurve 没有这个方法', null],
  [/\bgetLinear\s*\(/, 'Automation#getLinear —— 同上（IX-001）', null],
  [/\bgetDefinition\s*\(/, 'Automation#getDefinition —— 同上（IX-001）；取值域改为硬编码', null],
  [/:\s*remove\s*\(\s*[^,()]*\)/, 'Automation#remove(单参) —— 走的是 remove(index) 重载（IX-001）；删点只用 remove(begin, end)', null],
  [/\bgetTimeRange\s*\(/, 'Note#getTimeRange 不存在（2026-09-23 真机）—— 读用 getOnset() / getDuration()', null],
];

// 扫哪些目录（仓内、可能碰宿主 API 的活代码）
const ROOTS = ['sv/lua', 'server/src', 'electron/src', 'tools'];
const EXTS = new Set(['.lua', '.ts', '.js', '.cjs', '.mjs']);
const ALLOW = [
  /tools[\\/]check-no-crash-api\.cjs$/,
  /tools[\\/]api-lookup\.cjs$/,          // 它就是讲"getPoints 要 2 个参数"的那份教训
  /tools[\\/]known-bugs\.cjs$/,          // 缺陷表读写（讲 crash 类）
];
// `getPoints` 额外豁免：**测试假宿主 + 一次性真机探针 + 曲线作图工具**
// （它们读的是 **`PitchControlCurve#getPoints()`** —— 那个是合法的；冻桥的是 `Automation#getPoints`）
const ALLOW_GETPOINTS = [
  /sv[\\/]lua[\\/]tests[\\/]/,
  /sv[\\/]lua[\\/]verify-[^\\/]*\.cjs$/,
  /sv[\\/]lua[\\/]probe-[^\\/]*\.(cjs|lua|js)$/,
  /sv[\\/]lua[\\/]draw-pit-art\.cjs$/,   // 音高线作图：画完读回逐段核对（读的是曲线，不是 automation）
];

function walk(d, out) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === 'dist') continue; walk(f, out); }
    else if (EXTS.has(path.extname(f))) out.push(f);
  }
  return out;
}

const files = ARG_FILE ? [path.resolve(ARG_FILE)] : ROOTS.flatMap((r) => walk(path.join(ROOT, r), []));
const hits = [];
for (const f of files) {
  if (ALLOW.some((re) => re.test(f))) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith('--') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;  // 纯注释不算
    for (const [re, why, tag] of BANNED) {
      if (tag === 'getPoints' && ALLOW_GETPOINTS.some((x) => x.test(f))) continue;
      if (re.test(ln)) hits.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), line: i + 1, why, text: t.slice(0, 110) });
    }
  });
}

console.log('== 禁调 API 守卫（crash 清单 + 不存在的 API）==');
console.log('扫描 ' + files.length + ' 个文件 · 禁调 ' + BANNED.length + ' 条');
if (hits.length) {
  console.log('\n🔴 命中 ' + hits.length + ' 处（这些调用会冻桥或直接报错）：');
  for (const h of hits) console.log('  · ' + h.file + ':' + h.line + '  ' + h.why + '\n      ' + h.text);
  console.log('\n❌ 存在禁调 API');
  process.exit(1);
}
console.log('✅ 未发现禁调 API（读点只用 get(b)；删点只用 remove(begin, end)；时间读用 getOnset/getDuration）');

/* ── ④ IX-006：`dynamics` 不许被当成组级 automation（2026-09-25）──────────────────
 * 事故：agent 手写脚本对 `getAutomation("dynamics")` 读点 ⇒ 一天两次把 instx.exe 打崩
 *（`0xc0000409` fail-fast @0x1561bf1 / `0xc0000005` AV @0xf1d8ef，均延时、空工程也复现）。
 * 口径（用户 2026-09-25）：「**正常调用是可以的，别调用不存在的东西就行**」⇒ 本段只钉
 * "不存在的那个"（dynamics 当 automation），**不碰**读点类 API 本身。
 * 钉三件事：① 知识/技能里不许把 `dynamics` 列进 automation 类型清单
 *          ② 文档必须写明"它不是组级 automation" ③ 桥必须硬拒（set_automation + run_script）。 */
{
  const checks = [];
  const DOCS = [
    ['knowledge/docs/InstrumentX-API枚举.md', '知识文档 InstrumentX-API枚举'],
    ['skills/sv-ix/SKILL.md', '技能 sv-ix'],
  ];
  // 老写法（把 dynamics 与别的类型并列成"有效类型"）——负向钉死，出现过就红
  const OLD_FORMS = [
    '`toneShift`、`dynamics`、`pitchDelta`',
    '`loudness`/`tension`/`dynamics`/`vibratoEnv`',
    '`toneShift`/`dynamics`/`pitchDelta`',
  ];
  for (const [rel, label] of DOCS) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { checks.push([false, label + ' 不存在（' + rel + '）']); continue; }
    const txt = fs.readFileSync(p, 'utf8');
    const bad = OLD_FORMS.find((f) => txt.includes(f));
    checks.push([!bad, label + '：dynamics 不在 automation 类型清单里' + (bad ? '（命中老写法：' + bad + '）' : '')]);
    checks.push([/dynamics`?\s*\**\s*不是[^\n]{0,16}automation/.test(txt),
      label + '：写明「dynamics 不是（组级）automation」']);
  }
  const bridge = path.join(ROOT, 'sv/lua/AKDAgentBridge.lua');
  const b = fs.existsSync(bridge) ? fs.readFileSync(bridge, 'utf8') : '';
  checks.push([/DYN_NOT_AUTOMATION\s*=/.test(b), '桥：有 DYN_NOT_AUTOMATION 文案常量（dynamics 拒收说明）']);
  checks.push([/key == "dynamics"[\s\S]{0,160}error\(DYN_NOT_AUTOMATION\)/.test(b), '桥：set_automation 硬拒 dynamics']);
  checks.push([/dynAsAuto\("getAutomation"\)/.test(b) && /dynAsAuto\("getParameter"\)/.test(b), '桥：run_script 拦 getAutomation/getParameter("dynamics")']);
  // AUTO_RANGE 里永远不许出现 dynamics（那是"把它当 automation 白名单"的意思）
  const autoRange = (/local AUTO_RANGE = \{[\s\S]*?\n\}/.exec(b) || [''])[0];
  checks.push([!/dynamics/.test(autoRange.replace(/--[^\n]*/g, '')), '桥：AUTO_RANGE 白名单里没有 dynamics']);
  // 台账里得真有 IX-006 这条
  const regPath = path.join(ROOT, 'tools/known-bugs.json');
  const reg = fs.existsSync(regPath) ? JSON.parse(fs.readFileSync(regPath, 'utf8')) : { bugs: [] };
  checks.push([(reg.bugs || []).some((x) => x.id === 'IX-006'), '台账：有 IX-006 条目']);

  console.log('\n== IX-006：dynamics 不许当组级 automation ==');
  let bad = 0;
  for (const [ok, why] of checks) { console.log('  ' + (ok ? 'ok   ' : 'BAD  ') + why); if (!ok) bad++; }
  if (bad) { console.log('\n❌ dynamics/automation 共用通道（会毒坏宿主内存 ⇒ 延时崩）'); process.exit(1); }
}
