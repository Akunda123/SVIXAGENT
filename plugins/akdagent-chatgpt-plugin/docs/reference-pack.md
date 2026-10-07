# AKDAgent 调教资料包

来自 [AKDAgent](https://github.com/Akunda123/SVIXAGENT) 的八个选定技能目录，版本及逐文件哈希见 manifest.json。保留原文、署名和引用；没有重写作者资料。仅选取 Markdown/JSON，排除可执行辅助脚本及 Dreamtonics 官方 API 镜像。个别引用路径可能指向未打包资源，缺失时应查 [AKDAgent 技能资料](https://github.com/Akunda123/SVIXAGENT/tree/main/skills)或 [Dreamtonics 官方文档](https://resource.dreamtonics.com/scripting/)，不猜 API。

可独立下载，不依赖完整 Agent 客户端。部署脚本设置 `AKDAGENT_SKILLS_DIR` 为本包 `skills`；插件通过 `akdagent_read_reference` 按任务分页读取。官方 API 请查 https://resource.dreamtonics.com/scripting/ 。

AKDAgent 作者文字按 [AKDAgent 的 MIT 许可](https://github.com/Akunda123/SVIXAGENT/blob/main/LICENSE)（包内 LICENSE.AKDAgent）；原文部分章节注明引用或改写了其他来源，不能用顶层 MIT 去掉这些声明：

- SynthVCopilot/SKILLS：Apache-2.0 + Commons Clause + Additional Terms，完整原文见 `licenses/SynthVCopilot.LICENSE` 与 `licenses/SynthVCopilot.LICENSE-ADDITIONAL.md`；来源 https://github.com/SynthVCopilot/SKILLS ，核对提交 `d6b90c2ad709ffa2d1ffcec74f2074dc9048b1d5`。其条款不属于 OSI 开源许可，禁止 Sell（包括打包到收费插件/服务），对 AI 辅助输出披露另有要求。不要将混合资料包宣称为纯 MIT 或无限制开源。
- [SJY051/music-composition](https://github.com/SJY051/music-composition)：资料标注 CC BY 4.0 / 代码 MIT，许可 https://creativecommons.org/licenses/by/4.0/ 。原文保留借鉴范围说明。
- jtydhr88/music-composition-skills：原文声明仅借鉴思路，技能 MIT，书籍摘录另有版权。本包不额外抓取或复制其书籍摘录；见原文来源说明。

本资料包免费分发，保留混合许可与出处，不代表各原作者认可本插件或生成作品。实际音乐作品的权利仍由使用者核对。
