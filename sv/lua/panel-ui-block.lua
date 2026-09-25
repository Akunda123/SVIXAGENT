-- ============================================================================
-- 面板 UI 块（追加在 AKDAgentBridge.lua 之后 ⇒ 与桥同处一个 chunk）
-- 产物：sv/lua/AKDAgentPanel.lua（由 tools/build-panel-lua.cjs 生成，别手改本块之外的桥代码）
-- 设计：一个 Lua 脚本同时当**侧栏面板 + 桥**
--   ① 宿主打开侧栏 ⇒ 加载本脚本 ⇒ `main()` 起轮询链 ⇒ **不需要手动跑桥**（用户 2026-09-15 要求）
--   ② 面板是 **Lua** ⇒ 有 `io` ⇒ **直接读写 jsonl**，不再需要 scriptData 中继（省一跳）
--   ③ 与"手动桥"的关系：AKDAgentBridge.lua 仍是纯桥（无 UI 块）；本文件是"面板版"
-- 用户 2026-09-15 定的 UI 规范见 docs/SidePanel桥设计.md §0（长信息框 / 不流式 / 一轮只加一次处理中 /
--   选项动态刷新 + 先在信息框重复一遍 / 多选「（已选）」/ 确认键 + 跳过键 / 从文件恢复）
-- ⚠️ 作用域纪律：本块用**一个命名空间表 UI** 承载状态与函数，尽量少用局部变量
--   （Lua 单函数最多 200 个活跃局部变量，桥本体已经用了不少）。
-- ============================================================================

UI = {
  VERSION = "0.1.0",
  logMax = 20000,
  pollInOffset = 0,       -- panel-in jsonl 已读偏移
  outSeq = 0,
  log = "",
  ask = nil,              -- {id,seq,title,options={{id,label},...},multi,textInput}
  picked = {},            -- [optId] = true
  text = "",              -- 选项内文本框内容
  greeted = false,
  dirty = true,           -- 需要刷新面板
  widgets = {},           -- 具名控件句柄
  optWidgets = {},        -- [optId] = 句柄（动态创建后复用，别丢）
  ready = false,
}

UI.path = {
  out  = ST.dir .. "\\akdagent-panel-" .. ST.host .. ".jsonl",       -- 面板 → 客户端
  in_  = ST.dir .. "\\akdagent-panel-in-" .. ST.host .. ".jsonl",    -- 客户端 → 面板
  log  = ST.dir .. "\\akdagent-panel-log-" .. ST.host .. ".txt",     -- 信息框文本（重启恢复用）
}

-- ⚠️ 硬纪律（2026-09-15 实测教训）：面板脚本里**任何错误都会弹宿主对话框并把脚本中断**
--   （v1 探针就是 tick 里对函数做算术 ⇒ 弹框 ⇒ 脚本死了、连文件都没写成）。
--   ⇒ ① 每个回调/入口都 pcall；② 数据字段名与函数名绝不重名；③ 出错就把错误显示在面板上，不抛。
function UI.safe(fn, ...)
  local ok, res = pcall(fn, ...)
  if not ok then
    UI.lastErr = tostring(res)
    pcall(function() log("panel ui error: " .. tostring(res)) end)
    return nil
  end
  return res
end

-- ── 安全调用小工具（成员可能是 userdata 带 __call，出错会弹框 ⇒ 一律 pcall）──
function UI.svCreate(typeName)
  local ok, w = pcall(function() return SV:create(typeName) end)
  if not ok or w == nil then
    log("panel: SV:create(" .. tostring(typeName) .. ") 失败 ⇒ 面板不可用：" .. tostring(w))
    return nil
  end
  return w
end

function UI.wGet(w)
  if w == nil then return nil end
  local ok, v = pcall(function() return w:getValue() end)
  if ok then return v end
  return nil
end

function UI.wSet(w, v)
  if w == nil then return false end
  local ok = pcall(function() w:setValue(v) end)
  return ok and true or false
end

function UI.wOn(w, fn)
  if w == nil then return false end
  local ok = pcall(function() w:setValueChangeCallback(fn) end)
  return ok and true or false
end

