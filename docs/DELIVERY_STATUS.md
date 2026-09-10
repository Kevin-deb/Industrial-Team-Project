# Iteration 0 Desktop Delivery Status

CareLink 0.2.0 targets an installable Windows doctor application with an immediate, persistent Chinese/English interface switch. It retains the Iteration 0 synthetic-data scope. The latest desktop/language instruction supersedes the earlier browser-delivery assumption; clinical write workflows remain future iterations.

## Framework implementation

| Area                      | Implemented design and current scope                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows application       | Electron main process, sandboxed renderer, bundled local assets and embedded Fastify services; NSIS and unpacked Windows x64 packaging         |
| Internal transport        | `carelink://app/` serves local assets; `/api/v1` calls Fastify through `app.inject`; desktop mode opens no HTTP listener                       |
| Languages                 | `zh-CN` default and `en` option; shared top-bar/Settings preference, domain message catalogs and locale-aware presentation                     |
| Workspace                 | Dashboard and eight domain pages: patients, encounters, records, expert consultations, health, audit, community preview and settings           |
| Patient/clinical previews | Search, filters, read-only details, schedules, records/review summaries, health trends and care-plan examples using fictional data             |
| Audit                     | Seed events and local patient-list/detail access events filtered to the synthetic doctor                                                       |
| Preferences               | Language and community-entry visibility persist in the application profile; the actual social service and social notifications remain disabled |
| Service boundary          | Eleven read routes and 39 explicit reserved commands; reserved commands return `501 FEATURE_NOT_IMPLEMENTED`, unknown paths return `404`       |
| Persistence               | Six domain migrations, relational constraints and synthetic seeding; installed data at `%APPDATA%\CareLink Doctor\data\doctor.sqlite`          |
| Team separation           | Owned renderer pages/catalogs, backend commands/repositories/migrations, shared DTOs and external-provider ports                               |

The fixed demonstration date is 10 September 2026. Displayed patients, clinical values and workload examples are fictional. Local audit timestamps reflect demo requests. The fixed synthetic identity is not real authentication. A desktop package does not enable clinical writes or connect external providers.

## Delivery artifacts

The generated [Windows installer](https://github.com/Kevin-deb/Industrial-Team-Project/releases/download/v0.2.0/CareLink-Doctor-0.2.0-Windows-x64-Setup.exe) is published with its checksum through [GitHub release 0.2.0](https://github.com/Kevin-deb/Industrial-Team-Project/releases/tag/v0.2.0). Local build outputs are `release/CareLink-Doctor-0.2.0-Windows-x64-Setup.exe` and the complete `release/win-unpacked/` directory.

| Artifact                 | Recorded result                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Installer                | `CareLink-Doctor-0.2.0-Windows-x64-Setup.exe`                                              |
| Size                     | 111,592,108 bytes (106.4 MiB)                                                              |
| SHA-256                  | `b86192da109072257bb1eea98430450146e0609a99f5754e407d9348486543fb`                         |
| Publisher signature      | NotSigned — current framework preview has no publisher certificate                         |
| Runtime                  | Electron 44.3.0, embedded Node.js 24.20.0, Chromium 152.0.7977.78                          |
| Tested host              | Windows 11 Home, Chinese edition, x64, OS build 10.0.26200                                 |
| Supported package target | Windows 10/11 x64; this delivery was exercised on Windows 11, not separately on Windows 10 |

The NSIS installer completed a per-user installation into an isolated validation directory with exit code 0. The full native integration suite then passed against the installed executable. Users need no Node.js installation or separate browser. The normal application data location was verified as `%APPDATA%\CareLink Doctor`; the test uninstaller exited with code 0, removed its application and shortcuts, and preserved the default-profile SQLite file with an unchanged checksum. See [Desktop guide](DESKTOP_GUIDE.md) for install, launch and development procedures.

## Future clinical delivery

| Iteration   | Reserved functionality                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1           | Real identity/session integration, enforced clinical access, persistent patient edits, text encounters and record drafts |
| 2           | Senior review/archive, independent orders, export jobs, care plans/assessments and reminders through a test provider     |
| 3           | Images/media, policy-controlled recording, expert consultation, temporary access and confirmed reports                   |
| 4           | Live data/notification providers, operational monitoring, backup/restore, performance and release hardening              |
| 5, optional | Isolated professional groups, manually de-identified posts, interaction, reporting and server-side social opt-out        |

Every new feature must preserve both interface languages. Tables and provider interfaces reserve future behavior without implementing it. No real identity, hospital/device, RTC, recording, storage or messaging provider is configured.

## Verification status

Validation completed on 10 September 2026:

| Check                                                          | Result                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                | Passed source boundaries, all workspace TypeScript checks, 12 API tests, 3 desktop protocol tests and renderer/API/desktop builds                           |
| `npm run test:desktop` against source-built desktop            | 3 passed                                                                                                                                                    |
| `npm run test:desktop` against the actual installed executable | 3 passed, including all nine pages in English, dialog switching, locale/community preference persistence, database/audit persistence and renderer isolation |
| Optional `npm run test:e2e`                                    | 5 passed for the browser development environment                                                                                                            |
| Windows NSIS packaging and actual installation                 | Passed, installation exit code 0                                                                                                                            |
| Bilingual visual inspection                                    | Chinese and English installed-client screenshots reviewed; domain review additionally covered 39 dialog/tab/template states                                 |
| `npm audit --omit=dev`                                         | Zero reported production dependency vulnerabilities at verification time                                                                                    |

A separate packaged launch without Playwright debugging switches had zero TCP listeners across the main process and its three child processes. Closing the native window exited with code 0. Default-profile SQLite startup also passed.

The first installed-client screenshot attempt timed out because the test window was hidden. Showing the window only during screenshot capture resolved the automation issue, and all installed-client tests passed on rerun. Application code and installer contents did not change for that correction.

The existing backend suite covers schema/relationships, scoped reads, query validation, synthetic grants, placeholder immutability, database reopen, safe errors and environment boundaries. Those tests do not establish production authentication, live access revocation or clinical correctness. Desktop-specific checks must additionally establish renderer isolation, private-protocol routing, clean lifecycle and profile persistence.

The Windows/Ubuntu GitHub Actions configuration remains an inactive template in `docs/ci/`. The available credential lacks the permission to upload active workflow files. The successful local Windows build and installation above do not establish a remote CI run; remote CI has not run.

See [Iteration plan](ITERATION_PLAN.md), [Architecture](ARCHITECTURE.md), [API conventions](API_CONVENTIONS.md) and [Requirement traceability](REQUIREMENTS_TRACEABILITY.md).
