# CareLink Doctor Service System

CareLink is a bilingual Windows desktop application for a five-person doctor-service project. The current source supports authenticated local workflows using synthetic data: patient management, encounters, clinical records and orders, consultations, health plans, reminders, audit and account settings.

**2026-09-28 member A delivery:** account-scoped settings, audit filtering/pagination/CSV export, consultation authorization, scheduled delivery into a local patient test inbox, desktop verification and verified backup/restore. See the [implementation and validation record](docs/MEMBER_A_IMPLEMENTATION_2026-09-28.md) and [tomorrow's demonstration guide](docs/DEMO_RUNBOOK_MEMBER_A.md).

Email codes can be received through the local test mailbox. Photo verification is a demonstration, not biometric recognition. Patient SMS/email reminders are delivered to a clearly labelled local inbox. Video remains a local camera preview; two-party calling, recording/playback and external patient delivery are not implemented. The UI must not claim media was saved.

## Run the current source on Windows

Use Node.js **24.14.0 or later in the 24.x line**. Initial dependency and Electron downloads need internet access. In this repository:

```powershell
npm ci
npm run check
npm run demo:prepare -- --profile ".\runtime\demo-tomorrow"
$env:CARELINK_PROFILE_PATH = (Resolve-Path ".\runtime\demo-tomorrow").Path
npm start
```

The preparation command creates a separate synthetic profile with current demonstration dates and refuses to overwrite a nonempty directory. To start that same profile again, set the environment variable and run `npm start`; do not prepare it again. Default synthetic login: `lin.zhiyuan` / `123456`. Other role accounts and the test-mail flow are in the demonstration guide.

Desktop operation uses local assets, SQLite and a private `carelink://app/` protocol without an HTTP listener. No separate database server is needed. Normal profiles are under `%APPDATA%\CareLink Doctor`; the environment variable selects an independent demonstration profile.

## Build a portable directory

```powershell
npm run package:dir
```

Run `release/win-unpacked/CareLink Doctor.exe` with **the entire adjacent folder**. Packaging outputs and runtime data are excluded from Git. The historical [v0.2.0 release](https://github.com/Kevin-deb/Industrial-Team-Project/releases/tag/v0.2.0) does not include this source update; build the current checkout for this demonstration. An NSIS installer can separately be generated with `npm run package:win`; signing and publication are separate work.

Optional browser development uses `npm run dev:web` (frontend 5173, loopback API 3001). It stores data separately from the desktop profile. Browser integration tests use an isolated server on 3109 and real login sessions.

## Verify and protect the demonstration

```powershell
npm run check
npm run test:e2e
npm run test:realtime
npm run test:desktop
npm run test:load
```

`check` covers module boundaries, workspace types, API/web/desktop unit tests, integration/recovery checks and production builds. The three-minute local load test measures 1/5/10 paced concurrent clients against an isolated in-memory database, not maximum desktop or production capacity. Run it after other builds/tests finish. Exact results and limitations are in the delivery record; remote CI is not claimed.

Close CareLink before backing up. Use a new output/restore directory each time:

```powershell
npm run profile:backup -- --profile ".\runtime\demo-tomorrow" --output ".\runtime\backups\demo-ready"
npm run profile:verify -- --backup ".\runtime\backups\demo-ready"
npm run profile:restore -- --backup ".\runtime\backups\demo-ready" --target ".\runtime\demo-restored"
```

These tools preserve a consistent database snapshot and community media, validate checksums/foreign keys/media references, and refuse to overwrite an existing profile. They do not copy browser login or language caches. See the [recovery handoff](docs/handoffs/A-desktop-and-recovery.md).

## Team documentation

| Document                                                                         | Purpose                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Demonstration guide](docs/DEMO_RUNBOOK_MEMBER_A.md)                             | Accounts, preparation, live script and recovery                     |
| [Member A implementation](docs/MEMBER_A_IMPLEMENTATION_2026-09-28.md)            | Scope, migrations, verification and remaining work                  |
| [A/C handoff](docs/handoffs/A-C-consultation-access.md)                          | Temporary access, membership and completion                         |
| [A/E handoff](docs/handoffs/A-E-demo-notifications.md)                           | Scheduled tasks and local patient inbox                             |
| [Settings handoff](docs/handoffs/A-settings.md)                                  | Profile and notification preferences                                |
| [Audit handoff](docs/handoffs/A-audit.md)                                        | Scoped queries and CSV export                                       |
| [Desktop guide](docs/DESKTOP_GUIDE.md)                                           | Runtime, data paths and packaging                                   |
| [Architecture](docs/ARCHITECTURE.md)                                             | Process and domain boundaries                                       |
| [API conventions](docs/API_CONVENTIONS.md)                                       | Contracts and integration rules                                     |
| [Team workflow](docs/TEAM_WORKFLOW.md)                                           | Five-person ownership                                               |
| [Original optimization plan](docs/MEMBER_A_DEMO_OPTIMIZATION_PLAN_2026-09-28.md) | Baseline findings and priorities; superseded by actual verification |

## Repository layout

```text
apps/desktop/       Electron runtime, private protocol and profile locking
apps/web/           React renderer, bilingual UI and owned business modules
apps/api/           Embedded Fastify services and SQLite repositories
packages/contracts/ Shared DTOs and domain integration contracts
database/           Regenerated schema/seed snapshots, not user-data backups
scripts/            Build, preparation, recovery and verification
tests/              Browser, desktop and cross-module integration tests
docs/               Requirements, guides, evidence and handoffs
runtime/            Ignored local data and test outputs
release/            Ignored packaging outputs
```

Members own their domain modules: A platform/integration, B patients, C encounters/consultations, D clinical records/orders, E health/community. Cross-domain imports use public entry points. This remains a local synthetic demonstration; live clinical deployment and external providers require further implementation and validation.
