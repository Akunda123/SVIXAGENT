/**
 * STT 模型管理：下载 / 检查 / 删除 sherpa 中文模型到 userData/stt-models。
 *
 * 三档模型：
 *  - light:  streaming-zipformer-zh-14M（流式三件套，~24MB，纯中文，最快）
 *  - std:    streaming-zipformer-bilingual-zh-en（流式三件套，~200MB，中英双语）
 *  - precise: paraformer-zh-2024（离线单文件，~217MB，中英+方言，最准）
 */
'use strict'

const https = require('node:https')
const path = require('node:path')
const fs = require('node:fs')

/** 模型定义：id -> { label, nameKey, descKey, kind, repo, files: [[remote, local], ...] }
 *  label = 中文兜底；nameKey/descKey 是 i18n key（设置页按当前界面语言渲染）。 */
const MODELS = {
  light: {
    label: '轻量（流式，中文，24MB）', // i18n-fallback（界面按 nameKey/descKey 渲染）
    nameKey: 'main.stt.model.light.name',
    descKey: 'main.stt.model.light.desc',
    kind: 'stream',
    repo: 'csukuangfj/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23',
    files: [
      ['encoder-epoch-99-avg-1.int8.onnx', 'encoder.int8.onnx'],
      ['decoder-epoch-99-avg-1.int8.onnx', 'decoder.int8.onnx'],
      ['joiner-epoch-99-avg-1.int8.onnx', 'joiner.int8.onnx'],
      ['tokens.txt', 'tokens.txt'],
    ],
  },
  std: {
    label: '标准（流式，中英双语，200MB）', // i18n-fallback（界面按 nameKey/descKey 渲染）
    nameKey: 'main.stt.model.std.name',
    descKey: 'main.stt.model.std.desc',
    kind: 'stream',
    repo: 'csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
    files: [
      ['encoder-epoch-99-avg-1.int8.onnx', 'encoder.int8.onnx'],
      ['decoder-epoch-99-avg-1.int8.onnx', 'decoder.int8.onnx'],
      ['joiner-epoch-99-avg-1.int8.onnx', 'joiner.int8.onnx'],
      ['tokens.txt', 'tokens.txt'],
    ],
  },
  precise: {
    label: '高准（离线，中英+方言，217MB）', // i18n-fallback（界面按 nameKey/descKey 渲染）
    nameKey: 'main.stt.model.precise.name',
    descKey: 'main.stt.model.precise.desc',
    kind: 'offline',
    repo: 'csukuangfj/sherpa-onnx-paraformer-zh-2024-03-09',
    files: [
      ['model.int8.onnx', 'model.int8.onnx'],
      ['tokens.txt', 'tokens.txt'],
    ],
  },
}

const MODEL_IDS = Object.keys(MODELS)

/**
 * **候选下载源**（2026-09-21 加：原先写死 `hf-mirror.com`，境外用户下不了）。
 *
 * 顺序：**`HF_ENDPOINT`（设了就只用它）→ 官方 huggingface.co → 国内镜像 hf-mirror.com**。
 * 为什么两个都试：`hf-mirror.com` 是给**中国大陆**访问 HF 用的中转，**境外访问往往慢/限速/不可达**；
 * 而官方源在境内常被墙 ⇒ **谁通行用谁**（首个文件失败就换下一个源，成功后把该源提到最前，后续文件不再试错）。
 */
function hfBases(env) {
  const ep = env && env.HF_ENDPOINT
  if (ep) return [String(ep).replace(/\/+$/, '')]
  return ['https://huggingface.co', 'https://hf-mirror.com']
}

/** 单个文件下载的超时（**空闲**超时：这么久没有新数据就判失败，好换下一个源） */
const IDLE_TIMEOUT_MS = 20000

function modelDir(userDataPath, id = 'light') {
  return path.join(userDataPath, 'stt-models', id)
}

function getModelDef(id) {
  return MODELS[id] || MODELS.light
}

function isModelInstalled(userDataPath, id = 'light') {
  const def = getModelDef(id)
  const dir = modelDir(userDataPath, id)
  for (const [, localName] of def.files) {
    if (!fs.existsSync(path.join(dir, localName))) return false
  }
  return true
}

function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest + '.part')
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { fs.unlinkSync(dest + '.part') } catch { /* ignore */ }
        if (redirects >= 5) {
          reject(new Error('too many redirects'))
          return
        }
        const next = new URL(res.headers.location, url).href
        downloadFile(next, dest, onProgress, redirects + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest + '.part')
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const total = Number(res.headers['content-length']) || 0
      let received = 0
      res.on('data', (chunk) => {
        received += chunk.length
        if (onProgress && total) onProgress(received, total)
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(dest + '.part', dest)
          resolve()
        })
      })
    })
    // **空闲超时**：这么久没有新数据就判失败（好让上层换下一个下载源）。
    // 用 socket 空闲而不是总时长 ⇒ 大文件（217 MB）照常能下完，只是"卡住"时不再无限等。
    req.setTimeout(IDLE_TIMEOUT_MS, () => {
      req.destroy(new Error(`下载超时（${IDLE_TIMEOUT_MS / 1000}s 无数据）：${url}`))
    })
    req.on('error', (e) => {
      file.close()
      try { fs.unlinkSync(dest + '.part') } catch { /* ignore */ }
      reject(e)
    })
  })
}

/**
 * 下载指定模型到 userData。
 * 🆕 2026-09-21：**多源自动兜底** —— 按 `hfBases()` 的顺序试（官方 → 国内镜像，或 `HF_ENDPOINT`），
 * 某个源下一个文件失败就换下一个；**成功后把可用源提到最前**，后面的文件不再重复试错。
 * @param {string} userDataPath
 * @param {string} [id] 'light' | 'std' | 'precise'
 * @param {(done:number, total:number, file:string)=>void} [onProgress]
 * @returns {Promise<string>} 模型目录
 */
async function downloadModel(userDataPath, id = 'light', onProgress) {
  const def = getModelDef(id)
  const dir = modelDir(userDataPath, id)
  fs.mkdirSync(dir, { recursive: true })
  const pending = def.files.filter(([, localName]) => !fs.existsSync(path.join(dir, localName)))
  if (pending.length === 0) return dir
  let bases = hfBases(process.env)
  let lastErr = null
  for (const [remoteName, localName] of pending) {
    const dest = path.join(dir, localName)
    let okBase = null
    for (let i = 0; i < bases.length; i++) {
      const base = bases[i]
      try {
        await downloadFile(`${base}/${def.repo}/resolve/main/${remoteName}`, dest, (done, total) => {
          if (onProgress) onProgress(done, total, remoteName)
        })
        okBase = base
        break
      } catch (e) {
        lastErr = e
        if (i < bases.length - 1) {
          console.log(`[stt] 下载源 ${base} 失败（${e.message}）⇒ 换下一个源`)
        }
      }
    }
    if (!okBase) {
      throw new Error(`模型文件下载失败（已试 ${bases.length} 个源：${bases.join(' / ')}）：${remoteName} —— ${lastErr && lastErr.message}`)
    }
    if (bases[0] !== okBase) {
      bases = [okBase, ...bases.filter((b) => b !== okBase)]   // 记住能用的源，后续文件先用它
    }
  }
  console.log(`[stt] 模型 ${id} 已就绪（下载源：${bases[0]}）`)
  return dir
}

function removeModel(userDataPath, id = 'light') {
  const dir = modelDir(userDataPath, id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

module.exports = { MODELS, MODEL_IDS, modelDir, getModelDef, isModelInstalled, downloadModel, removeModel, hfBases, downloadFile }
