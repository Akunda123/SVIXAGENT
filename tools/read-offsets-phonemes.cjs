#!/usr/bin/env node
/**
 * 重读两份测试工程，重点看两处**新增数据**（2026-09-13 用户补的）：
 *   ① SV1：**音符组偏移** —— `tracks[].groups[]` 里的组引用（SV1 字段名是 blickOffset/blickAbsoluteBegin…，不是 timeOffset）
 *   ② SV2：**音素时值** —— 音符里所有与 phoneme 有关的字段（含 attributes 内）
 * 纯读，不连宿主。用法：node tools/read-offsets-phonemes.cjs
 */
const fs = require('fs');
const path = require('path');
const { APPDATA, DOCUMENTS } = require('./lib-paths.cjs');

const Q = 705600000;
const beats = (b) => (typeof b === 'number' ? (b / Q).toFixed(4) + '拍(' + b + ')' : String(b));
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/[\u0000\s]+$/, ''));
const J = (v) => JSON.stringify(v);

const ROOTS = [
  path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores'),
  path.join(DOCUMENTS, 'Dreamtonics/Synthesizer V Studio/recovery'),
  path.join(APPDATA, 'Dreamtonics/Synthesizer V Studio 2/recovery'),
];
function newest(name) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === name) hits.push({ p, m: fs.statSync(p).mtimeMs, s: fs.statSync(p).size });
    }
  };
  ROOTS.forEach((r) => walk(r, 0));
  hits.sort((a, b) => b.m - a.m);
  return hits[0];
}

// ============ ① SV1：音符组偏移 ============
const sv1 = newest('sv1工程测试.svp');
console.log('########## ① SV1 音符组偏移 ##########');
if (!sv1) console.log('未找到 sv1工程测试.svp');
else {
  console.log('文件：' + sv1.p + '  ' + sv1.s + ' bytes  ' + new Date(sv1.m).toLocaleString());
  const j = load(sv1.p);
  console.log('version=' + j.version + ' · 音轨 ' + j.tracks.length + ' 条');
  j.tracks.forEach((tr, ti) => {
    console.log('\n--- 轨[' + ti + '] 「' + tr.name + '」 ---');
    console.log('  mainRef（主组引用）时间/音高偏移：');
    const r = tr.mainRef || {};
    console.log('    blickOffset=' + beats(r.blickOffset) + ' · blickAbsoluteBegin=' + beats(r.blickAbsoluteBegin) +
      ' · blickAbsoluteEnd=' + r.blickAbsoluteEnd + ' · pitchOffset=' + r.pitchOffset +
      ' · isInstrumental=' + r.isInstrumental);
    const gs = tr.groups || [];
    console.log('  groups[] 共 ' + gs.length + ' 个非主组引用：');
    gs.forEach((gr, gi) => {
      console.log('    [' + gi + '] 全量 JSON：');
      console.log('      ' + J(gr));
      console.log('      → 时间偏移 blickOffset=' + beats(gr.blickOffset) +
        ' · 绝对段 blickAbsoluteBegin=' + beats(gr.blickAbsoluteBegin) + ' / End=' + gr.blickAbsoluteEnd +
        ' · pitchOffset=' + gr.pitchOffset + ' · isInstrumental=' + gr.isInstrumental);
      const gid = gr.groupID;
      const lib = (j.library || []).find((g) => g.uuid === gid);
      console.log('      → 指向 library 组：' + (lib ? '「' + lib.name + '」音符 ' + (lib.notes || []).length + ' 个' : '**未找到**（groupID=' + gid + '）'));
    });
  });
}

