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
  __debug: () => ({ lastReadPath: state.lastReadPath, keys: Object.keys(state.nofsByPath || {}), hasNofsFallback: !!state.nofs,
    /* 🆕 2026-10-07：把"最近一次新增提供方 / 保存密钥"的参数也吐出来，供 DOM 用例断言 */
    lastAddPi: state.lastAddPi || null, lastSetKey: state.lastSetKey || null }),

  getSettings: record('getSettings'),
  setDefaultModel: record('setDefaultModel'),
  setLanguage: record('setLanguage'),
  setReasoningEffort: record('setReasoningEffort'),
  addModel: record('addModel'),
  removeModel: record('removeModel'),
  // 形状与主进程真实返回一致：{scriptsDirs, entries, bridgeSource, panelSource}（写错形状会让页面抛错）
  getSvConfig: () => {
    mark('getSvConfig')
    const dirs = state.scriptsDirs || []
    return Promise.resolve({
      scriptsDirs: dirs,
      entries: dirs.map((d) => ({
        scriptsDir: d,
        agentDir: d.replace(/[\\/]scripts$/, '') + '/Agent',
        exists: true,
        bridgeInstalled: false,
        // 🆕 2026-09-25：面板三件套（真主进程也返回它们；页面据此显示面板徽标）
        kind: /instrument x/i.test(d) ? 'ix' : (/v studio 2/i.test(d) ? 'sv2' : 'sv1'),
        panelInstalled: false,
        panelCurrent: false,
        panelWanted: /instrument x|v studio 2/i.test(d),
      })),
      bridgeSource: 'C:/sv/AKDAgentBridge.lua',
      panelSource: 'C:/sv/AKDAgentPanel.js',
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
  // 🆕 2026-09-25：目录列表里的「部署桥 / 部署面板」按钮
  deploySvFile: () => { mark('deploySvFile'); return Promise.resolve({ ok: true, steps: ['stub'] }) },
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
    /* 🆕 2026-10-05：给一份**有内容**的假数据（原来是空数组 ⇒ 截图里什么都看不到，测不了模型页的新 UI）。
     *   ⚠️ 字段名照 `akdagent-get-providers` 的真实返回抄；`models: []` 是**故意**的
     *   —— 走"自定义列表为空 ⇒ 用宿主真实目录"那条分支（把 renderCatalogChips 也照出来）。 */
    return Promise.resolve({
      providers: [
        {
          id: 'deepseek-official', displayName: 'DeepSeek', namespace: 'llm-deepseek', kind: 'deepseek',
          apiKeyEnv: 'DEEPSEEK_API_KEY', hasKey: true, models: [], defaultModel: 'deepseek-flash', isDefault: true,
          keyWarn: '',
        },
        {
          id: 'anthropic', displayName: 'Anthropic', namespace: 'llm-pi-ai', kind: 'pi-ai',
          apiKeyEnv: 'ANTHROPIC_API_KEY', hasKey: true, models: [], defaultModel: '', isDefault: false,
          baseURL: '', api: '',
          /* 🆕 2026-10-05（⑦ 展示侧）：故意给一个"已存在但看起来不对"的密钥提示 ——
           *   本机实况就是 `ANTHROPIC_API_KEY` 只有 6 个字符（界面以前只显示"已配置"）。 */
          keyWarn: '这把密钥只有 6 个字符，看起来不像完整密钥（可能只粘贴了一部分）',   // ⚠️ 真机是主进程 i18n.t() 的结果，这里给同义字面量
        },
        {
          id: 'openai', displayName: 'OpenAI', namespace: 'llm-pi-ai', kind: 'pi-ai',
          apiKeyEnv: 'OPENAI_API_KEY', hasKey: false, models: [{ id: 'gpt-4o', name: 'GPT-4o' }], defaultModel: '', isDefault: false,
          baseURL: '', api: '', keyWarn: '',
        },
      ],
      defaultProvider: 'deepseek-official',
      defaultModel: 'deepseek-flash',
      reasoningEffort: 'high',
      language: 'zh',
      presets: ['openai', 'anthropic'],
      models: [],
      /* ③ 凭据来源：走"我们自己的家 + 两个键"这一支 */
      credentialKeys: [{ key: 'DEEPSEEK_API_KEY', configured: true }, { key: 'ANTHROPIC_API_KEY', configured: true }],
      credentialSource: 'isolated',
      credentialReadable: true,
    })
  },
  setDefaultProvider: record('setDefaultProvider'),
  setProviderKey: (providerId, keyEnv, keyValue) => {
    mark('setProviderKey')
    /* 🆕 2026-10-07：**记下参数** —— 用户报「自定义提供方保存 apikey 仍显示未配置」，
     *   要能断言"写进凭据库的名字"与"写进 profile 的 apiKeyEnv"**是同一个**；
     *   桩只记一个调用名是不够的。 */
    state.lastSetKey = { providerId, keyEnv, keyValue }
    // ⑦：故意回一个 warn，把"密钥形状提示"那一行也照进截图
    return Promise.resolve({ ok: true, apiKeyEnv: keyEnv, configured: true, warn: 'main.key.warnTooShort:6' })
  },
  addPiProvider: (route, opts) => {
    mark('addPiProvider')
    state.lastAddPi = { route, opts: opts || {} }
    return Promise.resolve({ ok: true })
  },
  removePiProvider: record('removePiProvider'),
  updatePiModels: record('updatePiModels'),
  // 🆕 2026-09-25（B 方案）：pi-ai 覆写字段（Base URL / API 协议 / 模型列表）；null = 删键
  setPiProviderFields: record('setPiProviderFields'),
  /* 🆕 2026-10-05（④⑤）：宿主模型目录 + 本会话模型（形状照真机实测抄）
   *   `lastUsed` 与 `next` **故意不同** —— 就是为了把"上一轮实际用：…"那一行照出来。 */
  getModelCatalog: (force) => {
    mark('getModelCatalog', force)
    return Promise.resolve({
      ok: true,
      default: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
      routableProviders: ['deepseek-official'],
      groups: [{
        id: 'deepseek-official', name: 'DeepSeek',
        models: [
          { id: 'deepseek-flash', name: 'DeepSeek-V41-Flash' },
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
          { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek-V4-Flash-Vision-Exp' },
        ],
      }],
      failures: [],
    })
  },
  getSessionModel: () => {
    mark('getSessionModel')
    return Promise.resolve({
      ok: true, sessionId: 'stub-session-1',
      next: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
      lastUsed: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp', reasoningEffort: 'high' },
      /* 🆕 2026-10-05：`fallback=false`（已绑到本会话）—— 想照"最近会话"那支就把这里改 true */
      fallback: false,
    })
  },
  selectSessionModel: (sessionId, provider, model) => {
    mark('selectSessionModel', { sessionId, provider, model })
    return Promise.resolve({ ok: true, selected: { provider, model }, sessionId })
  },
  onSessionModel: () => { mark('onSessionModel') },

  /* ── 🆕 2026-10-07：订阅登录（OAuth）—— 真实 preload 有这四个；
   *    桩里补上是为了**在真 Chromium 里测渲染**（清单 + 提问面板），
   *    尤其是"轮询重画会不会把正在输入的提问框顶掉"（用户报的那个 bug）。 */
  authFlows: () => { mark('authFlows'); return Promise.resolve(state.auth || { ok: true, flows: { ok: true, at: new Date().toISOString(), count: 0, flows: [] }, attempt: { ok: true, state: 'idle' } }) },
  authBegin: (key, method) => { mark('authBegin'); return Promise.resolve({ ok: true, key, method }) },
  authAnswer: (promptId, value) => { mark('authAnswer'); return Promise.resolve({ ok: true, promptId, value }) },
  authCancel: () => {
    mark('authCancel')
    /* 像真宿主一样：取消之后这次尝试就不再是 running（界面靠它判断"能不能换一家"） */
    if (state.auth && state.auth.attempt) state.auth.attempt.state = 'cancelled'
    return Promise.resolve({ ok: true })
  },
}

/* 测试钩子：直接换掉"宿主那份快照"（authFlows 会回读它） */
api.__setAuth = (a) => { state.auth = a }

contextBridge.exposeInMainWorld('svsettings', api)
