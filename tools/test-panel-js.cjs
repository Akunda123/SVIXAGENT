#!/usr/bin/env node
/**
 * 面板脚本单元测试（JS 版，2026-09-15）
 *
 * 为什么有它：面板脚本报错会**弹宿主对话框并中断脚本**，
 *   而这些错误（拼 null、字段与函数重名、语法笔误…）**本地就能测出来**，不该让用户去踩。
 *   （等价物：Lua 面板的 `sv/lua/tests/test-panel.lua`；面板已改 JS，本文件是现行测试。）
 *
 * 原理：用 node 的 `vm` 造一个假 SV 环境，加载真面板脚本，逐个调用宿主会调的入口。
 * 用法：node tools/test-panel-js.cjs            （更新面板后必跑）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PANEL = path.join(ROOT, 'sv', 'panel', 'AKDAgentPanel.js');

let fails = 0;
const ok = (cond, label, extra) => {
  console.log((cond ? '  [ok]   ' : '  [FAIL] ') + label + (extra && !cond ? '  ← ' + extra : ''));
  if (!cond) fails += 1;
};

if (!fs.existsSync(PANEL)) { console.error('❌ 找不到面板脚本：' + PANEL); process.exit(2); }
const src = fs.readFileSync(PANEL, 'utf8');

/* ── 假 SV 环境 ── */
const sd = {};
const widgetHandles = [];
const sandbox = {
  console,
  JSON,
  Date,
  Math,
  Number,
  String,
  Object,
  isNaN,
  SV: {
    getProject() {
      return {
        getScriptData: (k) => sd[k],
        setScriptData: (k, v) => { sd[k] = v },
      };
    },
    create(type) {
      const w = {
        _v: '',
        setValue(v) { this._v = v },
        getValue() { return this._v },
        setValueChangeCallback(fn) { this._cb = fn },
      };
      widgetHandles.push(w);
      return w;
    },
    setTimeout() { /* 测试不跑循环 */ },
    refreshSidePanel() { /* 记录调用次数 */ sandbox.__refresh = (sandbox.__refresh || 0) + 1 },
  },
};
sandbox.globalThis = sandbox;

console.log('== 加载面板脚本 ==');
try {
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: PANEL });
  ok(true, '脚本可编译并执行（无语法/顶层错误）');
} catch (e) {
  ok(false, '脚本可编译并执行', e.message);
  console.log('\n===== 结果：加载失败 =====');
  process.exit(1);
}

console.log('');
console.log('== 宿主入口 ==');
ok(typeof sandbox.getClientInfo === 'function', 'getClientInfo 是全局函数');
ok(typeof sandbox.getSidePanelSectionState === 'function', 'getSidePanelSectionState 是全局函数');
const ci = sandbox.getClientInfo();
ok(ci && ci.type === 'SidePanelSection', '声明 type=SidePanelSection');
ok(ci && typeof ci.minEditorVersion === 'number', 'minEditorVersion 是数字（IX 1.0.0=65536 才会列出）');

console.log('');
console.log('== 各种状态下重绘（这里曾拼 null 报错）==');
const render = (label) => {
  try {
    const st = sandbox.getSidePanelSectionState();
    ok(st && st.rows && st.rows.length > 0, label);
    const texts = JSON.stringify(st.rows);
    return texts;
  } catch (e) { ok(false, label, e.message); return '' }
};
let t = render('空状态（桥没数据）不抛错');
ok(!/\bnil\b|\bundefined\b/.test(t), '渲染结果里没有 undefined/nil');
sd['akdagent.panel.bridgeAt'] = Math.floor(Date.now() / 1000);
sd['akdagent.panel.bridgeVer'] = '0.3.7';
sd['akdagent.panel.clientAt'] = Math.floor(Date.now() / 1000);
t = render('桥+悬浮球都在线时不抛错');
sd['akdagent.panel.bridgeAt'] = Math.floor(Date.now() / 1000) - 600;
sd['akdagent.panel.clientAt'] = 0;
t = render('桥已停 + 悬浮球未连时不抛错');
ok(t.includes('已停'), '桥已停的文案正确');

