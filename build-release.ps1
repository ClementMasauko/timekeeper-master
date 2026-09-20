$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$secretFile = Join-Path $projectRoot '.release-secrets.properties'
$releaseDir = Join-Path $projectRoot 'release'
$keyStore = Join-Path $releaseDir 'timekeeper-master.jks'
$javaHome = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.gradle\jdks') -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\keytool.exe') } | Select-Object -First 1
if (-not $javaHome) { throw 'Java 21 is required. Run build-apk.ps1 once first.' }
[System.IO.Directory]::CreateDirectory($releaseDir) | Out-Null
if (-not (Test-Path -LiteralPath $keyStore)) {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $password = [Convert]::ToBase64String($bytes).Replace('+','A').Replace('/','B')
    [System.IO.File]::WriteAllText($secretFile, "storePassword=$password`nkeyAlias=timekeeper`nkeyPassword=$password`n")
    & (Join-Path $javaHome.FullName 'bin\keytool.exe') -genkeypair -v -keystore $keyStore -alias timekeeper -keyalg RSA -keysize 4096 -validity 10000 -storepass $password -keypass $password -dname 'CN=TimeKeeper Master, OU=Mobile, O=TimeKeeper Master, C=MW'
    if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed.' }
}
if (-not (Test-Path -LiteralPath $secretFile)) { throw 'The release secret file is missing. Restore it before building updates.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
& node -r .\scripts\windows-node-preload.cjs .\node_modules\@capacitor\cli\bin\capacitor sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle'
$env:JAVA_HOME = $javaHome.FullName
$env:ANDROID_HOME = Join-Path $projectRoot '.android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
Push-Location (Join-Path $projectRoot 'android')
try { & .\gradlew.bat assembleRelease; if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' } } finally { Pop-Location }
$built = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
$output = Join-Path $projectRoot 'release\TimeTableMaster-release.apk'
Copy-Item -LiteralPath $built -Destination $output -Force
Write-Host "Signed release APK ready: $output" -ForegroundColor Green
