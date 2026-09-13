# E Health Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, single-column health-management workflow for observations, plans, assessments, and reminders using one SQLite/API source of truth.

**Architecture:** The health module owns its contracts, migrations, fixtures, repository, service, Fastify routes, React query hooks, and page components. Cross-domain patient checks and platform audit/notification behavior are injected as ports; the implementation does not edit patient records or provide a live notification vendor. TanStack Query performs resource-scoped caching and invalidation so writes update only the affected health panel.

**Tech Stack:** TypeScript 5.9, React 19, React Router 7, TanStack Query, Fastify 5, Node 24 built-in SQLite, Vitest, Testing Library, Node test runner, Playwright, Electron.

**Spec:** `docs/superpowers/specs/2026-09-13-e-module-design.md`

## Global Constraints

- Use Node `>=24.14.0 <25`.
- Support Windows and macOS source execution; do not package, sign, publish, or configure auto-update.
- Work only on `codex/e-module-local`; never push, create a remote branch, or create a PR.
- Keep the existing CareLink teal palette and shell; health content uses one main column with 20 to 22 pixel page headings and 13 to 14 pixel body text.
- Do not implement global font scaling, authentication, platform authorization, platform audit storage, patient editing, or a real notification provider.
- Use only synthetic data. Never derive a diagnosis, severity, normal range, or treatment recommendation from a reading.
- Do not modify migrations 1 through 6. Add versioned migrations only.
- Business data lives in SQLite and is returned by the API; React files contain no duplicate health fixtures.
- Every mutation is asynchronous and refreshes only the affected query keys; never call `window.location.reload()`.
- Logs never contain patient names, phone numbers, observation values, free-text assessments, reminder content, credentials, or full request bodies.
- Every user-visible health string exists in both Chinese and English.

---

## File Structure

Create or modify the following focused units:

- `packages/contracts/src/health.ts`: public health read and command DTOs.
- `apps/api/src/health/evolution-migration.ts`: migration 7 for provenance, versions, preferences, and command receipts.
- `apps/api/src/health/fixtures.ts`: idempotent synthetic health fixtures for all eight visible patients.
- `apps/api/src/health/ports.ts`: patient access, notification, and audit seams used by the service.
- `apps/api/src/health/repository.ts`: health-table persistence only.
- `apps/api/src/health/service.ts`: validation-independent health workflows and concurrency/idempotency rules.
- `apps/api/src/health/routes.ts`: Fastify schemas, envelopes, HTTP mapping, and request logs.
- `apps/api/src/health/index.ts`: health public exports.
- `apps/api/src/database/connection.ts`: composition-only registration of migration 7 and health fixtures.
- `apps/api/src/app.ts`: composition-only registration of health routes and injected existing ports.
- `apps/api/test/health.test.ts`: health migration, service, API, privacy, and logging tests.
- `apps/web/src/modules/e-shared/api.ts`: E-owned JSON client and typed `EApiError`.
- `apps/web/src/modules/e-shared/query.tsx`: QueryClient factory and provider.
- `apps/web/src/modules/e-shared/test-utils.tsx`: Vitest render helper.
- `apps/web/src/main.tsx`: one composition line that installs the E query provider.
- `apps/web/src/modules/health/queries.ts`: health query keys and mutations.
- `apps/web/src/modules/health/HealthPage.tsx`: single-column page shell and local tab state.
- `apps/web/src/modules/health/PatientSearch.tsx`: debounced B API patient search and selected summary.
- `apps/web/src/modules/health/ObservationsPanel.tsx`: observation list, filters, trend, and create drawer.
- `apps/web/src/modules/health/PlansPanel.tsx`: plan list, editor, activation, and versions.
- `apps/web/src/modules/health/AssessmentsPanel.tsx`: assessment list and create drawer.
- `apps/web/src/modules/health/RemindersPanel.tsx`: reminder list and create/cancel/retry actions.
- `apps/web/src/modules/health/health.css`: health-only single-column styles and skeleton states.
- `apps/web/src/modules/health/messages.ts`: health bilingual catalog.
- `apps/web/src/modules/health/health.test.tsx`: component cache, loading, mutation, and accessibility tests.
- `tests/e2e/health.spec.ts`: browser workflow with persistent API data and no full navigation.
- `docs/E_MODULE_HANDOFF.md`: exact A/B integration seams, without implementing their modules.

