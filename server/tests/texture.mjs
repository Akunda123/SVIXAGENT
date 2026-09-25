/**
 * 织体生成（P7 · `sv_write_texture`）离线自测：**不碰宿主、不联网**
 * 运行：cd server && npm run test:texture
 *
 * 覆盖：工程内音符推和弦 · 模板抽象（序位/八度/非和弦音）· 实例化（含模板保留与跨小节循环）
 *      · 乐器匹配与推荐 · 管乐气口 / 弦乐换弓 / 音域三条硬约束 · progression 来源 · 渲染降级路径
 */
import {
  analyzeChordsFromNotes, analysisFromProgression, analysisFromSegs, windowsToSegs, chordAtBar,
  abstractTemplate, instantiateTemplate,
  findInstrument, suggestTextures, applyInstrumentRules,
  renderTexture, INSTRUMENTS, QUARTER,
} from "../dist/texture/index.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const BAR = QUARTER * 4;
const Q = QUARTER;
const n = (pitch, onsetBlick, durationBlick) => ({ pitch, onsetBlick, durationBlick });

console.log("== ① 工程内音符 → 和弦（“MIDI 分析”） ==");
{
  const a = analyzeChordsFromNotes([n(60, 0, BAR), n(64, 0, BAR), n(67, 0, BAR)]);
  ok("C 三和弦 ⇒ C", a.windows[0].name === "C", a.windows[0].name);
  ok("调性判成 C major", a.key.name === "C major" && a.key.mode === "major", a.key);

  const am = analyzeChordsFromNotes([n(57, 0, BAR), n(60, 0, BAR), n(64, 0, BAR)]);
  ok("A 小三和弦 ⇒ Am", am.windows[0].name === "Am", am.windows[0].name);

  const two = analyzeChordsFromNotes([n(60, 0, BAR), n(64, 0, BAR), n(67, 0, BAR), n(57, BAR, BAR), n(60, BAR, BAR), n(64, BAR, BAR)]);
  ok("两小节 ⇒ C / Am", two.windows[0].name === "C" && two.windows[1].name === "Am", two.windows.map((w) => w.name));
  ok("bar 号 1 起且递进", two.windows[0].bar === 1 && two.windows[1].bar === 2, two.windows.map((w) => w.bar));
  ok("空输入 ⇒ 无窗口", analyzeChordsFromNotes([]).windows.length === 0);
  ok("chordAtBar 可取第 2 小节", chordAtBar(two, 2) === "Am", chordAtBar(two, 2));
  ok("windowsToSegs 形状可喂 chordsToNotes", windowsToSegs(two).every((s) => typeof s.name === "string" && typeof s.startBlick === "number" && typeof s.durationBlick === "number"));
}

console.log("== ② 模板抽象：和弦序位 + 八度 ==");
{
  const a = analyzeChordsFromNotes([n(60, 0, BAR), n(64, 0, BAR), n(67, 0, BAR)]);
  const ab = abstractTemplate([n(60, 0, Q), n(64, 0, Q), n(67, 0, Q)], a);
  ok("三和弦音 degree = 1/2/3", ab.voices.map((v) => v.degree).join(",") === "1,2,3", ab.voices.map((v) => v.degree));
  // 根音基准 = C3(48)（与 IX 侧边栏 JS 一致）⇒ C4 起的模板 octave = 1
  ok("八度以 C3 为基准（C4 模板 ⇒ octave 1）", ab.voices.every((v) => v.octave === 1), ab.voices.map((v) => v.octave));
  ok("全判为和弦音", ab.voices.every((v) => v.isChordTone));
  ok("模板 1 小节", ab.numBars === 1, ab.numBars);

  const oct = abstractTemplate([n(72, 0, Q)], a);
  ok("C5 根音 ⇒ degree 1 / octave 2", oct.voices[0].degree === 1 && oct.voices[0].octave === 2, oct.voices[0]);

  const non = abstractTemplate([n(62, 0, Q)], a);
  ok("非和弦音不丢、标 isChordTone=false", non.voices.length === 1 && non.voices[0].isChordTone === false, non.voices[0]);
  ok("非和弦音 interval = 14（相对 C3）", non.voices[0].interval === 14, non.voices[0].interval);
}

