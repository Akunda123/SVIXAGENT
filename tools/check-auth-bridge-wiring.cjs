#!/usr/bin/env node
/**
 * check-auth-bridge-wiring.cjs —— 守卫：**订阅登录（OAuth）桥**这条链**接没接上**
 *
 * 为什么要有它：这条链横跨四处（宿主插件 → 主进程落位 → IPC → 设置页），**少接一环就静默失效**：
 *   · 插件没落进 profile ⇒ 宿主加载不到（loader 从 profile 目录解析）；
 *   · profile patch 里少了 `authorization` 那一行 ⇒ 一句报错都没有、**一条登录流都不注册**（本轮的真根因）；
 *   · 插件没被 electron-builder 打进包 ⇒ 开发态好用、装了包就没这功能；
 *   · 设置页没调 `authFlows()` ⇒ 界面永远空白。
 *   类型检查抓不到这些"有定义、没接线"。
 *
 * 判据（全部静态可查，不需要起 Electron / 宿主）：
 *   ① 插件源在、`package.json` 的 name 与目录同名（loader 按名字解析）、且真的是"注入 authorization + 写 flows.json"
 *   ② `auth-bridge.js` 存在并导出两个函数；patch 里的两个 id 与它一致；**fail-soft**（解析不到就不写）
 *   ③ `main.js` 在**起宿主之前**调用落位，并注册了 `akdagent-auth-flows` 口子（口子里真调用 readAuthFlows）
 *   ④ preload 暴露了 `authFlows`
 *   ⑤ 设置页有那一节、且真的调了 `window.svsettings.authFlows()`
 *   ⑥ 四语种都有那 7 条文案
 *   ⑦ electron-builder 的 files 覆盖整个 src 目录（否则插件不进包）
 *
 * 用法：node tools/check-auth-bridge-wiring.cjs
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const P = (...a) => path.join(ROOT, ...a)
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')
const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return null } }

let bad = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const no = (m) => { bad++; console.log(`  ❌ ${m}`) }

const PLUGIN_DIR = P('electron', 'src', 'plugins', 'akd-auth-bridge')
const PLUGIN_ID = 'akd-auth-bridge'
const SERVICE_ID = 'authorization'
const SERVICE_NAME = '@deepseek-ai/dsh-authorization'

console.log('【① 宿主插件源】')
const pkg = read(path.join(PLUGIN_DIR, 'package.json'))
const idx = read(path.join(PLUGIN_DIR, 'index.js'))
if (!pkg || !idx) no(`缺插件源：${rel(PLUGIN_DIR)}/{package.json,index.js}`)
else {
  try {
    const j = JSON.parse(pkg)
    if (j.name !== PLUGIN_ID) no(`package.json 的 name（${j.name}）必须与目录同名 ${PLUGIN_ID}（loader 按名字解析）`)
    else ok(`插件 package.json name = ${PLUGIN_ID}（与目录同名）`)
    if (j.type !== 'module') no('插件应是 ESM（"type":"module"）—— 宿主这些都是 ESM 插件')
    else ok('插件是 ESM（type: module）')
  } catch (e) { no('插件 package.json 不是合法 JSON：' + e.message) }
  /* ⚠️ 这条以前是假通过：老写法用正则找 `ctx.inject(['authorization']`，而插件**文档注释**里恰好写了这行
   *   ⇒ 注释骗过了检查。插件真实机制是 `ctx.get('authorization')`（直读 `ctx.authorization` 需要 inject 声明，
   *   会抛 `cannot get property … without inject`）。所以这里查**真机制**。 */
  if (!/ctx\.get\(\s*['"]authorization['"]\s*\)/.test(idx)) no("插件没有用 ctx.get('authorization') 去拿服务（直读 ctx.authorization 需要 inject 声明，会抛）")
  else ok("插件用 ctx.get('authorization') 反应式探测服务（服务不在也不崩）")
  if (!/flows\.json/.test(idx)) no('插件没提到 flows.json ⇒ 客户端读什么？')
  else ok('插件写 flows.json（客户端读它）')
  if (!/renameSync/.test(idx)) no('flows.json 没走"先写 .tmp 再 rename" ⇒ 读侧可能读到半截 JSON')
  else ok('flows.json 是原子写（tmp + rename）')
  if (!/list\(\)/.test(idx)) no('插件没有调 list()')
  else ok('插件调了服务 list()')
  if (!/setInterval|authorization\/settled/.test(idx)) no('插件既不轮询也不听 settled ⇒ 注册是异步的，清单会一直停在 0 条')
  else ok('插件有"重发"机制（轮询或 settled 事件）—— 注册是异步的，必须有')
  /* 第 2 步：命令/尝试通道（客户端据此驱动登录并渲染提示与提问） */
  if (!/cmd\.json/.test(idx)) no('插件不读 cmd.json ⇒ 客户端没法发起 begin/answer/cancel')
  else ok('插件读 cmd.json（客户端下命令）')
  if (!/attempt\.json/.test(idx)) no('插件不写 attempt.json ⇒ 界面不知道 notifies/待回答的问题')
  else ok('插件写 attempt.json（界面据此渲染 notices 与 awaiting prompt）')
  if (!/notices\.push|notices\s*:/.test(idx)) no('插件没有把 notify 收进 notices')
  else ok('插件把 notify 收进 notices（message/url/code 三件套）')
  if (!/awaiting/.test(idx) || !/prompts\.push/.test(idx)) no('插件没有"把 prompt 抬到 awaiting 等客户端回答"的机制')
  else ok('插件把 prompt 抬成 awaiting 等客户端回答')
  /* `placeholder` 是宿主规范化后特意留下的提示（manual_code 型 = 本机回调地址）——
   * 三家 PKCE 流（anthropic / openrouter / openai-codex）都靠它告诉用户该粘什么；丢了它界面就没提示。 */
  if (!/placeholder/.test(idx)) no('插件把宿主 prompt 的 placeholder 丢了 ⇒ PKCE 那几家（粘贴授权码）界面上没有提示')
  else ok('插件透传 prompt 的 placeholder（manual_code 型提示粘什么）')
  if (!/answer-consumed/.test(idx)) no('插件消费 answer 后没清空命令槽位 ⇒ secret 会留在盘上')
  else ok('插件消费 answer 后清空命令槽位（secret 不留盘）')
  /* ⛔ 2026-10-07 实测事故：**一个卡住的尝试会把整区锁死**（用户「什么按钮都点不了」）。
   *   宿主侧必须有这条：新的 begin 来了 ⇒ **先取消旧的**，而不是"忽略"（旧客户端/旧界面也能自救）。 */
  if (/cancelActive\(\)/.test(idx) && /先取消正在跑的/.test(idx)) ok('新 begin 会先取消旧尝试（不会再出现"点任何按钮都只被忽略"的锁死）')
  else no('插件仍然"已有尝试在跑就忽略新的 begin" ⇒ 一个卡住的尝试会锁死整个区（用户报过）')
}

console.log('【② 主进程侧 auth-bridge.js】')
const ab = read(P('electron', 'src', 'auth-bridge.js'))
if (!ab) no('缺 electron/src/auth-bridge.js')
else {
  if (!/module\.exports\s*=\s*\{[^}]*ensureAuthBridge[^}]*readAuthFlows/.test(ab)) no('没同时导出 ensureAuthBridge 与 readAuthFlows')
  else ok('导出 ensureAuthBridge + readAuthFlows')
  if (!new RegExp(`SERVICE_ID\\s*=\\s*'${SERVICE_ID}'`).test(ab)) no(`SERVICE_ID 常量不是 '${SERVICE_ID}'`)
  else ok(`SERVICE_ID = '${SERVICE_ID}'（与插件断言一致）`)
  if (!new RegExp(`SERVICE_NAME\\s*=\\s*'${SERVICE_NAME.replace(/[/@]/g, (m) => '\\' + m)}'`).test(ab)) no(`SERVICE_NAME 常量不是 '${SERVICE_NAME}'`)
  else ok(`SERVICE_NAME = '${SERVICE_NAME}'`)
  if (!/resolvableFrom/.test(ab)) no('没有 resolvableFrom ⇒ 缺 fail-soft：写出解析不到的名字会让**宿主整棵插件树加载失败**')
  else ok('有 resolvableFrom（fail-soft：解析不到就不写那一行）')
  if (!/node_modules/.test(ab) || !/profiles|web/.test(ab)) no('看不出把插件落到 profile 的 node_modules')
  else ok('把插件落到 profile 的 node_modules（loader 从 profile 解析）')
  /* ⛔ 2026-10-07 真机事故（发布前查出来的）：消毒器把"运行时解析不到"的行**注释掉**，
   *   而老写法用子串判断 ⇒ 注释行被当成"已存在" ⇒ 永不补回 ⇒ 订阅登录**首次能用、之后每次启动失效**。
   *   现在两件事都必须保持：① 判据只认活着的行（行首 `- id:`）② 有"自愈"逻辑把误注释的条目修回来。 */
  if (!/new RegExp\('\^\\\\s\*-\\\\s\*id:/.test(ab)) no("auth-bridge.js 判'已存在'的判据不是行首锚定的（注释行会被当成已存在 ⇒ 永不补回）")
  else ok("判'已存在'只认活着的行（^\\s*-\\s*id:，注释行不算）")
  if (!/stripDisabledBlock/.test(ab) || !/已停用/.test(ab)) no('auth-bridge.js 没有"把被误注释的条目修回来"的自愈逻辑')
  else ok('有自愈：发现消毒器误注释的标记 ⇒ 清掉并重新补一行')
  if (!/renameSync|copyFileSync\(patchPath/.test(ab)) no('改 patch 前没备份（.bak-authbridge）')
  else ok('改 patch 前先备份 .bak-authbridge')
  /* 根因侧：**直接调一次** dsh-home.js 的消毒判据（纯 fs 查询、无副作用；比正则钉得牢）。
   *   事故：裸包名只查 runtime 的 node_modules ⇒ profile 本地的插件被误判"不存在"⇒ 注释掉。 */
  let patchResolvable = null
  try { patchResolvable = require(P('electron', 'src', 'dsh-home.js')).patchNameResolvable } catch { /* 下面报错 */ }
  if (typeof patchResolvable !== 'function') no('拿不到 dsh-home.js 导出的 patchNameResolvable（改名了？）')
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-wiring-guard-'))
    const web = path.join(tmp, 'profiles', 'web')
    const root = path.join(tmp, 'runtime')
    fs.mkdirSync(path.join(web, 'node_modules', 'profile-local-plug'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    const inProfile = patchResolvable('profile-local-plug', web, root) === true
    const nowhere = patchResolvable('profile-local-plug-xyz', web, root) === false
    fs.rmSync(tmp, { recursive: true, force: true })
    if (!inProfile) no("dsh-home.js 的 patchNameResolvable 不认 profile 的 node_modules（裸名会被误判成'运行时不存在'⇒ 那一行会被注释掉）")
    else if (!nowhere) no('patchNameResolvable 对"两处都没有"的包名没返回 false（消毒会失效）')
    else ok('消毒判据：profile 与 runtime 两处都查（与 resolvableFrom 同口径）')
  }
}

console.log('【③ main.js：起宿主之前落位 + IPC 口子】')
const main = read(P('electron', 'src', 'main.js')) || ''
if (!/require\('\.\/auth-bridge\.js'\)/.test(main)) no('main.js 没有 require auth-bridge.js')
else ok("main.js require('./auth-bridge.js')")
{
  const call = main.indexOf('ensureAuthBridge(')
  const spawn = main.indexOf('const child = spawn(')
  if (call < 0) no('main.js 没有调用 ensureAuthBridge')
  else if (spawn < 0) no('找不到 spawn 宿主那一行（改名了？）')
  else if (call > spawn) no('ensureAuthBridge 调用在 spawn **之后** ⇒ 本次启动读不到（profile 只在宿主启动时读）')
  else ok('ensureAuthBridge 在 spawn 宿主**之前**调用')
}
{
  const m = /ipcMain\.handle\(\s*'akdagent-auth-flows'[\s\S]{0,600}?\n\}\)/.exec(main)
  if (!m) no("main.js 没有 ipcMain.handle('akdagent-auth-flows')")
  else if (!/readAuthState\(/.test(m[0])) no('这个口子里没有调用 readAuthState（口子是空的）')
  else ok('akdagent-auth-flows → readAuthState（清单 + 当前尝试，一次拿全）')
}
{
  /* 第 2 步：三个"下命令"的口子 —— 每个都必须真的写对应 op 的 cmd */
  const want = [['akdagent-auth-begin', 'begin'], ['akdagent-auth-answer', 'answer'], ['akdagent-auth-cancel', 'cancel']]
  for (const [ipc, op] of want) {
    const m = new RegExp(`ipcMain\\.handle\\(\\s*'${ipc}'[\\s\\S]{0,700}?\\n\\}\\)`).exec(main)
    if (!m) { no(`main.js 没有 ipcMain.handle('${ipc}')`) ; continue }
    if (!new RegExp(`writeAuthCmd\\([^)]*'${op}'`).test(m[0])) no(`${ipc} 没写 op='${op}' 的命令`)
    else ok(`${ipc} → writeAuthCmd('${op}')`)
  }
}

console.log('【④ preload 转发 + ⑤ 设置页真的调了】')
const pre = read(P('electron', 'src', 'settings-preload.js')) || ''
if (/authFlows:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('akdagent-auth-flows'\)/.test(pre)) ok('settings-preload 暴露了 authFlows → akdagent-auth-flows')
else no('settings-preload 没有转发 akdagent-auth-flows')
for (const [fn, ipc] of [['authBegin', 'akdagent-auth-begin'], ['authAnswer', 'akdagent-auth-answer'], ['authCancel', 'akdagent-auth-cancel']]) {
  if (new RegExp(`${fn}:\\s*\\([^)]*\\)\\s*=>\\s*ipcRenderer\\.invoke\\('${ipc}'`).test(pre)) ok(`settings-preload 暴露了 ${fn} → ${ipc}`)
  else no(`settings-preload 没有转发 ${ipc}`)
}
const html = read(P('electron', 'src', 'settings.html')) || ''
if (/data-i18n="settings\.auth\.section"/.test(html)) ok('设置页有「订阅登录」那一节')
else no('设置页没有 settings.auth.section 那一节')
if (/window\.svsettings\.authFlows\(\)/.test(html)) ok('设置页调用了 window.svsettings.authFlows()')
else no('设置页没有调用 authFlows() ⇒ 界面永远空白（这条就是接线本身）')
if (/btn-auth-refresh/.test(html)) ok('有「刷新清单」按钮')
else no('没有刷新按钮（注册是异步的，用户需要能手动重读）')
if (/window\.svsettings\.authBegin\(/.test(html)) ok('每个提供方有「登录」按钮（调 authBegin）')
else no('界面没有"开始登录"的调用点 ⇒ 只能看不能点')
if (/id="auth-attempt"/.test(html) && /window\.svsettings\.authAnswer\(/.test(html)) ok('有尝试面板：能显示 notices 并回答 prompt（authAnswer）')
else no('没有 attempt 面板 / 没有回答 prompt 的调用点 ⇒ 需要用户输码的路子走不通')
if (/input\.placeholder\s*=\s*a\.awaiting\.placeholder/.test(html)) ok('输入框用上了 awaiting.placeholder（粘贴授权码时提示格式/回调地址）')
else no('输入框没用 awaiting.placeholder ⇒ 用户不知道要粘什么')
if (/window\.svsettings\.authCancel\(/.test(html)) ok('能取消（authCancel）')
else no('没有取消按钮 ⇒ 用户卡在一次尝试里没法退出')
/* ⛔ 2026-10-07（**用户指出**：「apikey 不应该在上面提供方写吗？和订阅登录重复了」）：
 *   宿主清单是全部 39 家，其中 35 家只有 `api-key` 方法 —— 那一区必须**只列订阅登录（oauth）**，
 *   否则和上面的提供方卡片重复。两条过滤都得在：筛清单 + 筛按钮。 */
if (/some\(\(m\) => m\.id === 'oauth'\)/.test(html) && /filter\(\(x\) => x\.id === 'oauth'\)/.test(html)) ok('清单与按钮都只保留订阅登录（oauth），不与提供方卡片重复')
else no("那一区又变成列全部提供方了（要与上面的提供方卡片分工：这里只留 oauth）")
/* ⛔ `t()` 是变参（`t(key, ...args)`）——传数组会让两元素数组被 String() 成 "a,b" 塞进 {0}、{1} 原样留下
 *   （2026-10-07 用户截图里「登录中：Anthropic,running ({1})」就是这个 bug）。 */
if (/\.t\([^)]+,\s*\[/.test(html)) no('settings.html 里又出现了数组式 t() 调用（{1} 会原样留在界面上）')
else ok('t() 全按变参调用（没有数组式误用）')
/* ⛔ 2026-10-07（**用户报**：「为什么我按钮点不动了」）：曾经"有尝试在跑就禁用全部登录按钮" ⇒ 整区点不动。
 *   正确做法：按钮**不禁用**，点另一家时**先取消当前这次**再开始（宿主一次只跑一个）。两条都要在。 */
if (/if \(f\.inFlight \|\| running\) b\.disabled = true/.test(html)) no('又出现"尝试在跑就禁用全部登录按钮" ⇒ 整个区点不动（用户报过）')
else ok('没有"一跑就把所有登录按钮禁掉"的死胡同')
if (/if \(running\) \{[\s\S]{0,300}?authCancel\(\)/.test(html) && /authBegin\(f\.key, m\.id\)/.test(html)) ok('换一家登录会**先取消**当前这次再开始（宿主一次只跑一个）')
else no('换一家登录时没有先取消 ⇒ 新的 begin 会被宿主静默忽略')
/* ⛔ 2026-10-07（**用户报**：「清单自动刷新顶掉了我未完成的操作，它会自己失败」）：一次瞬时读空就拆面板
 *   ⇒ 未答完的提问没了、宿主还在等 ⇒ 自己超时失败。必须有宽限期（连续几次读空才认账）。 */
if (/authGraceTicks/.test(html) && /AUTH_GRACE_TICKS/.test(html) && /auth-recheck/.test(html)) ok('有宽限期：宿主瞬时读空**不拆面板**（未答完的提问保留）')
else no('没有宽限期 ⇒ 一次读空就会拆掉未答完的提问（用户报过"它自己失败"）')
/* ⛔ 2026-10-07 实测：OpenAI 用 403 `unsupported_country_region_territory` 拒了整个地区，
 *   面板当时只有一坨 JSON ⇒ 必须把厂商错误码翻成一句人话（raw 仍留在 title 里）。 */
if (/function vendorCodeOf/.test(html) && /settings\.auth\.vendorRejected', vcode/.test(html)) ok('厂商错误码会翻成人话（地区封锁/码无效/被拒/过期）')
else no('厂商拒绝时只显示原始 JSON ⇒ 用户看不出是"地区不支持"（实测踩到）')
/* ⛔ 2026-10-07 实测（用户 Anthropic 反复 `Missing authorization code`，answer.len=0）：**空着提交会掐掉这次登录**
 *   —— 粘贴支路与本机回调是赛跑关系。必须挡住"空答案提交"。 */
if (/auth\.needInput/.test(html) && /!String\(input\.value \|\| ''\)\.trim\(\)/.test(html)) ok('空答案不许提交（提示去浏览器完成，而不是掐掉回调）')
else no('空答案还能提交 ⇒ 会把本机回调那一侧也掐掉（实测踩到）')
if (/setInterval\(loadAuthFlows/.test(html)) ok('running 时会轮询刷新（attempt 是宿主异步写的）')
else no('没有轮询 ⇒ 提示码/提问不会自己出现')
if (/activatePage[\s\S]{0,1500}?name === 'model'[\s\S]{0,200}?loadAuthFlows\(\)/.test(html)) ok('切到模型页时会自动重读清单')
else no('切页时没有重读 ⇒ 读到空的就一直是空的')
/* ⛔ 2026-10-07（**用户报**：「清单更新会把焦点对话框顶掉」）：running 时每 800 ms 重读，若每次都整段重建 DOM，
 *   正在粘贴授权码的那个输入框每 800 ms 被换成新元素（焦点 + 已输入内容一起丢）。两条不变量不许被删：
 *   ① 快照指纹没变就**早退**（不碰 DOM）② 同一个提问的输入框**复用元素**并把焦点还回去。 */
if (/authSignature\(fm, flows, attempt\)/.test(html) && /sig === authRenderedSig\)\s*return/.test(html)) ok("订阅登录有「指纹没变就不重建」的早退（否则轮询会把输入框顶掉）")
else no('loadAuthFlows 少了指纹早退 ⇒ 轮询会每 800ms 重建 DOM，把正在输入的提问框顶掉（用户报过）')
if (/focusBack/.test(html) && /panel\.appendChild\(wrap\)[\s\S]{0,400}?focusBack\.el\.focus\(\)/.test(html)) ok('焦点恢复在**挂回文档之后**（游离元素上 focus() 无效）')
else no('焦点恢复的位置不对/缺失：必须在 panel.appendChild 之后调 focus()')
/* 失败原因必须**截短**再进面板（pi-ai 会把厂商原文 + stack 全塞进 error，实测 ≈1.5 KB ⇒ 会把面板撑爆） */
if (/function shortAuthError/.test(html) && /settings\.auth\.failed', shortAuthError\(/.test(html) && /done\.title = String\(a\.error/.test(html)) ok('失败原因先截短再显示（完整原文留在 title）')
else no('失败原因没截短/没留完整原文：一次失败会把整个面板撑爆（实测踩到）')
/* 回归用例必须留在设置页真机测试里（删了就等于没人看着这个 bug） */
const clicks = read(P('electron', 'dev', 'test-settings-clicks.cjs')) || ''
if (/重建后焦点仍在提问框上/.test(clicks) && /快照没变 ⇒ 不重建/.test(clicks)) ok('设置页真机测试里有"轮询不顶掉焦点"的回归用例')
else no('test-settings-clicks.cjs 里少了订阅登录的焦点回归用例（删了没人看着这个 bug）')

console.log('【⑥ 四语种文案】')
try {
  const dict = JSON.parse(read(P('electron', 'src', 'i18n', 'settings.json')))
  const need = ['settings.auth.section', 'settings.auth.hint', 'settings.auth.refresh', 'settings.auth.unavailable', 'settings.auth.stale', 'settings.auth.freshAt', 'settings.auth.empty',
    'settings.auth.inFlight', 'settings.auth.attemptTitle', 'settings.auth.openUrl', 'settings.auth.submit', 'settings.auth.cancelBtn', 'settings.auth.authorized', 'settings.auth.cancelled', 'settings.auth.failed',
    /* 🆕 2026-10-07：失败/取消要说清"不会留下凭据、再点一次即可重试"（实测用户会以为坏了） */
    'settings.auth.retryHint',
    /* 🆕 2026-10-07：清单过滤后（只剩订阅登录）要说清"密钥去上面的卡片填" */
    'settings.auth.noSubscription',
    /* 🆕 2026-10-07：跑着的时候要明说"换一家直接点它即可"（别把按钮禁用成死胡同 —— 用户报过） */
    'settings.auth.switchHint',
    /* 🆕 2026-10-07：宿主一时读不到尝试时的宽限期提示 + "久不回答会超时"的说明 */
    'settings.auth.rechecking', 'settings.auth.promptHint',
    /* 🆕 2026-10-07：厂商拒绝（地区封锁等）要把错误码翻成人话，别只甩 JSON */
    'settings.auth.vendorRejected',
    /* 🆕 2026-10-07：attempt 的英文 state 枚举要换成四语种的词（别在中文句子里塞 "running"） */
    'settings.auth.stateRunning', 'settings.auth.stateAuthorized', 'settings.auth.stateCancelled', 'settings.auth.stateFailed',
    /* 🆕 2026-10-07：**空答案不许提交**（空着提交会掐掉本机回调那一侧 ⇒ `Missing authorization code`） */
    'settings.auth.needInput']
  let miss = 0
  for (const L of Object.keys(dict)) {
    const m = need.filter((k) => typeof dict[L][k] !== 'string')
    if (m.length) { no(`${L} 缺文案：${m.join(', ')}`); miss++ }
  }
  const L2 = Object.keys(dict)
  if (!miss && L2.length >= 4 && L2.every((L) => need.every((k) => typeof dict[L][k] === 'string'))) {
    ok(`${L2.length} 个语种都有那 ${need.length} 条文案`)
  } else if (!miss) no(`语种不全：共 ${L2.length} 个（应 ≥4）`)
} catch (e) { no('读 settings.json 出错：' + e.message) }

console.log('【⑦ 打包清单覆盖插件】')
const yml = read(P('electron', 'electron-builder.yml')) || ''
if (/^files:\s*$/m.test(yml) && /^\s*-\s+src\/\*\*\/\*/m.test(yml)) ok('electron-builder.yml 的 files 覆盖 src/**/*（插件会进包）')
else no('electron-builder.yml 的 files 没覆盖 src/**/*（插件不会进包 ⇒ 装了包没这功能）')
if (/^\s*-\s*['"]?!src\/plugins/m.test(yml)) no('files 里有排除 src/plugins 的规则 ⇒ 插件不会进包')
else ok('没有排除 src/plugins 的规则')

console.log(bad
  ? `\n❌ 订阅登录桥有 ${bad} 处不合格`
  : '\n✅ 订阅登录桥接线完整（插件源 · 落位 patch+备份+fail-soft · 起宿主前调用 · IPC · preload · 设置页 · 四语种 · 打包清单）')
process.exit(bad ? 1 : 0)
