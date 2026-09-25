/* 面板消息对齐回归测试（#24 / P3）—— 不联网、不起 Electron，纯喂 mux 帧看输出事件
 *
 * 被测：electron/src/panel-bridge.js 的会话镜像
 *   · 用户消息镜像（前缀 `<`）
 *   · 助手整轮正文：text-delta 累积 → turn/end 一次性追加（**不含 reasoning**）
 *   · 一轮只加一次「正在处理中…」
 *   · 面板自己发的输入不重复回显（文本精确匹配；提交/跳过后只吞紧随的一条）
 *   · 只镜像悬浮球那个会话（别的会话不进面板）
 *   · assistant/message 兜底不重复推
 *
 * 用法：node tools/test-panel-align.cjs                                        */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPanelBridge } = require(path.join(__dirname, '..', 'electron', 'src', 'panel-bridge.js'));

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  BAD  ') + m); if (!c) bad++; };
const eq = (a, b, m) => ok(a === b, `${m}（实得 ${JSON.stringify(a)} / 期望 ${JSON.stringify(b)}）`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-align-'));
const OUT = path.join(tmp, 'akdagent-panel-in-sv.jsonl');
const SID = 'sess-A';
let sessionId = SID;
const sentPrompts = [];
const responded = [];

const bridge = createPanelBridge({
  log: () => {},
  t: (k, ...a) => String({ 'panel.processing': '{0} 正在处理中…', 'panel.agentName': 'SV Agent' }[k] || k)
    .replace('{0}', a[0] === undefined ? '' : a[0]),
  tmpDir: tmp,
  getSessionId: () => sessionId,
  sendPrompt: async (t) => { sentPrompts.push(t); },
  respond: async (r, v) => { responded.push({ r, v }); },
  cancel: async () => {},
});
bridge.start('sv');

/* ── 工具 ── */
const events = () => fs.existsSync(OUT)
  ? fs.readFileSync(OUT, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  : [];
const appends = () => events().filter((e) => e.kind === 'append').map((e) => e.text);
const asks = () => events().filter((e) => e.kind === 'ask' || e.kind === 'clear');
const since = (n) => appends().slice(n);
const mux = (event, sid = SID) => bridge.onMuxFrame({
  rpcId: 'r-' + Math.random().toString(36).slice(2), payload: { sessionId: sid, type: 'session/event', event },
});
const userMsg = (text) => ({ type: 'user/message', data: { message: { content: [{ type: 'text', text }] } } });
const chunk = (turn, text) => ({ type: 'assistant/chunk', data: { turn, chunk: { type: 'text-delta', text } } });
const think = (turn, text) => ({ type: 'assistant/chunk', data: { turn, chunk: { type: 'reasoning-delta', text } } });
const turnEnd = (turn) => ({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } });

(async function run() {
  /* ① 悬浮球侧打的用户消息 ⇒ 镜像 + 一条「正在处理中」 */
  let n = appends().length;
  mux(userMsg('你好，帮我看看这个工程'));
  mux(chunk(1, '好的，'));
  mux(chunk(1, '我先读工程。'));
  mux(think(1, '内部推理不应出现在面板'));
  mux(turnEnd(1));
  let got = since(n);
  eq(got.length, 3, '① 用户消息 + 处理中 + 整轮正文 = 3 条');
  eq(got[0], '< 你好，帮我看看这个工程', '① 用户消息带 `<` 前缀');
  ok(/正在处理中/.test(got[1]), '① 第二条是「正在处理中…」');
  eq(got[2], '好的，我先读工程。', '① 第三条是整轮正文（text-delta 拼接）');
  ok(!got.join('').includes('内部推理'), '① 推理块没进面板');
  ok(!got.join('').includes('好的，\n'), '① 不流式（不是逐块追加）');

  /* ② 面板自己发的输入：本地已显示 `< xxx` ⇒ 会话里同文回显不再重复 */
  n = appends().length;
  await bridge.__test.handlePanelEvent({ kind: 'input', text: '从面板输入的话' });
  eq(sentPrompts[sentPrompts.length - 1], '从面板输入的话', '② 面板输入已发给会话');
  mux(userMsg('从面板输入的话'));
  mux(chunk(2, '收到。'));
  mux(turnEnd(2));
  got = since(n);
  ok(!got.some((t) => t.startsWith('< 从面板输入的话')), '② 面板自己的输入不重复回显');
  eq(got.length, 2, '② 只剩「处理中 + 正文」两条');
  eq(got[1], '收到。', '② 正文正常');

  /* ③ 面板动作之后的**下一条**用户消息才被吞，再下一条要正常镜像 */
  n = appends().length;
  await bridge.__test.handlePanelEvent({ kind: 'skip', picked: [] });
  mux(userMsg('这是面板动作的回显'));
  mux(userMsg('这是普通消息，必须出现'));
  mux(turnEnd(5));                       // 把这一轮正常收尾（否则后面那轮会被当成"同轮"）
  got = since(n);
  ok(!got.join('').includes('这是面板动作的回显'), '③ 回执后的第一条被吞');
  ok(got.join('').includes('< 这是普通消息，必须出现'), '③ 再下一条正常镜像（不是开时间窗乱吞）');

  /* ④ 只认悬浮球那个会话 */
  n = appends().length;
  mux(userMsg('别的会话的消息'), 'sess-B');
  mux(chunk(9, '别的会话的正文'), 'sess-B');
  mux(turnEnd(9), 'sess-B');
  eq(since(n).length, 0, '④ 别的会话一帧都不进面板');

  /* ⑤ 只调工具、没正文的轮 ⇒ 只多一条「正在处理中」，不推空正文 */
  n = appends().length;
  mux(userMsg('查一下'));
  mux({ type: 'tool/call', data: { turn: 3, name: 'sv_ping' } });
  mux({ type: 'tool/result', data: { turn: 3 } });
  mux(turnEnd(3));
  got = since(n);
  eq(got.length, 2, '⑤ 用户消息 + 处理中，没有空正文');
  ok(!got.some((t) => t.trim() === ''), '⑤ 没有空行进面板');

  /* ⑥ assistant/message 兜底：这一轮没见过 chunk ⇒ 推一次；重复帧不再推 */
  n = appends().length;
  const am = (turn, text) => ({ type: 'assistant/message', data: { turn, message: { content: [{ type: 'text', text }] } } });
  mux(am(7, '兜底正文'));
  eq(since(n).length, 1, '⑥ 兜底推了一条');
  eq(since(n)[0], '兜底正文', '⑥ 兜底内容正确');
  mux(am(7, '兜底正文'));
  eq(since(n).length, 1, '⑥ 重复的兜底帧不再推');

  /* ⑦ 有 chunk 的轮不会被 assistant/message 再推一遍 */
  n = appends().length;
  mux(userMsg('再来一轮'));
  mux(chunk(8, '流式正文'));
  mux(turnEnd(8));
  mux(am(8, '流式正文'));
  eq(since(n).filter((t) => t === '流式正文').length, 1, '⑦ 正文只出现一次');

  /* ⑧ stream/error 之后新一轮能重新报「正在处理中」 */
  n = appends().length;
  mux({ type: 'stream/error', data: { error: { message: 'boom' } } });
  mux(userMsg('出错后再来'));
  got = since(n);
  ok(got.some((t) => /正在处理中/.test(t)), '⑧ 出错后新一轮仍会报「正在处理中」');

  /* ⑨ turn/end 丢了（断线/宿主崩）⇒ 换轮时把上一轮正文补推出来，不烂在缓冲里 */
  n = appends().length;
  mux(userMsg('这一轮会断线'));
  mux(chunk(11, '断线前的正文'));
  const realNow = Date.now;
  Date.now = () => realNow() + 120000;          // 快进 2 分钟：那一轮显然已经死了
  mux(userMsg('新的一轮'));
  Date.now = realNow;
  got = since(n);
  ok(got.includes('断线前的正文'), '⑨ turn/end 丢了也补推上一轮正文');
  ok(got.indexOf('断线前的正文') >= 0 && got.indexOf('断线前的正文') < got.indexOf('< 新的一轮'),
     '⑨ 补推发生在换轮之前（顺序不乱）');
  eq(got.filter((t) => /正在处理中/.test(t)).length, 1, '⑨ 新一轮重新报一次「正在处理中」');

  /* ⑩ 交互路径没被镜像逻辑破坏：question ⇒ ask，答案回执带 rpcId */
  n = events().length;
  bridge.onMuxFrame({ rpcId: 'rpc-1', payload: {
    sessionId: SID, type: 'question/requested',
    questions: [{ id: 'q1', question: '选哪个？', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false }] } });
  const askEv = events().slice(n).find((e) => e.kind === 'ask');
  ok(!!askEv && askEv.options.length === 2, '⑩ 问题仍能变成面板选项');
  await bridge.__test.handlePanelEvent({ kind: 'answer', picked: ['A'], text: '' });
  ok(responded.length === 1 && responded[0].r === 'rpc-1', '⑩ 答案回执走原 rpcId');
  eq(responded[0].v.answer.answers[0].selected.join(','), 'A', '⑩ 选中项正确传入');

  /* ⑬ 两题交错：答第一题必须投给第一题（2026-09-17 会话卡死事故的回归） */
  n = events().length;
  bridge.onMuxFrame({ rpcId: 'rpc-A', payload: { sessionId: SID, type: 'question/requested',
    questions: [{ id: 'qa', question: '第一题', options: [{ label: 'A1' }, { label: 'A2' }], multiSelect: false }] } });
  bridge.onMuxFrame({ rpcId: 'rpc-B', payload: { sessionId: SID, type: 'question/requested',
    questions: [{ id: 'qb', question: '第二题', options: [{ label: 'B1' }], multiSelect: false }] } });
  responded.length = 0;
  await bridge.__test.handlePanelEvent({ kind: 'answer', askId: 'qa', picked: ['A2'], text: '' });
  ok(responded.length === 1 && responded[0].r === 'rpc-A', '⑬ 答第一题投给第一题（按 askId，不被后一题顶掉）');
  eq(responded[0].v.answer.answers[0].id, 'qa', '⑬ 回执里的题目 id 正确');
  const clearEv = events().slice(n).filter((e) => e.kind === 'clear').pop();
  ok(!!clearEv && clearEv.id === 'qa', '⑬ clear 带上题目 id（桥据此只清这道题）');
  responded.length = 0;
  await bridge.__test.handlePanelEvent({ kind: 'answer', askId: 'qb', picked: ['B1'], text: '' });
  ok(responded.length === 1 && responded[0].r === 'rpc-B', '⑬ 第二题也还能答（台账没被前一票挤掉）');

  /* ⑪ 事件行结构合法（桥按行 JSON 解析；ask 行的 seq 是题目序号，可以是字符串） */
  const all = events();
  ok(all.every((e) => e && typeof e.kind === 'string' && 'seq' in e && typeof e.at === 'string'),
     '⑪ 每行都是带 seq/at 的合法事件');

  /* ⑫ 启动不重放旧面板事件（2026-09-17 两个实例事故的根因之二）+ 新事件照常处理 */
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-replay-'));
  const panelFile = path.join(tmp2, 'akdagent-panel-sv.jsonl');
  const offsetFile = path.join(tmp2, 'akdagent-panel-sv.offset');
  fs.writeFileSync(panelFile, JSON.stringify({ v: 1, seq: 1, kind: 'input', text: '几天前按过的旧输入' }) + '\n', 'utf8');
  const sent2 = [];
  const mkBridge = () => createPanelBridge({
    log: () => {}, t: (k) => k, tmpDir: tmp2,
    sendPrompt: async (t) => { sent2.push(t); }, respond: async () => {}, cancel: async () => {},
  });
  const tick = () => new Promise((r) => setTimeout(r, 60));
  let b2 = mkBridge();
  b2.start('sv');
  b2.__test.pump(); await tick();
  eq(sent2.length, 0, '⑫ 首次启动：历史面板事件不重放（不把旧输入再发一遍）');
  ok(fs.existsSync(offsetFile), '⑫ 消费偏移已落盘：' + fs.readFileSync(offsetFile, 'utf8'));
  fs.appendFileSync(panelFile, JSON.stringify({ v: 1, seq: 2, kind: 'input', text: '新输入' }) + '\n', 'utf8');
  b2.__test.pump(); await tick();
  eq(sent2.join('|'), '新输入', '⑫ 新增的输入照常送给会话');
  b2.stop();                                   // 模拟客户端重启
  b2 = mkBridge();
  b2.start('sv');
  b2.__test.pump(); await tick();
  eq(sent2.length, 1, '⑫ 重启后仍不重放已消费的事件（偏移落盘生效）');
  b2.stop();
  try { fs.rmSync(tmp2, { recursive: true, force: true }); } catch { /* 清理失败无所谓 */ }

  bridge.stop();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败无所谓 */ }
  console.log(bad ? `\n${bad} 项不通过` : '\n全部通过');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('测试自身异常：' + e.stack); process.exit(2); });
