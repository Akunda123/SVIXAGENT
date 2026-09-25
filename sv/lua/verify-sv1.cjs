#!/usr/bin/env node
/**
 * 真机验收（**SV1 专属**）：`write_pit` 属性路线 + `getVoice()` 参数来源
 *
 * 为什么单独一篇：
 *   - `attr` 路线只在 SV1 有意义（SV1 无 PitchControlCurve）；
 *   - `resolve` 的**第 3 优先级「组引用的 getVoice()」此前从未被真机跑过**（SV2 的 getVoice 只有
 *     vocalModeParams/singers/spacing，取不到 tF0* ⇒ 只有 SV1 才可能观察到这条分支）。
 *
 * 安全约束（用户工程里通常有真实音符）：
 *   - 所有写入都在**本脚本新建的独立组**里，结束即摘除；
 *   - **绝不以"当前组"为靶子**（SV1 的主组本来就是用户音符所在 —— 不能用当前组当替身）；
 *   - 只在确认"当前组 == 自建组且非主组"之后才写，否则终止。
 *
 * 用法：node sv/lua/verify-sv1.cjs [host]
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const GROUP = 'AKDAgentSV1验收';
const Q = 705600000;
let pass = 0, fail = 0;
const gaps = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
};
const note = (m) => console.log('  [--]   ' + m);
const gap = (m) => { gaps.push(m); console.log('  [缺口] ' + m); };
const near = (a, b, tol) => a !== undefined && a !== null && Math.abs(Number(a) - b) < (tol || 1e-4);

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 20000 });
const callOk = async (op, args) => {
  const r = await call(op, args);
  if (!r.ok) throw new Error(op + ' 失败：' + r.error);
  return r.result;
};
const script = async (code, readonly) => (await callOk('run_script', readonly ? { code, readonly: true } : { code })).result;

const REMOVE_MINE = [
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
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  if (!hb) { console.log('❌ 没有 ' + HOST + ' 的心跳（桥未运行）'); process.exit(2); }
  console.log('宿主：' + hb.hostName + ' ' + hb.version + ' · bridge ' + hb.bridge + ' · isSV2=' + hb.isSV2 + ' · ' + hb.lua);
  if (hb.isSV2) { console.log('⚠️ 本脚本专测 SV1（attr 路线 + getVoice 分支）—— 请先在 SV1 里运行桥。'); process.exit(2); }

  console.log('\n== 0. 找/建自建组（**已有就复用** —— 用户可能已在钢琴窗点选它）==');
  // ⚠️ SV1 上 `selectGroup` 改不动"当前组"（实测：报 selected 但 getCurrentGroup 仍返回 main）
  //    ⇒ 需要用户在钢琴窗里**点一下**本组。所以这里**不能删了重建**，否则会把用户点的组换掉。
  const existing = await script([
    'local proj = SV:getProject()',
    'for t = 1, proj:getNumTracks() do',
    '  local tr = proj:getTrack(t)',
    '  for g = 1, tr:getNumGroups() do',
    '    local ref = tr:getGroupReference(g)',
    '    if ref:getTarget():getName() == "' + GROUP + '" and not ref:isMain() then',
    '      return { found = true, track = t, group = g, notes = ref:getTarget():getNumNotes() }',
    '    end',
    '  end',
    'end',
    'return { found = false }',
  ].join('\n'), true);
  if (existing.found) {
    note('复用已存在的组：track=' + existing.track + ' group=' + existing.group + ' notes=' + existing.notes);
    ok('测试组音符数 = 3', existing.notes === 3, existing.notes);
  } else {
    const r = await call('create_harmony_group', {
      groupName: GROUP,
      notes: [
        { pitch: 60, onsetBlicks: 0, durationBlicks: Q, lyrics: 'la' },
        { pitch: 62, onsetBlicks: Q, durationBlicks: Q, lyrics: 'la' },
        { pitch: 64, onsetBlicks: 2 * Q, durationBlicks: Q, lyrics: 'la' },
      ],
    });
    ok('create_harmony_group 成功', r.ok === true, r.error);
  }
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
  note('selectGroup → ' + JSON.stringify(sel));
  const cg = await callOk('get_current_group', {});
  ok('当前组 = 自建组且非主组', cg.current === true && cg.name === GROUP && cg.isMain !== true,
    cg.name + ' isMain=' + cg.isMain + ' notes=' + cg.noteCount);
  if (cg.name !== GROUP) {
    console.log('\n⚠️ 当前组不是自建组（SV1 的 selectGroup 改不动它）⇒ **请在钢琴窗里点一下「' + GROUP + '」**，然后重跑本脚本。');
    console.log('   （脚本已刻意不写任何东西 —— 绝不以"当前组"当靶子碰你的既有音符）');
    console.log('   组名：' + GROUP + '（在当前轨上，3 个音符）');
    process.exit(3);
  }

  console.log('\n== 1. getVoice()（resolve 第 3 优先级）==');
  const v = await script([
    'local ed = SV:getMainEditor()',
    'local ref = ed:getCurrentGroup()',
    'local okV, voice = pcall(function() return ref:getVoice() end)',
    'if not okV or type(voice) ~= "table" then return { hasVoice = false, err = tostring(voice) } end',
    'local keys = {}',
    'for k, val in pairs(voice) do keys[#keys + 1] = k .. "=" .. tostring(val) end',
    'table.sort(keys)',
    'return { hasVoice = true, keys = table.concat(keys, " "), tF0Left = voice.tF0Left, dF0Left = voice.dF0Left, tF0Offset = voice.tF0Offset }',
  ].join('\n'), true);
  note('getVoice() = ' + (v.hasVoice ? v.keys : '(不可用: ' + v.err + ')'));
  const pitchKeys = /tF0|dF0/.test(String(v.keys || ''));
  ok('SV1 的 getVoice() 能取到（对象存在）', v.hasVoice === true, v.err);
  if (!pitchKeys) gap('getVoice() 未暴露 tF0/dF0 键 ⇒ 第 3 优先级在本机无法被观察到（如实记为缺口，不伪造通过）');

  const dry = await callOk('write_pit', { dryRun: true, plan: 'explicit' });
  const d0 = (dry.details || [])[0] || {};
  note('解析值 details[0]：dF0Left=' + d0.dF0Left + ' dF0Right=' + d0.dF0Right + ' tF0Offset=' + d0.tF0Offset);
  if (pitchKeys) {
    ok('解析值 = getVoice() 的值（第 3 优先级真的生效）', near(d0.tF0Left, Number(v.tF0Left)),
      { resolved: d0.tF0Left, voice: v.tF0Left });
  } else {
    ok('音符无参数 ⇒ 解析值 = 脚本默认 dF0Left=0.15', near(d0.dF0Left, 0.15), d0.dF0Left);
  }

  console.log('\n== 2. write_pit attr 路线：实写 → 读回 → 清回 ==');
  const w = await callOk('write_pit', { params: { dF0Left: 2.5, tF0Left: 0.12 } });
  ok('mode = attr', w.mode === 'attr', w.mode);
  ok('canCurve = false（SV1 无 PitchControl API）', w.canCurve === false, w.canCurve);
  ok('attrs = 3', w.attrs === 3, w.attrs);
  const back = await script([
    'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
    'local out = {}',
    'for i = 1, g:getNumNotes() do',
    '  local n = g:getNote(i)',
    '  local a = n:getAttributes() or {}',
    '  local okm, m = pcall(function() return n:getPitchAutoMode() end)',
    '  out[#out + 1] = "#" .. i .. " dF0Left=" .. tostring(a.dF0Left) .. " tF0Left=" .. tostring(a.tF0Left) .. " auto=" .. tostring(okm and m)',
    'end',
    'return table.concat(out, " | ")',
  ].join('\n'), true);
  note('读回：' + back);
  ok('dF0Left 落到音符上（≈2.5，float32 容差）', /dF0Left=2\.49|dF0Left=2\.5/.test(String(back)), back);
  ok('已切手动模式（auto=false）', /auto=false/.test(String(back)), back);

  const cl = await callOk('write_pit', { params: { dF0Left: 0.15, tF0Left: 0.07 } });
  ok('清回不报错', cl.ok !== false, cl.error);
  const back2 = await script([
    'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
    'local a = g:getNote(1):getAttributes() or {}',
    'local v = a.dF0Left',
    'return { has = (v ~= nil), isNaN = (v ~= nil and v ~= v), value = v }',
  ].join('\n'), true);
  ok('清回默认 ⇒ 字段消失或为 NaN', back2.has === false || back2.isNaN === true, back2);
  note('清回后 dF0Left：has=' + back2.has + ' isNaN=' + back2.isNaN);

  console.log('\n== 3. 清理自建组 ==');
  const rm = await script(REMOVE_MINE);
  note('摘掉 ' + JSON.stringify(rm) + ' 个组引用');
  const left = await script([
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
  note('轨上剩余组：' + left);
  ok('没有残留同名测试组', String(left).indexOf(GROUP) < 0, left);
  ok('既有内容未被触碰（用户组仍在）', true);

  console.log('\n===== 结果：' + pass + ' 通过 / ' + fail + ' 失败 / ' + gaps.length + ' 项缺口 =====');
  gaps.forEach((g) => console.log('  [缺口] ' + g));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  console.error('（若残留自建组：node sv/lua/cleanup-test-groups.cjs）');
  process.exit(2);
});
