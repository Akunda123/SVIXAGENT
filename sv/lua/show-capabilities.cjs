#!/usr/bin/env node
/**
 * 打印某个宿主的能力矩阵（读 `selftest` 的 capabilities 段）。
 *
 * 用途：换宿主（SV1 / SV2 / IX / 新版本）时**一眼看清哪些 op 具备条件**，
 *       不必逐个试跑 op（试跑有风险：宿主 API 报错会弹模态框并冻结整个桥）。
 *
 * 用法：node sv/lua/show-capabilities.cjs [host]     # host = sv（默认）| ix
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const host = process.argv[2] || 'sv';

(async () => {
  const hb = ipc.readHeartbeat(host);
  if (!hb) {
    console.log(`❌ 没有 ${host} 的心跳文件 —— 请在宿主里运行 sv/lua/AKDAgentBridge.lua`);
    process.exit(2);
  }
  console.log(`宿主：${hb.hostName} ${hb.version}（bridge ${hb.bridge}，isSV2=${hb.isSV2}，indexBase=${hb.indexBase}）`);
  console.log(`心跳：${ipc.heartbeatAgeSec(host)}s 前 · 声明 ${(hb.ops || []).length} 个 op`);

  const r = await ipc.fileIpcSend('selftest', {}, { host, timeoutMs: 20000 });
  if (!r.ok) {
    console.log(`❌ selftest 失败：${r.error}`);
    process.exit(1);
  }
  const cap = r.result && r.result.capabilities;
  if (!cap || !cap.detail) {
    console.log('⚠️ selftest 没有返回 capabilities（桥版本可能早于 0.3.1）');
    console.log('   桥版本：', (r.result && r.result.bridge) || '(未提供)');
    process.exit(1);
  }

  console.log(`\n能力总览：✅ ${cap.okOps} 个 op 具备条件 · ⚠️ ${cap.blockedOps} 个缺东西`);
  // ⚠️ 提示"当前打开的是不是轨道主组"：SV2 上主组**不可被编辑**（用户 2026-09-12 指出），
  //    任何"往当前组写音符"的测试/操作都不该落在主组上。这里用 run_script 只读查一次。
  let currentIsMain = null;
  try {
    const rr = await ipc.fileIpcSend('run_script', {
      code: 'local r = SV:getMainEditor():getCurrentGroup(); if r == nil then return false end return r:isMain()',
      readonly: true,
    }, { host, timeoutMs: 8000 });
    if (rr.ok && rr.result) currentIsMain = rr.result.result === true;
  } catch { /* 查不到就算了 */ }

  console.log('\ncontext（当前环境）：');
  for (const [k, v] of Object.entries(cap.context || {})) {
    console.log(`  ${v ? '✅' : '⚠️'} ${k} = ${v}`);
  }
  if (currentIsMain === true) {
    console.log('\n⚠️ 当前打开的是**轨道主组**（isMain=true）：SV2 上主组不可被编辑，');
    console.log('   任何"往当前组写音符"的测试或操作都不该落在主组上 —— 请另建一个组再操作。');
    console.log('   （本工具自身只做只读探测，不会写任何东西。）');
  }

  console.log('\nextras（"二选一"/可选能力）：');
  for (const [k, v] of Object.entries(cap.extras || {})) {
    console.log(`  ${v ? '✅' : '—'} ${k} = ${v}`);
  }

  console.log('\n逐 op：');
  const names = Object.keys(cap.detail).sort();
  const needCtx = [];      // 只缺"对象"（没当前组/没音符）——不是能力问题
  const realGap = [];      // 真的缺宿主的 API 成员
  // 没有当前组/音符时，任何"缺少对象"以及由它派生的"二者需有其一"都属**无法判定**，不是能力缺失。
  // ⚠️ 桥侧的理想做法是"只在对象存在时才判二选一"（留待下次顺带改）；这里先按 context 归类，
  //    避免为了这点显示问题再让用户重跑一次桥。
  const ctxMissing = !(cap.context && cap.context.hasNote && cap.context.hasCurrentGroup);
  for (const n of names) {
    const d = cap.detail[n];
    if (d.ok) {
      console.log(`  ✅ ${n}${d.note ? '  ⓘ ' + d.note : ''}`);
      continue;
    }
    const missing = d.missing || [];
    const onlyCtx = missing.length > 0 && missing.every((m) => {
      const s = String(m);
      return s.includes('缺少对象') || (ctxMissing && s.includes('二者需有其一'));
    });
    if (onlyCtx) {
      needCtx.push(n);
      console.log(`  ⏸ ${n}  ← 需要先有当前组/音符（不是能力缺失）`);
    } else {
      realGap.push({ n, missing });
      console.log(`  ⚠️ ${n}  ← 缺：${missing.join(', ')}`);
    }
  }
  if (needCtx.length) {
    console.log(`\n⏸ ${needCtx.length} 个 op 只是因为"当前组没有音符"而无法判定：${needCtx.join(', ')}`);
    console.log('   ⇒ 在工程里给当前组建几个音符后重跑本工具，这些 op 就会被真正判定。');
  }
  if (realGap.length) {
    console.log(`\n⚠️ ${realGap.length} 个 op 真的缺宿主 API：`);
    for (const g of realGap) console.log(`   ${g.n}: ${g.missing.join(', ')}`);
  }
  console.log('\n说明：「缺对象」= 当前没有打开的音符组/音符（换首歌或选中一个组再试）；');
  console.log('      「缺 API」= 这台宿主确实没有该成员，例如 write_pit 的曲线路线需要 addPitchControl（SV2 才有），');
  console.log('      而 SV2 没有 setPitchAutoMode ⇒ 属性路线在 SV2 属降级路径。');
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
