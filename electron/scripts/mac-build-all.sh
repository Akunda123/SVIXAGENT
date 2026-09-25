#!/usr/bin/env bash
# ============================================================================
# AKDAgent —— **借来的 Mac 上的一条命令**（2026-09-25 立）
# ============================================================================
# 目标：把 Mac 侧的人工操作压到最少 ——
#     ① 解开整包（ditto 或双击）
#     ② `bash mac-build.sh`（就是本脚本）
#   其余全在这里面：拿到 node+npm（**不装任何东西、不需要管理员**）、两次 npm ci、
#   调 build-mac.sh 出包、自检、写日志、告诉你把哪两样带回来。
#
# 为什么需要 npm：两处 `npm ci` 是必须的 ——
#   · electron/        装 **darwin** 那份 sherpa（STT 原生件）
#   · dsh-runtime/dsh/ 这棵树是在 Windows 上组的，可选依赖只带了 win32 那份
#                      （@vscode/ripgrep · @img/sharp · @koromix/koffi）⇒ 必须按平台换成 darwin
#   node 本身在包里（dsh-runtime/node-runtimes/darwin-<arch>/node），但**只有 node 没有 npm**
#   ⇒ 本脚本优先用包里那份官方 darwin tar.gz 解开（含 node+npm+npx+corepack）；
#      包里没有就联网下（官方 → 失败换 npmmirror 镜像）。
#
# 用法（在解压出来的目录里）：
#   bash mac-build.sh                # **按本机架构**（Apple Silicon ⇒ arm64；Intel ⇒ x64），出 dmg + zip
#   bash mac-build.sh --dir          # 只出 .app（最快，用来先确认能跑）
#   SKIP_SIGN=0 bash mac-build.sh    # 有 Apple 证书时（默认 SKIP_SIGN=1 = 不签名 + 补 ad-hoc）
# 产物：electron/release/mac-<arch>/AKDAgent.app · AKDAgent-<版本>-<arch>.dmg / .zip
# 日志：mac-build.log（**出问题就把这个文件带回来**）
#
# Intel（x64）说明：官方 `onnxruntime-node` 自 1.24 起没有 darwin/x64 二进制 ⇒ 本脚本在 x64 上
#   走的是**已单独钉成 1.23.2** 的那份 server 运行时（打包时放进 dist/server-runtime-darwin-x64）。
# ============================================================================
set -uo pipefail

# ── locale 兜底（2026-09-25 真机踩到）──────────────────────────────────────────
# macOS 自带 **bash 3.2** 在**非 UTF-8 locale** 下会把 `$VAR` **后面紧跟的中文**当成变量名的一部分
# ⇒ 报 `label?: unbound variable` 并把脚本打断（截图原话）。两手一起上：
#   ① 脚本里这类写法一律用 `${VAR}`（花括号会把变量名明确截断）—— 已全量改过；
#   ② 这里再把 locale 兜成 UTF-8（macOS 一定有 en_US.UTF-8），新写的插值也不会再踩。
case "${LC_ALL:-${LANG:-}}" in
  *UTF-8*|*utf8*|*UTF8*) : ;;
  *) export LC_ALL=en_US.UTF-8 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
# 本脚本在整包根目录（打包时复制过去的）；也允许在 electron/scripts/ 里直接跑
if [[ -d "$HERE/electron" ]]; then ROOT="$HERE"
elif [[ -d "$HERE/../../electron" ]]; then ROOT="$(cd "$HERE/../.." && pwd)"
else echo "✗ 找不到 electron/ —— 请在**整包解压出来的根目录**里跑：bash mac-build.sh" >&2; exit 2; fi
cd "$ROOT"

