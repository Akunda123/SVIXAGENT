#!/usr/bin/env node
/**
 * 真机验收（SV2 专属）：write_pit 的**曲线路线**
 *
 * 为什么单独一篇：SV1 没有 `addPitchControl` 系 API（实测 canCurve=false），
 * 所以曲线路线此前**只在离线假宿主上跑过** —— 而假宿主的 PitchControlCurve 是我写的桩，
 * 真实的 `SV.create("PitchControlCurve")` / `setPosition` / `setPitch` / `setPoints` /
 * `group:addPitchControl` 这一串在真机上从没执行过。
 *
 * 流程：
 *   ① 往当前组写入 6 个测试音符（write，可 undo）
 *   ② write_pit（不指定 mode ⇒ SV2 自动走 curve）→ 断言 mode/canCurve/curves
 *   ③ run_script 读回：getNumPitchControls / getPoints / getPosition / getPitch ← **真机 API 验证**
 *   ④ 幂等：再写一次 ⇒ 曲线数不翻倍、removedCurves > 0
 *   ⑤ clear="all" ⇒ 全清
 *   ⑥ 收尾：清掉曲线（保持工程干净）
 *
 * 用法：node sv/lua/verify-sv2-curve.cjs
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
// 宿主可指定：`node <脚本> ix` 或 `--host=ix`（默认 sv）—— 同一脚本可验 SV1/SV2/IX
const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const ipc = require(path.join(DIST, 'fileipc.js'));

const TIMEOUT = 20000;
const Q = 705600000;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 260) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);

async function call(op, args) {
  return ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: TIMEOUT });
}
async function callOk(op, args) {
  const r = await call(op, args);
  if (!r.ok) throw new Error(`${op} 失败：${r.error}`);
  return r.result;
}
const script = async (code, readonly) => (await callOk('run_script', readonly ? { code, readonly: true } : { code })).result;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log(`桥：${hb && hb.bridge} · 宿主 ${hb && hb.hostName} ${hb && hb.version} · isSV2=${hb && hb.isSV2}\n`);
  if (!hb || !hb.isSV2) {
    console.log('⚠️ 当前心跳不是 SV2 —— 本脚本专测 SV2 的曲线路线，请先在 SV2 里运行桥。');
    process.exit(2);
  }

  const pi = await callOk('get_project_info', {});
  const g0 = ((pi.tracks || [])[0] || {}).groups || [];
  console.log(`工程：${pi.numTracks} 轨 · 首轨 ${g0.length} 组\n`);

  console.log('== 1. 自建独立测试组（**不再要求人工准备音符；也绝不碰主组**）==');
  // 历史教训：早期版本"往当前组塞 6 个测试音符"，空工程里那就是**轨道主组**（isMain=true），
  //   而 SV2 主组不可被编辑（用户 2026-09-12 指出）。随后改成"要求用户准备音符"，
  //   但那让脚本**无法自证**（工程空就跑不了）。⇒ 现在用正规做法：
  //   `create_harmony_group` 另建**独立组**（该 op 只建组、不碰主组）+ `selectGroup` 选它，
  //   跑完**摘除自己的组**（`verify-tail-peak.cjs` 已用同一套，SV2 实测可用）。
  const GROUP = 'AKDAgent曲线验收';
  await script([
    'local proj = SV:getProject()',
    'proj:newUndoRecord()',
    'local removed = 0',
    'for t = 1, proj:getNumTracks() do',
    '  local tr = proj:getTrack(t)',
    '  for g = tr:getNumGroups(), 1, -1 do',
    '    local ref = tr:getGroupReference(g)',
    '    if ref:getTarget():getName() == "' + GROUP + '" and not ref:isMain() then',
    '      tr:removeGroupReference(g)',
    '      removed = removed + 1',
    '    end',
    '  end',
    'end',
    'return removed',
  ].join('\n'));
  {
    const r = await call('create_harmony_group', {
      groupName: GROUP,
      notes: [0, 1, 2, 3, 4, 5].map((i) => ({
        pitch: 60 + i, onsetBlicks: i * Q, durationBlicks: Q, lyrics: 'la',
      })),
    });
    ok('create_harmony_group 成功（独立组，非主组）', r.ok === true, r.error);
    const sel = await script([
      'local ed = SV:getMainEditor()',
      'local tr = ed:getCurrentTrack()',
      'local sel = ed:getSelection()',
      'for i = 1, tr:getNumGroups() do',
      '  local ref = tr:getGroupReference(i)',
      '  if ref:getTarget():getName() == "' + GROUP + '" and not ref:isMain() then',
      '    local okS, err = pcall(function() sel:selectGroup(ref) end)',
      '    if not okS then return "selectGroup failed: " .. tostring(err) end',
      '    return "selected"',
      '  end',
      'end',
      'return "not found"',
    ].join('\n'), true);
    ok('已选中自建组', sel === 'selected', sel);
  }
  const cgPre = await callOk('get_current_group', {});
  note(`当前组：${cgPre.current ? cgPre.name : '(无)'}（${cgPre.noteCount} 音符）`);
  ok('当前组 = 自建组且非主组', cgPre.name === GROUP && cgPre.isMain !== true,
    `${cgPre.name} isMain=${cgPre.isMain}`);
  if (cgPre.name !== GROUP) {
    console.log('\n⚠️ 没能把自建组设为当前组（SV 里 selectGroup 偶发无效）—— 请在钢琴窗点一下「' + GROUP + '」后重跑。');
    process.exit(2);
  }

  console.log('\n== 2. write_pit（SV2 ⇒ 自动走 curve）==');
  let first = null;
  {
    const r = await callOk('write_pit', {});
    first = r;
    ok('mode = curve（SV2 自动）', r.mode === 'curve', r.mode);
    ok('canCurve = true（SV2 有 PitchControl API）', r.canCurve === true, r.canCurve);
    ok('isSv1 = false', r.isSv1 === false, r.isSv1);
    ok('processed = 6', r.processed === 6, r.processed);
    ok('生成了曲线（curves ≥ 1）', r.curves >= 1, r.curves);
    note(`mode=${r.mode} curves=${r.curves} attrs=${r.attrs} skipped=${r.skipped} removed=${r.removedCurves}`);
    if (Array.isArray(r.details)) {
      const d0 = r.details[0] || {};
      note(`第 1 条曲线：points=${d0.points} span=${d0.spanBlicks} step=${d0.step} start=${d0.startBlick} y=[${d0.yMin},${d0.yMax}] yAtOnset=${d0.yAtOnset}`);
    }
  }

  console.log('\n== 3. 读回真正的 PitchControlCurve（Lua API 真机验证）==');
  {
    const back = await script(`
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local n = g:getNumPitchControls()
local out = { count = n, curves = {} }
for i = 1, n do
  local c = g:getPitchControl(i)
  local rec = {}
  rec.i = i
  rec.position = c:getPosition()
  rec.pitch = c:getPitch()
  local pts = c:getPoints()
  rec.points = (pts ~= nil) and #pts or -1
  if pts ~= nil and #pts > 0 then
    rec.first = { pts[1][1], pts[1][2] }
    rec.last = { pts[#pts][1], pts[#pts][2] }
    rec.yMax = 0
    for k = 1, #pts do if math.abs(pts[k][2]) > rec.yMax then rec.yMax = math.abs(pts[k][2]) end end
  end
  out.curves[#out.curves + 1] = rec
end
return out
`, true);
    ok('组里的曲线数 = write_pit 报告的 curves', back.count === first.curves, `${back.count} vs ${first.curves}`);
    const c0 = (back.curves || [])[0];
    ok('getPosition() 返回数字（幂等判据可用）', c0 && typeof c0.position === 'number', c0);
    ok('getPitch() = 本音音高 60', c0 && c0.pitch === 60, c0 && c0.pitch);
    ok('getPoints() 返回成对数组且点数 ≥ 2', c0 && c0.points >= 2, c0 && c0.points);
    ok('首个点的相对时间为 0', c0 && c0.first && Math.abs(c0.first[0]) < 1e-9, c0 && c0.first);
    ok('点值量级合理（|y| < 4 半音）', c0 && c0.yMax < 4, c0 && c0.yMax);
    note(`读回 ${back.count} 条曲线；第 1 条 position=${c0 && c0.position} pitch=${c0 && c0.pitch} points=${c0 && c0.points} first=${JSON.stringify(c0 && c0.first)} last=${JSON.stringify(c0 && c0.last)}`);
  }

  console.log('\n== 4. 幂等：再写一次（不应翻倍）==');
  {
    const r2 = await callOk('write_pit', {});
    const back = await script(`
local g = SV:getMainEditor():getCurrentGroup():getTarget()
return g:getNumPitchControls()
`, true);
    ok('曲线数不翻倍', back === first.curves, `${back} vs ${first.curves}`);
    ok('removedCurves > 0（旧曲线被按窗口起点替换）', r2.removedCurves > 0, r2.removedCurves);
    note(`第二次：curves=${r2.curves} removedCurves=${r2.removedCurves}，组里仍 ${back} 条`);
  }

  console.log('\n== 5. clear="all"（先清后写）==');
  {
    const r3 = await callOk('write_pit', { clear: 'all', dryRun: true });
    note(`dryRun + clear=all：removedCurves=${r3.removedCurves}（dryRun 不该真删）`);
    const backDry = await script(`return SV:getMainEditor():getCurrentGroup():getTarget():getNumPitchControls()`, true);
    ok('dryRun 时没删任何曲线', backDry === first.curves, `${backDry} vs ${first.curves}`);

    const r4 = await callOk('write_pit', { clear: 'all' });
    const back = await script(`return SV:getMainEditor():getCurrentGroup():getTarget():getNumPitchControls()`, true);
    ok('clear=all 真的清了（随后重建同数）', back === first.curves, `${back} vs ${first.curves}`);
    ok('removedCurves 记录了删除数', r4.removedCurves >= first.curves, r4.removedCurves);
    note(`clear=all：removedCurves=${r4.removedCurves} curves=${r4.curves}，组里 ${back} 条`);
  }

  console.log('\n== 6. 收尾：清掉曲线 ==');
  {
    const left = await script(`
local proj = SV:getProject()
proj:newUndoRecord()
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local removed = 0
for i = g:getNumPitchControls(), 1, -1 do
  g:removePitchControl(i)
  removed = removed + 1
end
return { removed = removed, left = g:getNumPitchControls() }
`);
    ok('曲线已清空（工程保持干净）', left.left === 0, left);
    note(`清掉 ${left.removed} 条曲线，剩余 ${left.left}`);
  }

  console.log('\n== 7. 收尾：摘除自建组（工程回到原样）==');
  {
    const rm = await script([
      'local proj = SV:getProject()',
      'proj:newUndoRecord()',
      'local removed = 0',
      'for t = 1, proj:getNumTracks() do',
      '  local tr = proj:getTrack(t)',
      '  for g = tr:getNumGroups(), 1, -1 do',
      '    local ref = tr:getGroupReference(g)',
      '    if ref:getTarget():getName() == "' + GROUP + '" and not ref:isMain() then',
      '      tr:removeGroupReference(g)',
      '      removed = removed + 1',
      '    end',
      '  end',
      'end',
      'return removed',
    ].join('\n'));
    note(`摘掉 ${JSON.stringify(rm)} 个组引用`);
    const leftGroups = await script([
      'local proj = SV:getProject()',
      'local out = {}',
      'for t = 1, proj:getNumTracks() do',
      '  local tr = proj:getTrack(t)',
      '  for g = 1, tr:getNumGroups() do',
      '    local ref = tr:getGroupReference(g)',
      '    out[#out + 1] = ref:getTarget():getName() .. "(" .. ref:getTarget():getNumNotes() .. ")"',
      '  end',
      'end',
      'return table.concat(out, " ")',
    ].join('\n'), true);
    note(`轨上剩余组：${leftGroups}`);
    ok('没有残留同名测试组', !String(leftGroups).includes(GROUP), leftGroups);
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  console.log('说明：测试组是脚本**自建**的（独立组、非主组），已摘除；所有写入都有 undo 记录。');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
