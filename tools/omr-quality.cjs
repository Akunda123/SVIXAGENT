#!/usr/bin/env node
// ============================================================================
// omr-quality.cjs —— 识谱质量闸门：把 OMR 出的 MusicXML 与**真值 MIDI** 比对算 F1
// ============================================================================
// 来历：原先这是临时件 `server/omr-compare.mjs`（用户 2026-10-05 用它量过：一生之幸 F1 95.4%、
//   inyourblueeye 87.9%）—— 现在收进 `tools/` 当**正式质量闸门**，由 `check-dolce-vendor.cjs` ⑤ 调用。
//
// ⛔ **它默认不跑**：F1 必须有**真值 MIDI**，而我们的合成夹具（`server/tests/fixtures/omr/`）
//   **没有真值**；用户那几首版权谱**不许**当夹具/真值；也不能拿"我们自己识别的结果"当真值自证
//   （那是循环论证）。⇒ 判据是**显式开关**：给了 `--truth` 才比，没给就只解释怎么用、退出 0。
//
// 口径（沿用 omr-compare.mjs，别改）：
//   · **速度不作判据**（用户 2026-10-05：速度不对、音符对）；
//   · 真值可能是"某一个轨"也可能是"所有轨合并" ⇒ 每个轨 + 各种合并都试一遍，按 F1 排序；
//   · 截图往往只是**第 1 页**而真值是**整首** ⇒ 再按**小节数**截断真值算一遍（完全不用速度），
//     每小节 tick = `beats × ticksPerBeat × (4/beatType)`。
//
// 用法：
//   node tools/omr-quality.cjs --truth <真值.mid> --xml <我们出的.musicxml> [--track N] [--min-f1 80]
//   node tools/omr-quality.cjs --truth <真值.mid> --image <谱子图.png>        # 先用内置引擎跑出 XML
//   node tools/omr-quality.cjs                                               # 未给真值 ⇒ 只解释，exit 0
//   环境变量：AKD_OMR_TRUTH / AKD_OMR_XML / AKD_OMR_MIN_F1
// 退出码：0 = 通过（或未给真值）· 1 = 低于 --min-f1 · 2 = 用法/读文件错误
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'server', 'tests', 'fixtures', 'omr', 'dolce-screenshot-en-1440w.png');
/** 打印用：能落到仓内就写相对路径（别把本机绝对路径灌进日志/文档） */
const rel = (p) => {
  const r = path.relative(ROOT, p).replace(/\\/g, '/');
  return r && !r.startsWith('..') ? r : '<本机路径>/' + path.basename(p);
};

const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? String(argv[i + 1] || '') : ''; };
const truthPath = argOf('--truth') || process.env.AKD_OMR_TRUTH || '';
const xmlArg = argOf('--xml') || process.env.AKD_OMR_XML || '';
const imageArg = argOf('--image');
const onlyTrack = (() => { const v = argOf('--track'); return v === '' ? null : Number(v); })();
const minF1 = (() => { const v = argOf('--min-f1') || process.env.AKD_OMR_MIN_F1 || ''; return v === '' ? null : Number(v); })();

/** midi-file / fast-xml-parser 是 **server 的依赖**（tools/ 侧没有 node_modules）⇒ 从 server 那边解析 */
function serverRequire() {
  return createRequire(path.join(ROOT, 'server', 'package.json'));
}
function requireDep(name) {
  try { return serverRequire()(name); }
  catch (e) {
    console.error(`✗ 解析不到依赖 \`${name}\`（它是 server 的依赖）—— 先在 server/ 里 \`npm ci\`：${e.message}`);
    process.exit(2);
  }
}

