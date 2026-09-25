#!/usr/bin/env node
/**
 * 真机验收：`align_audio` 的 **happy path**（此前只验过"没有音频轨就报错"的错误路径）
 *
 * 安全约定（用户工程里通常有真实音频）：
 *   - 先**快照**音频组的 `getTimeOffset()` / `getStart()`；
 *   - 对齐后**读回验证它确实动了**；
 *   - 最后**还原到原值**并断言还原成功。
 *
 * WAV：本脚本**自造**一个 120 BPM 的咔哒声（44.1k / 16bit / 单声道，第一拍在 0.5s），
 *   这样不依赖用户工程里的音频文件存在与否（工程未保存时拿不到路径）。
 *
 * 用法：node sv/lua/verify-align-audio.cjs [host]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const WAV = path.join(os.tmpdir(), 'akdagent-align-test.wav');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
};
const note = (m) => console.log('  [--]   ' + m);

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 30000 });
const callOk = async (op, args) => {
  const r = await call(op, args);
  if (!r.ok) throw new Error(op + ' 失败：' + r.error);
  return r.result;
};
const script = async (code, readonly) => (await callOk('run_script', readonly ? { code, readonly: true } : { code })).result;

/** 造 120 BPM 咔哒 WAV（第一拍在 0.5s ⇒ 前奏半秒） */
function makeWav(file) {
  const rate = 44100, bpm = 120, beat = 60 / bpm, firstBeat = 0.5, bars = 2;
  const total = Math.round(rate * (firstBeat + beat * 4 * bars + 0.5));
  const data = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    let v = 0;
    const k = Math.round((t - firstBeat) / beat);
    if (k >= 0 && k < 4 * bars) {
      const dt = t - (firstBeat + k * beat);
      if (dt >= 0 && dt < 0.03) v = Math.sin(2 * Math.PI * 1000 * dt) * Math.exp(-dt * 80) * 0.9;
    }
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(rate, 24); hdr.writeUInt32LE(rate * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([hdr, data]));
  return { seconds: total / rate, bpm, firstBeat };
}

const READ_AUDIO = [
  'local proj = SV:getProject()',
  'for t = 1, proj:getNumTracks() do',
  '  local tr = proj:getTrack(t)',
  '  for g = 1, tr:getNumGroups() do',
  '    local ref = tr:getGroupReference(g)',
  '    local okI, inst = pcall(function() return ref:isInstrumental() end)',
  '    if okI and inst then',
  '      local okO, off = pcall(function() return ref:getTimeOffset() end)',
  '      local okS, st = pcall(function() return ref:getStart() end)',
  '      return { found = true, track = t, group = g, name = ref:getTarget():getName(), offset = okO and off or nil, start = okS and st or nil }',
  '    end',
  '  end',
  'end',
  'return { found = false }',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  if (!hb) { console.log('❌ 没有 ' + HOST + ' 的心跳（桥未运行）'); process.exit(2); }
  console.log('宿主：' + hb.hostName + ' ' + hb.version + ' · bridge ' + hb.bridge + ' · isSV2=' + hb.isSV2);

  const info = makeWav(WAV);
  console.log('\n== 0. 自造测试 WAV ==');
  note(WAV + '（' + info.seconds.toFixed(2) + 's · ' + info.bpm + ' BPM · 第一拍在 ' + info.firstBeat + 's）');
  ok('WAV 已生成', fs.existsSync(WAV) && fs.statSync(WAV).size > 1000, fs.statSync(WAV).size);

  const before = await script(READ_AUDIO, true);
  console.log('\n== 1. 音频轨原值 ==');
  if (!before.found) {
    console.log('  [缺口] 当前工程里没有音频轨（isInstrumental）⇒ align_audio happy path 无法验');
    console.log('\n===== 结果：' + pass + ' 通过 / ' + fail + ' 失败 / 1 项缺口 =====');
    process.exit(0);
  }
  note('track=' + before.track + ' group=' + before.group + ' offset=' + before.offset + ' start=' + before.start);
  ok('找到音频轨（isInstrumental）', before.found === true);

  console.log('\n== 2. align_audio（anchor=measure, measure=1）==');
  // ⚠️ 真机事实：桥的 `align_audio` **自己不做音频分析** —— 它要求调用方把
  //    `firstBeatSec`（音频里第一拍的秒数）传进来（分析由 MCP 工具层用 Node 做）。
  //    直接调桥（绕过工具层）时必须自己给，否则报 "args.firstBeatSec required"。
  const r = await call('align_audio', { input: WAV, firstBeatSec: info.firstBeat, bpm: info.bpm, anchor: 'measure', measure: 1 });
  ok('align_audio 成功', r.ok === true, r.error);
  if (!r.ok) {
    console.log('\n===== 结果：' + pass + ' 通过 / ' + fail + ' 失败 =====');
    process.exit(1);
  }
  const res = r.result || {};
  note('结果：' + JSON.stringify(res).slice(0, 300));
  ok('返回里带 BPM 或第一拍信息（分析真的跑了）',
    res.bpm !== undefined || res.firstBeatSec !== undefined || res.onsetBlick !== undefined || res.shiftBlicks !== undefined,
    Object.keys(res));
  ok('返回里有落点字段（blick/seconds 之一）',
    ['onsetBlick', 'onsetSeconds', 'newOnset', 'shiftBlicks', 'useOnset'].some((k) => res[k] !== undefined),
    Object.keys(res));

  console.log('\n== 3. 音频轨确实动了 + 还原 ==');
  const after = await script(READ_AUDIO, true);
  note('对齐后 offset=' + after.offset + ' start=' + after.start + '（原 offset=' + before.offset + '）');
  const moved = String(after.offset) !== String(before.offset) || String(after.start) !== String(before.start);
  ok('音频轨位置发生变化（happy path 真的落盘了）', moved,
    { before: before.offset, after: after.offset });

  const restore = await script([
    'local proj = SV:getProject()',
    'proj:newUndoRecord()',
    'for t = 1, proj:getNumTracks() do',
    '  local tr = proj:getTrack(t)',
    '  for g = 1, tr:getNumGroups() do',
    '    local ref = tr:getGroupReference(g)',
    '    local okI, inst = pcall(function() return ref:isInstrumental() end)',
    '    if okI and inst then',
    '      pcall(function() ref:setTimeOffset(' + (before.offset === null || before.offset === undefined ? 0 : before.offset) + ') end)',
    '      pcall(function() ref:setStart(' + (before.start === null || before.start === undefined ? 0 : before.start) + ') end)',
    '      return "restored"',
    '    end',
    '  end',
    'end',
    'return "not found"',
  ].join('\n'));
  note('还原调用 → ' + JSON.stringify(restore));
  const back = await script(READ_AUDIO, true);
  ok('音频轨已还原到原 offset/start',
    String(back.offset) === String(before.offset) && String(back.start) === String(before.start),
    { now: back.offset, before: before.offset });

  console.log('\n===== 结果：' + pass + ' 通过 / ' + fail + ' 失败 =====');
  console.log('（音频轨已还原；SV 里也可 Ctrl+Z 回退）');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
