import sharp from "sharp";
import { a as createSurface, d as blit, R as RHYTHM_DIGIT, r as rright, s as simplifiedOf, p as probe, e as rcx, f as rbottom, g as surfaceFromBinary, u as unionRect, o as overlapRatioY, h as overlapRatioX, i as median, m as mergeToChars, j as chunkCells, k as buildStrip, l as clusterByY, n as unionRects, C as CN_NUM, L as LYRIC_QUOTE_OPEN, q as normPunct, t as LYRIC_PUNCT, v as LYRIC_QUOTE_CLOSE, w as isRejoinedArc, x as rcy, y as overlapX, c as connectedComponents, z as recognizeLyrics, A as REJOINED_ARC_ID } from "./lyrics.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { j as SIMPLE_DIVISIONS, as as duration123, I as IdGen, k as emptyDoc, at as jpPitch, au as jianpuInputOfDoc, M as emit123, t, Q as emitJpwabc, N as emitAbc, T as emitPu, P as emitJly, O as emitJcx, a2 as parse123, ac as parsePu, a7 as parseJcx, w as checkMeasureDurations, y as describeBeatIssue } from "./beatcheck.js";
import { h as creatorOf, Q as withPageMeta } from "./pagemeta.js";
function walkPlay(items, sink) {
  let lastMid = -1;
  let broke = true;
  items.forEach((it, idx) => {
    if (lastMid >= 0 && !broke && (it.mid < lastMid || it.mid === lastMid && it.skip === 0)) ;
    broke = false;
    for (let mid = it.mid; mid < it.end; mid++) {
      lastMid = mid;
      sink.measure(mid, it.pass, {
        skip: mid === it.mid ? it.skip : 0,
        limit: mid === it.end - 1 ? it.limit : -1,
        final: mid === it.end - 1 && idx === items.length - 1
      });
    }
    if (it.endOfPass) {
      broke = true;
    }
  });
}
function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114 | 0;
  }
  return g;
}
function channel(rgba, n, c) {
  const g = new Uint8Array(n);
  for (let i = 0, p = c; i < n; i++, p += 4) g[i] = rgba[p];
  return g;
}
function otsuSeparation(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t2 = 0; t2 < 256; t2++) sum += t2 * hist[t2];
  let sumB = 0, wB = 0, max = 0;
  for (let t2 = 0; t2 < 256; t2++) {
    wB += hist[t2];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t2 * hist[t2];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between2 = wB * wF * (mB - mF) * (mB - mF);
    if (between2 > max) max = between2;
  }
  return max;
}
function sauvola(gray, w, h, win, k) {
  const n = w * h;
  const sw = w + 1;
  const ii = new Float64Array(sw * (h + 1));
  const ii2 = new Float64Array(sw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rs2 = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      rs += v;
      rs2 += v * v;
      ii[(y + 1) * sw + (x + 1)] = ii[y * sw + (x + 1)] + rs;
      ii2[(y + 1) * sw + (x + 1)] = ii2[y * sw + (x + 1)] + rs2;
    }
  }
  const r = win >> 1;
  const R = 128;
  const data = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const s = ii[(y1 + 1) * sw + (x1 + 1)] - ii[y0 * sw + (x1 + 1)] - ii[(y1 + 1) * sw + x0] + ii[y0 * sw + x0];
      const s2 = ii2[(y1 + 1) * sw + (x1 + 1)] - ii2[y0 * sw + (x1 + 1)] - ii2[(y1 + 1) * sw + x0] + ii2[y0 * sw + x0];
      const m = s / cnt;
      const sd = Math.sqrt(Math.max(0, s2 / cnt - m * m));
      const thr = m * (1 + k * (sd / R - 1));
      data[y * w + x] = gray[y * w + x] <= thr ? 1 : 0;
    }
  }
  return { w, h, data };
}
function rgbaToBinary(rgba, w, h) {
  const n = w * h;
  const cands = [
    toGray(rgba, w, h),
    channel(rgba, n, 0),
    channel(rgba, n, 1),
    channel(rgba, n, 2)
  ];
  let best = cands[0], bestSep = -1;
  for (const g of cands) {
    const sep = otsuSeparation(g);
    if (sep > bestSep) {
      bestSep = sep;
      best = g;
    }
  }
  const win = Math.max(15, Math.round(Math.min(w, h) / 30) | 1);
  return sauvola(best, w, h, win, 0.2);
}
const MAX_W = 2200;
let _decodeImage = null;
let _rasterizePdf = null;
function setImageDecoder(decode, pdf) {
  _decodeImage = decode;
  _rasterizePdf = pdf ?? null;
}
function isPdf(bytes, mime) {
  if (mime === "application/pdf") return true;
  return bytes.length >= 5 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
}
function fitWidth(img) {
  if (img.width <= MAX_W) return img;
  const scale = MAX_W / img.width;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = createSurface(w, h);
  blit(
    out,
    { width: img.width, height: img.height, data: img.data },
    { x: 0, y: 0, w: img.width, h: img.height },
    { x: 0, y: 0, w, h }
  );
  return { data: out.data, width: w, height: h };
}
async function decodeToBinary(bytes, mime) {
  if (isPdf(bytes, mime)) {
    if (!_rasterizePdf) throw new Error("此环境不支持 PDF 输入（只装了位图解码器）");
    const img2 = await _rasterizePdf(bytes);
    return rgbaToBinary(img2.data, img2.width, img2.height);
  }
  if (!_decodeImage) throw new Error("未装配图片解码器：浏览器侧应 import omr/index，Node 侧见 cli/omr.ts");
  const img = fitWidth(await _decodeImage(bytes, mime));
  return rgbaToBinary(img.data, img.width, img.height);
}
async function decodeImage(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
function installNodeDecoder() {
  setImageDecoder(decodeImage);
}
let _rt = null;
function setOmrRuntime(rt) {
  _rt = rt;
}
function omrRuntime() {
  if (!_rt) throw new Error("OMR 运行时未装配：浏览器侧应 import omr/index，Node 侧应先 setOmrRuntime()");
  return _rt;
}
const REC_FILE = "ch_PP-OCRv6_small_rec_infer.onnx";
const DET_FILE = "ch_PP-OCRv4_det_infer.onnx";
const DICT_FILE = "ppocrv6_dict.txt";
let _modelDir = null;
function modelDir() {
  if (_modelDir) return _modelDir;
  const here = dirname(fileURLToPath(import.meta.url));
  const cands = [
    process.env.OMR_MODELS,
    join(here, "models"),
    join(here, "..", "public", "redist", "ocr")
  ].filter((d) => !!d);
  const hit = cands.find((d) => existsSync(join(d, DICT_FILE)));
  if (!hit) throw new Error(`找不到 OCR 模型（试过：${cands.join(" / ")}）。设 env OMR_MODELS 指向含 ${DICT_FILE} 的目录。`);
  _modelDir = hit;
  return hit;
}
const THREADS = Math.max(1, Number(process.env.OMR_THREADS) || 4);
const THREAD_MODE = (() => {
  const v = (process.env.OMR_THREAD_MODE ?? "auto").toLowerCase();
  return v === "always" || v === "single" ? v : "auto";
})();
const _sessions = /* @__PURE__ */ new Map();
let _ort = null;
async function ort() {
  if (!_ort) _ort = (await import("onnxruntime-node")).default;
  return _ort;
}
function session(model, threads) {
  const key = `${model}@${threads}`;
  let p = _sessions.get(key);
  if (!p) {
    p = (async () => {
      const o = await ort();
      return o.InferenceSession.create(join(modelDir(), model === "det" ? DET_FILE : REC_FILE), {
        intraOpNumThreads: threads,
        executionProviders: ["cpu"]
      });
    })();
    _sessions.set(key, p);
  }
  return p;
}
function pickThreads(dims) {
  if (THREADS <= 1 || THREAD_MODE === "single") return 1;
  if (THREAD_MODE === "always") return THREADS;
  const n = dims.reduce((a, b) => a * b, 1);
  return dims[0] > 1 || n >= 1e6 ? THREADS : 1;
}
function threadInfo() {
  return { mode: THREAD_MODE, threads: THREADS };
}
const nodeRuntime = {
  async prepare(model) {
    await session(model, model === "det" ? THREADS : pickThreads([1, 3, 48, 320]));
  },
  async run(model, chw, dims) {
    const o = await ort();
    const sess = await session(model, pickThreads(dims));
    const feeds = {};
    feeds[sess.inputNames[0]] = new o.Tensor("float32", chw, dims);
    const out = (await sess.run(feeds))[sess.outputNames[0]];
    return { data: out.data, dims: out.dims };
  },
  async loadDict() {
    return readFile(join(modelDir(), DICT_FILE), "utf-8");
  }
};
function measuresOfRow(row) {
  if (!row.barlineXs.length) return [{ notes: row.nums, rightX: null }];
  const measures = [];
  let cur = [];
  let bi = 0;
  for (const n of row.nums) {
    while (bi < row.barlineXs.length && n.bbox.x > row.barlineXs[bi]) {
      measures.push({ notes: cur, rightX: row.barlineXs[bi] });
      cur = [];
      bi++;
    }
    cur.push(n);
  }
  const silentRow = row.voice !== void 0 && row.nums.length > 0 && row.nums.every((n) => n.digit === 0);
  if (silentRow) {
    while (bi < row.barlineXs.length - 1) {
      measures.push({ notes: cur, rightX: row.barlineXs[bi] });
      cur = [];
      bi++;
    }
  }
  measures.push({ notes: cur, rightX: bi < row.barlineXs.length ? row.barlineXs[row.barlineXs.length - 1] : null });
  const out = [];
  const wide = (row.bottomY - row.topY) * 1.5;
  let leftX = null;
  for (const m of measures) {
    if (m.notes.length) out.push(m);
    else if (silentRow && leftX !== null && m.rightX !== null && m.rightX - leftX >= wide && out.length) out.push({ ...m, silent: true });
    else if (out.length && m.rightX !== null) out[out.length - 1].rightX = m.rightX;
    leftX = m.rightX;
  }
  return out;
}
function rowEndsClosed(row) {
  if (!row.nums.length || !row.barlineXs.length) return false;
  const lastRight = rright(row.nums[row.nums.length - 1].bbox);
  return Math.max(...row.barlineXs) >= lastRight;
}
function pairArcs(notes, fifths) {
  const slur = /* @__PURE__ */ new Map();
  const tie = /* @__PURE__ */ new Map();
  const slot = (m, n, init) => {
    const v = m.get(n) ?? init;
    m.set(n, v);
    return v;
  };
  const keyOf = (n) => {
    if (n.digit === 0) return "rest";
    if (n.digit === RHYTHM_DIGIT) return "rhythm";
    const p = jpPitch(n.digit, n.octave, fifths);
    return `${p.step}${p.alter}${p.octave}`;
  };
  let dropped = 0;
  const openSlur = [];
  const openTie = [];
  const dropSlurStart = (n, k) => {
    const s = slur.get(n);
    if (s) s.starts = s.starts.filter((v) => v !== k);
  };
  for (const n of notes) {
    for (let c = 0; c < (n.slurStop ?? 0); c++) {
      const top = openSlur.pop();
      if (!top) dropped++;
      else if (top[2] || n.digit === 0) {
        dropSlurStart(top[1], top[0]);
        dropped++;
      } else slot(slur, n, { starts: [], stops: [] }).stops.push(top[0]);
    }
    for (let o = 0; o < (n.slurStart ?? 0); o++) {
      const used = new Set(openSlur.map(([k2]) => k2));
      let k = 1;
      while (used.has(k)) k++;
      openSlur.push([k, n, n.digit === 0]);
      slot(slur, n, { starts: [], stops: [] }).starts.push(k);
    }
    if (n.tieStop) {
      const from = openTie.pop();
      if (from && n.digit !== 0 && n.digit !== RHYTHM_DIGIT && keyOf(from) === keyOf(n)) {
        slot(tie, n, {}).stop = true;
      } else {
        if (from) {
          const s = tie.get(from);
          if (s) delete s.start;
        }
        dropped++;
      }
    }
    if (n.tieStart && n.digit !== 0 && n.digit !== RHYTHM_DIGIT) {
      openTie.push(n);
      slot(tie, n, {}).start = true;
    } else if (n.tieStart) dropped++;
  }
  for (const [k, n] of openSlur) {
    dropSlurStart(n, k);
    dropped++;
  }
  for (const n of openTie) {
    const s = tie.get(n);
    if (s) delete s.start;
    dropped++;
  }
  if (dropped) console.warn(`OMR→ScoreDoc：剔除了 ${dropped} 个配不上对的 slur/tie 记号`);
  return { slur, tie };
}
const GRACE_TYPE = { 1: "eighth", 2: "16th", 3: "32nd" };
const JUMP_ORNAMENT = {
  "D.C.": "dc",
  "D.S.": "ds",
  "Fine": "fine",
  "To Coda": "ty"
};
const chordSymbol = (text) => ({ root: { step: "C", alter: 0 }, kind: "", text });
function placeChords(n, ch, fullDivisions) {
  if (!n.chord) return;
  const sustains = ch.sustains ?? [];
  const body = (ch.duration.divisions - sustains.length * SIMPLE_DIVISIONS) / SIMPLE_DIVISIONS;
  const all = [
    { text: n.chord, offset: Math.round((n.chordOffset ?? 0) * fullDivisions) },
    ...(n.extraChords ?? []).map((c) => ({
      text: c.tok,
      offset: Math.max(0, Math.min(Math.round(c.offset * fullDivisions / SIMPLE_DIVISIONS) * SIMPLE_DIVISIONS, fullDivisions - 1))
    }))
  ];
  const later = [];
  for (const h of all) {
    if (h.offset <= 0 && !ch.harmony) {
      ch.harmony = chordSymbol(h.text);
      continue;
    }
    const at = h.offset / SIMPLE_DIVISIONS;
    const k = Math.round(at - body);
    const su = sustains[k];
    if (Math.abs(at - body - k) < 1e-6 && su && !su.harmony) su.harmony = chordSymbol(h.text);
    else later.push(h);
  }
  if (!ch.harmony && later.length) ch.harmony = chordSymbol(later.shift().text);
  if (later.length) ch.laterHarmonies = later.map((h) => chordSymbol(h.text));
}
function recognizedToDoc(score, numOf) {
  const ids = new IdGen();
  const marks = [];
  const voices = [...new Set(score.rows.map((r) => r.voice ?? 0))].sort((a, b) => a - b);
  const parts = voices.map((v, pi) => ({
    id: `P${pi + 1}`,
    measures: measuresOfRows(score.rows.filter((r) => (r.voice ?? 0) === v), score, ids, marks, numOf)
  }));
  if (parts.length === 4) {
    for (const p of parts.slice(2)) {
      const first = p.measures[0];
      if (first) (first.attrs ??= {}).clefs = [{ sign: "G", line: 2, octaveChange: -1 }];
    }
  }
  const title = score.title;
  const song = {
    work: { subtitles: score.subtitle ? [score.subtitle] : [] },
    key: { fifths: score.fifths },
    time: { beats: score.beats, beatType: score.beatType },
    parts,
    marks
  };
  if (title !== void 0) song.work.title = title;
  if (score.number) song.work.number = score.number;
  if (score.number && score.numberSide === "right") {
    song.pageText = { indexRight: score.number, topLeft: [], topRight: [], bottomLeft: [], bottomCenter: [], bottomRight: [] };
  }
  if (score.meters && score.meters.length > 1) {
    song.extraTimes = score.meters.slice(1).map((mt) => ({ beats: mt.beats, beatType: mt.beatType }));
  }
  if (score.meterNote) song.timeNote = score.meterNote;
  const creators = (score.credits ?? []).map((c) => c.replace(/\n/g, " ").trim()).filter((c) => c && c !== title?.trim()).map(creatorOf);
  if (creators.length) song.identification = { creators };
  if (score.tempo) song.tempos = [score.tempo];
  if (score.tempo && score.tempoBeat) song.tempoBeat = score.tempoBeat;
  const doc = emptyDoc("omr");
  doc.songs.push(song);
  return doc;
}
function measuresOfRows(rows, score, ids, marks, numOf) {
  const allMeasures = [];
  const rowStartIdx = /* @__PURE__ */ new Set();
  const endStyleIdx = /* @__PURE__ */ new Set();
  const doubleIdx = /* @__PURE__ */ new Set();
  const silentIdx = /* @__PURE__ */ new Set();
  const labelOf = /* @__PURE__ */ new Map();
  const breakAfterNum = /* @__PURE__ */ new Set();
  let openTail = false;
  for (const row of rows) {
    if (row.lyricLabels?.length) {
      row.lyricLabels.forEach((label, v) => {
        const first = row.nums.find((n) => n.lyrics?.[v]);
        if (label && first) (labelOf.get(first) ?? labelOf.set(first, []).get(first))[v] = label;
      });
    }
    const ms = measuresOfRow(row);
    if (!ms.length) continue;
    const doubleXs = new Set(row.doubleBarXs ?? []);
    const endXs = new Set(row.endBarXs ?? []);
    const markDouble = (m, idx) => {
      if (m.rightX !== null && doubleXs.has(m.rightX)) doubleIdx.add(idx);
      if (m.rightX !== null && endXs.has(m.rightX)) endStyleIdx.add(idx);
    };
    if (openTail && allMeasures.length) {
      const prev = allMeasures[allMeasures.length - 1];
      if (prev.length) breakAfterNum.add(prev[prev.length - 1]);
      const first = ms.shift();
      allMeasures[allMeasures.length - 1].push(...first.notes);
      markDouble(first, allMeasures.length - 1);
    } else if (allMeasures.length) rowStartIdx.add(allMeasures.length);
    for (const m of ms) {
      allMeasures.push(m.notes);
      markDouble(m, allMeasures.length - 1);
      if (m.silent) silentIdx.add(allMeasures.length - 1);
    }
    if (row.finalBarline === "end") endStyleIdx.add(allMeasures.length - 1);
    openTail = !rowEndsClosed(row);
  }
  const arcs = pairArcs(allMeasures.flat(), score.fifths);
  const openSlurs = /* @__PURE__ */ new Map();
  const openTies = [];
  let tupletStart = null;
  let curBeats = score.beats, curBeatType = score.beatType;
  return allMeasures.map((notes, idx) => {
    const m = { number: String(idx + 1), elements: [] };
    if (rowStartIdx.has(idx)) m.print = { newSystem: true };
    const change = notes.find((n) => n.timeChange)?.timeChange;
    if (change && idx > 0 && (change.beats !== curBeats || change.beatType !== curBeatType)) {
      curBeats = change.beats;
      curBeatType = change.beatType;
      m.attrs = { time: { beats: curBeats, beatType: curBeatType } };
    }
    if (silentIdx.has(idx)) {
      for (let k = 0; k < curBeats; k++) {
        m.elements.push({
          kind: "chord",
          id: ids.next(),
          notes: [],
          rest: {},
          printObject: false,
          duration: { divisions: SIMPLE_DIVISIONS * 4 / curBeatType, dots: 0 },
          voice: 1,
          staff: 1
        });
      }
    }
    for (const n of notes) {
      for (const g of n.grace ?? []) {
        m.elements.push({
          kind: "chord",
          id: ids.next(),
          notes: [{ degree: { number: g.digit, octaveShift: g.octave } }],
          duration: { divisions: 0, dots: 0, ...GRACE_TYPE[g.div] ? { type: GRACE_TYPE[g.div] } : {} },
          grace: { slash: true },
          voice: 1,
          staff: 1
        });
      }
      const rest = n.digit === 0;
      const sustainCount = rest ? 0 : n.augment;
      const ch = {
        kind: "chord",
        id: ids.next(),
        notes: [],
        duration: duration123(n.div, n.dot > 0 ? 1 : 0, sustainCount),
        voice: 1,
        staff: 1
      };
      numOf?.set(ch.id, n);
      if (rest) ch.rest = {};
      else if (n.digit === RHYTHM_DIGIT) ch.rhythm = true;
      else {
        const note = { degree: { number: n.digit, octaveShift: n.octave } };
        if (n.accidental) {
          note.degree.accidental = n.accidental;
          note.accidental = n.accidental;
        }
        ch.notes.push(note);
      }
      if (n.div > 0) ch.beams = Array.from({ length: n.div }, () => "continue");
      if (sustainCount) ch.sustains = Array.from({ length: sustainCount }, () => ({ id: ids.next() }));
      const t2 = n.tuplet;
      if (t2) {
        ch.duration.timeMod = { actual: t2.actual, normal: t2.normal };
        if (t2.start) tupletStart = ch.id;
        if (t2.stop && tupletStart !== null) {
          marks.push({ type: "tuplet", start: tupletStart, end: ch.id, tupletActual: t2.actual, tupletNormal: t2.normal });
          tupletStart = null;
        }
      }
      placeChords(n, ch, t2 ? Math.round(ch.duration.divisions * t2.normal / t2.actual) : ch.duration.divisions);
      const notations = {};
      if (n.fermata) notations.fermata = true;
      if (n.articulation) notations.articulations = [n.articulation];
      const dyn = (n.dynamics ?? []).filter((x) => !/^(cresc|dim)/.test(x)), dynWords = (n.dynamics ?? []).filter((x) => /^(cresc|dim)/.test(x));
      if (dyn.length) notations.articulations = [...notations.articulations ?? [], ...dyn];
      if (n.ornament === "upper-mordent") notations.ornaments = ["inverted-mordent"];
      else if (n.ornament === "lower-mordent") notations.ornaments = ["mordent"];
      if (Object.keys(notations).length) ch.notations = notations;
      if (n.sectionMark || dynWords.length) ch.sectionWord = [n.sectionMark, ...dynWords].filter(Boolean).join(" ");
      if (n.lyrics) {
        const labels = labelOf.get(n);
        const lyrics = n.lyrics.flatMap((text, v) => {
          if (!text) return [];
          const l = { number: v + 1, text, syllabic: "single" };
          if (labels?.[v]) l.verseLabel = labels[v];
          return [l];
        });
        if (lyrics.length) ch.lyrics = lyrics;
      }
      const sl = arcs.slur.get(n);
      for (const k of sl?.stops ?? []) {
        const start = openSlurs.get(k);
        if (start !== void 0) {
          marks.push({ type: "slur", number: k, start, end: ch.id });
          openSlurs.delete(k);
        }
      }
      for (const k of sl?.starts ?? []) openSlurs.set(k, ch.id);
      const ti = arcs.tie.get(n);
      if (ti?.stop && ch.notes[0]) {
        const start = openTies.pop();
        if (start !== void 0) marks.push({ type: "tied", start, end: ch.id });
        ch.notes[0].tie = { ...ch.notes[0].tie ?? {}, stop: true };
      }
      if (ti?.start && ch.notes[0]) {
        openTies.push(ch.id);
        ch.notes[0].tie = { ...ch.notes[0].tie ?? {}, start: true };
      }
      m.elements.push(ch);
      if (rest) {
        for (let k = 0; k < n.augment; k++) {
          m.elements.push({ kind: "chord", id: ids.next(), notes: [], rest: {}, duration: { divisions: SIMPLE_DIVISIONS, dots: 0 }, voice: 1, staff: 1 });
        }
      }
      if (breakAfterNum.has(n)) {
        const last = m.elements[m.elements.length - 1];
        if (last?.kind === "chord") last.lineBreakAfter = "system";
      }
    }
    const barlines = [];
    const endingStart = notes.find((n) => n.endingStart !== void 0)?.endingStart;
    const repeatForward = notes.some((n) => n.repeatForward);
    const segno = notes.some((n) => n.segno);
    if (endingStart !== void 0 || repeatForward || segno) {
      const b = { location: "left" };
      if (repeatForward) {
        b.style = "heavy-light";
        b.repeat = "forward";
      }
      if (endingStart !== void 0) b.ending = endingOf(endingStart, "start");
      if (segno) b.ornaments = [{ name: "hs", level: 0 }];
      barlines.push(b);
    }
    const endingStop = [...notes].reverse().find((n) => n.endingStop !== void 0)?.endingStop;
    const repeatBackward = notes.some((n) => n.repeatBackward);
    const jump = notes.find((n) => n.jumpMark)?.jumpMark;
    const closed = idx < allMeasures.length - 1 || !openTail;
    if (endingStop !== void 0 || repeatBackward || endStyleIdx.has(idx) || jump || closed) {
      const b = { location: "right" };
      if (repeatBackward) {
        b.style = "light-heavy";
        b.repeat = "backward";
      } else if (endingStop === void 0 && endStyleIdx.has(idx)) b.style = "light-heavy";
      else if (doubleIdx.has(idx)) b.style = "light-light";
      else if (closed) b.style = "regular";
      if (endingStop !== void 0) b.ending = endingOf(endingStop, "stop");
      if (jump) {
        const name = JUMP_ORNAMENT[jump];
        if (name) b.ornaments = [{ name, level: 0 }];
        else b.annotation = jump;
      }
      barlines.push(b);
    }
    if (barlines.length) m.barlines = barlines;
    return m;
  });
}
function endingOf(text, type) {
  const numbers = text.split(/[,，.\s]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  return { numbers, text, type };
}
const isHanzi$1 = (c) => /[一-鿿]/.test(c);
const normCh = (c) => simplifiedOf(c) ?? c;
function contextOf(line, pos) {
  const cs = [...line];
  if (cs.length <= 30) return line;
  const a = Math.max(0, pos - 12), b = Math.min(cs.length, pos + 13);
  return (a > 0 ? "…" : "") + cs.slice(a, b).join("") + (b < cs.length ? "…" : "");
}
const LABEL_RE = /^(?:副歌|副|和|合|间奏|尾声|结尾|重复|重唱|独唱|齐唱|合唱|领|众|男|女|男声|女声|chorus|refrain|verse|bridge|coda|intro|outro|ending)\s*\d*$/i;
const META_RE = /^(?:歌曲|歌名|曲名|专辑|作词|作曲|词|曲|词曲|演唱|歌手|编曲|原唱|ti|ar|al|by|offset)\s*[:：]/i;
const LRC_TS = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
function parseRefLyrics(text) {
  let lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  if (lines.some((l) => /^\s*\[\d+:\d+/.test(l))) {
    const timed = [];
    for (const l of lines) {
      const ts = [...l.matchAll(LRC_TS)];
      const s = l.replace(LRC_TS, "");
      for (const m of ts) timed.push({ t: Number(m[1]) * 60 + Number(m[2]), s });
    }
    timed.sort((a, b) => a.t - b.t);
    lines = timed.map((x) => x.s);
  }
  const out = [];
  for (const raw of lines) {
    let l = raw.trim();
    if (!l || /^\[[a-z]+:.*\]$/i.test(l) || META_RE.test(l)) continue;
    l = l.replace(
      /[(（【[<《]\s*([^)）】\]>》]{1,8}?)\s*[)）】\]>》]/g,
      (m, inner) => LABEL_RE.test(inner.trim()) || /^(?:\d+|[一二三四五六七八九十]+)$/.test(inner.trim()) ? "" : m
    );
    l = l.replace(/^[（(]?\s*(?:副歌|副|和|合|chorus|refrain)\s*[:：)）]\s*/i, "");
    l = l.replace(/^\s*(?:\d{1,2}|[一二三四五六七八九十])\s*[.．、:：)）]\s*/, "");
    l = l.replace(/^\s*\d{1,2}\s+(?=[一-鿿])/, "");
    l = l.trim();
    if (!l || LABEL_RE.test(l)) continue;
    [...l].forEach((c, pos) => {
      if (isHanzi$1(c)) out.push({ ch: c, norm: normCh(c), line: contextOf(l, pos) });
    });
  }
  return out;
}
function locate(rows) {
  const out = /* @__PURE__ */ new Map();
  const barBase = /* @__PURE__ */ new Map();
  rows.forEach((r, ri) => {
    const voice = r.voice ?? 0;
    const base = barBase.get(voice) ?? 0;
    r.nums.forEach((n, ni) => {
      const cx = rcx(n.bbox);
      out.set(n, { row: ri, note: ni, bar: base + 1 + r.barlineXs.filter((x) => x < cx).length, rowRef: r });
    });
    const lastX = r.nums.length ? rcx(r.nums[r.nums.length - 1].bbox) : 0;
    barBase.set(voice, base + r.barlineXs.filter((x) => x < lastX).length + (r.barlineXs.some((x) => x > lastX) ? 1 : 0));
  });
  return out;
}
function heldNotes(rows) {
  const held = /* @__PURE__ */ new Set();
  const depth = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const v = r.voice ?? 0;
    let d = depth.get(v) ?? 0;
    for (const n of r.nums) {
      if (d > 0 || n.tieStop || n.slurStop) held.add(n);
      d = Math.max(0, d + (n.slurStart ?? 0) - (n.slurStop ?? 0));
    }
    depth.set(v, d);
  }
  return held;
}
function itemBuilder(locs, held) {
  const out = [];
  const rowHas = (r, v) => r.nums.some((n) => (n.lyrics?.[v] ?? "") !== "");
  const push = (n, verse, text, rest) => {
    const hz = [...text ?? ""].filter(isHanzi$1);
    if (hz.length) {
      hz.forEach((c, idx) => out.push({ n, verse, idx, ch: c, norm: normCh(c), held: false, absent: false }));
      return;
    }
    if (text && /[A-Za-z]/.test(text)) return;
    if (rest || n.digit === 0) return;
    const loc = locs.get(n);
    out.push({ n, verse, idx: -1, ch: null, norm: null, held: held.has(n), absent: !loc || !rowHas(loc.rowRef, verse) });
  };
  return { out, push };
}
function expandedItems(score, locs, held) {
  const numOf = /* @__PURE__ */ new Map();
  let js;
  try {
    js = jianpuInputOfDoc(recognizedToDoc(score, numOf), { forExpanded: true });
  } catch {
    return null;
  }
  const measures = js?.parts[0]?.measures;
  if (!js || !measures || !js.playData.measures.length) return null;
  const { out, push } = itemBuilder(locs, held);
  walkPlay(js.playData.measures, {
    measure: (mid, pass, cut) => {
      const m = measures[mid];
      if (!m) return;
      let chords = m.entries.filter((e) => e.kind === "chord").sort((a, b) => a.position.compareTo(b.position));
      if (cut.skip) chords = chords.slice(cut.skip);
      if (cut.limit >= 0) chords = chords.slice(0, cut.limit);
      const p = Math.max(1, pass);
      for (const ch of chords) {
        const n = ch.id !== null ? numOf.get(ch.id) : void 0;
        if (!n) continue;
        const ls = ch.notes[0]?.lyrics ?? [];
        const l = ls.find((x) => x.number === p) ?? ls.find((x) => x.refrain);
        let verse = p - 1;
        if (l) {
          const at = n.lyrics?.[l.number - 1] === l.text ? l.number - 1 : (n.lyrics ?? []).indexOf(l.text);
          verse = at >= 0 ? at : l.number - 1;
        }
        push(n, verse, n.lyrics?.[verse], ch.rest);
      }
    },
    passEnd: () => {
    }
  });
  return out;
}
function printedItems(rows, locs, held) {
  const { out, push } = itemBuilder(locs, held);
  const nv = Math.max(0, ...rows.flatMap((r) => r.nums.map((n) => n.lyrics?.length ?? 0)));
  for (let v = 0; v < nv; v++) {
    for (const r of rows) {
      if (!r.nums.some((n) => n.lyrics?.[v])) continue;
      for (const n of r.nums) push(n, v, n.lyrics?.[v], n.digit === 0);
    }
  }
  return out;
}
const SAME = 2, SUB = -1, FILL = -1, GAP_OPEN = -3, GAP_EXT = -0.5;
const NEG = -1e9;
function align(a, b) {
  const m = a.length, k = b.length, W = k + 1, N = (m + 1) * W;
  const S = [new Float64Array(N).fill(NEG), new Float64Array(N).fill(NEG), new Float64Array(N).fill(NEG)];
  const T = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
  S[0][0] = 0;
  const best3 = (idx, add) => {
    let bv = NEG, bs = 0;
    for (let s = 0; s < 3; s++) {
      const v = S[s][idx] + add[s];
      if (v > bv) {
        bv = v;
        bs = s;
      }
    }
    return [bv, bs];
  };
  for (let i2 = 0; i2 <= m; i2++) {
    const it = i2 > 0 ? a[i2 - 1] : null;
    const endRow = i2 === 0 || i2 === m;
    for (let j2 = 0; j2 <= k; j2++) {
      const c = i2 * W + j2;
      if (i2 === 0 && j2 === 0) continue;
      if (i2 > 0 && j2 > 0) {
        const pair = it.ch !== null ? it.norm === b[j2 - 1].norm ? SAME : SUB : it.absent ? NEG : FILL;
        const [v, s] = best3((i2 - 1) * W + j2 - 1, [pair, pair, pair]);
        S[0][c] = v;
        T[0][c] = s;
      }
      if (i2 > 0) {
        const add = it.ch === null ? [0, 0, 0] : [GAP_OPEN, GAP_EXT, GAP_OPEN];
        const [v, s] = best3((i2 - 1) * W + j2, add);
        S[1][c] = v;
        T[1][c] = s;
      }
      if (j2 > 0) {
        const add = endRow ? [0, 0, 0] : [GAP_OPEN, GAP_OPEN, GAP_EXT];
        const [v, s] = best3(i2 * W + j2 - 1, add);
        S[2][c] = v;
        T[2][c] = s;
      }
    }
  }
  const fin = best3(m * W + k, [0, 0, 0]);
  const score = fin[0];
  let st = fin[1];
  const pairs = [];
  let i = m, j = k;
  while (i > 0 || j > 0) {
    const prev = T[st][i * W + j];
    if (st === 0) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (st === 1) {
      pairs.push([i - 1, -1]);
      i--;
    } else {
      pairs.push([-1, j - 1]);
      j--;
    }
    st = prev;
  }
  pairs.reverse();
  return { pairs, score };
}
const matchedOf = (a, b, pairs) => pairs.filter(([i, j]) => i >= 0 && j >= 0 && a[i].ch !== null && a[i].norm === b[j].norm).length;
const VARIANT_GROUPS = ["他祂她牠它", "你祢妳您", "那哪", "阿啊", "于於与", "像象", "的得地", "惟唯", "藉借", "着著", "么吗嘛", "哦喔噢", "耶爷"];
const isVariant = (x, y) => VARIANT_GROUPS.some((g) => g.includes(x) && g.includes(y));
const ALT_SCORE_RATIO = 0.05;
const PRONOUN_GROUPS = ["他祂", "你祢"];
const PRONOUN_SPECIAL = "祂祢";
const SPECIAL_MISREADS = { 祂: "池袍袖施社弛祀衪地", 祢: "称袮弥" };
const SLUR_PAGE_RATIO = 0.8;
const MIN_MATCH_RATIO = 0.5;
const PHRASE_CHARS = "己已巳人入儆做瞎唐徬傍";
function charByPhrase(ch, prev2, prev, next, end) {
  if ("己已巳".includes(ch)) return jiYiByPhrase(prev2, prev, next, end) ?? (ch === "巳" ? "已" : void 0);
  if ("人入".includes(ch)) {
    if (prev === "死" && next === "生") return "入";
    if (prev2 + prev === "免得") return "入";
    if ("进深陷投加侵涌纳渗步归流".includes(prev) && prev) return "入";
    if ("世众罪爱敌外穷圣义恶女男别旁凡个每".includes(prev) && prev) return "人";
    if ("们类".includes(next) && next) return "人";
    return void 0;
  }
  if ("儆做".includes(ch)) return next === "醒" ? "儆" : void 0;
  if ("瞎唐".includes(ch)) return "眼子".includes(next) && next ? "瞎" : void 0;
  if ("徬傍".includes(ch)) return next === "徨" ? "徬" : void 0;
  return void 0;
}
function jiYiByPhrase(prev2, prev, next, end) {
  if (next === "经") return "已";
  if (prev === "自") return (prev2 === "能" || prev2 === "不") && end ? "已" : "己";
  if ("舍克律知利异虚".includes(prev) && prev) return "己";
  if ("身任意".includes(next) && next) return "己";
  if ("然往久".includes(next) && next) return "已";
  if ("早而业".includes(prev) && prev) return "已";
  if (prev === "不" && end) return "已";
  return void 0;
}
function replaceHanzi(text, idx, ch) {
  let k = -1;
  return [...text].map((c) => isHanzi$1(c) && ++k === idx ? ch : c).join("");
}
async function applyRefLyrics(score, refText, hooks) {
  const ref = parseRefLyrics(refText);
  const rows = score.rows;
  const locs = locate(rows);
  const held = heldNotes(rows);
  const items = [];
  const at = (n, extra = {}) => {
    const l = locs.get(n);
    return l ? { row: l.row, note: l.note, bar: l.bar, bbox: n.bbox, ...extra } : { bbox: n.bbox, ...extra };
  };
  const printed = printedItems(rows, locs, held);
  const expanded = expandedItems(score, locs, held);
  const pAl = align(printed, ref);
  const eAl = expanded ? align(expanded, ref) : null;
  const pM = matchedOf(printed, ref, pAl.pairs);
  const eM = eAl ? matchedOf(expanded, ref, eAl.pairs) : -1;
  const hz = (xs) => xs.filter((x) => x.ch !== null).length;
  const f1 = (mt, xs) => 2 * mt / Math.max(1, hz(xs) + ref.length);
  const pF = f1(pM, printed), eF = expanded ? f1(eM, expanded) : -1;
  let order = "expanded";
  let seq = expanded, al = eAl, matched = eM;
  if (!expanded || !eAl || pF > eF + 0.1) {
    if (expanded && eAl) {
      probe("refLyrics.repeatSuspect");
      items.push({ kind: "repeatSuspect", detail: `按演唱顺序展开：同字 ${eM}/识别 ${hz(expanded)} 字；按谱面顺序：同字 ${pM}/识别 ${hz(printed)} 字（参照 ${ref.length} 字）——反复/房号/跳转记号可能认错或漏认` });
    }
    order = "printed";
    seq = printed;
    al = pAl;
    matched = pM;
  }
  const a = seq, pairs = al.pairs;
  const ocrChars = a.filter((x) => x.ch !== null).length;
  const result = { order, refChars: ref.length, ocrChars, matched, items, unmatchedRef: [] };
  if (!ref.length || !ocrChars || matched < ocrChars * MIN_MATCH_RATIO) {
    items.push({ kind: "noMatch", detail: !ocrChars ? "识别侧没有歌词（谱面无词，或歌词行没认出来），未核对" : !ref.length ? "参照里没有汉字歌词，未核对" : `同字 ${matched} / 识别 ${ocrChars} 字 / 参照 ${ref.length} 字，词不对题，未做改动` });
    return result;
  }
  const kinds = pairs.map(([i, j]) => i < 0 ? "G" : a[i].ch === null ? j < 0 ? "E" : "F" : j < 0 ? "X" : a[i].norm === ref[j].norm ? "M" : "S");
  const anchored = new Uint8Array(pairs.length);
  const runOf = new Int32Array(pairs.length).fill(-1);
  let runN = 0;
  const segItems = /* @__PURE__ */ new Map();
  const hanziOf = (t0, t1) => pairs.slice(t0, t1).filter(([i]) => i >= 0 && a[i].ch !== null).map(([i]) => a[i].ch).join("");
  const refOf = (t0, t1) => pairs.slice(t0, t1).filter(([, j]) => j >= 0).map(([, j]) => ref[j].ch).join("");
  const clip = (x) => x.length > 40 ? x.slice(0, 40) + "…" : x;
  let seenM = false;
  for (let t2 = 0; t2 < pairs.length; ) {
    if (kinds[t2] === "M" || kinds[t2] === "E") {
      if (kinds[t2] === "M") seenM = true;
      t2++;
      continue;
    }
    let u = t2;
    while (u < pairs.length && kinds[u] !== "M") u++;
    let end = u;
    while (end > t2 && kinds[end - 1] === "E") end--;
    const ks = kinds.slice(t2, end).filter((x) => x !== "E");
    if (ks.length <= 2 && seenM && u < pairs.length) {
      anchored.fill(1, t2, end);
      runOf.fill(runN++, t2, end);
      t2 = u;
      continue;
    }
    if (ks.every((x) => x === "G")) {
      const js = pairs.slice(t2, end).map(([, j]) => j);
      result.unmatchedRef.push({ from: js[0], to: js[js.length - 1] + 1, text: clip(refOf(t2, end)) });
    } else {
      const first = pairs.slice(t2, end).find(([i]) => i >= 0);
      const it = first ? a[first[0]] : void 0;
      const firstRef = pairs.slice(t2, end).find(([, j]) => j >= 0);
      const ocr = clip(hanziOf(t2, end)), rf = clip(refOf(t2, end));
      const x = ks.every((q) => q === "X") ? { kind: "extraChar", ...it ? { verse: it.verse, ...at(it.n) } : {}, ocr, detail: "识别出参照里没有的一段" } : {
        kind: "mismatch",
        ...it ? { verse: it.verse, ...at(it.n) } : {},
        ocr,
        ref: rf,
        context: firstRef ? ref[firstRef[1]].line : void 0,
        detail: "整句对不上（版本不同或识别错得多），未改"
      };
      const key = `${x.kind}|${x.row}|${x.verse}|${x.note}|${ocr}|${rf}`;
      if (!segItems.has(key)) segItems.set(key, x);
    }
    t2 = u;
  }
  items.push(...segItems.values());
  const keyOf = (it) => `${locs.get(it.n)?.row}:${locs.get(it.n)?.note}:${it.verse}:${it.idx}`;
  const hits = /* @__PURE__ */ new Map();
  const phraseDone = /* @__PURE__ */ new Set();
  const resolved = /* @__PURE__ */ new Map();
  const runKeys = /* @__PURE__ */ new Map();
  const inRun = (t2, key) => {
    const id = runOf[t2];
    if (id < 0) return;
    const r = runKeys.get(id) ?? { keys: /* @__PURE__ */ new Set(), hasG: false };
    if (key === null) r.hasG = true;
    else r.keys.add(key);
    runKeys.set(id, r);
  };
  {
    const refAt = /* @__PURE__ */ new Map();
    for (const [i, j] of pairs) if (i >= 0 && j >= 0) refAt.set(i, j);
    const hzIdx = a.map((x, i) => x.ch !== null ? i : -1).filter((i) => i >= 0);
    hzIdx.forEach((ai, q) => {
      const it = a[ai];
      if (!PHRASE_CHARS.includes(it.ch)) return;
      const key = keyOf(it);
      if (phraseDone.has(key)) return;
      const chAt = (d) => {
        const x = hzIdx[q + d];
        return x !== void 0 ? a[x].ch : "";
      };
      const text = it.n.lyrics?.[it.verse] ?? "";
      let k = -1, after = "";
      for (const c of text) {
        if (isHanzi$1(c)) k++;
        else if (k === it.idx) after += c;
      }
      const end = /[，。、；：！？…,;:!?]/.test(after) || q === hzIdx.length - 1;
      const want = charByPhrase(it.ch, chAt(-2), chAt(-1), chAt(1), end);
      if (!want) return;
      phraseDone.add(key);
      const j = refAt.get(ai);
      const refCh = j !== void 0 ? ref[j] : void 0;
      const phrase = `${chAt(-1)}${want}${chAt(1)}`;
      if (want !== it.ch) {
        probe("refLyrics.phrase");
        it.n.lyrics[it.verse] = replaceHanzi(text, it.idx, want);
        const region = hooks.regionOf({ n: it.n, verse: it.verse, idx: it.idx });
        if (region) region.text = replaceHanzi(region.text, 0, want);
        const x = {
          kind: "fixed",
          verse: it.verse,
          ...at(it.n),
          ocr: it.ch,
          ref: want,
          context: refCh?.line,
          charBox: region?.bbox,
          detail: `按词组「${phrase}」定字${refCh && refCh.ch !== want ? `（歌词作「${refCh.ch}」）` : ""}`
        };
        items.push(x);
        resolved.set(key, x);
      } else if (refCh && refCh.norm !== want) {
        items.push({
          kind: "mismatch",
          verse: it.verse,
          ...at(it.n),
          ocr: it.ch,
          ref: refCh.ch,
          context: refCh.line,
          detail: `按词组「${phrase}」保留「${want}」，歌词这处多是错字`
        });
        resolved.set(key, items[items.length - 1]);
      }
    });
  }
  let pendG = [];
  let lastA = -1;
  const flushG = () => {
    if (!pendG.length) return;
    const it = lastA >= 0 ? a[lastA] : void 0;
    items.push({
      kind: "missingNote",
      ...it ? { verse: it.verse, ...at(it.n) } : {},
      ref: pendG.map((j) => ref[j].ch).join(""),
      context: ref[pendG[0]].line,
      detail: "参照在此多出字，谱上没有空着的音可落（漏音、漏字或版本不同）"
    });
    pendG = [];
  };
  const slurSeen = /* @__PURE__ */ new Set();
  let melHeld = 0, melFree = 0;
  for (const r of rows) {
    if (!r.nums.some((n) => (n.lyrics ?? []).some((t2) => [...t2 ?? ""].some(isHanzi$1)))) continue;
    r.nums.forEach((n, ni) => {
      if (ni === 0 || n.digit === 0 || (n.lyrics ?? []).some((t2) => [...t2 ?? ""].some(isHanzi$1))) return;
      const prev = r.nums[ni - 1];
      if (prev.digit === n.digit && prev.octave === n.octave && !held.has(n)) return;
      if (held.has(n)) melHeld++;
      else melFree++;
    });
  }
  const pageSlurs = melHeld + melFree >= 4 && melHeld >= (melHeld + melFree) * SLUR_PAGE_RATIO;
  pairs.forEach(([i, j], t2) => {
    const kd = kinds[t2];
    if (kd === "G") {
      if (anchored[t2]) {
        pendG.push(j);
        inRun(t2, null);
      }
      return;
    }
    flushG();
    lastA = i;
    const it = a[i];
    if (kd === "E") {
      if (!pageSlurs || it.held || it.absent || slurSeen.has(it.n)) return;
      let l = t2 - 1, r = t2 + 1;
      while (l >= 0 && kinds[l] === "E") l--;
      while (r < pairs.length && kinds[r] === "E") r++;
      if (l < 0 || r >= pairs.length || kinds[l] !== "M" || kinds[r] !== "M") return;
      const loc = locs.get(it.n);
      const prev = loc && loc.note > 0 ? loc.rowRef.nums[loc.note - 1] : void 0;
      if (!prev || prev.digit === 0 || prev.digit === it.n.digit && prev.octave === it.n.octave) return;
      if ((it.n.lyrics ?? []).some((x) => [...x ?? ""].some(isHanzi$1))) return;
      slurSeen.add(it.n);
      items.push({ kind: "slurSuspect", verse: it.verse, ...at(it.n), detail: "各段在这个音上都没字、也不在弧里：一字多音的弧可能漏认（谱面本就没印弧的可忽略）" });
      return;
    }
    const key = keyOf(it);
    if (kd !== "M") inRun(t2, key);
    const h = hits.get(key) ?? { it, refs: [], inSeg: false };
    if (kd !== "M" && !anchored[t2]) h.inSeg = true;
    h.refs.push(j);
    hits.set(key, h);
  });
  flushG();
  const fixReqs = [];
  for (const [key, { it, refs, inSeg }] of hits) {
    if (inSeg || phraseDone.has(key)) continue;
    const aligned = refs.filter((j) => j >= 0);
    const refChars = [...new Set(aligned.map((j) => ref[j].norm))];
    if (it.ch !== null) {
      if (!aligned.length) {
        items.push({ kind: "extraChar", verse: it.verse, ...at(it.n), ocr: it.ch, detail: "识别出参照里没有的字" });
        continue;
      }
      if (refChars.length === 1 && refChars[0] === it.norm && aligned.length === refs.length) continue;
      if (refChars.length > 1 || aligned.length !== refs.length) {
        items.push({ kind: "mismatch", verse: it.verse, ...at(it.n), ocr: it.ch, ref: refChars.join("/"), context: ref[aligned[0]].line, detail: "唱几遍对到的参照字不一致" });
        continue;
      }
      const r = ref[aligned[0]];
      if (isVariant(it.norm, r.norm)) {
        items.push({ kind: "variant", verse: it.verse, ...at(it.n), ocr: it.ch, ref: r.ch, context: r.line });
        continue;
      }
      fixReqs.push({ it, r, key });
    } else {
      if (!aligned.length || refChars.length !== 1 || aligned.length !== refs.length) continue;
      const r = ref[aligned[0]];
      if (it.held) {
        items.push({ kind: "missingNote", verse: it.verse, ...at(it.n), ref: r.ch, context: r.line, detail: "参照在此有字，但这个音在弧/连音线里（弧多认了，或漏读了字）" });
        continue;
      }
      probe("refLyrics.filled");
      const lyr = it.n.lyrics ??= [];
      for (let v = lyr.length; v < it.verse; v++) lyr[v] = "";
      lyr[it.verse] = r.ch;
      const x = { kind: "filled", verse: it.verse, ...at(it.n), ref: r.ch, context: r.line };
      items.push(x);
      resolved.set(key, x);
    }
  }
  const pageCount = /* @__PURE__ */ new Map();
  for (const r of rows) for (const n of r.nums) for (const t2 of n.lyrics ?? []) for (const c of t2 ?? "") {
    if (PRONOUN_GROUPS.some((g) => g.includes(c))) pageCount.set(c, (pageCount.get(c) ?? 0) + 1);
  }
  if (fixReqs.length) {
    const reqs = fixReqs.map(({ it }) => ({ n: it.n, verse: it.verse, idx: it.idx }));
    const alts = await hooks.rankAlts(reqs);
    fixReqs.forEach(({ it, r, key }, q) => {
      const al2 = alts[q];
      const pro = PRONOUN_GROUPS.find((g) => g.includes(r.norm));
      const top = al2?.scores[0] ?? 0;
      const ratioAt = (i) => al2 && al2.scores.length ? (al2.scores[i] ?? 0) / Math.max(1e-9, top) : 1;
      let k = -1;
      if (al2) {
        const idxOf = (c) => al2.alts.findIndex((x2) => normCh(x2) === c);
        if (pro) {
          const special = [...pro].find((c) => PRONOUN_SPECIAL.includes(c));
          const ks = idxOf(special), kr = idxOf(r.norm);
          const okAt = (i) => i >= 0 && ratioAt(i) >= ALT_SCORE_RATIO;
          const misread = SPECIAL_MISREADS[special].includes(it.ch);
          k = ks >= 0 && misread ? ks : okAt(ks) && (r.norm === special || (pageCount.get(special) ?? 0) >= 2) ? ks : okAt(kr) ? kr : [...pro].map(idxOf).filter(okAt).sort((x2, y) => (al2.scores[y] ?? 0) - (al2.scores[x2] ?? 0))[0] ?? -1;
        } else k = idxOf(r.norm);
      }
      const byMisread = !!pro && k >= 0 && PRONOUN_SPECIAL.includes(normCh(al2.alts[k])) && SPECIAL_MISREADS[normCh(al2.alts[k])].includes(it.ch);
      const ratio = k >= 0 ? byMisread ? 1 : ratioAt(k) : 1;
      const ownPronoun = PRONOUN_GROUPS.some((g) => g.includes(it.norm)) && (pageCount.get(it.ch) ?? 0) >= 3 && !pro;
      const refTypo = r.norm === "巳" || it.norm === "己" && r.norm === "已" || it.norm === "入" && r.norm === "人" || ownPronoun;
      const ok = al2 && k >= 0 && !refTypo && ratio >= ALT_SCORE_RATIO;
      const charBox = hooks.regionOf(reqs[q])?.bbox;
      const cand = al2 && k >= 0 ? { rank: k, score: al2.scores[k] ?? 0, top } : void 0;
      if (!ok) {
        items.push({
          kind: "mismatch",
          verse: it.verse,
          ...at(it.n),
          ocr: it.ch,
          ref: r.ch,
          context: r.line,
          charBox,
          cand,
          detail: !al2 ? "取不到识别候选（字来自谱后附段等）" : k < 0 ? `参照字不在识别候选里（字形不像；候选 ${al2.alts.slice(0, 5).join("")}）` : refTypo ? ownPronoun ? `谱面通篇用「${it.ch}」，参照这处多是错字，不照改` : "参照这个字多是歌词文本的错字（巳/已/己、人/入），不照改" : `参照字在候选第 ${k + 1} 位但得分太低（${(al2.scores[k] ?? 0).toFixed(4)} / 首选 ${top.toFixed(3)}）`
        });
        return;
      }
      const ch = al2.alts[k];
      probe("refLyrics.fixed");
      const text = it.n.lyrics?.[it.verse];
      if (text) it.n.lyrics[it.verse] = replaceHanzi(text, it.idx, ch);
      const region = hooks.regionOf(reqs[q]);
      if (region) region.text = replaceHanzi(region.text, 0, ch);
      const x = {
        kind: "fixed",
        verse: it.verse,
        ...at(it.n),
        ocr: it.ch,
        ref: ch,
        context: r.line,
        charBox: region?.bbox,
        cand,
        detail: `候选第 ${k + 1} 位（得分 ${(al2.scores[k] ?? 0).toFixed(3)}，首选 ${top.toFixed(3)}）` + (normCh(ch) !== r.norm ? `；歌词作「${r.ch}」，按谱面取「${ch}」` : "")
      };
      items.push(x);
      resolved.set(key, x);
    });
  }
  for (const { keys, hasG } of runKeys.values()) {
    const open = hasG || [...keys].some((k) => !resolved.has(k));
    if (!open) continue;
    for (const k of keys) {
      const x = resolved.get(k);
      if (x && (x.kind === "fixed" || x.kind === "filled")) x.review = "同一处还有别的字对不上，歌词这里可能写乱了";
    }
  }
  const order2 = (x) => [x.row ?? -1, x.verse ?? -1, x.note ?? -1];
  items.sort((x, y) => {
    const p = order2(x), q = order2(y);
    return p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
  });
  return result;
}
function formatLyricCheckItem(x) {
  const LABEL = {
    fixed: "已改",
    filled: "已补",
    variant: "用字不同",
    mismatch: "不一致",
    missingNote: "谱上缺位",
    extraChar: "参照没有",
    slurSuspect: "疑漏弧",
    repeatSuspect: "疑反复",
    noMatch: "对不上"
  };
  const where = x.row !== void 0 ? `第${x.row + 1}行 第${(x.verse ?? 0) + 1}段 第${(x.note ?? 0) + 1}音（小节${x.bar}）` : "全曲";
  const what = x.ocr !== void 0 || x.ref !== void 0 ? `：谱面「${x.ocr ?? ""}」→ 歌词「${x.ref ?? ""}」` : "";
  return `[${LABEL[x.kind]}${x.review ? "·待复查" : ""}] ${where}${what}${x.detail ? `  ${x.detail}` : ""}${x.review ? `  ⚠ ${x.review}` : ""}${x.context ? `  〔${x.context}〕` : ""}`;
}
function accidentalOf(bin, b) {
  const half = (x0, x1, y0, y1) => {
    let ink = 0, tot = 0;
    for (let y = Math.round(y0); y < Math.round(y1); y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        tot++;
        if (bin.data[y * bin.w + x]) ink++;
      }
    return tot ? ink / tot : 0;
  };
  const centerY = (x0, x1) => {
    let sum = 0, ink = 0;
    for (let y = Math.round(b.y); y < Math.round(rbottom(b)); y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++)
        if (bin.data[y * bin.w + x]) {
          ink++;
          sum += y - b.y;
        }
    return ink ? sum / ink / Math.max(1, b.h - 1) : null;
  };
  const mx = b.x + b.w / 2, my = b.y + b.h / 2;
  const lt = half(b.x, mx, b.y, my), rt = half(mx, rright(b), b.y, my);
  const lb = half(b.x, mx, my, rbottom(b)), rb = half(mx, rright(b), my, rbottom(b));
  if (lt + rt + lb + rb < 0.3) return null;
  if (rt < rb * 0.62 && lt > rt && lb >= rb * 0.7) return "flat";
  const lc = centerY(b.x, mx), rc = centerY(mx, rright(b));
  if (lc !== null && rc !== null && rc - lc > 0.18) return "natural";
  const rowRuns = (y) => {
    let lo = -1, hi = -1, runs = 0, prev = false;
    for (let x = Math.round(b.x); x < Math.round(rright(b)); x++) {
      const on = !!bin.data[y * bin.w + x];
      if (on) {
        if (lo < 0) lo = x;
        hi = x;
        if (!prev) runs++;
      }
      prev = on;
    }
    return { span: lo < 0 ? 0 : (hi - lo + 1) / b.w, runs };
  };
  const band = (y0, y1) => {
    const rs = [];
    for (let y = Math.round(y0); y < Math.max(Math.round(y0) + 1, Math.round(y1)); y++) rs.push(rowRuns(y));
    return rs;
  };
  const top = band(b.y, b.y + b.h * 0.12), bottom = band(rbottom(b) - b.h * 0.25, rbottom(b));
  const avg = (rs) => rs.reduce((a, r) => a + r.span, 0) / Math.max(1, rs.length);
  if (top.every((r) => r.runs === 1 && r.span < 0.4) && avg(bottom) >= 0.6) return "flat";
  if (Math.min(lt, rt, lb, rb) >= 0.12) return "sharp";
  return null;
}
const rcyOf = (r) => r.y + r.h / 2;
const hanziCount = (s) => (s.match(/[一-鿿]/g) || []).length;
function inkBlanks(bin, bbox) {
  const y1 = Math.min(bin.h, bbox.y + bbox.h), x1 = Math.min(bin.w, bbox.x + bbox.w);
  const blanks = [];
  let s = -1;
  for (let x = Math.max(0, bbox.x); x < x1; x++) {
    let ink = false;
    for (let y = Math.max(0, bbox.y); y < y1; y++) if (bin.data[y * bin.w + x]) {
      ink = true;
      break;
    }
    if (!ink) {
      if (s < 0) s = x;
    } else if (s >= 0) {
      blanks.push([s, x - s]);
      s = -1;
    }
  }
  return blanks;
}
function gapWideAt(bin, bbox, chars, i) {
  if (!chars || i < 0 || i + 1 >= chars.length) return false;
  const blanks = inkBlanks(bin, bbox);
  if (blanks.length < 3) return false;
  const med = median(blanks.map((b) => b[1])) || 1;
  const lo = chars[i].cx, hi = chars[i + 1].cx;
  return blanks.some(([bx, bw]) => bx + bw / 2 > lo && bx + bw / 2 <= hi && bw >= med * 1.6);
}
function recoverHanziGaps(bin, text, bbox, chars) {
  const cs = [...text];
  if (!chars || chars.length !== cs.length || hanziCount(text) < 4) return text;
  const isHan = (c) => /[一-鿿]/.test(c);
  const pairGap = /* @__PURE__ */ new Map();
  for (const [bx, bw] of inkBlanks(bin, bbox)) {
    const mid = bx + bw / 2;
    let i = -1;
    while (i + 1 < chars.length && chars[i + 1].cx < mid) i++;
    if (i >= 0 && i + 1 < cs.length && isHan(cs[i]) && isHan(cs[i + 1])) pairGap.set(i, Math.max(pairGap.get(i) ?? 0, bw));
  }
  if (pairGap.size < 3) return text;
  const med = median([...pairGap.values()]);
  const after = new Set([...pairGap].filter(([, w]) => w >= bbox.h * 0.5 && w >= med * 2).map(([i]) => i));
  return cs.map((c, i) => after.has(i) ? c + " " : c).join("");
}
function recoverSpacesByInk(bin, text, bbox, chars) {
  if (!chars || chars.length !== [...text].length || !/[A-Za-z]{2}/.test(text)) return text;
  const blanks = inkBlanks(bin, bbox);
  if (blanks.length < 3) return text;
  const cs = [...text];
  const isLetter = (c) => /[A-Za-z]/.test(c);
  const leftOf = (bx, bw) => {
    const mid = bx + bw / 2;
    let i = -1;
    while (i + 1 < chars.length && chars[i + 1].cx < mid) i++;
    return i;
  };
  const ll = blanks.filter(([bx, bw]) => {
    const i = leftOf(bx, bw);
    return i >= 0 && i + 1 < cs.length && isLetter(cs[i]) && isLetter(cs[i + 1]);
  });
  const widths = [...new Set((ll.length >= 3 ? ll : blanks).map((b) => b[1]))].sort((a, b) => a - b);
  let cut = 0, jump = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    if (widths[i + 1] - widths[i] >= jump) {
      jump = widths[i + 1] - widths[i];
      cut = (widths[i] + widths[i + 1]) / 2;
    }
  }
  const thr = Math.max(cut, bbox.h * 0.12);
  const spaceAfter = /* @__PURE__ */ new Set();
  for (const [bx, bw] of ll) {
    if (bw < thr) continue;
    spaceAfter.add(leftOf(bx, bw));
  }
  const gapAfter = /* @__PURE__ */ new Map();
  for (const [bx, bw] of blanks) {
    const i = leftOf(bx, bw);
    if (i >= 0) gapAfter.set(i, Math.max(gapAfter.get(i) ?? 0, bw));
  }
  const ideoComma = /* @__PURE__ */ new Set();
  for (let i = 1; i + 1 < cs.length; i++) {
    if (!/[,;:!?.]/.test(cs[i]) || !isLetter(cs[i + 1])) continue;
    if (cs[i] === "," && (gapAfter.get(i - 1) ?? 0) >= thr * 0.6) ideoComma.add(i);
    else if ((gapAfter.get(i) ?? 0) >= thr) spaceAfter.add(i);
  }
  ideoComma.forEach((i) => {
    cs[i] = "、";
  });
  return cs.map((c, i) => spaceAfter.has(i) ? c + " " : c).join("");
}
function charsForText(text, raw) {
  if (!raw || !raw.length) return void 0;
  const res = [];
  let ri = 0;
  for (const ch of text.trim()) {
    if (ch === " ") continue;
    let j = ri;
    while (j < raw.length && raw[j].text !== ch) j++;
    if (j < raw.length) {
      res.push({ text: ch, cx: raw[j].cx });
      ri = j + 1;
    } else if (ri < raw.length) {
      res.push({ text: ch, cx: raw[ri].cx });
      ri++;
    } else if (res.length) {
      res.push({ text: ch, cx: res[res.length - 1].cx + 1 });
    }
  }
  return res.length ? res : void 0;
}
const NAT_FIFTHS = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 };
const KEY_SHARP = ["C", "G", "D", "A", "E", "B", "♯F", "♯C"];
const KEY_FLAT = ["C", "F", "♭B", "♭E", "♭A", "♭D", "♭G", "♭C"];
function fifthsToKey(f) {
  if (f === void 0) return "C";
  return f < 0 ? KEY_FLAT[-f] ?? "C" : KEY_SHARP[f] ?? "C";
}
const unionBox = (cs) => unionRects(cs.map((c) => c.bbox));
function parseMeta(lines) {
  const res = {};
  const toFifths = (note, acc) => {
    if (!(note in NAT_FIFTHS)) return void 0;
    let f = NAT_FIFTHS[note];
    if (acc === "b" || acc === "♭") f -= 7;
    else if (acc === "#" || acc === "♯") f += 7;
    return f >= -7 && f <= 7 ? f : void 0;
  };
  for (const l of lines) {
    const acc = l.text.match(/1\s*[=＝]\s*([b#♭♯])\s*([A-G])/) || l.text.match(/([b#♭♯])\s*([A-G])(?![a-z])/);
    if (acc) {
      const f = toFifths(acc[2], acc[1]);
      if (f !== void 0) {
        res.fifths = f;
        res.fifthsLine = l;
        break;
      }
    }
    const post = l.text.match(/1\s*[=＝]\s*([A-G])\s*([b#♭♯])(?![a-z])/);
    if (post) {
      const f = toFifths(post[1], post[2]);
      if (f !== void 0) {
        res.fifths = f;
        res.fifthsLine = l;
        break;
      }
    }
    const nat = l.text.match(/1\s*[=＝]\s*([A-G])(?![b#♭♯a-z])/);
    if (nat && nat[1] in NAT_FIFTHS) {
      res.fifths = NAT_FIFTHS[nat[1]];
      res.fifthsLine = l;
      break;
    }
  }
  if (res.fifths === void 0) {
    for (const l of lines) {
      const t2 = normKeyText(l.text.replace(/\s+/g, "")).replace(/(调)\d{1,2}(?:[.·]?[/／]\d{1,2})?$/, "$1");
      const m = t2.length <= 6 && t2.match(/^([b#♭♯降升]?)([A-G])([b#♭♯]?)(大调|小调|调)$/);
      if (!m) continue;
      const a = m[1] === "降" ? "b" : m[1] === "升" ? "#" : m[1];
      const f = toFifths(m[2], a || m[3]);
      if (f === void 0) continue;
      const g = m[4] === "小调" ? f - 3 : f;
      if (g < -7 || g > 7) continue;
      probe("key.cjkName");
      res.fifths = g;
      res.fifthsLine = l;
      break;
    }
  }
  if (res.fifths === void 0) {
    const accs = lines.filter((l) => /^[b#♭♯]$/.test(l.text.trim()));
    const notes = lines.filter((l) => /^[A-G]/.test(l.text.trim()));
    for (const a of accs) {
      let best = null, bd = Infinity;
      for (const n of notes) {
        const dx = n.cx - a.cx, dy = Math.abs(n.cy - a.cy);
        if (dx < -0.3 * a.charH || dx > 4.5 * a.charH || dy > 1.5 * a.charH) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (best) {
        const f = toFifths(best.text.trim()[0], a.text.trim());
        if (f !== void 0) {
          res.fifths = f;
          res.fifthsLine = best;
          break;
        }
      }
    }
  }
  if (res.fifths === void 0) {
    for (const l of lines) {
      const t2 = l.text.replace(/\s+/g, "");
      if (t2.length > 8) continue;
      const m = t2.match(/(?:^|[^A-Za-z])([A-G])([b#♭♯]?)(\d{1,2})[/／](\d{1,2})(?![0-9])/);
      if (!m || !(m[1] in NAT_FIFTHS)) continue;
      if (!validBeats(Number(m[3])) || !validBeatType(Number(m[4]))) continue;
      const f = m[2] ? toFifths(m[1], m[2]) : NAT_FIFTHS[m[1]];
      if (f === void 0) continue;
      probe("key.bareNote");
      res.fifths = f;
      res.fifthsLine = l;
      break;
    }
  }
  for (const l of lines) {
    const t2 = l.text.match(/(?:[♩Jj]\s*([.·．]))?\s*[=＝]\s*(\d{2,3})\b/);
    if (t2) {
      const bpm = parseInt(t2[2], 10);
      if (bpm >= 30 && bpm <= 300) {
        res.tempo = bpm;
        res.tempoDotted = !!t2[1];
        res.tempoLine = l;
        break;
      }
    }
  }
  const inline = parseInlineMeters(lines, res.fifthsLine);
  if (inline) {
    probe("meter.inline");
    res.meters = inline.meters;
    res.beats = inline.meters[0].beats;
    res.beatType = inline.meters[0].beatType;
    res.meterNote = inline.note;
    res.timeBBox = inline.bbox;
    return res;
  }
  const mixed = parseMixedMeters(lines, res.fifthsLine);
  if (mixed) {
    probe("meter.mixed");
    res.meters = mixed.meters;
    res.beats = mixed.meters[0].beats;
    res.beatType = mixed.meters[0].beatType;
    res.meterNote = mixed.note;
    res.timeBBox = mixed.bbox;
    return res;
  }
  const tm = parseTime(lines, res.fifthsLine);
  if (tm) {
    probe("meter.parseTime");
    res.beats = tm.beats;
    res.beatType = tm.beatType;
    res.timeBBox = tm.bbox;
    res.meters = [{ beats: tm.beats, beatType: tm.beatType }];
  }
  return res;
}
const validBeatType = (d) => d === 1 || d === 2 || d === 4 || d === 8 || d === 16;
const validBeats = (n) => n >= 1 && n <= 16;
function parseMixedMeters(lines, fifthsLine) {
  const tailDigits = (l) => /(\d{2,})\s*$/.exec(l.text.trim())?.[1] ?? "";
  const headDigits = (l) => /^\s*(\d{2,})/.exec(l.text.trim())?.[1] ?? "";
  const digitsWithX = (l, s, fromTail) => {
    const ds = [...s];
    if (!l.chars?.length) return ds.map((d) => ({ d, cx: NaN }));
    const cxs = l.chars.filter((c) => /^\d$/.test(c.text)).map((c) => c.cx);
    const take = fromTail ? cxs.slice(-ds.length) : cxs.slice(0, ds.length);
    return ds.map((d, i) => ({ d, cx: take[i] ?? NaN }));
  };
  let best;
  let bd = Infinity;
  for (const up of lines) for (const dn of lines) {
    if (up === dn) continue;
    const dy = dn.cy - up.cy;
    if (dy <= 0 || dn.bbox.y <= up.bbox.y || dy > 2.5 * up.charH) continue;
    if (overlapRatioX(up.bbox, dn.bbox) < 0.2) continue;
    const us = tailDigits(up), ds = headDigits(dn);
    if (us.length < 2 || us.length !== ds.length) continue;
    const un = digitsWithX(up, us, true), dnn = digitsWithX(dn, ds, false);
    const meters = [];
    let bad = false;
    for (let i = 0; i < un.length && !bad; i++) {
      const pick = isNaN(un[i].cx) ? dnn[i] : dnn.reduce((a, b) => Math.abs(b.cx - un[i].cx) < Math.abs(a.cx - un[i].cx) ? b : a);
      const n = Number(un[i].d), d = Number(pick.d);
      if (!validBeats(n) || !validBeatType(d)) {
        bad = true;
        break;
      }
      meters.push({ beats: n, beatType: d });
    }
    if (bad) continue;
    const rest = dn.text.trim().slice(ds.length).trim();
    const note = /^[^\d]{1,5}拍$/.test(rest) ? rest : void 0;
    const score = fifthsLine ? Math.abs(up.cy - fifthsLine.cy) : dy;
    if (score < bd) {
      bd = score;
      best = { meters, note, bbox: unionRect(up.bbox, dn.bbox) };
    }
  }
  return best;
}
function parseMeterRun(run) {
  const out = [];
  let i = 0;
  while (i < run.length) {
    const m = /^(\d{1,2})[/／]/.exec(run.slice(i));
    if (!m) return null;
    const n = Number(m[1]);
    if (!validBeats(n)) return null;
    i += m[0].length;
    let d = -1;
    for (const len of [1, 2]) {
      const t2 = run.slice(i, i + len);
      if (t2.length !== len) continue;
      const v = Number(t2);
      if (!validBeatType(v)) continue;
      const rest = run.slice(i + len);
      if (rest && !/^\d{1,2}[/／]/.test(rest)) continue;
      d = v;
      i += len;
      break;
    }
    if (d < 0) return null;
    out.push({ beats: n, beatType: d });
  }
  return out.length ? out : null;
}
function parseInlineMeters(lines, fifthsLine) {
  for (const l of lines) {
    const t2 = l.text.replace(/\s+/g, "");
    for (const m of t2.matchAll(/[\d/／]+/g)) {
      const run = m[0];
      if (!/[/／]/.test(run)) continue;
      const meters = parseMeterRun(run);
      if (!meters || meters.length < 2) continue;
      const rest = t2.slice(m.index + run.length);
      const note = /^[^\d]{1,5}拍/.test(rest) ? /^([^\d]{1,5}拍)/.exec(rest)[1] : void 0;
      const bbox = l === fifthsLine ? { x: l.bbox.x + l.bbox.w * 0.3, y: l.bbox.y, w: l.bbox.w * 0.7, h: l.bbox.h } : l.bbox;
      return { meters, note, bbox };
    }
  }
  return void 0;
}
function parseTime(lines, fifthsLine) {
  for (const l of lines) {
    const m = l.text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (m) {
      const n = parseInt(m[1], 10), d = parseInt(m[2], 10);
      if (!validBeats(n) || !validBeatType(d)) continue;
      let bbox = l.bbox;
      if (l === fifthsLine) bbox = { x: l.bbox.x + l.bbox.w * 0.62, y: l.bbox.y, w: l.bbox.w * 0.38, h: l.bbox.h };
      return { beats: n, beatType: d, bbox };
    }
  }
  const digs = lines.filter((l) => /^\d{1,2}$/.test(l.text.trim()));
  let best, bd = Infinity;
  for (const a of digs) for (const b of digs) {
    if (a === b) continue;
    const dy = b.cy - a.cy, dx = Math.abs(b.cx - a.cx);
    if (dy <= 0.3 * a.charH || dy > 2.5 * a.charH || dx > 0.8 * a.charH) continue;
    const n = parseInt(a.text.trim(), 10), d = parseInt(b.text.trim(), 10);
    if (!validBeats(n) || !validBeatType(d)) continue;
    const score = fifthsLine ? Math.abs(a.cy - fifthsLine.cy) + Math.abs(a.cx - fifthsLine.cx) : dy + dx;
    if (score < bd) {
      bd = score;
      best = { beats: n, beatType: d, bbox: unionRect(a.bbox, b.bbox) };
    }
  }
  return best;
}
function mergeStackedColumns(comps, numH) {
  const boxes = comps.map((c) => ({ ...c.bbox }));
  const alive = boxes.map(() => true);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < boxes.length; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < boxes.length; j++) {
        if (!alive[j]) continue;
        const a = boxes[i], b = boxes[j];
        const top = a.y <= b.y ? a : b, bot = a.y <= b.y ? b : a;
        const gap = bot.y - (top.y + top.h);
        if (overlapRatioX(a, b) < 0.35 || gap > numH * 0.35) continue;
        const nb = unionRect(a, b);
        if (nb.h > numH * 3) continue;
        if (nb.w / nb.h < 0.5) continue;
        boxes[i] = nb;
        alive[j] = false;
        changed = true;
      }
    }
  }
  return boxes.filter((_, i) => alive[i]).map((b, id) => ({ id, bbox: b, area: b.w * b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }));
}
function normKeyText(t2) {
  return t2.replace(/([A-Ga-g0OopP口日8εЕ€])[°º˚](?=调)/, "$1b").replace(/([A-Ga-g0OopP口日8εЕ€][b#♭♯h]?)[.·．、](?=调)/, "$1").replace(/调[.·．](?=\d)/, "调").replace(/(^|\d)([b#♭♯降升]?)([a-g])(?=[b#♭♯h]?调)/, (_m, a, b, c) => a + b + c.toUpperCase()).replace(/(^|\d)([b#♭♯降升]?)[0OopP口](?=[b#♭♯h]?调)/, "$1$2D").replace(/(^|\d)([b#♭♯降升]?)[日8](?=[b#♭♯h]?调)/, "$1$2B").replace(/(^|\d)([b#♭♯降升]?)[εЕ€](?=[b#♭♯h]?调)/, "$1$2E").replace(/([A-G])h(?=调)/, "$1b").replace(/((?:[降升]|[b#♭♯])?[A-G][b#♭♯]?)(?:[.\-、．·]?(?:[降升]|[b#♭♯])?[A-G][b#♭♯]?)?调(?:(?:[降升]|[b#♭♯])?[A-G][b#♭♯]?调)?/, "$1调");
}
function splitInlineKey(lines) {
  const out = [];
  for (const l of lines) {
    const m = /^(\d{1,4})?((?:(?:[降升]|[b#♭♯])?[A-Ga-g0OopP口日8εЕ€][b#♭♯h]?[.·．、°º˚]?)?(?:[.\-、．·]?(?:[降升]|[b#♭♯])?[A-G][b#♭♯]?)?调(?:(?:[降升]|[b#♭♯])?[A-G][b#♭♯]?调)?[.·．]?\d{1,2}(?:[.·]?[/／]\d{1,2}|(?=[一-鿿])))(.*)$/.exec(l.text);
    const cs = l.chars && l.chars.length === l.text.length ? l.chars : void 0;
    if (!m || !cs || !m[1] && !m[3]) {
      out.push(l);
      continue;
    }
    const cuts = [0, (m[1] ?? "").length, (m[1] ?? "").length + m[2].length, l.text.length];
    const edge = (i) => i <= 0 ? l.bbox.x : i >= cs.length ? l.bbox.x + l.bbox.w : ((cs[i - 1].x1 ?? cs[i - 1].cx) + cs[i].cx) / 2;
    for (let k = 0; k < 3; k++) {
      const [a, b] = [cuts[k], cuts[k + 1]];
      if (a >= b) continue;
      const x0 = edge(a), x1 = edge(b);
      const bbox = { x: x0, y: l.bbox.y, w: Math.max(1, x1 - x0), h: l.bbox.h };
      out.push({ ...l, text: l.text.slice(a, b), chars: cs.slice(a, b), bbox, cx: x0 + bbox.w / 2 });
    }
    probe("header.splitInlineKey");
  }
  return out;
}
async function recognizeHeader(bin, comps, firstStaffTopY, numH, ocr, geoMeters) {
  const out = { credits: [], regions: [] };
  if (!ocr.recognizeTexts || firstStaffTopY < numH) return out;
  const recognizeTexts = ocr.recognizeTexts.bind(ocr);
  if (ocr.recognizeRegion && globalThis.__headerDet !== false) {
    const dets = await ocr.recognizeRegion(bin, { x: 0, y: 0, w: bin.w, h: Math.round(firstStaffTopY - numH * 0.1) });
    if (dets.length) {
      const lines2 = splitInlineKey(dets.map((d) => ({ text: d.text, charH: d.bbox.h, cx: d.bbox.x + d.bbox.w / 2, cy: d.bbox.y + d.bbox.h / 2, n: 1, bbox: d.bbox, chars: d.chars })));
      if (globalThis.__omrDebug) console.log("[header/det]", lines2.map((l) => `${Math.round(l.charH)}px@${Math.round(l.cx)},${Math.round(l.cy)}w${Math.round(l.bbox.w)}=${JSON.stringify(l.text)}`).join("  "));
      probe("header.det");
      await classify2(lines2);
      return out;
    }
  }
  const region = comps.filter((c) => {
    const b = c.bbox;
    const cy = b.y + b.h / 2;
    return cy < firstStaffTopY - numH * 0.1 && b.h >= numH * 0.4 && b.w >= numH * 0.2;
  });
  if (!region.length) return out;
  probe("header.geometric");
  const src = surfaceFromBinary(bin);
  const ocrGroups = async (gs) => {
    const meta = [], strips = [], owner = [];
    for (const g of gs) {
      const charH = median(g.map((k) => k.bbox.h)) || numH;
      const cells = mergeToChars(g, charH);
      if (!cells.length) continue;
      const li = meta.length;
      meta.push(g);
      for (const ch of chunkCells(cells)) {
        strips.push(buildStrip(src, ch));
        owner.push(li);
      }
    }
    if (!strips.length) return [];
    const texts = await recognizeTexts(strips);
    const lines2 = meta.map((g) => ({ text: "", charH: median(g.map((k) => k.bbox.h)) || numH, cx: median(g.map((k) => k.cx)), cy: median(g.map((k) => k.cy)), n: g.length, bbox: unionBox(g) }));
    texts.forEach((t2, i) => {
      lines2[owner[i]].text += t2;
    });
    return lines2;
  };
  const splitBlocks = (cs) => {
    const yRows = clusterByY(cs, (c) => c.cy, numH * 0.6);
    const blocks = [];
    for (const r of yRows) {
      const rowH = median(r.map((k) => k.bbox.h));
      let cur = [];
      for (const c of [...r].sort((a, b) => a.bbox.x - b.bbox.x)) {
        const last = cur[cur.length - 1];
        if (last && c.bbox.x - (last.bbox.x + last.bbox.w) > rowH * 2) {
          blocks.push(cur);
          cur = [];
        }
        cur.push(c);
      }
      if (cur.length) blocks.push(cur);
    }
    return blocks;
  };
  const merged = mergeStackedColumns(region, numH);
  const big = merged.filter((c) => c.bbox.h >= numH * 1.3);
  const small = merged.filter((c) => c.bbox.h < numH * 1.3);
  const lines = await ocrGroups([...splitBlocks(big), ...splitBlocks(small)]);
  await classify2(lines);
  return out;
  async function readKeyGroup(group, loose = false) {
    if (!group.length || !ocr.recognizeTexts) return void 0;
    const lowest = Math.max(...group.map((g) => g.bbox.y + g.bbox.h));
    let acc = "";
    let letters = group;
    for (const g of group) {
      const lh = Math.max(...group.filter((o) => o !== g).map((o) => o.bbox.h), 0);
      if (!lh || lowest - (g.bbox.y + g.bbox.h) < lh * 0.2) continue;
      if (g.bbox.h < g.bbox.w) continue;
      const kind = accidentalOf(bin, g.bbox);
      if (kind !== "flat" && kind !== "sharp") continue;
      acc = kind === "flat" ? "b" : "#";
      letters = group.filter((o) => o !== g);
      break;
    }
    const read = async (ks) => {
      const [text] = await recognizeTexts([buildStrip(surfaceFromBinary(bin), [unionRects(ks.map((g) => g.bbox))])]);
      if (globalThis.__omrDebug) console.log("[header/keyGroup]", JSON.stringify(text), acc, ks.map((g) => `${g.bbox.x},${g.bbox.y} ${g.bbox.w}x${g.bbox.h}`).join(" | "));
      const t2 = loose ? (text ?? "").trim().replace(/^[0Oo口]/, "D").replace(/^[8日]/, "B").replace(/^[εЕ€]/, "E") : text ?? "";
      return /^\s*([1１]\s*[=＝]\s*)?([b#♭♯]?)\s*([A-Ga-g])\s*([b#♭♯]?)\s*$/.exec(t2);
    };
    let m = await read(letters);
    if (!m && acc) {
      acc = "";
      m = await read(group);
    }
    if (!m || !m[1] && m[3] !== m[3].toUpperCase()) return void 0;
    const a = acc || m[2] || m[4];
    const nat = NAT_FIFTHS[m[3].toUpperCase()];
    let f = nat + (a === "b" || a === "♭" ? -7 : a === "#" || a === "♯" ? 7 : 0);
    if (acc && (f < -7 || f > 7)) {
      probe("key.accFlipped");
      f = nat + (acc === "b" ? 7 : -7);
    }
    return f >= -7 && f <= 7 ? { fifths: f, bbox: unionRects(group.map((g) => g.bbox)) } : void 0;
  }
  function isSlash(b) {
    let diag = 0, off = 0;
    for (let y = Math.round(b.y); y < Math.round(b.y + b.h); y++) {
      for (let x = Math.round(b.x); x < Math.round(b.x + b.w); x++) {
        if (!bin.data[y * bin.w + x]) continue;
        const u = (x - b.x) / Math.max(1, b.w - 1), v = (y - b.y) / Math.max(1, b.h - 1);
        if (Math.abs(u + v - 1) <= 0.35) diag++;
        else off++;
      }
    }
    return diag >= 8 && off <= diag * 0.15;
  }
  function isBar(k) {
    return k.bbox.w >= k.bbox.h * 2.5 && k.bbox.h <= numH * 0.25 && k.bbox.w >= numH * 0.2 && k.bbox.w <= numH * 1.6;
  }
  function glyphPool(xMax, yMin, maxH = 2) {
    const yMax = firstStaffTopY - numH * 0.1;
    return comps.filter((k) => rcyOf(k.bbox) >= yMin && rcyOf(k.bbox) <= yMax && k.cx < xMax && k.bbox.h <= numH * maxH && k.bbox.w <= numH * 2).sort((a, b) => a.bbox.x - b.bbox.x);
  }
  function eqSigns(pool) {
    const bars = pool.filter(isBar);
    const out2 = [];
    for (const a of bars) for (const b of bars) {
      const dy = rcyOf(b.bbox) - rcyOf(a.bbox);
      if (a === b || dy <= 0 || dy > numH * 0.5 || overlapRatioX(a.bbox, b.bbox) < 0.6) continue;
      out2.push(unionRect(a.bbox, b.bbox));
    }
    return out2;
  }
  function chainFrom(pool, edge, dir, band, firstGap, max = 3, skip = () => false) {
    const cands = pool.filter((k) => !isBar(k) && !skip(k) && (dir > 0 ? k.bbox.x >= edge : k.bbox.x + k.bbox.w <= edge)).filter((k) => k.bbox.y <= band.y + band.h && k.bbox.y + k.bbox.h >= band.y).sort((a, b) => dir * (a.bbox.x - b.bbox.x));
    const group = [];
    let cur = edge;
    for (const k of cands) {
      if (k.bbox.w >= k.bbox.h * 2.5 && k.bbox.h <= numH * 0.25) break;
      const gap = dir > 0 ? k.bbox.x - cur : cur - (k.bbox.x + k.bbox.w);
      const gh = group.length ? Math.max(...group.map((g) => g.bbox.h)) : 0;
      if (gap > (group.length ? Math.max(4, gh * 0.6) : firstGap)) break;
      group.push(k);
      cur = dir > 0 ? Math.max(cur, k.bbox.x + k.bbox.w) : Math.min(cur, k.bbox.x);
      if (group.length > max) return [];
    }
    return dir > 0 ? group : group.reverse();
  }
  function slashGroups(pool) {
    const out2 = [];
    for (const sl of pool) {
      const sb = sl.bbox;
      if (sb.h < numH * 0.4 || sb.w > sb.h * 0.8 || !isSlash(sb)) continue;
      const digitLike = (k) => k !== sl && k.bbox.h >= sb.h * 0.5 && k.bbox.h <= sb.h * 1.5 && overlapRatioY(k.bbox, sb) >= 0.5;
      const gapOf = (k, edge, dir) => dir > 0 ? k.bbox.x - edge : edge - (k.bbox.x + k.bbox.w);
      const nearest = (edge, dir, maxGap, not) => pool.filter((k) => k !== not && !isBar(k) && digitLike(k) && gapOf(k, edge, dir) >= -2 && gapOf(k, edge, dir) <= maxGap).sort((p, q) => gapOf(p, edge, dir) - gapOf(q, edge, dir))[0];
      const side = (dir) => {
        const a = nearest(dir > 0 ? sb.x + sb.w : sb.x, dir, numH * 0.5);
        if (!a) return [];
        const b = nearest(dir > 0 ? a.bbox.x + a.bbox.w : a.bbox.x, dir, sb.h * 0.3, a);
        return !b ? [a] : dir > 0 ? [a, b] : [b, a];
      };
      const left = side(-1), right = side(1);
      if (globalThis.__omrDebug) console.log("[header/slash]", `${sb.x},${sb.y} ${sb.w}x${sb.h}`, left.length, right.length);
      if (left.length && right.length) out2.push({ slash: sl, left, right });
    }
    return out2;
  }
  async function slashMeters(groups) {
    const out2 = [];
    for (const g of groups) {
      const adj = g.left.slice(-1);
      if (!ocr.recognizeNumerals) {
        g.left = adj;
        continue;
      }
      const ds = await ocr.recognizeNumerals(bin, [...g.left, ...g.right].map((k) => k.bbox));
      const dn = ds.slice(g.left.length);
      const beatType = dn.some((d) => d === void 0) ? NaN : Number(dn.join(""));
      let up = ds.slice(0, g.left.length);
      if (up.some((d) => d === void 0) || !validBeats(Number(up.join("")))) {
        up = up.slice(-1);
        g.left = adj;
      }
      const beats = up.some((d) => d === void 0) ? NaN : Number(up.join(""));
      if (!validBeats(beats) || !validBeatType(beatType)) {
        g.left = adj;
        continue;
      }
      out2.push({ beats, beatType, bbox: unionRects([...g.left, g.slash, ...g.right].map((k) => k.bbox)) });
    }
    return out2;
  }
  function isNoteGlyph(b) {
    if (b.h < numH * 0.5 || b.h < b.w * 1.6) return false;
    const x0 = Math.round(b.x), x1 = Math.round(b.x + b.w), y0 = Math.round(b.y), y1 = Math.round(b.y + b.h);
    const inkW = (y) => {
      let n = 0;
      for (let x = x0; x < x1; x++) if (bin.data[y * bin.w + x]) n++;
      return n;
    };
    const avg = (ya, yb) => {
      let s = 0;
      for (let y = ya; y < yb; y++) s += inkW(y);
      return s / Math.max(1, yb - ya);
    };
    const h = y1 - y0;
    const top = avg(y0, y0 + Math.round(h * 0.5)), bottom = avg(y1 - Math.round(h * 0.3), y1);
    return top >= 1 && bottom >= top * 2 && bottom >= b.w * 0.5;
  }
  async function tempoByGlyphs() {
    if (!ocr.recognizeNumerals) return void 0;
    const pool = glyphPool(bin.w, 0, 4);
    const dbg = globalThis.__omrDebug;
    for (const eq of eqSigns(pool)) {
      const gapL = (k, edge) => edge - (k.bbox.x + k.bbox.w);
      const leftOf = (edge, maxGap) => pool.filter((k) => !isBar(k) && gapL(k, edge) >= -1 && gapL(k, edge) <= maxGap && rcyOf(eq) >= k.bbox.y && rcyOf(eq) <= k.bbox.y + k.bbox.h).sort((p, q) => gapL(p, edge) - gapL(q, edge))[0];
      const note = leftOf(eq.x, numH * 1.2);
      const nr = note ? note.bbox.x + note.bbox.w : 0;
      const dot = note && pool.find((k) => k !== note && k.bbox.w <= numH * 0.35 && k.bbox.h <= numH * 0.35 && k.bbox.w <= k.bbox.h * 1.8 && k.bbox.h <= k.bbox.w * 1.8 && k.bbox.x >= nr - 1 && k.bbox.x + k.bbox.w <= eq.x + 1 && rcyOf(k.bbox) >= note.bbox.y + note.bbox.h * 0.5 && rcyOf(k.bbox) <= note.bbox.y + note.bbox.h);
      const dotted = !!dot;
      if (note && (dot ? dot.bbox.x - nr > numH * 0.5 || eq.x - (dot.bbox.x + dot.bbox.w) > numH * 0.8 : eq.x - nr > numH * 0.8)) continue;
      if (dbg) console.log("[header/tempoEq]", `eq ${eq.x},${eq.y} ${eq.w}x${eq.h}`, note ? `note ${note.bbox.x},${note.bbox.y} ${note.bbox.w}x${note.bbox.h} ${isNoteGlyph(note.bbox)}` : "no-note", dotted ? "dotted" : "");
      if (!note || !isNoteGlyph(note.bbox)) continue;
      const digits = [];
      for (let edge = eq.x + eq.w; digits.length <= 3; ) {
        const ref = digits[0];
        const next = pool.filter((k) => !isBar(k) && k.bbox.x >= edge - 1 && k.bbox.h >= numH * 0.4 && (ref ? overlapRatioY(k.bbox, ref.bbox) >= 0.6 && Math.abs(k.bbox.h - ref.bbox.h) <= ref.bbox.h * 0.3 : rcyOf(eq) >= k.bbox.y && rcyOf(eq) <= k.bbox.y + k.bbox.h)).sort((p, q) => p.bbox.x - q.bbox.x)[0];
        if (!next || next.bbox.x - edge > (ref ? Math.max(4, ref.bbox.h * 0.6) : numH * 0.8)) break;
        digits.push(next);
        edge = next.bbox.x + next.bbox.w;
      }
      if (dbg) console.log("[header/tempoChain]", digits.map((k) => `${k.bbox.x},${k.bbox.y} ${k.bbox.w}x${k.bbox.h}`).join(" | "));
      if (digits.length < 2 || digits.length > 3) continue;
      const ds = await ocr.recognizeNumerals(bin, digits.map((k) => k.bbox));
      if (dbg) console.log("[header/tempoDigits]", ds.join(","));
      if (ds.some((d) => d === void 0)) continue;
      const bpm = Number(ds.join(""));
      if (bpm < 30 || bpm > 300) continue;
      return { bpm, beat: dotted ? { num: 3, den: 8 } : { num: 1, den: 4 }, bbox: unionRects([note.bbox, eq, ...digits.map((k) => k.bbox)]) };
    }
    return void 0;
  }
  async function keyByGlyphs(titleLine, slashes) {
    const xMax = titleLine ? titleLine.cx : bin.w / 2;
    const yMin = titleLine ? titleLine.bbox.y : 0, yMax = firstStaffTopY - numH * 0.1;
    const inMeter = (k) => !!geoMeters?.some((m) => overlapRatioX(m.bbox, k.bbox) > 0.5 && rcyOf(k.bbox) >= m.bbox.y && rcyOf(k.bbox) <= m.bbox.y + m.bbox.h);
    const pool = glyphPool(xMax, yMin);
    const dbg = globalThis.__omrDebug;
    const chain = (edge, dir, band, firstGap) => chainFrom(pool, edge, dir, band, firstGap, 4, inMeter);
    for (const eq of eqSigns(pool)) {
      for (const dir of [1, -1]) {
        const gapTo = (k2) => dir > 0 ? eq.x - (k2.bbox.x + k2.bbox.w) : k2.bbox.x - (eq.x + eq.w);
        const one = pool.filter((k2) => !isBar(k2) && gapTo(k2) >= -1 && gapTo(k2) <= numH && k2.bbox.h >= numH * 0.4 && rcyOf(eq) >= k2.bbox.y && rcyOf(eq) <= k2.bbox.y + k2.bbox.h && k2.bbox.w <= k2.bbox.h * 0.75).sort((p, q) => gapTo(p) - gapTo(q))[0];
        if (dbg) console.log("[header/keyEq]", dir > 0 ? "1=" : "=1", `eq ${eq.x},${eq.y} ${eq.w}x${eq.h}`, one ? `one ${one.bbox.x},${one.bbox.y} ${one.bbox.w}x${one.bbox.h}` : "no-one", `numH ${numH.toFixed(1)}`);
        if (!one) continue;
        const [d] = await ocr.recognizeDigits(bin, [one.bbox]);
        if (d !== 1 && one.bbox.w > one.bbox.h * 0.4) continue;
        const group = dir > 0 ? chain(eq.x + eq.w, 1, one.bbox, Math.max(numH, one.bbox.h)) : chain(eq.x, -1, one.bbox, Math.max(numH, one.bbox.h));
        const k = await readKeyGroup(group);
        if (k) return { ...k, bbox: unionRects([one.bbox, eq, k.bbox]) };
      }
    }
    const starts = [];
    for (const m of geoMeters ?? []) {
      if (rcyOf(m.bbox) < yMin || rcyOf(m.bbox) > yMax || m.bbox.x + m.bbox.w / 2 > xMax) continue;
      starts.push({ x: m.bbox.x, band: { x: m.bbox.x, y: m.bbox.y + m.bbox.h * 0.2, w: m.bbox.w, h: m.bbox.h * 0.6 }, what: `${m.beats}/${m.beatType}` });
    }
    for (const s of slashes) {
      const l = s.left[0], r = s.right[s.right.length - 1];
      starts.push({ x: l.bbox.x, band: unionRect(l.bbox, r.bbox), what: "slash" });
    }
    for (const st of starts.sort((a, b) => a.x - b.x)) {
      const group = chain(st.x, -1, st.band, numH);
      if (dbg) console.log("[header/keyMeter]", st.what, `@${st.x}`, group.length);
      const k = await readKeyGroup(group);
      if (k) return { ...k, viaMeter: true };
    }
    return void 0;
  }
  function spaceIfGap(text, at, ln, charAt = at) {
    const chars = ln.chars && ln.chars.length === [...text].filter((c) => c !== " ").length ? ln.chars : void 0;
    return gapWideAt(bin, ln.bbox, chars, charAt - 1) ? `${text.slice(0, at).trimEnd()} ${text.slice(at)}` : text;
  }
  async function standaloneNumber(tl, ls) {
    const sameRow = (b, h) => overlapRatioY(b, tl.bbox) >= 0.3 && h >= tl.charH * 0.5 && (b.x >= tl.bbox.x + tl.bbox.w || b.x + b.w <= tl.bbox.x);
    const sameRowDet = (b, h) => overlapRatioY(b, tl.bbox) >= 0.3 && h >= tl.charH * 0.5 && (b.x + b.w / 2 >= tl.bbox.x + tl.bbox.w || b.x + b.w / 2 <= tl.bbox.x);
    const byDist = (a, b) => Math.abs(a.x + a.w / 2 - tl.cx) - Math.abs(b.x + b.w / 2 - tl.cx);
    const det = ls.filter((l) => l !== tl && /^\s*\d{1,4}\s*[.．、]?\s*$/.test(l.text) && sameRowDet(l.bbox, l.charH)).sort((a, b) => byDist(a.bbox, b.bbox))[0];
    if (det) return { text: det.text.replace(/\D/g, ""), bbox: det.bbox };
    for (const l of ls) {
      if (l === tl || !sameRow(l.bbox, l.charH)) continue;
      const m = /^\s*(\d{1,4})\s*(?=[b#♭♯]?[A-G](?![a-z]))/.exec(l.text);
      if (!m || m[1].split("").some((_, i) => meterInkAt(l, i))) continue;
      const off = l.text.length - l.text.trimStart().length, k = off + m[1].length;
      const cs2 = l.chars && l.chars.length === l.text.length ? l.chars : void 0;
      const x1 = cs2 && k < cs2.length ? (cs2[k - 1].cx + cs2[k].cx) / 2 : l.bbox.x + l.bbox.w;
      return { text: m[1], bbox: { ...l.bbox, w: Math.max(1, x1 - l.bbox.x) } };
    }
    const inDet = (b) => ls.some((l) => overlapRatioX(b, l.bbox) > 0 && overlapRatioY(b, l.bbox) > 0);
    const cs = comps.filter((c) => sameRow(c.bbox, c.bbox.h) && !inDet(c.bbox)).sort((a, b) => a.bbox.x - b.bbox.x);
    const groups = [];
    for (const c of cs) {
      const g = groups[groups.length - 1], last = g?.[g.length - 1];
      if (last && c.bbox.x - (last.bbox.x + last.bbox.w) <= tl.charH * 0.5) g.push(c);
      else groups.push([c]);
    }
    const cands = groups.map((g) => ({ g, bbox: unionRects(g.map((k) => k.bbox)) })).filter(({ bbox }) => bbox.w <= tl.charH * 3.2).sort((a, b) => byDist(a.bbox, b.bbox));
    if (!cands.length) return void 0;
    const src2 = surfaceFromBinary(bin);
    const texts = await recognizeTexts(cands.map(({ g }) => buildStrip(src2, mergeToChars(g, tl.charH))));
    for (let i = 0; i < cands.length; i++) {
      const t2 = texts[i].trim();
      if (/^\d{1,4}$/.test(t2)) return { text: t2, bbox: cands[i].bbox };
    }
    return void 0;
  }
  function superscriptAccidental(ln) {
    if (!ln) return void 0;
    const t2 = ln.text.replace(/\s+/g, "");
    const m = /^([A-G])调/.exec(t2);
    const cs = ln.chars && ln.chars.length === ln.text.length ? ln.chars : void 0;
    if (!m || !cs) return void 0;
    const iTiao = ln.text.indexOf("调");
    const inLine = (b) => b.x >= ln.bbox.x - 1 && b.x + b.w <= ln.bbox.x + ln.bbox.w + 1 && overlapRatioY(b, ln.bbox) > 0.5;
    const mid = (cs[0].cx + cs[1].cx) / 2;
    const letter = comps.filter((c) => inLine(c.bbox) && c.cx >= ln.bbox.x && c.cx <= mid).sort((p, q) => q.bbox.h - p.bbox.h)[0];
    if (!letter) return void 0;
    const L = letter.bbox, lh = L.h;
    const x0 = Math.max(ln.bbox.x, L.x - lh * 0.6), x1 = cs[iTiao].cx - lh * 0.3;
    for (const c of comps) {
      const b = c.bbox;
      if (c === letter || b.x < x0 || b.x + b.w > x1 || b.h > lh * 0.9 || b.h < lh * 0.55 || b.w > lh * 0.5 || b.h < b.w) continue;
      if (b.y + b.h / 2 > L.y + L.h / 2 || b.y > L.y + lh * 0.3) continue;
      const kind = accidentalOf(bin, b);
      if (kind === "flat" || kind === "sharp") return kind;
    }
    return void 0;
  }
  function meterInkAt(ln, i) {
    const off = ln.text.length - ln.text.trimStart().length;
    const ch = ln.chars && ln.chars.length === ln.text.length ? ln.chars[off + i] : void 0;
    return !!ch && (geoMeters ?? []).some((m) => ch.cx >= m.bbox.x && ch.cx <= m.bbox.x + m.bbox.w && overlapRatioY(m.bbox, ln.bbox) > 0.5);
  }
  async function classify2(ls) {
    const creditRe = /^\s*[作詞词曲編编譯译]{1,2}(?:\s*[、，,/／]\s*[作詞词曲編编譯译]{1,2})*\s*[:：]/;
    const creditSuffixRe = /^\s*([一-鿿·]{2,4}?(?:\s*[、，,]\s*[一-鿿·]{2,4}?)*)\s*((?:[作編编]?[詞词曲])(?:\s*[、，,/／]?\s*(?:[作編编]?[詞词曲]))*)\s*$/;
    const creditRoleTailRe = /((?:[作編编]?[詞词曲])(?:\s*[、，,/／]?\s*(?:[作編编]?[詞词曲]))*)\s*$/;
    const latinNameRe = /^[A-Za-z][A-Za-z0-9 .,'’&·()（）\-]*$/;
    const creditYearRe = /^\s*[一-鿿·]{2,10}?\s*(?:合译|[作編编]?[詞词曲譯译])\s*\d{4}(?:\s*[-–—]\s*\d{4})?\s*$/;
    const latinParenRe = /^\s*[(（][A-Za-z][A-Za-z .'’\-]*[)）]\s*$/;
    const maxCharH = Math.max(0, ...ls.map((l) => l.charH));
    const effH = (l) => {
      const units = [...l.text].reduce((a, c) => a + (/[一-鿿]/.test(c) ? 1 : /[A-Za-z0-9]/.test(c) ? 0.6 : 0), 0);
      return units >= 2 && l.bbox.w / units < l.charH * 0.7 ? l.bbox.w / units : l.charH;
    };
    const creditAt = [];
    let titleLine = null;
    const rest = [];
    for (const ln of ls) {
      const txt = ln.text.trim();
      const sm = ln.charH < maxCharH ? creditSuffixRe.exec(txt) : null;
      if (sm && !creditRe.test(txt)) {
        const at = txt.length - sm[2].length;
        const cr = spaceIfGap(txt, at, ln);
        out.credits.push(cr);
        creditAt.push(ln.bbox);
        out.regions.push({ text: cr, bbox: ln.bbox, chars: charsForText(cr, ln.chars) });
        continue;
      }
      const lm = !sm && ln.charH < maxCharH && !creditRe.test(txt) ? creditRoleTailRe.exec(recoverSpacesByInk(bin, txt, ln.bbox, ln.chars)) : null;
      if (lm) {
        const name = lm.input.slice(0, lm.index).trim();
        if (latinNameRe.test(name) && /[A-Za-z]{2}/.test(name)) {
          const at = [...lm.input.slice(0, lm.index)].filter((c) => c !== " ").length;
          const cr = spaceIfGap(lm.input, lm.index, ln, at);
          out.credits.push(cr);
          creditAt.push(ln.bbox);
          out.regions.push({ text: cr, bbox: ln.bbox, chars: charsForText(cr, ln.chars) });
          continue;
        }
      }
      if (ln.charH < maxCharH && creditYearRe.test(txt)) {
        const t2 = recoverHanziGaps(bin, txt, ln.bbox, ln.chars);
        const yi = t2.search(/\d/);
        const cr = spaceIfGap(t2, yi, ln, [...t2.slice(0, yi)].filter((c) => c !== " ").length);
        probe("header.creditYear");
        out.credits.push(cr);
        creditAt.push(ln.bbox);
        out.regions.push({ text: cr, bbox: ln.bbox, chars: charsForText(cr, ln.chars) });
        continue;
      }
      if (ln.charH < maxCharH && latinParenRe.test(txt)) {
        const cr = recoverSpacesByInk(bin, txt, ln.bbox, ln.chars);
        probe("header.creditLatinParen");
        out.credits.push(cr);
        creditAt.push(ln.bbox);
        out.regions.push({ text: cr, bbox: ln.bbox, chars: charsForText(cr, ln.chars) });
        continue;
      }
      if (creditRe.test(txt)) {
        const m = txt.match(/^(.*?[:：])\s*([一-鿿·]+(?:\s*[、，,]\s*[一-鿿·]+)*)/);
        const credit = (m ? m[1] + m[2] : recoverSpacesByInk(bin, txt, ln.bbox, ln.chars)).replace(/\s*[:：]\s*/, "：");
        out.credits.push(credit);
        creditAt.push(ln.bbox);
        out.regions.push({ text: credit, bbox: ln.bbox, chars: charsForText(credit, ln.chars) });
        continue;
      }
      rest.push(ln);
      if (hanziCount(txt) < 2) continue;
      if (/[1１]\s*[=＝]/.test(txt)) continue;
      if (!titleLine) titleLine = ln;
      else if (effH(ln) > effH(titleLine) * 1.25) titleLine = ln;
      else if (effH(ln) >= effH(titleLine) * 0.85 && ln.bbox.w > titleLine.bbox.w) titleLine = ln;
    }
    if (creditAt.length > 1) {
      const base = out.credits.length - creditAt.length;
      const col = (b) => b.x + b.w / 2 > bin.w / 2 ? 1 : 0;
      const order = creditAt.map((b, i) => ({ b, i })).sort((p, q) => col(p.b) - col(q.b) || p.b.y - q.b.y || p.i - q.i);
      const cs = out.credits.slice(base);
      order.forEach(({ i }, k) => {
        out.credits[base + k] = cs[i];
      });
    }
    let numberBox;
    if (titleLine) {
      let t2 = recoverHanziGaps(bin, titleLine.text.trim(), titleLine.bbox, titleLine.chars);
      const pm = /^\s*(\d{1,4})\s*[.．、]?\s*(?=[一-鿿])/.exec(t2);
      if (pm) {
        t2 = t2.slice(pm[0].length);
        if (!pm[1].split("").some((_, i) => meterInkAt(titleLine, i))) {
          probe("number.prefix");
          out.number = pm[1];
          out.numberSide = "left";
        } else probe("number.meterInk");
      }
      out.title = t2.replace(/\s*《[^》]{0,8}》\s*\d{0,4}\s*$/, "");
      out.regions.push({ text: out.title, bbox: titleLine.bbox, chars: charsForText(out.title, titleLine.chars) });
      if (!out.number) {
        const n = await standaloneNumber(titleLine, ls);
        if (n) {
          probe("number.standalone");
          out.number = n.text;
          numberBox = n.bbox;
          out.numberSide = n.bbox.x + n.bbox.w / 2 < titleLine.cx ? "left" : "right";
          out.regions.push({ text: n.text, bbox: n.bbox });
        }
      }
    }
    const meta = parseMeta(ls);
    let subtitleLine;
    if (titleLine) {
      const tl = titleLine;
      const titleBox = numberBox ? unionRect(tl.bbox, numberBox) : tl.bbox;
      const titleCx = titleBox.x + titleBox.w / 2;
      const metaRe = /[1１]\s*[=＝]|[♩♪]|\d+\s*[/／]\s*\d+/;
      const chordRe = /^[A-G][#b♯♭]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\s*\/\s*[A-G][#b♯♭]?)?$/;
      const gapTitle = (l) => l.cy < tl.cy ? tl.bbox.y - l.cy : l.cy - (tl.bbox.y + tl.bbox.h);
      const cand = rest.filter((l) => l !== tl && l !== meta.fifthsLine && l !== meta.tempoLine).filter((l) => l.charH <= tl.charH * (hanziCount(l.text) ? 1.05 : 1.3)).filter((l) => Math.abs(l.cx - titleCx) <= titleBox.w * 0.35).filter((l) => gapTitle(l) < firstStaffTopY - l.cy).filter((l) => {
        const t2 = l.text.trim();
        return t2.length >= 2 && !metaRe.test(t2) && !chordRe.test(t2) && /[^\d\s.,:：、·]/.test(t2);
      }).sort((a, b) => gapTitle(a) - gapTitle(b))[0];
      if (cand) {
        subtitleLine = cand;
        probe("subtitle");
        out.subtitle = recoverSpacesByInk(bin, cand.text.trim(), cand.bbox, cand.chars);
        out.regions.push({ text: out.subtitle, bbox: cand.bbox, chars: charsForText(out.subtitle, cand.chars) });
      }
    }
    const slashes = slashGroups(glyphPool(titleLine ? titleLine.cx : bin.w / 2, titleLine ? titleLine.bbox.y : 0));
    const glyphSlash = await slashMeters(slashes);
    if (meta.fifths === void 0) {
      const ln = ls.find((l) => /^调\d/.test(l.text) && l.chars && l.chars.length === l.text.length);
      if (ln) {
        const tiao = ln.chars[0];
        const others = ls.filter((l) => l !== ln && !/^[A-G0Oo口日8εЕ€pP][b#h♭♯]?$/.test(l.text.trim()));
        const inOther = (c) => others.some((l) => c.cx >= l.bbox.x && c.cx <= l.bbox.x + l.bbox.w && c.cy >= l.bbox.y && c.cy <= l.bbox.y + l.bbox.h);
        const group = comps.filter((c) => c.cx >= ln.bbox.x - ln.bbox.h * 1.5 && c.bbox.x + c.bbox.w <= tiao.cx - 4 && overlapRatioY(c.bbox, ln.bbox) > 0.3 && c.bbox.h >= 8 && !inOther(c)).sort((a, b) => a.bbox.x - b.bbox.x);
        const maxH = Math.max(0, ...group.map((c) => c.bbox.h));
        while (group.length > 1 && group[group.length - 1].bbox.h < maxH * 0.5) group.pop();
        const k = group.length && group.length <= 4 ? await readKeyGroup(group, true) : void 0;
        if (k) {
          probe("key.letterBeforeTiao");
          meta.fifths = k.fifths;
          meta.fifthsLine = ln;
        }
      }
    }
    const textFifths = meta.fifths;
    let g = await keyByGlyphs(titleLine, slashes);
    if (g?.viaMeter && textFifths !== void 0 && textFifths !== g.fifths && /调/.test(meta.fifthsLine?.text ?? "")) {
      probe("key.textOverMeterGlyph");
      g = void 0;
    }
    const glyphKeyBox = g?.bbox;
    if (g) {
      probe("key.glyphs");
      meta.fifths = g.fifths;
    } else if (meta.fifths !== void 0) {
      probe("key.text");
      const acc = superscriptAccidental(meta.fifthsLine);
      const f2 = acc ? meta.fifths + (acc === "flat" ? -7 : 7) : NaN;
      if (f2 >= -7 && f2 <= 7) {
        probe("key.text.superAcc");
        meta.fifths = f2;
      }
    }
    if (globalThis.__keyGlyphProbe) {
      console.log("[keyProbe]", JSON.stringify({ text: textFifths ?? null, glyph: g?.fifths ?? null, bbox: g?.bbox ?? null, numH }));
    }
    const tg = await tempoByGlyphs();
    const glyphMeters = [
      ...geoMeters ?? [],
      ...glyphSlash.filter((m) => !geoMeters?.some((q) => overlapRatioX(q.bbox, m.bbox) > 0 && overlapRatioY(q.bbox, m.bbox) > 0))
    ].sort((a, b) => a.bbox.x - b.bbox.x);
    if (globalThis.__metaGlyphProbe) {
      const ms = (xs) => (xs ?? []).map((m) => `${m.beats}/${m.beatType}`).join(" ");
      console.log("[metaProbe]", JSON.stringify({
        textMeter: ms(meta.meters),
        glyphMeter: ms(glyphMeters),
        slash: ms(glyphSlash),
        textTempo: meta.tempo === void 0 ? null : `${meta.tempoDotted ? "3/8" : "1/4"}=${meta.tempo}`,
        glyphTempo: tg ? `${tg.beat.num}/${tg.beat.den}=${tg.bpm}` : null
      }));
    }
    out.fifths = meta.fifths;
    if (tg) {
      probe("tempo.glyphs");
      out.tempo = tg.bpm;
      if (tg.beat.den !== 4) out.tempoBeat = tg.beat;
    } else if (meta.tempo !== void 0) {
      probe("tempo.text");
      out.tempo = meta.tempo;
      if (meta.tempoDotted) out.tempoBeat = { num: 3, den: 8 };
    }
    out.beats = meta.beats;
    out.beatType = meta.beatType;
    out.meters = meta.meters;
    out.meterNote = meta.meterNote;
    const keyBox = glyphKeyBox ?? meta.fifthsLine?.bbox;
    if (meta.fifths !== void 0 && keyBox) out.regions.push({ text: `1=${fifthsToKey(meta.fifths)}`, bbox: keyBox });
    const tempoBox = tg?.bbox ?? meta.tempoLine?.bbox;
    if (out.tempo !== void 0 && tempoBox) out.regions.push({ text: `♩${out.tempoBeat ? "." : ""}=${out.tempo}`, bbox: tempoBox });
    const keyLine = ls.find((l) => /[1１]\s*[=＝]/.test(l.text));
    const keyRow = keyLine ? { cy: keyLine.cy, h: keyLine.charH } : glyphKeyBox ? { cy: glyphKeyBox.y + glyphKeyBox.h / 2, h: glyphKeyBox.h } : void 0;
    if (titleLine && keyRow && !out.credits.length) {
      for (const l of rest) {
        if (l === titleLine || l === subtitleLine || l === keyLine) continue;
        const t2 = l.text.trim();
        if (!/^[一-鿿]{2,8}$/.test(t2)) continue;
        if (l.bbox.x < bin.w * 0.6) continue;
        if (Math.abs(l.cy - keyRow.cy) > Math.max(l.charH, keyRow.h) * 0.6) continue;
        if (l.cy - titleLine.cy < titleLine.charH) continue;
        if (/^第.{1,6}[首篇章]$/.test(t2)) continue;
        out.credits.push(t2);
        out.regions.push({ text: t2, bbox: l.bbox, chars: charsForText(t2, l.chars) });
      }
    }
    if (glyphMeters.length > 0 && glyphMeters.length >= (meta.meters?.length ?? 0)) {
      probe(glyphMeters.length > (meta.meters?.length ?? 0) ? "meter.geoMore" : "meter.geoTie");
      if (glyphSlash.length) probe("meter.slash");
      out.meters = glyphMeters.map((m) => ({ beats: m.beats, beatType: m.beatType }));
      out.beats = glyphMeters[0].beats;
      out.beatType = glyphMeters[0].beatType;
      out.meterNote ??= ls.map((l) => /([一-鿿]{1,4}拍)\s*(?:[♩♪Jj]?\s*[=＝]\s*\d{1,3})?\s*$/.exec(l.text.trim())?.[1]).find(Boolean);
      const bbox = glyphMeters.map((m) => m.bbox).reduce((a, b) => unionRect(a, b));
      out.regions.push({ text: out.meters.map((m) => `${m.beats}/${m.beatType}`).join(" "), bbox });
      return;
    }
    if (meta.timeBBox && meta.meters?.length) {
      const text = meta.meters.map((m) => `${m.beats}/${m.beatType}`).join(" ") + (meta.meterNote ? ` ${meta.meterNote}` : "");
      out.regions.push({ text, bbox: meta.timeBBox });
    }
  }
}
const isHanzi = (c) => /[一-鿿]/.test(c);
const isLatin = (c) => /[A-Za-z']/.test(c);
const CN_LABELS = [...CN_NUM, ...[...CN_NUM.slice(0, 9)].map((c) => "十" + c), "二十"];
const CN_LABEL_ALT = `二十|十[${CN_NUM.slice(0, 9)}]|[${CN_NUM}]`;
const LABEL_ONLY_RE = new RegExp(`^[(（]?(${CN_LABEL_ALT}|\\d{1,2})[)）]?[.、．。:：]?$`);
const LABEL_PREFIX_RE = new RegExp(`^[(（]?(${CN_LABEL_ALT}|\\d{1,2})[)）]?[.、．](?=.)`);
const COUNT_TOL = 2;
function toSyllables(text) {
  const out = [];
  let lead = "", pend = "";
  const flush = () => {
    if (pend) {
      out.push(lead + pend);
      lead = "";
      pend = "";
    }
  };
  for (const ch of text) {
    if (isHanzi(ch)) {
      flush();
      out.push(lead + ch);
      lead = "";
    } else if (isLatin(ch)) pend += ch;
    else if (ch === "-") {
      if (pend) {
        pend += "-";
        flush();
      }
    } else if (/\s/.test(ch)) flush();
    else if (LYRIC_QUOTE_OPEN.test(ch) && !pend) lead += normPunct(ch);
    else if (LYRIC_PUNCT.test(ch) || LYRIC_QUOTE_CLOSE.test(ch)) {
      if (pend) pend += normPunct(ch);
      else if (out.length) out[out.length - 1] += normPunct(ch);
    }
  }
  flush();
  return out;
}
async function recognizeTrailingStanzas(bin, staff, numH, ocr, lyricRegions) {
  if (!ocr.recognizeRegion) return [];
  const rows = staff.filter((r) => r.nums.length);
  if (!rows.length) return [];
  const tops = rows.map((r) => r.topY);
  const pitch = tops.length >= 2 ? median(tops.slice(1).map((t2, j) => t2 - tops[j])) : 0;
  const segs = [[]];
  rows.forEach((r, i) => {
    if (i > 0 && pitch > 0 && r.system === void 0 && r.topY - rows[i - 1].topY > pitch * 3) segs.push([]);
    segs[segs.length - 1].push(r);
  });
  if (segs.length > 1) probe("stanza.segments");
  const out = [];
  for (let k = 0; k < segs.length; k++) {
    const next = segs[k + 1]?.[0];
    const y1 = next ? Math.round(next.topY - numH * 0.5) : bin.h;
    out.push(...await stanzasOfSegment(bin, segs[k], numH, ocr, lyricRegions, y1));
  }
  return out;
}
async function stanzasOfSegment(bin, rows, numH, ocr, lyricRegions, yEnd) {
  const last = rows[rows.length - 1];
  if (!last || !ocr.recognizeRegion) return [];
  const slots = rows.flatMap((r) => r.nums.filter((n) => n.lyrics?.[0]));
  if (slots.length < 8) return [];
  const below = (lyricRegions ?? []).filter((r) => r.bbox.y >= last.bottomY - numH * 0.2 && r.bbox.y < yEnd);
  const y0 = Math.round((below.length ? Math.max(...below.map((r) => rbottom(r.bbox))) : last.bottomY + numH) + numH * 0.3);
  const rule = ruleBelow(bin, y0, yEnd);
  if (rule !== void 0) {
    probe("stanza.ruleCut");
    yEnd = rule;
  }
  if (yEnd - y0 < numH * 2) return [];
  let dets = (await ocr.recognizeRegion(bin, { x: 0, y: y0, w: bin.w, h: yEnd - y0 })).map((d) => ({ text: d.text.trim(), bbox: d.bbox })).filter((d) => d.text);
  const bands = inkBands(bin, y0, yEnd);
  const bandH = median(bands.map((b) => b[1] - b[0]));
  const tallShare = dets.filter((d) => d.bbox.h > bandH * 1.6).length / Math.max(1, dets.length);
  const singleShare = dets.filter((d) => [...d.text].length === 1).length / Math.max(1, dets.length);
  if (bands.length >= 2 && bandH > 0 && (tallShare >= 0.3 || dets.length >= 20 && singleShare >= 0.5)) {
    probe("stanza.bandRedet");
    dets = [];
    for (const [a, b] of bands) {
      const pad = 2, ya = Math.max(y0, a - pad), yb = Math.min(yEnd, b + pad);
      dets.push(...(await ocr.recognizeRegion(bin, { x: 0, y: ya, w: bin.w, h: yb - ya })).map((d) => ({ text: d.text.trim(), bbox: d.bbox })).filter((d) => d.text));
    }
  }
  if (globalThis.__omrDebug) {
    console.log("[stanzas/det]", dets.map((d) => `${Math.round(d.bbox.h)}px@${Math.round(d.bbox.x)},${Math.round(d.bbox.y)}w${Math.round(d.bbox.w)}=${JSON.stringify(d.text)}`).join("  "));
  }
  const allChars = dets.flatMap((d) => [...d.text]).filter((c) => /[\p{L}\p{N}]/u.test(c));
  if (allChars.filter(isHanzi).length >= allChars.length * 0.8) {
    const midLine = (d) => dets.some((o) => o !== d && o.bbox.x < d.bbox.x && [...o.text].some(isHanzi) && Math.min(rbottom(o.bbox), rbottom(d.bbox)) - Math.max(o.bbox.y, d.bbox.y) >= Math.min(o.bbox.h, d.bbox.h) * 0.5);
    dets = dets.filter((d) => [...d.text].some(isHanzi) || [...d.text].length > 2 || !midLine(d));
  }
  if (!dets.length) return [];
  dets.sort((a, b) => a.bbox.y - b.bbox.y);
  const vlines = [];
  for (const d of dets) {
    const cy = (b) => b.y + b.h / 2;
    const ln = vlines.find((l) => l.some((o) => Math.abs(cy(o.bbox) - cy(d.bbox)) < Math.min(o.bbox.h, d.bbox.h) * 0.5));
    if (ln) ln.push(d);
    else vlines.push([d]);
  }
  vlines.sort((a, b) => Math.min(...a.map((d) => d.bbox.y)) - Math.min(...b.map((d) => d.bbox.y)));
  const lineText = (l) => [...l].sort((a, b) => a.bbox.x - b.bbox.x).map((d) => d.text).join("");
  const labelLine = (l) => {
    const t2 = lineText(l);
    return LABEL_ONLY_RE.test(t2.slice(0, 2)) || LABEL_PREFIX_RE.test(t2) || /^[(（]?\d{1,2}[)）]?$/.test(t2);
  };
  const noteAt = vlines.findIndex((l, i) => {
    const t2 = lineText(l);
    return /^[(（](?:\d{1,4}[)）]|唱|注)/.test(t2) || /^[(（].*[)）]$/.test(t2) && !vlines.slice(i + 1).some(labelLine) || /[(（]第.{1,3}调[)）]|调\s*\d{1,2}\s*[/／]\s*\d{1,2}/.test(t2);
  });
  if (noteAt >= 0) {
    probe("stanza.footnoteCut");
    vlines.length = noteAt;
  }
  const ordered = vlines.flatMap((l, vi) => l.sort((a, b) => a.bbox.x - b.bbox.x).map((d, i) => ({ ...d, lineStart: i === 0, lineLen: l.length, vi })));
  const lineH = median(dets.map((d) => d.bbox.h)) || numH;
  const stanzas = [];
  let cur = null;
  let prevBottom = -Infinity;
  const nextLabel = () => {
    if (!stanzas.length) return CN_LABELS[1];
    const k = cur?.label ? CN_LABELS.indexOf(cur.label) : stanzas.length;
    return k >= 0 && k + 1 < CN_LABELS.length ? CN_LABELS[k + 1] : void 0;
  };
  const labeled = ordered.some((d) => d.lineStart && (LABEL_ONLY_RE.test(d.text) || LABEL_PREFIX_RE.test(d.text)));
  const textColX = median(vlines.map((l) => l.find((d) => [...d.text].length > 2)?.bbox.x).filter((x) => x !== void 0));
  for (const d of ordered) {
    const nl = nextLabel();
    const inLabelCol = !textColX || d.bbox.x + d.bbox.w / 2 < textColX;
    const only = LABEL_ONLY_RE.exec(d.text) ?? (labeled && d.lineStart && d.lineLen > 1 && [...d.text].length <= 2 && nl && inLabelCol ? [d.text, nl] : null);
    const glued = !only && d.lineStart && nl && d.text.length > nl.length && d.text.startsWith(nl) ? [nl, nl] : null;
    const pre = only ? null : LABEL_PREFIX_RE.exec(d.text) ?? glued;
    if (glued && pre === glued) probe("stanza.gluedLabel");
    const gapBreak = !labeled && d.lineStart && d.bbox.y - prevBottom > lineH * 1.2;
    prevBottom = d.lineStart ? rbottom(d.bbox) : Math.max(prevBottom, rbottom(d.bbox));
    if (only) {
      const curLabel = cur?.label;
      const back = !!curLabel && CN_LABELS.includes(only[1]) && CN_LABELS.indexOf(only[1]) <= CN_LABELS.indexOf(curLabel);
      stanzas.push(cur = { label: back && nl ? nl : only[1], lines: [] });
      continue;
    }
    if (pre) {
      stanzas.push(cur = { label: pre[1], lines: [{ text: d.text.slice(pre[0].length), bbox: d.bbox, vi: d.vi }] });
      continue;
    }
    if (!cur || gapBreak && cur.lines.length) stanzas.push(cur = { lines: [] });
    cur.lines.push({ text: d.text, bbox: d.bbox, vi: d.vi });
  }
  const kept = stanzas.filter((s) => s.lines.length);
  const sylls = kept.map((s) => toSyllables(s.lines.map((l) => l.text).join("")));
  const lineSylls = kept.map((s) => [...new Set(s.lines.map((l) => l.vi))].map((vi) => toSyllables(s.lines.filter((l) => l.vi === vi).map((l) => l.text).join(""))));
  const cum = [];
  rows.reduce((a, r) => {
    const v = a + r.nums.filter((n) => n.lyrics?.[0]).length;
    cum.push(v);
    return v;
  }, 0);
  const tol = (n) => Math.max(COUNT_TOL, Math.round(n * 0.15));
  const cands = [slots.length, ...[...cum].reverse().filter((c) => c >= 8 && c < slots.length)];
  const spans = sylls.map((sy) => cands.filter((c) => Math.abs(sy.length - c) <= tol(c)).sort((a, b) => Math.abs(sy.length - a) - Math.abs(sy.length - b) || b - a)[0] ?? 0);
  while (spans.length > 1 && !spans[spans.length - 1] && spans.slice(0, -1).some((c) => c)) {
    probe("stanza.dropTail");
    spans.pop();
    sylls.pop();
    lineSylls.pop();
  }
  if (!sylls.length || spans.some((c) => !c)) {
    if (sylls.length) probe("stanza.rejected");
    return [];
  }
  if (spans.some((c) => c < slots.length)) probe("stanza.versePrefix");
  const base = Math.max(1, ...rows.flatMap((r) => r.nums.map((n) => n.lyrics?.length ?? 0)));
  const rowSlots = rows.map((r) => r.nums.filter((n) => n.lyrics?.[0])).filter((x) => x.length);
  sylls.forEach((sy, k) => {
    const v = base + k, S = spans[k];
    const ls = lineSylls[k];
    if (S === slots.length && ls.length === rowSlots.length && ls.every((l, i) => Math.abs(l.length - rowSlots[i].length) <= COUNT_TOL)) {
      probe("stanza.perRow");
      rowSlots.forEach((rs, i) => rs.forEach((n, j) => {
        (n.lyrics ??= [])[v] = ls[i][j] ?? "";
      }));
      return;
    }
    if (sy.length !== S) probe("stanza.countMismatch");
    slots.slice(0, S).forEach((n, i) => {
      (n.lyrics ??= [])[v] = sy[i] ?? "";
    });
  });
  probe("stanza");
  return stanzas.flatMap((s) => s.lines.map((l) => ({ text: l.text, bbox: l.bbox })));
}
function inkBands(bin, y0, y1) {
  const out = [];
  let start = -1;
  for (let y = Math.max(0, y0); y <= Math.min(bin.h, y1); y++) {
    let ink = false;
    if (y < Math.min(bin.h, y1)) {
      for (let x = 0, o = y * bin.w; x < bin.w; x++) if (bin.data[o + x]) {
        ink = true;
        break;
      }
    }
    if (ink && start < 0) start = y;
    else if (!ink && start >= 0) {
      if (y - start >= 3) out.push([start, y]);
      start = -1;
    }
  }
  return out;
}
function ruleBelow(bin, y0, y1) {
  for (let y = Math.max(0, y0); y < Math.min(bin.h, y1); y++) {
    let run = 0, best = 0;
    for (let x = 0, o = y * bin.w; x < bin.w; x++) {
      if (bin.data[o + x]) {
        if (++run > best) best = run;
      } else run = 0;
    }
    if (best >= bin.w * 0.5) return y;
  }
  return void 0;
}
const between = (v, lo, hi) => v >= lo && v <= hi;
function flatBottomShare(bin, b) {
  let cols = 0, onBase = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    let low = -1;
    for (let y = b.y + b.h - 1; y >= b.y; y--) if (bin.data[y * bin.w + x]) {
      low = y;
      break;
    }
    if (low < 0) continue;
    cols++;
    if (low >= b.y + b.h - 2) onBase++;
  }
  return cols ? onBase / cols : 0;
}
function flatTop(bin, b, numH) {
  const topAt = (x) => {
    let y = b.y;
    while (y < b.y + b.h && !bin.data[y * bin.w + x]) y++;
    return y;
  };
  const dx = Math.round(b.w * 0.08);
  return topAt(b.x + dx) - b.y <= numH * 0.15 && topAt(b.x + b.w - 1 - dx) - b.y <= numH * 0.15;
}
function splitNestedArcs(bin, a, numH, mask = []) {
  const x1 = a.x + a.w, y1 = a.y + a.h;
  const masked = (x, y) => mask.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
  const runsAt = (x) => {
    const runs = [];
    let s = -1;
    for (let y = a.y; y < y1; y++) {
      if (bin.data[y * bin.w + x] && !masked(x, y)) {
        if (s < 0) s = y;
      } else if (s >= 0) {
        runs.push([s, y - 1]);
        s = -1;
      }
    }
    if (s >= 0) runs.push([s, y1 - 1]);
    return runs;
  };
  const cols = /* @__PURE__ */ new Map();
  for (let x = a.x; x < x1; x++) cols.set(x, runsAt(x));
  const mergedAt = (x) => {
    const r = cols.get(x);
    if (!r || r.length < 2) return false;
    return r[r.length - 1][0] - r[r.length - 2][1] <= Math.max(3, numH * 0.12);
  };
  const innerOf = (lo2, hi2) => {
    const len = hi2 - lo2 + 1;
    if (len < Math.max(6, numH * 0.25)) return null;
    let ix0 = hi2, ix1 = lo2, iy0 = y1, iy1 = a.y, thick = 0, topLo = y1, topHi = a.y;
    let cnt = 0, prevTop = -1, prevX = -2, smooth = true;
    for (let x = lo2; x <= hi2; x++) {
      const r = cols.get(x);
      if (r.length < 2) continue;
      const [s, e] = r[r.length - 1];
      cnt++;
      if (x === prevX + 1 && Math.abs(s - prevTop) > 3) smooth = false;
      prevTop = s;
      prevX = x;
      if (x < ix0) ix0 = x;
      if (x > ix1) ix1 = x;
      if (s < iy0) iy0 = s;
      if (e > iy1) iy1 = e;
      if (s < topLo) topLo = s;
      if (s > topHi) topHi = s;
      if (e - s + 1 > thick) thick = e - s + 1;
    }
    const rise = topHi - topLo;
    if (!smooth || cnt < len * 0.8) return null;
    if (thick > numH * 0.3) return null;
    if (rise < Math.max(3, Math.min(numH * 0.15, len * 0.3))) return null;
    if (!mergedAt(lo2) && !mergedAt(hi2)) return null;
    if (mergedAt(lo2)) {
      ix0 = a.x;
      iy1 = y1 - 1;
    }
    if (mergedAt(hi2)) {
      ix1 = x1 - 1;
      iy1 = y1 - 1;
    }
    const inner = { x: ix0, y: iy0, w: ix1 - ix0 + 1, h: iy1 - iy0 + 1 };
    if (inner.w < numH * 0.8) return null;
    if (inner.w >= a.w * 0.95) return null;
    return inner;
  };
  const spans = [];
  let lo = -1, hi = -1, gap = 0;
  for (let x = a.x; x < x1; x++) {
    if (cols.get(x).length >= 2) {
      if (lo < 0) lo = x;
      hi = x;
      gap = 0;
    } else if (lo >= 0 && ++gap > 2) {
      spans.push([lo, hi]);
      lo = -1;
      gap = 0;
    }
  }
  if (lo >= 0) spans.push([lo, hi]);
  const lowerTop = (x) => {
    const r = cols.get(x);
    return r.length >= 2 ? r[r.length - 1][0] : null;
  };
  const cuspOf = (l, h) => {
    const len = h - l + 1;
    let cx = -1, cy = -1;
    for (let x = l + Math.floor(len * 0.25); x <= h - Math.floor(len * 0.25); x++) {
      const t2 = lowerTop(x);
      if (t2 !== null && t2 > cy) {
        cy = t2;
        cx = x;
      }
    }
    if (cx < 0) return null;
    let lt = Infinity, rt = Infinity;
    for (let x = l; x < cx; x++) {
      const t2 = lowerTop(x);
      if (t2 !== null) lt = Math.min(lt, t2);
    }
    for (let x = cx + 1; x <= h; x++) {
      const t2 = lowerTop(x);
      if (t2 !== null) rt = Math.min(rt, t2);
    }
    const need = Math.max(3, numH * 0.15);
    return cy - lt >= need && cy - rt >= need ? cx : null;
  };
  const inners = spans.flatMap(([l, h]) => {
    const whole = innerOf(l, h);
    if (whole) return [whole];
    const cx = cuspOf(l, h);
    if (cx === null) return [];
    probe("nestedArc.cusp");
    return [innerOf(l, cx), innerOf(cx, h)];
  }).filter((r) => r !== null);
  for (let i = 0; i < inners.length; i++) probe(inners.length > 1 ? "nestedArc.multi" : "nestedArc");
  return [a, ...inners];
}
function tupletCandidates(bin, comps, rows, numH) {
  const out = [];
  const inkFill2 = (b) => {
    let ink = 0;
    for (let y = b.y; y < rbottom(b); y++)
      for (let x = b.x; x < rright(b); x++) if (bin.data[y * bin.w + x]) ink++;
    return ink / Math.max(1, b.w * b.h);
  };
  for (const row of rows) {
    if (row.nums.length < 2) continue;
    const rowTop = median(row.nums.map((n) => n.bbox.y));
    const above = comps.filter((c) => rbottom(c.bbox) <= rowTop + numH * 0.1 && rbottom(c.bbox) >= rowTop - numH * 2.2);
    for (const num of above) {
      const nb = num.bbox;
      if (nb.h < numH * 0.35 || nb.h > numH * 0.8) continue;
      const r = nb.w / nb.h;
      if (r < 0.4 || r > 1.3) continue;
      if (inkFill2(nb) < 0.35) continue;
      const arcAt = (side) => above.find((c) => {
        const b = c.bbox;
        if (b === nb || b.w < numH * 0.5 || b.h > numH * 0.9) return false;
        const gap = side < 0 ? nb.x - rright(b) : b.x - rright(nb);
        if (gap < -numH * 0.15 || gap > numH * 0.6) return false;
        if (rbottom(b) < nb.y || b.y > rbottom(nb)) return false;
        return inkFill2(b) <= 0.5;
      });
      const left = arcAt(-1), right = arcAt(1);
      if (!left || !right) continue;
      const x0 = Math.min(left.bbox.x, nb.x), x1 = Math.max(rright(right.bbox), rright(nb));
      const notes = row.nums.filter((n) => between(rcx(n.bbox), x0 - numH * 0.5, x1 + numH * 0.5));
      if (notes.length < 2) continue;
      out.push({ numeral: nb, arcs: [left, right], notes });
    }
  }
  return out;
}
function fitEnds(nums, a, numH) {
  let best = null;
  for (let i = 0; i < nums.length; i++) {
    const dL = a.x - rcx(nums[i].bbox);
    if (Math.abs(dL) > numH * 1.2) continue;
    for (let j = i + 1; j < nums.length; j++) {
      const dR = rright(a) - rcx(nums[j].bbox);
      if (Math.abs(dR) > numH * 1.2) continue;
      const cost = Math.abs(dR - dL) + Math.abs(dL + dR) / 2;
      if (!best || cost < best[2]) best = [i, j, cost];
    }
  }
  return best ? nums.slice(best[0], best[1] + 1) : null;
}
function markArc(nums, covered, d) {
  const start = covered[0], stop = covered[covered.length - 1];
  const sameIdx = nums.indexOf(start) + 1 === nums.indexOf(stop);
  const samePitch = start.digit === stop.digit && start.octave === stop.octave && start.digit !== 0 && start.digit !== RHYTHM_DIGIT;
  if (covered.length === 2 && sameIdx && samePitch) {
    if (d > 0) {
      probe("tie");
      start.tieStart = true;
      stop.tieStop = true;
    } else {
      start.tieStart = void 0;
      stop.tieStop = void 0;
    }
  } else {
    if (d > 0) probe("slur");
    start.slurStart = (start.slurStart ?? 0) + d || void 0;
    stop.slurStop = (stop.slurStop ?? 0) + d || void 0;
  }
}
const melismaShaped = (ns) => ns.length >= 2 && !!ns[0].lyrics?.some((t2) => t2) && ns.slice(1).every((n) => !n.lyrics?.some((t2) => t2));
function resolveSlurRefits(refits) {
  for (const { nums, covered, fit } of refits) {
    if (!melismaShaped(fit) || melismaShaped(covered)) continue;
    probe("slur.refitByLyrics");
    if (covered.length >= 2) markArc(nums, covered, -1);
    markArc(nums, fit, 1);
  }
}
function detectSlurs(bin, comps, rows, numH) {
  const refits = [];
  const arcsOf = (row) => {
    const rowTop = median(row.nums.map((n) => n.bbox.y));
    const arcs = comps.filter((c) => {
      const b = c.bbox;
      if (b.w >= numH * 6 && b.w / b.h >= 12 && flatTop(bin, b, numH)) {
        probe("arc.endingBracketReject");
        return false;
      }
      const maxH = b.w > numH * 3 ? numH * 1.6 : numH * 1.05;
      if (b.w < numH * 0.7 || b.h < 2 || b.h > maxH) return false;
      if (b.w / b.h < (b.h > numH * 1.05 ? 4 : 1.8)) return false;
      if (!between(rbottom(b), rowTop - numH * 1.2, rowTop + numH * (isRejoinedArc(c) ? 0.5 : 0.25))) return false;
      if (rows.some((o) => o !== row && o.nums.length && between(rcy(b), o.topY, o.bottomY))) return false;
      const crossesBar = row.barlineXs.some((x) => x > b.x + 2 && x < rright(b) - 2);
      const underDot = comps.some((o) => o.bbox.w <= numH * 0.45 && o.bbox.h <= numH * 0.45 && rbottom(o.bbox) <= b.y + 1 && o.bbox.y >= b.y - numH * 0.6 && rcx(o.bbox) >= b.x && rcx(o.bbox) <= rright(b));
      if (row.voice !== void 0 && !crossesBar && !underDot && b.h <= c.area / b.w * 2.2 && flatTop(bin, b, numH)) {
        probe("arc.straightInVoices");
        return false;
      }
      if (b.h >= numH * 0.4 && flatBottomShare(bin, b) >= 0.5) {
        probe("arc.flatBottomReject");
        return false;
      }
      const hanzi = comps.some((o) => o !== c && o.bbox.h >= numH * 0.5 && o.bbox.w < o.bbox.h * 1.8 && o.bbox.y < b.y && rbottom(o.bbox) >= b.y - numH * 0.1 && overlapX(o.bbox, b) >= b.w * 0.5);
      if (hanzi) probe("arc.hanziReject");
      return !hanzi;
    });
    return arcs;
  };
  const perRow = rows.map((row) => row.nums.length ? arcsOf(row) : []);
  const crossed = /* @__PURE__ */ new Set();
  const coveredBy = (row, b) => row.nums.filter((n) => between(rcx(n.bbox), b.x - numH * 0.5, rright(b) + numH * 0.5));
  for (let i = 0; i + 1 < rows.length; i++) {
    const row = rows[i], next = rows[i + 1];
    if (!row.nums.length || !next.nums.length) continue;
    const rowRight = Math.max(...row.barlineXs, ...row.nums.map((n) => rright(n.bbox)));
    const open = perRow[i].find((c) => rright(c.bbox) >= rowRight - numH * 0.3 && coveredBy(row, c.bbox).length);
    const head = perRow[i + 1].find((c) => c.bbox.x <= next.nums[0].bbox.x && coveredBy(next, c.bbox).length);
    if (!open || !head) continue;
    const start = coveredBy(row, open.bbox)[0];
    const stopList = coveredBy(next, head.bbox);
    probe("slur.crossRow");
    start.slurStart = (start.slurStart ?? 0) + 1;
    const stop = stopList[stopList.length - 1];
    stop.slurStop = (stop.slurStop ?? 0) + 1;
    crossed.add(open);
    crossed.add(head);
  }
  rows.forEach((row, ri) => {
    if (row.nums.length < 2) return;
    const dotsIn = (b) => comps.filter((o) => o.bbox.w <= numH * 0.45 && o.bbox.h <= numH * 0.45 && o.bbox.x >= b.x && rright(o.bbox) <= rright(b) && o.bbox.y >= b.y && rbottom(o.bbox) <= rbottom(b)).map((o) => o.bbox);
    for (const c of perRow[ri].filter((c2) => !crossed.has(c2))) {
      const seen = /* @__PURE__ */ new Set();
      for (const a of splitNestedArcs(bin, c.bbox, numH, dotsIn(c.bbox))) {
        let covered = row.nums.filter((n) => between(rcx(n.bbox), a.x - numH * 0.5, rright(a) + numH * 0.5));
        if (covered.length < 2 && isRejoinedArc(c)) {
          const f = fitEnds(row.nums, a, numH);
          if (f && f.length >= 2) {
            probe("slur.rejoinedFit");
            covered = f;
          }
        }
        const key = covered.length ? `${row.nums.indexOf(covered[0])}-${row.nums.indexOf(covered[covered.length - 1])}` : "";
        if (key && seen.has(key)) {
          probe("slur.duplicateLayer");
          continue;
        }
        seen.add(key);
        const fit = fitEnds(row.nums, a, numH);
        if (fit && (fit[0] !== covered[0] || fit[fit.length - 1] !== covered[covered.length - 1])) {
          refits.push({ nums: row.nums, covered, fit });
        }
        if (covered.length < 2) continue;
        markArc(row.nums, covered, 1);
      }
    }
  });
  return refits;
}
function detectRepeatBarlines(dots, rows, numH) {
  for (const row of rows) {
    if (!row.nums.length || !row.barlineXs.length) continue;
    const midY = median(row.nums.map((n) => rcy(n.bbox)));
    const rowDots = dots.filter((d) => Math.abs(rcy(d.bbox) - midY) <= numH * 1.1);
    const used = /* @__PURE__ */ new Set();
    for (let i = 0; i < rowDots.length; i++) {
      const a = rowDots[i];
      if (used.has(a)) continue;
      let mate;
      for (let j = i + 1; j < rowDots.length; j++) {
        const b = rowDots[j];
        if (used.has(b)) continue;
        const dy = Math.abs(rcy(a.bbox) - rcy(b.bbox));
        const pairX = (rcx(a.bbox) + rcx(b.bbox)) / 2;
        const overlapsNote = row.nums.some((n) => Math.abs(rcx(n.bbox) - pairX) < numH * 0.4);
        if (!overlapsNote && Math.abs(rcx(a.bbox) - rcx(b.bbox)) <= numH * 0.35 && dy >= numH * 0.35 && dy <= numH * 1.4) {
          mate = b;
          break;
        }
      }
      if (!mate) continue;
      const colonX = (rcx(a.bbox) + rcx(mate.bbox)) / 2;
      const barX = row.barlineXs.reduce((best, x) => Math.abs(x - colonX) < Math.abs(best - colonX) ? x : best, row.barlineXs[0]);
      if (Math.abs(barX - colonX) > numH * 1.2) continue;
      used.add(a);
      used.add(mate);
      if (colonX < barX) {
        const prev = [...row.nums].reverse().find((n) => rcx(n.bbox) < barX);
        if (prev) {
          probe("repeat.backward");
          prev.repeatBackward = true;
        }
      } else {
        const next = row.nums.find((n) => rcx(n.bbox) > barX);
        if (next) {
          probe("repeat.forward");
          next.repeatForward = true;
        }
      }
    }
  }
}
function hasLeftHook(bin, b, numH) {
  const need = Math.max(2, Math.round(numH * 0.35));
  for (let x = b.x; x <= Math.min(bin.w - 1, b.x + Math.max(1, Math.round(numH * 0.25))); x++) {
    let run = 0;
    for (let y = b.y; y < Math.min(bin.h, b.y + numH * 1.6); y++) {
      if (bin.data[y * bin.w + x]) {
        if (++run >= need) return true;
      } else run = 0;
    }
  }
  return false;
}
function endingCandidates(bin, comps, rows, numH) {
  const out = [];
  for (const row of rows) {
    if (!row.nums.length) continue;
    const rowTop = median(row.nums.map((n) => n.bbox.y));
    const nx0 = row.nums[0].bbox.x, nx1 = rright(row.nums[row.nums.length - 1].bbox);
    const runs = [];
    const prevBottom = Math.max(-Infinity, ...rows.filter((r) => r !== row && r.bottomY < row.topY).map((r) => r.bottomY));
    const y0 = Math.max(0, Math.floor(rowTop - numH * 3.4), Math.ceil(prevBottom + numH * 0.5));
    const y1 = Math.min(bin.h - 1, Math.ceil(rowTop - numH * 0.3));
    for (let y = y0; y <= y1; y++) {
      let start = -1, lastInk = -1;
      for (let x = 0; x <= bin.w; x++) {
        const ink = x < bin.w && !!bin.data[y * bin.w + x];
        if (ink) {
          if (start < 0) start = x;
          lastInk = x;
        }
        if (start >= 0 && (!ink && x - lastInk > 1 || x === bin.w)) {
          const w = lastInk - start + 1;
          const overlap = Math.max(0, Math.min(lastInk + 1, nx1) - Math.max(start, nx0));
          if (w >= numH * 6 && overlap >= Math.min(w, nx1 - nx0) * 0.5) runs.push({ x: start, y, w, h: 1 });
          start = -1;
          lastInk = -1;
        }
      }
    }
    runs.sort((a, b) => b.w - a.w);
    const unique = [];
    for (const r of runs) {
      const duplicate = unique.some((u) => {
        const ov = Math.max(0, Math.min(rright(r), rright(u)) - Math.max(r.x, u.x));
        return ov >= Math.min(r.w, u.w) * 0.8 && Math.abs(r.y - u.y) <= 3;
      });
      if (!duplicate) unique.push(r);
    }
    for (const b of unique) {
      if (!hasLeftHook(bin, b, numH)) continue;
      const near = comps.filter((c) => rcx(c.bbox) >= b.x - numH * 0.1 && rcx(c.bbox) <= b.x + numH * 5 && rcy(c.bbox) >= b.y - numH * 0.2 && rcy(c.bbox) <= b.y + numH * 0.9 && c.bbox.h >= numH * 0.18 && c.bbox.h <= numH * 0.9 && c.bbox.w <= numH * 0.9).sort((a, z) => a.bbox.x - z.bbox.x);
      const hMax = Math.max(0, ...near.map((c) => c.bbox.h));
      const labels = [];
      for (const c of near) {
        if (c.bbox.h < hMax * 0.55) continue;
        if (labels.length && c.bbox.x - rright(labels[labels.length - 1]) > numH * 1.2) break;
        labels.push(c.bbox);
      }
      const bracket = { id: -1, bbox: b, area: b.w, cx: rcx(b), cy: rcy(b) };
      out.push({ bracket, row, labels });
    }
  }
  return out.sort((a, b) => a.bracket.bbox.y - b.bracket.bbox.y || a.bracket.bbox.x - b.bracket.bbox.x);
}
async function detectRepeatsAndEndings(bin, comps, dots, rows, numH, ocr) {
  detectRepeatBarlines(dots, rows, numH);
  const endings = endingCandidates(bin, comps, rows, numH);
  if (!endings.length) return;
  const flat = [];
  const span = endings.map((e) => {
    const at = flat.length;
    flat.push(...e.labels);
    return { at, n: e.labels.length };
  });
  const rec = flat.length ? await ocr.recognizeDigits(bin, flat) : [];
  const recognized = /* @__PURE__ */ new Map();
  endings.forEach((e, i) => {
    const nums = [];
    for (let k = 0; k < span[i].n; k++) {
      const d = rec[span[i].at + k];
      if (d >= 1 && d <= 9 && !nums.includes(d)) nums.push(d);
    }
    if (nums.length) recognized.set(e, nums);
  });
  endings.forEach((e, i) => {
    const nums = recognized.get(e) ?? [i % 2 + 1];
    const number = nums.join(",");
    const b = e.bracket.bbox;
    const covered = e.row.nums.filter((n) => rcx(n.bbox) >= b.x - numH * 0.5 && rcx(n.bbox) <= rright(b) + numH * 0.5);
    if (!covered.length) return;
    probe("ending");
    covered[0].endingStart = number;
    covered[covered.length - 1].endingStop = number;
  });
}
function segnoBody(k, numH) {
  const b = k.bbox;
  if (b.h < numH * 0.85 || b.h > numH * 1.6) return false;
  if (b.w < numH * 0.45 || b.w > numH * 1.1) return false;
  const aspect = b.w / b.h;
  if (aspect < 0.45 || aspect > 1) return false;
  const fill = k.area / (b.w * b.h);
  return fill >= 0.28 && fill <= 0.62;
}
function hasTwoDots(body, comps, numH) {
  const b = body.bbox;
  const pad = numH * 0.2;
  const near = comps.filter((d) => {
    if (d === body) return false;
    const s = Math.max(d.bbox.w, d.bbox.h);
    if (s < numH * 0.08 || s > numH * 0.3) return false;
    return rcx(d.bbox) >= b.x - pad && rcx(d.bbox) <= rright(b) + pad && rcy(d.bbox) >= b.y - pad && rcy(d.bbox) <= rbottom(b) + pad;
  });
  if (near.length < 2) return false;
  const cy = rcy(b);
  const above = near.filter((d) => rcy(d.bbox) < cy);
  const below = near.filter((d) => rcy(d.bbox) > cy);
  if (!above.length || !below.length) return false;
  return above.some((a) => below.some((z) => Math.abs(rcx(a.bbox) - rcx(z.bbox)) >= numH * 0.2 && Math.abs(rcy(a.bbox) - rcy(z.bbox)) >= numH * 0.1));
}
function detectSegno(comps, rows, numH) {
  for (const row of rows) {
    if (!row.nums.length) continue;
    const rowTop = Math.min(...row.nums.map((n) => n.bbox.y));
    const y0 = rowTop - numH * 2.8, y1 = rowTop - numH * 0.2;
    for (const k of comps) {
      if (rbottom(k.bbox) > y1 || k.bbox.y < y0) continue;
      if (!segnoBody(k, numH)) continue;
      if (!hasTwoDots(k, comps, numH)) continue;
      const cx = rcx(k.bbox);
      let best;
      for (const n of row.nums) {
        if (rright(n.bbox) < cx - numH * 1.5) continue;
        best = n;
        break;
      }
      if (!best) continue;
      probe("segno");
      best.segno = true;
    }
  }
}
function splitMergedOctaveDot(bin, b, numH, strict = false) {
  const wide = strict && b.h >= numH * 1.35;
  if (b.h <= numH * 1.05 || b.w < numH * 0.3 || b.w > numH * (wide ? 1 : 0.6)) return null;
  const ink = rowInk(bin, b);
  const strokeInk = median(ink.filter((v) => v > 0)) || 1;
  const mk = (y0, y1) => {
    const t2 = tightBox(bin, b, 0, b.w, y0, y1);
    return t2 ? { id: -1, bbox: t2, area: t2.w * t2.h, cx: rcx(t2), cy: rcy(t2) } : null;
  };
  const tryCut = (winLo, winHi, dotAtTop) => {
    let v = -1, vMin = Infinity;
    for (let y = winLo; y < winHi; y++) if (ink[y] < vMin) {
      vMin = ink[y];
      v = y;
    }
    if (v < 0 || vMin > strokeInk * 0.6) return null;
    if (strict && vMin > (wide ? Math.max(1, numH * 0.15) : 1)) return null;
    const dotSeg = dotAtTop ? mk(0, v) : mk(v + 1, b.h);
    const digSeg = dotAtTop ? mk(v + 1, b.h) : mk(0, v);
    if (!dotSeg || !digSeg) return null;
    const dh = dotSeg.bbox.h, dgh = digSeg.bbox.h;
    if (dh > numH * 0.5 || dotSeg.bbox.w > numH * 0.5 || dotSeg.bbox.w < numH * 0.13) return null;
    if (dgh < numH * 0.55 || dgh > numH * 1.7 || digSeg.bbox.w > numH * (wide ? 1 : 0.7) || digSeg.bbox.w < numH * 0.28) return null;
    if (strict && (dotSeg.bbox.w > dh * 1.7 || dh > dotSeg.bbox.w * 1.7 || dotSeg.bbox.w > digSeg.bbox.w * 0.8)) return null;
    if (wide && vMin > dotSeg.bbox.w * 0.55) return null;
    probe("splitMergedOctaveDot");
    return { dot: dotSeg, digit: digSeg };
  };
  return tryCut(Math.round(numH * 0.12), Math.round(numH * 0.6), true) ?? tryCut(b.h - Math.round(numH * 0.6), b.h - Math.round(numH * 0.12), false);
}
function strokeLineH(comps, numH) {
  const hs = comps.filter((k) => k.bbox.w >= numH * 0.6 && k.bbox.h <= Math.max(3, numH * 0.32) && k.bbox.w >= k.bbox.h * 3).map((k) => k.bbox.h);
  return hs.length >= 3 ? median(hs) : 0;
}
function stripUnderline(bin, k, numH, lineH) {
  const b = k.bbox;
  if (lineH <= 0 || b.h <= lineH + 1) return null;
  const flat = b.w >= b.h * 1.8;
  const lineMode = b.w >= numH * 0.6 && (b.h <= numH * 0.6 || flat && b.h <= numH * 0.7);
  const digitMode = !lineMode && b.h >= numH * 1.05 && b.h <= numH * 2 && b.w >= numH * 0.3;
  if (!lineMode && !digitMode) return null;
  const sub = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) sub.data[y * b.w + x] = bin.data[(b.y + y) * bin.w + b.x + x];
  const labels = new Int32Array(b.w * b.h);
  const parts = connectedComponents(sub, 1, labels);
  const self = parts.find((p) => p.bbox.w === b.w && p.bbox.h === b.h) ?? parts.sort((p, q) => q.area - p.area)[0];
  if (!self) return null;
  const on = (x, y) => labels[y * b.w + x] === self.id;
  const rowCount = (y) => {
    let n = 0;
    for (let x = 0; x < b.w; x++) if (on(x, y)) n++;
    return n;
  };
  const rowRun = (y) => {
    let best = 0, cur = 0;
    for (let x = 0; x < b.w; x++) {
      if (on(x, y)) {
        if (++cur > best) best = cur;
      } else cur = 0;
    }
    return best;
  };
  const rowSpan = (y) => {
    let lo = -1, hi = -1;
    for (let x = 0; x < b.w; x++) if (on(x, y)) {
      if (lo < 0) lo = x;
      hi = x;
    }
    return lo < 0 ? 0 : hi - lo + 1;
  };
  const runs = Array.from({ length: b.h }, (_, y) => rowRun(y));
  let need;
  let yFrom = 0;
  const multi = digitMode && b.w >= numH * 1.4;
  if (lineMode || multi) {
    need = Math.max(numH * 0.6, b.w * 0.8);
    if (multi) yFrom = Math.round(numH * 0.7);
  } else {
    let bodyW = 0;
    for (let y = 0; y < Math.min(b.h, Math.round(numH * 0.8)); y++) bodyW = Math.max(bodyW, rowSpan(y));
    need = Math.max(numH * 0.6, bodyW + Math.max(2, numH * 0.1));
    yFrom = Math.round(numH * 0.7);
  }
  const bands = [];
  for (let y = yFrom; y < b.h; y++) {
    if (runs[y] < need) continue;
    const last = bands[bands.length - 1];
    if (last && last[1] === y - 1) last[1] = y;
    else bands.push([y, y]);
  }
  if (!bands.length) return null;
  const cut = new Uint8Array(b.h);
  for (const band of bands) {
    const lineW = Math.max(...runs.slice(band[0], band[1] + 1));
    if (digitMode) {
      let above = band[0] - 1;
      for (let skip = 0; skip < lineH && above >= 0 && (multi ? runs[above] >= lineW * 0.6 : rowSpan(above) >= need && rowCount(above) >= lineW * 0.4); skip++) above--;
      if (above < 0 || (multi ? runs[above] : rowSpan(above)) >= lineW * 0.6) return null;
    }
    let [y0, y1] = band;
    const maxH = lineH + 1;
    if (y1 - y0 + 1 > maxH) return null;
    while (y1 - y0 + 1 < maxH) {
      const up = y0 - 1 >= 0 && (!digitMode || y0 - 1 >= yFrom) ? rowCount(y0 - 1) : 0;
      const dn = y1 + 1 < b.h ? rowCount(y1 + 1) : 0;
      if (up >= lineW * 0.3 && up >= dn) y0--;
      else if (dn >= lineW * 0.3) y1++;
      else break;
    }
    for (let y = y0; y <= y1; y++) cut[y] = 1;
    band[0] = y0;
    band[1] = y1;
  }
  const mkComp = (r, area) => ({ id: -1, bbox: r, area, cx: rcx(r), cy: rcy(r) });
  const analyse = (proj) => {
    const bs = [];
    for (const [y0, y1] of bands) {
      const last = bs[bs.length - 1];
      if (last && y0 <= last[1]) last[1] = Math.max(last[1], y1);
      else bs.push([y0, y1]);
    }
    const ct = cut.slice();
    let extra = 0;
    if (proj) {
      const need2 = Math.max(numH * 0.4, lineH * 3);
      let y = bs[bs.length - 1][1] + 1;
      while (y < b.h) {
        if (runs[y] < need2) {
          y++;
          continue;
        }
        let y1 = y;
        while (y1 + 1 < b.h && runs[y1 + 1] >= need2) y1++;
        const th = y1 - y + 1;
        if (th >= Math.max(2, lineH * 0.5) && th <= lineH + 1) {
          const w2 = Math.max(...runs.slice(y, y1 + 1));
          let y0 = y;
          const last = bs[bs.length - 1][1];
          while (y1 - y0 + 1 < lineH + 1) {
            const up = y0 - 1 > last && !ct[y0 - 1] ? rowCount(y0 - 1) : 0;
            const dn = y1 + 1 < b.h ? rowCount(y1 + 1) : 0;
            if (up >= w2 * 0.3 && up >= dn) y0--;
            else if (dn >= w2 * 0.3) y1++;
            else break;
          }
          for (let yy = y0; yy <= y1; yy++) ct[yy] = 1;
          bs.push([y0, y1]);
          extra++;
        }
        y = y1 + 1;
      }
    }
    const lines = [];
    for (const [y0, y1] of bs) {
      let x0 = b.w, x1 = -1, area = 0;
      for (let y = y0; y <= y1; y++) for (let x = 0; x < b.w; x++) if (on(x, y)) {
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
      lines.push(mkComp({ x: b.x + x0, y: b.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, area));
    }
    const rest = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
    for (let y = 0; y < b.h; y++) if (!ct[y]) {
      for (let x = 0; x < b.w; x++) if (on(x, y)) rest.data[y * b.w + x] = 1;
    }
    const topBand = bs[0][0], botBand = bs[bs.length - 1][1];
    const dots = [], digits = [];
    for (const p of connectedComponents(rest, 1)) {
      if (p.area <= Math.max(3, (numH * 0.15) ** 2)) continue;
      if (proj && bs.length >= 2 && p.bbox.y > topBand && p.bbox.y + p.bbox.h - 1 < botBand) continue;
      const r = { x: b.x + p.bbox.x, y: b.y + p.bbox.y, w: p.bbox.w, h: p.bbox.h };
      const pc = mkComp(r, p.area);
      const ratio = r.w / r.h;
      if (p.bbox.y > botBand && r.w >= numH * 0.1 && r.h >= numH * 0.1 && r.w <= numH * 0.5 && r.h <= numH * 0.5 && // 宽高比下限 0.5：点经一截颈粘在线下，剥掉线带后颈还留在点上，成了竖长的水滴（1218 159 `7̲̣` 剥出 7×12）
      ratio >= 0.5 && ratio <= 1.7 && p.area >= r.w * r.h * 0.6) {
        dots.push(pc);
        continue;
      }
      let thick = 0;
      for (let y = p.bbox.y; y < p.bbox.y + p.bbox.h; y++) if (runs[y] >= r.w * 0.6) thick++;
      if (p.bbox.y > botBand && thick >= Math.max(2, lineH * 0.5) && thick <= lineH + 1 && r.h <= lineH * 2 + 1 && r.w >= Math.max(numH * 0.4, thick * 3)) {
        lines.push(pc);
        extra++;
        continue;
      }
      if (digitMode && p.bbox.y + p.bbox.h <= topBand && r.h >= numH * 0.85 && (r.h <= numH * 1.25 || r.h <= numH * 1.4 && r.w >= numH * 0.3)) {
        digits.push(pc);
        continue;
      }
      return null;
    }
    if (digitMode && !digits.length) return null;
    if (lineMode && !dots.length && !extra && !(proj && bs.length >= 2)) return null;
    if (proj && bs.length > 2) return null;
    probe(lineMode ? proj ? "stripUnderline.lineProj" : "stripUnderline.line" : "stripUnderline.digit");
    if (extra) probe("stripUnderline.extraLine");
    return { lines, dots, digits };
  };
  return analyse(false) ?? (lineMode && flat ? analyse(true) : null);
}
function graceDivLines(bin, b, medH) {
  const x0 = Math.max(0, Math.round(b.x - b.w * 0.4));
  const x1 = Math.min(bin.w - 1, Math.round(rright(b) + b.w * 0.4));
  const need = b.w * 0.8;
  const yEnd = Math.min(bin.h, Math.round(rbottom(b) + medH * 0.6));
  let runs = 0, inRun = false;
  for (let y = Math.round(rbottom(b)) + 1; y < yEnd; y++) {
    let best = 0, cur = 0;
    for (let x = x0; x <= x1; x++) {
      if (bin.data[y * bin.w + x]) {
        cur++;
        if (cur > best) best = cur;
      } else cur = 0;
    }
    const wide = best >= need;
    if (wide && !inRun) runs++;
    inRun = wide;
  }
  return Math.min(runs, 3);
}
function splitOrnamentDot(bin, b, numH) {
  if (b.h < numH * 0.35 || b.h > numH * 0.95 || b.w < numH * 0.5 || b.w > numH * 1.6) return null;
  const rowSpan = (y) => {
    let lo = -1, hi = -1;
    for (let x = 0; x < b.w; x++) if (bin.data[(b.y + y) * bin.w + (b.x + x)]) {
      if (lo < 0) lo = x;
      hi = x;
    }
    return lo < 0 ? 0 : hi - lo + 1;
  };
  const spans = Array.from({ length: b.h }, (_, y) => rowSpan(y));
  let y1 = b.h - 1;
  while (y1 >= 0 && spans[y1] === 0) y1--;
  let y0 = y1;
  while (y0 >= 0 && spans[y0] > 0 && spans[y0] <= numH * 0.5) y0--;
  const dotH = y1 - y0;
  if (dotH < numH * 0.15 || dotH > numH * 0.5) return null;
  if (y0 < 0 || spans[y0] < numH * 0.7) return null;
  const t2 = tightBox(bin, b, 0, b.w, y0 + 1, y1 + 1);
  if (!t2 || t2.w > numH * 0.5 || t2.w < numH * 0.13 || t2.w < dotH * 0.5) return null;
  probe("splitOrnamentDot");
  return { id: -1, bbox: t2, area: t2.w * t2.h, cx: rcx(t2), cy: rcy(t2) };
}
function fullHeightBars(bin, b, numH) {
  const minRun = Math.floor(b.h * 0.8);
  const runs = [];
  for (let xx = 0; xx < b.w; xx++) {
    let best = 0, bestY0 = 0, cur = 0, curY0 = 0;
    for (let yy = 0; yy < b.h; yy++) {
      if (bin.data[(b.y + yy) * bin.w + (b.x + xx)]) {
        if (cur === 0) curY0 = yy;
        cur++;
        if (cur > best) {
          best = cur;
          bestY0 = curY0;
        }
      } else cur = 0;
    }
    runs.push(best >= minRun ? { run: best, y0: bestY0 } : null);
  }
  const out = [];
  let s = -1;
  for (let xx = 0; xx <= b.w; xx++) {
    if (xx < b.w && runs[xx]) {
      if (s < 0) s = xx;
    } else if (s >= 0) {
      if (xx - s <= numH * 0.5) {
        let ry0 = runs[s].y0, rrun = runs[s].run;
        for (let j = s; j < xx; j++) if (runs[j].run > rrun) {
          rrun = runs[j].run;
          ry0 = runs[j].y0;
        }
        out.push({ cx: b.x + (s + xx - 1) / 2, y: b.y + ry0, h: rrun, w: xx - s });
      }
      s = -1;
    }
  }
  return out;
}
function peelDigit(p, labels, b, numH) {
  const pb = p.bbox;
  const mk = (x0, y0, x1, y1, area, id) => {
    const r = { x: b.x + x0, y: b.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    return { id, area, bbox: r, cx: rcx(r), cy: rcy(r) };
  };
  const whole = mk(pb.x, pb.y, pb.x + pb.w - 1, pb.y + pb.h - 1, p.area, p.id);
  if (pb.w < numH * 0.6 || pb.h < numH * 0.5) return [whole];
  const own = (x, y) => labels[y * b.w + x] === p.id;
  const cols = [], lowest = [];
  for (let x = pb.x; x < pb.x + pb.w; x++) {
    let n = 0, lo = -1;
    for (let y = pb.y; y < pb.y + pb.h; y++) if (own(x, y)) {
      n++;
      lo = y - pb.y;
    }
    cols.push(n);
    lowest.push(lo);
  }
  const spans = [];
  cols.forEach((n, i) => {
    if (n < numH * 0.25) return;
    const last = spans[spans.length - 1];
    if (last && i - last[1] <= 2) last[1] = i + 1;
    else spans.push([i, i + 1]);
  });
  const edge = spans.filter(([sa, se]) => spans.length > 1 && se - sa < numH * 0.15 && (sa === 0 || se === pb.w));
  const core = spans.filter((sp) => !edge.includes(sp));
  if (core.length !== 1) return [whole];
  const isEdge = (i) => edge.some(([sa, se]) => i >= sa && i < se);
  let [a, e] = core[0];
  while (a > 0 && lowest[a - 1] > pb.h * 0.5) a--;
  while (e < pb.w && lowest[e] > pb.h * 0.5) e++;
  if (e - a < numH * 0.3 || e - a > numH * 1.2) return [whole];
  let thinW = 0;
  for (let i = 0; i < pb.w; i++) {
    if (i >= a && i < e || !cols[i] || isEdge(i)) continue;
    if (cols[i] >= numH * 0.25 || lowest[i] > pb.h * 0.5) return [whole];
    thinW++;
  }
  if (thinW < numH * 0.3) return [whole];
  const box = (inside) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, area = 0;
    for (let y = pb.y; y < pb.y + pb.h; y++) for (let x = pb.x; x < pb.x + pb.w; x++) {
      if (!own(x, y) || (x - pb.x >= a && x - pb.x < e) !== inside) continue;
      area++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return area ? { x0, y0, x1, y1, area } : null;
  };
  const d = box(true), t2 = box(false);
  if (!d || !t2) return [whole];
  probe("untangleBridged.peelDigit");
  return [mk(d.x0, d.y0, d.x1, d.y1, d.area, p.id), mk(t2.x0, t2.y0, t2.x1, t2.y1, t2.area, p.id + 5e5)];
}
function untangleBridged(comps, bin, numH) {
  const out = [];
  for (const k of comps) {
    const b = k.bbox;
    const sparse = b.w >= numH * 0.9 && k.area < b.w * b.h * 0.25;
    if (b.h < numH * 1.6 || !sparse && (b.h < numH * 2.8 || b.w < numH * 0.45)) {
      out.push(k);
      continue;
    }
    const bars = fullHeightBars(bin, b, numH);
    if (!bars.length) {
      out.push(k);
      continue;
    }
    const glued = !sparse && bars.length === 1 && bars[0].h >= numH * 2.8 && bars[0].w <= numH * 0.25;
    if (!sparse && !glued) {
      out.push(k);
      continue;
    }
    if (glued) probe("untangleBridged.gluedDigit");
    if (b.h < numH * 1.8 && (bars.length !== 1 || bars[0].cx - b.x > 2 && rright(b) - bars[0].cx > 2)) {
      out.push(k);
      continue;
    }
    const spanning = glued || bars.some((bar) => bar.h >= numH * 3.5);
    const halo = spanning ? Math.max(...bars.map((bar) => Math.ceil(bar.w / 2) + 1)) : Math.ceil(numH * 0.25);
    const inBar = (absX) => bars.some((bar) => Math.abs(absX - bar.cx) <= halo);
    const mask = new Uint8Array(b.w * b.h);
    const seed = (bars[0].y - b.y) * b.w + (Math.round(bars[0].cx) - b.x);
    const st = [seed];
    mask[seed] = 1;
    while (st.length) {
      const cur = st.pop(), yy = cur / b.w | 0, xx = cur - yy * b.w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ny = yy + dy, nx = xx + dx;
        if (ny < 0 || ny >= b.h || nx < 0 || nx >= b.w) continue;
        const ni = ny * b.w + nx;
        if (!mask[ni] && bin.data[(b.y + ny) * bin.w + (b.x + nx)]) {
          mask[ni] = 1;
          st.push(ni);
        }
      }
    }
    const rowInkExcl = (yy) => {
      let n = 0;
      for (let xx = 0; xx < b.w; xx++) if (!inBar(b.x + xx) && mask[yy * b.w + xx]) n++;
      return n;
    };
    let y = 0;
    while (y < b.h && rowInkExcl(y) === 0) y++;
    const bandTop = y;
    while (y < b.h && rowInkExcl(y) > 0) y++;
    const noArc = bandTop > numH * 0.4;
    if (noArc && !spanning) probe("untangleBridged.dashOnBar");
    const arcBottom = spanning || noArc ? 0 : y;
    const sub = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
    for (let yy = 0; yy < b.h; yy++)
      for (let xx = 0; xx < b.w; xx++) {
        if (!mask[yy * b.w + xx]) continue;
        if (yy >= arcBottom && inBar(b.x + xx)) continue;
        sub.data[yy * b.w + xx] = 1;
      }
    const labels = new Int32Array(b.w * b.h);
    const ccs = connectedComponents(sub, 4, labels);
    const pieces = [];
    for (const p of ccs) pieces.push(...spanning ? peelDigit(p, labels, b, numH) : [{
      id: p.id,
      area: p.area,
      bbox: { x: b.x + p.bbox.x, y: b.y + p.bbox.y, w: p.bbox.w, h: p.bbox.h },
      cx: b.x + p.cx,
      cy: b.y + p.cy
    }]);
    for (const bar of bars)
      out.push({ id: 2e6 + out.length, bbox: { x: Math.round(bar.cx - 1), y: bar.y, w: 2, h: bar.h }, area: 2 * bar.h, cx: bar.cx, cy: bar.y + bar.h / 2 });
    probe("untangleBridged");
    const hasThickCol = (p) => {
      if (p.id >= 5e5) return false;
      const x0 = p.bbox.x - b.x, y0 = p.bbox.y - b.y;
      let run = 0;
      for (let xx = x0; xx < x0 + p.bbox.w; xx++) {
        let n = 0;
        for (let yy = y0; yy < y0 + p.bbox.h; yy++) if (labels[yy * b.w + xx] === p.id) n++;
        run = n >= numH * 0.25 ? run + 1 : 0;
        if (run >= numH * 0.3) return true;
      }
      return false;
    };
    const thin = (p) => p.bbox.w >= 3 && (p.bbox.h <= numH * 0.6 || p.area < p.bbox.w * p.bbox.h * 0.25) && !hasThickCol(p);
    const used = /* @__PURE__ */ new Set();
    for (const bar of bars) {
      for (const l of pieces) {
        if (used.has(l) || !thin(l) || Math.abs(rright(l.bbox) - (bar.cx - halo)) > 3) continue;
        const r = pieces.find((q) => q !== l && !used.has(q) && thin(q) && Math.abs(q.bbox.x - (bar.cx + halo)) <= 3 && overlapRatioY(q.bbox, l.bbox) >= 0.5);
        if (!r) continue;
        used.add(l);
        used.add(r);
        const bb = unionRect(l.bbox, r.bbox);
        probe("untangleBridged.rejoinArc");
        pieces.push({ id: REJOINED_ARC_ID + pieces.length, area: l.area + r.area, bbox: bb, cx: rcx(bb), cy: rcy(bb) });
      }
    }
    out.push(...pieces.filter((p) => !used.has(p)));
  }
  return out;
}
function splitBarDash(bin, comps, numH) {
  const out = [];
  let nextId = 3e6;
  const mk = (r, area) => ({ id: nextId++, bbox: r, area, cx: rcx(r), cy: rcy(r) });
  for (const k of comps) {
    const b = k.bbox;
    if (b.h < numH * 0.85 || b.h > numH * 2 || b.w < numH * 0.4 || b.w > numH * 1.2) {
      out.push(k);
      continue;
    }
    const full = (xx) => {
      let best = 0, cur = 0;
      for (let yy = 0; yy < b.h; yy++) {
        if (bin.data[(b.y + yy) * bin.w + b.x + xx]) {
          if (++cur > best) best = cur;
        } else cur = 0;
      }
      return best >= b.h * 0.9;
    };
    const maxBar = Math.max(3, Math.round(numH * 0.15));
    let split = null;
    for (const fromLeft of [true, false]) {
      const col = (i) => fromLeft ? i : b.w - 1 - i;
      let n = 0;
      while (n < b.w && full(col(n))) n++;
      if (n === 0 || n > maxBar) continue;
      const bx0 = fromLeft ? 0 : b.w - n, bx1 = fromLeft ? n : b.w;
      const rest = fromLeft ? tightBox(bin, b, n, b.w, 0, b.h) : tightBox(bin, b, 0, b.w - n, 0, b.h);
      if (!rest || rest.h > Math.max(3, numH * 0.32) || rest.w < numH * 0.3) continue;
      const mid = (rcy(rest) - b.y) / b.h;
      if (mid < 0.3 || mid > 0.7) continue;
      if (inkFill(bin, rest) < 0.8) continue;
      const bar = tightBox(bin, b, bx0, bx1, 0, b.h);
      split = [mk(bar, bar.w * bar.h), mk(rest, Math.round(inkFill(bin, rest) * rest.w * rest.h))];
      break;
    }
    if (split) {
      probe("splitBarDash");
      out.push(...split);
    } else out.push(k);
  }
  return out;
}
function splitBarCap(bin, comps, numH) {
  const out = [];
  let nextId = 4e6;
  const maxBar = Math.max(3, Math.round(numH * 0.15));
  for (const k of comps) {
    const b = k.bbox;
    if (b.h < numH * 1.8 || b.h > numH * 4 || b.w > numH * 1.5) {
      out.push(k);
      continue;
    }
    const sub = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
    for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) sub.data[yy * b.w + xx] = bin.data[(b.y + yy) * bin.w + b.x + xx];
    const labels = new Int32Array(b.w * b.h);
    const self = connectedComponents(sub, 1, labels).filter((p) => p.bbox.w === b.w && p.bbox.h === b.h).sort((p, q) => q.area - p.area)[0];
    if (!self) {
      out.push(k);
      continue;
    }
    const own = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
    for (let i = 0; i < labels.length; i++) own.data[i] = labels[i] === self.id ? 1 : 0;
    const run = (yy) => {
      let x0 = -1, x1 = -1;
      for (let xx = 0; xx < b.w; xx++) {
        if (!own.data[yy * b.w + xx]) continue;
        if (x0 < 0) x0 = xx;
        else if (xx > x1) return null;
        x1 = xx + 1;
      }
      return x0 < 0 ? null : [x0, x1];
    };
    const base = run(b.h - 1);
    if (!base || base[1] - base[0] > maxBar) {
      out.push(k);
      continue;
    }
    let n = 0;
    for (let yy = b.h - 1; yy >= 0; yy--) {
      const r = run(yy);
      if (!r || r[1] - r[0] > maxBar || Math.abs(r[0] - base[0]) > 1 || Math.abs(r[1] - base[1]) > 1) break;
      n++;
    }
    let thinAbove = true;
    for (let yy = 0; yy < b.h - n && thinAbove; yy++) {
      const r = run(yy);
      if (!r || r[1] - r[0] > maxBar + 3 || Math.abs(r[0] - base[0]) > maxBar) thinAbove = false;
    }
    if (thinAbove) {
      out.push(k);
      continue;
    }
    const at = { x: 0, y: 0, w: b.w, h: b.h };
    const top = n >= numH * 1.2 && n < b.h ? tightBox(own, at, 0, b.w, 0, b.h - n) : null;
    if (!top || top.h < numH * 0.4) {
      out.push(k);
      continue;
    }
    const bar = tightBox(own, at, 0, b.w, b.h - n, b.h);
    const mk = (r) => {
      let area = 0;
      for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) area += own.data[yy * b.w + xx];
      const abs = { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
      return { id: nextId++, bbox: abs, area, cx: rcx(abs), cy: rcy(abs) };
    };
    probe("splitBarCap");
    out.push(mk(bar), mk(top));
  }
  return out;
}
function splitArcTail(bin, comps, numH) {
  const out = [];
  let nextId = 5e6;
  for (const k of comps) {
    const b = k.bbox;
    if (isRejoinedArc(k) || b.w < numH * 1.6 || b.h < numH * 0.6 || b.h > numH * 2) {
      out.push(k);
      continue;
    }
    const sub = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
    for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) sub.data[yy * b.w + xx] = bin.data[(b.y + yy) * bin.w + b.x + xx];
    const labels = new Int32Array(b.w * b.h);
    const self = connectedComponents(sub, 1, labels).filter((p) => p.bbox.w === b.w && p.bbox.h === b.h).sort((p, q) => q.area - p.area)[0];
    if (!self) {
      out.push(k);
      continue;
    }
    const own = (xx, yy) => labels[yy * b.w + xx] === self.id;
    const cols = [], lowest = [];
    for (let xx = 0; xx < b.w; xx++) {
      let n = 0, lo = -1;
      for (let yy = 0; yy < b.h; yy++) if (own(xx, yy)) {
        n++;
        lo = yy;
      }
      cols.push(n);
      lowest.push(lo);
    }
    const thick = cols.map((n) => n >= numH * 0.25);
    const spans = [];
    for (let xx = 0; xx < b.w; xx++) {
      if (!thick[xx]) continue;
      const last = spans[spans.length - 1];
      if (last && xx - last[1] <= 2) last[1] = xx + 1;
      else spans.push([xx, xx + 1]);
    }
    const residue = /* @__PURE__ */ new Set();
    for (let si = spans.length - 1; si >= 0; si--) {
      const [sa, se] = spans[si];
      if (spans.length > 1 && se - sa < numH * 0.15 && (sa === 0 || se === b.w)) {
        for (let xx = sa; xx < se; xx++) residue.add(xx);
        spans.splice(si, 1);
      }
    }
    if (spans.length < 1 || spans.length > 2) {
      out.push(k);
      continue;
    }
    const bodies = spans.map(([sa, se]) => {
      let a = sa, e = se;
      while (a > 0 && lowest[a - 1] > b.h * 0.5 && !residue.has(a - 1)) a--;
      while (e < b.w && lowest[e] > b.h * 0.5 && !residue.has(e)) e++;
      return [a, e];
    });
    const stem = ([a, e]) => {
      for (let xx = a; xx < e; xx++) if (cols[xx] >= numH * 0.8) return true;
      return false;
    };
    for (const bd of bodies) {
      if (!stem(bd)) continue;
      const stemTop = b.h - Math.max(...cols.slice(bd[0], bd[1]));
      while (bd[0] > 0 && bd[1] - bd[0] < numH * 0.45 && cols[bd[0] - 1] > 0 && lowest[bd[0] - 1] >= stemTop + numH * 0.15 && !residue.has(bd[0] - 1)) bd[0]--;
    }
    const hanging = bodies.length === 1 && bodies[0][0] > numH * 0.3 && b.w - bodies[0][1] > numH * 0.3;
    if (bodies.some((bd) => bd[1] - bd[0] < numH * (stem(bd) ? 0.15 : hanging ? 0.2 : 0.3) || bd[1] - bd[0] > numH * 1.2)) {
      out.push(k);
      continue;
    }
    const inSpan = (xx) => bodies.findIndex(([a, e]) => xx >= a && xx < e);
    let thinW = 0, ok = true;
    for (let xx = 0; xx < b.w && ok; xx++) {
      if (inSpan(xx) >= 0 || residue.has(xx)) continue;
      if (!cols[xx]) continue;
      const byStem = bodies.some((bd) => stem(bd) && (xx === bd[0] - 1 || xx === bd[0] - 2 || xx === bd[1] || xx === bd[1] + 1));
      if (cols[xx] > numH * 0.2 && !(byStem && cols[xx] <= numH * 0.3) || lowest[xx] > b.h * 0.5) ok = false;
      thinW++;
    }
    if (!ok || thinW < numH * 0.6) {
      out.push(k);
      continue;
    }
    const [ha, he] = bodies[0];
    const bandBottom = hanging ? Math.max(ha > 0 ? lowest[ha - 1] : -1, he < b.w ? lowest[he] : -1) : -1;
    const owner = (xx, yy) => {
      const si = inSpan(xx);
      return si >= 0 && yy > bandBottom ? si : -1;
    };
    const piece = (who) => {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, area = 0;
      for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) {
        if (!own(xx, yy) || owner(xx, yy) !== who) continue;
        area++;
        x0 = Math.min(x0, xx);
        x1 = Math.max(x1, xx);
        y0 = Math.min(y0, yy);
        y1 = Math.max(y1, yy);
      }
      if (!area) return null;
      const abs = { x: b.x + x0, y: b.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      return { id: nextId++, bbox: abs, area, cx: rcx(abs), cy: rcy(abs) };
    };
    const digits = bodies.map((_, si) => piece(si)), arc = piece(-1);
    if (digits.some((d) => !d) || !arc) {
      out.push(k);
      continue;
    }
    probe(digits.length > 1 ? "splitArcTail.bridge" : "splitArcTail");
    out.push(...digits, arc);
  }
  return out;
}
function splitLineDot(bin, comps, numH, trimRagged = false) {
  const out = [];
  let nextId = 8e6;
  const maxLine = Math.max(3, Math.round(numH * 0.2));
  for (const k of comps) {
    const b = k.bbox;
    if (b.w < numH * 0.5 || b.w > numH * 4 || b.h < numH * 0.2 || b.h > numH * 0.6) {
      out.push(k);
      continue;
    }
    const rows = [], x0s = [], x1s = [];
    for (let yy = 0; yy < b.h; yy++) {
      let n = 0, x0 = -1, x1 = -1;
      for (let xx = 0; xx < b.w; xx++) if (bin.data[(b.y + yy) * bin.w + b.x + xx]) {
        n++;
        if (x0 < 0) x0 = xx;
        x1 = xx;
      }
      rows.push(n);
      x0s.push(x0);
      x1s.push(x1);
    }
    const full = rows.map((n) => n >= b.w * 0.8);
    let split = null;
    let la = full.indexOf(true), lb = la;
    if (la >= 0) {
      while (lb + 1 < b.h && full[lb + 1]) lb++;
      const ragged = (yy) => rows[yy] > 0 && x1s[yy] - x0s[yy] + 1 > numH * 0.35;
      while (la > 0 && ragged(la - 1)) la--;
      while (lb + 1 < b.h && ragged(lb + 1)) lb++;
      const n = lb - la + 1;
      const above = la, below = b.h - 1 - lb;
      if (n <= maxLine && above === 0 !== (below === 0) && !full.some((f, yy) => f && (yy < la || yy > lb))) {
        let [ya, yb] = above ? [0, la] : [lb + 1, b.h];
        const spanOf = (yy) => rows[yy] > 0 ? x1s[yy] - x0s[yy] + 1 : 0;
        const medSpan = median(Array.from({ length: yb - ya }, (_, j) => spanOf(ya + j)).filter((v) => v > 0)) || 0;
        if (trimRagged && above) while (yb - ya > 2 && spanOf(yb - 1) > medSpan * 1.4) yb--;
        else if (trimRagged) while (yb - ya > 2 && spanOf(ya) > medSpan * 1.4) ya++;
        let lo = Infinity, hi = -1, cnt = 0;
        for (let yy = ya; yy < yb; yy++) {
          if (!rows[yy]) continue;
          cnt++;
          lo = Math.min(lo, x0s[yy]);
          hi = Math.max(hi, x1s[yy]);
        }
        const dot = cnt >= numH * 0.12 && hi - lo + 1 <= numH * 0.35 && hi - lo + 1 >= numH * 0.1 ? tightBox(bin, b, lo, hi + 1, ya, yb) : null;
        if (dot) {
          const line = { x: b.x, y: b.y + la, w: b.w, h: n };
          let lineArea = 0;
          for (let yy = la; yy <= lb; yy++) lineArea += rows[yy];
          split = [
            { id: nextId++, bbox: line, area: lineArea, cx: rcx(line), cy: rcy(line) },
            { id: nextId++, bbox: dot, area: Math.max(1, k.area - lineArea), cx: rcx(dot), cy: rcy(dot) }
          ];
        }
      }
    }
    if (split) {
      probe("splitLineDot");
      out.push(...split);
    } else out.push(k);
  }
  return out;
}
function splitLineOverArc(bin, comps, numH) {
  const out = [];
  let nextId = 7e6;
  for (const k of comps) {
    const b = k.bbox;
    if (b.w < numH * 1.2 || b.h <= numH * 0.4 || b.h > numH * 1.2) {
      out.push(k);
      continue;
    }
    const sub = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
    for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) sub.data[yy * b.w + xx] = bin.data[(b.y + yy) * bin.w + b.x + xx];
    const labels = new Int32Array(b.w * b.h);
    const self = connectedComponents(sub, 1, labels).filter((p) => p.bbox.w === b.w && p.bbox.h === b.h).sort((p, q) => q.area - p.area)[0];
    if (!self) {
      out.push(k);
      continue;
    }
    const own = (xx, yy) => labels[yy * b.w + xx] === self.id;
    const run = (yy) => {
      let best = 0, cur2 = 0;
      for (let xx = 0; xx < b.w; xx++) {
        if (own(xx, yy)) {
          if (++cur2 > best) best = cur2;
        } else cur2 = 0;
      }
      return best;
    };
    let y1 = 0;
    while (y1 < Math.min(3, b.h) && run(y1) < b.w * 0.85) y1++;
    const y0 = y1;
    while (y1 < b.h && run(y1) >= b.w * 0.85) y1++;
    if (y1 === y0 || y1 - y0 > numH * 0.3 || y1 >= b.h - 2) {
      out.push(k);
      continue;
    }
    let ok = true, longest = 0, cur = 0;
    for (let xx = 0; xx < b.w && ok; xx++) {
      let n = 0;
      for (let yy = y1; yy < b.h; yy++) if (own(xx, yy)) n++;
      if (n >= numH * 0.25) ok = false;
      cur = n ? cur + 1 : 0;
      longest = Math.max(longest, cur);
    }
    if (!ok || longest < b.w * 0.6) {
      out.push(k);
      continue;
    }
    const box = (from, to) => {
      let x0 = Infinity, yy0 = Infinity, x1 = -1, yy1 = -1, area = 0;
      for (let yy = from; yy < to; yy++) for (let xx = 0; xx < b.w; xx++) {
        if (!own(xx, yy)) continue;
        area++;
        x0 = Math.min(x0, xx);
        x1 = Math.max(x1, xx);
        yy0 = Math.min(yy0, yy);
        yy1 = Math.max(yy1, yy);
      }
      if (!area) return null;
      const r = { x: b.x + x0, y: b.y + yy0, w: x1 - x0 + 1, h: yy1 - yy0 + 1 };
      return { id: nextId++, bbox: r, area, cx: rcx(r), cy: rcy(r) };
    };
    const line = box(0, y1), below = box(y1, b.h);
    if (!line || !below) {
      out.push(k);
      continue;
    }
    probe("splitLineOverArc");
    out.push(line, below);
  }
  return out;
}
function estimateNumH(comps) {
  const squarish = comps.filter((k) => {
    const r = k.bbox.w / k.bbox.h;
    return r > 0.35 && r < 1.6 && k.bbox.h >= 6;
  });
  const est = median(squarish.map((k) => k.bbox.h)) || 16;
  const tall = squarish.filter((k) => k.bbox.w / k.bbox.h <= 0.85);
  const est2 = tall.length >= 20 ? median(tall.map((k) => k.bbox.h)) : 0;
  const bars = comps.filter((k) => k.bbox.h >= 12 && k.bbox.w <= Math.max(3, k.bbox.h * 0.12));
  const anchored = bars.length >= 3 ? tall.filter((k) => bars.some((b) => b.bbox.h >= k.bbox.h * 1.2 && Math.abs(b.bbox.x - k.bbox.x) <= b.bbox.h * 6 && Math.abs(rcy(b.bbox) - rcy(k.bbox)) < b.bbox.h * 0.3)) : [];
  const est3 = anchored.length >= 15 && anchored.length >= tall.length * 0.2 ? median(anchored.map((k) => k.bbox.h)) : 0;
  if (est3 && est > est3 * 1.15 && est3 >= est * 0.6) {
    probe("numH.barAnchored");
    return est3;
  }
  if (est3 && est3 > est * 1.2 && est2 && Math.abs(est3 - est2) <= est3 * 0.1) {
    probe("numH.barAnchoredUp");
    return est3;
  }
  return est2 > est * 1.3 ? est2 : est;
}
function inkFill(bin, r) {
  let ink = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (bin.data[y * bin.w + x]) ink++;
  return r.w * r.h ? ink / (r.w * r.h) : 0;
}
function inkCount(bin, r) {
  const on = (x, y) => x >= 0 && y >= 0 && x < bin.w && y < bin.h && bin.data[y * bin.w + x] === 1;
  let ink = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++)
    if (on(x, y) && on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) ink++;
  return ink;
}
function isCleanPage(comps, numH) {
  const barCands = comps.filter((k) => k.bbox.h >= numH * 0.85 && k.bbox.h <= numH * 1.6 && k.bbox.w <= Math.max(2, numH * 0.35));
  const med = (xs) => xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : 0;
  return barCands.length >= 4 && med(barCands.map((k) => k.bbox.w)) >= 2 && med(barCands.map((k) => k.area / (k.bbox.w * k.bbox.h))) >= 0.95;
}
function isVoicedPage(comps, numH) {
  return comps.filter((k) => k.bbox.h >= numH * 2.6 && k.bbox.h <= numH * 6 && k.bbox.w <= Math.max(2, numH * 0.35)).length >= 8;
}
function splitArcEndDots(bin, comps, numH, strokeMax = 0.12, fat = false) {
  const out = [];
  let nextId = 2e6;
  const mk = (r) => ({ id: nextId++, bbox: r, area: fat ? inkCount(bin, r) : r.w * r.h, cx: rcx(r), cy: rcy(r) });
  for (const k of comps) {
    const b = k.bbox;
    if (b.w < numH * 0.6 || b.h < numH * 0.2 || b.h > numH * 0.8 || b.w < b.h * 2) {
      out.push(k);
      continue;
    }
    const col = columnInk(bin, b, 0, b.h);
    const stroke = median(col.filter((v) => v > 0)) || 1;
    if (stroke > numH * strokeMax) {
      out.push(k);
      continue;
    }
    const thick = Math.max(stroke * 2.2, numH * 0.15);
    const endRun = (fromLeft) => {
      const at = (i2) => col[fromLeft ? i2 : b.w - 1 - i2];
      let i = 0;
      while (i < b.w && at(i) === 0) i++;
      const start = i;
      while (i < b.w && i - start < numH * 0.08 && at(i) > 0 && at(i) < stroke * 1.6) i++;
      let peak = 0;
      while (i < b.w && at(i) >= stroke * 1.6) {
        peak = Math.max(peak, at(i));
        i++;
      }
      const runW = i - start;
      if (peak < thick || runW < numH * 0.12 || runW > numH * 0.4 || b.w - i < numH * 0.4) return null;
      return fromLeft ? [start, i] : [b.w - i, b.w - start];
    };
    const left = endRun(true), right = endRun(false);
    if (!left && !right && !fat) {
      out.push(k);
      continue;
    }
    const arc = tightBox(bin, b, left?.[1] ?? 0, right?.[0] ?? b.w, 0, b.h);
    if (!arc) {
      out.push(k);
      continue;
    }
    const foot = Math.round(numH * 0.5);
    const asDot = (run, fromLeft) => {
      if (!run) return null;
      const d = tightBox(bin, b, run[0], run[1], 0, b.h);
      if (!d) return null;
      const ratio = d.w / d.h;
      if (d.w > numH * 0.45 || d.h > numH * 0.45 || d.h < numH * 0.12 || ratio < 0.5 || ratio > 1.7) return null;
      const x0 = left?.[1] ?? 0, x1 = right?.[0] ?? b.w;
      const near = fromLeft ? tightBox(bin, b, x0, Math.max(x0 + 1, x1 - foot), 0, b.h) : tightBox(bin, b, Math.min(x1 - 1, x0 + foot), x1, 0, b.h);
      return rbottom(d) > rbottom(near ?? arc) ? d : null;
    };
    const fatDot = (fromLeft) => {
      const need = Math.max(stroke * 1.5, numH * 0.15);
      const zone = Math.round(numH * 0.45);
      const xa = fromLeft ? 0 : Math.max(0, b.w - zone), xb = fromLeft ? Math.min(b.w, zone) : b.w;
      const sub = { w: b.w, h: b.h, data: new Uint8Array(b.w * b.h) };
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) sub.data[y * b.w + x] = bin.data[(b.y + y) * bin.w + b.x + x];
      const labels = new Int32Array(b.w * b.h);
      const self = connectedComponents(sub, 1, labels).find((q) => q.bbox.w === b.w && q.bbox.h === b.h);
      if (!self) return null;
      const ink = (xx, yy2) => labels[yy2 * b.w + xx] === self.id;
      const runOf = (yy2) => {
        let best = null, st = -1;
        for (let xx = xa; xx <= xb; xx++) {
          if (xx < xb && ink(xx, yy2)) {
            if (st < 0) st = xx;
          } else if (st >= 0) {
            if (!best || xx - st > best[1] - best[0] + 1) best = [st, xx - 1];
            st = -1;
          }
        }
        return best;
      };
      let yy = b.h - 1;
      while (yy >= 0 && !runOf(yy)) yy--;
      if (yy < b.h - 1 - Math.max(1, stroke * 0.5)) return null;
      const y1 = yy;
      let x0 = Infinity, x1 = -1, maxW = 0, neck = false;
      for (; yy >= 0; yy--) {
        const r = runOf(yy);
        if (!r) break;
        const w2 = r[1] - r[0] + 1;
        if (y1 - yy >= numH * 0.12 && maxW >= need && w2 <= maxW * 0.7) {
          neck = true;
          break;
        }
        maxW = Math.max(maxW, w2);
        x0 = Math.min(x0, r[0]);
        x1 = Math.max(x1, r[1]);
      }
      if (!neck) return null;
      let above = 0;
      for (let y = yy; y >= 0 && runOf(y); y--) above++;
      if (above < Math.max(3, stroke)) return null;
      const y0 = yy + 1, w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w > numH * 0.45 || h > numH * 0.45 || w < numH * 0.12 || w / h < 0.6 || w / h > 1.7) return null;
      if (fromLeft ? x0 > numH * 0.15 : b.w - 1 - x1 > numH * 0.15) return null;
      return { x: b.x + x0, y: b.y + y0, w, h };
    };
    const dl = asDot(left, true), dr = asDot(right, false);
    let fl = null, fr = null;
    if (fat) {
      const footOver = (r) => r && comps.some((o) => o !== k && o.bbox.w <= numH * 0.45 && o.bbox.h <= numH * 0.45 && Math.abs(rcx(o.bbox) - rcx(r)) <= numH * 0.3 && rcy(o.bbox) > rcy(r) && o.bbox.y - rbottom(r) <= numH * 0.4) ? null : r;
      fl = fatDot(true) ?? footOver(dl);
      fr = fatDot(false) ?? footOver(dr);
      if (!fl && !fr) {
        out.push(k);
        continue;
      }
      {
        probe("splitArcEndDots.fat");
        const xa = fl ? fl.x - b.x + fl.w : 0, xb = fr ? fr.x - b.x : b.w;
        const side = tightBox(bin, b, xa, Math.max(xa + 1, xb), 0, b.h);
        const dotTop = Math.min(...[fl, fr].filter((d) => d !== null).map((d) => d.y - b.y));
        const cap = dotTop > 0 ? tightBox(bin, b, 0, b.w, 0, dotTop) : null;
        const arcBox2 = side && cap ? unionRect(side, cap) : side ?? cap;
        const mkDot = (r) => ({ id: nextId++, bbox: r, area: Math.round(inkFill(bin, r) * r.w * r.h), cx: rcx(r), cy: rcy(r) });
        if (arcBox2) {
          out.push(mk(arcBox2), ...[fl, fr].filter((d) => d !== null).map(mkDot));
          continue;
        }
      }
    }
    if (!dl && !dr) {
      out.push(k);
      continue;
    }
    const arcBox = tightBox(bin, b, dl ? left[1] : 0, dr ? right[0] : b.w, 0, b.h);
    if (!arcBox) {
      out.push(k);
      continue;
    }
    const dots = [dl, dr].filter((d) => d !== null);
    probe("splitArcEndDots");
    out.push(mk(arcBox), ...dots.map(mk));
  }
  return out;
}
function splitArcInnerDots(bin, comps, numH) {
  const out = [];
  let nextId = 25e5;
  for (const k of comps) {
    out.push(k);
    const b = k.bbox;
    if (b.w < numH * 1.2 || b.h < numH * 0.25 || b.h > numH * 0.9 || b.w < b.h * 2) continue;
    const topAt = (x) => {
      let y = b.y;
      while (y < b.y + b.h && !bin.data[y * bin.w + x]) y++;
      return y;
    };
    const peakY = Math.min(...Array.from({ length: b.w }, (_, i) => topAt(b.x + i)));
    const edge = Math.max(2, Math.round(numH * 0.1));
    if (topAt(b.x + edge) - peakY < numH * 0.3 || topAt(b.x + b.w - 1 - edge) - peakY < numH * 0.3) continue;
    const low = [];
    const runs = [];
    for (let x = b.x; x < b.x + b.w; x++) {
      let y = b.y + b.h - 1;
      while (y >= b.y && !bin.data[y * bin.w + x]) y--;
      if (y < b.y) {
        low.push(null);
        continue;
      }
      const bot = y;
      while (y >= b.y && bin.data[y * bin.w + x]) y--;
      low.push([y + 1, bot]);
      runs.push(bot - y);
    }
    const stroke = median(runs) || 1;
    if (stroke > numH * 0.12) continue;
    const thick = Math.max(stroke * 1.8, numH * 0.15);
    const len = (i) => low[i] ? low[i][1] - low[i][0] + 1 : 0;
    for (let i = 0; i < b.w; ) {
      if (len(i) < stroke * 1.6) {
        i++;
        continue;
      }
      const s = i;
      let peak = 0;
      while (i < b.w && len(i) >= stroke * 1.6) {
        peak = Math.max(peak, len(i));
        i++;
      }
      const w = i - s;
      if (peak < thick || w < numH * 0.12 || w > numH * 0.45) continue;
      let y0 = Infinity, y1 = -1;
      for (let j = s; j < i; j++) {
        y0 = Math.min(y0, low[j][0]);
        y1 = Math.max(y1, low[j][1]);
      }
      const d = { x: b.x + s, y: y0, w, h: y1 - y0 + 1 };
      const ratio = d.w / d.h;
      if (d.h > numH * 0.45 || d.h < numH * 0.12 || ratio < 0.5 || ratio > 1.7 || inkFill(bin, d) < 0.6) continue;
      const side = Math.round(numH * 0.3);
      let lower = false;
      for (let j = Math.max(0, s - side); j < Math.min(b.w, i + side); j++) {
        if ((j < s || j >= i) && low[j] && low[j][1] > y1 + 1) lower = true;
      }
      if (lower) continue;
      probe("splitArcInnerDots");
      out.push({ id: nextId++, bbox: d, area: Math.round(inkFill(bin, d) * d.w * d.h), cx: rcx(d), cy: rcy(d) });
    }
  }
  return out;
}
function splitMordentDot(bin, comps, numH) {
  const out = [];
  let nextId = 27e5;
  const mk = (r) => ({ id: nextId++, bbox: r, area: r.w * r.h, cx: rcx(r), cy: rcy(r) });
  for (const k of comps) {
    const b = k.bbox;
    if (b.w < numH * 0.3 || b.w > numH * 0.6 || b.h < numH * 0.35 || b.h > numH * 0.65) {
      out.push(k);
      continue;
    }
    const span = (y2) => {
      let lo = -1, hi = -1;
      for (let x = 0; x < b.w; x++) if (bin.data[(b.y + y2) * bin.w + b.x + x]) {
        if (lo < 0) lo = x;
        hi = x;
      }
      return lo < 0 ? 0 : hi - lo + 1;
    };
    const spans = Array.from({ length: b.h }, (_, y2) => span(y2));
    let y = b.h - 1;
    while (y >= 0 && spans[y] > 0 && spans[y] <= numH * 0.35) y--;
    const dotH = b.h - 1 - y;
    const dot = dotH > 0 ? tightBox(bin, b, 0, b.w, y + 1, b.h) : null;
    const top = y >= 0 ? tightBox(bin, b, 0, b.w, 0, y + 1) : null;
    if (!dot || !top || dotH < numH * 0.15 || dot.w / dot.h < 0.6 || dot.w / dot.h > 1.7 || top.w < dot.w * 1.3 || top.h < numH * 0.1 || top.h > numH * 0.3) {
      out.push(k);
      continue;
    }
    probe("splitMordentDot");
    out.push(mk(top), mk(dot));
  }
  return out;
}
function classify(comps, bin) {
  const numH = estimateNumH(comps);
  const pageClean = isCleanPage(comps, numH);
  const lineH = strokeLineH(comps, numH);
  const c = { blocks: [], barlines: [], longBarlines: [], hlines: [], dots: [], dashLike: [], clean: pageClean, lineH };
  const barCand = (w, h) => h >= numH * 0.85 && w <= Math.max(2, numH * 0.35) || h >= numH * 1.3 && w <= numH * 0.6 && h / w >= 2.2;
  for (const k of comps) {
    const { w, h } = k.bbox;
    const cand = barCand(w, h);
    if (cand || w <= numH * 0.6 && h > numH * 1.05 || w <= numH && h >= numH * 1.35) {
      const sp = splitMergedOctaveDot(bin, k.bbox, numH, !cand);
      if (sp) {
        c.dots.push(sp.dot);
        c.blocks.push(sp.digit);
        continue;
      }
    }
    const barMaxH = Math.min(numH * 14, bin.h * 0.3);
    if (h >= numH * 0.85 && w <= Math.max(2, numH * 0.35)) {
      if (h > barMaxH) {
        probe("barline.tooTall");
      } else if (h > numH * 6) {
        c.longBarlines.push(k);
        continue;
      } else {
        c.barlines.push(k);
        continue;
      }
    }
    if (h >= numH * 1.3 && h <= barMaxH && w <= numH * 0.6 && h / w >= 3.5) {
      (h > numH * 6 ? c.longBarlines : c.barlines).push(k);
      continue;
    }
    if (h >= numH * 1.3 && h <= numH * 6 && w <= numH * 0.9 && k.area >= w * h * 0.7) {
      const cols = columnInk(bin, k.bbox, 0, h);
      const full = (v) => v >= h * 0.85;
      const valley = cols.some((v, x) => v <= h * 0.3 && cols.slice(0, x).some(full) && cols.slice(x + 1).some(full));
      if (valley && cols.filter(full).length >= w * 0.6) {
        probe("barline.fusedFinal");
        c.barlines.push(k);
        continue;
      }
    }
    {
      const sp = stripUnderline(bin, k, numH, lineH);
      const dotsUnderDigits = !!sp && !sp.digits.length && sp.dots.length > 0 && sp.dots.every((d) => comps.some((o) => o !== k && o.bbox.h >= numH * 0.8 && o.bbox.h <= numH * 1.3 && o.bbox.w <= numH * 1.2 && rcx(d.bbox) >= o.bbox.x && rcx(d.bbox) <= rright(o.bbox) && k.bbox.y - rbottom(o.bbox) >= -2 && k.bbox.y - rbottom(o.bbox) <= numH * 0.6));
      const pureLines = !!sp && !sp.dots.length && !sp.digits.length && sp.lines.length >= 2 && sp.lines.some((a, i) => sp.lines.some((b2, j) => j > i && Math.min(rright(a.bbox), rright(b2.bbox)) - Math.max(a.bbox.x, b2.bbox.x) >= Math.min(a.bbox.w, b2.bbox.w) * 0.5 && // 两道要一般粗：一根厚增时线也会被剥成「线 + 贴着的毛边」（麦子 20×7 → 20×5 + 19×2），毛边不到一半粗；
      // 真双减时线（1218 277，两道之间还连着细丝、框贴着）两道差不多粗
      Math.min(a.bbox.h, b2.bbox.h) >= Math.max(a.bbox.h, b2.bbox.h) * 0.5));
      const digitOn = (o, ln) => o.bbox.h >= numH * 0.8 && o.bbox.h <= numH * 1.3 && o.bbox.w <= numH * 1.2 && rcx(o.bbox) >= ln.bbox.x && rcx(o.bbox) <= rright(ln.bbox) && ln.bbox.y - rbottom(o.bbox) >= -2 && ln.bbox.y - rbottom(o.bbox) <= numH * 0.6;
      const sharedLine = !!sp && sp.digits.length === 1 && sp.lines.length > 0 && (() => {
        const dg = sp.digits[0];
        const mates = comps.filter((o) => o !== k && sp.lines.some((ln) => digitOn(o, ln)) && (rright(o.bbox) < dg.bbox.x || o.bbox.x > rright(dg.bbox)));
        return mates.length > 0 && sp.dots.every((d) => [dg, ...mates].some((o) => rcx(d.bbox) >= o.bbox.x && rcx(d.bbox) <= rright(o.bbox)));
      })();
      const ownLine = !!sp && sp.digits.length === 1 && !sp.dots.length && sp.lines.length > 0 && sp.digits[0].bbox.w <= numH * 0.9;
      if (sp && (pageClean || sp.digits.length >= 2 || dotsUnderDigits || pureLines || sharedLine || ownLine)) {
        if (!pageClean) probe(sp.digits.length >= 2 ? "stripUnderline.dirtyMulti" : sharedLine ? "stripUnderline.dirtySharedLine" : ownLine ? "stripUnderline.dirtyOwnLine" : "stripUnderline.dirtyDotsUnderDigits");
        c.hlines.push(...sp.lines);
        c.dots.push(...sp.dots);
        c.blocks.push(...sp.digits);
        continue;
      }
    }
    if ((w >= numH * 0.6 || w >= numH * 0.4 && w >= k.area / w * 2.6) && h <= Math.max(3, numH * 0.32)) {
      c.hlines.push(k);
      continue;
    }
    if (w >= numH * 0.28 && w >= k.area / w * 1.8 && h <= numH * 0.2) {
      probe("hline.shortDash");
      c.hlines.push(k);
      continue;
    }
    if (w >= numH * 0.33 && w >= k.area / w * 1.6 && h <= numH * 0.25 && k.area >= w * h * 0.75) {
      c.dots.push(k);
      c.dashLike.push(k);
      continue;
    }
    if (w <= numH * 0.45 && h <= numH * 0.45) {
      c.dots.push(k);
      continue;
    }
    if (h >= numH * 0.55 && h <= numH * 2 && w >= numH * 0.3) {
      c.blocks.push(k);
      continue;
    }
    if (w >= numH * 0.3 && w <= numH * 0.6 && h >= numH * 0.5 && h <= numH * 2) {
      c.blocks.push(k);
      continue;
    }
  }
  {
    const tallH = median(c.barlines.filter((k) => k.bbox.h > numH * 1.4).map((k) => k.bbox.h)) || 0;
    const slim = (k) => k.bbox.w <= Math.max(3, numH * 0.2);
    const thin = (k) => slim(k) && k.bbox.h <= numH * 1.4;
    const gapMax = Math.max(3, numH * 0.15);
    const joinable = (a, b) => Math.abs(rcx(a) - rcx(b)) <= 2 && Math.max(a.y, b.y) - Math.min(rbottom(a), rbottom(b)) <= gapMax;
    const joinTall = (a, b) => slim(a) && slim(b) && joinable(a.bbox, b.bbox) && unionRect(a.bbox, b.bbox).h <= tallH * 1.1;
    const merged = [];
    const used = /* @__PURE__ */ new Set();
    for (const k of c.barlines) {
      if (used.has(k)) continue;
      if (!slim(k)) {
        merged.push(k);
        continue;
      }
      let bb = k.bbox, n = 1, area = k.area, grew = true;
      while (grew) {
        grew = false;
        for (const o of c.barlines) {
          if (o === k || used.has(o)) continue;
          const cur = { ...k, bbox: bb };
          if (!(thin(k) && thin(o) && joinable(bb, o.bbox)) && !joinTall(cur, o)) continue;
          used.add(o);
          bb = unionRect(bb, o.bbox);
          area += o.area;
          n++;
          grew = true;
        }
      }
      if (n > 1) {
        probe("barline.rejoined");
        merged.push({ id: k.id, bbox: bb, area, cx: rcx(bb), cy: rcy(bb) });
      } else merged.push(k);
    }
    c.barlines = merged;
  }
  if (c.barlines.length >= 4) {
    const medH = median(c.barlines.map((k) => k.bbox.h));
    const real = [];
    for (const k of c.barlines) {
      const digitOneSized = k.bbox.h <= numH * 1.25 && k.bbox.w >= numH * 0.28;
      if (digitOneSized || k.bbox.h < medH * 0.55) {
        const paired = c.barlines.some((o) => o !== k && Math.abs(rcx(o.bbox) - rcx(k.bbox)) < numH * 0.7 && Math.abs(rcy(o.bbox) - rcy(k.bbox)) < numH && o.bbox.h <= k.bbox.h * 2);
        if (!paired && k.bbox.w < numH * 0.2) {
          probe("barline.residue");
          if (k.bbox.h >= numH) real.push(k);
          continue;
        }
        if (!paired) {
          c.blocks.push(k);
          continue;
        }
      }
      real.push(k);
    }
    c.barlines = real;
  }
  return { c, numH };
}
function columnInk(bin, b, y0, yLimit) {
  const cols = new Array(b.w).fill(0);
  for (let xx = 0; xx < b.w; xx++) {
    let cnt = 0;
    for (let yy = y0; yy < yLimit; yy++) {
      if (bin.data[(b.y + yy) * bin.w + (b.x + xx)]) cnt++;
    }
    cols[xx] = cnt;
  }
  return cols;
}
function rowInk(bin, b) {
  const rows = new Array(b.h).fill(0);
  for (let yy = 0; yy < b.h; yy++) {
    let cnt = 0;
    for (let xx = 0; xx < b.w; xx++) {
      if (bin.data[(b.y + yy) * bin.w + (b.x + xx)]) cnt++;
    }
    rows[yy] = cnt;
  }
  return rows;
}
function tightBox(bin, b, x0, x1, y0, yLimit) {
  let minX = x1, maxX = x0 - 1, minY = yLimit, maxY = -1;
  for (let yy = y0; yy < yLimit; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      if (bin.data[(b.y + yy) * bin.w + (b.x + xx)]) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: b.x + minX, y: b.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
function splitDigitDash(bin, comps, numH) {
  const out = [];
  let nextId = 9e6;
  const thin = Math.max(3, numH * 0.22), minRun = numH * 0.25;
  for (const k of comps) {
    const b = k.bbox;
    if (b.h < numH * 0.8 || b.h > numH * 1.3 || b.w < numH || b.w > numH * 5) {
      out.push(k);
      continue;
    }
    const kind = [];
    const colH = [];
    for (let xx = 0; xx < b.w; xx++) {
      let top = -1, bot = -1;
      for (let yy = 0; yy < b.h; yy++) if (bin.data[(b.y + yy) * bin.w + b.x + xx]) {
        if (top < 0) top = yy;
        bot = yy;
      }
      const h = top < 0 ? 0 : bot - top + 1;
      colH.push(h);
      kind.push(top < 0 ? 0 : h <= thin && top >= b.h * 0.2 && bot <= b.h * 0.85 ? 1 : 2);
    }
    const segs = [];
    for (let xx = 0; xx < b.w; ) {
      if (!kind[xx]) {
        xx++;
        continue;
      }
      const kd = kind[xx];
      let e = xx;
      while (e + 1 < b.w && kind[e + 1] === kd) e++;
      const dash = kd === 1 && e - xx + 1 >= minRun;
      const last = segs[segs.length - 1];
      if (!dash && last && !last.dash && last.x1 === xx) last.x1 = e + 1;
      else segs.push({ x0: xx, x1: e + 1, dash });
      xx = e + 1;
    }
    const digits = segs.filter((g) => !g.dash);
    const okDigits = digits.length > 0 && digits.every((g) => {
      let mx = 0;
      for (let xx = g.x0; xx < g.x1; xx++) mx = Math.max(mx, colH[xx]);
      return mx >= b.h * 0.6 && g.x1 - g.x0 <= numH * 1.1;
    });
    if (!segs.some((g) => g.dash) || !okDigits) {
      out.push(k);
      continue;
    }
    const boxes = segs.map((g) => tightBox(bin, b, g.x0, g.x1, 0, b.h));
    const onBody = segs.every((g, i) => {
      if (!g.dash) return true;
      const db = boxes[i];
      const nb = [boxes[i - 1], boxes[i + 1]].filter((r, j) => r && !segs[i + (j ? 1 : -1)]?.dash);
      return !!db && nb.length > 0 && nb.every((r) => rcy(db) >= r.y + r.h * 0.25 && rcy(db) <= r.y + r.h * 0.88);
    });
    if (!onBody) {
      probe("splitDigitDash.offBody");
      out.push(k);
      continue;
    }
    if (segs.some((g, i) => !g.dash && g.x1 - g.x0 < numH * 0.3 && segs[i - 1]?.dash && segs[i + 1]?.dash)) {
      probe("splitDigitDash.cross");
      out.push(k);
      continue;
    }
    const parts = [];
    for (const g of segs) {
      const r = tightBox(bin, b, g.x0, g.x1, 0, b.h);
      if (!r) continue;
      let area = 0;
      for (let yy = r.y; yy < rbottom(r); yy++) for (let xx = r.x; xx < rright(r); xx++) if (bin.data[yy * bin.w + xx]) area++;
      parts.push({ id: nextId++, bbox: r, area, cx: rcx(r), cy: rcy(r) });
    }
    probe("splitDigitDash");
    out.push(...parts);
  }
  return out;
}
function mergedArcSplit(bin, b, numH) {
  if (b.h <= numH * 1.2 || b.w < numH * 1.2) return { bodyTop: 0, arc: null };
  const rows = rowInk(bin, b);
  const maxInk = Math.max(...rows);
  const lo = Math.floor(numH * 0.3), hi = Math.floor(b.h - numH * 0.6);
  let vIdx = -1, vMin = Infinity;
  for (let y = lo; y < hi; y++) if (rows[y] < vMin) {
    vMin = rows[y];
    vIdx = y;
  }
  if (vIdx < 0 || vMin >= maxInk * 0.3) return { bodyTop: 0, arc: null };
  let bodyTop = vIdx;
  for (let y = vIdx; y < b.h; y++) if (rows[y] >= maxInk * 0.35) {
    bodyTop = y;
    break;
  }
  if (bodyTop < numH * 0.2 || bodyTop > numH * 0.85 || b.h - bodyTop < numH * 0.7) return { bodyTop: 0, arc: null };
  const arc = tightBox(bin, b, 0, b.w, 0, bodyTop);
  if (!arc || arc.w < b.w * 0.55) return { bodyTop: 0, arc: null };
  probe("mergedArcSplit");
  return { bodyTop, arc };
}
function splitBlock(bin, comp, numH) {
  const b = comp.bbox;
  const div = 0;
  const { arc } = mergedArcSplit(bin, b, numH);
  const yLimit = b.h;
  const cores = [];
  if (b.w <= numH * 1.4) {
    const box = tightBox(bin, b, 0, b.w, 0, yLimit) ?? { x: b.x, y: b.y, w: b.w, h: yLimit };
    cores.push({ bbox: box, div });
    return { cores, arc };
  }
  const cols = columnInk(bin, b, 0, yLimit);
  const segs = [];
  let s = -1;
  for (let xx = 0; xx < b.w; xx++) {
    if (cols[xx] > 0) {
      if (s < 0) s = xx;
    } else if (s >= 0) {
      segs.push([s, xx]);
      s = -1;
    }
  }
  if (s >= 0) segs.push([s, b.w]);
  const minSeg = numH * 0.3;
  const merged = [];
  for (const [a, e] of segs) {
    if (e - a < minSeg && merged.length) merged[merged.length - 1][1] = e;
    else merged.push([a, e]);
  }
  for (const [a, e] of merged.length ? merged : segs) {
    const box = tightBox(bin, b, a, e, 0, yLimit);
    if (box) cores.push({ bbox: box, div });
  }
  return { cores: cores.length ? cores : [{ bbox: { x: b.x, y: b.y, w: b.w, h: yLimit }, div }], arc };
}
function splitGluedSharp(bin, comp, numH) {
  const b = comp.bbox;
  if (b.w < numH * 0.95 || b.w > numH * 1.9 || b.h < numH * 0.8 || b.h > numH * 1.5) return null;
  const cols = columnInk(bin, b, 0, b.h);
  {
    let c2 = -1;
    for (let xx = Math.round(numH * 0.25); xx <= Math.min(b.w - Math.round(numH * 0.3), Math.round(numH * 0.55)); xx++)
      if (c2 < 0 || cols[xx] < cols[c2]) c2 = xx;
    if (c2 >= 0 && cols[c2] <= numH * 0.2) {
      const l = tightBox(bin, b, 0, c2, 0, b.h), r = tightBox(bin, b, c2, b.w, 0, b.h);
      if (l && r && r.h >= numH * 0.7 && r.w >= numH * 0.3 && l.w >= numH * 0.25 && l.h >= numH * 0.35 && l.h <= r.h * 0.75 && rbottom(r) - rbottom(l) >= numH * 0.2 && accidentalOf(bin, l) === "flat") {
        probe("splitGluedFlat");
        return [{ bbox: l, div: 0 }, { bbox: r, div: 0 }];
      }
    }
  }
  if (b.w < numH) return null;
  let cut = -1;
  for (let xx = Math.round(numH * 0.45); xx <= Math.min(b.w - Math.round(numH * 0.2), Math.round(numH * 0.9)); xx++)
    if (cut < 0 || cols[xx] < cols[cut]) cut = xx;
  if (cut < 0 || cols[cut] > numH * 0.3) return null;
  const left = tightBox(bin, b, 0, cut, 0, b.h), right = tightBox(bin, b, cut, b.w, 0, b.h);
  if (!left || !right || right.h < numH * 0.7 || left.h < numH * 0.5 || left.w < numH * 0.4) return null;
  const bands = (flags) => flags.reduce((n, f, i) => n + (f && !flags[i - 1] ? 1 : 0), 0);
  const colFull = [], rowFull = [];
  for (let x = left.x; x < rright(left); x++) {
    let n = 0;
    for (let y = left.y; y < rbottom(left); y++) if (bin.data[y * bin.w + x]) n++;
    colFull.push(n >= left.h * 0.55);
  }
  for (let y = left.y; y < rbottom(left); y++) {
    let best = 0, cur = 0;
    for (let x = left.x; x < rright(left); x++) {
      if (bin.data[y * bin.w + x]) {
        if (++cur > best) best = cur;
      } else cur = 0;
    }
    rowFull.push(best >= left.w * 0.85);
  }
  if (bands(colFull) !== 2 || bands(rowFull) !== 2) return null;
  probe("splitGluedSharp");
  return [{ bbox: left, div: 0 }, { bbox: right, div: 0 }];
}
function groupRows(cores, numH) {
  const greedy = (list, into) => {
    for (const d of [...list].sort((a, b) => rcy(a.bbox) - rcy(b.bbox))) {
      let placed = false;
      for (const row of into) {
        const ry = median(row.map((k) => rcy(k.bbox)));
        if (Math.abs(rcy(d.bbox) - ry) < numH * 0.7) {
          row.push(d);
          placed = true;
          break;
        }
      }
      if (!placed) into.push([d]);
    }
    return into;
  };
  const rows = greedy(cores.filter((k) => k.bbox.h >= numH * 0.7), []);
  const orphans = [];
  for (const d of cores.filter((k) => k.bbox.h < numH * 0.7)) {
    let best = null;
    let bestDist = numH * 0.7;
    for (const row of rows) {
      const dist = Math.abs(rcy(d.bbox) - median(row.map((k) => rcy(k.bbox))));
      if (dist < bestDist) {
        best = row;
        bestDist = dist;
      }
    }
    if (best) best.push(d);
    else orphans.push(d);
  }
  rows.push(...greedy(orphans, []));
  for (const row of rows) row.sort((a, b) => a.bbox.x - b.bbox.x);
  rows.sort((a, b) => median(a.map((k) => rcy(k.bbox))) - median(b.map((k) => rcy(k.bbox))));
  return rows;
}
function meterCandidates(cores, hlines, numH, spare = []) {
  const out = [];
  const real = new Set(cores);
  const pool = [...cores, ...spare];
  for (const h of hlines) {
    const hb = h.bbox;
    if (hb.w < numH * 0.35 || hb.w > numH * 1.6) continue;
    const hcx = rcx(hb);
    const near = (k) => Math.abs(rcx(k.bbox) - hcx) <= Math.max(numH * 0.3, hb.w * 0.5);
    const pick = (cands, key) => cands.sort((a, b) => key(a) - key(b))[0];
    const up = pick(pool.filter((k) => near(k) && hb.y - rbottom(k.bbox) >= -2 && hb.y - rbottom(k.bbox) < numH * 0.55), (k) => hb.y - rbottom(k.bbox));
    const dn = pick(pool.filter((k) => near(k) && k.bbox.y - rbottom(hb) >= -2 && k.bbox.y - rbottom(hb) < numH * 0.55), (k) => k.bbox.y - rbottom(hb));
    if (!up || !dn) continue;
    if (!real.has(up) && !real.has(dn)) continue;
    if (!real.has(up) || !real.has(dn)) {
      const [a, b] = [up.bbox.h, dn.bbox.h].sort((x, y) => x - y);
      if (a < b * 0.8) continue;
    }
    if (up.bbox.w > hb.w * 1.5 || dn.bbox.w > hb.w * 1.5) continue;
    if (stackedHline(hlines, hb, numH)) {
      probe("meter.stackedLine");
      continue;
    }
    out.push({ line: h, up, dn, bbox: unionRect(unionRect(up.bbox, dn.bbox), hb) });
  }
  const inCand = new Set(out.flatMap((m) => [m.up, m.dn]));
  const rowMate = (k) => cores.some((o) => o !== k && !inCand.has(o) && o.bbox.h >= k.bbox.h * 0.7 && Math.abs(rcy(o.bbox) - rcy(k.bbox)) <= numH * 0.2 && Math.abs(rcx(o.bbox) - rcx(k.bbox)) <= numH * 5);
  return out.filter((m) => {
    if (rowMate(m.up) && rowMate(m.dn)) {
      probe("meter.voiceRows");
      return false;
    }
    return true;
  });
}
const validMeter = (n, d) => n >= 1 && n <= 16 && (d === 2 || d === 4 || d === 8 || d === 16);
function stackedHline(hlines, kb, numH) {
  return hlines.some((o) => {
    const ob = o.bbox;
    if (ob === kb) return false;
    const dy = rcy(ob) - rcy(kb);
    if (dy === 0 || Math.abs(dy) > numH * 0.45) return false;
    return overlapX(ob, kb) >= Math.min(ob.w, kb.w) * 0.5;
  });
}
function inkAbove(bin, r, numH, skip = []) {
  const y1 = Math.round(r.y) - 1, y0 = Math.max(0, Math.round(r.y - numH * 0.18));
  const x0 = Math.max(0, Math.round(r.x - numH * 0.2)), x1 = Math.min(bin.w - 1, Math.round(rright(r) + numH * 0.2));
  if (y1 <= y0 || x1 <= x0) return 0;
  const inSkip = (x, y) => skip.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
  let ink = 0, tot = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    tot++;
    if (bin.data[y * bin.w + x] && !inSkip(x, y)) ink++;
  }
  return tot ? ink / tot : 0;
}
function inkBelow(bin, r, numH) {
  const y0 = Math.round(rbottom(r)) + 1, y1 = Math.min(bin.h - 1, Math.round(rbottom(r) + numH * 0.18));
  const x0 = Math.max(0, Math.round(r.x - numH * 0.2)), x1 = Math.min(bin.w - 1, Math.round(rright(r) + numH * 0.2));
  if (y1 <= y0 || x1 <= x0) return 0;
  let ink = 0, tot = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    tot++;
    if (bin.data[y * bin.w + x]) ink++;
  }
  return tot ? ink / tot : 0;
}
function resolveDashLike(cls, rowCores, numH) {
  if (!cls.dashLike.length) return;
  for (const k of [...cls.dashLike]) {
    const kb = k.bbox;
    const d = rowCores.map((c) => c.bbox).filter((b) => kb.x >= rright(b) - 1 && kb.y < rbottom(b) + numH * 0.5 && rbottom(kb) > b.y - numH * 0.5).sort((a, b) => rright(b) - rright(a))[0];
    const onMid = !!d && kb.y < rbottom(d) && rbottom(kb) > d.y && Math.abs(rcy(kb) - rcy(d)) <= numH * 0.25;
    if (!onMid) continue;
    probe("hline.shortDashThick");
    cls.dots.splice(cls.dots.indexOf(k), 1);
    cls.dashLike.splice(cls.dashLike.indexOf(k), 1);
    cls.hlines.push(k);
  }
}
const octDotsOf = /* @__PURE__ */ new WeakMap();
function resolvePairOctaveDots(rows, numH) {
  const bySys = /* @__PURE__ */ new Map();
  for (const r of rows) if (r.system !== void 0) (bySys.get(r.system) ?? bySys.set(r.system, []).get(r.system)).push(r);
  const pitch = (n, oct) => oct * 7 + n.digit;
  for (const g of bySys.values()) {
    if (g.length % 2) continue;
    g.sort((a, b) => a.voice - b.voice);
    for (let v = 0; v + 1 < g.length; v += 2) {
      const upper = g[v], lower = g[v + 1];
      const aligned = (ns, kb) => ns.find((n) => n.digit >= 1 && n.digit <= 7 && Math.abs(rcx(n.bbox) - rcx(kb)) <= numH * 0.4);
      const seen = /* @__PURE__ */ new Set();
      for (const n of [...upper.nums, ...lower.nums]) {
        const od = octDotsOf.get(n);
        if (!od) continue;
        for (const kb of [...od.up, ...od.down, ...od.nearDown]) {
          if (seen.has(kb)) continue;
          seen.add(kb);
          const u = aligned(upper.nums, kb), l = aligned(lower.nums, kb);
          if (!u || !l || rbottom(u.bbox) > kb.y + 1 || rbottom(kb) > l.bbox.y + 1) continue;
          const uo = octDotsOf.get(u), lo = octDotsOf.get(l);
          if (!uo || !lo) continue;
          const uClaim = uo.down.includes(kb), lClaim = lo.up.includes(kb);
          if (!uClaim && !lClaim && !uo.nearDown.includes(kb)) continue;
          const uBase = u.octave + (uClaim ? 1 : 0), lBase = l.octave - (lClaim ? 1 : 0);
          let a = !uo.up.some((o) => o !== kb), b = !lo.down.some((o) => o !== kb);
          if (a && b) {
            const pa = pitch(u, uBase - 1) >= pitch(l, lBase), pb = pitch(u, uBase) >= pitch(l, lBase + 1);
            if (pa !== pb) {
              a = pa;
              b = pb;
            }
          }
          if (a === b) continue;
          if (!uClaim && !lClaim && !a) continue;
          const nu = Math.max(-3, uBase - (a ? 1 : 0)), nl = Math.min(3, lBase + (b ? 1 : 0));
          if (nu !== u.octave || nl !== l.octave) probe("octave.pairResolve");
          u.octave = nu;
          l.octave = nl;
          if (a) {
            if (lClaim) lo.up.splice(lo.up.indexOf(kb), 1);
            if (!uClaim) uo.down.push(kb);
          } else {
            if (uClaim) uo.down.splice(uo.down.indexOf(kb), 1);
            if (!lClaim) lo.up.push(kb);
          }
        }
      }
    }
  }
}
const dashUnitOf = /* @__PURE__ */ new WeakMap();
function buildJpNums(bin, rowCores, numH, cls, ocrDigit, arcs, barlineXs, dotSizes, voiceMates = [], otherMates = []) {
  const out = [];
  const rowBots = rowCores.map((c) => rbottom(c.bbox)).sort((a, b) => a - b);
  const rowBot = rowBots[rowBots.length >> 1] ?? 0;
  const rowX0 = Math.min(...rowCores.map((c) => c.bbox.x)), rowX1 = Math.max(...rowCores.map((c) => rright(c.bbox)));
  const topsWithin = (reach) => cls.blocks.filter((k) => k.bbox.h >= numH * 0.7 && k.bbox.y > rowBot && k.bbox.y < rowBot + numH * reach && rright(k.bbox) > rowX0 && k.bbox.x < rowX1).map((k) => k.bbox.y).sort((a, b) => a - b);
  let lyTops = topsWithin(0.9);
  if (lyTops.length < 3) lyTops = topsWithin(1.4);
  const lyricTop = lyTops.length >= 3 ? lyTops[lyTops.length >> 1] : -Infinity;
  const dotSized = (kb) => !cls.clean || inkFill(bin, kb) >= 0.6;
  resolveDashLike(cls, rowCores, numH);
  const looseLow = (dot) => dot.y < lyricTop && rbottom(dot) <= lyricTop + 4;
  const lowSuspect = rowCores.map((c) => cls.dots.some((k) => {
    const kb = k.bbox, gap = kb.y - rbottom(c.bbox);
    return Math.abs(rcx(kb) - rcx(c.bbox)) <= numH * 0.35 && gap >= -1 && gap < numH * 0.8 && kb.w <= numH * 0.45 && kb.h <= numH * 0.45 && (rbottom(kb) <= lyricTop - 2 || looseLow(kb));
  }));
  for (let i = 0; i < rowCores.length; i++) {
    const d = rowCores[i].bbox;
    const next = rowCores[i + 1]?.bbox;
    const nextBar = barlineXs.find((x) => x > rright(d) - 1);
    const rightLimit = nextBar ?? Number.POSITIVE_INFINITY;
    const augR = Math.min(next ? next.x : Number.POSITIVE_INFINITY, rightLimit);
    let octave = 0, dot = 0, augment = 0;
    const upDots = [], downDots = [];
    const nearDown = [];
    const doubts = [];
    let digit = ocrDigit(d);
    if ((digit === 4 || digit === 7) && d.w <= numH * 0.45) digit = 1;
    const dcx = rcx(d), dcy = rcy(d);
    const dotMaxX = Math.min(
      next ? rright(d) + (next.x - rright(d)) * (next.w < numH * 0.45 ? 0.7 : 0.6) : rright(d) + numH * 1.6,
      rightLimit
    );
    for (const k of cls.dots) {
      const kb = k.bbox;
      const repeatColon = barlineXs.some((x) => Math.abs(x - rcx(kb)) <= numH * 1.2) && cls.dots.some((o) => {
        if (o === k) return false;
        const ob = o.bbox;
        const dy = Math.abs(rcy(ob) - rcy(kb));
        return Math.abs(rcx(ob) - rcx(kb)) <= numH * 0.35 && dy >= numH * 0.35 && dy <= numH * 1.4;
      });
      if (repeatColon && rcx(kb) > rright(d)) continue;
      const overDigit = rowCores.some((c) => Math.abs(rcx(c.bbox) - rcx(kb)) < numH * 0.3);
      const onBaseline = rcy(kb) > dcy && kb.y >= d.y && rbottom(kb) <= rbottom(d) + numH * 0.1;
      const farDotX = next ? Math.min(rright(d) + (next.x - rright(d)) * 0.85, rightLimit) : dotMaxX;
      const inWin = rcx(kb) < dotMaxX || rcx(kb) < farDotX && Math.abs(rcy(kb) - dcy) < numH * 0.3 && k.area >= kb.w * kb.h * 0.6;
      if (rcx(kb) > rright(d) && inWin && !overDigit && kb.w >= numH * 0.12 && kb.h >= numH * 0.12 && kb.w + kb.h >= numH * 0.3 && (Math.abs(rcy(kb) - dcy) < numH * 0.35 || onBaseline)) {
        if (rcx(kb) >= dotMaxX) probe("dot.farWindow");
        dot++;
        dotSizes.push((kb.w + kb.h) / 2);
        continue;
      }
      const outer = voiceMates.length > 0 && rcy(kb) > dcy && kb.y - rbottom(d) < numH * 0.45 && ![...voiceMates, ...otherMates].some((ob) => ob.y >= rbottom(d) && ob.y - rbottom(d) < numH * 1.8);
      const minSide = numH * 0.12, minSum = numH * (outer ? 0.27 : 0.3);
      if (kb.w < minSide || kb.h < minSide || kb.w + kb.h < minSum) continue;
      const centerLimit = numH * (voiceMates.length ? 0.35 : 0.25);
      if (Math.abs(rcx(kb) - dcx) > centerLimit) {
        const g = Math.max(d.y - rbottom(kb), kb.y - rbottom(d));
        if (Math.abs(rcx(kb) - dcx) <= centerLimit * 1.3 && g >= -1 && g < numH * 0.8) doubts.push("oct.offCenter");
        continue;
      }
      const hasSideMate = (k2) => cls.dots.some((o) => {
        const ob = o.bbox;
        if (ob === k2) return false;
        const dx = Math.abs(rcx(ob) - rcx(k2));
        if (dx <= (k2.w + ob.w) / 2 || dx > numH * 0.7) return false;
        if (Math.abs(rcy(ob) - rcy(k2)) > Math.max(2, k2.h * 0.8)) return false;
        if (ob.w * ob.h < k2.w * k2.h * 0.3) return false;
        if (voiceMates.length && rowCores.length && rcx(ob) < rowCores[0].bbox.x) return false;
        return !rowCores.some((c2) => Math.abs(rcx(c2.bbox) - rcx(ob)) < numH * 0.3);
      });
      const gapAbove = d.y - rbottom(kb);
      const gapBelow = kb.y - rbottom(d);
      const aboveLyrics = (dot2) => rbottom(dot2) <= lyricTop - 2 || voiceMates.length > 0 && looseLow(dot2) && (lowSuspect[i - 1] || lowSuspect[i + 1]);
      const hanzi = (k2) => k2.bbox.h >= numH * 0.85 && k2.bbox.h <= numH * 1.6 && k2.bbox.w >= k2.bbox.h * 0.7 && !rowCores.some((c) => c.bbox === k2.bbox);
      const inTextLine = (dot2) => {
        if (Math.max(d.y - rbottom(dot2), dot2.y - rbottom(d)) <= numH * 0.35) return false;
        const near = cls.blocks.filter((k2) => hanzi(k2) && Math.abs(rcx(k2.bbox) - rcx(dot2)) <= numH * 4 && rcy(dot2) >= k2.bbox.y && rcy(dot2) <= rbottom(k2.bbox));
        return near.length >= 2 && near.some((k2) => overlapX(k2.bbox, d) === 0 && Math.abs(rcx(k2.bbox) - rcx(dot2)) <= numH * 2.5);
      };
      const underOwnLine = (dot2) => voiceMates.length > 0 && cls.hlines.some((l) => l.bbox.y >= rbottom(d) - 2 && rbottom(l.bbox) <= dot2.y + 1 && overlapX(l.bbox, d) >= d.w * 0.5 && rcx(dot2) >= l.bbox.x && rcx(dot2) <= rright(l.bbox));
      const overArc = (dot2) => voiceMates.length > 0 && arcs.some((a) => a.bbox.w >= numH && a.bbox.h <= numH * 0.5 && a.bbox.y >= rbottom(dot2) - 1 && a.bbox.y <= rbottom(dot2) + numH * 0.3 && rcx(dot2) >= a.bbox.x && rcx(dot2) <= rright(a.bbox));
      const nearerOther = (up) => [...voiceMates, ...otherMates].some((ob) => {
        if (Math.abs(rcx(ob) - rcx(kb)) > numH * 0.3) return false;
        if (up) return rbottom(ob) <= d.y && kb.y - rbottom(ob) >= -1 && kb.y - rbottom(ob) < gapAbove * 0.8;
        return ob.y >= rbottom(d) && ob.y - rbottom(kb) >= -1 && ob.y - rbottom(kb) < gapBelow * 0.8;
      });
      const lineBot = Math.max(-Infinity, ...cls.hlines.filter((l) => l.bbox.y >= rbottom(d) - 2 && rbottom(l.bbox) <= kb.y + 1 && overlapX(l.bbox, d) >= d.w * 0.5 && rcx(kb) >= l.bbox.x && rcx(kb) <= rright(l.bbox)).map((l) => rbottom(l.bbox)));
      const belowReach = gapBelow < numH * 0.8 || kb.y - lineBot < numH * 0.4 && gapBelow < numH * 1.3;
      if (gapAbove >= -1 && gapAbove < numH * 0.8) {
        const footReach = numH * (voiceMates.length ? 0.25 : 0.4);
        const inward = (ab) => rcx(kb) - ab.x <= rright(ab) - rcx(kb) ? rcx(kb) - ab.x : rright(ab) - rcx(kb);
        const solidDot = voiceMates.length > 0 && inkFill(bin, kb) >= 0.65 && Math.abs(rcx(kb) - rcx(d)) <= numH * 0.2 && Math.max(kb.w, kb.h) <= Math.min(kb.w, kb.h) * 1.4;
        const isArcFoot = !cls.clean && arcs.some((arc) => {
          const ab = arc.bbox;
          if (solidDot && Math.min(kb.w, kb.h) >= (median(columnInk(bin, ab, 0, ab.h).filter((v) => v > 0)) || 1) * 1.3) return false;
          return rbottom(ab) > kb.y && rbottom(ab) <= rbottom(kb) + numH * 0.15 && rcx(kb) >= ab.x - footReach && rcx(kb) <= rright(ab) + footReach && inward(ab) <= Math.max(kb.w / 2, numH * 0.15);
        });
        const underText = voiceMates.length > 0 && inkAbove(
          bin,
          kb,
          numH,
          // 只扣**拱起来**的（框高是平均线厚的 2.2 倍以上）：上声部的减时线也在弧候选里，扣了它，线下的低音点就被下声部
          // 收成高音点（249 `2̇·` 成了双高音点）
          // 点还得在**弧端**（弧宽两头三成内）：弧正中下方一颗点是延长记号 ⌒·（四声部 10 行末 `1` 头上那个），照旧算墨挡掉
          arcs.filter((a) => a.bbox.w >= numH * 0.7 && a.bbox.h <= numH * 0.8 && a.bbox.h >= numH * 0.2 && a.bbox.h > a.area / a.bbox.w * 2.2 && Math.abs(rcx(kb) - rcx(a.bbox)) >= a.bbox.w * 0.2).map((a) => a.bbox)
        ) >= 0.12;
        const belowTextLine = () => {
          if (!voiceMates.length || !solidDot || gapAbove > numH * 0.35) return false;
          const chars = cls.blocks.filter((k2) => !rowCores.some((c) => c.bbox === k2.bbox) && k2.bbox.h >= numH * 0.45 && rbottom(k2.bbox) <= d.y && rbottom(k2.bbox) >= kb.y - numH * 0.3 && Math.abs(rcx(k2.bbox) - rcx(kb)) <= numH * 3);
          if (chars.length < 2 || !chars.some((k2) => rcx(kb) >= k2.bbox.x && rcx(kb) <= rright(k2.bbox))) return false;
          return kb.y >= median(chars.map((k2) => rbottom(k2.bbox))) - 1;
        };
        if (underText && belowTextLine()) probe("octave.belowTextLine");
        if (!isArcFoot && dotSized(kb) && !hasSideMate(kb) && !nearerOther(true) && (!underText || belowTextLine()) && !inTextLine(kb)) {
          upDots.push(kb);
        }
      } else if (gapBelow >= -1 && belowReach && (inkBelow(bin, kb, numH) < 0.12 || underOwnLine(kb) || overArc(kb) || aboveLyrics(kb)) && dotSized(kb) && !hasSideMate(kb) && !inTextLine(kb)) {
        if (!nearerOther(false)) downDots.push(kb);
        else nearDown.push(kb);
      }
    }
    const stackCount = (dots, up) => {
      const sorted = [...dots].sort((a, b) => up ? rbottom(b) - rbottom(a) : a.y - b.y);
      let n = 0, prev2 = null;
      for (const kb of sorted) {
        const diam = (kb.w + kb.h) / 2;
        if (prev2) {
          if (Math.abs(rcx(kb) - rcx(prev2)) > Math.max(2, diam * 0.9)) break;
          const areaA = kb.w * kb.h, areaB = prev2.w * prev2.h;
          if (Math.min(areaA, areaB) < Math.max(areaA, areaB) * 0.5) break;
          const coreA = inkCount(bin, kb), coreB = inkCount(bin, prev2);
          if (Math.max(coreA, coreB) >= 6 && Math.min(coreA, coreB) < Math.max(coreA, coreB) * 0.5) break;
          const gap = up ? prev2.y - rbottom(kb) : kb.y - rbottom(prev2);
          if (gap < -1 || gap > diam * 1.6) break;
        }
        n++;
        prev2 = kb;
        dotSizes.push(diam);
      }
      return n;
    };
    octave = stackCount(upDots, true) - stackCount(downDots, false);
    octave = Math.max(-3, Math.min(3, octave));
    let div = 0;
    const augmentRects = [];
    const belowLines = [];
    const dashUnit = () => {
      let u = dashUnitOf.get(cls);
      if (u === void 0) {
        const ws = cls.hlines.map((h) => h.bbox).filter((hb) => hb.w <= numH * 1.2 && cls.blocks.some((k) => Math.abs(rcy(hb) - rcy(k.bbox)) <= k.bbox.h * 0.35 && hb.x >= rright(k.bbox) - 1 && hb.x - rright(k.bbox) <= numH * 3)).map((hb) => hb.w);
        u = ws.length >= 5 ? median(ws) : 0;
        dashUnitOf.set(cls, u);
      }
      return u;
    };
    for (const k of cls.hlines) {
      const kb = k.bbox;
      const yOverlap = kb.y < rbottom(d) && rbottom(kb) > d.y;
      const dcy0 = rcy(kb) - rcy(d);
      const centered = dcy0 >= -numH * 0.25 && dcy0 <= numH * (voiceMates.length ? 0.35 : 0.25);
      if (kb.x >= rright(d) - 1 && kb.x < augR && yOverlap && centered && !stackedHline(cls.hlines, kb, numH) && overlapX(kb, d) < kb.w * 0.4) {
        const unit = voiceMates.length ? dashUnit() : 0;
        const fit = unit ? kb.w / unit : 1;
        const prevR = Math.max(rright(d), ...augmentRects.map(rright));
        const n = fit >= 1.7 && Math.abs(fit - Math.round(fit)) <= 0.3 && kb.x - prevR <= unit * 0.25 ? Math.min(3, Math.round(fit)) : 1;
        if (n > 1) probe("augment.longDash");
        augment += n;
        augmentRects.push(kb);
        continue;
      }
      const below = kb.y - rbottom(d);
      const curved = kb.h >= numH * 0.2 && kb.h > k.area / kb.w * 2.2;
      const crossesBar = barlineXs.some((x) => x > kb.x + 2 && x < rright(kb) - 2);
      const underDot = cls.dots.some((o) => Math.abs(rcx(o.bbox) - rcx(d)) <= numH * 0.3 && o.bbox.y >= rbottom(d) - 1 && rbottom(o.bbox) <= kb.y + 1);
      if (!curved && !crossesBar && !underDot && below > -numH * 0.2 && below < numH * 0.75 && overlapX(kb, d) >= Math.min(kb.w, d.w) * 0.4) {
        belowLines.push(kb);
      }
    }
    belowLines.sort((a, b) => a.y - b.y);
    let prev = null;
    for (const kb of belowLines) {
      if (prev === null) {
        if (kb.y - rbottom(d) > numH * 0.45) break;
      } else {
        const gap = kb.y - prev.y;
        if (gap > numH * 0.4 || gap > Math.max(prev.h, kb.h) * 4.5) break;
      }
      div++;
      prev = kb;
    }
    if ([...upDots, ...downDots].some((kb) => inkFill(bin, kb) < 0.55 || Math.max(kb.w, kb.h) > Math.min(kb.w, kb.h) * 1.7)) doubts.push("oct.oddShape");
    if (!upDots.length && dotInkAbove(bin, d, numH)) doubts.push("oct.inkAbove");
    const jn = { digit, bbox: d, dot, octave, div, augment, augmentRects, ...doubts.length ? { doubt: doubts } : {} };
    octDotsOf.set(jn, { up: upDots, down: downDots, nearDown });
    out.push(jn);
  }
  recountUnderlines(bin, out, numH, cls, barlineXs, voiceMates);
  if (out.length >= 4) {
    const cys = out.map((n) => rcy(n.bbox)).sort((a, b) => a - b);
    const mid = cys[cys.length >> 1];
    for (const n of out) if (Math.abs(rcy(n.bbox) - mid) > numH * 0.45) n.doubt = [...n.doubt ?? [], "note.offRow"];
  }
  return out;
}
const LYRIC_DOUBT_MARGIN = 0.7;
async function markLyricDoubts(rows, hooks) {
  const hanzi = (text) => [...text ?? ""].filter((c) => /[\u4e00-\u9fff]/.test(c));
  const reqs = [];
  for (const r of rows) for (const n of r.nums) (n.lyrics ?? []).forEach((text, verse) => {
    hanzi(text).forEach((_, idx) => reqs.push({ n, verse, idx }));
  });
  if (!reqs.length) return;
  const alts = await hooks.rankAlts(reqs);
  reqs.forEach((q, k) => {
    const a = alts[k];
    const ch = hanzi(q.n.lyrics?.[q.verse])[q.idx];
    if (!a || !a.alts.length || !ch) return;
    const margin = (a.scores[0] ?? 1) - (a.scores[1] ?? 0);
    if (a.alts[0] !== ch || margin < LYRIC_DOUBT_MARGIN) {
      const set = new Set(q.n.lyricDoubt ?? []);
      set.add(q.verse);
      q.n.lyricDoubt = [...set].sort((x, y) => x - y);
    }
  });
}
function dotInkAbove(bin, d, numH) {
  const cx = Math.round(rcx(d));
  const half = Math.max(1, Math.round(numH * 0.12));
  const ink = (x, y2) => x >= 0 && x < bin.w && y2 >= 0 && y2 < bin.h && bin.data[y2 * bin.w + x] === 1;
  const rowHas = (y2) => {
    for (let x = cx - half; x <= cx + half; x++) if (ink(x, y2)) return true;
    return false;
  };
  const top = Math.max(0, Math.round(d.y - numH * 0.8));
  let y = Math.round(d.y) - 1;
  while (y >= top && !rowHas(y)) y--;
  if (y < top) return false;
  const bottom = y;
  while (y >= 0 && rowHas(y)) y--;
  const h = bottom - y;
  if (h > numH * 0.6) return false;
  const side = [];
  for (let x = cx - Math.round(numH * 0.8); x <= cx + Math.round(numH * 0.8); x++) {
    if (Math.abs(x - cx) <= half + 1) continue;
    let n = 0;
    for (let yy = y + 1 - Math.round(numH * 0.3); yy <= bottom + 2; yy++) if (ink(x, yy)) n++;
    if (n > 0) side.push(n);
  }
  if (side.length >= numH * 0.3) {
    side.sort((a, b) => a - b);
    const stroke = side[side.length >> 1];
    if (h < Math.max(numH * 0.2, stroke * 1.8)) return false;
    let widest = 0;
    for (let yy = bottom - Math.max(1, Math.round(h * 0.3)); yy <= bottom; yy++) {
      for (let x0 = cx - half; x0 <= cx + half; x0++) {
        if (!ink(x0, yy)) continue;
        let l2 = x0, r2 = x0;
        while (ink(l2 - 1, yy) && x0 - l2 < numH) l2--;
        while (ink(r2 + 1, yy) && r2 - x0 < numH) r2++;
        widest = Math.max(widest, r2 - l2 + 1);
      }
    }
    return widest >= numH * 0.18 && widest <= numH * 0.5;
  }
  if (h < numH * 0.12 || h > numH * 0.45) return false;
  let l = cx, r = cx;
  const colHas = (x) => {
    for (let yy = y + 1; yy <= bottom; yy++) if (ink(x, yy)) return true;
    return false;
  };
  while (colHas(l - 1) && cx - l < numH) l--;
  while (colHas(r + 1) && r - cx < numH) r++;
  const w = r - l + 1;
  return w <= numH * 0.45 && Math.min(w, h) >= Math.max(2, numH * 0.17) && inkFill(bin, { x: l, y: y + 1, w, h }) >= 0.6;
}
let fermataCaps = [];
function recountUnderlines(bin, nums, numH, cls, barlineXs, voiceMates) {
  const lineH = cls.lineH;
  if (lineH <= 0 || !nums.length) return;
  const hs = nums.map((n) => n.bbox.h).sort((a, b) => a - b);
  const medH = hs[hs.length >> 1];
  const ink = (x, y) => x >= 0 && y >= 0 && x < bin.w && y < bin.h && bin.data[y * bin.w + x] === 1;
  const rowFull = (y, x0, x1) => {
    for (let x = x0; x <= x1; x++) if (!ink(x, y)) return false;
    return true;
  };
  const thickOk = (t2) => t2 >= Math.max(1, lineH * 0.5) && t2 <= lineH * 1.6 + 1;
  const crossesBar = (x, y) => {
    let l = x, r = x;
    while (ink(l - 1, y)) l--;
    while (ink(r + 1, y)) r++;
    return barlineXs.some((bx) => bx > l + 2 && bx < r - 2);
  };
  const baseOf = (d) => {
    if (d.h <= medH * 1.1) return Math.min(rbottom(d), d.y + medH);
    const near = nums.map((n) => n.bbox).filter((o) => o !== d && o.h <= medH * 1.1).sort((p, q) => Math.abs(rcx(p) - rcx(d)) - Math.abs(rcx(q) - rcx(d))).slice(0, 4);
    if (near.length >= 2 && rbottom(d) <= median(near.map(rbottom)) + numH * 0.1) return rbottom(d);
    return Math.min(rbottom(d), d.y + medH);
  };
  const floorOf = (x0, x1, yb) => {
    let f = bin.h;
    for (const m of voiceMates) if (m.y > yb - numH * 0.3 && m.x < x1 + numH * 0.5 && rright(m) > x0 - numH * 0.5) f = Math.min(f, m.y - 1);
    for (const m of fermataCaps) if (m.y > yb - 2 && m.x < x1 && rright(m) > x0) f = Math.min(f, m.y - 1);
    return f;
  };
  const colCount = (d, x) => {
    const yb = baseOf(d), limit = Math.min(bin.h, yb + Math.round(numH * 1.2), floorOf(d.x, rright(d), yb));
    const cx0 = Math.round(d.x + d.w * 0.1), cx1 = Math.round(d.x + d.w * 0.9);
    let n = 0, lastEnd = yb, y = yb;
    while (y < limit) {
      if (!ink(x, y)) {
        y++;
        continue;
      }
      const start = y;
      while (y < limit && ink(x, y)) y++;
      if (start === yb) continue;
      if (start - lastEnd > numH * (n ? 0.4 : 0.45)) break;
      const ym = start + (y - start >> 1);
      if (!thickOk(y - start) || !rowFull(ym, cx0, cx1) || crossesBar(x, ym) || !usable(x, ym)) break;
      n++;
      lastEnd = y;
    }
    return n;
  };
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const owned = [...cls.barlines, ...cls.dots].map((k) => k.bbox).concat(nums.flatMap((n) => n.augmentRects ?? []));
  const compCache = /* @__PURE__ */ new Map();
  const usable = (x0, y0) => {
    const key = y0 * bin.w + x0;
    const hit = compCache.get(key);
    if (hit !== void 0) return hit;
    const seen = /* @__PURE__ */ new Set([key]), stack = [key];
    let minX = x0, maxX = x0, minY = y0, maxY = y0;
    while (stack.length && seen.size < 6e4) {
      const cur = stack.pop(), cy = cur / bin.w | 0, cx = cur - cy * bin.w;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, k = ny * bin.w + nx;
        if ((dx || dy) && ink(nx, ny) && !seen.has(k)) {
          seen.add(k);
          stack.push(k);
        }
      }
    }
    const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    const fused = nums.some((n) => overlapX(n.bbox, box) > 0 && n.bbox.y < rbottom(box) && rbottom(n.bbox) > box.y && box.y <= n.bbox.y + n.bbox.h * 0.5);
    let ok = !owned.some((r) => same(r, box)) && !voiceMates.some((m) => m.x >= box.x && rright(m) <= rright(box) && m.y >= box.y && rbottom(m) <= rbottom(box));
    if (ok && !fused && box.h >= numH * 0.2 && box.w >= numH * 0.6) {
      const top = /* @__PURE__ */ new Map();
      const cols = [0.1, 0.5, 0.9].map((f) => Math.round(box.x + (box.w - 1) * f));
      for (const k of seen) {
        const cy = k / bin.w | 0, cx = k - cy * bin.w;
        if (cols.includes(cx) && cy < (top.get(cx) ?? Infinity)) top.set(cx, cy);
      }
      const [l, m, r] = cols.map((c) => top.get(c) ?? box.y);
      if ((l + r) / 2 - m >= Math.max(2, lineH)) ok = false;
    }
    for (const k of seen) compCache.set(k, ok);
    return ok;
  };
  const found = nums.map((n) => {
    if (n.div || n.augment) return 0;
    const d = n.bbox;
    const cs = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => colCount(d, Math.round(d.x + d.w * f))).sort((a, b) => a - b);
    return cs[2];
  });
  for (let i = 0; i + 1 < nums.length; i++) {
    const a = nums[i], b = nums[i + 1];
    if ((a.div || found[i]) && (b.div || found[i + 1])) continue;
    if (a.augment) continue;
    const x0 = rright(a.bbox), x1 = b.bbox.x - 1;
    if (x1 - x0 < 1 || x1 - x0 > numH * 1.2) continue;
    if (barlineXs.some((x) => x >= x0 - 2 && x <= x1 + 2)) continue;
    const ext0 = Math.round(x0 - a.bbox.w * 0.3), ext1 = Math.round(x1 + b.bbox.w * 0.3);
    const yb = Math.max(baseOf(a.bbox), baseOf(b.bbox));
    const floor = floorOf(a.bbox.x, rright(b.bbox), yb);
    const yTop = Math.round(Math.max(a.bbox.y, b.bbox.y) + medH * 0.75), yEnd = Math.min(Math.round(yb + numH * 0.45), floor - lineH * 2 - 1);
    const rowInk2 = (y) => {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (ink(x, y)) n++;
      return n / (x1 - x0 + 1);
    };
    let bands = 0, run = 0;
    for (let y = yTop; y <= yEnd + lineH * 2; y++) {
      if (rowFull(y, ext0, ext1)) {
        run++;
        continue;
      }
      if (run) {
        if (thickOk(run) && y - run <= yEnd && rowInk2(y - run - 2) < 0.3 && rowInk2(y + 1) < 0.3 && !crossesBar(x0, y - 1 - (run >> 1)) && usable(x0, y - 1 - (run >> 1))) bands++;
        run = 0;
      }
    }
    if (!bands) continue;
    if (!a.div && !found[i]) found[i] = Math.min(bands, 2);
    if (!b.div && !found[i + 1]) found[i + 1] = Math.min(bands, 2);
  }
  nums.forEach((n, i) => {
    if (!n.div && found[i]) {
      n.div = found[i];
      probe("recountUnderlines");
    }
  });
}
function midbandInk(bin, b) {
  const x0 = Math.round(b.x + b.w * 0.28), x1 = Math.round(b.x + b.w * 0.72);
  const y0 = Math.round(b.y + b.h * 0.42), y1 = Math.round(b.y + b.h * 0.58);
  let n = 0, t2 = 0;
  for (let y = Math.max(0, y0); y < Math.min(bin.h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(bin.w, x1); x++) {
      t2++;
      if (bin.data[y * bin.w + x]) n++;
    }
  return t2 ? n / t2 : 0;
}
function midbandHole(bin, b) {
  const y0 = Math.round(b.y + b.h * 0.42), y1 = Math.max(y0 + 1, Math.round(b.y + b.h * 0.58));
  let rows = 0, holes = 0;
  for (let y = Math.max(0, y0); y < Math.min(bin.h, y1); y++) {
    rows++;
    let lo = -1, hi = -1, ink = 0;
    for (let x = b.x; x < Math.min(bin.w, b.x + b.w); x++) if (bin.data[y * bin.w + x]) {
      if (lo < 0) lo = x;
      hi = x;
      ink++;
    }
    if (lo >= 0 && ink < hi - lo + 1) holes++;
  }
  return rows > 0 && holes * 2 > rows;
}
function mergeBrokenHlines(comps, numH) {
  const flat = (k) => k.bbox.h <= Math.max(3, numH * 0.32) && k.bbox.w >= k.bbox.h * 2;
  const gapMax = Math.max(2, numH * 0.06);
  const rest = comps.filter((k) => !flat(k));
  const line = comps.filter(flat).sort((a, b) => a.bbox.x - b.bbox.x);
  const yTol = Math.max(2, numH * 0.06);
  const out = [];
  for (const k of line) {
    let host;
    for (let i = out.length - 1; i >= 0; i--) {
      const p = out[i];
      if (k.bbox.x - rright(p.bbox) > gapMax) continue;
      if (k.bbox.x < p.bbox.x) continue;
      if (Math.abs(k.bbox.y - p.bbox.y) > yTol || Math.abs(rbottom(k.bbox) - rbottom(p.bbox)) > yTol) continue;
      if (Math.min(k.bbox.w, p.bbox.w) >= numH * 0.6) continue;
      host = p;
      break;
    }
    if (host) {
      const bb = unionRect(host.bbox, k.bbox);
      probe("mergeBrokenHlines");
      out[out.indexOf(host)] = { id: host.id, bbox: bb, area: host.area + k.area, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
      continue;
    }
    out.push(k);
  }
  return [...rest, ...out];
}
async function recognizeJianpu(bin, ocr, opts = {}) {
  const raw = connectedComponents(bin, 4);
  let comps = mergeBrokenHlines(untangleBridged(raw, bin, estimateNumH(raw)), estimateNumH(raw));
  comps = splitBarDash(bin, comps, estimateNumH(comps));
  comps = splitBarCap(bin, comps, estimateNumH(comps));
  if (isVoicedPage(comps, estimateNumH(comps))) comps = splitDigitDash(bin, comps, estimateNumH(comps));
  comps = splitArcTail(bin, comps, estimateNumH(comps));
  comps = splitLineOverArc(bin, comps, estimateNumH(comps));
  comps = splitLineDot(bin, comps, estimateNumH(comps), isVoicedPage(comps, estimateNumH(comps)));
  const cleanPage = isCleanPage(comps, estimateNumH(comps));
  if (cleanPage || isVoicedPage(comps, estimateNumH(comps))) comps = splitArcEndDots(bin, comps, estimateNumH(comps), cleanPage ? 0.12 : 0.18, !cleanPage);
  if (cleanPage) {
    comps = splitArcInnerDots(bin, comps, estimateNumH(comps));
    comps = splitMordentDot(bin, comps, estimateNumH(comps));
  }
  const { c, numH } = classify(comps, bin);
  let allCores = [];
  const mergedArcs = [];
  const voicedPage = isVoicedPage(comps, numH);
  for (const blk of c.blocks) {
    const thinCurve = blk.bbox.w >= numH * 1.5 && blk.bbox.h < numH && blk.area < blk.bbox.w * blk.bbox.h * 0.2;
    if (blk.bbox.w >= blk.bbox.h * 2.5 && blk.bbox.h < numH * 0.7 || thinCurve || isRejoinedArc(blk)) {
      probe("block.flatArc");
      continue;
    }
    const sharp2 = voicedPage ? splitGluedSharp(bin, blk, numH) : null;
    if (sharp2) {
      allCores.push(...sharp2);
      continue;
    }
    const { cores, arc } = splitBlock(bin, blk, numH);
    allCores.push(...cores);
    if (arc) mergedArcs.push(arc);
  }
  const arcComps = mergedArcs.map((bb, i) => ({
    id: 1e6 + i,
    bbox: bb,
    area: bb.w * bb.h,
    cx: bb.x + bb.w / 2,
    cy: bb.y + bb.h / 2
  }));
  const flatDot = (k) => k.bbox.w >= numH * 0.3 && k.bbox.w >= k.bbox.h * 2.5;
  const classified = /* @__PURE__ */ new Set([...c.blocks, ...c.barlines, ...c.hlines, ...c.dots]);
  const spareCores = comps.filter((k) => !classified.has(k) && k.bbox.w >= numH * 0.25 && k.bbox.h >= numH * 0.35 && k.bbox.h < numH * 0.55).map((k) => ({ bbox: k.bbox, div: 0 }));
  const meterCands = meterCandidates(allCores, [...c.hlines, ...c.dots.filter(flatDot)], numH, spareCores);
  const meterMarks = [];
  const meterCores = /* @__PURE__ */ new Set();
  const meterLines = /* @__PURE__ */ new Set();
  if (meterCands.length) {
    const rects = meterCands.flatMap((m) => [m.up.bbox, m.dn.bbox]);
    const vals = await ocr.recognizeDigits(bin, rects);
    const wide = ocr.recognizeNumerals ? await ocr.recognizeNumerals(bin, rects) : [];
    meterCands.forEach((m, i) => {
      const wb = wide[2 * i], wt = wide[2 * i + 1];
      const beats2 = wb === 9 ? 9 : vals[2 * i] ?? 0;
      const beatType2 = wt !== void 0 && validMeter(1, wt) ? wt : vals[2 * i + 1] ?? 0;
      if (!validMeter(beats2, beatType2)) return;
      probe("meterCandidates");
      meterMarks.push({ x: rcx(m.bbox), beats: beats2, beatType: beatType2, bbox: m.bbox });
      meterCores.add(m.up);
      meterCores.add(m.dn);
      meterLines.add(m.line);
    });
    if (meterCores.size) {
      allCores = allCores.filter((k) => !meterCores.has(k));
      c.hlines = c.hlines.filter((h) => !meterLines.has(h));
      c.dots = c.dots.filter((k) => !meterLines.has(k));
    }
  }
  const rowsC = groupRows(allCores, numH);
  const rowMetaAll = rowsC.map((rd) => {
    const topY = Math.min(...rd.map((k) => k.bbox.y));
    const botY = Math.max(...rd.map((k) => rbottom(k.bbox)));
    const rowH = botY - topY;
    const bandTop = median(rd.map((k) => k.bbox.y)), bandBot = median(rd.map((k) => rbottom(k.bbox)));
    const overlapsRow = (b) => Math.min(rbottom(b.bbox), botY) - Math.max(b.bbox.y, topY) >= rowH * 0.7 || Math.min(rbottom(b.bbox), bandBot) - Math.max(b.bbox.y, bandTop) >= (bandBot - bandTop) * 0.7 || // 下两个声部共用一根长线（新编赞美诗·四声部 313：1329~1437，第 3 声部数字带 1315~1352），线头落在上面那个声部的
    // 中腰，只重叠 0.62——长过数字带两倍的线放到 0.55，免得整行被当成没小节线的歌词行丢掉
    b.bbox.h >= (bandBot - bandTop) * 2 && Math.min(rbottom(b.bbox), bandBot) - Math.max(b.bbox.y, bandTop) >= (bandBot - bandTop) * 0.55;
    const spanning = c.barlines.filter((b) => b.bbox.h <= rowH * 4 && overlapsRow(b));
    const x1 = Math.max(...rd.map((k) => rright(k.bbox)));
    const longBars = [...c.barlines, ...c.longBarlines].filter((b) => b.bbox.h > rowH * 4 && b.bbox.h <= rowH * 12 && rd.filter((k) => rcx(k.bbox) < rcx(b.bbox)).length >= 2 && rcx(b.bbox) < x1 + numH * 2 && overlapsRow(b));
    const xFirst = Math.min(...rd.map((k) => k.bbox.x));
    const inRow = spanning.filter((b) => rcx(b.bbox) > xFirst);
    const maxH = Math.max(0, ...(inRow.length ? inRow : spanning).map((b) => b.bbox.h));
    const real = [...spanning.filter((b) => b.bbox.h >= maxH * 0.6), ...longBars].sort((a, b) => rcx(a.bbox) - rcx(b.bbox));
    const barlineXs = real.map((b) => rcx(b.bbox));
    return { rd, topY, botY, barlineXs, bars: real, long: new Set(longBars), tail: false };
  });
  const flatCore = (k) => k.bbox.w >= k.bbox.h * 1.5 && k.bbox.h < numH * 0.7;
  const keyLineRow = (rd) => {
    if (!rd.length) return false;
    const first = rd.reduce((a, b) => b.bbox.x < a.bbox.x ? b : a).bbox;
    const u = Math.max(numH, first.h);
    const bars = c.hlines.map((k) => k.bbox).filter((b) => b.x >= rright(first) - 1 && b.x - rright(first) <= u && b.w <= u * 1.2 && rcy(b) >= first.y + first.h * 0.2 && rcy(b) <= first.y + first.h * 0.8);
    return bars.some((a) => bars.some((b) => b !== a && rcy(b) > rcy(a) && rcy(b) - rcy(a) <= numH * 0.5 && Math.min(rright(a), rright(b)) - Math.max(a.x, b.x) >= Math.min(a.w, b.w) * 0.6));
  };
  const squareCore = (k) => k.bbox.w > k.bbox.h * 0.8 && k.bbox.h >= numH * 0.6;
  const firstMusicTop = Math.min(...rowMetaAll.filter((m) => m.rd.length >= 3 && m.barlineXs.length >= 2 && m.rd.filter((k) => !squareCore(k)).length >= m.rd.length * 0.7).map((m) => m.topY));
  const musicRowH = median(rowMetaAll.filter((m) => m.rd.length >= 3 && m.barlineXs.length >= 2).map((m) => median(m.rd.map((k) => k.bbox.h)))) || numH;
  const keyLineBot = Math.max(-Infinity, ...rowMetaAll.filter((m) => m.botY < firstMusicTop && keyLineRow(m.rd)).map((m) => m.botY));
  const pageRowH = median(rowMetaAll.filter((m) => m.rd.length >= 3).map((m) => median(m.rd.map((k) => k.bbox.h))));
  const noteRuleY = Math.min(...c.hlines.filter((h) => h.bbox.w >= bin.w * 0.5 && rowMetaAll.filter((m) => m.botY < h.bbox.y && m.barlineXs.length >= 2).length >= 2).map((h) => h.bbox.y));
  const hanCore = (k) => k.bbox.w >= k.bbox.h * 0.9 && k.bbox.h >= musicRowH * 0.85;
  const lastMusicBot = Math.max(-Infinity, ...rowMetaAll.filter((m) => m.rd.length >= 3 && m.barlineXs.length >= 3 && m.rd.filter((k) => !squareCore(k)).length >= m.rd.length * 0.7).map((m) => m.botY));
  const rowMeta = rowMetaAll.filter((m) => {
    if (m.topY > noteRuleY) {
      probe("pseudoRow.belowNoteRule");
      return false;
    }
    if (Number.isFinite(lastMusicBot) && m.topY > lastMusicBot && m.rd.length >= 6 && m.rd.filter(hanCore).length * 2 >= m.rd.length) {
      probe("pseudoRow.proseTail");
      return false;
    }
    if (m.rd.length < 3) return false;
    if (m.rd.filter(flatCore).length * 2 > m.rd.length) {
      probe("pseudoRow.flat");
      return false;
    }
    if (keyLineRow(m.rd)) {
      probe("pseudoRow.keyLine");
      return false;
    }
    if (m.botY < firstMusicTop && m.botY <= keyLineBot) {
      probe("pseudoRow.aboveKeyLine");
      return false;
    }
    const hRow = median(m.rd.map((k) => k.bbox.h));
    const offSize = hRow < musicRowH * 0.8 || hRow > musicRowH * 1.25;
    if (Number.isFinite(firstMusicTop) && m.botY < firstMusicTop && (m.barlineXs.length <= 1 && (m.rd.length < 6 || offSize) || hRow < musicRowH * 0.8)) {
      probe("pseudoRow.headerAboveFirst");
      return false;
    }
    const rowH = median(m.rd.map((k) => k.bbox.h));
    if (rowH >= numH * 1.4 && rowH >= pageRowH * 1.4 && !(m.barlineXs.length >= 3 && m.rd.length >= 6)) {
      probe("pseudoRow.tall");
      return false;
    }
    if (m.rd.length <= 4 && rowMetaAll.some((o) => o !== m && o.rd.length >= m.rd.length * 2 && o.topY > m.topY && o.topY - m.botY > -numH && o.topY - m.botY < numH * 1.2)) {
      probe("pseudoRow.deco");
      return false;
    }
    return true;
  });
  const medBarH = median(rowMeta.flatMap((m) => m.bars.filter((b) => !m.long.has(b)).map((b) => b.bbox.h)));
  if (medBarH > 0) {
    const staffY = rowMeta.filter((m) => m.bars.some((b) => b.bbox.h >= medBarH * 0.85)).map((m) => m.botY);
    const lastY = staffY.length ? Math.max(...staffY) : Infinity;
    const tail = rowMetaAll.filter((m) => m.rd.length && m.rd.length < 3 && m.topY > lastY && m.topY < noteRuleY).filter((m) => m.bars.filter((b) => b.bbox.h >= medBarH * 0.6).length >= 2);
    for (const t2 of tail) t2.tail = true;
    rowMeta.push(...tail);
  }
  const withBars = rowMeta.filter((m) => m.barlineXs.length > 0 && (m.tail || !(medBarH > 0) || m.bars.some((b) => b.bbox.h >= medBarH * 0.85) || m.bars.filter((b) => b.bbox.h >= numH * 1.3 && b.bbox.w <= numH * 0.25).length >= 3));
  const staff = withBars.length ? withBars : rowMeta;
  const sysOf = /* @__PURE__ */ new Map();
  const braceRects = [];
  if (staff.length >= 4) {
    const firstX = median(staff.map((m) => Math.min(...m.rd.map((k) => k.bbox.x))));
    const bars = raw.filter((k) => k.bbox.h >= numH * 4 && k.bbox.w <= numH * 2 && rright(k.bbox) < firstX).map((k) => ({ y0: k.bbox.y, y1: rbottom(k.bbox), x0: k.bbox.x, x1: rright(k.bbox) })).sort((a, b) => a.y0 - b.y0);
    const braces = [];
    for (const b of bars) {
      const last = braces[braces.length - 1];
      if (last && b.y0 <= last.y1) {
        last.y1 = Math.max(last.y1, b.y1);
        last.x0 = Math.min(last.x0, b.x0);
        last.x1 = Math.max(last.x1, b.x1);
      } else braces.push({ ...b });
    }
    braceRects.push(...braces.map((br) => ({ x: br.x0, y: br.y0, w: br.x1 - br.x0, h: br.y1 - br.y0 })));
    const inBrace = (m, br) => Math.min(m.botY, br.y1 + numH * 0.5) - Math.max(m.topY, br.y0 - numH * 0.5) >= (m.botY - m.topY) * 0.3;
    {
      const counts = braces.map((br) => staff.filter((m) => inBrace(m, br)).length);
      const full = Math.max(0, ...counts);
      if (full >= 3 && counts.filter((n) => n === full).length >= 2) {
        braces.forEach((br, i) => {
          if (counts[i] >= full) return;
          const mates = staff.filter((m) => inBrace(m, br));
          for (const m of rowMetaAll) {
            if (staff.includes(m) || !m.rd.length || m.rd.length >= 3 || !inBrace(m, br)) continue;
            if (Math.abs(Math.min(...m.rd.map((k) => k.bbox.x)) - firstX) > numH) continue;
            if (mates.some((o) => Math.min(o.botY, m.botY) > Math.max(o.topY, m.topY))) continue;
            const aligned = m.bars.filter((b) => mates.some((o) => o.barlineXs.some((x) => Math.abs(x - rcx(b.bbox)) <= numH * 0.3)));
            if (aligned.length < 2) continue;
            probe("voices.silentRow");
            staff.push(m);
          }
        });
        staff.sort((a, b) => a.topY - b.topY);
      }
    }
    braces.forEach((br, sys) => {
      const inside = staff.filter((m) => inBrace(m, br));
      if (inside.length < 2) return;
      inside.forEach((m, voice) => {
        sysOf.set(m, { sys, voice });
        const hook = m.rd.filter((k) => rright(k.bbox) <= br.x1 + numH * 0.3);
        if (hook.length && hook.length < m.rd.length) {
          probe("brace.hook");
          m.rd = m.rd.filter((k) => !hook.includes(k));
          m.topY = Math.min(...m.rd.map((k) => k.bbox.y));
          m.botY = Math.max(...m.rd.map((k) => rbottom(k.bbox)));
        }
      });
    });
  }
  if (sysOf.size) {
    for (const m of staff) {
      const sv = sysOf.get(m);
      if (!sv) continue;
      const n = staff.find((o) => sysOf.get(o)?.sys === sv.sys && sysOf.get(o).voice === sv.voice + 1);
      if (!n) continue;
      const share = (from, to, down) => {
        const h = to.botY - to.topY;
        for (const bar of from.bars) {
          const x = rcx(bar.bbox);
          if (to.barlineXs.some((t2) => Math.abs(t2 - x) <= numH * 0.15)) continue;
          const reach = down ? rbottom(bar.bbox) - to.topY : to.botY - bar.bbox.y;
          const piece = reach < h * 0.4 ? c.barlines.find((k) => Math.abs(rcx(k.bbox) - x) <= numH * 0.3 && Math.min(rbottom(k.bbox), to.botY) - Math.max(k.bbox.y, to.topY) >= h * 0.6) : bar;
          if (!piece || to.bars.includes(piece)) continue;
          probe("barline.sharedVoice");
          to.bars.push(piece);
          to.barlineXs.push(rcx(piece.bbox));
        }
        to.bars.sort((a, b) => rcx(a.bbox) - rcx(b.bbox));
        to.barlineXs.sort((a, b) => a - b);
      };
      share(m, n, true);
      share(n, m, false);
    }
  }
  const voiceSystems = () => {
    const bySys = /* @__PURE__ */ new Map();
    for (const m of staff) {
      const si = sysOf.get(m)?.sys;
      if (si !== void 0) (bySys.get(si) ?? bySys.set(si, []).get(si)).push(m);
    }
    const out = [];
    for (const rows2 of bySys.values()) {
      rows2.sort((p, q) => p.topY - q.topY);
      if (rows2.length === 3) out.push(rows2);
      else if (rows2.length % 4 === 0) for (let i = 0; i < rows2.length; i += 4) out.push(rows2.slice(i, i + 4));
    }
    return out;
  };
  if (sysOf.size) {
    for (const rows2 of voiceSystems()) {
      const add = /* @__PURE__ */ new Map();
      for (const m of rows2) {
        const x0 = Math.min(...m.rd.map((k) => k.bbox.x)), x1 = Math.max(...m.rd.map((k) => rright(k.bbox)));
        const others = median(rows2.filter((q) => q !== m).map((q) => q.barlineXs.length));
        if (m.barlineXs.length < 2 || m.barlineXs.length < others * 0.5) continue;
        const seen = [];
        for (const o of rows2) if (o !== m) for (const x of o.barlineXs) {
          if (seen.some((t2) => Math.abs(t2 - x) <= numH * 0.4)) continue;
          seen.push(x);
          if (x <= x0 || x >= x1) continue;
          if (m.barlineXs.some((t2) => Math.abs(t2 - x) <= numH * 0.4)) continue;
          const votes = rows2.filter((q) => q !== m && q.barlineXs.some((t2) => Math.abs(t2 - x) <= numH * 0.4)).length;
          if (votes < 2) continue;
          if (m.rd.some((k) => k.bbox.x - numH * 0.1 < x && rright(k.bbox) + numH * 0.1 > x)) continue;
          (add.get(m) ?? add.set(m, []).get(m)).push(x);
        }
      }
      for (const [m, xs] of add) {
        for (const x of xs) {
          probe("barline.mutual");
          m.barlineXs.push(x);
        }
        m.barlineXs.sort((p, q) => p - q);
      }
    }
  }
  const accidentals = /* @__PURE__ */ new Map();
  const accCores = /* @__PURE__ */ new Set();
  for (const m of staff) {
    const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
    const wideW = m.rd.map((k) => k.bbox.w).filter((w) => w >= numH * 0.45);
    const medW = median(wideW.length ? wideW : m.rd.map((k) => k.bbox.w)) || numH;
    for (let j = 0; j + 1 < m.rd.length; j++) {
      const k = m.rd[j], nx = m.rd[j + 1];
      if (k.bbox.h > medH * 1.25) continue;
      const hungLow = rbottom(nx.bbox) - rbottom(k.bbox) >= medH * 0.2;
      const raised = k.bbox.h < medH * 0.9 || k.bbox.h <= medH * 1.1 && nx.bbox.y - k.bbox.y >= medH * 0.25 && rbottom(nx.bbox) - rbottom(k.bbox) >= medH * 0.3;
      const underlined = (b) => {
        for (let y = rbottom(b) - 2; y <= rbottom(b) + medH * 0.15; y++) {
          let n = 0;
          for (let x = b.x; x < rright(b); x++) if (bin.data[Math.round(y) * bin.w + Math.round(x)]) n++;
          if (n >= b.w * 0.9) return true;
        }
        return false;
      };
      const wideSharp = (sysOf.has(m) ? raised : voicedPage && k.bbox.h < medH * 0.8) && hungLow && k.bbox.w <= medW * 1.5 && accidentalOf(bin, k.bbox) === "sharp" && !underlined(k.bbox);
      if (k.bbox.w > medW * 0.85 && !wideSharp) continue;
      if (k.bbox.h < medH * 0.45 || k.bbox.w < medW * 0.3) continue;
      if (nx.bbox.x - rright(k.bbox) > numH * (wideSharp ? 0.5 : 0.3)) continue;
      if (nx.bbox.h < medH * 0.85) continue;
      if (k.bbox.y > nx.bbox.y + medH * 0.15 || rbottom(k.bbox) > rbottom(nx.bbox) + medH * 0.1) continue;
      const kind = accidentalOf(bin, k.bbox);
      if (!kind) continue;
      if (kind === "natural" && rbottom(nx.bbox) - rbottom(k.bbox) < medH * 0.1) {
        probe("accidental.naturalFlush");
        continue;
      }
      probe("accidental");
      accidentals.set(nx, kind);
      accCores.add(k);
    }
    if (accCores.size) m.rd = m.rd.filter((k) => !accCores.has(k));
  }
  const graceOf = /* @__PURE__ */ new Map();
  {
    const cands = [];
    const rowBoxes = staff.flatMap((m) => m.rd.map((k) => k.bbox));
    const inRow = (b) => rowBoxes.some((r) => b.x < rright(r) && rright(b) > r.x && b.y < rbottom(r) && rbottom(b) > r.y);
    for (const m of staff) {
      const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
      const medW = median(m.rd.map((k) => k.bbox.w)) || numH;
      for (const kc of comps) {
        const kb = kc.bbox;
        if (inRow(kb)) continue;
        if (kb.h < medH * 0.45 || kb.h > medH * 0.8) continue;
        if (kb.w > medW * 0.9) continue;
        if (rbottom(kb) > m.topY + medH * 0.25) continue;
        if (rbottom(kb) < m.topY - medH * 0.5) continue;
        const div = graceDivLines(bin, kb, medH);
        if (!div) continue;
        const owner = m.rd.find((n) => n.bbox.h >= medH * 0.85 && n.bbox.x >= rright(kb) - 2 && n.bbox.x - rright(kb) < medH * 0.9);
        if (!owner) continue;
        const dot = c.dots.find((o) => Math.abs(rcx(o.bbox) - rcx(kb)) <= Math.max(kb.w * 0.5, numH * 0.2) && o.bbox.w <= Math.max(kb.w * 0.8, numH * 0.3) && kb.y - rbottom(o.bbox) >= -2 && kb.y - rbottom(o.bbox) < medH * 0.5);
        cands.push({ box: kb, owner, div, octave: dot ? 1 : 0, dot });
      }
    }
    if (cands.length) {
      const vals = await ocr.recognizeDigits(bin, cands.map((g) => g.box));
      const taken = [];
      const usedDots = /* @__PURE__ */ new Set();
      cands.forEach((g, i) => {
        const digit = vals[i] ?? 0;
        if (digit < 1 || digit > 7) return;
        const list = graceOf.get(g.owner) ?? [];
        list.push({ digit, octave: g.octave, div: g.div, bbox: g.box });
        probe("grace");
        graceOf.set(g.owner, list);
        taken.push(g.box);
        if (g.dot) usedDots.add(g.dot);
      });
      if (taken.length) {
        const mine = (b) => taken.some((t2) => Math.abs(rcx(b) - rcx(t2)) <= t2.w && b.y >= rbottom(t2) - 2 && b.y - rbottom(t2) < numH * 0.6);
        allCores = allCores.filter((k) => !taken.some((t2) => t2.x === k.bbox.x && t2.y === k.bbox.y));
        c.hlines = c.hlines.filter((h) => !mine(h.bbox));
        c.dots = c.dots.filter((o) => !usedDots.has(o));
      }
    }
  }
  const allDigits = staff.flatMap((m) => m.rd);
  const recRects = staff.flatMap((m) => {
    const voiced = sysOf.has(m);
    const top = voiced ? median(m.rd.map((k) => k.bbox.y)) : m.topY;
    const bot = voiced ? median(m.rd.map((k) => rbottom(k.bbox))) : m.botY;
    const bandH = bot - top;
    const medH = median(m.rd.map((k) => k.bbox.h));
    const slanted = !voiced && bandH > medH * 1.3;
    const xs = slanted ? [...m.rd].sort((a, b) => a.bbox.x - b.bbox.x) : [];
    return m.rd.map((k) => {
      let t2 = top, b2 = bot;
      if (slanted) {
        const i = xs.indexOf(k);
        const nb = xs.slice(Math.max(0, i - 3), i + 4);
        t2 = median(nb.map((o) => o.bbox.y));
        b2 = median(nb.map((o) => rbottom(o.bbox)));
      }
      if (k.bbox.h >= (b2 - t2) * 0.7) return k.bbox;
      const y = Math.min(k.bbox.y, t2);
      return { x: k.bbox.x, y, w: k.bbox.w, h: Math.max(rbottom(k.bbox), b2) - y };
    });
  });
  const recog = await ocr.recognizeDigits(bin, recRects, { rhythm: true });
  const digitCache = /* @__PURE__ */ new Map();
  allDigits.forEach((k, i) => digitCache.set(k.bbox, recog[i] ?? 0));
  {
    const ones = allDigits.filter((k) => digitCache.get(k.bbox) === 1).map((k) => k.bbox.w).sort((a, b) => a - b);
    const oneW = ones.length >= 3 ? ones[Math.floor(ones.length * 0.3)] : 0;
    const topBar = (b) => {
      const y1 = b.y + Math.max(2, Math.round(b.h * 0.2));
      for (let y = b.y; y < y1; y++) {
        let run = 0, best = 0;
        for (let x = b.x; x < b.x + b.w; x++) {
          if (bin.data[y * bin.w + x]) {
            run++;
            if (run > best) best = run;
          } else run = 0;
        }
        if (best >= b.w * 0.7) return true;
      }
      return false;
    };
    if (oneW > 0) for (const k of allDigits) {
      if (digitCache.get(k.bbox) === 1 && k.bbox.w >= oneW * 1.35 && topBar(k.bbox)) {
        probe("digit.wideOneIsSeven");
        digitCache.set(k.bbox, 7);
      }
    }
  }
  {
    const hasHole = (b) => {
      const W = b.w + 2, H = b.h + 2;
      const seen = new Uint8Array(W * H);
      const ink = (x, y) => x >= 1 && y >= 1 && x <= b.w && y <= b.h && bin.data[(b.y + y - 1) * bin.w + b.x + x - 1] === 1;
      const stack = [0];
      seen[0] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % W, y = (p - x) / W;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (seen[q] || ink(nx, ny)) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
      let holes = 0;
      for (let y = 1; y <= b.h; y++) for (let x = 1; x <= b.w; x++) if (!seen[y * W + x] && !ink(x, y)) holes++;
      return holes >= 2;
    };
    for (const m of staff) {
      const medH = median(m.rd.map((k) => k.bbox.h));
      if (m.rd.filter((k) => digitCache.get(k.bbox) === 0).length >= m.rd.length * 0.3) continue;
      const drop = m.rd.filter((k) => digitCache.get(k.bbox) === 0 && k.bbox.h < medH * 0.75 && !hasHole(k.bbox));
      if (drop.length) {
        probe("rest.openArc");
        m.rd = m.rd.filter((k) => !drop.includes(k));
      }
    }
  }
  const ocrDigit = (b) => digitCache.get(b) ?? 0;
  const arcCands = [...comps, ...arcComps].filter((k) => {
    const b = k.bbox;
    return b.w >= numH * 0.8 && b.h >= 2 && b.h <= numH * 0.8 && b.w / b.h >= 2;
  });
  const inStaff = new Set(staff.flatMap((m) => m.rd));
  for (const k of allCores) {
    if (inStaff.has(k)) continue;
    const dotComp = splitOrnamentDot(bin, k.bbox, numH);
    if (dotComp) c.dots.push(dotComp);
  }
  const dotSizes = [];
  {
    const medW = median(staff.flatMap((m) => m.bars.map((b) => b.bbox.w))) || 1;
    for (const m of staff) {
      for (let i = 1; i < m.bars.length; i++) {
        const prev = m.bars[i - 1], cur = m.bars[i];
        const gap = rcx(cur.bbox) - rcx(prev.bbox);
        const braced = sysOf.has(m);
        if (gap > numH * (braced ? 0.7 : 0.5) || gap < Math.max(4, numH * 0.15)) continue;
        const thick = Math.max(cur.bbox.w, prev.bbox.w) >= medW * 1.5 || braced && Math.max(cur.bbox.w, prev.bbox.w) >= Math.min(cur.bbox.w, prev.bbox.w) * 1.3;
        const rowLast = i === m.bars.length - 1;
        const lastSys = sysOf.get(staff[staff.length - 1])?.sys;
        const inLastSys = lastSys !== void 0 && sysOf.get(m)?.sys === lastSys;
        if (rowLast && (thick || m === staff[staff.length - 1] || inLastSys)) {
          m.finalBarline = "end";
          continue;
        }
        if (thick) {
          if (braced) {
            probe("barline.midEnd");
            (m.endBarXs ??= []).push(rcx(cur.bbox));
          }
          continue;
        }
        if (Math.abs(cur.bbox.h - prev.bbox.h) > Math.max(cur.bbox.h, prev.bbox.h) * 0.25) continue;
        probe("barline.double");
        (m.doubleBarXs ??= []).push(rcx(cur.bbox));
      }
    }
  }
  const fermataOf = /* @__PURE__ */ new Map();
  const fermataDots = /* @__PURE__ */ new Set();
  const fermataArcs = /* @__PURE__ */ new Set();
  const arched = (b) => {
    const top = [];
    for (let x = b.x; x < rright(b); x++) {
      let y = b.y;
      while (y < rbottom(b) && !bin.data[y * bin.w + x]) y++;
      if (y < rbottom(b)) top.push(y);
    }
    if (top.length < 3) return false;
    const peak = Math.min(...top);
    return top[0] - peak >= numH * 0.12 && top[top.length - 1] - peak >= numH * 0.12;
  };
  for (const m of staff) {
    const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
    for (const arc of comps) {
      const ab = arc.bbox;
      if (ab.w < numH * 0.5 || ab.w > numH * (voicedPage ? 2 : 1.6)) continue;
      if (ab.h < numH * 0.15 || ab.h > numH * 0.7 || ab.w / ab.h < 1.5) continue;
      const dotC = c.dots.find((o) => {
        const ob = o.bbox;
        return Math.abs(rcx(ob) - rcx(ab)) <= numH * 0.25 && ob.y >= ab.y && ob.y - rbottom(ab) <= numH * 0.25 && ob.w <= numH * 0.4;
      });
      if (!dotC) continue;
      const owner = m.rd.find((k) => Math.abs(rcx(k.bbox) - rcx(ab)) <= numH * 0.3 && // 窗口同八度点（0.8 字号）：八度那边收得到的点，延长记号得先认（补充本 62 的小号延长记号离数字 0.64 字号，点被当成高音点）
      k.bbox.y - rbottom(dotC.bbox) >= -2 && k.bbox.y - rbottom(dotC.bbox) <= numH * 0.8 && k.bbox.h >= medH * 0.85);
      if (!owner) continue;
      if (m.rd.some((k) => k !== owner && overlapX(k.bbox, ab) >= k.bbox.w * 0.5)) {
        probe("fermata.spansTwo");
        continue;
      }
      if (!arched(ab)) {
        probe("fermata.archReject");
        continue;
      }
      probe("fermata.arc");
      fermataOf.set(owner, true);
      fermataDots.add(dotC);
      fermataArcs.add(arc);
    }
  }
  {
    const topInk = (x, y0, y1) => {
      const xi = Math.round(x);
      if (xi < 0 || xi >= bin.w) return NaN;
      for (let y = Math.max(0, Math.round(y0)); y < Math.min(bin.h, Math.round(y1)); y++) if (bin.data[y * bin.w + xi]) return y;
      return NaN;
    };
    for (const m of staff) {
      const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
      for (const owner of m.rd) {
        if (fermataOf.get(owner) || owner.bbox.h < medH * 0.85) continue;
        const ob = owner.bbox;
        const dotC = c.dots.find((o) => {
          const b = o.bbox;
          const gap = ob.y - rbottom(b);
          return Math.abs(rcx(b) - rcx(ob)) <= numH * 0.25 && gap >= -1 && gap <= numH * 0.5 && b.w <= numH * 0.3 && b.h <= numH * 0.3;
        });
        if (!dotC) continue;
        const db = dotC.bbox, cx = rcx(db);
        const capTop = topInk(cx, db.y - numH * 0.35, db.y - 1);
        if (isNaN(capTop)) continue;
        if (c.hlines.some((h) => cx >= h.bbox.x && cx <= rright(h.bbox) && capTop >= h.bbox.y - 1 && capTop <= rbottom(h.bbox)) || staff.some((o) => o.rd.some((k) => k !== owner && cx >= k.bbox.x && cx <= rright(k.bbox) && capTop >= k.bbox.y && capTop <= rbottom(k.bbox)))) {
          probe("fermata.capIsNote");
          continue;
        }
        const foot = (dir) => {
          let low = null;
          for (let dx = 1; dx <= numH * 0.6; dx++) {
            const t2 = topInk(cx + dir * dx, capTop, rbottom(db) + 1);
            if (isNaN(t2) || low && t2 < low.top - 1) break;
            if (!low || t2 >= low.top) low = { dx, top: t2 };
          }
          return low;
        };
        const fl = foot(-1), fr = foot(1);
        const capOk = (f) => !!f && f.dx >= numH * 0.15 && f.dx <= numH * 0.45 && f.top - capTop >= numH * 0.12;
        if (!capOk(fl) || !capOk(fr)) continue;
        const span = { x: Math.round(cx - fl.dx), w: fl.dx + fr.dx + 1 };
        if (m.rd.some((k) => k !== owner && overlapX(k.bbox, span) >= k.bbox.w * 0.5)) {
          probe("fermata.spansTwo");
          continue;
        }
        probe("fermata.cap");
        fermataOf.set(owner, true);
        fermataDots.add(dotC);
      }
    }
  }
  {
    for (const m of staff) {
      const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
      for (const owner of m.rd) {
        if (fermataOf.get(owner) || owner.bbox.h < medH * 0.85) continue;
        const ob = owner.bbox;
        const dotC = c.dots.find((o) => {
          const b = o.bbox;
          const gap = ob.y - rbottom(b);
          return !fermataDots.has(o) && Math.abs(rcx(b) - rcx(ob)) <= numH * 0.25 && gap >= -1 && gap <= numH * 0.5 && b.w <= numH * 0.3 && b.h <= numH * 0.3;
        });
        if (!dotC) continue;
        const db = dotC.bbox, cy = Math.round(rcy(db));
        const at = (x, y) => x >= 0 && y >= 0 && x < bin.w && y < bin.h && bin.data[y * bin.w + x] === 1;
        let cap = false;
        for (let y = db.y - 2; y >= db.y - numH * 0.35 && !cap; y--) if (at(Math.round(rcx(db)), y)) cap = true;
        if (!cap) continue;
        const leg = (dir) => {
          for (let dx = Math.round(db.w / 2) + 2; dx <= numH * 0.65; dx++) if (at(Math.round(rcx(db) + dir * dx), cy)) return dx;
          return Infinity;
        };
        const dl = leg(-1), dr = leg(1);
        if (dl < numH * 0.1 || dr < numH * 0.1 || !isFinite(dl) || !isFinite(dr) || Math.abs(dl - dr) > numH * 0.3) continue;
        const span = { x: Math.round(rcx(db) - dl), w: dl + dr + 1 };
        if (m.rd.some((k) => k !== owner && overlapX(k.bbox, span) >= k.bbox.w * 0.5)) continue;
        probe("fermata.legs");
        fermataOf.set(owner, true);
        fermataDots.add(dotC);
      }
    }
  }
  const wideCaps = voicedPage ? comps.filter((k) => k.bbox.w > numH * 0.45 && k.bbox.w <= numH * 0.8 && k.bbox.h >= numH * 0.25 && k.bbox.h <= numH * 0.5 && !c.dots.includes(k)) : [];
  {
    for (const m of staff) {
      const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
      for (const owner of m.rd) {
        if (fermataOf.get(owner) || owner.bbox.h < medH * 0.85) continue;
        const ob = owner.bbox;
        for (const o of [...c.dots, ...wideCaps]) {
          const b = o.bbox, gap = ob.y - rbottom(b);
          if (fermataDots.has(o) || Math.abs(rcx(b) - rcx(ob)) > numH * 0.25 || gap < -1 || gap > numH * 0.8) continue;
          if (b.h < Math.max(6, numH * 0.28) || b.w > numH * (wideCaps.includes(o) ? 0.8 : 0.6)) continue;
          const spans = [], runsN = [], gaps = [];
          for (let y = b.y; y < rbottom(b); y++) {
            let lo = -1, hi = -1, runs = 0, prev = false, gap2 = 0, cur = 0;
            for (let x = b.x; x < rright(b); x++) {
              const v = bin.data[y * bin.w + x] === 1;
              if (v) {
                if (lo >= 0 && cur > gap2) gap2 = cur;
                if (lo < 0) lo = x;
                hi = x;
                if (!prev) runs++;
                cur = 0;
              } else if (lo >= 0) cur++;
              prev = v;
            }
            spans.push(lo < 0 ? 0 : hi - lo + 1);
            runsN.push(runs);
            gaps.push(gap2);
          }
          const half = spans.length >> 1;
          const topW = Math.max(...spans.slice(0, half)), botW = Math.max(...spans.slice(spans.length - Math.max(2, Math.round(spans.length * 0.4))));
          let arch = false;
          for (let i = 0; i + 2 <= half && !arch; i++) {
            if (runsN[i] !== 1) continue;
            let k = i + 1;
            while (k < spans.length && runsN[k] >= 2 && gaps[k] >= 2) k++;
            if (k - (i + 1) >= 2) arch = true;
          }
          if (topW < botW * 1.5 || !arch) continue;
          probe("fermata.fusedDot");
          fermataOf.set(owner, true);
          fermataDots.add(o);
          if (wideCaps.includes(o)) fermataArcs.add(o);
          break;
        }
      }
    }
  }
  if (sysOf.size && fermataOf.size) {
    for (const rows2 of voiceSystems()) {
      const seeds = rows2.flatMap((m) => m.rd.filter((k) => fermataOf.get(k)).map((k) => ({ m, x: rcx(k.bbox) })));
      if (!seeds.length) continue;
      for (const m of rows2) for (const k of m.rd) {
        if (fermataOf.get(k)) continue;
        const kb = k.bbox;
        const n = seeds.filter((sd) => sd.m !== m && Math.abs(sd.x - rcx(kb)) <= numH * 0.4).length;
        if (!n) continue;
        const cap = comps.find((o) => {
          const ob = o.bbox;
          if (c.dots.includes(o) || fermataArcs.has(o)) return false;
          if (ob.w < numH * 0.4 || ob.w > numH * 2 || ob.h > numH * 0.7) return false;
          if (Math.abs(rcx(ob) - rcx(kb)) > numH * 0.4 || ob.y >= kb.y) return false;
          const gap = kb.y - rbottom(ob);
          if (gap > numH * 0.8 || gap < -numH * 0.3) return false;
          return !c.hlines.includes(o) || arched(ob);
        });
        if (!cap && n < 2) continue;
        probe(cap ? "fermata.mutualCap" : "fermata.mutual");
        fermataOf.set(k, true);
        if (!cap) continue;
        fermataArcs.add(cap);
        const dotC = c.dots.filter((o) => !fermataDots.has(o) && Math.abs(rcx(o.bbox) - rcx(cap.bbox)) <= numH * 0.3 && o.bbox.y >= cap.bbox.y && o.bbox.y - rbottom(cap.bbox) <= numH * 0.25 && rbottom(o.bbox) <= kb.y + 1).sort((p, q) => p.bbox.y - q.bbox.y)[0];
        if (dotC) fermataDots.add(dotC);
      }
    }
  }
  if (fermataDots.size) c.dots = c.dots.filter((o) => !fermataDots.has(o));
  if (fermataDots.size) c.hlines = c.hlines.filter((o) => !fermataDots.has(o));
  fermataCaps = [...fermataArcs].map((k) => k.bbox);
  const ornamentOf = /* @__PURE__ */ new Map();
  const mordentDots = /* @__PURE__ */ new Set();
  const lowerBoxes = [];
  const zigzag = (r, minValley, skip) => {
    const top = [];
    for (let x = r.x; x < rright(r); x++) {
      if (skip?.(x)) {
        top.push(NaN);
        continue;
      }
      let y = r.y;
      while (y < rbottom(r) && !bin.data[y * bin.w + x]) y++;
      top.push(y < rbottom(r) ? y - r.y : NaN);
    }
    const valid = top.filter((v) => !isNaN(v));
    if (!valid.length) return false;
    const peak = Math.min(...valid);
    const hi = top.map((v, i) => !isNaN(v) && v <= peak + r.h * 0.15 ? i : -1).filter((i) => i >= 0);
    const pl = hi[0], pr = hi[hi.length - 1];
    if (pr - pl < r.w * 0.35) return false;
    const valley = Math.max(...top.slice(pl, pr + 1).filter((v) => !isNaN(v)));
    return valley - peak >= minValley;
  };
  const centerStroke = (b) => {
    let s0 = -1, s1 = -1;
    for (let x = Math.ceil(b.x + b.w * 0.3); x <= Math.floor(b.x + b.w * 0.7); x++) {
      let best = 0, cur = 0;
      for (let y = b.y; y < rbottom(b); y++) {
        if (bin.data[y * bin.w + x]) {
          if (++cur > best) best = cur;
        } else cur = 0;
      }
      if (best < b.h * 0.85) continue;
      if (s0 < 0) s0 = x;
      else if (x !== s1 + 1) return null;
      s1 = x;
    }
    return s0 >= 0 && s1 - s0 + 1 <= Math.max(3, numH * 0.12) ? [s0, s1] : null;
  };
  for (const m of staff) {
    const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
    const ownerBelow = (b, self) => m.rd.find((n) => {
      if (Math.abs(rcx(n.bbox) - rcx(b)) > numH * 0.4 || n.bbox.h < medH * 0.85) return false;
      if (ocrDigit(n.bbox) === 0) return false;
      let top = n.bbox.y;
      for (const o of c.dots) {
        const ob = o.bbox;
        if (o === self || rcx(ob) < n.bbox.x || rcx(ob) > rright(n.bbox)) continue;
        if (rbottom(ob) > n.bbox.y + 1 || n.bbox.y - rbottom(ob) > numH * 0.6) continue;
        if (ob.y < rbottom(b) - numH * 0.25) continue;
        top = Math.min(top, ob.y);
      }
      const gap = top - rbottom(b);
      return gap >= -numH * 0.25 && gap <= numH * 0.5;
    });
    for (const k of comps) {
      const b = k.bbox;
      const big = b.w >= numH * 0.6 && b.w <= numH * 1.4 && b.h >= numH * 0.25 && b.h <= numH * 0.6;
      const small = b.w >= numH * 0.25 && b.w < numH * 0.6 && b.h >= numH * 0.12 && b.h < numH * 0.3;
      if ((big || small) && b.w / b.h >= 1.6) {
        const owner = ownerBelow(b, k);
        const spansTwo = big && owner && m.rd.some((n) => n !== owner && n.bbox.h >= medH * 0.85 && rcx(n.bbox) > b.x && rcx(n.bbox) < rright(b) && Math.abs(rcx(n.bbox) - rcx(owner.bbox)) >= numH * 0.5);
        if (spansTwo) probe("mordent.spanTwoReject");
        if (owner && !spansTwo && zigzag(b, big ? b.h * 0.3 : 2)) {
          probe(big ? "mordent.big" : "mordent.small");
          ornamentOf.set(owner, "upper-mordent");
          mordentDots.add(k);
          continue;
        }
      }
      if (b.w >= numH * 0.6 && b.w <= numH * 1.4 && b.h >= numH * 0.4 && b.h <= numH * 0.9 && b.w / b.h >= 1.1) {
        const st = centerStroke(b);
        const owner = st && ownerBelow(b, k);
        if (st && owner) {
          const off = (x) => x >= st[0] - 1 && x <= st[1] + 1;
          const lft = tightBox(bin, b, 0, st[0] - 1 - b.x, 0, b.h);
          const rgt = tightBox(bin, b, st[1] + 2 - b.x, b.w, 0, b.h);
          const z = lft && rgt ? unionRect(lft, rgt) : null;
          if (z && zigzag(z, z.h * 0.3, off)) {
            probe("mordent.lower");
            ornamentOf.set(owner, "lower-mordent");
            mordentDots.add(k);
            lowerBoxes.push(b);
            continue;
          }
        }
      }
      if (b.w >= numH * 0.7 && b.h <= numH * 0.6 && b.w / b.h >= 2) {
        const ww = Math.round(numH * 0.45);
        const col = columnInk(bin, b, 0, b.h);
        const stroke = median(col.filter((v) => v > 0)) || 1;
        for (const x0 of [0, b.w - ww]) {
          const z = tightBox(bin, b, x0, x0 + ww, 0, b.h);
          if (!z || z.w < numH * 0.25 || z.h < numH * 0.12 || z.h >= numH * 0.3) continue;
          const thick = Math.max(stroke * 1.5, stroke + 2);
          if (col.slice(x0, x0 + ww).filter((v) => v >= thick).length < ww * 0.25) continue;
          const owner = ownerBelow(z, k);
          if (owner && !ornamentOf.has(owner) && zigzag(z, 2)) {
            probe("mordent.arcEnd");
            ornamentOf.set(owner, "upper-mordent");
          }
        }
      }
    }
  }
  const inLower = (o) => lowerBoxes.some((r) => o.bbox.x >= r.x - 1 && rright(o.bbox) <= rright(r) + 1 && o.bbox.y >= r.y - 1 && rbottom(o.bbox) <= rbottom(r) + 1);
  if (mordentDots.size) c.dots = c.dots.filter((o) => !mordentDots.has(o) && !inLower(o));
  const staccatoOf = /* @__PURE__ */ new Map();
  const staccatoComps = /* @__PURE__ */ new Set();
  for (const m of staff) {
    const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
    for (const k of comps) {
      const b = k.bbox;
      if (b.w < numH * 0.2 || b.w > numH * 0.6 || b.h < numH * 0.2 || b.h > numH * 0.6) continue;
      const ratio = b.w / b.h;
      if (ratio < 0.6 || ratio > 1.6) continue;
      const fill = k.area / (b.w * b.h);
      if (fill < 0.4 || fill > 0.75) continue;
      const owner = m.rd.find((n) => Math.abs(rcx(n.bbox) - rcx(b)) <= numH * 0.35 && n.bbox.y - rbottom(b) >= -numH * 0.1 && n.bbox.y - rbottom(b) <= numH && n.bbox.h >= medH * 0.85);
      if (!owner) continue;
      const rowW = [];
      for (let y = b.y; y < rbottom(b); y++) {
        let lo = -1, hi = -1;
        for (let x = b.x; x < rright(b); x++) if (bin.data[y * bin.w + x]) {
          if (lo < 0) lo = x;
          hi = x;
        }
        rowW.push(lo < 0 ? 0 : hi - lo + 1);
      }
      if (rowW.length < 4) continue;
      if (rowW[0] < b.w * 0.8) continue;
      if (rowW[rowW.length - 1] > b.w * 0.4) continue;
      if (rowW.some((v, i) => i > 0 && v > rowW[i - 1] + 1)) continue;
      probe("staccato");
      staccatoOf.set(owner, true);
      staccatoComps.add(k);
    }
  }
  if (staccatoComps.size) c.dots = c.dots.filter((o) => !staccatoComps.has(o));
  const accentOf = /* @__PURE__ */ new Map();
  const accentComps = /* @__PURE__ */ new Set();
  for (const m of staff) {
    const medH = median(m.rd.map((k) => k.bbox.h)) || numH;
    for (const k of comps) {
      const b = k.bbox;
      if (b.w < numH * 0.25 || b.w > numH * 0.7 || b.h < numH * 0.2 || b.h > numH * 0.6) continue;
      const ratio = b.w / b.h;
      if (ratio < 0.9 || ratio > 2.2) continue;
      if (k.area / (b.w * b.h) > 0.6) continue;
      const lo = [], hi = [];
      for (let y = b.y; y < rbottom(b); y++) {
        let l = -1, r = -1;
        for (let x = b.x; x < rright(b); x++) if (bin.data[y * bin.w + x]) {
          if (l < 0) l = x - b.x;
          r = x - b.x;
        }
        lo.push(l);
        hi.push(r);
      }
      if (lo.some((v) => v < 0) || lo.length < 5) continue;
      const n = lo.length, mid = hi.indexOf(Math.max(...hi));
      if (mid < n * 0.25 || mid > n * 0.75 || hi[mid] < b.w * 0.85) continue;
      if (hi[0] > b.w * 0.55 || hi[n - 1] > b.w * 0.55) continue;
      if (lo[0] > b.w * 0.25 || lo[n - 1] > b.w * 0.25 || lo[mid] < b.w * 0.35) continue;
      const owner = m.rd.find((d) => Math.abs(rcx(d.bbox) - rcx(b)) <= numH * 0.35 && d.bbox.y - rbottom(b) >= -numH * 0.1 && d.bbox.y - rbottom(b) <= numH && d.bbox.h >= medH * 0.85 && ocrDigit(d.bbox) !== 0);
      if (!owner) continue;
      probe("accent");
      accentOf.set(owner, true);
      accentComps.add(k);
    }
  }
  if (accentComps.size) c.dots = c.dots.filter((o) => !accentComps.has(o));
  const rowDigitH = new Map(staff.map((m) => {
    const hs = m.rd.filter((k) => k.bbox.w <= numH * 1.1).map((k) => k.bbox.h);
    return [m, hs.length >= 3 ? median(hs) : 0];
  }));
  const smallRows = [...rowDigitH.values()].some((h) => h > 0 && h <= numH * 1.1);
  const allRows = staff.map((m) => {
    const mySys = sysOf.get(m)?.sys;
    const myH = median(m.rd.map((k) => k.bbox.h));
    const lyricRow = (o) => o.rd.filter((k) => k.bbox.w >= k.bbox.h * 0.85 && k.bbox.h >= myH * 1.05).length * 2 >= o.rd.length;
    const mates = mySys !== void 0 ? staff.filter((o) => o !== m && sysOf.get(o)?.sys === mySys && !lyricRow(o)).flatMap((o) => o.rd.map((k) => k.bbox)) : [];
    const rowH = rowDigitH.get(m) || numH;
    const rowNumH = rowH >= numH * 1.15 && smallRows ? rowH * 0.96 : numH;
    if (rowNumH !== numH) probe("numH.perRow");
    const others = mySys === void 0 ? [] : [-1, 1].flatMap((dir) => {
      const cand = staff.filter((o) => o !== m && sysOf.get(o)?.sys !== void 0 && sysOf.get(o).sys !== mySys && !lyricRow(o) && (dir < 0 ? o.botY <= m.topY : o.topY >= m.botY));
      const near = cand.sort((a, b) => dir < 0 ? b.botY - a.botY : a.topY - b.topY)[0];
      return near ? near.rd.map((k) => k.bbox) : [];
    });
    const nums = buildJpNums(bin, m.rd, rowNumH, c, ocrDigit, arcCands, m.barlineXs, dotSizes, mates, others);
    m.rd.forEach((k, j) => {
      const a = accidentals.get(k);
      if (a && nums[j]) nums[j].accidental = a;
      if (fermataOf.get(k) && nums[j]) nums[j].fermata = true;
      const orn = ornamentOf.get(k);
      if (orn && nums[j]) nums[j].ornament = orn;
      if (staccatoOf.get(k) && nums[j]) nums[j].articulation = "staccato";
      if (accentOf.get(k) && nums[j]) nums[j].articulation = "accent";
      const g = graceOf.get(k);
      if (g && nums[j]) nums[j].grace = g;
    });
    const row = {
      topY: m.topY,
      bottomY: m.botY,
      barlineXs: m.barlineXs,
      nums,
      finalBarline: m.finalBarline,
      doubleBarXs: m.doubleBarXs,
      endBarXs: m.endBarXs
    };
    const sv = sysOf.get(m);
    if (sv) {
      row.system = sv.sys;
      row.voice = sv.voice;
    }
    return row;
  });
  const restShare = (nums) => nums.filter((n) => n.digit === 0).length / nums.length;
  const keepBy = (nums) => restShare(nums) < (nums.some((n) => n.augment > 0) ? 0.8 : 0.5);
  const trimProse = (r) => {
    const keep = [];
    for (let i = 0; i < r.nums.length; i++) {
      let j = i;
      while (j + 1 < r.nums.length && r.nums[j + 1].digit === 0 && r.nums[i].digit === 0) j++;
      if (r.nums[i].digit === 0 && j - i + 1 >= 5) {
        i = j;
        continue;
      }
      keep.push(r.nums[i]);
    }
    if (keep.length === r.nums.length || keep.length < 3 || !keepBy(keep)) return false;
    probe("pseudoRow.trim");
    r.nums = keep;
    return true;
  };
  const bracedOk = (() => {
    const rs = allRows.filter((r) => r.nums.length);
    if (!rs.length || rs.some((r) => r.system === void 0)) return false;
    const sizes = /* @__PURE__ */ new Map();
    for (const r of rs) sizes.set(r.system, (sizes.get(r.system) ?? 0) + 1);
    const n = [...sizes.values()];
    return sizes.size >= 2 && n.every((x) => x === n[0] && x >= 2);
  })();
  const firstOkTop = Math.min(...allRows.filter((r) => r.nums.length && keepBy(r.nums)).map((r) => r.topY));
  const topRow = allRows.filter((r) => r.nums.length).reduce((a, r) => !a || r.topY < a.topY ? r : a, void 0);
  const headerLike = !!topRow && topRow.barlineXs.length <= 2 && restShare(topRow.nums) >= 0.3 && allRows.filter((r) => r !== topRow && r.barlineXs.length >= 3).length >= 2;
  const rows = allRows.filter((r) => {
    if (!r.nums.length) return false;
    if (headerLike && r === topRow) {
      probe("pseudoRow.headerLine");
      return false;
    }
    const rest = restShare(r.nums);
    const silentVoice = r.system !== void 0 && r.barlineXs.length >= 2 && rest >= 0.8 && median(r.nums.map((n) => n.bbox.w / Math.max(1, n.bbox.h))) <= 0.8;
    const ok = keepBy(r.nums) || bracedOk && r.system !== void 0 && rest < 0.8 || silentVoice;
    if (silentVoice && !keepBy(r.nums)) probe("pseudoRow.silentVoice");
    const keep = ok || r.topY > firstOkTop && trimProse(r);
    probe(!keep ? "pseudoRow.drop" : ok && rest >= 0.5 ? "pseudoRow.keepByAugment" : "row");
    return keep;
  });
  for (const r of rows) for (const n of r.nums) if (n.digit === RHYTHM_DIGIT) probe("rhythmX");
  let useRows = rows.length ? rows : allRows;
  if (useRows.some((r) => r.system !== void 0)) {
    {
      const countOf = () => {
        const cnt2 = /* @__PURE__ */ new Map();
        for (const r of useRows) if (r.system !== void 0) cnt2.set(r.system, (cnt2.get(r.system) ?? 0) + 1);
        return cnt2;
      };
      const drop = /* @__PURE__ */ new Set();
      for (const sys of countOf().keys()) {
        const g = useRows.filter((r) => r.system === sys).sort((a, b) => a.topY - b.topY);
        for (let i = 0; i < g.length; i++) {
          const a = g[i];
          if (drop.has(a)) continue;
          for (let j = i + 1; j < g.length; j++) {
            const b = g[j];
            const ov = Math.min(a.bottomY, b.bottomY) - Math.max(a.topY, b.topY);
            if (ov < Math.min(a.bottomY - a.topY, b.bottomY - b.topY) * 0.4) break;
            const stacked = b.nums.filter((n) => a.nums.some((m) => Math.abs(rcx(m.bbox) - rcx(n.bbox)) <= numH * 0.5)).length;
            if (stacked > b.nums.length * 0.3) continue;
            probe("voices.mergeSplitRow");
            a.nums = [...a.nums, ...b.nums].sort((p, q) => p.bbox.x - q.bbox.x);
            a.barlineXs = [.../* @__PURE__ */ new Set([...a.barlineXs, ...b.barlineXs])].sort((p, q) => p - q);
            if (b.doubleBarXs) a.doubleBarXs = [...a.doubleBarXs ?? [], ...b.doubleBarXs].sort((p, q) => p - q);
            if (b.endBarXs) a.endBarXs = [...a.endBarXs ?? [], ...b.endBarXs].sort((p, q) => p - q);
            if (b.finalBarline) a.finalBarline = b.finalBarline;
            a.topY = Math.min(a.topY, b.topY);
            a.bottomY = Math.max(a.bottomY, b.bottomY);
            drop.add(b);
          }
        }
      }
      for (const [sys, n] of countOf()) {
        const g = useRows.filter((r) => r.system === sys && !drop.has(r));
        const sysH = median(g.map((r) => median(r.nums.map((k) => k.bbox.h))));
        const sq = g.filter((r) => median(r.nums.map((k) => k.bbox.w / Math.max(1, k.bbox.h))) >= 0.85 && !(median(r.nums.map((k) => k.bbox.h)) < sysH * 0.85 && r.barlineXs.length >= 3));
        if (sq.length && n - sq.length >= 3) {
          probe("voices.dropLyricRow");
          for (const r of sq) drop.add(r);
        }
      }
      for (const r of drop) {
        delete r.system;
        delete r.voice;
      }
      const cThin = countOf(), fqThin = /* @__PURE__ */ new Map();
      for (const n of cThin.values()) fqThin.set(n, (fqThin.get(n) ?? 0) + 1);
      const mdThin = [...fqThin].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? 0;
      for (const [sys, n] of cThin) {
        const g = useRows.filter((r) => r.system === sys);
        const med = median(g.map((r) => r.nums.length));
        const thin = g.filter((r) => r.nums.length < med * 0.4 && (r.barlineXs.length < 3 || n > mdThin));
        if (thin.length && n - thin.length >= 3) {
          probe("voices.dropThin");
          for (const r of thin) drop.add(r);
        }
      }
      for (const r of drop) {
        delete r.system;
        delete r.voice;
      }
      {
        const c0 = countOf(), fq = /* @__PURE__ */ new Map();
        for (const n of c0.values()) fq.set(n, (fq.get(n) ?? 0) + 1);
        const md = [...fq].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] ?? 0;
        const medPage = median(useRows.filter((r) => r.system !== void 0).map((r) => r.nums.length));
        for (const [sys, n] of c0) {
          if (md < 2 || n !== md + 1 || (fq.get(md) ?? 0) < 2) continue;
          const g = useRows.filter((r) => r.system === sys);
          const short = g.reduce((a, b) => b.nums.length < a.nums.length ? b : a);
          if (short.nums.length < medPage * 0.5) {
            probe("voices.dropExtraThin");
            drop.add(short);
            delete short.system;
            delete short.voice;
          }
        }
      }
      let cnt = countOf();
      const freq = /* @__PURE__ */ new Map();
      for (const n of cnt.values()) freq.set(n, (freq.get(n) ?? 0) + 1);
      const mode = [...freq].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] ?? 0;
      let nextSys = Math.max(-1, ...cnt.keys()) + 1;
      const byY = useRows.filter((r) => !drop.has(r)).sort((x, y) => x.topY - y.topY);
      for (const [sys, n] of cnt) {
        if (mode < 2 || n !== mode * 2) continue;
        probe("voices.splitDouble");
        const g = byY.filter((r) => r.system === sys);
        for (const r of g.slice(mode)) r.system = nextSys;
        nextSys++;
      }
      for (let i = 0; i < byY.length; ) {
        let j = i;
        while (j < byY.length && byY[j].system === void 0) j++;
        if (j - i === mode && mode >= 2) {
          probe("voices.orphanSystem");
          for (let k = i; k < j; k++) byY[k].system = nextSys;
          nextSys++;
        }
        i = Math.max(j, i + 1);
      }
      cnt = countOf();
      byY.forEach((r, i) => {
        if (r.system !== void 0) return;
        const prev = byY[i - 1], next = byY[i + 1];
        if (prev?.system !== void 0 && (cnt.get(prev.system) ?? 0) < mode && r.topY - prev.bottomY < numH * 1.5) {
          probe("voices.adoptBelow");
          r.system = prev.system;
        } else if (next?.system !== void 0 && (cnt.get(next.system) ?? 0) < mode && next.topY - r.bottomY < numH * 1.5) {
          probe("voices.adoptAbove");
          r.system = next.system;
        } else return;
        cnt.set(r.system, (cnt.get(r.system) ?? 0) + 1);
      });
      byY.forEach((r, i) => {
        const prev = byY[i - 1];
        if (!prev || prev.system === void 0 || r.system === void 0 || r.system === prev.system) return;
        const a = cnt.get(prev.system) ?? 0, b = cnt.get(r.system) ?? 0;
        if (a >= b || b - a !== 2 || r.topY - prev.bottomY >= numH * 1.5) return;
        probe("voices.moveUp");
        cnt.set(r.system, b - 1);
        cnt.set(prev.system, a + 1);
        r.system = prev.system;
      });
      {
        const medAll = median(useRows.filter((r) => r.system !== void 0 && !drop.has(r)).map((r) => r.nums.length));
        for (const r of useRows) if (r.system === void 0 && !drop.has(r) && r.nums.length < medAll * 0.4) {
          probe("voices.dropOrphanThin");
          drop.add(r);
        }
      }
      if (drop.size) useRows = useRows.filter((r) => !drop.has(r));
      const order = [...new Set(byY.filter((r) => !drop.has(r) && r.system !== void 0).map((r) => r.system))];
      const remap = new Map(order.map((sys, k) => [sys, k]));
      for (const r of useRows) if (r.system !== void 0) r.system = remap.get(r.system);
    }
    const bySys = /* @__PURE__ */ new Map();
    for (const r of useRows) if (r.system !== void 0) (bySys.get(r.system) ?? bySys.set(r.system, []).get(r.system)).push(r);
    for (const g of bySys.values()) {
      g.sort((a, b) => a.topY - b.topY);
      g.forEach((r, i) => {
        if (r.voice !== i) {
          probe("voices.renumber");
          r.voice = i;
        }
      });
    }
    const sizes = [...bySys.values()].map((g) => g.length);
    const ok = useRows.every((r) => r.system !== void 0) && (bySys.size >= 2 || sizes[0] >= 3) && sizes.every((n) => n === sizes[0] && n >= 2) && [...bySys.values()].every((g) => g.every((r, i) => r.voice === i));
    probe(ok ? "voices" : "voices.reject");
    if (!ok) for (const r of useRows) {
      delete r.system;
      delete r.voice;
    }
    else {
      resolvePairOctaveDots(useRows, numH);
      for (const g of bySys.values()) {
        const endX = Math.max(...g.map((r) => r.barlineXs.length ? r.barlineXs[r.barlineXs.length - 1] : -Infinity));
        if (!Number.isFinite(endX)) continue;
        for (const r of g) {
          const last = r.barlineXs.length ? r.barlineXs[r.barlineXs.length - 1] : -Infinity;
          if (last >= endX - numH * 0.5 || r.nums.some((n) => rright(n.bbox) > endX)) continue;
          probe("voices.shareEndBar");
          r.barlineXs.push(endX);
        }
      }
    }
  }
  const headerMeters = [];
  for (const mk of meterMarks) {
    const mcy = rcy(mk.bbox);
    const ri = useRows.findIndex((r) => mcy >= r.topY - numH && mcy <= r.bottomY + numH);
    if (ri < 0) {
      if (useRows.length && mcy < useRows[0].topY) {
        probe("meter.header");
        headerMeters.push(mk);
      }
      continue;
    }
    probe("meter.inRow");
    const row = useRows[ri];
    (row.meters ??= []).push(mk);
    const anchor = row.nums.find((n) => n.bbox.x > mk.x) ?? useRows[ri + 1]?.nums[0];
    if (anchor) anchor.timeChange = { beats: mk.beats, beatType: mk.beatType };
  }
  for (const r of useRows) r.meters?.sort((a, b) => a.x - b.x);
  await detectRepeatsAndEndings(bin, comps, c.dots, useRows, numH, ocr);
  detectSegno(comps, useRows, numH);
  const tupComps = /* @__PURE__ */ new Set();
  {
    const cands = tupletCandidates(bin, [...comps, ...arcComps], useRows, numH);
    const digits = cands.length ? await ocr.recognizeDigits(bin, cands.map((c2) => c2.numeral)) : [];
    cands.forEach((cand, i) => {
      const actual = digits[i] ?? 0;
      if (![3, 5, 6, 7].includes(actual) || cand.notes.length < actual) return;
      if (cand.notes.length > actual) {
        const cx = rcx(cand.numeral);
        let bi = 0, bd = Infinity;
        for (let i2 = 0; i2 + actual <= cand.notes.length; i2++) {
          const w = cand.notes.slice(i2, i2 + actual);
          const d = Math.abs((rcx(w[0].bbox) + rcx(w[actual - 1].bbox)) / 2 - cx);
          if (d < bd) {
            bd = d;
            bi = i2;
          }
        }
        probe("tuplet.trimDense");
        cand.notes = cand.notes.slice(bi, bi + actual);
      }
      const normal = Math.pow(2, Math.floor(Math.log2(actual)));
      cand.notes.forEach((n, k) => {
        if (k === 0) probe("tuplet");
        n.tuplet = { actual, normal, start: k === 0, stop: k === cand.notes.length - 1 };
      });
      for (const a of cand.arcs) tupComps.add(a);
      const nb = cand.numeral;
      for (const row of useRows) for (const n of row.nums) {
        if (!n.grace) continue;
        const kept = n.grace.filter((g) => Math.min(rright(g.bbox), rright(nb)) - Math.max(g.bbox.x, nb.x) <= 0 || Math.min(rbottom(g.bbox), rbottom(nb)) - Math.max(g.bbox.y, nb.y) <= 0);
        if (kept.length !== n.grace.length) {
          probe("tuplet.dropGrace");
          n.grace = kept.length ? kept : void 0;
        }
      }
    });
  }
  const slurRefits = detectSlurs(bin, [...comps, ...arcComps].filter((k) => !tupComps.has(k)), useRows, numH);
  let title, subtitle, credits;
  let number, numberSide;
  let fifths = 0, tempo, tempoBeat;
  let beats = 4, beatType = 4;
  let meters, meterNote;
  let headerRegions;
  if (ocr.recognizeTexts && useRows.length) {
    const h = await recognizeHeader(
      bin,
      comps,
      useRows[0].topY,
      numH,
      ocr,
      headerMeters.sort((a, b) => a.bbox.x - b.bbox.x)
    );
    title = h.title;
    subtitle = h.subtitle;
    number = h.number;
    numberSide = h.numberSide;
    credits = h.credits.length ? h.credits : void 0;
    if (h.fifths !== void 0) fifths = h.fifths;
    if (h.beats !== void 0 && h.beatType !== void 0) {
      beats = h.beats;
      beatType = h.beatType;
    }
    meters = h.meters;
    meterNote = h.meterNote;
    tempo = h.tempo;
    tempoBeat = h.tempoBeat;
    headerRegions = h.regions.length ? h.regions : void 0;
  }
  let lyricRegions;
  let chordRegions;
  let stanzaRegions;
  let lyricCheck;
  if (ocr.recognizeTexts) {
    const inBrace = (k) => useRows.some((r) => r.voice !== void 0) && braceRects.some((br) => k.bbox.x >= br.x - numH * 0.3 && rright(k.bbox) <= rright(br) + 2 && k.bbox.y >= br.y - numH * 0.5 && rbottom(k.bbox) <= rbottom(br) + numH * 0.5 && (k.bbox.h >= numH * 2 || k.bbox.y <= br.y + numH * 1.5 || rbottom(k.bbox) >= rbottom(br) - numH * 1.5));
    const pairedGaps = [];
    for (let i = 0; i + 1 < useRows.length; i++) {
      const r = useRows[i], n = useRows[i + 1];
      if (r.system === void 0 || r.system !== n.system) continue;
      const gapMid = (r.bottomY + n.topY) / 2;
      if (c.barlines.some((k) => k.bbox.y < gapMid - numH * 0.3 && rbottom(k.bbox) > gapMid + numH * 0.3 && r.barlineXs.some((x) => Math.abs(x - rcx(k.bbox)) <= numH * 0.3))) pairedGaps.push([r.bottomY, n.topY]);
    }
    const inPairedGap = (k) => pairedGaps.some(([y0, y1]) => rcy(k.bbox) > y0 && rcy(k.bbox) < y1);
    const lyricComps = comps.filter((k) => !fermataArcs.has(k) && !inBrace(k) && !inPairedGap(k));
    const lr = await recognizeLyrics(bin, lyricComps, useRows, numH, ocr, headerRegions);
    lyricRegions = lr.lyrics.length ? lr.lyrics : void 0;
    chordRegions = lr.chords.length ? lr.chords : void 0;
    if (useRows.some((r) => r.voice !== void 0)) {
      const charsOf = (v) => useRows.filter((r) => r.voice === v).reduce((a, r) => a + r.nums.reduce((b, n) => b + (n.lyrics ?? []).join("").replace(/[^一-鿿A-Za-z]/g, "").length, 0), 0);
      const voices = [...new Set(useRows.map((r) => r.voice))];
      const best = Math.max(...voices.map(charsOf));
      for (const v of voices) {
        if (charsOf(v) >= best * 0.3) continue;
        probe("lyrics.voiceNoise");
        for (const r of useRows) if (r.voice === v) {
          for (const n of r.nums) delete n.lyrics;
          delete r.lyricLabels;
        }
      }
    }
    const st = await recognizeTrailingStanzas(bin, useRows, numH, ocr, lyricRegions);
    if (st.length) stanzaRegions = st;
    if (opts.refLyrics) {
      lyricCheck = await applyRefLyrics(
        { key: "C", fifths, beats, beatType, meters, rows: useRows, number, title },
        opts.refLyrics,
        lr.hooks
      );
    }
    resolveSlurRefits(slurRefits);
    if (opts.review !== false) await markLyricDoubts(useRows, lr.hooks);
  }
  {
    const verses = Math.max(0, ...useRows.flatMap((r) => r.nums.map((n) => n.lyrics?.length ?? 0)));
    if (verses > 1) probe("lyrics.multiVerse");
    if (chordRegions) probe("chords");
  }
  if (ocr.rankDigits) {
    const bad = [];
    for (const r of useRows) for (const n of r.nums) {
      if (n.digit !== 0) continue;
      const alignedToLyric = n.lyrics?.some((s) => s && s.trim());
      const notHollowRing = midbandInk(bin, n.bbox) >= 0.65 && !midbandHole(bin, n.bbox);
      if (alignedToLyric || notHollowRing) bad.push(n);
    }
    if (bad.length) {
      const ranks = await ocr.rankDigits(bin, bad.map((n) => n.bbox));
      bad.forEach((n, i) => {
        const nz = ranks[i]?.find((d) => d !== 0);
        if (nz !== void 0) {
          probe("restRestore");
          n.digit = nz;
        }
      });
    }
  }
  for (const r of useRows) {
    r.nums.forEach((n, i) => {
      if (n.digit !== 0 || !n.dot) return;
      const next = r.nums[i + 1];
      const sameBar = next && !r.barlineXs.some((x) => x > rright(n.bbox) && x < next.bbox.x);
      if (!sameBar) {
        probe("restDotClear");
        n.dot = 0;
      }
    });
  }
  {
    const flat = [];
    for (const row of useRows) {
      const withLyric = row.nums.filter((n) => n.lyrics?.some((t2) => t2 && t2.trim())).length;
      const has = row.nums.length > 0 && withLyric / row.nums.length >= 0.4;
      for (const n of row.nums) flat.push({ n, rowHasLyrics: has });
    }
    let depth = 0;
    for (let i = 1; i < flat.length; i++) {
      const cur = flat[i].n, prev = flat[i - 1].n;
      depth = Math.max(0, depth + (prev.slurStart ?? 0) - (prev.slurStop ?? 0));
      if (depth > 0 || prev.slurStop || cur.slurStart) {
        if (cur.digit === prev.digit && cur.octave === prev.octave) probe("impliedTie.inSlur");
        continue;
      }
      if (!flat[i].rowHasLyrics) continue;
      if (cur.lyrics?.some((t2) => t2 && t2.trim())) continue;
      if (cur.digit === 0 || prev.digit === 0) continue;
      if (cur.digit === RHYTHM_DIGIT) continue;
      if (cur.digit !== prev.digit || cur.octave !== prev.octave) continue;
      if (cur.tieStop || cur.slurStop || prev.tieStart || prev.slurStart) continue;
      probe("impliedTie");
      prev.tieStart = true;
      cur.tieStop = true;
    }
  }
  const dotDiam = dotSizes.length ? median(dotSizes) : void 0;
  return { key: "C", fifths, beats, beatType, meters, meterNote, rows: useRows, number, numberSide, title, subtitle, credits, tempo, tempoBeat, headerRegions, lyricRegions, chordRegions, stanzaRegions, dotDiam, lyricCheck };
}
const REC_H = 48, REC_MAXW = 320, REC_MAXW_LONG = 2048;
let _chars = null;
let _initPromise = null;
let _ready = false;
const _prof = { infer: 0, ctc: 0, calls: 0 };
function omrProfile() {
  return { ..._prof };
}
function omrProfileReset() {
  _prof.infer = 0;
  _prof.ctc = 0;
  _prof.calls = 0;
}
function isTauri() {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}
function nativeOcr() {
  const ov = globalThis.__omrNative;
  return typeof ov === "boolean" ? ov : isTauri();
}
async function tauriInvokeRaw(cmd, req) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("Tauri invoke 不可用");
  const raw = await invoke(cmd, req);
  return raw instanceof ArrayBuffer ? raw : raw.buffer.slice(
    raw.byteOffset,
    raw.byteOffset + raw.byteLength
  );
}
async function nativeInvoke(model, mode, chw, dims) {
  const nInts = 3 + dims.length;
  const req = new ArrayBuffer(nInts * 4 + chw.byteLength);
  const iv = new Int32Array(req, 0, nInts);
  iv[0] = model;
  iv[1] = mode;
  iv[2] = dims.length;
  for (let i = 0; i < dims.length; i++) iv[3 + i] = dims[i];
  new Float32Array(req, nInts * 4).set(chw);
  return tauriInvokeRaw("omr_onnx", req);
}
async function nativeRun(model, chw, dims) {
  const resp = await nativeInvoke(model, 0, chw, dims);
  const nd = new Int32Array(resp, 0, 1)[0];
  const outDims = Array.from(new Int32Array(resp, 4, nd));
  const data = new Float32Array(resp, (1 + nd) * 4);
  return { data, dims: outDims };
}
async function runRec(chw, dims) {
  if (nativeOcr()) return nativeRun(0, chw, dims);
  return omrRuntime().run("rec", chw, dims);
}
async function runDet(chw, dims) {
  if (nativeOcr()) return nativeRun(1, chw, dims);
  return omrRuntime().run("det", chw, dims);
}
async function localRecArgmax(chw, dims) {
  const o = await omrRuntime().run("rec", chw, dims);
  const [N, T, C] = o.dims;
  const arr = o.data;
  const idx = new Int32Array(N * T);
  for (let i = 0; i < N * T; i++) {
    const base = i * C;
    let best = 0, bv = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = arr[base + c];
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    idx[i] = best;
  }
  return { idx, N, T };
}
async function runRecArgmaxMany(inputs) {
  if (!inputs.length) return [];
  const _t = performance.now();
  _prof.calls++;
  if (nativeOcr()) {
    let bytes = 4;
    for (const inp of inputs) bytes += (3 + inp.dims.length) * 4 + inp.chw.byteLength;
    const req = new ArrayBuffer(bytes);
    const dv = new DataView(req);
    const u8 = new Uint8Array(req);
    let off = 0;
    dv.setInt32(off, inputs.length, true);
    off += 4;
    for (const inp of inputs) {
      dv.setInt32(off, 0, true);
      off += 4;
      dv.setInt32(off, 1, true);
      off += 4;
      dv.setInt32(off, inp.dims.length, true);
      off += 4;
      for (const d of inp.dims) {
        dv.setInt32(off, d, true);
        off += 4;
      }
      u8.set(new Uint8Array(inp.chw.buffer, inp.chw.byteOffset, inp.chw.byteLength), off);
      off += inp.chw.byteLength;
    }
    const resp = await tauriInvokeRaw("omr_onnx_batch", req);
    const rv = new DataView(resp);
    let ro = 0;
    const count = rv.getInt32(ro, true);
    ro += 4;
    const out2 = [];
    for (let i = 0; i < count; i++) {
      const nd = rv.getInt32(ro, true);
      ro += 4;
      const N = rv.getInt32(ro, true), T = rv.getInt32(ro + 4, true);
      ro += nd * 4;
      const idx = new Int32Array(resp.slice(ro, ro + N * T * 4));
      ro += N * T * 4;
      out2.push({ idx, N, T });
    }
    _prof.infer += performance.now() - _t;
    return out2;
  }
  const out = [];
  for (const inp of inputs) out.push(await localRecArgmax(inp.chw, inp.dims));
  _prof.infer += performance.now() - _t;
  return out;
}
async function ensureSession() {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const dictText = await omrRuntime().loadDict();
    _chars = ["", ...dictText.split(/\r?\n/).filter((l) => l.length)];
    if (nativeOcr()) {
      _ready = true;
      return;
    }
    await omrRuntime().prepare("rec");
    _ready = true;
  })();
  return _initPromise;
}
async function ensureDetSession() {
  await ensureSession();
  if (nativeOcr()) return;
  await omrRuntime().prepare("det");
}
async function detectRegion(src, region) {
  await ensureDetSession();
  const rx = Math.max(0, Math.round(region.x)), ry = Math.max(0, Math.round(region.y));
  const rw = Math.min(src.width - rx, Math.round(region.w)), rh = Math.min(src.height - ry, Math.round(region.h));
  if (rw < 8 || rh < 8) return [];
  const LIMIT = 960;
  let scale = Math.min(1, LIMIT / Math.max(rw, rh));
  const round32 = (n) => Math.max(32, Math.round(n * scale / 32) * 32);
  const W = round32(rw), H = round32(rh);
  const sxScale = W / rw, syScale = H / rh;
  const tmp = createSurface(W, H);
  blit(tmp, src, { x: rx, y: ry, w: rw, h: rh }, { x: 0, y: 0, w: W, h: H });
  const px = tmp.data;
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const chw = new Float32Array(3 * H * W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) chw[c * H * W + y * W + x] = (px[p + c] / 255 - mean[c]) / std[c];
  }
  const prob = (await runDet(chw, [1, 3, H, W])).data;
  const THRESH = 0.3, BOX_THRESH = 0.5;
  const bm = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bm[i] = prob[i] > THRESH ? 1 : 0;
  const seen = new Uint8Array(W * H);
  const boxes = [];
  const stack = [];
  for (let i0 = 0; i0 < W * H; i0++) {
    if (!bm[i0] || seen[i0]) continue;
    stack.length = 0;
    stack.push(i0);
    seen[i0] = 1;
    let minX = W, minY = H, maxX = 0, maxY = 0, n = 0, probSum = 0;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % W, y = idx / W | 0;
      n++;
      probSum += prob[idx];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && bm[idx - 1] && !seen[idx - 1]) {
        seen[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (x < W - 1 && bm[idx + 1] && !seen[idx + 1]) {
        seen[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (y > 0 && bm[idx - W] && !seen[idx - W]) {
        seen[idx - W] = 1;
        stack.push(idx - W);
      }
      if (y < H - 1 && bm[idx + W] && !seen[idx + W]) {
        seen[idx + W] = 1;
        stack.push(idx + W);
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < 4 || bh < 4 || probSum / n < BOX_THRESH) continue;
    const ratio = 1.6, dist = bw * bh * ratio / (2 * (bw + bh));
    const ex0 = minX - dist, ey0 = minY - dist, ex1 = maxX + dist, ey1 = maxY + dist;
    boxes.push({
      x: rx + ex0 / sxScale,
      y: ry + ey0 / syScale,
      w: (ex1 - ex0) / sxScale,
      h: (ey1 - ey0) / syScale
    });
  }
  const medH = boxes.length ? [...boxes.map((b) => b.h)].sort((a, b) => a - b)[boxes.length >> 1] : 0;
  boxes.sort((a, b) => Math.abs(a.y - b.y) > medH * 0.6 ? a.y - b.y : a.x - b.x);
  return boxes;
}
function cellOf(src, bin, r, cell = 64, pad = 8) {
  const inner = cell - pad * 2;
  const out = createSurface(cell, cell);
  const sx = Math.max(0, r.x), sy = Math.max(0, r.y);
  const sw = Math.min(bin.w, rright(r)) - sx, sh = Math.min(bin.h, rbottom(r)) - sy;
  if (sw > 0 && sh > 0) {
    const scale = Math.min(inner / sw, inner / sh);
    const dw = sw * scale, dh = sh * scale;
    blit(out, src, { x: sx, y: sy, w: sw, h: sh }, { x: (cell - dw) / 2, y: (cell - dh) / 2, w: dw, h: dh });
  }
  return out;
}
function prepCell(cell, maxW = REC_MAXW) {
  let w = Math.ceil(REC_H * (cell.width / cell.height));
  if (w > maxW) w = maxW;
  if (w < 1) w = 1;
  const tensorW = maxW <= REC_MAXW ? REC_MAXW : w;
  const tmp = createSurface(w, REC_H);
  blit(tmp, cell, { x: 0, y: 0, w: cell.width, h: cell.height }, { x: 0, y: 0, w, h: REC_H });
  const px = tmp.data;
  const chw = new Float32Array(3 * REC_H * tensorW);
  for (let y = 0; y < REC_H; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) chw[c * REC_H * tensorW + y * tensorW + x] = (px[p + c] / 255 - 0.5) / 0.5;
  }
  return { chw, dims: [1, 3, REC_H, tensorW], w, tensorW };
}
async function inferLogits(cell, maxW = REC_MAXW) {
  const { chw, dims, w, tensorW } = prepCell(cell, maxW);
  const o = await runRec(chw, dims);
  const [, T, C] = o.dims;
  return { arr: o.data, T, C, w, tensorW };
}
async function recognizeCharsPosMany(cells, maxW = REC_MAXW) {
  if (!cells.length) return [];
  const maxWOf = (c) => maxW === "auto" ? Math.min(REC_MAXW_LONG, Math.max(REC_MAXW, Math.ceil(REC_H * (c.width / c.height)))) : maxW;
  const preps = cells.map((c) => prepCell(c, maxWOf(c)));
  const results = await runRecArgmaxMany(preps.map((p) => ({ chw: p.chw, dims: p.dims })));
  const chars = _chars;
  const _t0 = performance.now();
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const out = preps.map((p, i) => {
    const { idx, T } = results[i];
    const res = [];
    let prev = -1, i0 = 0;
    for (let t2 = 0; t2 <= T; t2++) {
      const best = t2 < T ? idx[t2] : -1;
      if (best !== prev) {
        if (prev > 0) {
          const ch = chars[prev] ?? "";
          if (ch) res.push({ ch, xFrac: clamp(i0 * p.tensorW / T / p.w), x1Frac: clamp(t2 * p.tensorW / T / p.w) });
        }
        i0 = t2;
        prev = best;
      }
    }
    return res;
  });
  _prof.ctc += performance.now() - _t0;
  return out;
}
let _digitIdx = null;
function digitClassIdx() {
  if (_digitIdx) return _digitIdx;
  const chars = _chars;
  _digitIdx = Array.from({ length: 8 }, (_, d) => chars.indexOf(String(d)));
  return _digitIdx;
}
async function rankCharsOf(cell, maxW, k) {
  const { arr, T, C } = await inferLogits(cell, maxW);
  const chars = _chars;
  const out = [];
  const argmaxAt = (t2) => {
    const base = t2 * C;
    let best = 0, bv = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = arr[base + c];
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    return best;
  };
  const flush = (cls, i02, t1) => {
    const ch = chars[cls] ?? "";
    if (!ch) return;
    const top = [];
    for (let c = 1; c < C; c++) {
      let mx = -Infinity;
      for (let t2 = i02; t2 < t1; t2++) {
        const v = arr[t2 * C + c];
        if (v > mx) mx = v;
      }
      if (top.length < k || mx > top[top.length - 1].v) {
        top.push({ c, v: mx });
        top.sort((a, b) => b.v - a.v);
        if (top.length > k) top.pop();
      }
    }
    const kept = top.filter((x) => chars[x.c]);
    out.push({ ch, alts: kept.map((x) => chars[x.c]), scores: kept.map((x) => x.v) });
  };
  let prev = -1, i0 = 0;
  for (let t2 = 0; t2 <= T; t2++) {
    const best = t2 < T ? argmaxAt(t2) : -1;
    if (best !== prev) {
      if (prev > 0) flush(prev, i0, t2);
      i0 = t2;
      prev = best;
    }
  }
  return out;
}
async function rankDigitCandidates(cell) {
  const { arr, T, C } = await inferLogits(cell);
  const idx = digitClassIdx();
  const scored = idx.map((ci, d) => {
    let mx = -Infinity;
    if (ci >= 0) for (let t2 = 0; t2 < T; t2++) {
      const v = arr[t2 * C + ci];
      if (v > mx) mx = v;
    }
    return { d, mx };
  });
  scored.sort((a, b) => b.mx - a.mx);
  return scored.map((s) => s.d);
}
const DIGIT_W = REC_H;
const DIGIT_BATCH = 64;
async function recognizeDigitCells(cells) {
  await ensureSession();
  const chars = _chars;
  const inputs = [];
  const sizes = [];
  for (let i = 0; i < cells.length; i += DIGIT_BATCH) {
    const chunk = cells.slice(i, i + DIGIT_BATCH);
    const N = chunk.length;
    const chw = new Float32Array(N * 3 * REC_H * DIGIT_W);
    for (let n = 0; n < N; n++) {
      const tmp = createSurface(DIGIT_W, REC_H);
      blit(tmp, chunk[n], { x: 0, y: 0, w: chunk[n].width, h: chunk[n].height }, { x: 0, y: 0, w: DIGIT_W, h: REC_H });
      const px = tmp.data;
      const base = n * 3 * REC_H * DIGIT_W;
      for (let y = 0; y < REC_H; y++) for (let x = 0; x < DIGIT_W; x++) {
        const p = (y * DIGIT_W + x) * 4;
        for (let c = 0; c < 3; c++) chw[base + c * REC_H * DIGIT_W + y * DIGIT_W + x] = (px[p + c] / 255 - 0.5) / 0.5;
      }
    }
    inputs.push({ chw, dims: [N, 3, REC_H, DIGIT_W] });
    sizes.push(N);
  }
  const results = await runRecArgmaxMany(inputs);
  const out = [];
  const _t0 = performance.now();
  results.forEach((r, bi) => {
    const { idx, T } = r;
    for (let n = 0; n < sizes[bi]; n++) {
      const off = n * T;
      let prev = -1, s = "";
      for (let t2 = 0; t2 < T; t2++) {
        const best = idx[off + t2];
        if (best !== 0 && best !== prev) s += chars[best] ?? "";
        prev = best;
      }
      out.push(s);
    }
  });
  _prof.ctc += performance.now() - _t0;
  return out;
}
function paddleOcrBackend() {
  const backend = {
    async recognizeDigits(bin, rects, opts) {
      if (!rects.length) return [];
      await ensureSession();
      const src = surfaceFromBinary(bin);
      const cells = rects.map((r) => cellOf(src, bin, r));
      const texts = await recognizeDigitCells(cells);
      const closed = /* @__PURE__ */ new Map();
      for (let i = 0; i < texts.length; i++) {
        if (!/^[8B]$/.test(texts[i])) continue;
        closed.set(i, (await rankDigitCandidates(cells[i]))[0] ?? 0);
      }
      return texts.map((text, i) => {
        const m = text.match(/[0-7]/);
        if (m) return Number(m[0]);
        const c = closed.get(i);
        if (c !== void 0) return c;
        return opts?.rhythm && /^[XxＸｘ×]$/.test(text) ? RHYTHM_DIGIT : 0;
      });
    },
    async recognizeNumerals(bin, rects) {
      if (!rects.length) return [];
      await ensureSession();
      const src = surfaceFromBinary(bin);
      const texts = await recognizeDigitCells(rects.map((r) => cellOf(src, bin, r)));
      return texts.map((t2) => /^[0-9]$/.test(t2) ? Number(t2) : void 0);
    },
    async rankDigits(bin, rects) {
      if (!rects.length) return [];
      await ensureSession();
      const src = surfaceFromBinary(bin);
      const out = [];
      for (const r of rects) out.push(await rankDigitCandidates(cellOf(src, bin, r)));
      return out;
    },
    async recognizeTexts(strips) {
      if (!strips.length) return [];
      await ensureSession();
      return (await recognizeCharsPosMany(strips, "auto")).map((cp) => cp.map((c) => c.ch).join(""));
    },
    async rankTextChars(strips, k = 5) {
      if (!strips.length) return [];
      await ensureSession();
      const out = [];
      for (const c of strips) {
        const maxW = Math.min(REC_MAXW_LONG, Math.max(REC_MAXW, Math.ceil(REC_H * (c.width / c.height))));
        out.push(await rankCharsOf(c, maxW, k));
      }
      return out;
    },
    async recognizeTextsPos(strips) {
      if (!strips.length) return [];
      await ensureSession();
      return recognizeCharsPosMany(strips, "auto");
    },
    async recognizeRegion(bin, region) {
      await ensureSession();
      const src = surfaceFromBinary(bin);
      const boxes = await detectRegion(src, region);
      const items = [];
      for (const b of boxes) {
        const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
        const w = Math.min(bin.w - x, Math.round(b.w)), h = Math.min(bin.h - y, Math.round(b.h));
        if (w < 4 || h < 4) continue;
        const cv = createSurface(w, h);
        blit(cv, src, { x, y, w, h }, { x: 0, y: 0, w, h });
        items.push({ cv, x, y, w, h });
      }
      const cps = await recognizeCharsPosMany(items.map((it) => it.cv), 2048);
      const out = [];
      items.forEach((it, i) => {
        const cp = cps[i];
        const text = cp.map((c) => c.ch).join("");
        if (text.trim()) out.push({ text, bbox: { x: it.x, y: it.y, w: it.w, h: it.h }, chars: cp.map((c) => ({ text: c.ch, cx: it.x + c.xFrac * it.w, x1: it.x + c.x1Frac * it.w })) });
      });
      return out;
    }
  };
  return backend;
}
async function recognizeMusicppDetailed(bytes, mime, opts = {}) {
  const _t0 = performance.now();
  const bin = await decodeToBinary(bytes, mime);
  const _tDecode = performance.now();
  omrProfileReset();
  const score = await recognizeJianpu(bin, paddleOcrBackend(), opts);
  if (globalThis.__omrDebug) {
    const p = omrProfile();
    const total = performance.now() - _t0, decode = _tDecode - _t0, recog = performance.now() - _tDecode;
    console.log(`[OMR profile] 总 ${total.toFixed(0)}ms = decode ${decode.toFixed(0)} + recognize ${recog.toFixed(0)}  ｜ infer ${p.infer.toFixed(0)}ms(${p.calls}次) · CTC ${p.ctc.toFixed(0)}ms · 预处理+几何 ${(recog - p.infer - p.ctc).toFixed(0)}ms`);
  }
  return { bin, score };
}
const CONVERT_TARGETS = [
  // 123 / ABC 把 MusicXML 的纸写成 `I:meta page …`（`pagemeta.ts`），转过去再打开纸不丢
  { id: "123", get label() {
    return t("fmt.target.123");
  }, docFormat: "123", emit: (doc) => emit123(withPageMeta(doc)) },
  {
    id: "jpwabc",
    get label() {
      return t("fmt.target.jpwabc");
    },
    docFormat: "jpwabc",
    emit: (doc) => {
      const text = emitJpwabc(doc);
      if (text === null) throw new Error(t("err.noLines"));
      return text;
    }
  },
  { id: "abc", get label() {
    return t("fmt.target.abc");
  }, docFormat: "abc", emit: (doc) => emitAbc(withPageMeta(doc)) },
  { id: "tomato", get label() {
    return t("fmt.target.tomato");
  }, docFormat: "pu", emit: (doc) => emitPu(doc, "tomato") },
  { id: "shige", get label() {
    return t("fmt.target.shige");
  }, docFormat: "pu", emit: (doc) => emitPu(doc, "shige") },
  // jianpu-ly：能读能写，导出端是 `tojly.ts`（`%` 注释里带着"装不下什么"的说明，写在文本里随文件走）
  { id: "jly", get label() {
    return t("fmt.target.jly");
  }, docFormat: "jly", emit: (doc) => emitJly(doc).text },
  // Muse 曲谱软件：存盘按 `%MUSE2` + GBK（`common/jcxcodec.ts`），新旧版 Muse 都能开
  { id: "jcx", get label() {
    return t("fmt.target.jcx");
  }, docFormat: "jcx", emit: (doc) => emitJcx(doc) }
];
const rangeOf = (s) => s && s.length > 0 ? { from: s.offset, to: s.offset + s.length } : null;
function elementMeta(doc) {
  const meta = { noteRanges: [], lyricRanges: [], authorRanges: [] };
  const song = doc.songs[0];
  if (!song) return meta;
  let i = 0;
  for (const part of song.parts) {
    for (const m of part.measures) {
      for (const el of m.elements) {
        if (el.kind === "chord" && el.grace) continue;
        if (el.kind === "space" && el.spacer === "y") continue;
        meta.noteRanges[i] = rangeOf(el.source) ?? { from: 0, to: 0 };
        const slot = /* @__PURE__ */ new Map();
        for (const l of el.lyrics ?? []) {
          const r = rangeOf(l.source);
          if (!r) continue;
          for (let v = l.number; v <= (l.numberTo ?? l.number); v++) slot.set(v - 1, r);
        }
        meta.lyricRanges[i] = slot;
        i++;
      }
    }
  }
  return meta;
}
function headerMeta(meta, text, titleField, authorField) {
  const header = new RegExp(`^(${titleField}|${authorField})\\s*[:：]\\s*(.*?)\\s*$`, "gm");
  for (let m = header.exec(text); m; m = header.exec(text)) {
    const value = m[2] ?? "";
    if (!value) continue;
    const from = m.index + m[0].indexOf(value, m[1].length);
    const range = { from, to: from + value.length };
    if (m[1] === authorField) meta.authorRanges.push({ text: value, range });
    else meta.titleRange ??= range;
  }
}
function metaFrom123(text) {
  const meta = elementMeta(parse123(text));
  headerMeta(meta, text, "T", "C");
  return meta;
}
function metaFromJcx(text) {
  const meta = elementMeta(parseJcx(text));
  headerMeta(meta, text, "T", "C");
  return meta;
}
function metaFromPu(text, dialect) {
  const meta = elementMeta(parsePu(text, { dialect }));
  headerMeta(meta, text, "B|T", "Z");
  return meta;
}
const OMR_EMITTERS = CONVERT_TARGETS.map((t2) => ({
  id: t2.id,
  get label() {
    return t2.label;
  },
  emit: (rec) => {
    const doc = recognizedToDoc(rec);
    const text = t2.emit(doc);
    const meta = t2.docFormat === "123" ? metaFrom123(text) : t2.id === "tomato" || t2.id === "shige" ? metaFromPu(text, t2.id) : t2.id === "jcx" ? metaFromJcx(text) : null;
    return { kind: t2.docFormat, text, meta, doc };
  }
}));
const DEFAULT_OMR_FORMAT = OMR_EMITTERS[0].id;
function isOmrFormat(v) {
  return OMR_EMITTERS.some((e) => e.id === v);
}
function omrEmitter(id) {
  return OMR_EMITTERS.find((e) => e.id === id) ?? OMR_EMITTERS[0];
}
function recognizedBeatIssues(score) {
  const numOf = /* @__PURE__ */ new Map();
  const doc = recognizedToDoc(score, numOf);
  const rowOf = /* @__PURE__ */ new Map();
  score.rows.forEach((row, ri) => row.nums.forEach((n) => rowOf.set(n, ri)));
  const opts = score.meters?.length ? { meters: score.meters } : {};
  return checkMeasureDurations(doc, opts).map((issue) => {
    const nums = issue.ids.map((id) => numOf.get(id)).filter((n) => !!n);
    const byRow = /* @__PURE__ */ new Map();
    for (const n of nums) {
      const ri = rowOf.get(n) ?? -1;
      const b = n.bbox;
      const cur = byRow.get(ri);
      if (!cur) byRow.set(ri, { ...b });
      else {
        const x = Math.min(cur.x, b.x);
        const y = Math.min(cur.y, b.y);
        byRow.set(ri, { x, y, w: Math.max(cur.x + cur.w, b.x + b.w) - x, h: Math.max(cur.y + cur.h, b.y + b.h) - y });
      }
    }
    return {
      issue,
      text: t("beat.measure", { n: issue.measureIndex + 1, issue: describeBeatIssue(issue) }),
      boxes: [...byRow.values()],
      row: nums.length ? rowOf.get(nums[0]) ?? 0 : 0,
      toks: nums.map((n) => `${n.digit}${"/".repeat(n.div)}${".".repeat(n.dot)}${"-".repeat(n.augment)}`)
    };
  });
}
setOmrRuntime(nodeRuntime);
installNodeDecoder();
function decodeLyricsBytes(b) {
  if (b[0] === 255 && b[1] === 254) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 254 && b[1] === 255) return new TextDecoder("utf-16be").decode(b.subarray(2));
  if (b[0] === 239 && b[1] === 187 && b[2] === 191) return new TextDecoder("utf-8").decode(b.subarray(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("gbk").decode(b);
  }
}
async function recognizeImage(bytes, opts = {}) {
  const format = opts.format && isOmrFormat(opts.format) ? opts.format : DEFAULT_OMR_FORMAT;
  const detail = await recognizeMusicppDetailed(bytes, opts.mime, { refLyrics: opts.lyrics });
  const emitted = omrEmitter(format).emit(detail.score);
  return { text: emitted.text, kind: emitted.kind, format, detail };
}
export {
  DEFAULT_OMR_FORMAT,
  OMR_EMITTERS,
  decodeLyricsBytes,
  decodeToBinary,
  formatLyricCheckItem,
  isOmrFormat,
  metaFrom123,
  metaFromPu,
  omrEmitter,
  omrProfile,
  omrProfileReset,
  parseRefLyrics,
  recognizeImage,
  recognizeMusicppDetailed,
  recognizedBeatIssues,
  recognizedToDoc,
  setImageDecoder,
  threadInfo
};