-- ── 信息框：追加 + 落盘（用户要求"每次行动直接接在之前的 string 上"）──
function UI.append(text)
  if type(text) ~= "string" or #text == 0 then return end
  local cur = UI.log
  if #cur > UI.logMax then cur = string.sub(cur, -UI.logMax) end
  UI.log = cur .. (#cur > 0 and "\n" or "") .. text
  UI.wSet(UI.widgets.log, UI.log)
  pcall(function() writeFile(UI.path.log, UI.log) end)   -- 落盘：重启可恢复
  UI.dirty = true
end

-- ── 面板 → 客户端：追加一行事件 ──
function UI.emit(kind, extra)
  UI.safe(function()
    UI.outSeq = UI.outSeq + 1
    local ev = { v = 1, seq = UI.outSeq, kind = kind, at = os.time(), panel = UI.VERSION }
    if type(extra) == "table" then
      for k, v in pairs(extra) do ev[k] = v end
    end
    local line = jenc(ev)
    local cur = readFile(UI.path.out) or ""
    if #cur > 262144 then cur = "" end
    local f = io.open(UI.path.out, "w")
    if f then f:write(cur .. line .. "\n") f:close() end
    log("panel: 发出事件 " .. tostring(kind) .. " seq=" .. tostring(UI.outSeq))
  end)
end

function UI.askText(a)
  if a == nil then return nil end
  local parts = {}
  if a.title and #a.title > 0 then parts[#parts + 1] = a.title end
  if type(a.options) == "table" then
    for i = 1, #a.options do
      local o = a.options[i]
      local mark = UI.picked[o.id] and "（已选）" or ""
      parts[#parts + 1] = i .. ". " .. tostring(o.label) .. mark
    end
  end
  if a.textInput then parts[#parts + 1] = "（可在下方文本框补充）" end
  return table.concat(parts, "\n")
end

function UI.clearAsk()
  UI.ask = nil
  UI.picked = {}
  UI.text = ""
  UI.dirty = true
end

-- ── 面板操作（全部 pcall 包裹：出错的唯一后果 = 面板上显示一行错，绝不弹框中断）──
function UI.onConfirm()
  UI.safe(function()
    local a = UI.ask
    if a ~= nil then
      local picked = {}
      for id, on in pairs(UI.picked) do if on then picked[#picked + 1] = id end end
      UI.emit("answer", { askId = a.id, picked = picked, text = UI.text or "" })
      UI.append("✔ 已提交：" .. (#picked > 0 and table.concat(picked, "、") or "(未选)") ..
        ((UI.text and #UI.text > 0) and ("（补充：" .. UI.text .. "）") or ""))
      UI.clearAsk()
    else
      local t = UI.wGet(UI.widgets.input)
      if type(t) ~= "string" then t = (t ~= nil) and tostring(t) or "" end
      t = string.gsub(t, "^%s+", ""); t = string.gsub(t, "%s+$", "")
      if #t == 0 then return end
      UI.emit("input", { text = t })
      UI.append("🧑 " .. t)                      -- 用户输入进信息框（用户 2026-09-15 指定）
      UI.wSet(UI.widgets.input, "")
      UI.dirty = true
    end
  end)
end

function UI.onSkip()
  UI.safe(function()
    local a = UI.ask
    if a ~= nil then
      UI.emit("skip", { askId = a.id })
      UI.append("⏭ 已跳过（让 agent 自己定）")
      UI.clearAsk()
    else
      UI.emit("stop", {})
      UI.append("⏹ 已请求停止")
    end
  end)
end

function UI.onRefresh()
  UI.pollInbox()
  UI.dirty = true
  UI.refresh()
end

-- ── 顶部「开启 / 关闭」：控制桥本体（用户 2026-09-15 要求，放在面板最上方）──
-- 关闭 = 停止轮询请求 + 不写心跳（心跳过期 ⇒ 客户端自然判定离线），**面板 UI 继续跑**（否则开不回来）
-- 开启 = 恢复正常轮询与心跳
function UI.setBridge(on)
  PANEL_BRIDGE_ENABLED = on and true or false     -- 桥的 scheduleLoop 读这个全局
  if on then
    ST.suspendLogged = false
    UI.append("▶️ 桥：已开启（轮询与心跳恢复）")
  else
    UI.append("⏸ 桥：已关闭（不再响应客户端；再点「开启」即可恢复）")
  end
  UI.dirty = true
  UI.refresh()
end

-- ── 最上方的「测试：发送一条消息」按钮（用户 2026-09-15 要求，便于验收面板→客户端方向）──
-- 按一下 = 等价于在当前输入框里发一条固定测试文本（带时间戳，便于对账）
function UI.onTestSend()
  local t = "测试消息（面板按钮 " .. os.date("%H:%M:%S") .. "）"
  UI.emit("input", { text = t })
  UI.append("🧑 " .. t)
  UI.dirty = true
  UI.refresh()
end

function UI.bridgeStateText()
  return (PANEL_BRIDGE_ENABLED == false) and "桥：已关闭" or "桥：已开启"
end

function UI.refresh()
  pcall(function() SV:refreshSidePanel() end)     -- 2.1.2+；没有就只更新状态（宿主可能不重绘）
end

-- ── 客户端 → 面板：读 panel-in jsonl 的新行（整段 pcall：I/O 失败也不许弹框）──
function UI.pollInbox()
  UI.safe(function()
    local text = readFile(UI.path.in_)
    if text == nil then UI.pollInOffset = 0 return end
    if #text < UI.pollInOffset then UI.pollInOffset = 0 end     -- 文件被重建
    if #text == UI.pollInOffset then return end
    local chunk = string.sub(text, UI.pollInOffset + 1)
    UI.pollInOffset = #text
    for line in string.gmatch(chunk, "[^\r\n]+") do
      local ok, ev = pcall(jdec, line)
      if ok and type(ev) == "table" then
        local kind = tostring(ev.kind or "")
        if kind == "append" then
          UI.append(tostring(ev.text or ""))
        elseif kind == "ask" then
          UI.ask = { id = ev.id, seq = ev.seq, title = tostring(ev.title or ""),
                     options = ev.options, multi = ev.multi and true or false, textInput = ev.textInput }
          UI.picked = {}
          UI.text = ""
          local t = UI.askText(UI.ask)
          if t then UI.append(t) end               -- 选项**先在信息框重复一遍**（用户要求）
        elseif kind == "clear" then
          UI.clearAsk()
          UI.log = ""
          UI.wSet(UI.widgets.log, "")
          pcall(function() writeFile(UI.path.log, "") end)
        elseif kind == "hello" then
          UI.append(tostring(ev.text or "桥连接成功"))
        end
        UI.dirty = true
      else
        log("panel: panel-in 里有一行不是合法 JSON，已跳过")
      end
    end
    if UI.dirty then UI.refresh() end
  end)
end

-- ── 桥每拍调（见 AKDAgentBridge.lua 的 1c 钩子）；整体 pcall，出错只记一行 ──
function PANEL_UI_TICK()
  UI.safe(function()
    if not UI.ready then return end
    if not UI.greeted then
      UI.greeted = true
      UI.append("✅ 桥连接成功（" .. tostring(ST.hostName or ST.host) .. " " .. tostring(ST.hostVer or "?") ..
        " · 桥 " .. CFG.VERSION .. " · 面板 " .. UI.VERSION .. "）")
      UI.append("ℹ️ 本面板已自带桥，不用再手动运行 AKDAgentBridge.lua")
      -- 连上桥之后立刻告诉用户"悬浮球有没有连"（用户 2026-09-15 要求）
      UI.append(PANEL.clientLine())
    end
    UI.pollInbox()
  end)
end

-- 供桥调用：往面板信息框追加一行（在线状态变化提醒用；纯桥版走 scriptData）
function PANEL_UI_APPEND(text)
  if not UI.ready then return end
  pcall(UI.append, text)
end

-- ── 宿主调用：面板结构（每次重绘都调；行数随选项数变化 = 动态选项）──
function UI.buildState()
  local rows = {}
  -- ⓪-0 最上方：测试按钮（按一下 = 发一条消息；验收"面板→客户端"用）
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = "测试：发送一条消息", value = UI.widgets.testSend, width = 1.0 } } }

  -- ⓪ 并排的「开启 / 关闭」（用户 2026-09-15 要求；控制桥本体）+ 当前状态
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = "开启", value = UI.widgets.bridgeOn, width = 0.5 },
    { type = "Button", text = "关闭", value = UI.widgets.bridgeOff, width = 0.5 } } }
  rows[#rows + 1] = { type = "Label", text = UI.bridgeStateText() }

  -- ① 长信息框（只读、可滚）
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "TextArea", value = UI.widgets.log, height = 260, width = 1.0, readOnly = true } } }

  local a = UI.ask
  if a ~= nil then
    rows[#rows + 1] = { type = "Label", text = "— " .. tostring(a.title or "请选择") .. " —" }
    -- ⑤ 选项文字先重复一遍（避免按钮文字显示不全）
    if type(a.options) == "table" then
      for i = 1, #a.options do
        local o = a.options[i]
        rows[#rows + 1] = { type = "Label", text = i .. ". " .. tostring(o.label) .. (UI.picked[o.id] and "（已选）" or "") }
      end
    end
    -- ⑧ 选项内文本输入
    if a.textInput then
      rows[#rows + 1] = { type = "Container", columns = {
        { type = "TextArea", value = UI.widgets.optText, height = 46, width = 1.0 } } }
    end
    -- ⑥ 按钮：多选切换，文字带「（已选）」
    local cols = {}
    if type(a.options) == "table" then
      for i = 1, #a.options do
        local o = a.options[i]
        if UI.optWidgets[o.id] == nil then
          local w = UI.svCreate("WidgetValue")
          UI.optWidgets[o.id] = w
          local oid = o.id
          UI.wOn(w, function()
            UI.safe(function()
              if UI.ask == nil then return end
              if UI.ask.multi then UI.picked[oid] = not UI.picked[oid]
              else UI.picked = {} UI.picked[oid] = true end
              local t = UI.askText(UI.ask)         -- 选中状态也同步进信息框
              if t then UI.append(t) end
              UI.refresh()
            end)
          end)
        end
        cols[#cols + 1] = { type = "Button",
          text = (UI.picked[o.id] and "（已选）" or "") .. tostring(o.label),
          value = UI.optWidgets[o.id], width = 1.0 }
        if #cols == 2 then
          rows[#rows + 1] = { type = "Container", columns = cols }
          cols = {}
        end
      end
    end
    if #cols > 0 then rows[#rows + 1] = { type = "Container", columns = cols } end
  end

  -- ③ 输入框（不长）+ ④ 确认/跳过 + 手动刷新
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "TextArea", value = UI.widgets.input, height = 46, width = 1.0 } } }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = (a ~= nil) and "确认" or "发送", value = UI.widgets.confirm, width = 0.5 },
    { type = "Button", text = (a ~= nil) and "跳过" or "停止", value = UI.widgets.skip, width = 0.5 } } }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = "刷新", value = UI.widgets.refresh, width = 0.5 } } }

  return { title = "AKDAgent", rows = rows }
