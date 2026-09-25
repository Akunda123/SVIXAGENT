-- ============================================================================
-- 面板脚本单元测试（2026-09-15）—— 离线跑，不需要宿主
--   运行：python tools/lua-vm.py sv/lua/tests/test-panel.lua
--   原理：用**假 SV 环境**加载真面板脚本，逐个调用宿主会调的入口，任何 Lua 错误都会被抓住。
--   为什么必须有：面板脚本里报错会**弹宿主对话框并中断脚本**（v1 探针实测），
--   而这些错误（拼 nil、字段与函数重名、JS 式注释…）**本地就能测出来**，不该让用户去踩。
-- ============================================================================

local fails = 0
local function ok(cond, label)
  if cond then print("  [ok]   " .. label)
  else print("  [FAIL] " .. label) fails = fails + 1 end
end

-- ── 假 SV 环境（面板只用这些成员）──
local sd = {}
local widgetsCreated = 0
SV = {}
SV.getProject = function()
  return {
    getScriptData = function(_, k) return sd[k] end,
    setScriptData = function(_, k, v) sd[k] = v end,
  }
end
SV.create = function(_, t)
  widgetsCreated = widgetsCreated + 1
  return {
    setValue = function(_, v) end,
    getValue = function(_) return "" end,
    setValueChangeCallback = function(_, fn) end,
  }
end
SV.setTimeout = function(_, ms, fn) end          -- 不真跑循环，测试只调入口
SV.refreshSidePanel = function() end

-- ── 加载真面板脚本 ──
local path = "sv/panel/AKDAgentPanel.lua"
local chunk, err = loadfile(path)
ok(chunk ~= nil, "面板脚本可编译（" .. tostring(err or path) .. "）")
if chunk == nil then os.exit(1) end
local okLoad, errLoad = pcall(chunk)
ok(okLoad, "面板脚本可加载执行（" .. tostring(errLoad) .. "）")

print("")
print("== 宿主入口（宿主会在这些地方调）==")
ok(type(getClientInfo) == "function", "getClientInfo 是全局函数")
ok(type(getSidePanelSectionState) == "function", "getSidePanelSectionState 是全局函数")

local ci
local okCi, errCi = pcall(function() ci = getClientInfo() end)
ok(okCi and type(ci) == "table", "getClientInfo() 不抛错")
ok(okCi and ci.type == "SidePanelSection", "声明 type=SidePanelSection")
ok(okCi and type(ci.minEditorVersion) == "number", "minEditorVersion 是数字（IX 1.0.0=65536 能被列出）")

-- ① 干净状态（没有桥数据）：这里曾经拼 nil 报错
local st
local okSt, errSt = pcall(function() st = getSidePanelSectionState() end)
ok(okSt, "getSidePanelSectionState() 空状态不抛错（" .. tostring(errSt) .. "）")
ok(okSt and type(st) == "table" and type(st.rows) == "table" and #st.rows > 0, "返回了 {title, rows}")

-- ② 桥在线 + 悬浮球在线
sd["akdagent.panel.bridgeAt"] = os.time()
sd["akdagent.panel.bridgeVer"] = "0.3.7"
sd["akdagent.panel.clientAt"] = os.time()
local okSt2, errSt2 = pcall(function() st = getSidePanelSectionState() end)
ok(okSt2, "桥/悬浮球都在线时不抛错（" .. tostring(errSt2) .. "）")

-- ③ 桥已停（时间戳很旧）
sd["akdagent.panel.bridgeAt"] = os.time() - 600
sd["akdagent.panel.clientAt"] = 0
local okSt3, errSt3 = pcall(function() st = getSidePanelSectionState() end)
ok(okSt3, "桥已停 + 悬浮球未连时不抛错（" .. tostring(errSt3) .. "）")

-- ④ 带提问的入向数据（桥写的 JSON），走一遍 pull → 重绘
sd["akdagent.panel.ask"] = '{"id":"q1","seq":"r1","title":"选一个","options":[{"id":"o1","label":"A"},{"id":"o2","label":"B"}],"multi":true,"text":"请选择"}'
sd["akdagent.panel.inRev"] = 1
local okPull, errPull = pcall(function() PANELUI.pull() end)
ok(okPull, "pull() 消费提问 JSON 不抛错（" .. tostring(errPull) .. "）")
local okSt4, errSt4 = pcall(function() st = getSidePanelSectionState() end)
ok(okSt4, "有提问时重绘不抛错（" .. tostring(errSt4) .. "）")

-- ⑤ 状态文案里不能出现 "nil"
local txt = ""
pcall(function()
  txt = tostring(PANELUI.bridgeStatusLine()) .. tostring(PANELUI.clientStatusLine())
end)
ok(not string.find(txt, "nil", 1, true), "状态文案里没有 nil（实际：" .. txt:sub(1, 40) .. "…）")

-- ⑥ 面板不该出现 JS 式注释（Lua 只认 --；这条曾让部署出去的面板一打开就报错）
-- ⚠️ 必须用**纯文本查找**（第 4 参 true）：string.find 默认按 Lua 模式解析，
--    "*/" 里的 `*` 会被当量词 ⇒ 误报（本测试第一版就踩了这个）。
local f = io.open(path, "r")
if f then
  local src = f:read("*a")
  f:close()
  local hasJs = (string.find(src, "/*", 1, true) ~= nil) or (string.find(src, "*/", 1, true) ~= nil)
  ok(not hasJs, "没有 JS 式 /* */ 注释")
else
  print("  [--]   跳过 JS 注释检查（读不到源文件）")
end

print("")
print("===== 结果：" .. (fails == 0 and "全部通过" or (fails .. " 项失败")) .. " =====")
if fails > 0 then os.exit(1) end
