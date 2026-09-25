/**
 * 测试用 preload：给 settings.html 注入一个「记录调用」的 window.svsettings 桩。
 * 目的：验证页面按钮的点击是否真的到达了 IPC 层（区分「事件没绑上」和「绑上了但没反馈」）。
 * 记录写进**共享 DOM**（data-call 属性）——contextBridge 暴露的数组是暴露那一刻的快照，
 * 主世界读不到后续 push，所以不能用数组回读。
 * __emit / __setState 供测试从主世界模拟主进程推送（函数经 contextBridge 是活代理，可调用）。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/* ── i18n：和真 preload 一样从主进程同步取字典 ──
 * 页面现在所有界面文案都走 window.svi18n；桩里没有它的话文案会退化成 key，
 * 老断言（按钮文案 = 已启用/置顶中）就会假失败。 */
function createI18n() {
  let payload = { locale: 'zh-Hans', dict: {} }
  try {
    payload = ipcRenderer.sendSync('akdagent-i18n-sync') || payload
  } catch {
    /* 测试没注册同步处理器时退化为"显示 key" */
  }
  const dict = payload.dict || {}
  const listeners = []
  let current = payload.locale
  const fill = (s, args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]))
  const t = (key, ...args) => fill(dict[key] === undefined ? key : dict[key], args)
  const apply = (root) => {
    const scope = root || document
    scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
    scope.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh) })
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle) })
  }
  ipcRenderer.on('akdagent-i18n-update', (_e, p) => {
    if (!p) return
    if (p.dict) for (const k of Object.keys(p.dict)) dict[k] = p.dict[k]
    if (p.locale) current = p.locale
    for (const cb of listeners) {
      try { cb(current) } catch (err) { console.error('[i18n] onChange 回调出错：' + err.message) }
    }
  })
  return { locale: current, getLocale: () => current, t, apply, onChange: (cb) => { listeners.push(cb) } }
}

contextBridge.exposeInMainWorld('svi18n', createI18n())

/* 页面里的未捕获异常/rejection 记进共享 DOM（**带调用栈**）：测试才能读出"哪一行出的问题"。
 * 没有这个，executeJavaScript 只会回一句 "Script failed to execute"，
 * 未捕获的 rejection 甚至连这句都没有。 */
function markRejection(kind, detail) {
  try {
    if (document && document.body) {
      const el = document.createElement('div')
      el.dataset.rej = kind
      el.dataset.stack = String(detail).slice(0, 800)
      el.style.display = 'none'
      document.body.appendChild(el)
    }
  } catch {
    /* ignore */
  }
}
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason
  markRejection('rejection', (r && r.stack) || String(r))
})
window.addEventListener('error', (e) => markRejection('error', (e && e.error && e.error.stack) || (e && e.message)))

const calls = []
const cbs = {}
const state = { autostart: true, alwaysOnTop: true, flat: null, nofs: null, lastWritten: null }

function mark(name) {
  calls.push(name)
  try {
    if (document && document.body) {
      const el = document.createElement('div')
      el.dataset.call = name
      el.style.display = 'none'
      document.body.appendChild(el)
    }
  } catch {
    /* ignore */
  }
}
const record = (name) => () => {
  mark(name)
  return Promise.resolve(null)
}

