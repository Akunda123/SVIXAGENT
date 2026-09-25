/* 双宿主面板中继测试（2026-09-25）—— **两台宿主同时服务**、各走各的文件
 *
 * 被测：electron/src/panel-bridge.js 在**同一进程里跑 sv / ix 两个实例** + 文件通道隔离。
 *
 * 为什么必须有这个测试：用户 2026-09-25 报「IX 连不上 electron」。根因是客户端只有一个中继实例
 * （`state.host` 单值），`startPanelBridge()` 按 `['sv','ix']` 采样、**sv 优先**且启动后直接
 * `return`（不再采样）⇒ SV 一开着，`akdagent-client-ix.json` 永远没人写，而 IX 的桥按这份文件
 * （`AKDAgentBridge.lua`：「客户端每 ~5s 写，超 20s 视为未连接」）判定 ⇒ IX 侧栏一直显示
 * 「⚠️ 还没连上悬浮球」。这个测试把"两台能同时在线"钉死。
 *
 * 用法：node tools/test-panel-dual.cjs                                        */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPanelBridge } = require(path.join(__dirname, '..', 'electron', 'src', 'panel-bridge.js'));

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  BAD  ') + m); if (!c) bad++; };
const eq = (a, b, m) => ok(a === b, `${m}（实得 ${JSON.stringify(a)} / 期望 ${JSON.stringify(b)}）`);
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-dual-'));
const SID = 'sess-dual';
const presenceOf = (h) => path.join(tmp, `akdagent-client-${h}.json`);
const outOf = (h) => path.join(tmp, `akdagent-panel-in-${h}.jsonl`);
const inOf = (h) => path.join(tmp, `akdagent-panel-${h}.jsonl`);
const offOf = (h) => path.join(tmp, `akdagent-panel-${h}.offset`);
const readEvents = (f) => fs.existsSync(f)
  ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  : [];

/** 两个实例：**每台宿主一个**（main.js 里就是这么建的） */
const sent = { sv: [], ix: [] };
const responded = { sv: [], ix: [] };
const activity = { sv: 0, ix: 0 };
function mkBridge (host) {
  const b = createPanelBridge({
    log: () => {},
    t: (k, ...a) => String(k),
    tmpDir: tmp,
    getSessionId: () => SID,
    sendPrompt: async (t) => { sent[host].push(t); },
    respond: async (r, v) => { responded[host].push({ r, v }); },
    cancel: async () => {},
    onActivity: () => { activity[host] += 1; },
  });
  b.start(host);
  return b;
}
const bridges = { sv: mkBridge('sv'), ix: mkBridge('ix') };

(async function run () {
  /* ① ★核心：两台**同时**在线 —— 两份在线文件都要在、都要新鲜 */
  const svP = fs.existsSync(presenceOf('sv')) ? JSON.parse(fs.readFileSync(presenceOf('sv'), 'utf8')) : null;
  const ixP = fs.existsSync(presenceOf('ix')) ? JSON.parse(fs.readFileSync(presenceOf('ix'), 'utf8')) : null;
  ok(!!svP && !!ixP, '① 两份在线文件同时存在（client-sv.json + client-ix.json）');
  const nowSec = Math.floor(Date.now() / 1000);
  ok(!!svP && nowSec - svP.ts <= 5, '① sv 在线文件新鲜（≤5s）');
  ok(!!ixP && nowSec - ixP.ts <= 5, '① ix 在线文件新鲜（≤5s）★ 这条就是用户报的故障本身');

  /* ② 事件文件隔离：往 ix 面板写一条输入 ⇒ 只有 ix 收到 */
  fs.mkdirSync(tmp, { recursive: true });
  fs.appendFileSync(inOf('ix'), JSON.stringify({ v: 1, seq: 1, kind: 'input', text: '给 IX 的话' }) + '\n', 'utf8');
  bridges.ix.__test.pump(); await tick();
  eq(sent.ix.length, 1, '② ix 中继收到了面板输入');
  eq(sent.ix[0], '给 IX 的话', '② 内容正确');
  eq(sent.sv.length, 0, '② sv 中继**没**被带进来（文件隔离）');
  eq(activity.ix, 1, '② ix 记了一次活动（给"当前宿主"用）');
  eq(activity.sv, 0, '② sv 活动计数没被误加');

  /* ③ 偏移文件各一份、互不干扰（共用的话一台消费掉另一台就漏读）
   *   ⚠️ `start()` 会立刻落盘一次 offset（值为 0），所以"有没有文件"不是判据 ——
   *   判据是 **ix 的偏移已经推进、sv 的还停在 0**。 */
  ok(fs.existsSync(offOf('ix')) && fs.existsSync(offOf('sv')), '③ 两台各有自己的 offset 文件');
  const off = (h) => parseInt(fs.readFileSync(offOf(h), 'utf8'), 10);
  ok(off('ix') > 0, `③ ix 的偏移已推进（${off('ix')}）`);
  eq(off('sv'), 0, '③ sv 的偏移还停在 0（没被 ix 的事件带动）');

  /* ④ 会话帧广播给两台中继（main.js 的做法：两块面板镜像同一个悬浮球会话） */
  const frame = { rpcId: 'r-1', payload: { sessionId: SID, type: 'session/event',
    event: { type: 'user/message', data: { message: { content: [{ type: 'text', text: '两边都要看到这句' }] } } } } };
  const before = { sv: readEvents(outOf('sv')).length, ix: readEvents(outOf('ix')).length };
  for (const h of ['sv', 'ix']) bridges[h].onMuxFrame(frame);
  await tick();
  const svNew = readEvents(outOf('sv')).slice(before.sv);
  const ixNew = readEvents(outOf('ix')).slice(before.ix);
  ok(svNew.some((e) => e.kind === 'append' && /两边都要看到这句/.test(e.text)), '④ sv 面板收到镜像');
  ok(ixNew.some((e) => e.kind === 'append' && /两边都要看到这句/.test(e.text)), '④ ix 面板收到镜像');

  /* ⑤ 答题回执各归各家（跨台由 main.js 的 respond 负责收掉另一台的选项，不在这里测） */
  bridges.ix.onMuxFrame({ rpcId: 'rpc-ix', payload: { sessionId: SID, type: 'question/requested',
    questions: [{ id: 'q-ix', question: 'IX 这边选哪个？', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false }] } });
  await tick();
  const ixAsks = readEvents(outOf('ix')).filter((e) => e.kind === 'ask');
  ok(ixAsks.length === 1, '⑤ ix 面板出现了选项');
  await bridges.ix.__test.handlePanelEvent({ kind: 'answer', picked: ['A'], text: '' });
  eq(responded.ix.length, 1, '⑤ ix 的答案回执走了 ix 实例');
  eq(responded.sv.length, 0, '⑤ sv 实例没被误触发');

  /* ⑥ 一台下线 ⇒ 只有它那份在线文件消失（诚实下线，别举着过期的在线标志） */
  bridges.ix.stop();
  await tick();
  ok(!fs.existsSync(presenceOf('ix')), '⑥ ix 停止后它的在线文件被删掉');
  ok(fs.existsSync(presenceOf('sv')), '⑥ sv 的在线文件不受影响（另一台照常在服务）');
  bridges.sv.stop();

  /* 收尾 */
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略 */ }
  console.log(`\n${bad ? '有 ' + bad + ' 项不通过' : '全部通过'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('测试自身异常：' + (e && e.stack || e)); process.exit(1); });
