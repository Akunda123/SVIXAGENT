/**
 * AKDAgent 侧栏面板（SidePanelSection）—— JS 版，2026-09-15
 *
 * 为什么面板用 JS 而不是 Lua（2026-09-15 定案）：
 *   ① 面板**没有文件能力**（实测：Lua 面板里 `io` 表存在但 `io.open` 返回 nil）⇒ Lua 唯一的优势（io）等于零；
 *   ② 官方只文档化了 JS 的 SidePanelSection，用户机器上所有侧栏脚本都是 JS；
 *   ③ 我两次在 Lua 里写成 JS 式 `/** *\/` 注释 ⇒ 面板一打开就弹框崩（Lua 只认 `--`）⇒ 换成 JS 消除这一类。
 *   ⇒ **面板 = JS（界面 + scriptData + 定时器）；桥 = Lua（io + 文件 + 中继）。**
 *
 * 与桥的数据契约（与 AKDAgentBridge.lua 的 PANEL.relay() 严格对应，见 docs/SidePanel桥设计.md §2）：
 *   akdagent.panel.log      桥 → 面板   信息框全文
 *   akdagent.panel.ask      桥 → 面板   当前提问 JSON（"" = 无）
 *   akdagent.panel.inRev    桥 → 面板   入向版本号；变了才重绘
 *   akdagent.panel.out      面板 → 桥   一条事件 JSON（input / answer / skip / stop）
 *   akdagent.panel.outSeq   面板 → 桥   事件序号
 *   akdagent.panel.ready    面板 → 桥   挂载自报（桥看到就回「桥连接成功」）
 *   akdagent.panel.bridgeAt / bridgeVer  桥 → 面板  桥的存活时间戳
 *   akdagent.panel.clientAt              桥 → 面板  悬浮球在线时间戳
 *
 * ⚠️ 刷新纪律（用户实测反馈：「不要一直刷新，我没法打字」）：
 *   refreshSidePanel() 会重建整个面板 ⇒ 输入框焦点/内容会被冲掉。
 *   ⇒ ① 状态文案粗粒度（刚刚 / 1 分钟内 / N 分钟前）；② 状态每 5 秒才查；③ **输入框有字时推迟刷新**。
 * ⚠️ 面板脚本报错会弹宿主对话框并中断脚本 ⇒ 所有入口/回调一律 try/catch。
 */
var PANELUI = {
  VERSION: '0.3.0-js',
  log: '',
  inRev: -1,
  outSeq: 0,
  ask: null,
  picked: {},
  text: '',
  greeted: false,
  dirty: true,
  ready: false,
  lastErr: null,
  n: 0,
  statusKeyLast: '',
  pendingRefresh: false,
  widgets: {},
  optWidgets: {},
  optWired: {},          // 哪些选项控件已注册过回调（避免重复注册）
  K: {
    log: 'akdagent.panel.log', ask: 'akdagent.panel.ask', inRev: 'akdagent.panel.inRev',
    out: 'akdagent.panel.out', outSeq: 'akdagent.panel.outSeq', ready: 'akdagent.panel.ready',
    bridgeAt: 'akdagent.panel.bridgeAt', bridgeVer: 'akdagent.panel.bridgeVer', clientAt: 'akdagent.panel.clientAt'
  }
}

/* 会话 id：面板脚本每次加载都换一个 ⇒ 桥用「sid+seq」去重，桥重启不会重放旧事件
   （只靠 seq 不行：面板重载后 seq 会从 1 重新计数，与旧事件撞号 —— 2026-09-15 实测出现重复转发）。 */
PANELUI.sid = (function () {
  try { return String(Date.now()) + '-' + String(Math.floor(Math.random() * 100000)) }
  catch (e) { return 'sid-' + String(new Date().getTime()) }
})()

