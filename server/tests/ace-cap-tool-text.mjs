// 验证 ace_cli 的截断：① 纯逻辑（离线、确定性）② 真实 clip note-content（**只在 ACE 真有大回包时才断言**）
// ⚠️ 2026-10-06 修：② 段原先**写死了 `total 242` 与某条 uuid**（那是某一轮 ACE 工程的状态）⇒ 工程一变就假失败。
//    现在判据**关系化**：先从原始回包数出真实条数，再断言截断结果自述同一个数；拿不到就明确跳过（不算失败）。
import { runAceCli } from "../dist/ace/index.js";
import { capToolResult, capToolPayload, DEFAULT_LIMIT, DEFAULT_MAX_CHARS } from "../dist/util/cap-tool-text.js";

let pass = 0, fail = 0;
const ok = (c, what, extra = "") => { if (c) { pass++; console.log("  ✓ " + what); } else { fail++; console.log("  ✗ " + what + (extra ? "  ← " + extra : "")); } };

// ① 纯逻辑（不依赖 ACE）
{
  const payload = { ok: true, json: { noteCount: 300, notes: Array.from({ length: 300 }, (_, i) => ({ pos: i * 480, pitch: 60 + (i % 12) })) } };
  const capped = capToolPayload(payload, {});
  ok(capped.payload.json.notes.length === DEFAULT_LIMIT, `默认只回 ${DEFAULT_LIMIT} 条`, String(capped.payload.json.notes.length));
  ok(capped.payload.json._truncated && capped.payload.json._truncated.total === 300, "_truncated 自述原长（300）", JSON.stringify(capped.payload.json._truncated));
  ok(capped.payload.json.notes[0].pos === 0 && capped.payload.json.notes[1].pos === 480, "切片从 offset=0 起，内容未被改动");
  const page2 = capToolPayload(payload, { offset: 50, limit: 10 });
  ok(page2.payload.json.notes[0].pos === 50 * 480, "offset/limit 能分页（第 51 条起）", String(page2.payload.json.notes[0].pos));
  const all = capToolPayload(payload, { limit: 0 });
  ok(all.payload.json.notes.length === 300 && !all.truncated, "limit:0 ⇒ 明确要全量，不切数组");
  const big = capToolResult({ ok: true, stdout: "x".repeat(100000) }, {});
  ok(big.length <= DEFAULT_MAX_CHARS + 200 && /已截断：完整 100\d+ 字符/.test(big), `文本硬上限 ${DEFAULT_MAX_CHARS} 且**自述**完整长度`, String(big.length));
}

// ② 真实 ACE 回包（**不依赖具体工程状态**：能拿到就按关系断言，拿不到就跳过）
console.log("\n== 真实回包（ACE 在线**且有工程**才有；判据是关系，不是写死的数字）==");
try {
  const r = runAceCli(["clip", "note-content", "--track-index", "0", "--clip-index", "0"]);
  const raw = JSON.stringify({ ok: r.code === 0, ...r });
  const j = r && r.json;
  const rawNotes = Array.isArray(j && j.notes) ? j.notes.length
    : (j && Number.isFinite(j.noteCount) ? j.noteCount : null);
  console.log(`  原始回包 ${raw.length} 字符 · 音符 ${rawNotes === null ? "?" : rawNotes}（这就是以前会整份喷进上下文的量）`);
  if (rawNotes === null || rawNotes <= DEFAULT_LIMIT) {
    console.log("  （ACE 没开工程 / 音符不多于上限 ⇒ 跳过真机断言：这段**只**在有真实大回包时才有意义）");
  } else {
    const capped = capToolResult({ ok: r.code === 0, ...r }, {});
    console.log(`  截断后 ${capped.length} 字符（省 ${(100 - capped.length / raw.length * 100).toFixed(1)}%）`);
    ok(capped.length <= DEFAULT_MAX_CHARS + 200, "截断后 ≤ 上限", String(capped.length));
    ok(new RegExp(`"total"\\s*:\\s*${rawNotes}\\b`).test(capped), `自述了原长（total ${rawNotes}）`);
    const kept = (capped.match(/"noteUuid"/g) || []).length;
    ok(kept <= DEFAULT_LIMIT, `只保留前 ${DEFAULT_LIMIT} 条`, String(kept));
  }
} catch (e) {
  console.log("  （ACE 不在线，跳过真实回包验证：" + e.message.slice(0, 80) + "）");
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
