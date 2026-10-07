# probe-auth —— 订阅制（OAuth 登录）模型接入的**运行时探针**

> ⚠️ **三份实测日志（`sim-transcript.log` / `e2e-transcript.log` / `e2e-multi-transcript.log`）只在本机** ——
> `.gitignore` 的 `*.log` 把它们挡在库外（本仓政策：日志不随库分发）。要复现就按下面的步骤自己跑一遍。

这套东西回答的是「**AKDAgent 能不能用订阅制模型**（ChatGPT Plus/Pro、Claude Pro/Max、GitHub Copilot、Kimi 编程套餐、xAI…）」。
静态分析不够用（第一版静态探针就被骗过一次），所以这里的结论**全部来自真启动一次宿主**。

- `akd-auth-probe.js` —— 只读探针插件（打印服务在不在、注册了哪些流、并能自注册一条流验证契约）
- `probe.patch.yml` —— 覆盖层：把 `@deepseek-ai/dsh-authorization` **挂进装配树** + 挂探针插件

## 怎么复现（**不碰现役 profile / 不动用户账号**）

```powershell
# ① 用临时 DSH_HOME（绝不指向 ~/.dsh-akdagent）
$env:DSH_HOME = "$env:TEMP\dsh-probe-home"

# ② 先跑一次让脚手架生成
cd dsh-runtime\dsh
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile web --dump-config | Out-Null

# ③ 把探针包放进 **profile 的 node_modules**（⛔ loader 从 profile 目录解析；
#    放进 dsh-runtime 的 node_modules 会 ERR_MODULE_NOT_FOUND —— 实测踩过）
$dst = "$env:DSH_HOME\profiles\web\node_modules\akd-auth-probe"
New-Item -ItemType Directory -Path $dst -Force | Out-Null
Copy-Item tools\probe-auth\akd-auth-probe.js "$dst\index.js" -Force
'{ "name":"akd-auth-probe","version":"0.0.1","private":true,"type":"module","main":"index.js" }' |
  Out-File "$dst\package.json" -Encoding utf8

# ④ 带覆盖层启动（换端口，别撞正在跑的实例）
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile web `
  --patch ..\..\tools\probe-auth\probe.patch.yml --port 3999
```

看 `[akd-auth-probe]` 开头的行；看完 `Ctrl+C`，删掉临时 home 即可。

## 已证实的结论（2026-10-06，发行运行时 `dsh-runtime/dsh`）

1. **`ctx.authorization` 的缺法是"没挂"，不是"没有"**：`@deepseek-ai/dsh-authorization` 作为
   `dsh-llm-pi-ai` 的 **peerDependency 被自动装进了 node_modules**，但**没有任何装配清单列出它** ——
   `--dump-config` 出来的树里只有 `credentials` + `llm-pi-ai`。而 pi-ai 是用
   `ctx.inject(['authorization'], …)` **带守卫**注册登录流的 ⇒ 服务不在就**静默不注册**。
   ⇒ 覆盖层里加一行 `- id: authorization / name: '@deepseek-ai/dsh-authorization'` 即可。
2. **挂上之后**（web profile 实测）：`ctx.authorization` 存在；**+1.5 秒后 `list()` = 39 条流**
   （`llm-pi-ai/anthropic`、`llm-pi-ai/openai-codex`、`llm-pi-ai/github-copilot` …），
   含 7 家订阅制：`anthropic`(Claude Pro/Max) · `openai-codex`(ChatGPT Plus/Pro) · `github-copilot` ·
   `kimi-coding` · `xai` · `openrouter` · `radius`(= radius.pi.dev，pi 自家服务)。
   ⚠️ **注册是异步的**：boot 那一瞬 `list()` 还是 0，1.5 s 后才有 39。UI 要"轮询/监听"而不是只读一次。
   ⚠️ headless profile 里同样是 0（且到 +4 s 仍 0）—— 那是该 profile 的差异，不影响真实 web profile。
3. **契约（零网络验证全通）**：探针**自己** `registerFlow()` 成功 → `list()` 能看到 →
   `begin({key,method,interaction})` 能被外部调用 → `notify` / `prompt` 都送达 →
   故意不落库时**正好报 `NOT_COMMITTED`**（"承诺必须落库"这条契约生效）→ `dispose()` 后回到 0 条。
   ⇒ **不依赖 dsh-llm-pi-ai 的内部注册，我们自己也能把流注册起来。**
4. pi-ai 的内置目录里，7 家的 `auth.oauth` 都在（`openai-codex` 的 label 就是
   `OpenAI (ChatGPT Plus/Pro)`），且 `ids()` 共 39 个 ⇒ API-key 型提供方也带"粘贴密钥"这种登录方法，
   **这条 seam 顺带能解决"openai-codex / github-copilot / kimi-coding 在 AKDAgent 里连卡片都没有"**。

## ✅ 模拟验证：**没有账号也能把真实登录流跑通**（`sim/`，2026-10-06 实跑）

用户「没有那些订阅账号也能验吗」—— 能。做法：**pi-ai 的登录流全部走 `fetch`**（实测 5 家都是），
所以替换 `globalThis.fetch`、只把 OAuth 端点换成本地假应答，就能让 **pi-ai 的真实代码**从 device code
一路跑到 `commit`；模拟器**不注册任何流**，验证的正是它自己注册的那些。
（`sim/index.js` + `sim.patch.yml`；完整实测日志见 `sim-transcript.log`。）

```powershell
$env:DSH_HOME = "$env:TEMP\akd-auth-sim"
cd dsh-runtime\dsh
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile web --dump-config *> $null   # 先铺脚手架
$dst = "$env:DSH_HOME\profiles\web\node_modules\akd-auth-sim"                        # ⚠️ 必须放 profile 的 node_modules
New-Item -ItemType Directory -Path $dst -Force | Out-Null
Copy-Item tools\probe-auth\sim\* $dst -Force
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile web --patch ..\..\tools\probe-auth\sim.patch.yml --port 3999 --no-open
```

**实测结论（GitHub Copilot，`method: 'oauth'`，**零账号**）**：`begin()` → **`{"status":"authorized"}`**（2094 ms），链路：

| 步 | 现象 |
|---|---|
| 1 | `prompt` = `{kind:'text', message:'GitHub Enterprise URL/domain (blank for github.com)'}`（答空串 ⇒ github.com） |
| 2 | `fetch` `https://github.com/login/device/code` → 拿到 device code |
| 3 | **`notify` = `{message:'Enter this code on the verification page to finish signing in.', url:'https://github.com/login/device', code:'SIMU-1234'}`** |
| 4 | 轮询 `access_token`：**第一次真的走 `authorization_pending` 分支**，第二次拿到 token |
| 5 | 换 `copilot_internal/v2/token` |
| 6 | **再拉一次 `/models`**（= pi-ai 会**验证**这份凭据真能用，不只是存下来） |
| 7 | commit ⇒ `begin()` 返回 `authorized`；`describeRecord(key)` = `{configured:true, kind:'grant', writable:true}` |

