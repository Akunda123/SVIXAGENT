#!/usr/bin/env node
/**
 * 实机核对 §2.4 推导（能在 SV2 上做的那部分）
 *
 * §2.4 的推导（08-pit-drawing.md §2.4）：
 *   pit3 音头：峰高 = dF0Left，峰位 p = 0.45·tF0Left + tF0Offset，底宽 = 2·tF0Left
 *   pit5 音尾：峰高 = dF0Right，峰位 p = off1 + off2（有后音时 off1 = −0.45·tF0Right）
 *   可达区间：峰高 ±6 半音 · 底宽 0.02~1.0s · 峰位 ≈ ±0.73s
 *
 * 本脚本核对两件事（**用 SV2 的曲线 readback**）：
 *   ① tF0Offset 的跨段耦合：动它，pit1/pit2/pit3 的位置应一起平移；
 *   ② 峰点压在 end 上（句尾 pit5）时，宿主是否**保真**存储（衰减与否）。
 *      §8.5 记录过"设 +2 读回 ≈1.41"（那是 SV1 属性渲染 → 读回；SV2 曲线路线是否同样衰减，这里实测）。
 *
 * 用法：node sv/lua/verify-section24.cjs [host]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));

const host = process.argv[2] || 'sv';
const TIMEOUT = 20000;
let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log(`  [ok]   ${n}`); }
  else { fail++; console.log(`  [FAIL] ${n}${e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 220) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host, timeoutMs: TIMEOUT });
const callOk = async (op, args) => {
  const r = await call(op, args);
  if (!r.ok) throw new Error(`${op} 失败：${r.error}`);
  return r.result;
};
const script = async (code, readonly = true) => (await callOk('run_script', readonly ? { code, readonly: true } : { code })).result;

// 读回某个音符的曲线（points 是 [相对时间, 半音] 对）
const readCurve = (noteIdx1) => script(`
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local n = g:getNote(${noteIdx1})
local onset = n:getOnset()
local out = { n = g:getNumNotes(), curves = {}, noteOnset = onset, noteEnd = n:getEnd(), dur = n:getDuration() }
for i = 1, g:getNumPitchControls() do
  local c = g:getPitchControl(i)
  local okp, pts = pcall(function() return c:getPoints() end)
  if okp and pts ~= nil then
    local rec = { pos = c:getPosition(), pitch = c:getPitch(), n = #pts }
    -- 找峰值（|y| 最大）与它的位置
    local best, bi = 0, 0
    for k = 1, #pts do
      if math.abs(pts[k][2]) > math.abs(best) then best = pts[k][2]; bi = k end
    end
    rec.peakY = best
    rec.peakT = pts[bi] and pts[bi][1] or nil      -- 相对曲线起点
    rec.first = pts[1] and pts[1][2] or nil
    rec.last = pts[#pts] and pts[#pts][2] or nil
    out.curves[#out.curves + 1] = rec
  end
end
return out
`, true);

(async () => {
  const hb = ipc.readHeartbeat(host);
  if (!hb) { console.log(`❌ 没有 ${host} 的心跳`); process.exit(2); }
  console.log(`宿主：${hb.hostName} ${hb.version}（isSV2=${hb.isSV2}）`);
  const cg = await callOk('get_current_group', {});
  console.log(`当前组：${cg.current ? cg.name : '(无)'} · ${cg.noteCount} 音符（isMain 已由造组脚本保证为 false）\n`);
  if (!cg.current || cg.noteCount < 2) {
    console.log('⚠️ 先跑：node sv/lua/make-test-group.cjs ' + host);
    process.exit(2);
  }

  console.log('== ① tF0Offset 的跨段耦合（动它 ⇒ 峰位一起平移）==');
  {
    // 对"中间那个音"（有前后音 ⇒ pit1/pit3 都会出现）分别用 tF0Offset = 0 / +0.3
    const idx = 2;   // 1 起的第 2 个音符（0 起 = 1）
    const runs = [];
    for (const off of [0, 0.3]) {
      await callOk('write_pit', {
        mode: 'curve', clear: 'all',
        indices: [idx - 1],
        params: { tF0Left: 0.2, tF0Right: 0.2, dF0Left: 1, dF0Right: 1, tF0Offset: off },
      });
      const c = await readCurve(idx);
      const cur = (c.curves || [])[0];
      runs.push({ off, c, cur });
      if (cur) {
        note(`tF0Offset=${off}：曲线数=${c.curves.length} points=${cur.n} 峰值=${cur.peakY.toFixed(3)} 峰位(相对曲线起点)=${cur.peakT}`);
      } else {
        note(`tF0Offset=${off}：没读到曲线`);
      }
    }
    const [a, b] = runs;
    if (a.cur && b.cur) {
      ok('两次都写入了曲线', true);
      // 解析：峰位随 tF0Offset 平移（+0.3s 量级）；曲线起点 ws 也随 tF0Offset 平移
      const dPeak = b.cur.peakT - a.cur.peakT;
      const dStart = (b.cur.pos + b.cur.peakT) - (a.cur.pos + a.cur.peakT);
      note(`峰位绝对变化 ≈ ${dStart.toFixed(3)}s（tF0Offset 差 0.3s）`);
      ok('峰位随 tF0Offset 平移（|Δ−0.3| < 0.05）', Math.abs(dStart - 0.3) < 0.05, dStart);
      ok('峰高不受 tF0Offset 影响（两次都应 ≈1）',
        Math.abs(a.cur.peakY - 1) < 0.05 && Math.abs(b.cur.peakY - 1) < 0.05,
        [a.cur.peakY, b.cur.peakY]);
    } else {
      ok('① 得到两次曲线读数', false, runs.map((r) => r.cur));
    }
  }

  console.log('\n== ② 句尾 pit5：峰点压在 end 上时宿主是否保真（§8.5 的衰减问题）==');
  {
    const last = cg.noteCount;        // 最后一个音（无后音 ⇒ 句尾）
    const AMP = 2;
    await callOk('write_pit', {
      mode: 'curve', clear: 'all',
      indices: [last - 1],
      params: { tF0Right: 0.2, dF0Right: AMP, tF0Offset: 0 },
    });
    const c = await readCurve(last);
    const cur = (c.curves || [])[0];
    if (cur) {
      note(`句尾音：峰值=${cur.peakY.toFixed(3)}（设定 ${AMP}）· 峰位(相对曲线起点)=${cur.peakT} · 曲线起点 pos=${cur.pos}`);
      note(`该音 onset=${c.noteOnset} end=${c.noteEnd} dur=${c.dur}`);
      const rel = (cur.pos + cur.peakT - c.noteEnd);      // 峰相对 end 的位置
      note(`峰相对 end 的位置 ≈ ${rel.toFixed(4)}s（推导：句尾应≈0，即压在 end 上）`);
      ok('峰高被宿主保真存储（§8.5 的 ≈1.41 衰减在 SV2 曲线路线上**未复现**）',
        Math.abs(Math.abs(cur.peakY) - AMP) < 0.1, cur.peakY);
      ok('峰位落在 end 附近（|Δt| < 0.05s）', Math.abs(rel) < 0.05, rel);
    } else {
      ok('② 读到句尾曲线', false, c.curves);
    }
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  console.log('说明：本脚本只写"当前组"的曲线，且每一步都 clear=all 重建；全部有 undo 记录。');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
