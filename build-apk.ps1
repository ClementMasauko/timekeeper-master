$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle'

$localSdk = Join-Path $projectRoot '.android-sdk'
$sdkCandidates = @(@($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'), $localSdk) |
    Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'platforms\android-35\android.jar')) })

if (-not $sdkCandidates) {
    $sdkManager = Join-Path $localSdk 'cmdline-tools\latest\bin\sdkmanager.bat'
    if (-not (Test-Path -LiteralPath $sdkManager)) {
        Write-Host 'Android SDK Platform 35 is missing.' -ForegroundColor Yellow
        Write-Host 'Install Android SDK Platform 35 and Build-Tools 35 from Android Studio > SDK Manager.'
        exit 1
    }

    Write-Host 'Android SDK 35 is missing. Installing it into this project...' -ForegroundColor Yellow
    Write-Host 'This is a large one-time download. Leave this window open even if progress pauses.'
    $env:ANDROID_HOME = $localSdk
    $env:ANDROID_SDK_ROOT = $localSdk
    1..100 | ForEach-Object { 'y' } | & $sdkManager --sdk_root=$localSdk 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $localSdk 'platforms\android-35\android.jar'))) {
        Write-Host 'SDK installation did not finish. Check the internet connection and run .\build-apk.ps1 again; completed downloads will be reused.' -ForegroundColor Red
        exit 1
    }
    $sdkCandidates = @($localSdk)
}

$env:ANDROID_HOME = $sdkCandidates[0]
$env:ANDROID_SDK_ROOT = $sdkCandidates[0]
$sdkForProperties = $sdkCandidates[0].Replace('\', '\\')
[System.IO.File]::WriteAllText((Join-Path $projectRoot 'android\local.properties'), "sdk.dir=$sdkForProperties`r`n")
Write-Host "Using Android SDK: $($sdkCandidates[0])" -ForegroundColor Cyan
$downloadedJava = Get-ChildItem -LiteralPath (Join-Path $env:GRADLE_USER_HOME 'jdks') -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe')) -and $_.Name -match '21' } |
    Select-Object -First 1
if ($downloadedJava) {
    $env:JAVA_HOME = $downloadedJava.FullName
    Write-Host "Using Java 21: $env:JAVA_HOME" -ForegroundColor Cyan
} else {
    Write-Host 'Java 21 will be downloaded automatically. Run this script again after the first download if Gradle initially starts with Java 17.' -ForegroundColor Cyan
}

Push-Location (Join-Path $projectRoot 'android')
try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed with exit code $LASTEXITCODE" }
    Write-Host "`nAPK ready: $projectRoot\android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green
}
finally {
    Pop-Location
}
