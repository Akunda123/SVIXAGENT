#!/usr/bin/env node
/**
 * 查重：本仓 skill 文档 vs 上游 clone（`SynthVCopilot-SKILLS`）的**逐字重合**
 *
 * 为什么需要：本仓铁律是"**不直接引用上游原文，自己写**"（上游许可 = Apache-2.0 + Commons Clause
 *   + Additional Terms）⇒ 需要一把**可复跑的尺子**，而不是靠记忆里的旧数字。
 *
 * 判定：把两边的 markdown **归一化**（去加粗/斜体标记、反引号、行首符号、压缩空白、丢掉表格分隔线），
 *   然后找**长度 ≥ K 的完全相同片段**（默认 K=16，与历史口径一致）——用滚动 K-gram 集合做，
 *   快且能给出"本仓哪一行 ↔ 上游哪一行"。
 *
 * 用法：
 *   node tools/clone-overlap-audit.cjs              # 全量报告
 *   node tools/clone-overlap-audit.cjs --k=24       # 只看更长的重合
 *   node tools/clone-overlap-audit.cjs --only=08    # 只看文件名含 08 的
 *   node tools/clone-overlap-audit.cjs --json       # 机器可读（给子代理分片用）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUR = path.join(ROOT, 'skills');
/* 上游技能库目录（要跟本仓 skills/ 比重合度的那个）。
 * ⚠️ 以前写死了开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前去掉：
 *   改成 `--up=<dir>` 指定，默认取**本仓同级的 `SynthVCopilot-SKILLS`**（开发机上的实际位置也是这个）。 */
const UP = (process.argv.find((a) => a.startsWith('--up=')) || '').split('=').slice(1).join('=') ||
  path.join(path.dirname(ROOT), 'SynthVCopilot-SKILLS');
if (!fs.existsSync(UP)) {
  console.log(`⚠️ 上游目录不存在：${UP}\n   ⇒ 用 --up=<目录> 指定（这个审计只在你手上有那份技能库时才有意义）`);
}

const argv = process.argv.slice(2);
const K = Number((argv.find((a) => a.startsWith('--k=')) || '--k=16').split('=')[1]) || 16;
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const JSONOUT = argv.includes('--json');

/** 归一化：只保留"有信息量的内容字符" */
function norm(s) {
  return String(s)
    .replace(/^\s*[-*+>]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t\u3000]+/g, ' ')
    .trim();
}
const isNoise = (s) =>
  s.length < K || /^[-:|\s]+$/.test(s) || /^https?:/.test(s) ||
  /^(第?[一二三四五六七八九十\d]+[、.．)）])/.test(s) === false && s.length < 8;

function walk(dir, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// 上游 K-gram 索引：gram -> [{file, line, text}]
const upIndex = new Map();
const upFiles = walk(UP);
for (const f of upFiles) {
  const rel = path.relative(UP, f).replace(/\\/g, '/');
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const n = norm(raw);
    if (n.length < K) return;
    for (let s = 0; s + K <= n.length; s++) {
      const g = n.slice(s, s + K);
      if (!upIndex.has(g)) upIndex.set(g, []);
      const arr = upIndex.get(g);
      if (arr.length < 6) arr.push({ file: rel, line: i + 1, text: n });
    }
  });
}

// 豁免判定：命中片段属于"不该改/改了更有害"的类别 ⇒ 只报告、不计入"非豁免"指标
function exemptReason(gram) {
  const g = gram;
  if (/Apache-2\.0|Commons Clause|Additional Terms/i.test(g)) return '许可字样（法律标识符，必须逐字）';
  if (/SynthVCopilot|Synthesizer V|Instrument X/i.test(g)) return '上游仓库名 / 产品名';
  // ⚠️ 必须把**中文**也算进路径字符：JS 的 `\w` 是 ASCII-only，
  //    否则 `references/结构与叙事.md` 这类**中文文件名**永不命中豁免（子代理实测报出的 bug）。
  if (/[\w./\u4e00-\u9fff\u3400-\u4dbf-]+\.md/.test(g)) return '文档路径锚点（本仓或上游的文件名）';
  // 单一标识符判定前先**去掉首尾空白**：命中片段常带一个边界空格（如 `" setPitchAutoMode"`），
  // 若不去掉，就会逼着作者"把内联代码贴到中文上"来躲命中 —— 那是排版倒退，不是降重。
  // （子代理在收官片里就真的这么干过；此修法把压力从"改排版"挪回"改工具"。）
  const g2 = g.trim();
  // YAML 前置字段（如 `name: composition`）是 skill 标识符，改了会破坏 skill ⇒ 豁免
  if (/^[A-Za-z_-]+:\s/.test(g2)) return 'YAML 前置字段（skill 标识符）';
  if (!/\s/.test(g2) && g2.length <= 30) return '单一标识符（API 名 / 参数名 / 术语）';
  return null;
}