/* ── 安全工具 ── */
PANELUI.safe = function (fn) {
  try { return fn() } catch (e) { PANELUI.lastErr = String(e && e.message || e); return undefined }
}
PANELUI.get = function (key) {
  try { return SV.getProject().getScriptData(key) } catch (e) { return undefined }
}
PANELUI.set = function (key, value) {
  try { SV.getProject().setScriptData(key, value); return true } catch (e) { return false }
}
PANELUI.wGet = function (w) { try { return w ? w.getValue() : undefined } catch (e) { return undefined } }
PANELUI.wSet = function (w, v) { try { if (w) w.setValue(v); return true } catch (e) { return false } }
PANELUI.wOn = function (w, fn) {
  try { if (w) w.setValueChangeCallback(function () { PANELUI.safe(fn) }); return true } catch (e) { return false }
}
PANELUI.mk = function (type) { try { return SV.create(type) } catch (e) { return null } }
PANELUI.refresh = function () { try { SV.refreshSidePanel() } catch (e) { /* 没有就手动刷新 */ } }

/* 合并刷新：连点选项时**只重建一次**（重建是整面板重排版，选项多时很贵）
   立即刷新的条件：距上次重建 ≥ 120ms；否则排到 80ms 后统一重建一次 */
PANELUI.MIN_REFRESH_MS = 120
PANELUI.refreshSoon = function () {
  var now = Date.now()
  if (!PANELUI.lastRefreshAt || now - PANELUI.lastRefreshAt >= PANELUI.MIN_REFRESH_MS) {
    PANELUI.lastRefreshAt = now
    PANELUI.pendingRefresh = false
    PANELUI.refresh()
    return
  }
  if (PANELUI.refreshTimer) return
  PANELUI.pendingRefresh = true
  PANELUI.refreshTimer = setTimeout(function () {
    PANELUI.refreshTimer = null
    PANELUI.lastRefreshAt = Date.now()
    PANELUI.pendingRefresh = false
    PANELUI.refresh()
  }, 80)
}

/* ── 信息框（本地拼接 + 显示；落盘由桥做）── */
/* ① 存储顺序 = **新在前**（用户 2026-09-16：「直接新str+老str不行吗」）——
   于是"加一行"就是 `新 + 老` 的字符串拼接，**只改 TextArea 的值、不重建面板**。
   （重建 refreshSidePanel 会重排版 + 滚动回顶 + 闪一下；纯内容更新不需要它。） */
PANELUI.displayLog = function () { return String(PANELUI.log || '') }

/* 桥写来的 log 是**时间正序**（它按写入顺序追加）⇒ 显示前倒成"新在前" */
PANELUI.logFromBridge = function (chronological) {
  var lines = String(chronological || '').split('\n')
  lines.reverse()
  return lines.join('\n')
}

/* ⚠️ **合并**桥的 log，不要整段覆盖（用户 2026-09-16 实测："文本又消失了"）：
   面板自己写的行（`< 用户输入`、`✓ 已提交`…）**不会回写**给桥 ⇒ 若拿桥的 log 直接覆盖本地 log，
   这些本地行就被抹掉。这里只把桥 log 的**新增尾部**（时间正序）并到本地 log 的**最上方**。 */
PANELUI.bridgeLogSeen = 0
PANELUI.mergeBridgeLog = function (chronological) {
  var s = String(chronological || '')
  if (s.length < PANELUI.bridgeLogSeen) {         // 桥的 log 被重建/清空 ⇒ 以桥为准（避免错位）
    PANELUI.bridgeLogSeen = s.length
    // ⚠️ 但**桥 log 变空**不当作"以桥为准"（2026-09-17 用户实测："回答完问题面板内容被清了"）：
    //   桥侧 `clear` 已改成只清题目、不动 log（见 AKDAgentBridge.lua · drainInbox）；这里再兜一道，
    //   任何一次误清都不该把"整段会话镜像"整片抹掉 —— 空 log 就保持面板现有内容不动。
    if (s.length === 0) { PANELUI.renderLog(); return }
    PANELUI.log = PANELUI.logFromBridge(s)
    PANELUI.renderLog()
    return
  }
  if (s.length === PANELUI.bridgeLogSeen) return
  var tail = s.slice(PANELUI.bridgeLogSeen)       // 新增部分（正序）
  PANELUI.bridgeLogSeen = s.length
  var lines = tail.split('\n').filter(function (x) { return x.length > 0 })
  for (var i = 0; i < lines.length; i++) {
    PANELUI.log = PANELUI.log ? (lines[i] + '\n' + PANELUI.log) : lines[i]   // 逐行前插 ⇒ 最新在最上
  }
  PANELUI.renderLog()
}

