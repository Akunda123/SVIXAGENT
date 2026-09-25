<#
  pack-mac-payload.ps1 -- build ONE zip that contains everything a borrowed Mac needs.

  Why this exists: the repo has no remote yet (0 commits), so the Mac cannot `git clone`.
  This script packs the working tree plus the three big gitignored pieces plus a step-by-step
  guide (tools/mac-payload-steps.md -> MAC-STEPS.md inside the zip).

  Usage:
    powershell -ExecutionPolicy Bypass -File tools\pack-mac-payload.ps1
    powershell -ExecutionPolicy Bypass -File tools\pack-mac-payload.ps1 -Out D:\payload.zip

  !! KEEP THIS FILE PURE ASCII !!
  Windows PowerShell 5.1 decodes a BOM-less script using the ANSI code page (gb2312 on this
  machine), so any non-ASCII literal here would come out as mojibake. The Chinese content
  lives in tools/mac-payload-steps.md and is read/written with an explicit UTF-8 encoding,
  which is immune to the console code page. The repo guard tools/check-no-bom.cjs forbids a
  BOM, so "add a BOM" is not an option -- stay ASCII instead.

  What goes in (and why):
    electron/src,scripts,build,assets + package.json/lock/electron-builder.yml   the build itself
    tools/ sv/ scripts/ licenses/ skills/                                       assembly scripts + Lua bridge
    dsh-runtime/dsh                        224 MB embedded DSH runtime tree (pure JS)
    dsh-runtime/node-runtimes/darwin-<a>   112 MB darwin node binary (reused, not re-downloaded)
    dist/server-runtime-darwin-<a>         341 MB prebuilt darwin server runtime (models included)
    dist/knowledge                         1 MB redacted docs shipped as extraResources
    MAC-STEPS.md                           the guide, rendered from tools/mac-payload-steps.md
  What stays out: server/ (the prebuilt runtime makes it unnecessary), every node_modules,
  .git, release/, dsh-runtime/node (that one is the Windows node.exe), old .bak-* trees.

  Size: ~680 MB of source -> ~345 MB zip.
#>
param(
  [string]$Out,
  [ValidateSet('arm64','x64')][string]$Arch = 'arm64'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $Out) { $Out = Join-Path $env:TEMP "akdagent-mac-payload-$Arch.zip" }

# ---- self-check: this file must stay ASCII (see header) --------------------------------
$selfText = [System.IO.File]::ReadAllText($PSCommandPath, [System.Text.Encoding]::UTF8)
$nonAscii = [regex]::Matches($selfText, '[^\x00-\x7F]').Count
if ($nonAscii -gt 0) {
  Write-Warning "pack-mac-payload.ps1 contains $nonAscii non-ASCII character(s) -- Windows PowerShell 5.1 will mis-decode them (ANSI code page). Move any Chinese text into tools/mac-payload-steps.md."
}

function Need([string]$rel) {
  $p = Join-Path $repo $rel
  if (-not (Test-Path $p)) { throw "missing required payload item: $rel" }
  return $rel
}

# ---- payload item list ----------------------------------------------------------------
$items = @()
# electron side: the build subject (NO node_modules -- the Mac runs `npm ci` there)
foreach ($d in @('electron/src','electron/scripts','electron/build','electron/assets','tools','sv','scripts','licenses','skills')) {
  if (Test-Path (Join-Path $repo $d)) { $items += $d }
}
foreach ($f in @('electron/package.json','electron/package-lock.json','electron/electron-builder.yml','electron/README.md',
                 'THIRD-PARTY-NOTICES.md','LICENSE','README.md')) {
  if (Test-Path (Join-Path $repo $f)) { $items += $f }
}
# big pieces that MUST be there
$items += Need 'dsh-runtime/dsh'                            # embedded DSH runtime (pure JS, platform independent)
$items += Need "dsh-runtime/node-runtimes/darwin-$Arch"     # darwin node -> stage script reuses it, no download
$items += Need "dist/server-runtime-darwin-$Arch"           # prebuilt darwin server runtime (models inside)
$items += Need 'dist/knowledge'                             # redacted docs for extraResources

# ---- render MAC-STEPS.md from its template (explicit UTF-8 both ways) ------------------
$tpl = Join-Path $repo 'tools\mac-payload-steps.md'
if (-not (Test-Path $tpl)) { throw "missing steps template: tools/mac-payload-steps.md" }
$steps = [System.IO.File]::ReadAllText($tpl, [System.Text.Encoding]::UTF8)
if ($steps.IndexOf('__ARCH__') -lt 0) { throw "tools/mac-payload-steps.md has no __ARCH__ placeholder -- wrong file?" }
$steps = $steps.Replace('__ARCH__', $Arch)
$stepsPath = Join-Path $repo 'MAC-STEPS.md'
[System.IO.File]::WriteAllText($stepsPath, $steps, (New-Object System.Text.UTF8Encoding($false)))
$items += 'MAC-STEPS.md'

# ---- one-command entry: electron/scripts/mac-build-all.sh -> mac-build.sh at the zip root
# (so on the Mac it is literally `bash mac-build.sh`: extract + one command, nothing else)
$mbSrc = Join-Path $repo 'electron\scripts\mac-build-all.sh'
if (-not (Test-Path $mbSrc)) { throw "missing electron/scripts/mac-build-all.sh" }
$mbDst = Join-Path $repo 'mac-build.sh'
Copy-Item $mbSrc $mbDst -Force
$items += 'mac-build.sh'

