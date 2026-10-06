/**
 * 音符 → MusicXML（**写出端**）。
 *
 * 为什么需要它：MusicXML 是我们与各宿主之间的**唯一中间格式**（用户 2026-10-05 定）。
 *   此前只有"读"（`musicxml.ts`：MusicXML → 各宿主音符），没有"写" ⇒ 生成类（旋律/和声/和弦/织体）
 *   的产物**没法经统一通道落到 ACE**（ACE 的写入端 `ace_import_musicxml` 只吃 MusicXML）。
 *   本模块补上那半：`音符数组 → MusicXML` ⇒ 之后 `sv_import_musicxml`（SV/IX）/ `ace_import_musicxml`（ACE）都能接。
 *
 * 契约（与 `parseMusicXML` 的实测行为对齐，改这里必须连带跑 `server/tests/musicxml-writer.mjs`）：
 *   · **绝不写 `<!DOCTYPE>`**：我们自己的 `parseMusicXML` 会拒 DTD/实体（`scanXmlSafety`）——
 *     写出端带 DOCTYPE 就等于"自己产的文件自己读不回来"（这个坑 2026-10-05 在 Dolce 产物上踩过一次）。
 *   · onset 用**跨小节累加**（解析器就是 `globalOnset + measureOnset`）⇒ 音符不必在小节线切开。
 *   · 同 onset 的音符写成**和弦**（第 2 个起 `<chord/>`）；解析器据此回填同一 onset。
 *   · 空隙写成**显式休止**（不写 `<forward>`：解析器对休止有映射，对 forward 没有）。
 *   · divisions 默认 **12**（四分音符 = 12）：16 分 = 3、三连八分 = 4，够用且省字节。
 *
 * 纪律：**不做静默改动**。压单声部/截断重叠/丢音符一律记进 `warnings`，由调用方如实回报给用户。
 */

export interface WriteNoteQ {
  /** MIDI 音高（C4 = 60） */
  pitch: number;
  /** 起点（**四分音符为单位**，从 0 起） */
  onsetQ: number;
  /** 时值（四分音符为单位） */
  durQ: number;
  /** 歌词（可选；`-` 表示延音） */
  lyric?: string;
  /** 力度：0~1 归一化 **或** 0~127（>1 时按 0~127 解释）。写进小节级 `<sound dynamics="…"/>` */
  velocity?: number;
}

export interface WriteMusicXmlOptions {
  title?: string;
  partName?: string;
  tempoBpm?: number;
  /** 每小节拍数（默认 4） */
  beats?: number;
  /** 以几分音符为一拍（默认 4） */
  beatType?: number;
  /** 调号（升号数，负 = 降号；默认 0 = C） */
  fifths?: number;
  /** 每四分音符的 divisions（默认 12） */
  divisions?: number;
  /** true（默认）= 保留和弦；false = **压成单声部**（ACE Sing 轨用；同 onset 只留最高音，真重叠则截断前音） */
  polyphonic?: boolean;
}

export interface Overlap {
  a: WriteNoteQ;
  b: WriteNoteQ;
  /** 重叠了多少四分音符 */
  overlapQ: number;
}

export interface PlanResult {
  notes: WriteNoteQ[];
  /** 如实记录我们对输入做过的每一次改动（调用方必须回报，别吞掉） */
  warnings: string[];
}

export interface WriteResult extends PlanResult {
  xml: string;
}

const STEP_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STEP_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** MIDI → step/alter/octave（按调号在升/降之间选，免得 Bb 写成 A#）。 */
export function pitchToStepAlterOctave(pitch: number, fifths = 0): { step: string; alter: number; octave: number } {
  const p = Math.max(0, Math.min(127, Math.round(pitch)));
  const name = (fifths < 0 ? STEP_FLAT : STEP_SHARP)[p % 12];
  const step = name[0];
  const alter = name.length > 1 ? (name[1] === "#" ? 1 : -1) : 0;
  // 科学音高记号：C4 = 60 ⇒ octave = floor(p/12) - 1
  const octave = Math.floor(p / 12) - 1;
  return { step, alter, octave };
}

