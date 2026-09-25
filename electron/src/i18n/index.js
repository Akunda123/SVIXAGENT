/**
 * Electron 客户端界面语言（i18n）—— **与 DSH 的语言设置相互独立**。
 *
 * - DSH 语言：`~/.dsh/settings.yaml` 的 `locale.preference`（模型回复语言 + DSH 网页界面）。
 * - 客户端语言：本模块，存 `app.getPath('userData')/ui-prefs.json` 的 `locale`。
 *   **首次启动**（文件不存在）按系统语言自动选：见 `detectSystemLocale()`。
 *
 * 语种：zh-Hans（简体）/ zh-Hant（繁體）/ en / ja。
 * 字典按「窗口命名空间」分文件：common / settings / orb / keyPrompt，
 * 每份 JSON 形如 `{ "zh-Hans": { "key": "文案" }, "en": { ... } }`。
 *
 * 渲染层怎么拿文案：preload 里 `ipcRenderer.sendSync('akdagent-i18n-sync')`
 * （preload 在沙箱里不能读文件，字典必须由主进程给），见 i18n/README.md。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** 支持的语种（顺序 = 设置页下拉顺序） */
const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja']
const DEFAULT_LOCALE = 'zh-Hans'
/** 语言名一律用**该语言自己的写法**（在英文界面里也显示「繁體中文」，不写 Traditional Chinese） */
const LOCALE_LABELS = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
}
/** 字典文件（去掉 .json）→ 供哪个窗口用 */
const NAMESPACES = ['common', 'settings', 'orb', 'keyPrompt']

let prefsPath = null
let locale = DEFAULT_LOCALE
let firstRun = false
let loaded = false
const dicts = {}

/** 系统语言 → 我们的四语之一 */
function normalizeLocale(raw) {
  const s = String(raw || '').trim()
  if (!s) return DEFAULT_LOCALE
  const low = s.toLowerCase()
  if (low.startsWith('zh')) {
    // 繁体区：台湾 / 香港 / 澳门，或显式 Hant
    if (/hant|tw|hk|mo/i.test(s)) return 'zh-Hant'
    return 'zh-Hans'
  }
  if (low.startsWith('ja')) return 'ja'
  if (low.startsWith('en')) return 'en'
  // 其余语种没有字典，退回英文（比退回中文更通用）
  return 'en'
}

/** 系统语言（Electron 33 有 getSystemLocale；老版本退回 getLocale） */
function detectSystemLocale(electronApp) {
  const app = electronApp || require('electron').app
  let raw = ''
  try {
    raw = (app.getSystemLocale && app.getSystemLocale()) || app.getLocale() || ''
  } catch {
    raw = ''
  }
  return normalizeLocale(raw)
}

function loadDicts() {
  for (const ns of NAMESPACES) {
    try {
      dicts[ns] = JSON.parse(fs.readFileSync(path.join(__dirname, ns + '.json'), 'utf8'))
    } catch (e) {
      console.error(`[i18n] 字典 ${ns}.json 读取失败：${e.message}`)
      dicts[ns] = {}
    }
  }
  loaded = true
}

/** 没 init 就取文案时按需加载字典：返回 key 也行，但不该因为"忘了 init"就整屏 key */
function ensureLoaded() {
  if (!loaded) loadDicts()
}

function readPrefs() {
  try {
    if (!fs.existsSync(prefsPath)) return null
    return JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
  } catch {
    return null
  }
}

function writePrefs(obj) {
  try {
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true })
    fs.writeFileSync(prefsPath, JSON.stringify(obj, null, 2) + '\n', 'utf8')
  } catch (e) {
    console.error('[i18n] 写 ui-prefs.json 失败：' + e.message)
  }
}

/**
 * 初始化：读 ui-prefs.json；**没有就按系统语言建一份**（首次启动只做一次）。
 * @returns {{locale: string, firstRun: boolean, systemLocale: string}}
 */
