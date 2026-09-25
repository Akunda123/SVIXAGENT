#!/usr/bin/env node
/**
 * 真机验收：**参数来源链**（write_pit 的 §5 优先级：override → 本音 → getVoice() → 脚本默认值）
 *
 * 为什么单独测：这条链的三层在真机上从未被分别验证过 ——
 *   ① 本音：SV1 在 `getAttributes()`、**SV2/IX 在 `getScriptData()`**（文档：
 *      `NoteGroupReference#getVoice` 的 tF0…/dF0… 音高参数 **only available in version 1** ⇒
 *      SV2 起音高参数改走 ScriptData / PitchControlCurve）
 *   ② `getVoice()`：SV1 的声库会提供音高参数；**SV2 的 voice 只有响度/张力/气声等**（无音高参数）
 *   ③ 脚本默认值（`PIT.DEFAULTS`）
 *
 * 判据：attr 路线的 `details[0].dF0Left` 会反映**解析出的值** ⇒
 *   写入 ScriptData(0.42) 后应当读到 0.42（而不是默认 0.15）。
 *
 * 用法：node sv/lua/verify-param-sources.cjs [host]
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const host = process.argv[2] || 'sv';
const TIMEOUT = 15000;
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

(async () => {
  const hb = ipc.readHeartbeat(host);
  if (!hb) { console.log(`❌ 没有 ${host} 的心跳`); process.exit(2); }
  console.log(`宿主：${hb.hostName} ${hb.version}（isSV2=${hb.isSV2}）`);

  const cg = await callOk('get_current_group', {});
  console.log(`当前组：${cg.current ? cg.name : '(无)'} · ${cg.noteCount} 音符`);
  if (!cg.current || cg.noteCount === 0) {
    console.log('⚠️ 当前组没有音符 —— 先跑 node sv/lua/make-test-group.cjs ' + host);
    process.exit(2);
  }

  console.log('\n== 1. 各来源的现状 ==');
  const before = await script(`
local ed = SV:getMainEditor()
local ref = ed:getCurrentGroup()
local g = ref:getTarget()
local n = g:getNote(1)
local function num(v) local x = tonumber(v) if x ~= nil and x == x then return x end return nil end
local out = {}
out.group = g:getName()
out.isMain = ref:isMain()
local a = n:getAttributes() or {}
out.attr_dF0Left = num(a.dF0Left)
local sd = n:getScriptData('dF0Left')
out.script_dF0Left = num(sd)
local v = ref:getVoice()
out.voiceIsTable = (type(v) == 'table')
if type(v) == 'table' then
  out.voice_dF0Left = num(v.dF0Left)
  local keys = {}
  for k, _ in pairs(v) do keys[#keys + 1] = k end
  out.voiceKeys = table.concat(keys, ',')
end
return out
`);
  note(`组「${before.group}」isMain=${before.isMain}`);
  note(`本音 attributes.dF0Left = ${JSON.stringify(before.attr_dF0Left)} · ScriptData.dF0Left = ${JSON.stringify(before.script_dF0Left)}`);
  note(`getVoice() 是表=${before.voiceIsTable} · voice.dF0Left = ${JSON.stringify(before.voice_dF0Left)}`);
  note(`voice 的键：${before.voiceKeys || '(空)'}`);
  ok('getVoice() 不含音高参数（SV2/IX 的文档特征：dF0Left 为 nil）',
    hb.isSV2 ? before.voice_dF0Left === undefined : true,
    before.voice_dF0Left);

  console.log('\n== 2. 基线：不设任何来源 ⇒ 应取脚本默认值 ==');
  const base = await callOk('write_pit', { mode: 'attr', dryRun: true });
  const d0 = (base.details || [])[0] || {};
  note(`默认解析结果：dF0Left=${JSON.stringify(d0.dF0Left)} dF0Right=${JSON.stringify(d0.dF0Right)} tF0Offset=${JSON.stringify(d0.tF0Offset)}`);
  ok('基线 dF0Left = 脚本默认 0.15', Math.abs(Number(d0.dF0Left) - 0.15) < 1e-6, d0.dF0Left);

  console.log('\n== 3. 写入"本音"参数（SV1=attributes，SV2/IX=ScriptData）⇒ 解析应取到它 ==');
  {
    const useScript = hb.isSV2 === true;
    const w = await script(useScript
      ? `local g = SV:getMainEditor():getCurrentGroup():getTarget()
local proj = SV:getProject()
proj:newUndoRecord()
local n = g:getNote(1)
n:setScriptData('dF0Left', 0.42)
n:setScriptData('tF0Left', 0.21)
return { dF0Left = n:getScriptData('dF0Left'), tF0Left = n:getScriptData('tF0Left') }`
      : `local g = SV:getMainEditor():getCurrentGroup():getTarget()
local proj = SV:getProject()
proj:newUndoRecord()
local n = g:getNote(1)
n:setAttributes({ dF0Left = 0.42, tF0Left = 0.21 })
local a = n:getAttributes() or {}
return { dF0Left = a.dF0Left, tF0Left = a.tF0Left }`, false);
    note(`写入位置：${useScript ? 'ScriptData（SV2/IX）' : 'attributes（SV1）'} ⇒ ${JSON.stringify(w)}`);

    const r = await callOk('write_pit', { mode: 'attr', dryRun: true });
    const d1 = (r.details || [])[0] || {};
    note(`解析结果：dF0Left=${JSON.stringify(d1.dF0Left)}（默认是 0.15）`);
    ok('解析取到了本音写入的 0.42（本音层生效）', Math.abs(Number(d1.dF0Left) - 0.42) < 1e-6, d1.dF0Left);
  }

  console.log('\n== 4. override（args.params）优先级最高 ⇒ 应压过本音 ==');
  {
    const r = await callOk('write_pit', { mode: 'attr', dryRun: true, params: { dF0Left: 0.99 } });
    const d2 = (r.details || [])[0] || {};
    note(`params.dF0Left=0.99 ⇒ 解析结果 ${JSON.stringify(d2.dF0Left)}`);
    ok('override 压过本音的 0.42', Math.abs(Number(d2.dF0Left) - 0.99) < 1e-6, d2.dF0Left);
  }

  console.log('\n== 5. 收尾：清掉本音写入的参数 ==');
  {
    const c = await script(hb.isSV2 === true
      ? `local g = SV:getMainEditor():getCurrentGroup():getTarget()
local proj = SV:getProject()
proj:newUndoRecord()
local n = g:getNote(1)
n:setScriptData('dF0Left', 0/0)
n:setScriptData('tF0Left', 0/0)
return { dF0Left = n:getScriptData('dF0Left') }`
      : `local g = SV:getMainEditor():getCurrentGroup():getTarget()
local proj = SV:getProject()
proj:newUndoRecord()
local n = g:getNote(1)
n:setAttributes({ dF0Left = 0/0, tF0Left = 0/0 })
local a = n:getAttributes() or {}
return { dF0Left = a.dF0Left }`, false);
    note(`清回后读回：${JSON.stringify(c)}`);
    const r = await callOk('write_pit', { mode: 'attr', dryRun: true });
    const d3 = (r.details || [])[0] || {};
    ok('清回后解析回到默认 0.15', Math.abs(Number(d3.dF0Left) - 0.15) < 1e-6, d3.dF0Left);
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  console.log('说明：本脚本只做 dryRun + 只写测试组第 1 个音符的参数，且收尾清回；所有写入都有 undo 记录。');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