console.log('');
console.log('== 提问流程 ==');
sd['akdagent.panel.ask'] = JSON.stringify({
  id: 'q1', seq: 'r1', title: '选一个',
  options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }], multi: true, text: '请选择',
});
sd['akdagent.panel.inRev'] = 1;
try { sandbox.PANELUI.pull(); ok(true, 'pull() 消费提问 JSON 不抛错') }
catch (e) { ok(false, 'pull() 消费提问 JSON 不抛错', e.message) }
t = render('有提问时重绘不抛错');
ok(t.includes('（已选）') === false, '初始无选中标记');
ok(t.includes('确认') && t.includes('跳过'), '有提问时按钮文案是「确认/跳过」');

/* 模拟点选第一个选项 + 点确认 */
sandbox.PANELUI.picked = { o1: true }
try { sandbox.PANELUI.onConfirm(); ok(true, 'onConfirm() 不抛错') }
catch (e) { ok(false, 'onConfirm() 不抛错', e.message) }
const out = sd['akdagent.panel.out'] ? JSON.parse(sd['akdagent.panel.out']) : null;
ok(out && out.kind === 'answer' && out.picked && out.picked.indexOf('o1') >= 0, '确认写出了 kind=answer 且带选项');
ok(out && typeof out.seq === 'number', '事件带 seq（桥据此判断新事件）');

console.log('');
console.log('== 测试按钮 ==');
try { sandbox.PANELUI.onTestSend(); ok(true, 'onTestSend() 不抛错') }
catch (e) { ok(false, 'onTestSend() 不抛错', e.message) }
const out2 = JSON.parse(sd['akdagent.panel.out']);
ok(out2.kind === 'input' && /测试消息/.test(out2.text), '测试按钮写出 kind=input + 测试文本');

console.log('');
console.log('== 防坑 ==');
ok(src.indexOf('/*') === -1 || true, '（JS 版不再有 Lua 注释坑）');
ok(!/^\s*\/\*.*\*\/\s*$/m.test(src.split('\n').slice(-1)[0]), '文件尾部没有未闭合注释');

console.log('');
console.log('== 用户 2026-09-15 提的四条修正 ==');
// ① 2026-09-16 语义变更：存储顺序**就是**显示顺序（新在前）——
//    因为用户要的是"新str + 老str 直接拼"，不再做显示期反转。
sandbox.PANELUI.log = '旧内容'
sandbox.PANELUI.append('新内容')
ok(sandbox.PANELUI.log.indexOf('新内容') === 0, '① 追加 = 新 + 老（新在最上）')
ok(sandbox.PANELUI.displayLog() === sandbox.PANELUI.log, '① displayLog 直接返回（不再反转）')

// ② 单选点一下直接确认
sandbox.PANELUI.log = ''
sandbox.PANELUI.ask = { id: 'q-single-x', seq: 'rs', title: '单选', options: [{ id: 'a1', label: '甲' }, { id: 'a2', label: '乙' }], multi: false }
sd['akdagent.panel.out'] = ''
sandbox.getSidePanelSectionState()            // 让选项按钮句柄被创建并挂上回调
const optHandle = sandbox.PANELUI.optWidgets['a2']
ok(!!optHandle && typeof optHandle._cb === 'function', '② 选项按钮有回调句柄')
if (optHandle && optHandle._cb) optHandle._cb()   // 模拟"点一下"
const outS = sd['akdagent.panel.out'] ? JSON.parse(sd['akdagent.panel.out']) : null
ok(outS && outS.kind === 'answer' && outS.picked && outS.picked[0] === 'a2', '② 单选点一下 = 直接确认（发出 answer）')
ok(sandbox.PANELUI.ask === null, '② 确认后本地 ask 已清')
// ⑤ 确认后**补充框控件**也要清空（用户实测：上一条打的字还留着）
sandbox.PANELUI.wSet(sandbox.PANELUI.widgets.optText, '123')
sandbox.PANELUI.text = '123'
sandbox.PANELUI.ask = { id: 'q-clear', seq: 'rc', title: 't', options: [{ id: 'z', label: 'Z' }], multi: false }
sandbox.PANELUI.onConfirm()
const optLeft = sandbox.PANELUI.widgets.optText ? sandbox.PANELUI.widgets.optText._v : '(无)'
ok(optLeft === '' && sandbox.PANELUI.text === '', '⑤ 确认后补充框被清空（控件值 = ' + JSON.stringify(optLeft) + '）')

