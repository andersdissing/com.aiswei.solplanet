# Generate Homey driver-tile images (75x75 small, 500x500 large) for each
# driver from a source product photo. Pads each source to a square canvas
# with a white fill (no cropping, so the whole device silhouette stays
# visible) and resamples to the two required sizes.
#
# Usage (defaults point at the user's desktop sources):
#   pwsh scripts\resize-driver-images.ps1
#
# Override any source individually:
#   pwsh scripts\resize-driver-images.ps1 -InverterSource 'C:\path\to\inv.png'
#
# WebP sources are loaded via WIC (PresentationCore), since GDI+
# (System.Drawing) doesn't decode WebP on its own.

param(
    [string]$InverterSource = 'C:\Users\ameqd\OneDrive\Skrivebord\inverter.png',
    [string]$BatterySource  = 'C:\Users\ameqd\OneDrive\Skrivebord\battery.png',
    [string]$MeterSource    = 'C:\Users\ameqd\OneDrive\Skrivebord\meterv2.jpg'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName PresentationCore, WindowsBase

$root = Join-Path $PSScriptRoot '..'

function Load-Image([string]$path) {
    $resolved = (Resolve-Path -LiteralPath $path).ProviderPath
    if ([IO.Path]::GetExtension($resolved).ToLowerInvariant() -eq '.webp') {
        $uri = [Uri]::new($resolved, [UriKind]::Absolute)
        $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
            $uri,
            [System.Windows.Media.Imaging.BitmapCreateOptions]::None,
            [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
        $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
        $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($decoder.Frames[0]))
        $ms = New-Object IO.MemoryStream
        $encoder.Save($ms)
        $ms.Position = 0
        return [System.Drawing.Image]::FromStream($ms)
    }
    return [System.Drawing.Image]::FromFile($resolved)
}

function Pad-ToSquareWhite($srcImage) {
    $side = [Math]::Max($srcImage.Width, $srcImage.Height)
    $bmp = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality= [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $offsetX = [int](($side - $srcImage.Width) / 2)
    $offsetY = [int](($side - $srcImage.Height) / 2)
    $g.DrawImage($srcImage, $offsetX, $offsetY, $srcImage.Width, $srcImage.Height)
    $g.Dispose()
    return $bmp
}

function Save-Resized($square, [int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality= [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $g.DrawImage($square, 0, 0, $size, $size)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "wrote $outPath  ($size x $size)"
}

function Build-Driver([string]$id, [string]$source) {
    if (-not (Test-Path -LiteralPath $source)) {
        Write-Error "Source not found for driver '$id': $source"
        return
    }
    $outDir = Join-Path $root "drivers\$id\assets\images"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $src = Load-Image $source
    try {
        $square = Pad-ToSquareWhite $src
        try {
            Save-Resized $square 75  (Join-Path $outDir 'small.png')
            Save-Resized $square 500 (Join-Path $outDir 'large.png')
        } finally {
            $square.Dispose()
        }
    } finally {
        $src.Dispose()
    }
}

Build-Driver 'inverter' $InverterSource
Build-Driver 'battery'  $BatterySource
Build-Driver 'meter'    $MeterSource

Write-Host "Done. Validate with:  homey app validate --level publish"
