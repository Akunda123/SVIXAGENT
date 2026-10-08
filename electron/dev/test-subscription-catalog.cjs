'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')
const source = process.env.AKD_TEST_SOURCE || path.join(__dirname, '../src')
const { applyCatalog, expandModels, ensureCatalog } = require(path.join(source, 'subscription-catalog'))
const catalog = require(path.join(source, 'subscription-models.json'))
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-catalog-test-'))
test.after(() => fs.rmSync(runtime, { recursive: true, force: true }))
const sdkRoot = process.env.AKD_TEST_DSH_ROOT

test('catalog additions preserve each provider protocol and existing entry data', () => {
  const base = { api: 'custom', provider: 'p', baseUrl: 'https://example.com', contextWindow: 2, maxTokens: 1, cost: { input: 7 }, compat: { keep: true } }
  const models = { p: { old: base } }
  applyCatalog(models, { routes: { p: [{ id: 'new', template: 'old', name: 'New' }] } })
  assert.equal(models.p.new.api, 'custom'); assert.equal(models.p.new.compat.keep, true)
  assert.equal(models.p.old, base); assert.equal(base.id, undefined); assert.equal(models.p.new.cost.input, 0)
})

test('explicit lists expand idempotently without overriding fields/defaults; custom transports opt out', () => {
  const profile = { models: [{ id: 'gpt-6-sol', name: 'Pinned', contextWindow: 12345 }, { id: 'custom-model' }] }
  const settings = { 'agent-default-model': { provider: 'other', model: 'keep' }, 'llm-pi-ai': { providers: { 'openai-codex': profile, anthropic: { baseURL: 'https://custom.example', models: [{ id: 'custom' }] }, 'github-copilot': { api: 'custom', models: [{ id: 'mine' }] } } } }
  const result = expandModels(settings, catalog), p = result['llm-pi-ai'].providers
  assert.deepEqual(p['openai-codex'].models.slice(0, 2), profile.models)
  assert.ok(p['openai-codex'].models.some((m) => m.id === 'gpt-6.1-sol'))
  assert.equal(p.anthropic, settings['llm-pi-ai'].providers.anthropic)
  assert.equal(p['github-copilot'], settings['llm-pi-ai'].providers['github-copilot'])
  assert.deepEqual(result['agent-default-model'], settings['agent-default-model'])
  assert.equal(expandModels(result, catalog), result)
})

test('owned preload roundtrip is path-safe and does not require an installed SDK write', () => {
  const home = fs.mkdtempSync(path.join(runtime, 'catalog-test-'))
  const url = ensureCatalog({ home, srcDir: source, writeAtomic: (file, value) => { fs.writeFileSync(file, value); return true } })
  assert.equal(new URL(url).protocol, 'file:')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'model-catalog/subscription-models.json'))), catalog)
})

test('configured host adapter accepts updated routes with zero requests', {skip: !sdkRoot && 'Set AKD_TEST_DSH_ROOT for read-only SDK integration'}, async () => {
  const previousFetch = global.fetch; let requests = 0
  global.fetch = () => { requests++; throw new Error('Network forbidden in catalog tests') }
  try {
    const { MODELS } = await import(pathToFileURL(path.join(sdkRoot, 'node_modules/@earendil-works/pi-ai/dist/models.generated.js')).href)
    const before = JSON.stringify(MODELS.openai), codexOld = MODELS['openai-codex']['gpt-6-astra']
    applyCatalog(MODELS, catalog)
    assert.equal(JSON.stringify(MODELS.openai), before); assert.equal(MODELS['openai-codex']['gpt-6-astra'], codexOld)
    const { apply } = await import(pathToFileURL(path.join(sdkRoot, 'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js')).href)
    let adapter
    const ctx = { inject: () => {}, get: () => undefined, logger: { warn: () => {} }, llm: {
      registerConfigurableProviders: () => ({ replace: () => {} }), registerModelDiscovery: () => {}, registerAdapter: (_routes, value) => { adapter = value; return { replace: () => {} } },
    } }
    apply(ctx, { providers: Object.fromEntries(Object.keys(catalog.routes).map((id) => [id, {}])) })
    for (const [provider, entries] of Object.entries(catalog.routes)) {
      const models = await adapter.listModels(provider)
      for (const entry of entries) assert.ok(models.some((m) => m.id === entry.id), provider + '/' + entry.id)
    }
    assert.equal(MODELS['openai-codex']['gpt-6.1-sol'].api, 'openai-codex-responses')
    assert.equal(MODELS['github-copilot']['claude-opus-5.5'].api, 'anthropic-messages')
    assert.equal(MODELS['github-copilot']['gpt-6.1-sol'].api, 'openai-responses')
    assert.ok(MODELS['kimi-coding']['kimi-for-coding'])
    assert.equal(requests, 0)
  } finally { global.fetch = previousFetch }
})

