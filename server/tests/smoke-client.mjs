/**
 * MCP server 冒烟测试：用官方 SDK 客户端以 stdio 连接本 server，
 * 校验 initialize + tools/list 返回的工具集。
 * 可选：SMOKE_PING=1 时额外调用 sv_ping（无 SV 桥时会按预期超时报错）。
 *
 * 用法: npm run smoke   （需先 npm run build）
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "dist", "index.js");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  stderr: "pipe",
});

transport.onmessage = undefined; // noop guard

const client = new Client({ name: "akdagent-smoke", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((t) => t.name);
console.log("tools/list OK, count =", names.length);
for (const t of tools.tools) {
  console.log(`  - ${t.name}: ${t.description.slice(0, 60)}...`);
}

const expected = [
  "sv_ping",
  "sv_get_selected_notes",
  "sv_get_current_group",
  "sv_get_project_info",
  "sv_get_computed_pitch",
  "sv_get_computed_attributes",
  "sv_fix_mixed_lyric_language",
  "sv_mark_mandarin_tones",
  "sv_transpose_selected_notes",
  "sv_set_selected_lyrics",
  "sv_playback",
];
const missing = expected.filter((n) => !names.includes(n));
if (missing.length > 0) {
  console.error("MISSING TOOLS:", missing);
  process.exit(1);
}
console.log("all expected tools present ✔");

if (process.env.SMOKE_PING === "1") {
  console.log("calling sv_ping (expect timeout error since SV bridge is not running)...");
  try {
    const r = await client.callTool({ name: "sv_ping", arguments: {} });
    console.log("sv_ping returned:", JSON.stringify(r.content));
  } catch (e) {
    console.log("sv_ping failed as expected:", e instanceof Error ? e.message : e);
  }
}

await client.close();
console.log("smoke test passed ✔");
