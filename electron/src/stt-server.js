/**
 * 独立 STT 服务进程（sherpa-onnx 原生版，跑在系统 node 上，ABI 匹配）。
 *
 * 为什么独立进程：sherpa-onnx-node 的原生 addon 预编译二进制 ABI 与
 * Electron 33（130）不匹配、WASM 版在 Electron 主进程挂起；系统 node
 * （ABI 137）可正常运行。本服务由 Electron 主进程 spawn，监听本地端口。
 *
 * 协议：
 *   POST /stt    body = Float32Array 16kHz 单声道 PCM（binary）
 *                -> { ok, text }
 *   GET  /health -> { ok, modelReady }
 *
 * 用法：node src/stt-server.js [--port 3190] [--model <dir>]
 */
'use strict'

const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

const args = process.argv.slice(2)
const port = Number((args.find((a) => a.startsWith('--port=')) || '--port=3190').split('=')[1])
const modelFlag = args.find((a) => a.startsWith('--model='))
const modelDir = modelFlag ? modelFlag.split('=')[1] : ''
const kindFlag = args.find((a) => a.startsWith('--kind='))
const kind = kindFlag ? kindFlag.split('=')[1] : 'stream'

const log = (...m) => process.stderr.write(`[stt-server] ${m.join(' ')}\n`)

let recognizer = null

function loadRecognizer() {
  if (!modelDir) throw new Error('no model dir')
  const sherpa = require('sherpa-onnx-node')
  if (kind === 'offline') {
    // paraformer 离线单文件模型（tokens 在 modelConfig 顶层，不在 paraformer 里）
    const model = path.join(modelDir, 'model.int8.onnx')
    const tokens = path.join(modelDir, 'tokens.txt')
    for (const f of [model, tokens]) {
      if (!fs.existsSync(f)) throw new Error(`model file missing: ${f}`)
    }
    recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        paraformer: { model },
        tokens: tokens,
        provider: 'cpu',
        numThreads: 2,
        debug: 0,
      },
    })
  } else {
    // 流式 transducer 三件套
    const enc = path.join(modelDir, 'encoder.int8.onnx')
    const dec = path.join(modelDir, 'decoder.int8.onnx')
    const joiner = path.join(modelDir, 'joiner.int8.onnx')
    const tokens = path.join(modelDir, 'tokens.txt')
    for (const f of [enc, dec, joiner, tokens]) {
      if (!fs.existsSync(f)) throw new Error(`model file missing: ${f}`)
    }
    recognizer = new sherpa.OnlineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: { encoder: enc, decoder: dec, joiner: joiner },
        tokens: tokens,
        provider: 'cpu',
        numThreads: 2,
        debug: 0,
      },
      enableEndpoint: true,
    })
  }
  log(`model loaded (kind=${kind})`)
}

/** 识别 16k 单声道 PCM（Float32Array bytes） */
function transcribe(buf) {
  const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  if (samples.length === 0) return ''
  if (kind === 'offline') {
    // 离线：一次性喂入 + decode
    const stream = recognizer.createStream()
    try {
      stream.acceptWaveform({ samples, sampleRate: 16000 })
      recognizer.decode(stream)
      const res = recognizer.getResult(stream)
      return (res && res.text) || ''
    } finally {
      try { stream.free() } catch { /* ignore */ }
    }
  }
  // 流式：分块解码
  const stream = recognizer.createStream()
  try {
    const CHUNK = 3200
    for (let i = 0; i < samples.length; i += CHUNK) {
      const chunk = samples.subarray(i, Math.min(i + CHUNK, samples.length))
      stream.acceptWaveform({ samples: chunk, sampleRate: 16000 })
      while (recognizer.isReady(stream)) recognizer.decode(stream)
    }
    stream.inputFinished()
    while (recognizer.isReady(stream)) recognizer.decode(stream)
    const res = recognizer.getResult(stream)
    return (res && res.text) || ''
  } finally {
    try { stream.free() } catch { /* ignore */ }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, modelReady: !!recognizer }))
    return
  }
  if (req.method === 'POST' && req.url === '/stt') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      try {
        if (!recognizer) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'model not ready' }))
          return
        }
        const t0 = Date.now()
        const text = transcribe(body)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, text, elapsedMs: Date.now() - t0 }))
      } catch (e) {
        log('transcribe error:', e.message)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }
  res.writeHead(404)
  res.end('not found')
})

// 启动时预加载模型（后台，不阻塞端口监听）
try {
  loadRecognizer()
} catch (e) {
  log('model load failed:', e.message)
}

server.listen(port, '127.0.0.1', () => {
  log(`listening on http://127.0.0.1:${port} (model=${modelDir})`)
})
