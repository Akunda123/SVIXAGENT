#!/usr/bin/env node
/**
 * 三端工程结构逐字段对照（SV1 / SV2 / IX）
 *
 * 做四件事：
 *   ① 把路径归一成"类 + 键"：数组下标丢弃、`library[].notes[]` 与 `tracks[].mainGroup.notes[]` 都归入「音符」，
 *      `mainRef` 与 `groups[]` 都归入「组引用」… ⇒ 输出可直接当版本差异表用；
 *   ② 列出**只在某一端**出现的键（带一个真实样本值）；
 *   ③ 列出 **IX 缺失**（SV1/SV2 有、IX 没有）的键 —— 移植/写 IX 时最容易踩这一栏；
 *   ④ 列出三端都有、但**从未出现过非默认值**的键（= 语义未见样本）。默认值判定不把 0/false 直接当"空"，
 *      而是与"同键在其他位置是否出现过非默认值"综合判断，避免把 `mute:false` 误报。
 *
 * 用法：node tools/diff-project-3ends.cjs [--json] [--table]
 *   --json   写 tools/_diff-3ends.json
 *   --table  额外打印"类|键 × 三端"的全量矩阵（贴进技能文档用）
 *
 * 样本文件（换工程时改这里）：
 *   SV1 = Documents/Dreamtonics/…/recovery/sv1工程测试.svp
 *   SV2 = Documents/Image-Line/FL Studio/Presets/Scores/sv2工程测试.svp
 *   IX  = Documents/Image-Line/FL Studio/Presets/Scores/ixp测试.ixp   ← 2026-09-14 新样本（含技法/mic/loop 真实值）
 *         （旧的 IX 样本是 recovery 快照，字段大量为空，不利于"见过有效值"判断）
 */
const fs = require('fs');
const path = require('path');
const { DOCUMENTS } = require('./lib-paths.cjs');

const FILES = {
  SV1: path.join(DOCUMENTS, 'Dreamtonics/Synthesizer V Studio/recovery/sv1工程测试.svp'),
  SV2: path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores/sv2工程测试.svp'),
  IX: path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores/ixp测试.ixp'),
};
const ENDS = ['SV1', 'SV2', 'IX'];
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/[\u0000\s]+$/, ''));

/** 结构类：把三端各自的写法归到同一类，并把"类根之前的路径"剥掉 ⇒ 三端同类键才能真正对上 */
const CLASS_RULES = [
  { name: '音符 note', test: /\.notes\[\]$/, strip: /^.*\.notes\[\]$/ },
  { name: '组定义 group', test: /(^|\.)(library\[\]|mainGroup)$/, strip: /^.*(library\[\]|mainGroup)$/ },
  { name: '组引用 ref', test: /(^|\.)(groups\[\]|mainRef)$/, strip: /^.*(groups\[\]|mainRef)$/ },
  { name: '音轨 track', test: /^\.tracks\[\]$/, strip: /^\.tracks\[\]$/ },
  { name: 'voice', test: /\.voice$/, strip: /^.*\.voice$/ },
  { name: 'mixer', test: /\.mixer$/, strip: /^.*\.mixer$/ },
  { name: '组参数 parameters', test: /\.parameters$/, strip: /^.*\.parameters$/ },
  { name: '音高控制 pitchControls', test: /\.pitchControls\[\]$/, strip: /^.*\.pitchControls\[\]$/ },
  { name: '时间轴 time', test: /^\.time$/, strip: /^\.time$/ },
  { name: 'renderConfig', test: /^\.renderConfig$/, strip: /^\.renderConfig$/ },
  { name: '顶层 root', test: /^\.$/, strip: /^\.$/ },
];
function cls4(pathStr) {
  for (const r of CLASS_RULES) if (r.test.test(pathStr)) return { cls: r.name, rel: pathStr.replace(r.strip, '').replace(/^\./, '') };
  return null;
}

/** key = "类|类根之后的键" -> {cls, key, SV1:{vals}, SV2:{vals}, IX:{vals}} */
const rows = new Map();
function collectTagged(file, tag) {
  const root = load(file);
  const walk2 = (v, pathStr) => {
    if (Array.isArray(v)) { v.forEach((x) => walk2(x, pathStr + '[]')); return; }
    if (v === null || v === undefined) return;
    if (typeof v === 'object') {
      Object.keys(v).forEach((k) => {
        const c = cls4(pathStr);
        if (c) {
          const key = (c.rel ? c.rel + '.' : '') + k;
          const id = c.cls + '|' + key;
          if (!rows.has(id)) rows.set(id, { cls: c.cls, key });
          const r = rows.get(id);
          if (!r[tag]) r[tag] = { vals: [] };
          if (r[tag].vals.length < 40) r[tag].vals.push(v[k]);
        }
        walk2(v[k], pathStr + '.' + k);
      });
    }
  };
  walk2(root, '');
}
for (const e of ENDS) collectTagged(FILES[e], e);

