/**
 * MP3 → 44.1kHz 立体声 WAV 预处理（供 mdx-separate 使用）
 * 用法:
 *   作为模块:  import { prepMp3ToWav } from './prep-mp3.mjs'
 *   作为 CLI:   node prep-mp3.mjs <input.mp3> [maxSeconds] [out.wav]
 * 说明: mpg123-decoder 输出源采样率，这里做线性重采样到 44100；单声道复制成双声道。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MPEGDecoder } from 'mpg123-decoder'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TARGET_SR = 44100

// MCP server 内 stdout 是 JSON-RPC 协议通道，进度日志必须走 stderr
const log = (...args) => process.stderr.write(args.join(' ') + '\n')

/** 常见音频容器魔数嗅探；非音频返回 null（用于拒绝损坏/伪装文件，避免 mpg123 硬解垃圾数据） */
export function sniffAudioKind(buf) {
  if (!buf || buf.length < 12) return null
  const ascii = (off, len) => buf.toString('ascii', off, off + len)
  if (ascii(0, 4) === 'RIFF') return 'wav'                    // RIFF/WAV
  if (ascii(0, 3) === 'ID3') return 'mp3'                     // MP3 带 ID3v2
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3' // MPEG 帧同步
  if (ascii(0, 4) === 'fLaC') return 'flac'
  if (ascii(0, 4) === 'OggS') return 'ogg'
  if (ascii(4, 4) === 'ftyp') return 'm4a'                   // MP4/M4A (ftyp at 4)
  if (ascii(0, 4) === 'FORM') return 'aiff'
  return null
}

/** 校验文件是合理音频：魔数 + 解码后字节率 sanity（防止垃圾文件解出荒谬时长） */
function assertAudioFile(input) {
  const raw = readFileSync(input)
  const kind = sniffAudioKind(raw)
  if (!kind) {
    throw new Error(
      `不是有效的音频文件：${input}（${(raw.length / 1024).toFixed(1)} KB，文件头无法识别，可能已损坏或不是音频）`
    )
  }
  return { raw, kind }
}

/** 线性插值重采样。 */
function resample(src, srcSr, dstSr) {
  const ratio = srcSr / dstSr
  const n = Math.max(1, Math.floor(src.length / ratio))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(src.length - 1, i0 + 1)
    const frac = pos - i0
    out[i] = src[i0] * (1 - frac) + src[i1] * frac
  }
  return out
}

function writeWav16(path, sr, channelData) {
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

/** 读取任意 WAV（16/24/32-bit int、32-bit float），返回 { sr, ch, channelData[] } */
export function readWavPcm(path) {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`not a RIFF/WAV file: ${path}`)
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
      if (format === 3 && bits === 32) {
        v = buf.readFloatLE(off)
      } else if (bits === 16) {
        v = buf.readInt16LE(off) / 32768
      } else if (bits === 24) {
        // 24-bit 小端有符号
        const b0 = buf.readUInt8(off), b1 = buf.readUInt8(off + 1), b2 = buf.readInt8(off + 2)
        v = ((b2 << 16) | (b1 << 8) | b0) / 8388608
      } else if (bits === 32) {
        v = buf.readInt32LE(off) / 2147483648
      } else if (bits === 8) {
        v = (buf.readUInt8(off) - 128) / 128
      } else {
        throw new Error(`unsupported wav bit depth: ${bits}`)
      }
      a[i] = v
    }
    channelData.push(a)
  }
  return { sr, ch, n, channelData }
}

/**
 * 将任意 WAV（16/24/32-bit）转成 44.1kHz 立体声 16bit WAV。
 * 注意：WAV 用本函数直读，不走 mpg123（mpg123 对 24-bit WAV 解码会产出垃圾时长/数据）。
 */
export async function prepareWav(input, outPath, maxSeconds) {
  const wav = readWavPcm(input)
  let chans = wav.channelData.map((c) => new Float32Array(c))
  if (chans.length === 1) chans = [chans[0], chans[0].slice()]
  if (chans.length > 2) chans = chans.slice(0, 2)
  const srcSr = wav.sr
  let outCh = chans.map((c) => (srcSr === TARGET_SR ? c : resample(c, srcSr, TARGET_SR)))
  if (maxSeconds !== undefined) {
    const keep = Math.min(outCh[0].length, Math.floor(TARGET_SR * maxSeconds))
    outCh = outCh.map((c) => c.slice(0, keep))
  }
  writeWav16(outPath, TARGET_SR, outCh)
  log(`prepped(wav): ${outPath}  sr=${TARGET_SR}  ch=${outCh.length}  ${(outCh[0].length / TARGET_SR).toFixed(1)}s (源 ${srcSr}Hz)`)
  return { path: outPath, seconds: outCh[0].length / TARGET_SR, srcSr }
}

/**
 * 将 MP3（或任意 mpg123 可解码音频）转成 44.1kHz 立体声 16bit WAV。
 * @param {string} input MP3 路径
 * @param {string} outPath 输出 WAV 路径
 * @param {number} [maxSeconds] 可选：截取前 N 秒
 * @returns {Promise<{path: string, seconds: number, srcSr: number}>}
 */
export async function prepMp3ToWav(input, outPath, maxSeconds) {
  const { raw } = assertAudioFile(input)
  const decoder = new MPEGDecoder()
  await decoder._init()
  const audio = await decoder.decode(new Uint8Array(raw))
  decoder.free()

  let chans = audio.channelData.map((c) => new Float32Array(c))
  if (chans.length === 1) chans = [chans[0], chans[0].slice()]       // 单声道复制
  if (chans.length > 2) chans = chans.slice(0, 2)                    // 多声道取前两

  const srcSr = audio.sampleRate
  // 解码后 sanity：字节率过低说明 mpg123 把垃圾/异常数据解出了荒谬时长（如 2KB 文本 → 609s）
  const seconds = chans[0].length / srcSr
  const bytesPerSec = seconds > 0 ? raw.length / seconds : 0
  if (bytesPerSec < 1000) {
    throw new Error(
      `音频解码异常：${(raw.length / 1024).toFixed(1)} KB 解出 ${seconds.toFixed(1)} 秒（${Math.round(bytesPerSec)} B/s），文件已损坏或不是音频`
    )
  }
  let outCh = chans.map((c) => (srcSr === TARGET_SR ? c : resample(c, srcSr, TARGET_SR)))

  if (maxSeconds !== undefined) {
    const keep = Math.min(outCh[0].length, Math.floor(TARGET_SR * maxSeconds))
    outCh = outCh.map((c) => c.slice(0, keep))
  }

  writeWav16(outPath, TARGET_SR, outCh)
  log(`prepped: ${outPath}  sr=${TARGET_SR}  ch=${outCh.length}  ${(outCh[0].length / TARGET_SR).toFixed(1)}s (源 ${srcSr}Hz)`)
  return { path: outPath, seconds: outCh[0].length / TARGET_SR, srcSr }
}

// CLI（仅直接执行时运行）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  const maxSeconds = process.argv[3] ? Number(process.argv[3]) : undefined
  const out = resolve(process.argv[4] ?? join(__dirname, '..', '..', 'prepped.wav'))
  if (!input) { console.error('usage: node prep-mp3.mjs <input.mp3> [maxSeconds] [out.wav]'); process.exit(1) }
  prepMp3ToWav(input, out, maxSeconds).catch((e) => { console.error(e); process.exit(1) })
}
