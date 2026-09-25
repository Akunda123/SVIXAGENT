// 用 README-发布版草案-v2.md 生成 GitHub 版 README.md
// 做法：① 截到 `## 内部说明`（那节标着"发布前整节删除"）② 换掉 H1，补 GitHub 要的头部/目录/源码构建/许可见
const fs = require('fs');
const path = require('path');
// ⚠️ 以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成**从本文件位置推**：
//    本脚本就在 <仓根>/tools/ 下，所以仓根 = 上一级。换机器/换用户名都不用改。
const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'README-发布版草案-v2.md'), 'utf8').split(/\r?\n/);

// ① 截掉「内部说明」及其后
let cut = src.findIndex((l) => /^##\s*内部说明/.test(l));
if (cut < 0) { console.error('找不到「内部说明」节，拒绝生成（避免把内部内容发上 GitHub）'); process.exit(1); }
let body = src.slice(0, cut).join('\n').replace(/\s+$/, '');

// ② 去掉草案自己那行 H1（我们要换上 GitHub 头）
body = body.replace(/^#\s*AKDAgent（发布草案 v2[^\n]*\n+/, '').replace(/^---\n+/, '');

const head = [
  '# AKDAgent',
  '',
  '> **以 [DSH](https://github.com/deepseek-ai)（DeepSeek Harness）为底层、用对话操作 Synthesizer V Studio / Instrument X 的智能助手。**',
  '>',
  '> 📦 仓库名 **SVIXAGENT** = **S**ynthesizer **V** + **I**nstrument **X** + AGENT；产品名 **AKDAgent**（安装包 / 程序名 / 数据目录都用后者）。',
  '',
  '你说人话，它替你动手：看得懂你的工程（当前在哪条轨/组、选中了哪些音符、伴奏是什么和弦），',
  '并直接改工程里的音符、音高线、参数与织体。',
  '',
  '| 平台 | 宿主 | 规模 |',
  '|---|---|---|',
  '| Windows 10+（64 位）· macOS 待发布（Apple Silicon） | Synthesizer V Studio **SV1 / SV2** · **Instrument X** | **44 个 MCP 工具 · Lua 桥 32 个 op** |',
  '',
  '> ⬇️ **下载**：见 [Releases](../../releases)（更新方式 = 重新分发安装包；客户端**不出网、不自动检测、不自动下载**，无遥测）。',
  '',
  '## 目录',
  '',
  '- [这是什么](#这是什么)',
  '- [一、开始使用](#一开始使用)　· 运行要求 / 安装 / 配 API 密钥 / 部署桥 / 启动 / 设置项',
  '- [二、组件](#二组件)　· 桥 / 悬浮球 / 侧栏面板 / 语音输入 / 语言（两套）',
  '- [三、功能](#三功能)　· 音频分析对轨 / 工程生成 / 音符编辑 / 旋律和声 / 歌词 / 音素咬字 / 音高 / 参数 / IX 专属 / Flat 声库',
  '- [四、注意事项与常见问题](#四注意事项与常见问题)',
  '- [反馈与联系](#反馈与联系)',
  '- [许可与第三方](#许可与第三方)　· [English](#english-brief)',
  '',
  '---',
  '',
].join('\n');

// ⛔ 尾部**只留用户能感知的东西**（用户 2026-09-23：README 要直接粘到 GitHub，**不出现开发/内部内容**）
//    ⇒ 不再放「从源码构建」「离线自测」「守卫」「改桥要先部署再重跑」这类开发说明；
//      那些留在 `docs/README-开发版.md` 里（不进 GitHub）。
// 🆕 2026-09-25：**尾部那块「许可与第三方」已删** —— 草案里本来就有同名章节 ⇒ 之前 README 里出现两遍；
//    现在以草案那一节为唯一真源（知识包 / 上游来源那两条已并进草案）。
const tail = '';

const out = head + body + tail;
const p = path.join(R, 'README.md');
if (out.charCodeAt(0) === 0xFEFF) { console.error('会引入 BOM，拒绝'); process.exit(1); }
fs.writeFileSync(p, out, 'utf8');
console.log('written README.md · ' + out.split('\n').length + ' 行 · ' + Buffer.byteLength(out) + ' 字节');
console.log('（开发版已备份在 docs/README-开发版.md）');
