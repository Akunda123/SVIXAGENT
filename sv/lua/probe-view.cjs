#!/usr/bin/env node
/**
 * 只读探针：读钢琴窗**视图坐标**（CoordinateSystem）——可见音高区间/时间区间/像素换算，
 * 用来判断"图案会不会画在看不见的地方"，而不是靠猜。
 *   getNavigation().getValueViewRange() → [低, 高]（MIDI 半音）· getValuePxPerUnit() → px/半音
 *   getTimeViewRange() → [起, 止]（blick）· t2x/v2y/x2t/y2v → 值↔像素
 * 用法：node sv/lua/probe-view.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const CODE = [
  'local ed = SV:getMainEditor()',
  'local nav = ed:getNavigation()',
  'local out = { hasNav = (nav ~= nil) }',
  'local function try(name, fn)',
  '  local ok, v = pcall(fn)',
  '  if not ok then out[name] = "ERR " .. tostring(v)',
  '  elseif type(v) == "table" then out[name] = table.concat(v, ", ")',
  '  else out[name] = tostring(v) end',
  'end',
  'if nav ~= nil then',
  '  try("timeViewBlicks", function() return nav:getTimeViewRange() end)',
  '  try("valueViewSemitones", function() return nav:getValueViewRange() end)',
  '  try("pxPerSemitone", function() return nav:getValuePxPerUnit() end)',
  '  try("pxPerBlick", function() return nav:getTimePxPerUnit() end)',
  '  try("yOfPitch62", function() return nav:v2y(62) end)',
  '  try("pitchAtY100", function() return nav:y2v(100) end)',
  'end',
  'local ref = ed:getCurrentGroup()',
  'if ref ~= nil then',
  '  local g = ref:getTarget()',
  '  out.group = g:getName()',
  '  out.timeOffsetBlicks = ref:getTimeOffset()',
  '  out.noteCount = g:getNumNotes()',
  '  local lo, hi = nil, nil',
  '  for i = 1, g:getNumNotes() do',
  '    local p = g:getNote(i):getPitch()',
  '    if lo == nil or p < lo then lo = p end',
  '    if hi == nil or p > hi then hi = p end',
  '  end',
  '  out.notePitchRange = (lo and (lo .. ".." .. hi)) or "(无音符)"',
  '  try("groupStartX", function() return nav:t2x(ref:getTimeOffset()) end)',
  'end',
  'return out',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' ' + hb.version + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');
  const r = await ipc.fileIpcSend('run_script', { code: CODE, readonly: true }, { host: HOST, timeoutMs: 20000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  const raw = r.result;
  const o = (raw && raw.resultType !== undefined) ? raw.result : raw;
  Object.keys(o).sort().forEach((k) => console.log('  ' + k + ' = ' + o[k]));
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