/** 按 onset 分组（同 onset = 和弦）。⚠️ 重叠必须**按组**判：组内成员时长可以不同，
 *  只比"相邻两个音"会漏（2026-10-06 自查发现的边界 bug）。 */
function groupByOnset(notes: WriteNoteQ[]): WriteNoteQ[][] {
  const out: WriteNoteQ[][] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].onsetQ - n.onsetQ) < 1e-6) last.push(n);
    else out.push([n]);
  }
  return out;
}

/** 找出所有**真重叠**（起点不同且前一组还没结束）——同 onset 算和弦，不算重叠。 */
export function findOverlaps(notes: WriteNoteQ[]): Overlap[] {
  const groups = groupByOnset([...notes].sort((a, b) => a.onsetQ - b.onsetQ || b.pitch - a.pitch));
  const out: Overlap[] = [];
  for (let i = 1; i < groups.length; i++) {
    const prev = groups[i - 1];
    const cur = groups[i][0];
    const prevEnd = Math.max(...prev.map((n) => n.onsetQ + n.durQ));
    const overlap = prevEnd - cur.onsetQ;
    if (overlap > 1e-6) {
      const longest = prev.find((n) => Math.abs(n.onsetQ + n.durQ - prevEnd) < 1e-6) || prev[0];
      out.push({ a: longest, b: cur, overlapQ: Math.round(overlap * 1000) / 1000 });
    }
  }
  return out;
}

export function assertNoOverlap(notes: WriteNoteQ[]): { ok: true } | { ok: false; overlaps: Overlap[] } {
  const overlaps = findOverlaps(notes);
  return overlaps.length ? { ok: false, overlaps } : { ok: true };
}

/**
 * 压成**单声部**（给 ACE Sing 轨这类"不许重叠"的目标用）：
 *   · 同 onset（和弦）⇒ 只留**最高音**，其余记 warning（丢了多少个、都是什么音）
 *   · 真重叠 ⇒ 把**前一个音截短**到后一个音的起点（保节奏，不动音高），记 warning
 */
export function flattenToMonophonic(notes: WriteNoteQ[]): PlanResult {
  const warnings: string[] = [];
  const sorted = [...notes].sort((a, b) => a.onsetQ - b.onsetQ || b.pitch - a.pitch);
  const kept: WriteNoteQ[] = [];
  let droppedChordTones = 0;
  for (const n of sorted) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(n.onsetQ - last.onsetQ) < 1e-6) {  // 和弦内音：只留最高（已按 pitch 降序）
      droppedChordTones++;
      continue;
    }
    kept.push({ ...n });
  }
  if (droppedChordTones) warnings.push(`单声部目标：丢弃了 ${droppedChordTones} 个和声音符（每个 onset 只保留最高音）`);
  let truncated = 0;
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1];
    const cur = kept[i];
    const over = prev.onsetQ + prev.durQ - cur.onsetQ;
    if (over > 1e-6) {
      prev.durQ = Math.round((cur.onsetQ - prev.onsetQ) * 1000) / 1000;
      truncated++;
    }
  }
  if (truncated) warnings.push(`单声部目标：${truncated} 个音符被**截短**到后一个音的起点（原谱是重叠/复调）`);
  return { notes: kept, warnings };
}