# ── 清掉 macOS 的隔离标记（2026-09-25 真机踩到）────────────────────────────
# 现象：弹「无法打开"node"，因为 Apple 无法检查其是否包含恶意软件」。
# 原因：整包若是从 QQ / 微信 / 浏览器 下来的，那个 zip 带 `com.apple.quarantine`，而 `ditto`
#   会把该标记**传播给解出来的每一个文件** —— 包括包里的 `node-v*-darwin-*.tar.gz`
#   ⇒ 脚本解出来的 `node` 也带标记 ⇒ macOS 拒绝执行它（于是 1/5 就卡住）。
# 处理：进目录先**递归清一遍**（顺便覆盖"用双击解压"的情况）；解出 node 后再清一次（见下）。
xattr -dr com.apple.quarantine "$ROOT" >/dev/null 2>&1 || true

LOG="$ROOT/mac-build.log"
# 全程 tee 进日志（bash 3.2 也支持进程替换）
exec > >(tee "$LOG") 2>&1

say() { printf '%s\n' "$*"; }
step() { say ""; say "──────────────────────────────────────────────"; say "$*"; say "──────────────────────────────────────────────"; }
die() { say ""; say "⛔ $*"; say ""; say "把 $LOG 带回来（整段），我按日志定位。"; sleep 0.3; exit 1; }

say "AKDAgent mac 出包（一条命令版）· $(date '+%Y-%m-%d %H:%M:%S')"
say "目录：$ROOT"
say "macOS：$(sw_vers -productVersion 2>/dev/null || echo '?') · 架构：$(uname -m)"

# ── 0. 平台自检 ────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Darwin" ]] || die "这不是 macOS（$(uname -s)）—— 本脚本只在 Mac 上跑"
MACH="$(uname -m)"
case "$MACH" in
  arm64)  BUILD_ARCH=arm64 ;;
  x86_64) BUILD_ARCH=x64 ;;
  *) die "认不出的架构：$MACH" ;;
esac
if [[ "$BUILD_ARCH" == "x64" ]]; then
  say ""
  say "⚠️ 这是 **Intel** Mac ⇒ 出 **x64（Intel）包**。功能齐全，但有一条来历要说清："
  say "   ⚠ onnxruntime-node 自 1.24 起**不再发布 darwin/x64 二进制**（上游 #27961）⇒ 本包的 x64"
  say "   运行时里那份 onnxruntime 是**单独钉在 1.23.2**（它的 npm 包自带 darwin/x64）。"
  say "   影响面：只有用 ONNX 的两个音频工具（人声分离 / 干声提取音符）；其余功能与 arm64 版一致。"
fi
[[ -d "$ROOT/electron" && -d "$ROOT/dsh-runtime" && -d "$ROOT/dist" ]] || die "整包不完整（缺 electron/ dsh-runtime/ dist/）—— 重新解压整包"

# ── 1. 拿到 node + npm（不装任何东西）────────────────────────────────────────
step "1/5　准备 node + npm（用包里的，不需要安装/管理员）"
NODE_DIR="$ROOT/tools/node-darwin"
NODE_VER="v24.13.0"
MIRROR="https://npmmirror.com/mirrors/node"
OFFICIAL="https://nodejs.org/dist"

if [[ -x "$NODE_DIR/bin/node" && -x "$NODE_DIR/bin/npm" ]]; then
  say "✓ 复用已解开的：tools/node-darwin/bin"
else
  TGZ="$(ls "$ROOT"/node-"$NODE_VER"-darwin-"$BUILD_ARCH".tar.gz "$ROOT"/node-v*-darwin-"$BUILD_ARCH".tar.gz 2>/dev/null | head -1 || true)"
  if [[ -n "${TGZ:-}" && -f "$TGZ" ]]; then
    say "包里带了 $(basename "$TGZ") ⇒ 解开到 tools/node-darwin"
    mkdir -p "$NODE_DIR"
    tar -xzf "$TGZ" -C "$NODE_DIR" --strip-components=1 || die "解压 $TGZ 失败"
    # 解出来的 node 可能仍带隔离标记（见文件开头那段）⇒ 清掉，否则下面 `node -v` 会被 Gatekeeper 拦
    xattr -dr com.apple.quarantine "$NODE_DIR" >/dev/null 2>&1 || true
  else
    say "包里没有 node tar.gz ⇒ 联网下载（官方失败会自动换镜像）"
    mkdir -p "$NODE_DIR" /tmp/akdagent-node
    ok=0
    for base in "$OFFICIAL" "$MIRROR"; do
      url="$base/$NODE_VER/node-$NODE_VER-darwin-$BUILD_ARCH.tar.gz"
      say "  试 $url"
      if curl -fL --connect-timeout 20 --max-time 600 -o /tmp/akdagent-node/node.tgz "$url"; then
        tar -xzf /tmp/akdagent-node/node.tgz -C "$NODE_DIR" --strip-components=1 && ok=1 && break
      fi
    done
    [[ $ok == 1 ]] || die "node 下载失败（官方与镜像都不行）—— 检查网络；或手动下 node-$NODE_VER-darwin-$BUILD_ARCH.tar.gz 放进整包根目录再跑一次"
  fi