PANELUI.renderLog = function () { PANELUI.wSet(PANELUI.widgets.log, PANELUI.displayLog()) }

PANELUI.append = function (text) {
  if (typeof text !== 'string' || !text) return
  PANELUI.log = PANELUI.log ? (text + '\n' + PANELUI.log) : text   // 新 + 老
  if (PANELUI.log.length > 20000) PANELUI.log = PANELUI.log.slice(0, 20000)
  // ⚠️ 只改值，**不 refresh**：内容更新不该重建面板（否则滚动回顶、闪屏、打断打字）
  PANELUI.renderLog()
  PANELUI.dirty = true
}

/* ── 面板 → 桥 ── */
PANELUI.emit = function (kind, extra) {
  PANELUI.safe(function () {
    PANELUI.outSeq += 1
    var ev = { v: 1, seq: PANELUI.outSeq, sid: PANELUI.sid, kind: kind, at: Math.floor(Date.now() / 1000), panel: PANELUI.VERSION }
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k] } }
    PANELUI.set(PANELUI.K.out, JSON.stringify(ev))
    PANELUI.set(PANELUI.K.outSeq, PANELUI.outSeq)
  })
}
PANELUI.decode = function (s) { try { return JSON.parse(s) } catch (e) { return null } }

/* ── 状态显示（粗粒度 + 每 5 秒才查）── */
PANELUI.bucketOf = function (ts) {
  if (typeof ts !== 'number' || ts <= 0) return 'none'
  var age = Math.floor(Date.now() / 1000) - ts
  if (age < 0) age = 0
  if (age < 15) return 'now'
  if (age < 60) return 'min1'
  return Math.floor(age / 60) + 'min'
}
PANELUI.bucketText = function (b) {
  if (b === 'none') return ''
  if (b === 'now') return '刚刚'
  if (b === 'min1') return '1 分钟内'
  return String(b).replace('min', '') + ' 分钟前'
}
PANELUI.bridgeStatusLine = function () {
  var b = PANELUI.bucketOf(Number(PANELUI.get(PANELUI.K.bridgeAt)))
  var txt = PANELUI.bucketText(b)
  if (b === 'none') return '桥：✗ 未运行 —— 请在宿主里手动运行 AKDAgentBridge.lua'
  if (b === 'now' || b === 'min1') return '桥：✓ 在跑（v' + String(PANELUI.get(PANELUI.K.bridgeVer) || '?') + ' · ' + txt + '）'
  return '桥：⚠️ 已停（最后 ' + txt + '）—— 请手动运行 AKDAgentBridge.lua'
}
PANELUI.clientStatusLine = function () {
  var b = PANELUI.bucketOf(Number(PANELUI.get(PANELUI.K.clientAt)))
  var txt = PANELUI.bucketText(b)
  if (b === 'none') return '悬浮球：✗ 未连接 —— 请打开 AKDAgent 悬浮球'
  if (b === 'now' || b === 'min1') return '悬浮球：✓ 已连接（' + txt + '）'
  return '悬浮球：⚠️ 已断开（最后 ' + txt + '）—— 请重新打开 AKDAgent 悬浮球'
}
PANELUI.statusKey = function () {
  return PANELUI.bucketOf(Number(PANELUI.get(PANELUI.K.bridgeAt))) + '|' +
         PANELUI.bucketOf(Number(PANELUI.get(PANELUI.K.clientAt)))
}
/* 输入框有未发送内容 ⇒ 不能重绘（会打断打字） */
PANELUI.inputBusy = function () {
  var has = function (w) { var v = PANELUI.wGet(w); return typeof v === 'string' && v.replace(/\s/g, '').length > 0 }
  return has(PANELUI.widgets.input) || has(PANELUI.widgets.optText)
}

