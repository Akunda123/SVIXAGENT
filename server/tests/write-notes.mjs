/**
 * `write_notes`（**统一写入器**）的离线单测。
 * 运行：cd server && npm run build && node tests/write-notes.mjs
 *
 * 为什么值得测：这是"生成类产物落到任一宿主"的唯一通道，护栏一旦松掉，后果是**静默写坏别人的工程**
 *   （丢了音符不报 / 覆盖产物 / 相对路径写进奇怪的地方 / ACE 上写了重叠音符被整笔拒）。
 *   判据只测**能离线确定的部分**：注册与文案、音符口径换算与剔除计数、产物落盘且可被解析器读回、
 *   "同名不覆盖"、"只认绝对 outPath"、ACE 默认单声部。真正写宿主那步**不测**（需宿主在线，由
 *   `docs/发布清单` 的真机步骤覆盖）。
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerWriteNotes, uniqueMusicXmlPath, defaultPolyphonic } from "../dist/write-notes.js";
import { parseMusicXML } from "../dist/audio/musicxml.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};

// 假 McpServer：只抓注册（不碰网络、不碰宿主）
const reg = {};
registerWriteNotes({ tool: (name, desc, schema, handler) => { reg[name] = { desc, schema, handler }; } });
ok("注册了 write_notes", !!reg.write_notes, Object.keys(reg));
ok("描述里写明默认只读 + 权利确认", /dryRun/.test(reg.write_notes.desc) && /confirmRights/.test(reg.write_notes.desc));
ok("描述里写明 ACE 默认单声部", /单声部/.test(reg.write_notes.desc));
ok("schema 有 notes/target", !!reg.write_notes.schema.notes && !!reg.write_notes.schema.target);

const dir = mkdtempSync(path.join(tmpdir(), "write-notes-"));
const read = (r) => JSON.parse(r.content[0].text);

console.log("① 音符口径换算 + 非法项剔除计数（宿主离线也不影响产物）");
{
  const outPath = path.join(dir, "a.musicxml");
  const res = read(await reg.write_notes.handler({
    notes: [
      { pitch: 60, onsetQ: 0, durQ: 1, lyric: "do" },
      { pitch: 62, startBeat: 1, durBeats: 1 },              // 拍口径（等价写法）
      { pitch: 64, onsetQ: 2, durQ: 2, vel: 100 },
      { pitch: 67, onsetQ: 3 },                              // 缺时值 ⇒ 剔除
    ],
    target: "sv", outPath, dryRun: true,
  }));
  ok("ok=true", res.ok === true, res.error);
  ok("noteCount=3", res.noteCount === 3, res.noteCount);
  ok("skipped=1（缺时值那条被剔除并报数）", res.skipped === 1, res.skipped);
  ok("产物落盘", existsSync(outPath), outPath);
  ok("回包给了产物路径", res.artifact === outPath, res.artifact);
  const score = parseMusicXML(readFileSync(outPath, "utf8"));
  const got = (score.parts[0]?.notes || []).filter((n) => !n.rest && n.pitch >= 0);
  ok("产物能被解析器读回 3 个音", got.length === 3, got.map((g) => [g.pitch, g.onset]));
  ok("SV 默认保留和弦（polyphonic=true）", res.polyphonic === true, res.polyphonic);
  ok("把宿主的回包原样带出（结果=对象，不吞）", res.result && typeof res.result === "object", typeof res.result);
}

console.log("② 纪律：只认绝对 outPath / 同名不覆盖 / 空音符拒绝");
{
  const rel = read(await reg.write_notes.handler({ notes: [{ pitch: 60, onsetQ: 0, durQ: 1 }], target: "sv", outPath: "rel.musicxml" }));
  ok("相对 outPath 被拒", rel.ok === false && /绝对/.test(rel.error || ""), rel.error);
  const empty = read(await reg.write_notes.handler({ notes: [{ pitch: 60 }], target: "sv" }));
  ok("凑不出起点/时值 ⇒ 拒绝并解释", empty.ok === false && /时值/.test(empty.error || ""), empty.error);
  const p1 = path.join(dir, "dup.musicxml");
  const first = read(await reg.write_notes.handler({ notes: [{ pitch: 60, onsetQ: 0, durQ: 1 }], target: "sv", outPath: p1 }));
  const second = read(await reg.write_notes.handler({ notes: [{ pitch: 61, onsetQ: 0, durQ: 1 }], target: "sv", outPath: p1 }));
  ok("同名不覆盖：第二次换到别的路径", first.artifact === p1 && second.artifact !== p1, [first.artifact, second.artifact]);
  ok("原文件没被改写（还是 60）", /60|C<\/step>/.test(readFileSync(p1, "utf8")) && parseMusicXML(readFileSync(p1, "utf8")).parts[0].notes[0].pitch === 60);
  ok("uniqueMusicXmlPath 直接调用也不覆盖", uniqueMusicXmlPath(p1) !== p1);
}

console.log("③ 目标默认值（ACE 压单声部这条硬规则）");
{
  ok("sv 默认保留和弦", defaultPolyphonic("sv") === true);
  ok("ix 默认保留和弦", defaultPolyphonic("ix") === true);
  ok("ace 默认压单声部", defaultPolyphonic("ace") === false);
}

console.log("④ 时间轴偏移 + 两条「不许假成功」的护栏（2026-10-06 复核抓到后补的锁）");
{
  const outPath = path.join(dir, "off.musicxml");
  const res = read(await reg.write_notes.handler({
    notes: [{ pitch: 60, onsetQ: 0, durQ: 1 }], target: "sv", outPath, offsetQ: 4, dryRun: true,
  }));
  const got = parseMusicXML(readFileSync(outPath, "utf8")).parts[0].notes.filter((n) => !n.rest && n.pitch >= 0);
  ok("offsetQ 烘进产物（onset = 4）", res.ok === true && got[0] && got[0].onset === 4, got.map((g) => [g.pitch, g.onset]));

  const bad = read(await reg.write_notes.handler({ notes: [{ pitch: 300, onsetQ: 0, durQ: 1 }], target: "sv" }));
  ok("全部音符被剔除 ⇒ ok:false（原先恒 ok:true，会落一份没有音符的谱）", bad.ok === false && /剔除/.test(bad.error || ""), bad.error);

  const relMidi = read(await reg.write_notes.handler({
    notes: [{ pitch: 60, onsetQ: 0, durQ: 1 }], target: "ace", midiPath: "rel.mid",
  }));
  ok("ACE 分支：相对 midiPath 被拒（否则落到服务进程 CWD）", relMidi.ok === false && /绝对/.test(relMidi.error || ""), relMidi.error);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
