/**
 * `音符 → MusicXML`（写出端）的**离线单测**。
 * 运行：cd server && npm run build && node tests/musicxml-writer.mjs
 *
 * 为什么值得测：写出端的产物**只喂给我们自己的解析器**（`sv_import_musicxml` / `ace_import_musicxml`
 *   都走 `parseMusicXML`）⇒ 判据就是**往返一致**：写出去再读回来，音高/起点/时值必须对得上。
 *   这条链 2026-10-05 出过事故（Dolce 产物带 DOCTYPE ⇒ 我们自己的解析器拒收），所以这里专门钉住
 *   "输出不带 DOCTYPE"、"跨小节长音不被切碎"、"和弦用 <chord/>"、"空隙补显式休止" 这几条。
 *
 * 覆盖：① 基本往返（音高/起点/时值/歌词）② 无 DOCTYPE ③ 空隙补休止不影响绝对起点
 *      ④ 和弦（同 onset）⑤ 压单声部（丢和弦音 / 截断真重叠，都有 warning）⑥ 保留和弦时真重叠也如实报
 *      ⑦ 非法输入被剔除并报 ⑧ 拍→四分音符换算 ⑨ 跨小节长音 ⑩ 速度/调号（降号调写 Bb 不写 A#）
 *      ⑪ 力度写成小节级 <sound dynamics>
 */
import { parseMusicXML } from "../dist/audio/musicxml.js";
import {
  notesToMusicXml, notesToMusicXmlResult, planMusicXml, flattenToMonophonic,
  findOverlaps, assertNoOverlap, beatsToNoteQ, pitchToStepAlterOctave,
} from "../dist/audio/musicxml-writer.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};

