#!/usr/bin/env node
/**
 * 悬浮球组合区回归（2026-09-19 新增）
 *
 * 为什么有它：用户 2026-09-19 报的三件事 —— **① 没有中断 ② 没有插话 ③ 提问没有自己输入** ——
 *   全都**不是**后端缺能力，而是 `electron/src/orb.html` 的 UI 缺口：
 *     · `agentCancel` / `agentSend(mode:'queue')` / `agentRespond` 三样后端早就齐；
 *     · 是 orb 页把按钮置灰、把发送静默丢弃、把输入框跟选项做成互斥。
 *   这类缺口**极易回退**：`if (busy) return` 看着很"合理"（防并发嘛），随手就被加回来。
 *   ⇒ 用**源码级断言**钉死。
 *
 * 判据分四组（A 中断 / B 插话 / C 提问自定义输入 / D i18n 键齐全），全部离线、不连宿主、不起 Electron。
 * 用法：`node tools/test-orb-compose.cjs [orb.html 路径]`
 *   （可选参数只为**负向自测**：拿一份改坏的副本跑，确认断言真的会红）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'electron', 'src');
const ORB = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SRC, 'orb.html');
const PRELOAD = path.join(SRC, 'orb-preload.js');
const MAIN = path.join(SRC, 'main.js');
const ORB_I18N = path.join(SRC, 'i18n', 'orb.json');

let fails = 0;
const ok = (cond, label, extra) => {
  console.log((cond ? '  [ok]   ' : '  [FAIL] ') + label + (extra && !cond ? '  ← ' + extra : ''));
  if (!cond) fails += 1;
};

for (const f of [ORB, PRELOAD, MAIN, ORB_I18N]) {
  if (!fs.existsSync(f)) { console.error('❌ 缺文件：' + f); process.exit(2); }
}
const orb = fs.readFileSync(ORB, 'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const main = fs.readFileSync(MAIN, 'utf8');
const i18n = JSON.parse(fs.readFileSync(ORB_I18N, 'utf8'));

/* ═══ A. 中断（用户报的第①件）═══════════════════════════════════════ */
console.log('\nA. 中断（停止本轮）');
ok(/id="chat-stop"/.test(orb), '有 #chat-stop 停止按钮元素');
ok(/window\.akdagent\.agentCancel\(/.test(orb), 'orb 真的**调用**了 agentCancel（不再只是 preload 里躺着）');
ok(/chatStop\.addEventListener\('click',\s*stopTurn\)/.test(orb), '停止按钮绑定到 stopTurn');
ok(/agentCancel:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('akdagent-agent-cancel'\)/.test(preload),
  'preload 暴露 agentCancel → akdagent-agent-cancel');
ok(/ipcMain\.handle\('akdagent-agent-cancel'/.test(main), '主进程注册了 akdagent-agent-cancel');
ok(/dshCall\('session\/cancel',\s*\{\s*request:\s*\{\s*sessionId:/.test(main), '主进程走的是真正的 session/cancel（0.1.5-rc.2 斜杠端点 + request 壳）');
ok(/markTurnActive\(\)[\s\S]{0,200}?function ensureTurn/.test(orb) || /function ensureTurn\(turn\)\s*\{\s*makeTurnActive/.test(orb) || /function ensureTurn\(turn\)\s*\{\s*markTurnActive\(\)/.test(orb),
  'ensureTurn() 里点亮轮次（⇒ **面板发起的轮次**也能停，不只在球上发送时）');
ok(/function markTurnActive\(\)/.test(orb), '有 markTurnActive()（幂等的"轮次活跃"入口）');

/* ═══ B. 插话（用户报的第②件）═══════════════════════════════════════ */
console.log('\nB. 插话（轮次进行中也能发）');
// 反面：老的静默丢弃
ok(!/if\s*\(!t\s*\|\|\s*busy\)\s*return/.test(orb),
  '⚠️ 回归：sendMsg() **没有** `if (!t || busy) return` 这种静默丢弃');
ok(/if\s*\(!t\s*\|\|\s*sending\)\s*return/.test(orb),
  'sendMsg() 只按 sending 防重复提交（agentSessionState 的 await 窗口）');
ok(/let\s+sending\s*=\s*false/.test(orb), '有 sending 状态（与 busy 分离）');
// setSendEnabled 的发送按钮不许再受 busy 影响
const sendFnBody = (orb.match(/function setSendEnabled\(\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
ok(sendFnBody.length > 0, 'setSendEnabled() 是**无参**版本（旧参数 on 已作废）');
ok(/const can = !!agentReady/.test(sendFnBody),
  '发送按钮只看 agentReady（**不再**按 !busy 置灰）', sendFnBody.replace(/\s+/g, ' ').slice(0, 120));
ok(/chatStop\.style\.display = busy/.test(sendFnBody),
  '停止按钮的可见性同处同步（busy ⇒ 显示）');
ok(/appendInfo\('orb\.queued'\)/.test(orb), '插话时给「已排队」回执（不静默）');
ok(/const interject = busy/.test(orb), '发送时判定是否插话（轮次中）');
ok(/if \(!interject\) busy = false/.test(orb),
  '⚠️ 插话失败时**不清 busy**（否则会把还在跑的轮次的"停止"按钮也藏掉）');
// 主进程侧：queue 模式（这是"插话不丢消息"的前提）
// 主进程侧：queue 模式（这是"插话不丢消息"的前提）。
// 0.1.5-rc.2 起 prompt 走 `promptArgs()` 统一组包（斜杠端点 session/prompt + {request:{…}} 壳），
// 所以断言两件事：① 有 promptArgs() 且默认 mode = 'queue'；② 调用点确实是 dshCall('session/prompt', promptArgs(…))
ok(/function promptArgs\([\s\S]{0,160}?mode = 'queue'/.test(main),
  "主进程 promptArgs() 默认 mode='queue'（排队收下，不丢）");
ok(/dshCall\('session\/prompt',\s*promptArgs\(/.test(main),
  '主进程发消息确实走 session/prompt + promptArgs(...)');

/* ═══ C. 提问要有"自己输入"（用户报的第③件）═════════════════════════ */
console.log('\nC. 提问的「自己输入」');
// 反面：旧实现是 if (opts.length>0){...} else { 建 input } —— input 只在无选项时才有
ok(!/\}\s*else\s*\{\s*\n\s*const input = document\.createElement\('input'\)/.test(orb),
  '⚠️ 回归：建 input 的代码**不在** else 分支里（不再与"有选项"互斥）');
ok(/const phKey = opts\.length > 0 \? 'orb\.question\.customPlaceholder' : 'orb\.question\.inputPlaceholder'/.test(orb),
  '有选项时用「自定义/其他」占位符，无选项时用「输入回答」');
ok(/entry\.input = input/.test(orb), '输入框登记进 entry.input（updateSubmit / custom 提交都靠它）');
ok(/\.\.\.en\.selected\]/.test(orb) && /a\.custom = en\.input\.value\.trim\(\)/.test(orb),
  '提交时 selected 与 custom 并存（协议允许：selected 恒存在、可为空数组）');
// ★ 宿主硬校验：单选时 custom 与 selected **不可并存**（dsh-host-apiproxy matchesQuestions L1385）
ok(/const panelActions = panel\.querySelector\(':scope > \.opt-actions'\)/.test(orb),
  '★ 面板级按钮行用 `:scope > .opt-actions` 取**直接子元素**（否则"提交"会落到第 1 题那行）');
ok(!/panel\.querySelector\('\.opt-actions'\)\.appendChild/.test(orb),
  '⚠️ 回归：不再用 `panel.querySelector(\'.opt-actions\')`（多题时会命中第一道题）');
ok(/if \(!q\.multiSelect && entry\.selected\.size > 0\)/.test(orb),
  '★ 单选：打字即清空已选项（custom 与 selected 互斥）');
ok(/if \(entry\.input\) entry\.input\.value = ''/.test(orb),
  '★ 单选：点选项即清空输入框（反向互斥）');

/* ═══ D. i18n 键齐全（四语种必须一致，否则 audit() 会报）══════════════ */
console.log('\nD. i18n（四语种齐全）');
const NEED = ['orb.toolbar.stopTitle', 'orb.err.cancel', 'orb.queued', 'orb.question.customPlaceholder'];
const locales = Object.keys(i18n);
ok(locales.length === 4, '四种语种都在（' + locales.join(' / ') + '）');
for (const key of NEED) {
  const lack = locales.filter((l) => !i18n[l] || i18n[l][key] === undefined);
  ok(lack.length === 0, '键 ' + key + ' 四语种齐全', lack.join(','));
}
const sizes = locales.map((l) => Object.keys(i18n[l]).length);
ok(new Set(sizes).size === 1, '四语种键数一致（' + sizes.join(' / ') + '）');
// orb.html 里用到的键都得存在（防拼错）
const used = [...orb.matchAll(/['"](orb\.[A-Za-z0-9_.]+)['"]/g)].map((m) => m[1]);
const unknown = [...new Set(used)].filter((k) => i18n[locales[0]][k] === undefined);
ok(unknown.length === 0, 'orb.html 用到的 orb.* 键都在字典里', unknown.join(','));

/* ═══ E. 组合区行高固定（用户 2026-09-20：「强行中断的按钮会改变行高」）══════════
 * 背景：停止按钮是靠 `display` 切换出现的（见 setSendEnabled）。原先 `.chat-input` 没有固定行高、
 * 完全靠 flex 各自撑，而 `#chat-stop` 自己的盒模型与兄弟不一致（多 1px 边框 + 12px 字号 + line-height:1）
 * ⇒ 它一出现/消失整行高度就跳。修法 = **行高钉死 + 子元素统一 34px / border-box**；这里钉住这条不变量。 */
console.log('\nE. 组合区行高固定');
{
  const ci = (orb.match(/\.chat-input \{[\s\S]*?\n  \}/) || [''])[0];
  ok(/height:\s*59px/.test(ci) && /box-sizing:\s*border-box/.test(ci),
    '★ .chat-input 行高固定（59 = 子元素 34 + 上下 padding 12×2 + border-top 1；写成 58 会让子元素溢出 1px）',
    ci.replace(/\s+/g, ' ').slice(0, 170));
  ok(/\.chat-input input,\s*\n?\s*\.chat-input button \{[\s\S]*?height:\s*34px/.test(orb),
    '★ 组合区子元素统一 height:34px + border-box（不再靠 flex 各自撑）');
  const stopCss = (orb.match(/#chat-stop \{[\s\S]*?\n  \}/) || [''])[0];
  ok(stopCss.length > 0, '#chat-stop 样式块存在');
  ok(!/padding:\s*\d+px\s/.test(stopCss),
    '⚠️ 回归：#chat-stop 不再带**垂直** padding（会把它自己撑高）', stopCss.replace(/\s+/g, ' '));
  ok(!/(?<![\w-])height\s*:/.test(stopCss),
    '⚠️ 回归：#chat-stop 不自设 height（统一由 .chat-input button 那条给）', stopCss.replace(/\s+/g, ' '));
  /* 用户 2026-09-20 后半句：「发送会在有中断时变成两行」—— 多一个按钮后 flex 把按钮压窄、文字折行。
   * 修法 = 缩的只能是输入框（min-width:0），按钮不伸缩且 nowrap。
   * ⚠️ 断言在**组合区 CSS 区间**内做（按块正则会被合并规则 `.chat-input input,\n  .chat-input button {` 抢先命中）。 */
  const composer = orb.slice(orb.indexOf('.chat-input {'), orb.indexOf('#chat-mic:hover'));
  // ⚠️ 钉**完整声明**：只测 `min-width:\s*0` 会被注释里的字面量满足（负向自测当场抓到过）
  ok(/flex:\s*1 1 auto;\s*min-width:\s*0;/.test(composer),
    '★ 输入框 flex:1 1 auto + min-width:0（否则它不肯缩，压力全给按钮）');
  ok(/flex:\s*0 0 auto/.test(composer) && /white-space:\s*nowrap/.test(composer),
    '★ 按钮 flex:0 0 auto + white-space:nowrap（多一个按钮也不会把"发送"挤成两行）');
}

console.log('');
if (fails) { console.log('===== 结果：' + fails + ' 项失败 ====='); process.exit(1); }
console.log('===== 结果：全部通过 =====');
