'use strict';
/**
 * 面板桥（Electron 主进程侧）—— 2026-09-15 新建
 *
 * 链路（完整图见 docs/SidePanel桥设计.md）：
 *   侧栏面板(JS) ──project scriptData──► Lua 桥 0.3.7 ──jsonl──► 本模块
 *   侧栏面板(JS) ◄──project scriptData── Lua 桥 0.3.7 ◄──jsonl── 本模块
 *
 * 本模块只做五件事：
 *   ① tail `%TEMP%/akdagent-panel-<host>.jsonl`（面板事件）→ 转成会话动作
 *   ② 把会话侧要显示的东西写进 `akdagent-panel-in-<host>.jsonl`
 *   ③ 接 mux 的 `question/requested` / `approval/requested` ⇒ 推到面板当"选项/确认"
 *   ④ 面板的答案回执：`dshRespond(rpcId, …)`
 *   ⑤ **会话镜像**（2026-09-17 起）：直接消费 mux 的 `session/event`，把真实会话
 *      （用户消息 + 助手整轮正文）按同一份内容也写进面板 ⇒ 面板 = 悬浮球看到的那条会话
 *
 * 纪律：
 *   - **不出网**（与本仓分发政策一致）；只读写 %TEMP% 下的 jsonl
 *   - 任何异常只打日志，绝不影响悬浮球与桥
 *   - 面板不在线（桥心跳没有 panel:true）时**整个模块不启动**
 *   - 「正在处理中」一轮只加一次：由本地轮序去重（turnId 由本模块自己发）
 *   - **消息只有一个真相源 = 本模块**：渲染进程（悬浮球）不再往面板推消息，
 *     否则同一轮会被推两次（旧路径的问题见 #24 与 §⑤ 的注释）
 */
const fs = require('node:fs');
const path = require('node:path');

const POLL_MS = 500;

/**
 * @param {object} deps
 * @param {(s:string)=>void} deps.log
 * @param {(text:string)=>Promise<any>} deps.sendPrompt   往当前会话发一条用户消息
 * @param {(rpcId:string, value:any)=>Promise<any>} deps.respond   回执 approval/question
 * @param {()=>Promise<any>} deps.cancel                   中断当前轮
 * @param {(k:string, ...a:any[])=>string} deps.t          i18n
 * @param {string} deps.tmpDir                              %TEMP%
 * @param {()=>string|null} [deps.getSessionId]            悬浮球/面板正在用的 DSH 会话 id
 *        —— 镜像只认这一个会话（宿主里可能有别的会话在跑，不能混进面板）
 */
