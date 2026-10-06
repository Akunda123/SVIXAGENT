'use strict'
const C = require('./codex-catalog.cjs')

// Keep the production IPC boundary testable with a real isolated Electron window.
function registerCodexIPC({ ipcMain, getSettingsWindow, service, readSettings, writeSettings, hasGrant }) {
  let models, loading
  async function getModels(refresh = false) {
    if (refresh) models = undefined
    if (!models) {
      if (!loading) loading = service.run('catalog').then(result => {
        if (!result.ok || !Array.isArray(result.models)) throw new Error('Runtime unavailable')
        return (models = result.models)
      }).finally(() => { loading = undefined })
      await loading
    }
    return models
  }
  async function configured() {
    const catalog = await getModels()
    // Read AFTER asynchronous catalog loading: preserve edits made meanwhile.
    return C.configure(readSettings(), catalog)
  }
  function save(settings) {
    if (!writeSettings(settings)) throw new Error('Settings write failed')
  }
  const channels = []
  function handle(action, handler) {
    const channel = 'akdagent-codex-' + action
    channels.push(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const win = getSettingsWindow()
      if (!win || win.isDestroyed() || event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame) return { ok: false, error: 'forbidden' }
      try { return await handler(...args) }
      catch { return { ok: false, error: 'operation-failed' } }
    })
  }
  handle('status', async () => {
    const settings = await configured()
    const effective = settings['llm-pi-ai'].providers[C.PROVIDER].models
    return { ok: true, signedIn: hasGrant(), models: effective, updated: C.UPDATED,
      fastModels: effective.filter(m => C.FAST_MODELS.includes(m.id)),
      fastEnabled: settings['akdagent-codex']?.fastEnabled === true,
      selected: settings['agent-default-model'] || {} }
  })
  handle('refresh', async () => { await getModels(true); save(await configured()); return { ok: true } })
  handle('login', async method => {
    if (!['browser', 'device'].includes(method)) return { ok: false, error: 'invalid-method' }
    save(await configured())
    return service.login(method)
  })
  handle('reply', (attempt, id, value) => service.reply(attempt, id, value))
  handle('cancel', () => service.cancel())
  handle('logout', () => service.logout())
  handle('fast', async enabled => {
    if (typeof enabled !== 'boolean') return { ok: false }
    const next = await configured()
    next['akdagent-codex'] = { ...next['akdagent-codex'], fastEnabled: enabled }
    // Disabled Fast fails visibly; never change a user's route to ordinary.
    save(next)
    return { ok: true }
  })
  handle('select', async (provider, modelId, effort) => {
    if (![C.PROVIDER, C.FAST_PROVIDER].includes(provider)) return { ok: false }
    const next = await configured()
    const model = next['llm-pi-ai'].providers[C.PROVIDER].models.find(m => m.id === modelId)
    const permitted = model?.reasoningEfforts === false ? effort === 'off' :
      model?.reasoningEfforts && Object.hasOwn(model.reasoningEfforts, effort)
    if (!permitted) return { ok: false }
    if (provider === C.FAST_PROVIDER && (!next['akdagent-codex']?.fastEnabled || !C.FAST_MODELS.includes(modelId))) return { ok: false }
    next['agent-default-model'] = { ...next['agent-default-model'], provider, model: modelId, reasoningEffort: effort }
    save(next)
    return { ok: true }
  })
  return () => channels.forEach(channel => ipcMain.removeHandler(channel))
}
module.exports = { registerCodexIPC }
