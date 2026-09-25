/**
 * 织体渲染：把「和弦序列 + （可选）模板」变成音符（P7「IX 织体生成」的可算部分）
 *
 * **纯函数、无宿主依赖** ⇒ 可离线单测（`server/tests/texture.mjs`）。
 * 各织体型的实现来源如实标注：
 *   - `imitate`  —— 照搬 `[IX]模板织体生成.js` 的序位映射（已实测可用）
 *   - `block` / `broken` / `arpeggio` —— 复用 `audio/chords.ts` 的 `chordsToNotes`
 *   - `sustain` / `counter` —— 本仓简单版（根音/五音，**声明为简单版**，不是成品编配）
 *   - `ostinato` / `riff` —— 与 `imitate` **同一条映射**（模板**允许多个小节**，按 `numBars` 周期循环）；
 *     差别只在语义与乐器取向（ostinato 偏弦乐/合成器，riff 偏铜管/lead），无模板时降级为 `broken` 并**如实告知**
 * **未实现**：真正意义的 `riff` 加花、`counter` 对位旋律线（v1 不做，别假装覆盖）
 */

import { parseChordName } from "../audio/chords.js";
import { chordsToNotes } from "../audio/chords.js";
import type { NoteChordAnalysis } from "./chords-from-notes.js";
import { windowsToSegs } from "./chords-from-notes.js";
import { abstractTemplate, instantiateTemplate, type TemplateAbstract, type TemplateNoteOut } from "./template.js";
import { liftIntoRange } from "./instruments.js";
import type { InstrumentDef, TextureType } from "./instruments.js";

const ROOT_BASE = 48;

export interface RenderOptions {
  /** 生成范围（小节号，1 起；含端点）*/
  rangeStartBar?: number;
  rangeEndBar?: number;
  /** 保留模板小节原样（`imitate` 默认 true）*/
  preserveTemplate?: boolean;
  voicingShift?: number;
  octaveShift?: number;
}

export interface RenderResult {
  notes: TemplateNoteOut[];
  /** 实际用到的织体型（可能因缺模板而降级）*/
  usedTexture: TextureType;
  skeletonOnly: boolean;
  warnings: string[];
  range: { startBar: number; endBar: number } | null;
}

/** 和弦窗口 → 根音/五音长音（sustain 简单版）*/
function sustainNotes(analysis: NoteChordAnalysis, inst: InstrumentDef, range?: { startBar: number; endBar: number }): { notes: TemplateNoteOut[]; lifted: number } {
  const out: TemplateNoteOut[] = [];
  let lifted = 0;
  for (const w of analysis.windows) {
    if (w.name === "-") continue;
    if (range && (w.bar < range.startBar || w.bar > range.endBar)) continue;
    const p = parseChordName(w.name);
    if (!p) continue;
    const root = ROOT_BASE + p.rootPc;
    const fifthRel = p.intervals.length >= 3 ? p.intervals[2] : 7;
    // ⚠️ 2026-09-21：越界不再丢，先整八度挪进域内（旧行为会让长笛在 C 和弦上**整小节无音**）
    for (const raw of [root, root + fifthRel]) {
      const x = liftIntoRange(raw, inst.range);
      if (x !== raw) lifted++;
      if (x >= inst.range[0] && x <= inst.range[1]) out.push({ pitch: x, onsetBlick: w.startBlick, durationBlick: w.durationBlick });
    }
  }
  return { notes: out, lifted };
}

/** 根—五 四分走句（counter 简单版）*/
function counterNotes(analysis: NoteChordAnalysis, inst: InstrumentDef, range?: { startBar: number; endBar: number }): { notes: TemplateNoteOut[]; lifted: number } {
  const out: TemplateNoteOut[] = [];
  let lifted = 0;
  const q = analysis.blickPerBeat;
  for (const w of analysis.windows) {
    if (w.name === "-") continue;
    if (range && (w.bar < range.startBar || w.bar > range.endBar)) continue;
    const p = parseChordName(w.name);
    if (!p) continue;
    const low = ROOT_BASE - 12 + p.rootPc;
    const fifth = low + (p.intervals.length >= 3 ? p.intervals[2] : 7);
    const beats = Math.max(1, Math.round(w.durationBlick / q));
    for (let b = 0; b < beats; b++) {
      const raw = b % 2 === 0 ? low : fifth;
      const pitch = liftIntoRange(raw, inst.range);   // 越界先挪八度（2026-09-21）
      if (pitch !== raw) lifted++;
      if (pitch < inst.range[0] || pitch > inst.range[1]) continue;
      out.push({ pitch, onsetBlick: w.startBlick + b * q, durationBlick: q });
    }
  }
  return { notes: out, lifted };
}

/**
 * 渲染织体。
 * `template` 为空时：`imitate` / `ostinato` / `riff` 会**降级为 `broken`** 并在 `warnings` 里说明。
 */
