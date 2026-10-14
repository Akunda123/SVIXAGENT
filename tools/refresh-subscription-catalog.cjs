// Reproducible public catalog snapshot. Only GET /models, never an inference call.
'use strict'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const file = path.join(__dirname, '../electron/src/subscription-models.json')
;(async () => {
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, 200)
  const body = await response.json(), catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  const entries = body.data.filter((m) => m.architecture?.output_modalities?.includes('text')
    && m.supported_parameters?.includes('tools') && !/:batch$/.test(m.id))
    .filter((m) => Number.isInteger(m.context_length) && Number.isInteger(m.top_provider?.max_completion_tokens))
    .map((m) => ({ id: m.id, model: {
      id: m.id, name: m.name, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', api: 'openai-completions',
      contextWindow: m.context_length, maxTokens: m.top_provider.max_completion_tokens,
      input: m.architecture.input_modalities.filter((x) => ['text', 'image'].includes(x)),
      reasoning: m.supported_parameters.includes('reasoning'),
      cost: { input: Number(m.pricing.prompt) * 1e6, output: Number(m.pricing.completion) * 1e6, cacheRead: Number(m.pricing.input_cache_read || 0) * 1e6, cacheWrite: 0 },
      compat: { supportsReasoningEffort: m.supported_parameters.includes('reasoning_effort'), maxTokensField: 'max_tokens' },
    } }))
  assert.ok(entries.length > 100); assert.ok(entries.some((e) => e.id === 'openai/gpt-6.1-sol'))
  catalog.routes.openrouter = entries; catalog.openRouterFetchedAt = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n')
  console.log(JSON.stringify({ method: 'GET', inferenceCalls: 0, provider: 'openrouter', models: entries.length }))
})().catch((e) => { console.error(e.message); process.exitCode = 1 })
