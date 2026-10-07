---
name: sv-composition
description: 结合 AKDAgent 本地工具进行旋律、和声、编曲结构和乐句设计，或分析已有音乐段落。仅在用户要求作曲编曲时扩展素材，不把人声调教变成重写歌曲。
---

# 作曲与编曲

用原版作曲指南（用 akdagent_read_reference 读取 `composition/SKILL.md`）的症状索引定位问题，按需读主旋律生成、和声进行、编曲配器、段落结构、律动或风格护栏参考，不全量加载。

判断须能落到具体乐句、拍点、音区、和弦和声部。结合用户素材与指定风格，不冒称听过未实际播放的文件。借鉴技法而非复制参考曲的具体旋律。

本地生成工具可离线出方案；要落进当前 SV 工程时按 `sv-live` 确认副本、声部及目标轨道，保留工具的预览、权利确认和读回约束。生成旋律用相应检查工具验证，但结构检查不等于音乐试听。Instrument X 织体需求再读织体手册（用 akdagent_read_reference 读取 `sv-texture/SKILL.md`）与IX 资料（用 akdagent_read_reference 读取 `sv-ix/SKILL.md`），不将 IX 缺陷套到 SV1/SV2。

参考路径相对于作者资料包的 skills 目录，读取方法见[资料读取说明](../../docs/references.md)。

跨客户端读取：无法访问本地文档链接时，用 akdagent_read_workflow 读取 docs/runtime.md、docs/references.md 或关联的 skills/<名称>/SKILL.md；按 nextLine 分页直到完整读完。工具命名空间由客户端决定，以业务名称识别。