/* ── 提问 ── */
PANELUI.askText = function (a) {
  if (!a) return null
  var parts = []
  if (a.title) parts.push(a.title)
  var opts = a.options || []
  for (var i = 0; i < opts.length; i++) {
    parts.push((i + 1) + '. ' + opts[i].label + (PANELUI.picked[opts[i].id] ? '（已选）' : ''))
  }
  if (a.textInput) parts.push('（可在下方文本框补充）')
  return parts.join('\n')
}
PANELUI.clearAsk = function () {
  PANELUI.ask = null
  PANELUI.picked = {}
  PANELUI.text = ''
  // ⚠️ 必须**连控件一起清**：只清 PANELUI.text 的话，重绘时 TextArea 仍显示上次打的字
  //    （用户 2026-09-15 实测："上一条输入的 123 还在，没清除"）。
  PANELUI.wSet(PANELUI.widgets.optText, '')
  PANELUI.wSet(PANELUI.widgets.input, '')
  PANELUI.inputBuffer = ''
  PANELUI.dirty = true
  // 🆕 **本地清题 ⇒ 必须自己安排一次"结构重建"**（2026-09-19 bug 修复）。
  //   背景：清题后本地 `PANELUI.ask` 已为 null、桥里的 ask 也被写成空 ⇒ `pull()` 里
  //   `structChanged` 永远为 false ⇒ 直接在 `if (!structChanged) return` 处返回 ⇒
  //   **选项按钮常驻**，用户必须刷新/重开面板才清掉（用户 2026-09-19 实测反馈）。
  //   ⚠️ 旧的 `PANELUI.dirty` 是**只写不读的死标志**（全文件只有赋值、没有读取）⇒ 救不了这个，
  //   所以另立一个**会被 pull() 消费**的一次性标志。
  PANELUI.askCleared = true
}

/* ── 交互 ── */
PANELUI.onConfirm = function () {
  var a = PANELUI.ask
  if (a) {
    var picked = []
    if (a.multi) {
      // 多选：勾选框是**宿主原生状态**（不重建面板），所以确认时直接**读每个勾选框的值**
      var opts = a.options || []
      for (var i = 0; i < opts.length; i++) {
        var w = PANELUI.optWidgets[opts[i].id]
        var v = PANELUI.wGet(w)
        if (v === true || v === 1 || v === 'true') picked.push(opts[i].id)
      }
    }
    if (!picked.length) { for (var id in PANELUI.picked) { if (PANELUI.picked[id]) picked.push(id) } }
    PANELUI.emit('answer', { askId: a.id, picked: picked, text: PANELUI.text || '' })
    PANELUI.append('✓ 已提交：' + (picked.length ? picked.join('、') : '(未选)'))
    PANELUI.clearAsk()
    // ⚠️ 必须**连 scriptData 里的 ask 一起清**：只清本地的话，下次重绘又把它读回来 ⇒
    //    选项按钮永远赖在面板上（用户 2026-09-15 实测反馈「这个选择面板怎么常驻了」）。
    PANELUI.set(PANELUI.K.ask, '')
    PANELUI.answeredSeq = a.seq            // 记住已答过的 seq，防止桥又把同一题推回来
  } else {
    var t = PANELUI.wGet(PANELUI.widgets.input)
    t = (typeof t === 'string' ? t : String(t == null ? '' : t)).replace(/^\s+|\s+$/g, '')
    if (!t) {
      // ⚠️ 绝不静默：没有题目、输入框也空 ⇒ 明确告诉用户（用户 2026-09-16："点确认没反应"，
      //    实际是题目已被清掉 ⇒ 走了这条路 ⇒ 静默 return，看着像坏了）
      PANELUI.append('· 没有可提交的内容：题目已结束，或输入框是空的')
      PANELUI.refreshSoon()
      return
    }
    PANELUI.emit('input', { text: t })
    // 用户输入前缀：**`<`**（用户 2026-09-16 指定，原为 🧑）——像 shell 提示符那样一眼看出"这是我说的话"
    PANELUI.append('< ' + t)
    PANELUI.wSet(PANELUI.widgets.input, '')
    PANELUI.dirty = true
  }
}
PANELUI.onSkip = function () {
  var a = PANELUI.ask
  if (a) {
    PANELUI.emit('skip', { askId: a.id })
    PANELUI.append('» 已跳过（让 agent 自己定）')
    PANELUI.clearAsk()
    PANELUI.set(PANELUI.K.ask, '')          // 同上：清 scriptData，否则选项会"常驻"
    PANELUI.answeredSeq = a.seq
  } else { PANELUI.emit('stop', {}); PANELUI.append('· 已请求停止') }
}
PANELUI.onTestSend = function () {
  var d = new Date()
  var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2), ss = ('0' + d.getSeconds()).slice(-2)
  var t = '测试消息（面板按钮 ' + hh + ':' + mm + ':' + ss + '）'
  PANELUI.emit('input', { text: t })
  PANELUI.append('< ' + t)          // 同 onConfirm：用户输入前缀用 `<`
  PANELUI.dirty = true
  PANELUI.refresh()
}
PANELUI.onRefresh = function () { PANELUI.pull(); PANELUI.refresh() }