export function renderTexture(
  analysis: NoteChordAnalysis,
  inst: InstrumentDef,
  texture: TextureType,
  template: TemplateAbstract | null,
  opts: RenderOptions = {},
): RenderResult {
  const warnings: string[] = [];
  const withChord = analysis.windows.filter((w) => w.name !== "-");
  const defStart = opts.rangeStartBar ?? (withChord[0]?.bar ?? 1);
  const defEnd = opts.rangeEndBar ?? (withChord[withChord.length - 1]?.bar ?? defStart);
  const range = { startBar: defStart, endBar: defEnd };
  const pitchRange: [number, number] = inst.range;

  // ① 模板模仿（ostinato / riff 走同一条映射 —— **模板允许多小节**，按 `numBars` 循环）
  const needsTemplate: TextureType[] = ["imitate", "ostinato", "riff"];
  if (needsTemplate.includes(texture)) {
    if (template && template.voices.length > 0) {
      const use = template;
      const res = instantiateTemplate(use, analysis, {
        rangeStartBar: range.startBar,
        rangeEndBar: range.endBar,
        preserveTemplate: opts.preserveTemplate ?? texture === "imitate",
        voicingShift: opts.voicingShift,
        octaveShift: opts.octaveShift,
        pitchRange,
      });
      if (res.notes.length === 0) warnings.push("模板实例化后没有音符（检查模板小节是否落在有和弦的小节、或音域过滤过严）");
      if (res.droppedOutOfRange > 0) warnings.push(`模板实例化丢弃 ${res.droppedOutOfRange} 个超出乐器音域 ${inst.range[0]}–${inst.range[1]} 的音`);
      if (res.emptyBars.length > 0) warnings.push(`这些小节没有可用模板音：${res.emptyBars.join("/")}`);
      if (texture !== "imitate") {
        warnings.push(`${texture} 与 imitate 是同一条映射（模板 ${use.numBars} 小节按周期循环）；差别只在语义与乐器取向`);
      }
      return { notes: res.notes, usedTexture: texture, skeletonOnly: false, warnings, range };
    }
    warnings.push(`没拿到模板 ⇒ ${texture} 降级为 broken 骨架（要模仿请先在工程里写好并选中第 1 小节，或用 templateNotes 传入）`);
    const notes = chordsToNotes(windowsToSegs(analysis), { pattern: "broken", octaveShift: opts.octaveShift ?? 0 })
      .map((n) => ({ ...n, pitch: liftIntoRange(n.pitch, pitchRange) }))
      .filter((n) => n.pitch >= pitchRange[0] && n.pitch <= pitchRange[1])
      .filter((n) => {
        const b = Math.floor(n.onset / analysis.blickPerBar) + 1;
        return b >= range.startBar && b <= range.endBar;
      });
    return { notes: notes.map((n) => ({ pitch: n.pitch, onsetBlick: n.onset, durationBlick: n.duration })), usedTexture: "broken", skeletonOnly: true, warnings, range };
  }

  // ② 三类骨架（已有实现）
  if (texture === "block" || texture === "broken" || texture === "arpeggio") {
    const notes = chordsToNotes(windowsToSegs(analysis), { pattern: texture, octaveShift: opts.octaveShift ?? 0 })
      .map((n) => ({ ...n, pitch: liftIntoRange(n.pitch, pitchRange) }))
      .filter((n) => n.pitch >= pitchRange[0] && n.pitch <= pitchRange[1])
      .filter((n) => {
        const b = Math.floor(n.onset / analysis.blickPerBar) + 1;
        return b >= range.startBar && b <= range.endBar;
      });
    return {
      notes: notes.map((n) => ({ pitch: n.pitch, onsetBlick: n.onset, durationBlick: n.duration })),
      usedTexture: texture,
      skeletonOnly: false,
      warnings: ["骨架已按 pattern 铺开；切分/加花等细化需在骨架上再改音符（见 sv-texture §3.2）"],
      range,
    };
  }

  // ③ 简单版
  if (texture === "sustain") {
    const s = sustainNotes(analysis, inst, range);
    return { notes: s.notes, usedTexture: texture, skeletonOnly: false, range,
      warnings: ["sustain = 根音+五音长音（简单版，未做内声部处理）" +
        (s.lifted > 0 ? ` · ${s.lifted} 个音整八度移入音域 ${inst.range[0]}–${inst.range[1]}` : "")] };
  }
  if (texture === "counter") {
    const c = counterNotes(analysis, inst, range);
    return { notes: c.notes, usedTexture: texture, skeletonOnly: false, range,
      warnings: ["counter = 根—五 四分走句（简单版，非对位旋律线）" +
        (c.lifted > 0 ? ` · ${c.lifted} 个音整八度移入音域 ${inst.range[0]}–${inst.range[1]}` : "")] };
  }

  // ④ 其余
  warnings.push(`织体 ${texture} 在 v1 未实现 ⇒ 降级为 block 骨架（riff 加花 / 对位旋律线留待后续，别当成已覆盖）`);
  const notes = chordsToNotes(windowsToSegs(analysis), { pattern: "block", octaveShift: opts.octaveShift ?? 0 })
    .map((n) => ({ ...n, pitch: liftIntoRange(n.pitch, pitchRange) }))
    .filter((n) => n.pitch >= pitchRange[0] && n.pitch <= pitchRange[1])
    .filter((n) => {
      const b = Math.floor(n.onset / analysis.blickPerBar) + 1;
      return b >= range.startBar && b <= range.endBar;
    });
  return { notes: notes.map((n) => ({ pitch: n.pitch, onsetBlick: n.onset, durationBlick: n.duration })), usedTexture: "block", skeletonOnly: true, warnings, range };
}
