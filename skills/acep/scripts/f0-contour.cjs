/* 渲染音频的 F0 轮廓探针：用来**反推/复核** ACE 侧的音高与颤音量纲（`notes[k].vibrato` 等）
 *
 * 用法（随 `acep` 技能分发，零依赖）：
 *   node scripts/f0-contour.cjs <wav> --scan                        # 逐 0.25s 扫：RMS + 中位 F0（先找声音在哪）
 *   node scripts/f0-contour.cjs <wav> --info                        # 全曲幅度体检（判断"数字静音"）
 *   node scripts/f0-contour.cjs <wav> --win a:b [--label X] [--winlen 512] [--hop 55]
 *
 * 做法（纯自研 DSP）：读 WAV（16/24/32-bit PCM 或 float32）→ 逐帧自相关求 F0 → 半音轮廓
 *   → 报：中位 F0 / 最近 MIDI、轮廓峰峰值（半音）、**颤音速率**（去均值轮廓自相关首峰 + 过零两种算法）、起振时刻。
 *
 * ⚠️ **窗长会削掉颤音幅度**（自相关窗 = 时间平均）：6 Hz 颤音用 46ms 窗测峰峰值只有真值的 ~0.85，
 *   12ms 窗能到 ~0.95。定量纲时**先跑几个窗长看它收敛到哪**（实测收敛值 ≈ 文件里的 `amplitude`）。
 *
 * 已用它定过的量纲（2026-10-05 实测，见 SKILL.md §2.2 画法③）：
 *   `vibrato.frequency` = **Hz**（文件 6 → 23ms 窗实测 5.984）· `vibrato.amplitude` = **峰峰值/半音**（文件 4.0 → 12ms 窗实测 3.926）
 */
const fs = require('node:fs');

const argv = process.argv.slice(2);
const wav = argv[0];
if (!wav) { console.error('用法: node scripts/f0-contour.cjs <wav> [--scan|--info|--win a:b]'); process.exit(2); }

const wins = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--win') { const [a, b] = argv[i + 1].split(':').map(Number); wins.push({ a, b, label: `[${a},${b})s` }); }
  if (argv[i] === '--label') wins[wins.length - 1].label = argv[i + 1];
}
if (!wins.length && !argv.includes('--scan') && !argv.includes('--info')) { console.error('至少要一个 --win a:b（或用 --scan / --info）'); process.exit(2); }

// ── 读 WAV ──
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('不是 WAV');
  let off = 12, fmt = null, data = null;
  const chunks = [];
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    chunks.push(`${id}(${size})@${body}`);
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') data = buf.subarray(body, Math.min(body + size, buf.length));
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('缺 fmt/data 块');
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const o = (i * fmt.channels + c) * bytes;
      let v;
      if (fmt.format === 3) v = data.readFloatLE(o);
      else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
      else if (fmt.bits === 24) { const x = data.readUIntLE(o, 3); v = (x & 0x800000 ? x - 0x1000000 : x) / 8388608; }
      else if (fmt.bits === 32) v = data.readInt32LE(o) / 2147483648;
      else throw new Error('不支持的位深 ' + fmt.bits);
      s += v;
    }
    mono[i] = s / fmt.channels;
  }
  return { rate: fmt.rate, bits: fmt.bits, channels: fmt.channels, fmtTag: fmt.format, chunks, mono };
}

/** 自相关 F0（含抛物线插值） */
function f0At(x, start, win, minLag, maxLag) {
  let mean = 0;
  for (let i = 0; i < win; i++) mean += x[start + i];
  mean /= win;
  let rms = 0;
  for (let i = 0; i < win; i++) { const v = x[start + i] - mean; rms += v * v; }
  rms = Math.sqrt(rms / win);
  if (rms < 0.004) return { f0: null, rms };                        // 静音
  let best = -1, bestLag = 0, r0 = 0;
  for (let i = 0; i < win; i++) r0 += (x[start + i] - mean) ** 2;
  const rs = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < win - lag; i++) s += (x[start + i] - mean) * (x[start + i + lag] - mean);
    rs[lag] = s / r0;
    if (rs[lag] > best) { best = rs[lag]; bestLag = lag; }
  }
  if (best < 0.3 || bestLag <= minLag || bestLag >= maxLag) return { f0: null, rms, corr: best };
  const y0 = rs[bestLag - 1], y1 = rs[bestLag], y2 = rs[bestLag + 1];
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1e-9);           // 抛物线顶点偏移
  const lag = bestLag + Math.max(-1, Math.min(1, d));
  return { f0: 1 / (lag / 44100), rms, corr: best };
}

