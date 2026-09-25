# Sync AKDAgent skills (repo) -> ~/.dsh/skills (user)
# The repo skills/ dir is the maintenance copy; run this after editing there.
#
# !! DEV ONLY -- never ship this script, never call it from product code.
#    It writes OUR skills into the USER layer (~/.dsh/skills, rank 400), where
#    they would SHADOW the packaged skills (bundled, rank 600) and stay behind
#    as stale copies after an upgrade -- and it mixes our files with the user's
#    own skills in the same directory. Shipped builds keep our skills in the
#    bundled dir only and leave ~/.dsh/skills entirely to the user.
#    (Rationale + the 3 release rules: see the user-data layering note in docs/.)
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 misparses BOM-less
# UTF-8 Chinese comments; the edit tool strips BOMs).
$ErrorActionPreference = 'Stop'

$repo = Split-Path $PSScriptRoot -Parent
$srcRoot = Join-Path $repo 'skills'
$dstRoot = Join-Path $env:USERPROFILE '.dsh\skills'

if (-not (Test-Path $srcRoot)) { Write-Host "no skills dir: $srcRoot"; exit 1 }
New-Item -ItemType Directory -Path $dstRoot -Force | Out-Null

$copied = 0
foreach ($skillDir in Get-ChildItem $srcRoot -Directory) {
    $srcSkill = $skillDir.FullName
    $dstSkill = Join-Path $dstRoot $skillDir.Name
    New-Item -ItemType Directory -Path $dstSkill -Force | Out-Null
    Copy-Item (Join-Path $srcSkill '*') $dstSkill -Recurse -Force
    $copied++
    Write-Host "synced: $($skillDir.Name)"
}
Write-Host "done, $copied skills synced to $dstRoot"
