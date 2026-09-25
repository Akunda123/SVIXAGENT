#!/usr/bin/env node
/**
 * 参数量纲守卫（2026-09-20 新增）—— 防「单位/量级写错 ⇒ 写了等于没写」
 *
 * 背景（用户 2026-09-20 报）：**音区偏移 `toneShift` 有 ±400 的上下限，写的时候只写在了 ±1 之间，
 *   基本等于没写**。根因 = `skills/sv-scripting/references/05-params.md` 把官方 AKD 示例脚本里
 *   helper 的**归一化常量**（`VISIBLE_RANGE = {..., "toneShift": 1}`）记成了「同步脚本可见范围 ±1」，
 *   再加上上游 clone 文档里那句「tension/breathiness/gender/toneShift -1..1」⇒ 三处都在暗示它是 ±1 档。
 *   实测（扫 51 个工程）：真实量级是**音分、几百**（`9.28.svp` / `一棵稗子的春天` 都到 **±800**）。
 *
 * 单一事实源 = `tools/param-units.json`（每个参数的**单位 + 真实范围**）。判据**从它推导**：
 *   只有 `kind === "physical"`（有物理单位：cent / dB / 秒…）的参数才查量级 —— 这类参数的真实范围
 *   跨度本来就大（几十~上千），**把它写成小档（±1 / 0~2…）就是量纲错**。
 *   `kind === "normalized" / "ratio"` 的参数（tension / gender / voicing / vibratoEnv）
 *   **±1（或 0~2）就是它的真实范围** ⇒ 不查、不报。
 *
 * ⚠️ **判据必须"认领得住"**（这一版重做过，第一版误报 6/7）：
 *   · **表格行**：只有**首个单元格就是参数名**时，该行其余单元格才算"这个参数的声明"。
 *     （否则「`vibratoEnv` 0~2、`loudness` 50 点」这种一行多参数会互相误伤。）
 *   · **正文**：参数名 **28 字内**的范围才算它的；且**整行已写明该参数的正确单位**
 *     （cent/音分、dB/分贝、Hz/赫兹、秒）就**豁免** —— 那是在做单位换算（如「±1200 cent（±1 个八度）」）。
 *   · Unicode 减号 `−`/`–`/`—` 一律归一成 `-`（否则 `−1200~1200` 会被误读成 `1200~1200`）。
 *   · 明确写出"这是归一化常量/helper 常量"的行豁免（见 EXEMPT_MARKERS）。
 *     ⛔ 故意**不收**「可见范围」——当年出事那行写的就是「同步脚本可见范围 ±1」，收它等于放过 bug 本身。
 *
 * 扫描范围（分级）：`skills/**`、`knowledge/docs/**` = **error**；
 *   `docs/**` = **info**（历史记录，按仓内口径"历史不改"）。
 *   跳过 `dist/` `dsh-runtime/` `electron/release/` `node_modules/`。
 *
 * 用法：
 *   node tools/check-param-units.cjs          # 扫全仓（error ⇒ exit 1）
 *   node tools/check-param-units.cjs --all    # 连 info 也逐条列出
 *   node tools/check-param-units.cjs --json   # 机器可读
 *
 * ⚠️ 本守卫只查**文档声明**，查不了"脚本里写死的数字"（`run_script` 是任意 Lua）。
 *    真机确认量级只有一条路：**写进去 → 读回 / 听**（听感由用户判）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'param-units.json');
const argv = process.argv.slice(2);
const FLAG = (n) => argv.includes(n);

/** 归一化常量（helper）的例外标记：只有明说"这是常量/归一化"才豁免 */
const EXEMPT_MARKERS = ['归一化', '归一', 'VISIBLE_RANGE', 'helper', '常量'];
/** 单位别名：行里出现该参数的**正确单位**⇒ 视作"已写对单位"，豁免（那是在换算，不是误标量纲） */
const UNIT_ALIASES = {
  cent: ['cent', '音分'],
  dB: ['dB', '分贝'],
  Hz: ['Hz', '赫兹'],
  秒: ['秒', 'second'],
};
/** 正文里"这范围属于它"的邻近窗口（字符） */
const NEAR = 28;
const SCAN = [
  { dir: 'skills', level: 'error' },
  { dir: path.join('knowledge', 'docs'), level: 'error' },
  { dir: 'docs', level: 'info' },
];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dsh-runtime', 'release', '.git']);

