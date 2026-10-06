import { L as LEXER_123, t, v as verseCount, i as inlineBreakOf, m as melodyLane, e as eachChord, p as projectForJianpu, n as nestArcsInTuplets, a as arcsToNextNote, b as puArcLosses, g as getLang, c as projectForMusicXml, S as SOURCE_ID_PREFIX, D as DYNAMICS, d as parseChordToken, l as lyPitchToText, f as lySuffixToText, h as emptySong, j as SIMPLE_DIVISIONS, I as IdGen, B as BARE_DIRECTION, k as emptyDoc } from "./beatcheck.js";
import { A, C, o, J, R, Z, q, r, s, u, w, x, y, z, E, F, G, H, K, M, N, O, P, Q, T, U, V, W, X, Y, _, $, a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, aa, ab, ac, ad, ae, af, ag, ah, ai, aj, ak, al, am, an, ao, ap, aq, ar } from "./beatcheck.js";
import { x as songPage, y as songStaffSize, z as songLyricSize, A as songHeaderFonts, B as surfaceOf } from "./pagemeta.js";
import { M as M2, C as C2, h, i, D, E as E2, F as F2, G as G2, I, o as o2, J as J2, K as K2 } from "./pagemeta.js";
import { h as harmonyXml$1 } from "./harmonyxml.js";
function lexMusicLine(line, lineNo, lineOffset, columnBase = 0) {
  return LEXER_123.lexLine(line, lineNo, lineOffset, columnBase);
}
let gbkMap = null;
function gbkTable() {
  if (gbkMap) return gbkMap;
  const dec = new TextDecoder("gbk");
  const map = /* @__PURE__ */ new Map();
  const pair = new Uint8Array(2);
  for (let hi = 129; hi <= 254; hi++) {
    for (let lo = 64; lo <= 254; lo++) {
      if (lo === 127) continue;
      pair[0] = hi;
      pair[1] = lo;
      const ch = dec.decode(pair);
      if (ch.length === 1 && ch !== "�" && !map.has(ch)) map.set(ch, hi << 8 | lo);
    }
  }
  gbkMap = map;
  return map;
}
const bad = (s2) => (s2.match(/\ufffd/g) ?? []).length;
const BIG5_LOW_TRAIL = 0.15;
function looksBig5(bytes) {
  let pairs = 0;
  let low = 0;
  for (let i2 = 0; i2 < bytes.length - 1; i2++) {
    if (bytes[i2] < 129) continue;
    pairs++;
    const t2 = bytes[i2 + 1];
    if (t2 >= 64 && t2 <= 126) low++;
    i2++;
  }
  return pairs > 0 && low / pairs > BIG5_LOW_TRAIL;
}
function decodeJcx(bytes) {
  let text;
  if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) text = new TextDecoder("utf-8").decode(bytes.subarray(3));
  else if (bytes[0] === 255 && bytes[1] === 254) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bytes[0] === 254 && bytes[1] === 255) text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("gbk").decode(bytes);
      if (looksBig5(bytes)) {
        const big5 = new TextDecoder("big5").decode(bytes);
        if (bad(big5) <= bad(text)) text = big5;
      }
    }
  }
  return text.replace(/\r\n?/g, "\n");
}
function encodeJcx(text) {
  const crlf = text.replace(/\r?\n/g, "\r\n");
  if (/^\s*%MUSE3/.test(text)) return { bytes: new TextEncoder().encode(crlf), missing: [] };
  const map = gbkTable();
  const out = [];
  const missing = [];
  for (const ch of crlf) {
    const c = ch.codePointAt(0);
    if (c < 128) {
      out.push(c);
      continue;
    }
    const code = map.get(ch);
    if (code === void 0) {
      if (!missing.includes(ch)) missing.push(ch);
      out.push(63);
    } else {
      out.push(code >> 8, code & 255);
    }
  }
  return { bytes: new Uint8Array(out), missing };
}
const FEATURE_NAMES = {
  harmony: "和弦符号",
  harmonyOffset: "长音中间不在整拍上的和弦（会提前到音符上）",
  multiVoice: "多声部",
  noteStack: "同一声部里同时发声的音（和弦内音、声部内第二声部，只留简谱印的旋律）",
  dynamics: "力度与渐强渐弱",
  playOrder: "演唱顺序（房号跳转、第几遍配第几段词）",
  style: "样式表引用",
  layoutDirectives: "版面指令（字号、页边距等）",
  keyChange: "曲中转调",
  multiVerse: "多段歌词",
  volta: "房号",
  grace: "倚音",
  slur: "圆滑线",
  textLine: "段落词与注记",
  multiSong: "一个文件里的多首曲子",
  pageText: "页眉页脚",
  meta: "扩展曲目信息（英文标题、经文、标签等）",
  paper: "谱里写的纸张、页边距、五线谱谱表大小与歌词字号、页眉字体（改记进设置）",
  verseLabel: "印刷段号",
  rhythmNote: "节奏音符（有声无音高）",
  invisibleRest: "不可见休止",
  nestedArc: "套在另一条弧线里的弧线（外面那条或里面那条会丢一条）",
  oddTuplet: "比例特殊的多连音（按 n 个音占 n−1 拍写不出来）",
  slurCrossTuplet: "跨出多连音组的弧线（会截到组的边界）",
  lyricOnRest: "挂在休止符上的歌词",
  pageBreak: "换页（会改成换行）"
};
const TARGET_LABEL = {
  "123": "123",
  abc: "ABC",
  jpwabc: "JPWABC",
  tomato: "番茄简谱",
  shige: "诗歌本文本谱",
  jly: "jianpu-ly",
  jcx: "Muse 简谱",
  musicxml: "MusicXML"
};
const PU_GONE = [
  "style",
  "playOrder",
  "harmonyOffset",
  "meta",
  "paper",
  "keyChange",
  "noteStack",
  "nestedArc",
  "oddTuplet"
];
const ALL = Object.keys(FEATURE_NAMES);
const allBut = (...gone) => new Set(ALL.filter((f) => !gone.includes(f)));
const FORMAT_CAPS = {
  // 123 是按「装得下全部」设计的（`docs/格式/123格式.md`），实测全语料只有 0.17% 表达不了，
  // 那些是转换层的账不是格式的账。
  // 音符堆 123 刻意不做（规范：和弦走符号，`.jpwabc` 的 `[1 3 5]` 语料 0 例）。
  // 嵌套弧与任意比例的多连音（`(5:4:`）都写得出；弧与多连音的括号只许嵌套（从组里连到组外下一个音写 `~`，
  // 跨得更远的写不出）、可见休止不跟词（规范 §4.1、§5.1）
  "123": allBut("harmonyOffset", "noteStack", "slurCrossTuplet", "lyricOnRest"),
  // 标准 ABC：样式被规范标为 VOLATILE（§11，「not standardised」），所以 123 才把样式
  // 另走样式表；`I:playorder` 是 123 的扩展，标准 ABC 读不懂（虽然会忽略，等于丢）。
  // 休止不跟词（ABC §5.1「syllables are not aligned on … rests」）；
  // 换页没有记号，写出端退化成换行（`emitabc.ts::breakText`；换行本身含小节中间的都装得下，`break-roundtrip-check` 实测）
  abc: allBut("style", "playOrder", "rhythmNote", "verseLabel", "harmonyOffset", "lyricOnRest", "pageBreak"),
  // `.jpwabc` 的语法**刻意不扩**：和弦、力度、多声部都写不进去。
  // 音符堆：写出端只留最高音、删 voice > 1
  jpwabc: allBut("harmony", "harmonyOffset", "slur", "dynamics", "multiVoice", "noteStack", "style", "layoutDirectives", "multiSong", "grace", "meta", "paper", "nestedArc", "oddTuplet"),
  // 文本谱：展开档谱面不画和弦/力度/多声部，但文本谱**原文**装得下和弦、力度（`&f`、`<`…`!`）——
  // 这里算的是「另存为之后还在不在」，所以按解析器的能力写。
  // 番茄另外没有页眉页脚与版面指令字段（写了会被嗅探成诗歌本，见 `pu/dialect.ts::EmitStyle.pageFields`）
  tomato: allBut(...PU_GONE, "pageText", "layoutDirectives"),
  shige: allBut(...PU_GONE),
  // jianpu-ly 装不下什么，依据 `docs/格式/jianpu-ly.md` 与 `tojly.ts` 的 `warnings`：
  //   · 多声部/多曲只写第一路（`NextScore` 本版不写）；扩展 meta、纸、样式表、页面文字没有字段；
  //   · 演唱顺序只认跳转裸词（`Fine`/`DC`/`Segno`/`ToCoda`），`playOrder` 的自定义跳转写不出；
  //   · 演奏法（`articulations` 里不是力度名的那批）、拉丁歌词的连字符（`syllabic`）写不出；
  //   · 房号只能两房（第 3 房起退化）；换页能写 `\pageBreak`，但**再读回来**会降级成换行；
  //   · 版面指令只认它自己那几个开关（`NoBarNums` 等），文本谱那套 `fontsize`/`margin` 写不出。
  jly: allBut(
    "multiVoice",
    "multiSong",
    "meta",
    "paper",
    "style",
    "pageText",
    "playOrder",
    "layoutDirectives",
    "dynamics",
    "verseLabel"
  ),
  // Muse `.jcx`（`emitjcx.ts`，说明书 §3.2）：一个文件一首；没有样式表、演唱顺序、扩展 meta（只留「来源」`S:`）、
  // 纸张字段（Muse 的 `%%` 排版参数与本项目的不是一套）；页面文字只有左上 `I:` 与右上 `C:`，页脚没有；
  // 力度没有对应的装饰名（渐强渐弱的 `(<` `<)` 写得出）；歌词没有印刷段号、休止不跟词（同 ABC）；换页退成换行
  jcx: allBut(
    "multiSong",
    "style",
    "playOrder",
    "meta",
    "paper",
    "pageText",
    "layoutDirectives",
    "dynamics",
    "verseLabel",
    "lyricOnRest",
    "harmonyOffset",
    "pageBreak"
  ),
  // MusicXML 装不下的两样：`playOrder` 的 skip/limit（`<ending>` 只能整小节）与样式引用。
  // 见 `docs/模块/模型-scoredoc.md` 的关键判据。
  musicxml: allBut("playOrder", "style", "layoutDirectives", "nestedArc", "oddTuplet")
};
const LAYOUT_DIRECTIVE = /^(fontsize|margin|space|off)$/i;
function keyDiffers(a, b) {
  return a.fifths !== b.fifths || (a.spelling ?? "") !== (b.spelling ?? "") || (a.tonicDegree ?? "1") !== (b.tonicDegree ?? "1");
}
function featuresUsed(doc) {
  const used = /* @__PURE__ */ new Set();
  if (doc.songs.length > 1) used.add("multiSong");
  for (const song of doc.songs) {
    if (song.parts.length > 1) used.add("multiVoice");
    if (song.playOrder?.length) used.add("playOrder");
    if (song.style?.sheetRef || song.style?.inline?.length) used.add("style");
    for (const r2 of song.style?.raw ?? []) used.add(LAYOUT_DIRECTIVE.test(r2.key) ? "layoutDirectives" : "style");
    if (song.pageText) used.add("pageText");
    if (song.meta && Object.keys(song.meta).length) used.add("meta");
    if (songPage(song) || songStaffSize(song) || songLyricSize(song) || Object.keys(songHeaderFonts(song)).length) used.add("paper");
    if (song.remarks?.length) used.add("textLine");
    if (verseCount(song) > 1) used.add("multiVerse");
    for (const m of song.marks ?? []) {
      if (m.type === "slur") used.add("slur");
      if (m.type === "wedge") used.add("dynamics");
    }
    for (const part of song.parts) {
      part.measures.forEach((mea, mi) => {
        if (mi > 0 && mea.attrs?.key && song.key && keyDiffers(mea.attrs.key, song.key)) used.add("keyChange");
        if (mi > 0 && mea.print?.newPage) used.add("pageBreak");
        if (mea.elements.some((el) => inlineBreakOf(el) === "page")) used.add("pageBreak");
      });
      for (const mea of part.measures) {
        const lane = melodyLane(mea);
        for (const b of mea.barlines ?? []) if (b.ending) used.add("volta");
        for (const d of mea.directions ?? []) {
          if (d.type === "dynamics" || d.type === "wedge") used.add("dynamics");
        }
        for (const el of mea.elements) {
          if (el.kind === "space" && el.spacer === "x") used.add("invisibleRest");
          if (el.harmony) used.add("harmony");
          if (el.kind === "chord") {
            if (el.notes.length > 1 || lane && (el.staff !== lane.staff || el.voice !== lane.voice)) used.add("noteStack");
            if (el.grace) used.add("grace");
            if (el.rhythm) used.add("rhythmNote");
            if (el.sectionWord) used.add("textLine");
            if (el.printObject === false && el.rest) used.add("invisibleRest");
            if (el.rest && el.printObject !== false && el.lyrics?.some((l) => l.text !== "")) used.add("lyricOnRest");
            for (const l of el.lyrics ?? []) if (l.verseLabel !== void 0) used.add("verseLabel");
          }
        }
      }
    }
    for (const { chord } of eachChord(song)) {
      for (const su of chord.sustains ?? []) if (su.harmony) used.add("harmony");
    }
    if ([...eachChord(song)].some(({ chord }) => chord.laterHarmonies?.length)) {
      if ([...eachChord(projectForJianpu(song))].some(({ chord }) => chord.laterHarmonies?.length)) used.add("harmonyOffset");
    }
    for (const part of song.parts) {
      const isArc = (m) => m.type === "slur" || m.type === "tied";
      const marks = song.marks ?? [];
      const nest = nestArcsInTuplets(part, marks, isArc);
      if (nest.crossedMarks.size > arcsToNextNote(part, marks, isArc).size) used.add("slurCrossTuplet");
    }
    const arcs = puArcLosses(song);
    if (arcs.nested) used.add("nestedArc");
    if (arcs.oddTuplet) used.add("oddTuplet");
  }
  return used;
}
function planSave(doc, target) {
  const caps = FORMAT_CAPS[target];
  return [...featuresUsed(doc)].filter((f) => !caps.has(f)).map((f) => ({ feature: f, name: t(`feat.${f}`) })).sort((a, b) => a.name.localeCompare(b.name, getLang()));
}
function targetName(target) {
  return target === "tomato" || target === "shige" ? t(`fmt.target.${target}`) : TARGET_LABEL[target];
}
function describeLosses(target, losses) {
  if (losses.length === 0) return "";
  return t("loss.body", { n: losses.length, format: targetName(target) }) + "\n\n" + losses.map((l) => `　· ${l.name}`).join("\n") + "\n\n" + t("loss.continue");
}
const esc = (s2) => s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s2) => esc(s2).replace(/"/g, "&quot;");
const ind = (depth) => "  ".repeat(depth);
const OWNS = {
  "score-partwise": { attrs: ["version"], kids: ["work", "movement-title", "identification", "defaults", "credit", "part-list", "part"] },
  work: { kids: ["work-number", "work-title"] },
  identification: { kids: ["creator", "rights", "encoding", "miscellaneous"] },
  creator: { attrs: ["type"] },
  encoding: { kids: ["software"] },
  miscellaneous: { kids: ["miscellaneous-field"] },
  "miscellaneous-field": { attrs: ["name"] },
  defaults: { kids: ["scaling", "page-layout"] },
  scaling: { kids: "*" },
  "page-layout": { kids: ["page-height", "page-width", "page-margins"] },
  "page-margins": { attrs: ["type"], kids: "*" },
  "lyric-font": { attrs: ["font-family", "font-size", "font-weight", "font-style"] },
  credit: { attrs: ["page"], kids: ["credit-type", "credit-words"] },
  "credit-words": { attrs: ["default-x", "default-y", "justify", "halign", "font-family", "font-size", "font-weight"] },
  "part-list": { kids: ["part-group", "score-part"] },
  "part-group": { attrs: ["type", "number"], kids: ["group-symbol", "group-name", "group-abbreviation", "group-barline"] },
  "score-part": { attrs: ["id"], kids: ["part-name", "part-abbreviation"] },
  part: { attrs: ["id"], kids: ["measure"] },
  measure: {
    attrs: ["number", "implicit"],
    kids: ["print", "barline", "attributes", "direction", "harmony", "note", "backup", "forward", "sound"]
  },
  print: { attrs: ["new-system", "new-page"] },
  attributes: { kids: ["divisions", "key", "time", "staves", "clef", "transpose"] },
  key: { kids: ["cancel", "fifths", "mode", "key-step", "key-alter"] },
  time: { attrs: ["symbol"], kids: ["beats", "beat-type"] },
  clef: { attrs: ["number"], kids: ["sign", "line", "clef-octave-change"] },
  transpose: { kids: ["diatonic", "chromatic", "octave-change"] },
  note: {
    attrs: ["print-object"],
    same: { "print-object": "yes" },
    kids: [
      "grace",
      "cue",
      "chord",
      "pitch",
      "unpitched",
      "rest",
      "duration",
      "tie",
      "voice",
      "type",
      "dot",
      "accidental",
      "time-modification",
      "notehead",
      "staff",
      "beam",
      "notations",
      "lyric"
    ]
  },
  grace: { attrs: ["slash"] },
  rest: { attrs: ["measure"] },
  pitch: { kids: "*" },
  unpitched: { kids: "*" },
  tie: { attrs: ["type"] },
  type: { attrs: ["size"] },
  accidental: { attrs: ["parentheses"] },
  "time-modification": { kids: ["actual-notes", "normal-notes"] },
  beam: { attrs: ["number"] },
  notations: { kids: ["slur", "tied", "tuplet", "fermata", "arpeggiate", "articulations", "ornaments", "technical"] },
  slur: { attrs: ["type", "number", "placement", "orientation"] },
  tied: { attrs: ["type", "number"] },
  tuplet: { attrs: ["type", "number", "bracket", "placement"] },
  fermata: { attrs: ["type"], same: { type: "upright" } },
  articulations: { kids: "*" },
  ornaments: { kids: "*" },
  technical: { kids: "*" },
  lyric: { attrs: ["number", "name"], kids: ["syllabic", "text", "extend", "elision"] },
  extend: { attrs: ["type"] },
  harmony: { attrs: ["staff"], kids: ["root", "kind", "bass", "degree", "offset"] },
  root: { kids: "*" },
  kind: { attrs: ["text", "use-symbols", "parentheses-degrees"] },
  bass: { kids: "*" },
  degree: { kids: "*" },
  direction: { attrs: ["placement"], kids: ["direction-type", "offset", "staff"] },
  "direction-type": { kids: "*" },
  dynamics: { kids: "*" },
  wedge: { attrs: ["type"] },
  metronome: { kids: ["beat-unit", "beat-unit-dot", "per-minute"] },
  bracket: { attrs: ["type", "line-end", "line-type"] },
  pedal: { attrs: ["type", "line"] },
  "octave-shift": { attrs: ["type"] },
  sound: { attrs: ["dacapo", "dalsegno", "fine", "segno", "coda", "tocoda", "tempo"] },
  barline: { attrs: ["location"], kids: ["bar-style", "ending", "repeat"] },
  ending: { attrs: ["number", "type", "print-object"], same: { "print-object": "yes" } },
  repeat: { attrs: ["direction", "times"] }
};
const MATCH_KEY = {
  "part-group": ["type", "number"],
  slur: ["type", "number"],
  tied: ["type", "number"],
  tuplet: ["type", "number"],
  beam: ["number"],
  lyric: ["number"],
  clef: ["number"],
  "staff-layout": ["number"],
  "page-margins": ["type"],
  barline: ["location"]
};
const attrMap = (attrs) => {
  const m = /* @__PURE__ */ new Map();
  for (const a of attrs.matchAll(/\s([\w:.-]+)="([^"]*)"/g)) m.set(a[1], a[2]);
  return m;
};
const keyOf = (keys, get) => keys.map((k) => get(k) ?? "").join("\0");
function serializeDedented(el) {
  const lines = new XMLSerializer().serializeToString(el).split("\n");
  if (lines.length < 2) return lines[0];
  const base = /^ */.exec(lines[lines.length - 1])[0].length;
  return lines.map((l, i2) => i2 === 0 ? l : l.slice(Math.min(base, /^ */.exec(l)[0].length))).join("\n");
}
function carriedAttrs(n, sur) {
  const written = attrMap(n.attrs);
  const own = n.ownAttrs ?? OWNS[n.name]?.attrs ?? [];
  const same = OWNS[n.name]?.same;
  let out = "";
  for (const a of Array.from(sur.attributes)) {
    if (written.has(a.name) || own.includes(a.name) && same?.[a.name] !== a.value) continue;
    out += ` ${a.name}="${escAttr(a.value)}"`;
  }
  return out;
}
function mergeKids(n, sur) {
  const orig = Array.from(sur.children);
  const used = /* @__PURE__ */ new Map();
  for (const k of n.kids) if (k.sur && k.sur.parentElement === sur && !used.has(k.sur)) used.set(k.sur, k);
  for (const k of n.kids) {
    if (k.sur || k.raw !== void 0) continue;
    const keys = MATCH_KEY[k.name];
    const mine = keys ? keyOf(keys, (a) => attrMap(k.attrs).get(a)) : "";
    const hit = orig.find((c) => c.tagName === k.name && !used.has(c) && (!keys || keyOf(keys, (a) => c.getAttribute(a)) === mine));
    if (!hit) continue;
    k.sur = hit;
    used.set(hit, k);
  }
  const own = OWNS[n.name]?.kids;
  if (own === "*") return n.kids;
  const out = [...n.kids];
  let head = 0;
  const placed = new Map(used);
  orig.forEach((c, i2) => {
    if (used.has(c) || own?.includes(c.tagName)) return;
    const node = { name: "", attrs: "", kids: [], raw: serializeDedented(c) };
    let at = -1;
    for (let j = i2 - 1; j >= 0 && at < 0; j--) {
      const prev = placed.get(orig[j]);
      if (prev) at = out.indexOf(prev) + 1;
    }
    if (at < 0) at = head++;
    out.splice(at, 0, node);
    placed.set(c, node);
  });
  return out;
}
function serializeNode(n, depth, lines) {
  if (n.raw !== void 0) {
    for (const line of n.raw.split("\n")) lines.push(ind(depth) + line);
    return;
  }
  const sur = n.sur;
  const attrs = sur ? n.attrs + carriedAttrs(n, sur) : n.attrs;
  const kids = sur && n.text === void 0 ? mergeKids(n, sur) : n.kids;
  if (n.text !== void 0) lines.push(`${ind(depth)}<${n.name}${attrs}>${n.text}</${n.name}>`);
  else if (kids.length === 0) lines.push(`${ind(depth)}<${n.name}${attrs}/>`);
  else if (n.inline) {
    const inner = [];
    for (const k of kids) serializeNode(k, 0, inner);
    lines.push(`${ind(depth)}<${n.name}${attrs}>${inner.join("")}</${n.name}>`);
  } else {
    lines.push(`${ind(depth)}<${n.name}${attrs}>`);
    for (const k of kids) serializeNode(k, depth + 1, lines);
    lines.push(`${ind(depth)}</${n.name}>`);
  }
}
class Out {
  root = { name: "", attrs: "", kids: [] };
  stack = [this.root];
  add(n) {
    this.stack[this.stack.length - 1].kids.push(n);
    return n;
  }
  /** 开一个元素（`close` 收口）。`inline`：子节点写在同一行 */
  open(name, attrs = "", sur, inline = false) {
    const n = this.add({ name, attrs, kids: [], ...sur ? { sur } : {}, ...inline ? { inline } : {} });
    this.stack.push(n);
    return n;
  }
  close() {
    this.stack.pop();
  }
  /** 空元素 `<name attrs/>`（原节点有子节点时回填后可能不空） */
  leaf(name, attrs = "", sur) {
    return this.add({ name, attrs, kids: [], ...sur ? { sur } : {} });
  }
  /** 文字元素 `<name attrs>text</name>` */
  text(name, text, attrs = "", sur) {
    return this.add({ name, attrs, kids: [], text: typeof text === "string" ? esc(text) : String(text), ...sur ? { sur } : {} });
  }
  /** 原样的一段 XML */
  raw(xml) {
    this.add({ name: "", attrs: "", kids: [], raw: xml });
  }
  toString() {
    const lines = [];
    for (const k of this.root.kids) serializeNode(k, 0, lines);
    return lines.join("\n");
  }
}
function posAttrs(pos) {
  if (!pos) return "";
  const a = [];
  if (pos.defaultX !== void 0) a.push(`default-x="${pos.defaultX}"`);
  if (pos.defaultY !== void 0) a.push(`default-y="${pos.defaultY}"`);
  if (pos.relativeX !== void 0) a.push(`relative-x="${pos.relativeX}"`);
  if (pos.relativeY !== void 0) a.push(`relative-y="${pos.relativeY}"`);
  return a.length ? " " + a.join(" ") : "";
}
function fontAttrs(f) {
  if (!f) return "";
  const a = [];
  if (f.family !== void 0) a.push(`font-family="${escAttr(f.family)}"`);
  if (f.size !== void 0) a.push(`font-size="${f.size}"`);
  if (f.weight !== void 0) a.push(`font-weight="${escAttr(f.weight)}"`);
  if (f.style !== void 0) a.push(`font-style="${escAttr(f.style)}"`);
  return a.length ? " " + a.join(" ") : "";
}
function writeKey(o3, k) {
  o3.open("key");
  if (k.cancel !== void 0) o3.text("cancel", k.cancel);
  o3.text("fifths", k.fifths);
  if (k.mode) o3.text("mode", k.mode);
  for (const a of k.explicitAccidentals ?? []) {
    o3.text("key-step", a.step);
    o3.text("key-alter", a.alter);
  }
  o3.close();
}
function writeTime(o3, t2) {
  o3.open("time", t2.symbol ? ` symbol="${escAttr(t2.symbol)}"` : "");
  o3.text("beats", t2.beats);
  o3.text("beat-type", t2.beatType);
  o3.close();
}
function writeSystemLayout(o3, sl, bothMargins) {
  o3.open("system-layout");
  if (sl.leftMargin !== void 0 || sl.rightMargin !== void 0) {
    o3.open("system-margins");
    if (bothMargins || sl.leftMargin !== void 0) o3.text("left-margin", sl.leftMargin ?? 0);
    if (bothMargins || sl.rightMargin !== void 0) o3.text("right-margin", sl.rightMargin ?? 0);
    o3.close();
  }
  if (sl.systemDistance !== void 0) o3.text("system-distance", sl.systemDistance);
  if (sl.topSystemDistance !== void 0) o3.text("top-system-distance", sl.topSystemDistance);
  o3.close();
}
function writeDefaults(o3, def, sl) {
  if (!def && !sl) return;
  o3.open("defaults");
  if (def?.scaling) {
    o3.open("scaling");
    o3.text("millimeters", def.scaling.millimeters);
    o3.text("tenths", def.scaling.tenths);
    o3.close();
  }
  const pl = def?.pageLayout;
  if (pl) {
    o3.open("page-layout");
    if (pl.pageHeight !== void 0) o3.text("page-height", pl.pageHeight);
    if (pl.pageWidth !== void 0) o3.text("page-width", pl.pageWidth);
    for (const mg of pl.margins ?? []) {
      o3.open("page-margins", ` type="${mg.oddEven ?? "both"}"`);
      o3.text("left-margin", mg.left);
      o3.text("right-margin", mg.right);
      o3.text("top-margin", mg.top);
      o3.text("bottom-margin", mg.bottom);
      o3.close();
    }
    o3.close();
  }
  if (sl) writeSystemLayout(o3, sl, true);
  if (def?.lyricFont) o3.leaf("lyric-font", fontAttrs(def.lyricFont));
  o3.close();
}
function writeCredit(o3, c) {
  const sur = surfaceOf(c);
  o3.open("credit", c.page ? ` page="${c.page}"` : ' page="1"', sur);
  if (c.type) o3.text("credit-type", c.type);
  const attrs = [];
  if (c.x !== void 0) attrs.push(`default-x="${c.x}"`);
  if (c.y !== void 0) attrs.push(`default-y="${c.y}"`);
  if (c.justify) attrs.push(`justify="${c.justify}"`);
  if (c.halign) attrs.push(`halign="${c.halign}"`);
  if (c.fontFamily !== void 0) attrs.push(`font-family="${escAttr(c.fontFamily)}"`);
  if (c.fontSize !== void 0) attrs.push(`font-size="${c.fontSize}"`);
  if (c.fontWeight !== void 0) attrs.push(`font-weight="${escAttr(c.fontWeight)}"`);
  const a = attrs.length ? " " + attrs.join(" ") : "";
  (c.words ?? c.text.split("\n")).forEach((line, i2) => {
    if (i2 > 0 && sur) o3.text("credit-words", line).ownAttrs = [];
    else o3.text("credit-words", line, a);
  });
  o3.close();
}
function harmonyXml(o3, h2, cx) {
  if (!h2.kind && h2.text) {
    o3.raw(harmonyXml$1(h2.text, h2.offset ?? 0));
    return;
  }
  o3.open("harmony", posAttrs(cx.layout?.pos.get(h2)) + (h2.staff !== void 0 ? ` staff="${h2.staff}"` : ""), surfaceOf(h2));
  o3.open("root");
  o3.text("root-step", h2.root.step);
  if (h2.root.alter) o3.text("root-alter", h2.root.alter);
  o3.close();
  const kindAttrs = (h2.kindText !== void 0 ? ` text="${escAttr(h2.kindText)}"` : "") + (h2.useSymbols ? ' use-symbols="yes"' : "") + (h2.parenthesesDegrees ? ' parentheses-degrees="yes"' : "");
  o3.text("kind", h2.kind, kindAttrs);
  if (h2.bass) {
    o3.open("bass");
    o3.text("bass-step", h2.bass.step);
    if (h2.bass.alter) o3.text("bass-alter", h2.bass.alter);
    o3.close();
  }
  for (const g of h2.degrees ?? []) {
    o3.open("degree");
    o3.text("degree-value", g.value);
    o3.text("degree-alter", g.alter);
    o3.text("degree-type", g.type);
    o3.close();
  }
  if (h2.offset) o3.text("offset", h2.offset);
  o3.close();
}
function lyricXml(o3, l, cx) {
  const number = l.numberText ?? (l.refrain ? "chorus" : String(l.number));
  const name = l.name !== void 0 ? ` name="${escAttr(l.name)}"` : "";
  o3.open("lyric", ` number="${escAttr(number)}"${name}${posAttrs(cx.layout?.pos.get(l))}`, surfaceOf(l));
  if (l.syllabic) o3.text("syllabic", l.syllabic);
  o3.text("text", (l.leadingPunctuation ?? "") + l.text + (l.trailingPunctuation ?? ""));
  if (l.extend) o3.leaf("extend", l.extendType ? ` type="${l.extendType}"` : "");
  o3.close();
}
function notationsXml(o3, n, starts, stops) {
  const has = n?.articulations?.length || n?.ornaments?.length || n?.technical?.length || n?.fermata || n?.arpeggiate || n?.glissando || starts.length || stops.length;
  if (!has) return;
  const order = (m) => ["tied", "slur", "tuplet"].indexOf(m.type) * 1e3 + (m.number ?? 1);
  starts = [...starts].sort((a, b) => order(a) - order(b));
  stops = [...stops].sort((a, b) => order(a) - order(b));
  o3.open("notations");
  const self = new Set(starts.filter((m) => stops.includes(m)));
  const writeStop = (m) => {
    if (m.type === "slur" || m.type === "tied" || m.type === "tuplet") {
      o3.leaf(m.type, ` type="stop" number="${m.number ?? 1}"`, surfaceOf(m, "stop"));
    }
  };
  for (const m of stops) if (!self.has(m)) writeStop(m);
  for (const m of starts) {
    const pl = m.placement ? ` placement="${m.placement}"` : "";
    const sur = surfaceOf(m, "start");
    if (m.type === "slur") {
      const ori = m.orientation ? ` orientation="${m.orientation}"` : "";
      o3.leaf("slur", ` type="start" number="${m.number ?? 1}"${pl}${ori}`, sur);
    } else if (m.type === "tied") o3.leaf("tied", ` type="start" number="${m.number ?? 1}"`, sur);
    else if (m.type === "tuplet") {
      const br = m.bracket !== void 0 ? ` bracket="${m.bracket ? "yes" : "no"}"` : "";
      o3.leaf("tuplet", ` type="start" number="${m.number ?? 1}"${br}${pl}`, sur);
    }
  }
  for (const m of stops) if (self.has(m)) writeStop(m);
  if (n?.fermata) o3.leaf("fermata", n.fermataInverted ? ' type="inverted"' : "");
  if (n?.arpeggiate) o3.leaf("arpeggiate");
  for (const [tag, list] of [["articulations", n?.articulations], ["ornaments", n?.ornaments], ["technical", n?.technical]]) {
    if (!list?.length) continue;
    o3.open(tag);
    for (const a of list) o3.leaf(a);
    o3.close();
  }
  o3.close();
}
function chordXml(o3, ch, starts, stops, cx) {
  let k = 0;
  const writeOne = (note, isChordNote, withNotations) => {
    const idAttr = cx.sourceIds ? ` id="${SOURCE_ID_PREFIX}${ch.id}${k++ > 0 ? `-${k - 1}` : ""}"` : "";
    const attrs = idAttr + posAttrs(cx.layout?.pos.get(note ?? ch)) + (ch.printObject === false ? ' print-object="no"' : "");
    o3.open("note", attrs, surfaceOf(note ?? ch));
    if (ch.grace) o3.leaf("grace", ch.grace.slash ? ' slash="yes"' : "");
    if (ch.cue) o3.leaf("cue");
    if (isChordNote) o3.leaf("chord");
    if (ch.rest) {
      o3.leaf("rest", ch.rest.measure ? ' measure="yes"' : "");
    } else if (note?.pitch) {
      o3.open("pitch");
      o3.text("step", note.pitch.step);
      if (note.pitch.alter) o3.text("alter", note.pitch.alter);
      o3.text("octave", note.pitch.octave);
      o3.close();
    } else if (ch.rhythm) {
      o3.open("unpitched");
      o3.text("display-step", "B");
      o3.text("display-octave", 4);
      o3.close();
    } else {
      o3.leaf("rest");
    }
    if (!ch.grace) o3.text("duration", Math.max(0, Math.round(ch.duration.divisions)));
    for (const t2 of [note?.tie?.start ? "start" : null, note?.tie?.stop ? "stop" : null]) {
      if (t2) o3.leaf("tie", ` type="${t2}"`);
    }
    o3.text("voice", ch.voice);
    if (ch.duration.type) {
      const size = isChordNote ? note?.typeSize : ch.typeSize ?? note?.typeSize;
      o3.text("type", ch.duration.type, size ? ` size="${escAttr(size)}"` : "");
    }
    for (let i2 = 0; i2 < ch.duration.dots; i2++) o3.leaf("dot");
    if (note?.accidental) o3.text("accidental", note.accidental, note.accidentalParentheses ? ' parentheses="yes"' : "");
    if (ch.duration.timeMod) {
      o3.open("time-modification");
      o3.text("actual-notes", ch.duration.timeMod.actual);
      o3.text("normal-notes", ch.duration.timeMod.normal);
      o3.close();
    }
    const stem = note ? cx.layout?.stems.get(note) : void 0;
    if (stem) o3.text("stem", stem);
    if (ch.rhythm && !isChordNote) o3.text("notehead", "slash");
    else if (note?.notehead) o3.text("notehead", note.notehead);
    if (ch.staff > 1) o3.text("staff", ch.staff);
    (ch.beams ?? []).forEach((b, i2) => o3.text("beam", b, ` number="${i2 + 1}"`));
    const idx = note ? ch.notes.indexOf(note) : 0;
    notationsXml(
      o3,
      withNotations ? ch.notations : void 0,
      starts.filter((m) => (m.startNote ?? 0) === idx || idx === 0 && (m.startNote ?? 0) >= ch.notes.length),
      stops.filter((m) => (m.endNote ?? 0) === idx || idx === 0 && (m.endNote ?? 0) >= ch.notes.length)
    );
    if (withNotations) for (const l of ch.lyrics ?? []) lyricXml(o3, l, cx);
    o3.close();
  };
  if (ch.notes.length === 0) {
    writeOne(null, false, true);
    return;
  }
  ch.notes.forEach((n, i2) => writeOne(n, i2 > 0, i2 === 0));
}
function soundAttrs(s2) {
  const a = [];
  if (s2.dacapo) a.push('dacapo="yes"');
  if (s2.dalsegno) a.push(`dalsegno="${escAttr(s2.dalsegno)}"`);
  if (s2.fine) a.push('fine="yes"');
  if (s2.segno) a.push(`segno="${escAttr(s2.segno)}"`);
  if (s2.coda) a.push(`coda="${escAttr(s2.coda)}"`);
  if (s2.tocoda) a.push(`tocoda="${escAttr(s2.tocoda)}"`);
  if (s2.tempo !== void 0) a.push(`tempo="${s2.tempo}"`);
  return a.map((x2) => " " + x2).join("");
}
function directionXml(o3, dir, cx) {
  if (dir.type === "sound") {
    const sur = surfaceOf(dir);
    if (dir.sound || sur) o3.leaf("sound", dir.sound ? soundAttrs(dir.sound) : "", sur);
    return;
  }
  const pl = dir.placement ? ` placement="${dir.placement}"` : "";
  o3.open("direction", pl, surfaceOf(dir));
  o3.open("direction-type");
  directionPartXml(o3, dir, surfaceOf(dir, "part"), cx);
  for (const part of dir.more ?? []) directionPartXml(o3, part, surfaceOf(part), cx);
  o3.close();
  if (dir.offset !== void 0) o3.text("offset", dir.offset);
  if (dir.sound) {
    const a = soundAttrs(dir.sound);
    if (a) o3.leaf("sound", a);
  }
  if (dir.staff !== void 0 && dir.staff > 1) o3.text("staff", dir.staff);
  o3.close();
}
function directionPartXml(o3, dir, sur, cx) {
  const pos = posAttrs(cx.layout?.pos.get(dir));
  const fs = cx.layout?.fontSize.get(dir);
  const lay = pos + (fs !== void 0 ? ` font-size="${fs}"` : "");
  switch (dir.type) {
    case "dynamics":
      o3.open("dynamics", lay, sur, true);
      o3.leaf(dir.text || "mf");
      o3.close();
      break;
    case "words":
    case "rehearsal":
      o3.text(dir.type, dir.text ?? "", lay, sur);
      break;
    case "wedge":
      o3.leaf("wedge", ` type="${dir.spanType === "stop" ? "stop" : dir.wedgeType ?? "crescendo"}"${pos}`, sur);
      break;
    case "metronome":
      o3.open("metronome", lay, sur);
      o3.text("beat-unit", dir.tempo?.beatUnit ?? "quarter");
      if (dir.tempo?.beatUnitDot) o3.leaf("beat-unit-dot");
      o3.text("per-minute", dir.tempo?.perMinuteText ?? dir.tempo?.perMinute ?? 90);
      o3.close();
      break;
    case "bracket":
      if (dir.spanType) o3.leaf("bracket", ` type="${dir.spanType}" line-end="down" line-type="solid"`, sur);
      else o3.leaf("bracket", "", sur);
      break;
    case "pedal":
    case "octave-shift": {
      const line = dir.line !== void 0 ? ` line="${dir.line ? "yes" : "no"}"` : "";
      o3.leaf(dir.type, ` type="${dir.spanType ?? "start"}"${line}${pos}`, sur);
      break;
    }
    default:
      o3.leaf(dir.type, pos, sur);
      break;
  }
}
function barlineXml(o3, b) {
  o3.open("barline", ` location="${b.location === "middle" ? "middle" : b.location}"`, surfaceOf(b));
  if (b.style) o3.text("bar-style", b.style);
  if (b.ending) {
    const t2 = b.ending.type;
    const nums = b.ending.numbers.join(",");
    const po = b.ending.printObject === false ? ' print-object="no"' : "";
    o3.text("ending", b.ending.text ?? nums, ` number="${nums}" type="${t2}"${po}`);
  }
  if (b.repeat) {
    const times = b.repeatTimes && b.repeatTimes > 2 ? ` times="${b.repeatTimes}"` : "";
    o3.leaf("repeat", ` direction="${b.repeat}"${times}`);
  }
  o3.close();
}
function printXml(o3, p, lay) {
  if (!p && !lay) return;
  const a = [];
  if (p?.newSystem) a.push('new-system="yes"');
  if (p?.newPage) a.push('new-page="yes"');
  o3.open("print", a.length ? " " + a.join(" ") : "", p ? surfaceOf(p) : void 0);
  if (lay?.systemLayout) writeSystemLayout(o3, lay.systemLayout, false);
  for (const sl of lay?.staffLayouts ?? []) {
    const n = sl.staff !== void 0 ? ` number="${sl.staff}"` : "";
    if (sl.staffDistance === void 0) {
      o3.leaf("staff-layout", n);
      continue;
    }
    o3.open("staff-layout", n);
    o3.text("staff-distance", sl.staffDistance);
    o3.close();
  }
  o3.close();
}
function attributesXml(o3, attrs) {
  o3.open("attributes", "", surfaceOf(attrs));
  if (attrs.divisions !== void 0) o3.text("divisions", attrs.divisions);
  if (attrs.key) writeKey(o3, attrs.key);
  if (attrs.time) writeTime(o3, attrs.time);
  if (attrs.staves !== void 0) o3.text("staves", attrs.staves);
  for (const c of attrs.clefs ?? []) {
    o3.open("clef", c.staff ? ` number="${c.staff}"` : "");
    o3.text("sign", c.sign);
    if (c.line !== void 0) o3.text("line", c.line);
    if (c.octaveChange !== void 0) o3.text("clef-octave-change", c.octaveChange);
    o3.close();
  }
  if (attrs.transpose) {
    o3.open("transpose");
    if (attrs.transpose.diatonic !== void 0) o3.text("diatonic", attrs.transpose.diatonic);
    o3.text("chromatic", attrs.transpose.chromatic);
    if (attrs.transpose.octaveChange !== void 0) o3.text("octave-change", attrs.transpose.octaveChange);
    o3.close();
  }
  o3.close();
}
function measureXml(o3, m, marksByStart, marksByEnd, cx) {
  const width = cx.layout?.widths.get(m);
  const mAttrs = (m.implicit ? ' implicit="yes"' : "") + (width !== void 0 ? ` width="${width}"` : "");
  o3.open("measure", ` number="${escAttr(m.number)}"${mAttrs}`, surfaceOf(m));
  printXml(o3, m.print, cx.layout?.prints.get(m));
  for (const b of m.barlines ?? []) if (b.location === "left") barlineXml(o3, b);
  if (m.attrs) attributesXml(o3, m.attrs);
  const count = m.elements.length;
  const dirAt = (dir) => Math.min(dir.afterElements ?? 0, count);
  let cursor = 0;
  let end = 0;
  const moveTo = (target) => {
    if (target < cursor) {
      o3.open("backup");
      o3.text("duration", cursor - target);
      o3.close();
    } else if (target > cursor) {
      o3.open("forward");
      o3.text("duration", target - cursor);
      o3.close();
    }
    cursor = target;
  };
  const writeLaterAttrs = (i22) => {
    for (const la of m.laterAttrs ?? []) {
      if (Math.min(la.afterElements, count) !== i22) continue;
      moveTo(la.onset ?? end);
      attributesXml(o3, la.attrs);
    }
  };
  const writeDir = (dir) => {
    if (dir.type !== "sound") moveTo(dir.onset ?? end);
    directionXml(o3, dir, cx);
  };
  const writeHarmony = (h2, owner) => {
    moveTo(h2.onset ?? owner);
    harmonyXml(o3, h2, cx);
  };
  for (const dir of m.directions ?? []) if (dirAt(dir) === 0) writeDir(dir);
  let i2 = 0;
  for (const el of m.elements) {
    for (const b of m.barlines ?? []) {
      if (b.location === "middle" && b.afterElements === i2) barlineXml(o3, b);
    }
    if (i2 > 0) writeLaterAttrs(i2);
    if (i2 > 0) {
      for (const dir of m.directions ?? []) if (dirAt(dir) === i2) writeDir(dir);
    }
    const onset = el.onset ?? end;
    if (el.kind === "chord") {
      if (el.harmony) writeHarmony(el.harmony, onset);
      for (const h2 of el.laterHarmonies ?? []) writeHarmony(h2, onset);
      for (const su of el.sustains ?? []) if (su.harmony) writeHarmony(su.harmony, onset);
      moveTo(onset);
      chordXml(o3, el, marksByStart.get(el.id) ?? [], marksByEnd.get(el.id) ?? [], cx);
      if (!el.grace) cursor += Math.max(0, Math.round(el.duration.divisions));
      end = cursor;
    } else if (el.spacer === "x" && el.duration) {
      if (el.harmony) writeHarmony(el.harmony, onset);
      moveTo(onset);
      cursor += Math.max(0, Math.round(el.duration.divisions));
      end = cursor;
      o3.open("note", ' print-object="no"');
      o3.leaf("rest");
      o3.text("duration", Math.max(0, Math.round(el.duration.divisions)));
      o3.text("voice", el.voice);
      if (el.duration.type) o3.text("type", el.duration.type);
      o3.close();
    } else if (el.harmony) {
      writeHarmony(el.harmony, onset);
    }
    i2 += 1;
  }
  if (count > 0) writeLaterAttrs(count);
  if (count > 0) {
    for (const dir of m.directions ?? []) if (dirAt(dir) === count) writeDir(dir);
  }
  if (m.duration !== void 0 && m.duration > cursor) moveTo(m.duration);
  for (const b of m.barlines ?? []) if (b.location === "right") barlineXml(o3, b);
  o3.close();
}
function partXml(o3, part, song, cx) {
  const byStart = /* @__PURE__ */ new Map();
  const byEnd = /* @__PURE__ */ new Map();
  const add = (map, id, m) => {
    const list = map.get(id);
    if (list) list.push(m);
    else map.set(id, [m]);
  };
  for (const m of song.marks ?? []) {
    if (m.type !== "slur" && m.type !== "tied" && m.type !== "tuplet") continue;
    add(byStart, m.start, m);
    add(byEnd, m.end, m);
  }
  o3.open("part", ` id="${escAttr(part.id)}"`, surfaceOf(part));
  for (const m of part.measures) measureXml(o3, m, byStart, byEnd, cx);
  o3.close();
}
function scoreDocToMusicXml(doc, options = {}) {
  const src = doc.songs[options.song ?? 0];
  if (!src) throw new Error(t("err.noSong"));
  const song = projectForMusicXml(src, options);
  const cx = { sourceIds: options.sourceIds === true, ...options.layout ? { layout: options.layout } : {} };
  const projected = song !== src;
  const o3 = new Out();
  o3.raw('<?xml version="1.0" encoding="UTF-8"?>');
  o3.raw(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
  );
  o3.open("score-partwise", ' version="3.1"', surfaceOf(song));
  if (song.work.number || song.work.title) {
    o3.open("work");
    if (song.work.number) o3.text("work-number", song.work.number);
    if (song.work.title) o3.text("work-title", song.work.title);
    o3.close();
  }
  if (song.work.movementTitle) o3.text("movement-title", song.work.movementTitle);
  if (song.identification || song.meta || projected) {
    o3.open("identification");
    for (const c of song.identification?.creators ?? []) o3.text("creator", c.text, ` type="${escAttr(c.type)}"`);
    if (song.identification?.rights) o3.text("rights", song.identification.rights);
    o3.open("encoding");
    for (const sw of song.identification?.software ?? ["Dolce"]) o3.text("software", sw);
    o3.close();
    const meta = Object.entries(song.meta ?? {});
    if (meta.length) {
      o3.open("miscellaneous");
      for (const [name, vals] of meta) {
        for (const v of vals) o3.text("miscellaneous-field", v, ` name="${escAttr(name)}"`);
      }
      o3.close();
    }
    o3.close();
  }
  writeDefaults(o3, song.defaults, cx.layout?.systemLayout);
  for (const c of song.credits ?? []) writeCredit(o3, c);
  o3.open("part-list");
  const groups = song.partGroups ?? [];
  for (const g of groups) {
    o3.open("part-group", ` type="start" number="${escAttr(g.number)}"`);
    if (g.symbol) o3.text("group-symbol", g.symbol);
    if (g.name) o3.text("group-name", g.name);
    if (g.abbrev) o3.text("group-abbreviation", g.abbrev);
    if (g.groupBarline) o3.text("group-barline", "yes");
    o3.close();
  }
  for (const p of song.parts) {
    o3.open("score-part", ` id="${escAttr(p.id)}"`, surfaceOf(p, "score-part"));
    if (p.name) o3.text("part-name", p.name);
    else o3.leaf("part-name", ' print-object="no"');
    if (p.abbrev) o3.text("part-abbreviation", p.abbrev);
    o3.close();
  }
  for (const g of groups) o3.leaf("part-group", ` type="stop" number="${escAttr(g.number)}"`);
  o3.close();
  for (const p of song.parts) partXml(o3, p, song, cx);
  o3.close();
  return o3.toString() + "\n";
}
const LETTER_BEAMS = { q: 1, s: 2, d: 3, h: 4 };
const DYNAMIC_COMMAND = new RegExp("^\\\\(?:" + Object.keys(DYNAMICS).join("|") + ")$");
const JUMP_CANON = {
  fine: "Fine",
  dc: "D.C.",
  "d.c.": "D.C.",
  ds: "D.S.",
  "d.s.": "D.S.",
  segno: "Segno",
  tocoda: "ToCoda"
};
const canonicalJump = (word) => JUMP_CANON[word.toLowerCase()] ?? word;
const JUMP_SHORT = {
  Fine: "fine",
  "D.C.": "dc",
  "D.S.": "ds",
  Segno: "hs",
  ToCoda: "ty"
};
function freshIds(obj, ids) {
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    const rec = v;
    if (typeof rec.id === "number") rec.id = ids.next();
    for (const k of Object.keys(rec)) if (k !== "id") walk(rec[k]);
  };
  walk(obj);
  return obj;
}
const ACC = {
  "#": "sharp",
  b: "flat",
  n: "natural",
  "##": "double-sharp",
  bb: "double-flat"
};
const ZERO_SPAN = { line: 0, column: 0, offset: 0, length: 0 };
class JlyLosses {
  seen = /* @__PURE__ */ new Map();
  add(what, raw, span) {
    if (!this.seen.has(what)) this.seen.set(what, { raw, span });
  }
  list() {
    return [...this.seen].map(([what, v]) => t("diag.jly.example", { what, raw: v.raw }));
  }
  /** → 模型诊断（`Diagnostic.source` 必填，所以每个落点都要有 span）。 */
  diagnostics() {
    return [...this.seen].map(([what, v]) => ({
      severity: "warning",
      code: "jly-unsupported",
      message: t("diag.jly.skipped", { what }),
      source: v.span ?? ZERO_SPAN
    }));
  }
}
const NOT_YET = [
  [/^x$/, "diag.jly.nyPercussion"],
  [/^(LP:|:LP|LPH:|:LPH)$/, "diag.jly.nyLp"],
  [/^(KeepLength|ChordsRoman|NoBarNums|NoIndent|OnePage|RaggedLast|SeparateTimesig|angka|WithStaff|PartMidi|RepeatAccidentals|NormalAccidentals)$/, "diag.jly.nyLayout"],
  [/^(chords|frets|instrument)=/, "diag.jly.nyChords"],
  [/^arp(Up|Down)?$/, "diag.jly.nyArp"],
  [/^(Fr=|slide|souyin|harmonic|bend)/, "diag.jly.nyErhu"],
  [/^(letter[A-Z0-9]+|glis|Harm:)$/, "diag.jly.nyMisc"],
  [/^[<>]$/, "diag.jly.nyOctaveShift"],
  [/^[89]$/, "diag.jly.nyOctaveKey"],
  [/^\\/, "diag.jly.nyCommand"]
];
function parseGrace(inner, loss, span) {
  if (inner.includes("&")) {
    loss.add(t("diag.jly.graceChord"), inner, span);
    return null;
  }
  const out = [];
  let i2 = 0;
  while (i2 < inner.length) {
    let beams = 1;
    if (LETTER_BEAMS[inner[i2]] !== void 0) {
      beams = LETTER_BEAMS[inner[i2]];
      i2++;
    }
    let alter = "";
    const two = inner.slice(i2, i2 + 2);
    if (ACC[two]) {
      alter = two;
      i2 += 2;
    } else if (ACC[inner[i2]]) {
      alter = inner[i2];
      i2++;
    }
    if (!/[0-7]/.test(inner[i2] ?? "")) {
      loss.add(t("diag.jly.graceBad"), inner, span);
      return null;
    }
    const degree = Number(inner[i2]);
    i2++;
    let octave = 0;
    let dots = 0;
    while (i2 < inner.length && (inner[i2] === "'" || inner[i2] === "," || inner[i2] === ".")) {
      if (inner[i2] === "'") octave++;
      else if (inner[i2] === ",") octave--;
      else dots++;
      i2++;
    }
    out.push({ degree, alter, octave, dots, beams });
  }
  return out.length ? out : null;
}
function scanWord(word, loss, span) {
  if (word === "-") return { kind: "sustain" };
  if (word === "~") return { kind: "tie" };
  if (word === "(") return { kind: "slur-open", melisma: true };
  if (word === ")") return { kind: "slur-close", melisma: true };
  if (word === "\\(") return { kind: "slur-open", melisma: false };
  if (word === "\\)") return { kind: "slur-close", melisma: false };
  if (word === "]") return { kind: "tuplet-close" };
  if (/^\|+$/.test(word)) return { kind: "bar" };
  if (/^\d+\[$/.test(word)) return { kind: "tuplet-open", n: Number(word.slice(0, -1)) };
  if (/^[\^_]".*"$/.test(word)) return { kind: "text", above: word[0] === "^", value: word.slice(2, -1) };
  if (BARE_DIRECTION.test(word)) return { kind: "jump", text: canonicalJump(word) };
  if (DYNAMIC_COMMAND.test(word)) return { kind: "dynamic", name: word.slice(1) };
  if (word === "\\fermata") return { kind: "fermata" };
  if (word === "\\break") return { kind: "break", page: false };
  if (word === "\\pageBreak") return { kind: "break", page: true };
  if (/^R\*\d+$/.test(word)) return { kind: "multirest", n: Number(word.slice(2)) };
  if (word === "R{") return { kind: "repeat-open" };
  if (/^R[1-9][0-9]*\{$/.test(word)) return { kind: "percent-open", times: Number(word.slice(1, -1)) };
  if (word === "A{") return { kind: "alt-open" };
  if (word === "}") return { kind: "repeat-close" };
  if (/^g\[.*\]$/.test(word)) {
    const notes = parseGrace(word.slice(2, -1), loss, span);
    return notes ? { kind: "grace", notes } : { kind: "loss", what: "grace" };
  }
  for (const [re, what] of NOT_YET) {
    if (re.test(word)) {
      loss.add(t(what), word, span);
      return { kind: "loss", what };
    }
  }
  if ((word.match(/[0-7]/g) ?? []).length >= 2) {
    const chord = scanChordWord(word);
    if (chord) return chord;
  }
  let i2 = 0;
  let alter = "";
  let degree = null;
  let octave = 0;
  let beams = 0;
  let dots = 0;
  let backslashes = 0;
  while (i2 < word.length) {
    const c = word[i2];
    if (c === "#" || c === "b" || c === "n") {
      const two = word.slice(i2, i2 + 2);
      if (!alter && ACC[two]) {
        alter = two;
        i2 += 2;
        continue;
      }
      if (!alter && ACC[c]) {
        alter = c;
        i2 += 1;
        continue;
      }
      return null;
    }
    if (c === "'") {
      octave++;
      i2++;
      continue;
    }
    if (c === ",") {
      octave--;
      i2++;
      continue;
    }
    if (c === ".") {
      dots++;
      i2++;
      continue;
    }
    if (c === "\\") {
      backslashes++;
      i2++;
      continue;
    }
    if (/[0-7]/.test(c)) {
      if (degree !== null) return null;
      degree = Number(c);
      i2++;
      continue;
    }
    if (LETTER_BEAMS[c] !== void 0) {
      beams = LETTER_BEAMS[c];
      i2++;
      continue;
    }
    return null;
  }
  if (degree === null) {
    if (backslashes) {
      loss.add(t("diag.jly.backslash"), word, span);
      return { kind: "loss", what: "backslash" };
    }
    return null;
  }
  if (backslashes) beams = backslashes === 1 ? 1 : 2;
  return { kind: "note", degree, alter, octave, beams, dots };
}
function scanChordWord(word) {
  let i2 = 0;
  let beams = 0;
  while (i2 < word.length && (LETTER_BEAMS[word[i2]] !== void 0 || word[i2] === "\\")) {
    if (word[i2] === "\\") beams = Math.min(2, beams + 1);
    else beams = LETTER_BEAMS[word[i2]];
    i2++;
  }
  let j = word.length;
  let dots = 0;
  while (j > i2 && word[j - 1] === ".") {
    dots++;
    j--;
  }
  const body = word.slice(i2, j);
  const notes = [];
  let k = 0;
  while (k < body.length) {
    let octave = 0;
    let alter = "";
    while (k < body.length && (body[k] === "'" || body[k] === ",")) {
      octave += body[k] === "'" ? 1 : -1;
      k++;
    }
    const two = body.slice(k, k + 2);
    if (ACC[two]) {
      alter = two;
      k += 2;
    } else if (body[k] && ACC[body[k]]) {
      alter = body[k];
      k++;
    }
    const c = body[k];
    if (!c || !/[1-7]/.test(c)) return null;
    k++;
    while (k < body.length && (body[k] === "'" || body[k] === ",")) {
      octave += body[k] === "'" ? 1 : -1;
      k++;
    }
    notes.push({ degree: Number(c), alter, octave, dots: 0, beams });
  }
  if (notes.length < 2) return null;
  const [first, ...rest] = notes;
  return { kind: "note", degree: first.degree, alter: first.alter, octave: first.octave, beams, dots, chord: rest };
}
function isJlyMusicLine(line) {
  const t2 = line.trim();
  if (!t2 || t2.startsWith("%")) return false;
  if (/^[LH]:/.test(t2)) return false;
  if (/^[A-Za-z][A-Za-z0-9]*=/.test(t2)) return false;
  if (/^\d+\/\d+(,\d+)?$/.test(t2)) return false;
  if (/^[1-7]=[A-Ga-g][#b]?$/.test(t2)) return false;
  if (/^\d+(\.\d+)?=\d+$/.test(t2)) return false;
  if (t2 === "NextScore" || t2 === "NextPart") return false;
  return scanMusicLine(t2, new JlyLosses()).tokens.length > 0;
}
function rewrapJlyText(text, measuresPerLine = 4) {
  const rows = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)].map((m) => ({ raw: m[1], sep: m[2] ?? "" })).filter((r2, i2, all) => !(i2 === all.length - 1 && r2.raw === "" && r2.sep === ""));
  const isSep = (raw) => {
    const t2 = raw.trim();
    if (!t2 || t2.startsWith("%")) return false;
    if (t2 === "NextScore" || t2 === "NextPart") return true;
    return /^\d+\/\d+(,\d+)?$/.test(t2) || /^[1-7]=[A-Ga-g][#b]?$/.test(t2) || /^\d+(\.\d+)?=\d+$/.test(t2);
  };
  const segs = [];
  let acc = [];
  for (const r2 of rows) {
    if (isSep(r2.raw)) {
      segs.push(acc);
      acc = [];
      segs.push([r2]);
      continue;
    }
    acc.push(r2);
  }
  segs.push(acc);
  if (segs.length === 1) return rewrapJlyRows(rows, measuresPerLine);
  return segs.map((s2) => s2.length === 1 && isSep(s2[0].raw) ? s2[0].raw + s2[0].sep : rewrapJlyRows(s2, measuresPerLine)).join("");
}
function rewrapJlyRows(rows, measuresPerLine = 4) {
  const isMusic = rows.map((r2) => isJlyMusicLine(r2.raw));
  if (!isMusic.some(Boolean)) return rows.map((r2) => r2.raw + r2.sep).join("");
  const tokens = [];
  const comments = [];
  rows.forEach((r2, i2) => {
    if (!isMusic[i2]) return;
    const at = r2.raw.indexOf("%");
    const body = at >= 0 ? r2.raw.slice(0, at) : r2.raw;
    if (at >= 0) comments.push(r2.raw.slice(at).trim());
    for (const word of body.split(/\s+/).filter(Boolean)) tokens.push(word);
  });
  const lines = [];
  let cur = [];
  let inMeasure = [];
  let count = 0;
  const flushLine = () => {
    if (inMeasure.length) {
      cur.push(...inMeasure);
      inMeasure = [];
    }
    if (cur.length) {
      lines.push(cur.join(" "));
      cur = [];
    }
  };
  for (const tk of tokens) {
    if (/^\|+$/.test(tk) && inMeasure.length) {
      inMeasure.push(tk);
      cur.push(...inMeasure);
      inMeasure = [];
      if (++count >= measuresPerLine) {
        lines.push(cur.join(" "));
        cur = [];
        count = 0;
      }
      continue;
    }
    inMeasure.push(tk);
  }
  flushLine();
  if (comments.length && lines.length) lines[lines.length - 1] += "  " + comments.join(" ");
  const out = [];
  let slot = 0;
  for (const [i2, r2] of rows.entries()) {
    if (!isMusic[i2]) {
      out.push(r2.raw);
      continue;
    }
    if (slot === 0) out.push(...lines);
    slot++;
  }
  const tail = rows.length ? rows[rows.length - 1].sep : "";
  return out.join("\n") + tail;
}
function scanMusicLine(line, loss, spanAt) {
  const tokens = [];
  const pos = [];
  const unknown = [];
  const body = line.replace(/%.*$/, "");
  const re = /\S+/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const word = m[0];
    if (word === "\\bar") {
      const nxt = /\S+/.exec(body.slice(m.index + word.length));
      const arg = nxt ? /^"([^"]*)"$/.exec(nxt[0]) : null;
      if (arg) {
        tokens.push({ kind: "barstyle", style: arg[1] });
        pos.push({ col: m.index, len: word.length + nxt[0].length });
        re.lastIndex = m.index + word.length + nxt.index + nxt[0].length;
        continue;
      }
    }
    const t$1 = scanWord(word, loss, spanAt?.(m.index, word.length));
    if (t$1) {
      tokens.push(t$1);
      pos.push({ col: m.index, len: word.length });
    } else {
      loss.add(t("diag.jly.unknownWord"), word, spanAt?.(m.index, word.length));
      unknown.push(word);
    }
  }
  return { tokens, pos, unknown };
}
function syllablesOf(body, han) {
  const out = [];
  const unquote = (w2) => {
    if (w2.length < 2 || !w2.startsWith('"') || !w2.endsWith('"')) return w2;
    const inner = w2.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    return inner === "" ? null : inner;
  };
  const push = (raw) => {
    const text = unquote(raw);
    if (text === null) {
      if (raw === "") return;
      out.push(null);
      return;
    }
    if (text === "") return;
    if (text.endsWith("-")) out.push({ text: text.slice(0, -1), begin: true });
    else out.push({ text });
  };
  if (han) {
    for (const w2 of body.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? []) {
      if (w2.length >= 2 && w2.startsWith('"') && w2.endsWith('"')) {
        push(w2);
        continue;
      }
      if (w2.includes("_")) {
        const text = w2.split("_").join("");
        if (text) push(text);
        continue;
      }
      for (const ch of w2) if (ch.trim()) push(ch);
    }
    return out;
  }
  const words = body.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
  for (let i2 = 0; i2 < words.length; i2++) {
    const w2 = words[i2];
    if (w2 === "_") {
      out.push(null);
      continue;
    }
    if (/^\\skip\d*$/.test(w2)) {
      out.push(null);
      if (w2 === "\\skip" && /^\d+$/.test(words[i2 + 1] ?? "")) i2++;
      continue;
    }
    push(w2);
  }
  return out;
}
const FIFTHS = {
  Cb: -7,
  Gb: -6,
  Db: -5,
  Ab: -4,
  Eb: -3,
  Bb: -2,
  F: -1,
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "F#": 6,
  "C#": 7
};
const CREDIT_KEYS = /* @__PURE__ */ new Set(["composer", "poet", "lyricist", "arranger", "copyright", "opus"]);
const dotFactor = (dots) => dots === 0 ? 1 : 2 - Math.pow(2, -dots);
const GRACE_TYPES = ["quarter", "eighth", "16th", "32nd", "64th"];
const graceTypeOf = (beams) => GRACE_TYPES[Math.max(0, Math.min(4, Math.round(beams)))];
const tupletNormal = (n) => {
  let p = 1;
  while (p * 2 < n) p *= 2;
  return p;
};
function parseJly(text) {
  const loss = new JlyLosses();
  const unknown = [];
  const doc = emptyDoc("jly");
  const ids = new IdGen();
  let song = emptySong();
  doc.songs.push(song);
  let part = { id: "P1", measures: [] };
  song.parts.push(part);
  let cur = null;
  let prevChordRef = null;
  let openTuplet = null;
  let pendingTie = false;
  let autoVerse = 0;
  const percentStack = [];
  const percentRanges = [];
  let pendingBreak = null;
  const chordTokens = [];
  const repeats = [];
  const slots = [];
  let melismaOpen = 0;
  let pendingMelisma = 0;
  const openSlurs = [];
  const dropOpenSlurs = () => {
    for (const s2 of openSlurs) loss.add(s2.melisma ? t("diag.jly.slurUnpaired") : t("diag.jly.phraseUnpaired"), s2.melisma ? "(" : "\\(", s2.source);
    openSlurs.length = 0;
  };
  const verses = /* @__PURE__ */ new Map();
  const openMeasureRaw = (source) => {
    const m = { number: String(part.measures.length + 1), elements: [] };
    if (source) m.source = source;
    part.measures.push(m);
    return m;
  };
  const openMeasure = (source) => {
    const m = openMeasureRaw(source);
    if (pendingBreak) {
      m.print = { ...m.print ?? {}, ...pendingBreak === "page" ? { newPage: true } : { newSystem: true } };
      pendingBreak = null;
    }
    return m;
  };
  let lineNo = 0;
  let lineOffset = 0;
  const rows = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)].map((m) => ({ raw: m[1], sep: m[2] ?? "" })).filter((r2, i2, all) => !(i2 === all.length - 1 && r2.raw === "" && r2.sep === ""));
  for (let li = 0; li < rows.length; li++) {
    const { raw, sep } = rows[li];
    const indent = raw.length - raw.trimStart().length;
    const spanOf = (col, len) => ({ line: lineNo, column: indent + col, offset: lineOffset + indent + col, length: len });
    const advance = () => {
      lineNo++;
      lineOffset += raw.length + sep.length;
    };
    const line = raw.trim();
    if (!line || line.startsWith("%")) {
      advance();
      continue;
    }
    const mLyric = /^([LH]):\s*(.*)$/.exec(line);
    if (mLyric) {
      const han = mLyric[1] === "H";
      const head = spanOf(indent, line.length);
      let body = mLyric[2] ?? "";
      if (!body) {
        const parts = [];
        while (li + 1 < rows.length) {
          const nxt = rows[li + 1];
          const t2 = nxt.raw.trim();
          if (!t2 || t2.startsWith("%")) break;
          parts.push(t2);
          li++;
          lineNo++;
          lineOffset += nxt.raw.length + nxt.sep.length;
        }
        body = parts.join(" ");
      }
      let verse = "";
      const mv = /^(\d+)\.\s*(.*)$/.exec(body);
      if (mv) {
        verse = mv[1];
        body = mv[2] ?? "";
        autoVerse = Math.max(autoVerse, Number(verse));
      } else {
        verse = String(++autoVerse);
      }
      const key = verse + (han ? "H" : "L");
      const syls = syllablesOf(body, han);
      if (!han && syls.some((s2) => s2 && [...s2.text].filter((c) => /[\u3400-\u9fff]/.test(c)).length > 1)) {
        loss.add(t("diag.jly.hanInL"), body, head);
      }
      const slot = verses.get(key) ?? { han, syllables: [], span: head };
      slot.syllables.push(...syls);
      verses.set(key, slot);
      advance();
      continue;
    }
    const isChordRow = /^chords\s*=/i.test(line);
    const mHead = isChordRow ? null : /^([A-Za-z][A-Za-z0-9]*)=(.*)$/.exec(line);
    if (mHead) {
      const key = mHead[1].toLowerCase();
      const value = mHead[2].trim();
      if (key === "title" || key === "movement-title") song.work.title = value;
      else if (key === "subtitle") song.work.subtitles.push(value);
      else if (CREDIT_KEYS.has(key)) song.credits = [...song.credits ?? [], { type: key, text: value }];
      else loss.add(t("diag.jly.header", { key }), line, spanOf(0, line.length));
      advance();
      continue;
    }
    const mTime = /^(\d+)\/(\d+)(,\d+)?$/.exec(line);
    if (mTime) {
      song.time = { beats: Number(mTime[1]), beatType: Number(mTime[2]) };
      if (mTime[3]) loss.add(t("diag.jly.anacrusis"), line, spanOf(0, line.length));
      advance();
      continue;
    }
    const mKey = /^([1-7])=([A-Ga-g][#b]?)$/.exec(line);
    if (mKey) {
      const tonic = mKey[2];
      const fifths = FIFTHS[tonic] ?? FIFTHS[tonic[0].toUpperCase() + tonic.slice(1)];
      if (fifths === void 0) loss.add(t("diag.jly.key", { v: line }), line, spanOf(0, line.length));
      else song.key = { fifths, spelling: tonic };
      advance();
      continue;
    }
    const mTempo = /^\d+(?:\.\d+)?=(\d+)$/.exec(line);
    if (mTempo) {
      song.tempos = [Number(mTempo[1])];
      advance();
      continue;
    }
    const mChords = /^chords\s*=\s*(.*)$/i.exec(line);
    if (mChords) {
      const head = spanOf(indent, line.length);
      let body = mChords[1] ?? "";
      if (!body) {
        const parts = [];
        while (li + 1 < rows.length) {
          const nxt = rows[li + 1];
          const t2 = nxt.raw.trim();
          if (!t2 || t2.startsWith("%")) break;
          parts.push(t2);
          li++;
          lineNo++;
          lineOffset += nxt.raw.length + nxt.sep.length;
        }
        body = parts.join(" ");
      }
      for (const tok of body.split(/\s+/).filter(Boolean)) {
        const parsed = parseChordToken(tok);
        if (!parsed) {
          loss.add(t("diag.jly.chordToken"), tok, head);
          continue;
        }
        const root = lyPitchToText(parsed.pitch);
        if (root === null) {
          loss.add(t("diag.jly.chordPitch"), tok, head);
          continue;
        }
        const bass = parsed.bass ? lyPitchToText(parsed.bass) : null;
        chordTokens.push({
          song: doc.songs.length - 1,
          text: root + lySuffixToText(parsed.suffix) + (bass ? "/" + bass : ""),
          whole: parsed.whole
        });
      }
      advance();
      continue;
    }
    if (line === "NextScore") {
      finishSong();
      song = emptySong();
      doc.songs.push(song);
      part = { id: "P1", measures: [] };
      song.parts.push(part);
      cur = null;
      prevChordRef = null;
      slots.length = 0;
      melismaOpen = 0;
      pendingMelisma = 0;
      autoVerse = 0;
      dropOpenSlurs();
      advance();
      continue;
    }
    if (line === "NextPart") {
      part = { id: "P" + (song.parts.length + 1), measures: [] };
      song.parts.push(part);
      cur = null;
      prevChordRef = null;
      dropOpenSlurs();
      advance();
      continue;
    }
    const { tokens, pos, unknown: unk } = scanMusicLine(line, loss, spanOf);
    unknown.push(...unk);
    const spanAt = (i2) => spanOf(pos[i2]?.col ?? 0, pos[i2]?.len ?? 0);
    for (let i2 = 0; i2 < tokens.length; i2++) {
      const tk = tokens[i2];
      const lastChord = () => {
        const here = cur?.elements[cur.elements.length - 1];
        if (here && here.kind === "chord") return here;
        const prev = part.measures[part.measures.length - 1];
        const last = prev?.elements[prev.elements.length - 1];
        return last && last.kind === "chord" ? last : null;
      };
      const addJump = (short) => {
        const host = cur ?? part.measures[part.measures.length - 1];
        if (!host) {
          loss.add(t("diag.jly.jumpNoBar"), short, spanAt(i2));
          return;
        }
        const lines = host.barlines ?? (host.barlines = []);
        const right = lines.find((b) => b.location === "right");
        if (right) right.ornaments = [...right.ornaments ?? [], { name: short, level: 0 }];
        else lines.push({ location: "right", source: spanAt(i2), ornaments: [{ name: short, level: 0 }] });
      };
      switch (tk.kind) {
        case "loss":
        case "header":
          break;
        case "text": {
          const host = lastChord();
          if (host) host.sectionWord = host.sectionWord ? host.sectionWord + " " + tk.value : tk.value;
          else loss.add(t("diag.jly.textNoNote"), tk.value, spanAt(i2));
          break;
        }
        case "dynamic": {
          const host = lastChord();
          if (host) {
            const not = { ...host.notations ?? {} };
            not.articulations = [...not.articulations ?? [], tk.name];
            host.notations = not;
          } else loss.add(t("diag.jly.dynNoNote"), tk.name, spanAt(i2));
          break;
        }
        case "fermata": {
          const host = lastChord();
          if (host) host.notations = { ...host.notations ?? {}, fermata: true };
          else loss.add(t("diag.jly.fermataNoNote"), "\\fermata", spanAt(i2));
          break;
        }
        case "jump":
          addJump(JUMP_SHORT[tk.text] ?? "fine");
          break;
        case "break": {
          const host = cur && cur.elements.length ? cur : part.measures[part.measures.length - 1];
          if (!host) {
            loss.add(t("diag.jly.breakNoBar"), tk.page ? "\\pageBreak" : "\\break", spanAt(i2));
            break;
          }
          if (cur && cur.elements.length) {
            const last = cur.elements[cur.elements.length - 1];
            if (last && last.kind === "chord") last.lineBreakAfter = tk.page ? "page" : "system";
          } else {
            pendingBreak = tk.page ? "page" : "system";
          }
          break;
        }
        case "barstyle": {
          const st = tk.style.trim();
          const at = st.startsWith(".") && st.includes(":") ? "left" : "right";
          if (at === "left" && !cur) cur = openMeasure(spanAt(i2));
          const host = at === "left" ? cur : cur && cur.elements.length ? cur : part.measures[part.measures.length - 1];
          if (!host) {
            loss.add(t("diag.jly.barStyleNoBar"), st, spanAt(i2));
            break;
          }
          const lines = host.barlines ?? (host.barlines = []);
          let bl = lines.find((b) => b.location === at);
          if (!bl) {
            bl = { location: at, source: spanAt(i2) };
            lines.push(bl);
          }
          const map = {
            ".|:": { style: "heavy-light", repeat: "forward" },
            ".|": { style: "heavy-light" },
            ":|.": { style: "light-heavy", repeat: "backward" },
            ":|": { style: "light-heavy", repeat: "backward" },
            ":|:": { style: "light-light", repeat: "backward" },
            "|.": { style: "light-heavy" },
            "||": { style: "light-light" },
            "|": { style: "regular" }
          };
          const hit = map[st];
          if (!hit) {
            loss.add(t("diag.jly.barStyle"), st, spanAt(i2));
            break;
          }
          if (hit.style) bl.style = hit.style;
          if (hit.repeat) bl.repeat = hit.repeat;
          if (st === ":|:") bl.alsoForward = true;
          break;
        }
        case "multirest": {
          const beats = (song.time?.beats ?? 4) * (SIMPLE_DIVISIONS * 4 / (song.time?.beatType ?? 4));
          for (let k = 0; k < tk.n; k++) {
            const m = openMeasure(spanAt(i2));
            (m.barlines ??= []).push({ location: "right", style: "regular", source: spanAt(i2) });
            m.elements.push({
              kind: "chord",
              id: ids.next(),
              notes: [],
              duration: { divisions: Math.round(beats), dots: 0, type: "whole" },
              rest: { measure: true },
              voice: 1,
              staff: 1,
              source: spanAt(i2)
            });
            cur = null;
          }
          break;
        }
        case "repeat-open": {
          if (!cur) cur = openMeasure(spanAt(i2));
          const lines = cur.barlines ?? (cur.barlines = []);
          const left = lines.find((b) => b.location === "left");
          if (left) left.repeat = "forward";
          else lines.unshift({ location: "left", style: "heavy-light", repeat: "forward", source: spanAt(i2) });
          repeats.push({ rStart: part.measures.length - 1, rEnd: -1, aStart: -1, aEnd: -1 });
          break;
        }
        case "alt-open": {
          const open = repeats[repeats.length - 1];
          if (!open || open.rEnd < 0) {
            loss.add(t("diag.jly.altNoClose"), "A{", spanAt(i2));
            break;
          }
          if (!cur) cur = openMeasure(spanAt(i2));
          open.aStart = part.measures.length - 1;
          break;
        }
        case "percent-open": {
          percentStack.push({ from: part.measures.length, times: tk.times });
          break;
        }
        case "repeat-close": {
          if (percentStack.length) {
            const p = percentStack.pop();
            if (cur && cur.elements.length) {
              (cur.barlines ??= []).push({ location: "right", style: "regular", source: spanAt(i2) });
              cur = null;
            }
            percentRanges.push({ from: p.from, to: part.measures.length, times: p.times });
            break;
          }
          const open = repeats[repeats.length - 1];
          if (!open) {
            loss.add(t("diag.jly.closeNoOpen"), "}", spanAt(i2));
            break;
          }
          if (cur && cur.elements.length) {
            (cur.barlines ??= []).push({ location: "right", style: "regular", source: spanAt(i2) });
            cur = null;
          }
          if (open.aStart >= 0 && open.aEnd < 0) {
            open.aEnd = part.measures.length - 1;
          } else if (open.rEnd < 0) {
            open.rEnd = part.measures.length - 1;
          } else {
            loss.add(t("diag.jly.closeExtra"), "}", spanAt(i2));
          }
          break;
        }
        case "grace": {
          if (!cur) cur = openMeasure(spanAt(i2));
          for (const g of tk.notes) {
            const note = { degree: { number: g.degree, octaveShift: g.octave } };
            if (g.alter && ACC[g.alter]) {
              note.accidental = ACC[g.alter];
              note.degree.accidental = note.accidental;
            }
            cur.elements.push({
              kind: "chord",
              id: ids.next(),
              notes: [note],
              duration: { divisions: 0, dots: g.dots, type: graceTypeOf(g.beams) },
              grace: {},
              voice: 1,
              staff: 1,
              source: spanAt(i2)
            });
          }
          break;
        }
        case "bar": {
          const bl = { location: "right", style: "regular", source: spanAt(i2) };
          if (cur && cur.elements.length) {
            (cur.barlines ??= []).push(bl);
            cur = null;
          } else {
            if (!cur) cur = openMeasure(spanAt(i2));
            (cur.barlines ??= []).push({ ...bl, location: "left" });
          }
          break;
        }
        case "slur-open":
          {
            const afterNote = tokens[i2 - 1]?.kind === "note" && prevChordRef !== null;
            if (tk.melisma) {
              if (afterNote) melismaOpen++;
              else pendingMelisma++;
            }
            openSlurs.push({ start: afterNote ? prevChordRef.id : null, melisma: tk.melisma, source: spanAt(i2) });
          }
          break;
        case "slur-close": {
          if (tk.melisma) melismaOpen = Math.max(0, melismaOpen - 1);
          let k = openSlurs.length - 1;
          while (k >= 0 && openSlurs[k].melisma !== tk.melisma) k--;
          const open = k >= 0 ? openSlurs.splice(k, 1)[0] : null;
          const end = prevChordRef?.id;
          if (!open || open.start === null || end === void 0 || end === open.start) {
            loss.add(tk.melisma ? t("diag.jly.slurUnpaired") : t("diag.jly.phraseUnpaired"), tk.melisma ? ")" : "\\)", spanAt(i2));
            break;
          }
          song.marks.push({ type: "slur", start: open.start, end, level: openSlurs.length, openSource: open.source, closeSource: spanAt(i2) });
          break;
        }
        case "tuplet-open":
          openTuplet = tk.n;
          break;
        case "tuplet-close":
          openTuplet = null;
          break;
        case "tie":
          pendingTie = true;
          break;
        case "sustain": {
          const host = cur?.elements[cur.elements.length - 1];
          if (host && host.kind === "chord") {
            host.duration = { ...host.duration, divisions: host.duration.divisions + SIMPLE_DIVISIONS };
            host.sustains = [...host.sustains ?? [], { id: ids.next(), source: spanAt(i2) }];
          } else unknown.push("-");
          break;
        }
        case "note": {
          if (!cur) cur = openMeasure(spanAt(i2));
          const divisions = Math.round(SIMPLE_DIVISIONS * Math.pow(2, -tk.beams) * dotFactor(tk.dots));
          const ch = {
            kind: "chord",
            id: ids.next(),
            notes: [],
            duration: { divisions, dots: tk.dots },
            voice: 1,
            staff: 1,
            source: spanAt(i2)
          };
          if (openTuplet !== null) ch.duration.timeMod = { actual: openTuplet, normal: tupletNormal(openTuplet) };
          if (tk.beams > 0) ch.beams = Array.from({ length: tk.beams }, () => "continue");
          let tieStop = false;
          if (tk.degree === 0) {
            ch.rest = {};
          } else {
            const note = { degree: { number: tk.degree, octaveShift: tk.octave } };
            if (tk.alter && ACC[tk.alter]) {
              note.accidental = ACC[tk.alter];
              note.degree.accidental = note.accidental;
            }
            if (pendingTie) {
              const pn = prevChordRef?.notes[0];
              if (pn) {
                pn.tie = { ...pn.tie ?? {}, start: true };
                song.marks.push({ type: "tied", number: 1, start: prevChordRef.id, end: ch.id });
              }
              note.tie = { ...note.tie ?? {}, stop: true };
              tieStop = true;
              pendingTie = false;
            }
            ch.notes.push(note);
            for (const extra of tk.chord ?? []) {
              const n2 = { degree: { number: extra.degree, octaveShift: extra.octave } };
              if (extra.alter && ACC[extra.alter]) {
                n2.accidental = ACC[extra.alter];
                n2.degree.accidental = n2.accidental;
              }
              ch.notes.push(n2);
            }
          }
          cur.elements.push(ch);
          prevChordRef = ch;
          for (const s2 of openSlurs) if (s2.start === null) s2.start = ch.id;
          if (tk.degree !== 0 && !ch.grace && melismaOpen === 0 && !tieStop) slots.push(ch);
          melismaOpen += pendingMelisma;
          pendingMelisma = 0;
          break;
        }
      }
    }
    advance();
  }
  if (pendingBreak) {
    const lastM = part.measures[part.measures.length - 1];
    const lastEl = lastM?.elements[lastM.elements.length - 1];
    if (lastEl && lastEl.kind === "chord") lastEl.lineBreakAfter = pendingBreak;
    else loss.add(t("diag.jly.breakNoNote"), pendingBreak === "page" ? "\\pageBreak" : "\\break", void 0);
    pendingBreak = null;
  }
  function finishSong() {
    for (const r2 of repeats) {
      if (r2.rEnd < 0) continue;
      const last = part.measures[r2.rEnd];
      if (last) {
        const lines = last.barlines ?? (last.barlines = []);
        const right = lines.find((b) => b.location === "right");
        if (right) {
          right.repeat = "backward";
          right.style = "light-heavy";
        } else lines.push({ location: "right", style: "light-heavy", repeat: "backward" });
      }
      if (r2.aStart >= 0) {
        const head = part.measures[r2.aStart];
        const tail = part.measures[r2.aEnd >= 0 ? r2.aEnd : part.measures.length - 1];
        if (head) {
          const lines = head.barlines ?? (head.barlines = []);
          const left = lines.find((b) => b.location === "left");
          const ending = { numbers: [2], type: "start", text: "2" };
          if (left) left.ending = ending;
          else lines.unshift({ location: "left", ending });
        }
        if (tail) {
          const lines = tail.barlines ?? (tail.barlines = []);
          const right = lines.find((b) => b.location === "right");
          const ending = { numbers: [2], type: "discontinue", text: "2" };
          if (right) right.ending = ending;
          else lines.push({ location: "right", style: "light-heavy", ending });
        }
      }
    }
    for (const [key, slot] of verses) {
      const verse = Number(key.replace(/[HL]$/, ""));
      let i2 = 0;
      for (const ch of slots) {
        if (i2 >= slot.syllables.length) break;
        const syl = slot.syllables[i2++];
        if (!syl) continue;
        const lyric = { number: verse, text: syl.text };
        if (syl.begin) lyric.syllabic = "begin";
        if (slot.span) lyric.source = slot.span;
        ch.lyrics = [...ch.lyrics ?? [], lyric];
      }
      if (slot.syllables.length > slots.length) {
        loss.add(
          t("diag.jly.extraSyl", { verse, n: slot.syllables.length - slots.length }),
          slot.syllables.slice(slots.length).map((s2) => s2?.text ?? '""').slice(0, 3).join(" "),
          slot.span
        );
      }
    }
    for (const r2 of [...percentRanges].sort((a, b) => b.from - a.from)) {
      const base = part.measures.slice(r2.from, r2.to);
      if (!base.length || r2.times < 2) continue;
      const copies = [];
      for (let k = 1; k < r2.times; k++) {
        for (const m of base) copies.push(freshIds(structuredClone(m), ids));
      }
      part.measures.splice(r2.to, 0, ...copies);
    }
    const songIdx = doc.songs.indexOf(song);
    const theSong = songIdx >= 0 ? doc.songs[songIdx] : void 0;
    if (theSong) {
      const at = [];
      let acc = 0;
      for (const p of theSong.parts) for (const m of p.measures) for (const el of m.elements) {
        if (el.kind !== "chord") continue;
        at.push({ chord: el, whole: acc / (SIMPLE_DIVISIONS * 4) });
        const tm = el.duration.timeMod;
        acc += tm ? el.duration.divisions * tm.normal / tm.actual : el.duration.divisions;
      }
      if (at.length) {
        const total = acc / (SIMPLE_DIVISIONS * 4);
        let t$1 = 0;
        let carried = 0.25;
        for (const c of chordTokens.filter((x2) => x2.song === songIdx)) {
          const whole = c.whole ?? carried;
          carried = whole;
          let pick = at[0].chord;
          for (const e of at) {
            if (e.whole <= t$1 + 1e-6) pick = e.chord;
            else break;
          }
          pick.harmony = { root: { step: "C", alter: 0 }, kind: "", text: c.text };
          t$1 += whole;
        }
        if (t$1 > total + 1e-6) {
          loss.add(t("diag.jly.chordsTooLong", { n: (t$1 - total).toFixed(2) }), chordTokens.filter((x2) => x2.song === songIdx).slice(-1)[0].text, void 0);
        }
      }
    }
    repeats.length = 0;
    percentRanges.length = 0;
    verses.clear();
    slots.length = 0;
  }
  dropOpenSlurs();
  finishSong();
  doc.diagnostics = loss.diagnostics();
  return { doc, losses: loss.list(), unknown: [...new Set(unknown)] };
}
export {
  A as AccidentalCarry,
  C as CJK_FIELD_ALIAS,
  o as CJK_INSTRUCTION_ALIAS,
  FEATURE_NAMES,
  FORMAT_CAPS,
  IdGen,
  JlyLosses,
  J as JpwFile,
  M2 as META_KEYS,
  R as RepeatSection,
  SIMPLE_DIVISIONS,
  SOURCE_ID_PREFIX,
  TARGET_LABEL,
  Z as ZERO_SPAN,
  C2 as addMeta,
  q as applyBreaks,
  r as breakAfter,
  s as breaksAfterToStart,
  u as breaksOf,
  w as checkMeasureDurations,
  h as creatorOf,
  i as creatorTypeOf,
  x as decoKey,
  decodeJcx,
  y as describeBeatIssue,
  describeLosses,
  z as docView,
  eachChord,
  E as eachElement,
  F as eachMeasure,
  G as eachNote,
  H as eachPart,
  K as elementIndex,
  M as emit123,
  N as emitAbc,
  O as emitJcx,
  P as emitJly,
  Q as emitJpwabc,
  T as emitPu,
  U as emitPuSong,
  V as emitSong,
  emptyDoc,
  emptySong,
  encodeJcx,
  W as expandEndingNumbers,
  featuresUsed,
  X as findElement,
  D as getMeta,
  isJlyMusicLine,
  E2 as isMetaKey,
  Y as jpwToScoreDoc,
  _ as keyNameOf,
  lexMusicLine,
  $ as lyricOfVerse,
  a0 as measureDuration,
  F2 as metaFlag,
  G2 as metaKeyDef,
  I as metaText,
  a1 as normalizeSpelling,
  o2 as overlayMeta,
  a2 as parse123,
  a3 as parseAbc,
  a4 as parseAbcFamily,
  a5 as parseFieldLine,
  a6 as parseInstruction,
  a7 as parseJcx,
  parseJly,
  a8 as parseKey,
  a9 as parseLinebreak,
  aa as parseLyricLine,
  ab as parsePlayOrder,
  ac as parsePu,
  ad as parsePuAst,
  ae as parseTempo,
  af as parseTempoBeat,
  ag as parseTime,
  ah as parseTimes,
  ai as parseVoiceClef,
  aj as phraseCuts,
  planSave,
  ak as primarySong,
  projectForJianpu,
  puArcLosses,
  al as puPhraseLines,
  am as puToScoreDoc,
  an as relayoutDocBreaks,
  ao as relayoutJpwabcText,
  rewrapJlyText,
  scanMusicLine,
  scanWord,
  scoreDocToMusicXml,
  J2 as setMeta,
  ap as sniffDialect,
  aq as spliceComments,
  K2 as splitMetaValue,
  verseCount,
  ar as writeJpwabc
};