console.log("== ③ 实例化：按目标和弦重建 ==");
{
  // 4 小节：C G Am F
  const a = analysisFromProgression(["C", "G", "Am", "F"], { bars: 4 });
  const tpl = abstractTemplate([n(60, 0, Q), n(64, 0, Q), n(67, 0, Q)], a);   // 模板 = 第 1 小节（C）
  const r = instantiateTemplate(tpl, a, { preserveTemplate: true });

  // 模板是 C4 区的三和弦（octave 1）⇒ 生成结果同样在 C4 区（根音基准 C3 + 八度 1）
  ok("Am 小节（第 3 小节）⇒ 69/72/76", JSON.stringify(r.notes.filter((x) => x.onsetBlick >= 2 * BAR && x.onsetBlick < 3 * BAR).map((x) => x.pitch)) === "[69,72,76]",
    r.notes.filter((x) => x.onsetBlick >= 2 * BAR && x.onsetBlick < 3 * BAR).map((x) => x.pitch));
  ok("G 小节（第 2 小节）⇒ 67/71/74", JSON.stringify(r.notes.filter((x) => x.onsetBlick >= BAR && x.onsetBlick < 2 * BAR).map((x) => x.pitch)) === "[67,71,74]",
    r.notes.filter((x) => x.onsetBlick >= BAR && x.onsetBlick < 2 * BAR).map((x) => x.pitch));
  ok("模板小节（第 1 小节）被保留、不重写", r.preservedBars.includes(1) && r.notes.every((x) => x.onsetBlick >= BAR));

  // 非和弦音吸附到目标和弦内（interval 相对**目标和弦**根音，与 JS 同口径）
  const tpl2 = abstractTemplate([n(62, 0, Q)], a);   // C 上的 D（九音）
  const r2 = instantiateTemplate(tpl2, a, { rangeStartBar: 3, rangeEndBar: 3 });
  ok("非和弦音吸附进 Am ⇒ 72", r2.notes.length === 1 && r2.notes[0].pitch === 72, r2.notes.map((x) => x.pitch));

  // 转位
  const r3 = instantiateTemplate(tpl, a, { rangeStartBar: 2, rangeEndBar: 2, voicingShift: 1 });
  ok("转位 +1 ⇒ 71/74/79（G 的 3/5/8）", JSON.stringify(r3.notes.map((x) => x.pitch)) === "[71,74,79]", r3.notes.map((x) => x.pitch));

  // 跨小节模板循环（2 小节模板套 4 小节）
  const a4 = analysisFromProgression(["C", "C", "Am", "F"], { bars: 4 });
  const tpl3 = abstractTemplate([n(60, 0, Q), n(72, BAR, Q)], a4, { startBlick: 0, endBlick: 2 * BAR });
  ok("模板 2 小节", tpl3.numBars === 2, tpl3.numBars);
  const r4 = instantiateTemplate(tpl3, a4, { preserveTemplate: false });
  const bar3 = r4.notes.filter((x) => x.onsetBlick >= 2 * BAR && x.onsetBlick < 2 * BAR + Q)[0];
  const bar4 = r4.notes.filter((x) => x.onsetBlick >= 3 * BAR && x.onsetBlick < 3 * BAR + Q)[0];
  ok("第 3 小节用模板第 1 小节（Am 根音 + 八度 1 ⇒ 69）", bar3 && bar3.pitch === 69, bar3);
  ok("第 4 小节用模板第 2 小节（F 根音 + 八度 2 ⇒ 77）", bar4 && bar4.pitch === 77, bar4);

  // 音域过滤
  const r5 = instantiateTemplate(tpl, a, { pitchRange: [58, 70] });
  ok("音域过滤生效且计数", r5.droppedOutOfRange > 0, r5.droppedOutOfRange);
}

