#!/usr/bin/env node
/**
 * test-system-proxy.cjs —— 单测：`electron/src/system-proxy.js`（系统代理 → 子进程环境变量）。
 *
 * 背景（2026-10-07 用户报「OpenAI Plus 登录 403 地区不受支持，换网络也没用」）：
 *   宿主只认环境变量里的代理，而 Node 不读 Windows 系统代理 ⇒ 用户设成"系统代理"时助手一直直连。
 *   这一层把系统代理探出来注入，**但必须带着四条安全口径**（少一条都会把用户坑得更惨）：
 *     ① `ProxyEnable=0` 不注入（Windows 会把上次的 ProxyServer 永久留着 —— 本机实测就是 0x0 + 127.0.0.1:7890）
 *     ② 注入前 TCP 探一次（代理没起来时宁可直连）
 *     ③ SOCKS / PAC 不采（宿主只支持 http(s)）
 *     ④ 不改 `process.env`（`app.relaunch()` 要继承原环境）
 *   本文件里的 Windows/macOS 样本**取自真实机器/真实 scutil 输出格式**，不是编的。
 *
 * 用法：node tools/test-system-proxy.cjs
 */
'use strict'
const net = require('node:net')
const SP = require('../electron/src/system-proxy.js')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name) }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : '')) }
}

/* ── 真实样本 ─────────────────────────────────────────────────────── */
// 本机实测（Windows + Clash 风格）：开关关着，但服务器地址还留着 ⇒ 这就是"不能只看 ProxyServer"的证据
const REAL_WIN_OFF = { ProxyEnable: '0x0', ProxyServer: '127.0.0.1:7890', ProxyOverride: '*zhihu.com;*zhimg.com;*jd.com;100ime-iat-api.xfyun.cn;*360buyimg.com;localhost;*.local;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*;192.168.*', AutoConfigURL: '' }
const REAL_SCUTIL = `
<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254/16
  }
  ExcludeSimpleHostnames : 1
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  ProxyAutoConfigEnable : 0
  ProxyAutoDiscoveryEnable : 0
  SOCKSEnable : 0
}
`

console.log('== ① 代理 URL 规范化（不合法的一律丢掉，别把垃圾喂给子进程）==')
ok('127.0.0.1:7890 -> http://127.0.0.1:7890', SP.normalizeProxyUrl('127.0.0.1:7890') === 'http://127.0.0.1:7890', SP.normalizeProxyUrl('127.0.0.1:7890'))
ok('带 scheme 的原样规范化', SP.normalizeProxyUrl('http://p.example.com:3128') === 'http://p.example.com:3128')
ok('https 缺端口补 443', SP.normalizeProxyUrl('https://p.example.com') === 'https://p.example.com:443')
ok('SOCKS 不采（宿主只支持 http(s)）', SP.normalizeProxyUrl('socks5://127.0.0.1:1080') === '')
ok('带账号密码的不采（别把密码塞进子进程环境/日志）', SP.normalizeProxyUrl('http://u:p@h:8080') === '')
ok('空/垃圾不采', SP.normalizeProxyUrl('') === '' && SP.normalizeProxyUrl('::not a url::') === '')
ok('IPv6 加方括号', SP.normalizeProxyUrl('[::1]:7890') === 'http://[::1]:7890', SP.normalizeProxyUrl('[::1]:7890'))

console.log('\n== ② Windows ProxyOverride → NO_PROXY（能转的转，IP 段通配丢掉）==')
{
  const list = SP.convertWindowsOverride(REAL_WIN_OFF.ProxyOverride)
  ok('*zhihu.com -> .zhihu.com', list.includes('.zhihu.com'), list)
  ok('裸域保留（100ime-iat-api.xfyun.cn）', list.includes('100ime-iat-api.xfyun.cn'))
  ok('localhost 保留', list.includes('localhost'))
  ok('*.local -> .local', list.includes('.local'))
  ok('IP 段通配（127.* / 10.* / 192.168.* / 172.2*）全部丢掉', !list.some((x) => /\*/.test(x)), list)
  ok('<local> 丢掉且不产生空项', !list.includes('<local>') && !list.includes(''))
}

