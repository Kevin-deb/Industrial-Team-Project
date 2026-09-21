# E module local handoff

## A/B/E local integration (2026-09-18)

- B patient details can open `/health?patientId=...`. E resolves that exact ID through `GET /api/v1/health/patients/:id`, using the existing patient-summary and access ports. Reload/back navigation preserves selection; unavailable and forbidden IDs both return 404.
- Successful B registration, editing and batch operations publish metadata-only local cache invalidation. E refetches patient summaries/search without refreshing unrelated social or observation queries. Failed writes do not invalidate. This is same-renderer synchronization, not cross-device patient events.
- A now supplies the request identity from the validated Bearer session. Session display, B/E request contexts, audit queries and social WebSocket subscriptions use the same authenticated identity. No caller header or query parameter may choose it. The desktop bridge replaces the realtime subscription when the user signs in or out. Tests may inject a trusted identity fixture directly into the composition root; runtime desktop/web modes require a session.

## Reproducible reply notification verification (2026-09-18)

After `npm run build`, run `npx tsx --test tests/integration/reply-notifications.test.ts` with the supported Node runtime and installed Playwright Chromium. Eight scenarios exercise actual browser pages, HTTP routes, WebSocket frames and an isolated SQLite database: comments and nested replies under normal, self, recipient-community-disabled and recipient-notifications-disabled conditions. Normal cases verify live unread-count changes, the correct recipient, visible notification text, click-through and persisted read state. Negative cases verify that content persists without notification rows or notification events. Screenshots are generated under `test-results/reply-notification-*.png` and are not committed. The focused authenticated cross-module check is `npx tsx --test tests/integration/auth-scope-flow.test.ts`; it creates independent clinician sessions and verifies patient isolation, E access, audit ownership and logout revocation. External email delivery, Windows hardware, OS push notifications and real biometrics remain outside these tests.

Known wider desktop-suite failures remain outside this change: the old patient-create placeholder assertion expects 501 rather than the implemented route's invalid-input 400, and the consultations English screen retains Chinese content. Do not interpret the scoped notification checks as a completely passing desktop suite.

## Content editing and deletion (2026-09-16)

- `PATCH /api/v1/social/posts/:id/content` and `comments/:id/content`: commandId and action (`edit` / `delete`); edits also carry body and post title. No user-entered reason is required. Existing attachments remain unchanged.
- Authors can edit/delete their own content, including anonymous content. A post author may delete comments on their own post but cannot edit other authors' comments. Ownership is enforced server-side.
- Deletion is logical: original rows and media references are retained. A deleted post returns no body, media or replies. Deleted comments recursively hide descendants; existing reaction holders receive a text-only tombstone. Personal post reactions remain present.
- Migration 14 stores actor, automatic action description, timestamp and before/after snapshots in `social_content_history` inside the command transaction. `GET .../:id/history` is restricted to the content author or containing post author; command retries replay without another history record.
- Comment reports carry commentId with postId. Review remains an external adapter callback, not an ordinary doctor's permission.
- E panels scroll locally with reserved scroll gutters. A browser geometry regression checks tab and panel origins across short/long views (1px tolerance).

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
| A / platform                | Validated session `RequestContext`, `HealthAuditPort`, scoped grants and the app composition root               | Production identity provider, external email transport, real biometric matching, global navigation and accessibility controls |
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

- Recipient opt-out is checked inside the private-message write transaction; disabled recipients cannot be sent new messages and failed writes leave no message record.
- Committed interaction notifications publish metadata-only `social.notifications.changed` events through the existing WebSocket/Electron bridge. The enabled community workspace owns a single subscription across tabs, invalidates only relevant notification/conversation/message queries, and reconciles on reconnect. Disabling community unmounts the subscription. Command replays and rolled-back notification writes do not publish new notification events. This is process-local signalling with API reload on reconnect, not a durable external event broker.
- Added isolated two-doctor/two-patient interaction tests and a test-only patient notification inbox. Inbox receipt tests verify patient targeting and idempotency, not real SMS/email or a patient application. No clinical data is copied into social event frames.

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
