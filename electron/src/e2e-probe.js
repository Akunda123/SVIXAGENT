// 链路验证（0.1.5-rc.2 · Typert RPC）：session/create → session/follow + $events → session/prompt → 收事件
//
// 用法：node e2e-probe.js "<tokenUrl>"
//   例：node e2e-probe.js "http://127.0.0.1:3210/?token=xxxx"
//   tokenUrl = 宿主 stdout 那行 `dsh web: http://127.0.0.1:<port>/?token=…`（也可用 AKDAGENT_DSH_TOKEN_URL）
//
// 为什么必须带 tokenUrl：0.1.5-rc.2 把整个 web 面（含 /api/* 与 mux WS）都锁了会话 ——
//   裸请求 401，`?token=` 只用于换 cookie，后续请求都要带 Cookie 头。
//
// 协议要点（详见 electron/src/main.js 顶部注释）：
//   一元：POST /api/<endpoint>  {type:'client-request',rpcId,method,payload:{args}}  → {ok,value|error}
//   流  ：WS /api/remote.mux    {type:'open',streamId,endpoint,payload:{args}} → item/error/end
//         · '$events'         应用事件（waterfall = 需要应答的审批/提问）
//         · 'session/follow'  会话日志（首帧 snapshot = 历史，随后 event / assistant-stream）
'use strict'
const http = require('node:http')
const WebSocket = require('ws')

const tokenUrl = process.argv[2] || process.env.AKDAGENT_DSH_TOKEN_URL
if (!tokenUrl) {
  console.error('用法：node e2e-probe.js "<tokenUrl>"（宿主 stdout 里的 `dsh web: …/?token=…`）')
  process.exit(2)
}
const port = Number(new URL(tokenUrl).port)
let cookie = null

function getCookie(u, seen = 0) {
  return new Promise((resolve, reject) => {
    const r = http.get(u, (res) => {
      const sc = res.headers['set-cookie']
      const loc = res.headers.location
      res.resume()
      if (sc && sc.length) resolve({ cookie: sc.map((c) => c.split(';')[0]).join('; '), status: res.statusCode })
      else if (loc && seen < 5) getCookie(new URL(loc, u).toString(), seen + 1).then(resolve)
      else reject(new Error(`换 cookie 失败（HTTP ${res.statusCode}${loc ? ' → ' + loc : ''}）`))
    })
    r.on('error', reject)
    r.setTimeout(10000, () => { r.destroy(); reject(new Error('换 cookie 超时')) })
  })
}

let seq = 0
function call(endpoint, args) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: `probe-${++seq}`, method: endpoint, payload: { args: args || {} } })
    const req = http.request(
      { host: '127.0.0.1', port, path: `/api/${endpoint}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
          ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            const j = JSON.parse(d)
            if (j && j.type === 'server-response' && j.result && j.result.ok) resolve(j.result.value)
            else reject(new Error(`${endpoint}: ${JSON.stringify(j && j.result && j.result.error)}`))
          } catch (e) { reject(e) }
        })
      })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/** 在一条 mux socket 上开一条逻辑流；返回 streamId */
function openStream(ws, endpoint, args, onValue) {
  const streamId = 'e2e-' + Math.random().toString(36).slice(2, 8)
  streams.set(streamId, onValue)
  ws.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args: args || {} } }))
  return streamId
}
const streams = new Map()

async function main() {
  const c = await getCookie(tokenUrl)
  cookie = c.cookie
  console.log(`[e2e] cookie 就绪（HTTP ${c.status}）port=${port}`)

  const created = await call('session/create', { request: {} })
  const sid = created.sessionId
  console.log('[e2e] session/create →', sid, created.agentPreset ? `(preset=${created.agentPreset})` : '')

  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/remote.mux`, { headers: { Cookie: cookie } })
  const seen = new Set()
  let turnEnded = false

  const timeout = setTimeout(() => {
    console.log('[e2e] TIMEOUT — 未等到 turn/end，已见事件:', [...seen].join(', '))
    process.exit(2)
  }, 180000)

  ws.on('error', (e) => { console.log('[e2e] ws error:', e.message); process.exit(1) })
  ws.on('message', (raw) => {
    let f
    try { f = JSON.parse(raw.toString()) } catch { return }
    if (f.type === 'error') { console.log('[e2e] 流错误:', JSON.stringify(f.error)); return }
    if (f.type !== 'item') return
    const fn = streams.get(f.streamId)
    if (fn) return fn(f.value)
    // 未登记的流（本探针只开两条，正常不会走到）
  })

  ws.on('open', async () => {
    console.log('[e2e] mux open；订阅 $events + session/follow')
    openStream(ws, '$events', {}, (v) => {
      if (v && v.type === 'ready') console.log(`[e2e] $events ready（clientId=${String(v.clientId).slice(0, 8)}… home=${v.host && v.host.home}）`)
      else if (v && v.type === 'waterfall') console.log(`[e2e] \$events waterfall: ${v.event}（需应答）`)
      else if (v && v.type === 'emit') console.log(`[e2e] \$events emit: ${v.event}`)
    })
    openStream(ws, 'session/follow', { request: { address: { kind: 'session', sessionId: sid }, assistantStream: true } }, (v) => {
      if (!v) return
      if (v.type === 'snapshot') {
        console.log(`[e2e] follow snapshot: cursor=${v.cursor} records=${(v.records || []).length} version=${v.header && v.header.version}`)
        return
      }
      if (v.type === 'assistant-stream') {
        const fr = v.frame || {}
        if (fr.type === 'chunk' && fr.chunk && fr.chunk.type === 'text-delta') process.stdout.write(fr.chunk.text || '')
        seen.add('assistant-stream/' + fr.type)
        return
      }
      if (v.type === 'event' && v.event) {
        const ev = v.event
        seen.add(ev.type)
        const d = ev.data || {}
        if (ev.type === 'turn/end') {
          turnEnded = true
          console.log('\n[e2e] turn/end reason:', JSON.stringify(d.reason))
          clearTimeout(timeout)
          try { ws.close() } catch { /* ignore */ }
          console.log('[e2e] SUMMARY 事件类型:', [...seen].join(', '))
          process.exit(0)
        }
      }
    })

    // 会话级选模型（不动全局 settings.yaml）；失败不致命
    try {
      await call('session/selectModel', { request: { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' } })
      console.log('[e2e] selectModel → deepseek-v4-flash/high')
    } catch (e) { console.log('[e2e] selectModel 跳过:', e.message) }

    await new Promise((r) => setTimeout(r, 300))   // 让两条流的 open 先落地
    const r = await call('session/prompt', { request: {
      requestId: 'e2e-' + Date.now().toString(36),
      sessionId: sid, mode: 'queue',
      content: [{ type: 'text', text: '你好，请只回复一句话：收到。' }],
    } })
    console.log('[e2e] prompt accepted:', r.accepted)
  })
}

main().catch((e) => { console.error('[e2e] FAIL:', e.message); process.exit(1) })
