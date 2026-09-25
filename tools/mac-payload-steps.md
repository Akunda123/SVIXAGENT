# 借来的 Mac：两步出包（__ARCH__）

> 这个包是**整包**（仓库还没推到 GitHub，所以不能 clone）。解压到 `~/SVAgent` 之类的地方即可。
> 需要：macOS + **Apple Silicon**（M 系列，2020 年 11 月起那批）、**能联网**（两次 `npm ci`）。
> **不需要**：装 Node、装任何东西、管理员密码、也不需要在那台机器上有 agent。
> **不支持**：Intel Mac（onnxruntime 没有 darwin/x86-64 二进制）。

## 就两步

```bash
# ① 解压（ditto 比双击稳：保留权限）
mkdir -p ~/SVAgent && ditto -x -k ~/Downloads/akdagent-mac-payload-__ARCH__.zip ~/SVAgent
cd ~/SVAgent

# ② 一条命令（约 6~12 分钟；自带 node+npm、网络失败自动换国内镜像、全程写日志、最后自检）
bash mac-build.sh
```

跑完会在 `electron/release/` 里得到：

| 产物 | 说明 |
|---|---|
| `mac-arm64/AKDAgent.app` | 应用本体（**要带回来的是下面那个 zip**，它就是这个 app 打的包） |
| `AKDAgent-1.0.0-__ARCH__.zip` | **带回来这个** —— 我在 Windows 上能拆开验内容 |
| `AKDAgent-1.0.0-__ARCH__.dmg` | 分发用（可选，带不带都行） |

## 要带回来的两样

1. **`mac-build.log`**（在 `~/SVAgent/`）—— 出任何问题都靠它定位，务必带
2. **`electron/release/AKDAgent-1.0.0-__ARCH__.zip`**

## 这条命令内部做了什么（不用你管，出问题时对照）

| 步 | 做什么 |
|---|---|
| 1/5 | 拿 node + npm：优先用包里那份官方 `node-v24.13.0-darwin-arm64.tar.gz` 解开（**含 npm**），包里没有才联网下（官方 → 镜像） |
| 2/5 | `cd electron && npm ci` —— 装 **darwin** 那份 sherpa（语音输入的原生件） |
| 3/5 | `cd dsh-runtime/dsh && npm ci` —— 这棵树是在 Windows 上组的，把 `@vscode/ripgrep` / `@img/sharp` / `@koromix/koffi` 换成 **darwin** 版 |
| 4/5 | `electron/scripts/build-mac.sh arm64`（默认 `SKIP_SIGN=1`：不签名 + 补 **ad-hoc 签名**，这样本机能双击打开） |
| 5/5 | 自检：server / dsh / 内嵌 node（**要可执行**）/ Lua 桥 / 侧栏面板 / 知识包 / ONNX dylib / 签名，并打印体积 |

## 可选：在 Mac 上顺手验一眼

```bash
open electron/release/mac-arm64/AKDAgent.app     # 菜单栏出现图标、桌面出现悬浮球
```
- 悬浮球右键（或托盘右键）→ **帮助**：应弹出「AKDAgent 使用说明」（离线页面）
- 设置 → 关于：版本 **1.0.0**、三个联系方式（B 站 / 邮箱 / GitHub）
- 【可选】真跑桥：需要这台 Mac 上装了 SV / IX —— 没有就跳过，回 Windows 再验

## 已知会遇到的坑

| 现象 | 处理 |
|---|---|
| app 打不开、提示「已损坏 / 无法验证开发者」 | 脚本已自动 ad-hoc 签名 + `xattr -cr`；仍被拦就 `xattr -cr <app>` 再来一次，或右键 → 打开 |
| `npm ci` 卡在下载 Electron | 脚本已自动重试并换 npmmirror；手工等价命令：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm ci --registry=https://registry.npmmirror.com` |
| 脚本说「这台 Mac 是 x86_64」 | 那是 Intel 机器 ⇒ 不支持（AKDAgent 的 mac 版只出 Apple Silicon） |
| 想只出 `.app`（更快，先确认能跑） | `bash mac-build.sh --dir` |
| 打出来 900 MB+ | 正常（server 341 + dsh 225 + node 112 + Electron 运行时） |
