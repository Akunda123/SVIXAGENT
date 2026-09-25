-- ============================================================================
-- AKDAgent 侧栏面板（**纯 scriptData 版**，独立脚本）—— 2026-09-15
--
-- ⚠️ 为什么不能用文件（实测结论，别再试）：
--   SidePanelSection 脚本的 Lua 环境里 **`io` 表存在但 `io.open` 返回 nil** ⇒ 面板**没有任何文件能力**。
--   （探针 sv/lua/panel-probe.lua 实测：io=table、TEMP 正常、io.open 返回 nil；同期"普通脚本"写文件完全正常。）
--   而 **scriptData 在面板里可写**（实测 ✅）、定时器可用（`SV.setTimeout`）、`SV.refreshSidePanel()` 可用。
--   ⇒ 面板与外界**只能**走 project scriptData；文件那半由 `AKDAgentBridge.lua`（有 io）负责搬运。
--
-- 数据契约（与桥的 PANEL.relay() 严格对应，见 docs/SidePanel桥设计.md §2）：
--   akdagent.panel.log    桥 → 面板   信息框全文（桥追加，面板只读显示）
--   akdagent.panel.ask    桥 → 面板   当前提问 JSON（"" = 无）
--   akdagent.panel.inRev  桥 → 面板   入向版本号；面板发现变化就重绘
--   akdagent.panel.out    面板 → 桥   一条事件 JSON（input / answer / skip / stop）
--   akdagent.panel.outSeq 面板 → 桥   事件序号
--   akdagent.panel.ready  面板 → 桥   面板已挂载（桥看到就回「桥连接成功」）
--   akdagent.panel.bridgeOn 面板 → 桥 开关：false ⇒ 桥暂停轮询与心跳（用户要的"关闭"）
--
-- ⚠️ 面板脚本里**任何错误都会弹宿主对话框并中断脚本**（v1 探针踩过）⇒ 本文件所有回调/入口一律 pcall。
-- ⚠️ 数据字段与函数名绝不重名（v1 踩过：PROBE.tick 既是数字又是函数）。
-- ============================================================================

PANELUI = {
  VERSION = "0.2.0",
  log = "",
  inRev = -1,
  outSeq = 0,
  ask = nil,
  picked = {},
  text = "",
  greeted = false,
  dirty = true,
  ready = false,
  lastErr = nil,
  widgets = {},
  optWidgets = {},
  K = {
    log = "akdagent.panel.log", ask = "akdagent.panel.ask", inRev = "akdagent.panel.inRev",
    out = "akdagent.panel.out", outSeq = "akdagent.panel.outSeq", ready = "akdagent.panel.ready",
    bridgeOn = "akdagent.panel.bridgeOn",
  },
}

-- ── 安全工具 ──
function PANELUI.safe(fn, ...)
  local ok, res = pcall(fn, ...)
  if not ok then
    PANELUI.lastErr = tostring(res)
    return nil
  end
  return res
end

function PANELUI.get(key)
  local ok, v = pcall(function() return SV:getProject():getScriptData(key) end)
  if ok then return v end
  return nil
end

function PANELUI.set(key, value)
  local ok = pcall(function() SV:getProject():setScriptData(key, value) end)
  return ok and true or false
end

function PANELUI.wGet(w)
  if w == nil then return nil end
  local ok, v = pcall(function() return w:getValue() end)
  if ok then return v end
  return nil
end

function PANELUI.wSet(w, v)
  if w == nil then return false end
  local ok = pcall(function() w:setValue(v) end)
  return ok and true or false
end

function PANELUI.wOn(w, fn)
  if w == nil then return false end
  local ok = pcall(function() w:setValueChangeCallback(function() PANELUI.safe(fn) end) end)
  return ok and true or false
end

function PANELUI.mk(typeName)
  local ok, w = pcall(function() return SV:create(typeName) end)
  if ok then return w end
  return nil
end

