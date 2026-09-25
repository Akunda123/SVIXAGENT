/**
 * MDX-Net (Kim_Vocal_2) 人声/伴奏分离 —— Node 实现
 *
 * 管线完全对齐 UVR separate.py / audio-separator 的 MDX 推理约定：
 *   WAV(stereo 44.1k)
 *   → 前补 trim、后补 pad（gen_size 对齐）
 *   → 时域分片：step = (1-overlap)*chunk_size，每片 chunk_size 采样
 *   → 每片：STFT(n_fft=6144, hop=1024, 周期 hann, center=True, reflect 填充)
 *     → [re_L, im_L, re_R, im_R] → 前 3 bin 清零 → 截到 dim_f=3072
 *     → ONNX 推理（[1,4,3072,256]）
 *     → 拆实虚 → ISTFT → 时域乘以 np.hanning 窗 → OLA 累积 result/divider
 *   → result/divider 归一化 → 切掉首尾 trim → 截到原长 → 人声
 *   伴奏 = 输入 - 人声
 *
 * 用法:
 *   作为模块:  import { separateAudio } from './mdx-separate.mjs'
 *   作为 CLI:   node src/audio/mdx-separate.mjs <input.wav> [outDir]
 * 输出: <outDir>/vocal.wav 与 <outDir>/accompaniment.wav
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ort from 'onnxruntime-node'
import fft from 'ndarray-fft'
import ndarray from 'ndarray'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = join(__dirname, '..', '..', 'models')
// 默认人声分离模型（可被 separateAudio(model) 覆盖，如 'UVR-MDX-NET-Inst_HQ_3.onnx'）
const DEFAULT_MODEL = 'Kim_Vocal_2.onnx'

// MCP server 内 stdout 是 JSON-RPC 协议通道，进度日志必须走 stderr
const log = (...args) => process.stderr.write(args.join(' ') + '\n')

const SR = 44100
const N_FFT = 6144
const HOP = 1024          // UVR 硬编码 hop=1024（不是 n_fft/4！）
const N_BIN = N_FFT / 2 + 1   // 3073
const DIM_F = 3072        // 模型输入频率维（3073 -> 3072，去最高频一个 bin）
const SEGMENT_SIZE = 256  // = dim_t，模型输入时间帧数
const TRIM = N_FFT / 2    // 3072
const CHUNK_SIZE = HOP * (SEGMENT_SIZE - 1)   // 1024*255 = 261120 采样
const GEN_SIZE = CHUNK_SIZE - 2 * TRIM         // 254976
const OVERLAP = 0.25
const STEP = Math.round((1 - OVERLAP) * CHUNK_SIZE)

// ---------- WAV 读写 ----------

function readWav(path) {
  const buf = readFileSync(path)
  let p = 12, fmt = null, data = null
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4)
    const sz = buf.readUInt32LE(p + 4)
    if (id === 'fmt ') fmt = { p: p + 8, sz }
    if (id === 'data') { data = { p: p + 8, sz }; break }
    p += 8 + sz + (sz % 2)
  }
  if (!fmt || !data) throw new Error('invalid wav')
  const ch = buf.readUInt16LE(fmt.p + 2)
  const sr = buf.readUInt32LE(fmt.p + 4)
  const bits = buf.readUInt16LE(fmt.p + 14)
  const format = buf.readUInt16LE(fmt.p)
  const bytesPer = bits / 8
  const n = Math.floor(data.sz / (ch * bytesPer))
  const channelData = []
  for (let c = 0; c < ch; c++) {
    const a = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const off = data.p + (i * ch + c) * bytesPer
      let v
      if (format === 3 && bits === 32) v = buf.readFloatLE(off)
      else if (bits === 16) v = buf.readInt16LE(off) / 32768
      else if (bits === 24) {
        const b0 = buf.readUInt8(off), b1 = buf.readUInt8(off + 1), b2 = buf.readInt8(off + 2)
        v = ((b2 << 16) | (b1 << 8) | b0) / 8388608
      } else if (bits === 32) v = buf.readInt32LE(off) / 2147483648
      else if (bits === 8) v = (buf.readUInt8(off) - 128) / 128
      else throw new Error(`unsupported wav bit depth: ${bits}`)
      a[i] = v
    }
    channelData.push(a)
  }
  return { ch, sr, n, channelData }
}

function writeWav(path, sr, channelData) {
  const ch = channelData.length
  const n = channelData[0].length
  const dataSize = n * ch * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40)
  let o = 44
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channelData[c][i]))
      buf.writeInt16LE(Math.round(s * 32767), o); o += 2
    }
  }
  writeFileSync(path, buf)
}

// ---------- 窗口与填充 ----------

// torch.hann_window(periodic=True)：周期 hann（librosa 默认）
const WIN = new Float64Array(N_FFT)
for (let i = 0; i < N_FFT; i++) WIN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N_FFT))

// numpy/torch reflect 填充（不复制边缘）：i<0 → -i；i>=L → 2L-2-i
// pad 最多 half=3072，chunk 长度 261120，单次反射足够
function reflectSample(x, i) {
  const L = x.length
  if (i < 0) return x[-i]
  if (i >= L) return x[2 * L - 2 - i]
  return x[i]
}

// np.hanning（对称窗，时域 OLA 用，与 STFT 周期窗不同）
function hanning(n) {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  return w
}

// ---------- STFT / ISTFT（对齐 torch.stft/istft, center=True, reflect） ----------

/**
 * 单声道 STFT。x 为 Float32Array。
 * 返回 { re, im, T, F }，re/im 为 Float64Array(F*T)，C 序 [t][f]。
 * torch.stft center=True: pad n_fft//2（reflect），帧数 T = 1 + floor(L/hop)
 */
