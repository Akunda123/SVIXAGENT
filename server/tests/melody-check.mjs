/**
 * 旋律生成 v2（结构引擎）+ 判据校验器的离线自测（跑在编译产物上，**不碰宿主、不联网**）
 * 运行：cd server && npm run test:melody
 */
import { generateMelody, melodyPlan } from "../dist/melody/generator.js";
import { checkMelody } from "../dist/melody/check.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const ids = (rep) => rep.issues.map((i) => i.id);
const note = (pitch, startBeat, durBeats = 1) => ({ pitch, startBeat, durBeats });

// ---------------------------------------------------------------- 生成器

console.log("\n== 结构引擎：确定性 + 结构plan ==");
const A = generateMelody({ key: "C", mood: "bright", barCount: 8, seed: 7 });
const B = generateMelody({ key: "C", mood: "bright", barCount: 8, seed: 7 });
ok("同 seed 两次输出完全一致（可复现）", JSON.stringify(A) === JSON.stringify(B));
const C = generateMelody({ key: "C", mood: "bright", barCount: 8, seed: 8 });
ok("换 seed 会变（不是死表）", JSON.stringify(A) !== JSON.stringify(C));
const plan = melodyPlan({ key: "C", mood: "bright", barCount: 8 });
ok("8 小节 / 4 小节一句 ⇒ 2 句", plan.phraseCount === 2, plan.phraseCount);
ok("句法角色 A → A'（模进）", plan.phrases[0].role === "A" && plan.phrases[1].role === "A'", plan.phrases.map((p) => p.role));
ok("高点默认 2/3 处 ⇒ 第 6 小节", plan.highPointBar === 6, plan.highPointBar);

console.log("\n== 句末气口（原来 rest 定义了却没用）==");
for (const mood of ["bright", "sad", "calm", "epic"]) {
  const notes = generateMelody({ key: "C", mood, barCount: 8, seed: 3 });
  const mel = notes.filter((n) => n.vel >= 0.5);
  const firstPhraseEnd = 4 * 4;
  const last = mel.filter((n) => n.startBeat < firstPhraseEnd).pop();
  const gap = firstPhraseEnd - (last.startBeat + last.durBeats);
  ok(`${mood}：第 1 句末有气口（${gap} 拍 ≥ 0.5）`, gap >= 0.5, gap);
}

console.log("\n== 单一高点（默认落在 2/3 处）==");
for (const mood of ["bright", "sad", "tense", "epic", "calm"]) {
  const notes = generateMelody({ key: "G", mood, barCount: 12, seed: 11 }).filter((n) => n.vel >= 0.5);
  const max = Math.max(...notes.map((n) => n.pitch));
  const bars = [...new Set(notes.filter((n) => n.pitch === max).map((n) => Math.floor(n.startBeat / 4)))];
  ok(`${mood}：最高音只出现在 1 个小节`, bars.length === 1, bars);
  ok(`${mood}：高点落在第 8 小节（⌈12×2/3⌉）`, bars[0] === 7, bars);
}

console.log("\n== 生成产物过判据：不该有硬伤 ==");
for (const [key, mood, prog] of [["C", "bright", ["C", "G", "Am", "F"]], ["Am", "sad", ["Am", "F", "C", "G"]], ["F", "calm", ["F", "C", "Dm", "Bb"]]]) {
  const notes = generateMelody({ key, mood, barCount: 8, chordProgression: prog, seed: 5 });
  const rep = checkMelody(notes, { key, chordProgression: prog, timeSig: 4 });
  ok(`${key}/${mood}：无 avoid-note（高小二度）`, !ids(rep).includes("avoid-note"), rep.issues.filter((i) => i.severity === "error"));
  ok(`${key}/${mood}：无 note 级 warn`, rep.verdict.warnings === 0 || !ids(rep).some((id) => ["breath", "octave-leap", "repeat", "highpoint-not-unique"].includes(id)), rep.issues.filter((i) => i.severity === "warn"));
  ok(`${key}/${mood}：强拍和弦内音比例 ≥ 0.6`, (rep.metrics.chordToneOnStrong ?? 0) >= 0.6, rep.metrics.chordToneOnStrong);
  ok(`${key}/${mood}：调内音比例 ≥ 0.85`, rep.metrics.scaleFit >= 0.85, rep.metrics.scaleFit);
}

console.log("\n== 校验器：调性自动推断（Krumhansl）==");
const cMajor = [60, 62, 64, 65, 67, 69, 71, 72].map((p, i) => note(p, i));
ok("C 大调音阶 ⇒ 推断 C（大调）", (() => { const r = checkMelody(cMajor); return r.key.name === "C" && r.key.inferred === true; })(), checkMelody(cMajor).key);
const aMinor = [57, 59, 60, 62, 64, 65, 67, 69].map((p, i) => note(p, i));
ok("a 小调音阶 ⇒ 推断 Am", (() => { const r = checkMelody(aMinor); return r.key.name === "Am"; })(), checkMelody(aMinor).key);

