[CmdletBinding()]
param(
    [string]$InstallDir = '',
    [switch]$Restore,
    [string]$BackupDirectory = '',
    [switch]$VerifyOnly,
    [switch]$Yes,
    [switch]$Launch
)
$ErrorActionPreference = 'Stop'
$allowed = @('resources/app.asar', 'resources/app.asar.unpacked/src/stt-model.js', 'resources/app.asar.unpacked/src/network-probe.js')
$bundle = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-TaskHash([string]$File) {
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return $null }
    return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Get-SafeTarget([string]$Relative) {
    if ($allowed -notcontains $Relative) { throw "不允许的目标：$Relative" }
    $full = [IO.Path]::GetFullPath((Join-Path $InstallDir $Relative))
    if (-not $full.StartsWith($InstallDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '目标不在安装目录内。' }
    return $full
}
function Replace-TaskFile([string]$Source, [string]$Target) {
    $temp = $Target + '.network-new-' + [Guid]::NewGuid().ToString('N')
    $atomicOld = $Target + '.network-old-' + [Guid]::NewGuid().ToString('N')
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($Target)) -Force | Out-Null
    try {
        Copy-Item -LiteralPath $Source -Destination $temp
        # Windows PowerShell 5.1 can bind $null as an empty backup path. Use an explicit
        # same-directory atomic backup; the verified long-term backup already exists.
        if (Test-Path -LiteralPath $Target) { [IO.File]::Replace($temp, $Target, $atomicOld) }
        else { [IO.File]::Move($temp, $Target) }
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
        if (Test-Path -LiteralPath $atomicOld) { Remove-Item -LiteralPath $atomicOld }
    }
}
function Assert-AgentStopped {
    $exe = Join-Path $InstallDir 'AKDAgent.exe'
    $running = @(Get-CimInstance Win32_Process -Filter "Name='AKDAgent.exe'" | Where-Object { -not $_.ExecutablePath -or $_.ExecutablePath -eq $exe })
    if ($running.Count) { throw '请先从托盘退出 AKDAgent 后重试。SV 不需要关闭。本脚本不会强制结束进程。' }
}
function Restore-TaskEntry($entry, [string]$backupRoot) {
    $target = Get-SafeTarget $entry.relative
    if ((Get-TaskHash $target) -ne $entry.after) { throw "目标已被其他操作改变，停止回退：$target" }
    if ($entry.before) {
        $source = Join-Path $backupRoot $entry.relative
        if ((Get-TaskHash $source) -ne $entry.before) { throw "备份校验失败：$source" }
        Replace-TaskFile $source $target
    } elseif (Test-Path -LiteralPath $target) {
        # Only the exact, hash-checked newly added probe is removed; never recurse.
        Remove-Item -LiteralPath $target
    }
}

if (-not $InstallDir) {
    $candidates = @('D:\Program Files\Synthesizer V Studio 2 Pro\AKDAgent', (Join-Path $env:LOCALAPPDATA 'Programs\AKDAgent'))
    $InstallDir = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'resources\app.asar') } | Select-Object -First 1
    if (-not $InstallDir) { $InstallDir = Read-Host '请输入 AKDAgent 安装目录（不是 SV 工程目录）' }
}
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path.TrimEnd('\','/')
if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'AKDAgent.exe') -PathType Leaf)) { throw '目录内没有 AKDAgent.exe。' }
$backupBase = Join-Path $InstallDir 'resources\network-addon-backups'

