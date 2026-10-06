/**
 * `measure_tempo`（**BPM 包络**，可变速度测量）的离线单测 —— 不碰宿主、不联网。
 * 运行：cd server && npm run build && node tests/tempo-map.mjs
 *
 * 为什么值得测：这是用户点名要的"**118–122 浮动速度 → BPM 包络**"那条链的判据件。
 *   用**测试里独立合成**的点击轨当真值（已知每个拍点的秒数），验三件事：
 *     ① 稳态（120）测得准，且首拍偏移对得上；
 *     ② **浮动**（118→122 线性）能看出**方向与幅度**（drift 为正、首尾段有差、range 够大）；
 *     ③ 产物真能用：CSV 行数/表头、MIDI 头与 tempo 事件数、点击轨 RIFF 头与时长。
 * ⚠️ 合成输入**不复用被测模块的 `renderClickWav`**（避免自己验自己）。
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseMidi } from "midi-file";
import { measureTempoEnvelope, renderClickWav, envelopeToCsv, envelopeToMidi } from "../dist/audio/tempo-map.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** 独立实现：按给定拍点数组合成 16-bit 单声道点击轨（小节首拍更响更高）。 */
function makeClickWav(file, beatTimes, sr = 22050) {
  const last = beatTimes.length ? beatTimes[beatTimes.length - 1] : 0;
  const n = Math.max(1, Math.round((last + 0.6) * sr));
  const pcm = new Int16Array(n);
  const clickN = Math.max(8, Math.round(0.03 * sr));
  beatTimes.forEach((t, i) => {
    const start = Math.round(t * sr);
    const accent = i % 4 === 0;
    const freq = accent ? 2000 : 1200;
    for (let k = 0; k < clickN && start + k < n; k++) {
      const env = Math.exp((-8 * k) / clickN);
      const v = Math.sin((2 * Math.PI * freq * k) / sr) * env * (accent ? 0.9 : 0.55);
      pcm[start + k] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    }
  });
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii"); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii"); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii"); buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, dataBytes).copy(buf, 44);
  writeFileSync(file, buf);
  return { durationSec: n / sr };
}

const dir = mkdtempSync(path.join(tmpdir(), "akd-tempo-"));

/** 稳态 120 BPM：0.25s 处起拍，每 0.5s 一拍，共 48 拍（≈24s） */
const steadyBeats = Array.from({ length: 48 }, (_, i) => 0.25 + i * 0.5);
const steadyWav = path.join(dir, "steady120.wav");
makeClickWav(steadyWav, steadyBeats);

/** 浮动 118→122（线性，40s）：按瞬时 BPM 积分出拍点 */
const driftBeats = [];
{
  let t = 0.2;
  while (t < 40) {
    driftBeats.push(t);
    const bpm = 118 + 4 * (t / 40);
    t += 60 / bpm;
  }
}
const driftWav = path.join(dir, "drift118-122.wav");
makeClickWav(driftWav, driftBeats);

console.log(`① 稳态 120 BPM（${steadyBeats.length} 拍 · ${(steadyBeats.length * 0.5).toFixed(1)}s）`);
{
  const r = await measureTempoEnvelope(steadyWav, { bpmHint: 120, outDir: dir });
  ok("代表 BPM ≈ 120（±2）", Math.abs(r.bpm - 120) <= 2, r.bpm);
  ok("首拍偏移 ≈ 0.25s（±0.06）", Math.abs(r.firstBeatSec - 0.25) <= 0.06, r.firstBeatSec);
  ok("拍点数与真值同量级（±3）", Math.abs(r.beatCount - steadyBeats.length) <= 3, [r.beatCount, steadyBeats.length]);
  ok("包络稳（内部 range ≤ 2 BPM）", r.stats.range <= 2, r.stats);
  ok("包络点数 == 拍点数", r.envelope.length === r.beatCount, [r.envelope.length, r.beatCount]);
  ok("分段数 ≈ 拍数/4", Math.abs(r.segments.length - Math.ceil(steadyBeats.length / 4)) <= 2, r.segments.length);
  // ⚠️ 这条**应该**有警告：纯 click 素材上 `detect` 自由检测会给出 150（= 120×5/4，四拍重音造成的假周期），
  //    正是靠先验才纠正回 119–120 ⇒ 警告如实说明"纠了什么"才是对的（不是"没有警告"）。
  ok("自由检测报了 150，先验把它纠正到 120 附近（警告如实记录）",
    r.warnings.some((w) => /倍频纠正/.test(w)) && Math.abs(r.bpm - 120) <= 1.5, { bpm: r.bpm, warnings: r.warnings });
}

console.log("② 浮动 118→122（线性 40s）—— **这就是用户要的场景**");
{
  const r = await measureTempoEnvelope(driftWav, { bpmHint: 120, outDir: dir });
  ok("代表 BPM 落在 117–123", r.bpm >= 117 && r.bpm <= 123, r.bpm);
  ok("漂移方向为正（drift > 0 BPM/分钟）", r.stats.driftBpmPerMin > 0, r.stats.driftBpmPerMin);
  ok("漂移幅度合理（约 6 BPM/分钟，给 2–12）", r.stats.driftBpmPerMin >= 2 && r.stats.driftBpmPerMin <= 12, r.stats.driftBpmPerMin);
  const third = Math.floor(r.envelope.length / 3);
  const head = median(r.envelope.slice(0, third).map((p) => p.bpm));
  const tail = median(r.envelope.slice(-third).map((p) => p.bpm));
  ok("首段比末段慢（head + 1 < tail）", head + 1 < tail, { head, tail });
  ok("range 认得出这段浮动（≥ 2 BPM）", r.stats.range >= 2, r.stats.range);
  ok("段 BPM 单调性大体成立（前 1/3 均 < 后 1/3 均）",
    median(r.segments.slice(0, Math.max(1, Math.floor(r.segments.length / 3))).map((s) => s.bpm)) <
    median(r.segments.slice(-Math.max(1, Math.floor(r.segments.length / 3))).map((s) => s.bpm)));
}

