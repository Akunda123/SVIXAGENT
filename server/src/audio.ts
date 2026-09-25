/**
 * 音频工具：任意音频文件（wav/mp3/…）→ 人声/伴奏分离。
 *
 * 流程：
 *   1. 若输入不是 44.1kHz 立体声 WAV，先用 mpg123-decoder 解码并重采样到 44.1k（prep-mp3.mjs）
 *   2. 调 mdx-separate.mjs 的 MDX-Net 分离
 *   3. 返回 vocal.wav / accompaniment.wav 路径
 *
 * 注意：两个 .mjs 模块走动态 import（tsc 不编译 .mjs，运行时从 dist 相对定位）。
 */

import { accessSync, constants as fsConstants, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

export interface SeparateResult {
  vocal: string;
  accompaniment: string;
  seconds: number;
  chunks: number;
  prepped?: string; // 仅当输入被重采样/转码时给出中间 wav 路径
}

/** 读取 WAV 头，返回 { sr, ch }（不读全部数据）。 */
function probeWav(path: string): { sr: number; ch: number } {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error(`not a RIFF/WAV file: ${path}`);
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const sz = buf.readUInt32LE(p + 4);
    if (id === "fmt ") {
      const ch = buf.readUInt16LE(p + 10);
      const sr = buf.readUInt32LE(p + 8);
      return { sr, ch };
    }
    p += 8 + sz + (sz % 2);
  }
  throw new Error(`no fmt chunk in ${path}`);
}

/**
 * 将任意音频文件分离为人声与伴奏。
 * @param inputPath 音频文件路径（wav / mp3 / 其他 mpg123 可解码格式）
 * @param outDir    输出目录（默认输入文件同目录）
 * @returns 分离结果路径
 */
export async function separateVocals(inputPath: string, outDir?: string, model?: string): Promise<SeparateResult> {
  const input = resolve(inputPath);
  try {
    accessSync(input, fsConstants.R_OK);
  } catch {
    throw new Error(`input file not readable: ${input}`);
  }

  const out = outDir ? resolve(outDir) : join(dirname(input), `${basename(input, extname(input))}_separated`);
  mkdirSync(out, { recursive: true });

  // 决定输入是否是 44.1k 立体声 WAV：是则直接用，否则先 prep
  let wavPath = input;
  let prepped: string | undefined;
  const isWav = extname(input).toLowerCase() === ".wav";
  if (isWav) {
    // WAV 用本仓库的读取器直读（支持 16/24/32-bit），不走 mpg123：
    // mpg123 对非 16-bit WAV（如 48k/24bit）解码会产出垃圾时长与数据
    try {
      const info = probeWav(input);
      if (info.sr === 44100 && info.ch === 2) {
        // 44.1k 立体声直接用（mdx-separate 支持 16/24/32-bit 读取）
      } else {
        prepped = join(out, "_prepped.wav");
        const { prepareWav } = await import("../src/audio/prep-mp3.mjs");
        await prepareWav(input, prepped);
        wavPath = prepped;
      }
    } catch (e) {
      // WAV 头解析失败（可能非标准/伪装）：先嗅探真实格式——
      // 真音频（如 mp3 伪装成 .wav）走 mpg123 转码；非音频直接报错，避免硬解垃圾数据
      const { sniffAudioKind } = await import("../src/audio/prep-mp3.mjs");
      const head = readFileSync(input);
      const kind = sniffAudioKind(head);
      if (kind === null || kind === "wav") {
        throw new Error(
          `不是有效的音频文件：${input}（${(head.length / 1024).toFixed(1)} KB，无法识别音频格式，可能已损坏）`
        );
      }
      prepped = join(out, "_prepped.wav");
      const { prepMp3ToWav } = await import("../src/audio/prep-mp3.mjs");
      await prepMp3ToWav(input, prepped);
      wavPath = prepped;
    }
  } else {
    prepped = join(out, "_prepped.wav");
    const { prepMp3ToWav } = await import("../src/audio/prep-mp3.mjs");
    await prepMp3ToWav(input, prepped);
    wavPath = prepped;
  }

  const { separateAudio } = await import("../src/audio/mdx-separate.mjs");
  const res = await separateAudio(wavPath, out, model);
  return { ...res, prepped };
}