test('real Node preload reaches every configured SDK copy', {skip: !sdkRoot && 'Set AKD_TEST_DSH_ROOT for read-only SDK integration'}, () => {
  const home = fs.mkdtempSync(path.join(runtime, 'catalog-preload-test-'))
  const preload = ensureCatalog({ home, srcDir: source, writeAtomic: (file, value) => { fs.writeFileSync(file, value); return true } })
  const roots = [sdkRoot, process.env.AKD_TEST_PROFILE_ROOT].filter(Boolean)
  const urls = roots.map((root) => pathToFileURL(path.join(root, 'node_modules/@earendil-works/pi-ai/dist/providers/all.js')).href)
  const script = `for(const url of ${JSON.stringify(urls)}){const m=await import(url);if(!m.getBuiltinModels('openai-codex').some(x=>x.id==='gpt-6.1-sol'))throw Error('Missing profile catalog');}console.log('all catalogs updated')`
  const result = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', script], { encoding: 'utf8', windowsHide: true, cwd: sdkRoot })
  assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.includes('all catalogs updated'))
})

test('newer SDK entries win, absent templates and malformed additions are fail-soft', () => {
  const official = { id: 'new', api: 'official-wire', contextWindow: 999 }
  const models = { p: { new: official } }
  applyCatalog(models, { routes: { p: [{ id: 'new', model: { api: 'old-wire' } }, { id: 'absent', template: 'missing' }, { id: 'invalid', model: { contextWindow: -1 } }] } })
  assert.equal(models.p.new, official); assert.equal(models.p.absent, undefined); assert.equal(models.p.invalid, undefined)
})

test('cancelled OAuth completion cannot authorize a newer provider attempt', async () => {
  const dir = fs.mkdtempSync(path.join(runtime, 'auth-race-')), ticks = []
  const previousInterval = global.setInterval
  global.setInterval = (fn) => { ticks.push(fn); return { unref() {} } }
  const pending = new Map(), flows = ['anthropic', 'openai-codex'].map((p) => ({ key: 'llm-pi-ai/' + p, label: p, methods: [{ id: 'oauth' }] }))
  try {
    const { apply } = await import(pathToFileURL(path.join(source, 'plugins/akd-auth-bridge/index.js')).href)
    const svc = { list: () => flows, cancel: () => {}, begin: ({ key }) => new Promise((resolve) => pending.set(key, resolve)) }
    apply({ get: () => svc, on: () => {} }, { outDir: dir })
    const cmd = (id, key) => { fs.writeFileSync(path.join(dir, 'cmd.json'), JSON.stringify({ id, op: 'begin', key, method: 'oauth' })); ticks[1]() }
    const flush = () => new Promise((r) => setImmediate(r))
    cmd(1, flows[0].key); await flush(); cmd(2, flows[1].key); await flush()
    pending.get(flows[0].key)({ status: 'authorized' }); await flush()
    const a = JSON.parse(fs.readFileSync(path.join(dir, 'attempt.json')))
    assert.equal(a.key, flows[1].key); assert.equal(a.state, 'running')
    pending.get(flows[1].key)({ status: 'authorized' }); await flush()
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'attempt.json'))).state, 'authorized')
  } finally { global.setInterval = previousInterval }
})
