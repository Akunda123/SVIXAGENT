/**
 * test-audio-decode.cjs —— 客户端 **音频 → WAV** 解码的真机自测（**需要 electron**）
 *
 * 跑法（在 `electron/` 目录下）：
 *   `npx electron dev/test-audio-decode.cjs`                     ← 默认：现造一段 48 kHz 立体声正弦波，全自动、可重复
 *   `npx electron dev/test-audio-decode.cjs --m4a <绝对路径>`     ← 额外真解一个真 m4a（用户那份 AAC 曲）
 *
 * 为什么值得测：这是"**m4a/AAC 转不出可用 WAV**"（用户 2026-10-06 亲报「转换的 wav 是乱的」）的**唯一出口**。
 *   Chromium 解码本身不是我们的代码，但**接线全是我们的**：离屏窗、`file://` 读取、分块拉字节、落盘、
 *   采样率/声道/时长的如实回传 —— 任何一环坏了，用户看到的表现都只是"分析说读不出音频"，**看不出是解码没成功**。
 *
 * 判据：① 采样率/声道/帧数与源一致（本页**故意不重采样**，重采样交给服务端 `prepareWav`）
 *      ② 分块取回的字节与一次性长度一致（**小块**故意逼出边界问题）
 *      ③ 落盘产物是真 WAV（RIFF/WAVE 魔数 + 头里采样率/位深/数据长度自洽）
 *      ④ 内容是那段正弦波（RMS ≈ amp/√2 —— 抓"解出来是噪声/静音"这类毛病）
 *      ⑤ `maxSeconds` 生效并**如实回传 truncated**
 *      ⑥ 垃圾文件必须**抛错**（不静默出空 WAV）
 * 失败**不静默**：打印可读原因并以非 0 退出。
 */
'use strict'
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const argv = process.argv.slice(2)
const idx = argv.indexOf('--m4a')
const USER_M4A = idx >= 0 ? argv[idx + 1] : ''

