'use strict'
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { pathToFileURL } = require('node:url')
const N = require('./network-settings')
const TARGET = 'https://www.cloudflare.com/cdn-cgi/trace'
function probeEntry() {
  const source = path.join(__dirname, 'network-probe.js')
  // External Node cannot read Electron ASAR archives. The builder explicitly unpacks this entry.
  const unpacked = source.replace(/\.asar([\\/])/, '.asar.unpacked$1')
  if (unpacked !== source) {
    if (!fs.existsSync(unpacked)) throw N.codeError('network')
    return unpacked
  }
  return source
}

function electronDownloadTransport(net, ses) {
  return (url, cb) => {
    const out = new EventEmitter()
    const req = net.request({ url, session: ses, redirect: 'manual' })
    let redirected = false, failed = false
    out.destroy = (error) => {
      req.abort()
      if (error && !failed) { failed = true; out.emit('error', error) }
    }
    req.on('error', (e) => { if (!redirected && !failed) { failed = true; out.emit('error', e) } })
    req.on('response', cb)
    req.on('redirect', (status, _method, next) => {
      redirected = true
      const response = new PassThrough()
      response.statusCode = status
      response.headers = { location: next }
      cb(response)
      response.end()
      req.abort()
    })
    req.end()
    return out
  }
}

function probeNode(nodeBin, inherited, policy, target = TARGET, timeout = 10000) {
  return new Promise((resolve) => {
    let child, output = '', done = false
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve({ kind: 'node', ...r }) }
    const timer = setTimeout(() => { child?.kill(); finish({ ok: false, code: 'timeout' }) }, timeout + 1500)
    try {
      child = spawn(nodeBin, [probeEntry(), target, String(timeout)], {
        env: N.childEnvironment(inherited, policy), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout.on('data', (b) => {
        output += String(b)
        if (output.length > 8192) { child.kill(); finish({ ok: false, code: 'network' }) }
      })
      child.stderr.on('data', () => {}) // Never log inherited proxy URLs or credentials.
      child.on('error', () => finish({ ok: false, code: 'network' }))
      child.on('close', () => {
        try {
          const result = JSON.parse(output.trim().split('\n').pop())
          finish({ ok: result.ok === true, status: Number(result.status) || undefined, code: result.code ? 'network' : undefined })
        } catch { finish({ ok: false, code: 'network' }) }
      })
    } catch { finish({ ok: false, code: 'network' }) }
  })
}
async function probeBrowser(session, policy, target = TARGET, timeout = 10000) {
  const ses = session.fromPartition('akdagent-probe-' + randomUUID(), { cache: false })
  const controller = new AbortController()
  let timer
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })) }, timeout) })
  try {
    if (policy.chromium) await Promise.race([ses.setProxy(policy.chromium), deadline])
    const r = await Promise.race([ses.fetch(target, { method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal }), deadline])
    await Promise.race([r.body?.cancel() || Promise.resolve(), deadline])
    return { kind: 'browser', ok: r.status >= 200 && r.status < 400, status: r.status }
  } catch (e) { return { kind: 'browser', ok: false, code: e.name === 'TimeoutError' ? 'timeout' : 'network' } }
  finally { clearTimeout(timer); await Promise.race([ses.closeAllConnections().catch(() => {}), new Promise((r) => setTimeout(r, 500))]) }
}

function registerNetworkSettings({ ipcMain, session, store, inherited, getActive, getSender, resolveNodeBin, checkIdle, askRestart, restart, systemReader }) {
  let applying = false, testing = false, restarting = false
  const policyFor = (config) => N.resolvePolicy(config, inherited, systemReader)
  const view = () => {
    const config = store.read(), active = getActive()
    let saved, warning
    try { saved = policyFor(config) } catch (e) { warning = e.code || 'network' }
    return { ok: true, config, active: N.publicPolicy(active), saved: N.publicPolicy(saved), warning, pending: !saved || saved.fingerprint !== active?.fingerprint, systemAvailable: process.platform === 'win32' }
  }
  const resultError = (e) => ({ ok: false, code: ['host','port','protocol','schema','limit','id','name','selection','read','write','conflict','systemRead','pacUnsupported','systemUnsupported','busy','notReady'].includes(e.code) ? e.code : 'network', field: e.field })
  const settingsUrl = pathToFileURL(path.join(__dirname, 'settings.html')).href
  const authorized = (event) => event.sender === getSender() && !event.sender.isDestroyed()
    && event.sender.getURL() === settingsUrl && (!event.senderFrame || event.senderFrame === event.sender.mainFrame)
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!authorized(event)) return { ok: false, code: 'forbidden' }
      try { return await fn(...args) } catch (e) { return resultError(e) }
    })
  }
  handle('akdagent-network-get', view)
  handle('akdagent-network-save', (input) => {
    if (applying || restarting) throw N.codeError('busy')
    policyFor(input) // Reject unsupported routes before persistence, not after restart.
    store.write(input)
    return view()
  })
  handle('akdagent-network-test', async (input) => {
    if (testing || applying || restarting) throw N.codeError('busy')
    const policy = policyFor(input)
    testing = true
    try {
      const checks = await Promise.all([probeNode(resolveNodeBin(), inherited, policy), probeBrowser(session, policy)])
      return { ok: checks.every((r) => r.ok), checks, target: TARGET, route: N.publicPolicy(policy) }
    } finally { testing = false }
  })
  handle('akdagent-network-apply', async (revision) => {
    if (applying || testing || restarting) throw N.codeError('busy')
    const initial = view()
    if (revision !== initial.config.revision) throw N.codeError('conflict')
    if (!initial.pending) return { ok: true, unchanged: true }
    applying = true
    try {
      await checkIdle()
      if (!await askRestart()) return { ok: true, cancelled: true }
      // Fail closed: a new turn or a revision change while the dialog is open must not be lost.
      await checkIdle()
      if (store.read().revision !== revision) throw N.codeError('conflict')
      policyFor(store.read())
      restarting = true
      try { restart() } catch (e) { restarting = false; throw e }
      return { ok: true, restarting: true }
    } finally { if (!restarting) applying = false }
  })
  return { isApplying: () => applying || restarting, view }
}
module.exports = { TARGET, probeNode, probeBrowser, registerNetworkSettings, electronDownloadTransport }
