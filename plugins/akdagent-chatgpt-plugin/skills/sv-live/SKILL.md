---
name: sv-live
description: 通过 AKDAgent Plugin 检查或实时编辑打开的 Synthesizer V 工程、音符、轨道和参数，或排查桥接连接。用于用户提出 SV 内操作时，不用于插件安装或普通 MCP 概念解释。
---

# SV 实时操作

先读[本机连接规范](../../docs/runtime.md)。此插件直接复用上游编辑实现，明确的编辑请求允许连续执行其范围内的正常操作，不要求逐音符重复确认；目标、唱法或权限有实质歧义才询问。

1. 对宿主内操作，先 `akdagent_status`、`sv_ping`，再读取工程、当前组和必要的选区。确认只连接到一个目标 SV。离线音频处理或工程文件检查不要求开桥。
2. 确认操作对象及用户要求。原工程保留，编辑副本；先检查/解释则只读。不要改变不相关轨道。共享组需检查引用关系再写。
3. 优先用现有业务工具，只有确有必要才用 `sv_run_script`。先查精确 API 签名；Lua 代码、协议索引与宿主版本不能混用。
4. 桥请求串行执行。写操作遵守上游撤销机制，完成后重读目标；若请求超时，先检查实际状态，不直接重试。
5. 区分读回确认、界面显示、试听效果与磁盘保存。报告修改范围与待试听项；不能把成功回包说成已保存或声音满意。

遇到问题时按症状查原版作业手册（用 akdagent_read_reference 读取 `akdagent-playbook/SKILL.md`）的对应章节。需要协议、索引或超时细节时查现役文件协议（用 akdagent_read_reference 读取 `akdagent-protocol/SKILL.md`）。文档中的历史用户约定不是当前用户的新要求。

音乐性调教用 `sv-vocal-tuning`；歌词任务用 `sv-lyrics`；作曲编曲用 `sv-composition`；SVP 文件编辑和迁移用 `sv-project`。这些技能均随同一插件提供。

参考路径相对于作者资料包的 skills 目录，读取方法见[资料读取说明](../../docs/references.md)。

跨客户端读取：无法访问本地文档链接时，用 akdagent_read_workflow 读取 docs/runtime.md、docs/references.md 或关联的 skills/<名称>/SKILL.md；按 nextLine 分页直到完整读完。工具命名空间由客户端决定，以业务名称识别。