fi
# 两条分支都清一遍（幂等）：解出来的 node 若带隔离标记，`node -v` 会被 Gatekeeper 拦（弹"无法打开 node"）
xattr -dr com.apple.quarantine "$NODE_DIR" >/dev/null 2>&1 || true
export PATH="$NODE_DIR/bin:$PATH"
say "✓ node $(node -v) · npm $(npm -v)"

# 网络兜底：npm 装包默认走官方 registry，失败换 npmmirror；Electron 二进制的镜像单独给
MIRROR_REG="https://registry.npmmirror.com"
MIRROR_ELECTRON="https://npmmirror.com/mirrors/electron/"
npm_ci() {
  # ⚠️ **不要写成 `local dir="$1" label="$2"`**：macOS 自带的 **bash 3.2** 在 `set -u` 下对
  #    "一行多个 local 赋值"会报 `label: unbound variable` 并把脚本整个打断
  #    （2026-09-25 真机踩到：2/5 一进去就死）。⇒ 拆成"先声明、再逐个赋值"，并留默认值兜底。
  local dir label
  dir="$1"
  label="${2:-?}"
  [ -n "$dir" ] || { say "！npm_ci 少了目录参数"; return 1; }
  say ""
  say "▶ npm ci（${label}）"
  if ( cd "$dir" && npm ci --no-audit --no-fund ); then say "✓ $label 装好了"; return 0; fi
  say "！官方源失败 ⇒ 换国内镜像重试（registry + ELECTRON_MIRROR）"
  if ( cd "$dir" && ELECTRON_MIRROR="$MIRROR_ELECTRON" npm ci --no-audit --no-fund --registry="$MIRROR_REG" ); then
    say "✓ $label 装好了（镜像）"; return 0
  fi
  die "$label 的 npm ci 失败（官方与镜像都不行）"
}

# ── 2. electron 依赖（含 darwin 的 sherpa）──────────────────────────────────
step "2/5　装 Electron 侧依赖（约 3~6 分钟，唯一需要联网的一步）"
if [[ -d "$ROOT/electron/node_modules" ]]; then
  say "已存在 electron/node_modules ⇒ 跳过（要重装就删掉它）"
else
  npm_ci "$ROOT/electron" "electron/（Electron 运行时 + darwin sherpa）"
fi
SHERPA="$(ls -d "$ROOT"/electron/node_modules/sherpa-onnx-darwin-* 2>/dev/null | head -1 || true)"
[[ -n "${SHERPA:-}" ]] && say "✓ darwin STT 包：$(basename "$SHERPA")" || say "！没看到 sherpa-onnx-darwin-*（语音输入可能在包里不可用 —— 继续，日志里会体现）"

# ── 3. dsh 树的 darwin 平台包 ───────────────────────────────────────────────
step "3/5　把内嵌 DSH 树的平台依赖换成 darwin（约 2~4 分钟）"
if [[ -d "$ROOT/dsh-runtime/dsh/node_modules/@vscode/ripgrep-darwin-$BUILD_ARCH" ]]; then
  say "已存在 darwin 平台包 ⇒ 跳过"
