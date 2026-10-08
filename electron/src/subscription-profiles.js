'use strict'

// A successful host-owned OAuth attempt is the only provisioning authority.
// Never create a route on begin, cancel/failure or from a renderer-supplied label.
function provision(settings, attempt, flows) {
  if (!attempt?.ok || attempt.state !== 'authorized' || attempt.method !== 'oauth') return null
  const match = /^llm-pi-ai\/([a-z][a-z0-9-]*)$/.exec(attempt.key || '')
  if (!match) return null
  const flow = (flows?.flows || []).find((f) => f.key === attempt.key
    && f.methods?.some((m) => m.id === 'oauth'))
  if (!flow) return null
  const provider = match[1], pi = settings['llm-pi-ai'] || {}, profiles = pi.providers || {}
  const previous = profiles[provider]
  const profile = { ...(previous || {}), displayName: previous?.displayName || flow.label || provider }
  // apiKeyEnv takes precedence over stored OAuth in the host. A successful
  // subscription sign-in explicitly chooses OAuth for this exact route. Stored
  // API secrets and all other providers/overrides are untouched.
  delete profile.apiKeyEnv
  const changed = !previous || JSON.stringify(previous) !== JSON.stringify(profile)
  return {
    provider, label: flow.label || provider, changed,
    settings: changed ? { ...settings, 'llm-pi-ai': { ...pi, providers: { ...profiles, [provider]: profile } } } : settings,
  }
}

function isConfiguredSubscription(route, remembered) {
  return Object.hasOwn(remembered || {}, route)
}

function createSubscriptionSync({ readState, readSettings, saveSettings, remember, notify }) {
  let running = null, last = '', result = null
  function sync() {
    if (running) return running
    running = Promise.resolve().then(async () => {
      const state = readState(), a = state?.attempt
      const key = [a?.key, a?.id || '', a?.at || ''].join('|')
      if (last === key) return result
      const next = provision(readSettings(), a, state?.flows)
      if (!next) return null
      try {
        if (next.changed && !await saveSettings(next.settings)) throw new Error('Could not save subscription settings')
        await remember(next.provider, next.label)
      } catch {
        result = { ok: false, provider: next.provider, code: 'write' }
        return result
      }
      result = { ok: true, provider: next.provider, label: next.label }
      await notify(result)
      last = key
      return result
    }).finally(() => { running = null })
    return running
  }
  return { sync, status: () => result }
}
module.exports = { provision, createSubscriptionSync, isConfiguredSubscription }
