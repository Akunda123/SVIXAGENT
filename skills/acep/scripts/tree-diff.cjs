#!/usr/bin/env node
/**
 * `tree-diff.cjs` —— **两个 `.acep` 的逐字段差异**（读得出"到底哪个字段被改动了"）
 *
 * 为什么要有它：ACE 侧很多动作**没有 API 可问**，只能"改前存一份、改后存一份、比对文件"来定位：
 *   · **CLI 写的参数落到文件哪个字段**（例：`vocalparam write --param dynamic` 到底进 `vocalControls.__dynamic` 还是某条 lane？）
 *   · **ACE 自己 `project save` 时顺手改了什么**（它的保存会合并分段 entry、补默认值…）
 *   · 我们自己的工具写完，**除了目标字段还有没有连带改动**
 * 用法：
 *   node tree-diff.cjs <a.acep> <b.acep> [--json] [--max N] [--full] [--only <正则>]
 *     --json        机器可读（[{path, kind, a, b}]）
 *     --max N       每处数值数组最多列几个差异下标（默认 8）
 *     --full        长数组全列（慎用；只影响打印，不影响判定）
 *     --only <re>   只看路径匹配该正则的差异
 * 退出码：0 = 完全一致；1 = 有差异；2 = 读失败。
 *
 * 判据都是"结构相等"：数字按 `===`（-0 与 0 视为相同）、数组按**长度+逐元素**、对象按键集合。
 * ⚠️ 数组**顺序敏感**（lane entry 的顺序/分段数是语义的一部分）。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ACEP = path.join(__dirname, 'acep.cjs');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--only' && !a.startsWith('--')));
if (files.length < 2) {
  console.error('用法：node tree-diff.cjs <a.acep> <b.acep> [--json] [--max N] [--full] [--only <正则>]');
  process.exit(2);
}
const [A, B] = files;
const asJson = !!flag('--json', false);
const maxList = Number(flag('--max', 8)) || 8;
const full = !!flag('--full', false);
const only = flag('--only', null);

/** 借 `acep.cjs unpack` 解码（**不复用第二份解码器**：那边已覆盖 half-float / 不定长 / 用满校验） */
function unpack(file) {
  const out = path.join(os.tmpdir(), 'tree-diff-' + Math.random().toString(36).slice(2) + '.json');
  try {
    execFileSync(process.execPath, [ACEP, 'unpack', file, out], { stdio: ['ignore', 'ignore', 'pipe'] });
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  } finally { try { fs.rmSync(out, { force: true }); } catch {} }
}

