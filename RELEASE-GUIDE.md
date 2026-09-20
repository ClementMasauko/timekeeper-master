# TimeKeeper Master — Update and Release Guide

Use this guide when you need to publish a TimeKeeper update without assistance.

## Protect the signing identity

Never delete, publish, email, or commit these files:

```text
C:\Users\user\Desktop\TIME\release\timekeeper-master.jks
C:\Users\user\Desktop\TIME\.release-secrets.properties
```

Back up both files together in a private and secure location. Every update must use this same signing key, or Android will reject it as an update to the installed application.

Never publish a Supabase secret key, service-role key, database password, signing password, or keystore.

## 1. Increase the Android version

Open:

```text
C:\Users\user\Desktop\TIME\android\app\build.gradle
```

Find these values:

```gradle
versionCode 2
versionName "1.1.0"
```

For the next release, increase them. For example:

```gradle
versionCode 3
versionName "1.2.0"
```

Rules:

- `versionCode` must be a whole number and must increase for every release.
- `versionName` is the version users see.
- Never reuse an old version code for a different APK.

## 2. Build the signed release APK

Open PowerShell in:

```text
C:\Users\user\Desktop\TIME
```

Run:

```powershell
.\build-release.ps1
```

The expected output is:

```text
C:\Users\user\Desktop\TIME\release\TimeTableMaster-release.apk
```

Do not publish the APK if the build reports an error.

## 3. Verify the APK signature

Run:

```powershell
.\.android-sdk\build-tools\35.0.0\apksigner.bat verify --verbose .\release\TimeTableMaster-release.apk
```

The output must begin with `Verifies` and report at least one supported signature scheme as `true`.

## 4. Calculate the SHA-256 checksum

Run:

```powershell
Get-FileHash .\release\TimeTableMaster-release.apk -Algorithm SHA256
```

Copy the complete hash. It identifies the exact APK users will download.

## 5. Prepare the public APK

Make a copy of `TimeTableMaster-release.apk` and rename the copy exactly:

```text
TimeTableMaster.apk
```

The filename is case-sensitive in the update address. Do not add spaces or a version number to this public copy.

## 6. Update the release information

The online update manifest is:

[update.json](https://github.com/ClementMasauko/clement-masauko/blob/main/update.json)

Update it using this format:

```json
{
  "versionCode": 3,
  "versionName": "1.2.0",
  "minimumVersionCode": 2,
  "required": false,
  "apkUrl": "https://raw.githubusercontent.com/ClementMasauko/clement-masauko/main/TimeTableMaster.apk",
  "notes": [
    "Describe the first improvement",
    "Describe the second improvement"
  ],
  "sha256": "PASTE_THE_NEW_SHA256_HERE",
  "publishedAt": "YYYY-MM-DD"
}
```

Use `"required": false` for an ordinary update. Only set it to `true` when an older release is unsafe or incompatible.

## 7. Upload the update files

Open the public update repository:

[ClementMasauko/clement-masauko](https://github.com/ClementMasauko/clement-masauko)

Replace both files:

- `TimeTableMaster.apk`
- `update.json`

Commit the changes. Uploading both together prevents the manifest from pointing to the wrong APK.

The permanent public APK address is:

```text
https://raw.githubusercontent.com/ClementMasauko/clement-masauko/main/TimeTableMaster.apk
```

## 8. Commit and push the source code

From `C:\Users\user\Desktop\TIME`, run:

```powershell
git add -A
git commit -m "Release-TimeKeeper-1.2.0"
git push
```

The source repository is:

[ClementMasauko/timekeeper-master](https://github.com/ClementMasauko/timekeeper-master)

The `.gitignore` file prevents signing credentials, APKs, SDKs, caches, and generated builds from being committed.

## 9. Test the update as a user

Use a phone containing the previous version:

1. Connect the phone to the internet.
2. Open TimeKeeper Master.
3. Open **Settings → App updates**.
4. Tap **Check for updates**.
5. Confirm that the new version and release notes appear.
6. Tap **Download signed update**.
7. Approve Android's installation request.
8. Reopen TimeKeeper.
9. Confirm the new version works and existing timetable data remains available.

Android may ask the user to allow the browser to **Install unknown apps**. This approval cannot be bypassed.

## Troubleshooting

### The app says “Up to date”

- Confirm the online `versionCode` is greater than the installed version code.
- Confirm `update.json` was committed successfully.
- Wait approximately five minutes for GitHub's cache to refresh, then check again.

### Android says “App not installed”

- Confirm the new APK was signed with `timekeeper-master.jks`.
- Confirm the package name remains `com.timekeeper.master`.
- Confirm the version code increased.
- Do not uninstall the old app unless its local data has been backed up.

### The download fails

- Confirm the APK is named exactly `TimeTableMaster.apk`.
- Open the permanent public APK address in a browser.
- Confirm the GitHub repository remains public.

### The build fails

- Read the first actual error shown by `build-release.ps1`.
- Confirm Android SDK Platform 35 and Build-Tools 35 are installed.
- Confirm the signing files still exist.
- Do not publish an older APK as if it were the new release.

## Final release checklist

- [ ] Code changes tested
- [ ] `versionCode` increased
- [ ] `versionName` updated
- [ ] Release APK built successfully
- [ ] APK signature verified
- [ ] SHA-256 checksum calculated
- [ ] APK renamed to `TimeTableMaster.apk`
- [ ] `update.json` updated
- [ ] APK and manifest uploaded together
- [ ] Source committed and pushed
- [ ] Update tested over the previous version
- [ ] Existing user data confirmed intact