else
  npm_ci "$ROOT/dsh-runtime/dsh" "dsh-runtime/dsh（ripgrep / sharp / koffi 的 darwin 版）"
fi

# ── 4. 出包 ────────────────────────────────────────────────────────────────
step "4/5　打包（electron-builder --mac --${BUILD_ARCH}）"
EXTRA="${1:-}"
export SKIP_SIGN="${SKIP_SIGN:-1}"        # 默认不签名（没证书）⇒ build-mac.sh 第 4 步会补 ad-hoc
say "SKIP_SIGN=$SKIP_SIGN  ARCH=$BUILD_ARCH  EXTRA=${EXTRA:-（无）}"
bash "$ROOT/electron/scripts/build-mac.sh" "$BUILD_ARCH" $EXTRA || die "build-mac.sh 失败（看上面最后 20 行）"

# ── 5. 自检 + 收尾 ─────────────────────────────────────────────────────────
step "5/5　自检（包里该有的东西在不在）"
APP="$ROOT/electron/release/mac-$BUILD_ARCH/AKDAgent.app"
FAIL=0
chk() { if eval "$2"; then say "  ✓ $1"; else say "  ✗ $1"; FAIL=$((FAIL+1)); fi; }
chk "app 存在" "[[ -d '$APP' ]]"
if [[ -d "$APP" ]]; then
  R="$APP/Contents/Resources"
  chk "内嵌 server（server/dist/index.js）" "[[ -f '$R/server/dist/index.js' ]]"
  chk "内嵌 DSH（dsh/…/lib/bin.js）"        "[[ -f '$R/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js' ]]"
  chk "内嵌 node 可执行（node/node）"        "[[ -x '$R/node/node' ]]"
  chk "Lua 桥（assets/AKDAgentBridge.lua）" "[[ -f '$R/assets/AKDAgentBridge.lua' ]]"
  chk "侧栏面板（assets/AKDAgentPanel.js）" "[[ -f '$R/assets/AKDAgentPanel.js' ]]"
  chk "随包知识（knowledge/docs）"          "[[ -d '$R/knowledge/docs' ]]"
  chk "darwin ONNX 动态库"                  "ls '$R/server/node_modules/onnxruntime-node/bin/napi-v6/darwin/$BUILD_ARCH/'*.dylib >/dev/null 2>&1"
  chk "ad-hoc 签名可校验"                   "codesign --verify --deep --strict '$APP' >/dev/null 2>&1"
  say "  app 体积：$(du -sh "$APP" | cut -f1)"
fi
say "  产物："
ls -lh "$ROOT/electron/release" 2>/dev/null | grep -E '\.(dmg|zip)$' | awk '{print "    " $9 "  " $5}' || say "    （没有 dmg/zip —— --dir 模式只有 .app）"

step "结果"
say "日志：$LOG"
if [[ $FAIL -eq 0 ]]; then
  say "✅ 全部通过。把这两样带回来："
  say "   ① ${LOG}（**出任何问题都靠它定位**）"
  say "   ② electron/release/AKDAgent-<版本>-$BUILD_ARCH.zip（我能在 Windows 上拆开验内容）"
else
  say "⚠️ 有 $FAIL 项自检没过（上面带 ✗ 的）—— 把 $LOG 带回来，我按日志定位"
fi
say ""
say "在 Mac 上还能顺手验的（可选）："
say "  open '$APP'    ⇒ 菜单栏出现 AKDAgent 图标、桌面上出现悬浮球；设置页能开、能切语言"
say "  设置 → 关于 里有「帮助」入口（悬浮球/托盘右键也有）"

# ⚠️ 收尾等一下：本脚本开头用 `exec > >(tee "$LOG")` 把输出同时写进日志，而 **bash 3.2 退出时
#    可能来不及把最后几行交给 tee** ⇒ 日志尾部被截断（那正是我们排障唯一依赖的文件）。
#    睡 0.3 秒让 tee 落盘，成本可忽略。
sleep 0.3
exit 0
