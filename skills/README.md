# AKDAgent 技能库（分发维护副本）

本目录是 AKDAgent 自带技能的**维护副本（source of truth for distribution）**，用于：
1. **同步到自己用**：跑 `..\scripts\sync-skills.ps1` 把这里的内容复制到 `~/.dsh/skills/`（网页 DSH 与悬浮球都从那里发现技能）

## 技能格式

每个技能一个目录，目录名 = 技能名：

```
skills/<技能名>/
├── SKILL.md        ← YAML frontmatter（name + description）+ Markdown 正文
└── resources/      ← 可选：参考文档、脚本模板
```

frontmatter 示例：

```yaml
---
name: 技能名
description: 一句话说明（agent 据此判断何时加载该技能）
---
```

## 维护约定

- **改技能先改这里**，然后分两路同步：
  - **本机自用（可选）**：`scripts\sync-skills.ps1` 复制到 `~\.dsh\skills`（网页 DSH 与悬浮球从那里发现技能）。⚠️ 该脚本是**增量覆盖、不删文件**（所以不会碰你别的技能）；**⛔ 别把它改成 `/MIR`** —— 那个目录里还放着你自己的技能（PPT / STL / 教学等）。用户 2026-09-19 已裁定**暂不同步 `~\.dsh`**
- 当前技能（**10 个**）：

| 技能 | 用途 |
|---|---|
| `sv-scripting` | SV 脚本开发完整参考，四部分：`api/`（23 个类文档，**官方手册逐页镜像 ⇒ 别往里写自研内容**，`tools/api-docs-sync.cjs --update` 会整批重写）、**`references/`（`01`–`11` 一条连续编号**：01–06 偏**代码片段**（官方库 + AKD 精选）· 07–11 偏**做法与手册**（参数与重音 · Pit · 拆轨拆音 · 声库与声线 · 风格配方）· 另含 `官方API-实测勘误.md`；总索引 `references/README.md`）、`examples/`（12 篇踩坑案例）。（2026-09-21 由 `functions/`+`workflows/` 合并而来 —— 那两名沿自上游手册三段式，属历史遗留，缘由见其 `SKILL.md`「结构」节） |
| `akdagent-protocol` | **现役协议 = 文件通道**：`akdagent-{req,res,hb,boot}-<host>.json` 的字段与规则（`id` 去重 / `consumeReq` / `canServe` 15s）、**29 个 op 全表**、时序与边界排障 |
| `akdagent-playbook` | 实战踩坑与交接手册：开工自检 · 主动提醒清单 · 桥与文件通道故障 · **伴奏对齐（浮动 BPM 两件套）** · 工具与文档纪律 · 缺陷登记与复检 |
| `sv-project-format` | 工程文件结构：`.svp`/`.ixp` JSON 字段 · **三端逐字段对照（SV1/SV2/IX）** · 时间单位 blick · 音符/组/自动化/音频轨 · **生成 .svp（版本策略 + 196 模板 + 音频轨注入）** · recovery 目录与安全读写 |
| `sv-ix` | **Instrument X 实操**：IX vs SV2 的 API 差异（构造对象/字符串类型名/常量不暴露/main group 禁写）· 桥脚本安全守则（哪些 API 卡死闪退）· **音符技法 articulations**：12 轨支持矩阵（Tremolo/Trill）· 互斥矩阵 · 「写入 ≠ 可用」· 弱音器 · 弦乐开关 |
| `sv-texture` | 织体（伴奏型）：八类织体 · 段落↔织体 · 六张配方卡 · 编曲体检清单 · **按乐器生成（管弦 13 件 × 气口/换弓/音域硬约束）** |
| `sv-pit-art` | SV2 彩蛋：用音高线（PitchControlCurve）**画画**（SVG/文字轮廓 → 曲线），含锚定、可见区间夹取与逐段回读纪律 |
| `sv-lyricist` | SV/IX 作词师：结构标签（intro/verse/pre-chorus/chorus/bridge/outro + build/drop）、可唱性、倒字与谐音、韵脚与词格，可 `sv_apply_lyrics` 回填 |
| `composition` | 作曲编曲：乐理/和弦进行/旋律/编曲配器/段落结构/律动与鼓组/混音，衔接 `sv_generate_melody` / `sv_write_chords` / `sv_generate_harmony` |
| `sv-bridge` | ⛔ **已退役** —— 旧 **JS 剪贴板桥**（原 `legacy/SVAgentBridge.js`，**该目录 2026-09-19 已删**）的历史参考；**现役桥是 Lua 文件通道桥，请看 `akdagent-protocol`**（其中唯一仍现役的「浮动 BPM 对齐」已移到 `akdagent-playbook` 的「七、伴奏对齐」节） |
