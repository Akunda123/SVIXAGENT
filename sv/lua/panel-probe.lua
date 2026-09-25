-- ============================================================================
-- 面板能力探针 v2（2026-09-15）—— 一次性实验脚本（验完即删）
--
-- 验三件事（用户提的假设）：
--   A「面板内不允许循环函数」   ⇒ tick 计数是否持续增长
--   B「面板不允许通信（文件 I/O）」⇒ 载入时的写入结果 + 多路径试探
--   C「改用 scriptData」        ⇒ 能否写 scriptData（能 ⇒ 备选通道可行）
--
-- ⚠️ v1 的坑（已修，记下来）：
--   1) 我把 `PROBE.tick` 同时用作**数字计数**和**函数名** ⇒ 函数覆盖数字 ⇒
--      `PROBE.tick + 1` 报 "arithmetic on a function value" **并弹出脚本错误框**。
--      ⇒ 规矩：**表里的函数名与数据字段名绝不能重名**（现在计数叫 PROBE.n，函数叫 PROBE.step）。
--   2) 这个错误框还说明：**面板脚本的报错会弹宿主对话框**（很可能同时冻住桥）⇒
--      面板里每一处回调都必须 pcall 包住，绝不让错误冒到顶层。
--
-- 证据两条腿：① 尽量写文件（%TEMP%）；② **无论写没写成，都把结论显示在面板上**（I/O 被禁时只能靠面板）。
-- 外部读取（若文件可写）：node tools/check-panel-probe.cjs ix
-- ============================================================================

PROBE = {
  n = 0,                  -- 拍计数（v1 曾与函数重名，别再犯）
  fileOK = false,
  fileErr = "未试",
  paths = {},
  sdOK = false,
  sdErr = "未试",
  timer = "?",
  ioType = "?",
  osType = "?",
  canRefresh = false,
  host = "?",
  temp = nil,
  lastErr = nil,
}

do
  local ok, info = pcall(function() return SVH.info() end)
  if ok and type(info) == "table" and info.host then PROBE.host = tostring(info.host) end
  PROBE.ioType = type(io)
  PROBE.osType = type(os)
  local ok2, t = pcall(function() return os.getenv("TEMP") end)
  if ok2 then PROBE.temp = t end
  PROBE.path = tostring(PROBE.temp or ".") .. "\\akdagent-panel-probe-" .. PROBE.host .. ".txt"
  PROBE.path2 = tostring(PROBE.temp or ".") .. "\\akdagent-panel-probe2-" .. PROBE.host .. ".txt"
end

-- ① 文件 I/O 试探（多个候选路径，逐个记结果）
function PROBE.tryWrite(path, text)
  local ok, res = pcall(function()
    if type(io) ~= "table" or type(io.open) ~= "function" then return "io 不可用（type(io)=" .. PROBE.ioType .. "）" end
    local f = io.open(path, "a")
    if f == nil then return "io.open 返回 nil（权限/沙箱拒绝？）" end
    f:write(text .. "\n")
    f:close()
    return nil
  end)
  if not ok then return "异常：" .. tostring(res) end
  if res == nil then PROBE.fileOK = true return nil end
  return tostring(res)
end

function PROBE.append(line)
  local stamp = os.date("%H:%M:%S")
  local e1 = PROBE.tryWrite(PROBE.path, stamp .. " " .. line)
  PROBE.paths[PROBE.path] = e1 or "ok"
  if e1 then
    local e2 = PROBE.tryWrite(PROBE.path2, stamp .. " " .. line)
    PROBE.paths[PROBE.path2] = e2 or "ok"
    PROBE.fileErr = e1
  else
    PROBE.fileErr = nil
  end
  return not e1
end

-- ③ scriptData（备选通道）
function PROBE.sd(key, value)
  local ok, res = pcall(function()
    local p = SV:getProject()
    p:setScriptData(key, value)
    return true
  end)
  if ok then PROBE.sdOK = true PROBE.sdErr = nil return true end
  PROBE.sdErr = tostring(res)
  return false
end

function PROBE.detectTimer()
  local ok, t = pcall(function() return SV.setTimeout end)
  if ok and t ~= nil then PROBE.timer = "SV.setTimeout:" .. type(t) return true end
  local ok2, t2 = pcall(function() return setTimeout end)
  if ok2 and t2 ~= nil then PROBE.timer = "G.setTimeout:" .. type(t2) return true end
  PROBE.timer = "none"
  return false
end

