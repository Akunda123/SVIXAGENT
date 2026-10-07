[CmdletBinding()]
param([string]$BundleRoot)
$ErrorActionPreference='Stop'
Write-Host 'AKDAgent Plugin - choose your applications'
Write-Host 'codex, claude-code, claude-desktop, cursor, vscode, opencode'
$selection=Read-Host 'Enter comma-separated names (Enter = codex)'
if (!$selection) { $selection='codex' }
& (Join-Path $PSScriptRoot 'deploy.ps1') -BundleRoot $BundleRoot -Clients $selection
