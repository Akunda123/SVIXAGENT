/**
 * 通用 HTML 确认框的 preload（2026-09-27）。
 *
 * 只做三件事：把主进程推来的内容交给页面、把用户的选择回给主进程、允许打开外链。
 * 文案（标题/正文/详情/按钮）**全部由主进程给**（那边用 i18n.t 取），所以这个窗口
 * 自己不需要 i18n 字典 —— 少一个命名空间要维护。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('svconfirm', {
  onInit: (cb) => ipcRenderer.on('akdagent-confirm-init', (_e, opts) => { try { cb(opts) } catch (err) { console.error(err) } }),
  answer: (ok) => ipcRenderer.send('akdagent-confirm-answer', !!ok),
  openUrl: (url) => ipcRenderer.send('akdagent-open-external', url),
})
