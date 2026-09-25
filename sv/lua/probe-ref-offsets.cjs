#!/usr/bin/env node
/**
 * 只读：把**所有轨的所有组引用**的位置字段列出来（安全写法：只索引判断存在性，存在才调、冒号形式）。
 * 目的：确定「文件字段 ↔ API 方法」的对应：
 *   文件 `blickAbsoluteBegin` / `blickAbsoluteEnd` / `blickOffset`  ↔  API `getOnset()` / `getEnd()` / `getTimeOffset()`
 * 用户裁定（2026-09-13）：**非主组**的 `getOnset()` 指**平移**、`getTimeOffset()` 指**入点/出点移动**。
 *
 * 用法：node sv/lua/probe-ref-offsets.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';
const Q = 705600000;

const PROBE = `
local function has(obj, name)
  if obj == nil then return false end
  local ok, t = pcall(function() return obj[name] end)
  if not ok then return false end
  return type(t) == "function" or type(t) == "userdata"
end
local function call(obj, name, ...)
  if not has(obj, name) then return nil end
  local args = { ... }
  local ok, res = pcall(function() return obj[name](obj, table.unpack(args)) end)
  if ok then return res end
  return nil
end
local function fold(b) if type(b) ~= "number" then return "—" end return tostring(b) .. "（" .. (math.floor(b / 705600000 * 10000) / 10000) .. " 拍）" end

local proj = SV:getProject()
local out = { tracks = {} }
for ti = 1, proj:getNumTracks() do
  local track = call(proj, "getTrack", ti)
  local row = { i = ti, name = call(track, "getName"), refs = {} }
  local n = call(track, "getNumGroups") or 0
  for gi = 1, n do
    local r = call(track, "getGroupReference", gi)
    local t = call(r, "getTarget")
    local isMain = call(r, "isMain")
    local onset = call(r, "getOnset")
    local toff = call(r, "getTimeOffset")
    local rend = call(r, "getEnd")
    local dur = call(r, "getDuration")
    local poff = call(r, "getPitchOffset")
    row.refs[#row.refs + 1] = {
      gi = gi,
      name = t and call(t, "getName") or "?",
      isMain = tostring(isMain),
      notes = t and call(t, "getNumNotes") or -1,
      onset = onset, timeOffset = toff, refEnd = rend, refDuration = dur, pitchOffset = poff,
    }
  end
  out.tracks[#out.tracks + 1] = row
end
return out
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  const age = hb ? Math.round(ipc.heartbeatAgeSec(HOST)) : -1;
  console.log('桥 ' + (hb ? hb.hostName + ' ' + hb.version : '无') + ' · bridge=' + (hb && hb.bridge) + ' · age=' + age + 's');
  if (!hb || age > 15) { console.log('⚠️ 心跳过期 ⇒ 先恢复桥再跑。'); process.exit(2); }

  const r = await ipc.fileIpcSend('run_script', { code: PROBE, readonly: true }, { host: HOST, timeoutMs: 25000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  const rx = r.result;
  const o = (rx && rx.resultType !== undefined) ? rx.result : rx;
  const f = (b) => (typeof b !== 'number' ? '—' : (b / Q).toFixed(4) + ' 拍');
  (o.tracks || []).forEach((tr) => {
    console.log('\n轨[' + tr.i + '] 「' + tr.name + '」');
    (tr.refs || []).forEach((rf) => {
      console.log('  [' + rf.gi + '] 「' + rf.name + '」isMain=' + rf.isMain + ' 音符=' + rf.notes);
      console.log('      getOnset()      = ' + f(rf.onset) + '   ← 用户裁定：指**平移**');
      console.log('      getTimeOffset() = ' + f(rf.timeOffset) + '   ← 用户裁定：指**入点/出点移动**');
      console.log('      getEnd()        = ' + f(rf.refEnd) + ' · getDuration() = ' + f(rf.refDuration) + ' · getPitchOffset() = ' + rf.pitchOffset);
    });
  });
  console.log('\n对照：SV1 工程文件里那条非主组引用是 blickAbsoluteBegin=10 拍 · blickAbsoluteEnd=13.75 拍 · blickOffset=11 拍');
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
