'use strict'
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { randomUUID } = require('node:crypto')
const { loginTimeoutMs } = require('./codex-catalog.cjs')

function authUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === 'auth.openai.com' && !u.username && !u.password &&
      !u.port && ['/oauth/authorize', '/api/accounts/authorize', '/codex/device'].includes(u.pathname) ? u.href : null
  } catch { return null }
}

function createCodexService({ paths, emit, openExternal, spawnWorker = spawn }) {
  let active, authBusy = false
  const children = new Set()
  function run(command, method, initial) {
    const { node, worker, root, home } = paths()
    const env = { ...process.env }
    for (const key of Object.keys(env)) if (/^DSH_/i.test(key) || /^PI_OAUTH_/i.test(key)) delete env[key]
    return new Promise(resolve => {
      const id = randomUUID()
      const child = spawnWorker(node, [worker, root, home, command, method || 'browser'], {
        env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      })
      children.add(child)
      const attempt = { id, child, prompt: null }
      if (command === 'login') active = attempt
      let result, completed = false, bytes = 0
      const finish = fallback => {
        if (completed) return
        completed = true
        clearTimeout(timeout)
        lines.close()
        children.delete(child)
        if (active === attempt) active = undefined
        resolve(result || fallback)
      }
      const timeout = setTimeout(() => {
        child.kill()
        finish({ ok: false, error: 'timeout' })
      }, command === 'login' ? loginTimeoutMs(method) + 10000 : 15000)
      const lines = createInterface({ input: child.stdout })
      child.stdout.on('data', data => { bytes += data.length; if (bytes > 1024 * 1024) child.kill() })
      child.stderr.resume() // Never log provider errors or credential parser input.
      child.stdin.on('error', () => {})
      if (initial) child.stdin.write(JSON.stringify(initial) + '\n')
      lines.on('line', line => {
        if (line.length > 256000) return
        let event
        try { event = JSON.parse(line) } catch { return }
        if (event.type === 'result') { result = event; return }
        if (active !== attempt) return
        if (event.type === 'auth-url' || event.type === 'device-code') {
          const url = authUrl(event.url)
          if (!url) { child.kill(); return }
          emit({ attempt: id, type: event.type, url, code: typeof event.code === 'string' ? event.code.slice(0,32) : '' })
          Promise.resolve().then(() => openExternal(url)).catch(() => {
            if (active === attempt) emit({ attempt: id, type: 'browser-failed' })
          })
        } else if (event.type === 'prompt' && Number.isInteger(event.id)) {
          attempt.prompt = event.id
          emit({ attempt: id, type: 'prompt', id: event.id })
        } else if (event.type === 'prompt-end') {
          if (attempt.prompt === event.id) attempt.prompt = null
          emit({ attempt: id, type: 'prompt-end', id: event.id })
        }
      })
      child.on('error', () => finish({ ok: false, error: 'runtime-unavailable' }))
      child.on('close', () => finish({ ok: false, error: 'auth-failed' }))
    })
  }
  return {
    run: command => ['status', 'catalog'].includes(command) ? run(command) : Promise.resolve({ ok: false, error: 'invalid-command' }),
    setKey: (ref, value) => run('set-key', undefined, { type: 'key', ref, value }),
    async login(method) {
      if (authBusy) return { ok: false, error: 'busy' }
      if (!['browser', 'device'].includes(method)) return { ok: false, error: 'invalid-method' }
      authBusy = true
      try {
        const result = await run('login', method)
        emit({ type: 'finished', ok: !!result.ok, error: result.error })
        return result
      } finally { authBusy = false }
    },
    reply(attempt, id, value) {
      if (!active || active.id !== attempt || active.prompt !== id || typeof value !== 'string' || value.length > 8192) return { ok: false }
      active.child.stdin.write(JSON.stringify({ type: 'answer', id, value }) + '\n')
      return { ok: true }
    },
    cancel() {
      if (active) { active.child.stdin.write('{"type":"cancel"}\n'); const child = active.child; setTimeout(() => child.kill(), 2000).unref() }
      return { ok: true }
    },
    async logout() {
      // Do not allow a late login result to recreate a deleted credential.
      if (authBusy) return { ok: false, error: 'busy' }
      authBusy = true
      try { return await run('logout') }
      finally { authBusy = false }
    },
    dispose() { for (const child of children) child.kill(); active = undefined },
  }
}
module.exports = { authUrl, createCodexService }