### Task 1: Install and configure the E query and component-test foundation

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/modules/e-shared/api.ts`
- Create: `apps/web/src/modules/e-shared/query.tsx`
- Create: `apps/web/src/modules/e-shared/test-utils.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/modules/e-shared/api.test.ts`

**Interfaces:**
- Produces: `requestEApi<T>(path, options): Promise<ApiResponse<T>>`.
- Produces: `EApiError` with `status`, `code`, `requestId`, and safe `message`.
- Produces: `createEQueryClient(): QueryClient` and `EQueryProvider`.
- Produces: `renderWithEProviders(ui)` for component tests.

- [ ] **Step 1: Add the frontend dependencies**

Run:

```bash
npm install -w @doctor/web @tanstack/react-query
npm install -D -w @doctor/web vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Add `"test": "vitest run"` to `apps/web/package.json`. Expected: `apps/web/package.json` and `package-lock.json` contain the new packages; no other workspace dependency changes.

- [ ] **Step 2: Write the failing API-client tests**

Create tests that stub `fetch` and assert successful envelope parsing plus safe error parsing:

```ts
it('throws a typed API error without losing the request id', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: { code: 'STALE_VERSION', message: '计划已被修改。' },
    meta: { requestId: 'req-1', mode: 'demo' },
  }), { status: 412, headers: { 'content-type': 'application/json' } })));

  await expect(requestEApi('/health/plans/PLAN-001')).rejects.toMatchObject({
    status: 412,
    code: 'STALE_VERSION',
    requestId: 'req-1',
  });
});
```

- [ ] **Step 3: Run the focused test and confirm the red state**

Run: `npm test -w @doctor/web -- src/modules/e-shared/api.test.ts`

Expected: FAIL because `requestEApi` and `EApiError` do not exist.

- [ ] **Step 4: Implement the minimal client and query provider**

Use this public shape:

```ts
export interface ERequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function requestEApi<T>(path: string, options: ERequestOptions = {}) {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw EApiError.fromResponse(response.status, payload);
  return payload as ApiResponse<T>;
}
```

Configure the E query client with `staleTime: 30_000`, `gcTime: 10 * 60_000`, one retry for reads, zero automatic retries for mutations, and `refetchOnWindowFocus: true`. Wrap the existing router with `EQueryProvider`; do not change the shell or navigation.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -w @doctor/web -- src/modules/e-shared/api.test.ts`

Expected: PASS.

Run: `npm run typecheck -w @doctor/web`

Expected: PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add apps/web/package.json package-lock.json apps/web/vitest.config.ts apps/web/src/test apps/web/src/modules/e-shared apps/web/src/main.tsx
git commit -m "feat(web): add E module query foundation"
```

### Task 2: Extend health contracts and append migration 7

**Files:**
- Modify: `packages/contracts/src/health.ts`
- Create: `apps/api/src/health/evolution-migration.ts`
- Create: `apps/api/src/health/fixtures.ts`
- Modify: `apps/api/src/health/index.ts`
- Modify: `apps/api/src/database/connection.ts`
- Modify: `apps/api/test/api.test.ts`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Produces: `HealthMetric`, `ObservationSource`, `ObservationQuery`, `Paginated<T>`, `ObservationList`, `CreateObservationInput`.
- Produces: `CarePlanDetail`, `CarePlanVersion`, `CreateCarePlanInput`, `UpdateCarePlanInput`.
- Produces: `HealthAssessment`, `CreateAssessmentInput`, `ReminderTask`, `CreateReminderInput`.
- Produces: `healthEvolutionMigration` with version `7`.
- Produces: `seedHealthDemo(db: DatabaseSync): void`.

- [ ] **Step 1: Write migration and fixture tests first**

Add assertions that a fresh database has migration 7, `PRAGMA foreign_key_check` is empty, observation sources accept `manual-entry`, every visible patient has an observation or plan, and fixture calls are idempotent:

