#!/usr/bin/env node
/** 临时排查：run_script 里到底能不能拿到 editor/track/currentGroup（对比桥 op 的结果） */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const CODE = [
  'local out = {}',
  'local ok1, ed = pcall(function() return SV:getMainEditor() end)',
  'out.edOk, out.ed = ok1, tostring(ed)',
  'if ok1 and ed ~= nil then',
  '  local ok2, tr = pcall(function() return ed:getCurrentTrack() end)',
  '  out.trackOk, out.track = ok2, tostring(tr)',
  '  if ok2 and tr ~= nil then',
  '    local ok3, nm = pcall(function() return tr:getName() end)',
  '    out.trackNameOk, out.trackName = ok3, tostring(nm)',
  '    local ok4, ng = pcall(function() return tr:getNumGroups() end)',
  '    out.numGroupsOk, out.numGroups = ok4, tostring(ng)',
  '  end',
  '  local ok5, cg = pcall(function() return ed:getCurrentGroup() end)',
  '  out.cgOk, out.cg = ok5, tostring(cg)',
  '  if ok5 and cg ~= nil then',
  '    local ok6, t = pcall(function() return cg:getTarget() end)',
  '    out.cgTargetOk, out.cgTarget = ok6, tostring(t)',
  '    if ok6 and t ~= nil then',
  '      local ok7, nm = pcall(function() return t:getName() end)',
  '      out.cgNameOk, out.cgName = ok7, tostring(nm)',
  '      local ok8, m = pcall(function() return cg:isMain() end)',
  '      out.cgIsMainOk, out.cgIsMain = ok8, tostring(m)',
  '    end',
  '  end',
  'end',
  'out.proj = tostring(SV:getProject())',
  'return out',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' ' + hb.version + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');
  for (const ro of [true, false]) {
    const r = await ipc.fileIpcSend('run_script', ro ? { code: CODE, readonly: true } : { code: CODE }, { host: HOST, timeoutMs: 20000 });
    console.log('--- readonly=' + ro + ' → ok=' + r.ok + (r.ok ? '' : ' err=' + r.error));
    if (r.ok) console.log(JSON.stringify(r.result, null, 1));
  }
  const cg = await ipc.fileIpcSend('get_current_group', {}, { host: HOST, timeoutMs: 20000 });
  console.log('--- 桥 op get_current_group → ' + JSON.stringify(cg.result));
  const pi = await ipc.fileIpcSend('get_project_info', {}, { host: HOST, timeoutMs: 20000 });
  console.log('--- 桥 op get_project_info → ' + JSON.stringify(pi.result));
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