// 逐条我们这边的行，统计命中
const report = [];
for (const f of walk(OUR)) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (ONLY && !rel.includes(ONLY)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const hits = [];
  lines.forEach((raw, i) => {
    const n = norm(raw);
    if (n.length < K || isNoise(n)) return;
    // 找该行里最长的命中 gram（用逐步加长的近似：取首个命中的 K-gram 再向右扩展）
    let best = null;
    for (let s = 0; s + K <= n.length; s++) {
      const g = n.slice(s, s + K);
      const ups = upIndex.get(g);
      if (!ups) continue;
      // 尽量向右扩展出更长的重合（上限 200 字符）
      let len = K;
      while (s + len < n.length && len < 200) {
        const cand = n.slice(s, s + len + 1);
        let okAny = false;
        for (const u of ups) {
          if (norm(u.text).includes(cand)) { okAny = true; break; }
        }
        if (!okAny) break;
        len++;
      }
      if (!best || len > best.len) best = { len, gram: n.slice(s, s + len), up: ups[0] };
    }
    if (best) hits.push({
      line: i + 1, len: best.len, text: n, up: best.up, gram: best.gram,
      // 章节标题是有意保留的锚点（改了会打断全仓引用）⇒ 单独归一类豁免
      exempt: /^\s*#{1,6}\s/.test(raw) ? '章节标题（锚点，有意保留）'
        // 教材型判据表（"必改 / 可放过"语料行）：语料与判据是教学数据，
        // 用户裁定「只改说明文字、表内语料不动」⇒ 命中来自相邻单元格拼接，不算需改写
        : (/^\s*\|/.test(raw) && /(必改|可放过)/.test(raw)) ? '判据表（语料/判据属教材数据，不改）'
        : exemptReason(best.gram),
    });
  });
  if (hits.length) report.push({ file: rel, hits });
}

if (JSONOUT) {
  console.log(JSON.stringify({ k: K, files: report }, null, 1));
  process.exit(0);
}

console.log(`上游：${upFiles.length} 个 md（${UP}）`);
console.log(`本仓：skills/ 下逐行比对，K=${K}（命中 = 与上游有 ≥${K} 字完全相同片段）\n`);
let total = 0, ge40 = 0, real = 0, real40 = 0;
for (const r of report) {
  const realHits = r.hits.filter((h) => !h.exempt);
  const g40 = realHits.filter((h) => h.len >= 40).length;
  total += r.hits.length; ge40 += r.hits.filter((h) => h.len >= 40).length;
  real += realHits.length; real40 += g40;
  console.log(`▶ ${r.file}  命中 ${r.hits.length} 行 → **需改写 ${realHits.length} 行**（其中 ≥40 字 ${g40} 行）`);
  realHits.sort((a, b) => b.len - a.len).slice(0, 8).forEach((h) => {
    console.log(`   L${h.line}  ${h.len} 字  ↔ ${h.up.file}:${h.up.line}`);
    console.log(`      ${h.gram.slice(0, 90).replace(/\n/g, ' ')}`);
  });
  console.log('');
}
console.log(`合计：命中 ${total} 行（≥40 字 ${ge40} 行）· 涉及 ${report.length} 个文件`);
console.log(`**需改写（非豁免）：${real} 行（≥40 字 ${real40} 行）**  ← 这是真正的待办量`);
console.log('（豁免类 = 许可字样 / 上游仓库名与产品名 / 文档路径锚点 / 单一标识符（API 名、参数名、术语））');
