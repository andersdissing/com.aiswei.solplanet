# Resize a source photo to the three Homey app-image sizes and save them
# at assets/images/{small,large,xlarge}.png. Center-crops to the target
# aspect ratio (5:7 ≈ 0.714) so panoramic / portrait sources don't squash.
#
# Usage:
#   pwsh scripts\resize-app-image.ps1 -Source 'C:\path\to\source.jpg'

param(
    [Parameter(Mandatory = $true)]
    [string]$Source
)

if (-not (Test-Path $Source)) {
    Write-Error "Source not found: $Source"
    exit 1
}

Add-Type -AssemblyName System.Drawing

$root  = Join-Path $PSScriptRoot '..'
$out   = Join-Path $root 'assets\images'
New-Item -ItemType Directory -Path $out -Force | Out-Null

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))

function Resize-Centered {
    param($srcImage, [int]$tw, [int]$th, [string]$outPath)

    $sw = $srcImage.Width
    $sh = $srcImage.Height
    $sa = $sw / $sh
    $ta = $tw / $th

    if ($sa -gt $ta) {
        # Source wider than target — crop sides
        $cropH = $sh
        $cropW = [int]([Math]::Round($sh * $ta))
        $cropX = [int]([Math]::Round(($sw - $cropW) / 2))
        $cropY = 0
    } else {
        # Source taller than target — crop top/bottom
        $cropW = $sw
        $cropH = [int]([Math]::Round($sw / $ta))
        $cropX = 0
        $cropY = [int]([Math]::Round(($sh - $cropH) / 2))
    }

    $bmp = New-Object System.Drawing.Bitmap $tw, $th
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $destRect = New-Object System.Drawing.Rectangle 0, 0, $tw, $th
    $srcRect  = New-Object System.Drawing.Rectangle $cropX, $cropY, $cropW, $cropH
    $g.DrawImage($srcImage, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "wrote $outPath  ($tw x $th)"
}

Resize-Centered $src 250  175  (Join-Path $out 'small.png')
Resize-Centered $src 500  350  (Join-Path $out 'large.png')
Resize-Centered $src 1000 700  (Join-Path $out 'xlarge.png')

$src.Dispose()
Write-Host "Done. Validate with:  homey app validate --level verified"
