#!/usr/bin/env node
/**
 * 验证「文件通道不碰剪贴板」——整个移植工程的核心主张。
 *
 * 做法：
 *   ① 读原剪贴板内容
 *   ② 写入一个哨兵字符串（保证内容可辨识）
 *   ③ 走**文件通道**发若干个 op（只读 + 一个 dryRun 写）
 *   ④ 再读剪贴板：必须仍是哨兵字符串（说明文件通道一次都没碰它）
 *   ⑤ 还原原剪贴板内容
 *
 * 用法：node sv/lua/check-clipboard-untouched.cjs
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));
const clip = require(path.join(DIST, 'clipboard.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 160) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);

(async () => {
  const hb = ipc.readHeartbeat('sv');
  console.log(`桥：${hb && hb.bridge} · ${hb && hb.hostName}\n`);

  const original = await clip.getClipboardText().catch(() => null);
  note(`原剪贴板长度：${original === null ? '(读不到)' : original.length}`);

  const sentinel = `SVAGENT-CLIPBOARD-SENTINEL-${Date.now()}`;
  await clip.setClipboardText(sentinel);
  const afterSet = await clip.getClipboardText();
  ok('哨兵已写入剪贴板', afterSet === sentinel, afterSet);

  console.log('\n== 走文件通道发请求（这些都不该碰剪贴板）==');
  const ops = [
    ['ping', {}],
    ['get_project_info', {}],
    ['get_current_group', {}],
    ['get_selected_notes', {}],
    ['get_melody_notes', {}],
    ['write_pit', { dryRun: true }],
  ];
  for (const [op, args] of ops) {
    const r = await ipc.fileIpcSend(op, args, { host: 'sv', timeoutMs: 8000 });
    const still = await clip.getClipboardText().catch(() => null);
    ok(`${op} 成功且剪贴板未变`, r.ok === true && still === sentinel,
      r.ok ? { clipChanged: still !== sentinel } : String(r.error).slice(0, 100));
    note(`${op}: elapsed=${r.elapsedMs}ms 剪贴板${still === sentinel ? '未变 ✓' : '被改了 ✗'}`);
  }

  const finalClip = await clip.getClipboardText().catch(() => null);
  ok('全部请求后剪贴板仍等于哨兵', finalClip === sentinel, finalClip);

  if (original !== null) {
    await clip.setClipboardText(original);
    const restored = await clip.getClipboardText();
    ok('原剪贴板内容已还原', restored === original, restored);
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  console.log('结论：走文件通道的 op 对剪贴板是"零接触"（这是本工程相对剪贴板通道的核心收益）。');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
