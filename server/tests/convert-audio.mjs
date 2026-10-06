/**
 * `sv_convert_audio`（`convertAudio`）的离线单测 —— 不碰宿主、不联网。
 * 运行：cd server && npm run build && node tests/convert-audio.mjs
 *
 * 为什么值得测：这里出过两次**静默产出垃圾**的事故（同类根因：把不支持的格式喂给 MP3 解码器）：
 *   ① `.m4a`（AAC/MP4）被丢给 mpg123 ⇒ 转出一段**噪声**（用户 2026-10-06 亲报「转换的 wav 是乱的」）；
 *   ② 非 44.1k / 非立体声的 **WAV** 也掉进 mpg123（本文件自己注释里警告过：48k/24bit 会解出垃圾）；
 *      而且旧 `probeWav` 读采样率的偏移是错的 ⇒「已是 44.1k 立体声就直接复制」这条捷径**从来没生效**。
 * 判据是"**产物必须与输入一致**"（RMS/时长/采样率），以及"不支持时要**明确拒绝**、不许硬解"。
 *
 * ⚠️ 需要外部 ffmpeg 的那条（m4a → WAV）**不在**本测试里：本机有 ffmpeg 才成立，不能进 `npm test` 的硬判据。
 *    这里只测它与"没有 ffmpeg 时必须拒绝"的分支（用 AKDAGENT_FFMPEG 指向不存在 + PATH 清空来构造）。
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { convertAudio, ffmpegCandidates } from "../dist/audio.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const dir = mkdtempSync(path.join(tmpdir(), "akd-conv-"));

/** 独立造 WAV（int16 单/双声道，任意采样率），返回真值统计 */
function makeWav(file, { sr = 44100, ch = 2, sec = 0.5, freq = 440, amp = 0.5 } = {}) {
  const n = Math.round(sr * sec);
  const data = Buffer.alloc(n * ch * 2);
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sr) * amp;
    const q = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    sum += (q / 32768) ** 2; peak = Math.max(peak, Math.abs(q / 32768));
    for (let c = 0; c < ch; c++) data.writeInt16LE(q, (i * ch + c) * 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0, "ascii"); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8, "ascii");
  hdr.write("fmt ", 12, "ascii"); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(ch, 22);
  hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * ch * 2, 28); hdr.writeUInt16LE(ch * 2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36, "ascii"); hdr.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([hdr, data]));
  return { rms: Math.sqrt(sum / n), peak, seconds: n / sr };
}
/** 读产物 WAV 的真值统计 */
function readWavStats(p) {
  const b = readFileSync(p);
  if (b.toString("ascii", 0, 4) !== "RIFF") return { err: "not RIFF" };
  let q = 12, sr = 0, ch = 0, bits = 16, off = 0, len = 0;
  while (q + 8 <= b.length) {
    const id = b.toString("ascii", q, q + 4), sz = b.readUInt32LE(q + 4);
    if (id === "fmt ") { ch = b.readUInt16LE(q + 10); sr = b.readUInt32LE(q + 12); bits = b.readUInt16LE(q + 22) || 16; }
    else if (id === "data") { off = q + 8; len = Math.min(sz, b.length - q - 8); }
    q += 8 + sz + (sz % 2);
  }
  const per = bits / 8, n = Math.floor(len / per);
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 20000))) {   // 抽样够用（几万个点即可）
    const v = bits === 16 ? b.readInt16LE(off + i * 2) / 32768 : 0;
    sum += v * v; peak = Math.max(peak, Math.abs(v));
  }
  return { sr, ch, bits, seconds: +(len / (sr * ch * per)).toFixed(3), rms: +Math.sqrt(sum / Math.max(1, Math.ceil(n / Math.max(1, Math.floor(n / 20000))))).toFixed(4), peak: +peak.toFixed(3) };
}