console.log('\n== ③ Windows 注册表值 → 代理（开关是硬判据）==')
{
  const off = SP.fromWindowsValues(REAL_WIN_OFF)
  ok('ProxyEnable=0x0 ⇒ 没配（哪怕 ProxyServer 还留着）', off.configured === false && off.usable === false && off.reason === 'off', off)
  const on = SP.fromWindowsValues({ ...REAL_WIN_OFF, ProxyEnable: '0x1' })
  ok('ProxyEnable=0x1 ⇒ 可用，http/https 都指向它', on.configured === true && on.usable === true && on.httpProxy === 'http://127.0.0.1:7890' && on.httpsProxy === 'http://127.0.0.1:7890', on)
  const split = SP.fromWindowsValues({ ProxyEnable: '0x1', ProxyServer: 'http=a.example:1;https=b.example:2' })
  ok('分协议写法（http=…;https=…）能拆开', split.httpProxy === 'http://a.example:1' && split.httpsProxy === 'http://b.example:2', split)
  const socks = SP.fromWindowsValues({ ProxyEnable: '0x1', ProxyServer: 'socks=127.0.0.1:1080' })
  ok('只有 SOCKS ⇒ configured 但 !usable，并给出人话原因', socks.configured === true && socks.usable === false && socks.reason === 'unsupported' && /SOCKS/.test(socks.note.join('')), socks)
  const pac = SP.fromWindowsValues({ ...REAL_WIN_OFF, ProxyEnable: '0x1', AutoConfigURL: 'http://x/proxy.pac' })
  ok('有 PAC ⇒ configured 但 !usable（不跑 JS 解析）', pac.configured === true && pac.usable === false && pac.reason === 'pac', pac)
  const empty = SP.fromWindowsValues({ ProxyEnable: '0x1', ProxyServer: '' })
  ok('开关开着但没地址 ⇒ !usable', empty.usable === false, empty)
}

console.log('\n== ④ macOS scutil --proxy 解析（真实输出格式）==')
{
  const mac = SP.parseScutilProxy(REAL_SCUTIL)
  ok('HTTP/HTTPS 都开 ⇒ 两条都拿到', mac.usable === true && mac.httpProxy === 'http://127.0.0.1:7890' && mac.httpsProxy === 'http://127.0.0.1:7890', mac)
  ok('ExceptionsList 进 noProxy（*.local / 169.254/16）', mac.noProxy.includes('*.local') && mac.noProxy.includes('169.254/16'), mac.noProxy)
  const pac = SP.parseScutilProxy(REAL_SCUTIL.replace('ProxyAutoConfigEnable : 0', 'ProxyAutoConfigEnable : 1'))
  ok('PAC 开着 ⇒ !usable 并说明原因', pac.usable === false && pac.reason === 'pac', pac)
  const socksOnly = SP.parseScutilProxy(REAL_SCUTIL.replace(/HTTPEnable : 1/, 'HTTPEnable : 0').replace(/HTTPSEnable : 1/, 'HTTPSEnable : 0').replace('SOCKSEnable : 0', 'SOCKSEnable : 1'))
  ok('只开 SOCKS ⇒ configured 但 !usable + 人话原因', socksOnly.configured === true && socksOnly.usable === false && socksOnly.reason === 'unsupported', socksOnly)
  const allOff = SP.parseScutilProxy(REAL_SCUTIL.replace(/HTTPEnable : 1/, 'HTTPEnable : 0').replace(/HTTPSEnable : 1/, 'HTTPSEnable : 0'))
  ok('全关 ⇒ 没配代理', allOff.configured === false, allOff)
}