```ts
test('health migration 7 and fixtures are additive and idempotent', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations WHERE version=7').get()!.count, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT COUNT(DISTINCT patient_id) count FROM health_observations').get()!.count, 8);
    const before = db.prepare('SELECT COUNT(*) count FROM health_observations').get()!.count;
    seedHealthDemo(db);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM health_observations').get()!.count, before);
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run the API test and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/health.test.ts`

Expected: FAIL because migration 7 and `seedHealthDemo` do not exist.

- [ ] **Step 3: Add exact public contract fields**

Define command metadata in JSON bodies so current Windows/macOS Electron transport can carry it without changing A's header allowlist:

```ts
export interface CommandInput {
  commandId: string;
}

export interface VersionedCommandInput extends CommandInput {
  expectedVersion: number;
}

export type ObservationSource = 'synthetic-demo' | 'manual-entry' | 'device-simulator';

export type HealthMetric = 'systolic' | 'diastolic' | 'glucose' | 'heart-rate';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ObservationQuery {
  patientId: string;
  metric?: HealthMetric;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateObservationInput extends CommandInput {
  patientId: string;
  metric: HealthMetric;
  value: number;
  unit: string;
  measuredAt: string;
  source: 'manual-entry' | 'device-simulator';
  sourceLabel: string;
  externalObservationId?: string;
}

export type ObservationList = Paginated<Observation>;

export interface CarePlanDetail {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  status: 'draft' | 'active';
  goals: string[];
  nextReview: string;
  completionPercent: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlanVersion {
  id: string;
  planId: string;
  version: number;
  snapshot: Omit<CarePlanDetail, 'patientName'>;
  authoredBy: string;
  createdAt: string;
}

export interface CreateCarePlanInput extends CommandInput {
  patientId: string;
  title: string;
  goals: string[];
  nextReview: string;
}

export interface UpdateCarePlanInput extends VersionedCommandInput {
  title: string;
  status: 'draft' | 'active';
  goals: string[];
  nextReview: string;
  completionPercent: number;
}

export interface HealthAssessment {
  id: string;
  patientId: string;
  planId?: string;
  assessorId: string;
  assessedAt: string;
  summary: string;
  recommendations: string[];
  nextReview?: string;
}

export interface CreateAssessmentInput extends CommandInput {
  patientId: string;
  planId?: string;
  assessedAt: string;
  summary: string;
  recommendations: string[];
  nextReview?: string;
}

export interface ReminderTask {
  id: string;
  patientId: string;
  planId?: string;
  channel: 'in-app' | 'sms' | 'email';
  templateId: string;
  scheduledAt: string;
  status: 'planned' | 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  lastError?: string;
}

export interface CreateReminderInput extends CommandInput {
  patientId: string;
  planId?: string;
  channel: ReminderTask['channel'];
  templateId: string;
  scheduledAt: string;
  consentReference?: string;
}
```

Use `version`, `createdAt`, and `updatedAt` on care plans. Use stable machine states for reminders: `planned | pending | sent | failed | cancelled`.

- [ ] **Step 4: Implement migration 7 without editing migration 5**

Migration 7 must rebuild `health_observations` with the expanded source check, preserve existing rows, recreate its index, add `current_version`, `created_at`, and `updated_at` to plans, and create:

```sql
CREATE TABLE health_command_receipts (
  actor_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, command_id)
);

CREATE TABLE health_notification_preferences (
  patient_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 5: Add rich idempotent fixtures**

Generate deterministic fixture IDs and fixed timestamps. Seed approximately 30 days of readings for all eight visible patients, 8 to 12 plans, 12 to 20 assessments, 20 or more reminders, and version 1 for every plan. Insert with `INSERT OR IGNORE`; do not add patients or change patient data.

- [ ] **Step 6: Register the migration and fixtures at the composition boundary**

Append `healthEvolutionMigration` after migration 6 in `migrations`, and call `seedHealthDemo(database)` after the existing `seedDemo(database)`. These are the only changes in `database/connection.ts`. Update both exact migration-count assertions in `apps/api/test/api.test.ts` from 6 to 7; the social plan will advance them to 8.

- [ ] **Step 7: Run tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/health.test.ts`

Expected: PASS.

Run: `npm run typecheck -w @doctor/contracts`

Expected: PASS.

Run: `npm run typecheck -w @doctor/api`

