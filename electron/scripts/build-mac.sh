#!/usr/bin/env bash
# ============================================================================
# AKDAgent macOS 打包（**必须在 macOS 上跑** —— electron-builder 不支持在 Windows 上出 dmg/zip）
# ============================================================================
# 用户 2026-09-24 裁定：darwin 运行时也一起长备好 + mac 带语音输入（darwin sherpa 包）。
#
# 用法：
#   ./build-mac.sh                # 默认 arm64（Apple Silicon）
#   ./build-mac.sh x64            # Intel（见下"Intel"一节）
#   ./build-mac.sh both           # 同 arm64（见"Intel"）
#   ./build-mac.sh arm64 --dir    # 只出 app 目录（不生成 dmg/zip，最快）
#   SKIP_SIGN=1 ./build-mac.sh    # 不签名（本机试包）；见下面"签名"一节
#
# ⚠️ Intel（x64）—— 2026-09-25 起**支持**（原先拦着，因为 `onnxruntime-node` 1.27 里 darwin 只有 arm64；
#    上游 microsoft/onnxruntime#27961：1.24 起不再发 darwin/x64）。现在的做法：
#    **给 darwin/x64 这一份单独钉 `onnxruntime-node@1.23.2`**（它的 npm 包自带 `bin/napi-v6/darwin/x64/`
#    的 dylib + binding），产物落在 `dist/server-runtime-darwin-x64`，本脚本直接用它。
#    ⇒ Intel 包**功能齐全**；只是那两个用 ONNX 的音频工具（人声分离 / 干声提取音符）跑在 1.23.2 上，
#      首次使用请在 Mac 上实测一次（其余功能与 arm64 版无差别）。
#
# 前置（脚本会逐条检查，缺了会明确报出来）：
#   ① Node ≥ 20（建议与内嵌运行时同大版本：见 tools/stage-node-runtime.cjs 的 DEFAULT_VERSION）
#   ② `electron/node_modules` 已装（npm ci）—— darwin 的 sherpa 靠 optionalDependencies 自动匹配
#   ③ `dsh-runtime/dsh/`（内嵌 DSH 运行时树，纯 JS、平台无关）—— 见 BUILD-MAC.md「怎么把 dsh 树弄到 Mac 上」
#   ④ 网络（要下 darwin 的 node 二进制；约 50 MB）
set -euo pipefail

ARCH_IN="${1:-arm64}"
EXTRA="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"        # electron/scripts
ELECTRON_DIR="$(cd "$HERE/.." && pwd)"       # electron/
REPO_DIR="$(cd "$ELECTRON_DIR/.." && pwd)"   # repo root

say() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "这个脚本只能在 macOS 上跑（当前 $(uname -s)）"

case "$ARCH_IN" in
  arm64)     ARCHS=(arm64) ;;
  both)      ARCHS=(arm64) ;;
  x64)
    # 2026-09-25：Intel 已支持（onnxruntime 在 darwin/x64 上钉 1.23.2）—— 不再需要环境开关
    if [[ ! -f "$REPO_DIR/dist/server-runtime-darwin-x64/STAGING.json" ]]; then
      die "出 Intel 包需要预装产物 dist/server-runtime-darwin-x64（它里面的 onnxruntime 是单独钉的 1.23.2）⇒ 见 BUILD-MAC.md §3.1.2"
    fi
    say "⚠️ Intel(x64) 包：server 侧 onnxruntime = 1.23.2（官方 1.24 起没 darwin/x64）；功能齐全，ONNX 两个音频工具首次使用请实测"
    ARCHS=(x64) ;;
  *)         die "架构只能是 arm64 / x64 / both（收到：${ARCH_IN}）" ;;
esac

say "== 0. 前置检查 =="
command -v node >/dev/null || die "没找到 node"
NODE_V="$(node -v)"
say "   node $NODE_V"
node -e 'const [maj]=process.versions.node.split(".").map(Number); process.exit(maj>=20?0:1)' || die "node 版本太低（要 ≥ 20）"
[[ -d "$ELECTRON_DIR/node_modules" ]] || die "electron/node_modules 不存在 ⇒ 先 cd electron && npm ci"
for a in "${ARCHS[@]}"; do
  [[ -d "$ELECTRON_DIR/node_modules/sherpa-onnx-darwin-$a" ]] || die "缺少 darwin STT 包 sherpa-onnx-darwin-$a ⇒ 在 mac 上重跑 npm ci（optionalDependencies 按平台自动装）"
done
say "   ✓ darwin STT 包已就位：${ARCHS[*]}"
[[ -f "$REPO_DIR/dsh-runtime/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js" ]] \
  || die "缺 dsh-runtime/dsh（内嵌 DSH 运行时树）⇒ 见 electron/scripts/BUILD-MAC.md 的「把 dsh 树弄到 Mac 上」"
# server 运行时：要么能现场重建（server/dist + server/node_modules），要么有预装产物 —— 二者有其一即可
if [[ -f "$REPO_DIR/server/dist/index.js" ]]; then
  say "   ✓ dsh 树与 server/dist 都在"
else
  ok=0
  for a in "${ARCHS[@]}"; do [[ -f "$REPO_DIR/dist/server-runtime-darwin-$a/STAGING.json" ]] && ok=1; done
  [[ $ok == 1 ]] || die "既没有 server/dist/index.js，也没有预装产物 dist/server-runtime-darwin-<arch> ⇒ 见 BUILD-MAC.md"
  say "   ✓ dsh 树在 + 有预装的 darwin server 运行时（跳过重建）"
fi

