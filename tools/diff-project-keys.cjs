#!/usr/bin/env node
/**
 * 三端工程**逐字段 diff**（SV1 / SV2 / IX）：回答"还有哪些结构问题"里的"哪些字段只在一端有"、
 * "哪些字段从没见过有效值（= 语义未知）"。
 *
 * 做法：递归遍历三份真实工程，把数组下标归一成 []，得到 path → 各端样本值；
 *       再输出 ①只在某一端出现的路径 ②三端都有但值恒为空/0/null 的路径 ③各端路径总数。
 *
 * 用法：node tools/diff-project-keys.cjs
 */
const fs = require('fs');
const path = require('path');
const { APPDATA, DOCUMENTS } = require('./lib-paths.cjs');

const FILES = {
  SV1: path.join(DOCUMENTS, 'Dreamtonics/Synthesizer V Studio/recovery/sv1工程测试.svp'),
  SV2: path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores/sv2工程测试.svp'),
  IX: path.join(APPDATA, 'Dreamtonics/Instrument X/recovery/2026-09-13/dad838b6_2026-09-13_00-35.ixp'),
};
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/[\u0000\s]+$/, ''));

// path -> { SV1: sample|null, SV2: sample|null, IX: sample|null, empty: {SV1:bool,...} }
const table = new Map();
function rec(v, p, tag) {
  if (v === null || v === undefined) { note(p, tag, null, true); return; }
  if (Array.isArray(v)) {
    note(p + '[]', tag, v.slice(0, 3).map(strip), v.length === 0);
    v.forEach((x) => rec(x, p + '[]', tag));
    return;
  }
  if (typeof v === 'object') {
    Object.keys(v).forEach((k) => { note(p + '.' + k, tag, strip(v[k]), isEmpty(v[k])); rec(v[k], p + '.' + k, tag); });
    return;
  }
  note(p, tag, v, isEmpty(v));
}
function strip(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return 'array(' + v.length + ')';
  if (typeof v === 'object') return 'object{' + Object.keys(v).slice(0, 6).join(',') + '}';
  if (typeof v === 'string') return JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v);
  return v;
}
function isEmpty(v) {
  if (v === '' || v === 0 || v === false) return true;
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}
function note(p, tag, sample, empty) {
  if (!table.has(p)) table.set(p, { empty: {} });
  const e = table.get(p);
  if (sample !== undefined) { e[tag] = sample; e.empty[tag] = !!empty; }
}

Object.keys(FILES).forEach((tag) => {
  const p = FILES[tag];
  if (!fs.existsSync(p)) { console.log('（缺 ' + tag + ' 样本）'); return; }
  rec(load(p), '', tag);
});

const ends = Object.keys(FILES);
const onlyOne = [], neverValid = [], covered = [];
table.forEach((v, p) => {
  const present = ends.filter((t) => t in v);
  const empt = ends.filter((t) => v.empty[t]);
  if (present.length === 1) onlyOne.push({ p, tag: present[0], s: v[present[0]] });
  else if (present.length > 1 && empt.length === present.length) neverValid.push({ p, tags: present });
  else covered.push({ p, present });
});

console.log('三端逐字段 diff（数组下标归一为 []）');
console.log('路径总数：' + table.size + ' · 三端都有有效值：' + covered.length);
console.log('');

console.log('=== ① 只在某一端出现的字段（' + onlyOne.length + ' 条）—— 版本差异线索 ===');
const byTag = {};
onlyOne.forEach((o) => { byTag[o.tag] = (byTag[o.tag] || []).concat([o]); });
ends.forEach((t) => {
  const list = byTag[t] || [];
  console.log('  【仅 ' + t + '】' + list.length + ' 条');
  list.slice(0, 40).forEach((o) => console.log('    ' + o.p + '  = ' + JSON.stringify(o.s)));
  if (list.length > 40) console.log('    …（还有 ' + (list.length - 40) + ' 条）');
});

console.log('');
console.log('=== ② 多端都有、但**从没见过有效值**（' + neverValid.length + ' 条）—— 语义未知/未见样本 ===');
neverValid.slice(0, 45).forEach((o) => console.log('  [' + o.tags.join('/') + '] ' + o.p));
if (neverValid.length > 45) console.log('  …（还有 ' + (neverValid.length - 45) + ' 条）');