end

-- 宿主每次重绘都会调这个入口：**必须永不抛错**（抛错 = 弹错误框 + 脚本被中断）
function getSidePanelSectionState()
  local res = UI.safe(UI.buildState)
  if type(res) == "table" and type(res.rows) == "table" then return res end
  return { title = "AKDAgent", rows = {
    { type = "Label", text = "⚠️ 面板内部错误（已兜住，未中断脚本）：" },
    { type = "Container", columns = {
      { type = "TextArea", value = UI.widgets.log, height = 120, width = 1.0, readOnly = true } } },
  } }
end

function getClientInfo()
  local ok, res = pcall(function()
    return {
      name = "AKDAgent",
      category = "AKDAgent",
      author = "AKDAgent",
      versionNumber = 15,
      -- ⚠️ 放宽到 1.0.0：IX 只报 1.0.0（65536），写 2.1.2 会让 IX 里看不到本面板。
      --    refreshSidePanel（2.1.2+）是**运行时**存在性检查（UI.refresh 里 pcall）。
      minEditorVersion = 65536,
      type = "SidePanelSection",
    }
  end)
  if ok and type(res) == "table" then return res end
  return { name = "AKDAgent", category = "AKDAgent", type = "SidePanelSection", minEditorVersion = 65536 }
end

