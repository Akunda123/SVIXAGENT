#!/usr/bin/env node
/**
 * AKDAgent MCP server 入口（stdio 传输）。
 * 注意：MCP 走 stdout，所有日志必须写到 stderr。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const log = (msg: string) => process.stderr.write(`[akdagent-mcp] ${msg}\n`);

const server = new McpServer({
  name: "akdagent-mcp-server",
  version: "0.1.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
log("server ready, awaiting MCP client on stdio");