const api = {
  onHostStatus: () => { mark('onHostStatus') },
  requestStatus: record('requestStatus'),
  onGotoPage: () => { mark('onGotoPage') },
  checkBridge: record('checkBridge'),
  onBridgeStatus: (cb) => { mark('onBridgeStatus'); cbs.bridge = cb },
  openChat: record('openChat'),
  toggleAutostart: record('toggleAutostart'),
  toggleAlwaysTop: record('toggleAlwaysTop'),
  openBridgeDoc: record('openBridgeDoc'),
  getVersion: () => { mark('getVersion'); return Promise.resolve('0.1.0-test') },

  /* 悬浮球 */
  getOrbState: () => { mark('getOrbState'); return Promise.resolve({ ...state }) },
  onAutostartChanged: (cb) => { mark('onAutostartChanged'); cbs.autostart = cb },
  onAlwaysTopChanged: (cb) => { mark('onAlwaysTopChanged'); cbs.alwaysTop = cb },
  resetOrbPosition: record('resetOrbPosition'),
  onOrbPositionReset: (cb) => { mark('onOrbPositionReset'); cbs.orbReset = cb },
  __emit: (ch, v) => {
    mark('__emit:' + ch)
    const cb = cbs[ch]
    if (cb) cb(v)
    return !!cb
  },
  /** 桥状态是两参回调（ok, msg），单独开一个入口 */
  __emitBridge: (ok, msg) => {
    mark('__emitBridge')
    if (cbs.bridge) cbs.bridge(ok, msg)
    return !!cbs.bridge
  },
  __setState: (s) => { Object.assign(state, s) },
  __getWritten: () => state.lastWritten,
  __debug: () => ({ lastReadPath: state.lastReadPath, keys: Object.keys(state.nofsByPath || {}), hasNofsFallback: !!state.nofs }),

  getSettings: record('getSettings'),
  setDefaultModel: record('setDefaultModel'),
  setLanguage: record('setLanguage'),
  setReasoningEffort: record('setReasoningEffort'),
  addModel: record('addModel'),
  removeModel: record('removeModel'),
  // 形状与主进程真实返回一致：{scriptsDirs, entries, bridgeSource}（写错形状会让页面抛错）
  getSvConfig: () => {
    mark('getSvConfig')
    const dirs = state.scriptsDirs || []
    return Promise.resolve({
      scriptsDirs: dirs,
      entries: dirs.map((d) => ({ scriptsDir: d, agentDir: d.replace(/[\\/]scripts$/, '') + '/Agent', exists: true, bridgeInstalled: false })),
      bridgeSource: 'C:/sv/AKDAgentBridge.lua',
    })
  },
  scanSvScripts: () => { mark('scanSvScripts'); return Promise.resolve({ found: state.scannedDirs || [] }) },
  addSvScriptsDir: (dir) => {
    mark('addSvScriptsDir')
    state.addedDirs = (state.addedDirs || []).concat([dir])
    state.scriptsDirs = (state.scriptsDirs || []).concat([dir])
    return Promise.resolve({ ok: true, entries: [] })
  },
  removeSvScriptsDir: record('removeSvScriptsDir'),
  deploySvBridge: record('deploySvBridge'),
  /** 目录选择器：state.pickedDir 有值 = 用户选了它；否则 = 取消 */
  pickDirectory: () => {
    mark('pickDirectory')
    return Promise.resolve(state.pickedDir ? { ok: true, path: state.pickedDir } : { ok: false, cancelled: true })
  },
  svFlatStatus: () => { mark('svFlatStatus'); return Promise.resolve(state.flat) },
  listFlatStyles: () => { mark('listFlatStyles'); return Promise.resolve(state.flatStyles || { ok: true, items: [] }) },
  /** 按路径取 nofs（真主进程就是按路径读的）；没配该路径时退回 state.nofs */
  readNofs: (p) => {
    mark('readNofs')
    state.lastReadPath = p
    const byPath = state.nofsByPath && state.nofsByPath[p]
    if (byPath) return Promise.resolve({ ok: true, path: p, data: byPath })
    return Promise.resolve(state.nofs || { ok: false, error: 'no nofs stub' })
  },
  writeNofs: (p, d) => { mark('writeNofs'); state.lastWritten = d; return Promise.resolve({ ok: true, path: p, backup: p + '.bak' }) },
  sttStatus: () => { mark('sttStatus'); return Promise.resolve(null) },
  sttDownload: record('sttDownload'),
  sttSelect: record('sttSelect'),
  sttRemove: record('sttRemove'),
  onSttStatus: () => { mark('onSttStatus') },
  onSttDownloadProgress: () => { mark('onSttDownloadProgress') },
  getProviders: () => {
    mark('getProviders')
    // 形状要和主进程真实返回一致（缺字段会让页面脚本抛错，污染错误统计）
    return Promise.resolve({ providers: [], presets: [], language: 'zh', reasoningEffort: 'high', models: [] })
  },
  setDefaultProvider: record('setDefaultProvider'),
  setProviderKey: record('setProviderKey'),
  addPiProvider: record('addPiProvider'),
  removePiProvider: record('removePiProvider'),
  updatePiModels: record('updatePiModels'),
}

contextBridge.exposeInMainWorld('svsettings', api)
