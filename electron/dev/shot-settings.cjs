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

app.whenReady().then(async () => {
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
