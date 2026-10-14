$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$bundle = Join-Path $repo 'dist\AKDAgent-Network-Addon-1.1.1-network.1'
$manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$fixtureBase = Join-Path $repo 'dist\network-test-runtime'
$testRoot = Join-Path $fixtureBase ('install-simulation-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $testRoot 'resources\app.asar.unpacked\src') -Force | Out-Null
# A deliberately empty, never-launched executable marker. This test only validates file replacement.
New-Item -ItemType File -Path (Join-Path $testRoot 'AKDAgent.exe') | Out-Null
Copy-Item -LiteralPath 'D:\Program Files\Synthesizer V Studio 2 Pro\AKDAgent\resources\app.asar' -Destination (Join-Path $testRoot 'resources\app.asar')
Copy-Item -LiteralPath (Join-Path $fixtureBase 'base-1.1.1\src\stt-model.js') -Destination (Join-Path $testRoot 'resources\app.asar.unpacked\src\stt-model.js')
$checks = @()
function Assert-Task([string]$Name, [bool]$Passed) {
    $script:checks += @{name=$Name; passed=$Passed}
    Write-Output "$Name : $Passed"
    if (-not $Passed) { throw "Test failed: $Name" }
}
function Invoke-Installer([string[]]$Extra) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $bundle 'Install-Network-Addon.ps1') -InstallDir $testRoot @Extra
    Assert-Task ('Installer exit ' + ($Extra -join ' ')) ($LASTEXITCODE -eq 0)
}
Invoke-Installer @('-VerifyOnly')
Invoke-Installer @('-Yes')
foreach ($entry in $manifest.updates) {
    $hash = (Get-FileHash -LiteralPath (Join-Path $testRoot $entry.relative) -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Task ('Installed hash ' + $entry.relative) ($hash -eq $entry.after)
}
Invoke-Installer @('-Yes')
Invoke-Installer @('-Restore','-VerifyOnly')
Invoke-Installer @('-Restore','-Yes')
foreach ($entry in $manifest.updates) {
    $target = Join-Path $testRoot $entry.relative
    if ($entry.before) {
        $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        Assert-Task ('Restored hash ' + $entry.relative) ($hash -eq $entry.before)
    } else { Assert-Task 'Only the newly-added probe was removed' (-not (Test-Path -LiteralPath $target)) }
}
Assert-Task 'Backups remain recoverable' ((Get-ChildItem -LiteralPath (Join-Path $testRoot 'resources\network-addon-backups') -Directory).Count -eq 1)
# Simulate a later program update: the installer must not overwrite it.
$asarPath = Join-Path $testRoot 'resources\app.asar'
[IO.File]::WriteAllText($asarPath, 'changed-program-test-fixture')
$before = (Get-FileHash -LiteralPath $asarPath).Hash
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $bundle 'Install-Network-Addon.ps1') -InstallDir $testRoot -Yes
Assert-Task 'Mismatched program refused' ($LASTEXITCODE -ne 0)
Assert-Task 'Mismatched program preserved byte-for-byte' ((Get-FileHash -LiteralPath $asarPath).Hash -eq $before)
@{scope='file-only simulation; not a full AKDAgent startup'; directory=$testRoot; checks=$checks} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fixtureBase 'installer-verification.json') -Encoding UTF8
