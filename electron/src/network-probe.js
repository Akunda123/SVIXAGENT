// Runs in the bundled Node runtime with exactly the candidate host environment. No model calls.
'use strict'
const target = process.argv[2]
const timeout = Number(process.argv[3]) || 10000
;(async () => {
  try {
    const url = new URL(target)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('target')
    const r = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeout) })
    console.log(JSON.stringify({ ok: r.status >= 200 && r.status < 400, status: r.status }))
    await r.body?.cancel()
  } catch (e) {
    console.log(JSON.stringify({ ok: false, code: e.name === 'TimeoutError' ? 'timeout' : String(e.cause?.code || e.code || 'network') }))
  }
})()