Expected: PASS.

```bash
git add packages/contracts/src/health.ts apps/api/src/health apps/api/src/database/connection.ts apps/api/test/health.test.ts
git commit -m "feat(health): add write contracts and migration"
```

### Task 3: Implement the health repository, service, ports, and structured operation events

**Files:**
- Create: `apps/api/src/health/ports.ts`
- Modify: `apps/api/src/health/repository.ts`
- Create: `apps/api/src/health/service.ts`
- Modify: `apps/api/src/health/index.ts`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: `PatientAccessPort.canReadPatient(patientId, context)` from platform.
- Produces: `HealthAuditEvent` and `HealthAuditPort.record(event): void | Promise<void>`.
- Produces: `HealthNotificationPort.send(input): Promise<{ providerMessageId: string }>` as an optional dependency.
- Produces: `PatientSummaryPort.find(patientId, context): { id: string; name: string } | undefined` as an adapter over B's public repository.
- Produces: `HealthService` methods `overview`, `listObservations`, `createObservation`, `listPlans`, `createPlan`, `updatePlan`, `listPlanVersions`, `listAssessments`, `createAssessment`, `listReminders`, `createReminder`, `cancelReminder`, `retryReminder`.

- [ ] **Step 1: Write failing service tests for scope, idempotency, and version conflicts**

Use a recording audit fake and the existing `SqlitePatientAccess`. Assert:

```ts
const created = service.createPlan({
  commandId: 'cmd-plan-1', patientId: 'PAT-001', title: '家庭血压随访',
  goals: ['每日记录'], nextReview: '2026-09-20',
}, context);
assert.equal(service.createPlan(sameInput, context).id, created.id);
assert.throws(() => service.createPlan({ ...sameInput, title: '不同内容' }, context), CommandConflict);
assert.throws(() => service.updatePlan(created.id, {
  commandId: 'cmd-plan-2', expectedVersion: 99, title: '修订', goals: ['复核'],
  nextReview: '2026-09-21', status: 'active', completionPercent: 10,
}, context), StaleVersion);
```

Also assert unauthorized patients return the same not-found result as unknown patients and audit events contain action/resource/result but no free text.

- [ ] **Step 2: Run focused tests and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/health.test.ts`

Expected: FAIL because the service and ports do not exist.

- [ ] **Step 3: Implement repository transactions and mapping**

The repository must access health tables only. Replace direct `JOIN patients` name lookups with patient IDs; the service enriches dashboard-compatible summaries through `PatientSummaryPort`, while the health page obtains the full patient summary from B's API. Define the internal receipt type as `{ actorId, commandId, operation, requestDigest, resourceId, responseJson, createdAt }` and provide transaction-backed command receipt helpers:

```ts
export interface HealthRepository {
  transaction<T>(work: () => T): T;
  findReceipt(actorId: string, commandId: string): CommandReceipt | undefined;
  saveReceipt(receipt: CommandReceipt): void;
  overview(context: RequestContext, patientId?: string): HealthOverview;
  listObservations(query: ObservationQuery, context: RequestContext): Paginated<Observation>;
  createObservation(record: Observation): void;
  listPlans(patientId: string, context: RequestContext): CarePlanDetail[];
  findPlan(id: string, context: RequestContext): CarePlanDetail | undefined;
  createPlan(plan: CarePlanDetail, version: CarePlanVersion): void;
  updatePlan(plan: CarePlanDetail, version: CarePlanVersion): boolean;
  listPlanVersions(planId: string, context: RequestContext): CarePlanVersion[];
  listAssessments(patientId: string, context: RequestContext): HealthAssessment[];
  createAssessment(assessment: HealthAssessment): void;
  listReminders(patientId: string, context: RequestContext): ReminderTask[];
  findReminder(id: string, context: RequestContext): ReminderTask | undefined;
  createReminder(reminder: ReminderTask): void;
  updateReminder(reminder: ReminderTask): void;
}
```

The concrete mapper converts SQLite `snake_case` fields to these public `camelCase` DTOs and never queries a patient table.

- [ ] **Step 4: Implement service rules**

Define `HealthAuditEvent` as `{ actorId, action, resourceType, resourceId, outcome, occurredAt }`. Hash stable JSON input with SHA-256 for receipt comparison. Within one transaction, verify access, replay identical commands, reject a reused command ID with a different digest, persist the resource and receipt, then emit a minimal audit event after commit. Use `expectedVersion` in the update statement so stale writes change zero rows.

Expose these exact service signatures:

```ts
export interface HealthService {
  overview(context: RequestContext, patientId?: string): HealthOverview;
  listObservations(query: ObservationQuery, context: RequestContext): Paginated<Observation>;
  createObservation(input: CreateObservationInput, context: RequestContext): Observation;
  listPlans(patientId: string, context: RequestContext): CarePlanDetail[];
  createPlan(input: CreateCarePlanInput, context: RequestContext): CarePlanDetail;
  updatePlan(id: string, input: UpdateCarePlanInput, context: RequestContext): CarePlanDetail;
  listPlanVersions(id: string, context: RequestContext): CarePlanVersion[];
  listAssessments(patientId: string, context: RequestContext): HealthAssessment[];
  createAssessment(input: CreateAssessmentInput, context: RequestContext): HealthAssessment;
  listReminders(patientId: string, context: RequestContext): ReminderTask[];
  createReminder(input: CreateReminderInput, context: RequestContext): ReminderTask;
  cancelReminder(id: string, commandId: string, context: RequestContext): ReminderTask;
  retryReminder(id: string, commandId: string, context: RequestContext): ReminderTask;
}
```

Reminder creation stores `planned` when the notification port is absent. Retry changes a failed task to `pending` before calling the port, increments attempts once, then stores `sent` or `failed`; repeated `commandId` returns the recorded result.

- [ ] **Step 5: Run tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/health.test.ts`

