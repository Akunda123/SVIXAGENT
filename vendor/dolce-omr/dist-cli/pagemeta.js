const OPEN = "“‘（「『《〈【〔［｛";
const CLOSE = "”’）」』》〉】〕］｝";
const STOP = "。，、；：！？";
const MIDDLE = "…—‥·・";
function punctClass(ch) {
  if (!ch) return "none";
  if (OPEN.includes(ch)) return "open";
  if (CLOSE.includes(ch)) return "close";
  if (STOP.includes(ch)) return "stop";
  if (MIDDLE.includes(ch)) return "middle";
  return "none";
}
function trimLeft(ch) {
  return punctClass(ch) === "open" ? 0.5 : 0;
}
function trimRight(ch) {
  const c = punctClass(ch);
  return c === "close" || c === "stop" ? 0.5 : 0;
}
function pairTrim(prev, next) {
  if (!prev || !next) return 0;
  return Math.max(0, trimRight(prev) + trimLeft(next) - 0.5);
}
function hangTrim(ch) {
  return trimRight(ch);
}
function headTrim(ch) {
  return trimLeft(ch);
}
const PUNCT_PAIR_GAP = 0.1;
function trimLeftPx(ch, em, slack) {
  const want = trimLeft(ch) * em;
  return slack ? Math.min(want, Math.max(0, slack(ch).left)) : want;
}
function trimRightPx(ch, em, slack) {
  const want = trimRight(ch) * em;
  return slack ? Math.min(want, Math.max(0, slack(ch).right)) : want;
}
function pairTrimIn(mode, prev, next) {
  if (mode === "none") return 0;
  if (mode === "halfwidth") return trimRight(prev) + trimLeft(next);
  return pairTrim(prev, next);
}
function pairTrimPx(mode, prev, next, em, slack) {
  if (mode === "none" || !prev || !next) return 0;
  const r = trimRightPx(prev, em, slack);
  const l = trimLeftPx(next, em, slack);
  if (mode === "halfwidth") return r + l;
  return Math.max(0, Math.min(r + l, trimRight(prev) * em + trimLeft(next) * em - 0.5 * em));
}
function compressRun(chars, advanceOf, em, mode = "clreq", slack) {
  const xs = [];
  let x = 0;
  let prevPad = -1;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (mode === "halfwidth") {
      const adv = advanceOf(ch);
      const canTrim = trimLeft(ch) > 0 || trimRight(ch) > 0;
      if (!canTrim) {
        xs.push(x);
        x += adv;
        prevPad = -1;
        continue;
      }
      if (slack) {
        const sk = slack(ch);
        const inkW = Math.max(0, adv - Math.max(0, sk.left) - Math.max(0, sk.right));
        const w = Math.max(0.5 * em, inkW);
        const pad = (w - inkW) / 2;
        if (prevPad >= 0) x -= Math.max(0, prevPad + pad - PUNCT_PAIR_GAP * em);
        xs.push(x - Math.max(0, sk.left) + pad);
        x += w;
        prevPad = pad;
        continue;
      }
      prevPad = -1;
      const l = trimLeftPx(ch, em);
      xs.push(x - l);
      x += adv - l - trimRightPx(ch, em);
      continue;
    }
    prevPad = -1;
    if (i > 0 && mode !== "none") x -= pairTrimPx(mode, chars[i - 1], ch, em, slack);
    xs.push(x);
    x += advanceOf(ch);
  }
  return { xs, width: x };
}
const LYRIC_SPLIT_PUNCT = `1234567890.,;:'"!?。：，；！？“”｡､`;
const PU_LYRIC_PUNCTUATION = "，。！？、；：,.!?;:…—～~《》()（）";
const PU_LYRIC_QUOTES = '“”‘’"';
function isLyricCjk(ch) {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 13312 && c <= 19903 || c >= 19968 && c <= 40959 || c >= 63744 && c <= 64255 || c >= 131072 && c <= 191471;
}
function isLyricTrailingPunct(ch) {
  return PU_LYRIC_PUNCTUATION.includes(ch) || '”’｡、"'.includes(ch);
}
function isLyricOpenQuote(ch) {
  return ch === "“" || ch === "‘";
}
const MIXED_PUNCT = "「」（），。！；：、“”？｡";
const NO_LINE_START = /[，。、；：！？」』）〉》…·%,.;:!?)\]}]/;
const HANG_PUNCT = /[，。、；：！？…”’）」』】》｡､｣,.;:!?)\]}]/u;
function gcd(numerator, denominator) {
  let a = numerator;
  let b = denominator;
  while (b !== 0) {
    const oldB = b;
    b = a % b;
    a = oldB;
  }
  return Math.abs(a);
}
function lcm(a, b) {
  const g = gcd(a, b);
  return g === 0 ? Math.abs(a || b) : Math.abs(a / g * b);
}
class Fraction {
  numerator = 0;
  denominator = 1;
  /** Mirrors the Kotlin (num, den) constructor (with gcd reduction). */
  constructor(num = 0, den = 1) {
    if (den < 0) {
      this.numerator = -num;
      this.denominator = -den;
    } else {
      this.numerator = num;
      this.denominator = den;
    }
    const g = gcd(this.numerator, this.denominator) || 1;
    this.numerator /= g;
    this.denominator /= g;
  }
  static fromString(s) {
    const idx = s.indexOf("/");
    if (idx < 0) return new Fraction(parseInt(s, 10));
    return new Fraction(
      parseInt(s.substring(0, idx), 10),
      parseInt(s.substring(idx + 1), 10)
    );
  }
  compareTo(other) {
    const mNum = this.numerator * other.denominator;
    const oNum = other.numerator * this.denominator;
    return mNum < oNum ? -1 : mNum > oNum ? 1 : 0;
  }
  toFloat() {
    return this.numerator / this.denominator;
  }
  toInt() {
    return Math.trunc(this.numerator / this.denominator);
  }
  plus(other) {
    const mn = this.numerator * other.denominator;
    const md = other.numerator * this.denominator;
    return new Fraction(mn + md, this.denominator * other.denominator);
  }
  minus(other) {
    const mn = this.numerator * other.denominator;
    const md = other.numerator * this.denominator;
    return new Fraction(mn - md, this.denominator * other.denominator);
  }
  times(other) {
    return new Fraction(
      this.numerator * other.numerator,
      this.denominator * other.denominator
    );
  }
  timesInt(other) {
    return new Fraction(this.numerator * other, this.denominator);
  }
  div(other) {
    return new Fraction(
      this.numerator * other.denominator,
      this.denominator * other.numerator
    );
  }
  divInt(other) {
    return new Fraction(this.numerator, this.denominator * other);
  }
  equals(other) {
    if (typeof other === "number") return this.compareTo(new Fraction(other)) === 0;
    return this.compareTo(other) === 0;
  }
  toString() {
    if (this.denominator === 1) return String(this.numerator);
    return `${this.numerator}/${this.denominator}`;
  }
}
const escapeXml = (s) => s.replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
const escapeAttr = (s) => escapeXml(s).replace(/"/g, "&quot;");
const BASES = [
  ["whole", 4],
  ["half", 2],
  ["quarter", 1],
  ["eighth", 0.5],
  ["16th", 0.25],
  ["32nd", 0.125],
  ["64th", 0.0625]
];
const frac = (v) => new Fraction(Math.round(v * 16), 16);
function typeOfDuration(duration) {
  const q = duration;
  for (const [type, val] of BASES) {
    const b = frac(val);
    if (q.equals(b)) return { type, dots: 0 };
    if (q.equals(b.times(new Fraction(3, 2)))) return { type, dots: 1 };
    if (q.equals(b.times(new Fraction(7, 4)))) return { type, dots: 2 };
  }
  for (const [type, val] of BASES) if (q.compareTo(frac(val)) >= 0) return { type, dots: 0 };
  return { type: "64th", dots: 0 };
}
function barlineXml(location, p) {
  const hasEnding = p.ending !== null && p.ending !== void 0;
  if (!p.style && !hasEnding && !p.repeat) return "";
  const type = p.endingType ?? (location === "left" ? "start" : "stop");
  return `<barline location="${location}">` + (p.style ? `<bar-style>${p.style}</bar-style>` : "") + (hasEnding ? `<ending number="${escapeAttr(p.ending)}" type="${type}"` + (p.endingText ? `>${escapeXml(p.endingText)}</ending>` : "/>") : "") + (p.repeat ? `<repeat direction="${location === "left" ? "forward" : "backward"}"/>` : "") + `</barline>`;
}
function workXml(title) {
  return title ? `<work><work-title>${escapeXml(title)}</work-title></work>` : "";
}
function wrapPartwise(parts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.0">
${parts.work ?? ""}${parts.identification ?? ""}${parts.credits ?? ""}<part-list>${parts.partList}</part-list>
${parts.body}
</score-partwise>`;
}
function scorePartXml(id, name) {
  const n = `<part-name print-object="no"></part-name>`;
  return `<score-part id="${escapeAttr(id)}">${n}</score-part>`;
}
const META_KEYS = [
  { key: "title-alt", label: "英文标题", role: "titleAlt" },
  { key: "scripture", label: "题下经文", role: "scripture" },
  { key: "scripture-ref", label: "题下经文出处", role: "scriptureRef" },
  { key: "related-scriptures", label: "经文参考", role: "relatedScriptures" },
  { key: "tags", label: "标签", role: "tags", split: /[;；]/ },
  { key: "category", label: "分类", role: "header" },
  { key: "tune", label: "曲调名", role: "note" },
  { key: "ccli", label: "CCLI 编号", role: "note" },
  { key: "rights-extra", label: "译配权", role: "rights" },
  { key: "note-bl", label: "页脚注释（左）", role: "note" },
  { key: "note-bc", label: "页脚注释（中）", role: "note" },
  { key: "note-br", label: "页脚注释（右）", role: "note" },
  { key: "layout.new-page", label: "另起一页", flag: true },
  // 纸张（`style/paper.ts::songPageDecl`）：MusicXML 的 `<page-layout>` 转成 123/ABC 时落在这里，否则纸就丢了
  { key: "page", label: "纸张（A4 或「宽 高」pt）" },
  { key: "page-orientation", label: "纸张方向（portrait/landscape）" },
  { key: "page-margin", label: "页边距（上 右 下 左，pt）" },
  { key: "staff-size", label: "五线谱谱表高（mm）" },
  { key: "lyric-size", label: "五线谱歌词字号（pt）" },
  { key: "font-title", label: "标题字体（字号 [bold] 字体族）" },
  { key: "font-subtitle", label: "副标题字体" },
  { key: "font-scripture", label: "经文字体" },
  { key: "font-credit", label: "词曲作者字体" },
  { key: "layout.melody-only", label: "只留旋律声部", flag: true },
  { key: "layout.chinese-hyphen", label: "歌词连字符用「—」", flag: true }
];
const BY_KEY = new Map(META_KEYS.map((d) => [d.key, d]));
function metaKeyDef(key) {
  return BY_KEY.get(key);
}
function isMetaKey(key) {
  return /^[a-z0-9][a-z0-9.-]*$/.test(key);
}
function getMeta(song, key) {
  return song.meta?.[key] ?? [];
}
function metaText(song, key, joiner = "\n") {
  return getMeta(song, key).join(joiner);
}
function metaFlag(song, key) {
  const v = getMeta(song, key)[0]?.trim().toLowerCase();
  if (v === void 0 || v === "") return void 0;
  return v === "true" || v === "1" || v === "yes";
}
function setMeta(song, key, values) {
  if (values.length === 0) {
    if (!song.meta) return;
    delete song.meta[key];
    if (Object.keys(song.meta).length === 0) delete song.meta;
    return;
  }
  (song.meta ??= {})[key] = [...values];
}
function addMeta(song, key, value) {
  ((song.meta ??= {})[key] ??= []).push(value);
}
function overlayMeta(base, over) {
  if (!over || Object.keys(over).length === 0) return base;
  return { ...base ?? {}, ...over };
}
function splitMetaValue(key, text) {
  const re = metaKeyDef(key)?.split;
  if (!re) return [text];
  return text.split(re).map((s) => s.trim()).filter((s) => s.length > 0);
}
const LABEL_TYPE = [
  [/^词\s*[、/&和]?\s*曲$/, "words-and-music"],
  [/^(作\s*词|填\s*词|词)$/, "lyricist"],
  [/^(作\s*曲|曲)$/, "composer"],
  [/^(编\s*曲|改\s*编|编)$/, "arranger"],
  [/^(译\s*词|译\s*配|配\s*译|中\s*译|翻\s*译|译)$/, "translator"],
  [/^(制\s*谱|打\s*谱)$/, "transcriber"]
];
function typeOfLabel(label) {
  const t = label.trim();
  for (const [re, type] of LABEL_TYPE) if (re.test(t)) return type;
  return null;
}
function creatorTypeOf(text) {
  const t = text.trim();
  const pre = /^([^：:]{1,8}?)\s*[：:]/.exec(t);
  if (pre) return typeOfLabel(pre[1]);
  const suf = /^(.{2,}?)\s*(词\s*曲|作词|作曲|编曲|词|曲)$/.exec(t);
  if (suf && !/[（(]$/.test(suf[1])) return typeOfLabel(suf[2]);
  return null;
}
function creatorOf(text) {
  return { type: creatorTypeOf(text) ?? "composer", text };
}
function child(el, tag) {
  for (const c of Array.from(el.children)) if (c.tagName === tag) return c;
  return null;
}
const SURFACE = /* @__PURE__ */ new WeakMap();
function surfaceOf(obj, slot = "") {
  return obj ? SURFACE.get(obj)?.get(slot) : void 0;
}
const attrNum = (el, name) => {
  const t = el?.getAttribute(name);
  if (t === null || t === void 0 || t === "") return void 0;
  const v = Number(t);
  return Number.isFinite(v) ? v : void 0;
};
function readFont(el) {
  if (!el) return void 0;
  const f = {};
  const fam = el.getAttribute("font-family");
  if (fam !== null) f.family = fam;
  const size = attrNum(el, "font-size");
  if (size !== void 0) f.size = size;
  const w = el.getAttribute("font-weight");
  if (w !== null) f.weight = w;
  const st = el.getAttribute("font-style");
  if (st !== null) f.style = st;
  return Object.keys(f).length ? f : void 0;
}
function defaultsFonts(song) {
  const root = surfaceOf(song);
  const def = root ? child(root, "defaults") : null;
  if (!def) return {};
  const out = {};
  const mf = child(def, "music-font");
  const wf = child(def, "word-font");
  if (mf) out.musicFont = readFont(mf) ?? {};
  if (wf) out.wordFont = readFont(wf) ?? {};
  return out;
}
const STANDARD_PAPERS = {
  A4: [595, 842],
  A5: [420, 595],
  B5: [499, 709],
  Letter: [612, 792]
};
const DEFAULT_SCALING = { millimeters: 7, tenths: 40 };
const ptPerTenth = (sc) => {
  const s = sc && sc.millimeters > 0 && sc.tenths > 0 ? sc : DEFAULT_SCALING;
  return s.millimeters * 72 / 25.4 / s.tenths;
};
const round1 = (v) => Math.round(v * 10) / 10;
function pageOfDefaults(song) {
  const pl = song.defaults?.pageLayout;
  if (!pl?.pageWidth || !pl.pageHeight) return null;
  const k = ptPerTenth(song.defaults?.scaling);
  const out = { w: round1(pl.pageWidth * k), h: round1(pl.pageHeight * k) };
  const mg = pl.margins?.find((m) => m.oddEven !== "even");
  if (mg) out.margins = [round1(mg.top * k), round1(mg.right * k), round1(mg.bottom * k), round1(mg.left * k)];
  return out;
}
function pageOfMeta(song) {
  const v = getMeta(song, "page")[0]?.trim();
  if (!v) return null;
  let w, h;
  const nums = v.split(/\s+/).map(Number);
  const std = Object.entries(STANDARD_PAPERS).find(([k]) => k.toLowerCase() === v.toLowerCase())?.[1];
  if (std) {
    [w, h] = std;
    if (getMeta(song, "page-orientation")[0]?.trim() === "landscape") [w, h] = [h, w];
  } else if (nums.length === 2 && nums.every((n) => Number.isFinite(n) && n > 0)) {
    [w, h] = nums;
  } else {
    return null;
  }
  const out = { w, h };
  const mg = getMeta(song, "page-margin")[0]?.trim().split(/\s+/).map(Number);
  if (mg?.length === 4 && mg.every((n) => Number.isFinite(n) && n >= 0)) out.margins = mg;
  return out;
}
function songPage(song) {
  return pageOfDefaults(song) ?? pageOfMeta(song);
}
function standardPaperOf(w, h) {
  const [a, b] = w > h ? [h, w] : [w, h];
  for (const [name, [pw, ph]] of Object.entries(STANDARD_PAPERS)) {
    if (Math.abs(pw - a) <= 2 && Math.abs(ph - b) <= 2) return { name, landscape: w > h };
  }
  return null;
}
function pageMeta(page) {
  const std = standardPaperOf(page.w, page.h);
  const out = { page: [std ? std.name : `${page.w} ${page.h}`] };
  if (std?.landscape) out["page-orientation"] = ["landscape"];
  if (page.margins) out["page-margin"] = [page.margins.join(" ")];
  return out;
}
function songStaffSize(song) {
  const sc = song.defaults?.scaling;
  if (sc && sc.millimeters > 0 && sc.tenths > 0) return round2(sc.millimeters * 40 / sc.tenths);
  const v = Number(getMeta(song, "staff-size")[0]);
  return Number.isFinite(v) && v > 0 ? v : null;
}
function songLyricSize(song) {
  const fs = song.defaults?.lyricFont?.size;
  if (fs && fs > 0) return fs;
  const v = Number(getMeta(song, "lyric-size")[0]);
  return Number.isFinite(v) && v > 0 ? v : null;
}
const round2 = (v) => Math.round(v * 100) / 100;
function withPageMeta(doc) {
  const extra = (s) => {
    const out = {};
    const page = pageOfDefaults(s);
    if (page && !getMeta(s, "page").length) Object.assign(out, pageMeta(page));
    const sc = s.defaults?.scaling;
    if (sc && sc.millimeters > 0 && sc.tenths > 0 && !getMeta(s, "staff-size").length) out["staff-size"] = [String(songStaffSize(s))];
    const ly = s.defaults?.lyricFont?.size;
    if (ly && !getMeta(s, "lyric-size").length) out["lyric-size"] = [String(ly)];
    Object.assign(out, headerFontMeta(s));
    return out;
  };
  if (!doc.songs.some((s) => Object.keys(extra(s)).length)) return doc;
  return {
    ...doc,
    songs: doc.songs.map((s) => {
      const add = extra(s);
      return Object.keys(add).length ? { ...s, meta: { ...s.meta ?? {}, ...add } } : s;
    })
  };
}
function applyPageMetaToDefaults(song) {
  const mm = Number(getMeta(song, "staff-size")[0]);
  if (!song.defaults?.scaling && Number.isFinite(mm) && mm > 0) {
    song.defaults = { ...song.defaults ?? {}, scaling: { millimeters: mm, tenths: 40 } };
  }
  const ly = Number(getMeta(song, "lyric-size")[0]);
  if (!song.defaults?.lyricFont?.size && Number.isFinite(ly) && ly > 0) {
    song.defaults = { ...song.defaults ?? {}, lyricFont: { ...song.defaults?.lyricFont ?? {}, size: ly } };
  }
  if (song.defaults?.pageLayout?.pageWidth) return;
  const page = pageOfMeta(song);
  if (!page) return;
  const scaling = song.defaults?.scaling ?? { ...DEFAULT_SCALING };
  const k = ptPerTenth(scaling);
  const t = (pt) => round1(pt / k);
  song.defaults = {
    ...song.defaults ?? {},
    scaling,
    pageLayout: {
      pageWidth: t(page.w),
      pageHeight: t(page.h),
      ...page.margins ? { margins: [{ top: t(page.margins[0]), right: t(page.margins[1]), bottom: t(page.margins[2]), left: t(page.margins[3]), oddEven: "both" }] } : {}
    }
  };
}
const HEADER_ROLES = ["title", "subtitle", "scripture", "credit"];
function headerRoleOfCredit(type, justify, biggest) {
  switch (type?.trim()) {
    case "title":
      return "title";
    case "subtitle":
      return "subtitle";
    case "scripture":
      return "scripture";
    case "composer":
    case "lyricist":
    case "arranger":
    case "poet":
    case "words":
    case "translator":
      return "credit";
    case void 0:
    case "":
      break;
    default:
      return null;
  }
  if (biggest && justify !== "right") return "title";
  if (justify === "right") return "credit";
  return null;
}
function headerFontsOfCredits(song) {
  const credits = song.credits ?? [];
  const maxSize = Math.max(0, ...credits.map((c) => c.fontSize ?? 0));
  const out = {};
  for (const c of credits) {
    const role = headerRoleOfCredit(c.type, c.justify, maxSize > 0 && c.fontSize === maxSize);
    if (!role || out[role]) continue;
    const f = {};
    const family = c.fontFamily ?? defaultsFonts(song).wordFont?.family;
    if (family) f.family = family;
    if (c.fontSize) f.size = c.fontSize;
    if (c.fontWeight === "bold") f.bold = true;
    if (Object.keys(f).length) out[role] = f;
  }
  return out;
}
function headerFontsOfMeta(song) {
  const out = {};
  for (const role of HEADER_ROLES) {
    const v = getMeta(song, `font-${role}`)[0]?.trim();
    if (!v) continue;
    const m = /^(\S+)\s*(bold\s+)?(.*)$/i.exec(v);
    if (!m) continue;
    const f = {};
    const size = Number(m[1]);
    if (Number.isFinite(size) && size > 0) f.size = size;
    if (m[2]) f.bold = true;
    if (m[3]?.trim()) f.family = m[3].trim();
    if (Object.keys(f).length) out[role] = f;
  }
  return out;
}
function songHeaderFonts(song) {
  return song.credits?.length ? headerFontsOfCredits(song) : headerFontsOfMeta(song);
}
function headerFontMeta(song) {
  const out = {};
  if (!song.credits?.length) return out;
  for (const [role, f] of Object.entries(headerFontsOfCredits(song))) {
    if (getMeta(song, `font-${role}`).length) continue;
    out[`font-${role}`] = [[f.size ? String(f.size) : "-", f.bold ? "bold" : "", f.family ?? ""].filter(Boolean).join(" ")];
  }
  return out;
}
export {
  songHeaderFonts as A,
  surfaceOf as B,
  addMeta as C,
  getMeta as D,
  isMetaKey as E,
  metaFlag as F,
  metaKeyDef as G,
  HANG_PUNCT as H,
  metaText as I,
  setMeta as J,
  splitMetaValue as K,
  LYRIC_SPLIT_PUNCT as L,
  META_KEYS as M,
  NO_LINE_START as N,
  escapeAttr as O,
  PUNCT_PAIR_GAP as P,
  withPageMeta as Q,
  applyPageMetaToDefaults as R,
  STANDARD_PAPERS as S,
  Fraction as T,
  lcm as U,
  typeOfDuration as V,
  workXml as a,
  barlineXml as b,
  MIXED_PUNCT as c,
  PU_LYRIC_PUNCTUATION as d,
  escapeXml as e,
  PU_LYRIC_QUOTES as f,
  compressRun as g,
  creatorOf as h,
  creatorTypeOf as i,
  hangTrim as j,
  headTrim as k,
  isLyricCjk as l,
  isLyricOpenQuote as m,
  isLyricTrailingPunct as n,
  overlayMeta as o,
  pairTrim as p,
  pairTrimIn as q,
  pairTrimPx as r,
  scorePartXml as s,
  punctClass as t,
  trimLeft as u,
  trimRight as v,
  wrapPartwise as w,
  songPage as x,
  songStaffSize as y,
  songLyricSize as z
};
