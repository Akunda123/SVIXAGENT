#!/usr/bin/env node
/**
 * §2.4 真机核对（**SV1 可视化**）：`tF0Offset` 的**跨段耦合**
 *
 * 为什么用"分步演示 + 人眼"：SV1 **没有** PitchControlCurve API（实测 canCurve=false），
 *   渲染出来的音高曲线**无法用 API 读回** ⇒ "动 tF0Offset 会让哪几段一起移"这件事
 *   只能**在钢琴窗里看**。所以本脚本按阶段写属性、每步停下让你看，而不是自动断言。
 *
 * 三个阶段（依次跑，中间你负责看）：
 *   setup   音1 给音尾凸起、音2 给音头凸起（tF0Offset=0）—— 记下**音头峰值位置**
 *   shift   只把**音2 自己的 tF0Offset 改成 −0.15**，其它参数一字不改
 *           ⇒ §2.4 预期：音头（pit3）、左连接（pit2）、前音音尾（pit1）**一起向左平移 0.15s**
 *   restore 清回默认值（0.15 / 0.07 / 0）
 *   （另有 shiftTail：只改**音3**的 tF0Offset ⇒ 验 §6.4「音尾峰点跟后音的 tF0Offset 走」）
 *
 * 安全：只作用于**自建测试组**（组名 AKDAgent耦合演示）；当前组不是它就终止、不写任何东西。
 *
 * 用法：node sv/lua/demo-tf0offset.cjs [host] [setup|shift|shiftTail|restore]
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const PHASE = (process.argv.slice(2).find((a) => ['create', 'status', 'setup', 'shift', 'tail0', 'shiftTail', 'restore'].includes(a))) || 'setup';
const GROUP = 'AKDAgent耦合演示';
const Q = 705600000;
const SHIFT = -0.15;          // 秒：本音 tF0Offset 的变化量（负 = 提前）

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 20000 });
const callOk = async (op, args) => {
  const r = await call(op, args);
  if (!r.ok) throw new Error(op + ' 失败：' + r.error);
  return r.result;
};
const script = async (code, readonly) => (await callOk('run_script', readonly ? { code, readonly: true } : { code })).result;

const FIND_GROUP = [
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
].join('\n');

const READ_ATTRS = [
  'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
  'local out = {}',
  'for i = 1, g:getNumNotes() do',
  '  local n = g:getNote(i)',
  '  local a = n:getAttributes() or {}',
  '  local okA, am = pcall(function() return n:getPitchAutoMode() end)',
  '  out[#out + 1] = string.format("#%d p=%d auto=%s dFL=%s tFL=%s dFR=%s tFR=%s tOff=%s", i, n:getPitch(),',
  '    tostring(okA and am), tostring(a.dF0Left), tostring(a.tF0Left), tostring(a.dF0Right), tostring(a.tF0Right), tostring(a.tF0Offset))',
  'end',
  'return table.concat(out, "\\n")',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  if (!hb) { console.log('❌ 没有 ' + HOST + ' 的心跳（桥未运行）'); process.exit(2); }
  console.log('宿主：' + hb.hostName + ' ' + hb.version + ' · bridge ' + hb.bridge + ' · isSV2=' + hb.isSV2);
  if (hb.isSV2) console.log('⚠️ 本脚本是为 **SV1** 设计的（SV2 上曲线可用 API 读回，不必靠人眼）——仍可跑，只是意义不大。');

  // ⚠️ 版本差异（用户 2026-09-12 明确）：**SV1 的音符本来就在主音符组，SV1 上可以直接编辑主组**
  //    （SV2 才是"主组不可编辑、只是保留了主组结构"）⇒
  //    · SV1：直接用**当前组**（就是主组），不必自建组、也不必让用户点选；
  //    · SV2：仍然只允许自建组（`AKDAgent耦合演示`），当前组不是它就终止。
  const isSv1 = hb.isSV2 === false;
  if (isSv1) {
    const cgMain = await callOk('get_current_group', {});
    console.log('SV1 ⇒ 直接使用当前组：' + cgMain.name + '（' + cgMain.noteCount + ' 音符）'
      + (cgMain.isMain ? ' · 主组（SV1 上这是正常编辑目标 ✓）' : ''));
    if (!cgMain.current || cgMain.noteCount === 0) {
      console.log('\n❌ 当前组没有音符 —— 先在主组里放几个音符（3 个相邻 1 拍的最直观），或跑：');
      console.log('   node sv/lua/demo-tf0offset.cjs ' + HOST + ' create --main   （在**主组**里放 3 个演示音符）');
      process.exit(2);
    }
  }

  const found = await script(FIND_GROUP, true);
  if (PHASE === 'create') {
    if (process.argv.includes('--main')) {
      // SV1 专用：直接往**当前组（主组）**放 3 个相邻音符（用户已授权 SV1 编辑主组）
      const r = await script([
        'local proj = SV:getProject()',
        'proj:newUndoRecord()',
        'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
        'local Q = 705600000',
        'local pitches = { 60, 62, 64 }',
        'for i = 1, 3 do',
        '  local n = SV:create("Note")',
        '  n:setPitch(pitches[i])',
        '  n:setOnset((i - 1) * Q)',
        '  n:setDuration(Q)',
        '  n:setLyrics("la")',
        '  g:addNote(n)',
        'end',
        'return g:getName() .. "/" .. g:getNumNotes()',
      ].join('\n'));
      console.log('✅ 已在当前组里放 3 个相邻音符（各 1 拍）：' + JSON.stringify(r));
      console.log('👉 直接跑：node sv/lua/demo-tf0offset.cjs ' + HOST + ' setup');
      process.exit(0);
    }
    if (!found.found) {
      const r = await call('create_harmony_group', {
        groupName: GROUP,
        notes: [
          { pitch: 60, onsetBlicks: 0, durationBlicks: Q, lyrics: 'la' },
          { pitch: 62, onsetBlicks: Q, durationBlicks: Q, lyrics: 'la' },
          { pitch: 64, onsetBlicks: 2 * Q, durationBlicks: Q, lyrics: 'la' },
        ],
      });
      if (!r.ok) { console.log('❌ 建组失败：' + r.error); process.exit(1); }
      console.log('✅ 已建独立测试组「' + GROUP + '」（3 个音符，各 1 拍；非主组）');
    } else {
      console.log('已存在测试组「' + GROUP + '」（notes=' + found.notes + '）');
    }
    await script([
      'local ed = SV:getMainEditor()',
      'local tr = ed:getCurrentTrack()',
      'local sel = ed:getSelection()',
      'for i = 1, tr:getNumGroups() do',
      '  local ref = tr:getGroupReference(i)',
      '  if ref:getTarget():getName() == "' + GROUP + '" and not ref:isMain() then',
      '    pcall(function() sel:selectGroup(ref) end)',
      '    return "selected"',
      '  end',
      'end',
      'return "not found"',
    ].join('\n'), true);
    const cg0 = await callOk('get_current_group', {});
    if (cg0.name === GROUP) {
      console.log('✅ 当前组已经是它了 —— 直接跑：node sv/lua/demo-tf0offset.cjs ' + HOST + ' setup');
    } else {
      console.log('👉 请在钢琴窗里**点一下「' + GROUP + '」**（SV1 上 selectGroup 改不动"当前组"），然后跑：');
      console.log('   node sv/lua/demo-tf0offset.cjs ' + HOST + ' setup');
    }
    process.exit(0);
  }
  if (!isSv1 && !found.found) {
    console.log('\n❌ 没找到自建测试组「' + GROUP + '」。先跑：node sv/lua/demo-tf0offset.cjs ' + HOST + ' create');
    process.exit(2);
  }
  if (!isSv1) console.log('测试组：track=' + found.track + ' group=' + found.group + ' notes=' + found.notes);
  const cg = await callOk('get_current_group', {});
  if (!isSv1 && cg.name !== GROUP) {
    console.log('\n⚠️ 当前组是「' + cg.name + '」而不是测试组 —— **请在钢琴窗里点一下「' + GROUP + '」**再重跑。');
    console.log('   （SV2 上不以"当前组"当靶子：主组不可编辑，脚本只动自建组）');
    process.exit(3);
  }

  console.log('\n== 写入前（音符属性）==');
  console.log(await script(READ_ATTRS, true));

  if (PHASE === 'status') {
    console.log('\n（status 阶段只读不写。auto=false 才是手动模式 —— 桥只在"真有属性要写"时才切手动，');
    console.log('  所以没写过任何参数的音符仍会是 auto=true。要看曲线先跑 setup。）');
    process.exit(0);
  }

  if (PHASE === 'setup') {
    // 音1：音尾凸起（给足宽度，肉眼好看）；音2：音头凸起（tF0Offset=0）；音3：不动
    const r = await callOk('write_pit', {
      params: { dF0Left: 0.15, tF0Left: 0.07, dF0Right: 0.15, tF0Right: 0.07, tF0Offset: 0, dF0Vbr: 0, fF0Vbr: 0 },
      perNote: {
        0: { dF0Right: 2.5, tF0Right: 0.25 },                       // 音1：音尾凸起
        1: { dF0Left: 2.5, tF0Left: 0.25, dF0Right: 0, tF0Offset: 0 }, // 音2：音头凸起（旋钮=0）
      },
    });
    console.log('\n== setup 已写入 ==  attrs=' + r.attrs + ' processed=' + r.processed);
    console.log('👉 **请看钢琴窗**（音2 只有 1 拍左右，可放大）：');
    console.log('   · 音2 **onset 处**应有一个向上的尖峰（音头凸起），约在 onset 稍前 —— 记下它相对 onset 的位置');
    console.log('   · 音1 的末端（两音交界）应有一个音尾凸起');
    console.log('   看完后跑：node sv/lua/demo-tf0offset.cjs ' + HOST + ' shift');
  } else if (PHASE === 'shift') {
    const r = await callOk('write_pit', {
      params: { dF0Left: 0.15, tF0Left: 0.07, dF0Right: 0.15, tF0Right: 0.07, tF0Offset: 0, dF0Vbr: 0, fF0Vbr: 0 },
      perNote: {
        0: { dF0Right: 2.5, tF0Right: 0.25 },
        1: { dF0Left: 2.5, tF0Left: 0.25, dF0Right: 0, tF0Offset: SHIFT },  // 只动这一个旋钮
      },
    });
    console.log('\n== shift 已写入 ==  attrs=' + r.attrs + '（只有音2 的 tF0Offset 从 0 → ' + SHIFT + '）');
    console.log('👉 **请看**：音2 的音头尖峰是否**整体向左平移了 ' + Math.abs(SHIFT) + ' 秒**？');
    console.log('   §2.4 预期：**一起移**（音头 pit3 + 左连接 pit2 + 前音音尾 pit1 同属这个旋钮）——');
    console.log('   即"交界处那一整簇"都往左挪，而不是只有音头尖峰动。');
    console.log('   看完后跑：node sv/lua/demo-tf0offset.cjs ' + HOST + ' shiftTail');
  } else if (PHASE === 'tail0' || PHASE === 'shiftTail') {
    // ⚠️ 两个坑都要绕开：① `perNote`（纯数字键可能被当数组解码 ⇒ 取不到）；
    //    ② 目标优先级是 indices → **选中音符** → 全部（UI 里选中一个音符就会只写它）⇒ 全程显式 `indices`。
    const off = PHASE === 'tail0' ? 0 : SHIFT;
    const DEF = { dF0Left: 0.15, tF0Left: 0.07, dF0Right: 0.15, tF0Right: 0.07, tF0Offset: 0, dF0Vbr: 0, fF0Vbr: 0 };
    await callOk('write_pit', { indices: [0, 1, 2], params: DEF });                       // 全清
    await callOk('write_pit', { indices: [1], params: { ...DEF, dF0Left: 0, dF0Right: 2.5, tF0Right: 0.25 } }); // 音2：只留音尾凸起
    if (off !== 0) await callOk('write_pit', { indices: [2], params: { tF0Offset: off } }); // 音3：就是"后音的 tF0Offset"
    console.log('\n== ' + PHASE + ' 已写入 ==  音2 音尾凸起（dF0Right=2.5, tF0Right=0.25），音3 的 tF0Offset = ' + off);
    console.log('👉 **请看音2 末端（音2↔音3 交界）的音尾凸起位置**：');
    console.log('   · `tail0` 是基线（后音 tF0Offset = 0）⇒ 凸起在交界左侧 ' + (0.45 * 0.25).toFixed(3) + 's');
    console.log('   · `shiftTail` 后（后音 tF0Offset = ' + SHIFT + '）⇒ 凸起应**再左移 ' + Math.abs(SHIFT) + 's**');
    console.log('   （§6.4：交界参数归交界**右侧**那个音符 ⇒ 音2 的音尾峰点用**音3**的 tF0Offset）');
    console.log('   下一步：node sv/lua/demo-tf0offset.cjs ' + HOST + (PHASE === 'tail0' ? ' shiftTail' : ' restore'));
  } else {
    const r = await callOk('write_pit', {
      params: { dF0Left: 0.15, tF0Left: 0.07, dF0Right: 0.15, tF0Right: 0.07, tF0Offset: 0, dF0Vbr: 1, fF0Vbr: 5.5 },
    });
    console.log('\n== restore 已写入 ==  attrs=' + r.attrs + ' skipped=' + r.skipped + '（参数回默认值）');
  }

  console.log('\n== 写入后（音符属性读回）==');
  console.log(await script(READ_ATTRS, true));
  console.log('\n（所有写入都有 undo 记录：SV 里可 Ctrl+Z 逐步回退）');
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