console.log("\n== 校验器：判据正反例 ==");
// ① 避免音硬伤：C 和弦下 C#5（比 C5 高小二度）
const bad = [note(60, 0, 1), note(61, 1, 1), note(64, 2, 1), note(60, 3, 1)];
const r1 = checkMelody(bad, { key: "C", chordProgression: ["C"], timeSig: 4 });
ok("高小二度 ⇒ error avoid-note", ids(r1).includes("avoid-note") && r1.verdict.blocking >= 1, r1.issues);

// ② 全五声
const penta = [60, 62, 64, 67, 69, 67, 64, 62, 60, 62, 64, 67].map((p, i) => note(p, i * 0.5, 0.5));
const r2 = checkMelody(penta, { key: "C", timeSig: 4 });
ok("全五声 ⇒ info pentatonic-only", ids(r2).includes("pentatonic-only"), ids(r2));

// ③ 句末无气口（每句填满到小节线）
const stuffed = [];
for (let bar = 0; bar < 4; bar++) for (let b = 0; b < 4; b++) stuffed.push(note(60 + (b % 3) * 2, bar * 4 + b, 1));
const r3 = checkMelody(stuffed, { key: "C", phraseBars: 4, timeSig: 4 });
ok("句末顶满 ⇒ warn breath", ids(r3).includes("breath"), ids(r3));

// ④ 高点不唯一：两小节都到 72
const twoPeaks = [note(60, 0), note(72, 1), note(62, 2), note(60, 3), note(60, 4), note(64, 5), note(72, 6), note(60, 7)];
const r4 = checkMelody(twoPeaks, { key: "C", timeSig: 4 });
ok("两个小节到最高音 ⇒ warn highpoint-not-unique", ids(r4).includes("highpoint-not-unique"), ids(r4));

// ⑤ 同音堆叠
const rep3 = [note(60, 0), note(60, 1), note(60, 2), note(62, 3)];
const r5 = checkMelody(rep3, { key: "C", timeSig: 4 });
ok("同音连续 3 次 ⇒ warn repeat", ids(r5).includes("repeat"), ids(r5));

// ⑥ 调外音过多
const outOfKey = [60, 61, 63, 66, 68, 70, 61, 63].map((p, i) => note(p, i));
const r6 = checkMelody(outOfKey, { key: "C", timeSig: 4 });
ok("大量调外音 ⇒ warn scale-fit", ids(r6).includes("scale-fit"), ids(r6));

// ⑦ 一句跨八度
const wide = [55, 57, 59, 60, 62, 64, 66, 69].map((p, i) => note(p, i));
const r7 = checkMelody(wide, { key: "C", phraseBars: 4, timeSig: 4 });
ok("一句跨八度 ⇒ warn octave-leap", ids(r7).includes("octave-leap"), ids(r7));

// ⑧ 空
const r8 = checkMelody([], {});
ok("没有音符 ⇒ error empty", ids(r8).includes("empty") && r8.ok === false, ids(r8));

// ⑨ 强拍不踩和弦音
const weakChord = [note(62, 0), note(65, 1), note(62, 2), note(65, 3)];
const r9 = checkMelody(weakChord, { key: "C", chordProgression: ["C"], timeSig: 4 });
ok("强拍不在和弦内音 ⇒ warn chord-weak", ids(r9).includes("chord-weak"), ids(r9));

// ⑩ 重叠（单声部旋律不许叠 —— 与桥侧 LAYOUT 口径一致；这条是实测踩出来的）
const overlapped = [note(60, 0, 2), note(62, 1, 1), note(64, 3, 1)];
const r10 = checkMelody(overlapped, { key: "C", timeSig: 4 });
ok("音符重叠 ⇒ error overlap", ids(r10).includes("overlap") && r10.verdict.blocking >= 1, r10.issues);

// ⑪ 六度以上大跳（≥9 半音）—— 用户点名的主要检查
const bigLeap = [note(60, 0), note(69, 1), note(71, 2), note(60, 3)];
const r11 = checkMelody(bigLeap, { key: "C", timeSig: 4 });
ok("六度以上大跳 ⇒ warn leap（并报音程名）", ids(r11).includes("leap") && /大六度|小七度|八度/.test(JSON.stringify(r11.issues)), r11.issues);

