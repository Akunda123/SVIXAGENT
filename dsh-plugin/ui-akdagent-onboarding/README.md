# @akdagent/ui-akdagent-onboarding

AKDAgent 首次引导 client 插件（browser 半）。注册一个 `settings.onboarding` 步骤：
首次打开时弹欢迎框，引导用户去 DSH 的 **Models 设置页**配置 API Key（复用现成的凭据 UI，
不碰核心源码——纯 slot 注入）。

## 结构

```
ui-akdagent-onboarding/
├── package.json            # dsh.client 元数据（platform: web）
├── tsconfig.json           # tsc -> lib/types
├── tsdown.config.ts        # node 半 + browser 半（__ModuleLoader__.load 手递）
└── src/client/
    ├── index.ts            # apply()：注入 'settings.onboarding' 步骤
    ├── AkdagentOnboarding.tsx  # 欢迎模态框（complete / openSection('models')）
    └── locales.ts          # zh / en 文案
```

## 构建

```powershell
# 需要 DSH 仓库的构建工具链（tsdown/lightningcss/@deepseek-ai 平台包）。
# 简单起见：把本目录放进 DSH 仓库 packages/client/ 下构建，或复制到 profile 的
# 依赖树中让 workspace 解析。构建产出：
#   lib/index.js        （node 半，主机 Loader 用）
#   lib/client.js       （browser 半，/plugins/<id>/client.js 服务）
#   lib/types/**        （类型）
pnpm install
pnpm run build
```

## 接入（cordis）

在 web profile 的 `cordis.patch.yml`（或运行时内置 patch）加一行 client 行
（与 web-app bundle 里 `ui-*` 行同形态）：

```yaml
- insert:
    - id: ui-akdagent-onboarding
      name: '@akdagent/ui-akdagent-onboarding'
```

- `dsh.client.inject` 已声明依赖的宿主包
- 步骤 `order: -50` 排在官方 DeepSeek 引导（0）之前
- 「配置 API Key」按钮 → `openSection('models')` 直接打开 Models 设置页

## 下一步（可选项）

- 检测 `.credentials.yaml` 是否有 `DEEPSEEK_API_KEY`：host 半加一个只读检查，
  无 key 时才挂载步骤（有 key 直接 `complete()`）
- 注册 `settings.section` 的 AKDAgent 专属设置页（悬浮球位置记忆、桥超时等）
- 首次启动时悬浮球主进程主动打开设置面板定位到该步骤