if ($Restore) {
    if (-not $BackupDirectory) {
        $BackupDirectory = Get-ChildItem -LiteralPath $backupBase -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'backup-state.json') -PathType Leaf } | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
        if (-not $BackupDirectory) { throw '未找到可校验的程序回退备份。' }
    }
    $BackupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path
    $safeBackupBase = [IO.Path]::GetFullPath($backupBase).TrimEnd('\') + '\'
    if (-not $BackupDirectory.StartsWith($safeBackupBase, [StringComparison]::OrdinalIgnoreCase)) { throw '备份目录不属于此次安装目录。' }
    $state = Get-Content -LiteralPath (Join-Path $BackupDirectory 'backup-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.installDir -ne $InstallDir -or $state.version -ne $manifest.version) { throw '备份不是本安装目录的配套备份。' }
    foreach ($entry in $state.updates) {
        $target = Get-SafeTarget $entry.relative
        if ((Get-TaskHash $target) -ne $entry.after) { throw "当前文件不同于代理增强版，停止回退：$target" }
        if ($entry.before -and (Get-TaskHash (Join-Path $BackupDirectory $entry.relative)) -ne $entry.before) { throw '备份校验失败。' }
    }
    if ($VerifyOnly) { Write-Output '回退预检查通过，未修改任何文件。'; exit 0 }
    Assert-AgentStopped
    if (-not $Yes -and (Read-Host "将恢复 $InstallDir 中的原程序，并移除新加的探针文件。输入 Y 继续") -ne 'Y') { exit 0 }
    foreach ($entry in $state.updates) { Restore-TaskEntry $entry $BackupDirectory }
    Write-Output '已恢复原程序。备份和个人代理配置仍保留；没有修改 SV 或聊天记录。'
} else {
    if ($manifest.updates.Count -ne $allowed.Count) { throw '安装清单不正确。' }
    if ((Get-TaskHash (Get-SafeTarget 'resources/app.asar')) -eq $manifest.updates[0].after) { Write-Output '此代理增强版已经安装。'; exit 0 }
    foreach ($entry in $manifest.updates) {
        $target = Get-SafeTarget $entry.relative
        if ($entry.source -ne $entry.relative.Substring('resources/'.Length)) { throw '安装源与目标不匹配。' }
        $source = Join-Path $bundle $entry.source
        if ((Get-TaskHash $source) -ne $entry.after) { throw "安装文件校验失败：$source" }
        if ((Get-TaskHash $target) -ne $entry.before) { throw "原程序不匹配（仅支持配套 1.1.1）。未覆盖：$target" }
    }
    if ($VerifyOnly) { Write-Output '安装预检查通过，未修改任何文件。'; exit 0 }
    Assert-AgentStopped
    Write-Output "安装目录：$InstallDir"
    foreach ($entry in $manifest.updates) { Write-Output (Get-SafeTarget $entry.relative) }
    if (-not $Yes -and (Read-Host '会先备份以上文件，再安装代理选择页。输入 Y 继续') -ne 'Y') { exit 0 }
    $backupRoot = Join-Path $backupBase ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
    foreach ($entry in $manifest.updates) {
        if ($entry.before) {
            $backupFile = Join-Path $backupRoot $entry.relative
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($backupFile)) -Force | Out-Null
            Copy-Item -LiteralPath (Get-SafeTarget $entry.relative) -Destination $backupFile
            if ((Get-TaskHash $backupFile) -ne $entry.before) { throw '备份校验失败，未开始覆盖。' }
        }
    }
    @{installDir=$InstallDir; version=$manifest.version; updates=$manifest.updates} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backupRoot 'backup-state.json') -Encoding UTF8
    $written = @()
    try {
        foreach ($entry in $manifest.updates) {
            Replace-TaskFile (Join-Path $bundle $entry.source) (Get-SafeTarget $entry.relative)
            $written += $entry
            if ((Get-TaskHash (Get-SafeTarget $entry.relative)) -ne $entry.after) { throw '安装后的文件校验失败。' }
        }
    } catch {
        foreach ($entry in $written) { Restore-TaskEntry $entry $backupRoot }
        throw "安装失败，已回退完成的替换。备份：$backupRoot。原因：$($_.Exception.Message)"
    }
    Write-Output "安装完成：$($manifest.version)（个人修改版，并非官方新版）。"
    Write-Output "备份：$backupRoot"
    Write-Output '启动 AKDAgent → 设置 → 网络与代理。未更改系统代理、模型密钥、Codex 或 SV 工程。'
}
if ($Launch) { Start-Process -FilePath (Join-Path $InstallDir 'AKDAgent.exe') -WindowStyle Hidden }