console.log("== ④ 乐器匹配与推荐 ==");
{
  ok("中文名可匹配（小提琴）", findInstrument("小提琴")?.id === "violin", findInstrument("小提琴")?.id);
  ok("英文名可匹配（cello）", findInstrument("cello")?.id === "cello");
  ok("别名可匹配（中音萨克斯）", findInstrument("中音萨克斯")?.id === "sax", findInstrument("中音萨克斯")?.id);
  ok("未收录 ⇒ null", findInstrument("二胡") === null);
  ok("收录 13 件以上", INSTRUMENTS.length >= 13, INSTRUMENTS.length);
  ok("乐器表无重复 id", new Set(INSTRUMENTS.map((i) => i.id)).size === INSTRUMENTS.length);

  const s = suggestTextures("圆号", "chorus");
  ok("圆号·副歌 ⇒ 有候选", !!s && s.candidates.length > 0);
  ok("圆号候选里 block 进前三", s.candidates.slice(0, 3).some((c) => c.texture === "block"), s.candidates.map((c) => c.texture));
  ok("推荐不含 avoid 项", s.candidates.every((c) => !s.avoid.includes(c.texture)));

  const cb = suggestTextures("低音提琴");
  ok("低音提琴 ⇒ 剔掉 arpeggio", !!cb && !cb.candidates.some((c) => c.texture === "arpeggio"), cb?.candidates.map((c) => c.texture));
  ok("低音提琴首选 sustain/counter", cb.candidates[0].texture === "sustain" || cb.candidates[0].texture === "counter", cb.candidates[0]);
}

console.log("== ⑤ 硬约束：管乐气口 / 弦乐换弓 / 音域 ==");
{
  const a = analysisFromProgression(["C", "C"], { bars: 2 });
  const flute = findInstrument("长笛");
  const dense = [];
  for (let b = 0; b < 2; b++) for (let k = 0; k < 4; k++) dense.push(n(72, b * BAR + k * Q, Q));
  const r = applyInstrumentRules(dense, flute, a, { apply: true });
  const bar2 = r.notes.filter((x) => x.onsetBlick >= BAR && x.onsetBlick < 2 * BAR);
  const last = bar2.reduce((m, x) => (x.onsetBlick > m.onsetBlick ? x : m));
  ok("管乐：2 小节组尾留出 ≥ 0.5 拍气口", last.onsetBlick + last.durationBlick <= 2 * BAR - 0.5 * Q + 1, { onset: last.onsetBlick, dur: last.durationBlick });
  ok("管乐气口写进 applied", r.applied.some((x) => x.includes("气口")), r.applied);

  const vln = findInstrument("小提琴");
  const three = [];
  for (let b = 0; b < 3; b++) three.push(n(67, b * BAR, Q), n(69, b * BAR + Q, Q));
  const a3 = analysisFromProgression(["C", "C", "C"], { bars: 3 });
  const rv = applyInstrumentRules(three, vln, a3, { apply: true });
  ok("弦乐：第 3 小节换弓镜像并回报", rv.applied.some((x) => x.includes("换弓")), rv.applied);
  ok("弦乐镜像真的改了音高", JSON.stringify(rv.notes.filter((x) => x.onsetBlick >= 2 * BAR).map((x) => x.pitch)) !== JSON.stringify([67, 69]), rv.notes.filter((x) => x.onsetBlick >= 2 * BAR).map((x) => x.pitch));

  // 2026-09-21 行为变更（P7 真机验收发现）：音域外的音**先整八度移入域内**，挪不进去才丢
  const low = applyInstrumentRules([n(40, 0, Q)], flute, a, { apply: true });
  ok("音域：域外的音先整八度移入（长笛 40 ⇒ 域内 · 不丢）",
    low.notes.length === 1 && low.notes[0].pitch >= flute.range[0] && low.notes[0].pitch <= flute.range[1] &&
    low.droppedOutOfRange === 0 && low.applied.some((x) => x.includes("整八度移入")),
    JSON.stringify({ pitch: low.notes[0] && low.notes[0].pitch, dropped: low.droppedOutOfRange, applied: low.applied }));
  const far = applyInstrumentRules([n(1, 0, Q)], flute, a, { apply: true });
  ok("音域：挪不进去才丢（长笛 1 ⇒ 丢并计数）", far.notes.length === 0 && far.droppedOutOfRange === 1, far.droppedOutOfRange);

  const off = applyInstrumentRules(dense, flute, a, { apply: false });
  ok("apply:false ⇒ 不动气口", off.notes.length === dense.length && !off.applied.some((x) => x.includes("气口")));
}

