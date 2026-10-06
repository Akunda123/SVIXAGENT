// ACE 落位纯逻辑单测：**不需要 ACE 在线**（这正是把这些逻辑做成纯函数的原因）
// 跑法：node tests/ace-fit-notes.mjs
import {
  flattenToMonophonic, conflictsWithNotes, conflictsWithClips, findFreeSlot, spanOf, overlaps, noteEnd,
} from "../dist/ace/fit-notes.js";

let pass = 0, fail = 0;
const ok = (cond, what, extra = "") => { if (cond) { pass++; console.log("  ✓ " + what); } else { fail++; console.log("  ✗ " + what + (extra ? "  ← " + extra : "")); } };
const note = (start, dur, pitch, tag) => ({ start, dur, pitch, tag });

console.log("== ① 区间判据（半开：[start, end)，首尾相接不算重叠）==");
ok(!overlaps(note(0, 1, 60), note(1, 1, 62)), "0~1s 与 1~2s **不算**重叠（ACE 允许首尾相接）");
ok(overlaps(note(0, 1, 60), note(0.5, 1, 62)), "0~1s 与 0.5~1.5s 算重叠");
ok(overlaps(note(0, 2, 60), note(0, 2, 64)), "同起点同时值算重叠（和弦）");
ok(noteEnd(note(2, 1.5, 60)) === 3.5, "noteEnd = start + dur");

console.log("\n== ② 和弦 ⇒ 只留一个（默认最高音）==");
{
  const r = flattenToMonophonic([note(0, 1, 60, "chord-low"), note(0, 1, 64, "chord-mid"), note(0, 1, 67, "chord-top")]);
  ok(r.lines.length === 1 && r.lines[0].length === 1, "三个同 onset 音 ⇒ 一条线一个音", JSON.stringify(r.lines));
  ok(r.lines[0][0].pitch === 67, "留下的是**最高音** 67（旋律线）", String(r.lines[0][0].pitch));
  ok(r.dropped.length === 2, "另两个进 dropped（如实回报，不静默）", String(r.dropped.length));
  ok(r.overlapPairs === 2, "交叠对数记为 2（＝原谱有和弦）", String(r.overlapPairs));
}
{
  const r = flattenToMonophonic([note(0, 1, 60), note(0, 1, 67)], { keep: "lowest" });
  ok(r.lines[0][0].pitch === 60, "keep:'lowest' ⇒ 留最低音", String(r.lines[0][0].pitch));
}

console.log("\n== ③ 跨音交叠 ⇒ **拆线**（同轨不许压），线内严格不重叠 ==");
{
  // 三声部：0~3 / 0~3 / 0~3 各一条线（同 onset 不同音高）
  const r = flattenToMonophonic([note(0, 3, 60), note(0, 3, 64), note(0, 3, 67)], { keep: "highest" });
  ok(r.lines.length === 1, "同 onset 多音仍只算和弦（留一个）⇒ 1 条线", String(r.lines.length));

  // 真正的复调：低声部 0~2、高声部 1~3（错开起点 ⇒ 不能同线）
  const poly = flattenToMonophonic([note(0, 2, 48, "bass"), note(1, 2, 72, "lead")]);
  ok(poly.lines.length === 2, "交叠的两条声部 ⇒ 拆成 2 条线", String(poly.lines.length));
  for (const [i, line] of poly.lines.entries()) {
    const sorted = [...line].sort((a, b) => a.start - b.start);
    let okLine = true;
    for (let k = 1; k < sorted.length; k++) if (overlaps(sorted[k - 1], sorted[k])) okLine = false;
    ok(okLine, `第 ${i + 1} 条线内部**严格不重叠**`, JSON.stringify(line));
  }
}

console.log("\n== ④ 长音压住后音 ⇒ 裁短前音（并如实记录）==");
{
  const r = flattenToMonophonic([note(0, 5, 60, "long"), note(2, 1, 62, "next")], { minGapSec: 0.05, maxLines: 1 });
  ok(r.lines.length === 1 && r.lines[0].length === 2, "maxLines:1 ⇒ 必须裁短才放得下", JSON.stringify(r.lines));
  ok(r.trimmed.length === 1, "记录了一次裁剪", String(r.trimmed.length));
  const t = r.trimmed[0];
  ok(t.oldDur === 5 && Math.abs(t.newDur - (2 - 0 - 0.05)) < 1e-9, "裁到 后音起点-0.05s", JSON.stringify(t));
  ok(!overlaps(r.lines[0][0], r.lines[0][1]), "裁完之后**确实不重叠**");
}

console.log("\n== ⑤ 超长音裁不动 ⇒ 丢（宁可少写）==");
{
  const r = flattenToMonophonic([note(0, 5, 60), note(0.01, 1, 62)], { minGapSec: 0.5, maxLines: 1 });
  ok(r.dropped.length >= 1, "裁不动就丢进 dropped（不硬塞）", JSON.stringify({ dropped: r.dropped.length }));
}

console.log("\n== ⑥ 与目标轨**现有音符**对账（只报不改）==");
{
  const existing = [note(0, 1, 60, "已有 A"), note(2, 1, 62, "已有 B")];
  const mine = [note(0.5, 1, 67, "我的 1"), note(3, 1, 69, "我的 2")];
  const c = conflictsWithNotes(mine, existing);
  ok(c.length === 1, "只有 0.5~1.5 与 0~1 冲突 ⇒ 1 条", String(c.length));
  ok(c[0].theirs.label === "已有 A", "能指名道姓说会顶掉谁（模块认 label / tag）", c[0].theirs.label);
  ok(existing[0].dur === 1, "**原对象没被改动**（对账是只读的）", String(existing[0].dur));
}

console.log("\n== ⑦ 与目标轨**现有 clip** 对账 + 找空档 ==");
{
  const clips = [{ label: "clip1", start: 0, dur: 4 }, { label: "clip2", start: 10, dur: 4 }];
  const mine = { start: 3, dur: 3 };                     // 3~6 压住 clip1（0~4）
  const c = conflictsWithClips(mine, clips);
  ok(c.length === 1 && c[0].theirs.label === "clip1", "报到具体是哪个 clip", JSON.stringify(c.map((x) => x.theirs.label)));
  ok(findFreeSlot(3, clips, 0) === 4, "找空档：0 起放不下 3s（clip1 占 0~4）⇒ 从 4 起", String(findFreeSlot(3, clips, 0)));
  ok(findFreeSlot(3, clips, 4) === 4, "从 4 起正好放得下", String(findFreeSlot(3, clips, 4)));
  // ⚠️ 这条我第一版写错了期望值：clip1 从 **0** 开始 ⇒ 0 处**没有**空档，1s 也得排到 4 之后
  ok(findFreeSlot(1, clips, 0) === 4, "只要 1s 也得排到 clip1 之后（4）—— 因为 clip1 从 0 起、前面没空档", String(findFreeSlot(1, clips, 0)));
  ok(findFreeSlot(10, clips, 0) === 14, "要 10s ⇒ 跳过两个 clip（4 → 14）", String(findFreeSlot(10, clips, 0)));
  ok(spanOf([note(1, 1, 60), note(5, 2, 62)]).start === 1 && spanOf([note(1, 1, 60), note(5, 2, 62)]).dur === 6, "总跨度 = 1~7s（6s）");
}

console.log("\n== ⑧ 太短的音直接丢 ==");
{
  const r = flattenToMonophonic([note(0, 0.01, 60, "太短")], { minDurSec: 0.03 });
  ok(r.dropped.length === 1 && r.lines.length === 0, "0.01s 的音被丢（ACE 里没意义）", JSON.stringify(r));
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
