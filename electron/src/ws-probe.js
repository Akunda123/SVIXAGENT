/* 只读探针：验证主进程能否连上 DSH host 的 mux 并订阅 `$events`。
 *
 * 0.1.5-rc.2 起：整个 web 面要会话 cookie ⇒ 必须先用 stdout 那行 token URL 换 cookie，
 * 再连 `/api/remote.mux`（旧名 `/api/events.mux` 已废），并按逻辑流协议发 `open` 帧。
 * 完整链路验收请用 `e2e-probe.js`；本探针只看"连得上 + 收得到帧"。
 *
 * 用法: node ws-probe.js "<tokenUrl>" [seconds]
 */
'use strict'
const http = require('node:http')
const WebSocket = require('ws')

const tokenUrl = process.argv[2] || process.env.AKDAGENT_DSH_TOKEN_URL
if (!tokenUrl) {
  console.error('用法: node ws-probe.js "<tokenUrl>" [seconds]   （tokenUrl = 宿主 stdout 的 `dsh web:` 行）')
  process.exit(2)
}
const seconds = Number(process.argv[3] || 8)
const port = Number(new URL(tokenUrl).port)

function getCookie(u, seen = 0) {
  return new Promise((resolve, reject) => {
    const r = http.get(u, (res) => {
      const sc = res.headers['set-cookie']
      const loc = res.headers.location
      res.resume()
      if (sc && sc.length) resolve(sc.map((c) => c.split(';')[0]).join('; '))
      else if (loc && seen < 5) getCookie(new URL(loc, u).toString(), seen + 1).then(resolve)
      else reject(new Error('换 cookie 失败（HTTP ' + res.statusCode + '）'))
    })
    r.on('error', reject)
    r.setTimeout(8000, () => { r.destroy(); reject(new Error('换 cookie 超时')) })
  })
}

;(async () => {
  let cookie
  try { cookie = await getCookie(tokenUrl) } catch (e) { console.error('ERROR: ' + e.message); process.exit(1) }
  const url = `ws://127.0.0.1:${port}/api/remote.mux`
  console.log(`connecting ${url} (cookie ok) ...`)

  const ws = new WebSocket(url, { headers: { Cookie: cookie } })
  let count = 0
  const types = new Set()
  ws.on('open', () => {
    console.log('OPEN ok - auth passed')
    ws.send(JSON.stringify({ type: 'open', streamId: 'probe-events', endpoint: '$events', payload: { args: {} } }))
  })
  ws.on('message', (data) => {
    count++
    try {
      const o = JSON.parse(data.toString())
      const v = o && o.value
      types.add((v && v.type) || o.type || '?')
      if (count <= 3) console.log('frame:', JSON.stringify(o).slice(0, 300))
    } catch { /* ignore */ }
  })
  ws.on('close', (code, reason) => {
    console.log(`CLOSE code=${code} frames=${count} types=[${[...types].join(',')}]`)
    process.exit(0)
  })
  ws.on('error', (e) => { console.log('ERROR:', e.message); process.exit(1) })
  setTimeout(() => {
    console.log(`timeout: frames=${count} types=[${[...types].join(',')}]`)
    try { ws.close() } catch { /* ignore */ }
    process.exit(0)
  }, seconds * 1000)
})()
