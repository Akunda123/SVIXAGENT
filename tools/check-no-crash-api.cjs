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