// ============ ② SV2：音素时值 ============
const sv2 = newest('sv2工程测试.svp');
console.log('\n\n########## ② SV2 音素时值 ##########');
if (!sv2) console.log('未找到 sv2工程测试.svp');
else {
  console.log('文件：' + sv2.p + '  ' + sv2.s + ' bytes  ' + new Date(sv2.m).toLocaleString());
  const j = load(sv2.p);
  console.log('version=' + j.version + ' · library ' + (j.library || []).length + ' 组');
  const keySets = new Set();
  let shown = 0;
  (j.library || []).forEach((g, gi) => {
    (g.notes || []).forEach((n, ni) => {
      keySets.add(Object.keys(n).sort().join(','));
      const atKeys = Object.keys(n.attributes || {}).sort().join(',');
      const hits = [];
      Object.keys(n).forEach((k) => { if (/phon/i.test(k)) hits.push(k + ' = ' + J(n[k])); });
      Object.keys(n.attributes || {}).forEach((k) => { if (/phon/i.test(k)) hits.push('attributes.' + k + ' = ' + J(n.attributes[k])); });
      if (hits.length && shown < 12) {
        shown++;
        console.log('\n--- 组[' + gi + ']「' + g.name + '」音符[' + ni + '] lyric=「' + (n.lyrics || '') + '」pitch=' + n.pitch + ' ---');
        console.log('    音符全部键：' + Object.keys(n).join(', '));
        console.log('    attributes 全部键：' + atKeys);
        hits.forEach((h) => console.log('    ⭐ ' + h));
      }
    });
  });
  console.log('\n=== 音符键组合（去重）===');
  [...keySets].forEach((k) => console.log('  ' + k));
  console.log('\n=== attributes 键里与音素相关的键名（全库去重）===');
  const atAll = new Set();
  (j.library || []).forEach((g) => (g.notes || []).forEach((n) => Object.keys(n.attributes || {}).forEach((k) => atAll.add(k))));
  console.log('  ' + [...atAll].sort().join(', '));
  console.log('\n=== 全文扫描：phoneme 相关字段名出现情况 ===');
  const raw = fs.readFileSync(sv2.p, 'utf8');
  ['phoneme', 'phonemeDurations', 'phonemeStretch', 'phonemes', 'phonemeTiming', 'dur'].forEach((k) => {
    const m = raw.match(new RegExp('"' + k + '"', 'g'));
    console.log('  "' + k + '" : ' + (m ? m.length + ' 次' : '未出现'));
  });
}

// ============ ③ SV2：音高控制点（pitchControls）============
console.log('\n\n########## ③ SV2 音高控制点 ##########');
if (!sv2) console.log('未找到 sv2工程测试.svp');
else {
  const j = load(sv2.p);
  console.log('文件：' + sv2.p + '  ' + sv2.s + ' bytes  ' + new Date(sv2.m).toLocaleString());
  const byUuid = new Map((j.library || []).map((g) => [g.uuid, g]));
  const scan = (label, g) => {
    const pcs = g.pitchControls || [];
    if (!pcs.length) { console.log('\n--- ' + label + '「' + g.name + '」：无音高控制点 ---'); return; }
    const types = {};
    pcs.forEach((p) => { const k = p.type || '?'; types[k] = (types[k] || 0) + 1; });
    console.log('\n--- ' + label + '「' + g.name + '」音高控制点 ' + pcs.length + ' 个 · 类型分布 ' + J(types) + ' ---');
    pcs.forEach((p, i) => {
      const pts = p.points || [];
      const pairs = [];
      for (let k = 0; k + 1 < pts.length && pairs.length < 6; k += 2) pairs.push([pts[k], +pts[k + 1].toFixed(4)]);
      const ys = [];
      for (let k = 1; k < pts.length; k += 2) ys.push(pts[k]);
      console.log('  [' + i + '] type=' + p.type + ' id=' + p.id + ' pos=' + beats(p.pos) +
        ' pitch(anchor)=' + p.pitch + ' 点数=' + (pts.length / 2) +
        ' y范围=' + (ys.length ? Math.min(...ys).toFixed(3) + '..' + Math.max(...ys).toFixed(3) : '—') +
        ' 前几点=' + J(pairs));
      console.log('      全量键：' + Object.keys(p).join(', '));
    });
  };
  j.tracks.forEach((tr, ti) => {
    console.log('\n===== 轨[' + ti + ']「' + tr.name + '」 =====');
    if (tr.mainGroup) scan('主组', tr.mainGroup);
    (tr.groups || []).forEach((gr, gi) => {
      const g = byUuid.get(gr.groupID);
      scan('非主组引用[' + gi + ']（' + (g ? g.name : '未找到') + '）', g || { name: '?', pitchControls: [] });
    });
  });
  // 汇总：哪些组有点、点数分布
  console.log('\n=== 汇总 ===');
  (j.library || []).forEach((g) => {
    const n = (g.pitchControls || []).length;
    if (n) console.log('  library「' + g.name + '」(' + g.uuid.slice(0, 8) + ')：' + n + ' 个控制点 · 音符 ' + (g.notes || []).length);
  });
}