-- ── 信息框：本地拼接 + 显示（**不落盘**，落盘由桥做）──
function PANELUI.append(text)
  if type(text) ~= "string" or #text == 0 then return end
  local cur = PANELUI.log
  if #cur > 20000 then cur = string.sub(cur, -20000) end
  PANELUI.log = cur .. (#cur > 0 and "\n" or "") .. text
  PANELUI.wSet(PANELUI.widgets.log, PANELUI.log)
  PANELUI.dirty = true
end

function PANELUI.refresh()
  pcall(function() SV:refreshSidePanel() end)
end

-- ── 面板 → 桥：写一条事件（scriptData 两个键，桥读了会转发成 jsonl）──
function PANELUI.emit(kind, extra)
  PANELUI.safe(function()
    PANELUI.outSeq = PANELUI.outSeq + 1
    local ev = { v = 1, seq = PANELUI.outSeq, kind = kind, at = os.time(), panel = PANELUI.VERSION }
    if type(extra) == "table" then
      for k, v in pairs(extra) do ev[k] = v end
    end
    PANELUI.set(PANELUI.K.out, PANELUI.encoder(ev))
    PANELUI.set(PANELUI.K.outSeq, PANELUI.outSeq)
  end)
end

-- 极简 JSON 编码（只处理本文件用到的形状：字符串/数字/布尔/数组/表）
function PANELUI.encoder(v, depth)
  depth = depth or 0
  local t = type(v)
  if v == nil then return "null" end
  if t == "number" then return tostring(v) end
  if t == "boolean" then return v and "true" or "false" end
  if t == "string" then
    local s = string.gsub(v, "\\", "\\\\")
    s = string.gsub(s, '"', '\\"')
    s = string.gsub(s, "\n", "\\n")
    s = string.gsub(s, "\r", "\\r")
    s = string.gsub(s, "\t", "\\t")
    return '"' .. s .. '"'
  end
  if t == "table" then
    local isArray = (#v > 0)
    if isArray then
      local parts = {}
      for i = 1, #v do parts[#parts + 1] = PANELUI.encoder(v[i], depth + 1) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for k, val in pairs(v) do
      if val ~= nil then parts[#parts + 1] = PANELUI.encoder(tostring(k), depth + 1) .. ":" .. PANELUI.encoder(val, depth + 1) end
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

function PANELUI.decode(s)
  local ok, fn = pcall(function() return load("return " .. tostring(s)) end)
  if not ok or fn == nil then return nil end
  local ok2, v = pcall(fn)
  if ok2 then return v end
  return nil
end

function PANELUI.askText(a)
  if a == nil then return nil end
  local parts = {}
  if a.title and #a.title > 0 then parts[#parts + 1] = a.title end
  if type(a.options) == "table" then
    for i = 1, #a.options do
      local o = a.options[i]
      parts[#parts + 1] = i .. ". " .. tostring(o.label) .. (PANELUI.picked[o.id] and "（已选）" or "")
    end
  end
  if a.textInput then parts[#parts + 1] = "（可在下方文本框补充）" end
  return table.concat(parts, "\n")
end

function PANELUI.clearAsk()
  PANELUI.ask = nil
  PANELUI.picked = {}
  PANELUI.text = ""
  PANELUI.dirty = true
end

-- ── 交互 ──
function PANELUI.onConfirm()
  local a = PANELUI.ask
  if a ~= nil then
    local picked = {}
    for id, on in pairs(PANELUI.picked) do if on then picked[#picked + 1] = id end end
    PANELUI.emit("answer", { askId = a.id, picked = picked, text = PANELUI.text or "" })
    PANELUI.append("✔ 已提交：" .. (#picked > 0 and table.concat(picked, "、") or "(未选)"))
    PANELUI.clearAsk()
  else
    local t = PANELUI.wGet(PANELUI.widgets.input)
    if type(t) ~= "string" then t = (t ~= nil) and tostring(t) or "" end
    t = string.gsub(t, "^%s+", ""); t = string.gsub(t, "%s+$", "")
    if #t == 0 then return end
    PANELUI.emit("input", { text = t })
    PANELUI.append("🧑 " .. t)
    PANELUI.wSet(PANELUI.widgets.input, "")
    PANELUI.dirty = true
  end
end

function PANELUI.onSkip()
  local a = PANELUI.ask
  if a ~= nil then
    PANELUI.emit("skip", { askId = a.id })
    PANELUI.append("⏭ 已跳过（让 agent 自己定）")
    PANELUI.clearAsk()
  else
    PANELUI.emit("stop", {})
    PANELUI.append("⏹ 已请求停止")
  end
end

function PANELUI.onTestSend()
  local t = "测试消息（面板按钮 " .. os.date("%H:%M:%S") .. "）"
  PANELUI.emit("input", { text = t })
  PANELUI.append("🧑 " .. t)
  PANELUI.dirty = true
  PANELUI.refresh()
end

function PANELUI.onRefresh()
  PANELUI.pull()
  PANELUI.refresh()
end

-- 「开启 / 关闭」已取消（用户 2026-09-15 改版）：**桥必须手动运行**，面板控制不了它。
-- 原位置改为**状态显示**：桥状态 + 客户端（悬浮球）状态。
-- 判据来源：桥每 ~2s 往 scriptData 镜像两个时间戳（面板没有文件能力，读不了进程/文件）：
--   akdagent.panel.bridgeAt / bridgeVer  —— 桥活着就会刷新
--   akdagent.panel.clientAt              —— 悬浮球在线心跳的 ts（桥从 akdagent-client-<host>.json 抄过来）
-- ⚠️ 刷新纪律（用户 2026-09-15 实测反馈：「不要一直刷新，我没法打字」）：
--   宿主的 refreshSidePanel() 会**重建整个面板**（输入框焦点/内容都会被冲掉）⇒
--   ① 状态文字用**粗粒度**（刚刚 / 1 分钟内 / N 分钟前），不再每秒变；
--   ② 状态**每 5 秒**才查一次；
--   ③ **输入框里有未发送的文字时，一律推迟刷新**（避免打断打字），等发完再补一次。
local function bucketOf(ts)
  if type(ts) ~= "number" or ts <= 0 then return "none" end
  local age = os.time() - ts
  if age < 0 then age = 0 end
  if age < 15 then return "now" end
  if age < 60 then return "min1" end
  return tostring(math.floor(age / 60)) .. "min"
end

local function bucketText(b)
  -- ⚠️ 这里必须返回**字符串**（不能 nil）：bucketOf 的"没有数据"是字符串 "none" 而不是 nil，
  --    调用方若用 `.. txt ..` 拼接 nil 就会报 "attempt to concatenate a nil value"（2026-09-15 实测踩到）。
  if b == "none" or b == nil then return "" end
  if b == "now" then return "刚刚" end
  if b == "min1" then return "1 分钟内" end
  return string.gsub(b, "min", "") .. " 分钟前"
end

function PANELUI.bridgeStatusLine()
  local b = bucketOf(tonumber(PANELUI.get("akdagent.panel.bridgeAt")))
  local ver = PANELUI.get("akdagent.panel.bridgeVer")
  local txt = bucketText(b)
  if b == "none" then
    return "桥：❌ 未运行 —— 请在宿主里手动运行 AKDAgentBridge.lua"
  end
  if b == "now" or b == "min1" then
    return "桥：✅ 在跑（v" .. tostring(ver or "?") .. " · " .. txt .. "）"
  end
  return "桥：⚠️ 已停（最后 " .. txt .. "）—— 请手动运行 AKDAgentBridge.lua"
end

function PANELUI.clientStatusLine()
  local b = bucketOf(tonumber(PANELUI.get("akdagent.panel.clientAt")))
  local txt = bucketText(b)
  -- ⚠️ 判据是字符串 "none"（不是 nil）—— 早先写成 `b == nil` 导致走到下一行拼 nil 报错
  if b == "none" then return "悬浮球：❌ 未连接 —— 请打开 AKDAgent 悬浮球" end
  if b == "now" or b == "min1" then return "悬浮球：✅ 已连接（" .. txt .. "）" end
  return "悬浮球：⚠️ 已断开（最后 " .. txt .. "）—— 请重新打开 AKDAgent 悬浮球"
end

function PANELUI.statusKey()
  return tostring(bucketOf(tonumber(PANELUI.get("akdagent.panel.bridgeAt")))) .. "|" ..
         tostring(bucketOf(tonumber(PANELUI.get("akdagent.panel.clientAt"))))
end

-- 输入框里有未发送内容 ⇒ 现在不能重绘（会打断打字）—— 主输入框与选项内文本框都算
function PANELUI.inputBusy()
  local function hasText(w)
    local v = PANELUI.wGet(w)
    if type(v) ~= "string" then return false end
    return #(string.gsub(v, "%s", "")) > 0
  end
  return hasText(PANELUI.widgets.input) or hasText(PANELUI.widgets.optText)
end

-- ── 轮询：读 scriptData 的入向更新（桥写的）──
function PANELUI.pull()
  PANELUI.safe(function()
    local rev = PANELUI.get(PANELUI.K.inRev)
    if type(rev) ~= "number" then rev = tonumber(rev) or 0 end
    if rev == PANELUI.inRev then return end
    PANELUI.inRev = rev
    local log = PANELUI.get(PANELUI.K.log)
    if type(log) == "string" then PANELUI.log = log PANELUI.wSet(PANELUI.widgets.log, log) end
    local askRaw = PANELUI.get(PANELUI.K.ask)
    if type(askRaw) == "string" and #askRaw > 0 then
      local a = PANELUI.decode(askRaw)
      if type(a) == "table" then
        local same = PANELUI.ask and a.seq == PANELUI.ask.seq
        PANELUI.ask = a
        if not same then PANELUI.picked = {} PANELUI.text = "" end
      end
    else
      PANELUI.ask = nil
      PANELUI.picked = {}
    end
    PANELUI.dirty = true
    -- 正在打字 ⇒ **推迟刷新**（refreshSidePanel 会重建面板、冲掉输入框焦点与内容）
    if PANELUI.inputBusy() then PANELUI.pendingRefresh = true return end
    PANELUI.refresh()
  end)
end

-- 循环：每 500ms 拉一次（面板里定时器可用 —— 探针实测 30 拍）
-- ⚠️ 状态行会**随时间变化**（"2s 前" → "3 分钟前"、桥停/起），而面板只在重绘时才重算 ⇒
--    必须每拍比一次状态文本，变了就 refresh，否则用户会看到"桥明明在跑却显示 ❌"（2026-09-15 实测踩到）。
function PANELUI.step()
  PANELUI.safe(function()
    PANELUI.pull()                      -- 有新内容（inRev 变）才重绘；正在打字时 pull 内部会推迟
    PANELUI.n = (PANELUI.n or 0) + 1
    if (PANELUI.n % 10) == 0 then       -- 每 5 秒才查一次状态（不是每拍）
      local key = PANELUI.statusKey()
      if key ~= PANELUI.statusKeyLast then
        PANELUI.statusKeyLast = key
        if not PANELUI.inputBusy() then
          PANELUI.dirty = true
          PANELUI.refresh()
        end
      end
    end
    -- 打字期间被推迟的刷新：输入框空了就补一次
    if PANELUI.pendingRefresh and not PANELUI.inputBusy() then
      PANELUI.pendingRefresh = false
      PANELUI.refresh()
    end
  end)
  pcall(function() SV:setTimeout(500, PANELUI.step) end)   -- 出错也重排，别断链
end

-- ── 宿主入口 ──
function PANELUI.buildState()
  local rows = {}
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = "测试：发送一条消息", value = PANELUI.widgets.testSend, width = 1.0 } } }
  -- 原「开启 / 关闭」位置 ⇒ 换成状态显示（用户 2026-09-15：桥必须手动运行）
  rows[#rows + 1] = { type = "Label", text = PANELUI.bridgeStatusLine() }
  rows[#rows + 1] = { type = "Label", text = PANELUI.clientStatusLine() }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "TextArea", value = PANELUI.widgets.log, height = 260, width = 1.0, readOnly = true } } }

  local a = PANELUI.ask
  if a ~= nil then
    rows[#rows + 1] = { type = "Label", text = "— " .. tostring(a.title or "请选择") .. " —" }
    if type(a.options) == "table" then
      for i = 1, #a.options do
        local o = a.options[i]
        rows[#rows + 1] = { type = "Label", text = i .. ". " .. tostring(o.label) .. (PANELUI.picked[o.id] and "（已选）" or "") }
      end
    end
    local cols = {}
    for i = 1, #(a.options or {}) do
      local o = a.options[i]
      if PANELUI.optWidgets[o.id] == nil then
        local w = PANELUI.mk("WidgetValue")
        PANELUI.optWidgets[o.id] = w
        local oid = o.id
        PANELUI.wOn(w, function()
          if PANELUI.ask == nil then return end
          if PANELUI.ask.multi then PANELUI.picked[oid] = not PANELUI.picked[oid]
          else PANELUI.picked = {} PANELUI.picked[oid] = true end
          local t = PANELUI.askText(PANELUI.ask)
          if t then PANELUI.append(t) end
          PANELUI.refresh()
        end)
      end
      cols[#cols + 1] = { type = "Button", text = (PANELUI.picked[o.id] and "（已选）" or "") .. tostring(o.label),
                          value = PANELUI.optWidgets[o.id], width = 1.0 }
      if #cols == 2 then rows[#rows + 1] = { type = "Container", columns = cols } cols = {} end
    end
    if #cols > 0 then rows[#rows + 1] = { type = "Container", columns = cols } end
    if a.textInput then
      rows[#rows + 1] = { type = "Container", columns = {
        { type = "TextArea", value = PANELUI.widgets.optText, height = 46, width = 1.0 } } }
    end
  end

  rows[#rows + 1] = { type = "Container", columns = {
    { type = "TextArea", value = PANELUI.widgets.input, height = 46, width = 1.0 } } }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = (a ~= nil) and "确认" or "发送", value = PANELUI.widgets.confirm, width = 0.5 },
    { type = "Button", text = (a ~= nil) and "跳过" or "停止", value = PANELUI.widgets.skip, width = 0.5 } } }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = "刷新", value = PANELUI.widgets.refresh, width = 0.5 } } }
  return { title = "AKDAgent", rows = rows }
end

function getSidePanelSectionState()
  local res = PANELUI.safe(PANELUI.buildState)
  if type(res) == "table" and type(res.rows) == "table" then return res end
  return { title = "AKDAgent", rows = {
    { type = "Label", text = "⚠️ 面板内部错误（已兜住）：" .. tostring(PANELUI.lastErr) } } }
end

function getClientInfo()
  local ok, res = pcall(function()
    return { name = "AKDAgent", category = "AKDAgent", author = "AKDAgent",
             versionNumber = 20, minEditorVersion = 65536, type = "SidePanelSection" }
  end)
  if ok and type(res) == "table" then return res end
  return { name = "AKDAgent", category = "AKDAgent", type = "SidePanelSection", minEditorVersion = 65536 }
end

-- ── 载入（全部 pcall；面板里报错会弹框中断脚本）──
do
  pcall(function()
    PANELUI.widgets.log = PANELUI.mk("WidgetValue")
    PANELUI.widgets.input = PANELUI.mk("WidgetValue")
    PANELUI.widgets.confirm = PANELUI.mk("WidgetValue")
    PANELUI.widgets.skip = PANELUI.mk("WidgetValue")
    PANELUI.widgets.refresh = PANELUI.mk("WidgetValue")
    PANELUI.widgets.optText = PANELUI.mk("WidgetValue")
    PANELUI.widgets.testSend = PANELUI.mk("WidgetValue")
    PANELUI.wOn(PANELUI.widgets.confirm, PANELUI.onConfirm)
    PANELUI.wOn(PANELUI.widgets.skip, PANELUI.onSkip)
    PANELUI.wOn(PANELUI.widgets.refresh, PANELUI.onRefresh)
    PANELUI.wOn(PANELUI.widgets.testSend, PANELUI.onTestSend)
    PANELUI.wOn(PANELUI.widgets.optText, function()
      local v = PANELUI.wGet(PANELUI.widgets.optText)
      PANELUI.text = (type(v) == "string") and v or ((v ~= nil) and tostring(v) or "")
    end)
    local prev = PANELUI.get(PANELUI.K.log)
    if type(prev) == "string" then PANELUI.log = prev end
    PANELUI.wSet(PANELUI.widgets.log, PANELUI.log)
    PANELUI.set(PANELUI.K.ready, PANELUI.VERSION)
    PANELUI.ready = true
    pcall(function() SV:setTimeout(500, PANELUI.step) end)
  end)
end
