#!/usr/bin/env node
/**
 * 清掉测试期间自建的组（**按名字在工程 library 里匹配，用库索引删除**）。
 *
 * ‼️ 实测教训（2026-09-13）：`Project.removeNoteGroup(index)` **要的是"库内索引"（1 起）**，
 *    **不是 NoteGroup 对象** —— 传对象会被当成 0 ⇒ 报 `越界访问 (索引为 0，大小为 N)`；
 *    而它的官方语义是"**连带删掉所有指向该组的组引用**"，所以**不需要**自己先删引用
 *    （先删引用再传对象，会因为前一步已执行而留下**孤立组**）。
 *
 * 用法：node sv/lua/remove-test-groups.cjs [sv|ix] "组名1,组名2"
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';
const NAMES = (process.argv[3] || 'AKDAgent参数测试').split(',').map((s) => s.trim()).filter(Boolean);
const luaList = NAMES.map((n) => JSON.stringify(n)).join(', ');

const CODE = `
local proj = SV:getProject()
local ed = SV:getMainEditor()
local track = ed:getCurrentTrack()
local names = { ${luaList} }
local out = { removed = {}, orphans = {}, refsBefore = {}, refsAfter = {}, libAfter = {} }

for i = 1, track:getNumGroups() do
  local r = track:getGroupReference(i)
  local t = r:getTarget()
  local okM, m = pcall(function() return r:isMain() end)
  out.refsBefore[#out.refsBefore + 1] = (t and t:getName() or "?") .. (okM and m and " [主组]" or "")
end

-- ① 在 library 里按名字找（**主组不在 library 里**，所以这里天然只碰非主组）
local hits = {}
for i = 1, proj:getNumNoteGroupsInLibrary() do
  local g = proj:getNoteGroup(i)
  if g ~= nil then
    local nm = g:getName()
    for k = 1, #names do
      if nm == names[k] then hits[#hits + 1] = { i = i, name = nm, notes = g:getNumNotes() } end
    end
  end
end

-- ② 倒序删（避免索引位移）
for k = #hits, 1, -1 do
  local h = hits[k]
  proj:newUndoRecord()
  local ok, err = pcall(function() proj:removeNoteGroup(h.i) end)
  out.removed[#out.removed + 1] = h.name .. "（库索引 " .. h.i .. " · 音符 " .. h.notes .. "）" ..
    (ok and " 已删" or (" ❌ 删除失败：" .. tostring(err)))
end

for i = 1, track:getNumGroups() do
  local r = track:getGroupReference(i)
  local t = r:getTarget()
  local okM, m = pcall(function() return r:isMain() end)
  out.refsAfter[#out.refsAfter + 1] = (t and t:getName() or "?") .. (okM and m and " [主组]" or "")
end
for i = 1, proj:getNumNoteGroupsInLibrary() do
  local g = proj:getNoteGroup(i)
  if g ~= nil then
    local nm = g:getName()
    for k = 1, #names do
      if nm == names[k] then out.orphans[#out.orphans + 1] = nm .. "（库索引 " .. i .. "）" end
    end
  end
end
out.libCountAfter = proj:getNumNoteGroupsInLibrary()
return out
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');
  console.log('目标组名：' + NAMES.join(' / '));
  const r = await ipc.fileIpcSend('run_script', { code: CODE }, { host: HOST, timeoutMs: 25000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  const raw = r.result;
  const o = (raw && raw.resultType !== undefined) ? raw.result : raw;
  console.log('删除结果：' + (o.removed.length ? o.removed.join(' | ') : '（library 里没有匹配的组）'));
  console.log('删除前组引用：' + o.refsBefore.join(' / '));
  console.log('删除后组引用：' + o.refsAfter.join(' / '));
  console.log('library 剩余组数：' + o.libCountAfter + (o.orphans.length ? (' · ⚠️ 仍有同名孤立组：' + o.orphans.join(' , ')) : ' · ✅ 无同名残留'));
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
