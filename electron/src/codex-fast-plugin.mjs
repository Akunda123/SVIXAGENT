// Adapted from higekibaka's independent Codex Fast plugin. This optional
// adapter shares native Codex credentials; it does not implement another login.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { loadRuntime } from './codex-runtime.mjs'
import catalogModule from './codex-catalog.cjs'
const { PROVIDER, FAST_PROVIDER, FAST_MODELS, catalog, validGrant } = catalogModule
export const name = 'akdagent-codex-fast'
export const inject = ['llm', 'credentials']

export function priorityProvider(provider) {
  return { ...provider,
    streamSimple(model, context, options) {
      const previous = options?.onPayload
      return provider.streamSimple(model, context, { ...options, async onPayload(payload, selected) {
        const replacement = await previous?.(payload, selected)
        const body = replacement === undefined ? payload : replacement
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid Codex payload')
        return { ...body, service_tier: 'priority' }
      } })
    },
  }
}

export function sharedStore(runtime, credentials) {
  const key = runtime.credentialKey('llm-pi-ai', PROVIDER)
  const check = id => { if (id !== PROVIDER) throw new Error('Unexpected credential provider') }
  const decode = record => {
    if (record === undefined) return undefined
    if (!validGrant(record)) throw new runtime.LlmError('Sign in to OpenAI Codex in Settings.', 'MISSING_CREDENTIAL')
    return structuredClone(record.payload)
  }
  return {
    async read(id) { check(id); return decode(await credentials.readRecord(key)) },
    async list() { return await this.read(PROVIDER) ? [{ providerId: PROVIDER, type: 'oauth' }] : [] },
    async modify(id, mutate) {
      check(id)
      try {
        const stored = await credentials.modifyRecord(key, async current => {
          const grant = decode(current)
          if (!grant) throw new Error('Signed out')
          const next = await mutate(grant)
          if (next === undefined) return undefined
          const record = { kind: 'grant', payload: JSON.parse(JSON.stringify(next)) }
          decode(record)
          return record
        })
        return decode(stored)
      } catch { throw new runtime.LlmError('Codex authorization expired. Sign in again in Settings.', 'AUTH') }
    },
    async delete() { throw new Error('Sign out through Codex settings') },
  }
}

export function createFastAdapter(runtime, ctx, readSettings, native = runtime.openaiCodexProvider()) {
  const store = sharedStore(runtime, ctx.credentials)
  const sdkModels = new Map(native.getModels().map(m => [m.id, m]))
  const seed = catalog(native.getModels()).filter(m => FAST_MODELS.includes(m.id))
  const template = sdkModels.get('gpt-6-astra')
  let lastSignature, snapshot
  const enabled = () => readSettings()['akdagent-codex']?.fastEnabled === true
  function profiles() {
    const configured = readSettings()['llm-pi-ai']?.providers?.[PROVIDER]?.models || []
    const models = seed.map(m => ({ ...m, ...configured.find(c => c.id === m.id) }))
    const signature = JSON.stringify(models)
    if (snapshot && signature === lastSignature) return snapshot
    const provider = priorityProvider({ ...native, getModels: () => models.map(m => ({
      ...template, ...sdkModels.get(m.id), id: m.id, name: m.name, provider: PROVIDER,
      api: 'openai-codex-responses', baseUrl: native.baseUrl,
      input: m.input, contextWindow: m.contextWindow, maxTokens: m.maxTokens,
      reasoning: true, thinkingLevelMap: { ...m.reasoningEfforts, off: null, minimal: null },
    })) })
    snapshot = new Map([[PROVIDER, {
      provider: PROVIDER, displayName: 'Codex Fast', piProvider: provider,
      streamIdleTimeoutMs: 300000, maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 2048 * 2048, requestImageMaxBytes: 1024 * 1024,
      retryPolicy: runtime.resolveRetryPolicy(undefined, name),
      modelErrors: new Map(), configuredMaxTokens: new Map(models.map(m => [m.id, m.maxTokens])),
    }]])
    lastSignature = signature
    return snapshot
  }
  const inner = new runtime.PiAiAdapter({ profiles, resolveApiKey: async () => undefined,
    auth: { credentials: store, authContext: { env: async () => undefined, fileExists: async () => false } },
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => runtime.resolveImageAttachmentAccess(attachments,
      p => ctx.get('fs')?.processPathFromHostPath(p), ref),
  })
  return new class extends runtime.LlmAdapter {
    providerInfo() { return { id: FAST_PROVIDER, name: 'Codex Fast' } }
    providerRetryPolicy() { return inner.providerRetryPolicy(PROVIDER) }
    imageRequestPricing(_p, m) { return inner.imageRequestPricing(PROVIDER, m) }
    async listModels() { return enabled() ? (await inner.listModels(PROVIDER)).map(m => ({ ...m, provider: FAST_PROVIDER })) : [] }
    async resolveModel(_p, m, signal) { return { ...await inner.resolveModel(PROVIDER, m, signal), provider: FAST_PROVIDER } }
    async prepareCall(_p, m, signal) {
      const prepared = await inner.prepareCall(PROVIDER, m, signal)
      return { model: { ...prepared.model, provider: FAST_PROVIDER }, stream: options => this.dispatch(options, o => prepared.stream(o)) }
    }
    async *dispatch(options, stream) {
      if (!enabled()) throw new runtime.LlmError('Enable Codex Fast in Settings or select ordinary Codex.', 'UNSUPPORTED_OPTION')
      if (!await store.read(PROVIDER)) throw new runtime.LlmError('Sign in to OpenAI Codex in Settings.', 'MISSING_CREDENTIAL')
      yield* stream({ ...options, provider: PROVIDER })
    }
    stream(options) { return this.dispatch(options, o => inner.stream(o)) }
  }()
}

export async function apply(ctx, config) {
  const runtime = await loadRuntime(config.runtimeRoot)
  const require = createRequire(path.join(config.runtimeRoot, 'package.json'))
  const yaml = require('js-yaml')
  const readSettings = () => {
    try { return yaml.load(readFileSync(config.settingsPath, 'utf8')) || {} }
    catch { return {} }
  }
  // Do not replace a user's independently installed Fast adapter.
  if (ctx.llm.listProviders().some(p => p.id === FAST_PROVIDER)) return
  ctx.llm.registerAdapter([FAST_PROVIDER], createFastAdapter(runtime, ctx, readSettings))
}
