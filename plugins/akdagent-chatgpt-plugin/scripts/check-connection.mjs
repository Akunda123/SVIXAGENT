import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSdk, loadUpstream } from './runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Client } = await loadSdk('client/index.js');
const { StdioClientTransport } = await loadSdk('client/stdio.js');
const mode = process.argv[2] || 'offline';
if (!['offline', 'live'].includes(mode)) throw new Error('mode must be offline or live');
const launchConfig = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers.akdagent_chatgpt;
const { version } = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
const transport = new StdioClientTransport({
  command: process.execPath, args: [path.join(root, 'scripts', 'server.mjs')],
  cwd: root, stderr: 'pipe', env: { ...process.env, ...launchConfig.env },
});
let stderr = '';
transport.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
const client = new Client({ name: 'akdagent-chatgpt-readonly-check', version });
const requiredReads = ['sv_ping', 'sv_get_project_info', 'sv_get_current_group', 'sv_get_selected_notes'];
const report = { mode, projectWrites: 0, protocolOk: false, allReadsOk: false, server: null, toolCount: 0, originalToolCount: 0, missingOriginalTools: [], checks: {} };
function parseResult(result) {
  const content = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || '';
  try {
    const data = JSON.parse(content);
    return { isError: result.isError === true || data?.ok === false, data };
  }
  catch { return { isError: result.isError === true, text: content }; }
}
try {
  await client.connect(transport);
  report.server = client.getServerVersion();
  report.instructionsProvided = Boolean(client.getInstructions());
  const tools = (await client.listTools()).tools;
  report.toolCount = tools.length;
  report.toolNames = tools.map(tool => tool.name);
  const { registerTools } = await loadUpstream('tools.js');
  const originals = [];
  registerTools({ tool(name) { originals.push(name); } });
  report.originalToolCount = originals.length;
  report.missingOriginalTools = originals.filter(name => !report.toolNames.includes(name));
  if (report.missingOriginalTools.length) throw new Error('Original tool parity failed');
  report.protocolOk = true;
  report.checks.status = parseResult(await client.callTool({ name: 'akdagent_chatgpt_status', arguments: {} }));
  report.checks.universalStatus = parseResult(await client.callTool({ name: 'akdagent_status', arguments: {} }));
  report.checks.workflow = parseResult(await client.callTool({ name: 'akdagent_read_workflow', arguments: { path: 'skills/sv-live/SKILL.md', maxLines: 4 } }));
  report.checks.reference = parseResult(await client.callTool({ name: 'akdagent_read_reference', arguments: { path: 'sv-scripting/SKILL.md', maxLines: 4 } }));
  if (report.checks.status.isError || report.checks.reference.isError || report.checks.universalStatus.isError || report.checks.workflow.isError) throw new Error('Status/workflow/reference check failed');
  if (mode === 'live') {
    for (const name of requiredReads) {
      try {
        report.checks[name] = parseResult(await client.callTool({ name, arguments: { host: 'sv' } }, undefined, { timeout: 20000 }));
      } catch (error) {
        report.checks[name] = { isError: true, error: String(error?.message || error) };
      }
      if (report.checks[name].isError) break;
    }
    report.allReadsOk = requiredReads.every(name => report.checks[name]?.isError === false);
    report.skippedReads = requiredReads.filter(name => !report.checks[name]);
  }
  report.liveBridgeOk = mode === 'live' && report.checks.sv_ping?.isError === false && report.checks.sv_get_project_info?.isError === false;
} catch (error) {
  report.error = String(error?.message || error);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
}
if (stderr) report.stderr = stderr;
console.log(JSON.stringify(report, null, 2));
if (!report.protocolOk) process.exitCode = 1;
if (mode === 'live' && !report.allReadsOk) process.exitCode = 2;