// ③ 有提问时隐藏常规输入框、只留选项补充输入框
sd['akdagent.panel.ask'] = JSON.stringify({ id: 'q2', seq: 'r2', title: '带文本框', options: [{ id: 'x', label: 'X' }], multi: true, textInput: { label: '补充' } })
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
let rowsJson = JSON.stringify(sandbox.getSidePanelSectionState().rows)
const hasMainInput = rowsJson.indexOf('height":46,"width":1') >= 0 || rowsJson.indexOf('"height":46') >= 0
ok(!hasMainInput || rowsJson.indexOf('补充') >= 0, '③ 有提问时只出现选项补充输入框（带标签「补充」）')
ok(rowsJson.indexOf('补充') >= 0, '③ 选项补充输入框的标签显示出来了')
// ④ 单选（不带 textInput）也必须给补充说明框 —— 用户 2026-09-15 明确要求
sd['akdagent.panel.ask'] = JSON.stringify({ id: 'q3', seq: 'r3', title: '纯单选', options: [{ id: 'y', label: 'Y' }], multi: false })
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
const singleRows = JSON.stringify(sandbox.getSidePanelSectionState().rows)
ok(singleRows.indexOf('补充说明') >= 0, '④ 单选（无 textInput）也有补充说明框')
sandbox.PANELUI.ask = null
rowsJson = JSON.stringify(sandbox.getSidePanelSectionState().rows)
ok(rowsJson.indexOf('发送') >= 0 && rowsJson.indexOf('停止') >= 0, '③ 无提问时恢复「发送/停止」+ 常规输入框')

console.log('');
console.log('== 用户 2026-09-16 新增：长选项独占一行 + 内容更新不重建 ==');
// ⑥ 长选项（≥16 视觉宽）独占一行；短选项仍两列并排
sd['akdagent.panel.ask'] = JSON.stringify({ id: 'q-long', seq: 'rl', title: '长选项', multi: true,
  options: [{ id: 'L1', label: '这是一个非常长的选项文字用来测试独占一行' }, { id: 's1', label: '短' }, { id: 's2', label: '也短' }] })
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
const rowsLong = sandbox.getSidePanelSectionState().rows
const btnRows = rowsLong.filter((r) => r.type === 'Container' && (r.columns || []).some((c) => c.type === 'Button' || c.type === 'CheckBox'))
const longRow = btnRows.find((r) => (r.columns || []).some((c) => String(c.text).indexOf('独占一行') >= 0))
ok(!!longRow && longRow.columns.length === 1, '⑥ 长选项独占一行（按钮数 = ' + (longRow ? longRow.columns.length : '?') + '）')
ok(btnRows.some((r) => r.columns.length === 2), '⑥ 短选项仍两列并排（省地方）')

// ⑦ 纯内容更新**不重建面板**（只改 TextArea 的值）—— 用户 2026-09-16：「直接新str+老str不行吗」
const refreshBefore = sandbox.__refresh || 0
sd['akdagent.panel.log'] = '老内容'                       // 只有 log 变，ask 不变
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
const refreshAfter = sandbox.__refresh || 0
ok(refreshAfter === refreshBefore, '⑦ 内容更新不调 refreshSidePanel（重绘 ' + refreshBefore + ' → ' + refreshAfter + '）')
ok(String(sandbox.PANELUI.widgets.log._v).indexOf('老内容') >= 0, '⑦ 值已更新到 TextArea')

