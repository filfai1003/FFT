# Review sheet: up to 4 exercise images in a 2x2 grid with their slug.
# powershell -File tools/exercise-images/sheet.ps1 out.png slug1 slug2 slug3 slug4
param([string]$out, [Parameter(ValueFromRemainingArguments = $true)][string[]]$slugs)
Add-Type -AssemblyName System.Drawing
$cell = 512
$b = New-Object System.Drawing.Bitmap ($cell * 2), ($cell * 2)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.Clear([System.Drawing.Color]::DimGray)
$font = New-Object System.Drawing.Font 'Arial', 18
for ($n = 0; $n -lt $slugs.Count; $n++) {
  $x = ($n % 2) * $cell; $y = [math]::Floor($n / 2) * $cell
  $i = [System.Drawing.Image]::FromFile((Resolve-Path "assets/exercise-images/$($slugs[$n]).png"))
  $g.DrawImage($i, $x, $y, $cell, $cell); $i.Dispose()
  $g.FillRectangle([System.Drawing.Brushes]::White, $x, $y, 330, 30)
  $g.DrawString($slugs[$n], $font, [System.Drawing.Brushes]::Black, $x + 4, $y + 2)
}
$b.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $b.Dispose()
