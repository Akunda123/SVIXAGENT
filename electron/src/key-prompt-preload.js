/**
 * API 密钥弹窗 preload：保存 key / 取消 / 打开模型设置 / 打开外部链接。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/* ── 界面语言（i18n）：字典走同步 IPC，切语种不重载窗口 ── */
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

contextBridge.exposeInMainWorld('svkeyprompt', {
  save: (key) => ipcRenderer.send('akdagent-key-save', key),
  cancel: () => ipcRenderer.send('akdagent-key-cancel'),
  openSettings: (page) => ipcRenderer.send('akdagent-key-open-settings', page),
  /** 用系统浏览器打开外部链接（主进程侧还会再校验一次协议） */
  openUrl: (url) => ipcRenderer.send('akdagent-open-external', url),
})
