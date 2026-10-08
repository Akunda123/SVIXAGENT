/* Settings-only controller. No Node, files, secrets or network access in this renderer. */
;(function () {
  'use strict'
  const el = (name) => document.getElementById('network-' + name)
  const I = window.svi18n, S = window.AKDNetworkSchema, api = window.svsettings
  const t = (key, ...args) => I.t('network.' + key, ...args)
  const clone = (v) => JSON.parse(JSON.stringify(v))
  let saved = null, draft = null, state = null, editorId = null, busy = false, operation = '', epoch = 0, visible = false, loading = false
  let notice = null, testResult = null
  const isDirty = () => !!draft && JSON.stringify(draft) !== JSON.stringify(saved)
  const option = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o }
  const selectedProfile = () => draft?.profiles.find((p) => p.id === editorId)
  function clearErrors() { ['route','name','protocol','port','host'].forEach((id) => el(id).removeAttribute('aria-invalid')) }
  function feedback(key, tone = '', ...args) { notice = { key, tone, args }; testResult = null; redrawFeedback() }
  function redrawFeedback() {
    const node = el('feedback')
    node.className = 'network-feedback' + (notice?.tone ? ' ' + notice.tone : '')
    if (testResult) {
      node.textContent = [t(testResult.ok ? 'testPassed' : 'testFailed'), ...testResult.checks.map((r) => `${t(r.kind)}: ${r.ok ? t('reachable') : t('unreachable')}${r.status ? ` (HTTP ${r.status})` : ''}`)].join('\n')
      node.className = 'network-feedback ' + (testResult.ok ? 'ok' : 'bad')
    } else node.textContent = notice ? t(notice.key, ...notice.args) : ''
  }
  function routeLabel(p) {
    if (!p) return '—'
    if (p.mode === 'profile') return p.label + ' · ' + p.url
    return t('mode.' + p.mode)
  }
  function controls() {
    const loaded = !!draft
    for (const id of ['route','profile','add']) el(id).disabled = !loaded || busy
    for (const id of ['name','protocol','host','port']) el(id).disabled = busy && operation !== 'test'
    el('add').disabled ||= (draft?.profiles.length || 0) >= 20
    el('remove').disabled = !selectedProfile() || busy
    el('test').disabled = !loaded || busy
    el('save').disabled = !loaded || busy || !isDirty()
    el('discard').disabled = !loaded || busy || !isDirty()
    el('apply').disabled = !loaded || busy || isDirty() || !state?.pending
    el('form').setAttribute('aria-busy', String(busy || loading))
    el('pending').textContent = isDirty() ? t('draftPending') : state?.pending ? t('pending') : draft ? t('applied') : ''
  }
  function renderSelectors() {
    el('route').replaceChildren(...S.MODES.map((mode) => option(mode, t('mode.' + mode))), ...draft.profiles.map((p) => option(p.id, p.name || t('newProfile'))))
    el('route').value = draft.selected
    el('route').querySelector('[value="system"]').disabled = !state.systemAvailable
    el('profile').replaceChildren(...(draft.profiles.length ? draft.profiles.map((p) => option(p.id, p.name || t('newProfile'))) : [option('', t('emptyShort'))]))
    el('profile').value = editorId || ''
  }
  function renderEditor() {
    const profile = selectedProfile()
    el('editor').hidden = !profile
    el('empty').hidden = !!draft?.profiles.length
    if (profile) for (const field of ['name','protocol','host','port']) el(field).value = profile[field]
  }
  function render() {
    if (draft) { renderSelectors(); renderEditor() }
    el('active').textContent = routeLabel(state?.active)
    el('saved').textContent = routeLabel(state?.saved)
    redrawFeedback(); controls()
  }
  function changed() {
    epoch++; clearErrors()
    if (testResult || notice?.key === 'testing') feedback('draftChanged')
    else { notice = null; redrawFeedback() }
    renderSelectors(); controls()
  }
  function validateDraft() {
    clearErrors()
    for (const profile of draft.profiles) {
      try { S.validate({ ...draft, profiles: [profile], selected: profile.id }) }
      catch (e) {
        editorId = profile.id; renderSelectors(); renderEditor()
        const target = el(e.field || 'route') || el('route')
        target.setAttribute('aria-invalid', 'true'); feedback('error.' + e.code, 'bad'); target.focus()
        return false
      }
    }
    try { S.validate(draft); return true }
    catch (e) { el('route').setAttribute('aria-invalid','true'); feedback('error.' + e.code,'bad'); el('route').focus(); return false }
  }
  async function action(kind, call) {
    if (busy) return
    busy = true; operation = kind; controls()
    try { await call() }
    catch { feedback('error.network','bad') }
    finally { busy = false; operation = ''; controls() }
  }
  async function load() {
    if (draft || loading) return
    if (!api?.getNetwork) { feedback('error.unavailable','bad'); return }
    loading = true; controls(); feedback('loading')
    try {
      const r = await api.getNetwork()
      if (!r?.ok) { feedback('error.' + (r?.code || 'read'), 'bad'); return }
      state = r; saved = clone(r.config); draft = clone(saved); editorId = draft.profiles[0]?.id || null
      notice = r.warning ? { key: 'error.' + r.warning, tone: 'bad', args: [] } : null; render()
    } catch { feedback('error.read','bad') }
    finally { loading = false; controls() }
  }
  window.AKDNetworkUI = { onPage(name) { visible = name === 'network'; epoch++; if (visible) load() } }
  async function persistDraft(kind) {
    if (!draft || busy || !isDirty() || !validateDraft()) return
    await action(kind, async () => {
      const submitted = clone(draft), version = epoch
      feedback('saving')
      const r = await api.saveNetwork(submitted)
      if (!r?.ok) { feedback('error.' + (r?.code || 'write'), 'bad'); return }
      state = r; saved = clone(r.config)
      if (epoch === version) draft = clone(saved)
      else draft.revision = saved.revision
      feedback('savedMessage','ok'); render()
    })
  }
  // Choosing a startup channel is a committed preference, not a disposable draft.
  // It uses the same acknowledged/atomic save as the explicit profile Save button.
  el('route').addEventListener('change', () => {
    if (!draft || busy) return
    draft.selected = el('route').value; changed()
    persistDraft('route')
  })
  el('profile').addEventListener('change', () => { editorId = el('profile').value; clearErrors(); renderEditor(); controls() })
  for (const field of ['name','protocol','host','port']) el(field).addEventListener(field === 'protocol' ? 'change' : 'input', () => {
    const p = selectedProfile(); if (!p) return
    p[field] = el(field).value; changed()
  })
  el('add').addEventListener('click', () => {
    if (!draft || busy || draft.profiles.length >= 20) return
    editorId = 'p-' + crypto.randomUUID()
    draft.profiles.push({ id: editorId, name: '', protocol: 'http', host: '127.0.0.1', port: '' })
    changed(); renderEditor(); el('name').focus()
  })
  el('remove').addEventListener('click', () => {
    if (busy || !selectedProfile()) return
    draft.profiles = draft.profiles.filter((p) => p.id !== editorId)
    if (draft.selected === editorId) draft.selected = 'inherit'
    editorId = draft.profiles[0]?.id || null
    changed(); renderEditor(); feedback('removed'); el('add').focus()
  })
  el('discard').addEventListener('click', () => {
    if (!saved || busy) return
    draft = clone(saved); editorId = draft.profiles[0]?.id || null; epoch++
    clearErrors(); feedback('discarded'); render(); el('route').focus()
  })
  el('form').addEventListener('submit', (event) => {
    event.preventDefault()
    persistDraft('save')
  })
  el('test').addEventListener('click', () => {
    if (!draft || busy || !validateDraft()) return
    action('test', async () => {
      const version = epoch, candidate = clone(draft)
      feedback('testing')
      const r = await api.testNetwork(candidate)
      if (version !== epoch || !visible) return
      if (r?.checks) { notice = null; testResult = r; redrawFeedback() }
      else feedback('error.' + (r?.code || 'network'), 'bad')
    })
  })
  el('apply').addEventListener('click', () => {
    if (!draft || busy || isDirty() || !state?.pending) return
    action('apply', async () => {
      feedback('applying')
      const r = await api.applyNetwork(saved.revision)
      if (!r?.ok) feedback('error.' + (r?.code || 'network'), 'bad')
      else feedback(r.cancelled ? 'cancelled' : r.unchanged ? 'applied' : 'restarting')
    })
  })
  // The settings page owns global I.apply(). Calling it again here would reset dynamic
  // labels (e.g. autostart/always-on-top) after their async state had already arrived.
  I.onChange(() => { render() })
  controls()
  if (document.getElementById('page-network').classList.contains('active')) window.AKDNetworkUI.onPage('network')
})()
