[CmdletBinding()]
param(
  [string]$BundleRoot = (Join-Path $PSScriptRoot '../..'),
  [string]$UserRoot = $env:USERPROFILE,
  [string]$AppDataRoot = $env:APPDATA,
  [string]$DocumentsRoot = [Environment]::GetFolderPath('MyDocuments'),
  [string]$InstallRoot,
  [string[]]$SVScriptDirectories = @(),
  [switch]$SkipBridge,
  [switch]$SkipPlugin,
  [string]$Clients = 'codex',
  [ValidateSet(1,2)][int]$OpenCodeVersion = 1,
  [string]$Proxy
)
$ErrorActionPreference = 'Stop'
if (![Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'This deployment targets Windows x64.' }
$BundleRoot = (Resolve-Path -LiteralPath $BundleRoot).Path
if (!$UserRoot -or !$AppDataRoot) { throw 'UserRoot and AppDataRoot must be set.' }
$clientList = @($Clients.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ } | Select-Object -Unique)
$allowedClients = @('codex','claude-code','claude-desktop','cursor','vscode','opencode')
if (@($clientList | Where-Object { $_ -notin $allowedClients }).Count) { throw 'Unknown client. Use codex,claude-code,claude-desktop,cursor,vscode,opencode.' }
$pluginSource = Join-Path $BundleRoot 'akdagent-chatgpt-plugin'
$serviceSource = Join-Path $BundleRoot 'akdagent-mcp-service'
$referenceSource = Join-Path $BundleRoot 'akdagent-references'
foreach ($required in @("$pluginSource/.codex-plugin/plugin.json", "$serviceSource/resources/server/package-lock.json", "$serviceSource/bridge/AKDAgentBridge.lua", "$referenceSource/skills/sv-scripting/SKILL.md")) {
  if (!(Test-Path -LiteralPath $required)) { throw "Missing bundle component: $required. Extract all three archives into the same folder." }
}
$version = (Get-Content -LiteralPath "$pluginSource/.codex-plugin/plugin.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (!$InstallRoot) { $InstallRoot = Join-Path $UserRoot ".akdagent/$version" }
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if (Test-Path -LiteralPath $InstallRoot) { throw "Existing deployment preserved: $InstallRoot. Choose a new -InstallRoot for a retry/upgrade." }
# A failed install remains available for diagnosis; never recursively erase a user-selected target.
New-Item -ItemType Directory -Path $InstallRoot | Out-Null
Copy-Item -LiteralPath $serviceSource -Destination (Join-Path $InstallRoot 'service') -Recurse
Copy-Item -LiteralPath $referenceSource -Destination (Join-Path $InstallRoot 'references') -Recurse
$service = Join-Path $InstallRoot 'service'
$skills = Join-Path $InstallRoot 'references/skills'
$node = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($node) { $node.Source } else { $null }
$useExisting = $false
if ($nodePath) {
  & $nodePath -e 'const [a,b]=process.versions.node.split(/\./).map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'
  $useExisting = $LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path (Split-Path $nodePath) 'npm.cmd'))
}
if (!$useExisting) {
  $nodeVersion = '22.22.0'
  $archive = Join-Path $InstallRoot 'node.zip'
  $request = @{ Uri="https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"; OutFile=$archive; UseBasicParsing=$true }
  if ($Proxy) { $request.Proxy = $Proxy }
  Invoke-WebRequest @request
  $expected = 'c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a'
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node archive SHA-256 mismatch; not extracting or executing.' }
  Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $InstallRoot 'node')
  $nodePath = Join-Path $InstallRoot "node/node-v$nodeVersion-win-x64/node.exe"
}
$nodeDirectory = Split-Path $nodePath
$oldPath = $env:Path
$oldProxy = $env:npm_config_proxy
$oldHttpsProxy = $env:npm_config_https_proxy
try {
  $env:Path = $nodeDirectory + ';' + $env:Path
  if ($Proxy) { $env:npm_config_proxy=$Proxy; $env:npm_config_https_proxy=$Proxy }
  Push-Location (Join-Path $service 'resources/server')
  try {
    # Lockfile integrity checks remain enabled. No package lifecycle scripts or model downloads.
    & (Join-Path $nodeDirectory 'npm.cmd') ci --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'MCP dependency installation failed; no plugin catalog or SV bridge modified.' }
  } finally { Pop-Location }
} finally { $env:Path=$oldPath; $env:npm_config_proxy=$oldProxy; $env:npm_config_https_proxy=$oldHttpsProxy }
$oldInstall = $env:AKDAGENT_INSTALL_DIR
$oldSkills = $env:AKDAGENT_SKILLS_DIR
try {
  $env:AKDAGENT_INSTALL_DIR=$service; $env:AKDAGENT_SKILLS_DIR=$skills
  & $nodePath "$pluginSource/scripts/check-connection.mjs" offline
  if ($LASTEXITCODE -ne 0) { throw 'Offline MCP self-check failed; no plugin catalog or SV bridge modified.' }
} finally { $env:AKDAGENT_INSTALL_DIR=$oldInstall; $env:AKDAGENT_SKILLS_DIR=$oldSkills }
if (!$SkipPlugin) {
  $sharedPlugin = Join-Path $InstallRoot 'plugin'
  New-Item -ItemType Directory -Path $sharedPlugin | Out-Null
  foreach ($name in @('plugin.json','mcp.json','.claude-plugin','.codex-plugin','.mcp.json','clients','scripts','skills','docs','licenses','README.md','README.en.md','LICENSE','THIRD-PARTY-NOTICES.md','SECURITY.md','CHANGELOG.md','CONTRIBUTING.md')) {
    Copy-Item -LiteralPath (Join-Path $pluginSource $name) -Destination $sharedPlugin -Recurse
  }
  $externalClients = ($clientList | Where-Object { $_ -ne 'codex' }) -join ','
  $profileArgs = @((Join-Path $sharedPlugin 'scripts/client-configs.mjs'),'--plugin-dir',$sharedPlugin,'--node',$nodePath,'--service',$service,'--skills',$skills,'--export-dir',(Join-Path $InstallRoot 'client-configs'),'--user-root',$UserRoot,'--app-data',$AppDataRoot,'--opencode-version',"$OpenCodeVersion",'--apply')
  if ($externalClients) { $profileArgs += @('--clients',$externalClients) }
  & $nodePath @profileArgs
  if ($LASTEXITCODE -eq 2) { Write-Warning 'Some existing client configurations need a manual merge; use the exported client-configs files.' }
  elseif ($LASTEXITCODE -ne 0) { throw 'Client profile generation failed.' }
  if ('codex' -in $clientList) { & "$pluginSource/scripts/install.ps1" -AKDAgentDir $service -SkillsDir $skills -NodePath $nodePath -UserRoot $UserRoot }
}
if (!$SkipBridge) {
  $destinations = @($SVScriptDirectories)
  if (!$destinations.Count) {
    # SV1 normally uses the Windows Documents known folder (including redirected/OneDrive locations).
    if ($DocumentsRoot) {
      $sv1Path = Join-Path $DocumentsRoot 'Dreamtonics/Synthesizer V Studio'
      if (Test-Path -LiteralPath $sv1Path) { $destinations += Join-Path $sv1Path 'scripts' }
    }
    foreach ($hostFolder in @('Synthesizer V Studio','Synthesizer V Studio 2')) {
      $hostPath = Join-Path $AppDataRoot "Dreamtonics/$hostFolder"
      if (Test-Path -LiteralPath $hostPath) { $destinations += Join-Path $hostPath 'scripts' }
    }
  }
  foreach ($scripts in $destinations) {
    $agentDir = Join-Path ([IO.Path]::GetFullPath($scripts)) 'Agent'
    $target = Join-Path $agentDir 'AKDAgentBridge.lua'
    $sourceBridge = Join-Path $service 'bridge/AKDAgentBridge.lua'
    if (Test-Path -LiteralPath $target) {
      if ((Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath $sourceBridge).Hash) { Write-Output "Bridge already current: $target" }
      else { Write-Warning "Existing bridge preserved: $target. Compare it with $sourceBridge before upgrading." }
    } else {
      New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
      Copy-Item -LiteralPath $sourceBridge -Destination $target
      Write-Output "Bridge installed: $target"
    }
  }
  if (!$destinations.Count) { Write-Warning 'No SV user directory found. Launch SV once, or pass -SVScriptDirectories with Scripts > Open Scripts Folder.' }
}
Write-Output "Deployment complete: $InstallRoot"
Write-Output 'Restart the selected client and enable its MCP connection. For Codex, install/enable AKDAgent Plugin from the personal marketplace. Run Agent > AKDAgent Bridge in ONE SV host; use only ONE active editing client.'
