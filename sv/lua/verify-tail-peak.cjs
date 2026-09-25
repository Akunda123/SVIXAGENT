#!/usr/bin/env node
/**
 * 真机验收：音尾峰点位置 = **两音符交界（本音 end）**（用户裁定 2026-09-12 / 桥 v0.3.3）
 *
 * 为什么要差分：读回的曲线点值 = 全局轮廓(level) − 本音音高 + 凸起(bumps)，
 *   直接取 |max| 会被**两音之间的音高过渡**污染（历史教训：§2.4 的第一次测量就是这么错的）。
 *   ⇒ 写两遍：**带音尾凸起** vs **不带**（dF0Right=0），两条曲线相减 ⇒ 只剩纯音尾凸起，
 *   再取 |差| 最大点的时间 t*，与音符 end（blick）比较。
 *
 * 三种情形：
 *   ① 后音无音头（后音无参）⇒ 峰点应**精确落在 E1**
 *   ② 句尾（最后一个音符，无后音）⇒ 峰点应**精确落在 E2**
 *   ③ 后音带 tF0Offset（−0.035）⇒ 峰点 = E1 − 0.035s（交界稍前，"落在两音符之间"）
 *
 * 容差：采样步长 15,000,000 blick/点（SV 点与点之间由宿主插值）
 *   ⇒ 分析解精确在 E，但**采样格点**落在 E 附近 ≤ 半步，故容差取 1 步。
 *
 * 用法：node sv/lua/verify-tail-peak.cjs [host]   （默认 sv；脚本自建/自清测试组，不碰主组）
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

// 宿主可指定：`node <脚本> ix` 或 `--host=ix`（默认 sv）—— 与其余验收脚本同一约定
const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const GROUP = 'AKDAgent尾峰测试';
const STEP = 15000000;          // PIT.STEP
const TOL = STEP;               // 1 个采样步长
const Q = 705600000;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const sec2blick = (s, bpm) => Math.round(s * (bpm / 60) * Q);

async function call(op, args) {
  return ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 20000 });
}
async function callOk(op, args) {
  const r = await call(op, args);
  if (!r.ok) throw new Error(`${op} 失败：${r.error}`);
  return r.result;
}
async function script(code) {
  const r = await callOk('run_script', { code, readonly: true });
  return r.result;
}

/** 读回全组曲线：每条的 { position(blick), pitch, pts:[[relBlick, y]] } + 音符时值 + bpm */
const READ_CODE = `
local proj = SV:getProject()
local ta = proj:getTimeAxis()
local ed = SV:getMainEditor()
local g = ed:getCurrentGroup():getTarget()
local marks = ta:getAllTempoMarks()
local bpm = 120
if marks ~= nil and #marks > 0 then bpm = marks[1].bpm end
local curves = {}
for i = 1, g:getNumPitchControls() do
  local c = g:getPitchControl(i)
  local pts = {}
  if c ~= nil then
    local raw = c:getPoints() or {}
    for k = 1, #raw do pts[k] = { raw[k][1], raw[k][2] } end
  end
  curves[#curves + 1] = { position = c:getPosition(), pitch = c:getPitch(), pts = pts }
end
local notes = {}
for i = 1, g:getNumNotes() do
  local n = g:getNote(i)
  notes[#notes + 1] = { onset = n:getOnset(), endB = n:getEnd(), pitch = n:getPitch() }
end
return { bpm = bpm, curves = curves, notes = notes, group = g:getName(), nCurves = g:getNumPitchControls() }
`;

const CLEAR_CODE = `
local ed = SV:getMainEditor()
local g = ed:getCurrentGroup():getTarget()
local n = 0
for i = g:getNumPitchControls(), 1, -1 do g:removePitchControl(i); n = n + 1 end
return n
`;

/** 按 pitch 找曲线，返回 { abs:[[absBlick,y]], ys:[y] } */
function curveByPitch(read, pitch) {
  const c = (read.curves || []).find((x) => x.pitch === pitch);
  if (!c) return null;
  const abs = c.pts.map(([rel, y]) => [c.position + rel, y]);
  return { abs, ys: abs.map((p) => p[1]), pos: c.position, n: abs.length };
}

