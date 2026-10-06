/* 量 MCP server 的启动握手耗时（initialize + tools/list），用**官方 SDK 客户端**（与打包客户端同一套协议）。
 * 用途：判客户端 `mcpSelfTest`（`electron/src/main.js`，默认 **6000 ms**）的余量够不够 ——
 *   按设计"自检不过 ⇒ 不注册"，所以在干净机器上超时 = 用户**一颗 mcp__sv__* 工具都没有**。
 * 现场依据：客户端日志 2026-10-04T03:30:05 落过一次 `ok:false / why:'6000ms 内没跑完 initialize+tools/list'`。
 * 用法：node tools/measure-mcp-handshake.cjs [次数]                    （只读，不写文件） */
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SERVER = path.join(__dirname, '..', 'server');
const ENTRY = path.join(SERVER, 'dist', 'index.js');
const N = Number(process.argv[2] || 3);
/** ⚠️ Windows 上用 `import('C:\\…')` 会报 ERR_UNSUPPORTED_ESM_URL_SCHEME —— 必须转成 file:// URL */
const imp = (rel) => import(pathToFileURL(path.join(SERVER, 'node_modules', '@modelcontextprotocol/sdk', rel)).href);

(async () => {
  const { Client } = await imp('dist/esm/client/index.js');
  const { StdioClientTransport } = await imp('dist/esm/client/stdio.js');
  console.log('入口 = ' + ENTRY);
  const runs = [];
  for (let i = 1; i <= N; i++) {
    const t0 = Date.now();
    let initMs = 0, tools = -1, err = null;
    try {
      const transport = new StdioClientTransport({ command: process.execPath, args: [ENTRY], stderr: 'ignore' });
      const client = new Client({ name: 'handshake-probe', version: '0.1.0' });
      await client.connect(transport);
      initMs = Date.now() - t0;
      const r = await client.listTools();
      tools = r.tools.length;
      await client.close();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    const ms = Date.now() - t0;
    runs.push({ initMs, ms, tools, err });
    console.log(`  第 ${i} 次：` + (err ? '失败 ' + err : `initialize ${initMs} ms · +tools/list ${ms} ms · 工具 ${tools} 个`));
  }
  const ok = runs.filter((r) => !r.err).map((r) => r.ms);
  if (ok.length) {
    const slow = Math.max(...ok);
    console.log(`\n成功 ${ok.length}/${N} · 平均 ${Math.round(ok.reduce((a, b) => a + b, 0) / ok.length)} ms · 最慢 ${slow} ms`);
    console.log(`客户端 6000 ms 超时的余量：${(6000 / slow).toFixed(1)}×（此值接近 1 就要调大超时或加一次重试）`);
  }
})();
