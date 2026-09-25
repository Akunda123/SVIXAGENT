#!/usr/bin/env node
/**
 * SV1 专属只读核查（用户 2026-09-13 已切到 SV1、SV2 已关）
 *
 * 核查清单：
 *   ① 桥/宿主状态 + selftest 能力（SV1 上哪些 op 被 blocked）
 *   ② **`Note.getAttributes()` 的 12 个音高字段**：是 `nan`（字段在·未写）还是 `nil`（字段不在）
 *   ③ **组引用的 `getOnset()` vs `getTimeOffset()`** —— 对照 SV1 工程文件里那对不等的值（10 拍 vs 11 拍）
 *   ④ `getNumPitchControls` 在 SV1 上是否存在（文档派：SV1 不支持音高线）
 *   ⑤ `getVoice()` 在 SV1 上返回哪些键（官方说 9 个音高参数"only available in version 1" ⇒ 真机验证）
 *   ⑥ 2.1.1+ 的接口在 SV1 上是否存在：`getComputedPitchForGroup` / `getComputedAttributesForGroup`
 *   ⑦ 其它是否存在：`setPitchAutoMode` / `getScriptData` / `setScriptData` / `ref:setTimeRange` / `SV.create("PitchControlPoint")`
 *
 * 用法：node sv/lua/probe-sv1-api.cjs [sv]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';
const Q = 705600000;

const code = (...lines) => lines.join('\n');

const PROBE = code(
  'local ed = SV:getMainEditor()',
  'local ref = ed:getCurrentGroup()',
  'local out = {}',
  'out.hasCurrentGroup = (ref ~= nil)',
  'if ref == nil then return out end',
  'local g = ref:getTarget()',
  'out.group = g:getName()',
  'out.noteCount = g:getNumNotes()',
  'out.timeOffset = ref:getTimeOffset()',
  'out.pitchOffset = ref:getPitchOffset()',
  'local okOn, onset = pcall(function() return ref:getOnset() end)',
  'out.refOnsetOk, out.refOnset = okOn, (okOn and onset or tostring(onset))',
  'local okEnd, rend = pcall(function() return ref:getEnd() end)',
  'out.refEndOk, out.refEnd = okEnd, (okEnd and rend or tostring(rend))',
  'local okDur, rdur = pcall(function() return ref:getDuration() end)',
  'out.refDurationOk, out.refDuration = okDur, (okDur and rdur or tostring(rdur))',
  'local okM, m = pcall(function() return ref:isMain() end)',
  'out.isMainOk, out.isMain = okM, (okM and m or tostring(m))',
  '',
  '-- ④ 音高控制接口是否存在',
  'out.hasGetNumPitchControls = (g.getNumPitchControls ~= nil)',
  'out.hasAddPitchControl = (g.addPitchControl ~= nil)',
  '',
  '-- ② 音符 attributes 的 12 个音高字段',
  'local names = { "tF0Offset","tF0Left","tF0Right","dF0Left","dF0Right","tF0VbrStart","tF0VbrLeft","tF0VbrRight","dF0Vbr","pF0Vbr","fF0Vbr","dF0Jitter","tNoteOffset" }',
  'out.attrRows = {}',
  'for i = 1, math.min(g:getNumNotes(), 3) do',
  '  local n = g:getNote(i)',
  '  local row = { idx = i, pitch = n:getPitch(), onset = n:getOnset() }',
  '  local okA, a = pcall(function() return n:getAttributes() end)',
  '  row.attrOk = okA',
  '  if okA and type(a) == "table" then',
  '    local parts = {}',
  '    for k = 1, #names do',
  '      local v = a[names[k]]',
  '      local shown',
  '      if v == nil then shown = "nil"',
  '      elseif type(v) == "number" then shown = (v ~= v) and "nan" or tostring(math.floor(v * 1000) / 1000)',
  '      else shown = type(v) end',
  '      parts[#parts + 1] = names[k] .. "=" .. shown',
  '    end',
  '    row.attrs = table.concat(parts, " ")',
  '    local cnt = 0; for _ in pairs(a) do cnt = cnt + 1 end',
  '    row.attrKeyCount = cnt',
  '  else',
  '    row.attrs = "ERR " .. tostring(a)',
  '  end',
  '  -- ⑦ 音符级自动音高与 scriptData',
  '  local okAm, am = pcall(function() return n:getPitchAutoMode() end)',
  '  row.autoMode = okAm and tostring(am) or ("无可读:" .. tostring(am))',
  '  row.hasSetAutoMode = (n.setPitchAutoMode ~= nil)',
  '  row.hasGetScriptData = (n.getScriptData ~= nil)',
  '  row.hasSetScriptData = (n.setScriptData ~= nil)',
  '  out.attrRows[#out.attrRows + 1] = row',
  'end',
  '',
  '-- ⑤ getVoice() 在 SV1 返回什么',
  'local okV, v = pcall(function() return ref:getVoice() end)',
  'out.getVoiceOk = okV',
  'if okV and type(v) == "table" then',
  '  local ks = {}',
  '  for k, val in pairs(v) do ks[#ks + 1] = k .. "(" .. type(val) .. ")" end',
  '  table.sort(ks)',
  '  out.voiceKeys = table.concat(ks, " ")',
  'end',
  '',
  '-- ⑥ 2.1.1+ 接口在 SV1 是否存在',
  'out.hasComputedPitch = (SV.getComputedPitchForGroup ~= nil)',
  'out.hasComputedAttrs = (SV.getComputedAttributesForGroup ~= nil)',
  'out.hasShowYesNoCancel = (SV.showYesNoCancelBox ~= nil)',
  'local okC, pc = pcall(function() return SV:create("PitchControlPoint") end)',
  'out.createPitchControlPointOk, out.createPitchControlPoint = okC, (okC and "ok" or tostring(pc))',
  'local okC2, cc = pcall(function() return SV:create("PitchControlCurve") end)',
  'out.createPitchControlCurveOk, out.createPitchControlCurve = okC2, (okC2 and "ok" or tostring(cc))',
  'return out',
);

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('=== ① 桥/宿主 ===');
  if (!hb) { console.log('❌ 无心跳'); process.exit(2); }
  console.log('  ' + hb.hostName + ' ' + hb.version + ' · isSV2=' + hb.isSV2 + ' · bridge=' + hb.bridge +
    ' · age=' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's · ops=' + hb.ops.length);

  const st = await ipc.fileIpcSend('selftest', {}, { host: HOST, timeoutMs: 20000 });
  const sx = st.ok ? st.result : null;
  const s = (sx && sx.resultType !== undefined) ? sx.result : sx;
  if (s) {
    const cap = s.capabilities || {};
    console.log('  selftest: bridge=' + s.bridge + ' · lua=' + s.lua + ' · okOps=' + cap.okOps + ' · blockedOps=' + cap.blockedOps);
    if (cap.detail) {
      const bad = Object.keys(cap.detail).filter((k) => !cap.detail[k].ok);
      console.log('  blocked op 明细：' + (bad.length ? bad.map((k) => k + '（缺 ' + (cap.detail[k].missing || []).join(',') + '）').join(' | ') : '无'));
    }
    if (cap.extras) console.log('  capabilities.extras：' + JSON.stringify(cap.extras));
  }

  const r = await ipc.fileIpcSend('run_script', { code: PROBE, readonly: true }, { host: HOST, timeoutMs: 25000 });
  if (!r.ok) { console.log('❌ 探针失败：' + r.error); process.exit(1); }
  const rx = r.result;
  const o = (rx && rx.resultType !== undefined) ? rx.result : rx;

  console.log('\n=== ③④ 组引用偏移 / 音高控制接口 ===');
  console.log('  组「' + o.group + '」音符 ' + o.noteCount + ' · isMain=' + JSON.stringify(o.isMain));
  console.log('  getTimeOffset() = ' + o.timeOffset + '（' + (o.timeOffset / Q) + ' 拍）');
  console.log('  getOnset()      = ' + o.refOnset + (o.refOnsetOk ? '（' + (o.refOnset / Q) + ' 拍）' : ''));
  console.log('  getEnd()        = ' + o.refEnd + (o.refEndOk ? '（' + (o.refEnd / Q) + ' 拍）' : ''));
  console.log('  getDuration()   = ' + o.refDuration + (o.refDurationOk ? '（' + (o.refDuration / Q) + ' 拍）' : ''));
  console.log('  hasGetNumPitchControls=' + o.hasGetNumPitchControls + ' · hasAddPitchControl=' + o.hasAddPitchControl);

  console.log('\n=== ② 音符 attributes 的音高字段（nan 还是 nil）===');
  (o.attrRows || []).forEach((row) => {
    console.log('  音符[' + row.idx + '] pitch=' + row.pitch + ' attrOk=' + row.attrOk + ' 键数=' + row.attrKeyCount +
      ' · 自动音高=' + row.autoMode + ' · 有 setPitchAutoMode=' + row.hasSetAutoMode +
      ' · 有 get/setScriptData=' + row.hasGetScriptData + '/' + row.hasSetScriptData);
    console.log('     ' + row.attrs);
  });

  console.log('\n=== ⑤ getVoice()（SV1）===');
  console.log('  可读=' + o.getVoiceOk + ' · 键：' + (o.voiceKeys || '（空表）'));

  console.log('\n=== ⑥⑦ 接口存在性（SV1）===');
  console.log('  SV.getComputedPitchForGroup=' + o.hasComputedPitch + ' · SV.getComputedAttributesForGroup=' + o.hasComputedAttrs +
    ' · SV.showYesNoCancelBox=' + o.hasShowYesNoCancel);
  console.log('  SV.create("PitchControlPoint")=' + o.createPitchControlPoint + ' · SV.create("PitchControlCurve")=' + o.createPitchControlCurve);
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
