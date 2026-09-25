/* 面板「一次问多道题」回归测试（2026-09-19）
 *
 * 为什么有它：用户 2026-09-19 报「**面板操作一个选项后会卡住**」。根因是宿主的硬校验 ——
 *   `@deepseek-ai/dsh-host-apiproxy` 的 `matchesQuestions()`（lib/index.js:1375）要求
 *   **一次应答覆盖整批**：`answers.length === questions.length` 且**按序对 id**；
 *   不匹配就 `accepted:false` 且**该提问永不 resolve** ⇒ agent 永久挂起。
 *   旧实现只把 `qs[0]` 发下去、也只回一个答案（原注释写"多题逐题出"，但没有"出下一题"的机制）。
 *   现在的语义：**逐题问、最后一次性应答**（用户 2026-09-19 裁定"逐题累积"）。
 * 还钉住两条同源的协议约束（都会导致 bad-response ⇒ 卡死）：
 *   · 单选（`multiSelect !== true`）时 `custom` 与 `selected` **不可并存**；
 *   · 单选 `selected.length ≤ 1`；`custom` 若给必须非空。
 * 以及：应答被拒时**必须在面板上报出来**（旧实现把返回值丢了 ⇒ 卡住完全无声）。
 *
 * 用法：node tools/test-panel-batch.cjs        （不联网、不起 Electron）
 *   可选参数：指向另一份 panel-bridge.js（**只给负向自测用**：拿改坏的副本跑，确认断言会红） */
