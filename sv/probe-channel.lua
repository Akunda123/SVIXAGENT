--[[
Probe Channel (Lua) — 探测 SV 的 Lua 脚本环境有没有 io / os（文件 IPC 的前提）
================================================================================
目的：上游 Lua 桥声称用「关联式 JSON 文件 IPC」，而 SV 脚本 API 没有文件函数
      （api/SV.md 全量确认：唯一通道是 getHostClipboard / setHostClipboard）。
      故推测它借的是 Lua 标准库 io。本脚本验证这一点。

只测不写：先只做 type(io) / type(os) / io.open 存在性判断；
      仅当 io 可用时，才往 %TEMP% 写一个 1 行探针文件并读回（用完删除）。
      不动剪贴板、不改工程。

用法：放进 SV scripts 目录 → 脚本菜单 → 运行。
      若脚本菜单里根本看不到 .lua，说明该版本不支持 Lua 脚本 —— 这本身也是结论。
]]

function getClientInfo()
  return {
    name = "Probe Channel (Lua)",
    category = "AKDAgent",
    author = "AKDAgent",
    versionNumber = 1,
    minEditorVersion = 65540
  }
end

function main()
  local out = {}
  local function add(s) out[#out + 1] = s end

  add("[Lua 环境]")
  add("  _VERSION   = " .. tostring(_VERSION))
  add("  type(io)   = " .. type(io))
  add("  type(os)   = " .. type(os))
  add("  type(require) = " .. type(require))
  add("  type(package) = " .. type(package))
  add("  type(string)  = " .. type(string))

  local ioOpen = "nil"
  if type(io) == "table" and type(io.open) == "function" then ioOpen = "function" end
  add("  io.open    = " .. ioOpen)

  local getenv = "nil"
  if type(os) == "table" and type(os.getenv) == "function" then getenv = "function" end
  add("  os.getenv  = " .. getenv)

  add("")
  add("[SV API]")
  add("  type(SV)              = " .. type(SV))
  add("  SV.getHostClipboard   = " .. type(SV and SV.getHostClipboard))
  add("  SV.setHostClipboard   = " .. type(SV and SV.setHostClipboard))
  add("  SV.showMessageBox     = " .. type(SV and SV.showMessageBox))

  local ok, info = pcall(function() return SV.getHostInfo() end)
  if ok and info then
    add("  hostName    = " .. tostring(info.hostName))
    add("  hostVersion = " .. tostring(info.hostVersion))
    add("  osType      = " .. tostring(info.osType))
  else
    add("  getHostInfo 调用失败")
  end

  -- 仅当 io 可用才做一次真实的读回探针（临时文件，用完即删）
  add("")
  add("[文件通道实测]")
  if ioOpen == "function" then
    local dir = ""
    if getenv == "function" then dir = tostring(os.getenv("TEMP") or os.getenv("TMP") or "") end
    if dir == "" then dir = "." end
    local path = dir .. "/akdagent_channel_probe.txt"
    local f = io.open(path, "w")
    if f then
      f:write("AKDAGENT_PROBE_OK")
      f:close()
      local g = io.open(path, "r")
      local content = ""
      if g then content = g:read("*a") or ""; g:close() end
      local d = io.open(path, "r")
      add("  写入: 成功")
      add("  路径: " .. path)
      add("  读回: " .. content)
    else
      add("  写入: 失败（io.open 返回 nil —— 沙箱可能拦了文件系统）")
    end
  else
    add("  跳过：io 不可用 ⇒ 文件 IPC 在 Lua 里也走不通")
  end

  SV.showMessageBox("Probe Channel (Lua)", table.concat(out, "\n"))
end
