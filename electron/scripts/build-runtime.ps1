# Build the production DSH runtime for electron-builder packaging.
#
# Layout produced (npm prefix, NOT a source checkout):
#   ..\dsh-runtime\dsh\                          <- npm prefix root
#     package.json / package-lock.json           <- reproducibility manifest
#     node_modules\@deepseek-ai\dsh\lib\bin.js   <- the CLI entry the app spawns
#     node_modules\...                           <- 190+ flattened prod packages
#     skills\                                    <- repo skills, exposed via DSH_BUNDLED_SKILL_DIR
#   ..\dsh-runtime\node\node.exe                 <- bundled node
#
# Why npm prefix instead of the old source checkout: the shipped 0.1.5-rc.2 line is
# distributed as an npm install (`npm i @deepseek-ai/dsh` -> node_modules\@deepseek-ai\dsh).
# A source checkout would need pnpm + a full workspace build and lands at ~527 MB;
# the npm tree is ~223 MB, has ZERO symlinks (WiX/MSI cannot follow symlinks), and
# needs no flatten/link-sweep step.
#
# NOTE: keep this file ASCII-only (English comments). Windows PowerShell 5.1
# misparses BOM-less UTF-8 Chinese comments (bytes swallow newlines), and the
# edit tool strips BOMs. Pure ASCII avoids the whole class of bugs.
#
# Usage (offline, copy the prefix already installed on this machine):
#   powershell -ExecutionPolicy Bypass -File scripts\build-runtime.ps1
# Usage (stage elsewhere first, never clobber the runtime in use):
#   powershell -ExecutionPolicy Bypass -File scripts\build-runtime.ps1 -Staging ..\dsh-runtime\dsh.new
# Usage (assemble from the registry instead of a local prefix; needs network):
#   powershell -ExecutionPolicy Bypass -File scripts\build-runtime.ps1 -Registry
param(
    [string]$FromPrefix = (Join-Path $env:LOCALAPPDATA 'dsh-rc2'),
    [string]$Version = '0.1.5-rc.2',
    [switch]$Registry,
    [switch]$Prune,
    [switch]$SkipSmoke,
    [int]$SmokePort = 3198,
    [string]$Staging = ''
)
$ErrorActionPreference = 'Stop'

$electronDir = Split-Path $PSScriptRoot -Parent
$repoDir = [System.IO.Path]::GetFullPath((Join-Path $electronDir '..'))
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $electronDir '..\dsh-runtime'))
if (-not $Staging) { $Staging = Join-Path $runtimeRoot 'dsh' }
$staging = [System.IO.Path]::GetFullPath($Staging)
$nodeDir = [System.IO.Path]::GetFullPath((Join-Path $runtimeRoot 'node'))
$cliRel = 'node_modules\@deepseek-ai\dsh\lib\bin.js'

Write-Host "version:    $Version"
Write-Host "staging:    $staging"
if ($Registry) { Write-Host "source:     registry (npm install)" } else { Write-Host "source:     prefix $FromPrefix" }

# 0) clean previous staging
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

if ($Registry) {
    # 1r) assemble from the registry: a minimal prefix manifest, then npm install.
    $manifest = "{`n  `"private`": true,`n  `"dependencies`": {`n    `"@deepseek-ai/dsh`": `"$Version`"`n  }`n}`n"
    Set-Content (Join-Path $staging 'package.json') $manifest -Encoding UTF8
    Push-Location $staging
    Write-Host "npm install --omit=dev ..."
    & npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed" }
    Pop-Location
} else {
    # 1) copy the locally installed npm prefix (offline, same bytes the user runs).
    if (-not (Test-Path $FromPrefix)) {
        throw "prefix not found: $FromPrefix`n  -> pass -FromPrefix <path>, or use -Registry to install from npm."
    }
    $srcNm = Join-Path $FromPrefix 'node_modules'
    if (-not (Test-Path $srcNm)) { throw "prefix has no node_modules: $srcNm" }
    # /R:1 /W:1 -> fail fast on locked files (default 1M retries hangs forever)
    # /XJ       -> skip junctions (the prefix itself is real dirs; belt and braces)
    # /MT:8     -> parallel copy for ~190 packages
    $roboArgs = @($srcNm, (Join-Path $staging 'node_modules'), '/E', '/R:1', '/W:1', '/XJ', '/MT:8', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    & robocopy @roboArgs
    # robocopy exit >= 8 means some files failed; the boot smoke test catches real breakage
    if ($LASTEXITCODE -ge 8) { Write-Warning "robocopy: $LASTEXITCODE (some files failed to copy - continuing)" }
    Write-Host "node_modules copied (robocopy exit $LASTEXITCODE)"
    foreach ($f in @('package.json', 'package-lock.json')) {
        $src = Join-Path $FromPrefix $f
        if (Test-Path $src) { Copy-Item $src (Join-Path $staging $f) -Force }
    }
}

