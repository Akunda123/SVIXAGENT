'use strict'
/**
 * 系统代理探测：把"用户在系统里配的代理"变成宿主进程能吃的 `HTTP(S)_PROXY` 环境变量。
 *
 * 为什么需要（2026-10-07 用户报「OpenAI Plus 登录 403 地区不受支持，换网络也没用」）：
 *   · 宿主（内嵌 DSH）与它拉起的子进程**只认环境变量** `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`
 *     （`@deepseek-ai/dsh-http-proxy` 的 `installProxyFromEnvironment`，在 `runProfile` 第一步装
 *     undici 全局 dispatcher ⇒ 连 pi-ai 那步裸 `fetch` 的 OAuth 换 token 也吃它；只支持 http(s)，
 *     SOCKS 会被明确拒绝）；
 *   · 但 **Node 不读** Windows「系统代理」（那是 WinINET，浏览器/Electron 才读），macOS 的
 *     `System Settings → 网络 → 代理` 同样不写进环境变量；
 *   · ⇒ 用户把代理设成"系统代理"时，助手一直**直连**出去（出口 = 本机真实 IP）⇒ 地区限制必然 403，
 *     而"换 Wi-Fi / 换宽带"完全没用。
 *
 * ⛔ 四条安全口径（每一条都有真实理由，别简化掉）：
 *   ① **`ProxyEnable` 不为 1 就不注入**：Windows 会把上次的 `ProxyServer` 永久留着
 *      （本机实测 `ProxyEnable=0x0` 而 `ProxyServer=127.0.0.1:7890`）⇒ 不看开关就注入 =
 *      把助手按到一个**已经关掉的代理**上，比"代理不生效"更糟；
 *   ② **注入前做一次 TCP 可达性探测**：代理进程没起来时**宁可直连**（日志里写明），
 *      否则一次连不上就整条网络链路全废（比 403 更难查）；
 *   ③ **SOCKS / PAC 一律不采**：宿主只支持 http(s) 代理；PAC 要跑 JS 解析，不在这一层做
 *      （采了反而会让"路由"与"诊断"互相矛盾）；
 *   ④ 只**返回新的 env 对象**，绝不改 `process.env` —— `app.relaunch()` 必须继承启动时的原环境，
 *      否则用户从"自定义代理"切回"跟随系统"时会留着上一次的路由。
 *
 * ⚠️ 与 PR #8（littleclock2 · `electron/src/network-settings.js`）的关系：那边做了完整的多路由
 *   配置页 + 探测 + Chromium `setProxy`，**口径与我们这里一致**（同样只看 `ProxyEnable`、
 *   同样拒绝 SOCKS/PAC、同样做子进程注入）。我们这一层只做"起宿主前的最小可用集"，不引 UI；
 *   macOS 的 `scutil --proxy` 解析是我们补的（PR 在非 win32 上直接 `systemUnsupported`）。
 */
const { spawnSync } = require('node:child_process')
const net = require('node:net')

/** 环回地址永远绕过代理（宿主自己的 HTTP/WS 都在 127.0.0.1，绕不过去会变成路由环）。 */
const LOOPBACK_NO_PROXY = ['localhost', '127.0.0.1', '::1', '[::1]']

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']

function defaultRun(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 3000 })
}

/** 把一个"host[:port]"或"http://host:port"的写法规范成 `http://host:port`；不合规返回 ''。
 *  ⛔ 只认 http/https；带认证信息（user:pass@）的写法**不采**（那会把密码塞进子进程环境与日志）。 */
function normalizeProxyUrl(raw, defaultPort = 80) {
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return ''
  let u
  try { u = new URL(text.includes('://') ? text : 'http://' + text) } catch { return '' }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
  if (u.username || u.password) return ''
  if (!u.hostname) return ''
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : defaultPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return ''
  const host = u.hostname.includes(':') && !u.hostname.startsWith('[') ? `[${u.hostname}]` : u.hostname
  return `${u.protocol}//${host}:${port}`
}