console.log("== ⑥ 渲染：具名织体 + 降级路径 ==");
{
  const a = analysisFromProgression(["C", "G", "Am", "F"], { bars: 4 });
  const vln = findInstrument("小提琴");
  const blk = renderTexture(a, vln, "block", null, {});
  ok("block 有音符且都在音域内", blk.notes.length > 0 && blk.notes.every((x) => x.pitch >= vln.range[0] && x.pitch <= vln.range[1]), blk.notes.length);
  ok("block 不降级", blk.usedTexture === "block" && blk.skeletonOnly === false);

  const noTpl = renderTexture(a, vln, "imitate", null, {});
  ok("imitate 无模板 ⇒ 降级 broken 且如实告知", noTpl.usedTexture === "broken" && noTpl.skeletonOnly === true && noTpl.warnings.some((w) => w.includes("降级")), noTpl.warnings);

  const tpl = abstractTemplate([n(60, 0, Q), n(64, 0, Q)], a);
  const riff = renderTexture(a, vln, "riff", tpl, { preserveTemplate: false });
  ok("riff 有模板 ⇒ 用 riff（不降级）", riff.usedTexture === "riff" && riff.skeletonOnly === false, riff.usedTexture);
  ok("riff 用了模板第 1 小节音型（4 小节各 2 音）", riff.notes.length === 8, riff.notes.length);

  // ostinato / riff **允许多小节模板**：2 小节音型要按 2 小节周期循环（不再被截成 1 小节）
  const tpl2bar = abstractTemplate([n(60, 0, Q), n(64, 0, Q), n(60, BAR, Q)], a, { startBlick: 0, endBlick: 2 * BAR });
  ok("多小节模板：numBars = 2", tpl2bar.numBars === 2, tpl2bar.numBars);
  const ost = renderTexture(a, vln, "ostinato", tpl2bar, { preserveTemplate: false });
  ok("ostinato 保留多小节模板（不截成 1 小节）", ost.notes.length === 6, ost.notes.length);
  ok("ostinato 第 3 小节回到模板第 1 小节（音数 2）", ost.notes.filter((x) => x.onsetBlick >= 2 * BAR && x.onsetBlick < 3 * BAR).length === 2, ost.notes.filter((x) => x.onsetBlick >= 2 * BAR && x.onsetBlick < 3 * BAR).length);
  ok("ostinato 第 4 小节用模板第 2 小节（音数 1）", ost.notes.filter((x) => x.onsetBlick >= 3 * BAR && x.onsetBlick < 4 * BAR).length === 1, ost.notes.filter((x) => x.onsetBlick >= 3 * BAR && x.onsetBlick < 4 * BAR).length);
  ok("ostinato 会说明与 imitate 同源", ost.warnings.some((w) => w.includes("同一条映射")), ost.warnings);

  const sus = renderTexture(a, findInstrument("弦乐群"), "sustain", null, {});
  ok("sustain ⇒ 每小节根+五（2 音 × 4 小节）", sus.notes.length === 8, sus.notes.length);
  ok("sustain 标注为简单版", sus.warnings.some((w) => w.includes("简单版")), sus.warnings);

  const ctr = renderTexture(a, findInstrument("大提琴"), "counter", null, {});
  ok("counter ⇒ 四分走句（4 小节 × 4 拍）", ctr.notes.length === 16, ctr.notes.length);

  const rng = renderTexture(a, vln, "block", null, { rangeStartBar: 2, rangeEndBar: 2 });
  ok("范围限定到第 2 小节", rng.notes.length > 0 && rng.notes.every((x) => x.onsetBlick >= BAR && x.onsetBlick < 2 * BAR), rng.notes.length);
}