function usage() {
  console.log('识谱质量闸门（F1）—— **默认不跑**：它需要一份真值 MIDI');
  console.log('');
  console.log('  node tools/omr-quality.cjs --truth <真值.mid> --xml <我们出的.musicxml> [--track N] [--min-f1 80]');
  console.log('  node tools/omr-quality.cjs --truth <真值.mid> --image <谱子图.png>');
  console.log('');
  console.log('为什么默认不跑（如实说）：');
  console.log('  · F1 = 我们的产物 vs **真值**；没有真值就只能自证，那是假指标；');
  console.log('  · 合成夹具 `' + path.relative(ROOT, FIXTURE).replace(/\\/g, '/') + '` 没有配套真值 MIDI；');
  console.log('  · 用户那几首版权谱**不许**当夹具/真值 ⇒ 这条闸门只能靠调用方显式喂真值。');
  console.log('');
  console.log('其余判据（"文件在不在 / 能不能 import / 能不能真跑一张图"）在 tools/check-dolce-vendor.cjs 里，默认就跑。');
}

/** 从图片跑出 MusicXML：只走**编译产物驱动**（与生产同一份代码）；不复制一份引擎调用逻辑 */
async function xmlFromImage(input) {
  const cands = [];
  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    for (const e of fs.readdirSync(distDir, { withFileTypes: true })) {
      if (e.isDirectory() && /^server-runtime/.test(e.name)) cands.push(path.join(distDir, e.name, 'dist', 'omr', 'dolce.js'));
    }
  }
  cands.push(path.join(ROOT, 'server', 'dist', 'omr', 'dolce.js'));
  const driver = cands.find((p) => fs.existsSync(p));
  if (!driver) {
    console.error('✗ 找不到编译产物驱动（server/dist/omr/dolce.js 或 dist/server-runtime*/dist/omr/dolce.js）');
    console.error('  先构建：cd server && npm run build　（或在仓库根跑 tools/build-server-runtime.cjs）');
    process.exit(2);
  }
  const mod = await import(pathToFileURL(driver).href);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akd-omr-q-')), 'omr.musicxml');
  const r = await mod.imageToMusicXml({ input: path.resolve(input), outPath: out, title: path.basename(input) });
  console.log(`【跑图】${path.basename(input)} ⇒ 音符 ${r.stats.notes} · 小节 ${r.stats.bars} · 时值凑满 ${r.stats.full} · 没归属 ${r.stats.unknown}（引擎 ${rel(r.engine.dir)}）`);
  return out;
}

