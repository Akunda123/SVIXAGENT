'use strict'

window.initCodexSettings = function (root, api, I) {
  if (!api.codexStatus) return // Older test harnesses / preloads.
  const t = key => I.t('settings.codex.' + key)
  let state, busy = false, prompt, notice = '', url = '', code = ''
  const make = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node }
  async function load() {
    try { state = await api.codexStatus() } catch { state = { ok: false } }
    render()
  }
  async function perform(operation) {
    busy = true; notice = ''; render()
    try {
      const result = await operation()
      notice = result?.ok ? t('saved') : t(result?.error === 'cancelled' ? 'cancelled' : 'failed')
    } catch { notice = t('failed') }
    finally { busy = false; url = ''; code = ''; prompt = null; await load() }
  }
  function button(label, action, allowedWhileBusy = false) {
    const el = make('button', label)
    el.type = 'button'; el.disabled = busy && !allowedWhileBusy
    el.addEventListener('click', action)
    return el
  }
  function select(label, values, selected, container) {
    const row = make('label'); row.className = 'frow'
    row.appendChild(make('span', label))
    const el = make('select'); el.disabled = busy
    for (const [value, text] of values) { const option = make('option', text); option.value = value; el.appendChild(option) }
    if (values.some(([v]) => v === selected)) el.value = selected
    row.appendChild(el); container.appendChild(row)
    return el
  }
  function render() {
    root.replaceChildren()
    root.appendChild(make('h2', 'OpenAI Codex'))
    const status = make('p', !state?.ok ? t('unavailable') : state.signedIn ? t('signedIn') : t('signedOut'))
    status.setAttribute('role', 'status'); root.appendChild(status)
    if (!state?.ok) { root.appendChild(button(t('retry'), load)); return }
    root.appendChild(make('p', t('intro')))
    const actions = make('div'); actions.className = 'actions'
    actions.appendChild(button(t('login'), () => perform(() => api.codexLogin('browser'))))
    actions.appendChild(button(t('device'), () => perform(() => api.codexLogin('device'))))
    if (state.signedIn) actions.appendChild(button(t('logout'), () => perform(() => api.codexLogout())))
    if (busy) actions.appendChild(button(t('cancel'), () => api.codexCancel(), true))
    root.appendChild(actions)
    if (url) {
      const link = make('a', t('openBrowser')); link.href = url
      link.addEventListener('click', event => { event.preventDefault(); api.openExternal(url) })
      root.appendChild(link)
    }
    if (code) root.appendChild(make('p', t('deviceCode') + ' ' + code))
    if (prompt) {
      const label = make('label', t('callback'))
      const input = make('input'); input.type = 'password'; input.autocomplete = 'off'
      label.appendChild(input); root.appendChild(label)
      root.appendChild(button(t('submit'), async () => {
        const current = prompt, value = input.value; input.value = ''
        if (current) await api.codexReply(current.attempt, current.id, value)
      }, true))
    }
    const models = state.models || []
    const choices = [['openai-codex', t('ordinary')]]
    if (state.fastEnabled) choices.push(['openai-codex-fast', 'Codex Fast'])
    const route = select(t('route'), choices, state.selected?.provider, root)
    const modelBox = make('div'); root.appendChild(modelBox)
    let model, effort
    const updateEfforts = () => {
      const previous = effort?.value || state.selected?.reasoningEffort || 'high'
      const levels = Object.keys(models.find(m => m.id === model.value)?.reasoningEfforts || {})
      if (effort) effort.parentNode.remove()
      effort = select(t('effort'), levels.map(id => [id, id]), previous, modelBox)
    }
    const updateModels = () => {
      modelBox.replaceChildren(); effort = null
      const list = route.value === 'openai-codex-fast' ? state.fastModels : models
      model = select(t('model'), list.map(m => [m.id, m.name]), state.selected?.model, modelBox)
      model.addEventListener('change', updateEfforts); updateEfforts()
    }
    route.addEventListener('change', updateModels); updateModels()
    root.appendChild(button(t('useModel'), () => perform(() => api.codexSelect(route.value, model.value, effort.value))))
    const fastLabel = make('label', ' ' + t('fast'))
    const fast = make('input'); fast.type = 'checkbox'; fast.checked = state.fastEnabled; fast.disabled = busy
    fast.addEventListener('change', () => perform(() => api.codexFast(fast.checked)))
    fastLabel.prepend(fast); root.appendChild(make('p')).appendChild(fastLabel)
    const hint = make('p', t('fastHint')); hint.className = 'hint'; root.appendChild(hint)
    root.appendChild(button(t('refresh'), () => perform(() => api.codexRefresh())))
    const catalog = make('p', t('catalogHint') + ' ' + state.updated); catalog.className = 'hint'; root.appendChild(catalog)
    const message = make('p', busy ? t('waiting') : notice); message.setAttribute('role', 'status'); root.appendChild(message)
  }
  const unsubscribe = api.onCodexEvent(event => {
    if (event.type === 'auth-url' || event.type === 'device-code') { url = event.url; code = event.code || '' }
    else if (event.type === 'prompt') prompt = event
    else if (event.type === 'prompt-end' && prompt?.id === event.id) prompt = null
    else if (event.type === 'browser-failed') notice = t('openBrowser')
    render()
  })
  window.addEventListener('beforeunload', () => { unsubscribe?.(); api.codexCancel() }, { once: true })
  I.onChange(render)
  load()
}
