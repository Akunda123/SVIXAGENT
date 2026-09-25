#!/usr/bin/env node
/**
 * 造一个"正规的"测试组（**新建组 + 选中它**），供真机验收使用。
 *
 * 为什么需要：`write_pit` / `fill_track_lyrics` 等 op 都作用在**当前组**上，
 *   而没有 `setCurrentGroup` API。**绝不能往轨道主组（isMain=true）写音符**
 *   （用户 2026-06-12 指出：SV2 主组不可被编辑）⇒ 正规做法是：
 *     ① 用 `create_harmony_group` 新建一个**独立组**（该 op 只建组、不碰主组）
 *     ② 用 `ed:getSelection():selectGroup(ref)` 在钢琴窗里选中它 ⇒ 它成为当前组
 *   本脚本只做这两件事 + 校验，验证数据由调用方（验收脚本）自己产生。
 *
 * 用法：node sv/lua/make-test-group.cjs [host] [groupName]
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const host = process.argv[2] || 'sv';
const GROUP = process.argv[3] || 'AKDAgent测试组';
const Q = 705600000;

async function call(op, args) {
  return ipc.fileIpcSend(op, args || {}, { host, timeoutMs: 15000 });
}

(async () => {
  const hb = ipc.readHeartbeat(host);
  if (!hb) { console.log(`❌ 没有 ${host} 的心跳（桥未运行）`); process.exit(2); }
  console.log(`宿主：${hb.hostName} ${hb.version}（bridge ${hb.bridge}）`);
  const cg0 = (await call('get_current_group')).result;
  console.log(`当前组（操作前）：${cg0.current ? cg0.name : '(无)'} · ${cg0.noteCount} 音符\n`);

  // ① 新建组（create_harmony_group：只建新组，不碰主组）
  const r1 = await call('create_harmony_group', {
    groupName: GROUP,
    notes: [
      { pitch: 60, onsetBlicks: 0, durationBlicks: Q, lyrics: 'la' },
      { pitch: 62, onsetBlicks: Q, durationBlicks: Q, lyrics: 'la' },
      { pitch: 64, onsetBlicks: 2 * Q, durationBlicks: Q, lyrics: 'la' },
      { pitch: 65, onsetBlicks: 3 * Q, durationBlicks: Q, lyrics: 'la' },
      { pitch: 67, onsetBlicks: 4 * Q, durationBlicks: Q, lyrics: 'la' },
      { pitch: 69, onsetBlicks: 5 * Q, durationBlicks: Q, lyrics: 'la' },
    ],
  });
  if (!r1.ok) { console.log('❌ create_harmony_group 失败：' + r1.error); process.exit(1); }
  console.log(`① 新建组「${r1.result.groupName}」→ ${r1.result.noteCount} 个音符 ✓`);

  // ② 在钢琴窗里选中该组（selectGroup）⇒ 使其成为当前组
  const code = `
local ed = SV:getMainEditor()
local tr = ed:getCurrentTrack()
local sel = ed:getSelection()
local hit = nil
for i = 1, tr:getNumGroups() do
  local ref = tr:getGroupReference(i)
  if ref:getTarget():getName() == "${GROUP}" then hit = ref break end
end
if hit == nil then return 'not found' end
local okSel, err = pcall(function() sel:selectGroup(hit) end)
if not okSel then return 'selectGroup failed: ' .. tostring(err) end
return 'selected'
`;
  const r2 = await call('run_script', { code, readonly: true });
  console.log(`② selectGroup → ${r2.ok ? JSON.stringify(r2.result.result) : 'ERR ' + r2.error}`);

  const cg1 = (await call('get_current_group')).result;
  const isTarget = cg1.current && cg1.name === GROUP;
  console.log(`③ 当前组（操作后）：${cg1.current ? cg1.name : '(无)'} · ${cg1.noteCount} 音符  ${isTarget ? '✅ 已成为当前组' : '⚠️ 仍不是目标组'}`);
  if (!isTarget) {
    console.log('\n⚠️ selectGroup 没能改变"当前组" —— 需要你在钢琴窗里**点一下**这个组（一次点击）。');
    console.log(`   组名：「${GROUP}」（在当前轨上）`);
  }
  process.exit(isTarget ? 0 : 3);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
