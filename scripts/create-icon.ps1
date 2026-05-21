Add-Type -AssemblyName System.Drawing
   function New-PlaceholderImage($width, $height, $path, $label = 'Solplanet') {
       $bmp = New-Object System.Drawing.Bitmap $width, $height
       $g = [System.Drawing.Graphics]::FromImage($bmp)
       $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
       $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
       $bgColor = [System.Drawing.Color]::FromArgb(246, 64, 95)
       $brush = New-Object System.Drawing.SolidBrush $bgColor
       $g.FillRectangle($brush, 0, 0, $width, $height)
       $fontSize = [single]([Math]::Max(16, $height / 6))
       $bgColor = [System.Drawing.Color]::FromArgb(246, 64, 95)
       $brush = New-Object System.Drawing.SolidBrush $bgColor
       $g.FillRectangle($brush, 0, 0, $width, $height)
       $fontSize = [single]([Math]::Max(16, $height / 6))
       $font = [System.Drawing.Font]::new('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
       $textBrush = [System.Drawing.Brushes]::White
       $sf = New-Object System.Drawing.StringFormat
       $sf.Alignment = [System.Drawing.StringAlignment]::Center
       $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
       $rect = New-Object System.Drawing.RectangleF 0, 0, $width, $height
       $g.DrawString($label, $font, $textBrush, $rect, $sf)
       $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
       $font.Dispose()
       $brush.Dispose()
       $g.Dispose()
       $bmp.Dispose()
   }
   $base = 'C:\homey\com.aiswei.solplanet\assets\images'
   New-Item -ItemType Directory -Path $base -Force | Out-Null
   New-PlaceholderImage 250 175 "$base\small.png"
   New-PlaceholderImage 500 350 "$base\large.png"
   New-PlaceholderImage 1000 700 "$base\xlarge.png"
   Get-ChildItem $base | Select-Object Name, Length | Format-Table

   # Driver images: Homey driver-tile sizes (75x75 small, 500x500 large)
   $driverBase = 'C:\homey\com.aiswei.solplanet\drivers'
   $drivers = @(
       @{ Id = 'inverter'; Label = 'Inverter' },
       @{ Id = 'battery';  Label = 'Battery'  },
       @{ Id = 'meter';    Label = 'Grid'     }
   )
   foreach ($d in $drivers) {
       $path = "$driverBase\$($d.Id)\assets\images"
       New-Item -ItemType Directory -Path $path -Force | Out-Null
       New-PlaceholderImage 75  75  "$path\small.png" $d.Label
       New-PlaceholderImage 500 500 "$path\large.png" $d.Label
       Write-Host "Generated driver images: $($d.Id)"
   }