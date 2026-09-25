#!/usr/bin/env node
/**
 * 诊断（SV1 属性层）：`tF0Offset` 到底能不能写进音符、能不能读回？
 *
 * 背景：`demo-tf0offset.cjs shift` 里写了 `tF0Offset = -0.15`，桥回报 `attrs=1`（说明写了 1 个音符的字段），
 *   但**读回 `getAttributes().tF0Offset` 是 nil`** ⇒ 要么宿主丢弃、要么 getter 不报。
 *   这决定"§2.4 跨段耦合能不能在 SV1 上用属性驱动+读回验证"。
 *
 * 三条路都试一遍（只作用于**当前组**，写入都有 undo）：
 *   ① 桥的 write_pit（params.tF0Offset）
 *   ② 直接 run_script 调 `note:setAttributes{ tF0Offset }`
 *   ③ 直接 run_script 调 `note:setScriptData("tF0Offset", v)`（SV2 的路子，SV1 上试试有没有）
 *
 * 用法：node sv/lua/probe-attr-offset.cjs [host]     （请在**测试组**上跑）
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const VAL = -0.2;

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 20000 });
const callOk = async (op, args) => {
  const r = await call(op, args);
  if (!r.ok) throw new Error(op + ' 失败：' + r.error);
  return r.result;
};
const script = async (code, readonly) => (await callOk('run_script', readonly ? { code, readonly: true } : { code })).result;

const READ = [
  'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
  'local out = {}',
  'for i = 1, g:getNumNotes() do',
  '  local n = g:getNote(i)',
  '  local a = n:getAttributes() or {}',
  '  local keys = {}',
  '  for k, v in pairs(a) do keys[#keys + 1] = k .. "=" .. tostring(v) end',
  '  table.sort(keys)',
  '  local okS, sd = pcall(function() return n:getScriptData("tF0Offset") end)',
  '  out[#out + 1] = "#" .. i .. " tOff=" .. tostring(a.tF0Offset) .. " scriptData=" .. tostring(okS and sd)',
  '    .. " attrs=[" .. table.concat(keys, " ") .. "]"',
  'end',
  'return { name = g:getName(), lines = table.concat(out, "\\n") }',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('宿主：' + hb.hostName + ' ' + hb.version + ' · bridge ' + hb.bridge + ' · isSV2=' + hb.isSV2);
  const cg = await callOk('get_current_group', {});
  console.log('当前组：' + cg.name + '（' + cg.noteCount + ' 音符）· isMain=' + cg.isMain);

  console.log('\n== 0. 起点 ==');
  console.log((await script(READ, true)).lines);

  console.log('\n== ① 桥 write_pit（params.tF0Offset = ' + VAL + '）==');
  const w = await callOk('write_pit', { params: { tF0Offset: VAL } });
  console.log('  回报：attrs=' + w.attrs + ' processed=' + w.processed
    + ' details[0].tF0Offset=' + ((w.details || [])[0] || {}).tF0Offset);
  console.log((await script(READ, true)).lines);

  console.log('\n== ② 直接 setAttributes({ tF0Offset = ' + VAL + ' }) ==');
  await script([
    'local proj = SV:getProject()',
    'proj:newUndoRecord()',
    'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
    'local n = g:getNote(1)',
    'local okS, err = pcall(function() n:setAttributes({ tF0Offset = ' + VAL + ' }) end)',
    'return tostring(okS) .. " / " .. tostring(err)',
  ].join('\n'));
  console.log((await script(READ, true)).lines);

  console.log('\n== ③ 直接 setScriptData("tF0Offset", ' + VAL + ') ==');
  const r3 = await script([
    'local proj = SV:getProject()',
    'proj:newUndoRecord()',
    'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
    'local n = g:getNote(1)',
    'local okS, err = pcall(function() n:setScriptData("tF0Offset", ' + VAL + ') end)',
    'return tostring(okS) .. " / " .. tostring(err)',
  ].join('\n'));
  console.log('  调用结果：' + JSON.stringify(r3));
  console.log((await script(READ, true)).lines);

  console.log('\n== ④ 清回默认（0）= =');
  const c = await callOk('write_pit', { params: { tF0Offset: 0 } });
  console.log('  回报：attrs=' + c.attrs + ' skipped=' + c.skipped);
  console.log((await script(READ, true)).lines);

  console.log('\n== ⑤ perNote 路径（params 全默认 + perNote["1"].tF0Offset = ' + VAL + '）==');
  const p5 = await callOk('write_pit', {
    params: { dF0Left: 0.15, tF0Left: 0.07, dF0Right: 0.15, tF0Right: 0.07, tF0Offset: 0, dF0Vbr: 0, fF0Vbr: 0 },
    perNote: { 1: { tF0Offset: VAL } },
  });
  console.log('  回报：attrs=' + p5.attrs + ' processed=' + p5.processed
    + ' details=' + JSON.stringify((p5.details || []).map((d) => ({ i: d.index, tOff: d.tF0Offset, wrote: d.wroteFields }))));
  console.log((await script(READ, true)).lines);

  console.log('\n== ⑥ 清回（perNote 同样清零）==');
  const c6 = await callOk('write_pit', { params: { tF0Offset: 0 }, perNote: { 1: { tF0Offset: 0 } } });
  console.log('  回报：attrs=' + c6.attrs + ' skipped=' + c6.skipped);
  console.log((await script(READ, true)).lines);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
