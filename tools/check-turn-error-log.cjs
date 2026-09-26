#!/usr/bin/env node
/**
 * 守卫：**故障诊断三件套不许被删**（2026-09-26 立；当天排查用户机"一发消息就 回合结束（error）"耗掉一整轮）
 *
 * 背景：用户报「一发消息就报错」时，我们手里只有界面上那句 `回合结束（error）`，
 * 客户端**既不记 reason、也不记 MCP 自检结果** ⇒ 只能靠猜、靠反复求用户配合。
 * 补上这三样之后，同类报障一条命令就能定位：
 *   ① 每轮结束（非 completed）把 `reason` + 人话原因写进 `akdagent.log`，并落 `userData/last-turn-error.json`
 *   ② 启动时对 MCP server 做 **initialize + tools/list 自检**，结果落 `userData/mcp-selftest.json`；
 *      **自检不过就不写注册**（避免"注册了却握不上手"）
 *   ③ `turnErrorHint()` 的码→人话映射（401/402/403/429/TRANSPORT/REQUEST_EXTENSION…）
 *
 * 用法：node tools/check-turn-error-log.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'electron', 'src', 'main.js');
let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

if (!fs.existsSync(MAIN)) {
  console.log('  [FAIL] 找不到 electron/src/main.js');
  process.exit(1);
}
const t = fs.readFileSync(MAIN, 'utf8');

console.log('== ① 每轮失败的 reason 必须落日志 + 落盘 ==');
for (const [what, re] of [
  ['turnErrorHint() 存在', /function turnErrorHint\(/],
  ['reason 写进日志', /\[akdagent\] turn\/end reason = /],
  ['人话原因写进日志', /\[akdagent\] ⇒ 可能的原因：/],
  ['reason 落 last-turn-error.json', /last-turn-error\.json/],
]) {
  if (re.test(t)) ok(what); else fail(what + '（被删了？排查又要回到"只能猜"）');
}

console.log('\n== ② MCP server 自检 ==');
for (const [what, re] of [
  ['mcpSelfTest() 存在', /function mcpSelfTest\(/],
  ['注册前 await 自检', /await mcpSelfTest\(/],
  ['自检不过就不注册', /if \(!st\.ok\)/],
  ['自检结果落 mcp-selftest.json', /mcp-selftest\.json/],
  ['自检走 initialize + tools/list', /'tools\/list'/],
]) {
  if (re.test(t)) ok(what); else fail(what);
}

console.log('\n== ③ 码 → 人话映射要覆盖实测过的签名 ==');
for (const [what, re] of [
  ['401 / AUTH', /code === 'AUTH' \|\| status === 401/],
  ['402', /status === 402/],
  ['403', /status === 403/],
  ['429', /status === 429/],
  ['TRANSPORT', /code === 'TRANSPORT'/],
  ['REQUEST_EXTENSION', /code === 'REQUEST_EXTENSION'/],
]) {
  if (re.test(t)) ok(what); else fail('缺少 ' + what + ' 的归类');
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ 故障诊断三件套守卫通过');
