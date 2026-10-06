/**
 * orb 窗口 preload：悬浮球拖动、点击切换对话、动态窗口尺寸与点击穿透。
 */
'use strict'

const { contextBridge, ipcRenderer, webUtils } = require('electron')

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
  /** 拖拽进来的 File → **绝对路径**。
   *  ⚠️ Electron 32+ 已移除 `File.path`（渲染层拿不到真路径）⇒ 只能走主进程侧的 `webUtils.getPathForFile`。
   *  ✅ 本窗口是**沙箱** preload（main.js 只给了 preload/contextIsolation/nodeIntegration，没关 sandbox），
   *     而官方文档写明沙箱 preload 的 `require('electron')` 白名单正是
   *     `contextBridge / crashReporter / ipcRenderer / nativeImage / webFrame / webUtils`
   *     （https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts）⇒ 这里可用，**不需要** `sandbox:false`。
   *  返回 '' 表示拿不到（调用方按"没拖到路径"处理并提示，不静默）。 */
  pathFor: (file) => {
    try { return webUtils.getPathForFile(file) || '' } catch { return '' }
  },
  /** 路径存在性/类型（粘贴路径、拖目录都要先问一句）。不读内容、不写盘。 */
  fileStat: (p) => ipcRenderer.invoke('akdagent-file-stat', String(p == null ? '' : p)),
  /** `.pdf` → 每页 PNG（识谱吃位图）⇒ 附件换成 PNG 路径。
   *  渲染与落盘都在主进程（隐藏窗 + Chromium 真 canvas）；这里只转发路径，**不读文件内容**。 */
  pdfRender: (p, opts) => ipcRenderer.invoke('akdagent-pdf-render', String(p == null ? '' : p), opts || {}),
  /** 非 MP3/WAV 的音频（m4a/AAC、FLAC、Ogg…）→ 16bit WAV（内置解码器只认 MP3/WAV，靠客户端 Chromium 解）。
   *  解码与落盘都在主进程（隐藏窗 + Web Audio）；这里只转发路径，**不读文件内容**。 */
  audioDecode: (p, opts) => ipcRenderer.invoke('akdagent-audio-decode', String(p == null ? '' : p), opts || {}),
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
  /** 🆕 2026-09-27：主进程推来的**用户可见提示**（如"这一轮为什么错、去哪儿配"）。
   *  以前这类原因只写日志，界面上永远只有"回合结束（error）"。{level:'warn'|'info', text} */
  onNotice: (cb) => ipcRenderer.on('akdagent-notice', (_e, p) => cb(p)),
  /**
   * 侧栏面板推送（SidePanelSection）：只转发，不判断。
   *   {kind:'processing', turnId} —— 本轮开始（同一 turnId 只加一次「正在处理中」）
   *   {kind:'output', text}       —— 本轮最终文本（**调用方须已剔除 think**，不流式）
   *   {kind:'resetTurn'}          —— 一轮结束（清 turn 去重）
   * 链路：本进程 → jsonl → Lua 桥 → project scriptData → 面板（见 docs/SidePanel桥设计.md）
   */
  panelPush: (p) => ipcRenderer.invoke('akdagent-panel-push', p),

  /* 🆕 2026-10-05（用户裁「5 做」）：**本会话模型** —— 读（含目录）与切。
   *   ⚠️ 会话模型 ≠ 设置里的「默认模型」：后者只对**新会话**生效（宿主原话见 main.js 注释）。 */
  getModelCatalog: (force) => ipcRenderer.invoke('akdagent-model-catalog', force === true),
  getSessionModel: () => ipcRenderer.invoke('akdagent-session-model'),
  selectSessionModel: (sessionId, provider, model, reasoningEffort) =>
    ipcRenderer.invoke('akdagent-select-session-model', sessionId, provider, model, reasoningEffort),
  onSessionModel: (cb) => ipcRenderer.on('akdagent-session-model', (_e, p) => cb(p)),
})
