#!/usr/bin/env node
/**
 * 只读探针：把当前轨上**所有音符组引用**逐个列出来（名字 / isMain / 音符数 / 时间偏移 / 是否当前组），
 * 以及当前组的 isMain —— 用来核实「当前组到底是不是主组」，不靠组名==轨名这种推断。
 * 用法：node sv/lua/probe-groups.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));

const ARGV = process.argv.slice(2);
const HOST = (ARGV.find((a) => a.startsWith('--host=')) || '').slice(7) ||
  ARGV.find((a) => a === 'sv' || a === 'ix') || 'sv';

const CODE = [
  'local ed = SV:getMainEditor()',
  'local track = ed:getCurrentTrack()',
  'local out = { track = track:getName(), numGroups = track:getNumGroups(), refs = {} }',
  'local cur = ed:getCurrentGroup()',
  'out.hasCurrent = cur ~= nil',
  'if cur ~= nil then',
  '  local ct = cur:getTarget()',
  '  out.currentName = ct and ct:getName() or nil',
  '  local okC, m = pcall(function() return cur:isMain() end)',
  '  out.currentIsMain = okC and m or ("pcall失败: " .. tostring(m))',
  'end',
  'for i = 1, track:getNumGroups() do',
  '  local r = track:getGroupReference(i)',
  '  local t = r:getTarget()',
  '  local okM, m = pcall(function() return r:isMain() end)',
  '  out.refs[#out.refs + 1] = {',
  '    i = i,',
  '    name = t and t:getName() or nil,',
  '    isMain = okM and m or ("pcall失败: " .. tostring(m)),',
  '    notes = t and t:getNumNotes() or -1,',
  '    curves = t and t:getNumPitchControls() or -1,',
  '    timeOffset = r:getTimeOffset(),',
  '    isCurrent = (cur ~= nil and t == cur:getTarget()),',
  '  }',
  'end',
  'return out',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥：' + (hb && hb.bridge) + ' · ' + (hb && hb.hostName) + ' ' + (hb && hb.version) +
    ' · isSV2=' + (hb && hb.isSV2) + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');
  const r = await ipc.fileIpcSend('run_script', { code: CODE, readonly: true }, { host: HOST, timeoutMs: 20000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  // ‼️ run_script 的响应是 {ok, result:{result: <Lua 返回值>, resultType}} —— Lua 表在 **result.result**
  const o = (r.result && r.result.result) || {};
  console.log('轨「' + o.track + '」组引用数 = ' + o.numGroups);
  console.log('当前组：' + (o.currentName || '(无)') + ' · isMain=' + JSON.stringify(o.currentIsMain));
  console.log('--- 逐个组引用 ---');
  (o.refs || []).forEach((x) => {
    console.log('  [' + x.i + '] ' + x.name + ' · isMain=' + JSON.stringify(x.isMain) +
      ' · 音符 ' + x.notes + ' · 曲线 ' + x.curves + ' · timeOffset ' + x.timeOffset +
      (x.isCurrent ? '  ← 当前组' : ''));
  });
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
