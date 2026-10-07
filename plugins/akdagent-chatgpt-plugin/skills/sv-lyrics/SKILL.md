---
name: sv-lyrics
description: 为 Synthesizer V 填入已有歌词、创作歌词、核对中文倒字和咬字，并处理延音对位。已有歌词回填不等于授权重新作词或改变音符结构。
---

# 歌词与咬字

先区分已有歌词回填、创作新词、只检查三种意图。实时修改先按 `sv-live` 确认目标与副本。用户只要求填词时，不顺手重排 onset、时值、音高或旧轨道；连音/延音符号按旋律和工具能力处理。

读原版歌词指南（用 akdagent_read_reference 读取 `sv-lyricist/SKILL.md`）的症状索引，然后仅加载匹配的参考：字数/断句/倒字用 `references/咬字与倒字.md`，押韵用 `references/押韵与韵脚.md`，叙事用 `references/结构与叙事.md`，rap 用 `references/说唱词流.md`。参考文件均在同一原版目录。

用读取的音符与实际选区确定填词范围，优先 `sv_apply_lyrics`/`sv_fill_lyrics_to_track`（以当前工具列表为准）。完成后读回歌词与必要的音素状态；有词却不出声时检查静音、声库语言兼容、实际音素和组挂载，不直接改语种或重做音高。

拼音、多音字和声调检查是参考，不把自动结论当试听证明。词句改写、语种修改、和创作性改动超出原请求时先问用户。

参考路径相对于作者资料包的 skills 目录，读取方法见[资料读取说明](../../docs/references.md)。

跨客户端读取：无法访问本地文档链接时，用 akdagent_read_workflow 读取 docs/runtime.md、docs/references.md 或关联的 skills/<名称>/SKILL.md；按 nextLine 分页直到完整读完。工具命名空间由客户端决定，以业务名称识别。