/**
 * 双模型分离：人声+伴奏都尽可能干净。
 * 用两个模型各取所长：
 *  - 人声模型（Kim_Vocal_2，人声优先）→ 取它的 vocal（干净人声）
 *  - 乐器模型（UVR-MDX-NET-Inst_HQ_3，乐器优先）→ 取它的 vocal 轨（=纯伴奏）
 * 组合输出 { vocal, accompaniment }。
 * @param inputPath 音频文件路径（wav/mp3）
 * @param outDir 输出目录
 */
export async function separateVocalsDual(inputPath: string, outDir?: string, wantVocal = true, wantAcc = true): Promise<SeparateResult> {
  const input = resolve(inputPath);
  const base = outDir ? resolve(outDir) : join(dirname(input), `${basename(input, extname(input))}_dual`);
  const vocalDir = join(base, "_vocal");       // 人声模型
  const instrDir = join(base, "_instr");       // 乐器模型

  let vocalPath: string | null = null;
  let accPath: string | null = null;
  let chunks = 0, seconds = 0, prepped: string | undefined;

  // 1. 人声模型（Kim_Vocal_2）——取 vocal（干净人声）
  if (wantVocal) {
    const vRes = await separateVocals(input, vocalDir, "Kim_Vocal_2.onnx");
    vocalPath = join(base, "vocal.wav");
    const { copyFileSync } = await import("node:fs");
    copyFileSync(vRes.vocal, vocalPath);
    chunks += vRes.chunks; seconds = vRes.seconds; prepped = vRes.prepped ?? prepped;
  }
  // 2. 乐器模型（Inst_HQ_3）——取它的 vocal 轨（=纯伴奏）
  if (wantAcc) {
    const iRes = await separateVocals(input, instrDir, "UVR-MDX-NET-Inst_HQ_3.onnx");
    accPath = join(base, "accompaniment.wav");
    const { copyFileSync } = await import("node:fs");
    copyFileSync(iRes.vocal, accPath);   // Inst_HQ_3 的 vocal 轨 = 纯伴奏
    chunks += iRes.chunks; seconds = iRes.seconds; prepped = iRes.prepped ?? prepped;
  }

  return {
    vocal: vocalPath ?? "",
    accompaniment: accPath ?? "",
    seconds,
    chunks,
    prepped,
  };
}

export interface ConvertResult {
  output: string;
  seconds: number;
  srcSr: number;
  fromWav: boolean;
}

/**
 * 将任意音频文件（mp3/wav/m4a/…）转成 44.1kHz 立体声 WAV。
 * 复用 prep-mp3.mjs（mpg123-decoder WASM 解码 + 线性重采样到 44.1k）。
 * @param inputPath 输入音频路径
 * @param outPath  输出 WAV 路径（默认输入同目录、同名 .wav）
 * @param maxSeconds 可选：只保留前 N 秒
 */
export async function convertAudio(inputPath: string, outPath?: string, maxSeconds?: number): Promise<ConvertResult> {
  const input = resolve(inputPath);
  try {
    accessSync(input, fsConstants.R_OK);
  } catch {
    throw new Error(`input file not readable: ${input}`);
  }

  const out = outPath ? resolve(outPath) : join(dirname(input), `${basename(input, extname(input))}.wav`);

  // 已是 44.1k 立体声 WAV：直接复制（无需解码）
  if (extname(input).toLowerCase() === ".wav") {
    try {
      const info = probeWav(input);
      if (info.sr === 44100 && info.ch === 2 && maxSeconds === undefined) {
        const { copyFileSync } = await import("node:fs");
        copyFileSync(input, out);
        return { output: out, seconds: 0, srcSr: 44100, fromWav: true };
      }
    } catch {
      // 非标准 wav → 走解码
    }
  }

  const { prepMp3ToWav } = await import("../src/audio/prep-mp3.mjs");
  const res = await prepMp3ToWav(input, out, maxSeconds);
  return { output: out, seconds: res.seconds, srcSr: res.srcSr, fromWav: false };
}
