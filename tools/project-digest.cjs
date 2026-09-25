#!/usr/bin/env node
/**
 * 工程文件结构摘要（.svp / .ixp 通用，纯读，不依赖桥）
 *
 * 用途：拿到一个工程文件，尽可能把结构信息读出来 —— 顶层字段、时间（拍号/速度）、
 *       音轨与组引用（timeOffset/pitchOffset/muted/voice）、音符（音高/时长/歌词/属性/scriptData）、
 *       音高曲线、组级参数、唱法、音频轨、渲染设置等。
 *
 * 用法：node tools/project-digest.cjs "<工程文件路径>" [--full]
 *   --full  连音符/曲线点都全量列出（默认只列前若干个，避免刷屏）
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const FULL = process.argv.includes('--full');
if (!file) { console.error('用法：node tools/project-digest.cjs "<工程路径>" [--full]'); process.exit(2); }

const raw = fs.readFileSync(file, 'utf8');
// ⚠️ 实测（2026-09-13）：**SV1 的 .svp 文件尾部有一个 NUL 字节**（`…false}}\u0000`），
//    严格 JSON.parse 会报 "Unexpected non-whitespace character after JSON"。故先剥掉尾部空白/NUL。
const trailing = raw.match(/[\u0000\s]+$/);
const cleaned = trailing ? raw.slice(0, raw.length - trailing[0].length) : raw;
let j;
try { j = JSON.parse(cleaned); } catch (e) { console.error('❌ JSON 解析失败：' + e.message); process.exit(1); }
if (trailing) console.log('ℹ️ 文件尾部有 ' + trailing[0].length + ' 个空白/NUL 字符（已剥离）：' +
  JSON.stringify(trailing[0]) + ' —— 这是 SV1 工程文件的写法，严格 JSON.parse 会失败');


const Q = 705600000;
const beats = (b) => (typeof b === 'number' ? (b / Q).toFixed(4) + '拍' : String(b));
const lim = (arr, n) => (FULL ? arr : arr.slice(0, n));
const J = (v) => JSON.stringify(v);

console.log('📄 ' + path.basename(file) + '  （' + raw.length + ' 字符 · ' + Math.round(fs.statSync(file).size / 1024) + ' KB）');
console.log('顶层字段：' + Object.keys(j).join(', '));
console.log('');

// ---- 版本 / 时间 ----
console.log('== 版本与时间 ==');
console.log('  version = ' + j.version + '   uuid = ' + j.uuid);
const t = j.time || {};
console.log('  startTimeSeconds = ' + t.startTimeSeconds);
(t.meter || []).forEach((m, i) => console.log('  拍号 #' + (m.index !== undefined ? m.index : i) + ' : ' +
  m.numerator + '/' + m.denominator + (m.position !== undefined ? ' @' + beats(m.position) : '（无 position 字段，用 index）')));
lim(t.tempo || [], 20).forEach((m) => console.log('  速度 @' + beats(m.position) + ' : ' + m.bpm + ' BPM'));
if ((t.tempo || []).length > 20) console.log('  …（速度标共 ' + t.tempo.length + ' 个）');

// ---- 渲染 / 其他配置类字段 ----
console.log('');
console.log('== 其它配置字段 ==');
Object.keys(j).forEach((k) => {
  const v = j[k];
  if (['version', 'uuid', 'time', 'library', 'tracks'].includes(k)) return;
  if (Array.isArray(v)) console.log('  ' + k + ' : 数组(' + v.length + ')' + (v.length && v.length <= 3 ? ' ' + J(v) : ''));
  else if (v && typeof v === 'object') console.log('  ' + k + ' : 对象{' + Object.keys(v).slice(0, 12).join(', ') + '}');
  else console.log('  ' + k + ' : ' + J(v));
});

// ---- 音符组（library = 组的定义池）----
const lib = j.library || [];
console.log('');
console.log('== 音符组池 library：' + lib.length + ' 个组 ==');
lib.forEach((g, gi) => {
  const notes = g.notes || [];
  console.log('  [' + gi + '] 「' + g.name + '」 uuid=' + (g.uuid || '').slice(0, 8) + ' 音符=' + notes.length +
    ' 曲线=' + ((g.pitchControls || []).length) + ' 唱法=' + J(Object.keys(g.vocalModes || {})) +
    (g.musicalScale ? ' 音阶=' + J(g.musicalScale) : ''));
  const params = g.parameters || {};
  const nonEmpty = Object.keys(params).filter((k) => params[k] && Array.isArray(params[k].points) && params[k].points.length);
  console.log('     参数通道 ' + Object.keys(params).length + ' 个（非空：' + (nonEmpty.length ? nonEmpty.join(', ') : '无') + '）');
  if (notes.length) {
    const pitchLo = Math.min(...notes.map((n) => n.pitch));
    const pitchHi = Math.max(...notes.map((n) => n.pitch));
    const end = Math.max(...notes.map((n) => n.onset + n.duration));
    console.log('     音高 ' + pitchLo + '..' + pitchHi + ' · 跨度 0..' + beats(end) +
      ' · 歌词首尾「' + (notes[0].lyrics || '') + '…' + (notes[notes.length - 1].lyrics || '') + '」');
    lim(notes, 8).forEach((n, ni) => console.log('       n' + ni + ' pitch=' + n.pitch + ' onset=' + beats(n.onset) +
      ' dur=' + beats(n.duration) + ' lyric=「' + (n.lyrics || '') + '」' + (n.musicalType ? ' type=' + n.musicalType : '') +
      (n.detune ? ' detune=' + n.detune : '') + (n.attributes ? ' attr=' + J(n.attributes) : '') +
      (n.scriptData ? ' scriptData=' + J(n.scriptData) : '') + (n.rapAccent !== undefined ? ' rapAccent=' + J(n.rapAccent) : '')));
    if (!FULL && notes.length > 8) console.log('       …（共 ' + notes.length + ' 个音符，--full 看全部）');
  }
  const pcs = g.pitchControls || [];
  if (pcs.length) {
    const byType = {};
    pcs.forEach((p) => { const k = p.type || (p.points ? 'curve' : '?'); byType[k] = (byType[k] || 0) + 1; });
    console.log('     曲线类型分布：' + J(byType));
    lim(pcs, 3).forEach((p, pi) => console.log('       pc' + pi + ' ' + J(p).slice(0, 200)));
  }
});

// ---- 音轨 ----
const tracks = j.tracks || [];
console.log('');
console.log('== 音轨：' + tracks.length + ' 条 ==');
tracks.forEach((tr, ti) => {
  console.log('  [' + ti + '] 「' + tr.name + '」 ' + J(Object.keys(tr).filter((k) => k !== 'groups' && k !== 'name')));
  const mixer = tr.mixer || {};
  if (Object.keys(mixer).length) console.log('     mixer: ' + J(mixer));
  const groups = tr.groups || [];
  console.log('     组引用 groups[] ' + groups.length + ' 个：');
  lim(groups, 12).forEach((gr, gi) => {
    console.log('       g' + gi + ' 「' + (gr.name || '(无名)') + '」' + (gr.isMain ? ' [主组]' : '') +
      ' timeOffset=' + beats(gr.timeOffset) + ' pitchOffset=' + (gr.pitchOffset === undefined ? '—' : gr.pitchOffset) +
      (gr.muted ? ' muted' : '') + (gr.voice ? ' voice=' + J(gr.voice) : '') +
      (gr.duration !== undefined ? ' dur=' + beats(gr.duration) : '') +
      ' 字段=' + J(Object.keys(gr)));
  });
  // SV1 形状：**主组内联在音轨里**（mainGroup = 组定义 · mainRef = 组引用），不在 groups[] 里
  if (tr.mainGroup || tr.mainRef) {
    console.log('     ⭐ SV1 内联主组：mainGroup 字段=' + J(Object.keys(tr.mainGroup || {})));
    const mg = tr.mainGroup || {};
    const notes = mg.notes || [];
    console.log('        主组「' + (mg.name || '') + '」音符=' + notes.length + ' 曲线=' + ((mg.pitchControls || []).length) +
      ' 参数通道=' + Object.keys(mg.parameters || {}).length + '（' + Object.keys(mg.parameters || {}).join(', ') + '）' +
      ' 唱法=' + J(Object.keys(mg.vocalModes || {})));
    lim(notes, 6).forEach((n, ni) => console.log('         n' + ni + ' pitch=' + n.pitch + ' onset=' + beats(n.onset) +
      ' dur=' + beats(n.duration) + ' lyric=「' + (n.lyrics || '') + '」 attr=' + J(n.attributes || {}) +
      (n.instantMode !== undefined ? ' instantMode=' + n.instantMode : '')));
    if (tr.mainRef) {
      console.log('        mainRef 字段=' + J(Object.keys(tr.mainRef)));
      console.log('        mainRef: blickOffset=' + beats(tr.mainRef.blickOffset) +
        ' pitchOffset=' + tr.mainRef.pitchOffset + ' isInstrumental=' + tr.mainRef.isInstrumental +
        ' blickBegin=' + tr.mainRef.blickAbsoluteBegin + ' blickEnd=' + tr.mainRef.blickAbsoluteEnd +
        ' voice=' + J(tr.mainRef.voice) + (tr.mainRef.database ? ' database=' + J(tr.mainRef.database) : ''));
    }
  }
  // 音频轨线索
  const hints = Object.keys(tr).filter((k) => /audio|wave|file/i.test(k));
  if (hints.length) console.log('     ⚠️ 疑似音频字段：' + hints.map((h) => h + '=' + J(tr[h]).slice(0, 120)).join(' · '));
});

// ---- 全局线索：音频 / 渲染 / 唱法 ----
console.log('');
console.log('== 全文关键字段扫描 ==');
[['audio', /"audio/], ['fileName/文件引用', /"(fileName|filePath|path)"/], ['vocalMode/唱法', /vocalMode/],
 ['instrumental/伴奏', /instrumental/], ['renderConfig', /renderConfig/], ['voice/声库', /"voice"/]]
  .forEach(([label, re]) => { const m = raw.match(re); console.log('  ' + label + ' : ' + (m ? '出现（' + m.length + ' 次）' : '未出现')); });
