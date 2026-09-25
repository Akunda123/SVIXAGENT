#!/usr/bin/env node
/**
 * 确认 run_script 的 `scope` 注入语义（2026-09-13）：
 *   profile 说"注入到脚本作用域的变量（{selectedNotes:[...]}）" ⇒
 *   **scope 的"内容"被注入成一个个独立全局变量**，而**不是**注入一个叫 `scope` 的对象。
 * 用法：node sv/lua/probe-scope-semantics.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const CODE = [
  'local ks = {}',
  'for k in pairs(_ENV) do ks[#ks + 1] = k end',
  'table.sort(ks)',
  'return {',
  '  x = x or -1,',
  '  strokesN = (type(strokes) == "table") and #strokes or -1,',
  '  typeScope = type(scope),',
  '  envKeys = table.concat(ks, ","),',
  '}',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's\n');
  const r = await ipc.fileIpcSend('run_script', {
    code: CODE, readonly: true,
    scope: { x: 42, strokes: [[1, 2], [3, 4]] },
  }, { host: HOST, timeoutMs: 20000 });
  const raw = r.ok ? r.result : null;
  const o = (raw && raw.resultType !== undefined) ? raw.result : raw;
  console.log('发 scope = { x: 42, strokes: [[1,2],[3,4]] }');
  console.log('脚本读到 → ' + JSON.stringify(o));
  console.log('');
  if (o && o.x === 42) {
    console.log('✅ 确认：**scope 的内容被注入为独立全局变量**（x=42、strokes 可数），');
    console.log('   ⇒ 脚本里应写 `x`，**不能**写 `scope.x`（后者永远 nil —— 我此前就是踩这个，才误判成"注入失效/旧循环"）。');
  } else {
    console.log('❌ 仍未注入，继续排查（args 路径 / 常驻版本）。');
  }
  console.log('   _ENV 里可见的键：' + (o && o.envKeys ? o.envKeys : '?'));
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
