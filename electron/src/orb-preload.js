/**
 * orb 窗口 preload：悬浮球拖动、点击切换对话、动态窗口尺寸与点击穿透。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/* ── 界面语言（i18n）────────────────────────────────────────────────
 * 沙箱 preload **不能读文件**，字典由主进程经同步 IPC 给（见 src/i18n/README.md）。
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
  return {
    locale: current,
    getLocale: () => current,
    t,
    apply,
    onChange: (cb) => { listeners.push(cb) },
  }
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

contextBridge.exposeInMainWorld('akdagent', {
  toggle: () => ipcRenderer.send('akdagent-toggle-chat'),
  dragStart: () => ipcRenderer.send('akdagent-drag-start'),
  dragMove: (x, y) => ipcRenderer.send('akdagent-drag-move', x, y),
  dragEnd: () => ipcRenderer.send('akdagent-drag-end'),
  /** 右键菜单：上报屏幕坐标，主进程弹出原生上下文菜单 */
  showContextMenu: (x, y) => ipcRenderer.send('akdagent-context-menu', x, y),
  /** 主进程（右键菜单「显示/隐藏聊天」）请求切换文本面板 */
  onTogglePanel: (cb) => ipcRenderer.on('akdagent-toggle-orb-panel', () => cb()),
  /** SV 工程切换推送（桥主动检测 → 主进程转发）：清空面板、显示切换提示 */
  onProjectSwitched: (cb) => ipcRenderer.on('akdagent-project-switched', (_e, project) => cb(project)),
  /** 宿主类型推送（'sv' | 'instrument-x' | null）：切换悬浮球图标 */
  onHostType: (cb) => ipcRenderer.on('akdagent-host-type', (_e, type) => cb(type)),
  onStatus: (cb) => ipcRenderer.on('akdagent-status', (_e, ready) => cb(ready)),
  /** 动态调整窗口尺寸（主进程保持左下角锚定） */
  resize: (w, h) => ipcRenderer.send('akdagent-resize', w, h),
  /** 点击穿透开关：true=区域外穿透，false=当前区域响应鼠标 */
  setIgnore: (ignore) => ipcRenderer.send('akdagent-set-ignore', ignore),
  /** STT：状态订阅 / 状态查询 / 识别音频（Float32Array 16kHz 单声道） */
  onSttStatus: (cb) => ipcRenderer.on('akdagent-stt-status', (_e, enabled) => cb(enabled)),
  sttStatus: () => ipcRenderer.invoke('akdagent-stt-status'),
  sttTranscribe: (audio) => ipcRenderer.invoke('akdagent-stt-transcribe', audio),
  /** Agent 真实对话：主进程代理 DSH host（/api + events.mux WS） */
  agentSend: (text) => ipcRenderer.invoke('akdagent-agent-send', text),
  agentNew: () => ipcRenderer.invoke('akdagent-agent-new'),
  /** 导出当前工程段会话为 md（导出后该段不再喂模型；显示层继续追加新段） */
  agentExport: () => ipcRenderer.invoke('akdagent-orb-export'),
  agentHistory: () => ipcRenderer.invoke('akdagent-agent-history'),
  agentSessionState: () => ipcRenderer.invoke('akdagent-agent-session-state'),
  agentRespond: (rpcId, value) => ipcRenderer.invoke('akdagent-agent-respond', rpcId, value),
  agentCancel: () => ipcRenderer.invoke('akdagent-agent-cancel'),
  /** mux 事件帧推送：{type:'server-request',rpcId,method,payload} */
  onAgentEvent: (cb) => ipcRenderer.on('akdagent-agent-event', (_e, frame) => cb(frame)),
  /** 主进程下发「当前会话绑定」（唯一权威 = 主进程）——
   *  球靠 mySessionId 过滤帧；只在面板里打字时球拿不到 id ⇒ 什么都看不到（2026-09-17 实测）。
   *  订阅它就等于"两侧认同一个会话"。 */
  onSessionBound: (cb) => ipcRenderer.on('akdagent-session-bound', (_e, p) => cb(p)),
  /** 连接状态：未就绪显示"正在连接"，就绪显示"连接完成" */
  onAgentReady: (cb) => ipcRenderer.on('akdagent-agent-ready', (_e, ready) => cb(ready)),
  agentReadyQuery: () => ipcRenderer.invoke('akdagent-agent-ready-query'),
  /**
   * 侧栏面板推送（SidePanelSection）：只转发，不判断。
   *   {kind:'processing', turnId} —— 本轮开始（同一 turnId 只加一次「正在处理中」）
   *   {kind:'output', text}       —— 本轮最终文本（**调用方须已剔除 think**，不流式）
   *   {kind:'resetTurn'}          —— 一轮结束（清 turn 去重）
   * 链路：本进程 → jsonl → Lua 桥 → project scriptData → 面板（见 docs/SidePanel桥设计.md）
   */
  panelPush: (p) => ipcRenderer.invoke('akdagent-panel-push', p),
})