👉 **对第 2 步（UI）最有用的两条**：
- **界面要渲染的是** `notify({message, url, code})`（三件套：一句说明 + 一个网址 + 一个码）与
  `prompt({kind:'text'|'secret'|'select', message, options})`（`select` 才带 options）。
- 登录成功的判据 = `begin()` 返回 `authorized`（凭据已落库）；想查"配好没"看 `describeRecord().configured`。

**⚠️ 又踩两个坑（dev 插件必看）**：
- ⛔ **`ctx.authorization` 这种直读要求插件在 `inject` 里声明过该服务**，否则抛
  `cannot get property "authorization" without inject`（我第一版模拟器就这么把自己搞崩的，表现是"回调不触发"）。
  **诊断/探测一律用 `ctx.get('名字')`**（不需要声明），要响应式就用 `ctx.inject([...], cb)`。
- ⛔ **`sim` 的假应答要覆盖"验证凭据"那一步**（Copilot 是 `/models`）：不喂它，`begin()` 会以 `fetch failed` 结束 ——
  这不是流程坏了，而是流程**多验证了一步**。

## ✅ 文件通道 E2E：**客户端 → 宿主 → 厂商(假) → 凭据落库**（第 2 步的验收）

第 2 步（能在设置页点「登录」）走的是**文件通道**（与 SV 桥同款）：客户端写 `cmd.json`（begin/answer/cancel），
桥插件写 `attempt.json`（notices + 待回答的 prompt）。这套东西**不用点界面也能验**：让一个 Node 脚本扮演客户端。

```powershell
$env:DSH_HOME = "$env:TEMP\akd-auth-e2e2"
cd dsh-runtime\dsh
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile web --dump-config *> $null
# 两个包都要放进 profile 的 node_modules：产品桥 + 假网络
foreach ($p in @(@('akd-auth-bridge','..\..\electron\src\plugins\akd-auth-bridge'), @('akd-auth-sim','..\..\tools\probe-auth\sim'))) {
  $dst = "$env:DSH_HOME\profiles\web\node_modules\$($p[0])"; New-Item -ItemType Directory -Path $dst -Force | Out-Null
  Copy-Item "$($p[1])\*" $dst -Force
}
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile web --patch ..\..\tools\probe-auth\bridge-e2e.patch.yml --port 3999 --no-open
# 另开一个终端：
node tools\probe-auth\e2e-client.cjs "$env:DSH_HOME" llm-pi-ai/github-copilot oauth
```

