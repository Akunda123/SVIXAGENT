# 连接与操作规范

通道：所选 AI 客户端 → MCP stdio → 本插件部署的独立编辑服务 → Lua 文件桥 → SV 内存工程。编辑实现来自 [AKDAgent](https://github.com/Akunda123/SVIXAGENT)，无需安装其客户端。

- 先调用 `akdagent_status`（旧名 `akdagent_chatgpt_status` 仍可用），再 `sv_ping`。心跳新鲜不等于端到端通信正常。用返回的 `isSV2` 判断宿主代际，不按目录名称猜测。
- 在目标 SV 中运行 `脚本 → Agent → AKDAgent Bridge`。一次仅运行一个 SV 桥、一个编辑客户端；使用本插件时退出原 AKDAgent 客户端，它的后台轮询也可能争用单槽 IPC。
- 默认 IPC 顺序遵循 [AKDAgent 文件协议](https://github.com/Akunda123/SVIXAGENT/tree/main/skills/akdagent-protocol)：已存在的 `%USERPROFILE%/AKDAgent/ipc`，否则系统临时目录。该目录不存在时可使用临时目录，不要求安装客户端；自定义 `AKDAGENT_IPC_DIR` 时必须使 Lua 桥使用同一目录。
- 用户要求检查时只读。编辑前确认文件、轨道、组 UUID、选区和共享引用；默认保留原件并使用副本，只修改授权范围。
- 串行调用桥。写入后读回；写超时先检查实际状态，不能直接重复写。不能假定 [AKDAgent](https://github.com/Akunda123/SVIXAGENT) 已实现文档中描述的所有保护。
- `sv_run_script` 使用 Lua：方法用冒号，原生索引从 1 开始；MCP/JSON 索引从 0 开始。写脚本建立 `SV.getProject():newUndoRecord()`，先读准确 API 签名。
- 实时内存修改、界面显示、磁盘保存和试听是不同验证层级。不要将成功回包描述为已保存或已试听；不擅自更换声库/语言。
- 作者资料通过 [按需资料读取](references.md) 访问；历史用户约定和未实现规格不是当前授权。

已知风险：自动辅音处理的预览范围、LRC 对位和 `br`/`-` 标记识别需人工核对，不能仅凭成功返回批量写入。SV1 音符音高属性不应直接套到 SV2 原生曲线。