/* ── 拉取入向更新（桥写的）── */
PANELUI.pull = function () {
  PANELUI.safe(function () {
    var rev = Number(PANELUI.get(PANELUI.K.inRev))
    if (isNaN(rev)) rev = 0
    // 🆕 **本地刚清过题（用户答题 / 跳过）⇒ 必须强制一次结构重建**（2026-09-19 bug 修复）。
    //   为什么：清题后本地 ask=null、桥的 ask 也成空 ⇒ `structChanged` 永远 false ⇒
    //   在 `if (!structChanged) return` 处直接返回 ⇒ **选项按钮常驻**，用户得刷新/重开面板
    //   才清掉（用户 2026-09-19 实测："答完选项不消失，必须刷新"）。
    //   ⚠️ 必须放在 `rev === inRev` 提前返回**之前**：桥在"迟到/重放的旧答案（askId 不匹配）"
    //   分支里**不会** bumpRev（见 AKDAgentBridge.lua drainOutbox 的 shouldClear 判断），
    //   那种情况下 rev 不变，但用户明明答完了，面板仍必须收起按钮。
    //   ⚠️⚠️ **但绝不能因此跳过本轮的更新处理**：本轮 rev 可能同时带来了**新题/新日志**，
    //   早退会吞掉一次更新（面板测试 ③ 就是被这个抓到的）。⇒ 有新 rev 时照常往下走，
    //   只在末尾借 `structChanged` 走既有的重建出口。
    var localCleared = false
    if (PANELUI.askCleared) {
      PANELUI.askCleared = false
      PANELUI.askEmptyCount = 0
      localCleared = true
      if (rev === PANELUI.inRev) {
        // 没有新 rev ⇒ 只做"本地清题"的重建（重建会冲焦点 ⇒ 先按既有做法写回输入缓冲）
        if (PANELUI.inputBusy() && PANELUI.inputBuffer) PANELUI.wSet(PANELUI.widgets.input, PANELUI.inputBuffer)
        PANELUI.pendingRefresh = false
        PANELUI.refresh()
        return
      }
    }
    if (rev === PANELUI.inRev) return
    PANELUI.inRev = rev
    var log = PANELUI.get(PANELUI.K.log)
    if (typeof log === 'string') PANELUI.mergeBridgeLog(log)   // 合并（不覆盖本地行）
    var askRaw = PANELUI.get(PANELUI.K.ask)
    var structChanged = false
    if (typeof askRaw === 'string' && askRaw.length) {
      PANELUI.askEmptyCount = 0                      // 读到非空 ⇒ 重置"空"计数
      var a = PANELUI.decode(askRaw)
      if (a && typeof a === 'object') {
        // 已经答过/跳过的同一题（按 seq 判）不再显示 —— 防止"选项常驻"
        if (PANELUI.answeredSeq !== undefined && a.seq === PANELUI.answeredSeq) {
          if (PANELUI.ask) structChanged = true
          PANELUI.ask = null
          PANELUI.picked = {}
        } else {
          var same = PANELUI.ask && a.seq === PANELUI.ask.seq
          if (!same) structChanged = true          // 换题 ⇒ 行数变了，必须重建
          PANELUI.ask = a
          if (!same) {
            PANELUI.picked = {}
            PANELUI.text = ''
            PANELUI.wSet(PANELUI.widgets.optText, '')   // 换新题 ⇒ 清掉上一题的补充文字（控件也要清）
          }
        }
      }
    } else if (PANELUI.ask) {
      // 桥的 ask 变空：可能是"用户答完清空"，也可能是**瞬时读到空**（桥正在重写 scriptData、
      // 或清空与推新题之间的空窗）⇒ 只读到一次空就收题会表现为"刷新时选项消失"（用户 2026-09-16 实测）。
      // ⇒ 宽限：**连续两次**拉到空才真的收起。
      PANELUI.askEmptyCount = (PANELUI.askEmptyCount || 0) + 1
      if (PANELUI.askEmptyCount >= 2) {
        PANELUI.ask = null
        PANELUI.picked = {}
        structChanged = true
      }
    } else { PANELUI.askEmptyCount = 0 }
    PANELUI.dirty = true
    // 🆕 本地清过题（答题/跳过）也算**结构变化** ⇒ 必须走下面的重建出口，
    //    否则"桥的 ask 已空 + 本地 ask 已 null"会让 structChanged 一直为 false（2026-09-19 bug）
    if (localCleared) structChanged = true
    // ⚠️ **只有结构变化才重建面板**；纯内容更新上面已用"只改值"的方式走完（用户 2026-09-16 的优化）
    if (!structChanged) return
    // 重建会冲掉输入框焦点 ⇒ 先把正在打的字写回控件，尽量不丢内容
    if (PANELUI.inputBusy() && PANELUI.inputBuffer) {
      PANELUI.wSet(PANELUI.widgets.input, PANELUI.inputBuffer)
    }
    PANELUI.pendingRefresh = false
    PANELUI.refresh()
  })
}

