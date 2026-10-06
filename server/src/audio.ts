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
import { fileURLToPath } from "node:url";

export interface SeparateResult {
  vocal: string;
  accompaniment: string;
  seconds: number;
  chunks: number;
  prepped?: string; // 仅当输入被重采样/转码时给出中间 wav 路径
}

/**
 * 读 WAV 头，返回 `{ sr, ch, bits, seconds }`（不读全部数据）。
 * ⚠️ 2026-10-06 修正偏移：`fmt ` 的负载从 **p+8** 起 —— 声道在 p+10、**采样率在 p+12**、位深在 p+22。
 * （旧写法用 `readUInt32LE(p + 8)` 取采样率，读到的是 `audioFormat|channels` 拼起来的数 ⇒ 永远不等于 44100，
 *  于是"已是 44.1k 立体声 WAV 就直接复制"这条捷径**从来没生效**，WAV 也被丢去 mpg123 重解了一遍。）
 */
function probeWav(path: string): { sr: number; ch: number; bits: number; seconds: number } {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error(`not a RIFF/WAV file: ${path}`);
  let p = 12, sr = 0, ch = 0, bits = 16, dataBytes = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const sz = buf.readUInt32LE(p + 4);
    if (id === "fmt " && p + 24 <= buf.length) {
      ch = buf.readUInt16LE(p + 10);
      sr = buf.readUInt32LE(p + 12);
      bits = buf.readUInt16LE(p + 22) || 16;
    } else if (id === "data") {
      dataBytes = Math.max(0, Math.min(sz, buf.length - (p + 8)));
    }
    p += 8 + sz + (sz % 2);
  }
  if (!sr) throw new Error(`no fmt chunk in ${path}`);
  const seconds = dataBytes && ch && bits ? dataBytes / (sr * ch * (bits / 8)) : 0;
  return { sr, ch, bits, seconds };
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
    // ⚠️ 与 `convertAudio` 同一条纪律：**先嗅探**，非 MP3/WAV 不能喂 mpg123（会出噪声）
    let kind: string | null = null;
    try {
      const { sniffAudioKind } = await import("../src/audio/prep-mp3.mjs");
      kind = sniffAudioKind(readFileSync(input));
    } catch { /* 嗅探失败就按老路走 */ }
    if (kind !== null && kind !== "wav" && kind !== "mp3") {
      await convertWithFfmpeg(input, prepped, undefined, kind);
    } else {
      const { prepMp3ToWav } = await import("../src/audio/prep-mp3.mjs");
      await prepMp3ToWav(input, prepped);
    }
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
 * 找 ffmpeg（**只用于非 MP3/WAV 的格式**，例如 `m4a/AAC` —— mpg123 是 MP3 解码器，喂 AAC 只会得到噪声）。
 * 查找顺序：① 环境变量 `AKDAGENT_FFMPEG` ② **随包**的 `ffmpeg/<platform>-<arch>/ffmpeg[.exe]`
 * （相对 server 包根：开发态 = `server/ffmpeg/…`，打包态 = `resources/server/ffmpeg/…`）③ PATH。
 * ⚠️ 随包分发 ffmpeg 有**许可红线**：不得是 GPL/nonfree 构建 —— 见 `tools/stage-ffmpeg.cjs` 的硬拒。
 */
export function ffmpegCandidates(opts: { env?: string; pathLookup?: (n: string) => string | null } = {}): string[] {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const out: string[] = [];
  const envVal = opts.env ?? process.env.AKDAGENT_FFMPEG;
  if (envVal) out.push(envVal);
  // ① 随包槽位：server 包根 = 本文件编译产物 dist/ 的上一级
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  out.push(join(pkgRoot, "ffmpeg", `${process.platform}-${process.arch}`, exe));
  // ② PATH
  const which = (opts.pathLookup ?? ((n: string) => {
    const dirs = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
    for (const d of dirs) {
      if (!d) continue;
      const p = join(d, n);
      try { accessSync(p, fsConstants.X_OK); return p; } catch { /* 继续找 */ }
    }
    return null;
  }))(exe);
  if (which) out.push(which);
  return out;
}

