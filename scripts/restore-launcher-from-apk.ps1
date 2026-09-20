param(
    [string]$ReferenceApk = 'C:\Users\user\Desktop\app-debug.apk'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resourceRoot = Join-Path $workspace 'android\app\src\main\res'
$apkPath = (Resolve-Path -LiteralPath $ReferenceApk).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)

try {
    $densities = @('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')
    foreach ($density in $densities) {
        $apkFolder = "res/mipmap-$density-v4"
        $targetFolder = Join-Path $resourceRoot "mipmap-$density"
        [System.IO.Directory]::CreateDirectory($targetFolder) | Out-Null

        $foregroundEntry = $archive.GetEntry("$apkFolder/ic_launcher_foreground.png")
        $roundEntry = $archive.GetEntry("$apkFolder/ic_launcher_round.png")
        if (-not $foregroundEntry -or -not $roundEntry) {
            throw "Launcher assets for $density were not found in $apkPath"
        }

        [System.IO.Compression.ZipFileExtensions]::ExtractToFile(
            $foregroundEntry,
            (Join-Path $targetFolder 'ic_launcher_foreground.png'),
            $true
        )
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile(
            $roundEntry,
            (Join-Path $targetFolder 'ic_launcher_round.png'),
            $true
        )
        # The reference APK's complete round artwork is also the safest legacy icon.
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile(
            $roundEntry,
            (Join-Path $targetFolder 'ic_launcher.png'),
            $true
        )
    }
}
finally {
    $archive.Dispose()
}

# Use the same interlocking mark on the native startup screen, centred on the
# existing dark background at a comfortable, accessible size.
Add-Type -AssemblyName System.Drawing
$launcher = [System.Drawing.Image]::FromFile((Join-Path $resourceRoot 'mipmap-xxxhdpi\ic_launcher_round.png'))
try {
    Get-ChildItem -LiteralPath $resourceRoot -Filter 'splash.png' -Recurse | ForEach-Object {
        $old = [System.Drawing.Image]::FromFile($_.FullName)
        $width = $old.Width
        $height = $old.Height
        $old.Dispose()
        $canvas = New-Object System.Drawing.Bitmap($width, $height)
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        $graphics.Clear([System.Drawing.Color]::FromArgb(7, 19, 31))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $size = [int]([Math]::Min($width, $height) * .27)
        $graphics.DrawImage($launcher, [int](($width-$size)/2), [int](($height-$size)/2), $size, $size)
        $canvas.Save($_.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $canvas.Dispose()
    }
}
finally {
    $launcher.Dispose()
}

Write-Host "Restored the exact launcher artwork from $apkPath"
