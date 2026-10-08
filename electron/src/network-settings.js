'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const schema = require('./network-schema')
const LOOPBACK = ['localhost', '127.0.0.1', '127.*', '::1', '[::1]']
const BYPASS = 'localhost,127.0.0.0/8,[::1],<local>'
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']
const codeError = (code, field) => Object.assign(new Error(code), { code, field })

function readSystemProxy(platform = process.platform, query = (name) => {
  const r = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', name], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
  if (r.error) throw codeError('systemRead')
  const m = (r.stdout || '').match(new RegExp('\\b' + name + '\\s+REG_\\w+\\s+([^\\r\\n]+)'))
  return m ? m[1].trim() : ''
}) {
  if (platform !== 'win32') throw codeError('systemUnsupported')
  if (query('AutoConfigURL')) throw codeError('pacUnsupported')
  if (parseInt(query('ProxyEnable') || '0', 16) !== 1) return { httpProxy: '', httpsProxy: '' }
  const raw = query('ProxyServer')
  if (!raw) throw codeError('systemRead')
  function asUrl(value) {
    if (!value) return ''
    let u
    try { u = new URL(value.includes('://') ? value : 'http://' + value) } catch { throw codeError('systemRead') }
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw codeError('systemRead')
    return schema.endpoint({ protocol: u.protocol.slice(0, -1), host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80) }).url
  }
  if (!raw.includes('=')) { const p = asUrl(raw); return { httpProxy: p, httpsProxy: p } }
  const entries = Object.fromEntries(raw.split(';').filter(Boolean).map((v) => v.split('=').map((s) => s.trim())))
  if (entries.socks || Object.keys(entries).some((k) => !['http', 'https', 'ftp'].includes(k))) throw codeError('systemUnsupported')
  return { httpProxy: asUrl(entries.http || ''), httpsProxy: asUrl(entries.https || '') }
}

function envValue(env, key) { return env[key.toLowerCase()] ?? env[key] ?? '' }
function withBypass(existing) {
  if (String(existing).split(',').some((s) => s.trim() === '*')) return '*'
  return [...new Set([...String(existing || '').split(',').map((s) => s.trim()).filter(Boolean), ...LOOPBACK])].join(',')
}
function resolvePolicy(config, inherited, systemReader = readSystemProxy) {
  config = schema.validate(config)
  let mode = config.selected, httpProxy = '', httpsProxy = '', noProxy = withBypass(''), label = '', url = ''
  let chromium = { mode: 'direct' }
  if (mode === 'inherit') {
    httpProxy = envValue(inherited, 'HTTP_PROXY') || envValue(inherited, 'ALL_PROXY')
    httpsProxy = envValue(inherited, 'HTTPS_PROXY') || envValue(inherited, 'ALL_PROXY') || httpProxy
    noProxy = withBypass(envValue(inherited, 'NO_PROXY'))
    // Preserve the application's existing Chromium/system/command-line policy.
    chromium = null
  } else if (mode === 'system') {
    const p = systemReader(); httpProxy = p.httpProxy; httpsProxy = p.httpsProxy
    if (!httpProxy && !httpsProxy) noProxy = '*'
    chromium = httpProxy || httpsProxy ? { mode: 'fixed_servers', proxyRules: [httpProxy && `http=${httpProxy}`, httpsProxy && `https=${httpsProxy}`].filter(Boolean).join(';'), proxyBypassRules: BYPASS } : { mode: 'direct' }
  } else if (mode === 'direct') { noProxy = '*' }
  else {
    const profile = config.profiles.find((p) => p.id === mode)
    url = schema.endpoint(profile).url; label = profile.name
    httpProxy = httpsProxy = url
    mode = 'profile'
    chromium = { mode: 'fixed_servers', proxyRules: url, proxyBypassRules: BYPASS }
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ mode, httpProxy, httpsProxy, noProxy, chromium })).digest('hex')
  return { selected: config.selected, mode, httpProxy, httpsProxy, noProxy, chromium, fingerprint, label, url }
}
function childEnvironment(inherited, policy) {
  const env = { ...inherited }
  if (policy.mode !== 'inherit') {
    for (const k of PROXY_KEYS) { delete env[k]; delete env[k.toLowerCase()] }
    // Empty values plus NO_PROXY=* prevent layered .env files from reviving a proxy in direct mode.
    env.HTTP_PROXY = env.http_proxy = policy.httpProxy
    env.HTTPS_PROXY = env.https_proxy = policy.httpsProxy
    env.ALL_PROXY = env.all_proxy = ''
  }
  env.NO_PROXY = env.no_proxy = policy.noProxy
  env.NODE_USE_ENV_PROXY = '1'
  return env
}
function publicPolicy(policy) {
  if (!policy) return null
  // Inherited endpoints can contain passwords. Never cross the renderer boundary with them.
  return { selected: policy.selected, mode: policy.mode, label: policy.label, url: policy.url, fingerprint: policy.fingerprint }
}
function createStore(dir) {
  const file = path.join(dir, 'network-settings.json')
  function read() {
    if (!fs.existsSync(file)) return schema.defaults()
    try {
      if (fs.statSync(file).size > 32768) throw codeError('read')
      return schema.validate(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch { throw codeError('read') }
  }
  function write(input) {
    const next = schema.validate(input), before = read()
    if (next.revision !== before.revision) throw codeError('conflict')
    next.revision++
    fs.mkdirSync(dir, { recursive: true })
    const temp = `${file}.${crypto.randomUUID()}.tmp`
    try {
      fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      if (fs.existsSync(file)) fs.copyFileSync(file, file + '.previous')
      fs.renameSync(temp, file)
    } catch {
      try { fs.unlinkSync(temp) } catch {}
      throw codeError('write')
    }
    return next
  }
  return { file, read, write }
}
module.exports = { schema, LOOPBACK, BYPASS, codeError, readSystemProxy, resolvePolicy, childEnvironment, publicPolicy, createStore }
