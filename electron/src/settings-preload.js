/**
 * 设置窗口 preload：暴露主进程 IPC（状态查询 / 操作触发）。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/* ── 界面语言（i18n）────────────────────────────────────────────────
 * 沙箱 preload 不能读文件，字典由主进程经同步 IPC 给（见 src/i18n/README.md）。
 * 切语种不重载窗口：主进程广播 akdagent-i18n-update，这里换字典后回调页面重排文案。 */
function createI18n() {
  const { locale, dict } = ipcRenderer.sendSync('akdagent-i18n-sync')
  const listeners = []
  let current = locale
  const fill = (s, args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]))
  const t = (key, ...args) => fill(dict[key] === undefined ? key : dict[key], args)
  const apply = (root) => {
    const scope = root || document
    scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
    scope.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh) })
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle) })
  }
  ipcRenderer.on('akdagent-i18n-update', (_e, payload) => {
    if (!payload) return
    if (payload.dict) for (const k of Object.keys(payload.dict)) dict[k] = payload.dict[k]
    if (payload.locale) {
      current = payload.locale
      document.documentElement.lang = payload.locale
    }
    for (const cb of listeners) {
      try { cb(current) } catch (err) { console.error('[i18n] onChange 回调出错：' + err.message) }
    }
  })
  return { locale: current, getLocale: () => current, t, apply, onChange: (cb) => { listeners.push(cb) } }
}

