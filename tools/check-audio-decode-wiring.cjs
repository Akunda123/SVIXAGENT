/**
 * check-audio-decode-wiring.cjs —— 守卫：客户端 **音频 → WAV（m4a/AAC 的唯一出口）** 这条链**接没接上**
 *
 * 为什么要有它：2026-10-05 我写完 `renderPdfToPngs` 却**忘了接调用点**（拖进来的 PDF 还是原样交出去）；
 * 2026-10-06 音频这条是同一个形状 —— 解码页、主进程函数、IPC、preload、附件入口，**少接一环就静默失效**
 * （用户看到的表现只是"分析说读不出音频"，看不出是解码没跑）。类型检查抓不到"有定义、没调用"。
 *
 * 判据（全部静态可查，不需要起 Electron）：
 *   ① 解码页存在，且**零外部依赖**（页里不得出现 import / vendor / require —— 这条保证"新增 0 字节"）
 *   ② 页里三个出口函数齐全；分块取字节走 **base64**（跨 executeJavaScript 传二进制不稳）
 *   ③ 主进程有 `decodeAudioToWav` 定义 + `akdagent-audio-decode` 口子，且**口子里真的调用了它**
 *   ④ 主进程是**分块**落盘（不是一次性拿回整份），且**有产物自检**（长度 + RIFF 魔数）
 *   ⑤ preload 转发 `audioDecode`；`orb.html` 的 **addPaths** 里真的调用了它（接线本身）
 *   ⑥ "要不要转"的扩展名清单**只有一处**（main.js 的 AUDIO_DECODE_EXTS）—— `fileStat` 回 `audioConvertible`，
 *      渲染层不许自己再抄一份清单（两份清单必然各自腐烂）
 *   ⑦ 4 个语种都有那 4 条音频文案（否则附件条会露出原始 key）
 *   ⑧ 服务端拒绝文案指得回这条路（否则用户拿到一句"装个 ffmpeg"就断了）
 *
 * 用法：node tools/check-audio-decode-wiring.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

let bad = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const no = (m) => { bad++; console.log(`  ❌ ${m}`); };

console.log('【① 解码页 + 零外部依赖（"新增 0 字节"的判据）】');
const HTML = P('electron', 'src', 'audio-decode.html');
const html = read(HTML);
if (!html) no(`缺解码页 ${rel(HTML)}`);
else {
  ok(`解码页在（${(fs.statSync(HTML).size / 1024).toFixed(1)} KB）`);
  // 只查 <script> 里的代码（头部注释里会提到 vendor/libav，不算依赖）
  const body = html.slice(html.indexOf('<body'));
  if (/<script[^>]*\ssrc=/i.test(body)) no('解码页有外部 <script src>（应零新增资产）');
  else if (/\bimport\s+[\s\S]{0,40}?from\s+['"]/.test(body)) no('解码页里有 import（应零新增资产）');
  else if (/vendor\//.test(body)) no('解码页引用了 vendor/（应零新增资产）');
  else ok('解码页零外部依赖（只用 Web Audio + fetch(file://)）');
}

console.log('【② 页里的三个出口 + base64 分块】');
if (html) {
  for (const fn of ['window.akdAudioDecode', 'window.akdAudioChunk', 'window.akdAudioRelease']) {
    if (html.includes(fn)) ok(`${fn} 在`);
    else no(`解码页缺 ${fn}`);
  }
  if (/btoa\(/.test(html)) ok('分块取字节走 base64（btoa）');
  else no('akdAudioChunk 没走 base64（跨 executeJavaScript 传二进制不稳）');
  if (/decodeAudioData/.test(html)) ok('走的是 Chromium 的 decodeAudioData');
  else no('解码页里没有 decodeAudioData（那还解什么？）');
  if (/LIMITS[\s\S]{0,200}?maxSeconds/.test(html)) ok('有 maxSeconds 闸');
  else no('没有 maxSeconds 闸（超长音频会写出巨型 WAV）');
}

console.log('【③④ 主进程：函数 + IPC 口子 + 分块落盘 + 产物自检】');
const mainJs = read(P('electron', 'src', 'main.js')) || '';
if (/async function decodeAudioToWav\(/.test(mainJs)) ok('main.js 有 decodeAudioToWav 定义');
else no('main.js 里没有 decodeAudioToWav 的定义');
{
  const m = /ipcMain\.handle\(\s*'akdagent-audio-decode'[\s\S]{0,900}?\n\}\)/.exec(mainJs);
  if (!m) no("main.js 里没有 ipcMain.handle('akdagent-audio-decode')");
  else if (!/decodeAudioToWav\(/.test(m[0])) no('这个 IPC 口子里**没有调用** decodeAudioToWav（口子是空的）');
  else ok('akdagent-audio-decode → decodeAudioToWav（有口子、有调用）');
}
{
  const i = mainJs.indexOf('async function decodeAudioToWav(');
  const seg = i >= 0 ? mainJs.slice(i, i + 6000) : '';
  if (!seg) no('取不到 decodeAudioToWav 函数体');
  else {
    if (/for\s*\(let off = 0; off < info\.bytes; off \+= chunkBytes\)/.test(seg)) ok('分块拉字节（不是一次性返回 73 MB）');
    else no('没有分块循环（一次性从 executeJavaScript 拿整份 WAV 会顶爆序列化）');
    if (/akdAudioChunk\(/.test(seg)) ok('调用的是页面的 akdAudioChunk');
    else no('没调 akdAudioChunk');
    if (/RIFF/.test(seg) && /WAVE/.test(seg)) ok('产物自检含 RIFF/WAVE 魔数');
    else no('没有 WAV 魔数自检（解码"说成功但其实空"就漏过去了）');
    if (/fs\.statSync\(out\)\.size/.test(seg)) ok('产物自检含长度核对');
    else no('没有长度核对');
    if (/backgroundThrottling:\s*false/.test(seg)) ok('隐藏窗关了后台节流');
    else no('隐藏窗没关后台节流（隐藏窗会被节流，解码页会卡死）');
  }
}
if (/const AUDIO_DECODE_EXTS = new Set\(\[/.test(mainJs)) ok('扩展名白名单 AUDIO_DECODE_EXTS 在 main.js（唯一权威）');
else no('main.js 里没有 AUDIO_DECODE_EXTS');

console.log('【⑤⑥ preload 转发 + 附件入口真的调用 + 清单只有一处】');
const pre = read(P('electron', 'src', 'orb-preload.js')) || '';
if (/ipcRenderer\.invoke\(\s*'akdagent-audio-decode'/.test(pre)) ok('orb-preload.js 暴露了 audioDecode → akdagent-audio-decode');
else no('orb-preload.js 没有转发 akdagent-audio-decode');
const orb = read(P('electron', 'src', 'orb.html')) || '';
if (/window\.akdagent\.audioDecode\(/.test(orb)) ok('orb.html 调用了 window.akdagent.audioDecode(');
else no('orb.html 没有调用 audioDecode ⇒ 拖进来的 m4a 不会变成 WAV（这条就是接线本身）');
{
  const i = orb.indexOf('function addPaths(');
  const j = orb.indexOf('function flashAttach(');
  const seg = i >= 0 && j > i ? orb.slice(i, j) : '';
  if (!seg) no('找不到 addPaths 函数体（附件入口改了名？）');
  else if (!/audioDecode\(/.test(seg)) no('audioDecode 的调用不在 addPaths 里（附件入口没走它）');
  else ok('调用点在 addPaths（附件入口）里');
  // ⑥ 渲染层不许自己抄一份扩展名清单
  if (/\.m4a/.test(seg)) no('orb.html 自己抄了扩展名（.m4a）⇒ 清单变两处，必然腐烂；应只认 st.audioConvertible');
  else ok('orb.html 不自己维护扩展名清单（认 st.audioConvertible）');
}
{
  const fsStat = /ipcMain\.handle\(\s*'akdagent-file-stat'[\s\S]{0,900}?\n\}\)/.exec(mainJs);
  if (!fsStat) no("找不到 ipcMain.handle('akdagent-file-stat')");
  else if (!/audioConvertible:/.test(fsStat[0])) no('fileStat 没回 audioConvertible ⇒ 渲染层无从判断');
  else if (!/AUDIO_DECODE_EXTS\.has\(ext\)/.test(fsStat[0])) no('fileStat 判 audioConvertible 时没查 AUDIO_DECODE_EXTS');
  else ok('file-stat 回 { ext, audioConvertible }（清单只有一处）');
}

console.log('【⑦ 4 个语种的音频文案】');
try {
  const doc = JSON.parse(read(P('electron', 'src', 'i18n', 'orb.json')));
  const need = ['orb.files.audioConverting', 'orb.files.audioConverted', 'orb.files.audioTruncated', 'orb.files.audioFailed'];
  for (const loc of Object.keys(doc)) {
    const miss = need.filter((k) => typeof doc[loc][k] !== 'string');
    if (miss.length) no(`${loc} 缺文案：${miss.join(', ')}`);
  }
  const locs = Object.keys(doc);
  if (locs.length >= 4 && locs.every((l) => need.every((k) => typeof doc[l][k] === 'string'))) {
    ok(`${locs.length} 个语种都有那 4 条音频文案`);
  } else no(`语种文案不全：共 ${locs.length} 个语种（应 ≥4），要求**每个**语种都有那 4 条`);
} catch (e) { no('读 orb.json 出错：' + e.message); }

console.log('【⑧ 服务端拒绝文案指得回这条路】');
const audioTs = read(P('server', 'src', 'audio.ts')) || '';
if (/客户端|悬浮球|audio-decode/.test(audioTs)) ok('audio.ts 的拒绝文案提到了客户端这条路');
else no('audio.ts 拒绝文案没给客户端这条路（用户会卡在"装个 ffmpeg"）');
if (/AUDIO_DECODE_EXTS|\.m4a/.test(audioTs)) ok('audio.ts 提到具体格式（m4a/AAC…），用户能对号入座');
else no('audio.ts 没点出具体格式');

console.log(bad ? `\n❌ 音频解码接线有 ${bad} 处不合格` : '\n✅ 音频解码接线完整（解码页 · 零新增资产 · 分块落盘 · IPC · preload · 附件入口 · 清单唯一 · 文案 · 服务端提示）');
process.exit(bad ? 1 : 0);
