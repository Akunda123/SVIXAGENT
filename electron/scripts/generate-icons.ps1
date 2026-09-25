# 生成 AKDAgent 图标（PNG 即可：electron-builder 支持 256px PNG 转 ico，Tray 用 PNG）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null

function New-AKDAgentBitmap([int]$size) {
    Write-Host "  drawing ${size}x${size}..."
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    if (-not $g) { throw 'Graphics.FromImage returned null' }
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $pad = [int]($size * 0.05)
    $circle = New-Object System.Drawing.Rectangle($pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad))

    # 渐变底（失败则退回纯色）
    try {
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $circle,
            [System.Drawing.Color]::FromArgb(255, 82, 140, 255),
            [System.Drawing.Color]::FromArgb(255, 122, 45, 240),
            45.0)
    } catch {
        Write-Host "  gradient fallback to solid"
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 90, 100, 250))
    }
    $g.FillEllipse($brush, $circle)

    # "SV" 文字
    $font = New-Object System.Drawing.Font('Segoe UI', [single]($size * 0.30), [System.Drawing.FontStyle]::Bold)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('SV', $font, [System.Drawing.Brushes]::White, $textRect, $fmt)

    $g.Dispose()
    return $bmp
}

$bmp256 = New-AKDAgentBitmap 256
$bmp256.Save((Join-Path $assets 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "saved icon.png"
$bmp256.Dispose()

$bmp32 = New-AKDAgentBitmap 32
$bmp32.Save((Join-Path $assets 'tray.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "saved tray.png"
$bmp32.Dispose()

Get-ChildItem $assets | Select-Object Name, Length | Format-Table -AutoSize
Write-Host "icons OK"
