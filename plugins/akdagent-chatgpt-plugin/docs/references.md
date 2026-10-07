# 按需读取原作者资料

资料作为独立下载包提供，也可复用已安装 AKDAgent 的 `resources/dsh/skills`。调用 `akdagent_read_reference`，`path` 相对于配置的 skills 目录，使用正斜杠。独立包不复制官方 API 镜像；这些 API 请查 Dreamtonics 官方文档，完整 Agent 安装含对应文件时也可本地读取。例：

```json
{"path":"sv-scripting/references/08-pit-drawing.md","startLine":1,"maxLines":200}
```

需要完整阅读某篇资料时，沿 `nextLine` 分页直到 `null`；仅按任务选取相关篇目，不整库载入。原文中的相对引用按该文所在目录解析。读不到时报告缺失，不猜 API；可查 [AKDAgent 技能资料](https://github.com/Akunda123/SVIXAGENT/tree/main/skills)中相应版本的文件。

| 用途 | path |
|---|---|
| 实时操作与故障 | `akdagent-playbook/SKILL.md`、`akdagent-protocol/SKILL.md` |
| API 与勘误 | `sv-scripting/api/README.md`、`sv-scripting/references/官方API-实测勘误.md` |
| 调教 | `sv-scripting/references/07-melody-accent-pitch-params.md`、`sv-scripting/references/08-pit-drawing.md` |
| 歌词 | `sv-lyricist/SKILL.md` |
| 工程格式 | `sv-project-format/SKILL.md` |
| 编曲 | `composition/SKILL.md` |

作者资料保留各自版权与适用条款；工具只提供本机读取，不改变许可。历史经验与当前版本实测冲突时先核对宿主版本；无法核实时明确不确定性。