const { rate, bits, channels, fmtTag, chunks, mono } = readWav(wav);
console.log(`WAV ${wav}  ${rate} Hz / ${bits}bit / ${channels}ch / fmtTag=${fmtTag} / ${(mono.length / rate).toFixed(2)}s`);
console.log('  块: ' + chunks.join(' '));

// ── `--info`：全曲幅度体检（判断"文件真静音"还是"读错了"）──
if (argv.includes('--info')) {
  let max = 0, at = -1, sum = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = Math.abs(mono[i]);
    if (v > max) { max = v; at = i; }
    sum += mono[i] * mono[i];
  }
  console.log(`  样本数 ${mono.length}  最大幅度 ${max.toFixed(5)}（@${(at / rate).toFixed(3)}s）  整体 RMS ${Math.sqrt(sum / mono.length).toFixed(5)}`);
}
console.log('');

// ── `--scan`：整段能量 + 有基频的粗扫（找声音到底在哪，不必先猜 tick→秒）──
if (argv.includes('--scan')) {
  const block = Math.max(1, Math.round(0.25 * rate));
  console.log('t(s)     RMS     有基频帧/总帧   中位F0');
  for (let s = 0; s + block <= mono.length; s += block) {
    let rms = 0;
    for (let i = 0; i < block; i++) rms += mono[s + i] * mono[s + i];
    rms = Math.sqrt(rms / block);
    const f0s = [];
    let n = 0;
    for (let p = s; p + 2048 < s + block; p += 441) { n++; const r = f0At(mono, p, 2048, 44, 735); if (r.f0) f0s.push(r.f0); }
    if (rms < 0.002 && !f0s.length) continue;                       // 真静音就不打，省屏
    f0s.sort((a, b) => a - b);
    console.log(`${(s / rate).toFixed(2).padStart(7)}  ${rms.toFixed(4)}  ${String(f0s.length).padStart(3)}/${String(n).padEnd(3)}      ${f0s.length ? f0s[f0s.length >> 1].toFixed(1) + ' Hz (≈MIDI ' + (69 + 12 * Math.log2(f0s[f0s.length >> 1] / 440)).toFixed(1) + ')' : '—'}`);
  }
  process.exit(0);
}

const WIN = Number((argv.includes('--winlen') ? argv[argv.indexOf('--winlen') + 1] : 0)) || 2048;
const HOP = Number((argv.includes('--hop') ? argv[argv.indexOf('--hop') + 1] : 0)) || 441;
const MINLAG = 44, MAXLAG = 735;                                   // 60–1000 Hz
console.log(`（分析窗 ${WIN} 样本 = ${(WIN / rate * 1000).toFixed(0)}ms，跳步 ${HOP} = ${(HOP / rate * 1000).toFixed(1)}ms）\n`);
const midi = (f) => 69 + 12 * Math.log2(f / 440);

