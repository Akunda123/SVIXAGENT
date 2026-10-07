# AKDAgent Plugin

在 **Codex、Claude Code、Claude Desktop、Cursor、VS Code Copilot 或 OpenCode** 中，用自然语言检查和编辑 Synthesizer V 工程。插件使用 [AKDAgent](https://github.com/Akunda123/SVIXAGENT) 的 MCP 编辑实现和 Lua 桥，通过独立服务运行。

[English](README.en.md) · [安全与隐私](SECURITY.md) · [测试范围](docs/testing.md) · [变更记录](CHANGELOG.md)

插件维护者：[littleclock2](https://github.com/littleclock2) · [独立插件仓库与下载](https://github.com/littleclock2/AKDAgent-Plugin)。AKDAgent 原作者：[Akunda123](https://github.com/Akunda123)。

通用版采用 Agent Plugins 1.0 插件结构，并提供各应用的 MCP 配置。完整接入步骤见 [跨客户端说明](docs/clients.md)。为兼容已安装版本，技术标识 `akdagent-chatgpt-plugin` 保留，展示名称统一为 **AKDAgent Plugin**。

社区集成，非 OpenAI / Dreamtonics 官方插件；是否收录为 [AKDAgent](https://github.com/Akunda123/SVIXAGENT) 的项目组件由维护者决定。

## 功能

功能参照 [AKDAgent 功能说明](https://github.com/Akunda123/SVIXAGENT#三功能) 整理，并结合本插件的部署方式与实际工具范围说明。

### 工程读取与实时编辑

- **识别宿主与当前操作对象**：检查桥接状态、宿主版本及 SV1 / SV2 代际，读取工程信息、轨道、当前音符组和选中的音符。
- **检查音符布局**：查看歌词、音高、起点和时值，找出音符重叠、短小间隙及乐句之间的空隙，为填词、清理节奏或调教提供依据。
- **按条件批量编辑**：在指定轨道、组或选区内移调、调整时值、修改歌词，或通过 Lua 脚本处理短音符、超出音域的音符等具体条件。
- **在宿主中反馈结果**：修改直接作用于当前 SV 工程，写入后读取结果核对；适用的写操作使用宿主撤销记录，便于比较和回退。

### 歌词、音素与说唱

- **已有歌词回填**：中文逐字、英文按词填入音符，可处理选区、当前组或整条轨道；提供 LRC 时可预览按时间戳对位的方案。
- **歌词创作与复核**：结合主题、情绪、曲风、旋律字数和气口辅助写词，检查词格、押韵、倒字及可能产生歧义的谐音。
- **音素与咬字调整**：读取音符实际使用的音素和语种，查询相近发音候选，预览批量替换音素、辅音收边及混合语种处理方案。
- **说唱专项**：查询宿主计算的重音与语调，按词检查普通话声调和多音字，生成相应的语种、声调及说唱重音处理方案。

### 音高线与演唱表现

- **音头、连接与收尾**：参考旋律走向和歌词重音，调整起音、音符之间的过渡、滑音、长音颤音和句尾走向；也可保留自动演唱，只修饰重点音符。
- **适配两代音高机制**：根据宿主能力使用 SV1 音符属性或 SV2 原生音高曲线，并在支持的宿主上读取计算后的音高作为核对依据。
- **添加装饰音**：生成前倚音、后倚音、波音、回音、音尾行进及滑音等方案；可根据需要配合局部动态变化。
- **呼吸与连贯性处理**：结合乐句、歌词含义和剩余时值安排 `br` 呼吸音符，调整不必要的小间隙及连音；呼吸位置和长度由具体乐句决定。

### 参数与音色控制

- **按乐句调整参数**：写入张力、气声、响度、发声、性别、颤音包络、音高偏移及音区偏移等自动化曲线；宿主和声库支持时可处理相应声线参数。
- **设计段落变化**：例如主歌收敛张力、副歌增加力度、长音渐弱、句尾增加气声，或把指定段落的表现参数作为其他段落的参考。
- **预览与回读**：先读取已有参数，再预览曲线点和取值范围，写入后抽样核对；局部修改可设置首尾过渡，避免把整组参数变成一个固定值。

### 旋律、和声与工程文件

- **生成与检查旋律**：根据调性、情绪、和弦进行和小节数生成旋律及可选琶音，导出 MIDI；复核大跳、重复音、密集短音和气口等问题。
- **生成和声**：结合主旋律与调性生成三度、六度等和声方案，并按目标宿主的能力写入音符组或轨道。
- **MusicXML 导入**：预览声部、音符、时值、歌词、力度与技法映射，指定目标轨道和时间偏移后导入；多页乐谱可分段衔接。
- **工程文件处理**：结合作者的工程格式资料，检查、复制、生成或编辑 `.svp` / `.ixp` 文件，辅助迁移 SV1 / SV2 工程并核对轨道、歌词和音符结构。

### 音频分析与对轨

- **分析伴奏或干声**：读取 WAV 的速度、节拍、调性、响度、频谱和音高中位数，也可分析指定时间片段；根据这些特征估计和弦与情绪。
- **对齐伴奏和工程**：检测速度与第一拍位置，给出伴奏相对小节线或音符的对齐方案；宿主支持时，可按速度变化写入速度标记。
- **音频预处理**：把 WAV / MP3 转为 44.1 kHz 立体声 WAV；其他容器格式可在安装 ffmpeg 后处理。

### 需要额外组件或其他宿主的功能

| 功能 | 内容与使用条件 |
|---|---|
| 人声与伴奏分离 | 使用 [AKDAgent 所集成的 MDX-Net 模型](https://github.com/Akunda123/SVIXAGENT#31-音频分析处理含对轨)在本地推理，支持 `Kim_Vocal_2` 人声优先模型和 `UVR-MDX-NET-Inst_HQ_3` 乐器优先模型，也可分别提取较干净的人声与伴奏。独立部署需另备相应模型文件；本审阅版未测试推理功能。 |
| 干声音符提取 | 使用 [CREPE](https://github.com/marl/crepe) 音高检测模型，将干声转为带音高、起点、时值及置信度的音符数据。需另备兼容的 ONNX 模型文件；本审阅版未测试推理功能。 |
| 图片乐谱识别 | 使用 [Dolce](https://github.com/lodebar2026/dolce) 识谱引擎将 PNG / JPEG 五线谱识别为 MusicXML，再接乐谱导入流程。独立部署需补充该引擎及其依赖。 |
| Instrument X 编曲 | 使用 [AKDAgent 的 IX 编曲实现](https://github.com/Akunda123/SVIXAGENT#39-ixinstrument-x-专属)铺和弦、分解与琶音，生成乐器织体并标注演奏技法。需连接 IX 桥，并使用支持相应技法的乐器。 |
| Flat 声库风格 | 使用 [AKDAgent 的 Flat 风格编辑实现](https://github.com/Akunda123/SVIXAGENT#310-flat-声库编辑)列出、组合、新建和调整兼容声库的风格配置。需相应 Flat 配置，跨声库组合受 vocoder 兼容性约束。 |
| ACE Studio | 使用 [ACE Studio CLI](https://github.com/Akunda123/SVIXAGENT#五ace-studio第三方宿主)及相应工程辅助脚本查询工程、编辑音符 / 歌词和人声参数。需单独安装并配置这些组件。 |

插件提供 **实时操作、调教、歌词、作曲、工程文件** 五个技能入口，按任务读取独立资料包或已有 AKDAgent 安装中的作者资料。客户端没有技能加载机制时，可通过 `akdagent_read_workflow` 读取同一套操作规范。对话使用当前客户端选择的模型，无需另配 AKDAgent 模型聊天的 API key；所选客户端和模型的额度、计费规则分别适用。

具体可用项取决于部署的服务版本、宿主与附加组件，已验证范围见 [测试说明](docs/testing.md)。LRC 对位、辅音收边及 `br` / `-` 标记处理应先核对预览；保存工程、选择声库和导出音频在宿主中完成。

## 快速安装（Windows，个人范围）

**推荐：独立一键部署**。无需下载或安装 AKDAgent 客户端。下载一键包后双击 `Deploy.cmd`，选择要配置的应用，即可安装独立 MCP、调教资料和 Lua 桥，并注册对应的插件或 MCP 连接。前提是已安装可运行脚本的 SV、所需声库及支持本地 MCP 的客户端，首次部署需要联网安装依赖。也支持分别下载三个组件，详见 [一键部署说明](docs/standalone.md)。

**也可以将[本仓库链接](https://github.com/littleclock2/AKDAgent-Plugin)直接发给你的 AI Agent，让它按照安装说明帮你完成安装。**

### Codex：已有运行时的可选安装方式

如果已有 [AKDAgent](https://github.com/Akunda123/SVIXAGENT) 安装，也可使用其现有运行时；Lua 桥部署步骤见 [AKDAgent 安装说明](https://github.com/Akunda123/SVIXAGENT#一开始使用)。

1. 解压发行 ZIP，或在此仓库中进入 `plugins/akdagent-chatgpt-plugin`。
2. 在 PowerShell 中运行下面命令（替换示例安装路径）：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -AKDAgentDir 'C:\Apps\AKDAgent'
   ```

   标准 `%LOCALAPPDATA%\Programs\AKDAgent` 安装可省略 `-AKDAgentDir`。脚本仅在本用户 `.agents/plugins/marketplace.json` 添加/更新独立条目，安装到 `.codex/plugins/local/akdagent-chatgpt-plugin/1.0.0`。已有同名版本目录时停止，不覆盖；可指定 `-Destination`。

3. 重启 Codex，在插件目录选择 **AKDAgent Community Integrations** 并安装/启用 **AKDAgent Plugin**。如果已有个人市场，会保留其名称及其他插件；在原市场下找新增条目即可。
4. 退出原 AKDAgent 客户端，在 **SV1 或 SV2 其中一个**打开工程并运行 `脚本 → Agent → AKDAgent Bridge`。
5. 新开 Codex 聊天，选择插件，发送：`检查当前 SV 工程，不要修改`。

脚本会生成适合本机的 Node 路径及运行时路径。安装后若移动 AKDAgent，需要更新已安装源目录的 `.mcp.json` 后刷新插件；不要手改临时缓存。

### 开发者 / 仓库市场安装

安装 Node.js 22.13+ 并置于 PATH。非标准位置设置 `AKDAGENT_INSTALL_DIR` 后重启目标客户端，确保它继承环境。Codex CLI 支持时在仓库根运行 `codex plugin marketplace add .`，再在桌面插件目录安装；Claude Code 可添加本地仓库市场。包内同时包含标准 `plugin.json` / `mcp.json`、`.claude-plugin` 和 `.codex-plugin` 格式，其他 MCP 客户端使用生成的 JSON 配置。

## 使用示例

> 检查当前轨道的歌词、重叠和小间隙，不要修改。

> 在工程副本上，只调教选中的人声音轨；保留旋律、节奏和歌词，让长音收尾与换气更自然。

> 仅将我提供的歌词填进指定音符，不改旧轨道和音符结构。

大范围修改前在 SV 中另存副本。修改后检查回读和实际听感，再自行保存。宿主撤销不能替代文件备份。

## 故障排查与卸载

| 症状 | 检查 |
|---|---|
| 插件不显示 | 重启 Codex、选择正确的个人市场，确认安装源目录仍存在；不要仅添加 MCP 配置后期待出现插件卡片 |
| runtime not found | 核对 `AKDAGENT_INSTALL_DIR` 下存在 `resources/server/dist/tools.js` 和依赖 |
| offline / timeout | 重跑目标 SV 的 Lua 桥；仅保留一个 SV 桥及编辑客户端；核对 IPC 目录 |
| 有词无声 | 检查静音、声库、语言、音素与组挂载；连接成功不证明声库可用 |
| 资料缺失 | 独立部署检查 `references/skills` 与 `AKDAGENT_SKILLS_DIR`；使用 AKDAgent 安装时检查 `resources/dsh/skills` |

卸载：在所选客户端停用连接，删除其配置中的 `akdagent` 条目；Codex 插件方式还需在插件目录卸载并删除个人市场中的本插件条目。只删除本次部署目录，保留其他服务与插件。配置修改前会生成带时间戳的备份。

## 开发、许可与发布状态

见 [CONTRIBUTING.md](CONTRIBUTING.md)。适配器与技能入口采用 MIT，保留 Akunda123 与贡献者署名，见 [LICENSE](LICENSE)；[AKDAgent](https://github.com/Akunda123/SVIXAGENT) 资料及其引用组件保留各自许可，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

参考了 [Codex 官方打包说明](https://developers.openai.com/plugins/build/plugins) 以及官方插件的 manifest / interface / skills 组织形式。Git 仓库市场与公共官方目录不同：fork、PR 或 ZIP 发布都不等于通过官方目录审核。
