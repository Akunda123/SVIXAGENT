#!/usr/bin/env node
/**
 * test-stt-transport.cjs —— 单测：语音模型下载"跟随系统代理"这条路。
 *
 * 背景（2026-10-08 用户「stt 也做成跟系统」）：`stt-model.js` 原来用 Node `https.get` 下模型，
 * 而 Node **既不读系统代理、也不读 HTTP(S)_PROXY** ⇒ 设了"系统代理"的用户下不到语音模型。
 * 修法：main.js 注入一个走 **Electron `net`**（Chromium 网络栈，天生跟随系统代理）的下载器。
 *
 * 这里用**假的 net** 把四条路径全跑一遍（成功 / 非 2xx / 空闲超时 / 中途出错），外加：
 *   · 走的是 `downloadModel()` 真入口 ⇒ 证明"注入点真的生效"（不是只测了个孤立函数）
 *   · 失败时不留半个文件（`.part` 必须清掉）
 *   · 注入前的默认行为不受影响（退回 Node https 那条路仍在）
 *
 * 用法：node tools/test-stt-transport.cjs
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { createElectronDownloader } = require('../electron/src/download-transport.js')
const sttModel = require('../electron/src/stt-model.js')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name) }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 220) : '')) }
}

/** 假 net：按脚本回一个响应（或直接报错 / 什么都不发 ⇒ 触发空闲超时） */
function fakeNet(script) {
  const calls = []
  return {
    calls,
    request(opts) {
      calls.push(opts)
      const req = new EventEmitter()
      req.abort = () => { req.aborted = true }
      req.end = () => {
        setImmediate(() => {
          if (script.kind === 'error') return req.emit('error', new Error(script.message || 'boom'))
          const res = new PassThrough()
          res.statusCode = script.status
          res.headers = script.headers || {}
          req.emit('response', res)
          if (script.kind === 'status') return
          if (script.kind === 'hang') return                       // 一个字节都不发 ⇒ 空闲超时
          const chunk = Buffer.from(script.body || 'MODEL-BYTES')
          res.write(chunk)
          if (script.kind === 'mid-error') { setImmediate(() => res.emit('error', new Error('socket hang up'))); return }
          res.end()
        })
      }
      return req
    },
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-stt-transport-'))

;(async () => {
  console.log('== ① 成功路径：写 .part → rename，进度回调有值 ==')
  {
    const net = fakeNet({ kind: 'ok', status: 200, headers: { 'content-length': '11' }, body: 'MODEL-BYTES' })
    const dl = createElectronDownloader({ net, fs })
    const dest = path.join(tmp, 'a.onnx')
    const seen = []
    await dl('https://hf.example/x/a.onnx', dest, (done, total) => seen.push([done, total]))
    ok('文件已就位且内容正确', fs.readFileSync(dest, 'utf8') === 'MODEL-BYTES')
    ok('没有留 .part', !fs.existsSync(dest + '.part'))
    ok('进度回调拿到了 (done,total)', seen.length >= 1 && seen[seen.length - 1][1] === 11, seen)
    ok('请求带了 redirect:follow（重定向交给 Chromium）', net.calls[0] && net.calls[0].redirect === 'follow', net.calls[0])
    ok('请求的就是目标 URL', net.calls[0] && net.calls[0].url === 'https://hf.example/x/a.onnx')
  }

  console.log('\n== ② 非 2xx：报错、不落文件、不留 .part ==')
  {
    const dl = createElectronDownloader({ net: fakeNet({ kind: 'status', status: 404 }), fs })
    const dest = path.join(tmp, 'b.onnx')
    let err = null
    try { await dl('https://hf.example/b.onnx', dest) } catch (e) { err = e }
    ok('抛错且带 HTTP 404', err && /HTTP 404/.test(err.message), err && err.message)
    ok('目标文件没生成', !fs.existsSync(dest))
    ok('.part 被清掉', !fs.existsSync(dest + '.part'))
  }

  console.log('\n== ③ 空闲超时：迟迟没有数据 ⇒ 判失败（好让上层换下一个下载源）==')
  {
    const dl = createElectronDownloader({ net: fakeNet({ kind: 'hang', status: 200 }), fs, idleTimeoutMs: 150 })
    const dest = path.join(tmp, 'c.onnx')
    let err = null
    const t0 = Date.now()
    try { await dl('https://hf.example/c.onnx', dest) } catch (e) { err = e }
    ok('抛的是"下载超时"', err && /下载超时/.test(err.message), err && err.message)
    ok('在超时窗口附近就失败（不是无限等）', Date.now() - t0 < 3000, Date.now() - t0)
    ok('不留悬挂的 .part', !fs.existsSync(dest + '.part'))
  }

  console.log('\n== ④ 中途出错：清理现场，错误如实上抛 ==')
  {
    const dl = createElectronDownloader({ net: fakeNet({ kind: 'mid-error', status: 200 }), fs })
    const dest = path.join(tmp, 'd.onnx')
    let err = null
    try { await dl('https://hf.example/d.onnx', dest) } catch (e) { err = e }
    ok('抛错（socket hang up）', err && /hang up/.test(err.message), err && err.message)
    ok('目标文件没生成、.part 清掉', !fs.existsSync(dest) && !fs.existsSync(dest + '.part'))

    const dl2 = createElectronDownloader({ net: fakeNet({ kind: 'error', message: 'net::ERR_PROXY_CONNECTION_FAILED' }), fs })
    const dest2 = path.join(tmp, 'e.onnx')
    let err2 = null
    try { await dl2('https://hf.example/e.onnx', dest2) } catch (e) { err2 = e }
    ok('代理连不上时错误原样上抛（用户能从日志看出是代理问题）', err2 && /PROXY_CONNECTION_FAILED/.test(err2.message), err2 && err2.message)
  }

  console.log('\n== ⑤ 注入点真的生效：走 downloadModel() 真入口 ==')
  {
    const userData = path.join(tmp, 'userData')
    const dl = createElectronDownloader({ net: fakeNet({ kind: 'ok', status: 200, headers: { 'content-length': '3' }, body: 'abc' }), fs })
    ok('setDownloadTransport 返回 true', sttModel.setDownloadTransport(dl) === true)
    const dir = await sttModel.downloadModel(userData, 'light', () => {})
    const files = fs.readdirSync(dir)
    ok('模型文件按定义落齐（4 个）', files.length === 4, files)
    ok('文件内容来自我们的传输层（不是真网络）', fs.readFileSync(path.join(dir, 'encoder.int8.onnx'), 'utf8') === 'abc')
    ok('isModelInstalled 认这份', sttModel.isModelInstalled(userData, 'light') === true)

    console.log('\n== ⑥ 传输层可撤下：退回 Node https 那条路仍在（默认行为没被破坏）==')
    ok('setDownloadTransport(null) 返回 false', sttModel.setDownloadTransport(null) === false)
    ok('downloadFile 仍是函数（默认实现还在）', typeof sttModel.downloadFile === 'function')
    ok('createElectronDownloader 对缺依赖会明确报错（别静默降级）', (() => {
      try { createElectronDownloader({ net: null, fs }); return false } catch (e) { return /net/.test(e.message) }
    })())
  }

  /* ⚠️ 清理失败**不许**算测试失败：Windows 上刚写完的文件/未释放的流句柄会让 rmSync 抛 EBUSY/EPERM
   *   （2026-10-08 跑批时偶发过一次，单独跑 10 次全过 ⇒ 是环境性竞态，不是产品问题）。 */
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (_) { /* 交给系统清 temp */ }
  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('测试自身异常：', e && e.stack ? e.stack : e); process.exit(1) })