/** Windows `ProxyOverride`（如 `*zhihu.com;localhost;127.*;10.*;192.168.*;<local>`）→ NO_PROXY 串。
 *  能转的转（`*foo.com` / `*.foo.com` ⇒ `.foo.com`，裸域 ⇒ 原样，localhost 等 ⇒ 原样）；
 *  **IP 段通配（`172.2*`、`10.*`）转不了就丢掉** —— 宁可不绕过，也不要把"看起来匹配"的东西写进去。 */
function convertWindowsOverride(raw) {
  const out = []
  for (const piece of String(raw || '').split(';')) {
    const t = piece.trim().toLowerCase()
    if (!t || t === '<local>') continue
    if (/[*?]/.test(t.replace(/^\*\.?/, ''))) continue          // 里面还有通配（IP 段那类）⇒ 丢
    if (t.startsWith('*.')) { out.push(t.slice(1)); continue }   // *.foo.com ⇒ .foo.com
    if (t.startsWith('*')) { out.push('.' + t.slice(1)); continue } // *foo.com ⇒ .foo.com
    out.push(t)
  }
  return out
}

/** 解析 `reg query` 的四条值（纯函数，便于单测）。`values` 是 { ProxyEnable, ProxyServer, ProxyOverride, AutoConfigURL }
 *
 *  ⚠️ 返回值刻意分两个字段（2026-10-07 单测逼出来的 API 澄清）：
 *    · `configured` = 系统里**确实配着**一个代理（开关是开的）
 *    · `usable`     = **我们能用它**（http(s)、解析得出来）
 *    只看一个 `enabled` 会把"配了 SOCKS 但宿主不支持"与"根本没配"混成一件事 ⇒ 日志与决策都会说谎。 */
function fromWindowsValues(values) {
  const v = values || {}
  if (String(v.AutoConfigURL || '').trim()) {
    return { configured: true, usable: false, reason: 'pac', note: ['系统里配了 PAC 自动配置脚本，本层不解析（请用「手动代理」或代理软件的 TUN 模式）'] }
  }
  const on = /^(0x0*1|1)$/i.test(String(v.ProxyEnable || '').trim())
  if (!on) return { configured: false, usable: false, reason: 'off', note: [] }
  const raw = String(v.ProxyServer || '').trim()
  if (!raw) return { configured: true, usable: false, reason: 'empty', note: [] }
  let httpProxy = '', httpsProxy = ''
  if (!raw.includes('=')) {
    httpProxy = normalizeProxyUrl(raw)
    httpsProxy = httpProxy
  } else {
    const entries = {}
    for (const seg of raw.split(';')) {
      if (!seg.trim()) continue
      const i = seg.indexOf('=')
      if (i < 0) continue
      entries[seg.slice(0, i).trim().toLowerCase()] = seg.slice(i + 1).trim()
    }
    const other = Object.keys(entries).filter((k) => !['http', 'https', 'ftp'].includes(k))
    if (other.length) {
      // socks=… 之类：宿主只支持 http(s) ⇒ 明确报"配了但我们用不了"，而不是悄悄退回直连
      return { configured: true, usable: false, reason: 'unsupported', note: ['系统代理里有非 http(s) 的协议（' + other.join(', ') + '）⇒ 不注入（宿主只支持 http/https 代理；SOCKS 请用代理软件的 TUN 或它的 HTTP 端口）'] }
    }
    httpProxy = normalizeProxyUrl(entries.http || '')
    httpsProxy = normalizeProxyUrl(entries.https || '') || httpProxy
  }
  if (!httpProxy && !httpsProxy) return { configured: true, usable: false, reason: 'malformed', note: [] }
  return { configured: true, usable: true, httpProxy, httpsProxy: httpsProxy || httpProxy, noProxy: convertWindowsOverride(v.ProxyOverride), reason: '', note: [] }
}

