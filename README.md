# TimeKeeper Master

An offline-first Android timetable manager for teachers and students. Timetables, allocations, teacher profiles, PDFs and reminders stay on the device.

## Features

- Multiple independently named timetables, with safe renaming and deletion
- Separate allocation, teacher, form, display filter and reminder state for every timetable
- Today, chosen-day and full-week views
- Teacher-only or whole-timetable display after allocation matching
- Text PDF and master-grid parsing with Form, Class, Grade and Year group support
- PDF and Word (`.docx`) subject-allocation import
- Full subject names, custom short names and acronym matching
- Offline weekly reminders across every timetable whose alerts are enabled
- Sound, vibration, both or reminders off
- Exact-alarm support on compatible Android devices
- Protected deletion and native PDF cleanup
- Native sharing of each timetable's original PDF
- Automatic migration of data and PDFs from earlier app versions
- Accessible high-contrast light, dark and device themes
- Fully offline operation, with optional private account-based cloud sync
- No analytics; cloud sync is disabled until the owner configures it

Scanned/image-only or unusual PDFs may still require manual class entry. The original PDF remains available offline.

## Development

```powershell
npm install
npm run build
npm run android:sync
```

Build the testing APK with:

```powershell
./build-apk.ps1
```

Build a signed, optimized release APK with:

```powershell
./build-release.ps1
```

The first release build creates a private signing key in `release/timekeeper-master.jks` and credentials in `.release-secrets.properties`. Back up both securely: future updates must use the same key. These files are excluded from source control.

Outputs:

- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `release/TimeTableMaster-release.apk`

## Optional offline-first cloud sync

1. Create a Supabase project and enable Email authentication.
2. In its SQL editor, run `supabase/setup.sql`. This creates the private
   `timekeeper-sync` bucket and owner-only storage policies.
3. In the app, open **Settings > Cloud sync** and enter the project URL and
   publishable key. Never enter a secret or service-role key in the app.
4. Create an account or sign in, then select **Sync now**.

The app always writes locally first. Without internet or an account, all
existing timetable, parsing, reminder, sharing and backup features continue
to work normally. The project URL and publishable key are intentionally not
committed because each distributor should connect their own Supabase project.
