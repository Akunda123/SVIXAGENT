#!/usr/bin/env node
/** 去重：当前组里同一 onset 只留一个音符（按 onset+音高，保留最先出现的），其余删除。用法：node sv/lua/dedupe-notes.cjs [host] */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = (() => {
  const f = process.argv.find((a) => a.startsWith('--host='));
  if (f) return f.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 20000 });
(async () => {
  const cg = (await call('get_current_group')).result;
  console.log(`宿主 ${HOST} · 当前组「${cg.name}」${cg.noteCount} 音符`);
  const code = [
    'local proj = SV:getProject()',
    'proj:newUndoRecord()',
    'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
    'local seen, kill = {}, {}',
    'for i = 1, g:getNumNotes() do',
    '  local n = g:getNote(i)',
    '  local k = tostring(n:getOnset()) .. ":" .. tostring(n:getPitch())',
    '  if seen[k] then kill[#kill + 1] = i else seen[k] = true end',
    'end',
    'local removed = 0',
    'for i = #kill, 1, -1 do g:removeNote(kill[i]); removed = removed + 1 end',
    'local out = {}',
    'for i = 1, g:getNumNotes() do',
    '  local n = g:getNote(i)',
    '  out[#out + 1] = string.format("%d@p=%d", n:getOnset() / 705600000, n:getPitch())',
    'end',
    'return { removed = removed, left = g:getNumNotes(), notes = table.concat(out, " ") }',
  ].join('\n');
  const r = await call('run_script', { code });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  console.log('删除 ' + r.result.result.removed + ' 个重复音符 ⇒ 剩 ' + r.result.result.left + ' 个：' + r.result.result.notes);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
