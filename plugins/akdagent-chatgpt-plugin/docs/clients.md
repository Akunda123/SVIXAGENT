# 跨客户端使用 AKDAgent Plugin

编辑通过本地 MCP stdio 服务执行，服务不绑定模型供应商。你可以在支持工具调用的客户端选择其提供的模型；模型对音乐要求的理解、工具调用可靠性和听感判断仍会有所差异。

## 安装与选择应用

解压一键包，双击 `Deploy.cmd`，输入要配置的应用名称（英文逗号分隔）：

```text
codex,claude-code,claude-desktop,cursor,vscode,opencode
```

也可从 PowerShell 指定：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\akdagent-chatgpt-plugin\scripts\deploy.ps1 -BundleRoot . -Clients 'cursor,claude-desktop'
```

服务、插件和资料默认安装在 `%USERPROFILE%/.akdagent/0.3.0`。只配置所选应用；已有配置中其他服务、账号设置和 JSONC 注释保留，变更前创建备份。遇到结构错误、重复键或符号链接时保留原文件，导出配置供手动合并。OpenCode v2 使用 `-OpenCodeVersion 2`；默认适配 v1。

## 各应用的入口

| 应用 | 安装入口与配置 |
|---|---|
| Codex | 注册个人市场，再在插件目录启用 AKDAgent Plugin；保留 `.codex-plugin` 兼容清单。 |
| Claude Code | 部署脚本可注册用户 MCP（`~/.claude.json`）；也提供 `.claude-plugin` 插件包与仓库市场，插件方式用 `/plugin marketplace add <本地仓库路径>`、`/plugin install akdagent-chatgpt-plugin@akdagent-community`。两种入口选择一种，避免重复连接。 |
| Claude Desktop | 写入 `%APPDATA%/Claude/claude_desktop_config.json` 的 `mcpServers.akdagent`。完全退出并重启客户端后启用连接。 |
| Cursor | 写入 `~/.cursor/mcp.json`；在 MCP 设置中确认并启用。 |
| VS Code Copilot | 写入 `%APPDATA%/Code/User/mcp.json` 的 `servers.akdagent`，兼容已有 VS Code 版本；在 Agent 模式选择工具。支持 Agent Plugins 1.0 的版本也可加载本包的 `plugin.json` / `mcp.json` / `skills`。 |
| OpenCode | 写入 `~/.config/opencode/opencode.json`（若已有 `.jsonc` 则更新该文件），v1 使用 `mcp.akdagent`，v2 使用 `mcp.servers.akdagent`；`opencode mcp list` 检查连接。 |

安装目录内 `client-configs/` 同时生成 Claude Code、Claude Desktop、Cursor、VS Code、OpenCode v1/v2 和通用 MCP JSON，便于配置非标准路径或其他兼容客户端。客户端启动路径使用绝对路径，包含独立服务及资料目录，不要求安装 AKDAgent 客户端。

## 没有技能自动加载时

Claude Desktop 等客户端未必加载磁盘上的技能文件。服务因此提供 `akdagent_read_workflow`，从同一套插件文件读取五个技能及连接指南，另提供 `akdagent_read_reference` 读取作者资料。可以这样开始：

> 先通过 akdagent_read_workflow 完整读取 skills/sv-live/SKILL.md，再检查当前 SV 工程，不要修改。

调教时读取 `skills/sv-vocal-tuning/SKILL.md`；歌词、作曲、工程文件分别使用 `sv-lyrics`、`sv-composition`、`sv-project`。没有可访问的本地文档链接时，通过 `akdagent_read_workflow` 读取 `docs/runtime.md` 或 `docs/references.md`。沿 `nextLine` 分页直到 `null`。工具前缀由客户端决定，以业务名称识别即可。

## 使用与验证范围

可为多个应用保存配置，但一次只保留一个活跃编辑客户端和一个目标 SV 桥；其他应用也可能自动启动 MCP，切换时停用前一应用的连接。使用 `akdagent_status` 查询状态，`akdagent_chatgpt_status` 作为兼容别名继续保留。

当前部署脚本面向 Windows x64。本地检查覆盖配置合并、路径、MCP 启动及资料读取；没有安装的客户端不宣称完成界面验收。客户端和模型的账户额度、计费与数据政策分别适用。真实 SV 读写和听感需在选定客户端验收。

配置依据：[Claude Code](https://code.claude.com/docs/en/mcp)、[Claude Code 插件](https://code.claude.com/docs/en/plugins-reference)、[Claude Desktop](https://py.sdk.modelcontextprotocol.io/get-started/real-host/)、[Cursor](https://cursor.com/docs/mcp)、[VS Code MCP](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)、[VS Code 插件](https://code.visualstudio.com/docs/agent-customization/agent-plugins)、[OpenCode v1](https://opencode.ai/docs/mcp-servers/)、[OpenCode v2](https://dev.opencode.ai/v2/docs/mcp-servers/)。
