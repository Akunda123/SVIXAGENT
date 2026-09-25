# AKDAgent Bridge / Panel -- install into Synthesizer V Studio / Instrument X
# Copies the Lua file-channel bridge (AKDAgentBridge.lua) into each host's scripts\Agent dir,
# and the JS side-panel script (AKDAgentPanel.js) ONLY into hosts that actually have a side panel
# (SV Studio 2 / Instrument X). SV1 and the OPSV (flat) build have no side panel and no
# project scriptData, and SV1's script menu would list the .js too => a menu entry that errors
# when clicked. So: bridge everywhere, panel only for sv2 / ix.
#
# !! KEEP THIS FILE ASCII-ONLY !!
# Windows PowerShell 5.1 decodes a BOM-less script using the ANSI code page (gb2312 here), so any
# non-ASCII literal would print as mojibake. (Same lesson as tools/pack-mac-payload.ps1, which is
# kept ASCII-only for the same reason.)
#
# Usage: powershell -ExecutionPolicy Bypass -File sv\install.ps1

$ErrorActionPreference = "Stop"

$luaDir  = Join-Path $PSScriptRoot "lua"
$panelDir = Join-Path $PSScriptRoot "panel"
$bridge  = Join-Path $luaDir "AKDAgentBridge.lua"
$panel   = Join-Path $panelDir "AKDAgentPanel.js"

if (-not (Test-Path $bridge)) { Write-Host "missing $bridge" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $panel))  { Write-Host "missing $panel (panel will be skipped)" -ForegroundColor Yellow }

$targets = @(
    @{ Name = "SV1";  Kind = "sv1";  Dir = Join-Path $env:USERPROFILE "Documents\Dreamtonics\Synthesizer V Studio\scripts" },
    @{ Name = "SV2";  Kind = "sv2";  Dir = Join-Path $env:APPDATA "Dreamtonics\Synthesizer V Studio 2\scripts" },
    @{ Name = "IX";   Kind = "ix";   Dir = Join-Path $env:APPDATA "Dreamtonics\Instrument X\scripts" },
    @{ Name = "OPSV"; Kind = "opsv"; Dir = Join-Path $env:USERPROFILE "Documents\OPSV\Dreamtonics\Synthesizer V Studio\scripts" }
)
# Only these host kinds get the side panel (must match electron/src/main.js hostKindOfScriptsDir)
$panelKinds = @("sv2", "ix")

foreach ($t in $targets) {
    if (-not (Test-Path $t.Dir)) {
        Write-Host ("[{0}] scripts dir not found, skipped: {1}" -f $t.Name, $t.Dir) -ForegroundColor Yellow
        continue
    }
    $sub = Join-Path $t.Dir "Agent"
    New-Item -ItemType Directory -Path $sub -Force | Out-Null

    Copy-Item -Path $bridge -Destination (Join-Path $sub "AKDAgentBridge.lua") -Force
    Write-Host ("[{0}] bridge  -> {1}" -f $t.Name, (Join-Path $sub "AKDAgentBridge.lua")) -ForegroundColor Green

    if ($panelKinds -contains $t.Kind) {
        if (Test-Path $panel) {
            Copy-Item -Path $panel -Destination (Join-Path $sub "AKDAgentPanel.js") -Force
            Write-Host ("[{0}] panel   -> {1}" -f $t.Name, (Join-Path $sub "AKDAgentPanel.js")) -ForegroundColor Green
        }
    } else {
        Write-Host ("[{0}] panel skipped (no side panel on this host)" -f $t.Name) -ForegroundColor DarkGray
    }

    # Retired Lua panel (replaced by the JS one on 2026-09-15): keep a backup, remove the live file
    # -- leaving it is a landmine in the host's script menu.
    $retired = Join-Path $sub "AKDAgentPanel.lua"
    if (Test-Path $retired) {
        $bak = "$retired.bak-retired-$(Get-Date -Format yyyyMMdd)"
        Copy-Item -Path $retired -Destination $bak -Force
        Remove-Item -Path $retired -Force
        Write-Host ("[{0}] retired Lua panel removed (backup: {1})" -f $t.Name, $bak) -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Next: open the host, then Script menu -> Agent -> AKDAgent Bridge -> Run" -ForegroundColor Cyan
Write-Host "(SV2 / IX: the side panel shows up under Agent; SV1 / OPSV: use the floating orb only)" -ForegroundColor Cyan
