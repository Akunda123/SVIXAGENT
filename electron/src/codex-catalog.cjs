'use strict'

// Verified 2026-10-06: https://learn.chatgpt.com/docs/models
// Specs: https://developers.openai.com/api/docs/models/gpt-6.1-sol
// This is a catalog, not an account entitlement or pricing claim.
const UPDATED = '2026-10-06'
const PROVIDER = 'openai-codex'
const FAST_PROVIDER = 'openai-codex-fast'
const FAST_MODELS = ['gpt-6-astra', 'gpt-6.1-sol']
const retired = new Set(['gpt-5.3-codex-spark'])
const current = [
  ['gpt-6.1-sol', 'GPT-6.1 Sol'],
  ['gpt-6-astra', 'GPT-6 Astra'],
  ['gpt-6-luna', 'GPT-6 Luna'],
  ['gpt-6-sol', 'GPT-6 Sol'],
]
const efforts = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
// Match pi-ai's 15-minute device-code deadline; bound browser callback waiting.
const loginTimeoutMs = method => method === 'device' ? 15 * 60 * 1000 : 5 * 60 * 1000

function catalog(installed = []) {
  const models = new Map(installed.filter(m => m && !retired.has(m.id)).map(m => [m.id, {
    id: m.id, name: m.name || m.id, input: m.input || ['text'],
    contextWindow: m.contextWindow, maxTokens: m.maxTokens,
    reasoningEfforts: m.reasoning ? Object.fromEntries(
      ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
        .filter(k => m.thinkingLevelMap?.[k] !== null &&
          (!['xhigh', 'max'].includes(k) || m.thinkingLevelMap?.[k] !== undefined))
        .map(k => [k, m.thinkingLevelMap?.[k] || k])) : false,
  }]))
  for (const [id, name] of current) models.set(id, {
    id, name, input: ['text', 'image'], contextWindow: 1050000, maxTokens: 128000,
    reasoningEfforts: { ...efforts },
  })
  const ids = new Set(current.map(([id]) => id))
  return [...current.map(([id]) => models.get(id)), ...[...models.values()].filter(m => !ids.has(m.id))]
}

function configure(settings, models) {
  const next = structuredClone(settings)
  const pi = next['llm-pi-ai'] || {}
  const old = pi.providers?.[PROVIDER] || {}
  // Materialize overrides before adding an explicit model list: DSH refuses
  // models + modelOverrides together. Explicit user entries keep precedence.
  const existing = new Map(Object.entries(old.modelOverrides || {}).map(([id, value]) => [id, { ...value, id }]))
  for (const model of old.models || []) existing.set(model.id, { ...existing.get(model.id), ...model })
  const merged = models.map(m => ({ ...m, ...existing.get(m.id), id: m.id }))
  for (const model of existing.values()) {
    if (!retired.has(model.id) && !merged.some(m => m.id === model.id)) merged.push(model)
  }
  const profile = { ...old, displayName: old.displayName ?? 'OpenAI Codex', models: merged }
  delete profile.modelOverrides // Preserved in models above, not discarded.
  // Pin OAuth to the native endpoint. Leave unrelated preferences intact.
  for (const field of ['apiKeyEnv', 'baseURL', 'api', 'headers']) delete profile[field]
  next['llm-pi-ai'] = { ...pi, providers: { ...pi.providers, [PROVIDER]: profile } }
  return next
}

function validGrant(record) {
  const p = record?.kind === 'grant' ? record.payload : null
  return !!(p && p.type === 'oauth' && typeof p.access === 'string' && p.access &&
    typeof p.refresh === 'string' && p.refresh && typeof p.accountId === 'string' && p.accountId &&
    Number.isFinite(p.expires))
}

module.exports = { UPDATED, PROVIDER, FAST_PROVIDER, FAST_MODELS, catalog, configure, validGrant, loginTimeoutMs }
