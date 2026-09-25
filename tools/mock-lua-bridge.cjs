#!/usr/bin/env node
/*
 * 假 Lua 桥（Node 实现，用于在**没有 SV** 的情况下自测文件通道客户端）
 * =====================================================================
 * 严格照 `sv/lua/AKDAgentBridge.lua` 的协议行为实现，只实现自测需要的 op：
 *   ping / selftest / get_project_info / get_selected_notes / run_script(假) / 未知名 op → 报错
 * 行为要点（与真桥一致）：
 *   - 启动写 boot + hb，之后每 hbMs 刷心跳
 *   - 每 pollMs 读 req；seq <= lastSeq 且命中缓存 ⇒ 重发响应（不重复执行）
 *   - 响应写 res（tmp + rename）
 *   - 只在 `--once` 时处理一条请求就退出（便于测试收尾）
 *
 * 用法：node tools/mock-lua-bridge.cjs --dir <IPC目录> [--host sv] [--once] [--poll 50] [--hb 500]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const A = process.argv.slice(2);
const arg = (name, def) => {
  const i = A.indexOf('--' + name);
  return i >= 0 && A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : def;
};
const has = (name) => A.includes('--' + name);

const HOST = arg('host', 'sv');
const DIR = arg('dir', path.join(os.tmpdir(), 'akdagent-mock'));
const POLL = Number(arg('poll', 50));
const HB = Number(arg('hb', 500));
const ONCE = has('once');

const REQ = path.join(DIR, `akdagent-req-${HOST}.json`);
const RES = path.join(DIR, `akdagent-res-${HOST}.json`);
const HBK = path.join(DIR, `akdagent-hb-${HOST}.json`);
const BOOT = path.join(DIR, `akdagent-boot-${HOST}.json`);
const LOG = path.join(DIR, `akdagent-log-${HOST}.txt`);

fs.mkdirSync(DIR, { recursive: true });
const log = (s) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`); } catch { /* */ } };
const writeAtomic = (f, s) => { const t = f + '.tmp'; fs.writeFileSync(t, s, 'utf8'); try { fs.renameSync(t, f); } catch { fs.rmSync(f, { force: true }); fs.renameSync(t, f); } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

let lastSeq = -1;
const cache = new Map();

const OPS = {
  ping: () => ({
    pong: true, transport: 'file', bridge: 'mock-0.1.0',
    host: 'Synthesizer V Studio Pro (mock)', version: '1.11.2', isSV2: false,
    indexBase: 1, lua: 'Lua 5.4', dir: DIR, ops: Object.keys(OPS), ts: Math.floor(Date.now() / 1000),
  }),
  selftest: () => ({ mock: true, json_ok: true, file_ok: true, lua: 'N/A（Node 假桥）' }),
  get_project_info: () => ({
    // ⚠️ 字段名必须与真桥（与 JS 桥）一致：fileName / durationBlicks / numGroupsInLibrary。
    //    早期这份 mock 只写 `file`，Electron 侧按 fileName 读就会拿到 null（本轮就是被这个抓出来的）。
    indexBase: 1, host: 'mock', numTracks: 1, fileName: 'mock.svp', file: 'mock.svp',
    durationBlicks: 16 * 705600000, numGroupsInLibrary: 1,
    tracks: [{ index: 0, name: '未命名音轨', numGroups: 1, groups: [{ index: 0, name: 'main', numNotes: 1 }] }],
  }),
  get_selected_notes: () => ({
    count: 1, indexBase: 1,
    notes: [{ index: 0, pitch: 67, onsetQuarter: 3.625, durationQuarter: 1, endQuarter: 4.625, lyrics: 'la' }],
  }),
  // 与真 Lua 桥的 OPS.get_current_group 同形（字段名与 JS 桥 svhOpGetCurrentGroup 逐字一致）
  get_current_group: () => ({
    current: true, name: 'main', uuid: 'mock-uuid-1', noteCount: 1,
    timeOffsetBlicks: 0, pitchOffset: 0,
  }),
  // 以下与真 Lua 桥的读 op 同形（字段名对齐 JS 桥），供客户端选路/白名单测试用
  get_measure_info: () => ({
    measure: 2, found: true, positionBlick: 2822400000,
    numerator: 4, denominator: 4, positionSeconds: 2.0,
  }),
  get_note_time: () => ({
    measure: 1, noteIndex: 0, found: true, onsetBlick: 0, onsetQuarter: 0,
    onsetSeconds: 0, pitch: 67, durationBlicks: 705600000, durationQuarter: 1, lyrics: 'la',
  }),
  get_melody_notes: () => ({
    current: true, groupName: 'main', timeOffsetBlicks: 0, noteCount: 1,
    notes: [{ index: 0, pitch: 67, onsetBlicks: 0, durationBlicks: 705600000, endBlicks: 705600000,
              onsetQuarter: 0, durationQuarter: 1, onsetSeconds: 0, lyrics: 'la' }],
  }),
  playback: (args) => ({ status: args && args.action === 'play' ? 'playing' : 'stopped' }),
  // 写操作：形状与真 Lua 桥一致（真桥已 19 op，mock 必须跟上，否则选路测试会失真）
  transpose_selected_notes: (args) => ({ changed: 2, semitones: Number(args && args.semitones) || 0 }),
  set_selected_lyrics: (args) => ({ changed: 2, lyrics: String((args && args.lyrics) || '') }),
  apply_lyrics: (args) => ({ changed: 2, count: 2, tokensUsed: 2, tokensTotal: 2, lyrics: String((args && args.lyrics) || '') }),
  write_chords: (args) => ({
    ok: true, trackIndex: Number((args && args.trackIndex) || 0),
    groupName: String((args && args.groupName) || 'Chords'),
    noteCount: 3, minPitch: 48, maxPitch: 55,
  }),
  create_harmony_group: (args) => ({ ok: true, groupName: String((args && args.groupName) || 'Harmony'), noteCount: 3 }),
  fill_track_lyrics: () => ({ ok: true, track: 'main', group: 'main', notes: 3, lyricTotal: 3, filled: 3 }),
  align_audio: () => ({ ok: true, trackIndex: 1, groupIndex: 0, firstBeatSec: 0.5, firstBeatBlick: 705600000,
                        absoluteOnsetBlicks: 0, useOnset: true, durationBlicks: 1000, anchor: 'measure' }),
  apply_tempo: () => ({ ok: true, count: 3, clearedExisting: 0 }),
  stop: () => ({ ok: true, bridge: 'mock-0.1.0', finishInMs: 400, scheduled: true }),
  write_pit: (args) => ({
    mode: (args && args.mode) || 'attr', isSv1: true, canCurve: false,
    egg: false, dryRun: !!(args && args.dryRun), processed: 3,
    curves: 0, attrs: 3, skipped: 0, removedCurves: 0,
    details: [{ index: 0, wroteFields: 2, dF0Left: 1.5, dF0Right: 0.13, tF0Offset: -0.035 }],
  }),
  run_script: (args) => ({ result: { echoed: args && args.code ? String(args.code).slice(0, 40) : null, mock: true }, resultType: 'table' }),
};

function respond(req) {
  const seq = Number(req.seq);
  const id = req.id;
  let body;
  try {
    const fn = OPS[req.op];
    if (!fn) throw new Error(`unknown op: ${req.op} (known: ${Object.keys(OPS).join(',')})`);
    body = { v: 1, id, seq, ok: true, ts: Math.floor(Date.now() / 1000), host: HOST, result: fn(req.args || {}) };
  } catch (e) {
    body = { v: 1, id, seq, ok: false, ts: Math.floor(Date.now() / 1000), host: HOST, error: String(e.message || e) };
  }
  const text = JSON.stringify(body);
  cache.set(seq, text);
  writeAtomic(RES, text);
  log(`respond seq=${seq} op=${req.op} ok=${body.ok}`);
  return true;
}

function pollOnce() {
  const req = readJson(REQ);
  if (!req || typeof req.seq !== 'number') return false;
  if (req.seq <= lastSeq) {
    if (cache.has(req.seq)) writeAtomic(RES, cache.get(req.seq));   // 与真桥一致：重复请求重发缓存
    return false;
  }
  lastSeq = req.seq;
  return respond(req);
}

function heartbeat() {
  writeAtomic(HBK, JSON.stringify({
    host: HOST, hostName: 'Synthesizer V Studio Pro (mock)', version: '1.11.2',
    isSV2: false, indexBase: 1, transport: 'file', dir: DIR, bridge: 'mock-0.1.0',
    lua: 'N/A', ops: Object.keys(OPS), lastSeq, ts: Math.floor(Date.now() / 1000),
  }));
}

writeAtomic(BOOT, JSON.stringify({ ok: true, bridge: 'mock-0.1.0', host: HOST, dir: DIR, ts: Math.floor(Date.now() / 1000) }));
heartbeat();
log('mock bridge started');
process.stdout.write(`mock bridge: dir=${DIR} host=${HOST}\n`);

const pollTimer = setInterval(() => {
  if (pollOnce() && ONCE) {
    clearInterval(pollTimer); clearInterval(hbTimer);
    setTimeout(() => process.exit(0), 120);   // 留时间把 res 落盘
  }
}, POLL);
const hbTimer = setInterval(heartbeat, HB);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
