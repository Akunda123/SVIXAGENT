'use strict'
const fs = require('node:fs'), path = require('node:path')
const { pathToFileURL } = require('node:url')

function applyCatalog(models, catalog) {
  for (const [provider, entries] of Object.entries(catalog.routes)) {
    const route = models[provider]
    if (!route) continue
    for (const entry of entries) {
      // SDK updates win over this dated compatibility snapshot. In particular,
      // never replace an official transport, token limit or price with a clone.
      if (route[entry.id]) continue
      const base = route[entry.template || entry.id]
      // An older/different SDK can lack the template. Leave that route alone;
      // an optional catalog extension must not prevent the host from booting.
      if (!base && !entry.model) continue
      const next = entry.model ? structuredClone(entry.model) : {
        ...structuredClone(base), ...(entry.changes || {}), id: entry.id, name: entry.name,
      }
      // A model's API price is not subscription billing. Do not copy the price
      // of an unrelated template; no price estimate is supplied for new IDs.
      if (!route[entry.id] && !entry.model) next.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      next.provider = provider
      if (next.api === 'anthropic-messages' && /claude-(?:opus|sonnet|haiku)-5[.-]5$/.test(next.id)) {
        next.compat = { ...next.compat, forceAdaptiveThinking: true, supportsTemperature: false }
        next.thinkingLevelMap = { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
      }
      if (/^gpt-6(?:[.-]|$)/.test(next.id)) next.thinkingLevelMap = { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
      if (!Number.isInteger(next.contextWindow) || next.contextWindow <= 0 || !Number.isInteger(next.maxTokens) || next.maxTokens <= 0 || !next.api || !next.baseUrl) continue
      route[entry.id] = next
    }
    // Keep retired IDs readable for saved sessions/configuration, but don't
    // describe them as current choices. Filtering belongs to the UI owner.
  }
  return models
}

function expandModels(settings, catalog) {
  const pi = settings['llm-pi-ai'], providers = pi?.providers
  if (!providers) return settings
  let changed = false
  const next = { ...providers }
  for (const [provider, entries] of Object.entries(catalog.routes)) {
    const previous = providers[provider]
    // Custom endpoints/API transports can have different IDs and permissions.
    if (!previous || previous.baseURL || previous.api || !previous.models?.length) continue
    const ids = new Set(previous.models.map((m) => m.id)), additions = entries.filter((e) => !ids.has(e.id)).map((e) => ({ id: e.id }))
    if (!additions.length) continue
    next[provider] = { ...previous, models: [...previous.models, ...additions] }; changed = true
  }
  return changed ? { ...settings, 'llm-pi-ai': { ...pi, providers: next } } : settings
}

function ensureCatalog({ home, srcDir, writeAtomic }) {
  const dir = path.join(home, 'model-catalog')
  fs.mkdirSync(dir, { recursive: true })
  for (const name of ['subscription-models.json', 'subscription-catalog.js', 'subscription-catalog-preload.mjs']) {
    const content = fs.readFileSync(path.join(srcDir, name), 'utf8'), target = path.join(dir, name)
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) continue
    if (!writeAtomic(target, content)) throw new Error('Could not save owned model catalog')
  }
  return pathToFileURL(path.join(dir, 'subscription-catalog-preload.mjs')).href
}
module.exports = { applyCatalog, expandModels, ensureCatalog }