const norm = (s) => s.replace(/[\u2212\u2013\u2014]/g, '-');   // − – — → -
const stripCell = (s) => s.replace(/[*`\s]/g, '');

/** 抓一行/一格里的"范围式"声明：±N、a ~ b、a - b（b 带符号也算） */
function claimsIn(text) {
  const t = norm(text);
  const out = [];
  let m;
  const rePM = /±\s*(\d+(?:\.\d+)?)/g;
  while ((m = rePM.exec(t)) !== null) out.push({ raw: '±' + m[1], span: 2 * Number(m[1]) });
  const reRange = /(-?\d+(?:\.\d+)?)\s*(?:~|～|至|到)\s*(-?\d+(?:\.\d+)?)/g;
  while ((m = reRange.exec(t)) !== null) {
    const a = Number(m[1]), b = Number(m[2]);
    out.push({ raw: m[1] + '~' + m[2], span: Math.abs(b - a) });
  }
  return out;
}

function unitStated(line, p) {
  const aliases = UNIT_ALIASES[p.unit] || [p.unit];
  return aliases.some((a) => line.includes(a));
}
/** "小档"判据：声明跨度远小于真实跨度（<100 且 <真实跨度/10） */
function isSmall(c, p) {
  const realSpan = p.fullRange[1] - p.fullRange[0];
  return c.span < 100 && c.span * 10 < realSpan;
}

function walk(dir, acc) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.md$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

function loadSource() {
  if (!fs.existsSync(SRC)) { console.error('❌ 找不到单一事实源：' + SRC); process.exit(2); }
  let j;
  try { j = JSON.parse(fs.readFileSync(SRC, 'utf8')); }
  catch (e) { console.error('❌ param-units.json 不是合法 JSON：' + e.message); process.exit(2); }
  const problems = [];
  const params = j.params || [];
  if (!params.length) problems.push('params 为空');
  for (const p of params) {
    if (!p.name) { problems.push('有参数缺 name'); continue; }
    if (!p.unit) problems.push(p.name + '：缺 unit');
    if (!p.kind) problems.push(p.name + '：缺 kind（physical / normalized / ratio）');
    if (!Array.isArray(p.fullRange) || p.fullRange.length !== 2) problems.push(p.name + '：fullRange 必须是 [min,max]');
    else if (!(p.fullRange[0] < p.fullRange[1])) problems.push(p.name + '：fullRange 不是升序');
    // physical 必须真的是"大量级"；否则就是 kind 写错（⚠️ 别拿跨度当判据：loudness −48~12 只有 60，但它是 dB）
    if (p.kind === 'physical' && Array.isArray(p.fullRange) &&
        Math.max(Math.abs(p.fullRange[0]), Math.abs(p.fullRange[1])) < 10) {
      problems.push(p.name + '：kind=physical 但两端绝对值都 < 10，看着像归一化参数（kind 写错？）');
    }
  }
  return { params, problems };
}

const { params, problems } = loadSource();
const physical = params.filter((p) => p.kind === 'physical');
const errors = [], infos = [];

for (const { dir, level } of SCAN) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs, [])) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const isTableRow = /^\s*\|/.test(line);
      const cells = isTableRow ? line.split('|').slice(1, -1) : null;

      for (const p of physical) {
        if (!line.includes(p.name)) continue;
        if (EXEMPT_MARKERS.some((k) => line.includes(k))) continue;
        if (unitStated(line, p)) continue;              // 行里已写明正确单位 ⇒ 是在换算，不报

        let hits = [];
        if (isTableRow && cells.length && stripCell(cells[0]) === p.name) {
          // 表格：首个单元格 = 参数名 ⇒ 其余单元格都是它的声明
          hits = cells.slice(1).flatMap((c) => claimsIn(c)).filter((c) => isSmall(c, p));
        } else if (!isTableRow) {
          // 正文：参数名 28 字内的范围才算它的 —— ⚠️ 窗口必须在**下一个参数名**处截断：
          //   一行里并列多个参数（如「pitchDelta ±1200 / vibratoEnv 0~2 / loudness −48~12」）时，
          //   否则会把**邻居**的范围算到它头上（2026-09-20 实测确实误报过一次）。
          const at = line.indexOf(p.name);
          const rest = line.slice(at + p.name.length, at + p.name.length + NEAR);
          let cut = rest.length;
          for (const q of params) {
            if (q.name === p.name) continue;
            const qi = rest.indexOf(q.name);
            if (qi >= 0 && qi < cut) cut = qi;
          }
          hits = claimsIn(rest.slice(0, cut)).filter((c) => isSmall(c, p));
        }
        if (!hits.length) continue;
        const item = {
          file: rel, line: i + 1, param: p.name, unit: p.unit,
          claimed: hits.map((c) => c.raw).join(' / '),
          real: '[' + p.fullRange[0] + ', ' + p.fullRange[1] + '] ' + p.unit,
          text: line.trim().slice(0, 120),
        };
        (level === 'error' ? errors : infos).push(item);
      }
    }
  }
}

if (FLAG('--json')) {
  console.log(JSON.stringify({ source: 'tools/param-units.json', params: params.length, physical: physical.map((p) => p.name), errors, infos, sourceProblems: problems }, null, 2));
  process.exit(errors.length || problems.length ? 1 : 0);
}

console.log('== 参数量纲守卫（单一事实源：tools/param-units.json）==');
console.log('收录 ' + params.length + ' 个参数；其中**有物理单位**（会被查量级）' + physical.length + ' 个：' +
  physical.map((p) => p.name + '(' + p.unit + ')').join(' · '));
if (problems.length) {
  console.log('');
  console.log('❌ 单一事实源自身有问题（' + problems.length + '）：');
  problems.forEach((s) => console.log('   · ' + s));
}

const fmt = (x) => '   ' + x.file + ':' + x.line + '  【' + x.param + '】把 ' + x.unit +
  ' 说成「' + x.claimed + '」（真实范围 ' + x.real + '）\n      ' + x.text;
if (errors.length) {
  console.log('');
  console.log('❌ 活文档里的量纲矛盾 ' + errors.length + ' 处（exit 1）—— 照这么写就是"写了等于没写"：');
  errors.forEach((x) => console.log(fmt(x)));
}
if (infos.length && (FLAG('--all') || !errors.length)) {
  console.log('');
  console.log('ℹ️ 历史文档里的同类写法 ' + infos.length + ' 处（按仓内口径"历史不改"，仅供参考）：');
  infos.slice(0, FLAG('--all') ? infos.length : 5).forEach((x) => console.log(fmt(x)));
  if (!FLAG('--all') && infos.length > 5) console.log('   …… 还有 ' + (infos.length - 5) + ' 处（--all 看全）');
}
if (!errors.length && !problems.length) {
  console.log('');
  console.log('✅ 没有"把物理单位参数写成小档"的矛盾声明。');
  console.log('   ⚠️ 本守卫只管**文档声明**；脚本里写死的数字查不到 —— 真机确认量级只有"写进去 → 读回/听"。');
}
process.exit(errors.length || problems.length ? 1 : 0);