function stftChannel(x) {
  const L = x.length
  const T = Math.floor(L / HOP) + 1
  const F = N_BIN // 3073
  const re = new Float64Array(F * T)
  const im = new Float64Array(F * T)
  for (let t = 0; t < T; t++) {
    const base = t * HOP - TRIM
    const frame = new Float64Array(N_FFT)
    for (let i = 0; i < N_FFT; i++) {
      frame[i] = reflectSample(x, base + i) * WIN[i]
    }
    const reN = ndarray(frame, [N_FFT])
    const imN = ndarray(new Float64Array(N_FFT), [N_FFT])
    fft(1, reN, imN)
    for (let f = 0; f < F; f++) { re[t * F + f] = reN.get(f); im[t * F + f] = imN.get(f) }
  }
  return { re, im, T, F }
}

/**
 * 单声道 ISTFT（WOLA，window² 归一化）。输入 re/im 为 [t][f] 布局、F=3073 行。
 * torch.istft(center=True) 输出长度 = (T-1)*hop。
 */
function istftChannel(re, im, T, F, length) {
  const out = new Float64Array(length)
  const norm = new Float64Array(length)
  for (let t = 0; t < T; t++) {
    const x = new Float64Array(N_FFT)
    const y = new Float64Array(N_FFT)
    for (let f = 0; f < F; f++) { x[f] = re[t * F + f]; y[f] = im[t * F + f] }
    const reN = ndarray(x, [N_FFT])
    const imN = ndarray(y, [N_FFT])
    fft(-1, reN, imN)
    const base = t * HOP - TRIM
    for (let i = 0; i < N_FFT; i++) {
      const idx = base + i
      if (idx < 0 || idx >= length) continue
      // ndarray-fft 的 dir<0 逆变换已含 1/N 归一化
      out[idx] += x[i] * WIN[i]
      norm[idx] += WIN[i] * WIN[i]
    }
  }
  for (let i = 0; i < length; i++) if (norm[i] > 1e-8) out[i] /= norm[i]
  return out
}

// ---------- 主流程 ----------

/**
 * 分离音频文件的人声与伴奏（44.1kHz 立体声 WAV）。
 * @param {string} inputPath 输入 WAV 路径
 * @param {string} outDir    输出目录（vocal.wav / accompaniment.wav 写入此处）
 * @returns {Promise<{vocal: string, accompaniment: string, seconds: number, chunks: number}>}
 */
