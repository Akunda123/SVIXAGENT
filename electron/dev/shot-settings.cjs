/**
 * 设置页截图器（排查 CSS 用）：真 Chromium 加载 src/settings.html + 桩 preload，
 * 切到指定页、注入桥状态文案，再 capturePage 存 PNG，便于直接肉眼看样式问题。
 *
 * 跑法（electron 目录下）：
 *   npx electron dev/shot-settings.cjs                    # 默认截「状态」页（桥在线长文案）
 *   npx electron dev/shot-settings.cjs status bridge-off  # 桥离线文案
 * 产物：dev/shots/<名字>.png
 */
'use strict'

const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const page = process.argv[2] || 'status'
const variant = process.argv[3] || 'bridge-on'
const width = Number(process.argv[4] || 900)
const height = Number(process.argv[5] || 800)

const SETTINGS_HTML = path.join(__dirname, '..', 'src', 'settings.html')
const STUB_PRELOAD = path.join(__dirname, 'test-settings-preload.cjs')
const OUT_DIR = path.join(__dirname, 'shots')

/** 与主进程 reply() 拼出来的真实文案同形 */
const MESSAGES = {
  'bridge-on':
    'SV 桥在线 · Synthesizer V Studio Pro 1.11.2 · bridge 0.3.6 · ' +
    '心跳 3s · ping 12ms · 20 个 op（SV1）',
  'bridge-off':
    'sv：心跳过期 39416s（桥没在跑？在 SV 里重跑 AKDAgentBridge.lua） ｜ ' +
    'ix：没有心跳文件（-ix 通道未用过）',
  'bridge-short': '桥不在线',
}

/* 🆕 2026-10-05：**给截图工具接上真字典**。
 *   以前桩 preload 里 `sendSync('akdagent-i18n-sync')` 没人应答 ⇒ 退化成"显示 key"，
 *   于是截图里全是 `settings.model.title` 这种键名（样式能看、**文案看不出**，等于验收不了中文排版）。
 *   这里把 `src/i18n/*.json` 按 common 打底 + settings 覆盖合并（与 `i18n/index.js` 的 dictFor 同口径），
 *   并支持 `AKDAGENT_SHOT_LOCALE` 选语种（默认 zh-Hans）。 */
const I18N_DIR = path.join(__dirname, '..', 'src', 'i18n')
function buildDict(locale) {
  const dict = {}
  for (const ns of ['common', 'settings', 'orb', 'keyPrompt', 'svSetup']) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(I18N_DIR, ns + '.json'), 'utf8'))
      Object.assign(dict, j[locale] || {})
    } catch { /* 缺文件就跳过 */ }
  }
  return dict
}
const LOCALE = process.env.AKDAGENT_SHOT_LOCALE || 'zh-Hans'
const DICT = buildDict(LOCALE)
console.log(`[shot] locale=${LOCALE} · 字典 ${Object.keys(DICT).length} 键`)

app.whenReady().then(async () => {
  // 桩 preload 会 sendSync 这个通道（真 preload 也走它）⇒ 假主进程在这里应答，页面才有真文案
  const { ipcMain } = require('electron')
  ipcMain.on('akdagent-i18n-sync', (e) => { e.returnValue = { locale: LOCALE, dict: DICT } })
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      preload: STUB_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const js = (code) => win.webContents.executeJavaScript(code)

  await win.loadFile(SETTINGS_HTML)
  await new Promise((r) => setTimeout(r, 400))
  await js(`activatePage(${JSON.stringify(page)})`)
  await new Promise((r) => setTimeout(r, 250))

  if (page === 'status') {
    const ok = variant === 'bridge-on'
    await js(`window.svsettings.__emitBridge(${ok}, ${JSON.stringify(MESSAGES[variant] || variant)})`)
    await new Promise((r) => setTimeout(r, 200))
  }

  /* 🆕 2026-10-05：`variant === 'expanded'` ⇒ **展开第一张提供方卡片**再截图。
   *   为什么需要：模型页的卡片默认是折叠的，而"自定义列表为空 ⇒ 列宿主真目录"那组 chip
   *   （`renderCatalogChips`）长在卡片体里 ⇒ 不展开就永远看不到（第一次截图就吃了这个亏）。 */
  if (page === 'model' && variant === 'expanded') {
    const clicked = await js(`
      (() => {
        const cards = Array.from(document.querySelectorAll('#provider-list .provider-card'));
        for (const c of cards) {
          const btn = Array.from(c.querySelectorAll('button')).find((b) => /编辑|edit/i.test(b.textContent || ''));
          if (btn) { btn.click(); return true; }
        }
        return false;
      })()
    `)
    console.log('[shot] 展开卡片：' + clicked)
    await new Promise((r) => setTimeout(r, 400))
  }

  // 顺带把关键盒模型量出来（截图看形状，数字看是否溢出/挤压）
  const metrics = await js(`
    (() => {
      const get = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x),
                 radius: cs.borderRadius, display: cs.display, shrink: cs.flexShrink,
                 text: (el.textContent || '').trim().slice(0, 60) };
      };
      const rowEls = Array.from(document.querySelectorAll('.page.active .row'));
      return {
        badge: get('#bridge-badge'),
        hint: get('#bridge-hint'),
        row: rowEls.map((r) => { const b = r.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height) } }),
        mainScrollW: document.getElementById('main') ? document.getElementById('main').scrollWidth : null,
        mainClientW: document.getElementById('main') ? document.getElementById('main').clientWidth : null,
      };
    })()
  `)

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const img = await win.webContents.capturePage()
  const file = path.join(OUT_DIR, `${page}-${variant}.png`)
  fs.writeFileSync(file, img.toPNG())

  console.log(JSON.stringify(metrics, null, 2))
  console.log('saved: ' + file)
  app.exit(0)
})
