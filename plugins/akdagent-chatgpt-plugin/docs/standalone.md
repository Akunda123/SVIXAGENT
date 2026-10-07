# 一键部署 / Standalone deployment

解压 `akdagent-one-click-1.0.0.zip`，双击根目录 **Deploy.cmd**，选择应用。支持 `codex`、`claude-code`、`claude-desktop`、`cursor`、`vscode`、`opencode`，输入多个名称时用英文逗号分隔。

也可分别下载插件、MCP、资料三个 ZIP，解压在同一目录形成 `akdagent-chatgpt-plugin`、`akdagent-mcp-service`、`akdagent-references` 三个同级目录，然后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\akdagent-chatgpt-plugin\scripts\deploy.ps1 -BundleRoot . -Clients 'cursor,claude-desktop'
```

无需下载或安装 AKDAgent 客户端。MCP 编辑实现、Lua 桥及调教资料已在这三个组件中提供。首次部署需要联网获取 Node（缺失或过旧时）和 npm 锁定依赖。Windows x64 部署，默认个人范围，无管理员权限、不修改系统 PATH。支持 `-Proxy http://127.0.0.1:端口`，代理只作用于此次下载/依赖安装。

脚本会：

1. 将服务、资料及共享插件复制到 `%USERPROFILE%/.akdagent/1.0.0`，已存在则停止，不覆盖。
2. 复用 Node 22.13+（含 npm），否则下载官方 Node 22.22.0 Windows x64 ZIP 并校验内置 SHA-256；不执行来源不明的在线脚本。
3. 从锁文件安装服务依赖，禁止 npm 生命周期脚本；不下载推理模型。运行 MCP 初始化、工具列表及资料读取自检，不发送工程编辑请求。
4. 生成通用及各应用的 MCP 配置，只注册所选应用。配置保留其他服务、账号字段与 JSONC 注释并创建备份；选择 Codex 时另注册其个人插件市场。OpenCode v2 使用 `-OpenCodeVersion 2`，默认适配 v1。
5. SV1 使用 Windows“文档”已知文件夹下 `Dreamtonics/Synthesizer V Studio/scripts/Agent`（支持文档重定向）；SV2 使用 `%APPDATA%/Dreamtonics/Synthesizer V Studio 2/scripts/Agent`。也识别已有的 SV1 AppData 布局。安装原版 Lua 桥时，相同文件跳过，不同文件保留并提示，避免覆盖用户定制。

手动收尾：重启所选应用，在其 MCP 设置中启用；Codex 用户在个人插件市场安装/启用 AKDAgent Plugin。Claude Code 也可使用随包提供的原生插件清单。然后在目标 SV 内运行 `Agent → AKDAgent Bridge`，一次只保留一个活跃编辑客户端。各应用步骤见 [跨客户端说明](clients.md)。

自定义 SV 脚本目录可用 `-SVScriptDirectories 'X:\SV scripts'`，路径从 SV 的“脚本 → 打开脚本文件夹”获取。`-SkipBridge` 不安装桥，`-SkipPlugin` 只安装服务/资料。诊断失败的目录会保留；修复后用新的 `-InstallRoot` 重试，脚本不递归删除旧目录。

其他支持本地 stdio 的 MCP 客户端也可使用安装目录 `client-configs/generic.json`，其中包含 Node、适配器入口、独立服务及资料的绝对路径。原有 53 个编辑工具之外，适配器还提供状态（含兼容别名）、作者资料读取和通用工作流读取，合计 57 个工具；没有自动加载技能的客户端仍可读取同一套调教规范。

SV 工程读取、歌词 / 音符编辑、音高线及参数调整使用独立服务和 Lua 桥，无需 AKDAgent 客户端或其安装目录。音频推理使用 [AKDAgent 所集成的 MDX-Net / CREPE 模型](https://github.com/Akunda123/SVIXAGENT#31-音频分析处理含对轨)，需另备兼容模型文件；图片识谱需 [Dolce](https://github.com/lodebar2026/dolce)，其他音频容器转换需 ffmpeg。

插件默认自动查找 `%USERPROFILE%/.akdagent/1.0.0/service` 及同级 `references/skills`，也保留 `.codex/akdagent/<版本>` 目录的兼容查找。自定义部署路径由安装器写入各应用的 JSON；`AKDAGENT_INSTALL_DIR` 是兼容保留的变量名，其值可直接指向本插件的独立服务目录。

服务启动时使用 `service/resources/server` 作为工作目录。以后安装兼容模型时，模型路径以该目录为基准，例如 CREPE 的 `models/crepe/small.onnx`；基础 SV 编辑不需要这些模型。

卸载：在客户端停用连接，删除其配置中的 `akdagent` 条目；Codex 用户另卸载插件并移除个人市场中的对应条目。只删除本次输出的精确部署目录。Lua 桥可能被其他客户端共用，应核对后再删除。

资料包含单独许可，先阅读其中 README 和 licenses。此一键包为免费社区分发；不得据适配器 MIT 误将受限资料转售或打包进收费产品。This distribution includes generative-AI-assisted integration code/documentation; upstream authors do not endorse its outputs.
