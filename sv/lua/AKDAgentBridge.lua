--[[
AKDAgent Bridge (Lua / 文件通道)  v0.1.0
================================================================================
为什么存在：官方 SV 脚本 API **没有任何文件能力**，而 JS 沙箱零宿主对象
（SV1 实测：require / ActiveXObject / WScript / XMLHttpRequest 全 undefined）
⇒ JS 侧只能借剪贴板那根独管，代价是占用用户剪贴板、载荷 ≲4000 字符、响应 25KB 起要截断。

**Lua 自带 io / os**（SV1 1.11.2 实测：io.open 写入 + 读回成功）
⇒ 文件系统本身就是通道，剪贴板可以完全不碰。

--------------------------------------------------------------------------
通道设计（关键约束：Lua 标准库**不能列目录**，也没有 socket / 命名管道）
--------------------------------------------------------------------------
只能「固定文件名 + seq 轮询」：

    %TEMP%\akdagent-req-<host>.json    客户端 → 桥   （客户端原子替换写入）
    %TEMP%\akdagent-res-<host>.json    桥 → 客户端   （写 .tmp 后改名，失败则先删再改）
    %TEMP%\akdagent-hb-<host>.json     桥心跳（存活 + 宿主信息 + ops 清单 + 实际目录）
    %TEMP%\akdagent-log-<host>.txt     桥日志（追加）
    %TEMP%\akdagent-boot-<host>.json   启动结果（成功/致命错误，供外部排障）

  host = sv | ix（按 SV.getHostInfo().hostName 判定；与剪贴板桥的
  SVCMD-SV: / SVCMD-IX: 前缀同构，避免多宿主互相抢答）

目录选择：① %USERPROFILE%\AKDAgent\ipc（**存在才用**，Lua 不能 mkdir）
          ② %TEMP%（兜底）。两侧用同一套顺序解析。

去重：请求带单调 seq；桥记 lastSeq，seq <= lastSeq 且命中缓存 → 只重发响应，不重复执行。

--------------------------------------------------------------------------
JS 绑定 vs Lua 绑定 —— 移植时必看的 5 条差异（全部实测于 SV1 1.11.2 / Lua 5.4）
--------------------------------------------------------------------------
| 维度 | JS 绑定 | Lua 绑定 | 后果 |
|---|---|---|---|
| 索引基准 | **0-based** | **1-based**（参数与返回值都是）| 直接把 JS 逻辑抄过来 → 越界报错。官方文档：`getIndexInParent` "In Lua starts from 1" |
| 调用形式 | 点调用 `SV.getProject()` | **冒号** `SV:getProject()`（C 侧签名 `(self, …)`）| 点调用报 "N argument(s) expected, got M" |
| 成员类型 | `function` | **`userdata`**（靠 `__call`）| `type(v)=="function"` 一律为假 → 误判"函数不存在" |
| 出错行为 | 抛异常，可被 pcall 捕获 | **穿透 pcall，直接弹脚本错误框** | 绝不能试错式探测；一个试探就弹框 |
| 定时器 | `SV.setTimeout(ms, cb)` | `SV:setTimeout(ms, cb)`（**存在**）| 可用，SV1 也能常驻 |

**两条铁律**（拿血的教训换的）：
1. 对外协议一律 **0-based**，换算只发生在桥内部（`idx()` / `INDEX_BASE`）。
2. **不做任何"试探一下看看行不行"的调用** —— 这个绑定的错误穿透 pcall，试探的代价是弹框打断用户。
   宁可某个能力先不做（返回"未验证"），也不试探。

--------------------------------------------------------------------------
协议（与剪贴板桥完全一致，客户端可无缝切换 transport）
--------------------------------------------------------------------------
  请求 { v:1, seq, id, op, args }
  响应 { v:1, id, seq, ok:true|false, ts, host, result | error }

索引基准：线协议**一律 0-based**（与现有 MCP 工具 / 文档一致）。
Lua 绑定是 **1-based**（官方文档 "In Lua, this index starts from 1"），故桥内统一按
`CFG.INDEX_BASE = 1` 换算，对外仍报 0-based。
⚠️ **不做"试 0 还是试 1"的探测** —— 该绑定的错误**穿透 pcall**，试探的代价是弹脚本错误框（已实测）。

版本无关：同时兼容 Lua 5.1（loadstring + setfenv）与 5.2+（load(..., env)），
不依赖整数除法、goto、table.unpack 等新特性。

用法：放进 SV scripts 目录 → 脚本菜单 → Agent → AKDAgent Bridge (Lua) → 运行。
      运行后常驻轮询文件通道；关闭脚本即停止（与 JS 桥同）。
]]

-- ============================================================================
-- 0. 最早痕迹：不依赖任何状态，越早写越好。
--    getClientInfo() 被调用时也写一行 —— 这能区分
--    「宿主根本没加载这个文件」与「加载了、但 main 没跑起来」。
-- ============================================================================
local _gcTraced = false