/** 规划：校验 + 按 `polyphonic` 决定"保留和弦"还是"压单声部"。输入非法项（时值 ≤ 0、音高越界）会被剔除并记 warning。 */
export function planMusicXml(notes: WriteNoteQ[], opts: WriteMusicXmlOptions = {}): PlanResult {
  const warnings: string[] = [];
  const clean: WriteNoteQ[] = [];
  let badDur = 0, badPitch = 0;
  for (const n of notes) {
    const pitch = Math.round(Number(n.pitch));
    const durQ = Number(n.durQ);
    const onsetQ = Number(n.onsetQ);
    if (!Number.isFinite(pitch) || pitch < 0 || pitch > 127) { badPitch++; continue; }
    if (!Number.isFinite(durQ) || durQ <= 0 || !Number.isFinite(onsetQ)) { badDur++; continue; }
    clean.push({ ...n, pitch, durQ: Math.round(durQ * 1e4) / 1e4, onsetQ: Math.round(Math.max(0, onsetQ) * 1e4) / 1e4 });
  }
  if (badDur) warnings.push(`剔除了 ${badDur} 个时值不合法（≤0 或非数）的音符`);
  if (badPitch) warnings.push(`剔除了 ${badPitch} 个音高越界（不在 0~127）的音符`);

  const polyphonic = opts.polyphonic !== false;
  if (!polyphonic) {
    const flat = flattenToMonophonic(clean);
    return { notes: flat.notes, warnings: [...warnings, ...flat.warnings] };
  }
  // 保留和弦：真重叠**不静默裁**，改成"截短前**一整组**"并如实报（同 flatten 的截断策略）
  const out = clean.map((n) => ({ ...n })).sort((a, b) => a.onsetQ - b.onsetQ || b.pitch - a.pitch);
  const groups = groupByOnset(out);
  let truncated = 0;
  for (let i = 1; i < groups.length; i++) {
    const prev = groups[i - 1];
    const curOnset = groups[i][0].onsetQ;
    const prevEnd = Math.max(...prev.map((n) => n.onsetQ + n.durQ));
    if (prevEnd - curOnset > 1e-6) {
      const newDur = Math.round((curOnset - prev[0].onsetQ) * 1000) / 1000;
      if (newDur > 0) for (const n of prev) n.durQ = newDur;   // 组内**每个**成员都截短（否则残留重叠）
      truncated += prev.length;
    }
  }
  if (truncated) warnings.push(`保留了和弦，但 ${truncated} 个音符因**真重叠**被截短到后一个音的起点（需要完整复调请改用支持重叠的目标）`);
  return { notes: out, warnings };
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 时值 → MusicXML `<type>`（取最接近的常规记谱；差值过大就不写 type，让消费端自己算）。 */
function typeName(durQ: number): string | null {
  const table: [number, string][] = [
    [4, "whole"], [3, "half"], [2, "half"], [1.5, "quarter"], [1, "quarter"],
    [0.75, "eighth"], [0.5, "eighth"], [0.375, "16th"], [0.25, "16th"], [0.125, "32nd"], [0.0625, "64th"],
  ];
  for (const [q, name] of table) if (Math.abs(durQ - q) < 1e-6) return name;
  return null;
}

function noteElement(n: WriteNoteQ, divisions: number, fifths: number, isChord: boolean): string {
  const { step, alter, octave } = pitchToStepAlterOctave(n.pitch, fifths);
  const dur = Math.max(1, Math.round(n.durQ * divisions));
  const t = typeName(n.durQ);
  const parts = ["<note>"];
  if (isChord) parts.push("<chord/>");
  parts.push(`<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`);
  parts.push(`<duration>${dur}</duration>`);
  if (t) parts.push(`<type>${t}</type>`);
  parts.push("<voice>1</voice>");
  if (n.lyric !== undefined && n.lyric !== null && String(n.lyric) !== "") {
    parts.push(`<lyric><syllabic>single</syllabic><text>${esc(String(n.lyric))}</text></lyric>`);
  }
  parts.push("</note>");
  return parts.join("");
}

function restElement(durQ: number, divisions: number): string {
  const dur = Math.max(1, Math.round(durQ * divisions));
  const t = typeName(durQ);
  return `<note><rest/><duration>${dur}</duration>${t ? `<type>${t}</type>` : ""}<voice>1</voice></note>`;
}

/**
 * 音符 → MusicXML 文本（外加**如实回报**：我们改过什么）。
 * `polyphonic` 默认 **true**（不破坏调用方给的东西）；ACE Sing 轨请显式传 `polyphonic:false`。
 */
export function notesToMusicXmlResult(notes: WriteNoteQ[], opts: WriteMusicXmlOptions = {}): WriteResult {
  const beats = opts.beats && opts.beats > 0 ? opts.beats : 4;
  const beatType = opts.beatType && opts.beatType > 0 ? opts.beatType : 4;
  const divisions = opts.divisions && opts.divisions > 0 ? opts.divisions : 12;
  const fifths = opts.fifths ?? 0;
  const measureQ = beats * (4 / beatType);

  const plan = planMusicXml(notes, opts);
  const list = plan.notes;
  /* 量化**如实报**（divisions 栅格）：MusicXML 的 `<duration>` 是整数 tick ⇒
   *   · 时值按 tick 取整 ⇒ 后面所有音的**起点会累积漂移**（实测 divisions=12 时 0.1 拍 → 0.083，偏差 0.017/音）
   *   · 短于 1 tick 的音会被**拉长**到 1 tick（`Math.max(1, …)`）
   * 本文件头写着"不做静默改动" ⇒ 这两件事都必须进 warnings。 */
  let maxDurErr = 0, lengthened = 0;
  for (const n of list) {
    const ticks = n.durQ * divisions;
    maxDurErr = Math.max(maxDurErr, Math.abs(Math.round(ticks) / divisions - n.durQ));
    if (Math.round(ticks) < 1) lengthened++;
  }
  if (maxDurErr > 1e-3) {
    plan.warnings.push(`时值被量化到 divisions=${divisions} 的栅格（最大偏差 ${maxDurErr.toFixed(4)} 拍，起点会累积漂移）——要更细就传更大的 \`divisions\``);
  }
  if (lengthened) plan.warnings.push(`${lengthened} 个音符短于 1/${divisions} 拍 ⇒ 被**拉长**到 1 tick（MusicXML 的 duration 只能是整数）`);

  // 按"事件装满一小节就收口"切小节（音符跨小节线**不切**：解析器是跨小节累加的）
  // ⚠️ 和弦组（同 onset）**不可拆**：曾经按"每个音符后判是否满小节"写，结果三音和弦被拆成
  //    「2 个音 + 1 个音」，第三个音被推到下一小节的 onset 2（2026-10-06 单测抓到）。
  const measures: WriteNoteQ[][] = [];
  {
    const groups: WriteNoteQ[][] = [];
    for (const n of list) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last[0].onsetQ - n.onsetQ) < 1e-6) last.push(n);
      else groups.push([n]);
    }
    let cur: WriteNoteQ[] = [];
    let cursor = 0;          // 已写到的时间点（绝对，四分音符）
    let measureStart = 0;    // 当前小节的绝对起点（不等长补齐 ⇒ 时间始终连续）
    let dynSplits = 0;
    /** 力度归一化（null = 没给）：只在值真的变了时切小节，见下面的说明 */
    const vOf = (g: WriteNoteQ[]) => (g[0].velocity === undefined ? null : Math.round(Number(g[0].velocity) * 1000) / 1000);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const onset = g[0].onsetQ;
      if (onset > cursor + 1e-6) {              // 空隙补休止
        cur.push({ pitch: -1, onsetQ: cursor, durQ: onset - cursor });
        cursor = onset;
      }
      for (const n of g) cur.push(n);
      cursor = Math.max(cursor, ...g.map((n) => n.onsetQ + n.durQ));
      /* ⚠️ **力度变化处必须切小节**（2026-10-06 复核抓到的数据错误）：
       *   我们的解析器（`musicxml.ts`）把一个小节里的 `<sound dynamics>` 取**最后一个**并作用于**整小节**
       *   ⇒ 同一小节里逐音给力度会被静默压成"最后一个音的值"（实测写 0.2/0.9/0.3 ⇒ 读回 0.3/0.3/0.3）。
       *   生成类旋律本来就是**逐音**给力度（`melody/generator.ts`），压错了用户听得出来。
       *   这里切小节是**写出端的兜底**（不动已发布的正文明解析器行为）；谱面小节线可能因此不规整 ⇒ 记 warning。 */
      const next = groups[gi + 1];
      const dynChanged = !!next && vOf(next) !== vOf(g);
      if (dynChanged) dynSplits++;
      if (cursor - measureStart >= measureQ - 1e-6 || dynChanged) {
        measures.push(cur);
        cur = [];
        measureStart = cursor;
      }
    }
    if (dynSplits) {
      plan.warnings.push(`力度变化处切了 ${dynSplits} 个小节（否则同一小节内的逐音力度会被解析器压成同一个值）——谱面小节线可能不规整`);
    }
    if (cur.length) measures.push(cur);
    if (!measures.length) measures.push([]);   // 空谱也要有 1 小节
  }

  const head: string[] = [];
  head.push('<?xml version="1.0" encoding="UTF-8"?>');
  head.push('<!-- 由 AKDAgent 生成：音符 → MusicXML（唯一中间格式）· 不带 DOCTYPE（我们的解析器拒 DTD/实体） -->');
  head.push('<score-partwise version="4.0">');
  if (opts.title) head.push(`<work><work-title>${esc(opts.title)}</work-title></work>`);
  head.push('<part-list><score-part id="P1"><part-name>' + esc(opts.partName || "Music") + "</part-name></score-part></part-list>");
  head.push('<part id="P1">');

  const body: string[] = [];
  measures.forEach((evts, mi) => {
    body.push(`<measure number="${mi + 1}">`);
    if (mi === 0) {
      body.push(`<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths></key>` +
        `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>` +
        `<clef><sign>G</sign><line>2</line></clef></attributes>`);
      if (opts.tempoBpm) {
        body.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
          `<per-minute>${Math.round(opts.tempoBpm)}</per-minute></metronome></direction-type>` +
          `<sound tempo="${Math.round(opts.tempoBpm)}"/></direction>`);
      }
    }
    // 力度：写成**小节级** `<sound dynamics="N"/>`（我们的解析器按 running state 处理）
    let lastDyn = -1;
    for (let i = 0; i < evts.length; i++) {
      const n = evts[i];
      if (n.pitch < 0) { body.push(restElement(n.durQ, divisions)); continue; }
      if (n.velocity !== undefined) {
        const v = Number(n.velocity);
        if (Number.isFinite(v)) {
          const pct = Math.max(0, Math.min(100, Math.round(v > 1 ? (v / 127) * 100 : v * 100)));
          if (pct !== lastDyn) {
            body.push(`<direction><direction-type><dynamics><other-dynamics>${pct}</other-dynamics></dynamics></direction-type>` +
              `<sound dynamics="${pct}"/></direction>`);
            lastDyn = pct;
          }
        }
      }
      const prev = i > 0 ? evts[i - 1] : null;
      const isChord = !!prev && prev.pitch >= 0 && Math.abs(prev.onsetQ - n.onsetQ) < 1e-6;
      body.push(noteElement(n, divisions, fifths, isChord));
    }
    body.push("</measure>");
  });

  return { xml: [...head, ...body, "</part>", "</score-partwise>", ""].join("\n"), notes: list, warnings: plan.warnings };
}

/** 只想要文本时用这个。 */
export function notesToMusicXml(notes: WriteNoteQ[], opts: WriteMusicXmlOptions = {}): string {
  return notesToMusicXmlResult(notes, opts).xml;
}

/** 生成类（旋律/和声/和弦/织体）的音符是**拍**为单位 ⇒ 转成本模块的四分音符口径。
 *  `MelodyNote` = `{pitch, startBeat, durBeats, vel?}`（`server/src/melody/generator.ts`）。 */
export function beatsToNoteQ(
  notes: { pitch: number; startBeat: number; durBeats: number; vel?: number; lyric?: string }[],
  opts: { offsetQ?: number } = {},
): WriteNoteQ[] {
  const off = opts.offsetQ || 0;
  return notes.map((n) => ({
    pitch: n.pitch,
    onsetQ: n.startBeat + off,
    durQ: n.durBeats,
    velocity: n.vel,
    lyric: n.lyric,
  }));
}
