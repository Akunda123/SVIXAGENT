'use strict'

// All UI surfaces share a single binding flight. A segment switch while an RPC is
// pending is revalidated before returning; parallel selectors cannot create twice.
function createSessionBinding({ segmentKey, ensure, ready, show }) {
  let flight = null
  async function bind({ reveal = false } = {}) {
    await ready()
    if (reveal) show()
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = segmentKey()
      if (!flight) {
        const current = { key, promise: Promise.resolve().then(ensure) }
        flight = current
        current.promise.finally(() => { if (flight === current) flight = null }).catch(() => {})
      }
      const current = flight
      const id = await current.promise
      if (current.key === key && segmentKey() === key) return id
    }
    throw Object.assign(new Error('session changed during binding; retry'), { code: 'SESSION_CHANGED' })
  }
  return { bind }
}
module.exports = { createSessionBinding }