# ---- the official darwin node tarball (has npm/npx; the staged binary is node-only) ------
# source: %USERPROFILE%\Documents\mac-deps\  (downloaded once on Windows, SHA256 checked
# against the official SHASUMS256.txt); copied into the repo root only for the tar run,
# then deleted -- and *.tar.gz is gitignored so it can never be committed by accident.
$nodeTgzName = 'node-v24.13.0-darwin-arm64.tar.gz'
$nodeTgzSrc = Join-Path $env:USERPROFILE "Documents\mac-deps\$nodeTgzName"
if (-not (Test-Path $nodeTgzSrc)) {
  throw "missing $nodeTgzSrc -- the Mac needs npm (the staged node binary has none). Re-download it (see BUILD-MAC.md) or pass -SkipNodeTarball."
}
$nodeTgzDst = Join-Path $repo $nodeTgzName
Copy-Item $nodeTgzSrc $nodeTgzDst -Force
$items += $nodeTgzName

# ---- create the zip -------------------------------------------------------------------
if (Test-Path $Out) { Remove-Item $Out -Force }
Write-Host "packing... -> $Out"
# NOTE: exclusions must stay precise. A blanket `--exclude=node_modules` would also drop
# dsh-runtime/dsh/node_modules (223 MB = the DSH runtime itself) and the zip would be useless.
# (The draft/backup .md files under docs/ need no exclusion: docs/ is not part of the payload.)
$tarArgs = @('-a', '-c', '-f', $Out, '-C', $repo,
  '--exclude=*.bak-*',
  '--exclude=__pycache__',
  '--exclude=*.log',
  '--exclude=*/.DS_Store') + $items
& tar.exe @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar exited with $LASTEXITCODE" }
Remove-Item $stepsPath -Force -ErrorAction SilentlyContinue
Remove-Item $mbDst -Force -ErrorAction SilentlyContinue
Remove-Item $nodeTgzDst -Force -ErrorAction SilentlyContinue

$zip = Get-Item $Out
Write-Host ("done: {0}  {1:N0} MB" -f $zip.FullName, ($zip.Length / 1MB))

# ---- self-check: required members present, banned members absent ----------------------
$list = & tar.exe -tf $Out
if ($LASTEXITCODE -ne 0) { throw "tar -tf exited with $LASTEXITCODE" }
function Has([string]$pat) { ($list | Where-Object { $_ -like $pat }).Count }
$checks = [ordered]@{
  'dsh/bin.js (embedded DSH)'        = (Has 'dsh-runtime/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js')
  "darwin node binary ($Arch)"       = (Has "dsh-runtime/node-runtimes/darwin-$Arch/node")
  'prebuilt server runtime marker'   = (Has "dist/server-runtime-darwin-$Arch/STAGING.json")
  'electron-builder.yml'             = (Has 'electron/electron-builder.yml')
  'entitlements.mac.plist'           = (Has 'electron/build/entitlements.mac.plist')
  'Lua bridge'                       = (Has 'sv/lua/AKDAgentBridge.lua')
  'bundled knowledge'                = (Has 'dist/knowledge/docs/*')
  'MAC-steps guide'                  = (Has 'MAC-*.md')   # pattern stays ASCII on purpose: tar's name encoding is unreliable
  'one-command entry (mac-build.sh)'  = (Has 'mac-build.sh')
  'node tarball with npm'            = (Has 'node-v*-darwin-arm64.tar.gz')
  'STT package lock (npm ci needs it)' = (Has 'electron/package-lock.json')
  'dsh tree lock (npm ci needs it)'  = (Has 'dsh-runtime/dsh/package-lock.json')
}
$bad = [ordered]@{
  'electron/node_modules (must be absent)' = (Has 'electron/node_modules/*')
  'server/node_modules (must be absent)'   = (Has 'server/node_modules/*')
  'Windows node.exe (must be absent)'      = (Has 'dsh-runtime/node/node.exe')
  'old dsh.*.bak-* trees (must be absent)' = (Has 'dsh-runtime/dsh.*.bak-*')
  'release/ output (must be absent)'       = (Has 'electron/release/*')
}
$fail = 0
Write-Host "`nrequired:"
foreach ($k in $checks.Keys) { $good = $checks[$k] -gt 0; if (-not $good) { $fail++ }; Write-Host ("  {0} {1}  ({2})" -f $(if ($good) {'OK '} else {'MISS'}), $k, $checks[$k]) }
Write-Host "must be absent:"
foreach ($k in $bad.Keys) { $good = $bad[$k] -eq 0; if (-not $good) { $fail++ }; Write-Host ("  {0} {1}  ({2})" -f $(if ($good) {'OK '} else {'MISS'}), $k, $bad[$k]) }
Write-Host ("`narchive entries: {0:N0}" -f $list.Count)
if ($fail -gt 0) { throw "self-check failed: $fail item(s), see above" }
Write-Host "self-check passed. On the Mac extract with: ditto -x -k <zip> ~/SVAgent"
