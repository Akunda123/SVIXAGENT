// Read-only localhost startup check. Never logs tokens, cookies, credentials or session content.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const file = path.join(process.env.APPDATA, 'AKDAgent', 'embedded-host.json')
function request(port, pathname, cookie, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: body ? 'POST' : 'GET', agent: new http.Agent(),
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) },
    }, (res) => {
      let content = ''
      res.on('data', (chunk) => { content += chunk; if (content.length > 2 * 1024 * 1024) req.destroy(new Error('size')) })
      res.on('end', () => resolve({ status: res.statusCode, cookie: (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; '), location: res.headers.location, content }))
      res.on('error', reject)
    })
    req.setTimeout(5000, () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
;(async () => {
  const record = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!record.tokenUrl || !Number.isInteger(record.port) || record.port < 3180 || record.port > 3300) throw new Error('record')
  let url = new URL(record.tokenUrl), cookie = ''
  for (let i = 0; i < 4; i++) {
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || Number(url.port) !== record.port || url.protocol !== 'http:') throw new Error('url')
    const r = await request(record.port, url.pathname + url.search, cookie)
    if (r.cookie) cookie = r.cookie
    if (r.status >= 300 && r.status < 400 && r.location) { url = new URL(r.location, url); continue }
    break
  }
  const r = await request(record.port, '/api/session/list', cookie, { type: 'client-request', rpcId: 'network-install-readonly-check', method: 'session/list', payload: { args: { _request: {} } } })
  const result = JSON.parse(r.content)
  const items = result.result?.value?.items
  const ok = r.status === 200 && result.result?.ok === true && Array.isArray(items)
  console.log(JSON.stringify({ clientVersion: record.v, hostPid: record.pid, port: record.port, localhostAPIStatus: r.status, sessionListOK: ok, runningSessions: ok ? items.filter((x) => x.running).length : null }, null, 2))
  if (ok && process.argv.includes('--catalog')) {
    const c = await request(record.port, '/api/session/modelCatalog', cookie, { type: 'client-request', rpcId: 'catalog-install-readonly-check', method: 'session/modelCatalog', payload: { args: {} } })
    const result = JSON.parse(c.content), catalog = result.result?.value
    const groups = (catalog?.groups || []).map((g) => ({ provider: g.id, count: g.models?.length || 0,
      latest: (g.models || []).filter((m) => /gpt-6|claude-(opus|sonnet|haiku)-5[.-]5|kimi-for-coding|grok-4.7/.test(m.id)).map((m) => m.id) }))
    console.log(JSON.stringify({ modelCatalogOK: c.status === 200 && result.result?.ok === true, groups, default: catalog?.default }, null, 2))
    if (result.result?.ok !== true) process.exitCode = 1
  }
  if (!ok) process.exitCode = 1
})().catch((e) => { console.log(JSON.stringify({ ok: false, code: e.code || 'local-check-failed' })); process.exitCode = 1 })
