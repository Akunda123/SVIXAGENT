#!/usr/bin/env node
/**
 * 守卫：**系统代理 → 子进程环境变量**这条链路的接线与安全口径（2026-10-07 立）。
 *
 * 起因（用户报「OpenAI Plus 登录 403 地区不受支持，换网络也没用」）：
 *   宿主只认环境变量里的代理（`@deepseek-ai/dsh-http-proxy` 的 installProxyFromEnvironment，
 *   在 runProfile 第一步装 undici 全局 dispatcher），而 **Node 不读 Windows「系统代理」/
 *   macOS 系统设置** ⇒ 用户设成"系统代理"时助手一直直连出去，出口是本机真实 IP
 *   ⇒ 地区限制必然 403，且"换 Wi-Fi / 换宽带"完全没用。
 *   `electron/src/system-proxy.js` 就是补这一段的（探出来 → 注入 → 宿主自己装 dispatcher）。
 *
 * 本守卫钉两件事：
 *   A. **接线**：宿主/子进程的 env 必须走 `networkChildEnv()`；系统代理探测必须在**起宿主之前**完成。
 *   B. **四条安全口径**（少一条都会把用户坑得更惨，每条都有真实理由）：
 *      ① `ProxyEnable` 是硬判据（Windows 会把上次 ProxyServer 永久留着 —— 本机实测 0x0 + 127.0.0.1:7890）
 *      ② 注入前做一次 TCP 可达性探测（代理没起来时宁可直连）
 *      ③ SOCKS / PAC 明确不采（宿主只支持 http(s)）
 *      ④ **绝不改 `process.env`**（`app.relaunch()` 必须继承启动时的原环境）
 *
 * 用法：node tools/check-host-proxy.cjs   （退出码 0 = 全过；1 = 有 FAIL）
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
let bad = 0
const ok = (m) => console.log('  [ok]   ' + m)
const fail = (m) => { bad++; console.log('  [FAIL] ' + m) }
const info = (m) => console.log('  [i]    ' + m)

const MAIN = path.join(ROOT, 'electron', 'src', 'main.js')
const MOD = path.join(ROOT, 'electron', 'src', 'system-proxy.js')
const TEST = path.join(ROOT, 'tools', 'test-system-proxy.cjs')

console.log('== A. 接线：子进程 env 走 networkChildEnv()，且探测在起宿主之前 ==');
{
  const t = fs.readFileSync(MAIN, 'utf8')
  if (/const \{ decideProxy, childEnvWithProxy \} = require\('\.\/system-proxy\.js'\)/.test(t)) ok('main.js 引入了 system-proxy');
  else fail('main.js 没引入 system-proxy ⇒ 系统代理永远不会生效')

  if (/function networkChildEnv\(\) \{\s*return childEnvWithProxy\(process\.env, proxyDecision\)/.test(t)) ok('有 networkChildEnv()（唯一给子进程配网络环境的入口）');
  else fail('没有 networkChildEnv() ⇒ 各处 spawn 会各配各的 env')

  if (/const env = networkChildEnv\(\)/.test(t)) ok('spawnHost 用 networkChildEnv()（宿主是所有网络请求的实际发出者）');
  else fail('spawnHost 没用 networkChildEnv() ⇒ 宿主拿不到代理（这正是那条 403 的成因）')

  if (/spawn\(nodeBin, \[serverEntry\], \{ env: networkChildEnv\(\)/.test(t)) ok('MCP 自检子进程也带同一份 env');
  else fail('MCP 自检子进程没带 env ⇒ 代理环境下自检会失败 ⇒ 注册被跳过（用户一颗工具都没有）')

  const iDecide = t.indexOf('await probeNetworkRoute(\'startup\')')
  const iSpawn = t.indexOf('await bringUpHost(attempt)')
  if (iDecide > 0 && iSpawn > 0 && iDecide < iSpawn) ok('探测在 bringUpHost 之前完成（否则第一次 spawn 用不到代理）');
  else fail('探测不在起宿主之前 ⇒ 第一次启动仍会直连')

  /* 🆕 2026-10-08（B 组）：**不再只在启动时探一次** —— 起宿主前也要重探（用户中途开代理/换节点/宿主重试）。
   *  ⛔ 但必须同时如实说明"已运行的宿主不会自动切换"：宿主只在 boot 第一步按 env 装 dispatcher ⇒ 要重启助手。 */
  if (/async function probeNetworkRoute\(reason\)/.test(t) && /await probeNetworkRoute\('startup'\)/.test(t)) ok('探测封装成 probeNetworkRoute()，启动时调用');
  else fail('没有 probeNetworkRoute()，或启动时没调用')
  if (/if \(Date\.now\(\) - networkProbedAt > NETWORK_REPROBE_MS\) await probeNetworkRoute\('spawn'\)/.test(t)) ok('起宿主前会**重探**（带 20s 节流，不在重试链路上反复花探测时间）');
  else fail('起宿主前不重探 ⇒ 用户中途开代理后只有重启 App 才可能被发现')
  if (/需要重启助手才生效/.test(t)) ok('路由变了会明确说"要重启助手才生效"（不假装已切换）');
  else fail('路由变了没有如实说明 ⇒ 用户会以为已经生效')

  if (/proxyDecision = await decideProxy\(\{ env: process\.env \}\)/.test(t)) ok('探测用启动时快照的 process.env（不读后来改过的）');
  else fail('探测没有基于启动时的 env 快照')
}

