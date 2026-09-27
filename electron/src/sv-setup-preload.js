/**
 * SV 配置向导（sv-setup.html）的 preload。
 *
 * 只暴露向导需要的那几个动作 —— **全部复用已有的 IPC**，不新增"部署"这类危险入口：
 *   · scan()       → akdagent-sv-setup-scan（列候选 + 每个目录的宿主类型/已装状态）
 *   · addDir(dir)  → akdagent-add-sv-scripts-dir（幂等：已在列表就返回 already:true）
 *   · deployAll()  → akdagent-deploy-sv-bridge（与设置页「一键部署」**同一套**逻辑）
 *   · pick()       → akdagent-pick-directory（系统选目录对话框）
 *   · close()      → akdagent-sv-setup-close
 * 界面语言：与本仓其它窗口同一套（字典走同步 IPC，命名空间由主进程按 sender 判定 = svSetup）。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function createI18n() {
  const { locale, dict } = ipcRenderer.sendSync('akdagent-i18n-sync')
  const listeners = []
  let current = locale
  const fill = (s, args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]))
  const t = (key, ...args) => fill(dict[key] === undefined ? key : dict[key], args)
  const apply = (root) => {
    /* ⚠️ `root` 只在 preload 内部有意义：**页面传进来的参数会被 contextBridge 序列化**，
     * DOM 节点过不来（第一版向导就是 `apply(document)` ⇒ 这边拿到非节点 ⇒ 抛
     * `scope.querySelectorAll is not a function` ⇒ 整页空白）。所以这里兜一层，
     * 页面一律调 `apply()`（无参）即可。 */
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document
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

const __i18n = createI18n()
try {
  const set = () => { document.documentElement.lang = __i18n.getLocale() }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', set)
  else set()
} catch { /* 忽略 */ }
contextBridge.exposeInMainWorld('svi18n', __i18n)

contextBridge.exposeInMainWorld('svsetup', {
  scan: () => ipcRenderer.invoke('akdagent-sv-setup-scan'),
  getConfig: () => ipcRenderer.invoke('akdagent-get-sv-config'),
  addDir: (dir) => ipcRenderer.invoke('akdagent-add-sv-scripts-dir', dir),
  deployAll: () => ipcRenderer.invoke('akdagent-deploy-sv-bridge'),
  pick: () => ipcRenderer.invoke('akdagent-pick-directory', { purpose: 'scripts' }),
  openSettings: (page) => ipcRenderer.send('akdagent-key-open-settings', page),
  close: () => ipcRenderer.send('akdagent-sv-setup-close'),
})