/* ── 循环（面板里定时器可用 —— 探针实测 30 拍 / 500ms）── */
PANELUI.step = function () {
  PANELUI.safe(function () {
    PANELUI.pull()
    PANELUI.n += 1
    if (PANELUI.n % 10 === 0) {                    // 每 5 秒才查一次状态
      var key = PANELUI.statusKey()
      if (key !== PANELUI.statusKeyLast) {
        PANELUI.statusKeyLast = key
        if (!PANELUI.inputBusy()) { PANELUI.dirty = true; PANELUI.refresh() }
      }
    }
    if (PANELUI.pendingRefresh && !PANELUI.inputBusy()) { PANELUI.pendingRefresh = false; PANELUI.refresh() }
    // 兜底：pendingRefresh 挂着超过 ~3 秒也强制刷新一次（任何情况下都不许"永远不刷"）
    if (PANELUI.pendingRefresh) {
      PANELUI.pendingSince = PANELUI.pendingSince || Date.now()
      if (Date.now() - PANELUI.pendingSince > 3000) {
        PANELUI.pendingRefresh = false
        PANELUI.pendingSince = 0
        PANELUI.refresh()
      }
    } else { PANELUI.pendingSince = 0 }
  })
  try { SV.setTimeout(500, PANELUI.step) } catch (e) { /* 定时器没了就停 */ }
}

