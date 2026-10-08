'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { createSessionBinding } = require('../src/session-binding')
const { provision, createSubscriptionSync, isConfiguredSubscription } = require('../src/subscription-profiles')
const { createStore, resolvePolicy, childEnvironment, schema } = require('../src/network-settings')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-ux-test-'))
test.after(() => fs.rmSync(runtime, { recursive: true, force: true }))
const authorized = (provider = 'openai-codex') => ({ ok: true, state: 'authorized', method: 'oauth', key: 'llm-pi-ai/' + provider, id: 1, at: 'success-1' })
const flows = (provider = 'openai-codex') => ({ ok: true, flows: [{ key: 'llm-pi-ai/' + provider, label: provider, methods: [{ id: 'oauth' }] }] })

test('startup default survives independent launch stores and launcher environments', () => {
  const dir = fs.mkdtempSync(path.join(runtime, 'startup-route-'))
  const config = { ...schema.defaults(), selected: 'p-user', profiles: [{ id: 'p-user', name: 'Selected', protocol: 'http', host: '127.0.0.1', port: 7897 }] }
  createStore(dir).write(config)
  for (const launcher of [{}, { HTTP_PROXY: 'http://wrong:1111' }, { http_proxy: 'http://wrong:2222', HTTPS_PROXY: 'http://wrong:3333' }]) {
    const fresh = createStore(dir).read(), active = resolvePolicy(fresh, launcher)
    assert.equal(fresh.selected, 'p-user')
    assert.equal(childEnvironment(launcher, active).HTTPS_PROXY, 'http://127.0.0.1:7897')
  }
})

test('parallel selections create one session and reveal chat without inference', async () => {
  let creates = 0, shown = 0
  const binder = createSessionBinding({ ready: async () => {}, segmentKey: () => 'project-a', show: () => shown++, ensure: async () => { creates++; await new Promise((r) => setTimeout(r, 10)); return 'session-a' } })
  assert.deepEqual(await Promise.all([binder.bind({ reveal: true }), binder.bind(), binder.bind()]), ['session-a', 'session-a', 'session-a'])
  assert.equal(creates, 1); assert.equal(shown, 1)
})

test('segment switch during creation returns the new segment binding', async () => {
  let segment = 'a', release, calls = 0
  const binder = createSessionBinding({ ready: async () => {}, segmentKey: () => segment, show: () => {}, ensure: async () => { const current = segment; if (++calls === 1) await new Promise((r) => { release = r }); return current } })
  const first = binder.bind(); await new Promise((r) => setImmediate(r))
  segment = 'b'; const second = binder.bind(); release()
  assert.deepEqual(await Promise.all([first, second]), ['b', 'b']); assert.equal(calls, 2)
})

test('failed binding is retryable and does not leave a rejected single-flight', async () => {
  let calls = 0
  const binder = createSessionBinding({ ready: async () => {}, segmentKey: () => 'a', show: () => {}, ensure: async () => { if (++calls === 1) throw new Error('host unavailable'); return 'ok' } })
  await assert.rejects(binder.bind(), /unavailable/); assert.equal(await binder.bind(), 'ok')
})

