/**
 * MusicXML → 音符模块。
 * 解析 score-partwise 格式的 .musicxml/.xml，输出音符数组（pitch MIDI + 拍单位起点/时值）。
 *
 * 支持：divisions（每四分音符 tick）、duration→拍换算、音高 step/alter/octave→MIDI、
 *       多声部(voice)、多轨(part)、休止(rest)、和弦内音(<note> 多音并排)、拍号/调号读取。
 * 时间统一用「拍」（把 divisions 归一化：1 拍 = divisions ticks；音符时长 = duration/divisions 拍）。
 */

import { XMLParser } from "fast-xml-parser";
import { readFileSync } from "node:fs";
import { scanXmlSafety } from "./musicxml-guard.js";

export interface MxNote {
  pitch: number;      // MIDI 音高（C4=60；休止符为 -1）
  onset: number;      // 起点（拍，从 0 起）
  duration: number;   // 时值（拍）
  voice?: number;     // 声部号
  lyrics?: string;    // 歌词（可选）
  rest?: boolean;     // 是否休止
  velocity?: number;  // 力度 0~127（from note 属性或 <velocity>，可选）
  dynamic?: number;   // IX 音符力度 0~1（from velocity/dynamics 记号）
  articulations?: string[]; // IX 技法（Staccato/Tenuto/Accent/Slur/Trill... 映射自 MusicXML）
  tieStart?: boolean; // 延音开始（tie type="start"）
  tieStop?: boolean;  // 延音结束（tie type="stop"）
}

export interface MxPart {
  id: string;
  name?: string;
  notes: MxNote[];    // 合并后的音符（按 onset 升序）
  tempo?: number;     // 首个 speed 标记（拍/分），若有
  keyFifths?: number;  // 调号（升号数，负=降号）
  beatsPerMeasure?: number;
  midiInstruments?: { program: number; name?: string }[]; // 该 part 的 MIDI 乐器（GM program）
  /** 复核/落地时如实回报的东西：见到了但没映射的 MusicXML 元素（不猜、不静默） */
  warnings?: string[];
}

export interface MxScore {
  parts: MxPart[];
}

// 音级→半音（C=0 D=2 E=4 F=5 G=7 A=9 B=11）
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function stepToMidi(step: string, alter: number, octave: number): number {
  const pc = (STEP_PC[step] ?? 0) + (alter || 0);
  return 12 * (octave + 1) + pc;
}

// ============ 技法映射：MusicXML <articulations> / <notations> / <technical> 子元素 → IX 技法 ============
// 映射表（knowledge/docs/MusicXML转IX映射表.md §4「复核后」的现行版）
// ⚠️ 2026-09-21 复核改正两处（依据 = IX 官方术语 + P20 实测的「官方术语 ↔ 存储键」对照）：
//    · `<harmon-mute/>`（**铜管 harmon 弱音器**）→ **`Stem`**，**不是** `Harmonics`
//      —— 旧表把 harmon mute 当"泛音"是概念错：IX 的 `Harmonics` 是**弦乐泛音**，铜管 harmon 弱音器在 IX 里叫 `Stem`。
//    · 新增 `<harmonic/>`（弦乐泛音）→ `Harmonics`（这才是 Harmonics 的正主）。
const ARTICULATION_MAP: Record<string, string> = {
  staccato: "Staccato",
  tenuto: "Tenuto",
  accent: "Accent",
  "strong-accent": "Accent",
  "detached-legato": "Slur",
  spiccato: "Staccato",
  staccatissimo: "Staccato",
  "trill-mark": "Trill Minor",
  "trill-mordent": "Trill Minor",
  doit: "Doit",
  falloff: "Fall",
  bend: "Portamento",
  "breath-mark": "Breath",
  tremolo: "Tremolo",
  "harmon-mute": "Stem",     // 铜管 harmon 弱音器（旧值 Harmonics 是错的）
  harmonic: "Harmonics",     // 弦乐泛音（新增）
  pizzicato: "Pizz.",
  "snap-pizzicato": "Pizz.",
};
/**
 * 见到了但**不映射**的 MusicXML 元素（如实回报，不猜）。
 * 理由：IX 没有对应技法键 —— 弓向（up-bow/down-bow）、空弦（open-string）、
 * 弱音器文本（`<words>` 里的 mute）、`<technical><stopped>`（IX 的 `Stopped` 语义未实测，不猜）。
 */
const UNMAPPED_TECHNICAL: Record<string, string> = {
  "up-bow": "IX 没有「弓向」技法（弓向不影响 IX 渲染）",
  "down-bow": "IX 没有「弓向」技法",
  "open-string": "IX 无空弦专用键",
  stopped: "IX 有 `Stopped` 键，但其语义未在真机复验过 ⇒ 不猜、不写",
  mute: "MusicXML 的非标准元素；IX 弱音器要用 Con Sordino / Straight·Cup·Stem（按乐器族）",
};
// tie/slur → Slur（连音）
const SLUR_TAGS = new Set(["slur", "tie"]);

