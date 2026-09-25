#!/usr/bin/env node
'use strict'
/* DSH 线路形状守卫（静态，不连宿主、不出网）
 *
 * 为什么需要：2026-09-21 升级 0.1.5-rc.2 当天**连续踩了三个同一类 bug** —— 它们都不是
 * "代码写错"，而是**线路形状**（wire shape）错，而这类错误：
 *   · 编译/语法检查看不见（都是合法 JS）；
 *   · 单元测试看不见（要和真宿主对话才暴露）；
 *   · 只有真机发消息/点选项时，宿主才回一句 `gateway/internal`。
 * 所以把已经实测确认的形状**钉成静态断言**，下次谁改回去就当场红。
 *
 * 用法:
 *   node tools/check-dsh-wire.cjs                        # 查仓内 electron/src/main.js + 契约文档
 *   node tools/check-dsh-wire.cjs --file <main.js>       # 查指定文件（负向自测用）
 * 退出码: 0 = 通过; 1 = 有问题
 */
const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const fileFlag = args.indexOf('--file')
const root = path.join(__dirname, '..')
const MAIN = fileFlag >= 0 ? args[fileFlag + 1] : path.join(root, 'electron', 'src', 'main.js')
const DOC = path.join(root, 'docs', 'DSH升级-接口对照.md')

if (!fs.existsSync(MAIN)) {
  console.error('找不到要检查的文件: ' + MAIN)
  process.exit(1)
}
const src = fs.readFileSync(MAIN, 'utf8')
const problems = []

/* ① `$events/result`（waterfall 回执）的载荷形状：
 *    宿主 parseRemoteEventResultPayload() 要求 payload **恰好只有 args**，
 *    且 args **恰好**是 {clientId,eventId,outcome}（exactKeys）。
 *    写成 {args:{request:{…}}} ⇒ gateway/internal: invalid Remote event result
 *    （用户侧表现 = 点选项提交失败，2026-09-21 实测）。 */
{
  const m = /dshCall\(\s*EVENT_RESULT_ENDPOINT\s*,\s*\{([\s\S]{0,240}?)\}\s*\)/.exec(src)
  if (!m) {
    problems.push('找不到 `dshCall(EVENT_RESULT_ENDPOINT, {…})` —— 回执端点的写法变了？')
  } else {
    const body = m[1]
    if (/\brequest\s*:/.test(body)) {
      problems.push('$events/result 的 args 里出现了 `request` 壳 ⇒ 宿主会判 `invalid Remote event result`（实测）—— 该端点**不要**套壳')
    }
    for (const key of ['clientId', 'eventId', 'outcome']) {
      if (!new RegExp('\\b' + key + '\\b').test(body)) problems.push('$events/result 的 args 里缺少 `' + key + '`')
    }
  }
}

/* ② session/follow 的流式映射：`chunk` 帧**不带 turn**（实测键：[type,attemptId,revision,index,time,chunk]），
 *    必须按 attemptId 记住 start 帧的 turn，否则渲染层 turn=undefined ⇒ assistant/message 兜底重复渲染。 */
if (!/streamTurns\.set\(f\.attemptId/.test(src)) {
  problems.push('follow 映射没有从 `start` 帧记住 turn（streamTurns.set(f.attemptId, f.turn)）—— chunk 帧不带 turn')
}
if (!/streamTurns\.get\(f\.attemptId\)/.test(src)) {
  problems.push('follow 映射喂给渲染层的 turn 没有取自 streamTurns.get(f.attemptId) ⇒ 会出现 turn=undefined（重复渲染）')
}

/* ③ 端点命名/路由：0.1.5-rc.2 是**斜杠式端点进路径**；旧协议写法必须绝迹（注释里记录历史不算）。
 *    这里只查"代码里真会出现"的形式（带引号）。
 *    ⚠️ 不查 `'/api/ping'`：它在 `probeHost()` 里**故意保留** —— 新版该路径回 401，
 *       而我们的判据是"**有 HTTP 应答**就算端口上有 host"，401 同样成立（实测）。 */
for (const bad of ["dshCall('session.", "dshCall('skill.", "'/api/events.mux'", "'/api/respond'", "'/probe'"]) {
  if (src.includes(bad)) problems.push('仍在代码里使用旧协议写法：' + bad)
}

/* ④ `session/list` 的参数名是 **`_request`**（带下划线，照描述符形参名）——别"顺手改成 request"。
 *    （`session/create`/`session/prompt`/`session/cancel` 的形参名才是 request。） */
if (!/dshCall\(\s*'session\/list'\s*,\s*\{\s*_request\s*:/.test(src)) {
  problems.push('`session/list` 的 args 应为 `{ _request: … }`（形参名带下划线，实测）')
}

/* ⑤ 提交成功后必须**本地广播**「已解决」帧（`question` 或 `approval` + `/resolved`）——
 *    新版宿主只在撤销时发 `cancel`、答完**不发** ⇒ 否则"一边答了、另一边还留着那道题"
 *    （用户 2026-09-21 实测：面板答完，悬浮球卡在选项处）。 */
if (!/question\/resolved/.test(src) || !/approval\/resolved/.test(src)) {
  problems.push('dshRespond 没有本地广播 question/resolved · approval/resolved ⇒ 面板与球的选项面板会各卡各的')
}
{
  const panel = path.join(root, 'electron', 'src', 'panel-bridge.js')
  if (!fs.existsSync(panel)) {
    problems.push('找不到 electron/src/panel-bridge.js')
  } else {
    const psrc = fs.readFileSync(panel, 'utf8')
    if (!/p\.type === 'question\/resolved'/.test(psrc)) {
      problems.push('panel-bridge 没有处理 question/resolved（球答完后面板会留一道点了没用的旧题）')
    }
  }
}

/* ⑥ 契约文档必须写明上面几条（防止文档被"顺手改回"错误形状，下次照文档又踩一遍）。 */
if (fs.existsSync(DOC)) {
  const doc = fs.readFileSync(DOC, 'utf8')
  if (!/恰好只有 `args`/.test(doc)) problems.push('契约文档缺少「$events/result 载荷恰好只有 args」的说明')
  if (!/chunk 帧不带 `?turn`?/.test(doc)) problems.push('契约文档缺少「assistant-stream 的 chunk 帧不带 turn」的说明')
}

if (problems.length) {
  console.error('❌ DSH 线路形状守卫未通过（' + MAIN.replace(root + path.sep, '') + '）：')
  for (const p of problems) console.error('   · ' + p)
  console.error('\n   这些形状都是 2026-09-21 真机实测确认的；改之前先看 docs/DSH升级-接口对照.md §4/§6.5。')
  process.exit(1)
}
console.log('✅ DSH 线路形状守卫通过（$events/result 载荷 · follow 的 turn 记忆 · 端点命名 · 契约文档）')
