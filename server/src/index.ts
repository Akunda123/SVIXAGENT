#!/usr/bin/env node
/**
 * AKDAgent MCP server 入口（stdio 传输）。
 * 注意：MCP 走 stdout，所有日志必须写到 stderr。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

/**
 * ⚠️ 默认**静音**，只有 `AKDAGENT_MCP_VERBOSE=1` 才写 stderr。
 * 为什么改（2026-09-26）：客户端把内嵌 host 的 **stderr 一律按 ERROR 记进 `akdagent.log`**，
 * 于是这行启动横幅在用户日志里长成 `ERROR [dsh:err] [akdagent-mcp] server ready…`
 * —— 用户当故障报上来了（其实握手成功与否由 MCP 协议本身决定，这行没有诊断价值）。
 */
const VERBOSE = process.env.AKDAGENT_MCP_VERBOSE === '1';
const log = (msg: string) => { if (VERBOSE) process.stderr.write(`[akdagent-mcp] ${msg}\n`); };

const server = new McpServer({
  name: "akdagent-mcp-server",
  version: "1.0.1",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
log("server ready, awaiting MCP client on stdio");