/* ---------------------------------------------------------------- 主流程 */
(async () => {
  if (!truthPath) { usage(); process.exit(0); }

  const midiFile = requireDep('midi-file');
  const { XMLParser } = requireDep('fast-xml-parser');

  const xmlPath = xmlArg || (imageArg ? await xmlFromImage(imageArg) : '');
  if (!xmlPath) { console.error('✗ 给了 --truth 就要给 --xml <我们出的.musicxml> 或 --image <谱子图>'); process.exit(2); }
  for (const p of [truthPath, xmlPath]) {
    if (!fs.existsSync(p)) { console.error('✗ 读不到文件：' + p); process.exit(2); }
  }

  // ---------- 真值：MIDI（多轨各收一份 + 合并） ----------
  const mid = midiFile.parseMidi(fs.readFileSync(truthPath));
  const tempos = [];
  for (const tr of mid.tracks) {
    let at = 0;
    for (const ev of tr) { at += ev.deltaTime; if (ev.type === 'setTempo') tempos.push({ tick: at, us: ev.microsecondsPerBeat }); }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const bpm0 = tempos[0] ? 60 / (tempos[0].us / 1e6) : 120;

  const tracks = mid.tracks.map((tr, ti) => {
    const open = new Map(); const notes = []; let at = 0; let name = '';
    for (const ev of tr) {
      at += ev.deltaTime;
      if (ev.type === 'trackName') name = ev.text;
      if (ev.type === 'noteOn' && ev.velocity > 0) open.set(ev.noteNumber, at);
      else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
        const on = open.get(ev.noteNumber);
        if (on !== undefined) { notes.push({ pitch: ev.noteNumber, onTick: on, offTick: at, ch: ev.channel }); open.delete(ev.noteNumber); }
      }
    }
    return { ti, name, ch: notes[0] ? notes[0].ch : -1, notes };
  }).filter((t) => t.notes.length);

  const all = tracks.flatMap((t) => t.notes);
  const variants = [];
  for (const t of tracks) variants.push({ label: `轨#${t.ti} ch${t.ch}${t.name ? ` "${t.name}"` : ''}`, notes: t.notes });
  variants.push({ label: `合并 ${tracks.length} 轨（事件）`, notes: all });
  variants.push({ label: '合并去重（(onset,pitch)）', notes: [...new Map(all.map((n) => [n.onTick + ':' + n.pitch, n])).values()] });

  console.log(`真值 MIDI：${mid.tracks.length} 轨 · ${mid.header.ticksPerBeat} tick/四分 · 首个速度 ${bpm0.toFixed(0)} BPM（**不作判据**）`);
  for (const t of tracks) {
    console.log(`  轨#${t.ti} ch${t.ch}${t.name ? ` "${t.name}"` : ''} ${t.notes.length} 音 · ${Math.min(...t.notes.map((n) => n.pitch))}~${Math.max(...t.notes.map((n) => n.pitch))}`);
  }
  if (onlyTrack !== null) console.log(`⚠️ --track ${onlyTrack}：只跟这一轨比`);

  // ---------- 我们识别的 ----------
  const x = new XMLParser({ ignoreAttributes: false, isArray: (n) => n === 'note' || n === 'measure' }).parse(fs.readFileSync(xmlPath, 'utf8'));
  const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const omr = []; let measures = 0, beats = 0, beatType = 4, divisions = 1;
  for (const part of [].concat(x['score-partwise'].part)) {
    for (const m of [].concat(part.measure || [])) {
      measures++;
      const a = [].concat(m.attributes || [])[0];
      if (a) {
        divisions = Number(a.divisions) || divisions;
        const t = [].concat(a.time || [])[0];
        if (t) { beats = Number(t.beats) || beats; beatType = Number(t['beat-type']) || beatType; }
      }
      for (const n of [].concat(m.note || [])) {
        if (n.rest !== undefined || !n.pitch) continue;
        omr.push(12 * (Number(n.pitch.octave) + 1) + (STEPS[n.pitch.step] ?? 0) + Number(n.pitch.alter || 0));
      }
    }
  }
  console.log(`\n我们识别：${omr.length} 音 · ${measures} 小节 · divisions ${divisions} · 拍号 ${beats}/${beatType}\n`);

  // ---------- 指标 ----------
  const hist = (a) => { const h = new Map(); for (const v of a) h.set(v, (h.get(v) || 0) + 1); return h; };
  const sim = (a, b) => {
    const A = hist(a), B = hist(b); const K = new Set([...A.keys(), ...B.keys()]);
    let i = 0, u = 0;
    for (const k of K) { i += Math.min(A.get(k) || 0, B.get(k) || 0); u += Math.max(A.get(k) || 0, B.get(k) || 0); }
    return u ? i / u : 0;
  };
  const pc = (a) => a.map((v) => ((v % 12) + 12) % 12);
  const lcs = (a, b) => {
    const n = a.length, m = b.length; let p = new Uint16Array(m + 1);
    for (let i = 1; i <= n; i++) {
      const c = new Uint16Array(m + 1);
      for (let j = 1; j <= m; j++) c[j] = a[i - 1] === b[j - 1] ? p[j - 1] + 1 : Math.max(p[j], c[j - 1]);
      p = c;
    }
    return p[m];
  };
  const score = (gtNotes) => {
    const gt = gtNotes.slice().sort((a, b) => a.onTick - b.onTick || a.pitch - b.pitch).map((n) => n.pitch);
    const H = hist(gt), O = hist(omr);
    let hit = 0;
    for (const [k, v] of O) hit += Math.min(v, H.get(k) || 0);
    const prec = omr.length ? hit / omr.length : 0;
    const rec = gt.length ? hit / gt.length : 0;
    return {
      n: gt.length, prec, rec,
      f1: prec + rec ? 2 * prec * rec / (prec + rec) : 0,
      jac: sim(omr, gt), pcj: sim(pc(omr), pc(gt)),
      lcs: lcs(omr, gt) / Math.min(omr.length, gt.length || 1),
    };
  };

  const rows = variants.map((v) => ({ v, m: score(v.notes) })).sort((a, b) => b.m.f1 - a.m.f1);
  const header = '真值候选'.padEnd(34) + '音数   精确率  召回率   F1     音高重合  音级重合  顺序';
  const fmt = (label, m) => label.padEnd(30) + String(m.n).padStart(6)
    + (m.prec * 100).toFixed(1).padStart(8) + '%' + (m.rec * 100).toFixed(1).padStart(7) + '%'
    + (m.f1 * 100).toFixed(1).padStart(8) + '%'
    + (m.jac * 100).toFixed(1).padStart(9) + '%' + (m.pcj * 100).toFixed(1).padStart(9) + '%'
    + (m.lcs * 100).toFixed(1).padStart(7) + '%';
  console.log(header);
  for (const { v, m } of rows) console.log(fmt(v.label, m));

  /* 截图往往只是**第 1 页**，而真值 MIDI 是**整首** ⇒ 不限定跨度就把"没截到的部分"算成我们漏读（假低召回）。
   * 按**小节数**截断真值：我们的 N 小节 = N × beats × ticksPerBeat × (4/beatType) 个 tick。**完全不用速度**。
   * ⚠️ 每小节 tick 数 = `beats × ticksPerBeat × (4/beatType)`：`ticksPerBeat` 是**每四分音符**的 tick，
   *    而 `<beats>` 的单位是 `beatType` 分音符 ⇒ 4/4 时正好是 beats × ticksPerBeat。漏了 4/beatType
   *    会把 84 小节算成 21 小节（数字一眼就假，别放过这种）。 */
  const spanTicks = measures * beats * mid.header.ticksPerBeat * (4 / (beatType || 4));
  const inSpan = (n) => n.onTick <= spanTicks;
  const clipped = variants.map((v) => ({ label: v.label + `（限前 ${measures} 小节）`, notes: v.notes.filter(inSpan) }))
    .filter((v) => v.notes.length);
  const rowsClipped = clipped.map((v) => ({ v, m: score(v.notes) })).sort((a, b) => b.m.f1 - a.m.f1);
  if (rowsClipped.length && rowsClipped[0].m.n !== rows[0].m.n) {
    console.log('\n—— 把真值**限到与我们同一跨度**（我们只认了 ' + measures + ' 小节；'
      + `${beats}/${beatType} ⇒ 真值前 ${Math.round(spanTicks)} tick）——`);
    for (const { v, m } of rowsClipped) console.log(fmt(v.label, m));
  }

  const best = rowsClipped.length ? rowsClipped[0] : rows[0];
  const f1 = best.m.f1 * 100;
  console.log(`\n最佳真值候选：${best.v.label} ⇒ F1 ${f1.toFixed(1)}%（精确 ${(best.m.prec * 100).toFixed(1)}% / 召回 ${(best.m.rec * 100).toFixed(1)}%）`);
  const gtBest = best.v.notes.slice().sort((a, b) => a.onTick - b.onTick || a.pitch - b.pitch).map((n) => n.pitch);
  console.log(`  真值音高（前 24 个不同音）：${[...new Set(gtBest)].slice(0, 24).join(' ')}`);
  console.log(`  我们音高（前 24 个不同音）：${[...new Set(omr)].slice(0, 24).join(' ')}`);

  if (!omr.length) { console.log('\n✗ 我们的 MusicXML 里一个音符都没有 ⇒ 这次识别完全没成'); process.exit(1); }
  if (minF1 !== null) {
    if (!Number.isFinite(minF1)) { console.error(`✗ --min-f1 不是数：${argOf('--min-f1')}`); process.exit(2); }
    if (f1 < minF1) { console.log(`\n✗ F1 ${f1.toFixed(1)}% < 门槛 ${minF1}%`); process.exit(1); }
    console.log(`\n✓ F1 ${f1.toFixed(1)}% ≥ 门槛 ${minF1}%`);
  }
})();
