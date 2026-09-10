# API Conventions and Module Contracts

The browser and API share the `@doctor/contracts` package. Each feature owner implements against this boundary rather than importing another module's internals. This guide distinguishes the current read-only demonstration from rules for future clinical writes.

All application routes start with `/api/v1`. Requests and responses use JSON unless a future upload/download contract explicitly states otherwise. The current application uses a fixed synthetic doctor, synthetic records and a fixed demonstration date. It does not implement a real login or accept clinical writes.

## Implemented read API

| Method and path               | Owner                         | Response data     | Current behavior                                                                                  |
| ----------------------------- | ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/v1/session`         | A                             | `Session`         | Fixed demonstration doctor, mode, date and disclaimer; not an authentication handshake            |
| `GET /api/v1/dashboard`       | A, composing domain summaries | `Dashboard`       | Synthetic workload counts, schedule, patient previews, health alerts and activity                 |
| `GET /api/v1/patients`        | B                             | `Patient[]`       | Scoped search/filter/pagination; page metadata is outside `data`                                  |
| `GET /api/v1/patients/:id`    | B                             | `Patient`         | Scoped synthetic patient detail; an unavailable patient is not disclosed                          |
| `GET /api/v1/encounters`      | C                             | `Encounter[]`     | Synthetic text/video appointment and encounter worklist                                           |
| `GET /api/v1/records`         | D                             | `MedicalRecord[]` | Synthetic record summaries, review state, version and order count                                 |
| `GET /api/v1/consultations`   | C                             | `Consultation[]`  | Synthetic expert-consultation summaries and participants                                          |
| `GET /api/v1/health/overview` | E                             | `HealthOverview`  | Synthetic observations, alerts, plans and summary counts                                          |
| `GET /api/v1/audit`           | A                             | `AuditEvent[]`    | Seeded synthetic events and local demo patient-access events, filtered to the demonstration actor |
| `GET /api/v1/features`        | A                             | `Feature[]`       | Capability descriptions, owner domain, iteration and demo/planned/disabled state                  |
| `GET /api/v1/health`          | A                             | `ServiceHealth`   | API/database availability and demonstration mode                                                  |

`/health` reports service availability; `/health/overview` is the doctor's health-management view. Do not substitute one for the other.

Patient query parameters:

| Parameter  | Type                               | Behavior                                                                                                                        |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `q`        | string, maximum 100 characters     | Case-insensitive matching over name, patient ID, medical-history text and care summary; symptoms may occur in these text fields |
| `status`   | `stable`, `attention`, `follow-up` | Exact patient status filter                                                                                                     |
| `disease`  | string, maximum 100 characters     | Diagnosis text filter                                                                                                           |
| `page`     | integer `1`–`100000`               | One-based page, default `1`                                                                                                     |
| `pageSize` | integer `1`–`100`                  | Page size, default `20`                                                                                                         |

Unknown patient query parameters are rejected with `400 INVALID_REQUEST`. Scope is applied before filtering results, counting and pagination. Patient summaries sort by ID in the framework. Other read collections are small demonstration collections; they are not yet production pagination/search APIs. Admission-date and treatment-stage filters are planned extensions requiring explicit fields and query schemas.

Example request:

```http
GET /api/v1/patients?status=attention&page=1&pageSize=20
Accept: application/json
```

## Response and error envelopes

Success uses the same envelope for single resources, arrays and aggregates:

```json
{
  "data": [],
  "meta": {
    "requestId": "request-correlation-id",
    "mode": "demo",
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

The empty array and count above are illustrative. Pagination metadata appears only where relevant. A caller must read `data`, not assume every API response is a bare array. `requestId` correlates a request with diagnostics. It is not a patient ID, authentication token or idempotency key.

Errors use a stable machine code and a human-readable message:

```json
{
  "error": {
    "code": "FEATURE_NOT_IMPLEMENTED",
    "message": "This feature is planned for a future iteration."
  },
  "meta": {
    "requestId": "request-correlation-id",
    "mode": "demo"
  }
}
```

The message above illustrates the shape; callers branch on `code`, never on translated message text. An unavailable operation must not return `200` or show a saved/sent/success state. The browser should explain the feature's purpose and planned delivery while preserving the user's context.

| HTTP status                          | Convention                                                                                  | Implementation stage                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `200`                                | Successful read                                                                             | Current                                                                 |
| `400`                                | Invalid request/query                                                                       | Current validation boundary; consult route schema for exact constraints |
| `404`                                | Unknown resource/route or resource outside permitted view                                   | Current read boundary; do not expose inaccessible patient details       |
| `501` with `FEATURE_NOT_IMPLEMENTED` | Reserved write or unavailable provider capability                                           | Current                                                                 |
| `503` with `SERVICE_UNAVAILABLE`     | Unexpected server/dependency failure with safe message and request ID                       | Current boundary                                                        |
| `421` with `LOCAL_DEMO_ONLY`         | Non-local Host rejected                                                                     | Current local-only demo boundary                                        |
| `403` with `ORIGIN_NOT_ALLOWED`      | External web Origin rejected                                                                | Current local-only demo boundary                                        |
| `201`                                | Successfully created durable resource                                                       | Planned writes                                                          |
| `202`                                | Accepted durable background job with a status resource                                      | Planned exports/long-running operations                                 |
| `401` / `403`                        | Missing authentication / authenticated but forbidden action                                 | Planned real authentication and command enforcement                     |
| `409`                                | Invalid state transition, business conflict or reused idempotency key with a different body | Planned writes                                                          |
| `412` / `428`                        | Stale version / required write precondition missing                                         | Planned optimistic concurrency                                          |
| `422`                                | Syntactically valid command fails domain validation                                         | Planned clinical writes                                                 |
| `429`                                | Rate limit with appropriate retry guidance                                                  | Planned operational hardening                                           |

Never return stack traces, raw SQL, credentials or patient content in an error. The current `meta.mode` type only allows `demo`. A live mode requires an intentional compatible contract change and replacement of the demo identity/data restrictions; changing a label is not sufficient.

## Unavailable commands and future route design

Iteration 0 registers 39 explicit future command routes with `501 FEATURE_NOT_IMPLEMENTED` handlers. Unknown paths return `404 NOT_FOUND`; there is no catch-all write route. Each domain owns its `commands.ts`, which records method/path, owner, tables, provider dependencies and an optional future handler. The [composition registry](../apps/api/src/platform/planned-commands.ts) combines these entries and supplies the standard placeholder response. Domain owners implement a handler in their own file once its command meets the iteration's acceptance criteria; normal feature work does not require editing the shared registry.

The following resource families define ownership and implementation responsibility. Exact accepted payloads must be added to the owning contract before enabling a command.

| Resource family             | Owner                      | Future operations and related storage                                                                                                 |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/session and grants | A                          | Challenge verification, session creation/revocation, scoped grants; identities, roles, role permissions and access grants             |
| Patients and groups         | B                          | Create/revise profile, retain archive versions, manage groups and authorized batch actions; patient-owned tables                      |
| Encounters                  | C                          | Accept, message, attach, start/finish media, complete and export; encounter, message, attachment and recording tables                 |
| Consultations               | C with A for authorization | Request/invite, participants, materials, report draft/confirm and complete; consultation, participant, report and grant records       |
| Records                     | D                          | Draft/revise, submit, review, archive and correct; record, version and review tables                                                  |
| Orders                      | D                          | Create, revise and stop independently of EMR state; order and order-version tables                                                    |
| Health                      | E                          | Ingest observations, create/revise plans, assess and schedule/cancel reminders; observation, plan/version, assessment and task tables |
| Community                   | E                          | Groups, memberships, manually supplied posts, comments, likes, direct messages, reports and preferences; isolated social tables       |
| Audit/export and features   | A                          | Scoped audit querying/export and authorized configuration; audit, outbox and feature settings                                         |

For new routes, edit the owning `apps/api/src/<domain>/commands.ts` and prefer plural resource names and explicit workflow commands, for example `POST /records/{id}/submit` and `POST /orders/{id}/stop`. These examples illustrate the convention and must agree with the command registry before becoming public APIs. A state-changing operation must never use `GET`. Do not expose raw database table names as the public API merely because they are convenient.

Use `POST` to create resources or invoke a state transition; `PATCH` to revise permitted fields; reserve `DELETE` for resources whose retention policy allows removal. Clinical archive/history normally uses explicit lifecycle states, not destructive deletion. Document an operation's required permission, patient scope, allowed source states, resulting state and audit event.

### Reserved route registry snapshot

All of these routes are placeholders and return `501`; request body schemas and real operations remain future work. The paths include the common prefix.

| Method   | Route                                   | Owner domain |
| -------- | --------------------------------------- | ------------ |
| `POST`   | `/api/v1/identity/challenges`           | `platform`   |
| `POST`   | `/api/v1/identity/verify`               | `platform`   |
| `POST`   | `/api/v1/patients`                      | `patients`   |
| `PATCH`  | `/api/v1/patients/:id`                  | `patients`   |
| `POST`   | `/api/v1/patients/batch`                | `patients`   |
| `POST`   | `/api/v1/encounters`                    | `encounters` |
| `POST`   | `/api/v1/encounters/:id/accept`         | `encounters` |
| `POST`   | `/api/v1/encounters/:id/messages`       | `encounters` |
| `POST`   | `/api/v1/encounters/:id/complete`       | `encounters` |
| `POST`   | `/api/v1/encounters/:id/rtc-room`       | `encounters` |
| `POST`   | `/api/v1/encounters/:id/recordings`     | `encounters` |
| `POST`   | `/api/v1/encounters/:id/export`         | `encounters` |
| `POST`   | `/api/v1/records`                       | `clinical`   |
| `PATCH`  | `/api/v1/records/:id`                   | `clinical`   |
| `POST`   | `/api/v1/records/:id/submit`            | `clinical`   |
| `POST`   | `/api/v1/records/:id/reviews`           | `clinical`   |
| `POST`   | `/api/v1/records/:id/archive`           | `clinical`   |
| `POST`   | `/api/v1/records/:id/orders`            | `clinical`   |
| `PATCH`  | `/api/v1/orders/:id`                    | `clinical`   |
| `POST`   | `/api/v1/orders/:id/stop`               | `clinical`   |
| `POST`   | `/api/v1/consultations`                 | `encounters` |
| `POST`   | `/api/v1/consultations/:id/accept`      | `encounters` |
| `POST`   | `/api/v1/consultations/:id/attachments` | `encounters` |
| `POST`   | `/api/v1/consultations/:id/reports`     | `encounters` |
| `POST`   | `/api/v1/consultations/:id/complete`    | `encounters` |
| `POST`   | `/api/v1/health/observations`           | `health`     |
| `POST`   | `/api/v1/health/plans`                  | `health`     |
| `PATCH`  | `/api/v1/health/plans/:id`              | `health`     |
| `POST`   | `/api/v1/health/assessments`            | `health`     |
| `POST`   | `/api/v1/health/reminders`              | `health`     |
| `POST`   | `/api/v1/integrations/hospital/import`  | `platform`   |
| `PATCH`  | `/api/v1/social/preferences`            | `social`     |
| `POST`   | `/api/v1/social/groups/:id/join`        | `social`     |
| `DELETE` | `/api/v1/social/groups/:id/membership`  | `social`     |
| `POST`   | `/api/v1/social/posts`                  | `social`     |
| `POST`   | `/api/v1/social/posts/:id/comments`     | `social`     |
| `POST`   | `/api/v1/social/posts/:id/likes`        | `social`     |
| `POST`   | `/api/v1/social/messages`               | `social`     |
| `POST`   | `/api/v1/social/reports`                | `social`     |

## DTO rules and module seams

| Contract        | Current key fields                                                                                         | Ownership and interpretation                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Patient`       | ID, demographic summary, diagnosis, tags, status, visits, assigned doctor, allergies/history, care summary | B owns profile data; linked care-plan details belong to E                                                |
| `Encounter`     | ID, patient ID/name, text/video type, status, schedule, reason, duration                                   | C owns the patient encounter; it differs from an expert consultation                                     |
| `MedicalRecord` | ID, patient reference, title/diagnosis, status, author, update time, version, order count                  | D owns record/review state; order count is a summary, not an editable order API                          |
| `Consultation`  | ID, patient reference, title, specialty, status, schedule, participants, summary                           | C owns the expert task and report workflow                                                               |
| `Observation`   | Patient, metric, numeric value, unit, measured/received timestamps, source                                 | E owns monitoring data; current source is strictly `synthetic-demo`                                      |
| `CarePlan`      | Patient, title, state, goals, review date, completion percentage                                           | E owns plan lifecycle; current percentage is a demonstration value                                       |
| `AuditEvent`    | Actor, action, target, time, outcome and description                                                       | A owns audit access and append behavior; seed events and local patient-list/detail accesses are recorded |
| `Feature`       | ID, name, domain, status, description, iteration                                                           | Capability metadata helps the UI present planned functions accurately                                    |

Use opaque string IDs; do not parse meaning from an ID prefix. Keep database `snake_case` inside repositories and public DTO fields in `camelCase`. Return only fields a consumer needs. A future date-only value uses `YYYY-MM-DD`; an event timestamp uses an explicit offset or UTC ISO 8601. Store measured time separately from received time. Display formatting belongs to the UI, and all tests must account for timezone differences.

Current enum values are deliberately small:

- Patient: `stable`, `attention`, `follow-up`.
- Encounter: `waiting`, `scheduled`, `completed`.
- Record: `draft`, `pending-review`, `archived`.
- Expert consultation: `requested`, `scheduled`, `completed`.
- Care plan: `active`, `draft`.
- Capability: `demo`, `planned`, `disabled`.

The fuller lifecycle in the architecture document is a target design. Add its state transitions through contracts and migrations before implementation. Adding an enum value can break exhaustive client switches; review it as a compatibility change even when no field is removed.

## Future write semantics

Every enabled command validates its request at runtime and then checks real actor identity, action permission and patient scope. Temporary-grant access additionally checks scope, revocation, expiry and an active task. Carry the same actor/request context through public service calls; downstream modules do not silently acquire broader privileges.

Versioned edits should require `If-Match` with the resource version. Update the resource only if the expected version still matches. Return `412` for a stale version and enough safe information for the UI to reload; never silently overwrite a teammate's or doctor's saved changes. Agree the exact ETag representation before the first write route is enabled.

Retriable creation and workflow commands should accept an `Idempotency-Key`. Persist actor, operation, key, request digest and result together with the change. A repeat of the same command returns the original result; the same key with a different payload returns `409`. This is particularly important for accepting requests, issuing orders, completing consultation tasks, reminder delivery and exports.

Background work returns `202` only after a durable job is stored. Job state needs queued/running/succeeded/failed or equivalent agreed values, a retry policy, a safe error and a result reference. Recheck data scope before execution and download. File/media access cannot bypass policy simply because the caller knows an object key or received an earlier URL.

## Internal services, events and external adapters

Domain code may import shared contracts and its own implementation. Cross-domain reads go through an exported service/repository interface; cross-domain writes are requested from the owning service. UI modules cannot import API source, and the API cannot import browser modules. Contract files contain no environment access, database handles or framework-specific request objects.

Current adapter names are `IdentityProvider`, `RtcProvider`, `RecordingProvider`, `NotificationProvider`, `ObjectStorageProvider`, `HospitalProvider` and `DeviceProvider`. Their methods are ports with no live implementation in the scaffold. Provider credentials stay in server configuration. Before adding a provider, write a contract test that can run against a fake and the selected adapter. Extend session, media-revocation and observation-provenance contracts as necessary; the initial ports intentionally do not claim full vendor coverage.

The planned event envelope contains `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `aggregateId`, `actorId`, `requestId` and a minimal payload. The producer owns the event schema and writes the outbox entry in the same transaction as business state. Consumers deduplicate `eventId`; delivery is not assumed to be exactly once. Community must never subscribe to clinical events or use them to prefill shared cases.

## Compatibility and independent delivery

Within `/api/v1`, preserve existing field meanings, routes and response envelopes. Add optional fields with documented defaults when older consumers can safely ignore them. Changing a required field, type, state meaning, authorization semantics or removal behavior requires consumer review and a migration strategy. Use `/api/v2` for an incompatible public interface that cannot be migrated additively.

A contract change is ready when the producer and affected consumer owners agree on examples, failure behavior and rollout order. Update typed DTOs, runtime schemas, contract fixtures and relevant tests together. Publish compatible server additions before a client relies on them. Do not treat a passing TypeScript build as proof that a deployed older client remains compatible.

Run `npm run check` for boundary checks, type checking, API tests and builds. Run `npm run test:e2e` with the configured browser environment for integration changes. The initial tests should cover response envelopes, scoped reads, query validation, repeatable database initialization and all reserved write handlers. As features are enabled, add the iteration's real authorization, state transition, conflict, idempotency and provider-failure tests.

See [Architecture](ARCHITECTURE.md) for workflow and data ownership, [Team workflow](TEAM_WORKFLOW.md) for review responsibilities, and [Requirements traceability](REQUIREMENTS_TRACEABILITY.md) for implementation status.
