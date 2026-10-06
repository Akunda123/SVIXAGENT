import { b as barlineXml, w as wrapPartwise, s as scorePartXml, a as workXml, e as escapeXml, S as STANDARD_PAPERS, N as NO_LINE_START, o as overlayMeta } from "./pagemeta.js";
import { H, L, M, c, P, d, f, g, h, i, j, k, l, m, n, p, q, r, t, u, v } from "./pagemeta.js";
import { c as connectedComponents, m as mergeToChars, b as blankNonChord } from "./lyrics.js";
import { h as harmonyXml } from "./harmonyxml.js";
const DRAW_MOVE = 0;
const DRAW_LINE = 1;
const DRAW_CUBIC = 2;
const DRAW_QUAD = 3;
const DRAW_CLOSE = 4;
function drawOpArity(code) {
  switch (code) {
    case DRAW_MOVE:
    case DRAW_LINE:
      return 2;
    case DRAW_CUBIC:
      return 6;
    case DRAW_QUAD:
      return 4;
    case DRAW_CLOSE:
      return 0;
    default:
      return -1;
  }
}
function matMul(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}
function matApplyX(m2, x, y) {
  return m2[0] * x + m2[2] * y + m2[4];
}
function matApplyY(m2, x, y) {
  return m2[1] * x + m2[3] * y + m2[5];
}
function matScale(m2) {
  return Math.sqrt(Math.abs(m2[0] * m2[3] - m2[1] * m2[2])) || 1;
}
function emptyBox() {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}
function growBox(b, x, y) {
  if (x < b.x0) b.x0 = x;
  if (x > b.x1) b.x1 = x;
  if (y < b.y0) b.y0 = y;
  if (y > b.y1) b.y1 = y;
}
function boxToRect(b) {
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}
function rectsOverlap(a, b) {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}
function intersectRect(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function transformBox(m2, x0, y0, x1, y1) {
  const b = emptyBox();
  growBox(b, matApplyX(m2, x0, y0), matApplyY(m2, x0, y0));
  growBox(b, matApplyX(m2, x1, y0), matApplyY(m2, x1, y0));
  growBox(b, matApplyX(m2, x0, y1), matApplyY(m2, x0, y1));
  growBox(b, matApplyX(m2, x1, y1), matApplyY(m2, x1, y1));
  return boxToRect(b);
}
function pathBoundsRaw(data) {
  const b = emptyBox();
  let i2 = 0;
  let any = false;
  while (i2 < data.length) {
    const n2 = drawOpArity(data[i2++]);
    if (n2 < 0) break;
    for (let k2 = 0; k2 < n2; k2 += 2) {
      growBox(b, data[i2 + k2], data[i2 + k2 + 1]);
      any = true;
    }
    i2 += n2;
  }
  return any ? b : null;
}
function pathStats(data) {
  let curves = 0;
  let segs = 0;
  let i2 = 0;
  while (i2 < data.length) {
    const c2 = data[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    segs++;
    if (c2 === DRAW_CUBIC || c2 === DRAW_QUAD) curves++;
    i2 += n2;
  }
  return { curves, segs };
}
function toSvgPath(data, precision = 2) {
  const f2 = (v2) => v2.toFixed(precision);
  let d2 = "";
  let i2 = 0;
  while (i2 < data.length) {
    const c2 = data[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    if (c2 === DRAW_MOVE) d2 += `M${f2(data[i2])} ${f2(data[i2 + 1])}`;
    else if (c2 === DRAW_LINE) d2 += `L${f2(data[i2])} ${f2(data[i2 + 1])}`;
    else if (c2 === DRAW_CUBIC)
      d2 += `C${f2(data[i2])} ${f2(data[i2 + 1])} ${f2(data[i2 + 2])} ${f2(data[i2 + 3])} ${f2(data[i2 + 4])} ${f2(data[i2 + 5])}`;
    else if (c2 === DRAW_QUAD) d2 += `Q${f2(data[i2])} ${f2(data[i2 + 1])} ${f2(data[i2 + 2])} ${f2(data[i2 + 3])}`;
    else if (c2 === DRAW_CLOSE) d2 += "Z";
    i2 += n2;
  }
  return d2;
}
function toSvgPathTransformed(data, ctm, precision = 2) {
  const f2 = (v2) => v2.toFixed(precision);
  const X = (x, y) => f2(matApplyX(ctm, x, y));
  const Y = (x, y) => f2(matApplyY(ctm, x, y));
  let d2 = "";
  let i2 = 0;
  while (i2 < data.length) {
    const c2 = data[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    if (c2 === DRAW_MOVE) d2 += `M${X(data[i2], data[i2 + 1])} ${Y(data[i2], data[i2 + 1])}`;
    else if (c2 === DRAW_LINE) d2 += `L${X(data[i2], data[i2 + 1])} ${Y(data[i2], data[i2 + 1])}`;
    else if (c2 === DRAW_CUBIC)
      d2 += `C${X(data[i2], data[i2 + 1])} ${Y(data[i2], data[i2 + 1])} ${X(data[i2 + 2], data[i2 + 3])} ${Y(data[i2 + 2], data[i2 + 3])} ${X(data[i2 + 4], data[i2 + 5])} ${Y(data[i2 + 4], data[i2 + 5])}`;
    else if (c2 === DRAW_QUAD)
      d2 += `Q${X(data[i2], data[i2 + 1])} ${Y(data[i2], data[i2 + 1])} ${X(data[i2 + 2], data[i2 + 3])} ${Y(data[i2 + 2], data[i2 + 3])}`;
    else if (c2 === DRAW_CLOSE) d2 += "Z";
    i2 += n2;
  }
  return d2;
}
function objToSvg(o, extraAttrs = "") {
  const d2 = toSvgPath(o.data);
  const m2 = `matrix(${o.ctm.join(",")})`;
  const stroked = o.paint.toLowerCase().includes("stroke");
  const filled = o.paint.toLowerCase().includes("fill");
  const parts = [`transform="${m2}"`, `d="${d2}"`];
  if (o.paint === "eoFill" || o.paint === "eoFillStroke" || o.paint === "closeEOFillStroke")
    parts.push(`fill-rule="evenodd"`);
  parts.push(filled ? `fill="${o.fill ?? "#000"}"` : `fill="none"`);
  if (stroked) {
    const s = matScale(o.ctm);
    parts.push(`stroke="${o.stroke ?? "#000"}"`);
    parts.push(`stroke-width="${(Math.max(o.lineWidth, 1) / s).toFixed(3)}"`);
    if (o.dash && o.dash.length) parts.push(`stroke-dasharray="${o.dash.map((v2) => v2 / s).join(",")}"`);
    if (o.dashPhase) parts.push(`stroke-dashoffset="${(o.dashPhase / s).toFixed(3)}"`);
  }
  if (extraAttrs) parts.push(extraAttrs);
  return `<path ${parts.join(" ")}/>`;
}
function cloneGState(s) {
  return { ...s, ctm: [...s.ctm], dash: s.dash ? [...s.dash] : null };
}
async function extractVectorPage(page, OPS, opts = {}) {
  const scale = opts.scale ?? 1;
  const applyClip = opts.applyClip ?? true;
  const viewport = page.getViewport({ scale });
  const base = [...viewport.transform];
  const list = await page.getOperatorList();
  const names = opsNames(OPS);
  const pageRect = { x: 0, y: 0, w: viewport.width, h: viewport.height };
  const objs = [];
  const extras = { images: [], shadings: [], hasText: false };
  let gs = { ctm: base, lineWidth: 1, dash: null, dashPhase: 0, fill: "#000000", stroke: "#000000", clip: null };
  const stack = [];
  let pendingClip = false;
  let id = 0;
  for (let i2 = 0; i2 < list.fnArray.length; i2++) {
    const name = names[list.fnArray[i2]];
    const args = list.argsArray[i2];
    switch (name) {
      case "save":
        stack.push(cloneGState(gs));
        break;
      case "restore": {
        const prev = stack.pop();
        if (prev) gs = prev;
        break;
      }
      case "transform":
        gs.ctm = matMul(gs.ctm, args);
        break;
      case "setLineWidth":
        gs.lineWidth = args[0];
        break;
      case "setDash":
        gs.dash = Array.isArray(args[0]) && args[0].length ? args[0] : null;
        gs.dashPhase = args[1] ?? 0;
        break;
      case "setGState":
        for (const kv of args[0] ?? []) {
          if (kv?.[0] === "LW") gs.lineWidth = kv[1];
          else if (kv?.[0] === "D") {
            const d2 = kv[1];
            gs.dash = Array.isArray(d2?.[0]) && d2[0].length ? d2[0] : null;
            gs.dashPhase = d2?.[1] ?? 0;
          }
        }
        break;
      // Form XObject：pdfjs canvas 在 Begin 处 save + transform + 按 bbox 裁剪，
      // 在 End 处 restore。不跟着做的话，表单里的路径会少套一层矩阵——
      // 整块内容原样落在错误的位置上，且不会报任何错。
      case "paintFormXObjectBegin": {
        stack.push(cloneGState(gs));
        const m2 = args[0];
        if (m2 && m2.length >= 6) gs.ctm = matMul(gs.ctm, m2);
        const bb = args[1];
        if (bb && bb.length >= 4) {
          const r4 = transformBox(gs.ctm, bb[0], bb[1], bb[2], bb[3]);
          gs.clip = gs.clip ? intersectRect(gs.clip, r4) : r4;
        }
        break;
      }
      case "paintFormXObjectEnd": {
        const prev = stack.pop();
        if (prev) gs = prev;
        break;
      }
      case "setFillRGBColor":
        gs.fill = args[0];
        break;
      case "setStrokeRGBColor":
        gs.stroke = args[0];
        break;
      case "clip":
      case "eoClip":
        pendingClip = true;
        break;
      case "paintImageXObject":
      case "paintImageMaskXObject": {
        const arg = args[0];
        const oid = arg && typeof arg === "object" ? arg.data : arg;
        extras.images.push({ id: String(oid), ctm: [...gs.ctm], bbox: transformBox(gs.ctm, 0, 0, 1, 1) });
        break;
      }
      case "shadingFill":
        extras.shadings.push({ ctm: [...gs.ctm], bbox: gs.clip });
        break;
      case "showText":
      case "beginText":
        extras.hasText = true;
        break;
      case "constructPath": {
        const paint = names[args[0]] ?? "endPath";
        const data = args[1]?.[0];
        const minMax = args[2];
        if (!data || !data.length) {
          if (paint === "endPath") pendingClip = false;
          break;
        }
        let x0, y0, x1, y1;
        if (minMax && minMax.length >= 4) {
          x0 = minMax[0];
          y0 = minMax[1];
          x1 = minMax[2];
          y1 = minMax[3];
        } else {
          const raw = pathBoundsRaw(data);
          if (!raw) break;
          x0 = raw.x0;
          y0 = raw.y0;
          x1 = raw.x1;
          y1 = raw.y1;
        }
        let bbox = transformBox(gs.ctm, x0, y0, x1, y1);
        if (paint === "endPath") {
          if (pendingClip) {
            gs.clip = gs.clip ? intersectRect(gs.clip, bbox) : bbox;
            pendingClip = false;
          }
          break;
        }
        const dev = matScale(gs.ctm);
        const stroked = paint.toLowerCase().includes("stroke");
        const lw = gs.lineWidth * dev;
        if (stroked) {
          const half = lw / 2;
          bbox = { x: bbox.x - half, y: bbox.y - half, w: bbox.w + lw, h: bbox.h + lw };
        }
        const clip = gs.clip ? intersectRect(gs.clip, pageRect) : null;
        if (applyClip && clip && !rectsOverlap(bbox, clip)) break;
        const st = pathStats(data);
        objs.push({
          id: id++,
          data,
          ctm: [...gs.ctm],
          bbox,
          paint,
          curves: st.curves,
          segs: st.segs,
          lineWidth: lw,
          dash: gs.dash ? gs.dash.map((v2) => v2 * dev) : null,
          dashPhase: gs.dashPhase * dev,
          fill: gs.fill,
          stroke: gs.stroke,
          clip
        });
        break;
      }
    }
  }
  return {
    page: page.pageNumber ?? 0,
    width: viewport.width,
    height: viewport.height,
    rotation: viewport.rotation ?? 0,
    scale,
    objs,
    extras
  };
}
function opsNames(OPS) {
  const out = {};
  for (const k2 of Object.keys(OPS)) out[OPS[k2]] = k2;
  return out;
}
function concatObjects(objs, id = -1) {
  const parts = [];
  for (const o of objs) {
    const d2 = o.data;
    let i2 = 0;
    while (i2 < d2.length) {
      const c2 = d2[i2++];
      const n2 = drawOpArity(c2);
      if (n2 < 0) break;
      parts.push(c2);
      for (let k2 = 0; k2 < n2; k2 += 2) {
        parts.push(matApplyX(o.ctm, d2[i2 + k2], d2[i2 + k2 + 1]), matApplyY(o.ctm, d2[i2 + k2], d2[i2 + k2 + 1]));
      }
      i2 += n2;
    }
  }
  const b = emptyBox();
  for (const o of objs) {
    growBox(b, o.bbox.x, o.bbox.y);
    growBox(b, o.bbox.x + o.bbox.w, o.bbox.y + o.bbox.h);
  }
  const first = objs[0];
  return {
    ...first,
    id: id >= 0 ? id : first.id,
    data: new Float32Array(parts),
    ctm: [1, 0, 0, 1, 0, 0],
    bbox: boxToRect(b),
    curves: objs.reduce((a, o) => a + o.curves, 0),
    segs: objs.reduce((a, o) => a + o.segs, 0)
  };
}
function inkArea(o) {
  const m2 = o.ctm;
  const d2 = o.data;
  const filled = o.paint.toLowerCase().includes("fill");
  let i2 = 0;
  let sx = 0;
  let sy = 0;
  let px = 0;
  let py = 0;
  let started = false;
  let twice = 0;
  let perim = 0;
  const step = (x, y) => {
    const dx = matApplyX(m2, x, y);
    const dy = matApplyY(m2, x, y);
    if (started) {
      twice += px * dy - dx * py;
      perim += Math.hypot(dx - px, dy - py);
    }
    px = dx;
    py = dy;
    started = true;
  };
  while (i2 < d2.length) {
    const c2 = d2[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    if (c2 === DRAW_MOVE) {
      const x = d2[i2];
      const y = d2[i2 + 1];
      started = false;
      step(x, y);
      sx = px;
      sy = py;
    } else if (c2 === DRAW_CLOSE) {
      if (started) {
        twice += px * sy - sx * py;
        perim += Math.hypot(sx - px, sy - py);
        px = sx;
        py = sy;
      }
    } else {
      for (let k2 = 0; k2 < n2; k2 += 2) step(d2[i2 + k2], d2[i2 + k2 + 1]);
    }
    i2 += n2;
  }
  if (filled) return Math.abs(twice) / 2;
  return perim * Math.max(o.lineWidth, 0.5);
}
function componentsFromVector(objs, minArea = 4) {
  const out = [];
  for (const o of objs) {
    const area = inkArea(o);
    if (area < minArea) continue;
    const b = o.bbox;
    out.push({
      id: o.id,
      bbox: { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(1, Math.round(b.w)), h: Math.max(1, Math.round(b.h)) },
      area: Math.round(area),
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2
    });
  }
  return out;
}
async function isVectorPdf(doc, OPS, sampleCount = 5) {
  const names = opsNames(OPS);
  const n2 = doc.numPages;
  const picks = [];
  for (let k2 = 1; k2 <= sampleCount; k2++) picks.push(Math.max(1, Math.min(n2, Math.round(n2 * k2 / (sampleCount + 1)))));
  let paths = 0;
  let ops = 0;
  let textItems = 0;
  for (const pn of picks) {
    const page = await doc.getPage(pn);
    const tc = await page.getTextContent();
    textItems += tc.items.length;
    const list = await page.getOperatorList();
    for (const fn of list.fnArray) {
      ops++;
      if (names[fn] === "constructPath") paths++;
    }
    page.cleanup?.();
  }
  if (ops === 0) return false;
  return textItems === 0 && paths / ops > 0.15 && paths > 50 * picks.length;
}
function stripSubsetPrefix(name) {
  return name.replace(/^[A-Z]{6}\+/, "");
}
function cloneT(s) {
  return { ...s, ctm: [...s.ctm], tm: [...s.tm], fontMatrix: [...s.fontMatrix] };
}
const IDENT = [1, 0, 0, 1, 0, 0];
const FONT_IDENTITY = [1e-3, 0, 0, 1e-3, 0, 0];
function emptyRect() {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}
function grow(b, x, y) {
  if (x < b.x0) b.x0 = x;
  if (x > b.x1) b.x1 = x;
  if (y < b.y0) b.y0 = y;
  if (y > b.y1) b.y1 = y;
}
function toRect(b) {
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}
function boxThrough(m2, x0, y0, x1, y1) {
  const b = emptyRect();
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1]
  ]) {
    grow(b, matApplyX(m2, x, y), matApplyY(m2, x, y));
  }
  return toRect(b);
}
async function extractTextPage(page, OPS, opts = {}) {
  const scale = opts.scale ?? 1;
  const applyClip = opts.applyClip ?? true;
  const skipInvisible = opts.skipInvisible ?? true;
  const withOutlines = opts.withOutlines ?? true;
  const viewport = page.getViewport({ scale });
  const base = [...viewport.transform];
  const list = await page.getOperatorList();
  const names = opsNames(OPS);
  const pageRect = { x: 0, y: 0, w: viewport.width, h: viewport.height };
  const common = page.commonObjs;
  const out = [];
  let id = 0;
  let st = {
    ctm: base,
    clip: null,
    fill: "#000000",
    fontName: null,
    fontSize: 0,
    fontDirection: 1,
    fontMatrix: [...FONT_IDENTITY],
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    renderMode: 0,
    tm: [...IDENT],
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0
  };
  const stack = [];
  let pendingClip = false;
  const fontCache = /* @__PURE__ */ new Map();
  const getFont = (n2) => {
    let f2 = fontCache.get(n2);
    if (f2 === void 0) {
      f2 = common.has(n2) ? common.get(n2) : null;
      fontCache.set(n2, f2);
    }
    return f2;
  };
  const outlineCache = /* @__PURE__ */ new Map();
  const getOutline = (loadedName, fontChar) => {
    const key = loadedName + "_path_" + fontChar;
    let v2 = outlineCache.get(key);
    if (v2 === void 0) {
      let data = null;
      try {
        const cmds = common.has(key) ? common.get(key) : null;
        const p2 = cmds?.path;
        if (p2 && p2.length) data = p2 instanceof Float32Array ? p2 : new Float32Array(p2);
      } catch {
        data = null;
      }
      const raw = data ? pathBoundsRaw(data) : null;
      v2 = { data, box: raw ? { x: raw.x0, y: raw.y0, w: raw.x1 - raw.x0, h: raw.y1 - raw.y0 } : null };
      outlineCache.set(key, v2);
    }
    return v2;
  };
  for (let i2 = 0; i2 < list.fnArray.length; i2++) {
    const name = names[list.fnArray[i2]];
    const args = list.argsArray[i2];
    switch (name) {
      case "save":
        stack.push(cloneT(st));
        break;
      case "restore": {
        const prev = stack.pop();
        if (prev) st = prev;
        break;
      }
      case "transform":
        st.ctm = matMul(st.ctm, args);
        break;
      case "paintFormXObjectBegin": {
        stack.push(cloneT(st));
        const m2 = args[0];
        if (m2 && m2.length >= 6) st.ctm = matMul(st.ctm, m2);
        const bb = args[1];
        if (bb && bb.length >= 4) {
          const r4 = boxThrough(st.ctm, bb[0], bb[1], bb[2], bb[3]);
          st.clip = st.clip ? intersectRect(st.clip, r4) : r4;
        }
        break;
      }
      case "paintFormXObjectEnd": {
        const prev = stack.pop();
        if (prev) st = prev;
        break;
      }
      case "setFillRGBColor":
        st.fill = args[0];
        break;
      case "clip":
      case "eoClip":
        pendingClip = true;
        break;
      case "constructPath": {
        if (!pendingClip) break;
        const paint = names[args[0]] ?? "endPath";
        const data = args[1]?.[0];
        const minMax = args[2];
        if (paint === "endPath" && (data?.length || minMax)) {
          let r4 = null;
          if (minMax && minMax.length >= 4) r4 = boxThrough(st.ctm, minMax[0], minMax[1], minMax[2], minMax[3]);
          else if (data) {
            const raw = pathBoundsRaw(data);
            if (raw) r4 = boxThrough(st.ctm, raw.x0, raw.y0, raw.x1, raw.y1);
          }
          if (r4) st.clip = st.clip ? intersectRect(st.clip, r4) : r4;
        }
        pendingClip = false;
        break;
      }
      case "beginText":
        st.tm = [...IDENT];
        st.x = st.y = st.lineX = st.lineY = 0;
        break;
      case "setFont": {
        st.fontName = args[0];
        let size = args[1];
        if (size < 0) {
          size = -size;
          st.fontDirection = -1;
        } else {
          st.fontDirection = 1;
        }
        st.fontSize = size;
        const f2 = getFont(args[0]);
        st.fontMatrix = f2?.fontMatrix ?? [...FONT_IDENTITY];
        break;
      }
      case "setTextMatrix":
        st.tm = [...args[0]];
        st.x = st.y = st.lineX = st.lineY = 0;
        break;
      case "setLeading":
        st.leading = -args[0];
        break;
      case "setLeadingMoveText":
        st.leading = args[1];
        st.x = st.lineX += args[0];
        st.y = st.lineY += args[1];
        break;
      case "moveText":
        st.x = st.lineX += args[0];
        st.y = st.lineY += args[1];
        break;
      case "nextLine":
        st.x = st.lineX;
        st.y = st.lineY += st.leading;
        break;
      case "setCharSpacing":
        st.charSpacing = args[0];
        break;
      case "setWordSpacing":
        st.wordSpacing = args[0];
        break;
      case "setHScale":
        st.hScale = args[0] / 100;
        break;
      case "setTextRise":
        st.rise = args[0];
        break;
      case "setTextRenderingMode":
        st.renderMode = args[0];
        break;
      case "showText": {
        const glyphs = args[0];
        if (!glyphs?.length || !st.fontName || st.fontSize === 0) break;
        const font = getFont(st.fontName);
        if (!font) break;
        if (skipInvisible && st.renderMode === 3) break;
        const hs = st.hScale * st.fontDirection;
        const runM = matMul(matMul(st.ctm, st.tm), [hs, 0, 0, -1, st.x, st.y + st.rise]);
        const widthScale = st.fontSize * st.fontMatrix[0];
        const loadedName = font.loadedName ?? st.fontName;
        const fontRaw = font.name ?? st.fontName;
        const gl = [];
        const box = emptyRect();
        let adv = 0;
        for (const g2 of glyphs) {
          if (typeof g2 === "number") {
            adv += -g2 * st.fontSize / 1e3;
            continue;
          }
          const gg = g2;
          const spacing2 = (gg.isSpace ? st.wordSpacing : 0) + st.charSpacing;
          const gm = matMul(runM, [st.fontSize, 0, 0, -st.fontSize, adv, 0]);
          const ox = matApplyX(runM, adv, 0);
          const oy = matApplyY(runM, adv, 0);
          const charW = gg.width * widthScale + spacing2 * st.fontDirection;
          let outline = null;
          let bbox;
          let estimated = true;
          if (withOutlines) {
            const o = getOutline(loadedName, gg.fontChar);
            outline = o.data;
            if (o.box && o.box.w > 0 && o.box.h > 0) {
              bbox = boxThrough(gm, o.box.x, o.box.y, o.box.x + o.box.w, o.box.y + o.box.h);
              estimated = false;
            } else {
              bbox = estimateBox(gm, gg.width * st.fontMatrix[0], font);
            }
          } else {
            bbox = estimateBox(gm, gg.width * st.fontMatrix[0], font);
          }
          grow(box, bbox.x, bbox.y);
          grow(box, bbox.x + bbox.w, bbox.y + bbox.h);
          gl.push({
            code: gg.originalCharCode ?? -1,
            fontChar: gg.fontChar ?? "",
            unicode: gg.unicode ?? "",
            bbox,
            bboxEstimated: estimated,
            ox,
            oy,
            ctm: gm,
            advance: Math.hypot(runM[0] * charW, runM[1] * charW),
            outline
          });
          adv += charW;
        }
        st.x += adv * hs;
        if (gl.length) {
          const clip = st.clip ? intersectRect(st.clip, pageRect) : null;
          const bb = toRect(box);
          if (!applyClip || !clip || rectsOverlap(bb, clip)) {
            out.push({
              id: id++,
              font: stripSubsetPrefix(fontRaw),
              fontRaw,
              loadedName,
              size: st.fontSize,
              sizeDev: st.fontSize * matScale(matMul(st.ctm, st.tm)),
              glyphs: gl,
              bbox: bb,
              renderMode: st.renderMode,
              fill: st.fill,
              clip
            });
          }
        }
        break;
      }
      // **贴图字**：这本书把造字区的字（禰 之类）当 JBIG2 位图贴进内容流。
      // 详见下面 `maskRun` 的注释。
      case "paintImageMaskXObject":
      case "paintImageMaskXObjectGroup":
      case "paintImageMaskXObjectRepeat": {
        const items = Array.isArray(args[0]) ? args[0] : [args[0]];
        for (const it of items) {
          const r4 = maskRun(page, it, st, id, applyClip ? pageRect : null);
          if (r4) {
            out.push(r4);
            id++;
          }
        }
        break;
      }
    }
  }
  return out;
}
const MASK_FONT = "#mask";
function maskRun(page, item, st, id, pageRect) {
  const objId = typeof item === "string" ? item : item?.data;
  if (typeof objId !== "string") return null;
  let o = null;
  try {
    o = page.objs.has?.(objId) === false ? null : page.objs.get(objId);
  } catch {
    o = null;
  }
  if (!o?.data || !o.width || !o.height) return null;
  const box = boxThrough(st.ctm, 0, 0, 1, 1);
  if (pageRect && (box.x + box.w < 0 || box.y + box.h < 0 || box.x > pageRect.w || box.y > pageRect.h)) return null;
  const bbox = { x: box.x, y: box.y, w: box.w, h: box.h };
  const glyph = {
    code: 0,
    fontChar: "",
    unicode: "",
    bbox,
    bboxEstimated: false,
    ox: box.x,
    oy: box.y + box.h,
    ctm: [...st.ctm],
    advance: box.w,
    outline: null,
    maskSig: maskSignature(o.data, o.width, o.height)
  };
  return {
    id,
    font: MASK_FONT,
    fontRaw: MASK_FONT,
    loadedName: MASK_FONT,
    size: box.h,
    // 贴图只占**墨迹**那么大，等效字号按墨迹的长边估（汉字满一个 em 见方）
    sizeDev: Math.max(box.w, box.h),
    glyphs: [glyph],
    bbox,
    renderMode: 0,
    fill: st.fill,
    clip: st.clip
  };
}
const MASK_SIG_N = 24;
function maskSignature(data, w, h2) {
  const stride = w + 7 >> 3;
  let out = "";
  for (let y = 0; y < MASK_SIG_N; y++) {
    for (let x = 0; x < MASK_SIG_N; x++) {
      const sx = Math.min(w - 1, Math.floor(x * w / MASK_SIG_N));
      const sy = Math.min(h2 - 1, Math.floor(y * h2 / MASK_SIG_N));
      out += data[sy * stride + (sx >> 3)] >> 7 - (sx & 7) & 1 ? "0" : "1";
    }
  }
  return out;
}
function estimateBox(gm, widthEm, font) {
  const asc = typeof font?.ascent === "number" && font.ascent ? font.ascent : 0.75;
  const desc = typeof font?.descent === "number" && font.descent ? font.descent : -0.25;
  return boxThrough(gm, 0, desc, widthEm || 0.5, asc);
}
function fontTally(runs) {
  const m2 = /* @__PURE__ */ new Map();
  for (const r4 of runs) m2.set(r4.font, (m2.get(r4.font) ?? 0) + r4.glyphs.length);
  return m2;
}
function flatGlyphs(runs) {
  const out = [];
  for (const r4 of runs) for (const g2 of r4.glyphs) out.push({ run: r4, glyph: g2 });
  return out;
}
const SMUFL_NAMES = [
  // 谱号
  "gClef",
  "gClef8vb",
  "gClef8va",
  "fClef",
  "fClef8vb",
  "cClef",
  "unpitchedPercussionClef1",
  "unpitchedPercussionClef2",
  "sixStringTabClef",
  "clef8",
  // 符头
  "noteheadDoubleWhole",
  "noteheadWhole",
  "noteheadHalf",
  "noteheadBlack",
  "noteheadXBlack",
  "noteheadSlashVerticalEnds",
  "noteheadSlashHorizontalEnds",
  "noteheadSlashDiamondWhite",
  "noteheadDiamondBlack",
  "noteheadDiamondWhite",
  // 符尾
  "flag8thUp",
  "flag8thDown",
  "flag16thUp",
  "flag16thDown",
  "flag32ndUp",
  "flag32ndDown",
  "flag64thUp",
  "flag64thDown",
  // 休止
  "restDoubleWhole",
  "restWhole",
  "restHalf",
  "restQuarter",
  "rest8th",
  "rest16th",
  "rest32nd",
  "rest64th",
  "restHBar",
  // 附点
  "augmentationDot",
  // 拍号
  "timeSig0",
  "timeSig1",
  "timeSig2",
  "timeSig3",
  "timeSig4",
  "timeSig5",
  "timeSig6",
  "timeSig7",
  "timeSig8",
  "timeSig9",
  "timeSigCommon",
  "timeSigCutCommon",
  // 升降号
  "accidentalFlat",
  "accidentalNatural",
  "accidentalSharp",
  "accidentalDoubleSharp",
  "accidentalDoubleFlat",
  "accidentalNaturalParens",
  "accidentalParensLeft",
  "accidentalParensRight",
  // 括号与谱表装饰
  "brace",
  "bracket",
  "bracketTop",
  "bracketBottom",
  "repeatDots",
  "repeatDot",
  // 演奏法
  "fermataAbove",
  "fermataBelow",
  "articAccentAbove",
  "articAccentBelow",
  "articStaccatoAbove",
  "articStaccatoBelow",
  "articTenutoAbove",
  "articTenutoBelow",
  "articStaccatissimoAbove",
  "articStaccatissimoBelow",
  "articMarcatoAbove",
  "articMarcatoBelow",
  "articAccentStaccatoAbove",
  "articAccentStaccatoBelow",
  "articTenutoStaccatoAbove",
  "articTenutoStaccatoBelow",
  // 装饰音与记号
  "ornamentTrill",
  "wiggleTrill",
  "wiggleTrillSlow",
  "tremolo1",
  "tremolo2",
  "tremolo3",
  "graceNoteSlashStemUp",
  "graceNoteSlashStemDown",
  "segno",
  "coda",
  "caesura",
  "breathMarkComma",
  "ottavaAlta",
  "ottavaBassaVb",
  "ottava",
  // 力度
  "dynamicPiano",
  "dynamicMezzo",
  "dynamicForte",
  "dynamicRinforzando",
  "dynamicSforzando",
  "dynamicZ",
  "dynamicNiente",
  "dynamicPP",
  "dynamicPPP",
  "dynamicMP",
  "dynamicMF",
  "dynamicFF",
  "dynamicFFF",
  // 节拍/文字里的音符
  "metNoteQuarterUp",
  "metNote8thUp",
  "metNoteHalfUp",
  "metAugmentationDot",
  // 和弦符号里的
  "csymAugmented",
  "csymDiminished",
  "csymHalfDiminished",
  "csymParensLeftTall",
  "csymParensRightTall",
  "csymAccidentalFlat",
  "csymAccidentalNatural",
  "csymAccidentalSharp",
  // 三连音数字（OpusText 里有）
  "tuplet0",
  "tuplet3",
  // 踏板
  "keyboardPedalPed",
  "keyboardPedalUp",
  // **结构件**：Sibelius 的手写体（Anastasia）把谱线/符干/加线/小节线都当**字形**画，
  // 不是路径（Anastasia 那 115 页实测一条长横路径都没有）。识别侧必须认得它们，
  // 否则 findStaves 在那些页上会一无所获。
  "staff5Lines",
  "stem",
  "legerLine",
  "barlineSingle",
  "barlineHeavy",
  "barlineFinal",
  "barlineDouble",
  "repeatLeft",
  "repeatRight",
  "repeatRightLeft"
];
const NAME_SET = new Set(SMUFL_NAMES);
function isSmuflName(s) {
  return NAME_SET.has(s);
}
const CLEFS = /* @__PURE__ */ new Set([
  "gClef",
  "gClef8vb",
  "gClef8va",
  "fClef",
  "fClef8vb",
  "cClef",
  "unpitchedPercussionClef1",
  "unpitchedPercussionClef2",
  "sixStringTabClef"
]);
const RESTS = /* @__PURE__ */ new Set([
  "restDoubleWhole",
  "restWhole",
  "restHalf",
  "restQuarter",
  "rest8th",
  "rest16th",
  "rest32nd",
  "rest64th",
  "restHBar"
]);
const HEADS = /* @__PURE__ */ new Set([
  "noteheadDoubleWhole",
  "noteheadWhole",
  "noteheadHalf",
  "noteheadBlack",
  "noteheadXBlack",
  "noteheadSlashVerticalEnds",
  "noteheadSlashHorizontalEnds",
  "noteheadSlashDiamondWhite",
  "noteheadDiamondBlack",
  "noteheadDiamondWhite"
]);
const ACCIDENTALS = /* @__PURE__ */ new Set([
  "accidentalFlat",
  "accidentalNatural",
  "accidentalSharp",
  "accidentalDoubleSharp",
  "accidentalDoubleFlat",
  "accidentalNaturalParens"
]);
const TIMESIGS = /* @__PURE__ */ new Set([
  "timeSig0",
  "timeSig1",
  "timeSig2",
  "timeSig3",
  "timeSig4",
  "timeSig5",
  "timeSig6",
  "timeSig7",
  "timeSig8",
  "timeSig9",
  "timeSigCommon",
  "timeSigCutCommon"
]);
const FLAGS = /* @__PURE__ */ new Set([
  "flag8thUp",
  "flag8thDown",
  "flag16thUp",
  "flag16thDown",
  "flag32ndUp",
  "flag32ndDown",
  "flag64thUp",
  "flag64thDown"
]);
const isClef = (g2) => CLEFS.has(g2);
const isRest = (g2) => RESTS.has(g2);
const isNoteHead = (g2) => RESTS.has(g2) || HEADS.has(g2);
const isPitchedHead = (g2) => HEADS.has(g2);
const isAccidental = (g2) => ACCIDENTALS.has(g2);
const isTimeSig = (g2) => TIMESIGS.has(g2);
const isFlag = (g2) => FLAGS.has(g2);
function flagLevel(g2) {
  switch (g2) {
    case "flag8thUp":
    case "flag8thDown":
      return 1;
    case "flag16thUp":
    case "flag16thDown":
      return 2;
    case "flag32ndUp":
    case "flag32ndDown":
      return 3;
    case "flag64thUp":
    case "flag64thDown":
      return 4;
    default:
      return 0;
  }
}
function flagUp(g2) {
  return g2.endsWith("Up");
}
function restDuration(g2) {
  switch (g2) {
    case "restDoubleWhole":
      return 2;
    case "restWhole":
      return 1;
    case "restHalf":
      return 1 / 2;
    case "restQuarter":
      return 1 / 4;
    case "rest8th":
      return 1 / 8;
    case "rest16th":
      return 1 / 16;
    case "rest32nd":
      return 1 / 32;
    case "rest64th":
      return 1 / 64;
    case "restHBar":
      return -1;
    default:
      return 0;
  }
}
function accidentalAlter(g2) {
  switch (g2) {
    case "accidentalFlat":
      return -1;
    case "accidentalDoubleFlat":
      return -2;
    case "accidentalSharp":
      return 1;
    case "accidentalDoubleSharp":
      return 2;
    case "accidentalNatural":
    case "accidentalNaturalParens":
      return 0;
    default:
      return 0;
  }
}
function timeSigDigit(g2) {
  if (g2.startsWith("timeSig") && g2.length === 8) {
    const d2 = g2.charCodeAt(7) - 48;
    if (d2 >= 0 && d2 <= 9) return d2;
  }
  return -1;
}
const COMMON = {
  63: "fClef",
  // '?'
  38: "gClef",
  // '&'
  66: "cClef",
  // 'B'
  99: "timeSigCommon",
  // 'c'
  67: "timeSigCutCommon",
  // 'C'
  48: "timeSig0",
  49: "timeSig1",
  50: "timeSig2",
  51: "timeSig3",
  52: "timeSig4",
  53: "timeSig5",
  54: "timeSig6",
  55: "timeSig7",
  56: "timeSig8",
  57: "timeSig9",
  339: "noteheadBlack",
  // œ
  729: "noteheadHalf",
  // ˙
  119: "noteheadWhole",
  // 'w'
  87: "noteheadDoubleWhole",
  // 'W'
  338: "restQuarter",
  // Œ
  8240: "rest8th",
  // ‰
  211: "restHalf",
  // Ó
  8721: "restHBar",
  // ∑
  8776: "rest16th",
  // ≈
  106: "flag8thUp",
  // 'j'
  74: "flag8thDown",
  // 'J'
  114: "flag16thUp",
  // 'r'
  82: "flag16thDown",
  // 'R'
  46: "augmentationDot",
  // '.'
  98: "accidentalFlat",
  // 'b'
  110: "accidentalNatural",
  // 'n'
  35: "accidentalSharp",
  // '#'
  85: "fermataAbove",
  // 'U'
  117: "fermataBelow",
  // 'u'
  113: "metNoteQuarterUp"
  // 'q'
};
const MAESTRO = {
  61678: "restHalf",
  8776: "rest16th",
  211: "restHalf",
  338: "restQuarter",
  339: "noteheadBlack",
  729: "noteheadHalf",
  86: "gClef8vb",
  // 'V'
  247: "unpitchedPercussionClef2",
  // '÷'
  62: "articAccentAbove",
  // '>'
  8240: "rest8th",
  8730: "ottavaAlta",
  // '√'
  8721: "restHBar",
  9674: "ottavaBassaVb",
  // '◊'
  960: "dynamicPP",
  // 'π'
  103: "wiggleTrill",
  // 'g'
  223: "dynamicSforzando",
  // 'ß'
  80: "dynamicMP",
  // 'P'
  112: "dynamicMF",
  // 'p' —— 照 musicpp 原文（Maestro 里 'p' 是 mf 的合字）
  70: "dynamicMF",
  // 'F'
  102: "dynamicForte",
  // 'f'
  402: "dynamicFF",
  // 'ƒ'
  44: "breathMarkComma",
  // ','
  118: "articMarcatoBelow",
  // 'v'
  64258: "articAccentStaccatoBelow",
  // 'ﬂ'
  64257: "segno",
  // 'ﬁ'
  60: "articTenutoStaccatoBelow",
  // '<'
  101: "metNote8thUp",
  // 'e'
  45: "articTenutoBelow",
  // '-'
  61623: "restHBar",
  61690: "restHalf",
  111: "csymDiminished",
  // 'o'
  40: "csymParensLeftTall",
  // '('
  41: "csymParensRightTall",
  // ')'
  43: "csymAugmented",
  // '+'
  37: "segno",
  // '%'
  219: "noteheadSlashVerticalEnds",
  // 'Û'
  124: "noteheadSlashDiamondWhite",
  // '|'
  199: "noteheadHalf",
  // 'Ç'
  135: "restHBar",
  187: "restHalf",
  // '»'
  8249: "accidentalDoubleSharp",
  // '‹'
  78: "accidentalNaturalParens",
  // 'N'
  8217: "noteheadSlashHorizontalEnds"
  // '’'
};
const MAESTRO_WIDE = {
  33: "restHBar"
  // '!'
};
const OPUS = {
  207: "noteheadBlack",
  250: "noteheadHalf",
  206: "restQuarter",
  228: "rest8th",
  197: "rest16th",
  238: "restHalf",
  183: "restHBar",
  217: "ornamentTrill"
};
const OPUS_STD = {
  37: "segno",
  // '%'
  8721: "restHBar",
  191: "noteheadXBlack"
};
const OPUS_SPECIAL = {
  161: "bracketTop",
  162: "bracketBottom",
  123: "brace",
  // '{'
  220: "clef8",
  170: "augmentationDot"
};
const OPUS_SPECIAL_STD = {
  176: "bracketTop",
  162: "bracketBottom",
  8482: "augmentationDot",
  8719: "wiggleTrill",
  8249: "clef8",
  123: "brace"
};
const OPUS_TEXT = {
  113: "metNoteQuarterUp",
  // 'q'
  112: "dynamicPiano",
  // 'p'
  102: "dynamicForte",
  // 'f'
  109: "dynamicMezzo",
  // 'm'
  51: "tuplet3"
  // '3'
};
const PETRUCCI = OPUS;
function musicFamily(font) {
  if (font.startsWith("MaestroWide")) return "MaestroWide";
  if (font.startsWith("Maestro")) return "Maestro";
  if (font.startsWith("OpusSpecialStd")) return "OpusSpecialStd";
  if (font.startsWith("OpusSpecial")) return "OpusSpecial";
  if (font.startsWith("OpusText")) return "OpusText";
  if (font.startsWith("OpusStd")) return "OpusStd";
  if (font.startsWith("OpusChords")) return null;
  if (font.startsWith("Opus")) return "Opus";
  if (font.startsWith("Petrucci")) return "Petrucci";
  if (font.startsWith("Anastasia")) return "Anastasia";
  return null;
}
function tableOf(family) {
  switch (family) {
    case "Maestro":
      return [MAESTRO, COMMON];
    case "MaestroWide":
      return [MAESTRO_WIDE, MAESTRO, COMMON];
    case "Opus":
      return [OPUS, COMMON];
    case "OpusStd":
      return [OPUS_STD, COMMON];
    case "OpusSpecial":
      return [OPUS_SPECIAL];
    case "OpusSpecialStd":
      return [OPUS_SPECIAL_STD];
    case "OpusText":
      return [OPUS_TEXT];
    case "Petrucci":
      return [PETRUCCI, COMMON];
    case "Anastasia":
      return [];
  }
}
function guessByCode(font, unicode, code) {
  const fam = musicFamily(font);
  if (!fam) return null;
  const tables = tableOf(fam);
  const keys = [];
  if (unicode > 61440) keys.push(unicode - 61440);
  keys.push(unicode, code);
  for (const k2 of keys) {
    if (!k2) continue;
    for (const t2 of tables) {
      const v2 = t2[k2];
      if (v2) return v2;
    }
  }
  return null;
}
const QUANT = 50;
function hash2(s) {
  let a = 5381;
  let b = 0;
  for (let i2 = 0; i2 < s.length; i2++) {
    const c2 = s.charCodeAt(i2);
    a = (a << 5) + a + c2 | 0;
    b = c2 + (b << 6) + (b << 16) - b | 0;
  }
  return (a >>> 0).toString(36) + "-" + (b >>> 0).toString(36);
}
function rawBounds(data) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let i2 = 0;
  let any = false;
  while (i2 < data.length) {
    const n2 = drawOpArity(data[i2++]);
    if (n2 < 0) break;
    for (let k2 = 0; k2 < n2; k2 += 2) {
      const x = data[i2 + k2];
      const y = data[i2 + k2 + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      any = true;
    }
    i2 += n2;
  }
  return any ? { x0, y0, x1, y1 } : null;
}
function shapeKey(data) {
  const b = rawBounds(data);
  if (!b) return "empty";
  const h2 = b.y1 - b.y0 || 1;
  const s = QUANT / h2;
  const parts = [];
  let i2 = 0;
  while (i2 < data.length) {
    const c2 = data[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    parts.push(c2);
    for (let k2 = 0; k2 < n2; k2 += 2) {
      parts.push(Math.round((data[i2 + k2] - b.x0) * s), Math.round((data[i2 + k2 + 1] - b.y0) * s));
    }
    i2 += n2;
  }
  return hash2(parts.join(","));
}
const SIG_N = 32;
function flatten(data, steps = 6) {
  const rings = [];
  let cur = [];
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  const push = (x, y) => {
    cur.push(x, y);
    px = x;
    py = y;
  };
  let i2 = 0;
  while (i2 < data.length) {
    const c2 = data[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    if (c2 === DRAW_MOVE) {
      if (cur.length >= 6) rings.push(cur);
      cur = [];
      sx = data[i2];
      sy = data[i2 + 1];
      push(sx, sy);
    } else if (c2 === DRAW_LINE) {
      push(data[i2], data[i2 + 1]);
    } else if (c2 === DRAW_CUBIC) {
      const x0 = px;
      const y0 = py;
      for (let t2 = 1; t2 <= steps; t2++) {
        const u2 = t2 / steps;
        const v2 = 1 - u2;
        const x = v2 * v2 * v2 * x0 + 3 * v2 * v2 * u2 * data[i2] + 3 * v2 * u2 * u2 * data[i2 + 2] + u2 * u2 * u2 * data[i2 + 4];
        const y = v2 * v2 * v2 * y0 + 3 * v2 * v2 * u2 * data[i2 + 1] + 3 * v2 * u2 * u2 * data[i2 + 3] + u2 * u2 * u2 * data[i2 + 5];
        push(x, y);
      }
    } else if (c2 === DRAW_QUAD) {
      const x0 = px;
      const y0 = py;
      for (let t2 = 1; t2 <= steps; t2++) {
        const u2 = t2 / steps;
        const v2 = 1 - u2;
        push(v2 * v2 * x0 + 2 * v2 * u2 * data[i2] + u2 * u2 * data[i2 + 2], v2 * v2 * y0 + 2 * v2 * u2 * data[i2 + 1] + u2 * u2 * data[i2 + 3]);
      }
    } else if (c2 === DRAW_CLOSE) {
      if (cur.length >= 6) {
        rings.push(cur);
        cur = [];
        push(sx, sy);
        cur = [];
      }
    }
    i2 += n2;
  }
  if (cur.length >= 6) rings.push(cur);
  return rings;
}
function shapeSig(data) {
  const sig = new Uint8Array(SIG_N * SIG_N);
  const b = rawBounds(data);
  if (!b) return sig;
  const w = b.x1 - b.x0 || 1;
  const h2 = b.y1 - b.y0 || 1;
  const sc = (SIG_N - 2) / Math.max(w, h2);
  const ox = (SIG_N - w * sc) / 2;
  const oy = (SIG_N - h2 * sc) / 2;
  const rings = flatten(data).map((r4) => {
    const o = [];
    for (let i2 = 0; i2 < r4.length; i2 += 2) o.push((r4[i2] - b.x0) * sc + ox, (r4[i2 + 1] - b.y0) * sc + oy);
    return o;
  });
  for (let py = 0; py < SIG_N; py++) {
    const y = py + 0.5;
    const xs = [];
    for (const r4 of rings) {
      for (let i2 = 0; i2 < r4.length; i2 += 2) {
        const x1 = r4[i2];
        const y1 = r4[i2 + 1];
        const x2 = r4[(i2 + 2) % r4.length];
        const y2 = r4[(i2 + 3) % r4.length];
        if (y1 === y2) continue;
        if (y >= Math.min(y1, y2) && y < Math.max(y1, y2)) {
          xs.push({ x: x1 + (y - y1) / (y2 - y1) * (x2 - x1), dir: y2 > y1 ? 1 : -1 });
        }
      }
    }
    if (!xs.length) continue;
    xs.sort((a, c2) => a.x - c2.x);
    let wind = 0;
    for (let k2 = 0; k2 < xs.length - 1; k2++) {
      wind += xs[k2].dir;
      if (wind === 0) continue;
      const from = Math.max(0, Math.ceil(xs[k2].x - 0.5));
      const to = Math.min(SIG_N - 1, Math.floor(xs[k2 + 1].x - 0.5));
      for (let px = from; px <= to; px++) sig[py * SIG_N + px] = 1;
    }
  }
  return sig;
}
function sigDistance(a, b) {
  let d2 = 0;
  for (let i2 = 0; i2 < a.length; i2++) if (a[i2] !== b[i2]) d2++;
  return d2;
}
function encodeSig(sig) {
  let s = "";
  for (let i2 = 0; i2 < sig.length; i2 += 8) {
    let byte = 0;
    for (let k2 = 0; k2 < 8; k2++) if (sig[i2 + k2]) byte |= 1 << k2;
    s += String.fromCharCode(byte);
  }
  return toBase64(s);
}
function decodeSig(b64) {
  const s = fromBase64(b64);
  const sig = new Uint8Array(SIG_N * SIG_N);
  for (let i2 = 0; i2 < s.length; i2++) {
    const byte = s.charCodeAt(i2);
    for (let k2 = 0; k2 < 8; k2++) sig[i2 * 8 + k2] = byte >> k2 & 1;
  }
  return sig;
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(s) {
  let out = "";
  for (let i2 = 0; i2 < s.length; i2 += 3) {
    const a = s.charCodeAt(i2);
    const b = i2 + 1 < s.length ? s.charCodeAt(i2 + 1) : 0;
    const c2 = i2 + 2 < s.length ? s.charCodeAt(i2 + 2) : 0;
    out += B64[a >> 2] + B64[(a & 3) << 4 | b >> 4];
    out += i2 + 1 < s.length ? B64[(b & 15) << 2 | c2 >> 6] : "=";
    out += i2 + 2 < s.length ? B64[c2 & 63] : "=";
  }
  return out;
}
function fromBase64(s) {
  let out = "";
  const clean = s.replace(/=+$/, "");
  for (let i2 = 0; i2 < clean.length; i2 += 4) {
    const n2 = B64.indexOf(clean[i2]) << 18 | B64.indexOf(clean[i2 + 1]) << 12 | (i2 + 2 < clean.length ? B64.indexOf(clean[i2 + 2]) : 0) << 6 | (i2 + 3 < clean.length ? B64.indexOf(clean[i2 + 3]) : 0);
    out += String.fromCharCode(n2 >> 16 & 255);
    if (i2 + 2 < clean.length) out += String.fromCharCode(n2 >> 8 & 255);
    if (i2 + 3 < clean.length) out += String.fromCharCode(n2 & 255);
  }
  return out;
}
function buildClasses(objs, dict) {
  const d2 = dict ?? { book: "unknown", quant: QUANT, classes: {} };
  for (const o of objs) {
    const key = shapeKey(o.data);
    const c2 = d2.classes[key];
    if (c2) {
      c2.count++;
      continue;
    }
    d2.classes[key] = {
      key,
      char: null,
      source: null,
      count: 1,
      h: o.bbox.h,
      w: o.bbox.w,
      d: ""
    };
  }
  return d2;
}
class GlyphIndex {
  byKey = /* @__PURE__ */ new Map();
  sigs = [];
  constructor(dict) {
    if (dict) this.load(dict);
  }
  load(dict) {
    for (const c2 of Object.values(dict.classes)) {
      this.byKey.set(c2.key, c2);
      if (c2.sig && c2.char) this.sigs.push({ cls: c2, sig: decodeSig(c2.sig) });
    }
  }
  get size() {
    return this.byKey.size;
  }
  /** 精确查。 */
  lookup(data) {
    return this.byKey.get(shapeKey(data)) ?? null;
  }
  /** 模糊查：签名最近邻，超过 maxDist 返回 null。 */
  lookupFuzzy(data, maxDist = SIG_N * SIG_N * 0.06) {
    const exact = this.lookup(data);
    if (exact?.char) return { cls: exact, dist: 0 };
    if (!this.sigs.length) return null;
    const sig = shapeSig(data);
    let best = null;
    for (const s of this.sigs) {
      const dist = sigDistance(sig, s.sig);
      if (!best || dist < best.dist) best = { cls: s.cls, dist };
    }
    return best && best.dist <= maxDist ? best : null;
  }
  /** 读出一个对象的字符（读不出返回 null）。 */
  charOf(o) {
    return this.lookup(o.data)?.char ?? null;
  }
}
function blockPunct(d2, text) {
  if (!/^[0-9]{2,}$/.test(text)) return null;
  const boxes = d2.split("M").slice(1).map((seg) => {
    const nums = (seg.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i22) => i22 % 2 === 0);
    const ys = nums.filter((_, i22) => i22 % 2 === 1);
    if (!xs.length || !ys.length) return null;
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), curves: (seg.match(/C/g) ?? []).length, n: 1 };
  }).filter((b) => !!b).sort((a, b) => a.x0 - b.x0);
  if (!boxes.length) return null;
  const H2 = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
  if (!(H2 > 0)) return null;
  const groups = [];
  const parts = [];
  for (const b of boxes) {
    const last = groups[groups.length - 1];
    if (last && b.x0 <= last.x1 + H2 * 0.02) {
      last.x1 = Math.max(last.x1, b.x1);
      last.y0 = Math.min(last.y0, b.y0);
      last.y1 = Math.max(last.y1, b.y1);
      last.curves += b.curves;
      last.n++;
      parts[parts.length - 1].push(b);
    } else {
      groups.push({ ...b });
      parts.push([b]);
    }
  }
  const kindOf = (g2, ps) => {
    const w = g2.x1 - g2.x0;
    const h2 = Math.max(g2.y1 - g2.y0, 0.01);
    if (g2.n === 1 && w / h2 >= 2.5 && h2 <= H2 * 0.3) return g2.curves ? "～" : "-";
    if (g2.n === 2 && w / h2 <= 0.6) {
      const [a, b] = [...ps].sort((p2, q2) => p2.y0 - q2.y0);
      if (b.y0 > a.y1) return ":";
    }
    return null;
  };
  const kinds = groups.map((g2, i22) => kindOf(g2, parts[i22]));
  const marks = kinds.filter(Boolean).length;
  if (!marks || groups.length - marks !== text.length) return null;
  let i2 = 0;
  const out = kinds.map((k2) => k2 ?? text[i2++]).join("");
  return out === text ? null : out;
}
const classId = (family, key) => family + "|" + key;
class StaffGlyphBuilder {
  map = /* @__PURE__ */ new Map();
  /** 喂一页的文字对象。非音乐字体、没有轮廓的一律跳过。 */
  addPage(runs, page) {
    for (const r4 of runs) {
      const fam = musicFamily(r4.font);
      if (!fam) continue;
      for (const g2 of r4.glyphs) this.add(fam, r4, g2, page);
    }
  }
  add(family, run, g2, page) {
    if (!g2.outline || !g2.outline.length) return;
    const key = shapeKey(g2.outline);
    const id = classId(family, key);
    let c2 = this.map.get(id);
    if (!c2) {
      c2 = {
        key,
        family,
        smufl: null,
        source: null,
        count: 0,
        codes: [],
        unicodes: [],
        pairs: [],
        w: 0,
        h: 0,
        sig: encodeSig(shapeSig(g2.outline)),
        d: outlineToPath(g2.outline),
        page,
        ws: [],
        hs: []
      };
      this.map.set(id, c2);
    }
    c2.count++;
    if (!c2.codes.includes(g2.code)) c2.codes.push(g2.code);
    const u2 = g2.unicode ? g2.unicode.codePointAt(0) ?? 0 : 0;
    if (u2 && !c2.unicodes.includes(u2)) c2.unicodes.push(u2);
    if (!c2.pairs.some((p2) => p2[0] === g2.code && p2[1] === u2)) c2.pairs.push([g2.code, u2]);
    if (run.sizeDev > 0 && c2.ws.length < 400) {
      c2.ws.push(g2.bbox.w / run.sizeDev);
      c2.hs.push(g2.bbox.h / run.sizeDev);
    }
  }
  finish(book) {
    const classes = [];
    for (const c2 of this.map.values()) {
      const { ws, hs, ...rest } = c2;
      classes.push({ ...rest, w: median$8(ws), h: median$8(hs), codes: c2.codes.sort((a, b) => a - b) });
    }
    classes.sort((a, b) => b.count - a.count);
    return { book, classes };
  }
}
function median$8(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}
function outlineToPath(data, precision = 4) {
  const f2 = (v2) => Number(v2.toFixed(precision)).toString();
  let d2 = "";
  let i2 = 0;
  while (i2 < data.length) {
    const c2 = data[i2++];
    switch (c2) {
      case 0:
        d2 += `M${f2(data[i2])} ${f2(data[i2 + 1])}`;
        i2 += 2;
        break;
      case 1:
        d2 += `L${f2(data[i2])} ${f2(data[i2 + 1])}`;
        i2 += 2;
        break;
      case 2:
        d2 += `C${f2(data[i2])} ${f2(data[i2 + 1])} ${f2(data[i2 + 2])} ${f2(data[i2 + 3])} ${f2(data[i2 + 4])} ${f2(data[i2 + 5])}`;
        i2 += 6;
        break;
      case 3:
        d2 += `Q${f2(data[i2])} ${f2(data[i2 + 1])} ${f2(data[i2 + 2])} ${f2(data[i2 + 3])}`;
        i2 += 4;
        break;
      case 4:
        d2 += "Z";
        break;
      default:
        return d2;
    }
  }
  return d2;
}
function bootstrapByTable(dict) {
  let n2 = 0;
  for (const c2 of dict.classes) {
    if (c2.smufl) continue;
    const votes = /* @__PURE__ */ new Map();
    for (const [code, uni] of c2.pairs) {
      const g2 = guessByCode(c2.family, uni, code);
      if (g2) votes.set(g2, (votes.get(g2) ?? 0) + 1);
    }
    if (!votes.size) continue;
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    c2.smufl = best[0];
    c2.source = "table";
    n2++;
  }
  return n2;
}
function mergeTwins(dict, maxDist = 40) {
  const byFam = /* @__PURE__ */ new Map();
  for (const c2 of dict.classes) {
    const a = byFam.get(c2.family) ?? [];
    a.push(c2);
    byFam.set(c2.family, a);
  }
  let n2 = 0;
  for (const list of byFam.values()) {
    list.sort((a, b) => b.count - a.count);
    const sigs = list.map((c2) => decodeSig(c2.sig));
    for (let i2 = 0; i2 < list.length; i2++) {
      for (let j2 = i2 + 1; j2 < list.length; j2++) {
        const a = list[i2];
        const b = list[j2];
        if (a.smufl && b.smufl) continue;
        if (!a.smufl && !b.smufl) continue;
        if (Math.abs(a.h - b.h) > 0.05 || Math.abs(a.w - b.w) > 0.05) continue;
        if (sigDistance(sigs[i2], sigs[j2]) > maxDist) continue;
        const src = a.smufl ? a : b;
        const dst = a.smufl ? b : a;
        dst.smufl = src.smufl;
        dst.source = "merge";
        n2++;
      }
    }
  }
  return n2;
}
function applyManual(dict, rules) {
  let hit = 0;
  const stale = [];
  for (const r4 of rules) {
    let any = false;
    for (const c2 of dict.classes) {
      if (c2.family !== r4.family) continue;
      if (!c2.unicodes.includes(r4.uni)) continue;
      if (Math.abs(c2.w - r4.w) > 0.02 || Math.abs(c2.h - r4.h) > 0.02) continue;
      c2.smufl = r4.smufl;
      c2.source = "manual";
      any = true;
      hit++;
    }
    if (!any) stale.push(r4);
  }
  return { hit, stale };
}
class StaffGlyphLookup {
  byKey = /* @__PURE__ */ new Map();
  /** 字典里没有的形状：按签名找最近的类（形近兜底）。 */
  sigs = [];
  /** 查不到的类：家族|键 → 见过几次。跑完打印出来就是「还差哪些字形」。 */
  misses = /* @__PURE__ */ new Map();
  constructor(dict) {
    for (const c2 of dict.classes) {
      if (!c2.smufl || !isSmuflName(c2.smufl)) continue;
      this.byKey.set(classId(c2.family, c2.key), c2.smufl);
      this.sigs.push({ sig: decodeSig(c2.sig), w: c2.w, h: c2.h, family: c2.family, smufl: c2.smufl });
    }
  }
  /** @param sizeDev run 的设备字号，用来把宽高归一（形近兜底要比尺寸）。 */
  lookup(font, g2, sizeDev) {
    const fam = musicFamily(font);
    if (!fam) return null;
    if (!g2.outline || !g2.outline.length) {
      return guessByCode(fam, g2.unicode ? g2.unicode.codePointAt(0) ?? 0 : 0, g2.code);
    }
    const key = shapeKey(g2.outline);
    const hit = this.byKey.get(classId(fam, key));
    if (hit) return hit;
    const sig = shapeSig(g2.outline);
    const w = sizeDev > 0 ? g2.bbox.w / sizeDev : 0;
    const h2 = sizeDev > 0 ? g2.bbox.h / sizeDev : 0;
    let best = null;
    let bestD = Infinity;
    for (const s of this.sigs) {
      if (s.family !== fam) continue;
      if (h2 > 0 && (Math.abs(s.h - h2) > 0.05 || Math.abs(s.w - w) > 0.05)) continue;
      const d2 = sigDistance(s.sig, sig);
      if (d2 < bestD) {
        bestD = d2;
        best = s.smufl;
      }
    }
    if (best && bestD <= 40) return best;
    const id = classId(fam, key);
    const m2 = this.misses.get(id);
    if (m2) {
      m2.n++;
      m2.codes.add(g2.code);
    } else {
      this.misses.set(id, { family: fam, codes: /* @__PURE__ */ new Set([g2.code]), n: 1, d: outlineToPath(g2.outline) });
    }
    return guessByCode(fam, g2.unicode ? g2.unicode.codePointAt(0) ?? 0 : 0, g2.code);
  }
}
const boxOf = (r4) => ({ left: r4.x, right: r4.x + r4.w, top: r4.y, bottom: r4.y + r4.h });
const boxW = (b) => b.right - b.left;
const boxH = (b) => b.bottom - b.top;
const boxCx = (b) => (b.left + b.right) / 2;
const boxCy = (b) => (b.top + b.bottom) / 2;
function boxUnion(a, b) {
  return {
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom)
  };
}
function overlapX(a, b) {
  return !(a.left > b.right || b.left > a.right);
}
function overlapY(a, b) {
  return !(a.bottom < b.top || b.bottom < a.top);
}
function xSpace(a, b) {
  return a.left < b.left ? b.left - a.right : a.left - b.right;
}
function ySpace(a, b) {
  return a.top < b.top ? b.top - a.bottom : a.top - b.bottom;
}
function between$1(a, b, c2) {
  return (b - a) * (c2 - a) <= 0;
}
function pointOnLine(x0, y0, x1, y1, x) {
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}
function diffRate(a, b) {
  return Math.abs(a - b) * 100 / (a + b);
}
class PObj {
  id;
  box;
  path;
  run;
  /** 文字对象拆出来的符号（`initSymbols`）。 */
  symbols = [];
  tags = /* @__PURE__ */ new Set();
  constructor(id, path, run) {
    this.id = id;
    this.path = path;
    this.run = run;
    this.box = boxOf((path ?? run).bbox);
  }
  hasAnyTag() {
    return this.tags.size > 0;
  }
  hasTag(t2) {
    return this.tags.has(t2);
  }
  addTag(t2) {
    this.tags.add(t2);
  }
  get tagList() {
    return [...this.tags];
  }
  /** 文字对象的字体家族名（已去子集前缀）；路径对象为 null。 */
  get font() {
    return this.run?.font ?? null;
  }
}
class Seg {
  obj;
  x0;
  y0;
  x1;
  y1;
  /** 线宽（设备尺度）。 */
  lw;
  box;
  tags = /* @__PURE__ */ new Set();
  constructor(obj, x0, y0, x1, y1, lw) {
    this.obj = obj;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.lw = lw;
    const half = lw / 2;
    this.box = {
      left: Math.min(x0, x1) - (this.isV ? half : 0),
      right: Math.max(x0, x1) + (this.isV ? half : 0),
      top: Math.min(y0, y1) - (this.isH ? half : 0),
      bottom: Math.max(y0, y1) + (this.isH ? half : 0)
    };
  }
  get isH() {
    return Math.abs(this.y0 - this.y1) < 0.02;
  }
  get isV() {
    return Math.abs(this.x0 - this.x1) < 0.02;
  }
  /** 沿线方向的长度。 */
  get len() {
    return Math.hypot(this.x1 - this.x0, this.y1 - this.y0);
  }
  /** 左端 x（水平段）／中心 x（垂直段）。 */
  get left() {
    return Math.min(this.x0, this.x1);
  }
  get right() {
    return Math.max(this.x0, this.x1);
  }
  get top() {
    return Math.min(this.y0, this.y1);
  }
  get bottom() {
    return Math.max(this.y0, this.y1);
  }
  get cy() {
    return (this.y0 + this.y1) / 2;
  }
  get cx() {
    return (this.x0 + this.x1) / 2;
  }
  hasAnyTag() {
    return this.tags.size > 0;
  }
  hasTag(t2) {
    return this.tags.has(t2);
  }
  addTag(t2) {
    this.tags.add(t2);
  }
  /** 摘掉一个标记（位图路回原图验墨后撤回误判的小节线）。 */
  removeTag(t2) {
    this.tags.delete(t2);
  }
}
class Sym {
  parent;
  index;
  glyph;
  /** 墨迹盒。复合音符字形要收窄到符头那一块（`useHeadBox`），所以不是 readonly。 */
  box;
  /** SMuFL 语义名。 */
  code;
  /**
   * **复合音符字形**自带的时值（全音符为 1）；普通符头为 `undefined`。
   *
   * Anastasia（Sibelius 手写体）偶尔把「符头 + 符干 + 符尾」画成**一个**字形
   * （码位映到 SMuFL 的 `metNote8thUp`/`metNoteQuarterUp`，本是速度记号 `♩= 72` 用的）。
   * 那种音符没有单独的符干可数，时值只能由字形本身给出。见 `page.ts::adoptCompositeNotes`。
   */
  compositeBase;
  /** 复合音符字形的符干朝向（`true` = 朝上、符头在下）。见 `page.ts::adoptCompositeNotes`。 */
  compositeStemUp;
  /** 基线原点的 x（musicpp 的 `Symbol::pos.x`）。 */
  px;
  /**
   * **判音高用的纵坐标 = 墨迹中心**，不是基线。
   *
   * musicpp 用的是基线（`Symbol::pos.y`），那是因为它只认 Maestro 一系
   * ——那一系符头的基线正落在符头中心高度上。本书还有 Anastasia（Sibelius 手写体），
   * 它的字形原点约定不同：实测 p154 的 gClef 基线落在**第一线**（-4 级）而不是 G 线（-2 级），
   * 符头也整体偏一个 em，照基线算音高会整首低八度。
   * 墨迹中心不依赖任何字体的原点约定——符头是个椭圆，中心就是它骑的那条线/间。
   */
  py;
  /** 基线原点的 y（musicpp 的 `Symbol::pos.y`）。留着排查用。 */
  baseY;
  ownerStaff = null;
  tags = /* @__PURE__ */ new Set();
  constructor(parent, index, glyph, code) {
    this.parent = parent;
    this.index = index;
    this.glyph = glyph;
    this.code = code;
    this.box = boxOf(glyph.bbox);
    this.px = glyph.ox;
    this.baseY = glyph.oy;
    this.py = (this.box.top + this.box.bottom) / 2;
  }
  /**
   * 把墨迹盒收窄到**符头**那一块（复合音符字形专用）。
   * 音高判的是墨迹中心，整枚字形（含符干符尾）的中心比符头高一个多线距——
   * 不收窄的话音会读高两三级。
   */
  useHeadBox(b) {
    this.box = b;
    this.py = (b.top + b.bottom) / 2;
  }
  hasTag(t2) {
    return this.tags.has(t2);
  }
  addTag(t2) {
    this.tags.add(t2);
  }
  hasAnyTag() {
    return this.tags.size > 0;
  }
}
class Staff {
  /** 组成它的谱线段。**Anastasia 那种「谱线是字形」的页面这里是空的**——
   *  那边一条长横路径都没有，谱行由平铺的 `staff5Lines` 字形拼出来（见 `page.ts::findStaves`）。
   *  真正定音高的是 `lineYs`，不是这个数组。 */
  lines = [];
  /** 五条线的 y（从上到下）。打击谱只有一条。 */
  lineYs = [];
  box = { left: 0, right: 0, top: 0, bottom: 0 };
  index = -1;
  page = null;
  bars = [];
  /**
   * **随 x 变化的五线位置**（位图路给，见 `rasteromr/staffline.ts::localLineModel`）。
   * 有它时 `middleStep(y, x)` 按该处实测的五线、相邻两线间的相对位置算，没有（矢量路）就用整行的 `lineYs`。
   */
  lineYsAt;
  /** `Staff::init`：包围盒纵向取首尾两条线，横向取所有线的并集。 */
  init(left, right2) {
    if (!this.lineYs.length && this.lines.length) this.lineYs = this.lines.map((l22) => l22.cy);
    let l2 = left ?? Infinity;
    let r4 = right2 ?? -Infinity;
    for (const o of this.lines) {
      l2 = Math.min(l2, o.left);
      r4 = Math.max(r4, o.right);
    }
    this.box = {
      left: l2,
      right: r4,
      top: Math.min(...this.lineYs),
      bottom: Math.max(...this.lineYs)
    };
  }
  get cy() {
    return boxCy(this.box);
  }
  /** `Staff::stepDistance`：**半个线距**（相邻两个音级的纵向间隔）。 */
  stepDistance() {
    if (this.lineYs.length <= 1) return 0;
    return boxH(this.box) / (this.lineYs.length - 1) / 2;
  }
  /** `Staff::middleStep`：某个 y 相对中线（第三线）的音级数。
   *  **y 向下**，所以往上（y 小）是正数——与 musicpp 的符号相反那一半在这里已经调好：
   *  中线上方 +、下方 −，与「音越高数越大」一致。 */
  middleStep(y, x) {
    if (x !== void 0 && this.lineYsAt && this.lineYs.length === 5) {
      const ys = this.lineYsAt(x);
      let pos;
      if (y <= ys[0]) pos = (y - ys[0]) / (ys[1] - ys[0]) * 2;
      else if (y >= ys[4]) pos = 8 + (y - ys[4]) / (ys[4] - ys[3]) * 2;
      else {
        let k2 = 0;
        while (k2 < 3 && y > ys[k2 + 1]) k2++;
        pos = k2 * 2 + (y - ys[k2]) / (ys[k2 + 1] - ys[k2]) * 2;
      }
      if (isFinite(pos)) return Math.round(4 - pos);
    }
    const d2 = this.stepDistance();
    if (!d2) return 0;
    return Math.round((this.cy - y) / d2);
  }
  contains(x, y) {
    return x >= this.box.left && x <= this.box.right && y >= this.box.top && y <= this.box.bottom;
  }
}
class Stem {
  seg;
  notes = [];
  beams = [];
  constructor(seg) {
    this.seg = seg;
  }
  get box() {
    return this.seg.box;
  }
}
class Beam {
  obj;
  stems = [];
  level = 0;
  constructor(obj) {
    this.obj = obj;
  }
  get box() {
    return this.obj.box;
  }
}
class SlurTie {
  obj;
  /** 弧朝上（开口向下）。 */
  isAbove = false;
  isTie = false;
  constructor(obj) {
    this.obj = obj;
  }
  get box() {
    return this.obj.box;
  }
}
class Bar {
  staff;
  /** 本小节里的符头/休止（含 tag Note 的 Sym）。 */
  notes = [];
  left = 0;
  right = 0;
  /** 右端小节线的样式与反复（见 `barlines.ts`）。 */
  rightStyle = null;
  rightRepeat = false;
  /** 左端是不是正向反复（`|:`）。 */
  leftRepeat = false;
  /** 左端的 `<bar-style>`（`heavy-light` = `|:` 那一笔）。**只有行首那条被并掉时才有**：
   *  谱行左端到第一根小节线之间不是小节（只有谱号/调号/拍号），那一条删掉之后，
   *  它右端的样式要落到下一小节的左端来，不然整首少一根结构性小节线。 */
  leftStyle = null;
  /** 反复房号（`1.`/`2.`）：号码，以及这一小节是不是这一房的起头/结尾。 */
  endingNumber = null;
  endingStart = false;
  endingStop = false;
  constructor(staff) {
    this.staff = staff;
  }
}
class SSystem {
  staves = [];
  box = { left: 0, right: 0, top: 0, bottom: 0 };
  index = -1;
  init() {
    this.box = this.staves.map((s) => s.box).reduce(boxUnion);
  }
  /** 主旋律所在的那行：**最上面那行**（SATB 的女高、钢琴谱的人声都在顶上）。 */
  get top() {
    return this.staves[0];
  }
}
class ScoreStaff {
  index = -1;
  /** 每个系统里对应的那行谱；系统里没有这行（隐藏声部）时为 null。 */
  staves = [];
}
class Part {
  index = -1;
  scoreStaves = [];
}
class SPage {
  index;
  width;
  height;
  objs = [];
  /** 全页从路径里抽出来的直线段（谱线/符干/小节线/加线都在里面）。 */
  segs = [];
  symbols = [];
  staves = [];
  systems = [];
  /** 全页谱表线距的中位数×2（`normalStaffSpace`）与最大值×2（`largestSP`）。 */
  normalStaffSpace = 0;
  largestSP = 0;
  /**
   * **页面的长度基准：小节线高度 H**（= 谱表高度 = 四个线距）。
   *
   * 与简谱那条路同一个口径（`layout/jpglyph.ts`：「一切长度都是小节线高度 H 的比例」）。
   * 几何门槛一律写成 `H` 的比例，**不写绝对点值**——同一本书里谱表大小差一倍
   * （正谱一格 5.4pt、小谱一格 2.7pt），写死的点值在小谱上就是半格。
   *
   * 怎么量：取**音乐字体的字号中位数**。Maestro/Opus/Anastasia 与 SMuFL 同源，
   * 都约定 em = 谱表高度 = 小节线高度，所以字号直接就是 H，不必等谱线找出来
   * ——而「多短的段算段」「重描合并的容差」这些门槛在找谱线**之前**就要用。
   * 谱线找到之后 `normalStaffSpace`（实测的一个线距）是更准的那个，优先用它。
   */
  barlineHeight = 0;
  /** 一个线距 = H/4。 */
  get space() {
    return this.barlineHeight / 4;
  }
  constructor(index, width, height) {
    this.index = index;
    this.width = width;
    this.height = height;
  }
  objsWithTag(t2) {
    return this.objs.filter((o) => o.hasTag(t2));
  }
  segsWithTag(t2) {
    return this.segs.filter((s) => s.hasTag(t2));
  }
}
function sortByTop(a) {
  return a.sort((p2, q2) => p2.box.top - q2.box.top);
}
function sortByLeft(a) {
  return a.sort((p2, q2) => p2.box.left - q2.box.left);
}
const EPS = 0.02;
function pathPoints(o) {
  const m2 = o.ctm;
  const d2 = o.data;
  const out = [];
  let i2 = 0;
  while (i2 < d2.length) {
    const c2 = d2[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    if (c2 === DRAW_CLOSE) continue;
    const curve = c2 === DRAW_CUBIC || c2 === DRAW_QUAD;
    for (let k2 = 0; k2 < n2; k2 += 2) {
      out.push({ x: matApplyX(m2, d2[i2 + k2], d2[i2 + k2 + 1]), y: matApplyY(m2, d2[i2 + k2], d2[i2 + k2 + 1]), curve });
    }
    i2 += n2;
  }
  return out;
}
function subPaths(o) {
  const m2 = o.ctm;
  const d2 = o.data;
  const out = [];
  let cur = null;
  let i2 = 0;
  while (i2 < d2.length) {
    const c2 = d2[i2++];
    const n2 = drawOpArity(c2);
    if (n2 < 0) break;
    if (c2 === DRAW_CLOSE) {
      if (cur) cur.closed = true;
      i2 += n2;
      continue;
    }
    if (c2 === DRAW_MOVE) {
      cur = { pts: [], closed: false };
      out.push(cur);
    }
    if (!cur) {
      cur = { pts: [], closed: false };
      out.push(cur);
    }
    const curve = c2 === DRAW_CUBIC || c2 === DRAW_QUAD;
    for (let k2 = 0; k2 < n2; k2 += 2) {
      cur.pts.push({ x: matApplyX(m2, d2[i2 + k2], d2[i2 + k2 + 1]), y: matApplyY(m2, d2[i2 + k2], d2[i2 + k2 + 1]), curve });
    }
    i2 += n2;
  }
  return out.filter((s) => s.pts.length > 0);
}
function pathPoint(o, idx) {
  const p2 = pathPoints(o);
  return p2[idx] ?? null;
}
function hasCurve(o) {
  return o.curves > 0;
}
function isLine(o) {
  if (o.curves) return false;
  return pathPoints(o).length === 2;
}
function isHLine(o) {
  if (!isLine(o)) return false;
  const p2 = pathPoints(o);
  return Math.abs(p2[0].y - p2[1].y) < EPS;
}
function isVLine(o) {
  if (!isLine(o)) return false;
  const p2 = pathPoints(o);
  return Math.abs(p2[0].x - p2[1].x) < EPS;
}
function thinRectAxis(sp) {
  const p2 = sp.pts;
  const n2 = p2.length === 5 && Math.abs(p2[0].x - p2[4].x) < EPS && Math.abs(p2[0].y - p2[4].y) < EPS ? 4 : p2.length;
  if (n2 !== 4) return null;
  for (let i2 = 0; i2 < 4; i2++) {
    const a = p2[i2];
    const b = p2[(i2 + 1) % 4];
    if (Math.abs(a.x - b.x) >= EPS && Math.abs(a.y - b.y) >= EPS) return null;
  }
  const xs = p2.slice(0, 4).map((q2) => q2.x);
  const ys = p2.slice(0, 4).map((q2) => q2.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = x1 - x0;
  const h2 = y1 - y0;
  if (w < h2 * 0.3) return { x0: (x0 + x1) / 2, y0, x1: (x0 + x1) / 2, y1, w };
  if (h2 < w * 0.3) return { x0, y0: (y0 + y1) / 2, x1, y1: (y0 + y1) / 2, w: h2 };
  return null;
}
function isRect(o) {
  if (o.curves) return false;
  const p2 = pathPoints(o);
  const n2 = p2.length === 5 && Math.abs(p2[0].x - p2[4].x) < EPS && Math.abs(p2[0].y - p2[4].y) < EPS ? 4 : p2.length;
  if (n2 !== 4) return false;
  for (let i2 = 0; i2 < 4; i2++) {
    const a = p2[i2];
    const b = p2[(i2 + 1) % 4];
    if (Math.abs(a.x - b.x) >= EPS && Math.abs(a.y - b.y) >= EPS) return false;
  }
  return true;
}
function isPolyline(o) {
  if (o.curves) return false;
  return pathPoints(o).length > 2;
}
function allAxisAligned(o) {
  if (!isPolyline(o)) return false;
  const p2 = pathPoints(o);
  for (let i2 = 1; i2 < p2.length; i2++) {
    if (Math.abs(p2[i2 - 1].y - p2[i2].y) < EPS) continue;
    if (Math.abs(p2[i2 - 1].x - p2[i2].x) < EPS) continue;
    return false;
  }
  return true;
}
function strokeWidth(o) {
  return Math.max(o.lineWidth, 1);
}
function isStroke(o) {
  return o.paint.toLowerCase().includes("stroke");
}
function isFill(o) {
  return o.paint.toLowerCase().includes("fill");
}
function isDashed(o) {
  return !!o.dash && o.dash.length > 1;
}
function isWhite(o) {
  const c2 = (isFill(o) ? o.fill : o.stroke) ?? "";
  return c2 === "#ffffff" || c2 === "#fff";
}
function classifyBarlines(pg, stf) {
  const sp = pg.normalStaffSpace || pg.space;
  const xs = [];
  for (const s of pg.segsWithTag("BarLine")) {
    if (s.box.top > stf.box.bottom || s.box.bottom < stf.box.top) continue;
    xs.push({ x: s.cx, lw: s.lw });
  }
  for (const s of pg.symbols) {
    if (!s.hasTag("BarLine")) continue;
    if (s.box.top > stf.box.bottom || s.box.bottom < stf.box.top) continue;
    xs.push({ x: (s.box.left + s.box.right) / 2, lw: s.code === "barlineSingle" ? 0 : sp });
  }
  xs.sort((a, b) => a.x - b.x);
  const groups = [];
  for (const it of xs) {
    const g2 = groups[groups.length - 1];
    if (g2 && it.x - g2.xs[g2.xs.length - 1] < sp * 2) {
      if (it.x - g2.xs[g2.xs.length - 1] > 0.3) g2.xs.push(it.x);
      g2.lw = Math.max(g2.lw, it.lw);
    } else {
      groups.push({ xs: [it.x], lw: it.lw });
    }
  }
  const dots = pg.symbols.filter(
    (s) => (s.code === "augmentationDot" || s.code === "repeatDots") && !s.hasTag("Augmentation") && s.py > stf.box.top && s.py < stf.box.bottom
  );
  const lws = pg.segsWithTag("BarLine").map((s) => s.lw).sort((p2, q2) => p2 - q2);
  const heavy = Math.max(sp / 3, (lws[lws.length - 1 >> 1] ?? 0) * 1.8);
  const out = [];
  for (const g2 of groups) {
    const left = g2.xs[0];
    const x = g2.xs[g2.xs.length - 1];
    const style = g2.lw > heavy ? "light-heavy" : g2.xs.length > 1 ? "light-light" : null;
    let before = false;
    let after = false;
    const reach = g2.lw > sp / 3 || g2.xs.length > 1 ? sp * 2 : sp * 1;
    for (const d2 of dots) {
      const dx = d2.px - (left + x) / 2;
      if (Math.abs(dx) > reach) continue;
      const mid = (stf.box.top + stf.box.bottom) / 2;
      const pair = d2.code === "repeatDots" || dots.some((o) => o !== d2 && Math.abs(o.px - d2.px) < sp * 0.4 && Math.abs(o.py - d2.py) > sp * 0.5 && Math.abs(o.py - d2.py) < sp * 1.5 && Math.abs((o.py + d2.py) / 2 - mid) < sp * 0.3);
      if (!pair) continue;
      if (dx < 0) before = true;
      else after = true;
    }
    const repeat = before && after ? "both" : before ? "backward" : after ? "forward" : null;
    out.push({ x, left, style: repeat && !style ? "light-heavy" : style, repeat });
  }
  return out;
}
function tagRepeatDots(pg, stf, marks) {
  const sp = pg.normalStaffSpace || pg.space;
  const xs = marks.filter((m2) => m2.repeat).map((m2) => (m2.left + m2.x) / 2);
  if (!xs.length) return;
  for (const s of pg.symbols) {
    if (s.code !== "augmentationDot" && s.code !== "repeatDots") continue;
    if (s.hasAnyTag()) continue;
    if (s.py < stf.box.top || s.py > stf.box.bottom) continue;
    if (!xs.some((x) => Math.abs(s.px - x) < sp * 2)) continue;
    s.addTag("BarLine");
  }
}
const MIN_SEG_RATIO = 0.04;
const MERGE_TOL_RATIO = 0.0175;
const MIN_LINE_GAP_RATIO = 0.1;
const MAX_LINE_GAP_RATIO = 0.4;
const STAFF_ASPECT_MIN = 4;
const STAFF_LINE_LEN_RATIO = 0.35;
const STAFF_LINE_TOL = 0.2;
const STAFF_EVEN_TOL = 0.2;
function estimateBarlineHeight(runs, width) {
  const sizes = [];
  for (const r4 of runs) {
    if (!musicFamily(r4.font) || r4.sizeDev <= 0) continue;
    for (let i2 = 0; i2 < r4.glyphs.length; i2++) sizes.push(r4.sizeDev);
  }
  if (!sizes.length) return width / 25;
  sizes.sort((a, b) => a - b);
  return sizes[sizes.length >> 1];
}
function segsOf(o, minLen) {
  const p2 = o.path;
  if (!p2) return [];
  const out = [];
  const lw = Math.max(p2.lineWidth, 0.3);
  for (const sp of subPaths(p2)) {
    if (sp.pts.some((q2) => q2.curve)) continue;
    if (sp.pts.length === 2) {
      const [a, b] = sp.pts;
      const s = new Seg(o, a.x, a.y, b.x, b.y, lw);
      if (s.len >= minLen && (s.isH || s.isV)) out.push(s);
      continue;
    }
    const r4 = thinRectAxis(sp);
    if (r4) {
      const s = new Seg(o, r4.x0, r4.y0, r4.x1, r4.y1, r4.w);
      if (s.len >= minLen) out.push(s);
      continue;
    }
    if (sp.pts.length > 2) {
      for (let i2 = 1; i2 < sp.pts.length; i2++) {
        const a = sp.pts[i2 - 1];
        const b = sp.pts[i2];
        const s = new Seg(o, a.x, a.y, b.x, b.y, lw);
        if (s.len >= minLen && (s.isH || s.isV)) out.push(s);
      }
    }
  }
  return out;
}
function mergeRedrawn(all, tol) {
  const out = [];
  const byObj = /* @__PURE__ */ new Map();
  for (const s of all) {
    const a = byObj.get(s.obj) ?? [];
    a.push(s);
    byObj.set(s.obj, a);
  }
  for (const segs of byObj.values()) mergeOne(segs, tol, out);
  return out;
}
function mergeOne(segs, tol, out) {
  for (const dir of [true, false]) {
    const list = segs.filter((s) => (dir ? s.isH : s.isV) && !(s.isH && s.isV));
    const key = (s) => dir ? s.cy : s.cx;
    const lo = (s) => dir ? s.left : s.top;
    const hi = (s) => dir ? s.right : s.bottom;
    list.sort((a, b) => key(a) - key(b) || lo(a) - lo(b));
    let i2 = 0;
    while (i2 < list.length) {
      let j2 = i2 + 1;
      while (j2 < list.length && key(list[j2]) - key(list[j2 - 1]) < tol) j2++;
      const band = list.slice(i2, j2);
      i2 = j2;
      band.sort((a, b) => lo(a) - lo(b));
      let cluster = [];
      const flush = () => {
        if (!cluster.length) return;
        const a = cluster[0];
        const k0 = Math.min(...cluster.map(key));
        const k1 = Math.max(...cluster.map(key));
        const span = Math.max(k1 - k0, ...cluster.map((s) => s.lw));
        const c2 = (k0 + k1) / 2;
        const p0 = Math.min(...cluster.map(lo));
        const p1 = Math.max(...cluster.map(hi));
        out.push(dir ? new Seg(a.obj, p0, c2, p1, c2, span) : new Seg(a.obj, c2, p0, c2, p1, span));
        cluster = [];
      };
      for (const s of band) {
        if (!cluster.length) {
          cluster.push(s);
          continue;
        }
        const end = Math.max(...cluster.map(hi));
        if (lo(s) < end) cluster.push(s);
        else {
          flush();
          cluster.push(s);
        }
      }
      flush();
    }
  }
  out.push(...segs.filter((s) => !s.isH && !s.isV));
}
function buildPage(index, width, height, paths, runs) {
  const pg = new SPage(index, width, height);
  let id = 0;
  pg.barlineHeight = estimateBarlineHeight(runs, width);
  const raw = [];
  for (const p2 of paths) {
    const o = new PObj(id++, p2, null);
    pg.objs.push(o);
    raw.push(...segsOf(o, pg.barlineHeight * MIN_SEG_RATIO));
  }
  pg.segs = mergeRedrawn(raw, pg.barlineHeight * MERGE_TOL_RATIO);
  for (const r4 of runs) pg.objs.push(new PObj(id++, null, r4));
  return pg;
}
function findSymbols(pg, look) {
  for (const o of pg.objs) {
    if (o.hasAnyTag()) continue;
    const run = o.run;
    if (!run) continue;
    if (!musicFamily(run.font)) continue;
    let i2 = 0;
    for (const g2 of run.glyphs) {
      const code = look.lookup(run.font, g2, run.sizeDev);
      if (!code) continue;
      const s = new Sym(o, i2++, g2, code);
      o.symbols.push(s);
      pg.symbols.push(s);
    }
    if (o.symbols.length) o.addTag("Symbol");
  }
}
function findStaves(pg) {
  const hlines = pg.segs.filter((s) => s.isH);
  const done = /* @__PURE__ */ new Set();
  const perc = [];
  for (const s of pg.symbols) {
    if (s.code !== "unpitchedPercussionClef2") continue;
    for (const hl of hlines) {
      if (done.has(hl)) continue;
      if (!overlapX(hl.box, s.box) || !overlapY(hl.box, s.box)) continue;
      const stf = new Staff();
      stf.lines.push(hl);
      hl.addTag("Staff");
      stf.init();
      perc.push(stf);
      done.add(hl);
    }
  }
  const maxLen = Math.max(0, ...hlines.map((l2) => l2.len));
  const cands = hlines.filter((l2) => !done.has(l2) && l2.len >= maxLen * STAFF_LINE_LEN_RATIO);
  cands.sort((a, b) => a.cy - b.cy);
  const used = /* @__PURE__ */ new Set();
  for (let i2 = 0; i2 < cands.length; i2++) {
    if (used.has(cands[i2])) continue;
    let picked = null;
    for (let k2 = i2 + 1; k2 < Math.min(cands.length, i2 + 4) && !picked; k2++) {
      if (used.has(cands[k2])) continue;
      const d2 = cands[k2].cy - cands[i2].cy;
      if (d2 < pg.barlineHeight * MIN_LINE_GAP_RATIO) continue;
      if (d2 > pg.barlineHeight * MAX_LINE_GAP_RATIO) break;
      const five = [cands[i2], cands[k2]];
      let ok = true;
      let dd0 = d2;
      for (let n2 = 2; n2 <= 4; n2++) {
        const want = cands[i2].cy + dd0 * n2;
        let best = null;
        let bestD = dd0 * STAFF_LINE_TOL;
        for (const c2 of cands) {
          if (used.has(c2) || five.includes(c2)) continue;
          const dd = Math.abs(c2.cy - want);
          if (dd < bestD) {
            bestD = dd;
            best = c2;
          }
        }
        if (!best) {
          ok = false;
          break;
        }
        five.push(best);
        dd0 = (best.cy - cands[i2].cy) / n2;
      }
      if (!ok) continue;
      const left = Math.max(...five.map((l2) => l2.left));
      const right2 = Math.min(...five.map((l2) => l2.right));
      const shortest = Math.min(...five.map((l2) => l2.len));
      if (right2 - left < shortest * 0.8) continue;
      if (right2 - left < d2 * 4 * STAFF_ASPECT_MIN) continue;
      picked = five.sort((a, b) => a.cy - b.cy);
    }
    if (!picked && i2 + 4 < cands.length) {
      const five = cands.slice(i2, i2 + 5);
      if (!five.some((c2) => used.has(c2))) {
        const ds = [1, 2, 3, 4].map((k2) => five[k2].cy - five[k2 - 1].cy);
        const avg = ds.reduce((a, b) => a + b, 0) / 4;
        const left = Math.max(...five.map((l2) => l2.left));
        const right2 = Math.min(...five.map((l2) => l2.right));
        const shortest = Math.min(...five.map((l2) => l2.len));
        if (avg >= pg.barlineHeight * MIN_LINE_GAP_RATIO && avg <= pg.barlineHeight * MAX_LINE_GAP_RATIO && ds.every((d2) => Math.abs(d2 - avg) <= avg * STAFF_EVEN_TOL) && right2 - left >= shortest * 0.8 && right2 - left >= avg * 4 * STAFF_ASPECT_MIN)
          picked = five;
      }
    }
    if (!picked) continue;
    const stf = new Staff();
    for (const l2 of picked) {
      l2.addTag("Staff");
      used.add(l2);
      stf.lines.push(l2);
    }
    stf.init();
    pg.staves.push(stf);
  }
  pg.staves.push(...glyphStaves(pg));
  pg.staves.push(...perc);
  sortByTop(pg.staves);
  const dists = [];
  pg.staves.forEach((stf, i2) => {
    stf.index = i2;
    stf.page = pg;
    if (stf.lineYs.length <= 1) return;
    dists.push(stf.stepDistance());
  });
  dists.sort((a, b) => a - b);
  if (dists.length) {
    pg.normalStaffSpace = dists[Math.floor(dists.length / 2)] * 2;
    pg.largestSP = dists[dists.length - 1] * 2;
  }
  return pg.staves.length > 0;
}
function glyphStaves(pg) {
  const tiles = pg.symbols.filter((s) => s.code === "staff5Lines");
  if (!tiles.length) return [];
  const rows = [];
  for (const t2 of tiles.slice().sort((a, b) => a.box.left - b.box.left)) {
    const tol = boxH(t2.box) * 0.2;
    const row = rows.find((r4) => Math.abs(r4[0].box.top - t2.box.top) < tol);
    if (row) row.push(t2);
    else rows.push([t2]);
  }
  const out = [];
  for (const row of rows) {
    row.sort((a, b) => a.box.left - b.box.left);
    const left = row[0].box.left;
    const right2 = row[row.length - 1].box.right;
    const top = Math.min(...row.map((t2) => t2.box.top));
    const bottom2 = Math.max(...row.map((t2) => t2.box.bottom));
    const stf = new Staff();
    for (let i2 = 0; i2 < 5; i2++) stf.lineYs.push(top + (bottom2 - top) * i2 / 4);
    stf.init(left, right2);
    for (const t2 of row) t2.addTag("Staff");
    out.push(stf);
  }
  return out;
}
function findNoteheads(pg) {
  if (!pg.staves.length) return false;
  const space = pg.normalStaffSpace || pg.space;
  const hlines = [
    ...pg.segs.filter((s) => s.isH && !s.hasAnyTag() && s.len >= space * 0.8 && s.len <= space * 6),
    ...glyphLegers(pg)
  ];
  adoptCompositeNotes(pg);
  for (const s of pg.symbols) {
    if (!isNoteHead(s.code)) continue;
    findStaffForNote(pg, s, hlines);
  }
  return true;
}
function compositeStemUp(g2) {
  if (!g2.outline || !g2.outline.length) return true;
  const sig = shapeSig(g2.outline);
  const n2 = Math.round(Math.sqrt(sig.length));
  let bestRow = 0;
  let best = -1;
  for (let r4 = 0; r4 < n2; r4++) {
    let c2 = 0;
    for (let x = 0; x < n2; x++) if (sig[r4 * n2 + x]) c2++;
    if (c2 > best) {
      best = c2;
      bestRow = r4;
    }
  }
  return bestRow < n2 / 2;
}
const COMPOSITE_NOTES = {
  metNoteWhole: 1,
  metNoteHalfUp: 1 / 2,
  metNoteQuarterUp: 1 / 4,
  metNote8thUp: 1 / 8,
  metNote16thUp: 1 / 16
};
function adoptCompositeNotes(pg) {
  for (const s of pg.symbols) {
    const base = COMPOSITE_NOTES[s.code];
    if (base === void 0 || s.hasAnyTag()) continue;
    const stf = pg.staves.find((q2) => {
      const sp = q2.stepDistance() || (pg.normalStaffSpace || pg.space) / 2;
      return s.py > q2.box.top - sp && s.py < q2.box.bottom + sp;
    });
    if (!stf) continue;
    const space = (stf.stepDistance() || 0) * 2 || pg.normalStaffSpace || pg.space;
    const up = compositeStemUp(s.glyph);
    s.compositeBase = base;
    s.compositeStemUp = up;
    s.useHeadBox(
      up ? { left: s.box.left, right: Math.min(s.box.right, s.box.left + space * 1.15), top: s.box.bottom - space, bottom: s.box.bottom } : { left: Math.max(s.box.left, s.box.right - space * 1.15), right: s.box.right, top: s.box.top, bottom: s.box.top + space }
    );
    s.code = "noteheadBlack";
  }
}
function findStaffForNote(pg, nt, lines) {
  const y = nt.py;
  let stfA = null;
  let stfB = null;
  let distA = Infinity;
  let distB = Infinity;
  for (const st of pg.staves) {
    const dist = y - st.cy;
    const dd = Math.abs(dist);
    let sp = st.stepDistance();
    let valid = false;
    if (sp === 0) {
      if (dd < pg.normalStaffSpace && nt.code === "restHBar") valid = true;
      sp = pg.normalStaffSpace / 2;
    }
    if (y > st.box.top - sp && y < st.box.bottom + sp) valid = true;
    if (valid) {
      nt.ownerStaff = st;
      nt.addTag("Note");
      return true;
    }
    if (dist > 0) {
      if (dd < distA) {
        stfA = st;
        distA = dd;
      }
    } else if (dd < distB) {
      stfB = st;
      distB = dd;
    }
  }
  if (isRest(nt.code)) {
    nt.ownerStaff = distA < distB ? stfA : stfB;
    if (nt.ownerStaff) {
      nt.addTag("Note");
      return true;
    }
    return false;
  }
  if (stfB && distB * 2 < distA && findLegers(nt, stfB, lines)) return true;
  if (stfA && findLegers(nt, stfA, lines)) return true;
  if (stfB && findLegers(nt, stfB, lines)) return true;
  return false;
}
function findLegers(nt, stf, lines) {
  const y2 = stf.cy;
  const stepDist = stf.stepDistance();
  const y1 = nt.py > y2 ? nt.py + stepDist : nt.py - stepDist;
  const poss = [];
  for (const l2 of lines) {
    if (nt.px < l2.left || nt.px > l2.right) continue;
    if (l2.len > (nt.box.right - nt.box.left) * 3) continue;
    if (between$1(l2.cy, y1, y2)) poss.push(l2);
  }
  const need = Math.floor(Math.abs(stf.middleStep(nt.py)) / 2) - 2;
  if (need >= 3) {
    const sp = stepDist * 2;
    const down = nt.py > y2;
    let at = down ? stf.box.bottom : stf.box.top;
    let chain = 0;
    for (const l2 of poss.slice().sort((a, b) => down ? a.cy - b.cy : b.cy - a.cy)) {
      const gap = down ? l2.cy - at : at - l2.cy;
      if (gap < sp * 0.5) continue;
      if (gap > sp * 1.4) break;
      chain++;
      at = l2.cy;
    }
    if (chain < need) return false;
  }
  if (poss.length >= need) {
    nt.ownerStaff = stf;
    for (const it of poss) it.addTag("Leger");
    nt.addTag("Note");
    return true;
  }
  return false;
}
function isLeadNoteBarline(l2, nt, stf) {
  const sp = stf.stepDistance() * 2;
  if (!sp) return false;
  const cy2 = (nt.box.top + nt.box.bottom) / 2;
  if (Math.abs(cy2 - l2.bottom) > sp || Math.abs(cy2 - l2.top) <= sp) return false;
  if (Math.abs(nt.box.left - l2.cx) >= Math.abs(nt.box.right - l2.cx)) return false;
  return Math.abs(l2.top - stf.box.top) <= sp * 0.25 && Math.abs(l2.bottom - stf.box.bottom) <= sp * 0.25;
}
const STEM_WIN_MIN = 0.3;
const STEM_WIN_NARROW = 1.15;
function findStems(pg) {
  pg.segs.push(...glyphStems(pg));
  const vlines = pg.segs.filter((s) => s.isV && !s.hasAnyTag());
  for (const nt of pg.symbols) {
    if (!nt.ownerStaff) continue;
    if (nt.code !== "noteheadBlack" && nt.code !== "noteheadHalf") continue;
    const stf = nt.ownerStaff;
    const space = stf.stepDistance() * 2 || pg.space;
    const narrow = nt.box.right - nt.box.left < space * STEM_WIN_NARROW;
    const lw = Math.max((stf.lines[0]?.lw ?? pg.barlineHeight * 0.02) * 2, narrow ? space * STEM_WIN_MIN : 0);
    const cand = [];
    for (const l2 of vlines) {
      const dl = Math.abs(nt.box.left - l2.cx), dr = Math.abs(nt.box.right - l2.cx);
      if (dl >= lw && dr >= lw) continue;
      if (!overlapY(l2.box, nt.box)) continue;
      const cy2 = (nt.box.top + nt.box.bottom) / 2;
      const side = dl <= dr ? 0 : 1;
      if (Math.abs(cy2 - l2.top) > space && Math.abs(cy2 - l2.bottom) > space) continue;
      if (side === 0 && isLeadNoteBarline(l2, nt, stf)) continue;
      cand.push({ l: l2, side, d: Math.min(dl, dr) });
    }
    const edge = (l2) => Math.abs(l2.top - stf.box.top) + Math.abs(l2.bottom - stf.box.bottom);
    for (const side of [0, 1]) {
      const cs = cand.filter((c2) => c2.side === side);
      const dMin = Math.min(...cs.map((c2) => c2.d));
      const near = cs.filter((c2) => c2.d <= dMin + lw * 0.5).sort((p2, q2) => edge(q2.l) - edge(p2.l));
      const kept = [];
      for (const c2 of near) {
        const barShaped = Math.abs(c2.l.top - stf.box.top) <= space * 0.25 && Math.abs(c2.l.bottom - stf.box.bottom) <= space * 0.25;
        if (barShaped && kept.some((k2) => Math.min(k2.bottom, c2.l.bottom) - Math.max(k2.top, c2.l.top) > Math.min(k2.len, c2.l.len) * 0.5)) continue;
        kept.push(c2.l);
        c2.l.addTag("Stem");
      }
    }
  }
}
function glyphLegers(pg) {
  return pg.symbols.filter((s) => s.code === "legerLine").map((s) => {
    const y = (s.box.top + s.box.bottom) / 2;
    return new Seg(s.parent, s.box.left, y, s.box.right, y, Math.max(s.box.bottom - s.box.top, 0.3));
  });
}
function glyphStems(pg) {
  const tiles = pg.symbols.filter((s) => s.code === "stem");
  if (!tiles.length) return [];
  for (const t2 of tiles) t2.addTag("Stem");
  const xTol = pg.barlineHeight * 0.02;
  const cols = /* @__PURE__ */ new Map();
  for (const t2 of tiles) {
    const k2 = Math.round((t2.box.left + t2.box.right) / 2 / Math.max(xTol, 1e-3));
    const a = cols.get(k2) ?? [];
    a.push(t2);
    cols.set(k2, a);
  }
  const out = [];
  for (const col of cols.values()) {
    col.sort((a, b) => a.box.top - b.box.top);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const top = Math.min(...run.map((t2) => t2.box.top));
      const bottom2 = Math.max(...run.map((t2) => t2.box.bottom));
      const x = (run[0].box.left + run[0].box.right) / 2;
      const w = run[0].box.right - run[0].box.left;
      out.push(new Seg(run[0].parent, x, top, x, bottom2, Math.max(w, 0.3)));
      run = [];
    };
    for (const t2 of col) {
      if (run.length) {
        const prevBottom = Math.max(...run.map((q2) => q2.box.bottom));
        if (t2.box.top > prevBottom + (t2.box.bottom - t2.box.top) * 0.5) flush();
      }
      run.push(t2);
    }
    flush();
  }
  return out;
}
function findTails(pg) {
  const stems = pg.segsWithTag("Stem");
  let found = false;
  for (const t2 of pg.symbols) {
    if (!isFlag(t2.code)) continue;
    for (const l2 of stems) {
      if (Math.abs(l2.box.left - t2.box.left) > l2.lw) continue;
      if (!overlapY(t2.box, l2.box)) continue;
      found = true;
      t2.addTag("Tail");
      break;
    }
  }
  return found;
}
function findBarlines(pg) {
  const vlines = pg.segs.filter((s) => s.isV && !s.hasAnyTag());
  for (const l2 of vlines) {
    let isSys = false;
    for (const st of pg.staves) {
      if (Math.abs(st.box.left - l2.cx) < Math.max(l2.lw, 1)) isSys = true;
    }
    if (isSys) {
      l2.addTag("SysLine");
    }
  }
  const overshoots = (l2, st) => {
    const out = (s2) => (s2.stepDistance() || 1) * 0.6;
    const lands = (y) => pg.staves.some((s2) => Math.abs(y - s2.box.top) <= out(s2) || Math.abs(y - s2.box.bottom) <= out(s2));
    return l2.top < st.box.top - out(st) && !lands(l2.top) || l2.bottom > st.box.bottom + out(st) && !lands(l2.bottom);
  };
  const topStaff = /* @__PURE__ */ new Map();
  const covers = /* @__PURE__ */ new Set();
  const heads = pg.symbols.filter((s) => s.hasTag("Note") && !isRest(s.code));
  const stems = pg.segsWithTag("Stem");
  for (const l2 of vlines) {
    if (l2.hasAnyTag()) continue;
    const sp = pg.normalStaffSpace || pg.space;
    const stemOf2 = (h2) => {
      if (!overlapY(l2.box, h2.box)) return false;
      const atL = Math.abs(h2.box.left - l2.cx) < l2.lw * 2, atR = Math.abs(h2.box.right - l2.cx) < l2.lw * 2;
      if (!atL && !atR) return false;
      const cy2 = (h2.box.top + h2.box.bottom) / 2;
      const leadNote = atL && !atR && Math.abs(cy2 - l2.bottom) <= sp && Math.abs(cy2 - l2.top) > sp;
      if (leadNote) return false;
      const edgeOf = (s) => Math.min(Math.abs(h2.box.left - s.cx), Math.abs(h2.box.right - s.cx));
      return !stems.some((s) => s !== l2 && edgeOf(s) < l2.lw * 2 && overlapY(s.box, h2.box));
    };
    if (heads.some(stemOf2)) continue;
    for (const st of pg.staves) {
      const tol = (st.stepDistance() || 1) * 0.5;
      const shifted = l2.len >= boxH(st.box) - tol && Math.abs(l2.top - st.box.top) <= tol * 1.6 && Math.abs(l2.bottom - st.box.bottom) <= tol * 1.6;
      if (l2.top <= st.box.top + tol && l2.bottom >= st.box.bottom - tol || shifted) {
        if (overshoots(l2, st)) break;
        topStaff.set(l2, st);
        covers.add(l2);
        break;
      }
    }
  }
  {
    const groups = systemGroups(pg).filter((g2) => g2.length >= 2);
    const allV = pg.segs.filter((s) => s.isV);
    for (const l2 of [...covers]) {
      const ts = topStaff.get(l2);
      const g2 = groups.find((x) => x.includes(ts));
      if (!g2) continue;
      const sp = ts.stepDistance() * 2 || pg.space;
      const spans = (m2, st) => m2.top <= st.box.top + sp * 0.25 && m2.bottom >= st.box.bottom - sp * 0.25;
      const half = (m2, st) => !m2.hasTag("Stem") && Math.min(m2.bottom, st.box.bottom) - Math.max(m2.top, st.box.top) >= boxH(st.box) * 0.5;
      if (!g2.some((st) => st !== ts && (spans(l2, st) || allV.some((m2) => m2 !== l2 && Math.abs(m2.cx - l2.cx) <= sp * 0.6 && (spans(m2, st) || half(m2, st)))))) covers.delete(l2);
    }
  }
  let found = false;
  const barX = [];
  for (const l2 of pg.segs) {
    if (!l2.isV || !l2.hasTag("BarLine")) continue;
    const st = pg.staves.find((q2) => l2.top <= q2.box.bottom && l2.bottom >= q2.box.top);
    if (st) barX.push({ x: l2.cx, st }), found = true;
  }
  for (const it of covers) {
    const ts = topStaff.get(it);
    if (Math.abs(ts.box.left - it.cx) >= Math.max(it.lw, 1)) {
      it.addTag("BarLine");
      barX.push({ x: it.cx, st: ts });
    }
    found = true;
  }
  const sysOf = /* @__PURE__ */ new Map();
  for (const g2 of systemGroups(pg)) if (g2.length >= 2) for (const st of g2) sysOf.set(st, g2);
  const minLen = Math.min(...pg.staves.map((s) => boxH(s.box))) * 0.5;
  const gapTol = (pg.normalStaffSpace || pg.space) * 0.5;
  for (const l2 of vlines) {
    if (l2.hasAnyTag()) continue;
    if (l2.len < minLen) continue;
    const onStaff = pg.staves.filter((st) => Math.min(l2.bottom, st.box.bottom) - Math.max(l2.top, st.box.top) >= minLen);
    const between2 = pg.staves.filter((a) => Math.abs(l2.top - a.box.bottom) <= gapTol && pg.staves.some((b) => b !== a && Math.abs(l2.bottom - b.box.top) <= gapTol));
    const sys = [...onStaff, ...between2].map((st) => sysOf.get(st)).find((g2) => g2);
    if (!sys) continue;
    if (barX.some((b) => sys.includes(b.st) && Math.abs(l2.cx - b.x) < Math.max(l2.lw, 1))) l2.addTag("BarLine");
  }
  for (const s of pg.symbols) {
    if (s.code === "barlineSingle" || s.code === "barlineFinal" || s.code === "barlineDouble") s.addTag("BarLine");
  }
  return found;
}
function tagSystemBarlines(pg) {
  const vlines = pg.segs.filter((s) => s.isV && !s.hasAnyTag());
  for (const g2 of systemGroups(pg)) {
    if (g2.length < 2) continue;
    const sp = g2[0].stepDistance() * 2 || pg.space;
    const tol = sp * 0.3;
    const lands = (y) => g2.some((st) => Math.abs(y - st.box.top) <= tol || Math.abs(y - st.box.bottom) <= tol);
    const barOn = (l2, st) => l2.top <= st.box.top + tol && l2.bottom >= st.box.bottom - tol && lands(l2.top) && lands(l2.bottom) && Math.abs(st.box.left - l2.cx) >= Math.max(l2.lw, 1) * 2;
    const per = g2.map((st) => vlines.filter((l2) => barOn(l2, st)));
    const xTol = sp * 0.6;
    for (const l2 of per[0]) {
      const mates = per.map((ls) => ls.filter((m2) => Math.abs(m2.cx - l2.cx) <= xTol));
      if (mates.some((ms) => !ms.length)) continue;
      for (const ms of mates) for (const m2 of ms) if (!m2.hasAnyTag()) m2.addTag("BarLine");
    }
  }
}
function makeSystems(pg) {
  for (const arr of systemGroups(pg)) {
    const sys = new SSystem();
    sys.staves = arr;
    sys.init();
    pg.systems.push(sys);
  }
  pg.systems.sort((a, b) => a.box.top - b.box.top);
  pg.systems.forEach((s, i2) => s.index = i2);
}
const SYS_BREAK_GAP = 0.8;
function systemGroups(pg) {
  const marks = [
    ...pg.segsWithTag("SysLine").map((s) => s.box),
    ...pg.symbols.filter((s) => s.code === "bracket" || s.code === "brace").map((s) => s.box),
    // 位图路的系统括号（`findSystemBrackets`）：方括号的上下衬线会把粗竖笔与
    // 细系统线连成一块，那一块过不了竖笔画的宽度闸，`SysLine` 一条都抽不出来。
    ...pg.objs.filter((o) => o.hasTag("SysBracket")).map((o) => o.box)
  ];
  const done = /* @__PURE__ */ new Set();
  const out = [];
  marks.sort((a, b) => pg.staves.filter((st) => overlapY(st.box, b)).length - pg.staves.filter((st) => overlapY(st.box, a)).length);
  for (const b of marks) {
    const arr = pg.staves.filter((st) => overlapY(st.box, b));
    if (arr.length < 2) continue;
    if (arr.some((st) => done.has(st))) continue;
    out.push(arr.slice().sort((a, b2) => a.box.top - b2.box.top));
    for (const st of arr) done.add(st);
  }
  for (const st of pg.staves) if (!done.has(st)) out.push([st]);
  return joinByGap(out);
}
function joinByGap(groups) {
  const gs = groups.slice().sort((a, b) => a[0].box.top - b[0].box.top);
  const gapOf = (a, b) => b[0].box.top - a[a.length - 1].box.bottom;
  let inter = Infinity;
  for (let i2 = 1; i2 < gs.length; i2++) if (gs[i2 - 1].length > 1 && gs[i2].length > 1) inter = Math.min(inter, gapOf(gs[i2 - 1], gs[i2]));
  if (!isFinite(inter)) return gs;
  const out = [];
  for (const g2 of gs) {
    const prev = out[out.length - 1];
    if (prev && (prev.length === 1 || g2.length === 1) && gapOf(prev, g2) < inter * SYS_BREAK_GAP) prev.push(...g2);
    else out.push(g2.slice());
  }
  return out;
}
function removeWhite(pg) {
  pg.objs = pg.objs.filter((o) => !(o.path && isWhite(o.path) && !o.hasAnyTag()));
}
function unknownObjs(pg) {
  const owned = /* @__PURE__ */ new Set();
  for (const s of pg.segs) if (s.hasAnyTag()) owned.add(s.obj);
  return pg.objs.filter((o) => !o.hasAnyTag() && !owned.has(o));
}
function unknownSegs(pg) {
  return pg.segs.filter((s) => !s.hasAnyTag());
}
function makeBars(pg) {
  const openTail = /* @__PURE__ */ new Set();
  for (const stf of pg.staves) {
    const marks = classifyBarlines(pg, stf);
    tagRepeatDots(pg, stf, marks);
    const xs = marks.map((m2) => m2.x);
    let left = stf.box.left;
    let pendingLeftRepeat = false;
    let prevLeftRepeat = marks[0]?.repeat === "forward" || marks[0]?.repeat === "both";
    const minBar = (stf.stepDistance() || 1) * 4;
    for (const x of xs) {
      if (x - left < minBar) {
        left = x;
        continue;
      }
      const bar = new Bar(stf);
      bar.left = left;
      bar.right = x;
      const mk = marks.find((m2) => m2.x === x);
      bar.rightStyle = mk?.style ?? null;
      bar.rightRepeat = mk?.repeat === "backward" || mk?.repeat === "both";
      pendingLeftRepeat = mk?.repeat === "forward" || mk?.repeat === "both";
      bar.leftRepeat = prevLeftRepeat;
      prevLeftRepeat = pendingLeftRepeat;
      stf.bars.push(bar);
      left = x;
    }
    if (stf.box.right - left > minBar) {
      const bar = new Bar(stf);
      bar.left = left;
      bar.right = stf.box.right;
      bar.leftRepeat = prevLeftRepeat;
      stf.bars.push(bar);
      openTail.add(bar);
    }
    for (const s of pg.symbols) {
      if (!s.hasTag("Note") || s.ownerStaff !== stf) continue;
      const b = stf.bars.find((x) => s.px >= x.left && s.px < x.right);
      if (b) b.notes.push(s);
    }
    for (const b of stf.bars) sortByLeft(b.notes);
  }
  for (const g2 of systemGroups(pg)) {
    const sp = g2[0].stepDistance() * 2 || pg.space;
    const dropHead = (stf) => {
      const gone = stf.bars.shift();
      if (gone.rightStyle && !stf.bars[0].leftStyle) {
        stf.bars[0].leftStyle = gone.rightStyle === "light-heavy" ? "heavy-light" : gone.rightStyle;
      }
    };
    for (; ; ) {
      const emptyHead = (stf) => stf.bars.length > 1 && !stf.bars[0].notes.length;
      const cand = g2.filter(emptyHead);
      if (!cand.length) break;
      const aligned = g2.every((stf) => stf.bars.length > 1 && Math.abs(stf.bars[0].right - g2[0].bars[0].right) <= sp);
      if (aligned && cand.length < g2.length) break;
      const drop = aligned ? cand : cand.filter((stf) => !g2.some((o) => o !== stf && !emptyHead(o) && o.bars.length > 1 && Math.abs(o.bars[0].right - stf.bars[0].right) <= sp));
      if (!drop.length) break;
      for (const stf of drop) dropHead(stf);
    }
    for (; ; ) {
      const emptyTail = (stf) => stf.bars.length > 1 && !stf.bars[stf.bars.length - 1].notes.length && (g2.length > 1 || openTail.has(stf.bars[stf.bars.length - 1]));
      const cand = g2.filter(emptyTail);
      if (!cand.length) break;
      const aligned = g2.every((stf) => stf.bars.length > 1 && Math.abs(stf.bars[stf.bars.length - 1].left - g2[0].bars[g2[0].bars.length - 1].left) <= sp);
      if (aligned && cand.length < g2.length) break;
      const drop = aligned ? cand : cand.filter((stf) => !g2.some((o) => o !== stf && !emptyTail(o) && o.bars.length > 1 && Math.abs(o.bars[o.bars.length - 1].left - stf.bars[stf.bars.length - 1].left) <= sp));
      if (!drop.length) break;
      for (const stf of drop) stf.bars.pop();
    }
  }
}
const STEP_LETTERS$1 = ["C", "D", "E", "F", "G", "A", "B"];
function clefMiddleStep(code) {
  switch (code) {
    case "fClef":
      return 29;
    case "fClef8vb":
      return 22;
    case "gClef":
      return 41;
    case "gClef8vb":
      return 34;
    case "gClef8va":
      return 48;
    case "cClef":
      return 35;
    // C 谱号（中音）中线 C4 → 5×7+0
    case "unpitchedPercussionClef1":
    case "unpitchedPercussionClef2":
      return 41;
    default:
      return null;
  }
}
function stepToPitch(idx) {
  const o = Math.floor(idx / 7) - 1;
  const s = (idx % 7 + 7) % 7;
  return { step: STEP_LETTERS$1[s], octave: o };
}
function findClefKeyTime(pg) {
  const accids = [];
  const clefs = [];
  const times = [];
  for (const it of pg.symbols) {
    if (isAccidental(it.code)) accids.push(it);
    else if (isClef(it.code)) clefs.push(it);
    else if (timeSigDigit(it.code) >= 0 || it.code === "timeSigCommon" || it.code === "timeSigCutCommon") times.push(it);
  }
  const validClefs = [];
  for (const c2 of clefs) {
    let stf = null;
    let best = 0;
    for (const st of pg.staves) {
      const ov = Math.min(c2.box.bottom, st.box.bottom) - Math.max(c2.box.top, st.box.top);
      if (ov > best) {
        best = ov;
        stf = st;
      }
    }
    if (!stf) continue;
    c2.ownerStaff = stf;
    c2.addTag("Clef");
    validClefs.push(c2);
  }
  for (const c2 of times) {
    for (const st of pg.staves) {
      if (Math.abs(st.middleStep(c2.py)) <= 4) {
        c2.ownerStaff = st;
        c2.addTag("Time");
        break;
      }
    }
  }
  analyzeAccidental(pg, accids, validClefs);
  const ctx = /* @__PURE__ */ new Map();
  for (const st of pg.staves) {
    const cl = sortByLeft(validClefs.filter((c2) => overlapY(c2.box, st.box)).slice());
    const key = sortByLeft(pg.symbols.filter((s) => s.hasTag("Key") && overlapY(s.box, st.box)).slice());
    const tm = sortByLeft(pg.symbols.filter((s) => s.hasTag("Time") && s.ownerStaff === st).slice());
    const sp = pg.normalStaffSpace || pg.space;
    const clefs2 = cl.length ? [cl[0], ...cl.slice(1).filter((c2) => c2.box.left > st.box.left + sp * 5)] : [];
    ctx.set(st, { staff: st, clef: cl[0] ?? null, clefs: clefs2, key, time: tm });
  }
  return ctx;
}
function analyzeAccidental(pg, accids, clefs) {
  const notes = pg.symbols.filter((s) => s.hasTag("Note"));
  const sp = pg.normalStaffSpace || pg.space;
  for (const acc of accids) {
    for (const nt of notes) {
      if (!nt.ownerStaff) continue;
      if (Math.abs(nt.py - acc.py) > sp / 4) continue;
      if (nt.px < acc.px) continue;
      if (nt.box.left - acc.box.right < sp / 2) {
        acc.addTag("Accidental");
        break;
      }
    }
  }
  const poss = accids.filter((a) => !a.hasAnyTag()).sort((a, b) => a.px - b.px);
  const barlines = [
    ...pg.segsWithTag("BarLine").map((s) => s.box),
    ...pg.symbols.filter((s) => s.hasTag("BarLine")).map((s) => s.box)
  ];
  const keyAccids = [];
  for (const acc of poss) {
    let after = false;
    for (const c2 of clefs) {
      if (c2.box.right > acc.box.left) continue;
      if (acc.box.left - c2.box.right > sp * 3) continue;
      if (!overlapY(c2.box, acc.box)) continue;
      after = true;
      break;
    }
    if (!after) {
      for (const k2 of keyAccids) {
        if (!overlapY(k2.box, acc.box)) continue;
        const dx = acc.box.left - k2.box.right;
        if (dx < 0 || dx > acc.box.right - acc.box.left) continue;
        after = true;
        break;
      }
    }
    if (!after) {
      for (const b of barlines) {
        if (!overlapY(b, acc.box)) continue;
        if (acc.box.left < b.left) continue;
        if (acc.box.left - b.right > sp * 2) continue;
        after = true;
        break;
      }
    }
    if (after) {
      keyAccids.push(acc);
      acc.addTag("Key");
    }
  }
}
function keyFifths(key) {
  let res = 0;
  for (const s of key) {
    if (s.code === "accidentalSharp") res++;
    else if (s.code === "accidentalFlat") res--;
  }
  return res;
}
function timeSignature(time, sp) {
  const all = timeSignatures(time, sp);
  return all.length ? { beats: all[0].beats, beatType: all[0].beatType } : null;
}
function timeSignatures(time, sp) {
  if (!time.length) return [];
  const out = [];
  const marks = time.filter((s) => s.code === "timeSigCommon" || s.code === "timeSigCutCommon");
  for (const m2 of marks) {
    out.push(m2.code === "timeSigCommon" ? { x: m2.px, beats: 4, beatType: 4 } : { x: m2.px, beats: 2, beatType: 2 });
  }
  const digits = time.filter((s) => timeSigDigit(s.code) >= 0).sort((a, b) => a.px - b.px);
  if (digits.length) {
    const gap = (sp ?? (digits[0].box.right - digits[0].box.left) * 2) * 3;
    const clusters = [[digits[0]]];
    for (let i2 = 1; i2 < digits.length; i2++) {
      const cur = clusters[clusters.length - 1];
      if (digits[i2].px - cur[cur.length - 1].px > gap) clusters.push([digits[i2]]);
      else cur.push(digits[i2]);
    }
    for (const cluster of clusters) {
      const midY = (Math.min(...cluster.map((d2) => d2.py)) + Math.max(...cluster.map((d2) => d2.py))) / 2;
      const top = cluster.filter((d2) => d2.py <= midY).sort((a, b) => a.px - b.px);
      const bot = cluster.filter((d2) => d2.py > midY).sort((a, b) => a.px - b.px);
      const num2 = (a) => Number(a.map((s) => timeSigDigit(s.code)).join("")) || 0;
      const beats = num2(top);
      const beatType = num2(bot);
      if (beats && beatType) out.push({ x: cluster[0].px, beats, beatType });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}
const beamY = (b, x) => b.x1 === b.x0 ? b.y0 : b.y0 + (b.y1 - b.y0) * (x - b.x0) / (b.x1 - b.x0);
function findBeams(pg) {
  const sp = pg.normalStaffSpace || pg.space;
  const out = [];
  for (const o of pg.objs) {
    const p2 = o.path;
    if (!p2 || !p2.paint.toLowerCase().includes("fill")) continue;
    if (p2.curves) continue;
    for (const spath of subPaths(p2)) {
      const pts = spath.pts;
      if (pts.length < 4 || pts.length > 5) continue;
      const xs = pts.map((q2) => q2.x);
      const ys = pts.map((q2) => q2.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const h2 = Math.max(...ys) - Math.min(...ys);
      if (w < sp * 0.8) continue;
      if (h2 > sp * 2) continue;
      const left = pts.filter((q2) => q2.x < Math.min(...xs) + w * 0.25).map((q2) => q2.y);
      const thick = left.length >= 2 ? Math.max(...left) - Math.min(...left) : h2;
      if (thick < sp * 0.25) continue;
      out.push(beamFromPts(pts));
    }
  }
  out.push(...slantedBeams(pg, sp));
  for (const s of pg.segs) {
    if (!s.isH || s.hasAnyTag()) continue;
    if (s.lw < sp * 0.3 || s.lw > sp * 1.2) continue;
    if (s.len < sp * 0.8 || s.len > sp * 20) continue;
    out.push({ box: s.box, x0: s.left, y0: s.cy, x1: s.right, y1: s.cy, level: 0 });
  }
  return dedupeBeams(out, sp / 2);
}
function dedupeBeams(list, unit) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const q2 = Math.max(unit / 4, 1e-3);
  for (const b of list) {
    const k2 = [b.x0, b.x1, b.y0, b.y1].map((v2) => Math.round(v2 / q2)).join(",");
    if (seen.has(k2)) continue;
    seen.add(k2);
    out.push(b);
  }
  return out;
}
function slantedBeams(pg, sp) {
  const out = [];
  for (const o of pg.objs) {
    const p2 = o.path;
    if (!p2 || p2.curves) continue;
    const groups = /* @__PURE__ */ new Map();
    for (const spath of subPaths(p2)) {
      if (spath.pts.length !== 2) continue;
      let [a, b] = spath.pts;
      if (a.x > b.x) [a, b] = [b, a];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx < sp * 0.8) continue;
      if (Math.abs(dy) < 0.02) continue;
      if (Math.abs(dy) >= dx) continue;
      const q2 = Math.max(sp / 8, 1e-3);
      const k2 = [a.x, b.x, dy / dx].map((v2) => Math.round(v2 / q2)).join(",");
      const g2 = groups.get(k2) ?? [];
      g2.push({ a, b });
      groups.set(k2, g2);
    }
    for (const g2 of groups.values()) {
      g2.sort((m2, n2) => m2.a.y - n2.a.y);
      let run = [];
      const flush = () => {
        if (run.length >= 3) {
          const th = run[run.length - 1].a.y - run[0].a.y;
          if (th >= sp * 0.2 && th <= sp * 1.2) {
            const x0 = run[0].a.x;
            const x1 = run[0].b.x;
            const y0 = (run[0].a.y + run[run.length - 1].a.y) / 2;
            const y1 = (run[0].b.y + run[run.length - 1].b.y) / 2;
            out.push({
              box: {
                left: x0,
                right: x1,
                top: Math.min(run[0].a.y, run[0].b.y),
                bottom: Math.max(run[run.length - 1].a.y, run[run.length - 1].b.y)
              },
              x0,
              y0,
              x1,
              y1,
              level: 0
            });
          }
        }
        run = [];
      };
      for (const l2 of g2) {
        if (run.length && l2.a.y - run[run.length - 1].a.y > sp * 0.3) flush();
        run.push(l2);
      }
      flush();
    }
  }
  return out;
}
function beamFromPts(pts) {
  const xs = pts.map((q2) => q2.x);
  const ys = pts.map((q2) => q2.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const at = (x) => {
    const near = pts.filter((q2) => Math.abs(q2.x - x) < (maxX - minX) * 0.25).map((q2) => q2.y);
    return near.length ? (Math.min(...near) + Math.max(...near)) / 2 : (Math.min(...ys) + Math.max(...ys)) / 2;
  };
  return {
    box: { left: minX, right: maxX, top: Math.min(...ys), bottom: Math.max(...ys) },
    x0: minX,
    y0: at(minX),
    x1: maxX,
    y1: at(maxX),
    level: 0
  };
}
const staffOmrOptions = {
  /** 时值取符杠**层级**（`BeamGroup::calcLevel`）；关掉则退回「数穿过符干的符杠条数」。
   *  两种做法的差别见 `buildNotes` 里那段注释。 */
  beamLevels: true,
  /** 应用八度移位（`8va`/`8vb`）。脚本里对比用。 */
  octaveShift: true
};
function buildStems(pg, sp) {
  const heads = pg.symbols.filter((s) => s.hasTag("Note") && !isRest(s.code) && s.ownerStaff);
  const flagSyms = pg.symbols.filter((s) => s.hasTag("Tail"));
  const out = [];
  const win0 = (nt) => Math.max(sp / 4, (nt.ownerStaff?.lines[0]?.lw ?? 0) * 2);
  for (const seg of pg.segsWithTag("Stem")) {
    const notes = [];
    for (const nt of heads) {
      if (!overlapY(seg.box, nt.box)) continue;
      const dx0 = Math.abs(nt.box.left - seg.cx);
      const dx1 = Math.abs(nt.box.right - seg.cx);
      const win = win0(nt);
      if (dx0 > win && dx1 > win) continue;
      notes.push(nt);
    }
    if (!notes.length) continue;
    const top = Math.min(...notes.map((n2) => n2.box.top));
    const bottom2 = Math.max(...notes.map((n2) => n2.box.bottom));
    const up = seg.top < top ? true : seg.bottom > bottom2 ? false : false;
    let flags = 0;
    for (const f2 of flagSyms) {
      if (Math.abs(f2.box.left - seg.cx) > sp / 4) continue;
      if (!overlapY(f2.box, seg.box)) continue;
      flags = Math.max(flags, flagLevel(f2.code));
    }
    out.push({ seg, up, notes, beams: [], flags });
  }
  const proper = (st, nt) => Math.abs((st.up ? nt.box.right : nt.box.left) - st.seg.cx) <= win0(nt);
  for (const st of out)
    st.notes = st.notes.filter((nt) => proper(st, nt) || !out.some((o) => o !== st && o.notes.includes(nt) && proper(o, nt)));
  return out.filter((st) => st.notes.length);
}
function beamConnect(b, st, sp) {
  const x = st.seg.cx;
  if (x < b.x0 - sp * 0.2) return "none";
  if (x > b.x1 + sp * 0.2) return "none";
  const y = beamY(b, x);
  const noteY = st.notes.reduce((a, n2) => a + (n2.box.top + n2.box.bottom) / 2, 0) / st.notes.length;
  const far = Math.abs(st.seg.top - noteY) > Math.abs(st.seg.bottom - noteY) ? st.seg.top : st.seg.bottom;
  const toward = Math.sign(noteY - far) || 1;
  const cys = st.notes.map((n2) => (n2.box.top + n2.box.bottom) / 2);
  const headEnd = toward > 0 ? Math.max(...cys) : Math.min(...cys);
  if ((y - headEnd) * toward > 0) return "none";
  const near = Math.abs(st.seg.top - y) < sp || Math.abs(st.seg.bottom - y) < sp;
  if (!near) {
    const d2 = (y - far) * toward;
    if (d2 < 0 || d2 > sp * 2) return "none";
  }
  if (Math.abs(x - b.x0) < sp / 5) return "begin";
  if (Math.abs(x - b.x1) < sp / 5) return "end";
  return "middle";
}
function calcBeamLevels(beams, stems, sp, heads = []) {
  const conn = /* @__PURE__ */ new Map();
  const kept = [];
  for (const b of beams) {
    const hits = [];
    for (const st of stems) {
      if (st.flags) continue;
      const h2 = beamConnect(b, st, sp);
      if (h2 === "none") continue;
      hits.push({ st, hit: h2 });
      st.beams.push(b);
    }
    if (!hits.length) continue;
    conn.set(b, hits);
    kept.push(b);
  }
  kept.sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0));
  const done = /* @__PURE__ */ new Set();
  for (const bi of kept) {
    if (done.has(bi)) continue;
    const grp = [bi];
    done.add(bi);
    for (const bj of kept) {
      if (done.has(bj)) continue;
      if (bi.x0 > bj.x1 || bj.x0 > bi.x1) continue;
      const si = new Set(conn.get(bi).map((h2) => h2.st));
      if (!conn.get(bj).some((h2) => si.has(h2.st))) continue;
      grp.push(bj);
      done.add(bj);
    }
    const hitsOf = grp.flatMap((g2) => conn.get(g2));
    const only = new Set(hitsOf.map((h2) => h2.st));
    if (only.size < 2 && hitsOf.every((h2) => h2.hit === "middle")) {
      const st = hitsOf[0].st;
      const gx0 = Math.min(...grp.map((g2) => g2.x0));
      const gx1 = Math.max(...grp.map((g2) => g2.x1));
      const gy0 = Math.min(...grp.map((g2) => g2.box.top));
      const gy1 = Math.max(...grp.map((g2) => g2.box.bottom));
      const far = Math.abs(gx0 - st.seg.cx) > Math.abs(gx1 - st.seg.cx) ? gx0 : gx1;
      const mine = new Set(st.notes.map((n2) => n2.box));
      const above = st.notes.reduce((a, n2) => a + (n2.box.top + n2.box.bottom) / 2, 0) / st.notes.length < (gy0 + gy1) / 2;
      const headAtFar = heads.some((h2) => {
        if (mine.has(h2) || h2.right < far - sp * 0.8 || h2.left > far + sp * 0.8) return false;
        const cy2 = (h2.top + h2.bottom) / 2;
        return above ? cy2 < gy0 && cy2 > gy0 - sp * 4.5 : cy2 > gy1 && cy2 < gy1 + sp * 4.5;
      });
      const nearEnd = Math.min(Math.abs(gx0 - st.seg.cx), Math.abs(gx1 - st.seg.cx)) < sp * 0.5;
      if (!headAtFar && !nearEnd) {
        for (const { st: s0 } of hitsOf) s0.beams = s0.beams.filter((q2) => !grp.includes(q2));
        continue;
      }
    }
    const x = grp[0].x0;
    const anchor = conn.get(grp[0]).reduce((a, h2) => h2.st.seg.cx < a.st.seg.cx ? h2 : a).st;
    const noteY = anchor.notes.reduce((a, n2) => a + (n2.box.top + n2.box.bottom) / 2, 0) / anchor.notes.length;
    const anchorY = Math.abs(anchor.seg.top - noteY) < Math.abs(anchor.seg.bottom - noteY) ? anchor.seg.top : anchor.seg.bottom;
    const main = grp[0];
    const toward = Math.sign(anchorY - beamY(main, x)) || 1;
    const rel = new Map(grp.map((g2) => {
      const xc = (g2.x0 + g2.x1) / 2;
      return [g2, (beamY(g2, xc) - beamY(main, xc)) * toward];
    }));
    grp.sort((a, b) => rel.get(b) - rel.get(a));
    let last = rel.get(grp[0]);
    let level = 1;
    grp[0].level = 1;
    for (let i2 = 1; i2 < grp.length; i2++) {
      const y = rel.get(grp[i2]);
      if (Math.abs(y - last) >= sp / 4) level++;
      last = y;
      grp[i2].level = level;
    }
  }
}
function clefFor(pg, ctx, stf, x = Infinity) {
  const cs = ctx.get(stf)?.clefs ?? [];
  const before = cs.filter((c2) => c2.box.left < x);
  if (before.length) return before[before.length - 1];
  let si = -1;
  let ki = -1;
  for (let i2 = 0; i2 < pg.systems.length && si < 0; i2++) {
    const k2 = pg.systems[i2].staves.indexOf(stf);
    if (k2 >= 0) {
      si = i2;
      ki = k2;
    }
  }
  if (si < 0) return null;
  for (let i2 = si - 1; i2 >= 0; i2--) {
    const prev = pg.systems[i2].staves[ki];
    if (!prev) continue;
    const pc = ctx.get(prev);
    const c2 = pc?.clefs?.length ? pc.clefs[pc.clefs.length - 1] : pc?.clef;
    if (c2) return c2;
  }
  return null;
}
function buildNotes(pg, ctx, beams, stemsOut, hollowish) {
  const sp = pg.normalStaffSpace || pg.space;
  const stems = buildStems(pg, sp);
  stemsOut?.push(...stems);
  calcBeamLevels(beams, stems, sp, pg.symbols.filter((q2) => q2.code.startsWith("notehead")).map((q2) => q2.box));
  const stemOf2 = /* @__PURE__ */ new Map();
  for (const st of stems) for (const n2 of st.notes) if (!stemOf2.has(n2)) stemOf2.set(n2, st);
  const dots = pg.symbols.filter((s) => s.code === "augmentationDot" && !s.hasAnyTag());
  const out = [];
  for (const s of pg.symbols) {
    if (!s.hasTag("Note") || !s.ownerStaff) continue;
    const stf = s.ownerStaff;
    const rest = isRest(s.code);
    const clef = clefFor(pg, ctx, stf, s.box.left);
    const mid = clef ? clefMiddleStep(clef.code) ?? 41 : 41;
    let diatonic = -1;
    let step = "";
    let octave = 0;
    if (!rest) {
      diatonic = mid + stf.middleStep(s.py, (s.box.left + s.box.right) / 2);
      const p2 = stepToPitch(diatonic);
      step = p2.step;
      octave = p2.octave;
    }
    const stem = rest ? void 0 : stemOf2.get(s);
    const stemUp = stem ? stem.up : s.compositeStemUp ?? null;
    const nb = stem ? stem.flags || (staffOmrOptions.beamLevels ? new Set(stem.beams.map((b, i2) => b.level > 0 ? `L${b.level}` : `u${i2}`)).size : stem.beams.length) : 0;
    let base;
    if (s.compositeBase !== void 0) {
      base = s.compositeBase;
    } else if (rest) {
      base = restDuration(s.code);
      if (base < 0) base = 1;
      if (s.code === "restHalf" || s.code === "restWhole") {
        const space = (stf.stepDistance() || 0) * 2 || sp;
        const mid2 = (stf.box.top + stf.box.bottom) / 2;
        base = mid2 - s.box.bottom > space * 0.5 ? 1 : 1 / 2;
      }
    } else if (s.code === "noteheadWhole" || s.code === "noteheadDoubleWhole") {
      base = s.code === "noteheadDoubleWhole" ? 2 : 1;
    } else if (s.code === "noteheadHalf") {
      base = stem ? 1 / 2 : 1;
    } else if (nb === 0 && s.code === "noteheadBlack" && hollowish?.(s)) {
      base = stem ? 1 / 2 : 1;
    } else {
      base = 1 / 4;
      for (let i2 = 0; i2 < nb; i2++) base /= 2;
    }
    let accidental = null;
    for (const a of pg.symbols) {
      if (!a.hasTag("Accidental")) continue;
      if (!overlapY(a.box, s.box)) continue;
      if (a.px > s.box.left) continue;
      if (xSpace(a.box, s.box) > sp) continue;
      accidental = accidentalAlter(a.code);
      break;
    }
    out.push({ sym: s, staff: stf, rest, diatonic, step, octave, alter: 0, accidental, duration: base, base, dots: 0, stemUp, beams: nb, x: s.px, voice: 1, slash: s.code.startsWith("noteheadSlash") || void 0 });
  }
  out.sort((a, b) => a.staff.box.top - b.staff.box.top || a.x - b.x);
  attachDots(out, dots, sp);
  initChords(out, stems, sp);
  calcAlters(pg, ctx, out);
  return out;
}
function attachDots(notes, dots, sp) {
  const rightOf = (n2) => {
    let r4 = n2.sym.box.right;
    for (const m2 of notes)
      if (m2.staff === n2.staff && m2.sym.box.left <= n2.sym.box.right + Math.max(2, sp * 0.3) && m2.sym.box.right >= n2.sym.box.left && Math.abs(m2.sym.py - n2.sym.py) <= sp * 1.5)
        r4 = Math.max(r4, m2.sym.box.right);
    return r4;
  };
  const rights = new Map(notes.map((n2) => [n2, rightOf(n2)]));
  const got = /* @__PURE__ */ new Map();
  const owner = /* @__PURE__ */ new Map();
  for (const d2 of dots) {
    let best;
    let bd = Infinity;
    for (const n2 of notes) {
      const r4 = rights.get(n2);
      if (d2.px <= r4 && (d2.box.left + d2.box.right) / 2 <= r4) continue;
      const dx = d2.px - r4;
      if (dx > sp * 1.5) continue;
      const dy = Math.abs(d2.py - n2.sym.py);
      if (dy > sp * 0.85) continue;
      if (got.get(n2)?.some((x) => Math.abs(x - d2.px) < sp * 0.3)) continue;
      const key = d2.px - n2.sym.box.right + (d2.py <= n2.sym.py + sp * 0.1 ? 0 : 0.02) + dy * 0.01;
      if (key < bd) {
        bd = key;
        best = n2;
      }
    }
    if (!best) continue;
    got.set(best, [...got.get(best) ?? [], d2.px]);
    owner.set(d2, best);
    best.dots++;
    d2.addTag("Augmentation");
  }
  const cols = [];
  for (const n2 of notes) {
    if (n2.rest) continue;
    const c2 = cols.find((q2) => q2[0].staff === n2.staff && q2.some((m2) => m2.sym.box.left <= rights.get(n2) + sp * 0.3 && rights.get(m2) >= n2.sym.box.left - sp * 0.3 && Math.abs(m2.sym.py - n2.sym.py) <= sp * 3));
    if (c2) c2.push(n2);
    else cols.push([n2]);
  }
  for (const c2 of cols) {
    if (c2.length < 2) continue;
    c2.sort((a, b) => a.sym.py - b.sym.py);
    const r4 = Math.max(...c2.map((n2) => rights.get(n2)));
    const top = c2[0].sym.py - sp * 0.85;
    const bot = c2[c2.length - 1].sym.py + sp * 1.25;
    const ds = dots.filter((d2) => (owner.has(d2) ? c2.includes(owner.get(d2)) : true) && (d2.box.left + d2.box.right) / 2 > r4 && d2.px - r4 <= sp * 1.5 && d2.py >= top && d2.py <= bot);
    if (ds.length !== c2.length) continue;
    const mx = ds.reduce((a, d2) => a + d2.px, 0) / ds.length;
    if (ds.some((d2) => Math.abs(d2.px - mx) > sp * 0.5)) continue;
    ds.sort((a, b) => a.py - b.py);
    if (ds.some((d2, i2) => i2 > 0 && d2.py - ds[i2 - 1].py < sp * 0.7)) continue;
    for (const d2 of ds) {
      const o = owner.get(d2);
      if (o) o.dots--;
    }
    ds.forEach((d2, i2) => {
      owner.set(d2, c2[i2]);
      c2[i2].dots++;
      d2.addTag("Augmentation");
    });
  }
  for (const n2 of notes) {
    let dur = n2.base;
    let add = n2.base;
    for (let i2 = 0; i2 < n2.dots; i2++) {
      add /= 2;
      dur += add;
    }
    n2.duration = dur;
  }
}
const STEM_JOIN_X = 0.3;
const STEM_JOIN_GAP$1 = 1;
const STEM_SPLIT_DUR_GAP = 0.4;
const ORPHAN_STEP = 5;
const ORPHAN_DY = 3;
const guessDur = (ch) => ch.notes[0].duration;
const headSize = (n2) => n2.sym.box.bottom - n2.sym.box.top;
function inheritDur(ch, ns, orphan) {
  for (const n2 of ns) {
    if (n2.beams !== 0 || orphan && n2.stemUp !== null) continue;
    const ref = ch.notes.find((m2) => m2 !== n2 && m2.sym.code === n2.sym.code && (orphan ? m2.stemUp !== null : m2.beams > 0));
    if (!ref) continue;
    n2.base = ref.base;
    n2.beams = ref.beams;
    n2.dots = Math.max(n2.dots, ref.dots);
    n2.duration = n2.base * (2 - 1 / 2 ** n2.dots);
  }
}
function initChords(notes, stems, sp) {
  const byNote = /* @__PURE__ */ new Map();
  const out = [];
  const bySym = /* @__PURE__ */ new Map();
  for (const n2 of notes) if (!bySym.has(n2.sym)) bySym.set(n2.sym, n2);
  const make = (ns, stem) => {
    ns.sort((a, b) => a.diatonic - b.diatonic);
    const ch = {
      staff: ns[0].staff,
      notes: ns,
      stem,
      left: Math.min(...ns.map((n2) => n2.sym.box.left)),
      right: Math.max(...ns.map((n2) => n2.sym.box.right)),
      top: Math.min(...ns.map((n2) => n2.sym.box.top)),
      offset: 0,
      dur: 0,
      grace: false,
      timed: false,
      voice: 1
    };
    for (let i22 = 0; i22 < ns.length; i22++) {
      ns[i22].group = ch;
      ns[i22].chordExtra = i22 > 0 || void 0;
      byNote.set(ns[i22], ch);
    }
    out.push(ch);
    return ch;
  };
  for (const st of stems) {
    const ns = [];
    for (const sym of st.notes) {
      const n2 = bySym.get(sym);
      if (n2 && !byNote.has(n2)) ns.push(n2);
    }
    if (ns.length) make(ns, st);
  }
  for (let a = 0; a < out.length; a++) {
    const ca = out[a];
    if (!ca.stem) continue;
    for (let b = out.length - 1; b > a; b--) {
      const cb = out[b];
      if (!cb.stem || cb.staff !== ca.staff) continue;
      const xa = (ca.stem.seg.box.left + ca.stem.seg.box.right) / 2;
      const xb = (cb.stem.seg.box.left + cb.stem.seg.box.right) / 2;
      if (Math.abs(xa - xb) > sp * STEM_JOIN_X) continue;
      const gap = Math.max(ca.stem.seg.box.top, cb.stem.seg.box.top) - Math.min(ca.stem.seg.box.bottom, cb.stem.seg.box.bottom);
      if (gap > sp * STEM_JOIN_GAP$1) continue;
      for (const n2 of cb.notes) {
        ca.notes.push(n2);
        n2.group = ca;
        byNote.set(n2, ca);
      }
      ca.left = Math.min(ca.left, cb.left);
      ca.right = Math.max(ca.right, cb.right);
      ca.top = Math.min(ca.top, cb.top);
      ca.notes.sort((m2, n2) => m2.diatonic - n2.diatonic);
      ca.notes.forEach((n2, i22) => n2.chordExtra = i22 > 0 || void 0);
      if (gap <= sp * STEM_SPLIT_DUR_GAP) inheritDur(ca, ca.notes, false);
      out.splice(b, 1);
    }
  }
  const orphan = notes.filter((n2) => !byNote.has(n2) && !n2.rest);
  for (const n2 of orphan) {
    let best = null;
    let bd = Infinity;
    for (const ch of out) {
      if (ch.staff !== n2.staff || !ch.stem) continue;
      if (n2.sym.box.left > ch.right + sp * 0.6 || n2.sym.box.right < ch.left - sp * 0.6) continue;
      const d2 = Math.min(...ch.notes.map((m2) => Math.abs(m2.diatonic - n2.diatonic)));
      if (d2 > ORPHAN_STEP || d2 === 0) continue;
      const dy = Math.min(...ch.notes.map((m2) => Math.abs(m2.sym.py - n2.sym.py)));
      if (dy > sp * ORPHAN_DY) continue;
      if (dy < bd) {
        bd = dy;
        best = ch;
      }
    }
    if (!best) continue;
    best.notes.push(n2);
    inheritDur(best, [n2], true);
    best.notes.sort((a, b) => a.diatonic - b.diatonic);
    best.notes.forEach((m2, i22) => m2.chordExtra = i22 > 0 || void 0);
    best.left = Math.min(best.left, n2.sym.box.left);
    best.right = Math.max(best.right, n2.sym.box.right);
    best.top = Math.min(best.top, n2.sym.box.top);
    n2.group = best;
    byNote.set(n2, best);
  }
  const rest = notes.filter((n2) => !byNote.has(n2));
  rest.sort((a, b) => a.staff.box.top - b.staff.box.top || a.sym.box.left - b.sym.box.left);
  let i2 = 0;
  while (i2 < rest.length) {
    const head = rest[i2];
    let j2 = i2 + 1;
    const grp = [head];
    if (!head.rest) {
      while (j2 < rest.length && rest[j2].staff === head.staff && !rest[j2].rest) {
        const gap = rest[j2].sym.box.left - Math.max(...grp.map((g2) => g2.sym.box.right));
        if (gap > sp * 0.3) break;
        grp.push(rest[j2]);
        j2++;
      }
    }
    make(grp, null);
    i2 = j2;
  }
  for (const ch of out) {
    if (!ch.stem) continue;
    for (const n2 of ch.notes)
      if (!n2.rest && n2.base === 1 && n2.beams === 0 && n2.sym.code !== "noteheadDoubleWhole") {
        n2.base = 1 / 2;
        n2.duration = n2.base * (2 - 1 / 2 ** n2.dots);
      }
  }
  out.sort((a, b) => a.staff.box.top - b.staff.box.top || a.left - b.left);
  return out;
}
const chordOverlapX = (a, b) => !(a.left > b.right || b.left > a.right);
function checkFull(chords, expect, sp, ignoreSmall) {
  if (!chords.length) return false;
  const EPS2 = 1e-6;
  let chs = chords;
  const small = [];
  if (ignoreSmall) {
    const sizes = chords.flatMap((c2) => c2.notes.map(headSize)).sort((a, b) => a - b);
    const mid = sizes[sizes.length >> 1];
    chs = [];
    for (const c2 of chords) {
      if (c2.notes.length === 1 && headSize(c2.notes[0]) < mid * 0.7) {
        small.push(c2);
        continue;
      }
      chs.push(c2);
    }
    if (!chs.length) return false;
  }
  chs = [...chs].sort((a, b) => a.left - b.left);
  const grps = [];
  const measureRest = [];
  const full = [];
  for (const it of chs) {
    if (it.notes[0].sym.code === "restHBar") {
      it.dur = expect;
      it.offset = 0;
      measureRest.push(it);
      continue;
    }
    if (Math.abs(guessDur(it) - expect) < EPS2) {
      it.dur = expect;
      it.offset = 0;
      full.push(it);
      continue;
    }
    let newGrp = !grps.length;
    if (!newGrp) {
      const cha = grps[grps.length - 1].chords[0];
      if (!chordOverlapX(cha, it)) {
        newGrp = true;
        const sa = cha.stem?.seg;
        const sb = it.stem?.seg;
        if (sa && sb && Math.abs(sa.cx - sb.cx) < sp / 2) newGrp = false;
      }
    }
    if (newGrp) grps.push({ chords: [it], offset: 0 });
    else grps[grps.length - 1].chords.push(it);
  }
  if (!grps.length) {
    if (!measureRest.length && !full.length) return false;
    for (const ch of measureRest) ch.timed = true;
    for (const ch of full) ch.timed = true;
    return true;
  }
  const byMin = () => {
    let res = 0;
    for (const g2 of grps) {
      g2.offset = res;
      let d2 = Infinity;
      for (const ch of g2.chords) d2 = Math.min(d2, guessDur(ch));
      if (!isFinite(d2) || d2 <= 0) return false;
      res += d2;
    }
    return Math.abs(res - expect) < EPS2;
  };
  const byEnds = () => {
    let res = 0;
    const ends = [];
    for (const g2 of grps) {
      g2.offset = res;
      for (const ch of g2.chords) {
        const d2 = guessDur(ch);
        if (!isFinite(d2) || d2 <= 0) return false;
        ends.push(res + d2);
      }
      const next = Math.min(...ends.filter((e) => e > res + EPS2));
      if (!isFinite(next)) return false;
      res = next;
    }
    return Math.abs(Math.max(...ends) - expect) < EPS2 && Math.abs(res - expect) < EPS2;
  };
  if (!byMin() && !byEnds()) return false;
  for (const g2 of grps)
    for (const ch of g2.chords) {
      ch.offset = g2.offset;
      ch.dur = guessDur(ch);
      ch.timed = true;
    }
  for (const ch of measureRest) ch.timed = true;
  for (const ch of full) ch.timed = true;
  for (const ch of small) {
    ch.grace = true;
    for (const n2 of ch.notes) n2.grace = true;
  }
  return true;
}
function splitVoice(chords, expect) {
  const EPS2 = 1e-6;
  const res = [];
  const full = [];
  for (const ch of chords) {
    const first = ch.notes[0];
    if (ch.stem || first.rest) {
      res.push(ch);
      continue;
    }
    if (Math.abs(ch.dur - expect) < EPS2) full.push(ch);
    else res.push(ch);
  }
  if (full.length) {
    const first = full[0];
    for (let i2 = 1; i2 < full.length; i2++) {
      for (const n2 of full[i2].notes) {
        n2.group = first;
        first.notes.push(n2);
      }
    }
    first.notes.sort((a, b) => a.diatonic - b.diatonic);
    first.notes.forEach((n2, i2) => n2.chordExtra = i2 > 0 || void 0);
    res.push(first);
  }
  res.sort((a, b) => a.offset - b.offset || a.top - b.top);
  const done = /* @__PURE__ */ new Set();
  const layers = [];
  let guard = res.length + 1;
  while (done.size < res.length && guard-- > 0) {
    for (let i2 = 0; i2 < res.length; i2++) {
      const ch = res[i2];
      if (ch.grace) {
        done.add(ch);
        continue;
      }
      if (done.has(ch)) continue;
      const grp = [ch];
      done.add(ch);
      let now = ch.offset + ch.dur;
      for (let j2 = i2 + 1; j2 < res.length; j2++) {
        const c1 = res[j2];
        if (done.has(c1) || c1.grace) continue;
        if (c1.offset < now - EPS2) continue;
        grp.push(c1);
        done.add(c1);
        now = c1.offset + c1.dur;
      }
      layers.push(grp);
    }
  }
  const solo = (grp) => grp.length === 1 && Math.abs(grp[0].dur - expect) < EPS2;
  const firstReal = layers.findIndex((grp) => !solo(grp));
  const real = firstReal < 0 ? [] : layers.filter((grp, i2) => i2 >= firstReal || !solo(grp));
  const merged = real.length && real.length < layers.length ? real : layers;
  const extra = merged === layers ? [] : layers.filter((grp) => !real.includes(grp));
  merged.forEach((grp, i2) => {
    for (const ch of grp) {
      ch.voice = i2 + 1;
      for (const n2 of ch.notes) n2.voice = i2 + 1;
    }
  });
  for (const grp of extra)
    for (const ch of grp) {
      ch.voice = 1;
      for (const n2 of ch.notes) n2.voice = 1;
    }
}
function assignVoicesInBar(inBar, expect, borrowed = false) {
  const arr = inBar.filter((n2) => !n2.chordExtra && !n2.grace);
  if (arr.length < 4) return;
  const sumOf = (a) => a.reduce((x, n2) => x + (n2.sym.code === "restHBar" ? expect : n2.duration), 0);
  if (sumOf(arr) <= expect + 1e-6) return;
  const up = arr.filter((n2) => n2.stemUp === true);
  const down = arr.filter((n2) => n2.stemUp === false);
  {
    const lys = arr[0].staff.lineYs;
    const mid = (n2) => (n2.sym.box.top + n2.sym.box.bottom) / 2;
    const rests = arr.filter((n2) => n2.rest && n2.sym.code !== "restHBar");
    for (const side of lys.length >= 2 ? ["up", "down"] : []) {
      const off = rests.filter((n2) => side === "up" ? mid(n2) < lys[0] : mid(n2) > lys[lys.length - 1]);
      if (!off.length || off.length !== rests.length) continue;
      const own = side === "up" ? up : down;
      const other = side === "up" ? down : up;
      if (!own.length || other.length < 2) continue;
      if (Math.abs(sumOf(own) + sumOf(off) - expect) >= 1e-6 || sumOf(other) > expect + 1e-6) continue;
      if (!borrowed && Math.abs(sumOf(other) - expect) >= 1e-6) continue;
      if (arr.length !== own.length + other.length + off.length) continue;
      for (const n2 of side === "up" ? other : [...own, ...off]) {
        n2.voice = 2;
        if (n2.group) n2.group.voice = 2;
      }
      return;
    }
  }
  if (up.length < 2 || down.length < 2) return;
  if (Math.abs(sumOf(up) - expect) >= 1e-6 || Math.abs(sumOf(down) - expect) >= 1e-6) return;
  for (const n2 of down) {
    n2.voice = 2;
    if (n2.group) n2.group.voice = 2;
  }
}
const CIRCLE = [3, 0, 4, 1, 5, 2, 6];
function calcAlters(pg, ctx, notes) {
  let fifths = 0;
  const fifthsOf = /* @__PURE__ */ new Map();
  for (const st of pg.staves) {
    const c2 = ctx.get(st);
    if (c2 && c2.key.length) fifths = keyFifths(c2.key);
    fifthsOf.set(st, fifths);
  }
  const byBar = /* @__PURE__ */ new Map();
  for (const n2 of notes) {
    if (n2.rest) continue;
    const st = n2.staff;
    const bi = st.bars.findIndex((b) => n2.x >= b.left && n2.x < b.right);
    const key = `${st.index}#${bi}`;
    const a = byBar.get(key) ?? [];
    a.push(n2);
    byBar.set(key, a);
  }
  for (const [key, arr] of byBar) {
    const st = arr[0].staff;
    const kf = fifthsOf.get(st) ?? 0;
    const stat = /* @__PURE__ */ new Map();
    for (let i2 = 0; i2 < kf; i2++) for (let oct = 0; oct < 12; oct++) stat.set(oct * 7 + CIRCLE[i2], 1);
    for (let i2 = kf; i2 < 0; i2++) for (let oct = 0; oct < 12; oct++) stat.set(oct * 7 + CIRCLE[7 + i2], -1);
    arr.sort((a, b) => a.x - b.x);
    for (const n2 of arr) {
      if (n2.accidental !== null) stat.set(n2.diatonic, n2.accidental);
      n2.alter = stat.get(n2.diatonic) ?? 0;
    }
  }
}
function markSplitBars(pages) {
  const seqs = /* @__PURE__ */ new Map();
  for (const { page, bars } of pages)
    for (const sys of page.systems)
      sys.staves.forEach((stf, k2) => {
        const key = `${sys.staves.length}:${k2}`;
        const own = bars.filter((b) => b.staff === stf).sort((a, b) => a.index - b.index);
        seqs.set(key, [...seqs.get(key) ?? [], ...own]);
      });
  const eps = 1e-6;
  const part = (b) => !!b && !b.full && b.sum > eps && b.sum < b.expect - eps && Math.abs(b.sum / b.beat - Math.round(b.sum / b.beat)) < eps;
  const pair = (a, b) => Math.abs(a.expect - b.expect) < eps && Math.abs(a.sum + b.sum - a.expect) < eps;
  for (const seq of seqs.values())
    seq.forEach((b, i2) => {
      if (!part(b)) return;
      const prev = seq[i2 - 1];
      const next = seq[i2 + 1];
      const bar = b.staff.bars[b.index];
      const before = b.staff.bars[b.index - 1];
      const sectionEnd = (x) => !!x && (x.rightRepeat || !!x.rightStyle && x.rightStyle !== "regular");
      const edge = sectionEnd(bar) || sectionEnd(before) || !!bar?.leftRepeat;
      if (i2 === 0 || edge || part(prev) && pair(prev, b) || part(next) && pair(b, next) || i2 === seq.length - 1 && part(seq[0]) && pair(seq[0], b)) b.split = true;
    });
}
function checkBars(pg, ctx, notes, carry) {
  const out = [];
  const sp = pg.normalStaffSpace || pg.space;
  let cur = { beats: carry?.beats ?? 4, beatType: carry?.beatType ?? 4 };
  for (const stf of pg.staves) {
    const changes = timeSignatures(ctx.get(stf)?.time ?? [], sp);
    let ci = 0;
    stf.bars.forEach((bar, i2) => {
      while (ci < changes.length && changes[ci].x < bar.right) {
        cur = { beats: changes[ci].beats, beatType: changes[ci].beatType };
        ci++;
      }
      const expect = cur.beats / cur.beatType;
      const inBar = notes.filter((n2) => n2.staff === stf && !n2.crossStaff && n2.x >= bar.left && n2.x < bar.right);
      if (!inBar.length) return;
      const chords = [];
      const seen = /* @__PURE__ */ new Set();
      for (const n2 of inBar) {
        const g2 = n2.group;
        if (!g2 || seen.has(g2)) continue;
        seen.add(g2);
        chords.push(g2);
      }
      let full = checkFull(chords, expect, sp, false);
      if (!full) full = checkFull(chords, expect, sp, true);
      const sib = pg.systems.find((sy) => sy.staves.includes(stf))?.staves.filter((s0) => s0 !== stf) ?? [];
      const beat = 1 / cur.beatType;
      const short = out.find(
        (o) => sib.includes(o.staff) && o.index === i2 && o.sum >= expect * 0.5 && o.sum < expect - 1e-6 && Math.abs(o.sum / beat - Math.round(o.sum / beat)) < 1e-6
      )?.sum;
      const overfull = (len) => inBar.filter((n2) => !n2.chordExtra && !n2.grace).reduce((a, n2) => a + n2.duration, 0) > len * 1.3;
      if (full) splitVoice(chords, expect);
      else if (short !== void 0 && overfull(short) && (checkFull(chords, short, sp, false) || checkFull(chords, short, sp, true))) splitVoice(chords, short);
      else assignVoicesInBar(inBar, expect, notes.some((n2) => n2.staff === stf && n2.crossStaff && n2.x >= bar.left && n2.x < bar.right));
      const heads = inBar.filter((n2) => !n2.chordExtra && !n2.grace);
      const sum = heads.filter((n2) => n2.voice === (heads[0]?.voice ?? 1)).reduce((a, n2) => a + (n2.sym.code === "restHBar" ? expect : n2.duration), 0);
      out.push({ staff: stf, index: i2, sum, expect, count: inBar.length, full: full || Math.abs(sum - expect) < 1e-6, beat });
    });
  }
  return out;
}
function lastTimeSignature(pg, ctx, carry) {
  let out = carry;
  for (const stf of pg.staves) {
    const all = timeSignatures(ctx.get(stf)?.time ?? [], pg.normalStaffSpace || pg.space);
    if (all.length) out = { beats: all[all.length - 1].beats, beatType: all[all.length - 1].beatType };
  }
  return out;
}
let currentNoteId = null;
const TYPE_OF = [
  [2, "breve"],
  [1, "whole"],
  [1 / 2, "half"],
  [1 / 4, "quarter"],
  [1 / 8, "eighth"],
  [1 / 16, "16th"],
  [1 / 32, "32nd"],
  [1 / 64, "64th"]
];
function noteType(base) {
  let best = "quarter";
  let bd = Infinity;
  for (const [v2, name] of TYPE_OF) {
    const d2 = Math.abs(Math.log2(v2) - Math.log2(base || 1 / 4));
    if (d2 < bd) {
      bd = d2;
      best = name;
    }
  }
  return best;
}
function toMusicXml(lines, opts = {}) {
  const divisions = opts.divisions ?? 24;
  const partId = opts.partId ?? "P1";
  const ticks = (dur) => Math.max(1, Math.round(dur * 4 * divisions));
  let body = "";
  let measureNo = 0;
  let prevFifths = null;
  let prevTime = null;
  let prevClef = null;
  for (const line of lines) {
    const { staff, ctx, notes } = line;
    const timeChanges = timeSignatures(ctx?.time ?? [], staff.stepDistance() * 2);
    let tc = 0;
    const bars = staff.bars.length ? staff.bars : [Object.assign(new Bar(staff), { left: staff.box.left, right: staff.box.right })];
    for (let bi = 0; bi < bars.length; bi++) {
      const bar = bars[bi];
      const inBar = notes.filter((n2) => n2.x >= bar.left && n2.x < bar.right);
      measureNo++;
      let attrs = "";
      if (measureNo === 1) attrs += `<divisions>${divisions}</divisions>`;
      const fifths = ctx ? keyFifths(ctx.key) : 0;
      if (bi === 0 && ctx && fifths !== prevFifths) {
        attrs += `<key><fifths>${fifths}</fifths></key>`;
        prevFifths = fifths;
      }
      while (tc < timeChanges.length && timeChanges[tc].x < bar.right) {
        const t2 = timeChanges[tc++];
        const key = `${t2.beats}/${t2.beatType}`;
        if (key !== prevTime) {
          attrs += `<time><beats>${t2.beats}</beats><beat-type>${t2.beatType}</beat-type></time>`;
          prevTime = key;
        }
      }
      const clef = ctx?.clef ? clefXml(ctx.clef.code) : null;
      if (bi === 0 && clef && clef !== prevClef) {
        attrs += clef;
        prevClef = clef;
      }
      body += `<measure number="${measureNo}">`;
      if (attrs) body += `<attributes>${attrs}</attributes>`;
      body += barlineXml("left", { style: bar.leftStyle, repeat: bar.leftRepeat, ending: bar.endingStart ? bar.endingNumber : null });
      body += emitVoices(inBar, ticks, 0);
      body += barlineXml("right", {
        style: bar.rightStyle,
        repeat: bar.rightRepeat,
        ending: bar.endingStop ? bar.endingNumber : null
      });
      body += `</measure>`;
    }
  }
  return wrapPartwise({
    work: workXml(opts.title),
    partList: scorePartXml(partId),
    body: `<part id="${partId}">${body}</part>`
  });
}
function emitVoices(inBar, ticks, staffNo) {
  const at = (dur) => Math.round(ticks(1) * dur);
  let body = "";
  const voices = [...new Set(inBar.map((n2) => n2.voice))].sort((a, b) => a - b);
  const withVoice = voices.length > 1 || staffNo > 0;
  const voiceBase = staffNo > 0 ? (staffNo - 1) * 4 : 0;
  const timed = inBar.every((n2) => n2.group?.timed);
  const full = timed ? voiceTicks(inBar, ticks) : 0;
  voices.forEach((v2, vi) => {
    const vn = inBar.filter((n2) => n2.voice === v2);
    if (timed) vn.sort((a, b) => a.group.offset - b.group.offset || b.diatonic - a.diatonic);
    const grouped = !timed && vn.every((n2) => n2.group);
    if (grouped) {
      const first = /* @__PURE__ */ new Map();
      vn.forEach((n2, i2) => first.has(n2.group) || first.set(n2.group, i2));
      const idx = new Map(vn.map((n2, i2) => [n2, i2]));
      vn.sort((a, b) => first.get(a.group) - first.get(b.group) || +!!a.chordExtra - +!!b.chordExtra || idx.get(a) - idx.get(b));
    }
    let cur = 0;
    let prev = null;
    for (const n0 of vn) {
      const extra = timed || grouped ? !n0.grace && !!prev && !prev.grace && prev.group === n0.group : !!n0.chordExtra;
      const n2 = extra === !!n0.chordExtra ? n0 : { ...n0, chordExtra: extra || void 0 };
      prev = n0;
      if (timed && !n2.chordExtra && !n2.grace) {
        const off = at(n2.group.offset);
        if (off > cur) {
          body += `<forward><duration>${off - cur}</duration></forward>`;
          cur = off;
        }
      }
      if (n2.chord) body += harmonyXml(n2.chord);
      if (n2.metronome) {
        const [unit, bpm] = n2.metronome.split("=");
        body += `<direction placement="above"><direction-type><metronome><beat-unit>${unit}</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
      }
      for (const w of n2.words ?? [])
        body += `<direction placement="${w.above ? "above" : "below"}"><direction-type><words>${escapeXml(w.text)}</words></direction-type></direction>`;
      if (n2.dynamic)
        body += `<direction placement="below"><direction-type><dynamics><${n2.dynamic}/></dynamics></direction-type></direction>`;
      if (n2.wedgeStop) body += `<direction placement="below"><direction-type><wedge number="1" type="stop"/></direction-type></direction>`;
      if (n2.wedgeStart)
        body += `<direction placement="below"><direction-type><wedge number="1" type="${n2.wedgeStart}"/></direction-type></direction>`;
      body += noteXml(n2, ticks(n2.duration), staffNo, withVoice, voiceBase);
      if (!n2.chordExtra && !n2.grace) cur += ticks(n2.duration);
    }
    if (timed && cur > 0 && cur < full) {
      body += `<forward><duration>${full - cur}</duration></forward>`;
      cur = full;
    }
    if (vi < voices.length - 1 && cur > 0) body += `<backup><duration>${cur}</duration></backup>`;
  });
  return body;
}
function voiceTicks(inBar, ticks) {
  const timed = inBar.every((n2) => n2.group?.timed);
  const at = (dur) => Math.round(ticks(1) * dur);
  let used = 0;
  for (const v2 of new Set(inBar.map((n2) => n2.voice))) {
    const vn = inBar.filter((n2) => n2.voice === v2 && !n2.chordExtra && !n2.grace);
    if (timed) {
      let m2 = 0;
      for (const n2 of vn) m2 = Math.max(m2, at(n2.group.offset) + ticks(n2.duration));
      used = Math.max(used, m2);
    } else used = Math.max(used, vn.reduce((a, n2) => a + ticks(n2.duration), 0));
  }
  return used;
}
function noteXml(n2, dur, staffNo = 0, withVoice = false, voiceBase = 0) {
  const id = currentNoteId?.(n2);
  const xml = noteXmlRaw(n2, dur, staffNo, withVoice, voiceBase);
  return id ? xml.replace(/^<note>/, `<note id="${escapeXml(id)}">`) : xml;
}
function noteXmlRaw(n2, dur, staffNo = 0, withVoice = false, voiceBase = 0) {
  const type = noteType(n2.base);
  const dots = "<dot/>".repeat(n2.dots);
  const staffEl = staffNo ? `<staff>${staffNo}</staff>` : "";
  const voiceEl = withVoice ? `<voice>${n2.voice + voiceBase}</voice>` : "";
  if (n2.rest)
    return `<note><rest/><duration>${dur}</duration>${voiceEl}<type>${type}</type>${dots}${staffEl}</note>`;
  const grace = n2.grace ? "<grace/>" : "";
  const durEl = n2.grace ? "" : `<duration>${dur}</duration>`;
  const chord = n2.chordExtra ? "<chord/>" : "";
  const alter = n2.alter !== 0 ? `<alter>${n2.alter}</alter>` : "";
  const acc = n2.accidental !== null ? `<accidental>${accidentalName(n2.accidental)}</accidental>` : "";
  const stem = n2.stemUp === null ? "" : `<stem>${n2.stemUp ? "up" : "down"}</stem>`;
  const lyric = (n2.lyrics ?? []).map((l2) => lyricXml(l2)).join("") + (n2.lyricExtendStop ?? []).map((l2) => `<lyric number="${l2.verse}"><extend type="stop"/></lyric>`).join("");
  const nots = [];
  if (n2.tieStop) nots.push(`<tied type="stop"/>`);
  if (n2.tieStart) nots.push(n2.tieDashed ? `<tied type="start" line-type="dashed"/>` : `<tied type="start"/>`);
  if (n2.slurStop) nots.push(`<slur type="stop" number="1"/>`);
  if (n2.slurStart) nots.push(n2.slurDashed ? `<slur type="start" number="1" line-type="dashed"/>` : `<slur type="start" number="1"/>`);
  if (n2.tuplet) nots.push(`<tuplet type="start"/>`);
  const arts = [];
  const orns = [];
  let fermata = "";
  let arpeggiate = false;
  for (const m2 of n2.marks ?? []) {
    const a = ARTICULATION[m2];
    if (a) {
      arts.push(a);
      continue;
    }
    if (m2 === "arpeggiato") arpeggiate = true;
    else if (m2.startsWith("fermata")) fermata = `<fermata type="${m2 === "fermataBelow" ? "inverted" : "upright"}"/>`;
    else if (m2.startsWith("ornamentTrill") || m2.startsWith("wiggleTrill")) orns.push(`<trill-mark/>`);
  }
  if (orns.length) nots.push(`<ornaments>${orns.join("")}</ornaments>`);
  if (arts.length) nots.push(`<articulations>${arts.join("")}</articulations>`);
  if (fermata) nots.push(fermata);
  if (arpeggiate) nots.push(`<arpeggiate/>`);
  const notations = nots.length ? `<notations>${nots.join("")}</notations>` : "";
  const timeMod = n2.tuplet ? `<time-modification><actual-notes>${n2.tuplet.actual}</actual-notes><normal-notes>${n2.tuplet.normal}</normal-notes></time-modification>` : "";
  const tie = (n2.tieStop ? `<tie type="stop"/>` : "") + (n2.tieStart ? `<tie type="start"/>` : "");
  const head = n2.slash ? `<notehead>slash</notehead>` : "";
  return `<note>${grace}${chord}<pitch><step>${escapeXml(n2.step)}</step>${alter}<octave>${n2.octave}</octave></pitch>${durEl}${tie}${voiceEl}<type>${type}</type>${dots}${acc}${timeMod}${stem}${head}${staffEl}${notations}${lyric}</note>`;
}
const ARTICULATION = {
  articAccentAbove: "<accent/>",
  articAccentBelow: "<accent/>",
  articStaccatoAbove: "<staccato/>",
  articStaccatoBelow: "<staccato/>",
  articTenutoAbove: "<tenuto/>",
  articTenutoBelow: "<tenuto/>",
  articStaccatissimoAbove: "<staccatissimo/>",
  articStaccatissimoBelow: "<staccatissimo/>",
  articMarcatoAbove: "<strong-accent/>",
  articMarcatoBelow: "<strong-accent/>",
  articAccentStaccatoAbove: "<accent/><staccato/>",
  articAccentStaccatoBelow: "<accent/><staccato/>",
  articTenutoStaccatoAbove: "<tenuto/><staccato/>",
  articTenutoStaccatoBelow: "<tenuto/><staccato/>",
  breathMarkComma: "<breath-mark/>",
  caesura: "<caesura/>"
};
function lyricXml(l2) {
  const syllabic = l2.cont ? l2.hyphen ? "middle" : "end" : l2.hyphen ? "begin" : "single";
  return `<lyric number="${l2.verse}"><syllabic>${syllabic}</syllabic><text>${escapeXml(l2.text)}</text>${l2.extend ? '<extend type="start"/>' : ""}</lyric>`;
}
function accidentalName(alter) {
  switch (alter) {
    case -2:
      return "flat-flat";
    case -1:
      return "flat";
    case 1:
      return "sharp";
    case 2:
      return "double-sharp";
    default:
      return "natural";
  }
}
function clefXml(code) {
  switch (code) {
    case "fClef":
      return `<clef><sign>F</sign><line>4</line></clef>`;
    case "fClef8vb":
      return `<clef><sign>F</sign><line>4</line><clef-octave-change>-1</clef-octave-change></clef>`;
    case "cClef":
      return `<clef><sign>C</sign><line>3</line></clef>`;
    case "gClef8vb":
      return `<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>`;
    case "gClef8va":
      return `<clef><sign>G</sign><line>2</line><clef-octave-change>1</clef-octave-change></clef>`;
    case "unpitchedPercussionClef1":
    case "unpitchedPercussionClef2":
      return `<clef><sign>percussion</sign></clef>`;
    default:
      return `<clef><sign>G</sign><line>2</line></clef>`;
  }
}
function scoreToMusicXml(score, notesOf, opts = {}) {
  currentNoteId = opts.noteId ?? null;
  try {
    return scoreToMusicXmlRaw(score, notesOf, opts);
  } finally {
    currentNoteId = null;
  }
}
function scoreToMusicXmlRaw(score, notesOf, opts) {
  const divisions = opts.divisions ?? 24;
  const ticks = (dur) => Math.max(1, Math.round(dur * 4 * divisions));
  const partList = [];
  const bodies = [];
  score.parts.forEach((part, pi) => {
    const id = `P${pi + 1}`;
    partList.push(scorePartXml(id));
    let body = "";
    let measureNo = 0;
    let prevFifths = null;
    let prevTime = null;
    let prevClef = [];
    score.systems.forEach((entry, si) => {
      const staves = part.scoreStaves.map((ss) => ss.staves[si]);
      const lead = staves.find((x) => x) ?? null;
      if (!lead) return;
      const barCount = Math.max(...staves.map((st) => st?.bars.length ?? 0));
      const ctx = entry.ctx.get(lead);
      const timeChanges = timeSignatures(ctx?.time ?? [], lead.stepDistance() * 2);
      let tc = 0;
      for (let bi = 0; bi < barCount; bi++) {
        measureNo++;
        let attrs = "";
        if (measureNo === 1) attrs += `<divisions>${divisions}</divisions>`;
        const fifths = ctx ? keyFifths(ctx.key) : 0;
        if (bi === 0 && ctx && fifths !== prevFifths) {
          attrs += `<key><fifths>${fifths}</fifths></key>`;
          prevFifths = fifths;
        }
        const bar0 = lead.bars[bi];
        while (bar0 && tc < timeChanges.length && timeChanges[tc].x < bar0.right) {
          const t2 = timeChanges[tc++];
          const k2 = `${t2.beats}/${t2.beatType}`;
          if (k2 !== prevTime) {
            attrs += `<time><beats>${t2.beats}</beats><beat-type>${t2.beatType}</beat-type></time>`;
            prevTime = k2;
          }
        }
        if (bi === 0) {
          const clefs = staves.map((st) => st ? clefXml(entry.ctx.get(st)?.clef?.code ?? "gClef") : "");
          if (clefs.join("|") !== prevClef.join("|")) {
            if (staves.length > 1) attrs += `<staves>${staves.length}</staves>`;
            clefs.forEach((c2, k2) => {
              if (!c2) return;
              attrs += staves.length > 1 ? c2.replace("<clef>", `<clef number="${k2 + 1}">`) : c2;
            });
            prevClef = clefs;
          }
        }
        body += `<measure number="${measureNo}">`;
        if (attrs) body += `<attributes>${attrs}</attributes>`;
        if (bar0)
          body += barlineXml("left", {
            style: bar0.leftStyle,
            repeat: bar0.leftRepeat,
            ending: bar0.endingStart ? bar0.endingNumber : null
          });
        staves.forEach((st, k2) => {
          if (!st) return;
          const bar = st.bars[bi];
          if (!bar) return;
          const inBar = notesOf(st).filter((n2) => n2.x >= bar.left && n2.x < bar.right);
          body += emitVoices(inBar, ticks, staves.length > 1 ? k2 + 1 : 0);
          const used = voiceTicks(inBar, ticks);
          if (k2 < staves.length - 1 && used > 0) body += `<backup><duration>${used}</duration></backup>`;
        });
        if (bar0)
          body += barlineXml("right", {
            style: bar0.rightStyle,
            repeat: bar0.rightRepeat,
            ending: bar0.endingStop ? bar0.endingNumber : null
          });
        body += `</measure>`;
      }
    });
    bodies.push(`<part id="${id}">${body}</part>`);
  });
  return wrapPartwise({
    work: workXml(opts.title),
    partList: partList.join(""),
    body: bodies.join("\n")
  });
}
function objText(o) {
  return o.run ? o.run.glyphs.map((g2) => g2.unicode).join("") : "";
}
function collectTexts(pg) {
  const texts = [];
  for (const o of pg.objs) {
    if (!o.run) continue;
    if (o.symbols.length) continue;
    let inStaff = false;
    const cy2 = (o.box.top + o.box.bottom) / 2;
    for (const st of pg.staves) {
      if (Math.abs(st.middleStep(cy2)) <= 4) {
        inStaff = true;
        break;
      }
    }
    if (inStaff) continue;
    texts.push(o);
  }
  const hlines = pg.segs.filter((s) => s.isH && !s.hasAnyTag()).map((s) => s.box);
  return { texts, hlines };
}
const isStepChar = (c2) => c2 >= "A" && c2 <= "G";
const CHORD_TOKEN_RE = /^[A-G][#♯b♭]?(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:sus\d*|add\d*)?(?:\/[A-G][#♯b♭]?)?/;
function analyzeText(pg) {
  const { texts, hlines } = collectTexts(pg);
  const kind = /* @__PURE__ */ new Map();
  const sp = pg.normalStaffSpace || pg.space;
  for (const t2 of texts) {
    if (kind.has(t2)) continue;
    const raw = objText(t2).replace(/\s+/g, "");
    if (!raw) continue;
    const m2 = CHORD_TOKEN_RE.exec(raw);
    if (m2 && m2[0].length === raw.length) kind.set(t2, "harmony");
  }
  for (const t2 of texts) {
    if (kind.has(t2)) continue;
    for (const [h2, k2] of kind) {
      if (k2 !== "harmony") continue;
      if (!overlapY(t2.box, h2.box)) continue;
      const dist = t2.box.left - h2.box.right;
      const hh = h2.box.bottom - h2.box.top;
      if (dist < -hh / 4 || dist > Math.max(hh / 2, 2 * sp)) continue;
      kind.set(t2, "harmony");
      break;
    }
  }
  const cys = [];
  for (const t2 of texts) {
    const s = objText(t2);
    if (!s.includes("-")) continue;
    if (/[0-9]/.test(s)) continue;
    cys.push((t2.box.top + t2.box.bottom) / 2);
    kind.set(t2, "lyric");
  }
  for (const l2 of hlines) cys.push(l2.top);
  for (const t2 of texts) {
    if (kind.has(t2)) continue;
    if (cys.some((y) => between$1(t2.box.top, t2.box.bottom, y))) kind.set(t2, "lyric");
  }
  const known = texts.filter((t2) => kind.get(t2) === "lyric" && t2.run);
  if (known.length) {
    const staffAbove = (t2) => {
      let best = null;
      for (const st of pg.staves) {
        if (st.box.bottom > (t2.box.top + t2.box.bottom) / 2) continue;
        if (!best || st.box.bottom > best.box.bottom) best = st;
      }
      return best;
    };
    const fonts = new Set(known.map((t2) => t2.run.font));
    const sizes = known.map((t2) => t2.run.sizeDev).sort((a, b) => a - b);
    const size = sizes[sizes.length >> 1];
    let maxOff = 0;
    for (const t2 of known) {
      const st = staffAbove(t2);
      if (st) maxOff = Math.max(maxOff, t2.box.top - st.box.bottom);
    }
    if (maxOff > 0) {
      for (const t2 of texts) {
        if (kind.has(t2) || !t2.run) continue;
        if (!fonts.has(t2.run.font)) continue;
        if (Math.abs(t2.run.sizeDev - size) > size * 0.05) continue;
        const st = staffAbove(t2);
        if (!st) continue;
        const off = t2.box.top - st.box.bottom;
        if (off < 0 || off > maxOff + sp) continue;
        const next = pg.staves.find((q2) => q2.box.top > st.box.bottom && q2.box.top < t2.box.bottom);
        if (next) continue;
        kind.set(t2, "lyric");
      }
    }
  }
  for (const t2 of texts) {
    if (kind.has(t2)) continue;
    let s = objText(t2);
    let harm = s.includes("/");
    if (s.endsWith(" ")) s = s.slice(0, -1);
    if (s.length === 1 && isStepChar(s)) harm = true;
    if (s.length === 3 && s[1] === " " && isStepChar(s[0]) && isStepChar(s[2])) harm = true;
    if (harm) kind.set(t2, "harmony");
  }
  for (const l2 of pg.segsWithTag("SysLine")) {
    for (const t2 of texts) {
      if (kind.has(t2)) continue;
      if (t2.box.left > l2.box.right) continue;
      if (!overlapY(l2.box, t2.box)) continue;
      if (xSpace(l2.box, t2.box) > 6 * sp) continue;
      kind.set(t2, "instrument");
    }
  }
  for (const eq of pg.objs) {
    if (!eq.run || eq.hasAnyTag() || kind.has(eq)) continue;
    if (!objText(eq).includes("=")) continue;
    const row = pg.objs.filter((o) => o.run && overlapY(o.box, eq.box)).sort((a, b) => a.box.left - b.box.left);
    const idx = row.indexOf(eq);
    if (idx < 0) continue;
    let first = idx;
    for (let i2 = idx; i2 > 0; i2--) {
      if (xSpace(row[i2].box, row[i2 - 1].box) > 3 * sp) break;
      first = i2 - 1;
    }
    let last = idx;
    for (let i2 = idx; i2 < row.length - 1; i2++) {
      if (xSpace(row[i2].box, row[i2 + 1].box) > 3 * sp) break;
      last = i2 + 1;
    }
    for (let i2 = first; i2 <= last; i2++) if (!kind.has(row[i2])) kind.set(row[i2], "tempo");
  }
  for (const t2 of texts) {
    if (kind.has(t2)) continue;
    if (EXPRESSIONS.has(objText(t2).trim().toLowerCase())) kind.set(t2, "expression");
  }
  const syslines = pg.segsWithTag("SysLine");
  for (const o of pg.objs) {
    if (!o.run || o.hasAnyTag() || kind.has(o)) continue;
    const s = objText(o).trim();
    if (!/^[\d-]+$/.test(s)) continue;
    for (const l2 of syslines) {
      if (!overlapX(o.box, l2.box)) continue;
      if (ySpace(o.box, l2.box) > 3 * sp) continue;
      kind.set(o, "measureNumber");
      break;
    }
  }
  for (const o of pg.objs) {
    if (o.hasAnyTag() || !o.path) continue;
    if (!o.path.paint.toLowerCase().includes("stroke")) continue;
    if (o.path.curves) continue;
    const inside = texts.filter((t2) => !kind.has(t2) && overlapX(t2.box, o.box) && overlapY(t2.box, o.box));
    if (!inside.length) continue;
    for (const t2 of inside) kind.set(t2, "boxed");
  }
  const poss = pg.objs.filter((o) => o.run && !o.hasAnyTag() && !kind.has(o) && !o.symbols.length).sort((a, b) => a.box.top - b.box.top);
  const usedIdx = /* @__PURE__ */ new Set();
  for (let i2 = 0; i2 < poss.length; i2++) {
    if (usedIdx.has(i2)) continue;
    const arr = [i2];
    let boxI = poss[i2].box;
    let cxI = (boxI.left + boxI.right) / 2;
    const szI = poss[i2].run.sizeDev;
    const fnI = poss[i2].run.font;
    for (let j2 = i2 + 1; j2 < poss.length; j2++) {
      if (usedIdx.has(j2)) continue;
      if (Math.abs(szI - poss[j2].run.sizeDev) > sp / 10) continue;
      if (fnI !== poss[j2].run.font) continue;
      const boxJ = poss[j2].box;
      const cxJ = (boxJ.left + boxJ.right) / 2;
      if (ySpace(boxJ, boxI) > 2 * sp) continue;
      if (Math.abs(boxI.left - boxJ.left) < sp || Math.abs(boxI.right - boxJ.right) < sp || Math.abs(cxI - cxJ) < sp) {
        arr.push(j2);
        boxI = boxJ;
        cxI = cxJ;
      }
    }
    if (arr.length <= 1) continue;
    for (const k2 of arr) {
      usedIdx.add(k2);
      kind.set(poss[k2], "textFrame");
    }
  }
  const out = { lyric: [], harmony: [], tempo: [], expression: [], instrument: [], measureNumber: [], boxed: [], textFrame: [] };
  const TAG = {
    lyric: "Lyric",
    harmony: "Harmony",
    tempo: "Tempo",
    expression: "Expression",
    instrument: "Instrument",
    measureNumber: "MeasureNumber",
    boxed: "Boxed",
    textFrame: "TextFrame"
  };
  for (const [o, k2] of kind) {
    out[k2].push(o);
    o.addTag(TAG[k2]);
  }
  return out;
}
const EXPRESSIONS = new Set(
  [
    "a tempo",
    "unis.",
    "cresc.",
    "sub.",
    "sim.",
    "l.h.",
    "r.h.",
    "rubato",
    "cresc. al fine",
    "no rit.",
    "poco rit.",
    "dim. e rit.",
    "molto rall.",
    "molto rit.",
    "poco rall.",
    "rit.",
    "n.c.",
    "s.a.",
    "t.b.",
    "rall.",
    "cresc. poco a poco",
    "driving to the end",
    "slightly slower",
    "slightly broader",
    "with great rejoicing",
    "soprano",
    "alto",
    "freely",
    "slowly",
    "with motion",
    "s.a. unison",
    "t.b. unison",
    "c instrument",
    "expressively",
    "handbells",
    "tambourine",
    "gradually building",
    "(a few sopranos)",
    "(l.h. over)"
  ].map((s) => s.toLowerCase())
);
function dedupeSyllables(list) {
  const out = [];
  for (const s of list) {
    const prev = out[out.length - 1];
    if (prev && prev.text === s.text && Math.abs(prev.cx - s.cx) < (s.right - s.left) * 0.3) continue;
    out.push(s);
  }
  return out;
}
function isKnownChar(c2) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff01-\uff65\x20-\x7e]/.test(c2);
}
function splitSyllables(o, dict) {
  const run = o.run;
  if (!run) return [];
  const em = run.sizeDev || 1;
  const synth = run.font.startsWith("#");
  const out = [];
  let cur = null;
  const flush = (hyphen) => {
    if (!cur) return;
    const text = cur.chars.join("").trim();
    if (text && !/^[-_–—]+$/.test(text) && !/^\d+[.．、]?$/.test(text)) {
      out.push({ text, cx: (cur.left + cur.right) / 2, left: cur.left, right: cur.right, hyphen, glyphs: cur.glyphs, font: run.font, sizeDev: run.sizeDev });
    }
    cur = null;
  };
  for (const g2 of run.glyphs) {
    const c2 = dict ? dict.lookup(run.font, g2) : g2.unicode;
    if (c2 && !isKnownChar(c2) && g2.bbox.w < em * 0.5 && g2.bbox.h < em * 0.5) {
      flush(false);
      continue;
    }
    if (!synth && !g2.bboxEstimated && g2.bbox.w >= em * 0.8 && g2.bbox.h >= em * 0.8 && c2 && /^[\x20-\x7e]$/.test(c2)) {
      flush(false);
      continue;
    }
    if (!c2 || c2 === " " || c2 === "　") {
      flush(false);
      continue;
    }
    if (c2 === "-" || c2 === "–" || c2 === "—") {
      flush(true);
      continue;
    }
    if (c2 === "_") {
      flush(false);
      continue;
    }
    const cjk = /[㐀-鿿豈-﫿＀-￯]/.test(c2);
    if (cjk) {
      flush(false);
      out.push({ text: c2, cx: g2.bbox.x + g2.bbox.w / 2, left: g2.bbox.x, right: g2.bbox.x + g2.bbox.w, hyphen: false, glyphs: [g2], font: run.font, sizeDev: run.sizeDev });
      continue;
    }
    if (!cur) cur = { chars: [], left: g2.bbox.x, right: g2.bbox.x + g2.bbox.w, glyphs: [] };
    cur.chars.push(c2);
    cur.glyphs.push(g2);
    cur.right = g2.bbox.x + g2.bbox.w;
  }
  flush(false);
  return out;
}
function buildLyricLines(pg, lyrics, dict) {
  const rows = [];
  const synth = (o) => !!o.run?.font.startsWith("#");
  const latin = (o) => {
    const t2 = objText(o);
    return (t2.match(/[A-Za-z]/g)?.length ?? 0) > (t2.match(/[\u3400-\u9fff]/g)?.length ?? 0) * 3;
  };
  for (const o of lyrics.slice().sort((a, b) => a.box.top - b.box.top)) {
    const row = rows.find((r4) => {
      const ov = Math.min(r4.bottom, o.box.bottom) - Math.max(r4.top, o.box.top);
      if (!synth(o) || !r4.objs.every(synth)) return ov > 0;
      return ov > Math.min(r4.bottom - r4.top, o.box.bottom - o.box.top) * 0.5 && r4.objs.every((q2) => latin(q2) === latin(o));
    });
    if (row) {
      row.objs.push(o);
      row.top = Math.min(row.top, o.box.top);
      row.bottom = Math.max(row.bottom, o.box.bottom);
    } else rows.push({ top: o.box.top, bottom: o.box.bottom, objs: [o] });
  }
  const byStaff = /* @__PURE__ */ new Map();
  const maxGap = Math.max(...pg.staves.map((s) => s.box.bottom - s.box.top), 1) * 3;
  const chainGap = maxGap / 3 * 0.8;
  for (const r4 of rows) {
    let best = null;
    let bestD = Infinity;
    for (const st of pg.staves) {
      const d2 = r4.top - st.box.bottom;
      if (d2 < 0) continue;
      if (d2 < bestD) {
        bestD = d2;
        best = st;
      }
    }
    if (!best) continue;
    const a = byStaff.get(best) ?? [];
    if (bestD > maxGap) {
      const prev = a[a.length - 1];
      if (!prev || r4.top - prev.bottom > chainGap) continue;
      if (!r4.objs.every((o) => o.run?.font.startsWith("#"))) continue;
    }
    a.push({ top: r4.top, bottom: r4.bottom, objs: r4.objs });
    byStaff.set(best, a);
  }
  const out = [];
  for (const [staff, rs] of byStaff) {
    rs.sort((a, b) => a.top - b.top);
    rs.forEach((r4, i2) => {
      const syllables = dedupeSyllables(r4.objs.flatMap((o) => splitSyllables(o, dict)).sort((a, b) => a.cx - b.cx));
      if (syllables.length) out.push({ staff, verse: i2 + 1, top: r4.top, syllables });
    });
  }
  return out;
}
function attachLyrics(notes, lines, sameCol = 0) {
  for (const line of lines) {
    const cand = notes.filter((n2) => n2.staff === line.staff && !n2.rest).sort((a, b) => a.x - b.x);
    if (!cand.length) continue;
    let ni = 0;
    let cont = false;
    for (const syl of line.syllables) {
      for (let j2 = ni + 1; j2 < cand.length && cand[j2].x - syl.cx <= Math.abs(cand[ni].x - syl.cx); j2++)
        if (Math.abs(cand[j2].x - syl.cx) < Math.abs(cand[ni].x - syl.cx)) ni = j2;
      const n2 = cand[ni];
      (n2.lyrics ??= []).push({ verse: line.verse, text: syl.text, hyphen: syl.hyphen, cont });
      cont = syl.hyphen;
      while (sameCol > 0 && ni + 1 < cand.length && Math.abs(cand[ni + 1].x - n2.x) < sameCol) ni++;
      if (ni + 1 < cand.length) ni++;
    }
  }
}
function attachHarmonies(pg, notes, harmonies, merge = true) {
  const sp = pg.normalStaffSpace || pg.space;
  const rows = [];
  for (const o of harmonies.slice().sort((a, b) => a.box.top - b.box.top)) {
    const row = rows.find((r4) => o.box.top < r4.bottom && r4.top < o.box.bottom);
    if (row) {
      row.objs.push(o);
      row.top = Math.min(row.top, o.box.top);
      row.bottom = Math.max(row.bottom, o.box.bottom);
    } else rows.push({ top: o.box.top, bottom: o.box.bottom, objs: [o] });
  }
  const groups = [];
  for (const row of rows) {
    row.objs.sort((a, b) => a.box.left - b.box.left);
    let last = null;
    for (const o of row.objs) {
      const t2 = objText(o).trim();
      if (!t2) continue;
      if (merge && last && o.box.left - last.box.right < 2 * sp) {
        last.text += t2;
        last.box = {
          left: last.box.left,
          right: Math.max(last.box.right, o.box.right),
          top: Math.min(last.box.top, o.box.top),
          bottom: Math.max(last.box.bottom, o.box.bottom)
        };
      } else {
        last = { text: t2, box: { ...o.box } };
        groups.push(last);
      }
    }
  }
  for (const s of pg.symbols) {
    if (s.code !== "accidentalFlat" && s.code !== "accidentalSharp") continue;
    if (s.hasTag("Key") || s.hasTag("Accidental")) continue;
    const g2 = groups.find((q2) => overlapY(q2.box, s.box) && s.box.left >= q2.box.left && s.box.left - q2.box.right < sp);
    if (!g2) continue;
    g2.text = g2.text.slice(0, 1) + (s.code === "accidentalFlat" ? "b" : "#") + g2.text.slice(1);
    g2.box.right = Math.max(g2.box.right, s.box.right);
  }
  for (const g2 of groups) {
    const text = g2.text.replace(/\s+/g, "");
    if (!text) continue;
    let staff = null;
    let staffD = Infinity;
    for (const st of pg.staves) {
      const d2 = st.box.top - g2.box.bottom;
      if (d2 < 0 || d2 >= staffD) continue;
      staffD = d2;
      staff = st;
    }
    if (!staff) continue;
    const cands = notes.filter((n2) => n2.staff === staff && Math.abs(n2.x - g2.box.left) < sp * 6).sort((a, b) => Math.abs(a.x - g2.box.left) - Math.abs(b.x - g2.box.left));
    const best = cands.find((n2) => !n2.chord);
    if (best) best.chord = text;
  }
}
const textClassId = (font, key) => font + "|" + key;
function glyphSig(g2) {
  return g2.outline && g2.outline.length ? encodeSig(shapeSig(g2.outline)) : void 0;
}
function glyphClassKey(font, g2) {
  if (!g2.outline || !g2.outline.length) return null;
  return textClassId(font, shapeKey(g2.outline));
}
class TextGlyphBuilder {
  map = /* @__PURE__ */ new Map();
  add(font, g2, sizeDev, dPath) {
    const id = glyphClassKey(font, g2);
    if (!id) return;
    let c2 = this.map.get(id);
    if (!c2) {
      c2 = {
        font,
        key: id.slice(font.length + 1),
        char: null,
        source: null,
        count: 0,
        uni: g2.unicode,
        w: sizeDev > 0 ? g2.bbox.w / sizeDev : 0,
        h: sizeDev > 0 ? g2.bbox.h / sizeDev : 0,
        d: dPath(),
        sig: g2.outline ? encodeSig(shapeSig(g2.outline)) : void 0,
        votes: /* @__PURE__ */ new Map()
      };
      this.map.set(id, c2);
    }
    c2.count++;
  }
  /**
   * 登记一次出现（还没见过就按 id 建一个空壳，见过就计数加一）。
   * 建库那一路是先跑完识别拿到 id，再回头投票，所以要能只按 id 登记。
   *
   * `meta` 里的签名与宽高是**形近补字**（`fuzzyFill`）要用的：不带过来的话
   * 所有类都没有签名，那一步一个也补不出来。
   */
  ensure(id, meta) {
    const had = this.map.get(id);
    if (had) {
      had.count++;
      if (!had.sig && meta?.sig) {
        had.sig = meta.sig;
        had.w = meta.w ?? had.w;
        had.h = meta.h ?? had.h;
      }
      return;
    }
    const i2 = id.indexOf("|");
    this.map.set(id, {
      font: id.slice(0, i2),
      key: id.slice(i2 + 1),
      char: null,
      source: null,
      count: 1,
      uni: meta?.uni ?? "",
      w: meta?.w ?? 0,
      h: meta?.h ?? 0,
      d: "",
      sig: meta?.sig,
      votes: /* @__PURE__ */ new Map()
    });
  }
  /** 给某个类投一票（GT 自举）。 */
  vote(id, char) {
    const c2 = this.map.get(id);
    if (!c2) return;
    c2.votes.set(char, (c2.votes.get(char) ?? 0) + 1);
  }
  has(id) {
    return this.map.has(id);
  }
  /**
   * 定案。**两档规则**：
   *
   *   · **全票**（只投出过一个字）——一两票也认。汉字在一首歌里多半只出现一两次，
   *     要求票多的话覆盖率上不去；而对齐本身已经在段一级筛过了。
   *   · **多数票**：票数够（`minVotes`）且最高票占到 `minShare` 以上。
   *     只用「全票」那一档的话，常用字反而定不了案——它们在很多首歌里出现，
   *     偶尔一次对齐错位就投出一票杂音，把全票破掉
   *     （实测「永:12 遠:3 投:1」这种明确的多数票被 0.8 的门槛挡在外面）。
   *
   * 默认 2 票 / 六成是扫出来的：三票门槛少认 20 类（歌词档 81.3% → 80.7%），
   * 七成门槛少认 25 类（79.4%），五成与六成打平。
   *
   * @param minVotes  走多数票那一档至少要几票
   * @param minShare  走多数票那一档最高票要占的比例
   */
  finish(book, minVotes = 2, minShare = 0.6) {
    const classes = [];
    for (const c2 of this.map.values()) {
      const { votes, ...rest } = c2;
      const total = [...votes.values()].reduce((a, b) => a + b, 0);
      const best = [...votes].sort((a, b) => b[1] - a[1])[0];
      const out = { ...rest };
      out.tally = [...votes].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const unanimous = best && best[1] === total;
      const majority = best && best[1] >= minVotes && best[1] / total >= minShare;
      if (unanimous || majority) {
        out.char = best[0];
        out.source = "gt";
      }
      classes.push(out);
    }
    classes.sort((a, b) => b.count - a.count);
    return { book, classes };
  }
}
class TextGlyphLookup {
  map = /* @__PURE__ */ new Map();
  masks = /* @__PURE__ */ new Map();
  /** 字典里没有的贴图字读成什么。默认空串（= 不吐字）；
   *  建库那一路（`scripts/gen-staffmasks.mjs`）传一个占位汉字，好让它在歌词行里占住位子去对 GT。 */
  maskPlaceholder;
  constructor(dict, maskPlaceholder = "") {
    for (const c2 of dict.classes) if (c2.char) this.map.set(textClassId(c2.font, c2.key), c2.char);
    for (const [k2, v2] of Object.entries(dict.masks ?? {})) this.masks.set(k2, v2);
    this.maskPlaceholder = maskPlaceholder;
  }
  get size() {
    return this.map.size;
  }
  lookup(font, g2) {
    if (g2.maskSig) return this.masks.get(g2.maskSig) ?? this.maskPlaceholder;
    const id = glyphClassKey(font, g2);
    if (!id) return g2.unicode;
    return this.map.get(id) ?? g2.unicode;
  }
}
function fuzzyFill(dict, maxDist = 60) {
  const known = [];
  for (const c2 of dict.classes) {
    if (!c2.char || !c2.sig) continue;
    known.push({ font: c2.font, w: c2.w, h: c2.h, sig: decodeSig(c2.sig), char: c2.char });
  }
  let n2 = 0;
  for (const c2 of dict.classes) {
    if (c2.char || !c2.sig) continue;
    const sig = decodeSig(c2.sig);
    let best = null;
    let bestD = maxDist;
    for (const k2 of known) {
      if (k2.font !== c2.font) continue;
      if (Math.abs(k2.w - c2.w) > 0.08 || Math.abs(k2.h - c2.h) > 0.08) continue;
      const d2 = sigDistance(k2.sig, sig);
      if (d2 < bestD) {
        bestD = d2;
        best = k2.char;
      }
    }
    if (!best) continue;
    c2.char = best;
    c2.source = "fuzzy";
    n2++;
  }
  return n2;
}
function findWedges(pg) {
  const sp = pg.normalStaffSpace || pg.space;
  const out = [];
  const lines = [];
  for (const o of pg.objs) {
    if (o.hasAnyTag() || !o.path) continue;
    const pts = pathPoints(o.path);
    if (pts.length === 2) {
      const dy = Math.abs(pts[0].y - pts[1].y);
      const dx = Math.abs(pts[0].x - pts[1].x);
      if (dy < 0.02 || dx < 0.02) continue;
      if (dy > 0.2 * dx) continue;
      lines.push(o);
      continue;
    }
    if (pts.length !== 3) continue;
    o.addTag("Wedge");
    out.push(o);
  }
  const done = /* @__PURE__ */ new Set();
  for (let i2 = 0; i2 < lines.length; i2++) {
    if (done.has(lines[i2])) continue;
    for (let j2 = i2 + 1; j2 < lines.length; j2++) {
      if (done.has(lines[j2])) continue;
      if (!overlapX(lines[i2].box, lines[j2].box)) continue;
      if (ySpace(lines[i2].box, lines[j2].box) > sp * 2) continue;
      if (Math.abs(lines[i2].box.left - lines[j2].box.left) > sp / 2) continue;
      lines[i2].addTag("Wedge");
      lines[j2].addTag("Wedge");
      done.add(lines[i2]);
      done.add(lines[j2]);
      out.push(lines[i2], lines[j2]);
      break;
    }
  }
  return out;
}
function findSlurs(pg) {
  const syslines = pg.segsWithTag("SysLine");
  const sp = pg.normalStaffSpace || pg.space;
  const out = [];
  for (const o of pg.objs) {
    if (o.hasAnyTag()) continue;
    const p2 = o.path;
    if (!p2) continue;
    if (!p2.curves && p2.segs < 12) continue;
    const w = o.box.right - o.box.left;
    const h2 = o.box.bottom - o.box.top;
    if (w < sp * 0.9 || w < h2 * 1.5) continue;
    let isBracket = false;
    for (const l2 of syslines) {
      if (o.box.bottom < l2.box.top || l2.box.bottom < o.box.top) continue;
      if (o.box.left < l2.box.left) {
        isBracket = true;
        break;
      }
    }
    if (isBracket) {
      o.addTag("Bracket");
      continue;
    }
    const arc = arcOf(o);
    if (!arc) continue;
    o.addTag("Slur");
    out.push(arc);
  }
  return out;
}
function mergeArcHalves(arcs, sp) {
  const tol = sp * 0.2;
  const sorted = arcs.slice().sort((a, b) => a.lx - b.lx);
  const used = /* @__PURE__ */ new Set();
  const out = [];
  const joins = (a, b) => {
    if (b.above !== a.above) return false;
    if (Math.abs(b.lx - a.rx) > tol || Math.abs(b.ly - a.ry) > tol) return false;
    return a.above ? a.ry < a.ly && b.ry > b.ly : a.ry > a.ly && b.ry < b.ly;
  };
  for (const a of sorted) {
    if (used.has(a)) continue;
    used.add(a);
    const cur = { ...a };
    for (; ; ) {
      const b = sorted.find((q2) => !used.has(q2) && joins(cur, q2));
      if (!b) break;
      used.add(b);
      cur.rx = b.rx;
      cur.ry = b.ry;
    }
    out.push(cur);
  }
  return out;
}
function arcOf(o) {
  const pts = pathPoints(o.path);
  if (pts.length < 4) return null;
  let li = 0;
  let ri = 0;
  for (let i2 = 1; i2 < pts.length; i2++) {
    if (pts[i2].x < pts[li].x) li = i2;
    if (pts[i2].x > pts[ri].x) ri = i2;
  }
  let above = true;
  const x0 = pts[li].x;
  const y0 = pts[li].y;
  const x1 = pts[ri].x;
  const y1 = pts[ri].y;
  if (x1 > x0) {
    let far = 0;
    for (const p2 of pts) {
      const yLine = y0 + (y1 - y0) * (p2.x - x0) / (x1 - x0);
      const d2 = p2.y - yLine;
      if (Math.abs(d2) > Math.abs(far)) far = d2;
    }
    above = far < 0;
  }
  return { obj: o, lx: pts[li].x, ly: pts[li].y, rx: pts[ri].x, ry: pts[ri].y, above, tie: false };
}
const SLUR_REACH = 3;
function validateSlurNote(isEnd, nt, px, py, sp, above) {
  if (py < nt.top - sp * SLUR_REACH) return null;
  if (py > nt.bottom + sp * SLUR_REACH) return null;
  let dy;
  if (py < nt.top) {
    dy = nt.top - py;
    if (!above) return null;
  } else if (py > nt.bottom) {
    dy = py - nt.bottom;
    if (above) return null;
  } else {
    dy = 0;
  }
  let dx;
  if (isEnd) {
    if (px > nt.right) return null;
    if (px < nt.left - 4 * sp) return null;
    dx = px - nt.left;
  } else {
    if (px < nt.left) return null;
    if (px > nt.right + 4 * sp) return null;
    dx = px - nt.right;
  }
  return dx * dx + dy * dy;
}
function attachSlurs(arcs, notes, sp) {
  const pitched = notes.filter((n2) => !n2.rest);
  for (const sl of arcs) {
    let bestL;
    let bestR;
    let dl = Infinity;
    let dr = Infinity;
    for (const nt of pitched) {
      const b = nt.sym.box;
      const vl = validateSlurNote(false, b, sl.lx, sl.ly, sp, sl.above);
      const vr = validateSlurNote(true, b, sl.rx, sl.ry, sp, sl.above);
      if (vl !== null && vl < dl) {
        dl = vl;
        bestL = nt;
      }
      if (vr !== null && vr < dr) {
        dr = vr;
        bestR = nt;
      }
    }
    if (bestL && bestL === bestR) {
      if (bestL.sym.box.left > sl.rx) bestL = void 0;
      if (bestR && bestR.sym.box.right < sl.lx) bestR = void 0;
    }
    sl.from = bestL;
    sl.to = bestR;
    if (bestL && bestR && bestL.staff === bestR.staff && bestL.diatonic === bestR.diatonic) sl.tie = true;
  }
}
function reconnectSlurs(pg, arcs) {
  const order = new Map(pg.staves.map((s, i2) => [s, i2]));
  const staffOf = (a) => (a.from ?? a.to)?.staff;
  const dangRight = arcs.filter((a) => a.from && !a.to);
  const dangLeft = arcs.filter((a) => !a.from && a.to);
  const used = /* @__PURE__ */ new Set();
  for (const a of dangRight) {
    const sa = staffOf(a);
    if (sa === void 0) continue;
    const ia = order.get(sa) ?? -1;
    let best;
    for (const b of dangLeft) {
      if (used.has(b)) continue;
      const sb = staffOf(b);
      if (sb === void 0) continue;
      if ((order.get(sb) ?? -1) !== ia + 1) continue;
      best = b;
      break;
    }
    if (!best) continue;
    a.to = best.to;
    best.from = void 0;
    best.to = void 0;
    used.add(best);
    if (a.from && a.to && a.from.diatonic === a.to.diatonic) a.tie = true;
  }
}
function markSlurNotes(arcs) {
  for (const sl of arcs) {
    if (sl.from) {
      if (sl.tie) sl.from.tieStart = true;
      else sl.from.slurStart = true;
      if (sl.dashed) {
        if (sl.tie) sl.from.tieDashed = true;
        else sl.from.slurDashed = true;
      }
    }
    if (sl.to) {
      if (sl.tie) sl.to.tieStop = true;
      else sl.to.slurStop = true;
    }
  }
}
const NOTATION_CODES = /* @__PURE__ */ new Set([
  "articAccentAbove",
  "articAccentBelow",
  "articStaccatoAbove",
  "articStaccatoBelow",
  "articTenutoAbove",
  "articTenutoBelow",
  "articStaccatissimoAbove",
  "articStaccatissimoBelow",
  "articMarcatoAbove",
  "articMarcatoBelow",
  "articAccentStaccatoAbove",
  "articAccentStaccatoBelow",
  "articTenutoStaccatoAbove",
  "articTenutoStaccatoBelow",
  "fermataAbove",
  "fermataBelow",
  "ornamentTrill",
  "wiggleTrill",
  "wiggleTrillSlow",
  "breathMarkComma",
  "caesura",
  "graceNoteSlashStemUp",
  "graceNoteSlashStemDown"
]);
const DYNAMIC_CODES = /* @__PURE__ */ new Set([
  "dynamicPiano",
  "dynamicMezzo",
  "dynamicForte",
  "dynamicRinforzando",
  "dynamicSforzando",
  "dynamicZ",
  "dynamicNiente",
  "dynamicPP",
  "dynamicPPP",
  "dynamicMP",
  "dynamicMF",
  "dynamicFF",
  "dynamicFFF"
]);
function findNotations(pg) {
  const marks = [];
  const dynamics = [];
  for (const s of pg.symbols) {
    if (s.hasAnyTag()) continue;
    if (NOTATION_CODES.has(s.code)) {
      s.addTag("Notation");
      marks.push(s);
    } else if (DYNAMIC_CODES.has(s.code)) {
      s.addTag("Notation");
      dynamics.push(s);
    }
  }
  return { marks, dynamics };
}
function attachNotations(pg, notes, marks) {
  const sp = pg.normalStaffSpace || pg.space;
  for (const m2 of marks) {
    let best;
    let bd = Infinity;
    for (const n2 of notes) {
      const st = n2.staff;
      if (m2.py < st.box.top - sp * 3 || m2.py > st.box.bottom + sp * 3) continue;
      const d2 = Math.abs(n2.sym.px - m2.px);
      if (d2 < bd) {
        bd = d2;
        best = n2;
      }
    }
    if (best && bd < sp * 1.5) (best.marks ??= []).push(m2.code);
  }
}
function findTuplets(pg, beams, stems, notes) {
  const nums = [];
  for (const s of pg.symbols) {
    if (s.hasAnyTag()) continue;
    if (s.code === "tuplet3") nums.push({ n: 3, cx: s.px, cy: s.py, w: s.box.right - s.box.left, h: s.box.bottom - s.box.top });
    else if (s.code === "tuplet0") nums.push({ n: 0, cx: s.px, cy: s.py, w: s.box.right - s.box.left, h: s.box.bottom - s.box.top });
  }
  for (const o of pg.objs) {
    if (o.hasAnyTag() || !o.run) continue;
    const t2 = objText(o).trim();
    if (!/^[2-9]$/.test(t2)) continue;
    nums.push({
      n: Number(t2),
      cx: (o.box.left + o.box.right) / 2,
      cy: (o.box.top + o.box.bottom) / 2,
      w: o.box.right - o.box.left,
      h: o.box.bottom - o.box.top
    });
  }
  if (!nums.length) return 0;
  const groupOf = /* @__PURE__ */ new Map();
  for (const st of stems) {
    for (const b of st.beams) {
      let g2 = groupOf.get(b);
      if (!g2) {
        g2 = { notes: /* @__PURE__ */ new Set(), top: Infinity, bottom: -Infinity };
        groupOf.set(b, g2);
      }
      for (const s of st.notes) {
        const n2 = notes.find((x) => x.sym === s);
        if (!n2) continue;
        g2.notes.add(n2);
        g2.top = Math.min(g2.top, n2.sym.box.top);
        g2.bottom = Math.max(g2.bottom, n2.sym.box.bottom);
      }
    }
  }
  const sp = pg.normalStaffSpace || pg.space;
  let found = 0;
  for (const num2 of nums) {
    let best;
    let bd = Infinity;
    for (const b of beams) {
      if (num2.cx < b.x0 - num2.w || num2.cx > b.x1 + num2.w) continue;
      const g2 = groupOf.get(b);
      if (!g2 || !g2.notes.size) continue;
      const top = Math.min(g2.top, b.box.top);
      const bottom2 = Math.max(g2.bottom, b.box.bottom);
      const dy = num2.cy < top ? top - num2.cy : num2.cy > bottom2 ? num2.cy - bottom2 : 0;
      if (dy > sp * 1.5) continue;
      if (dy < bd) {
        bd = dy;
        best = b;
      }
    }
    if (!best) {
      const grp = bracketGroup(pg, num2, notes, sp);
      if (!grp) continue;
      found++;
      applyTuplet(grp, num2.n);
      continue;
    }
    found++;
    const marked = new Set(groupOf.get(best).notes);
    applyTuplet(marked, num2.n);
  }
  return found;
}
function applyTuplet(marked, n2) {
  const normal = n2 === 3 ? 2 : n2 === 6 ? 4 : n2 === 5 ? 4 : n2 === 7 ? 4 : n2 - 1;
  for (const x of marked) {
    x.tuplet = { actual: n2, normal };
    x.duration = x.duration * normal / n2;
  }
}
function bracketGroup(pg, num2, notes, sp) {
  let left = null;
  let right2 = null;
  for (const g2 of pg.segs) {
    if (g2.hasAnyTag() || !g2.isH) continue;
    if (Math.abs(g2.cy - num2.cy) > sp * 1.5) continue;
    if (g2.right <= num2.cx && num2.cx - g2.right < sp * 2) {
      if (!left || g2.right > left.right) left = g2;
    } else if (g2.left >= num2.cx && g2.left - num2.cx < sp * 2) {
      if (!right2 || g2.left < right2.left) right2 = g2;
    }
  }
  if (!left || !right2) return null;
  if (Math.abs(left.cy - right2.cy) > sp * 0.5) return null;
  const x0 = left.left;
  const x1 = right2.right;
  const inSpan = notes.filter((n2) => n2.x >= x0 - sp && n2.x <= x1 + sp);
  if (!inSpan.length) return null;
  const cnt = /* @__PURE__ */ new Map();
  for (const n2 of inSpan) {
    const a = cnt.get(n2.staff) ?? [];
    a.push(n2);
    cnt.set(n2.staff, a);
  }
  let best = null;
  for (const [stf, arr] of cnt) {
    if (arr.length !== num2.n) continue;
    const h2 = stf.box.bottom - stf.box.top;
    if (num2.cy < stf.box.top - h2 || num2.cy > stf.box.bottom + h2) continue;
    if (!best || arr.length < best.length) best = arr;
  }
  return best;
}
const DYNAMIC_NAME = {
  dynamicPiano: "p",
  dynamicPP: "pp",
  dynamicPPP: "ppp",
  dynamicMezzo: "m",
  dynamicMP: "mp",
  dynamicMF: "mf",
  dynamicForte: "f",
  dynamicFF: "ff",
  dynamicFFF: "fff",
  dynamicSforzando: "sf",
  dynamicRinforzando: "rf",
  dynamicZ: "z",
  dynamicNiente: "n"
};
function attachDynamics(pg, notes, dynamics) {
  attachDynamicTexts(
    pg,
    notes,
    dynamics.flatMap((d2) => {
      const text = DYNAMIC_NAME[d2.code];
      return text ? [{ px: d2.px, py: d2.py, text }] : [];
    })
  );
}
function attachDynamicTexts(pg, notes, items) {
  const sp = pg.normalStaffSpace || pg.space;
  for (const d2 of items) {
    const owner = ownerStaff(pg, d2.py, sp);
    for (const only of [true, false]) {
      let best;
      let bd = Infinity;
      for (const n2 of notes) {
        const st = n2.staff;
        if (only ? st !== owner : d2.py < st.box.top - sp * 4 || d2.py > st.box.bottom + sp * 4) continue;
        const dx = Math.abs(n2.sym.px - d2.px);
        if (dx < bd) {
          bd = dx;
          best = n2;
        }
      }
      if (best && bd < sp * 3) {
        best.dynamic ??= d2.text;
        break;
      }
    }
  }
}
function ownerStaff(pg, cy2, sp) {
  let best = null;
  let bd = Infinity;
  for (const st of pg.staves) {
    const d2 = cy2 - st.box.bottom;
    if (d2 < 0 || d2 > sp * 5) continue;
    if (d2 < bd) {
      bd = d2;
      best = st;
    }
  }
  if (best) return best;
  for (const st of pg.staves) {
    const d2 = st.box.top - cy2;
    if (d2 < 0 || d2 > sp * 3) continue;
    if (d2 < bd) {
      bd = d2;
      best = st;
    }
  }
  return best;
}
function attachWedges(pg, notes, wedges) {
  const sp = pg.normalStaffSpace || pg.space;
  for (const wg of wedges) {
    const owner = ownerStaff(pg, wg.cy, sp);
    const near = (x) => {
      for (const only of [true, false]) {
        let best;
        let bd = Infinity;
        for (const n2 of notes) {
          const st = n2.staff;
          if (only ? st !== owner : wg.cy < st.box.top - sp * 5 || wg.cy > st.box.bottom + sp * 5) continue;
          const dx = Math.abs(n2.sym.px - x);
          if (dx < bd) {
            bd = dx;
            best = n2;
          }
        }
        if (best && bd < sp * 4) return best;
        if (only && !owner) continue;
      }
      return void 0;
    };
    const a = near(wg.x0);
    const b = near(wg.x1);
    if (!a) continue;
    a.wedgeStart ??= wg.type;
    if (b && b !== a) b.wedgeStop = true;
  }
}
function markLyricExtends(notes) {
  const rows = /* @__PURE__ */ new Map();
  const staffIds = /* @__PURE__ */ new Map();
  for (const n2 of notes) {
    if (n2.chordExtra || n2.grace) continue;
    if (!staffIds.has(n2.staff)) staffIds.set(n2.staff, staffIds.size);
    const k2 = `${staffIds.get(n2.staff)}/${n2.voice}`;
    rows.set(k2, [...rows.get(k2) ?? [], n2]);
  }
  for (const seq of rows.values()) {
    seq.sort((a, b) => a.x - b.x);
    seq.forEach((n2, i2) => {
      for (const l2 of n2.lyrics ?? []) {
        if (l2.hyphen || !/[A-Za-z]/.test(l2.text)) continue;
        let j2 = i2;
        let open = false;
        for (; ; ) {
          const c2 = seq[j2];
          if (c2.slurStart || c2.tieStart) open = true;
          else if (j2 > i2 && (c2.slurStop || c2.tieStop)) open = false;
          const nx = seq[j2 + 1];
          if (!open || !nx || nx.rest || (nx.lyrics ?? []).some((v2) => v2.verse === l2.verse)) break;
          j2++;
        }
        if (j2 === i2) continue;
        l2.extend = true;
        (seq[j2].lyricExtendStop ??= []).push(l2);
      }
    });
  }
}
function sameToken(a, b) {
  if (a.size !== b.size) return false;
  if (a.clef && b.clef && a.clef !== b.clef) return false;
  const na = !a.topOfBrace && !a.bottomOfBrace;
  const nb = !b.topOfBrace && !b.bottomOfBrace;
  if (na || nb) return true;
  return a.topOfBrace === b.topOfBrace && a.bottomOfBrace === b.bottomOfBrace;
}
function tokenOf(pg, stf, ctx, profileOf = () => ({ lyric: false, pitch: null, label: null })) {
  const sp = pg.normalStaffSpace || pg.space;
  const sp1 = stf.stepDistance() * 2;
  const size = sp1 > sp * 1.15 ? "large" : sp > sp1 * 1.15 ? "small" : "normal";
  let topOfBrace = false;
  let bottomOfBrace = false;
  const cy2 = stf.cy;
  const braces = [
    ...pg.objs.filter((o) => o.hasTag("Bracket")).map((o) => o.box),
    ...pg.symbols.filter((s) => s.code === "bracket" || s.code === "brace").map((s) => s.box)
  ];
  for (const b of braces) {
    if (!overlapY(b, stf.box)) continue;
    if (b.bottom - b.top < (stf.box.bottom - stf.box.top) * 1.5) continue;
    if (cy2 > (b.top + b.bottom) / 2) bottomOfBrace = true;
    else topOfBrace = true;
  }
  const pf = profileOf(stf);
  return { clef: ctx.get(stf)?.clef?.code ?? "", size, topOfBrace, bottomOfBrace, lyric: pf.lyric, pitch: pf.pitch, label: pf.label ?? null, staff: stf };
}
function lcsPairs(a, b) {
  const n2 = a.length;
  const m2 = b.length;
  const f2 = Array.from({ length: n2 + 1 }, () => new Array(m2 + 1).fill(0));
  for (let i22 = 1; i22 <= n2; i22++)
    for (let j22 = 1; j22 <= m2; j22++)
      f2[i22][j22] = sameToken(a[i22 - 1], b[j22 - 1]) ? f2[i22 - 1][j22 - 1] + 1 : Math.max(f2[i22 - 1][j22], f2[i22][j22 - 1]);
  const out = [];
  let i2 = n2;
  let j2 = m2;
  while (i2 > 0 && j2 > 0) {
    if (sameToken(a[i2 - 1], b[j2 - 1]) && f2[i2][j2] === f2[i2 - 1][j2 - 1] + 1) {
      out.push([i2 - 1, j2 - 1]);
      i2--;
      j2--;
    } else if (f2[i2 - 1][j2] >= f2[i2][j2 - 1]) i2--;
    else j2--;
  }
  return out.reverse();
}
function assignSlots(rows) {
  propagateLabels(rows);
  const byCount = /* @__PURE__ */ new Map();
  for (const r4 of rows) {
    if (!r4.length) continue;
    byCount.set(r4.length, [...byCount.get(r4.length) ?? [], r4]);
  }
  if (!byCount.size) return null;
  const n2 = Math.max(...byCount.keys());
  const full = byCount.get(n2);
  if (n2 < 2) return null;
  const slots = Array.from({ length: n2 }, (_, k2) => {
    const ps = full.map((r4) => r4[k2].pitch).filter((v2) => v2 !== null);
    const clefs = /* @__PURE__ */ new Map();
    for (const r4 of full) if (r4[k2].clef) clefs.set(r4[k2].clef, (clefs.get(r4[k2].clef) ?? 0) + 1);
    let clef = "";
    let cn = 0;
    for (const [c2, v2] of clefs) if (v2 > cn) [clef, cn] = [c2, v2];
    return {
      clef,
      lyric: full.filter((r4) => r4[k2].lyric).length * 2 >= full.length,
      pitch: ps.length ? ps.sort((a, b) => a - b)[ps.length >> 1] : null
    };
  });
  const labelOf = new Array(n2).fill(null);
  const score = (t2, k2) => {
    const sl = slots[k2];
    let v2 = 0;
    if (t2.clef && sl.clef) v2 += t2.clef === sl.clef ? CLEF_HIT : CLEF_MISS;
    v2 += t2.lyric === sl.lyric ? LYRIC_HIT : -LYRIC_HIT;
    if (t2.pitch !== null && sl.pitch !== null) v2 -= Math.min(PITCH_CAP, Math.abs(t2.pitch - sl.pitch) * PITCH_W);
    if (t2.label && labelOf[k2]) v2 += t2.label === labelOf[k2] ? LABEL_HIT : LABEL_MISS;
    return v2;
  };
  const assign = () => {
    const out = [];
    for (const r4 of rows) {
      const k2 = r4.length;
      if (!k2 || k2 > n2) return null;
      const NEG = -1e9;
      const f2 = Array.from({ length: k2 + 1 }, () => new Float64Array(n2 + 1).fill(NEG));
      const from = Array.from({ length: k2 + 1 }, () => new Int8Array(n2 + 1));
      for (let j22 = 0; j22 <= n2; j22++) f2[0][j22] = 0;
      for (let i22 = 1; i22 <= k2; i22++)
        for (let j22 = 1; j22 <= n2; j22++) {
          const skip = f2[i22][j22 - 1];
          const take = f2[i22 - 1][j22 - 1] + score(r4[i22 - 1], j22 - 1);
          if (take >= skip) {
            f2[i22][j22] = take;
            from[i22][j22] = 1;
          } else {
            f2[i22][j22] = skip;
            from[i22][j22] = 0;
          }
        }
      const pick = new Array(k2);
      let i2 = k2;
      let j2 = n2;
      while (i2 > 0 && j2 > 0) {
        if (from[i2][j2]) pick[--i2] = j2 - 1;
        j2--;
      }
      if (i2 > 0) return null;
      out.push(pick);
    }
    return out;
  };
  const first = assign();
  if (!first) return null;
  for (let k2 = 0; k2 < n2; k2++) {
    const votes = /* @__PURE__ */ new Map();
    for (let si = 0; si < rows.length; si++) {
      const ri = first[si].indexOf(k2);
      const lb = ri >= 0 ? rows[si][ri].label : null;
      if (lb) votes.set(lb, (votes.get(lb) ?? 0) + 1);
    }
    let best = null;
    let bn = 0;
    for (const [lb, v2] of votes) if (v2 > bn) [best, bn] = [lb, v2];
    const anchor = /* @__PURE__ */ new Map();
    for (const r4 of full) if (r4[k2].label) anchor.set(r4[k2].label, (anchor.get(r4[k2].label) ?? 0) + 1);
    let ab = null;
    let an = 0;
    for (const [lb, v2] of anchor) if (v2 > an) [ab, an] = [lb, v2];
    labelOf[k2] = ab ?? best;
  }
  const named = labelOf.filter((v2) => v2 !== null);
  const second = new Set(named).size >= 2 ? assign() : first;
  if (!second) return second;
  for (let k2 = 0; k2 < n2; k2++) {
    const ps = [];
    for (let si = 0; si < rows.length; si++) {
      const ri = second[si].indexOf(k2);
      if (ri >= 0 && rows[si][ri].pitch !== null) ps.push(rows[si][ri].pitch);
    }
    if (ps.length) slots[k2].pitch = ps.sort((a, b) => a - b)[ps.length >> 1];
  }
  return assign();
}
function propagateLabels(rows) {
  const byCount = /* @__PURE__ */ new Map();
  for (const r4 of rows) if (r4.length) byCount.set(r4.length, [...byCount.get(r4.length) ?? [], r4]);
  for (const [k2, group] of byCount) {
    if (group.length < 2) continue;
    for (let i2 = 0; i2 < k2; i2++) {
      const votes = /* @__PURE__ */ new Map();
      for (const r4 of group) if (r4[i2].label) votes.set(r4[i2].label, (votes.get(r4[i2].label) ?? 0) + 1);
      let best = null;
      let bn = 0;
      for (const [lb, v2] of votes) if (v2 > bn) [best, bn] = [lb, v2];
      if (best) {
        for (const r4 of group) if (!r4[i2].label) r4[i2].label = best;
      }
    }
  }
}
const CLEF_HIT = 2;
const CLEF_MISS = -6;
const LYRIC_HIT = 1.5;
const LABEL_HIT = 4;
const LABEL_MISS = -8;
const PITCH_W = 0.35;
const PITCH_CAP = 4;
function buildScore(pages, opts = {}) {
  const systems = [];
  for (const { page, ctx } of pages) for (const sys of page.systems) systems.push({ page, sys, ctx });
  const tokensOf = systems.map((e) => e.sys.staves.map((st) => tokenOf(e.page, st, e.ctx, opts.profileOf)));
  const scoreStaves = [];
  const slots = opts.slots ?? (opts.profileOf ? assignSlots(tokensOf) : null);
  if (slots) {
    const n2 = Math.max(1, ...slots.map((p2) => Math.max(-1, ...p2) + 1));
    for (let k2 = 0; k2 < n2; k2++) {
      const ss = new ScoreStaff();
      for (let si = 0; si < systems.length; si++) ss.staves[si] = null;
      scoreStaves.push(ss);
    }
    slots.forEach((pick, si) => pick.forEach((k2, ri) => {
      if (k2 >= 0 && scoreStaves[k2] && tokensOf[si]?.[ri]) scoreStaves[k2].staves[si] = tokensOf[si][ri].staff;
    }));
    return finishScore(systems, scoreStaves);
  }
  let state = [];
  systems.forEach((_entry, si) => {
    const tokens = tokensOf[si];
    const pairs = lcsPairs(
      state.map((x) => x.token),
      tokens
    );
    const matchedLeft = new Map(pairs.map(([l2, r4]) => [l2, r4]));
    const matchedRight = new Set(pairs.map(([, r4]) => r4));
    const next = [];
    let ri = 0;
    for (let li = 0; li < state.length; li++) {
      const target = matchedLeft.get(li);
      while (ri < tokens.length && (target === void 0 || ri < target)) {
        if (!matchedRight.has(ri)) next.push(newScoreStaff(scoreStaves, tokens[ri], si));
        ri++;
      }
      if (target !== void 0) {
        state[li].ss.staves[si] = tokens[target].staff;
        next.push({ token: tokens[target], ss: state[li].ss });
        ri = target + 1;
      } else {
        state[li].ss.staves[si] = null;
        next.push(state[li]);
      }
    }
    while (ri < tokens.length) {
      if (!matchedRight.has(ri)) next.push(newScoreStaff(scoreStaves, tokens[ri], si));
      ri++;
    }
    state = next;
  });
  return finishScore(systems, scoreStaves);
}
function finishScore(systems, scoreStaves) {
  for (const ss of scoreStaves) {
    for (let i2 = 0; i2 < systems.length; i2++) if (ss.staves[i2] === void 0) ss.staves[i2] = null;
  }
  scoreStaves.forEach((ss, i2) => ss.index = i2);
  const parts = [];
  let prevTok = null;
  for (const ss of scoreStaves) {
    const tok = lastToken(ss, systems);
    let newPart = !tok?.bottomOfBrace;
    if (!parts.length || tok?.topOfBrace) newPart = true;
    if (parts.length && !tok?.topOfBrace && prevTok?.clef.startsWith("gClef") && tok?.clef.startsWith("fClef") && sameSystemSomewhere(parts[parts.length - 1].scoreStaves, ss)) {
      newPart = false;
    }
    if (newPart) parts.push(new Part());
    parts[parts.length - 1].scoreStaves.push(ss);
    prevTok = tok;
  }
  parts.forEach((p2, i2) => p2.index = i2);
  return { systems, scoreStaves, parts };
}
function sameSystemSomewhere(prev, ss) {
  const last = prev[prev.length - 1];
  if (!last) return false;
  for (let i2 = 0; i2 < ss.staves.length; i2++) if (ss.staves[i2] && last.staves[i2]) return true;
  return false;
}
function newScoreStaff(all, token, si) {
  const ss = new ScoreStaff();
  ss.staves[si] = token.staff;
  all.push(ss);
  return { token, ss };
}
function lastToken(ss, systems) {
  for (let i2 = ss.staves.length - 1; i2 >= 0; i2--) {
    const st = ss.staves[i2];
    if (!st) continue;
    return tokenOf(systems[i2].page, st, systems[i2].ctx);
  }
  return null;
}
function findOctaveShifts(pg) {
  const sp = pg.normalStaffSpace || pg.space;
  const hlines = pg.segs.filter((s) => s.isH && !s.hasAnyTag() && s.obj.path && isDashedSeg(s));
  const vlines = pg.segs.filter((s) => s.isV && !s.hasAnyTag());
  const marks = pg.symbols.filter((s) => (s.code === "ottavaAlta" || s.code === "ottavaBassaVb") && !s.hasAnyTag());
  const out = [];
  for (const hl of hlines) {
    let mark;
    for (const m2 of marks) {
      if (!overlapY(hl.box, m2.box)) continue;
      const dx = hl.left - m2.box.right;
      if (dx < 0 || dx > sp) continue;
      mark = m2;
      break;
    }
    if (!mark) continue;
    let hook;
    for (const vl of vlines) {
      if (vl.left - hl.right > sp / 2) continue;
      if (Math.abs(vl.bottom - hl.bottom) > sp / 2) continue;
      hook = vl;
      break;
    }
    if (!hook) continue;
    mark.addTag("OctaveShift");
    hl.addTag("OctaveShift");
    hook.addTag("OctaveShift");
    out.push({
      dir: mark.code === "ottavaAlta" ? "up" : "down",
      left: mark.box.left,
      right: Math.max(hl.right, hook.right),
      top: mark.box.top,
      bottom: mark.box.bottom
    });
  }
  return out;
}
function isDashedSeg(s) {
  const d2 = s.obj.path?.dash;
  return !!d2 && d2.length > 1;
}
function applyOctaveShifts(shifts, notes, sp) {
  for (const sh of shifts) {
    let best = null;
    let bd = Infinity;
    for (const n2 of notes) {
      const stf = n2.staff.box;
      const near = sh.dir === "up" ? stf.top - sh.bottom : sh.top - stf.bottom;
      if (near < -sp || near > sp * 4) continue;
      if (near < bd) {
        bd = near;
        best = n2.staff;
      }
    }
    if (!best) continue;
    for (const n2 of notes) {
      if (n2.rest || n2.staff !== best) continue;
      if (n2.x < sh.left || n2.x > sh.right) continue;
      n2.octave += sh.dir === "up" ? 1 : -1;
      n2.diatonic += sh.dir === "up" ? 7 : -7;
      n2.octaveShift = sh.dir;
    }
  }
}
function findVoltas(pg) {
  const sp = pg.normalStaffSpace || pg.space;
  const out = [];
  const hlines = pg.segs.filter((s) => s.isH && !s.hasAnyTag() && s.len > sp * 3);
  const vlines = pg.segs.filter((s) => s.isV && !s.hasAnyTag() && s.len > sp * 0.8 && s.len < sp * 10);
  for (const hl of hlines) {
    const hook = vlines.find((v2) => Math.abs(v2.cx - hl.left) < sp * 0.6 && Math.abs(v2.top - hl.cy) < sp * 0.6);
    if (!hook) continue;
    const stf = pg.staves.find((st) => hook.bottom <= st.box.top + sp && st.box.top - hook.bottom < sp * 2);
    if (!stf) continue;
    const num2 = pg.objs.find((o) => {
      if (!o.run || o.hasAnyTag()) return false;
      const t2 = objText(o).trim();
      if (!/^\d[\d.,\s]*$/.test(t2)) return false;
      return o.box.left >= hl.left - sp && o.box.left < hl.left + sp * 4 && o.box.top >= hl.cy - sp * 0.5 && o.box.top < hl.cy + sp * 3;
    });
    if (!num2) continue;
    hl.addTag("Notation");
    hook.addTag("Notation");
    num2.addTag("Notation");
    out.push({ number: objText(num2).trim().replace(/[.\s]+$/, ""), left: hl.left, right: hl.right, staffTop: stf.box.top });
  }
  return out;
}
function attachVoltas(pg, voltas) {
  const sp = pg.normalStaffSpace || pg.space;
  for (const v2 of voltas) {
    const stf = pg.staves.find((st) => Math.abs(st.box.top - v2.staffTop) < 1);
    if (!stf) continue;
    const covered = stf.bars.filter((b) => b.right > v2.left + sp && b.left < v2.right - sp);
    if (!covered.length) continue;
    covered.forEach((b, i2) => {
      b.endingNumber = v2.number;
      if (i2 === 0) b.endingStart = true;
      if (i2 === covered.length - 1) b.endingStop = true;
    });
  }
}
async function recognizeStaffPage(pdfPage, OPS, look, index, opts = {}) {
  const vec = await extractVectorPage(pdfPage, OPS, { scale: 1 });
  const runs = await extractTextPage(pdfPage, OPS, { scale: 1 });
  const pg = buildPage(index, vec.width, vec.height, vec.objs, runs);
  findSymbols(pg, look);
  if (!findStaves(pg)) {
    removeWhite(pg);
    return { page: pg, hasStaff: false, unknown: unknownObjs(pg).length, ctx: /* @__PURE__ */ new Map(), beams: [], notes: [], text: emptyText(), lyricLines: [], slurs: [], octaves: [], voltas: [], bars: [], carryTime: opts.carryTime };
  }
  findNoteheads(pg);
  findStems(pg);
  findTails(pg);
  findBarlines(pg);
  const ctx = findClefKeyTime(pg);
  makeSystems(pg);
  makeBars(pg);
  const beams = findBeams(pg);
  const stems = [];
  const notes = buildNotes(pg, ctx, beams, stems);
  findTuplets(pg, beams, stems, notes);
  findWedges(pg);
  const slurs = mergeArcHalves(findSlurs(pg), pg.normalStaffSpace || pg.space);
  attachSlurs(slurs, notes, pg.normalStaffSpace || pg.space);
  reconnectSlurs(pg, slurs);
  markSlurNotes(slurs);
  const octaves = findOctaveShifts(pg);
  if (staffOmrOptions.octaveShift) applyOctaveShifts(octaves, notes, pg.normalStaffSpace || pg.space);
  const voltas = findVoltas(pg);
  attachVoltas(pg, voltas);
  const marks = findNotations(pg);
  attachNotations(pg, notes, marks.marks);
  attachDynamics(pg, notes, marks.dynamics);
  const text = analyzeText(pg);
  const lyricLines = buildLyricLines(pg, text.lyric, opts.textLookup);
  attachLyrics(notes, lyricLines);
  attachHarmonies(pg, notes, text.harmony);
  removeWhite(pg);
  return { page: pg, hasStaff: true, unknown: unknownObjs(pg).length, ctx, beams, notes, text, lyricLines, slurs, octaves, voltas, bars: checkBars(pg, ctx, notes, opts.carryTime), carryTime: lastTimeSignature(pg, ctx, opts.carryTime) };
}
function emptyText() {
  return { lyric: [], harmony: [], tempo: [], expression: [], instrument: [], measureNumber: [], boxed: [], textFrame: [] };
}
function makeLookup(dict) {
  return new StaffGlyphLookup(dict);
}
const COL_STEP = 4;
const MIN_SPACE = 6;
const MAX_SPACE = 40;
const EVEN_TOL = 0.22;
const MAX_THICK = 0.45;
const SPACE_TOL = 0.2;
const TRACK_STEP = 0.5;
const TRACK_SPAN = 0.25;
const SMOOTH = 9;
const MIN_SHIFT = 1;
const BORROW_MIN = 0.15;
const BORROW_NEAR = 15;
const BORROW_GAIN = 0.5;
function applyTrackWarp(bin, tracks, also = []) {
  const { w, h: h2, data } = bin;
  const out = new Uint8Array(w * h2);
  const outs = also.map(() => new Uint8Array(w * h2));
  const sorted = [...tracks].sort((a, b) => a.mid - b.mid);
  const cols = sorted[0].off.length;
  for (let y = 0; y < h2; y++) {
    let k2 = 0;
    while (k2 + 1 < sorted.length && sorted[k2 + 1].mid <= y) k2++;
    const a = sorted[k2];
    const b = k2 + 1 < sorted.length ? sorted[k2 + 1] : null;
    const t2 = b && b.mid > a.mid ? Math.min(1, Math.max(0, (y - a.mid) / (b.mid - a.mid))) : 0;
    for (let x = 0; x < w; x++) {
      const i2 = Math.min(cols - 1, Math.round(x / COL_STEP));
      const off = b ? a.off[i2] * (1 - t2) + b.off[i2] * t2 : a.off[i2];
      const sy = y + Math.round(off);
      if (sy < 0 || sy >= h2) continue;
      out[y * w + x] = data[sy * w + x];
      for (let j2 = 0; j2 < also.length; j2++) outs[j2][y * w + x] = also[j2][sy * w + x];
    }
  }
  data.set(out);
  also.forEach((a, j2) => a.set(outs[j2]));
}
const LOOSE_INK = 0.7;
const LOOSE_INK4 = 0.4;
function completeStaffLines(bin, lines, groups, loose = true) {
  const hits = columnHits(bin);
  const cols = Math.ceil(bin.w / COL_STEP);
  if (hits.length < 20) return { lines, groups };
  const spaces = hits.map((h2) => h2.space).sort((a, b) => a - b);
  const space = spaces[spaces.length >> 1];
  const keep = hits.filter((h2) => Math.abs(h2.space - space) <= space * SPACE_TOL).sort((a, b) => a.cy - b.cy);
  const need = Math.max(20, cols * BAND_SUPPORT);
  const out = [...lines];
  const outGroups = [...groups];
  const bands = [];
  const made = /* @__PURE__ */ new Set();
  if (loose) {
    for (const t2 of joinTracks(buildTracks(keep, space, bin.w, 0, 1), space)) if (t2.xs.length >= 8) bands.push(t2.hits);
    bands.sort((a, b) => b.length - a.length);
  } else {
    for (let i2 = 0; i2 < keep.length; ) {
      let j2 = i2;
      while (j2 + 1 < keep.length && keep[j2 + 1].cy - keep[j2].cy <= space * BAND_TOL) j2++;
      bands.push(keep.slice(i2, j2 + 1));
      i2 = j2 + 1;
    }
  }
  for (const band of bands) {
    if (band.length < need) continue;
    const cy2 = median$7(band.map((h2) => h2.cy));
    const thick = Math.max(1, median$7(band.map((h2) => h2.thick)));
    const left = Math.min(...band.map((h2) => h2.x));
    const right2 = Math.max(...band.map((h2) => h2.x));
    const covered = (loose ? outGroups : groups).find((g22) => cy2 > g22.lines[0].y - space && cy2 < g22.lines[4].y + space);
    if (covered) {
      const ext = bin.w * EXTEND_MIN;
      const gl = Math.min(...covered.lines.map((l2) => l2.left));
      const gr = Math.max(...covered.lines.map((l2) => l2.right));
      if (made.has(covered) || right2 - gr > ext || gl - left > ext)
        for (const l2 of covered.lines) l2.left = Math.min(l2.left, left), l2.right = Math.max(l2.right, right2);
      continue;
    }
    const five = [];
    for (let k2 = 0; k2 < 5; k2++) {
      const y = median$7(band.map((h2) => h2.ys[k2]));
      five.push({ y, y0: y - thick / 2, y1: y + thick / 2, left, right: right2 });
    }
    out.push(...five);
    const g2 = { lines: five, space: (five[4].y - five[0].y) / 4 };
    outGroups.push(g2);
    made.add(g2);
  }
  const grouped = new Set(outGroups.flatMap((g2) => g2.lines));
  const rest = out.filter((l2) => !grouped.has(l2)).sort((a, b) => a.y - b.y);
  for (let i2 = 0; i2 + 3 < rest.length; i2++) {
    const four = rest.slice(i2, i2 + 4);
    const ds = [1, 2, 3].map((k2) => four[k2].y - four[k2 - 1].y);
    const avg = (ds[0] + ds[1] + ds[2]) / 3;
    if (avg <= 0 || ds.some((d2) => Math.abs(d2 - avg) > avg * 0.2)) continue;
    if (Math.max(...four.map((l2) => l2.left)) - Math.min(...four.map((l2) => l2.left)) > avg * 3) continue;
    const left = Math.max(...four.map((l2) => l2.left));
    const right2 = Math.min(...four.map((l2) => l2.right));
    if (right2 - left < bin.w * 0.2) continue;
    for (const y of [four[0].y - avg, four[3].y + avg]) {
      if (y < 0 || y >= bin.h) continue;
      if (outGroups.some((g2) => y > g2.lines[0].y - avg && y < g2.lines[4].y + avg)) continue;
      const top = Math.min(y, four[0].y);
      const bottom2 = Math.max(y, four[3].y);
      if (outGroups.some((g2) => top < g2.lines[4].y - avg * 0.5 && bottom2 > g2.lines[0].y + avg * 0.5)) continue;
      if (inkAlong(bin, y, left, right2) < LINE_INK) continue;
      const add = { y, y0: y - 1, y1: y + 1, left, right: right2 };
      const five = [...four, add].sort((a, b) => a.y - b.y);
      out.push(add);
      outGroups.push({ lines: five, space: avg });
      for (const l2 of five) grouped.add(l2);
      i2 += 3;
      break;
    }
  }
  if (loose) {
    const done = new Set(outGroups.flatMap((g2) => g2.lines));
    const known = outGroups.map((g2) => g2.space).sort((a, b) => a - b);
    const ref = known.length ? known[known.length >> 1] : 0;
    const lenOf = (l2) => l2.right - l2.left;
    const loose2 = [];
    for (const l2 of out.filter((q2) => !done.has(q2) && lenOf(q2) >= bin.w * 0.15).sort((a, b) => a.y - b.y)) {
      const p2 = loose2[loose2.length - 1];
      if (ref && p2 && l2.y - p2.y <= ref * 0.3) {
        const wa = lenOf(p2);
        const wb = lenOf(l2);
        const y = (p2.y * wa + l2.y * wb) / (wa + wb);
        loose2[loose2.length - 1] = { y, y0: y - 1, y1: y + 1, left: Math.min(p2.left, l2.left), right: Math.max(p2.right, l2.right) };
      } else loose2.push(l2);
    }
    const tol = Math.max(2, Math.round(ref * 0.3));
    const inkTol = (y, left, right2) => {
      let n2 = 0;
      let hit = 0;
      for (let x = Math.round(left); x <= right2; x += 4) {
        n2++;
        for (let d2 = -tol; d2 <= tol; d2++) {
          const yy = Math.round(y) + d2;
          if (yy >= 0 && yy < bin.h && bin.data[yy * bin.w + x]) {
            hit++;
            break;
          }
        }
      }
      return n2 ? hit / n2 : 0;
    };
    const used = /* @__PURE__ */ new Set();
    for (let i2 = 0; ref && i2 < loose2.length; i2++) {
      const a = loose2[i2];
      if (used.has(a)) continue;
      const slot = /* @__PURE__ */ new Map([[0, a]]);
      for (const l2 of loose2.slice(i2 + 1)) {
        if (used.has(l2)) continue;
        const k2 = (l2.y - a.y) / ref;
        const r4 = Math.round(k2);
        if (r4 < 1 || r4 > 4) continue;
        if (Math.abs(k2 - r4) > 0.2) continue;
        if (!slot.has(r4) || lenOf(l2) > lenOf(slot.get(r4))) slot.set(r4, l2);
      }
      if (slot.size < 3) continue;
      const mem = [...slot.values()];
      const full = mem.filter((l2) => lenOf(l2) >= bin.w * 0.5);
      if (full.length < 2) continue;
      if (slot.size === 5 && full.length === 5 && Math.max(...mem.map((l2) => l2.left)) - Math.min(...mem.map((l2) => l2.left)) > ref * 6) continue;
      const left = Math.min(...full.map((l2) => l2.left));
      const right2 = Math.max(...full.map((l2) => l2.right));
      const maxSlot = Math.max(...slot.keys());
      const inkNeed = slot.size >= 4 && full.length >= 3 ? LOOSE_INK4 : LOOSE_INK;
      const avg = (slot.get(maxSlot).y - a.y) / maxSlot;
      let best = null;
      for (let s0 = 0; s0 + maxSlot <= 4; s0++) {
        const ys = [0, 1, 2, 3, 4].map((k2) => a.y + (k2 - s0) * avg);
        if (outGroups.some((g2) => ys[0] < g2.lines[4].y + avg * 0.5 && ys[4] > g2.lines[0].y - avg * 0.5)) continue;
        let score = 0;
        let ok = true;
        for (let k2 = 0; k2 < 5; k2++) {
          if (slot.has(k2 - s0)) continue;
          const v2 = inkTol(ys[k2], left, right2);
          if (v2 < inkNeed) ok = false;
          score += v2;
        }
        if (ok && (!best || score > best.score)) best = { s: s0, score };
      }
      if (!best) continue;
      const five = [0, 1, 2, 3, 4].map((k2) => {
        const m2 = slot.get(k2 - best.s);
        const y = m2 ? m2.y : a.y + (k2 - best.s) * avg;
        const own = m2 && lenOf(m2) >= bin.w * 0.5;
        return { y, y0: m2 ? m2.y0 : y - 1, y1: m2 ? m2.y1 : y + 1, left: own ? m2.left : left, right: own ? m2.right : right2 };
      });
      for (const l2 of mem) used.add(l2);
      for (let k2 = out.length - 1; k2 >= 0; k2--) {
        const l2 = out[k2];
        if (!done.has(l2) && five.some((f2) => Math.abs(f2.y - l2.y) <= ref * 0.3)) out.splice(k2, 1);
      }
      out.push(...five);
      for (const f2 of five) done.add(f2);
      outGroups.push({ lines: five, space: avg });
    }
  }
  if (!loose) {
    const done = new Set(outGroups.flatMap((g2) => g2.lines));
    const loose2 = out.filter((l2) => !done.has(l2)).sort((a, b) => a.y - b.y);
    const known = outGroups.map((g2) => g2.space).sort((a, b) => a - b);
    const ref = known.length ? known[known.length >> 1] : 0;
    for (let i2 = 0; ref && i2 + 4 < loose2.length; i2++) {
      const five = loose2.slice(i2, i2 + 5);
      const ds = [1, 2, 3, 4].map((k2) => five[k2].y - five[k2 - 1].y);
      const avg = (ds[0] + ds[1] + ds[2] + ds[3]) / 4;
      if (ds.some((d2) => Math.abs(d2 - avg) > avg * 0.2) || Math.abs(avg - ref) > ref * 0.15) continue;
      if (outGroups.some((g2) => five[0].y < g2.lines[4].y + avg && five[4].y > g2.lines[0].y - avg)) continue;
      const full = five.filter((l2) => l2.right - l2.left >= bin.w * 0.6);
      if (full.length < 3) continue;
      if (full.length === 5) {
        if (Math.max(...five.map((l2) => l2.left)) - Math.min(...five.map((l2) => l2.left)) > avg * 6) continue;
      } else {
        const left = Math.min(...full.map((l2) => l2.left));
        const right2 = Math.max(...full.map((l2) => l2.right));
        for (const l2 of five) l2.left = left, l2.right = right2;
      }
      outGroups.push({ lines: five, space: avg });
      i2 += 4;
    }
  }
  if (loose)
    for (const g2 of outGroups) {
      const left = Math.min(...g2.lines.map((l2) => l2.left));
      const right2 = Math.max(...g2.lines.map((l2) => l2.right));
      const tol = Math.max(2, Math.round(g2.space * 0.3));
      for (const l2 of g2.lines) {
        if (l2.left <= left + g2.space && l2.right >= right2 - g2.space) continue;
        let n2 = 0;
        let hit = 0;
        for (let x = Math.round(left); x <= right2; x += 4) {
          if (x >= l2.left && x <= l2.right) continue;
          n2++;
          for (let d2 = -tol; d2 <= tol; d2++) {
            const yy = Math.round(l2.y) + d2;
            if (yy >= 0 && yy < bin.h && bin.data[yy * bin.w + x]) {
              hit++;
              break;
            }
          }
        }
        if (n2 && hit / n2 >= LOOSE_INK) l2.left = left, l2.right = right2;
      }
    }
  if (loose && outGroups.length >= 3) {
    const med2 = (a) => a.slice().sort((p2, q2) => p2 - q2)[a.length >> 1];
    const L3 = med2(outGroups.map((g2) => Math.min(...g2.lines.map((l2) => l2.left))));
    const R = med2(outGroups.map((g2) => Math.max(...g2.lines.map((l2) => l2.right))));
    const inkSeg = (y, x0, x1, tol) => {
      let n2 = 0;
      let hit = 0;
      for (let x = Math.round(x0); x <= x1; x += 4) {
        n2++;
        for (let d2 = -tol; d2 <= tol; d2++) {
          const yy = Math.round(y) + d2;
          if (yy >= 0 && yy < bin.h && bin.data[yy * bin.w + x]) {
            hit++;
            break;
          }
        }
      }
      return n2 ? hit / n2 : 0;
    };
    for (const g2 of outGroups) {
      const tol = Math.max(2, Math.round(g2.space * 0.3));
      const gl = Math.min(...g2.lines.map((l2) => l2.left));
      const gr = Math.max(...g2.lines.map((l2) => l2.right));
      if (gl > L3 + g2.space * 2 && g2.lines.filter((l2) => inkSeg(l2.y, L3, gl, tol) >= LOOSE_INK).length >= 4) for (const l2 of g2.lines) l2.left = Math.min(l2.left, L3);
      if (gr < R - g2.space * 2 && g2.lines.filter((l2) => inkSeg(l2.y, gr, R, tol) >= LOOSE_INK).length >= 4) for (const l2 of g2.lines) l2.right = Math.max(l2.right, R);
    }
  }
  outGroups.sort((a, b) => a.lines[0].y - b.lines[0].y);
  return { lines: out.sort((a, b) => a.y - b.y), groups: outGroups };
}
const EXTEND_MIN = 0.1;
const LINE_INK = 0.5;
function inkAlong(bin, y, left, right2) {
  const y0 = Math.max(0, Math.round(y) - 1);
  const y1 = Math.min(bin.h - 1, Math.round(y) + 1);
  let n2 = 0;
  let tot = 0;
  for (let x = Math.max(0, left); x <= Math.min(bin.w - 1, right2); x++) {
    tot++;
    for (let yy = y0; yy <= y1; yy++)
      if (bin.data[yy * bin.w + x]) {
        n2++;
        break;
      }
  }
  return tot ? n2 / tot : 0;
}
const BAND_TOL = 0.4;
const BAND_SUPPORT = 0.25;
function columnStaffTracks(bin) {
  const hits = columnHits(bin);
  if (hits.length < 20) return { count: 0, bands: 0, space: 0 };
  const spaces = hits.map((h2) => h2.space).sort((a, b) => a - b);
  const space = spaces[spaces.length >> 1];
  const keep = hits.filter((h2) => Math.abs(h2.space - space) <= space * SPACE_TOL);
  const cys = keep.map((h2) => h2.cy).sort((a, b) => a - b);
  let bands = 0;
  let i2 = 0;
  while (i2 < cys.length) {
    let j2 = i2;
    while (j2 + 1 < cys.length && cys[j2 + 1] - cys[j2] <= space * 0.5) j2++;
    if (j2 - i2 + 1 >= 10) bands++;
    i2 = j2 + 1;
  }
  return { count: buildTracks(keep, space, bin.w).length, bands, space };
}
function trackCurves(bin) {
  const hits = columnHits(bin);
  if (hits.length < 20) return null;
  const spaces = hits.map((h2) => h2.space).sort((a, b) => a - b);
  const space = spaces[spaces.length >> 1];
  const keep = hits.filter((h2) => Math.abs(h2.space - space) <= space * SPACE_TOL);
  const tracks = buildTracks(keep, space, bin.w);
  if (tracks.length < 2) return null;
  const cols = Math.ceil(bin.w / COL_STEP);
  const out = [];
  let peak = 0;
  const spanOf = (t2) => {
    const cs = t2.xs.map((x) => Math.min(cols - 1, Math.round(x / COL_STEP)));
    return { first: Math.min(...cs), last: Math.max(...cs) };
  };
  const done = [];
  const need = Math.round(cols * BORROW_MIN);
  for (const t2 of [...tracks].sort((a, b) => spanOf(b).last - spanOf(b).first - (spanOf(a).last - spanOf(a).first))) {
    const mid = median$7([...t2.ys]);
    const raw = new Array(cols).fill(NaN);
    for (let i2 = 0; i2 < t2.xs.length; i2++) raw[Math.min(cols - 1, Math.round(t2.xs[i2] / COL_STEP))] = t2.ys[i2] - mid;
    const { first, last } = spanOf(t2);
    const donor = (side) => done.filter((d2) => Math.abs(d2.mid - mid) >= space * 3 && Math.abs(d2.mid - mid) <= space * BORROW_NEAR && (side < 0 ? d2.first <= first - need : d2.last >= last + need)).sort((a, b) => Math.abs(a.mid - mid) - Math.abs(b.mid - mid))[0];
    const worth = (d2, from, to) => d2 && Math.abs(d2.off[to] - d2.off[from]) >= space * BORROW_GAIN ? d2.off : void 0;
    const off = smoothFill(raw, worth(donor(-1), first, 0), worth(donor(1), last, cols - 1));
    if (!off) continue;
    for (const v2 of off) peak = Math.max(peak, Math.abs(v2));
    out.push({ mid, off });
    done.push({ mid, first, last, off });
  }
  if (out.length < 2 || peak < MIN_SHIFT) return null;
  return out;
}
const LEVEL_PROBES = 9;
const LEVEL_WIN = 3;
const LEVEL_STEP = 0.4;
const LEVEL_INK = 0.6;
const LEVEL_MIN = 0.5;
function residualCurves(bin, groups) {
  const cols = Math.ceil(bin.w / COL_STEP);
  const out = [];
  let worst = 0;
  for (const g2 of groups) {
    if (g2.lines.length !== 5) continue;
    const sp = g2.space;
    const left = Math.max(...g2.lines.map((l2) => l2.left));
    const right2 = Math.min(...g2.lines.map((l2) => l2.right));
    if (right2 - left < sp * LEVEL_WIN * 6) continue;
    const ys = g2.lines.map((l2) => Math.round(l2.y));
    const pts = [];
    const half = Math.round(sp * LEVEL_WIN);
    const step = Math.round(sp * LEVEL_STEP);
    const probe = (k2, around) => {
      const cx2 = Math.round(left + half + (right2 - left - half * 2) * k2 / (LEVEL_PROBES - 1));
      let best = 0;
      let bd = around;
      for (let d2 = around - step; d2 <= around + step; d2++) {
        let n2 = 0;
        for (const y of ys) {
          const yy = y + d2;
          if (yy < 0 || yy >= bin.h) continue;
          for (let x = cx2 - half; x <= cx2 + half; x++) if (x >= 0 && x < bin.w && bin.data[yy * bin.w + x]) n2++;
        }
        if (n2 > best || n2 === best && Math.abs(d2 - around) < Math.abs(bd - around)) best = n2, bd = d2;
      }
      if (best < 5 * (half * 2 + 1) * LEVEL_INK) return null;
      pts.push({ x: cx2, d: bd });
      return bd;
    };
    const mid = LEVEL_PROBES >> 1;
    const d0 = probe(mid, 0) ?? 0;
    for (let k2 = mid + 1, d2 = d0; k2 < LEVEL_PROBES; k2++) d2 = probe(k2, d2) ?? d2;
    for (let k2 = mid - 1, d2 = d0; k2 >= 0; k2--) d2 = probe(k2, d2) ?? d2;
    pts.sort((a, b) => a.x - b.x);
    if (pts.length < LEVEL_PROBES / 2) continue;
    const slopes = [];
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) slopes.push((pts[b].d - pts[a].d) / (pts[b].x - pts[a].x));
    const slope = median$7(slopes);
    const icpt = median$7(pts.map((q2) => q2.d - slope * q2.x));
    const tilt = Math.abs(slope * (right2 - left)) / sp;
    worst = Math.max(worst, tilt);
    const flat = tilt < LEVEL_MIN;
    const off = Array.from({ length: cols }, (_, i2) => flat ? 0 : icpt + slope * i2 * COL_STEP);
    out.push({ mid: (ys[0] + ys[4]) / 2, off });
  }
  return out.length && worst >= LEVEL_MIN ? out : null;
}
function columnHits(bin) {
  const { w, h: h2, data } = bin;
  const out = [];
  const starts = [];
  const lens = [];
  for (let x = 0; x < w; x += COL_STEP) {
    starts.length = 0;
    lens.length = 0;
    let y = 0;
    while (y < h2) {
      if (!data[y * w + x]) {
        y++;
        continue;
      }
      const s = y;
      while (y < h2 && data[y * w + x]) y++;
      starts.push(s);
      lens.push(y - s);
    }
    for (let i2 = 0; i2 + 4 < starts.length; i2++) {
      const c2 = [];
      let thick = 0;
      let ok = true;
      for (let k2 = 0; k2 < 5; k2++) {
        c2.push(starts[i2 + k2] + lens[i2 + k2] / 2);
        thick += lens[i2 + k2];
      }
      const ds = [1, 2, 3, 4].map((k2) => c2[k2] - c2[k2 - 1]);
      const avg = (ds[0] + ds[1] + ds[2] + ds[3]) / 4;
      if (avg < MIN_SPACE || avg > MAX_SPACE) continue;
      for (const d2 of ds) if (Math.abs(d2 - avg) > avg * EVEN_TOL) ok = false;
      for (let k2 = 0; k2 < 5 && ok; k2++) if (lens[i2 + k2] > avg * MAX_THICK) ok = false;
      if (!ok) continue;
      out.push({ x, cy: (c2[0] + c2[4]) / 2, space: avg, thick: thick / 5, ys: c2.slice() });
      i2 += 4;
    }
  }
  return out;
}
function buildTracks(hits, space, width, minSpan = TRACK_SPAN, minHits = 8) {
  const byX = /* @__PURE__ */ new Map();
  for (const h2 of hits) {
    const a = byX.get(h2.x) ?? [];
    a.push(h2);
    byX.set(h2.x, a);
  }
  const xs = [...byX.keys()].sort((a, b) => a - b);
  const open = [];
  const done = [];
  const maxJump = Math.max(COL_STEP * 6, space * 4);
  for (const x of xs) {
    const used = /* @__PURE__ */ new Set();
    for (const o of open) {
      if (x - o.lastX > maxJump) continue;
      let best = null;
      let bd = space * TRACK_STEP;
      for (const h2 of byX.get(x)) {
        if (used.has(h2)) continue;
        const d2 = Math.abs(h2.cy - o.lastY);
        if (d2 < bd) {
          bd = d2;
          best = h2;
        }
      }
      if (!best) continue;
      used.add(best);
      o.t.xs.push(x);
      o.t.ys.push(best.cy);
      o.t.hits.push(best);
      o.lastX = x;
      o.lastY = best.cy;
    }
    for (const h2 of byX.get(x)) {
      if (used.has(h2)) continue;
      open.push({ t: { xs: [x], ys: [h2.cy], hits: [h2] }, lastX: x, lastY: h2.cy });
    }
    for (let i2 = open.length - 1; i2 >= 0; i2--)
      if (x - open[i2].lastX > maxJump) {
        done.push(open[i2].t);
        open.splice(i2, 1);
      }
  }
  for (const o of open) done.push(o.t);
  return done.filter((t2) => t2.xs.length >= minHits && t2.xs[t2.xs.length - 1] - t2.xs[0] >= width * minSpan);
}
function joinTracks(tracks, space) {
  const fit = (t2) => {
    const n2 = t2.xs.length;
    const mx = t2.xs.reduce((a, x) => a + x, 0) / n2, my = t2.ys.reduce((a, y) => a + y, 0) / n2;
    let sxx = 0, sxy = 0;
    for (let k2 = 0; k2 < n2; k2++) sxx += (t2.xs[k2] - mx) ** 2, sxy += (t2.xs[k2] - mx) * (t2.ys[k2] - my);
    const b = sxx > 0 && t2.xs[n2 - 1] - t2.xs[0] >= space * 4 ? sxy / sxx : 0;
    return (x) => my + b * (x - mx);
  };
  const out = [];
  for (const t2 of [...tracks].sort((a, b) => a.xs[0] - b.xs[0])) {
    let best = null;
    let bd = space * TRACK_STEP;
    for (const o of out) {
      if (o.xs[o.xs.length - 1] >= t2.xs[0]) continue;
      const d2 = o.xs.length >= t2.xs.length ? Math.abs(fit(o)(t2.xs[0]) - median$7(t2.ys.slice(0, 5))) : Math.abs(fit(t2)(o.xs[o.xs.length - 1]) - median$7(o.ys.slice(-5)));
      if (d2 < bd) bd = d2, best = o;
    }
    if (best) {
      best.xs.push(...t2.xs);
      best.ys.push(...t2.ys);
      best.hits.push(...t2.hits);
    } else out.push({ xs: [...t2.xs], ys: [...t2.ys], hits: [...t2.hits] });
  }
  return out;
}
function smoothFill(raw, left, right2) {
  const n2 = raw.length;
  const filled = new Array(n2).fill(NaN);
  let first = -1;
  let last = -1;
  for (let i2 = 0; i2 < n2; i2++)
    if (!Number.isNaN(raw[i2])) {
      if (first < 0) first = i2;
      last = i2;
    }
  if (first < 0) return null;
  let prev = raw[first];
  for (let i2 = first; i2 <= last; i2++) {
    if (!Number.isNaN(raw[i2])) prev = raw[i2];
    filled[i2] = prev;
  }
  for (let i2 = 0; i2 < first; i2++) filled[i2] = raw[first] + (left ? left[i2] - left[first] : 0);
  for (let i2 = last + 1; i2 < n2; i2++) filled[i2] = raw[last] + (right2 ? right2[i2] - right2[last] : 0);
  const out = new Array(n2);
  const half = SMOOTH >> 1;
  for (let i2 = 0; i2 < n2; i2++) {
    const a = [];
    for (let k2 = -half; k2 <= half; k2++) {
      const j2 = i2 + k2;
      if (j2 >= 0 && j2 < n2) a.push(filled[j2]);
    }
    out[i2] = median$7(a);
  }
  return out;
}
function median$7(a) {
  a.sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : 0;
}
function components(bin, val, conn, keep = () => true) {
  const { w, h: h2, data } = bin;
  const seen = new Uint8Array(w * h2);
  const out = [];
  const st = [];
  for (let s0 = 0; s0 < w * h2; s0++) {
    if (data[s0] !== val || seen[s0]) continue;
    seen[s0] = 1;
    st.push(s0);
    const px = [];
    let x0 = w, x1 = 0, y0 = h2, y1 = 0;
    let edge = false;
    while (st.length) {
      const i2 = st.pop();
      px.push(i2);
      const x = i2 % w;
      const y = (i2 - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h2 - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy || conn === 4 && dx && dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h2) continue;
          const j2 = ny * w + nx;
          if (data[j2] === val && !seen[j2]) {
            seen[j2] = 1;
            st.push(j2);
          }
        }
    }
    if (keep(px.length)) out.push({ px, x0, y0, x1, y1, edge });
  }
  return out;
}
function areaOpen(bin, min) {
  for (const b of components(bin, 1, 8, (n2) => n2 < min)) for (const i2 of b.px) bin.data[i2] = 0;
}
function areaClose(bin, max) {
  for (const b of components(bin, 0, 4, (n2) => n2 < max)) if (!b.edge) for (const i2 of b.px) bin.data[i2] = 1;
}
function boxMorph(bin, r4, dilate) {
  const { w, h: h2, data } = bin;
  const W = w + 1;
  const s = new Int32Array(W * (h2 + 1));
  for (let y = 0; y < h2; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += data[y * w + x];
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + run;
    }
  }
  const full = (2 * r4 + 1) * (2 * r4 + 1);
  for (let y = 0; y < h2; y++) {
    const y0 = Math.max(0, y - r4);
    const y1 = Math.min(h2, y + r4 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r4);
      const x1 = Math.min(w, x + r4 + 1);
      const n2 = s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
      const area = (x1 - x0) * (y1 - y0);
      data[y * w + x] = dilate ? n2 > 0 ? 1 : 0 : n2 >= Math.min(full, area) ? 1 : 0;
    }
  }
}
function close(bin, r4) {
  if (r4 < 1) return;
  boxMorph(bin, r4, true);
  boxMorph(bin, r4, false);
}
function quantile$1(xs, p2) {
  if (!xs.length) return 0;
  const a = [...xs].sort((u2, v2) => u2 - v2);
  return a[Math.min(a.length - 1, Math.floor(a.length * p2))];
}
class Integral {
  constructor(bin) {
    this.bin = bin;
    const { w, h: h2, data } = bin;
    const s = new Int32Array((w + 1) * (h2 + 1));
    for (let y = 0; y < h2; y++) {
      let run = 0;
      const src = y * w;
      const cur = (y + 1) * (w + 1);
      const up = y * (w + 1);
      for (let x = 0; x < w; x++) {
        run += data[src + x];
        s[cur + x + 1] = s[up + x + 1] + run;
      }
    }
    this.s = s;
  }
  s;
  /** 以 (x,y) 为中心、kw×kh 窗口的墨点数（越界按 0 计）。 */
  box(x, y, kw, kh) {
    const { w, h: h2 } = this.bin;
    const x0 = Math.max(0, x - (kw >> 1));
    const y0 = Math.max(0, y - (kh >> 1));
    const x1 = Math.min(w, x + (kw >> 1) + 1);
    const y1 = Math.min(h2, y + (kh >> 1) + 1);
    const s = this.s;
    const W = w + 1;
    return s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
  }
}
function halftoneRatio(bin, rows) {
  const it = new Integral(bin);
  const { w, h: h2, data } = bin;
  let ink = 0;
  let lone = 0;
  for (let y = 0; y < h2; y++) {
    if (rows && !rows(y)) continue;
    for (let x = 0; x < w; x++) {
      if (!data[y * w + x]) continue;
      ink++;
      if (it.box(x, y, 3, 3) <= 3) lone++;
    }
  }
  return ink ? lone / ink : 0;
}
function pinholeRatio(bin, rows) {
  const { w, h: h2, data } = bin;
  let ink = 0;
  let holes = 0;
  for (let y = 1; y < h2 - 1; y++) {
    if (rows && !rows(y)) continue;
    for (let x = 1; x < w - 1; x++) {
      const i2 = y * w + x;
      if (data[i2]) {
        ink++;
        continue;
      }
      const n2 = data[i2 - w - 1] + data[i2 - w] + data[i2 - w + 1] + data[i2 - 1] + data[i2 + 1] + data[i2 + w - 1] + data[i2 + w] + data[i2 + w + 1];
      if (n2 >= 6) holes++;
    }
  }
  return ink ? holes / ink : 0;
}
function fillPinholes(bin) {
  const { w, h: h2, data } = bin;
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let y = 1; y < h2 - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i2 = y * w + x;
        if (data[i2]) continue;
        const n4 = data[i2 - w] + data[i2 - 1] + data[i2 + 1] + data[i2 + w];
        const n2 = n4 + data[i2 - w - 1] + data[i2 - w + 1] + data[i2 + w - 1] + data[i2 + w + 1];
        if (n2 >= 6 || n4 === 4) add.push(i2);
      }
    }
    if (!add.length) break;
    for (const i2 of add) data[i2] = 1;
  }
}
const PINHOLE_RATIO = 0.012;
const HALFTONE_RATIO = 0.25;
const HALFTONE_BAND = 2;
const SPECK_TILE = 64;
function speckTiles(bin) {
  const { w, h: h2, data } = bin;
  const cols = Math.ceil(w / SPECK_TILE);
  const rows = Math.ceil(h2 / SPECK_TILE);
  const count = new Uint16Array(cols * rows);
  for (let y = 1; y < h2 - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (data[y * w + x] && isolated$1(data, w, x, y)) count[(y / SPECK_TILE | 0) * cols + (x / SPECK_TILE | 0)]++;
  return { cols, rows, count };
}
function dropSpecks(bin, min) {
  const { w, h: h2, data } = bin;
  const t2 = speckTiles(bin);
  const hot = new Uint8Array(t2.cols * t2.rows);
  let n2 = 0;
  for (let r4 = 0; r4 < t2.rows; r4++)
    for (let c2 = 0; c2 < t2.cols; c2++) {
      if (t2.count[r4 * t2.cols + c2] < min) continue;
      n2++;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r4 + dr, cc = c2 + dc;
          if (rr >= 0 && cc >= 0 && rr < t2.rows && cc < t2.cols) hot[rr * t2.cols + cc] = 1;
        }
    }
  if (!n2) return 0;
  const kill = [];
  for (let y = 1; y < h2 - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (hot[(y / SPECK_TILE | 0) * t2.cols + (x / SPECK_TILE | 0)] && data[y * w + x] && isolated$1(data, w, x, y)) kill.push(y * w + x);
  for (const i2 of kill) data[i2] = 0;
  return n2;
}
function isolated$1(data, w, x, y) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && data[(y + dy) * w + x + dx]) return false;
  return true;
}
const DOT_SCAN = 60;
const SPECK_K = 3;
const GAP_K = 8;
const DOT_PCT = 0.9;
function descreenMorph(bin, inBand = () => true) {
  const inkDots = components(bin, 1, 8, (n2) => n2 <= DOT_SCAN).filter((b) => inBand((b.y0 + b.y1) / 2)).map((b) => b.px.length);
  areaOpen(bin, Math.max(2, quantile$1(inkDots, DOT_PCT) * SPECK_K));
  const gaps = components(bin, 0, 4, (n2) => n2 <= DOT_SCAN).filter((b) => !b.edge && inBand((b.y0 + b.y1) / 2)).map((b) => b.px.length);
  const gap = Math.max(1, quantile$1(gaps, DOT_PCT));
  areaClose(bin, gap * GAP_K);
  close(bin, Math.max(1, Math.round(Math.sqrt(gap))));
}
function estimateUnit(bin) {
  const lines = findStaffLines(bin);
  const groups = groupStaves(lines);
  if (!groups.length) return null;
  const spaces = groups.map((g2) => g2.space).sort((a, b) => a - b);
  const thicks = groups.flatMap((g2) => g2.lines.map((l2) => l2.y1 - l2.y0 + 1)).sort((a, b) => a - b);
  const space = spaces[spaces.length >> 1];
  const lineThick = thicks[thicks.length >> 1];
  return { lineThick, space, height: space * 4 };
}
const LINE_INK_RATIO = 0.3;
function findStaffLines(bin) {
  const { w, h: h2, data } = bin;
  const th = w * LINE_INK_RATIO;
  const maxThick = Math.max(6, h2 * 0.01);
  const maxGap = w * 0.05;
  const bands = [];
  const rowInk = new Uint32Array(h2);
  let start = -1;
  for (let y = 0; y < h2; y++) {
    let n2 = 0;
    const row = y * w;
    for (let x = 0; x < w; x++) n2 += data[row + x];
    rowInk[y] = n2;
    if (n2 > th) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0) bands.push([start, h2 - 1]);
  const out = [];
  for (const [b0, b1] of bands) {
    let peak = b0;
    for (let y = b0; y <= b1; y++) if (rowInk[y] > rowInk[peak]) peak = y;
    let p0 = peak, p1 = peak;
    while (p0 > b0 && rowInk[p0 - 1] >= rowInk[peak] * 0.8) p0--;
    while (p1 < b1 && rowInk[p1 + 1] >= rowInk[peak] * 0.8) p1++;
    if (b1 - b0 + 1 > maxThick) continue;
    const y0 = b0, y1 = b1;
    const ink = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      let v2 = 0;
      for (let y = y0; y <= y1; y++) v2 |= data[y * w + x];
      ink[x] = v2;
    }
    const runMin = Math.max(4, Math.round(maxGap / 4));
    let left = -1;
    for (let x = 0; x + runMin <= w; x++) {
      let ok = true;
      for (let k2 = 0; k2 < runMin; k2++)
        if (!ink[x + k2]) {
          ok = false;
          x += k2;
          break;
        }
      if (ok) {
        left = x;
        break;
      }
    }
    if (left < 0) continue;
    let right2 = left;
    let gap = 0;
    for (let x = left; x < w; x++) {
      if (ink[x]) {
        right2 = x;
        gap = 0;
      } else if (++gap > maxGap) break;
    }
    out.push({ y: (y0 + y1) / 2, peak: [p0, p1], y0, y1, left, right: right2 });
  }
  return out;
}
const TRACE_GAP = 3;
function traceLeft(bin, left, y0, y1) {
  const { w, h: h2, data } = bin;
  let lo = Math.floor(y0);
  let hi = Math.ceil(y1);
  const thick = hi - lo + 1;
  let gap = 0;
  let best = left;
  for (let x = left - 1; x >= 0; x--) {
    let a = -1;
    let b = -1;
    for (let y = Math.max(0, lo - 1); y <= Math.min(h2 - 1, hi + 1); y++)
      if (data[y * w + x]) {
        if (a < 0) a = y;
        b = y;
      }
    if (a < 0) {
      if (++gap > TRACE_GAP) break;
      continue;
    }
    gap = 0;
    best = x;
    if (b - a + 1 <= thick + 1) lo = a, hi = b;
  }
  return best;
}
const LEFT_SPREAD = 3;
function spacing(five) {
  const ds = [1, 2, 3, 4].map((k2) => five[k2].y - five[k2 - 1].y);
  const avg = ds.reduce((a, b) => a + b, 0) / 4;
  return { avg, dev: avg > 0 ? Math.max(...ds.map((d2) => Math.abs(d2 - avg))) / avg : Infinity };
}
function groupStaves(lines) {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const out = [];
  for (let i2 = 0; i2 + 4 < sorted.length; ) {
    const five = sorted.slice(i2, i2 + 5);
    const sRaw = spacing(five);
    const sPk = spacing(five.map((l2) => ({ ...l2, y: l2.peak ? (l2.peak[0] + l2.peak[1]) / 2 : l2.y })));
    const usePeak = sRaw.dev <= 0.3 && sPk.dev < sRaw.dev - 0.05;
    const { avg, dev } = usePeak ? sPk : sRaw;
    const left = Math.max(...five.map((l2) => l2.left));
    const right2 = Math.min(...five.map((l2) => l2.right));
    const shortest = Math.min(...five.map((l2) => l2.right - l2.left));
    const spread = Math.max(...five.map((l2) => l2.left)) - Math.min(...five.map((l2) => l2.left));
    const longest = Math.max(...five.map((l2) => l2.right - l2.left));
    if (dev <= 0.2 && right2 - left >= shortest * 0.8 && shortest >= longest * 0.25 && spread <= avg * LEFT_SPREAD) {
      if (usePeak) {
        for (const l2 of five)
          if (l2.peak) l2.y = (l2.peak[0] + l2.peak[1]) / 2, l2.y0 = l2.peak[0], l2.y1 = l2.peak[1];
      }
      out.push({ lines: five, space: avg });
      i2 += 5;
    } else i2++;
  }
  return out;
}
function localLineModel(bin, lineYs, left, right2, unit) {
  const sp = unit.space;
  const bw = Math.max(4, Math.round(sp));
  const x0 = Math.max(0, Math.round(left));
  const x1 = Math.min(bin.w - 1, Math.round(right2));
  const nb = Math.max(1, Math.ceil((x1 - x0 + 1) / bw));
  const maxRun = unit.lineThick * 2.5;
  const reach = sp * 0.35;
  const meas = lineYs.map((ly) => {
    const out = new Float64Array(nb).fill(NaN);
    for (let b = 0; b < nb; b++) {
      const cs = [];
      for (let x = x0 + b * bw; x < Math.min(x1 + 1, x0 + (b + 1) * bw); x++) {
        let best = NaN;
        for (let y = Math.max(0, Math.round(ly - reach)); y <= Math.min(bin.h - 2, Math.round(ly + reach)); y++) {
          if (!bin.data[y * bin.w + x]) continue;
          let e = y;
          while (e + 1 < bin.h && bin.data[(e + 1) * bin.w + x]) e++;
          let s = y;
          while (s > 0 && bin.data[(s - 1) * bin.w + x]) s--;
          if (e - s + 1 <= maxRun) {
            const c2 = (s + e) / 2;
            if (isNaN(best) || Math.abs(c2 - ly) < Math.abs(best - ly)) best = c2;
          }
          y = e;
        }
        if (!isNaN(best)) cs.push(best);
      }
      if (cs.length >= Math.max(2, bw / 4)) {
        cs.sort((a, b2) => a - b2);
        out[b] = cs[cs.length >> 1];
      }
    }
    return out;
  });
  const shift = new Float64Array(nb).fill(NaN);
  for (let b = 0; b < nb; b++) {
    const ds = meas.map((m2, k2) => m2[b] - lineYs[k2]).filter((d2) => !isNaN(d2)).sort((a, c2) => a - c2);
    if (ds.length >= 3) shift[b] = ds[ds.length >> 1];
  }
  const idx = [...shift.keys()].filter((i2) => !isNaN(shift[i2]));
  if (!idx.length) return () => lineYs;
  for (let i2 = 0; i2 < nb; i2++) {
    if (!isNaN(shift[i2])) continue;
    const lo = idx.filter((j2) => j2 < i2).pop();
    const hi = idx.find((j2) => j2 > i2);
    shift[i2] = lo === void 0 ? shift[hi] : hi === void 0 ? shift[lo] : shift[lo] + (shift[hi] - shift[lo]) * (i2 - lo) / (hi - lo);
  }
  const sm = shift.map((_, i2) => [shift[Math.max(0, i2 - 1)], shift[i2], shift[Math.min(nb - 1, i2 + 1)]].sort((a, c2) => a - c2)[1]);
  return (x) => {
    const t2 = (x - x0) / bw - 0.5;
    const i2 = Math.max(0, Math.min(nb - 1, Math.floor(t2)));
    const j2 = Math.min(nb - 1, i2 + 1);
    const f2 = Math.max(0, Math.min(1, t2 - i2));
    const d2 = sm[i2] + (sm[j2] - sm[i2]) * f2;
    return lineYs.map((y) => y + d2);
  };
}
function pitchPos(ys, y) {
  if (y <= ys[0]) return (y - ys[0]) / (ys[1] - ys[0]) * 2;
  if (y >= ys[4]) return 8 + (y - ys[4]) / (ys[4] - ys[3]) * 2;
  let k2 = 0;
  while (k2 < 3 && y > ys[k2 + 1]) k2++;
  return k2 * 2 + (y - ys[k2]) / (ys[k2 + 1] - ys[k2]) * 2;
}
function pitchY(ys, p2) {
  if (p2 <= 0) return ys[0] + p2 / 2 * (ys[1] - ys[0]);
  if (p2 >= 8) return ys[4] + (p2 - 8) / 2 * (ys[4] - ys[3]);
  const k2 = Math.min(3, Math.floor(p2 / 2));
  return ys[k2] + (p2 / 2 - k2) * (ys[k2 + 1] - ys[k2]);
}
const median$6 = (a) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
const INK_FLIP_RATIO = 0.5;
async function rasterizePage(page, OPS) {
  const list = await page.getOperatorList();
  let best = null;
  for (let i2 = 0; i2 < list.fnArray.length; i2++) {
    const fn = list.fnArray[i2];
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintImageMaskXObject) continue;
    const arg = list.argsArray[i2][0];
    const id = arg && typeof arg === "object" ? arg.data : arg;
    if (typeof id !== "string") continue;
    const obj = await new Promise((r4) => page.objs.get(id, r4)).catch(() => null);
    if (!obj?.data || !obj.width || !obj.height) continue;
    if (!best || obj.width * obj.height > best.width * best.height) best = obj;
  }
  if (!best) return null;
  const w = best.width;
  const h2 = best.height;
  const packed = Math.ceil(w / 8) * h2;
  const kind = best.data.length === packed ? best.kind === 1 ? "gray1" : "mask" : "rgb";
  let bin = decodeImage(best, w, h2);
  if (!bin) return null;
  let up = 1;
  if (kind === "rgb") {
    const build = (k2, first) => {
      const b = first ?? decodeImage(best, w, h2, k2);
      if (!b) return null;
      const u0 = estimateUnit(prepared(b));
      if (u0 && u0.space < UPSCALE_SPACE && u0.lineThick / u0.space < UPSCALE_THIN) {
        const big = decodeImage(best, w, h2, k2, 2);
        if (big) return { bin: big, up: 2 };
      }
      return { bin: b, up: 1 };
    };
    let got = build(SAUVOLA_K, bin);
    if (got && !staffScore(prepared(got.bin)))
      for (const k2 of SAUVOLA_K_RETRY) {
        const g2 = build(k2, null);
        if (g2 && staffScore(prepared(g2.bin))) {
          got = g2;
          break;
        }
      }
    if (got) bin = got.bin, up = got.up;
  }
  let faint = false;
  let gray;
  if (kind === "rgb") {
    const u2 = estimateUnit(prepared(bin));
    const soft = u2 && u2.lineThick / u2.space < FAINT_RATIO ? decodeImage(best, w, h2, SAUVOLA_K_FAINT, up) : null;
    if (soft && u2) mergeVertical(bin, soft, Math.round(u2.space * VERT_RUN)), faint = true, gray = grayOf(best, w, h2, up) ?? void 0;
  }
  let ink = 0;
  for (let i2 = 0; i2 < bin.data.length; i2++) ink += bin.data[i2];
  if (ink > bin.w * bin.h * INK_FLIP_RATIO) for (let i2 = 0; i2 < bin.data.length; i2++) bin.data[i2] ^= 1;
  let halftone = cleanTexture(bin, true);
  const lyricGray = kind === "rgb" && !gray ? grayOf(best, w, h2, up) ?? void 0 : void 0;
  const lineSoft = kind === "rgb" ? decodeImage(best, w, h2, SAUVOLA_K_FAINT, up) : null;
  const also = [gray, lyricGray, lineSoft?.data].filter((g2) => !!g2);
  dewarpPage(bin, also);
  deskew(bin, also);
  levelStaves(bin, also);
  if (lineSoft) {
    const u2 = estimateUnit(bin);
    if (u2) {
      const trial = { ...bin, data: new Uint8Array(bin.data) };
      mergeHorizontal(trial, lineSoft, Math.round(u2.space * LINE_RUN), Math.max(2, Math.round(u2.lineThick * 2)), Math.max(1, Math.round(u2.lineThick)));
      if (staffCount(trial) > staffCount(bin)) bin.data.set(trial.data);
    }
  }
  if (halftone == null) halftone = cleanTexture(bin, false);
  const vp = page.getViewport({ scale: 1 });
  return { bin, kind, halftone: halftone ?? 0, faint, gray, lyricGray, scale: vp.width / bin.w, pageWidth: vp.width, pageHeight: vp.height };
}
function levelStaves(bin, also) {
  const staves = (b) => {
    const lines = findStaffLines(b);
    return completeStaffLines(b, lines, groupStaves(lines), false).groups;
  };
  const groups = staves(bin);
  const curves = residualCurves(bin, groups);
  if (!curves) return false;
  const keep = new Uint8Array(bin.data);
  applyTrackWarp(bin, curves);
  if (staves(bin).length < groups.length) {
    bin.data.set(keep);
    return false;
  }
  if (also.length) applyTrackWarp({ ...bin, data: new Uint8Array(bin.w * bin.h) }, curves, also);
  return true;
}
const BROKEN_RATIO = 0.6;
const DEWARP_GAIN = 1.15;
function staffScore(bin) {
  return groupStaves(findStaffLines(bin)).length;
}
function staffCount(bin) {
  const lines = findStaffLines(bin);
  return completeStaffLines(bin, lines, groupStaves(lines)).groups.length;
}
function completedAfterDeskew(bin) {
  const straight2 = { ...bin, data: new Uint8Array(bin.data) };
  deskew(straight2);
  const lines = findStaffLines(straight2);
  return completeStaffLines(straight2, lines, groupStaves(lines), false).groups.length;
}
const SPECK_MIN = 40;
function cleanTexture(bin, allowDescreen) {
  const groups = groupStaves(findStaffLines(bin));
  if (!groups.length) return null;
  const space = median$6(groups.map((g2) => g2.space));
  if (!(space > 0)) return null;
  const inBand = (y) => groups.some((g2) => y > g2.lines[0].y - g2.space * HALFTONE_BAND && y < g2.lines[4].y + g2.space * HALFTONE_BAND);
  const halftone = halftoneRatio(bin, inBand);
  if (halftone > HALFTONE_RATIO && allowDescreen) descreenMorph(bin, inBand);
  else if (pinholeRatio(bin, inBand) > PINHOLE_RATIO) fillPinholes(bin);
  dropSpecks(bin, SPECK_MIN);
  return halftone;
}
function dewarpPage(bin, also = []) {
  const curves = trackCurves(bin);
  if (!curves) return false;
  const before = staffScore(bin);
  if (before >= curves.length * BROKEN_RATIO) return false;
  const keep = new Uint8Array(bin.data);
  applyTrackWarp(bin, curves);
  const after = staffScore(bin);
  if (after > before && after >= before * DEWARP_GAIN) {
    if (completedAfterDeskew(bin) >= completedAfterDeskew({ ...bin, data: keep })) {
      if (also.length) applyTrackWarp({ ...bin, data: new Uint8Array(bin.w * bin.h) }, curves, also);
      return true;
    }
  }
  bin.data.set(keep);
  return false;
}
const MAX_SLOPE = 0.015;
const SLOPE_STEP = 5e-4;
const STEPS = Math.round(MAX_SLOPE / SLOPE_STEP);
const LINE_INK_RATIO_SKEW = 0.75;
const SKEW_GAIN = 1.15;
const MIN_SLOPE = 4e-4;
function deskew(bin, also = []) {
  const { w, h: h2, data } = bin;
  const xs = [];
  const ys = [];
  for (let y = 0; y < h2; y++) {
    const row = y * w;
    for (let x = 0; x < w; x += 2)
      if (data[row + x]) {
        xs.push(x - (w >> 1));
        ys.push(y);
      }
  }
  if (xs.length < 1e3) return 0;
  const hist = new Int32Array(h2 + 2 * Math.ceil(MAX_SLOPE * w) + 4);
  const off = Math.ceil(MAX_SLOPE * w) + 2;
  const need = w / 2 * LINE_INK_RATIO_SKEW;
  let best = 0;
  let bestLines = -1;
  let bestSharp = -1;
  let zeroLines = 0;
  for (let k2 = -STEPS; k2 <= STEPS; k2++) {
    const s = k2 * SLOPE_STEP;
    hist.fill(0);
    for (let i2 = 0; i2 < xs.length; i2++) hist[ys[i2] + Math.round(s * xs[i2]) + off | 0]++;
    let lines = 0;
    let sharp = 0;
    for (let i2 = 0; i2 < hist.length; i2++) {
      if (hist[i2] >= need) lines++;
      sharp += hist[i2] * hist[i2];
    }
    if (k2 === 0) zeroLines = lines;
    if (lines > bestLines || lines === bestLines && (sharp > bestSharp || sharp === bestSharp && Math.abs(s) < Math.abs(best))) {
      bestLines = lines;
      bestSharp = sharp;
      best = s;
    }
  }
  if (Math.abs(best) < MIN_SLOPE) return 0;
  if (bestLines < zeroLines * SKEW_GAIN) return 0;
  const out = new Uint8Array(w * h2);
  for (let x = 0; x < w; x++) {
    const dy = Math.round(best * (x - (w >> 1)));
    for (let y = 0; y < h2; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= h2) continue;
      out[y * w + x] = data[sy * w + x];
    }
  }
  data.set(out);
  for (const a of also) {
    const o = new Uint8Array(w * h2).fill(255);
    for (let x = 0; x < w; x++) {
      const dy = Math.round(best * (x - (w >> 1)));
      for (let y = 0; y < h2; y++) {
        const sy = y - dy;
        if (sy >= 0 && sy < h2) o[y * w + x] = a[sy * w + x];
      }
    }
    a.set(o);
  }
  return best;
}
function decodeImage(obj, w, h2, k2 = SAUVOLA_K, up = 1) {
  const src = obj.data;
  const data = new Uint8Array(w * h2);
  const packed = Math.ceil(w / 8) * h2;
  if (src.length === packed) {
    const stride = Math.ceil(w / 8);
    for (let y = 0; y < h2; y++) {
      const row = y * stride;
      const out = y * w;
      for (let x = 0; x < w; x++) data[out + x] = src[row + (x >> 3)] >> 7 - (x & 7) & 1;
    }
    return { w, h: h2, data };
  }
  const gray = grayOf(obj, w, h2, up);
  if (!gray) return null;
  if (up > 1) {
    const out = new Uint8Array(w * up * h2 * up);
    sauvola(gray, w * up, h2 * up, out, k2);
    return { w: w * up, h: h2 * up, data: out };
  }
  sauvola(gray, w, h2, data, k2);
  return { w, h: h2, data };
}
function grayOf(obj, w, h2, up = 1) {
  const src = obj.data;
  const step = src.length === w * h2 * 4 ? 4 : src.length === w * h2 * 3 ? 3 : src.length === w * h2 ? 1 : 0;
  if (!step) return null;
  const gray = new Uint8Array(w * h2);
  for (let i2 = 0, p2 = 0; i2 < gray.length; i2++, p2 += step) {
    gray[i2] = step === 1 ? src[p2] : src[p2] * 0.299 + src[p2 + 1] * 0.587 + src[p2 + 2] * 0.114 | 0;
  }
  return up > 1 ? upsample(gray, w, h2, up) : gray;
}
function upsample(gray, w, h2, up) {
  const W = w * up;
  const H2 = h2 * up;
  const out = new Uint8Array(W * H2);
  for (let Y = 0; Y < H2; Y++) {
    const fy = Math.min(h2 - 1, Math.max(0, (Y + 0.5) / up - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h2 - 1, y0 + 1);
    const ty = fy - y0;
    for (let X = 0; X < W; X++) {
      const fx = Math.min(w - 1, Math.max(0, (X + 0.5) / up - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const a = gray[y0 * w + x0] * (1 - tx) + gray[y0 * w + x1] * tx;
      const b = gray[y1 * w + x0] * (1 - tx) + gray[y1 * w + x1] * tx;
      out[Y * W + X] = a * (1 - ty) + b * ty + 0.5 | 0;
    }
  }
  return out;
}
const SAUVOLA_WIN = 1 / 40;
const SAUVOLA_K = 0.5;
const SAUVOLA_R = 128;
const SAUVOLA_K_RETRY = [0.35, 0.2, 0.1];
const SAUVOLA_K_FAINT = 0.2;
const VERT_RUN = 1.5;
const UPSCALE_SPACE = 14;
const UPSCALE_THIN = 0.22;
const FAINT_RATIO = 0.06;
function mergeVertical(bin, soft, minRun) {
  const { w, h: h2 } = bin;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h2; ) {
      if (!soft.data[y * w + x]) {
        y++;
        continue;
      }
      let e = y;
      while (e + 1 < h2 && soft.data[(e + 1) * w + x]) e++;
      if (e - y + 1 >= minRun) for (let k2 = y; k2 <= e; k2++) bin.data[k2 * w + x] = 1;
      y = e + 1;
    }
}
function mergeHorizontal(bin, soft, minRun, maxThick, gapTol) {
  const { w, h: h2 } = bin;
  const fill = [];
  const thin = (x, y) => {
    let a = y, b = y;
    while (a > 0 && soft.data[(a - 1) * w + x] && y - a < maxThick) a--;
    while (b + 1 < h2 && soft.data[(b + 1) * w + x] && b - y < maxThick) b++;
    return b - a + 1 <= maxThick;
  };
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w; ) {
      if (!soft.data[y * w + x] || !thin(x, y)) {
        x++;
        continue;
      }
      let e = x;
      while (e + 1 < w && soft.data[y * w + e + 1] && thin(e + 1, y)) e++;
      if (e - x + 1 >= minRun)
        for (let k2 = x; k2 <= e; k2++) {
          let has = false;
          for (let d2 = -gapTol; d2 <= gapTol && !has; d2++) if (y + d2 >= 0 && y + d2 < h2 && bin.data[(y + d2) * w + k2]) has = true;
          if (!has) fill.push(y * w + k2);
        }
      x = e + 1;
    }
  for (const i2 of fill) bin.data[i2] = 1;
}
const LINE_RUN = 3;
function prepared(bin) {
  const b = { ...bin, data: new Uint8Array(bin.data) };
  deskew(b);
  return b;
}
function sauvola(gray, w, h2, out, k2 = SAUVOLA_K) {
  const r4 = Math.max(8, Math.round(w * SAUVOLA_WIN));
  const S1 = new Float64Array((w + 1) * (h2 + 1));
  const S2 = new Float64Array((w + 1) * (h2 + 1));
  for (let y = 0; y < h2; y++) {
    let r1 = 0;
    let r22 = 0;
    for (let x = 0; x < w; x++) {
      const v2 = gray[y * w + x];
      r1 += v2;
      r22 += v2 * v2;
      S1[(y + 1) * (w + 1) + x + 1] = S1[y * (w + 1) + x + 1] + r1;
      S2[(y + 1) * (w + 1) + x + 1] = S2[y * (w + 1) + x + 1] + r22;
    }
  }
  const box = (S, x0, y0, x1, y1) => S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
  for (let y = 0; y < h2; y++) {
    const y0 = Math.max(0, y - r4);
    const y1 = Math.min(h2, y + r4 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r4);
      const x1 = Math.min(w, x + r4 + 1);
      const n2 = (x1 - x0) * (y1 - y0);
      const m2 = box(S1, x0, y0, x1, y1) / n2;
      const v2 = Math.max(0, box(S2, x0, y0, x1, y1) / n2 - m2 * m2);
      const t2 = m2 * (1 + k2 * (Math.sqrt(v2) / SAUVOLA_R - 1));
      out[y * w + x] = gray[y * w + x] <= t2 ? 1 : 0;
    }
  }
}
function inkRatio(bin) {
  let n2 = 0;
  for (let i2 = 0; i2 < bin.data.length; i2++) n2 += bin.data[i2];
  return n2 / (bin.w * bin.h);
}
function binToPgm(bin) {
  const head = new TextEncoder().encode(`P5
${bin.w} ${bin.h}
255
`);
  const out = new Uint8Array(head.length + bin.w * bin.h);
  out.set(head, 0);
  for (let i2 = 0; i2 < bin.data.length; i2++) out[head.length + i2] = bin.data[i2] ? 0 : 255;
  return out;
}
const BEAM_PAD = 2;
const PAD_LW = 2;
const LEFTINK_OUT = 3.5;
const LEFTINK_IN = 0.5;
const LEFTINK_FRAC = 0.9;
const VSEG_MIN_H = 1.4;
const LEDGER_BEAM_W = 2.5;
const LEDGER_BEAM_THICK = 0.22;
function vRuns(bin) {
  const { w, h: h2, data } = bin;
  const out = new Uint16Array(w * h2);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h2) {
      if (!data[y * w + x]) {
        y++;
        continue;
      }
      let y2 = y;
      while (y2 + 1 < h2 && data[(y2 + 1) * w + x]) y2++;
      const len = y2 - y + 1;
      for (let k2 = y; k2 <= y2; k2++) out[k2 * w + x] = len;
      y = y2 + 1;
    }
  }
  return out;
}
function hRuns(bin) {
  const { w, h: h2, data } = bin;
  const out = new Uint16Array(w * h2);
  for (let y = 0; y < h2; y++) {
    const row = y * w;
    let x = 0;
    while (x < w) {
      if (!data[row + x]) {
        x++;
        continue;
      }
      let x2 = x;
      while (x2 + 1 < w && data[row + x2 + 1]) x2++;
      const len = x2 - x + 1;
      for (let k2 = x; k2 <= x2; k2++) out[row + k2] = len;
      x = x2 + 1;
    }
  }
  return out;
}
function close1d(mask, w, h2, r4, horizontal) {
  if (r4 < 1) return mask;
  const out = new Uint8Array(mask.length);
  const n2 = horizontal ? h2 : w;
  const m2 = horizontal ? w : h2;
  const at = (i2, j2) => horizontal ? i2 * w + j2 : j2 * w + i2;
  const gap = new Uint8Array(m2);
  for (let i2 = 0; i2 < n2; i2++) {
    for (let j2 = 0; j2 < m2; j2++) gap[j2] = mask[at(i2, j2)];
    let last = -1;
    for (let j2 = 0; j2 < m2; j2++) {
      if (!gap[j2]) continue;
      if (last >= 0 && j2 - last <= r4 * 2) for (let k2 = last + 1; k2 < j2; k2++) out[at(i2, k2)] = 1;
      out[at(i2, j2)] = 1;
      last = j2;
    }
  }
  return out;
}
function comps(mask, w, h2, minArea) {
  return connectedComponents({ w, h: h2, data: mask }, minArea);
}
function centerLine(mask, w, c2, horizontal) {
  const b = c2.bbox;
  if (horizontal) {
    const q22 = Math.max(1, Math.round(b.w / 4));
    const meanY = (x0, x1) => {
      let s = 0;
      let n2 = 0;
      for (let x = x0; x < x1; x++)
        for (let y = b.y; y < b.y + b.h; y++)
          if (mask[y * w + x]) {
            s += y;
            n2++;
          }
      return n2 ? s / n2 : b.y + b.h / 2;
    };
    return { x0: b.x, y0: meanY(b.x, b.x + q22), x1: b.x + b.w - 1, y1: meanY(b.x + b.w - q22, b.x + b.w), lw: c2.area / Math.max(b.w, 1), maxLw: b.h };
  }
  const q2 = Math.max(1, Math.round(b.h / 4));
  const meanX = (y0, y1) => {
    let s = 0;
    let n2 = 0;
    for (let y = y0; y < y1; y++)
      for (let x = b.x; x < b.x + b.w; x++)
        if (mask[y * w + x]) {
          s += x;
          n2++;
        }
    return n2 ? s / n2 : b.x + b.w / 2;
  };
  return { x0: meanX(b.y, b.y + q2), y0: b.y, x1: meanX(b.y + b.h - q2, b.y + b.h), y1: b.y + b.h - 1, lw: c2.area / Math.max(b.h, 1), maxLw: b.w };
}
const NARROW_STEM = 3;
const INK_RUN_STEM = 2.5;
function barColumnNear(bin, x, maxLw, bands) {
  const { w, data } = bin;
  const half = Math.max(1, Math.ceil(maxLw / 2));
  const near = half + 1;
  const far = half + Math.max(2, Math.round(maxLw * 2));
  const cx2 = Math.round(x);
  for (const [t2, bt] of bands) {
    const top = Math.round(t2), bot = Math.round(bt);
    for (let d2 = near; d2 <= far; d2++)
      for (const xx of [cx2 - d2, cx2 + d2]) {
        if (xx < 0 || xx >= w) continue;
        let n2 = 0;
        for (let y = top; y <= bot; y++) if (data[y * w + xx]) n2++;
        if (n2 >= (bot - top + 1) * 0.95) return true;
      }
  }
  return false;
}
function modalRowWidth(mask, w, c2) {
  const b = c2.bbox;
  const n2 = /* @__PURE__ */ new Map();
  for (let y = b.y; y < b.y + b.h; y++) {
    let a = -1, z = -1;
    for (let x = b.x; x < b.x + b.w; x++) if (mask[y * w + x]) {
      if (a < 0) a = x;
      z = x;
    }
    if (a >= 0) n2.set(z - a + 1, (n2.get(z - a + 1) ?? 0) + 1);
  }
  let best = 1, cnt = 0;
  for (const [k2, v2] of n2) if (v2 > cnt || v2 === cnt && k2 < best) best = k2, cnt = v2;
  return best;
}
function narrowPart(mask, w, c2, lw, unit) {
  const b = c2.bbox;
  if (b.w <= lw * 2) return null;
  let best = null;
  let start = -1;
  const rows = [];
  for (let y = b.y; y <= b.y + b.h; y++) {
    let a = -1, z = -1;
    if (y < b.y + b.h) {
      for (let x2 = b.x; x2 < b.x + b.w; x2++) if (mask[y * w + x2]) {
        if (a < 0) a = x2;
        z = x2;
      }
    }
    const ok = a >= 0 && z - a + 1 <= lw + 2;
    rows.push([a, z]);
    if (ok && start < 0) start = y;
    if (!ok && start >= 0) {
      if (!best || y - start > best[1] - best[0]) best = [start, y];
      start = -1;
    }
  }
  if (!best || best[1] - best[0] < unit.space * NARROW_STEM) return null;
  let sx = 0, n2 = 0, maxW = 0;
  for (let y = best[0]; y < best[1]; y++) {
    const [a, z] = rows[y - b.y];
    sx += (a + z) / 2;
    n2++;
    maxW = Math.max(maxW, z - a + 1);
  }
  const x = sx / n2;
  return { x0: x, y0: best[0], x1: x, y1: best[1] - 1, lw: maxW, maxLw: maxW };
}
function inkRun$1(bin, s, unit, staffBands) {
  if (!s) return null;
  const { w, data } = bin;
  const x = Math.round(s.x0);
  const half = Math.ceil(s.maxLw / 2);
  const runs = [];
  let start = -1;
  for (let y = Math.round(s.y0); y <= Math.round(s.y1) + 1; y++) {
    let ink = false;
    if (y <= s.y1) for (let xx = Math.max(0, x - half); xx <= Math.min(w - 1, x + half) && !ink; xx++) ink = data[y * w + xx] === 1;
    if (ink && start < 0) start = y;
    if (!ink && start >= 0) {
      runs.push([start, y - 1]);
      start = -1;
    }
  }
  if (!runs.length) return null;
  const far = ([a, b]) => staffBands.every(([t2, bot]) => b < t2 - unit.space * 2 || a > bot + unit.space * 2);
  let k2 = 0;
  for (let i2 = 1; i2 < runs.length; i2++) if (runs[i2][1] - runs[i2][0] > runs[k2][1] - runs[k2][0]) k2 = i2;
  let lo = k2, hi = k2;
  while (lo > 0 && !far(runs[lo - 1])) lo--;
  while (hi + 1 < runs.length && !far(runs[hi + 1])) hi++;
  const y0 = runs[lo][0], y1 = runs[hi][1];
  if (y1 - y0 + 1 < unit.space * INK_RUN_STEM) return null;
  return { ...s, y0, y1 };
}
function isolated(bin, s, vertical) {
  const { w, h: h2, data } = bin;
  const half = Math.max(1, Math.ceil(s.maxLw / 2));
  const near = half + 1;
  const far = half + Math.max(2, Math.round(s.maxLw * 2));
  let n2 = 0;
  let a = 0;
  if (vertical) {
    const cx2 = Math.round((s.x0 + s.x1) / 2);
    for (let y = Math.round(Math.min(s.y0, s.y1)); y <= Math.round(Math.max(s.y0, s.y1)); y++) {
      if (y < 0 || y >= h2) continue;
      n2++;
      let hit = 0;
      for (let d2 = near; d2 <= far && !hit; d2++) {
        if (cx2 - d2 >= 0) hit |= data[y * w + cx2 - d2];
        if (cx2 + d2 < w) hit |= data[y * w + cx2 + d2];
      }
      a += hit;
    }
  } else {
    const cy2 = Math.round((s.y0 + s.y1) / 2);
    for (let x = Math.round(Math.min(s.x0, s.x1)); x <= Math.round(Math.max(s.x0, s.x1)); x++) {
      if (x < 0 || x >= w) continue;
      n2++;
      let hit = 0;
      for (let d2 = near; d2 <= far && !hit; d2++) {
        if (cy2 - d2 >= 0) hit |= data[(cy2 - d2) * w + x];
        if (cy2 + d2 < h2) hit |= data[(cy2 + d2) * w + x];
      }
      a += hit;
    }
  }
  return n2 === 0 || a < n2 * 0.5;
}
const LEDGER_OWN_SPACE = [0.04, 0.3];
function ledgerGrid(lineYs, unit) {
  if (lineYs.length < 5) return () => false;
  const anchors = [];
  const sorted = [...lineYs].sort((a, b) => a - b);
  for (let i2 = 0; i2 + 4 < sorted.length; i2 += 5) {
    anchors.push(sorted[i2], sorted[i2 + 4]);
  }
  return (y) => {
    for (let i2 = 0; i2 < anchors.length; i2 += 2) {
      const top = anchors[i2];
      const bottom2 = anchors[i2 + 1];
      const own = (bottom2 - top) / 4;
      const d2 = Math.abs(own - unit.space) / unit.space;
      const sp = d2 > LEDGER_OWN_SPACE[0] && d2 < LEDGER_OWN_SPACE[1] ? own : unit.space;
      const tol = sp * 0.25;
      if (y < top) {
        const k2 = Math.round((top - y) / sp);
        if (k2 >= 1 && k2 <= 6 && Math.abs(top - k2 * sp - y) <= tol) return true;
      } else if (y > bottom2) {
        const k2 = Math.round((y - bottom2) / sp);
        if (k2 >= 1 && k2 <= 6 && Math.abs(bottom2 + k2 * sp - y) <= tol) return true;
      }
    }
    return false;
  };
}
const EXACT_HEAD_W = 0.6;
function extendVSegs(bin, segs, cap, staffBands = [], lineThick = 1) {
  const bandOf = (s) => staffBands.find(([t2, b]) => Math.abs(Math.min(s.y0, s.y1) - t2) <= 1 && Math.abs(Math.max(s.y0, s.y1) - b) <= 1);
  return segs.map((s) => {
    const out = { ...s };
    extendIntoInk(bin, out, cap);
    const band = bandOf(s);
    if (band) {
      const space = (band[1] - band[0]) / 4;
      const skip = Math.ceil(lineThick / 2) + 1;
      const x = (s.x0 + s.x1) / 2;
      const keep = (from, to) => reachesHead(bin, x, from, to, space) || straight(bin, x, from, to, s.maxLw);
      if (!keep(Math.round(s.y0) - skip, Math.round(out.y0))) out.y0 = s.y0;
      if (!keep(Math.round(s.y1) + skip, Math.round(out.y1))) out.y1 = s.y1;
    }
    return out;
  });
}
function straight(bin, x, from, to, lw) {
  const { w, h: h2, data } = bin;
  const cx2 = Math.round(x);
  const step = to >= from ? 1 : -1;
  if ((to - from) * step < 1) return false;
  let lo = Infinity, hi = -Infinity;
  for (let y = from; step > 0 ? y <= to : y >= to; y += step) {
    if (y < 0 || y >= h2 || !data[y * w + cx2]) return false;
    let a = cx2, b = cx2;
    while (a > 0 && data[y * w + a - 1]) a--;
    while (b + 1 < w && data[y * w + b + 1]) b++;
    const c2 = (a + b) / 2;
    if (b - a + 1 > lw + 2 || Math.abs(c2 - x) > 1) return false;
    lo = Math.min(lo, c2);
    hi = Math.max(hi, c2);
  }
  return hi - lo <= 1;
}
function reachesHead(bin, x, from, to, space) {
  const { w, h: h2, data } = bin;
  const cx2 = Math.round(x);
  const step = to >= from ? 1 : -1;
  for (let y = from; step > 0 ? y <= to : y >= to; y += step) {
    if (y < 0 || y >= h2 || !data[y * w + cx2]) continue;
    let a = cx2, b = cx2;
    while (a > 0 && data[y * w + a - 1]) a--;
    while (b + 1 < w && data[y * w + b + 1]) b++;
    if (b - a + 1 >= space * EXACT_HEAD_W) return true;
  }
  return false;
}
function extendIntoInk(bin, seg, cap) {
  const { w, h: h2, data } = bin;
  const ink = (x, y) => {
    if (y < 0 || y >= h2) return false;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.round(x) + dx;
      if (xx >= 0 && xx < w && data[y * w + xx]) return true;
    }
    return false;
  };
  let up = 0;
  while (up < cap && ink(seg.x0, Math.round(seg.y0) - up - 1)) up++;
  let down = 0;
  while (down < cap && ink(seg.x1, Math.round(seg.y1) + down + 1)) down++;
  seg.y0 -= up;
  seg.y1 += down;
}
function barlineCore(mask, w, c2, bands, maxW, unit) {
  const b = c2.bbox;
  const tol = unit.space * 0.5;
  const band = bands.find(([t2, bt]) => b.y <= t2 + tol && b.y + b.h - 1 >= bt - tol);
  if (!band) return null;
  const top = Math.round(band[0]), bot = Math.round(band[1]);
  const need = (bot - top + 1) * 0.95;
  const cols = [];
  for (let x2 = b.x; x2 < b.x + b.w; x2++) {
    let n2 = 0;
    for (let y = top; y <= bot; y++) if (mask[y * w + x2]) n2++;
    if (n2 >= need) cols.push(x2);
  }
  if (!cols.length) return null;
  const x0 = cols[0], x1 = cols[cols.length - 1];
  if (x1 - x0 + 1 !== cols.length || cols.length > maxW) return null;
  const x = (x0 + x1) / 2;
  return { x0: x, y0: top, x1: x, y1: bot, lw: cols.length, maxLw: cols.length };
}
function bandColumns(bin, vMask, bands, have, maxW, staffLefts, unit) {
  const { w, data } = bin;
  const out = [];
  for (const [t2, bt] of bands) {
    const top = Math.round(t2), bot = Math.round(bt);
    const need = (bot - top + 1) * 0.95;
    const thinNeed = (bot - top + 1) * 0.75;
    const full = (x) => {
      let n2 = 0;
      let m2 = 0;
      for (let y = top; y <= bot; y++) {
        if (data[y * w + x]) n2++;
        if (vMask[y * w + x]) m2++;
      }
      return n2 >= need && m2 >= thinNeed;
    };
    for (let x = 0; x < w; x++) {
      if (!full(x)) continue;
      const x0 = x;
      while (x + 1 < w && full(x + 1)) x++;
      const cx2 = (x0 + x) / 2;
      const width = x - x0 + 1;
      if (width > maxW) continue;
      if (staffLefts.some((l2) => cx2 >= l2 - unit.space && cx2 <= l2 + unit.space * 4)) continue;
      const near = have.some(
        (s) => Math.abs((s.x0 + s.x1) / 2 - cx2) <= unit.space * 0.5 && Math.min(s.y0, s.y1) <= bot && Math.max(s.y0, s.y1) >= top
      );
      if (near) continue;
      const attached = (dir) => {
        const from = dir < 0 ? x0 - 1 : x + 1;
        let run = 0;
        let best = 0;
        for (let y = top; y <= bot; y++) {
          let len = 0;
          for (let sx = from; sx >= 0 && sx < w && data[y * w + sx] && len <= unit.space; sx += dir) len++;
          run = len >= unit.space * 0.5 ? run + 1 : 0;
          best = Math.max(best, run);
        }
        return best > unit.space * 0.4;
      };
      if (attached(-1) || attached(1)) continue;
      out.push({ x0: cx2, y0: top, x1: cx2, y1: bot, lw: width, maxLw: width });
    }
  }
  return out;
}
function findPrimitives(bin, unit, staffLineYs = [], staffLefts = [], faint = false) {
  const { w, h: h2 } = bin;
  const onGrid = ledgerGrid(staffLineYs, unit);
  const atStaffLeft = (x) => staffLefts.some((l2) => Math.abs(x - l2) <= Math.max(3, unit.lineThick * 2));
  const staffBands = [];
  {
    const ys = [...staffLineYs].sort((a, b) => a - b);
    for (let i2 = 0; i2 + 4 < ys.length; i2 += 5) staffBands.push([ys[i2], ys[i2 + 4]]);
  }
  const spansStaff = (sg) => {
    const x = (sg.x0 + sg.x1) / 2;
    if (staffLefts.some((l2) => x >= l2 - unit.space && x <= l2 + unit.space * 4)) return false;
    const t2 = Math.min(sg.y0, sg.y1);
    const b = Math.max(sg.y0, sg.y1);
    return staffBands.some(([top, bot]) => Math.abs(t2 - top) <= unit.space * 0.5 && Math.abs(b - bot) <= unit.space * 0.5);
  };
  const vr = vRuns(bin);
  const hr = hRuns(bin);
  const thin = Math.max(3, Math.min(unit.lineThick * 2, unit.space * 0.4));
  const hMask0 = new Uint8Array(w * h2);
  for (let i2 = 0; i2 < hMask0.length; i2++) if (vr[i2] && vr[i2] <= thin) hMask0[i2] = 1;
  const hMask = close1d(hMask0, w, h2, Math.round(unit.space * 0.6), true);
  const hSegs = [];
  for (const c2 of comps(hMask, w, h2, Math.max(3, unit.lineThick * 2))) {
    const cy2 = c2.bbox.y + c2.bbox.h / 2;
    if (c2.bbox.w < (onGrid(cy2) ? unit.space / 3 : unit.space)) continue;
    if (c2.bbox.h > thin * 2) continue;
    const seg = centerLine(hMask, w, c2, true);
    if (!onGrid((seg.y0 + seg.y1) / 2) && !isolated(bin, seg, false)) continue;
    hSegs.push(seg);
  }
  const vMask0 = new Uint8Array(w * h2);
  const thinV = faint ? Math.max(thin, unit.space * 0.3) : thin;
  for (let i2 = 0; i2 < vMask0.length; i2++) if (hr[i2] && hr[i2] <= thinV) vMask0[i2] = 1;
  const vMask = close1d(vMask0, w, h2, Math.round(unit.lineThick * 2), false);
  const vSegs = [];
  for (const c2 of comps(vMask, w, h2, Math.max(3, unit.lineThick * 2))) {
    if (c2.bbox.h < unit.space * VSEG_MIN_H) continue;
    if (c2.bbox.w > thinV * 2) {
      const core = barlineCore(vMask, w, c2, staffBands, thinV * 2, unit);
      if (core && !atStaffLeft(core.x0) && !staffLefts.some((l2) => core.x0 >= l2 - unit.space && core.x0 <= l2 + unit.space * 4)) vSegs.push(core);
      else if (!core) {
        const narrow = inkRun$1(bin, narrowPart(vMask, w, c2, modalRowWidth(vMask, w, c2), unit), unit, staffBands);
        if (narrow && !atStaffLeft(narrow.x0) && isolated(bin, narrow, true)) vSegs.push(narrow);
      }
      continue;
    }
    const seg = centerLine(vMask, w, c2, false);
    if (!atStaffLeft((seg.x0 + seg.x1) / 2) && !spansStaff(seg) && !isolated(bin, seg, true)) {
      const narrow = narrowPart(vMask, w, c2, seg.lw, unit);
      if (narrow && isolated(bin, narrow, true) && barColumnNear(bin, (seg.x0 + seg.x1) / 2, seg.maxLw, staffBands)) vSegs.push(narrow);
      continue;
    }
    vSegs.push(seg);
  }
  vSegs.push(...bandColumns(bin, vMask, staffBands, vSegs, thinV, staffLefts, unit));
  const bMask = new Uint8Array(w * h2);
  const bLo = Math.max(unit.space * 0.25, unit.lineThick * 1.5);
  const bHi = unit.space * 1.1;
  for (let i2 = 0; i2 < bMask.length; i2++) if (vr[i2] >= bLo && vr[i2] <= bHi && hr[i2] >= unit.space) bMask[i2] = 1;
  const bMaskC = close1d(bMask, w, h2, Math.round(unit.lineThick * 2), true);
  const beams = [];
  const stemNear = (x, b, tol) => {
    for (const v2 of vSegs) {
      const vx = (v2.x0 + v2.x1) / 2;
      if (Math.abs(vx - x) <= tol && Math.min(v2.y0, v2.y1) <= b.y + b.h + 2 && Math.max(v2.y0, v2.y1) >= b.y - 2) return vx;
    }
    return null;
  };
  const midThick = (b, xa, xb) => {
    const ts = [];
    for (let x = Math.ceil(xa); x <= Math.floor(xb); x++) {
      let best = 0;
      for (let y = b.y; y < b.y + b.h; y++) if (bMaskC[y * w + x]) best = Math.max(best, vr[y * w + x]);
      ts.push(best);
    }
    ts.sort((p2, q2) => p2 - q2);
    return ts.length ? ts[ts.length >> 1] : 0;
  };
  for (const c2 of comps(bMaskC, w, h2, Math.round(unit.space * unit.space * 0.2))) {
    const tol = Math.max(2, unit.lineThick * 2);
    let shortBeam = false;
    if (c2.bbox.w >= unit.space * SHORT_BEAM_W && c2.bbox.w < unit.space * 1.5 && c2.bbox.h <= unit.space * 1.2) {
      const xa = stemNear(c2.bbox.x, c2.bbox, tol);
      const xb = stemNear(c2.bbox.x + c2.bbox.w - 1, c2.bbox, tol);
      if (xa !== null && xb !== null && xb - xa >= unit.space * 0.7) {
        const t2 = midThick(c2.bbox, xa + tol, xb - tol) / unit.space;
        shortBeam = t2 >= SHORT_BEAM_THICK[0] && t2 <= SHORT_BEAM_THICK[1];
      }
    }
    if (!shortBeam) {
      if (c2.bbox.w < unit.space * 1.5) continue;
      if (c2.bbox.h > unit.space * 3) continue;
      if (c2.bbox.w < c2.bbox.h * 2.5) continue;
    }
    if (!shortBeam && unit.lineThick > unit.space * LEDGER_BEAM_THICK && c2.bbox.w < unit.space * LEDGER_BEAM_W && !staffBands.some(([t2, b]) => c2.bbox.y + c2.bbox.h / 2 > t2 - unit.space * 0.3 && c2.bbox.y + c2.bbox.h / 2 < b + unit.space * 0.3)) {
      const xa = stemNear(c2.bbox.x, c2.bbox, tol);
      const xb = stemNear(c2.bbox.x + c2.bbox.w - 1, c2.bbox, tol);
      const d2 = Math.max(2, Math.round(unit.space * 0.3));
      const nearStaff = staffBands.some(([t2, b]) => c2.bbox.y + c2.bbox.h > t2 - unit.space * 4.5 && c2.bbox.y < b + unit.space * 4.5);
      const thinAt = (x) => {
        if (x < 0 || x >= w || !nearStaff) return false;
        for (let y = Math.max(0, c2.bbox.y - 1); y <= Math.min(h2 - 1, c2.bbox.y + c2.bbox.h); y++)
          if (bin.data[y * w + x] && vr[y * w + x] <= unit.lineThick * 1.5 && onGrid(y)) return true;
        return false;
      };
      const ledgerTail = thinAt(c2.bbox.x - d2) || thinAt(c2.bbox.x + c2.bbox.w - 1 + d2);
      if (c2.bbox.h >= unit.space * 0.4 && ledgerTail && (xa === null || xb === null || xb - xa < unit.space * 0.7)) continue;
    }
    const line = centerLine(bMaskC, w, c2, true);
    if (!shortBeam && staffBands.some(([t2, b]) => c2.bbox.y + c2.bbox.h / 2 > t2 - unit.space * 3 && c2.bbox.y + c2.bbox.h / 2 < b + unit.space * 3)) {
      const ts = [];
      const trim = Math.round(unit.space * 0.3);
      for (let x = c2.bbox.x + trim; x < c2.bbox.x + c2.bbox.w - trim; x++) {
        const cy2 = Math.round(line.y0 + (line.y1 - line.y0) * (x - line.x0) / Math.max(1, line.x1 - line.x0));
        const n2 = vr[cy2 * w + x];
        if (n2 > 0 && n2 <= unit.space * 1.5) ts.push(n2);
      }
      ts.sort((p2, q2) => p2 - q2);
      const med2 = ts[ts.length >> 1] || 1;
      if (ts.length >= unit.space && med2 > unit.space * BEAM_EVEN_MED && ts[Math.floor(ts.length * 0.1)] < med2 * BEAM_EVEN_LO) continue;
    }
    beams.push({ ...line, box: c2.bbox });
  }
  for (let i2 = 0; i2 < beams.length; i2++)
    for (let j2 = beams.length - 1; j2 > i2; j2--) {
      const a = beams[i2].box;
      const b = beams[j2].box;
      const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (ov < Math.min(a.w, b.w) * 0.8) continue;
      const gap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y + a.h, b.y + b.h);
      if (gap > Math.max(1, unit.lineThick) || y1 - y0 > unit.space * 0.8) continue;
      const x0 = Math.min(a.x, b.x);
      const box = { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: y1 - y0 };
      const A = beams[i2];
      const B = beams[j2];
      beams[i2] = { ...A, y0: (A.y0 + B.y0) / 2, y1: (A.y1 + B.y1) / 2, lw: y1 - y0, maxLw: y1 - y0, box };
      beams.splice(j2, 1);
    }
  dropHeadEndBeams(beams, vSegs, unit);
  beams.push(...partialBeams(bin, beams, unit, vSegs));
  vSegs.push(...beamStems(bin, beams, vSegs, unit, staffLineYs));
  dropHeadEndBeams(beams, vSegs, unit);
  return { hSegs, vSegs, beams };
}
const BEAM_EVEN_MED = 0.75;
const BEAM_EVEN_LO = 0.85;
const PARTIAL_BEAM_H = [0.3, 0.8];
function partialBeams(bin, beams, unit, vSegs = []) {
  const sp = unit.space;
  const out = [];
  const ink = (x, y) => y >= 0 && y < bin.h && x >= 0 && x < bin.w && !!bin.data[y * bin.w + x];
  const holeTol = Math.max(1, Math.ceil(unit.lineThick));
  for (const b of beams) {
    const lw = Math.max(2, b.lw);
    const yAt = (x) => b.y0 + (b.y1 - b.y0) * (x - b.x0) / Math.max(1, b.x1 - b.x0);
    const starts = [[b.box.x, 1], [b.box.x + b.box.w - 1, -1]];
    for (const v2 of vSegs) {
      const vx = Math.round((v2.x0 + v2.x1) / 2);
      if (vx <= b.box.x + sp * 0.5 || vx >= b.box.x + b.box.w - 1 - sp * 0.5) continue;
      const by = yAt(vx);
      if (Math.min(v2.y0, v2.y1) > by + sp * 1.5 || Math.max(v2.y0, v2.y1) < by - sp * 1.5) continue;
      const half = Math.ceil(v2.maxLw / 2) + 1;
      starts.push([vx - half, -1], [vx + half, 1]);
    }
    for (const side of [-1, 1])
      for (const [end, dir] of starts) {
        const cols = [];
        let skip = 0;
        const skipTol = sp * 0.25;
        for (let k2 = 0; k2 < sp * 1.6; k2++) {
          const x = end + dir * k2;
          let y = Math.round(yAt(x));
          if (!ink(x, y)) {
            if (cols.length && ++skip > skipTol) break;
            continue;
          }
          let t2 = 1;
          for (let yy = y; ink(x, yy - side); yy -= side) t2++;
          while (ink(x, y + side)) y += side, t2++;
          const lwx = Math.min(Math.max(lw, t2), lw * 1.7);
          let g2 = 0;
          while (!ink(x, y + side * (g2 + 1)) && g2 <= sp * 0.6) g2++;
          const s0 = y + side * (g2 + 1);
          const runLen = (tol) => {
            let n2 = 0;
            for (let miss = 0; n2 <= lwx * 1.6; ) {
              if (ink(x, s0 + side * (n2 + miss))) n2 += miss + 1, miss = 0;
              else if (++miss > tol) break;
            }
            return n2;
          };
          const fits = (n2) => n2 >= lwx * 0.6 && n2 <= lwx * 1.6;
          let r4 = runLen(0);
          if (!fits(r4)) r4 = runLen(holeTol);
          const ok = g2 >= 1 && g2 <= sp * 0.6 && fits(r4);
          if (!ok) {
            if (cols.length ? ++skip > skipTol : k2 > sp * 0.4) break;
            continue;
          }
          cols.push({ x, y0: Math.min(s0, s0 + side * (r4 - 1)), y1: Math.max(s0, s0 + side * (r4 - 1)) });
        }
        if (cols.length < sp * 0.5) continue;
        const xs = cols.map((c2) => c2.x);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        const med2 = (a) => a.sort((p2, q2) => p2 - q2)[a.length >> 1];
        const top = med2(cols.map((c2) => c2.y0));
        const bot = med2(cols.map((c2) => c2.y1));
        const cy2 = (top + bot) / 2;
        if (beams.some((q2) => q2 !== b && x0 >= q2.box.x - 2 && x1 <= q2.box.x + q2.box.w + 2 && cy2 >= q2.box.y && cy2 <= q2.box.y + q2.box.h)) continue;
        if (bot - top + 1 < sp * PARTIAL_BEAM_H[0] || bot - top + 1 > sp * PARTIAL_BEAM_H[1]) continue;
        const reachY = side > 0 ? bot : top;
        const onStem = [...Array(Math.round(unit.lineThick * 2) + 5).keys()].some((d2) => {
          const x = end + dir * (d2 - 2);
          for (let y = Math.round(yAt(x)); y !== reachY; y += side) if (!ink(x, y)) return false;
          return true;
        });
        if (!onStem) continue;
        if (out.some((q2) => Math.abs(q2.box.x - x0) <= 2 && Math.abs(q2.box.y - top) <= 2)) continue;
        const first = cols.find((c2) => c2.x === x0);
        const last = cols.find((c2) => c2.x === x1);
        out.push({
          x0,
          x1,
          y0: (first.y0 + first.y1) / 2,
          y1: (last.y0 + last.y1) / 2,
          lw: cols.reduce((a, c2) => a + c2.y1 - c2.y0 + 1, 0) / cols.length,
          maxLw: Math.max(...cols.map((c2) => c2.y1 - c2.y0 + 1)),
          box: { x: x0, y: top, w: x1 - x0 + 1, h: bot - top + 1 }
        });
      }
  }
  return out;
}
function localLineCenters(bin, runs, cy2, unit) {
  const { w, h: h2, data } = bin;
  const radius = Math.max(2, Math.round(unit.space * 0.35));
  const lo = Math.max(0, Math.floor(cy2) - radius);
  const hi = Math.min(h2 - 1, Math.ceil(cy2) + radius);
  const cap = Math.max(unit.lineThick * 2, unit.lineThick + 2);
  const samples = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    let dist = radius + 1;
    for (let y = lo; y <= hi; y++) {
      const len = runs[y * w + x];
      if (!len || len > cap) continue;
      let end = y + 1;
      while (end < h2 && data[end * w + x]) end++;
      const mid = end - (len + 1) / 2;
      if (mid >= lo && mid <= hi && Math.abs(mid - cy2) < dist) {
        dist = Math.abs(mid - cy2);
        samples[x] = Math.round((mid - lo) * 2);
      }
      y = end - 1;
    }
  }
  const centers = new Float64Array(w).fill(cy2);
  const hist = new Int32Array((hi - lo) * 2 + 1);
  const window = Math.max(4, Math.round(unit.space));
  let count = 0;
  const add = (x, delta) => {
    if (x < 0 || x >= w || samples[x] < 0) return;
    hist[samples[x]] += delta;
    count += delta;
  };
  for (let x = 0; x < window; x++) add(x, 1);
  for (let x = 0; x < w; x++) {
    add(x + window, 1);
    add(x - window - 1, -1);
    if (count < Math.max(4, window)) continue;
    let n2 = 0;
    for (let k2 = 0; k2 < hist.length; k2++) {
      n2 += hist[k2];
      if (n2 <= count / 2) continue;
      const local = lo + k2 / 2;
      if (Math.abs(local - cy2) > 1) centers[x] = local;
      break;
    }
  }
  return centers;
}
const THIN_ONLY_RUN = 1.6;
const BEAM_STEM_MIN = 2;
function beamStems(bin, beams, vSegs, unit, lineYs) {
  const { w, h: h2, data } = bin;
  const sp = unit.space;
  const thin = Math.max(3, Math.min(unit.lineThick * 2, sp * 0.4));
  const lineHalf = unit.lineThick / 2 + 1;
  const onLine = (y) => lineYs.some((ly) => Math.abs(ly - y) <= lineHalf);
  const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h2 && data[y * w + x] === 1;
  const runAt = (x, y) => {
    let a = x;
    let b = x;
    while (ink(a - 1, y)) a--;
    while (ink(b + 1, y)) b++;
    return ink(x, y) ? b - a + 1 : 0;
  };
  const walk = (x, y0, dir) => {
    let last = y0 - dir;
    for (let y = y0; y >= 0 && y < h2; y += dir) {
      if (ink(x, y)) last = y;
      else if (!onLine(y)) {
        let k2 = 1;
        while (k2 <= 3 && !ink(x, y + dir * k2)) k2++;
        if (k2 > 3 || runAt(x, y + dir * k2) < sp * 0.8) break;
        y += dir * (k2 - 1);
      }
    }
    return last;
  };
  const out = [];
  for (const q2 of beams) {
    const hung = vSegs.some((v2) => {
      const vx = (v2.x0 + v2.x1) / 2;
      return vx >= q2.box.x - 2 && vx <= q2.box.x + q2.box.w + 2 && Math.min(v2.y0, v2.y1) <= q2.box.y + q2.box.h + 2 && Math.max(v2.y0, v2.y1) >= q2.box.y - 2;
    });
    if (!hung) continue;
    const x0 = Math.ceil(Math.min(q2.x0, q2.x1, q2.box.x) - sp * 0.3);
    const x1 = Math.floor(Math.max(q2.x0, q2.x1, q2.box.x + q2.box.w) + sp * 0.3);
    for (const dir of [1, -1]) {
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const wd = run.length;
        const xs = run.map((r4) => r4.x);
        const cx2 = (xs[0] + xs[xs.length - 1]) / 2;
        run.sort((a, b) => (b.end - a.end) * dir);
        const end = run[Math.min(run.length - 1, 1)].end;
        run = [];
        if (wd > thin) return;
        const t2 = x0 === x1 ? 0 : (cx2 - q2.x0) / (q2.x1 - q2.x0 || 1);
        const yc = q2.y0 + (q2.y1 - q2.y0) * t2;
        const start = Math.round(yc - dir * q2.lw / 2);
        if (vSegs.some((v2) => Math.abs((v2.x0 + v2.x1) / 2 - cx2) <= sp * 0.5 && Math.min(v2.y0, v2.y1) <= Math.max(start, end) && Math.max(v2.y0, v2.y1) >= Math.min(start, end))) return;
        if (out.some((v2) => Math.abs(v2.x0 - cx2) <= sp * 0.5)) return;
        out.push({ x0: cx2, y0: Math.min(start, end), x1: cx2, y1: Math.max(start, end), lw: wd, maxLw: wd });
      };
      for (let x = x0; x <= x1; x++) {
        const t2 = x0 === x1 ? 0 : (x - q2.x0) / (q2.x1 - q2.x0 || 1);
        const yc = q2.y0 + (q2.y1 - q2.y0) * t2;
        const edge = Math.round(yc + dir * (q2.lw / 2 + 1));
        const end = walk(x, edge, dir);
        if ((end - edge) * dir >= sp * BEAM_STEM_MIN) run.push({ x, end });
        else flush();
      }
      flush();
    }
  }
  return out;
}
const ONE_STEM_MAX = 4.5;
function dropHeadEndBeams(beams, vSegs, unit) {
  const tol = unit.lineThick + 2;
  const inBox = (x, y, b) => x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
  const drop = /* @__PURE__ */ new Set();
  for (const q2 of beams) {
    let touched = 0;
    let fake = true;
    for (const v2 of vSegs) {
      const vx = (v2.x0 + v2.x1) / 2;
      const top = Math.min(v2.y0, v2.y1);
      const bot = Math.max(v2.y0, v2.y1);
      const atTop = inBox(vx, top, q2.box);
      const atBot = inBox(vx, bot, q2.box);
      if (atTop === atBot) continue;
      touched++;
      if (bot - top > unit.space * ONE_STEM_MAX) {
        fake = false;
        break;
      }
      const far = atTop ? bot : top;
      const at = beams.filter((o) => o !== q2 && inBox(vx, far, o.box));
      const stack = beams.filter((o) => o !== q2 && at.some((a) => o.box.x < a.box.x + a.box.w && a.box.x < o.box.x + o.box.w && Math.abs(o.box.y - a.box.y) <= unit.space * 1.5));
      if (!stack.some((o) => o.box.w > q2.box.w)) {
        fake = false;
        break;
      }
    }
    if (touched && fake) drop.add(q2);
  }
  for (let i2 = beams.length - 1; i2 >= 0; i2--) if (drop.has(beams[i2])) beams.splice(i2, 1);
}
const SHORT_BEAM_W = 0.9;
const SHORT_BEAM_THICK = [0.4, 0.6];
function removeStaffLines(bin, lineYs, unit, thinOnly = /* @__PURE__ */ new Set()) {
  const { w, h: h2, data } = bin;
  const out = { w, h: h2, data: new Uint8Array(data) };
  const half = unit.lineThick / 2 + 1;
  const look = Math.max(1, Math.round(unit.lineThick));
  const runs = vRuns(bin);
  const maxRun = unit.lineThick * THIN_ONLY_RUN;
  for (const cy2 of lineYs) {
    const centers = localLineCenters(bin, runs, cy2, unit);
    const thin = thinOnly.has(cy2);
    for (let x = 0; x < w; x++) {
      const y0 = Math.max(0, Math.floor(centers[x] - half));
      const y1 = Math.min(h2 - 1, Math.ceil(centers[x] + half));
      if (thin) {
        let run = 0;
        for (let y = y0; y <= y1; y++) run = Math.max(run, runs[y * w + x]);
        if (run > maxRun) continue;
      }
      let up = 0;
      for (let y = Math.max(0, y0 - look); y < y0; y++) up |= data[y * w + x];
      if (up) continue;
      let down = 0;
      for (let y = y1 + 1; y <= Math.min(h2 - 1, y1 + look); y++) down |= data[y * w + x];
      if (down) continue;
      for (let y = y0; y <= y1; y++) out.data[y * w + x] = 0;
    }
  }
  return out;
}
function findBlobs(bin, prims, unit, onGrid) {
  const rest = blobImage(bin, prims, unit, onGrid);
  const minSide = unit.space * 0.25;
  const maxW = unit.space * 6;
  const maxH = unit.space * 9;
  return connectedComponents(rest, Math.round(minSide * minSide)).filter((c2) => {
    const b = c2.bbox;
    if (b.w > maxW || b.h > maxH) return false;
    if (b.w < minSide && b.h < minSide) return false;
    return true;
  });
}
function findBraces(bin, prims, unit, staffLefts, staffSpans = []) {
  if (!staffLefts.length) return [];
  const rest = blobImage(bin, prims, unit);
  const leftMost = Math.min(...staffLefts);
  const staffH = unit.space * 4;
  return connectedComponents(rest, Math.round(unit.space * unit.space * 0.5)).filter((c2) => {
    const b = c2.bbox;
    if (b.x + b.w > leftMost) return false;
    if (b.h < staffH * 1.5) return false;
    if (b.w > unit.space * 2) return false;
    if (staffSpans.length) {
      const n2 = staffSpans.filter((s) => s.top < b.y + b.h && b.y < s.bottom).length;
      if (n2 !== 2) return false;
    }
    return true;
  });
}
function groupByLeftInk(bin, staves, unit) {
  if (!staves.length) return [];
  const ss = [...staves].sort((a, b) => a.top - b.top);
  const groups = [[ss[0]]];
  for (let i2 = 1; i2 < ss.length; i2++) {
    const a = ss[i2 - 1];
    const b = ss[i2];
    const y0 = Math.round(a.bottom) + 1;
    const y1 = Math.round(b.top) - 1;
    const left = Math.min(a.left, b.left);
    const x0 = Math.max(0, Math.round(left - unit.space * LEFTINK_OUT));
    const x1 = Math.min(bin.w - 1, Math.round(left + unit.space * LEFTINK_IN));
    let rows = 0;
    let hit = 0;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= bin.h) continue;
      rows++;
      for (let x = x0; x <= x1; x++)
        if (bin.data[y * bin.w + x]) {
          hit++;
          break;
        }
    }
    if (rows <= 0 || hit >= rows * LEFTINK_FRAC) groups[groups.length - 1].push(b);
    else groups.push([b]);
  }
  return groups.filter((g2) => g2.length >= 2).map((g2) => {
    const x = Math.min(...g2.map((s) => s.left)) - unit.space * LEFTINK_OUT;
    return { x, y: g2[0].top, w: unit.space * (LEFTINK_OUT + LEFTINK_IN), h: g2[g2.length - 1].bottom - g2[0].top };
  });
}
function blobImage(bin, prims, unit, onGrid) {
  const { w, h: h2 } = bin;
  const rest = new Uint8Array(bin.data);
  const clear = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h2 - 1, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x <= Math.min(w - 1, Math.round(x1)); x++) rest[y * w + x] = 0;
  };
  for (const s of [...prims.vSegs, ...prims.hSegs]) {
    const horiz = Math.abs(s.x1 - s.x0) >= Math.abs(s.y1 - s.y0);
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    if (horiz && len < unit.space) continue;
    if (horiz && onGrid && len <= unit.space * 3 && onGrid((s.y0 + s.y1) / 2) && headOn(bin, s, unit)) continue;
    const pad = Math.min(s.maxLw, Math.max(2, s.lw * PAD_LW)) / 2 + 1;
    if (horiz && onGrid && len > unit.space * 3 && onGrid((s.y0 + s.y1) / 2)) {
      const reach = Math.max(2, Math.round(unit.space * 0.6));
      const x0 = Math.max(0, Math.round(Math.min(s.x0, s.x1)));
      const x1 = Math.min(w - 1, Math.round(Math.max(s.x0, s.x1)));
      for (let x = x0; x <= x1; x++) {
        const cy2 = s.y0 + (s.y1 - s.y0) * (x - s.x0) / (s.x1 - s.x0 || 1);
        const ya = Math.round(cy2 - pad);
        const yb = Math.round(cy2 + pad);
        let head = false;
        for (let d2 = 1; d2 <= reach && !head; d2++) head = ya - d2 >= 0 && bin.data[(ya - d2) * w + x] !== 0 || yb + d2 < h2 && bin.data[(yb + d2) * w + x] !== 0;
        if (!head) clear(x, ya, x, yb);
      }
      continue;
    }
    clear(Math.min(s.x0, s.x1) - pad, Math.min(s.y0, s.y1) - pad, Math.max(s.x0, s.x1) + pad, Math.max(s.y0, s.y1) + pad);
  }
  for (const b of prims.beams) {
    const x0 = Math.max(0, Math.round(Math.min(b.x0, b.x1)));
    const x1 = Math.min(w - 1, Math.round(Math.max(b.x0, b.x1)));
    const half = Math.max(1, b.lw / 2 + BEAM_PAD);
    const dx = b.x1 - b.x0;
    for (let x = x0; x <= x1; x++) {
      const t2 = Math.abs(dx) < 1e-6 ? 0 : (x - b.x0) / dx;
      const cy2 = b.y0 + (b.y1 - b.y0) * t2;
      clear(x, cy2 - half, x, cy2 + half);
    }
  }
  return { w, h: h2, data: rest };
}
function headOn(bin, s, unit) {
  const cy2 = Math.round((s.y0 + s.y1) / 2);
  const x0 = Math.round(Math.min(s.x0, s.x1));
  const x1 = Math.round(Math.max(s.x0, s.x1));
  const reach = Math.max(2, Math.round(unit.space * 0.6));
  let up = 0;
  let down = 0;
  let n2 = 0;
  for (let x = x0; x <= x1; x++) {
    if (x < 0 || x >= bin.w) continue;
    n2++;
    for (let d2 = 2; d2 <= reach; d2++)
      if (cy2 - d2 >= 0 && bin.data[(cy2 - d2) * bin.w + x]) {
        up++;
        break;
      }
    for (let d2 = 2; d2 <= reach; d2++)
      if (cy2 + d2 < bin.h && bin.data[(cy2 + d2) * bin.w + x]) {
        down++;
        break;
      }
  }
  if (!n2) return false;
  return up > n2 * 0.5 || down > n2 * 0.5;
}
function binSig(bin, box) {
  const sig = new Uint8Array(SIG_N * SIG_N);
  const sc = (SIG_N - 2) / Math.max(box.w, box.h);
  const ox = (SIG_N - box.w * sc) / 2;
  const oy = (SIG_N - box.h * sc) / 2;
  for (let sy = 0; sy < SIG_N; sy++) {
    const y0 = (sy - oy) / sc;
    const y1 = (sy + 1 - oy) / sc;
    const ya = Math.max(0, Math.floor(y0));
    const yb = Math.min(box.h - 1, Math.ceil(y1) - 1);
    if (ya > yb) continue;
    for (let sx = 0; sx < SIG_N; sx++) {
      const x0 = (sx - ox) / sc;
      const x1 = (sx + 1 - ox) / sc;
      const xa = Math.max(0, Math.floor(x0));
      const xb = Math.min(box.w - 1, Math.ceil(x1) - 1);
      if (xa > xb) continue;
      let hit = 0;
      let tot = 0;
      for (let y = ya; y <= yb; y++) {
        const row = (box.y + y) * bin.w + box.x;
        for (let x = xa; x <= xb; x++) {
          tot++;
          hit += bin.data[row + x];
        }
      }
      if (tot > 0 && hit * 2 >= tot) sig[sy * SIG_N + sx] = 1;
    }
  }
  return sig;
}
function verticalStrokes(bin, box, minH, gap = 2) {
  const out = [];
  let cur = null;
  for (let x = box.x; x < box.x + box.w; x++) {
    let best = 0;
    let bestTop = 0;
    let st = -1;
    let miss = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      if (bin.data[y * bin.w + x]) {
        if (st < 0) st = y;
        miss = 0;
        if (y - st + 1 > best) best = y - st + 1, bestTop = st;
      } else if (st >= 0 && ++miss > gap) st = -1, miss = 0;
    }
    if (best >= minH) {
      if (cur && x - cur.x1 <= 1) cur.x1 = x, cur.h = Math.max(cur.h, best), cur.top = Math.min(cur.top, bestTop), cur.bottom = Math.max(cur.bottom, bestTop + best - 1);
      else out.push(cur = { x0: x, x1: x, h: best, top: bestTop, bottom: bestTop + best - 1 });
    } else cur = null;
  }
  return out;
}
function joinVSegs(bin, segs, dx, gap) {
  const top = (v2) => Math.min(v2.y0, v2.y1);
  const bot = (v2) => Math.max(v2.y0, v2.y1);
  const cx2 = (v2) => (v2.x0 + v2.x1) / 2;
  const vs = segs.filter((v2) => bot(v2) - top(v2) > Math.abs(v2.x1 - v2.x0)).sort((a, b) => top(a) - top(b));
  const others = segs.filter((v2) => !vs.includes(v2));
  const out = [];
  const used = /* @__PURE__ */ new Set();
  for (const a of vs) {
    if (used.has(a)) continue;
    let cur = a;
    for (let again = true; again; ) {
      again = false;
      for (const b of vs) {
        if (b === cur || used.has(b) || b === a) continue;
        const g2 = top(b) - bot(cur);
        if (g2 < 0 || g2 > gap || Math.abs(cx2(b) - cx2(cur)) > dx) continue;
        const x = Math.round((cx2(b) + cx2(cur)) / 2);
        let solid = true;
        for (let y = Math.ceil(bot(cur)); y <= Math.floor(top(b)) && solid; y++) {
          const row = y * bin.w;
          solid = !!(bin.data[row + x] || bin.data[row + x - 1] || bin.data[row + x + 1]);
        }
        if (!solid) continue;
        const lwA = bot(cur) - top(cur);
        const lwB = bot(b) - top(b);
        cur = {
          x0: (cur.x0 * lwA + b.x0 * lwB) / (lwA + lwB),
          x1: (cur.x1 * lwA + b.x1 * lwB) / (lwA + lwB),
          y0: top(cur),
          y1: bot(b),
          lw: (cur.lw * lwA + b.lw * lwB) / (lwA + lwB),
          maxLw: Math.max(cur.maxLw, b.maxLw)
        };
        used.add(b);
        again = true;
      }
    }
    out.push(cur);
  }
  return [...out, ...others];
}
function fakePath(id, x, y, w, h2, lw) {
  return {
    id,
    data: new Float32Array(0),
    ctm: [1, 0, 0, 1, 0, 0],
    bbox: { x, y, w, h: h2 },
    paint: "stroke",
    curves: 0,
    segs: 1,
    lineWidth: lw,
    dash: null,
    dashPhase: 0,
    fill: null,
    stroke: "#000",
    clip: null
  };
}
function pushSeg(pg, id, s) {
  const left = Math.min(s.x0, s.x1);
  const right2 = Math.max(s.x0, s.x1);
  const top = Math.min(s.y0, s.y1);
  const bottom2 = Math.max(s.y0, s.y1);
  const o = new PObj(id, fakePath(id, left, top, right2 - left, bottom2 - top, s.lw), null);
  pg.objs.push(o);
  const seg = new Seg(o, s.x0, s.y0, s.x1, s.y1, s.lw);
  pg.segs.push(seg);
  return seg;
}
const RASTER_FONT = "#raster";
function fakeGlyph(box) {
  return {
    code: 0,
    fontChar: "",
    unicode: "",
    bbox: box,
    bboxEstimated: false,
    ox: box.x,
    oy: box.y + box.h,
    ctm: [1, 0, 0, 1, 0, 0],
    advance: box.w,
    outline: null
  };
}
function fakeRun(id, box, sizeDev, font = RASTER_FONT) {
  return {
    id,
    font,
    fontRaw: font,
    loadedName: font,
    size: sizeDev,
    sizeDev,
    glyphs: [],
    bbox: box,
    renderMode: 0,
    fill: "#000",
    clip: null
  };
}
const RASTER_TEXT_FONT = "#ocr";
function makeTextObj(id, t2) {
  const left = Math.min(...t2.cells.map((c2) => c2.box.x));
  const right2 = Math.max(...t2.cells.map((c2) => c2.box.x + c2.box.w));
  const top = Math.min(...t2.cells.map((c2) => c2.box.y));
  const bottom2 = Math.max(...t2.cells.map((c2) => c2.box.y + c2.box.h));
  const run = fakeRun(id, { x: left, y: top, w: right2 - left, h: bottom2 - top }, t2.sizeDev, RASTER_TEXT_FONT);
  for (const c2 of t2.cells) {
    const g2 = fakeGlyph(c2.box);
    g2.unicode = c2.ch;
    run.glyphs.push(g2);
  }
  return new PObj(id, null, run);
}
function makeSymObj(id, s, staffHeight) {
  const glyph = fakeGlyph(s.box);
  const run = fakeRun(id, s.box, staffHeight);
  run.glyphs.push(glyph);
  const obj = new PObj(id, null, run);
  const sym = new Sym(obj, 0, glyph, s.code);
  obj.symbols.push(sym);
  obj.addTag("Symbol");
  return { obj, sym };
}
function makeSysBracketObj(id, b) {
  const o = new PObj(id, fakePath(id, b.x, b.y, b.w, b.h, 1), null);
  o.addTag("SysBracket");
  return o;
}
function buildRasterPage(inp) {
  const pg = new SPage(inp.index, inp.width, inp.height);
  pg.barlineHeight = inp.unit.height;
  let id = 0;
  for (const l2 of inp.staffLines) {
    pushSeg(pg, id++, { x0: l2.left, y0: l2.y, x1: l2.right, y1: l2.y, lw: l2.y1 - l2.y0 + 1, maxLw: l2.y1 - l2.y0 + 1 });
  }
  for (const s of inp.hSegs) {
    const y = (s.y0 + s.y1) / 2;
    pushSeg(pg, id++, { ...s, y0: y, y1: y });
  }
  for (const s of inp.vSegs) {
    const x = (s.x0 + s.x1) / 2;
    pushSeg(pg, id++, { ...s, x0: x, x1: x });
  }
  for (const b of inp.braces ?? []) {
    const o = new PObj(id, fakePath(id, b.x, b.y, b.w, b.h, 1), null);
    id++;
    o.addTag("Bracket");
    pg.objs.push(o);
  }
  for (const b of inp.sysBrackets ?? []) pg.objs.push(makeSysBracketObj(id++, b));
  for (const s of inp.syms ?? []) {
    const { obj, sym } = makeSymObj(id++, s, inp.unit.height);
    pg.objs.push(obj);
    pg.symbols.push(sym);
  }
  return pg;
}
const CLUSTER_DIST = 60;
const CLUSTER_SIZE = 0.18;
const BUCKET = 0.1;
class RasterGlyphBuilder {
  cls = [];
  /** 按尺寸分的桶：`round(w/BUCKET),round(h/BUCKET)` → 类下标。
   *  不分桶的话每喂一个块都要扫全部类（两万个块 × 上千个类 × 1024 格），跑不完。 */
  buckets = /* @__PURE__ */ new Map();
  bucketKey(w, h2) {
    return `${Math.round(w / BUCKET)},${Math.round(h2 / BUCKET)}`;
  }
  /** 尺寸容差跨得过一个桶，所以要扫**九宫格**。 */
  near(w, h2) {
    const bw = Math.round(w / BUCKET);
    const bh = Math.round(h2 / BUCKET);
    const r4 = Math.ceil(CLUSTER_SIZE / BUCKET);
    const out = [];
    for (let i2 = -r4; i2 <= r4; i2++)
      for (let j2 = -r4; j2 <= r4; j2++) {
        const a = this.buckets.get(`${bw + i2},${bh + j2}`);
        if (a) out.push(...a);
      }
    return out;
  }
  /** 喂一个块。`w`/`h` 已归一到线距。 */
  add(sig, w, h2, page) {
    let best = -1;
    let bestD = CLUSTER_DIST + 1;
    for (const i2 of this.near(w, h2)) {
      const c22 = this.cls[i2];
      if (Math.abs(c22.w - w) > CLUSTER_SIZE || Math.abs(c22.h - h2) > CLUSTER_SIZE) continue;
      const d2 = sigDistance(c22.sigBits, sig);
      if (d2 < bestD) {
        bestD = d2;
        best = i2;
      }
    }
    if (best < 0) {
      this.cls.push({
        id: this.cls.length,
        smufl: null,
        source: null,
        count: 1,
        w,
        h: h2,
        sig: encodeSig(sig),
        sigBits: sig,
        pages: [page],
        ws: [w],
        hs: [h2]
      });
      const k2 = this.bucketKey(w, h2);
      const a = this.buckets.get(k2) ?? [];
      a.push(this.cls.length - 1);
      this.buckets.set(k2, a);
      return this.cls.length - 1;
    }
    const c2 = this.cls[best];
    c2.count++;
    c2.ws.push(w);
    c2.hs.push(h2);
    if (c2.pages.length < 5 && !c2.pages.includes(page)) c2.pages.push(page);
    const mid = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
    c2.w = mid(c2.ws);
    c2.h = mid(c2.hs);
    return best;
  }
  /**
   * 出字典。类按实例数降序**重新编号**——建库脚本要按这个序出人工确认表。
   *
   * `origin[新 id]` = 这个类在建库过程里的下标（`add` 的返回值）。
   * 脚本按 `add` 的返回值存代表实例，重编号之后要靠它把两边对回去
   * ——不给这张映射的话接触表画的是**另一个类**的样子，定名全标错。
   */
  finish() {
    const order = this.cls.map((c2, i2) => ({ c: c2, i: i2 })).sort((a, b) => b.c.count - a.c.count);
    const classes = order.map(({ c: c2 }, i2) => {
      const { sigBits, ws, hs, ...rest } = c2;
      return { ...rest, id: i2 };
    });
    return { classes, origin: order.map((o) => o.i) };
  }
}
class RasterGlyphLookup {
  cls = [];
  /** 模板表（`outlineTemplates` 的结果）。给 `bootstrapClefs` 再验一道用；没有就为 null。 */
  templates = null;
  /** 查不到的块：按最近的类记一笔，跑完就知道还差哪些形状。 */
  misses = [];
  constructor(dict) {
    for (const c2 of dict.classes) {
      if (!c2.smufl) continue;
      this.cls.push({ sig: decodeSig(c2.sig), w: c2.w, h: c2.h, smufl: c2.smufl });
    }
  }
  lookup(sig, w, h2) {
    let best = null;
    let bestD = CLUSTER_DIST + 1;
    for (const c2 of this.cls) {
      if (Math.abs(c2.w - w) > CLUSTER_SIZE || Math.abs(c2.h - h2) > CLUSTER_SIZE) continue;
      const d2 = sigDistance(c2.sig, sig);
      if (d2 < bestD) {
        bestD = d2;
        best = c2.smufl;
      }
    }
    if (!best) {
      const e = this.misses.find((m2) => Math.abs(m2.w - w) < 0.05 && Math.abs(m2.h - h2) < 0.05);
      if (e) e.n++;
      else this.misses.push({ sig: encodeSig(sig), w, h: h2, n: 1 });
    }
    return best;
  }
}
function sigToPath(sig) {
  const out = [];
  for (let y = 0; y < SIG_N; y++) {
    let x = 0;
    while (x < SIG_N) {
      if (!sig[y * SIG_N + x]) {
        x++;
        continue;
      }
      let x2 = x;
      while (x2 + 1 < SIG_N && sig[y * SIG_N + x2 + 1]) x2++;
      out.push(`M${x} ${y}h${x2 - x + 1}v1h${-(x2 - x + 1)}z`);
      x = x2 + 1;
    }
  }
  return out.join("");
}
const HOOK_LEFT = 0.25;
function bootstrapClefs(blobs, staves, space, verify, skip) {
  const out = [];
  for (const st of staves) {
    const top = st.lineYs[0];
    const bottom2 = st.lineYs[st.lineYs.length - 1];
    const cand = [];
    for (let i2 = 0; i2 < blobs.length; i2++) {
      const b = blobs[i2];
      if (b.x < st.left - space || b.x > st.left + space * 4) continue;
      if (b.y > bottom2 || b.y + b.h < top) continue;
      if (skip?.(b)) continue;
      cand.push(i2);
    }
    if (!cand.length) continue;
    const grow2 = (seed2) => {
      let box2 = { ...blobs[seed2] };
      const used = [seed2];
      for (let again = true; again; ) {
        again = false;
        for (const i2 of cand) {
          if (used.includes(i2)) continue;
          const b = blobs[i2];
          if (b.x > box2.x + box2.w || b.x + b.w < box2.x) continue;
          const sd2 = blobs[seed2];
          const onSeed = b.x <= sd2.x + sd2.w && b.x + b.w >= sd2.x;
          const gap = b.y > box2.y ? b.y - (box2.y + box2.h) : box2.y - (b.y + b.h);
          if (!onSeed && gap > space * 0.5) continue;
          if (!onSeed && b.y + b.h > bottom2 + space * 0.5) continue;
          if (b.y >= bottom2 - space * 0.25 && b.y + b.h > bottom2 + space * 0.8 && b.x < sd2.x - space * HOOK_LEFT) continue;
          const ov = Math.min(box2.x + box2.w, b.x + b.w) - Math.max(box2.x, b.x);
          if (b.x > sd2.x + sd2.w * 0.5 && ov <= space * 0.25 && b.h >= space * 1.8 && b.h <= space * 3.6 && b.w >= space * 0.8 && b.w <= space * 1.2) continue;
          const x0 = Math.min(box2.x, b.x);
          const y0 = Math.min(box2.y, b.y);
          box2 = { x: x0, y: y0, w: Math.max(box2.x + box2.w, b.x + b.w) - x0, h: Math.max(box2.y + box2.h, b.y + b.h) - y0 };
          used.push(i2);
          again = true;
        }
      }
      return box2;
    };
    const tallest = (pool) => pool.reduce((a, i2) => blobs[i2].h > blobs[a].h ? i2 : a, pool[0]);
    const fits = (b) => b.h >= space * 1.8 && b.w >= space * 0.8;
    let seed = tallest(cand);
    let box = grow2(seed);
    const sd = blobs[seed];
    const spansStaff = sd.y <= top + space * 0.3 && sd.y + sd.h >= bottom2 - space * 0.3;
    if (!fits(box) && sd.w < space * 0.5 && (sd.h >= space * 4.5 || spansStaff) && sd.x <= st.left + space * 0.3) {
      const wide = cand.filter((i2) => blobs[i2].w >= space * 0.5);
      if (wide.length) seed = tallest(wide), box = grow2(seed);
    }
    if (!fits(box)) continue;
    let code = null;
    if (verify) {
      const hit = matchTemplate(verify.sigOf(box), box.w / space, box.h / space, verify.tpl.filter((t2) => t2.smufl === "gClef" || t2.smufl === "fClef"));
      if (hit) code = hit.smufl;
    }
    code ??= box.h >= space * 3.8 ? "gClef" : "fClef";
    if (code === "gClef" && box.h < space * 4.4 && Math.max(top - box.y, box.y + box.h - bottom2) < space * 0.8) code = "fClef";
    out.push({ index: seed, box, code });
  }
  return out;
}
function bootstrapKeyAccidentals(blobs, staves, clefRight, space) {
  const out = [];
  staves.forEach((st, k2) => {
    const from = clefRight[k2];
    if (!(from > 0)) return;
    const top = st.lineYs[0];
    const bottom2 = st.lineYs[st.lineYs.length - 1];
    for (let i2 = 0; i2 < blobs.length; i2++) {
      const b = blobs[i2];
      if (b.x < from || b.x > from + space * 6) continue;
      if (b.y > bottom2 || b.y + b.h < top) continue;
      if (b.h < space * 1.8 || b.h > space * 3.6) continue;
      if (b.w > space * 1.5) continue;
      const lowness = (b.cy - b.y) / b.h;
      const code = lowness > 0.57 ? "accidentalFlat" : "accidentalSharp";
      out.push({ index: i2, code });
    }
  });
  return out;
}
function outlineTemplates(glyphmap, families = ["Maestro"]) {
  const out = [];
  for (const c2 of glyphmap.classes) {
    if (!c2.smufl || !families.includes(c2.family)) continue;
    const src = decodeSig(c2.sig);
    const sig = new Uint8Array(SIG_N * SIG_N);
    for (let y = 0; y < SIG_N; y++) for (let x = 0; x < SIG_N; x++) sig[(SIG_N - 1 - y) * SIG_N + x] = src[y * SIG_N + x];
    out.push({ smufl: c2.smufl, w: c2.w * 4, h: c2.h * 4, sig });
  }
  return out;
}
const TEMPLATE_DIST = 90;
function matchTemplate(sig, w, h2, tpl, maxDist = TEMPLATE_DIST) {
  let best = null;
  for (const t2 of tpl) {
    const tol = 0.2 + 0.12 * Math.max(t2.w, t2.h);
    if (Math.abs(t2.w - w) > tol || Math.abs(t2.h - h2) > tol) continue;
    const d2 = sigDistance(t2.sig, sig);
    if (d2 > maxDist) continue;
    if (!best || d2 < best.dist) best = { smufl: t2.smufl, dist: d2 };
  }
  return best;
}
const WIN_W$1 = 1.7;
const WIN_H$1 = 1.5;
const ON_LINE = 0.25;
const MIN_SAMPLES = 20;
function buildHeadMasks(bin, heads, unit, lineYs) {
  const sp = unit.space;
  const w = Math.max(3, Math.round(sp * WIN_W$1));
  const h2 = Math.max(3, Math.round(sp * WIN_H$1));
  const ys = [...lineYs].sort((a, b) => a - b);
  const buckets = [
    { sum: new Float32Array(w * h2), n: 0, onLine: true },
    { sum: new Float32Array(w * h2), n: 0, onLine: false }
  ];
  for (const hd of heads) {
    if (hd.code !== "noteheadBlack") continue;
    const cx2 = hd.box.x + hd.box.w / 2;
    const cy2 = hd.box.y + hd.box.h / 2;
    const b = buckets[ys.some((y) => Math.abs(y - cy2) <= sp * ON_LINE) ? 0 : 1];
    const x0 = Math.round(cx2 - w / 2);
    const y0 = Math.round(cy2 - h2 / 2);
    for (let y = 0; y < h2; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= bin.h) continue;
      for (let x = 0; x < w; x++) {
        const sx = x0 + x;
        if (sx >= 0 && sx < bin.w) b.sum[y * w + x] += bin.data[sy * bin.w + sx];
      }
    }
    b.n++;
  }
  const out = [];
  for (const b of buckets) {
    if (b.n < MIN_SAMPLES) continue;
    const p2 = new Float32Array(b.sum.length);
    for (let i2 = 0; i2 < p2.length; i2++) p2[i2] = b.sum[i2] / b.n;
    out.push({ w, h: h2, p: p2, n: b.n, onLine: b.onLine });
  }
  const pooled = buckets[0].n + buckets[1].n;
  if (!out.length && pooled >= MIN_POOLED) {
    const p2 = new Float32Array(w * h2);
    for (let i2 = 0; i2 < p2.length; i2++) p2[i2] = (buckets[0].sum[i2] + buckets[1].sum[i2]) / pooled;
    out.push({ w, h: h2, p: p2, n: pooled, onLine: buckets[0].n >= buckets[1].n, pooled: true });
  }
  return out;
}
const MIN_POOLED = 12;
function buildHollowMasks(bin, heads, unit, lineYs, minSamples = 3) {
  const hollow = heads.filter((h22) => h22.code === "noteheadHalf" || h22.code === "noteheadWhole");
  if (hollow.length < minSamples) return [];
  const sp = unit.space;
  const w = Math.max(3, Math.round(sp * WIN_W$1));
  const h2 = Math.max(3, Math.round(sp * WIN_H$1));
  const avg = (list, onLine) => {
    const sum = new Float32Array(w * h2);
    for (const hd of list) {
      const x0 = Math.round(hd.box.x + hd.box.w / 2 - w / 2);
      const y0 = Math.round(hd.box.y + hd.box.h / 2 - h2 / 2);
      for (let y = 0; y < h2; y++) {
        const sy = y0 + y;
        if (sy < 0 || sy >= bin.h) continue;
        for (let x = 0; x < w; x++) {
          const sx = x0 + x;
          if (sx >= 0 && sx < bin.w) sum[y * w + x] += bin.data[sy * bin.w + sx];
        }
      }
    }
    const p2 = new Float32Array(w * h2);
    for (let i2 = 0; i2 < p2.length; i2++) p2[i2] = sum[i2] / list.length;
    return { w, h: h2, p: p2, n: list.length, onLine };
  };
  if (!lineYs.length) return [avg(hollow, false)];
  const on = hollow.filter((hd) => lineYs.some((y) => Math.abs(y - (hd.box.y + hd.box.h / 2)) <= sp * ON_LINE));
  const off = hollow.filter((hd) => !on.includes(hd));
  const all = avg(hollow, false);
  return [
    on.length >= minSamples ? avg(on, true) : { ...all, onLine: true },
    off.length >= minSamples ? avg(off, false) : { ...all, onLine: false }
  ];
}
function scoreAt(bin, m2, cx2, cy2) {
  const x0 = Math.round(cx2 - m2.w / 2);
  const y0 = Math.round(cy2 - m2.h / 2);
  let hit = 0;
  let hitW = 0;
  let spill = 0;
  let spillW = 0;
  for (let y = 0; y < m2.h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= bin.h) continue;
    for (let x = 0; x < m2.w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= bin.w) continue;
      const p2 = m2.p[y * m2.w + x];
      const v2 = bin.data[sy * bin.w + sx];
      hit += p2 * v2;
      hitW += p2;
      spill += (1 - p2) * v2;
      spillW += 1 - p2;
    }
  }
  return (hitW ? hit / hitW : 0) - (spillW ? spill / spillW : 0);
}
const CLUSTER_W = [0.8, 6];
const CLUSTER_H = [0.7, 4];
const CLUSTER_FILL = [0.35, 0.9];
const SCORE_MIN = 0.46;
const MAX_HEADS = 8;
const VERIFY_SCORE_MIN = 0.2;
const ERASE_R = 1;
const SEP_X_MIN = 0;
const SEP_X = 0.7;
const SEP_Y = 0.4;
function splitHeadCluster(bin, box, area, masks, unit, grid, onLine, anySize = false, verify, minHeads = 2, minScore = SCORE_MIN, maxFill = CLUSTER_FILL[1]) {
  const sp = unit.space;
  const w = box.w / sp;
  const h2 = box.h / sp;
  if (!anySize && (w < CLUSTER_W[0] || w > CLUSTER_W[1] || h2 < CLUSTER_H[0] || h2 > CLUSTER_H[1])) return [];
  if (anySize && (w < CLUSTER_W[0] || h2 < CLUSTER_H[0])) return [];
  const fill = area / Math.max(1, box.w * box.h);
  if (fill < CLUSTER_FILL[0] || fill > maxFill) return [];
  const pad = Math.max(...masks.map((m2) => Math.max(m2.w, m2.h)));
  const wx = box.w + pad * 2;
  const wy = box.h + pad * 2;
  const ox = box.x - pad;
  const oy = box.y - pad;
  const work = { w: wx, h: wy, data: new Uint8Array(wx * wy) };
  for (let y = 0; y < wy; y++) {
    const sy = oy + y;
    if (sy < 0 || sy >= bin.h) continue;
    for (let x = 0; x < wx; x++) {
      const sx = ox + x;
      if (sx >= 0 && sx < bin.w) work.data[y * wx + x] = bin.data[sy * bin.w + sx];
    }
  }
  const ys = /* @__PURE__ */ new Set();
  for (let y = box.y - sp * 0.3; y <= box.y + box.h + sp * 0.3; y += sp * 0.25) {
    const g2 = grid(y);
    if (g2 !== null) ys.add(g2);
  }
  const step = Math.max(1, Math.round(sp * 0.15));
  const picked = [];
  const hw0 = sp * 1.25;
  const hh0 = sp * 0.95;
  for (let round = 0; round < MAX_HEADS; round++) {
    let best = null;
    for (let x = box.x; x <= box.x + box.w; x += step) {
      if (picked.some((p2) => Math.abs(p2.x - x) < sp * SEP_X_MIN)) continue;
      for (const y of ys) {
        if (picked.some((p2) => Math.abs(p2.x - x) < sp * SEP_X && Math.abs(p2.y - y) < sp * SEP_Y)) continue;
        const m2 = masks.find((k2) => k2.onLine === onLine(y)) ?? masks[0];
        const sc = scoreAt(work, m2, x - ox, y - oy);
        if (sc < (verify ? VERIFY_SCORE_MIN : minScore)) continue;
        if (!best || sc > best.s) best = { x, y, s: sc };
      }
    }
    if (!best) break;
    if (verify) {
      const bx = { x: Math.round(best.x - hw0 / 2), y: Math.round(best.y - hh0 / 2), w: Math.round(hw0), h: Math.round(hh0) };
      if (!verify(bx, best.y)) {
        const cx0 = best.x - ox;
        const cy0 = best.y - oy;
        const rx0 = hw0 * ERASE_R / 2;
        const ry0 = hh0 * ERASE_R / 2;
        for (let y = Math.max(0, Math.round(cy0 - ry0)); y <= Math.min(wy - 1, Math.round(cy0 + ry0)); y++)
          for (let x = Math.max(0, Math.round(cx0 - rx0)); x <= Math.min(wx - 1, Math.round(cx0 + rx0)); x++)
            if (((x - cx0) / rx0) ** 2 + ((y - cy0) / ry0) ** 2 <= 1) work.data[y * wx + x] = 0;
        continue;
      }
    }
    picked.push({ x: best.x, y: best.y });
    const cx2 = best.x - ox;
    const cy2 = best.y - oy;
    const rx = hw0 * ERASE_R / 2;
    const ry = hh0 * ERASE_R / 2;
    for (let y = Math.max(0, Math.round(cy2 - ry)); y <= Math.min(wy - 1, Math.round(cy2 + ry)); y++)
      for (let x = Math.max(0, Math.round(cx2 - rx)); x <= Math.min(wx - 1, Math.round(cx2 + rx)); x++)
        if (((x - cx2) / rx) ** 2 + ((y - cy2) / ry) ** 2 <= 1) work.data[y * wx + x] = 0;
  }
  if (picked.length < minHeads) return [];
  const hw = Math.round(sp * 1.25);
  const hh = Math.round(sp * 0.95);
  return picked.map((p2) => ({ x: Math.round(p2.x - hw / 2), y: Math.round(p2.y - hh / 2), w: hw, h: hh }));
}
const STEM_W = [0.85, 2.8];
const STEM_H = [1.6, 6.5];
const STEM_H_LONG = 9;
const LONG_SCORE_MIN = 0.5;
const LONG_THIRD_GAP = 0.9;
const STEM_FILL = [0.18, 0.72];
const END_BAND = 1.3;
const STEM_SCORE_MIN = 0.4;
const STEM_SCORE_MIN_POOLED = 0.34;
const TIP_FLAG_FILL = 0.6;
const TIP_FLAG_REACH = 2;
const CHORD_REACH = 2.5;
const CHORD_MAX = 3;
const CHORD_SCORE_MIN = 0.45;
const CHORD_SCORE_STACKED = 0.35;
const STACKED_CORE = 0.9;
const STACKED_H = 3;
const EDGE_SCORE = 0.3;
const EDGE_SCORE_LEDGER = 0.35;
const EDGE_TOL = 0.25;
const EDGE_TIP = 0.6;
const EDGE_ROW = 0.9;
function headFromStemBlock(bin, box, area, masks, unit, grid, onLine, nl) {
  const sp = unit.space;
  const w = box.w / sp;
  const h2 = box.h / sp;
  const long = h2 > STEM_H[1] && h2 <= STEM_H_LONG;
  if (w < STEM_W[0] || w > STEM_W[1] || h2 < STEM_H[0] || h2 > STEM_H[1] && !long) return null;
  const fill = area / Math.max(1, box.w * box.h);
  if (fill < STEM_FILL[0] || fill > STEM_FILL[1]) return null;
  const bands = [
    [box.y - sp * 0.2, box.y + sp * END_BAND],
    [box.y + box.h - sp * END_BAND, box.y + box.h + sp * 0.2]
  ];
  let best = null;
  let bestStacked = null;
  const hwFull = Math.round(sp * 1.25) * 0.95;
  const coreInk = (cx2, cy2) => {
    let n2 = 0;
    let k2 = 0;
    for (let y = Math.round(cy2 - sp * 0.15); y <= Math.round(cy2 + sp * 0.15); y++)
      for (let x = Math.round(cx2 - sp * 0.3); x <= Math.round(cx2 + sp * 0.3); x++) {
        if (x < 0 || y < 0 || x >= bin.w || y >= bin.h) continue;
        n2++;
        k2 += bin.data[y * bin.w + x];
      }
    return n2 ? k2 / n2 : 0;
  };
  const stackedAt = (x, y) => {
    if (coreInk(x, y) < STACKED_CORE || rowSpan(bin, box, y) < hwFull) return false;
    for (const dy of [-1, 1]) {
      const g2 = grid(y + dy * sp);
      if (g2 !== null && Math.abs(g2 - y) >= sp * 0.8 && Math.abs(g2 - y) <= sp * 1.2 && rowSpan(bin, box, g2) >= hwFull) return true;
    }
    return false;
  };
  let bestEdge = null;
  const hh0 = sp * 0.95;
  const edgeAt = (y) => {
    const top = Math.abs(y - (box.y + hh0 / 2)) <= sp * EDGE_TOL;
    const bot = Math.abs(y - (box.y + box.h - hh0 / 2)) <= sp * EDGE_TOL;
    if (!top && !bot) return false;
    const tip = top ? box.y + box.h - 1 - sp * 0.3 : box.y + sp * 0.3;
    return rowSpan(bin, box, y) >= hwFull * EDGE_ROW && rowSpan(bin, box, tip) <= hwFull * EDGE_TIP;
  };
  const step = Math.max(1, Math.round(sp * 0.15));
  for (const [ya, yb] of bands)
    for (let x = box.x; x <= box.x + box.w; x += step) {
      const ys = /* @__PURE__ */ new Set();
      for (let y = ya; y <= yb; y += sp * 0.25) {
        const g2 = grid(y);
        if (g2 !== null && g2 >= ya - sp * 0.3 && g2 <= yb + sp * 0.3) ys.add(g2);
      }
      for (const y of ys) {
        const m2 = masks.find((k2) => k2.onLine === onLine(y)) ?? masks[0];
        const s = scoreAt(bin, m2, x, y);
        if (s >= (m2.pooled ? STEM_SCORE_MIN_POOLED : STEM_SCORE_MIN) && (!best || s > best.s)) best = { x, y, s };
        else if (s >= CHORD_SCORE_STACKED && (!bestStacked || s > bestStacked.s) && stackedAt(x, y)) bestStacked = { x, y, s };
        else if (s >= EDGE_SCORE && (!bestEdge || s > bestEdge.s) && edgeAt(y)) bestEdge = { x, y, s };
      }
    }
  if (!best && !long && h2 >= STACKED_H) best = bestStacked;
  if (!best && !long && h2 >= STACKED_H) best = bestEdge;
  if (!best && !long && bestEdge && bestEdge.s >= EDGE_SCORE_LEDGER && ledgerEnd(bin, box, bestEdge.y, sp, onLine)) best = bestEdge;
  if (!best) return twoStemHead(bin, box, masks, sp, step, grid, onLine);
  if (long) {
    const hwL = Math.round(sp * 1.25);
    const one = bandTop(bin, masks, box, sp, step, grid, onLine, [box.y, box.y + box.h], () => true, (y) => rowSpan(bin, box, y) >= hwL * 0.7);
    if (!one) return null;
    const two = bandTop(bin, masks, box, sp, step, grid, onLine, [box.y, box.y + box.h], (y) => Math.abs(y - one.y) >= sp * 1.5, (y) => rowSpan(bin, box, y) >= hwL * 0.7);
    if (!two || two.s < LONG_SCORE_MIN) return twoStemHead(bin, box, masks, sp, step, grid, onLine);
    const got = [one, two];
    for (let k2 = got.length; k2 < CHORD_MAX; k2++) {
      const more = bandTop(bin, masks, box, sp, step, grid, onLine, [box.y, box.y + box.h], (y) => got.every((g2) => Math.abs(y - g2.y) >= sp * LONG_THIRD_GAP), (y) => rowSpan(bin, box, y) >= hwL * 0.7);
      if (!more || more.s < LONG_SCORE_MIN) break;
      got.push(more);
    }
    got.sort((a, b) => a.y - b.y);
    const top = got[0];
    const bot = got[got.length - 1];
    const hw0 = Math.round(sp * 1.25);
    const hh02 = Math.round(sp * 0.95);
    return {
      head: { x: Math.round(top.x - hw0 / 2), y: Math.round(top.y - hh02 / 2), w: hw0, h: hh02 },
      extra: got.slice(1).map((g2) => ({ x: Math.round(g2.x - hw0 / 2), y: Math.round(g2.y - hh02 / 2), w: hw0, h: hh02 })),
      // 干画满整块（两头各伸出去的那截也算）：符尾挂在端上，只画两头之间的话 `bootstrapFlags`
      // 找不到挂符尾的干，十六分、八分整批读成四分，小节跟着错位（万古磐石歌 −2.3）
      stemX: stemColumn(bin, box, top.y, bot.y),
      stemY0: box.y,
      stemY1: box.y + box.h
    };
  }
  const hw = Math.round(sp * 1.25);
  const hh = Math.round(sp * 0.95);
  const head = { x: Math.round(best.x - hw / 2), y: Math.round(best.y - hh / 2), w: hw, h: hh };
  const atTop = best.y - box.y < box.h + box.y - best.y;
  const tipFlag = (x, g2) => {
    if (!nl || (atTop ? box.y + box.h - g2 : g2 - box.y) >= sp * TIP_FLAG_REACH) return false;
    let ink = 0, n2 = 0;
    for (let y = Math.round(g2 - hh / 2); y < Math.round(g2 + hh / 2); y++)
      for (let xx = Math.round(x - hw / 2); xx < Math.round(x + hw / 2); xx++) {
        if (xx < 0 || y < 0 || xx >= nl.w || y >= nl.h) continue;
        n2++;
        ink += nl.data[y * nl.w + xx];
      }
    return n2 > 0 && ink / n2 < TIP_FLAG_FILL;
  };
  const extra = [];
  const taken = [best.y];
  for (let k2 = 0; k2 < CHORD_MAX - 1; k2++) {
    let more = null;
    const ya = atTop ? best.y : best.y - sp * CHORD_REACH;
    const yb = atTop ? best.y + sp * CHORD_REACH : best.y;
    for (let x = Math.round(best.x - sp * 0.4); x <= best.x + sp * 0.4; x += step)
      for (let y = ya; y <= yb; y += sp * 0.25) {
        const g2 = grid(y);
        if (g2 === null || g2 < ya || g2 > yb || taken.some((t2) => Math.abs(t2 - g2) < sp * 0.8)) continue;
        const m2 = masks.find((q2) => q2.onLine === onLine(g2)) ?? masks[0];
        const sc = scoreAt(bin, m2, x, g2);
        const stacked = taken.some((t2) => Math.abs(t2 - g2) >= sp * 0.8 && Math.abs(t2 - g2) <= sp * 1.2) && rowSpan(bin, box, g2) >= hw * 0.95;
        if (sc >= (stacked ? CHORD_SCORE_STACKED : CHORD_SCORE_MIN) && (!more || sc > more.s) && rowSpan(bin, box, g2) >= hw * 0.7 && !tipFlag(x, g2)) more = { x, y: g2, s: sc };
      }
    if (!more) break;
    taken.push(more.y);
    extra.push({ x: Math.round(more.x - hw / 2), y: Math.round(more.y - hh / 2), w: hw, h: hh });
  }
  const second = displacedSecond(bin, box, masks, sp, step, grid, onLine, best, hw);
  if (second && !taken.some((t2) => Math.abs(t2 - second.y) < sp * 0.3)) extra.push({ x: Math.round(second.x - hw / 2), y: Math.round(second.y - hh / 2), w: hw, h: hh });
  const up = atTop;
  const stemX = stemColumn(bin, box, up ? head.y + head.h : box.y, up ? box.y + box.h : head.y);
  const stemY0 = up ? best.y : box.y;
  const stemY1 = up ? box.y + box.h : best.y;
  return { head, extra, stemX, stemY0, stemY1 };
}
const TWO_STEM_REACH = 1.5;
function twoStemHead(bin, box, masks, sp, step, grid, onLine) {
  const hw = Math.round(sp * 1.25);
  const hh = Math.round(sp * 0.95);
  const mid = bandTop(bin, masks, box, sp, step, grid, onLine, [box.y + sp * END_BAND, box.y + box.h - sp * END_BAND], () => true, (y) => rowSpan(bin, box, y) >= hw * 0.7);
  if (!mid) return null;
  const top = mid.y - hh / 2;
  const bot = mid.y + hh / 2;
  if (inkReach(bin, box, top, -1) < sp * TWO_STEM_REACH || inkReach(bin, box, bot, 1) < sp * TWO_STEM_REACH) return null;
  return {
    head: { x: Math.round(mid.x - hw / 2), y: Math.round(top), w: hw, h: hh },
    extra: [],
    stemX: stemColumn(bin, box, box.y, top),
    stemY0: box.y,
    stemY1: mid.y
  };
}
function inkReach(bin, box, y0, dir) {
  const ink = (x, y) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h && bin.data[y * bin.w + x] === 1;
  let most = 0;
  for (let x0 = box.x; x0 < box.x + box.w; x0++) {
    if (!ink(x0, Math.round(y0))) continue;
    let last = 0;
    for (let x = x0, y = Math.round(y0), n2 = 0, miss = 0; miss <= 2 && y >= box.y && y < box.y + box.h; y += dir, n2++) {
      if (ink(x, y)) miss = 0;
      else if (ink(x - 1, y)) x--, miss = 0;
      else if (ink(x + 1, y)) x++, miss = 0;
      else {
        miss++;
        continue;
      }
      last = n2 + 1;
    }
    most = Math.max(most, last);
  }
  return most;
}
const SECOND_SCORE_MIN = 0.3;
function displacedSecond(bin, box, masks, sp, step, grid, onLine, best, hw) {
  const stemX = stemColumn(bin, box, box.y, box.y + box.h);
  const off = stemX - best.x;
  if (Math.abs(off) < hw * 0.25 || Math.abs(off) > hw * 0.8) return null;
  const mx = 2 * stemX - best.x;
  let got = null;
  for (const dy of [-0.5, 0.5]) {
    const g2 = grid(best.y + dy * sp);
    if (g2 === null || Math.abs(Math.abs(g2 - best.y) - sp * 0.5) > sp * 0.2) continue;
    const m2 = masks.find((q2) => q2.onLine === onLine(g2)) ?? masks[0];
    for (let x = Math.round(mx - sp * 0.3); x <= mx + sp * 0.3; x += step) {
      if (x - hw * 0.4 < box.x || x + hw * 0.4 > box.x + box.w) continue;
      const s = scoreAt(bin, m2, x, g2);
      if (s >= SECOND_SCORE_MIN && (!got || s > got.s)) got = { x, y: g2, s };
    }
  }
  return got;
}
function ledgerEnd(bin, box, headY, sp, onLine) {
  const atTop = headY - box.y < box.y + box.h - headY;
  const rows = [];
  for (let k2 = 0; k2 <= Math.round(sp * 0.2); k2++) {
    const y = atTop ? box.y + k2 : box.y + box.h - 1 - k2;
    if (rowSpan(bin, box, y) >= sp * 1.6) rows.push(y);
  }
  if (!rows.length || rows.length > Math.max(2, sp * 0.3)) return false;
  const cy2 = rows.reduce((a, b) => a + b, 0) / rows.length;
  return [1, 2, 3, 4].some((k2) => onLine(cy2 + k2 * sp) || onLine(cy2 - k2 * sp));
}
function rowSpan(bin, box, y) {
  const yy = Math.round(y);
  if (yy < 0 || yy >= bin.h) return 0;
  let a = -1;
  let b = -1;
  for (let x = Math.max(0, box.x); x < Math.min(bin.w, box.x + box.w); x++)
    if (bin.data[yy * bin.w + x]) {
      if (a < 0) a = x;
      b = x;
    }
  return a < 0 ? 0 : b - a + 1;
}
function stemColumn(bin, box, y0, y1) {
  let bx = box.x + box.w / 2;
  let bn = -1;
  for (let x = box.x; x < box.x + box.w; x++) {
    let n2 = 0;
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(bin.h, Math.round(y1)); y++)
      if (x >= 0 && x < bin.w && bin.data[y * bin.w + x]) n2++;
    if (n2 > bn) {
      bn = n2;
      bx = x;
    }
  }
  return bx;
}
function bandTop(bin, masks, box, sp, step, grid, onLine, [ya, yb], allowY = () => true, rowOk = () => true) {
  let bb = null;
  for (let x = box.x; x <= box.x + box.w; x += step) {
    const ys = /* @__PURE__ */ new Set();
    for (let y = ya; y <= yb; y += sp * 0.25) {
      const g2 = grid(y);
      if (g2 !== null && g2 >= ya - sp * 0.3 && g2 <= yb + sp * 0.3 && allowY(g2) && rowOk(g2)) ys.add(g2);
    }
    for (const y of ys) {
      const m2 = masks.find((k2) => k2.onLine === onLine(y)) ?? masks[0];
      const s = scoreAt(bin, m2, x, y);
      if (s >= (m2.pooled ? STEM_SCORE_MIN_POOLED : STEM_SCORE_MIN) && (!bb || s > bb.s)) bb = { x, y, s };
    }
  }
  return bb;
}
const SOLID_ALONG_MIN = 4.5;
const ALONG_FREE_SOLID = 2.5;
const SOLID_ALONG_SCORE = 0.45;
const SOLID_ALONG_INK = 0.6;
const STEM_JOIN_GAP = 1.2;
function joinStems(stems, unit) {
  const sp = unit.space;
  const tol = unit.lineThick + 1;
  const segs = stems.map((v2) => ({ v: v2, x: (v2.x0 + v2.x1) / 2, top: Math.min(v2.y0, v2.y1), bot: Math.max(v2.y0, v2.y1) })).sort((a, b) => a.top - b.top);
  const out = [];
  for (const a of segs)
    for (const b of segs) {
      if (b === a || Math.abs(a.x - b.x) > tol || b.top <= a.bot || b.top - a.bot > sp * STEM_JOIN_GAP) continue;
      out.push({ ...a.v, x0: a.x, x1: a.x, y0: a.top, y1: b.bot });
    }
  return out;
}
function solidHeadsAlongStems(bin, nl, masks, unit, grid, onLine, stems, heads, avoid) {
  const sp = unit.space;
  if (!masks.length) return [];
  const hw = Math.round(sp * 1.25);
  const hh = Math.round(sp * 0.95);
  const tol = Math.max(unit.lineThick * 2, sp * 0.3);
  const out = [];
  const taken = [...heads];
  const hit = (b) => [...taken, ...avoid].some((t2) => b.x < t2.x + t2.w && t2.x < b.x + b.w && b.y < t2.y + t2.h && t2.y < b.y + b.h);
  const inkOf = (b) => {
    let k2 = 0, n2 = 0;
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        if (x < 0 || y < 0 || x >= nl.w || y >= nl.h) continue;
        n2++;
        k2 += nl.data[y * nl.w + x];
      }
    return n2 ? k2 / n2 : 0;
  };
  for (const v2 of [...stems, ...joinStems(stems, unit)]) {
    const vx = (v2.x0 + v2.x1) / 2;
    const top = Math.min(v2.y0, v2.y1);
    const bot = Math.max(v2.y0, v2.y1);
    if (bot - top < sp * SOLID_ALONG_MIN) continue;
    const ref = heads.find((h2) => {
      const cy2 = h2.y + h2.h / 2;
      return (Math.abs(h2.x - vx) <= tol || Math.abs(h2.x + h2.w - vx) <= tol) && (Math.abs(cy2 - top) <= sp * 0.75 || Math.abs(cy2 - bot) <= sp * 0.75);
    });
    if (!ref) continue;
    const ry = ref.y + ref.h / 2;
    const atTop = Math.abs(ry - top) <= Math.abs(ry - bot);
    const y0 = atTop ? ry + sp * 0.8 : top + sp * ALONG_FREE_SOLID;
    const y1 = atTop ? bot - sp * ALONG_FREE_SOLID : ry - sp * 0.8;
    const seen = /* @__PURE__ */ new Set();
    for (let y = y0; y <= y1; y += sp * 0.25) {
      const g2 = grid(y);
      if (g2 === null || g2 < y0 - sp * 0.1 || g2 > y1 + sp * 0.1 || seen.has(g2)) continue;
      seen.add(g2);
      const m2 = masks.find((q2) => q2.onLine === onLine(g2)) ?? masks[0];
      let bestB = null;
      for (let cx2 = Math.round(vx - hw / 2 - tol); cx2 <= vx + hw / 2 + tol; cx2++) {
        if (Math.abs(cx2 - hw / 2 - vx) > tol && Math.abs(cx2 + hw / 2 - vx) > tol) continue;
        const sc = scoreAt(bin, m2, cx2, g2);
        if (!bestB || sc > bestB.s) bestB = { x: cx2, s: sc };
      }
      if (!bestB || bestB.s < SOLID_ALONG_SCORE) continue;
      const box = { x: Math.round(bestB.x - hw / 2), y: Math.round(g2 - hh / 2), w: hw, h: hh };
      if (hit(box) || inkOf(box) < SOLID_ALONG_INK) continue;
      out.push(box);
      taken.push(box);
    }
  }
  return out;
}
const W_MIN = 0.85;
const NARROW_W = 0.6;
const W_MAX = 1.85;
const H_MIN = 0.55;
const H_MAX = 1.35;
const FILL_SOLID = 0.62;
const W_WHOLE = 1.5;
const W_HOLLOW_MIN = 1;
const R_HOLLOW_MIN = 1.05;
function findRasterHeads(bin, blobs, stems, unit, onLedgerGrid = () => false, inStaffBand = () => true, matchHollow = null, offStaff = () => false) {
  const sp = unit.space;
  const out = [];
  for (const c2 of blobs) {
    const t2 = trimLedger(bin, c2.bbox, unit);
    let b = t2.box;
    if (b.w / sp < W_MIN && b.w / sp >= NARROW_W && b.h / sp >= H_MIN && t2.area / Math.max(1, b.w * b.h) >= FILL_SOLID) {
      const s0 = stemOf(b, stems, unit);
      if (s0) {
        const sx = (s0.x0 + s0.x1) / 2;
        const half = Math.max(1, (s0.lw ?? unit.lineThick) / 2);
        const x0 = Math.min(b.x, Math.round(sx - half));
        const x1 = Math.max(b.x + b.w, Math.round(sx + half));
        if ((x1 - x0) / sp >= W_MIN) b = { ...b, x: x0, w: x1 - x0 };
      }
    }
    const w = b.w / sp;
    const h2 = b.h / sp;
    const hFit = h2 - unit.lineThick / sp;
    if (w < W_MIN || w > W_MAX || h2 < H_MIN || hFit > H_MAX) continue;
    if (b.w > b.h * 2.2) continue;
    const fill = t2.area / Math.max(1, t2.box.w * t2.box.h);
    if (fill < 0.3) continue;
    const stem = stemOf(b, stems, unit);
    const ledger = t2.trimmed && t2.ledgerY != null && onLedgerGrid(t2.ledgerY) ? { x0: c2.bbox.x, y0: t2.ledgerY, x1: c2.bbox.x + c2.bbox.w - 1, y1: t2.ledgerY, lw: unit.lineThick, maxLw: unit.lineThick } : null;
    let code;
    if (fill >= FILL_SOLID) code = "noteheadBlack";
    else {
      if (w < W_HOLLOW_MIN) continue;
      if (h2 >= OPEN_ARC_H && offStaff(b.y + b.h / 2) && openBelow(bin, b)) continue;
      const m2 = matchHollow?.(b) ?? null;
      if (m2 && (m2.smufl === "noteheadWhole" || m2.smufl === "noteheadHalf")) code = m2.smufl;
      else {
        if (w / h2 < R_HOLLOW_MIN) continue;
        if (!inStaffBand(b.y + b.h / 2)) continue;
        code = w >= W_WHOLE && !stem ? "noteheadWhole" : "noteheadHalf";
      }
    }
    out.push({ comp: c2, box: b, code, fill, stem, ledger });
  }
  return out;
}
const OPEN_ARC_H = 0.8;
function openBelow(bin, b) {
  const x0 = Math.round(b.x + b.w * 0.35);
  const x1 = Math.round(b.x + b.w * 0.65);
  const band = Math.max(1, Math.round(b.h / 4));
  const fullRow = (y0, y1) => {
    for (let y = Math.max(0, y0); y < Math.min(bin.h, y1); y++) {
      let all = true;
      for (let x = x0; x <= x1 && all; x++) all = x >= 0 && x < bin.w && !!bin.data[y * bin.w + x];
      if (all) return true;
    }
    return false;
  };
  return fullRow(b.y, b.y + band) && !fullRow(b.y + b.h - band, b.y + b.h);
}
function judgeHeadBox(bin, box, unit, stems, inStaffBand) {
  const sp = unit.space;
  const w = box.w / sp;
  const h2 = box.h / sp;
  if (w < W_MIN || w > W_MAX || h2 < H_MIN || h2 > H_MAX) return null;
  if (box.w > box.h * 2.2) return null;
  let area = 0;
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++)
      if (x >= 0 && y >= 0 && x < bin.w && y < bin.h && bin.data[y * bin.w + x]) area++;
  const fill = area / Math.max(1, box.w * box.h);
  if (fill < 0.3) return null;
  if (fill >= FILL_SOLID) return "noteheadBlack";
  if (w < W_HOLLOW_MIN || w / h2 < R_HOLLOW_MIN) return null;
  if (!inStaffBand(box.y + box.h / 2)) return null;
  return w >= W_WHOLE && !stemOf(box, stems, unit) ? "noteheadWhole" : "noteheadHalf";
}
function trimLedger(bin, b, unit) {
  const thin = Math.max(2, unit.lineThick * 2);
  const colH = new Int32Array(b.w);
  for (let x = 0; x < b.w; x++) {
    let n2 = 0;
    for (let y = 0; y < b.h; y++) if (bin.data[(b.y + y) * bin.w + b.x + x]) n2++;
    colH[x] = n2;
  }
  let l2 = 0;
  while (l2 < b.w && colH[l2] > 0 && colH[l2] <= thin) l2++;
  let r4 = b.w - 1;
  while (r4 > l2 && colH[r4] > 0 && colH[r4] <= thin) r4--;
  if (l2 >= r4) return { box: b, area: colH.reduce((a, v2) => a + v2, 0), trimmed: false, ledgerY: null };
  let top = b.h;
  let bottom2 = -1;
  let area = 0;
  for (let x = l2; x <= r4; x++)
    for (let y = 0; y < b.h; y++)
      if (bin.data[(b.y + y) * bin.w + b.x + x]) {
        area++;
        if (y < top) top = y;
        if (y > bottom2) bottom2 = y;
      }
  const trimmed = l2 > 0 || r4 < b.w - 1;
  let ly = 0;
  let ln = 0;
  for (let x = 0; x < b.w; x++) {
    if (x >= l2 && x <= r4) continue;
    for (let y = 0; y < b.h; y++)
      if (bin.data[(b.y + y) * bin.w + b.x + x]) {
        ly += b.y + y;
        ln++;
      }
  }
  const ledgerY = ln ? ly / ln : null;
  if (bottom2 < top) return { box: b, area, trimmed, ledgerY };
  return { box: { x: b.x + l2, y: b.y + top, w: r4 - l2 + 1, h: bottom2 - top + 1 }, area, trimmed, ledgerY };
}
const STEM_JOIN = 0.3;
function extendStem(s, b) {
  const top = Math.min(s.y0, s.y1);
  const bottom2 = Math.max(s.y0, s.y1);
  const up = s.y0 <= s.y1;
  if (top > b.y + b.h) up ? s.y0 = b.y + b.h : s.y1 = b.y + b.h;
  else if (bottom2 < b.y) up ? s.y1 = b.y : s.y0 = b.y;
}
function stemOf(b, stems, unit, nl) {
  const tol = Math.max(unit.lineThick * 2, unit.space * 0.25);
  for (const s of stems) {
    const x = (s.x0 + s.x1) / 2;
    if (Math.abs(x - b.x) > tol && Math.abs(x - (b.x + b.w)) > tol) continue;
    const top = Math.min(s.y0, s.y1);
    const bottom2 = Math.max(s.y0, s.y1);
    const gy = nl ? unit.space * STEM_JOIN : 0;
    if (bottom2 < b.y - gy || top > b.y + b.h + gy) continue;
    if (bottom2 < b.y || top > b.y + b.h) {
      if (!nl) continue;
      const [y0, y1] = top > b.y + b.h ? [b.y + b.h, top] : [bottom2, b.y];
      let joined = false;
      for (let xx = Math.round(Math.min(s.x0, s.x1) - 1); xx <= Math.round(Math.max(s.x0, s.x1) + 1) && !joined; xx++) {
        joined = true;
        for (let y = Math.round(y0); y <= Math.round(y1); y++) if (!nl.data[y * nl.w + xx]) {
          joined = false;
          break;
        }
      }
      if (!joined) continue;
    }
    const cy2 = b.y + b.h / 2;
    if (Math.abs(cy2 - top) > unit.space && Math.abs(cy2 - bottom2) > unit.space) continue;
    return s;
  }
  return null;
}
const HOLE_W = [0.45, 1.25];
const HOLE_H = [0.3, 1];
const HOLE_OVERLAP = 0.6;
const HOLE_OVERLAP_CUT = 0.4;
const HOLE_VGAP = 0.45;
const RING = 0.22;
const HOLE_RATIO = 1.2;
const HOLE_RATIO_ROUND = 0.95;
const HOLE_RATIO_WHOLE = 0.6;
const FILL_RING = [0.3, 0.75];
const INK_STEM = [2.5, 7];
const MATE_GAP = 3.5;
function mergeHoles(holes, unit, onLine = () => false) {
  const sp = unit.space;
  const sorted = holes.filter((b) => b.w <= sp * 1.4 && b.h <= sp * 1.2).sort((a, b) => a.y - b.y);
  const used = new Uint8Array(sorted.length);
  const out = [];
  for (let i2 = 0; i2 < sorted.length; i2++) {
    if (used[i2]) continue;
    let box = { ...sorted[i2] };
    for (let again = true; again; ) {
      again = false;
      for (let j2 = 0; j2 < sorted.length; j2++) {
        if (used[j2] || sorted[j2] === box) continue;
        const r4 = sorted[j2];
        const ov = Math.min(box.x + box.w, r4.x + r4.w) - Math.max(box.x, r4.x);
        const gap = r4.y > box.y ? r4.y - (box.y + box.h) : box.y - (r4.y + r4.h);
        const gapY = r4.y > box.y ? box.y + box.h + gap / 2 : r4.y + r4.h + gap / 2;
        const lineCut = ov >= Math.min(box.w, r4.w) * HOLE_OVERLAP_CUT && gap <= unit.lineThick + 1 && box.h <= sp * 0.4 && r4.h <= sp * 0.4 && onLine(gapY);
        if (!lineCut && ov < Math.min(box.w, r4.w) * HOLE_OVERLAP) continue;
        if (gap > sp * HOLE_VGAP) continue;
        const x0 = Math.min(box.x, r4.x);
        const y0 = Math.min(box.y, r4.y);
        box = { x: x0, y: y0, w: Math.max(box.x + box.w, r4.x + r4.w) - x0, h: Math.max(box.y + box.h, r4.y + r4.h) - y0 };
        used[j2] = 1;
        again = true;
      }
    }
    used[i2] = 1;
    out.push(box);
  }
  return out;
}
function hollowHeadsFromHoles(nl, holes, unit, stems, inStaffBand, taken, bars = []) {
  const sp = unit.space;
  const ring = Math.max(2, Math.round(sp * RING));
  const out = [];
  const midStem = [];
  for (const hole of holes) {
    const hw = hole.w / sp;
    const hh = hole.h / sp;
    if (hw < HOLE_W[0] || hw > HOLE_W[1] || hh < HOLE_H[0] || hh > HOLE_H[1]) continue;
    const round = hole.w / hole.h < HOLE_RATIO;
    if (round && hole.w / hole.h < HOLE_RATIO_WHOLE) continue;
    const hcy = hole.y + hole.h / 2;
    const walled = bars.some((s0) => {
      const half = s0.maxLw / 2, cx2 = (s0.x0 + s0.x1) / 2;
      if (Math.min(s0.y0, s0.y1) > hole.y || Math.max(s0.y0, s0.y1) < hole.y + hole.h) return false;
      const onLeft = Math.abs(cx2 + half - hole.x) <= 1.5, onRight = Math.abs(hole.x + hole.w - (cx2 - half)) <= 1.5;
      if (!onLeft && !onRight) return false;
      return holes.some((o) => {
        if (o === hole || Math.abs(o.y + o.h / 2 - hcy) > sp * 0.3) return false;
        if (o.w < sp * HOLE_W[0] || o.h < sp * HOLE_H[0]) return false;
        const far = bars.some((s1) => {
          if (s1 === s0) return false;
          const h1 = s1.maxLw / 2, x1 = (s1.x0 + s1.x1) / 2;
          return onLeft ? Math.abs(o.x + o.w - (x1 - h1)) <= 1.5 : Math.abs(x1 + h1 - o.x) <= 1.5;
        });
        if (far) return false;
        return onLeft ? o.x > hole.x && o.x <= hole.x + hole.w + sp : o.x + o.w < hole.x + hole.w && o.x + o.w >= hole.x - sp;
      });
    });
    if (walled) continue;
    let pairedWhole = false;
    let box = { x: hole.x - ring, y: hole.y - ring, w: hole.w + ring * 2, h: hole.h + ring * 2 };
    if (round && (hole.w / hole.h < HOLE_RATIO_ROUND || !stemOf(box, stems, unit, nl) && !stemThrough(box, stems, unit))) {
      let outer = ringOuter(nl, hole, sp);
      let clipped = false;
      if (outer) {
        const hcy2 = hole.y + hole.h / 2;
        for (const o of holes) {
          if (o === hole || Math.abs(o.y + o.h / 2 - hcy2) > sp * 0.3) continue;
          if (o.w / hole.w < 0.7 || o.w / hole.w > 1.4 || o.h / hole.h < 0.7 || o.h / hole.h > 1.4 || o.w / o.h >= HOLE_RATIO) continue;
          if (o.x >= hole.x + hole.w && o.x - (hole.x + hole.w) < sp * 1.2 || o.x + o.w <= hole.x && hole.x - (o.x + o.w) < sp * 1.2) clipped = true;
          if (o.x >= hole.x + hole.w && o.x - (hole.x + hole.w) < sp * 1.2) {
            const mid = Math.round((hole.x + hole.w + o.x) / 2);
            if (mid < outer.x + outer.w) outer = { ...outer, w: mid - outer.x };
          } else if (o.x + o.w <= hole.x && hole.x - (o.x + o.w) < sp * 1.2) {
            const mid = Math.round((o.x + o.w + hole.x) / 2);
            if (mid > outer.x) outer = { ...outer, x: mid, w: outer.x + outer.w - mid };
          }
        }
      }
      if (!outer || outer.w / sp < (clipped ? 1.25 : W_WHOLE)) continue;
      pairedWhole = clipped && outer.w / sp < W_WHOLE;
      box = outer;
    }
    const w = box.w / sp;
    const h2 = box.h / sp;
    if (w < W_HOLLOW_MIN || w > W_MAX || h2 < H_MIN || h2 > H_MAX) continue;
    if (w / h2 < R_HOLLOW_MIN) continue;
    if (!inStaffBand(box.y + box.h / 2)) continue;
    let ink = 0;
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++)
        if (x >= 0 && y >= 0 && x < nl.w && y < nl.h && nl.data[y * nl.w + x]) ink++;
    const fill = ink / Math.max(1, box.w * box.h);
    if (fill < FILL_RING[0] || fill > FILL_RING[1]) continue;
    if (taken.some((t2) => overlaps(t2, box, sp * 0.4))) continue;
    let stem = stemOf(box, stems, unit, nl);
    if (!stem) {
      const col = inkColumn(nl, box, unit);
      const cy2 = box.y + box.h / 2;
      const reach = col ? Math.max(cy2 - col[0], col[1] - cy2) : 0;
      if (reach >= sp * INK_STEM[0] && reach <= sp * INK_STEM[1]) stem = true;
    }
    if (!stem) {
      const through = stemThrough(box, stems, unit);
      if (through) midStem.push({ box, stem: through });
    }
    if (!stem && w < W_WHOLE && !pairedWhole) continue;
    if (stem && stem !== true) extendStem(stem, box);
    out.push({ box, code: (w >= W_WHOLE || pairedWhole) && !stem ? "noteheadWhole" : "noteheadHalf", ...stem === true ? { weak: true } : {} });
    taken.push(box);
  }
  const tol = Math.max(unit.lineThick * 2, sp * 0.25);
  for (const m2 of midStem) {
    if (taken.some((t2) => overlaps(t2, m2.box, sp * 0.4))) continue;
    const cy2 = m2.box.y + m2.box.h / 2;
    const top = Math.min(m2.stem.y0, m2.stem.y1);
    const bottom2 = Math.max(m2.stem.y0, m2.stem.y1);
    const x = (m2.stem.x0 + m2.stem.x1) / 2;
    const mate = [...out.map((o) => o.box), ...taken].some((o) => {
      if (o === m2.box) return false;
      if (Math.abs(x - o.x) > tol && Math.abs(x - (o.x + o.w)) > tol) return false;
      if (bottom2 < o.y || top > o.y + o.h) return false;
      return Math.abs(o.y + o.h / 2 - cy2) <= sp * MATE_GAP;
    });
    if (!mate) continue;
    out.push({ box: m2.box, code: "noteheadHalf" });
    taken.push(m2.box);
  }
  return out;
}
function ringOuter(nl, hole, sp) {
  const cap = Math.round(sp * 0.7);
  const ink = (x, y) => x >= 0 && y >= 0 && x < nl.w && y < nl.h && nl.data[y * nl.w + x] === 1;
  const run = (x, y, dx, dy) => {
    let j2 = 0;
    while (j2 <= cap && ink(x + dx * j2, y + dy * j2)) j2++;
    return j2 === 0 || j2 > cap ? null : j2;
  };
  let l2 = Infinity, r4 = -Infinity, t2 = Infinity, b = -Infinity;
  for (let y = hole.y; y < hole.y + hole.h; y++) {
    let xa = -1, xb = -1;
    for (let x = hole.x; x < hole.x + hole.w; x++) if (!ink(x, y)) {
      if (xa < 0) xa = x;
      xb = x;
    }
    if (xa < 0) continue;
    const a = run(xa - 1, y, -1, 0);
    const c2 = run(xb + 1, y, 1, 0);
    if (a !== null) l2 = Math.min(l2, xa - a);
    if (c2 !== null) r4 = Math.max(r4, xb + c2);
  }
  for (let x = hole.x; x < hole.x + hole.w; x++) {
    let ya = -1, yb = -1;
    for (let y = hole.y; y < hole.y + hole.h; y++) if (!ink(x, y)) {
      if (ya < 0) ya = y;
      yb = y;
    }
    if (ya < 0) continue;
    const a = run(x, ya - 1, 0, -1);
    const c2 = run(x, yb + 1, 0, 1);
    if (a !== null) t2 = Math.min(t2, ya - a);
    if (c2 !== null) b = Math.max(b, yb + c2);
  }
  if (!isFinite(l2) || !isFinite(r4) || !isFinite(t2) || !isFinite(b)) return null;
  return { x: l2, y: t2, w: r4 - l2 + 1, h: b - t2 + 1 };
}
function hollowHeadsFromCavities(nl, cavities, unit, stems, inStaffBand, taken, size, heads) {
  const sp = unit.space;
  const tol = Math.max(unit.lineThick * 2, sp * 0.25);
  const out = [];
  const flagOf = (b) => heads.some((h2) => {
    const dy = Math.abs(h2.y + h2.h / 2 - (b.y + b.h / 2));
    if (dy < sp || dy > sp * INK_STEM[1]) return false;
    return h2.x <= b.x + b.w + tol && h2.x + h2.w >= b.x - tol;
  });
  for (const cav of cavities.slice().sort((a, b) => a.y - b.y)) {
    const cw = cav.w / sp;
    const ch = cav.h / sp;
    if (cw < HOLE_W[0] || cw > HOLE_W[1] || ch < HOLE_H[0] || ch > HOLE_H[1]) continue;
    const cx2 = cav.x + cav.w / 2;
    const cy2 = cav.y + cav.h / 2;
    if (!inStaffBand(cy2)) continue;
    const box = { x: Math.round(cx2 - size.w / 2), y: Math.round(cy2 - size.h / 2), w: size.w, h: size.h };
    let ink = 0;
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++)
        if (x >= 0 && y >= 0 && x < nl.w && y < nl.h && nl.data[y * nl.w + x]) ink++;
    const fill = ink / Math.max(1, box.w * box.h);
    if (fill < FILL_RING[0] || fill > FILL_RING[1]) continue;
    if (taken.some((t2) => overlaps(t2, box, sp * 0.4))) continue;
    if (flagOf(box)) continue;
    if (!stemOf(box, stems, unit)) {
      const col = inkColumn(nl, box, unit);
      const reach = col ? Math.max(cy2 - col[0], col[1] - cy2) : 0;
      if (reach < sp * INK_STEM[0] || reach > sp * INK_STEM[1]) continue;
    }
    out.push({ box, code: "noteheadHalf" });
    taken.push(box);
  }
  return out;
}
const STACK_H = [1, 2];
const STACK_W = 0.9;
const PITCH_CORE = 1;
const PITCH_SCORE = 0.3;
const CAVITY_MIN = 0.5;
const PAIR_SCORE = 0.25;
const PAIR_CAVITY = 0.7;
const PAIR_INK = 0.32;
function pitchScorer(bin, nl, rawHoles, allMasks, unit, stems) {
  const sp = unit.space;
  const masks = allMasks.map((m2) => {
    const h2 = Math.min(m2.h, Math.max(3, Math.round(sp * PITCH_CORE)));
    const top = Math.floor((m2.h - h2) / 2);
    return { ...m2, h: h2, p: m2.p.slice(top * m2.w, (top + h2) * m2.w) };
  });
  const rx = sp * 0.45;
  const ry = sp * 0.32;
  const cavity = (cx2, cy2) => {
    let n2 = 0;
    let hit = 0;
    for (let y = Math.round(cy2 - ry); y <= Math.round(cy2 + ry); y++)
      for (let x = Math.round(cx2 - rx); x <= Math.round(cx2 + rx); x++) {
        if (((x - cx2) / rx) ** 2 + ((y - cy2) / ry) ** 2 > 1) continue;
        n2++;
        if (x < 0 || y < 0 || x >= bin.w || y >= bin.h || bin.data[y * bin.w + x]) continue;
        if (rawHoles.some((r4) => x >= r4.x && x < r4.x + r4.w && y >= r4.y && y < r4.y + r4.h)) hit++;
      }
    return n2 ? hit / n2 : 0;
  };
  const best = (st, xa, xb) => {
    const m2 = masks.find((k2) => k2.onLine === st.line) ?? masks[0];
    let b = null;
    for (let x = Math.round(xa); x <= Math.round(xb); x++) {
      const sc = scoreAt(bin, m2, x, st.y);
      if (!b || sc > b.s) b = { x, s: sc };
    }
    return b;
  };
  const clash = (b, list) => list.some(
    (t2) => Math.abs(t2.y + t2.h / 2 - (b.y + b.h / 2)) < sp * 0.75 && Math.abs(t2.x + t2.w / 2 - (b.x + b.w / 2)) < (t2.w + b.w) / 2 - sp * 0.2
  );
  const codeOf = (box, picked) => {
    let stem = stemOf(box, stems, unit);
    let ink;
    if (!stem) {
      const col = inkColumn(nl, box, unit);
      const cy2 = box.y + box.h / 2;
      const reach = col ? Math.max(cy2 - col[0], col[1] - cy2) : 0;
      if (col && reach >= sp * INK_STEM[0] && reach <= sp * INK_STEM[1]) {
        stem = true;
        ink = { x0: col[2], y0: col[0], x1: col[2], y1: col[1], lw: unit.lineThick, maxLw: unit.lineThick * 2 };
      }
    }
    if (!stem) {
      const through = stemThrough(box, stems, unit);
      if (through && picked.some((o) => o !== box && Math.abs(o.y - box.y) <= sp * MATE_GAP)) stem = through;
    }
    if (!stem && box.w / sp < W_WHOLE) return null;
    return { code: stem ? "noteheadHalf" : "noteheadWhole", ink };
  };
  const inkIn = (cx2, cy2, w) => {
    const x0 = Math.max(0, Math.round(cx2 - w / 2));
    const x1 = Math.min(bin.w - 1, Math.round(cx2 + w / 2));
    let n2 = 0;
    let k2 = 0;
    for (let y = Math.max(0, Math.round(cy2 - sp * 0.45)); y <= Math.min(bin.h - 1, Math.round(cy2 + sp * 0.45)); y++) {
      let row = 0;
      for (let x = x0; x <= x1; x++) row += bin.data[y * bin.w + x];
      if (row >= (x1 - x0 + 1) * 0.9) continue;
      n2 += x1 - x0 + 1;
      k2 += row;
    }
    return n2 ? k2 / n2 : 0;
  };
  return { cavity, best, clash, codeOf, inkIn };
}
function hollowHeadsByPitch(bin, nl, rawHoles, holes, allMasks, unit, stepsIn, stems, inStaffBand, taken) {
  const sp = unit.space;
  if (!allMasks.length) return [];
  const { cavity, best, clash, codeOf, inkIn } = pitchScorer(bin, nl, rawHoles, allMasks, unit, stems);
  const ring = Math.max(2, Math.round(sp * RING));
  const out = [];
  const headH = Math.round(sp * 1.1);
  for (const hole of holes) {
    const hw = hole.w / sp;
    const hh = hole.h / sp;
    if (hw < STACK_W || hw > HOLE_W[1] || hh <= STACK_H[0] || hh > STACK_H[1]) continue;
    const cx0 = hole.x + hole.w / 2;
    if (!inStaffBand(hole.y + hole.h / 2)) continue;
    const bw = hole.w + ring * 2;
    const cands = [];
    const loose = [];
    for (const st of stepsIn(hole.y - sp * 0.3, hole.y + hole.h + sp * 0.3)) {
      const b = best(st, cx0 - sp * 0.2, cx0 + sp * 0.2);
      if (!b) continue;
      const cav = cavity(b.x, st.y);
      if (b.s >= PAIR_SCORE && cav >= PAIR_CAVITY && inkIn(b.x, st.y, hole.w + ring * 2) >= PAIR_INK) loose.push({ x: b.x, y: st.y, s: b.s });
      if (b.s < PITCH_SCORE || cav < CAVITY_MIN) continue;
      cands.push({ x: b.x, y: st.y, s: b.s });
    }
    const relaxed = cands.length < 2 && loose.length === 2 && Math.abs(loose[0].y - loose[1].y) > sp * 0.75;
    if (relaxed) cands.splice(0, cands.length, ...loose);
    cands.sort((a, b) => b.s - a.s);
    const picked = [];
    for (const c2 of cands) {
      const box = { x: Math.round(c2.x - bw / 2), y: Math.round(c2.y - headH / 2), w: bw, h: headH };
      if (clash(box, picked) || clash(box, taken)) continue;
      picked.push(box);
    }
    if (picked.length < 2) continue;
    if (relaxed && picked.some((b) => codeOf(b, picked)?.code !== "noteheadHalf")) continue;
    for (const box of picked) {
      const c2 = codeOf(box, picked);
      if (!c2) continue;
      out.push({ box, code: c2.code, weak: true });
      taken.push(box);
    }
  }
  return out;
}
const ALONG_FREE = 2.5;
const ALONG_GAP = 3.5;
const ALONG_MID = 1.5;
const ALONG_SCORE = 0.3;
const ALONG_INK = [0.35, 0.8];
const ALONG_CAVITY = 0.35;
const ALONG_END_TOL = 0.3;
const BEYOND_SCORE = 0.4;
const BEYOND_CAVITY = 0.2;
const ALONG_END_SCORE = 0.2;
const THIRD_CAVITY = 0.4;
const THIRD_SCORE = 0.2;
const ALONG_FILLED_SCORE = 0.35;
const ALONG_FILLED_INK = 0.4;
const ALONG_SANDWICH = 1.25;
const END_THIN = { score: 0.4, cavity: 0.6, ink: 0.3 };
const TIP_SCORE = 0.5;
function hollowHeadsAlongStems(bin, nl, rawHoles, allMasks, unit, stepsIn, stems, heads) {
  const sp = unit.space;
  const { best: best0, clash, inkIn, cavity } = pitchScorer(bin, nl, rawHoles, allMasks, unit, stems);
  const best = (st, xa, xb) => allMasks.length ? best0(st, xa, xb) : { x: Math.round((xa + xb) / 2), s: 1 };
  const tol = Math.max(unit.lineThick * 2, sp * 0.25);
  const out = [];
  const taken = heads.map((h2) => h2.box);
  const cyOf = (h2) => h2.box.y + h2.box.h / 2;
  const ranges = [];
  for (const v2 of stems) {
    const vx = (v2.x0 + v2.x1) / 2;
    const top = Math.min(v2.y0, v2.y1);
    const bot = Math.max(v2.y0, v2.y1);
    if (bot - top < sp * 1.5) continue;
    for (const h2 of heads) {
      const tolX = Math.max(tol, sp * 0.4);
      const edge = Math.min(Math.abs(h2.box.x + h2.box.w - vx), Math.abs(h2.box.x - vx));
      if (h2.code !== "noteheadHalf" || edge > tolX) continue;
      const strict = edge <= tol;
      const hy = cyOf(h2);
      if (hy >= top - sp * 0.5 && hy <= bot + sp * 0.5) {
        const nearBot = Math.abs(bot - hy) <= Math.abs(top - hy);
        if (Math.abs((nearBot ? bot : top) - hy) <= sp * 0.6) {
          ranges.push(nearBot ? { ref: h2, y0: hy + sp * 0.75, y1: hy + sp * 1.25, beyond: true } : { ref: h2, y0: hy - sp * 1.25, y1: hy - sp * 0.75, beyond: true });
          ranges.push(nearBot ? { ref: h2, y0: hy - sp * 1.25, y1: hy - sp * 0.75, beyond: true, third: true } : { ref: h2, y0: hy + sp * 0.75, y1: hy + sp * 1.25, beyond: true, third: true });
        }
        if (!strict) continue;
        if (bot - top < sp * (ALONG_FREE + 1)) continue;
        if (nearBot) ranges.push({ ref: h2, y0: top + sp * ALONG_FREE, y1: hy - sp * 0.75 });
        else ranges.push({ ref: h2, y0: hy + sp * 0.75, y1: bot - sp * ALONG_FREE });
        const near = nearBot ? bot : top;
        if (Math.abs(near - hy) >= sp * ALONG_MID)
          ranges.push(nearBot ? { ref: h2, y0: hy + sp * 0.75, y1: bot + sp * 0.3, end: bot } : { ref: h2, y0: top - sp * 0.3, y1: hy - sp * 0.75, end: top });
        else if (Math.abs(near - hy) >= sp * 0.75)
          ranges.push(nearBot ? { ref: h2, y0: bot - sp * 0.3, y1: bot + sp * 0.3, end: bot, third: true, tip: true } : { ref: h2, y0: top - sp * 0.3, y1: top + sp * 0.3, end: top, third: true, tip: true });
      } else if (!strict) {
        continue;
      } else if (hy > bot && hy - bot <= sp * ALONG_GAP) {
        ranges.push({ ref: h2, y0: bot - sp * 0.3, y1: hy - sp * 0.75 });
      } else if (hy < top && top - hy <= sp * ALONG_GAP) {
        ranges.push({ ref: h2, y0: hy + sp * 0.75, y1: top + sp * 0.3 });
      }
    }
  }
  for (const { ref, y0, y1, end, beyond, third, tip } of ranges) {
    if (y1 <= y0) continue;
    const cx2 = ref.box.x + ref.box.w / 2;
    for (const st of stepsIn(y0, y1)) {
      const atEnd = end !== void 0 && Math.abs(st.y - end) <= sp * ALONG_END_TOL;
      const b = best(st, cx2 - sp * 0.15, cx2 + sp * 0.15);
      if (!b) continue;
      const ink = inkIn(b.x, st.y, ref.box.w);
      const cavMin = beyond && b.s >= BEYOND_SCORE ? BEYOND_CAVITY : ALONG_CAVITY;
      const minS = third && cavity(b.x, st.y) >= THIRD_CAVITY ? THIRD_SCORE : atEnd ? ALONG_END_SCORE : ALONG_SCORE;
      const inkMin = atEnd && b.s >= END_THIN.score && cavity(b.x, st.y) >= END_THIN.cavity ? END_THIN.ink : ALONG_INK[0];
      if (b.s < minS || ink < inkMin || ink > ALONG_INK[1]) continue;
      const box = { x: Math.round(b.x - ref.box.w / 2), y: Math.round(st.y - ref.box.h / 2), w: ref.box.w, h: ref.box.h };
      if (cavity(b.x, st.y) < cavMin) {
        const near = (dir) => taken.some((t2) => {
          const d2 = (t2.y + t2.h / 2 - st.y) * dir;
          return d2 > 0 && d2 <= sp * ALONG_SANDWICH && Math.abs(t2.x + t2.w / 2 - b.x) < sp * 0.6;
        });
        if (b.s < ALONG_FILLED_SCORE || ink < ALONG_FILLED_INK && !(tip && b.s >= TIP_SCORE) || near(1) && near(-1)) continue;
      }
      if (clash(box, taken)) continue;
      out.push({ box, code: "noteheadHalf", weak: true });
      taken.push(box);
    }
  }
  return out;
}
const LEDGER_LEN = [1.2, 2.8];
const LEDGER_SCORE = 0.35;
const LEDGER_CAVITY = 0.3;
function hollowHeadsOnLedgers(bin, nl, rawHoles, allMasks, unit, ledgers, stepsIn, stems, taken, inkStems) {
  const sp = unit.space;
  if (!allMasks.length) return [];
  const { cavity, best, codeOf } = pitchScorer(bin, nl, rawHoles, allMasks, unit, stems);
  const out = [];
  const bw = Math.round(sp * 1.3);
  const headH = Math.round(sp * 1.1);
  const picked = [];
  const cands = [];
  for (const l2 of ledgers) {
    const len = (l2.x1 - l2.x0) / sp;
    if (len < LEDGER_LEN[0] || len > LEDGER_LEN[1]) continue;
    for (const st of stepsIn(l2.y - sp * 0.7, l2.y + sp * 0.7)) {
      const b = best(st, l2.x0 + sp * 0.4, l2.x1 - sp * 0.4);
      if (!b || b.s < LEDGER_SCORE) continue;
      const cv = cavity(b.x, st.y);
      if (cv < LEDGER_CAVITY) continue;
      cands.push({ x: b.x, y: st.y, s: b.s });
    }
  }
  cands.sort((a, b) => b.s - a.s);
  const second = (b, list) => list.some((t2) => {
    const dy = Math.abs(t2.y + t2.h / 2 - (b.y + b.h / 2));
    const dx = Math.abs(t2.x + t2.w / 2 - (b.x + b.w / 2));
    return dy < sp * 0.25 ? dx < (t2.w + b.w) / 2 - sp * 0.2 : dy < sp * 0.75 && dx < (t2.w + b.w) / 2 * 0.6;
  });
  for (const c2 of cands) {
    const box = { x: Math.round(c2.x - bw / 2), y: Math.round(c2.y - headH / 2), w: bw, h: headH };
    if (second(box, picked) || second(box, taken)) continue;
    picked.push(box);
  }
  for (const box of picked) {
    const c2 = codeOf(box, picked);
    if (!c2) continue;
    out.push({ box, code: c2.code, weak: true });
    if (c2.ink) inkStems.push(c2.ink);
    taken.push(box);
  }
  return out;
}
function inkColumn(nl, b, unit, sided = false) {
  const tol = Math.round(Math.max(unit.lineThick * 2, unit.space * 0.25));
  const cy2 = Math.round(b.y + b.h / 2);
  const at = (x, y) => x >= 0 && y >= 0 && x < nl.w && y < nl.h && nl.data[y * nl.w + x] === 1;
  const walk = (x, dir) => {
    let last = cy2;
    for (let y = cy2, miss = 0; miss <= 2 && y >= 0 && y < nl.h; y += dir) {
      if (at(x, y)) {
        last = y;
        miss = 0;
      } else miss++;
    }
    return last;
  };
  let best = null;
  for (const edge of [b.x, b.x + b.w]) {
    for (let x = Math.round(edge) - tol; x <= Math.round(edge) + tol; x++) {
      const top = sided && edge === b.x ? cy2 : walk(x, -1);
      const bottom2 = sided && edge !== b.x ? cy2 : walk(x, 1);
      if (!best || bottom2 - top > best[1] - best[0]) best = [top, bottom2, x];
    }
  }
  return best;
}
function stemThrough(b, stems, unit) {
  const tol = Math.max(unit.lineThick * 2, unit.space * 0.25);
  for (const s of stems) {
    const x = (s.x0 + s.x1) / 2;
    if (Math.abs(x - b.x) > tol && Math.abs(x - (b.x + b.w)) > tol) continue;
    if (Math.max(s.y0, s.y1) < b.y + b.h / 2 || Math.min(s.y0, s.y1) > b.y + b.h / 2) continue;
    return s;
  }
  return null;
}
function overlaps(a, b, tol) {
  return Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < tol + (a.w + b.w) / 4 && Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < tol + (a.h + b.h) / 4;
}
const BARE_LEN = [2.5, 6];
const DOT_MAX$1 = 0.45;
function probeBareStems(stems, heads, free, unit, isBar) {
  const sp = unit.space;
  const out = [];
  for (const s of stems) {
    const top = Math.min(s.y0, s.y1);
    const bot = Math.max(s.y0, s.y1);
    if (bot - top < sp * BARE_LEN[0] || bot - top > sp * BARE_LEN[1]) continue;
    const barLike = isBar(s);
    const sx = (s.x0 + s.x1) / 2;
    const headAt = (e) => heads.some((h2) => Math.abs(h2.x + h2.w / 2 - sx) < sp * 1.6 && Math.abs(h2.y + h2.h / 2 - e) < sp * 1.2);
    for (const end of ["top", "bottom"]) {
      const e = end === "top" ? top : bot;
      if (headAt(e) || headAt(end === "top" ? bot : top)) continue;
      const y0 = end === "top" ? e - sp * 0.9 : e - sp * 2;
      const y1 = end === "top" ? e + sp * 2 : e + sp * 0.9;
      const x0 = end === "bottom" ? sx - sp * 1.8 : sx - sp * 0.3;
      const x1 = end === "bottom" ? sx + sp * 0.3 : sx + sp * 1.8;
      const got = free.filter((f2) => {
        const cx2 = f2.box.x + f2.box.w / 2;
        const cy2 = f2.box.y + f2.box.h / 2;
        if (f2.box.w < sp * DOT_MAX$1 && f2.box.h < sp * DOT_MAX$1) return false;
        return cx2 > x0 && cx2 < x1 && cy2 > y0 && cy2 < y1;
      });
      if (!got.length) continue;
      let l2 = Infinity, r4 = -Infinity, t2 = Infinity, b = -Infinity, area = 0;
      for (const f2 of got) {
        l2 = Math.min(l2, f2.box.x);
        r4 = Math.max(r4, f2.box.x + f2.box.w);
        t2 = Math.min(t2, f2.box.y);
        b = Math.max(b, f2.box.y + f2.box.h);
        area += f2.area;
      }
      if (barLike) {
        const touch = end === "bottom" ? Math.abs(r4 - sx) <= sp * 0.3 : Math.abs(l2 - sx) <= sp * 0.3;
        if (!touch || r4 - l2 < sp * BARE_W[0] || b - t2 < sp * BARE_H1[0]) continue;
      }
      out.push({ stem: s, end, box: { x: l2, y: t2, w: r4 - l2, h: b - t2 }, area, ids: got.map((f2) => f2.id) });
    }
  }
  return out;
}
function headsBetweenStemPairs(stems, heads, unit, snap, size, bin, onLine, isBar) {
  const sp = unit.space;
  const out = [];
  const cand = stems.filter((s) => {
    const len = Math.abs(s.y1 - s.y0);
    return len >= sp * 2 && len <= sp * BARE_LEN[1] && !isBar(s);
  });
  const xOf = (s) => (s.x0 + s.x1) / 2;
  const headAt = (x, y) => heads.some((h2) => Math.abs(h2.x + h2.w / 2 - x) < sp * 1.6 && Math.abs(h2.y + h2.h / 2 - y) < sp * 1.2);
  const inkIn = (cx2, cy2, w, h2) => {
    let n2 = 0, ink = 0;
    for (let y = Math.round(cy2 - h2 / 2); y <= Math.round(cy2 + h2 / 2); y++) {
      if (y < 0 || y >= bin.h || onLine(y)) continue;
      for (let x = Math.round(cx2 - w / 2); x <= Math.round(cx2 + w / 2); x++) {
        if (x < 0 || x >= bin.w) continue;
        n2++;
        if (bin.data[y * bin.w + x]) ink++;
      }
    }
    return n2 ? ink / n2 : 0;
  };
  const used = /* @__PURE__ */ new Set();
  for (const up of cand) {
    if (used.has(up)) continue;
    const ux = xOf(up), uy = Math.max(up.y0, up.y1), uTop = Math.min(up.y0, up.y1);
    if (headAt(ux, uy) || headAt(ux, uTop)) continue;
    for (const dn of cand) {
      if (dn === up || used.has(dn)) continue;
      const dx = xOf(dn), dy = Math.min(dn.y0, dn.y1), dBot = Math.max(dn.y0, dn.y1);
      if (ux - dx < sp * 0.8 || ux - dx > sp * 1.7 || Math.abs(uy - dy) > sp * 0.7) continue;
      if (headAt(dx, dy) || headAt(dx, dBot)) continue;
      const cx2 = (ux + dx) / 2;
      const cy2 = snap((uy + dy) / 2) ?? (uy + dy) / 2;
      const fill = inkIn(cx2, cy2, size.w * 0.9, size.h * 0.9);
      if (fill < 0.12) continue;
      const core = inkIn(cx2, cy2, sp * 0.6, sp * 0.4);
      out.push({ box: { x: Math.round(cx2 - size.w / 2), y: Math.round(cy2 - size.h / 2), w: size.w, h: size.h }, code: core >= BARE_SOLID ? "noteheadBlack" : "noteheadHalf", ids: [], weak: true });
      used.add(up);
      used.add(dn);
      break;
    }
  }
  return out;
}
const BARE_W = [0.8, 1.6];
const BARE_H1 = [0.8, 1.35];
const BARE_H2 = [1.6, 2.5];
const BARE_FILL = [0.15, 0.6];
const BARE_CORE = 0.8;
const BARE_SOLID = 0.9;
function headsOnBareStems(probes, unit, snap, size, bin, onLine) {
  const sp = unit.space;
  const core = (cx2, cy2) => {
    let n2 = 0;
    let ink = 0;
    for (let y = Math.round(cy2 - sp * 0.2); y <= Math.round(cy2 + sp * 0.2); y++) {
      if (onLine(y)) continue;
      for (let x = Math.round(cx2 - sp * 0.3); x <= Math.round(cx2 + sp * 0.3); x++) {
        if (x < 0 || y < 0 || x >= bin.w || y >= bin.h) continue;
        n2++;
        if (bin.data[y * bin.w + x]) ink++;
      }
    }
    return n2 ? ink / n2 : 1;
  };
  const out = [];
  const used = /* @__PURE__ */ new Set();
  const widest = (box, y) => {
    let most = 0;
    for (let yy = Math.round(y - sp * 0.25); yy <= Math.round(y + sp * 0.25); yy++) {
      if (yy < 0 || yy >= bin.h || onLine(yy)) continue;
      let x0 = -1;
      let x1 = -1;
      for (let x = box.x; x < box.x + box.w; x++)
        if (bin.data[yy * bin.w + x]) {
          if (x0 < 0) x0 = x;
          x1 = x;
        }
      if (x0 >= 0) most = Math.max(most, x1 - x0 + 1);
    }
    return most;
  };
  const judge2 = (box, area, strict = false) => {
    const w = box.w / sp;
    const h2 = box.h / sp;
    const fill = area / (box.w * box.h);
    if (w < BARE_W[0] || w > BARE_W[1] || fill < BARE_FILL[0]) return null;
    let ys;
    if (h2 >= BARE_H1[0] && h2 <= BARE_H1[1]) {
      const c2 = snap(box.y + box.h / 2);
      if (c2 === null) return null;
      ys = [c2];
    } else if (h2 >= BARE_H2[0] && h2 <= BARE_H2[1]) {
      const hh = Math.max(sp * 0.8, box.h - sp);
      const a = snap(box.y + hh / 2);
      const b = snap(box.y + box.h - hh / 2);
      if (a === null || b === null || Math.abs(Math.abs(b - a) - sp) > sp * 0.3) return null;
      ys = [a, b];
    } else return null;
    if (strict && ys.some((y) => widest(box, y) < sp * 0.8)) return null;
    const cx2 = box.x + box.w / 2;
    const cores = ys.map((y) => core(cx2, y));
    if (fill <= BARE_FILL[1] && cores.every((c2) => c2 <= BARE_CORE)) return { ys, code: "noteheadHalf", cx: cx2 };
    if (ys.length === 1 && cores[0] >= BARE_SOLID) return { ys, code: "noteheadBlack", cx: cx2 };
    return null;
  };
  for (const p2 of probes) {
    if (p2.ids.some((id) => used.has(id))) continue;
    let got = judge2(p2.box, p2.area);
    if (!got && p2.box.h / sp > BARE_H1[1]) {
      const cut = endInk(bin, p2, sp, onLine);
      if (cut) got = judge2(cut.box, cut.area, true);
      if (got?.code !== "noteheadHalf") got = null;
    }
    if (!got) continue;
    for (const id of p2.ids) used.add(id);
    for (const y of got.ys) out.push({ box: { x: Math.round(got.cx - size.w / 2), y: Math.round(y - size.h / 2), w: size.w, h: size.h }, code: got.code, ids: p2.ids, weak: true });
  }
  return out;
}
function endInk(bin, p2, sp, onLine) {
  const s = p2.stem;
  const sx = (s.x0 + s.x1) / 2;
  const e = p2.end === "top" ? Math.min(s.y0, s.y1) : Math.max(s.y0, s.y1);
  const ya = Math.max(0, Math.round(p2.end === "top" ? e - sp * 0.9 : e - sp * 2));
  const yb = Math.min(bin.h - 1, Math.round(p2.end === "top" ? e + sp * 2 : e + sp * 0.9));
  const xa = Math.max(0, Math.round(p2.end === "bottom" ? sx - sp * 1.8 : sx - sp * 0.3));
  const xb = Math.min(bin.w - 1, Math.round(p2.end === "bottom" ? sx + sp * 0.3 : sx + sp * 1.8));
  const lw = Math.max(1, s.lw);
  const rows = [];
  for (let y = ya; y <= yb; y++) {
    if (onLine(y)) continue;
    let span = 0;
    for (let x = Math.max(0, xa - Math.round(sp)); x <= Math.min(bin.w - 1, xb + Math.round(sp)); x++) span += bin.data[y * bin.w + x];
    let n2 = 0;
    let x02 = Infinity;
    let x12 = -Infinity;
    for (let x = xa; x <= xb; x++) {
      if (Math.abs(x - sx) <= lw || !bin.data[y * bin.w + x]) continue;
      n2++;
      x02 = Math.min(x02, x);
      x12 = Math.max(x12, x);
    }
    rows.push({ y, x0: x02, x1: x12, n: n2, span });
  }
  const wide = (i2) => rows[i2].span >= sp * 1.8;
  const thin = (i2) => wide(i2) && [-3, 3].every((k2) => rows[i2 + k2] === void 0 || rows[i2 + k2].span < sp * 1.8);
  const led = rows.filter((_, i2) => thin(i2)).map((r4) => r4.y);
  const onLed = (r4) => led.some((y) => Math.abs(y - r4.y) <= 2);
  const keep = rows.filter((r4) => r4.n >= sp * 0.4 && !(onLed(r4) && !rows.some((q2) => Math.abs(q2.y - r4.y) <= 4 && !onLed(q2) && q2.n >= sp * 0.4)));
  if (!keep.length) return null;
  const y0 = keep[0].y;
  const y1 = keep[keep.length - 1].y;
  for (let k2 = 1; k2 <= 2; k2++) {
    const y = p2.end === "bottom" ? ya - k2 : yb + k2;
    if (y < 0 || y >= bin.h || onLine(y)) continue;
    let n2 = 0;
    for (let x = xa; x <= xb; x++) if (Math.abs(x - sx) > lw && bin.data[y * bin.w + x]) n2++;
    if (n2 >= sp * 0.4) return null;
  }
  const body = keep.filter((r4) => !onLed(r4));
  const x0 = Math.min(...(body.length ? body : keep).map((r4) => r4.x0));
  const x1 = Math.max(...(body.length ? body : keep).map((r4) => r4.x1));
  let area = 0;
  for (const r4 of rows) if (r4.y >= y0 && r4.y <= y1 && !onLed(r4)) area += r4.n;
  return { box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, area };
}
const SLIT_LEN = 0.45;
const SLIT_AREA = 0.06;
const SLIT_DENS = 0.88;
const SLIT_OFF = 0.2;
function hollowSlit(bin, b, sp) {
  const W = b.w + 2;
  const H2 = b.h + 2;
  const ink = (x, y) => {
    const X = b.x - 1 + x;
    const Y = b.y - 1 + y;
    return X >= 0 && Y >= 0 && X < bin.w && Y < bin.h && !!bin.data[Y * bin.w + X];
  };
  const seen = new Uint8Array(W * H2);
  const st = [];
  const seed = (x, y) => {
    const i2 = y * W + x;
    if (!seen[i2] && !ink(x, y)) {
      seen[i2] = 1;
      st.push(i2);
    }
  };
  const flood = () => {
    let n2 = 0;
    let sx = 0;
    let sy = 0;
    let x0 = W, x1 = -1, y0 = H2, y1 = -1;
    while (st.length) {
      const i2 = st.pop();
      const x = i2 % W;
      const y = i2 / W | 0;
      n2++;
      sx += x;
      sy += y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (x > 0) seed(x - 1, y);
      if (x < W - 1) seed(x + 1, y);
      if (y > 0) seed(x, y - 1);
      if (y < H2 - 1) seed(x, y + 1);
    }
    return [n2, Math.max(x1 - x0 + 1, y1 - y0 + 1), sx / Math.max(1, n2), sy / Math.max(1, n2)];
  };
  for (let x = 0; x < W; x++) {
    seed(x, 0);
    seed(x, H2 - 1);
  }
  for (let y = 0; y < H2; y++) {
    seed(0, y);
    seed(W - 1, y);
  }
  flood();
  let best = 0;
  let bestLen = 0;
  let cx2 = 0;
  let cy2 = 0;
  for (let y = 1; y < H2 - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (seen[y * W + x] || ink(x, y)) continue;
      seed(x, y);
      const [n2, len, mx, my] = flood();
      if (n2 > best) {
        best = n2;
        bestLen = len;
        cx2 = mx;
        cy2 = my;
      }
    }
  if (bestLen < sp * SLIT_LEN || best < sp * sp * SLIT_AREA) return false;
  if (Math.abs(cx2 - W / 2) > b.w * SLIT_OFF || Math.abs(cy2 - H2 / 2) > b.h * SLIT_OFF) return false;
  let inE = 0;
  let inkE = 0;
  const rx = b.w / 2;
  const ry = b.h / 2;
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const u2 = (x + 0.5 - rx) / rx;
      const v2 = (y + 0.5 - ry) / ry;
      if (u2 * u2 + v2 * v2 > 1) continue;
      inE++;
      if (ink(x + 1, y + 1)) inkE++;
    }
  return inkE / Math.max(1, inE - best) <= SLIT_DENS;
}
function archCavity(bin, box, onLine) {
  const gap = (y) => {
    if (y < 0 || y >= bin.h) return 0;
    let most2 = 0;
    let run = -1;
    for (let x = Math.max(0, box.x); x < Math.min(bin.w, box.x + box.w); x++)
      if (bin.data[y * bin.w + x]) {
        if (run > most2) most2 = run;
        run = 0;
      } else if (run >= 0) run++;
    return most2;
  };
  let best = null;
  for (let y = box.y; y < box.y + box.h; ) {
    if (onLine(y) || gap(y) <= 0) {
      y++;
      continue;
    }
    let b = y;
    while (b + 1 < box.y + box.h && !onLine(b + 1) && gap(b + 1) > 0) b++;
    if (!best || b - y > best.b - best.a) best = { a: y, b };
    y = b + 1;
  }
  if (!best || best.b - best.a < 2) return false;
  const ws = [];
  for (let y = best.a; y <= best.b; y++) ws.push(gap(y));
  const most = Math.max(...ws);
  const beyond = (y, dy) => {
    while (onLine(y)) y += dy;
    if (y < 0 || y >= bin.h) return false;
    if (gap(y) > 0) return true;
    const m2 = Math.round(box.w * 0.2);
    for (let x = box.x + m2; x < box.x + box.w - m2; x++) if (x >= 0 && x < bin.w && bin.data[y * bin.w + x]) return true;
    return false;
  };
  const widening = (xs) => xs.every((w, i2) => i2 === 0 || w >= xs[i2 - 1] - 1);
  const bottom2 = onLine(best.b + 1) && ws[ws.length - 1] >= most * 0.9 && ws[0] <= most * 0.4 && widening(ws) && !beyond(best.b + 1, 1);
  const top = onLine(best.a - 1) && ws[0] >= most * 0.9 && ws[ws.length - 1] <= most * 0.4 && widening([...ws].reverse()) && !beyond(best.a - 1, -1);
  return bottom2 || top;
}
function stemWalledCavity(bin, box, sp) {
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const x1 = Math.min(bin.w - 1, box.x + box.w - 1);
  const y1 = Math.min(bin.h - 1, box.y + box.h - 1);
  const ink = (x, y) => !!bin.data[y * bin.w + x];
  const cx2 = Math.round((x0 + x1) / 2);
  const cy2 = Math.round((y0 + y1) / 2);
  const band = Math.round(box.h * 0.2);
  let seed = null;
  for (let r4 = 0; r4 <= box.w / 2 && !seed; r4++)
    for (let dy = -band; dy <= band && !seed; dy++)
      for (const dx of [-r4, r4]) if (!seed && cx2 + dx > x0 && cx2 + dx < x1 && cy2 + dy > y0 && cy2 + dy < y1 && !ink(cx2 + dx, cy2 + dy)) seed = [cx2 + dx, cy2 + dy];
  if (!seed) return false;
  const w = x1 - x0 + 1;
  const seen = new Uint8Array(w * (y1 - y0 + 1));
  const stack = [seed];
  seen[(seed[1] - y0) * w + seed[0] - x0] = 1;
  const rowMin = /* @__PURE__ */ new Map();
  const rowMax = /* @__PURE__ */ new Map();
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === x0 || x === x1 || y === y0 || y === y1) return false;
    rowMin.set(y, Math.min(rowMin.get(y) ?? x, x));
    rowMax.set(y, Math.max(rowMax.get(y) ?? x, x));
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (ink(nx, ny)) continue;
      const k2 = (ny - y0) * w + nx - x0;
      if (seen[k2]) continue;
      seen[k2] = 1;
      stack.push([nx, ny]);
    }
  }
  const run = (x, y) => {
    let t2 = y;
    let d2 = y;
    while (t2 > 0 && ink(x, t2 - 1)) t2--;
    while (d2 < bin.h - 1 && ink(x, d2 + 1)) d2++;
    return d2 - t2 + 1;
  };
  let left = 0;
  let right2 = 0;
  for (const [y, a] of rowMin) {
    if (ink(a - 1, y) && run(a - 1, y) >= sp * 2) left++;
    const b = rowMax.get(y);
    if (ink(b + 1, y) && run(b + 1, y) >= sp * 2) right2++;
  }
  return rowMin.size >= 2 && Math.max(left, right2) >= rowMin.size * 0.6;
}
const CHAR_MIN = 0.7;
const CHAR_MAX = 2.8;
const ROW_GAP = 0.9;
const MIN_CELLS = 3;
const TAIL_BAND = 24;
const TAIL_FIRST = 6;
const median$5 = (a) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
const rbottom = (r4) => r4.y + r4.h;
const rright = (r4) => r4.x + r4.w;
function findLyricRows(blobs, staves, unit) {
  const out = [];
  const raw = [];
  const sp = unit.space;
  for (let i2 = 0; i2 < staves.length; i2++) {
    const st = staves[i2];
    const limit = i2 + 1 < staves.length ? staves[i2 + 1].top : st.bottom + sp * TAIL_BAND;
    const band = blobs.filter((c2) => {
      const b = c2.bbox;
      if (b.y < st.bottom + sp * 0.3 || rbottom(b) > limit) return false;
      if (rright(b) < st.left - sp || b.x > st.right + sp) return false;
      const h2 = b.h / sp;
      return (h2 >= CHAR_MIN * 0.4 || b.w / sp >= CHAR_MIN) && h2 <= CHAR_MAX;
    });
    const isFlat = (c2) => c2.bbox.h / sp < CHAR_MIN * 0.4;
    const flat = band.filter(isFlat);
    const solid = band.filter((c2) => !isFlat(c2));
    if (solid.length < MIN_CELLS) continue;
    let rowsHere = splitRows(solid, sp).sort((a, b) => Math.min(...a.map((c2) => c2.bbox.y)) - Math.min(...b.map((c2) => c2.bbox.y)));
    if (i2 === staves.length - 1) {
      const kept = [];
      for (const r4 of rowsHere) {
        const top = Math.min(...r4.map((c2) => c2.bbox.y));
        const prev = kept[kept.length - 1];
        if (!prev) {
          if (top - st.bottom > sp * TAIL_FIRST) break;
        } else {
          const p0 = Math.min(...prev.map((c2) => c2.bbox.y));
          const p1 = Math.max(...prev.map((c2) => rbottom(c2.bbox)));
          if (top - p1 > p1 - p0) break;
        }
        kept.push(r4);
      }
      rowsHere = kept;
    }
    for (const row of rowsHere) {
      const charH = Math.max(median$5(row.map((c2) => c2.bbox.h)), sp * CHAR_MIN);
      const top = Math.min(...row.map((c2) => c2.bbox.y));
      const bot = Math.max(...row.map((c2) => rbottom(c2.bbox)));
      const x0 = Math.min(...row.map((c2) => c2.bbox.x)) - sp * 2;
      const x1 = Math.max(...row.map((c2) => rright(c2.bbox))) + sp * 2;
      const strokes = flat.filter((c2) => c2.cy > top && c2.cy < bot && c2.bbox.x >= x0 && rright(c2.bbox) <= x1);
      const cells = mergeToChars([...row, ...strokes], charH).filter((r4) => r4.h >= sp * CHAR_MIN * 0.5 || r4.w >= sp * CHAR_MIN * 1.5);
      if (cells.length < MIN_CELLS) continue;
      raw.push({ staffIndex: i2, verse: 0, cells, charH, blocks: row });
    }
  }
  const heights = raw.flatMap((r4) => r4.blocks.map((c2) => c2.bbox.h)).sort((a, b) => a - b);
  const charW = heights.length ? heights[Math.min(heights.length - 1, Math.floor(heights.length * 0.85))] : sp;
  for (const r4 of raw) {
    const near = r4.cells.filter((c2) => c2.w >= charW * 0.7 && c2.w <= charW * 1.3 && c2.h >= c2.w * 0.5);
    const charH = Math.max(median$5(near.map((c2) => c2.h)), sp * CHAR_MIN);
    const hs = r4.blocks.map((c2) => c2.bbox.h).sort((a, b) => a - b);
    const rowW = hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.85))];
    out.push({ ...r4, charH, cells: squareCells(r4.cells, Math.max(charW, rowW, charH)) });
  }
  const byStaff = /* @__PURE__ */ new Map();
  for (const r4 of out) {
    const a = byStaff.get(r4.staffIndex) ?? [];
    a.push(r4);
    byStaff.set(r4.staffIndex, a);
  }
  for (const a of byStaff.values()) {
    a.sort((x, y) => Math.min(...x.cells.map((c2) => c2.y)) - Math.min(...y.cells.map((c2) => c2.y)));
    a.forEach((r4, k2) => r4.verse = k2);
  }
  return out;
}
function squareCells(cells, charW) {
  const out = [];
  for (const c2 of cells) {
    const last = out[out.length - 1];
    const punct = c2.w < charW * 0.4 && c2.h < charW * 0.4 && c2.y > (last?.y ?? 0) + (last?.h ?? 0) * 0.4;
    if (last && c2.x - rright(last) <= charW * 0.35 && (punct || rright(c2) - last.x <= charW * 1.4)) {
      const x = Math.min(last.x, c2.x);
      const y = Math.min(last.y, c2.y);
      last.w = Math.max(rright(last), rright(c2)) - x;
      last.h = Math.max(rbottom(last), rbottom(c2)) - y;
      last.x = x;
      last.y = y;
    } else out.push({ ...c2 });
  }
  return out;
}
function splitRows(band, sp) {
  const sorted = [...band].sort((a, b) => a.cy - b.cy);
  const rows = [];
  let cur = [];
  let prev = 0;
  for (const c2 of sorted) {
    if (cur.length && c2.cy - prev > sp * ROW_GAP) {
      rows.push(cur);
      cur = [];
    }
    cur.push(c2);
    prev = c2.cy;
  }
  if (cur.length) rows.push(cur);
  return rows.flatMap(splitTall).filter((r4) => r4.length >= MIN_CELLS);
}
const TALL_MID = [0.25, 0.75];
const TALL_VALLEY = 0.35;
function splitTall(row) {
  if (row.length < MIN_CELLS * 2) return [row];
  const top = Math.min(...row.map((c2) => c2.bbox.y));
  const bot = Math.max(...row.map((c2) => c2.bbox.y + c2.bbox.h));
  const H2 = bot - top;
  const hs = row.map((c2) => c2.bbox.h).sort((a, b) => a - b);
  if (H2 <= hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.85))] * 1.7) return [row];
  const cov = new Float64Array(H2);
  for (const c2 of row) for (let y = c2.bbox.y; y < c2.bbox.y + c2.bbox.h; y++) cov[y - top] += c2.bbox.w;
  const peak = Math.max(...cov);
  let at = -1;
  for (let y = Math.round(H2 * TALL_MID[0]); y < Math.round(H2 * TALL_MID[1]); y++) if (at < 0 || cov[y] < cov[at]) at = y;
  if (at < 0 || cov[at] > peak * TALL_VALLEY) return splitTallByColumns(row);
  const cut = top + at;
  const up = row.filter((c2) => c2.cy < cut);
  const dn = row.filter((c2) => c2.cy >= cut);
  if (up.length < MIN_CELLS || dn.length < MIN_CELLS) return [row];
  return [...splitTall(up), ...splitTall(dn)];
}
const COLUMN_GAP = 2.5;
function splitTallByColumns(row) {
  const hs = row.map((c2) => c2.bbox.h).sort((a, b) => a - b);
  const gap = hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.85))] * COLUMN_GAP;
  const sorted = [...row].sort((a, b) => a.bbox.x - b.bbox.x);
  const parts = [];
  let right2 = -Infinity;
  for (const c2 of sorted) {
    if (!parts.length || c2.bbox.x - right2 > gap) parts.push([]);
    parts[parts.length - 1].push(c2);
    right2 = Math.max(right2, rright(c2.bbox));
  }
  if (parts.length < 2 || parts.some((p2) => p2.length < MIN_CELLS)) return [row];
  const span = (r4) => [Math.min(...r4.map((c2) => c2.bbox.y)), Math.max(...r4.map((c2) => rbottom(c2.bbox)))];
  const clean = (rs) => rs.every((r4, i2) => {
    if (!i2) return true;
    const [a0, a1] = span(rs[i2 - 1]);
    const [b0, b1] = span(r4);
    return Math.min(a1, b1) - Math.max(a0, b0) < Math.min(a1 - a0, b1 - b0) * 0.3;
  });
  const out = parts.flatMap((p2) => {
    const r4 = splitTall(p2).sort((a, b) => span(a)[0] - span(b)[0]);
    return r4.length > 1 && clean(r4) ? r4 : [p2];
  });
  if (out.length <= parts.length) return [row];
  const rows = [];
  for (const r4 of out.sort((a, b) => span(a)[0] - span(b)[0])) {
    const [b0, b1] = span(r4);
    const hit = rows.find((q2) => {
      const [a0, a1] = span(q2);
      return Math.min(a1, b1) - Math.max(a0, b0) > Math.min(a1 - a0, b1 - b0) * 0.5;
    });
    if (hit) hit.push(...r4);
    else rows.push([...r4]);
  }
  return rows.length > 1 ? rows : [row];
}
function stripOf(bin, row, pad = 2, grayPage) {
  const x0 = Math.max(0, Math.min(...row.cells.map((c2) => c2.x)) - pad);
  const x1 = Math.min(bin.w, Math.max(...row.cells.map((c2) => c2.x + c2.w)) + pad);
  const y0 = Math.max(0, Math.min(...row.cells.map((c2) => c2.y)) - pad);
  const y1 = Math.min(bin.h, Math.max(...row.cells.map((c2) => c2.y + c2.h)) + pad);
  const w = x1 - x0;
  const h2 = y1 - y0;
  if (w < 8 || h2 < 8) return null;
  const data = new Uint8Array(w * h2);
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = bin.data[(y0 + y) * bin.w + x0 + x];
  let gray;
  if (grayPage) {
    gray = new Uint8Array(w * h2);
    for (let y = 0; y < h2; y++)
      for (let x = 0; x < w; x++) gray[y * w + x] = grayPage[(y0 + y) * bin.w + x0 + x];
  }
  return {
    w,
    h: h2,
    data,
    box: { x: x0, y: y0, w, h: h2 },
    charH: row.charH,
    cells: row.cells.map((c2) => ({ x0: (c2.x - x0) / w, x1: (c2.x + c2.w - x0) / w, box: c2 })),
    ...gray ? { gray } : {}
  };
}
function stripKey(s) {
  const px = s.gray ?? s.data;
  let h1 = 2166136261;
  for (let i2 = 0; i2 < px.length; i2++) {
    h1 ^= px[i2];
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `${s.gray ? "g" : ""}${s.w}x${s.h}-${h1.toString(36)}`;
}
const DROP_COST = 0.08;
const LYRIC_CH = /[一-鿿，。、；：！？“”‘’（）—…]/;
const TRAIL_PUNCT = /[，。、；：！？…—”’）]/;
const LEAD_PUNCT = /[“‘（]/;
const SECTION_LABEL = /^[(（](?:副歌|歌|和|合)[)）]$/;
function dropSectionLabel(chars) {
  const s = [...chars].sort((a, b) => a.xFrac - b.xFrac);
  let k2 = 0;
  while (k2 < s.length && /^[0-9.．、\s]$/.test(s[k2].ch)) k2++;
  for (let n2 = 3; n2 <= 4 && k2 + n2 <= s.length; n2++)
    if (SECTION_LABEL.test(s.slice(k2, k2 + n2).map((c2) => c2.ch).join(""))) return [...s.slice(0, k2), ...s.slice(k2 + n2)];
  return chars;
}
function dropVerseNumber(chars) {
  const s = [...chars].sort((a, b) => a.xFrac - b.xFrac);
  if (!s.length || !/^[0-9]$/.test(s[0].ch)) return chars;
  let k2 = 0;
  while (k2 < s.length && /^[0-9.．、\s]$/.test(s[k2].ch)) k2++;
  return s.slice(k2);
}
function foldLyricChars(chars) {
  chars = dropSectionLabel(dropVerseNumber(chars)).filter((c2) => LYRIC_CH.test(c2.ch));
  const out = [];
  let lead = "";
  for (const c2 of chars) {
    if (LEAD_PUNCT.test(c2.ch)) {
      lead += c2.ch;
      continue;
    }
    if (TRAIL_PUNCT.test(c2.ch) && out.length) {
      out[out.length - 1].ch += c2.ch;
      continue;
    }
    out.push({ ch: lead + c2.ch, xFrac: c2.xFrac });
    lead = "";
  }
  return out;
}
function fillMissingCells(strip, keep) {
  if (!strip.cells.length) return strip;
  const maxW = Math.max(...strip.cells.map((c2) => c2.x1 - c2.x0));
  const wf = median$5(strip.cells.map((c2) => c2.x1 - c2.x0).filter((w) => w >= maxW * 0.5));
  const ref = strip.cells.reduce((a, c2) => c2.box.h > a.box.h ? c2 : a);
  const cells = [...strip.cells];
  for (const ch of keep) {
    if (cells.some((c2) => ch.xFrac >= c2.x0 - wf * 0.3 && ch.xFrac <= c2.x1 + wf * 0.3)) continue;
    const x0 = Math.max(0, ch.xFrac - wf / 2);
    const x1 = Math.min(1, ch.xFrac + wf / 2);
    cells.push({ x0, x1, box: { x: strip.box.x + x0 * strip.box.w, y: ref.box.y, w: (x1 - x0) * strip.box.w, h: ref.box.h } });
  }
  if (cells.length === strip.cells.length) return strip;
  cells.sort((a, b) => a.x0 - b.x0);
  return { ...strip, cells };
}
function splitWideCells(strip, extra) {
  const unit = strip.charH;
  if (!(unit > 0)) return strip;
  const wide = strip.cells.map((c2, i2) => ({ i: i2, k: Math.min(3, Math.round(c2.box.w / unit)) })).filter((e) => e.k >= 2 && strip.cells[e.i].box.w >= unit * 1.7).sort((a, b) => strip.cells[b.i].box.w - strip.cells[a.i].box.w);
  const parts = /* @__PURE__ */ new Map();
  for (const e of wide) {
    if (extra <= 0) break;
    const k2 = Math.min(e.k, extra + 1);
    parts.set(e.i, k2);
    extra -= k2 - 1;
  }
  if (!parts.size) return strip;
  const cells = [];
  strip.cells.forEach((c2, i2) => {
    const k2 = parts.get(i2) ?? 1;
    for (let t2 = 0; t2 < k2; t2++) {
      const x0 = c2.x0 + (c2.x1 - c2.x0) * t2 / k2;
      const x1 = c2.x0 + (c2.x1 - c2.x0) * (t2 + 1) / k2;
      const bw = c2.box.w / k2;
      cells.push({ x0, x1, box: { x: c2.box.x + bw * t2, y: c2.box.y, w: bw, h: c2.box.h } });
    }
  });
  return { ...strip, cells };
}
function mapCharsToCells(strip0, chars) {
  const keep = foldLyricChars(chars);
  const filled = keep.length > strip0.cells.length ? fillMissingCells(strip0, keep) : strip0;
  const strip = keep.length > filled.cells.length ? splitWideCells(filled, keep.length - filled.cells.length) : filled;
  const out = strip.cells.map((c2) => ({ box: c2.box, ch: "" }));
  if (!keep.length) return out;
  if (keep.length === strip.cells.length) {
    keep.forEach((c2, i22) => out[i22].ch = c2.ch);
    return out;
  }
  const n2 = keep.length;
  const m2 = strip.cells.length;
  const center = strip.cells.map((c2) => (c2.x0 + c2.x1) / 2);
  const INF = 1e9;
  const f2 = Array.from({ length: n2 + 1 }, () => new Float64Array(m2 + 1).fill(INF));
  const from = Array.from({ length: n2 + 1 }, () => new Uint8Array(m2 + 1));
  f2[0][0] = 0;
  for (let j22 = 1; j22 <= m2; j22++) {
    f2[0][j22] = 0;
    from[0][j22] = 1;
  }
  for (let i22 = 1; i22 <= n2; i22++)
    for (let j22 = 0; j22 <= m2; j22++) {
      let best = f2[i22 - 1][j22] + DROP_COST;
      let how = 2;
      if (j22 > 0) {
        const skip = f2[i22][j22 - 1];
        if (skip < best) {
          best = skip;
          how = 1;
        }
        const put = f2[i22 - 1][j22 - 1] + Math.abs(keep[i22 - 1].xFrac - center[j22 - 1]);
        if (put < best) {
          best = put;
          how = 3;
        }
      }
      f2[i22][j22] = best;
      from[i22][j22] = how;
    }
  let i2 = n2;
  let j2 = m2;
  while (i2 > 0 || j2 > 0) {
    const how = from[i2][j2];
    if (how === 3) {
      out[j2 - 1].ch = keep[i2 - 1].ch;
      i2--;
      j2--;
    } else if (how === 1) j2--;
    else if (how === 2) i2--;
    else break;
  }
  return out;
}
const LATIN_FRAC = 0.9;
const LATIN_MIN = 20;
const LATIN_MIN_CHAINED = 8;
const LATIN_MIN_HYPHEN = 1;
const LATIN_CH = /[A-Za-z'\u2019\-\u2013\u2014,.;:!?]/;
const SPACE_GAP = 0.7;
function isLatinRow(chars, needHyphen = true, minLatin = LATIN_MIN) {
  let latin = 0;
  let cjk = 0;
  for (const c2 of chars) {
    if (/[A-Za-z]/.test(c2.ch)) latin++;
    else if (/[\u4e00-\u9fff]/.test(c2.ch)) cjk++;
  }
  const hyphens = chars.filter((c2) => /[-\u2013\u2014]/.test(c2.ch)).length;
  return latin >= minLatin && (!needHyphen || hyphens >= LATIN_MIN_HYPHEN) && latin / (latin + cjk) >= LATIN_FRAC;
}
const MIX_LATIN_MIN = 5;
const MIX_LATIN_LONG = 12;
function splitMixedChars(chars) {
  const sorted = [...chars].sort((a, b) => a.xFrac - b.xFrac);
  const runs = [];
  for (const c2 of sorted) {
    const kind = /[A-Za-z]/.test(c2.ch) ? true : /[\u3400-\u9fff]/.test(c2.ch) ? false : null;
    const last = runs[runs.length - 1];
    if (last && (kind === null || kind === last.latin)) last.chars.push(c2);
    else runs.push({ latin: kind ?? false, chars: [c2] });
  }
  const good = (r4) => {
    if (!r4.latin) return false;
    const letters = r4.chars.filter((c2) => /[A-Za-z]/.test(c2.ch)).length;
    return letters >= MIX_LATIN_MIN && (letters >= MIX_LATIN_LONG || r4.chars.some((c2) => /[-\u2013\u2014]/.test(c2.ch)));
  };
  const la = runs.filter(good);
  const zh = runs.filter((r4) => !good(r4)).flatMap((r4) => r4.chars);
  if (!la.length || zh.filter((c2) => /[\u3400-\u9fff]/.test(c2.ch)).length < 2) return null;
  return {
    zh,
    la: la.flatMap((r4) => r4.chars),
    spans: la.map((r4) => [r4.chars[0].xFrac, r4.chars[r4.chars.length - 1].xFrac])
  };
}
function stripWithout(strip, spans) {
  const pad = strip.charH / Math.max(1, strip.w);
  return { ...strip, cells: strip.cells.filter((c2) => !spans.some(([a, b]) => (c2.x0 + c2.x1) / 2 >= a - pad && (c2.x0 + c2.x1) / 2 <= b + pad)) };
}
function latinCells(strip, chars) {
  const keep = dropVerseNumber(chars).filter((c2) => LATIN_CH.test(c2.ch)).sort((a, b) => a.xFrac - b.xFrac);
  if (!keep.length) return [];
  const col = new Int32Array(strip.w);
  for (let y = 0; y < strip.h; y++)
    for (let x = 0; x < strip.w; x++) if (strip.data[y * strip.w + x]) col[x]++;
  const minGap = Math.max(2, strip.charH * SPACE_GAP);
  const blanks = [];
  let run = 0;
  for (let x = 0; x <= strip.w; x++) {
    if (x < strip.w && !col[x]) {
      run++;
      continue;
    }
    if (run >= minGap) blanks.push([(x - run) / strip.w, x / strip.w]);
    run = 0;
  }
  const gaps = keep.slice(1).map((c2, i2) => c2.xFrac - keep[i2].xFrac).filter((g2) => g2 > 0).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[gaps.length >> 1] : 1 / Math.max(1, keep.length);
  const out = [];
  const hh = Math.min(strip.box.h, Math.max(1, strip.charH));
  const yy = strip.box.y + (strip.box.h - hh) / 2;
  const boxAt = (x0, x1, ch) => ({
    box: {
      x: strip.box.x + x0 * strip.box.w,
      y: yy,
      w: Math.max(1, (x1 - x0) * strip.box.w),
      h: hh
    },
    ch
  });
  keep.forEach((c2, i2) => {
    const next = keep[i2 + 1];
    const end = next ? Math.min(c2.xFrac + pitch, next.xFrac) : Math.min(1, c2.xFrac + pitch);
    out.push(boxAt(c2.xFrac, end, c2.ch));
    if (next && blanks.some((b) => (b[0] + b[1]) / 2 > c2.xFrac && (b[0] + b[1]) / 2 < next.xFrac)) out.push(boxAt(end, next.xFrac, " "));
  });
  return out;
}
const BAND_TOP$1 = 3;
const BAND_BOTTOM$1 = 0.15;
const LEFT_SKIP = 1.2;
const RIGHT_FRAC = 0.45;
function findStaffLabels(bin, staves, unit) {
  const sp = unit.space;
  const out = [];
  for (const st of staves) {
    const y0 = Math.max(0, Math.round(st.box.top - sp * BAND_TOP$1));
    const y1 = Math.max(0, Math.round(st.box.top - sp * BAND_BOTTOM$1));
    const x0 = Math.max(0, Math.round(st.box.left + sp * LEFT_SKIP));
    const x1 = Math.min(bin.w, Math.round(st.box.left + (st.box.right - st.box.left) * RIGHT_FRAC));
    if (y1 - y0 < 8 || x1 - x0 < 8) continue;
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const data = new Uint8Array(box.w * box.h);
    let ink = 0;
    for (let y = 0; y < box.h; y++)
      for (let x = 0; x < box.w; x++) {
        const v2 = bin.data[(box.y + y) * bin.w + box.x + x];
        data[y * box.w + x] = v2;
        ink += v2;
      }
    if (!ink) continue;
    out.push({ w: box.w, h: box.h, data, box, staff: st.index });
  }
  return out;
}
function labelKey(s) {
  let h1 = 2166136261;
  for (let i2 = 0; i2 < s.data.length; i2++) {
    h1 ^= s.data[i2];
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `L${s.w}x${s.h}-${h1.toString(36)}`;
}
function normalizeLabel(text) {
  const t2 = text.toLowerCase().replace(/[^a-z0-9一-鿿]/g, "");
  if (!t2) return null;
  const DIGITISH = { "1": "1", "2": "2", "3": "3", "4": "4", l: "1", i: "1", z: "2" };
  const last = t2.slice(-1);
  const num2 = DIGITISH[last] ?? "";
  const body = num2 ? t2.slice(0, -1) : t2;
  const CJK = [
    [/女高/, "S"],
    [/女低|中音/, "A"],
    [/男高/, "T"],
    [/男低/, "B"],
    [/女声/, "W"],
    [/男声/, "M"],
    [/齐唱|全体/, "U"],
    [/独唱|领唱/, "O"],
    [/钢琴|伴奏/, "P"]
  ];
  for (const [re, name] of CJK) if (re.test(body)) return name + num2;
  const LATIN = [
    ["soprano", "S"],
    ["alto", "A"],
    ["tenor", "T"],
    ["bass", "B"],
    ["baritone", "B"],
    ["women", "W"],
    ["men", "M"],
    ["unison", "U"],
    ["solo", "O"],
    ["piano", "P"],
    ["tutti", "U"]
  ];
  let best = null;
  let bd = Infinity;
  for (const [word, name] of LATIN) {
    const d2 = editDistance(body, word);
    if (d2 <= Math.floor(word.length * FUZZ) && d2 < bd) {
      bd = d2;
      best = name;
    }
  }
  return best === null ? null : best + num2;
}
const FUZZ = 0.3;
function editDistance(a, b) {
  const prev = new Int32Array(b.length + 1);
  const cur = new Int32Array(b.length + 1);
  for (let j2 = 0; j2 <= b.length; j2++) prev[j2] = j2;
  for (let i2 = 1; i2 <= a.length; i2++) {
    cur[0] = i2;
    for (let j2 = 1; j2 <= b.length; j2++)
      cur[j2] = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + (a[i2 - 1] === b[j2 - 1] ? 0 : 1));
    prev.set(cur);
  }
  return prev[b.length];
}
const PAD = 2;
function timeStripOf(bin, box, staff, role) {
  const x0 = Math.max(0, Math.round(box.x) - PAD);
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(bin.w, Math.round(box.x + box.w) + PAD);
  const y1 = Math.min(bin.h, Math.round(box.y + box.h));
  const w = Math.max(1, x1 - x0);
  const h2 = Math.max(1, y1 - y0);
  const data = new Uint8Array(w * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w; x++) data[y * w + x] = bin.data[(y0 + y) * bin.w + x0 + x] ? 1 : 0;
  return { w, h: h2, data, box: { x: x0, y: y0, w, h: h2 }, staff, role };
}
function timeKey(s) {
  let h1 = 2166136261;
  for (let i2 = 0; i2 < s.data.length; i2++) {
    h1 ^= s.data[i2];
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `T${s.w}x${s.h}-${h1.toString(36)}`;
}
const TIME_NUMERATORS = [2, 3, 4, 5, 6, 7, 8, 9, 12];
const TIME_DENOMINATORS = [2, 4, 8, 16];
function timeDigit(text, role) {
  if (!text || !/^\d{1,2}$/.test(text)) return null;
  const n2 = Number(text);
  return (role === "num" ? TIME_NUMERATORS : TIME_DENOMINATORS).includes(n2) ? n2 : null;
}
const BAND_TOP = 3.2;
const BAND_TOP_HIGH = 4.5;
const BAND_BOTTOM = 1;
const JP_BAND = 3;
const JP_BELOW = 0.6;
const CLUSTER_GAP = 0.75;
const MIN_W$2 = 0.25;
const MIN_INK = 8;
const LOW_CLEAR = 0.15;
const RUN_GAP = 0.15;
const GROW_UP = 1.5;
const GROW_BIG = 1;
function dropBelow(band, W, H2, yB) {
  const seen = new Uint8Array(W * H2);
  const comp = [];
  for (let i0 = 0; i0 < W * H2; i0++) {
    if (!band[i0] || seen[i0]) continue;
    comp.length = 0;
    let minY = H2;
    const stack = [i0];
    seen[i0] = 1;
    while (stack.length) {
      const i2 = stack.pop();
      comp.push(i2);
      const y = Math.floor(i2 / W);
      const x = i2 % W;
      if (y < minY) minY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= H2 || nx < 0 || nx >= W) continue;
          const j2 = ny * W + nx;
          if (!band[j2] || seen[j2]) continue;
          seen[j2] = 1;
          stack.push(j2);
        }
    }
    if (minY >= yB) for (const i2 of comp) band[i2] = 0;
  }
}
const RISER_DEPTH = 0.3;
function withoutRisers(bin, x0, x1, y0, y1, depth, seedFrom = -1) {
  const W = x1 - x0;
  const yEnd = Math.min(bin.h, y1 + depth);
  const H2 = yEnd - y0;
  const seen = new Uint8Array(W * H2);
  const out = new Uint8Array(W * (y1 - y0));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) out[(y - y0) * W + (x - x0)] = bin.data[y * bin.w + x];
  const stack = [];
  for (let y = seedFrom >= 0 ? seedFrom : yEnd - 1; y < yEnd; y++)
    for (let x = x0; x < x1; x++) {
      const i2 = (y - y0) * W + (x - x0);
      if (bin.data[y * bin.w + x] && !seen[i2]) {
        seen[i2] = 1;
        stack.push(i2);
      }
    }
  while (stack.length) {
    const i2 = stack.pop();
    const yy = Math.floor(i2 / W);
    const xx = i2 % W;
    if (yy < y1 - y0) out[i2] = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const ny = yy + dy;
        const nx = xx + dx;
        if (ny < 0 || ny >= H2 || nx < 0 || nx >= W) continue;
        const j2 = ny * W + nx;
        if (seen[j2] || !bin.data[(ny + y0) * bin.w + nx + x0]) continue;
        seen[j2] = 1;
        stack.push(j2);
      }
  }
  return out;
}
function findHarmonyStrips(bin, staves, unit) {
  const sp = unit.space;
  const out = [];
  for (const st of staves) {
    const jp = st.ceiling != null;
    const yTop = Math.max(0, Math.round(jp ? st.ceiling - sp * JP_BAND : st.box.top - sp * BAND_TOP));
    const yB = Math.max(0, Math.round(jp ? st.ceiling : st.box.top - sp * BAND_BOTTOM));
    const y1 = jp ? Math.min(bin.h, Math.round(yB + sp * JP_BELOW)) : Math.max(yB, Math.round(st.box.top - sp * LOW_CLEAR));
    const x0 = Math.max(0, Math.round(st.box.left));
    const x1 = Math.min(bin.w, Math.round(st.box.right));
    if (y1 - yTop < 4 || x1 - x0 < 8) continue;
    const cut = (y0) => {
      const strips = [];
      let grown = 0;
      let top = y0;
      const band = withoutRisers(bin, x0, x1, y0, y1, Math.ceil(sp * RISER_DEPTH), jp ? -1 : y1);
      if (!jp) dropBelow(band, x1 - x0, y1 - y0, yB - y0);
      const at = (x, y) => band[(y - y0) * (x1 - x0) + (x - x0)];
      const col = new Int32Array(x1 - x0);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) if (at(x, y)) col[x - x0]++;
      const gap = Math.max(2, Math.round(sp * CLUSTER_GAP));
      const runs = [];
      let s = -1;
      for (let i2 = 0; i2 <= col.length; i2++) {
        const ink = i2 < col.length && col[i2] > 0;
        if (ink && s < 0) s = i2;
        if (!ink && s >= 0) {
          const last = runs[runs.length - 1];
          if (last && s - last[1] - 1 < gap) last[1] = i2 - 1;
          else runs.push([s, i2 - 1]);
          s = -1;
        }
      }
      for (const [a, b] of runs) {
        if (b - a + 1 < sp * MIN_W$2) continue;
        let ya = y1;
        let yb = y0;
        let ink = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0 + a; x <= x0 + b; x++)
            if (at(x, y)) {
              ink++;
              if (y < ya) ya = y;
              if (y > yb) yb = y;
            }
        if (ink < MIN_INK || yb < ya) continue;
        const rowInk = (y) => {
          for (let x = x0 + a; x <= x0 + b; x++) if (y >= y0 ? at(x, y) : bin.data[y * bin.w + x]) return true;
          return false;
        };
        {
          const cut2 = Math.max(2, Math.round(sp * RUN_GAP));
          let blank = 0;
          for (let y = ya; y <= yb; y++) {
            if (rowInk(y)) blank = 0;
            else if (++blank >= cut2) {
              yb = y - blank;
              break;
            }
          }
          while (yb > ya && !rowInk(yb)) yb--;
          if (!jp && ya === y0) while (ya > 0 && ya > y0 - sp * GROW_UP && rowInk(ya - 1)) ya--;
          if (y0 - ya >= sp * GROW_BIG) {
            grown++;
            top = Math.min(top, ya);
          }
        }
        const box = { x: x0 + a, y: ya, w: b - a + 1, h: yb - ya + 1 };
        const data = new Uint8Array(box.w * box.h);
        for (let y = 0; y < box.h; y++)
          for (let x = 0; x < box.w; x++) {
            const py = box.y + y;
            data[y * box.w + x] = py >= y0 ? at(box.x + x, py) : bin.data[py * bin.w + box.x + x];
          }
        strips.push({ w: box.w, h: box.h, data, box, staff: st.index });
      }
      return { strips, grown, top };
    };
    let r4 = cut(yTop);
    if (!jp && r4.grown >= 2 && r4.grown * 2 >= r4.strips.length) r4 = cut(Math.max(0, r4.top));
    if (!jp && r4.strips.length < 3) {
      const r22 = cut(Math.max(0, Math.round(st.box.top - sp * BAND_TOP_HIGH)));
      if (r22.strips.length >= 3 && r22.strips.length >= r4.strips.length * 2) r4 = r22;
    }
    out.push(...r4.strips);
  }
  return out;
}
function harmonyKey(s) {
  let h1 = 2166136261;
  for (let i2 = 0; i2 < s.data.length; i2++) {
    h1 ^= s.data[i2];
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `H${s.w}x${s.h}-${h1.toString(36)}`;
}
function normalizeChordText(s) {
  return s.replace(/[\s·・,.]/g, "").replace(/[♯＃]/g, "#").replace(/[♭]/g, "b").replace(/[／∕丨|]/g, "/").replace(/[（）()]/g, "").replace(/[卜ト下尸]/g, "F");
}
const fixTail = (s) => s.replace(/(?<=[A-G][#b]?)[iíjl]$/, "7");
const HAN = new RegExp("\\p{Script=Han}", "u");
function readHarmonyStrip(strip, chars) {
  const chords = [];
  const texts = [];
  const px = (frac) => strip.box.x + frac * strip.box.w;
  const boxOf2 = (f0, f1) => {
    const x0 = px(f0);
    const x1 = px(f1);
    return { x: Math.min(x0, x1), y: strip.box.y, w: Math.max(1, Math.abs(x1 - x0)), h: strip.box.h };
  };
  const textOf = (a, b) => chars.slice(a, b + 1).map((c2) => c2.ch).join("").trim();
  const orig = chars.map((c2) => c2.ch.length === 1 ? c2.ch : c2.ch[0] ?? " ").join("");
  const blanked = blankNonChord(orig);
  const isWord = chars.map((c2, k2) => blanked[k2] === " " && c2.ch.trim() !== "");
  for (let k2 = 0; k2 < chars.length; ) {
    if (!isWord[k2]) {
      k2++;
      continue;
    }
    let e = k2;
    while (e + 1 < chars.length && (isWord[e + 1] || chars[e + 1].ch.trim() === "" && isWord[e + 2])) e++;
    texts.push({ text: textOf(k2, e), box: boxOf2(chars[k2].xFrac, chars[e].xFrac), staff: strip.staff, kind: "mark" });
    k2 = e + 1;
  }
  const kept = [];
  chars.forEach((c2, src) => {
    if (isWord[src]) {
      kept.push({ ch: " ", xFrac: c2.xFrac, src });
      return;
    }
    for (const ch of normalizeChordText(c2.ch)) kept.push({ ch, xFrac: c2.xFrac, src });
  });
  const raw = fixTail(kept.map((c2) => c2.ch).join(""));
  const letter = (i22) => i22 >= 0 && i22 < raw.length && /[A-Za-z]/.test(raw[i22]);
  let chordEnd = -1;
  let i2 = 0;
  while (i2 < raw.length) {
    const m2 = CHORD_TOKEN_RE.exec(raw.slice(i2));
    const len = m2?.[0].length ?? 0;
    const glued = /[a-z]/.test(raw[i2 - 1] ?? "") && chordEnd !== i2;
    if (len && !glued && !/[a-z]/.test(raw[i2 + len] ?? "")) {
      chords.push({ text: m2[0], box: boxOf2(kept[i2].xFrac, kept[i2 + len - 1].xFrac), staff: strip.staff });
      i2 += len;
      chordEnd = i2;
      continue;
    }
    if (HAN.test(raw[i2])) {
      let b = i2;
      while (b + 1 < raw.length && HAN.test(raw[b + 1])) b++;
      texts.push({ text: textOf(kept[i2].src, kept[b].src), box: boxOf2(kept[i2].xFrac, kept[b].xFrac), staff: strip.staff, kind: "word" });
      i2 = b + 1;
      continue;
    }
    if (letter(i2)) {
      let a = i2;
      while (letter(a - 1) && a - 1 >= chordEnd) a--;
      let b = i2;
      while (letter(b + 1)) b++;
      if (/[a-z]/.test(raw.slice(a, b + 1))) {
        texts.push({ text: textOf(kept[a].src, kept[b].src), box: boxOf2(kept[a].xFrac, kept[b].xFrac), staff: strip.staff, kind: "word" });
        i2 = b + 1;
        continue;
      }
    }
    i2++;
  }
  texts.sort((p2, q2) => p2.box.x - q2.box.x);
  return { chords, texts };
}
function harmonyLine(chords, texts) {
  const cc = chords.reduce((n2, t2) => n2 + t2.text.length, 0);
  const wc = texts.filter((t2) => t2.kind === "word").reduce((n2, t2) => n2 + (t2.text.match(new RegExp("[A-Za-z]|\\p{Script=Han}", "gu"))?.length ?? 0), 0);
  const isChordLine = chords.length >= 2 ? cc / (cc + wc) >= 0.85 : chords.length === 1 && wc === 0;
  if (isChordLine || !chords.length) return { chords, texts };
  const all = [...texts, ...chords.map((t2) => ({ ...t2, kind: "word" }))].sort((p2, q2) => p2.box.x - q2.box.x);
  return { chords: [], texts: all };
}
const EDGE_BAND = 7;
const LINE_CLEAR = 0.15;
const SIDE = 2;
function findWordStrips(bin, staves, unit) {
  const sp = unit.space;
  const rows = [...staves].sort((a, b) => a.box.top - b.box.top);
  const out = [];
  const cut = (y0, y1, left, right2) => {
    const box = {
      x: Math.max(0, Math.round(left - sp * SIDE)),
      y: Math.max(0, Math.round(y0)),
      w: 0,
      h: 0
    };
    box.w = Math.min(bin.w, Math.round(right2 + sp * SIDE)) - box.x;
    box.h = Math.min(bin.h, Math.round(y1)) - box.y;
    if (box.w < 8 || box.h < sp * 1.2) return;
    const data = new Uint8Array(box.w * box.h);
    let ink = 0;
    for (let y = 0; y < box.h; y++)
      for (let x = 0; x < box.w; x++) {
        const v2 = bin.data[(box.y + y) * bin.w + box.x + x];
        data[y * box.w + x] = v2;
        ink += v2;
      }
    if (ink) out.push({ w: box.w, h: box.h, data, box });
  };
  rows.forEach((st, i2) => {
    const prev = rows[i2 - 1];
    const above = prev && prev.box.bottom < st.box.top ? prev : void 0;
    if (above) cut(above.box.bottom + sp * LINE_CLEAR, st.box.top - sp * LINE_CLEAR, Math.min(above.box.left, st.box.left), Math.max(above.box.right, st.box.right));
    else cut(st.box.top - sp * EDGE_BAND, st.box.top - sp * LINE_CLEAR, st.box.left, st.box.right);
    if (i2 === rows.length - 1) cut(st.box.bottom + sp * LINE_CLEAR, st.box.bottom + sp * EDGE_BAND, st.box.left, st.box.right);
  });
  return out;
}
function wordKey(s) {
  let h1 = 2166136261;
  for (let i2 = 0; i2 < s.data.length; i2++) {
    h1 ^= s.data[i2];
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `W${s.w}x${s.h}-${h1.toString(36)}`;
}
function keepWordLine(text) {
  return /[A-Za-z]/.test(text) || METRO_RE.test(text);
}
function spaceWordText(text, chars, strip, box) {
  if (!chars?.length) return text;
  const y0 = Math.max(0, Math.round(box.y));
  const y1 = Math.min(strip.h, Math.round(box.y + box.h));
  const x0 = Math.max(0, Math.round(box.x));
  const x1 = Math.min(strip.w, Math.round(box.x + box.w));
  const gaps = [];
  let run = 0;
  let seenInk = false;
  for (let x = x0; x < x1; x++) {
    let ink = false;
    for (let y = y0; y < y1 && !ink; y++) ink = strip.data[y * strip.w + x] === 1;
    if (ink) {
      if (seenInk && run >= box.h * WORD_GAP) gaps.push(x - run / 2);
      run = 0;
      seenInk = true;
    } else run++;
  }
  let out = "";
  let g2 = 0;
  chars.forEach((c2, i2) => {
    let space = false;
    while (g2 < gaps.length && gaps[g2] < c2.cx + box.h * 0.1) {
      space = i2 > 0;
      g2++;
    }
    out += (space ? " " : "") + c2.text;
  });
  return out;
}
const WORD_GAP = 0.17;
const DYNAMIC_RE = /^(ppp|pp|p|mp|mf|fff|ff|f|sfz|sf|fz|fp)(?![a-z])/;
const DIRECTION_RE = /\b(rit|rall|riten|accel|tempo|cresc|decresc|dim|poco|molto|dolce|legato|unis|unison|solo|tutti|div|sim|sub|piu|meno|mosso|espress|cantabile|sost|marc|stacc|fine|coda|segno|slower|faster|broadly|d\. ?[sc])\b/i;
const LYRIC_ROW = 3;
const LYRIC_ROW_IN_ZONE = 2;
const CHORD_PAGE_MIN = 3;
const SHORT_RE = /^(S|A|T|B|SA|TB|ST|AB|Ch|Sw|Gt)\.?$/;
const STACK_X = 1.5;
const STACK_GAP = 0.6;
const METRO_RE = /=\s*(\d ?\d ?\d?)(?!\d)/;
const REACH$1 = 7;
function attachWordLines(pg, notes, strips, ocr, unit, skip, lyricZones) {
  const sp = unit.space;
  const words = [];
  const dynamics = [];
  const inside = (q2, x, y) => x >= q2.x && x <= q2.x + q2.w && y >= q2.y && y <= q2.y + q2.h;
  const lines = [];
  for (const strip of strips)
    for (const l2 of ocr.get(wordKey(strip)) ?? []) {
      const box = { x: strip.box.x + l2.x, y: strip.box.y + l2.y, w: l2.w, h: l2.h };
      const cx2 = box.x + box.w / 2;
      const cy2 = box.y + box.h / 2;
      if (lines.some((q2) => inside(q2.box, cx2, cy2))) continue;
      lines.push({ text: l2.t.replace(/\s+/g, " ").trim(), box });
    }
  lines.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  for (let i2 = 0; i2 < lines.length; i2++) {
    const a = lines[i2];
    const j2 = lines.findIndex((b2, k2) => k2 > i2 && Math.abs(b2.box.x - a.box.x) <= sp * STACK_X && b2.box.y - (a.box.y + a.box.h) <= a.box.h * STACK_GAP && b2.box.y > a.box.y + a.box.h * 0.5);
    if (j2 < 0) continue;
    const b = lines[j2];
    if (DYNAMIC_RE.test(a.text) || DYNAMIC_RE.test(b.text)) continue;
    const r4 = Math.max(a.box.x + a.box.w, b.box.x + b.box.w);
    a.text += "\n" + b.text;
    a.box = { x: Math.min(a.box.x, b.box.x), y: a.box.y, w: r4 - Math.min(a.box.x, b.box.x), h: b.box.y + b.box.h - a.box.y };
    lines.splice(j2, 1);
    i2--;
  }
  const chordOf = (text) => {
    const toks = text.split(/\s+/).filter(Boolean);
    const whole = text.replace(/\s+/g, "");
    const full = (t2) => (CHORD_TOKEN_RE.exec(t2)?.[0].length ?? 0) === t2.length;
    if (full(whole)) return [whole];
    return toks.length > 1 && toks.every(full) ? toks : null;
  };
  const chordLines = lines.filter((l2) => chordOf(l2.text));
  const chordPage = chordLines.length >= CHORD_PAGE_MIN && chordLines.some((l2) => l2.text.replace(/\s+/g, "").length > 1);
  const chords = [];
  for (const l2 of lines) {
    const box = l2.box;
    const cx2 = box.x + box.w / 2;
    const cy2 = box.y + box.h / 2;
    let text = l2.text;
    const dyn = DYNAMIC_RE.exec(text);
    const rest = dyn ? text.slice(dyn[0].length).trimStart() : "";
    if (dyn && (!rest || /^[\u4e00-\u9fff]/.test(rest))) {
      dynamics.push({ px: box.x + Math.min(box.w, box.h * 0.6 * dyn[0].length) / 2, py: cy2, text: dyn[0] });
      continue;
    }
    if (skip.some((q2) => inside(q2, cx2, cy2))) continue;
    if (chordPage) {
      const toks = text.split(/\s+/).filter(Boolean);
      const whole = chordOf(text);
      let n2 = whole ? toks.length : 0;
      const isChord = (t2) => t2.length > 1 && (CHORD_TOKEN_RE.exec(t2)?.[0].length ?? 0) === t2.length;
      if (!whole) while (n2 < toks.length - 1 && isChord(toks[n2])) n2++;
      if (n2 > 0) {
        const parts = whole ?? toks.slice(0, n2);
        const span = whole ? box.w : box.w * (toks.slice(0, n2).join(" ").length / text.length);
        parts.forEach((t2, i2) => chords.push({ text: t2, box: { x: box.x + span * i2 / parts.length, y: box.y, w: span / parts.length, h: box.h } }));
        if (whole) continue;
        text = toks.slice(n2).join(" ");
      }
    }
    const peers = lines.filter((o) => Math.abs(o.box.y + o.box.h / 2 - cy2) <= box.h * 0.6 && /[A-Za-z]{2}/.test(o.text)).length;
    const crowded = peers >= (lyricZones.some((q2) => inside(q2, cx2, cy2)) ? LYRIC_ROW_IN_ZONE : LYRIC_ROW);
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const term = DIRECTION_RE.exec(text);
    if (crowded && !term) continue;
    if (crowded && term) text = text.slice(term.index);
    text = text.replace(/^(?:[pmf]{1,3}|s?fz?)\s+(?=\S)/, "").replace(/\s+(?:[pmf]{1,3}|s?fz?)$/, "");
    const metro = METRO_RE.exec(text);
    if (metro) text = text.slice(0, metro.index).replace(/[\s(（♩J]+$/, "").trim();
    const letters = (text.match(/[A-Za-z]/g) ?? []).length;
    const isWord = !/[\u4e00-\u9fff]/.test(text) && (letters >= 3 || SHORT_RE.test(text)) && !/^[pmfsz]+$/i.test(text.replace(/[^A-Za-z]/g, ""));
    if (!isWord && !metro) continue;
    let stf;
    let bd = sp * REACH$1;
    let above = true;
    for (const st of pg.staves) {
      if (cx2 < st.box.left - sp * SIDE || cx2 > st.box.right + sp * SIDE) continue;
      const d2 = cy2 < st.box.top ? st.box.top - cy2 : cy2 > st.box.bottom ? cy2 - st.box.bottom : 0;
      if (d2 < bd) {
        bd = d2;
        stf = st;
        above = cy2 < (st.box.top + st.box.bottom) / 2;
      }
    }
    if (!stf) continue;
    const row = notes.filter((n2) => n2.staff === stf && !n2.chordExtra && !n2.grace).sort((a, b) => a.x - b.x);
    const note = row.find((n2) => n2.x >= box.x - sp) ?? row[row.length - 1];
    if (!note) continue;
    if (metro) note.metronome = `quarter=${metro[1].replace(/ /g, "")}`;
    if (isWord && text) {
      (note.words ??= []).push({ text, above });
      words.push({ text, above, box, note });
    }
  }
  return { words, dynamics, chords };
}
const BAR_LEN = [1.2, 4];
const BAR_CLEAR = 0.5;
const BAR_REACH = 6;
const BAR_DX = 0.6;
const MIN_MATCH = 2;
const MIN_MATCH_FRAC = 0.4;
const BAR_SIBLING = 0.75;
const PAD_TOP = 0.8;
const PAD_BOTTOM = 0.3;
function findJianpuBands(vSegs, staves, unit) {
  const sp = unit.space;
  const out = [];
  staves.forEach((st, k2) => {
    const h2 = st.bottom - st.top;
    const span = (v2) => [Math.min(v2.y0, v2.y1), Math.max(v2.y0, v2.y1)];
    const cx2 = (v2) => (v2.x0 + v2.x1) / 2;
    const staffBars = vSegs.filter((v2) => {
      const [a, b] = span(v2);
      return a <= st.top + sp * 0.5 && b >= st.bottom - sp * 0.5 && b - a <= h2 + sp * 1.5;
    }).map(cx2).filter((x) => x > st.left + sp * 2 && x < st.right + sp);
    const cands = vSegs.filter((v2) => {
      const [a, b] = span(v2);
      const len = (b - a) / sp;
      return len >= BAR_LEN[0] && len <= BAR_LEN[1] && b <= st.top - sp * BAR_CLEAR && b >= st.top - sp * BAR_REACH && cx2(v2) >= st.left - sp && cx2(v2) <= st.right + sp && // 压着别的谱行的是那一行自己的小节线（你的信实广大谱行只隔 5 格，上一行的小节线落进窗口）
      !staves.some((o) => o !== st && a < o.bottom && b > o.top);
    });
    const matched0 = cands.filter((v2) => staffBars.some((x) => Math.abs(cx2(v2) - x) <= sp * BAR_DX));
    const same = (p2, q2) => {
      const [a, b] = span(p2);
      const [c2, d2] = span(q2);
      return Math.min(b, d2) - Math.max(a, c2) > Math.min(b - a, d2 - c2) * 0.5;
    };
    const deg = matched0.map((v2) => matched0.filter((o) => same(v2, o)).length);
    const hub = matched0[deg.indexOf(Math.max(...deg))];
    const matched = hub ? matched0.filter((v2) => same(v2, hub)) : [];
    if (matched.length < MIN_MATCH || matched.length < staffBars.length * MIN_MATCH_FRAC) return;
    const ys = matched.map(span);
    const top = Math.min(...ys.map((s) => s[0]));
    const bot = Math.max(...ys.map((s) => s[1]));
    const minLen = Math.min(...ys.map((s) => s[1] - s[0])) * BAR_SIBLING;
    const bars = cands.filter((v2) => {
      const [a, b] = span(v2);
      return a <= bot && b >= top && b - a >= minLen;
    }).map(cx2).sort((a, b) => a - b);
    const y0 = Math.round(top - sp * PAD_TOP);
    const y1 = Math.min(Math.round(bot + sp * PAD_BOTTOM), Math.round(st.top - sp * 0.2));
    out.push({ staff: k2, box: { x: Math.round(st.left - sp), y: y0, w: Math.round(st.right - st.left + sp * 2), h: y1 - y0 }, bars });
  });
  return out;
}
const BAR_COVER = 0.6;
const BAR_OVERSHOOT = 0.3;
function completeStaffBars(vSegs, staves, bands, unit) {
  const sp = unit.space;
  let n2 = 0;
  for (const b of bands) {
    const st = staves[b.staff];
    const h2 = st.bottom - st.top;
    for (const x of b.bars) {
      const near = vSegs.filter((v2) => {
        const a = Math.min(v2.y0, v2.y1);
        const e = Math.max(v2.y0, v2.y1);
        return Math.abs((v2.x0 + v2.x1) / 2 - x) <= sp * BAR_DX && a >= st.top - sp * BAR_OVERSHOOT && e <= st.bottom + sp * BAR_OVERSHOOT;
      });
      if (!near.length) continue;
      const cx2 = (v2) => (v2.x0 + v2.x1) / 2;
      const best = Math.min(...near.map((v2) => Math.abs(cx2(v2) - x)));
      const col = near.filter((v2) => Math.abs(cx2(v2) - x) <= best + Math.max(2, v2.lw));
      const top = Math.min(...col.map((v2) => Math.min(v2.y0, v2.y1)));
      const bot = Math.max(...col.map((v2) => Math.max(v2.y0, v2.y1)));
      if (top <= st.top + sp * 0.25 && bot >= st.bottom - sp * 0.25) continue;
      const ys = col.map((v2) => [Math.max(st.top, Math.min(v2.y0, v2.y1)), Math.min(st.bottom, Math.max(v2.y0, v2.y1))]).sort((p2, q2) => p2[0] - q2[0]);
      let cover = 0;
      let reach = -Infinity;
      for (const [a, e] of ys) {
        if (e <= reach) continue;
        cover += e - Math.max(a, reach);
        reach = e;
      }
      if (cover < h2 * BAR_COVER) continue;
      const lw = col.reduce((s, v2) => s + v2.lw, 0) / col.length;
      const mx = col.reduce((s, v2) => s + cx2(v2), 0) / col.length;
      for (const v2 of col) vSegs.splice(vSegs.indexOf(v2), 1);
      vSegs.push({ x0: mx, y0: st.top, x1: mx, y1: st.bottom, lw, maxLw: Math.max(...col.map((v2) => v2.maxLw)) });
      n2++;
    }
  }
  return n2;
}
function eraseInBand(imgs, band) {
  const bin = imgs[0];
  const x0 = Math.max(0, band.x);
  const y0 = Math.max(0, band.y);
  const x1 = Math.min(bin.w, band.x + band.w);
  const y1 = Math.min(bin.h, band.y + band.h);
  const W = x1 - x0;
  const seen = new Uint8Array(W * (y1 - y0));
  let erased = 0;
  const comp = [];
  const stack = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i0 = (y - y0) * W + (x - x0);
      if (seen[i0] || !bin.data[y * bin.w + x]) continue;
      comp.length = 0;
      let out = false;
      seen[i0] = 1;
      stack.push(y * bin.w + x);
      while (stack.length) {
        const p2 = stack.pop();
        const py = Math.floor(p2 / bin.w);
        const px = p2 % bin.w;
        comp.push(p2);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const ny = py + dy;
            const nx = px + dx;
            if (ny < 0 || ny >= bin.h || nx < 0 || nx >= bin.w || !bin.data[ny * bin.w + nx]) continue;
            if (ny < y0 || ny >= y1 || nx < x0 || nx >= x1) {
              out = true;
              continue;
            }
            const j2 = (ny - y0) * W + (nx - x0);
            if (seen[j2]) continue;
            seen[j2] = 1;
            stack.push(ny * bin.w + nx);
          }
      }
      if (out) continue;
      for (const p2 of comp) for (const im of imgs) im.data[p2] = 0;
      erased += comp.length;
    }
  return erased;
}
const CUT_SLIVER = 0.15;
function cutJianpuStrip(bin, band) {
  const { x, y, w, h: h2 } = band.box;
  const data = new Uint8Array(w * h2);
  for (let yy = 0; yy < h2; yy++)
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      const sy = y + yy;
      if (sx >= 0 && sy >= 0 && sx < bin.w && sy < bin.h) data[yy * w + xx] = bin.data[sy * bin.w + sx];
    }
  const seen = new Uint8Array(w * h2);
  for (let x0 = 0; x0 < w; x0++) {
    const sx = x + x0;
    if (!data[x0] || seen[x0] || y <= 0 || sx < 0 || sx >= bin.w || !bin.data[(y - 1) * bin.w + sx]) continue;
    const comp = [x0];
    seen[x0] = 1;
    let maxY = 0;
    for (let k2 = 0; k2 < comp.length; k2++) {
      const xx = comp[k2] % w;
      const yy = comp[k2] / w | 0;
      maxY = Math.max(maxY, yy);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = xx + dx;
          const ny = yy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h2 || !data[ny * w + nx] || seen[ny * w + nx]) continue;
          seen[ny * w + nx] = 1;
          comp.push(ny * w + nx);
        }
    }
    if (maxY < h2 * CUT_SLIVER) for (const i2 of comp) data[i2] = 0;
  }
  return { staff: band.staff, box: band.box, w, h: h2, data, bars: band.bars };
}
function jianpuKey(s) {
  let h1 = 2166136261;
  for (let i2 = 0; i2 < s.data.length; i2++) {
    h1 ^= s.data[i2];
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `J${s.w}x${s.h}-${h1.toString(36)}`;
}
const PAIR_DX = 0.8;
const POLY_FRAC = 0.5;
const STEP_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SHARPS = "FCGDAEB";
const FLATS = "BEADGCF";
const tonicOf = (fifths) => (fifths * 4 % 7 + 7) % 7;
const keyAlter = (step, fifths) => fifths > 0 ? SHARPS.slice(0, fifths).includes(step) ? 1 : 0 : fifths < 0 ? FLATS.slice(0, -fifths).includes(step) ? -1 : 0 : 0;
const qOf = (n2) => {
  let q2 = 1 / 2 ** n2.div;
  let add = q2 / 2;
  for (let i2 = 0; i2 < n2.dot; i2++, add /= 2) q2 += add;
  return q2 + n2.aug;
};
function baseDots(q2) {
  for (const base of [1, 0.5, 0.25, 0.125, 0.0625])
    for (let dots = 0; dots <= 2; dots++) {
      let d2 = base;
      for (let i2 = 0, add = base / 2; i2 < dots; i2++, add /= 2) d2 += add;
      if (Math.abs(d2 * 4 - q2) < 1e-6) return { base, dots };
    }
  return null;
}
function adopt(to, from) {
  for (const l2 of from.lyrics ?? []) {
    if (to.lyrics?.some((m2) => m2.verse === l2.verse)) continue;
    (to.lyrics ??= []).push(l2);
  }
  if (!to.chord && from.chord) to.chord = from.chord;
}
const mode = (xs) => {
  const m2 = /* @__PURE__ */ new Map();
  for (const x of xs) m2.set(x, (m2.get(x) ?? 0) + 1);
  let best = NaN;
  let bn = 0;
  for (const [k2, v2] of m2) if (v2 > bn) best = k2, bn = v2;
  return best;
};
function fuseJianpu(notes, strips, staffOf, rowsOf, fifthsOf, unit) {
  const stats = { pairs: 0, pitch: 0, duration: 0, removed: 0, inserted: 0 };
  const sp = unit.space;
  const cx2 = (n2) => (n2.sym.box.left + n2.sym.box.right) / 2;
  const shift = (() => {
    const ds = [];
    for (const strip of strips) {
      const st = staffOf(strip);
      const row = rowsOf(strip)?.[0];
      if (!st || !row) continue;
      const xs = notes.filter((n2) => n2.staff === st).map(cx2);
      for (const j2 of row.nums) {
        const jx = strip.box.x + j2.x;
        let best = Infinity;
        for (const x of xs) if (Math.abs(x - jx) < Math.abs(best)) best = x - jx;
        if (Math.abs(best) <= sp * 1.5) ds.push(best);
      }
    }
    ds.sort((a, b) => a - b);
    return ds.length ? ds[ds.length >> 1] : 0;
  })();
  const all = [];
  const votes = [];
  for (const strip of strips) {
    const st = staffOf(strip);
    const rows = rowsOf(strip);
    if (!st || !rows?.length) continue;
    const row = rows.reduce((a, r4) => r4.nums.length > a.nums.length ? r4 : a);
    const fifths = fifthsOf(st);
    const tonic = tonicOf(fifths);
    const bars = [];
    for (const b of [...row.bars].sort((a, c2) => a - c2).map((b2) => strip.box.x + b2))
      if (!bars.length || b - bars[bars.length - 1] > sp * 0.5) bars.push(b);
    const edges = [-Infinity, ...bars, Infinity];
    const sameCol = (n2, o) => o !== n2 && (!!n2.group && o.group === n2.group || Math.abs(cx2(o) - cx2(n2)) < sp * 0.3);
    const voiced = notes.filter((n2) => n2.staff === st && !n2.rest && !n2.grace);
    const poly = voiced.filter((n2) => voiced.some((o) => sameCol(n2, o))).length > voiced.length * POLY_FRAC;
    const staffNotes = poly ? notes.filter((n2) => n2.staff === st && !n2.grace && (n2.rest ? !voiced.some((o) => Math.abs(cx2(o) - cx2(n2)) < sp * 0.3) : !voiced.some((o) => sameCol(n2, o) && o.diatonic > n2.diatonic))) : notes.filter((n2) => n2.staff === st && !n2.chordExtra && !n2.grace && n2.voice === 1);
    const meas = [];
    for (let i2 = 0; i2 + 1 < edges.length; i2++) {
      const [a, b] = [edges[i2], edges[i2 + 1]];
      const jn = row.nums.map((n2) => ({ n: n2, x: strip.box.x + n2.x, q: qOf(n2) })).filter((j2) => j2.x > a && j2.x < b);
      const sn = staffNotes.filter((n2) => cx2(n2) > a && cx2(n2) < b);
      if (!jn.length && !sn.length) continue;
      const cand = [];
      jn.forEach((j2, ji) => sn.forEach((n2, si) => {
        const dx = Math.abs(cx2(n2) - shift - j2.x);
        if (dx <= sp * PAIR_DX) cand.push([dx, ji, si]);
      }));
      cand.sort((p2, q2) => p2[0] - q2[0]);
      const usedJ = /* @__PURE__ */ new Set();
      const usedS = /* @__PURE__ */ new Set();
      const pairs = [];
      for (const [, ji, si] of cand) {
        if (usedJ.has(ji) || usedS.has(si)) continue;
        usedJ.add(ji);
        usedS.add(si);
        pairs.push([jn[ji].n, sn[si]]);
        const j2 = jn[ji].n;
        if (j2.d >= 1 && j2.d <= 7 && !sn[si].rest) votes.push(sn[si].diatonic - (tonic + j2.d - 1 + 7 * j2.oct));
      }
      meas.push({ jn, sn, pairs });
    }
    all.push({ st, fifths, meas, poly });
  }
  if (!all.length) return stats;
  const base = mode(votes);
  const qSums = all.flatMap((r4) => r4.meas.map((m2) => m2.jn.reduce((s, j2) => s + j2.q, 0)));
  const full = mode(qSums.filter((q2) => q2 > 0));
  for (const { fifths, meas, poly } of all) {
    const tonic = tonicOf(fifths);
    for (const m2 of meas) {
      const jSum = m2.jn.reduce((s, j2) => s + j2.q, 0);
      if (Math.abs(jSum - full) > 1e-6) continue;
      const sSum = () => m2.sn.reduce((s, n2) => s + n2.duration * 4, 0);
      const staffOk = Math.abs(sSum() - full) < 1e-6;
      for (const [j2, n2] of m2.pairs) {
        stats.pairs++;
        if (!n2.rest && j2.d >= 1 && j2.d <= 7 && Number.isFinite(base)) {
          const dia = base + tonic + j2.d - 1 + 7 * j2.oct;
          if (dia !== n2.diatonic && (!poly || Math.abs(dia - n2.diatonic) === 1)) {
            const s = (dia % 7 + 7) % 7;
            const step = STEP_LETTERS[s];
            const keep = step === n2.step;
            n2.diatonic = dia;
            n2.step = step;
            n2.octave = Math.floor(dia / 7) - 1;
            if (!keep) {
              n2.alter = keyAlter(step, fifths);
              n2.accidental = null;
            }
            stats.pitch++;
          }
        }
        if (!poly && !staffOk && !n2.rest && j2.d !== 0) {
          const bd = baseDots(qOf(j2));
          if (bd && Math.abs(bd.base * (2 - 1 / 2 ** bd.dots) - n2.duration) > 1e-6) {
            n2.base = bd.base;
            n2.dots = bd.dots;
            n2.duration = bd.base * (2 - 1 / 2 ** bd.dots);
            stats.duration++;
          }
        }
      }
      if (poly) continue;
      for (const [, p2] of m2.pairs) {
        for (let i2 = notes.length - 1; i2 >= 0; i2--) {
          const n2 = notes[i2];
          if (n2 === p2 || n2.staff !== p2.staff || n2.rest || n2.grace) continue;
          if (p2.group && n2.group === p2.group || Math.abs(cx2(n2) - cx2(p2)) < sp * 0.3) {
            adopt(p2, n2);
            notes.splice(i2, 1);
            stats.removed++;
          }
        }
        if (p2.chordExtra) p2.chordExtra = void 0;
      }
      if (sSum() > full + 1e-6) {
        const paired2 = new Set(m2.pairs.map((p2) => p2[1]));
        const extra = m2.sn.filter((n2) => !paired2.has(n2));
        const drop = extra.reduce((s, n2) => s + n2.duration * 4, 0);
        if (extra.length && Math.abs(sSum() - drop - full) < 1e-6) {
          for (const n2 of extra) {
            const keep = m2.sn.filter((o) => !extra.includes(o) && !o.rest);
            if (keep.length) adopt(keep.reduce((a, o) => Math.abs(cx2(o) - cx2(n2)) < Math.abs(cx2(a) - cx2(n2)) ? o : a), n2);
            const i2 = notes.indexOf(n2);
            if (i2 >= 0) notes.splice(i2, 1);
            stats.removed++;
          }
        }
      }
      const paired = new Set(m2.pairs.map((p2) => p2[0]));
      const miss = m2.jn.filter((j2) => !paired.has(j2.n) && j2.n.d >= 1 && j2.n.d <= 7);
      const gap = full - sSum();
      if (miss.length && gap > 1e-6 && Math.abs(miss.reduce((a, j2) => a + j2.q, 0) - gap) < 1e-6 && Number.isFinite(base) && m2.pairs.length) {
        for (const j2 of miss) {
          const tpl = m2.pairs.map((p2) => p2[1]).reduce((a, n22) => Math.abs(cx2(n22) - shift - j2.x) < Math.abs(cx2(a) - shift - j2.x) ? n22 : a);
          const bd = baseDots(j2.q);
          if (!bd) continue;
          const dia = base + tonic + j2.n.d - 1 + 7 * j2.n.oct;
          const step = STEP_LETTERS[(dia % 7 + 7) % 7];
          const x = j2.x + shift;
          const n2 = {
            ...tpl,
            rest: false,
            diatonic: dia,
            step,
            octave: Math.floor(dia / 7) - 1,
            alter: keyAlter(step, fifths),
            accidental: null,
            base: bd.base,
            dots: bd.dots,
            duration: bd.base * (2 - 1 / 2 ** bd.dots),
            x: x - (cx2(tpl) - tpl.x),
            chordExtra: void 0,
            group: void 0,
            lyrics: void 0,
            chord: void 0,
            slurStart: void 0,
            slurStop: void 0,
            tieStart: void 0,
            tieStop: void 0,
            marks: void 0
          };
          if (tpl.group) tpl.group = void 0;
          const at = notes.findIndex((o) => o.staff === tpl.staff && o.x > n2.x);
          notes.splice(at < 0 ? notes.length : at, 0, n2);
          m2.sn.push(n2);
          stats.inserted++;
        }
      }
    }
  }
  return stats;
}
function traceContours(bin, unit, staves = []) {
  const { w, h: h2, data } = bin;
  let ink = 0;
  for (let i2 = 0; i2 < data.length; i2++) if (data[i2]) ink++;
  const labels = new Int32Array(w * h2);
  const comps2 = connectedComponents(bin, 4, labels);
  const contours = comps2.map((c2) => describe(bin, labels, c2, unit, staves));
  const byId = new Map(contours.map((c2) => [c2.id, c2]));
  return { contours, labels, w, h: h2, ink, byId };
}
function describe(bin, labels, c2, unit, staves) {
  const b = c2.bbox;
  const { holes, holeFill } = countHoles(labels, bin.w, c2);
  const perim = countPerim(labels, bin.w, bin.h, c2);
  return {
    id: c2.id,
    bbox: b,
    area: c2.area,
    cx: c2.cx,
    cy: c2.cy,
    w: b.w / unit.space,
    h: b.h / unit.space,
    fill: c2.area / Math.max(1, b.w * b.h),
    holes,
    holeFill,
    perim,
    compact: perim > 0 ? 4 * Math.PI * c2.area / (perim * perim) : 0,
    place: placeOf(c2, staves, unit)
  };
}
function countHoles(labels, w, c2) {
  const b = c2.bbox;
  const bw = b.w + 2;
  const bh = b.h + 2;
  const seen = new Uint8Array(bw * bh);
  const isInk = (x, y) => {
    const gx = b.x + x - 1;
    const gy = b.y + y - 1;
    if (x <= 0 || y <= 0 || x >= bw - 1 || y >= bh - 1) return false;
    return labels[gy * w + gx] === c2.id;
  };
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const cur = stack.pop();
    const y = cur / bw | 0;
    const x = cur - y * bw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const ni = ny * bw + nx;
      if (seen[ni] || isInk(nx, ny)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  let holes = 0;
  let biggest = 0;
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const i2 = y * bw + x;
      if (seen[i2] || isInk(x, y)) continue;
      let size = 0;
      const st = [i2];
      seen[i2] = 1;
      while (st.length) {
        const cur = st.pop();
        size++;
        const cy2 = cur / bw | 0;
        const cx2 = cur - cy2 * bw;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx2 + dx;
          const ny = cy2 + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const ni = ny * bw + nx;
          if (seen[ni] || isInk(nx, ny)) continue;
          seen[ni] = 1;
          st.push(ni);
        }
      }
      if (size < 3) continue;
      holes++;
      if (size > biggest) biggest = size;
    }
  return { holes, holeFill: biggest / Math.max(1, b.w * b.h) };
}
function countPerim(labels, w, h2, c2) {
  const b = c2.bbox;
  let n2 = 0;
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (labels[y * w + x] !== c2.id) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h2 || labels[ny * w + nx] !== c2.id) {
            edge = true;
            break;
          }
        }
      if (edge) n2++;
    }
  return n2;
}
function placeOf(c2, staves, unit) {
  if (!staves.length) return { staff: -1, zone: "below", gap: 0 };
  let best = 0;
  let bd = Infinity;
  for (let i2 = 0; i2 < staves.length; i2++) {
    const st2 = staves[i2];
    const d2 = c2.cy < st2.top ? st2.top - c2.cy : c2.cy > st2.bottom ? c2.cy - st2.bottom : 0;
    if (d2 < bd) {
      bd = d2;
      best = i2;
    }
  }
  const st = staves[best];
  const zone = c2.cy < st.top ? "above" : c2.cy > st.bottom ? "below" : "in";
  return { staff: best, zone, gap: bd / unit.space };
}
function findHoles(bin, minArea = 4) {
  const { w, h: h2, data } = bin;
  const seen = new Uint8Array(w * h2);
  const stack = [];
  const push = (i2) => {
    if (!seen[i2] && !data[i2]) {
      seen[i2] = 1;
      stack.push(i2);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h2 - 1) * w + x);
  }
  for (let y = 0; y < h2; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const cur = stack.pop();
    const y = cur / w | 0;
    const x = cur - y * w;
    if (x > 0) push(cur - 1);
    if (x + 1 < w) push(cur + 1);
    if (y > 0) push(cur - w);
    if (y + 1 < h2) push(cur + w);
  }
  const out = [];
  for (let y0 = 0; y0 < h2; y0++)
    for (let x0 = 0; x0 < w; x0++) {
      const i2 = y0 * w + x0;
      if (seen[i2] || data[i2]) continue;
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      let area = 0;
      stack.length = 0;
      seen[i2] = 1;
      stack.push(i2);
      while (stack.length) {
        const cur = stack.pop();
        const y = cur / w | 0;
        const x = cur - y * w;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0) push(cur - 1);
        if (x + 1 < w) push(cur + 1);
        if (y > 0) push(cur - w);
        if (y + 1 < h2) push(cur + w);
      }
      if (area >= minArea) out.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  return out;
}
const MIN_PIX = 4;
const MIN_SHARE = 0.2;
class ContourLedger {
  map;
  book = /* @__PURE__ */ new Map();
  constructor(map2) {
    this.map = map2;
  }
  /** 记一笔：盒里的墨属于谁。返回被认领的 contour id。 */
  claim(box, by) {
    const { labels, w, h: h2 } = this.map;
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(w - 1, Math.ceil(box.x + box.w));
    const y1 = Math.min(h2 - 1, Math.ceil(box.y + box.h));
    const hit = /* @__PURE__ */ new Map();
    let ink = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const id = labels[y * w + x];
        if (!id) continue;
        ink++;
        hit.set(id, (hit.get(id) ?? 0) + 1);
      }
    const out = [];
    for (const [id, n2] of hit) {
      const c2 = this.map.byId.get(id);
      if (!c2 || n2 < MIN_PIX) continue;
      if (n2 < ink * MIN_SHARE && n2 < c2.area * MIN_SHARE) continue;
      const a = this.book.get(id) ?? [];
      a.push({ by, box });
      this.book.set(id, a);
      out.push(id);
    }
    return out;
  }
  /** 一条线段（横段/竖段/符杠）的认领：按它的包围盒记。 */
  claimSeg(s, by) {
    const pad = s.maxLw / 2 + 1;
    const x = Math.min(s.x0, s.x1) - pad;
    const y = Math.min(s.y0, s.y1) - pad;
    this.claim({ x, y, w: Math.max(s.x0, s.x1) + pad - x, h: Math.max(s.y0, s.y1) + pad - y }, by);
  }
  /** 这团墨的认领记录。 */
  claimsOf(id) {
    return this.book.get(id) ?? [];
  }
  /** 没有任何一笔的 contour。 */
  unclaimed() {
    return this.map.contours.filter((c2) => !this.book.has(c2.id));
  }
  /**
   * 墨覆盖率。
   *
   * **口径**：认领过的 contour 的**全部**像素都算「已解释」——符头的盒只盖住
   * 「符头+符干+符杠」那一团的一小截，但那一团确实是解释得了的东西。
   * 所以这个数偏乐观，它量的是「还剩多少团墨完全没人看过」，
   * 不是「像素级的解释率」。两个数一起看：`ratio` 与 `unclaimedCount`。
   */
  coverage() {
    let claimed = 0;
    for (const c2 of this.map.contours) if (this.book.has(c2.id)) claimed += c2.area;
    return {
      ink: this.map.ink,
      claimed,
      ratio: this.map.ink ? claimed / this.map.ink : 0,
      total: this.map.contours.length,
      unclaimedCount: this.map.contours.length - this.book.size
    };
  }
}
const MIN_W$1 = 1.8;
const MAX_H$1 = 3;
const MIN_H = 0.35;
const MAX_COMPACT$1 = 0.2;
const OPEN_MIN = 0.45;
const TIP_MAX = 0.5;
const TWO_RUN_FRAC = 0.25;
const ARM_MIN_W = 1.5;
const ARM_MAX_H = 1.6;
const ONE_RUN_FRAC$1 = 0.85;
const STRAIGHT_TOL = 0.18;
const SLOPE_MIN = 0.03;
const SLOPE_MAX = 0.6;
const OVERLAP_MIN = 0.55;
const TIP_DX = 0.7;
const TIP_DY = 0.45;
const OPEN_DY = 0.55;
function findRasterWedges(map2, unit, only) {
  const pool = only ?? map2.contours;
  const out = [];
  const taken = /* @__PURE__ */ new Set();
  for (const c2 of pool) {
    if (c2.w < MIN_W$1 || c2.h > MAX_H$1 || c2.h < MIN_H) continue;
    if (c2.compact > MAX_COMPACT$1) continue;
    const w = judge(map2, c2, unit);
    if (w) {
      out.push(w);
      taken.add(c2.id);
    }
  }
  for (const w of pairArms(pool.filter((c2) => !taken.has(c2.id)), map2, unit)) out.push(w);
  return out;
}
function armOf(map2, c2, unit) {
  if (c2.w < ARM_MIN_W || c2.h > ARM_MAX_H) return null;
  if (c2.compact > MAX_COMPACT$1) return null;
  const b = c2.bbox;
  const ys = [];
  let one = 0;
  let cols = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    let sum = 0;
    let n2 = 0;
    let runs = 0;
    let prev = false;
    for (let y = b.y; y < b.y + b.h; y++) {
      const on = map2.labels[y * map2.w + x] === c2.id;
      if (on) {
        sum += y;
        n2++;
        if (!prev) runs++;
      }
      prev = on;
    }
    if (!n2) {
      ys.push(NaN);
      continue;
    }
    cols++;
    if (runs === 1) one++;
    ys.push(sum / n2);
  }
  if (!cols || one < cols * ONE_RUN_FRAC$1) return null;
  const q2 = Math.max(1, Math.round(ys.length / 4));
  const mean = (a) => {
    const v2 = a.filter((y) => !Number.isNaN(y));
    return v2.length ? v2.reduce((s, y) => s + y, 0) / v2.length : NaN;
  };
  const y0 = mean(ys.slice(0, q2));
  const y1 = mean(ys.slice(-q2));
  if (Number.isNaN(y0) || Number.isNaN(y1)) return null;
  const x0 = b.x;
  const x1 = b.x + b.w - 1;
  let far = 0;
  for (let i2 = 0; i2 < ys.length; i2++) {
    if (Number.isNaN(ys[i2])) continue;
    const t2 = ys.length > 1 ? i2 / (ys.length - 1) : 0;
    far = Math.max(far, Math.abs(ys[i2] - (y0 + (y1 - y0) * t2)));
  }
  if (far > unit.space * STRAIGHT_TOL) return null;
  const slope = (y1 - y0) / Math.max(1, x1 - x0);
  if (Math.abs(slope) < SLOPE_MIN || Math.abs(slope) > SLOPE_MAX) return null;
  return { c: c2, x0, y0, x1, y1, slope };
}
function pairArms(pool, map2, unit) {
  const sp = unit.space;
  const arms = pool.map((c2) => armOf(map2, c2, unit)).filter((a) => !!a);
  const used = /* @__PURE__ */ new Set();
  const out = [];
  for (let i2 = 0; i2 < arms.length; i2++) {
    if (used.has(arms[i2].c)) continue;
    for (let j2 = i2 + 1; j2 < arms.length; j2++) {
      if (used.has(arms[j2].c)) continue;
      const a = arms[i2];
      const b = arms[j2];
      if (a.slope * b.slope >= 0) continue;
      const lo = Math.max(a.x0, b.x0);
      const hi = Math.min(a.x1, b.x1);
      const shorter = Math.min(a.x1 - a.x0, b.x1 - b.x0);
      if (hi - lo < shorter * OVERLAP_MIN) continue;
      const dLeft = Math.abs(a.y0 - b.y0);
      const dRight = Math.abs(a.y1 - b.y1);
      const tipLeft = dLeft < dRight;
      const tipD = tipLeft ? dLeft : dRight;
      const openD = tipLeft ? dRight : dLeft;
      if (tipD > sp * TIP_DY || openD < sp * OPEN_DY) continue;
      if (Math.abs(tipLeft ? a.x0 - b.x0 : a.x1 - b.x1) > sp * TIP_DX) continue;
      used.add(a.c);
      used.add(b.c);
      out.push({
        type: tipLeft ? "crescendo" : "diminuendo",
        x0: Math.min(a.x0, b.x0),
        x1: Math.max(a.x1, b.x1),
        cy: (a.y0 + a.y1 + b.y0 + b.y1) / 4,
        contourId: a.c.id,
        pairedId: b.c.id
      });
      break;
    }
  }
  return out;
}
function judge(map2, c2, unit) {
  const b = c2.bbox;
  const spread = [];
  const runs = [];
  for (let x = b.x; x < b.x + b.w; x++) {
    let top = -1;
    let bot = -1;
    let n2 = 0;
    let prev = false;
    for (let y = b.y; y < b.y + b.h; y++) {
      const on = map2.labels[y * map2.w + x] === c2.id;
      if (on) {
        if (top < 0) top = y;
        bot = y;
        if (!prev) n2++;
      }
      prev = on;
    }
    if (top < 0) continue;
    spread.push(bot - top + 1);
    runs.push(n2);
  }
  if (spread.length < unit.space * 2) return null;
  const twoRun = runs.filter((n2) => n2 >= 2).length / runs.length;
  if (twoRun < TWO_RUN_FRAC) return null;
  const k2 = Math.max(1, Math.round(spread.length * 0.15));
  const med2 = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const left = med2(spread.slice(0, k2)) / unit.space;
  const right2 = med2(spread.slice(-k2)) / unit.space;
  const open = Math.max(left, right2);
  const tip = Math.min(left, right2);
  if (open < OPEN_MIN || tip > TIP_MAX || open < tip * 2) return null;
  return {
    type: right2 > left ? "crescendo" : "diminuendo",
    x0: b.x,
    x1: b.x + b.w - 1,
    cy: b.y + b.h / 2,
    contourId: c2.id
  };
}
function wedgeProfile(map2, c2, bin) {
  const b = c2.bbox;
  const spread = [];
  const runs = [];
  for (let x = b.x; x < b.x + b.w; x++) {
    let top = -1;
    let bot = -1;
    let n2 = 0;
    let prev = false;
    for (let y = b.y; y < b.y + b.h; y++) {
      const on = map2.labels[y * map2.w + x] === c2.id;
      if (on) {
        if (top < 0) top = y;
        bot = y;
        if (!prev) n2++;
      }
      prev = on;
    }
    if (top < 0) continue;
    spread.push(bot - top + 1);
    runs.push(n2);
  }
  return { spread, runs };
}
const GAP_MAX = 0.15;
const GAP_MIN = -0.8;
const CY_TOL = 0.4;
const SHORT_RATIO = [0.33, 0.62];
const TALL_RATIO = [0.85, 1.15];
function letterOf(w, h2, hr) {
  if (hr >= TALL_RATIO[0] && hr <= TALL_RATIO[1] && w >= 1.4 && w <= 2.8) return "f";
  if (hr >= SHORT_RATIO[0] && hr <= SHORT_RATIO[1] && w >= 1.4 && w <= 2.4) return "m";
  if (hr > SHORT_RATIO[1] && hr < TALL_RATIO[0] && w >= 0.9 && w <= 1.8) return "p";
  return null;
}
function groupDynamics(anchors, map2, unit) {
  const sp = unit.space;
  const out = [];
  const used = /* @__PURE__ */ new Set();
  const sorted = [...anchors].sort((a, b) => a.box.left - b.box.left);
  for (const a of sorted) {
    if (used.has(a)) continue;
    const aw = (a.box.right - a.box.left) / sp;
    const ah = (a.box.bottom - a.box.top) / sp;
    const acy = (a.box.top + a.box.bottom) / 2;
    if (a.code === "dynamicMP") {
      out.push({ px: a.box.left, py: acy, text: "mp" });
      continue;
    }
    const own = ah >= 2 ? "f" : ah <= 1.5 && aw >= 1.4 ? "m" : "p";
    let left = a.box.left;
    let right2 = a.box.right;
    const parts = [{ x: a.box.left, ch: own }];
    const refH = own === "f" ? ah : ah / 0.45;
    for (let again = true; again; ) {
      again = false;
      for (const c2 of map2.contours) {
        const b = c2.bbox;
        if (parts.some((p2) => Math.abs(p2.x - b.x) < 1)) continue;
        if (Math.abs(b.y + b.h / 2 - acy) > sp * CY_TOL) continue;
        const gapL = (left - (b.x + b.w)) / sp;
        const gapR = (b.x - right2) / sp;
        const near = gapL >= GAP_MIN && gapL <= GAP_MAX || gapR >= GAP_MIN && gapR <= GAP_MAX;
        if (!near) continue;
        const ch = letterOf(c2.w, c2.h, c2.h / refH);
        if (!ch) continue;
        parts.push({ x: b.x, ch });
        left = Math.min(left, b.x);
        right2 = Math.max(right2, b.x + b.w);
        again = true;
      }
    }
    for (const b of sorted) if (b !== a && b.box.left >= left - 1 && b.box.right <= right2 + 1) used.add(b);
    const text = parts.sort((p2, q2) => p2.x - q2.x).map((p2) => p2.ch).join("");
    if (!VALID.has(text)) continue;
    out.push({ px: left, py: acy, text });
  }
  return out;
}
const VALID = /* @__PURE__ */ new Set(["p", "pp", "ppp", "mp", "mf", "f", "ff", "fff", "sf", "sfz", "fp"]);
const MIN_W = 1.4;
const MAX_W = 40;
const MAX_H = 4;
const MAX_COMPACT = 0.25;
const ONE_RUN_FRAC = 0.8;
const BOW_MIN = 0.25;
const SPREAD_MAX = 0.6;
function findRasterSlurs(map2, unit, only, nextId) {
  const out = [];
  for (const c2 of only) {
    if (c2.w < MIN_W || c2.w > MAX_W || c2.h > MAX_H) continue;
    if (c2.compact > MAX_COMPACT) continue;
    const arc = judgeArc(map2, c2, unit, nextId + out.length);
    if (arc) out.push(arc);
  }
  return out;
}
function judgeArc(map2, c2, unit, id) {
  const b = c2.bbox;
  const ys = [];
  let one = 0;
  let cols = 0;
  let wide = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    let top = -1;
    let bot = -1;
    let runs = 0;
    let prev = false;
    let sum = 0;
    let n2 = 0;
    for (let y = b.y; y < b.y + b.h; y++) {
      const on = map2.labels[y * map2.w + x] === c2.id;
      if (on) {
        if (top < 0) top = y;
        bot = y;
        sum += y;
        n2++;
        if (!prev) runs++;
      }
      prev = on;
    }
    if (n2 === 0) {
      ys.push(NaN);
      continue;
    }
    cols++;
    if (runs === 1) one++;
    if (bot - top > unit.space * SPREAD_MAX) wide++;
    ys.push(sum / n2);
  }
  if (!cols || one < cols * ONE_RUN_FRAC) return null;
  if (wide > cols * 0.15) return null;
  const q2 = Math.max(1, Math.round(ys.length / 30));
  const mean = (a) => {
    const v2 = a.filter((y) => !Number.isNaN(y));
    return v2.length ? v2.reduce((s, y) => s + y, 0) / v2.length : NaN;
  };
  const ly = mean(ys.slice(0, q2));
  const ry = mean(ys.slice(-q2));
  if (Number.isNaN(ly) || Number.isNaN(ry)) return null;
  let bow = 0;
  for (let i2 = 0; i2 < ys.length; i2++) {
    if (Number.isNaN(ys[i2])) continue;
    const t2 = ys.length > 1 ? i2 / (ys.length - 1) : 0;
    const d2 = ys[i2] - (ly + (ry - ly) * t2);
    if (Math.abs(d2) > Math.abs(bow)) bow = d2;
  }
  if (Math.abs(bow) < unit.space * BOW_MIN) return null;
  const box = { x: b.x, y: b.y, w: b.w, h: b.h };
  return {
    obj: fakeArcObj(id, box),
    lx: b.x,
    ly,
    rx: b.x + b.w - 1,
    ry,
    // `above` = 弧画在音符**上方**（开口向下）：中间比两端高，y 向下就是 bow < 0
    above: bow < 0,
    tie: false
  };
}
function fakeArcObj(id, box) {
  const o = new PObj(id, { id, kind: "path", bbox: box, fill: "#000", stroke: null, lineWidth: 0, path: [], clip: null, curves: 0 }, null);
  o.addTag("Slur");
  return o;
}
const DASH_W = [0.35, 1];
const DASH_H = 0.5;
const DASH_ASPECT = 1.4;
const DASH_GAP = [0.25, 0.9];
const DASH_DY = 0.35;
const DASH_WR = [0.6, 1.6];
const DASH_MIN = 3;
const DASH_GAP_SPREAD = 0.3;
function findRasterDashedSlurs(only, unit, nextId, side) {
  const sp = unit.space;
  const dashes = only.filter((c2) => {
    const b = c2.bbox;
    return b.w >= sp * DASH_W[0] && b.w <= sp * DASH_W[1] && b.h <= sp * DASH_H && b.w >= b.h * DASH_ASPECT;
  }).map((c2) => c2.bbox).sort((a, b) => a.x - b.x);
  const used = /* @__PURE__ */ new Set();
  const out = [];
  for (const d0 of dashes) {
    if (used.has(d0)) continue;
    const chain = [d0];
    for (; ; ) {
      const cur = chain[chain.length - 1];
      const cy2 = cur.y + cur.h / 2;
      const next = dashes.find((d2) => {
        if (used.has(d2) || chain.includes(d2)) return false;
        const gap = d2.x - (cur.x + cur.w);
        const wr = d2.w / cur.w;
        return gap >= sp * DASH_GAP[0] && gap <= sp * DASH_GAP[1] && Math.abs(d2.y + d2.h / 2 - cy2) <= sp * DASH_DY && wr >= DASH_WR[0] && wr <= DASH_WR[1];
      });
      if (!next) break;
      chain.push(next);
    }
    if (chain.length < DASH_MIN) continue;
    const gaps = chain.slice(1).map((d2, i2) => d2.x - (chain[i2].x + chain[i2].w));
    if (Math.max(...gaps) - Math.min(...gaps) > sp * DASH_GAP_SPREAD) continue;
    const first = chain[0];
    const last = chain[chain.length - 1];
    const ly = first.y + first.h / 2;
    const ry = last.y + last.h / 2;
    const midY = chain.reduce((a, d2) => a + d2.y + d2.h / 2, 0) / chain.length;
    const where = side(first.x, last.x + last.w, midY);
    if (!where) continue;
    for (const d2 of chain) used.add(d2);
    const x0 = first.x;
    const y0 = Math.min(...chain.map((d2) => d2.y));
    const box = { x: x0, y: y0, w: last.x + last.w - x0, h: Math.max(...chain.map((d2) => d2.y + d2.h)) - y0 };
    out.push({ obj: fakeArcObj(nextId + out.length, box), lx: x0, ly, rx: last.x + last.w - 1, ry, above: where === "above", tie: false, dashed: true });
  }
  return out;
}
const ALIGN_X = 0.4;
const NEAR_Y = [0.6, 1.75];
const FAR_Y = [0.9, 3.2];
const TENUTO_W = [0.6, 1.5];
const TENUTO_H = 0.45;
const DOT_SIZE = [0.25, 0.6];
const DOT_FILL$1 = 0.6;
const WEDGE_W = [0.2, 0.6];
const WEDGE_H = [0.5, 1];
const ACCENT_W = [0.9, 1.75];
const ACCENT_H = [0.45, 1.1];
const ACCENT_OPEN = 0.4;
const ACCENT_TIP = 0.3;
const ACCENT_TWO_RUN = 0.4;
const FERMATA_W = [1.5, 3.4];
const FERMATA_H = [0.6, 1.7];
const FERMATA_DOT_X = 0.35;
const FERMATA_DOT = 0.8;
const FERMATA_GAP = 5;
const FERMATA_NOTE_X = 1.3;
const STEM_GAP = [0.15, 1.5];
const STEM_GAP_ACCENT = 2.4;
const STEM_SIDE_X = 0.45;
const CROWD = 0.45;
const NOTE_INK = /^(head|stack|cluster|hollowmask|beam|seg:|bar|artic)/;
const LYRIC_ALONE = 0.9;
const SPECKLE = 1;
const OFF_LINE = 0.27;
function findRasterArticulations(pg, map2, unit, notes, dictSyms, unclaimed, taken, claimsOf) {
  const sp = unit.space;
  const heads = notes.filter((n2) => !n2.rest && !n2.grace && !n2.slash);
  const cands = [];
  for (const s of dictSyms) cands.push({ box: { x: s.box.left, y: s.box.top, w: s.box.right - s.box.left, h: s.box.bottom - s.box.top }, dictCode: s.code });
  for (const c2 of unclaimed) {
    if (c2.w > FERMATA_W[1] || c2.h > FERMATA_H[1]) continue;
    cands.push({ box: c2.bbox, contour: c2 });
  }
  const lyricInk = map2.contours.filter((c2) => claimsOf(c2.id).includes("lyric"));
  for (const c2 of map2.contours) {
    const by = claimsOf(c2.id);
    if (!by.length || !by.every((q2) => q2 === "lyric" || q2 === "dict:augmentationDot")) continue;
    const small = isDot$1({ box: c2.bbox, contour: c2 }, sp) || c2.w >= TENUTO_W[0] && c2.w <= TENUTO_W[1] && c2.h <= TENUTO_H || c2.w >= WEDGE_W[0] && c2.w <= WEDGE_W[1] && c2.h >= WEDGE_H[0] && c2.h <= WEDGE_H[1];
    if (!small) continue;
    if (by.includes("lyric") && lyricInk.some((o) => o !== c2 && Math.abs(o.cx - c2.cx) <= sp * LYRIC_ALONE + o.bbox.w / 2 && Math.abs(o.cy - c2.cy) <= sp * LYRIC_ALONE + o.bbox.h / 2)) continue;
    cands.push({ box: c2.bbox, contour: c2 });
  }
  const hits = (b, q2) => b.x < q2.x + q2.w && b.x + b.w > q2.x && b.y < q2.y + q2.h && b.y + b.h > q2.y;
  const out = [];
  const used = /* @__PURE__ */ new Set();
  const mainOf = (n2) => n2.group?.notes.find((m2) => !m2.chordExtra) ?? n2;
  const push = (code, c2, n2) => {
    const tgt = mainOf(n2);
    if ((tgt.marks ?? []).includes(code)) return;
    (tgt.marks ??= []).push(code);
    used.add(c2);
    out.push({ code, box: c2.box, note: tgt });
  };
  const loose = (c2) => claimsOf(c2.id).every((q2) => q2 === "beam" || q2 === "lyric");
  const arcs = map2.contours.filter(loose).map((c2) => ({ box: c2.bbox, contour: c2 }));
  const dots = map2.contours.filter((c2) => loose(c2) && c2.w >= DOT_SIZE[0] && c2.w <= FERMATA_DOT && c2.h >= DOT_SIZE[0] && c2.h <= FERMATA_DOT && c2.fill >= DOT_FILL$1).map((c2) => ({ box: c2.bbox, contour: c2 }));
  for (const arc of arcs) {
    const c2 = arc.contour;
    if (!c2 || c2.w < FERMATA_W[0] || c2.w > FERMATA_W[1] || c2.h < FERMATA_H[0] || c2.h > FERMATA_H[1]) continue;
    const shape = archShape(map2, c2);
    if (!shape) continue;
    const mx = arc.box.x + arc.box.w / 2;
    const dot = dots.find((d2) => {
      if (d2.contour === c2) return false;
      const dx = d2.box.x + d2.box.w / 2;
      const dy = d2.box.y + d2.box.h / 2;
      if (Math.abs(dx - mx) > sp * FERMATA_DOT_X) return false;
      return shape.up ? dy > arc.box.y + arc.box.h * 0.45 && dy < arc.box.y + arc.box.h + sp * 0.3 : dy < arc.box.y + arc.box.h * 0.55 && dy > arc.box.y - sp * 0.3;
    });
    if (!dot) continue;
    const cy2 = arc.box.y + arc.box.h / 2;
    let stf;
    let bd = sp * FERMATA_GAP;
    for (const st of pg.staves) {
      const d2 = shape.up ? st.box.top - cy2 : cy2 - st.box.bottom;
      if (d2 > -sp * 1.5 && d2 < bd) {
        bd = d2;
        stf = st;
      }
    }
    if (!stf) continue;
    let best;
    let bx = sp * FERMATA_NOTE_X;
    for (const n2 of notes) {
      if (n2.staff !== stf || n2.grace) continue;
      const d2 = Math.abs((n2.sym.box.left + n2.sym.box.right) / 2 - mx);
      if (d2 < bx) {
        bx = d2;
        best = n2;
      }
    }
    if (!best) continue;
    for (const q2 of cands) if (q2.contour === dot.contour || q2.contour === c2) used.add(q2);
    push(shape.up ? "fermataAbove" : "fermataBelow", arc, best);
  }
  for (const c2 of cands) {
    if (used.has(c2)) continue;
    const b = c2.box;
    const w = b.w / sp;
    const h2 = b.h / sp;
    let kind = null;
    if (w >= TENUTO_W[0] && w <= TENUTO_W[1] && h2 <= TENUTO_H && (c2.dictCode ? /^articTenuto/.test(c2.dictCode) : (c2.contour?.fill ?? 0) >= 0.7)) kind = "tenuto";
    else if (c2.contour && isDot$1(c2, sp)) kind = "staccato";
    else if (c2.contour && w >= WEDGE_W[0] && w <= WEDGE_W[1] && h2 >= WEDGE_H[0] && h2 <= WEDGE_H[1] && c2.contour.fill >= 0.45 && taper(map2, c2.contour)) kind = "staccatissimo";
    else if (c2.contour && w >= ACCENT_W[0] && w <= ACCENT_W[1] && h2 >= ACCENT_H[0] && h2 <= ACCENT_H[1] && isAccent(map2, c2.contour, sp)) kind = "accent";
    if (!kind) continue;
    if (taken.some((q2) => hits(b, q2))) continue;
    const cx2 = b.x + b.w / 2;
    const cy2 = b.y + b.h / 2;
    if (kind === "staccato" && unclaimed.some((o) => o !== c2.contour && o.w <= DOT_SIZE[1] && o.h <= DOT_SIZE[1] && Math.abs(o.cx - cx2) <= sp * SPECKLE && Math.abs(o.cy - cy2) <= sp * SPECKLE)) continue;
    const [lo, hi] = kind === "accent" ? FAR_Y : NEAR_Y;
    let best;
    let bd = Infinity;
    let headSide = true;
    for (const n2 of heads) {
      const hb2 = n2.sym.box;
      const hx = (hb2.left + hb2.right) / 2;
      const dy = cy2 - (hb2.top + hb2.bottom) / 2;
      const stem = n2.group?.stem ?? null;
      const up = stem ? stem.up : n2.stemUp;
      if (Math.abs(hx - cx2) <= sp * ALIGN_X && !(up === true && dy < 0) && !(up === false && dy > 0)) {
        const d2 = Math.abs(dy);
        if (d2 >= sp * lo && d2 <= sp * hi && d2 < bd) {
          best = n2;
          bd = d2;
          headSide = true;
        }
      }
      if (stem) {
        const sx = stem.seg.cx;
        if (cx2 < Math.min(hb2.left, sx) - sp * STEM_SIDE_X || cx2 > Math.max(hb2.right, sx) + sp * STEM_SIDE_X) continue;
        const ends = [stem.up ? stem.seg.top : stem.seg.bottom, ...stem.beams.map((bm) => beamY(bm, sx) + (stem.up ? -1 : 1) * (bm.box.bottom - bm.box.top) * 0.25)];
        const tip = stem.up ? Math.min(...ends) : Math.max(...ends);
        const gap = stem.up ? tip - cy2 : cy2 - tip;
        if (gap < sp * STEM_GAP[0] || gap > sp * (kind === "accent" ? STEM_GAP_ACCENT : STEM_GAP[1])) continue;
        const d2 = gap + sp * 0.5;
        if (d2 < bd) {
          best = n2;
          bd = d2;
          headSide = false;
        }
      }
    }
    if (!best) continue;
    const hb = best.sym.box;
    const hy = (hb.top + hb.bottom) / 2;
    if (headSide && heads.some((m2) => m2 !== best && m2.group !== best.group && Math.abs((m2.sym.box.left + m2.sym.box.right) / 2 - cx2) <= sp * 0.8 && between((m2.sym.box.top + m2.sym.box.bottom) / 2, hy, cy2))) continue;
    const ys = best.staff.lineYsAt?.(cx2) ?? best.staff.lineYs;
    if (ys.length === 5 && kind !== "accent") {
      const gap = (ys[4] - ys[0]) / 4;
      const inside = cy2 > ys[0] - gap * 0.3 && cy2 < ys[4] + gap * 0.3;
      const off = Math.abs((cy2 - ys[0]) / gap - Math.round((cy2 - ys[0]) / gap));
      if (inside && off < OFF_LINE) continue;
      if (!inside && kind === "tenuto" && off < OFF_LINE) {
        const below = cy2 > ys[4];
        const outer = heads.some((m2) => {
          const my = (m2.sym.box.top + m2.sym.box.bottom) / 2;
          return m2.staff === best.staff && Math.abs((m2.sym.box.left + m2.sym.box.right) / 2 - cx2) <= sp && (below ? my >= cy2 - gap * 0.3 : my <= cy2 + gap * 0.3);
        });
        if (outer) continue;
      }
    }
    if ((kind === "staccato" || kind === "staccatissimo") && map2.contours.some((o) => {
      if (o === c2.contour) return false;
      const dx = Math.max(o.bbox.x - (b.x + b.w), b.x - (o.bbox.x + o.bbox.w), 0);
      const dy = Math.max(o.bbox.y - (b.y + b.h), b.y - (o.bbox.y + o.bbox.h), 0);
      if (dx > sp * CROWD || dy > sp * CROWD) return false;
      return !claimsOf(o.id).some((q2) => NOTE_INK.test(q2));
    })) continue;
    const above = cy2 < hy;
    push(
      kind === "tenuto" ? above ? "articTenutoAbove" : "articTenutoBelow" : kind === "staccato" ? above ? "articStaccatoAbove" : "articStaccatoBelow" : kind === "staccatissimo" ? above ? "articStaccatissimoAbove" : "articStaccatissimoBelow" : above ? "articAccentAbove" : "articAccentBelow",
      c2,
      best
    );
  }
  return out;
}
const between = (v2, a, b) => (v2 - a) * (v2 - b) < 0;
function isDot$1(c2, sp) {
  const w = c2.box.w / sp;
  const h2 = c2.box.h / sp;
  if (!c2.contour) return false;
  return w >= DOT_SIZE[0] && w <= DOT_SIZE[1] && h2 >= DOT_SIZE[0] && h2 <= DOT_SIZE[1] && Math.max(w, h2) <= Math.min(w, h2) * 1.6 && c2.contour.fill >= DOT_FILL$1;
}
function rowWidths(map2, c2) {
  const b = c2.bbox;
  const out = [];
  for (let y = b.y; y < b.y + b.h; y++) {
    let n2 = 0;
    for (let x = b.x; x < b.x + b.w; x++) if (map2.labels[y * map2.w + x] === c2.id) n2++;
    out.push(n2);
  }
  return out;
}
function taper(map2, c2) {
  const r4 = rowWidths(map2, c2);
  if (r4.length < 4) return false;
  const k2 = Math.max(1, Math.round(r4.length / 4));
  const avg = (a) => a.reduce((s, v2) => s + v2, 0) / a.length;
  const top = avg(r4.slice(0, k2));
  const bot = avg(r4.slice(-k2));
  return Math.max(top, bot) >= Math.min(top, bot) * 2;
}
function colProfile(map2, c2) {
  const b = c2.bbox;
  const out = [];
  for (let x = b.x; x < b.x + b.w; x++) {
    let top = -1;
    let bot = -1;
    let runs = 0;
    let prev = false;
    for (let y = b.y; y < b.y + b.h; y++) {
      const on = map2.labels[y * map2.w + x] === c2.id;
      if (on) {
        if (top < 0) top = y;
        bot = y;
        if (!prev) runs++;
      }
      prev = on;
    }
    out.push({ top, bot, runs });
  }
  return out;
}
function isAccent(map2, c2, sp) {
  const cols = colProfile(map2, c2).filter((q2) => q2.top >= 0);
  if (cols.length < 6) return false;
  const k2 = Math.max(1, Math.round(cols.length / 6));
  const span = (a) => a.reduce((s, q2) => s + (q2.bot - q2.top + 1), 0) / a.length;
  const open = span(cols.slice(0, k2));
  const tip = span(cols.slice(-k2));
  if (open < sp * ACCENT_OPEN || tip > sp * ACCENT_TIP || open < tip * 2) return false;
  return cols.filter((q2) => q2.runs === 2).length >= cols.length * ACCENT_TWO_RUN;
}
function archShape(map2, c2) {
  const cols = colProfile(map2, c2).filter((q2) => q2.top >= 0);
  if (cols.length < 8) return null;
  if (cols.filter((q2) => q2.runs > 1).length > cols.length * 0.15) return null;
  const b = c2.bbox;
  const k2 = Math.max(1, Math.round(cols.length / 8));
  const avg = (a, f2) => a.reduce((s, q2) => s + f2(q2), 0) / a.length;
  const ends = [...cols.slice(0, k2), ...cols.slice(-k2)];
  const center = cols.slice(Math.floor(cols.length / 2) - k2, Math.floor(cols.length / 2) + k2);
  if (Math.abs(avg(cols.slice(0, k2), (q2) => q2.top + q2.bot) - avg(cols.slice(-k2), (q2) => q2.top + q2.bot)) / 2 > b.h * 0.35) return null;
  const riseTop = avg(ends, (q2) => q2.top) - avg(center, (q2) => q2.top);
  const riseBot = avg(center, (q2) => q2.bot) - avg(ends, (q2) => q2.bot);
  const rise = riseTop >= riseBot ? riseTop : -riseBot;
  if (Math.abs(rise) < b.h * 0.5) return null;
  return { up: rise > 0 };
}
const DOT = [0.2, 0.65];
const DOT_FILL = 0.55;
const DOT_Y = 0.3;
const DOT_X = 0.3;
const GAP = 1;
const PAIR = 1;
const THICK = 0.3;
const FULL = 0.9;
const SNAP = 2.2;
const VOLTA_LEN = 3;
const VOLTA_RISE = [1.2, 7];
const VOLTA_HOOK = [0.6, 5];
const VOLTA_SNAP = 1.8;
const VOLTA_THICK = 0.3;
function findRasterRepeats(pg, bin, map2, sp) {
  const out = [];
  const dots = map2.contours.filter((c2) => c2.w >= DOT[0] && c2.w <= DOT[1] && c2.h >= DOT[0] && c2.h <= DOT[1] && c2.fill >= DOT_FILL);
  for (const st of pg.staves) {
    if (st.lineYs.length !== 5) continue;
    const upper = dots.filter((d2) => d2.cx > st.box.left && d2.cx < st.box.right + sp && Math.abs(d2.cy - spaceY(st, d2.cx, 1)) <= sp * DOT_Y);
    const lower = dots.filter((d2) => d2.cx > st.box.left && d2.cx < st.box.right + sp && Math.abs(d2.cy - spaceY(st, d2.cx, 2)) <= sp * DOT_Y);
    for (const u2 of upper) {
      const l2 = lower.find((q2) => Math.abs(q2.cx - u2.cx) <= sp * DOT_X);
      if (!l2) continue;
      const ys = st.lineYsAt?.(u2.cx) ?? st.lineYs;
      const y0 = Math.round(ys[0]);
      const y1 = Math.round(ys[4]);
      const full = (x) => {
        let ink = 0;
        for (let y = y0; y <= y1; y++) if (bin.data[y * bin.w + x]) ink++;
        return ink >= (y1 - y0 + 1) * FULL;
      };
      const left = Math.min(u2.bbox.x, l2.bbox.x);
      const right2 = Math.max(u2.bbox.x + u2.bbox.w, l2.bbox.x + l2.bbox.w);
      const xa = Math.max(0, Math.round(left - sp * (GAP + PAIR + 1)));
      const xb = Math.min(bin.w - 1, Math.round(right2 + sp * (GAP + PAIR + 1)));
      const bars = [];
      for (let x = xa; x <= xb; x++) {
        if (x >= left && x < right2) continue;
        if (!full(x)) continue;
        const last = bars[bars.length - 1];
        if (last && last[1] === x - 1) last[1] = x;
        else bars.push([x, x]);
      }
      const thick = (q2) => q2[1] - q2[0] + 1 >= Math.max(2, sp * THICK);
      for (const side of [-1, 1]) {
        const near = side > 0 ? bars.find((q2) => q2[0] >= right2) : [...bars].reverse().find((q2) => q2[1] < left);
        if (!near || thick(near)) continue;
        const gap = side > 0 ? near[0] - right2 : left - near[1];
        if (gap > sp * GAP) continue;
        const other = bars[bars.indexOf(near) + side];
        if (!other || !thick(other)) continue;
        const between2 = side > 0 ? other[0] - near[1] : near[0] - other[1];
        if (between2 > sp * PAIR) continue;
        const x = (near[0] + near[1] + other[0] + other[1]) / 4;
        const dir = side > 0 ? "backward" : "forward";
        if (!out.some((m2) => m2.staff === st && m2.dir === dir && Math.abs(m2.x - x) < sp)) out.push({ staff: st, x, dir, dots: [u2.bbox, l2.bbox] });
      }
    }
  }
  return out;
}
function spaceY(st, x, i2) {
  const ys = st.lineYsAt?.(x) ?? st.lineYs;
  return (ys[i2] + ys[i2 + 1]) / 2;
}
function markRepeatsAndVoltas(pg, bin, map2, sp) {
  const systemOf = (st) => pg.systems.find((s) => s.staves.includes(st))?.staves ?? [st];
  const repeats = findRasterRepeats(pg, bin, map2, sp);
  for (const m2 of repeats) {
    for (const st of systemOf(m2.staff)) {
      if (m2.dir === "backward") {
        const b = nearest(st.bars, (q2) => q2.right, m2.x, sp * SNAP);
        if (!b) continue;
        b.rightRepeat = true;
        b.rightStyle = "light-heavy";
      } else {
        const b = nearest(st.bars, (q2) => q2.left, m2.x, sp * SNAP) ?? (st.bars[0] && m2.x < st.bars[0].right ? st.bars[0] : void 0);
        if (!b) continue;
        b.leftRepeat = true;
        const prev = st.bars[st.bars.indexOf(b) - 1];
        if (prev && !prev.rightRepeat && prev.rightStyle === "light-heavy") prev.rightStyle = null;
      }
    }
  }
  for (const sys of pg.systems) {
    for (const st of sys.staves)
      for (const b of st.bars) {
        if (!b.rightStyle) continue;
        for (const o of sys.staves) {
          if (o === st) continue;
          const q2 = nearest(o.bars, (p2) => p2.right, b.right, sp);
          if (q2 && !q2.rightStyle) q2.rightStyle = b.rightStyle;
        }
      }
  }
  const hooks = pg.segs.filter((s) => s.isV && !s.hasAnyTag() && s.len >= sp * VOLTA_HOOK[0] && s.len <= sp * VOLTA_HOOK[1]);
  const voltas = [];
  hooks.sort((p2, q2) => p2.cx - q2.cx);
  for (const hook of hooks) {
    const st = pg.staves.filter((s) => s.box.top > hook.top && hook.cx > s.box.left - sp && hook.cx < s.box.right).sort((p2, q2) => p2.box.top - q2.box.top)[0];
    if (!st) continue;
    const rise = st.box.top - hook.top;
    if (rise < sp * VOLTA_RISE[0] || rise > sp * VOLTA_RISE[1] || hook.bottom > st.box.top + sp) continue;
    const atRowStart = !!st.bars[0] && hook.cx > st.bars[0].left && hook.cx < st.bars[0].right - sp * 2;
    if (!atRowStart && !st.bars.some((b) => Math.abs(b.left - hook.cx) <= sp * VOLTA_SNAP)) continue;
    const len = inkRun(bin, Math.round(hook.cx), Math.round(hook.top), Math.max(2, Math.round(sp * 0.15)));
    if (len < sp * VOLTA_LEN) continue;
    const thick = [0.25, 0.5, 0.75].map((f2) => inkThick(bin, Math.round(hook.cx + len * f2), Math.round(hook.top), Math.round(sp))).sort((p2, q2) => p2 - q2)[1];
    if (thick > Math.max(3, sp * VOLTA_THICK)) continue;
    if (inkRun(bin, Math.round(hook.cx), Math.round(hook.bottom), Math.max(2, Math.round(sp * 0.15))) > sp * 2) continue;
    const prevVolta = voltas.find((v2) => v2.staff === st && v2.left < hook.cx - sp && v2.right > hook.cx - sp);
    if (prevVolta) prevVolta.right = hook.cx;
    else if (inkRun(bin, Math.round(hook.cx), Math.round(hook.top), Math.max(2, Math.round(sp * 0.15)), -1) > sp) continue;
    if (voltas.some((v2) => v2.staff === st && Math.abs(v2.left - hook.cx) < sp)) continue;
    hook.addTag("Notation");
    voltas.push({ number: "1", left: hook.cx, right: hook.cx + len, staffTop: st.box.top, staff: st });
  }
  for (const v2 of voltas) {
    const covered = v2.staff.bars.filter((b) => b.right > v2.left + sp && b.left < v2.right - sp);
    const prev = covered[0] ? v2.staff.bars[v2.staff.bars.indexOf(covered[0]) - 1] : void 0;
    if (prev?.rightRepeat) v2.number = "2";
    else if (covered[covered.length - 1]?.rightRepeat) v2.number = "1";
    else if (covered[0] && covered[0] === v2.staff.bars[0]) v2.number = "2";
  }
  attachVoltas(pg, voltas);
  for (const v2 of voltas) {
    for (const b of v2.staff.bars) {
      if (b.endingNumber !== v2.number || !(b.right > v2.left + sp && b.left < v2.right - sp)) continue;
      for (const o of systemOf(v2.staff)) {
        if (o === v2.staff) continue;
        const q2 = nearest(o.bars, (p2) => p2.left, b.left, sp);
        if (!q2) continue;
        q2.endingNumber = b.endingNumber;
        q2.endingStart = b.endingStart;
        q2.endingStop = b.endingStop;
      }
    }
  }
  return repeats.flatMap((m2) => m2.dots);
}
function inkThick(bin, x, y, reach) {
  if (x < 0 || x >= bin.w) return 0;
  const on = (cy2) => cy2 >= 0 && cy2 < bin.h && bin.data[cy2 * bin.w + x] === 1;
  let y0 = -1;
  for (let d2 = 0; d2 <= reach && y0 < 0; d2++) y0 = on(y - d2) ? y - d2 : on(y + d2) ? y + d2 : -1;
  if (y0 < 0) return 0;
  let a = y0;
  let b = y0;
  while (on(a - 1)) a--;
  while (on(b + 1)) b++;
  return b - a + 1;
}
function inkRun(bin, x, y, pad, dir = 1) {
  let gap = 0;
  let last = x;
  for (let cx2 = x; cx2 >= 0 && cx2 < bin.w; cx2 += dir) {
    let on = false;
    for (let cy2 = Math.max(0, y - pad); cy2 <= Math.min(bin.h - 1, y + pad) && !on; cy2++) on = bin.data[cy2 * bin.w + cx2] === 1;
    if (on) {
      gap = 0;
      last = cx2;
    } else if (++gap > 2) break;
  }
  return Math.abs(last - x);
}
function nearest(bars, at, x, tol) {
  let best;
  let bd = tol;
  for (const b of bars) {
    const d2 = Math.abs(at(b) - x);
    if (d2 <= bd) {
      bd = d2;
      best = b;
    }
  }
  return best;
}
const DIGIT_W = [0.45, 1.2];
const DIGIT_H = [0.8, 1.6];
const ARM_W = 1;
const ARM_H = 1.6;
const ARM_THICK = 0.4;
const ARM_GAP = 1.2;
const ARM_DY = 1.2;
const REACH = 6;
function findRasterTuplets(pg, cands, notes, sp) {
  const out = [];
  const arms = cands.filter((c2) => c2.w >= ARM_W && c2.h <= ARM_H && c2.area / c2.bbox.w <= sp * ARM_THICK);
  for (const d2 of cands) {
    if (d2.w < DIGIT_W[0] || d2.w > DIGIT_W[1] || d2.h < DIGIT_H[0] || d2.h > DIGIT_H[1]) continue;
    const dl = d2.bbox.x;
    const dr = d2.bbox.x + d2.bbox.w;
    const near = (a) => Math.abs(a.bbox.y + a.bbox.h / 2 - d2.cy) <= sp * ARM_DY;
    const left = arms.filter((a) => a !== d2 && near(a) && a.bbox.x + a.bbox.w <= dl + sp * 0.2 && dl - (a.bbox.x + a.bbox.w) <= sp * ARM_GAP).sort((p2, q2) => q2.bbox.x + q2.bbox.w - (p2.bbox.x + p2.bbox.w))[0];
    const right2 = arms.filter((a) => a !== d2 && near(a) && a.bbox.x >= dr - sp * 0.2 && a.bbox.x - dr <= sp * ARM_GAP).sort((p2, q2) => p2.bbox.x - q2.bbox.x)[0];
    if (!left || !right2) continue;
    const x0 = left.bbox.x;
    const x1 = right2.bbox.x + right2.bbox.w;
    let best = null;
    for (const st of pg.staves) {
      const dist = d2.cy < st.box.top ? st.box.top - d2.cy : d2.cy > st.box.bottom ? d2.cy - st.box.bottom : 0;
      if (dist > sp * REACH) continue;
      const span = notes.filter((n2) => n2.staff === st && !n2.grace && n2.x >= x0 - sp * 1.2 && n2.x <= x1 + sp * 0.6);
      const mains = span.filter((n2) => !n2.chordExtra);
      const voices = [...new Set(mains.map((n2) => n2.voice))];
      for (const v2 of voices) {
        const grp = mains.filter((n2) => n2.voice === v2);
        if (grp.length !== 3) continue;
        if (!best || dist < best.d) best = { st, grp: span.filter((n2) => n2.voice === v2), d: dist };
      }
    }
    if (!best) continue;
    out.push({ notes: best.grp, contours: [d2, left, right2] });
  }
  return out;
}
const D = 7;
const WIN_W = 1.3;
const WIN_H = 1;
const ITERS = 200;
const LR = 0.5;
const L2 = 0.01;
const MIN_POS = 30;
const MIN_NEG = 30;
function features(bin, masks, unit, box, cy2, onLine) {
  const sp = unit.space;
  const f2 = new Float64Array(D);
  const m2 = masks.find((k2) => k2.onLine === onLine) ?? masks[0];
  const cx2 = box.x + box.w / 2;
  f2[0] = m2 ? scoreAt(bin, m2, cx2, cy2) : 0;
  const ww = Math.max(3, Math.round(sp * WIN_W));
  const wh = Math.max(3, Math.round(sp * WIN_H));
  const x0 = Math.round(cx2 - ww / 2);
  const y0 = Math.round(cy2 - wh / 2);
  const rows = new Float64Array(wh);
  let ink = 0;
  let left = 0;
  let right2 = 0;
  let inEll = 0;
  let ellArea = 0;
  for (let y = 0; y < wh; y++) {
    const sy = y0 + y;
    for (let x = 0; x < ww; x++) {
      const inside = ((x + 0.5 - ww / 2) / (ww / 2)) ** 2 + ((y + 0.5 - wh / 2) / (wh / 2)) ** 2 <= 1;
      if (inside) ellArea++;
      const sx = x0 + x;
      if (sy < 0 || sy >= bin.h || sx < 0 || sx >= bin.w || !bin.data[sy * bin.w + sx]) continue;
      ink++;
      rows[y]++;
      if (x < ww / 2) left++;
      else right2++;
      if (inside) inEll++;
    }
  }
  f2[1] = ink / Math.max(1, ww * wh);
  f2[2] = ink ? Math.abs(left - right2) / ink : 1;
  let top = 0;
  let bot = 0;
  let mx = 0;
  for (let y = 0; y < wh; y++) {
    mx = Math.max(mx, rows[y]);
    if (y < wh / 2) top += rows[y];
    else bot += rows[y];
  }
  f2[3] = ink ? Math.abs(top - bot) / ink : 1;
  f2[4] = ink ? mx / (ink / wh) : 0;
  f2[5] = ellArea ? inEll / ellArea : 0;
  f2[6] = ink ? (ink - inEll) / ink : 0;
  return f2;
}
function trainHeadClassifier(bin, masks, unit, onLine, pos, neg) {
  if (pos.length < MIN_POS || neg.length < MIN_NEG || !masks.length) return null;
  const X = [];
  const y = [];
  const push = (box, label) => {
    const cy2 = box.y + box.h / 2;
    X.push(features(bin, masks, unit, box, cy2, onLine(cy2)));
    y.push(label);
  };
  for (const b2 of pos) push(b2, 1);
  for (const b2 of neg) push(b2, 0);
  const mu = new Float64Array(D);
  const sd = new Float64Array(D);
  for (const x of X) for (let d2 = 0; d2 < D; d2++) mu[d2] += x[d2];
  for (let d2 = 0; d2 < D; d2++) mu[d2] /= X.length;
  for (const x of X) for (let d2 = 0; d2 < D; d2++) sd[d2] += (x[d2] - mu[d2]) ** 2;
  for (let d2 = 0; d2 < D; d2++) sd[d2] = Math.sqrt(sd[d2] / X.length) || 1;
  for (const x of X) for (let d2 = 0; d2 < D; d2++) x[d2] = (x[d2] - mu[d2]) / sd[d2];
  const wPos = X.length / (2 * pos.length);
  const wNeg = X.length / (2 * neg.length);
  const w = new Float64Array(D);
  let b = 0;
  for (let it = 0; it < ITERS; it++) {
    const gw = new Float64Array(D);
    let gb = 0;
    for (let i2 = 0; i2 < X.length; i2++) {
      let z = b;
      for (let d2 = 0; d2 < D; d2++) z += w[d2] * X[i2][d2];
      const p2 = 1 / (1 + Math.exp(-z));
      const e = (p2 - y[i2]) * (y[i2] ? wPos : wNeg);
      for (let d2 = 0; d2 < D; d2++) gw[d2] += e * X[i2][d2];
      gb += e;
    }
    for (let d2 = 0; d2 < D; d2++) w[d2] -= LR * (gw[d2] / X.length + L2 * w[d2]);
    b -= LR * (gb / X.length);
  }
  return { w, b, mu, sd, nPos: pos.length, nNeg: neg.length };
}
function headProb(clf, bin, masks, unit, box, cy2, onLine) {
  const f2 = features(bin, masks, unit, box, cy2, onLine);
  let z = clf.b;
  for (let d2 = 0; d2 < D; d2++) z += clf.w[d2] * ((f2[d2] - clf.mu[d2]) / clf.sd[d2]);
  return 1 / (1 + Math.exp(-z));
}
const empty = (page, raster, unit, carryTime, carryKey) => ({
  page,
  hasStaff: false,
  unknown: 0,
  unit,
  raster,
  ctx: /* @__PURE__ */ new Map(),
  beams: [],
  notes: [],
  bars: [],
  lyricLines: [],
  contours: null,
  ledger: null,
  wedges: [],
  dynamics: [],
  slurs: [],
  lyricStrips: [],
  labelStrips: [],
  timeStrips: [],
  wordStrips: [],
  harmonyStrips: [],
  jianpuStrips: [],
  harmonies: [],
  harmonyTexts: [],
  staffLabels: /* @__PURE__ */ new Map(),
  lyricStats: { rows: 0, hit: 0, parity: 0 },
  carryTime,
  carryKey
});
function bootstrapFlags(bin, pg, beams, unit, avoid = []) {
  const sp = unit.space;
  const out = [];
  const heads = pg.symbols.filter((s) => s.hasTag("Note") && s.code === "noteheadBlack");
  const lineYs = pg.staves.flatMap((stf) => stf.lineYs);
  const bare = [];
  for (const st of pg.segsWithTag("Stem")) {
    const on = heads.filter(
      (s) => (Math.abs(s.box.left - st.cx) < sp / 3 || Math.abs(s.box.right - st.cx) < sp / 3) && s.box.top < st.bottom && st.top < s.box.bottom
    );
    if (!on.length) continue;
    const ys = on.map((s) => (s.box.top + s.box.bottom) / 2);
    const dTop = Math.min(...ys.map((y) => Math.abs(st.top - y)));
    const dBot = Math.min(...ys.map((y) => Math.abs(st.bottom - y)));
    if (Math.max(dTop, dBot) < sp * FLAG_BOTH_ENDS) continue;
    let far = dTop > dBot ? st.top : st.bottom;
    const hy = far === st.top ? Math.min(...ys) : Math.max(...ys);
    if (beams.some((b) => b.x0 - sp * 0.5 <= st.cx && st.cx <= b.x1 + sp * 0.5 && st.top - sp * 0.5 < (b.y0 + b.y1) / 2 && (b.y0 + b.y1) / 2 < st.bottom + sp * 0.5)) continue;
    const toward = Math.sign(hy - far) || 1;
    const frac = (d0, d1, side = 1) => {
      const x0 = Math.round(side > 0 ? st.cx + sp * FLAG_X[0] : st.cx - sp * FLAG_X[1]);
      const x1 = Math.round(side > 0 ? st.cx + sp * FLAG_X[1] : st.cx - sp * FLAG_X[0]);
      let ink = 0;
      let tot = 0;
      for (let dy = sp * d0; dy < sp * d1; dy++) {
        const y = Math.round(far + toward * dy);
        if (y < 0 || y >= bin.h) continue;
        for (let x = x0; x < x1; x++) {
          if (x < 0 || x >= bin.w) continue;
          tot++;
          ink += bin.data[y * bin.w + x];
        }
      }
      return tot ? ink / tot : 0;
    };
    let offset = 0;
    const onLineTip = lineYs.some((ly) => Math.abs(ly - far) <= unit.lineThick * 1.5 + 1);
    const reach = unit.lineThick > sp * FLAG_REACH_LW ? Math.min(sp * 0.5, unit.lineThick * 3) : onLineTip ? sp * 0.5 : Math.max(0, Math.min(sp * 0.5, Math.abs(hy - far) - sp * (0.6 + FLAG_TIP_Y)));
    while (frac(offset, offset + FLAG_TIP_Y) < FLAG_TIP && offset * sp < reach) offset += 1 / sp;
    const tipOf = (from) => {
      const cx2 = Math.round(st.cx);
      const inkAt = (y) => y >= 0 && y < bin.h && [cx2 - 1, cx2, cx2 + 1].some((x) => x >= 0 && x < bin.w && bin.data[y * bin.w + x]);
      let tip = from;
      while (Math.abs(tip - toward - from) <= sp * FLAG_TIP_EXT && inkAt(Math.round(tip - toward))) tip -= toward;
      return tip;
    };
    const noFlag = () => frac(offset, offset + FLAG_TIP_Y) < FLAG_TIP || frac(offset, offset + FLAG_Y) < FLAG_INK;
    let bareHere = noFlag();
    if (bareHere) {
      const tip = tipOf(far);
      if (Math.abs(tip - far) >= sp * FLAG_GLUED) {
        const keep = far;
        far = tip;
        offset = 0;
        while (frac(offset, offset + FLAG_TIP_Y) < FLAG_TIP && offset < 0.5) offset += 1 / sp;
        bareHere = noFlag();
        if (bareHere) far = keep;
      }
    }
    if (bareHere) {
      bare.push({ cx: st.cx, far, up: far < hy });
      continue;
    }
    if (frac(offset, offset + FLAG_TIP_Y, -1) >= FLAG_LEFT) continue;
    const up = far < hy;
    const room = Math.abs(hy - far) / sp - 0.6;
    const twoEnd = Math.min(offset + 2.2, room);
    const hookRuns = () => {
      const x0 = Math.round(st.cx + unit.lineThick);
      const x1 = Math.round(st.cx + sp * 0.35);
      let runs = 0;
      let gap = 2;
      for (let dy = offset * sp; dy < Math.min(offset + 2.4, room) * sp; dy++) {
        const y = Math.round(far + toward * dy);
        if (y < 0 || y >= bin.h || lineYs.some((ly) => Math.abs(ly - y) <= unit.lineThick)) continue;
        let ink = false;
        for (let x = Math.max(0, x0); x <= Math.min(x1, bin.w - 1) && !ink; x++) if (bin.data[y * bin.w + x]) ink = true;
        if (ink) {
          if (gap >= 2) runs++;
          gap = 0;
        } else gap++;
      }
      return runs;
    };
    const twoPeaks = () => {
      const x0 = Math.round(st.cx + unit.lineThick);
      const x1 = Math.round(st.cx + sp * 1.2);
      const prom = sp * HOOK_PROM;
      let max = -1;
      let dip = Infinity;
      for (let dy = offset * sp; dy < Math.min(offset + 2.4, room) * sp; dy++) {
        const y = Math.round(far + toward * dy);
        if (y < 0 || y >= bin.h || lineYs.some((ly) => Math.abs(ly - y) <= unit.lineThick)) continue;
        let r4 = -1;
        for (let x = Math.min(x1, bin.w - 1); x >= Math.max(0, x0); x--) if (bin.data[y * bin.w + x]) {
          r4 = x;
          break;
        }
        if (r4 < 0) continue;
        if (dip < Infinity && r4 - dip >= prom) return true;
        if (r4 > max) max = r4;
        if (max - r4 >= prom) dip = Math.min(dip, r4);
      }
      return false;
    };
    const colRuns = (tip, end) => {
      const gapMin = Math.max(2, sp * 0.15);
      const runMin = Math.max(2, sp * 0.15);
      const lineRow = (y) => lineYs.some((ly) => Math.abs(ly - y) <= unit.lineThick);
      let cols = 0;
      let twos = 0;
      for (let x = Math.round(st.cx + unit.lineThick + sp * 0.1); x <= st.cx + sp * FLAG_COLS_X; x++) {
        if (x < 0 || x >= bin.w) continue;
        let runs = 0;
        let len = 0;
        let gap = gapMin;
        for (let dy = 0; dy < end * sp; dy++) {
          const y = Math.round(tip + toward * dy);
          if (y < 0 || y >= bin.h) continue;
          if (lineRow(y)) {
            if (gap === 0) len++;
            continue;
          }
          if (bin.data[y * bin.w + x]) {
            if (gap >= gapMin) {
              if (len >= runMin) runs++;
              len = 0;
            }
            len++;
            gap = 0;
          } else gap++;
        }
        if (len >= runMin) runs++;
        cols++;
        if (runs >= 2) twos++;
      }
      return cols ? twos / cols : 0;
    };
    const glued = () => {
      const tip = tipOf(far);
      if (Math.abs(tip - far) < sp * FLAG_GLUED) return false;
      const end = Math.min(2.4, Math.abs(hy - tip) / sp - 0.6);
      return end >= 1.6 && colRuns(tip, end) >= FLAG_COLS2;
    };
    const two = twoEnd - (offset + 1) >= 0.6 && frac(offset + 1, twoEnd) >= FLAG_INK2 && (twoPeaks() || hookRuns() >= 2 || colRuns(far + toward * offset * sp, Math.min(2.4, room - offset)) >= FLAG_COLS2) || glued();
    const code = two ? up ? "flag16thUp" : "flag16thDown" : up ? "flag8thUp" : "flag8thDown";
    const h2 = sp * (two ? 2.2 : 1.5);
    const anchor = far + toward * offset * sp;
    const y0 = toward > 0 ? anchor : anchor - h2;
    const fbox = { x: Math.round(st.cx), y: Math.round(y0), w: Math.round(sp * 1.5), h: Math.round(h2) };
    if (avoid.some((m2) => overlapFrac(fbox, m2) > FLAG_AVOID)) continue;
    out.push({ box: fbox, code });
  }
  const flagged = out.slice();
  const touchesLeft = (b) => {
    const x = Math.round(b.cx);
    const y0 = Math.round(b.up ? b.far : b.far - sp * 1.2), y1 = Math.round(b.up ? b.far + sp * 1.2 : b.far);
    for (let y = Math.max(0, y0); y <= Math.min(bin.h - 1, y1); y++) {
      if (lineYs.some((ly) => Math.abs(ly - y) <= unit.lineThick)) continue;
      let xx = x;
      while (xx > x - sp * 0.3 && xx >= 0 && bin.data[y * bin.w + xx]) xx--;
      const edge = xx;
      while (xx >= 0 && edge - xx <= sp * 0.25 && !bin.data[y * bin.w + xx]) xx--;
      if (xx >= 0 && edge - xx <= sp * 0.25) return true;
    }
    return false;
  };
  for (const b of bare) {
    const f2 = flagged.find((q2) => {
      const qUp = q2.code.endsWith("Up");
      if (!(qUp === b.up && b.cx > q2.box.x + sp * 0.5 && b.cx <= q2.box.x + q2.box.w + sp * 0.3 && b.far >= q2.box.y - 2 && b.far <= q2.box.y + q2.box.h + 2)) return false;
      const fromStart = (qUp ? b.far - q2.box.y : q2.box.y + q2.box.h - b.far) / q2.box.h;
      return fromStart >= 0.3 || touchesLeft(b);
    });
    if (f2) out.push({ box: { ...f2.box, x: Math.round(b.cx) }, code: f2.code });
  }
  return out;
}
function ledgerCandidates(bin, groups) {
  const out = [];
  for (const g2 of groups) {
    const left = Math.max(...g2.lines.map((l2) => l2.left));
    const right2 = Math.min(...g2.lines.map((l2) => l2.right));
    const ys = [];
    for (let k2 = 1; k2 <= 4; k2++) ys.push(g2.lines[0].y - k2 * g2.space, g2.lines[4].y + k2 * g2.space);
    for (const fy of ys) {
      const y = Math.round(fy);
      if (y < 1 || y >= bin.h - 1) continue;
      const ink = (x) => !!(bin.data[(y - 1) * bin.w + x] || bin.data[y * bin.w + x] || bin.data[(y + 1) * bin.w + x]);
      let start = -1;
      let miss = 0;
      for (let x = Math.max(0, Math.round(left)); x <= Math.min(bin.w - 1, Math.round(right2)) + 1; x++) {
        const on = x <= Math.min(bin.w - 1, Math.round(right2)) && ink(x);
        if (on) {
          if (start < 0) start = x;
          miss = 0;
          continue;
        }
        if (start >= 0 && ++miss > 1) {
          out.push({ x0: start, x1: x - miss, y: fy });
          start = -1;
          miss = 0;
        }
      }
    }
  }
  return out;
}
function makePitchSteps(groups) {
  const steps = [];
  for (const g2 of groups) {
    const top = g2.lines[0].y;
    const half = g2.space / 2;
    for (let k2 = -10; k2 <= 18; k2++) steps.push({ y: top + k2 * half, line: k2 % 2 === 0 });
  }
  return (y0, y1) => steps.filter((s) => s.y >= y0 && s.y <= y1);
}
function makePitchGrid(groups, unit) {
  const steps = [];
  for (const g2 of groups) {
    const top = g2.lines[0].y;
    const half = g2.space / 2;
    for (let k2 = -10; k2 <= 18; k2++) steps.push(top + k2 * half);
  }
  steps.sort((a, b) => a - b);
  return (y) => {
    let best = null;
    let bd = unit.space * 0.3;
    for (const s of steps) {
      const d2 = Math.abs(s - y);
      if (d2 < bd) {
        bd = d2;
        best = s;
      }
    }
    return best;
  };
}
const SEG_TAGS = ["Staff", "Leger", "Stem", "BarLine", "SysLine", "Tail", "Beam", "Bracket"];
const CLF_W = [0.5, 2.2];
const CLF_H = [0.4, 1.6];
const CLF_P = 0.8;
const BIG_W = 6;
const BIG_H = 9;
const REST_W = [0.9, 1.8];
const REST_H = 0.8;
const REST_RATIO = 1.8;
const REST_FILL = 0.75;
const REST_BEAM_W = 2.4;
const REST_WIDE = 1.7;
const FLAT_BOWL_TOP = 0.45;
const ACCID_TEMPLATE_DIST = 90;
const KEY_ACCID_TEMPLATE_DIST = 100;
const HOLLOW_MASK_SCORE = 0.38;
const HOLLOW_PAIR_SCORE = 0.3;
const HOLLOW_SHAPED_SCORE = 0.22;
const HOLLOW_PAIR_H = [1.6, 2.5];
const HOLLOW_PAIR_W = 2.2;
const CELL_WHITE = 0.9;
const OPEN_CAVITY_PAD = 0.3;
const OPEN_CAVITY_AREA = 0.06;
const OPEN_CAVITY_BAND = 2;
const ARTIC_REACH = 4.5;
const KEY_GAP = 1.5;
const LYRIC_MIN_H = 0.4;
const KEY_GAP_FIRST = 2;
const KEY_OVERLAP = 0.5;
const LATIN_CHAIN = 3;
const PAIR_SCORE_MIN = 0.4;
const UNISON_REACH = 2;
const UNISON_SHORT = 1;
const DUP_HEAD_DY = 0.6;
const DUP_HEAD_DX = 0.5;
const PAIR_FILL_MAX = 0.96;
const SOLID_NEIGHBOR_FILL = 0.9;
const WIDE_BLACK = 1.45;
const TIME_TEMPLATE_DIST = 180;
const TIME_C_WHOLE_DIST = 240;
const KEY_SELF_DIST = 120;
const BEAM_STUMP_H = 0.65;
const BEAM_END_STUMP_H = 1.2;
const NAT_GAP = [0.35, 0.8];
const NUM_DIGITS = [2, 3, 4, 5, 6, 7, 8, 9];
const DEN_DIGITS = [2, 4, 8];
const TIME_NUM_DIST = 230;
const TIME_DEN_DIST = 300;
const FLAG_HEAD_OVERLAP = 0.5;
const HOLLOW_FILL = 0.3;
const HOLLOW_CAVITY = 0.1;
const HOLLOW_SMALL_H = 0.8;
const MERGE_HOLLOW_CAVITY = 0.05;
const VSEG_JOIN_DX = 2;
const VSEG_JOIN_GAP = 1.2;
const KEY_FROM = 2.4;
const KEY_THICK_LINE = 0.22;
const KEY_COARSE_SPACE = 13;
const FLAT_STEM = 1.55;
const KEY_RUN_MAX_H = 5.2;
const KEY_STROKE_H = [2.5, 3.4];
const TIME_SELF_DIST = 215;
const TIME_ALT_DIST = 265;
const NINE_MARGIN = 30;
const HOLLOW_BAND = 3;
const FLAG_INK = 0.15;
const FLAG_X = [0.15, 1];
const FLAG_LEFT = 0.25;
const FLAG_Y = 1.5;
const FLAG_TIP = 0.05;
const FLAG_TIP_Y = 0.6;
const FLAG_INK2 = 0.25;
const FLAG_REACH_LW = 0.15;
const HOOK_PROM = 0.15;
const FLAG_AVOID = 0.2;
const FLAG_TIP_EXT = 2;
const HEAD_INK_H = [0.8, 1.3];
const FLAG_GLUED = 0.5;
const FLAG_COLS2 = 0.25;
const FLAG_COLS_X = 0.6;
const FLAG_BOTH_ENDS = 0.95;
function sharedLegers(hSegs, heads, onGrid, unit) {
  const out = [];
  for (const seg of hSegs) {
    const y = (seg.y0 + seg.y1) / 2;
    if (Math.abs(seg.x1 - seg.x0) <= unit.space * 3) continue;
    if (!onGrid(y)) continue;
    const left = Math.min(seg.x0, seg.x1);
    const right2 = Math.max(seg.x0, seg.x1);
    for (const h2 of heads) {
      const cx2 = h2.box.x + h2.box.w / 2;
      if (cx2 < left || cx2 > right2) continue;
      if (Math.abs(y - (h2.box.y + h2.box.h / 2)) > unit.space * 3.2) continue;
      const half = h2.box.w * 0.8;
      out.push({ x0: Math.max(left, cx2 - half), y0: y, x1: Math.min(right2, cx2 + half), y1: y, lw: seg.lw, maxLw: seg.maxLw });
    }
  }
  return out;
}
function ownLegers(heads, bin, onGrid, unit) {
  const out = [];
  const th = Math.max(1, Math.round(unit.lineThick));
  for (const h2 of heads) {
    const cy2 = h2.box.y + h2.box.h / 2;
    const cx2 = h2.box.x + h2.box.w / 2;
    const half = h2.box.w * 0.6;
    for (const y of [cy2, cy2 - unit.space / 2, cy2 + unit.space / 2]) {
      if (!onGrid(y)) continue;
      let ink = 0;
      let n2 = 0;
      for (let x = Math.round(cx2 - half); x <= Math.round(cx2 + half); x++) {
        if (x < 0 || x >= bin.w) continue;
        n2++;
        for (let d2 = -th; d2 <= th; d2++) {
          const yy = Math.round(y) + d2;
          if (yy >= 0 && yy < bin.h && bin.data[yy * bin.w + x]) {
            ink++;
            break;
          }
        }
      }
      if (!n2 || ink < n2 * 0.6) continue;
      out.push({ x0: cx2 - half, y0: y, x1: cx2 + half, y1: y, lw: th, maxLw: th });
    }
  }
  return out;
}
const STAFF_BAND = 2;
function toBeamShapes(beams) {
  return beams.map((b) => {
    const box = { left: b.box.x, right: b.box.x + b.box.w, top: b.box.y, bottom: b.box.y + b.box.h };
    return { box, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, level: 0 };
  });
}
const BEAM_SNAP = [0.2, 1];
const BEAM_SNAP_END = 0.75;
const BEAM_SNAP_INK = 0.8;
function snapBeamEnds(beams, stems, bin, sp) {
  const yAt = (b, x) => b.x1 === b.x0 ? b.y0 : b.y0 + (b.y1 - b.y0) * (x - b.x0) / (b.x1 - b.x0);
  for (const b of beams) {
    const half = (b.box.bottom - b.box.top) / 2 + 1;
    const inkCol = (x) => {
      const cy2 = yAt(b, x);
      for (let y = Math.round(cy2 - half); y <= Math.round(cy2 + half); y++) if (y >= 0 && y < bin.h && bin.data[y * bin.w + x]) return true;
      return false;
    };
    for (const side of [0, 1]) {
      const end = side === 0 ? b.x0 : b.x1;
      let got = null;
      for (const st of stems) {
        const d2 = side === 0 ? end - st.cx : st.cx - end;
        if (d2 < sp * BEAM_SNAP[0] || d2 > sp * BEAM_SNAP[1]) continue;
        const y2 = yAt(b, st.cx);
        if (Math.min(Math.abs(st.top - y2), Math.abs(st.bottom - y2)) > sp * BEAM_SNAP_END) continue;
        if (!got || Math.abs(st.cx - end) < Math.abs(got.cx - end)) got = st;
      }
      if (!got) continue;
      const xa = Math.round(Math.min(got.cx, end)) + 1;
      const xb = Math.round(Math.max(got.cx, end)) - 1;
      let n2 = 0;
      let k2 = 0;
      for (let x = xa; x <= xb; x++, n2++) if (inkCol(x)) k2++;
      if (n2 && k2 < n2 * BEAM_SNAP_INK) continue;
      const y = yAt(b, got.cx);
      if (side === 0) {
        b.x0 = got.cx;
        b.y0 = y;
        b.box.left = Math.min(b.box.left, got.cx);
      } else {
        b.x1 = got.cx;
        b.y1 = y;
        b.box.right = Math.max(b.box.right, got.cx);
      }
    }
  }
}
const FLAG_REACH = 1.6;
const FLAG_HEAD_BAND = 2.5;
const FLAG_GAP = 2.8;
const SNAP_AMBIG = 0.25;
const THIN_BEAM_H = 0.3;
const FAR_HEAD = 3.75;
const INK_STEM_REACH = [2.5, 7];
async function recognizeRasterPage(pdfPage, OPS, look, index, opts = {}) {
  const raster = await rasterizePage(pdfPage, OPS);
  const blank = buildRasterPage({ index, width: raster?.bin.w ?? 1, height: raster?.bin.h ?? 1, unit: { lineThick: 1, space: 1, height: 4 }, staffLines: [], hSegs: [], vSegs: [] });
  if (!raster) return empty(blank, null, null, opts.carryTime, opts.carryKey);
  const unit = estimateUnit(raster.bin);
  if (!unit) return empty(blank, raster, null, opts.carryTime, opts.carryKey);
  const rowLines = findStaffLines(raster.bin);
  const { lines, groups } = completeStaffLines(raster.bin, rowLines, groupStaves(rowLines));
  if (!groups.length) return empty(blank, raster, unit, opts.carryTime, opts.carryKey);
  for (const g2 of groups) {
    const ls = g2.lines.map((l2) => traceLeft(raster.bin, l2.left, l2.y0, l2.y1)).sort((a, b) => a - b);
    const agreed = ls.find((v2) => ls.filter((u2) => Math.abs(u2 - v2) <= 3).length >= 2);
    const cur = Math.max(...g2.lines.map((l2) => l2.left));
    if (agreed !== void 0 && cur - agreed > unit.space * 2) for (const l2 of g2.lines) l2.left = Math.min(l2.left, agreed);
  }
  if (opts.staffBandOnly) {
    const bin = raster.bin;
    const keep = new Uint8Array(bin.h);
    for (const g2 of groups) {
      const sp = (g2.lines[4].y - g2.lines[0].y) / 4;
      const y0 = Math.max(0, Math.round(g2.lines[0].y - sp * STAFF_BAND));
      const y1 = Math.min(bin.h - 1, Math.round(g2.lines[4].y + sp * STAFF_BAND));
      for (let y = y0; y <= y1; y++) keep[y] = 1;
    }
    for (let y = 0; y < bin.h; y++) if (!keep[y]) bin.data.fill(0, y * bin.w, (y + 1) * bin.w);
  }
  const grouped = new Set(groups.flatMap((g2) => g2.lines.map((l2) => l2.y)));
  const nl = removeStaffLines(raster.bin, lines.map((l2) => l2.y), unit, new Set(lines.map((l2) => l2.y).filter((y) => !grouped.has(y))));
  const staffLines = groups.flatMap((g2) => g2.lines);
  const staffLefts = groups.map((g2) => Math.max(...g2.lines.map((l2) => l2.left)));
  const gridYs = groups.flatMap((g2) => g2.lines.map((l2) => l2.y));
  const staffYs = groups.map((g2) => g2.lines.map((l2) => l2.y).sort((p2, q2) => p2 - q2));
  const groupedLines = new Set(groups.flatMap((g2) => g2.lines));
  const strayLines = lines.filter((l2) => !groupedLines.has(l2)).map((l2) => ({ x0: l2.left, y0: l2.y, x1: l2.right, y1: l2.y, lw: l2.y1 - l2.y0 + 1, maxLw: l2.y1 - l2.y0 + 1 }));
  const prims = findPrimitives(nl, unit, gridYs, staffLefts, raster.faint);
  const staffGeoms = groups.map((g2) => ({ left: Math.max(...g2.lines.map((l2) => l2.left)), right: Math.min(...g2.lines.map((l2) => l2.right)), top: g2.lines[0].y, bottom: g2.lines[4].y }));
  const frames = groups.map((g2, i2) => ({
    top: staffGeoms[i2].top,
    bottom: staffGeoms[i2].bottom,
    // 量的范围取**最长**那条线：倾斜页上有一条线的投影段在半途断了，按最短的量，右边一截只能拿末桶外推
    //（颂赞与尊贵第二行右端实测偏 4.5 像素、外推只给 1，m6 的 A4 读成 G4）。线外的桶量不到，按每桶三条以上取中位兜着
    at: localLineModel(raster.bin, g2.lines.map((l2) => l2.y), Math.min(...g2.lines.map((l2) => l2.left)), Math.max(...g2.lines.map((l2) => l2.right)), unit)
  }));
  const jianpuBands = findJianpuBands(prims.vSegs, staffGeoms, unit);
  completeStaffBars(prims.vSegs, staffGeoms, jianpuBands, unit);
  if (raster.gray) bridgeFaintBars(prims.vSegs, raster.gray, raster.bin.w, groups.map((g2) => g2.lines.map((l2) => l2.y)), unit);
  const jianpuStrips = jianpuBands.map((b) => cutJianpuStrip(raster.bin, b));
  if (jianpuBands.length) {
    for (const b of jianpuBands) eraseInBand([raster.bin, nl], b.box);
    const inJp = (x, y) => jianpuBands.some((b) => x >= b.box.x && x <= b.box.x + b.box.w && y >= b.box.y && y <= b.box.y + b.box.h);
    const outside = (v2) => !(inJp(v2.x0, v2.y0) && inJp(v2.x1, v2.y1));
    prims.vSegs = prims.vSegs.filter(outside);
    prims.hSegs = prims.hSegs.filter(outside);
    prims.beams = prims.beams.filter(outside);
  }
  const blobs = findBlobs(nl, prims, unit, ledgerGrid(gridYs, unit));
  const joinedAbove = (i2) => i2 > 0 && prims.vSegs.some((v2) => {
    const left = Math.max(...groups[i2].lines.map((l2) => l2.left));
    return Math.abs((v2.x0 + v2.x1) / 2 - left) <= unit.space && Math.min(v2.y0, v2.y1) <= groups[i2 - 1].lines[4].y + unit.space * 0.5 && Math.max(v2.y0, v2.y1) >= groups[i2].lines[0].y + unit.space * 0.5;
  });
  const pageRight = Math.max(...groups.flatMap((g2) => g2.lines.map((l2) => l2.right)));
  const harmonyStrips = findHarmonyStrips(
    raster.bin,
    groups.flatMap((g2, i2) => joinedAbove(i2) ? [] : [{
      box: {
        left: Math.max(...g2.lines.map((l2) => l2.left)),
        // 右界取**全页谱线右端的最大值**：网点水印把谱线右段打断，五条线量出来的右端
        // 多数停在 1018~1233（真右端 1360），取最小值就切不到行尾的和弦（《求主同住》缺三个）
        right: pageRight,
        top: g2.lines[0].y
      },
      index: i2,
      // 有简谱行的谱表，和弦字母印在简谱行上方
      ceiling: jianpuBands.find((b) => b.staff === i2)?.box.y
    }]),
    unit
  );
  const harmonies = [];
  const harmonyTexts = [];
  const harmonyIds = /* @__PURE__ */ new Set();
  const harmonyMasks = [];
  {
    const lines2 = /* @__PURE__ */ new Map();
    const lineTexts = /* @__PURE__ */ new Map();
    for (const strip of harmonyStrips) {
      const prev = groups[strip.staff - 1];
      if (prev && strip.box.y < prev.lines[4].y + unit.space * 1.5) continue;
      const chars = opts.harmonyOcr?.get(harmonyKey(strip));
      if (!chars?.length) continue;
      const { chords, texts } = readHarmonyStrip(strip, chars);
      if (!lines2.has(strip.staff)) lines2.set(strip.staff, []), lineTexts.set(strip.staff, []);
      lines2.get(strip.staff).push({ strip, chords });
      lineTexts.get(strip.staff).push(...texts);
    }
    for (const [staff, rows] of lines2) {
      const r4 = harmonyLine(rows.flatMap((x) => x.chords), lineTexts.get(staff));
      harmonyTexts.push(...r4.texts);
      if (!r4.chords.length) continue;
      harmonies.push(...r4.chords);
      for (const x of rows) if (x.chords.length) harmonyMasks.push(x.strip.box);
    }
    const pad = unit.space * 0.5;
    for (const c2 of blobs) {
      const b = c2.bbox;
      const cx2 = b.x + b.w / 2;
      const cy2 = b.y + b.h / 2;
      if (harmonyMasks.some((m2) => cx2 > m2.x - pad && cx2 < m2.x + m2.w + pad && cy2 > m2.y - pad && cy2 < m2.y + m2.h + pad))
        harmonyIds.add(c2.id);
    }
  }
  const cmap = traceContours(nl, unit, groups.map((g2) => ({
    top: g2.lines[0].y,
    bottom: g2.lines[4].y,
    left: Math.max(...g2.lines.map((l2) => l2.left)),
    right: Math.min(...g2.lines.map((l2) => l2.right))
  })));
  const ledger = new ContourLedger(cmap);
  for (const b of prims.beams) {
    const x0 = Math.min(b.x0, b.x1);
    const x1 = Math.max(b.x0, b.x1);
    const half2 = Math.max(1, b.lw / 2 + 2);
    const steps = Math.max(1, Math.round((x1 - x0) / Math.max(1, unit.space / 2)));
    for (let i2 = 0; i2 <= steps; i2++) {
      const t2 = i2 / steps;
      const x = x0 + (x1 - x0) * t2;
      const cy2 = b.y0 + (b.y1 - b.y0) * t2;
      ledger.claim({ x, y: cy2 - half2, w: Math.max(2, (x1 - x0) / steps), h: half2 * 2 }, "beam");
    }
  }
  const onGrid = ledgerGrid(gridYs, unit);
  const inBand = (y) => groups.some((g2) => y > g2.lines[0].y - unit.space * HOLLOW_BAND && y < g2.lines[4].y + unit.space * HOLLOW_BAND);
  const offStaff = (y) => !groups.some((g2) => y > g2.lines[0].y - unit.space && y < g2.lines[4].y + unit.space);
  const matchHollow = look.templates ? (box) => matchTemplate(binSig(nl, box), box.w / unit.space, box.h / unit.space, look.templates) : null;
  const besideStem = (b) => {
    const stemAt = (x) => prims.vSegs.some((v2) => {
      const vx = (v2.x0 + v2.x1) / 2;
      return Math.abs(vx - x) <= unit.space * 0.4 && Math.min(v2.y0, v2.y1) <= b.y + b.h + unit.space * 0.5 && Math.max(v2.y0, v2.y1) >= b.y - unit.space * 0.5;
    });
    return stemAt(b.x) || stemAt(b.x + b.w);
  };
  const restIds = /* @__PURE__ */ new Set();
  const restSyms = [];
  for (const c2 of blobs) {
    const b = c2.bbox;
    const w = b.w / unit.space;
    const h2 = b.h / unit.space;
    const hRest = Math.max(0.1, h2 - unit.lineThick / unit.space);
    if (w < REST_W[0] || w > REST_W[1] || hRest < 0.3 || hRest > REST_H) continue;
    if (w < hRest * REST_RATIO) continue;
    if (c2.area / Math.max(1, b.w * b.h) < REST_FILL) continue;
    if (!nearRestLine(b, staffLines, unit)) continue;
    if (besideStem(b)) continue;
    restIds.add(c2.id);
    restSyms.push({ box: b, code: restKind(b, staffLines, unit) });
  }
  for (const q2 of prims.beams) {
    const b = q2.box;
    const w = b.w / unit.space;
    const hRest = Math.max(0.1, b.h / unit.space - unit.lineThick / unit.space);
    if (w < REST_W[0] || w > REST_BEAM_W || hRest < 0.3 || hRest > REST_H) continue;
    if (Math.abs(q2.y1 - q2.y0) > unit.lineThick) continue;
    if (besideStem(b)) continue;
    if (nearStaffStart(b, groups, staffLefts, unit)) continue;
    if (restSyms.some((r4) => overlapFrac(r4.box, b) > 0.3)) continue;
    const tol = unit.lineThick + 2;
    const grp = groups.find((g2) => b.y + b.h / 2 > g2.lines[0].y && b.y + b.h / 2 < g2.lines[4].y);
    if (!grp) continue;
    const low = grp.lines.slice(3);
    const hang = low.some((l2) => Math.abs(b.y - l2.y) <= tol);
    const sit = low.some((l2) => Math.abs(b.y + b.h - l2.y) <= tol);
    if (!hang && !sit) continue;
    let fill = 0;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) fill += raster.bin.data[y * raster.bin.w + x];
    if (fill / Math.max(1, b.w * b.h) < REST_FILL) continue;
    restSyms.push({ box: b, code: hang || w >= REST_WIDE ? "restHBar" : "restHalf" });
  }
  for (const c2 of blobs) {
    if (restIds.has(c2.id)) continue;
    const b = c2.bbox;
    if (b.w > unit.space * 0.8 || b.h > unit.space * 1 || b.h < unit.space * 0.4) continue;
    if (!inBand(b.y + b.h / 2)) continue;
    const full = fillAround(nl, b, unit);
    if (!full || full.box.h < b.h * 1.8) continue;
    if (!isEighthRest(nl, full.box, full.area, unit)) continue;
    restIds.add(c2.id);
    restSyms.push({ box: full.box, code: "rest8th" });
  }
  for (const c2 of cmap.contours) {
    if (ledger.claimsOf(c2.id).length) continue;
    const b = c2.bbox;
    if (b.w < unit.space * 0.5 || b.w > unit.space * 1.2 || b.h < unit.space * 0.3 || b.h > unit.space * 1) continue;
    if (!inBand(b.y + b.h / 2)) continue;
    const gapMax = unit.lineThick + 3;
    const d2 = cmap.contours.find((o) => o !== c2 && !ledger.claimsOf(o.id).length && o.bbox.y >= b.y + b.h * 0.5 && o.bbox.y - (b.y + b.h) <= gapMax && o.bbox.y + o.bbox.h > b.y + b.h + unit.lineThick && o.bbox.x < b.x + b.w && b.x < o.bbox.x + o.bbox.w && o.bbox.w <= unit.space * 1.2);
    if (!d2) continue;
    const x0 = Math.min(b.x, d2.bbox.x);
    const box = { x: x0, y: b.y, w: Math.max(b.x + b.w, d2.bbox.x + d2.bbox.w) - x0, h: d2.bbox.y + d2.bbox.h - b.y };
    if (!isEighthRest(nl, box, c2.area + d2.area, unit, EIGHTH_REST_H_PIECES)) continue;
    if (restSyms.some((r4) => overlapFrac(r4.box, box) > 0.3)) continue;
    restSyms.push({ box, code: "rest8th" });
  }
  for (const c2 of cmap.contours) {
    if (ledger.claimsOf(c2.id).length) continue;
    const b = c2.bbox;
    if (b.w < unit.space * 0.35 || b.w > unit.space * 0.8 || b.h < unit.space * 0.3 || b.h > unit.space * 0.7) continue;
    if (!inBand(b.y + b.h / 2)) continue;
    const d2 = cmap.contours.find((o) => o !== c2 && !ledger.claimsOf(o.id).length && o.bbox.x >= b.x + b.w * 0.3 && o.bbox.x - (b.x + b.w) <= 3 && Math.abs(o.bbox.y - b.y) <= unit.space * 0.3 && o.bbox.w <= unit.space * 0.8 && o.bbox.h >= unit.space * 1.1 && o.bbox.h <= unit.space * 2.4);
    if (!d2) continue;
    const x0 = Math.min(b.x, d2.bbox.x), y0 = Math.min(b.y, d2.bbox.y);
    const box = { x: x0, y: y0, w: Math.max(b.x + b.w, d2.bbox.x + d2.bbox.w) - x0, h: Math.max(b.y + b.h, d2.bbox.y + d2.bbox.h) - y0 };
    if (!isEighthRest(nl, box, c2.area + d2.area, unit, EIGHTH_REST_H_PIECES)) continue;
    if (restSyms.some((r4) => overlapFrac(r4.box, box) > 0.3)) continue;
    restSyms.push({ box, code: "rest8th" });
  }
  const onBeamLine = (b, ext = 0) => {
    const cxb = b.x + b.w / 2;
    const cyb = b.y + b.h / 2;
    return prims.beams.some((q2) => {
      if (cxb < Math.min(q2.x0, q2.x1) - ext || cxb > Math.max(q2.x0, q2.x1) + ext) return false;
      const t2 = q2.x1 === q2.x0 ? 0 : (cxb - q2.x0) / (q2.x1 - q2.x0);
      return Math.abs(cyb - (q2.y0 + (q2.y1 - q2.y0) * t2)) <= Math.max(q2.lw, unit.space * 0.25);
    });
  };
  const atBeamEnd = (b, others) => prims.beams.some((q2) => {
    if (q2.lw < unit.space * 0.35 || b.y >= q2.box.y + q2.box.h || b.y + b.h <= q2.box.y) return false;
    const hit = (x) => x >= b.x - 2 && x <= b.x + b.w + 2;
    const far = hit(q2.x0) ? { x: q2.x1, y: q2.y1 } : hit(q2.x1) ? { x: q2.x0, y: q2.y0 } : null;
    if (!far) return false;
    return !others.some((o) => o !== b && o.h >= unit.space * 0.8 && far.x >= o.x - 2 && far.x <= o.x + o.w + 2 && far.y >= o.y - q2.lw && far.y <= o.y + o.h + q2.lw);
  });
  const inBeamBody = (b) => {
    const cxb = b.x + b.w / 2;
    return prims.beams.some((q2) => {
      if (q2.lw < unit.space * 0.35 || cxb < Math.min(q2.x0, q2.x1) || cxb > Math.max(q2.x0, q2.x1)) return false;
      const t2 = q2.x1 === q2.x0 ? 0 : (cxb - q2.x0) / (q2.x1 - q2.x0);
      const yc = q2.y0 + (q2.y1 - q2.y0) * t2;
      const ov = Math.min(b.y + b.h, yc + q2.lw / 2 + 1) - Math.max(b.y, yc - q2.lw / 2 - 1);
      return ov >= b.h * 0.6;
    });
  };
  const beamStump = (b, others) => inBeamBody(b) || b.h <= unit.space * BEAM_END_STUMP_H && atBeamEnd(b, others) && onBeamLine(b, unit.space);
  const rawHeads = findRasterHeads(nl, blobs.filter((c2) => !restIds.has(c2.id) && !harmonyIds.has(c2.id)), prims.vSegs, unit, onGrid, inBand, matchHollow, offStaff);
  const heads = rawHeads.filter((hd) => {
    if (hd.code !== "noteheadBlack") return true;
    if (beamStump(hd.box, rawHeads.map((o) => o.box))) return false;
    return hd.box.h >= unit.space * BEAM_STUMP_H || !onBeamLine(hd.box);
  });
  const claimed = /* @__PURE__ */ new Set([...heads.map((h2) => h2.comp.id), ...restIds, ...harmonyIds]);
  const rawHoles = findHoles(raster.bin, Math.max(4, Math.round(unit.space * unit.space * 0.06)));
  const onLineOrGrid = (y) => onGrid(y) || gridYs.some((ly) => Math.abs(ly - y) <= unit.space * 0.25);
  const half = unit.lineThick / 2;
  const cellLike = (b) => {
    if (b.h < unit.space * 0.6 || !onLineOrGrid(b.y - half - 0.5) || !onLineOrGrid(b.y + b.h + half - 0.5)) return false;
    let white = 0;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (!raster.bin.data[y * raster.bin.w + x]) white++;
    return white >= b.w * b.h * CELL_WHITE;
  };
  const cells = rawHoles.filter((b) => b.w >= unit.space * 0.8 && b.w <= unit.space * 1.4 && cellLike(b));
  const stackedCell = (b) => cells.includes(b) && cells.some((o) => {
    if (o === b) return false;
    const ov = Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x);
    const gap = o.y > b.y ? o.y - (b.y + b.h) : b.y - (o.y + o.h);
    return ov >= Math.min(b.w, o.w) * 0.6 && gap >= 0 && gap <= unit.lineThick + 2;
  });
  const holes = mergeHoles(rawHoles.filter((b) => !stackedCell(b)), unit, onLineOrGrid);
  const takenBoxes = [...heads.map((h2) => h2.box), ...harmonyMasks];
  const barSegs = prims.vSegs.filter(
    (q2) => staffGeoms.some((g2) => Math.abs(Math.min(q2.y0, q2.y1) - g2.top) < unit.space * 0.4 && Math.abs(Math.max(q2.y0, q2.y1) - g2.bottom) < unit.space * 0.4)
  );
  const stacked = hollowHeadsFromHoles(nl, holes, unit, prims.vSegs, inBand, takenBoxes, barSegs);
  const lineYs = lines.map((l2) => l2.y);
  const hollowSamples = [...heads.map((h2) => ({ box: h2.box, code: h2.code })), ...stacked].filter((s0) => !s0.weak);
  const hollowMasks = buildHollowMasks(raster.bin, hollowSamples, unit, lineYs);
  stacked.push(...hollowHeadsByPitch(raster.bin, nl, rawHoles, holes, hollowMasks, unit, makePitchSteps(groups), prims.vSegs, inBand, takenBoxes));
  const inkStems = [];
  stacked.push(...hollowHeadsOnLedgers(raster.bin, nl, rawHoles, hollowMasks, unit, ledgerCandidates(raster.bin, groups), makePitchSteps(groups), prims.vSegs, takenBoxes, inkStems));
  const masks = buildHeadMasks(raster.bin, [...heads.map((h2) => ({ box: h2.box, code: h2.code })), ...stacked], unit, lines.map((l2) => l2.y));
  const noBeam = blobImage(nl, prims, unit, onGrid);
  const masksNB = buildHeadMasks(noBeam, [...heads.map((h2) => ({ box: h2.box, code: h2.code })), ...stacked], unit, lines.map((l2) => l2.y));
  const pitchGrid = makePitchGrid(groups, unit);
  const onLineY = (y) => lines.some((l2) => Math.abs(l2.y - y) <= unit.space * 0.25);
  const split = [];
  const splitIds = /* @__PURE__ */ new Set();
  const dropHead = /* @__PURE__ */ new Set();
  const restTpl = (look.templates ?? []).filter((t2) => t2.smufl === "restQuarter" || t2.smufl === "rest8th");
  if (masks.length) {
    for (const c2 of blobs) {
      if (claimed.has(c2.id)) continue;
      let parts = splitHeadCluster(noBeam, c2.bbox, c2.area, masksNB.length ? masksNB : masks, unit, pitchGrid, onLineY);
      if (!parts.length && isStackedPair(c2.bbox, c2.area, unit)) {
        const p2 = splitHeadCluster(noBeam, c2.bbox, c2.area, masksNB.length ? masksNB : masks, unit, pitchGrid, onLineY, false, void 0, 2, PAIR_SCORE_MIN, PAIR_FILL_MAX);
        if (p2.length === 2 && Math.abs(p2[0].y - p2[1].y) >= unit.space * 0.8) parts = p2;
      }
      if (!parts.length) continue;
      claimed.add(c2.id);
      splitIds.add(c2.id);
      for (const b of parts) split.push({ box: b, code: "noteheadBlack" });
    }
    for (const h2 of heads) {
      const b = h2.comp.bbox;
      if (b.h < unit.space * 1.5 && b.w < unit.space * 1.9) continue;
      const parts = splitHeadCluster(noBeam, b, h2.comp.area, masksNB.length ? masksNB : masks, unit, pitchGrid, onLineY);
      if (parts.length < 2) continue;
      dropHead.add(h2.comp.id);
      for (const p2 of parts) split.push({ box: p2, code: h2.code === "noteheadBlack" ? "noteheadBlack" : h2.code });
    }
  }
  {
    const headBoxes2 = [...heads.filter((h2) => !dropHead.has(h2.comp.id)).map((h2) => h2.box), ...stacked.map((q2) => q2.box), ...split.map((q2) => q2.box), ...restSyms.map((q2) => q2.box)];
    const free = blobs.filter((c2) => !claimed.has(c2.id) && inBand(c2.bbox.y + c2.bbox.h / 2)).map((c2) => ({ id: c2.id, box: c2.bbox, area: c2.area }));
    const isBar = (q2) => staffGeoms.some((g2) => Math.abs(Math.min(q2.y0, q2.y1) - g2.top) < unit.space * 0.4 && Math.abs(Math.max(q2.y0, q2.y1) - g2.bottom) < unit.space * 0.4);
    const probes = probeBareStems(prims.vSegs, headBoxes2, free, unit, isBar);
    const halves = [...heads.map((h2) => ({ box: h2.box, code: h2.code })), ...stacked].filter((q2) => q2.code === "noteheadHalf" && !q2.weak);
    const med2 = (xs) => xs.sort((p2, q2) => p2 - q2)[xs.length >> 1];
    const size = halves.length ? { w: med2(halves.map((q2) => q2.box.w)), h: med2(halves.map((q2) => q2.box.h)) } : { w: Math.round(unit.space * 1.3), h: Math.round(unit.space * 1.1) };
    for (const hd of headsOnBareStems(probes, unit, pitchGrid, size, raster.bin, (y) => gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick))) {
      for (const id of hd.ids) claimed.add(id);
      stacked.push(hd);
    }
    const known = [...headBoxes2, ...stacked.map((q2) => q2.box)];
    for (const hd of headsBetweenStemPairs(prims.vSegs, known, unit, pitchGrid, size, raster.bin, (y) => gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick), isBar)) stacked.push(hd);
  }
  {
    const onStaffLine = (y) => gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick / 2);
    const arch = (b) => archCavity(raster.bin, b, onStaffLine);
    const tol = unit.space * 0.2;
    const byBeam = (b) => prims.beams.some((q2) => {
      const ov = Math.min(b.x + b.w, q2.box.x + q2.box.w) - Math.max(b.x, q2.box.x);
      return ov >= b.w * 0.5 && q2.box.y < b.y + b.h + tol && q2.box.y + q2.box.h > b.y - tol;
    }) && stemInBox(b);
    const stemInBox = (b) => {
      const ink = (x, y) => y >= 0 && y < nl.h && !!nl.data[y * nl.w + x];
      const my = Math.round(b.y + b.h / 2);
      for (let x = Math.max(0, b.x); x < Math.min(nl.w, b.x + b.w); x++) {
        let t2 = my;
        let d2 = my;
        if (!ink(x, my)) continue;
        while (ink(x, t2 - 1)) t2--;
        while (ink(x, d2 + 1)) d2++;
        if (b.y - t2 >= unit.space || d2 - (b.y + b.h) >= unit.space) return true;
      }
      return false;
    };
    const fake = (q2) => q2.code === "noteheadHalf" && arch(q2.box) || q2.code === "noteheadWhole" && byBeam(q2.box);
    for (const h2 of heads) if (!dropHead.has(h2.comp.id) && fake(h2)) dropHead.add(h2.comp.id);
    for (let i2 = stacked.length - 1; i2 >= 0; i2--) if (fake(stacked[i2])) stacked.splice(i2, 1);
    for (const h2 of heads) {
      if (dropHead.has(h2.comp.id) || !(h2.code === "noteheadWhole" || h2.code === "noteheadBlack" && h2.box.w >= unit.space * WIDE_BLACK)) continue;
      const b = h2.box;
      const ink = (x, y) => y >= 0 && y < nl.h && !!nl.data[y * nl.w + x];
      const my = Math.round(b.y + b.h / 2);
      let sx = -1;
      for (let x = Math.max(0, b.x + Math.round(b.w * 0.2)); x < Math.min(nl.w, b.x + b.w - Math.round(b.w * 0.2)); x++) {
        if (!ink(x, my)) continue;
        let t2 = my;
        let d2 = my;
        while (ink(x, t2 - 1)) t2--;
        while (ink(x, d2 + 1)) d2++;
        if (b.y - t2 >= unit.space * 1.5 || d2 - (b.y + b.h) >= unit.space * 1.5) {
          sx = x;
          break;
        }
      }
      if (sx < 0) continue;
      let x0 = b.x;
      let x1 = b.x + b.w;
      if (sx >= b.x + b.w / 2) {
        let r4 = sx;
        while (ink(r4 + 1, my) && r4 + 1 < x1 && r4 - sx < 3) r4++;
        x1 = r4 + 1;
      } else x0 = sx;
      const nb = { x: x0, y: b.y, w: x1 - x0, h: b.h };
      if (nb.w >= unit.space * 1.4 || nb.w < unit.space * 0.9) continue;
      let on = 0;
      for (let y = nb.y; y < nb.y + nb.h; y++) for (let x = nb.x; x < nb.x + nb.w; x++) if (raster.bin.data[y * raster.bin.w + x]) on++;
      h2.box = nb;
      h2.code = on / (nb.w * nb.h) >= 0.62 ? "noteheadBlack" : "noteheadHalf";
    }
    const shortBeam = (b) => {
      if (b.h > unit.space * 0.8) return false;
      const tol2 = unit.space * 0.25;
      const dirAt = (x) => {
        for (const v2 of prims.vSegs) {
          const vx = (v2.x0 + v2.x1) / 2;
          if (Math.abs(vx - x) > tol2) continue;
          const y0 = Math.min(v2.y0, v2.y1);
          const y1 = Math.max(v2.y0, v2.y1);
          if (y0 >= b.y - tol2 && y0 <= b.y + b.h + tol2 && y1 - (b.y + b.h) >= unit.space * 1.5) return 1;
          if (y1 >= b.y - tol2 && y1 <= b.y + b.h + tol2 && b.y - y0 >= unit.space * 1.5) return -1;
        }
        return 0;
      };
      const l2 = dirAt(b.x);
      return l2 !== 0 && l2 === dirAt(b.x + b.w);
    };
    for (const h2 of heads) if (h2.code === "noteheadBlack" && !dropHead.has(h2.comp.id) && shortBeam(h2.box)) dropHead.add(h2.comp.id);
    const blackBoxes = [...heads.map((h2) => h2.box), ...split.map((q2) => q2.box)];
    for (let i2 = split.length - 1; i2 >= 0; i2--) if (beamStump(split[i2].box, blackBoxes)) split.splice(i2, 1);
    const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const solids = [...heads.filter((h2) => h2.code === "noteheadBlack" && !dropHead.has(h2.comp.id)).map((h2) => h2.box), ...split.map((q2) => q2.box)];
    for (let i2 = stacked.length - 1; i2 >= 0; i2--) {
      const q2 = stacked[i2];
      if (q2.code !== "noteheadHalf" && q2.code !== "noteheadWhole") continue;
      if (solids.reduce((a, b) => a + inter(q2.box, b), 0) >= q2.box.w * q2.box.h * 0.3) stacked.splice(i2, 1);
    }
    for (let i2 = stacked.length - 1; i2 >= 0; i2--) if (stacked[i2].code === "noteheadBlack" && inBeamBody(stacked[i2].box)) stacked.splice(i2, 1);
  }
  {
    const solidBoxes = [...heads.filter((h2) => h2.code === "noteheadBlack" && !dropHead.has(h2.comp.id)).map((h2) => h2.box), ...split.map((q2) => q2.box), ...stacked.filter((q2) => q2.code === "noteheadBlack").map((q2) => q2.box)];
    const allBoxes = () => [...heads.filter((h2) => !dropHead.has(h2.comp.id)).map((h2) => h2.box), ...stacked.map((q2) => q2.box), ...split.map((q2) => q2.box)];
    const ink = (x, y) => x >= 0 && x < raster.bin.w && y >= 0 && y < raster.bin.h && !!raster.bin.data[y * raster.bin.w + x];
    const onLine = (y) => gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick);
    const bw = solidBoxes.length ? solidBoxes.map((b) => b.w).sort((p2, q2) => p2 - q2)[solidBoxes.length >> 1] : unit.space * 1.25;
    const bh = solidBoxes.length ? solidBoxes.map((b) => b.h).sort((p2, q2) => p2 - q2)[solidBoxes.length >> 1] : unit.space;
    const hollows = [...heads.filter((h2) => h2.code === "noteheadHalf" && !dropHead.has(h2.comp.id)).map((h2) => h2.box), ...stacked.filter((q2) => q2.code === "noteheadHalf").map((q2) => q2.box)];
    for (const hb of hollows) {
      const cx2 = hb.x + hb.w / 2;
      const cy2 = hb.y + hb.h / 2;
      for (const dir of [-1, 1]) {
        const ny = cy2 + dir * unit.space;
        const win = { x: Math.round(cx2 - bw * 0.35), y: Math.round(ny - bh * 0.35), w: Math.round(bw * 0.7), h: Math.round(bh * 0.7) };
        if (allBoxes().some((b) => Math.abs(b.x + b.w / 2 - cx2) < bw * 0.5 && Math.abs(b.y + b.h / 2 - ny) < bh * 0.5)) continue;
        let on = 0;
        for (let y = win.y; y < win.y + win.h; y++) for (let x = win.x; x < win.x + win.w; x++) if (ink(x, y)) on++;
        if (on < win.w * win.h * SOLID_NEIGHBOR_FILL) continue;
        let side = 0;
        let rows = 0;
        for (let y = win.y; y < win.y + win.h; y++) {
          if (onLine(y)) continue;
          rows++;
          if (ink(Math.round(cx2 - bw / 2 - unit.space * 0.35), y) || ink(Math.round(cx2 + bw / 2 + unit.space * 0.35), y)) side++;
        }
        if (!rows || side > rows * 0.2) continue;
        split.push({ box: { x: Math.round(cx2 - bw / 2), y: Math.round(ny - bh / 2), w: Math.round(bw), h: Math.round(bh) }, code: "noteheadBlack" });
      }
    }
  }
  const syms = [
    ...heads.filter((h2) => !dropHead.has(h2.comp.id)).map((h2) => ({ box: h2.box, code: h2.code })),
    ...stacked,
    ...split,
    ...restSyms
  ];
  for (const h2 of heads) ledger.claim(h2.box, `head:${h2.code}`);
  for (const s0 of stacked) ledger.claim(s0.box, `stack:${s0.code}`);
  for (const s0 of split) ledger.claim(s0.box, "cluster:noteheadBlack");
  for (const s0 of restSyms) ledger.claim(s0.box, "rest:restHBar");
  const dictClaimed = /* @__PURE__ */ new Set();
  const metIds = /* @__PURE__ */ new Set();
  for (const c2 of blobs) {
    if (claimed.has(c2.id)) continue;
    const code = look.lookup(binSig(nl, c2.bbox), c2.bbox.w / unit.space, c2.bbox.h / unit.space);
    if (!code) continue;
    if (code.startsWith("metNote")) metIds.add(c2.id);
    if (code.startsWith("artic") && !groups.some((g2) => c2.bbox.y + c2.bbox.h > g2.lines[0].y - unit.space * ARTIC_REACH && c2.bbox.y < g2.lines[4].y + unit.space * ARTIC_REACH)) continue;
    dictClaimed.add(c2.id);
    if (isBarRest(code) && (!nearRestLine(c2.bbox, staffLines, unit) || besideStem(c2.bbox))) continue;
    syms.push({ box: c2.bbox, code });
    ledger.claim(c2.bbox, `dict:${code}`);
  }
  const bootStaves = groups.map((g2) => ({
    left: Math.max(...g2.lines.map((l2) => l2.left)),
    right: Math.min(...g2.lines.map((l2) => l2.right)),
    lineYs: g2.lines.map((l2) => l2.y)
  }));
  const boxes = blobs.map((c2) => ({ x: c2.bbox.x, y: c2.bbox.y, w: c2.bbox.w, h: c2.bbox.h }));
  const keyRun = (b) => b.h <= unit.space * KEY_RUN_MAX_H && verticalStrokes(raster.bin, b, unit.space * KEY_STROKE_H[0]).filter((s0) => s0.h <= unit.space * KEY_STROKE_H[1]).length >= 3;
  for (const h2 of bootstrapClefs(boxes, bootStaves, unit.space, look.templates ? { tpl: look.templates, sigOf: (b) => binSig(nl, b) } : void 0, keyRun)) {
    const b = h2.box ?? blobs[h2.index].bbox;
    for (let i2 = syms.length - 1; i2 >= 0; i2--) {
      const s0 = syms[i2].box;
      const cx0 = s0.x + s0.w / 2;
      const cy0 = s0.y + s0.h / 2;
      if (cx0 >= b.x - 1 && cx0 <= b.x + b.w + 1 && cy0 >= b.y - 1 && cy0 <= b.y + b.h + 1) syms.splice(i2, 1);
    }
    syms.push({ box: b, code: h2.code });
    ledger.claim(b, `clef:${h2.code}`);
  }
  for (const g2 of groups) {
    const sp = unit.space;
    const left = Math.max(...g2.lines.map((l2) => l2.left));
    const top = g2.lines[0].y;
    const bot = g2.lines[4].y;
    if (syms.some((s0) => isClef(s0.code) && s0.box.y < bot && s0.box.y + s0.box.h > top && s0.box.x < left + sp * 4)) continue;
    const y0 = Math.max(0, Math.round(top - sp * 1.5));
    const y1 = Math.min(nl.h - 1, Math.round(bot + sp * 1.5));
    const lineRow = /* @__PURE__ */ new Set();
    for (let y = y0; y <= y1; y++) {
      let run = 0;
      for (let x2 = Math.round(left); x2 < Math.min(nl.w, left + sp * 10); x2++) {
        run = nl.data[y * nl.w + x2] ? run + 1 : 0;
        if (run > sp * 3) {
          for (let d2 = -1; d2 <= 1; d2++) lineRow.add(y + d2);
          break;
        }
      }
    }
    const colInk = (x2) => {
      let a = -1, b = -1, n2 = 0;
      for (let y = y0; y <= y1; y++)
        if (nl.data[y * nl.w + x2] && !lineRow.has(y)) {
          if (a < 0) a = y;
          b = y;
          if (y >= top - sp * 0.5 && y <= bot + sp * 0.5) n2++;
        }
      return n2 < sp * 0.35 ? null : [a, b];
    };
    let x = Math.round(left + sp * CLEF_WIN_FROM);
    const xEnd = Math.round(left + sp * 1.5);
    while (x < xEnd && !colInk(x)) x++;
    if (x >= xEnd) continue;
    const xs = x;
    let lastInk = x;
    let ya = Infinity, yb = -Infinity;
    for (; x < Math.min(nl.w, left + sp * 4); x++) {
      const c2 = colInk(x);
      if (c2) {
        lastInk = x;
        ya = Math.min(ya, c2[0]);
        yb = Math.max(yb, c2[1]);
      } else if (x - lastInk > sp * 0.4) break;
    }
    const box = { x: xs, y: ya, w: lastInk - xs + 1, h: yb - ya + 1 };
    if (box.h < sp * 1.8 || box.w < sp * 0.8 || box.w > sp * 3.2) continue;
    const code = box.h >= sp * 3.8 ? "gClef" : "fClef";
    for (let i2 = syms.length - 1; i2 >= 0; i2--) {
      const s1 = syms[i2].box;
      const cx0 = s1.x + s1.w / 2;
      const cy0 = s1.y + s1.h / 2;
      if (cx0 >= box.x - 1 && cx0 <= box.x + box.w + 1 && cy0 >= box.y - 1 && cy0 <= box.y + box.h + 1) syms.splice(i2, 1);
    }
    syms.push({ box, code });
    ledger.claim(box, `clef:${code}`);
  }
  for (const g2 of groups) {
    const sp = unit.space;
    const left = Math.max(...g2.lines.map((l2) => l2.left));
    const s0 = syms.find((q2) => isClef(q2.code) && q2.box.y < g2.lines[4].y && q2.box.y + q2.box.h > g2.lines[0].y && q2.box.x < left + sp * 4);
    if (s0 && s0.code !== "gClef" && s0.code !== "fClef") continue;
    const bin0 = raster.bin;
    const base = pastSysLine(bin0, g2.lines.map((l2) => l2.y), left, sp);
    const xa = Math.max(0, Math.round(base + sp * CLEF_INK_X[0]));
    const xb = Math.min(bin0.w - 1, Math.round(base + sp * CLEF_INK_X[1]));
    const ys = localLineModel(bin0, g2.lines.map((l2) => l2.y), left, Math.min(bin0.w - 1, left + sp * 12), unit)((xa + xb) / 2);
    const rowInk = (y) => {
      if (y < 0 || y >= bin0.h) return false;
      for (let x = xa; x <= xb; x++) if (bin0.data[y * bin0.w + x]) return true;
      return false;
    };
    const frac = (ya, yb) => {
      let n2 = 0;
      let hit = 0;
      for (let y = Math.round(ya); y <= Math.round(yb); y++) {
        n2++;
        if (rowInk(y)) hit++;
      }
      return n2 ? hit / n2 : 0;
    };
    const above = frac(ys[0] - sp * CLEF_INK_ABOVE[0], ys[0] - sp * CLEF_INK_ABOVE[1]);
    const low = frac(ys[3] + sp * CLEF_INK_LOW[0], ys[4] - sp * CLEF_INK_LOW[1]);
    const code = above >= CLEF_INK_FULL && low >= CLEF_INK_FULL ? "gClef" : above <= CLEF_INK_NONE && low <= CLEF_INK_LOW_NONE ? "fClef" : null;
    if (!code || code === s0?.code) continue;
    if (!s0) {
      const upper = Math.min(frac(ys[0] + sp * CLEF_INK_LOW[0], ys[1] - sp * CLEF_INK_LOW[1]), frac(ys[1] + sp * CLEF_INK_LOW[0], ys[2] - sp * CLEF_INK_LOW[1]));
      if (code === "fClef" && upper < CLEF_INK_FULL) continue;
      const top = code === "gClef" ? ys[0] - sp * 1.5 : ys[0] - sp * 0.3;
      const bottom2 = code === "gClef" ? ys[4] + sp * 1.5 : ys[4];
      const box = { x: xa, y: Math.round(top), w: xb - xa, h: Math.round(bottom2 - top) };
      syms.push({ box, code });
      ledger.claim(box, `clef:${code}`);
      continue;
    }
    s0.code = code;
    if (code === "gClef") {
      let ya = Math.round(ys[0]);
      while (ya > ys[0] - sp * 2 && (rowInk(ya - 1) || rowInk(ya - 2))) ya--;
      let yb = Math.round(ys[4]);
      while (yb < ys[4] + sp * 2 && (rowInk(yb + 1) || rowInk(yb + 2))) yb++;
      s0.box = { x: s0.box.x, y: Math.min(s0.box.y, ya), w: s0.box.w, h: Math.max(s0.box.y + s0.box.h, yb) - Math.min(s0.box.y, ya) };
    } else {
      const ya = Math.max(s0.box.y, Math.round(ys[0] - sp * 0.3));
      const yb = Math.min(s0.box.y + s0.box.h, Math.round(ys[4]));
      s0.box = { x: s0.box.x, y: ya, w: s0.box.w, h: yb - ya };
    }
    for (let i2 = syms.length - 1; i2 >= 0; i2--) {
      if (syms[i2] === s0) continue;
      const s1 = syms[i2].box;
      const cx0 = s1.x + s1.w / 2;
      const cy0 = s1.y + s1.h / 2;
      if (cx0 >= s0.box.x - 1 && cx0 <= s0.box.x + s0.box.w + 1 && cy0 >= s0.box.y - 1 && cy0 <= s0.box.y + s0.box.h + 1) syms.splice(i2, 1);
    }
    ledger.claim(s0.box, `clef:${code}`);
  }
  for (const g2 of groups) {
    const sp = unit.space;
    const left = Math.max(...g2.lines.map((l2) => l2.left));
    const s0 = syms.find((q2) => q2.code === "gClef" && q2.box.y < g2.lines[4].y && q2.box.y + q2.box.h > g2.lines[0].y && q2.box.x < left + sp * 4);
    if (!s0) continue;
    const bin0 = raster.bin;
    const xa = Math.max(0, Math.round(left + sp * CLEF_8_X[0]));
    const xb = Math.min(bin0.w - 1, Math.round(left + sp * CLEF_8_X[1]));
    const bot0 = localLineModel(bin0, g2.lines.map((l2) => l2.y), left, Math.min(bin0.w - 1, left + sp * 12), unit)((xa + xb) / 2)[4];
    let bot = bot0;
    for (let y = Math.round(bot0 + sp * 1.5); y >= Math.round(bot0 - sp); y--) {
      if (y < 0 || y >= bin0.h) continue;
      let run = 0;
      let long = false;
      for (let x = Math.round(left); x < Math.min(bin0.w, left + sp * 10) && !long; x++) {
        run = bin0.data[y * bin0.w + x] ? run + 1 : 0;
        long = run > sp * 3;
      }
      if (long) {
        bot = y;
        break;
      }
    }
    if (bot < bot0 - sp * 0.5) continue;
    const rowInk = (y) => {
      if (y < 0 || y >= bin0.h) return false;
      for (let x = xa; x <= xb; x++) if (bin0.data[y * bin0.w + x]) return true;
      return false;
    };
    let end = Math.round(bot + sp * 0.5);
    for (let y = end, miss = 0; y < bin0.h && miss < 2; y++) {
      if (rowInk(y)) end = y, miss = 0;
      else miss++;
    }
    const depth = (end - bot) / sp;
    if (depth < CLEF_8_DEPTH[0] || depth > CLEF_8_DEPTH[1]) continue;
    for (const q2 of syms) if (q2.code === "gClef" && q2.box.y < g2.lines[4].y && q2.box.y + q2.box.h > g2.lines[0].y && q2.box.x < left + sp * 4) q2.code = "gClef8vb";
    if (s0.box.y + s0.box.h < end) s0.box = { ...s0.box, h: end - s0.box.y };
    ledger.claim(s0.box, "clef:gClef8vb");
  }
  const midClefs = /* @__PURE__ */ new Set();
  {
    const inkFrac = (r4) => {
      let n2 = 0;
      for (let y = r4.y; y < r4.y + r4.h; y++) for (let x = r4.x; x < r4.x + r4.w; x++) n2 += nl.data[y * nl.w + x];
      return n2 / Math.max(1, r4.w * r4.h);
    };
    const pageClefs = syms.filter((s0) => isClef(s0.code)).map((s0) => ({ code: s0.code, aspect: s0.box.w / s0.box.h, sig: binSig(nl, s0.box), fill: inkFrac(s0.box) }));
    const sp = unit.space;
    for (const c2 of blobs) {
      if (claimed.has(c2.id)) continue;
      const b = c2.bbox;
      const cy2 = b.y + b.h / 2;
      const g2 = groups.find((q2) => cy2 > q2.lines[0].y - sp && cy2 < q2.lines[4].y + sp);
      if (!g2) continue;
      if (b.x < Math.max(...g2.lines.map((l2) => l2.left)) + sp * MID_CLEF_FROM) continue;
      const w = b.w / sp;
      const h2 = b.h / sp;
      const top = g2.lines[0].y;
      const bot = g2.lines[4].y;
      const fShape = w >= 1.2 && w <= 2 && h2 >= 2 && h2 <= 3 && Math.abs(b.y - top) <= sp * 0.5 && b.y + b.h <= bot + sp * 0.5;
      const gShape = w >= 1.3 && w <= 2.4 && h2 >= 3.6 && h2 <= 5.8 && b.y <= top - sp * MID_CLEF_G_TOP && b.y + b.h >= bot + sp * 0.7;
      if (!fShape && !gShape) continue;
      const sig = binSig(nl, b);
      let hit = null;
      const fill = inkFrac(b);
      for (const pc of pageClefs) {
        if (Math.abs(pc.aspect - b.w / b.h) > MID_CLEF_ASPECT || Math.abs(pc.fill - fill) > MID_CLEF_FILL) continue;
        const d2 = sigDistance(pc.sig, sig);
        if (d2 <= MID_CLEF_DIST && (!hit || d2 < hit.dist)) hit = { smufl: pc.code, dist: d2 };
      }
      if (!hit || hit.smufl === "fClef" !== fShape) continue;
      const dotZone = { x: b.x + b.w, y: b.y, w: Math.round(sp * 0.9), h: Math.round(b.h * 0.6) };
      if (hit.smufl === "fClef") {
        const dots = blobs.filter((d2) => d2 !== c2 && d2.bbox.w <= sp * 0.5 && d2.bbox.h <= sp * 0.5 && d2.bbox.x >= dotZone.x - 2 && d2.bbox.x <= dotZone.x + dotZone.w && d2.bbox.y + d2.bbox.h / 2 >= dotZone.y && d2.bbox.y + d2.bbox.h / 2 <= dotZone.y + dotZone.h);
        if (!dots.length) continue;
        for (const d2 of dots) claimed.add(d2.id);
      }
      const zone = { x: b.x, y: b.y, w: b.w + (hit.smufl === "fClef" ? dotZone.w : 0), h: b.h };
      for (let i2 = syms.length - 1; i2 >= 0; i2--) {
        const s0 = syms[i2].box;
        const cx0 = s0.x + s0.w / 2;
        const cy0 = s0.y + s0.h / 2;
        if (cx0 >= zone.x - 1 && cx0 <= zone.x + zone.w + 1 && cy0 >= zone.y - 1 && cy0 <= zone.y + zone.h + 1) syms.splice(i2, 1);
      }
      claimed.add(c2.id);
      const cs = { box: b, code: hit.smufl };
      midClefs.add(cs);
      syms.push(cs);
      ledger.claim(zone, `clef:${hit.smufl}`);
    }
  }
  const arpeggios = [];
  for (const c2 of blobs) {
    const b = { ...c2.bbox };
    const sp = unit.space;
    if (b.w > sp * ARP_W || b.h < sp * ARP_H) continue;
    if (!groups.some((q2) => b.y < q2.lines[4].y + sp * 2 && b.y + b.h > q2.lines[0].y - sp * 2)) continue;
    const cs = [];
    let wide = 0;
    for (let y = b.y; y < b.y + b.h; y++) {
      let lo = -1;
      let hi = -1;
      for (let x = b.x; x < b.x + b.w; x++)
        if (nl.data[y * nl.w + x]) {
          if (lo < 0) lo = x;
          hi = x;
        }
      if (lo < 0) continue;
      cs.push((lo + hi) / 2);
      if (hi - lo + 1 > sp * ARP_STROKE) wide++;
    }
    if (cs.length < b.h * 0.8 || wide > cs.length * 0.1) continue;
    const res = cs.map((v2, k2) => v2 - (cs[0] + (cs[cs.length - 1] - cs[0]) * k2 / (cs.length - 1)));
    const sorted = [...res].sort((p2, q2) => p2 - q2);
    const swing = sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];
    const mid = sorted[sorted.length >> 1];
    const zs = [];
    let side = 0;
    res.forEach((v2, k2) => {
      const s1 = v2 > mid + 0.5 ? 1 : v2 < mid - 0.5 ? -1 : 0;
      if (s1 && side && s1 !== side) zs.push(k2);
      if (s1) side = s1;
    });
    if (claimed.has(c2.id)) continue;
    const rate = zs.length / (b.h / sp);
    if (swing < Math.max(1.5, sp * ARP_SWING) || rate < ARP_RATE[0] || rate > ARP_RATE[1]) continue;
    const gaps = zs.slice(1).map((z, k2) => z - zs[k2]).sort((p2, q2) => p2 - q2);
    const gm = gaps[gaps.length >> 1] ?? 0;
    if (gaps.length < 3 || gm < sp * 0.25 || gm > sp * 0.75 || gaps.filter((g0) => Math.abs(g0 - gm) <= gm * 0.6).length < gaps.length * 0.6) continue;
    {
      const bin0 = raster.bin;
      const rowInk = (y) => {
        if (y < 0 || y >= bin0.h) return false;
        for (let x = b.x - 1; x <= b.x + b.w; x++) if (bin0.data[y * bin0.w + x]) return true;
        return false;
      };
      let top = b.y;
      for (let y = b.y - 1, miss = 0; y >= 0 && miss < sp * 0.5; y--) {
        if (rowInk(y)) top = y, miss = 0;
        else miss++;
      }
      let bottom2 = b.y + b.h - 1;
      for (let y = bottom2 + 1, miss = 0; y < bin0.h && miss < sp * 0.5; y++) {
        if (rowInk(y)) bottom2 = y, miss = 0;
        else miss++;
      }
      if (arpeggios.some((q2) => Math.abs(q2.x - b.x) <= sp && q2.y <= bottom2 && q2.y + q2.h >= top)) continue;
      b.y = top;
      b.h = bottom2 - top + 1;
    }
    arpeggios.push(b);
    claimed.add(c2.id);
    for (let i2 = syms.length - 1; i2 >= 0; i2--) {
      const s0 = syms[i2].box;
      const cx0 = s0.x + s0.w / 2;
      const cy0 = s0.y + s0.h / 2;
      if (cx0 >= b.x - 1 && cx0 <= b.x + b.w + 1 && cy0 >= b.y - 1 && cy0 <= b.y + b.h + 1) syms.splice(i2, 1);
    }
    ledger.claim(b, "arpeggio");
  }
  {
    const clefOf = (g2) => syms.find((s0) => isClef(s0.code) && s0.box.y + s0.box.h / 2 > g2.lines[0].y && s0.box.y + s0.box.h / 2 < g2.lines[4].y && s0.box.x < Math.max(...g2.lines.map((l2) => l2.left)) + unit.space * 4);
    const found = groups.map((g2) => {
      const c2 = clefOf(g2);
      return c2 ? sharpsByStrokes(raster.bin, g2.lines.map((l2) => l2.y), c2.box, unit.space) : [];
    });
    const tally = /* @__PURE__ */ new Map();
    for (const f2 of found) if (f2.length) tally.set(f2.length, (tally.get(f2.length) ?? 0) + 1);
    const [k2, n2] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (k2 && n2 >= 2 && n2 * 2 >= groups.length)
      for (const f2 of found) {
        if (!f2.length) continue;
        const span = { x: f2[0].x, y: Math.min(...f2.map((b) => b.y)), w: f2[f2.length - 1].x + f2[f2.length - 1].w - f2[0].x, h: 0 };
        span.h = Math.max(...f2.map((b) => b.y + b.h)) - span.y;
        for (let i2 = syms.length - 1; i2 >= 0; i2--) {
          const b = syms[i2].box;
          const cx2 = b.x + b.w / 2;
          const cy2 = b.y + b.h / 2;
          if (!isClef(syms[i2].code) && cx2 >= span.x && cx2 <= span.x + span.w && cy2 >= span.y && cy2 <= span.y + span.h) syms.splice(i2, 1);
        }
        for (const b of f2) {
          syms.push({ box: b, code: "accidentalSharp" });
          ledger.claim(b, "key:accidentalSharp");
        }
        for (const c2 of blobs) {
          const cx2 = c2.bbox.x + c2.bbox.w / 2;
          const cy2 = c2.bbox.y + c2.bbox.h / 2;
          if (cx2 >= span.x && cx2 <= span.x + span.w && cy2 >= span.y && cy2 <= span.y + span.h) claimed.add(c2.id);
        }
      }
  }
  const unmatched = blobs.filter((c2) => !claimed.has(c2.id) && !dictClaimed.has(c2.id));
  const merged = /* @__PURE__ */ new Set();
  for (const a of unmatched) {
    if (merged.has(a.id)) continue;
    let box = { ...a.bbox };
    const group = [a.id];
    for (let again = true; again; ) {
      again = false;
      for (const b of unmatched) {
        if (group.includes(b.id) || merged.has(b.id)) continue;
        const r4 = b.bbox;
        if (r4.x > box.x + box.w || r4.x + r4.w < box.x) continue;
        const gap = r4.y > box.y ? r4.y - (box.y + box.h) : box.y - (r4.y + r4.h);
        if (gap > unit.space * 0.4) continue;
        const x0 = Math.min(box.x, r4.x);
        const y0 = Math.min(box.y, r4.y);
        box = { x: x0, y: y0, w: Math.max(box.x + box.w, r4.x + r4.w) - x0, h: Math.max(box.y + box.h, r4.y + r4.h) - y0 };
        group.push(b.id);
        again = true;
      }
    }
    if (group.length < 2) continue;
    const code = look.lookup(binSig(nl, box), box.w / unit.space, box.h / unit.space) ?? judgeHeadBox(nl, box, unit, prims.vSegs, inBand);
    if (!code) continue;
    if (isBarRest(code) && (!nearRestLine(box, staffLines, unit) || besideStem(box))) continue;
    if (code === "noteheadBlack" && beamStump(box, syms.filter((s0) => /^notehead/.test(s0.code)).map((s0) => s0.box))) continue;
    if (code === "noteheadHalf" && enclosedWhite(nl, { left: box.x, right: box.x + box.w, top: box.y, bottom: box.y + box.h }, unit.space, 2) < box.w * box.h * MERGE_HOLLOW_CAVITY) continue;
    for (const id of group) merged.add(id);
    syms.push({ box, code });
    ledger.claim(box, `merge:${code}`);
  }
  const usedSegs = /* @__PURE__ */ new Set();
  const clefSyms = syms.filter((s) => s.code === "gClef" || s.code === "fClef" || s.code === "cClef");
  const atKeySlot = (b) => clefSyms.some((c2) => b.y < c2.box.y + c2.box.h && b.y + b.h > c2.box.y && b.x >= c2.box.x + c2.box.w - 1 && b.x <= c2.box.x + c2.box.w + unit.space * 4);
  for (const c2 of blobs) {
    if (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id)) continue;
    const b = c2.bbox;
    const bw = b.w / unit.space;
    const bh = b.h / unit.space;
    if (bw < 0.25 || bw > 1.3 || bh < 0.4 || bh > 3.4) continue;
    for (const v2 of prims.vSegs) {
      if (usedSegs.has(v2)) continue;
      const vx = (v2.x0 + v2.x1) / 2;
      const vTop = Math.min(v2.y0, v2.y1);
      const vBot = Math.max(v2.y0, v2.y1);
      if (vx < b.x - unit.space * 0.5 || vx > b.x + b.w + unit.space * 0.5) continue;
      if (vBot < b.y || vTop > b.y + b.h) continue;
      const tl = Math.max(1, unit.lineThick);
      if (syms.some((h2) => h2.code === "noteheadBlack" && vx >= h2.box.x - tl && vx <= h2.box.x + h2.box.w + tl && (vBot >= h2.box.y && vBot <= h2.box.y + h2.box.h || vTop >= h2.box.y && vTop <= h2.box.y + h2.box.h))) continue;
      const x0 = Math.min(b.x, Math.round(vx - v2.maxLw / 2));
      const y0 = Math.min(b.y, Math.round(vTop));
      const box = {
        x: x0,
        y: y0,
        w: Math.max(b.x + b.w, Math.round(vx + v2.maxLw / 2)) - x0,
        h: Math.max(b.y + b.h, Math.round(vBot)) - y0
      };
      const w1 = box.w / unit.space;
      const h1 = box.h / unit.space;
      if (w1 < 0.4 || w1 > 1.7 || h1 < 1.5 || h1 > 3.6) continue;
      const sig = binSig(nl, box);
      let code = look.lookup(sig, w1, h1);
      if (!code || !isAccidental(code)) {
        const m2 = matchTemplate(sig, w1, h1, look.templates ?? [], atKeySlot(box) ? KEY_ACCID_TEMPLATE_DIST : ACCID_TEMPLATE_DIST);
        code = m2 && isAccidental(m2.smufl) ? m2.smufl : null;
      }
      if (!code) continue;
      syms.push({ box, code });
      ledger.claim(box, `accid:${code}`);
      merged.add(c2.id);
      usedSegs.add(v2);
      break;
    }
  }
  const natFrom = (sx, seed) => {
    let hit = null;
    for (const side of [1, -1]) {
      for (let dx = Math.round(unit.space * NAT_GAP[0]); dx <= unit.space * NAT_GAP[1] && !hit; dx++) {
        const ox = sx + side * dx;
        const [lx, rx] = side > 0 ? [sx, ox] : [ox, sx];
        let other = null;
        for (let y = seed[0]; y <= seed[1] && !other; y++) if (nl.data[y * nl.w + ox]) other = vRunAt(nl, ox, y);
        if (!other) continue;
        const [L3, R] = side > 0 ? [seed, other] : [other, seed];
        if (L3[1] - L3[0] < unit.space * 1.5 || R[1] - R[0] < unit.space * 1.5 || L3[1] - L3[0] > unit.space * 3.4 || R[1] - R[0] > unit.space * 3.4) continue;
        if (R[0] - L3[0] < unit.space * 0.3 || R[1] - L3[1] < unit.space * 0.3) continue;
        const ya = Math.max(L3[0], R[0]);
        const yb = Math.min(L3[1], R[1]);
        if (yb - ya < unit.space) continue;
        const bars = crossRuns(raster.bin, lx, rx, Math.round(ya - unit.space * 0.3), Math.round(yb + unit.space * 0.3));
        const thick = bars.filter((r4) => r4[1] - r4[0] + 1 >= Math.max(unit.lineThick + 2, unit.space * 0.25));
        if (thick.length < 2 || thick[thick.length - 1][0] - thick[0][1] < unit.space * 0.6) continue;
        const x0 = lx - Math.round(unit.lineThick);
        hit = { x: x0, y: L3[0], w: rx + Math.round(unit.lineThick) - x0 + 1, h: R[1] - L3[0] + 1 };
      }
      if (hit) break;
    }
    return hit;
  };
  for (const c2 of blobs) {
    if (claimed.has(c2.id) || merged.has(c2.id)) continue;
    const b = c2.bbox;
    if (b.h < unit.space * 0.3) continue;
    let sx = b.x + Math.floor(b.w / 2);
    let seed = b.w <= unit.space * 0.4 ? vRunAt(nl, sx, b.y + Math.floor(b.h / 2)) : null;
    if (b.w > unit.space * 0.4) {
      if (b.w > unit.space * 1 || b.h < unit.space * 1.5) continue;
      for (let x = b.x; x < b.x + Math.min(b.w, unit.space * 0.3) && !seed; x++) {
        for (let y = b.y; y < b.y + b.h; y++) {
          if (!nl.data[y * nl.w + x]) continue;
          const r4 = vRunAt(nl, x, y);
          if (r4 && r4[1] - r4[0] >= unit.space * 1.5) {
            seed = r4;
            sx = x + 1;
          }
          break;
        }
      }
    }
    if (!seed) continue;
    const hit = natFrom(sx, seed);
    if (!hit) continue;
    const box = hit;
    const inner = syms.filter((s0) => overlapFrac(s0.box, box) > 0.8 && s0.box.w * s0.box.h < box.w * box.h * 0.5);
    if (syms.some((s0) => !inner.includes(s0) && overlapFrac(box, s0.box) > 0.3)) continue;
    for (const s0 of inner) syms.splice(syms.indexOf(s0), 1);
    syms.push({ box, code: "accidentalNatural" });
    ledger.claim(box, "accid:accidentalNatural");
    for (const c22 of blobs) if (!claimed.has(c22.id) && overlapFrac(c22.bbox, box) > 0.8) merged.add(c22.id);
    for (const v2 of prims.vSegs) if ((v2.x0 + v2.x1) / 2 >= box.x && (v2.x0 + v2.x1) / 2 <= box.x + box.w && Math.min(v2.y0, v2.y1) >= box.y - 2 && Math.max(v2.y0, v2.y1) <= box.y + box.h + 2) usedSegs.add(v2);
  }
  const afterKey = (b) => {
    const cy2 = b.y + b.h / 2;
    const g2 = groups.find((g0) => cy2 > g0.lines[0].y - unit.space && cy2 < g0.lines[4].y + unit.space);
    if (!g2) return Infinity;
    const inRow = (r4) => r4.y + r4.h / 2 > g2.lines[0].y - unit.space * 2 && r4.y + r4.h / 2 < g2.lines[4].y + unit.space * 2;
    const clef = syms.filter((s0) => s0.code.endsWith("Clef") && inRow(s0.box) && s0.box.x < b.x).sort((p2, q2) => q2.box.x - p2.box.x)[0];
    if (!clef) return Infinity;
    let right2 = clef.box.x + clef.box.w;
    const accs = syms.filter((s0) => /^accidental(Flat|Sharp)$/.test(s0.code) && inRow(s0.box) && s0.box.x > clef.box.x).sort((p2, q2) => p2.box.x - q2.box.x);
    for (const [i2, a] of accs.entries()) {
      if (a.box.x - right2 > unit.space * (i2 ? 1.2 : 2)) break;
      right2 = Math.max(right2, a.box.x + a.box.w);
    }
    return b.x - right2 < 0 ? Infinity : b.x - right2;
  };
  const sysBoxes = groupByLeftInk(raster.bin, groups.map((g2) => ({ top: g2.lines[0].y, bottom: g2.lines[4].y, left: Math.max(...g2.lines.map((l2) => l2.left)) })), unit);
  const inGrandStaff = (b, many = false) => {
    const cy2 = b.y + b.h / 2;
    const g2 = groups.slice().sort((p2, q2) => Math.min(Math.abs(cy2 - p2.lines[0].y), Math.abs(cy2 - p2.lines[4].y)) - Math.min(Math.abs(cy2 - q2.lines[0].y), Math.abs(cy2 - q2.lines[4].y)))[0];
    if (!g2) return false;
    const box = sysBoxes.find((q2) => g2.lines[0].y < q2.y + q2.h && g2.lines[4].y > q2.y);
    if (!box) return false;
    const rows = groups.filter((o) => o.lines[0].y < box.y + box.h && o.lines[4].y > box.y).length;
    return many ? rows >= 2 : rows === 2;
  };
  for (const c2 of blobs) {
    if (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id)) continue;
    const b = c2.bbox;
    const w = b.w / unit.space;
    const h2 = b.h / unit.space;
    if (w < QREST_W[0] || w > QREST_W[1] || h2 < QREST_H[0] || h2 > QREST_H[1]) continue;
    const fill = c2.area / Math.max(1, b.w * b.h);
    if (fill < QREST_FILL[0] || fill > QREST_FILL[1]) continue;
    const mid = midOfStaff(b, lines, unit);
    if (!mid && !(offStaffRest(b, lines, unit) && inGrandStaff(b))) continue;
    if (!mid) {
      const cy2 = b.y + b.h / 2;
      const g2 = groups.slice().sort((p2, q2) => Math.min(Math.abs(cy2 - p2.lines[0].y), Math.abs(cy2 - p2.lines[4].y)) - Math.min(Math.abs(cy2 - q2.lines[0].y), Math.abs(cy2 - q2.lines[4].y)))[0];
      if (g2 && b.x - Math.max(...g2.lines.map((l2) => l2.left)) < unit.space * (STAFF_START + 4)) continue;
    }
    if (!mid && syms.some((s0) => {
      if (!s0.code.startsWith("notehead")) return false;
      const dx = s0.box.x - (b.x + b.w);
      const hy = s0.box.y + s0.box.h / 2;
      return dx >= -unit.space * 0.3 && dx <= unit.space * 2.4 && hy >= b.y - unit.space * 0.5 && hy <= b.y + b.h + unit.space * 0.5;
    }))
      continue;
    if (nearStaffStart(b, groups, staffLefts, unit)) continue;
    if (afterKey(b) < unit.space * KEY_TAIL) continue;
    if (sharpCrossbars(nl, b, unit)) continue;
    if (syms.reduce((a, s0) => a + (s0.code.startsWith("notehead") ? overlapFrac(b, s0.box) : 0), 0) > 0.6) continue;
    const stemBeside = prims.vSegs.some((v2) => {
      const x = (v2.x0 + v2.x1) / 2;
      const y0 = Math.min(v2.y0, v2.y1);
      const y1 = Math.max(v2.y0, v2.y1);
      if (y1 - y0 < unit.space * 2.5) return false;
      if (Math.abs(x - b.x) > unit.space * 0.5 && Math.abs(x - (b.x + b.w)) > unit.space * 0.5) return false;
      return Math.min(y1, b.y + b.h) - Math.max(y0, b.y) >= b.h * 0.5;
    });
    if (stemBeside) continue;
    merged.add(c2.id);
    const code = isEighthRest(nl, b, c2.area, unit) ? "rest8th" : "restQuarter";
    syms.push({ box: b, code });
    ledger.claim(b, `qrest:${code}`);
  }
  for (const c2 of cmap.contours) {
    if (ledger.claimsOf(c2.id).length) continue;
    const b = c2.bbox;
    const w = b.w / unit.space;
    const h2 = b.h / unit.space;
    if (w < QREST_W[0] || w > QREST_SPINE_W || h2 < QREST_H[0] || h2 > QREST_H[1]) continue;
    const fill = c2.area / Math.max(1, b.w * b.h);
    if (fill < QREST_FILL[0] || fill > QREST_FILL[1]) continue;
    if (!midOfStaff(b, lines, unit) && !(offStaffRest(b, lines, unit) && inGrandStaff(b, true))) continue;
    if (nearStaffStart(b, groups, staffLefts, unit) || afterKey(b) < unit.space * KEY_TAIL || sharpCrossbars(nl, b, unit)) continue;
    if (syms.some((s0) => overlapFrac(b, s0.box) > 0.3)) continue;
    const inside = (v2) => {
      const x = (v2.x0 + v2.x1) / 2;
      return x >= b.x + 1 && x <= b.x + b.w - 1 && Math.min(v2.y0, v2.y1) >= b.y - unit.space * 0.5 && Math.max(v2.y0, v2.y1) <= b.y + b.h + unit.space * 0.5;
    };
    const spine = prims.vSegs.filter(inside);
    if (!spine.length) continue;
    const stemOut = prims.vSegs.some((v2) => {
      if (spine.includes(v2)) return false;
      const x = (v2.x0 + v2.x1) / 2;
      if (Math.max(v2.y0, v2.y1) - Math.min(v2.y0, v2.y1) < unit.space * 2.5) return false;
      if (Math.abs(x - b.x) > unit.space * 0.5 && Math.abs(x - (b.x + b.w)) > unit.space * 0.5) return false;
      return Math.min(Math.max(v2.y0, v2.y1), b.y + b.h) - Math.max(Math.min(v2.y0, v2.y1), b.y) >= b.h * 0.5;
    });
    if (stemOut) continue;
    for (const v2 of spine) usedSegs.add(v2);
    const code = isEighthRest(nl, b, c2.area, unit) ? "rest8th" : "restQuarter";
    syms.push({ box: b, code });
    ledger.claim(b, `qrest:${code}`);
  }
  const digitTpl = (look.templates ?? []).filter((t2) => timeSigDigit(t2.smufl) >= 0);
  digitTpl.push(...digitTpl.filter((t2) => t2.smufl === "timeSig6").map((t2) => ({ ...t2, smufl: "timeSig9", sig: t2.sig.slice().reverse() })));
  const digitOf = (b, allowed, maxDist) => {
    const h2 = b.h / unit.space;
    const sig = binSig(nl, b);
    let best = null;
    let bestNot9 = null;
    for (const t2 of digitTpl) {
      if (!allowed.includes(timeSigDigit(t2.smufl)) || Math.abs(t2.h - h2) > 0.2 + 0.12 * t2.h) continue;
      const d2 = sigDistance(t2.sig, sig);
      if (d2 > maxDist) continue;
      if (!best || d2 < best.d) best = { code: t2.smufl, d: d2 };
      if (t2.smufl !== "timeSig9" && (!bestNot9 || d2 < bestNot9.d)) bestNot9 = { code: t2.smufl, d: d2 };
    }
    if (best?.code === "timeSig9" && bestNot9 && bestNot9.d - best.d < NINE_MARGIN) best = bestNot9;
    return best && { box: b, code: best.code };
  };
  const timeStrips = [];
  const timeCols = [];
  const clefBoxes = syms.filter((s0) => isClef(s0.code)).map((s0) => s0.box);
  const timeFound = [];
  const timeDone = /* @__PURE__ */ new Set();
  const wholes = syms.filter((s0) => s0.code === "noteheadWhole").map((s0) => s0.box);
  for (const pass of [0, 1])
    for (const g2 of groups) {
      if (timeDone.has(g2) || pass === 1 && !timeFound.length) continue;
      const left = Math.max(...g2.lines.map((l2) => l2.left));
      const mid = g2.lines[2].y;
      const top = g2.lines[0].y;
      const bottom2 = g2.lines[4].y;
      const cands = blobs.filter((c2) => {
        const b = c2.bbox;
        if (claimed.has(c2.id) && !(pass === 1 && !restIds.has(c2.id) && !harmonyIds.has(c2.id)) && !splitIds.has(c2.id) || merged.has(c2.id)) return false;
        const dc = dictClaimed.has(c2.id) ? look.lookup(binSig(nl, b), b.w / unit.space, b.h / unit.space) : null;
        if (dc && (isClef(dc) || isAccidental(dc))) return false;
        if (b.x < left || b.x > left + unit.space * 14) return false;
        if (pass === 1 && !timeFound.some((t2) => Math.abs(t2.x - b.x) <= unit.space * 1.5)) return false;
        return b.y + b.h > top - unit.space * 0.5 && b.y < bottom2 + unit.space * 0.5;
      });
      cands.sort((a, b) => a.bbox.x - b.bbox.x);
      const cols = [];
      for (const c2 of cands) {
        const b = c2.bbox;
        const last = cols[cols.length - 1];
        if (last && b.x <= last.box.x + last.box.w + unit.space * 0.4) {
          const x0 = Math.min(last.box.x, b.x);
          const y0 = Math.min(last.box.y, b.y);
          last.box = { x: x0, y: y0, w: Math.max(last.box.x + last.box.w, b.x + b.w) - x0, h: Math.max(last.box.y + last.box.h, b.y + b.h) - y0 };
          last.ids.push(c2.id);
        } else cols.push({ box: { ...b }, ids: [c2.id] });
      }
      if (pass === 0) {
        const clefR = Math.max(left, ...clefBoxes.filter((cb) => cb.y < bottom2 && cb.y + cb.h > top && cb.x < left + unit.space * 6).map((cb) => cb.x + cb.w));
        const yA = Math.max(0, Math.round(top - unit.space * 0.25)), yB = Math.min(nl.h, Math.round(bottom2 + unit.space * 0.25));
        const xEnd = Math.min(nl.w, Math.round(left + unit.space * 14));
        const inkAt = (x) => {
          let n2 = 0;
          for (let y = yA; y < yB; y++) if (nl.data[y * nl.w + x]) n2++;
          return n2 >= 2;
        };
        const gap = Math.max(2, Math.round(unit.space * 0.2));
        let x0 = -1, lastInk = -1;
        const flush = () => {
          if (x0 < 0) return;
          const b = { x: x0, y: yA, w: lastInk - x0 + 1, h: yB - yA };
          if (b.w >= unit.space * 0.8 && b.w <= unit.space * 2.5 && !cols.some((c2) => Math.min(c2.box.x + c2.box.w, b.x + b.w) - Math.max(c2.box.x, b.x) > b.w * 0.5)) cols.push({ box: b, ids: [], ink: true });
          x0 = -1;
        };
        for (let x = Math.round(clefR) + 1; x < xEnd; x++) {
          if (inkAt(x)) {
            if (x0 < 0) x0 = x;
            lastInk = x;
          } else if (x0 >= 0 && x - lastInk > gap) flush();
        }
        flush();
        cols.sort((a, b) => a.box.x - b.box.x);
      }
      const fillsStaff = (b) => {
        const xa = Math.max(0, Math.round(b.x)), xb = Math.min(nl.w, Math.round(b.x + b.w));
        const ya = Math.max(0, Math.round(top - unit.space * 1.5)), yb = Math.min(nl.h, Math.round(bottom2 + unit.space * 1.5));
        let lo = -1, hi = -1;
        for (let y = ya; y < yb; y++) {
          let n2 = 0;
          for (let x = xa; x < xb; x++) if (nl.data[y * nl.w + x]) n2++;
          if (n2 < 2) continue;
          if (lo < 0) lo = y;
          hi = y;
        }
        return lo >= top - unit.space * 0.4 && hi <= bottom2 + unit.space * 0.4 && lo <= top + unit.space * 0.6 && hi >= bottom2 - unit.space * 0.6;
      };
      for (const col of cols) {
        const box = col.box;
        if (box.w > unit.space * 2.5 || box.w < unit.space * 0.8) continue;
        const tpl = look.templates ?? [];
        const hits = [];
        let fromOcr = false;
        if (box.h < unit.space * 3) {
          if (col.ink) continue;
          if (Math.abs(box.y + box.h / 2 - mid) > unit.space * 0.8) continue;
          const whole = box.h >= unit.space * 1.8 && wholes.some((w) => w.x >= box.x - 1 && w.x + w.w <= box.x + box.w + 1 && w.y >= box.y - 1 && w.y + w.h <= box.y + box.h + 1);
          const cTpl = tpl.filter((t2) => t2.smufl === "timeSigCommon" || t2.smufl === "timeSigCutCommon");
          const m2 = whole ? matchTemplate(binSig(nl, box), box.w / unit.space, box.h / unit.space, cTpl, TIME_C_WHOLE_DIST) : matchTemplate(binSig(nl, box), box.w / unit.space, box.h / unit.space, tpl, TIME_TEMPLATE_DIST);
          if (m2 && (m2.smufl === "timeSigCommon" || m2.smufl === "timeSigCutCommon")) hits.push({ box, code: m2.smufl });
        } else {
          const y0 = Math.max(box.y, Math.round(top - unit.space * 0.25));
          const y1 = Math.min(box.y + box.h, Math.round(bottom2 + unit.space * 0.25));
          const up = { x: box.x, y: y0, w: box.w, h: Math.round(mid) - y0 };
          const dn = { x: box.x, y: Math.round(mid), w: box.w, h: y1 - Math.round(mid) };
          if (up.h < unit.space || dn.h < unit.space) continue;
          const inClef = clefBoxes.some((cb) => cb.y < bottom2 && cb.y + cb.h > top && box.x + box.w / 2 < cb.x + cb.w) || !fillsStaff(box);
          const sUp = timeStripOf(nl, up, groups.indexOf(g2), "num");
          const sDn = timeStripOf(nl, dn, groups.indexOf(g2), "den");
          const oNum = inClef ? null : timeDigit(opts.timeOcr?.get(timeKey(sUp)), "num");
          const oDen = inClef ? null : timeDigit(opts.timeOcr?.get(timeKey(sDn)), "den");
          if (pass === 0 && !inClef) {
            timeStrips.push(sUp, sDn);
            timeCols.push({ box, mid, num: oNum, den: oDen });
          }
          if (oNum !== null && oDen !== null) {
            const digitsOf = (n2, b) => {
              const ds = String(n2).split("");
              const w = b.w / ds.length;
              return ds.map((d2, k2) => ({ box: { x: Math.round(b.x + k2 * w), y: b.y, w: Math.round(w), h: b.h }, code: `timeSig${d2}` }));
            };
            hits.push(...digitsOf(oNum, up), ...digitsOf(oDen, dn));
            fromOcr = true;
          } else if (!col.ink) {
            const two = [up, dn].map((b) => {
              const m2 = matchTemplate(binSig(nl, b), b.w / unit.space, b.h / unit.space, tpl, TIME_TEMPLATE_DIST);
              return m2 && timeSigDigit(m2.smufl) >= 0 ? { box: b, code: m2.smufl } : null;
            });
            if (two[0] && two[1] && timeSigDigit(two[0].code) >= 2 && DEN_DIGITS.includes(timeSigDigit(two[1].code))) hits.push(two[0], two[1]);
            else {
              const num2 = digitOf(up, NUM_DIGITS, TIME_NUM_DIST);
              const den = num2 ? digitOf(dn, DEN_DIGITS, TIME_DEN_DIST) : null;
              if (num2 && den) hits.push(num2, den);
            }
            if (hits.length === 2 && oNum !== null && oNum < 10) hits[0] = { box: hits[0].box, code: `timeSig${oNum}` };
            if (hits.length === 2 && oDen !== null && oDen < 10) hits[1] = { box: hits[1].box, code: `timeSig${oDen}` };
          }
        }
        if (!hits.length) continue;
        if (!fromOcr && hits.length === 2 && hits[0].code === "timeSig4" && hits[1].code === "timeSig4" && sigDistance(binSig(nl, hits[0].box), binSig(nl, hits[1].box)) > TIME_SELF_DIST) {
          const alt = digitOf(hits[0].box, NUM_DIGITS.filter((k2) => k2 !== 4), TIME_ALT_DIST);
          if (alt) hits[0] = alt;
        }
        if (pass === 1 && !timeFound.some((t2) => t2.codes === hits.map((h0) => h0.code).join("/") && Math.abs(t2.x - box.x) <= unit.space * 1.5)) continue;
        for (let k2 = syms.length - 1; k2 >= 0; k2--) {
          const s0 = syms[k2].box;
          if (s0.x >= box.x - 1 && s0.x + s0.w <= box.x + box.w + 1 && s0.y >= box.y - 1 && s0.y + s0.h <= box.y + box.h + 1) syms.splice(k2, 1);
        }
        syms.push(...hits);
        for (const hit of hits) ledger.claim(hit.box, `time:${hit.code}`);
        for (const id of col.ids) merged.add(id);
        timeFound.push({ x: box.x, codes: hits.map((h0) => h0.code).join("/") });
        timeDone.add(g2);
        break;
      }
    }
  const keySp = unit.space;
  const keyBin = raster.bin;
  function sharpAsHeads(ss, edge, onStaff) {
    const sp = keySp;
    const hs = ss.filter((s0) => s0.code === "noteheadBlack" && onStaff(s0.box) && s0.box.x >= edge - sp * 0.3 && s0.box.x < edge + sp * 2).sort((a, b) => a.box.x - b.box.x);
    const sets = [];
    for (const a of hs)
      for (const b of hs) {
        const dy = (b.box.y - a.box.y) / sp;
        if (dy >= 0.7 && dy <= 1.3 && Math.abs(a.box.x - b.box.x) <= sp * 0.3) sets.push([a, b]);
      }
    for (const a of hs) sets.push([a]);
    for (const set of sets) {
      const box = sharpBox(set);
      if (box) return { heads: set, box };
    }
    return null;
  }
  function hasGapColumn(set) {
    const bin = keyBin;
    const x0 = Math.min(...set.map((s0) => s0.box.x));
    const x1 = Math.max(...set.map((s0) => s0.box.x + s0.box.w));
    const u0 = set[0].box.y;
    const u1 = set[set.length - 1].box.y + set[set.length - 1].box.h - 1;
    const full = [];
    const at = (x, y) => x >= 0 && x < bin.w && !!bin.data[y * bin.w + x];
    for (let x = x0; x < x1; x++) {
      let ok = true;
      for (let y = u0; y <= u1 && ok; y++) ok = at(x, y) || at(x - 1, y) || at(x + 1, y);
      full.push(ok);
    }
    const first = full.indexOf(true);
    const last = full.lastIndexOf(true);
    return first >= 0 && full.slice(first, last + 1).some((f2) => !f2);
  }
  function sharpBox(set) {
    const sp = keySp;
    const bin = keyBin;
    const at = (x, y) => y >= 0 && y < bin.h && !!bin.data[y * bin.w + x];
    const x0 = Math.min(...set.map((s0) => s0.box.x));
    const x1 = Math.max(...set.map((s0) => s0.box.x + s0.box.w));
    const u0 = set[0].box.y;
    const u1 = set[set.length - 1].box.y + set[set.length - 1].box.h - 1;
    const cols = [];
    let y0 = u0;
    let y1 = u1;
    let over = 0;
    let up = 0;
    let down = 0;
    for (let x = x0; x < x1; x++) {
      let ok = true;
      for (let y = u0; y <= u1 && ok; y++) ok = at(x, y) || at(x - 1, y) || at(x + 1, y);
      if (!ok) continue;
      cols.push(x);
      let t2 = u0;
      let d2 = u1;
      while (at(x, t2 - 1)) t2--;
      while (at(x, d2 + 1)) d2++;
      over = Math.max(over, u0 - t2, d2 - u1);
      up = Math.max(up, u0 - t2);
      down = Math.max(down, d2 - u1);
      y0 = Math.min(y0, t2);
      y1 = Math.max(y1, d2);
    }
    if (!cols.length || cols[cols.length - 1] - cols[0] < sp * 0.4) return null;
    if (set.length === 2 ? over > sp : over > sp * 1.6 || up < sp * 0.3 || down < sp * 0.3) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 + 1 };
  }
  for (const g2 of groups) {
    const left = Math.max(...g2.lines.map((l2) => l2.left));
    const top = g2.lines[0].y;
    const bottom2 = g2.lines[4].y;
    const clef = syms.find((s0) => isClef(s0.code) && s0.box.x < left + unit.space * 4 && s0.box.y < bottom2 && s0.box.y + s0.box.h > top);
    if (!clef) continue;
    let edge = clef.box.x + clef.box.w;
    const onStaff = (r4) => r4.y < bottom2 && r4.y + r4.h > top;
    let fromDict = false;
    const overlapTol = unit.space * KEY_OVERLAP;
    const taken = /* @__PURE__ */ new Set();
    for (; ; ) {
      const nx = syms.filter((s0) => !taken.has(s0) && isAccidental(s0.code) && onStaff(s0.box) && s0.box.x >= edge - (taken.size ? overlapTol : 1) && s0.box.x < edge + unit.space * KEY_GAP).sort((a, b) => a.box.x - b.box.x)[0];
      if (!nx) break;
      taken.add(nx);
      edge = Math.max(edge, nx.box.x + nx.box.w);
      fromDict = true;
    }
    const dictSym = /* @__PURE__ */ new Map();
    for (const c2 of blobs) {
      if (!dictClaimed.has(c2.id) || claimed.has(c2.id) || merged.has(c2.id)) continue;
      const s0 = syms.find((x) => x.box === c2.bbox);
      if (s0 && !isClef(s0.code) && !isAccidental(s0.code) && timeSigDigit(s0.code) < 0 && !/^(notehead|rest)/.test(s0.code)) dictSym.set(c2.id, s0);
    }
    const cand = blobs.filter((c2) => !claimed.has(c2.id) && (!dictClaimed.has(c2.id) || dictSym.has(c2.id)) && !merged.has(c2.id)).filter((c2) => onStaff(c2.bbox)).sort((a, b) => a.bbox.x - b.bbox.x);
    const union = (a, b) => {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
    };
    const lastDict = [...taken].sort((a, b) => b.box.x - a.box.x)[0];
    let prevKey = lastDict && (lastDict.code === "accidentalFlat" || lastDict.code === "accidentalSharp") ? { box: lastDict.box, code: lastDict.code, sig: binSig(nl, lastDict.box) } : null;
    for (let first = !fromDict; ; first = false) {
      const gap = unit.space * (first ? KEY_GAP_FIRST : KEY_GAP);
      const pair = sharpAsHeads(syms, edge, onStaff);
      if (pair && pair.box.x <= edge + gap) {
        for (const s0 of pair.heads) syms.splice(syms.indexOf(s0), 1);
        syms.push({ box: pair.box, code: "accidentalSharp" });
        ledger.claim(pair.box, "key:accidentalSharp");
        edge = pair.box.x + pair.box.w;
        continue;
      }
      let took = false;
      const keyTpl = (look.templates ?? []).filter((t2) => t2.smufl === "accidentalSharp" || t2.smufl === "accidentalFlat");
      const asKey = (b) => {
        const w = b.w / unit.space;
        const h2 = b.h / unit.space;
        if (h2 < 1.6 || h2 > 3.4 || w < 0.4 || w > h2 * 0.6 || w > 1.2) return null;
        if (prevKey && b.h < prevKey.box.h * 0.8) return null;
        const sig = binSig(nl, b);
        const m2 = matchTemplate(sig, w, h2, keyTpl, TIME_TEMPLATE_DIST);
        if (m2) return m2;
        if (prevKey && Math.abs(b.h - prevKey.box.h) <= prevKey.box.h * 0.15 && Math.abs(b.w - prevKey.box.w) <= prevKey.box.w * 0.3) {
          const d2 = sigDistance(sig, prevKey.sig);
          if (d2 <= KEY_SELF_DIST) return { smufl: prevKey.code, dist: d2 };
        }
        if (h2 < 2.5) {
          const pad = Math.round(unit.space * 0.3);
          if (tallStrokes(raster.bin, { x: b.x - pad, y: b.y, w: b.w + pad * 2, h: b.h }) === 2) return { smufl: "accidentalSharp", dist: KEY_SELF_DIST };
        }
        return null;
      };
      for (let i2 = 0; i2 < cand.length; i2++) {
        const c2 = cand[i2];
        const b = c2.bbox;
        if (b.x < edge - (fromDict || prevKey ? overlapTol : 1) || merged.has(c2.id)) continue;
        if (b.x > edge + gap) break;
        if (b.w / unit.space < 0.6 && b.h / unit.space < 0.6) continue;
        let box = b;
        let used = [c2];
        let m2 = asKey(b);
        if (!m2) {
          const c22 = cand.slice(i2 + 1).find((d2) => !merged.has(d2.id) && d2.bbox.x >= b.x && d2.bbox.x <= b.x + b.w + unit.space * 0.3);
          if (c22 && c22.bbox.y < b.y + b.h && c22.bbox.y + c22.bbox.h > b.y) {
            box = union(b, c22.bbox);
            used = [c2, c22];
            m2 = asKey(box);
          }
        }
        if (!m2) {
          const bin = raster.bin;
          let top2 = b.y;
          for (let x = b.x; x <= Math.min(bin.w - 1, b.x + Math.round(unit.space * 0.3)); x++) {
            let y = b.y;
            while (y > 0 && bin.data[(y - 1) * bin.w + x]) y--;
            if (bin.data[b.y * bin.w + x]) top2 = Math.min(top2, y);
          }
          if (b.y - top2 >= unit.space * 0.3) {
            const u2 = { x: b.x, y: top2, w: b.w, h: b.y + b.h - top2 };
            const m22 = asKey(u2);
            if (m22 && m22.smufl === "accidentalFlat") {
              box = u2;
              m2 = m22;
            }
          }
        }
        if (!m2) {
          const col = cand.filter((d2) => !merged.has(d2.id) && Math.abs(d2.bbox.x - b.x) <= unit.space * 0.4 && d2.bbox.x + d2.bbox.w <= b.x + unit.space);
          if (col.length >= 2) {
            const u2 = col.map((d2) => d2.bbox).reduce(union);
            const m22 = longestVRun(raster.bin, u2) >= u2.h * 0.8 ? asKey(u2) : null;
            if (m22) {
              box = u2;
              used = col;
              m2 = m22;
            }
          }
        }
        if (!m2 && prevKey && b.w >= prevKey.box.w * 1.3 && b.w <= prevKey.box.w * 2 && b.h >= prevKey.box.h * 1.1 && b.h <= prevKey.box.h * 1.9) {
          const halves = splitAt(nl, b) ?? [
            { x: b.x, y: b.y, w: Math.round(b.w / 2), h: b.h },
            { x: b.x + Math.round(b.w / 2), y: b.y, w: b.w - Math.round(b.w / 2), h: b.h }
          ];
          const d2 = dictSym.get(c2.id);
          if (d2) syms.splice(syms.indexOf(d2), 1);
          merged.add(c2.id);
          for (const h2 of halves) {
            syms.push({ box: h2, code: prevKey.code });
            ledger.claim(h2, `key:${prevKey.code}`);
          }
          edge = Math.max(edge, b.x + b.w);
          took = true;
          break;
        }
        if (!m2) break;
        for (const u2 of used) {
          const d2 = dictSym.get(u2.id);
          if (d2) syms.splice(syms.indexOf(d2), 1);
          merged.add(u2.id);
        }
        syms.push({ box, code: m2.smufl });
        ledger.claim(box, `key:${m2.smufl}`);
        prevKey = { box, code: m2.smufl, sig: binSig(nl, box) };
        edge = Math.max(edge, box.x + box.w);
        took = true;
        break;
      }
      if (!took) break;
    }
  }
  for (const g2 of groups) {
    const top = g2.lines[0].y;
    const bottom2 = g2.lines[4].y;
    const clef = syms.find((s0) => isClef(s0.code) && s0.box.y < bottom2 && s0.box.y + s0.box.h > top && s0.box.x < Math.max(...g2.lines.map((l2) => l2.left)) + unit.space * 4);
    if (!clef) continue;
    const right2 = clef.box.x + clef.box.w + unit.space * 6;
    const inKey = (s0) => !(s0.box.x < clef.box.x + clef.box.w - 1 || s0.box.x > right2 || s0.box.y > bottom2 || s0.box.y + s0.box.h < top);
    for (const s0 of syms) {
      if (s0.code !== "accidentalFlat" && s0.code !== "accidentalSharp") continue;
      if (!inKey(s0)) continue;
      const pad = Math.round(unit.space * 0.3);
      const n2 = tallStrokes(raster.bin, { x: s0.box.x - pad, y: s0.box.y, w: s0.box.w + pad * 2, h: s0.box.h });
      if (n2 === 2 && s0.code === "accidentalFlat") s0.code = "accidentalSharp";
    }
    const ks = syms.filter((s0) => isAccidental(s0.code) && inKey(s0));
    if (ks.some((s0) => s0.code === "accidentalSharp") && !ks.some((s0) => s0.code === "accidentalFlat")) {
      for (const s0 of ks) if (s0.code === "accidentalNatural") s0.code = "accidentalSharp";
    }
    const nf = ks.filter((s0) => s0.code === "accidentalFlat").length;
    const ns = ks.filter((s0) => s0.code === "accidentalSharp").length;
    if (nf && ns && nf !== ns) {
      for (const s0 of ks) if (s0.code === "accidentalFlat" || s0.code === "accidentalSharp") s0.code = nf > ns ? "accidentalFlat" : "accidentalSharp";
    }
  }
  for (let i2 = 0; i2 < syms.length; i2++) {
    const a = syms[i2];
    if (a.code !== "noteheadBlack") continue;
    const b = syms.find((s0) => s0 !== a && s0.code === "noteheadBlack" && Math.abs(s0.box.x - a.box.x) <= keySp * 0.3 && (s0.box.y - a.box.y) / keySp >= 0.7 && (s0.box.y - a.box.y) / keySp <= 1.3);
    if (!b) continue;
    const box = sharpBox([a, b]);
    if (!box) continue;
    if (!hasGapColumn([a, b])) continue;
    const cy2 = box.y + box.h / 2;
    const right2 = box.x + box.w;
    const owner = syms.some((s0) => s0 !== a && s0 !== b && /^notehead/.test(s0.code) && s0.box.x >= right2 - 2 && s0.box.x - right2 <= keySp * 1.5 && Math.abs(s0.box.y + s0.box.h / 2 - cy2) <= keySp / 4);
    if (!owner) continue;
    syms.splice(syms.indexOf(b), 1);
    syms.splice(syms.indexOf(a), 1, { box, code: "accidentalSharp" });
    ledger.claim(box, "acc:accidentalSharp");
  }
  {
    const accTpl = (look.templates ?? []).filter((t2) => t2.smufl === "accidentalSharp" || t2.smufl === "accidentalFlat" || t2.smufl === "accidentalNatural");
    const sp = unit.space;
    for (const c2 of blobs) {
      if (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id)) continue;
      const b = c2.bbox;
      const w = b.w / sp;
      const h2 = b.h / sp;
      if (h2 < 1.8 || h2 > 3.4 || w < 0.4 || w > 1.2) continue;
      if (syms.some((s0) => overlapFrac(b, s0.box) > 0.3)) continue;
      const m2 = matchTemplate(binSig(nl, b), w, h2, accTpl, LOOSE_ACC_DIST) ?? (w >= 0.6 && h2 >= 2.2 && h2 <= 3.2 && sharpShape(raster.bin, b) ? { smufl: "accidentalSharp" } : null);
      if (!m2) continue;
      const py = m2.smufl === "accidentalFlat" ? b.y + b.h * (1 + FLAT_BOWL_TOP) / 2 : b.y + b.h / 2;
      const right2 = b.x + b.w;
      if (!syms.some((s0) => /^notehead/.test(s0.code) && s0.box.x >= right2 - 2 && s0.box.x - right2 <= sp * LOOSE_ACC_GAP && Math.abs(s0.box.y + s0.box.h / 2 - py) <= sp / 4)) continue;
      merged.add(c2.id);
      syms.push({ box: b, code: m2.smufl });
      ledger.claim(b, `acc:${m2.smufl}`);
    }
  }
  for (const s of syms) {
    if (s.code !== "accidentalFlat") continue;
    const cut = Math.round(s.box.h * FLAT_BOWL_TOP);
    s.box = { x: s.box.x, y: s.box.y + cut, w: s.box.w, h: s.box.h - cut };
  }
  const stemHeads = [];
  const stemSegs = [];
  if (masks.length) {
    for (const c2 of blobs) {
      const met = metIds.has(c2.id) && !merged.has(c2.id);
      if (!met && (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id))) continue;
      const b = c2.bbox;
      const metSym = met ? syms.find((s0) => s0.box === b || s0.code.startsWith("metNote") && overlapFrac(b, s0.box) > 0.9) : void 0;
      if (met && !metSym) continue;
      if (syms.some((s0) => s0 !== metSym && overlapFrac(b, s0.box) > 0.5)) continue;
      const vr = longestVRun(raster.bin, b);
      const straight2 = vr >= b.h * 0.85 && vr >= unit.space * 2.5;
      const rm = straight2 ? null : matchTemplate(binSig(nl, b), b.w / unit.space, b.h / unit.space, restTpl);
      const rs = rm ?? (!straight2 && isEighthRest(nl, b, c2.area, unit) ? { smufl: "rest8th" } : null);
      if (rs && !inBand(b.y + b.h / 2)) continue;
      if (rs) {
        stemHeads.push({ box: b, code: rs.smufl });
        ledger.claim(b, `rest:${rs.smufl}`);
        continue;
      }
      let r4 = headFromStemBlock(raster.bin, b, c2.area, masks, unit, pitchGrid, onLineY, nl);
      const joined = [];
      if (!r4 && b.w < unit.space * 0.85 && b.h >= unit.space * 1.6) {
        let box = b;
        let area = c2.area;
        for (const c22 of blobs) {
          if (c22 === c2 || claimed.has(c22.id) || dictClaimed.has(c22.id) || merged.has(c22.id)) continue;
          const q2 = c22.bbox;
          if (q2.w > unit.space * 1.2 || q2.h > unit.space * 1.3) continue;
          if (q2.x > b.x + b.w + 2 || q2.x + q2.w < b.x - 2) continue;
          const nearEnd = q2.y + q2.h > b.y + b.h - unit.space * 1.3 || q2.y < b.y + unit.space * 1.3;
          if (!nearEnd || q2.y < b.y - 2 || q2.y + q2.h > b.y + b.h + 2) continue;
          const x0 = Math.min(box.x, q2.x);
          const y0 = Math.min(box.y, q2.y);
          box = { x: x0, y: y0, w: Math.max(box.x + box.w, q2.x + q2.w) - x0, h: Math.max(box.y + box.h, q2.y + q2.h) - y0 };
          area += c22.area;
          joined.push(c22.id);
        }
        if (joined.length && !syms.some((s0) => overlapFrac(box, s0.box) > 0.5)) r4 = headFromStemBlock(raster.bin, box, area, masks, unit, pitchGrid, onLineY, nl);
      }
      if (!r4) continue;
      if (!joined.length && b.w <= unit.space * 1.05 && b.h <= unit.space * 3.4 && tallStrokes(raster.bin, b) === 2) continue;
      for (const id of joined) merged.add(id);
      const dup = (hb) => [...syms, ...stemHeads].some((s0) => /^notehead/.test(s0.code) && overlapFrac(hb, s0.box) > 0.3);
      if (dup(r4.head)) continue;
      if (metSym) syms.splice(syms.indexOf(metSym), 1);
      stemHeads.push({ box: r4.head, code: "noteheadBlack" });
      for (const e of r4.extra) {
        if (dup(e)) continue;
        stemHeads.push({ box: e, code: "noteheadBlack" });
        ledger.claim(e, "stemblock:noteheadBlack");
      }
      stemSegs.push({ x0: r4.stemX, y0: r4.stemY0, x1: r4.stemX, y1: r4.stemY1, lw: unit.lineThick, maxLw: unit.lineThick * 2 });
      ledger.claim(r4.head, "stemblock:noteheadBlack");
    }
    syms.push(...stemHeads);
    const blackHeads = syms.filter((s0) => s0.code === "noteheadBlack").map((s0) => s0.box);
    const others = syms.filter((s0) => !/^notehead/.test(s0.code)).map((s0) => s0.box);
    for (const box of solidHeadsAlongStems(raster.bin, nl, masks, unit, pitchGrid, onLineY, [...prims.vSegs, ...stemSegs], blackHeads, [...others, ...prims.beams.map((b) => b.box)])) {
      syms.push({ box, code: "noteheadBlack" });
      ledger.claim(box, "along:noteheadBlack");
      const cy2 = Math.round(box.y + box.h / 2);
      for (let x = Math.round(box.x - unit.space * 1.6); x <= box.x - unit.space * 0.2; x++) {
        const run = vRunAt(nl, x, cy2);
        if (!run || run[1] - run[0] < unit.space * 1.5) continue;
        const nat = natFrom(x + 1, run);
        if (nat && !syms.some((s0) => overlapFrac(nat, s0.box) > 0.3)) {
          syms.push({ box: nat, code: "accidentalNatural" });
          ledger.claim(nat, "accid:accidentalNatural");
        }
        break;
      }
    }
  }
  const clfPos = [
    ...heads.filter((h2) => !dropHead.has(h2.comp.id) && h2.code === "noteheadBlack").map((h2) => h2.box),
    ...split.filter((s0) => s0.code === "noteheadBlack").map((s0) => s0.box),
    ...stemHeads.map((s0) => s0.box),
    ...stacked.filter((s0) => s0.code === "noteheadBlack").map((s0) => s0.box)
  ];
  const clfNeg = syms.filter((s0) => !/notehead/i.test(s0.code)).map((s0) => s0.box);
  const clf = masks.length ? trainHeadClassifier(raster.bin, masks, unit, onLineY, clfPos, clfNeg) : null;
  const clfHeads = [];
  const headTaken = (hb) => [...syms, ...clfHeads].some((s0) => /^notehead/.test(s0.code) && overlapFrac(hb, s0.box) > 0.3);
  if (clf) {
    for (const c2 of blobs) {
      if (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id)) continue;
      const b = c2.bbox;
      if (syms.some((s0) => overlapFrac(b, s0.box) > 0.5)) continue;
      const w = b.w / unit.space;
      const h2 = b.h / unit.space;
      if (w < CLF_W[0] || w > CLF_W[1] || h2 < CLF_H[0] || h2 > CLF_H[1]) continue;
      if (onBeamLine(b)) continue;
      const gy = pitchGrid(b.y + b.h / 2);
      if (gy === null) continue;
      if (headProb(clf, raster.bin, masks, unit, b, gy, onLineY(gy)) < CLF_P) continue;
      const hw = Math.round(unit.space * 1.25);
      const hh = Math.round(unit.space * 0.95);
      const box = { x: Math.round(b.x + b.w / 2 - hw / 2), y: Math.round(gy - hh / 2), w: hw, h: hh };
      if (headTaken(box)) continue;
      clfHeads.push({ box, code: "noteheadBlack" });
      ledger.claim(box, "clf:noteheadBlack");
    }
    if (masks.length) {
      for (const c2 of blobs) {
        if (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id)) continue;
        const b = c2.bbox;
        if (syms.some((s0) => overlapFrac(b, s0.box) > 0.5)) continue;
        const w = b.w / unit.space;
        const h2 = b.h / unit.space;
        if (w > BIG_W || h2 > BIG_H) continue;
        const parts = splitHeadCluster(
          noBeam,
          b,
          c2.area,
          masksNB.length ? masksNB : masks,
          unit,
          pitchGrid,
          onLineY,
          true,
          (pb, gy) => headProb(clf, raster.bin, masks, unit, pb, gy, onLineY(gy)) >= CLF_P
        );
        if (parts.length < 2) continue;
        for (const pb of parts) {
          if (headTaken(pb)) continue;
          clfHeads.push({ box: pb, code: "noteheadBlack" });
          ledger.claim(pb, "clfsplit:noteheadBlack");
        }
        claimed.add(c2.id);
      }
    }
    syms.push(...clfHeads);
  }
  {
    const hollowMask = buildHollowMasks(raster.bin, syms.filter((s0) => !s0.weak), unit, [])[0] ?? null;
    if (hollowMask) {
      const inFar = (y) => groups.some((g2) => y > g2.lines[0].y - unit.space * FAR_HEAD && y < g2.lines[4].y + unit.space * FAR_HEAD);
      const isFree = (c2) => !claimed.has(c2.id) && !dictClaimed.has(c2.id) && !merged.has(c2.id);
      for (let i2 = syms.length - 1; i2 >= 0; i2--) {
        const s0 = syms[i2];
        if (s0.code !== "noteheadBlack" || s0.box.w > unit.space * 0.95) continue;
        const sb = s0.box;
        const stemmed = prims.vSegs.some((v2) => {
          const vx = (v2.x0 + v2.x1) / 2;
          return (Math.abs(vx - sb.x) <= unit.space * 0.2 || Math.abs(vx - (sb.x + sb.w)) <= unit.space * 0.2) && Math.min(v2.y0, v2.y1) <= sb.y + sb.h && Math.max(v2.y0, v2.y1) >= sb.y;
        });
        if (stemmed) continue;
        const mates = blobs.filter((c2) => {
          if (!isFree(c2) || c2.bbox.w > unit.space * 1.1) return false;
          const r22 = c2.bbox;
          const vov = Math.min(sb.y + sb.h, r22.y + r22.h) - Math.max(sb.y, r22.y);
          const hgap = r22.x > sb.x ? r22.x - (sb.x + sb.w) : sb.x - (r22.x + r22.w);
          return vov >= Math.max(sb.h, r22.h) * 0.8 && hgap >= -unit.lineThick - 1 && hgap <= unit.space * 0.5;
        });
        if (mates.length !== 1) continue;
        const r4 = mates[0].bbox;
        const x0 = Math.min(sb.x, r4.x);
        const y0 = Math.min(sb.y, r4.y);
        const wb = { x: x0, y: y0, w: Math.max(sb.x + sb.w, r4.x + r4.w) - x0, h: Math.max(sb.y + sb.h, r4.y + r4.h) - y0 };
        if (wb.w < unit.space * 1.3 || wb.w > unit.space * 2.2) continue;
        syms.splice(i2, 1, { box: wb, code: "noteheadWhole" });
        merged.add(mates[0].id);
        ledger.claim(wb, "halves:noteheadWhole");
      }
      const free = blobs.filter((c2) => isFree(c2) && inFar(c2.bbox.y + c2.bbox.h / 2));
      const halves = syms.filter((s0) => s0.code === "noteheadHalf");
      const med2 = (xs) => xs.sort((p2, q2) => p2 - q2)[xs.length >> 1];
      const halfSize = halves.length ? { w: med2(halves.map((s0) => s0.box.w)), h: med2(halves.map((s0) => s0.box.h)) } : null;
      const inCavityBand = (y) => groups.some((g2) => y > g2.lines[0].y - unit.space * OPEN_CAVITY_BAND && y < g2.lines[4].y + unit.space * OPEN_CAVITY_BAND);
      const used = /* @__PURE__ */ new Set();
      for (const a of free) {
        if (used.has(a.id)) continue;
        let box = { ...a.bbox };
        let area = a.area;
        const group = [a.id];
        for (let again = true; again; ) {
          again = false;
          for (const b of free) {
            if (group.includes(b.id) || used.has(b.id)) continue;
            const r4 = b.bbox;
            const ov = Math.min(box.x + box.w, r4.x + r4.w) - Math.max(box.x, r4.x);
            const gap = r4.y > box.y ? r4.y - (box.y + box.h) : box.y - (r4.y + r4.h);
            const vov = Math.min(box.y + box.h, r4.y + r4.h) - Math.max(box.y, r4.y);
            const hgap = r4.x > box.x ? r4.x - (box.x + box.w) : box.x - (r4.x + r4.w);
            const halves2 = group.length === 1 && box.w <= unit.space * 0.9 && r4.w <= unit.space * 0.9 && vov >= Math.max(box.h, r4.h) * 0.8 && hgap > 0 && hgap <= unit.space * 0.5;
            if (!halves2) {
              const side = gap < 0 && Math.abs(r4.x - (box.x + box.w)) <= unit.lineThick * 2 + 1 && r4.h >= unit.space * 0.6;
              if (ov < Math.min(box.w, r4.w) * 0.3 && !side) continue;
              if (gap > unit.lineThick * 2 + 1) continue;
            }
            const x0 = Math.min(box.x, r4.x);
            const y0 = Math.min(box.y, r4.y);
            box = { x: x0, y: y0, w: Math.max(box.x + box.w, r4.x + r4.w) - x0, h: Math.max(box.y + box.h, r4.y + r4.h) - y0 };
            area += b.area;
            group.push(b.id);
            again = true;
          }
        }
        const w = box.w / unit.space;
        const h2 = box.h / unit.space;
        if (w < 0.8 || w > 2.2 || h2 < 0.6 || h2 > 3.2) continue;
        if (syms.some((s0) => overlapFrac(box, s0.box) > 0.3)) continue;
        {
          const whole = wholesByShape(raster.bin, nl, box, unit, pitchGrid, prims.vSegs);
          if (whole.length) {
            for (const id of group) used.add(id), merged.add(id);
            for (const wb of whole) {
              syms.push({ box: wb, code: "noteheadWhole" });
              ledger.claim(wb, "wholeshape:noteheadWhole");
            }
            continue;
          }
        }
        if (!inBand(box.y + box.h / 2)) continue;
        if (!holes.some((o) => o.x >= box.x && o.x + o.w <= box.x + box.w && o.y >= box.y - 1 && o.y + o.h <= box.y + box.h + 1)) {
          if (!halfSize) continue;
          if (box.w < halfSize.w * 0.8 && box.h > unit.space * 2.2) continue;
          const found = hollowHeadsFromCavities(nl, mergeHoles(openCavities(raster.bin, box, unit), unit, onLineOrGrid), unit, prims.vSegs, inCavityBand, syms.map((s0) => s0.box), halfSize, syms.filter((s0) => s0.code === "noteheadBlack").map((s0) => s0.box));
          if (!found.length) continue;
          for (const id of group) used.add(id), merged.add(id);
          for (const f2 of found) {
            syms.push(f2);
            ledger.claim(f2.box, `opencavity:${f2.code}`);
          }
          continue;
        }
        const shaped = w >= 1.1 && w <= 1.7 && (h2 >= 0.85 && h2 <= 1.3 || h2 >= HOLLOW_PAIR_H[0] && h2 <= 2.2);
        let parts = splitHeadCluster(raster.bin, box, area, [hollowMask], unit, pitchGrid, onLineY, true, void 0, 1, shaped ? HOLLOW_SHAPED_SCORE : HOLLOW_MASK_SCORE);
        if (parts.length <= 1 && h2 >= HOLLOW_PAIR_H[0] && h2 <= HOLLOW_PAIR_H[1] && w <= HOLLOW_PAIR_W) {
          const p2 = splitHeadCluster(raster.bin, box, area, [hollowMask], unit, pitchGrid, onLineY, true, void 0, 2, HOLLOW_PAIR_SCORE);
          if (p2.length === 2 && Math.abs(p2[0].y - p2[1].y) >= unit.space * 0.8 && Math.abs(p2[0].x - p2[1].x) <= unit.space * 0.3) parts = p2;
        }
        if (!parts.length) continue;
        for (const id of group) used.add(id), merged.add(id);
        for (const pb of parts) {
          const stemmed = prims.vSegs.some((v2) => {
            const vx = (v2.x0 + v2.x1) / 2;
            return (Math.abs(vx - pb.x) <= unit.space * 0.2 || Math.abs(vx - (pb.x + pb.w)) <= unit.space * 0.2) && Math.min(v2.y0, v2.y1) <= pb.y + pb.h && Math.max(v2.y0, v2.y1) >= pb.y;
          });
          const code = stemmed ? "noteheadHalf" : "noteheadWhole";
          syms.push({ box: pb, code });
          ledger.claim(pb, `hollowmask:${code}`);
        }
      }
    }
  }
  for (const c2 of blobs) {
    if (claimed.has(c2.id) || dictClaimed.has(c2.id) || merged.has(c2.id)) continue;
    const b = c2.bbox;
    if (b.w > unit.space || c2.area < b.w * b.h * 0.8) continue;
    const g2 = groups.find((g0) => Math.abs(b.y - g0.lines[0].y) <= unit.space * 0.4 && Math.abs(b.y + b.h - g0.lines[4].y) <= unit.space * 0.4);
    if (!g2) continue;
    if (syms.some((s0) => overlapFrac(b, s0.box) > 0.3)) continue;
    const x = b.x + b.w / 2;
    prims.vSegs.push({ x0: x, y0: b.y, x1: x, y1: b.y + b.h, lw: b.w, maxLw: b.w });
    merged.add(c2.id);
    ledger.claim(b, "bar:thick");
  }
  for (const g2 of groups) {
    const top = g2.lines[0].y - unit.space * 2;
    const bottom2 = g2.lines[4].y + unit.space * 2;
    const clef = syms.find((s0) => isClef(s0.code) && s0.box.y < g2.lines[4].y && s0.box.y + s0.box.h > g2.lines[0].y);
    if (!clef) continue;
    const onStaff = (r4) => r4.y < g2.lines[4].y && r4.y + r4.h > g2.lines[0].y;
    const edge = clef.box.x + clef.box.w;
    if (!syms.some((s0) => isAccidental(s0.code) && onStaff(s0.box) && s0.box.x >= edge - 1 && s0.box.x < edge + unit.space * KEY_GAP)) {
      const pair = sharpAsHeads(syms, edge, onStaff);
      if (pair) {
        for (const s0 of pair.heads) syms.splice(syms.indexOf(s0), 1);
        syms.push({ box: pair.box, code: "accidentalSharp" });
        ledger.claim(pair.box, "key:accidentalSharp");
      }
    }
    for (let i2 = syms.length - 1; i2 >= 0; i2--) {
      const b = syms[i2].box;
      if (/notehead/i.test(syms[i2].code) && b.x + b.w / 2 < clef.box.x + clef.box.w && b.y + b.h / 2 >= top && b.y + b.h / 2 <= bottom2) syms.splice(i2, 1);
    }
  }
  for (const d2 of findDots(nl, syms, unit, staffYs, (y) => gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick))) {
    syms.push({ box: d2, code: "augmentationDot" });
    ledger.claim(d2, "dot:augmentationDot");
  }
  {
    const accs = syms.filter((s0) => isAccidental(s0.code));
    for (let i2 = syms.length - 1; i2 >= 0; i2--)
      if (/^notehead/.test(syms[i2].code) && accs.some((a) => overlapFrac(syms[i2].box, a.box) > 0.7)) syms.splice(i2, 1);
  }
  {
    const sp = unit.space;
    const blacks = syms.filter((s0) => s0.code === "noteheadBlack");
    const joined = [];
    for (const q2 of [...prims.vSegs].sort((a, b) => Math.min(a.y0, a.y1) - Math.min(b.y0, b.y1))) {
      const x = (q2.x0 + q2.x1) / 2;
      const prev = joined.find((j2) => Math.abs((j2.x0 + j2.x1) / 2 - x) <= unit.lineThick && Math.min(q2.y0, q2.y1) - j2.y1 <= sp);
      if (prev) prev.y1 = Math.max(prev.y1, q2.y0, q2.y1);
      else joined.push({ ...q2, y0: Math.min(q2.y0, q2.y1), y1: Math.max(q2.y0, q2.y1) });
    }
    const bin = raster.bin;
    const walk = (x, y, dir) => {
      let last = y;
      for (let yy = y, miss = 0; miss <= 3 && yy >= 0 && yy < bin.h; yy += dir) {
        let on = false;
        for (let xx = Math.round(x - unit.lineThick); xx <= Math.round(x + unit.lineThick) && !on; xx++) on = xx >= 0 && xx < bin.w && bin.data[yy * bin.w + xx] === 1;
        if (on) {
          last = yy;
          miss = 0;
        } else miss++;
      }
      return last;
    };
    const isFlag2 = (b) => {
      const cy2 = b.y + b.h / 2;
      return joined.some((q2) => {
        if (q2.y1 - q2.y0 < sp * 1.5) return false;
        const sx = (q2.x0 + q2.x1) / 2;
        if (sx < b.x - sp * 0.3 || sx > b.x + b.w + sp * 0.3) return false;
        if (cy2 < q2.y0 - sp * FLAG_REACH || cy2 > q2.y1 + sp * FLAG_REACH) return false;
        const up = walk(sx, q2.y0, -1);
        const dn = walk(sx, q2.y1, 1);
        const far = cy2 - up > dn - cy2 ? up : dn;
        if (Math.abs(far - cy2) < sp * 2.5) return false;
        const nearStaff = (y) => staffGeoms.some((g2) => y > g2.top - sp * FLAG_HEAD_BAND && y < g2.bottom + sp * FLAG_HEAD_BAND);
        return blacks.some((h2) => {
          const hy = h2.box.y + h2.box.h / 2;
          return Math.abs(h2.box.x + h2.box.w / 2 - sx) < sp * 1.3 && Math.abs(hy - far) < sp && Math.abs(hy - cy2) >= sp * FLAG_GAP && nearStaff(hy);
        });
      });
    };
    for (let i2 = syms.length - 1; i2 >= 0; i2--)
      if ((syms[i2].code === "noteheadHalf" || syms[i2].code === "noteheadWhole") && isFlag2(syms[i2].box)) syms.splice(i2, 1);
  }
  if (hollowMasks.length) {
    const sp = unit.space;
    for (const s0 of syms) {
      if (s0.code !== "noteheadHalf" && s0.code !== "noteheadWhole") continue;
      const cx2 = s0.box.x + s0.box.w / 2;
      const cy2 = s0.box.y + s0.box.h / 2;
      const f2 = frames.find((q2) => cy2 > q2.top - sp * 3 && cy2 < q2.bottom + sp * 3);
      if (!f2) continue;
      const ys = f2.at(cx2);
      const pos = pitchPos(ys, cy2);
      if (!isFinite(pos) || Math.abs(pos - Math.round(pos)) < SNAP_AMBIG) continue;
      let best = null;
      for (const p2 of [Math.floor(pos), Math.ceil(pos)]) {
        const y = pitchY(ys, p2);
        const m2 = hollowMasks.find((k2) => k2.onLine === (p2 % 2 === 0)) ?? hollowMasks[0];
        const sc = scoreAt(raster.bin, m2, cx2, y);
        if (!best || sc > best.s) best = { y, s: sc };
      }
      if (best) s0.box = { ...s0.box, y: Math.round(s0.box.y + best.y - cy2) };
    }
  }
  {
    const sp = unit.space;
    const tol = Math.max(unit.lineThick * 2, sp * 0.25);
    for (const s0 of syms) {
      if (s0.code !== "noteheadBlack") continue;
      const b = s0.box;
      const cy2 = b.y + b.h / 2;
      const stemmed = [...prims.vSegs, ...stemSegs, ...inkStems].some((v2) => {
        const vx = (v2.x0 + v2.x1) / 2;
        return (Math.abs(vx - b.x) <= tol || Math.abs(vx - b.x - b.w) <= tol) && Math.min(v2.y0, v2.y1) <= cy2 + sp && Math.max(v2.y0, v2.y1) >= cy2 - sp;
      });
      if (stemmed && hollowSlit(raster.bin, b, sp)) s0.code = "noteheadHalf";
    }
  }
  {
    const sp = unit.space;
    const tol = Math.max(unit.lineThick * 2, sp * 0.25);
    for (const s0 of syms) {
      if (s0.code !== "noteheadHalf" && s0.code !== "noteheadBlack") continue;
      const b = s0.box;
      const cy2 = b.y + b.h / 2;
      const has = [...prims.vSegs, ...stemSegs, ...inkStems].some((v2) => {
        const vx = (v2.x0 + v2.x1) / 2;
        return (Math.abs(vx - b.x) <= tol || Math.abs(vx - b.x - b.w) <= tol) && Math.min(v2.y0, v2.y1) <= cy2 + sp && Math.max(v2.y0, v2.y1) >= cy2 - sp;
      });
      const own = has && [...prims.vSegs, ...stemSegs, ...inkStems].some((v2) => {
        const vx = (v2.x0 + v2.x1) / 2;
        const top = Math.min(v2.y0, v2.y1);
        const bot = Math.max(v2.y0, v2.y1);
        if (top > cy2 + sp || bot < cy2 - sp) return false;
        return Math.abs(vx - b.x) <= tol && bot >= cy2 + sp || Math.abs(vx - b.x - b.w) <= tol && top <= cy2 - sp;
      });
      if (has && own) continue;
      const col = inkColumn(nl, b, unit, has);
      if (!col) continue;
      const reach = Math.max(cy2 - col[0], col[1] - cy2);
      if (reach < sp * INK_STEM_REACH[0] || reach > sp * INK_STEM_REACH[1]) continue;
      const g2 = groups.find((q2) => cy2 > q2.lines[0].y - sp * 4 && cy2 < q2.lines[4].y + sp * 4);
      const inBeam = (y) => prims.beams.some((q2) => col[2] >= q2.box.x && col[2] <= q2.box.x + q2.box.w && y >= q2.box.y - 2 && y <= q2.box.y + q2.box.h + 2);
      if (g2 && Math.abs(col[0] - g2.lines[0].y) <= sp * 0.5 && Math.abs(col[1] - g2.lines[4].y) <= sp * 0.5 && !inBeam(col[0]) && !inBeam(col[1])) continue;
      inkStems.push({ x0: col[2], y0: col[0], x1: col[2], y1: col[1], lw: unit.lineThick, maxLw: unit.lineThick * 2 });
    }
  }
  {
    const alongMasks = buildHollowMasks(raster.bin, syms, unit, lineYs, 2);
    const added = [];
    for (const f2 of hollowHeadsAlongStems(raster.bin, nl, rawHoles, alongMasks, unit, makePitchSteps(groups), [...prims.vSegs, ...stemSegs, ...inkStems], syms)) {
      syms.push(f2);
      added.push(f2);
      ledger.claim(f2.box, "along:noteheadHalf");
    }
    if (added.length)
      for (const d2 of findDots(nl, syms, unit, staffYs, (y) => gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick), added)) {
        syms.push({ box: d2, code: "augmentationDot" });
        ledger.claim(d2, "dot:augmentationDot");
      }
  }
  if (raster.kind !== "gray1") {
    const sp = unit.space;
    for (let i2 = syms.length - 1; i2 >= 0; i2--) {
      if (!/^notehead/.test(syms[i2].code)) continue;
      const cy2 = syms[i2].box.y + syms[i2].box.h / 2;
      let g0 = groups[0];
      let d2 = Infinity;
      for (const g2 of groups) {
        const dd = Math.max(0, g2.lines[0].y - cy2, cy2 - g2.lines[4].y);
        if (dd < d2) d2 = dd, g0 = g2;
      }
      if (d2 <= sp * FAR_HEAD) continue;
      const b = syms[i2].box;
      const cx2 = b.x + b.w / 2;
      const dir = cy2 < g0.lines[0].y ? -1 : 1;
      const edgeY = dir < 0 ? g0.lines[0].y : g0.lines[4].y;
      let chain = true;
      for (let k2 = 1; k2 * sp < d2 - sp * 0.25; k2++) {
        const ly = edgeY + dir * k2 * sp;
        let ok = false;
        for (let y = Math.round(ly - sp * 0.3); y <= Math.round(ly + sp * 0.3) && !ok; y++) {
          if (y < 0 || y >= raster.bin.h) continue;
          let run = 0;
          for (let x = Math.round(cx2 - sp * 0.5); x <= Math.round(cx2 + sp * 0.5); x++) if (x >= 0 && x < raster.bin.w && raster.bin.data[y * raster.bin.w + x]) run++;
          ok = run >= sp * 0.9;
        }
        if (!ok) {
          chain = false;
          break;
        }
      }
      if (!chain) syms.splice(i2, 1);
    }
  }
  {
    const cx2 = (b) => b.x + b.w / 2;
    const cy2 = (b) => b.y + b.h / 2;
    const kept = [];
    for (let i2 = 0; i2 < syms.length; i2++) {
      const s0 = syms[i2];
      if (!/^notehead/.test(s0.code)) continue;
      if (kept.some((k2) => Math.abs(cy2(k2.box) - cy2(s0.box)) < unit.space * DUP_HEAD_DY && Math.abs(cx2(k2.box) - cx2(s0.box)) < unit.space * DUP_HEAD_DX)) {
        syms.splice(i2--, 1);
        continue;
      }
      kept.push(s0);
    }
  }
  for (let i2 = syms.length - 1; i2 >= 0; i2--) {
    const s0 = syms[i2];
    if (!isClef(s0.code) || midClefs.has(s0)) continue;
    const cy2 = s0.box.y + s0.box.h / 2;
    const g2 = groups.find((q2) => cy2 > q2.lines[0].y - unit.space && cy2 < q2.lines[4].y + unit.space);
    if (g2 && s0.box.x >= Math.max(...g2.lines.map((l2) => l2.left)) + unit.space * MID_CLEF_FROM) syms.splice(i2, 1);
  }
  const headBoxes = syms.filter((s0) => /notehead/i.test(s0.code)).map((s0) => ({ box: s0.box }));
  const pg = buildRasterPage({
    index,
    width: raster.bin.w,
    height: raster.bin.h,
    unit,
    // **只把分好组的那些线交下去**。`findStaves` 会拿 segs 自己再分一次组，
    // 而没进组的线里混着**通长的加线**（八度跑动共用的那条，实测宁静 p5
    // y=1004、x[244,1906]），它会顶掉真正的第五线、把整行谱上移一条线
    // ——那一行的音高整段低两级。分组那一步已经按「五条线左缘要一致」把它挡掉了，
    // 这里就别再把它递下去。
    staffLines: groups.flatMap((g2) => g2.lines),
    // 符头剪出来的加线要一并推进去，`findLegers` 才有得判
    // **没成组的那些行投影线要当加线用**，不能整个丢掉：密集八度跑动上方那一排短加线
    // 被行投影连成一条通长的线，它不是谱线（左缘对不上，见 `groupStaves`），
    // 但确实是加线——丢了的话上方那些符头一条加线都没有、`findLegers` 全判否，
    // 认出来的符头一个都归不了谱行（实测宁静 p5 那七个 C6 就是这样）。
    // 交给 `sharedLegers` 按符头切成短段，长度才过得了 `findLegers` 那道闸。
    hSegs: [
      ...prims.hSegs,
      ...heads.map((h2) => h2.ledger).filter((l2) => !!l2),
      // **所有认出来的符头都要参与切加线**，不只 `findRasterHeads` 那一批：
      // 按内腔找出来的（`stacked`）、拆块拆出来的（`split`）也压在加线上。
      // 少了它们，那些头的加线是按**邻居**切的、盖不住自己，`findLegers` 就判否
      // ——实测宁静钢琴右手 663 个带内符头只归属 574 个，差的 89 个几乎全是
      // 谱表上方一到两格、等着加线撑的那些。
      ...sharedLegers([...prims.hSegs, ...strayLines], headBoxes, onGrid, unit),
      // **骑在加线上的符头，自己那条加线要补出来。**
      // 它压在符头底下，`findPrimitives` 抽不出来（那一带的纵向游程是整个符头的高度）；
      // `trimLedger` 只给 `findRasterHeads` 那一批补，按内腔找出来的、拆块拆出来的都没有。
      // 于是谱表外一到两格的音「符头认出来了却挂不上谱行」——实测宁静钢琴右手
      // 120 个未归属的头里 89 个是这一类。
      // **要验墨**：那一带真有一条横墨才补，不然等于把 `findLegers` 那道防线拆了。
      ...ownLegers(headBoxes, raster.bin, onGrid, unit)
    ],
    // 符干要**续到符头里**才与符头纵向相交（`findStems` / `buildStems` 的硬判据）。
    // 续过的段只进 `SPage`，不回写 `prims`——`findBlobs` 那边仍按原段抹墨，
    // 免得把符头啃掉（见 `extendVSegs` 的说明）。
    // 被并进升降号的竖段要摘掉（留着会被当成符干或小节线）
    vSegs: snapHeadsToStems(syms, splitVoiceStems(extendVSegs(
      nl,
      joinThroughBars(raster.bin, joinVSegs(nl, [...prims.vSegs.filter((v2) => !usedSegs.has(v2)), ...stemSegs, ...inkStems], VSEG_JOIN_DX, Math.round(unit.space * VSEG_JOIN_GAP)), groups.map((g2) => [g2.lines[0].y, g2.lines[4].y]), unit.space),
      Math.round(unit.space * 0.35),
      groups.map((g2) => [g2.lines[0].y, g2.lines[4].y]),
      unit.lineThick
    ), headBoxes.map((h2) => h2.box), unit), unit),
    syms,
    braces: findBraces(nl, prims, unit, staffLefts, groups.map((g2) => ({ top: g2.lines[0].y, bottom: g2.lines[4].y }))).map((c2) => c2.bbox),
    sysBrackets: groupByLeftInk(raster.bin, groups.map((g2) => ({ top: g2.lines[0].y, bottom: g2.lines[4].y, left: Math.max(...g2.lines.map((l2) => l2.left)) })), unit)
  });
  if (!findStaves(pg)) return empty(pg, raster, unit, opts.carryTime, opts.carryKey);
  for (const stf of pg.staves) {
    if (stf.lineYs.length !== 5) continue;
    const f2 = frames.find((q2) => Math.abs(q2.top - stf.lineYs[0]) < unit.space);
    if (f2) stf.lineYsAt = f2.at;
  }
  findNoteheads(pg);
  inkSystemBarlines(pg, raster.bin, unit.space);
  tagSystemBarlines(pg);
  findStems(pg);
  tagLooseStems(pg);
  for (const f2 of bootstrapFlags(nl, pg, prims.beams, unit, harmonyMasks)) {
    ledger.claim(f2.box, `flag:${f2.code}`);
    const { obj, sym } = makeSymObj(pg.objs.length + pg.segs.length + 1, f2, unit.height);
    pg.objs.push(obj);
    pg.symbols.push(sym);
  }
  findTails(pg);
  findBarlines(pg);
  bridgeFaintSysLines(pg, raster.bin, unit.space);
  dropLoneBarlines(pg, raster.bin, unit.space);
  voteSystemBarlines(pg, raster.bin, unit.space);
  const ctx = findClefKeyTime(pg);
  shareSystemClefs(pg, ctx, unit);
  const clefTally = shareOctaveClefs(pg, ctx, opts.carryKey?.clefs);
  dropCourtesyKeys(pg, ctx, unit.space);
  demoteMidKeys(pg, ctx);
  extendKeyChains(pg, ctx);
  dropHeadsInKey(pg, ctx);
  for (const sec of keySections(pg, ctx, raster.bin)) {
    extendKeyByStrokes(pg, sec, raster.bin, unit);
    const settled = shareSystemKeys(pg, sec);
    shareKeySignature(sec, settled);
    carrySystemKeys(pg, sec, settled);
  }
  extendKeyByCarry(ctx, opts.carryKey, raster.bin, unit.space);
  shareTimeSignature(pg, ctx, timeCols, unit, raster.bin, !!opts.carryTime);
  dropBarsInKey(pg, ctx, unit.space);
  keyFromChords(pg, ctx, harmonies.map((h2) => h2.text), unit);
  fixFlatReadAsSix(harmonies, ctx);
  makeSystems(pg);
  makeBars(pg);
  for (const b of markRepeatsAndVoltas(pg, raster.bin, cmap, unit.space)) ledger.claim(b, "repeat:dot");
  for (const sg of pg.segs) {
    const tag = SEG_TAGS.find((t2) => sg.hasTag(t2));
    if (tag) ledger.claim({ x: sg.box.left, y: sg.box.top, w: sg.box.right - sg.box.left, h: sg.box.bottom - sg.box.top }, `seg:${tag}`);
  }
  const noteHeads = pg.symbols.filter((s0) => s0.hasTag("Note") && /^notehead/.test(s0.code));
  const thinOnLine = (b) => {
    if (b.box.h > unit.space * THIN_BEAM_H) return false;
    const cy2 = b.box.y + b.box.h / 2;
    if (!onGrid(cy2) && !gridYs.some((ly) => Math.abs(ly - cy2) <= unit.lineThick + 1)) return false;
    return noteHeads.some((h2) => h2.box.left < b.box.x + b.box.w && h2.box.right > b.box.x && Math.abs((h2.box.top + h2.box.bottom) / 2 - cy2) <= unit.space * 0.6);
  };
  const stemSegs0 = pg.segsWithTag("Stem");
  const textStroke = (b) => {
    const sp = unit.space;
    const wx0 = Math.max(0, Math.round(b.box.x - sp * 3));
    const wy0 = Math.max(0, Math.round(b.box.y - sp * 3));
    const wx1 = Math.min(nl.w - 1, Math.round(b.box.x + b.box.w + sp * 3));
    const wy1 = Math.min(nl.h - 1, Math.round(b.box.y + b.box.h + sp * 3));
    const W = wx1 - wx0 + 1;
    const seen = new Uint8Array(W * (wy1 - wy0 + 1));
    const st = [];
    for (let y = Math.round(b.box.y); y < b.box.y + b.box.h; y++)
      for (let x = Math.round(b.box.x); x < b.box.x + b.box.w; x++)
        if (x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1 && nl.data[y * nl.w + x] && !seen[(y - wy0) * W + x - wx0]) {
          seen[(y - wy0) * W + x - wx0] = 1;
          st.push(x, y);
        }
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    while (st.length) {
      const y = st.pop();
      const x = st.pop();
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (x === wx0 || x === wx1 || y === wy0 || y === wy1) return false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx;
        const Y = y + dy;
        if (X < wx0 || X > wx1 || Y < wy0 || Y > wy1 || !nl.data[Y * nl.w + X] || seen[(Y - wy0) * W + X - wx0]) continue;
        seen[(Y - wy0) * W + X - wx0] = 1;
        st.push(X, Y);
      }
    }
    if (!isFinite(x0)) return false;
    const w = (x1 - x0 + 1) / sp;
    const h2 = (y1 - y0 + 1) / sp;
    if (h2 < 1.5 || h2 > 3 || w > 3) return false;
    const inside = (x, y) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
    if (noteHeads.some((s0) => inside((s0.box.left + s0.box.right) / 2, (s0.box.top + s0.box.bottom) / 2))) return false;
    return !stemSegs0.some((s0) => inside(s0.cx, s0.top) || inside(s0.cx, s0.bottom));
  };
  const beams = toBeamShapes(prims.beams.filter((b) => !thinOnLine(b) && !textStroke(b)));
  snapBeamEnds(beams, pg.segs.filter((sg) => sg.isV && sg.hasTag("Stem")), raster.bin, unit.space);
  const stems = [];
  const hollowish = (s0) => {
    const b = s0.box;
    const cx2 = (b.left + b.right) / 2;
    const cy2 = (b.top + b.bottom) / 2;
    const rx = (b.right - b.left) * 0.3;
    const ry = (b.bottom - b.top) * 0.3;
    let wht = 0;
    let tot = 0;
    for (let y = Math.ceil(cy2 - ry); y <= cy2 + ry; y++) {
      if (gridYs.some((ly) => Math.abs(ly - y) <= unit.lineThick / 2 + 1)) continue;
      for (let x = Math.ceil(cx2 - rx); x <= cx2 + rx; x++) {
        if (((x - cx2) / rx) ** 2 + ((y - cy2) / ry) ** 2 > 1) continue;
        tot++;
        if (!raster.bin.data[y * raster.bin.w + x]) wht++;
      }
    }
    if (tot > 0 && wht / tot >= HOLLOW_FILL) return true;
    if (b.bottom - b.top > unit.space * HOLLOW_SMALL_H) return false;
    return enclosedWhite(nl, b, unit.space) >= (b.right - b.left) * (b.bottom - b.top) * HOLLOW_CAVITY;
  };
  {
    const flags = pg.symbols.filter((s0) => s0.hasTag("Tail"));
    const inFlag = (h2) => flags.some((f2) => {
      const w = Math.min(h2.box.right, f2.box.right) - Math.max(h2.box.left, f2.box.left);
      const hh = Math.min(h2.box.bottom, f2.box.bottom) - Math.max(h2.box.top, f2.box.top);
      return w > 0 && hh > 0 && w * hh >= (h2.box.right - h2.box.left) * (h2.box.bottom - h2.box.top) * FLAG_HEAD_OVERLAP;
    });
    const sp0 = unit.space;
    const heads2 = pg.symbols.filter((s0) => s0.hasTag("Note") && /^notehead/.test(s0.code));
    const besideHead = (h2) => heads2.some((o) => o !== h2 && Math.abs(o.box.right - h2.box.left) <= sp0 * 0.6 && Math.abs(o.py - h2.py) <= sp0 * 2.5 && o.box.left < h2.box.left);
    const stemSegs02 = pg.segs.filter((sg) => sg.isV && sg.hasTag("Stem"));
    const blacks = heads2.filter((o) => o.code === "noteheadBlack");
    const otherEndBlack = (h2) => stemSegs02.some((st) => {
      if (st.box.left > h2.box.right + sp0 * 0.3 || st.box.right < h2.box.left - sp0 * 0.3) return false;
      if (st.box.bottom < h2.box.top - sp0 * 0.3 || st.box.top > h2.box.bottom + sp0 * 0.3) return false;
      const hcy = (h2.box.top + h2.box.bottom) / 2;
      const far = Math.abs(hcy - st.box.top) < Math.abs(hcy - st.box.bottom) ? st.box.bottom : st.box.top;
      if (Math.abs(far - hcy) < sp0 * 1.5) return false;
      return blacks.some((o) => o.box.left <= st.box.right + sp0 * 0.3 && o.box.right >= st.box.left - sp0 * 0.3 && far >= o.box.top - sp0 * 0.5 && far <= o.box.bottom + sp0 * 0.5);
    });
    const walled = (h2) => stemWalledCavity(raster.bin, { x: Math.round(h2.box.left), y: Math.round(h2.box.top), w: Math.round(h2.box.right - h2.box.left), h: Math.round(h2.box.bottom - h2.box.top) }, sp0);
    pg.symbols = pg.symbols.filter(
      (s0) => !(s0.hasTag("Note") && inFlag(s0) && (s0.code === "noteheadHalf" && besideHead(s0) || (s0.code === "noteheadHalf" || s0.code === "noteheadWhole") && otherEndBlack(s0) && walled(s0)))
    );
  }
  {
    const sp0 = unit.space;
    const B = raster.bin;
    const legers = pg.segsWithTag("Leger").filter((sg) => sg.isH);
    for (const h2 of pg.symbols) {
      if (!h2.hasTag("Note") || !/^notehead/.test(h2.code) || !h2.ownerStaff || h2.ownerStaff.lineYs.length !== 5) continue;
      const stf = h2.ownerStaff;
      const hx = (h2.box.left + h2.box.right) / 2;
      const ys = stf.lineYsAt ? stf.lineYsAt(hx) : stf.lineYs;
      if (h2.py > ys[0] - sp0 * 0.3 && h2.py < ys[4] + sp0 * 0.3) continue;
      const above = h2.py < ys[0];
      const lineRow = (y) => ys.some((ly2) => Math.abs(ly2 - y) <= unit.lineThick);
      let yc = h2.py;
      {
        const w = h2.box.right - h2.box.left;
        const x0 = Math.max(0, Math.round(h2.box.left + w * 0.2));
        const x1 = Math.min(B.w - 1, Math.round(h2.box.right - w * 0.2));
        const rowInk = (y) => {
          if (y < 0 || y >= B.h) return false;
          for (let x = x0; x <= x1; x++) if (B.data[y * B.w + x]) return true;
          return false;
        };
        const cy2 = Math.round(h2.py);
        if (rowInk(cy2)) {
          let t2 = cy2;
          let b = cy2;
          while (rowInk(t2 - 1) && cy2 - t2 < sp0 * 1.5) t2--;
          while (rowInk(b + 1) && b - cy2 < sp0 * 1.5) b++;
          const hh = (b - t2 + 1) / sp0;
          let crosses = false;
          for (let y = t2; y <= b && !crosses; y++) crosses = lineRow(y);
          if (hh >= HEAD_INK_H[0] && hh <= HEAD_INK_H[1] && !crosses) yc = (t2 + b) / 2;
        }
      }
      const edge = above ? ys[0] : ys[4];
      const out = above ? -1 : 1;
      const spL = (ys[4] - ys[0]) / 4;
      const grid = [edge];
      const ly = legers.filter((sg) => sg.left < h2.box.right + sp0 * 0.3 && sg.right > h2.box.left - sp0 * 0.3).filter((sg) => sg.left <= h2.box.left - sp0 * 0.15 || sg.right >= h2.box.right + sp0 * 0.15).map((sg) => (sg.y0 + sg.y1) / 2).filter((y) => (y - edge) * out > sp0 * 0.5 && (y - yc) * out < sp0 * 0.5).sort((p2, q2) => (p2 - q2) * out);
      for (const y of ly) {
        const last = grid[grid.length - 1];
        const d2 = (y - last) * out;
        if (d2 < sp0 * 0.5) continue;
        if (d2 < spL * 0.8 || d2 > spL * 1.25) break;
        grid.push(y);
      }
      let pos = -1;
      const gapAt = (i2) => i2 + 1 < grid.length ? (grid[i2 + 1] - grid[i2]) * out : i2 > 0 ? (grid[i2] - grid[i2 - 1]) * out : sp0;
      let j2 = 0;
      for (let i2 = 1; i2 < grid.length; i2++) if (Math.abs(yc - grid[i2]) < Math.abs(yc - grid[j2])) j2 = i2;
      const dj = (yc - grid[j2]) * out;
      if (Math.abs(dj) <= gapAt(j2) * 0.25) pos = j2 * 2;
      else if (dj > 0) pos = j2 + 1 < grid.length || dj < sp0 * 0.9 ? j2 * 2 + 1 : -1;
      else pos = j2 > 0 ? j2 * 2 - 1 : -1;
      if (pos < 0) continue;
      const py = edge + out * (pos * spL) / 2;
      if (stf.middleStep(py, hx) !== stf.middleStep(h2.py, hx)) h2.py = py;
    }
  }
  const notes = buildNotes(pg, ctx, beams, stems, hollowish);
  for (let i2 = notes.length - 1; i2 >= 0; i2--) {
    const r4 = notes[i2];
    if (!r4.rest || r4.sym.code !== "restQuarter") continue;
    const rb = r4.sym.box;
    const cy2 = (rb.top + rb.bottom) / 2;
    if (cy2 >= r4.staff.box.top && cy2 <= r4.staff.box.bottom) continue;
    const beside = notes.some((n2) => {
      if (n2.rest) return false;
      const dx = n2.sym.box.left - rb.right;
      const hy = (n2.sym.box.top + n2.sym.box.bottom) / 2;
      return dx >= -unit.space * 0.3 && dx <= unit.space * 2.4 && hy >= rb.top - unit.space * 0.5 && hy <= rb.bottom + unit.space * 0.5;
    });
    if (beside) notes.splice(i2, 1);
  }
  attachAccidentalsByPitch(pg, ctx, notes);
  splitUnisons(notes, stems, beams, raster.bin, unit.space);
  markCrossStaff(pg, notes, stems, unit.space);
  fixDottedPairs(notes, unit.space);
  fixQuartersByBarSum(pg, ctx, notes, opts.carryTime, unit.space);
  findTuplets(pg, beams, stems, notes);
  const marks = findNotations(pg);
  const articSyms = marks.marks.filter((m2) => /^artic/.test(m2.code));
  attachNotations(pg, notes, marks.marks.filter((m2) => !/^artic/.test(m2.code)));
  for (const b of arpeggios) {
    const sp = unit.space;
    const near = notes.filter((n2) => !n2.rest && n2.sym.box.left >= b.x + b.w - sp * 0.3 && n2.sym.box.left <= b.x + b.w + sp * ARP_REACH && n2.sym.py >= b.y - sp * 0.6 && n2.sym.py <= b.y + b.h + sp * 0.6);
    if (!near.length) continue;
    const x0 = Math.min(...near.map((n2) => n2.sym.box.left));
    for (const n2 of near) if (n2.sym.box.left <= x0 + sp * 1.4) n2.marks = [...n2.marks ?? [], "arpeggiato"];
  }
  const dynamics = groupDynamics(marks.dynamics, cmap, unit);
  attachDynamicTexts(pg, notes, dynamics);
  const labelStrips = findStaffLabels(raster.bin, pg.staves, unit);
  const staffLabels = /* @__PURE__ */ new Map();
  for (const st of labelStrips) {
    const txt = opts.labelOcr?.get(labelKey(st));
    const name = txt ? normalizeLabel(txt) : null;
    if (name) staffLabels.set(st.staff, name);
  }
  if (harmonies.length) {
    const objs = harmonies.map((t2, i2) => makeTextObj(pg.objs.length + i2, { cells: [{ box: t2.box, ch: t2.text }], sizeDev: t2.box.h }));
    for (const o of objs) o.addTag("Harmony");
    pg.objs.push(...objs);
    attachHarmonies(pg, notes, objs, false);
    liftHarmonies(notes, pg.normalStaffSpace || pg.space);
  }
  const lyricLines = [];
  const lyricStats = { rows: 0, hit: 0, parity: 0 };
  const lyricStrips = [];
  {
    const noteCenters = notes.map((n2) => ({ x: (n2.sym.box.left + n2.sym.box.right) / 2, y: (n2.sym.box.top + n2.sym.box.bottom) / 2 }));
    const orphanHead = (c2) => claimed.has(c2.id) && !restIds.has(c2.id) && !harmonyIds.has(c2.id) && !noteCenters.some((p2) => p2.x >= c2.bbox.x - 1 && p2.x <= c2.bbox.x + c2.bbox.w + 1 && p2.y >= c2.bbox.y - 1 && p2.y <= c2.bbox.y + c2.bbox.h + 1);
    const segBlobs = pg.segs.filter((sg) => !sg.hasAnyTag()).map((sg, k2) => {
      const b = { x: Math.round(sg.box.left), y: Math.round(sg.box.top), w: Math.max(1, Math.round(sg.box.right - sg.box.left)), h: Math.max(1, Math.round(sg.box.bottom - sg.box.top)) };
      return { id: -1 - k2, bbox: b, area: b.w * b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
    });
    const rows = findLyricRows(
      [...blobs.filter((c2) => (!claimed.has(c2.id) || orphanHead(c2)) && !dictClaimed.has(c2.id)), ...segBlobs],
      pg.staves.map((st) => ({ top: st.box.top, bottom: st.box.bottom, left: st.box.left, right: st.box.right })),
      unit
    );
    {
      const spans = rows.filter((row) => row.cells.length >= 2 && row.cells.length <= 6).flatMap((row) => row.cells.map((c2) => ({ x0: c2.x, x1: c2.x + c2.w, y0: c2.y, y1: c2.y + c2.h })));
      const pad = unit.space * 0.1;
      const topStaves = new Set(pg.systems.map((sy) => sy.staves[0]));
      const inText = (n2) => {
        if (n2.rest || !topStaves.has(n2.staff)) return false;
        const bx = n2.sym.box;
        const cx2 = (bx.left + bx.right) / 2;
        const cy2 = (bx.top + bx.bottom) / 2;
        if (cy2 > n2.staff.box.top - unit.space * 1.25) return false;
        return spans.some((q2) => cx2 >= q2.x0 - pad && cx2 <= q2.x1 + pad && cy2 >= q2.y0 - pad && cy2 <= q2.y1 + pad);
      };
      for (let i2 = notes.length - 1; i2 >= 0; i2--) if (inText(notes[i2])) notes.splice(i2, 1);
    }
    for (const row of rows) for (const cell of row.cells) ledger.claim(cell, "lyric");
    const objs = [];
    const ocr = opts.lyricOcr;
    lyricStats.rows = rows.length;
    const stripRow = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const strip = stripOf(nl, row, 2, raster.lyricGray ?? raster.gray);
      if (strip) {
        lyricStrips.push(strip);
        stripRow.set(strip, row);
      }
    }
    const readRows = [];
    const latinRows = /* @__PURE__ */ new Set();
    const hitH = (ocr ? lyricStrips : []).filter((st) => ocr.get(stripKey(st))).map((st) => st.charH).sort((a, b) => a - b);
    const medH = hitH.length ? hitH[hitH.length >> 1] : 0;
    const latinStrips = /* @__PURE__ */ new Set();
    {
      const cand = (ocr ? lyricStrips : []).filter((st) => {
        const ch = ocr.get(stripKey(st));
        return ch && isLatinRow(ch, false, LATIN_MIN_CHAINED);
      });
      for (const st of cand) if (isLatinRow(ocr.get(stripKey(st)))) latinStrips.add(st);
      const yOf = (st) => Math.min(...stripRow.get(st).cells.map((c2) => c2.y));
      for (let grew = true; grew; ) {
        grew = false;
        for (const st of cand) {
          if (latinStrips.has(st)) continue;
          const r4 = stripRow.get(st);
          if ([...latinStrips].some((o) => stripRow.get(o).staffIndex === r4.staffIndex && st.charH >= o.charH * 0.75 && Math.abs(yOf(o) - yOf(st)) <= Math.max(o.charH, st.charH) * LATIN_CHAIN)) {
            latinStrips.add(st);
            grew = true;
          }
        }
      }
    }
    for (const strip of ocr ? lyricStrips : []) {
      const chars = ocr.get(stripKey(strip));
      if (!chars) continue;
      lyricStats.hit++;
      if (strip.charH < medH * LYRIC_MIN_H) continue;
      if (strip.cells.length <= 3 && foldLyricChars(chars).length < strip.cells.length * 0.5) continue;
      const latin = latinStrips.has(strip);
      if (latin || chars.some((c2) => new RegExp("\\p{Script=Han}", "u").test(c2.ch))) readRows.push(stripRow.get(strip));
      if (latin) latinRows.add(stripRow.get(strip));
      if (!latin && foldLyricChars(chars).length <= 1) continue;
      const mix = splitMixedChars(chars);
      const parts = mix ? [latinCells(strip, mix.la), mapCharsToCells(stripWithout(strip, mix.spans), mix.zh)] : [latin ? latinCells(strip, chars) : mapCharsToCells(strip, chars)];
      if (!latin && !mix && foldLyricChars(chars).length === strip.cells.length) lyricStats.parity++;
      for (const cells2 of parts) {
        if (!cells2.some((c2) => c2.ch)) continue;
        const o = makeTextObj(pg.objs.length + objs.length, { cells: cells2, sizeDev: strip.charH });
        o.addTag("Lyric");
        objs.push(o);
      }
    }
    pg.objs.push(...objs);
    if (readRows.length) {
      const inRow = (n2) => {
        const cx2 = (n2.sym.box.left + n2.sym.box.right) / 2;
        const cy2 = (n2.sym.box.top + n2.sym.box.bottom) / 2;
        const below = cy2 >= n2.staff.box.bottom + unit.space;
        if (!below && (cy2 > n2.staff.box.top - unit.space * 2 || n2.sym.code === "noteheadBlack")) return false;
        const pad = (r4) => r4.charH * 0.25;
        return readRows.some((r4) => {
          const top = Math.min(...r4.cells.map((c2) => c2.y));
          const bot = Math.max(...r4.cells.map((c2) => c2.y + c2.h));
          if (cy2 <= top || cy2 >= bot) return false;
          if (latinRows.has(r4)) return cx2 > Math.min(...r4.cells.map((c2) => c2.x)) && cx2 < Math.max(...r4.cells.map((c2) => c2.x + c2.w));
          const far = below ? cy2 >= n2.staff.box.bottom + unit.space * 2 : cy2 <= n2.staff.box.top - unit.space * 2;
          return r4.cells.some((c2) => {
            const [y0, y1] = far && c2.h < r4.charH * 0.6 ? [top, bot] : [c2.y, c2.y + c2.h];
            return cx2 > c2.x - pad(r4) && cx2 < c2.x + c2.w + pad(r4) && cy2 > y0 - pad(r4) && cy2 < y1 + pad(r4);
          });
        });
      };
      for (let i2 = notes.length - 1; i2 >= 0; i2--) {
        if (!inRow(notes[i2])) continue;
        const next = notes[i2 + 1];
        if (!notes[i2].chordExtra && next?.chordExtra && next.staff === notes[i2].staff) next.chordExtra = void 0;
        notes.splice(i2, 1);
      }
    }
    lyricLines.push(...buildLyricLines(pg, objs));
    foldBilingualLyrics(pg, lyricLines);
    moveEchoLines(pg, lyricLines, notes, unit.space);
    numberVersesByScript(pg, lyricLines);
    attachLyrics(notes, lyricLines, unit.space * 0.3);
    liftLyrics(pg, notes, unit.space);
  }
  if (!opts.carryTime && pg.staves.every((st) => !ctx.get(st)?.time.length)) {
    const sums = [];
    for (const st of pg.staves)
      for (const bar of st.bars) {
        const q22 = notes.filter((n2) => n2.staff === st && n2.voice === 1 && !n2.chordExtra && !n2.grace && n2.x >= bar.left && n2.x < bar.right).reduce((a, n2) => a + n2.duration * 4, 0);
        if (q22 > 0) sums.push(Math.round(q22 * 4) / 4);
      }
    const count = /* @__PURE__ */ new Map();
    for (const q22 of sums) count.set(q22, (count.get(q22) ?? 0) + 1);
    const ranked = [...count].filter(([q0]) => Number.isInteger(q0) && q0 >= 2 && q0 <= 9).sort((a, b) => b[1] - a[1]);
    const n4 = count.get(4) ?? 0;
    let q2 = 0;
    if (ranked.length && n4 >= 3 && n4 >= ranked[0][1] * 0.8) q2 = 4;
    else if (ranked.length && ranked[0][1] >= 3 && ranked[0][1] >= (ranked[1]?.[1] ?? 0) * 1.5) q2 = ranked[0][0];
    const first = pg.staves[0];
    const c0 = first && ctx.get(first);
    if (c0 && q2) {
      const x = (c0.key.length ? Math.max(...c0.key.map((s0) => s0.box.right)) : c0.clef?.box.right ?? first.box.left) + unit.space * 0.5;
      const mid = (first.box.top + first.box.bottom) / 2;
      const w = unit.space;
      const up = makeSymObj(pg.objs.length, { box: { x, y: Math.round(first.box.top), w, h: Math.round(mid - first.box.top) }, code: `timeSig${q2}` }, first.box.bottom - first.box.top);
      const dn = makeSymObj(pg.objs.length + 1, { box: { x, y: Math.round(mid), w, h: Math.round(first.box.bottom - mid) }, code: "timeSig4" }, first.box.bottom - first.box.top);
      c0.time.push(up.sym, dn.sym);
      fixQuartersByBarSum(pg, ctx, notes, opts.carryTime, unit.space);
    }
  }
  const jianpuFix = opts.jianpuOcr && jianpuStrips.length ? fuseJianpu(
    notes,
    jianpuStrips,
    (strip) => pg.staves.find((st) => Math.abs(st.box.top - groups[strip.staff].lines[0].y) < unit.space),
    (strip) => opts.jianpuOcr.get(jianpuKey(strip)),
    (st) => keyFifths(ctx.get(st)?.key ?? []),
    unit
  ) : null;
  {
    const cands = cmap.contours.filter((c2) => ledger.claimsOf(c2.id).every((q2) => q2.by === "lyric"));
    for (const tp of findRasterTuplets(pg, cands, notes, unit.space)) {
      if (tp.notes.some((n2) => n2.tuplet)) continue;
      applyTuplet(tp.notes, 3);
      for (const c2 of tp.contours) ledger.claim(c2.bbox, "tuplet");
    }
  }
  const wordStrips = opts.wordOcr || opts.wantWordStrips ? findWordStrips(raster.bin, pg.staves, unit) : [];
  if (opts.wordOcr) {
    const skip = [
      // 认下来的歌词行：从行顶往下两格半（`LyricLine` 只记行顶），左右以首尾音节为界
      ...lyricLines.filter((ln) => ln.syllables.length >= 3).map((ln) => {
        const l2 = Math.min(...ln.syllables.map((sy) => sy.left));
        const r4 = Math.max(...ln.syllables.map((sy) => sy.right));
        return { x: l2 - unit.space, y: ln.top - unit.space * 0.5, w: r4 - l2 + unit.space * 2, h: unit.space * 3 };
      }),
      ...harmonies.map((t2) => ({ x: t2.box.x, y: t2.box.y, w: t2.box.w, h: t2.box.h }))
    ];
    const placed = attachWordLines(pg, notes, wordStrips, opts.wordOcr, unit, skip, lyricStrips.map((st) => st.box));
    if (!harmonies.length && placed.chords.length) {
      const objs = placed.chords.map((t2, i2) => makeTextObj(pg.objs.length + i2, { cells: [{ box: t2.box, ch: t2.text }], sizeDev: t2.box.h }));
      for (const o of objs) o.addTag("Harmony");
      pg.objs.push(...objs);
      attachHarmonies(pg, notes, objs, false);
      liftHarmonies(notes, unit.space);
    }
    attachDynamicTexts(pg, notes, placed.dynamics.filter((d2) => !dynamics.some((q2) => Math.abs(q2.px - d2.px) <= unit.space * 3 && Math.abs(q2.py - d2.py) <= unit.space * 2)));
  }
  {
    const taken = pg.symbols.filter((s0) => s0.hasTag("Augmentation")).map((s0) => ({ x: s0.box.left, y: s0.box.top, w: s0.box.right - s0.box.left, h: s0.box.bottom - s0.box.top }));
    for (const a of findRasterArticulations(pg, cmap, unit, notes, articSyms, ledger.unclaimed(), taken, (id) => ledger.claimsOf(id).map((q2) => q2.by))) ledger.claim(a.box, `artic:${a.code}`);
  }
  const wedges = findRasterWedges(cmap, unit, ledger.unclaimed());
  for (const wg of wedges) {
    for (const id of [wg.contourId, wg.pairedId]) {
      const c2 = id === void 0 ? null : cmap.byId.get(id);
      if (c2) ledger.claim(c2.bbox, `wedge:${wg.type}`);
    }
  }
  attachWedges(pg, notes, wedges);
  const slurs = findRasterSlurs(cmap, unit, ledger.unclaimed(), pg.objs.length + pg.segs.length + 1e3);
  for (const sl of slurs) ledger.claim({ x: sl.obj.box.left, y: sl.obj.box.top, w: sl.obj.box.right - sl.obj.box.left, h: sl.obj.box.bottom - sl.obj.box.top }, "slur");
  const dashSide = (x0, x1, y) => {
    const sp = unit.space;
    if (!pg.staves.some((st) => y > st.box.top - sp * 4.5 && y < st.box.bottom + sp * 4.5)) return null;
    let best = null;
    for (const n2 of notes) {
      if (n2.rest) continue;
      const b = n2.sym.box;
      if (b.right < x0 - sp || b.left > x1 + sp) continue;
      const cy2 = (b.top + b.bottom) / 2;
      const d2 = Math.abs(cy2 - y);
      if (d2 <= sp * 3 && (!best || d2 < best.d)) best = { d: d2, cy: cy2 };
    }
    return best ? y < best.cy ? "above" : "below" : null;
  };
  const lyricOnly = cmap.contours.filter((c2) => {
    const cl = ledger.claimsOf(c2.id);
    return cl.length > 0 && cl.every((k2) => k2.by === "lyric");
  });
  const dashed = findRasterDashedSlurs([...ledger.unclaimed(), ...lyricOnly], unit, pg.objs.length + pg.segs.length + 1e3 + slurs.length, dashSide);
  for (const sl of dashed) ledger.claim({ x: sl.obj.box.left, y: sl.obj.box.top, w: sl.obj.box.right - sl.obj.box.left, h: sl.obj.box.bottom - sl.obj.box.top }, "slur:dashed");
  slurs.push(...dashed);
  attachSlurs(slurs, notes, unit.space);
  reconnectSlurs(pg, slurs);
  markSlurNotes(slurs);
  markLyricExtends(notes);
  return {
    page: pg,
    hasStaff: true,
    unknown: unknownObjs(pg).length,
    unit,
    raster,
    ctx,
    beams,
    notes,
    bars: checkBars(pg, ctx, notes, opts.carryTime),
    lyricLines,
    contours: cmap,
    ledger,
    lyricStrips,
    harmonyStrips,
    jianpuStrips,
    jianpuFix,
    harmonies,
    harmonyTexts,
    labelStrips,
    timeStrips,
    wordStrips: opts.wantWordStrips ? wordStrips : [],
    staffLabels,
    wedges,
    dynamics,
    slurs,
    lyricStats,
    debugBlobs: opts.debug ? blobs.map((c2) => ({ id: c2.id, box: c2.bbox, area: c2.area, claimed: claimed.has(c2.id) })) : void 0,
    debugNl: opts.debug ? nl : void 0,
    debugPrims: opts.debug ? prims : void 0,
    debugGroups: opts.debug ? groups.map((g2) => ({ top: g2.lines[0].y, bottom: g2.lines[4].y, space: g2.space })) : void 0,
    debugRest: opts.debug ? blobImage(nl, prims, unit, onGrid) : void 0,
    carryTime: lastTimeSignature(pg, ctx, opts.carryTime),
    // 没有调号的页也要把谱号的见证带下去：个数记零（`extendKeyByCarry` 见零不补）
    carryKey: { ...lastKey(pg, ctx, opts.carryKey) ?? { code: "accidentalFlat", n: 0 }, clefs: clefTally }
  };
}
function foldBilingualLyrics(pg, lines) {
  const latin = isLatinLine;
  for (const sys of pg.systems) {
    for (let i2 = 0; i2 + 1 < sys.staves.length; i2++) {
      const up = lines.filter((l2) => l2.staff === sys.staves[i2]);
      const lo = lines.filter((l2) => l2.staff === sys.staves[i2 + 1]);
      if (!up.length || !lo.length || up.some(latin) || !lo.every(latin)) continue;
      for (const l2 of lo) l2.staff = sys.staves[i2];
    }
  }
}
const LIFT_CHORDY = 0.3;
function liftLyrics(pg, notes, sp) {
  const choral = /* @__PURE__ */ new Set();
  for (const sys of pg.systems) if (sys.staves.length >= 3) for (const st of sys.staves) choral.add(st);
  const chordy = /* @__PURE__ */ new Set();
  for (const st of new Set(notes.map((n2) => n2.staff))) {
    if (choral.has(st)) continue;
    const ns = notes.filter((n2) => n2.staff === st && !n2.rest && !n2.grace);
    if (ns.filter((n2) => n2.chordExtra).length >= ns.filter((n2) => !n2.chordExtra).length * LIFT_CHORDY) chordy.add(st);
  }
  for (const n2 of notes) {
    if (!n2.lyrics?.length || n2.rest || !chordy.has(n2.staff)) continue;
    let top = n2;
    for (const m2 of notes)
      if (m2.staff === n2.staff && !m2.rest && !m2.grace && Math.abs(m2.x - n2.x) < sp * 0.5 && m2.diatonic > top.diatonic && (m2.chordExtra || n2.chordExtra) && m2.duration === n2.duration)
        top = m2;
    if (top === n2) continue;
    const move = n2.lyrics.filter((l2) => !top.lyrics?.some((q2) => q2.verse === l2.verse));
    if (!move.length) continue;
    (top.lyrics ??= []).push(...move);
    n2.lyrics = n2.lyrics.filter((l2) => !move.includes(l2));
    if (!n2.lyrics.length) n2.lyrics = void 0;
  }
}
const LATIN_VERSE = 100;
const SPLIT_RUN = 3;
const median$4 = (a) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
const isLatinLine = (l2) => {
  const t2 = l2.syllables.map((s) => s.text).join("");
  const cjk = [...t2].filter((c2) => /[\u3400-\u9fff]/.test(c2)).length;
  const lat = [...t2].filter((c2) => /[A-Za-z]/.test(c2)).length;
  return lat > cjk * 3;
};
function numberVersesByScript(pg, lines) {
  const span = (l2) => [Math.min(...l2.syllables.map((s) => s.left)), Math.max(...l2.syllables.map((s) => s.right))];
  const extra = [];
  for (const st of pg.staves) {
    const ls = lines.filter((l2) => l2.staff === st).sort((a, b) => a.top - b.top);
    const done = [];
    for (const l2 of ls) {
      const lat = isLatinLine(l2);
      const above = done.filter((o) => isLatinLine(o) === lat).map(span);
      const sw = median$4(l2.syllables.map((s) => s.right - s.left));
      const ks = l2.syllables.map((s) => above.filter(([a, b]) => s.cx > a - sw && s.cx < b + sw).length + 1);
      const k0 = above.filter(([a, b]) => a < span(l2)[1] && b > span(l2)[0]).length + 1;
      const runs = [];
      ks.forEach((k2, i2) => {
        const r4 = runs[runs.length - 1];
        if (r4 && r4.k === k2) r4.to = i2 + 1;
        else runs.push({ k: k2, from: i2, to: i2 + 1 });
      });
      const refrain = (r4) => !/^[（(]?阿$/.test(l2.syllables[r4.from].text) && (r4.from > 0 || /[。！？!?]$/.test(l2.syllables[r4.to - 1].text));
      const cut = runs.filter((r4) => r4.k !== k0 && r4.to - r4.from >= (lat ? SPLIT_RUN : 2) && (lat || refrain(r4)));
      l2.verse = lat ? LATIN_VERSE + k0 : k0;
      for (const r4 of cut) {
        extra.push({ ...l2, verse: lat ? LATIN_VERSE + r4.k : r4.k, syllables: l2.syllables.slice(r4.from, r4.to) });
      }
      if (cut.length) l2.syllables = l2.syllables.filter((_, i2) => !cut.some((r4) => i2 >= r4.from && i2 < r4.to));
      done.push(l2);
    }
  }
  lines.push(...extra);
}
const ECHO_LOWER = 0.5;
const ECHO_UPPER = 0.1;
const ECHO_UPPER_ROW = 0.15;
function moveEchoLines(pg, lines, notes, sp) {
  const xsOf = (st) => notes.filter((n2) => n2.staff === st && !n2.rest && !n2.grace).map((n2) => n2.x);
  const near = (x, xs) => Math.min(Infinity, ...xs.map((y) => Math.abs(y - x)));
  for (const sys of pg.systems) {
    for (let i2 = 0; i2 + 1 < sys.staves.length; i2++) {
      const up = sys.staves[i2];
      const lo = sys.staves[i2 + 1];
      const upX = xsOf(up);
      const loX = xsOf(lo);
      const frac = (l2, a, b) => l2.syllables.filter((q2) => near(q2.cx, a) + sp * 0.5 < near(q2.cx, b)).length / l2.syllables.length;
      const gap = lines.filter((l2) => l2.staff === up && l2.top < lo.box.top && l2.syllables.length >= 3).sort((p2, q2) => p2.top - q2.top);
      let seenUpper = false;
      let from = -1;
      gap.forEach((l2, k2) => {
        const lb = frac(l2, loX, upX);
        if (from < 0 && seenUpper && lb >= ECHO_LOWER && frac(l2, upX, loX) <= ECHO_UPPER) from = k2;
        if (lb <= ECHO_UPPER_ROW) seenUpper = true;
      });
      if (from >= 0) for (const l2 of gap.slice(from)) l2.staff = lo;
    }
  }
}
function settleLyricVerses(notes) {
  const count = /* @__PURE__ */ new Map();
  for (const n2 of notes) for (const l2 of n2.lyrics ?? []) if (l2.verse < LATIN_VERSE) count.set(l2.verse, (count.get(l2.verse) ?? 0) + 1);
  const most = Math.max(0, ...count.values());
  let zh = 0;
  for (const [v2, c2] of count) if (c2 >= most * 0.2) zh = Math.max(zh, v2);
  for (const n2 of notes) for (const l2 of n2.lyrics ?? []) if (l2.verse > LATIN_VERSE) l2.verse = zh + l2.verse - LATIN_VERSE;
}
function extendKeyChains(pg, ctx) {
  for (const c2 of ctx.values()) {
    if (!c2.key.length) continue;
    const onStaff = (b) => b.top < c2.staff.box.bottom && b.bottom > c2.staff.box.top;
    for (; ; ) {
      const last = c2.key[c2.key.length - 1];
      const nx = pg.symbols.find((s0) => {
        if (!isAccidental(s0.code) || s0.hasAnyTag() || !onStaff(s0.box)) return false;
        const dx = s0.box.left - last.box.right;
        return dx >= 0 && dx <= s0.box.right - s0.box.left;
      });
      if (!nx) break;
      nx.addTag("Key");
      c2.key = [...c2.key, nx];
    }
  }
}
function dropHeadsInKey(pg, ctx) {
  const sp = pg.normalStaffSpace || pg.space;
  const drop = /* @__PURE__ */ new Set();
  for (const c2 of ctx.values()) {
    if (!c2.clef) continue;
    const clef = c2.clef.box;
    const onStaff = (b) => b.top < c2.staff.box.bottom && b.bottom > c2.staff.box.top;
    const keys = pg.symbols.filter((s0) => s0.hasTag("Key") && onStaff(s0.box) && s0.box.left >= clef.left && s0.box.left < clef.right + sp * 10);
    if (!keys.length) continue;
    const right2 = Math.max(...keys.map((k2) => k2.box.right));
    for (const s0 of pg.symbols) {
      if (!s0.hasTag("Note") || !onStaff(s0.box)) continue;
      const cx2 = (s0.box.left + s0.box.right) / 2;
      if (cx2 > clef.left && cx2 < right2) drop.add(s0);
    }
  }
  if (drop.size) pg.symbols = pg.symbols.filter((s0) => !drop.has(s0));
}
function liftHarmonies(notes, sp) {
  for (const n2 of notes) {
    if (!n2.chord || n2.rest) continue;
    let top = null;
    for (const m2 of notes) {
      if (m2 === n2 || m2.rest || m2.chord || m2.staff !== n2.staff || Math.abs(m2.x - n2.x) >= sp * 0.5) continue;
      if (m2.sym.box.top >= (top ?? n2).sym.box.top) continue;
      top = m2;
    }
    if (!top) continue;
    top.chord = n2.chord;
    n2.chord = void 0;
  }
}
function tagLooseStems(pg) {
  const sp = pg.normalStaffSpace || pg.space;
  const heads = pg.symbols.filter((s0) => s0.ownerStaff && (s0.code === "noteheadBlack" || s0.code === "noteheadHalf"));
  for (const l2 of pg.segs) {
    if (!l2.isV || l2.hasAnyTag()) continue;
    const on = heads.filter((n2) => overlapY(l2.box, n2.box) && (Math.abs(n2.box.left - l2.cx) < sp * 0.2 || Math.abs(n2.box.right - l2.cx) < sp * 0.2));
    if (!on.length) continue;
    const top = Math.min(...on.map((n2) => (n2.box.top + n2.box.bottom) / 2));
    const bottom2 = Math.max(...on.map((n2) => (n2.box.top + n2.box.bottom) / 2));
    const upEnd = Math.abs(top - l2.top) <= sp && l2.bottom - bottom2 >= sp * 1.5;
    const downEnd = Math.abs(bottom2 - l2.bottom) <= sp && top - l2.top >= sp * 1.5;
    const twoSides = on.some((n2) => Math.abs(n2.box.right - l2.cx) < sp * 0.2) && on.some((n2) => Math.abs(n2.box.left - l2.cx) < sp * 0.2) && top - l2.top >= sp * 1.5 && l2.bottom - bottom2 >= sp * 1.5;
    if (!twoSides && on.every((n2) => n2.ownerStaff && isLeadNoteBarline(l2, n2, n2.ownerStaff))) continue;
    if (upEnd || downEnd || twoSides) l2.addTag("Stem");
  }
}
function dropCourtesyKeys(pg, ctx, sp) {
  const notes = pg.symbols.filter((q2) => q2.hasTag("Note"));
  for (const [st, c2] of ctx) {
    if (!c2.key.length) continue;
    const tail = (k2) => k2.box.left > st.box.right - sp * COURTESY_KEY && k2.box.left > st.box.left + sp * 12 && !notes.some((n2) => n2.ownerStaff === st && n2.px > k2.px);
    if (c2.key.some(tail)) c2.key = c2.key.filter((k2) => !tail(k2));
  }
}
function dropBarsInKey(pg, ctx, sp) {
  const endOf = (st) => {
    const c2 = ctx.get(st);
    if (!c2?.clef || c2.key.length < 3) return -1;
    return Math.min(c2.clef.box.right, st.box.left + sp * 3.6) + sp * (c2.key.length + 0.3);
  };
  for (const g2 of systemGroups(pg)) {
    const end = Math.max(...g2.map(endOf));
    if (end < 0) continue;
    for (const st of g2)
      for (const sg of pg.segs) {
        if (!sg.isV || !sg.hasTag("BarLine")) continue;
        if (sg.bottom <= st.box.top || sg.top >= st.box.bottom) continue;
        if (sg.cx > st.box.left + sp && sg.cx < end) sg.removeTag("BarLine");
      }
  }
}
function demoteMidKeys(pg, ctx) {
  const sp = pg.normalStaffSpace || pg.space;
  const heads = pg.symbols.filter((s0) => s0.hasTag("Note"));
  for (const c2 of ctx.values()) {
    if (!c2.clef || !c2.key.length) continue;
    let edge = c2.clef.box.right;
    const keep = [];
    for (const [i2, k2] of c2.key.entries()) {
      const chained = k2.box.left - edge <= sp * (i2 === 0 ? KEY_GAP_FIRST : KEY_GAP);
      const right2 = k2.box.right;
      const owned = heads.some((n2) => Math.abs(n2.py - k2.py) <= sp / 4 && n2.box.left >= right2 - 2 && n2.box.left - right2 <= sp * LOOSE_ACC_GAP);
      if (!chained && owned) continue;
      keep.push(k2);
      if (chained) edge = k2.box.right;
    }
    c2.key = keep;
  }
}
const LOOSE_ACC_GAP = 1.5;
const LOOSE_ACC_DIST = 80;
function attachAccidentalsByPitch(pg, ctx, notes) {
  const sp = pg.normalStaffSpace || pg.space;
  const keys = new Set([...ctx.values()].flatMap((c2) => c2.key));
  for (const n2 of notes) n2.accidental = null;
  const taken = /* @__PURE__ */ new Set();
  for (const a of pg.symbols) {
    if (!isAccidental(a.code) || keys.has(a)) continue;
    let best = null;
    let bd = Infinity;
    for (const n2 of notes) {
      if (n2.rest || taken.has(n2.sym)) continue;
      if (Math.abs(n2.sym.py - a.py) > sp / 4) continue;
      const gap = n2.sym.box.left - a.box.right;
      if (gap < -2 || gap > sp * LOOSE_ACC_GAP || gap >= bd) continue;
      best = n2;
      bd = gap;
    }
    if (!best) continue;
    for (const n2 of notes) if (n2.sym === best.sym) n2.accidental = accidentalAlter(a.code);
    taken.add(best.sym);
    a.addTag("Accidental");
  }
  calcAlters(pg, ctx, notes);
}
function keyFromChords(pg, ctx, texts, unit) {
  const all = [...ctx.values()];
  if (!all.length || all.some((c2) => c2.key.length)) return;
  const notes = [];
  for (const t2 of texts)
    for (const m2 of t2.matchAll(/(^|\/)([A-G])([#b♯♭]?)/g)) notes.push(m2[2] + (m2[3] === "#" || m2[3] === "♯" ? "#" : m2[3] ? "b" : ""));
  if (notes.length < 6) return;
  const scale = (f2) => new Set(
    "CDEFGAB".split("").map(
      (l2) => f2 > 0 && "FCGDAEB".slice(0, f2).includes(l2) ? l2 + "#" : f2 < 0 && "BEADGCF".slice(0, -f2).includes(l2) ? l2 + "b" : l2
    )
  );
  const score = (f2) => {
    const sc = scale(f2);
    return notes.filter((n2) => sc.has(n2)).length;
  };
  let best = 0;
  for (let f2 = -6; f2 <= 6; f2++) if (score(f2) > score(best) || score(f2) === score(best) && Math.abs(f2) < Math.abs(best)) best = f2;
  const spelled = notes.filter((n2) => n2.length === 2 && scale(best).has(n2)).length;
  if (best === 0 || spelled < 2 || score(best) < score(0) + 2 || score(best) < notes.length * 0.8) return;
  const code = best > 0 ? "accidentalSharp" : "accidentalFlat";
  for (const c2 of all) {
    if (!c2.clef) continue;
    const cb = c2.clef.box;
    c2.key = Array.from({ length: Math.abs(best) }, (_, i2) => {
      const box = { x: cb.right + 1 + i2 * unit.space * 0.8, y: cb.top, w: unit.space * 0.7, h: unit.space * 2.5 };
      return makeSymObj(pg.objs.length + pg.segs.length + 1 + i2, { box, code }, unit.height).sym;
    });
  }
}
function fixFlatReadAsSix(harmonies, ctx) {
  const c0 = [...ctx.values()].find((c2) => c2.key.length);
  const f2 = c0 ? keyFifths(c0.key) : 0;
  if (f2 >= 0) return;
  const flats = "BEADGCF".slice(0, -f2);
  for (const h2 of harmonies) {
    const m2 = /^([A-G])6(.*)$/.exec(h2.text);
    if (m2 && flats.includes(m2[1])) h2.text = `${m2[1]}b${m2[2]}`;
  }
}
const CARRY_GAP = 0.1;
const CARRY_REACH = 1.6;
const CARRY_INK = 1;
const CARRY_PITCH = 0.85;
function extendKeyByCarry(ctx, carry, bin, sp) {
  if (!carry) return;
  for (const c2 of ctx.values()) {
    if (!c2.key.length || c2.key.length >= carry.n) continue;
    if (!c2.key.every((k2) => k2.code === carry.code)) continue;
    const last = c2.key[c2.key.length - 1];
    const span = last.box.right - Math.min(...c2.key.map((k2) => k2.box.left));
    const cy2 = (last.box.top + last.box.bottom) / 2;
    const home = [...ctx.values()].reduce((a, q2) => Math.abs(staffMid(q2) - cy2) < Math.abs(staffMid(a) - cy2) ? q2 : a, c2);
    if (span < sp * CARRY_PITCH * (carry.n - 0.5) && !inkPastKey(bin, home.staff.lineYs, last.box.right, sp)) continue;
    c2.key = [...c2.key, ...Array.from({ length: carry.n - c2.key.length }, () => last)];
  }
}
const staffMid = (c2) => (c2.staff.lineYs[0] + c2.staff.lineYs[c2.staff.lineYs.length - 1]) / 2;
function inkPastKey(bin, lineYs, right2, sp) {
  if (lineYs.length < 2) return true;
  const y0 = Math.max(0, Math.round(lineYs[0] - sp * 1.5));
  const y1 = Math.min(bin.h - 1, Math.round(lineYs[lineYs.length - 1] + sp * 1.5));
  const onLine = (y) => lineYs.some((ly) => Math.abs(y - ly) <= sp * 0.2);
  for (let x = Math.round(right2 + sp * CARRY_GAP); x <= Math.min(bin.w - 1, Math.round(right2 + sp * CARRY_REACH)); x++) {
    let n2 = 0;
    for (let y = y0; y <= y1; y++) if (!onLine(y) && (bin.data[y * bin.w + x - 1] || bin.data[y * bin.w + x] || bin.data[y * bin.w + x + 1])) n2++;
    if (n2 >= sp * CARRY_INK) return true;
  }
  return false;
}
function lastKey(pg, ctx, carry) {
  for (let i2 = pg.staves.length - 1; i2 >= 0; i2--) {
    const k2 = ctx.get(pg.staves[i2])?.key ?? [];
    if (k2.length && k2.every((q2) => q2.code === k2[0].code) && (k2[0].code === "accidentalFlat" || k2[0].code === "accidentalSharp")) return { code: k2[0].code, n: k2.length };
  }
  return carry;
}
const HEAD_TIME_SP = 14;
const FINAL_THICK = 0.3;
function shareTimeSignature(pg, ctx, cols, unit, bin, carried) {
  const sp = unit.space;
  const key = (t2) => `${t2.beats}/${t2.beatType}`;
  const groups = systemGroups(pg).sort((a, b) => a[0].box.top - b[0].box.top);
  for (const [gi, sys] of groups.entries()) {
    const staves = sys.filter((st) => ctx.has(st) && st.lineYs.length === 5);
    if (staves.length < 2) continue;
    const prev = groups[gi - 1];
    const songHead = prev ? prev.filter((st) => endsWithFinal(st, bin)).length * 2 > prev.length : !carried;
    const colsOf = (st) => cols.filter((c2) => c2.mid > st.box.top && c2.mid < st.box.bottom);
    const headOf = (st) => {
      const all = timeSignatures(ctx.get(st).time, sp).filter((t2) => t2.x < st.box.left + sp * HEAD_TIME_SP);
      return all.length ? all[0] : null;
    };
    const votes = /* @__PURE__ */ new Map();
    const vote = (t2, x, st) => {
      const v2 = votes.get(key(t2)) ?? { ...t2, x, n: 0, staves: /* @__PURE__ */ new Set() };
      v2.n++;
      v2.staves.add(st);
      votes.set(key(t2), v2);
    };
    for (const st of staves) {
      const h2 = headOf(st);
      if (h2) vote(h2, h2.x, st);
      for (const c2 of colsOf(st)) if (c2.num !== null && c2.den !== null) vote({ beats: c2.num, beatType: c2.den }, c2.box.x, st);
    }
    if (!songHead) {
      const ok = [...votes.values()].filter((v2) => v2.staves.size >= 2).sort((a, b) => b.staves.size - a.staves.size || b.n - a.n)[0];
      if (!ok) {
        for (const st of staves) {
          const h2 = headOf(st);
          if (!h2 || !colsOf(st).some((c22) => c22.num === h2.beats && c22.den === h2.beatType && Math.abs(c22.box.x - h2.x) <= sp * 1.5)) continue;
          const c2 = ctx.get(st);
          const old = new Set(c2.time.filter((t2) => Math.abs(t2.px - h2.x) <= sp * 3));
          c2.time = c2.time.filter((t2) => !old.has(t2));
          pg.symbols = pg.symbols.filter((s0) => !old.has(s0));
        }
        continue;
      }
      for (const k2 of [...votes.keys()]) if (votes.get(k2) !== ok) votes.delete(k2);
    }
    if (!votes.size && songHead) {
      const all = staves.flatMap(colsOf).sort((a, b) => a.box.x - b.box.x);
      for (const c2 of all) {
        const near = all.filter((o) => Math.abs(o.box.x - c2.box.x) <= sp * 1.5);
        const num2 = near.find((o) => o.num !== null)?.num ?? null;
        const den = near.find((o) => o.den !== null)?.den ?? null;
        if (num2 !== null && den !== null) {
          vote({ beats: num2, beatType: den }, c2.box.x, staves[0]);
          break;
        }
      }
    }
    if (!votes.size) continue;
    const win = [...votes.values()].sort((a, b) => b.staves.size - a.staves.size || b.n - a.n)[0];
    for (const st of staves) {
      const c2 = ctx.get(st);
      const h2 = headOf(st);
      if (h2 && key(h2) === key(win)) continue;
      if (h2) {
        const old = new Set(c2.time.filter((t2) => Math.abs(t2.px - h2.x) <= sp * 3));
        c2.time = c2.time.filter((t2) => !old.has(t2));
        pg.symbols = pg.symbols.filter((s0) => !old.has(s0));
      }
      const col = colsOf(st).find((o) => Math.abs(o.box.x - win.x) <= sp * 1.5);
      const x = col ? col.box.x : Math.round(win.x - sp * 0.6);
      const w = col ? col.box.w : Math.round(sp * 1.2);
      const top = Math.round(st.box.top), mid = Math.round((st.box.top + st.box.bottom) / 2), bottom2 = Math.round(st.box.bottom);
      const put = (n2, y, h0) => {
        const ds = String(n2).split("");
        ds.forEach((d2, k2) => {
          const b = { x: Math.round(x + k2 * w / ds.length), y, w: Math.round(w / ds.length), h: h0 };
          const { obj, sym } = makeSymObj(pg.objs.length + pg.segs.length + 1, { box: b, code: `timeSig${d2}` }, unit.height);
          pg.objs.push(obj);
          pg.symbols.push(sym);
          c2.time.push(sym);
        });
      };
      put(win.beats, top, mid - top);
      put(win.beatType, mid, bottom2 - mid);
      pg.symbols = pg.symbols.filter((s0) => {
        if (!s0.hasTag("Note")) return true;
        const cx2 = (s0.box.left + s0.box.right) / 2, cy2 = (s0.box.top + s0.box.bottom) / 2;
        return !(cx2 > x && cx2 < x + w && cy2 > top - sp * 0.5 && cy2 < bottom2 + sp * 0.5);
      });
    }
  }
}
function keySections(pg, ctx, bin) {
  const groups = systemGroups(pg).sort((a, b) => a[0].box.top - b[0].box.top);
  const headTime = (st) => {
    const c2 = ctx.get(st);
    if (!c2?.time.length || st.lineYs.length !== 5) return false;
    const sp = (st.lineYs[4] - st.lineYs[0]) / 4;
    return Math.min(...c2.time.map((t2) => t2.box.left)) < st.box.left + sp * HEAD_TIME_SP;
  };
  const secs = [];
  groups.forEach((g2, i2) => {
    const prev = groups[i2 - 1];
    const fin = !!prev && prev.filter((st) => endsWithFinal(st, bin)).length * 2 > prev.length;
    if (!secs.length || fin || i2 > 0 && g2.every(headTime)) secs.push([]);
    secs[secs.length - 1].push(...g2);
  });
  if (secs.length < 2) return [ctx];
  return secs.map((sts) => new Map(sts.filter((st) => ctx.has(st)).map((st) => [st, ctx.get(st)])));
}
function endsWithFinal(st, bin) {
  if (st.lineYs.length !== 5) return false;
  const sp = (st.lineYs[4] - st.lineYs[0]) / 4;
  const y0 = Math.round(st.lineYs[0]), y1 = Math.round(st.lineYs[4]);
  const full = (x) => {
    let n2 = 0;
    for (let y = y0; y <= y1; y++) if (bin.data[y * bin.w + x]) n2++;
    return n2 >= (y1 - y0 + 1) * 0.9;
  };
  const runs = [];
  for (let x = Math.max(0, Math.round(st.box.right - sp * 2)); x <= Math.min(bin.w - 1, Math.round(st.box.right + sp * 0.5)); x++) {
    if (!full(x)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === x - 1) last[1] = x;
    else runs.push([x, x]);
  }
  if (runs.length < 2) return false;
  const [a, b] = runs.slice(-2);
  const thick = b[1] - b[0] + 1, thin = a[1] - a[0] + 1;
  return thick >= sp * FINAL_THICK && thin < thick * 0.6 && b[0] - a[1] <= sp;
}
function shareSystemKeys(pg, ctx) {
  const settled = /* @__PURE__ */ new Set();
  const sigOf = (c2) => c2.key.map((k2) => k2.code).join(",");
  for (const g2 of systemGroups(pg)) {
    if (g2.length < 3) continue;
    const cs = g2.map((st) => ctx.get(st)).filter((c2) => !!c2);
    const count = /* @__PURE__ */ new Map();
    for (const c2 of cs) if (c2.key.length) count.set(sigOf(c2), (count.get(sigOf(c2)) ?? 0) + 1);
    const ranked = [...count].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < 2 || ranked[1] && ranked[1][1] === ranked[0][1]) continue;
    const best = cs.find((c2) => c2.key.length && sigOf(c2) === ranked[0][0]);
    if (best.key.some((k2) => k2.code !== best.key[0].code)) continue;
    for (const c2 of cs) {
      if (sigOf(c2) !== ranked[0][0]) c2.key = best.key;
      settled.add(c2);
    }
  }
  return settled;
}
function pastSysLine(bin, lineYs, left, sp) {
  const top = lineYs[0];
  const bottom2 = lineYs[lineYs.length - 1];
  const full = (x, ya, yb) => {
    let n2 = 0;
    let tot = 0;
    for (let y = Math.round(ya); y <= Math.round(yb); y++) {
      if (y < 0 || y >= bin.h) continue;
      tot++;
      if (bin.data[y * bin.w + x] || bin.data[y * bin.w + x - 1] || bin.data[y * bin.w + x + 1]) n2++;
    }
    return tot > 0 && n2 >= tot * 0.75;
  };
  let last = -1;
  for (let x = Math.round(left); x <= Math.min(bin.w - 2, Math.round(left + sp * 4)); x++)
    if (full(x, top, bottom2) && (full(x, top - sp * 3, top - sp) || full(x, bottom2 + sp, bottom2 + sp * 3))) last = x;
  return last > left + sp * 0.5 ? last : left;
}
const SYS_LINE_INK = 0.5;
const SYS_LINE_GAP = 0.8;
const SYS_LINE_DX = 6;
function bridgeFaintSysLines(pg, bin, sp) {
  const groups = systemGroups(pg);
  const linked = (a, b) => {
    const y0 = Math.round(a.box.bottom + sp * 0.5);
    const y1 = Math.round(b.box.top - sp * 0.5);
    if (y1 - y0 < sp * 2) return false;
    const ink = (x, y) => x >= 0 && x < bin.w && bin.data[y * bin.w + x] === 1;
    const near = Math.abs(a.box.left - b.box.left) <= sp * SYS_LINE_DX;
    const xa = near ? Math.min(a.box.left, b.box.left) : a.box.left;
    const xb = near ? Math.max(a.box.left, b.box.left) : a.box.left;
    for (let x = Math.round(xa - sp); x <= Math.round(xb + sp); x++) {
      let n2 = 0, gap = 0, maxGap = 0;
      for (let y = y0; y <= y1; y++) {
        if (ink(x, y) || ink(x - 1, y) || ink(x + 1, y)) n2++, gap = 0;
        else maxGap = Math.max(maxGap, ++gap);
      }
      if (n2 / (y1 - y0 + 1) >= SYS_LINE_INK && maxGap < sp * SYS_LINE_GAP) return true;
    }
    return false;
  };
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const sts = run.flat();
      const top = Math.min(...sts.map((s) => s.box.top));
      const bottom2 = Math.max(...sts.map((s) => s.box.bottom));
      const left = Math.min(...sts.map((s) => s.box.left));
      pg.objs.push(makeSysBracketObj(pg.objs.length + pg.segs.length + 1, { x: left - sp, y: top, w: sp * 0.5, h: bottom2 - top }));
    }
    run = [];
  };
  for (const g2 of groups) {
    const prev = run[run.length - 1];
    if (prev && !linked(prev[prev.length - 1], g2[0])) flush();
    run.push(g2);
  }
  flush();
}
function carrySystemKeys(pg, ctx, settled) {
  const groups = systemGroups(pg).map((g2) => g2.map((st) => ctx.get(st)).filter((c2) => !!c2));
  const keyOf = groups.map((cs) => cs.find((c2) => settled.has(c2) && c2.key.length)?.key);
  const sigOf = (k2) => k2.map((q2) => q2.code).join(",");
  let pageRef;
  if (!settled.size) {
    const all = groups.flat();
    const count = /* @__PURE__ */ new Map();
    for (const c2 of all) if (c2.key.length) count.set(sigOf(c2.key), (count.get(sigOf(c2.key)) ?? 0) + 1);
    const top = [...count].sort((a, b) => b[1] - a[1])[0];
    const k2 = top && top[1] * 2 > all.length ? all.find((c2) => sigOf(c2.key) === top[0]).key : void 0;
    if (k2 && k2.every((q2) => q2.code === k2[0].code)) pageRef = k2;
    if (!pageRef) return;
  }
  for (const [i2, cs] of groups.entries()) {
    if (keyOf[i2]) continue;
    const ref = pageRef ?? keyOf.slice(0, i2).reverse().find((k2) => k2) ?? keyOf.slice(i2 + 1).find((k2) => k2);
    if (!ref) continue;
    const want = sigOf(ref);
    const isPrefix = (c2) => c2.key.length < ref.length && c2.key.every((k2, j2) => k2.code === ref[j2].code);
    const agree = cs.some((c2) => sigOf(c2.key) === want || c2.key.length > 0 && isPrefix(c2));
    for (const c2 of cs) if (isPrefix(c2)) c2.key = ref;
    const same = cs.filter((c2) => sigOf(c2.key) === want).length;
    const longer = (c2) => c2.key.length > ref.length && c2.key.every((k2) => k2.code === ref[0].code);
    if (agree || same * 2 > cs.length) {
      for (const c2 of cs) if (!longer(c2)) c2.key = ref;
    }
  }
}
function shareKeySignature(ctx, settled = /* @__PURE__ */ new Set()) {
  const all = [...ctx.values()].filter((c2) => !settled.has(c2));
  const sigOf = (c2) => c2.key.map((k2) => k2.code).join(",");
  const count = /* @__PURE__ */ new Map();
  for (const c2 of all) if (c2.key.length) count.set(sigOf(c2), (count.get(sigOf(c2)) ?? 0) + 1);
  let best = null;
  for (const c2 of all) if (c2.key.length && count.get(sigOf(c2)) >= 2 && (!best || c2.key.length > best.key.length)) best = c2;
  const longest = all.filter((c2) => c2.key.length).sort((a, b) => b.key.length - a.key.length)[0];
  const others = all.filter((c2) => c2.key.length && c2 !== longest);
  const pure = (c2) => c2.key.every((k2) => k2.code === c2.key[0].code);
  if (longest && pure(longest) && others.length >= 2 && (!best || longest.key.length > best.key.length) && others.every((c2) => c2.key.every((k2, i2) => k2.code === longest.key[i2].code)))
    best = longest;
  if (!best) return;
  const kind = best.key[0].code;
  if (best.key.some((k2) => k2.code !== kind)) return;
  for (const c2 of all) {
    if (c2.key.length <= best.key.length && c2.key.every((k2) => k2.code === kind || k2.code === "accidentalNatural") && c2.key.filter((k2) => k2.code === kind).length < best.key.length)
      c2.key = best.key;
    else if (c2.key.length > best.key.length && best.key.every((_, i2) => c2.key[i2]?.code === kind) && c2.key.slice(best.key.length).every((k2) => k2.code !== kind))
      c2.key = best.key;
  }
}
function sharpsByStrokes(bin, lineYs, clef, sp) {
  const top = lineYs[0];
  const bottom2 = lineYs[lineYs.length - 1];
  const x0 = Math.round(clef.x + Math.min(clef.w, sp * KEY_FROM));
  const box = { x: x0, y: Math.max(0, Math.round(top - sp * 1.5)), w: Math.round(sp * 9), h: Math.round(bottom2 - top + sp * 3) };
  if (box.x + box.w > bin.w || box.y + box.h > bin.h) return [];
  const strokes = verticalStrokes(bin, box, sp * 2);
  const barsAcross = (xm, t2, b) => {
    const mid = (t2 + b) / 2;
    let up = false;
    let dn = false;
    let run = 0;
    for (let y = box.y; y <= box.y + box.h; y++) {
      if (y < box.y + box.h && bin.data[y * bin.w + xm]) run++;
      else {
        if (run >= sp * 0.25) {
          const c2 = y - run / 2;
          if (c2 < mid) up = true;
          else dn = true;
        }
        run = 0;
      }
    }
    return up && dn;
  };
  const out = [];
  let lastX = x0;
  for (let i2 = 0; i2 + 1 < strokes.length; i2 += 2) {
    const a = strokes[i2];
    const b = strokes[i2 + 1];
    if (a.h > sp * 3.6 || b.h > sp * 3.6) break;
    const d2 = (b.x0 - a.x1) / sp;
    if (d2 < 0.15 || d2 > 0.8) break;
    if ((a.x0 - lastX) / sp > (out.length ? 1.6 : 2.5)) break;
    if (!barsAcross(Math.round((a.x1 + b.x0) / 2), Math.min(a.top, b.top), Math.max(a.bottom, b.bottom))) break;
    const t2 = Math.min(a.top, b.top);
    const pad = Math.round(sp * 0.2);
    out.push({ x: a.x0 - pad, y: t2, w: b.x1 - a.x0 + 1 + pad * 2, h: Math.max(a.bottom, b.bottom) - t2 + 1 });
    lastX = b.x1;
  }
  return out;
}
function inkSystemBarlines(pg, bin, sp) {
  const tol = sp * 0.3;
  const xTol = sp * 0.6;
  const barAt = makeBarAt(bin, sp);
  for (const g2 of systemGroups(pg)) {
    if (g2.length < 2) continue;
    const lands = (y) => g2.some((st) => Math.abs(y - st.box.top) <= tol || Math.abs(y - st.box.bottom) <= tol);
    const barOn = (l2, st) => l2.isV && (!l2.hasAnyTag() || l2.hasTag("BarLine")) && l2.top <= st.box.top + tol && l2.bottom >= st.box.bottom - tol && lands(l2.top) && lands(l2.bottom) && Math.abs(st.box.left - l2.cx) >= sp;
    for (const a of g2)
      for (const l2 of pg.segs.filter((q2) => barOn(q2, a))) {
        const lack = g2.filter((b) => b !== a && !pg.segs.some((m2) => barOn(m2, b) && Math.abs(m2.cx - l2.cx) <= xTol));
        if (!lack.length) continue;
        if (barAt(a, l2.cx, 2) === null) continue;
        const xs = lack.map((b) => barAt(b, l2.cx, Math.round(xTol)));
        if (xs.some((x) => x === null)) continue;
        lack.forEach((b, i2) => {
          const x = xs[i2];
          pushSeg(pg, pg.objs.length + pg.segs.length + 1, { x0: x, y0: b.box.top, x1: x, y1: b.box.bottom, lw: l2.lw, maxLw: l2.lw });
        });
      }
    const have = (st, x) => pg.segs.some((m2) => barOn(m2, st) && Math.abs(m2.cx - x) <= sp);
    const first = g2[0];
    for (let x = Math.round(first.box.left + sp * 3); x < first.box.right - sp; x++) {
      if (have(first, x) || barAt(first, x, 0, true) === null) continue;
      const xs = g2.slice(1).map((b) => barAt(b, x, Math.round(xTol), true));
      if (xs.some((q2) => q2 === null)) continue;
      if (g2.slice(1).some((b, i2) => have(b, xs[i2]))) continue;
      const lw = Math.max(1, first.lines[0]?.lw ?? 1);
      pushSeg(pg, pg.objs.length + pg.segs.length + 1, { x0: x, y0: first.box.top, x1: x, y1: first.box.bottom, lw });
      g2.slice(1).forEach((b, i2) => pushSeg(pg, pg.objs.length + pg.segs.length + 1, { x0: xs[i2], y0: b.box.top, x1: xs[i2], y1: b.box.bottom, lw }));
      x += Math.round(sp);
    }
  }
}
function dropLoneBarlines(pg, bin, sp) {
  const xTol = sp * 0.6;
  const barAt = makeBarAt(bin, sp);
  for (const g2 of systemGroups(pg)) {
    if (g2.length < 2) continue;
    const on = (l2, st) => l2.bottom > st.box.top + sp && l2.top < st.box.bottom - sp;
    const bars = pg.segs.filter((l2) => l2.isV && l2.hasTag("BarLine") && g2.some((st) => on(l2, st)));
    for (const l2 of bars) {
      const own = g2.filter((st) => on(l2, st));
      const others = g2.filter((st) => !own.includes(st));
      if (!others.length) continue;
      if (own.some((st) => l2.cx > st.box.right - sp * 1.5)) continue;
      const backed = others.some((st) => bars.some((m2) => m2 !== l2 && on(m2, st) && Math.abs(m2.cx - l2.cx) <= xTol) || barAt(st, l2.cx, Math.round(xTol), false, true) !== null);
      if (!backed) l2.removeTag("BarLine");
    }
  }
}
function joinThroughBars(bin, segs, staves, sp) {
  const top = (v2) => Math.min(v2.y0, v2.y1);
  const bot = (v2) => Math.max(v2.y0, v2.y1);
  const cx2 = (v2) => (v2.x0 + v2.x1) / 2;
  const tol = sp * THROUGH_END;
  const coverOf = (v2) => staves.findIndex(([a, b]) => Math.abs(top(v2) - a) <= tol && Math.abs(bot(v2) - b) <= tol);
  const rows = [...staves].sort((a, b) => a[0] - b[0]);
  const cand = segs.filter((v2) => bot(v2) - top(v2) > Math.abs(v2.x1 - v2.x0) && coverOf(v2) >= 0).sort((a, b) => top(a) - top(b));
  const used = /* @__PURE__ */ new Set();
  const out = [];
  for (const a of cand) {
    if (used.has(a)) continue;
    let cur = a;
    for (let again = true; again; ) {
      again = false;
      for (const b of cand) {
        if (b === a || used.has(b) || top(b) <= bot(cur) || Math.abs(cx2(b) - cx2(cur)) > sp * 0.2) continue;
        if (rows.some(([ra, rb]) => ra > bot(cur) + tol && rb < top(b) - tol)) continue;
        const x = Math.round((cx2(b) + cx2(cur)) / 2);
        let solid = true;
        for (let y = Math.ceil(bot(cur)); y <= Math.floor(top(b)) && solid; y++) {
          const row = y * bin.w;
          solid = !!(bin.data[row + x] || bin.data[row + x - 1] || bin.data[row + x + 1]);
        }
        if (!solid) continue;
        const la = bot(cur) - top(cur);
        const lb = bot(b) - top(b);
        const xm = (cx2(cur) * la + cx2(b) * lb) / (la + lb);
        cur = { x0: xm, x1: xm, y0: top(cur), y1: bot(b), lw: (cur.lw * la + b.lw * lb) / (la + lb), maxLw: Math.max(cur.maxLw, b.maxLw) };
        used.add(b);
        again = true;
        break;
      }
    }
    if (cur !== a) used.add(a), out.push(cur);
  }
  const clip = (v2) => {
    if (bot(v2) - top(v2) <= Math.abs(v2.x1 - v2.x0)) return v2;
    const cov = rows.filter(([ra, rb]) => top(v2) <= ra + sp * 0.3 && bot(v2) >= rb - sp * 0.3);
    if (cov.length < 2) return v2;
    const ya = cov[0][0];
    const yb = cov[cov.length - 1][1];
    if (top(v2) >= ya - sp * 0.3 && bot(v2) <= yb + sp * 0.3) return v2;
    return { ...v2, y0: Math.max(top(v2), ya), y1: Math.min(bot(v2), yb) };
  };
  return [...segs.filter((v2) => !used.has(v2)), ...out].map(clip);
}
function voteSystemBarlines(pg, bin, sp) {
  const xTol = sp * 0.6;
  const barAt = makeBarAt(bin, sp);
  for (const g2 of systemGroups(pg)) {
    if (g2.length < 3) continue;
    const on = (l2, st) => l2.bottom > st.box.top + sp && l2.top < st.box.bottom - sp;
    const bars = pg.segs.filter((l2) => l2.isV && l2.hasTag("BarLine") && g2.some((st) => on(l2, st))).sort((a, b) => a.cx - b.cx);
    const clusters = [];
    for (const l2 of bars) {
      const c2 = clusters[clusters.length - 1];
      if (c2 && l2.cx - c2[c2.length - 1].cx <= xTol) c2.push(l2);
      else clusters.push([l2]);
    }
    for (const c2 of clusters) {
      const rows = g2.filter((st) => c2.some((l2) => on(l2, st)));
      const xs = c2.map((l2) => l2.cx).sort((a, b) => a - b);
      const x = xs[xs.length >> 1];
      if (rows.length * 2 > g2.length) {
        const lw = Math.max(1, c2[0].lw);
        for (const st of g2) {
          if (rows.includes(st)) continue;
          if (x > st.box.right - sp * 1.5 || x < st.box.left + sp) continue;
          pushSeg(pg, pg.objs.length + pg.segs.length + 1, { x0: x, y0: st.box.top, x1: x, y1: st.box.bottom, lw }).addTag("BarLine");
        }
      } else if (rows.length * 3 <= g2.length) {
        const others = g2.filter((st) => !rows.includes(st));
        const backed = others.filter((st) => barAt(st, x, Math.round(xTol), false, true) !== null).length;
        if (backed + rows.length <= g2.length / 3) for (const l2 of c2) l2.removeTag("BarLine");
      }
    }
  }
}
function makeBarAt(bin, sp) {
  const ink = (x, y) => x >= 0 && x < bin.w && y >= 0 && y < bin.h && bin.data[y * bin.w + x] === 1;
  const runW = (x, y) => {
    let a = x;
    let b = x;
    while (ink(a - 1, y)) a--;
    while (ink(b + 1, y)) b++;
    return b - a + 1;
  };
  const walk = (x0, y0, y1) => {
    let x = x0;
    let miss = 0;
    let run = 0;
    let worst = 0;
    let wide = 0;
    let lo = x0;
    let hi = x0;
    for (let y = y0; y <= y1; y++) {
      if (ink(x, y)) run = 0;
      else if (ink(x - 1, y)) x--, run = 0;
      else if (ink(x + 1, y)) x++, run = 0;
      else {
        miss++;
        worst = Math.max(worst, ++run);
        continue;
      }
      if (Math.abs(x - x0) > sp * 0.15) return null;
      if (runW(x, y) > sp * 0.4) wide++;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return { miss, worst, wide, lo, hi };
  };
  const inked = (xa, xb, y0, y1) => {
    let n2 = 0;
    for (let y = y0; y <= y1; y++) {
      let any = false;
      for (let x = xa - 1; x <= xb + 1 && !any; x++) any = ink(x, y);
      if (any) n2++;
    }
    return n2 / Math.max(1, y1 - y0 + 1);
  };
  return (st, cx2, range, strict = false, through = false) => {
    const top = Math.round(st.box.top);
    const bottom2 = Math.round(st.box.bottom);
    const rows = bottom2 - top + 1;
    for (let d2 = 0; d2 <= range; d2++)
      for (const x of d2 ? [Math.round(cx2) - d2, Math.round(cx2) + d2] : [Math.round(cx2)]) {
        const w = walk(x, top, bottom2);
        if (!w || w.miss > rows * 0.06 || w.worst > 2) continue;
        if (w.wide > rows * 0.3) continue;
        if (strict) {
          let fat = 0;
          for (let y = top; y <= bottom2; y++) {
            if (st.lineYs.some((ly) => Math.abs(ly - y) <= sp * 0.15)) continue;
            const xx = [x, x - 1, x + 1, x - 2, x + 2].find((q2) => ink(q2, y));
            if (xx !== void 0 && runW(xx, y) > sp * 0.4) fat++;
          }
          if (fat > 2) continue;
        }
        if (!through && inked(w.lo, w.hi, Math.round(top - sp * 0.9), Math.round(top - sp * 0.4)) > 0.3) continue;
        if (!through && inked(w.lo, w.hi, Math.round(bottom2 + sp * 0.4), Math.round(bottom2 + sp * 0.9)) > 0.3) continue;
        return x;
      }
    return null;
  };
}
function fixQuartersByBarSum(pg, ctx, notes, carry, sp) {
  if (!lastTimeSignature(pg, ctx, carry)) return;
  const eps = 1e-6;
  for (const b of checkBars(pg, ctx, notes, carry)) {
    const bar = b.staff.bars[b.index];
    const inBar = notes.filter((n2) => n2.staff === b.staff && n2.x >= bar.left && n2.x < bar.right && !n2.grace).sort((p2, q2) => p2.x - q2.x);
    if (b.expect < 1 - eps)
      for (const n2 of inBar)
        if (!n2.rest && n2.base === 1 && n2.sym.code === "noteheadWhole") {
          n2.base = 1 / 2;
          n2.duration = 1 / 2 * (2 - 1 / 2 ** n2.dots);
        } else {
          const wholes = inBar.filter((n22) => !n22.rest && n22.base === 1 && n22.sym.code === "noteheadWhole");
          if (wholes.some((n22) => Math.abs(n22.x - wholes[0].x) > sp * 2) && b.expect < 2 - eps)
            for (const n22 of wholes) {
              n22.base = 1 / 2;
              n22.duration = 1 / 2 * (2 - 1 / 2 ** n22.dots);
            }
        }
    if (b.full) continue;
    const dirs = [...new Set(inBar.filter((n2) => !n2.rest).map((n2) => n2.stemUp))];
    for (const d2 of dirs.length > 1 ? dirs : [void 0]) {
      const mine = inBar.filter((n2) => n2.rest || d2 === void 0 || n2.stemUp === d2);
      const cols = [];
      for (const n2 of mine) {
        const c2 = cols[cols.length - 1];
        if (c2 && n2.x - c2.x <= sp * 0.6) c2.dur = Math.min(c2.dur, n2.duration), c2.ns.push(n2);
        else cols.push({ x: n2.x, dur: n2.duration, ns: [n2] });
      }
      const over = cols.reduce((a, c2) => a + c2.dur, 0) - b.expect;
      const k2 = Math.round(over * 8);
      if (k2 < 1 || Math.abs(over * 8 - k2) > eps || over > b.expect / 2 + eps) continue;
      const quarter = (c2) => c2.ns.every((n2) => !n2.rest && n2.base === 1 / 4 && !n2.dots && n2.sym.code === "noteheadBlack");
      const cand = cols.map((c2, i2) => ({ c: c2, gap: (cols[i2 + 1]?.x ?? bar.right) - c2.x })).filter((q2) => quarter(q2.c)).sort((p2, q2) => p2.gap - q2.gap);
      if (cand.length < k2) continue;
      if (cand.length > k2 && cand[k2 - 1].gap > cand[k2].gap * 0.8) continue;
      for (const { c: c2 } of cand.slice(0, k2))
        for (const n2 of c2.ns) {
          n2.base = 1 / 8;
          n2.duration = 1 / 8;
          n2.beams = Math.max(n2.beams, 1);
        }
    }
  }
}
function fixDottedPairs(notes, sp) {
  const barOf = (n2) => n2.staff.bars.find((b) => n2.x >= b.left && n2.x < b.right);
  const by = /* @__PURE__ */ new Map();
  for (const n2 of notes) if (!n2.rest) (by.get(n2.staff) ?? by.set(n2.staff, []).get(n2.staff)).push(n2);
  for (const ns of by.values()) {
    ns.sort((a, b) => a.x - b.x);
    for (const a of ns) {
      if (a.dots !== 1 || a.base !== 1 / 8 || a.stemUp === null) continue;
      const bar = barOf(a);
      const next = ns.find((b) => b.x > a.x + sp * 0.8 && b.stemUp === a.stemUp && barOf(b) === bar);
      if (!next || next.x - a.x > sp * 6) continue;
      for (const b of ns) {
        if (Math.abs(b.x - next.x) > sp * 0.6 || b.stemUp !== a.stemUp || b.base !== 1 / 8 || b.dots) continue;
        b.base = 1 / 16;
        b.duration = 1 / 16;
        b.beams = Math.max(b.beams, 2);
      }
    }
  }
}
function shareOctaveClefs(pg, ctx, carry) {
  const tally = {};
  for (const [k2, v2] of Object.entries(carry ?? {})) tally[k2] = { seen: v2.seen, g8: v2.g8.slice() };
  const rows = [];
  for (const g2 of systemGroups(pg)) {
    if (g2.length < 4) continue;
    const cs = g2.map((st) => ctx.get(st));
    if (!cs.every((c2) => !!c2?.clef && (c2.clef.code === "gClef" || c2.clef.code === "gClef8vb" || c2.clef.code === "fClef"))) continue;
    const key = `${g2.length}:${cs.map((c2) => c2.clef.code === "fClef" ? "f" : "g").join("")}`;
    const t2 = tally[key] ??= { seen: 0, g8: cs.map(() => 0) };
    t2.seen++;
    cs.forEach((c2, i2) => {
      if (c2.clef.code === "gClef8vb") t2.g8[i2]++;
    });
    rows.push({ key, cs });
  }
  for (const { key, cs } of rows) {
    const t2 = tally[key];
    cs.forEach((c2, i2) => {
      if (c2.clef.code === "gClef" && t2.g8[i2] >= 2 && t2.g8[i2] * 2 > t2.seen) c2.clef.code = "gClef8vb";
    });
  }
  return tally;
}
function shareSystemClefs(pg, ctx, unit) {
  const byLen = /* @__PURE__ */ new Map();
  for (const g2 of systemGroups(pg)) if (g2.length === 2) (byLen.get(g2.length) ?? byLen.set(g2.length, []).get(g2.length)).push(g2);
  for (const [len, gs] of byLen) {
    if (gs.length < 2) continue;
    for (let i2 = 0; i2 < len; i2++) {
      const tally = /* @__PURE__ */ new Map();
      for (const g2 of gs) {
        const code2 = ctx.get(g2[i2])?.clef?.code;
        if (code2) tally.set(code2, (tally.get(code2) ?? 0) + 1);
      }
      let [code, n2] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? [];
      const fs = tally.get("fClef") ?? 0;
      const tieBass = i2 === len - 1 && i2 > 0 && fs >= 1 && fs >= (tally.get("gClef") ?? 0) && gs.every((g2) => (ctx.get(g2[0])?.clef?.code ?? "gClef") === "gClef");
      if (tieBass) code = "fClef", n2 = gs.length;
      if (!code || n2 === void 0 || n2 < 2 || n2 * 2 <= gs.length) continue;
      for (const g2 of gs) {
        const c2 = ctx.get(g2[i2]);
        if (!c2 || c2.clef?.code === code) continue;
        if (c2.clef) c2.clef.code = code;
        else {
          const st = g2[i2];
          const box = { x: st.box.left + unit.space * 0.5, y: st.box.top, w: unit.space * 2.5, h: st.box.bottom - st.box.top };
          const sym = makeSymObj(pg.objs.length + pg.segs.length + 1, { box, code }, unit.height).sym;
          sym.addTag("Clef");
          c2.clef = sym;
          c2.clefs = [sym, ...c2.clefs ?? []];
        }
      }
    }
  }
}
function extendKeyByStrokes(pg, ctx, bin, unit) {
  const rows = [];
  for (const c2 of ctx.values()) {
    if (!c2.clef || c2.staff.lineYs.length !== 5) continue;
    const cb = c2.clef.box;
    const clef = { x: cb.left, y: cb.top, w: cb.right - cb.left, h: cb.bottom - cb.top };
    const bass = c2.clef.code === "fClef";
    let flats = flatsByStrokes(bin, c2.staff.lineYs, clef, bass, unit.space, unit.lineThick ?? 0);
    if (!bass && isCoarseKey(unit.space, unit.lineThick ?? 0)) {
      const st = flatsByStairs(bin, c2.staff.lineYs, clef, unit.space, unit.lineThick ?? 0);
      if (st.length > flats.length) flats = st;
    }
    rows.push({
      c: c2,
      flats,
      sharps: sharpsByStrokesLoose(bin, c2.staff.lineYs, clef, bass, unit.space)
    });
  }
  const pick = (of) => {
    for (let n2 = 7; n2 >= 1; n2--) {
      const m22 = rows.filter((r4) => of(r4).length >= n2).length;
      if (m22 >= 2) return { k: n2, m: m22 };
    }
    return { k: 0, m: 0 };
  };
  let f2 = pick((r4) => r4.flats);
  const sh = pick((r4) => r4.sharps);
  let lone = false;
  {
    const best = rows.reduce((a, r4) => Math.max(a, r4.flats.length), 0);
    if (best >= 3 && best >= f2.k + 2 && f2.k < 3 && rows.length <= 6 && !sh.k) f2 = { k: best, m: 1 }, lone = true;
  }
  if (!f2.k && !sh.k) return;
  const total = (of) => rows.reduce((a, r4) => a + of(r4).length, 0);
  const useSharp = sh.k > 0 && (!f2.k || total((r4) => r4.sharps) > total((r4) => r4.flats));
  const { k: k2, m: m2 } = useSharp ? sh : f2;
  const code = useSharp ? "accidentalSharp" : "accidentalFlat";
  const strokesOf = (r4) => useSharp ? r4.sharps : r4.flats;
  const countOf = (c2) => c2.key.filter((q2) => q2.code === code).length;
  const setKey = (c2, boxes) => {
    c2.key = boxes.map((box, i2) => {
      const sym = makeSymObj(pg.objs.length + pg.segs.length + 1 + i2, { box, code }, unit.height).sym;
      sym.addTag("Key");
      return sym;
    });
  };
  const maxStroke = Math.max(...rows.map((r4) => strokesOf(r4).length));
  const longer = rows.filter((r4) => countOf(r4.c) > k2);
  if (maxStroke <= k2 && longer.length && longer.length * 3 <= rows.length) for (const r4 of longer) r4.c.key = r4.c.key.filter((q2) => q2.code === code).slice(0, k2);
  const strong = m2 >= 2 && m2 * 2 >= rows.length || lone;
  for (const r4 of rows) {
    const c2 = r4.c;
    const got = strokesOf(r4);
    const mixed = c2.key.some((q2) => q2.code !== code);
    if (!mixed && countOf(c2) >= k2) continue;
    if (mixed && !strong && got.length < k2) continue;
    if (got.length >= k2) setKey(c2, got.slice(0, k2));
    else if (strong) {
      const cb = c2.clef.box;
      const x = got[0]?.x ?? cb.right + unit.space * 0.4;
      setKey(c2, Array.from({ length: k2 }, (_, i2) => ({ x: x + i2 * unit.space * 0.85, y: c2.staff.box.top, w: unit.space * 0.8, h: unit.space * 2.5 })));
    }
  }
}
function keyZoneStrokes(bin, lineYs, clef, sp, minH, maxW = 0.5) {
  const top = lineYs[0];
  const bottom2 = lineYs[lineYs.length - 1];
  const x0 = Math.round(clef.x + Math.min(clef.w, sp * KEY_FROM));
  const box = { x: x0, y: Math.max(0, Math.round(top - sp * 2)), w: Math.round(sp * 9), h: Math.round(bottom2 - top + sp * 3.5) };
  if (box.x + box.w > bin.w || box.y + box.h > bin.h) return null;
  const zone = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) zone[y * box.w + x] = bin.data[(box.y + y) * bin.w + box.x + x];
  const smear = { w: box.w, data: new Uint8Array(box.w * box.h) };
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < box.w; x++) {
      const i2 = y * box.w + x;
      if (zone[i2] || x > 0 && zone[i2 - 1] || x + 1 < box.w && zone[i2 + 1]) smear.data[i2] = 1;
    }
  const strokes = verticalStrokes(smear, { x: 0, y: 0, w: box.w, h: box.h }, minH, Math.max(2, Math.round(sp * 0.25))).map((k2) => ({ ...k2, x0: k2.x0 + box.x, x1: k2.x1 + box.x, top: k2.top + box.y, bottom: k2.bottom + box.y })).filter((k2) => k2.x1 - k2.x0 + 1 <= sp * maxW);
  const ink = (x, y) => x >= 0 && y >= 0 && x < bin.w && y < bin.h && bin.data[y * bin.w + x] === 1;
  return { x0, strokes, ink };
}
function sharpsByStrokesLoose(bin, lineYs, clef, bass, sp) {
  const z = keyZoneStrokes(bin, lineYs, clef, sp, sp * 1.6);
  if (!z) return [];
  const { x0, strokes, ink } = z;
  const STEP = [0, 1.5, -0.5, 1, 2.5, 0.5, 2];
  const fY = lineYs[bass ? 1 : 0];
  const thickRun = (x, cy2) => {
    let run = 0;
    for (let y = Math.round(cy2 - sp * 0.9); y <= Math.round(cy2 + sp * 0.9) + 1; y++) {
      if (y <= Math.round(cy2 + sp * 0.9) && ink(x, y)) run++;
      else {
        if (run >= sp * 0.22) return true;
        run = 0;
      }
    }
    return false;
  };
  const groups = [];
  for (const k2 of strokes) {
    const g2 = groups[groups.length - 1];
    if (g2 && k2.x0 - g2.x1 <= sp * 0.5 && g2.n < 2) g2.x1 = k2.x1, g2.top = Math.min(g2.top, k2.top), g2.bottom = Math.max(g2.bottom, k2.bottom), g2.n++;
    else groups.push({ x0: k2.x0, x1: k2.x1, top: k2.top, bottom: k2.bottom, n: 1 });
  }
  const out = [];
  let lastX = x0;
  for (const g2 of groups) {
    if (bass && g2.x0 < x0 + sp * 0.9) continue;
    if (out.length >= 7 || g2.bottom - g2.top > sp * 3.6) break;
    if ((g2.x0 - lastX) / sp > (out.length ? 1.6 : 3.2)) break;
    const cy2 = (g2.top + g2.bottom) / 2;
    const w = g2.x1 - g2.x0 + 1;
    const fits = w <= sp * 1 && // 头一个卡 0.5 格；后面的放到 1 格——伸出谱表的那半截（G、A 的上端）没有谱线托着、印得淡，
    // 量出来的中心往谱表里偏（道路真理生命歌第三个升号偏下 0.9 格）
    Math.abs((cy2 - fY) / sp - STEP[out.length]) <= (out.length ? 1 : 0.5) && (g2.n === 2 || thickRun(g2.x0 - Math.round(sp * 0.15), cy2));
    if (!fits) {
      if (!out.length) continue;
      break;
    }
    const pad = Math.round(sp * 0.2);
    out.push({ x: g2.x0 - pad, y: g2.top, w: w + pad * 2, h: g2.bottom - g2.top + 1 });
    lastX = g2.x1;
  }
  return out;
}
const STAIR_FROM = 3.4;
function flatsByStairs(bin, lineYs, clef, sp, thick) {
  const x0 = Math.round(clef.x + Math.min(clef.w, sp * STAIR_FROM));
  const x1 = Math.min(bin.w - 1, Math.round(x0 + sp * 9));
  const ink = (x, y) => x >= 0 && y >= 0 && x < bin.w && y < bin.h && bin.data[y * bin.w + x] === 1;
  let top = Math.round(lineYs[0]);
  {
    let bestN = 0;
    for (let y = Math.round(lineYs[0] - sp * 0.7); y <= Math.round(lineYs[0] + sp * 0.7); y++) {
      let n22 = 0;
      for (let x = x0; x <= x1; x++) if (ink(x, y)) n22++;
      if (n22 > bestN) bestN = n22, top = y;
    }
    if (bestN < (x1 - x0) * 0.8) return [];
  }
  const base = top - 1;
  const hs = [];
  for (let x = x0; x <= x1; x++) {
    let ya = base;
    while (ya > base - Math.max(1, Math.round(thick)) && !ink(x, ya)) ya--;
    let h2 = 0;
    while (ink(x, ya - h2)) h2++;
    hs.push(h2 ? base - ya + h2 : 0);
  }
  const peaks = [];
  for (let i2 = 0; i2 < hs.length; i2++) {
    if (hs[i2] < sp * 0.3) continue;
    let j2 = i2;
    let hi = i2;
    while (j2 + 1 < hs.length && hs[j2 + 1] >= sp * 0.3) if (hs[++j2] > hs[hi]) hi = j2;
    peaks.push({ x: x0 + hi, w: j2 - i2 + 1, h: hs[hi] / sp });
    i2 = j2;
  }
  let e;
  let d2;
  for (const [i2, p2] of peaks.entries()) {
    if (p2.w > sp * 0.7 || p2.h < 0.7 || p2.h > 1.7 || (p2.x - x0) / sp > 4.5) continue;
    const q2 = peaks.slice(i2 + 1).find((q22) => q22.h >= 0.3 && q22.w <= sp * 0.7 && (q22.x - p2.x) / sp >= 1.5);
    if (q2 && (q2.x - p2.x) / sp <= 2.6 && q2.h <= p2.h - 0.25) e = p2, d2 = q2;
    if (e) break;
  }
  if (!e || !d2) return [];
  const pitch = (d2.x - e.x) / 2;
  const STEP = [0, -1.5, 0.5, -1, 1, -0.5, 1.5];
  const topOf = (n22) => top - e.h * sp + (STEP[n22] + 1.5) * sp;
  const stemAt = (n22) => {
    const cx2 = e.x + (n22 - 1) * pitch;
    const want = topOf(n22);
    for (let x = Math.round(cx2 - sp * 0.35); x <= Math.round(cx2 + sp * 0.35); x++) {
      let run = 0;
      for (let y = Math.round(want - sp * 0.5); y <= Math.round(want + sp * 3.4); y++) {
        if (ink(x, y)) run++;
        else {
          if (run >= sp * 1.5 && run <= sp * 3.2 && Math.abs(y - run - want) <= sp * 0.5) return true;
          run = 0;
        }
      }
    }
    return false;
  };
  let n2 = 4;
  while (n2 < 7 && stemAt(n2)) n2++;
  {
    const isLine2 = (y) => [0, 1, 2, 3, 4].some((i2) => Math.abs(y - (top + thick / 2 + i2 * (lineYs[4] - lineYs[0]) / 4)) <= thick / 2 + 1);
    const colTop = (x) => {
      for (let y = Math.round(top - sp * 1.8); y <= Math.round(top + sp * 5.2); y++) if (!isLine2(y) && ink(x, y)) return y;
      return -1;
    };
    let end = d2.x;
    for (let x = d2.x, blank = 0; x <= Math.min(bin.w - 1, Math.round(e.x + pitch * 7)); x++) {
      if (colTop(x) >= 0) end = x, blank = 0;
      else if (++blank >= sp * 0.5) break;
    }
    const m2 = Math.round((end - e.x) / pitch - 0.8) + 2;
    if (m2 > n2 && m2 <= 7) {
      let t2 = Infinity;
      for (let x = Math.round(e.x + (m2 - 2) * pitch - sp * 0.35); x <= end; x++) {
        const y = colTop(x);
        if (y >= 0 && y < t2) t2 = y;
      }
      if (Math.abs(t2 - topOf(m2 - 1)) <= sp * 0.5) n2 = m2;
    }
  }
  const bY = lineYs[2];
  return Array.from({ length: n2 }, (_, i2) => ({
    x: Math.round(e.x + (i2 - 1) * pitch) - 1,
    y: Math.round(bY + STEP[i2] * sp - sp * FLAT_STEM),
    w: Math.round(sp * 0.8),
    h: Math.round(sp * (FLAT_STEM + 0.5))
  }));
}
function isCoarseKey(sp, thick) {
  return thick / sp > KEY_THICK_LINE && sp < KEY_COARSE_SPACE;
}
function flatsByStrokes(bin, lineYs, clef, bass, sp, thick = 0) {
  const r4 = thick / sp;
  const coarse = isCoarseKey(sp, thick);
  const z = keyZoneStrokes(bin, lineYs, clef, sp, sp * (coarse ? 1 + 2 * r4 + 0.25 : 1.2), coarse ? 1 : 0.5);
  if (!z) return [];
  const { x0, strokes, ink } = z;
  const STEP = [0, -1.5, 0.5, -1, 1, -0.5, 1.5];
  const bY = lineYs[bass ? 3 : 2];
  const isLine2 = (y) => lineYs.some((l2) => Math.abs(y - l2) <= Math.max(1, sp * 0.12));
  const density = (xa, xb, ya, yb) => {
    let n2 = 0;
    let tot = 0;
    for (let y = Math.round(ya); y <= Math.round(yb); y++) {
      if (y < 0 || y >= bin.h || isLine2(y)) continue;
      for (let x = Math.round(xa); x <= Math.round(xb); x++) {
        if (x < 0 || x >= bin.w) continue;
        tot++;
        if (ink(x, y)) n2++;
      }
    }
    return tot ? n2 / tot : 0;
  };
  const out = [];
  let lastX = x0;
  let skipped = false;
  let skipAt = -1;
  const boxAt = (x, cy2) => ({ x: Math.round(x) - 1, y: Math.round(cy2 - sp * FLAT_STEM), w: Math.round(sp * 0.8), h: Math.round(sp * (FLAT_STEM + 0.5)) });
  for (const [i2, k2] of strokes.entries()) {
    if (out.length >= 7 || k2.h > sp * (coarse ? 4.2 : 3.2)) break;
    const nx = strokes[i2 + 1];
    const mid = (q2) => (q2.x0 + q2.x1) / 2;
    if (nx && (coarse ? (mid(nx) - mid(k2)) / sp < 0.6 : (nx.x0 - k2.x1) / sp < 0.5) && nx.h >= sp * 1.8 && k2.h >= sp * 1.8) break;
    const gap = coarse ? (mid(k2) - lastX) / sp - (out.length ? 0.5 : 0) : (k2.x0 - lastX) / sp;
    if (gap > (out.length ? 2.6 : 4.2)) break;
    if (out.length && gap < 0.5) continue;
    let cy2 = 0;
    let bowl = 0;
    for (let y = k2.top + Math.round(sp * 0.5); y <= k2.bottom + Math.round(sp * 0.3); y++) {
      const d2 = density(k2.x1 + 1, k2.x1 + sp * 0.6, y - sp * 0.45, y + sp * 0.45) - density(k2.x0 - sp * 0.6, k2.x0 - 1, y - sp * 0.45, y + sp * 0.45);
      if (d2 > bowl) bowl = d2, cy2 = y;
    }
    const at = (n22) => n22 < 7 && bowl >= 0.15 && Math.abs((cy2 - bY) / sp - STEP[n22]) <= (coarse ? 0.7 : 0.45);
    const n2 = out.length;
    if (at(n2) && gap <= (n2 ? 1.6 : 3.2)) out.push(boxAt(k2.x0, cy2));
    else if (!skipped && at(n2 + 1) && gap >= 1.2) {
      skipped = true;
      skipAt = n2;
      out.push(boxAt(k2.x0 - sp * 0.85, bY + STEP[n2] * sp), boxAt(k2.x0, cy2));
    } else if (!n2) continue;
    else break;
    lastX = coarse ? mid(k2) : k2.x1;
  }
  if (skipAt >= 0 && out.length - skipAt - 1 < 2) out.length = skipAt;
  return out;
}
const CROSS_VOICE = 5;
const CROSS_STEM = 5;
function markCrossStaff(pg, notes, stems, sp) {
  const bySym = /* @__PURE__ */ new Map();
  for (const n2 of notes) bySym.set(n2.sym, n2);
  for (const g2 of systemGroups(pg)) {
    for (let i2 = 0; i2 + 1 < g2.length; i2++) {
      const a = g2[i2];
      const b = g2[i2 + 1];
      const mid = (a.box.bottom + b.box.top) / 2;
      for (const st of stems) {
        const len = st.seg.box.bottom - st.seg.box.top;
        if (len < sp * CROSS_STEM) continue;
        for (const s of st.notes) {
          const n2 = bySym.get(s);
          if (!n2 || n2.rest) continue;
          const cross = n2.staff === a && !st.up && st.seg.box.bottom > mid || n2.staff === b && st.up && st.seg.box.top < mid;
          if (!cross) continue;
          const other = n2.staff === a ? b : a;
          const shared = stems.some((o) => o !== st && o.beams.some((q2) => st.beams.includes(q2)) && o.notes.some((t2) => t2.code === "noteheadBlack" && bySym.get(t2)?.staff === other && !bySym.get(t2)?.crossStaff));
          if (!shared) continue;
          n2.crossStaff = true;
          n2.voice = CROSS_VOICE;
        }
      }
    }
  }
}
function splitUnisons(notes, stems, beams, bin, sp) {
  const up = /* @__PURE__ */ new Set();
  const down = /* @__PURE__ */ new Set();
  for (const st of stems) {
    const cx2 = (st.seg.box.left + st.seg.box.right) / 2;
    for (const s of st.notes) {
      const w = s.box.right - s.box.left;
      if (st.up && cx2 > s.box.left + w * 0.6) up.add(s);
      if (!st.up && cx2 < s.box.left + w * 0.4) down.add(s);
    }
  }
  const reach = (x0, x1, y0, dir) => {
    const drift = Math.max(2, sp * 0.15);
    const ink = (x, y) => x >= 0 && x < bin.w && y >= 0 && y < bin.h && bin.data[y * bin.w + x] === 1;
    let most = 0;
    for (let xs = Math.round(x0); xs <= Math.round(x1); xs++) {
      let last = 0;
      for (let x = xs, y = Math.round(y0), k2 = 0, miss = 0; miss <= 2 && y >= 0 && y < bin.h; y += dir, k2++) {
        if (ink(x, y)) miss = 0;
        else if (x > x0 && ink(x - 1, y)) x--, miss = 0;
        else if (x < x1 && ink(x + 1, y)) x++, miss = 0;
        else {
          miss++;
          continue;
        }
        if (Math.abs(x - xs) > drift) break;
        last = k2 + 1;
      }
      most = Math.max(most, last);
    }
    return most;
  };
  const headRows = (x0, x1, y0, y1, lo = 0.6, hi = 1.8) => {
    let rows = 0;
    for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) {
      if (y < 0 || y >= bin.h) continue;
      if (beams.some((q2) => q2.box.left <= x1 && q2.box.right >= x0 && y >= q2.box.top - 1 && y <= q2.box.bottom + 1)) continue;
      let widest = 0;
      for (let x = Math.round(x0); x <= Math.round(x1); x++) {
        if (x < 0 || x >= bin.w || !bin.data[y * bin.w + x]) continue;
        let l2 = x;
        let r4 = x;
        while (l2 > 0 && bin.data[y * bin.w + l2 - 1]) l2--;
        while (r4 < bin.w - 1 && bin.data[y * bin.w + r4 + 1]) r4++;
        widest = Math.max(widest, r4 - l2 + 1);
      }
      if (widest >= sp * lo && widest <= sp * hi) rows++;
    }
    return rows;
  };
  const heads = notes.filter((n2) => !n2.rest).map((n2) => n2.sym);
  const clear = (s, x0, x1, y0, y1) => !heads.some((o) => o !== s && o.box.right > x0 && o.box.left < x1 && o.box.bottom > Math.min(y0, y1) && o.box.top < Math.max(y0, y1));
  for (const n2 of notes) {
    if (n2.rest || n2.grace || up.has(n2.sym) === down.has(n2.sym)) continue;
    const b = n2.sym.box;
    const w = b.right - b.left;
    const out = Math.max(1, sp * 0.25);
    if (up.has(n2.sym)) {
      const x1 = b.left + w * 0.3;
      const len = reach(b.left - out, x1, b.bottom, 1) >= sp * UNISON_REACH && reach(b.left - 1, x1, b.top, -1) < sp * 0.5 ? sp * UNISON_REACH : reach(b.left - 1, x1, b.bottom, 1) >= sp * UNISON_SHORT && reach(b.left - out, x1, b.top, -1) < sp * 0.5 && headRows(b.left - 1, x1, b.bottom + 2, b.bottom + sp * UNISON_SHORT, 0.4, 3) < sp * 0.2 ? sp * UNISON_SHORT : 0;
      if (len && clear(n2.sym, b.left - out, x1, b.bottom + 1, b.bottom + len) && headRows(b.left - out, x1, b.bottom + 2, b.bottom + len) < sp * 0.3) down.add(n2.sym);
    } else {
      const x0 = b.right - w * 0.3;
      const len = reach(x0, b.right + out, b.top, -1) >= sp * UNISON_REACH && reach(x0, b.right + 1, b.bottom, 1) < sp * 0.5 ? sp * UNISON_REACH : reach(x0, b.right + 1, b.top, -1) >= sp * UNISON_SHORT && reach(x0, b.right + out, b.bottom, 1) < sp * 0.5 && headRows(x0, b.right + 1, b.top - sp * UNISON_SHORT, b.top - 2, 0.4, 3) < sp * 0.2 ? sp * UNISON_SHORT : 0;
      if (len && clear(n2.sym, x0, b.right + out, b.top - len, b.top - 1) && headRows(x0, b.right + out, b.top - len, b.top - 2) < sp * 0.3) up.add(n2.sym);
    }
  }
  const intoText = (s) => {
    const b = s.box;
    let rows = 0;
    let run = 0;
    let thin = 0;
    for (let y = Math.round(b.bottom + 1); y <= b.bottom + sp * 1.2 && y < bin.h; y++) {
      let widest = 0;
      for (let x = Math.round(b.left - 1); x <= b.left + (b.right - b.left) * 0.3; x++) {
        if (x < 0 || x >= bin.w || !bin.data[y * bin.w + x]) continue;
        let l2 = x;
        let r4 = x;
        while (l2 > 0 && bin.data[y * bin.w + l2 - 1]) l2--;
        while (r4 < bin.w - 1 && bin.data[y * bin.w + r4 + 1]) r4++;
        widest = Math.max(widest, r4 - l2 + 1);
      }
      if (widest > 0 && widest <= sp * 0.3) thin++;
      const onBeam = beams.some((q2) => q2.box.left <= b.right && q2.box.right >= b.left && y >= q2.box.top - 1 && y <= q2.box.bottom + 1);
      run = !onBeam && thin >= 2 && widest >= sp * 0.9 && widest <= sp * 2.4 ? run + 1 : 0;
      rows = Math.max(rows, run);
    }
    return rows >= 3;
  };
  for (let i2 = notes.length - 1; i2 >= 0; i2--) {
    const n2 = notes[i2];
    if (n2.rest || !up.has(n2.sym) || !down.has(n2.sym) || intoText(n2.sym)) continue;
    n2.stemUp = true;
    notes.splice(i2 + 1, 0, { ...n2, stemUp: false, chordExtra: true, lyrics: void 0, chord: void 0 });
  }
}
function overlapFrac(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h2 = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h2 > 0 ? w * h2 / Math.max(1, a.w * a.h) : 0;
}
const QREST_W = [0.75, 1.1];
const QREST_H = [2.2, 3.1];
const QREST_FILL = [0.33, 0.62];
const QREST_SPINE_W = 1.25;
const MID_CLEF_FROM = 5;
const CLEF_WIN_FROM = 0.5;
const COURTESY_KEY = 8;
const THROUGH_END = 0.6;
const CLEF_INK_ABOVE = [1, 0.35];
const CLEF_INK_X = [0.6, 3];
const CLEF_INK_LOW = [0.3, 0.25];
const CLEF_INK_FULL = 0.6;
const CLEF_8_X = [1.3, 2.6];
const CLEF_8_DEPTH = [2.35, 3.4];
const CLEF_INK_NONE = 0.15;
const CLEF_INK_LOW_NONE = 0.4;
const MID_CLEF_G_TOP = 0.3;
const ARP_W = 0.6;
const ARP_H = 2.5;
const ARP_STROKE = 0.7;
const ARP_REACH = 2.5;
const ARP_SWING = 0.1;
const ARP_RATE = [1.5, 3.2];
const MID_CLEF_ASPECT = 0.15;
const MID_CLEF_DIST = 130;
const MID_CLEF_FILL = 0.08;
const STAFF_START = 6;
const KEY_TAIL = 2;
function nearStaffStart(box, groups, lefts, unit) {
  const cy2 = box.y + box.h / 2;
  for (let i2 = 0; i2 < groups.length; i2++) {
    const g2 = groups[i2];
    if (cy2 < g2.lines[0].y - unit.space || cy2 > g2.lines[4].y + unit.space) continue;
    if (box.x < lefts[i2] + unit.space * STAFF_START) return true;
  }
  return false;
}
const EIGHTH_REST_W = [0.85, 1.3];
const EIGHTH_REST_H = [1.7, 2.4];
const EIGHTH_REST_H_PIECES = 1.4;
const EIGHTH_REST_FILL = [0.3, 0.5];
function isEighthRest(bin, b, area, unit, minH = EIGHTH_REST_H[0]) {
  const sp = unit.space;
  const w = b.w / sp;
  const h2 = b.h / sp;
  if (w < EIGHTH_REST_W[0] || w > EIGHTH_REST_W[1] || h2 < minH || h2 > EIGHTH_REST_H[1]) return false;
  const fill = area / Math.max(1, b.w * b.h);
  if (fill < EIGHTH_REST_FILL[0] || fill > EIGHTH_REST_FILL[1]) return false;
  const rows = [];
  for (let y = b.y; y < b.y + b.h; y++) {
    let x0 = -1, x1 = -1, ink = 0;
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!bin.data[y * bin.w + x]) continue;
      if (x0 < 0) x0 = x;
      x1 = x;
      ink++;
    }
    if (ink) rows.push({ y, x0, x1, ink });
  }
  const topRows = rows.filter((r4) => r4.y < b.y + b.h * 0.35);
  if (!topRows.length || Math.max(...topRows.map((r4) => r4.ink)) < sp * 0.55) return false;
  const low = rows.filter((r4) => r4.y >= b.y + b.h * 0.55);
  if (low.length < b.h * 0.3) return false;
  if (low.some((r4) => r4.x1 - r4.x0 + 1 > sp * 0.4)) return false;
  const my = low.reduce((a, r4) => a + r4.y, 0) / low.length;
  const mx = low.reduce((a, r4) => a + (r4.x0 + r4.x1) / 2, 0) / low.length;
  let sxy = 0, syy = 0;
  for (const r4 of low) {
    sxy += (r4.y - my) * ((r4.x0 + r4.x1) / 2 - mx);
    syy += (r4.y - my) ** 2;
  }
  return syy > 0 && sxy / syy <= -0.1;
}
function fillAround(bin, b, unit) {
  const sp = unit.space;
  const x0 = Math.max(0, Math.floor(b.x - sp));
  const y0 = Math.max(0, Math.floor(b.y - sp * 0.5));
  const x1 = Math.min(bin.w - 1, Math.ceil(b.x + b.w + sp));
  const y1 = Math.min(bin.h - 1, Math.ceil(b.y + sp * 2.6));
  const seen = /* @__PURE__ */ new Set();
  const stack = [];
  for (let y = b.y; y < b.y + b.h && !stack.length; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (bin.data[y * bin.w + x]) {
        stack.push(y * bin.w + x);
        seen.add(y * bin.w + x);
        break;
      }
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  while (stack.length) {
    const i2 = stack.pop();
    const x = i2 % bin.w;
    const y = (i2 - x) / bin.w;
    if (x <= x0 || x >= x1 || y <= y0 || y >= y1) return null;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const j2 = i2 + dy * bin.w + dx;
        if (!seen.has(j2) && bin.data[j2]) {
          seen.add(j2);
          stack.push(j2);
        }
      }
  }
  if (maxX < 0) return null;
  return { box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, area: seen.size };
}
function enclosedWhite(bin, b, sp, pad = Math.round(sp * 0.5)) {
  const x0 = Math.max(0, Math.floor(b.left) - pad);
  const x1 = Math.min(bin.w - 1, Math.ceil(b.right) + pad);
  const y0 = Math.max(0, Math.floor(b.top) - pad);
  const y1 = Math.min(bin.h - 1, Math.ceil(b.bottom) + pad);
  const w = x1 - x0 + 1;
  const h2 = y1 - y0 + 1;
  const seen = new Uint8Array(w * h2);
  const fill = (sx, sy) => {
    const s0 = (sy - y0) * w + (sx - x0);
    if (seen[s0] || bin.data[sy * bin.w + sx]) return 0;
    seen[s0] = 1;
    const stack = [s0];
    let n2 = 0;
    while (stack.length) {
      const i2 = stack.pop();
      n2++;
      const x = i2 % w + x0;
      const y = Math.floor(i2 / w) + y0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j2 = (ny - y0) * w + (nx - x0);
        if (seen[j2] || bin.data[ny * bin.w + nx]) continue;
        seen[j2] = 1;
        stack.push(j2);
      }
    }
    return n2;
  };
  for (let x = x0; x <= x1; x++) fill(x, y0), fill(x, y1);
  for (let y = y0; y <= y1; y++) fill(x0, y), fill(x1, y);
  let best = 0;
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) best = Math.max(best, fill(x, y));
  return best;
}
function crossRuns(bin, x0, x1, y0, y1) {
  const out = [];
  for (let y = Math.max(0, y0); y <= Math.min(bin.h - 1, y1); y++) {
    let full = true;
    for (let x = x0; x <= x1 && full; x++) if (!bin.data[y * bin.w + x]) full = false;
    if (!full) continue;
    const last = out[out.length - 1];
    if (last && last[1] === y - 1) last[1] = y;
    else out.push([y, y]);
  }
  return out;
}
function wholesByShape(bin, nl, box0, unit, grid, stems = []) {
  const sp = unit.space;
  let box = box0;
  {
    const lineRow = (y, frac = 0.9) => {
      let c2 = 0;
      for (let x = box0.x; x < box0.x + box0.w; x++) c2 += bin.data[y * bin.w + x];
      return c2 >= box0.w * frac;
    };
    let t2 = box0.y;
    let b = box0.y + box0.h - 1;
    while (t2 < b && lineRow(t2, 0.8)) t2++;
    while (b > t2 && lineRow(b, 0.8)) b--;
    let l2 = Infinity;
    let r4 = -Infinity;
    for (let y = t2; y <= b; y++) {
      if (lineRow(y)) continue;
      for (let x = box0.x; x < box0.x + box0.w; x++)
        if (bin.data[y * bin.w + x]) {
          l2 = Math.min(l2, x);
          r4 = Math.max(r4, x);
        }
    }
    if (r4 >= l2 && (box0.w - (r4 - l2 + 1) > sp * 0.15 || t2 > box0.y || b < box0.y + box0.h - 1)) box = { x: l2, y: t2, w: r4 - l2 + 1, h: b - t2 + 1 };
  }
  const w = box.w / sp;
  const h2 = box.h / sp;
  if (w < 1.2 || w > 2.2) return [];
  const n2 = h2 >= 0.75 && h2 <= 1.35 ? 1 : h2 >= 1.6 && h2 <= 2.6 ? 2 : 0;
  if (!n2) return [];
  const ink = (b, x, y) => x >= 0 && x < b.w && y >= 0 && y < b.h && b.data[y * b.w + x] === 1;
  let both = 0;
  let any = 0;
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) {
      const a = ink(bin, x, y);
      const m2 = ink(bin, box.x + box.w - 1 - (x - box.x), y);
      if (a || m2) any++;
      if (a && m2) both++;
    }
  const lr = any ? both / any : 0;
  let ud = 1;
  const hh = box.h / n2;
  for (let k2 = 0; k2 < n2; k2++) {
    const y0 = box.y + Math.round(k2 * hh);
    const y1 = box.y + Math.round((k2 + 1) * hh);
    let b2 = 0;
    let a2 = 0;
    for (let y = y0; y < y1; y++)
      for (let x = box.x; x < box.x + box.w; x++) {
        const a = ink(bin, x, y);
        const m2 = ink(bin, x, y1 - 1 - (y - y0));
        if (a || m2) a2++;
        if (a && m2) b2++;
      }
    ud = Math.min(ud, a2 ? b2 / a2 : 0);
  }
  const colFrac = (x0, x1) => {
    let c2 = 0;
    let t2 = 0;
    for (let x = Math.round(x0); x < Math.round(x1); x++)
      for (let y = box.y; y < box.y + box.h; y++) {
        t2++;
        if (ink(nl, x, y)) c2++;
      }
    return t2 ? c2 / t2 : 0;
  };
  const side = (colFrac(box.x, box.x + box.w * 0.3) + colFrac(box.x + box.w * 0.7, box.x + box.w)) / 2;
  const mid = colFrac(box.x + box.w * 0.4, box.x + box.w * 0.6);
  let rb = 0;
  let ra = 0;
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) {
      const a = ink(bin, x, y);
      const m2 = ink(bin, box.x + box.w - 1 - (x - box.x), box.y + box.h - 1 - (y - box.y));
      if (a || m2) ra++;
      if (a && m2) rb++;
    }
  const rot = ra ? rb / ra : 0;
  const hollowMid = () => {
    for (let k2 = 0; k2 < n2; k2++) {
      const y0 = Math.round(box.y + (k2 + 0.35) * hh);
      const y1 = Math.round(box.y + (k2 + 0.65) * hh);
      let wht = 0;
      let tot = 0;
      for (let y = y0; y <= y1; y++) {
        if (ink(bin, box.x - 2, y) && ink(bin, box.x + box.w + 1, y)) continue;
        for (let x = Math.round(box.x + box.w * 0.35); x <= Math.round(box.x + box.w * 0.65); x++) {
          tot++;
          if (!ink(bin, x, y)) wht++;
        }
      }
      if (!tot || wht / tot < WHOLE_HOLE) return false;
    }
    return true;
  };
  const stemmed = stems.some((v2) => {
    const vx = (v2.x0 + v2.x1) / 2;
    if (Math.abs(vx - box.x) > sp * 0.3 && Math.abs(vx - (box.x + box.w)) > sp * 0.3) return false;
    const vy0 = Math.min(v2.y0, v2.y1);
    const vy1 = Math.max(v2.y0, v2.y1);
    if (vy1 < box.y - sp * 0.3 || vy0 > box.y + box.h + sp * 0.3) return false;
    return vy0 < box.y - sp || vy1 > box.y + box.h + sp;
  });
  if (w < 1.3 && stemmed) return [];
  const byRot = !stemmed && rot >= WHOLE_ROT && side >= WHOLE_SIDE && hollowMid();
  const thin = lr >= WHOLE_LR_THIN && ud >= WHOLE_UD_THIN && side >= WHOLE_SIDE_THIN && mid <= side * WHOLE_MID && hollowMid();
  if (!byRot && !thin && (lr < WHOLE_LR || ud < WHOLE_UD || side < WHOLE_SIDE || mid > side * WHOLE_MID)) return [];
  const out = [];
  for (let k2 = 0; k2 < n2; k2++) {
    const cy2 = grid(box.y + (k2 + 0.5) * hh);
    if (cy2 === null) return [];
    out.push({ x: box.x, y: Math.round(cy2 - hh / 2), w: box.w, h: Math.round(hh) });
  }
  if (n2 === 2 && Math.abs(out[1].y - out[0].y - sp) > sp * 0.25) return [];
  return out;
}
const WHOLE_LR = 0.65;
const WHOLE_UD = 0.45;
const WHOLE_SIDE = 0.58;
const WHOLE_MID = 0.55;
const WHOLE_ROT = 0.75;
const WHOLE_HOLE = 0.6;
const WHOLE_LR_THIN = 0.72;
const WHOLE_UD_THIN = 0.6;
const WHOLE_SIDE_THIN = 0.5;
function sharpCrossbars(bin, b, unit) {
  const sp = unit.space;
  const bars = [];
  for (let y = b.y; y < b.y + b.h; y++) {
    let best = 0;
    let run = 0;
    for (let x = b.x; x < b.x + b.w; x++) {
      run = x >= 0 && x < bin.w && y >= 0 && y < bin.h && bin.data[y * bin.w + x] ? run + 1 : 0;
      if (run > best) best = run;
    }
    if (best < b.w * 0.75) continue;
    const last = bars[bars.length - 1];
    if (last && y - last[1] <= sp * 0.3) last[1] = y;
    else bars.push([y, y]);
  }
  if (bars.length !== 2) return false;
  const thick = bars.map(([a, z]) => (z - a + 1) / sp);
  if (thick.some((t2) => t2 < 0.2 || t2 > 0.45)) return false;
  const gap = (bars[1][0] + bars[1][1] - (bars[0][0] + bars[0][1])) / 2 / sp;
  return gap >= 0.7 && gap <= 1.3;
}
function vRunAt(bin, x, y) {
  const ink = (xx, yy) => yy >= 0 && yy < bin.h && xx >= 0 && xx < bin.w && !!bin.data[yy * bin.w + xx];
  const at = (yy) => ink(x, yy) || ink(x - 1, yy) || ink(x + 1, yy);
  if (!at(y)) return null;
  let a = y;
  let b = y;
  while (at(a - 1)) a--;
  while (at(b + 1)) b++;
  return [a, b];
}
function splitVoiceStems(segs, heads, unit) {
  const sp = unit.space;
  const tol = sp * 0.3;
  const xOf = (v2) => (v2.x0 + v2.x1) / 2;
  const top = (v2) => Math.min(v2.y0, v2.y1);
  const bot = (v2) => Math.max(v2.y0, v2.y1);
  const cy2 = (h2) => h2.y + h2.h / 2;
  const vertical = segs.filter((v2) => bot(v2) - top(v2) > sp);
  return segs.map((v2) => {
    if (bot(v2) - top(v2) <= sp) return v2;
    const vx = xOf(v2);
    const hTop = heads.find((h2) => Math.abs(h2.x - vx) <= tol && top(v2) >= h2.y - tol && top(v2) <= h2.y + h2.h);
    if (hTop) {
      const below = heads.filter((h2) => h2 !== hTop && Math.abs(h2.x - hTop.x) <= sp * 0.4 && cy2(h2) - cy2(hTop) >= sp * 0.6 && cy2(h2) - cy2(hTop) <= sp * 1.6 && cy2(h2) <= bot(v2));
      const up = vertical.some((u2) => u2 !== v2 && Math.abs(xOf(u2) - (hTop.x + hTop.w)) <= tol && bot(u2) >= hTop.y - tol && bot(u2) <= hTop.y + hTop.h + tol && top(u2) < hTop.y - sp);
      if (below.length && up && bot(v2) - Math.max(...below.map(cy2)) >= sp * 1.5) {
        const ny = Math.min(...below.map(cy2));
        return { ...v2, y0: v2.y0 < v2.y1 ? ny : v2.y0, y1: v2.y0 < v2.y1 ? v2.y1 : ny };
      }
    }
    const hBot = heads.find((h2) => Math.abs(h2.x + h2.w - vx) <= tol && bot(v2) >= h2.y && bot(v2) <= h2.y + h2.h + tol);
    if (hBot) {
      const above = heads.filter((h2) => h2 !== hBot && Math.abs(h2.x + h2.w - (hBot.x + hBot.w)) <= sp * 0.4 && cy2(hBot) - cy2(h2) >= sp * 0.6 && cy2(hBot) - cy2(h2) <= sp * 1.6 && cy2(h2) >= top(v2));
      const down = vertical.some((u2) => u2 !== v2 && Math.abs(xOf(u2) - hBot.x) <= tol && top(u2) >= hBot.y - tol && top(u2) <= hBot.y + hBot.h + tol && bot(u2) > hBot.y + hBot.h + sp);
      if (above.length && down && Math.min(...above.map(cy2)) - top(v2) >= sp * 1.5) {
        const ny = Math.max(...above.map(cy2));
        return { ...v2, y0: v2.y0 > v2.y1 ? ny : v2.y0, y1: v2.y0 > v2.y1 ? v2.y1 : ny };
      }
    }
    return v2;
  });
}
function snapHeadsToStems(syms, segs, unit) {
  const sp = unit.space;
  for (const s0 of syms) {
    if (s0.code !== "noteheadHalf" && s0.code !== "noteheadBlack") continue;
    const b = s0.box;
    for (const v2 of segs) {
      const vx = (v2.x0 + v2.x1) / 2;
      const top = Math.min(v2.y0, v2.y1);
      const bot = Math.max(v2.y0, v2.y1);
      if (bot - top < sp * 2 || bot < b.y || top > b.y + b.h) continue;
      const cy2 = b.y + b.h / 2;
      if (Math.abs(cy2 - top) > sp && Math.abs(cy2 - bot) > sp) continue;
      const farY = Math.abs(cy2 - top) < Math.abs(cy2 - bot) ? bot : top;
      if (syms.some((o) => o !== s0 && /^notehead/.test(o.code) && Math.abs(o.box.y + o.box.h / 2 - farY) <= sp && o.box.x - sp * 0.5 <= vx && vx <= o.box.x + o.box.w + sp * 0.5)) continue;
      if (vx > b.x + b.w - sp * 0.35 && vx < b.x + b.w) {
        s0.box = { ...b, w: Math.round(vx) - b.x };
        break;
      }
      if (vx > b.x && vx < b.x + sp * 0.35) {
        const nx = Math.round(vx);
        s0.box = { ...b, x: nx, w: b.x + b.w - nx };
        break;
      }
    }
  }
  return segs;
}
const QREST_OFF = 2.2;
function offStaffRest(box, lines, unit) {
  const cy2 = box.y + box.h / 2;
  const ys = [...lines].map((l2) => l2.y).sort((a, b) => a - b);
  for (let i2 = 0; i2 + 4 < ys.length; i2 += 5) {
    if (cy2 < ys[i2] && ys[i2] - cy2 <= unit.space * QREST_OFF) return true;
    if (cy2 > ys[i2 + 4] && cy2 - ys[i2 + 4] <= unit.space * QREST_OFF) return true;
  }
  return false;
}
function midOfStaff(box, lines, unit) {
  const cy2 = box.y + box.h / 2;
  const ys = [...lines].map((l2) => l2.y).sort((a, b) => a - b);
  for (let i2 = 0; i2 + 4 < ys.length; i2 += 5) if (Math.abs(cy2 - ys[i2 + 2]) <= unit.space * 0.9) return true;
  return false;
}
const DOT_BELOW = 0.5;
const DOT_SPACE_TOL = 0.3;
const DOT_HEAD_TOL = 0.3;
const DOT_BELOW_SOLID = 0.35;
const TWIN_COL = 0.5;
const DOT_BELOW_STACKED = 0.75;
const DOT_BELOW_PUSHED = 1.2;
const DOT_ISOLATE = 0.12;
const DOT_SMALL = 0.62;
const DOT_MEDIAN_N = 4;
const DOT_PAD = 0.3;
const DOT_MAX = 0.75;
const REPEAT_Y = 0.25;
const DOT_CLEAR = 0.6;
const REPEAT_X = 0.3;
const REPEAT_GAP = 1;
const REPEAT_THICK = 0.3;
const REPEAT_PAIR = 1;
const REPEAT_INK = 0.9;
function findDots(bin, syms, unit, staffYs, onLine = () => false, only) {
  const sp = unit.space;
  const out = [];
  const heads = syms.filter((s0) => /^notehead/.test(s0.code));
  const blobsIn = (x0, y0, x1, y1) => {
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(bin.w, Math.round(x1));
    y1 = Math.min(bin.h, Math.round(y1));
    const W = x1 - x0;
    if (W <= 0 || y1 <= y0) return [];
    const seen = new Uint8Array(W * (y1 - y0));
    const found = [];
    const stack = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (seen[(y - y0) * W + (x - x0)] || !bin.data[y * bin.w + x]) continue;
        const a = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, area: 0, edge: false };
        const b = { ...a };
        const grow2 = (q22, px, py) => {
          q22.area++;
          q22.minX = Math.min(q22.minX, px);
          q22.maxX = Math.max(q22.maxX, px);
          q22.minY = Math.min(q22.minY, py);
          q22.maxY = Math.max(q22.maxY, py);
        };
        seen[(y - y0) * W + (x - x0)] = 1;
        stack.push(x, y);
        while (stack.length) {
          const py = stack.pop();
          const px = stack.pop();
          grow2(a, px, py);
          if (!onLine(py)) grow2(b, px, py);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx;
              const ny = py + dy;
              if (nx < 0 || ny < 0 || nx >= bin.w || ny >= bin.h || !bin.data[ny * bin.w + nx]) continue;
              if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) {
                a.edge = true;
                if (!onLine(ny)) b.edge = true;
                continue;
              }
              const j2 = (ny - y0) * W + (nx - x0);
              if (seen[j2]) continue;
              seen[j2] = 1;
              stack.push(nx, ny);
            }
        }
        const dotOk = (q22, min) => {
          if (!q22.area || q22.edge) return false;
          const w2 = q22.maxX - q22.minX + 1;
          const h22 = q22.maxY - q22.minY + 1;
          if (w2 < Math.max(2, sp * min) || h22 < Math.max(2, sp * min) || w2 > sp * DOT_MAX || h22 > sp * DOT_MAX) return false;
          return w2 / h22 >= 0.6 && w2 / h22 <= 1.7 && q22.area >= w2 * h22 * 0.5;
        };
        const q2 = dotOk(a, 0.15) ? a : dotOk(b, 0.3) ? b : null;
        if (!q2) continue;
        const w = q2.maxX - q2.minX + 1;
        const h2 = q2.maxY - q2.minY + 1;
        found.push({ x: q2.minX, y: q2.minY, w, h: h2 });
      }
    return found;
  };
  const rightOf = (b) => {
    const cy2 = b.y + b.h / 2;
    let r4 = b.x + b.w;
    for (const h2 of heads) {
      const c2 = h2.box;
      if (c2.x <= b.x + b.w + 2 && c2.x + c2.w >= b.x && Math.abs(c2.y + c2.h / 2 - cy2) <= sp * 1.5) r4 = Math.max(r4, c2.x + c2.w);
    }
    return r4;
  };
  const colHead = (b, dy0, dy1) => {
    const cy2 = b.y + b.h / 2;
    return heads.some((h2) => h2.box !== b && h2.box.x < b.x + b.w + sp * TWIN_COL && h2.box.x + h2.box.w > b.x - sp * TWIN_COL && cy2 - (h2.box.y + h2.box.h / 2) > sp * dy0 && cy2 - (h2.box.y + h2.box.h / 2) < sp * dy1);
  };
  const below = (b) => {
    const cy2 = b.y + b.h / 2;
    const above = colHead(b, 0.3, 3.2);
    if (above && colHead(b, -0.1, 0.7) && !colHead(b, -3.2, -0.3)) return DOT_BELOW_PUSHED;
    if (colHead(b, 0.3, 1.2) || (above || stemDown(b)) && onLine(Math.round(cy2))) return DOT_BELOW_STACKED;
    return DOT_BELOW;
  };
  const stemDown = (b) => {
    for (let x = Math.max(0, b.x - 1); x <= Math.min(bin.w - 1, b.x + 1); x++) {
      let run = 0;
      for (let y = Math.round(b.y + b.h / 2); y < bin.h && (bin.data[y * bin.w + x] || onLine(y)); y++) run++;
      if (run >= sp * 1.5 + b.h / 2) return true;
    }
    return false;
  };
  const inWindow = (b, d2) => {
    const cx2 = d2.x + d2.w / 2;
    const cy2 = d2.y + d2.h / 2;
    const hy = b.y + b.h / 2;
    const r4 = rightOf(b);
    return cx2 > r4 + sp * 0.05 && cx2 < r4 + sp * 1.3 && cy2 > hy - sp * 0.85 && cy2 < hy + sp * below(b);
  };
  const isolated2 = (d2) => {
    const g2 = Math.max(2, Math.round(sp * DOT_ISOLATE));
    const R = Math.round(sp * 1.5);
    const x0 = Math.max(0, d2.x - R), x1 = Math.min(bin.w, d2.x + d2.w + R);
    const y0 = Math.max(0, d2.y - R * 2), y1 = Math.min(bin.h, d2.y + d2.h + R * 2);
    const W = x1 - x0;
    const seen = new Uint8Array(W * (y1 - y0));
    const stack = [];
    const hRun = (x, y) => {
      let a = x;
      let c2 = x;
      while (a > 0 && bin.data[y * bin.w + a - 1]) a--;
      while (c2 < bin.w - 1 && bin.data[y * bin.w + c2 + 1]) c2++;
      return c2 - a + 1;
    };
    const inDot = (x, y) => x >= d2.x && x < d2.x + d2.w && y >= d2.y && y < d2.y + d2.h;
    for (let y = d2.y - g2; y < d2.y + d2.h + g2; y++) {
      if (y < y0 || y >= y1 || onLine(y)) continue;
      for (let x = d2.x - g2; x < d2.x + d2.w + g2; x++) {
        if (x < x0 || x >= x1 || inDot(x, y) || !bin.data[y * bin.w + x] || seen[(y - y0) * W + x - x0] || hRun(x, y) >= sp) continue;
        seen[(y - y0) * W + x - x0] = 1;
        stack.push(x, y);
      }
    }
    if (!stack.length) return true;
    const colRun = /* @__PURE__ */ new Map();
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      const c2 = colRun.get(x);
      colRun.set(x, c2 ? [Math.min(c2[0], y), Math.max(c2[1], y)] : [y, y]);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          let ny = y + dy;
          if (dy !== 0 && ny >= y0 && ny < y1 && onLine(ny)) {
            let k22 = 0;
            while (k22 < 8 && ny >= y0 && ny < y1 && onLine(ny)) {
              ny += dy;
              k22++;
            }
          }
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1 || inDot(nx, ny) || !bin.data[ny * bin.w + nx]) continue;
          const k2 = (ny - y0) * W + nx - x0;
          if (seen[k2] || hRun(nx, ny) >= sp) continue;
          seen[k2] = 1;
          stack.push(nx, ny);
        }
    }
    for (const [x, [a, c2]] of colRun) {
      if (c2 - a + 1 < sp * 1.5) continue;
      let run = 0;
      let most = 0;
      for (let y = a; y <= c2; y++) {
        run = bin.data[y * bin.w + x] || onLine(y) ? run + 1 : 0;
        most = Math.max(most, run);
      }
      if (most >= sp * 1.5) return false;
    }
    return true;
  };
  const inkMidY = (o) => {
    let n2 = 0;
    let sy = 0;
    for (let y = o.y; y < o.y + o.h; y++) {
      if (onLine(y)) continue;
      for (let x = o.x; x < o.x + o.w; x++) if (bin.data[y * bin.w + x]) {
        n2++;
        sy += y;
      }
    }
    return n2 ? sy / n2 + 0.5 : o.y + o.h / 2;
  };
  const offLine = (o) => {
    for (let y = o.y; y < o.y + o.h; y++) {
      if (onLine(y)) continue;
      for (let x = o.x; x < o.x + o.w; x++) if (bin.data[y * bin.w + x]) return true;
    }
    return false;
  };
  const repeatPair = (d2, o) => {
    const ax = d2.x + d2.w / 2, ay = d2.y + d2.h / 2;
    const bx = o.x + o.w / 2, by = o.y + o.h / 2;
    if (Math.abs(ax - bx) > sp * REPEAT_X) return false;
    const ys = staffYs.find((l2) => l2.length === 5 && ay > l2[0] && ay < l2[4]);
    if (!ys) return false;
    const up = Math.min(ay, by), dn = Math.max(ay, by);
    if (Math.abs(up - (ys[1] + ys[2]) / 2) > sp * REPEAT_Y || Math.abs(dn - (ys[2] + ys[3]) / 2) > sp * REPEAT_Y) return false;
    const full = (x) => {
      let ink = 0;
      for (let y = Math.round(ys[0]); y <= Math.round(ys[4]); y++) if (bin.data[y * bin.w + x] || onLine(y)) ink++;
      return ink >= (Math.round(ys[4]) - Math.round(ys[0]) + 1) * REPEAT_INK;
    };
    const left = Math.min(d2.x, o.x), right2 = Math.max(d2.x + d2.w, o.x + o.w);
    const x0 = Math.max(0, Math.round(left - sp * (REPEAT_GAP + REPEAT_PAIR + 1)));
    const x1 = Math.min(bin.w - 1, Math.round(right2 + sp * (REPEAT_GAP + REPEAT_PAIR + 1)));
    const bars = [];
    for (let x = x0; x <= x1; x++) {
      if (x >= left && x < right2) continue;
      if (!full(x)) continue;
      const last = bars[bars.length - 1];
      if (last && last[1] === x - 1) last[1] = x;
      else bars.push([x, x]);
    }
    const thick = (q2) => q2[1] - q2[0] + 1 >= Math.max(2, sp * REPEAT_THICK);
    for (const side of [-1, 1]) {
      const near = side < 0 ? bars.filter((q2) => q2[1] < left).pop() : bars.find((q2) => q2[0] >= right2);
      if (!near) continue;
      const gap = side < 0 ? left - near[1] : near[0] - right2;
      if (gap > sp * REPEAT_GAP || thick(near)) continue;
      const i2 = bars.indexOf(near);
      const other = bars[i2 + side];
      if (!other || !thick(other)) continue;
      const between2 = side < 0 ? near[0] - other[1] : other[0] - near[1];
      if (between2 <= sp * REPEAT_PAIR) return true;
    }
    return false;
  };
  for (const hd of only ?? heads) {
    const b = hd.box;
    const cy2 = b.y + b.h / 2;
    const r4 = rightOf(b);
    const bl = below(b);
    for (const d2 of blobsIn(r4 - sp * DOT_PAD, cy2 - sp * (0.85 + DOT_PAD), r4 + sp * (1.3 + DOT_PAD), cy2 + sp * (bl + DOT_PAD)).filter((q2) => {
      const qx = q2.x + q2.w / 2;
      const qy = q2.y + q2.h / 2;
      if (q2.x < r4 + sp * 0.05 && (q2.w < sp * 0.3 || q2.h < sp * 0.3)) return false;
      if (!(qx > r4 + sp * 0.05 && qx < r4 + sp * 1.3 && qy > cy2 - sp * 0.85 && qy < cy2 + sp * bl)) return false;
      const inStaff = staffYs.some((l22) => qy > l22[0] - sp && qy < l22[l22.length - 1] + sp);
      const l2 = staffYs.find((ys) => ys.length === 5 && qy > ys[0] - sp * 1.5 && qy < ys[4] + sp * 1.5);
      if (l2) {
        const g2 = (l2[4] - l2[0]) / 4;
        const pos = (inkMidY(q2) - l2[0]) / g2;
        const inside = pos > -DOT_SPACE_TOL && pos < 4 + DOT_SPACE_TOL;
        const spaceOff = Math.abs(pos - Math.floor(pos) - 0.5);
        if (inside && spaceOff > DOT_SPACE_TOL) return false;
        const dotAt = inside ? Math.floor(pos) + 0.5 : Math.round(pos * 2) / 2;
        const hp = (cy2 - l2[0]) / g2;
        const heads2 = [Math.floor(hp * 2) / 2, Math.ceil(hp * 2) / 2].filter((h2) => Math.abs(h2 - hp) <= DOT_HEAD_TOL);
        const ks = [0, -0.5, 0.5, ...bl === DOT_BELOW_PUSHED ? [1] : []];
        if (!heads2.some((h2) => ks.includes(dotAt - h2))) return false;
      }
      if (q2.x + q2.w > r4 + sp * 1.3 && !inStaff) return false;
      if (bl === DOT_BELOW && qy > cy2 + sp * DOT_BELOW_SOLID) {
        if (!inStaff) return false;
        for (let y = q2.y - 1; y <= q2.y + q2.h; y++) if (onLine(y)) return false;
      }
      return true;
    })) {
      if (out.some((o) => overlapFrac(o, d2) > 0)) continue;
      if (syms.some((s0) => overlapFrac(d2, s0.box) > 0.3)) continue;
      const dcx = d2.x + d2.w / 2;
      const dcy = d2.y + d2.h / 2;
      const twins = blobsIn(dcx - sp * 0.5, dcy - sp * 1.5, dcx + sp * 0.5, dcy + sp * 1.5).filter((o) => Math.abs(o.y + o.h / 2 - dcy) > sp * 0.6 && offLine(o)).filter((o) => !heads.some((h2) => h2 !== hd && h2.box.x < b.x + b.w + sp * TWIN_COL && h2.box.x + h2.box.w > b.x - sp * TWIN_COL && inWindow(h2.box, o))).filter((o) => repeatPair(d2, o));
      if (twins.length) continue;
      const speckles = blobsIn(dcx - sp * DOT_CLEAR, dcy - sp * DOT_CLEAR, dcx + sp * DOT_CLEAR, dcy + sp * DOT_CLEAR).filter((o) => overlapFrac(o, d2) === 0 && offLine(o) && !syms.some((s0) => overlapFrac(o, s0.box) > 0));
      if (speckles.length) continue;
      if (!isolated2(d2)) continue;
      out.push(d2);
    }
  }
  if (out.length >= DOT_MEDIAN_N) {
    const dims = out.map((d2) => Math.max(d2.w, d2.h)).sort((p2, q2) => p2 - q2);
    const med2 = dims[dims.length >> 1];
    return out.filter((d2) => Math.max(d2.w, d2.h) >= med2 * DOT_SMALL);
  }
  return out;
}
const isBarRest = (code) => code === "restHalf" || code === "restWhole" || code === "restHBar";
function restKind(box, lines, unit) {
  const cy2 = box.y + box.h / 2;
  const ys = [...lines].map((l2) => l2.y).sort((a, b) => a - b);
  for (let i2 = 0; i2 + 4 < ys.length; i2 += 5) {
    if (cy2 < ys[i2] - unit.space || cy2 > ys[i2 + 4] + unit.space) continue;
    return cy2 > (ys[i2 + 1] + ys[i2 + 2]) / 2 ? "restHalf" : "restHBar";
  }
  return "restHBar";
}
function nearRestLine(box, lines, unit) {
  const cy2 = box.y + box.h / 2;
  const ys = [...lines].map((l2) => l2.y).sort((a, b) => a - b);
  for (let i2 = 0; i2 + 4 < ys.length; i2 += 5) {
    for (const k2 of [1, 2]) if (Math.abs(cy2 - ys[i2 + k2]) <= unit.space * 0.6) return true;
  }
  return false;
}
function splitAt(bin, box) {
  const ink = (x, y0, y1) => {
    let n2 = 0;
    for (let y = y0; y < y1; y++) if (bin.data[y * bin.w + x]) n2++;
    return n2;
  };
  const colInk = (x) => ink(x, box.y, box.y + box.h);
  let cut = -1;
  let best = Infinity;
  for (let x = box.x + Math.round(box.w * 0.3); x <= box.x + Math.round(box.w * 0.7); x++) {
    const n2 = colInk(x);
    if (n2 < best) {
      best = n2;
      cut = x;
    }
  }
  if (cut < 0) return null;
  const peak = (x0, x1) => {
    let m2 = 0;
    for (let x = x0; x < x1; x++) m2 = Math.max(m2, colInk(x));
    return m2;
  };
  if (best * 2 > Math.min(peak(box.x, cut), peak(cut + 1, box.x + box.w))) return null;
  const a = inkBox(bin, box.x, cut, box.y, box.y + box.h);
  const c2 = inkBox(bin, cut + 1, box.x + box.w, box.y, box.y + box.h);
  return a && c2 ? [a, c2] : null;
}
function longestVRun(bin, box) {
  let best = 0;
  for (let x = Math.max(0, box.x); x < Math.min(bin.w, box.x + box.w); x++) {
    let run = 0;
    for (let y = Math.max(0, box.y); y < Math.min(bin.h, box.y + box.h); y++) {
      run = bin.data[y * bin.w + x] ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
}
function inkBox(bin, x0, x1, y0, y1) {
  let l2 = Infinity, r4 = -1, t2 = Infinity, b = -1;
  for (let y = Math.max(0, y0); y < Math.min(bin.h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(bin.w, x1); x++)
      if (bin.data[y * bin.w + x]) {
        l2 = Math.min(l2, x);
        r4 = Math.max(r4, x);
        t2 = Math.min(t2, y);
        b = Math.max(b, y);
      }
  return r4 < 0 ? null : { x: l2, y: t2, w: r4 - l2 + 1, h: b - t2 + 1 };
}
function sharpShape(bin, box) {
  if (tallStrokes(bin, box) !== 2) return false;
  const x0 = Math.max(0, Math.floor(box.x)), x1 = Math.min(bin.w, Math.ceil(box.x + box.w));
  const y0 = Math.max(0, Math.floor(box.y)), y1 = Math.min(bin.h, Math.ceil(box.y + box.h));
  const groups = [];
  let prev = -2;
  for (let x = x0; x < x1; x++) {
    let run = 0, best = 0;
    for (let y = y0; y < y1; y++) {
      if (bin.data[y * bin.w + x]) best = Math.max(best, ++run);
      else run = 0;
    }
    if (best < box.h * 0.55) continue;
    if (x - prev > 1) groups.push([]);
    groups[groups.length - 1].push(x);
    prev = x;
  }
  const band = Math.max(2, Math.round(box.h * 0.15));
  const inkIn = (xs, ya, yb) => {
    for (let y = ya; y < yb; y++) for (const x of xs) for (const dx of [-1, 0, 1]) if (x + dx >= x0 && x + dx < x1 && bin.data[y * bin.w + x + dx]) return true;
    return false;
  };
  if (!groups.every((g2) => inkIn(g2, y0, y0 + band * 2) && inkIn(g2, y1 - band * 2, y1))) return false;
  let bars = 0, inBar = false;
  for (let y = y0; y < y1; y++) {
    let n2 = 0;
    for (let x = x0; x < x1; x++) if (bin.data[y * bin.w + x]) n2++;
    const full = n2 >= (x1 - x0) * 0.8;
    if (full && !inBar) bars++;
    inBar = full;
  }
  return bars === 2;
}
function tallStrokes(bin, box) {
  let groups = 0;
  let prev = -2;
  for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(bin.w, Math.ceil(box.x + box.w)); x++) {
    let run = 0;
    let best = 0;
    for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(bin.h, Math.ceil(box.y + box.h)); y++) {
      if (bin.data[y * bin.w + x]) best = Math.max(best, ++run);
      else run = 0;
    }
    if (best < box.h * 0.55) continue;
    if (x - prev > 1) groups++;
    prev = x;
  }
  return groups;
}
function isStackedPair(box, area, unit) {
  const w = box.w / unit.space;
  const h2 = box.h / unit.space;
  return w >= 0.9 && w <= 1.7 && h2 >= 1.7 && h2 <= 2.4 && area / Math.max(1, box.w * box.h) >= 0.7;
}
const FAINT_BAR_COVER = 0.6;
const FAINT_BAR_FILL = 0.8;
const FAINT_DELTA = 25;
const FAINT_SIDE = 4;
function openCavities(bin, box, unit) {
  const pad = Math.round(unit.space * OPEN_CAVITY_PAD);
  const x0 = Math.max(0, box.x - pad);
  const x1 = Math.min(bin.w - 1, box.x + box.w - 1 + pad);
  const y0 = Math.max(0, box.y - pad);
  const y1 = Math.min(bin.h - 1, box.y + box.h - 1 + pad);
  const ink = (x, y) => bin.data[y * bin.w + x] !== 0;
  const hits = (x, y, dx, dy) => {
    for (let cx2 = x + dx, cy2 = y + dy; cx2 >= x0 && cx2 <= x1 && cy2 >= y0 && cy2 <= y1; cx2 += dx, cy2 += dy) if (ink(cx2, cy2)) return true;
    return false;
  };
  const bw = box.w;
  const inside = new Uint8Array(bw * box.h);
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < bw; x++) {
      const px = box.x + x;
      const py = box.y + y;
      if (px < 0 || py < 0 || px >= bin.w || py >= bin.h || ink(px, py)) continue;
      if (hits(px, py, -1, 0) && hits(px, py, 1, 0) && hits(px, py, 0, -1) && hits(px, py, 0, 1)) inside[y * bw + x] = 1;
    }
  const out = [];
  const minArea = unit.space * unit.space * OPEN_CAVITY_AREA;
  for (let i2 = 0; i2 < inside.length; i2++) {
    if (inside[i2] !== 1) continue;
    const stack = [i2];
    inside[i2] = 2;
    let n2 = 0;
    let [ax, ay, bx, by] = [bw, box.h, 0, 0];
    while (stack.length) {
      const k2 = stack.pop();
      const x = k2 % bw;
      const y = k2 / bw | 0;
      n2++;
      ax = Math.min(ax, x), ay = Math.min(ay, y), bx = Math.max(bx, x), by = Math.max(by, y);
      for (const q2 of [x > 0 ? k2 - 1 : -1, x + 1 < bw ? k2 + 1 : -1, y > 0 ? k2 - bw : -1, y + 1 < box.h ? k2 + bw : -1])
        if (q2 >= 0 && inside[q2] === 1) inside[q2] = 2, stack.push(q2);
    }
    if (n2 >= minArea) out.push({ x: box.x + ax, y: box.y + ay, w: bx - ax + 1, h: by - ay + 1 });
  }
  return out;
}
function bridgeFaintBars(vSegs, gray, w, staves, unit) {
  const sp = unit.space;
  const lt = Math.max(1, unit.lineThick);
  for (const ys of staves) {
    const top = ys[0];
    const bot = ys[4];
    const onLine = (y) => ys.some((ly) => Math.abs(y - ly) <= lt);
    for (let i2 = 0; i2 < vSegs.length; i2++) {
      const v2 = vSegs[i2];
      const a = Math.min(v2.y0, v2.y1);
      const b = Math.max(v2.y0, v2.y1);
      if (a < top - sp * 0.3 || b > bot + sp * 0.3) continue;
      if (b - a < (bot - top) * FAINT_BAR_COVER) continue;
      if (a <= top + sp * 0.25 && b >= bot - sp * 0.25) continue;
      const x = Math.round((v2.x0 + v2.x1) / 2);
      if (x - FAINT_SIDE - 1 < 0 || x + FAINT_SIDE + 1 >= w) continue;
      const dark = (y) => {
        const r4 = Math.round(y) * w;
        const c2 = Math.min(gray[r4 + x - 1], gray[r4 + x], gray[r4 + x + 1]);
        const side = Math.min(gray[r4 + x - FAINT_SIDE - 1], gray[r4 + x + FAINT_SIDE + 1]);
        return side - c2 >= FAINT_DELTA;
      };
      let gap = 0;
      let hit = 0;
      for (let y = Math.round(top); y < a; y++) gap++, hit += +(onLine(y) || dark(y));
      for (let y = Math.round(b) + 1; y <= bot; y++) gap++, hit += +(onLine(y) || dark(y));
      if (!gap || hit < gap * FAINT_BAR_FILL) continue;
      vSegs[i2] = { ...v2, x0: x, x1: x, y0: Math.min(a, top), y1: Math.max(b, bot) };
    }
  }
}
async function recognizeRasterSong(sources, look, opts = {}) {
  const entries = [];
  const notesByStaff = /* @__PURE__ */ new Map();
  const stats = {
    notes: 0,
    harmonies: 0,
    lyricLines: 0,
    lyricStats: { rows: 0, hit: 0, parity: 0 },
    bars: 0,
    full: 0,
    unknown: 0,
    staves: 0,
    pages: 0,
    halftone: null,
    kind: null,
    jianpuFix: { pairs: 0, pitch: 0, duration: 0, removed: 0, inserted: 0 }
  };
  const pages = [];
  let carryTime;
  let carryKey;
  const barPages = [];
  const total = sources.reduce((n2, s) => n2 + s.pdf.numPages, 0);
  let done = 0;
  for (const [si, { pdf, OPS }] of sources.entries()) {
    for (let pn = 1; pn <= pdf.numPages; pn++) {
      if (opts.cancelled?.()) throw new Error("已取消");
      const page = await pdf.getPage(pn);
      try {
        let caches = { lyricOcr: opts.lyricOcr, labelOcr: opts.labelOcr, timeOcr: opts.timeOcr, harmonyOcr: opts.harmonyOcr, jianpuOcr: opts.jianpuOcr, wordOcr: opts.wordOcr };
        if (opts.live) {
          const r1 = await recognizeRasterPage(page, OPS, look, pn, { carryTime, carryKey });
          if (r1.hasStaff) {
            const [harmonyOcr, timeOcr] = await Promise.all([opts.live.harmony(r1.harmonyStrips), opts.live.time?.(r1.timeStrips)]);
            if (opts.cancelled?.()) throw new Error("已取消");
            const r22 = await recognizeRasterPage(page, OPS, look, pn, { carryTime, carryKey, harmonyOcr, timeOcr, wantWordStrips: !!opts.live.word });
            const [lyricOcr, labelOcr, jianpuOcr, wordOcr] = await Promise.all([
              opts.live.lyric(r22.lyricStrips),
              opts.live.label(r22.labelStrips),
              opts.live.jianpu(r22.jianpuStrips),
              opts.live.word?.(r22.wordStrips)
            ]);
            if (opts.cancelled?.()) throw new Error("已取消");
            caches = { harmonyOcr, timeOcr, lyricOcr, labelOcr, jianpuOcr, wordOcr };
          }
        }
        const r4 = await recognizeRasterPage(page, OPS, look, pn, { carryTime, carryKey, ...caches });
        if (r4.jianpuFix) for (const k2 of Object.keys(stats.jianpuFix)) stats.jianpuFix[k2] += r4.jianpuFix[k2];
        carryTime = r4.carryTime;
        carryKey = r4.carryKey;
        if (r4.hasStaff) {
          stats.pages++;
          stats.notes += r4.notes.length;
          stats.harmonies += r4.harmonies?.length ?? 0;
          stats.lyricLines += r4.lyricLines.length;
          for (const k2 of Object.keys(stats.lyricStats)) stats.lyricStats[k2] += r4.lyricStats?.[k2] ?? 0;
          stats.bars += r4.bars.length;
          barPages.push({ page: r4.page, bars: r4.bars });
          stats.unknown += r4.unknown;
          stats.staves += r4.page.staves.length;
          stats.halftone ??= r4.raster?.halftone ?? null;
          stats.kind ??= r4.raster?.kind ?? null;
          entries.push({ page: r4.page, ctx: r4.ctx });
          for (const n2 of r4.notes) {
            const a = notesByStaff.get(n2.staff) ?? [];
            a.push(n2);
            notesByStaff.set(n2.staff, a);
          }
          pages.push({ source: si, pn, result: r4 });
        }
      } finally {
        page.cleanup?.();
      }
      opts.onPage?.(++done, total);
    }
  }
  markSplitBars(barPages);
  for (const { bars } of barPages) stats.full += bars.filter((b) => b.full || b.split).length;
  const noteBoxes = /* @__PURE__ */ new Map();
  if (opts.noteIds) {
    let k2 = 0;
    pages.forEach(({ result }, pi) => {
      for (const n2 of result.notes) {
        const id = `omr${++k2}`;
        n2.omrId = id;
        noteBoxes.set(id, { page: pi, box: { ...n2.sym.box }, step: n2.step, octave: n2.octave, alter: n2.alter, rest: n2.rest });
      }
    });
  }
  const noteId = opts.noteIds ? (n2) => n2.omrId : void 0;
  const notesOf = (st) => notesByStaff.get(st) ?? [];
  const emptyAssign = () => [];
  if (!entries.length) return { xml: null, score: null, stats, pages, noteBoxes, assignment: emptyAssign, rebuild: () => {
    throw new Error("没有谱表");
  } };
  settleLyricVerses([...notesByStaff.values()].flat());
  let score = buildScore(entries);
  const xml = scoreToMusicXml(score, notesOf, { title: opts.title, ...noteId ? { noteId } : {} });
  stats.systems = score.systems.length;
  stats.parts = score.parts.length;
  return {
    xml,
    score,
    stats,
    pages,
    noteBoxes,
    assignment: () => score.systems.map((e, si) => e.sys.staves.map((st) => score.scoreStaves.findIndex((ss) => ss.staves[si] === st))),
    rebuild: (slots) => {
      score = buildScore(entries, { slots });
      return { xml: scoreToMusicXml(score, notesOf, { title: opts.title, ...noteId ? { noteId } : {} }), score };
    }
  };
}
function staffGroupCount(bin) {
  const rows = findStaffLines(bin);
  const { groups } = completeStaffLines(bin, rows, groupStaves(rows));
  return groups.filter((g2) => g2.lines.reduce((n2, l2) => n2 + (l2.right - l2.left), 0) / g2.lines.length > bin.w * 0.4).length;
}
function looksLikeStaff(bin) {
  return staffGroupCount(bin) > 0;
}
function isGlyphLike(o) {
  return o.curves >= 1 && o.bbox.w > 0.5 && o.bbox.h > 0.5;
}
function collectGlyphStats(pages) {
  const out = [];
  for (const p2 of pages) {
    for (const o of p2.objs) {
      if (!isGlyphLike(o)) continue;
      out.push({
        page: p2.page,
        h: o.bbox.h,
        w: o.bbox.w,
        x: o.bbox.x,
        y: o.bbox.y,
        cy: o.bbox.y + o.bbox.h / 2,
        curves: o.curves,
        pageH: p2.height,
        pageW: p2.width
      });
    }
  }
  return out;
}
function quantile(sorted, q2) {
  if (!sorted.length) return 0;
  const i2 = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q2)));
  return sorted[i2];
}
function clusterBySize(values, relTol = 0.06) {
  if (!values.length) return [];
  const v2 = [...values].sort((a, b) => a - b);
  const groups = [];
  let cur = [v2[0]];
  for (let i2 = 1; i2 < v2.length; i2++) {
    const med2 = cur[Math.floor(cur.length / 2)];
    if (Math.abs(v2[i2] - med2) / Math.max(med2, 0.01) > relTol) {
      groups.push({ vals: cur });
      cur = [];
    }
    cur.push(v2[i2]);
  }
  groups.push({ vals: cur });
  return groups.map((g2) => ({
    center: g2.vals[Math.floor(g2.vals.length / 2)],
    min: g2.vals[0],
    max: g2.vals[g2.vals.length - 1],
    n: g2.vals.length
  }));
}
function isDot(o) {
  const { w, h: h2 } = o.bbox;
  return o.curves >= 1 && w > 0.4 && w < 4 && h2 > 0.4 && h2 < 4 && Math.abs(w - h2) / Math.max(w, h2) < 0.25;
}
function detectProfile(pages, id = "unknown") {
  const stats = collectGlyphStats(pages);
  const pageW = pages[0]?.width ?? 0;
  const pageH = pages[0]?.height ?? 0;
  const clusters = clusterBySize(stats.map((s) => s.h));
  const families = [];
  for (const c2 of clusters) {
    if (c2.n < Math.max(8, stats.length * 1e-3)) continue;
    const members = stats.filter((s) => s.h >= c2.min && s.h <= c2.max);
    const ws = members.map((m2) => m2.w).sort((a, b) => a - b);
    const ys2 = members.map((m2) => m2.pageH ? m2.cy / m2.pageH : 0).sort((a, b) => a - b);
    families.push({
      id: `h${c2.center.toFixed(1)}`,
      role: "unknown",
      h: c2.center,
      hMin: c2.min,
      hMax: c2.max,
      w: quantile(ws, 0.5),
      count: c2.n,
      yP10: quantile(ys2, 0.1),
      yP50: quantile(ys2, 0.5),
      yP90: quantile(ys2, 0.9)
    });
  }
  families.sort((a, b) => b.count - a.count);
  const dots = [];
  for (const p2 of pages) for (const o of p2.objs) if (isDot(o)) dots.push((o.bbox.w + o.bbox.h) / 2);
  dots.sort((a, b) => a - b);
  const xs = [];
  const ys = [];
  const xe = [];
  const ye = [];
  for (const p2 of pages) {
    for (const o of p2.objs) {
      xs.push(o.bbox.x);
      ys.push(o.bbox.y);
      xe.push(o.bbox.x + o.bbox.w);
      ye.push(o.bbox.y + o.bbox.h);
    }
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  xe.sort((a, b) => a - b);
  ye.sort((a, b) => a - b);
  const cx0 = quantile(xs, 0.02);
  const cy0 = quantile(ys, 0.02);
  const cx1 = quantile(xe, 0.98);
  const cy1 = quantile(ye, 0.98);
  const footerYs = ys.filter((y) => y > cy1);
  const headerYs = ys.filter((y) => y < cy0);
  return {
    id,
    pageW,
    pageH,
    contentBox: { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 },
    families,
    dotDiam: dots.length ? dots[Math.floor(dots.length / 2)] : 0,
    headerBand: headerYs.length ? [quantile(headerYs, 0.05), cy0] : null,
    footerBand: footerYs.length ? [cy1, quantile(footerYs, 0.95)] : null,
    sampledPages: pages.length,
    sampledObjs: stats.length
  };
}
const cx$1 = (r4) => r4.x + r4.w / 2;
const cy$1 = (r4) => r4.y + r4.h / 2;
const bottom$3 = (r4) => r4.y + r4.h;
const right$3 = (r4) => r4.x + r4.w;
function overlap1d(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
function median$3(v2) {
  if (!v2.length) return 0;
  const s = [...v2].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function q75(v2) {
  if (!v2.length) return 0;
  const a = [...v2].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * 0.75))];
}
const effW = (o) => Math.max(o.bbox.w, o.lineWidth, 0.1);
const effH = (o) => Math.max(o.bbox.h, o.lineWidth, 0.1);
function coarseKey(o) {
  return `${o.curves}/${o.segs}/${o.bbox.w.toFixed(1)}/${o.bbox.h.toFixed(1)}`;
}
function noteHeightOf(profile) {
  const f2 = profile.families.filter((f22) => f22.count > 100 && f22.w / f22.h < 0.75 && f22.h > 4).sort((a, b) => b.count - a.count)[0];
  return f2?.h ?? 8.3;
}
function lyricHeightOf(profile, noteH) {
  const f2 = profile.families.filter((f22) => f22.count > 100 && f22.w / f22.h > 0.85 && f22.h > noteH).sort((a, b) => b.count - a.count)[0];
  return f2?.h ?? noteH * 1.25;
}
function classifyPage(page, profile, opts = {}) {
  const objs = page.objs;
  const out = objs.map((o) => ({ obj: o, cls: "unclassified", row: -1, why: "" }));
  const set = (i2, cls, why) => {
    if (out[i2].cls === "storyText" && cls !== "storyText") return;
    if (out[i2].cls === "ornament" && cls !== "ornament") return;
    out[i2].cls = cls;
    out[i2].why = why;
  };
  const noteH = opts.noteH ?? noteHeightOf(profile);
  const lyricH = lyricHeightOf(profile, noteH);
  const ornaments = detectOrnamentFrames(objs, noteH, profile.contentBox.w);
  for (const orn of ornaments) {
    for (const i2 of orn.idx) set(i2, "ornament", `重复纹样 ×${orn.idx.length}，围成 ${orn.box.w.toFixed(0)}×${orn.box.h.toFixed(0)} 的框`);
  }
  for (const orn of ornaments) {
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (out[i2].cls !== "unclassified") continue;
      if (intersectRect(objs[i2].bbox, orn.box)) set(i2, "storyText", "花边框内的注解正文");
    }
  }
  for (let i2 = 0; i2 < objs.length; i2++) {
    const o = objs[i2];
    if (o.curves >= 40 && o.bbox.w > o.bbox.h * 3) set(i2, "textLine", `整行合成 path（curves=${o.curves}）`);
  }
  const barlineIdx = [];
  const shortBarIdx = [];
  const hLineIdx = [];
  const frames = [];
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified") continue;
    const o = objs[i2];
    if (o.curves > 2) continue;
    const { w, h: h2 } = o.bbox;
    const ew = effW(o);
    const eh = effH(o);
    if (o.curves === 0 && eh / ew >= 2.5 && ew <= noteH * 0.35) {
      if (h2 > noteH * 2.5) {
        set(i2, "rule", `竖线太高（${h2.toFixed(1)}），是框的竖边`);
      } else if (h2 >= noteH * 1.15) {
        barlineIdx.push(i2);
        set(i2, "barline", `细高竖线 ${w.toFixed(1)}×${h2.toFixed(1)}`);
      } else {
        shortBarIdx.push(i2);
      }
    } else if (ew / eh >= 2.5 && eh <= Math.max(2.5, noteH * 0.3)) {
      hLineIdx.push(i2);
    } else if (w > noteH * 3 && h2 > noteH * 1.5) {
      frames.push(o.bbox);
      set(i2, "frame", `矩形框 ${w.toFixed(0)}×${h2.toFixed(0)}${o.dash ? "（虚线）" : ""}`);
    }
  }
  const bands = [];
  {
    const bars = barlineIdx.map((i2) => objs[i2].bbox).sort((a, b) => cy$1(a) - cy$1(b));
    for (const b of bars) {
      const last = bands[bands.length - 1];
      if (last && overlap1d(last.top, last.bottom, b.y, bottom$3(b)) > Math.min(last.bottom - last.top, b.h) * 0.4) {
        last.top = Math.min(last.top, b.y);
        last.bottom = Math.max(last.bottom, bottom$3(b));
        last.x0 = Math.min(last.x0, b.x);
        last.x1 = Math.max(last.x1, right$3(b));
        last.barlineXs.push(cx$1(b));
      } else {
        bands.push({
          index: bands.length,
          top: b.y,
          bottom: bottom$3(b),
          noteTop: b.y,
          noteBottom: bottom$3(b),
          x0: b.x,
          x1: right$3(b),
          barlineXs: [cx$1(b)],
          noteCount: 0
        });
      }
    }
    const minSpan = profile.contentBox.w * 0.12;
    const noteSized = (b) => b.h >= noteH * 0.75 && b.h <= noteH * 1.3 && b.w <= noteH * 1.1;
    const keep = bands.filter((b) => {
      if (b.barlineXs.length >= 3) return true;
      const span = Math.max(...b.barlineXs) - Math.min(...b.barlineXs);
      if (span >= minSpan) return true;
      return objs.some((o, i2) => {
        if (out[i2].cls !== "unclassified" || !noteSized(o.bbox)) return false;
        const c2 = cy$1(o.bbox);
        return c2 >= b.top && c2 <= b.bottom;
      });
    });
    if (keep.length !== bands.length) {
      const kept = new Set(keep);
      for (const i2 of barlineIdx) {
        const b = objs[i2].bbox;
        if (!keep.some((k2) => overlap1d(k2.top, k2.bottom, b.y, bottom$3(b)) > 0)) {
          out[i2].cls = "unclassified";
          out[i2].why = "";
        }
      }
      bands.length = 0;
      for (const b of keep) if (kept.has(b)) bands.push(b);
    }
    bands.forEach((b, i2) => {
      b.index = i2;
      b.barlineXs.sort((a, c2) => a - c2);
    });
  }
  const bandOf = (r4, slackAbove, slackBelow) => {
    for (const b of bands) if (bottom$3(r4) >= b.top - slackAbove && r4.y <= b.bottom + slackBelow) return b.index;
    return -1;
  };
  {
    const inBoxText = (i2) => (out[i2].cls === "unclassified" || out[i2].cls === "textLine") && (objs[i2].curves >= 1 || objs[i2].bbox.h > noteH * 0.3);
    const tileRows = /* @__PURE__ */ new Map();
    for (let i2 = 0; bands.length && i2 < objs.length; i2++) {
      if (out[i2].cls !== "unclassified") continue;
      const b = objs[i2].bbox;
      if (b.w > noteH * 1.6 || b.h > noteH * 1.6) continue;
      const k2 = coarseKey(objs[i2]);
      const rows = tileRows.get(k2) ?? [];
      const row = rows.find((r4) => Math.abs(r4.y - cy$1(b)) <= noteH * 0.4);
      if (row) {
        row.x0 = Math.min(row.x0, b.x);
        row.x1 = Math.max(row.x1, right$3(b));
        row.idx.push(i2);
      } else rows.push({ key: k2, y: cy$1(b), x0: b.x, x1: right$3(b), idx: [i2] });
      tileRows.set(k2, rows);
    }
    for (const rows of tileRows.values()) {
      const edges = rows.filter((r4) => r4.idx.length >= 8 && r4.x1 - r4.x0 > profile.contentBox.w * 0.3).sort((a, b) => a.y - b.y);
      for (let a = 0; a + 1 < edges.length; a++) {
        const t2 = edges[a];
        const b2 = edges[a + 1];
        if (b2.y - t2.y < lyricH * 2.5 || b2.y - t2.y > lyricH * 30) continue;
        if (bands.some((bd) => bd.top < b2.y && bd.bottom > t2.y)) continue;
        for (const i2 of [...t2.idx, ...b2.idx]) set(i2, "ornament", "注解框的纹样边");
        for (let i2 = 0; i2 < objs.length; i2++) {
          if (!inBoxText(i2)) continue;
          const bb = objs[i2].bbox;
          if (cy$1(bb) > t2.y && cy$1(bb) < b2.y && right$3(bb) > t2.x0 - lyricH && bb.x < t2.x1 + lyricH) set(i2, "storyText", "上下两条纹样边之间的注解正文");
        }
      }
    }
    const wide = hLineIdx.filter((i2) => objs[i2].bbox.w > page.width * 0.5).sort((a, b) => cy$1(objs[a].bbox) - cy$1(objs[b].bbox));
    for (let a = 0; a < wide.length; a++) {
      for (let b = a + 1; b < wide.length; b++) {
        const y0 = bottom$3(objs[wide[a]].bbox);
        const y1 = objs[wide[b]].bbox.y;
        const gap = y1 - y0;
        if (gap <= lyricH * 0.5) continue;
        const hx0 = Math.min(objs[wide[a]].bbox.x, objs[wide[b]].bbox.x);
        const hx1 = Math.max(right$3(objs[wide[a]].bbox), right$3(objs[wide[b]].bbox));
        const vAt = (nearX) => objs.some((o2, j2) => {
          const q2 = o2.bbox;
          return out[j2].cls === "rule" && q2.w <= 2 && q2.y <= y0 + 2 && bottom$3(q2) >= y1 - 2 && Math.abs(cx$1(q2) - nearX) <= lyricH;
        });
        const boxed = vAt(hx0) && vAt(hx1);
        if (!boxed && gap > lyricH * 8) break;
        if (!boxed && bands.some((bd) => bd.top < y1 && bd.bottom > y0)) break;
        for (let i2 = 0; i2 < objs.length; i2++) {
          if (!inBoxText(i2)) continue;
          const bb = objs[i2].bbox;
          if (bb.y >= y0 && bottom$3(bb) <= y1) set(i2, "storyText", "通栏双线框内的注解正文");
        }
        break;
      }
    }
  }
  const noteBoxes = [];
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified") continue;
    const o = objs[i2];
    const { w, h: h2 } = o.bbox;
    if (h2 < noteH * 0.75 || h2 > noteH * 1.3 || w > noteH * 1.1) continue;
    const row = bandOf(o.bbox, noteH * 0.35, noteH * 0.35);
    if (row < 0) continue;
    set(i2, "note", `谱行 ${row} 内、高 ${h2.toFixed(1)}≈字号`);
    out[i2].row = row;
    noteBoxes.push({ i: i2, box: o.bbox, row });
    bands[row].noteCount++;
  }
  for (const b of bands) {
    const mine = noteBoxes.filter((n2) => n2.row === b.index);
    if (mine.length) {
      b.noteTop = median$3(mine.map((n2) => n2.box.y));
      b.noteBottom = median$3(mine.map((n2) => bottom$3(n2.box)));
    }
  }
  for (const b of bands) {
    const mine = noteBoxes.filter((n2) => n2.row === b.index);
    if (mine.length < 3) continue;
    const mid = median$3(mine.map((n2) => cy$1(n2.box)));
    for (const n2 of mine) {
      if (Math.abs(cy$1(n2.box) - mid) > noteH * 0.45) {
        out[n2.i].cls = "unclassified";
        out[n2.i].row = -1;
        out[n2.i].why = "";
        b.noteCount--;
      }
    }
  }
  for (let k2 = noteBoxes.length - 1; k2 >= 0; k2--) if (out[noteBoxes[k2].i].cls !== "note") noteBoxes.splice(k2, 1);
  for (const b of bands) {
    const mine = noteBoxes.filter((n2) => n2.row === b.index);
    if (mine.length) {
      b.noteTop = median$3(mine.map((n2) => n2.box.y));
      b.noteBottom = median$3(mine.map((n2) => bottom$3(n2.box)));
    }
  }
  noteBoxes.sort((a, b) => a.box.x - b.box.x);
  const dotMax = Math.max(profile.dotDiam * 1.8, noteH * 0.35);
  const dotMin = profile.dotDiam * 0.5;
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified") continue;
    const o = objs[i2];
    const { w, h: h2 } = o.bbox;
    if (w > dotMax || h2 > dotMax) continue;
    if (Math.abs(w - h2) / Math.max(w, h2) > 0.45) continue;
    if (w < dotMin && h2 < dotMin) {
      set(i2, "rule", `碎点 ${w.toFixed(2)}×${h2.toFixed(2)}，不足半个 dotDiam`);
      continue;
    }
    let best = -1;
    let bestD = Infinity;
    for (const n2 of noteBoxes) {
      const d2 = Math.hypot(cx$1(o.bbox) - cx$1(n2.box), cy$1(o.bbox) - cy$1(n2.box));
      if (d2 < bestD) {
        bestD = d2;
        best = n2.i;
      }
    }
    if (best < 0 || bestD > noteH * 2.2) continue;
    const nb = objs[best].bbox;
    const dx = cx$1(o.bbox) - cx$1(nb);
    const dyTop = nb.y - bottom$3(o.bbox);
    out[i2].row = out[best].row;
    if (Math.abs(dx) <= nb.w * 0.6) set(i2, "octaveDot", `与音符同 x（Δx=${dx.toFixed(1)}），在其${dyTop > 0 ? "上" : "下"}方`);
    else if (dx > nb.w * 0.3 && Math.abs(cy$1(o.bbox) - cy$1(nb)) < nb.h * 0.6) set(i2, "augmentDot", `音符右侧同高`);
    else set(i2, "repeatDot", `近音符但既不同 x 也不在右侧`);
  }
  for (const i2 of shortBarIdx) {
    if (out[i2].cls !== "unclassified") continue;
    const row = bandOf(objs[i2].bbox, noteH * 1.8, noteH * 0.4);
    out[i2].row = row;
    set(i2, row >= 0 ? "bracket" : "rule", `短竖线 h=${objs[i2].bbox.h.toFixed(1)}${row >= 0 ? `，谱行 ${row} 附近` : ""}`);
  }
  for (const i2 of hLineIdx) {
    if (out[i2].cls !== "unclassified") continue;
    const o = objs[i2];
    const { w, h: h2 } = o.bbox;
    if (w > page.width * 0.5) {
      set(i2, "rule", `通栏横线 宽 ${w.toFixed(0)}`);
      continue;
    }
    const row = bandOf(o.bbox, noteH * 0.4, noteH * 1.2);
    if (row < 0) {
      set(i2, "rule", `谱行外横线 ${w.toFixed(1)}×${h2.toFixed(1)}`);
      continue;
    }
    const b = bands[row];
    if (o.bbox.y >= b.noteBottom - noteH * 0.1 && o.bbox.y <= b.noteBottom + noteH * 0.9) {
      out[i2].row = row;
      set(i2, "divLine", `音符底线下方 ${(o.bbox.y - b.noteBottom).toFixed(1)}，减时线`);
    } else if (o.bbox.y < b.noteBottom - noteH * 0.1 && bottom$3(o.bbox) > b.noteTop) {
      out[i2].row = row;
      set(i2, "augmentLine", `与音符同高，增时线`);
    }
  }
  const pendingYi = [];
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified") continue;
    const o = objs[i2];
    const { w, h: h2 } = o.bbox;
    if (o.curves < 1 || o.segs > 12) continue;
    if (w >= noteH * 0.8 && w / Math.max(h2, 0.01) >= 2.2 && h2 <= noteH * 1.1) {
      if (h2 <= 2.6 && w >= lyricH * 0.7 && w <= lyricH * 1.35) {
        pendingYi.push(i2);
        continue;
      }
      out[i2].row = bandOf(o.bbox, noteH * 1.6, noteH * 0.4);
      set(i2, "slur", `宽扁弧 ${w.toFixed(0)}×${h2.toFixed(1)}，段数 ${o.segs}`);
    }
  }
  const pageFooterY = (() => {
    const lines = [];
    for (const o of [...objs].sort((a, b) => cy$1(a.bbox) - cy$1(b.bbox))) {
      const last = lines[lines.length - 1];
      if (last && cy$1(o.bbox) - last.cy <= lyricH * 0.6) last.h.push(o.bbox.h);
      else lines.push({ cy: cy$1(o.bbox), h: [o.bbox.h] });
    }
    const bottom2 = lines[lines.length - 1];
    const above = lines[lines.length - 2];
    if (!bottom2 || !above) return Infinity;
    if (bottom2.h.length > 12) return Infinity;
    if (bottom2.cy - above.cy <= lyricH * 1.2) return Infinity;
    if (median$3(bottom2.h) > noteH * 1.05) return Infinity;
    return bottom2.cy - lyricH * 0.5;
  })();
  const footerIdx = /* @__PURE__ */ new Set();
  {
    const order = objs.map((_, i2) => i2).sort((a, b) => cy$1(objs[a].bbox) - cy$1(objs[b].bbox));
    const lines = [];
    for (const i2 of order) {
      const last = lines[lines.length - 1];
      if (last && cy$1(objs[i2].bbox) - cy$1(objs[last[0]].bbox) <= lyricH * 0.6) last.push(i2);
      else lines.push([i2]);
    }
    const ln = lines[lines.length - 1];
    if (ln && ln.length >= 3 && ln.length <= 10) {
      const bs = ln.map((i2) => objs[i2].bbox).sort((a, b) => a.x - b.x);
      const tiny = (q2) => q2.w <= profile.dotDiam * 1.6 && q2.h <= profile.dotDiam * 1.6;
      const span = right$3(bs[bs.length - 1]) - bs[0].x;
      if (span <= lyricH * 4 && tiny(bs[0]) && tiny(bs[bs.length - 1]) && median$3(bs.map((q2) => q2.h)) <= noteH * 1.05)
        for (const i2 of ln) footerIdx.add(i2);
    }
  }
  const titleH = lyricH * 1.25;
  const headerPending = [];
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified" && !(out[i2].cls === "textLine" && objs[i2].bbox.h >= titleH)) continue;
    const o = objs[i2];
    const b = o.bbox;
    if (cy$1(b) >= pageFooterY || footerIdx.has(i2)) {
      set(i2, "footer", footerIdx.has(i2) ? "版心最底下、两个小点夹着数字，是页码" : "本页最底部、与正文有明显空隙");
      continue;
    }
    if (b.h >= titleH && b.w / Math.max(b.h, 0.1) < 0.12) {
      set(i2, "rule", `标题带里的细长条 ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
      continue;
    }
    if (b.h >= titleH) {
      set(i2, "title", `大字号 h=${b.h.toFixed(1)}`);
      continue;
    }
    if (profile.headerBand && cy$1(b) <= profile.headerBand[1]) {
      if (!bands.some((bd) => bd.noteTop >= bottom$3(b) && bd.noteTop - bottom$3(b) < noteH * 3.2)) {
        headerPending.push(i2);
        continue;
      }
    }
  }
  {
    const titles = out.filter((c2) => c2.cls === "title" && !c2.dup).map((c2) => c2.obj.bbox);
    const lines = [];
    for (const b of [...titles].sort((a, b2) => a.y - b2.y)) {
      const last = lines[lines.length - 1];
      if (last && b.y < Math.max(...last.map(bottom$3))) last.push(b);
      else lines.push([b]);
    }
    for (const ln of lines) {
      const mem = [...ln];
      for (let pass = 0; pass < 8; pass++) {
        const ty0 = Math.min(...mem.map((b) => b.y));
        const ty1 = Math.max(...mem.map(bottom$3));
        const tx0 = Math.min(...mem.map((b) => b.x));
        const tx1 = Math.max(...mem.map(right$3));
        let added = false;
        for (let i2 = 0; i2 < objs.length; i2++) {
          if (out[i2].cls !== "unclassified") continue;
          const b = objs[i2].bbox;
          if (b.y < ty0 - 2 || bottom$3(b) > ty1 + 2) continue;
          if (right$3(b) < tx0 - titleH * 1.8 || b.x > tx1 + titleH * 1.8) continue;
          if (b.x > tx1 || right$3(b) < tx0) {
            const outward = b.x > tx1 ? 1 : -1;
            const tight = objs.some((o2, j2) => {
              if (j2 === i2 || out[j2].dup) return false;
              const q2 = o2.bbox;
              if (q2.h >= titleH) return false;
              if (q2.y < ty0 - 2 || bottom$3(q2) > ty1 + 2) return false;
              const gap = outward > 0 ? q2.x - right$3(b) : b.x - right$3(q2);
              return gap >= -1 && gap <= lyricH;
            });
            if (tight) continue;
          }
          set(i2, "title", `标题行内的标点 ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
          mem.push(b);
          added = true;
        }
        if (!added) break;
      }
    }
  }
  for (const i2 of headerPending) if (out[i2].cls === "unclassified") set(i2, "category", "页眉带");
  {
    const tRows = out.filter((c2) => c2.cls === "title" && !c2.dup).map((c2) => c2.obj.bbox).filter((b) => b.h >= titleH);
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (out[i2].cls !== "unclassified") continue;
      const b = objs[i2].bbox;
      if (b.h >= titleH) continue;
      if (!tRows.some((t2) => b.y < bottom$3(t2) && bottom$3(b) > t2.y)) continue;
      set(i2, "category", "与大标题同高的小字，是页眉分类词");
    }
  }
  {
    const lines = [];
    const titleIdx = [];
    for (let i2 = 0; i2 < objs.length; i2++) if (out[i2].cls === "title" && !out[i2].dup) titleIdx.push(i2);
    for (const i2 of titleIdx.sort((a, b) => objs[a].bbox.y - objs[b].bbox.y)) {
      const last = lines[lines.length - 1];
      if (last && objs[i2].bbox.y < Math.max(...last.map((j2) => bottom$3(objs[j2].bbox)))) last.push(i2);
      else lines.push([i2]);
    }
    for (const ln of lines) {
      const runs = [];
      for (const i2 of ln.slice().sort((a, b) => objs[a].bbox.x - objs[b].bbox.x)) {
        const last = runs[runs.length - 1];
        const prev = last ? objs[last[last.length - 1]].bbox : null;
        if (prev && objs[i2].bbox.x - right$3(prev) <= titleH * 1.2) last.push(i2);
        else runs.push([i2]);
      }
      if (runs.length < 2) continue;
      const longest = runs.reduce((a, b) => b.length > a.length ? b : a, runs[0]);
      for (const run of runs) {
        if (run === longest || run.length > 4) continue;
        const x0 = Math.min(...run.map((i2) => objs[i2].bbox.x));
        const x1 = Math.max(...run.map((i2) => right$3(objs[i2].bbox)));
        const nearLeft = x0 < profile.contentBox.x + profile.contentBox.w * 0.15;
        const nearRight = x1 > profile.contentBox.x + profile.contentBox.w * 0.85;
        if (nearLeft || nearRight) for (const i2 of run) set(i2, "songNumber", `大字号、孤立成撮、${nearLeft ? "贴左" : "贴右"}`);
      }
    }
  }
  const boxes = [...frames, ...ornaments.map((o) => o.box)];
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified") continue;
    for (const f2 of boxes) {
      if (intersectRect(objs[i2].bbox, f2)) {
        set(i2, "textLine", "落在框内");
        break;
      }
    }
  }
  const pendingSet = new Set(pendingYi);
  const titleBoxes = out.filter((c2) => c2.cls === "title" && !c2.dup).map((c2) => c2.obj.bbox);
  for (let i2 = 0; i2 < objs.length; i2++) {
    if (out[i2].cls !== "unclassified" && out[i2].cls !== "textLine" || pendingSet.has(i2)) continue;
    const o = objs[i2];
    const b = o.bbox;
    let above = -1;
    let below = -1;
    let dAbove = Infinity;
    let dBelow = Infinity;
    for (const bd of bands) {
      if (bottom$3(b) <= bd.noteTop + noteH * 0.2) {
        const d2 = bd.noteTop - bottom$3(b);
        if (d2 < dBelow) {
          dBelow = d2;
          below = bd.index;
        }
      }
      if (b.y >= bd.noteBottom - noteH * 0.2) {
        const d2 = b.y - bd.noteBottom;
        if (titleBoxes.some((t2) => t2.y >= bd.noteBottom && bottom$3(t2) <= b.y)) continue;
        if (d2 < dAbove) {
          dAbove = d2;
          above = bd.index;
        }
      }
    }
    const narrow = b.w / Math.max(b.h, 0.1) < 0.82;
    const small = b.h <= noteH * 1.05;
    if (o.curves >= 1 && b.w >= noteH * 0.8 && b.w / Math.max(b.h, 0.1) >= 1.6 && b.h <= noteH * 0.5) {
      out[i2].row = bandOf(b, noteH * 1.6, noteH * 0.4);
      set(i2, "slur", `和弦带里的宽扁弧 ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
      continue;
    }
    if (below >= 0 && dBelow < noteH * 1.6 && b.h >= noteH * 0.5 && b.h <= noteH * 0.75 && b.w <= noteH * 0.6) {
      const beamed = objs.some((o2, j2) => {
        if (j2 === i2) return false;
        const q2 = o2.bbox;
        if (q2.h > 1 || q2.w > b.w * 1.8 || q2.w < b.w * 0.6) return false;
        if (Math.abs(cx$1(q2) - cx$1(b)) > noteH * 0.3) return false;
        return q2.y >= bottom$3(b) - 1 && q2.y <= bottom$3(b) + noteH * 0.9;
      });
      if (beamed) {
        out[i2].row = below;
        set(i2, "note", `谱行 ${below} 上方 ${dBelow.toFixed(1)} 的小号数字带减时线，倚音`);
        continue;
      }
    }
    if (above >= 0 && b.h >= lyricH * 0.85 && b.w >= lyricH * 0.6) {
      out[i2].row = above;
      set(i2, "lyric", `谱行 ${above} 下方 ${dAbove.toFixed(1)} 的满格汉字`);
      continue;
    }
    const voltaBelow = below >= 0 && out.some(
      (c2, j2) => (c2.cls === "bracket" || c2.cls === "rule") && !c2.dup && objs[j2].bbox.y >= bottom$3(b) && bottom$3(objs[j2].bbox) <= bands[below].noteTop + noteH * 0.2 && right$3(objs[j2].bbox) > b.x - noteH && objs[j2].bbox.x < right$3(b) + noteH
    );
    const hanOnLine = voltaBelow && objs.some((o2, j2) => {
      if (j2 === i2 || out[j2].dup) return false;
      const q2 = o2.bbox;
      return q2.h >= lyricH * 0.85 && q2.w >= lyricH * 0.6 && Math.abs(bottom$3(q2) - bottom$3(b)) <= 3 && Math.abs(cx$1(q2) - cx$1(b)) <= lyricH * 8;
    });
    const chordish = below >= 0 && dBelow < noteH * (voltaBelow && !hanOnLine ? 3 : narrow || small ? 2.4 : 1.6);
    if (out[i2].cls === "textLine") {
      if (below >= 0 && dBelow <= dAbove && dBelow < noteH * 5) {
        out[i2].row = below;
        set(i2, "chord", `谱行 ${below} 上方 ${dBelow.toFixed(1)} 的整行文字`);
      }
      continue;
    }
    if (chordish && (dBelow <= dAbove || (narrow || small) && dBelow <= dAbove * 1.5)) {
      out[i2].row = below;
      set(i2, "chord", `谱行 ${below} 上方 ${dBelow.toFixed(1)}${narrow ? "，窄字" : small ? "，小字" : ""}`);
    } else if (above >= 0) {
      out[i2].row = above;
      set(i2, "lyric", `谱行 ${above} 下方 ${dAbove.toFixed(1)}`);
    } else if (below >= 0) {
      out[i2].row = below;
      set(i2, "chord", `谱行 ${below} 上方 ${dBelow.toFixed(1)}`);
    }
  }
  for (const bd of bands) {
    const bots = [];
    for (let i2 = 0; i2 < objs.length; i2++) if (out[i2].cls === "chord" && !out[i2].dup && out[i2].row === bd.index) bots.push(bottom$3(objs[i2].bbox));
    if (bots.length < 2) continue;
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (out[i2].cls !== "lyric" || out[i2].dup) continue;
      const b = objs[i2].bbox;
      if (bottom$3(b) > bd.noteTop + noteH * 0.2) continue;
      if (b.h >= lyricH * 0.85 && b.w >= lyricH * 0.6) continue;
      if (bots.filter((y) => Math.abs(y - bottom$3(b)) <= noteH * 0.25).length < 2) continue;
      if (objs.some((o2, j2) => {
        if (j2 === i2 || out[j2].dup) return false;
        const q2 = o2.bbox;
        return q2.h >= lyricH * 0.85 && q2.w >= lyricH * 0.6 && Math.abs(bottom$3(q2) - bottom$3(b)) <= 3 && Math.abs(cx$1(q2) - cx$1(b)) <= lyricH * 8;
      }))
        continue;
      out[i2].row = bd.index;
      set(i2, "chord", `与谱行 ${bd.index} 上方那排和弦共基线`);
    }
  }
  if (!bands.length) {
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (out[i2].cls !== "unclassified") continue;
      const { w, h: h2 } = objs[i2].bbox;
      if (w <= profile.dotDiam * 2 && h2 <= profile.dotDiam * 2) set(i2, "leader", "目录引导点");
      else set(i2, "tocEntry", "无谱行页的条目文字");
    }
  }
  for (const i2 of pendingYi) {
    if (out[i2].cls !== "unclassified") continue;
    const b = objs[i2].bbox;
    const mid = cy$1(b);
    let neighbor = 0;
    let neighborRow = -1;
    for (let j2 = 0; j2 < objs.length; j2++) {
      if (out[j2].cls !== "lyric" && out[j2].cls !== "credit" || out[j2].dup) continue;
      const q2 = objs[j2].bbox;
      if (q2.h < lyricH * 0.7) continue;
      if (Math.abs(cy$1(q2) - mid) > lyricH * 0.28) continue;
      const gap = q2.x > b.x ? q2.x - right$3(b) : b.x - right$3(q2);
      if (gap <= lyricH * 3.5 && b.w >= q2.w * 0.75 && b.w <= q2.w * 1.25) {
        neighbor = bottom$3(q2);
        neighborRow = out[j2].row;
        break;
      }
    }
    if (neighbor) {
      out[i2].cls = "lyricYi";
      out[i2].baseline = neighbor;
      out[i2].why = `与歌词同行的扁横条 ${b.w.toFixed(1)}×${b.h.toFixed(1)}，是「一」`;
      out[i2].row = neighborRow >= 0 ? neighborRow : bandOf(b, noteH * 1.6, noteH * 4);
    } else {
      out[i2].cls = "slur";
      out[i2].why = `宽扁弧 ${b.w.toFixed(0)}×${b.h.toFixed(1)}（无同基线歌词邻居）`;
      out[i2].row = bandOf(b, noteH * 1.6, noteH * 0.4);
    }
  }
  {
    const narrowLeftOf = (eb) => objs.some((o, j2) => {
      if (out[j2].dup) return false;
      const b = o.bbox;
      if (Math.abs(cy$1(b) - cy$1(eb)) > noteH * 0.95) return false;
      const gap = eb.x - right$3(b);
      return gap >= -0.5 && gap <= noteH * 0.75 && b.w / Math.max(b.h, 0.1) < 0.6;
    });
    const eqs = [];
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (out[i2].cls !== "chord" || out[i2].dup) continue;
      const b = objs[i2].bbox;
      const ratio = b.w / Math.max(b.h, 0.1);
      if (objs[i2].curves !== 0 || b.h < noteH * 0.28 || b.h > noteH * 0.55 || ratio < 1.3 || ratio > 2.6) continue;
      if (!narrowLeftOf(b)) continue;
      eqs.push(i2);
    }
    for (const e of eqs) {
      const eb = objs[e].bbox;
      set(e, "keyMeter", `等号 ${eb.w.toFixed(1)}×${eb.h.toFixed(1)}`);
      const grp = [eb];
      const limit = noteH * 7;
      for (let pass = 0; pass < 4; pass++) {
        let grew = false;
        for (let i2 = 0; i2 < objs.length; i2++) {
          if (out[i2].cls !== "chord" || out[i2].dup) continue;
          const b = objs[i2].bbox;
          if (Math.abs(cy$1(b) - cy$1(eb)) > noteH * 0.95) continue;
          if (Math.abs(cx$1(b) - cx$1(eb)) > limit) continue;
          if (!grp.some((q2) => Math.min(Math.abs(b.x - right$3(q2)), Math.abs(q2.x - right$3(b))) <= noteH * 0.75)) continue;
          set(i2, "keyMeter", `紧挨调号，调号的一部分`);
          grp.push(b);
          grew = true;
        }
        if (!grew) break;
      }
    }
  }
  {
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (out[i2].cls !== "rule" && out[i2].cls !== "chord") continue;
      if (out[i2].dup) continue;
      const b = objs[i2].bbox;
      if (b.h > noteH * 0.15 || b.w < noteH * 0.8 || b.w > noteH * 2.4) continue;
      const above = [];
      const below = [];
      for (let j2 = 0; j2 < objs.length; j2++) {
        if (j2 === i2 || out[j2].dup) continue;
        if (out[j2].cls !== "chord" && out[j2].cls !== "keyMeter") continue;
        const q2 = objs[j2].bbox;
        const qcx = q2.x + q2.w / 2;
        if (qcx < b.x - noteH * 0.3 || qcx > right$3(b) + noteH * 0.3) continue;
        const dUp = b.y - bottom$3(q2);
        const dDown = q2.y - bottom$3(b);
        if (dUp >= -1 && dUp < noteH * 0.8) above.push(j2);
        else if (dDown >= -1 && dDown < noteH * 0.8) below.push(j2);
      }
      if (!above.length || !below.length) continue;
      set(i2, "keyMeter", `拍号的分数线 ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
      for (const j2 of [...above, ...below]) set(j2, "keyMeter", `拍号的数字`);
    }
  }
  {
    for (let i2 = 0; i2 < objs.length; i2++) {
      const cls = out[i2].cls;
      if (cls !== "rule" && cls !== "augmentLine" && cls !== "divLine") continue;
      const b = objs[i2].bbox;
      if (b.h > noteH * 0.15 || b.w < noteH * 0.8 || b.w > noteH * 2.4) continue;
      const pick = (up2) => {
        const r4 = [];
        for (let j2 = 0; j2 < objs.length; j2++) {
          if (j2 === i2) continue;
          if (out[j2].cls === "chord" || out[j2].cls === "credit" || out[j2].cls === "storyText" || out[j2].cls === "title") continue;
          const q2 = objs[j2].bbox;
          if (q2.h > noteH * 0.85 || q2.h < noteH * 0.5 || q2.w > noteH * 0.9) continue;
          const qcx = cx$1(q2);
          if (qcx < b.x - noteH * 0.3 || qcx > right$3(b) + noteH * 0.3) continue;
          const d2 = up2 ? b.y - bottom$3(q2) : q2.y - bottom$3(b);
          if (d2 >= -1 && d2 < noteH * 0.5) r4.push(j2);
        }
        return r4;
      };
      const up = pick(true);
      const dn = pick(false);
      if (!up.length || !dn.length) continue;
      set(i2, "keyMeter", `谱行内转拍号的分数线 ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
      for (const j2 of [...up, ...dn]) set(j2, "keyMeter", "谱行内转拍号的数字");
    }
  }
  {
    const CELL = 4;
    const byCell = /* @__PURE__ */ new Map();
    for (let i2 = 0; i2 < objs.length; i2++) {
      const b = objs[i2].bbox;
      const k2 = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
      const g2 = byCell.get(k2);
      if (g2) g2.push(i2);
      else byCell.set(k2, [i2]);
    }
    const paired = /* @__PURE__ */ new Set();
    for (let i2 = 0; i2 < objs.length; i2++) {
      if (paired.has(i2) || out[i2].dup) continue;
      const A = objs[i2];
      const gx = Math.floor(A.bbox.x / CELL);
      const gy = Math.floor(A.bbox.y / CELL);
      let mate = -1;
      for (let dx = -1; dx <= 1 && mate < 0; dx++) {
        for (let dy = -1; dy <= 1 && mate < 0; dy++) {
          for (const j2 of byCell.get(`${gx + dx},${gy + dy}`) ?? []) {
            if (j2 === i2 || paired.has(j2) || out[j2].dup) continue;
            const B = objs[j2];
            if (out[i2].cls !== out[j2].cls) continue;
            const samePaint = A.paint === B.paint;
            if (samePaint && (A.curves !== B.curves || A.segs !== B.segs)) continue;
            const tolp = samePaint ? 0.1 : Math.max(A.lineWidth, B.lineWidth, 0.3) * 2;
            if (Math.abs(A.bbox.x - B.bbox.x) <= tolp && Math.abs(A.bbox.y - B.bbox.y) <= tolp && Math.abs(A.bbox.w - B.bbox.w) <= tolp && Math.abs(A.bbox.h - B.bbox.h) <= tolp) {
              mate = j2;
              break;
            }
          }
        }
      }
      if (mate < 0) continue;
      const aStroke = A.paint.toLowerCase().includes("stroke") && !A.paint.toLowerCase().includes("fill");
      const dupI = aStroke ? i2 : mate;
      out[dupI].dup = true;
      paired.add(i2);
      paired.add(mate);
    }
  }
  for (const cls of ["lyric", "title", "tocEntry", "storyText", "category"]) {
    const idx = out.map((c2, i2) => ({ c: c2, i: i2 })).filter((x) => x.c.cls === cls && !x.c.dup).sort((a, b) => a.c.obj.bbox.x - b.c.obj.bbox.x).map((x) => x.i);
    if (idx.length < 2) continue;
    const cell = median$3(idx.map((i2) => objs[i2].bbox.h));
    if (!cell) continue;
    let k2 = 0;
    while (k2 < idx.length - 1) {
      const a = idx[k2];
      const group = [a];
      while (k2 + 1 < idx.length) {
        const b = idx[k2 + 1];
        const A = objs[group[group.length - 1]].bbox;
        const B = objs[b].bbox;
        if (Math.abs(bottom$3(A) - bottom$3(B)) > cell * 0.25) break;
        const gap = B.x - (A.x + A.w);
        if (gap > cell * 0.08) break;
        const wide = B.x + B.w - objs[group[0]].bbox.x;
        if (wide > cell * 1.55) break;
        if (Math.min(A.w, B.w) > cell * 0.55) break;
        if (Math.min(A.h, B.h) < cell * 0.55) break;
        group.push(b);
        k2++;
      }
      if (group.length > 1) {
        const merged = concatObjects(group.map((i2) => objs[i2]));
        objs[group[0]] = merged;
        out[group[0]].obj = merged;
        out[group[0]].why += `（并入 ${group.length - 1} 个偏旁）`;
        for (const j2 of group.slice(1)) out[j2].dup = true;
      }
      k2++;
    }
  }
  for (const bd of bands) {
    const idx = [];
    for (let i2 = 0; i2 < objs.length; i2++) if (out[i2].cls === "chord" && !out[i2].dup && out[i2].row === bd.index) idx.push(i2);
    const lines = [];
    for (const i2 of idx.slice().sort((a, b) => bottom$3(objs[a].bbox) - bottom$3(objs[b].bbox))) {
      const last = lines[lines.length - 1];
      if (last && bottom$3(objs[i2].bbox) - bottom$3(objs[last[last.length - 1]].bbox) <= noteH * 0.35) last.push(i2);
      else lines.push([i2]);
    }
    let chordBase = -Infinity;
    for (const i2 of idx) {
      const b = bottom$3(objs[i2].bbox);
      const same = idx.filter((j2) => Math.abs(bottom$3(objs[j2].bbox) - b) <= noteH * 0.4);
      if (same.length < 3) continue;
      const span = Math.max(...same.map((j2) => right$3(objs[j2].bbox))) - Math.min(...same.map((j2) => objs[j2].bbox.x));
      if (span < noteH * 4) continue;
      if (b > chordBase) chordBase = b;
    }
    for (const ln of lines) {
      if (q75(ln.map((i2) => objs[i2].bbox.h)) > lyricH * 0.92) continue;
      ln.sort((a, b) => objs[a].bbox.x - objs[b].bbox.x);
      let run = [];
      const flush = () => {
        const runLo = run.length ? median$3(run.map((i2) => bottom$3(objs[i2].bbox))) : 0;
        const runX0 = run.length ? Math.min(...run.map((i2) => objs[i2].bbox.x)) : 0;
        const runX1 = run.length ? Math.max(...run.map((i2) => right$3(objs[i2].bbox))) : 0;
        const onChordLine = run.length > 0 && chordBase - runLo <= noteH * 1.2 && idx.filter((j2) => {
          if (run.includes(j2)) return false;
          const q2 = objs[j2].bbox;
          if (q2.x - runX1 < noteH * 4 && runX0 - right$3(q2) < noteH * 4) return false;
          return Math.abs(bottom$3(q2) - runLo) <= noteH * 0.4;
        }).length >= 2;
        if (run.length >= 7 && !onChordLine && median$3(run.map((i2) => objs[i2].bbox.h)) <= lyricH * 0.92)
          for (const i2 of run) set(i2, "credit", `和弦带里密排 ${run.length} 个小字，是词曲署名`);
        run = [];
      };
      for (const i2 of ln) {
        const prev = run.length ? objs[run[run.length - 1]].bbox : null;
        if (prev && objs[i2].bbox.x - right$3(prev) > noteH * 0.8) flush();
        run.push(i2);
      }
      flush();
    }
  }
  for (const bd of bands) {
    const idx = [];
    for (let i2 = 0; i2 < objs.length; i2++) if (out[i2].cls === "chord" && !out[i2].dup && out[i2].row === bd.index) idx.push(i2);
    if (idx.length < 3) continue;
    let base = -Infinity;
    for (const i2 of idx) {
      const b = bottom$3(objs[i2].bbox);
      const same = idx.filter((j2) => Math.abs(bottom$3(objs[j2].bbox) - b) <= noteH * 0.4);
      if (same.length < 3) continue;
      const span = Math.max(...same.map((j2) => right$3(objs[j2].bbox))) - Math.min(...same.map((j2) => objs[j2].bbox.x));
      if (span < noteH * 4) continue;
      if (b > base) base = b;
    }
    if (base === -Infinity) continue;
    const lines2 = [];
    for (const i2 of idx.slice().sort((a, b) => bottom$3(objs[a].bbox) - bottom$3(objs[b].bbox))) {
      const last = lines2[lines2.length - 1];
      if (last && bottom$3(objs[i2].bbox) - bottom$3(objs[last[0]].bbox) <= noteH * 0.4) last.push(i2);
      else lines2.push([i2]);
    }
    for (const ln of lines2) {
      const lo = median$3(ln.map((i2) => bottom$3(objs[i2].bbox)));
      if (base - lo <= noteH * 1.2) continue;
      ln.sort((a, b) => objs[a].bbox.x - objs[b].bbox.x);
      const thinBar = (i2) => {
        const q2 = objs[i2].bbox;
        return q2.w < q2.h * 0.45 && q2.h >= noteH * 0.7;
      };
      if (ln.length <= 4 && thinBar(ln[0]) && thinBar(ln[ln.length - 1])) continue;
      const xs = ln.map((i2) => objs[i2].bbox);
      const span = Math.max(...xs.map(right$3)) - Math.min(...xs.map((b) => b.x));
      const ink = xs.reduce((a, b) => a + b.w, 0);
      if (span > 0 && ink / span < 0.3) continue;
      const h2 = q75(ln.map((i2) => objs[i2].bbox.h));
      if (h2 > lyricH * 0.92) continue;
      for (const i2 of ln) set(i2, "credit", `比和弦基线高出 ${(base - bottom$3(objs[i2].bbox)).toFixed(1)} 的小字行，是词曲署名`);
    }
  }
  const counts = {};
  for (const c2 of out) counts[c2.cls] = (counts[c2.cls] ?? 0) + 1;
  return {
    page: page.page,
    width: page.width,
    height: page.height,
    objs: out,
    bands,
    frames,
    ornaments: ornaments.map((o) => ({ box: o.box, tiles: o.idx.length, tileW: o.tileW, tileH: o.tileH })),
    counts,
    unclassified: out.filter((c2) => c2.cls === "unclassified")
  };
}
function collectSolidEdges(objs, noteH, contentW) {
  const out = [];
  for (let i2 = 0; i2 < objs.length; i2++) {
    const o = objs[i2];
    const long = Math.max(o.bbox.w, o.bbox.h);
    const short = Math.min(o.bbox.w, o.bbox.h);
    if (long < contentW * 0.85 || short > noteH * 0.85 || o.segs < 60) continue;
    out.push({ idx: [i2], horizontal: o.bbox.w >= o.bbox.h, solid: true });
  }
  return out;
}
function detectOrnamentFrames(objs, noteH, contentW) {
  const groups = /* @__PURE__ */ new Map();
  for (let i2 = 0; i2 < objs.length; i2++) {
    const o = objs[i2];
    if (o.bbox.w > noteH * 1.6 || o.bbox.h > noteH * 1.6) continue;
    const k2 = coarseKey(o);
    const g2 = groups.get(k2);
    if (g2) g2.push(i2);
    else groups.set(k2, [i2]);
  }
  const runs = [];
  for (const [, idx] of groups) {
    if (idx.length < 8) continue;
    const w = median$3(idx.map((i2) => Math.max(objs[i2].bbox.w, 0.3)));
    const h2 = median$3(idx.map((i2) => Math.max(objs[i2].bbox.h, 0.3)));
    collectRuns(idx, objs, true, h2 * 0.6, w * 2.5, runs);
    collectRuns(idx, objs, false, w * 0.6, h2 * 2.5, runs);
  }
  const solids = collectSolidEdges(objs, noteH, contentW);
  runs.push(...solids);
  if (runs.length < 2) return [];
  const used = /* @__PURE__ */ new Set();
  const out = [];
  for (let a = 0; a < runs.length; a++) {
    if (used.has(a)) continue;
    const group = [a];
    used.add(a);
    let changed = true;
    while (changed) {
      changed = false;
      for (let b = 0; b < runs.length; b++) {
        if (used.has(b)) continue;
        if (group.some((g2) => runsNear(runs[g2], runs[b], objs, noteH))) {
          used.add(b);
          group.push(b);
          changed = true;
        }
      }
    }
    const idx = [...new Set(group.flatMap((g2) => runs[g2].idx))];
    const bs = idx.map((i2) => objs[i2].bbox);
    const x0 = Math.min(...bs.map((b) => b.x));
    const y0 = Math.min(...bs.map((b) => b.y));
    const x1 = Math.max(...bs.map(right$3));
    const y1 = Math.max(...bs.map(bottom$3));
    const w = x1 - x0;
    const h2 = y1 - y0;
    if (w < noteH * 4 || h2 < noteH * 3) continue;
    const hasH = group.some((g2) => runs[g2].horizontal);
    const hasV = group.some((g2) => !runs[g2].horizontal);
    if (!hasH || !hasV) continue;
    if (group.every((g2) => runs[g2].solid)) continue;
    const mid = { x: x0 + w / 3, y: y0 + h2 / 3, w: w / 3, h: h2 / 3 };
    if (bs.filter((b) => intersectRect(b, mid)).length > idx.length * 0.03) continue;
    const box = { x: x0, y: y0, w, h: h2 };
    const corners = collectCornerTiles(objs, box, noteH, new Set(idx));
    const all = corners.length ? [...idx, ...corners] : idx;
    const abs = all.map((i2) => objs[i2].bbox);
    const bx0 = Math.min(...abs.map((b) => b.x));
    const by0 = Math.min(...abs.map((b) => b.y));
    const bw = Math.max(...abs.map(right$3)) - bx0;
    const bh = Math.max(...abs.map(bottom$3)) - by0;
    const edge = Math.max(noteH * 0.8, Math.min(bw, bh) * 0.06);
    out.push({
      idx: all,
      box: { x: bx0, y: by0, w: bw, h: bh },
      inner: { x: bx0 + edge, y: by0 + edge, w: bw - edge * 2, h: bh - edge * 2 },
      tileW: median$3(bs.map((b) => b.w)),
      tileH: median$3(bs.map((b) => b.h))
    });
  }
  return out;
}
function collectCornerTiles(objs, box, noteH, taken) {
  const near = noteH * 1.2;
  const size = noteH * 1.35;
  const pts = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h]
  ];
  const found = [];
  for (const [px, py] of pts) {
    let best = null;
    for (let i2 = 0; i2 < objs.length; i2++) {
      const b = objs[i2].bbox;
      if (b.w > size || b.h > size) continue;
      const d2 = Math.hypot(b.x + b.w / 2 - px, b.y + b.h / 2 - py);
      if (d2 <= near && (!best || d2 < best.d)) best = { i: i2, d: d2 };
    }
    if (best) found.push({ i: best.i, sig: `${objs[best.i].curves}/${objs[best.i].segs}`, taken: taken.has(best.i) });
  }
  const tally = /* @__PURE__ */ new Map();
  for (const f2 of found) tally.set(f2.sig, (tally.get(f2.sig) ?? 0) + 1);
  const win = [...tally].filter(([, n2]) => n2 >= 2).sort((a, b) => b[1] - a[1])[0];
  if (!win) return [];
  return found.filter((f2) => f2.sig === win[0] && !f2.taken).map((f2) => f2.i);
}
function collectRuns(idx, objs, horizontal, lineTol, gapMax, out) {
  const key = (i2) => horizontal ? cy$1(objs[i2].bbox) : cx$1(objs[i2].bbox);
  const pos = (i2) => horizontal ? objs[i2].bbox.x : objs[i2].bbox.y;
  const end = (i2) => horizontal ? right$3(objs[i2].bbox) : bottom$3(objs[i2].bbox);
  const sorted = [...idx].sort((a, b) => key(a) - key(b));
  let line = [];
  const flush = () => {
    if (line.length < 7) return;
    const seq = [...line].sort((a, b) => pos(a) - pos(b));
    let run = [seq[0]];
    for (let k2 = 1; k2 < seq.length; k2++) {
      if (pos(seq[k2]) - end(seq[k2 - 1]) <= gapMax) run.push(seq[k2]);
      else {
        if (run.length >= 7) out.push({ idx: run, horizontal });
        run = [seq[k2]];
      }
    }
    if (run.length >= 7) out.push({ idx: run, horizontal });
  };
  for (const i2 of sorted) {
    if (line.length && Math.abs(key(i2) - key(line[line.length - 1])) > lineTol) {
      flush();
      line = [];
    }
    line.push(i2);
  }
  flush();
}
function runsNear(a, b, objs, noteH) {
  const bbox = (r4) => {
    const bs = r4.idx.map((i2) => objs[i2].bbox);
    return {
      x: Math.min(...bs.map((v2) => v2.x)),
      y: Math.min(...bs.map((v2) => v2.y)),
      w: Math.max(...bs.map(right$3)) - Math.min(...bs.map((v2) => v2.x)),
      h: Math.max(...bs.map(bottom$3)) - Math.min(...bs.map((v2) => v2.y))
    };
  };
  const A = bbox(a);
  const B = bbox(b);
  const pad = noteH * 2;
  return !!intersectRect({ x: A.x - pad, y: A.y - pad, w: A.w + pad * 2, h: A.h + pad * 2 }, B);
}
const bottom$2 = (r4) => r4.y + r4.h;
const right$2 = (r4) => r4.x + r4.w;
function median$2(v2) {
  if (!v2.length) return 0;
  const s = [...v2].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function unionBox(rs) {
  const x0 = Math.min(...rs.map((r4) => r4.x));
  const y0 = Math.min(...rs.map((r4) => r4.y));
  const x1 = Math.max(...rs.map(right$2));
  const y1 = Math.max(...rs.map(bottom$2));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function toTextRun(objs, lookup) {
  if (!objs.length) return null;
  const sorted = [...objs].sort((a, b) => a.obj.bbox.x - b.obj.bbox.x);
  const chars = sorted.map((o) => {
    const r4 = lookup(o);
    return {
      x: Math.round(o.obj.bbox.x * 100) / 100,
      y: Math.round(o.obj.bbox.y * 100) / 100,
      w: Math.round(o.obj.bbox.w * 100) / 100,
      h: Math.round(o.obj.bbox.h * 100) / 100,
      ch: r4.ch ?? "�",
      key: r4.key
    };
  });
  const boxes = sorted.map((o) => o.obj.bbox);
  return {
    text: chars.map((c2) => c2.ch).join(""),
    box: unionBox(boxes),
    // 行基线取中位数，且「一」用它的参照基线参与（见 baseOf）——否则一行里有几个「一」
    // 就会把整行的基线拉高。
    baselineY: Math.round(median$2(sorted.map(baseOf)) * 100) / 100,
    size: Math.round(median$2(boxes.map((b) => b.h)) * 100) / 100,
    chars
  };
}
const baseOf = (o) => o.baseline ?? bottom$2(o.obj.bbox);
function groupLines(objs, tol = 4) {
  const sorted = [...objs].sort((a, b) => baseOf(a) - baseOf(b));
  const lines = [];
  for (const o of sorted) {
    const last = lines[lines.length - 1];
    if (last && baseOf(o) - last.y <= tol) last.items.push(o);
    else lines.push({ y: baseOf(o), items: [o] });
  }
  return lines.map((l2) => l2.items.sort((a, b) => a.obj.bbox.x - b.obj.bbox.x));
}
function buildPageSpec(vec, inv, lookup, entries = []) {
  const used = /* @__PURE__ */ new Set();
  const take = (o) => {
    used.add(o);
    return o;
  };
  const pick = (cls, yFrom = -Infinity, yTo = Infinity) => inv.objs.filter((o) => o.cls === cls && !o.dup && o.obj.bbox.y >= yFrom && o.obj.bbox.y < yTo).map(take);
  for (const o of inv.objs) if (o.dup) used.add(o);
  const header = toTextRun(pick("category"), lookup);
  const footer = toTextRun(pick("footer"), lookup);
  const storyBoxes = inv.ornaments.map((orn) => {
    const inside = inv.objs.filter(
      (o) => !o.dup && (o.cls === "storyText" || o.cls === "textLine") && o.obj.bbox.x >= orn.box.x && o.obj.bbox.y >= orn.box.y && right$2(o.obj.bbox) <= right$2(orn.box) && bottom$2(o.obj.bbox) <= bottom$2(orn.box)
    );
    for (const o of inside) used.add(o);
    return {
      box: orn.box,
      frame: { type: "ornament", box: orn.box, lineWidth: 0, dash: null, tiles: orn.tiles, tileW: orn.tileW, tileH: orn.tileH },
      lines: groupLines(inside).map((ln) => toTextRun(ln, lookup)).filter((r4) => !!r4)
    };
  });
  const frames = [];
  for (const o of inv.objs) {
    if (o.dup) continue;
    if (o.cls === "frame" || o.cls === "rule" || o.cls === "bracket") {
      const b = o.obj.bbox;
      frames.push({
        type: o.cls === "frame" ? "box" : o.cls === "bracket" ? "bracket" : b.w >= b.h ? "rule-h" : "rule-v",
        box: b,
        lineWidth: Math.round(o.obj.lineWidth * 100) / 100,
        dash: o.obj.dash
      });
      used.add(o);
    }
  }
  for (const im of vec.extras.images) frames.push({ type: "image", box: im.bbox, lineWidth: 0, dash: null });
  for (const sh of vec.extras.shadings) if (sh.bbox) frames.push({ type: "shading", box: sh.bbox, lineWidth: 0, dash: null });
  const songs = [];
  const spans = entries.length ? entries : [];
  for (const e of spans) {
    const yFrom = e.yFrom ?? 0;
    const yTo = e.yTo ?? vec.height;
    const systems = inv.bands.filter((b) => b.noteTop >= yFrom && b.noteTop < yTo).map((b) => {
      const inBand = (cls) => inv.objs.filter((o) => o.cls === cls && !o.dup && o.row === b.index && !used.has(o)).map(take);
      const notes = inBand("note").sort((a, b2) => a.obj.bbox.x - b2.obj.bbox.x);
      const chordObjs = inBand("chord");
      const lyricObjs = [...inBand("lyric"), ...inBand("lyricYi")];
      return {
        index: b.index,
        noteTop: Math.round(b.noteTop * 100) / 100,
        noteBottom: Math.round(b.noteBottom * 100) / 100,
        x0: Math.round(b.x0 * 100) / 100,
        x1: Math.round(b.x1 * 100) / 100,
        barlineXs: b.barlineXs.map((x) => Math.round(x * 100) / 100),
        notes: notes.map((o) => {
          const r4 = lookup(o);
          return {
            x: Math.round(o.obj.bbox.x * 100) / 100,
            y: Math.round(o.obj.bbox.y * 100) / 100,
            w: Math.round(o.obj.bbox.w * 100) / 100,
            h: Math.round(o.obj.bbox.h * 100) / 100,
            ch: r4.ch ?? "�",
            key: r4.key
          };
        }),
        chordLines: groupLines(chordObjs).map((ln) => toTextRun(ln, lookup)).filter((r4) => !!r4),
        lyricLines: groupLines(lyricObjs).map((ln) => toTextRun(ln, lookup)).filter((r4) => !!r4)
      };
    });
    const creditObjs = pick("credit", yFrom, yTo);
    const creditBottom = creditObjs.length ? Math.max(...creditObjs.map((o) => bottom$2(o.obj.bbox))) : -Infinity;
    const creditYi = creditObjs.length ? pick("lyricYi", yFrom, creditBottom + 2) : [];
    songs.push({
      id: e.id,
      gtTitle: e.title,
      startsHere: e.startsHere,
      yFrom,
      yTo,
      numberRun: toTextRun(pick("songNumber", yFrom, yTo), lookup),
      titleRun: toTextRun(pick("title", yFrom, yTo), lookup),
      keyMeterRun: toTextRun(pick("keyMeter", yFrom, yTo), lookup),
      categoryRun: null,
      creditRuns: groupLines([...creditObjs, ...creditYi]).map((ln) => toTextRun(ln, lookup)).filter((r4) => !!r4),
      systems
    });
  }
  const MARKS = /* @__PURE__ */ new Set(["divLine", "augmentLine", "barline", "slur", "octaveDot", "augmentDot", "repeatDot", "ornament", "tupletNum"]);
  const marks = [];
  for (const o of inv.objs) {
    if (o.dup || used.has(o) || !MARKS.has(o.cls)) continue;
    used.add(o);
    const curved = o.obj.curves > 0;
    marks.push({
      cls: o.cls,
      box: o.obj.bbox,
      lineWidth: Math.round(o.obj.lineWidth * 100) / 100,
      dash: o.obj.dash,
      ...curved ? { d: toSvgPathTransformed(o.obj.data, o.obj.ctm) } : {}
    });
  }
  const rest = inv.objs.filter((o) => !used.has(o) && !o.dup);
  const textLines = groupLines(rest).map((ln) => {
    for (const o of ln) used.add(o);
    return toTextRun(ln, lookup);
  }).filter((r4) => !!r4);
  const leaderN = inv.counts.leader ?? 0;
  const tailNumbers = textLines.filter((l2) => /\d\s*$/.test(l2.text)).length;
  let kind = "unknown";
  if (vec.extras.shadings.length) kind = "cover";
  else if (!inv.objs.length) kind = vec.extras.images.length ? "front-matter" : "blank";
  else if (songs.length) kind = "score";
  else if (textLines.length >= 20 && ((inv.counts.tocEntry ?? 0) > 50 || leaderN > 10 || tailNumbers >= textLines.length * 0.5))
    kind = leaderN > 10 ? "toc" : "index";
  else kind = "front-matter";
  const byClass = {};
  for (const o of inv.objs) byClass[o.cls] = (byClass[o.cls] ?? 0) + 1;
  const allRuns = [
    header,
    footer,
    ...textLines,
    ...storyBoxes.flatMap((s) => s.lines),
    ...songs.flatMap((s) => [s.numberRun, s.titleRun, ...s.creditRuns, ...s.systems.flatMap((y) => [...y.chordLines, ...y.lyricLines])])
  ].filter((r4) => !!r4);
  const unread = allRuns.reduce((a, r4) => a + (r4.text.match(/�/g)?.length ?? 0), 0) + songs.flatMap((s) => s.systems).reduce((a, y) => a + y.notes.filter((n2) => n2.ch === "�").length, 0);
  return {
    page: vec.page,
    size: [Math.round(vec.width * 100) / 100, Math.round(vec.height * 100) / 100],
    rotation: vec.rotation,
    kind,
    songs,
    header,
    footer,
    textLines,
    marks,
    storyBoxes,
    frames,
    hasRawText: vec.extras.hasText,
    coverage: {
      total: inv.objs.length,
      byClass,
      unplaced: inv.objs.filter((o) => !used.has(o)).length,
      fallback: textLines.reduce((a, r4) => a + r4.chars.length, 0),
      unread
    }
  };
}
const STYLE_ROLES = [
  "title",
  "songNumber",
  "category",
  "credit",
  "keyMeter",
  "note",
  "tuplet",
  "verseNum",
  "chord",
  "lyric",
  "lyric2",
  "sectionWord",
  "story",
  "toc",
  "tocHeading",
  "tocSub",
  "frontTitle",
  "header",
  "footer",
  "smufl"
];
const TEMPLATE_ROLES = ["titleAlt", "subtitle", "scripture", "scriptureRef", "rights", "relatedScriptures", "tags"];
function emptySheet() {
  return { roles: {}, page: {}, jianpu: {}, staff: {} };
}
function isPlainObject(v2) {
  return typeof v2 === "object" && v2 !== null && !Array.isArray(v2);
}
function mergeStyle(base, patch) {
  if (patch === void 0 || patch === null) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out = { ...base };
  for (const [k2, v2] of Object.entries(patch)) {
    if (v2 === void 0) continue;
    out[k2] = isPlainObject(v2) && isPlainObject(out[k2]) ? mergeStyle(out[k2], v2) : v2;
  }
  return out;
}
function ruleMatches(when, ctx) {
  if (!when) return true;
  return Object.keys(when).every((k2) => when[k2] === void 0 || when[k2] === ctx[k2]);
}
function computeStyle(layers, ctx) {
  let out = emptySheet();
  for (const layer of layers) {
    for (const rule of layer) {
      if (ruleMatches(rule.when, ctx)) out = mergeStyle(out, rule.set);
    }
  }
  return out;
}
function upsertRule(layer, when, set) {
  const key = whenKey(when);
  const out = layer.map((r4) => ({ ...r4 }));
  const hit = out.find((r4) => whenKey(r4.when) === key);
  if (hit) hit.set = mergeStyle(hit.set, set);
  else out.push(when ? { when: { ...when }, set } : { set });
  return out;
}
function whenKey(when) {
  if (!when) return "";
  return Object.keys(when).filter((k2) => when[k2] !== void 0).sort().map((k2) => `${k2}=${when[k2]}`).join(";");
}
function sanitizeLayer(v2) {
  if (!Array.isArray(v2)) return [];
  return v2.filter(
    (r4) => typeof r4 === "object" && r4 !== null && typeof r4.set === "object" && r4.set !== null
  );
}
const JIANPU_KEYS = {
  "note-bold": { kind: "bool", layout: "noteBold", note: "混排的简谱数字不单独加粗" },
  "beam-width": { kind: "len", layout: "jpBeamWidth", mixed: "lineWidths.jpBeam", original: "note.beamWidth" },
  "beam-top": { kind: "len", layout: "jpBeamTop", book: "metrics.divLineGapEm" },
  "beam-dist": { kind: "len", layout: "jpBeamDist", mixed: "beamDistJP", book: "metrics.divLineStepEm" },
  "octave-dot-dist": { kind: "len", layout: "jpStackGap", mixed: "octaveDotDist", book: "metrics.stackGapEm" },
  "system-gap": { kind: "len", layout: "maxLineDist", book: "metrics.systemGapEm", original: "spacing.systemGap" },
  "note-step": { kind: "len", book: "metrics.noteStepEm", note: "音符步距只有成书断句用" },
  "lyric-gap": { kind: "len", layout: "lyricGap", book: "metrics.lyricGapEm", original: "lyricSpacing.lyricGap" },
  "lyric-stack": { kind: "len", layout: "lyricStack", book: "metrics.lyricToLyricEm", original: "lyricSpacing.lyricStack" },
  "chord-gap": { kind: "len", layout: "chordGap", book: "metrics.chordToNoteEm" },
  "chord-plain": { kind: "bool", layout: "chordPlainText", book: "metrics.chordPlain" },
  "bracket-width": { kind: "len", layout: "bracketWidth", book: "metrics.bracketWidth" },
  "bracket-foot": { kind: "len", layout: "bracketFoot", book: "metrics.bracketFootEm" },
  "tuplet-style": { kind: "word", layout: "tupletStyle", note: "取 bracket（括线）/ arc（两段弧）；成书与混排不支持" },
  "repeat-dot-diameter": { kind: "len", book: "metrics.repeatDotDiam", note: "纯简谱的反复点按半径（repeatDotRadius）自算" },
  "slur-thickness": { kind: "len", layout: "slurTieThickness", book: "metrics.slurThicknessEm" },
  "slur-arc": { kind: "len", book: "metrics.slurArcEm", note: "弧高目标只有成书反算缩放用" },
  "slur-max-arc": { kind: "len", book: "metrics.slurMaxArcEm", note: "同上" },
  "slur-min-arc": { kind: "len", book: "metrics.slurMinArcEm", note: "同上" },
  "slur-flat-span": { kind: "num", book: "metrics.slurFlatSpanSteps", note: "纯简谱的扁平阈值是物理宽度（slurFlatSpan）" },
  "slur-flat-notes": { kind: "num", layout: "slurFlatNotes", book: "metrics.slurFlatNotes" },
  "slur-flat-ratio": { kind: "num", layout: "slurFlatRatio", book: "metrics.slurFlatRatio" },
  barline: { kind: "len", layout: "barlineWidth", book: "metrics.barlineWidthEm" },
  "final-barline": { kind: "len", layout: "finalBarlineWidth", book: "metrics.finalBarlineWidthEm" },
  "verse-numbers": { kind: "word", layout: "verseNumbers", book: "layout.verseNumbers" },
  "max-horizontal-scale": { kind: "num", layout: "maxHorizontalScale", book: "layout.maxHorizontalScale" },
  "grace-scale": { kind: "num", mixed: "jpGraceScale", note: "纯简谱的倚音缩放由排版器自算" },
  // 以下几个笔位在纯简谱那一路是算出来的（`layout/options.ts` 的 getter），只有混排给常量
  "octave-up-y": { kind: "len", mixed: "jpOctaveUpY", note: "纯简谱的八度点笔位由排版器自算" },
  "octave-down-dy": { kind: "len", mixed: "jpOctaveDownDy", note: "同上" },
  "beam-top-y": { kind: "len", mixed: "jpBeamTopY", note: "纯简谱的减时线基准由排版器自算" },
  "dot-dx": { kind: "len", mixed: "jpDotDx", note: "纯简谱的附点笔位由排版器自算" },
  "dot-dy": { kind: "len", mixed: "jpDotDy", note: "同上" },
  "top-dy": { kind: "len", mixed: "jpTopDy", note: "只有混排的简谱层要整体上提" },
  "show-key-change": { kind: "bool", mixed: "showKeyChangeJp", note: "纯简谱一定画调号" },
  "key-uses-full-font": { kind: "bool", mixed: "jpKeyJianpuFont", note: "纯简谱没有缩小的简谱层" },
  "legacy-time-sig": { kind: "bool", mixed: "musicppJpTimeSig", note: "旧版拍号笔位只在混排有" },
  "legacy-hwid-glyphs": { kind: "bool", mixed: "musicppHwidGlyphs", note: "同上" },
  "lrc-half-punct": { kind: "bool", mixed: "lrcHWID", note: "纯简谱的歌词标点按上下文挤压" },
  "chinese-hyphen": { kind: "bool", mixed: "chineseHyphen", note: "纯简谱不画中文连字符" },
  // 以下只有原样文档布局（`layout/original/`）有：多声部、按实测落值的小节线与增时线
  "voice-gap": { kind: "len", original: "spacing.voiceGap", note: "只有原样文档布局排多声部" },
  "barline-height": { kind: "len", original: "note.barlineHeight", note: "只有原样文档布局单给小节线高" },
  "double-barline-gap": { kind: "len", original: "stroke.doubleBarlineGap", note: "同上" },
  "dash-width": { kind: "len", original: "note.dashWidth", note: "只有原样文档布局单给增时线尺寸" },
  "dash-half-length": { kind: "len", original: "note.dashHalfLength", note: "同上" }
};
const STAFF_KEYS = {
  "staff-height": { kind: "len", mixed: "mixStaffHeight" },
  "staff-dist": { kind: "len", mixed: "mixStaffDist" },
  "barline-dist": { kind: "len", mixed: "barlineDist" },
  "slur-stem-dy": { kind: "len", mixed: "slurStemDy" },
  "harmony-size": { kind: "len", mixed: "harmonySize" },
  "harmony-y-pos": { kind: "len", mixed: "harmonyYPos" },
  "cue-size": { kind: "num", mixed: "cueSize" },
  "hide-bar-number": { kind: "bool", mixed: "hideBarNumber" },
  "initial-key-time": { kind: "bool", mixed: "initialKeyTime" },
  "melody-only": { kind: "bool", mixed: "melodyOnly" },
  "text-line-height-by-size": { kind: "bool", mixed: "textLineHeightBySize" },
  // 线宽：样式表里是一级键，内部才是 `lineWidths.*`
  "staff-line": { kind: "len", mixed: "lineWidths.staff" },
  leger: { kind: "len", mixed: "lineWidths.leger" },
  stem: { kind: "len", mixed: "lineWidths.stem" },
  beam: { kind: "len", mixed: "lineWidths.beam" },
  barline: { kind: "len", mixed: "lineWidths.lightBarline" },
  "final-barline": { kind: "len", mixed: "lineWidths.heavyBarline" }
};
const BREAK_KEYS = {
  enable: { kind: "bool", book: "layout.phrase" },
  "lines-per-page": { kind: "num", book: "layout.linesPerPage" },
  "target-measures": { kind: "num", book: "layout.phraseTargetMeas" },
  "length-weight": { kind: "num", book: "layout.phraseLenWeight" },
  "break-weight": { kind: "num", book: "layout.phraseBreakWeight" },
  "mid-break": { kind: "bool", book: "layout.phraseMidBreak" },
  "merge-short": { kind: "bool", book: "layout.phraseMergeShort" },
  "even-weight": { kind: "num", book: "layout.phraseEvenWeight" },
  "tail-weight": { kind: "num", book: "layout.phraseTailWeight" },
  "content-only": { kind: "bool", book: "layout.phraseContentOnly" },
  "parallel-weight": { kind: "num", book: "layout.phraseParallelWeight" },
  "tail-long-weight": { kind: "num", book: "layout.phraseTailLongWeight" },
  "more-rows-slack": { kind: "num", book: "layout.phraseMoreRowsSlack" },
  "fit-slack": { kind: "num", book: "layout.phraseFitSlack" }
};
function keysOfBlock(block) {
  return block === "jianpu" ? JIANPU_KEYS : block === "staff" ? STAFF_KEYS : BREAK_KEYS;
}
const FLOW_KEYS = {
  "song-start": null,
  "number-baseline": "numberBaseline",
  "first-system-top": "firstSystemTop",
  "cont-system-top": "contSystemTop",
  "mid-start-gap": "midStartGap",
  "footer-baseline": "footerBaseline"
};
const TOC_KEYS = {
  "title-baseline": "titleBaseline",
  "heading-gap-above": "headingGapAbove",
  "heading-gap-below": "headingGapBelow",
  leader: "leader",
  "entry-line-height": "lineGap",
  "entry-first-baseline": "firstBaseline",
  "left-edge": "left",
  "right-edge": "right",
  "index-columns": "indexColumns",
  "index-line-height": "indexLineGap",
  "index-first-baseline": "indexFirstBaseline"
};
function evalExpr(e, env, role = "note") {
  switch (e.k) {
    case "num":
      switch (e.unit) {
        case void 0:
        case "pt":
          return e.v;
        case "em":
          return e.v * env.sizeOf(role);
        default:
          throw new Error(`模板里不支持单位 ${e.unit}`);
      }
    case "str":
      return e.v;
    case "hash":
      return e.v;
    case "id":
      if (e.v === "true") return true;
      if (e.v === "false") return false;
      if (e.v === "content-left") return env.content.left;
      if (e.v === "content-right") return env.content.right;
      if (e.v === "page-width") return env.pageWidth;
      return e.v;
    case "call":
      throw new Error(`表达式里认不出函数 ${e.name}()`);
    case "neg":
      return -num$1(evalExpr(e.a, env, role), e);
    case "bin": {
      const a = num$1(evalExpr(e.a, env, role), e);
      const b = num$1(evalExpr(e.b, env, role), e);
      return e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : a / b;
    }
    case "seq":
    case "list":
      return e.items.map((x) => evalExpr(x, env, role));
  }
}
function num$1(v2, e) {
  if (typeof v2 !== "number" || !Number.isFinite(v2)) throw new Error(`这里要数字：${JSON.stringify(e)}`);
  return v2;
}
function evalNum(e, env, role) {
  return e === void 0 ? void 0 : num$1(evalExpr(e, env, role), e);
}
function evalBool(e, env, dflt) {
  if (e === void 0) return dflt;
  const v2 = evalExpr(e, env);
  if (typeof v2 === "boolean") return v2;
  if (v2 === "none") return false;
  return Boolean(v2);
}
const CREDIT_LABEL = {
  lyricist: "作词",
  poet: "作词",
  composer: "作曲",
  arranger: "编曲",
  "words-and-music": "词曲",
  translator: "译词",
  transcriber: "制谱"
};
const map = (f2) => (vals) => vals.map((v2) => ({ ...v2, text: f2(v2.text) }));
const FILTERS = {
  "strip-zero": map((t2) => t2.replace(/^0+(?=\d)/, "")),
  "cn-semicolon": map((t2) => t2.replace(/;/g, "；")),
  "unescape-newline": map((t2) => t2.replace(/\\n/g, "\n")),
  "dash-empty": (vals) => vals.filter((v2) => v2.text.trim() !== "-"),
  /** 去掉括号及其中内容（中英文括号都算），可以有多对。 */
  "drop-parens": map((t2) => {
    let s = t2;
    for (; ; ) {
      const m2 = /[(（][^()（）]*[)）]/.exec(s);
      if (!m2) return s;
      s = s.slice(0, m2.index) + s.slice(m2.index + m2[0].length);
    }
  }),
  /** `甲（乙）` → 两行（500 首页眉的分类名）。 */
  "paren-to-line": (vals) => vals.flatMap((v2) => {
    const m2 = /^(.+?)[（(](.+?)[）)]$/.exec(v2.text);
    return m2 ? [{ ...v2, text: m2[1] }, { ...v2, text: m2[2] }] : [v2];
  }),
  /** 每项按换行拆成多行，每行去首尾空白，去空白行。 */
  "lines-trim": (vals) => vals.flatMap(
    (v2) => v2.text.split(/\r?\n/).map((t2) => t2.trim()).filter(Boolean).map((text) => ({ ...v2, text }))
  ),
  /** 同 `lines-trim`，但保留显式行首缩进；只去行尾空白和空行。 */
  "lines-indent": (vals) => vals.flatMap(
    (v2) => v2.text.split(/\r?\n/).map((t2) => t2.trimEnd()).filter((t2) => t2.trim().length > 0).map((text) => ({ ...v2, text }))
  ),
  /** 没带冒号标签的署名按类型补标签（`scripts/rebuild.mjs` 原 LABEL 规则）。 */
  "label-by-type": (vals) => vals.map((v2) => /[:：]/.test(v2.text) ? v2 : { ...v2, text: `${CREDIT_LABEL[v2.type ?? ""] ?? v2.type}：${v2.text}` })
};
function expandText(parts, env) {
  const resolved = parts.map((p2) => {
    if (typeof p2 === "string") return null;
    let vals = [...env.field(p2.path) ?? []];
    for (const f2 of p2.filters) {
      const fn = FILTERS[f2];
      if (!fn) throw new Error(`认不出的过滤器 ${f2}`);
      vals = fn(vals);
    }
    return vals.filter((v2) => v2.text !== "");
  });
  const fields = resolved.filter((r4) => r4 !== null);
  if (fields.length > 0 && fields.every((f2) => f2.length === 0)) return [];
  const n2 = Math.max(1, ...fields.map((f2) => f2.length));
  const out = [];
  for (let i2 = 0; i2 < n2; i2++) {
    let s = "";
    parts.forEach((p2, k2) => {
      if (typeof p2 === "string") s += p2;
      else {
        const vals = resolved[k2];
        s += (vals.length === 1 ? vals[0].text : vals[i2]?.text) ?? "";
      }
    });
    if (s !== "") out.push(s);
  }
  return out;
}
function slotAlign(slot, odd) {
  switch (slot) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
      return "center";
    case "inner":
      return odd ? "left" : "right";
    case "outer":
      return odd ? "right" : "left";
  }
}
function layoutRegion(region, env) {
  if (!region || !evalBool(region.props.display, env, true)) return { items: [], span: 0 };
  const odd = env.pageNo % 2 === 1;
  const dy = env.dy ?? 0;
  const block = region.props.flow?.k === "id" && region.props.flow.v === "block";
  const alignPage = region.props["align-x"]?.k === "id" && region.props["align-x"].v === "page";
  const inset = evalNum(region.props.inset, env);
  let left = alignPage ? 0 : env.content.left;
  let right2 = alignPage ? env.pageWidth ?? env.content.right : env.content.right;
  if (inset !== void 0) {
    left += inset;
    right2 -= inset;
  }
  const items = [];
  if (block) {
    let cursor = dy;
    let content = 0;
    for (const row of region.rows) {
      const gap = evalNum(row.props["gap-before"], env) ?? 0;
      const base = evalNum(row.props.baseline, env);
      const top = evalNum(row.props.top, env);
      const rowTop = base !== void 0 ? dy : top !== void 0 ? dy + top : cursor + (content > 0 ? gap : 0);
      let rowH = 0;
      for (const got of inRowOrder(row.cells, (cell, texts) => layoutBlockCell(region, cell, rowTop, base, left, right2, odd, env, texts))) {
        items.push(...got.items);
        rowH = Math.max(rowH, got.height);
      }
      if (rowH === 0) continue;
      content += rowH;
      cursor = rowTop + rowH;
    }
    const ext = region.props.extent;
    const span = ext ? evalExtent(ext, content, env) : content;
    return { items, span, content };
  }
  let firstY;
  let lastY;
  for (const row of region.rows) {
    const base = evalNum(row.props.baseline, env);
    if (base === void 0) throw new Error("flow: fixed 的区域里每行都要写 baseline");
    const rowY = base + dy;
    let rowLast = rowY;
    let any = false;
    for (const got of inRowOrder(row.cells, (cell, texts) => layoutCell(cell, rowY, left, right2, odd, env, texts))) {
      if (got.items.length) any = true;
      items.push(...got.items);
      rowLast = Math.max(rowLast, got.lastY);
    }
    if (!any) continue;
    firstY ??= rowY;
    lastY = rowLast;
  }
  return { items, span: firstY === void 0 || lastY === void 0 ? 0 : lastY - firstY };
}
function inRowOrder(cells, lay) {
  const isComponent = (c2) => c2.lines.some((l2) => l2.content.kind === "component");
  const out = new Array(cells.length);
  const texts = [];
  cells.forEach((c2, i2) => {
    if (isComponent(c2)) return;
    out[i2] = lay(c2, texts);
    for (const p2 of out[i2].items) if (p2.kind === "text") texts.push(p2);
  });
  cells.forEach((c2, i2) => {
    if (isComponent(c2)) out[i2] = lay(c2, texts);
  });
  return out;
}
function evalExtent(e, content, env) {
  const sub = (x) => {
    switch (x.k) {
      case "id":
        return x.v === "content" ? { k: "num", v: content } : x;
      case "bin":
        return { ...x, a: sub(x.a), b: sub(x.b) };
      case "neg":
        return { ...x, a: sub(x.a) };
      default:
        return x;
    }
  };
  return evalNum(sub(e), env);
}
function fontMetrics(env, role, size) {
  if (!env.fontMetrics) throw new Error("flow: block 要调用方给 fontMetrics");
  return env.fontMetrics(role, size);
}
function slotEdge(slot, left, right2, odd) {
  const align = slotAlign(slot, odd);
  return { align, edge: align === "left" ? left : align === "right" ? right2 : (left + right2) / 2 };
}
function layoutBlockCell(region, cell, rowTop, base, left, right2, odd, env, rowTexts) {
  const items = [];
  const { align, edge } = slotEdge(cell.slot, left, right2, odd);
  const lhExpr = cell.props["line-height"] ?? region.props["line-height"];
  let y;
  let height = 0;
  for (const line of cell.lines) {
    const role = line.role ?? "note";
    const size = env.sizeOf(role);
    const x0 = line.at !== void 0 ? evalNum(line.at, env, role) : edge;
    const x = cell.props.dx !== void 0 ? x0 + evalNum(cell.props.dx, env, role) : x0;
    if (line.content.kind === "component") {
      const fn = env.components?.[line.content.name];
      if (!fn) throw new Error(`模板用了组件 ${line.content.name}()，调用方没给实现`);
      const cy2 = y ?? (base !== void 0 ? rowTop + base : rowTop);
      for (const it of fn({ args: line.content.args, x, y: cy2, role, size, cell, row: rowTexts, env })) items.push({ kind: "raw", item: it });
      continue;
    }
    const texts = expandText(line.content.parts, env).flatMap((t2) => t2.split("\n"));
    if (texts.length === 0) continue;
    const fm = fontMetrics(env, role, size);
    const lead = evalNum(lhExpr, env, role) ?? fm.height * 1.2;
    for (const text of texts) {
      if (y === void 0) y = base !== void 0 ? rowTop + base : rowTop + fm.ascent;
      else y += lead;
      items.push({ kind: "text", text, role, size, x, y, align });
      height += fm.height;
    }
  }
  return { items, height };
}
function layoutCell(cell, rowY, left, right2, odd, env, texts) {
  const items = [];
  const { align, edge } = slotEdge(cell.slot, left, right2, odd);
  const cdx = cell.props.dx;
  const cdy = cell.props.dy;
  let i2 = 0;
  let lastY = rowY;
  for (const line of cell.lines) {
    const role = line.role ?? "note";
    const size = env.sizeOf(role);
    const x0 = line.at !== void 0 ? evalNum(line.at, env, role) : edge;
    const x = cdx !== void 0 ? x0 + evalNum(cdx, env, role) : x0;
    const y0 = cdy !== void 0 ? rowY + evalNum(cdy, env, role) : rowY;
    if (line.content.kind === "component") {
      const fn = env.components?.[line.content.name];
      if (!fn) throw new Error(`模板用了组件 ${line.content.name}()，调用方没给实现`);
      for (const it of fn({ args: line.content.args, x, y: y0, role, size, cell, row: texts, env })) items.push({ kind: "raw", item: it });
      continue;
    }
    for (const text of expandText(line.content.parts, env)) {
      const y = i2 === 0 ? y0 : y0 + i2 * lineLead(cell, env, role);
      items.push({ kind: "text", text, role, size, x, y, align });
      lastY = Math.max(lastY, y);
      i2++;
    }
  }
  return { items, lastY };
}
function lineLead(cell, env, role) {
  const g2 = cell.props["line-height"];
  if (g2 !== void 0) return evalNum(g2, env, role);
  return env.sizeOf(role) * 1.2;
}
function songFields(song, extra = {}) {
  const one = (t2) => t2 ? [{ text: t2 }] : [];
  return (path) => {
    if (path in extra) {
      const v2 = extra[path];
      return typeof v2 === "string" ? one(v2) : v2;
    }
    if (!song) return void 0;
    const [head, ...rest] = path.split(".");
    const tail = rest.join(".");
    switch (head) {
      case "work": {
        const w = song.work;
        if (!w) return void 0;
        if (tail === "subtitles") return w.subtitles.map((text) => ({ text }));
        const v2 = w[tail];
        return typeof v2 === "string" ? one(v2) : void 0;
      }
      case "creators": {
        const cs = song.identification?.creators ?? [];
        return cs.filter((c2) => tail === "*" || c2.type === tail).map((c2) => ({ text: c2.text, type: c2.type }));
      }
      case "identification":
        return tail === "rights" ? one(song.identification?.rights) : void 0;
      case "pageText": {
        const v2 = song.pageText?.[tail];
        if (typeof v2 === "string") return one(v2);
        return Array.isArray(v2) ? v2.map((text) => ({ text })) : void 0;
      }
      case "meta":
        return (song.meta?.[tail] ?? []).map((text) => ({ text }));
      default:
        return void 0;
    }
  };
}
const SLOTS = ["left", "center", "right", "inner", "outer"];
const REGION_NAMES = ["song-head", "song-foot", "page-header", "page-footer", "toc"];
const REGION_PROPS = /* @__PURE__ */ new Set(["flow", "align-x", "inset", "display", "line-height", "extent", "gap-after"]);
const ROW_PROPS = /* @__PURE__ */ new Set(["baseline", "top", "gap-before", "step", "repeat"]);
const CELL_PROPS = /* @__PURE__ */ new Set(["content", "role", "at", "dx", "dy", "line-height", "avoid"]);
const COMPONENTS = /* @__PURE__ */ new Set(["key-meter", "leader"]);
class SsError extends Error {
  constructor(msg, line, col) {
    super(`${line}:${col} ${msg}`);
    this.line = line;
    this.col = col;
  }
}
const ID_START = /[A-Za-z_\u0080-\uffff]/;
const ID_CHAR = /[A-Za-z0-9_\-.\u0080-\uffff]/;
const UNITS = ["pt", "em", "sp"];
function lex(src) {
  const out = [];
  let i2 = 0;
  let line = 1;
  let col = 1;
  const adv = (n2) => {
    for (let k2 = 0; k2 < n2; k2++) {
      if (src[i2] === "\n") {
        line++;
        col = 1;
      } else col++;
      i2++;
    }
  };
  while (i2 < src.length) {
    const c2 = src[i2];
    if (/\s/.test(c2)) {
      adv(1);
      continue;
    }
    if (c2 === "/" && src[i2 + 1] === "*") {
      const end = src.indexOf("*/", i2 + 2);
      if (end < 0) throw new SsError("注释没有收尾", line, col);
      adv(end + 2 - i2);
      continue;
    }
    const L3 = line;
    const C = col;
    if (c2 === '"' || c2 === "'") {
      let j2 = i2 + 1;
      let v2 = "";
      while (j2 < src.length && src[j2] !== c2) {
        if (src[j2] === "\\" && j2 + 1 < src.length) {
          const n2 = src[j2 + 1];
          v2 += n2 === "n" ? "\n" : n2;
          j2 += 2;
        } else {
          if (src[j2] === "\n") throw new SsError("字符串没有收尾", L3, C);
          v2 += src[j2];
          j2++;
        }
      }
      if (j2 >= src.length) throw new SsError("字符串没有收尾", L3, C);
      out.push({ t: "str", v: v2, line: L3, col: C });
      adv(j2 + 1 - i2);
      continue;
    }
    const prev = out[out.length - 1];
    const prevIsOperand = prev && (prev.t === "num" || prev.t === "id" || prev.t === "str" || prev.t === "p" && prev.v === ")");
    if (/[0-9]/.test(c2) || c2 === "." && /[0-9]/.test(src[i2 + 1] ?? "") || (c2 === "-" || c2 === "+") && /[0-9.]/.test(src[i2 + 1] ?? "") && !prevIsOperand) {
      const m2 = /^[+-]?(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i2));
      let raw = m2[0];
      let unit;
      const rest = src.slice(i2 + raw.length);
      for (const u2 of UNITS) {
        if (rest.startsWith(u2) && !ID_CHAR.test(rest[u2.length] ?? " ")) {
          unit = u2;
          break;
        }
      }
      const tok = { t: "num", v: Number(raw), raw, line: L3, col: C };
      if (unit) {
        tok.unit = unit;
        raw += unit;
        tok.raw = raw;
      }
      out.push(tok);
      adv(raw.length);
      continue;
    }
    if (c2 === "#") {
      const m2 = /^#([A-Za-z0-9_\-.]+)/.exec(src.slice(i2));
      if (!m2) throw new SsError("`#` 后面要跟名字", L3, C);
      out.push({ t: "hash", v: m2[1], line: L3, col: C });
      adv(m2[0].length);
      continue;
    }
    if (c2 === "@") {
      const m2 = /^@([A-Za-z][A-Za-z0-9-]*)/.exec(src.slice(i2));
      if (!m2) throw new SsError("`@` 后面要跟规则名", L3, C);
      out.push({ t: "at", v: m2[1], line: L3, col: C });
      adv(m2[0].length);
      continue;
    }
    if (ID_START.test(c2)) {
      let j2 = i2 + 1;
      while (j2 < src.length && ID_CHAR.test(src[j2])) j2++;
      while (j2 > i2 + 1 && /[-.]/.test(src[j2 - 1])) j2--;
      out.push({ t: "id", v: src.slice(i2, j2), line: L3, col: C });
      adv(j2 - i2);
      continue;
    }
    if ("{}()[];:,+-*/|".includes(c2)) {
      out.push({ t: "p", v: c2, line: L3, col: C });
      adv(1);
      continue;
    }
    throw new SsError(`认不出的字符 ${JSON.stringify(c2)}`, L3, C);
  }
  out.push({ t: "eof", v: "", line, col });
  return out;
}
const ROLE_PROPS = /* @__PURE__ */ new Set(["size", "color", "family", "font", "weight", "features", "align-mode", "baseline-adjust"]);
const ROLE_PROP_FIELD = { "align-mode": "alignMode", "baseline-adjust": "baselineAdjust" };
const kebabToCamel = (v2) => v2.replace(/-([a-z])/g, (_, c2) => c2.toUpperCase());
const camelToKebab = (v2) => v2.replace(/[A-Z]/g, (c2) => `-${c2.toLowerCase()}`);
const KNOWN_ROLES = /* @__PURE__ */ new Set([...STYLE_ROLES, ...TEMPLATE_ROLES]);
const FONT_FACE_PROPS = /* @__PURE__ */ new Set(["family", "file", "face", "mode", "bold"]);
const PAGE_PROPS = /* @__PURE__ */ new Set(["paper", "orientation", "size", "margin", "mirror", "ink", "background"]);
const MEDIA_DIMS = /* @__PURE__ */ new Set(["mode", "engine", "paged", "page", "verse"]);
class Parser {
  constructor(toks) {
    this.toks = toks;
  }
  i = 0;
  rules = [];
  peek(o = 0) {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)];
  }
  next() {
    return this.toks[this.i++] ?? this.toks[this.toks.length - 1];
  }
  fail(msg, tok = this.peek()) {
    throw new SsError(msg, tok.line, tok.col);
  }
  isP(v2, o = 0) {
    const t2 = this.peek(o);
    return t2.t === "p" && t2.v === v2;
  }
  expectP(v2) {
    if (!this.isP(v2)) this.fail(`这里要 \`${v2}\`，却是 ${JSON.stringify(this.peek().v)}`);
    return this.next();
  }
  expectId() {
    const t2 = this.next();
    if (t2.t !== "id") this.fail(`这里要名字，却是 ${JSON.stringify(t2.v)}`, t2);
    return t2.v;
  }
  parseSheet() {
    this.stmts({}, () => this.peek().t === "eof");
  }
  stmts(when, done) {
    while (!done()) {
      const t2 = this.peek();
      if (t2.t === "at") this.atRule(when);
      else if (t2.t === "id") this.roleRule(when);
      else if (this.isP(";")) this.next();
      else this.fail(`这里要规则，却是 ${JSON.stringify(t2.v)}`);
    }
  }
  push(when, set) {
    this.rules.push(Object.keys(when).length ? { when: { ...when }, set } : { set });
  }
  atRule(when) {
    const at = this.next();
    switch (at.v) {
      case "flow": {
        const pos = {};
        const decls = this.declBlock(pos);
        for (const k2 of Object.keys(decls)) if (!(k2 in FLOW_KEYS)) this.fail(`@flow 认不出的键 ${k2}（键名见 src/style/keys.ts::FLOW_KEYS）`, pos[k2]);
        this.push(when, { template: { flow: decls } });
        return;
      }
      case "toc": {
        const pos = {};
        const decls = this.declBlock(pos);
        for (const k2 of Object.keys(decls)) if (!(k2 in TOC_KEYS)) this.fail(`@toc 认不出的键 ${k2}（键名见 src/style/keys.ts::TOC_KEYS）`, pos[k2]);
        this.push(when, { template: { toc: decls } });
        return;
      }
      case "font-face": {
        const name = this.expectId();
        const pos = {};
        const decls = this.declBlock(pos);
        const face = {};
        for (const [k2, v2] of Object.entries(decls)) {
          if (!FONT_FACE_PROPS.has(k2)) this.fail(`@font-face 认不出属性 ${k2}`, pos[k2]);
          face[k2] = exprValue(v2);
        }
        if (typeof face.family !== "string") this.fail(`@font-face ${name} 缺 family`, at);
        this.push(when, { template: { fonts: { [name]: face } } });
        return;
      }
      case "page": {
        const pos = {};
        const decls = this.declBlock(pos);
        this.push(when, { page: this.pageDecl(decls, pos) });
        return;
      }
      case "jianpu":
      case "staff":
      case "break": {
        const table = keysOfBlock(at.v);
        const pos = {};
        const decls = this.declBlock(pos);
        const blk = {};
        const overrides = {};
        for (const [k2, v2] of Object.entries(decls)) {
          if (k2 === "preset" && at.v !== "break") {
            blk.preset = exprWord(v2);
            continue;
          }
          if (!table[k2]) this.fail(`@${at.v} 认不出的键 ${k2}（键名见 src/style/keys.ts；字体写在角色上，如 note { font: hei }）`, pos[k2]);
          overrides[k2] = exprLength(v2);
        }
        if (Object.keys(overrides).length) blk.overrides = overrides;
        this.push(when, { [at.v]: blk });
        return;
      }
      case "pu":
        this.fail("`@pu` 已删：原样文档布局也读 `@jianpu`（键表里的 original 一列）", at);
        break;
      case "template": {
        const nameTok = this.peek();
        const name = this.expectId();
        if (!REGION_NAMES.includes(name)) this.fail(`认不出的模板区域 ${name}（区域：${REGION_NAMES.join(" ")}）`, nameTok);
        this.push(when, { template: { regions: { [name]: this.regionBlock() } } });
        return;
      }
      case "media": {
        const w = { ...when };
        for (; ; ) {
          this.expectP("(");
          const dim = this.expectId();
          if (!MEDIA_DIMS.has(dim)) this.fail(`@media 认不出的维度 ${dim}`);
          this.expectP(":");
          const v2 = this.next();
          if (v2.t !== "id" && v2.t !== "num" && v2.t !== "str") this.fail("@media 的值要是名字或数字", v2);
          let val = v2.v;
          if (dim === "paged") {
            if (val !== "true" && val !== "false") this.fail("@media (paged: …) 只收 true / false", v2);
            val = val === "true";
          }
          w[dim] = val;
          this.expectP(")");
          if (this.peek().t === "id" && this.peek().v === "and") {
            this.next();
            continue;
          }
          break;
        }
        this.expectP("{");
        this.stmts(w, () => this.isP("}"));
        this.expectP("}");
        return;
      }
      case "song":
        this.fail("样式表不做逐曲规则：改谱面内容或逐曲微调位置请改 MusicXML（如 scripts/kl2020-prep.mjs）", at);
        break;
      default:
        this.fail(`认不出的规则 @${at.v}`, at);
    }
  }
  /** `角色, 角色… { 声明 }`。只认角色名，不做元素级限定（改数据，不改样式表）。 */
  roleRule(when) {
    const roles = [];
    for (; ; ) {
      roles.push(this.expectId());
      if (this.isP("[")) this.fail("样式表不做元素级限定：改谱面内容或逐曲微调位置请改 MusicXML");
      if (this.isP(",")) {
        this.next();
        continue;
      }
      break;
    }
    const decls = this.declBlock();
    for (const r4 of roles) if (!KNOWN_ROLES.has(r4)) this.fail(`认不出的角色 ${r4}（角色表见 src/style/sheet.ts::STYLE_ROLES / TEMPLATE_ROLES）`);
    for (const k2 of Object.keys(decls)) if (!ROLE_PROPS.has(k2)) this.fail(`角色声明认不出属性 ${k2}`);
    for (const role of roles) this.push(when, { roles: { [role]: roleDecl(decls) } });
  }
  /** `{ 名: 值; … }`。`pos` 给了就记下每个名字的位置（白名单报错用）。 */
  declBlock(pos) {
    this.expectP("{");
    const out = {};
    while (!this.isP("}")) {
      if (this.isP(";")) {
        this.next();
        continue;
      }
      if (pos) pos[this.peek().v] = this.peek();
      const name = this.expectId();
      this.expectP(":");
      out[name] = this.exprList(() => this.isP(";") || this.isP("}"));
      if (this.isP(";")) this.next();
    }
    this.expectP("}");
    return out;
  }
  /** `@template` 体：区域属性与 `row(…) { … }`。槽位只能写在 row 里。 */
  regionBlock() {
    this.expectP("{");
    const reg = { props: {}, rows: [] };
    while (!this.isP("}")) {
      if (this.isP(";")) {
        this.next();
        continue;
      }
      const t2 = this.peek();
      if (t2.t !== "id") this.fail(`模板里要属性或 row，却是 ${JSON.stringify(t2.v)}`);
      if (t2.v === "row") {
        this.next();
        reg.rows.push(this.rowBlock());
        continue;
      }
      if (SLOTS.includes(t2.v)) this.fail(`槽位 ${t2.v} 要写在 row { } 里`);
      if (!REGION_PROPS.has(t2.v)) this.fail(`模板区域认不出属性 ${t2.v}（区域属性：${[...REGION_PROPS].join(" ")}）`);
      const name = this.expectId();
      this.expectP(":");
      reg.props[name] = this.exprList(() => this.isP(";") || this.isP("}"));
      if (this.isP(";")) this.next();
    }
    this.expectP("}");
    return reg;
  }
  rowBlock() {
    const props = {};
    if (this.isP("(")) {
      this.next();
      while (!this.isP(")")) {
        const nameTok = this.peek();
        const name = this.expectId();
        if (!ROW_PROPS.has(name)) this.fail(`row 认不出属性 ${name}（行属性：${[...ROW_PROPS].join(" ")}）`, nameTok);
        this.expectP(":");
        props[name] = this.exprList(() => this.isP(";") || this.isP(")"));
        if (this.isP(";")) this.next();
      }
      this.expectP(")");
    }
    const body = this.rowBody();
    return { props: { ...props, ...body.props }, cells: body.cells };
  }
  rowBody() {
    this.expectP("{");
    const row = { props: {}, cells: [] };
    while (!this.isP("}")) {
      if (this.isP(";")) {
        this.next();
        continue;
      }
      const nameTok = this.peek();
      const name = this.expectId();
      const slot = SLOTS.includes(name) ? name : null;
      if (slot && this.isP("{")) {
        const pos = {};
        const decls = this.declBlock(pos);
        const cell = { slot, lines: [], props: {} };
        let role;
        let at;
        for (const [k2, v22] of Object.entries(decls)) {
          if (!CELL_PROPS.has(k2)) this.fail(`槽位认不出属性 ${k2}（格属性：${[...CELL_PROPS].join(" ")}）`, pos[k2]);
          if (k2 === "content") continue;
          if (k2 === "role") role = this.roleName(exprWord(v22), pos[k2]);
          else if (k2 === "at") at = v22;
          else {
            if (k2 === "avoid") parseAvoid(v22, pos[k2]);
            cell.props[k2] = v22;
          }
        }
        const content = decls.content;
        if (!content) this.fail(`槽位 ${slot} 的块里要写 content`, nameTok);
        const items = content.k === "list" ? content.items : [content];
        cell.lines = items.map((it) => this.lineOf(it, pos.content));
        inheritRole(cell.lines, role);
        for (const line of cell.lines) if (at !== void 0 && line.at === void 0) line.at = at;
        cell.lines = cell.lines.map(canonLine);
        row.cells.push(cell);
        continue;
      }
      if (!slot && !ROW_PROPS.has(name)) this.fail(`row 里要槽位（${SLOTS.join(" ")}）或行属性，却是 ${name}`, nameTok);
      this.expectP(":");
      const v2 = this.exprList(() => this.isP(";") || this.isP("}"));
      if (this.isP(";")) this.next();
      if (slot) {
        const items = v2.k === "list" ? v2.items : [v2];
        const lines = items.map((it) => this.lineOf(it, nameTok));
        inheritRole(lines, void 0);
        row.cells.push({ slot, lines: lines.map(canonLine), props: {} });
      } else {
        row.props[name] = v2;
      }
    }
    this.expectP("}");
    return row;
  }
  /** 槽位里的一行：`内容 [as 角色] [at 表达式]`。 */
  lineOf(e, tok) {
    const items = e.k === "seq" ? e.items : [e];
    const head = items[0];
    if (!head) this.fail("槽位里是空的", tok);
    const line = { content: contentOf(head, tok) };
    if (line.content.kind === "component" && !COMPONENTS.has(line.content.name)) {
      this.fail(`认不出的组件 ${line.content.name}()（组件：${[...COMPONENTS].join(" ")}）`, tok);
    }
    for (let k2 = 1; k2 < items.length; k2++) {
      const w = items[k2];
      if (w.k === "id" && w.v === "as" && items[k2 + 1]?.k === "id") {
        line.role = this.roleName(items[k2 + 1].v, tok);
        k2++;
      } else if (w.k === "id" && w.v === "at" && items[k2 + 1]) {
        const rest = [];
        while (items[k2 + 1] && !(items[k2 + 1].k === "id" && ["as", "at"].includes(items[k2 + 1].v))) rest.push(items[++k2]);
        line.at = rest.length === 1 ? rest[0] : { k: "seq", items: rest };
      } else {
        this.fail("槽位里的一行只能写 `内容 [as 角色] [at 位置]`", tok);
      }
    }
    return line;
  }
  roleName(role, tok) {
    if (!KNOWN_ROLES.has(role)) this.fail(`认不出的角色 ${role}（角色表见 src/style/sheet.ts::STYLE_ROLES / TEMPLATE_ROLES）`, tok);
    return role;
  }
  /** `@page` 声明 → `PageDecl`：键白名单，值的形状在这里查。 */
  pageDecl(decls, pos) {
    const out = {};
    for (const [k2, v2] of Object.entries(decls)) {
      const where = pos[k2];
      if (!PAGE_PROPS.has(k2)) this.fail(`@page 认不出属性 ${k2}（属性：${[...PAGE_PROPS].join(" ")}）`, where);
      const val = exprValue(v2);
      const nums = (x) => Array.isArray(x) && x.every((n2) => typeof n2 === "number");
      switch (k2) {
        case "size":
          if (!nums(val) || val.length !== 2) this.fail("@page size 要写两个数：宽 高", where);
          break;
        case "margin":
          if (typeof val !== "number" && !(nums(val) && val.length === 4)) this.fail("@page margin 要写一个数或四个数", where);
          break;
        case "mirror":
          if (typeof val !== "boolean") this.fail("@page mirror 只收 true / false", where);
          break;
        case "orientation":
          if (val !== "portrait" && val !== "landscape") this.fail("@page orientation 只收 portrait / landscape", where);
          break;
        case "ink":
        case "background":
          if (typeof val !== "number") this.fail(`@page ${k2} 要写颜色 #rrggbb / #aarrggbb`, where);
          break;
        case "paper":
          if (typeof val !== "string") this.fail("@page paper 要写纸名", where);
          break;
      }
      out[k2] = val;
    }
    return out;
  }
  // —— 表达式 ——
  exprList(stop) {
    const items = [];
    for (; ; ) {
      items.push(this.exprSeq(() => stop() || this.isP(",")));
      if (this.isP(",")) {
        this.next();
        continue;
      }
      break;
    }
    return items.length === 1 ? items[0] : { k: "list", items };
  }
  exprSeq(stop) {
    const items = [];
    while (!stop() && this.peek().t !== "eof") items.push(this.exprAdd());
    if (items.length === 0) this.fail("这里缺值");
    return items.length === 1 ? items[0] : { k: "seq", items };
  }
  exprAdd() {
    let a = this.exprMul();
    while ((this.isP("+") || this.isP("-")) && this.spaced()) {
      const op = this.next().v;
      a = { k: "bin", op, a, b: this.exprMul() };
    }
    return a;
  }
  exprMul() {
    let a = this.exprUnary();
    while (this.isP("*") || this.isP("/")) {
      const op = this.next().v;
      a = { k: "bin", op, a, b: this.exprUnary() };
    }
    return a;
  }
  /** `+`/`-` 当二元运算符，要求它和左边隔着空格（CSS calc 的规矩），免得与负数、连字符名混淆。 */
  spaced() {
    const op = this.peek();
    const prev = this.toks[this.i - 1];
    if (!prev) return false;
    return op.line !== prev.line || op.col > prev.col + tokLen(prev);
  }
  exprUnary() {
    if (this.isP("-")) {
      this.next();
      return { k: "neg", a: this.exprUnary() };
    }
    return this.exprPrimary();
  }
  exprPrimary() {
    const t2 = this.next();
    switch (t2.t) {
      case "num":
        return t2.unit ? { k: "num", v: t2.v, unit: t2.unit } : { k: "num", v: t2.v };
      case "str":
        return { k: "str", v: t2.v };
      case "hash":
        return { k: "hash", v: t2.v };
      case "id":
        if (this.isP("(") && this.toks[this.i].col === t2.col + t2.v.length && this.toks[this.i].line === t2.line) {
          this.next();
          const args = [];
          while (!this.isP(")")) {
            args.push(this.exprSeq(() => this.isP(",") || this.isP(")")));
            if (this.isP(",")) this.next();
          }
          this.expectP(")");
          return { k: "call", name: t2.v, args };
        }
        return { k: "id", v: t2.v };
      case "p":
        if (t2.v === "(") {
          const e = this.exprAdd();
          this.expectP(")");
          return e;
        }
        break;
    }
    return this.fail(`这里要值，却是 ${JSON.stringify(t2.v)}`, t2);
  }
}
function inheritRole(lines, fallback) {
  let next = fallback;
  for (let k2 = lines.length - 1; k2 >= 0; k2--) {
    if (lines[k2].role !== void 0) next = lines[k2].role;
    else if (next !== void 0) lines[k2].role = next;
  }
}
function canonLine(l2) {
  const out = { content: l2.content };
  if (l2.role !== void 0) out.role = l2.role;
  if (l2.at !== void 0) out.at = l2.at;
  return out;
}
function parseAvoid(e, tok) {
  const bad = (msg) => {
    throw new SsError(`avoid ${msg}（写法：avoid: 角色… [gap 数] [scan 数]）`, tok?.line ?? 0, tok?.col ?? 0);
  };
  const items = e.k === "seq" ? e.items : [e];
  const roles = /* @__PURE__ */ new Set();
  let gap = 0;
  let scan = Infinity;
  for (let i2 = 0; i2 < items.length; i2++) {
    const it = items[i2];
    if (it.k !== "id") bad(`里认不出 ${printExpr(it)}`);
    const v2 = it.v;
    if (v2 === "gap" || v2 === "scan") {
      const nxt = items[i2 + 1];
      if (nxt?.k !== "num") bad(`的 ${v2} 后面要跟数`);
      if (v2 === "gap") gap = nxt.v;
      else scan = nxt.v;
      i2++;
    } else {
      if (!KNOWN_ROLES.has(v2)) bad(`里认不出角色 ${v2}`);
      roles.add(v2);
    }
  }
  if (roles.size === 0) bad("至少写一个角色");
  return { roles, gap, scan };
}
function tokLen(t2) {
  switch (t2.t) {
    case "str":
      return t2.v.length + 2;
    case "num":
      return t2.raw.length;
    case "hash":
    case "at":
      return t2.v.length + 1;
    default:
      return t2.v.length;
  }
}
function contentOf(e, tok) {
  if (e.k === "str") return { kind: "text", parts: parseInterp(e.v, tok) };
  if (e.k === "call") return { kind: "component", name: e.name, args: e.args };
  throw new SsError("槽位的内容要是字符串或组件调用", tok.line, tok.col);
}
function parseInterp(s, tok) {
  const parts = [];
  let lit = "";
  let i2 = 0;
  while (i2 < s.length) {
    const c2 = s[i2];
    if (c2 === "{" && s[i2 + 1] === "{") {
      lit += "{";
      i2 += 2;
      continue;
    }
    if (c2 === "}" && s[i2 + 1] === "}") {
      lit += "}";
      i2 += 2;
      continue;
    }
    if (c2 === "{") {
      const end = s.indexOf("}", i2);
      if (end < 0) throw new SsError(`插值没有收尾：${s}`, tok?.line ?? 0, tok?.col ?? 0);
      if (lit) parts.push(lit);
      lit = "";
      const [path, ...fs] = s.slice(i2 + 1, end).split("|").map((x) => x.trim());
      const filters = fs.filter(Boolean).map((f2) => {
        if (!Object.prototype.hasOwnProperty.call(FILTERS, f2)) throw new SsError(`认不出的过滤器 ${f2}（过滤器：${Object.keys(FILTERS).join(" ")}）`, tok?.line ?? 0, tok?.col ?? 0);
        return f2;
      });
      parts.push({ path, filters });
      i2 = end + 1;
      continue;
    }
    lit += c2;
    i2++;
  }
  if (lit) parts.push(lit);
  return parts;
}
function exprWord(e) {
  if (e.k === "id" || e.k === "str") return e.v;
  if (e.k === "num") return String(e.v);
  throw new Error(`这里要一个词：${printExpr(e)}`);
}
function exprLength(e) {
  if (e.k === "num") return e.unit ? `${e.v}${e.unit}` : e.v;
  if (e.k === "neg" && e.a.k === "num") return exprLength({ ...e.a, v: -e.a.v });
  return exprValue(e);
}
function exprValue(e) {
  switch (e.k) {
    case "num":
      return exprLength(e);
    case "str":
      return e.v;
    case "hash":
      return parseColor(e.v);
    case "id":
      return e.v === "true" ? true : e.v === "false" ? false : e.v;
    case "neg":
      return exprLength(e);
    case "seq":
    case "list":
      return e.items.map(exprValue);
    default:
      return e;
  }
}
function parseColor(hex) {
  const h2 = hex.toLowerCase();
  if (/^[0-9a-f]{6}$/.test(h2)) return 4278190080 + parseInt(h2, 16) >>> 0;
  if (/^[0-9a-f]{8}$/.test(h2)) return parseInt(h2, 16) >>> 0;
  throw new Error(`颜色要写 #rrggbb 或 #aarrggbb：#${hex}`);
}
function roleDecl(decls) {
  const out = {};
  for (const [k2, v2] of Object.entries(decls)) {
    const field = ROLE_PROP_FIELD[k2] ?? k2;
    const val = k2 === "size" || k2 === "baseline-adjust" ? exprLength(v2) : exprValue(v2);
    out[field] = k2 === "align-mode" && typeof val === "string" ? kebabToCamel(val) : val;
  }
  return out;
}
function parseSs(src) {
  const p2 = new Parser(lex(src));
  p2.parseSheet();
  return { rules: p2.rules };
}
function printExpr(e) {
  switch (e.k) {
    case "num":
      return `${e.v}${e.unit ?? ""}`;
    case "str":
      return JSON.stringify(e.v);
    case "id":
      return e.v;
    case "hash":
      return `#${e.v}`;
    case "call":
      return `${e.name}(${e.args.map(printExpr).join(", ")})`;
    case "bin": {
      const wrap = (x) => x.k === "bin" && (x.op === "+" || x.op === "-") && (e.op === "*" || e.op === "/") ? `(${printExpr(x)})` : printExpr(x);
      const right2 = e.b.k === "bin" && (e.op === "-" || e.op === "/" || (e.b.op === "+" || e.b.op === "-") && e.op === "*") ? `(${printExpr(e.b)})` : wrap(e.b);
      return `${wrap(e.a)} ${e.op} ${right2}`;
    }
    case "neg":
      return `-${printExpr(e.a)}`;
    case "seq":
      return e.items.map(printExpr).join(" ");
    case "list":
      return e.items.map(printExpr).join(", ");
  }
}
function printValue(v2, key) {
  if (typeof v2 === "number") {
    if ((key === "ink" || key === "background" || key === "color") && Number.isInteger(v2) && v2 > 16777215) {
      return `#${(v2 >>> 0).toString(16).padStart(8, "0")}`;
    }
    return String(v2);
  }
  if (typeof v2 === "boolean") return String(v2);
  if (typeof v2 === "string") return /^-?\d+(\.\d+)?(pt|em|sp)$/.test(v2) || /^[A-Za-z_][A-Za-z0-9_-]*$/.test(v2) ? v2 : JSON.stringify(v2);
  if (Array.isArray(v2)) return v2.map((x) => printValue(x)).join(" ");
  if (v2 && typeof v2 === "object" && "k" in v2) return printExpr(v2);
  return JSON.stringify(v2);
}
function printInterp(parts) {
  return JSON.stringify(
    parts.map(
      (p2) => typeof p2 === "string" ? p2.replace(/\{/g, "{{").replace(/\}/g, "}}") : `{${[p2.path, ...p2.filters].join(" | ")}}`
    ).join("")
  );
}
function printContent(c2) {
  return c2.kind === "text" ? printInterp(c2.parts) : `${c2.name}(${c2.args.map(printExpr).join(", ")})`;
}
function printDecls(d2, ind) {
  return Object.entries(d2).map(([k2, v2]) => `${ind}${k2}: ${printExpr(v2)};`);
}
function printRegionBody(reg, ind) {
  const L3 = printDecls(reg.props, ind);
  for (const row of reg.rows) {
    const rp = Object.entries(row.props);
    L3.push(`${ind}row${rp.length ? `(${rp.map(([k2, v2]) => `${k2}: ${printExpr(v2)}`).join("; ")})` : ""} {`);
    for (const cell of row.cells) L3.push(...printCell(cell, ind + "  "));
    L3.push(`${ind}}`);
  }
  return L3;
}
function printLine(l2, role, at) {
  return `${printContent(l2.content)}${role && l2.role ? ` as ${l2.role}` : ""}${at && l2.at ? ` at ${printExpr(l2.at)}` : ""}`;
}
function printCell(cell, ind) {
  const simple = Object.keys(cell.props).length === 0;
  if (simple) return [`${ind}${cell.slot}: ${cell.lines.map((l2) => printLine(l2, true, true)).join(", ")};`];
  const same = (f2) => {
    const v2 = cell.lines[0] ? f2(cell.lines[0]) : void 0;
    return v2 !== void 0 && cell.lines.every((l2) => f2(l2) === v2) ? v2 : void 0;
  };
  const role = same((l2) => l2.role);
  const atStr = same((l2) => l2.at ? printExpr(l2.at) : void 0);
  const L3 = [`${ind}${cell.slot} {`];
  L3.push(`${ind}  content: ${cell.lines.map((l2) => printLine(l2, role === void 0, atStr === void 0)).join(", ")};`);
  if (role) L3.push(`${ind}  role: ${role};`);
  if (atStr) L3.push(`${ind}  at: ${atStr};`);
  L3.push(...printDecls(cell.props, ind + "  "));
  L3.push(`${ind}}`);
  return L3;
}
function printSet(set, ind) {
  const L3 = [];
  const tpl = set.template;
  for (const [name, f2] of Object.entries(tpl?.fonts ?? {})) {
    const body = Object.entries(f2 ?? {}).map(([k2, v2]) => `${ind}  ${k2}: ${printValue(v2)};`);
    L3.push(`${ind}@font-face ${name} {`, ...body, `${ind}}`);
  }
  if (set.page) {
    L3.push(`${ind}@page {`);
    for (const [k2, v2] of Object.entries(set.page)) L3.push(`${ind}  ${k2}: ${printValue(v2, k2)};`);
    L3.push(`${ind}}`);
  }
  for (const [role, decl] of Object.entries(set.roles ?? {})) {
    const body = Object.entries(decl ?? {}).map(([k2, v2]) => {
      const prop = Object.entries(ROLE_PROP_FIELD).find(([, f2]) => f2 === k2)?.[0] ?? k2;
      return `${prop}: ${printValue(k2 === "alignMode" && typeof v2 === "string" ? camelToKebab(v2) : v2, k2)};`;
    });
    L3.push(`${ind}${role} { ${body.join(" ")} }`);
  }
  for (const eng of ["jianpu", "staff", "break"]) {
    const blk = set[eng];
    if (!blk) continue;
    const body = [];
    if (blk.preset) body.push(`preset: ${blk.preset};`);
    for (const [k2, v2] of Object.entries(blk.overrides ?? {})) body.push(`${k2}: ${printValue(v2)};`);
    L3.push(`${ind}@${eng} { ${body.join(" ")} }`);
  }
  for (const [name, reg] of Object.entries(tpl?.regions ?? {})) {
    if (!reg) continue;
    L3.push(`${ind}@template ${name} {`, ...printRegionBody(reg, ind + "  "), `${ind}}`);
  }
  if (tpl?.flow) L3.push(`${ind}@flow {`, ...printDecls(tpl.flow, ind + "  "), `${ind}}`);
  if (tpl?.toc) L3.push(`${ind}@toc {`, ...printDecls(tpl.toc, ind + "  "), `${ind}}`);
  return L3;
}
function printSs(rules) {
  const L3 = [];
  for (const r4 of rules) {
    const w = { ...r4.when ?? {} };
    const conds = Object.entries(w).filter(([, v2]) => v2 !== void 0);
    let ind = "";
    const close2 = [];
    if (conds.length) {
      L3.push(`${ind}@media ${conds.map(([k2, v2]) => `(${k2}: ${v2})`).join(" and ")} {`);
      close2.unshift(`${ind}}`);
      ind += "  ";
    }
    L3.push(...printSet(r4.set, ind));
    L3.push(...close2);
  }
  return L3.join("\n") + "\n";
}
const PPTX_PAGE = { w: 960, h: 540, fontSize: 28, titleSize: 48, creditSize: 36 };
const PAGE_RATIOS = {
  "16:9": [960, 540],
  "4:3": [720, 540]
};
const PAPER_SIZES = { ...STANDARD_PAPERS, 长图: null };
const ORIGINAL_PAPERS = ["A4", "A5", "B5", "Letter", "长图"];
const LONG_IMAGE_WIDTH = 1e3;
const PAPER_DEFAULT = "长图";
const STAFF_PAPER_DEFAULT = "A4";
const STAFF_LONG_IMAGE_WIDTH = 595;
const isPaper = (k2) => typeof k2 === "string" && Object.prototype.hasOwnProperty.call(PAPER_SIZES, k2);
const INK = 4278190080;
const PAPER_WHITE = 4294967295;
const THEMES = {
  projection: [
    {
      set: {
        roles: { note: { size: PPTX_PAGE.fontSize }, title: { size: PPTX_PAGE.titleSize }, credit: { size: PPTX_PAGE.creditSize } },
        page: { size: [PPTX_PAGE.w, PPTX_PAGE.h], ink: INK, background: PAPER_WHITE },
        jianpu: { preset: "pptx" }
      }
    }
  ],
  print: [
    { set: { page: { paper: PAPER_DEFAULT, ink: INK, background: PAPER_WHITE }, jianpu: { preset: "original" } } },
    // 文本谱不给字号：那一路的尺寸是实测来的一整套，缺省 = 跟随版式量到的原尺寸
    { when: { engine: "jianpu" }, set: { roles: { note: { size: PPTX_PAGE.fontSize } } } }
  ],
  // 成书的其余一切在 `book` 块（由歌本样式表算出的 BookStyle，见 style/bookss.ts），由调用方作为第二层叠上
  book: [{ set: { jianpu: { preset: "book" } } }],
  staff: [{ set: { page: { paper: STAFF_PAPER_DEFAULT }, staff: { preset: "musicpp" } } }]
};
function themeOfMode(mode2) {
  return mode2 === "expanded" ? "projection" : "print";
}
function isPagedSheet(sheet) {
  const paper = sheet.page.paper;
  if (paper === void 0) return true;
  return PAPER_SIZES[paper] !== null;
}
function computeStyleForPaper(layers, ctx) {
  const paged = isPagedSheet(computeStyle(layers, ctx));
  return computeStyle(layers, { ...ctx, paged });
}
const TITLE_BLOCK_KEYS = Object.entries(FLOW_KEYS).filter((e) => e[1] !== null);
const bookKeys = (table) => Object.entries(table).filter(([, d2]) => d2.book);
function bookStyleOf(sheet, id) {
  const out = { id };
  const p2 = sheet.page;
  const size = p2.size;
  const margin = p2.margin;
  if (!Array.isArray(size) || size.length !== 2) throw new Error("成书样式表缺 @page { size: 宽 高 }");
  if (!Array.isArray(margin) || margin.length !== 4) throw new Error("成书样式表的 @page margin 要写四个数：上 外 下 内");
  out.page = {
    w: size[0],
    h: size[1],
    mirror: p2.mirror === true,
    margin: { inner: margin[3], outer: margin[1], top: margin[0], bottom: margin[2] }
  };
  out.fonts = { ...sheet.template?.fonts ?? {} };
  const roles = {};
  for (const [role, d2] of Object.entries(sheet.roles)) {
    if (!STYLE_ROLES.includes(role) || !d2) continue;
    if (d2.font === void 0 || typeof d2.size !== "number" || d2.alignMode === void 0) {
      throw new Error(`成书样式表的角色 ${role} 要写 font / size（裸数 pt）/ align-mode`);
    }
    const r4 = { font: d2.font, align: d2.alignMode, size: d2.size, baselineAdjust: d2.baselineAdjust ?? 0 };
    if (d2.color !== void 0) r4.color = d2.color;
    roles[role] = r4;
  }
  out.roles = roles;
  const metrics = {};
  const layout = {};
  const take = (ov, table, block) => {
    for (const [k2, v2] of Object.entries(ov ?? {})) {
      const def = table[k2];
      if (!def?.book) continue;
      const [group, field] = def.book.split(".");
      (group === "metrics" ? metrics : layout)[field] = bookValue(block, k2, def, field, v2);
    }
  };
  take(sheet.jianpu.overrides, JIANPU_KEYS, "jianpu");
  take(sheet.break?.overrides, BREAK_KEYS, "break");
  out.metrics = metrics;
  out.layout = layout;
  const toc = {};
  for (const [k2, e] of Object.entries(sheet.template?.toc ?? {})) {
    const field = TOC_KEYS[k2];
    toc[field] = field === "leader" ? exprText(e, `@toc ${k2}`) : exprNumber(e, `@toc ${k2}`);
  }
  out.toc = toc;
  const titleBlock = {};
  for (const [k2, e] of Object.entries(sheet.template?.flow ?? {})) {
    const field = FLOW_KEYS[k2];
    if (field) titleBlock[field] = exprNumber(e, `@flow ${k2}`);
  }
  out.titleBlock = titleBlock;
  return out;
}
function bookValue(block, key, def, field, v2) {
  const where = `@${block} 的 ${key}`;
  switch (def.kind) {
    case "bool":
      if (typeof v2 !== "boolean") throw new Error(`${where}：开关只收 true / false`);
      return v2;
    case "word":
      if (typeof v2 !== "string") throw new Error(`${where}：要一个词`);
      return v2;
    case "num":
      if (typeof v2 !== "number") throw new Error(`${where}：要一个数`);
      return v2;
    case "len": {
      if (field.endsWith("Em")) {
        const m2 = typeof v2 === "string" ? /^(-?\d+(?:\.\d+)?|-?\.\d+)em$/.exec(v2) : null;
        if (!m2) throw new Error(`${where}：成书这一项按字号缩放，要写 em（如 1.2em），却是 ${JSON.stringify(v2)}`);
        return Number(m2[1]);
      }
      if (typeof v2 !== "number") throw new Error(`${where}：成书这一项是 pt，写裸数，却是 ${JSON.stringify(v2)}`);
      return v2;
    }
  }
}
function exprNumber(e, where) {
  if (e.k === "num" && !e.unit) return e.v;
  if (e.k === "neg" && e.a.k === "num" && !e.a.unit) return -e.a.v;
  throw new Error(`${where}：要一个裸数（pt）`);
}
function exprText(e, where) {
  if (e.k === "str" || e.k === "id") return e.v;
  throw new Error(`${where}：要一个字符串`);
}
function num(v2, where) {
  const s = String(v2);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`${where}：${s} 写不成样式表的数字（指数形式或非有限数）`);
  return s;
}
const str = (v2) => JSON.stringify(v2);
function printBookSs(style) {
  const L3 = [];
  const { page } = style;
  const m2 = page.margin;
  L3.push(`@page { size: ${num(page.w, "page.w")} ${num(page.h, "page.h")}; margin: ${num(m2.top, "margin.top")} ${num(m2.outer, "margin.outer")} ${num(m2.bottom, "margin.bottom")} ${num(m2.inner, "margin.inner")}; mirror: ${page.mirror}; }`, "");
  for (const [name, f2] of Object.entries(style.fonts)) {
    const body = [`family: ${str(f2.family)};`];
    if (f2.file !== void 0) body.push(`file: ${str(f2.file)};`);
    if (f2.face !== void 0) body.push(`face: ${str(f2.face)};`);
    if (f2.mode !== void 0) body.push(`mode: ${f2.mode};`);
    if (f2.bold !== void 0) body.push(`bold: ${f2.bold};`);
    L3.push(`@font-face ${name} { ${body.join(" ")} }`);
  }
  L3.push("");
  for (const [role, r4] of Object.entries(style.roles)) {
    const body = [`font: ${r4.font};`, `size: ${num(r4.size, `${role}.size`)};`, `align-mode: ${r4.align.replace(/[A-Z]/g, (c2) => `-${c2.toLowerCase()}`)};`];
    if (r4.baselineAdjust !== 0) body.push(`baseline-adjust: ${num(r4.baselineAdjust, `${role}.baselineAdjust`)};`);
    if (r4.color !== void 0) body.push(`color: #${(r4.color >>> 0).toString(16).padStart(8, "0")};`);
    L3.push(`${role} { ${body.join(" ")} }`);
  }
  L3.push("");
  const block = (name, table) => {
    const byPath = new Map(bookKeys(table).map(([k2, d2]) => [d2.book, [k2, d2]]));
    const body = [];
    for (const group of ["metrics", "layout"]) {
      for (const [field, v2] of Object.entries(style[group])) {
        const hit = byPath.get(`${group}.${field}`);
        if (!hit || v2 === void 0) continue;
        const [key, def] = hit;
        if (def.kind === "bool" || def.kind === "word") body.push(`  ${key}: ${String(v2)};`);
        else body.push(`  ${key}: ${num(v2, `${group}.${field}`)}${field.endsWith("Em") ? "em" : ""};`);
      }
    }
    if (body.length) L3.push(`@${name} {`, ...body, "}", "");
  };
  block("jianpu", JIANPU_KEYS);
  block("break", BREAK_KEYS);
  const tb = style.titleBlock;
  const flow = TITLE_BLOCK_KEYS.filter(([, f2]) => tb[f2] !== void 0).map(([k2, f2]) => `${k2}: ${num(tb[f2], `titleBlock.${f2}`)};`);
  if (flow.length) L3.push(`@flow { ${flow.join(" ")} }`, "");
  const toc = style.toc;
  const tocBody = Object.entries(TOC_KEYS).filter(([, f2]) => toc[f2] !== void 0).map(([k2, f2]) => `${k2}: ${typeof toc[f2] === "string" ? str(toc[f2]) : num(toc[f2], `toc.${f2}`)};`);
  if (tocBody.length) L3.push(`@toc { ${tocBody.join(" ")} }`, "");
  return L3.join("\n");
}
function defaultFonts() {
  const FZ = `${process.env.HOME ?? ""}/Library/Fonts`;
  return {
    // 原书那四款方正字体（装在用户字体目录）。都是 TrueType，能正常子集嵌入，
    // 所以走文字不走轮廓——可选中可搜索。
    // **注意**：系统自带的 WeibeiSC-Bold.otf 是 CFF，pdf-lib 的子集产物 poppler 与 pdfjs
    // 都认不出来（"Unable to detect correct font file Type/Subtype"），那种只能 mode:"path"。
    wei: { family: "FZWeiBei-S03S", file: `${FZ}/方正魏碑简体.ttf` },
    // 标题
    serif: { family: "FZBaoSong-Z04", file: `${FZ}/方正报宋_GBK.TTF` },
    // 歌词与正文
    kai: { family: "FZKai-Z03", file: `${FZ}/方正楷体_GBK.TTF` },
    // 词曲署名
    hei: { family: "FZHei-B01S", file: `${FZ}/方正黑体简体.TTF` },
    // 曲号、分类页眉
    xingkai: { family: "FZXingKai-S04", file: `${FZ}/方正行楷_GBK.ttf` },
    // 目录的分类标题
    times: { family: "Times New Roman", file: "/System/Library/Fonts/Supplemental/Times New Roman.ttf" },
    // 兜底：方正那四款是印刷字库，字表不含「祂」「衪」「啰」这些（歌本里真的会用到）。
    // 只在主字体缺字时才用得上，用不到就不会被嵌进 PDF。
    fallbackCjk: { family: "Songti SC", file: "/System/Library/Fonts/Supplemental/Songti.ttc", face: "Songti SC Regular" },
    music: { family: "Bravura", file: "public/redist/Bravura.otf", mode: "path" }
  };
}
const INK_SAMPLE = {
  note: "5",
  tuplet: "3",
  chord: "G",
  keyMeter: "4",
  footer: "8",
  verseNum: "1"
};
function inkSampleOf(role) {
  return INK_SAMPLE[role] ?? "国";
}
const ROLE_FONT = {
  title: { font: "wei", align: "center" },
  songNumber: { font: "hei", align: "outer" },
  category: { font: "hei", align: "outer" },
  credit: { font: "kai", align: "right" },
  keyMeter: { font: "times", align: "left" },
  note: { font: "times", align: "inkCenter" },
  tuplet: { font: "times", align: "inkCenter" },
  verseNum: { font: "times", align: "left" },
  chord: { font: "times", align: "inkCenter" },
  lyric: { font: "serif", align: "inkCenter" },
  lyric2: { font: "serif", align: "inkCenter" },
  sectionWord: { font: "serif", align: "left" },
  story: { font: "serif", align: "left" },
  // 目录：歌名用楷体、分类标题用行楷（原书就是这么排的）
  toc: { font: "kai", align: "left" },
  tocHeading: { font: "xingkai", align: "center" },
  tocSub: { font: "xingkai", align: "center" },
  frontTitle: { font: "wei", align: "center" },
  header: { font: "hei", align: "outer" },
  footer: { font: "times", align: "outer" },
  // SMuFL 走轮廓（fonts.music.mode = "path"）：PDF 里就不必嵌 Bravura，
  // 也绕开 PUA 码位在子集 cmap 上的编码风险。
  smufl: { font: "music", align: "pen" }
};
function roleFontDefaults() {
  return { ...ROLE_FONT };
}
function defaultBookStyle() {
  const roles = {};
  for (const r4 of STYLE_ROLES) {
    roles[r4] = { font: ROLE_FONT[r4].font, size: 10, baselineAdjust: 0, align: ROLE_FONT[r4].align };
  }
  return {
    id: "default",
    page: {
      w: 425.197,
      h: 612.283,
      mirror: true,
      margin: { inner: 52, outer: 52, top: 94, bottom: 94 }
    },
    fonts: defaultFonts(),
    roles,
    metrics: {
      systemGapEm: 2.2,
      noteStepEm: 1.5,
      lyricGapEm: 0.1,
      bracketWidth: 0,
      bracketFootEm: 0,
      divLineGapEm: 0.17,
      divLineStepEm: 0.17,
      repeatDotDiam: 1.6,
      chordToNoteEm: 1.3,
      chordPlain: true,
      lyricToLyricEm: 1.5,
      // 原是 × 音符墨迹高的 0.9 / 0.66 / 0.41，× 0.674（Times 数字墨迹占字号）折成字号口径
      slurArcEm: 0.607,
      slurMaxArcEm: 0.445,
      slurMinArcEm: 0.276,
      slurFlatSpanSteps: 4,
      slurFlatNotes: 0,
      slurFlatRatio: 7,
      slurThicknessEm: 6 / 28,
      barlineWidthEm: 2 / 28,
      finalBarlineWidthEm: 3.5 / 28,
      stackGapEm: 0.1667
    },
    layout: {
      // 0 = 一页装多少行交给排版器按页高定。成书要的是装满，硬定行数会空掉半页；
      // 编辑器那条路（原 jpscore）另有自己的 4。
      linesPerPage: 0,
      phrase: true,
      phraseTargetMeas: 0,
      phraseLenWeight: 0.25,
      phraseBreakWeight: 3,
      phraseMidBreak: true,
      phraseMergeShort: true,
      // 断句那几个开关的默认值**要写在这儿**：统计脚本（gen-bookstyle.mjs）每次按这份默认值
      // 生成歌本的实测样式表，只在生成物里调参的话，重跑一次就全丢了。
      phraseEvenWeight: 1,
      phraseTailWeight: 1,
      phraseContentOnly: true,
      phraseParallelWeight: 6,
      // 这三个是 2026-08-27/28 调好的成书口径，**同样只能写在这儿**：9 月 1 日重跑一次统计
      // 就全丢过一次——096《哈利路亚！感谢主》的四行塌回两行（补刀再切成三行）、全书 D8 9 → 12。
      phraseTailLongWeight: 3,
      phraseMoreRowsSlack: 4,
      phraseFitSlack: 0,
      verseNumbers: "auto",
      maxHorizontalScale: 2
    },
    toc: {
      leader: "…",
      lineGap: 19.4,
      firstBaseline: 109,
      left: 52,
      right: 361.5,
      indexColumns: 2,
      indexLineGap: 15.8,
      indexFirstBaseline: 116,
      titleBaseline: 78.5
    },
    titleBlock: {
      numberBaseline: 77.9,
      firstSystemTop: 139.95,
      contSystemTop: 106,
      midStartGap: 40,
      footerBaseline: 556.5
    }
  };
}
function validateBookStyle(s) {
  const errors = [];
  const style = mergeStyle(defaultBookStyle(), s ?? {});
  for (const r4 of STYLE_ROLES) {
    const rs = style.roles[r4];
    if (!rs) {
      errors.push(`缺角色 ${r4}`);
      continue;
    }
    if (!(rs.size > 0)) errors.push(`角色 ${r4} 字号无效：${rs.size}`);
    if (!style.fonts[rs.font]) errors.push(`角色 ${r4} 引用了不存在的字体 ${rs.font}`);
  }
  if (!(style.page.w > 0 && style.page.h > 0)) errors.push("页面尺寸无效");
  const m2 = style.metrics;
  for (const [k2, v2] of Object.entries(m2)) {
    if (typeof v2 === "boolean") continue;
    if (typeof v2 !== "number" || !Number.isFinite(v2)) errors.push(`metrics.${k2} 无效：${v2}`);
  }
  return { style, errors };
}
function pageMargins(s, pageNo) {
  const { inner, outer, top, bottom: bottom2 } = s.page.margin;
  if (!s.page.mirror) return { left: inner, right: outer, top, bottom: bottom2 };
  const oddPage = pageNo % 2 === 1;
  return { left: oddPage ? inner : outer, right: oddPage ? outer : inner, top, bottom: bottom2 };
}
function roleOf(s, role) {
  return s.roles[role] ?? s.roles.lyric;
}
function emToPt(s, em) {
  return em * s.roles.note.size;
}
function fontOf(s, role) {
  return s.fonts[roleOf(s, role).font] ?? Object.values(s.fonts)[0];
}
const SECTION_WORD = /(副歌|间奏|前奏|尾奏|结束句|齐唱|独唱|轮唱|合唱|重唱|末节|尾声)/;
const bottom$1 = (r4) => r4.y + r4.h;
const right$1 = (r4) => r4.x + r4.w;
const cx = (r4) => r4.x + r4.w / 2;
const cy = (r4) => r4.y + r4.h / 2;
function summarize(v2) {
  const s = v2.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, p25: 0, p50: 0, p75: 0, madRatio: 0 };
  const q2 = (f2) => s[Math.min(s.length - 1, Math.max(0, Math.floor(f2 * s.length)))];
  const p50 = q2(0.5);
  const mad = [...s.map((x) => Math.abs(x - p50))].sort((a, b) => a - b)[Math.floor(s.length / 2)];
  return { n: s.length, p25: q2(0.25), p50, p75: q2(0.75), madRatio: p50 ? mad / Math.abs(p50) : 0 };
}
const med = (v2) => summarize(v2).p50;
function runBodyHeight(run) {
  const hs = run.chars.filter((c2) => c2.h > 0).map((c2) => c2.h);
  if (!hs.length) return 0;
  const top = med(hs.filter((h2) => h2 >= med(hs)));
  return top || med(hs);
}
function runChars$1(run) {
  if (!run) return [];
  const body = runBodyHeight(run);
  return run.chars.filter((c2) => c2.h > 0 && c2.w > 0 && (body <= 0 || c2.h >= body * 0.72)).map((c2) => ({ h: c2.h, w: c2.w, ch: c2.ch }));
}
function pushRun(out, role, run, page) {
  for (const c2 of runChars$1(run)) out.push({ role, h: c2.h, w: c2.w, page, ch: c2.ch });
}
function chordLineRole$1(run) {
  const t2 = run.text.replace(/\s/g, "");
  if (!t2) return "chord";
  const cjk = [...t2].filter((c2) => c2.charCodeAt(0) > 11903).length;
  return cjk / t2.length > 0.4 ? "credit" : "chord";
}
function collectRoleSamples(pages, opt = {}) {
  const from = opt.fromPage ?? 40;
  const to = opt.toPage ?? 560;
  const out = [];
  const lyricSizes = [];
  for (const p2 of pages) {
    if (p2.kind !== "score") continue;
    for (const s of p2.songs) for (const y of s.systems) for (const l2 of y.lyricLines) {
      const h2 = runBodyHeight(l2);
      if (h2 >= 3) lyricSizes.push(h2);
    }
  }
  const lyricMid = med(lyricSizes);
  const lyric2Cut = lyricMid - 0.6;
  for (const p2 of pages) {
    const inRange = p2.page >= from && p2.page <= to;
    if (p2.kind === "toc" || p2.kind === "index" || p2.kind === "front-matter") {
      const tocPage = p2.kind === "toc" || p2.kind === "index";
      for (const t2 of p2.textLines) {
        const txt = t2.text.trim();
        const entry = /[（(]\d+[)）]\s*$/.test(txt) || /\d\s*$/.test(txt);
        if (t2.size >= 16) pushRun(out, "frontTitle", t2, p2.page);
        else if (!tocPage) continue;
        else if (entry) pushRun(out, "toc", t2, p2.page);
        else if (t2.size >= 13.5) pushRun(out, "tocHeading", t2, p2.page);
        else if (t2.size >= 9.8) pushRun(out, "tocSub", t2, p2.page);
      }
    }
    if (p2.header) pushRun(out, "header", p2.header, p2.page);
    if (p2.footer) pushRun(out, "footer", p2.footer, p2.page);
    if (!inRange || p2.kind !== "score") continue;
    for (const b of p2.storyBoxes) for (const l2 of b.lines) pushRun(out, "story", l2, p2.page);
    for (const s of p2.songs) {
      pushRun(out, "title", s.titleRun, p2.page);
      pushRun(out, "songNumber", s.numberRun, p2.page);
      pushRun(out, "keyMeter", s.keyMeterRun, p2.page);
      pushRun(out, "category", s.categoryRun, p2.page);
      for (const c2 of s.creditRuns) pushRun(out, "credit", c2, p2.page);
      for (const y of s.systems) {
        const noteMed = med(y.notes.filter((c2) => c2.h > 0).map((c2) => c2.h));
        for (const c2 of y.notes) {
          if (!(c2.h > 0)) continue;
          const role = noteMed > 0 && c2.h < noteMed * 0.72 ? "tuplet" : "note";
          out.push({ role, h: c2.h, w: c2.w, page: p2.page, ch: c2.ch });
        }
        for (const c2 of y.chordLines) pushRun(out, SECTION_WORD.test(c2.text) ? "sectionWord" : chordLineRole$1(c2), c2, p2.page);
        for (const l2 of y.lyricLines) {
          const h2 = runBodyHeight(l2);
          if (h2 < lyricMid * 0.5) continue;
          pushRun(out, h2 < lyric2Cut ? "lyric2" : "lyric", l2, p2.page);
        }
      }
    }
  }
  return out;
}
function emptySamples() {
  return {
    noteH: [],
    systemGap: [],
    noteStep: [],
    barGap: [],
    octaveDotUpGap: [],
    octaveDotDownGap: [],
    octaveDotStep: [],
    divLineGap: [],
    divLineStep: [],
    divLineLen: [],
    divLineWidth: [],
    augmentLineLen: [],
    augmentLineWidth: [],
    augmentDotGap: [],
    barlineHeight: [],
    barlineWidth: [],
    repeatDotDiam: [],
    bracketWidth: [],
    bracketFootLen: [],
    tupletNumH: [],
    slurThickness: [],
    slurHeight: [],
    chordToNote: [],
    musicToLyric: [],
    lyricToLyric: [],
    titleToSystem: [],
    creditToSystem: [],
    keyMeterToSystem: [],
    oddX0: [],
    oddX1: [],
    evenX0: [],
    evenX1: [],
    topY: [],
    bottomY: [],
    numberBaseline: [],
    titleBaseline: [],
    keyMeterBaseline: [],
    creditFirstBaseline: [],
    creditLineGap: [],
    firstSystemTop: [],
    contSystemTop: [],
    midStartGap: []
  };
}
function nearestNote(notes, x, tol) {
  let best = null;
  let bd = Infinity;
  for (const n2 of notes) {
    const d2 = Math.abs(cx(n2) - x);
    if (d2 < bd) {
      bd = d2;
      best = n2;
    }
  }
  return best && bd <= tol ? best : null;
}
function collectMetricSamples(pages, opt = {}) {
  const from = opt.fromPage ?? 40;
  const to = opt.toPage ?? 560;
  const out = emptySamples();
  for (const p2 of pages) {
    if (p2.kind !== "score" || p2.page < from || p2.page > to) continue;
    for (const f2 of p2.frames) {
      if (f2.type !== "bracket") continue;
      out.bracketWidth.push(Math.min(f2.box.w, f2.box.h));
      if (f2.box.h > f2.box.w && f2.box.h > 1) out.bracketFootLen.push(f2.box.h);
    }
    let pageX0 = Infinity;
    let pageX1 = -Infinity;
    const songsOnPage = [...p2.songs].sort((a, b) => a.yFrom - b.yFrom);
    let prevBottom = -Infinity;
    for (const s of songsOnPage) {
      const sys = s.systems;
      const atPageTop = s === songsOnPage[0];
      for (let i2 = 0; i2 < sys.length; i2++) {
        const y = sys[i2];
        const notes = y.notes.filter((n2) => n2.h > 0 && n2.w > 0);
        if (notes.length < 3) continue;
        const noteH = med(notes.map((n2) => n2.h));
        const noteW = med(notes.map((n2) => n2.w));
        if (!(noteH > 0)) continue;
        out.noteH.push(noteH);
        pageX0 = Math.min(pageX0, y.x0);
        pageX1 = Math.max(pageX1, y.x1);
        for (const l2 of [...y.lyricLines, ...y.chordLines]) {
          pageX0 = Math.min(pageX0, l2.box.x);
          pageX1 = Math.max(pageX1, right$1(l2.box));
        }
        if (i2 + 1 < sys.length) {
          const nx = sys[i2 + 1];
          const lastLyric = y.lyricLines.length ? Math.max(...y.lyricLines.map((l2) => l2.baselineY)) : y.noteBottom;
          const chordTop = nx.chordLines.length ? Math.min(...nx.chordLines.map((c2) => c2.box.y)) : nx.noteTop;
          out.systemGap.push(Math.min(nx.noteTop, chordTop) - lastLyric);
        }
        const xs = [...notes].sort((a, b) => a.x - b.x);
        const steps = [];
        for (let k2 = 1; k2 < xs.length; k2++) steps.push(cx(xs[k2]) - cx(xs[k2 - 1]));
        const stepMed = med(steps);
        for (const d2 of steps) if (stepMed > 0 && d2 <= stepMed * 1.6) out.noteStep.push(d2);
        const band = p2.marks.filter(
          (m2) => bottom$1(m2.box) > y.noteTop - noteH * 4 && m2.box.y < y.noteBottom + noteH * 4 && right$1(m2.box) > y.x0 - noteW && m2.box.x < y.x1 + noteW
        );
        const upDots = /* @__PURE__ */ new Map();
        const downDots = /* @__PURE__ */ new Map();
        const divsOf = /* @__PURE__ */ new Map();
        for (const m2 of band) {
          switch (m2.cls) {
            case "octaveDot": {
              const n2 = nearestNote(notes, cx(m2.box), noteW * 0.8);
              if (!n2) break;
              const map2 = cy(m2.box) < cy(n2) ? upDots : downDots;
              const a = map2.get(n2) ?? [];
              a.push(m2);
              map2.set(n2, a);
              break;
            }
            case "divLine": {
              const n2 = nearestNote(notes, cx(m2.box), noteW * 1.2);
              if (!n2) break;
              const a = divsOf.get(n2) ?? [];
              a.push(m2);
              divsOf.set(n2, a);
              out.divLineLen.push(m2.box.w);
              out.divLineWidth.push(m2.box.h);
              break;
            }
            case "augmentLine":
              out.augmentLineLen.push(m2.box.w);
              out.augmentLineWidth.push(m2.box.h);
              break;
            case "augmentDot": {
              const n2 = nearestNote(notes, cx(m2.box) - noteW, noteW * 1.5);
              if (n2) out.augmentDotGap.push(m2.box.x - right$1(n2));
              break;
            }
            case "barline":
              if (m2.box.h > noteH * 0.8 && m2.box.h < noteH * 3) {
                out.barlineHeight.push(m2.box.h / noteH);
                out.barlineWidth.push(m2.box.w);
              }
              break;
            case "tupletNum":
              if (m2.box.h > 2) out.tupletNumH.push(m2.box.h);
              break;
            case "repeatDot": {
              const d2 = Math.max(m2.box.w, m2.box.h);
              if (d2 > 0.8) out.repeatDotDiam.push(d2);
              break;
            }
            case "slur":
              out.slurThickness.push(m2.lineWidth || 0);
              out.slurHeight.push(m2.box.h / noteH);
              break;
          }
        }
        for (const [, ds] of upDots) {
          const sorted = [...ds].sort((a, b) => b.box.y - a.box.y);
          out.octaveDotUpGap.push(y.noteTop - bottom$1(sorted[0].box));
          for (let k2 = 1; k2 < sorted.length; k2++) out.octaveDotStep.push(sorted[k2 - 1].box.y - bottom$1(sorted[k2].box));
        }
        for (const [n2, ds] of downDots) {
          const sorted = [...ds].sort((a, b) => a.box.y - b.box.y);
          const divs = divsOf.get(n2);
          const above = divs && divs.length ? Math.max(...divs.map((d2) => bottom$1(d2.box))) : y.noteBottom;
          out.octaveDotDownGap.push(sorted[0].box.y - above);
          for (let k2 = 1; k2 < sorted.length; k2++) out.octaveDotStep.push(sorted[k2].box.y - bottom$1(sorted[k2 - 1].box));
        }
        for (const [n2, ds] of divsOf) {
          const sorted = [...ds].sort((a, b) => a.box.y - b.box.y);
          out.divLineGap.push(sorted[0].box.y - bottom$1(n2));
          for (let k2 = 1; k2 < sorted.length; k2++) out.divLineStep.push(sorted[k2].box.y - bottom$1(sorted[k2 - 1].box));
        }
        for (const bx of y.barlineXs) {
          let leftD = Infinity;
          let rightD = Infinity;
          for (const n2 of notes) {
            if (right$1(n2) <= bx) leftD = Math.min(leftD, bx - right$1(n2));
            else if (n2.x >= bx) rightD = Math.min(rightD, n2.x - bx);
          }
          if (Number.isFinite(leftD) && leftD < noteW * 4) out.barGap.push(leftD);
          if (Number.isFinite(rightD) && rightD < noteW * 4) out.barGap.push(rightD);
        }
        for (const c2 of y.chordLines) if (chordLineRole$1(c2) === "chord") out.chordToNote.push(y.noteTop - c2.baselineY);
        const lyr = [...y.lyricLines].sort((a, b) => a.baselineY - b.baselineY);
        if (lyr.length) out.musicToLyric.push(lyr[0].baselineY - y.noteBottom);
        for (let k2 = 1; k2 < lyr.length; k2++) out.lyricToLyric.push(lyr[k2].baselineY - lyr[k2 - 1].baselineY);
      }
      for (const r4 of [s.titleRun, s.numberRun, s.keyMeterRun, ...s.creditRuns]) {
        if (!r4) continue;
        pageX0 = Math.min(pageX0, r4.box.x);
        pageX1 = Math.max(pageX1, right$1(r4.box));
      }
      if (s.startsHere && sys.length) {
        const top = sys[0].noteTop;
        if (s.titleRun) out.titleToSystem.push(top - s.titleRun.baselineY);
        if (s.keyMeterRun) out.keyMeterToSystem.push(top - s.keyMeterRun.baselineY);
        const cr = s.creditRuns.filter((c2) => c2.baselineY < top).map((c2) => c2.baselineY).sort((a, b) => a - b);
        for (let k2 = 1; k2 < cr.length; k2++) out.creditLineGap.push(cr[k2] - cr[k2 - 1]);
        if (atPageTop) {
          out.firstSystemTop.push(top);
          if (s.titleRun) out.titleBaseline.push(s.titleRun.baselineY);
          if (s.numberRun) out.numberBaseline.push(s.numberRun.baselineY);
          if (s.keyMeterRun) out.keyMeterBaseline.push(s.keyMeterRun.baselineY);
          if (cr.length) out.creditFirstBaseline.push(cr[0]);
        } else if (s.numberRun && Number.isFinite(prevBottom)) {
          out.midStartGap.push(s.numberRun.baselineY - prevBottom);
        }
      } else if (sys.length) {
        out.contSystemTop.push(sys[0].noteTop);
      }
      for (const y of sys) {
        for (const l2 of y.lyricLines) prevBottom = Math.max(prevBottom, bottom$1(l2.box));
        prevBottom = Math.max(prevBottom, y.noteBottom);
      }
    }
    if (Number.isFinite(pageX0)) (p2.page % 2 === 1 ? out.oddX0 : out.evenX0).push(pageX0);
    if (Number.isFinite(pageX1)) (p2.page % 2 === 1 ? out.oddX1 : out.evenX1).push(pageX1);
    if (p2.header) out.topY.push(p2.header.baselineY);
    if (p2.footer) out.bottomY.push(p2.footer.baselineY);
  }
  return out;
}
function inferTocRule(pages) {
  const tocGaps = [];
  const tocFirst = [];
  const idxGaps = [];
  const idxFirst = [];
  const lefts = [];
  const rights = [];
  const titles = [];
  const headAbove = [];
  const headBelow = [];
  for (const p2 of pages) {
    if (p2.kind !== "toc" && p2.kind !== "index") continue;
    const isTocEntry = (t2) => /[（(]\d+[)）]\s*$/.test(t2.trim());
    const isIdxEntry = (t2) => !isTocEntry(t2) && /\d\s*$/.test(t2.trim());
    for (const kind of ["toc", "index"]) {
      const lines = p2.textLines.filter((l2) => kind === "toc" ? isTocEntry(l2.text) : isIdxEntry(l2.text));
      if (lines.length < 5) continue;
      const bl = lines.map((l2) => l2.baselineY).sort((a, b) => a - b);
      for (let i2 = 1; i2 < bl.length; i2++) {
        const d2 = bl[i2] - bl[i2 - 1];
        if (d2 > 4) (kind === "toc" ? tocGaps : idxGaps).push(d2);
      }
      (kind === "toc" ? tocFirst : idxFirst).push(bl[0]);
      for (const l2 of lines) {
        lefts.push(l2.box.x);
        rights.push(right$1(l2.box));
      }
    }
    if (p2.kind === "toc") {
      const entries = p2.textLines.filter((l2) => isTocEntry(l2.text));
      const entrySize = entries.length ? med(entries.map((l2) => l2.size)) : 0;
      if (entrySize > 0) {
        const heads = p2.textLines.filter((l2) => !isTocEntry(l2.text) && l2.size > entrySize * 1.4 && l2.size < 16);
        for (const h2 of heads) {
          const above = entries.filter((e) => e.baselineY < h2.baselineY).sort((a, b) => b.baselineY - a.baselineY)[0];
          const below = entries.filter((e) => e.baselineY > h2.baselineY).sort((a, b) => a.baselineY - b.baselineY)[0];
          if (above) headAbove.push(h2.baselineY - above.baselineY);
          if (below) headBelow.push(below.baselineY - h2.baselineY);
        }
      }
    }
    const big = [...p2.textLines].sort((a, b) => b.size - a.size)[0];
    if (big && big.size >= 15) titles.push(big.baselineY);
  }
  const round = (v2) => Number(v2.toFixed(2));
  const out = {};
  if (tocGaps.length) out.lineGap = round(med(tocGaps));
  if (tocFirst.length) out.firstBaseline = round(med(tocFirst));
  if (idxGaps.length) out.indexLineGap = round(med(idxGaps));
  if (idxFirst.length) out.indexFirstBaseline = round(med(idxFirst));
  if (lefts.length) out.left = round(med(lefts));
  if (rights.length) out.right = round(med(rights));
  if (titles.length) out.titleBaseline = round(med(titles));
  if (headAbove.length) out.headingGapAbove = round(med(headAbove));
  if (headBelow.length) out.headingGapBelow = round(med(headBelow));
  return out;
}
function inferBookStyle(profile, pages, fonts, opt) {
  const base = defaultBookStyle();
  const roleFont = roleFontDefaults();
  const samples = collectRoleSamples(pages, opt);
  const ms = collectMetricSamples(pages, opt);
  const warnings = [];
  const CJK_ROLES = /* @__PURE__ */ new Set([
    "lyric",
    "lyric2",
    "title",
    "credit",
    "story",
    "toc",
    "tocHeading",
    "tocSub",
    "frontTitle",
    "category",
    "header",
    "sectionWord"
  ]);
  const isCjk = (ch) => !!ch && /[\u4e00-\u9fff]/.test(ch);
  const byRole = /* @__PURE__ */ new Map();
  const byRoleAll = /* @__PURE__ */ new Map();
  for (const s of samples) {
    const all = byRoleAll.get(s.role) ?? [];
    all.push(s.h);
    byRoleAll.set(s.role, all);
    if (CJK_ROLES.has(s.role) && !isCjk(s.ch)) continue;
    const a = byRole.get(s.role) ?? [];
    a.push(s.h);
    byRole.set(s.role, a);
  }
  for (const [role, all] of byRoleAll) if (!byRole.get(role)?.length) byRole.set(role, all);
  const CLASS_ROLE = {
    tupletNum: "tuplet",
    verseNum: "verseNum",
    sectionWord: "sectionWord",
    category: "category"
  };
  for (const [cls, role] of Object.entries(CLASS_ROLE)) {
    const hs = opt.classHeights?.[cls];
    if (hs?.length && !byRole.get(role)?.length) byRole.set(role, hs);
  }
  const roles = {};
  const roleReport = {};
  const derived = [];
  const fontSize = (r4, ink) => {
    const ratio = opt.inkRatio(r4, inkSampleOf(r4));
    if (!(ratio > 0.2 && ratio < 1.6)) throw new Error(`角色 ${r4} 量不出样本字「${inkSampleOf(r4)}」的墨迹占比（${ratio}）`);
    return Number((ink / ratio).toFixed(3));
  };
  for (const r4 of STYLE_ROLES) {
    const sum = summarize(byRole.get(r4) ?? []);
    roleReport[r4] = sum;
    roles[r4] = {
      font: roleFont[r4].font,
      align: roleFont[r4].align,
      size: sum.n ? fontSize(r4, Number(sum.p50.toFixed(2))) : base.roles[r4].size,
      baselineAdjust: 0
    };
    if (!sum.n) derived.push(r4);
    else if (sum.n < 50) warnings.push(`角色 ${r4} 样本偏少（n=${sum.n}）`);
    if (sum.madRatio > 0.12) warnings.push(`⚠ 角色 ${r4} 离散偏大（MAD/p50=${sum.madRatio.toFixed(3)}，n=${sum.n}），多半是两族混在一桶`);
  }
  for (const r4 of derived) {
    const from = { verseNum: "lyric", sectionWord: "lyric", category: "header", smufl: "note" };
    const src = from[r4];
    if (src && roleReport[src]?.n) {
      roles[r4].size = roles[src].size;
      warnings.push(`角色 ${r4} 无实测样本，派生自 ${src}（${roles[r4].size}pt）`);
    } else if (r4 === "tuplet") {
      roles[r4].size = Number((roles.note.size * 0.62).toFixed(3));
      warnings.push(`角色 tuplet 无实测样本，按音符字号 × 0.62 派生（${roles[r4].size}pt）`);
    } else {
      warnings.push(`角色 ${r4} 无实测样本，沿用默认字号 ${roles[r4].size}`);
    }
  }
  const noteH = roles.note.size || 7;
  const noteInk = roleReport.note?.n ? Number(roleReport.note.p50.toFixed(2)) : med(ms.noteH) || 5;
  const em = (v2) => Number(((med(v2) || 0) / noteH).toFixed(4));
  const pt = (v2) => Number((med(v2) || 0).toFixed(3));
  const metricReport = {};
  const rec = (name, v2, asEm) => {
    const sum = summarize(v2);
    metricReport[name] = asEm ? { ...sum, em: sum.p50 / noteH } : sum;
    if (!sum.n) warnings.push(`间距 ${name} 没有样本`);
    else if (sum.n < 200) warnings.push(`间距 ${name} 样本偏少（n=${sum.n}）`);
    else if (sum.madRatio > 0.15) warnings.push(`⚠ 间距 ${name} 离散偏大（MAD/p50=${sum.madRatio.toFixed(3)}，n=${sum.n}）`);
    return sum;
  };
  rec("systemGap", ms.systemGap, true);
  rec("noteStep", ms.noteStep, true);
  rec("barGap", ms.barGap, true);
  rec("octaveDotUpGap", ms.octaveDotUpGap, true);
  rec("octaveDotDownGap", ms.octaveDotDownGap, true);
  rec("octaveDotStep", ms.octaveDotStep, true);
  rec("divLineGap", ms.divLineGap, true);
  rec("divLineStep", ms.divLineStep, true);
  rec("divLineLen", ms.divLineLen, true);
  rec("divLineWidth", ms.divLineWidth, false);
  rec("augmentLineLen", ms.augmentLineLen, true);
  rec("augmentLineWidth", ms.augmentLineWidth, false);
  rec("augmentDotGap", ms.augmentDotGap, true);
  rec("barlineHeight", ms.barlineHeight, false);
  rec("barlineWidth", ms.barlineWidth, false);
  rec("repeatDotDiam", ms.repeatDotDiam, false);
  rec("bracketWidth", ms.bracketWidth, false);
  rec("bracketFootLen", ms.bracketFootLen, false);
  rec("tupletNumH", ms.tupletNumH, false);
  rec("slurThickness", ms.slurThickness, false);
  rec("slurHeight", ms.slurHeight, false);
  rec("chordToNote", ms.chordToNote, true);
  rec("musicToLyric", ms.musicToLyric, true);
  rec("lyricToLyric", ms.lyricToLyric, true);
  rec("titleToSystem", ms.titleToSystem, true);
  rec("creditToSystem", ms.creditToSystem, true);
  rec("keyMeterToSystem", ms.keyMeterToSystem, true);
  rec("titleBaseline", ms.titleBaseline, false);
  rec("numberBaseline", ms.numberBaseline, false);
  rec("keyMeterBaseline", ms.keyMeterBaseline, false);
  rec("creditFirstBaseline", ms.creditFirstBaseline, false);
  rec("creditLineGap", ms.creditLineGap, false);
  rec("firstSystemTop", ms.firstSystemTop, false);
  rec("contSystemTop", ms.contSystemTop, false);
  rec("midStartGap", ms.midStartGap, false);
  const gUp = med(ms.octaveDotUpGap);
  const gDown = med(ms.octaveDotDownGap);
  const gDiv = med(ms.divLineGap);
  const spread = Math.max(gUp, gDown, gDiv) - Math.min(gUp, gDown, gDiv);
  if (spread > noteInk * 0.1) {
    warnings.push(
      `⚠ 层距不等：高音点上 ${gUp.toFixed(2)} / 低音点下 ${gDown.toFixed(2)} / 减时线 ${gDiv.toFixed(2)}（差 ${spread.toFixed(2)}pt > 0.1 墨迹高），jpStackGap 需要拆成三个字段分别覆写`
    );
  }
  const metrics = {
    ...base.metrics,
    systemGapEm: em(ms.systemGap),
    noteStepEm: em(ms.noteStep),
    divLineGapEm: em(ms.divLineGap),
    divLineStepEm: em(ms.divLineStep),
    repeatDotDiam: pt(ms.repeatDotDiam),
    // 房号（1./2.）与三连音的括线：原书量到的线宽与「脚」长（脚长按音符字号归一）
    bracketWidth: pt(ms.bracketWidth),
    bracketFootEm: em(ms.bracketFootLen),
    // slurArcEm 不从原书量：那边量到的是 slur 对象的包围盒高（含描边外扩、且短弧居多），
    // 拿来当弧的凸起高度会扁得几乎没有弧度。用默认值，需要再调就改歌本样式表。
    slurArcEm: base.metrics.slurArcEm,
    chordToNoteEm: em(ms.chordToNote),
    lyricToLyricEm: em(ms.lyricToLyric),
    stackGapEm: Number(((gUp + gDown + gDiv) / 3 / noteH).toFixed(4))
  };
  const oddLeft = med(ms.oddX0);
  const oddRight = profile.pageW - med(ms.oddX1);
  const evenLeft = med(ms.evenX0);
  const evenRight = profile.pageW - med(ms.evenX1);
  const mirror = Math.abs(oddLeft - evenRight) + Math.abs(oddRight - evenLeft) < Math.abs(oddLeft - evenLeft) + Math.abs(oddRight - evenRight);
  const inner = mirror ? (oddLeft + evenRight) / 2 : (oddLeft + evenLeft) / 2;
  const outer = mirror ? (oddRight + evenLeft) / 2 : (oddRight + evenRight) / 2;
  if (!mirror) warnings.push(`版心不是对开镜像（奇 ${oddLeft.toFixed(1)}/${oddRight.toFixed(1)} 偶 ${evenLeft.toFixed(1)}/${evenRight.toFixed(1)}），mirror 置 false`);
  const cb = profile.contentBox;
  const style = {
    ...base,
    id: opt.id ?? profile.id ?? "book",
    page: {
      w: Number(profile.pageW.toFixed(3)),
      h: Number(profile.pageH.toFixed(3)),
      mirror,
      margin: {
        inner: Number(inner.toFixed(2)),
        outer: Number(outer.toFixed(2)),
        top: Number(cb.y.toFixed(2)),
        bottom: Number((profile.pageH - bottom$1(cb)).toFixed(2))
      }
    },
    fonts,
    roles,
    metrics,
    toc: { ...base.toc, ...inferTocRule(pages) },
    titleBlock: {
      numberBaseline: pt(ms.numberBaseline) || base.titleBlock.numberBaseline,
      firstSystemTop: pt(ms.firstSystemTop) || base.titleBlock.firstSystemTop,
      contSystemTop: pt(ms.contSystemTop) || base.titleBlock.contSystemTop,
      midStartGap: pt(ms.midStartGap) || base.titleBlock.midStartGap,
      footerBaseline: pt(ms.bottomY) || base.titleBlock.footerBaseline
    }
  };
  warnings.push(
    `模板基线实测：标题 ${pt(ms.titleBaseline)}、调号拍号 ${pt(ms.keyMeterBaseline)}、署名首行 ${pt(ms.creditFirstBaseline)}、署名行距 ${pt(ms.creditLineGap)}、页眉 ${pt(ms.topY)}`
  );
  return { style, report: { roles: roleReport, metrics: metricReport, warnings } };
}
const UNREAD$1 = "�";
function chordLineRole(run) {
  const t2 = run.text.replace(/\s/g, "");
  if (!t2) return "chord";
  const cjk = [...t2].filter((c2) => c2.charCodeAt(0) > 11903).length;
  return cjk / t2.length > 0.4 ? "credit" : "chord";
}
function median$1(v2) {
  if (!v2.length) return 0;
  const s = [...v2].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function bodyHeight(run) {
  const hs = run.chars.filter((c2) => c2.h > 0).map((c2) => c2.h);
  if (!hs.length) return 0;
  const m2 = median$1(hs);
  return median$1(hs.filter((h2) => h2 >= m2)) || m2;
}
function specToDrawPage(spec, style, opt) {
  const items = [];
  let filled = 0;
  let unread = 0;
  let keptOwnSize = 0;
  const unreadKeys = [];
  const lyric2Cut = opt.lyric2Cut ?? style.roles.lyric.size * opt.inkRatio("lyric") - 0.6;
  for (const f2 of spec.frames) {
    if (f2.type === "image" || f2.type === "shading") continue;
    items.push({ t: "rect", x: f2.box.x, y: f2.box.y, w: f2.box.w, h: f2.box.h, fill: 0 });
  }
  for (const m2 of spec.marks) {
    if (m2.d) items.push({ t: "path", d: m2.d, fill: 0, dash: m2.dash });
    else
      items.push({
        t: "rect",
        x: m2.box.x,
        y: m2.box.y,
        w: Math.max(m2.box.w, 0.15),
        h: Math.max(m2.box.h, 0.15),
        fill: 0
      });
  }
  const addRun = (run, role, songId = null) => {
    if (!run || !run.chars.length) return;
    const roleStyle = roleOf(style, role);
    const body = bodyHeight(run);
    let size = roleStyle.size;
    const ratio = opt.inkRatio(role);
    const ink = size * ratio;
    if (body > 0 && Math.abs(body - ink) / ink > 0.25) {
      size = Number((body / ratio).toFixed(2));
      keptOwnSize++;
    }
    const chars = run.chars;
    const text = [];
    for (const c2 of chars) {
      let ch = c2.ch;
      if (ch && ch.charCodeAt(0) < 32) ch = UNREAD$1;
      if (ch === UNREAD$1 || !ch) {
        const got = opt.fallbackChar?.(c2.key) ?? null;
        if (got) {
          ch = got;
          filled++;
        } else {
          ch = " ";
          unread++;
          unreadKeys.push({ key: c2.key, role });
        }
      }
      text.push(ch);
    }
    const joined = text.join("");
    if (!joined.trim()) return;
    const x0 = Math.min(...chars.map((c2) => c2.x));
    const x1 = Math.max(...chars.map((c2) => c2.x + c2.w));
    items.push({
      t: "text",
      y: run.baselineY - roleStyle.baselineAdjust * size,
      text: joined,
      size,
      role,
      align: roleStyle.align,
      xs: chars.map((c2) => c2.x),
      ws: chars.map((c2) => c2.w),
      box: { x: x0, w: x1 - x0 },
      songId
    });
  };
  addRun(spec.header, "header");
  addRun(spec.footer, "footer");
  const textRole = spec.kind === "toc" || spec.kind === "index" ? "toc" : "story";
  for (const t2 of spec.textLines) addRun(t2, textRole);
  for (const b of spec.storyBoxes) for (const l2 of b.lines) addRun(l2, "story");
  for (const s of spec.songs) {
    addRun(s.numberRun, "songNumber", s.id);
    addRun(s.titleRun, "title", s.id);
    addRun(s.keyMeterRun, "keyMeter", s.id);
    addRun(s.categoryRun, "category", s.id);
    for (const c2 of s.creditRuns) addRun(c2, "credit", s.id);
    for (const y of s.systems) {
      for (const c2 of y.chordLines) addRun(c2, chordLineRole(c2), s.id);
      for (const l2 of y.lyricLines) addRun(l2, bodyHeight(l2) < lyric2Cut ? "lyric2" : "lyric", s.id);
      const noteMed = median$1(y.notes.filter((n2) => n2.h > 0).map((n2) => n2.h));
      const small = y.notes.filter((n2) => noteMed > 0 && n2.h < noteMed * 0.72);
      const big = y.notes.filter((n2) => !(noteMed > 0 && n2.h < noteMed * 0.72));
      const asRun = (ns) => ns.length ? {
        text: ns.map((n2) => n2.ch).join(""),
        box: { x: 0, y: 0, w: 0, h: 0 },
        baselineY: median$1(ns.map((n2) => n2.y + n2.h)),
        size: median$1(ns.map((n2) => n2.h)),
        chars: ns
      } : null;
      addRun(asRun(big), "note", s.id);
      addRun(asRun(small), "tuplet", s.id);
    }
  }
  const texts = items.filter((i2) => i2.t === "text").sort((a, b) => a.y - b.y || a.xs[0] - b.xs[0]);
  const others = items.filter((i2) => i2.t !== "text");
  return {
    page: {
      pageNo: spec.page,
      w: spec.size[0],
      h: spec.size[1],
      meta: {
        kind: spec.kind,
        songs: spec.songs.map((s) => ({ id: s.id, title: s.gtTitle ?? s.titleRun?.text ?? null, first: s.startsHere })),
        pageLabel: spec.footer?.text ?? null
      },
      items: [...others, ...texts]
    },
    filled,
    unread,
    keptOwnSize,
    unreadKeys
  };
}
function shiftDrawPageX(page, dx) {
  if (!dx) return;
  for (const it of page.items) {
    if (it.t === "text") {
      it.xs = it.xs.map((x) => x + dx);
      if (it.box) it.box = { ...it.box, x: it.box.x + dx };
    } else if (it.t === "rect") {
      it.x += dx;
    } else if (it.t === "line") {
      it.x1 += dx;
      it.x2 += dx;
    } else if (it.t === "path") {
      let i2 = 0;
      it.d = it.d.replace(/-?\d*\.?\d+/g, (m2) => i2++ % 2 === 0 ? String(Math.round((Number(m2) + dx) * 100) / 100) : m2);
    }
  }
}
function drawPageStats(p2) {
  const out = {};
  for (const it of p2.items) {
    if (it.t === "text") out[it.role] = (out[it.role] ?? 0) + [...it.text].length;
    else out[it.t] = (out[it.t] ?? 0) + 1;
  }
  return out;
}
const DEFAULTS = {
  gap: -1.2,
  hit: 2,
  miss: -1.5,
  wild: 0.6,
  directMinHit: 0.6,
  absTol: 8,
  relTol: 0.4
};
function alignSeq(gt, dec, opt = {}) {
  const o = { ...DEFAULTS, ...opt };
  const n2 = gt.length;
  const m2 = dec.length;
  if (!n2 || !m2 || Math.abs(n2 - m2) > Math.max(o.absTol, Math.min(n2, m2) * o.relTol)) return null;
  if (n2 === m2) {
    let known = 0;
    let ok = 0;
    for (let t2 = 0; t2 < m2; t2++) {
      if (dec[t2] !== null) {
        known++;
        if (dec[t2] === gt[t2]) ok++;
      }
    }
    if (known === 0 || ok / known >= o.directMinHit) {
      return { pairs: Array.from({ length: m2 }, (_, t2) => ({ i: t2, j: t2 })), direct: true };
    }
  }
  const score = (i22, j22) => {
    const c2 = dec[j22];
    if (c2 === null) return o.wild;
    return c2 === gt[i22] ? o.hit : o.miss;
  };
  const dp = Array.from({ length: n2 + 1 }, () => new Array(m2 + 1).fill(0));
  for (let i22 = 1; i22 <= n2; i22++) dp[i22][0] = i22 * o.gap;
  for (let j22 = 1; j22 <= m2; j22++) dp[0][j22] = j22 * o.gap;
  for (let i22 = 1; i22 <= n2; i22++) {
    for (let j22 = 1; j22 <= m2; j22++) {
      dp[i22][j22] = Math.max(dp[i22 - 1][j22 - 1] + score(i22 - 1, j22 - 1), dp[i22 - 1][j22] + o.gap, dp[i22][j22 - 1] + o.gap);
    }
  }
  const pairs = [];
  let i2 = n2;
  let j2 = m2;
  while (i2 > 0 && j2 > 0) {
    if (dp[i2][j2] === dp[i2 - 1][j2 - 1] + score(i2 - 1, j2 - 1)) {
      pairs.push({ i: i2 - 1, j: j2 - 1 });
      i2--;
      j2--;
    } else if (dp[i2][j2] === dp[i2 - 1][j2] + o.gap) i2--;
    else j2--;
  }
  pairs.reverse();
  return { pairs, direct: false };
}
const UNREAD = "�";
const LATIN_EDGE = /[A-Za-z0-9.,]$/;
const LATIN_HEAD = /^[A-Za-z0-9]/;
function runText(run, ov) {
  if (!run) return "";
  const out = [];
  let prev = null;
  const gaps = [];
  for (let i2 = 1; i2 < run.chars.length; i2++) {
    const a = run.chars[i2 - 1];
    const b = run.chars[i2];
    if (!/[A-Za-z0-9.,]$/.test(a.ch) || !/^[A-Za-z0-9]/.test(b.ch)) continue;
    gaps.push(b.x - (a.x + a.w));
  }
  const medGap = gaps.length >= 4 ? [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)] : 0;
  for (const c2 of run.chars) {
    const text = ov?.(c2.key, c2.ch) ?? (c2.ch === UNREAD ? "" : c2.ch);
    if (!text) continue;
    const digitRun = /[0-9]$/.test(prev?.text ?? "") && /^[0-9]/.test(text);
    if (prev && !digitRun && LATIN_EDGE.test(prev.text) && LATIN_HEAD.test(text)) {
      const gap = c2.x - prev.right;
      const cut = medGap > 0 ? Math.max(medGap * 2.2, Math.max(prev.h, c2.h) * 0.22) : Math.max(prev.h, c2.h) * 0.22;
      if (gap > cut) out.push(" ");
    }
    out.push(text);
    prev = { text, right: c2.x + c2.w, h: c2.h };
  }
  return out.join("").replace(/([0-9A-Za-z])：([0-9A-Za-z])/g, "$1:$2");
}
function runChars(run, ov) {
  return run.chars.map((c2) => ({ ...c2, ch: ov?.(c2.key, c2.ch) ?? (c2.ch === UNREAD ? "" : c2.ch) }));
}
const median = (v2) => v2.length ? [...v2].sort((a, b) => a - b)[Math.floor(v2.length / 2)] : 0;
const bottom = (r4) => r4.y + r4.h;
const right = (r4) => r4.x + r4.w;
function parseKeyMeter(song, page, ov) {
  if (!song.keyMeterRun || !song.id) return null;
  const cs = runChars(song.keyMeterRun, ov).filter((c2) => c2.ch !== "").sort((a, b) => a.x - b.x);
  const raw = cs.map((c2) => c2.ch).join("");
  const isEq = (ch) => ch === "=" || ch === "二";
  const eq = cs.findIndex((c2) => isEq(c2.ch));
  if (eq < 0) return null;
  const open = cs.findIndex((c2) => c2.ch === "(" || c2.ch === "（");
  const eq2 = cs.findIndex((c2, i2) => i2 > eq && isEq(c2.ch));
  const cut = open >= 0 ? open : eq2 >= 0 ? Math.max(eq + 1, eq2 - 1) : cs.length;
  const head = cs.slice(eq + 1, cut);
  let tonic = "";
  for (const c2 of head) {
    if (/[0-9]/.test(c2.ch)) break;
    tonic += c2.ch;
  }
  tonic = tonic.replace(/^b/, "♭").replace(/^#/, "♯").trim();
  const digits = head.filter((c2) => /^[0-9]$/.test(c2.ch));
  let beats = null;
  let beatType = null;
  if (digits.length >= 2) {
    const mid = (Math.min(...digits.map((d2) => d2.y)) + Math.max(...digits.map((d2) => bottom(d2)))) / 2;
    const up = digits.filter((d2) => bottom(d2) <= mid + 0.5).sort((a, b) => a.x - b.x);
    const dn = digits.filter((d2) => bottom(d2) > mid + 0.5).sort((a, b) => a.x - b.x);
    if (up.length && dn.length) {
      beats = Number(up.map((d2) => d2.ch).join(""));
      beatType = Number(dn.map((d2) => d2.ch).join(""));
      if (!(beats >= 1 && beats <= 24 && [1, 2, 4, 8, 16].includes(beatType))) {
        beats = null;
        beatType = null;
      }
    }
  }
  let altTonic = null;
  if (open >= 0 || eq2 >= 0) {
    const tail = cs.slice(open >= 0 ? open + 1 : eq2 - 1);
    const e2 = tail.findIndex((c2) => isEq(c2.ch));
    if (e2 >= 0) {
      altTonic = tail.slice(e2 + 1).map((c2) => c2.ch).join("").replace(/[)）]/g, "").replace(/^b/, "♭").replace(/^#/, "♯").trim();
      const m2 = /^([b#♭♯]?[A-G])/.exec(altTonic.replace("♭", "b").replace("♯", "#"));
      altTonic = m2 ? m2[1].replace(/^b/, "♭").replace(/^#/, "♯") : null;
    }
  }
  if (!tonic) return null;
  return { songId: song.id, tonic, beats, beatType, altTonic: altTonic || null, raw, page };
}
const SECTION_WORDS = /(副歌|间奏|前奏|尾奏|结束句|结束|齐唱|独唱|轮唱|合唱|重唱|末节|反复|尾声)/;
function sectionTokens(run, ov) {
  const cs = runChars(run, ov).sort((a, b) => a.x - b.x);
  const out = [];
  let cur = [];
  const flush = () => {
    if (cur.length) {
      const t2 = cur.map((c2) => c2.ch).join("");
      if (SECTION_WORDS.test(t2)) out.push({ text: t2, x: cur[0].x });
    }
    cur = [];
  };
  for (const c2 of cs) {
    if (/[一-鿿（）()]/.test(c2.ch)) cur.push(c2);
    else flush();
  }
  flush();
  return out;
}
function contains(a, b) {
  const m2 = 2;
  return b.x >= a.x - m2 && b.y >= a.y - m2 && b.x + b.w <= a.x + a.w + m2 && b.y + b.h <= a.y + a.h + m2;
}
function clusterRuleFrames(frames) {
  const rules = frames.filter((f2) => f2.type === "rule-h" || f2.type === "rule-v");
  if (rules.length < 4) return [];
  const parent = rules.map((_, i2) => i2);
  const find = (i2) => parent[i2] === i2 ? i2 : parent[i2] = find(parent[i2]);
  const near = (a, b) => {
    const m2 = 4;
    return a.x - m2 <= b.x + b.w && b.x - m2 <= a.x + a.w && a.y - m2 <= b.y + b.h && b.y - m2 <= a.y + a.h;
  };
  for (let i2 = 0; i2 < rules.length; i2++)
    for (let j2 = i2 + 1; j2 < rules.length; j2++)
      if (near(rules[i2].box, rules[j2].box)) parent[find(i2)] = find(j2);
  const byRoot = /* @__PURE__ */ new Map();
  for (let i2 = 0; i2 < rules.length; i2++) {
    const r4 = find(i2);
    const a = byRoot.get(r4) ?? [];
    a.push(i2);
    byRoot.set(r4, a);
  }
  const out = [];
  for (const idxs of byRoot.values()) {
    if (idxs.length < 4) continue;
    const bs = idxs.map((i2) => rules[i2].box);
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    const w = Math.max(...bs.map((b) => b.x + b.w)) - x;
    const h2 = Math.max(...bs.map((b) => b.y + b.h)) - y;
    if (w < 40 || h2 < 10) continue;
    const ws = idxs.map((i2) => rules[i2].type === "rule-h" ? rules[i2].box.h : rules[i2].box.w).sort((a, b) => a - b);
    const inner = ws[0];
    const outer = ws[ws.length - 1];
    const inners = idxs.filter((i2) => (rules[i2].type === "rule-h" ? rules[i2].box.h : rules[i2].box.w) <= (inner + outer) / 2);
    const gap = inners.length ? Math.max(0, Math.min(...inners.map((i2) => rules[i2].box.y - y)) - outer) : 0;
    out.push({ box: { x, y, w, h: h2 }, outer: r2(outer), inner: r2(inner), gap: r2(gap) });
  }
  return out;
}
const r2 = (v2) => Number(v2.toFixed(2));
function withInlineDashes(spec, lines) {
  const dashes = spec.frames.filter((f2) => f2.type === "rule-h" && f2.box.h <= 1.2 && f2.box.w <= 30);
  if (!dashes.length) return lines;
  return lines.map((l2) => {
    const add = dashes.filter(
      (f2) => f2.box.y > l2.box.y - 2 && bottom(f2.box) < bottom(l2.box) + 2 && f2.box.x > l2.box.x - 2 && right(f2.box) < right(l2.box) + 2 && l2.chars.some((c2) => right(c2) <= f2.box.x + 1) && l2.chars.some((c2) => c2.x >= right(f2.box) - 1)
    );
    if (!add.length) return l2;
    const chars = [
      ...l2.chars,
      ...add.map((f2) => ({
        x: f2.box.x,
        y: f2.box.y,
        w: f2.box.w,
        h: f2.box.h,
        ch: f2.box.w / (l2.size || 1) < 0.95 ? "-" : "—",
        key: ""
        // 没有字形类：`gen-storyocr` 按 `shapeOf.has(key)` 过滤，自然跳过
      }))
    ].sort((a, b) => a.x - b.x);
    return { ...l2, chars };
  });
}
function scoreAnnotationGroups(spec, lineBoxes, ov) {
  if (spec.kind !== "score" || !spec.textLines.length) return [];
  const out = [];
  const taken = /* @__PURE__ */ new Set();
  for (const f2 of lineBoxes) {
    const inside = spec.textLines.filter((l2) => contains(f2.box, l2.box));
    if (!inside.length) continue;
    for (const l2 of inside) taken.add(l2);
    const cjk = (runText({ chars: inside.flatMap((l2) => l2.chars) }, ov).match(/[一-鿿]/g) ?? []).length;
    if (cjk >= 8) out.push({ frame: f2, lines: withInlineDashes(spec, inside) });
  }
  const realText = (t2) => {
    const cjk = t2.match(/[一-鿿]/g) ?? [];
    return cjk.length >= 8 && new Set(cjk).size >= 4;
  };
  const rest = spec.textLines.filter((l2) => !taken.has(l2) && realText(runText(l2, ov)));
  if (rest.length) out.push({ frame: null, lines: withInlineDashes(spec, rest) });
  return out;
}
function groupBoxRows(lines) {
  const chars = lines.flatMap((l2) => l2.chars);
  if (!chars.length) return [];
  const baselines = [...new Set(lines.map((l2) => l2.baselineY))].sort((a, b) => a - b);
  const gaps = [];
  for (let i2 = 1; i2 < baselines.length; i2++) gaps.push(baselines[i2] - baselines[i2 - 1]);
  const pitch = median(gaps.filter((g2) => g2 > 2)) || 12;
  const tol = Math.max(3, pitch * 0.45);
  const body = median(chars.map((c2) => c2.h)) || 1;
  const tall = chars.filter((c2) => c2.h >= body * 0.5);
  const short = chars.filter((c2) => c2.h < body * 0.5);
  const seed = (tall.length ? tall : chars).sort((a, b) => bottom(a) - bottom(b));
  const rows = [];
  for (const c2 of seed) {
    const last = rows[rows.length - 1];
    if (last && bottom(c2) - last.y <= tol) {
      last.items.push(c2);
      last.y = bottom(c2);
    } else rows.push({ y: bottom(c2), items: [c2] });
  }
  if (tall.length)
    for (const c2 of short) {
      const cy2 = c2.y + c2.h / 2;
      let best = rows[0];
      let bestD = Infinity;
      for (const r4 of rows) {
        const top = Math.min(...r4.items.map((it) => it.y));
        const bot = Math.max(...r4.items.map((it) => bottom(it)));
        const d2 = cy2 < top ? top - cy2 : cy2 > bot ? cy2 - bot : 0;
        if (d2 < bestD) {
          bestD = d2;
          best = r4;
        }
      }
      if (best) best.items.push(c2);
    }
  return rows.map((r4) => [...r4.items].sort((a, b) => a.x - b.x));
}
function hbarAsYi(items, ov) {
  const hs = items.map((c2) => c2.h).filter((h2) => h2 > 2).sort((a, b) => a - b);
  const em = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
  if (!em) return items;
  return items.map((c2) => {
    const cur = ov?.(c2.key, c2.ch);
    if (c2.ch !== UNREAD || cur && cur !== "□") return c2;
    const ratio = c2.w / Math.max(c2.h, 0.01);
    if (ratio < 5 || c2.w < em * 0.8 || c2.w > em * 1.25) return c2;
    return { ...c2, ch: "一", key: "" };
  });
}
function regroupBoxLines(lines, ov) {
  return groupBoxRows(lines).map((items) => runText({ chars: hbarAsYi(items, ov) }, ov)).filter((t2) => t2.trim().length >= 2 && !/^[A-Za-z]{1,2}$/.test(t2.trim()));
}
const TOC_ENTRY = /^(\d+)\s*[.、·]?\s*(.*?)[（(](\d+)[)）]\s*$/;
function isTocPage(spec, ov) {
  if (spec.songs.length) return false;
  const lines = spec.textLines.map((l2) => runText(l2, ov));
  const hit = lines.filter((t2) => TOC_ENTRY.test(t2)).length;
  return lines.length >= 8 && hit >= lines.length * 0.5;
}
function isIndexPage(spec, ov) {
  if (spec.songs.length) return false;
  const lines = spec.textLines.map((l2) => runText(l2, ov));
  const hit = lines.filter((t2) => /\d\s*$/.test(t2) && !TOC_ENTRY.test(t2)).length;
  return lines.length >= 10 && hit >= lines.length * 0.6;
}
function parseIndexLine(text) {
  const out = [];
  let i2 = 0;
  const t2 = text.trim();
  while (i2 < t2.length) {
    const head = /^(\d+)\s*画/.exec(t2.slice(i2));
    if (head) {
      out.push({ kind: "heading", text: `${head[1]}画`, songId: null });
      i2 += head[0].length;
      continue;
    }
    if (/^[A-Z]$/.test(t2[i2]) && !/[A-Za-z]/.test(t2[i2 + 1] ?? "")) {
      out.push({ kind: "heading", text: t2[i2], songId: null });
      i2 += 1;
      continue;
    }
    const pair = /^([^\d]+?)(\d{1,3})/.exec(t2.slice(i2));
    if (!pair) break;
    const label = pair[1].trim();
    if (label && !/^(首数)+$/.test(label)) out.push({ kind: "entry", text: label, songId: pair[2].padStart(3, "0") });
    i2 += pair[0].length;
  }
  return out;
}
const TILE_SLOTS = ["top", "bottom", "left", "right", "tl", "tr", "bl", "br"];
function translatePath(d2, dx, dy) {
  let i2 = 0;
  let out = "";
  const num2 = /-?\d*\.?\d+(?:e[-+]?\d+)?/gy;
  while (i2 < d2.length) {
    const c2 = d2[i2];
    if (/[MLCZ]/i.test(c2)) {
      out += c2;
      i2++;
      if (c2.toUpperCase() === "Z") continue;
      const n2 = c2.toUpperCase() === "C" ? 6 : 2;
      const vals = [];
      for (let k2 = 0; k2 < n2; k2++) {
        num2.lastIndex = i2;
        const m2 = num2.exec(d2);
        if (!m2) break;
        vals.push(Number(m2[0]));
        i2 = num2.lastIndex;
        while (d2[i2] === " " || d2[i2] === ",") i2++;
      }
      out += vals.map((v2, k2) => (k2 % 2 === 0 ? v2 + dx : v2 + dy).toFixed(2)).join(" ");
    } else i2++;
  }
  return out;
}
function extractOrnamentTiles(spec, box, noteH) {
  const orn = spec.marks.filter(
    (m2) => m2.cls === "ornament" && m2.d && m2.box.x >= box.x - 1 && m2.box.y >= box.y - 1 && right(m2.box) <= right(box) + 1 && bottom(m2.box) <= bottom(box) + 1
  );
  if (!orn.length) return [];
  const edge = Math.max(noteH * 0.8, Math.min(box.w, box.h) * 0.06);
  const near = noteH * 1.35;
  const slotOf = (b) => {
    const cx2 = b.x + b.w / 2;
    const cy2 = b.y + b.h / 2;
    const atL = cx2 - box.x <= near;
    const atR = right(box) - cx2 <= near;
    const atT = cy2 - box.y <= near;
    const atB = bottom(box) - cy2 <= near;
    if (atT && atL) return "tl";
    if (atT && atR) return "tr";
    if (atB && atL) return "bl";
    if (atB && atR) return "br";
    const dT = cy2 - box.y;
    const dB = bottom(box) - cy2;
    const dL = cx2 - box.x;
    const dR = right(box) - cx2;
    const mn = Math.min(dT, dB, dL, dR);
    if (mn > edge) return null;
    return mn === dT ? "top" : mn === dB ? "bottom" : mn === dL ? "left" : "right";
  };
  const bySlot = /* @__PURE__ */ new Map();
  for (const m2 of orn) {
    const s = slotOf(m2.box);
    if (!s) continue;
    const a = bySlot.get(s) ?? [];
    a.push({ box: m2.box, d: m2.d });
    bySlot.set(s, a);
  }
  const out = [];
  for (const slot of TILE_SLOTS) {
    const a = bySlot.get(slot);
    if (!a?.length) continue;
    const tally = /* @__PURE__ */ new Map();
    for (const m2 of a) {
      const k2 = translatePath(m2.d, -m2.box.x, -m2.box.y);
      const e = tally.get(k2);
      if (e) e.n++;
      else tally.set(k2, { n: 1, box: m2.box });
    }
    const [path, rep] = [...tally].sort((x, y) => y[1].n - x[1].n)[0];
    const horiz = slot === "top" || slot === "bottom";
    const corner = slot.length === 2;
    let pitch = 0;
    if (!corner) {
      const pos = a.map((m2) => horiz ? m2.box.x : m2.box.y).sort((p2, q2) => p2 - q2);
      const gaps = [];
      for (let i2 = 1; i2 < pos.length; i2++) gaps.push(pos[i2] - pos[i2 - 1]);
      pitch = median(gaps) || (horiz ? rep.box.w : rep.box.h);
    }
    let ox = 0;
    let oy = 0;
    if (corner) {
      ox = rep.box.x - (slot[1] === "l" ? box.x : right(box) - rep.box.w);
      oy = rep.box.y - (slot[0] === "t" ? box.y : bottom(box) - rep.box.h);
    }
    out.push({
      style: "",
      slot,
      w: Number(rep.box.w.toFixed(3)),
      h: Number(rep.box.h.toFixed(3)),
      pitch: Number(pitch.toFixed(3)),
      ox: Number(ox.toFixed(3)),
      oy: Number(oy.toFixed(3)),
      path
    });
  }
  const id = hashHex(out.map((t2) => `${t2.slot}:${t2.path}`).join("|"));
  for (const t2 of out) t2.style = id;
  return out;
}
function edgeMask(tiles) {
  const has = new Set(tiles.map((t2) => t2.slot));
  return (has.has("top") ? "T" : "") + (has.has("bottom") ? "B" : "") + (has.has("left") ? "L" : "") + (has.has("right") ? "R" : "");
}
function ownerAbove(spec, y) {
  const above = spec.songs.filter((s) => s.yFrom <= y).sort((a, b) => b.yFrom - a.yFrom)[0];
  return above?.id ?? spec.songs[spec.songs.length - 1]?.id ?? null;
}
function hashHex(s) {
  let a = 5381;
  let b = 0;
  for (let i2 = 0; i2 < s.length; i2++) {
    const c2 = s.charCodeAt(i2);
    a = a * 33 ^ c2;
    b = c2 + (b << 6) + (b << 16) - b | 0;
  }
  return ((a >>> 0).toString(36) + "-" + (b >>> 0).toString(36)).slice(0, 14);
}
function buildBookMeta(specs, opt = {}) {
  const ov = opt.override;
  const noteH = opt.noteH ?? 8.3;
  const meta = {
    keyMeters: [],
    sectionWords: [],
    annotations: [],
    toc: [],
    index: [],
    front: [],
    pageLabels: [],
    ornaments: [],
    problems: []
  };
  for (const s of specs) {
    const label = runText(s.footer, ov);
    const m2 = /(\d+)/.exec(label);
    meta.pageLabels.push({ page: s.page, label, no: m2 ? Number(m2[1]) : null, kind: s.kind });
  }
  const noteBase = /* @__PURE__ */ new Map();
  const measBase = /* @__PURE__ */ new Map();
  for (const spec of specs) {
    for (const song of spec.songs) {
      if (!song.id) continue;
      if (song.keyMeterRun) {
        const km = parseKeyMeter(song, spec.page, ov);
        if (km) meta.keyMeters.push(km);
        else meta.problems.push(`p${spec.page} ${song.id}：调号拍号解析不出「${runText(song.keyMeterRun, ov)}」`);
      }
      let nOrd = noteBase.get(song.id) ?? 0;
      let nMeas = measBase.get(song.id) ?? 0;
      for (const sys of song.systems) {
        const notes = sys.notes.filter((n2) => /^[0-9]$/.test(ov?.(n2.key, n2.ch) ?? n2.ch)).sort((a, b) => a.x - b.x);
        for (const line of sys.chordLines) {
          for (const tok of sectionTokens(line, ov)) {
            let idx = notes.findIndex((n2) => n2.x + n2.w / 2 >= tok.x);
            if (idx < 0) idx = Math.max(0, notes.length - 1);
            const meas = sys.barlineXs.filter((x) => x < tok.x).length;
            meta.sectionWords.push({
              songId: song.id,
              text: tok.text,
              noteOrdinal: nOrd + idx,
              measureIndex: nMeas + meas,
              systemIndex: sys.index,
              page: spec.page
            });
          }
        }
        nOrd += notes.length;
        nMeas += sys.barlineXs.length;
      }
      noteBase.set(song.id, nOrd);
      measBase.set(song.id, nMeas);
    }
    const lineBoxes = clusterRuleFrames(spec.frames);
    for (const box of spec.storyBoxes) {
      const owner = ownerAbove(spec, box.box.y);
      const text = regroupBoxLines(box.lines, ov).join("\n");
      if (text.replace(/\s/g, "").length < 4) continue;
      const hs = box.lines.flatMap((l2) => l2.chars.map((c2) => c2.h)).filter((h2) => h2 > 2);
      const tiles = extractOrnamentTiles(spec, box.box, noteH);
      if (tiles.length) meta.ornaments.push(...tiles);
      meta.annotations.push({
        songId: owner,
        framed: true,
        frame: "tile",
        size: Number(median(hs).toFixed(2)),
        text,
        box: box.box,
        page: spec.page,
        ...tiles.length ? { frameStyle: tiles[0].style, frameEdges: edgeMask(tiles) } : {}
      });
    }
    for (const grp of scoreAnnotationGroups(spec, lineBoxes, ov)) {
      const lines = regroupBoxLines(grp.lines, ov);
      const text = lines.join("\n");
      const chars = grp.lines.flatMap((l2) => l2.chars);
      const x = Math.min(...chars.map((c2) => c2.x));
      const y = Math.min(...chars.map((c2) => c2.y));
      const textBox = {
        x,
        y,
        w: Math.max(...chars.map((c2) => c2.x + c2.w)) - x,
        h: Math.max(...chars.map((c2) => c2.y + c2.h)) - y
      };
      const lf = grp.frame;
      meta.annotations.push({
        songId: ownerAbove(spec, y),
        framed: false,
        frame: lf ? "line" : "none",
        ...lf ? { frameOuterWidth: lf.outer, frameInnerWidth: lf.inner, frameGap: lf.gap } : {},
        size: Number(median(chars.map((c2) => c2.h).filter((h2) => h2 > 2)).toFixed(2)),
        text,
        box: lf ? lf.box : textBox,
        page: spec.page
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  meta.ornaments = meta.ornaments.filter((t2) => {
    const k2 = `${t2.style}/${t2.slot}`;
    if (seen.has(k2)) return false;
    seen.add(k2);
    return true;
  });
  let tocSeq = 0;
  let idxSeq = 0;
  let indexName = "title";
  for (const spec of specs) {
    if (isTocPage(spec, ov)) {
      const entrySizes = spec.textLines.filter((l2) => /[（(]\d+[)）]\s*$/.test(runText(l2, ov).trim())).map((l2) => l2.size);
      const headingCut = Math.max(9.8, (median(entrySizes) || 8) * 1.15);
      for (const line of spec.textLines) {
        const text = runText(line, ov).trim();
        if (!text) continue;
        const m2 = TOC_ENTRY.exec(text);
        const tail = /[（(](\d+)[)）]\s*$/.exec(text);
        if (m2 || tail) {
          meta.toc.push({
            seq: tocSeq++,
            kind: "entry",
            text: (m2 ? m2[2] : text.replace(/[（(]\d+[)）]\s*$/, "")).trim(),
            songId: m2 ? m2[1].padStart(3, "0") : null,
            printedPage: Number(m2 ? m2[3] : tail[1]),
            page: spec.page
          });
          if (!m2) meta.problems.push(`目录 p${spec.page}「${text}」曲号没读出来`);
          continue;
        }
        const cjk = (text.match(/[一-鿿]/g) ?? []).length;
        if (cjk >= 2 && !/\d/.test(text) && line.size >= headingCut && line.size < 16) {
          meta.toc.push({
            seq: tocSeq++,
            kind: line.size >= 12.5 ? "category" : "subcategory",
            text,
            songId: null,
            printedPage: null,
            page: spec.page
          });
        } else meta.problems.push(`目录 p${spec.page} 认不出的行「${text}」`);
      }
      continue;
    }
    if (isIndexPage(spec, ov)) {
      for (const line of spec.textLines) {
        const text = runText(line, ov).trim();
        if (!text) continue;
        if (line.size >= 14) {
          indexName = /首句/.test(text) ? "firstline" : "title";
          continue;
        }
        for (const r4 of parseIndexLine(text))
          meta.index.push({ seq: idxSeq++, kind: r4.kind, indexName, text: r4.text, songId: r4.songId, page: spec.page });
      }
      continue;
    }
    if (spec.kind === "front-matter" && spec.textLines.length) {
      const musicMarks = spec.marks.filter((m2) => m2.cls === "barline" || m2.cls === "divLine" || m2.cls === "augmentLine").length;
      if (musicMarks >= 5) {
        meta.problems.push(`前置页 p${spec.page} 带谱（记号 ${musicMarks}），不当前言正文收`);
        continue;
      }
      const rows = spec.textLines.map((l2) => ({ t: runText(l2, ov).trim(), size: l2.size })).filter((r4) => r4.t);
      if (!rows.length) continue;
      const big = [...rows].sort((a, b) => b.size - a.size)[0];
      const divider = rows.length <= 3;
      const all = rows.map((r4) => r4.t).join("");
      const cjkRatio = (all.match(/[一-鿿]/g) ?? []).length / Math.max(1, all.length);
      if (!divider && cjkRatio < 0.5) {
        meta.problems.push(`前置页 p${spec.page} 汉字只占 ${(cjkRatio * 100).toFixed(0)}%，多半是音符索引，不当前言正文收`);
        continue;
      }
      meta.front.push({
        page: spec.page,
        kind: divider ? "divider" : "prose",
        title: divider ? rows.map((r4) => r4.t).join("") : big.t,
        body: divider ? "" : rows.filter((r4) => r4 !== big).map((r4) => r4.t).join("\n"),
        note: spec.frames.some((f2) => f2.type === "image") ? "整页位图" : null
      });
    }
  }
  for (const row of meta.index)
    if (row.kind === "entry" && !row.songId) meta.problems.push(`索引 p${row.page}「${row.text}」没读出曲号`);
  return meta;
}
function textItem(text, role, size, x, y, align = "left") {
  return { t: "text", y, text, size, role, align, xs: [x], box: { x, w: 0 } };
}
const KEY_ACC_SIZE = 0.72;
const KEY_ACC_RISE = 0.466;
function keyMeterItems(style, km, x, baseline, measure, size) {
  const sz = size ?? style.roles.keyMeter.size;
  const em = style.roles.keyMeter.size;
  const items = [];
  const putTonic = (prefix, tonic, suffix, x0) => {
    const acc = /^([♭♯])(.+)$/.exec(tonic);
    if (!acc) {
      const t2 = `${prefix}${tonic}${suffix}`;
      items.push(textItem(t2, "keyMeter", sz, x0, baseline));
      return measure("keyMeter", t2, sz);
    }
    let cur = x0;
    if (prefix) {
      items.push(textItem(prefix, "keyMeter", sz, cur, baseline));
      cur += measure("keyMeter", prefix, sz);
    }
    const accSz = sz * KEY_ACC_SIZE;
    const accCh = acc[1] === "♯" ? "#" : acc[1] === "♭" ? "b" : acc[1];
    items.push(textItem(accCh, "keyMeter", accSz, cur, baseline - em * KEY_ACC_RISE));
    cur += measure("keyMeter", accCh, accSz) * 1.05;
    const tail = `${acc[2]}${suffix}`;
    items.push(textItem(tail, "keyMeter", sz, cur, baseline));
    cur += measure("keyMeter", tail, sz);
    return cur - x0;
  };
  let cx2 = x + putTonic("1=", km.tonic, "", x) + em * 0.25;
  if (km.beats && km.beatType) {
    const ruleW = em * 1.02;
    const top = String(km.beats);
    const bot = String(km.beatType);
    const mid = cx2 + ruleW / 2;
    items.push(textItem(top, "keyMeter", sz, mid - measure("keyMeter", top, sz) / 2, baseline - em * 0.439));
    items.push(textItem(bot, "keyMeter", sz, mid - measure("keyMeter", bot, sz) / 2, baseline + em * 0.662));
    items.push({ t: "rect", x: cx2, y: baseline - em * 0.23, w: ruleW, h: 0.3, fill: 0 });
    cx2 += ruleW + em * 0.216;
  }
  if (km.altTonic) putTonic("(1=", km.altTonic, ")", cx2);
  return items;
}
function ornamentFramePath(tiles, box, edges = "TBLR") {
  const at = (s) => tiles.find((t2) => t2.slot === s);
  const parts = [];
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const corner = (s, cx2, cy2) => {
    const t2 = at(s);
    if (!t2) return null;
    parts.push(translatePath(t2.path, cx2 + t2.ox, cy2 + t2.oy));
    return t2;
  };
  const tl = corner("tl", box.x, box.y);
  const tr = corner("tr", x1 - (at("tr")?.w ?? 0), box.y);
  const bl = corner("bl", box.x, y1 - (at("bl")?.h ?? 0));
  const br = corner("br", x1 - (at("br")?.w ?? 0), y1 - (at("br")?.h ?? 0));
  const run = (t2, from, to, place) => {
    if (!t2) return;
    const size = t2.slot === "top" || t2.slot === "bottom" ? t2.w : t2.h;
    const span = to - from - size;
    if (span <= 0) {
      place(from);
      return;
    }
    const pitch = t2.pitch > 0.01 ? t2.pitch : size;
    const n2 = Math.max(1, Math.round(span / pitch));
    const step = span / n2;
    for (let i2 = 0; i2 <= n2; i2++) place(from + i2 * step);
  };
  const lx = box.x + (tl?.w ?? bl?.w ?? 0);
  const rx = x1 - (tr?.w ?? br?.w ?? 0);
  const ty = box.y + (tl?.h ?? tr?.h ?? 0);
  const by = y1 - (bl?.h ?? br?.h ?? 0);
  if (edges.includes("T")) run(at("top"), lx, rx, (p2) => parts.push(translatePath(at("top").path, p2, box.y)));
  if (edges.includes("B")) run(at("bottom"), lx, rx, (p2) => parts.push(translatePath(at("bottom").path, p2, y1 - at("bottom").h)));
  if (edges.includes("L")) run(at("left"), ty, by, (p2) => parts.push(translatePath(at("left").path, box.x, p2)));
  if (edges.includes("R")) run(at("right"), ty, by, (p2) => parts.push(translatePath(at("right").path, x1 - at("right").w, p2)));
  return parts.join("");
}
function wrapText(text, role, size, width, measure) {
  const out = [];
  let line = "";
  let w = 0;
  for (const ch of [...text.replace(/\s+/g, " ")]) {
    const cw = measure(role, ch, size);
    if (w + cw > width && line) {
      if (NO_LINE_START.test(ch)) {
        out.push(line + ch);
        line = "";
        w = 0;
        continue;
      }
      out.push(line);
      line = "";
      w = 0;
    }
    line += ch;
    w += cw;
  }
  if (line) out.push(line);
  return out;
}
const r3 = (v2) => v2.toFixed(2);
function annotationBlock(style, o) {
  const size = o.size ?? style.roles.story.size;
  const thick = (a, b, dim) => Math.max(o.tiles.find((t2) => t2.slot === a)?.[dim] ?? 0, o.tiles.find((t2) => t2.slot === b)?.[dim] ?? 0);
  const tileY = thick("top", "bottom", "h");
  const tileX = thick("left", "right", "w");
  const isLine2 = o.frame === "line";
  const lineEdge = isLine2 ? (o.frameOuter ?? 1.5) + (o.frameGap ?? 1.7) + (o.frameInner ?? 0.4) : 0;
  const padX = isLine2 ? lineEdge + size * 0.6 : o.framed ? tileX + size * 0.6 : 0;
  const padY = isLine2 ? lineEdge + size * 0.5 : o.framed ? tileY + size * 0.5 : 0;
  const innerW = o.right - o.left - padX * 2;
  const flat = o.text.replace(/(.)\r?\n(.)/gs, (_m, a, b) => /[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(b) ? `${a} ${b}` : `${a}${b}`).replace(/\r?\n/g, "");
  const lines = wrapText(flat, "story", size, innerW, o.measure).filter((l2) => l2.trim());
  const items = [];
  const textTop = o.top + padY;
  lines.forEach((l2, i2) => items.push(textItem(l2, "story", size, o.left + padX, textTop + size + i2 * o.lineGap)));
  const height = padY * 2 + size + Math.max(0, lines.length - 1) * o.lineGap + (padY > 0 ? 0 : size * 0.25);
  if (o.framed && o.tiles.length) {
    const box = { x: o.left, y: o.top, w: o.right - o.left, h: height };
    const d2 = ornamentFramePath(o.tiles, box, o.frameEdges ?? "TBLR");
    if (d2) items.unshift({ t: "path", d: d2, fill: 0 });
  } else if (isLine2) {
    const ow = o.frameOuter ?? 1.5;
    const iw = o.frameInner ?? 0.4;
    const gap = o.frameGap ?? 1.7;
    const rect = (x, y, w2, h2, lw) => `M${r3(x)} ${r3(y)}h${r3(w2)}v${r3(h2)}h${r3(-w2)}ZM${r3(x + lw)} ${r3(y + lw)}v${r3(h2 - lw * 2)}h${r3(w2 - lw * 2)}v${r3(-(h2 - lw * 2))}Z`;
    const w = o.right - o.left;
    const outer = rect(o.left, o.top, w, height, ow);
    const inset = ow + gap;
    const inner = rect(o.left + inset, o.top + inset, w - inset * 2, height - inset * 2, iw);
    items.unshift({ t: "path", d: `${outer} ${inner}`, fill: 0 });
  }
  return { items, height };
}
function tocPages(style, items, o) {
  const t2 = style.toc;
  const sizeOf = (r22) => o.sizes?.[r22] ?? style.roles[r22].size;
  const size = sizeOf("toc");
  const pages = [];
  let cur = null;
  let y = 0;
  let pageNo = o.startPageNo;
  const bottomLimit = style.titleBlock.footerBaseline - style.roles.footer.size * 1.1;
  const start = (withTitle) => {
    cur = [];
    y = t2.firstBaseline;
    if (withTitle && o.title) {
      cur.push(textItem(o.title, "frontTitle", style.roles.frontTitle.size, (t2.left + t2.right) / 2, t2.titleBaseline, "center"));
    }
  };
  const flush = () => {
    if (!cur || !cur.length) return;
    pages.push({ pageNo: pageNo++, w: style.page.w, h: style.page.h, meta: { kind: "toc", songs: [] }, items: cur });
    cur = null;
  };
  const room = (need) => y + need <= bottomLimit;
  start(true);
  for (const it of items) {
    if (it.kind !== "entry") {
      const role = it.kind === "category" ? "tocHeading" : "tocSub";
      const hs = sizeOf(role);
      const above = t2.headingGapAbove && t2.headingGapAbove > 0 ? t2.headingGapAbove : t2.lineGap * 0.6 + hs;
      const below = t2.headingGapBelow && t2.headingGapBelow > 0 ? t2.headingGapBelow : hs + t2.lineGap * 0.5;
      if (!room(above + below)) {
        flush();
        start(false);
      } else y += above - t2.lineGap - hs;
      cur.push(textItem(it.text, role, hs, (t2.left + t2.right) / 2, y + hs, "center"));
      y += hs + below;
      continue;
    }
    if (!room(t2.lineGap)) {
      flush();
      start(false);
    }
    const no = `${Number(it.songNo.replace(/^0+/, "")) || it.songNo}.`;
    const page = `(${it.page})`;
    const headText = `${no}${it.title}`;
    const headW = o.measure("toc", headText, size);
    const pageW = o.measure("toc", page, size);
    cur.push(textItem(headText, "toc", size, t2.left, y));
    cur.push(textItem(page, "toc", size, t2.right, y, "right"));
    const gap = t2.right - pageW - (t2.left + headW) - size;
    const dotW = o.measure("toc", t2.leader, size) || size;
    const n2 = Math.floor(gap / dotW);
    if (n2 > 0) cur.push(textItem(t2.leader.repeat(n2), "toc", size, t2.left + headW + size * 0.5, y));
    y += t2.lineGap;
  }
  flush();
  return pages;
}
function indexPages(style, items, o) {
  const t2 = style.toc;
  const sizeOf = (r22) => o.sizes?.[r22] ?? style.roles[r22].size;
  const size = sizeOf("toc");
  const cols = Math.max(1, t2.indexColumns);
  const colW = (t2.right - t2.left) / cols;
  const bottomLimit = style.titleBlock.footerBaseline - style.roles.footer.size * 1.1;
  const rowsPerCol = Math.max(1, Math.floor((bottomLimit - t2.indexFirstBaseline) / t2.indexLineGap) + 1);
  const perPage = rowsPerCol * cols;
  const pages = [];
  let pageNo = o.startPageNo;
  for (let i2 = 0; i2 < items.length; i2 += perPage) {
    const chunk = items.slice(i2, i2 + perPage);
    const draw = [];
    if (i2 === 0 && o.title)
      draw.push(textItem(o.title, "frontTitle", sizeOf("frontTitle"), (t2.left + t2.right) / 2, t2.titleBaseline, "center"));
    chunk.forEach((it, k2) => {
      const col = Math.floor(k2 / rowsPerCol);
      const row = k2 % rowsPerCol;
      const x = t2.left + col * colW;
      const y = t2.indexFirstBaseline + row * t2.indexLineGap;
      if (it.kind === "heading") {
        draw.push(textItem(it.text, "tocSub", size * 1.15, x + colW / 2, y, "center"));
        return;
      }
      const no = it.songNo ? String(Number(it.songNo.replace(/^0+/, "")) || it.songNo) : "";
      const noW = o.measure("toc", no, size);
      let text = it.text;
      while (text.length > 1 && o.measure("toc", text, size) > colW - noW - size * 0.8) text = text.slice(0, -1);
      draw.push(textItem(text, "toc", size, x, y));
      if (no) draw.push(textItem(no, "toc", size, x + colW - size * 0.3, y, "right"));
    });
    pages.push({ pageNo: pageNo++, w: style.page.w, h: style.page.h, meta: { kind: "index", songs: [] }, items: draw });
  }
  return pages;
}
function frontPages(style, specs, o) {
  const t2 = style.toc;
  const pages = [];
  let pageNo = o.startPageNo;
  for (const f2 of specs) {
    const items = [];
    const m2 = pageMargins(style, pageNo);
    const left = m2.left;
    const right2 = style.page.w - m2.right;
    if (f2.kind === "divider") {
      const size = style.roles.frontTitle.size * 2.4;
      items.push(textItem(f2.title, "frontTitle", size, (left + right2) / 2, style.page.h * 0.42, "center"));
    } else {
      items.push(textItem(f2.title, "frontTitle", style.roles.frontTitle.size, (left + right2) / 2, t2.titleBaseline, "center"));
      const size = style.roles.story.size * 1.2;
      const gap = size * 1.6;
      let y = t2.firstBaseline + gap;
      for (const para of f2.body.split("\n")) {
        for (const line of wrapText(para, "story", size, right2 - left, o.measure)) {
          items.push(textItem(line, "story", size, left, y));
          y += gap;
        }
      }
    }
    pages.push({ pageNo: pageNo++, w: style.page.w, h: style.page.h, meta: { kind: "front-matter", songs: [] }, items });
  }
  return pages;
}
function placedToDrawItems(placed) {
  return placed.map((p2) => p2.kind === "raw" ? p2.item : textItem(p2.text, p2.role, p2.size, p2.x, p2.y, p2.align));
}
function keyMeterComponent(style, measure, km, pageItems, size) {
  return ({ x, y, cell }) => {
    if (!km) return [];
    const items = keyMeterItems(style, km, x, y, measure, size);
    if (!cell.props.avoid) return items;
    const av = parseAvoid(cell.props.avoid);
    const boxOf2 = (it) => {
      const x0 = it.t === "rect" ? it.x : it.t === "text" ? it.xs?.[0] ?? it.box?.x ?? 0 : 0;
      const w = it.t === "rect" ? it.w : it.t === "text" ? measure(it.role, it.text, it.size) : 0;
      const top = it.t === "rect" ? it.y : it.t === "text" ? it.y - it.size * 0.72 : 0;
      const bot = it.t === "rect" ? it.y + it.h : it.t === "text" ? it.y : 0;
      return { x0, x1: x0 + w, top, bot };
    };
    const kmBoxes = items.map(boxOf2);
    const kmBot = Math.max(...kmBoxes.map((b) => b.bot));
    let need = 0;
    for (const it of pageItems) {
      if (it.t !== "text" || !av.roles.has(it.role)) continue;
      const x0 = it.xs?.[0] ?? 0;
      const x1 = x0 + measure(it.role, it.text, it.size);
      const top = it.y - it.size * 0.72;
      if (top < y || top > y + av.scan) continue;
      if (top > kmBot || !kmBoxes.some((b) => b.x1 > x0 && b.x0 < x1 && b.bot > top)) continue;
      need = Math.max(need, kmBot - top + av.gap);
    }
    for (const it of items) if ("y" in it) it.y -= need;
    return items;
  };
}
function applyManifestSong(song, entry) {
  if (entry.title !== void 0) song.work.title = entry.title;
  if (entry.number !== void 0) song.work.number = entry.number;
  if (entry.creators !== void 0 || entry.rights !== void 0) {
    const id = song.identification ??= { creators: [] };
    if (entry.creators !== void 0) id.creators = entry.creators.map((c2) => ({ ...c2 }));
    if (entry.rights !== void 0) id.rights = entry.rights;
  }
  const meta = overlayMeta(song.meta, entry.meta);
  if (meta) song.meta = meta;
}
function parseManifest(text) {
  const m2 = JSON.parse(text);
  if (!m2 || typeof m2 !== "object" || !Array.isArray(m2.songs) || typeof m2.style !== "string") {
    throw new Error("book.json 至少要有 style 与 songs");
  }
  for (const [i2, s] of m2.songs.entries()) {
    if (typeof s.file !== "string") throw new Error(`book.json songs[${i2}] 缺 file`);
  }
  return m2;
}
export {
  Bar,
  Beam,
  CHORD_TOKEN_RE,
  CLUSTER_DIST,
  CLUSTER_SIZE,
  ContourLedger,
  DRAW_CLOSE,
  DRAW_CUBIC,
  DRAW_LINE,
  DRAW_MOVE,
  DRAW_QUAD,
  DYNAMIC_NAME,
  FILTERS,
  GlyphIndex,
  HALFTONE_BAND,
  HALFTONE_RATIO,
  H as HANG_PUNCT,
  INK_SAMPLE,
  LATIN_MIN_CHAINED,
  LEVEL_MIN,
  LONG_IMAGE_WIDTH,
  L as LYRIC_SPLIT_PUNCT,
  MASK_FONT,
  M as META_KEYS,
  c as MIXED_PUNCT,
  NO_LINE_START,
  ORIGINAL_PAPERS,
  PAGE_RATIOS,
  PAPER_DEFAULT,
  PAPER_SIZES,
  PINHOLE_RATIO,
  PObj,
  PPTX_PAGE,
  P as PUNCT_PAIR_GAP,
  d as PU_LYRIC_PUNCTUATION,
  f as PU_LYRIC_QUOTES,
  Part,
  QUANT,
  RASTER_FONT,
  RASTER_TEXT_FONT,
  REGION_NAMES,
  RasterGlyphBuilder,
  RasterGlyphLookup,
  SIG_N,
  SLOTS,
  SMUFL_NAMES,
  SPECK_TILE,
  SPage,
  SSystem,
  STAFF_LONG_IMAGE_WIDTH,
  STAFF_PAPER_DEFAULT,
  STEP_LETTERS$1 as STEP_LETTERS,
  STYLE_ROLES,
  ScoreStaff,
  Seg,
  SlurTie,
  SsError,
  Staff,
  StaffGlyphBuilder,
  StaffGlyphLookup,
  Stem,
  Sym,
  TEMPLATE_DIST,
  TEMPLATE_ROLES,
  THEMES,
  TILE_SLOTS,
  TIME_DENOMINATORS,
  TIME_NUMERATORS,
  TextGlyphBuilder,
  TextGlyphLookup,
  accidentalAlter,
  alignSeq,
  allAxisAligned,
  analyzeText,
  annotationBlock,
  applyManifestSong,
  applyManual,
  applyOctaveShifts,
  applyTrackWarp,
  applyTuplet,
  archCavity,
  armOf,
  attachDynamicTexts,
  attachDynamics,
  attachHarmonies,
  attachLyrics,
  attachNotations,
  attachSlurs,
  attachVoltas,
  attachWedges,
  attachWordLines,
  beamY,
  between$1 as between,
  binSig,
  binToPgm,
  blobImage,
  blockPunct,
  bookStyleOf,
  bootstrapByTable,
  bootstrapClefs,
  bootstrapKeyAccidentals,
  boxCx,
  boxCy,
  boxH,
  boxOf,
  boxUnion,
  boxW,
  buildBookMeta,
  buildClasses,
  buildLyricLines,
  buildNotes,
  buildPage,
  buildPageSpec,
  buildRasterPage,
  buildScore,
  buildStems,
  calcAlters,
  calcBeamLevels,
  checkBars,
  chordLineRole,
  classId,
  classifyPage,
  clefMiddleStep,
  clefXml,
  clusterBySize,
  clusterRuleFrames,
  collectGlyphStats,
  collectMetricSamples,
  collectRoleSamples,
  columnHits,
  columnStaffTracks,
  completeStaffBars,
  completeStaffLines,
  componentsFromVector,
  g as compressRun,
  computeStyle,
  computeStyleForPaper,
  concatObjects,
  connectedComponents,
  h as creatorOf,
  i as creatorTypeOf,
  cutJianpuStrip,
  decodeSig,
  defaultBookStyle,
  defaultFonts,
  descreenMorph,
  deskew,
  detectProfile,
  dewarpPage,
  diffRate,
  drawOpArity,
  drawPageStats,
  dropSpecks,
  edgeMask,
  emToPt,
  emptySheet,
  encodeSig,
  eraseInBand,
  estimateUnit,
  evalBool,
  evalExpr,
  evalNum,
  expandText,
  extendVSegs,
  extractOrnamentTiles,
  extractTextPage,
  extractVectorPage,
  fillPinholes,
  findBarlines,
  findBeams,
  findBlobs,
  findBraces,
  findClefKeyTime,
  findHarmonyStrips,
  findHoles,
  findJianpuBands,
  findLegers,
  findLyricRows,
  findNotations,
  findNoteheads,
  findOctaveShifts,
  findPrimitives,
  findRasterDashedSlurs,
  findRasterHeads,
  findRasterSlurs,
  findRasterWedges,
  findSlurs,
  findStaffForNote,
  findStaffLabels,
  findStaffLines,
  findStaves,
  findStems,
  findSymbols,
  findTails,
  findTuplets,
  findVoltas,
  findWedges,
  findWordStrips,
  flagLevel,
  flagUp,
  flatGlyphs,
  foldLyricChars,
  fontOf,
  fontTally,
  frontPages,
  fuseJianpu,
  fuzzyFill,
  glyphClassKey,
  glyphSig,
  groupBoxRows,
  groupByLeftInk,
  groupDynamics,
  groupLines,
  groupStaves,
  guessByCode,
  halftoneRatio,
  j as hangTrim,
  harmonyKey,
  harmonyLine,
  hasCurve,
  k as headTrim,
  headsBetweenStemPairs,
  headsOnBareStems,
  hollowHeadsAlongStems,
  hollowHeadsByPitch,
  hollowHeadsFromCavities,
  hollowHeadsFromHoles,
  hollowHeadsOnLedgers,
  hollowSlit,
  indexPages,
  inferBookStyle,
  inferTocRule,
  inkColumn,
  inkRatio,
  inkSampleOf,
  intersectRect,
  isAccidental,
  isClef,
  isDashed,
  isFill,
  isFlag,
  isGlyphLike,
  isHLine,
  isIndexPage,
  isLatinRow,
  isLeadNoteBarline,
  isLine,
  l as isLyricCjk,
  m as isLyricOpenQuote,
  n as isLyricTrailingPunct,
  isNoteHead,
  isPagedSheet,
  isPaper,
  isPitchedHead,
  isPolyline,
  isRect,
  isRest,
  isSmuflName,
  isStroke,
  isTimeSig,
  isTocPage,
  isVLine,
  isVectorPdf,
  isWhite,
  jianpuKey,
  joinVSegs,
  judgeHeadBox,
  keepWordLine,
  keyFifths,
  keyMeterComponent,
  keyMeterItems,
  labelKey,
  lastTimeSignature,
  latinCells,
  layoutRegion,
  ledgerGrid,
  localLineModel,
  looksLikeStaff,
  lyricHeightOf,
  makeBars,
  makeLookup,
  makeSymObj,
  makeSysBracketObj,
  makeSystems,
  makeTextObj,
  mapCharsToCells,
  markLyricExtends,
  markSlurNotes,
  markSplitBars,
  maskSignature,
  matApplyX,
  matApplyY,
  matMul,
  matScale,
  matchTemplate,
  mergeArcHalves,
  mergeHoles,
  mergeStyle,
  mergeTwins,
  musicFamily,
  normalizeLabel,
  noteHeightOf,
  noteType,
  objText,
  objToSvg,
  opsNames,
  ornamentFramePath,
  outlineTemplates,
  outlineToPath,
  overlapX,
  overlapY,
  pageMargins,
  p as pairTrim,
  q as pairTrimIn,
  r as pairTrimPx,
  parseAvoid,
  parseIndexLine,
  parseInterp,
  parseKeyMeter,
  parseManifest,
  parseSs,
  pathBoundsRaw,
  pathPoint,
  pathPoints,
  pathStats,
  pinholeRatio,
  pitchPos,
  pitchY,
  placedToDrawItems,
  pointOnLine,
  printBookSs,
  printExpr,
  printSs,
  probeBareStems,
  t as punctClass,
  pushSeg,
  rasterizePage,
  readHarmonyStrip,
  recognizeRasterPage,
  recognizeRasterSong,
  recognizeStaffPage,
  reconnectSlurs,
  rectsOverlap,
  regroupBoxLines,
  removeStaffLines,
  removeWhite,
  residualCurves,
  restDuration,
  roleFontDefaults,
  roleOf,
  ruleMatches,
  runChars,
  runText,
  sameToken,
  sanitizeLayer,
  scoreAnnotationGroups,
  scoreToMusicXml,
  settleLyricVerses,
  shapeKey,
  shapeSig,
  shiftDrawPageX,
  sigDistance,
  sigToPath,
  songFields,
  sortByLeft,
  sortByTop,
  spaceWordText,
  specToDrawPage,
  speckTiles,
  splitMixedChars,
  splitSyllables,
  staffGroupCount,
  staffOmrOptions,
  stemWalledCavity,
  stepToPitch,
  stripKey,
  stripOf,
  stripSubsetPrefix,
  stripWithout,
  strokeWidth,
  subPaths,
  summarize,
  systemGroups,
  tagSystemBarlines,
  textClassId,
  textItem,
  themeOfMode,
  thinRectAxis,
  timeDigit,
  timeKey,
  timeSigDigit,
  timeSignature,
  timeSignatures,
  timeStripOf,
  toMusicXml,
  toSvgPath,
  toSvgPathTransformed,
  toTextRun,
  tocPages,
  tokenOf,
  traceContours,
  traceLeft,
  trackCurves,
  translatePath,
  u as trimLeft,
  v as trimRight,
  unknownObjs,
  unknownSegs,
  upsertRule,
  validateBookStyle,
  verticalStrokes,
  wedgeProfile,
  wordKey,
  wrapText,
  xSpace,
  ySpace
};
