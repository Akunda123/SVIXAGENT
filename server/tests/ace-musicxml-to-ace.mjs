// MusicXML → ACE 载荷 的换算与落位计划单测（**不需要 ACE 在线**）
import {
  quarterToTicks, ticksPerSecondFromClip, mxToTicks, toAcePayload, planNotesForClip,
} from "../dist/ace/musicxml-to-ace.js";

let pass = 0, fail = 0;
const ok = (c, what, extra = "") => { if (c) { pass++; console.log("  ✓ " + what); } else { fail++; console.log("  ✗ " + what + (extra ? "  ← " + extra : "")); } };

// 本机实测：clipBegin 3360 / clipBeginSec 3.111108 = 1080 tick/s
const MATH = { bpm: 130, ticksPerSecond: 1080, clipStartTick: 3360 };

console.log("== ① tick 率从 clip 反算（两条数据交叉校验）==");
ok(ticksPerSecondFromClip({ clipBegin: 3360, clipBeginSec: 3.111108, clipEnd: 285600, clipEndSec: 264.44418 })?.toFixed(0) === "1080",
  "本机那份 clip ⇒ 1080 tick/s（实测数据）", String(ticksPerSecondFromClip({ clipBegin: 3360, clipBeginSec: 3.111108 })));
ok(ticksPerSecondFromClip({ clipBegin: 0, clipBeginSec: 0 }) === null, "没数据 ⇒ null（不猜）");
try {
  ticksPerSecondFromClip({ clipBegin: 1000, clipBeginSec: 1, clipEnd: 9999, clipEndSec: 1 });
  ok(false, "两处 tick 率不一致时应当报错");
} catch (e) { ok(/不一致/.test(e.message), "两处 tick 率不一致 ⇒ **报错**（说明字段读错了）", e.message); }

console.log("\n== ② 四分音符 → tick（130bpm / 1080 tick·s⁻¹）==");
{
  const perQ = quarterToTicks(MATH);
  ok(Math.abs(perQ - (60 / 130) * 1080) < 1e-9, "每四分音符 ≈ " + perQ.toFixed(2) + " tick", String(perQ));
  ok(Math.abs(perQ - 498.4615) < 0.01, "与手算 498.46 一致");
  // 120bpm 是**错的**默认值也会被算出来，所以我们要求必须显式给 bpm
  try { quarterToTicks({ ...MATH, bpm: 0 }); ok(false, "bpm=0 应当报错"); }
  catch (e) { ok(/bpm/.test(e.message), "bpm 缺失/为 0 ⇒ 报错（**不许默认 120**）", e.message); }
}

console.log("\n== ③ MusicXML 音符 → 绝对 tick → clip-local 载荷 ==");
{
  const mx = [
    { startQ: 0, durQ: 1, pitch: 60, lyric: "啦" },              // 第 1 拍
    { startQ: 1, durQ: 0.5, pitch: 62, tenuto: true },          // 延续音 ⇒ lyric '-'
    { startQ: 1.5, durQ: 0.5, pitch: 64, lyric: "呀" },
  ];
  const ticks = mxToTicks(mx, MATH);
  const perQ = quarterToTicks(MATH);
  // ⚠️ 我第一版期望写成浮点 perQ —— 错：**ACE 的 tick 是整数**，模块取整是对的
  ok(Number.isInteger(ticks[0].dur) && ticks[0].dur === Math.round(perQ), "时值换算成 tick 并**取整**（ACE tick 是整数）⇒ " + ticks[0].dur, String(ticks[0].dur));
  ok(ticks[1].lyric === "-", "延续音（tenuto）⇒ lyric 写**字面 `-`**（ACE 的音节规则）", String(ticks[1].lyric));
  ok(ticks[2].lyric === "呀", "独立歌词原样带过去");

  const payload = toAcePayload(ticks, MATH);
  ok(payload[0].pos === -3360, "clip-local：绝对 0 − clipStart 3360 ⇒ -3360（**相对 clip**，不是绝对）", String(payload[0].pos));
  ok(Object.keys(payload[0]).sort().join(",") === "dur,lyric,pitch,pos", "载荷字段名与 CLI 完全一致（pos/dur/pitch/lyric）", Object.keys(payload[0]).join(","));
}