PROBE.widgets = {}
function PROBE.mk(t)
  local ok, w = pcall(function() return SV:create(t) end)
  if ok then return w end
  return nil
end

-- ② 循环：每次重排自己。**整个函数体 pcall 包住**，永不让错误弹框（v1 的教训）
function PROBE.step()
  local ok, err = pcall(function()
    PROBE.n = PROBE.n + 1
    PROBE.append("tick#" .. PROBE.n .. " file=" .. tostring(PROBE.fileOK) .. " sd=" .. tostring(PROBE.sdOK))
    PROBE.sd("akdagent.probe.tick", PROBE.n)
    PROBE.sd("akdagent.probe.at", os.time())
    if PROBE.widgets.status then
      pcall(function()
        PROBE.widgets.status:setValue("tick = " .. PROBE.n .. " · " .. os.date("%H:%M:%S"))
      end)
    end
    if PROBE.canRefresh then pcall(function() SV:refreshSidePanel() end) end
  end)
  if not ok then PROBE.lastErr = tostring(err) end
  pcall(function() SV:setTimeout(500, PROBE.step) end)   -- 无论如何都重排，别断链
end

function PROBE.summary()
  local lines = {
    "载入 " .. os.date("%H:%M:%S") .. " · 宿主 " .. PROBE.host,
    "A 循环：" .. (PROBE.n > 0 and ("✅ 在跑（已 " .. PROBE.n .. " 拍）") or "❓ 等第一拍…（若一直 0 ⇒ 面板内循环不可用）"),
    "B 写文件：" .. (PROBE.fileOK and "✅ 成功" or ("❌ " .. tostring(PROBE.fileErr))),
    "   io=" .. PROBE.ioType .. " · TEMP=" .. tostring(PROBE.temp),
    "C scriptData：" .. (PROBE.sdOK and "✅ 可写" or ("❌ " .. tostring(PROBE.sdErr))),
    "定时器：" .. PROBE.timer,
    "refreshSidePanel：" .. tostring(PROBE.canRefresh),
  }
  if PROBE.lastErr then lines[#lines + 1] = "上次 tick 异常：" .. PROBE.lastErr end
  return table.concat(lines, "\n")
end

function getSidePanelSectionState()
  local rows = {}
  rows[#rows + 1] = { type = "Label", text = "能力探针 v2：A 循环 / B 写文件 / C scriptData" }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "TextArea", value = PROBE.widgets.status, height = 40, width = 1.0, readOnly = true } } }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "TextArea", value = PROBE.widgets.log, height = 200, width = 1.0, readOnly = true } } }
  rows[#rows + 1] = { type = "Container", columns = {
    { type = "Button", text = "刷新结论", value = PROBE.widgets.refresh, width = 1.0 } } }
  return { title = "AKDAgent 探针", rows = rows }
end

function getClientInfo()
  return {
    name = "AKDAgent-Probe", category = "AKDAgent", author = "AKDAgent",
    versionNumber = 2, minEditorVersion = 65536, type = "SidePanelSection",
  }
end

-- 载入：**每一处都用 pcall**，绝不让错误弹框（v1 就是弹框冻了宿主）
do
  local ok, err = pcall(function()
    PROBE.widgets.status = PROBE.mk("WidgetValue")
    PROBE.widgets.log = PROBE.mk("WidgetValue")
    PROBE.widgets.refresh = PROBE.mk("WidgetValue")
    local okR, r = pcall(function() return SV.refreshSidePanel end)
    PROBE.canRefresh = (okR and r ~= nil)
    local hasTimer = PROBE.detectTimer()
    PROBE.append("== load v2 == io=" .. PROBE.ioType .. " timer=" .. PROBE.timer .. " refresh=" .. tostring(PROBE.canRefresh))
    PROBE.sd("akdagent.probe.load", os.date("%H:%M:%S"))
    if PROBE.widgets.log then pcall(function() PROBE.widgets.log:setValue(PROBE.summary()) end) end
    if PROBE.widgets.status then pcall(function() PROBE.widgets.status:setValue("等第一拍…") end) end
    if PROBE.widgets.refresh then
      pcall(function()
        PROBE.widgets.refresh:setValueChangeCallback(function()
          pcall(function()
            PROBE.widgets.log:setValue(PROBE.summary())
            if PROBE.canRefresh then SV:refreshSidePanel() end
          end)
        end)
      end)
    end
    if hasTimer then pcall(function() SV:setTimeout(500, PROBE.step) end) end
  end)
  if not ok then
    pcall(function() PROBE.append("== load 异常 == " .. tostring(err)) end)
  end
end