export async function separateAudio(inputPath, outDir, modelFileName = DEFAULT_MODEL, flipStems = false) {
  const MODEL = join(MODELS_DIR, modelFileName)
  const wav = readWav(inputPath)
  if (wav.ch !== 2) throw new Error('MDX 需要立体声输入')
  if (wav.sr !== SR) throw new Error(`采样率需 44100，实际 ${wav.sr}`)

  const N = wav.n
  const left = wav.channelData[0]
  const right = wav.channelData[1]

  // 峰值归一化（audio-separator: max_peak=0.9, min_peak=0.0），推理后乘回原峰值
  let peak = 0
  for (let i = 0; i < N; i++) {
    const a = Math.abs(left[i]), b = Math.abs(right[i])
    if (a > peak) peak = a
    if (b > peak) peak = b
  }
  const mixScale = peak > 0.9 ? 0.9 / peak : 1.0

  // mixture = [zeros(2,trim), mix, zeros(2,pad)]
  const pad = GEN_SIZE + TRIM - (N % GEN_SIZE)
  const mixLen = TRIM + N + pad
  const mL = new Float32Array(mixLen)
  const mR = new Float32Array(mixLen)
  for (let i = 0; i < N; i++) { mL[TRIM + i] = left[i] * mixScale; mR[TRIM + i] = right[i] * mixScale }

  const resultL = new Float64Array(mixLen)
  const resultR = new Float64Array(mixLen)
  const divider = new Float64Array(mixLen)

  const session = await ort.InferenceSession.create(MODEL)
  // 动态取输入/输出名：metadata 键是索引，真实张量名在 .name
  const inputName = session.inputMetadata[Object.keys(session.inputMetadata)[0]].name
  const outputName = session.outputMetadata[Object.keys(session.outputMetadata)[0]].name

  let chunkIdx = 0
  const totalChunks = Math.ceil((mixLen - CHUNK_SIZE + STEP - 1) / STEP) + 1
  const t0 = Date.now()

  for (let start = 0; start < mixLen; start += STEP) {
    chunkIdx++
    const end = Math.min(start + CHUNK_SIZE, mixLen)
    const actual = end - start

    // 时域 OLA 窗（np.hanning，对称；overlap≠0 时每片都用，含完整片）
    const window = hanning(actual)

    // 取片（不足补零到 CHUNK_SIZE）
    const cL = new Float32Array(CHUNK_SIZE)
    const cR = new Float32Array(CHUNK_SIZE)
    cL.set(mL.subarray(start, end))
    cR.set(mR.subarray(start, end))

    // STFT 两声道 → 4 通道 [re_L, im_L, re_R, im_R]（C 序 [c][f][t]）
    const sL = stftChannel(cL)
    const sR = stftChannel(cR)
    const T = sL.T
    const F = sL.F

    // 4 通道 [re_L, im_L, re_R, im_R]，C 序 [c][f][t]；前 3 bin 清零（DC 及两个最低频 bin）
    const in4 = new Float32Array(4 * DIM_F * T)
    for (let t = 0; t < T; t++) {
      for (let f = 0; f < DIM_F; f++) {
        const zero = f < 3
        in4[((0 * DIM_F + f) * T) + t] = zero ? 0 : sL.re[t * F + f]
        in4[((1 * DIM_F + f) * T) + t] = zero ? 0 : sL.im[t * F + f]
        in4[((2 * DIM_F + f) * T) + t] = zero ? 0 : sR.re[t * F + f]
        in4[((3 * DIM_F + f) * T) + t] = zero ? 0 : sR.im[t * F + f]
      }
    }

    const result = await session.run({ [inputName]: new ort.Tensor('float32', in4, [1, 4, DIM_F, T]) })
    const outData = result[outputName].data

    // ISTFT 两声道（从 [c][f][t] 读回 [t][f]）
    const vReL = new Float64Array(T * F), vImL = new Float64Array(T * F)
    const vReR = new Float64Array(T * F), vImR = new Float64Array(T * F)
    for (let t = 0; t < T; t++) {
      for (let f = 0; f < F; f++) {
        const o0 = outData[((0 * DIM_F + (f < DIM_F ? f : DIM_F - 1)) * T) + t] || 0
        const o1 = outData[((1 * DIM_F + (f < DIM_F ? f : DIM_F - 1)) * T) + t] || 0
        const o2 = outData[((2 * DIM_F + (f < DIM_F ? f : DIM_F - 1)) * T) + t] || 0
        const o3 = outData[((3 * DIM_F + (f < DIM_F ? f : DIM_F - 1)) * T) + t] || 0
        if (f < DIM_F) {
          vReL[t * F + f] = o0; vImL[t * F + f] = o1
          vReR[t * F + f] = o2; vImR[t * F + f] = o3
        }
      }
    }

    const outL = istftChannel(vReL, vImL, T, F, CHUNK_SIZE)
    const outR = istftChannel(vReR, vImR, T, F, CHUNK_SIZE)

    // OLA 累积（np.hanning 窗加权）
    for (let i = 0; i < actual; i++) {
      const w = window[i]
      resultL[start + i] += outL[i] * w
      resultR[start + i] += outR[i] * w
      divider[start + i] += w
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    log(`chunk ${chunkIdx}/${totalChunks} done (${elapsed}s)`)
  }

  // 归一化 + 切掉首尾 trim + 截到原长 + 乘回峰值
  const vocalL = new Float32Array(N)
  const vocalR = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const div = divider[TRIM + i] > 1e-8 ? divider[TRIM + i] : 1
    vocalL[i] = resultL[TRIM + i] / div * peak
    vocalR[i] = resultR[TRIM + i] / div * peak
  }

  const accL = new Float32Array(N), accR = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    accL[i] = left[i] - vocalL[i]
    accR[i] = right[i] - vocalR[i]
  }

  mkdirSync(outDir, { recursive: true })
  const vocalPath = join(outDir, 'vocal.wav')
  const accPath = join(outDir, 'accompaniment.wav')
  writeWav(vocalPath, SR, [vocalL, vocalR])
  writeWav(accPath, SR, [accL, accR])
  log(`saved ${vocalPath} / ${accPath}`)
  return { vocal: vocalPath, accompaniment: accPath, seconds: N / SR, chunks: chunkIdx }
}

// CLI（仅直接执行时运行）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  const outDir = resolve(process.argv[3] ?? join(__dirname, '..', '..', 'out'))
  if (!input) { console.error('usage: node mdx-separate.mjs <input.wav> [outDir]'); process.exit(1) }
  separateAudio(input, outDir).catch((e) => { console.error(e); process.exit(1) })
}