console.log("\n== ④ 落位计划：Sing 单音（和弦 ⇒ 只留一个 + 如实报）==");
{
  const notes = [
    { start: 3360, dur: 240, pitch: 60 }, { start: 3360, dur: 240, pitch: 64 }, { start: 3360, dur: 240, pitch: 67 },
    { start: 3600, dur: 240, pitch: 62 },
  ];
  const p = planNotesForClip({ notes, math: MATH, clipKind: "Sing" });
  ok(p.ok, "没有现有音冲突 ⇒ 可以写", p.reason || "");
  ok(p.payload.length === 2, "和弦三音只写 1 个 + 后一个 = 2 条载荷", String(p.payload.length));
  ok(p.dropped.length === 2, "另两个和弦音进 dropped（如实回报）", String(p.dropped.length));
  ok(p.payload[0].pos === 0, "第一个音落在 clip 内 0 处（3360−3360）", String(p.payload[0].pos));
}

console.log("\n== ⑤ 落位计划：Sing 遇到复调 ⇒ **不写、报给用户选**（不自动拆轨）==");
{
  const notes = [
    { start: 3360, dur: 2000, pitch: 48 },   // 低声部
    { start: 3560, dur: 2000, pitch: 72 },   // 高声部（与上一条交叠）
  ];
  const p = planNotesForClip({ notes, math: MATH, clipKind: "Sing" });
  ok(!p.ok, "复调 ⇒ ok:false（不自动拆）", JSON.stringify({ ok: p.ok }));
  ok(p.lines.length === 2, "但把两条线算出来给用户看", String(p.lines.length));
  ok(/单音/.test(p.reason || ""), "原因说明白：Sing 是单音、要拆线", p.reason);
}

console.log("\n== ⑥ 落位计划：与**现有音**冲突 ⇒ 不写、点名（绝不裁现有音）==");
{
  const notes = [{ start: 3480, dur: 240, pitch: 60 }];     // clip-local 120~360
  const existing = [{ start: 3360, dur: 480, pitch: 57 }];  // 占着 0~480
  const p = planNotesForClip({ notes, math: MATH, clipKind: "Sing", existing });
  ok(!p.ok, "冲突 ⇒ ok:false", JSON.stringify(p.conflicts));
  ok(p.conflicts.length === 1 && p.conflicts[0].theirs.label === "pitch 57", "点名会顶掉谁", JSON.stringify(p.conflicts[0]?.theirs));
  ok(p.payload.length === 0, "**绝不半写**（payload 为空）", String(p.payload.length));
}

console.log("\n== ⑦ 落在 Instrument 轨 ⇒ 复调允许：和弦原样进、重叠不算冲突 ==");
{
  const notes = [
    { start: 3360, dur: 480, pitch: 60 }, { start: 3360, dur: 480, pitch: 64 }, { start: 3360, dur: 480, pitch: 67 },
  ];
  const existing = [{ start: 3360, dur: 240, pitch: 55 }];
  const p = planNotesForClip({ notes, math: MATH, clipKind: "Instrument", existing });
  ok(p.ok, "Instrument（复调）⇒ 可以写", p.reason || "");
  ok(p.payload.length === 3, "**三个和弦音全都写**（不用拆轨）", String(p.payload.length));
  ok(p.conflicts.length === 0, "复调轨里重叠**不算冲突**", String(p.conflicts.length));
}

console.log("\n== ⑧ Audio / Chord clip ⇒ 明确拒 ==");
{
  for (const kind of ["Audio", "Chord"]) {
    const p = planNotesForClip({ notes: [{ start: 0, dur: 100, pitch: 60 }], math: MATH, clipKind: kind });
    ok(!p.ok && /没有 pitched notes/.test(p.reason || ""), `${kind} clip ⇒ 拒并说明原因`, p.reason);
  }
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