/* ── 宿主入口 ── */
PANELUI.buildState = function () {
  var rows = []
  // （原最上方的「测试：发送一条消息」按钮已按用户要求删除 —— 2026-09-16；
  //   PANELUI.onTestSend 保留（客户端/我仍可直接调用它发测试消息），但**不再占面板行**）
  rows.push({ type: 'Label', text: PANELUI.bridgeStatusLine() })
  rows.push({ type: 'Label', text: PANELUI.clientStatusLine() })
  rows.push({ type: 'Container', columns: [
    { type: 'TextArea', value: PANELUI.widgets.log, height: 260, width: 1.0, readOnly: true }] })

  var a = PANELUI.ask
  if (a) {
    rows.push({ type: 'Label', text: '— ' + String(a.title || '请选择') + ' —' })
    var opts = a.options || []
    for (var i = 0; i < opts.length; i++) {
      rows.push({ type: 'Label', text: (i + 1) + '. ' + opts[i].label + (PANELUI.picked[opts[i].id] ? '（已选）' : '') })
    }
    var cols = []
    for (var j = 0; j < opts.length; j++) {
      var o = opts[j]
      if (!PANELUI.optWidgets[o.id]) PANELUI.optWidgets[o.id] = PANELUI.mk('WidgetValue')
      if (a.multi) {
        // 多选：用 **CheckBox**（用户 2026-09-16：「不能仅修改button吗」）——
        //   勾选状态由宿主维护在 value 里 ⇒ 用户勾选**不需要重建面板**（Button 的文字改不了，只能整面板重建 ⇒ 卡）。
        //   确认时读 getValue() 即可；长选项同样独占一行。
        var cbText = String(o.label)
        var cb = { type: 'CheckBox', text: cbText, value: PANELUI.optWidgets[o.id], width: 1.0 }
        var cbVisual = cbText.replace(/[^\x00-\xff]/g, '**').length
        if (cbVisual >= (PANELUI.LONG_LABEL || 16)) {
          if (cols.length) { rows.push({ type: 'Container', columns: cols }); cols = [] }
          rows.push({ type: 'Container', columns: [cb] })
        } else {
          cols.push(cb)
          if (cols.length === 2) { rows.push({ type: 'Container', columns: cols }); cols = [] }
        }
      } else {
        // 单选：仍是 Button（点一下直接提交 ⇒ 只需在提交时重建一次）
        // ⚠️ 回调必须注册（且**只注册一次**）——重构时曾整段删掉 ⇒ 按钮点了没反应（测试 ② 抓到）
        if (!PANELUI.optWired[o.id]) {
          PANELUI.optWired[o.id] = true
          ;(function (oid) {
            PANELUI.wOn(PANELUI.optWidgets[oid], function () {
              if (!PANELUI.ask) return
              PANELUI.picked = {}
              PANELUI.picked[oid] = true
              /* ★ 单选：`selected` 与 `custom` **不可并存** —— 宿主 `matchesQuestions()` 对
               *   `multiSelect !== true` 的题明确 `custom !== undefined && selected.length > 0 ⇒ false`，
               *   不匹配的应答会被丢且**该提问永不 resolve**（agent 永久挂起）。
               *   单选又是"点一下直接提交" ⇒ 点选项即视为"选项代替自己写的"：
               *   **连控件一起清**（只清 PANELUI.text 的话 TextArea 里还留着那行字）。
               *   反向（打字就清已选）在 optText 的 wOn 里。与悬浮球同一口径。 */
              if (PANELUI.text) {
                PANELUI.text = ''
                PANELUI.wSet(PANELUI.widgets.optText, '')
              }
              PANELUI.onConfirm()
            })
          })(o.id)
        }
        var btnText = (PANELUI.picked[o.id] ? '（已选）' : '') + String(o.label)
        var btn = { type: 'Button', text: btnText, value: PANELUI.optWidgets[o.id], width: 1.0 }
        var visual = btnText.replace(/[^\x00-\xff]/g, '**').length      // 长选项独占一行（全角按 2 宽算）
        if (visual >= (PANELUI.LONG_LABEL || 16)) {
          if (cols.length) { rows.push({ type: 'Container', columns: cols }); cols = [] }
          rows.push({ type: 'Container', columns: [btn] })
        } else {
          cols.push(btn)
          if (cols.length === 2) { rows.push({ type: 'Container', columns: cols }); cols = [] }
        }
      }
    }
    if (cols.length) rows.push({ type: 'Container', columns: cols })
    // 补充说明框：**只要在提问就一直显示**（用户 2026-09-15："单选应该有个框补充说明用"）
    //   ⇒ 不再依赖题目是否带 textInput；带了就用它的标签，没带用默认文案。
    //   ⚠️ 单选是"点一下直接提交" ⇒ 想补充说明的用户请**先打字再点选项**。
    rows.push({ type: 'Container', columns: [
      { type: 'Label', text: String((a.textInput && a.textInput.label) || '补充说明（单选：与所选选项二选一；多选：可同时用）') }] })
    rows.push({ type: 'Container', columns: [
      { type: 'TextArea', value: PANELUI.widgets.optText, height: 46, width: 1.0 }] })
  } else {
    // ④ 没有提问时才显示常规输入框；**有提问时隐藏它**（用户 2026-09-15：
    //    "选项有时应该隐藏常规输入框，显示选项的补充输入框"），避免出现两个输入框/两块疑似对话框
    rows.push({ type: 'Container', columns: [
      { type: 'TextArea', value: PANELUI.widgets.input, height: 46, width: 1.0 }] })
  }

  rows.push({ type: 'Container', columns: [
    { type: 'Button', text: a ? '确认' : '发送', value: PANELUI.widgets.confirm, width: 0.5 },
    { type: 'Button', text: a ? '跳过' : '停止', value: PANELUI.widgets.skip, width: 0.5 }] })
  rows.push({ type: 'Container', columns: [
    { type: 'Button', text: '刷新', value: PANELUI.widgets.refresh, width: 0.5 }] })
  return { title: 'AKDAgent', rows: rows }
}