/** 用 ffmpeg 解码任意格式 → 44.1k 立体声 WAV（输出必须能被我们的 WAV 读取器验过）。 */
async function convertWithFfmpeg(input: string, out: string, maxSeconds: number | undefined, kind: string | null): Promise<ConvertResult> {
  const cands = ffmpegCandidates();
  let ffmpeg: string | null = null;
  for (const c of cands) {
    try { accessSync(c, fsConstants.R_OK); ffmpeg = c; break; } catch { /* 试下一个 */ }
  }
  if (!ffmpeg) {
    throw new Error(
      `这个文件是 ${kind ?? "非 MP3/WAV"} 格式（例如 m4a/AAC、FLAC、Ogg），**内置解码器只认 MP3 与 WAV**` +
      `（mpg123 是 MP3 解码器；把 AAC/MP4 喂进去只会产出噪声 —— 所以我们宁可拒也不硬解）。\n` +
      `三条出路（按省事程度）：\n` +
      `① **让用户把这个文件拖进悬浮球**（或把路径粘进输入框）—— 客户端自带的 Chromium 会把它转成 WAV，` +
      `附件里给我们的就是 **WAV 路径**（m4a/AAC、FLAC、Ogg、WebM…都行；\`.wav\`/\`.mp3\` 不用转、不走这一步）；\n` +
      `② 装一个 ffmpeg（我们自动找：$AKDAGENT_FFMPEG → 随包 ffmpeg/<平台>-<架构>/ → PATH）；\n` +
      `③ 请用户用 DAW / 其它工具导出 44.1k WAV 再传进来。\n` +
      `文件：${input}`
    );
  }
  const { spawnSync } = await import("node:child_process");
  const args = ["-y", "-v", "error", "-i", input];
  if (maxSeconds !== undefined) args.push("-t", String(maxSeconds));
  args.push("-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", out);
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`ffmpeg 转码失败（exit ${r.status}）：${(r.stderr || r.error?.message || "").trim().slice(0, 400)}`);
  }
  // 产物必须真是 44.1k 立体声 WAV（不给"ffmpeg 说成功但其实空"留面）
  const info = probeWav(out);
  if (info.sr !== 44100 || info.ch !== 2 || !(info.seconds > 0)) {
    throw new Error(`ffmpeg 产物不是有效的 44.1k 立体声 WAV（sr=${info.sr} ch=${info.ch} ${info.seconds}s）：${out}`);
  }
  return { output: out, seconds: info.seconds, srcSr: info.sr, fromWav: false };
}

/**
 * 将任意音频文件转成 44.1kHz 立体声 WAV。
 * **先嗅探容器**（2026-10-06 修）：`WAV` 直通 · `MP3` 走内置 mpg123 · **其它（m4a/AAC、ogg、flac…）交给 ffmpeg**，
 * 找不到 ffmpeg 就**明确报错**并指回"客户端那条路"（让用户把文件拖进悬浮球，客户端用自带的 Chromium 解成 WAV
 * —— 见 `electron/src/audio-decode.html` / `main.js::decodeAudioToWav`；用户 2026-10-06 裁「走 C」）。
 * 此前不嗅探、一律丢给 mpg123 ⇒ 用户拿 `.m4a` 转出来的是一段**噪声**（静默错误）。
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
  const { sniffAudioKind, prepMp3ToWav } = await import("../src/audio/prep-mp3.mjs");

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

  // ⚠️ **按嗅探结果分派**（不是按扩展名）：
  //   · RIFF/WAV → 走**我们自己的 WAV 读取器**（`prepareWav`：支持 16/24/32-bit + 重采样到 44.1k）
  //     ⛔ **绝不能把 WAV 喂给 mpg123** —— 它是 MP3 解码器，对 48k/24-bit 会解出垃圾时长与数据
  //     （2026-10-06 修：原先只在"已是 44.1k 立体声"时走捷径，其余 WAV 全掉进 mpg123 ⇒ 静默垃圾）
  //   · MP3 → mpg123（内置 WASM）
  //   · 其它（m4a/AAC、ogg、flac…）→ ffmpeg；找不到 ffmpeg 就**明确拒绝**（见 `convertWithFfmpeg`）
  let kind: string | null = null;
  try { kind = sniffAudioKind(readFileSync(input)); } catch { /* 嗅探失败按老逻辑走 */ }
  if (kind === "wav") {
    const { prepareWav } = await import("../src/audio/prep-mp3.mjs");
    const res = await prepareWav(input, out, maxSeconds);
    return { output: out, seconds: res.seconds, srcSr: res.srcSr, fromWav: true };
  }
  if (kind !== null && kind !== "mp3") {
    return await convertWithFfmpeg(input, out, maxSeconds, kind);
  }

  const res = await prepMp3ToWav(input, out, maxSeconds);
  return { output: out, seconds: res.seconds, srcSr: res.srcSr, fromWav: false };
}