const isNumArr = (x) => Array.isArray(x) && x.every((v) => typeof v === 'number');
const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const short = (v, n = 90) => {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  if (s === undefined) return String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
};
/** 长数值数组的摘要：长度 + 值域 + 差异下标（这是"曲线被改了几点"最有效的读法） */
function arrDiff(a, b, maxN) {
  const n = Math.max(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diffs.push(i);
  return { n, diffs, same: a.length === b.length && diffs.length === 0 };
}
function arrSummary(a, b, indent) {
  const { n, diffs } = arrDiff(a, b);
  const range = (x) => { const v = x.filter((t) => typeof t === 'number'); return v.length ? `[${Math.min(...v)}, ${Math.max(...v)}]` : '—'; };
  if (full && isNumArr(a) && isNumArr(b)) {
    return `\n${indent}a = [${a.join(', ')}]\n${indent}b = [${b.join(', ')}]`;
  }
  const head = `len ${a.length} → ${b.length} · 值域 ${range(a)} → ${range(b)} · 差异下标 ${diffs.length}/${n}`
    + (diffs.length ? ` ${JSON.stringify(diffs.slice(0, maxList))}${diffs.length > maxList ? '…' : ''}` : '');
  if (!diffs.length) return head;
  const show = diffs.slice(0, maxList).map((i) => `[${i}] ${a[i]} → ${b[i]}`);
  return head + '\n' + show.map((s) => indent + s).join('\n') + (diffs.length > maxList ? `\n${indent}…还有 ${diffs.length - maxList} 处` : '');
}

const diffs = [];
function walk(p, a, b, indent) {
  if (a === b) return;
  const ka = kind(a), kb = kind(b);
  if (ka !== kb) { diffs.push({ path: p, kind: '类型变', a: ka, b: kb }); return; }
  if (ka === 'array') {
    if (isNumArr(a) && isNumArr(b)) {
      // ⚠️ 两条都必须是"逐值比完真的不同"才记账 —— 相同的数值数组（哪怕两个空数组）**不算差异**
      if (!arrDiff(a, b).same) diffs.push({ path: p, kind: '数值数组', a: a.length, b: b.length, summary: arrSummary(a, b, indent + '    ') });
      return;
    }
    if (a.length !== b.length) {
      // 数组长短变化：逐元素比到 min，再报"多出/少了什么"
      diffs.push({ path: p, kind: '数组长度', a: a.length, b: b.length, summary: arrSummary(a, b, indent + '    ') });
      for (let i = 0; i < Math.min(a.length, b.length); i++) walk(`${p}[${i}]`, a[i], b[i], indent + '  ');
      return;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) diffs.push({ path: `${p}[${i}]`, kind: '新增', b: b[i] });
      else if (i >= b.length) diffs.push({ path: `${p}[${i}]`, kind: '删除', a: a[i] });
      else walk(`${p}[${i}]`, a[i], b[i], indent + '  ');
    }
    return;
  }
  if (ka === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      const q = /^[\w$]+$/.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`;
      if (!(k in a)) diffs.push({ path: q, kind: '键新增', b: b[k] });
      else if (!(k in b)) diffs.push({ path: q, kind: '键删除', a: a[k] });
      else walk(q, a[k], b[k], indent + '  ');
    }
    return;
  }
  diffs.push({ path: p, kind: '值变', a, b });
}

let ta, tb;
try { ta = unpack(A); tb = unpack(B); } catch (e) { console.error('解不开：' + e.message); process.exit(2); }
walk('$', ta, tb, '  ');

const re = only ? new RegExp(String(only)) : null;
const list = re ? diffs.filter((d) => re.test(d.path)) : diffs;

if (asJson) {
  console.log(JSON.stringify(list.map((d) => ({ path: d.path, kind: d.kind, a: d.a, b: d.b, summary: d.summary })), null, 2));
} else {
  console.log(`${path.basename(A)}  →  ${path.basename(B)}`);
  console.log(`差异 ${list.length} 处${re ? `（已按 --only ${only} 过滤）` : ''}${diffs.length !== list.length ? ` / 共 ${diffs.length} 处` : ''}`);
  const byFile = new Map();
  for (const d of list) {
    const top = d.path.split('.').slice(0, 3).join('.');
    byFile.set(top, (byFile.get(top) || 0) + 1);
  }
  if (list.length > 1) {
    console.log('\n按区域汇总：');
    for (const [k, v] of [...byFile].sort((x, y) => y[1] - x[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log('');
  for (const d of list) {
    if (d.kind === '数值数组' || d.kind === '数组长度') console.log(`  [${d.kind}] ${d.path}\n${d.summary}`);
    else if (d.kind === '键新增') console.log(`  [键新增] ${d.path}  = ${short(d.b)}`);
    else if (d.kind === '键删除') console.log(`  [键删除] ${d.path}  原 ${short(d.a)}`);
    else if (d.kind === '新增') console.log(`  [新增]   ${d.path}  = ${short(d.b)}`);
    else if (d.kind === '删除') console.log(`  [删除]   ${d.path}  原 ${short(d.a)}`);
    else if (d.kind === '类型变') console.log(`  [类型变] ${d.path}  ${d.a} → ${d.b}`);
    else console.log(`  [值变]   ${d.path}  ${short(d.a, 60)} → ${short(d.b, 60)}`);
  }
  if (!list.length) console.log('  （无差异：两份文件的解码树逐字段一致）');
}
process.exit(list.length ? 1 : 0);