function getSidePanelSectionState() {
  var st = PANELUI.safe(PANELUI.buildState)
  if (st && typeof st === 'object' && st.rows) return st
  return { title: 'AKDAgent', rows: [
    { type: 'Label', text: '⚠️ 面板内部错误（已兜住，未中断脚本）：' + String(PANELUI.lastErr) }] }
}

function getClientInfo() {
  try {
    return { name: 'AKDAgent', category: 'AKDAgent', author: 'AKDAgent',
             versionNumber: 30, minEditorVersion: 65536, type: 'SidePanelSection' }
  } catch (e) {
    return { name: 'AKDAgent', category: 'AKDAgent', type: 'SidePanelSection', minEditorVersion: 65536 }
  }
}

/* ── 载入（全 try/catch：面板报错会弹框中断脚本）── */
PANELUI.init = function () {
  PANELUI.widgets.log = PANELUI.mk('WidgetValue')
  PANELUI.widgets.input = PANELUI.mk('WidgetValue')
  PANELUI.widgets.confirm = PANELUI.mk('WidgetValue')
  PANELUI.widgets.skip = PANELUI.mk('WidgetValue')
  PANELUI.widgets.refresh = PANELUI.mk('WidgetValue')
  PANELUI.widgets.optText = PANELUI.mk('WidgetValue')
  PANELUI.wOn(PANELUI.widgets.confirm, PANELUI.onConfirm)
  PANELUI.wOn(PANELUI.widgets.skip, PANELUI.onSkip)
  PANELUI.wOn(PANELUI.widgets.refresh, PANELUI.onRefresh)
  // 主输入框内容也进缓冲：重绘前会写回，避免"为了保护打字反而不刷新"
  PANELUI.wOn(PANELUI.widgets.input, function () {
    var v = PANELUI.wGet(PANELUI.widgets.input)
    PANELUI.inputBuffer = typeof v === 'string' ? v : String(v == null ? '' : v)
  })
  PANELUI.wOn(PANELUI.widgets.optText, function () {
    var v = PANELUI.wGet(PANELUI.widgets.optText)
    PANELUI.text = typeof v === 'string' ? v : String(v == null ? '' : v)
    /* ★ 单选：一打字就清掉已选项（宿主禁止 `custom` 与 `selected` 并存 —— 见选项点击处的注释）。
     *   `refreshSoon` 是防抖刷新，每次按键调也安全；清空后 picked 为空，后续按键不会再触发。 */
    var a = PANELUI.ask
    if (a && a.multi !== true && PANELUI.text && Object.keys(PANELUI.picked || {}).length) {
      PANELUI.picked = {}
      PANELUI.refreshSoon()
    }
  })
  var prev = PANELUI.get(PANELUI.K.log)
  if (typeof prev === 'string') { PANELUI.log = PANELUI.logFromBridge(prev); PANELUI.bridgeLogSeen = prev.length }
  PANELUI.renderLog()
  PANELUI.set(PANELUI.K.ready, PANELUI.VERSION)
  PANELUI.ready = true
  try { SV.setTimeout(500, PANELUI.step) } catch (e) { /* 无定时器：靠手动刷新 */ }
}
PANELUI.safe(PANELUI.init)
