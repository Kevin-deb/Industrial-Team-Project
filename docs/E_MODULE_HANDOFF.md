# E module local handoff

This branch implements only the E-owned modules: health management and the optional peer community. It is source code for Windows and macOS development; no installer or package was produced, and nothing in this work requires a GitHub push.

## Implemented scope

- Health management: patient search, patient summary display, observations, care plans with version history, doctor-authored assessments, and reminder tasks.
- Peer community: a joined-group post feed, specialty-group forums, posts, comments and replies, likes, bookmarks, reports, personal activity pages, interaction notifications, private conversations, and opt-in settings.
- Shared E frontend infrastructure: typed requests, partial query refresh, bounded cache lifetime, retry policy, loading/error states, and command identifiers for safe write retries.
- E service layer: validation, patient access checks, idempotent command receipts, optimistic-concurrency checks for care plans, structured metadata-only logs, SQLite repositories, migrations, and synthetic fixtures.

## Team interfaces deliberately left open

| Owner                       | Interface used or reserved by E                                            | What E does not implement                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| B / patient management      | `PatientAccessPort`, `PatientSummaryPort`, and `GET /api/v1/patients`      | Patient identity, demographics, assignments, permissions, and patient CRUD                                                     |
| A / platform                | `RequestContext`, `HealthAuditPort`, and the existing app composition root | Real authentication, authorization policy, audit storage, global navigation, and global accessibility controls                 |
| External notification owner | `HealthNotificationPort`                                                   | SMS, email, push delivery, provider credentials, or delivery receipts                                                          |
| C/D clinical modules        | No direct import or database relation                                      | Medical records, diagnoses, prescriptions, consultations, moderation operations, or sharing patient records into the community |

The default local composition uses the existing synthetic patient repository only as an adapter behind the two patient ports. When another owner supplies the production implementation, replace the adapter in `apps/api/src/app.ts`; E's health service should not be changed to query another domain's tables.

## Safety and consistency rules

- Health queries are always scoped to the current doctor through `PatientAccessPort`.
- The community schema has no foreign keys to patient, encounter, clinical, or health data.
- Posts containing case material require an explicit manual de-identification confirmation.
- Reminder tasks remain `planned` when no real notification provider is wired; the UI never reports a fake delivery.
- Logs contain request, route, action, resource identifier, and outcome metadata, not free-text health or community content.
- API response data is the business source of truth. The frontend cache accelerates display and invalidates only affected query groups; it does not maintain a separate set of demo records.

## Local verification

Use Node.js 24.14.x and run:

```powershell
npm run check
npm run test:e2e
```

The browser suite is a development check only. Desktop transport remains the existing Electron `carelink://` bridge, so the same E frontend and API code can be composed on Windows and macOS without platform-specific paths.