Expected: PASS.

```bash
git add apps/api/src/health apps/api/test/health.test.ts
git commit -m "feat(health): implement persistent health services"
```

### Task 4: Register validated Fastify health routes

**Files:**
- Create: `apps/api/src/health/routes.ts`
- Modify: `apps/api/src/health/commands.ts`
- Modify: `apps/api/src/health/index.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: `HealthService` from Task 3.
- Produces: `registerHealthRoutes(app, service): void`.
- Produces: existing `/api/v1` envelope and codes `INVALID_REQUEST`, `HEALTH_RESOURCE_NOT_FOUND`, `COMMAND_CONFLICT`, `STALE_VERSION`, `NOTIFICATION_UNAVAILABLE`.

- [ ] **Step 1: Write failing API tests**

Test a create and reload sequence, invalid units, literal patient IDs, stale plan revision, identical command replay, different-payload command conflict, reminder cancellation, and safe logging. Example:

```ts
const create = await app.inject({
  method: 'POST', url: '/api/v1/health/observations',
  payload: { commandId: 'cmd-obs-1', patientId: 'PAT-001', metric: 'systolic',
    value: 132, unit: 'mmHg', measuredAt: '2026-09-13T08:00:00+08:00',
    source: 'manual-entry', sourceLabel: '医生手工录入' },
});
assert.equal(create.statusCode, 201);
const list = await app.inject('/api/v1/health/observations?patientId=PAT-001&metric=systolic');
assert.ok(list.json().data.items.some((item: { id: string }) => item.id === create.json().data.id));
```

- [ ] **Step 2: Run focused API tests and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/health.test.ts`

Expected: FAIL with current `501 FEATURE_NOT_IMPLEMENTED` or missing GET routes.

- [ ] **Step 3: Implement route schemas and error mapping**

Every query uses `additionalProperties: false`, bounded strings, page `1..100000`, page size `1..100`, ISO date-time patterns, and metric-specific unit pairs:

```ts
const metricUnits = {
  systolic: ['mmHg'], diastolic: ['mmHg'], glucose: ['mmol/L'], 'heart-rate': ['bpm'],
} as const;
```

Register health routes from `app.ts`, remove implemented health commands from the 501-only command array, and remove the old inline overview registration to prevent duplicate routes. Keep `app.ts` changes limited to composition.

- [ ] **Step 4: Emit safe structured request logs**

Use `request.log.info({ requestId, domain: 'health', action, actorId, resourceType, resourceId, outcome, durationMs }, 'health operation')`. Do not spread request bodies or returned resources into log objects.