**实测（2026-10-06，零账号）**：

```
== ① 等清单（注册是异步的） ==
  清单 39 条 · 目标 llm-pi-ai/github-copilot：✅ 在（方法 oauth/api-key）
== ② 下 begin 命令 ==   → cmd#1 begin
== ③ 轮询 attempt.json，直到结束 ==
  · state=running notices=0 awaiting=p1:text
    ❓ prompt(text) → "GitHub Enterprise URL/domain (blank for github.com)"   ↳ 回答 ""
  → cmd#2 answer {"promptId":"p1","value":""}
  · state=running notices=1 awaiting=无
    📣 notice → message="Enter this code on the verification page to finish signing in."
                 url="https://github.com/login/device"  code="SIMU-1234"
  · state=authorized notices=1 awaiting=无
== ④ 结果 ==
  state=authorized · 用时 2853 ms
  命令槽位（secret 应已被清空）：op=answer-consumed value=undefined
✅ 端到端通过：文件通道 → 宿主 → 厂商(假) → 凭据落库
```

⇒ 这一步同时证明了四件事：**①** 界面能拿到的就是 `{message,url,code}`；**②** `prompt` 会挂在 `attempt.awaiting`
等客户端回答；**③** 登录成功后 `attempt.state='authorized'`（凭据已落库）；**④** `secret` 型答案**消费后立刻从命令槽位清掉**。
插件侧日志见 `e2e-transcript.log`；界面那一屏的实截见 `electron/dev/shots/settings-auth-running.png`。

## ✅ **全六家**模拟通过：每一家都从界面那条路（文件通道）跑到凭据落库（2026-10-06）

用户问「**其他订阅模型的吗？都模拟通**」—— 现在六家**全部**端到端通过（`e2e-multi-transcript.log`，两轮：
一轮六家 + 一轮 `openai-codex@device_code`）：

| 提供方 | 登录形状 | 假网络要覆盖的端点 | 结果 |
|---|---|---|---|
| `github-copilot` | 设备码 | `login/device/code` · `login/oauth/access_token`（pending→token）· `copilot_internal/v2/token` · `…copilot.com/models` | ✅ 2791 ms |
| `xai` | 设备码（**form 编码**） | `auth.x.ai/oauth2/device/code` · `…/oauth2/token` | ✅ 2483 ms |
| `kimi-coding` | 设备码（JSON） | `auth.kimi.com/api/oauth/device_authorization` · `…/api/oauth/token` | ✅ 2170 ms |
| `anthropic` | PKCE + 本机回调 `:53692` | `platform.claude.com/v1/oauth/token`（走**粘贴授权码**支路） | ✅ 616 ms |
| `openrouter` | PKCE + 本机回调（随机端口） | `openrouter.ai/api/v1/auth/keys`（换回一个 API key） | ✅ 925 ms |
| `openai-codex` | **两条腿都有**：`select` 选 browser（PKCE，粘贴码）或 device_code | `auth.openai.com/oauth/token` · `/api/accounts/deviceauth/{usercode,token}` | ✅ 1235 ms / ✅ 1861 ms |

**独立证据（不看 `begin()` 的返回值，直接查盘上凭据库）** —— 跑完 `<DSH_HOME>/.credentials.yaml` 里躺着六条
`kind: grant`：`llm-pi-ai/{github-copilot,xai,kimi-coding,anthropic,openrouter,openai-codex}`。
其中 `openai-codex` 那条还带着 **`accountId: sim-chatgpt-account`** —— 证明 **JWT 那条路真的走通了**：

> ⚠️ `openai-codex` 的 `access_token` **必须是 JWT**：pi-ai 用 `atob(parts[1])` 解出 payload，再取
> `payload['https://api.openai.com/auth'].chatgpt_account_id`；取不到就报 `Failed to extract accountId from token`。
> 而且 `atob` 是 WHATWG forgiving-base64（**不收 `-`/`_`**）⇒ 假 JWT 要用**标准 base64**，不能用 base64url。

### 这一轮抓到的四件事（三条已修、一条是纪律）

1. **xAI 的 pending 必须给非 200**（按 OAuth 设备码规范用 **400**）：它的轮询写的是
   `if (response.ok) → 当成功`，给 `200 {error:'authorization_pending'}` 会被当成功，然后报
   `Invalid xAI OAuth response field: access_token`。**别家的约定不一样**（Kimi/GitHub 读 body 的 error，200 也行）
   ⇒ 假应答得**按家看代码**，不能套一个模板。
