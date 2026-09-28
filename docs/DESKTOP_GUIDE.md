# CareLink Windows Desktop Guide

The current source implements authenticated local doctor workflows with synthetic records. For the 2026-09-29 demonstration, build the current checkout and follow [the demonstration guide](DEMO_RUNBOOK_MEMBER_A.md). The v0.2.0 installer instructions below describe a historical artifact and do not include the 2026-09-28 changes.

## Install and open

1. Obtain `CareLink-Doctor-0.2.0-Windows-x64-Setup.exe` and `SHA256SUMS.txt` from [release 0.2.0](https://github.com/Kevin-deb/Industrial-Team-Project/releases/tag/v0.2.0) and compare the checksum with `Get-FileHash -Algorithm SHA256 <installer-path>`.
2. Run the installer on Windows 10 or Windows 11, x64. Choose English or Chinese for setup and follow the per-user installation prompts; the installation folder can be selected.
3. Open **CareLink Doctor** from the Start menu or desktop shortcut. The application opens its own window and loads its local workspace.
4. Browse the demonstration patients, encounters, records, health views and other modules. Operations marked **Planned** or **待上线** explain their intended workflow and do not change clinical data.

No separate Node.js, npm, browser, Docker or database-server installation is required for end users. An unpacked build can also be run from `release/win-unpacked/CareLink Doctor.exe` when the whole unpacked folder is supplied. Keep its adjacent runtime files together; copying only the executable is insufficient.

The current development installer has no trusted publisher signature. Windows may show an unsigned-publisher or reputation warning. Verify that the package and checksum came from the intended project source. Production signing and update policy are separate release tasks; the framework does not silently download or install updates.

## Change the interface language

The application's default language is **Simplified Chinese (`zh-CN`)**. The installer's English/Chinese selection controls setup text independently; it does not replace the application's saved language preference. Select **English (`en`)** from the top-bar language control or the language setting in Settings. Select **简体中文** to switch back. Both controls update the same preference; the page updates immediately and the selection persists after the application closes and restarts.

Navigation, headings, actions, planned-function dialogs, settings, visible status labels and other interface text use the selected language. Dates use locale-aware presentation. Stable resource IDs, API paths and enum values stay unchanged. Patient-supplied or clinician-authored text is clinical content, not an interface message; future versions must preserve original content rather than silently translate it.

## Offline use and external services

The installed demonstration keeps assets, fonts, synthetic data and its application runtime locally. Browsing its existing data does not require internet access. There is no external browser launch, localhost address or independently started server in the desktop workflow.

Password login, local test email codes and scheduled patient test-inbox delivery work locally. SMTP is used only when explicitly configured. SMS gateways, biometric matching, hospital/device exchange, two-party video and recording/playback remain external or unfinished work. Local test inbox delivery is not internet delivery.

## Local data and preferences

The desktop database is `%APPDATA%\CareLink Doctor\data\doctor.sqlite` on a standard Windows profile. This is `data/doctor.sqlite` under Electron's `userData` directory for **CareLink Doctor**. It is separate from the installed executable and from the repository's source files. Normal restarts preserve the database; language and community-visibility preferences are retained in the application profile.

A source checkout's optional browser-development database is a different environment. Its default path is `runtime/data/doctor.sqlite` in the repository. Do not use that browser path to locate an installed user's desktop records.

Application data is intended to survive an ordinary uninstall/reinstall. Do not assume uninstalling is a secure data-erasure procedure. If a complete reset is required, close the application first, identify its actual profile directory and retain any needed backup before removing that exact directory. Deleting a profile also removes saved preferences and the local database. The current release contains demonstration data only; live-data backup, retention and erasure procedures must be designed before clinical use.

For a verified backup, close CareLink and use `npm run profile:backup -- --profile PATH --output NEW_PATH`, then `profile:verify`. Restore with `profile:restore` into a separate empty directory. The tools use a consistent SQLite snapshot, include community media, and verify checksums, foreign keys and attachment references. See [the recovery handoff](handoffs/A-desktop-and-recovery.md). `CARELINK_PROFILE_PATH` selects an absolute independent profile path for normal desktop use.

## Build from source on Windows

Developers need Node.js 24.14.0 or later within the 24.x line, npm, and internet access for the first package/runtime download. All commands run from `Industrial Team Project`:

```powershell
npm ci
npm run build
npm start
```

`npm run build` builds the renderer, API and desktop main process. `npm start` opens the desktop application using the built files. `npm run dev` builds the application and then opens the desktop window. The application itself uses Electron's bundled runtime; the developer's installed Node.js is needed for tooling.

```powershell
npm run package:dir
npm run package:win
```

`package:dir` creates `release/win-unpacked/`. `package:win` creates the NSIS installer under `release/`. The expected 0.2.0 installer is `CareLink-Doctor-0.2.0-Windows-x64-Setup.exe`. Packaging output, temporary data and `node_modules` must remain outside Git history. Share built installers through a release-artifact mechanism.

`npm run dev:web` is an optional renderer debugging aid. It starts the browser development environment on port 5173 and a loopback API on port 3001. It is not required for desktop users. Changing the API port requires the development proxy and test configuration to agree.

## Verify a desktop release

Use `npm run check` for boundaries, types, API/desktop-protocol tests and all builds, then `npm run test:desktop` for native Electron integration checks on Windows. `npm run test:e2e` is the optional browser-development suite. Before publishing an installer, verify installation, first launch, relaunch, database persistence, close behavior, and an English/Chinese switch that survives a restart. Check all modules in both languages, including dialogs and unavailable-feature labels. Verify the renderer cannot access Node.js directly and that local API calls do not open a listening port.

To run the same integration suite against an installed or unpacked build:

```powershell
$env:CARELINK_TEST_EXECUTABLE = 'C:\path\to\CareLink Doctor.exe'
npm run test:desktop
Remove-Item Env:CARELINK_TEST_EXECUTABLE
```

Tests use isolated profiles under `runtime/`; they do not reset the user's normal profile. Test screenshot steps briefly show a native window to obtain Windows compositor frames. Playwright injects temporary debugging listeners for automation; ordinary desktop launch does not open these ports.

Record the tested Windows edition/version, installer name and checksum, results and known limitations in [Delivery status](DELIVERY_STATUS.md). A successful browser test from an older build does not validate the desktop installer. Remote CI remains inactive until an authorized maintainer enables the supplied [CI template](ci/README.md).
