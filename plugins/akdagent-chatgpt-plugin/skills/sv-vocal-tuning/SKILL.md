---
name: sv-vocal-tuning
description: 在 Synthesizer V 中按乐句、歌词和演唱风格调教人声音高、咬字、颤音、呼吸及表现参数。适用于人声调教与机械感诊断，不用于音高曲线画图彩蛋。
---

# 人声调教

实时修改前按 `sv-live` 及[本机规范](../../docs/runtime.md)确认副本、宿主和指定轨道。问清会改变结果的缺失选择，例如目标声库、自然/夸张唱法、参考段；不要每个音符都让用户确认。

按任务读取原版资料，保留音乐判断与实现限制的区别：

- 重音、旋律走势、少数重点音的处理：重音与音高参数（用 akdagent_read_reference 读取 `sv-scripting/references/07-melody-accent-pitch-params.md`）。
- 音头、连接、颤音和音尾，尤其 SV1 属性与 SV2 曲线的区别：音乐性 Pit 规范（用 akdagent_read_reference 读取 `sv-scripting/references/08-pit-drawing.md`）。自动演唱并非必须全部抹平，常规优先重点修饰；整段手动画线须由任务决定。
- 咬字和音素：音素处理（用 akdagent_read_reference 读取 `sv-scripting/references/03-phonemes.md`）、咬字案例（用 akdagent_read_reference 读取 `sv-scripting/examples/咬字糊成一团.md`）。
- 唱法与段落表现：风格配方（用 akdagent_read_reference 读取 `sv-scripting/references/11-风格配方.md`）；声线边界：声库与声线（用 akdagent_read_reference 读取 `sv-scripting/references/10-声库与声线.md`）。这些是参考配方，不是全曲统一套用的硬参数。
- 短缝、拆音与拼接：拆轨与拆音（用 akdagent_read_reference 读取 `sv-scripting/references/09-拆轨与拆音.md`）。清理微缝不等于消灭真实气口；`br` 按句意、速度、时值余量设置，不强行等长，不与原唱音符重叠。
- 新 API 使用前核对 Dreamtonics 官方脚本文档；完整 Agent 安装如含 API 镜像，可用 akdagent_read_reference 读取 `sv-scripting/api/README.md`。独立资料包不含该镜像。再读实测勘误（`sv-scripting/references/官方API-实测勘误.md`）。

参考原工程已有曲线和歌词语义；不要把跨软件导入参数全部照搬。只处理用户指定轨道/乐句，不擅自更改旋律、歌词、语种或声库。用户要求保留其一时严格保持。参数读回只证明写入，真实咬字、颤音和呼吸需试听验证；没有实际试听就明确说明。

参考路径相对于作者资料包的 skills 目录，读取方法见[资料读取说明](../../docs/references.md)。

跨客户端读取：无法访问本地文档链接时，用 akdagent_read_workflow 读取 docs/runtime.md、docs/references.md 或关联的 skills/<名称>/SKILL.md；按 nextLine 分页直到完整读完。工具命名空间由客户端决定，以业务名称识别。