/** 读 Windows「Internet 设置」（HKCU）。只读，不改任何系统设置。 */
function readWindowsSystemProxy(run = defaultRun) {
  const read = (name) => {
    const r = run('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', name])
    if (r && r.error) throw Object.assign(new Error('systemRead'), { code: 'systemRead' })
    const m = String((r && r.stdout) || '').match(new RegExp('\\b' + name + '\\s+REG_\\w+\\s+([^\\r\\n]+)'))
    return m ? m[1].trim() : ''
  }
  return fromWindowsValues({
    ProxyEnable: read('ProxyEnable'),
    ProxyServer: read('ProxyServer'),
    ProxyOverride: read('ProxyOverride'),
    AutoConfigURL: read('AutoConfigURL'),
  })
}

/** 解析 `scutil --proxy` 的输出（macOS）。样例：
 *    <dictionary> {
 *      ExceptionsList : <array> { 0 : *.local  1 : 169.254/16 }
 *      HTTPEnable : 1
 *      HTTPPort : 7890
 *      HTTPProxy : 127.0.0.1
 *      HTTPSEnable : 1
 *      HTTPSProxy : 127.0.0.1
 *      HTTPSPort : 7890
 *      ProxyAutoConfigEnable : 0
 *    }
 */
function parseScutilProxy(text) {
  const src = String(text || '')
  const one = (key) => {
    const m = src.match(new RegExp('^\\s*' + key + '\\s*:\\s*(.+?)\\s*$', 'm'))
    return m ? m[1].trim() : ''
  }
  const exceptions = []
  const arr = src.match(/ExceptionsList\s*:\s*<array>\s*\{([\s\S]*?)\}/)
  if (arr) for (const m of arr[1].matchAll(/\d+\s*:\s*(\S+)/g)) exceptions.push(m[1].toLowerCase())
  if (one('ProxyAutoConfigEnable') === '1' || one('ProxyAutoDiscoveryEnable') === '1') {
    return { configured: true, usable: false, reason: 'pac', note: ['系统里开了「自动代理配置(PAC)/自动发现」，本层不解析（请用手动代理或代理软件的 TUN 模式）'] }
  }
  const build = (en, hostKey, portKey, fallbackPort) => {
    if (one(en) !== '1') return ''
    const host = one(hostKey)
    if (!host) return ''
    return normalizeProxyUrl(`${host}:${one(portKey) || fallbackPort}`, fallbackPort)
  }
  const httpProxy = build('HTTPEnable', 'HTTPProxy', 'HTTPPort', 80)
  const httpsProxy = build('HTTPSEnable', 'HTTPSProxy', 'HTTPSPort', 443)
  /* SOCKS：macOS 上 SOCKSEnable/SOCKSProxy 是**独立**开关；开了但我们不采 ⇒ 明确报出来 */
  const socksOn = one('SOCKSEnable') === '1'
  if (!httpProxy && !httpsProxy) {
    return socksOn
      ? { configured: true, usable: false, reason: 'unsupported', note: ['系统里只开了 SOCKS 代理 ⇒ 不注入（宿主只支持 http/https；请用代理软件的 HTTP 端口或 TUN 模式）'] }
      : { configured: false, usable: false, reason: 'off', note: [] }
  }
  return { configured: true, usable: true, httpProxy, httpsProxy: httpsProxy || httpProxy, noProxy: exceptions, reason: '', note: socksOn ? ['系统里还开着 SOCKS 代理，本层只采 http(s) 那两条'] : [] }
}

function readMacSystemProxy(run = defaultRun) {
  const r = run('scutil', ['--proxy'])
  if (r && r.error) throw Object.assign(new Error('systemRead'), { code: 'systemRead' })
  return parseScutilProxy((r && r.stdout) || '')
}

/** 按平台读系统代理（纯探测，不做可达性判断、不碰 env）。 */
function readSystemProxy({ platform = process.platform, run = defaultRun } = {}) {
  if (platform === 'win32') return { ...readWindowsSystemProxy(run), source: 'windows-internet-settings' }
  if (platform === 'darwin') return { ...readMacSystemProxy(run), source: 'macos-scutil' }
  return { configured: false, usable: false, reason: 'unsupported-platform', note: [] }
}

