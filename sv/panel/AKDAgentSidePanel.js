/**
 * AKDAgent 侧栏面板（SidePanelSection）—— 2026-09-15 新建
 *
 * 用户 2026-09-15 定的 UI：
 *   ① 一个**长的信息显示文本框**，内容依次追加：桥连接成功 / 用户输入 / 「SV Agent 正在处理中…」/ 输出（**不含 think**）
 *   ② **不流式**：等一轮全部输出完再一次性追加；「正在处理中」在开始处理的一瞬间加，**一轮只加一次**
 *   ③ 下方一个**输入文本框**（不用很长）
 *   ④ 选项（agent 提问 / 工具确认）**动态刷新**（`SV.refreshSidePanel()`）
 *   ⑤ 选项要**先在信息框里重复一遍**（避免 button 文字显示不全）
 *   ⑥ 多选：选中后 button 文字显示「（已选）选项内容」
 *   ⑦ 下方一个**确认键**，一个**跳过键**
 *   ⑧ 选项里的文本输入用文本框
 *   ⑨ 重启/重载后从文件恢复上次内容
 *
 * ⚠️ 关键约束（实测得出，别忘）：
 *   - SV 的 **JS 沙箱没有任何宿主对象**（无 require/process/文件 API）⇒ 面板**不能**直接读写文件。
 *   - 面板与 Lua 桥之间的通道 = **project scriptData**（面板 JS 与桥 Lua 都能读写；用户既有侧栏脚本
 *     `[SV2]音符属性侧栏.js` 就是这么存预设的）。桥负责把 scriptData ↔ 文件（客户端那侧）搬来搬去。
 *   - 控件类型（取自机器上多个真实侧栏脚本，非猜测）：
 *     `Label` / `Container{columns}` / `Button{text,value,width}` / `Slider{...}` /
 *     `TextArea{value,height,width,readOnly}` / `ComboBox{value,choices,height,readOnly}` / `CheckBox{text,value,width}`
 *     —— **长信息框就用 `TextArea` + `readOnly:true` + 大 `height`**（`[SV2]歌词侧栏.js` 是这么用的）。
 *   - 窗口句柄：`SV.create("WidgetValue")` → `getValue()/setValue()/setValueChangeCallback()/setEnabled()`。
 *   - 定时器：`SV.setTimeout(ms, cb)`（SV1 上实测存在但暴露为 userdata；这里只做轮询）。
 *   - 刷新：`SV.refreshSidePanel()`（2.1.2+；先做存在性检查再调，缺失就退化为"不自动刷新"）。
 *
 * 本文件 v1：**UI + scriptData 轮询骨架已写完，尚未真机验收**（测试清单见 docs/SidePanel桥设计.md）。
 */
var PANEL = {
  VERSION: "0.1.0",
  // 通道键（统一前缀，避免与用户自己的 scriptData 撞车）
  K: {
    log: "akdagent.panel.log",       // 面板显示用：累积文本（桥写，面板读）
    ask: "akdagent.panel.ask",       // 选项/提问 JSON（桥写，面板读）
    inRev: "akdagent.panel.inRev",   // 入向版本号（桥每次更新 +1，面板据此判断要不要刷新）
    out: "akdagent.panel.out",       // 面板 → 桥：一次事件 JSON（面板写，桥读完清）
    outSeq: "akdagent.panel.outSeq", // 面板 → 桥：事件序号（面板写，桥据此判断新事件）
    ackSeq: "akdagent.panel.ackSeq", // 桥 → 面板：已处理到的事件序号
    ready: "akdagent.panel.ready",   // 面板自报：本面板已挂载（桥据此知道可以推内容）
  },
  POLL_MS: 400,
  LOG_HEIGHT: 260,       // 长信息框高度（像素）
  INPUT_HEIGHT: 46,      // 输入框高度（"可以不用那么长"）
};

/* ── widget 句柄（顶层创建，符合既有侧栏脚本的写法） ── */
var wLog = SV.create("WidgetValue");       // 信息框内容
var wInput = SV.create("WidgetValue");     // 输入框内容
var wConfirm = SV.create("WidgetValue");   // 确认键
var wSkip = SV.create("WidgetValue");      // 跳过键
var wRefresh = SV.create("WidgetValue");   // 手动刷新键（备用）

/* ── 面板内部状态（不落盘，靠 scriptData 恢复） ── */
var st = {
  log: "",            // 当前显示的全文
  inRev: -1,          // 已消费的入向版本号
  outSeq: 0,          // 本面板已发出的事件数
  ask: null,          // {kind:'ask'|'confirm', title, options:[{id,label}], multi, textInput:{label}|null}
  picked: {},         // 多选：{optionId: true}
  text: "",           // 选项内文本框内容（一次只支持一个文本框，够用）
  mounted: false,
};

