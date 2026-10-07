[CmdletBinding()]
param([string]$OutputDirectory, [string]$SourceRoot)
$ErrorActionPreference = 'Stop'
$plugin = Split-Path $PSScriptRoot -Parent
$pluginRepo = (Resolve-Path (Join-Path $plugin '../..')).Path
$repo = if ($SourceRoot) { (Resolve-Path -LiteralPath $SourceRoot).Path } else { $pluginRepo }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $pluginRepo ('dist/akdagent-plugin-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmss')) }
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory exists; choose a fresh directory.' }
if (!(Test-Path -LiteralPath "$repo/server/dist/tools.js")) { throw 'Build server first: cd server; npm ci --ignore-scripts; npm run build' }
$version = (Get-Content -LiteralPath "$plugin/.codex-plugin/plugin.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$stage = Join-Path $OutputDirectory 'bundle'
New-Item -ItemType Directory -Path $stage | Out-Null
$pluginStage = Join-Path $stage 'akdagent-chatgpt-plugin'
New-Item -ItemType Directory -Path $pluginStage | Out-Null
foreach ($name in @('plugin.json','mcp.json','.claude-plugin','.codex-plugin','.mcp.json','clients','scripts','skills','docs','licenses','README.md','README.en.md','LICENSE','THIRD-PARTY-NOTICES.md','SECURITY.md','CHANGELOG.md','CONTRIBUTING.md')) {
  Copy-Item -LiteralPath (Join-Path $plugin $name) -Destination $pluginStage -Recurse
}
$serverStage = Join-Path $stage 'akdagent-mcp-service/resources/server'
New-Item -ItemType Directory -Path $serverStage -Force | Out-Null
foreach ($name in @('dist','package.json','package-lock.json')) { Copy-Item -LiteralPath (Join-Path $repo "server/$name") -Destination $serverStage -Recurse }
$serviceStage = Join-Path $stage 'akdagent-mcp-service'
New-Item -ItemType Directory -Path "$serviceStage/bridge" | Out-Null
Copy-Item -LiteralPath "$repo/sv/lua/AKDAgentBridge.lua" -Destination "$serviceStage/bridge"
foreach ($name in @('LICENSE','THIRD-PARTY-NOTICES.md','licenses')) { Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $serviceStage -Recurse }
Copy-Item -LiteralPath "$plugin/docs/standalone.md" -Destination "$serviceStage/README.md"
$referenceStage = Join-Path $stage 'akdagent-references'
New-Item -ItemType Directory -Path "$referenceStage/skills" -Force | Out-Null
foreach ($name in @('akdagent-playbook','akdagent-protocol','sv-scripting','sv-project-format','sv-lyricist','composition','sv-texture','sv-ix')) {
  $source = Join-Path $repo "skills/$name"
  foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
    $relative = $file.FullName.Substring($source.Length + 1)
    # Do not redistribute official API mirrors or executable helpers as reference material.
    if ($relative -match '^api[\\/]' -or $file.Extension -notin @('.md','.json')) { continue }
    $target = Join-Path $referenceStage "skills/$name/$relative"
    New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target
  }
}
Copy-Item -LiteralPath "$repo/LICENSE" -Destination "$referenceStage/LICENSE.AKDAgent"
Copy-Item -LiteralPath "$plugin/licenses" -Destination "$referenceStage/licenses" -Recurse
Copy-Item -LiteralPath "$plugin/docs/reference-pack.md" -Destination "$referenceStage/README.md"
$revision = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the AKDAgent source commit; use a Git checkout as SourceRoot.' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @(Get-ChildItem -LiteralPath $referenceStage -File -Recurse | ForEach-Object { @{path=$_.FullName.Substring($referenceStage.Length+1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
[IO.File]::WriteAllText("$referenceStage/manifest.json", (@{upstream='https://github.com/Akunda123/SVIXAGENT'; sourceCommit=$revision; files=$files} | ConvertTo-Json -Depth 8), $utf8)
foreach ($component in @('akdagent-chatgpt-plugin','akdagent-mcp-service','akdagent-references')) {
  $artifactName = if ($component -eq 'akdagent-chatgpt-plugin') { 'akdagent-plugin' } else { $component }
  Compress-Archive -LiteralPath (Join-Path $stage $component) -DestinationPath (Join-Path $OutputDirectory "$artifactName-$version.zip")
}
Copy-Item -LiteralPath "$plugin/scripts/Deploy.cmd" -Destination $stage
Copy-Item -LiteralPath "$plugin/docs/standalone.md" -Destination "$stage/README.md"
Compress-Archive -Path "$stage/*" -DestinationPath (Join-Path $OutputDirectory "akdagent-one-click-$version.zip")
$sums = @(Get-ChildItem -LiteralPath $OutputDirectory -Filter '*.zip' | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_.Name })
[IO.File]::WriteAllLines((Join-Path $OutputDirectory 'SHA256SUMS.txt'), $sums, $utf8)
Write-Output $OutputDirectory