local TRACE_PATHS = {}
do
  if type(os) == "table" and type(os.getenv) == "function" then
    local t = os.getenv("TEMP") or os.getenv("TMP")
    if t then TRACE_PATHS[#TRACE_PATHS + 1] = t .. "\\akdagent-trace.txt" end
    local u = os.getenv("USERPROFILE")
    if u then TRACE_PATHS[#TRACE_PATHS + 1] = u .. "\\akdagent-trace.txt" end
  end
  TRACE_PATHS[#TRACE_PATHS + 1] = "akdagent-trace.txt"
end

local function trace(msg)
  if type(io) ~= "table" or type(io.open) ~= "function" then return end
  local stamp = "?"
  if type(os) == "table" and type(os.date) == "function" then stamp = os.date("%H:%M:%S") end
  local line = stamp .. "  " .. tostring(msg) .. "\n"
  for _, p in ipairs(TRACE_PATHS) do
    pcall(function()
      local f = io.open(p, "a")
      if f then f:write(line); f:close() end
    end)
  end
end

function getClientInfo()
  if not _gcTraced then
    _gcTraced = true
    trace("getClientInfo 被调用 —— 宿主已加载本文件")
  end
  return {
    name = "AKDAgent Bridge (Lua)",
    category = "Agent",
    author = "AKDAgent",
    versionNumber = 1,
    minEditorVersion = 65540
  }
end

-- ============================================================================
-- 0. 配置与状态
-- ============================================================================

local CFG = {
  -- ⚠️ 改桥后**必须升这个版本号**：Lua 脚本一旦在 SV 里跑起来就常驻，
  --    再点一次"运行"**不会**替换掉旧实例（实测 2026-09-12：旧实例 09:07 起一直活着，
  --    09:19 的"运行"没有产生新 boot）—— 于是"明明改了却没生效"。
  --    有了版本号，`ping`/心跳里就能一眼看出跑的是哪一版。
  VERSION        = "0.3.31",  -- 0.3.31 = 写音符**写哪里**按宿主分（用户 2026-09-25 定）：
                              --          `write_chords` / `create_harmony_group` 新增 `args.target`（auto/main/new）
                              --          与 `args.allowAppend`：**SV1 默认写主组**（主组就是用户音符容器、可写），
                              --          SV2/IX 默认且只能新建组；主组非空且未 allowAppend ⇒ 返回
                              --          `{ok=false,needConfirm=true,existingNoteCount,endQuarter,hint}`，**一个字节都不写**。
                              --          另：`get_current_group` 补 `isMain` + `hostIsSv2`（判据从"猜组名"变成"读宿主版本"）。
                              --          起因此前这条规则在技能里是无条件的（"写音符一律新建组"，理由写的是 SV2 限制）
                              --          ⇒ 真机上 SV1 的旋律被写进了新组而非主组。
                              -- 0.3.30 = 治 **tempo-mark-no-update**（真机记录的宿主行为）：
                              --          `TimeAxis.addTempoMark` **不会更新同位置已有的标**（文档说会更新，实测不更新）
                              --          ⇒ `apply_tempo` 每次 `addTempoMark` 前**先 `removeTempoMark(同位置)`**，
                              --          否则"改了 BPM 却没生效"。守卫 `tools/check-tempo-mark-replace.cjs` 盯住这条顺序。
                              --          另配套两条静态守卫：`check-no-crash-api.cjs`（禁调 crash 清单 / 不存在的 API）
                              --          与 `check-align-audio-args.cjs`（`measure` 必须真被用、音频时长不得由 BPM 折算）。
                              -- 0.3.29 = 统一 dyn 计划的**字段名**（2026-09-23 真机验收当场发现）：
                              --          0.3.28 的 `dryRun` 分支把 `ORN.dynPlan` 的**内部名 `onsetQ`** 漏给了调用方，
                              --          而写回路径给的是 `onsetQuarter`（别的 op 也都是后者）⇒ 调用方得按两个名字取。
                              --          现统一为 **`onsetQuarter`**；`autoWrite` 同步改读该字段。行为断言见 test-ops.lua。
                              -- 0.3.28 = 装饰音配**动态** + 自动化**只读采样**（2026-09-23）：
                              --          ① `apply_ornaments` 新增 **`dyn`**（可选）：按 `07 §2.5` 只给那三种装饰配动态
                              --             （前倚音/上尖 **挖坑** · 后倚音 **尾部渐弱** · 音尾行进 **每步递减**），
                              --             `dynDepth` / `dynStep` 可覆盖默认深度（**默认是我拟的**：发声 −0.25 / 响度 −2 dB / 每步 −1.5 dB）。
                              --          ② ⚠️ **真机发现（重要）**：**自动化写"一个点"会让该参数在整组变成那个值**
                              --             （实测 3.75 拍写 `voicing 0.3` ⇒ 3.75/4.0/6.0 三处 `get` 全回 0.3）
                              --             ⇒ dyn 的形状**一律闭合**（锚点 + 收尾都回基线），且**基线先读后写**。
                              --          ③ `set_automation` 新增 **`probe`**（位置数组）⇒ **只读采样**、不写、不建 undo。
                              --          ④ 删点用**区间重载** `remove(begin, end)`（实测可行）；单参 `remove(index)` 仍在 crash 清单上，不碰。
                              --          ⑤ 假宿主补上"没有点时 `get` 回**默认值**"（真机实测 voicing/vibratoEnv = 1、其余 = 0）。
                              -- 0.3.27 = 装饰音**修一处实机发现的设计瑕疵**（2026-09-23，0.3.26 的真机验收当场发现）：
                              --          `mordent`（波音）/ `turn`（回音）原先把**第一段（短头）**当 `main` 复用原音符，
                              --          于是**真正占时值的尾段变成新建音符（自动音高）** ⇒ 用户原来在该音上的
                              --          **手动音高模式 / 手画数据**全留在了那个 0.125 拍的短头上。
                              --          ⇒ 现行：**`main` 一律给最长段**（波音/回音 ⇒ 尾段；前倚音/上尖/后倚音/行进本来就是长段）。
                              --          ⚠️ **`role`（谁复用原音符）与 `lyric`（谁承接原歌词）互不绑定** ——
                              --          仍然是"**第一段承接原歌词、其余段 `-`**"。行为断言见 test-ops.lua。
                              -- 0.3.26 = **装饰音 + 参数自动化**（2026-09-23，用户口述「做成各种装饰音的集合」）：
                              --          ① 新写 op **`apply_ornaments`** = **拆音符**路线（SV1 真机已验证）：
                              --             `graceFront`（前倚音）· `graceBack`（后倚音）· `spikeUp`（向上尖尖）·
                              --             `mordent`（波音）· `turn`（回音）· `tailRun`（音尾音阶行进）六个**真切音符**；
                              --             `anticipate`（反向预备）· `slide`（滑音）两个走**音符属性**（仅 SV1）。
                              --             **歌词规则**：第一段承接原歌词、其余段 "-"；**新音符默认自动音高**
                              --             （`manual:true` 才 `setPitchAutoMode(false)`）；**默认 `dryRun`**（真写要显式 false）。
                              --             ⚠️ **SV2 同样拆音符、不画曲线**（用户裁定）；主音段的 `dF0Left` 在 SV2 上
                              --             走音符属性**不生效**，回包会如实标注。
                              --          ② 新写 op **`set_automation`** = `NoteGroup#getParameter` + `Automation#add`
                              --             + **`Automation#get` 单点回读**；取值域**硬编码 clamp**（不去问 `getDefinition`）。
                              --             ⛔ `getPoints`/`getAllPoints`/`getLinear`/`getDefinition`/`remove(index)`
                              --             在 crash 清单（IX-001）上，**一律不调**。
                              -- 0.3.25 = `write_pit` 新增 **P23 ②③「交界一致性自检」**（2026-09-22，用户裁「2+3」）：
                              --          ① **② 写前检测**：目标音的**邻音（±1）已有音高曲线、而本次没重写它**时，
                              --             在回包里给 `junction` / `junctionHint`（**只告知、不阻止**）；
                              --          ② **③ 写后自检**：每条写下的曲线在 `scriptData` 里存一枚**指纹**
                              --             （`PIT.FP_TAG` = 该音 ±2 的几何 + 各自生效参数，见 `PIT.geomKey`/`PIT.paramKey`），
                              --             下次写邻音时把"存着的指纹"与"现在算出来的"比对 ⇒ 不一致即判**旧快照**
                              --             （`items[].stale`；无指纹的旧版曲线记 `unknown`）。
                              --          **口径（用户 2026-09-22 裁定）**：**只进回包、不可见** —— 不上面板、不写"必须转述给用户"；
                              --          用户不必知道写的过程。用途 = 让调用方知道"交界处可能出现两条有间距的线"，
                              --          并据此**把相邻音符放进同一次调用**（同一个 `indices`）。
                              --          根因：curve 值 = `PIT.levelAt(...) − 本音音高 + PIT.bumpsAt(...)`，
                              --          `S_all` 是当时快照、`ctxAll` 用本次 params 现算 ⇒ 一致性**只在同一次调用内成立**。
                              -- 0.3.24 = 修 **`get_computed_attributes` 的 `index` 基准**（2026-09-22 真机发现）：
                              --          原实现 `index = i`（Lua 1 起）⇒ **与协议"对外一律 0 起"不一致**，
                              --          后果：按 0 起消费该载荷的调用方会**整体错位一位**（音素替换工具用它把
                              --          `phonemes[].language` 映射到音符下标 ⇒ 语种会错到下一个音符上）。
                              --          现在 `index = i - 1`；同批载荷里 `phonemeLanguages` 等字段不变。
                              -- 0.3.23 = **音素替换功能的后端支撑**（2026-09-22，配合 `sv_list_phonemes` / `sv_replace_phonemes`）：
                              --          ① 新只读 op **`get_phonemes`** = 包装 `SV:getPhonemesForGroup(ref)`，
                              --             给出**整组的实际发音音素串**（含 T2P 默认）——
                              --             `Note#getPhonemes()` 只给"手动写死过的"串（没手改过=空串），
                              --             而"替换音素"必须基于实际发音（参考脚本 `音素替换.js` 用的就是前者）。
                              --             宿主没有该 API 时如实回 `unsupported`，调用方可退回首动串。
                              --          ② `get_selected_notes` 载荷**新增非协议字段 `indexInParent`**（组内下标，0 起）：
                              --             协议里的 `index` 是"选中结果数组内序号"，不能当组内下标用
                              --             （音素替换的 indices / write_pit 的 indices 都是组内下标）。
                              --          ③ `selftest` 的能力表收录 `get_phonemes`（缺 `getPhonemesForGroup` 时标 missing）。
                              -- 0.3.22 = write_pit 默认口径改回原始设想（详见下）：
                              --          ① `plan` 省略时：**给了 indices ⇒ explicit**（按点名写）；
                              --             **没给 ⇒ accent**（只改重音检测命中的少数音符，其余保持 auto、零改动）。
                              --             要"整段 / 整个选区全写"必须**显式** `plan="explicit"`。
                              --          ② accent 的**评分域 = 目标范围**（indices → 选中 → 全组），不再无条件吃整个组 ——
                              --             否则"选中 4 小节画重音"会变成"整组画重音"（原实现把 targets 重置成全组）。
                              --          ③ 返回体新增 `plan` / `scope`；accent 报告新增 `accent.scope`
                              --             （`source` = indices|selection|whole-group · `scanned` · `groupNotes`）。
                              --          背景：2026-09-19 真机曾在 **462 音**的真轨上把整条当目标（选区读取误判另已修，见 0.3.20 附近的 selectedNoteObjects）；
                              --                用户的本意始终是"只有**算出来的重音**音符才该被改"。
                              --          回归：`python tools/lua-vm.py sv/lua/tests/test-ops.lua` ⇒ **476 通过 / 0 失败**（新增 9 条默认口径断言）。
                              -- 0.3.21 = **版本检测**（"危险 API" 防线只保留这一道）：
                              --          用户 2026-09-20 指示「清除所有禁调用的痕迹，保留一个版本检测，
                              --          如果检测到 1.0.0，先让用户更新」。
                              --          背景：IX 1.0.0 上读点类 API（getPoints/getAllPoints/getLinear/
                              --          getDefinition）会**弹模态框挡住 Lua 主线程** ⇒ 桥冻住；1.0.1 起改成抛错、
                              --          且返回的是**普通数组**（2026-09-20 真机实测，见 known-bugs `IX-001`）。
                              --          ⇒ 桥只**如实标记** `hostOutdated`/`hostWarning`（ping / 心跳 / boot / diag），
                              --          **不拦任何调用**；agent 见到就先让用户升级宿主再做读点类操作。
                              --          0.3.20 = 收窄上一条：`chordHint` 改成 **IX 专属**（`ST.host=="ix"` 且 `mode=="curve"` 且 `canCurve`）。
                              --          理由（用户 2026-09-20）：「**IX 对参数编辑的限制不要影响到 SV 里去**」——
                              --          SV1 走 attr 路线（逐音符属性、无共享骨架）⇒ 提示是**假警报**；
                              --          SV2 的骨架是**既定设计**（重叠区不冲突）⇒ 不该按缺陷口径提示；
                              --          只有 IX 叠加了宿主侧那个 bug（已登记 **IX-005**）。
                              --          0.3.19 = write_pit 对「目标里有同 onset 音符（和弦/齐奏）」**如实加警告**
                              --          （`chordStarts`/`chordNotes`/`chordHint`；**只告知不阻止**，dryRun 也带）。
                              --          起因：同和弦多音会被拉到我方的**单声部骨架**音高上（实测 yAtOnset = 0 与 −4）
                              --          ⇒ 柱式和弦可能被压成同度；且用户 2026-09-20 告知 **IX 侧音高曲线是暴力移植实现、
                              --          当前有 bug，具体情况与后续是否修未知** ⇒ 和弦音高线不能当"已验证"。
                              --          0.3.18 = ① get_layout 修「同 onset 被当成重叠」（柱式和弦必然误报）；新增 chordCount
                              --          ② 重叠策略按宿主：**IX 允许重叠**（用户 2026-09-20 明确），SV 仍判违规
                              --          ③ 写守卫文案按宿主出名字（IX 上不再报"SV2 主组"）
                              --          ④ write_pit 曲线按**音符**打标记（scriptData.akdagentNoteIndex）⇒
                              --             和弦里同 onset 的音不再互相误删（旧行为：后写的把先写的当旧版删掉，只剩 1 条）
                              --          0.3.17 = 新增只读 op get_layout（当前组布局报告：重叠/缝隙/短缝 + 策略）
  POLL_MS        = 300,      -- 请求轮询间隔
  HB_MS          = 5000,     -- 心跳间隔
  MAX_DONE       = 64,       -- 响应缓存条数（供重复请求重发）
  LOG_MAX_BYTES  = 262144,   -- 日志超过则重建
  -- 索引基准：Lua 绑定是 **1-based**。
  --   证据 1：官方文档 "In Lua, this index starts from 1. In JavaScript, this index starts from 0."
  --   证据 2：实测错误信息「getTrack: 访问超出范围（索引为 0，大小为 1）」。
  -- ⚠️ 绝不做"试 0 还是试 1"的探测 —— 见下面 SV_ERROR_TRAP 的说明。
  INDEX_BASE     = 1
}

-- 🆕 0.3.21 **宿主版本检测判据**（唯一保留的"危险 API"防线）。
--   独立成一个函数是为了**能离线单测**（测试只能拿到导出的 CFG/ST/OPS，见文件末尾的 __AKDAGENT_TEST__ 块）。
--   判据：**只有 IX < 1.0.1** 算过旧 —— 1.0.0 上读点类 API 会弹模态框挡住 Lua 主线程（桥冻住），
--   1.0.1（hostVersionNumber 65537）起改成抛错。SV 侧与本条无关；版本号拿不到（0）时**不误报**。
function CFG.hostIsOutdated(host, verNum)
  local v = tonumber(verNum) or 0
  return (host == "ix") and v > 0 and v < 65537
end

local ST = {
  host = "sv", hostName = "", hostVer = "", hostVerNum = 0, isSV2 = false,
  -- 🆕 0.3.21 版本检测：宿主过旧时为 true（目前只有 IX < 1.0.1 这一种），并附一句可读的提示。
  --   只作**如实标记**，不拦任何 op；详见 CFG.VERSION 0.3.21 的说明与 known-bugs `IX-001`。
  hostOutdated = false, hostWarning = nil,
  indexBase = 1, dir = "", lastSeq = -1,
  svStyle = "colon", svStyleDetail = nil,
  timer = nil, timerReport = nil, diag = {},
  done = {}, order = {},
  reqSeen = 0, opsRun = 0
}

local PATH = { req = "", res = "", hb = "", log = "", boot = "" }

-- 供 run_script 脚本使用的辅助接口（函数都定义完后在 §4.5 填充）
local SVH = {}

-- JSON null 的哨兵（Lua 的 nil 不能进数组）
local NULL = setmetatable({}, { __tostring = function() return "null" end })

-- 版本无关的 unpack（Lua 5.1 是 unpack，5.2+ 是 table.unpack）
local unpackFn = unpack or table.unpack

-- 前向声明：§4 的心跳要引用 ops 清单，而它的定义在 §5/§6
local OPS = {}

-- 面板中继（SidePanelSection ↔ 文件）—— 声明放在前面：sendHeartbeat 要读 PANEL.enabled
-- 详见 §6.5；面板脚本是 **JS**（SV 的 JS 沙箱没有文件能力），所以搬运工只能由本 Lua 桥担任。
local PANEL = {
  version = "0.1.0",
  enabled = false,          -- 宿主是否支持 project scriptData（SV1 无 ⇒ 自动禁用）
  lastOutSeq = 0,           -- 已转发出去的面板事件序号
  inOffset = 0,             -- 已读到的 panel-in jsonl 字节偏移
  helloLogged = false,      -- 是否已把「桥连接成功」写进面板信息框
  disabledLogged = false,
  maxBytes = 262144,        -- panel jsonl 上限（超过则重写为空，避免无限增长）
  logMax = 20000,           -- 面板信息框保留的最大字符数（取尾部）
}
local OP_NAMES = {}

-- ============================================================================
-- 1. JSON 编解码（纯标准库自实现）
-- ============================================================================

local function jnumber(n)
  if n ~= n or n == math.huge or n == -math.huge then return "null" end
  -- ⚠️ 这里踩过一个**真机上才暴露**的 bug（2026-09-12）：原先的条件是
  --    `math.floor(n) == n and math.abs(n) < 1e15`，把大整数推给了 "%.14g"，
  --    于是 16 位的请求序号被写成科学计数法、**丢了末位精度**
  --    （实测：请求 seq=1789175384220009 → 响应 "seq":1.78917538422e+15，差 9）
  --    ⇒ 客户端按 seq 匹配永远失败、9 个请求全部"超时"（桥其实都执行了）。
  --    报错方式极具迷惑性：桥日志显示 reqSeen/opsRun 都正常，只有客户端在超时。
  --    Node 假桥复现不出来（JS 数字序列化本就精确）⇒ 只有真机验证能抓到。
  if math.type ~= nil and math.type(n) == "integer" then
    return string.format("%d", n)          -- Lua 5.4 整数是 64 位 ⇒ 一律精确输出
  end
  if math.floor(n) == n and math.abs(n) < 9.007199254740992e15 then
    return string.format("%.0f", n)        -- 浮点但整数值：2^53 内 %.0f 精确
  end
  return string.format("%.14g", n)
end

-- 逐字节转义（版本无关，不依赖 %z / 字符类差异；UTF-8 原样透传）
local function jescape(s)
  local buf = {}
  for i = 1, #s do
    local b = string.byte(s, i)
    if b == 34 then buf[#buf + 1] = '\\"'
    elseif b == 92 then buf[#buf + 1] = "\\\\"
    elseif b == 10 then buf[#buf + 1] = "\\n"
    elseif b == 13 then buf[#buf + 1] = "\\r"
    elseif b == 9 then buf[#buf + 1] = "\\t"
    elseif b == 8 then buf[#buf + 1] = "\\b"
    elseif b == 12 then buf[#buf + 1] = "\\f"
    elseif b < 32 then buf[#buf + 1] = string.format("\\u%04x", b)
    else buf[#buf + 1] = string.char(b) end
  end
  return '"' .. table.concat(buf) .. '"'
end

-- 判断是否「纯数组」（键为连续的 1..n 数字）
local function arrayLen(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" then return nil end
    n = n + 1
  end
  for i = 1, n do
    if t[i] == nil then return nil end
  end
  return n
end

local jenc

jenc = function(v)
  if v == nil or v == NULL then return "null" end
  local t = type(v)
  if t == "boolean" then return v and "true" or "false" end
  if t == "number" then return jnumber(v) end
  if t == "string" then return jescape(v) end
  if t == "table" then
    local n = arrayLen(v)
    if n then
      local buf = {}
      for i = 1, n do buf[i] = jenc(v[i]) end
      return "[" .. table.concat(buf, ",") .. "]"
    end
    local buf = {}
    for k, val in pairs(v) do
      if type(k) == "string" and val ~= nil then
        buf[#buf + 1] = jescape(k) .. ":" .. jenc(val)
      end
    end
    return "{" .. table.concat(buf, ",") .. "}"
  end
  return "null"   -- function / userdata / thread 不序列化
end

local function utf8enc(cp)
  if cp < 0x80 then return string.char(cp) end
  if cp < 0x800 then
    return string.char(0xC0 + math.floor(cp / 64), 0x80 + cp % 64)
  end
  if cp < 0x10000 then
    return string.char(0xE0 + math.floor(cp / 4096),
                       0x80 + math.floor(cp / 64) % 64, 0x80 + cp % 64)
  end
  return string.char(0xF0 + math.floor(cp / 262144),
                     0x80 + math.floor(cp / 4096) % 64,
                     0x80 + math.floor(cp / 64) % 64, 0x80 + cp % 64)
end

local function jdec(s)
  local pos = 1
  local len = #s

  local function skip()
    while pos <= len do
      local c = string.sub(s, pos, pos)
      if c == " " or c == "\t" or c == "\n" or c == "\r" then pos = pos + 1 else break end
    end
  end

  local parseValue

  local function parseString()
    pos = pos + 1  -- 跳过开引号
    local buf = {}
    while pos <= len do
      local c = string.sub(s, pos, pos)
      if c == '"' then
        pos = pos + 1
        return table.concat(buf)
      elseif c == "\\" then
        local e = string.sub(s, pos + 1, pos + 1)
        if e == "u" then
          local hex = string.sub(s, pos + 2, pos + 5)
          local cp = tonumber(hex, 16) or 63
          pos = pos + 6
          if cp >= 0xD800 and cp <= 0xDBFF then
            -- 代理对：\uD83D\uDE00
            local two = string.sub(s, pos, pos + 1)
            if two == "\\u" then
              local lo = tonumber(string.sub(s, pos + 2, pos + 5), 16)
              if lo and lo >= 0xDC00 and lo <= 0xDFFF then
                cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
                pos = pos + 6
              end
            end
          end
          buf[#buf + 1] = utf8enc(cp)
        elseif e == "n" then buf[#buf + 1] = "\n"; pos = pos + 2
        elseif e == "t" then buf[#buf + 1] = "\t"; pos = pos + 2
        elseif e == "r" then buf[#buf + 1] = "\r"; pos = pos + 2
        elseif e == "b" then buf[#buf + 1] = "\b"; pos = pos + 2
        elseif e == "f" then buf[#buf + 1] = "\f"; pos = pos + 2
        else buf[#buf + 1] = e; pos = pos + 2 end
      else
        buf[#buf + 1] = c
        pos = pos + 1
      end
    end
    error("unterminated string at " .. tostring(pos))
  end

  local function parseNumber()
    local startp = pos
    while pos <= len do
      local c = string.sub(s, pos, pos)
      if c == "-" or c == "+" or c == "." or c == "e" or c == "E" or
         (c >= "0" and c <= "9") then
        pos = pos + 1
      else
        break
      end
    end
    local num = tonumber(string.sub(s, startp, pos - 1))
    if num == nil then error("bad number at " .. tostring(startp)) end
    return num
  end

  local function parseObject()
    pos = pos + 1  -- {
    local obj = {}
    skip()
    if string.sub(s, pos, pos) == "}" then pos = pos + 1; return obj end
    while true do
      skip()
      if string.sub(s, pos, pos) ~= '"' then error("expected key at " .. tostring(pos)) end
      local k = parseString()
      skip()
      if string.sub(s, pos, pos) ~= ":" then error("expected : at " .. tostring(pos)) end
      pos = pos + 1
      obj[k] = parseValue()
      skip()
      local c = string.sub(s, pos, pos)
      if c == "," then pos = pos + 1
      elseif c == "}" then pos = pos + 1; return obj
      else error("expected , or } at " .. tostring(pos)) end
    end
  end

  local function parseArray()
    pos = pos + 1  -- [
    local arr = {}
    skip()
    if string.sub(s, pos, pos) == "]" then pos = pos + 1; return arr end
    while true do
      arr[#arr + 1] = parseValue()
      skip()
      local c = string.sub(s, pos, pos)
      if c == "," then pos = pos + 1
      elseif c == "]" then pos = pos + 1; return arr
      else error("expected , or ] at " .. tostring(pos)) end
    end
  end

  parseValue = function()
    skip()
    if pos > len then error("unexpected end of input") end
    local c = string.sub(s, pos, pos)
    if c == "{" then return parseObject() end
    if c == "[" then return parseArray() end
    if c == '"' then return parseString() end
    if c == "t" then
      if string.sub(s, pos, pos + 3) == "true" then pos = pos + 4; return true end
      error("bad literal at " .. tostring(pos))
    end
    if c == "f" then
      if string.sub(s, pos, pos + 4) == "false" then pos = pos + 5; return false end
      error("bad literal at " .. tostring(pos))
    end
    if c == "n" then
      if string.sub(s, pos, pos + 3) == "null" then pos = pos + 4; return NULL end
      error("bad literal at " .. tostring(pos))
    end
    return parseNumber()
  end

  local v = parseValue()
  skip()
  return v
end

-- ============================================================================
-- 2. 文件与日志
-- ============================================================================

local function readFile(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a")
  f:close()
  return s
end

local function writeFile(path, s)
  local f = io.open(path, "w")
  if not f then return false end
  local ok = f:write(s)
  f:close()
  return ok ~= nil
end

-- 原子替换：先写 .tmp 再改名；rename 覆盖失败则先删目标（Windows 的 C rename 目标存在会失败）
local function writeFileAtomic(path, s)
  local tmp = path .. ".tmp"
  if not writeFile(tmp, s) then return false end
  if os.rename and os.rename(tmp, path) then return true end
  os.remove(path)
  if os.rename and os.rename(tmp, path) then return true end
  os.remove(tmp)
  return writeFile(path, s)
end

local function log(msg)
  if PATH.log == "" then return end
  local line = os.date("%H:%M:%S") .. " " .. tostring(msg) .. "\n"
  local cur = readFile(PATH.log)
  if cur and #cur > CFG.LOG_MAX_BYTES then cur = "" end
  local f = io.open(PATH.log, "w")
  if f then
    f:write((cur or "") .. line)
    f:close()
  end
end

-- ============================================================================
-- 3. SV API 小工具（全部 pcall 保护）
-- ============================================================================

local function has(obj, name)
  if obj == nil then return false end
  local ok, t = pcall(function() return obj[name] end)
  if not ok then return false end
  -- ⚠️ 实测（SV1 1.11.2 / Lua 5.4）：SV 的 Lua 绑定把**所有可调用成员都暴露为
  --    userdata**（靠 `__call` 元方法调用），不是 function。
  --    diag 里的 svMembers 全部形如 "getProject:userdata"、"setTimeout:userdata"。
  --    所以这里不能只认 function，否则 has() 对每一个 SV 函数都返回 false。
  return type(t) == "function" or type(t) == "userdata"
end

-- 对象方法：SV 的 Lua 绑定是**冒号方法** ⇒ 一律显式传 self。
-- ⚠️ 绝不做「点调用回退」，两个理由：
--   ① 错误形式的调用**即使被 pcall 包住也会弹脚本错误框**（实测两次）；
--   ② 若冒号形式合法地返回 nil（如空组），回退会让**写操作执行两次**。
local function call(obj, name, ...)
  if not has(obj, name) then return nil, "no method: " .. tostring(name) end
  local args = { ... }
  local ok, res = pcall(function() return obj[name](obj, unpackFn(args)) end)
  if ok then return res, nil end
  return nil, tostring(res)
end

-- ===== SV 命名空间调用 =====
-- 实测结论（2026-09-11，SV1 1.11.2）：绑定是**冒号方法**，C 侧签名形如 (self, ...)。
--   证据 1：SV.showMessageBox(title, msg) → "2 argument(s) expected, got 1"
--   证据 2：SV.create("Note")            → "1 argument(s) expected, got 0"
--   两者都符合「第 1 个实参被 self 吃掉」。
-- ⚠️ 错误形式的调用**即使被 pcall 包住也会弹脚本错误框**（实测两次）
--    ⇒ 绝不做试错式回退；svTry 的两个分支都只走冒号（保留参数只为兼容旧调用点）。
local function svTry(style, name, args)
  return pcall(function() return SV[name](SV, unpackFn(args)) end)
end

-- 只探测「无参只读」函数：绝不探测 finish（会把脚本结束掉）或 showMessageBox（会弹框）
local SV_PROBE_FNS = { "getHostInfo", "getProject", "getMainEditor", "getHostClipboard", "getArrangement", "getPlayback" }

local function detectSvStyle()
  local detail = {}
  for _, name in ipairs(SV_PROBE_FNS) do
    local okC, resC = svTry("colon", name, {})
    local okD, resD = svTry("dot", name, {})
    detail[#detail + 1] = {
      fn = name,
      colon_ok = okC and true or false, colon_err = (not okC) and tostring(resC) or nil,
      dot_ok = okD and true or false, dot_err = (not okD) and tostring(resD) or nil
    }
  end
  -- 关键判别：用「带参数的 create("Note")」，而不是无参函数。
  -- 若绑定是点函数：SV.create(SV, "Note") 的第 1 个实参被当成类型字符串 → 报错；
  -- 若是冒号方法：SV.create("Note") 缺 self → 报错。两者不会同时成立，故无歧义。
  -- （只比无参函数不行：点函数会忽略多余的 self 实参，两边都会"成功"。）
  local okCc, resCc = svTry("colon", "create", { "Note" })
  local okDd, resDd = svTry("dot", "create", { "Note" })
  detail[#detail + 1] = {
    fn = "create('Note') <-- 判别用",
    colon_ok = okCc and true or false, colon_err = (not okCc) and tostring(resCc) or nil,
    dot_ok = okDd and true or false, dot_err = (not okDd) and tostring(resDd) or nil
  }
  ST.svStyleDetail = detail

  if okCc and not okDd then ST.svStyle = "colon"; return end
  if okDd and not okCc then ST.svStyle = "dot"; return end

  local okC, resC = svTry("colon", "getHostInfo", {})
  if okC and type(resC) == "table" and (resC.hostName ~= nil or resC.hostVersion ~= nil) then
    ST.svStyle = "colon"; return
  end
  local okD, resD = svTry("dot", "getHostInfo", {})
  if okD and type(resD) == "table" and (resD.hostName ~= nil or resD.hostVersion ~= nil) then
    ST.svStyle = "dot"; return
  end
  ST.svStyle = "colon"   -- 都拿不到就按冒号（错误信息已指向冒号）
end

-- 统一入口：只走冒号，**不回退**（回退会弹框，且可能让写操作执行两次）
local function SC(name, ...)
  local args = { ... }
  local ok, res = pcall(function() return SV[name](SV, unpackFn(args)) end)
  if ok then return res end
  error("SV:" .. tostring(name) .. " 调用失败：" .. tostring(res))
end

-- 列出对象成员名（用于探测 Lua 绑定真实表面）
local function members(obj)
  local out = {}
  if obj == nil then return out end
  pcall(function()
    for k, v in pairs(obj) do
      out[#out + 1] = tostring(k) .. ":" .. type(v)
    end
  end)
  if #out == 0 then
    local mt = getmetatable and getmetatable(obj)
    if mt then
      pcall(function()
        for k, v in pairs(mt) do out[#out + 1] = "mt." .. tostring(k) .. ":" .. type(v) end
        if type(mt.__index) == "table" then
          for k, v in pairs(mt.__index) do out[#out + 1] = "idx." .. tostring(k) .. ":" .. type(v) end
        end
      end)
    end
  end
  table.sort(out)
  return out
end

-- 索引基准：直接取配置值，**不探测**。
-- ⚠️ 两次实测教训（2026-09-11）：
--   ① 原来用 getTrack(0)/getTrack(1) 试探，触发「访问超出范围（索引为 0，大小为 1）」错误框；
--   ② 该错误**是在 pcall 里发生的，却照样弹框** ⇒ 这个绑定的错误穿透 pcall。
--   ⇒ Lua 桥一律按 CFG.INDEX_BASE(1) 换算；对外仍报 0-based。
--   ⇒ 同理：桥里**任何**可能出错的"探测式调用"都要删掉，宁可少一个能力也不弹框。
local function detectIndexBase(proj)
  return CFG.INDEX_BASE
end

-- 把「对外 0-based 下标」换成宿主真实下标
local function idx(i)
  return (tonumber(i) or 0) + ST.indexBase
end

-- ============================================================================
-- 4. 通道
-- ============================================================================

-- ===== 常驻定时器探测 =====
-- 实测（SV1 1.11.2 + Lua 5.4）：SV.setTimeout **存在**，但暴露为 **userdata**（带 __call 元方法），不是 function。
-- ⇒ 不能假设 Lua 绑定与 JS 绑定同名同类型。逐个候选探测，并把结果写进诊断文件。
local function safeGet(t, k)
  if t == nil then return nil end
  local ok, v = pcall(function() return t[k] end)
  if ok then return v end
  return nil
end

local function listGlobals()
  local out = {}
  pcall(function()
    for k, v in pairs(_G) do
      if type(v) == "function" then out[#out + 1] = tostring(k) end
    end
  end)
  table.sort(out)
  return out
end

local function detectTimer()
  local g = nil
  pcall(function() g = _G end)
  local cands = {
    { where = "SV", tbl = SV, name = "setTimeout" },
    { where = "G",  tbl = g,  name = "setTimeout" },
    { where = "G",  tbl = g,  name = "setInterval" },
    { where = "SV", tbl = SV, name = "setInterval" },
    { where = "SV", tbl = SV, name = "SetTimeout" }
  }
  local report = {}
  for _, c in ipairs(cands) do
    local v = safeGet(c.tbl, c.name)
    report[#report + 1] = c.where .. "." .. c.name .. " = " .. type(v)
    -- ⚠️ 可调用成员是 **userdata**（带 __call），不是 function —— 实测于 SV1 1.11.2
    if type(v) == "function" or type(v) == "userdata" then
      ST.timerReport = report
      return { where = c.where, name = c.name, fn = v }
    end
  end
  ST.timerReport = report
  return nil
end

local function scheduleWith(delayMs, cb)
  local t = ST.timer
  if t == nil then return false end
  local ok = pcall(function()
    if t.where == "SV" then
      t.fn(SV, delayMs, cb)      -- SV.* 是冒号方法
    else
      t.fn(delayMs, cb)          -- 全局函数
    end
  end)
  if not ok then trace("定时器调度失败: " .. tostring(t.where) .. "." .. tostring(t.name)) end
  return ok
end

local function pickDir()
  local cands = {}
  local up = os.getenv and os.getenv("USERPROFILE")
  if up then cands[#cands + 1] = up .. "\\AKDAgent\\ipc" end
  local tp = os.getenv and (os.getenv("TEMP") or os.getenv("TMP"))
  if tp then cands[#cands + 1] = tp end
  if os.getenv then cands[#cands + 1] = "." end
  for _, d in ipairs(cands) do
    local probe = d .. "\\akdagent-wtest.tmp"
    local f = io.open(probe, "w")
    if f then
      f:write("ok")
      f:close()
      os.remove(probe)
      return d
    end
  end
  return nil
end

local function setupPaths()
  PATH.req  = ST.dir .. "\\akdagent-req-" .. ST.host .. ".json"
  PATH.res  = ST.dir .. "\\akdagent-res-" .. ST.host .. ".json"
  PATH.hb   = ST.dir .. "\\akdagent-hb-" .. ST.host .. ".json"
  PATH.log  = ST.dir .. "\\akdagent-log-" .. ST.host .. ".txt"
  PATH.boot = ST.dir .. "\\akdagent-boot-" .. ST.host .. ".json"
  -- 面板中继用（JSONL，一行一个事件）：
  --   akdagent-panel-<host>.jsonl     面板 → 客户端（用户输入 / 选项答案 / 跳过）
  --   akdagent-panel-in-<host>.jsonl  客户端 → 面板（追加文本 / 提问 / 清空）
  PATH.panelOut = ST.dir .. "\\akdagent-panel-" .. ST.host .. ".jsonl"
  PATH.panelIn  = ST.dir .. "\\akdagent-panel-in-" .. ST.host .. ".jsonl"
  -- 入向已读偏移（落盘）：**桥重启后不能把 panel-in 里的旧内容重放一遍**，
  -- 否则旧的 ask（提问）会再冒出来 ⇒ 用户看到"选择面板常驻"（2026-09-15 实测踩到）。
  PATH.panelInOffset = ST.dir .. "\\akdagent-panel-in-" .. ST.host .. ".offset"
  -- 已转发的面板事件身份（sid+seq）落盘：桥重启后**不重放**同一条事件
  -- （面板重载后 seq 会从 1 重数，只靠 seq 会撞号 ⇒ 必须配上面板的会话 id "sid"）
  PATH.panelOutState = ST.dir .. "\\akdagent-panel-out-" .. ST.host .. ".state"
  -- 客户端在线心跳（Electron 侧每 ~5s 写一次）：桥/面板据此判断"悬浮球有没有连上"
  PATH.clientHb = ST.dir .. "\\akdagent-client-" .. ST.host .. ".json"
end

-- 响应缓存：**以 id（字符串）为键**
-- ⚠️ 曾经以 seq 为键 + "seq 必须大于 lastSeq" 去重，被真机证明是错的（2026-09-12）：
--    两个客户端的 seq **尺度不同**（fileipc.ts 用 Date.now()*1000+n ≈ 1.79e15，
--    ipc-test.cjs 用 Date.now()+n ≈ 1.79e12），谁先发大 seq 就会把桥**永久毒化**——
--    之后所有小 seq 请求被静默忽略（桥活着、心跳照跳、日志只剩 resend）。
--    id 是字符串、与尺度无关，且客户端本来就用 id 匹配响应 ⇒ 用它当去重主键最稳。
local function rememberResponse(key, text)
  ST.done[key] = text
  ST.order[#ST.order + 1] = key
  while #ST.order > CFG.MAX_DONE do
    local old = table.remove(ST.order, 1)
    ST.done[old] = nil
  end
end

local function sendResponse(id, seq, okFlag, payload)
  local res
  if okFlag then
    res = { v = 1, id = id, seq = seq, ok = true, ts = os.time(), host = ST.host, result = payload }
  else
    res = { v = 1, id = id, seq = seq, ok = false, ts = os.time(), host = ST.host, error = tostring(payload) }
  end
  local text = jenc(res)
  rememberResponse(tostring(id), text)      -- 以 id 为缓存键（见上）
  local wrote = writeFileAtomic(PATH.res, text)
  log("respond seq=" .. tostring(seq) .. " id=" .. tostring(id) ..
      " ok=" .. tostring(okFlag) .. " bytes=" .. #text .. (wrote and "" or " WRITE-FAILED"))
  return wrote
end

local function sendHeartbeat()
  local hb = {
    host = ST.host, hostName = ST.hostName, version = ST.hostVer,
    hostVersionNumber = ST.hostVerNum, isSV2 = ST.isSV2,
    indexBase = ST.indexBase, transport = "file", dir = ST.dir,
    bridge = CFG.VERSION, lua = _VERSION, svStyle = ST.svStyle,
    hostOutdated = ST.hostOutdated or false, hostWarning = ST.hostWarning,
    ops = OP_NAMES,
    lastSeq = ST.lastSeq, reqSeen = ST.reqSeen, opsRun = ST.opsRun,
    -- 轮询链的活性证据：心跳与轮询**同一条定时器链**（见 scheduleLoop），
    -- 所以"心跳在跳"就等于"轮询在跑"；这两个计数供事后核对。
    pollTicks = ST.pollTicks or 0, pollErrors = ST.pollErrors or 0,
    -- 面板中继能力（客户端据此决定要不要起面板这条链）
    panel = PANEL.enabled and true or false, panelVersion = PANEL.version,
    ts = os.time()
  }
  writeFileAtomic(PATH.hb, jenc(hb))
end

-- ============================================================================
-- 4.5 run_script 的辅助接口（SVH）
-- ============================================================================

SVH.members    = members
SVH.svcall     = SC                      -- 脚本里请优先用冒号写法：SV:getProject()
SVH.svStyle    = function() return ST.svStyle end
SVH.indexBase  = function() return ST.indexBase end
SVH.idx        = idx
SVH.call       = call
SVH.has        = has
SVH.jsonencode = jenc
SVH.jsondecode = jdec
SVH.log        = log
SVH.null       = NULL
SVH.isnull     = function(v) return v == NULL end
SVH.info       = function()
  return { host = ST.host, hostName = ST.hostName, version = ST.hostVer,
           isSV2 = ST.isSV2, indexBase = ST.indexBase, lua = _VERSION, dir = ST.dir }
end

-- ===== 能力探测（只读）：每个 op 需要的宿主 API 成员是否存在 =====
-- 用途：换宿主（SV2 / IX / 新版本）时**一次运行就能看清哪些 op 具备条件**，
--       不必逐个试跑 op —— 试跑有风险：API 报错会弹模态框并**冻结整个桥**。
-- ⚠️ 只做**成员存在性**判断（has()），不调用任何会改状态的 API。
local function capabilityReport()
  local proj = SC("getProject")
  local ed = SC("getMainEditor")
  local ta = proj and call(proj, "getTimeAxis") or nil
  local sel = ed and call(ed, "getSelection") or nil
  local track = ed and call(ed, "getCurrentTrack") or nil
  local ref = ed and call(ed, "getCurrentGroup") or nil
  local grp = ref and call(ref, "getTarget") or nil
  local note = nil
  if grp ~= nil and (call(grp, "getNumNotes") or 0) > 0 then
    note = call(grp, "getNote", 1)
  end
  local pb = call(SV, "getPlayback")

  -- 要求表：op → { {对象, 成员名}, ... }；对象为 nil（无当前组/无音符）时记为"缺少对象"
  local reqs = {
    ping = { { SV, "getHostInfo" } },
    get_project_info = { { proj, "getNumTracks" }, { proj, "getTrack" }, { proj, "getFileName" },
                         { proj, "getDuration" }, { proj, "getNumNoteGroupsInLibrary" } },
    get_current_group = { { ed, "getCurrentGroup" }, { ref, "getTarget" }, { grp, "getName" },
                          { grp, "getNumNotes" }, { ref, "getTimeOffset" }, { ref, "getPitchOffset" } },
    get_selected_notes = { { ed, "getSelection" }, { sel, "getSelectedNotes" },
                           { note, "getOnset" }, { note, "getDuration" }, { note, "getEnd" },
                           { note, "getPitch" }, { note, "getLyrics" } },
    transpose_selected_notes = { { sel, "getSelectedNotes" }, { note, "setPitch" }, { proj, "newUndoRecord" } },
    set_selected_lyrics = { { sel, "getSelectedNotes" }, { note, "setLyrics" }, { proj, "newUndoRecord" } },
    apply_lyrics = { { sel, "getSelectedNotes" }, { ed, "getCurrentGroup" }, { note, "setLyrics" },
                     { proj, "newUndoRecord" } },
    fill_track_lyrics = { { proj, "getTrack" }, { track, "getNumGroups" }, { track, "getGroupReference" },
                          { track, "getName" }, { proj, "newUndoRecord" }, { note, "setLyrics" } },
    playback = { { SV, "getPlayback" }, { pb, "play" }, { pb, "pause" }, { pb, "stop" }, { pb, "getStatus" } },
    get_measure_info = { { ta, "getMeasureMarkAt" }, { ta, "getSecondsFromBlick" } },
    get_note_time = { { ta, "getMeasureMarkAt" }, { ta, "getSecondsFromBlick" }, { ed, "getCurrentGroup" },
                      { grp, "getNote" }, { ref, "getTimeOffset" } },
    get_melody_notes = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { ta, "getSecondsFromBlick" } },
    get_layout = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "getOnset" }, { note, "getDuration" } },
    get_lyrics_attrs = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "getLyrics" },
                         { note, "getLanguageOverride" }, { note, "getRapAccent" } },
    get_phonemes = { { ed, "getCurrentGroup" }, { SV, "getPhonemesForGroup" } },
    set_note_languages = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "setLanguageOverride" },
                           { proj, "newUndoRecord" } },
    set_note_rap_accents = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "setRapAccent" },
                             { proj, "newUndoRecord" } },
    set_note_phonemes = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "setPhonemes" },
                          { proj, "newUndoRecord" } },
    set_note_phoneme_attrs = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "setAttributes" },
                               { proj, "newUndoRecord" } },
    set_note_dur = { { ed, "getCurrentGroup" }, { grp, "getNote" }, { note, "setAttributes" },
                     { proj, "newUndoRecord" } },
    write_chords = { { proj, "newUndoRecord" }, { proj, "addNoteGroup" }, { track, "addGroupReference" },
                     { track, "removeGroupReference" }, { grp, "addNote" }, { note, "setTimeRange" },
                     -- 🆕 2026-09-25 主组路线（target=main，SV1 默认）额外要这些：
                     { track, "getMainReference" }, { ref, "getTarget" }, { grp, "getNumNotes" },
                     { grp, "getNote" }, { note, "getOnset" }, { note, "getDuration" } },
    write_pit = { { proj, "newUndoRecord" }, { ta, "getSecondsFromBlick" }, { ta, "getBlickFromSeconds" },
                  { note, "setAttributes" }, { note, "setPitchAutoMode" } },
    create_harmony_group = { { proj, "addNoteGroup" }, { ed, "getCurrentTrack" }, { grp, "addNote" },
                             { note, "setTimeRange" }, { track, "addGroupReference" }, { ref, "getTimeOffset" },
                             -- 🆕 同上：主组路线（target=main）要这些
                             { track, "getMainReference" }, { ref, "getTarget" }, { grp, "getNumNotes" },
                             { grp, "getNote" }, { note, "getOnset" }, { note, "getDuration" } },
    align_audio = { { ta, "getMeasureMarkAt" }, { ta, "getBlickFromSeconds" }, { ref, "getDuration" } },
    apply_tempo = { { ta, "addTempoMark" }, { ta, "getBlickFromSeconds" } },
    run_script = {},        -- 只用 Lua 的 load（宿主必然有）
    selftest = {},
    stop = {},
  }

  local out = {}
  for opName, list in pairs(reqs) do
    local missing = {}
    for i = 1, #list do
      local obj, member = list[i][1], list[i][2]
      if obj == nil then
        missing[#missing + 1] = "(缺少对象) " .. tostring(member)
      elseif not has(obj, member) then
        missing[#missing + 1] = tostring(member)
      end
    end
    out[opName] = { ok = (#missing == 0), missing = missing }
  end

  -- "二选一"的能力单独列出（不算硬性缺失）
  local extras = {
    canCurve = (grp ~= nil) and (has(grp, "getNumPitchControls") and has(grp, "addPitchControl")) or false,
    refHasSetTimeRange = (ref ~= nil) and has(ref, "setTimeRange") or false,
    refHasSetTimeOffset = (ref ~= nil) and has(ref, "setTimeOffset") or false,
    noteHasAttributes = (note ~= nil) and has(note, "getAttributes") or false,
    noteHasScriptData = (note ~= nil) and has(note, "getScriptData") or false,
    hasGetAllTempoMarks = (ta ~= nil) and has(ta, "getAllTempoMarks") or false,
  }
  if out.align_audio ~= nil and not (extras.refHasSetTimeRange or extras.refHasSetTimeOffset) then
    out.align_audio.ok = false
    out.align_audio.missing[#out.align_audio.missing + 1] = "setTimeRange 或 setTimeOffset（二者需有其一）"
  end
  if out.write_pit ~= nil and not (extras.noteHasAttributes or extras.noteHasScriptData) then
    out.write_pit.ok = false
    out.write_pit.missing[#out.write_pit.missing + 1] = "getAttributes 或 getScriptData（二者需有其一）"
  end
  if out.apply_tempo ~= nil and not extras.hasGetAllTempoMarks then
    out.apply_tempo.note = "没有 getAllTempoMarks ⇒ clearExisting 不生效（其余功能正常）"
  end

  local okCount, badCount = 0, 0
  for _, v in pairs(out) do
    if v.ok then okCount = okCount + 1 else badCount = badCount + 1 end
  end
  return {
    okOps = okCount, blockedOps = badCount, detail = out, extras = extras,
    context = {
      hasProject = (proj ~= nil), hasEditor = (ed ~= nil), hasTimeAxis = (ta ~= nil),
      hasSelection = (sel ~= nil), hasCurrentTrack = (track ~= nil), hasCurrentGroup = (ref ~= nil),
      hasNote = (note ~= nil), hasPlayback = (pb ~= nil),
    }
  }
end

-- ============================================================================
-- 5. 操作实现
-- ============================================================================

function OPS.ping(args)
  return {
    pong = true, transport = "file", bridge = CFG.VERSION,
    host = ST.hostName, version = ST.hostVer, hostVersionNumber = ST.hostVerNum,
    isSV2 = ST.isSV2, indexBase = ST.indexBase, lua = _VERSION,
    dir = ST.dir, ops = OP_NAMES, ts = os.time(),
    -- 🆕 0.3.21 版本检测（唯一保留的"危险 API"防线）：见 CFG.VERSION 与 ST.hostOutdated 处
    hostOutdated = ST.hostOutdated or false, hostWarning = ST.hostWarning
  }
end

function OPS.selftest(args)
  local r = { bridge = CFG.VERSION, lua = _VERSION }

  -- JSON 往返（含中文、大整数、嵌套、数组、null、转义）
  local sample = {
    name = "艾可 PLUS", n = 705600000, f = 1.5,
    arr = { 1, 2, 3 }, empty = {},
    nested = { a = true, b = false, c = NULL },
    esc = "引号\" 反斜杠\\ 换行\n 制表\t"
  }
  local enc = jenc(sample)
  r.json_encoded = enc
  local okd, dec = pcall(jdec, enc)
  r.json_decode_ok = okd
  if okd then
    r.json_reencoded = jenc(dec)
    -- 注意：jenc 的键序取决于 pairs()，Lua table 不保序 ⇒ 不比较整串，
    -- 只比较**值**（下面几项）+ 长度健壮性。
    r.json_roundtrip_note = "键序不保证，故不做整串比对"
    r.json_name_ok = (dec.name == "艾可 PLUS")
    r.json_int_ok = (dec.n == 705600000)
    r.json_esc_ok = (dec.esc == sample.esc)
    r.json_arr_ok = (type(dec.arr) == "table" and dec.arr[1] == 1 and dec.arr[3] == 3)
    r.json_null_ok = (dec.nested ~= nil and dec.nested.c == NULL)
    r.json_empty_arr_ok = (type(dec.empty) == "table" and #dec.empty == 0)
  else
    r.json_decode_err = tostring(dec)
  end

  -- 解码一个「客户端会发来的形状」
  local okr, req = pcall(jdec, '{"v":1,"seq":7,"id":"t-1","op":"ping","args":{"x":1,"s":"中文"}}')
  r.req_decode_ok = okr and type(req) == "table" and req.op == "ping" and req.args.s == "中文"

  -- 文件往返
  local p = ST.dir .. "\\akdagent-selftest.txt"
  local cn = "中文往返 ABC 123"
  r.file_write = writeFile(p, cn)
  r.file_read = readFile(p)
  r.file_ok = (r.file_read == cn)
  os.remove(p)

  -- 原子替换（改名覆盖）
  local p2 = ST.dir .. "\\akdagent-selftest2.txt"
  writeFile(p2, "OLD")
  r.atomic_ok = writeFileAtomic(p2, "NEW-LONGER-CONTENT")
  r.atomic_read = readFile(p2)
  r.atomic_ok = r.atomic_ok and (r.atomic_read == "NEW-LONGER-CONTENT")
  os.remove(p2)

  -- 宿主、索引基准与调用约定
  r.host = ST.hostName
  r.hostVersion = ST.hostVer
  r.indexBase = ST.indexBase
  r.svStyle = ST.svStyle
  r.svStyleDetail = ST.svStyleDetail

  -- Lua 绑定真实表面（这是本轮最想要的情报）
  r.members = {}
  pcall(function() r.members.SV = members(SV) end)
  pcall(function() r.members.project = members(SC("getProject")) end)
  -- ⚠️ 只 dump 编辑器成员表，**不调 getSelection()**：
  --    本绑定的错误穿透 pcall 会弹脚本错误框，而 getSelection 的存在性/签名尚未验证。
  --    由调用方看着真实方法名再决定怎么用（宁可少一个能力，也不弹框）。
  pcall(function() r.members.editor = members(SC("getMainEditor")) end)
  pcall(function()
    local proj = SC("getProject")
    local tr = proj:getTrack(ST.indexBase)
    r.members.track = members(tr)
    if tr:getNumGroups() > 0 then
      local gr = tr:getGroupReference(ST.indexBase)
      r.members.groupRef = members(gr)
      r.members.group = members(gr:getTarget())
      local tg = gr:getTarget()
      if tg:getNumNotes() > 0 then
        r.members.note = members(tg:getNote(ST.indexBase))
      end
    end
  end)

  -- ⭐ 能力探测段（只读）：换宿主时一次运行就能看清哪些 op 具备条件
  --   用 pcall 包住：万一探测本身出错，也不能连累 selftest 的其余部分。
  local okCap, cap = pcall(capabilityReport)
  if okCap then
    r.capabilities = cap
  else
    r.capabilities = { error = tostring(cap) }
  end

  return r
end

-- ⚠️ 字段名必须与 JS 桥 **逐字一致**（客户端按同一协议解析两条通道）：
--    JS 版 svhOpGetProjectInfo 给的是 fileName / durationBlicks / numTracks /
--    tracks[{name,numGroups}] / numGroupsInLibrary。
--    本函数在**保持这些名字**的前提下**追加** Lua 侧更有用的字段（index / groups / host / indexBase），
--    追加字段对只读特定键的客户端无害；但**改名的字段会让客户端读到 nil**，故一律不改名。
function OPS.get_project_info(args)
  local proj = SC("getProject")
  local out = { indexBase = ST.indexBase, host = ST.hostName }
  local fileName = call(proj, "getFileName")
  out.fileName = fileName
  out.file = fileName                    -- 兼容旧 Lua 字段（早期版本用 file）
  out.durationBlicks = call(proj, "getDuration")
  local n = call(proj, "getNumTracks")
  out.numTracks = n or 0
  out.numGroupsInLibrary = call(proj, "getNumNoteGroupsInLibrary")
  local tracks = {}
  if type(n) == "number" then
    for i = 0, n - 1 do
      local tr = call(proj, "getTrack", idx(i))
      if tr ~= nil then
        local name = call(tr, "getName")
        local ng = call(tr, "getNumGroups")
        -- 组列表（含名称与音符数），便于 agent 定位
        local groups = {}
        if type(ng) == "number" and ng > 0 then
          for g = 0, ng - 1 do
            local gr = call(tr, "getGroupReference", idx(g))
            if gr ~= nil then
              local tg = call(gr, "getTarget")
              local gname = tg and call(tg, "getName") or nil
              local nn = tg and call(tg, "getNumNotes") or nil
              groups[#groups + 1] = { index = g, name = gname, numNotes = nn }
            end
          end
        end
        tracks[#tracks + 1] = { index = i, name = name, numGroups = ng, groups = groups }
      end
    end
  end
  out.tracks = tracks
  return out
end

-- 与 JS 的 svhOpGetCurrentGroup 逐字对齐（字段名与含义都照抄）
function OPS.get_current_group(args)
  local ed = SC("getMainEditor")
  local ref = call(ed, "getCurrentGroup")
  if ref == nil then return { current = false } end
  local grp = call(ref, "getTarget")
  if grp == nil then return { current = false } end
  -- 🆕 2026-09-25：把 **isMain / hostIsSv2** 一起报出来。
  --   为什么：调用方要按宿主决定"能不能直接写当前组" ——
  --     · `hostIsSv2=false`（SV1）⇒ 主组就是用户音符容器、**可写**；
  --     · `hostIsSv2=true`（SV2/IX）⇒ 主组不能 `addNote`，必须另建组。
  --   以前这两个字段只在 `get_layout` 里有，于是"该怎么写"只能靠**组名猜**（`name=="main"`），
  --   而组名不可靠（用户可以把任意组改名 main，音频轨的组名也叫 main）⇒ 2026-09-25 真机事故：
  --   SV1 上把生成的旋律写进了**新组的"Melody"**，而不是本该写的主组。
  return {
    current = true,
    name = call(grp, "getName"),
    uuid = call(grp, "getUUID"),
    noteCount = call(grp, "getNumNotes"),
    timeOffsetBlicks = call(ref, "getTimeOffset"),
    pitchOffset = call(ref, "getPitchOffset"),
    isMain = (function() local ok, v = pcall(function() return ref:isMain() end) return (ok and v) or nil end)(),
    hostIsSv2 = ST.isSV2
  }
end

-- ===== 歌词切分（apply_lyrics 用）=====
-- 与 JS 的 svhOpApplyLyrics 同一策略：
--   含空白/标点 ⇒ 按分隔符**切词**（英文/西文，保留整词）
--   否则       ⇒ **逐字**切分（中文连续串）
-- ⚠️ Lua 的字符串是**字节**串：中文必须用 utf8 逐**码点**取，否则一个汉字会被切成 3 个字。
-- ⚠️⚠️ 分隔符**不能**写成 Lua 字符类：`[...]` 是**逐字节**匹配，而类里的中文标点会把
--    **后继字节**混进集合（`，`= EF BC 8C ⇒ 把 0x8C 塞进字符集）⇒ 任何**碰巧含该字节**的汉字
--    （歌=E6 AD 8C、一=E4 B8 80、星=E6 98 9F、雪=E9 9B AA）都会被当成"分隔符"，再按字节 gmatch
--    就把整行歌词切碎（实测「夜空之下轻声歌唱」只切出 2 个 token，第一个断在半个字上）。
--    ⇒ 判定与切分**一律按码点**：字符集用码点表，扫串用 utf8.codes。
local LYRIC_WS = {
  -- JS \s（含全角空格 U+3000、NBSP U+00A0 等 Unicode 空白）
  [9] = true, [10] = true, [11] = true, [12] = true, [13] = true, [32] = true, [160] = true,
  [5760] = true, [8232] = true, [8233] = true, [8239] = true, [8287] = true,
  [8192] = true, [8193] = true, [8194] = true, [8195] = true, [8196] = true, [8197] = true,
  [8198] = true, [8199] = true, [8200] = true, [8201] = true, [8202] = true,
  [12288] = true, [65279] = true
}

local function cpSet(base, extra)
  local s = {}
  for cp in pairs(base) do s[cp] = true end
  if extra ~= nil then
    for i = 1, #extra do s[extra[i]] = true end
  end
  return s
end

-- 两个字符集必须与 JS **逐字同集**（legacy/SVAgentBridge.js 的 svhOpApplyLyrics）：
--   判定集：/[\s，,。.、！!？?；;]/          含其一 ⇒ 按**词**切（英文/西文，保留整词）
--   切分集：/[\s,，。.、!！?？;；:/\\|·]+/   切分集比判定集多 :/\|· 五个符号
local LYRIC_SEP_DETECT = cpSet(LYRIC_WS,
  { 44, 46, 33, 63, 59, 65292, 12290, 12289, 65281, 65311, 65331 })
local LYRIC_SEP_SPLIT = cpSet(LYRIC_SEP_DETECT, { 58, 47, 92, 124, 183 })

-- 逐**码点**取（无 utf8 库的老 Lua 退化为逐字节 —— 只对 ASCII 正确）
local function lyricCodePoints(s)
  local cps = {}
  if utf8 and utf8.codes then
    for _, cp in utf8.codes(s) do cps[#cps + 1] = cp end
  else
    for i = 1, #s do cps[#cps + 1] = string.byte(s, i) end
  end
  return cps
end

local function charOfCodePoint(cp)
  if utf8 and utf8.char then return utf8.char(cp) end
  return string.char(cp)
end

-- 按码点集切分：连续分隔符折叠成一个、空段丢弃（等价 JS 的 split(...)+filter(非空)）
local function splitByCodePoints(s, sepSet)
  local out, buf = {}, {}
  local cps = lyricCodePoints(s)
  for i = 1, #cps do
    if sepSet[cps[i]] then
      if #buf > 0 then out[#out + 1] = table.concat(buf); buf = {} end
    else
      buf[#buf + 1] = charOfCodePoint(cps[i])
    end
  end
  if #buf > 0 then out[#out + 1] = table.concat(buf) end
  return out
end

-- ⚠️ 判定集与切分集**不是同一个集**：只含 `·`/`:` 而无判定集成员的串走"逐字"分支
--    （`a·b` ⇒ a / · / b）。这是 JS 的既有行为，两边保持一致。
local function splitLyricTokens(lyrics)
  if lyrics == nil or lyrics == "" then return {} end
  local cps = lyricCodePoints(lyrics)
  for i = 1, #cps do
    if LYRIC_SEP_DETECT[cps[i]] then return splitByCodePoints(lyrics, LYRIC_SEP_SPLIT) end
  end
  -- 逐字（JS 同款：charAt 循环 + 跳过空白）
  local tokens = {}
  for i = 1, #cps do
    if not LYRIC_SEP_DETECT[cps[i]] then tokens[#tokens + 1] = charOfCodePoint(cps[i]) end
  end
  return tokens
end

-- ===== 属性/方法兼容读取 =====
-- SV 的 JS 绑定里 `mark.positionBlick` 是**属性**；Lua 绑定到底暴露成
-- `mark:getPositionBlick()` 还是 `mark.positionBlick` 字段，**两种都可能**（各宿主版本可能不同）。
-- 这里先按 getter 方法取（`call` 内部先 `has()` 判断存在性，**不会误调不存在的成员**），
-- 取不到再读字段（读字段失败最多是 nil，不会弹框）。
-- ⚠️ 这就是"不做试错式探测"与"兼容两种暴露方式"的折中：**只有读，没有写，且都走 has() 守卫**。
local function prop(obj, name)
  if obj == nil then return nil end
  local getter = "get" .. string.upper(string.sub(name, 1, 1)) .. string.sub(name, 2)
  local v = call(obj, getter)
  if v ~= nil then return v end
  local ok, f = pcall(function() return obj[name] end)
  if ok then return f end
  return nil
end

-- 选中音符（对象数组）；无选中 / 选区不可用 ⇒ nil。
-- ⚠️ 本机 SV2 上 `getSelectedNotes()` 的返回值**不是数组**（`#` 恒 0）：只看 `#` 会把"选了 14 个音"
--    误判成"没有选中"，调用方随即退化成**整个组**（write_pit 曾因此在 462 音的真轨上把整条当目标）。
--    ⇒ 条数必须回落到 `getNumSelectedNotes()`（真实元素仍按 `arr[i]` 取），取法与 get_selected_notes 一致。
local function selectedNoteObjects(ed)
  local sel = call(ed, "getSelection")
  if sel == nil then return nil end
  local arr = call(sel, "getSelectedNotes")
  if arr == nil then return nil end
  local n = 0
  local okLen, len = pcall(function() return #arr end)
  if okLen and type(len) == "number" then n = len end
  if n == 0 then
    local cnt = call(sel, "getNumSelectedNotes")
    if type(cnt) == "number" then n = cnt end
  end
  local out = {}
  for i = 1, n do
    if arr[i] ~= nil then out[#out + 1] = arr[i] end
  end
  return out
end

-- ===== 写操作 =====

-- 与 JS 的 svhOpTransposeSelectedNotes 对齐：{changed, semitones}；无选中 ⇒ changed=0 且**不建 undo**
function OPS.transpose_selected_notes(args)
  local semitones = tonumber(args and args.semitones)
  if semitones == nil then error("args.semitones must be a number") end
  local ed = SC("getMainEditor")
  local sel = call(ed, "getSelection")
  local arr = sel and call(sel, "getSelectedNotes") or nil
  local n = (type(arr) == "table") and #arr or 0
  if n == 0 then return { changed = 0, semitones = semitones } end
  call(SC("getProject"), "newUndoRecord")
  local changed = 0
  for i = 1, n do
    local p = call(arr[i], "getPitch")
    if type(p) == "number" then
      call(arr[i], "setPitch", p + semitones)
      changed = changed + 1
    end
  end
  return { changed = changed, semitones = semitones }
end

-- 与 JS 的 svhOpSetSelectedLyrics 对齐：{changed, lyrics}
function OPS.set_selected_lyrics(args)
  local lyrics = tostring((args and args.lyrics) or "")
  local ed = SC("getMainEditor")
  local sel = call(ed, "getSelection")
  local arr = sel and call(sel, "getSelectedNotes") or nil
  local n = (type(arr) == "table") and #arr or 0
  if n == 0 then return { changed = 0, lyrics = lyrics } end
  call(SC("getProject"), "newUndoRecord")
  local changed = 0
  for i = 1, n do
    call(arr[i], "setLyrics", lyrics)
    changed = changed + 1
  end
  return { changed = changed, lyrics = lyrics }
end

-- 与 JS 的 svhOpApplyLyrics 对齐：{changed, count, tokensUsed, tokensTotal}
-- 音符来源：选中优先，无选中回退当前组全部音符；音符多于字时余下填 "-"
function OPS.apply_lyrics(args)
  args = args or {}
  local lyrics = tostring(args.lyrics or "")
  local ed = SC("getMainEditor")
  local notes = {}
  local sel = call(ed, "getSelection")
  local arr = sel and call(sel, "getSelectedNotes") or nil
  if type(arr) == "table" then
    for i = 1, #arr do notes[#notes + 1] = arr[i] end
  end
  if #notes == 0 then
    local ref = call(ed, "getCurrentGroup")
    local grp = ref and call(ref, "getTarget") or nil
    if grp == nil then
      return { changed = 0, count = 0, lyrics = lyrics, error = "无选中音符，且没有当前组" }
    end
    local gn = call(grp, "getNumNotes")
    if type(gn) == "number" then
      for i = 1, gn do
        local nt = call(grp, "getNote", i)
        if nt ~= nil then notes[#notes + 1] = nt end
      end
    end
  end
  if #notes == 0 then return { changed = 0, count = 0, lyrics = lyrics } end

  local tokens = splitLyricTokens(lyrics)
  call(SC("getProject"), "newUndoRecord")
  local changed = 0
  for i = 1, #notes do
    local ch = (i <= #tokens) and tokens[i] or "-"
    call(notes[i], "setLyrics", ch)
    if i <= #tokens then changed = changed + 1 end
  end
  return {
    changed = changed, count = #notes,
    tokensUsed = math.min(#tokens, #notes), tokensTotal = #tokens
  }
end

-- 与 JS 的 svhOpPlayback 对齐：{status}
function OPS.playback(args)
  local action = tostring((args and args.action) or "toggle")
  local pb = SC("getPlayback")
  if action == "play" then
    call(pb, "play")
  elseif action == "pause" then
    call(pb, "pause")
  elseif action == "stop" then
    call(pb, "stop")
  elseif action == "toggle" then
    local st = call(pb, "getStatus")
    if st == "stopped" then call(pb, "play") else call(pb, "pause") end
  elseif action == "seek" then
    local sec = tonumber(args and args.position)
    if sec == nil then error("args.position must be a number (seconds)") end
    call(pb, "seek", sec)
  else
    error("unknown playback action: " .. action)
  end
  return { status = call(pb, "getStatus") }
end

-- ===== 小节 / 时间 / 旋律（读）=====

-- 与 JS 的 svhOpGetMeasureInfo 对齐：{measure, found, positionBlick, numerator, denominator, positionSeconds}
-- ⚠️ getMeasureMarkAt 收的是**小节号（1 起）**，不是 blick；传 blick 会静默退化成别的小节（踩过）。
function OPS.get_measure_info(args)
  local measure = tonumber(args and args.measure)
  if measure == nil or measure < 1 then error("args.measure required (>=1)") end
  local proj = SC("getProject")
  local ta = call(proj, "getTimeAxis")
  if ta == nil then return { measure = measure, found = false } end
  local mark = call(ta, "getMeasureMarkAt", measure)
  if mark == nil then return { measure = measure, found = false } end
  local pos = prop(mark, "positionBlick")
  return {
    measure = measure,
    found = true,
    positionBlick = pos,
    numerator = prop(mark, "numerator"),
    denominator = prop(mark, "denominator"),
    positionSeconds = (type(pos) == "number") and call(ta, "getSecondsFromBlick", pos) or nil
  }
end

-- 🆕 读回「计算音高」（SV2 2.1.1+）。**为什么要有这个 op**：
--   取到数据要等宿主把工程**渲染完**（实测：几个音符的测试工程几秒；长工程更久；还与使用者配置有关），
--   而 op 处理器是**同步返回**的、不能在这里阻塞等待（会冻宿主界面）⇒ 本 op **只读一次**，
--   把"未就绪"**明确报出去**（`notReady=true` + `retryAfterMs`），**轮询重试交给客户端/MCP 侧（Node，可 await）**，
--   由那侧对调用方暴露 {values, numeric, waitedMs, timedOut} 的形状。
--   🔴 **空值语义（2026-09-18 用户裁定，见 skills/sv-project-format/SKILL.md §C）**：
--     宿主回的是「**长度 = `numFrames`、未算出的帧为 `nil`**」的数组 —— **不是空数组**；
--     Lua 里含 `nil` 的表 `#` **不可靠**（会把"一整排 nil"报成 0）⇒ 本 op **一律按 `numFrames` 逐帧遍历，绝不用 `#arr`**。
--     全 nil 的两条真前置（§B / §A）：① 该组要经 `NoteGroupReference` **挂在轨道上**、且**窗口覆盖采样区间**；
--     ② **词的语种要与声库兼容**（英文声库 + 中文词 ⇒ 无音素 ⇒ 不渲染）。两条都不满足时才轮到"没算完"。
--   依据：skills/sv-scripting/api/SV.md 的 getComputedPitchForGroup（2026-09-18 实测补充）。
-- 参数（全可省）：startBlick（默认 = 该 reference 的 timeOffset）、intervalBlick（默认 四分音符/8）、numFrames（默认 32）
function OPS.get_computed_pitch(args)
  args = args or {}
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  if not (SV and has(SV, "getComputedPitchForGroup")) then
    return { ok = false, unsupported = true,
             hint = "本宿主没有 getComputedPitchForGroup（SV2 2.1.1+ 才有；SV1 读不回计算音高）" }
  end
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local offset = call(scope, "getTimeOffset") or 0
  local startBlick = tonumber(args.startBlick)
  if startBlick == nil then startBlick = offset end
  local interval = tonumber(args.intervalBlick) or math.floor(quarter / 8)
  if interval < 1 then interval = 1 end
  local frames = tonumber(args.numFrames) or 32
  if frames < 1 then frames = 1 end

  local okCall, arr = pcall(function() return SV:getComputedPitchForGroup(scope, startBlick, interval, frames) end)
  if not okCall then
    return { ok = false, err = tostring(arr), startBlick = startBlick, intervalBlick = interval, numFrames = frames }
  end
  if type(arr) ~= "table" then
    return { ok = false, err = "getComputedPitchForGroup 返回的不是表：" .. type(arr),
             startBlick = startBlick, intervalBlick = interval, numFrames = frames }
  end
  -- ⚠️ 逐帧遍历（**不用 `#arr`**）：既要数出有值的帧，也要如实报出"从第几帧起有值"
  local values, numeric, firstFrame, lastFrame = {}, 0, nil, nil
  for i = 1, frames do
    if type(arr[i]) == "number" then
      numeric = numeric + 1
      values[numeric] = arr[i]
      if firstFrame == nil then firstFrame = i end
      lastFrame = i
    end
  end
  local out = {
    ok = true, numFrames = frames, numeric = numeric, nulls = frames - numeric,
    values = values, firstFrame = firstFrame, lastFrame = lastFrame,
    startBlick = startBlick, intervalBlick = interval, timeOffset = offset,
    notReady = (numeric == 0),
  }
  if numeric == 0 then
    -- 把两条真前置里"我们能查的部分"一并带出，省一次往返（可查性见 §B / §A）
    local refOnset = call(scope, "getOnset")
    local refDur = call(scope, "getDuration")
    local sampleEnd = startBlick + frames * interval
    local covers = nil
    if type(refOnset) == "number" and type(refDur) == "number" then
      covers = (startBlick >= refOnset and sampleEnd <= refOnset + refDur)
    end
    local g = call(scope, "getTarget")
    local lang = nil
    if g ~= nil then
      local n = call(g, "getNote", 1)
      if n ~= nil then
        lang = call(n, "getLanguageOverride")
        if lang == nil or lang == "" then lang = "(继承)" end
      end
    end
    out.checks = {
      refOnset = refOnset, refDuration = refDur, sampleEnd = sampleEnd, windowCovers = covers,
      groupNoteCount = (g ~= nil) and call(g, "getNumNotes") or nil,
      firstNoteLanguage = lang,
    }
    out.hint = "全 null（不是「没有音高」）：① 组要经 NoteGroupReference 挂在轨道上、窗口要覆盖采样区间（看 checks.windowCovers）" ..
               " ② 词的语种要与声库兼容（不兼容 ⇒ 无音素 ⇒ 不渲染，看 checks.firstNoteLanguage）" ..
               " ③ 两条都没问题 ⇒ 宿主还没算完，稍后重试（小工程几秒、长工程更久）"
    out.retryAfterMs = 500
  end
  return out
end

-- 🆕 读回「计算属性」（SV2 2.1.1+）：每个音符的 `accent` / `rapTone` / `rapIntonation` / `phonemes[]`（含各自 `language`）。
--   这是 rap（重音 / 语调）与"**实际生效语种**"的正路 —— 比逐音符 `getRapAccent()` + `getLanguageOverride()`
--   更能反映"宿主到底算完没有"（后者读的是**设定值**，前者是**计算结果**）。
--   ⚠️ 同样受"渲染前置条件"与"没算完就空"的约束：空数组/`count=0` 时**先按 §B·§A 自查**，再考虑重试。
--   参数（全可省）：numFrames 无关；本 op 读**当前组引用**指向的整组。
function OPS.get_computed_attributes(args)
  args = args or {}
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  if not (SV and has(SV, "getComputedAttributesForGroup")) then
    return { ok = false, unsupported = true,
             hint = "本宿主没有 getComputedAttributesForGroup（SV2 2.1.1+ 才有）" }
  end
  local okCall, arr = pcall(function() return SV:getComputedAttributesForGroup(scope) end)
  if not okCall then return { ok = false, err = tostring(arr) } end
  if type(arr) ~= "table" then
    return { ok = false, err = "getComputedAttributesForGroup 返回的不是表：" .. type(arr) }
  end
  -- 这里"每个音符一项"是稠密数组，`#` 可用；仍逐项判类型（宿主可能回 nil 洞）
  local notes, langs, accents = {}, {}, {}
  local count = 0
  for i = 1, #arr do
    local it = arr[i]
    if type(it) == "table" then
      count = count + 1
      local ph, phLangs = {}, {}
      if type(it.phonemes) == "table" then
        for j = 1, #it.phonemes do
          local p = it.phonemes[j]
          if type(p) == "table" then
            local lang = p.language
            ph[#ph + 1] = { symbol = p.symbol, language = lang, activity = p.activity, position = p.position }
            if type(lang) == "string" and lang ~= "" then
              phLangs[#phLangs + 1] = lang
              langs[lang] = true
            end
          end
        end
      end
      if type(it.accent) == "string" and it.accent ~= "" then accents[it.accent] = true end
      notes[count] = { index = i - 1, accent = it.accent, rapTone = it.rapTone, rapIntonation = it.rapIntonation,
                       phonemeCount = #ph, phonemes = ph, phonemeLanguages = phLangs }
    end
  end
  local langList = {}
  for k in pairs(langs) do langList[#langList + 1] = k end
  table.sort(langList)
  local accentList = {}
  for k in pairs(accents) do accentList[#accentList + 1] = k end
  table.sort(accentList)
  local out = { ok = true, count = count, notes = notes, languages = langList, accents = accentList,
                notReady = (count == 0) }
  if count == 0 then
    out.hint = "空：要么宿主还没算完，要么该组不可渲染（渲染前置条件 / 语种与声库不兼容，见 skills/sv-project-format/SKILL.md §B · §A）"
    out.retryAfterMs = 500
  end
  return out
end

-- 与 JS 的 svhOpGetNoteTime 对齐：小节内第 noteIndex（**0 起**）个音符的精确时间
function OPS.get_note_time(args)
  local measure = tonumber(args and args.measure)
  local noteIndex = tonumber(args and args.noteIndex)
  if measure == nil or noteIndex == nil then
    error("args.measure and args.noteIndex required")
  end
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local ta = call(SC("getProject"), "getTimeAxis")
  if ta == nil then error("no time axis") end
  local mark = call(ta, "getMeasureMarkAt", measure)
  if mark == nil then error("measure not found: " .. tostring(measure)) end
  local startB = prop(mark, "positionBlick")
  if type(startB) ~= "number" then error("measure mark 缺 positionBlick") end
  local offset = call(scope, "getTimeOffset") or 0
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local n = call(grp, "getNumNotes") or 0
  local found, idx = nil, 0
  for i = 1, n do
    local nt = call(grp, "getNote", i)
    if nt ~= nil then
      local onset = (call(nt, "getOnset") or 0) + offset
      if onset >= startB then
        if idx == noteIndex then found = nt; break end
        idx = idx + 1
      end
    end
  end
  if found == nil then return { measure = measure, noteIndex = noteIndex, found = false } end
  local onset = (call(found, "getOnset") or 0) + offset
  local dur = call(found, "getDuration") or 0
  return {
    measure = measure, noteIndex = noteIndex, found = true,
    onsetBlick = onset, onsetQuarter = onset / quarter,
    onsetSeconds = call(ta, "getSecondsFromBlick", onset),
    pitch = call(found, "getPitch"),
    durationBlicks = dur, durationQuarter = dur / quarter,
    lyrics = call(found, "getLyrics")
  }
end

-- 与 JS 的 svhOpGetMelodyNotes 对齐：当前组旋律（含 blick/quarter/second 三种单位）
function OPS.get_melody_notes(args)
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then return { current = false, notes = {} } end
  local grp = call(scope, "getTarget")
  if grp == nil then return { current = false, notes = {} } end
  local ta = call(SC("getProject"), "getTimeAxis")
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local n = call(grp, "getNumNotes") or 0
  local maxNotes = tonumber(args and args.maxNotes) or 0
  local limit = (maxNotes > 0) and math.min(n, maxNotes) or n
  local out = {}
  for i = 1, limit do
    local nt = call(grp, "getNote", i)
    if nt ~= nil then
      local onset = call(nt, "getOnset") or 0
      local dur = call(nt, "getDuration") or 0
      local e = call(nt, "getEnd")
      if type(e) ~= "number" then e = onset + dur end
      out[#out + 1] = {
        index = i - 1,                      -- 协议：0 起
        pitch = call(nt, "getPitch"),
        onsetBlicks = onset, durationBlicks = dur, endBlicks = e,
        onsetQuarter = onset / quarter, durationQuarter = dur / quarter,
        onsetSeconds = call(ta, "getSecondsFromBlick", onset),
        lyrics = call(nt, "getLyrics")
      }
    end
  end
  return {
    current = true, groupName = call(grp, "getName"),
    timeOffsetBlicks = call(scope, "getTimeOffset"),
    noteCount = n, notes = out
  }
end

local LAYOUT = {}    -- 布局报告（P7 ③）；放表里，少占一个 local 名额

-- 🆕 **布局报告（P7 ③，2026-09-18 用户新口径）**：`重叠 = 违规`（必须报）· **`缝隙 = 允许，但要告知`**
--   —— **不再要求"不留缝"**；**只有用户同意后才去消缝**；**我们生成新音符时默认不留短缝**（生成侧自律，靠调用方保证连续）。
-- 判据：把组内音符按 onset 排序，逐个比较 `prev.end` 与 `cur.onset`。
--   `SMALL_GAP` = 1/16 拍内的缝视为"短缝"（额外标出来，提示"可消可留，由用户定"）。
function LAYOUT.scan(grp)
  if grp == nil then return nil end
  local n = call(grp, "getNumNotes") or 0
  local notes = {}
  for i = 1, n do
    local nt = call(grp, "getNote", i)
    if nt ~= nil then
      local onset = call(nt, "getOnset") or 0
      local dur = call(nt, "getDuration") or 0
      notes[#notes + 1] = { index = i - 1, onset = onset, dur = dur, endB = onset + dur,
                            pitch = call(nt, "getPitch"), lyrics = call(nt, "getLyrics") }
    end
  end
  -- ⚠️ 排序要让**同 onset 也有确定次序**（否则同 onset 组内 prev/next 是任意的，
  --    报告每次都不一样）：先 onset、再 pitch。
  table.sort(notes, function(a, b)
    if a.onset ~= b.onset then return a.onset < b.onset end
    return (a.pitch or 0) < (b.pitch or 0)
  end)
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local smallGap = math.floor(quarter / 16)
  local out = { noteCount = #notes, overlaps = {}, gaps = {}, smallGaps = {} }
  local chordOnsets = {}                                   -- 同 onset 且多于一个音 ⇒ 和弦/齐奏
  for i = 2, #notes do
    local prev, cur = notes[i - 1], notes[i]
    if cur.onset <= prev.onset + 1 then
      -- **同 onset = 和弦/齐奏**，不是重叠！柱式/织体输出必然如此，任何宿主都允许。
      -- （2026-09-20 真机踩到：4 小节柱式被报 6 处"重叠违规"，而策略文案要求"必须报给用户"
      --   ⇒ agent 会把正常和弦当违规去"修"。同一 onset 的旧判据见 git 历史 0.3.17。）
      chordOnsets[cur.onset] = true
    elseif cur.onset < prev.endB - 1 then                  -- 错位重叠（后音起在前音内部，留 1 blick 容差）
      out.overlaps[#out.overlaps + 1] = {
        prevIndex = prev.index, nextIndex = cur.index,
        overlapBlick = prev.endB - cur.onset,
        overlapQuarter = (prev.endB - cur.onset) / quarter,
      }
    elseif cur.onset > prev.endB + 1 then                  -- 缝隙（允许，但要告知）
      local g = cur.onset - prev.endB
      local item = { prevIndex = prev.index, nextIndex = cur.index, gapBlick = g, gapQuarter = g / quarter }
      out.gaps[#out.gaps + 1] = item
      if g <= smallGap then out.smallGaps[#out.smallGaps + 1] = item end
    end
  end
  local chordCount = 0
  for _ in pairs(chordOnsets) do chordCount = chordCount + 1 end
  out.chordCount = chordCount                             -- 和弦/齐奏的**起点数**（不是违规，只作说明）
  out.overlapCount = #out.overlaps
  out.gapCount = #out.gaps
  out.smallGapCount = #out.smallGaps
  -- 重叠**是否算违规取决于宿主**：IX 允许重叠（用户 2026-09-20 明确）；SV 侧仍是违规。
  out.overlapAllowedByHost = (ST.host == "ix")
  out.policy = {
    overlap = (ST.host == "ix")
      and "重叠 = **IX 允许**（用户 2026-09-20 明确）⇒ **只告知、不判违规**；同 onset 是和弦/齐奏，任何宿主都不算重叠（见 chordCount）"
      or  "重叠 = **违规**，必须报给用户（并建议修）；**同 onset 不算重叠**（那是和弦/齐奏，见 chordCount）",
    gap = "缝隙 = **允许**；这里只作告知 —— **要不要消缝由用户定**（经同意才动手）",
    smallGap = "短缝（≤ 1/16 拍）：**我们生成新音符时默认不留**；检测到既有短缝只告知、不擅自消",
  }
  -- 只回前 5 条样例，避免响应过大
  local function trim(list) local t = {} for i = 1, math.min(#list, 5) do t[i] = list[i] end return t end
  out.overlaps, out.gaps, out.smallGaps = trim(out.overlaps), trim(out.gaps), trim(out.smallGaps)
  return out
end

-- 🆕 读**当前组的布局报告**（P7 ③ 的只读入口）：重叠 / 缝隙 / 短缝 + 策略原文。
--   用途：验收与"体检"——**不改任何东西**（消缝必须经用户同意后由调用方另行处理）。
function OPS.get_layout(args)
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then return { current = false } end
  local grp = call(scope, "getTarget")
  if grp == nil then return { current = false } end
  local rep = LAYOUT.scan(grp)
  if rep == nil then return { current = true, ok = false, reason = "无法取到组" } end
  rep.current = true
  rep.groupName = call(grp, "getName")
  rep.isMain = (function() local ok, v = pcall(function() return scope:isMain() end) return (ok and v) or nil end)()
  rep.hostIsSv2 = ST.isSV2
  return rep
end

-- 🆕 读整组歌词 + 语言 / 说唱属性（**只读**）。给两条用户提出的自动化用：
--   ① 「混合语种只改少数派」（skills/akdagent-playbook/SKILL.md §0.6c）② 「中文声调自动标记」（sv-lyricist/references/说唱词流.md §5.3）。
--   一条 op 拿全套，省往返。返回 notes[]：index（**0 起**）· lyrics · languageOverride（"" = 继承）· musicalType ·
--   rapAccent · rTone/rIntonation（来自 getAttributes，**没写过就查不到键**）· pitch · onsetBlick。
function OPS.get_lyrics_attrs(args)
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then return { current = false, notes = {} } end
  local grp = call(scope, "getTarget")
  if grp == nil then return { current = false, notes = {} } end
  local n = call(grp, "getNumNotes") or 0
  local out = {}
  for i = 1, n do
    local nt = call(grp, "getNote", i)
    if nt ~= nil then
      local a = call(nt, "getAttributes")
      local rTone, rInt = nil, nil
      local phAttrs, durArr = {}, nil
      if type(a) == "table" then
        rTone = a.rTone; rInt = a.rIntonation
        if type(a.phonemes) == "table" then
          for j = 1, #a.phonemes do
            local q = a.phonemes[j]
            if type(q) == "table" then
              phAttrs[#phAttrs + 1] = { position = q.position, leftOffset = q.leftOffset,
                                        strength = q.strength, activity = q.activity }
            end
          end
        end
        if type(a.dur) == "table" then
          durArr = {}
          for j = 1, #a.dur do durArr[j] = a.dur[j] end
        end
      end
      out[#out + 1] = {
        index = i - 1,                                  -- 协议：对外一律 0 起
        lyrics = call(nt, "getLyrics"),
        languageOverride = call(nt, "getLanguageOverride"),
        musicalType = call(nt, "getMusicalType"),
        rapAccent = call(nt, "getRapAccent"),
        phonemes = call(nt, "getPhonemes"),          -- 手动音素（未手改过 = 空串；T2P 默认发音要读 computed）
        muted = (type(a) == "table") and a.muted or nil,
        phonemeAttrs = phAttrs,                       -- 🆕 A 用：逐音素 position/leftOffset/strength/activity
        dur = durArr,                                 -- 🆕 A 用：SV1 的音素时长比例数组（第 1 项 = 辅音）
        durationQuarter = (call(nt, "getDuration") or 0) / (tonumber(SV and SV.QUARTER) or 705600000),
        rTone = rTone, rIntonation = rInt,
        pitch = call(nt, "getPitch"),
        onsetBlick = call(nt, "getOnset"),
      }
    end
  end
  return { current = true, groupName = call(grp, "getName"), noteCount = n, notes = out,
           hasComputedAttributes = (SV and has(SV, "getComputedAttributesForGroup")) and true or false }
end

-- 🆕 逐音符设**语言覆盖**（**写**；`items[].index` 为**0 起**）。
--   纪律（用户 2026-09-18 裁定）：**只在用户反馈"多语言混杂"时才用**，且**只动少数派**音符 —— 见 playbook §0.6b / §0.6c。
-- args.items = { { index = <0 起>, language = "english" }, ... }；逐个**回读**，不一致就报 failed。
function OPS.set_note_languages(args)
  args = args or {}
  local items = args.items
  if type(items) ~= "table" or #items == 0 then error("args.items required") end
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local n = call(grp, "getNumNotes") or 0
  call(SC("getProject"), "newUndoRecord")
  local applied, failed = {}, {}
  for _, it in ipairs(items) do
    local idx = tonumber(it.index)
    local lang = it.language
    if idx == nil or lang == nil then
      failed[#failed + 1] = { index = idx, reason = "index / language 必填" }
    elseif idx < 0 or idx >= n then
      failed[#failed + 1] = { index = idx, reason = "越界（组内音符数 " .. n .. "）" }
    else
      local nt = call(grp, "getNote", idx + 1)          -- ⚠️ 协议 0 起 ⇒ 宿主 1 起
      if nt == nil then
        failed[#failed + 1] = { index = idx, reason = "getNote 返回 nil" }
      else
        local ok, err = pcall(function() nt:setLanguageOverride(lang) end)
        local back = call(nt, "getLanguageOverride")
        if ok and back == lang then
          applied[#applied + 1] = { index = idx, language = back, lyrics = call(nt, "getLyrics") }
        else
          failed[#failed + 1] = { index = idx, language = lang, readBack = back,
                                  reason = ok and "回读不一致" or tostring(err) }
        end
      end
    end
  end
  return { changed = #applied, applied = applied, failed = failed }
end

-- 🆕 逐音符标**说唱声调**（**写**；`items[].index` 为**0 起**）。
--   用户 2026-09-18 订正：`setRapAccent("1"…"5")` 的 5 档**就是五个声调** —— 1 阴平 · 2 阳平 · 3 上声 · 4 去声 · **5 = 轻声**。
--   用途：用户认为 rap 声调不准时，按歌词声调自动标记（配方见 sv-lyricist/references/说唱词流.md §5.3）。
--   args.items = { { index = <0 起>, accent = "3" }, ... }；逐个回读。
function OPS.set_note_rap_accents(args)
  args = args or {}
  local items = args.items
  if type(items) ~= "table" or #items == 0 then error("args.items required") end
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local n = call(grp, "getNumNotes") or 0
  call(SC("getProject"), "newUndoRecord")
  local applied, failed = {}, {}
  for _, it in ipairs(items) do
    local idx = tonumber(it.index)
    local accent = it.accent
    if accent ~= nil then accent = tostring(accent) end
    if idx == nil or accent == nil or accent == "" then
      failed[#failed + 1] = { index = idx, reason = "index / accent 必填" }
    elseif idx < 0 or idx >= n then
      failed[#failed + 1] = { index = idx, reason = "越界（组内音符数 " .. n .. "）" }
    else
      local nt = call(grp, "getNote", idx + 1)
      if nt == nil then
        failed[#failed + 1] = { index = idx, reason = "getNote 返回 nil" }
      else
        local ok, err = pcall(function() nt:setRapAccent(accent) end)
        local back = call(nt, "getRapAccent")
        if ok and tostring(back) == accent then
          applied[#applied + 1] = { index = idx, accent = accent, lyrics = call(nt, "getLyrics"),
                                    musicalType = call(nt, "getMusicalType") }
        else
          failed[#failed + 1] = { index = idx, accent = accent, readBack = back,
                                  reason = ok and "回读不一致（该音符可能不是 rap / 非普通话）" or tostring(err) }
        end
      end
    end
  end
  return { changed = #applied, applied = applied, failed = failed }
end

-- 🆕 读**整组的实际发音音素串**（**只读**；2026-09-22 为音素替换功能加，桥 0.3.23）
--   为什么需要：`Note#getPhonemes()`（见 get_lyrics_attrs 的 `phonemes` 字段）只返回**手动写死过的**串
--   （没手改过 = 空串），而"替换音素"必须基于**实际发音**（含 T2P 转出来的默认）——
--   参考脚本 `音素替换.js` 用的就是 `SV:getPhonemesForGroup(ref)`。
--   返回：{ ok, current, count, phonemes = { "hh ah ll ow", ... } }（**按组内音符顺序**，0 起对齐 getNote(i)）。
function OPS.get_phonemes(args)
  args = args or {}
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then return { ok = false, current = false, notes = {}, hint = "没有当前组" } end
  if not (SV and has(SV, "getPhonemesForGroup")) then
    return { ok = false, unsupported = true, current = true,
             hint = "本宿主没有 SV.getPhonemesForGroup ⇒ 只能退回 get_lyrics_attrs 的**手动**音素串（phonemes）" }
  end
  local okCall, arr = pcall(function() return SV:getPhonemesForGroup(scope) end)
  if not okCall then return { ok = false, current = true, err = tostring(arr) } end
  if type(arr) ~= "table" then
    return { ok = false, current = true, err = "getPhonemesForGroup 返回的不是表：" .. type(arr) }
  end
  local out = {}
  for i = 1, #arr do out[i] = tostring(arr[i] or "") end
  return { ok = true, current = true, count = #out, phonemes = out }
end

-- 🆕 逐音符设**手动音素**（**写**；`items[].index` 为**0 起**）。用途：说唱**咬字**控制
--   （用户 2026-09-18 提出：rap 快段"糊"、听不清词时，把关键字的音素写死；真机已验证游离音符上 setPhonemes 可写可读回）。
--   语法同 `Note#setPhonemes`：空格分隔的音素串，如 `"hh ah"`；**空串 = 清掉手动音素、回到 T2P 默认**。
--   args.items = { { index = <0 起>, phonemes = "hh ah" }, ... }；逐个回读。
function OPS.set_note_phonemes(args)
  args = args or {}
  local items = args.items
  if type(items) ~= "table" or #items == 0 then error("args.items required") end
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local n = call(grp, "getNumNotes") or 0
  call(SC("getProject"), "newUndoRecord")
  local applied, failed = {}, {}
  for _, it in ipairs(items) do
    local idx = tonumber(it.index)
    local ph = it.phonemes
    if idx == nil or ph == nil then
      failed[#failed + 1] = { index = idx, reason = "index / phonemes 必填" }
    elseif idx < 0 or idx >= n then
      failed[#failed + 1] = { index = idx, reason = "越界（组内音符数 " .. n .. "）" }
    else
      local nt = call(grp, "getNote", idx + 1)
      if nt == nil then
        failed[#failed + 1] = { index = idx, reason = "getNote 返回 nil" }
      else
        local ok, err = pcall(function() nt:setPhonemes(ph) end)
        local back = call(nt, "getPhonemes")
        if ok and tostring(back) == tostring(ph) then
          applied[#applied + 1] = { index = idx, phonemes = back, lyrics = call(nt, "getLyrics") }
        else
          failed[#failed + 1] = { index = idx, phonemes = ph, readBack = back,
                                  reason = ok and "回读不一致（宿主可能不接受该音素串）" or tostring(err) }
        end
      end
    end
  end
  return { changed = #applied, applied = applied, failed = failed }
end

-- 🆕 写**音素属性数组**（SV2；**整数组替换**语义 —— 见 skills/sv-scripting/api/Note.md 第 25 条）。
--   用途：A（"短音符的辅音抢前一个音符"）的定点修 —— 把辅音项的 `leftOffset` **往 0 方向收**。
--   ⚠️ **`leftOffset = 0` ⇒ 提前量归零 ⇒ 辅音消失**（真机听感确认）⇒ 收边要留余量（如 −0.05）。
--   args.items = { { index = <0 起>, phonemes = { {leftOffset=…, position=…, strength=…, activity=…}, ... } }, ... }
function OPS.set_note_phoneme_attrs(args)
  args = args or {}
  local items = args.items
  if type(items) ~= "table" or #items == 0 then error("args.items required") end
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local n = call(grp, "getNumNotes") or 0
  call(SC("getProject"), "newUndoRecord")
  local applied, failed = {}, {}
  for _, it in ipairs(items) do
    local idx = tonumber(it.index)
    local ph = it.phonemes
    if idx == nil or type(ph) ~= "table" then
      failed[#failed + 1] = { index = idx, reason = "index / phonemes(数组) 必填" }
    elseif idx < 0 or idx >= n then
      failed[#failed + 1] = { index = idx, reason = "越界（组内音符数 " .. n .. "）" }
    else
      local nt = call(grp, "getNote", idx + 1)
      if nt == nil then
        failed[#failed + 1] = { index = idx, reason = "getNote 返回 nil" }
      else
        local before = call(nt, "getAttributes")
        local ok, err = pcall(function() nt:setAttributes({ phonemes = ph }) end)
        local after = call(nt, "getAttributes")
        local bp = (type(before) == "table" and type(before.phonemes) == "table") and #before.phonemes or -1
        local ap = (type(after) == "table" and type(after.phonemes) == "table") and #after.phonemes or -1
        if ok and ap >= 0 then
          applied[#applied + 1] = { index = idx, beforeCount = bp, afterCount = ap, lyrics = call(nt, "getLyrics") }
        else
          failed[#failed + 1] = { index = idx, reason = ok and "写入后读不到 phonemes" or tostring(err) }
        end
      end
    end
  end
  return { changed = #applied, applied = applied, failed = failed,
           note = "SV2 的 phonemes 是整数组替换；空项 {} 会被引擎丢掉；效果只能听感验收（不回显到 computed）" }
end

-- 🆕 写**音素时长比例数组 `dur`**（**SV1 专属**；SV2 写了读不回 —— 见 api/Note.md 第 20 条）。
--   用途：A 的 SV1 修法 —— 把**辅音那一项（第 1 项）**按比例压小（用户口径：压到 50%~80%，写小数如 0.5）。
--   args.items = { { index = <0 起>, dur = { 0.5, 1, nil } }, ... }
function OPS.set_note_dur(args)
  args = args or {}
  local items = args.items
  if type(items) ~= "table" or #items == 0 then error("args.items required") end
  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local n = call(grp, "getNumNotes") or 0
  call(SC("getProject"), "newUndoRecord")
  local applied, failed = {}, {}
  for _, it in ipairs(items) do
    local idx = tonumber(it.index)
    local dur = it.dur
    if idx == nil or type(dur) ~= "table" then
      failed[#failed + 1] = { index = idx, reason = "index / dur(数组) 必填" }
    elseif idx < 0 or idx >= n then
      failed[#failed + 1] = { index = idx, reason = "越界（组内音符数 " .. n .. "）" }
    else
      local nt = call(grp, "getNote", idx + 1)
      if nt == nil then
        failed[#failed + 1] = { index = idx, reason = "getNote 返回 nil" }
      else
        local ok, err = pcall(function() nt:setAttributes({ dur = dur }) end)
        local at = call(nt, "getAttributes")
        local back = (type(at) == "table" and type(at.dur) == "table") and at.dur or nil
        if ok and back ~= nil then
          local s = {}
          for j = 1, #back do s[#s + 1] = tostring(back[j]) end
          applied[#applied + 1] = { index = idx, dur = table.concat(s, ","), lyrics = call(nt, "getLyrics") }
        else
          failed[#failed + 1] = { index = idx, reason = ok and "写入后读不到 dur（SV2 不支持；SV1 才有）" or tostring(err) }
        end
      end
    end
  end
  return { changed = #applied, applied = applied, failed = failed,
           note = "dur 是 SV1 专属的比例数组（第 1 项 = 辅音）；SV2 写了读不回" }
end

-- ===== 和弦展开算法（纯函数，可离线单测；移植自 JS 的 svhParseChord 系列）=====
-- 放在一个表里而不是一堆 local：Lua 单个 chunk 的 local 数量有上限（200），
-- 桥已经很长，少占一个 local 就少一分风险。
local ALG = {}
ALG.ROOT = { C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, B = 11 }

function ALG.round(x) return math.floor(x + 0.5) end

function ALG.contains(t, v)
  for i = 1, #t do if t[i] == v then return true end end
  return false
end

function ALG.chordIntervals(rest)
  if rest == "maj" or rest == "M" then return { 0, 4, 7 } end
  if rest == "min" or rest == "m" then return { 0, 3, 7 } end
  if rest == "dim" then return { 0, 3, 6 } end
  if rest == "aug" then return { 0, 4, 8 } end
  if rest == "sus2" then return { 0, 2, 7 } end
  if rest == "sus4" then return { 0, 5, 7 } end
  if rest == "5" then return { 0, 7 } end
  if rest == "7" then return { 0, 4, 7, 10 } end
  if rest == "maj7" then return { 0, 4, 7, 11 } end
  if rest == "m7" or rest == "min7" then return { 0, 3, 7, 10 } end
  if rest == "dim7" then return { 0, 3, 6, 9 } end
  if rest == "m7b5" then return { 0, 3, 6, 10 } end
  if rest == "m6" then return { 0, 3, 7, 9 } end
  if rest == "6" then return { 0, 4, 7, 9 } end
  if rest == "add9" then return { 0, 4, 7, 14 } end
  return { 0, 4, 7 }   -- 默认大三（与 JS 同）
end

-- 解析和弦名 → {rootPc, intervals}；解析失败返回 nil
function ALG.parseChord(name)
  if name == nil or name == "" then return nil end
  local s = tostring(name)
  s = string.gsub(string.gsub(s, "^%s+", ""), "%s+$", "")
  local root = string.sub(s, 1, 1)
  local base = ALG.ROOT[root]
  if base == nil then return nil end
  -- 只认**单个**升降号（与 JS 一致：多个升降号会走"不调整"分支）
  local i, acc = 2, ""
  while i <= #s do
    local c = string.sub(s, i, i)
    if c == "#" or c == "b" then acc = acc .. c; i = i + 1 else break end
  end
  local rootPc = base
  if acc == "#" then
    rootPc = (rootPc + 1) % 12
  elseif acc == "b" then
    rootPc = (rootPc + 11) % 12
  end
  local rest = string.sub(s, i)
  return { rootPc = ((rootPc % 12) + 12) % 12, intervals = ALG.chordIntervals(rest) }
end

-- 取指定音级最接近 ref 的 MIDI 值
function ALG.pitchAtPc(pc, ref)
  local targetPc = ((pc % 12) + 12) % 12
  local base = math.floor(ref / 12) * 12
  local below = base + targetPc - ((targetPc > (ref % 12)) and 12 or 0)
  local above = below + 12
  if math.abs(above - ref) < math.abs(below - ref) then return above end
  return below
end

-- 和弦排列：根音最底，其余在根音上方一个八度内爬升（会自然产生转位）
function ALG.voicing(intervals, rootPc, ref)
  local rootPitch = ALG.pitchAtPc(rootPc, ref)
  local out = {}
  for i = 1, #intervals do
    local rel = intervals[i]
    local targetPc = (rootPc + rel) % 12
    local cand = rootPitch + ((targetPc - (rootPitch % 12) + 12) % 12)
    if cand < rootPitch then cand = cand + 12 end
    while cand > rootPitch + 12 do cand = cand - 12 end
    if not ALG.contains(out, cand) then out[#out + 1] = cand end
  end
  table.sort(out)
  return out
end

-- 和弦段 → 音符数组（每项 {pitch, onsetQuarter, durationQuarter}，与 JS 的数组形式同）
function ALG.chordSegsToNotes(segs, pattern, octaveShift)
  local out = {}
  if type(segs) ~= "table" then return out end
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local ref = 60 + (tonumber(octaveShift) or 0)
  for i = 1, #segs do
    local seg = segs[i]
    local parsed = ALG.parseChord(seg and seg.name)
    if parsed ~= nil then
      local pitches = ALG.voicing(parsed.intervals, parsed.rootPc, ref)
      local startQ = ALG.round((tonumber(seg.startBlick) or 0) / quarter)
      local durQ = math.max(1, ALG.round((tonumber(seg.durationBlick) or 0) / quarter))
      if pattern == "broken" or pattern == "arpeggio" then
        local n = #pitches
        local subQ = math.max(1, math.floor(durQ / n))
        for k = 1, n do
          out[#out + 1] = { pitches[k], startQ + (k - 1) * subQ, subQ }
        end
      else
        for p = 1, #pitches do
          out[#out + 1] = { pitches[p], startQ, durQ }
        end
      end
    end
  end
  return out
end

-- 属性写入：优先 setter 方法，其次直接赋字段（与 prop() 对称）。
-- 例：note.database 的 name/backendType/version 在 JS 侧是**属性**，Lua 侧很可能是 setName 等。
function ALG.setprop(obj, name, value)
  if obj == nil then return false end
  local setter = "set" .. string.upper(string.sub(name, 1, 1)) .. string.sub(name, 2)
  if has(obj, setter) then
    call(obj, setter, value)
    return true
  end
  return pcall(function() obj[name] = value end)
end

-- 与 JS 的 svhOpWriteChords 对齐：{ok, trackIndex, groupName, noteCount, minPitch, maxPitch}
-- args: { notes | chordSegs, groupName?, pattern?, octaveShift?, trackIndex?(0 起), instrument? }
-- ============================================================================
-- 写音符「写哪里」的统一解析（2026-09-25 新增 · 用户 2026-09-25 定）
-- ============================================================================
-- 规则（真机事故驱动：SV1 上生成的旋律被写进了新组，而用户要的是主组）：
--   · **SV1**：主组就是**用户音符所在的容器、可读可写** ⇒ 旋律与伴奏都写主组。
--   · **SV2 / IX**：主组不能 `addNote`（宿主限制）⇒ 只能新建组。
-- 契约（三条建组型 op 共用：`write_chords` / `create_harmony_group` / 走同一 op 的 `write_texture`）：
--   `args.target`      = "auto"(默认) | "main" | "new"
--                        · auto ⇒ 按宿主：SV1 = main，SV2/IX = new
--                        · main ⇒ 强制主组（SV2/IX 上直接报错，不写坏一半）
--                        · new  ⇒ 强制新建具名组（带同名幂等替换，原行为）
--   `args.allowAppend` = 主组**非空**时必须显式 true；否则返回
--                        `{ok=false, needConfirm=true, existingNoteCount, endQuarter, hint}`
--                        —— 主组里有用户的音符时**绝不悄悄追加/覆盖**，由调用方先问用户再带 true 重试。
-- 返回：mode("main"|"new") · group(主组对象，mode=main 时) · existing · endQuarter(拍)
local function resolveWriteTarget(args, track)
  local want = tostring((args and args.target) or "auto")
  if want == "auto" then want = ST.isSV2 and "new" or "main" end
  if want ~= "main" and want ~= "new" then
    error("args.target 只能是 auto / main / new（收到：" .. want .. "）")
  end
  if want == "new" then return "new", nil, 0, nil end
  if ST.isSV2 then
    error("本宿主（" .. ((ST.host == "ix") and "Instrument X" or "SV2")
      .. "）的主组不能 addNote ⇒ 请用 target=\"new\"（或省略，默认就是新建组）")
  end
  local mainRef = track and call(track, "getMainReference") or nil
  local grp = mainRef and call(mainRef, "getTarget") or nil
  if grp == nil then error("拿不到主组（getMainReference / getTarget 失败）") end
  local n = call(grp, "getNumNotes") or 0
  local endQ = 0
  for i = 1, n do
    local nt = call(grp, "getNote", i)
    if nt ~= nil then
      local o = call(nt, "getOnset") or 0
      local d = call(nt, "getDuration") or 0
      local e = (o + d) / 705600000
      if e > endQ then endQ = e end
    end
  end
  return "main", grp, n, endQ
end

-- 主组非空且未显式 allowAppend ⇒ 统一的"先问用户"回执（**一个字节都不写**）
local function needConfirmResult(args, existing, endQ)
  if existing == nil or existing <= 0 or (args and args.allowAppend == true) then return nil end
  return {
    ok = false, needConfirm = true, target = "main",
    existingNoteCount = existing, endQuarter = endQ,
    hint = "主组（SV1 上就是用户音符所在的那个组）里已有 " .. tostring(existing) .. " 个音符（末尾约第 "
      .. string.format("%.2f", endQ) .. " 拍）⇒ 先问用户：① 追加到末尾 ② 从指定小节起写 ③ 还是新建组；"
      .. "确认后再带 allowAppend=true 调一次（不会覆盖，但可能与时值重叠，重叠会在 layout 里报出来）。",
  }
end

function OPS.write_chords(args)
  args = args or {}
  local groupName = args.groupName and tostring(args.groupName) or "Chords"
  local pattern = args.pattern and tostring(args.pattern) or "block"
  local octaveShift = tonumber(args.octaveShift)
  if octaveShift == nil then octaveShift = -12 end

  local notesIn = {}
  if type(args.chordSegs) == "table" and #args.chordSegs > 0 then
    notesIn = ALG.chordSegsToNotes(args.chordSegs, pattern, octaveShift)
  elseif type(args.notes) == "table" then
    notesIn = args.notes
  end
  if #notesIn == 0 then error("args.notes or args.chordSegs required (non-empty)") end

  local proj = SC("getProject")
  local ntracks = call(proj, "getNumTracks") or 0
  local targetTrack = -1
  if args.trackIndex ~= nil then
    targetTrack = tonumber(args.trackIndex) or -1
  else
    -- 第一个"没有任何 instrumental 组"的轨道
    for t = 1, ntracks do
      local trCand = call(proj, "getTrack", t)
      local gg = trCand and (call(trCand, "getNumGroups") or 0) or 0
      local isAud = false
      for k = 1, gg do
        local rr = call(trCand, "getGroupReference", k)
        if rr ~= nil and call(rr, "isInstrumental") == true then isAud = true; break end
      end
      if not isAud then targetTrack = t - 1; break end     -- 换回 0 起（协议）
    end
  end
  if targetTrack < 0 or targetTrack >= ntracks then
    error("no writable track found (trackIndex=" .. tostring(targetTrack) .. ")")
  end
  local track = call(proj, "getTrack", targetTrack + 1)
  if track == nil then error("getTrack 失败：0 起索引 " .. tostring(targetTrack)) end

  -- 🆕 2026-09-25：先定"写哪里"（SV1 默认写主组），**再**动工程
  local mode, mainGroup, existingMain, endQMain = resolveWriteTarget(args, track)
  local confirm = needConfirmResult(args, existingMain, endQMain)
  if confirm ~= nil then return confirm end

  call(proj, "newUndoRecord")

  local group = nil
  if mode == "main" then
    group = mainGroup                    -- 直接写主组：不建新组、不加组引用
  else
    -- 幂等：先摘掉目标轨上同名的旧组引用（**倒序**删，避免下标位移）
    local ng = call(track, "getNumGroups") or 0
    for gi = ng, 1, -1 do
      local refGi = call(track, "getGroupReference", gi)
      local tg = refGi and call(refGi, "getTarget") or nil
      if tg ~= nil and call(tg, "getName") == groupName then
        call(track, "removeGroupReference", gi)
      end
    end

    group = SC("create", "NoteGroup")
    if group == nil then error("SV:create('NoteGroup') 不可用") end
    call(group, "setName", groupName)
  end
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local minP, maxP = nil, nil
  for i = 1, #notesIn do
    local src = notesIn[i]
    local pitch, onsetB, durB, lyr = nil, nil, nil, nil
    local isArr = (type(src) == "table") and (src[1] ~= nil)
    if isArr then
      -- [[pitch, onsetQuarter, durationQuarter]]
      pitch = tonumber(src[1])
      onsetB = (tonumber(src[2]) or 0) * quarter
      durB = (tonumber(src[3]) or 1) * quarter
    elseif type(src) == "table" then
      pitch = tonumber(src.pitch)
      local ob = src.onsetBlicks
      if ob == nil then ob = src.onset end
      local db = src.durationBlicks
      if db == nil then db = src.duration end
      onsetB = tonumber(ob) or 0
      durB = tonumber(db) or quarter
      if src.lyrics ~= nil then lyr = tostring(src.lyrics) end
    end
    if pitch ~= nil then
      if minP == nil or pitch < minP then minP = pitch end
      if maxP == nil or pitch > maxP then maxP = pitch end
      local note = SC("create", "Note")
      call(note, "setPitch", pitch)
      call(note, "setTimeRange", onsetB, durB)
      if lyr ~= nil and lyr ~= "" then call(note, "setLyrics", lyr) end
      -- IX 演奏属性（可选，失败不影响写入）
      if not isArr and type(src) == "table" then
        if src.dynamic ~= nil then
          if has(note, "setDynamic") then
            call(note, "setDynamic", tonumber(src.dynamic))
          elseif has(note, "setAttributes") then
            call(note, "setAttributes", { dynamic = tonumber(src.dynamic) })
          end
        end
        if type(src.articulations) == "table" and #src.articulations > 0 then
          if has(note, "setArticulations") then
            call(note, "setArticulations", src.articulations)
          elseif has(note, "setAttributes") then
            call(note, "setAttributes", { articulations = src.articulations, articulationsFixed = true })
          end
        end
      end
      call(group, "addNote", note)
    end
  end

  -- 只有"新建组"这条路才需要把组加进库 + 造组引用挂到轨道；写主组时主组本来就在轨上
  if mode ~= "main" then
    call(proj, "addNoteGroup", group)      -- 省略 suggestedIndex（同 create_harmony_group 的理由）
    local ref = SC("create", "NoteGroupReference")
    if ref == nil then error("SV:create('NoteGroupReference') 不可用") end
    call(ref, "setTarget", group)
    call(ref, "setTimeOffset", 0)          -- 位置统一由音符 onset 表达
    call(track, "addGroupReference", ref)
  end

  -- 乐器 database（可选）
  if type(args.instrument) == "table" then
    local mainRef = call(track, "getMainReference")
    local db = mainRef and call(mainRef, "getDatabase") or nil
    if db ~= nil then
      ALG.setprop(db, "name", tostring(args.instrument.name or ""))
      ALG.setprop(db, "backendType", tostring(args.instrument.backendType or "W"))
      ALG.setprop(db, "version", tostring(args.instrument.version or "100"))
    end
  end

  return {
    ok = true, trackIndex = targetTrack, target = mode,
    groupName = call(group, "getName"),
    noteCount = call(group, "getNumNotes"), written = #notesIn,
    appendedToMain = (mode == "main") and ((existingMain or 0) > 0),
    existingNoteCountBefore = (mode == "main") and existingMain or nil,
    minPitch = minP, maxPitch = maxP,
    layout = LAYOUT.scan(group),     -- 🆕 P7 ③：重叠=违规（必须报）· 缝隙=允许但告知（消缝需用户同意）
  }
end

-- ===== 自管理：让桥"自杀"，好让下一次运行加载到新文件 =====
-- 背景（2026-09-12 实测）：Lua 桥一旦运行就常驻；在 SV 里再点一次"运行"**不会**替换旧实例
-- （旧实例 09:07 起一直活着，09:19 那次"运行"没有产生新 boot）⇒ "改了不生效"。
-- 之前只能靠重启 SV 才能换版本；有了这个 op 就能：`raw stop` → 等提示 → 在 SV 里重新运行。
function OPS.stop(args)
  local delay = tonumber(args and args.delayMs) or 400
  -- ⚠️ 必须**先把响应写出去**再结束脚本，否则客户端永远等不到回复。
  local scheduled = pcall(function()
    SV:setTimeout(delay, function()
      pcall(function() SV:finish() end)
    end)
  end)
  return {
    ok = true, bridge = CFG.VERSION, finishInMs = delay, scheduled = scheduled,
    note = "桥将在约 " .. tostring(delay) .. "ms 后结束；请在 SV 里重新运行 AKDAgentBridge.lua 以加载新版本"
  }
end

-- ===== 音频轨对齐 / 浮动 BPM 打标（写；分析在 Node 侧做，桥只写）=====

-- 与 JS 的 svhOpAlignAudio 对齐。
-- args: { firstBeatSec, anchor='measure'|'note', measure?, shiftBeats?, introBeats?/introSec?, bpm?,
--         audioTrackIndex?(0 起) }
-- 位置约定：音频轨用**绝对 onset** 表达（setTimeRange），time offset 恒 0。
function OPS.align_audio(args)
  args = args or {}
  local firstBeatSec = tonumber(args.firstBeatSec)
  if firstBeatSec == nil then
    error("args.firstBeatSec required (seconds of first beat in the audio)")
  end
  local anchor = args.anchor and tostring(args.anchor) or "measure"
  local proj = SC("getProject")
  local ta = call(proj, "getTimeAxis")
  if ta == nil then error("no time axis") end

  local targetBlick, anchorDesc
  if anchor == "note" then
    local scope = call(SC("getMainEditor"), "getCurrentGroup")
    if scope == nil then error("no current group (anchor='note' needs existing notes)") end
    local grp = call(scope, "getTarget")
    if grp == nil or (call(grp, "getNumNotes") or 0) < 1 then
      error("current group has no notes (anchor='note')")
    end
    local n1 = call(grp, "getNote", 1)
    local anchorOnset = (call(n1, "getOnset") or 0) + (call(scope, "getTimeOffset") or 0)
    local introBeats = tonumber(args.introBeats)
    local introSec = tonumber(args.introSec)
    local introBlick = 0
    if introBeats ~= nil and introBeats > 0 then
      local bpmForIntro = tonumber(args.bpm) or 120
      local beatBlick = call(ta, "getBlickFromSeconds", 60 / bpmForIntro) or 0
      introBlick = ALG.round(introBeats * beatBlick)
    elseif introSec ~= nil and introSec > 0 then
      introBlick = ALG.round(call(ta, "getBlickFromSeconds", introSec) or 0)
    end
    targetBlick = anchorOnset - introBlick
    anchorDesc = {
      anchor = "note", anchorNoteOnsetBlick = anchorOnset, introBlick = introBlick,
      introBeats = introBeats, introSec = introSec, noteCount = call(grp, "getNumNotes")
    }
  else
    local measure = tonumber(args.measure) or 1
    if measure < 1 then error("args.measure must be >= 1") end
    local mark = call(ta, "getMeasureMarkAt", measure)   -- 收的是**小节号**，不是 blick
    if mark == nil then error("measure not found: " .. tostring(measure)) end
    local markBlick = prop(mark, "positionBlick")
    if type(markBlick) ~= "number" then error("measure mark 缺 positionBlick") end
    targetBlick = markBlick
    local shiftBeats = tonumber(args.shiftBeats)
    if shiftBeats ~= nil and shiftBeats ~= 0 then
      local bpmShift = tonumber(args.bpm) or 120
      local beatBlickShift = call(ta, "getBlickFromSeconds", 60 / bpmShift) or 0
      targetBlick = targetBlick + ALG.round(shiftBeats * beatBlickShift)
    end
    anchorDesc = { anchor = "measure", measure = measure, measureStartBlick = markBlick, shiftBeats = shiftBeats }
  end

  -- 找音频轨（isInstrumental 的组引用）
  local foundRef, foundTrack, foundGroup = nil, -1, -1
  local ntracks = call(proj, "getNumTracks") or 0
  local wantAudio = tonumber(args.audioTrackIndex)
  for t = 1, ntracks do
    local track = call(proj, "getTrack", t)
    local ng = track and (call(track, "getNumGroups") or 0) or 0
    for g = 1, ng do
      local ref = call(track, "getGroupReference", g)
      if ref ~= nil and call(ref, "isInstrumental") == true then
        if wantAudio == nil or (t - 1) == wantAudio then
          foundRef, foundTrack, foundGroup = ref, t - 1, g - 1
          break
        end
      end
    end
    if foundRef ~= nil then break end
  end
  if foundRef == nil then error("no instrumental (audio) track found") end

  call(proj, "newUndoRecord")
  local firstBeatBlick = call(ta, "getBlickFromSeconds", firstBeatSec) or 0
  local absoluteOnset = targetBlick - firstBeatBlick
  local audioDuration = call(foundRef, "getDuration") or 0
  -- 宿主支持 setTimeRange（2.1.0+ / IX）就写绝对 onset；否则退回 setTimeOffset（兼容模式）
  local useOnset = has(foundRef, "setTimeRange")
  if useOnset then
    call(foundRef, "setTimeRange", absoluteOnset, audioDuration)
  else
    call(foundRef, "setTimeOffset", absoluteOnset)
  end

  local bpmArg = tonumber(args.bpm)
  if bpmArg ~= nil and bpmArg > 0 then
    call(ta, "addTempoMark", targetBlick, bpmArg)
  end

  local res = {
    ok = true, trackIndex = foundTrack, groupIndex = foundGroup,
    firstBeatSec = firstBeatSec, firstBeatBlick = firstBeatBlick,
    absoluteOnsetBlicks = absoluteOnset, useOnset = useOnset,
    durationBlicks = audioDuration, setTempo = bpmArg
  }
  for k, v in pairs(anchorDesc) do res[k] = v end
  return res
end

-- 与 JS 的 svhOpApplyTempo 对齐：{ok, count, first, last, applied}
-- args: { tempoMarks: [{blick|seconds, bpm}], clearExisting? }
-- ⚠️ 只认 getAllTempoMarks()（无索引、无猜测）：若宿主没这个方法，clearExisting 会**什么都不做**，
--    并在返回里报 clearedExisting=0 + warning —— 宁可少清，也不靠"猜索引"去删标（删错会改坏工程）。
function OPS.apply_tempo(args)
  args = args or {}
  local marks = args.tempoMarks
  if type(marks) ~= "table" or #marks == 0 then
    error("args.tempoMarks required (non-empty array of {blick|seconds, bpm})")
  end
  local proj = SC("getProject")
  local ta = call(proj, "getTimeAxis")
  if ta == nil then error("no time axis") end

  call(proj, "newUndoRecord")
  local cleared, clearWarn = 0, nil
  local removedSnapshot = {}     -- 🆕 P7 ①：clearExisting 删掉的标**原样带回**（可据此恢复，别再"静默清空"）
  if args.clearExisting then
    local old = call(ta, "getAllTempoMarks")
    if type(old) == "table" then
      for i = 1, #old do
        local pos = prop(old[i], "position")
        if type(pos) ~= "number" then pos = prop(old[i], "positionBlick") end
        if type(pos) == "number" then
          removedSnapshot[#removedSnapshot + 1] = { blick = pos, bpm = tonumber(prop(old[i], "bpm")) }
          call(ta, "removeTempoMark", pos)
          cleared = cleared + 1
        end
      end
    else
      clearWarn = "宿主没有 getAllTempoMarks()，clearExisting 未生效（避免猜索引删标）"
    end
  end

  local applied = {}
  for j = 1, #marks do
    local mk = marks[j] or {}
    local bpm = tonumber(mk.bpm)
    local blick = tonumber(mk.blick)
    if blick == nil and mk.seconds ~= nil then
      local s = tonumber(mk.seconds)
      if s ~= nil then blick = ALG.round(call(ta, "getBlickFromSeconds", s) or 0) end
    end
    if blick == nil or bpm == nil or bpm <= 0 then
      error("bad tempoMark (need blick or seconds, and bpm>0) at index " .. tostring(j - 1))
    end
    -- ⚠️ **tempo-mark-no-update（真机记录）**：`TimeAxis.addTempoMark` **不会更新同位置已有的标**
    --    （官方文档说会更新，实测不更新）⇒ 必须先删同位置再写，否则"改了 BPM 却没生效"。
    pcall(function() ta:removeTempoMark(blick) end)
    call(ta, "addTempoMark", blick, bpm)
    applied[#applied + 1] = { blick = blick, bpm = bpm }
  end
  return {
    ok = true, count = #applied, first = applied[1], last = applied[#applied],
    applied = applied, clearedExisting = cleared, clearWarning = clearWarn,
    -- 🆕 P7 ①：被删的标**原样带回**（`removedMarks`），需要时可用 `apply_tempo` 把它们写回去
    removedMarks = (#removedSnapshot > 0) and removedSnapshot or nil,
    snapshotNote = (#removedSnapshot > 0)
      and "clearExisting 已删除上面 removedMarks 里的标 —— 想恢复就用 apply_tempo(tempoMarks=removedMarks) 写回（原标已无，故不会再删）"
      or nil,
  }
end

-- ===== 重音检测（07 文档 §1 的移植；write_pit plan="accent" 用）=====
-- 规范：skills/sv-scripting/workflows/07-melody-accent-pitch-params.md
--   §1.4 分组：'-'/空 歌词的音符按 graceRatio 并入前一单元（倚音）或独立成单元（转音）
--   §1.5 歌词语义：只维护**虚词表**，命中=轻(0)，未命中=实词=重(+1)
--   §1.6 打分：强拍 + 时值 + 音高跳进 + 语义；重音邻位轻微降权(−0.6)
-- ⚠️ 命名差异：单元用 `endB` 存结束 blick（Lua 里 `end` 是关键字，不能作字段名）。
local ACC = {}

ACC.WEAK_WORDS = {}
do
  local zh = { "的","了","在","是","和","吧","呢","吗","啊","呀","哦","着","过","地","得","把","被",
               "向","跟","从","对","于","之","而","或","与","就","都","也","还","又" }
  local ja = { "の","は","を","に","が","と","で","も","へ","や","か","ね","よ" }
  local en = { "a","the","an","of","to","in","on","at","and","or","but","is","are","was","were","be",
               "been","it","that","this","with","for","by","as","from" }
  for _, t in ipairs({ zh, ja, en }) do
    for _, w in ipairs(t) do ACC.WEAK_WORDS[w] = true end
  end
end

-- 权重切分集与 JS 的 svhAccentLyricWeight 同集：/[\s\-_,，。、]+/
-- ⚠️ 同样不能用 Lua 字符类：中文标点会把后继字节混进否定集 ⇒「着」=E7 9D 80、「和」=E5 92 8C
--    这类**虚词**会被切碎、匹配不上 WEAK_WORDS 而误判成实词（重音打分跟着偏）。
ACC.WEIGHT_SEP = cpSet(LYRIC_WS, { 45, 95, 44, 65292, 12290, 12289 })

-- 实词 +1 / 虚词 0（与 JS 的 svhAccentLyricWeight 同）
function ACC.lyricWeight(lyric)
  if lyric == nil then return 0 end
  local w = string.lower(string.gsub(string.gsub(tostring(lyric), "^%s+", ""), "%s+$", ""))
  if w == "" then return 0 end
  local v = 0
  local toks = splitByCodePoints(w, ACC.WEIGHT_SEP)
  for i = 1, #toks do
    if toks[i] ~= "" then
      if ACC.WEAK_WORDS[toks[i]] then v = math.min(v, 0) else v = math.max(v, 1) end
    end
  end
  return v
end

-- 拍号分子（强拍判断用）；取不到按 4/4
-- ⚠️ 这里传的是 **blick** ⇒ 必须用 getMeasureMarkAtBlick。
--    用 getMeasureMarkAt(小节号) 会取不到 ⇒ 静默回落 4/4 ⇒ 非 4/4 的曲子重音全算错（踩过）。
function ACC.beatsPerBar(ta, blick)
  if ta == nil then return 4 end
  local m = call(ta, "getMeasureMarkAtBlick", blick or 0)
  if m ~= nil then
    local num = prop(m, "numerator")
    if tonumber(num) ~= nil then return tonumber(num) end
  end
  return 4
end

-- 按 §1.4 把音符分组成"单元"
function ACC.groupUnits(notesArr, graceRatio)
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local units, cur = {}, nil
  local function newUnit(n, onset, dur, idx)
    return {
      start = onset, endB = onset + dur, onset = onset,
      pitch = call(n, "getPitch"), notes = { n }, index = idx, grace = false
    }
  end
  for i = 1, #notesArr do
    local n = notesArr[i]
    local ly = tostring(call(n, "getLyrics") or "")
    local isDash = (ly == "-" or ly == "" or ly == "- ")
    local onset = call(n, "getOnset") or 0
    local dur = call(n, "getDuration") or 0
    if (not isDash) or cur == nil then
      cur = newUnit(n, onset, dur, i - 1)
      units[#units + 1] = cur
    else
      local main = cur.notes[1]
      local mainBeats = (call(main, "getDuration") or 0) / quarter
      local dBeats = dur / quarter
      if mainBeats > 0 and dBeats <= mainBeats * graceRatio then
        cur.endB = onset + dur          -- 倚音：并入前一单元
        cur.notes[#cur.notes + 1] = n
        cur.grace = true
      else
        cur = newUnit(n, onset, dur, i - 1)   -- 转音：独立成单元
        units[#units + 1] = cur
      end
    end
  end
  return units
end

-- 打分（07 §1.6）
function ACC.score(unit, beatsPerBar, prevUnit, opts)
  opts = opts or {}
  local longBeats = tonumber(opts.longNoteBeats) or 1.5
  local longW = tonumber(opts.longNoteWeight) or 2
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local bpb = tonumber(beatsPerBar) or 4
  local s = 0
  local beatInBar = (unit.onset / quarter) % bpb
  local half = math.floor(bpb / 2)
  if beatInBar < 0.001 then
    s = s + 3                                  -- 首拍最强
  elseif half > 0 and math.abs(beatInBar - half) < 0.001 then
    s = s + 2                                  -- 次强
  end
  local durBeats = (unit.endB - unit.start) / quarter
  if durBeats >= longBeats then s = s + longW end
  if durBeats >= longBeats * 8 / 3 then s = s + longW end
  if prevUnit ~= nil then
    local jump = math.abs((unit.pitch or 0) - (prevUnit.pitch or 0))
    if jump >= 4 then s = s + 1 end            -- 大跳
    if jump >= 7 then s = s + 1 end            -- 特大跳
  end
  local mainNote = unit.notes[1]
  s = s + ACC.lyricWeight(mainNote and call(mainNote, "getLyrics") or "")
  return s
end

-- 打分 + 邻位降权 → [{unit, score}]（绝对阈值模式）
function ACC.pick(units, beatsPerBar, threshold, opts)
  local scores = {}
  for i = 1, #units do
    scores[i] = ACC.score(units[i], beatsPerBar, (i > 1) and units[i - 1] or nil, opts)
  end
  for a = 1, #units do
    if scores[a] >= threshold then
      for _, d in ipairs({ -1, 1 }) do          -- 与 JS 的 d=-1→1 同序
        local nb = a + d
        if nb >= 1 and nb <= #units and scores[nb] >= threshold - 1 then
          scores[nb] = scores[nb] - 0.6
        end
      end
    end
  end
  local acc = {}
  for k = 1, #units do
    if scores[k] >= threshold then
      acc[#acc + 1] = { unit = units[k], score = scores[k] }
    end
  end
  return acc
end

-- 按**目标比例**取 Top-N（比绝对阈值稳：分数是整数档，阈值很难精确命中占比）
function ACC.pickTop(units, beatsPerBar, targetRatio, opts)
  local scored = {}
  for i = 1, #units do
    scored[i] = {
      unit = units[i], idx = i - 1,
      score = ACC.score(units[i], beatsPerBar, (i > 1) and units[i - 1] or nil, opts)
    }
  end
  table.sort(scored, function(a, b)
    if a.score ~= b.score then return a.score > b.score end
    return a.idx < b.idx                      -- 同分按出现顺序，保证结果可复现
  end)
  local n = ALG.round(#scored * targetRatio)
  if n < 1 then n = 1 end
  if n > #scored then n = #scored end
  local cut = (n > 0) and scored[n].score or 0
  -- 截断处的**并列数**：同分单元被切开属任意取舍 ⇒ 报告出来供判断
  local cutLo, cutHi = n, n
  while cutLo > 1 and scored[cutLo - 1].score == cut do cutLo = cutLo - 1 end
  while cutHi + 1 <= #scored and scored[cutHi + 1].score == cut do cutHi = cutHi + 1 end
  local picked = {}
  for i = 1, n do picked[i] = scored[i] end
  return {
    picked = picked, cutoffScore = cut,
    tiedAtCutoff = cutHi - cutLo + 1, takenAtCutoff = n - cutLo + 1
  }
end

-- ===== 音高线（Pit）参数与曲线（移植自 JS 的 svhPit* 系列）=====
-- 实现规范：skills/sv-scripting/workflows/08-pit-drawing.md
--   §2.3 九段控制点（基准算法）· §4 方向修正层 · §5 取值优先级
--   §6.2 音头方向 = 旋律进行方向 · §6.3 颤音 · §6.4 音尾 · §6.3⑥ 彩蛋
local PIT = {}

PIT.DEFAULTS = {
  tF0Offset = 0, tF0Left = 0.07, tF0Right = 0.07,
  dF0Left = 0.15, dF0Right = 0.15,
  tF0VbrStart = 0.25, tF0VbrLeft = 0.2, tF0VbrRight = 0.2,
  dF0Vbr = 1, fF0Vbr = 5.5, pF0Vbr = 0
}
PIT.KEYS = { "tF0Offset", "tF0Left", "tF0Right", "dF0Left", "dF0Right",
             "tF0VbrStart", "tF0VbrLeft", "tF0VbrRight", "dF0Vbr", "fF0Vbr", "pF0Vbr" }
PIT.STEP = 15000000        -- 采样步长（blick）
PIT.MAXPTS = 1600          -- 单条曲线点数上限
PIT.EGG_WORDS = { "C47", "C047", "震撼哭腔" }
PIT.EGG_PRESET = { dF0Vbr = 2, fF0Vbr = 10, tF0VbrStart = 0 }

-- 「是个可用的数」：非 nil 且不是 NaN（JS 用 !isNaN(Number(v))，Lua 里 NaN ~= NaN）
local function numOrNil(v)
  local n = tonumber(v)
  if n == nil then return nil end
  if n ~= n then return nil end
  return n
end

-- §5 优先级①：本音符自己的值（SV1 在 attributes；SV2 在 ScriptData）
function PIT.ownParam(note, key)
  if note == nil then return nil end
  local a = call(note, "getAttributes")
  if type(a) == "table" then
    local v = numOrNil(a[key])
    if v ~= nil then return v end
  end
  local sd = numOrNil(call(note, "getScriptData", key))
  if sd ~= nil then return sd end
  return nil
end

-- §5 优先级：override → 本音符 → 组引用的 getVoice() → 脚本默认值
function PIT.resolve(note, ref, key, override)
  if type(override) == "table" then
    local v = numOrNil(override[key])
    if v ~= nil then return v end
  end
  local own = PIT.ownParam(note, key)
  if own ~= nil then return own end
  if ref ~= nil then
    local voice = call(ref, "getVoice")
    if type(voice) == "table" then
      local v = numOrNil(voice[key])
      if v ~= nil then return v end
    end
  end
  return PIT.DEFAULTS[key]
end

function PIT.allParams(note, ref, override)
  local p = {}
  for i = 1, #PIT.KEYS do
    local k = PIT.KEYS[i]
    p[k] = PIT.resolve(note, ref, k, override)
  end
  return p
end

-- ---------- 方向规则（§4 修正层 + §6.2 / §6.4）----------
function PIT.dirLeft(curPitch, prevPitch, dF0Left)
  -- 音头：过冲方向 = 旋律进行方向（上行→+1；下行/同音→−1，同音默认「下」）
  local base
  if prevPitch == nil then base = -1 else base = (curPitch > prevPitch) and 1 or -1 end
  return (dF0Left < 0) and -base or base
end

function PIT.dirRight(curPitch, nextPitch, dF0Right)
  -- 音尾：后音高→下；后音低/相同→上；句尾无后音→默认「上」
  local base
  if nextPitch == nil then base = 1
  elseif nextPitch > curPitch then base = -1
  else base = 1 end
  return (dF0Right < 0) and -base or base
end

-- ---------- 分段余弦插值（§2.3）----------
function PIT.seg(pts, t)
  if type(pts) ~= "table" or #pts < 2 then return 0 end
  if t <= pts[1][1] then return pts[1][2] end
  local last = #pts
  if t >= pts[last][1] then return pts[last][2] end
  for i = 1, #pts - 1 do
    local x0, y0 = pts[i][1], pts[i][2]
    local x1, y1 = pts[i + 1][1], pts[i + 1][2]
    if t >= x0 and t <= x1 then
      if x1 == x0 then return y1 end
      local w = (t - x0) / (x1 - x0)
      local mu = (1 - math.cos(w * math.pi)) / 2     -- 缓入缓出
      return y0 * (1 - mu) + y1 * mu
    end
  end
  return 0
end

-- ---------- 颤音（§2.3 + §6.3）----------
-- 用等价正弦替代 §2.3 的 4 点离散采样（SV2 侧要求平滑），保留 dVbr 峰峰值语义与相位取负
function PIT.vib(t, vs, ve, vL, vR, dVbr, fVbr, pVbr)
  if t < vs or t > ve then return 0 end
  if not (fVbr > 0) then return 0 end
  local amp = dVbr / 2
  local ph = -(pVbr or 0) * math.pi
  local v = amp * math.sin(2 * math.pi * fVbr * (t - vs) + ph)
  local f = 1
  if vL > 0 and t < vs + vL then f = f * (t - vs) / vL end   -- 淡入
  if vR > 0 and t > ve - vR then f = f * (ve - t) / vR end   -- 淡出
  return v * f
end

-- ---------- 参数覆盖合并：base 为底，top 覆盖其上 ----------
function PIT.merge(base, top)
  local o = {}
  if type(base) == "table" then
    for k, v in pairs(base) do o[k] = v end
  end
  if type(top) == "table" then
    for k, v in pairs(top) do o[k] = v end
  end
  return o
end

-- ---------- 彩蛋触发（§6.3⑥；C47 / C047 / 震撼哭腔，不强制带括号）----------
function PIT.eggRequested(args)
  if type(args) ~= "table" then return false end
  if args.egg == true then return true end
  local txt = args.text or args.prompt or args.eggText or ""
  if type(txt) ~= "string" or txt == "" then return false end
  for i = 1, #PIT.EGG_WORDS do
    if string.find(txt, PIT.EGG_WORDS[i], 1, true) ~= nil then return true end
  end
  return false
end

-- ---------- SV1 判定：attributes 带 tF0*/dF0* 字段 ----------
function PIT.isSv1(note)
  local a = call(note, "getAttributes")
  if type(a) ~= "table" then return false end
  return (a.tF0Left ~= nil) or (a.dF0Left ~= nil) or (a.tF0Offset ~= nil)
end

-- ---------- P23 ②③（2026-09-22）：曲线指纹 ----------
-- 用途见 `OPS.write_pit` 里的「交界一致性自检」注释：判断"邻音的曲线是不是**旧快照**"。
-- 指纹 = 该音 ±2 的**几何**（onset/end/音高/音头音尾时长）+ 各自**生效参数**的序列化 ——
--   这两项正是 `PIT.levelAt(sec, S_all) − 本音音高 + PIT.bumpsAt(sec, bumpSlice)` 的**全部输入**
--   ⇒ 指纹相同 ⇒ 重叠区取值相同（这是"两条线有没有间距"的判据）。
PIT.FP_TAG = "akdagentCurveFp"
function PIT.geomKey(S, i0, i1)
  local t = {}
  for i = i0, i1 do
    local s = S[i]
    if s == nil then
      t[#t + 1] = "-"
    else
      t[#t + 1] = string.format("%.4f/%.4f/%d/%.4f/%.4f", s.O, s.E, s.P, s.tFL or 0, s.tFR or 0)
    end
  end
  return table.concat(t, ";")
end
function PIT.paramKey(p)
  if type(p) ~= "table" then return "-" end
  local ks = {}
  for k, v in pairs(p) do
    local num = tonumber(v)
    if num ~= nil then ks[#ks + 1] = tostring(k) .. "=" .. string.format("%.4f", num) end
  end
  table.sort(ks)
  return table.concat(ks, ",")
end

-- ---------- 全局音高轮廓（解决"相邻曲线重叠冲突"）----------
-- 点值 = 全局轮廓 − 本音音高 ⇒ 重叠区两条曲线数值一致，SV2 无论怎么合并都不冲突
function PIT.levelAt(t, S)
  local n = #S
  if n == 0 then return 60 end
  if t <= S[1].O then return S[1].P end
  local function ramp(pa, pb, u)
    if u < 0 then u = 0 end
    if u > 1 then u = 1 end
    return pa + (pb - pa) * (1 - math.cos(u * math.pi)) / 2
  end
  for i = 1, n do
    local s = S[i]
    local prev = (i > 1) and S[i - 1] or nil
    local nxt = (i + 1 <= n) and S[i + 1] or nil
    if t >= s.O then
      -- ① 入口过渡窗：[prev.E − 0.5·tFR_prev, s.O + 0.5·tFL_s]
      if prev ~= nil then
        local bIn = s.O + 0.5 * s.tFL
        if t < bIn then
          local aIn = prev.E - 0.5 * prev.tFR
          local dIn = bIn - aIn
          if dIn <= 1e-6 then return s.P end
          return ramp(prev.P, s.P, (t - aIn) / dIn)
        end
      end
      -- ② 出口过渡窗（**必须同时有上界**，否则 t 超过窗尾会被永久吞掉）
      if nxt ~= nil then
        local aOut = s.E - 0.5 * s.tFR
        local bOut = nxt.O + 0.5 * nxt.tFL
        if t >= aOut and t <= bOut then
          local dOut = bOut - aOut
          if dOut <= 1e-6 then return nxt.P end
          return ramp(s.P, nxt.P, (t - aOut) / dOut)
        end
      end
      -- ③ 本音平台
      if t < s.E then return s.P end
    end
  end
  return S[n].P
end

function PIT.bumpsAt(t, ctxSlice)
  local s = 0
  for i = 1, #ctxSlice do
    local c = ctxSlice[i]
    for j = 1, #c.segs do s = s + PIT.seg(c.segs[j], t) end
    local v = c.vib
    s = s + PIT.vib(t, v[1], v[2], v[3], v[4], v[5], v[6], v[7])
  end
  return s
end

-- ---------- 生成一条音符的九段曲线（§2.3 + §4 方向修正）----------
-- ref：NoteGroupReference（取 getVoice 用）；ta：TimeAxis（秒⇄blick）
function PIT.buildCurve(ref, notes, idx, ta, override, egg)
  local note = notes[idx]
  if note == nil then return nil end
  local O = call(ta, "getSecondsFromBlick", call(note, "getOnset"))
  local E = call(ta, "getSecondsFromBlick", call(note, "getEnd"))
  local P = call(note, "getPitch")
  local prev = (idx > 1) and notes[idx - 1] or nil
  local nxt = (idx + 1 <= #notes) and notes[idx + 1] or nil
  local pP = prev and call(prev, "getPitch") or nil
  local nP = nxt and call(nxt, "getPitch") or nil
  local notefront = (prev ~= nil) and (call(prev, "getEnd") == call(note, "getOnset"))
  local noteafter = (nxt ~= nil) and (call(note, "getEnd") == call(nxt, "getOnset"))

  local p = PIT.allParams(note, ref, override)
  if egg then
    p.dF0Vbr = PIT.EGG_PRESET.dF0Vbr
    p.fF0Vbr = PIT.EGG_PRESET.fF0Vbr
    p.tF0VbrStart = PIT.EGG_PRESET.tF0VbrStart
  end
  local pp = prev and PIT.allParams(prev, ref, nil) or nil
  local np = nxt and PIT.allParams(nxt, ref, nil) or nil

  local segs, connSegs = {}, {}

  -- pit3 本音音头：峰点 = O + 0.45*tF0Left + tF0Offset
  local n1 = 0.45 * p.tF0Left + p.tF0Offset
  local ampL = PIT.dirLeft(P, pP, p.dF0Left) * math.abs(p.dF0Left)
  segs[#segs + 1] = { { O - p.tF0Left + n1, 0 }, { O + n1, ampL }, { O + p.tF0Left + n1, 0 } }

  -- pit5 本音音尾：峰点 = **两音符交界** = 本音结束位置 E（再被后音的 tF0Offset 挪）
  -- 用户裁定（09-12）：**不是"内移"** —— 峰点就落在 E。定位交界的旋钮是**后音**的
  -- tF0Offset（负值 ⇒ 峰点略提前、落在两音符之间），**但仅当后音"有音头"时才挪**：
  --   后音**自己有**音头参数（tF0Left / dF0Left 任一）⇒ 峰点 = E + tF0Offset_后；
  --   **后音没有音头 ⇒ 峰点永远精确等于 E**（用户 09-12 二次裁定）。
  -- ⚠️ 判据必须看"后音**自己写的**"参数，不能看解析值：脚本默认 dF0Left = 0.15 ≠ 0，
  --    用解析值判断会让任何后音都算"有音头"（离线测试立刻抓到这条）。
  -- ⚠️ 后音的参数读的是**后音自己**写的（scriptData / attributes），不受本次 `params` 覆盖影响
  --    （用户 09-12 确认：保持现状）。
  local off2 = 0
  if noteafter and np ~= nil and nxt ~= nil and
     (PIT.ownParam(nxt, "tF0Left") ~= nil or PIT.ownParam(nxt, "dF0Left") ~= nil) then
    off2 = np.tF0Offset
  end
  local ampR = PIT.dirRight(P, nP, p.dF0Right) * math.abs(p.dF0Right)
  segs[#segs + 1] = { { E - p.tF0Right + off2, 0 }, { E + off2, ampR },
                      { E + p.tF0Right + off2, 0 } }

  -- pit2/pit6 连接段：承载相邻音的音高差（职责由全局 level() 承担）
  if notefront then
    local span2 = 0.5 * pp.tF0Right + 0.5 * p.tF0Left
    connSegs[#connSegs + 1] = { { O - span2 + p.tF0Offset, pP - P }, { O + span2 + p.tF0Offset, 0 } }
  end
  if noteafter then
    local span6 = 0.5 * p.tF0Right + 0.5 * np.tF0Left
    connSegs[#connSegs + 1] = { { E - span6 + np.tF0Offset, 0 }, { E + span6 + np.tF0Offset, nP - P } }
  end
  -- pit1 前音的音尾凸起
  if notefront then
    local ampRp = PIT.dirRight(pP, P, pp.dF0Right) * math.abs(pp.dF0Right)
    segs[#segs + 1] = { { O - 1.45 * pp.tF0Right + p.tF0Offset, 0 },
                        { O - 0.45 * pp.tF0Right + p.tF0Offset, ampRp },
                        { O + 0.55 * pp.tF0Right + p.tF0Offset, 0 } }
  end
  -- pit7 后音的音头凸起
  if noteafter then
    local ampLn = PIT.dirLeft(nP, P, np.dF0Left) * math.abs(np.dF0Left)
    segs[#segs + 1] = { { E - 0.55 * np.tF0Left + np.tF0Offset, 0 },
                        { E + 0.45 * np.tF0Left + np.tF0Offset, ampLn },
                        { E + 1.45 * np.tF0Left + np.tF0Offset, 0 } }
  end

  -- pit4 本音颤音；VbrEnd 按与后音的关系决定
  local vbrStart = O + p.tF0VbrStart
  local vbrEnd = E
  if noteafter then
    vbrEnd = (np.tF0Offset > np.tF0VbrStart) and (E + np.tF0VbrStart) or (E + np.tF0Offset)
  end
  if vbrEnd < vbrStart then vbrEnd = vbrStart end

  -- 采样窗口：覆盖所有段的左右伸展
  local leftExt = math.max(p.tF0Left, notefront and (1.45 * pp.tF0Right) or 0,
                           notefront and (0.5 * pp.tF0Right + 0.5 * p.tF0Left) or 0)
  local rightExt = math.max(p.tF0Right, noteafter and (1.45 * np.tF0Left) or 0,
                            noteafter and (0.5 * p.tF0Right + 0.5 * np.tF0Left) or 0)
  local ws = O - leftExt - 0.05
  local we = E + rightExt + 0.05

  return {
    note = note, O = O, E = E, P = P, ws = ws, we = we,
    segs = segs, connSegs = connSegs,
    vib = { vbrStart, vbrEnd, p.tF0VbrLeft, p.tF0VbrRight, p.dF0Vbr, p.fF0Vbr, p.pF0Vbr }
  }
end

-- 单音符模型（无全局层时的兜底）
function PIT.y(c, t)
  local s = 0
  for i = 1, #c.segs do s = s + PIT.seg(c.segs[i], t) end
  for k = 1, #c.connSegs do s = s + PIT.seg(c.connSegs[k], t) end
  local v = c.vib
  s = s + PIT.vib(t, v[1], v[2], v[3], v[4], v[5], v[6], v[7])
  return s
end

-- ===== write_pit：音高线绘制（最重的一个 op）=====
-- 与 JS 的 svhOpWritePit 对齐。两条落地路线：
--   SV1 → 写**音符属性**（只写非默认字段；目标=默认但音符残留非默认 ⇒ 写 NaN 让它回到组默认）
--   SV2/IX → 生成 PitchControlCurve 打点（点值 = 全局轮廓 − 本音音高，避免相邻曲线冲突）
-- plan="accent"：只用 ACC 挑出重音位，**非重音位完全不写**（保持 auto ⇒ 零改动）
function OPS.write_pit(args)
  args = args or {}
  local ed = SC("getMainEditor")
  local ref = call(ed, "getCurrentGroup")
  if ref == nil then error("当前没有选中的音符组（请在 SV 里选中一个组）") end
  local group = call(ref, "getTarget")
  if group == nil then error("当前组无 target") end
  local proj = SC("getProject")
  local ta = call(proj, "getTimeAxis")
  if ta == nil then error("no time axis") end
  local n = call(group, "getNumNotes") or 0
  if n == 0 then error("当前组没有音符") end
  local notes = {}
  for i = 1, n do notes[i] = call(group, "getNote", i) end
  -- 写入曲线的归属标记键（scriptData）：0 起组内下标。
  -- 用途：重写时**只删自己那条** —— 和弦里多个音 onset 相同、窗口起点也一样，
  -- 只按起点认会把同伴的曲线误删（见下面幂等那段的说明）。
  local NOTE_TAG = "akdagentNoteIndex"
  -- onset → 该 onset 上有几个音（判断"本音符的窗口起点是否唯一"，用于兼容旧版无标记曲线）
  local onsetCount = {}
  for i = 1, n do
    local o = call(notes[i], "getOnset")
    if o ~= nil then onsetCount[o] = (onsetCount[o] or 0) + 1 end
  end

  -- 目标音符：args.indices（**组内下标，0 起**）→ 选中音符 → 全部
  -- ⚠️ 索引基准：协议是 0 起，Lua 是 1 起 ⇒ 内部统一用 0 起存 targets，取音符时 +1。
  --    Note#getIndexInParent 在 Lua 侧是 **1 起** ⇒ 必须 −1 才能与协议对齐（本工程踩过多次）。
  local targets = {}
  local scopeSource = "whole-group"
  if type(args.indices) == "table" and #args.indices > 0 then
    scopeSource = "indices"
    for a = 1, #args.indices do
      local ix = tonumber(args.indices[a])
      if ix ~= nil and ix >= 0 and ix < n then targets[#targets + 1] = ix end
    end
  else
    local sels = selectedNoteObjects(ed)
    if sels ~= nil and #sels > 0 then
      scopeSource = "selection"
      for s = 1, #sels do
        local gi = call(sels[s], "getIndexInParent")
        if gi ~= nil then
          local zero = gi - 1
          if zero >= 0 and zero < n then targets[#targets + 1] = zero end
        end
      end
    else
      for t = 0, n - 1 do targets[#targets + 1] = t end
    end
  end
  if #targets == 0 then error("没有可写的目标音符") end
  table.sort(targets)

  local egg = PIT.eggRequested(args)
  local override = (type(args.params) == "table") and args.params or nil
  local perNote = (type(args.perNote) == "table") and args.perNote or nil
  local dry = (args.dryRun == true)

  -- ---------- plan="accent"：用 ACC 决定「给谁写音头」----------
  local accentReport = nil
  -- 默认口径（用户 2026-09-22 重申原始设想：**只有算出来的重音音符才该被改成手动 / 才该划线**）：
  --   没点名 indices ⇒ 默认走 accent（只改命中的少数音符，其余保持 auto、零改动）；
  --   点名了 indices ⇒ 尊重点名（等价 explicit）。
  --   想按选区/整组**全写** ⇒ 显式传 plan="explicit"（不再默认全写）。
  local plan
  if args.plan ~= nil and tostring(args.plan) ~= "" then
    plan = tostring(args.plan)
  else
    local hasIndices = (type(args.indices) == "table" and #args.indices > 0)
    plan = hasIndices and "explicit" or "accent"
  end
  if plan == "accent" then
    local bpb = ACC.beatsPerBar(ta, notes[1] and call(notes[1], "getOnset") or 0)
    local threshold = numOrNil(args.accentThreshold) or 2
    local graceRatio = numOrNil(args.graceRatio) or 0.5
    local strongDelta = numOrNil(args.strongDelta) or 2
    local midAmp = numOrNil(args.midAmp) or 1.5
    local strongAmp = numOrNil(args.strongAmp) or 2.5
    local tailAmp = numOrNil(args.tailAmp) or 2
    local longNoteBeats = numOrNil(args.longNoteBeats) or 1.5
    local longNoteWeight = numOrNil(args.longNoteWeight) or 2
    local vbrStartRatio = numOrNil(args.vbrStartRatio) or 1
    local vbrStartMax = numOrNil(args.vbrStartMax) or 1
    local kVbrBase = numOrNil(args.vbrKBase) or 0.5
    local kVbrTailAdj = numOrNil(args.vbrKTail) or 0.15
    local kVbrStrongAdj = numOrNil(args.vbrKStrong) or 0.15
    local kVbrLongAdj = numOrNil(args.vbrKLong) or 0.1
    local gestureMode = args.accentGesture and tostring(args.accentGesture) or "melody"
    local accOpts = { longNoteBeats = longNoteBeats, longNoteWeight = longNoteWeight }
    -- ⚠️ 评分域 = **上面的 targets**（indices → 选中 → 全组），不再无条件吃整个组：
    --    否则"选中 4 小节画重音"会变成"整组画重音" —— 2026-09-22 用户指出这是与原始设想不符的第二处。
    --    scopeNotes[k] ↔ scopeMap[k]（scope 内 1 起 → 组内 0 起）用于把评分结果映射回工程下标。
    local scopeNotes, scopeMap = {}, {}
    for k = 1, #targets do
      scopeNotes[k] = notes[targets[k] + 1]
      scopeMap[k] = targets[k]
    end
    local unitsA = ACC.groupUnits(scopeNotes, graceRatio)
    local quarter = tonumber(SV and SV.QUARTER) or 705600000

    -- 先剔除「没有音节」的单元（呼吸音 br / 延续音 -），再做 Top-N：
    --   这样比例是相对"**有音节的单元**"算的，不会被呼吸音稀释。
    --   `.a cl` 这类强制音素效果音符**算**重音位（用户裁定），故只按整串相等判断。
    local sylUnits = {}
    local skipDashN, skipBreathN = 0, 0
    for ui = 1, #unitsA do
      local mainU = unitsA[ui].notes[1]
      local lyU = tostring(call(mainU, "getLyrics") or "")
      if string.lower(lyU) == "br" then
        skipBreathN = skipBreathN + 1
      elseif lyU == "-" or lyU == "" or lyU == "- " then
        skipDashN = skipDashN + 1
      else
        sylUnits[#sylUnits + 1] = unitsA[ui]
      end
    end

    local targetRatio = numOrNil(args.accentTargetRatio)
    if targetRatio == nil then targetRatio = 0.4 end
    local useRatio = (targetRatio > 0 and targetRatio < 1)
    local accA, cutoffScore, tieInfo = nil, nil, nil
    if useRatio then
      local topRes = ACC.pickTop(sylUnits, bpb, targetRatio, accOpts)
      accA = topRes.picked
      cutoffScore = topRes.cutoffScore
      tieInfo = { tiedAtCutoff = topRes.tiedAtCutoff, takenAtCutoff = topRes.takenAtCutoff }
    else
      accA = ACC.pick(sylUnits, bpb, threshold, accOpts)
    end

    if perNote == nil then perNote = {} end
    -- 只往 targets 里追加"命中重音"的音符；**不重置** —— 重置会丢掉 indices / 选区的范围（原实现就是那样）
    targets = {}
    accentReport = {
      beatsPerBar = bpb, threshold = threshold, graceRatio = graceRatio,
      targetRatio = useRatio and targetRatio or nil, cutoffScore = cutoffScore, tie = tieInfo,
      longNoteBeats = longNoteBeats, longNoteWeight = longNoteWeight,
      unitCount = #unitsA, syllableUnits = #sylUnits,
      skippedBreath = skipBreathN, skippedDash = skipDashN,
      accentCount = #accA, picked = {}
    }
    for ai = 1, #accA do
      local uA = accA[ai].unit
      local scA = accA[ai].score
      local idxA = uA.index                       -- 0 起，**相对评分域 scopeNotes**
      local gIdxA = scopeMap[idxA + 1]            -- 组内 0 起下标（写工程 / 报报告一律用这个）
      local mainLyA = tostring(call(uA.notes[1], "getLyrics") or "")
      local lyLowA = string.lower(mainLyA)
      if lyLowA == "br" then
        accentReport.skippedBreath = accentReport.skippedBreath + 1
      elseif mainLyA == "-" or mainLyA == "" or mainLyA == "- " then
        accentReport.skippedDash = accentReport.skippedDash + 1
      else
        local isTailA = (gIdxA == n - 1)              -- 句尾按**组**判（组内最后一个音），与评分域无关
        local prevPitchA = nil
        if gIdxA > 0 then prevPitchA = call(notes[gIdxA], "getPitch") end   -- notes[gIdxA] 即组内前一个音（0 起 → Lua 取前一个）
        local ascending = (prevPitchA ~= nil and uA.pitch > prevPitchA)
        local strong = (scA >= threshold + strongDelta)

        -- 手势 → dF0Left 符号（SV1 语义：正=走旋律方向、负=反向）
        local baseDir = ascending and 1 or -1
        local wantDir
        if gestureMode == "up" then wantDir = 1
        elseif gestureMode == "down" then wantDir = -1
        else wantDir = baseDir end
        local ampA = strong and strongAmp or midAmp
        local dLA = ((wantDir == baseDir) and 1 or -1) * ampA

        -- 颤音起点：短音符从头颤；长音符以「时值一半」为基准再按语境调整（只对秒数封顶）
        local durBeatsA = (uA.endB - uA.start) / quarter
        local vbrStartA = 0
        local vbrWhyA = "短音符→从头颤"
        if durBeatsA >= longNoteBeats then
          local kA = kVbrBase
          local why = { "基准" .. tostring(kVbrBase) }
          if isTailA then kA = kA + kVbrTailAdj; why[#why + 1] = "句尾" .. tostring(kVbrTailAdj) end
          if strong then kA = kA - kVbrStrongAdj; why[#why + 1] = "强重音-" .. tostring(kVbrStrongAdj) end
          if durBeatsA >= longNoteBeats * 2 then kA = kA + kVbrLongAdj; why[#why + 1] = "超长+" .. tostring(kVbrLongAdj) end
          local durSecA = (call(ta, "getSecondsFromBlick", uA.endB) or 0) -
                          (call(ta, "getSecondsFromBlick", uA.start) or 0)
          vbrStartA = vbrStartRatio * kA * durSecA
          local capped = false
          if vbrStartA > vbrStartMax then vbrStartA = vbrStartMax; capped = true end
          if vbrStartA < 0 then vbrStartA = 0 end
          vbrStartA = math.floor(vbrStartA * 1000 + 0.5) / 1000
          vbrWhyA = "k=" .. tostring(math.floor(kA * 100 + 0.5) / 100) ..
                    " 时值=" .. tostring(math.floor(durSecA * 1000 + 0.5) / 1000) ..
                    "s (" .. table.concat(why, ",") .. ")" .. (capped and (" [封顶 " .. tostring(vbrStartMax) .. "s]") or "")
        end
        local psA = { dF0Left = dLA, dF0Right = 0.13, tF0Offset = -0.035,
                      tF0VbrStart = vbrStartA, dF0Vbr = 1.2, fF0Vbr = 5.8 }
        if isTailA then psA.dF0Right = tailAmp end
        perNote[tostring(gIdxA)] = psA
        targets[#targets + 1] = gIdxA
        if #accentReport.picked < 60 then
          accentReport.picked[#accentReport.picked + 1] = {
            index = gIdxA, score = math.floor(scA * 100 + 0.5) / 100,
            lyric = call(uA.notes[1], "getLyrics"), pitch = uA.pitch,
            ascending = ascending, strong = strong, dF0Left = dLA,
            tF0VbrStart = vbrStartA, vbrWhy = vbrWhyA,
            durBeats = math.floor(durBeatsA * 100 + 0.5) / 100,
            -- 报告的手势按**实际渲染方向**（wantDir），不能按 dF0Left 符号（曾标错过）
            gesture = (wantDir > 0) and "上音头" or "下音头"
          }
        end
      end
    end
    accentReport.selected = #targets
    accentReport.selectedRatio = (#unitsA > 0) and (math.floor(#targets / #unitsA * 1000 + 0.5) / 1000) or 0
    accentReport.scope = { source = scopeSource, scanned = #scopeNotes, groupNotes = n }
    table.sort(targets)
  end

  -- ---------- 落地路线判定 ----------
  -- ⚠️ 不能靠「note[0] 有没有 tF0Left」判断宿主版本：SV1 的 getAttributes() 只返回**非默认**字段
  local isSv1 = not ST.isSV2
  local canCurve = has(group, "getNumPitchControls") and has(group, "addPitchControl")
  local mode = args.mode and tostring(args.mode) or (isSv1 and "attr" or "curve")
  if mode == "auto" then mode = isSv1 and "attr" or "curve" end
  if mode == "curve" and not canCurve then
    error("本宿主没有 PitchControl API（addPitchControl 系 SV2 2.1.0+）；SV1 请用 mode=\"attr\" 走音符属性。")
  end
  if not dry then call(proj, "newUndoRecord") end

  local out = { mode = mode, plan = plan, scope = scopeSource, isSv1 = isSv1, canCurve = canCurve, egg = egg, dryRun = dry,
                processed = #targets, curves = 0, attrs = 0, skipped = 0 }
  local details = {}

  -- 清理：clear="all" 先清掉全组曲线（只有 PitchControlCurve 有 getPoints）
  local removed = 0
  if args.clear == "all" and not dry and canCurve then
    for ca = (call(group, "getNumPitchControls") or 0), 1, -1 do
      local cpc = call(group, "getPitchControl", ca)
      if cpc ~= nil and has(cpc, "getPoints") then
        call(group, "removePitchControl", ca)
        removed = removed + 1
      end
    end
  end

  -- curve 模式预计算：S_all（全组基准层）+ ctxAll（目标 ±2 的完整上下文）
  local S_all, ctxAll = nil, nil
  if mode == "curve" and canCurve then
    S_all = {}
    for si = 1, n do
      local sn = notes[si]
      S_all[si] = {
        O = call(ta, "getSecondsFromBlick", call(sn, "getOnset")),
        E = call(ta, "getSecondsFromBlick", call(sn, "getEnd")),
        P = call(sn, "getPitch"),
        tFL = PIT.resolve(sn, ref, "tF0Left", nil),
        tFR = PIT.resolve(sn, ref, "tF0Right", nil)
      }
    end
    ctxAll = {}
    for ti = 1, #targets do
      for td = -2, 2 do
        local tj0 = targets[ti] + td
        local tj = tj0 + 1
        if tj >= 1 and tj <= n and ctxAll[tj] == nil then
          local tov = override
          if perNote ~= nil and perNote[tostring(tj0)] ~= nil then
            tov = PIT.merge(override, perNote[tostring(tj0)])
          end
          ctxAll[tj] = PIT.buildCurve(ref, notes, tj, ta, tov, egg)
        end
      end
    end
  end

  -- ---------- P23 ②③（2026-09-22）：交界一致性自检（**内部口径**）----------
  -- ⚠️ **用户 2026-09-22 裁定：只进回包，「不可见」—— 用户不必知道写的过程**
  --    ⇒ 这里**不上面板**（不碰 `PANEL.*`）、也**不写"必须转述给用户"的文案**；
  --      它只给**调用方**判断"这批写入的交界处会不会出现两条有间距的线"。
  -- 背景：curve 路线的值 = `PIT.levelAt(sec, S_all) − 本音音高 + PIT.bumpsAt(sec, bumpSlice)`，
  --   而 `S_all` 是**当时**的全组骨架快照、`ctxAll` 用**本次调用**的 params 现算
  --   ⇒ **"重叠区数值一致"这个保证只在同一次调用内成立**。
  --   ⇒ 只要"邻音已有曲线、而本次没重写它"，交界处就可能不一致（值差 = 那两条线之间的**间距**）。
  -- 做法：给每条写下的曲线打一枚**指纹**（`PIT.FP_TAG`，见 `PIT.geomKey` / `PIT.paramKey`）；
  --   写前把邻音**存着的指纹**与**现在算出来的**指纹比对 ⇒ 不一致即判**旧快照**（这正是两条线的根因）。
  local fpForNote = nil
  if mode == "curve" and canCurve and S_all ~= nil then
    local function effParams(j0)
      local tov = override
      if perNote ~= nil and perNote[tostring(j0)] ~= nil then tov = PIT.merge(override, perNote[tostring(j0)]) end
      return tov
    end
    fpForNote = function(j0)
      local i = j0 + 1
      local a = math.max(1, i - 2)
      local b = math.min(n, i + 2)
      local parts = { PIT.geomKey(S_all, a, b) }
      for k = a, b do parts[#parts + 1] = PIT.paramKey(effParams(k - 1)) end
      return table.concat(parts, "|")
    end
    local haveCurve, storedFp = {}, {}
    if has(group, "getNumPitchControls") then
      for r = 1, (call(group, "getNumPitchControls") or 0) do
        local pc = call(group, "getPitchControl", r)
        if pc ~= nil and has(pc, "getScriptData") then
          local j0 = tonumber(call(pc, "getScriptData", NOTE_TAG))
          if j0 ~= nil then
            haveCurve[j0] = true
            storedFp[j0] = call(pc, "getScriptData", PIT.FP_TAG)
          end
        end
      end
    end
    local inTarget = {}
    for k = 1, #targets do inTarget[targets[k]] = true end
    local items, nStale, nUnknown = {}, 0, 0
    for k = 1, #targets do
      local j0 = targets[k]
      local cand = { j0 - 1, j0 + 1 }
      for ci = 1, 2 do
        local nb = cand[ci]
        if nb >= 0 and nb < n and haveCurve[nb] and not inTarget[nb] then
          local fpOld = storedFp[nb]
          local stale, unknown = false, false
          if fpOld == nil then unknown = true else stale = (fpOld ~= fpForNote(nb)) end
          if stale then nStale = nStale + 1 end
          if unknown then nUnknown = nUnknown + 1 end
          items[#items + 1] = { index = j0, neighbour = nb, stale = stale, unknown = unknown }
        end
      end
    end
    if #items > 0 then
      out.junction = { targets = #targets, neighbours = #items, stale = nStale, unknown = nUnknown, items = items }
      out.junctionHint = "交界自检：本次只写了 " .. #targets .. " 个音，其中 " .. #items ..
        " 处邻音**已有音高曲线**（" .. nStale .. " 处是**旧快照**：几何/骨架/参数已变" ..
        (nUnknown > 0 and ("；" .. nUnknown .. " 处无指纹=旧版写的、无法判定") or "") ..
        "）⇒ 这些交界处可能出现**两条有间距的线**。建议把**相邻音符放进同一次调用**（`indices` 同时给），" ..
        "或对已写过的邻音**再跑一次**。"
    end
  end

  for k = 1, #targets do
    local idx = targets[k]                    -- 0 起
    local note = notes[idx + 1]
    local ov = override
    if perNote ~= nil and perNote[tostring(idx)] ~= nil then
      ov = PIT.merge(override, perNote[tostring(idx)])
    end
    local c = PIT.buildCurve(ref, notes, idx + 1, ta, ov, egg)

    if mode == "attr" then
      -- 🔴 rap 音符护栏（2026-09-18 · SV2 2.2.1 实测）：rap 音符**静默丢弃**这 12 个手动音高参数 ——
      --    setAttributes() 返回成功，但随后 getAttributes() 回读是**空表** ⇒ 不拦的话调用方会以为"写上了"。
      --    要控制 rap 音高：走曲线（SV2 的 PitchControlCurve），或先把该音符设回 musicalType="sing"。
      local mt = nil
      if has(note, "getMusicalType") then
        local okMt, vMt = pcall(function() return note:getMusicalType() end)
        if okMt and vMt ~= nil then mt = tostring(vMt) end
      end
      if not isSv1 then
        -- ⚠️ SV2/IX **根本没有**这 12 个音高属性（Note.md 明写 "Properties only available in version 1"）⇒
        --    attr 路线在 SV2 上**无效**；而 API **不校验**（setAttributes 传不存在的字段不报错、静默忽略）
        --    ⇒ 必须在这里明确告知，否则调用方会以为写上了。SV2 请用 curve 模式（PitchControlCurve）。
        out.attrUnsupported = (out.attrUnsupported or 0) + 1
        out.attrHint = 'SV2/IX 没有这 12 个音高属性（仅 SV1 有）⇒ attr 模式无效，请改用 curve 模式；注意 API 不校验，写了既不报错也不生效'
        details[#details + 1] = { index = idx, skipped = "attr-unsupported-on-sv2", wroteFields = 0 }
      elseif mt == "rap" then
        out.rapSkipped = (out.rapSkipped or 0) + 1
        out.rapNoteHint = 'rap 音符不吃 12 个手动音高参数（实测静默丢弃）⇒ 已跳过；要控制 rap 音高请用曲线，或先把音符设回 musicalType="sing"'
        details[#details + 1] = { index = idx, skipped = "rap", wroteFields = 0 }
      else
        -- SV1 路线：写音符属性（只写非默认字段，稀疏属性）
        local ps = PIT.allParams(note, ref, ov)
        if egg then
          ps.dF0Vbr = PIT.EGG_PRESET.dF0Vbr
          ps.fF0Vbr = PIT.EGG_PRESET.fF0Vbr
          ps.tF0VbrStart = PIT.EGG_PRESET.tF0VbrStart
        end
        local attrs, wrote = {}, 0
        for q = 1, #PIT.KEYS do
          local pk = PIT.KEYS[q]
          local target = tonumber(ps[pk]) or 0
          local def = tonumber(PIT.DEFAULTS[pk]) or 0
          local isDefault = math.abs(target - def) <= 1e-9
          local cur = PIT.ownParam(note, pk)
          if not isDefault then
            attrs[pk] = ps[pk]
            wrote = wrote + 1
          elseif cur ~= nil and math.abs(cur - def) > 1e-9 then
            attrs[pk] = 0 / 0        -- NaN：让属性回到「用所在 NoteGroupReference 的默认值」
            wrote = wrote + 1
          end
        end
        if wrote > 0 and not dry then
          -- 只有确实要写属性时才切手动模式（无条件切会把"无需改动"的音符也拉出 auto）
          if has(note, "setPitchAutoMode") then call(note, "setPitchAutoMode", false) end
          call(note, "setAttributes", attrs)
          out.attrs = out.attrs + 1
        else
          out.skipped = out.skipped + 1
        end
        details[#details + 1] = { index = idx, wroteFields = wrote,
                                  dF0Left = ps.dF0Left, dF0Right = ps.dF0Right, tF0Offset = ps.tF0Offset }
      end
    elseif c ~= nil then
      -- SV2/IX 路线：生成 PitchControlCurve
      local wsB = call(ta, "getBlickFromSeconds", c.ws)
      local weB = call(ta, "getBlickFromSeconds", c.we)
      if wsB ~= nil and weB ~= nil and weB > wsB then
        -- 幂等：只移除**本音符**写过的旧曲线。
        --   ⚠️ **不能只按"窗口起点一致"认**（0.3.18 前的做法）：和弦里多个音 onset 相同 ⇒ 窗口起点相同
        --   ⇒ 后写的会把先写的当旧版删掉。2026-09-20 IX 真机实测：给同 onset 的两个音各写一条 ⇒
        --   **只剩 1 条**，而返回里只报 `removedCurves`、**不报丢音**（排查困难）。
        --   现按 `scriptData.akdagentNoteIndex` 认领自己的曲线（PitchControlCurve 是 ScriptableNestedObject）。
        --   为兼容旧版写下的**无标记**曲线：仅当该音符的 onset 在组内**唯一**时才按锚点移除
        --   （onset 有同伴时无从判断归属 ⇒ 不动它，宁留不误删；要清干净用 clear="all"）。
        if not dry then
          for r = (call(group, "getNumPitchControls") or 0), 1, -1 do
            local pc = call(group, "getPitchControl", r)
            if pc ~= nil and has(pc, "getPoints") then
              local tag = has(pc, "getScriptData") and call(pc, "getScriptData", NOTE_TAG) or nil
              local anchor = call(pc, "getPosition")
              if tag == idx or (tag == nil and anchor == wsB and (onsetCount[wsB] or 0) <= 1) then
                call(group, "removePitchControl", r)
                removed = removed + 1
              end
            end
          end
        end
        local span = weB - wsB
        local step = PIT.STEP
        if span / step > PIT.MAXPTS then step = math.ceil(span / PIT.MAXPTS) end
        local bumpSlice = {}
        if S_all ~= nil then
          for dd = -2, 2 do
            local jj = idx + dd
            if jj >= 0 and jj < n and ctxAll[jj + 1] ~= nil then
              bumpSlice[#bumpSlice + 1] = ctxAll[jj + 1]
            end
          end
        end
        local pts, cnt = {}, 0
        local yMin, yMax, yAtOnset = nil, nil, nil
        local onsetB = call(note, "getOnset")
        local b = wsB
        while b < weB do
          local sec = call(ta, "getSecondsFromBlick", b)
          local yv
          if S_all ~= nil then
            yv = PIT.levelAt(sec, S_all) - c.P + PIT.bumpsAt(sec, bumpSlice)
          else
            yv = PIT.y(c, sec)
          end
          if yMin == nil or yv < yMin then yMin = yv end
          if yMax == nil or yv > yMax then yMax = yv end
          if yAtOnset == nil and b >= onsetB then yAtOnset = yv end
          pts[#pts + 1] = { b - wsB, math.floor(yv * 100000 + 0.5) / 100000 }
          cnt = cnt + 1
          b = b + step
        end
        if cnt >= 2 then
          if not dry then
            local curve = SC("create", "PitchControlCurve")
            if curve ~= nil then
              call(curve, "setPosition", wsB)
              call(curve, "setPitch", c.P)
              call(curve, "setPoints", pts)
              -- 打上"这条曲线属于哪个音符"（0 起组内下标）⇒ 下次重写只删自己那条，和弦里互不误删
              if has(curve, "setScriptData") then
                call(curve, "setScriptData", NOTE_TAG, idx)
                -- P23 ③：同批把**指纹**存进去（下次别人写邻音时能判断我这条是不是旧快照）
                if fpForNote ~= nil then call(curve, "setScriptData", PIT.FP_TAG, fpForNote(idx)) end
              end
              call(group, "addPitchControl", curve)
            end
          end
          out.curves = out.curves + 1
          details[#details + 1] = {
            index = idx, points = cnt, spanBlicks = span, step = step, startBlick = wsB,
            yMin = math.floor(yMin * 1000 + 0.5) / 1000,
            yMax = math.floor(yMax * 1000 + 0.5) / 1000,
            yAtOnset = yAtOnset and (math.floor(yAtOnset * 1000 + 0.5) / 1000) or nil
          }
        end
      end
    end
  end

  -- ---------- 如实告知：目标里有**和弦（同 onset 的多个音）** ----------
  -- ⚠️ **只在 IX 上提示**（用户 2026-09-20 口径：「**IX 对参数编辑的限制不要影响到 SV 里去**」）：
  --   · **SV1** 走 `attr` 路线（逐音符属性，**没有**共享骨架）⇒ 根本不存在"被拉到骨架音高"，提示即**假警报**；
  --   · **SV2** 走 curve 路线、骨架是**同一套**代码，但那是我方**既定设计**（点值 = 全局轮廓 − 本音音高，
  --     为的是重叠区两条曲线数值一致、合并不冲突，见 PIT.levelAt 上方注释）⇒ 不该按"缺陷"口径提示；
  --   · **IX** 则叠加了**宿主侧那个 bug**（音高曲线是暴力移植实现、当前有 bug；用户 2026-09-20 告知，
  --     具体表现与是否修未知，已登记 **IX-005**）⇒ 这才是真正需要提醒的场景。
  -- ⇒ 触发条件 = `ST.host == "ix"` 且确实走 curve 路线（`mode=="curve" and canCurve`）。
  --   仍然**只告知、不阻止**（有人就是要给整个和弦画同一走向）；要逐音精确控制 ⇒ 一次只写一个音。
  do
    local tOnset = {}
    for k = 1, #targets do
      local oo = call(notes[targets[k] + 1], "getOnset")
      if oo ~= nil then tOnset[oo] = (tOnset[oo] or 0) + 1 end
    end
    local chordStarts, chordNotes = 0, 0
    for _, c in pairs(tOnset) do
      if c > 1 then chordStarts = chordStarts + 1; chordNotes = chordNotes + c end
    end
    if chordStarts > 0 and ST.host == "ix" and mode == "curve" and canCurve then
      out.chordStarts = chordStarts
      out.chordNotes = chordNotes
      out.chordHint = "目标里有 " .. chordNotes .. " 个音落在 " .. chordStarts ..
        " 个**同 onset 起点**上（和弦/齐奏）：本工具按**单声部骨架**画曲线（点值 = 全局轮廓 − 本音音高）" ..
        " ⇒ 同伴音会被拉到骨架音高（实测同和弦两音 `yAtOnset` = 0 与 −4）⇒ **和弦可能被压成同度**。" ..
        "要逐音精确控制请**一次只写一个音**（`indices` 只给一个）。⚠️ IX 侧音高曲线是宿主**暴力移植**实现、" ..
        "当前该处有 bug（已知缺陷 **IX-005**，具体表现与是否修未知）⇒ **和弦音高线不要当成已验证**。"
    end
  end

  out.removedCurves = removed
  if accentReport ~= nil then out.accent = accentReport end
  -- details 会随音符数线性膨胀（实测 316 音符 → 25KB 响应）⇒ 截断，避免拖慢往返
  if #details > 40 then
    out.detailsTotal = #details
    out.detailsTruncated = true
    local d = {}
    for i = 1, 40 do d[i] = details[i] end
    out.details = d
  else
    out.details = details
  end
  return out
end

-- ===== 和弦轨 / 和声组 / 整轨填词（写）=====

-- 与 JS 的 svhOpCreateHarmonyGroup 对齐：{ok, groupName, noteCount}
-- args: { notes: [{pitch, onsetBlicks, durationBlicks, lyrics?}], groupName? }
-- ⚠️ **与 JS 的有意差异**：JS 调 `addNoteGroup(group, 0)`（插到库首）；本实现**省略 suggestedIndex**
--    ⇒ 追加到库末尾。理由：官方文档写明 suggestedIndex 是**可选**的（"If suggestedIndex is not given,
--    the NoteGroup is added at the end"），而 Lua 索引是 1 起、传 0 有越界报错风险。
--    库内顺序不影响轨道显示顺序（轨道用 GroupReference 的 timeOffset 定位），故取更安全的一侧。
function OPS.create_harmony_group(args)
  args = args or {}
  local notesIn = args.notes
  if type(notesIn) ~= "table" or #notesIn == 0 then
    error("args.notes required (non-empty)")
  end
  -- 先校验载荷，**再**动工程（避免写坏一半）
  for i = 1, #notesIn do
    local s = notesIn[i]
    if type(s) ~= "table" or tonumber(s.pitch) == nil
       or tonumber(s.onsetBlicks) == nil or tonumber(s.durationBlicks) == nil then
      error("args.notes[" .. tostring(i - 1) .. "] 需要数值 pitch/onsetBlicks/durationBlicks")
    end
  end

  local ed = SC("getMainEditor")
  local scope = call(ed, "getCurrentGroup")
  if scope == nil then error("no current group") end
  local track = call(ed, "getCurrentTrack")
  if track == nil then error("no current track") end
  local proj = SC("getProject")

  -- 🆕 2026-09-25：先定"写哪里"（SV1 默认写主组），**再**动工程
  local mode, mainGroup, existingMain, endQMain = resolveWriteTarget(args, track)
  local confirm = needConfirmResult(args, existingMain, endQMain)
  if confirm ~= nil then return confirm end

  local group = nil
  if mode == "main" then
    group = mainGroup
  else
    group = SC("create", "NoteGroup")
    if group == nil then error("SV:create('NoteGroup') 不可用") end
    call(group, "setName", args.groupName and tostring(args.groupName) or "Harmony")
  end

  local added = 0
  for i = 1, #notesIn do
    local s = notesIn[i]
    local note = SC("create", "Note")
    if note == nil then error("SV:create('Note') 不可用") end
    call(note, "setPitch", tonumber(s.pitch))
    call(note, "setTimeRange", tonumber(s.onsetBlicks), tonumber(s.durationBlicks))
    if s.lyrics ~= nil then call(note, "setLyrics", tostring(s.lyrics)) end
    call(group, "addNote", note)
    added = added + 1
  end

  -- 只有"新建组"这条路才加库 + 造引用；写主组时主组本来就在轨上
  if mode ~= "main" then
    call(proj, "addNoteGroup", group)      -- 省略 suggestedIndex（见上面的说明）

    local ref = SC("create", "NoteGroupReference")
    if ref == nil then error("SV:create('NoteGroupReference') 不可用") end
    call(ref, "setTarget", group)
    call(ref, "setTimeOffset", call(scope, "getTimeOffset") or 0)
    call(track, "addGroupReference", ref)
  end

  return {
    ok = true, target = mode, groupName = call(group, "getName"),
    noteCount = call(group, "getNumNotes"), written = added,
    appendedToMain = (mode == "main") and ((existingMain or 0) > 0),
    existingNoteCountBefore = (mode == "main") and existingMain or nil,
  }
end

-- 与 JS 的 svhOpFillTrackLyrics 对齐：{ok, track, group, notes, lyricTotal, filled}
-- args: { lyrics: string, track?: 名称 或 **0 起**的数字下标（字符串或数字） }
function OPS.fill_track_lyrics(args)
  args = args or {}
  local lyrics = tostring(args.lyrics or "")
  local proj = SC("getProject")
  local ntracks = call(proj, "getNumTracks") or 0
  local track = nil
  local want = args.track
  if want ~= nil and tostring(want) ~= "" then
    local sel = tostring(want)
    if string.match(sel, "^%d+$") then
      local zeroBased = tonumber(sel)
      -- 协议里轨道下标是 **0 起**（与 JS 一致），Lua 取值要 +1
      if zeroBased >= 0 and zeroBased < ntracks then
        track = call(proj, "getTrack", zeroBased + 1)
      end
    else
      for t = 1, ntracks do
        local tr = call(proj, "getTrack", t)
        if tr ~= nil and call(tr, "getName") == sel then track = tr; break end
      end
    end
    if track == nil then error("track not found: " .. sel) end
  end
  if track == nil then track = call(SC("getMainEditor"), "getCurrentTrack") end
  if track == nil then error("no track to fill (specify track or have a current track)") end

  -- 该轨**第一个有音符的**非 instrumental 组。
  -- ⚠️ 历史 bug（SV2 真机实测抓到）：早前只取"第一个非乐器组"，空的主组会把它顶掉
  --    ⇒ 明明轨上别的组有音符，却报 "track has no fillable notes"（用户工程里主组通常就是空的）。
  -- ⇒ 先找**有音符**的；都没有才退化为第一个非乐器组 / 第一个组，交给下面 notes==0 报错。
  local ng = call(track, "getNumGroups") or 0
  local group, fallback, digest = nil, nil, {}
  for r = 1, ng do
    local ref = call(track, "getGroupReference", r)
    local g = ref and call(ref, "getTarget") or nil
    digest[#digest + 1] = tostring(g and call(g, "getName") or "?") ..
                          "(" .. tostring(g and (call(g, "getNumNotes") or 0) or 0) .. ")"
    if g ~= nil and call(ref, "isInstrumental") ~= true then
      if fallback == nil then fallback = g end
      if (call(g, "getNumNotes") or 0) > 0 then group = g; break end
    end
  end
  if group == nil then group = fallback end
  if group == nil and ng > 0 then
    local ref = call(track, "getGroupReference", 1)
    group = ref and call(ref, "getTarget") or nil
  end
  local tname = call(track, "getName")
  if tname == nil then
    local ti = call(track, "getIndexInParent")
    tname = (ti ~= nil) and ("#" .. tostring(ti - 1)) or nil
  end
  if group == nil then error("track has no fillable notes: " .. tostring(tname)) end
  local notes = call(group, "getNumNotes") or 0
  if notes == 0 then
    -- 报错里带上该轨的组清单（如 "main(0) 某组(6)"），排障不用再猜
    error("track has no fillable notes: " .. tostring(tname) ..
          "（轨上组：" .. table.concat(digest, " ") .. "）")
  end

  local tokens = splitLyricTokens(lyrics)

  -- ⚠️⚠️ 真机坑（SV2 2.2.1 实测，2026-09-12）：**一边 getNote(i) 一边 setLyrics 会错位/丢词** ——
  --    写一次之后 `getNote(i)` 的**枚举顺序会变**：和弦（同 onset）里甚至**同一个音被两个下标重复返回**
  --    （实测 #1 与 #2 都是 pitch=55、且 #2 读到的"词前"正是刚写给 #1 的值）⇒ token 互相覆盖，
  --    每个和弦少写一个音，而 `filled` 因为计数在 nil 判断之外还会**虚报**。
  -- ⇒ 修法：**先快照音符对象**，再按 **onset 稳定排序**（用户 09-12 口径：SV 里音符顺序就是按 onset；
  --    同 onset 的和弦内顺序由宿主给，我们**不自己重排**，只保证"快照那一刻的序"在使用中不再变），
  --    然后逐音写；并按 (onset, pitch) 去重（真机重复返回那种），去重数写进返回值便于排障。
  local list, seen, dup = {}, {}, 0
  for i = 1, notes do
    local nt = call(group, "getNote", i)
    if nt ~= nil then
      local key = tostring(call(nt, "getOnset")) .. ":" .. tostring(call(nt, "getPitch"))
      if seen[key] then
        dup = dup + 1
      else
        seen[key] = true
        list[#list + 1] = { note = nt, onset = call(nt, "getOnset"), seq = i }
      end
    end
  end
  -- 稳定排序：先 onset，同 onset 用快照序号兜底（Lua 的 table.sort 本身不稳定）
  table.sort(list, function(a, b)
    if a.onset ~= b.onset then return a.onset < b.onset end
    return a.seq < b.seq
  end)

  call(proj, "newUndoRecord")
  local filled, written, failedN = 0, 0, 0
  for i = 1, #list do
    local w = (i <= #tokens) and tokens[i] or "-"
    local okw = pcall(function() list[i].note:setLyrics(w) end)
    if okw then
      written = written + 1
      if w ~= "-" then filled = filled + 1 end
    else
      failedN = failedN + 1
    end
  end
  return {
    ok = true, track = tname, group = call(group, "getName"),
    notes = notes,                -- 组内音符数（原始）
    uniqueNotes = #list,          -- 去重后真正参与填词的音符数
    duplicateNotes = dup,         -- 宿主重复返回而被跳过的手数
    lyricTotal = #tokens,
    filled = filled,              -- **真正写入**的音符数（不含 '-'）—— 不再虚报
    written = written,            -- 成功调用 setLyrics 的音符数（含写 '-' 的）
    failed = failedN,             -- setLyrics 抛错的音符数
    order = "onset(稳定排序,同 onset 保宿主序)"   -- 落词顺序（与 SV 的音符顺序口径一致）
  }
end

function OPS.get_selected_notes(args)
  local ed = SC("getMainEditor")
  if ed == nil then error("no main editor") end
  local selObj = call(ed, "getSelection")
  if selObj == nil then
    return { notes = {}, warning = "本宿主 getMainEditor():getSelection() 不可用，请用 selftest 看真实方法名" }
  end
  if call(selObj, "getSelectedNotes") == nil then
    return { notes = {}, warning = "selection 上没有 getSelectedNotes（见 selftest 的 members.selection）" }
  end
  -- 取法与 write_pit 共用（本机 SV2 的 getSelectedNotes() 不是数组，靠 getNumSelectedNotes 兜底）
  local sels = selectedNoteObjects(ed) or {}
  local out = {}
  local n = #sels
  local quarter = tonumber(SV and SV.QUARTER) or 705600000
  local function q(b) if type(b) ~= "number" then return nil end return b / quarter end
  for i = 1, n do
    local nt = sels[i]
    if nt ~= nil then
      local onset = call(nt, "getOnset")
      local dur = call(nt, "getDuration")
      local e = call(nt, "getEnd")
      if type(e) ~= "number" then e = nil end
      if e == nil and type(onset) == "number" and type(dur) == "number" then e = onset + dur end
      out[#out + 1] = {
        -- ⚠️ 字段集与单位必须与 **JS 桥逐字一致**（客户端按同一协议解析两边）：
        --    JS 版 svhOpGetSelectedNotes 给的是**四分音符单位**（onsetQuarter/durationQuarter/endQuarter）。
        -- ⚠️ index = 相对**本次选中结果数组**的序号（0 起），**不是组内下标**
        --    —— 要写 write_pit 的 indices（组内下标）必须另取 Note#getIndexInParent（Lua 侧 1 起！）。
        index = i - 1,
        pitch = call(nt, "getPitch"),
        onsetQuarter = q(onset),
        durationQuarter = q(dur),
        endQuarter = q(e),
        lyrics = call(nt, "getLyrics"),
        -- 以下为**附加**（非协议字段）：原始 blick，方便脚本侧直接算
        onsetBlick = onset, durationBlick = dur, endBlick = e,
        -- 🆕 0.3.23 附加：**组内下标**（0 起）。协议里的 `index` 是"选中结果数组内的序号"，
        --    别拿它当组内下标用（音素替换/写 pit 的 indices 要的都是**组内**下标）。
        --    Lua 侧 getIndexInParent 是 1 起 ⇒ −1。取不到则为 nil（老宿主/不该发生的场合）。
        indexInParent = (function()
          local gi = call(nt, "getIndexInParent")
          if type(gi) == "number" then return gi - 1 end
          return nil
        end)(),
      }
    end
  end
  return { count = #out, notes = out, indexBase = ST.indexBase }
end

function OPS.run_script(args)
  local code = args and args.code
  if type(code) ~= "string" or #code == 0 then error("args.code required (Lua script body)") end
  local readonly = (args.readonly == true)

  -- 与 JS 桥同样的护栏：写操作必须出现 newUndoRecord
  if not readonly and not string.find(code, "newUndoRecord", 1, true) then
    error("write script must call SV:getProject():newUndoRecord(); or pass readonly:true")
  end

  -- ⚠️ Lua 5.2+ 的 load(chunk, name, "t", env) 会把 _ENV **整个换成 env** ⇒
  --    标准库（tostring / pairs / ipairs / string / table / math / os / io）全部消失，
  --    脚本一用就报 "attempt to call a nil value (global 'tostring')"（实测踩到）。
  --    故必须用 __index = _G 兜住全局；Lua 5.1 的 setfenv 也吃这一套。
  local env = setmetatable({ SV = SV, SVH = SVH, readonly = readonly }, { __index = _G })
  if type(args) == "table" and type(args.scope) == "table" then
    for k, v in pairs(args.scope) do env[k] = v end
  end

  local fn, cerr
  local is51 = (type(_VERSION) == "string" and string.find(_VERSION, "5.1", 1, true) ~= nil)
  if is51 then
    fn, cerr = loadstring(code, "akdagent_script")
    if fn and setfenv then pcall(setfenv, fn, env) end
  else
    if type(load) == "function" then
      fn, cerr = load(code, "akdagent_script", "t", env)
    else
      fn, cerr = loadstring(code, "akdagent_script")
    end
  end
  if not fn then error("compile error: " .. tostring(cerr)) end

  local ok, res = pcall(fn)
  if not ok then error("runtime error: " .. tostring(res)) end

  -- 返回值包装：脚本 return 的可能是 table / number / string / nil
  return { result = res, resultType = type(res) }
end

-- ============================================================================
-- 5.9 装饰音（ornaments）—— **拆音符**路线
-- ============================================================================
-- 设计规格：docs/装饰音工具设计.md（本仓台账，不随技能分发）
-- 用户 2026-09-23 真机裁定：
--   ① 装饰音 = **拆分音符**（SV1 已验证；**SV2 同样拆音符、不画曲线**）；
--   ② 拆出的新音符默认「**自动音高**」（一般够用）⇒ 要求手动时显式 setPitchAutoMode(false)；
--   ③ **滑音不走拆分** —— 靠**增大 tF0Left**（用户口述）；
--   ④ **歌词规则**：第一段承接原歌词，其余段一律 "-"（真机验证过的做法）；
--   ⑤ **anticipate / slide 是属性路线**（不拆音符）⇒ **仅 SV1**（SV2 的音高在曲线上，v1 未接）。
-- ⚠️ 本段只新增 **一个** chunk 级 local（`ORN`）：桥已很长，Lua 单个 chunk 的 local 有上限（200）。
-- ⚠️ 自动化的**取值域**（写前 clamp）。硬编码，**不去问 `getDefinition`**（它在 crash 清单 IX-001 上）。
-- ⚠️ 2026-09-23 真机发现（重要）：**自动化写"一个点"会让该参数在整组里变成那个值** ——
--    实测在 3.75 拍写 `voicing = 0.3` 后，3.75 / 4.0 / 6.0 三处 `get` 全回 0.3（原来各处都是默认 1）。
--    ⇒ 凡是要做"局部"的形（坑 / 渐弱 / 递减），**形状必须闭合**（首尾都回到基线），否则整组跟着改。
--    ⇒ 基线**先读后写**（`get` 是安全的单点采样）。
local AUTO_RANGE = {
  pitchdelta = { -1200, 1200 }, vibratoenv = { 0, 2 }, loudness = { -48, 12 },
  tension = { -1, 1 }, breathiness = { -1, 1 }, voicing = { 0, 1 }, gender = { -1, 1 },
}

local ORN = {}

local QBLICK = tonumber(SV and SV.QUARTER) or 705600000

-- 风格档 → 装饰音程默认（照 `07 §1.7` 的分档表：通俗系 1.5 / 民族·戏曲·美声·通用 2）
ORN.STYLE_IV = {
  pop = 1.5, ["流行"] = 1.5, rb = 1.5, rnb = 1.5, ["r&b"] = 1.5,
  rap = 1.5, ["说唱"] = 1.5, ["通俗"] = 1.5,
  folk = 2, minzu = 2, ["民族"] = 2, xiqu = 2, ["戏曲"] = 2,
  bel = 2, opera = 2, ["美声"] = 2, general = 2, ["通用"] = 2,
}

-- 各装饰音的默认值（长度单位一律「拍」，四分音符 = 1）
ORN.DEF = {
  graceFront = { len = 0.125, dir = "below", df = 1.0, tF0Left = 0.035, tF0Offset = -0.035 },
  spikeUp    = { len = 0.0625, dir = "above", df = 1.0, tF0Left = 0.035, tF0Offset = -0.035 },
  graceBack  = { len = 0.125, dir = "below" },
  mordent    = { len = 0.125, headLen = 0.125, dir = "above" },
  turn       = { len = 0.125, headLen = 0.125 },
  tailRun    = { len = 0.125, steps = 3, dir = "below" },
  anticipate = { df = 1.0, tF0Left = 0.035, tF0Offset = -0.035 },
  slide      = { tF0Left = 0.25 },
}

-- 有顺序的清单（错误信息与文档用；也当"合法 kind"的白名单）
ORN.KINDS = { "graceFront", "graceBack", "spikeUp", "mordent", "turn", "tailRun", "anticipate", "slide" }

-- 拆分类（真的切音符）vs 属性类（只写音符属性）
ORN.SPLIT_KINDS = { graceFront = true, graceBack = true, spikeUp = true,
                    mordent = true, turn = true, tailRun = true }

-- 主音段至少要留多长（拍）—— 不满足就跳过并如实报原因，不硬切
ORN.MIN_MAIN = 0.0625

-- ===== 配套动态（`07 §2.5`）=====
-- §2.5 只给**三种**装饰规定了动态（① 前倚音挖坑 · ③ 后倚音尾部渐弱 · ⑤ 行进每步递减）；
-- 波音 / 回音 / 反向预备 / 滑音**不配**。
-- ⚠️ **形状一律闭合**（锚点 + 收尾都回到基线）—— 否则"一个点会把整组变成那个值"（见 AUTO_RANGE 上方那条真机发现）。
-- ⚠️ 深度默认是**我拟的**（用户 2026-09-23 只定了"用哪条参数"= 发声）：
--    发声往下 0.25（更像"哑一下"）· 响度渐弱 −2 dB · 行进每步 −1.5 dB。
ORN.DYN = {
  graceFront = { param = "voicing", depth = -0.25 },
  spikeUp = { param = "voicing", depth = -0.25 },
  graceBack = { param = "loudness", depth = -2 },
  tailRun = { param = "loudness", step = -1.5 },
}
-- 收尾回到基线的余量（拍）：形状要**闭合**，否则参数会一直保持到最后那个点的值
ORN.DYN_TAIL = 0.125

function ORN.clampValue(param, v)
  local key = tostring(param):lower()
  local rng = AUTO_RANGE[key]
  if rng == nil and key:sub(1, 10) == "vocalmode_" then rng = { 0, 150 } end
  if rng == nil then return v, false end
  local c = false
  if v < rng[1] then v = rng[1]; c = true end
  if v > rng[2] then v = rng[2]; c = true end
  return v, c
end

function ORN.dynParam(kind)
  local d = ORN.DYN[kind]
  return d and d.param or nil
end

-- 读基线（**单点采样**，安全）
function ORN.autoBase(grp, param, onsetQ)
  local auto = call(grp, "getParameter", param)
  if auto == nil then return nil, "getParameter('" .. tostring(param) .. "') 返回 nil" end
  local v = call(auto, "get", math.floor(onsetQ * QBLICK + 0.5))
  if v == nil then return nil, "基线读不到（Automation#get 返回 nil）" end
  return v
end

-- 计划配套动态：返回 { param, points = {{onsetQuarter, value, clamped}...} } 或 nil
-- ⚠️ 字段名统一用 **`onsetQuarter`**（0.3.29 订正）：0.3.28 的 dryRun 分支漏出内部名 `onsetQ`，
--    与写回路径（以及别的 op）不一致 ⇒ 调用方要按两个名字取，属于契约瑕疵。
function ORN.dynPlan(kind, pl, base, opt)
  local d = ORN.DYN[kind]
  if d == nil or pl == nil or pl.segs == nil or #pl.segs == 0 then return nil end
  local pts = {}
  local function add(q, v) pts[#pts + 1] = { onsetQuarter = q, value = v } end
  local first = pl.segs[1]
  add(first.onsetQ, base)                       -- 锚点：保证**之前**也是基线

  if kind == "graceFront" or kind == "spikeUp" then
    local g = pl.segs[1]                        -- 装饰音段在最前
    local depth = tonumber(opt and opt.dynDepth) or d.depth
    add(g.onsetQ + g.durQ / 2, base + depth)    -- 坑底
    add(g.onsetQ + g.durQ, base)                -- 闭合
  elseif kind == "graceBack" then
    local g = pl.segs[#pl.segs]                 -- 装饰音段在最后
    local depth = tonumber(opt and opt.dynDepth) or d.depth
    add(g.onsetQ, base)
    add(g.onsetQ + g.durQ, base + depth)        -- 渐弱到底
    add(g.onsetQ + g.durQ + ORN.DYN_TAIL, base) -- 闭合
  elseif kind == "tailRun" then
    local step = tonumber(opt and opt.dynStep) or d.step
    local k = 0
    for i = 2, #pl.segs do                      -- segs[1] = 主音，其后是各步
      k = k + 1
      add(pl.segs[i].onsetQ, base + step * k)   -- 每步递减
    end
    local last = pl.segs[#pl.segs]
    add(last.onsetQ + last.durQ + ORN.DYN_TAIL, base)   -- 闭合
  else
    return nil
  end

  for i = 1, #pts do
    local c
    pts[i].value, c = ORN.clampValue(d.param, pts[i].value)
    pts[i].clamped = c or nil
  end
  return { param = d.param, points = pts }
end

-- 落动态：写点 + **单点回读**
function ORN.autoWrite(grp, spec)
  local auto = call(grp, "getParameter", spec.param)
  if auto == nil then return nil, "getParameter('" .. tostring(spec.param) .. "') 返回 nil" end
  local back = {}
  for i = 1, #spec.points do
    local p = spec.points[i]
    local b = math.floor(p.onsetQuarter * QBLICK + 0.5)
    local ok, err = pcall(function() auto:add(b, p.value) end)
    back[#back + 1] = { onsetQuarter = p.onsetQuarter, value = p.value, clamped = p.clamped,
                        readBack = ok and call(auto, "get", b) or nil,
                        ok = ok, error = ok and nil or tostring(err) }
  end
  return { param = spec.param, written = #back, points = back }
end

function ORN.intervalFor(style, given)
  local v = tonumber(given)
  if v ~= nil and v > 0 then return v end
  if style ~= nil then
    local k = tostring(style):lower()
    if ORN.STYLE_IV[k] ~= nil then return ORN.STYLE_IV[k] end
  end
  return 2
end

-- 规划：ctx = { onsetQ, durQ, pitch, nextPitch } · opt = 覆盖项
-- 返回 { ok, reason?, segs?, attrs?, interval?, dir? }
--   segs 元素 = { onsetQ, durQ, pitch, role = "main"|"aux", lyric = "keep"|"-", attrs? }
--   **恰有一个 role="main"** 的段复用原音符；其余段是新建音符。
--   属性类（anticipate/slide）**没有 segs**，只回 `attrs`（写在原音符上）。
function ORN.plan(ctx, opt)
  opt = opt or {}
  local kind = opt.kind
  local d = ORN.DEF[kind]
  if d == nil then return { ok = false, reason = "未知装饰音：" .. tostring(kind) } end
  if type(ctx) ~= "table" or tonumber(ctx.durQ) == nil or tonumber(ctx.onsetQ) == nil then
    return { ok = false, reason = "音符上下文缺失（onsetQ / durQ / pitch）" }
  end
  local O, D, P = tonumber(ctx.onsetQ), tonumber(ctx.durQ), tonumber(ctx.pitch)
  local iv = ORN.intervalFor(opt.style, opt.interval)
  local dir = tostring(opt.dir or d.dir or "below")
  local s = (dir == "above") and 1 or -1
  local len = tonumber(opt.len) or d.len or 0.125
  local segs, attrs = {}, nil

  local function add(o, du, p, role, lyric, at)
    segs[#segs + 1] = { onsetQ = o, durQ = du, pitch = p, role = role, lyric = lyric, attrs = at }
  end
  local function dfVal()
    local v = tonumber(opt.df)
    if v == nil then v = d.df end
    return v
  end
  local function leftAttrs()
    return { dF0Left = dfVal(),
             tF0Left = tonumber(opt.tF0Left) or d.tF0Left or 0.035,
             tF0Offset = tonumber(opt.tF0Offset) or d.tF0Offset or -0.035 }
  end

  if kind == "graceFront" or kind == "spikeUp" then
    -- [装饰音, len] + [本音, D-len]；过渡处（本音音头）写一小点 dF0Left
    if len <= 0 or D - len < ORN.MIN_MAIN then
      return { ok = false, reason = "时值不足：主音只剩 " .. string.format("%.4f", D - len) .. " 拍" }
    end
    add(O, len, P + s * iv, "aux", "keep")
    add(O + len, D - len, P, "main", "-", leftAttrs())

  elseif kind == "graceBack" then
    -- [本音, D-len] + [后倚音, len]；音高取**后一音**（无后音则本音 ∓ iv）
    if len <= 0 or D - len < ORN.MIN_MAIN then
      return { ok = false, reason = "时值不足：主音只剩 " .. string.format("%.4f", D - len) .. " 拍" }
    end
    local bp = tonumber(ctx.nextPitch)
    if bp == nil then bp = P + s * iv end
    add(O, D - len, P, "main", "keep")
    add(O + D - len, len, bp, "aux", "-")

  elseif kind == "mordent" then
    -- [本音, headLen] + [邻音, len] + [本音, 余]（下波音把 dir 设 "below"）
    -- ⚠️ **长的那一段才复用原音符**（role="main"）：2026-09-23 真机发现，若把"头"当 main，
    --    原音符会退化成 0.125 拍的短头，而**真正占时值的尾段变成新建音符（自动音高）**
    --    ⇒ 用户原来在该音上的手动音高/手画数据就丢在了短头上。⇒ **main 一律给最长段**。
    local head = tonumber(opt.headLen) or d.headLen or 0.125
    local rest = D - head - len
    if len <= 0 or head <= 0 or rest < ORN.MIN_MAIN then
      return { ok = false, reason = "时值不足：波音需要 headLen+len+余 ≥ " ..
               string.format("%.4f", ORN.MIN_MAIN) .. " 拍（当前 D=" .. string.format("%.4f", D) .. "）" }
    end
    add(O, head, P, "aux", "keep")
    add(O + head, len, P + s * iv, "aux", "-")
    add(O + head + len, rest, P, "main", "-")

  elseif kind == "turn" then
    -- [本音, headLen] + [上邻, len] + [本音, len] + [下邻, len] + [本音, 余]
    -- ⚠️ 同上：**main 给最长的那段（尾）**
    local head = tonumber(opt.headLen) or d.headLen or 0.125
    local rest = D - head - len * 3
    if len <= 0 or head <= 0 or rest < ORN.MIN_MAIN then
      return { ok = false, reason = "时值不足：回音需要 headLen+3×len+余 ≥ " ..
               string.format("%.4f", ORN.MIN_MAIN) .. " 拍（当前 D=" .. string.format("%.4f", D) .. "）" }
    end
    add(O, head, P, "aux", "keep")
    add(O + head, len, P + iv, "aux", "-")
    add(O + head + len, len, P, "aux", "-")
    add(O + head + len * 2, len, P - iv, "aux", "-")
    add(O + head + len * 3, rest, P, "main", "-")

  elseif kind == "tailRun" then
    -- 尾部切 steps 段，逐段 ±iv（dir="below" ⇒ 下行）
    local steps = math.floor(tonumber(opt.steps) or d.steps or 3)
    if steps < 2 then steps = 2 end
    if steps > 5 then steps = 5 end
    local runLen = len * steps
    if len <= 0 or D - runLen < ORN.MIN_MAIN then
      return { ok = false, reason = "时值不足：行进 " .. steps .. " 步要 " ..
               string.format("%.4f", runLen) .. " 拍（当前 D=" .. string.format("%.4f", D) .. "）" }
    end
    add(O, D - runLen, P, "main", "keep")
    for k = 1, steps do
      add(O + (D - runLen) + len * (k - 1), len, P + s * iv * k, "aux", "-")
    end

  elseif kind == "anticipate" then
    -- 不拆：本音音头**取旋律反方向**（SV1 语义：正 = 走旋律方向 ⇒ 反方向写负）
    local v = dfVal()
    attrs = { dF0Left = -math.abs(v),
              tF0Left = tonumber(opt.tF0Left) or d.tF0Left or 0.035,
              tF0Offset = tonumber(opt.tF0Offset) or d.tF0Offset or -0.035 }

  elseif kind == "slide" then
    -- 不拆：滑音 = 把音头时长拉长（用户 2026-09-23 口述）
    attrs = { tF0Left = tonumber(opt.tF0Left) or d.tF0Left or 0.25, tF0Offset = -0.035 }

  else
    return { ok = false, reason = "未实现：" .. tostring(kind) }
  end

  return { ok = true, kind = kind, interval = iv, dir = dir, segs = segs, attrs = attrs,
           split = (ORN.SPLIT_KINDS[kind] == true) }
end

-- 规划结果 → 可读的 dryRun 摘要（对外回报用）
function ORN.describe(pl)
  local out = { kind = pl.kind, interval = pl.interval, dir = pl.dir, split = pl.split }
  if pl.segs ~= nil then
    local segs = {}
    for i = 1, #pl.segs do
      local g = pl.segs[i]
      local at = g.attrs
      segs[#segs + 1] = {
        role = g.role, onsetQuarter = g.onsetQ, durQuarter = g.durQ, pitch = g.pitch,
        lyric = g.lyric,
        dF0Left = (at ~= nil) and at.dF0Left or nil,
        tF0Left = (at ~= nil) and at.tF0Left or nil,
        tF0Offset = (at ~= nil) and at.tF0Offset or nil,
      }
    end
    out.segs = segs
  end
  if pl.attrs ~= nil then
    out.attrs = { dF0Left = pl.attrs.dF0Left, tF0Left = pl.attrs.tF0Left, tF0Offset = pl.attrs.tF0Offset }
  end
  return out
end

function OPS.apply_ornaments(args)
  args = args or {}
  local kind = tostring(args.ornament or "")
  if kind == "" then
    error("args.ornament required（可用：" .. table.concat(ORN.KINDS, ", ") .. "）")
  end
  if ORN.DEF[kind] == nil then
    error("unknown ornament: " .. kind .. "（可用：" .. table.concat(ORN.KINDS, ", ") .. "）")
  end
  local dry = (args.dryRun ~= false)
  local manual = (args.manual == true)
  local isSv1 = not ST.isSV2
  local attrOnly = (ORN.SPLIT_KINDS[kind] ~= true)

  local ed = SC("getMainEditor")
  local scope = call(ed, "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end
  local n = call(grp, "getNumNotes") or 0
  if n == 0 then error("当前组没有音符") end

  -- 目标音符（**0 起**；协议 0 起、Lua 1 起、getIndexInParent 在 Lua 侧也是 1 起 ⇒ −1 对齐）
  local targets, scopeSource = {}, "whole-group"
  if type(args.indices) == "table" and #args.indices > 0 then
    scopeSource = "indices"
    for a = 1, #args.indices do
      local ix = tonumber(args.indices[a])
      if ix ~= nil and ix >= 0 and ix < n then targets[#targets + 1] = ix end
    end
  else
    local sels = selectedNoteObjects(ed)
    if sels ~= nil and #sels > 0 then
      scopeSource = "selection"
      for s = 1, #sels do
        local gi = call(sels[s], "getIndexInParent")
        if gi ~= nil then
          local zero = gi - 1
          if zero >= 0 and zero < n then targets[#targets + 1] = zero end
        end
      end
    else
      for t = 0, n - 1 do targets[#targets + 1] = t end
    end
  end
  if #targets == 0 then error("没有可写的目标音符") end

  -- ⚠️ 先把所有目标**取成对象**再动工程：往组里 addNote 会让后面的下标整体位移
  local ctxs, notes = {}, {}
  for ti = 1, #targets do
    local ix = targets[ti]
    local nt = call(grp, "getNote", ix + 1)
    local nxt = (ix + 2 <= n) and call(grp, "getNote", ix + 2) or nil
    notes[ti] = nt
    ctxs[ti] = {
      onsetQ = (call(nt, "getOnset") or 0) / QBLICK,
      durQ = (call(nt, "getDuration") or 0) / QBLICK,
      pitch = call(nt, "getPitch"),
      nextPitch = nxt and call(nxt, "getPitch") or nil,
      lyrics = call(nt, "getLyrics"),
    }
  end

  local opt = { kind = kind, interval = args.interval, dir = args.dir, len = args.len,
                headLen = args.headLen, steps = args.steps, df = args.df,
                style = args.style, tF0Left = args.tF0Left, tF0Offset = args.tF0Offset,
                dynDepth = args.dynDepth, dynStep = args.dynStep }

  local applied, failed, plans = {}, {}, {}
  local skippedAttr = 0
  if not dry then call(SC("getProject"), "newUndoRecord") end

  -- 配套动态：**先读基线、再写闭合形状**（否则一个点会把整组变成那个值）
  local function applyDyn(pl)
    if args.dyn ~= true then return nil end
    local param = ORN.dynParam(kind)
    if param == nil then return nil end   -- 本型没有配套动态（波音/回音/反向预备/滑音）
    local base, berr = ORN.autoBase(grp, param, pl.segs[1].onsetQ)
    if base == nil then return { skipped = true, reason = berr } end
    local dp = ORN.dynPlan(kind, pl, base, opt)
    if dp == nil then return nil end
    if dry then return { dryRun = true, base = base, plan = dp } end
    local w = ORN.autoWrite(grp, dp)
    if w == nil then return { skipped = true, reason = "写出失败" } end
    w.base = base
    return w
  end

  for ti = 1, #targets do
    local ix, nt, ctx = targets[ti], notes[ti], ctxs[ti]
    local pl = ORN.plan(ctx, opt)
    plans[#plans + 1] = ORN.describe(pl)
    if not pl.ok then
      failed[#failed + 1] = { index = ix, reason = pl.reason }
    elseif attrOnly then
      if not isSv1 then
        -- ⚠️ 如实告知：SV2 的音高在曲线上，音符属性路线不适用（v1 未接曲线）
        skippedAttr = skippedAttr + 1
        failed[#failed + 1] = { index = ix, ornament = kind,
          reason = "属性路线仅 SV1：SV2 的音高落在曲线上，v1 未接（拆分型的装饰音不受影响）" }
      elseif dry then
        applied[#applied + 1] = { index = ix, dryRun = true, plan = ORN.describe(pl) }
      else
        local ok, err = pcall(function() nt:setAttributes(pl.attrs) end)
        if ok then
          local at = call(nt, "getAttributes") or {}
          applied[#applied + 1] = { index = ix, dF0Left = at.dF0Left, tF0Left = at.tF0Left }
        else
          failed[#failed + 1] = { index = ix, reason = tostring(err) }
        end
      end
    elseif dry then
      applied[#applied + 1] = { index = ix, dryRun = true, plan = ORN.describe(pl), dyn = applyDyn(pl) }
    else
      -- ① 主音段：复用原音符（改时间 / 音高 / 歌词 / 属性）
      local mainSeg = nil
      for i = 1, #pl.segs do if pl.segs[i].role == "main" then mainSeg = pl.segs[i] end end
      local okAll, errMsg = pcall(function()
        nt:setTimeRange(math.floor(mainSeg.onsetQ * QBLICK + 0.5), math.floor(mainSeg.durQ * QBLICK + 0.5))
        nt:setPitch(mainSeg.pitch)
        nt:setLyrics(mainSeg.lyric == "keep" and ctx.lyrics or "-")
        if mainSeg.attrs ~= nil and isSv1 then nt:setAttributes(mainSeg.attrs) end
      end)
      -- ② 其余段：新建音符
      local created = 0
      if okAll then
        for i = 1, #pl.segs do
          local g = pl.segs[i]
          if g.role ~= "main" then
            local ok2 = pcall(function()
              local nn = SV:create("Note")
              nn:setTimeRange(math.floor(g.onsetQ * QBLICK + 0.5), math.floor(g.durQ * QBLICK + 0.5))
              nn:setPitch(g.pitch)
              nn:setLyrics(g.lyric == "keep" and ctx.lyrics or "-")
              if manual then nn:setPitchAutoMode(false) end
              grp:addNote(nn)
            end)
            if ok2 then created = created + 1 end
          end
        end
      end
      if okAll then
        applied[#applied + 1] = { index = ix, created = created,
          mainOnsetQuarter = mainSeg.onsetQ, mainDurQuarter = mainSeg.durQ, mainPitch = mainSeg.pitch,
          dfApplied = (mainSeg.attrs ~= nil and isSv1) and mainSeg.attrs.dF0Left or nil,
          manual = manual, dyn = applyDyn(pl) }
      else
        failed[#failed + 1] = { index = ix, reason = tostring(errMsg) }
      end
    end
  end

  local note = "装饰音 = 拆音符（SV2 同样拆音符、不画曲线）；新音符默认自动音高，manual:true 才转手动"
  if attrOnly then note = note .. "；本型是**属性路线**，不拆音符（仅 SV1）" end
  if not isSv1 and not attrOnly then
    note = note .. "；⚠️ SV2 上主音段的 dF0Left 走音符属性**不生效**（SV2 的音高在曲线上，v1 未接）"
  end
  if args.dyn == true then
    note = note .. "；dyn=true ⇒ 只给 §2.5 规定的那三种装饰配动态（前倚音/上尖挖坑·后倚音渐弱·行进每步递减），" ..
           "形状**闭合**（首尾回基线，避免一个点把整组变成那个值）；**深度是我拟的默认**，可用 dynDepth / dynStep 覆盖"
  end
  return { ornament = kind, scope = scopeSource, dryRun = dry, isSv1 = isSv1,
           targets = #targets, changed = #applied, created = #applied,
           applied = applied, failed = failed, plans = plans, dyn = (args.dyn == true),
           attrOnlySkipped = skippedAttr, note = note }
end

-- ============================================================================
-- 5.10 参数自动化（automation）—— 写点 + **单点回读**
-- ============================================================================
-- 用户 2026-09-23 选了「动态配套一起做（含新增桥 op）」。
-- 官方 API：`NoteGroup#getParameter(type)` → Automation；`Automation#add(b, v)` 写点；`Automation#get(b)` 单点读。
-- ⛔ **crash 清单（IX-001）绝不在生成脚本里调**：getPoints / getAllPoints / getLinear / getDefinition / remove(index)。
--    ⇒ 取值域**硬编码**在 `AUTO_RANGE`（见装饰音一节的开头），回读只用 `get(b)`。
--    删点只用**区间重载** `remove(begin, end)`（半开）—— 实测可行。
-- ⚠️ SV-002 的纪律：写前按取值域 clamp（写坏量纲会闪退）。

function OPS.set_automation(args)
  args = args or {}
  local param = tostring(args.parameter or "")
  if param == "" then
    error("args.parameter required（loudness / tension / breathiness / voicing / gender / vibratoEnv / pitchDelta / vocalMode_*）")
  end
  local points = args.points
  local dry = (args.dryRun ~= false)

  local scope = call(SC("getMainEditor"), "getCurrentGroup")
  if scope == nil then error("no current group") end
  local grp = call(scope, "getTarget")
  if grp == nil then error("no current group") end

  local auto = call(grp, "getParameter", param)
  if auto == nil then error("getParameter('" .. param .. "') 返回 nil（该组/该宿主没有这个参数？）") end

  local key = param:lower()
  local rng = AUTO_RANGE[key]
  if rng == nil and key:sub(1, 10) == "vocalmode_" then rng = { 0, 150 } end

  -- 🆕 只读采样模式（2026-09-23 加）：给了 `probe`（位置数组）就**只读不写**。
  -- 用途：写"局部形状"之前先读基线 —— 实测**一个点会把整组变成那个值**，
  -- 所以"坑/渐弱/递减"必须闭合，而闭合点得先知道基线是多少。
  -- 只用 `Automation#get`（单点采样，安全）；不建 undo、不碰工程。
  if type(args.probe) == "table" and #args.probe > 0 then
    local samples = {}
    for i = 1, #args.probe do
      local oq = tonumber(args.probe[i])
      if oq == nil then
        samples[#samples + 1] = { i = i, reason = "probe 元素必须是数字（拍）" }
      else
        local b = math.floor(oq * QBLICK + 0.5)
        samples[#samples + 1] = { onsetQuarter = oq, value = call(auto, "get", b) }
      end
    end
    return { parameter = param, mode = "probe", dryRun = true, samples = samples, range = rng,
             note = "只读采样（Automation#get 单点）；未写工程、未建 undo" }
  end

  if type(points) ~= "table" or #points == 0 then
    error("args.points required（数组，元素形如 { onsetQuarter = 12.5, value = -0.15 }）；只想读就用 args.probe")
  end

  local prepared, failed = {}, {}
  for i = 1, #points do
    local p = points[i]
    local oq = tonumber(p.onsetQuarter)
    local v = tonumber(p.value)
    if oq == nil or v == nil then
      failed[#failed + 1] = { i = i, reason = "onsetQuarter / value 必填且为数字" }
    else
      local clamped = false
      if rng ~= nil then
        if v < rng[1] then v = rng[1]; clamped = true end
        if v > rng[2] then v = rng[2]; clamped = true end
      end
      prepared[#prepared + 1] = { i = i, blick = math.floor(oq * QBLICK + 0.5), value = v,
                                  onsetQuarter = oq, clamped = clamped }
    end
  end
  if #prepared == 0 then error("没有可写的点：" .. (failed[1] and failed[1].reason or "")) end

  if not dry then call(SC("getProject"), "newUndoRecord") end

  local applied = {}
  for i = 1, #prepared do
    local p = prepared[i]
    if dry then
      applied[#applied + 1] = { onsetQuarter = p.onsetQuarter, value = p.value, clamped = p.clamped, dryRun = true }
    else
      local ok, err = pcall(function() auto:add(p.blick, p.value) end)
      -- 回读：**只单点采样**（get 是安全的；getPoints/getAllPoints 在 crash 清单上）
      local back = ok and call(auto, "get", p.blick) or nil
      applied[#applied + 1] = { onsetQuarter = p.onsetQuarter, value = p.value, readBack = back,
                                clamped = p.clamped, ok = ok, error = ok and nil or tostring(err) }
    end
  end

  local note = "回读用 Automation#get(b) 单点采样；getPoints/getAllPoints/getLinear/getDefinition/remove(index) 在 crash 清单上，一律不调"
  if rng == nil then note = note .. "；⚠️ 未收录的参数名 ⇒ **没做取值范围 clamp**，请自行确认量纲" end
  return { parameter = param, dryRun = dry, points = #prepared, written = #applied,
           applied = applied, failed = failed, range = rng, note = note }
end

-- ============================================================================
-- 6. 分发与轮询
-- ============================================================================

for name, fn in pairs(OPS) do OP_NAMES[#OP_NAMES + 1] = name end
table.sort(OP_NAMES)

local function dispatch(op, args)
  if type(op) ~= "string" or op == "" then error("op required") end
  local fn = OPS[op]
  if fn == nil then error("unknown op: " .. tostring(op) .. " (known: " .. table.concat(OP_NAMES, ",") .. ")") end
  -- ⛔ **写操作守卫（P7 ②，2026-09-18）**：写"当前组"的 op，在 **SV2 上若当前组是主组 ⇒ 直接拒绝**。
  --   理由：SV2 主组宿主自身不可编辑（天然闸门），但我们给出**明确错误**，避免"看起来成功实则没写"。
  --   ⚠️ **只对 SV2 生效，绝不做全局拒绝** —— **SV1 的真实音符本来就在主组**，全局拒绝会毁掉 SV1 正常用法。
  local WRITE_CURRENT_GROUP = {
    write_pit = true, set_note_languages = true, set_note_rap_accents = true,
    set_note_phonemes = true, set_note_phoneme_attrs = true, set_note_dur = true,
  }
  if WRITE_CURRENT_GROUP[op] and ST.isSV2 then
    local okRef, ref = pcall(function() return SV:getMainEditor():getCurrentGroup() end)
    if okRef and ref ~= nil then
      local okMain, isMain = pcall(function() return ref:isMain() end)
      if okMain and isMain == true then
        -- ⚠️ 文案必须**按宿主**：IX 也满足 `ST.isSV2`（见其判定：hostVerNum>=131072 **或** host=="ix"），
        --    但报"SV2 主组"、还提"SV1 不受限"，在 Instrument X 里是**误导**（2026-09-20 真机踩到）。
        local hostLabel = (ST.host == "ix") and "Instrument X" or "SV2"
        local hint = (ST.host == "ix")
          and " ⇒ 请先**新建一个组**再试（IX 主组不能 addNote）"
          or  " ⇒ 请先选中或新建一个非主组再试（SV1 不受此限制）"
        error("拒绝写入：" .. op .. " 的目标是**当前组**，而它是 **" .. hostLabel ..
              " 主组**（`isMain=true`，宿主不可编辑）" .. hint)
      end
    end
  end
  return fn(args or {})
end

-- 消费请求文件（应答后必须清）：否则同一份请求会被每拍重复读到 ⇒ 命中缓存 ⇒ 无限重发响应
-- （用户 2026-09-16 实测：日志每秒 2~3 条 `resent cached response`，持续 90 秒。客户端其实只发了一次。）
-- 只在"文件内容仍等于读到的快照"时删 —— 客户端用原子 rename 写，避免误删新请求。
local function consumeReq(snapshot)
  local cur = readFile(PATH.req)
  if cur ~= nil and cur == snapshot then
    pcall(function() os.remove(PATH.req) end)
  end
end

local function pollOnce()
  local text = readFile(PATH.req)
  if text == nil or #text == 0 then return false end

  local okp, req = pcall(jdec, text)
  if not okp or type(req) ~= "table" then
    log("bad request JSON: " .. tostring(req))
    return false
  end

  local seq = tonumber(req.seq)
  if seq == nil then seq = -1 end
  local idKey = tostring(req.id)

  -- ⚠️ 去重主键 = **id**，不是 seq 的大小关系。理由见 rememberResponse 的注释：
  --    不同客户端的 seq 尺度可能相差 1000 倍，用"seq > lastSeq"会让先到的大 seq
  --    把后到的小 seq 请求**永久静默忽略**（实测：reqSeen 卡住、心跳正常、只有 resend 日志）。
  if ST.done[idKey] ~= nil then
    -- 重复请求（客户端超时重试）⇒ 重发缓存响应
    writeFileAtomic(PATH.res, ST.done[idKey])
    log("resent cached response for id=" .. idKey)
    -- ⚠️ **必须消费掉请求文件**：否则下一拍又读到同一份请求 ⇒ 命中缓存 ⇒ 每拍重发一次响应，
    --    实测表现为日志**每秒 2~3 条** `resent cached response`，持续 90 秒（用户 2026-09-16 抓到；
    --    客户端其实只发了一次 —— `server/src/fileipc.ts` 只轮询响应、从不重发）。
    --    只在"文件内容仍等于我们读到的快照"时删（客户端用原子 rename 写，避免把新请求删掉）。
    consumeReq(text)
    return false
  end

  -- 同一个 id 连着再来一次也算重复（缓存被 LRU 挤掉时的兜底）
  if idKey == ST.lastId then
    writeFileAtomic(PATH.res, ST.done[idKey] or jenc({
      v = 1, id = req.id, seq = seq, ok = false, ts = os.time(), host = ST.host,
      error = "duplicate request id (response evicted from cache)"
    }))
    return false
  end

  ST.lastId = idKey
  if seq > ST.lastSeq then ST.lastSeq = seq end     -- lastSeq 仅作统计/观测
  ST.reqSeen = ST.reqSeen + 1

  local okh, result = pcall(dispatch, req.op, req.args)
  ST.opsRun = ST.opsRun + 1
  if okh then
    sendResponse(req.id, seq, true, result)
  else
    log("op '" .. tostring(req.op) .. "' failed: " .. tostring(result))
    sendResponse(req.id, seq, false, result)
  end
  return true
end

-- ===== 常驻主循环：轮询 + 心跳 **合成一条定时器链** =====
-- ⚠️ 背景（2026-09-12 实测到的静默故障）：轮询与心跳原先各是一条独立链，
--    结果出现了「心跳照常跳、轮询已经死」的状态 —— 客户端看心跳新鲜，以为桥活着，
--    实际每个请求都超时；而桥日志里**一行错误都没有**（≈静默死亡，极难诊断）。
--    合成一条链之后：链一死，心跳立刻停 ⇒ 客户端立刻判"桥不在"（回落剪贴板），
--    不会再出现"假装健康"的状态。同时还把 pollTicks/pollErrors 写进心跳，便于事后核对。
-- ============================================================================
-- 6.5 面板中继（SidePanelSection ↔ 文件）—— 2026-09-15 新增（桥 0.3.7）
-- ============================================================================
-- 为什么必须由桥来搬：SidePanelSection 只能用 **JS** 写（`getClientInfo().type`），
--   而 SV 的 JS 沙箱**零宿主对象**（无 require / io / process）⇒ 面板自己读写不了文件。
--   唯一双方都能碰的通道 = **project scriptData** ⇒ 分工：
--       面板 --(scriptData)--> 桥 --(jsonl 文件)--> 客户端（Electron）
--       客户端 --(jsonl 文件)--> 桥 --(scriptData)--> 面板
-- 纪律：① 全程 pcall，面板出任何问题都不得影响桥；② SV1 无 scriptData ⇒ 自动禁用并记一次日志；
--       ③ jsonl 只追加；④ 桥停了面板自然停更（用户能看到"最后一条是什么时候"）。

function PANEL.detect()
  local proj = SC("getProject")
  if proj == nil then PANEL.enabled = false return false end
  local ok = (proj.getScriptData ~= nil) and (proj.setScriptData ~= nil)
  PANEL.enabled = ok and true or false
  if not PANEL.enabled and not PANEL.disabledLogged then
    PANEL.disabledLogged = true
    log("panel: 本宿主没有 project scriptData ⇒ 面板中继禁用")
  end
  return PANEL.enabled
end

function PANEL.sdGet(key)
  local proj = SC("getProject")
  if proj == nil or proj.getScriptData == nil then return nil end
  local ok, v = pcall(proj.getScriptData, proj, key)
  if not ok then return nil end
  return v
end

function PANEL.sdSet(key, value)
  local proj = SC("getProject")
  if proj == nil or proj.setScriptData == nil then return false end
  local ok = pcall(proj.setScriptData, proj, key, value)
  return ok and true or false
end

-- 追加一行到面板信息框（桥只写文本，显示策略在客户端/面板）
function PANEL.appendLog(text)
  if type(text) ~= "string" or #text == 0 then return false end
  local cur = PANEL.sdGet("akdagent.panel.log")
  if type(cur) ~= "string" then cur = "" end
  if #cur > PANEL.logMax then cur = string.sub(cur, -PANEL.logMax) end
  local sep = (#cur > 0) and "\n" or ""
  return PANEL.sdSet("akdagent.panel.log", cur .. sep .. text)
end

function PANEL.bumpRev()
  local rev = tonumber(PANEL.sdGet("akdagent.panel.inRev")) or 0
  return PANEL.sdSet("akdagent.panel.inRev", rev + 1)
end

-- 面板 → 客户端（把 scriptData 里的新事件落到 jsonl）
function PANEL.drainOutbox()
  local raw = PANEL.sdGet("akdagent.panel.out")
  local seq = tonumber(PANEL.sdGet("akdagent.panel.outSeq")) or 0
  if type(raw) ~= "string" or #raw == 0 then
    PANEL.lastOutSeq = seq            -- 序号跳了但内容为空：只对齐序号，别把链卡死
    return 0
  end
  -- 身份 = sid（面板会话）+ seq：桥重启后 scriptData 里仍是"上一条"，靠身份跳过 ⇒ 不重复转发
  local sid = "?"
  local okEv0, ev0 = pcall(jdec, raw)
  if okEv0 and type(ev0) == "table" and ev0.sid ~= nil then sid = tostring(ev0.sid) end
  local identity = sid .. "#" .. tostring(seq)
  if PANEL.outIdentity == nil then
    PANEL.outIdentity = (readFile(PATH.panelOutState) or ""):gsub("%s+$", "")
    if PANEL.outIdentity == "" then PANEL.outIdentity = "?" end
    log("panel: 已转发的最后事件身份 = " .. PANEL.outIdentity)
  end
  if identity == PANEL.outIdentity then return 0 end     -- 同一条事件（桥重启重放）⇒ 丢弃
  local cur = readFile(PATH.panelOut) or ""
  if #cur > PANEL.maxBytes then cur = "" end
  local f = io.open(PATH.panelOut, "w")
  if f then f:write(cur .. raw .. "\n") f:close() end
  PANEL.lastOutSeq = seq
  PANEL.outIdentity = identity
  writeFile(PATH.panelOutState, identity)
  PANEL.sdSet("akdagent.panel.ackSeq", seq)
  -- 面板答完/跳过 ⇒ 清掉**被回答的那一道** ask。
  -- ⚠️ 必须校验 askId：早先"见 answer 就清" ⇒ 迟到的/重放的**旧答案**会把刚推的新题清掉，
  --    表现为"推了题但按钮区不刷新"（用户 2026-09-15 实测反馈）。
  if okEv0 and type(ev0) == "table" and (ev0.kind == "answer" or ev0.kind == "skip") then
    local curRaw = PANEL.sdGet("akdagent.panel.ask")
    local shouldClear = false
    if type(curRaw) ~= "string" or #curRaw == 0 then
      shouldClear = true                     -- 本来就没题 ⇒ 顺手对齐
    else
      local okC, cur = pcall(jdec, curRaw)
      if okC and type(cur) == "table" and ev0.askId ~= nil and tostring(cur.id) == tostring(ev0.askId) then
        shouldClear = true                   -- 答的正是当前这道题
      end
    end
    if shouldClear then
      PANEL.sdSet("akdagent.panel.ask", "")
      PANEL.bumpRev()
      log("panel: 已清空当前 ask（askId=" .. tostring(ev0.askId) .. "）")
    else
      log("panel: 收到的是旧答案（askId=" .. tostring(ev0.askId) .. "）⇒ 不动当前 ask")
    end
  end
  log("panel: 转发面板事件 seq=" .. tostring(seq) .. " sid=" .. sid)
  return 1
end

-- 客户端 → 面板（读 jsonl 新行，写进 scriptData 并 +1 inRev 让面板重绘）
function PANEL.drainInbox()
  local text = readFile(PATH.panelIn)
  if text == nil then PANEL.inOffset = 0 return 0 end
  -- 首次调用：从落盘的偏移恢复（防"桥重启 ⇒ 旧 ask 重放 ⇒ 选项常驻"）
  if not PANEL.inOffsetLoaded then
    PANEL.inOffsetLoaded = true
    local saved = tonumber(readFile(PATH.panelInOffset))
    if saved and saved >= 0 and saved <= #text then
      PANEL.inOffset = saved
      log("panel: 从落盘偏移恢复 inOffset=" .. tostring(saved) .. "（避免重放旧事件）")
    else
      PANEL.inOffset = 0
    end
  end
  if #text < PANEL.inOffset then PANEL.inOffset = 0 end     -- 文件被截断/重建
  if #text == PANEL.inOffset then return 0 end
  local chunk = string.sub(text, PANEL.inOffset + 1)
  PANEL.inOffset = #text
  writeFile(PATH.panelInOffset, tostring(PANEL.inOffset))    -- 落盘偏移
  local applied = 0
  for line in string.gmatch(chunk, "[^\r\n]+") do
    local okp, ev = pcall(jdec, line)
    if okp and type(ev) == "table" then
      local kind = tostring(ev.kind or "")
      if kind == "append" then
        local txt = tostring(ev.text or "")
        if #txt > 0 and PANEL.appendLog(txt) then applied = applied + 1 end
      elseif kind == "ask" then
        local payload = {
          id = ev.id, seq = ev.seq, title = ev.title or "",
          options = ev.options, multi = ev.multi and true or false,
          textInput = ev.textInput,
        }
        if PANEL.sdSet("akdagent.panel.ask", jenc(payload)) then
          applied = applied + 1
          -- 选项同时**在信息框里重复一遍**（用户要求：避免按钮文字显示不全）
          if type(ev.text) == "string" and #ev.text > 0 then PANEL.appendLog(ev.text) end
        end
      elseif kind == "clear" then
        -- ⚠️ 只清**题目**（选项/题面），**绝不动 `akdagent.panel.log`**（2026-09-17 用户实测事故）。
        -- 原因：客户端在"答完题"时就会发 `clear`；而这条以前把 log 也清了 ——
        --   以前信息框里只有桥的问候语，清掉不明显；自从信息框变成**整段会话的镜像**
        --   （见 docs/SidePanel桥设计.md §8.8），一清就等于"回答完问题，面板内容全没了"。
        -- ❌ 曾加过"带 id 且与当前题目一致才清"的安全阀 —— **已撤**（2026-09-17 当晚实测：
        --   只要 id 因任何原因对不上（客户端重启过、台账淘汰、题目被新题覆盖），这条就整条忽略，
        --   而且 applied=0 ⇒ 不 bumpRev ⇒ 面板连刷新都不刷 ⇒ **按钮永远挂着**，用户当场反馈）。
        --   面板一次只显示一道题、用户点的就是"正在作答的那道"⇒ 无条件清题目是对的；
        --   真正要"别投错票"的地方在**客户端**（按 askId 找对应题目回执），不在清 UI 这一步。
        PANEL.sdSet("akdagent.panel.ask", "")
        applied = applied + 1
      elseif kind == "hello" then
        if PANEL.appendLog(tostring(ev.text or "桥连接成功")) then applied = applied + 1 end
      end
    else
      log("panel: panel-in 里有一行不是合法 JSON，已跳过")
    end
  end
  if applied > 0 then PANEL.bumpRev() end
  return applied
end

-- 客户端（Electron 悬浮球）在线判定 —— 用户 2026-09-15 要求：
--   「桥连接成功后如果 electron 没链接，提醒开启悬浮球」
-- 判据：客户端每 ~5s 写 akdagent-client-<host>.json（含 ts）。超过 20s 没更新即视为未连接。
-- 注意：这条**不依赖 scriptData**（Lua 面板版里中继并不参与），所以不放进 relay 的 detect 门里。
PANEL.CLIENT_STALE_SEC = 20
function PANEL.clientStatus()
  local text = readFile(PATH.clientHb)
  if text == nil then return false, nil end
  local ok, obj = pcall(jdec, text)
  if not ok or type(obj) ~= "table" or type(obj.ts) ~= "number" then return false, nil end
  local age = os.time() - obj.ts
  if age < 0 then age = 0 end
  if age > PANEL.CLIENT_STALE_SEC then return false, age end
  return true, age
end

-- 返回一行提示文本（给面板信息框用）—— 用**用户看得懂的说法**：不提 Electron，只说「悬浮球」
function PANEL.clientLine()
  local online, age = PANEL.clientStatus()
  if online then
    return "✓ 悬浮球已连接（" .. tostring(age) .. "s 前）"
  end
  return "⚠️ 还没连上悬浮球 —— 请先打开 AKDAgent 悬浮球，然后才能开始对话"
end

-- 状态镜像（面板没有文件能力，只能靠 scriptData 知道"桥活没活 / 悬浮球连没连"）——
-- 用户 2026-09-15：面板顶部要显示这两个状态。桥每 ~2s 刷一次；桥一停就不再刷新
-- ⇒ 面板据此显示"桥：⚠️ 已停（最后 N 分钟前）"。
function PANEL.mirrorStatus()
  if not PANEL.enabled then return end
  PANEL.sdSet("akdagent.panel.bridgeAt", os.time())
  PANEL.sdSet("akdagent.panel.bridgeVer", CFG.VERSION)
  local online, age = PANEL.clientStatus()
  if online then
    PANEL.sdSet("akdagent.panel.clientAt", os.time() - (age or 0))
  else
    PANEL.sdSet("akdagent.panel.clientAt", 0)
  end
end

-- 在线状态变化时提示一次（不刷屏）：由桥的轮询链调用
function PANEL.presenceTick()
  local online = PANEL.clientStatus()
  if PANEL.lastClientOnline == nil then
    PANEL.lastClientOnline = online
    return
  end
  if online == PANEL.lastClientOnline then return end
  PANEL.lastClientOnline = online
  local line = online and "✓ 悬浮球已连接，可以开始对话了"
                       or "⚠️ 悬浮球断开了 —— 请重新打开 AKDAgent 悬浮球"
  -- 面板版：直接写信息框；纯桥版：写 scriptData 让 JS 面板显示
  if type(PANEL_UI_APPEND) == "function" then
    pcall(PANEL_UI_APPEND, line)
  elseif PANEL.enabled then
    if PANEL.appendLog(line) then PANEL.bumpRev() end
  end
  log("panel: 客户端在线状态变化 online=" .. tostring(online))
end

-- 面板自报挂载 ⇒ 回一条「桥连接成功」（用户要求信息框里必须有这条）
function PANEL.greet()
  if PANEL.helloLogged then return end
  local ready = PANEL.sdGet("akdagent.panel.ready")
  if ready == nil then return end
  PANEL.helloLogged = true
  local line = "✓ 桥连接成功（" .. tostring(ST.hostName or ST.host) .. " " .. tostring(ST.hostVer or "?") ..
               " · 桥 " .. CFG.VERSION .. " · 面板 " .. tostring(ready) .. "）"
  if PANEL.appendLog(line) then PANEL.bumpRev() end
  -- 连上桥之后立刻告诉用户"悬浮球有没有连"（用户 2026-09-15 要求）
  if PANEL.appendLog(PANEL.clientLine()) then PANEL.bumpRev() end
  log("panel: 面板已挂载（" .. tostring(ready) .. "）⇒ 回了「桥连接成功」")
end

function PANEL.relay()
  if not PANEL.detect() then return end
  local ok, err = pcall(function()
    -- 面板下发的开关指令（面板没有 io，只能用 scriptData 说话）——
    -- 用户 2026-09-15 要求面板最上方有「开启/关闭」，面板侧写 akdagent.panel.bridgeOn。
    local want = PANEL.sdGet("akdagent.panel.bridgeOn")
    if want ~= nil then
      local on = (want == true) or (want == "true")
      PANEL_BRIDGE_ENABLED = on
      PANEL.sdSet("akdagent.panel.bridgeState", on and "on" or "off")
    end
    PANEL.greet()
    PANEL.drainOutbox()
    PANEL.drainInbox()
  end)
  if not ok then log("panel relay error: " .. tostring(err)) end
end

local function scheduleLoop()
  scheduleWith(CFG.POLL_MS, function()
    -- 0) 「开启/关闭」开关（**只有面板版脚本会定义这个全局**，纯桥里恒为 nil ⇒ 一直开）。
    --    关闭时：不轮询请求、不写心跳（心跳过期 ⇒ 客户端自然判定桥离线），但**面板 UI 仍继续跑**
    --    —— 否则"开启"按钮就点不动了。
    local suspended = (PANEL_BRIDGE_ENABLED == false)
    if suspended and not ST.suspendLogged then
      ST.suspendLogged = true
      pcall(function() os.remove(PATH.hb) end)
      log("bridge: 已被面板开关暂停（心跳文件已删 ⇒ 客户端将判定离线）")
    elseif not suspended then
      ST.suspendLogged = false
    end
    -- 1) 轮询（错误不抛出，只记日志）
    local okPoll, errPoll = true, nil
    if not suspended then
      okPoll, errPoll = pcall(pollOnce)
    end
    ST.pollTicks = (ST.pollTicks or 0) + 1
    if not okPoll then
      ST.pollErrors = (ST.pollErrors or 0) + 1
      log("poll error: " .. tostring(errPoll))
    end
    -- 1b) 面板中继：**隔拍跑**（scriptData 读写不必每拍都做）
    if (ST.pollTicks % 2) == 0 then
      local okPanel, errPanel = pcall(PANEL.relay)
      if not okPanel then log("panel relay tick error: " .. tostring(errPanel)) end
    end
    -- 1c) 面板 UI 钩子：**只有面板脚本（把 UI 块追加在本文件之后）会定义它**。
    --     桥本体保持与"面板"无关：没定义就什么都不做（手动跑的纯桥行为不变）。
    --     有它时，宿主打开侧栏 ⇒ 本脚本被加载 ⇒ 桥的轮询链随之启动 ⇒ **不需要手动跑桥**。
    if type(PANEL_UI_TICK) == "function" then
      local okUi, errUi = pcall(PANEL_UI_TICK)
      if not okUi then log("panel ui tick error: " .. tostring(errUi)) end
    end
    -- 1d) 悬浮球在线状态（每 4 拍查一次文件即可；变化时才提示，不刷屏）
    --     同时把"桥活着 / 悬浮球在线"镜像进 scriptData 供面板显示（暂停时不刷 ⇒ 面板会看到"已停"）
    if (not suspended) and (ST.pollTicks % 4) == 0 then
      local okP, errP = pcall(PANEL.presenceTick)
      if not okP then log("presence tick error: " .. tostring(errP)) end
      local okM, errM = pcall(PANEL.mirrorStatus)
      if not okM then log("mirror status error: " .. tostring(errM)) end
    end
    -- 2) 心跳：按 HB_MS/POLL_MS 的节拍插入到同一条链上（暂停时不写）
    local every = math.max(1, math.floor(CFG.HB_MS / CFG.POLL_MS))
    if (not suspended) and (ST.pollTicks % every) == 0 then
      local okHb, errHb = pcall(sendHeartbeat)
      if not okHb then log("heartbeat error: " .. tostring(errHb)) end
    end
    -- 3) 重排下一条链。**这里是唯一能"静默断链"的地方** ⇒ 包起来并明确记日志。
    --    若 scheduleWith 本身失败（定时器不可用等），链断、心跳随之停止，
    --    客户端会因心跳过期而回落剪贴板 —— 这正是我们要的"坏就坏得响亮"。
    local okNext, errNext = pcall(scheduleLoop)
    if not okNext then
      log("scheduleLoop 重排失败（桥将停止心跳）：" .. tostring(errNext))
      trace("scheduleLoop 重排失败：" .. tostring(errNext))
    end
  end)
end

-- 合成链：轮询与心跳共用（见上面的说明，不要改回两条链）

-- ============================================================================
-- 7. 启动
-- ============================================================================

-- 致命错误：**只写文件与日志，绝不弹信息框**
-- （常驻桥不该打断用户；诊断走文件通道本来就是这套设计的意义）
local function fatal(reason)
  local payload = jenc({
    ok = false, reason = tostring(reason), bridge = CFG.VERSION, lua = _VERSION,
    dir = ST.dir, svStyle = ST.svStyle, styleDetail = ST.svStyleDetail,
    timerReport = ST.timerReport, diag = ST.diag, ts = os.time()
  })
  if ST.dir and ST.dir ~= "" then
    if PATH.boot == "" then PATH.boot = ST.dir .. "\\akdagent-boot-" .. ST.host .. ".json" end
    writeFileAtomic(PATH.boot, payload)
    writeFileAtomic(ST.dir .. "\\akdagent-diag-" .. ST.host .. ".json", payload)
  else
    -- 极早期失败（ST.dir 还没定）：直接硬编码写 %TEMP%，否则什么都不留痕
    local t = nil
    if type(os) == "table" and type(os.getenv) == "function" then
      t = os.getenv("TEMP") or os.getenv("TMP")
    end
    if t then writeFileAtomic(t .. "\\akdagent-boot-" .. ST.host .. ".json", payload) end
  end
  trace("FATAL: " .. tostring(reason))
  log("FATAL: " .. tostring(reason))
  pcall(function() SC("finish") end)
end

function main()
  trace("main 进入")
  -- 先探测 SV 调用约定（冒号 vs 点）——只探无参只读函数，绝不碰 finish / 信息框
  pcall(detectSvStyle)
  trace("svStyle=" .. tostring(ST.svStyle))

  -- 宿主信息
  local okInfo, info = pcall(function() return SC("getHostInfo") end)
  if okInfo and type(info) == "table" then
    ST.hostName = tostring(info.hostName or "")
    ST.hostVer = tostring(info.hostVersion or "")
    ST.hostVerNum = tonumber(info.hostVersionNumber) or 0
    local hn = ST.hostName
    if string.find(hn, "Instrument", 1, true) then ST.host = "ix" else ST.host = "sv" end
    ST.isSV2 = (ST.hostVerNum >= 131072) or (ST.host == "ix")
    -- 🆕 0.3.21 **版本检测（唯一保留的"危险 API"防线）**：IX 1.0.0（65536）上读点类 API 会弹模态框
    --   挡住 Lua 主线程 ⇒ 桥冻住（1.0.1 / 65537 起改成抛错）。这里只标记 + 给一句提示，**不拦调用**。
    ST.hostOutdated = CFG.hostIsOutdated(ST.host, ST.hostVerNum)
    if ST.hostOutdated then
      ST.hostWarning = "⚠️ 宿主 Instrument X " .. tostring(ST.hostVer) ..
        " 过旧：读点类 API（getPoints/getAllPoints/getLinear/getDefinition）会弹框冻住桥" ..
        "（1.0.1 起已修）⇒ 请先让用户升级 Instrument X，再做读点类操作。"
      log("⚠️ hostOutdated: " .. ST.hostWarning)
    end
  else
    ST.hostName = "unknown"
  end

  -- 通道前提：io
  if type(io) ~= "table" or type(io.open) ~= "function" then
    fatal("这台宿主没有 Lua io 库 —— 文件通道不可用（请用 JS 剪贴板桥）")
    return
  end

  -- 诊断素材：整个 SV 成员表 + 全局函数表（一次运行就能看清 Lua 绑定的真实表面）
  ST.diag.svMembers = members(SV)
  ST.diag.globals = listGlobals()
  if type(info) == "table" then ST.diag.hostInfo = info end

  -- 常驻机制：**不假设 SV.setTimeout 存在**（实测 SV1 1.11.2 上就没有），逐个候选探测
  ST.timer = detectTimer()
  if ST.timer == nil then
    fatal("找不到常驻定时器（已试 SV.setTimeout / 全局 setTimeout / setInterval）——" ..
          "诊断见 akdagent-boot-sv.json 里的 svMembers 与 globals")
    return
  end

  -- 通道目录
  ST.dir = pickDir()
  if ST.dir == nil then
    fatal("找不到可写目录（试过 %USERPROFILE%\\AKDAgent\\ipc、%TEMP%、.）")
    return
  end
  setupPaths()

  -- 写一份完整诊断（成功路径也写，便于事后核对 Lua 绑定的真实表面）
  writeFileAtomic(ST.dir .. "\\akdagent-diag-" .. ST.host .. ".json", jenc({
    bridge = CFG.VERSION, lua = _VERSION, host = ST.host, hostName = ST.hostName,
    hostVersion = ST.hostVer, hostVersionNumber = ST.hostVerNum, isSV2 = ST.isSV2,
    hostOutdated = ST.hostOutdated or false, hostWarning = ST.hostWarning,
    indexBase = ST.indexBase, svStyle = ST.svStyle, dir = ST.dir,
    timer = ST.timer and (ST.timer.where .. "." .. ST.timer.name) or "none",
    timerReport = ST.timerReport,
    svMembers = ST.diag.svMembers, globals = ST.diag.globals,
    ts = os.time()
  }))

  -- 索引基准自检
  local okProj, proj = pcall(function() return SC("getProject") end)
  if okProj and proj ~= nil then
    ST.indexBase = detectIndexBase(proj)
  end

  -- 清掉上一次运行残留的响应/请求，避免客户端读到陈旧数据
  os.remove(PATH.res)
  os.remove(PATH.res .. ".tmp")
  os.remove(PATH.req)

  writeFileAtomic(PATH.boot, jenc({
    ok = true, bridge = CFG.VERSION, host = ST.host, hostName = ST.hostName,
    hostVersion = ST.hostVer, indexBase = ST.indexBase, dir = ST.dir,
    hostVersionNumber = ST.hostVerNum, hostOutdated = ST.hostOutdated or false,
    hostWarning = ST.hostWarning,
    lua = _VERSION, ts = os.time()
  }))

  log("==== boot ==== bridge=" .. CFG.VERSION .. " lua=" .. tostring(_VERSION) ..
      " host=" .. ST.hostName .. " (" .. ST.host .. ") dir=" .. ST.dir ..
      " indexBase=" .. tostring(ST.indexBase) ..
      " timer=" .. (ST.timer and (ST.timer.where .. "." .. ST.timer.name) or "none"))

  trace("boot ok  dir=" .. ST.dir .. " indexBase=" .. tostring(ST.indexBase) ..
        " timer=" .. (ST.timer and (ST.timer.where .. "." .. ST.timer.name) or "none"))

  sendHeartbeat()          -- 立刻写一次，客户端不必等第一个心跳周期
  scheduleLoop()           -- 轮询 + 心跳的**同一条**链（见 scheduleLoop 的说明）
  trace("listening: req=" .. PATH.req .. " hb=" .. PATH.hb)
end

-- ============================================================================
-- 8. 离线自测挂载点（生产环境不生效）
-- ============================================================================
-- 本文件**不自行调用 main()** —— SV 宿主运行脚本时会调用 main()。
-- 离线测试（tools/lua-vm.py + sv/lua/tests/*.lua）只 load 本文件、不调 main()，
-- 改用下面导出的内部表直接驱动各个 op，从而在没有 SV 的环境下做回归。
-- 宿主不会设置 __AKDAGENT_TEST__ ⇒ 生产路径上这段代码不执行、不产生副作用。
if rawget(_G, "__AKDAGENT_TEST__") then
  _G.__AKDAGENT__ = {
    VERSION = CFG.VERSION, OPS = OPS, OP_NAMES = OP_NAMES, LAYOUT = LAYOUT,
    ST = ST, CFG = CFG, PATH = PATH, NULL = NULL, SVH = SVH,
    jenc = jenc, jdec = jdec, idx = idx, call = call, has = has, SC = SC,
    members = members, dispatch = dispatch, readFile = readFile,
    -- 纯算法层（离线单测直接驱动；生产代码通过 OPS 间接使用）
    ALG = ALG, ACC = ACC, PIT = PIT, ORN = ORN,
    writeFile = writeFile, writeFileAtomic = writeFileAtomic,
    setupPaths = setupPaths, pickDir = pickDir,
    sendResponse = sendResponse, pollOnce = pollOnce, main = main
  }
end