/** 往返：写 → 解析 → 只留有声音符（丢掉休止） */
function roundTrip(notes, opts) {
  const xml = notesToMusicXml(notes, opts);
  const score = parseMusicXML(xml);
  const got = (score.parts[0]?.notes || []).filter((n) => !n.rest && n.pitch >= 0);
  return { xml, score, got, part: score.parts[0] };
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
/** 同一组音（可能顺序不同）逐个比对 */
function sameNotes(got, want, label) {
  const okCount = got.length === want.length && want.every((w) => got.some((g) =>
    g.pitch === w.pitch && near(g.onset, w.onsetQ, 1e-3) && near(g.duration, w.durQ, 1e-3)));
  ok(label, okCount, { want: want.map((w) => [w.pitch, w.onsetQ, w.durQ]), got: got.map((g) => [g.pitch, g.onset, g.duration]) });
}

console.log("① 基本往返");
{
  const notes = [
    { pitch: 60, onsetQ: 0, durQ: 1, lyric: "do" },
    { pitch: 62, onsetQ: 1, durQ: 1, lyric: "re" },
    { pitch: 64, onsetQ: 2, durQ: 2, lyric: "-" },
  ];
  const { xml, got, part } = roundTrip(notes, { tempoBpm: 96, title: "往返测试" });
  sameNotes(got, notes, "音高/起点/时值往返一致");
  ok("歌词写进去了", got.map((g) => g.lyrics).join(",") === "do,re,-", got.map((g) => g.lyrics));
  ok("标题在", /<work-title>往返测试<\/work-title>/.test(xml));
  ok("速度读得回来", Number(part?.tempo) === 96, part?.tempo);
}

console.log("② 不带 DOCTYPE（我们自己的解析器拒 DTD/实体）");
{
  const xml = notesToMusicXml([{ pitch: 60, onsetQ: 0, durQ: 1 }]);
  ok("输出不含 <!DOCTYPE", !/<!DOCTYPE/i.test(xml));
  ok("输出不含 ENTITY", !/<!ENTITY/i.test(xml));
  ok("能被解析器接受（不抛）", (() => { try { parseMusicXML(xml); return true; } catch { return false; } })());
}

console.log("③ 空隙补显式休止，且不影响后面的绝对起点");
{
  const { xml, got } = roundTrip([
    { pitch: 60, onsetQ: 0, durQ: 1 },
    { pitch: 67, onsetQ: 3, durQ: 1 },   // 中间空 2 拍
  ]);
  ok("写了 <rest/>", /<rest\/>/.test(xml));
  sameNotes(got, [{ pitch: 60, onsetQ: 0, durQ: 1 }, { pitch: 67, onsetQ: 3, durQ: 1 }], "第二个音仍在第 4 拍");
}

console.log("④ 和弦（同 onset）用 <chord/>");
{
  const notes = [{ pitch: 60, onsetQ: 0, durQ: 2 }, { pitch: 64, onsetQ: 0, durQ: 2 }, { pitch: 67, onsetQ: 0, durQ: 2 }];
  const { xml, got } = roundTrip(notes);
  ok("写了 <chord/>", (xml.match(/<chord\/>/g) || []).length === 2, (xml.match(/<chord\/>/g) || []).length);
  sameNotes(got, notes, "三个音都回到同一 onset");
  ok("保留和弦时无 warning", notesToMusicXmlResult(notes).warnings.length === 0, notesToMusicXmlResult(notes).warnings);
}

console.log("⑤ 压单声部（ACE Sing 轨用）");
{
  const chord = [{ pitch: 60, onsetQ: 0, durQ: 1 }, { pitch: 64, onsetQ: 0, durQ: 1 }, { pitch: 67, onsetQ: 0, durQ: 1 }];
  const flat = flattenToMonophonic(chord);
  ok("只留最高音", flat.notes.length === 1 && flat.notes[0].pitch === 67, flat.notes);
  ok("丢弃被如实报", flat.warnings.some((w) => /丢弃了 2 个和声音符/.test(w)), flat.warnings);
  const overlap = [{ pitch: 60, onsetQ: 0, durQ: 3 }, { pitch: 62, onsetQ: 1, durQ: 1 }];
  const flat2 = flattenToMonophonic(overlap);
  ok("真重叠被截短", flat2.notes[0].durQ === 1, flat2.notes);
  ok("截短被如实报", flat2.warnings.some((w) => /截短/.test(w)), flat2.warnings);
  const { got } = roundTrip(overlap, { polyphonic: false });
  ok("压平后确实不重叠", assertNoOverlap(got.map((g) => ({ pitch: g.pitch, onsetQ: g.onset, durQ: g.duration }))).ok === true);
}

console.log("⑥ 保留和弦时，真重叠**不静默裁**（截短 + warning）");
{
  const res = planMusicXml([{ pitch: 60, onsetQ: 0, durQ: 4 }, { pitch: 62, onsetQ: 2, durQ: 1 }], { polyphonic: true });
  ok("前音被截到后音起点", res.notes[0].durQ === 2, res.notes);
  ok("有 warning", res.warnings.some((w) => /真重叠/.test(w)), res.warnings);
  ok("findOverlaps 认得出来", findOverlaps([{ pitch: 60, onsetQ: 0, durQ: 4 }, { pitch: 62, onsetQ: 2, durQ: 1 }]).length === 1);
  ok("assertNoOverlap 对和弦不误报", assertNoOverlap([{ pitch: 60, onsetQ: 0, durQ: 2 }, { pitch: 64, onsetQ: 0, durQ: 2 }]).ok === true);
  // 边界：和弦**成员时长不同** + 后面还有重叠音 ⇒ 必须把**整组**截短（只截相邻那个会残留重叠）
  const chordThen = [{ pitch: 60, onsetQ: 0, durQ: 4 }, { pitch: 64, onsetQ: 0, durQ: 3 }, { pitch: 62, onsetQ: 2, durQ: 1 }];
  const fixed = planMusicXml(chordThen, { polyphonic: true });
  // 判据只该断言这两条：① 结果里**不再有重叠** ② 被截的是**整个和弦组**（onset 0 那两个都变 2）
  // ⚠️ 别写成 "所有音的结束都 ≤ 2" —— 第三个音本来就在 onset 2、时值 1（结束于 3），那样是**假失败**
  //    （2026-10-06 我自己先写错过一次）。
  ok("和弦组被整组截短（无残留重叠）",
    findOverlaps(fixed.notes).length === 0 && fixed.notes.filter((n) => n.onsetQ === 0).every((n) => n.durQ === 2),
    fixed.notes.map((n) => [n.pitch, n.onsetQ, n.durQ]));
  ok("组重叠也被 findOverlaps 认出来", findOverlaps(chordThen).length === 1, findOverlaps(chordThen));
}

console.log("⑦ 非法输入被剔除并如实报");
{
  const res = planMusicXml([
    { pitch: 60, onsetQ: 0, durQ: 1 },
    { pitch: 60, onsetQ: 1, durQ: 0 },      // 时值 0
    { pitch: 200, onsetQ: 2, durQ: 1 },     // 音高越界
    { pitch: 61, onsetQ: NaN, durQ: 1 },    // 起点非数
  ]);
  ok("只剩 1 个合法音", res.notes.length === 1, res.notes.length);
  ok("时值问题被报", res.warnings.some((w) => /时值不合法/.test(w)), res.warnings);
  ok("音高问题被报", res.warnings.some((w) => /音高越界/.test(w)), res.warnings);
}

console.log("⑧ 拍 → 四分音符换算（生成类音符直接可用）");
{
  const q = beatsToNoteQ([{ pitch: 60, startBeat: 1, durBeats: 0.5, vel: 100 }], { offsetQ: 2 });
  ok("onset = startBeat + offset", q[0].onsetQ === 3, q[0]);
  ok("时值直接搬", q[0].durQ === 0.5 && q[0].velocity === 100, q[0]);
}

console.log("⑨ 跨小节长音不被切碎（解析器是跨小节累加）");
{
  const notes = [{ pitch: 60, onsetQ: 0, durQ: 6 }, { pitch: 62, onsetQ: 6, durQ: 1 }];  // 6 拍 > 4 拍小节
  const { xml, got, score } = roundTrip(notes);
  sameNotes(got, notes, "长音起点/时值保持，后面那个音起点仍是 6");
  ok("确实跨了两个小节", (xml.match(/<measure /g) || []).length >= 2, (xml.match(/<measure /g) || []).length);
  ok("没被拆成两个音", got.length === 2, got.map((g) => [g.pitch, g.onset, g.duration]));
  void score;
}

console.log("⑩ 调号：降号调写 Bb 而不是 A#（音高不变）");
{
  const b = pitchToStepAlterOctave(70, -2);   // Bb4
  ok("Bb：step=B, alter=-1", b.step === "B" && b.alter === -1, b);
  const a = pitchToStepAlterOctave(70, 2);
  ok("升号调用 A#", a.step === "A" && a.alter === 1, a);
  const { got } = roundTrip([{ pitch: 70, onsetQ: 0, durQ: 1 }], { fifths: -2 });
  sameNotes(got, [{ pitch: 70, onsetQ: 0, durQ: 1 }], "往返后音高仍是 70");
}

console.log("⑪ 力度写成小节级 <sound dynamics>");
{
  const xml = notesToMusicXml([{ pitch: 60, onsetQ: 0, durQ: 1, velocity: 0.5 }]);
  ok("有 <sound dynamics=\"50\"/>", /<sound dynamics="50"\/>/.test(xml), xml.match(/<sound dynamics="\d+"\/>/g));
  const { got } = roundTrip([{ pitch: 60, onsetQ: 0, durQ: 1, velocity: 0.5 }]);
  ok("解析器认出了力度（velocity 或 dynamic 有值）", got[0] && (got[0].velocity !== undefined || got[0].dynamic !== undefined),
    got[0] && { velocity: got[0].velocity, dynamic: got[0].dynamic });
}

console.log("⑫ 同小节内逐音力度：写出端切小节 ⇒ 读回不再被压成「最后一个音的值」");
{
  // 2026-10-06 复核实测的 bug：我们逐音写 `<sound dynamics>`，而**正文解析器**把一个小节里最后一个
  // dynamics 作用于整小节 ⇒ 写 0.2/0.9/0.3 读回 0.3/0.3/0.3（生成类旋律本来就是逐音给力度）。
  // 修法在**写出端**：力度一变就切小节（不动已发布的正文明解析器行为）。
  const notes = [
    { pitch: 60, onsetQ: 0, durQ: 1, velocity: 0.2 },
    { pitch: 62, onsetQ: 1, durQ: 1, velocity: 0.9 },
    { pitch: 64, onsetQ: 2, durQ: 1, velocity: 0.3 },
  ];
  const { xml, got } = roundTrip(notes);
  const vals = got.map((g) => (g.dynamic !== undefined ? g.dynamic : g.velocity));
  ok("三个音读到的力度**不再全等于最后一个**", new Set(vals).size >= 2, vals);
  ok("力度变化处确实切了小节", (xml.match(/<measure /g) || []).length >= 3, (xml.match(/<measure /g) || []).length);
  ok("并如实记了 warning（不静默）", notesToMusicXmlResult(notes).warnings.some((w) => /力度变化处切了/.test(w)), notesToMusicXmlResult(notes).warnings);
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
