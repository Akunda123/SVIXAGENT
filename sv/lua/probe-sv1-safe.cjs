#!/usr/bin/env node
/**
 * SV1 安全探针（只读）—— 教训版：2026-09-13 我用 `SV:create("PitchControlPoint")` 等**可能不存在的接口**
 * 直接把 SV1 的桥**冻在弹框上**（心跳停跳）。本脚本遵守桥自己的铁律：
 *   ① 判断"有没有"只用**索引**（`pcall(function() return obj[name] end)`），**绝不调用**；
 *   ② 只在 has() 为真时才调用，且**一律冒号形式** `obj[name](obj, ...)`；
 *   ③ **不做点调用回退**（实测会弹错误框并穿透 pcall）；
 *   ④ 不碰 `SV.create(...)` 之类"传错类型就报错"的接口。
 *
 * 覆盖：音符 attributes 的音高字段（nan/nil）、组引用 getOnset/getTimeOffset/getDuration、
 *       音高控制相关方法是否存在、SV1 的 getVoice() 返回、2.1.1+ 接口是否存在。
 *
 * 用法：node sv/lua/probe-sv1-safe.cjs [sv]
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
  if not has(obj, name) then return nil, "no method" end
  local args = { ... }
  local ok, res = pcall(function() return obj[name](obj, table.unpack(args)) end)
  if ok then return res, nil end
  return nil, tostring(res)
end

local out = { exists = {}, voice = {} }
local ed = SV:getMainEditor()
out.exists.ed_getCurrentGroup = has(ed, "getCurrentGroup")
out.exists.ed_getCurrentTrack = has(ed, "getCurrentTrack")
local ref = call(ed, "getCurrentGroup")
if ref == nil then out.noGroup = true; return out end
local g = call(ref, "getTarget")
out.group = call(g, "getName")
out.noteCount = call(g, "getNumNotes")

-- 存在性（只索引，不调用）
out.exists.ref_getOnset = has(ref, "getOnset")
out.exists.ref_getEnd = has(ref, "getEnd")
out.exists.ref_getDuration = has(ref, "getDuration")
out.exists.ref_getTimeOffset = has(ref, "getTimeOffset")
out.exists.ref_getPitchOffset = has(ref, "getPitchOffset")
out.exists.ref_isMain = has(ref, "isMain")
out.exists.ref_setTimeRange = has(ref, "setTimeRange")
out.exists.ref_setTimeOffset = has(ref, "setTimeOffset")
out.exists.ref_getVoice = has(ref, "getVoice")
out.exists.ref_setVoice = has(ref, "setVoice")
out.exists.group_getNumPitchControls = has(g, "getNumPitchControls")
out.exists.group_addPitchControl = has(g, "addPitchControl")
out.exists.note_getAttributes = has(g, "getNote") and has(call(g, "getNote", 1), "getAttributes")
out.exists.note_setAttributes = has(call(g, "getNote", 1), "setAttributes")
out.exists.note_getPitchAutoMode = has(call(g, "getNote", 1), "getPitchAutoMode")
out.exists.note_setPitchAutoMode = has(call(g, "getNote", 1), "setPitchAutoMode")
out.exists.note_getScriptData = has(call(g, "getNote", 1), "getScriptData")
out.exists.note_setScriptData = has(call(g, "getNote", 1), "setScriptData")
out.exists.SV_getComputedPitchForGroup = has(SV, "getComputedPitchForGroup")
out.exists.SV_getComputedAttributesForGroup = has(SV, "getComputedAttributesForGroup")

-- 组引用的位置三口（has 为真才调）
local v
v = call(ref, "getTimeOffset");   out.timeOffset = v
v = call(ref, "getPitchOffset");  out.pitchOffset = v
v = call(ref, "getOnset");        out.onset = v
v = call(ref, "getEnd");          out.refEnd = v
v = call(ref, "getDuration");     out.refDuration = v
v = call(ref, "isMain");          out.isMain = v

-- getVoice() 返回哪些键（has 为真才调；只列键名+类型，不碰值）
if has(ref, "getVoice") then
  local vv = call(ref, "getVoice")
  if type(vv) == "table" then
    local ks = {}
    for k, val in pairs(vv) do ks[#ks + 1] = k .. "(" .. type(val) .. ")" end
    table.sort(ks)
    out.voice.keys = table.concat(ks, " ")
    out.voice.count = #ks
  else
    out.voice.raw = tostring(vv)
  end
end

-- 音符 attributes 的音高字段：nan / nil / 数值
local names = { "tF0Offset","tF0Left","tF0Right","dF0Left","dF0Right","tF0VbrStart",
                "tF0VbrLeft","tF0VbrRight","dF0Vbr","pF0Vbr","fF0Vbr","dF0Jitter","tNoteOffset" }
out.notes = {}
for i = 1, math.min(out.noteCount or 0, 3) do
  local n = call(g, "getNote", i)
  local row = { idx = i, pitch = call(n, "getPitch"), onset = call(n, "getOnset"),
                duration = call(n, "getDuration"), lyrics = call(n, "getLyrics"),
                autoMode = has(n, "getPitchAutoMode") and tostring(call(n, "getPitchAutoMode")) or "无该接口" }
  if has(n, "getAttributes") then
    local a = call(n, "getAttributes")
    if type(a) == "table" then
      local parts = {}
      for k = 1, #names do
        local val = a[names[k]]
        local shown
        if val == nil then shown = "nil"
        elseif type(val) == "number" then shown = (val ~= val) and "nan" or tostring(math.floor(val * 1000) / 1000)
        else shown = type(val) end
        parts[#parts + 1] = names[k] .. "=" .. shown
      end
      local cnt = 0; for _ in pairs(a) do cnt = cnt + 1 end
      row.attrKeyCount = cnt
      row.attrs = table.concat(parts, " ")
    else
      row.attrs = "ERR " .. tostring(a)
    end
  end
  out.notes[#out.notes + 1] = row
end
return out
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  const age = hb ? Math.round(ipc.heartbeatAgeSec(HOST)) : -1;
  console.log('=== ① 桥状态 ===');
  console.log('  ' + (hb ? (hb.hostName + ' ' + hb.version + ' · isSV2=' + hb.isSV2 + ' · bridge=' + hb.bridge) : '无心跳') +
    ' · age=' + age + 's' + (age > 15 ? '  ⚠️ 心跳已过期 ⇒ 桥可能仍冻在弹框上（请先在 SV1 里点掉那个脚本错误框）' : ''));
  if (!hb || age > 15) { console.log('  ⛔ 先不跑探针，等桥恢复。'); process.exit(2); }

  const r = await ipc.fileIpcSend('run_script', { code: PROBE, readonly: true }, { host: HOST, timeoutMs: 25000 });
  if (!r.ok) { console.log('❌ 探针失败：' + r.error); process.exit(1); }
  const rx = r.result;
  const o = (rx && rx.resultType !== undefined) ? rx.result : rx;

  console.log('\n=== ② 存在性（只索引，不调用 ⇒ 安全）===');
  Object.keys(o.exists || {}).forEach((k) => console.log('  ' + (o.exists[k] ? '✅' : '❌') + ' ' + k));

  console.log('\n=== ③ 组引用位置字段 ===');
  console.log('  组「' + o.group + '」音符 ' + o.noteCount + ' · isMain=' + o.isMain);
  ['timeOffset', 'pitchOffset', 'onset', 'refEnd', 'refDuration'].forEach((k) => {
    const v = o[k];
    console.log('  ' + k + ' = ' + v + (typeof v === 'number' ? '（' + (v / Q) + ' 拍）' : ''));
  });

  console.log('\n=== ④ getVoice()（SV1）===');
  console.log('  键数=' + (o.voice && o.voice.count) + ' · ' + ((o.voice && o.voice.keys) || (o.voice && o.voice.raw) || '—'));

  console.log('\n=== ⑤ 音符 attributes 的音高字段（nan 还是 nil）===');
  (o.notes || []).forEach((row) => {
    console.log('  音符[' + row.idx + '] pitch=' + row.pitch + ' onset=' + row.onset + ' dur=' + row.duration +
      ' lyric=「' + row.lyrics + '」自动音高=' + row.autoMode + ' · attributes 键数=' + row.attrKeyCount);
    console.log('     ' + row.attrs);
  });
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
