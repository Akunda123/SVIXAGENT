# 在 macOS 上打 AKDAgent 包（runbook）

> 用户 2026-09-24 裁定：**darwin 运行时也一起长备好** + mac 带语音输入。
> ⚠️ **本文档与 `build-mac.sh` 都还没有在真 mac 上跑过**（开发机只有 Windows）。
> 所以每一步都写了"怎么判断它成功/失败"，出问题时按最后一节对号入座。

## 0. 一句话

**dmg/zip 只能在 macOS 上出**（electron-builder 不支持在 Windows 上构建 mac target）。
Windows 这边已经把**能备的都备好**了（见 §1），Mac 上要做的只有三步：装依赖 → 跑脚本 → 验包。

## 1. Windows 侧已备好什么（2026-09-24）

| 项 | 状态 | 产物/证据 |
|---|---|---|
| MCP server 运行时（darwin/arm64） | ✅ 已组装 | `dist/server-runtime-darwin-arm64/`（340.6 MB，含 `STAGING.json` 台账 = darwin/arm64 + models） |
| 内嵌 node（darwin/arm64） | ✅ 已下载 | `dsh-runtime/node-runtimes/darwin-arm64/node`（112.2 MB，Mach-O `cffaedfe` + cputype arm64） |
| STT 的 darwin 包 | ✅ 已进依赖 | `electron/package.json` → `optionalDependencies`: `sherpa-onnx-darwin-arm64` / `-darwin-x64`（`os`/`cpu` 约束 ⇒ 各平台 `npm ci` 只装匹配那份） |
| 内嵌 DSH 运行时树（纯 JS、平台无关） | ⚠️ 需搬运 + Mac 上 `npm ci` | `dsh-runtime/dsh/`（224.6 MB）；见 §3.1。**里面的平台专属可选依赖（sharp/ripgrep/koffi）只带了 win32 那份** ⇒ Mac 上必须在 `dsh-runtime/dsh` 里跑一次 `npm ci` |
| 签名 / 公证 | ⚠️ 要你的Apple 凭据 | 配置已就位（`hardenedRuntime` + entitlements + 给内嵌 node 签名）；见 §5 |

### 1.1 Mac 侧代码适配（2026-09-25 已修，Windows 上看不出来的硬编码）

`electron/src/main.js` 里有 4 处**只在 Windows 上说得通**的写法，借 Mac 出包前必须知道（已全部修好）：

| 位置 | 原问题（mac 上的后果） | 现在的写法 |
|---|---|---|
| `resolveNodeBin()` | 内嵌 node 名硬编码 `node.exe` ⇒ mac 包里指向**不存在的文件** ⇒ 内嵌 DSH host / STT 子进程**全部 spawn 失败**（致命） | 按平台给 `node(.exe)`；另加了 Homebrew 的 node 候选（开发态用） |
| `ensureSpaceFreeMcpCommand()` | 同一处硬编码（拿不到路径就不改写，非致命） | 统一走 `resolveNodeBin()` |
| `createTray()` | `nativeImage.createFromPath()` **读不了 .ico** ⇒ mac 菜单栏一个空白位（渲染失败但**不报错**，最难查的那种） | darwin 用 `tray.png` 缩到 18×18；Windows 仍用 `.ico` |
| `detectFlatSv()` | `tasklist` + `synthv-flat.exe` 是 Windows 专属；mac 上靠 `spawnSync` **抛异常被 catch** 兜住（"用异常当控制流"） | 显式 `process.platform === 'win32'` 才探测进程；mac 只看数据目录 |

> 还有一处**故意的差异**（未改）：`window-all-closed` → `quitApp()`。mac 习惯是"关窗不退出、留在菜单栏"，
> 但这个 app 的球是**隐藏**而不是关闭，正常用不会触发；要贴合 HIG 再单独改。