for (const w of wins) {
  const from = Math.floor(w.a * rate), to = Math.min(mono.length, Math.floor(w.b * rate));
  const frames = [];
  for (let s = from; s + WIN < to; s += HOP) {
    const r = f0At(mono, s, WIN, MINLAG, MAXLAG);
    frames.push({ t: s / rate, f0: r.f0, rms: r.rms });
  }
  const voiced = frames.filter((f) => f.f0);
  if (!voiced.length) { console.log(`${w.label}: 全是静音/无基频`); continue; }
  const f0s = voiced.map((f) => f.f0).sort((a, b) => a - b);
  const med = f0s[f0s.length >> 1];
  const semis = voiced.map((f) => 12 * Math.log2(f.f0 / med));
  const mn = Math.min(...semis), mx = Math.max(...semis);
  const mean = semis.reduce((a, b) => a + b, 0) / semis.length;
  const det = semis.map((v) => v - mean);

  // ① 自相关首峰求周期（跳过 lag 0/1）
  let rateByAc = null;
  const maxLagF = Math.round(0.4 / (HOP / rate));                    // 最多找 2.5Hz
  let bestC = 0, bestL = 0;
  for (let lag = 2; lag <= maxLagF; lag++) {
    let s = 0, n = 0;
    for (let i = 0; i + lag < det.length; i++) { s += det[i] * det[i + lag]; n++; }
    const c = n ? s / n : 0;
    if (c > bestC) { bestC = c; bestL = lag; }
  }
  if (bestL) rateByAc = 1 / (bestL * HOP / rate);
  // ② 过零率（去均值后）
  let zc = 0;
  for (let i = 1; i < det.length; i++) if ((det[i - 1] < 0) !== (det[i] < 0)) zc++;
  const rateByZc = zc / 2 / (det.length * HOP / rate);

  // ③ 起振：|去均值轮廓| 首次连续超过峰峰值 1/4 的时刻
  const thr = (mx - mn) / 4;
  let onset = null;
  for (let i = 0; i < det.length; i++) if (Math.abs(det[i]) > thr) { onset = voiced[i].t; break; }
  // ④ `--ramp`：颤音**包络**（每 5% 窗长取一段的 |det| 最大值归一化）—— 用来量 attack/release 的斜坡
  let rampLine = '';
  if (argv.includes('--ramp')) {
    const peak = Math.max(...det.map(Math.abs)) || 1;
    const bins = 20;
    const env = [];
    for (let b = 0; b < bins; b++) {
      const a = Math.floor((b * det.length) / bins), z = Math.max(a + 1, Math.floor(((b + 1) * det.length) / bins));
      let m = 0;
      for (let i = a; i < z; i++) m = Math.max(m, Math.abs(det[i]));
      env.push(m / peak);
    }
    rampLine = '\n  起振/收尾包络（20 段，|半音|/峰值）: ' + env.map((v) => v.toFixed(2)).join(' ')
      + `\n  到 50% 用时 ≈ ${(env.findIndex((v) => v >= 0.5) * (det.length * HOP / rate) / bins).toFixed(3)}s（相对窗起点；窗起点 ${w.a}s ⇒ 音符内 ${(w.a - w.a).toFixed(3)}+）`
      + `\n  到 90% 用时 ≈ ${(env.findIndex((v) => v >= 0.9) * (det.length * HOP / rate) / bins).toFixed(3)}s`;
  }

  console.log(`${w.label}`);
  console.log(`  有声音帧 ${voiced.length}/${frames.length}   中位 F0 ${med.toFixed(2)} Hz（≈ MIDI ${midi(med).toFixed(2)}）`);
  console.log(`  半音轮廓：均值 ${mean.toFixed(3)}  峰谷 [${mn.toFixed(3)}, ${mx.toFixed(3)}]  **峰峰值 ${(mx - mn).toFixed(3)} 半音**  单边≈ ${((mx - mn) / 2).toFixed(3)}`);
  console.log(`  颤音速率：自相关首峰 ${rateByAc === null ? '—' : rateByAc.toFixed(3) + ' Hz'}（相关 ${bestC.toFixed(2)}） ｜ 过零估 ${rateByZc.toFixed(3)} Hz`);
  console.log(`  起振时刻 ${onset === null ? '—' : onset.toFixed(3) + 's'}（窗起点 ${w.a}s ⇒ 音符内偏移 ${onset === null ? '—' : (onset - w.a).toFixed(3) + 's = ' + Math.round((onset - w.a) * 960) + ' tick'}）`);
  if (rampLine) console.log(rampLine);
  console.log('  轮廓抽样(每 5 帧 1 点，t→半音): ' + voiced.filter((_, i) => i % 5 === 0).map((f, i) => (f.t).toFixed(2) + '→' + semis[i * 5].toFixed(2)).join(' '));
  console.log('');
}