console.log("③ 产物真能用（CSV / MIDI / 点击轨）");
{
  const r = await measureTempoEnvelope(steadyWav, { bpmHint: 120, outDir: dir, writeArtifacts: true });
  const csv = r.artifacts.csv, mid = r.artifacts.midi, click = r.artifacts.click;
  ok("三个产物路径都回了", !!csv && !!mid && !!click, r.artifacts);
  ok("CSV 落盘且表头/行数对", existsSync(csv) && (() => {
    const t = readFileSync(csv, "utf8");
    return t.includes("bar,beat_in_bar,time_sec,bpm_envelope,bpm_raw") && t.split("\n").length >= r.envelope.length;
  })(), csv);
  const midBuf = readFileSync(mid);
  ok("MIDI 有 MThd 头", midBuf.toString("ascii", 0, 4) === "MThd", midBuf.toString("ascii", 0, 4));
  ok("MIDI 里 tempo 事件数 == 段数", (() => {
    const parsed = parseMidi(midBuf);
    const evs = (parsed.tracks[0] || []).filter((e) => e.type === "setTempo");
    const firstOk = Math.abs(60000000 / evs[0].microsecondsPerBeat - r.segments[0].bpm) < 0.5;
    return evs.length === r.segments.length && firstOk;
  })(), r.segments.length);
  const clickBuf = readFileSync(click);
  ok("点击轨是 RIFF/WAVE", clickBuf.toString("ascii", 0, 4) === "RIFF" && clickBuf.toString("ascii", 8, 12) === "WAVE");
  ok("点击轨时长 ≈ 末拍 + 1s", Math.abs(clickBuf.readUInt32LE(40) / 2 / r.sampleRate - (r.envelope[r.envelope.length - 1].timeSec + 1)) < 0.2,
    clickBuf.readUInt32LE(40) / 2 / r.sampleRate);
}

console.log("④ 纯函数：点击轨重音 / CSV / MIDI 换算");
{
  const env = [
    { beat: 0, timeSec: 0.1, bpm: 120, raw: 120, bar: 1, beatInBar: 1 },
    { beat: 1, timeSec: 0.6, bpm: 120, raw: 120, bar: 1, beatInBar: 2 },
  ];
  const wav = renderClickWav(env, { sampleRate: 22050, beatsPerBar: 4 });
  const pcm = [];
  for (let i = 44; i + 1 < wav.length; i += 2) pcm.push(wav.readInt16LE(i));
  const peak = (t) => { const s = Math.round(t * 22050); let m = 0; for (let k = s; k < s + 200 && k < pcm.length; k++) m = Math.max(m, Math.abs(pcm[k])); return m; };
  ok("小节首拍（重音）比弱拍响", peak(0.1) > peak(0.6), { accent: peak(0.1), weak: peak(0.6) });
  const csv = envelopeToCsv(env, [{ startSec: 0.1, bpm: 120, beats: 4, bar: 1 }]);
  ok("CSV 含段与逐拍两段表", csv.includes("seg_bar,seg_start_sec,seg_bpm,seg_beats") && csv.includes("bar,beat_in_bar,time_sec,bpm_envelope,bpm_raw"));
  const m = Buffer.from(envelopeToMidi([{ startSec: 0, bpm: 118, beats: 4, bar: 1 }, { startSec: 2, bpm: 122, beats: 4, bar: 2 }], {}));
  const pm = parseMidi(m);
  const evs = (pm.tracks[0] || []).filter((e) => e.type === "setTempo");
  ok("MIDI 两个 tempo 事件、值对应 118/122", evs.length === 2 &&
    Math.abs(60000000 / evs[0].microsecondsPerBeat - 118) < 0.5 && Math.abs(60000000 / evs[1].microsecondsPerBeat - 122) < 0.5,
    evs.map((e) => Math.round(60000000 / e.microsecondsPerBeat)));
}

console.log("⑤ 边界：太短要警告 / 非 WAV 要拒 / 没节奏要报错（都不许静默）");
{
  const shortWav = path.join(dir, "short.wav");
  makeClickWav(shortWav, [0.1, 0.6, 1.1, 1.6, 2.1], 22050);
  const r = await measureTempoEnvelope(shortWav, { outDir: dir, writeArtifacts: false });
  ok("少于 5s ⇒ 有警告", r.warnings.some((w) => /少于 5s/.test(w)), r.warnings);

  const mp3 = path.join(dir, "x.mp3");
  writeFileSync(mp3, "not a wav");
  let err = "";
  try { await measureTempoEnvelope(mp3, { writeArtifacts: false }); } catch (e) { err = e.message; }
  ok("非 WAV 直接拒（并告诉你先转）", /只收 \*\*WAV\*\*/.test(err), err);

  const silence = path.join(dir, "silence.wav");
  {
    const n = 22050 * 6, buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0, "ascii"); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii"); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(22050, 24); buf.writeUInt32LE(44100, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write("data", 36, "ascii"); buf.writeUInt32LE(n * 2, 40);
    writeFileSync(silence, buf);
  }
  let err2 = "";
  try { await measureTempoEnvelope(silence, { writeArtifacts: false }); } catch (e) { err2 = e.message; }
  ok("纯静音 ⇒ 明确报错（不是返回 0 BPM）", /测不到拍点/.test(err2), err2);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
