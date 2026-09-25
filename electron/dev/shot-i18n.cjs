/**
 * 四语界面截图工具：用**真 preload + 真字典**把某个窗口按指定语种渲染出来，存 PNG 并量关键盒子。
 * 用途：肉眼过一遍英文/日文下有没有挤爆布局（英文/日文文案通常比中文长，按钮容易溢出）。
 *
 * 跑法（electron 目录下）：
 *   npx electron dev/shot-i18n.cjs settings conv en
 *   npx electron dev/shot-i18n.cjs settings conv ja 680 760
 *   npx electron dev/shot-i18n.cjs orb chat zh-Hant
 *   npx electron dev/shot-i18n.cjs key-prompt '' en 600 320
 * 参数：<窗口> <页面(设置窗用)> <语种> [宽] [高]
 * 产物：dev/shots/<窗口>-<页面>-<语种>.png
 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const SRC = path.join(__dirname, '..', 'src')
const i18n = require(path.join(SRC, 'i18n'))

const winName = process.argv[2] || 'settings'
const page = process.argv[3] || 'conv'
const locale = process.argv[4] || 'zh-Hans'
const width = Number(process.argv[5] || (winName === 'settings' ? 680 : winName === 'orb' ? 380 : 600))
const height = Number(process.argv[6] || (winName === 'settings' ? 760 : winName === 'orb' ? 560 : 320))

const SPECS = {
  settings: { html: 'settings.html', preload: 'settings-preload.js', ns: 'settings' },
  orb: { html: 'orb.html', preload: 'orb-preload.js', ns: 'orb' },
  'key-prompt': { html: 'key-prompt.html', preload: 'key-prompt-preload.js', ns: 'keyPrompt' },
}
const spec = SPECS[winName]
if (!spec) {
  console.error('未知窗口：' + winName + '（可选 settings / orb / key-prompt）')
  app.exit(2)
}

/* 让页面里的 invoke 有回应，动态区块才会渲染（形状与主进程真实返回一致） */
const STUBS = {
  'akdagent-get-version': () => '1.0.0',
  'akdagent-get-ui-prefs': () => ({
    locale: i18n.getLocale(),
    locales: i18n.LOCALES.map((l) => ({ id: l, label: i18n.LOCALE_LABELS[l] })),
    firstRun: false,
  }),
  'akdagent-get-orb-state': () => ({ autostart: true, alwaysOnTop: false }),
  'akdagent-get-providers': () => ({
    providers: [
      { id: 'deepseek', displayName: 'DeepSeek', apiKeyEnv: 'DEEPSEEK_API_KEY', hasKey: true, isDefault: true, kind: 'builtin', models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }] },
    ],
    presets: [],
    models: [],
    language: 'zh',
    reasoningEffort: 'high',
  }),
  'akdagent-get-settings': () => ({}),
  'akdagent-get-sv-config': () => ({ dirs: ['C:/Users/you/Documents/Dreamtonics/Synthesizer V Studio/scripts'], bridgeSrc: 'C:/sv/AKDAgentBridge.lua', bridgeOk: true }),
  'akdagent-sv-flat-status': () => ({ isFlat: false, proc: false, dirExists: false, nofsJson: false, dataDir: '', dbDir: '' }),
  'akdagent-scan-sv-scripts': () => ({ found: [] }),
  'akdagent-read-nofs': () => ({ ok: true, data: '{}' }),
  'akdagent-stt-status': () => ({
    ready: true,
    activeId: 'std',
    installedModels: ['std'],
    models: [
      { id: 'light', label: '轻量，快', installed: false },
      { id: 'std', label: '标准，均衡', installed: true },
      { id: 'precise', label: '精确，慢', installed: false },
    ],
  }),
  'akdagent-agent-ready-query': () => ({ ready: true, text: 'ok' }),
  'akdagent-agent-session-state': () => ({ stale: false }),
  'akdagent-agent-history': () => ({
    ok: true,
    events: [
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo.svp', gen: 1 }, type: 'user/message', data: { message: { content: [{ type: 'text', text: 'hello there' }] } } },
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo.svp', gen: 1 }, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'hi, ready.' }] } } },
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo.svp', gen: 1 }, type: 'tool/call', data: { name: 'sv_ping', arguments: {} } },
      { __seg: { segId: 's2', kind: 'temp', gen: 2 }, type: 'user/message', data: { message: { content: [{ type: 'text', text: 'temp project' }] } } },
    ],
  }),
}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  i18n.init({ getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-shot-')), getSystemLocale: () => locale, getLocale: () => locale })
  i18n.setLocale(locale)

  for (const [ch, fn] of Object.entries(STUBS)) ipcMain.handle(ch, fn)
  ipcMain.on('akdagent-i18n-sync', (e) => { e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor(spec.ns) } })

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: { preload: path.join(SRC, spec.preload), contextIsolation: true, nodeIntegration: false },
  })
  await win.loadFile(path.join(SRC, spec.html))
  await new Promise((r) => setTimeout(r, 700))

  const js = (code) => win.webContents.executeJavaScript(code)
  if (winName === 'settings' && page && page !== '') {
    await js(`typeof activatePage === 'function' ? activatePage(${JSON.stringify(page)}) : null`)
    await new Promise((r) => setTimeout(r, 300))
  }
  if (winName === 'orb') {
    // 展开聊天面板，才能看到面板里的文案
    await js(`document.getElementById('chat-overlay') && document.getElementById('chat-overlay').classList.add('open')`)
    await new Promise((r) => setTimeout(r, 200))
  }

  // 关键盒子 + 溢出检测：英文/日文最容易在这里露馅
  const metrics = await js(`
    (() => {
      const out = { overflow: [], boxes: [], wide: [] };
      const root = document.querySelector('.page.active') || document.body;
      // 全量扫：谁的内容比盒子宽（文字被挤出去）就报谁
      root.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
          out.overflow.push({ tag: el.tagName, id: el.id || null, cls: String(el.className || '').slice(0, 30),
            text: (el.textContent || '').trim().slice(0, 40), scrollW: el.scrollWidth, clientW: el.clientWidth });
        }
      });
      out.docScrollW = document.documentElement.scrollWidth;
      out.docClientW = document.documentElement.clientWidth;
      // 行内元素：按钮/下拉排成一行时最容易被长文案撑开
      root.querySelectorAll('.actions, .add-provider-row, .row').forEach((el) => {
        const kids = Array.from(el.children).map((c) => { const r = c.getBoundingClientRect();
          return { w: Math.round(r.width), text: (c.textContent || '').trim().slice(0, 28) }; });
        const r = el.getBoundingClientRect();
        const sum = kids.reduce((a, k) => a + k.w, 0);
        out.boxes.push({ cls: String(el.className || '').slice(0, 20), rowW: Math.round(r.width), kidsW: sum,
          scrollW: el.scrollWidth, clientW: el.clientWidth, kids });
      });
      out.sample = Array.from(root.querySelectorAll('.label, .hint, button')).slice(0, 12).map((el) => (el.textContent || '').trim().slice(0, 50));
      return out;
    })()
  `)

  const OUT = path.join(__dirname, 'shots')
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${winName}-${page || 'main'}-${locale}.png`)
  fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG())

  console.log(`--- ${winName}/${page || '-'} / ${locale} @ ${width}×${height} ---`)
  console.log('文本溢出元素：' + (metrics.overflow.length === 0 ? '（无）' : ''))
  for (const o of metrics.overflow) console.log('  ❌ ' + JSON.stringify(o))
  console.log(`文档宽 ${metrics.docScrollW} / 可视宽 ${metrics.docClientW}${metrics.docScrollW > metrics.docClientW ? '（横向溢出！）' : ''}`)
  for (const b of metrics.boxes) {
    const over = b.kidsW > b.clientW + 1
    console.log(`行 ${b.cls}: 行宽 ${b.rowW} 子元素合计 ${b.kidsW}${over ? '  ❌ 子元素超出容器宽' : ''}`)
  }
  console.log('文案抽样：')
  for (const s of metrics.sample) console.log('  · ' + s)
  console.log('saved: ' + file)
  app.exit(0)
})