function proj() { return SV.getProject(); }
function readK(k) { try { return proj().getScriptData(k); } catch (e) { return undefined; } }
function writeK(k, v) { try { proj().setScriptData(k, v); return true; } catch (e) { return false; } }

/** 刷新面板（存在性检查后再调，2.1.2+ 才有） */
function refresh() {
  try {
    if (typeof SV.refreshSidePanel === "function") { SV.refreshSidePanel(); return true; }
    // 有的版本把可调用成员暴露成 userdata（Lua 侧实测如此），这里退化为直接尝试
    if (SV.refreshSidePanel) { SV.refreshSidePanel(); return true; }
  } catch (e) { /* 忽略 */ }
  return false;
}

/** 追加一行到信息框（**不流式**：一轮结束才调一次；调用后由宿主重绘） */
function appendLog(text) {
  st.log = st.log + (st.log ? "\n" : "") + text;
  writeK(PANEL.K.log, st.log);       // 写回 scriptData ⇒ 重载/重启后可恢复
  wLog.setValue(st.log);
  refresh();
}

/** 发一个事件给桥（桥会落到文件，客户端读走） */
function emit(kind, payload) {
  st.outSeq = st.outSeq + 1;
  var ev = { v: 1, seq: st.outSeq, kind: kind, at: Date.now(), panel: PANEL.VERSION };
  if (payload) { for (var k in payload) { if (payload.hasOwnProperty(k)) ev[k] = payload[k]; } }
  writeK(PANEL.K.out, JSON.stringify(ev));
  writeK(PANEL.K.outSeq, st.outSeq);
  return ev;
}

/** 从 scriptData 取入向更新（桥写入的 log/ask/inRev） */
function pull() {
  var rev = readK(PANEL.K.inRev);
  if (typeof rev !== "number") { rev = 0; }
  if (rev === st.inRev) { return false; }
  st.inRev = rev;

  var log = readK(PANEL.K.log);
  if (typeof log === "string") { st.log = log; wLog.setValue(st.log); }

  var askRaw = readK(PANEL.K.ask);
  if (typeof askRaw === "string" && askRaw.length) {
    try {
      var a = JSON.parse(askRaw);
      // 同一题（用 id/seq 判）不要清掉用户已选项
      var same = st.ask && a && a.seq === st.ask.seq;
      st.ask = a;
      if (!same) { st.picked = {}; st.text = ""; }
    } catch (e) { /* 坏 JSON 就当没有 */ }
  } else if (askRaw === null || askRaw === undefined || askRaw === "") {
    st.ask = null; st.picked = {}; st.text = "";
  }
  refresh();
  return true;
}

/** 轮询：把入向更新拉进来（桥负责往 scriptData 写） */
function tick() {
  try { pull(); } catch (e) { /* 单次失败不影响下一轮 */ }
  try { SV.setTimeout(PANEL.POLL_MS, tick); } catch (e) { /* 定时器没了就停 */ }
}

/* ── 回调 ── */
wConfirm.setValueChangeCallback(function () {
  var a = st.ask;
  var picked = [];
  for (var id in st.picked) { if (st.picked[id]) { picked.push(id); } }
  if (a) {
    emit("answer", { askId: a.id || null, picked: picked, text: st.text || "" });
    appendLog("✔ 已提交：" + (picked.length ? picked.join("、") : "(未选)") + (st.text ? "（文本：" + st.text + "）" : ""));
    st.ask = null; st.picked = {}; st.text = "";
    writeK(PANEL.K.ask, "");
  } else {
    var t = String(wInput.getValue() || "").replace(/^\s+|\s+$/g, "");
    if (!t) { return; }
    emit("input", { text: t });
    appendLog("🧑 " + t);            // 用户输入进信息框（用户 2026-09-15 指定）
    wInput.setValue("");
    refresh();
  }
});

wSkip.setValueChangeCallback(function () {
  var a = st.ask;
  if (a) {
    emit("skip", { askId: a.id || null });
    appendLog("⏭ 已跳过（让 agent 自己定）");
    st.ask = null; st.picked = {}; st.text = "";
    writeK(PANEL.K.ask, "");
  } else {
    emit("stop", {});
    appendLog("⏹ 已请求停止");
  }
  refresh();
});

wRefresh.setValueChangeCallback(function () { pull(); });

