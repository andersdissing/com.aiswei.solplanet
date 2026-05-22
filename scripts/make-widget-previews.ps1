# Generates placeholder light/dark preview thumbnails for the energy-import
# widget (Homey requires widgets/<id>/preview-{light,dark}.png). Draws the
# widget title + a simple green area-chart motif. Replace with real screenshots
# once the widget is installed if desired.
#
# Usage:  & .\scripts\make-widget-previews.ps1

Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot '..\widgets\energy-import'

function New-Preview {
  param($Path, $Bg, $Fg, $AreaFill, $Line)
  $w = 500; $h = 300
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($Bg))

  $font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
  $brushFg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($Fg))
  $g.DrawString('Energy import', $font, $brushFg, 24, 20)

  $vals = @(0.40, 0.55, 0.48, 0.70, 0.62, 0.80, 0.58, 0.74, 0.90, 0.68)
  $left = 30; $right = 470; $top = 95; $bottom = 260; $n = $vals.Count
  $linePts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  for ($i = 0; $i -lt $n; $i++) {
    $x = $left + ($i * ($right - $left) / ($n - 1))
    $y = $bottom - ($vals[$i] * ($bottom - $top))
    $linePts.Add((New-Object System.Drawing.PointF($x, $y)))
  }
  $poly = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  $poly.Add((New-Object System.Drawing.PointF($left, $bottom)))
  $poly.AddRange($linePts)
  $poly.Add((New-Object System.Drawing.PointF($right, $bottom)))

  $fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($AreaFill))
  $g.FillPolygon($fillBrush, $poly.ToArray())
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($Line), 3)
  $g.DrawLines($pen, $linePts.ToArray())

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose(); $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $Path"
}

New-Preview (Join-Path $dir 'preview-light.png') '#ffffff' '#1b1b1b' '#bfe6c9' '#34a853'
New-Preview (Join-Path $dir 'preview-dark.png')  '#1c1c1e' '#f4f4f5' '#2e5e3a' '#43c265'