-- ── 载入时初始化控件与恢复上次内容 ──
function UI.init()
  UI.widgets.log      = UI.svCreate("WidgetValue")
  UI.widgets.input    = UI.svCreate("WidgetValue")
  UI.widgets.confirm  = UI.svCreate("WidgetValue")
  UI.widgets.skip     = UI.svCreate("WidgetValue")
  UI.widgets.refresh  = UI.svCreate("WidgetValue")
  UI.widgets.optText  = UI.svCreate("WidgetValue")
  UI.widgets.bridgeOn = UI.svCreate("WidgetValue")
  UI.widgets.bridgeOff= UI.svCreate("WidgetValue")
  UI.widgets.testSend = UI.svCreate("WidgetValue")
  if UI.widgets.log == nil then
    log("panel: 控件创建失败 ⇒ 本宿主可能不支持 WidgetValue")
    return false
  end
  -- ⑨ 恢复上次内容（落盘在 akdagent-panel-log-<host>.txt）
  local prev = readFile(UI.path.log)
  if type(prev) == "string" then UI.log = prev end
  UI.wSet(UI.widgets.log, UI.log)
  UI.wSet(UI.widgets.input, "")
  UI.wOn(UI.widgets.confirm, function() UI.safe(UI.onConfirm) end)
  UI.wOn(UI.widgets.skip, function() UI.safe(UI.onSkip) end)
  UI.wOn(UI.widgets.refresh, function() UI.safe(UI.onRefresh) end)
  UI.wOn(UI.widgets.bridgeOn, function() UI.safe(UI.setBridge, true) end)
  UI.wOn(UI.widgets.bridgeOff, function() UI.safe(UI.setBridge, false) end)
  UI.wOn(UI.widgets.testSend, function() UI.safe(UI.onTestSend) end)
  UI.wOn(UI.widgets.optText, function()
    local v = UI.wGet(UI.widgets.optText)
    UI.text = (type(v) == "string") and v or ((v ~= nil) and tostring(v) or "")
  end)
  UI.ready = true
  log("panel: 面板已初始化（面板 " .. UI.VERSION .. " · 桥 " .. CFG.VERSION .. " · host=" .. tostring(ST.host) .. "）")
  return true
end

pcall(UI.init)