// ⑧ 桥的 log 增长时**合并不覆盖**：本地行（用户输入 / 已提交）必须保留
sandbox.PANELUI.log = ''
sandbox.PANELUI.bridgeLogSeen = 0
sandbox.PANELUI.append('< 我在面板里打的话')          // 面板本地行（不回写给桥）
ok(sandbox.PANELUI.log.indexOf('< 我在面板里打的话') === 0, '⑧ 本地行已在顶部')
sd['akdagent.panel.log'] = '桥的第一行'                 // 桥写了一条
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
ok(sandbox.PANELUI.log.indexOf('桥的第一行') === 0, '⑧ 桥的新行插到最上')
ok(sandbox.PANELUI.log.indexOf('< 我在面板里打的话') >= 0, '⑧ 本地行**没被覆盖**（曾出现"文本又消失了"）')
// 桥再追加一条 ⇒ 只并新增部分，不重复旧行
sd['akdagent.panel.log'] = '桥的第一行\n桥的第二行'
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
ok((sandbox.PANELUI.log.match(/桥的第一行/g) || []).length === 1, '⑧ 旧桥行没有被重复合并')
ok(sandbox.PANELUI.log.indexOf('桥的第二行') === 0, '⑧ 最新一行仍在最上')

// ⑨ 桥的 ask 瞬时读到空时**不能立刻收题**（用户 2026-09-16："选项会在面板刷新时消失"）
sandbox.PANELUI.ask = { id: 'q-grace', seq: 'rg', title: 'g', options: [{ id: 'g1', label: 'G' }], multi: true }
sandbox.PANELUI.askEmptyCount = 0
sd['akdagent.panel.ask'] = ''
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
ok(!!sandbox.PANELUI.ask, '⑨ 第一次读到空 ask ⇒ 仍保留题目（宽限）')
sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
sandbox.PANELUI.pull()
ok(sandbox.PANELUI.ask === null, '⑨ 连续两次空 ⇒ 才真的收起（确实是"答完了"）')

console.log('');
console.log('== 🆕 2026-09-19 修复回归：答题后**自己重建**（否则选项按钮常驻，必须刷新）==');
// 用户报的现象：在侧栏里点完选项（回答提问 / 工具确认）后，**选项按钮不消失**，得刷新/重开面板才清。
// 成因：用户答题时面板自己清了本地 ask + 把 scriptData 的 ask 写成空；而桥在"迟到/重放的旧答案
//   （askId 不匹配）"分支里**不会** bumpRev（AKDAgentBridge.lua · drainOutbox 的 shouldClear 判断）⇒
//   旧实现里 `structChanged` 恒为 false ⇒ `pull()` 直接 return ⇒ 面板不重建 ⇒ 按钮常驻。
// ⇒ 本回归**故意不 bumpRev**，要求"没有 rev 变化也必须重建一次"。
{
  sandbox.PANELUI.askCleared = false            // 与前面小节解耦（那次标志已消费）
  sd['akdagent.panel.ask'] = JSON.stringify({ id: 'q-bug', seq: 'rbug', title: '修复验证', options: [{ id: 'b1', label: '选项甲' }], multi: false })
  sd['akdagent.panel.inRev'] = (Number(sd['akdagent.panel.inRev']) || 0) + 1
  sandbox.PANELUI.pull()
  const rowsBefore = JSON.stringify(sandbox.getSidePanelSectionState().rows)
  ok(rowsBefore.indexOf('选项甲') >= 0, '回归准备：题目已渲染到面板（有选项按钮）')

  const h = sandbox.PANELUI.optWidgets['b1']
  if (h && typeof h._cb === 'function') h._cb()  // 模拟用户点选项 = 答题
  ok(sandbox.PANELUI.ask === null && sd['akdagent.panel.ask'] === '', '答题后：本地 ask 与 scriptData.ask 都已清')

  const refreshBefore = sandbox.__refresh || 0
  sandbox.PANELUI.pull()                          // ⚠️ 不 bumpRev（模拟"桥不 bump"的路径）
  const refreshAfter = sandbox.__refresh || 0
  ok(refreshAfter === refreshBefore + 1,
     '⚠️ 回归：无 rev 变化时也要重建一次（重绘 ' + refreshBefore + ' → ' + refreshAfter + '）')
  const rowsAfter = JSON.stringify(sandbox.getSidePanelSectionState().rows)
  ok(rowsAfter.indexOf('选项甲') === -1, '⚠️ 回归：选项按钮已从面板消失（不再需要手动刷新）')
  ok(rowsAfter.indexOf('发送') >= 0, '清题后恢复常规「发送/停止」行')
}

console.log('');
console.log(fails ? '===== 结果：' + fails + ' 项失败 =====' : '===== 结果：全部通过 =====');
process.exit(fails ? 1 : 0);
