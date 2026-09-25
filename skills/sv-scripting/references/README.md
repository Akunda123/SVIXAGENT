# SV 脚本参考库（`sv-scripting/references/`）

本目录 = 本技能的**主题参考正文**，`01`–`11` 是**一条连续编号**：

- **01–06**（原 `functions/`）：以**代码片段**为主 —— 从官方仓库（Dreamtonics/svstudio-scripts）与本机 AKD 脚本目录（SV1 + SV2）挑选的可复用函数，按主题组织。每个条目：用途一行 + 精简核心代码（ES5.1 兼容，可复制进桥脚本或新脚本）。
- **07–11**（原 `workflows/`）：以**做法与手册**为主 —— 调声手法、Pit 画法、拆轨流程、声库选择、风格配方。

> 📌 **2026-09-21 目录合并**：原先分散在 `functions/`（01–06）与 `workflows/`（07–11）两个目录，二者名字沿自**上游官方手册的三段式**（API / Functions / Workflows），与我们自己的内容并不对应（`workflows/` 原定放"脚本类型/安装位置/调试技巧/常见 Bug/最佳实践"，那批内容始终没导入，占位反被主题手册填了）⇒ 现按**文档性质**统一并入本目录、编号连续。
> `api/` 不并（那是**官方类文档逐页镜像**，`tools/api-docs-sync.cjs --update` 会整批重写，守卫 `tools/check-api-mirror.cjs` 盯纯净度）；`examples/` 不并（踩坑案例，性质不同）。历史与取舍见 `../SKILL.md` 的「结构」节。

> 来源目录：
> - SV1: `C:\Users\<USER>\Documents\Dreamtonics\Synthesizer V Studio\scripts\AKD`
> - SV2: `C:\Users\<USER>\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts\AKD`
> - 官方: https://github.com/Dreamtonics/svstudio-scripts（jsDelivr 镜像下载于 `server/audio-ref/official/`）

## 主题索引

| 文件 | 主题 | 来源 |
|---|---|---|
| [01-official.md](01-official.md) | 官方仓库示例（Hello/Tests/Utilities） | Dreamtonics/svstudio-scripts |
| [02-lyrics.md](02-lyrics.md) | 歌词处理（复制/合并/前移/后移/+/−/多音节/lrc） | AKD |
| [03-phonemes.md](03-phonemes.md) | 音素与呼吸音（分割元音/辅音/替换/比例/呼吸音） | AKD |
| [04-notes.md](04-notes.md) | 音符操作（分割/拼接/移动/随机偏移/避免重叠/选中） | AKD |
| [05-params.md](05-params.md) | 参数曲线（复制/同步/简化/锚点检索/音高线） | AKD |
| [06-track-misc.md](06-track-misc.md) | 轨道/工程/杂项（分割轨道/复制/缩放/BPM/水印/和声） | AKD |
| [07-melody-accent-pitch-params.md](07-melody-accent-pitch-params.md) | 旋律重音 → 倚音 → 渲染；音高/参数风格分档 | 实测 + 上游 synthv-tuning |
| [08-pit-drawing.md](08-pit-drawing.md) | Pit（音高线）绘制底层：九段基准、重音检测、两代落地差异 | 实测 + 官方 API |
| [09-拆轨与拆音.md](09-拆轨与拆音.md) | 拆音 vs 拆轨、五级成本阶梯、五种拆轨方式 | 实测 + 上游 |
| [10-声库与声线.md](10-声库与声线.md) | 声库挑选、多声线（vocal mode）切换、AI 声库坑 | 实测 + 上游 |
| [11-风格配方.md](11-风格配方.md) | 唱法手法全集（通俗/R&B/说唱/京剧/藏腔/长调/岛呗/约德尔/美声/新民族…） | 实测 + 上游 synthv-tuning |
| [官方API-实测勘误.md](官方API-实测勘误.md) | **实现侧**对官方 API 文档的实测勘误（`api/` 镜像里**不许写**自研内容） | 实测 |

## 通用骨架（所有函数共用）

```javascript
function getClientInfo() {
  return { "name": "函数名", "category": "AKD", "author": "akd",
           "versionNumber": 1, "minEditorVersion": 65540 };
}
function main() {
  // ...函数体（见各主题文件）
  SV.finish();
}
// 选择 fallback：未选中时取当前组全部音符
var selection = SV.getMainEditor().getSelection();
var scope = SV.getMainEditor().getCurrentGroup();
var group = scope.getTarget();
var selectedNotes = selection.hasSelectedNotes()
  ? selection.getSelectedNotes()
  : (function(){ var a = []; for (var i = 0; i < group.getNumNotes(); i++) a.push(group.getNote(i)); return a; })();
```

## ES5.1 约束（Duktape）

- 禁 `const`/`let`/箭头函数/模板串 → 用 `var`/`function`/`+` 拼接
- 时间单位 blick；`SV.QUARTER = 705600000`
- 写操作前 `SV.getProject().newUndoRecord()`
- 对话框用 `SV.showCustomDialog(form)`，返回 `{status, answers}`