test('all OAuth success routes provision exact profiles without changing other data/defaults', () => {
  for (const provider of ['openai-codex', 'anthropic', 'github-copilot', 'kimi-coding', 'xai']) {
    const settings = { unrelated: { keep: 1 }, 'agent-default-model': { provider: 'deepseek-official', model: 'old' }, 'llm-pi-ai': { other: true, providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY', models: [{ id: 'custom' }] } } } }
    const before = structuredClone(settings), result = provision(settings, authorized(provider), flows(provider))
    assert.equal(result.changed, true); assert.deepEqual(settings, before)
    assert.deepEqual(result.settings['agent-default-model'], before['agent-default-model'])
    assert.deepEqual(result.settings['llm-pi-ai'].providers.openai, before['llm-pi-ai'].providers.openai)
    assert.ok(!result.settings['llm-pi-ai'].providers[provider].apiKeyEnv)
    assert.equal(result.settings['llm-pi-ai'].providers[provider].models, undefined)
  }
})

test('cancelled, failed, running, api-key and unknown flows never provision', () => {
  for (const state of ['idle', 'running', 'cancelled', 'failed']) assert.equal(provision({}, { ...authorized(), state }, flows()), null)
  assert.equal(provision({}, { ...authorized(), method: 'api-key' }, flows()), null)
  assert.equal(provision({}, { ...authorized(), key: 'unknown/provider' }, flows()), null)
  assert.equal(provision({}, authorized(), { flows: [] }), null)
})

test('existing models/endpoints survive; only the exact OAuth credential override is removed', () => {
  const profile = { apiKeyEnv: 'OLD_KEY', baseURL: 'https://custom.example', api: 'openai-codex-responses', models: [{ id: 'own-model' }] }
  const settings = { 'llm-pi-ai': { providers: { 'openai-codex': profile } } }
  const result = provision(settings, authorized(), flows())
  assert.equal(result.settings['llm-pi-ai'].providers['openai-codex'].apiKeyEnv, undefined)
  assert.deepEqual(result.settings['llm-pi-ai'].providers['openai-codex'].models, profile.models)
  assert.equal(result.settings['llm-pi-ai'].providers['openai-codex'].baseURL, profile.baseURL)
  assert.equal(profile.apiKeyEnv, 'OLD_KEY')
})

test('provisioning is single-flight, acknowledged, idempotent and respects later manual edits', async () => {
  let settings = {}, saves = 0, remembered = 0, notices = 0
  const sync = createSubscriptionSync({ readState: () => ({ attempt: authorized(), flows: flows() }), readSettings: () => settings,
    saveSettings: async (next) => { saves++; settings = next; return true }, remember: () => remembered++, notify: () => notices++ })
  const a = await Promise.all([sync.sync(), sync.sync()]); assert.equal(a[0].ok, true)
  await sync.sync(); assert.equal(saves, 1); assert.equal(remembered, 1); assert.equal(notices, 1)
  settings['llm-pi-ai'].providers['openai-codex'].apiKeyEnv = 'EXPLICIT_MANUAL_EDIT'
  await sync.sync(); assert.equal(saves, 1); assert.equal(settings['llm-pi-ai'].providers['openai-codex'].apiKeyEnv, 'EXPLICIT_MANUAL_EDIT')
})

test('write failure keeps success authorization distinct from configuration and retries safely', async () => {
  let allowed = false, settings = {}, notices = 0
  const sync = createSubscriptionSync({ readState: () => ({ attempt: authorized(), flows: flows() }), readSettings: () => settings,
    saveSettings: (next) => { if (!allowed) return false; settings = next; return true }, remember: () => {}, notify: () => notices++ })
  assert.equal((await sync.sync()).ok, false); assert.deepEqual(settings, {}); assert.equal(notices, 0)
  allowed = true; assert.equal((await sync.sync()).ok, true); assert.equal(notices, 1)
})

test('thrown backup/status writes report configuration failure without losing OAuth success', async () => {
  let blocked = true
  const sync = createSubscriptionSync({ readState: () => ({ attempt: authorized(), flows: flows() }), readSettings: () => ({}),
    saveSettings: () => { if (blocked) throw new Error('read-only backup'); return true },
    remember: () => {}, notify: () => {} })
  assert.deepEqual(await sync.sync(), { ok: false, provider: 'openai-codex', code: 'write' })
  blocked = false; assert.equal((await sync.sync()).ok, true)
})

test('legacy API-key migration cannot revive a stored key on a remembered OAuth route', () => {
  assert.equal(isConfiguredSubscription('openai-codex', { 'openai-codex': { label: 'ChatGPT' } }), true)
  assert.equal(isConfiguredSubscription('custom-api', { 'openai-codex': {} }), false)
  assert.equal(isConfiguredSubscription('toString', {}), false)
})