**Intel（x64）mac 暂不支持** —— **用户 2026-09-24 裁定：先不做 Intel 支持**（理由见下，时机也对：
Apple 已宣布 macOS 26 "Tahoe" 是最后一个支持 Intel Mac 的系统）。
不是偷懒，是依赖缺件：实测 `onnxruntime-node@1.27.0` 里
**`bin/napi-v6/darwin/` 只有 `arm64`**（同一个包里 win32 有 x64、linux 也有 x64，唯独 darwin 没有）
⇒ Intel mac 上 ONNX 功能（人声分离 / 音高提取 / 音频分析…）没有二进制可用。
上游依据：[microsoft/onnxruntime#27961](https://github.com/microsoft/onnxruntime/issues/27961)
「onnxruntime-node no longer shipping x86-64 since 1.23.x」；另有报告说 **1.23.2** 在 Intel macOS 上仍可用。
要真支持 Intel：把 `server` 的 `onnxruntime-node` 降到 ≤1.23.2（或只在 mac 构建里 pin），
再 `node tools/build-server-runtime.cjs --platform darwin --arch x64`，此时产物里才会有
`libonnxruntime.*.dylib`（现在那份是 0.1 MB = 空的，我已删掉）。
`tools/check-package-assets.cjs` 会在你把 x64 加回 mac 目标时提醒这条约束。

## 2. 为什么这么设计（三段式）

同一个目录只能放**一个平台**的产物，而 electron-builder 的 `extraResources` 读的是固定路径：

```
dsh-runtime/node/      ← 只有一份，谁最后 activate 就是谁   ← tools/stage-node-runtime.cjs
dist/server-runtime/   ← 只有一份，谁最后组装就是谁         ← tools/build-server-runtime.cjs
```

所以两边都写了**机读台账**（`NODE-STAGING.json` / `STAGING.json`），
`tools/check-package-assets.cjs` 会核对"台账平台 = 当前平台"，防止
**"为 mac 备好之后又打 Windows 包"** ⇒ 包里塞进 mac 的 node / darwin 裁过的依赖（能装上但跑不起来，且不报错）。

## 3. 怎么把仓库弄到 Mac 上（重要：两个大目录被 gitignore）

`.gitignore` 排除了 `dsh-runtime/`、`dist/`、`server/models/`、`*.onnx` 等 ⇒ **git clone 拿不到它们**。
而且**仓库现在还没有远端**（0 commit）⇒ clone 这条路暂时根本走不通。三条路，选一条：

### 3.1 借一台 Mac：最短路径（2026-09-25 新增，推荐）

**Windows 侧一条命令**打个整包（含源码 + 三个被 gitignore 的大件 + 一份 `MAC-STEPS.md`
+ **一条命令的出包脚本** `mac-build.sh` + **官方 darwin node tar.gz**（含 npm））：

```powershell
cd C:\Users\<USER>\Documents\SVAgent
powershell -ExecutionPolicy Bypass -File tools\pack-mac-payload.ps1
# ⇒ %TEMP%\akdagent-mac-payload-arm64.zip（实测 **394 MB**、35,092 个条目；
#    脚本会自检"包里该有的都在、不该有的都不在"，不过就 exit 1）
# ⚠️ node tar.gz 取自 %USERPROFILE%\Documents\mac-deps\（见 §3.1.1）；脚本只是临时拷进来、打完就删，
#    且 `*.tar.gz` 已在 .gitignore 里 ⇒ 绝不会误提交。
```

**Mac 侧两步**（Apple Silicon · 要联网 · **不用装 Node、不用管理员、不用 agent**）：

```bash
mkdir -p ~/SVAgent && ditto -x -k ~/Downloads/akdagent-mac-payload-arm64.zip ~/SVAgent
cd ~/SVAgent && bash mac-build.sh          # 约 6~12 分钟；全程日志写 mac-build.log
```

`mac-build.sh`（= 仓库的 `electron/scripts/mac-build-all.sh`，打包时复制到整包根）依次做：

| 步 | 做什么 |
|---|---|
| 1/5 | 拿 node+npm：优先解开包里的官方 `node-v24.13.0-darwin-arm64.tar.gz`（**含 npm**），包里没有才联网下（官方 → npmmirror） |
| 2/5 | `electron/ npm ci`（装 **darwin** 那份 sherpa） |
| 3/5 | `dsh-runtime/dsh/ npm ci`（把这棵树里的 `@vscode/ripgrep` / `@img/sharp` / `@koromix/koffi` 换成 **darwin** 版） |
| 4/5 | `SKIP_SIGN=1 electron/scripts/build-mac.sh arm64`（不签名 → 脚本再补 **ad-hoc**） |
| 5/5 | 自检：server / dsh / 内嵌 node（**要可执行**）/ Lua 桥 / 侧栏面板 / 知识包 / ONNX dylib / 签名 |

> ⚠️ **3/5 不能省**：`dsh-runtime/dsh` 是在 Windows 上从本机 npm prefix 拷出来的，里面
> `@img/sharp` / `@vscode/ripgrep` / `@koromix/koffi` / `node-addon-require-builtin` **只带了 win32 那份**
> ⇒ 不重装的话 mac 上「图片处理 / 文件搜索 / 原生对话框」缺 darwin 二进制。
> 那份 `package-lock.json` 里各平台条目齐全，`npm ci` 按平台自动换成 darwin 版
> （`build-mac.sh` 的前置检查会 warn 这件事，但不拦）。

包里带了 `dsh-runtime/dsh`（225 MB）、`dsh-runtime/node-runtimes/darwin-arm64`（112 MB）、
`dist/server-runtime-darwin-arm64`（341 MB）⇒ 脚本会**直接复用**它们：不重建 server 运行时、不下模型、不下 node。
**不用手动 chmod** —— `stage-node-runtime.cjs` 会补 `node` 的可执行位（Windows 打的 zip 存不下 POSIX 权限）。

#### 3.1.1 Windows 侧要先备好的两样

| 件 | 从哪来 | 校验 |
|---|---|---|
| `node-v24.13.0-darwin-arm64.tar.gz`（48.8 MB，含 npm/npx/corepack） | 放在 `%USERPROFILE%\Documents\mac-deps\`；官方 `https://nodejs.org/dist/v24.13.0/`，国内用镜像 `https://npmmirror.com/mirrors/node/v24.13.0/` | 与官方 `SHASUMS256.txt` 对 SHA256（现记录 `d595961e563fcae057d4a0fb992f175a54d97fcc4a14dc2d474d92ddeea3b9f8`） |
| `dist/server-runtime-darwin-arm64`（341 MB） | `node tools/build-server-runtime.cjs --platform darwin --arch arm64 --out dist/server-runtime-darwin-arm64` | `tools/check-package-assets.cjs` §⑦：台账平台/架构 + dylib + 模型 + 与 `server/dist` 逐字节同源 |

> 为什么非得要那个 tar.gz：包里 `dsh-runtime/node-runtimes/darwin-arm64/node` **只是 node 二进制、没有 npm**，
> 而 Mac 上要做两次 `npm ci`（官方 tar.gz 里才有 npm/npx）。

> ⚠️ **编码坑（已按守卫的要求解掉）**：Windows PowerShell 5.1 会把**无 BOM** 的 `.ps1` 按 ANSI
> （本机 gb2312）解码 ⇒ 里面的中文字面量会变乱码（`check-no-bom.cjs` 又明令禁止仓内文件带 BOM）。
> 所以 `pack-mac-payload.ps1` **保持纯 ASCII**（注释与输出都是英文），中文正文放在
> `tools/mac-payload-steps.md` 里、由脚本用**显式 UTF-8** 读写 ⇒ 两条约束都满足。
> 脚本自带断言：万一有人往里塞了非 ASCII 字符，它会 `Write-Warning` 报出来。

### 3.2 有远端仓库之后（将来）

```bash
git clone <repo> ~/SVAgent && cd ~/SVAgent
```
再把 §3.1 那个 zip 解压覆盖进去（大件不在 git 里）。

### 3.3 在 Mac 上从零重建（要网、要时间，但不用搬 600 MB）

```bash
# 内嵌 DSH 树（纯 JS；需要 PowerShell 7）
pwsh -File electron/scripts/build-runtime.ps1 -Registry -Version <dsh版本>
# MCP server 运行时
cd server && npm ci && npm run build && cd ..
node tools/build-server-runtime.cjs --platform darwin --arch arm64
```
> ⚠️ `build-runtime.ps1` 里有一处 `robocopy`（Windows 专有）与 `Start-Process` 冒烟测试；
> 真在 Mac 上跑它之前先把这两处改成跨平台写法（或直接用 §3.1）。

### 3.4 旧做法（已过时，留作参考）

```powershell
Compress-Archive -Path dsh-runtime, dist\server-runtime-darwin-arm64, server\dist, server\models `
                 -DestinationPath D:\akdagent-mac-payload.zip -Force
```
> 缺点：`Compress-Archive` 慢、且不带源码/脚本/`MAC-STEPS.md`，Mac 上还得另想办法拿源码 ⇒ 改用 §3.1。

## 4. 在 Mac 上出包

```bash
cd ~/SVAgent
cd electron && npm ci && cd ..                    # ← darwin 的 sherpa 在这一步自动装上（唯一要联网的一步）
chmod +x electron/scripts/build-mac.sh            # 走 §3.1 的 zip 时权限可能丢
electron/scripts/build-mac.sh                     # 默认 arm64 → dmg + zip
# 只出 app 目录（最快，~1 分钟）：
electron/scripts/build-mac.sh arm64 --dir
# 不签名试包（没证书时必须加，脚本会补 ad-hoc 签名）：
SKIP_SIGN=1 electron/scripts/build-mac.sh arm64 --dir
```

> 走 §3.1 的整包时**不需要** `cd server && npm ci`：包里带了预装好的 darwin server 运行时。

脚本内部三步（也可以手动跑，便于定位）：

```bash
node tools/build-server-runtime.cjs --platform darwin --arch arm64      # ① 台账写 darwin/arm64
node tools/stage-node-runtime.cjs   --platform darwin --arch arm64 --activate   # ② 下载并生效
cd electron && npx electron-builder --mac --arm64                      # ③ 打包
```

> **走 §3.1 整包时，① 和 ② 会自己走"复用"分支**：① 发现 `dist/server-runtime-darwin-arm64/STAGING.json`
> 在、且没有 `server/node_modules` ⇒ 直接拷成 `dist/server-runtime`（不重建、不下模型）；
> ② 发现 `dsh-runtime/node-runtimes/darwin-arm64/node` 台账对得上 ⇒ 不下载，只补可执行位 + activate。

## 5. 签名与公证

**先回答"必须签名吗"**：

| 场景 | 要不要签 | 怎么做 |
|---|---|---|
| **自己机器上开发自测** | **不必**（但有一步兜底） | `SKIP_SIGN=1 ./build-mac.sh` ⇒ 脚本打包后**自动 ad-hoc 签名**（`codesign --force --deep --sign -`）+ 清 quarantine。Apple Silicon 上未签名的 app 常打不开；ad-hoc 不需要任何证书 |
| 内网/AirDrop 拷给同事几台 | 通常不必 | 同上；接收方若被拦：`xattr -cr /Applications/AKDAgent.app` |
| **给别人下载安装（正式分发）** | **实际必须**：Developer ID 签名 **+ 公证** | 否则 Gatekeeper 拦；macOS 15(Sequoia) 起连"右键→打开"的绕过都没了，用户得去 系统设置 → 隐私与安全性 → 仍要打开 |
| App Store（MAS） | 必须（且另有要求） | 当前配置未做 mas |

**为什么 `SKIP_SIGN` 不是"什么都不做"**：`app-builder-lib/out/macPackager.js:209` 找不到证书时只
`reportError()` 后 `return false`（warn + 跳过，**不会失败**）；而 `@electron/osx-sign/sign.js:176`
只用查到的 identity 签名、**没有 ad-hoc 分支** ⇒ builder 不会替你打 ad-hoc，得自己补一步。

| 做法 | 命令 |
|---|---|
| 本机试包（推荐） | `SKIP_SIGN=1 ./build-mac.sh arm64`（脚本第 4 步自动 ad-hoc 签名 + `xattr -cr` + 校验） |
| 手工等价 | `codesign --force --deep --sign - electron/release/mac-arm64/AKDAgent.app` → `xattr -cr <同一个 app>` → `codesign --verify --deep --strict <app>` 自检 |
| 有 Apple 开发者证书 | **不要**设 `SKIP_SIGN`；electron-builder 自动发现钥匙串里的 "Developer ID Application" |
| 显式跳过签名 | `identity: null`（配置文件）或 `CSC_IDENTITY_AUTO_DISCOVERY=false`（环境变量）—— 等价于 SKIP_SIGN 的打包部分 |
| **公证**（分发给别人） | 设 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`，并把 `electron-builder.yml` 的 `mac.notarize` 改成 `true`（现在是 `false`） |

> ⚠️ `hardenedRuntime` + entitlements **只在有签名时才有意义**；不签名时这两项被忽略 —— 别指望它们绕过 Gatekeeper。

**不签名不只是"多点一下"，有两条实打实的后果**：
1. **mac 端自动更新用不了** —— electron-builder 官方文档写明 *"Code signing is required on macOS / macOS application must be signed in order for auto updating to work"*
   （[Auto Update](https://www.electron.build/docs/features/auto-update)）。将来接 `electron-updater` 时必须先有证书。
2. **麦克风（语音输入）的 TCC 授权不可靠** —— 系统按"签名身份"记住授权；app 没有稳定签名时会被当成新身份，
   权限可能反复弹窗或给不上。ad-hoc 能解决"能启动"，但**解决不了**分发与授权稳定。
   另注：`zip` 目标是 Squirrel.Mac 的**硬前提**（同上文档），我们已同时出 dmg + zip ✓。

`electron-builder.yml` 里已经配好：`hardenedRuntime: true` · `entitlements(-Inherit): build/entitlements.mac.plist` ·
`binaries: [Contents/Resources/node/node]`（**内嵌 node 也要签名**，否则 hardened runtime 下 spawn 它会被系统挡）。

## 6. 验收清单（在真 mac 上照着走一遍）

1. **能开**：双击 app → 悬浮球出现，不闪退（hardened runtime/entitlements 有问题会在这一步炸）。
2. **桥**：SV 里 `Agent → AKDAgentBridge.lua` → 面板顶部「桥：在跑」。
3. **MCP**：设置页/对话里让助手跑一个 `sv_ping` 类操作（`mcp__sv__*` 能起来 ⇒ `resources/server` 与内嵌 node 路径对）。
4. **语音输入**（最可能出问题的一项）：设置页启用 → 说话有转写。
   失败先看 `Contents/Resources/app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64/` 里的 `.dylib` 在不在，
   再看控制台有没有 `library load disallowed by system policy`（⇒ entitlements）。
5. **ONNX 功能**：拿一段音频做分离/音高提取 → 有结果（⇒ `libonnxruntime.*.dylib` 在位）。
6. **语言**：设置页切 4 个语种，文案整体切换（i18n 与平台无关，作为回归项）。
7. **卸载**：拖走 app；`~/Library/Application Support/AKDAgent` 与 `~/.dsh` **不应**被删（凭据/会话是用户数据）。

## 7. 对号入座（预计会遇到的坑）

| 症状 | 原因 | 处理 |
|---|---|---|
| app 直接崩，控制台说 `code signature invalid` | 没签名/hardened runtime 与 JIT 冲突 | 试包用 `SKIP_SIGN=1`；正式包走证书 + entitlements |
| 语音输入静默不可用，日志 `spawn ... ENOENT` 或 `spawn node` 失败 | 内嵌 node 没进包 / 没签名 / 名字不对 | 确认 `Contents/Resources/node/node` 存在且有执行位；`stage-node-runtime.cjs --activate` 会写对文件名（darwin 是 `node`，win 是 `node.exe`） |
| 日志 `library load disallowed by system policy` | 原生件（sherpa/onnxruntime）加载被 hardened runtime 挡 | 已开 `disable-library-validation`；仍不行则在 `binaries` 里补该 `.dylib` 的路径 |
| ONNX 功能报缺少二进制 | 这台是 Intel mac | 见 §1：darwin-x64 无 onnxruntime 二进制 |
| `dsh web` 起不来 | `dsh-runtime/dsh` 没搬/没建 | 见 §3 |
| 装出来 900 MB+、dmg 很慢 | payload 本来就大（server 328 MB + dsh 225 MB + node 112 MB） | 正常；要瘦身先看 `dist/server-runtime/models`（240 MB 可改按需下载） |

## 8. 出包会得到哪些产物（清单 + 体积）

配置（`electron-builder.yml`）：`mac.target = dmg@arm64 + zip@arm64`，`artifactName: ${productName}-${version}-${arch}.${ext}`
⇒ 产物全部落在 `electron/release/`：

| 产物 | 体积 | 说明 |
|---|---|---|
| `AKDAgent-1.0.0-arm64.dmg` | 估 ~380–450 MB | **分发主件**：里面是 `.app` + 指向 `/Applications` 的软链，用户拖进去即可 |
| `AKDAgent-1.0.0-arm64.zip` | 估 ~380–450 MB | 同一份 `.app` 的 zip（免挂载分发 / 将来接自动更新用） |
| `mac-arm64/AKDAgent.app` | **~950 MB – 1.0 GB** | 真正要签名的 bundle；`--dir` 只出它（最快，~1 分钟） |
| `AKDAgent-1.0.0-arm64.zip.blockmap` | 小 | zip 类目标会生成（Windows 的 `.exe.blockmap` 0.4 MB 就是这个），dmg 没有 |
| `builder-debug.yml` | 小 | builder 每次都会写 |
| ~~`latest-mac.yml`~~ | — | **不会有**：我们没配 `publish`（自动更新还没接） |

`.app` 里面（关键路径，排障用）：

```
AKDAgent.app/Contents/
├─ MacOS/AKDAgent                      主可执行
├─ Frameworks/Electron Framework.framework    Electron 运行时（最大件之一，~190 MB）
├─ Resources/
│  ├─ app.asar                         我们的源码（src/**，~1.7 MB）
│  ├─ app.asar.unpacked/               STT 必须落盘的那部分：
│  │   ├─ src/stt-server.js, src/stt-model.js
│  │   ├─ node_modules/sherpa-onnx-node/          纯 JS 包装
│  │   └─ node_modules/sherpa-onnx-darwin-arm64/  原生件 + .dylib（~32.5 MB）
│  ├─ dsh/                             内嵌 DSH 运行时（224.6 MB，含 skills/）
│  ├─ node/node                        内嵌 node 二进制（112.2 MB，**要签名**）
│  ├─ server/                          MCP server 运行时（340.6 MB；其中 models/ 240.9 MB）
│  ├─ knowledge/{docs,tools}/          随包文档与缺陷表
│  ├─ assets/AKDAgentBridge.lua        Lua 桥（设置页里一键部署到 SV）
│  ├─ licenses/ + THIRD-PARTY-NOTICES.md
│  └─ app-update.yml                   只在配了 publish 时才有
└─ Info.plist / _CodeSignature/ …
```

体积口径（我们这边**实测**的部分）：dsh 224.6 + node(darwin) 112.2 + server-runtime(darwin) 340.6 +
sherpa darwin-arm64 32.5（npm `unpackedSize`）= **≈ 710 MB**；其余是 Electron 的 mac 运行时（按 win32 包
109.7 MB 压缩 / ~210 MB 解开**估**）。所以：**app ≈ 950 MB–1 GB，dmg/zip ≈ 380–450 MB**
（对照 Windows：安装包 377.4 MB ← 解开 931 MB）。要瘦身优先动 `server/models`（240.9 MB，可改成按需下载）。
