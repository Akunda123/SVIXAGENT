/**
 * 徽标（.badge）布局回归测试 —— 防「桥连接椭圆」再犯。
 *
 * 病根（2026-09-13 用户报「桥连接椭圆的 css 出问题了」）：
 *   状态页的长 hint 文案把右侧徽标挤扁 —— `.row` 是 flex，徽标 `flex-shrink:1` 且文字可换行，
 *   在设置窗默认宽度 680 下徽标被压成 53×54（"未连接"折成两行）⇒ 999px 圆角把方块变成"椭圆"。
 * 修复：`.row > div:first-child { min-width:0 }` 让文字列收缩换行 + `.badge { flex-shrink:0; white-space:nowrap }`。
 *
 * 本测试在真 Chromium 里量盒子，并**故意用内联样式复原旧 CSS** 复现病态，确认量法确实能抓到它。
 *
 * 跑法（electron 目录下）：npx electron dev/test-badge-layout.cjs
 * 退出码：0 = 通过，1 = 失败。
 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const SETTINGS_HTML = path.join(__dirname, '..', 'src', 'settings.html')
const STUB_PRELOAD = path.join(__dirname, 'test-settings-preload.cjs')
const i18n = require(path.join(__dirname, '..', 'src', 'i18n'))

// 反复建/销毁窗口：别让最后一个窗口关闭带走 app
app.on('window-all-closed', () => {})

/** 与主进程拼出的最坏情况文案同形（两座桥都离线，最长） */
const LONG_MSG =
  'sv：心跳过期 39416s（桥没在跑？在 SV 里重跑 AKDAgentBridge.lua） ｜ ' +
  'ix：没有心跳文件（-ix 通道未用过）'

const failures = []
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''))
}

/** 量当前布局：徽标盒子 + 行/主区是否横向溢出 */
const MEASURE = `
  (() => {
    const badge = document.getElementById('bridge-badge');
    const row = badge.closest('.row');
    const br = badge.getBoundingClientRect(), rr = row.getBoundingClientRect();
    const cs = getComputedStyle(badge);
    const main = document.getElementById('main');
    return {
      w: Math.round(br.width), h: Math.round(br.height),
      radius: cs.borderRadius, shrink: cs.flexShrink, wrap: cs.whiteSpace,
      rowH: Math.round(rr.height),
      overflowX: main.scrollWidth - main.clientWidth,
    };
  })()
`

const wins = []

async function run(width, height) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: { preload: STUB_PRELOAD, contextIsolation: true, nodeIntegration: false },
  })
  const js = (code) => win.webContents.executeJavaScript(code)
  await win.loadFile(SETTINGS_HTML)
  await new Promise((r) => setTimeout(r, 400))
  await js(`activatePage('status')`)
  await js(`window.svsettings.__emitBridge(false, ${JSON.stringify(LONG_MSG)})`)
  await new Promise((r) => setTimeout(r, 250))

  const tag = `${width}×${height}`

  /* ① 修复后的真实布局：徽标必须保持"药丸"形（一行高、横向够宽） */
  const now = await js(MEASURE)
  check(`[${tag}] 徽标不收缩（flex-shrink:0）`, now.shrink === '0', now.shrink)
  check(`[${tag}] 徽标不换行（white-space:nowrap）`, now.wrap === 'nowrap', now.wrap)
  check(`[${tag}] 徽标是药丸：单行高度 ≤ 30`, now.h <= 30, `h=${now.h}`)
  check(`[${tag}] 徽标是药丸：宽度 ≥ 60`, now.w >= 60, `w=${now.w}`)
  check(`[${tag}] 圆角仍是全圆（999px）`, now.radius === '999px', now.radius)
  check(`[${tag}] 长文案不撑出横向滚动`, now.overflowX <= 0, `overflowX=${now.overflowX}`)

  /* ② 复原旧 CSS（内联覆盖）→ 必须复现"椭圆"：否则说明本测试量不到这个病 */
  const broken = await js(`
    (() => {
      const badge = document.getElementById('bridge-badge');
      badge.style.flexShrink = '1'; badge.style.whiteSpace = 'normal';
      const first = badge.closest('.row').querySelector('div');
      first.style.minWidth = 'auto'; first.style.flex = '0 1 auto';
      const m = ${MEASURE};
      badge.style.flexShrink = ''; badge.style.whiteSpace = '';
      first.style.minWidth = ''; first.style.flex = '';
      return m;
    })()
  `)
  check(
    `[${tag}] 旧 CSS 确实会复现"椭圆"（h≥30 或 w<60）`,
    broken.h >= 30 || broken.w < 60,
    `旧: ${broken.w}×${broken.h} / 新: ${now.w}×${now.h}`
  )

  /* ③ 复原后回到药丸形 */
  const back = await js(MEASURE)
  check(`[${tag}] 复原内联样式后仍为药丸`, back.h <= 30 && back.w >= 60, `${back.w}×${back.h}`)

  console.log(`--- ${tag} --- 新: ${now.w}×${now.h} · 旧: ${broken.w}×${broken.h} · 行高 ${now.rowH} · overflowX ${now.overflowX}`)
  wins.push(win)
}

app.whenReady().then(async () => {
  // 桩 preload 现在也要 i18n 字典（页面文案全走 window.svi18n）
  i18n.init({ getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-badge-')), getSystemLocale: () => 'zh-CN', getLocale: () => 'zh-CN' })
  i18n.setLocale('zh-Hans')
  ipcMain.on('akdagent-i18n-sync', (e) => { e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor('settings') } })

  // 默认窗口尺寸 680×720、最小尺寸 560×520 都要正常
  // （窗口留到测试结束再销毁：load 中途 destroy 会让下一次 loadFile 报 ERR_FAILED）
  await run(680, 720)
  await run(560, 520)

  console.log('=== 断言 ===')
  for (const c of checks) console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + (c.ok ? '' : ' → ' + c.detail))
  console.log(`=== ${checks.length - failures.length}/${checks.length} 通过 ===`)
  if (failures.length) console.log('失败项：\n' + failures.map((f) => ' - ' + f).join('\n'))
  app.exit(failures.length ? 1 : 0)
})
