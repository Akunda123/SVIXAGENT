/**
 * 渲染层点击测试：在真实 Chromium 里加载 src/settings.html（配桩 preload），
 * ① 记录页面脚本的 JS 错误；② 逐个 .click() 关键按钮，回读 svsettings 调用记录；
 * ③ 模拟主进程回推，断言「悬浮球」区按钮文案真的会跟着变（这才是用户看到的反馈）。
 *
 * 跑法（electron 目录下）：npx electron dev/test-settings-clicks.cjs
 * 退出码：0 = 全部通过，1 = 有失败项。
 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const SETTINGS_HTML = path.join(__dirname, '..', 'src', 'settings.html')
const STUB_PRELOAD = path.join(__dirname, 'test-settings-preload.cjs')
const i18n = require(path.join(__dirname, '..', 'src', 'i18n'))

// 测试里会反复建/销毁窗口：别让最后一个窗口关闭把 app 带走（否则下一次 loadFile 报 ERR_FAILED）
app.on('window-all-closed', () => {})

const pageErrors = []
const consoleErrors = []
const failures = []
const checks = []

/** 依次点击的按钮选择器（悬浮球区 + 对照用的桥检查按钮） */
const TARGETS = ['#btn-check-bridge', '#btn-autostart', '#btn-always-top', '#btn-orb-reset', '#btn-open-chat']

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''))
}

app.whenReady().then(async () => {
  // 桩 preload 现在也要 i18n 字典（页面文案全走 window.svi18n）
  i18n.init({ getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-clicks-')), getSystemLocale: () => 'zh-CN', getLocale: () => 'zh-CN' })
  i18n.setLocale('zh-Hans')
  ipcMain.on('akdagent-i18n-sync', (e) => { e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor('settings') } })

  const win = new BrowserWindow({
    width: 900,
    height: 800,
    show: false,
    webPreferences: {
      preload: STUB_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !/Security Warning|Content Security/.test(message)) consoleErrors.push(message)
  })
  win.webContents.on('render-process-gone', (_e, d) => {
    console.log('renderer gone: ' + JSON.stringify(d))
  })

  const js = (code) => win.webContents.executeJavaScript(code)

  await win.loadFile(SETTINGS_HTML)
  await new Promise((r) => setTimeout(r, 500))
  await js(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)))`)

  // 切到「状态」页（悬浮球区在那里）
  await js(`activatePage('status')`)
  await new Promise((r) => setTimeout(r, 300))

  /* ① 初始状态应由 getOrbState 回读驱动（桩里 autostart/alwaysOnTop 都是 true） */
  const initial = await js(`({
    autostart: document.getElementById('btn-autostart').textContent,
    alwaysTop: document.getElementById('btn-always-top').textContent,
    hasReset: !!document.getElementById('btn-orb-reset'),
    hasTip: !!document.getElementById('orb-tip'),
  })`)
  check('初始：开机自启按钮 = 已启用', initial.autostart === '已启用', initial.autostart)
  check('初始：置顶按钮 = 置顶中', initial.alwaysTop === '置顶中', initial.alwaysTop)
  check('存在「贴回右下角」按钮', initial.hasReset)
  check('存在悬浮球反馈行 #orb-tip', initial.hasTip)

  /* ② 点击是否到达 IPC */
  const results = []
  for (const sel of TARGETS) {
    const r = await js(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { sel: ${JSON.stringify(sel)}, found: false };
        const n = () => document.querySelectorAll('[data-call]').length;
        const before = n();
        el.click();
        return { sel: ${JSON.stringify(sel)}, found: true, text: el.textContent,
                 disabled: el.disabled, reached: n() > before };
      })()
    `)
    results.push(r)
    check('点击到达 IPC：' + sel, r.found && r.reached, JSON.stringify(r))
    await new Promise((res) => setTimeout(res, 80))
  }

  /* ③ 主进程回推 → 按钮文案与反馈行必须变（旧实现的病根就在这里） */
  const emitted = await js(`window.svsettings.__emit('autostart', false)`)
  check('页面订阅了 autostart 变更', emitted === true)
  let labels = await js(`({ a: document.getElementById('btn-autostart').textContent, tip: document.getElementById('orb-tip').textContent })`)
  check('回推 autostart=false → 按钮变「启用」', labels.a === '启用', labels.a)
  check('回推 autostart=false → 有反馈文案', /已关闭开机自启/.test(labels.tip), labels.tip)

  await js(`window.svsettings.__emit('alwaysTop', false)`)
  labels = await js(`({ t: document.getElementById('btn-always-top').textContent, tip: document.getElementById('orb-tip').textContent })`)
  check('回推 alwaysTop=false → 按钮变「已取消」', labels.t === '已取消', labels.t)
  check('回推 alwaysTop=false → 有反馈文案', /已取消置顶/.test(labels.tip), labels.tip)

  await js(`window.svsettings.__emit('orbReset', true)`)
  labels = await js(`({ tip: document.getElementById('orb-tip').textContent })`)
  check('回推位置复位 → 有反馈文案', /贴回当前屏幕右下角/.test(labels.tip), labels.tip)

  /* ④ 静态接线检查：主进程发的事件，preload 与页面都接上了 */
  const calls = await js(`Array.from(document.querySelectorAll('[data-call]')).map((e) => e.dataset.call)`)
  const errs = await js(`window.__errs`)

  console.log('=== 页面脚本错误 ===')
  console.log(errs && errs.length ? errs.join('\n') : '（无）')
  console.log('=== console error（安全告警已过滤） ===')
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '（无）')
  console.log('=== 点击结果 ===')
  for (const r of results) console.log(JSON.stringify(r))
  console.log('=== svsettings 调用序列 ===')
  console.log(JSON.stringify(calls))
  console.log('=== 断言 ===')
  for (const c of checks) console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + (c.ok ? '' : ' → ' + c.detail))
  console.log(`=== ${checks.length - failures.length}/${checks.length} 通过 ===`)
  if (failures.length) console.log('失败项：\n' + failures.map((f) => ' - ' + f).join('\n'))

  app.exit(failures.length ? 1 : 0)
})
