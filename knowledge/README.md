# `knowledge/` —— **随包知识的唯一来源**

> **契约：这个目录里有什么，安装包的 `resources/knowledge/` 里就有什么。**
> 其它目录**默认不随包**：
> - `docs/` = **开发参考**（工作台账 `待办.md`、`夜间工作-*.md`、`索引基准核对.md`、`clone核对-*.md`、设计稿…）
> - `tools/` = 开发/核对工具（只有少数是**客户端运行时要跑**的，那几个才进这里）
> - `skills/` = **走自己的分发链**（`dsh-runtime/dsh/skills` + `DSH_BUNDLED_SKILL_DIR`），不进本目录，避免两份真源

## 怎么进包

1. 脱敏 + 复制：`node tools/check-redaction.cjs --redact-to dist/knowledge knowledge`
   （源目录 = `knowledge`；`dist/knowledge` 是**生成物**，不进版本库）
2. `electron/electron-builder.yml` 的 `extraResources` 把 `dist/knowledge/*` 映射到 `resources/knowledge/*`
3. 运行时的两个用途：
   - **客户端离线读**（`main.js` 会按 `resources/knowledge/tools/<脚本>` 找工具；缺陷表/API 基线也走这里）
   - **用户/随包 agent 离线翻阅**（文档手册）

## 放什么 / 不放什么

| | 判据 |
|---|---|
| ✅ **放** | 给**终端用户或随包 agent** 看的文档（协议规范、工具清单、实测参考、对照表、用户手册）· 客户端**运行时会跑**的工具脚本 |
| ❌ **不放** | 开发台账与工作日志（`docs/待办.md`、`docs/夜间工作-*.md` 等）· clone/索引核对记录 · 内部设计稿 · 只在开发机上有意义的辅助脚本 |

⚠️ 每一条都要能回答「**终端用户或随包 agent 会用到它吗**」；答不出来就别放 —— 省安装包体积，也少带内部痕迹（脱敏那一步就是这个原因）。

## 状态

- **2026-09-19 建目录并完成迁移**（用户：「新建一个文件夹，把打包的放进去」）。
- **现在的内容**：
  - `docs/` = **13 份对外文档**：`PROTOCOL.md` · `MCP工具清单.md` · `InstrumentX-API枚举.md` · `工程文件结构-实测对比-SV1-SV2-IX.md` · `音频轨schema实测.md` · `MIDI转IXP映射表.md` · `MusicXML转IX映射表.md` · `声库中文名对照表.md` · `音素表.md` · `音素表.json` · `已知Bug与平台约束.md` · `问题与反馈.md` · `变更记录-音频分析升级.md`
  - **`tools/` 不在本目录**：随包工具直接用仓库的 `tools/`（整体 0.4 MB，含客户端运行时要跑的 `host-version-notice.cjs` / `known-bugs.json` / `api-docs-sync.cjs`）—— 脱敏时作为**第二个源**传入。
  - **网页资产不进包**（用户 2026-09-19：「网页资产不要，不在项目里」）：`docs/demo/` · `docs/midi2ixp*` · `docs/音素.html` 已排除。
- 打包源 = `node tools/check-redaction.cjs --redact-to dist/knowledge --clean`
  ⇒ 产物恰好是 `dist/knowledge/{docs,tools}`（`docs` 13 文件 + `tools` 55 文件）。
  ⚠️ **`--clean` 别省**：该脚本只复制不清理，不加它会把源里已删掉的文件以**幽灵副本**留在产物里（实测踩过：`knowledge/skills`、已搬家的旧文档）。