2. **粘贴支路的答题顺序**（模拟器与 E2E 客户端都踩了）：`manual_code` 的提示是
   "…or paste the authorization code / **redirect URL** here:" —— 里面也有 "URL"。若把"企业域名/可选 ⇒ 空串"
   那条规则排在前面，粘贴支路会被答成空串 ⇒ `Missing authorization code`。**先判 paste，再判 blank/enterprise**。
3. **产品缺口①：桥把 `placeholder` 丢了**（已修）。宿主 `restate()` 特意保留它，三家 PKCE 流的它就是**本机
   回调地址**（`http://localhost:53692/callback`、`http://127.0.0.1:50062/oauth/callback/<uuid>`）—— 界面靠它
   告诉用户该粘什么。现在 `attempt.json` 的 `awaiting.placeholder` 有值、输入框用它当占位符（实跑日志可证）。
4. **产品缺口②：桥挂载时会"重放"盘上的旧命令**（已修）。实测重启宿主时，上一次留下的 `begin` 又被跑了一遍
   —— 等于**开机自动发起一次登录**；更糟的是旧的 `answer`（prompt id 每轮都从 `p1` 重来，一条陈旧 secret
   可能被当成本轮 p1 的答案消费掉）。现在**认领但不重放**（挂载时把盘上的 id 记为已处理，只认更新的命令），
   并打一行日志。

### 怎么自己重跑（一轮跑完六家）

```powershell
# 宿主按上面「文件通道 E2E」那三步起好，然后：
node tools\probe-auth\e2e-client.cjs "$env:TEMP\akd-auth-e2e-all"                    # 默认：六家全跑
node tools\probe-auth\e2e-client.cjs "$env:TEMP\akd-auth-e2e-all" "llm-pi-ai/openai-codex@device_code"
#   ↑ `key@<select 选项>` 指定 select 型提问的答案（codex 的两条腿就靠它分别验）
```

### 失败路径也是验过的（`e2e-fail.cjs`，2026-10-07 加）

用户问「**如果我输错了结果呢**」—— 这个脚本把四种输错情形跑一遍，并把 `attempt.json` **翻成界面会显示的那句话**
（直接读 `electron/src/i18n/settings.json` 的模板，不是照代码猜）：

```powershell
node tools\probe-auth\e2e-fail.cjs "$env:TEMP\akd-auth-fail" llm-pi-ai/anthropic
```

实测结论：① 空白提交 ⇒ `Missing authorization code`（本机判据，**不联网**）② state 不对 ⇒ `OAuth state mismatch`
（本机判据）③ 码不对 ⇒ **厂商拒绝原文**（pi-ai 会连调用栈一起抛 ≈1.5 KB ⇒ 界面只显示第一行、完整原文进 `title`）
④ 设备码在网页上填错 ⇒ 厂商让你重填，我们继续等（到期/被拒才回我们）。**失败或取消都不落凭据**，
连错两次后再粘正常码**照样成功**（脚本里第 ④ 步就是这条控制组）。

> ⚠️ **假网络的诚实边界**：默认对 token 端点一律 200 ⇒ "码写错"在模拟里**永远成功**（第一次跑出来是
> `authorized`，很误导）。所以约定：**请求体里带 `@@@` ⇒ 假厂商按真厂商一样拒**（400 `invalid_grant`）。
> 正常用例不含 `@@@`，互不影响。

客户端的新增判据（都吃过亏才加的，别删）：**按 `attempt.id == 本次 begin 的 id` 对齐**（否则会读到上一次的终态
而误判成功）· 起跑前**等在跑的尝试收尾** · 8 秒没见到本次 attempt 就**重下 begin**（桥上"已有尝试在跑就忽略
新 begin"）· 每次运行**追加**进 `e2e-multi-transcript.log`（不覆盖，两轮证据都在）。

**仍未模拟的**：`radius`（= `radius.pi.dev`，pi 自家服务） —— 它**不在** pi-ai 的 `ids()` 里，所以宿主**根本没注册
这条流**（清单里没有，不是模拟器没覆盖）；每家的 **`api-key` 方法**（粘贴长期令牌）也没驱动过 —— 那是"填密钥"
那条老路，不是订阅登录。

## ⚠️ 今天踩过的两个坑（别重踩）

- **loader 从 profile 目录解析插件名**：探针包放 `dsh-runtime/dsh/node_modules/` 会
  `ERR_MODULE_NOT_FOUND`；要放到 `$DSH_HOME/profiles/<profile>/node_modules/`（或 `profiles/node_modules/`）。
- **`registerFlow()` 必须在注入回调里同步调**：在 `setTimeout` 里调报
  `INACTIVE_EFFECT — cannot create effect on inactive context`（我第一版就这么错的）。
