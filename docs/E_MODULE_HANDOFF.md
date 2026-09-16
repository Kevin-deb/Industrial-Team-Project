# E module local handoff

This branch implements only the E-owned modules: health management and the optional peer community. It is source code for Windows and macOS development; no installer or package was produced, and nothing in this work requires a GitHub push.

## Implemented scope

- Health management: patient search, a narrow E-owned patient summary, filtered and paged observations with a small trend view, care plans with version history, doctor-authored assessments, and reminder tasks.
- Peer community: a joined-group post feed, specialty-group forums, posts, comments and replies, likes, bookmarks, reports, personal activity pages, interaction notifications, private conversations, and opt-in settings.
- Shared E frontend infrastructure: typed requests, partial query refresh, bounded cache lifetime, retry policy, loading/error states, and command identifiers for safe write retries.
- E service layer: validation, patient access checks, idempotent command receipts, optimistic-concurrency checks for care plans, structured metadata-only logs, SQLite repositories, migrations, and synthetic fixtures.

## Team interfaces deliberately left open

| Owner                       | Interface used or reserved by E                                                                                | What E does not implement                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| B / patient management      | `PatientAccessPort` and `PatientSummaryPort`; E exposes its narrow read model at `GET /api/v1/health/patients` | Patient identity, demographics, assignments, permissions, patient CRUD, or B's full patient DTO                                |
| A / platform                | `RequestContext`, `HealthAuditPort`, and the existing app composition root                                     | Real authentication, authorization policy, audit storage, global navigation, and global accessibility controls                 |
| External notification owner | `HealthNotificationPort`                                                                                       | SMS, email, push delivery, provider credentials, or delivery receipts                                                          |
| C/D clinical modules        | No direct import or database relation                                                                          | Medical records, diagnoses, prescriptions, consultations, moderation operations, or sharing patient records into the community |

The default local composition uses the existing synthetic patient repository only as an adapter behind the two patient ports. When another owner supplies the production implementation, replace the adapter in `apps/api/src/app.ts`; E's health service should not be changed to query another domain's tables.

## Safety and consistency rules

- Health queries are always scoped to the current doctor through `PatientAccessPort`.
- The community schema has no foreign keys to patient, encounter, clinical, or health data.
- Posts containing case material require an explicit manual de-identification confirmation.
- Reminder tasks remain `planned` when no real notification provider is wired; the UI never reports a fake delivery.
- Reminder delivery claims are durable and provider retries reuse the same idempotency key; the external notification adapter is intentionally left unwired.
- Logs contain request, route, action, resource identifier, and outcome metadata, not free-text health or community content.
- API response data is the business source of truth. The frontend cache accelerates display and invalidates only affected query groups; it does not maintain a separate set of demo records.
- Community preferences are stored in SQLite. Disabling participation clears other E-community caches and prevents forum, personal activity, notification, and message queries from being mounted.

## E API notes for teammates

### Completion additions (16 September 2026)

- Reply reactions: `POST` / `DELETE /api/v1/social/comments/:id/likes` and `/bookmarks`, with a `commandId` body. Post details include reply counts and current-doctor reaction flags. Repeated likes do not generate duplicate notifications; removing a reaction updates persisted counts. Personal likes/bookmarks include the containing topic when a reply is reacted to.
- Moderation callback: `SocialModerationResultPort.receiveModerationResult({eventId, reportId, outcome, reviewedAt})`, where outcome is `upheld` or `rejected`. Wire only from the trusted moderation adapter at the composition root. No doctor-facing HTTP endpoint grants review permissions. Replayed events are idempotent; conflicting decisions are rejected. Report state and notifications commit together. Upheld topic reports remove the topic from published queries; its original data remains stored. Private-message notices have no fabricated topic link.
- Notification preferences and community opt-out apply to result notices as well. Result history is persisted even when notifications are disabled.
- Migration **13**, `social_comment_reactions`, is append-only. Coordinate this version with A before merging with other migrations. Never renumber an already deployed migration.
- Tests exercise accepted/upheld/rejected notices, callback replay/conflict, removed-topic handling, private-message report persistence, unavailable-topic UI, reply reaction counts and the selection-only label policy.
- Verification for this change: `npm run check` passed (46 API, 22 frontend, 6 desktop protocol tests and builds); browser E2E 8/8 passed. Whole-application desktop UI tests passed 2/3: the English-page audit fails on C's `/consultations` Chinese clinician name/department labels. This is recorded without modifying C-owned UI. Windows real-hardware acceptance was not run.

### Remaining external integration, not implemented by E

- A/B: authenticated request contexts, production patient access and directory adapters.
- A notification service: connect `HealthNotificationPort` for real patient delivery. Until then reminders truthfully remain planned; test-provider behavior does not prove real delivery.
- Hospital/device provider: supply authorized monitoring observations through an agreed adapter. Local synthetic readings and manual entry are not a live hospital/device connection.
- Moderation owner: perform review and deliver trusted result callbacks. E supplies result consumption and doctor notifications, not a moderation administration UI.
- Clinical owner: approve reference-range rules. Current age-specific reference rules are explicitly demonstration metadata, not validated clinical guidance.
- Platform release QA: Windows/macOS real-hardware recording and release acceptance; this change does not build installers.

- Public reaction resources use `POST` / `DELETE /api/v1/social/posts/:id/likes` and `/bookmarks`.
- Personal notifications use `GET /api/v1/social/me/notifications`; clicking an item marks it read and opens the referenced post.
- Direct-message history uses an opaque tuple cursor and returns 30 messages per page, so records sharing the same timestamp are not skipped.
- Database migration 9 adds source-level observation deduplication, durable reminder-delivery attempts, and a deterministic backfill for legacy direct messages without a conversation.

## Local verification

Use Node.js 24.14.x and run:

```powershell
npm run check
npm run test:e2e
```

The browser suite is a development check only. Desktop transport remains the existing Electron `carelink://` bridge, so the same E frontend and API code can be composed on Windows and macOS without platform-specific paths.
