#!/usr/bin/env node
/**
 * Electron 侧文件通道测试（离线，用 tools/mock-lua-bridge.cjs 当假桥）
 *
 * 2026-09-12：剪贴板通道退役 ⇒ Electron 侧**只有文件通道**，桥不在线时明确报错。
 *
 * 覆盖：
 *   ① 无桥：canServe 判不可服务；svCall **立刻报错**（并给出可操作提示）
 *   ② 起假桥：svCall / querySvProjectName / querySvHostType 全部经文件通道可用
 *   ③ 桥没声明的 op ⇒ 报错列出能力清单
 *   ④ 工程切换监听（轮询式）能收到工程名
 *   ⑤ 停桥后立刻失败（不再等 4.5s 剪贴板探测）
 *
 * 用法：node tools/test-electron-fileipc.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const MOCK = path.join(ROOT, 'tools', 'mock-lua-bridge.cjs');
const fileipc = require(path.join(ROOT, 'electron', 'src', 'file-ipc.js'));
const CLIENT = path.join(ROOT, 'electron', 'src', 'sv-bridge-client.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-electron-fileipc-'));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freshClient = () => {
  delete require.cache[require.resolve(CLIENT)];
  return require(CLIENT);
};

(async () => {
  console.log(`隔离目录 = ${dir}\n`);
  process.env.AKDAGENT_IPC_DIR = dir;      // Electron 侧只看这个目录

  console.log('== 1. 无桥：立刻报错（不回落剪贴板）==');
  {
    ok('isBridgeAlive() === false', fileipc.isBridgeAlive('sv') === false);
    const svc = fileipc.canServe('ping', 'sv');
    ok('canServe 判不可服务', svc.ok === false, svc.reason);
    let err = '';
    const t0 = Date.now();
    try { await freshClient().svCall('ping'); } catch (e) { err = e.message; }
    ok('svCall 抛错', err.length > 0, err.slice(0, 120));
    ok(`失败很快（${Date.now() - t0}ms < 500ms）`, Date.now() - t0 < 500);
    ok('提示怎么恢复（运行桥脚本）', /AKDAgentBridge\.lua/.test(err), err.slice(0, 150));
    note(`错误：${err.slice(0, 130)}`);
  }

  console.log('\n== 2. 起假桥 ⇒ 一切经文件通道可用 ==');
  const mock = spawn(process.execPath, [MOCK, '--dir', dir, '--host', 'sv', '--poll', '40', '--hb', '400'], { stdio: 'ignore' });
  let waited = 0;
  while (waited < 5000 && !fileipc.isBridgeAlive('sv')) { await sleep(100); waited += 100; }
  ok(`心跳在 ${waited}ms 内出现`, fileipc.isBridgeAlive('sv'));
  const hb = fileipc.readHeartbeat('sv');
  note(`假桥：${hb && hb.hostName} ops=${(hb && hb.ops || []).length} 个`);
  ok("canServe('get_project_info') = true", fileipc.canServe('get_project_info', 'sv').ok === true);

  const client = freshClient();
  const t1 = Date.now();
  const pong = await client.svCall('ping');
  ok('svCall(ping) 走文件通道（假桥 lua 标记）', pong && pong.lua === 'Lua 5.4', pong);
  note(`svCall 往返 ${Date.now() - t1}ms`);
  ok('querySvProjectName 可用（无需 JS 桥）', (await client.querySvProjectName()) === 'mock.svp');
  ok("querySvHostType 返回 'sv'", (await client.querySvHostType()) === 'sv');

  console.log('\n== 3. 未声明的 op ⇒ 报错带能力清单 ==');
  {
    let err = '';
    try { await client.svCall('does_not_exist'); } catch (e) { err = e.message; }
    ok('抛错', err.length > 0, err.slice(0, 100));
    ok('提示桥没有声明该 op', /没有声明|未声明/.test(err), err.slice(0, 140));
    ok('附上桥声明的 op 清单', /桥声明的 op/.test(err), err.slice(0, 160));
  }

  console.log('\n== 4. 工程切换监听（轮询式）==');
  {
    const seen = [];
    client.startProjectEventWatch((n) => seen.push(n), 200, 500);
    await sleep(1500);
    client.stopProjectEventWatch();
    ok('轮询到了工程名', seen.length >= 1 && seen[0] === 'mock.svp', seen);
    note(`收到：${JSON.stringify(seen)}`);
  }

  console.log('\n== 5. 停桥后立刻失败 ==');
  {
    mock.kill();
    await sleep(300);
    let err = '';
    const t0 = Date.now();
    try { await freshClient().svCall('ping', {}, { timeoutMs: 500 }); } catch (e) { err = e.message; }
    ok('抛错', err.length > 0, err.slice(0, 100));
    ok(`很快（${Date.now() - t0}ms < 3000ms）`, Date.now() - t0 < 3000);
    note(`错误：${err.slice(0, 120)}`);
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
