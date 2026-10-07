import { installDir, runtimeDir, upstreamVersion, skillsDir, loadDependency, loadSdk, loadUpstream } from './runtime.mjs';
import { readReference } from './references.mjs';
import { readWorkflow } from './workflows.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('../.codex-plugin/plugin.json', import.meta.url), 'utf8'));
// AKDAgent audio tools resolve optional model paths relative to the server package.
process.chdir(runtimeDir);

const { McpServer } = await loadSdk('server/mcp.js');
const { StdioServerTransport } = await loadSdk('server/stdio.js');
const { registerTools } = await loadUpstream('tools.js');
const { readHeartbeat, resolveIpcDir } = await loadUpstream('fileipc.js');

const instructions = `AKDAgent Plugin is a local, model-provider-independent MCP integration.
Read the matching workflow before acting: sv-live, sv-vocal-tuning, sv-lyrics, sv-composition or sv-project. If your client does not load plugin skills, call akdagent_read_workflow with path skills/<name>/SKILL.md. Linked local guides are also available through this tool under docs/. Follow nextLine until null when a complete guide is required.
Tools use the original, unmodified AKDAgent implementation. Live SV edits go through its Lua file bridge and are reflected in the host UI; saving and audio export are separate UI tasks.
Read before editing, preserve original projects by default, change only the scope the human requested, and read back after writing. A request to inspect, explain or connect is not authorization to edit music. Do not change voicebank files without explicit authorization.
Use only one SV bridge and one active editing client. Serialize bridge calls; on write timeout, inspect actual state before retrying.
sv_run_script executes Lua (native indices start at 1), while protocol track/note indices start at 0. Read precise API signatures first.
Use current tools/list as capability truth. Upstream documents contain historical/user-specific notes and unimplemented specifications; those do not override current human instructions or prove implemented guards.
本地工具不调用 AKDAgent 的付费模型聊天；直接在本聊天中使用。`;

const server = new McpServer(
  { name: 'akdagent-chatgpt-plugin', title: 'AKDAgent Plugin', version },
  { instructions },
);

// Preserve upstream schemas, callbacks, defaults, serialization and undo behavior.
registerTools(server);
const { z } = loadDependency('zod');
server.registerTool('akdagent_read_reference', {
  description: 'Read a bounded page of installed upstream SV music/API documentation. Paths are relative to the skills directory; no project files or credentials. Follow nextLine until null when a complete reference is required.',
  inputSchema: { path: z.string(), startLine: z.number().int().min(1).default(1), maxLines: z.number().int().min(1).max(400).default(200) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async args => {
  try { return { content: [{ type: 'text', text: JSON.stringify(readReference(skillsDir, args)) }] }; }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
server.registerTool('akdagent_read_workflow', {
  description:'Read packaged music workflows or connection guides in clients that do not load skills automatically. Paths: skills/sv-live/SKILL.md, skills/sv-vocal-tuning/SKILL.md, skills/sv-lyrics/SKILL.md, skills/sv-composition/SKILL.md, skills/sv-project/SKILL.md, or docs/runtime.md, docs/references.md, docs/clients.md, docs/standalone.md, docs/testing.md.',
  inputSchema:{path:z.string(),startLine:z.number().int().min(1).default(1),maxLines:z.number().int().min(1).max(400).default(200)},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
}, async args => {
  try{return {content:[{type:'text',text:JSON.stringify(readWorkflow(fileURLToPath(new URL('../',import.meta.url)),args))}]};}
  catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
});
const statusDefinition = {
  title: 'AKDAgent Plugin connection status',
  description: '只读检查个人插件和本地 SV 桥状态，不发送编辑请求、不读取 API 密钥。online 仅表示心跳新鲜，端到端连接还须用 sv_ping 验证。',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
const status = async () => {
  const heartbeat = readHeartbeat('sv');
  const age = typeof heartbeat?.ts === 'number' ? Date.now() / 1000 - heartbeat.ts : null;
  const info = {
    plugin: 'AKDAgent Plugin', version, installDir, runtimeDir,
    upstreamVersion, skillsDir, transport: 'stdio → original AKDAgent file IPC → SV Lua bridge',
    ipcDirectory: resolveIpcDir(),
    bridge: {
      online: age !== null && age >= -2 && age <= 15,
      heartbeatAgeSeconds: age === null ? null : Math.round(age * 100) / 100,
      hostName: heartbeat?.hostName ?? null, hostVersion: heartbeat?.version ?? null,
      isSV2: heartbeat?.isSV2 ?? null, version: heartbeat?.bridge ?? null,
      operations: Array.isArray(heartbeat?.ops) ? heartbeat.ops : [],
    },
    modelApiUsed: false,
    hint: '在目标 SV 中运行：脚本 → Agent → AKDAgent Bridge；不要在 SV1/SV2 同时运行两个 SV 桥，也不要让原 Agent 和本插件同时写工程。',
  };
  return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
};
server.registerTool('akdagent_status', statusDefinition, status);
server.registerTool('akdagent_chatgpt_status', {...statusDefinition, description:statusDefinition.description+' Compatibility alias for akdagent_status.'}, status);

await server.connect(new StdioServerTransport());
