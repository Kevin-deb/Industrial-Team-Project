# Iteration 0 Delivery Status

CareLink is a working local framework demonstration for the doctor service subsystem. It includes a light doctor workspace, a versioned API and persistent SQLite storage with synthetic records. The delivery completes the requested first framework step. The clinical workflows described in the iteration plan remain future work.

## Available in this framework

| Area                 | Current behavior                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doctor workspace     | Dashboard plus eight domain pages: patients, encounters, records, expert consultations, health, audit, community preview and settings                          |
| Patient browsing     | API-backed search, status/disease filters, pagination and read-only details; eight permitted synthetic patients and one excluded scope-test fixture            |
| Clinical previews    | Encounter schedules, record/review summaries, expert-consultation summaries, health trends with units/time/source and care-plan examples                       |
| Audit                | Seeded demonstration events and locally recorded patient list/detail accesses; view filtered to the fixed demonstration doctor                                 |
| Community preference | Browser-local switch hides/shows the community navigation entry and persists in that browser; the social service and all social messaging remain disabled      |
| Failure states       | Loading/error/empty views, retry controls and planned-function explanations; unavailable commands cannot report a completed clinical operation                 |
| Backend              | Eleven read routes and 39 explicit reserved command routes under `/api/v1`; reserved commands return `501 FEATURE_NOT_IMPLEMENTED`, unknown paths return `404` |
| Persistence          | Six ordered domain migrations, relational constraints, synthetic seeding, and a local database that persists across normal restarts                            |
| Team boundaries      | Domain-owned frontend pages, backend repositories/migrations/command files, shared typed contracts, provider interfaces and repository checks                  |

The fixed demonstration date is 10 September 2026. Displayed patients, observations, diagnoses and workloads are fictional. Local audit access timestamps reflect actual demo requests. Access-policy tests exercise synthetic role/scope/grant logic; no real user authentication is implemented.

## Reserved for later iterations

| Iteration   | Planned delivery                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1           | Real identity/session integration, server-enforced clinical access, persistent patient edits, text encounters and record drafts       |
| 2           | Senior review/archive, independent orders, history/export jobs, care plans/assessments and reliable reminders through a test provider |
| 3           | Images/media, policy-controlled recording, expert consultation, temporary access and confirmed report workflow                        |
| 4           | Live data/notification providers, operational monitoring, backup/restore, accessibility and performance release gates                 |
| 5, optional | Isolated peer groups, manually de-identified posts, interaction, reporting and server-side social notification opt-out                |

The database reserves record and order versions, review records, attachments/recordings, expert reports, health assessments, reminder jobs/outbox state and isolated social data. Provider interfaces cover identity, RTC, recording, storage, notification, hospital and device integration. These structures and interfaces do not yet execute the corresponding workflows. The browser preference is not a substitute for the future server-side social notification policy.

## Windows startup

Use Node.js 24.14.0 or later within the 24.x line. From the repository root:

```powershell
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Alternatively, run `npm run build` then `npm start`, and open `http://127.0.0.1:3001`, or use `start-windows.cmd`. The default database is `runtime/data/doctor.sqlite`. Initial dependency installation needs internet access; the installed local demonstration has no external provider dependency. The server binds to loopback and intentionally rejects production mode.

## Verification coverage

The twelve backend tests cover migration/foreign-key integrity, response envelopes and scoped dashboard counts, patient query validation, hidden-patient behavior, own-audit filtering, temporary grants including exact expiry and completed/mismatched tasks, all 39 placeholder commands with no database mutation, file persistence across restart, safe failure responses, local Host/Origin restrictions production-mode refusal, SQLite memory-mode configuration, incompatible migration histories, and static route/file boundaries. These tests validate the current demonstration, not future real authentication, clinical writes or live providers.

`npm run check` runs module boundary checks, strict TypeScript checks, the backend suite and both builds. `npm run test:e2e` runs Chromium UI/API integration checks after the application is built and the browser is installed. A GitHub Actions template for Windows and Ubuntu is saved at `docs/ci/github-actions.yml`. It is inactive: the available OAuth credential has repository access but lacks the `workflow` scope required to upload active workflow files. No remote CI run is claimed.

Local validation on Windows with Node.js 24.14.0 passed: module boundary checks, all three TypeScript workspaces, twelve backend integration tests, both application builds, and five Chromium browser tests covering all pages, global search, patient detail, unavailable operations, persistent community preferences, recovery from API failure and mobile navigation. Dependency audit reported zero vulnerabilities. Remote CI remains inactive pending installation of the supplied template by a repository maintainer. No live hospital, identity, video, recording or messaging provider has been exercised in this release.

See [Iteration plan](ITERATION_PLAN.md), [Architecture](ARCHITECTURE.md), [API conventions](API_CONVENTIONS.md) and [Requirement traceability](REQUIREMENTS_TRACEABILITY.md) for ownership and acceptance criteria.
