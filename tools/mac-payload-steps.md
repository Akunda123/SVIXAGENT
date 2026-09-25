# 借来的 Mac：出包步骤（约 20 分钟）

> 这个包是整包（仓库还没推到 GitHub，所以不能 clone）。解压到 `~/SVAgent` 之类的地方即可。
> 需要：macOS + **Apple Silicon**（M 系列）、Node ≥ 20（`node -v` 看）、**能联网**（`npm ci` 要下 Electron 与 darwin 的 STT 包）。
> Intel Mac 不支持（onnxruntime 没有 darwin/x64 二进制）。

## 0. 解压后先看一眼
> 解压用 **`ditto -x -k 包名.zip ~/SVAgent`**（比双击解压稳：能保留权限与符号链接；
> 双击走 Archive Utility 也行，但 zip 是 Windows 打的、**存不下 POSIX 权限**，
> 所以第 2 步的脚本会自动给 `node` 补可执行位 —— 不用你手动 chmod）。
```bash
mkdir -p ~/SVAgent && ditto -x -k ~/Downloads/akdagent-mac-payload-arm64.zip ~/SVAgent
cd ~/SVAgent
ls                       # 应有 electron/ tools/ sv/ dsh-runtime/ dist/ MAC-STEPS.md（就是本文件）
node -v                  # 需 ≥ 20
uname -m                 # 必须是 arm64
```

## 1. 装依赖（唯一需要联网的一步，约 5~10 分钟；**两处 npm ci，别漏第二处**）
```bash
# ① Electron 侧：装 darwin 那份 sherpa（STT）
cd ~/SVAgent/electron
npm ci
ls node_modules | grep sherpa      # 应看到 sherpa-onnx-darwin-__ARCH__ 且**没有** sherpa-onnx-win-x64
cd ..

# ② 内嵌 DSH 侧：这棵树是在 Windows 上组装的，里面几个可选依赖只带了 **win32** 那份
#    （@img/sharp-win32-x64 · @vscode/ripgrep-win32-x64 · @koromix/koffi-win32-x64 ·
#      node-addon-require-builtin-win32-x64-msvc）
#    ⇒ 不重装的话，mac 上"图片/搜索/原生对话框"这些功能会缺件。npm ci 会按平台换成 darwin 版。
cd ~/SVAgent/dsh-runtime/dsh
npm ci
ls node_modules/@vscode | grep ripgrep     # 应看到 ripgrep-darwin-arm64
ls node_modules/@img | grep sharp          # 应看到 sharp-darwin-arm64
cd ../..
```

## 2. 出包（脚本已备好；会自动复用包里的 darwin node 与预装运行时）
```bash
SKIP_SIGN=1 electron/scripts/build-mac.sh __ARCH__ --dir     # 没证书：先只出 .app（最快，~1 分钟）
```
- `SKIP_SIGN=1` 是**没证书时必须加的**：它让 builder 不做签名（builder 找不到证书只会 warn 跳过，
  不会替我们打 ad-hoc），然后脚本第 4 步自己补 **ad-hoc 签名** + `xattr -cr` ⇒ 本机才能双击打开。
- 想同时出 dmg + zip（正式分发用）：去掉 `--dir`，约 3~6 分钟
- 产物在 `electron/release/`：`mac-arm64/AKDAgent.app`、以及 `AKDAgent-0.1.0-__ARCH__.dmg` / `.zip`
- 脚本另外会做两件事：① 用包里预装的 `dist/server-runtime-darwin-__ARCH__`（**不重建、不下模型**、约省 10 分钟）
  ② 复用 `dsh-runtime/node-runtimes/darwin-__ARCH__/node` 并补可执行位（**不下载**，约省 50 MB）
- 将来有 Apple 开发者证书时：**不加** `SKIP_SIGN`（builder 自己签），公证见 `electron/scripts/BUILD-MAC.md` §6

## 3. 在 Mac 上验一遍（照着勾）
1. 双击 app（或 `open -a electron/release/mac-arm64/AKDAgent.app`）⇒ 桌面出现**悬浮球**、不闪退
2. 悬浮球/菜单栏里打开**设置** ⇒ 能开、能切语言（简/繁/英/日）
3. MCP 自动注册：客户端启动后会往 DSH profile 里写 `mcp-akdagent`。找它：
   ```bash
   ls -d ~/.dsh* ~/Library/Application\ Support/AKDAgent* 2>/dev/null
   grep -rn "mcp-akdagent" ~/.dsh*/profiles/*/cordis.patch.yml 2>/dev/null
   ```
   期望：`command` 指向 app 里的 node，`args` 指向 `.../AKDAgent.app/Contents/Resources/server/dist/index.js`
   （**路径里不能有空格** —— app 名是 AKDAgent，放在「应用程序」里也没空格，应该是干净的）
4. 【可选】语音输入：设置页启用 ⇒ 会下模型（200 MB 左右）；只验加载的话看一眼
   `Contents/Resources/app.asar.unpacked/node_modules/sherpa-onnx-darwin-__ARCH__/` 里有 `.dylib`
5. 【可选】真跑桥：需要这台 Mac 上装了 SV / IX —— 没有就跳过（回到 Windows 再验）

## 4. 带回来什么
- 有报错：把 **终端输出**（整段）截图/贴回来
- 出的包：`electron/release/AKDAgent-0.1.0-__ARCH__.zip`（**这个带回来我能在 Windows 上拆开验内容**；
  只有 zip 也行 —— dmg 我要它没用）
- 顺带：第 3 步第 3 条找到的 `cordis.patch.yml` 内容

## 5. 已知会遇到的坑
| 现象 | 处理 |
|---|---|
| app 打不开、提示「已损坏 / 无法验证开发者」 | `xattr -cr <app>` 再试；脚本已自动做 ad-hoc 签名 |
| `npm ci` 卡在下载 Electron | 网络问题；或设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |
| 脚本报「缺 server/dist/index.js」 | 不该发生（包里带了预装运行时）—— 把输出发我 |
| 打出来 900 MB+ | 正常（server 341 + dsh 225 + node 112 + Electron 运行时） |