// ⑫ 单音打转（某一音占比 ≥1/3 且 ≥4 次）—— 用户点名的主要检查
const mono = [note(60, 0), note(62, 1), note(60, 2), note(64, 3), note(60, 4), note(65, 5), note(60, 6), note(67, 7), note(60, 8), note(69, 9)];
const r12 = checkMelody(mono, { key: "C", timeSig: 4 });
ok("单音占 1/3 以上 ⇒ warn monotone", ids(r12).includes("monotone"), ids(r12));

// ⑬ 大段短音符（连续 ≥6 个 ≤0.5 拍）⇒ 吐字不清风险 —— 用户点名的补充检查
const fast = [];
for (let i = 0; i < 8; i++) fast.push(note(60 + (i % 3) * 2, i * 0.5, 0.5));
const r13 = checkMelody(fast, { key: "C", timeSig: 4 });
ok("连续 8 个八分音符 ⇒ warn short-run", ids(r13).includes("short-run"), ids(r13));

// ⑭ 判据只出清单、不自动改（advice 必须写明"只列不改"）
const r14 = checkMelody([note(60, 0, 2), note(62, 1, 1), note(64, 3, 1)], { key: "C" });
ok("advice 写明「只列不改，是否修改由你定」", r14.verdict.advice.includes("只列不改"), r14.verdict.advice);

console.log("\n== 校验器：好旋律应该基本干净（拿生成器的产物当基准）==");
const good = generateMelody({ key: "C", mood: "happy", barCount: 8, chordProgression: ["C", "G", "Am", "F"], seed: 42 });
const rGood = checkMelody(good, { key: "C", chordProgression: ["C", "G", "Am", "F"] });
ok("无硬伤（error=0）", rGood.verdict.blocking === 0, rGood.issues.filter((i) => i.severity === "error"));
ok("无空/调外/同音/跨八度类警告", !ids(rGood).some((id) => ["empty", "scale-fit", "repeat", "octave-leap", "highpoint-not-unique"].includes(id)), ids(rGood));

// A'' 句会把时值 ×1.5 —— 必须在生成侧收口，否则 0.75 拍的音塞进 0.5 拍的格子 ⇒ 重叠（实测踩过 15 处）
ok("16 小节（含 A'' 时值扩增句）产物无重叠", (() => {
  const m = generateMelody({ key: "F", mood: "happy", barCount: 16, phraseBars: 4, chordProgression: ["Bb", "C", "Am", "Dm", "Gm", "C", "F", "F"], seed: 20260919 });
  for (let i = 1; i < m.length; i++) {
    if (m[i - 1].startBeat + m[i - 1].durBeats > m[i].startBeat + 0.01) return false;
  }
  return true;
})());

console.log("\n== 横扫：7 情绪 × 3 调 × 3 seed，产物必须 0 硬伤 / 0 结构性警告 ==");
{
  // 调式与情绪配套（小调类情绪用 minor 键，避免"key=F + 大调和弦进行"这种自相矛盾的输入）
  const cases = [
    ["bright", "C", ["C", "G", "Am", "F"]],
    ["happy", "G", ["G", "D", "Em", "C"]],
    ["sad", "Am", ["Am", "F", "C", "G"]],
    ["dark", "Dm", ["Dm", "Bb", "F", "C"]],
    ["tense", "Am", ["Am", "F", "C", "G"]],
    ["calm", "F", ["F", "C", "Dm", "Bb"]],
    ["epic", "C", ["C", "G", "Am", "F"]],
  ];
  let bad = 0, checked = 0, leapTotal = 0;
  const offenders = [];
  for (const [mood, key, prog] of cases) {
    for (const seed of [1, 99, 2026]) {
      const notes = generateMelody({ key, mood, barCount: 8, chordProgression: prog, seed });
      const rep = checkMelody(notes, { key, chordProgression: prog });
      checked++;
      leapTotal += rep.issues.find((i) => i.id === "leap")?.evidence?.total || 0;
      const structural = rep.issues.filter((i) => i.severity === "error"
        || ["breath", "octave-leap", "repeat", "highpoint-not-unique", "scale-fit", "overlap", "monotone"].includes(i.id));
      if (structural.length) { bad++; offenders.push({ mood, key, seed, ids: structural.map((i) => i.id) }); }
    }
  }
  ok(`${checked} 组组合：0 硬伤 / 0 结构性警告（失败 ${bad}）`, bad === 0, offenders.slice(0, 5));
  // 「大跳」是要**判断**的项（不是必须为 0）：句首偶尔来一次六度跳进是正常的，
  // 盯的是"满地大跳"。21 组 × 8 小节里允许多达 10 处。
  ok(`生成产物的大跳总数 ${leapTotal} 处（上限 10）`, leapTotal <= 10, leapTotal);
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail === 0 ? 0 : 1);
