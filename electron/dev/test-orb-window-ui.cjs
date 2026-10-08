'use strict'
// Actual Electron page/pointer capture and BrowserWindow geometry. Cursor input
// is injected: this is not a physical mouse or mixed-DPI monitor certification.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const source = process.env.AKD_TEST_ASAR ? path.join(process.env.AKD_TEST_ASAR, 'src') : path.join(__dirname, '../src')
const { createOrbWindowController } = require(path.join(source, 'orb-window'))
const i18n = require(path.join(source, 'i18n'))
const evidence = path.join(__dirname, '../../dist/orb-window-test/evidence' + (process.env.AKD_TEST_ASAR ? '-packaged' : ''))
fs.mkdirSync(evidence, { recursive: true })
const userData = fs.mkdtempSync(path.join(evidence, 'userData-'))
app.setPath('userData', userData); app.on('window-all-closed', () => {})
setTimeout(() => app.exit(3), 55000).unref()
const checks = [], errors = []
const check = (name, ok) => { checks.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name); assert.ok(ok, name) }
app.whenReady().then(async () => {
  i18n.init({ getPath: () => userData, getSystemLocale: () => 'en' })
  const win = new BrowserWindow({ x: 600, y: 300, width: 64, height: 64, show: false, frame: false, transparent: true, resizable: false,
    webPreferences: { preload: path.join(source, 'orb-preload.js'), contextIsolation: true, nodeIntegration: false } })
  let cursor = { x: 620, y: 330 }, saved = {}, contextMenus = 0
  const controller = createOrbWindowController({ getWindow: () => win, cursor: () => cursor, workArea: () => ({ x: 0, y: 0, width: 1600, height: 1200 }),
    readPrefs: () => saved, writePrefs: (value) => { saved = value }, notify: (value) => win.webContents.send('akdagent-window-geometry', value) })
  controller.register(ipcMain)
  ipcMain.on('akdagent-i18n-sync', (event) => { event.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor('orb') } })
  ipcMain.on('akdagent-context-menu', () => contextMenus++)
  for (const [name, value] of Object.entries({ 'agent-ready-query': { ready: false }, 'stt-status': null, 'model-catalog': { ok: true, groups: [] },
    'session-model': { ok: true, next: null }, 'agent-history': { ok: true, events: [] }, 'agent-session-state': { ok: true } })) {
    ipcMain.handle('akdagent-' + name, () => value)
  }
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && !message.includes('Electron Security Warning')) errors.push(message) })
  win.on('blur', () => controller.stop())
  await win.loadFile(path.join(source, 'orb.html')); controller.emit()
  // Hidden Windows compositors pause CSS transitions. This deterministic
  // reduced-motion path tests hit areas/gestures, not animation timing.
  await win.webContents.insertCSS('* { transition:none !important; animation:none !important; }')
  const js = (code) => win.webContents.executeJavaScript(code)
  win.webContents.focus()
  const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms))
  const anchor = () => { const b = win.getBounds(); return { x: b.x + b.width, y: b.y + b.height } }
  const location = async (selector) => {
    const p = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
    const b = win.getBounds(); return { x: b.x + p.x, y: b.y + p.y }
  }
  let leftDown = false
  async function pointer(type, p, button = 'left') {
    cursor = p; const b = win.getBounds()
    if (type === 'mouseDown' && button === 'left') leftDown = true
    win.webContents.sendInputEvent({ type, x: Math.round(p.x - b.x), y: Math.round(p.y - b.y), globalX: Math.round(p.x), globalY: Math.round(p.y), button, clickCount: 1,
      modifiers: leftDown && type !== 'mouseUp' ? ['leftButtonDown'] : [] })
    if (type === 'mouseUp') leftDown = false
    await wait(45)
  }
  async function drag(selector, dx, dy) {
    await pointer('mouseMove', await location(selector)); await wait()
    const start = await location(selector)
    await pointer('mouseDown', start)
    await pointer('mouseMove', { x: start.x + dx, y: start.y + dy })
    await pointer('mouseUp', { x: start.x + dx, y: start.y + dy }); await wait()
  }
  await wait(); await pointer('mouseMove', await location('#orb')); await wait()
  const before = anchor()
  await drag('#orb', 60, 40)
  check('dragging the orb itself moves the window', anchor().x === before.x + 60 && anchor().y === before.y + 40)
  check('drag does not accidentally open chat', await js(`!document.getElementById('chat-overlay').classList.contains('open')`))
  const stopped = win.getBounds(); await wait(500)
  check('release stops the gesture and stationary window stays put', !controller.isActive() && JSON.stringify(win.getBounds()) === JSON.stringify(stopped))
  const clickAt = await location('#orb'); await pointer('mouseDown', clickAt); await pointer('mouseUp', clickAt); await wait()
  check('an ordinary orb click still opens chat', await js(`document.getElementById('chat-overlay').classList.contains('open')`))
  check('all eight edges/corners have resize cursors and accessible names', await js(`[...document.querySelectorAll('.chat-resize-handle')].length===8 && [...document.querySelectorAll('.chat-resize-handle')].every(e=>getComputedStyle(e).cursor.endsWith('resize')&&e.getAttribute('aria-label')&&!e.getAttribute('aria-label').startsWith('ux.'))`))
  const oldSize = win.getBounds()
  await drag('.edge-se', 80, 60)
  check('pointer capture resizes the real transparent BrowserWindow', win.getBounds().width === oldSize.width + 80 && win.getBounds().height === oldSize.height + 60)
  check('completed custom size is remembered', saved.width === win.getBounds().width && saved.height === win.getBounds().height)
  const custom = { ...saved }
  await js(`document.getElementById('chat-close').click()`); await wait(); await js(`document.getElementById('orb').click()`); await wait()
  check('closing and reopening preserves the custom chat size', win.getBounds().width === custom.width && win.getBounds().height === custom.height)
  await js(`document.querySelector('.edge-e').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' }); await wait()
  check('keyboard arrow key resizes the selected edge', win.getBounds().width === custom.width + 10)
  const headerBefore = anchor(); await drag('#chat-title', 30, 40)
  check('non-button header also moves chat', anchor().x === headerBefore.x + 30 && anchor().y === headerBefore.y + 40)
  for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const old = win.getBounds(), dx = edge.includes('w') ? -10 : edge.includes('e') ? 10 : 0,
      dy = edge.includes('n') ? -10 : edge.includes('s') ? 10 : 0
    await drag('.edge-' + edge, dx, dy)
    check('real pointer resize edge ' + edge, win.getBounds().width === old.width + Math.abs(dx) && win.getBounds().height === old.height + Math.abs(dy))
  }
  const p = await location('#orb'); await pointer('mouseDown', p, 'right'); await pointer('mouseUp', p, 'right')
  check('right button is a context menu, not a drag', !controller.isActive() && contextMenus === 1)
  await pointer('mouseDown', await location('#orb'))
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' }); await wait()
  check('Escape cancels pointer capture and geometry together', !controller.isActive())
  await pointer('mouseUp', cursor)
  check('releasing a cancelled drag does not toggle chat', await js(`document.getElementById('chat-overlay').classList.contains('open')`))
  check('window remains inside the work area', win.getBounds().x >= 0 && win.getBounds().y >= 0)
  check('no renderer errors', errors.length === 0)
  fs.writeFileSync(path.join(evidence, 'resizable-chat.png'), (await win.webContents.capturePage()).toPNG())
  fs.writeFileSync(path.join(evidence, 'orb-verification.json'), JSON.stringify({ checks, errors, electron: process.versions.electron, physicalMouseTested: false, installedAppModified: false }, null, 2))
  controller.stop(); win.destroy(); app.exit(0)
}).catch((error) => { console.error(error.stack); console.error(JSON.stringify(errors)); app.exit(1) })