function init(electronApp) {
  const app = electronApp || require('electron').app
  prefsPath = path.join(app.getPath('userData'), 'ui-prefs.json')
  loadDicts()

  const systemLocale = detectSystemLocale(app)
  const prefs = readPrefs()
  if (prefs && LOCALES.includes(prefs.locale)) {
    locale = prefs.locale
    firstRun = false
  } else {
    locale = systemLocale
    firstRun = true
    writePrefs({ locale, localeSource: 'system', detectedFrom: systemLocale })
    console.log(`[i18n] 首次启动：按系统语言选 ${locale}（系统给的是 ${systemLocale}）`)
  }
  console.log(`[i18n] 客户端界面语言 = ${locale}${firstRun ? '（首次自动）' : ''}`)
  return { locale, firstRun, systemLocale }
}

function getLocale() {
  return locale
}

function setLocale(next) {
  if (!LOCALES.includes(next)) return { ok: false, error: 'unsupported locale: ' + next }
  locale = next
  writePrefs({ locale, localeSource: 'user' })
  return { ok: true, locale }
}

/** 占位符 {0} {1}：与渲染层 preload 的同名实现保持一致 */
function fill(s, args) {
  return String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m))
}

/**
 * 取某个窗口要用的合并字典：common 打底 + 该窗口命名空间覆盖。
 * 缺翻译时**逐级回退**：当前语种 → zh-Hans → key 本身（便于测试发现漏翻）。
 */
function dictFor(namespace) {
  ensureLoaded()
  const ns = NAMESPACES.includes(namespace) ? namespace : 'common'
  const picked = {}
  const wanted = ns === 'common' ? ['common'] : ['common', ns]
  const keys = new Set()
  for (const n of wanted) {
    const d = dicts[n] || {}
    for (const k of Object.keys(d[DEFAULT_LOCALE] || {})) keys.add(k)
    for (const l of LOCALES) for (const k of Object.keys(d[l] || {})) keys.add(k)
  }
  for (const k of keys) {
    let v
    for (const n of wanted) {
      const d = (dicts[n] || {})[locale] || {}
      if (d[k] !== undefined) { v = d[k]; break }
    }
    if (v === undefined) {
      for (const n of wanted) {
        const d = (dicts[n] || {})[DEFAULT_LOCALE] || {}
        if (d[k] !== undefined) { v = d[k]; break }
      }
    }
    picked[k] = v === undefined ? k : v
  }
  return picked
}

/** 主进程侧取文案（托盘/右键菜单/窗口标题/原生弹窗） */
function t(key, ...args) {
  const d = dictFor('common')
  return fill(d[key] !== undefined ? d[key] : key, args)
}

/** 缺翻译自检：返回「某语种缺哪些 key」的清单（开发用，也给测试脚本调） */
function audit() {
  const missing = {}
  for (const ns of NAMESPACES) {
    const d = dicts[ns] || {}
    const base = new Set(Object.keys(d[DEFAULT_LOCALE] || {}))
    for (const l of LOCALES) {
      const have = new Set(Object.keys(d[l] || {}))
      const lack = [...base].filter((k) => !have.has(k))
      if (lack.length) (missing[l] = missing[l] || []).push(...lack.map((k) => `${ns}:${k}`))
    }
    // 多出来的 key（只在非默认语种里存在）也报，防拼错
    for (const l of LOCALES) {
      const have = new Set(Object.keys(d[l] || {}))
      const extra = [...have].filter((k) => !base.has(k))
      if (extra.length) (missing[l] = missing[l] || []).push(...extra.map((k) => `${ns}:${k}（多出）`))
    }
  }
  return missing
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  NAMESPACES,
  init,
  getLocale,
  setLocale,
  detectSystemLocale,
  normalizeLocale,
  dictFor,
  t,
  audit,
  getPrefsPath: () => prefsPath,
  isFirstRun: () => firstRun,
}