const checks = []
function ok(name, cond, extra) {
  checks.push({ name, pass: !!cond })
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? '  — ' + extra : ''}`)
}

const PAGE = path.join(__dirname, '..', 'src', 'audio-decode.html')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-audio-'))

/** 现造一段正弦波 WAV（**故意用 48 kHz**：证明本页不偷偷重采样到 44.1k）。 */
function makeToneWav(file, { sr = 48000, ch = 2, seconds = 1.5, hz = 440, amp = 0.5 } = {}) {
  const n = Math.round(sr * seconds)
  const dataBytes = n * ch * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22)
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * hz * i) / sr) * amp * 32767)
    for (let c = 0; c < ch; c++) buf.writeInt16LE(v, 44 + (i * ch + c) * 2)
  }
  fs.writeFileSync(file, buf)
  return { sr, ch, n, dataBytes, amp }
}

/** 读 WAV 头（与 server 侧 probeWav 同款判据）。 */
function probeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let p = 12, sr = 0, ch = 0, bits = 16, dataBytes = 0, off = 0
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4)
    const sz = buf.readUInt32LE(p + 4)
    if (id === 'fmt ' && p + 24 <= buf.length) { ch = buf.readUInt16LE(p + 10); sr = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22) || 16 }
    else if (id === 'data') { off = p + 8; dataBytes = Math.max(0, Math.min(sz, buf.length - (p + 8))) }
    p += 8 + sz + (sz % 2)
  }
  return { sr, ch, bits, dataBytes, off }
}

/** 分块取回整份 WAV（**故意用小块**：逼出"跨块边界"的问题）。 */
async function pullAll(win, total, chunk = 100000) {
  const parts = []
  for (let off = 0; off < total; off += chunk) {
    const len = Math.min(chunk, total - off)
    const b64 = await win.webContents.executeJavaScript(`window.akdAudioChunk(${off}, ${len})`, true)
    parts.push(Buffer.from(String(b64), 'base64'))
  }
  return Buffer.concat(parts)
}

app.whenReady().then(async () => {
  console.log('【前置】')
  ok('解码页在', fs.existsSync(PAGE), PAGE)
  if (!fs.existsSync(PAGE)) { app.exit(1); return }

  const win = new BrowserWindow({
    show: false, width: 640, height: 480,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, nodeIntegration: false },
  })
  await win.loadFile(PAGE)

  // ── ① 合成音：采样率/声道/帧数/内容 ──────────────────────────────────────
  console.log('【合成 48 kHz 立体声正弦波】')
  const src = path.join(TMP, 'tone48.wav')
  const mk = makeToneWav(src, { sr: 48000, ch: 2, seconds: 1.5, hz: 440, amp: 0.5 })
  const info = await win.webContents.executeJavaScript(
    `window.akdAudioDecode(${JSON.stringify({ path: src, maxSeconds: 60 })})`, true)
  ok('采样率与源一致（本页不重采样）', info.srcRate === 48000, `${info.srcRate} Hz`)
  ok('声道数与源一致', info.outChannels === 2 && info.srcChannels === 2, `${info.srcChannels}→${info.outChannels} ch`)
  ok('帧数与源一致', info.frames === mk.n, `${info.frames} / ${mk.n}`)
  ok('未误报截断', info.truncated === false)
  ok('字节数 = 44 + 帧×声道×2', info.bytes === 44 + mk.n * 2 * 2, `${info.bytes}`)

  const outBuf = await pullAll(win, info.bytes)
  ok('分块取回的字节数与申报一致', outBuf.length === info.bytes, `${outBuf.length} / ${info.bytes}`)
  const pr = probeWav(outBuf)
  ok('产物是真 WAV（RIFF/WAVE）', !!pr)
  if (pr) {
    ok('头里采样率 48000', pr.sr === 48000, `${pr.sr}`)
    ok('头里声道 2 / 位深 16', pr.ch === 2 && pr.bits === 16, `${pr.ch} ch · ${pr.bits} bit`)
    ok('data 长度自洽', pr.dataBytes === mk.dataBytes, `${pr.dataBytes} / ${mk.dataBytes}`)
    let sum = 0, n = 0, peak = 0
    for (let i = pr.off; i + 1 < pr.off + pr.dataBytes; i += 2) { const v = outBuf.readInt16LE(i) / 32768; sum += v * v; n++; peak = Math.max(peak, Math.abs(v)) }
    const rms = Math.sqrt(sum / n)
    const want = mk.amp / Math.SQRT2
    ok('内容是那段正弦波（RMS ≈ amp/√2）', Math.abs(rms - want) < 0.01, `RMS ${rms.toFixed(4)} vs ${want.toFixed(4)} · 峰值 ${peak.toFixed(3)}`)
  }

  // ── ② maxSeconds 截断要如实说 ────────────────────────────────────────────
  console.log('【maxSeconds=0.5 截断】')
  const cut = await win.webContents.executeJavaScript(
    `window.akdAudioDecode(${JSON.stringify({ path: src, maxSeconds: 0.5 })})`, true)
  ok('truncated 如实置真', cut.truncated === true, `frames ${cut.frames}`)
  ok('只转前 0.5 s', Math.abs(cut.seconds - 0.5) < 0.01, `${cut.seconds.toFixed(3)} s`)
  ok('源时长仍如实回报', Math.abs(cut.srcSeconds - 1.5) < 0.01, `${cut.srcSeconds.toFixed(3)} s`)

  // ── ③ 垃圾文件必须抛错（不许静默出空 WAV）────────────────────────────────
  console.log('【非音频文件】')
  const junk = path.join(TMP, 'junk.m4a')
  fs.writeFileSync(junk, Buffer.from('this is definitely not audio '.repeat(200)))
  let threw = ''
  try { await win.webContents.executeJavaScript(`window.akdAudioDecode(${JSON.stringify({ path: junk })})`, true) }
  catch (e) { threw = (e && e.message) || String(e) }
  ok('垃圾文件抛错而不是出空文件', !!threw && /Chromium 认不出/.test(threw), threw.slice(0, 90).replace(/\n/g, ' '))

  // ── ④（可选）真 m4a：这条才是用户的实际场景 ──────────────────────────────
  if (USER_M4A) {
    console.log('【真 m4a（AAC）】')
    ok('m4a 存在', fs.existsSync(USER_M4A), USER_M4A)
    if (fs.existsSync(USER_M4A)) {
      const info2 = await win.webContents.executeJavaScript(
        `window.akdAudioDecode(${JSON.stringify({ path: USER_M4A, maxSeconds: 3600 })})`, true)
      const buf2 = await pullAll(win, info2.bytes, 8 * 1024 * 1024)
      const pr2 = probeWav(buf2)
      let sum = 0, n = 0
      for (let i = pr2.off; i + 1 < pr2.off + pr2.dataBytes; i += 2) { const v = buf2.readInt16LE(i) / 32768; sum += v * v; n++ }
      const rms2 = Math.sqrt(sum / n)
      ok('解出时长 > 60 s', info2.seconds > 60, `${info2.seconds.toFixed(1)} s（源 ${info2.srcRate} Hz ${info2.srcChannels} ch）`)
      ok('产物是真 WAV 且长度自洽', !!pr2 && buf2.length === info2.bytes, `${(buf2.length / 1048576).toFixed(1)} MB`)
      ok('不是静音/噪声（RMS 合理）', rms2 > 0.005 && rms2 < 0.5, `RMS ${rms2.toFixed(4)}`)
      ok('解码耗时可接受（< 30 s）', info2.decodeMs < 30000, `${info2.decodeMs} ms`)
      fs.writeFileSync(path.join(TMP, 'from-m4a.wav'), buf2)
      console.log(`     产物留在：${path.join(TMP, 'from-m4a.wav')}`)
    }
  }

  try { await win.webContents.executeJavaScript('window.akdAudioRelease()', true) } catch { /* 忽略 */ }
  win.destroy()

  const fail = checks.filter((c) => !c.pass)
  console.log(`\n${fail.length ? '❌' : '✅'} 音频解码：${checks.length - fail.length}/${checks.length} 通过` +
    (fail.length ? `（失败：${fail.map((f) => f.name).join(' · ')}）` : ''))
  app.exit(fail.length ? 1 : 0)
})
