#!/usr/bin/env node
/**
 * 验证 `SV.getComputedPitchForGroup` 在真机上的返回（钉点脚本的前提）。
 * 刚才整段采样连续 3 次都返回**空数组** ⇒ 试多种参数组合，看是"用法问题"还是"宿主尚未计算"。
 * 用法：node sv/lua/probe-computed-pitch.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const CODE = `
local ed = SV:getMainEditor()
local ref = ed:getCurrentGroup()
if ref == nil then return { err = "no current group" } end
local g = ref:getTarget()
local Q = SV.QUARTER
local out = { group = g:getName(), notes = g:getNumNotes(), timeOffset = ref:getTimeOffset(), pitchOffset = ref:getPitchOffset() }
local firstOnset = nil
if g:getNumNotes() > 0 then firstOnset = g:getNote(1):getOnset() end
out.firstOnset = firstOnset
out.duration = ref:getDuration()

local function trial(name, startB, interval, frames)
  local ok, arr = pcall(function() return SV:getComputedPitchForGroup(ref, startB, interval, frames) end)
  local t = { name = name, ok = ok, startB = startB, interval = interval, frames = frames }
  if ok and type(arr) == "table" then
    t.n = #arr
    local nulls, first, last = 0, nil, nil
    for i = 1, #arr do
      if arr[i] == nil then nulls = nulls + 1 else
        if first == nil then first = math.floor(arr[i] * 1000) / 1000 end
        last = math.floor(arr[i] * 1000) / 1000
      end
    end
    t.nulls = nulls; t.first = first; t.last = last
  else
    t.err = tostring(arr)
  end
  return t
end

out.trials = {}
out.trials[#out.trials + 1] = trial("A 起点0/10.6ms/100帧", 0, 7500000, 100)
out.trials[#out.trials + 1] = trial("B 起点=组开头绝对位置/10.6ms/100帧", ref:getTimeOffset(), 7500000, 100)
if firstOnset ~= nil then
  out.trials[#out.trials + 1] = trial("C 起点=首音符绝对位置/10.6ms/100帧", ref:getTimeOffset() + firstOnset, 7500000, 100)
  out.trials[#out.trials + 1] = trial("D 起点=首音符/16分/200帧", ref:getTimeOffset() + firstOnset, math.floor(Q / 4), 200)
end
out.trials[#out.trials + 1] = trial("E 起点0/1拍/50帧", 0, Q, 50)
return out
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');
  const r = await ipc.fileIpcSend('run_script', { code: CODE, readonly: true }, { host: HOST, timeoutMs: 25000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  const raw = r.result;
  const o = (raw && raw.resultType !== undefined) ? raw.result : raw;
  console.log('组「' + o.group + '」· 音符 ' + o.notes + ' · timeOffset=' + o.timeOffset + ' · pitchOffset=' + o.pitchOffset +
    ' · 首音符 onset=' + o.firstOnset + ' · ref 时长=' + o.duration);
  (o.trials || []).forEach((t) => {
    console.log('  ' + t.name + ' ⇒ ' + (t.ok
      ? ('返回 ' + t.n + ' 帧 · null ' + t.nulls + (t.first !== null && t.first !== undefined ? ' · 首个非空 ' + t.first + ' → 末个 ' + t.last : ' · 全为 null'))
      : ('ERR ' + t.err)));
  });
  console.log('\n提示：文档说"返回空数组 = 该组音高计算尚未完成" ⇒ 若全为空，先让宿主渲染/播放一次再试。');
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
