#!/usr/bin/env node
/**
 * Electron 客户端 **端到端**（真机）验证
 *
 * 与 `tools/test-electron-fileipc.cjs` 的区别：那个测的是**纯逻辑**（假桥、假文件）；
 * 这个直接**加载 Electron 客户端自己的模块**去跟**活着的桥**说话，验的是
 * "客户端代码 → 文件通道 → 真宿主"这条完整链路（即用户实际点按钮时走的那条）。
 *
 * 覆盖：
 *   ① `svCall(op, args, {host})` —— 通用调用（ping / get_project_info）
 *   ② `querySvHostType()` —— 宿主类型（浮窗据此决定显示什么）
 *   ③ `querySvProjectName()` —— 工程名（**轮询实现**，剪贴板退役后的新路径）
 *   ④ `startProjectEventWatch(cb)` —— 工程事件监听（轮询 + 去重）：真改一下工程名应触发回调
 *   ⑤ `stopProjectEventWatch()` —— 停表（不许留定时器）
 *
 * 用法：node tools/test-electron-e2e.cjs [sv|ix]
 */
const path = require('path');

const HOST = (() => {
  const f = process.argv.find((a) => a.startsWith('--host='));
  if (f) return f.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();

const ROOT = path.join(__dirname, '..');
const ipc = require(path.join(ROOT, 'electron', 'src', 'file-ipc.js'));
const client = require(path.join(ROOT, 'electron', 'src', 'sv-bridge-client.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
};
const note = (m) => console.log('  [--]   ' + m);

(async () => {
  console.log('Electron 客户端模块：file-ipc.js / sv-bridge-client.js');
  console.log('目标宿主：' + HOST + '\n');

  console.log('== 1. 桥在线判定（客户端自己的 isBridgeAlive / heartbeatAgeSec）==');
  const hb = ipc.readHeartbeat(HOST);
  const age = ipc.heartbeatAgeSec(HOST);
  ok('readHeartbeat 拿到心跳', !!hb, hb);
  ok('isBridgeAlive = true', ipc.isBridgeAlive(HOST) === true, age);
  note(`bridge=${hb && hb.bridge} host=${hb && hb.hostName} age=${age && age.toFixed(1)}s ops=${(hb && hb.ops || []).length}`);
  // ⚠️ 真实签名：`canServe(op, host)` —— **返回对象** `{ok, reason, advertisedOps?}`（不是布尔）
  const svc1 = ipc.canServe('ping', HOST);
  ok('canServe("ping") 返回 ok=true', svc1 && svc1.ok === true, svc1);
  const svc2 = ipc.canServe('no_such_op_xyz', HOST);
  ok('canServe(未声明的 op) 返回 ok=false', svc2 && svc2.ok === false, svc2);
  ok('拒绝时会带"桥声明了哪些 op"（便于排障）', !!(svc2 && svc2.advertisedOps), svc2);

  console.log('\n== 2. svCall：通用调用 ==');
  const ping = await client.svCall('ping', {}, { host: HOST, timeoutMs: 8000 });
  ok('svCall("ping") 成功', ping && ping.pong === true, ping && ping.error);
  ok('回包带 bridge 版本', !!(ping && ping.bridge), ping && ping.bridge);
  const pi = await client.svCall('get_project_info', {}, { host: HOST, timeoutMs: 8000 });
  ok('svCall("get_project_info") 成功', pi && pi.numTracks !== undefined, pi && pi.error);
  note(`工程：${pi && pi.numTracks} 轨 · fileName=${JSON.stringify(pi && pi.fileName)}`);

  console.log('\n== 3. querySvHostType / querySvProjectName（客户端封装）==');
  const ht = await client.querySvHostType(HOST);
  ok('querySvHostType 返回宿主类型', ht !== undefined && ht !== null, ht);
  note('宿主类型 = ' + JSON.stringify(ht));
  const nm = await client.querySvProjectName(HOST);
  ok('querySvProjectName 返回字符串（空工程名也算成功）', nm === null || typeof nm === 'string', nm);
  note('工程名 = ' + JSON.stringify(nm));

  console.log('\n== 4. startProjectEventWatch：轮询 + 去重 ==');
  const events = [];
  client.startProjectEventWatch((e) => events.push(e), 800, 1500);
  await new Promise((r) => setTimeout(r, 2500));
  note(`2.5s 内收到 ${events.length} 个事件（静止时应为 0 = 去重生效）`);
  ok('静止时不上报重复事件（去重）', events.length === 0, events.slice(0, 3));
  client.stopProjectEventWatch();
  note('已停止监听（stopProjectEventWatch）');
  const eventsAfter = events.length;
  await new Promise((r) => setTimeout(r, 1600));
  ok('停止后不再有回调（定时器没泄漏）', events.length === eventsAfter, events.length - eventsAfter);

  console.log('\n== 5. 断桥时客户端行为（**设计如此：svCall 抛异常**）==');
  // ⚠️ 真机事实：客户端的 `svCall` **失败即抛**（与 server 侧 `fileIpcSend` 永不抛不同）；
  //    所以调用方必须 try/catch —— 主进程用的是**包装好不抛的** `querySvProjectName` 等 ✓。
  let threw = null;
  try {
    await client.svCall('ping', {}, { host: 'nope', timeoutMs: 1500 });
  } catch (e) { threw = e; }
  ok('svCall 在无心跳时抛异常（并给出可操作提示）',
    !!threw && /桥未运行|no_such|失败/.test(String(threw.message)), threw && threw.message);
  note('异常信息：' + String(threw && threw.message).slice(0, 140));
  const nmOff = await client.querySvProjectName('nope');
  ok('querySvProjectName 无桥时**返回 null 而不抛**（主进程可直接用）', nmOff === null, nmOff);

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