console.log('\n== B. 安全口径 ④：绝不改 process.env（relaunch 要继承原环境）==');
{
  const t = fs.readFileSync(MAIN, 'utf8')
  const assigns = t.match(/process\.env\.(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|http_proxy|https_proxy|all_proxy|no_proxy)\s*=/g) || []
  if (assigns.length === 0) ok('main.js 里没有对 process.env.<代理键> 的赋值');
  else fail('main.js 改了进程环境里的代理键（' + assigns.join(', ') + '）⇒ 用户从自定义代理切回"跟随系统"时会被旧路由污染')

  const m = fs.readFileSync(MOD, 'utf8')
  if (/function childEnvWithProxy\(inherited, decision\) \{\s*const env = \{ \.\.\.inherited \}/.test(m)) ok('childEnvWithProxy 复制入参、返回新对象');
  else fail('childEnvWithProxy 可能直接改入参（等于改 process.env）')
}

console.log('\n== B. 安全口径 ①②③：开关是硬判据 / 探测可达性 / SOCKS·PAC 不采 ==');
{
  const m = fs.readFileSync(MOD, 'utf8')
  if (/const on = \/\^\(0x0\*1\|1\)\$\/i\.test\(String\(v\.ProxyEnable/.test(m)) ok('① ProxyEnable 是硬判据（开关关着就不注入）');
  else fail('① 没看 ProxyEnable ⇒ 会把助手按到一个已经关掉的代理上（本机实测就是 0x0 + 127.0.0.1:7890）')
  if (/ok = await probe\(target\)/.test(m) && /function probeTcp\(/.test(m)) ok('② 注入前做 TCP 可达性探测');
  else fail('② 没做可达性探测 ⇒ 代理没起来时整条链路全废（比 403 更难查）')
  if (/reason: 'unsupported'/.test(m) && /socks/i.test(m) && /reason: 'pac'/.test(m)) ok('③ SOCKS 与 PAC 都明确不采并给出人话原因');
  else fail('③ SOCKS / PAC 没有明确处理 ⇒ 采了会让"路由"与"诊断"互相矛盾')
  if (/const LOOPBACK_NO_PROXY = \['localhost', '127\.0\.0\.1', '::1', '\[::1\]'\]/.test(m) && /\.\.\.LOOPBACK_NO_PROXY/.test(m)) ok('环回地址强制绕过代理（宿主自己的本地 HTTP/WS 不能被塞进代理）');
  else fail('环回没有强制绕过 ⇒ 本地 HTTP 走代理会变成路由环')
}

console.log('\n== C. 单测 ==');
{
  if (fs.existsSync(TEST)) {
    const s = fs.readFileSync(TEST, 'utf8')
    if (/ProxyEnable=0x0/.test(s) && /REAL_SCUTIL/.test(s) && /probeTcp/.test(s)) ok('单测覆盖：开关关着不注入 · macOS scutil 样本 · 真 TCP 探测');
    else info('单测在，但判据没覆盖到关键三种（开关/mac/可达性）')
  } else fail('缺少 tools/test-system-proxy.cjs ⇒ 这些口径只能靠 mac/Windows 手测')
}

console.log('\n== D. STT 模型下载也要跟随系统代理（2026-10-08 用户「stt 也做成跟系统」）==');
{
  /* 为什么单列：`stt-model.js` 的默认实现是 Node `https.get` —— 它**既不读系统代理、也不读
   * `HTTP(S)_PROXY`**（`https.get` 要显式给 agent）⇒ 设了"系统代理"的用户下不到语音模型。
   * 修法 = 注入一个走 Electron `net`（Chromium 网络栈，天生跟随系统代理）的下载器。 */
  const STT = path.join(ROOT, 'electron', 'src', 'stt-model.js')
  const DL = path.join(ROOT, 'electron', 'src', 'download-transport.js')
  const TST = path.join(ROOT, 'tools', 'test-stt-transport.cjs')
  const stt = fs.readFileSync(STT, 'utf8')
  /* ⚠️ 前面几段的 `t` 是块作用域 ⇒ 这里自己读一遍 main.js（别引用块外变量，已踩过一次） */
  const mj = fs.readFileSync(MAIN, 'utf8')
  if (/function setDownloadTransport\(fn\)/.test(stt) && /if \(downloadTransport\) return downloadTransport\(url, dest, onProgress\)/.test(stt)) ok('stt-model 支持注入下载传输层，且默认实现保留');
  else fail('stt-model 没有可注入的下载传输层 ⇒ 系统代理模式下模型下不下来')
  if (/downloadFile, setDownloadTransport \}/.test(stt)) ok('setDownloadTransport 已导出（main.js 才接得上）');
  else fail('setDownloadTransport 没导出')

  if (fs.existsSync(DL)) {
    const dl = fs.readFileSync(DL, 'utf8')
    if (/function createElectronDownloader\(/.test(dl) && /net\.request\(\{ url, redirect: 'follow' \}\)/.test(dl)) ok('下载器走 Electron net（Chromium ⇒ 跟随系统代理；重定向交给它）');
    else fail('下载器没用 Electron net ⇒ 白改')
    if (/idleTimeoutMs/.test(dl) && /下载超时/.test(dl)) ok('有空闲超时（大文件能下完、卡住时换源）');
    else fail('没有空闲超时 ⇒ 卡住会无限等，上层换源兜底失效')
    if (/unlinkSync\(part\)/.test(dl)) ok('失败时清理 .part（不留半个模型文件）');
    else fail('失败不清理 .part')
  } else fail('缺少 electron/src/download-transport.js')

  if (/const \{ createElectronDownloader \} = require\('\.\/download-transport\.js'\)/.test(mj)) ok('main.js 引入了下载传输层');
  else fail('main.js 没引入下载传输层 ⇒ 注入点接不上')
  if (/net: electronNet \}/.test(mj)) ok('main.js 从 electron 取了 net（默认会话 ⇒ 跟随系统代理）');
  else fail('main.js 没取 Electron 的 net')
  if (/sttModel\.setDownloadTransport\(createElectronDownloader\(\{ net: electronNet, fs \}\)\)/.test(mj)) ok('启动时把 Electron 下载器注入给 stt-model');
  else fail('没有在启动时注入 ⇒ STT 下载仍旧直连')
  if (/STT 下载器接入失败（退回 Node https/.test(mj)) ok('注入失败 fail-soft（退回 Node https，不拦启动）');
  else fail('注入失败没有兜底 ⇒ 可能因此起不来')

  if (fs.existsSync(TST) && /createElectronDownloader/.test(fs.readFileSync(TST, 'utf8'))) ok('有单测 tools/test-stt-transport.cjs（四条失败路径都跑）');
  else fail('缺少 STT 下载的单测')
}

console.log('')
if (bad) { console.log(`✗ 有 ${bad} 项不合格（系统代理没接对 = 用户继续直连 = OpenAI 那边继续 403）`); process.exit(1) }
console.log('✓ 系统代理接线与安全口径守卫通过')