console.log("① 44.1k 立体声 WAV ⇒ **直通复制**（这条捷径曾因 probeWav 偏移写错而从未生效）");
{
  const src = path.join(dir, "a44.wav"), out = path.join(dir, "a44-out.wav");
  const truth = makeWav(src, { sr: 44100, ch: 2, sec: 0.5 });
  const r = await convertAudio(src, out);
  ok("fromWav=true（没走解码）", r.fromWav === true, r.fromWav);
  ok("产物存在且与源**逐字节相同**", existsSync(out) && readFileSync(out).equals(readFileSync(src)));
  ok("真值 RMS 合理（0.3–0.4）", truth.rms > 0.3 && truth.rms < 0.4, truth.rms);
}

console.log("② 48 kHz 立体声 WAV ⇒ 走 **WAV 读取器 + 重采样**（⛔ 绝不能喂 mpg123 —— 那会出垃圾）");
{
  const src = path.join(dir, "a48.wav"), out = path.join(dir, "a48-out.wav");
  makeWav(src, { sr: 48000, ch: 2, sec: 0.5 });
  const r = await convertAudio(src, out);
  const st = readWavStats(out);
  ok("产物是 44.1k 立体声", st.sr === 44100 && st.ch === 2, st);
  ok("时长 ≈ 0.5s（没有变成荒谬时长）", Math.abs(st.seconds - 0.5) < 0.05, st.seconds);
  ok("**不是垃圾**：RMS 与源同量级（0.3–0.4）", st.rms > 0.3 && st.rms < 0.4, st.rms);
  ok("srcSr 如实报 48000", r.srcSr === 48000, r.srcSr);
}

console.log("③ 单声道 WAV ⇒ 复制成双声道，且不失真");
{
  const src = path.join(dir, "mono.wav"), out = path.join(dir, "mono-out.wav");
  makeWav(src, { sr: 44100, ch: 1, sec: 0.4 });
  await convertAudio(src, out);
  const st = readWavStats(out);
  ok("产物双声道 44.1k", st.sr === 44100 && st.ch === 2, st);
  ok("RMS 与源同量级", st.rms > 0.3 && st.rms < 0.4, st.rms);
}

console.log("④ 假的 MP4/AAC ⇒ **没有 ffmpeg 时必须明确拒绝**（不许硬解出噪声）");
{
  const src = path.join(dir, "fake.m4a");
  const b = Buffer.alloc(4096);
  b.write("....ftypM4A ", 0, "latin1");
  writeFileSync(src, b);
  const oldEnv = process.env.AKDAGENT_FFMPEG, oldPath = process.env.PATH;
  process.env.AKDAGENT_FFMPEG = path.join(dir, "不存在的-ffmpeg.exe");
  process.env.PATH = "";
  let msg = "";
  try { await convertAudio(src, path.join(dir, "fake-out.wav")); } catch (e) { msg = e.message; }
  process.env.AKDAGENT_FFMPEG = oldEnv; process.env.PATH = oldPath;
  ok("抛错了", !!msg, msg.slice(0, 60));
  ok("说了根因（只认 MP3/WAV、喂 AAC 只会出噪声）", /内置解码器只认 MP3 与 WAV/.test(msg), msg.slice(0, 80));
  ok("给了三条出路", /三条出路/.test(msg));
  ok("点了名是 m4a 格式", /m4a/.test(msg));
}

console.log("⑤ ffmpeg 查找顺序（纯函数，注入环境避免依赖本机）");
{
  const c = ffmpegCandidates({ env: "X:/nope/ffmpeg.exe", pathLookup: () => null });
  ok("含环境变量那一路", c[0] === "X:/nope/ffmpeg.exe", c);
  ok("含**随包槽位** ffmpeg/<平台>-<架构>/", c.some((p) => /ffmpeg[\\/](win32|darwin|linux)-/.test(p)), c);
  ok("PATH 查不到就不塞空值", c.filter((p) => !p).length === 0, c);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