/** 一次 TCP 可达性探测（默认 800ms）。返回 true/false；任何异常都当"不可达"。 */
function probeTcp(url, timeoutMs = 800) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch { return resolve(false) }
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80)
    const sock = net.connect({ host: u.hostname, port })
    let done = false
    const finish = (ok) => { if (done) return; done = true; try { sock.destroy() } catch { /* 忽略 */ } ; resolve(ok) }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))
  })
}

function envValue(env, key) { return String((env && (env[key] ?? env[key.toLowerCase()])) || '').trim() }

/** 决定"这次给子进程吃什么网络环境"。显式 env **优先**（用户自己设过就一个字都不动）。 */
async function decideProxy({ env = process.env, platform = process.platform, run = defaultRun, probe = probeTcp } = {}) {
  const rawEnvProxy = envValue(env, 'HTTPS_PROXY') || envValue(env, 'HTTP_PROXY') || envValue(env, 'ALL_PROXY')
  const explicit = normalizeProxyUrl(rawEnvProxy)
  const explicitNo = envValue(env, 'NO_PROXY')
  if (explicit) {
    return { use: 'env', proxy: explicit, noProxy: explicitNo, note: [], detail: '环境变量里已有代理（用户自己设的，优先）' }
  }
  /* 用户设了个我们（和宿主）都用不了的（SOCKS/PAC URL）⇒ 如实说出来，别让人以为"代理没生效" */
  const envNote = rawEnvProxy && !explicit
    ? ['环境变量里的代理 `' + rawEnvProxy + '` 不是 http(s) 代理 ⇒ 没有采用（宿主只支持 http/https）']
    : []
  let sys
  try { sys = readSystemProxy({ platform, run }) } catch (e) { return { use: 'direct', note: envNote.concat(['读系统代理失败（' + ((e && e.code) || e) + '）⇒ 直连']), detail: '读系统代理失败' } }
  if (!sys.configured) {
    return { use: 'direct', note: envNote.concat(sys.note || []), detail: sys.reason === 'unsupported-platform' ? '这个平台不读系统代理' : '系统代理未启用或未配' }
  }
  if (!sys.usable) return { use: 'direct', note: envNote.concat(sys.note || []), detail: '系统代理用不了（' + sys.reason + '）' }
  const target = sys.httpsProxy || sys.httpProxy
  let ok = false
  try { ok = await probe(target) } catch { ok = false }
  if (!ok) {
    return {
      use: 'direct',
      note: envNote.concat(sys.note || [], [`系统代理 ${target} 连不上（可能没开）⇒ 本次直连；要用代理请先把它启动起来再开助手`]),
      detail: '系统代理不可达',
    }
  }
  return {
    use: 'system', proxy: target, httpProxy: sys.httpProxy, httpsProxy: sys.httpsProxy,
    noProxy: [...(sys.noProxy || []), ...(explicitNo ? explicitNo.split(',') : [])].map((s) => String(s).trim()).filter(Boolean),
    note: envNote.concat(sys.note || []), detail: '走系统代理 ' + target + '（' + (sys.source || '') + '）',
  }
}

/** 把决定写成**新的** env 对象（绝不改入参）。 */
function childEnvWithProxy(inherited, decision) {
  const env = { ...inherited }
  if (!decision || decision.use === 'direct') return env
  const http = decision.httpProxy || decision.proxy
  const https = decision.httpsProxy || decision.proxy
  const noProxy = [...new Set([...(decision.noProxy || []), ...LOOPBACK_NO_PROXY])].join(',')
  for (const k of PROXY_ENV_KEYS) { delete env[k]; delete env[k.toLowerCase()] }
  env.HTTP_PROXY = http; env.http_proxy = http
  env.HTTPS_PROXY = https; env.https_proxy = https
  env.NO_PROXY = noProxy; env.no_proxy = noProxy
  return env
}

module.exports = {
  LOOPBACK_NO_PROXY, PROXY_ENV_KEYS, normalizeProxyUrl, convertWindowsOverride, fromWindowsValues,
  readWindowsSystemProxy, parseScutilProxy, readMacSystemProxy, readSystemProxy, probeTcp,
  decideProxy, childEnvWithProxy,
}
