#!/usr/bin/env node
/**
 * 真机验收：write_pit（在**当前组**的音符上）
 *
 * 流程（全部可 undo；先 dryRun 探路，再实写）：
 *   ① dryRun 两条路线（attr / curve）——只算不写，确认不报错、返回结构正确
 *   ② 实写 attr（SV1 路线）：非默认参数 ⇒ 写属性
 *   ③ run_script 读回 attribute 与 pitch-auto 模式，确认真的落到了音符上
 *   ④ plan="accent" dryRun：看重音报告（拍号/单元数/重音数/手势）
 *   ⑤ 清回：把参数设回默认值 ⇒ 走 NaN 分支（回到组默认）
 *
 * 用法：node sv/lua/verify-writepit.cjs
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
// 宿主可指定：`node <脚本> ix` 或 `--host=ix`（默认 sv；本脚本 argv[2] 是 MODE，故推荐 --host=）
const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const ipc = require(path.join(DIST, 'fileipc.js'));

const TIMEOUT = 15000;
// 可选：指定落地方式（attr / curve）。不给则按宿主自动（SV1 → attr，SV2/IX → curve）。
// 用途：SV2 上默认走 curve ⇒ **属性路线（降级路径）要显式 mode=attr 才测得到**。
const MODE = process.argv[2] || null;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const withMode = (args) => (MODE ? { ...args, mode: MODE } : args);

async function call(op, args) {
  return ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: TIMEOUT });
}
async function callOk(op, args) {
  const r = await call(op, args);
  if (!r.ok) throw new Error(`${op} 失败：${r.error}`);
  return r.result;
}

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log(`桥：${hb && hb.bridge} · ${hb && hb.hostName} ${hb && hb.version}`);
  const cg = await callOk('get_current_group', {});
  console.log(`当前组：${cg.current ? cg.name : '(无)'}（${cg.noteCount} 音符）\n`);
  if (!cg.current || cg.noteCount === 0) {
    console.log('⚠️ 当前组没有音符 —— 请先在 SV 里点开一个有音符的组，然后重跑。');
    process.exit(2);
  }

  console.log('== 1. dryRun（只算不写）==');
  {
    const r = await callOk('write_pit', { dryRun: true, plan: 'explicit' });
    ok('dryRun 成功', r.dryRun === true, r);
    ok('processed = 当前组音符数', r.processed === cg.noteCount, `${r.processed} vs ${cg.noteCount}`);
    ok('mode 是 attr 或 curve', r.mode === 'attr' || r.mode === 'curve', r.mode);
    ok('isSv1 字段存在', typeof r.isSv1 === 'boolean', r.isSv1);
    ok('canCurve 字段存在（SV2 才有曲线 API）', typeof r.canCurve === 'boolean', r.canCurve);
    note(`mode=${r.mode} isSv1=${r.isSv1} canCurve=${r.canCurve} processed=${r.processed}`);
  }

  console.log('\n== 2. plan=accent dryRun（重音检测报告）==');
  {
    const r = await callOk('write_pit', { dryRun: true, plan: 'accent' });
    const a = r.accent || {};
    ok('返回 accent 报告', !!r.accent);
    ok('beatsPerBar 是数字', typeof a.beatsPerBar === 'number', a.beatsPerBar);
    ok('unitCount ≥ 1', a.unitCount >= 1, a.unitCount);
    ok('accentCount ≤ syllableUnits', a.accentCount <= a.syllableUnits, `${a.accentCount}/${a.syllableUnits}`);
    ok('selected = processed', a.selected === r.processed, `${a.selected}/${r.processed}`);
    ok('targetRatio 默认 0.4', a.targetRatio === 0.4, a.targetRatio);
    note(`拍号 ${a.beatsPerBar}/4 · 单元 ${a.unitCount} · 有音节 ${a.syllableUnits} · 重音 ${a.accentCount} · 跳过呼吸音 ${a.skippedBreath} 延续音 ${a.skippedDash}`);
    (a.picked || []).slice(0, 6).forEach((p) => {
      note(`  #${p.index} ${p.gesture} score=${p.score} lyric=${JSON.stringify(p.lyric)} pitch=${p.pitch} strong=${p.strong} vbr=${p.tF0VbrStart} (${p.vbrWhy})`);
    });
  }

  console.log('\n== 3. 实写（attr 路线，给非默认参数）==');
  let wrote = null;
  {
    const r = await callOk('write_pit', { params: { dF0Left: 2.5, tF0Left: 0.12 } });
    wrote = r;
    ok('processed = 音符数', r.processed === cg.noteCount, r.processed);
    if (r.mode === 'attr') {
      ok('attrs = 音符数（都写了属性）', r.attrs === cg.noteCount, r.attrs);
    } else {
      ok('curve 模式：生成了曲线', r.curves >= 1, r.curves);
    }
    note(`mode=${r.mode} attrs=${r.attrs} curves=${r.curves} skipped=${r.skipped} removedCurves=${r.removedCurves}`);
  }

  console.log('\n== 4. 读回音符属性（确认落到音符上）==');
  {
    // ⚠️ 真机事实（2026-09-12 实测）：
    //   ① SV 的属性是 **float32** ⇒ 写 0.12 读回 0.11999999731779 ⇒ **比较必须带容差**，
    //      不能拿十进制字面量做等值判断（本脚本第一版就因此报假失败）。
    //   ② 自动模式的 getter 真名是 `getPitchAutoMode()`（不是 isPitchAutoMode，见 api/Note.md）。
    const code = `
local ed = SV:getMainEditor()
local g = ed:getCurrentGroup():getTarget()
local out = {}
for i = 1, g:getNumNotes() do
  local n = g:getNote(i)
  local a = n:getAttributes() or {}
  local rec = { i = i }
  rec.dF0Left = a.dF0Left
  rec.tF0Left = a.tF0Left
  rec.dF0Right = a.dF0Right
  local okm, v = pcall(function() return n:getPitchAutoMode() end)
  if okm then rec.auto = v end
  out[#out + 1] = rec
end
return out
`;
    const r = await callOk('run_script', { code, readonly: true });
    const rows = r.result;
    ok('run_script 读回数组', Array.isArray(rows) && rows.length === cg.noteCount, Array.isArray(rows) && rows.length);
    if (Array.isArray(rows) && rows.length) {
      const first = rows[0];
      note(`音符 1：dF0Left=${JSON.stringify(first.dF0Left)} tF0Left=${JSON.stringify(first.tF0Left)} auto=${JSON.stringify(first.auto)}`);
      if (wrote && wrote.mode === 'attr') {
        const near = (a, b) => Math.abs(Number(a) - b) < 1e-6;
        ok('dF0Left 已写到音符上（=2.5）', near(first.dF0Left, 2.5), first.dF0Left);
        ok('tF0Left 已写到音符上（≈0.12，float32 精度）', near(first.tF0Left, 0.12), first.tF0Left);
        ok('音高自动模式已切到手动（getPitchAutoMode()=false）', first.auto === false, first.auto);
      } else {
        note('（curve 路线：属性不写入，属预期）');
      }
    }
  }

  console.log('\n== 5. 清回默认（走 NaN 分支）==');
  {
    const r = await callOk('write_pit', { params: { dF0Left: 0.15, tF0Left: 0.07 } });
    note(`写回默认：attrs=${r.attrs} skipped=${r.skipped}`);
    // ⚠️ 真机事实：写 NaN 之后，getAttributes() 里**不再有该字段**（而不是保留一个 NaN）
    //    ⇒ 语义上等价于"回到组默认"，但断言要接受「NaN 或字段消失」两种表现。
    const code = `
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local a = g:getNote(1):getAttributes() or {}
local v = a.dF0Left
return { has = (v ~= nil), isNaN = (v ~= nil and v ~= v), value = v }
`;
    const rr = await callOk('run_script', { code, readonly: true });
    const res = rr.result || {};
    ok('目标是默认值 ⇒ 残留被清掉（写 NaN 后字段消失或为 NaN）',
      res.has === false || res.isNaN === true, res);
    ok('不再是原来的 2.5', res.value === undefined || res.isNaN === true || Math.abs(Number(res.value) - 2.5) > 1e-6, res);
    note(`读回 dF0Left：has=${res.has} isNaN=${res.isNaN} value=${JSON.stringify(res.value)}`);
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  console.log('所有写入都建了 undo 记录 ⇒ SV 里 Ctrl+Z 可逐步回退。');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