- [ ] **Step 5: Run API tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/health.test.ts`

Expected: PASS.

Run: `npm test -w @doctor/api`

Expected: all API tests PASS after updating the former 501 command expectation to cover only still-reserved commands.

```bash
git add apps/api/src/health apps/api/src/app.ts apps/api/test
git commit -m "feat(api): expose health management routes"
```

### Task 5: Build patient search and observation workflow as a single-column page

**Files:**
- Create: `apps/web/src/modules/health/HealthPage.tsx`
- Create: `apps/web/src/modules/health/PatientSearch.tsx`
- Create: `apps/web/src/modules/health/ObservationsPanel.tsx`
- Create: `apps/web/src/modules/health/queries.ts`
- Create: `apps/web/src/modules/health/health.css`
- Modify: `apps/web/src/modules/health/index.tsx`
- Modify: `apps/web/src/modules/health/messages.ts`
- Test: `apps/web/src/modules/health/health.test.tsx`

**Interfaces:**
- Consumes: `requestEApi` and `EQueryProvider` from Task 1.
- Consumes: B's existing `GET /patients?q=...` API and public `Patient` DTO.
- Produces: `healthKeys`, `useHealthOverview`, `useObservations`, `useCreateObservation`.
- Produces: `HealthPage`, `PatientSearch`, `ObservationsPanel`.

- [ ] **Step 1: Write failing component tests**

Mock fetch responses, render with `renderWithEProviders`, and assert the patient query fires only after a 250 ms debounce, selection renders B's patient fields, observation creation keeps the shell mounted, and background refresh preserves current rows:

```ts
expect(screen.getByRole('heading', { name: '健康管理' })).toBeInTheDocument();
await user.type(screen.getByRole('searchbox', { name: '搜索健康管理患者' }), '陈建国');
await vi.advanceTimersByTimeAsync(249);
expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('q='), expect.anything());
await vi.advanceTimersByTimeAsync(1);
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/patients?q='), expect.anything());
```

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm test -w @doctor/web -- src/modules/health/health.test.tsx`

Expected: FAIL because the new components and hooks do not exist.

- [ ] **Step 3: Implement query keys and hooks**

Use exact keys:

```ts
export const healthKeys = {
  all: ['health'] as const,
  overview: (patientId: string) => ['health', 'overview', patientId] as const,
  observations: (patientId: string, filters: ObservationFilters) =>
    ['health', 'observations', patientId, filters] as const,
  plans: (patientId: string) => ['health', 'plans', patientId] as const,
  assessments: (patientId: string) => ['health', 'assessments', patientId] as const,
  reminders: (patientId: string) => ['health', 'reminders', patientId] as const,
};
```

On observation creation invalidate only the selected patient's overview and observation keys. Keep previous query data during filter changes.

- [ ] **Step 4: Implement the single-column UI**

Use one `<section className="health-workspace">`. The patient search appears before the four page tabs. The active panel fills the available width. Replace the current metric-card grid, English eyebrow, select control, and two `feature-columns` layouts. Provide a structural skeleton matching the search row, patient summary, tabs, filters, and table.

The create observation drawer validates locally, preserves entered values on API failure, submits a UUID `commandId`, and labels saved data as manual entry. Use existing Lucide icons only.

- [ ] **Step 5: Run component tests and typecheck**

Run: `npm test -w @doctor/web -- src/modules/health/health.test.tsx`

Expected: PASS.

Run: `npm run typecheck -w @doctor/web`

Expected: PASS.

- [ ] **Step 6: Commit the observation UI**

```bash
git add apps/web/src/modules/health
git commit -m "feat(web): add health patient and observation workflow"
```

### Task 6: Add plan, assessment, and reminder panels with scoped mutations

**Files:**
- Create: `apps/web/src/modules/health/PlansPanel.tsx`
- Create: `apps/web/src/modules/health/AssessmentsPanel.tsx`
- Create: `apps/web/src/modules/health/RemindersPanel.tsx`
- Modify: `apps/web/src/modules/health/queries.ts`
- Modify: `apps/web/src/modules/health/HealthPage.tsx`
- Modify: `apps/web/src/modules/health/health.css`
- Modify: `apps/web/src/modules/health/messages.ts`
- Test: `apps/web/src/modules/health/health.test.tsx`