# ⚠️ 内嵌 DSH 树里的**平台专属可选依赖**：这棵树通常是在 Windows 上组装的（build-runtime.ps1 拷本机 prefix），
#    里面 @img/sharp / @vscode/ripgrep / @koromix/koffi 只带了 win32 那份 ⇒ mac 上「图片处理 / 文件搜索 /
#    原生对话框」等会缺件。修法是在 dsh-runtime/dsh 里跑一次 npm ci（lock 里各平台条目齐全）。
#    这里**只警告不拦**：主体功能与出包不受影响，用户会把终端输出发回来。
MISSING_PKGS=""
for PKG in "@img/sharp-darwin-${ARCHS[0]}" "@vscode/ripgrep-darwin-${ARCHS[0]}" "@koromix/koffi-darwin-${ARCHS[0]}"; do
  [[ -d "$REPO_DIR/dsh-runtime/dsh/node_modules/$PKG" ]] || MISSING_PKGS="$MISSING_PKGS $PKG"
done
if [[ -n "$MISSING_PKGS" ]]; then
  say "   ⚠️ dsh 树缺 darwin 平台包：$MISSING_PKGS"
  say "      ⇒ 修： cd dsh-runtime/dsh && npm ci && cd ../.."
  say "      （不修也能出包、能开，但 DSH 的图片/搜索/原生对话框会缺 darwin 二进制）"
fi

for ARCH in "${ARCHS[@]}"; do
  say ""
  say "== 1. server-runtime（darwin/${ARCH}）=="
  # 产物固定落 dist/server-runtime（electron-builder 的 extraResources 只认它）；台账 STAGING.json 会写平台
  # 🆕 2026-09-25（借来的 Mac 最短路径）：如果没有 server/node_modules（说明这台机器没装 server 依赖），
  #    但仓库里带着**预装好的** dist/server-runtime-darwin-<arch>，就直接用它 —— 省掉 npm ci + 240 MB 模型拷贝。
  PREBUILT="$REPO_DIR/dist/server-runtime-darwin-$ARCH"
  if [[ -f "$PREBUILT/STAGING.json" && ! -d "$REPO_DIR/server/node_modules" ]]; then
    say "   用预装产物：$(basename "$PREBUILT")（server/node_modules 不在 ⇒ 不重建）"
    rm -rf "$REPO_DIR/dist/server-runtime"
    cp -R "$PREBUILT" "$REPO_DIR/dist/server-runtime"
    grep -o '"platform": *"[^"]*"' "$REPO_DIR/dist/server-runtime/STAGING.json" | head -1
  else
    node "$REPO_DIR/tools/build-server-runtime.cjs" --platform darwin --arch "$ARCH"
  fi

  say ""
  say "== 2. 内嵌 node（darwin/${ARCH}）=="
  node "$REPO_DIR/tools/stage-node-runtime.cjs" --platform darwin --arch "$ARCH" --activate

  say ""
  say "== 3. 打包（${ARCH}）=="
  cd "$ELECTRON_DIR"
  # 不签名试包：CSC_IDENTITY_AUTO_DISCOVERY=false（有证书时不要设它）
  # 依据：app-builder-lib/out/macPackager.js:209 找不着证书时只 warn 后 return false（不会失败）；
  #       而 @electron/osx-sign/sign.js:176 只会用查到的 identity 签名，**没有 ad-hoc 分支**
  #       ⇒ builder 不会替我们打 ad-hoc，下面第 4 步自己补。
  if [[ "${SKIP_SIGN:-0}" == "1" ]]; then
    say "   SKIP_SIGN=1 ⇒ 这次不做代码签名（下面会补 ad-hoc，产物只能本机试跑）"
    export CSC_IDENTITY_AUTO_DISCOVERY=false
  fi
  # shellcheck disable=SC2086
  npx electron-builder --mac "--$ARCH" $EXTRA
  say "   ✓ 产物在 electron/release/"

  say ""
  say "== 4. 本机可跑性（ad-hoc 签名）=="
  # Apple Silicon 上未签名的 app 常打不开（bundle 里资源被改过 ⇒ 签名失效）；
  # ad-hoc 签名不需要任何证书，是"自己跑起来"的正路。有正式证书时跳过这一步。
  if [[ "${SKIP_SIGN:-0}" == "1" ]]; then
    shopt -s nullglob
    for APP in "$ELECTRON_DIR"/release/mac*/AKDAgent.app; do
      [[ -d "$APP" ]] || continue
      say "   ad-hoc 签名：$(basename "$(dirname "$APP")")/AKDAgent.app"
      codesign --force --deep --sign - "$APP" || say "   ! codesign 失败（见 BUILD-MAC.md §7）"
      xattr -cr "$APP" 2>/dev/null || true
      if codesign --verify --deep --strict "$APP" 2>/dev/null; then say "   ✓ 签名校验通过（ad-hoc）"; else say "   ! 校验没过 —— 仍可能被 Gatekeeper 拦"; fi
    done
    shopt -u nullglob
  fi
done

say ""
say "== 完成 =="
ls -1 "$ELECTRON_DIR/release" | grep -E '\.(dmg|zip)$' || true
say ""
say "自检建议（照着 BUILD-MAC.md 的验收清单）："
say "  · 打开 app：悬浮球出现、设置页语言切换正常"
say "  · 语音输入：设置页启用后说话有转写（这条最可能因签名/授权出问题 —— 见 entitlements.mac.plist 注释）"
say "  · 桥：在 SV 里跑 Agent/AKDAgentBridge.lua，面板顶部显示「桥：在跑」"