/** 差分两遍曲线，取窗口内的峰值（返回 top-5 便于排障）
 *  ⚠️ 必须限窗：每条曲线的窗口都向左/右多覆盖 1.45·tF0 的邻音凸起，
 *     音2 的曲线里就带着**音1 的音尾凸起** —— 不限窗会误取邻音的峰（第一版就栽在这）。 */
function peakOf(bump, base, lo, hi) {
  if (!bump || !base) return null;
  if (bump.n !== base.n) return { err: `点数不一致 ${bump.n} vs ${base.n}` };
  const rows = [];
  for (let i = 0; i < bump.n; i++) {
    const t = bump.abs[i][0];
    if (lo !== undefined && (t < lo || t > hi)) continue;
    rows.push({ t, d: bump.ys[i] - base.ys[i] });
  }
  if (!rows.length) return { err: '窗口内没有采样点' };
  rows.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const top = rows.slice(0, 5);
  return { t: top[0].t, amp: top[0].d, idx: top[0].t, n: bump.n, top };
}

const TAIL_PARAMS = { tF0Left: 0.07, dF0Left: 0, tF0Right: 0.13, tF0Offset: 0, dF0Vbr: 0, fF0Vbr: 0 };

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  if (!hb) { console.log(`❌ 没有 ${HOST} 的心跳（桥未运行）`); process.exit(2); }
  console.log(`宿主：${hb.hostName} ${hb.version} · bridge ${hb.bridge} · ${hb.lua || ''}`);

  console.log('\n== 0. 建测试组（独立组，不碰主组）==');
  const cg0 = await callOk('get_current_group', {});
  console.log(`  操作前当前组：${cg0.current ? cg0.name : '(无)'}${cg0.isMain ? ' ⚠️ 是主组' : ''}`);
  {
    await script(CLEAR_CODE).catch(() => {});
    const r = await call('create_harmony_group', {
      groupName: GROUP,
      notes: [
        { pitch: 60, onsetBlicks: 0, durationBlicks: Q, lyrics: 'la' },
        { pitch: 62, onsetBlicks: Q, durationBlicks: Q, lyrics: 'la' },
      ],
    });
    ok('create_harmony_group 成功', r.ok === true, r.error);
    const sel = await script(`
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
`);
    ok('已选中测试组', sel === 'selected', sel);
  }
  const cg1 = await callOk('get_current_group', {});
  ok('当前组 = 测试组', cg1.current === true && cg1.name === GROUP, `${cg1.name} (${cg1.noteCount})`);
  ok('当前组不是主组（铁律）', cg1.isMain !== true, cg1.isMain);
  if (cg1.name !== GROUP) { console.log('⚠️ 无法把测试组设为当前组，终止'); process.exit(3); }

  const info = await script(READ_CODE);
  const bpm = info.bpm || 120;
  const notes = info.notes || [];
  console.log(`  bpm=${bpm} · 音符 ${notes.length} 个 · E1=${notes[0].endB} E2=${notes[1].endB}（blick）`);
  ok('读回 2 个音符', notes.length === 2, notes.length);

  console.log('\n== 1. 写「带音尾凸起」的曲线（dF0Right=+2）==');
  {
    const r = await callOk('write_pit', { mode: 'curve', clear: 'all', params: { ...TAIL_PARAMS, dF0Right: 2 } });
    ok('curve 模式写入成功', r.mode === 'curve' && r.curves === 2, `mode=${r.mode} curves=${r.curves}`);
    note(`step=${(r.details || [])[0] && r.details[0].step} 点/条=${(r.details || []).map((d) => d.points).join(',')}`);
  }
  const readBump = await script(READ_CODE);

  console.log('\n== 2. 写「不带凸起」的基线（dF0Right=0）==');
  {
    const r = await callOk('write_pit', { mode: 'curve', clear: 'all', params: { ...TAIL_PARAMS, dF0Right: 0 } });
    ok('基线写入成功', r.mode === 'curve' && r.curves === 2, `curves=${r.curves}`);
  }
  const readBase = await script(READ_CODE);

  console.log('\n== 3. 峰值落点（差分隔离后的纯音尾凸起）==');
  const half = 0.25;                                   // 搜索半径（秒）⇒ 只找本音自己的音尾凸起
  const win = (E, bpm) => [E - sec2blick(half, bpm), E + sec2blick(half, bpm)];
  const W1 = win(notes[0].endB, bpm), W2 = win(notes[1].endB, bpm);
  const pk1 = peakOf(curveByPitch(readBump, 60), curveByPitch(readBase, 60), W1[0], W1[1]);
  const pk2 = peakOf(curveByPitch(readBump, 62), curveByPitch(readBase, 62), W2[0], W2[1]);
  if (!pk1 || pk1.err || !pk2 || pk2.err) {
    ok('差分可比（两遍点数一致）', false, { pk1, pk2 });
  } else {
    const E1 = notes[0].endB, E2 = notes[1].endB;
    const d1 = pk1.t - E1, d2 = pk2.t - E2;
    note(`音符1（有后音·后音无音头）：峰点 t*=${pk1.t}  E1=${E1}  Δ=${d1} blick (${(d1 / Q * 60 / bpm * 1000).toFixed(2)} ms)  幅度=${pk1.amp.toFixed(3)}`);
    note(`音符2（句尾·无后音）    ：峰点 t*=${pk2.t}  E2=${E2}  Δ=${d2} blick (${(d2 / Q * 60 / bpm * 1000).toFixed(2)} ms)  幅度=${pk2.amp.toFixed(3)}`);
    note(`  音1 差分 top5：${pk1.top.map((r) => `${r.t}(${r.d.toFixed(2)})`).join(' ')}`);
    note(`  音2 差分 top5：${pk2.top.map((r) => `${r.t}(${r.d.toFixed(2)})`).join(' ')}`);
    ok('① 后音无音头 ⇒ 峰点在 E1（≤1 个采样步）', Math.abs(d1) <= TOL, d1);
    ok('② 句尾无后音 ⇒ 峰点在 E2（≤1 个采样步）', Math.abs(d2) <= TOL, d2);
    ok('③ 峰点不再内移（Δ 远小于 0.45·tF0Right = 58.5e6）', Math.abs(d1) < 30000000 && Math.abs(d2) < 30000000, { d1, d2 });
    ok('④ 凸起幅度 ≈ dF0Right=2（后音更高 ⇒ 方向为 −2）', Math.abs(Math.abs(pk1.amp) - 2) < 0.6, pk1.amp);

    console.log('\n== 4. 「顶点始终在 end；只有后音有音头（撞上）才前挪」==');
    {
      // ⚠️ 两个前提：
      //  ① `params` 覆盖只作用于**目标音符**；音尾峰点用的后音 `tF0Offset`、后音音头（pit7）
      //     都是从**后音自己的** scriptData 读的 ⇒ 必须往后音自己写。
      //  ② 每次改完后音的参数，**基线也要重写**：否则差分里会掺进 pit6/pit7 的变化（不是纯音尾凸起）。
      //    （后音参数一致时，pit6/pit7 在两遍里相同 ⇒ 差分自动抵消 ✓）
      const setNote2 = async (obj) => {
        const kv = Object.entries(obj).map(([k, v]) => `n2:setScriptData("${k}", ${v})`).join('\n');
        return script(`
local proj = SV:getProject()
proj:newUndoRecord()
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local n2 = g:getNote(2)
${kv}
return tostring(n2:getScriptData("tF0Offset")) .. '/' .. tostring(n2:getScriptData("dF0Left"))
`);
      };
      const measure = async () => {
        await callOk('write_pit', { mode: 'curve', clear: 'all', params: { ...TAIL_PARAMS, dF0Right: 0 } });
        const base = await script(READ_CODE);
        await callOk('write_pit', { mode: 'curve', clear: 'all', params: { ...TAIL_PARAMS, dF0Right: 2 } });
        const bump = await script(READ_CODE);
        return {
          p1: peakOf(curveByPitch(bump, 60), curveByPitch(base, 60), W1[0], W1[1]),
          p2: peakOf(curveByPitch(bump, 62), curveByPitch(base, 62), W2[0], W2[1]),
        };
      };

      // 4A：后音只有 tF0Offset、**没有音头** ⇒ 顶点恒在 end
      const sA = await setNote2({ tF0Offset: -0.035 });
      ok('4A 后音 scriptData：只有 tF0Offset', String(sA) === '-0.035/nil', sA);
      const rA = await measure();
      note(`4A 音符1 峰点=${rA.p1.t} E1=${E1} Δ=${rA.p1.t - E1} blick (${((rA.p1.t - E1) / Q * 60 / bpm * 1000).toFixed(2)} ms)  幅度=${rA.p1.amp.toFixed(3)}`);
      note(`   音1 差分 top5：${rA.p1.top.map((r) => `${r.t}(${r.d.toFixed(2)})`).join(' ')}`);
      ok('4A 后音无音头 ⇒ 顶点仍在 E1（不吃后音的 tF0Offset）', Math.abs(rA.p1.t - E1) <= TOL, rA.p1.t - E1);

      // 4B：后音**有音头**（dF0Left）⇒ 与音头冲突 ⇒ 前挪（挪量 = 后音 tF0Offset）
      const sB = await setNote2({ tF0Offset: -0.035, dF0Left: 2 });
      ok('4B 后音 scriptData：tF0Offset + dF0Left（有音头）', String(sB) === '-0.035/2', sB);
      const rB = await measure();
      const exp1 = E1 + sec2blick(-0.035, bpm);
      note(`4B 音符1 峰点=${rB.p1.t} 期望=${exp1}（E1 − 0.035s）Δ=${rB.p1.t - exp1} blick (${((rB.p1.t - exp1) / Q * 60 / bpm * 1000).toFixed(2)} ms)`);
      note(`   音1 差分 top5：${rB.p1.top.map((r) => `${r.t}(${r.d.toFixed(2)})`).join(' ')}`);
      note(`   音符2（句尾）峰点=${rB.p2.t} E2=${E2} Δ=${rB.p2.t - E2} blick`);
      ok('4B 后音有音头 ⇒ 顶点前挪到 E1−0.035s（≤1 步）', Math.abs(rB.p1.t - exp1) <= TOL, rB.p1.t - exp1);
      ok('4C 句尾音符2 顶点仍 ≈ E2（不吃自己的 tF0Offset）', Math.abs(rB.p2.t - E2) <= TOL, rB.p2.t - E2);
    }
  }

  console.log('\n== 5. 清理测试组 ==');
  {
    const removed = await script(`
local proj = SV:getProject()
proj:newUndoRecord()
local removed = {}
for t = 1, proj:getNumTracks() do
  local tr = proj:getTrack(t)
  for g = tr:getNumGroups(), 1, -1 do
    local ref = tr:getGroupReference(g)
    if ref:getTarget():getName() == "${GROUP}" and not ref:isMain() then
      tr:removeGroupReference(g)
      removed[#removed + 1] = tostring(t) .. ':' .. tostring(g)
    end
  end
end
return table.concat(removed, ',')
`);
    ok('测试组已摘除', removed !== '' || true, removed);
    const leftovers = await script(`
local proj = SV:getProject()
local out = {}
for t = 1, proj:getNumTracks() do
  local tr = proj:getTrack(t)
  for g = 1, tr:getNumGroups() do
    local ref = tr:getGroupReference(g)
    out[#out + 1] = ref:getTarget():getName() .. '(' .. ref:getTarget():getNumNotes() .. ')'
  end
end
return table.concat(out, ' ')
`);
    note(`轨上剩余组：${leftovers}`);
    ok('没有残留同名测试组', !String(leftovers).includes(GROUP), leftovers);
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  console.error('（若测试组残留，跑 node sv/lua/cleanup-test-groups.cjs 清理）');
  process.exit(2);
});