**Interfaces:**
- Consumes: Task 4 health endpoints and Task 5 query keys.
- Produces: `usePlans`, `useCreatePlan`, `useUpdatePlan`, `useAssessments`, `useCreateAssessment`, `useReminders`, `useCreateReminder`, `useCancelReminder`, `useRetryReminder`.

- [ ] **Step 1: Write failing panel tests**

Assert creating a plan refreshes only `plans` and `overview`, stale versions keep the editor open and offer reload, assessment text remains after failure, and a reminder without a provider displays “已保存，尚未发送”. Spy on `window.location.reload` and assert it is never called.

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `npm test -w @doctor/web -- src/modules/health/health.test.tsx`

Expected: FAIL because the three panels and mutations are absent.

- [ ] **Step 3: Implement plan and assessment hooks and panels**

Plan updates send a new UUID `commandId` and the current `expectedVersion`. On `STALE_VERSION`, invalidate `healthKeys.plans(patientId)` and show an inline conflict box; do not close the editor automatically. Assessment creation invalidates only assessments, plans when a revision was requested, and overview.

- [ ] **Step 4: Implement reminder hooks and panel**

Display `planned`, `pending`, `sent`, `failed`, and `cancelled` with translated neutral labels. Do not show a success toast for delivery unless the API state is `sent`. Cancel and retry buttons update only the reminder list and overview.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w @doctor/web -- src/modules/health/health.test.tsx`

Expected: PASS.

```bash
git add apps/web/src/modules/health
git commit -m "feat(web): complete health management panels"
```

### Task 7: Verify persistence, local refresh behavior, cross-platform source safety, and handoff seams

**Files:**
- Create: `tests/e2e/health.spec.ts`
- Create: `docs/E_MODULE_HANDOFF.md`
- Modify: `apps/api/test/api.test.ts`
- Modify: `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: completed health vertical slice.
- Produces: documented `PatientAccessPort`, `PatientSummary` API dependency, `NotificationProvider`, `HealthAuditPort`, and A desktop header handoff.

- [ ] **Step 1: Write the failing browser test**

The test selects `PAT-001`, creates an observation and plan, changes tabs, returns, and verifies the saved data without a document navigation:

```ts
const navigationCount = await page.evaluate(() => performance.getEntriesByType('navigation').length);
await page.getByRole('button', { name: '保存观测记录' }).click();
await expect(page.getByText('医生手工录入')).toBeVisible();
expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navigationCount);
```

- [ ] **Step 2: Run the browser test and confirm any remaining red state**

Run: `npm run build`

Expected: PASS.

Run: `npm run test:e2e -- health.spec.ts`

Expected before final fixes: at least one assertion fails if persistence, invalidation, or focus handling is incomplete.

- [ ] **Step 3: Fix only the observed integration gaps**

Keep fixes inside E files except the documented composition lines in `app.ts`, `main.tsx`, and `database/connection.ts`. Record in `E_MODULE_HANDOFF.md` that A must later forward standard `If-Match` and `Idempotency-Key` headers and attach the real audit/notification providers; B continues to own patient search and patient summaries.

- [ ] **Step 4: Run the complete health verification**

Run: `npm test -w @doctor/web`

Expected: PASS.

Run: `npm test -w @doctor/api`

Expected: PASS.

Run: `npm run test:e2e -- health.spec.ts`

Expected: PASS.

Run: `npm run check`

Expected: boundary checks, all workspace typechecks, API/desktop tests, and Web/API/Desktop builds PASS on macOS without packaging.

- [ ] **Step 5: Inspect platform independence**

Search E source for hard-coded `/Users/`, backslash-only paths, shell commands, `process.platform` branches, and browser-only persistence of business records. Expected: no matches requiring Windows-specific or macOS-specific behavior.

- [ ] **Step 6: Commit the verified health slice**

```bash
git add tests/e2e/health.spec.ts docs/E_MODULE_HANDOFF.md apps/api/test apps/web/src/modules/health
git commit -m "test(health): verify local health management workflow"
```
