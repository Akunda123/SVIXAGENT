#!/usr/bin/env node
/**
 * 诊断：`fill_track_lyrics` 在**和弦组**上的落词顺序（干净实验）
 *
 * 为什么需要：`verify-rest.cjs` 的读回对不上（`你|mi|re|-|la|sol` 这种"成对交换"），
 *   但那个组里混着上一次测试留下的歌词 ⇒ 变量太多。本探针**自己造一个全空歌词的组**，
 *   只做「读前 → 填一次 → 读后」，并打印 op 自己回报的字段，把落词顺序钉死。
 *
 * 输出：每个音符 (组内下标 / onset / 音高 / 歌词) 的前后对照 + 每个 token 实际落在哪个音符上。
 *
 * 用法：node sv/lua/probe-fill-lyrics.cjs [host]
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const Q = 705600000;
const GROUP = 'AKDAgent填词探针';
const LYRICS = process.argv.includes('--lyrics')
  ? process.argv[process.argv.indexOf('--lyrics') + 1]
  : 'do re mi fa sol la';

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 20000 });

const DUMP = `
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local out = {}
for i = 1, g:getNumNotes() do
  local n = g:getNote(i)
  out[#out + 1] = string.format("%d (on=%d p=%d) lyr=%q", i, n:getOnset(), n:getPitch(), tostring(n:getLyrics()))
end
return { name = g:getName(), n = g:getNumNotes(), lines = table.concat(out, "\\n") }
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log(`宿主：${hb && hb.hostName} ${hb && hb.version} · bridge ${hb && hb.bridge}`);
  console.log(`歌词："${LYRICS}"\n`);

  // ① 造一个独立测试组（不碰主组），两和弦各 3 音 ⇒ 两个 onset
  const created = await call('create_harmony_group', {
    groupName: GROUP,
    notes: [
      { pitch: 48, onsetBlicks: 0, durationBlicks: 4 * Q, lyrics: '' },
      { pitch: 52, onsetBlicks: 0, durationBlicks: 4 * Q, lyrics: '' },
      { pitch: 55, onsetBlicks: 0, durationBlicks: 4 * Q, lyrics: '' },
      { pitch: 45, onsetBlicks: 4 * Q, durationBlicks: 4 * Q, lyrics: '' },
      { pitch: 48, onsetBlicks: 4 * Q, durationBlicks: 4 * Q, lyrics: '' },
      { pitch: 52, onsetBlicks: 4 * Q, durationBlicks: 4 * Q, lyrics: '' },
    ],
  });
  if (!created.ok) { console.log('❌ create_harmony_group 失败：' + created.error); process.exit(1); }
  console.log(`① 测试组「${created.result.groupName}」${created.result.noteCount} 音（C 和弦 3 音 @0 + Am 3 音 @4，**全部空歌词**）`);

  const sel = await call('run_script', {
    code: `
local ed = SV:getMainEditor()
local tr = ed:getCurrentTrack()
local sel = ed:getSelection()
for i = 1, tr:getNumGroups() do
  local ref = tr:getGroupReference(i)
  if ref:getTarget():getName() == "${GROUP}" and not ref:isMain() then
    local okS, err = pcall(function() sel:selectGroup(ref) end)
    if not okS then return 'selectGroup failed: ' .. tostring(err) end
    return 'selected'
  end
end
return 'not found'
`, readonly: true,
  });
  console.log(`② 选中 → ${sel.ok ? JSON.stringify(sel.result.result) : 'ERR ' + sel.error}`);

  const before = await call('run_script', { code: DUMP, readonly: true });
  console.log('\n== 填词前 ==');
  console.log(before.ok ? before.result.result.lines : 'ERR ' + before.error);

  const filled = await call('fill_track_lyrics', { lyrics: LYRICS });
  console.log('\n== fill_track_lyrics 回报 ==');
  console.log(filled.ok ? JSON.stringify(filled.result) : 'ERR ' + filled.error);

  const after = await call('run_script', { code: DUMP, readonly: true });
  console.log('\n== 填词后 ==');
  console.log(after.ok ? after.result.result.lines : 'ERR ' + after.error);

  // ③ 按 `getNote(i)` 顺序列出「第 i 个音符拿到了哪个 token」
  if (after.ok) {
    const rows = after.result.result.lines.split('\n');
    const tokens = LYRICS.trim().split(/\s+/);
    const got = rows.map((l) => (l.match(/lyr=(.*)$/) || [])[1]).map((s) => (s || '').replace(/^"|"$/g, ''));
    console.log('\n== 落点对照 ==');
    console.log(`token 顺序      : ${tokens.join(' ')}`);
    console.log(`音符顺序拿到    : ${got.join(' ')}`);
    const map = tokens.map((t) => {
      const i = got.indexOf(t);
      return i < 0 ? `${t}→(未出现)` : `${t}→#${i + 1}`;
    });
    console.log(`token→音符      : ${map.join('  ')}`);
  }

  // ④ 清理（`--keep` 时保留，便于接着跑别的探针）
  if (process.argv.includes('--keep')) {
    console.log('\n④ 保留测试组（--keep）—— 用完请跑 cleanup-test-groups.cjs');
    return;
  }
  const rm = await call('run_script', {
    code: `
local proj = SV:getProject()
proj:newUndoRecord()
local removed = 0
for t = 1, proj:getNumTracks() do
  local tr = proj:getTrack(t)
  for g = tr:getNumGroups(), 1, -1 do
    local ref = tr:getGroupReference(g)
    if ref:getTarget():getName() == "${GROUP}" and not ref:isMain() then tr:removeGroupReference(g); removed = removed + 1 end
  end
end
return removed
`,
  });
  console.log(`\n④ 清理：摘掉 ${rm.ok ? JSON.stringify(rm.result.result) : 'ERR ' + rm.error} 个组引用`);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
