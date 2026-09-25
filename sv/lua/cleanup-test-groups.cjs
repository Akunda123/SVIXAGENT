#!/usr/bin/env node
/** 清理验收留下的测试组（按名字摘掉轨上的组引用）。用法：node sv/lua/cleanup-test-groups.cjs [host] */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const host = process.argv[2] || 'sv';
const NAMES = ['AKDAgent测试组', 'AKDAgent测试', 'AKDAgent和声测试', 'Chords', 'Arp', 'IX'];

const code = `
local proj = SV:getProject()
local proj2 = SV:getProject()
proj:newUndoRecord()
local names = { ${NAMES.map((n) => `"${n}"`).join(', ')} }
local removed = {}
for t = 1, proj:getNumTracks() do
  local tr = proj:getTrack(t)
  for g = tr:getNumGroups(), 1, -1 do
    local ref = tr:getGroupReference(g)
    local nm = ref:getTarget():getName()
    for i = 1, #names do
      if nm == names[i] and not ref:isMain() then
        tr:removeGroupReference(g)
        removed[#removed + 1] = nm
        break
      end
    end
  end
end
local left = {}
for t = 1, proj:getNumTracks() do
  local tr = proj:getTrack(t)
  for g = 1, tr:getNumGroups() do
    left[#left + 1] = tr:getGroupReference(g):getTarget():getName() .. '(' .. tr:getGroupReference(g):getTarget():getNumNotes() .. ')'
  end
end
return { removed = table.concat(removed, ','), left = table.concat(left, ' ') }
`;

(async () => {
  const r = await ipc.fileIpcSend('run_script', { code }, { host, timeoutMs: 15000 });
  if (!r.ok) { console.log(`❌ 清理失败：${r.error}`); process.exit(1); }
  console.log(`[${host}] 摘掉：${r.result.result.removed || '(无)'}`);
  console.log(`[${host}] 剩余（轨上）：${r.result.result.left || '(空)'}`);
  const cg = await ipc.fileIpcSend('get_current_group', {}, { host, timeoutMs: 8000 });
  if (cg.ok) console.log(`[${host}] 当前组：${cg.result.current ? cg.result.name : '(无)'} · ${cg.result.noteCount} 音符`);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
