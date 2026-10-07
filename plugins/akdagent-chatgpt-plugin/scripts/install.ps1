[CmdletBinding()]
param(
  [string]$AKDAgentDir,
  [string]$SkillsDir,
  [string]$NodePath,
  [string]$UserRoot = $env:USERPROFILE,
  [string]$Destination
)
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -LiteralPath (Join-Path $source '.codex-plugin/plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (!$UserRoot) { throw 'UserRoot must be set.' }
if (!$AKDAgentDir) {
  $standaloneService = Join-Path $UserRoot ".akdagent/$($manifest.version)/service"
  $legacyService = Join-Path $UserRoot ".codex/akdagent/$($manifest.version)/service"
  if (Test-Path -LiteralPath (Join-Path $standaloneService 'resources/server/dist/tools.js')) { $AKDAgentDir = $standaloneService }
  elseif (Test-Path -LiteralPath (Join-Path $legacyService 'resources/server/dist/tools.js')) { $AKDAgentDir = $legacyService }
  elseif ($env:LOCALAPPDATA) { $AKDAgentDir = Join-Path $env:LOCALAPPDATA 'Programs/AKDAgent' }
  else { throw 'Run Deploy.cmd first, or pass -AKDAgentDir with a standalone service path.' }
}
$AKDAgentDir = (Resolve-Path -LiteralPath $AKDAgentDir).Path
if (!(Test-Path -LiteralPath (Join-Path $AKDAgentDir 'resources/server/dist/tools.js'))) { throw 'Editing service missing: resources/server/dist/tools.js. Deploy the standalone service or specify its path.' }
if (!$SkillsDir) {
  $standaloneSkills = Join-Path (Split-Path $AKDAgentDir -Parent) 'references/skills'
  if (Test-Path -LiteralPath $standaloneSkills) { $SkillsDir = $standaloneSkills }
  else { $SkillsDir = Join-Path $AKDAgentDir 'resources/dsh/skills' }
}
if (!(Test-Path -LiteralPath $SkillsDir)) { throw 'Skills missing. Extract the separate reference pack and pass -SkillsDir <its skills directory>.' }
$SkillsDir = (Resolve-Path -LiteralPath $SkillsDir).Path
if (!$NodePath) {
  $bundledNode = Join-Path $AKDAgentDir 'resources/node/node.exe'
  $standaloneNode = Join-Path (Split-Path $AKDAgentDir -Parent) 'node/node-v22.22.0-win-x64/node.exe'
  if (Test-Path -LiteralPath $bundledNode) { $NodePath = $bundledNode }
  elseif (Test-Path -LiteralPath $standaloneNode) { $NodePath = $standaloneNode }
  else { $NodePath = (Get-Command node -ErrorAction Stop).Source }
}
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
& $NodePath -e 'const [a,b]=process.versions.node.split(/\./).map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'
if ($LASTEXITCODE -ne 0) { throw 'Node 22.13+ required.' }
$UserRoot = [IO.Path]::GetFullPath($UserRoot)
if (!$Destination) { $Destination = Join-Path $UserRoot ".codex/plugins/local/$($manifest.name)/$($manifest.version)" }
$Destination = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $Destination) { throw "Refusing to overwrite existing destination: $Destination" }
if ([IO.Path]::GetPathRoot($UserRoot) -ne [IO.Path]::GetPathRoot($Destination)) { throw 'Destination and UserRoot must be on the same drive.' }
$catalogPath = Join-Path $UserRoot '.agents/plugins/marketplace.json'
if (Test-Path -LiteralPath $catalogPath) {
  $catalog = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (!$catalog.name -or $null -eq $catalog.plugins) { throw 'Invalid existing marketplace; left unchanged.' }
} else {
  $catalog = [pscustomobject]@{ name='akdagent-community'; interface=@{ displayName='AKDAgent Community Integrations' }; plugins=@() }
}
New-Item -ItemType Directory -Path $Destination | Out-Null
foreach ($name in @('plugin.json','mcp.json','.claude-plugin','.codex-plugin','.mcp.json','clients','scripts','skills','docs','licenses','README.md','README.en.md','LICENSE','THIRD-PARTY-NOTICES.md','SECURITY.md','CHANGELOG.md','CONTRIBUTING.md')) {
  Copy-Item -LiteralPath (Join-Path $source $name) -Destination $Destination -Recurse
}
$configPath = Join-Path $Destination '.mcp.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$config.mcpServers.akdagent_chatgpt.command = $NodePath
$config.mcpServers.akdagent_chatgpt | Add-Member -MemberType NoteProperty -Name env -Value @{
  AKDAGENT_INSTALL_DIR=$AKDAgentDir; AKDAGENT_SKILLS_DIR=$SkillsDir
} -Force
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 30), $utf8)
& $NodePath (Join-Path $Destination 'scripts/client-configs.mjs') --plugin-dir $Destination --node $NodePath --service $AKDAgentDir --skills $SkillsDir --export-dir (Join-Path $Destination 'clients/generated')
if ($LASTEXITCODE -ne 0) { throw 'Client profile generation failed; catalog left unchanged.' }
$uriBase = New-Object System.Uri(($UserRoot.TrimEnd('\') + '\'))
$uriTarget = New-Object System.Uri(($Destination.TrimEnd('\') + '\'))
if ($uriBase.Scheme -ne $uriTarget.Scheme -or $uriBase.Host -ne $uriTarget.Host -or [IO.Path]::GetPathRoot($UserRoot) -ne [IO.Path]::GetPathRoot($Destination)) { throw 'Destination and UserRoot must be on the same drive.' }
$relative = './' + [Uri]::UnescapeDataString($uriBase.MakeRelativeUri($uriTarget).ToString()).TrimEnd('/')
$entry = [pscustomobject]@{ name=$manifest.name; source=@{ source='local'; path=$relative }; policy=@{ installation='AVAILABLE'; authentication='ON_INSTALL' }; category='Productivity' }
$catalog.plugins = @($catalog.plugins | Where-Object { $_.name -ne $manifest.name }) + @($entry)
New-Item -ItemType Directory -Path (Split-Path $catalogPath -Parent) -Force | Out-Null
if (Test-Path -LiteralPath $catalogPath) { Copy-Item -LiteralPath $catalogPath -Destination ($catalogPath + '.backup-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffff')) }
[IO.File]::WriteAllText($catalogPath, ($catalog | ConvertTo-Json -Depth 50), $utf8)
Write-Output "Installed source: $Destination"
Write-Output "Marketplace: $($catalog.name). Restart Codex, then install/enable the plugin in its plugin directory."