console.log('\n== ⑤ 决定逻辑：显式 env 优先 / 系统开关 / 可达性 ==')
;(async () => {
  const fakeRun = (stdoutByKey) => (cmd, args) => {
    const name = args[args.length - 1]
    return { stdout: stdoutByKey[name] !== undefined ? stdoutByKey[name] : '', error: null }
  }
  const winOn = fakeRun({
    ProxyEnable: 'HKEY  ProxyEnable  REG_DWORD  0x1',
    ProxyServer: 'HKEY  ProxyServer  REG_SZ  127.0.0.1:7890',
    ProxyOverride: 'HKEY  ProxyOverride  REG_SZ  <local>',
    AutoConfigURL: '',
  })
  const d1 = await SP.decideProxy({ env: { HTTPS_PROXY: 'http://explicit:8080' }, platform: 'win32', run: winOn, probe: async () => true })
  ok('显式 env 优先（不动用户自己设的）', d1.use === 'env' && d1.proxy === 'http://explicit:8080', d1)

  const d2 = await SP.decideProxy({ env: {}, platform: 'win32', run: fakeRun({ ProxyEnable: 'HKEY  ProxyEnable  REG_DWORD  0x0' }), probe: async () => true })
  ok('系统代理关着 ⇒ 直连', d2.use === 'direct', d2)

  const d3 = await SP.decideProxy({ env: {}, platform: 'win32', run: winOn, probe: async () => true })
  ok('系统代理开着且可达 ⇒ 走它', d3.use === 'system' && d3.proxy === 'http://127.0.0.1:7890', d3)
  ok('决策里带上了 ProxyOverride 转来的绕过项（环回在写入那一步再加）', Array.isArray(d3.noProxy), d3.noProxy)

  const d4 = await SP.decideProxy({ env: {}, platform: 'win32', run: winOn, probe: async () => false })
  ok('系统代理连不上 ⇒ 直连 + 明确说明（宁可直连，也不能整条链路全废）',
    d4.use === 'direct' && /连不上/.test((d4.note || []).join(' ')), d4)

  const macRun = () => ({ stdout: REAL_SCUTIL, error: null })
  const d5 = await SP.decideProxy({ env: {}, platform: 'darwin', run: macRun, probe: async () => true })
  ok('macOS：scutil 解析后同样能走系统代理', d5.use === 'system' && d5.proxy === 'http://127.0.0.1:7890', d5)

  const d6 = await SP.decideProxy({ env: {}, platform: 'linux', run: () => ({ stdout: '', error: null }), probe: async () => true })
  ok('不支持的平台（linux）⇒ 直连（不硬编系统代理）', d6.use === 'direct', d6)

  console.log('\n== ⑥ 写进子进程环境：不改入参、两个大小写都写、环回必绕 ==')
  {
    const inherited = { PATH: 'x', HTTPS_PROXY: 'http://old:1', https_proxy: 'http://old:1' }
    const frozen = JSON.stringify(inherited)
    const env = SP.childEnvWithProxy(inherited, { use: 'system', proxy: 'http://127.0.0.1:7890', httpProxy: 'http://127.0.0.1:7890', httpsProxy: 'http://127.0.0.1:7890', noProxy: ['.zhihu.com'] })
    ok('入参对象**没被改**（process.env 不许动）', JSON.stringify(inherited) === frozen, inherited)
    ok('是**新对象**', env !== inherited)
    ok('HTTP(S)_PROXY 大小写都写', env.HTTPS_PROXY === 'http://127.0.0.1:7890' && env.https_proxy === 'http://127.0.0.1:7890' && env.HTTP_PROXY === 'http://127.0.0.1:7890')
    ok('NO_PROXY 含转换来的 .zhihu.com + 环回', /\.zhihu\.com/.test(env.NO_PROXY) && /localhost/.test(env.NO_PROXY) && /127\.0\.0\.1/.test(env.NO_PROXY), env.NO_PROXY)
    ok('旧值被覆盖（不是并列两份）', env.HTTPS_PROXY !== 'http://old:1')
    const direct = SP.childEnvWithProxy(inherited, { use: 'direct' })
    ok('直连模式不动代理键（用户自己的 env 保持原样）', direct.HTTPS_PROXY === 'http://old:1')
  }

  console.log('\n== ⑦ 真 TCP 可达性探测（起一个真监听听 127.0.0.1 的随机端口）==')
  await new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port
      const yes = await SP.probeTcp('http://127.0.0.1:' + port, 800)
      ok('有监听 ⇒ true', yes === true)
      srv.close()
      const no = await SP.probeTcp('http://127.0.0.1:' + port, 400)
      ok('刚关掉（没人听）⇒ false', no === false)
      ok('垃圾 URL ⇒ false（不抛）', (await SP.probeTcp('nonsense', 200)) === false)
      resolve()
    })
  })

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
  process.exit(fail ? 1 : 0)
})()