const fs = require('fs');
const os = require('os');
const path = require('path');
const BRIDGE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'electron', 'src', 'panel-bridge.js');
const { createPanelBridge } = require(BRIDGE);

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  BAD  ') + m); if (!c) bad++; };
const eq = (a, b, m) => ok(a === b, `${m}（实得 ${JSON.stringify(a)} / 期望 ${JSON.stringify(b)}）`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-batch-'));
const OUT = path.join(tmp, 'akdagent-panel-in-sv.jsonl');
const SID = 'sess-batch';
const responded = [];
/** 可被单个用例覆写：模拟宿主机拒绝 */
let respondReply = { accepted: true };

const DICT = {
  'panel.processing': '{0} 正在处理中…',
  'panel.agentName': 'SV Agent',
  'panel.freeText': '补充说明（可留空）',
  'panel.questionOf': '第 {0}/{1} 题',
  'panel.answerRejected': '⚠️ 宿主机拒绝了这次应答（{0}）',
};
const bridge = createPanelBridge({
  log: () => {},
  t: (k, ...a) => String(DICT[k] === undefined ? k : DICT[k])
    .replace(/\{(\d+)\}/g, (m, i) => (a[i] === undefined ? m : a[i])),
  tmpDir: tmp,
  getSessionId: () => SID,
  sendPrompt: async () => {},
  respond: async (r, v) => { responded.push({ r, v }); return respondReply; },
  cancel: async () => {},
});
bridge.start('sv');

const events = () => fs.existsSync(OUT)
  ? fs.readFileSync(OUT, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  : [];
const asks = () => events().filter((e) => e.kind === 'ask');
const appends = () => events().filter((e) => e.kind === 'append').map((e) => e.text);
const askQuestion = (rpcId, questions) => bridge.onMuxFrame({
  rpcId, payload: { sessionId: SID, type: 'question/requested', questions },
});
const answer = (askId, picked, text) => bridge.__test.handlePanelEvent({ kind: 'answer', askId, picked, text });
const skip = (askId) => bridge.__test.handlePanelEvent({ kind: 'skip', askId });

const Q = (id, question, opts, multiSelect) => ({
  id, question, multiSelect: !!multiSelect,
  options: (opts || []).map((l) => ({ label: l })),
});
/* 断言要能"干净地红"：payload 走样时按空值读，让断言失败而不是抛异常
 * （负向自测踩到过：直接把 answers 砍成 1 个 ⇒ 后面 `ans[1].selected` 崩成 exit 2，看不清哪条红） */
const answersOf = (r) => {
  const v = r && r.v;
  return (v && v.answer && Array.isArray(v.answer.answers)) ? v.answer.answers : [];
};
const itemOf = (arr, i) => arr[i] || { id: undefined, selected: [], custom: undefined };

(async function run() {
  /* ① 三题批次：一次只问一题，标题带「第 i/N 题」 */
  console.log('\n① 三题批次：逐题下发');
  askQuestion('rpc-1', [Q('q1', '第一题', ['A', 'B']), Q('q2', '第二题', ['C', 'D']), Q('q3', '第三题')]);
  let A = asks();
  eq(A.length, 1, '面板只收到 1 个 ask（不会一次塞三道）');
  eq(A[0].id, 'q1', '先问第 1 题');
  eq(A[0].title, '第 1/3 题：第一题', '标题带进度（用户裁定"逐题累积"，要看得见第几题）');
  ok(/第一题/.test(A[0].text) && /1\. A/.test(A[0].text), '信息框里是第 1 题的题干与选项');

  /* ② 答第 1 题 ⇒ 还**不能**应答宿主（否则 answers.length 不足 ⇒ bad-response ⇒ 永久挂起） */
  console.log('\n② 答第 1 题：先不发应答，接着问第 2 题');
  await answer('q1', ['A'], '');
  eq(responded.length, 0, '★ 未凑齐整批 ⇒ 不得应答宿主（这正是"卡住"的根因）');
  A = asks();
  eq(A.length, 2, '又下发了一个 ask');
  eq(A[1].id, 'q2', '接着问第 2 题');
  eq(A[1].title, '第 2/3 题：第二题', '进度变成第 2/3');
  /* ★ 面板拿 `seq` 当"这是不是同一道题"的身份（answeredSeq 去重 + same 判定）。
   *   同批次 rpcId 相同 ⇒ 若 seq 直接用 rpcId，第 2 题会被面板判成"已答过"**藏掉**
   *   （用户 2026-09-20：「多次选择在侧边栏还是只能选一次」）。 */
  ok(A[0].seq !== A[1].seq, '★ 批内每题的 seq **唯一**（否则第 2 题会被面板当已答过藏掉）',
    [A[0].seq, A[1].seq]);
  ok(String(A[0].seq).startsWith('rpc-1') && String(A[1].seq).startsWith('rpc-1'),
    'seq 仍以 rpcId 为前缀（便于排查时对回同一次提问）', [A[0].seq, A[1].seq]);

  /* ③ 答第 2 题（带自定义文字，单选 ⇒ 文字应被丢弃）*/
  console.log('\n③ 答第 2 题（单选 + 补充文字）');
  await answer('q2', ['C'], '我补充一句');
  eq(responded.length, 0, '仍未凑齐 ⇒ 不应答');
  A = asks();
  eq(A[2].id, 'q3', '接着问第 3 题');
  eq(A[2].title, '第 3/3 题：第三题', '进度第 3/3');
  ok(A[2].options.length === 0, '第 3 题无选项 ⇒ 走自由输入（textInput）');

  /* ④ 答第 3 题 ⇒ **恰好一次**应答，且整批按序对 id */
  console.log('\n④ 答第 3 题：整批一次性应答');
  await answer('q3', [], '自由回答');
  eq(responded.length, 1, '★ 恰好回一次（不是每题回一次）');
  const payload = (responded[0] && responded[0].v) || {};
  eq(payload.sessionId, SID, '带上 sessionId（宿主第一道校验就是它）');
  const ans = answersOf(responded[0]);
  eq(ans.length, 3, '★ answers.length === questions.length（宿主硬校验）');
  eq(ans.map((x) => x.id).join(','), 'q1,q2,q3', '★ 按序对 id（宿主逐位比对）');
  eq(itemOf(ans, 0).selected.join(','), 'A', '第 1 题 = 选 A');
  eq(itemOf(ans, 1).selected.join(','), 'C', '第 2 题 = 选 C');
  eq(itemOf(ans, 1).custom, undefined, '★ 单选：选了选项就**不发** custom（并存会被判 bad-response）');
  eq(itemOf(ans, 2).selected.length, 0, '第 3 题没选项 ⇒ selected 为空数组（required 键仍在）');
  eq(itemOf(ans, 2).custom, '自由回答', '第 3 题的 custom 照发');

  /* ⑤ 单选：互斥与上限 */
  console.log('\n⑤ 单选约束（custom 与 selected 互斥 / selected ≤ 1）');
  responded.length = 0;
  askQuestion('rpc-2', [Q('s1', '单选一题', ['X', 'Y'])]);
  await answer('s1', ['X', 'Y'], '备注');
  const one = itemOf(answersOf(responded[0]), 0);
  ok(one.selected.length <= 1, '★ 单选最多 1 个选项（实得 ' + one.selected.length + '）');
  eq(one.custom, undefined, '★ 单选不与 custom 并存');

  /* ⑥ 多选：可并存 */
  console.log('\n⑥ 多选：选项与自定义可并存');
  responded.length = 0;
  askQuestion('rpc-3', [Q('m1', '多选一题', ['P', 'Q'], true)]);
  await answer('m1', ['P', 'Q'], '都要');
  const m = itemOf(answersOf(responded[0]), 0);
  eq(m.selected.join(','), 'P,Q', '多选保留多个选项');
  eq(m.custom, '都要', '多选可与 custom 并存（协议明确允许）');
  // ★ 多选标志必须传到面板：面板据此渲染 CheckBox（可多次勾选）；丢了就变"点一下即提交"的单选
  const mAsk = asks()[asks().length - 1];
  eq(mAsk.multi, true, '★ 多选题下发的 ask 带 multi:true（面板才会用 CheckBox 而不是按钮）');
  eq(asks()[0].multi, false, '单选的 ask 带 multi:false（面板走"点一下直接提交"的按钮）');

  /* ⑦ 跳过：只跳当前题，其余照问 */
  console.log('\n⑦ 跳过当前题');
  responded.length = 0;
  const nAsk = asks().length;
  askQuestion('rpc-4', [Q('k1', '题一', ['A']), Q('k2', '题二', ['B'])]);
  await skip('k1');
  eq(responded.length, 0, '跳过后仍不能应答（还差第 2 题）');
  eq(asks().length, nAsk + 2, '跳过后接着问第 2 题');
  await answer('k2', ['B'], '');
  eq(responded.length, 1, '两题齐了 ⇒ 一次应答');
  const sk = answersOf(responded[0]);
  eq(sk.length, 2, '仍是整批 2 个答案');
  eq(itemOf(sk, 0).selected.length, 0, '被跳过的那题 = 空选择（"让 agent 自行决定"的既定语义）');

  /* ⑧ 被拒要报出来（旧实现把返回值丢了 ⇒ 卡住无声） */
  console.log('\n⑧ 应答被宿主机拒绝 ⇒ 必须在面板上报出来');
  responded.length = 0;
  respondReply = { accepted: false, reason: 'bad-response' };
  const nApp = appends().length;
  askQuestion('rpc-5', [Q('z1', '单题', ['A'])]);
  await answer('z1', ['A'], '');
  eq(responded.length, 1, '应答发出去了');
  const fresh = appends().slice(nApp);
  ok(fresh.some((t) => /拒绝/.test(t) && /bad-response/.test(t)),
    '★ 面板出现"被拒绝 + reason"（不再无声卡住）', JSON.stringify(fresh));
  respondReply = { accepted: true };

  bridge.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('');
  console.log(bad ? '===== 结果：' + bad + ' 项失败 =====' : '===== 结果：全部通过 =====');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('测试自身异常：' + (e && e.stack || e)); process.exit(2); });
