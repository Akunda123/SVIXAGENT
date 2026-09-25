#!/usr/bin/env node
/**
 * 诊断：**当前组的音符顺序**，对比 `getNote(i)`（真源）与 `get_melody_notes` / `get_selected_notes`（op）。
 *
 * 为什么需要：`fill_track_lyrics` 按它自己的顺序逐音填词，而"读回校验"用的是另一个 op 的顺序
 *   ⇒ 若两者顺序不同，填词其实没错，断言却会报假失败（IX 上实测到 `你|mi|re|-|la|sol` 这种"错位"读回）。
 *
 * 用法：node sv/lua/probe-note-order.cjs [host]
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();

const CODE = `
local ed = SV:getMainEditor()
local g = ed:getCurrentGroup():getTarget()
local out = {}
for i = 1, g:getNumNotes() do
  local n = g:getNote(i)
  out[#out + 1] = string.format("#%d p=%d on=%d end=%d lyr=%s", i, n:getPitch(), n:getOnset(), n:getEnd(), tostring(n:getLyrics()))
end
return table.concat(out, "\\n")
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log(`宿主：${hb && hb.hostName} ${hb && hb.version} · bridge ${hb && hb.bridge}\n`);
  const cg = await ipc.fileIpcSend('get_current_group', {}, { host: HOST, timeoutMs: 8000 });
  console.log(`当前组：${cg.result && cg.result.name} · ${cg.result && cg.result.noteCount} 音符`);

  const g = await ipc.fileIpcSend('run_script', { code: CODE, readonly: true }, { host: HOST, timeoutMs: 15000 });
  console.log('\n== getNote(i)（真源顺序）==');
  console.log(g.ok ? g.result.result : 'ERR ' + g.error);

  for (const op of ['get_melody_notes', 'get_selected_notes']) {
    const r = await ipc.fileIpcSend(op, {}, { host: HOST, timeoutMs: 15000 });
    console.log(`\n== ${op} ==`);
    if (!r.ok) { console.log('ERR ' + r.error); continue; }
    const notes = (r.result && r.result.notes) || [];
    if (!notes.length) { console.log('(空 —— 可能没有选中音符)'); continue; }
    console.log(notes.map((x, i) => `#${i} p=${x.pitch} onQ=${x.onsetQuarter} lyr=${JSON.stringify(x.lyrics)}`).join('\n'));
  }
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