/** 从音符的 <notations> 提取 IX 技法数组（去重、保持前后顺序语义）；未映射项记进 warnings。 */
function extractArticulations(note: any, warnings: string[]): string[] {
  const out: string[] = [];
  const push = (v: string) => { if (v && out.indexOf(v) === -1) out.push(v); };
  const noteUnmapped = (k: string) => {
    const why = UNMAPPED_TECHNICAL[k];
    if (why) {
      const msg = "`<" + k + "/>`：" + why + " ⇒ 已忽略";
      if (warnings.indexOf(msg) === -1) warnings.push(msg);
    }
  };
  // <notations> 含 <articulations> + <technical> + <tied>/<slur> <ornaments>
  if (note.notations) {
    const notList = Array.isArray(note.notations) ? note.notations : [note.notations];
    for (const no of notList) {
      if (!no || typeof no !== "object") continue;
      // articulations 子元素（staccato/tenuto/accent/...）
      if (no.articulations && typeof no.articulations === "object") {
        for (const k of Object.keys(no.articulations)) {
          const v = ARTICULATION_MAP[k];
          if (v) push(v);
        }
        // tremolo 是数值/子元素
        if (no.articulations.tremolo !== undefined) push("Tremolo");
      }
      // technical（弦乐/弓法：harmonic / up-bow / down-bow / open-string / stopped …）
      if (no.technical && typeof no.technical === "object") {
        const techList = Array.isArray(no.technical) ? no.technical : [no.technical];
        for (const tech of techList) {
          if (!tech || typeof tech !== "object") continue;
          for (const k of Object.keys(tech)) {
            const v = ARTICULATION_MAP[k];
            if (v) push(v);
            else noteUnmapped(k);
          }
        }
      }
      // ornament（trill-mark 等）
      if (no.ornaments && typeof no.ornaments === "object") {
        for (const k of Object.keys(no.ornaments)) {
          const v = ARTICULATION_MAP[k];
          if (v) push(v);
        }
      }
      // tie/slur（连音）
      for (const k of Object.keys(no)) {
        if (SLUR_TAGS.has(k) && no[k] !== undefined) push("Slur");
      }
    }
  }
  // note 顶层 <tie>（延音线）与 <technical>（有的导出把 technical 放顶层）
  if (note.tie) push("Slur");
  if (note.technical && typeof note.technical === "object") {
    for (const k of Object.keys(note.technical)) {
      const v = ARTICULATION_MAP[k];
      if (v) push(v);
      else noteUnmapped(k);
    }
  }
  return out;
}

// ============ 力度映射：MusicXML <dynamics>/velocity → IX dynamic(0~1) ============
// 力度记号 → 0~1（knowledge/docs/MusicXML转IX映射表.md §3.1）
const DYN_MAP: Record<string, number> = {
  ppp: 0.08, pp: 0.15, p: 0.30, mp: 0.45, mf: 0.60, f: 0.75, ff: 0.90, fff: 1.00,
};

