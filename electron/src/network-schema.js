/* Shared, dependency-free schema: main process is authoritative; renderer uses the same errors. */
;(function (root) {
  'use strict'
  const MODES = ['inherit', 'direct', 'system']
  function fail(code, field) { const e = new Error(code); e.code = code; e.field = field; throw e }
  function endpoint(profile) {
    const host = String(profile.host || '').trim()
    if (!host || host.length > 253 || /[\s/@?#;,%\\]/.test(host)) fail('host', 'host')
    const portText = String(profile.port)
    if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) fail('port', 'port')
    if (!['http', 'https'].includes(profile.protocol)) fail('protocol', 'protocol')
    const bracketed = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
    let url
    try { url = new URL(`${profile.protocol}://${bracketed}:${Number(portText)}`) } catch { fail('host', 'host') }
    if (url.username || url.password || !url.hostname || url.pathname !== '/' || url.search || url.hash) fail('host', 'host')
    if (url.hostname.startsWith('[') === false && !/^[a-z0-9.-]+$/i.test(url.hostname)) fail('host', 'host')
    return { protocol: profile.protocol, host: url.hostname, port: Number(portText), url: `${profile.protocol}://${url.hostname}:${Number(portText)}` }
  }
  function validate(input) {
    if (!input || input.schemaVersion !== 1 || !Number.isSafeInteger(input.revision) || input.revision < 0) fail('schema', 'route')
    if (!Array.isArray(input.profiles) || input.profiles.length > 20) fail('limit', 'route')
    const seen = new Set(MODES)
    const profiles = input.profiles.map((p) => {
      if (!p || !/^p-[a-zA-Z0-9-]{1,64}$/.test(p.id) || seen.has(p.id)) fail('id', 'route')
      seen.add(p.id)
      const name = String(p.name || '').trim()
      if (!name || name.length > 64 || /[\u0000-\u001f\u007f]/.test(name)) fail('name', 'name')
      const e = endpoint(p)
      return { id: p.id, name, protocol: e.protocol, host: e.host, port: e.port }
    })
    if (!seen.has(input.selected)) fail('selection', 'route')
    return { schemaVersion: 1, revision: input.revision, selected: input.selected, profiles }
  }
  const api = { MODES, endpoint, validate, defaults: () => ({ schemaVersion: 1, revision: 0, selected: 'inherit', profiles: [] }) }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.AKDNetworkSchema = api
})(typeof globalThis === 'object' ? globalThis : this)