/** 让 <html lang> 一开始就跟着语种（页面不必自己设） */
function syncHtmlLang(i) {
  const set = () => { try { document.documentElement.lang = i.getLocale() } catch { /* ignore */ } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', set)
  else set()
}

const __i18n = createI18n()
syncHtmlLang(__i18n)
contextBridge.exposeInMainWorld('svi18n', __i18n)

contextBridge.exposeInMainWorld('svsettings', {
  /* 查询 host 状态（注册回调，主进程随时推送） */
  onHostStatus: (cb) =>
    ipcRenderer.on('akdagent-host-status', (_e, ready, url) => cb(ready, url)),
  requestStatus: () => ipcRenderer.send('akdagent-request-status'),

  /* 外部请求直达某一页（如 key-prompt 的「配置其他模型」→ 'model'） */
  onGotoPage: (cb) => ipcRenderer.on('akdagent-settings-goto', (_e, page) => cb(page)),

  /* 检查桥连接（主进程转聊天窗内 DSH 间接探测；结果回推） */
  checkBridge: () => ipcRenderer.send('akdagent-check-bridge'),
  onBridgeStatus: (cb) =>
    ipcRenderer.on('akdagent-bridge-status', (_e, ok, msg) => cb(ok, msg)),

  /* 操作 */
  openChat: () => ipcRenderer.send('akdagent-open-chat'),
  toggleAutostart: () => ipcRenderer.send('akdagent-toggle-autostart'),
  toggleAlwaysTop: () => ipcRenderer.send('akdagent-toggle-always-top'),
  openBridgeDoc: () => ipcRenderer.send('akdagent-open-bridge-doc'),
  /** 用系统浏览器打开外部链接（主进程只放行 http(s)；设置页的「反馈 / 联系」用） */
  openExternal: (url) => ipcRenderer.send('akdagent-open-external', url),
  getVersion: () => ipcRenderer.invoke('akdagent-get-version'),

  /* 悬浮球：状态查询 + 变更推送 + 位置复位
   * （按钮文案必须由主进程回读的真实状态驱动，不能靠页面自己猜） */
  getOrbState: () => ipcRenderer.invoke('akdagent-get-orb-state'),
  onAutostartChanged: (cb) =>
    ipcRenderer.on('akdagent-autostart-changed', (_e, on) => cb(!!on)),
  onAlwaysTopChanged: (cb) =>
    ipcRenderer.on('akdagent-always-top-changed', (_e, on) => cb(!!on)),
  resetOrbPosition: () => ipcRenderer.send('akdagent-orb-reset-position'),
  onOrbPositionReset: (cb) =>
    ipcRenderer.on('akdagent-orb-position-reset', (_e, ok) => cb(!!ok)),

  /* 客户端界面语言（**不是** DSH 的 locale.preference；四语：简/繁/英/日） */
  getUiPrefs: () => ipcRenderer.invoke('akdagent-get-ui-prefs'),
  setUiLocale: (locale) => ipcRenderer.invoke('akdagent-set-ui-locale', locale),

  /* 设置读写（settings.yaml） */
  getSettings: () => ipcRenderer.invoke('akdagent-get-settings'),
  setDefaultModel: (modelId) => ipcRenderer.invoke('akdagent-set-default-model', modelId),
  setLanguage: (lang) => ipcRenderer.invoke('akdagent-set-language', lang),
  setReasoningEffort: (level) => ipcRenderer.invoke('akdagent-set-reasoning-effort', level),
  addModel: (m) => ipcRenderer.invoke('akdagent-add-model', m),
  removeModel: (id) => ipcRenderer.invoke('akdagent-remove-model', id),

  /* SV 集成（scripts 目录 + 桥脚本部署 + Agent 工作目录） */
  getSvConfig: () => ipcRenderer.invoke('akdagent-get-sv-config'),
  scanSvScripts: () => ipcRenderer.invoke('akdagent-scan-sv-scripts'),
  addSvScriptsDir: (dir) => ipcRenderer.invoke('akdagent-add-sv-scripts-dir', dir),
  removeSvScriptsDir: (dir) => ipcRenderer.invoke('akdagent-remove-sv-scripts-dir', dir),
  deploySvBridge: () => ipcRenderer.invoke('akdagent-deploy-sv-bridge'),
  /** 🆕 2026-09-25：只给**某一个** scripts 目录部署一个文件（'bridge' | 'panel'）—— 目录列表里的手动按钮 */
  deploySvFile: (dir, what) => ipcRenderer.invoke('akdagent-deploy-sv-file', dir, what),
  /** 系统目录选择器（目录输入框留空时用；返回 {ok,path} 或 {ok:false,cancelled:true}） */
  pickDirectory: (opts) => ipcRenderer.invoke('akdagent-pick-directory', opts),

  /* SV Flat 版检测 + nofs JSON 编辑 */
  svFlatStatus: () => ipcRenderer.invoke('akdagent-sv-flat-status'),
  listFlatStyles: () => ipcRenderer.invoke('akdagent-list-flat-styles'),
  readNofs: (p) => ipcRenderer.invoke('akdagent-read-nofs', p),
  writeNofs: (p, data) => ipcRenderer.invoke('akdagent-write-nofs', p, data),

  /* STT 模型管理 */
  sttStatus: () => ipcRenderer.invoke('akdagent-stt-status'),
  sttDownload: (id) => ipcRenderer.invoke('akdagent-stt-download', id),
  sttSelect: (id) => ipcRenderer.invoke('akdagent-stt-select', id),
  sttRemove: (id) => ipcRenderer.invoke('akdagent-stt-remove', id),
  onSttStatus: (cb) => ipcRenderer.on('akdagent-stt-status', (_e, s) => cb(s)),
  onSttDownloadProgress: (cb) => ipcRenderer.on('akdagent-stt-download-progress', (_e, p) => cb(p)),

  /* 提供方管理（模型页） */
  getProviders: () => ipcRenderer.invoke('akdagent-get-providers'),
  setDefaultProvider: (providerId, modelId) => ipcRenderer.invoke('akdagent-set-default-provider', providerId, modelId),
  setProviderKey: (providerId, keyEnv, keyValue) => ipcRenderer.invoke('akdagent-set-provider-key', providerId, keyEnv, keyValue),
  addPiProvider: (route, opts) => ipcRenderer.invoke('akdagent-add-pi-provider', route, opts),
  removePiProvider: (route) => ipcRenderer.invoke('akdagent-remove-pi-provider', route),
  updatePiModels: (route, models) => ipcRenderer.invoke('akdagent-update-pi-models', route, models),
  /** 🆕 2026-09-25：pi-ai 覆写字段（Base URL / API 协议 / 模型列表）；传 null 表示**删掉该键**（回内建默认） */
  setPiProviderFields: (route, fields) => ipcRenderer.invoke('akdagent-set-pi-provider-fields', route, fields),
})
