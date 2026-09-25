#!/usr/bin/env node
/**
 * 纯文件层探针（不需要宿主/桥）：把"只靠读文件就能确定"的几件事一次问完。
 *   ① automation 通道的点值格式：x 是绝对 blick 还是相对量？
 *   ② 音频 audio.filename 的相对路径基准目录到底是哪
 *   ③ 音符级 phonemes 字符串 vs attributes.phonemes[] 项数是否一一对应
 *   ④ 写回风险体检：SV1 尾部 NUL、汉字转义风格、文件字节数
 * 用法：node tools/probe-file-only.cjs
 */
const fs = require('fs');
const path = require('path');
const { APPDATA, DOCUMENTS } = require('./lib-paths.cjs');
const Q = 705600000;
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/[\u0000\s]+$/, ''));
const J = (v) => JSON.stringify(v);

const ROOTS = [
  path.join(DOCUMENTS, 'Image-Line/FL Studio/Presets/Scores'),
  path.join(DOCUMENTS, 'Dreamtonics/Synthesizer V Studio/recovery'),
  path.join(APPDATA, 'Dreamtonics/Synthesizer V Studio 2/recovery'),
  path.join(APPDATA, 'Dreamtonics/Instrument X/recovery'),
];
function newest(name) {
  const hits = [];
  const walk = (dir, d) => {
    if (d > 3) return;
    let es = [];
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, d + 1); else if (e.name === name) hits.push({ p, m: fs.statSync(p).mtimeMs, s: fs.statSync(p).size }); }
  };
  ROOTS.forEach((r) => walk(r, 0));
  hits.sort((a, b) => b.m - a.m);
  return hits[0];
}

console.log('########## ① automation 通道点值格式 ##########');
for (const name of ['sv1工程测试.svp', 'sv2工程测试.svp']) {
  const f = newest(name);
  if (!f) continue;
  const j = load(f.p);
  console.log('\n== ' + name + '（' + new Date(f.m).toLocaleTimeString() + '）==');
  const scan = (label, g) => {
    Object.keys(g.parameters || {}).forEach((k) => {
      const ch = g.parameters[k];
      const pts = (ch && ch.points) || [];
      if (!pts.length) return;
      const xs = [], ys = [];
      for (let i = 0; i + 1 < pts.length; i += 2) { xs.push(pts[i]); ys.push(pts[i + 1]); }
      console.log('  ' + label + '「' + g.name + '」通道 ' + k + ' · mode=' + ch.mode + ' · 点 ' + xs.length + ' 个');
      console.log('    x 前 5：' + J(xs.slice(0, 5)) + '   x 范围 ' + Math.min(...xs) + '..' + Math.max(...xs));
      console.log('    y 前 5：' + J(ys.slice(0, 5)) + '   y 范围 ' + Math.min(...ys) + '..' + Math.max(...ys));
      console.log('    → x 量级判定：' + (Math.max(...xs) > Q ? '**绝对 blick**（>1 拍 = ' + Q + '）' : '**相对量**（都 < 1 拍）'));
    });
  };
  scan('主组', j.tracks[0].mainGroup || {});
  const byUuid = new Map((j.library || []).map((g) => [g.uuid, g]));
  (j.tracks[0].groups || []).forEach((gr, i) => { const g = byUuid.get(gr.groupID); if (g) scan('非主组[' + i + ']', g); });
  (j.library || []).forEach((g) => { if (!j.tracks.some((t) => t.mainGroup === g || (t.groups || []).some((r) => r.groupID === g.uuid))) scan('library', g); });
}

console.log('\n\n########## ② 音频相对路径基准 ##########');
for (const name of ['sv1工程测试.svp', 'sv2工程测试.svp']) {
  const f = newest(name);
  if (!f) continue;
  const j = load(f.p);
  const refs = [];
  j.tracks.forEach((tr) => {
    if (tr.mainRef && tr.mainRef.audio) refs.push({ where: 'mainRef', a: tr.mainRef.audio });
    (tr.groups || []).forEach((gr) => { if (gr.audio) refs.push({ where: 'groups[]', a: gr.audio }); });
  });
  if (!refs.length) { console.log(name + '：无音频引用'); continue; }
  console.log(name + '（工程目录：' + path.dirname(f.p) + '）');
  refs.forEach(({ where, a }) => {
    console.log('  ' + where + '.audio = ' + J(a));
    const resolved = path.resolve(path.dirname(f.p), a.filename || '');
    console.log('    按"相对工程目录"解析 → ' + resolved + '  存在=' + fs.existsSync(resolved));
    console.log('    duration=' + a.duration + ' 秒（≈ ' + (a.duration / 0.5).toFixed(2) + ' 拍@120BPM）');
  });
}

console.log('\n\n########## ③ 音素：字符串 vs attributes.phonemes[] ##########');
for (const name of ['sv2工程测试.svp', 'sv1工程测试.svp']) {
  const f = newest(name);
  if (!f) continue;
  const j = load(f.p);
  let checked = 0, mismatch = 0;
  console.log('\n== ' + name + ' ==');
  (j.library || []).forEach((g, gi) => (g.notes || []).forEach((n, ni) => {
    const at = (n.attributes || {}).phonemes;
    const str = n.phonemes;
    if (!at && !str) return;
    checked++;
    const toks = String(str || '').trim() === '' ? [] : String(str).trim().split(/\s+/);
    const okCount = at ? (toks.length === at.length) : true;
    if (!okCount) mismatch++;
    console.log('  组[' + gi + ']「' + g.name + '」音符[' + ni + '] lyric=「' + (n.lyrics || '') + '」' +
      ' phonemes串=' + J(str) + '（' + toks.length + ' token）· attributes.phonemes=' + (at ? at.length + ' 项' : '无') +
      (okCount ? '  ✅ 对得上' : '  ⚠️ **对不上**') + (at ? ' ' + J(at) : ''));
  }));
  console.log('  → 有音素信息的音符 ' + checked + ' 个，其中 token 数与数组项数**对不上** ' + mismatch + ' 个');
}

console.log('\n\n########## ④ 写回风险体检 ##########');
for (const name of ['sv1工程测试.svp', 'sv2工程测试.svp']) {
  const f = newest(name);
  if (!f) continue;
  const buf = fs.readFileSync(f.p);
  const tail = buf.slice(-4).toString('hex');
  const raw = buf.toString('utf8');
  const cjk = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
  const esc = (raw.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
  console.log('  ' + name + '：尾部 hex=' + tail + ' · 未转义汉字 ' + cjk + ' 个 · \\uXXXX 转义 ' + esc + ' 个' +
    ' · 含 ' + (fs.existsSync(f.p + '.bak') ? '有' : '无') + ' .bak');
}
console.log('\n写回铁律提醒：改前备份 → 让宿主**先关闭该工程** → 改文件 → 让宿主重新打开；SV1 的尾部 NUL 是否保留**必须实测**。');
