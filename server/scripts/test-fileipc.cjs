#!/usr/bin/env node
/**
 * 服务端桥客户端测试（**纯文件通道**，2026-09-12 剪贴板通道退役后）
 *
 * 覆盖：
 *   ① 无桥：canServe 判不可服务；executeOp **明确报错**（不再回落剪贴板，也不白占剪贴板）
 *   ② 起假桥：canServe 通过；executeOp 端到端拿到响应
 *   ③ 桥没声明的 op：报错里列出桥声明的 op 清单
 *   ④ **剪贴板零接触**：整轮请求前后剪贴板哨兵不变（本工程的核心收益）
 *   ⑤ 隔离目录 AKDAGENT_IPC_DIR 生效
 *
 * 用法：node server/scripts/test-fileipc.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'server', 'dist');
if (!fs.existsSync(path.join(DIST, 'protocol.js'))) {
  console.error('❌ 先构建：cd server && npx tsc');
  process.exit(2);
}
const ipc = require(path.join(DIST, 'fileipc.js'));
const protocol = require(path.join(DIST, 'protocol.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 剪贴板读写：直接用 PowerShell（已退役的 clipboard.ts 不再参与，避免"测试自己用剪贴板"）
const readClip = () => {
  try {
    const b64 = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((Get-Clipboard -Raw)))'],
      { encoding: 'utf8' }).trim();
    return Buffer.from(b64, 'base64').toString('utf16le');
  } catch { return null; }
};
const setClip = (text) => {
  const b64 = Buffer.from(text, 'utf16le').toString('base64');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Set-Clipboard -Value ([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${b64}')))`],
    { encoding: 'utf8' });
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-fileipc-test-'));
  process.env.AKDAGENT_IPC_DIR = dir;
  console.log(`隔离目录 = ${dir}\n`);

  console.log('【1】无桥：明确报错，不回落剪贴板');
  {
    ok('isBridgeAlive=false', ipc.isBridgeAlive('sv') === false);
    const svc = ipc.canServe('ping', 'sv');
    ok('canServe 判不可服务', svc.ok === false, svc.reason);
    let err = '';
    const t0 = Date.now();
    try { await protocol.executeOp('ping', {}, { timeoutMs: 800 }); } catch (e) { err = e.message; }
    ok('executeOp 抛错', err.length > 0, err.slice(0, 120));
    ok('报错很快（无 4.5s 剪贴板探测 + 10s 干等）', Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
    note(`错误首行：${err.split('\n')[0].slice(0, 130)}`);
  }

  console.log('\n【2】起假桥 ⇒ 可服务且端到端可用');
  const mock = spawn(process.execPath, [path.join(ROOT, 'tools', 'mock-lua-bridge.cjs'),
    '--dir', dir, '--host', 'sv', '--poll', '40', '--hb', '400'], { stdio: 'ignore' });
  let waited = 0;
  while (waited < 5000 && !ipc.isBridgeAlive('sv')) { await sleep(100); waited += 100; }
  ok(`心跳在 ${waited}ms 内出现`, ipc.isBridgeAlive('sv'), ipc.collectDiagnostics('sv'));
  const hb = ipc.readHeartbeat('sv');
  note(`假桥 ${hb && hb.hostName} · ops ${(hb && hb.ops || []).length} 个`);
  ok("canServe('ping') = true", ipc.canServe('ping', 'sv').ok === true);
  ok("canServe('get_project_info') = true", ipc.canServe('get_project_info', 'sv').ok === true);

  const t1 = Date.now();
  const pong = await protocol.executeOp('ping', {}, { timeoutMs: 3000 });
  ok('executeOp(ping) 拿到响应', pong && pong.pong === true, pong);
  ok('响应来自假桥（lua 标记）', pong && pong.lua === 'Lua 5.4', pong && pong.lua);
  note(`往返 ${Date.now() - t1}ms`);

  const pi = await protocol.executeOp('get_project_info', {}, { timeoutMs: 3000 });
  ok('get_project_info 字段名与桥一致（fileName）', pi && pi.fileName === 'mock.svp', pi && pi.fileName);

  console.log('\n【3】桥没声明的 op ⇒ 报错并列出能力清单');
  {
    const svc = ipc.canServe('does_not_exist', 'sv');
    ok('canServe 判不可服务', svc.ok === false, svc.reason);
    ok('带 advertisedOps 清单', Array.isArray(svc.advertisedOps) && svc.advertisedOps.includes('ping'));
    let err = '';
    try { await protocol.executeOp('does_not_exist', {}, { timeoutMs: 800 }); } catch (e) { err = e.message; }
    ok('报错含"没有声明"', /声明/.test(err), err.split('\n')[0]);
    ok('报错里附了桥声明的 op', /桥声明的 op/.test(err), err.slice(0, 160));
  }

  console.log('\n【4】剪贴板零接触（核心收益）');
  {
    const original = readClip();
    const sentinel = `SVAGENT-SENTINEL-${Date.now()}`;
    setClip(sentinel);
    ok('哨兵已写入剪贴板', readClip() === sentinel, readClip());
    for (const op of ['ping', 'get_project_info', 'get_selected_notes', 'get_current_group']) {
      try { await protocol.executeOp(op, {}, { timeoutMs: 3000 }); } catch { /* 结果无所谓，看剪贴板 */ }
      ok(`${op} 后剪贴板未变`, readClip() === sentinel);
    }
    if (original !== null) { setClip(original); ok('原剪贴板已还原', readClip() === original); }
  }

  console.log('\n【5】假桥停掉后');
  {
    mock.kill();
    await sleep(300);
    // 注意：maxAgeSec=0 时 age=0 **仍算新鲜**（0 > 0 为假）⇒ 用 -1 表示"不接受任何心跳"。
    const svc = ipc.canServe('ping', 'sv', undefined, -1);
    ok('canServe(maxAgeSec=-1) 判不可服务', svc.ok === false, svc.reason);
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
