#!/usr/bin/env node
/**
 * 把三端工程里所有 `voice` 字典摊开（mainRef.voice / groups[].voice / mainGroup? ），
 * 并按"谁有这个键"分档 —— 用于确定 voice 到底有哪些属性（文件层）。
 * 用法：node tools/dump-voice.cjs
 */
const fs = require('fs');
const path = require('path');
const { APPDATA, DOCUMENTS } = require('./lib-paths.cjs');
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/[\u0000\s]+$/, ''));
const J = (v) => JSON.stringify(v);

function find(patterns) {
  const roots = [
    path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores'),
    path.join(DOCUMENTS, 'Dreamtonics/Synthesizer V Studio/recovery'),
    path.join(APPDATA, 'Dreamtonics/Synthesizer V Studio 2/recovery'),
    path.join(APPDATA, 'Dreamtonics/Instrument X/recovery'),
  ];
  const hits = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    let es = [];
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (patterns.some((re) => re.test(e.name))) hits.push({ p, m: fs.statSync(p).mtimeMs, s: fs.statSync(p).size });
    }
  };
  roots.forEach((r) => walk(r, 0));
  hits.sort((a, b) => b.m - a.m);
  return hits;
}

const targets = [
  ['SV1', find([/^sv1工程测试\.svp$/])[0]],
  ['SV2', find([/^sv2工程测试\.svp$/])[0]],
  ['IX', find([/\.ixp$/])[0]],
];

const seen = {};   // key -> {p:Set(platform), sample}
for (const [tag, f] of targets) {
  console.log('\n########## ' + tag + ' ##########');
  if (!f) { console.log('未找到样本'); continue; }
  console.log('文件：' + path.basename(f.p) + '（' + f.s + 'B · ' + new Date(f.m).toLocaleString() + '）');
  const j = load(f.p);
  const voices = [];
  j.tracks.forEach((tr, ti) => {
    if (tr.mainRef && tr.mainRef.voice) voices.push({ where: '轨[' + ti + '] mainRef.voice', v: tr.mainRef.voice, main: true });
    (tr.groups || []).forEach((gr, gi) => { if (gr.voice) voices.push({ where: '轨[' + ti + '] groups[' + gi + '].voice', v: gr.voice }); });
  });
  voices.forEach(({ where, v, main }, i) => {
    const keys = Object.keys(v);
    console.log('\n--- ' + where + ' (' + keys.length + ' 个键) ---');
    console.log('    ' + J(v));
    keys.forEach((k) => {
      const val = v[k];
      (seen[k] = seen[k] || { p: new Set(), sample: val }).p.add(tag);
      const t = Array.isArray(val) ? 'array(' + val.length + ')' : typeof val;
      console.log('      · ' + k.padEnd(22) + ' ' + t + ' = ' + J(val).slice(0, 70));
    });
    if (i === 0) console.log('    （其余 ' + (voices.length - 1) + ' 个 voice 结构同类，不重复展开）');
  });
  if (!voices.length) console.log('  没有任何 voice 字典');
}

console.log('\n\n########## 汇总：voice 键 → 出现在哪些端 ##########');
Object.keys(seen).sort().forEach((k) => {
  console.log('  ' + k.padEnd(22) + ' ' + [...seen[k].p].join('/'));
});