# 2) verify the CLI entry and its version before doing anything expensive.
$entry = Join-Path $staging $cliRel
if (-not (Test-Path $entry)) { throw "CLI entry missing in staged tree: $entry" }
$cliPkg = Join-Path $staging 'node_modules\@deepseek-ai\dsh\package.json'
$cliVer = (Get-Content $cliPkg -Raw | ConvertFrom-Json).version
Write-Host "staged @deepseek-ai/dsh version: $cliVer"
if ($Version -and $cliVer -ne $Version) { throw "version mismatch: staged $cliVer, expected $Version" }
foreach ($need in @('@deepseek-ai\dsh-web-app', '@deepseek-ai\dsh-skill-filesystem', '@deepseek-ai\dsh-base')) {
    if (-not (Test-Path (Join-Path $staging ('node_modules\' + $need)))) { throw "required package missing after copy: $need" }
}

# 2a) WiX/MSI cannot follow symlinks or junctions at all (LGHT0103). The npm tree
#     has none; assert it so a future regression is caught here, not in packaging.
$links = @(Get-ChildItem (Join-Path $staging 'node_modules') -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.LinkType })
if ($links.Count -gt 0) {
    $links | Select-Object -First 5 | ForEach-Object { Write-Host "  link: $($_.FullName) -> $($_.Target)" }
    throw "staged tree contains $($links.Count) link(s); WiX packaging would fail"
}
Write-Host "symlink check OK (0 links)"

# 2b) optional prune. Measured on the 0.1.5-rc.2 npm tree these only add up to
#     ~22 MB (@anthropic-ai 8.3 MB + @google 13.7 MB), so pruning is OFF by default:
#     a lazily imported LLM provider is a latent break for ~10% size. Pass -Prune to
#     re-enable the historical list; the boot smoke test below gates it.
if ($Prune) {
    $rootNm = Join-Path $staging 'node_modules'
    foreach ($dir in @('@anthropic-ai', '@rolldown', '@esbuild', '@google', '@mistralai')) {
        $p = Join-Path $rootNm $dir
        if (Test-Path $p) { Remove-Item $p -Recurse -Force; Write-Host "pruned: $dir" }
    }
}

# 2c) ship the repo skills into the runtime so packaged users get them out of the
#     box (the app sets DSH_BUNDLED_SKILL_DIR to <dshRoot>\skills at boot).
$skillsSrc = Join-Path $repoDir 'skills'
if (Test-Path $skillsSrc) {
    Copy-Item $skillsSrc (Join-Path $staging 'skills') -Recurse -Force
    $skillCount = (Get-ChildItem (Join-Path $staging 'skills') -Recurse -File).Count
    Write-Host "skills copied into runtime: $skillCount files"
} else {
    Write-Host "no repo skills dir, skipping bundled skills"
}

# 2d) bundled node (same major as the tree was installed against).
New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
$srcNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path $srcNode)) { throw "system node.exe not found: $srcNode" }
Copy-Item $srcNode (Join-Path $nodeDir 'node.exe') -Force
Write-Host "node.exe copied -> $nodeDir\node.exe"

# 3) boot smoke test. `dsh --version` is NOT enough: it never boots the profile, so
#    a missing runtime dependency goes unnoticed until the app dies at startup.
#
#    0.1.5-rc.2 changed the readiness contract: the web app now REQUIRES a session.
#      GET /            -> 401 "dsh web authentication required"
#      GET /?token=...  -> 303 -> 200 (the URL printed on stdout as `dsh web: <url>`)
#      POST /probe      -> 405 (the old endpoint is gone; do not wait on it)
#    So readiness = the `dsh web:` line on stdout, plus a 200 on the token URL.
#
#    The child is launched detached through cmd.exe on purpose: Start-Process
#    -RedirectStandardOutput keeps the redirection handles open for as long as any
#    grandchild (MCP stdio server) lives, which makes the *caller* hang forever.
if (-not $SkipSmoke) {
    $smokeHome = Join-Path $runtimeRoot 'smoke-home'
    if (Test-Path $smokeHome) { Remove-Item $smokeHome -Recurse -Force }
    New-Item -ItemType Directory -Path $smokeHome -Force | Out-Null
    $smokeLog = Join-Path $runtimeRoot 'smoke-host.log'
    $smokeErr = $smokeLog + '.err'
    Remove-Item $smokeLog, $smokeErr -Force -ErrorAction SilentlyContinue

    $prevHome = $env:DSH_HOME
    $env:DSH_HOME = $smokeHome
    $nodeExe = Join-Path $nodeDir 'node.exe'
    Write-Host "boot smoke test: $nodeExe $cliRel web --port $SmokePort (DSH_HOME=$smokeHome)"
    $inner = 'cd /d "{0}" && "{1}" "{2}" web --port {3} --no-open > "{4}" 2> "{5}"' -f $staging, $nodeExe, $entry, $SmokePort, $smokeLog, $smokeErr
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $inner) -WindowStyle Hidden | Out-Null

    $url = $null
    for ($i = 0; $i -lt 160; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $smokeLog) {
            $line = Get-Content $smokeLog -ErrorAction SilentlyContinue | Where-Object { $_ -match 'dsh web:\s*(http\S+)' } | Select-Object -First 1
            if ($line -and $line -match 'dsh web:\s*(http\S+)') { $url = $Matches[1]; break }
        }
    }
    # The token URL answers 303 and hands out the session cookie; the redirected
    # request must carry it. curl only stores cookies when its cookie engine is on
    # (-c to write the jar, -b to read it back) -- with -L alone the follow-up
    # request arrives cookie-less and 401s, which looks exactly like "auth broke".
    $smokeJar = Join-Path $runtimeRoot 'smoke-jar.txt'
    Remove-Item $smokeJar -Force -ErrorAction SilentlyContinue
    $authCode = ''
    $tokenCode = ''
    if ($url) {
        $authCode = (& curl.exe -s -o NUL -w "%{http_code}" --max-time 20 "http://127.0.0.1:$SmokePort/")
        $tokenCode = (& curl.exe -s -L -c $smokeJar -b $smokeJar -o NUL -w "%{http_code}" --max-time 20 $url)
    }
    # tear the host down by whatever owns the port (cmd.exe wrapper + node child)
    foreach ($c in @(Get-NetTCPConnection -LocalPort $SmokePort -State Listen -ErrorAction SilentlyContinue)) {
        & taskkill /PID $c.OwningProcess /T /F 2>$null | Out-Null
    }
    Start-Sleep -Milliseconds 500
    $env:DSH_HOME = $prevHome

    $ok = ($tokenCode -eq '200')
    if (-not $ok) {
        Write-Host "--- smoke stdout ---"; Get-Content $smokeLog -ErrorAction SilentlyContinue | Select-Object -Last 40
        Write-Host "--- smoke stderr ---"; Get-Content $smokeErr -ErrorAction SilentlyContinue | Select-Object -Last 40
        throw "boot smoke test FAILED (url='$url' plain='$authCode' token='$tokenCode'); expected the token URL to answer 200"
    }
    if ($authCode -ne '401') { Write-Warning "plain GET / returned '$authCode' (expected 401); auth contract may have changed again" }
    Write-Host "boot smoke test OK (token url -> $tokenCode, plain / -> $authCode)"

    # scratch files live under dsh-runtime\ (never packaged; extraResources only takes dsh\ and node\)
    Remove-Item $smokeHome -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $smokeLog, $smokeErr, $smokeJar -Force -ErrorAction SilentlyContinue
}

# 4) size report
$total = (Get-ChildItem $runtimeRoot -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$dshSize = (Get-ChildItem $staging -Recurse -File | Measure-Object -Property Length -Sum).Sum
$dshFiles = (Get-ChildItem $staging -Recurse -File).Count
$nodeSize = (Get-Item (Join-Path $nodeDir 'node.exe')).Length
Write-Host ""
Write-Host ("dsh-runtime total: {0:N0} MB" -f ($total / 1MB))
Write-Host ("  dsh\  : {0:N0} MB / {1} files  (@deepseek-ai/dsh {2})" -f ($dshSize / 1MB), $dshFiles, $cliVer)
Write-Host ("  node\ : {0:N0} MB" -f ($nodeSize / 1MB))
