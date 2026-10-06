/**
 * test-pdf-render.cjs —— 客户端 **PDF → PNG** 渲染的真机自测（**需要 electron**）
 *
 * 跑法（在 `electron/` 目录下）：`npx electron dev/test-pdf-render.cjs [--pdf <绝对路径>]`
 *   · 不给 `--pdf` 时用 `pdf-lib` 现造一份 2 页 PDF（不碰用户文件）。
 *
 * 为什么值得测：这是**识谱的入口**。渲染页要 import 随包分发的 pdfjs（`electron/src/vendor/` 由
 *   `tools/stage-pdfjs.cjs` 落位）、要按 `file://` 读到 PDF、要真拿到 canvas 像素。
 *   任何一环坏了，用户看到的表现都只是"识谱说读不出谱子"——**看不出是渲染没成功**。
 *
 * 判据：页数听话（`maxPages` 真的生效）+ PNG 魔数 + 尺寸合理（DPI 有效）+ 字节数不为空。
 * 失败**不静默**：打印可读原因并以非 0 退出。
 */
'use strict'
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const argv = process.argv.slice(2)
const pdfArgIdx = argv.indexOf('--pdf')
const USER_PDF = pdfArgIdx >= 0 ? argv[pdfArgIdx + 1] : ''

const checks = []
function ok(name, cond, extra) {
  checks.push({ name, pass: !!cond })
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? '  — ' + extra : ''}`)
}

/** 现造一份 2 页 PDF（带"谱表感"的横线，便于肉眼看渲染结果）。 */
async function makeTestPdf(file) {
  let lib = null
  for (const p of ['../server/node_modules/pdf-lib', '../../server/node_modules/pdf-lib', 'pdf-lib']) {
    try { lib = require(p); break } catch { /* 试下一个 */ }
  }
  if (!lib) throw new Error('拿不到 pdf-lib（应在 server/node_modules 里）⇒ 无法造测试 PDF')
  const doc = await lib.PDFDocument.create()
  const font = await doc.embedFont(lib.StandardFonts.Helvetica)
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([595, 842])            // A4
    page.drawText(`AKDAgent PDF render test — page ${i + 1}/2`, { x: 60, y: 780, size: 20, font })
    for (let k = 0; k < 10; k++) {                   // 10 组五线谱状横线
      const top = 700 - k * 46
      for (let s = 0; s < 5; s++) {
        page.drawLine({ start: { x: 60, y: top - s * 6 }, end: { x: 535, y: top - s * 6 }, thickness: 0.8 })
      }
    }
  }
  fs.writeFileSync(file, await doc.save())
}

app.whenReady().then(async () => {
  const page = path.join(__dirname, '..', 'src', 'pdf-render.html')
  const vendor = path.join(__dirname, '..', 'src', 'vendor', 'pdfjs', 'legacy', 'build', 'pdf.min.mjs')
  console.log('【前置】')
  ok('渲染页在', fs.existsSync(page), page)
  ok('随包 pdfjs 已落位', fs.existsSync(vendor), vendor)
  if (!fs.existsSync(page) || !fs.existsSync(vendor)) { app.exit(1); return }

  let pdf = USER_PDF
  if (!pdf) {
    pdf = path.join(os.tmpdir(), 'akdagent-pdf-render-selftest.pdf')
    try { await makeTestPdf(pdf); ok('造出 2 页测试 PDF', fs.statSync(pdf).size > 1000, `${(fs.statSync(pdf).size / 1024).toFixed(1)} KB`) }
    catch (e) { ok('造出 2 页测试 PDF', false, e.message); app.exit(1); return }
  } else {
    ok('用你给的 PDF', fs.existsSync(pdf), `${pdf}（${(fs.statSync(pdf).size / 1048576).toFixed(2)} MB）`)
  }

  const win = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, nodeIntegration: false },
  })
  let failed = false
  try {
    await win.loadFile(page)
    console.log('【渲染】')
    const t0 = Date.now()
    const pages = await win.webContents.executeJavaScript(
      `window.renderPdfToPngs(${JSON.stringify({ path: pdf, dpi: 150, maxPages: 2 })})`, true)
    const ms = Date.now() - t0
    ok('renderPdfToPngs 有返回', Array.isArray(pages), `耗时 ${ms} ms`)
    if (Array.isArray(pages) && pages.length) {
      ok('页数 = 2（maxPages 生效）', pages.length === 2, `实际 ${pages.length}`)
      const p1 = pages[0]
      const b = Uint8Array.from(p1.bytes || [])
      ok('PNG 魔数 \x89PNG', b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, `${b.length} 字节`)
      ok('像素尺寸合理（150 DPI 的 A4 ≈ 1240×1754）', p1.width > 1000 && p1.height > 1400, `${p1.width}×${p1.height}`)
      ok('effectiveDpi 回填', Number(p1.effectiveDpi) >= 100, String(p1.effectiveDpi))
      ok('字节数不为空', b.length > 5000, `${(b.length / 1024).toFixed(1)} KB`)
    } else {
      ok('页数 = 2（maxPages 生效）', false, '没渲出任何页')
    }
    // 上限要真的管用（多给了也要被夹住）
    const one = await win.webContents.executeJavaScript(
      `window.renderPdfToPngs(${JSON.stringify({ path: pdf, dpi: 96, maxPages: 1 })})`, true)
    ok('maxPages=1 时只渲 1 页', Array.isArray(one) && one.length === 1, `实际 ${Array.isArray(one) ? one.length : 'n/a'}`)
    // 文件名里的 `#`：2026-10-06 复核实测「原样拼 file:// URL ⇒ `#` 被当 fragment ⇒ Failed to fetch」，
    // 已改成 encodeURI + 补转义 `#`/`?` ⇒ 这条把它钉住（中文/空格/`%` 本来就没事）。
    const tricky = path.join(path.dirname(pdf), '谱#1 (a&b).pdf')
    try {
      fs.copyFileSync(pdf, tricky)
      const tk = await win.webContents.executeJavaScript(
        `window.renderPdfToPngs(${JSON.stringify({ path: tricky, dpi: 96, maxPages: 1 })})`, true)
      const tb = Array.isArray(tk) && tk[0] ? Uint8Array.from(tk[0].bytes || []) : new Uint8Array()
      ok('文件名带 `#` 也能渲染（URL 已编码）', Array.isArray(tk) && tk.length === 1 && tb[0] === 0x89, `页数 ${Array.isArray(tk) ? tk.length : 'n/a'}`)
    } catch (e) {
      ok('文件名带 `#` 也能渲染（URL 已编码）', false, (e && e.message) || String(e))
    }
  } catch (e) {
    failed = true
    ok('渲染没抛异常', false, (e && e.message) || String(e))
  } finally {
    try { win.destroy() } catch { /* 忽略 */ }
  }

  const pass = checks.filter((c) => c.pass).length
  const bad = checks.filter((c) => !c.pass).length
  console.log(`\n===== PDF→PNG 自测：${pass} 通过 / ${bad} 失败 =====`)
  app.exit(bad || failed ? 1 : 0)
}).catch((e) => {
  console.error('自测崩了：' + ((e && e.stack) || e))
  app.exit(1)
})