function createPanelBridge(deps) {
  const log = deps.log || (() => {});
  const T = deps.t;
  const state = {
    host: null,          // 'sv' | 'ix'
    timer: null,
    beatTimer: null,     // 在线心跳（写 akdagent-client-<host>.json）
    offset: 0,
    outSeq: 0,
    pending: null,       // { kind:'question'|'approval', rpcId, ids, sessionId }
    asks: new Map(),     // 最近几道题：id → { kind, rpcId, sessionId, questionId, approvalId, at }
    lastTurn: null,      // 已推过「正在处理中」的 turnId
    ready: false,
  };
  const ASK_KEEP = 8;    // 记住最近 8 道题（答题要按 id 对上，不能只认"当前那道"）

  /* ── 会话镜像状态（见文件头 ⑤）─────────────────────────────────
   * turns  : 轮号 → 该轮累积的正文（`text-delta` 逐块拼）
   * pushed : 已推过的轮号（只给 `assistant/message` 兜底判重用，容量 20）
   * open   : 本轮是否已推过「正在处理中…」
   * recent : 面板自己发出去的输入（回显去重：面板已经本地显示过 `< xxx`）
   */
  const ECHO_MS = 15000;      // 面板输入回显去重窗口（文本精确匹配）
  const QUIET_MS = 4000;      // 面板做过非文本回执（提交/跳过）后，**只压紧随的那一条**用户消息
  const STALE_MS = 60000;     // 一轮超过这么久没有任何事件 ⇒ 认为它的 turn/end 丢了
  const mirror = {
    turns: new Map(),
    pushed: new Map(),
    open: false,
    lastTurnId: null,
    lastAt: 0,                // 最近一次会话事件时间（判"这轮还活着吗"）
    seq: 0,
    recent: [],
    expect: 0,                // >now 表示"下一条用户消息是面板动作的回显 ⇒ 吞掉"
  };
  const outPath = () => path.join(deps.tmpDir, `akdagent-panel-in-${state.host}.jsonl`);
  const inPath = () => path.join(deps.tmpDir, `akdagent-panel-${state.host}.jsonl`);
  const presencePath = () => path.join(deps.tmpDir, `akdagent-client-${state.host}.json`);
  const inOffsetPath = () => path.join(deps.tmpDir, `akdagent-panel-${state.host}.offset`);

  /** 读面板→客户端这个方向的消费偏移（**必须落盘**）。
   *  为什么：不落盘的话每次客户端启动都从 0 重读整个 jsonl ⇒ 把面板**以前按过的输入**
   *  再发一遍给会话（2026-09-17 实测：启动时冒出 `[panel] 用户输入：ping / ping / 测试`，
   *  那是几天前按的）。首次（没有落盘偏移）直接把偏移设到文件末尾 —— 旧事件一律视为已消费，
   *  只跟新增。会话侧另有 id 防重，这里只负责"别把历史当新消息"。 */
  function loadOffset() {
    let size = 0;
    try { if (fs.existsSync(inPath())) size = fs.statSync(inPath()).size; } catch { size = 0; }
    let saved = NaN;
    try { saved = parseInt(fs.readFileSync(inOffsetPath(), 'utf8'), 10); } catch { /* 没落盘过 */ }
    if (Number.isFinite(saved) && saved >= 0 && saved <= size) {
      state.offset = saved;
      log(`[panel] 面板事件偏移：从落盘恢复 ${saved}`);
    } else {
      state.offset = size;
      saveOffset();
      if (size) log(`[panel] 面板事件偏移：首次启动跳过 ${size} 字节历史（防重放旧输入）`);
    }
  }
  function saveOffset() {
    try { fs.writeFileSync(inOffsetPath(), String(state.offset), 'utf8'); }
    catch { /* 写不了就退化成"下次仍跳到末尾"，不会重放 */ }
  }

  /** 客户端在线心跳：桥/面板据此判断"悬浮球有没有连上"（用户 2026-09-15 要求）。
   *  只写本地 %TEMP%，不联网；超 20s 没更新 ⇒ 面板提示"请打开悬浮球"。 */
  function beat() {
    if (!state.host) return;
    try {
      fs.writeFileSync(presencePath(), JSON.stringify({
        ts: Math.floor(Date.now() / 1000),
        app: 'akdagent',
        version: deps.appVersion || null,
        pid: process.pid,
      }), 'utf8');
    } catch (e) { log('[panel] 写在线心跳失败：' + e.message); }
  }

  /** 往面板写一条事件（桥会读走并写进 scriptData） */
  function emit(ev) {
    if (!state.host) return false;
    state.outSeq += 1;
    const line = JSON.stringify(Object.assign({ v: 1, seq: state.outSeq, at: new Date().toISOString() }, ev)) + '\n';
    try { fs.appendFileSync(outPath(), line, 'utf8'); return true; }
    catch (e) { log('[panel] 写面板事件失败：' + e.message); return false; }
  }

  /* ── 会话 → 面板 ───────────────────────────────────────────── */
  /** ① 一轮开始：只加一次「正在处理中」（turnId 不变就不重复加） */
  function pushProcessing(turnId, agentName) {
    const id = String(turnId === undefined || turnId === null ? '-1' : turnId);
    if (state.lastTurn === id) return false;
    state.lastTurn = id;
    const who = agentName || T('panel.agentName');
    return emit({ kind: 'append', text: T('panel.processing', who) });
  }
  /** ② 一轮的最终文本（**调用方必须已剔除 think/推理块**；不流式，一次给全文） */
  function pushOutput(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return false;
    state.lastOut = s;                       // 供 assistant/message 兜底判重
    return emit({ kind: 'append', text: s });
  }
  /** ③ 提问 / 工具确认：选项文字同时进信息框（用户要求"先重复一遍"） */
  function pushAsk(payload) {
    const opts = Array.isArray(payload.options) ? payload.options : [];
    const head = payload.title || '';
    const lines = opts.map((o, i) => `${i + 1}. ${o.label}`);
    const text = [head].concat(lines).filter(Boolean).join('\n');
    return emit({
      kind: 'ask',
      id: payload.id || null,
      seq: payload.seq || null,
      title: head,
      options: opts,
      multi: !!payload.multi,
      textInput: payload.textInput || null,
      text: text,                        // 桥会把它 append 进信息框
    });
  }
  function clearAsk(id) { return emit(id ? { kind: 'clear', id } : { kind: 'clear' }); }

  /* ── 题目台账（2026-09-17 卡死事故后加）───────────────────────────
   * 事故：面板答题时客户端**只认"当前那道题"（单槽 pending）且不看 askId** ⇒ 用户答第 1 题、
   *   第 2 题已经推进来时，这票被投给第 2 题，第 1 题永远没人答 ⇒ DSH 一直等答案 ⇒ **会话卡死**
   *   （实测：`go_scope` / `pilot` 两题，日志里只看到答了 pilot，go_scope 悬空）。
   * 修法：按 askId 精确对上那道题再回执；台账**落盘**，客户端重启也不丢。
   */
  const asksPath = () => path.join(deps.tmpDir, `akdagent-panel-asks-${state.host}.json`);
  function saveAsks() {
    try { fs.writeFileSync(asksPath(), JSON.stringify({ asks: [...state.asks.values()] }), 'utf8'); }
    catch (e) { log('[panel] 题目台账落盘失败：' + e.message); }
  }
  function rememberAsk(a) {
    if (!a || !a.id) return;
    state.asks.set(String(a.id), a);
    while (state.asks.size > ASK_KEEP) state.asks.delete(state.asks.keys().next().value);   // 淘汰最旧
    saveAsks();
  }
  function forgetAsk(id) { if (id) { state.asks.delete(String(id)); saveAsks(); } }
  function loadAsks() {
    try {
      const j = JSON.parse(fs.readFileSync(asksPath(), 'utf8'));
      for (const a of (Array.isArray(j.asks) ? j.asks : [])) if (a && a.id) state.asks.set(String(a.id), a);
      // 重启后把"最近一道"还原成当前 pending，这样面板上那道题还能答
      const newest = [...state.asks.values()].sort((x, y) => (y.at || 0) - (x.at || 0))[0];
      if (newest) {
        state.pending = { kind: newest.kind, rpcId: newest.rpcId, sessionId: newest.sessionId,
                          questionId: newest.questionId, approvalId: newest.approvalId };
        log(`[panel] 从落盘台账恢复题目：${newest.id}（${newest.kind}）`);
      }
    } catch { /* 没落盘过或坏了都当没有 */ }
  }
  /** 按面板给的 askId 找到**那道**题；找不到才退回"当前 pending" */
  function resolveAsk(id) {
    const key = id === undefined || id === null ? '' : String(id);
    if (key && state.asks.has(key)) return { ask: state.asks.get(key), byId: true };
    return { ask: state.pending, byId: false };
  }

  /* ── 多题批次：**逐题收集、最后一次总应答**（2026-09-19）───────────────
   * 为什么必须"一次性"：宿主 `@deepseek-ai/dsh-host-apiproxy` 的 `matchesQuestions()`
   *   要求 `answers.length === questions.length` **且按序对 id**。
   *   旧实现只把 `qs[0]` 一道题发下去、也只回一个答案（原注释写"多题逐题出"，
   *   但**代码里没有任何"出下一题"的机制**）⇒ 应答被判 `bad-response`，
   *   **该提问永不 resolve** ⇒ agent 永久挂起（用户 2026-09-19 报「面板操作一个选项后会卡住」）。
   *   逐题问只是为了窄面板的观感（用户 2026-09-19 裁定"逐题积累"）；
   *   **进度必须落盘** —— 复用上面那套台账（2026-09-17 卡死事故留下的机制），
   *   否则客户端重启在批次中途就再也拼不出整批答案。
   */
  function batchRecord(rpcId, sessionId, questions) {
    return {
      kind: 'question', rpcId, sessionId, at: Date.now(),
      id: String(questions[0].id), questionId: questions[0].id,
      batch: {
        total: questions.length,
        index: 0,
        answers: [],
        // 只留应答与渲染要用的字段（要落盘，别塞整包）
        questions: questions.map((q) => ({
          id: q.id,
          question: q.question,
          multiSelect: q.multiSelect === true,
          options: (q.options || []).map((o) => ({ label: o.label })),
        })),
      },
    };
  }

  /** 批次里**当前那一题**的下发内容（多题时标题带「第 i/N 题」）。
   *  ⚠️ `seq` 必须**每题唯一**：面板拿 `seq` 当"这是不是同一道题"的身份
   *  （`AKDAgentPanel.lua` 的 `answeredSeq` 去重 + `same` 结构变更判定）。同一批次的 `rpcId` 是**同一个**；
   *  若 `seq` 直接用 rpcId ⇒ 面板答完第 1 题后 `answeredSeq = rpcId`，第 2 题带着同一 rpcId 回来
   *  会被判成"已答过"**直接藏掉**（用户 2026-09-20 实测：「多次选择在侧边栏还是只能选一次」）。
   *  后缀用**题的序号**（不是题目 id）：同一题重推时后缀不变 ⇒ 面板原有的去重语义仍然成立。 */
  function askPatch(rec) {
    const b = rec.batch;
    const q = b.questions[b.index];
    const head = b.total > 1
      ? T('panel.questionOf', b.index + 1, b.total) + '：' + q.question
      : q.question;
    return {
      id: q.id, seq: rec.rpcId + '#' + (b.index + 1), title: head,
      options: q.options.map((o) => ({ id: o.label, label: o.label })),
      multi: q.multiSelect === true,
      textInput: q.options.length ? null : { label: T('panel.freeText') },
    };
  }

  /** 把面板回的"选项 + 补充文字"落成宿主能接受的 answer item。
   *  ⚠️ 单选（`multiSelect !== true`）时 `custom` 与 `selected` **不可并存** —— 宿主
   *    `matchesQuestions()` 明写 `custom !== undefined && selected.length > 0 ⇒ false`；
   *    而面板自己的提示语却教用户"先打字再点选项" ⇒ 两者都非空时**以选项为准、丢弃文字**，
   *    并写日志说明（不静默）。`selected` 也必须属于该题给出的选项（面板只能点那些，天然满足）。 */
  function answerItem(rec, picked, custom) {
    const q = rec.batch.questions[rec.batch.index];
    const multi = q.multiSelect === true;
    let selected = (Array.isArray(picked) ? picked : []).map(String);
    let text = String(custom || '').trim();
    if (!multi && selected.length > 1) {
      log('[panel] 单选却收到多个选项 ⇒ 只取第一个：' + selected.join('、'));
      selected = selected.slice(0, 1);
    }
    if (!multi && selected.length > 0 && text) {
      log('[panel] 单选不允许「选项 + 自定义」并存（宿主会判 bad-response）⇒ 以选项为准，丢弃补充文字：'
        + text.slice(0, 40));
      text = '';
    }
    return { id: q.id, selected, ...(text ? { custom: text } : {}) };
  }

  /** 收下"当前这一题"的答案：还有下一题就继续问；答完最后一道才把**整批**一次性回给宿主。
   *  ⚠️ 一定要看 `accepted`：被拒时宿主**不会 resolve** 那个提问 ⇒ agent 永久挂起，
   *    所以这里必须把 reason 报到面板上（旧实现直接把返回值丢了，于是"卡住"完全无声）。 */
  async function advanceQuestion(rec, item) {
    const b = rec.batch;
    b.answers.push(item);
    b.index += 1;
    forgetAsk(rec.questionId);
    if (b.index < b.total) {
      const next = b.questions[b.index];
      const nextRec = { ...rec, id: String(next.id), questionId: next.id, at: Date.now() };
      state.asks.set(String(next.id), nextRec);
      saveAsks();
      state.pending = { kind: 'question', rpcId: rec.rpcId, sessionId: rec.sessionId, questionId: next.id };
      log(`[panel] 多题批次（${b.total} 题）：已收第 ${b.index} 题，接着问第 ${b.index + 1} 题`);
      pushAsk(askPatch(nextRec));
      return;
    }
    const r = await deps.respond(rec.rpcId, { sessionId: rec.sessionId, answer: { answers: b.answers } });
    if (state.pending && state.pending.questionId === rec.questionId) state.pending = null;
    clearAsk(rec.questionId);
    if (r && r.accepted === false) {
      // 宿主 side 的判据见 matchesQuestions()：答案数/顺序/id/单选互斥/选项归属，任一不符即拒且不 resolve
      log('[panel] ⚠️ 整批应答被宿主拒绝（reason=' + (r.reason || '?') + '）⇒ 该提问不会 resolve');
      emit({ kind: 'append', text: T('panel.answerRejected', r.reason || '?') });
    } else {
      log(`[panel] 多题批次应答已受理（${b.answers.length} 个答案）`);
    }
  }

  /* ── mux 帧 → 面板 ─────────────────────────────────────────────
   * 两条路：
   *   A. 交互（question / approval）⇒ 面板上的"选项/确认"（onMuxFrame 里）
   *   B. 消息镜像 ⇒ onSessionEvent（用户消息 + 助手整轮正文）
   *
   * ✅ 2026-09-17 对齐已落地（旧问题 #24）：以前助手文本只由悬浮球"渲染那一轮"时经 IPC
   *   推给面板 ⇒ 窗口没开/没渲染就没人推，两边内容自然不同。现在改由**本模块**直接吃
   *   mux 的 `session/event` —— 主进程是 mux 的唯一消费者，悬浮球关着也照收。
   *   ⇒ 面板 = 真实会话的镜子；悬浮球**不再**推消息（单一真相源）。
   *
   * 刻意不镜像的（是有意的差异，不是漏）：
   *   · `reasoning-delta`（思考块）—— 面板只放正文，与"输出不含 think"一致
   *   · 工具调用明细 —— 悬浮球里有可展开的工具行，面板窄、只放消息
   */

  /** 面板自己发出去的东西：记下来，供回显去重（面板已本地显示过 `< xxx`）
   *  有文本 ⇒ 精确匹配（输入框发的那句话）；无文本 ⇒ 提交/跳过这类回执，
   *  只压掉紧随其后的**那一条**用户消息（不是开一个时间窗乱吞）。 */
  function notePanelAct(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t) { mirror.expect = Date.now() + QUIET_MS; return; }
    mirror.recent.push({ text: t, at: Date.now() });
    while (mirror.recent.length > 8) mirror.recent.shift();
  }

  /** 这条用户消息是"面板自己发的"吗？是 ⇒ 不再镜像（免得同一句话出现两遍） */
  function isPanelEcho(text) {
    const t = String(text || '').trim();
    const i = mirror.recent.findIndex((x) => x.text === t && Date.now() - x.at < ECHO_MS);
    if (i >= 0) { mirror.recent.splice(i, 1); return true; }   // 命中即消费，防同文重复压制
    if (mirror.expect && Date.now() < mirror.expect) { mirror.expect = 0; return true; }
    return false;
  }

  /** 取 DSH 消息正文（与悬浮球 extractText 同一套：只取 content 里 type=text 的块） */
  function textOfMessage(msg) {
    if (!msg || !Array.isArray(msg.content)) return '';
    return msg.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('').trim();
  }

  /** 新一轮：只加一次「正在处理中…」（用本地轮序当去重标记，不依赖悬浮球） */
  function openTurn() {
    if (mirror.open) return;
    mirror.open = true;
    mirror.seq += 1;
    pushProcessing('mirror-' + mirror.seq);
  }

  function markPushed(id) {
    if (id == null) return;
    mirror.pushed.set(id, 1);
    while (mirror.pushed.size > 20) mirror.pushed.delete(mirror.pushed.keys().next().value);
  }

  /** 上一轮若没收到 `turn/end`（断线、宿主崩）⇒ 把已攒的正文补推，别让它烂在缓冲里 */
  function flushStale() {
    if (!mirror.turns.size) return;
    for (const v of mirror.turns.values()) if (v) pushOutput(v);
    mirror.turns.clear();
    mirror.lastTurnId = null;
  }

  /** `session/event` → 面板（只认悬浮球/面板正在用的那个会话） */
  function onSessionEvent(p) {
    const ev = p.event || {};
    const d = ev.data || {};
    const sid = p.sessionId || null;
    const mine = deps.getSessionId ? deps.getSessionId() : null;
    if (sid && mine && sid !== mine) return;                 // 别的会话 ⇒ 不进面板
    const idle = Date.now() - (mirror.lastAt || 0);          // 距上一次会话事件多久（先算再更新）
    mirror.lastAt = Date.now();
    switch (ev.type) {
      case 'user/message': {                                 // 用户消息（谁打的都算）
        // 新一轮：若上一轮明显已经死了（turn/end 丢了）⇒ 先补推它的正文，再重新报「处理中」。
        // 反过来，正在跑的那一轮（事件还在来）不打断 —— queue 模式排队时就是这种情况。
        if (mirror.open && idle > STALE_MS) {
          flushStale();
          mirror.open = false;
        }
        const t = textOfMessage(d.message);
        if (t && !isPanelEcho(t)) emit({ kind: 'append', text: '< ' + t });
        openTurn();
        break;
      }
      // 助手正文：逐块累积，不流式推。
      // ⚠️ **双名兼容（2026-09-18 预检结论）**：现役 host（0.1.0-rc.5）发 `assistant/chunk`，
      //    而 0.1.5-rc.2 的 SessionEventMap 里已无此名、客户端侧出现 `assistant/live-chunk`
      //    ⇒ 两个名字都收；形状也容忍三种：`{chunk:{type,text}}` / `{type,text}` / `{stream:[{type,text}]}`。
      //    这样升级前后**同一份代码都能跑**（升级当天只需抓帧确认走的是哪一支）。
      case 'assistant/chunk':
      case 'assistant/live-chunk': {
        const parts = Array.isArray(d.stream) ? d.stream : (d.chunk ? [d.chunk] : (d.type ? [d] : []));
        let text = '';
        for (const c of parts) {
          if (!c || c.type !== 'text-delta') continue;        // reasoning-delta 一律丢
          text += String(c.text == null ? '' : c.text);
        }
        if (!text) break;
        const id = d.turn == null ? null : String(d.turn);
        if (id != null) {
          mirror.turns.set(id, (mirror.turns.get(id) || '') + text);
          mirror.lastTurnId = id;
        }
        openTurn();                                          // 没收到 user/message 的轮也补一次
        break;
      }
      case 'assistant/message': {                            // 兜底：这一轮没见到 chunk（重连/回放）
        const id = d.turn == null ? null : String(d.turn);
        if (id != null && (mirror.turns.has(id) || mirror.pushed.has(id))) break;
        const t = textOfMessage(d.message);
        if (!t || t === state.lastOut) break;                // 与上一条逐字相同 ⇒ 判重复
        pushOutput(t);
        markPushed(id);
        break;
      }
      case 'turn/end': {                                     // 一轮结束 ⇒ 一次性给全文
        const id = d.turn != null ? String(d.turn) : mirror.lastTurnId;
        let text = '';
        if (id != null && mirror.turns.has(id)) { text = mirror.turns.get(id); mirror.turns.delete(id); }
        else if (id == null) { for (const v of mirror.turns.values()) text += v; mirror.turns.clear(); }
        if (text) { pushOutput(text); markPushed(id); }
        mirror.open = false;
        mirror.lastTurnId = null;
        break;
      }
      case 'stream/error': {                                 // 出错收尾 ⇒ 清干净，下一轮重新报
        mirror.open = false;
        mirror.lastTurnId = null;
        mirror.turns.clear();
        break;
      }
      default: break;
    }
  }

  function onMuxFrame(frame) {
    if (!state.ready || !frame || typeof frame !== 'object') return;
    const p = frame.payload || frame;
    try {
      if (p.type === 'session/event') { onSessionEvent(p); return; }
      /* 「已解决」——由客户端在**提交成功后本地广播**（`main.js` 的 `dshRespond`）：
       * 旧协议里这是**宿主**推的（`question/resolved` / `approval/resolved`），而 0.1.5-rc.2 的
       * `$events` **只在撤销时**发 `{type:'cancel'}`、答完不发 ⇒ 若不由客户端补这一帧，
       * 就会"**一边答了、另一边还留着那道题**"（用户 2026-09-21 实测：面板答完，悬浮球卡在选项处）。
       * 这里按 `askId` 精确忘掉那一道题 + 通知面板把那一行清掉。 */
      if (p.type === 'question/resolved' || p.type === 'approval/resolved') {
        const id = p.askId === undefined || p.askId === null ? null : String(p.askId);
        if (id) {
          forgetAsk(id);
          if (state.pending && (String(state.pending.questionId) === id || String(state.pending.approvalId) === id)) state.pending = null;
          clearAsk(id);
        } else {
          state.pending = null;
        }
        return;
      }
      // ⚠️ 提问/确认也**按会话过滤**（2026-09-17 用户实测："它一直在问我上个工程的问题"）：
      //   旧会话没被停掉时，它每次提问都会广播到客户端 ⇒ 面板/球里冒出**别的会话**的题。
      //   只在"客户端还没绑定任何会话"时放行（保留原来的 fail-safe：没绑定时不能把题吞掉）。
      if (p.type === 'question/requested' || p.type === 'approval/requested') {
        const mine = deps.getSessionId ? deps.getSessionId() : null;
        if (mine && p.sessionId && p.sessionId !== mine) {
          log('[panel] 忽略别的会话的提问（' + p.sessionId + ' ≠ ' + mine + '）');
          return;
        }
      }
      if (p.type === 'question/requested') {
        const qs = Array.isArray(p.questions) ? p.questions : [];
        if (!qs.length) return;
        // 整批一次登记、逐题收集（宿主要求一次应答覆盖整批 —— 见 batchRecord 头注释）
        const rec = batchRecord(frame.rpcId, p.sessionId, qs);
        rememberAsk(rec);
        state.pending = { kind: 'question', rpcId: frame.rpcId, sessionId: p.sessionId, questionId: rec.questionId };
        if (qs.length > 1) log(`[panel] 收到 ${qs.length} 道题 ⇒ 逐题问、最后一次性应答`);
        pushAsk(askPatch(rec));
      } else if (p.type === 'approval/requested') {
        state.pending = { kind: 'approval', rpcId: frame.rpcId, sessionId: p.sessionId, approvalId: p.approvalId };
        rememberAsk({ id: String(p.approvalId), kind: 'approval', rpcId: frame.rpcId, sessionId: p.sessionId,
                      approvalId: p.approvalId, at: Date.now() });
        pushAsk({
          id: p.approvalId, seq: frame.rpcId,
          title: T('panel.approvalTitle', p.toolName || '?') + (p.reason ? '（' + p.reason + '）' : ''),
          options: [{ id: 'allow', label: T('panel.allow') }, { id: 'deny', label: T('panel.deny') }],
          multi: false, textInput: null,
        });
      }
    } catch (e) { log('[panel] onMuxFrame 异常（已忽略）：' + e.message); }
  }

  /* ── 面板事件 → 会话 ───────────────────────────────────────── */
  async function handlePanelEvent(ev) {
    const kind = String(ev.kind || '');
    if (kind === 'input') {
      const text = String(ev.text || '').trim();
      if (!text) return;
      log('[panel] 用户输入：' + text.slice(0, 60));
      notePanelAct(text);                      // 面板已本地回显 `< xxx` ⇒ 镜像时不再重复
      await deps.sendPrompt(text);
      return;
    }
    if (kind === 'answer') {
      const picked = Array.isArray(ev.picked) ? ev.picked : [];
      const custom = String(ev.text || '');
      notePanelAct('');                        // 面板已显示「✓ 已提交…」⇒ 弱去重窗口内不回显
      // ⚠️ **按 askId 精确对上那道题**（面板发的就是 askId）：只认"当前 pending"会把票投给下一题
      const { ask: pend, byId } = resolveAsk(ev.askId);
      if (!pend) {                       // 台账里也没有 ⇒ 只能当普通输入（并把话说明白，别静默）
        const text = picked.join('、') + (custom ? '（' + custom + '）' : '');
        log('[panel] 答题对不上任何题目（askId=' + String(ev.askId || '无') + '）⇒ 当成普通输入处理');
        if (text) await deps.sendPrompt(text);
        return;
      }
      if (!byId) log('[panel] 答题没带 askId 或对不上台账 ⇒ 退回当前 pending（' + pend.kind + '）');
      const askId = pend.questionId !== undefined ? pend.questionId : pend.approvalId;
      if (pend.kind === 'approval') {
        const allow = picked.indexOf('allow') >= 0;
        const r = await deps.respond(pend.rpcId, {
          sessionId: pend.sessionId, approvalId: pend.approvalId,
          outcome: allow ? 'allowed-once' : 'rejected',
        });
        if (r && r.accepted === false) {
          log('[panel] ⚠️ 确认应答被宿主拒绝（reason=' + (r.reason || '?') + '）');
          emit({ kind: 'append', text: T('panel.answerRejected', r.reason || '?') });
        }
        forgetAsk(askId);                        // 这道题结清了，台账里划掉
        if (state.pending && state.pending.approvalId === pend.approvalId) state.pending = null;
        clearAsk(askId);                         // 只清这道题（桥按 id 比对，不会清掉更新的一道）
        return;
      }
      // 提问：走**多题批次**（逐题收集、最后一次总应答；单题就是 total===1 的退化情形）
      if (!pend.batch) {
        // 理论上不会发生（question 一律经 batchRecord 登记）；真遇到了就别静默
        log('[panel] ⚠️ 提问记录缺 batch（旧格式台账？）⇒ 按单题处理');
        pend.batch = { total: 1, index: 0, answers: [], questions: [{ id: pend.questionId, multiSelect: false, options: [] }] };
      }
      await advanceQuestion(pend, answerItem(pend, picked, custom));
      return;
    }
    if (kind === 'skip') {
      const { ask: pend } = resolveAsk(ev.askId);      // 跳过也要对上是哪道题
      notePanelAct('');                        // 面板已显示「» 已跳过…」
      if (pend && pend.kind === 'question') {
        // 跳过 = 空选择：让 agent 自行决定（用户 2026-09-15 定的语义）
        // 多题批次里"跳过"只跳过**当前这一题**，其余照问（最后仍一次总应答整批）
        if (!pend.batch) {
          pend.batch = { total: 1, index: 0, answers: [], questions: [{ id: pend.questionId, multiSelect: false, options: [] }] };
        }
        await advanceQuestion(pend, { id: pend.batch.questions[pend.batch.index].id, selected: [] });
      } else if (pend && pend.kind === 'approval') {
        const r = await deps.respond(pend.rpcId, { sessionId: pend.sessionId, approvalId: pend.approvalId, outcome: 'rejected' });
        if (r && r.accepted === false) {
          log('[panel] ⚠️ 跳过（拒）应答被宿主拒绝（reason=' + (r.reason || '?') + '）');
          emit({ kind: 'append', text: T('panel.answerRejected', r.reason || '?') });
        }
        forgetAsk(pend.approvalId);
        if (state.pending && state.pending.approvalId === pend.approvalId) state.pending = null;
        clearAsk(pend.approvalId);
      } else {
        await deps.cancel();
      }
      return;
    }
    if (kind === 'stop') { await deps.cancel(); return; }
  }

  function pump() {
    try {
      const file = inPath();
      if (!fs.existsSync(file)) { state.offset = 0; return; }
      const st = fs.statSync(file);
      if (st.size < state.offset) state.offset = 0;          // 文件被重建
      if (st.size === state.offset) return;
      const fd = fs.openSync(file, 'r');
      const len = st.size - state.offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, state.offset);
      fs.closeSync(fd);
      state.offset = st.size;
      saveOffset();                                          // 落盘：下次启动从这里续，不重放
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        let ev = null;
        try { ev = JSON.parse(line); } catch { log('[panel] 面板事件不是合法 JSON，已跳过'); continue; }
        Promise.resolve(handlePanelEvent(ev)).catch((e) => log('[panel] 处理面板事件失败：' + e.message));
      }
    } catch (e) { log('[panel] 轮询面板事件异常（已忽略）：' + e.message); }
  }

  function start(host) {
    if (state.ready && state.host === host) return;
    stop();
    state.host = host === 'ix' ? 'ix' : 'sv';
    state.offset = 0;
    state.ready = true;
    loadOffset();                                   // 从落盘偏移恢复（没有则跳历史，防重放）
    loadAsks();                                     // 恢复题目台账（重启后仍能答对那一道）
    state.timer = setInterval(pump, POLL_MS);
    if (state.timer.unref) state.timer.unref();
    beat();                                        // 立即报一次在线
    state.beatTimer = setInterval(beat, 5000);
    if (state.beatTimer.unref) state.beatTimer.unref();
    log(`[panel] 面板链路已启动（host=${state.host} · ${inPath()}）`);
  }
  function stop() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (state.beatTimer) { clearInterval(state.beatTimer); state.beatTimer = null; }
    if (state.host) { try { fs.unlinkSync(presencePath()); } catch { /* 文件可能不存在 */ } }
    state.ready = false;
    state.host = null;
  }

  return { start, stop, onMuxFrame, pushProcessing, pushOutput, pushAsk, clearAsk,
           resetTurn: () => { state.lastTurn = null; mirror.open = false; },
           /** 仅测试用（`tools/test-panel-align.cjs`）：生产路径走 jsonl 轮询与 mux */
           __test: { handlePanelEvent, onSessionEvent, pump },
           get status() { return { ready: state.ready, host: state.host, pending: state.pending ? state.pending.kind : null }; } };
}

module.exports = { createPanelBridge };