console.log("== ⑦ 音频来源（segs → 分析结果）==");
{
  // 模拟 audio/chord-track 的产物：两小节 C / Am，带秒与 score
  const segs = [
    { name: "C", startBlick: 0, durationBlick: BAR, startSec: 0, durationSec: 2, score: 0.9 },
    { name: "Am", startBlick: BAR, durationBlick: BAR, startSec: 2, durationSec: 2, score: 0.8 },
  ];
  const a2 = analysisFromSegs(segs, { keyName: "C major" });
  ok("segs ⇒ 两个窗口、bar 1/2", a2.windows.length === 2 && a2.windows[0].bar === 1 && a2.windows[1].bar === 2, a2.windows.map((w) => w.bar));
  ok("和弦名照搬音频结果", a2.windows.map((w) => w.name).join("/") === "C/Am", a2.windows.map((w) => w.name));
  ok("调性照搬音频结果", a2.key.name === "C major" && a2.key.mode === "major", a2.key);
  ok("音频小调名可解析（F minor）", analysisFromSegs([], { keyName: "F minor" }).key.mode === "minor");
  ok("空 keyName 回落 C major（不吐空名）", analysisFromSegs([], { keyName: "" }).key.name === "C major");

  // 浮点误差：7.99 拍（≈ 第 3 小节线）必须量化成第 3 小节，不能标成第 2 小节
  const q = analysisFromSegs([
    { name: "C", startBlick: 0, durationBlick: BAR, startSec: 0, durationSec: 2, score: 1 },
    { name: "G", startBlick: BAR * 2 - Q * 0.01, durationBlick: BAR, startSec: 4, durationSec: 2, score: 1 },
  ], { keyName: "C major" });
  ok("起点量化到十六分：7.99 拍 ⇒ 第 3 小节", q.windows.some((w) => w.bar === 3 && w.name === "G"), q.windows.map((w) => w.bar + w.name));

  // 横跨多小节的段 ⇒ 展开成每小节一个窗口；中间没段的小节沿用前一个和弦并标 carried
  const span = analysisFromSegs([
    { name: "F", startBlick: 0, durationBlick: BAR * 3, startSec: 0, durationSec: 6, score: 1 },
    { name: "C", startBlick: BAR * 4, durationBlick: BAR, startSec: 8, durationSec: 2, score: 1 },
  ], { keyName: "C major" });
  ok("长段展开成每小节一个窗口（共 5 小节）", span.windows.length === 5, span.windows.length);
  ok("第 1–3 小节都是 F", span.windows.slice(0, 3).every((w) => w.name === "F"), span.windows.map((w) => w.name));
  ok("第 4 小节无段 ⇒ carried 且沿用 F", span.windows[3].name === "F" && span.windows[3].carried === true, span.windows[3]);
  ok("第 5 小节是新段 C、不算 carried", span.windows[4].name === "C" && !span.windows[4].carried, span.windows[4]);
  ok("fillGaps:false ⇒ 空档记 '-'", analysisFromSegs([
    { name: "F", startBlick: 0, durationBlick: BAR, startSec: 0, durationSec: 2, score: 1 },
    { name: "C", startBlick: BAR * 4, durationBlick: BAR, startSec: 8, durationSec: 2, score: 1 },
  ], { keyName: "C major", fillGaps: false }).windows[1].name === "-");

  const tpl3 = abstractTemplate([n(60, 0, Q), n(64, 0, Q), n(67, 0, Q)], a2);
  const r6 = instantiateTemplate(tpl3, a2, { preserveTemplate: true });
  ok("音频来源也能跑模板模仿（Am 小节 ⇒ 69/72/76）", JSON.stringify(r6.notes.map((x) => x.pitch)) === "[69,72,76]", r6.notes.map((x) => x.pitch));
}

console.log(`\n共 ${pass + fail} 项：${fail ? "❌ " + fail + " 项失败" : "✅ 全部通过"}`);
process.exit(fail ? 1 : 0);