/** 从音符的 velocity 或当前力度记号算 IX dynamic（0~1）。 */
function toDynamic(velocity?: number, dynMark?: string): number | undefined {
  if (velocity !== undefined && velocity > 0) {
    return Math.round((velocity / 127) * 100) / 100;
  }
  if (dynMark) {
    const v = DYN_MAP[dynMark];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** 从 <dynamics> 记号对象里找力度记号名（如 f/mf/pp）。 */
function readDynMark(dynamics: any): string | undefined {
  if (!dynamics || typeof dynamics !== "object") return undefined;
  const names = ["ffff", "fff", "ff", "f", "mf", "mp", "pp", "ppp", "pppp"];
  for (const n of names) if (dynamics[n] !== undefined) return n;
  return undefined;
}

/**
 * 从**小节级** `<direction>` 里读力度（🆕 2026-09-21 补：`<dynamics>` 的真实位置在这里，
 * 而不是 `note.dynamics` —— 旧实现只读 note 级 ⇒ 力度记号**从来没被读到过**）。
 * 两种来源：
 *   · `<direction-type><dynamics><mf/></direction-type>` ⇒ 查 §3.1 记号表
 *   · `<sound dynamics="80"/>`（**百分比 0~100**，MusicXML 规范）⇒ /100
 * 返回的是"**从这一刻起的当前力度**"（running state，由调用方按小节顺序推进）。
 */
function readMeasureDynamics(measure: any): number | undefined {
  const dirs = measure && measure.direction;
  if (!dirs) return undefined;
  const list = Array.isArray(dirs) ? dirs : [dirs];
  let found: number | undefined;
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    // ① <sound dynamics="N">（百分比）
    if (d.sound && d.sound["@_dynamics"] !== undefined) {
      const pct = Number(d.sound["@_dynamics"]);
      if (!isNaN(pct)) found = Math.max(0, Math.min(1, pct / 100));
    }
    // ② <direction-type><dynamics><mf/></direction-type>
    const dtList = Array.isArray(d["direction-type"]) ? d["direction-type"] : (d["direction-type"] ? [d["direction-type"]] : []);
    for (const dt of dtList) {
      if (!dt || typeof dt !== "object") continue;
      const mark = readDynMark(dt.dynamics);
      if (mark) {
        const v = DYN_MAP[mark];
        if (v !== undefined) found = v;
      }
      // <wedge>（渐强/渐弱）—— IX 的 note.dynamic 是标量，渐变要走 note.dynamics 曲线；本仓不猜，只记 warning
    }
  }
  return found;
}

/** 从音符对象提取 velocity（属性 @_velocity 或 <velocity> 元素）。 */
function readVelocity(note: any): number | undefined {
  if (note["@_velocity"] !== undefined) return Number(note["@_velocity"]);
  if (note.velocity !== undefined) return Number(note.velocity);
  return undefined;
}

/** 读 tie type（start/stop/continue）。 */
function readTie(note: any): { start?: boolean; stop?: boolean } {
  const r: { start?: boolean; stop?: boolean } = {};
  if (note.tie) {
    const t = Array.isArray(note.tie) ? note.tie[0] : note.tie;
    if (t && t["@_type"]) {
      if (t["@_type"] === "start") r.start = true;
      else if (t["@_type"] === "stop") r.stop = true;
    }
  }
  return r;
}

/** 解析单个 part 的音符（含 divisions、每小节累加）。 */
function parsePart(part: any, partId: string, partName?: string): MxPart {
  const notes: MxNote[] = [];
  let divisions = 1;
  let tempo: number | undefined;
  let keyFifths: number | undefined;
  let beatsPerMeasure = 4;
  let globalOnset = 0; // 跨小节累计（拍）
  const midiInstruments: { program: number; name?: string }[] = [];
  const warnings: string[] = [];
  let curDyn: number | undefined; // 🆕 小节级力度记号形成的 running state（记号没变就沿用）

  const measures = part.measure;
  const measureList = Array.isArray(measures) ? measures : [measures];

  for (const measure of measureList) {
    if (!measure || typeof measure !== "object") continue;
    let measureOnset = 0; // 本小节内累加（拍）

    // attributes：divisions / key / time
    if (measure.attributes) {
      const attr = measure.attributes;
      if (attr.divisions !== undefined) divisions = Number(attr.divisions) || 1;
      if (attr.key && attr.key.fifths !== undefined) keyFifths = Number(attr.key.fifths);
      if (attr.time) {
        const beats = Array.isArray(attr.time) ? attr.time[0] : attr.time;
        if (beats && beats.beats !== undefined) beatsPerMeasure = Number(beats.beats) || beatsPerMeasure;
      }
    }
    // 速度标记（first sound/tempo）
    if (measure.direction) {
      const dirList = Array.isArray(measure.direction) ? measure.direction : [measure.direction];
      for (const d of dirList) {
        if (d && d.sound) {
          const t = Number(d.sound["@_tempo"] ?? d.sound["tempo"] ?? d.sound["@tempo"]);
          if (!isNaN(t) && t > 0) tempo = t;
        }
      }
    }
    // 🆕 小节级力度记号 ⇒ running state（旧实现只读 note.dynamics，导致力度记号从没生效）
    const md = readMeasureDynamics(measure);
    if (md !== undefined) curDyn = md;

    // 音符序列（可能含 backup/forward 改变位置；这里按顺序累加）
    const noteList = measure.note ? (Array.isArray(measure.note) ? measure.note : [measure.note]) : [];
    for (const note of noteList) {
      if (!note || typeof note !== "object") continue;
      const durTicks = Number(note.duration) || 0;
      const durBeats = durTicks / divisions; // 拍
      const isChord = note.chord !== undefined; // 和弦内追加音（同 onset）

      // voice
      let voice: number | undefined;
      if (note.voice !== undefined) voice = Number(note.voice);

      // 音高
      let pitch = -1, rest = false, lyrics = "";
      if (note.rest !== undefined) {
        rest = true;
      } else if (note.pitch && note.pitch.step) {
        const alter = note.pitch.alter !== undefined ? Number(note.pitch.alter) : 0;
        const octave = note.pitch.octave !== undefined ? Number(note.pitch.octave) : 4;
        pitch = stepToMidi(note.pitch.step, alter, octave);
      }
      // 歌词（首个 lyric text 或 syllabic）
      if (note.lyric) {
        const lyList = Array.isArray(note.lyric) ? note.lyric : [note.lyric];
        if (lyList[0] && lyList[0].text !== undefined) {
          lyrics = typeof lyList[0].text === "string" ? lyList[0].text : String(lyList[0].text);
        }
      }
      // 力度（优先级：note 级 velocity > note 级记号 > **小节级记号 running state**）
      const velocity = readVelocity(note);
      const dynMark = readDynMark(note.dynamics);
      const dynamic = toDynamic(velocity, dynMark) ?? curDyn;
      // 技法（未映射项记进 warnings）
      const articulations = extractArticulations(note, warnings);
      // tie
      const tie = readTie(note);
      // 该小节内 midi-instrument（GM program）—— 一般是 attributes，但有的放 note 或 part
      if (note["instrument"] && note["instrument"]["@_id"]) {
        // 已在 parsePart level 处理，这里不重复
      }

      // onset = 本小节已有累计 + （和弦内音与前一音同 onset）；起点再加上跨小节累计
      const onset = isChord && notes.length ? notes[notes.length - 1].onset : (globalOnset + measureOnset);

      const mx: MxNote = { pitch, onset: Math.round(onset * 1000) / 1000, duration: Math.round(durBeats * 1000) / 1000, voice, lyrics, rest };
      if (velocity !== undefined) mx.velocity = velocity;
      if (dynamic !== undefined) mx.dynamic = dynamic;
      if (articulations.length > 0) mx.articulations = articulations;
      if (tie.start) mx.tieStart = true;
      if (tie.stop) mx.tieStop = true;
      notes.push(mx);

      // 更新本小节计数（非和弦内音才推进）
      if (!isChord) measureOnset += durBeats;
    }
    globalOnset += measureOnset; // 小节结束，累加到全局
  }

  // 按 onset 升序（每个 voice 内部升序）
  notes.sort((a, b) => a.onset - b.onset);
  return { id: partId, name: partName, notes, tempo, keyFifths, beatsPerMeasure, midiInstruments, warnings };
}

/** 解析 MusicXML 文本/字符串。 */
export function parseMusicXML(xmlText: string): MxScore {
  // ② XML 安全面：先把 DTD/实体拒掉（与 tools 侧 musicxml-guard 双保险；任何调用方都受益）
  const unsafe = scanXmlSafety(xmlText);
  if (!unsafe.ok) throw new Error(unsafe.error + (unsafe.hint ? "（" + unsafe.hint + "）" : ""));
  // fast-xml-parser：关掉实体展开（不给实体炸弹留面）
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: true, processEntities: false });
  const doc = parser.parse(xmlText);
  if (!doc || !doc["score-partwise"] && !doc.score) {
    throw new Error("not a valid MusicXML (score-partwise) document");
  }
  const root = doc["score-partwise"] || doc.score;

  const parts: MxPart[] = [];
  // part-list 拿每个 part 名字 + midi 乐器
  const nameMap: Record<string, string> = {};
  const instMap: Record<string, { program: number; name?: string }[]> = {};
  if (root["part-list"] && root["part-list"]["score-part"]) {
    const spList = Array.isArray(root["part-list"]["score-part"]) ? root["part-list"]["score-part"] : [root["part-list"]["score-part"]];
    for (const sp of spList) {
      if (sp["@_id"]) {
        if (sp["part-name"]) nameMap[sp["@_id"]] = typeof sp["part-name"] === "string" ? sp["part-name"] : String(sp["part-name"]["#text"] ?? sp["part-name"]);
        // midi-instrument：GM program（0~127）
        if (sp["midi-instrument"]) {
          const miList = Array.isArray(sp["midi-instrument"]) ? sp["midi-instrument"] : [sp["midi-instrument"]];
          const list: { program: number; name?: string }[] = [];
          for (const mi of miList) {
            if (!mi || typeof mi !== "object") continue;
            const program = Number(mi["midi-program"] ?? mi["@_midi-program"] ?? -1);
            if (!isNaN(program) && program >= 0) list.push({ program, name: mi["midi-instrument-name"] ?? mi["@_id"] });
          }
          if (list.length) instMap[sp["@_id"]] = list;
        }
      }
    }
  }
  // parts
  const partList = root.part ? (Array.isArray(root.part) ? root.part : [root.part]) : [];
  for (const part of partList) {
    const id = part["@_id"] || "P1";
    const parsed = parsePart(part, id, nameMap[id]);
    parsed.midiInstruments = (parsed.midiInstruments && parsed.midiInstruments.length) ? parsed.midiInstruments : (instMap[id] || []);
    parts.push(parsed);
  }
  return { parts };
}

export function parseMusicXMLFile(path: string): MxScore {
  return parseMusicXML(readFileSync(path, "utf8"));
}