/** 选项按钮：点一下切换选中；多选显示「（已选）」，单选直接选 */
function makeOptionButton(opt) {
  var w = SV.create("WidgetValue");
  w.setValueChangeCallback(function () {
    if (!st.ask) { return; }
    if (st.ask.multi) {
      st.picked[opt.id] = !st.picked[opt.id];
    } else {
      st.picked = {};
      st.picked[opt.id] = true;
    }
    refresh();
  });
  return w;
}
var optionWidgets = {};   // optId -> WidgetValue（保持句柄存活，刷新时复用）

/* ── 宿主调用：面板结构 ── */
function getSidePanelSectionState() {
  var rows = [];
  var a = st.ask;

  // ① 长信息框（只读，可滚动；高度给足）
  rows.push({ type: "Container", columns: [
    { type: "TextArea", value: wLog, height: PANEL.LOG_HEIGHT, width: 1.0, readOnly: true }
  ] });

  // ② 选项区（有提问时才有）：先文字重复一遍，再给按钮
  if (a) {
    rows.push({ type: "Label", text: "— " + (a.title || "请选择") + " —" });
    // ⑤ 先在信息框/标签区重复选项文字，避免按钮文字被截断看不到全貌
    for (var i = 0; i < (a.options || []).length; i++) {
      var opt = a.options[i];
      var mark = st.picked[opt.id] ? "（已选）" : "";
      rows.push({ type: "Label", text: (i + 1) + ". " + opt.label + mark });
    }
    // ⑧ 选项内文本输入
    if (a.textInput) {
      rows.push({ type: "Container", columns: [
        { type: "TextArea", value: inputTextWidget(a), height: PANEL.INPUT_HEIGHT, width: 1.0 }
      ] });
    }
    // ⑥ 按钮（多选切换，文字带「（已选）」）
    var cols = [];
    for (var j = 0; j < (a.options || []).length; j++) {
      var o2 = a.options[j];
      if (!optionWidgets[o2.id]) { optionWidgets[o2.id] = makeOptionButton(o2); }
      cols.push({ type: "Button", text: (st.picked[o2.id] ? "（已选）" : "") + o2.label, value: optionWidgets[o2.id], width: 1.0 });
      if (cols.length === 2) { rows.push({ type: "Container", columns: cols }); cols = []; }
    }
    if (cols.length) { rows.push({ type: "Container", columns: cols }); }
  }

  // ③ 输入框（不长）+ ④ 确认/跳过
  rows.push({ type: "Container", columns: [
    { type: "TextArea", value: wInput, height: PANEL.INPUT_HEIGHT, width: 1.0 }
  ] });
  rows.push({ type: "Container", columns: [
    { type: "Button", text: a ? "确认" : "发送", value: wConfirm, width: 0.5 },
    { type: "Button", text: a ? "跳过" : "停止", value: wSkip, width: 0.5 }
  ] });
  rows.push({ type: "Container", columns: [
    { type: "Button", text: "刷新", value: wRefresh, width: 0.5 }
  ] });

  return { title: "AKDAgent", rows: rows };
}

/** 选项内文本框：用独立句柄，内容同步到 st.text */
var _optText = null;
function inputTextWidget(a) {
  if (!_optText) {
    _optText = SV.create("WidgetValue");
    _optText.setValueChangeCallback(function () {
      st.text = String(_optText.getValue() || "");
    });
  }
  return _optText;
}

/** 宿主调用：脚本信息 */
function getClientInfo() {
  return {
    name: "AKDAgent",
    category: "AKDAgent",
    author: "AKDAgent",
    versionNumber: 15,          // 2026-09-15
    // ⚠️ minEditorVersion 决定**宿主会不会列出这个脚本**：
    //   参考脚本 `[SV2]音符属性侧栏.js` 写的是 131330（=2.1.2），但 **IX 只报 1.0.0（=65536）**
    //   ⇒ 照抄会让 IX 里看不到本面板。这里放宽到 1.0.0，`refreshSidePanel`（2.1.2+）
    //   改为**运行时存在性检查**（见 refresh()），没有就退化为"手动点刷新键"。
    minEditorVersion: 65536,
    type: "SidePanelSection"
  };
}

/* ── 启动：自报挂载 + 起轮询 ── */
(function boot() {
  try {
    // 先恢复上次内容（⑨ 从文件恢复：内容是桥写进 scriptData 的）
    var log = readK(PANEL.K.log);
    if (typeof log === "string") { st.log = log; }
    wLog.setValue(st.log);
    wInput.setValue("");
    writeK(PANEL.K.ready, PANEL.VERSION);
    try { writeK(PANEL.K.outSeq, st.outSeq); } catch (e) {}
    st.mounted = true;
    try { SV.setTimeout(200, tick); } catch (e) { /* 无定时器：只能手动点"刷新" */ }
  } catch (e) { /* 启动失败也不要抛，避免宿主弹框 */ }
})();
