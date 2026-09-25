# AKDAgent Bridge — 安装到 Synthesizer V Studio
# 把 Lua 文件通道桥 AKDAgentBridge.lua 复制到各宿主版本的 scripts 目录（Agent 子目录）。
# 2026-09-12：JS 剪贴板桥已退役（其归档目录 legacy/ 亦于 2026-09-19 删除）⇒ 这里只装 Lua 桥。
# 覆盖：SV1 文档目录 / SV2 AppData / OPSV 便携(Flat)版。
# 用法: powershell -ExecutionPolicy Bypass -File sv\install.ps1

$ErrorActionPreference = "Stop"

$bridge = Join-Path $PSScriptRoot "lua\AKDAgentBridge.lua"
if (-not (Test-Path $bridge)) {
    Write-Host "未找到 $bridge" -ForegroundColor Red
    exit 1
}

$targets = @(
    @{ Name = "SV1"; Dir = "C:\Users\$env:USERNAME\Documents\Dreamtonics\Synthesizer V Studio\scripts" },
    @{ Name = "SV2"; Dir = "C:\Users\$env:USERNAME\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts" },
    @{ Name = "IX"; Dir = "C:\Users\$env:USERNAME\AppData\Roaming\Dreamtonics\Instrument X\scripts" },
    @{ Name = "OPSV_Flat"; Dir = "C:\Users\$env:USERNAME\Documents\OPSV\Dreamtonics\Synthesizer V Studio\scripts" }
)

foreach ($t in $targets) {
    $sub = Join-Path $t.Dir "Agent"
    if (-not (Test-Path $t.Dir)) {
        Write-Host "[$($t.Name)] scripts 目录不存在，跳过: $($t.Dir)" -ForegroundColor Yellow
        continue
    }
    New-Item -ItemType Directory -Path $sub -Force | Out-Null
    Copy-Item -Path $bridge -Destination (Join-Path $sub "AKDAgentBridge.lua") -Force
    Write-Host "[$($t.Name)] 已安装 -> $sub\AKDAgentBridge.lua" -ForegroundColor Green
}

Write-Host ""
Write-Host "下一步：打开 Synthesizer V Studio，脚本菜单 -> Agent -> AKDAgent Bridge -> 运行" -ForegroundColor Cyan