const fmt = (v) => {
  if (v === undefined) return '—';
  if (Array.isArray(v)) return 'array(' + v.length + ')' + (v.length && v.length <= 3 ? ' ' + JSON.stringify(v) : '');
  if (v && typeof v === 'object') return 'object{' + Object.keys(v).slice(0, 6).join(',') + '}';
  if (typeof v === 'string') return JSON.stringify(v.length > 44 ? v.slice(0, 44) + '…' : v);
  return JSON.stringify(v);
};
/** 该键是否**出现过非默认值**：只要样本里有一条不是 0/false/''/空数组/空对象，就算"见过有效值" */
function hasNonDefault(vals) {
  return (vals || []).some((v) => {
    if (v === 0 || v === false || v === '' || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
}

const sets = { only: {}, miss: {}, noSample: [], all3: [] };
const present = (r, e) => !!r[e];
for (const e of ENDS) sets.only[e] = [];
for (const [id, r] of rows) {
  void id;
  const have = ENDS.filter((e) => present(r, e));
  if (have.length === 1) sets.only[have[0]].push(r);
  else if (have.length === 2 && !have.includes('IX')) sets.miss.IX_missing = (sets.miss.IX_missing || []).concat([r]);
  else if (have.length === 2 && !have.includes('SV2')) sets.miss.SV2_missing = (sets.miss.SV2_missing || []).concat([r]);
  else if (have.length === 2 && !have.includes('SV1')) sets.miss.SV1_missing = (sets.miss.SV1_missing || []).concat([r]);
  else if (have.length === 3) {
    sets.all3.push(r);
    if (!ENDS.some((e) => hasNonDefault(r[e] && r[e].vals))) sets.noSample.push(r);
  }
}

function dump(title, list, sampleFrom) {
  console.log(`\n=== ${title}（${list.length} 条）===`);
  const byCls = {};
  list.forEach((r) => { byCls[r.cls] = (byCls[r.cls] || []).concat([r]); });
  Object.keys(byCls).forEach((c) => {
    console.log('  ▸ ' + c + '（' + byCls[c].length + '）');
    byCls[c].forEach((r) => {
      const src = sampleFrom ? (r[sampleFrom] || ENDS.map((e) => r[e]).find(Boolean)) : ENDS.map((e) => r[e]).find(Boolean);
      console.log('      ' + r.key.replace(/^[^.]+\./, '') + '  = ' + fmt(src && src.vals[0]));
    });
  });
}

console.log('三端结构对照（数组下标归一；音符/组/引用/voice/mixer 等按类归组）');
ENDS.forEach((e) => {
  const f = FILES[e];
  const ok = fs.existsSync(f);
  console.log(`  ${e}: ${ok ? '已读' : '❌ 缺文件'} ${f}`);
});
console.log('键总数：' + rows.size + ' · 三端都有：' + sets.all3.length);

for (const e of ENDS) dump(`① 只在 ${e} 出现`, sets.only[e], e);
if (sets.miss.IX_missing) dump('② IX 缺失（SV1/SV2 有、IX 没有）—— 写 IX 时当心', sets.miss.IX_missing, 'SV2')
if (sets.miss.SV1_missing) dump('③ SV1 缺失（SV2/IX 有、SV1 没有）', sets.miss.SV1_missing, 'SV2')
if (sets.miss.SV2_missing) dump('④ SV2 缺失（SV1/IX 有、SV2 没有）', sets.miss.SV2_missing, 'SV1')
dump('⑤ 三端都有但从未出现非默认值（语义未见样本）', sets.noSample)

if (process.argv.includes('--table')) {
  console.log('\n=== 全量矩阵（类|键 × 三端；✓=有） ===');
  const sorted = [...rows.values()].sort((a, b) => (a.cls + a.key).localeCompare(b.cls + b.key));
  for (const r of sorted) {
    const marks = ENDS.map((e) => (r[e] ? '✓' : '—')).join(' ');
    console.log(`  ${marks}  ${r.cls.padEnd(22)} ${r.key}`);
  }
}

if (process.argv.includes('--json')) {
  const out = { total: rows.size, only: {}, miss: {} };
  for (const e of ENDS) out.only[e] = sets.only[e].map((r) => r.cls + '|' + r.key);
  for (const k of Object.keys(sets.miss)) out.miss[k] = sets.miss[k].map((r) => r.cls + '|' + r.key);
  out.noSample = sets.noSample.map((r) => r.cls + '|' + r.key);
  fs.writeFileSync('tools/_diff-3ends.json', JSON.stringify(out, null, 1));
  console.log('\n（已写 tools/_diff-3ends.json）');
}
