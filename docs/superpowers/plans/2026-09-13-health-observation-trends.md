# Health Observation Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally cached `记录列表 / 趋势图` view with complete numeric summaries and age-matched, source-labelled reference bands.

**Architecture:** A pure trend calculator and configurable `ReferenceRangeProvider` sit behind a new health service query. The API returns bounded series, statistics, and reference metadata; React renders three compact charts without deriving a second source of business truth.

**Tech Stack:** TypeScript 5.9, Fastify 5, SQLite, React 19, TanStack Query 5, Vitest, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-13-e-rich-content-and-health-trends-design.md`

## Global Constraints

- Only E-owned health contracts, services, routes, UI, CSS, translations, fixtures, and tests may change.
- Initial reference ranges are configurable synthetic demonstration data and must show source, version, update time, and “演示参考范围，仅供随访查看”.
- Never diagnose, grade severity, recommend medication, or infer treatment.
- Keep the existing CareLink palette and compact typography; do not implement global font scaling.
- Use local API/SQLite data and partial query refresh; do not add a second frontend dataset or call `window.location.reload()`.
- Source must remain compatible with Windows and macOS; do not package.
- Do not commit or push any change.

---

### Task 1: Trend and reference-range contracts

**Files:**

- Modify: `packages/contracts/src/health.ts`
- Modify: `apps/api/test/health.test.ts`

**Interfaces:**

- Produces: `ObservationTrendQuery`, `ObservationTrendPoint`, `ObservationTrendStats`, `ObservationTrendSeries`, `ReferenceRange`, `ObservationTrendResponse`
- Consumes: existing `HealthMetric`, `Observation`, and `HealthPatientSummary`

- [ ] **Step 1: Write failing contract-facing API assertions**

Add a health route test that requests:

```ts
GET /api/v1/health/observation-trends?patientId=PAT-002&from=2026-08-01T00:00:00Z&to=2026-09-13T23:59:59Z
```

Assert that the response has `series`, each series has `points` and `stats`, and `referenceRange` contains `sourceName`, `version`, `updatedAt`, `ageMin`, `ageMax`, `lower`, `upper`, `unit`, and `level: 'demo'`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test -w @doctor/api -- --test-name-pattern="observation trends"`

Expected: FAIL because the route and contracts do not exist.

- [ ] **Step 3: Add exact public types**

Add these shapes to `packages/contracts/src/health.ts`:

```ts
export interface ObservationTrendQuery {
  patientId: string;
  metric?: HealthMetric;
  from?: string;
  to?: string;
}

export interface ObservationTrendPoint {
  id: string;
  value: number;
  measuredAt: string;
  receivedAt: string;
  sourceLabel: string;
}

export interface ObservationTrendStats {
  latest: number;
  average: number;
  minimum: number;
  maximum: number;
  change: number;
  count: number;
}

export interface ReferenceRange {
  metric: HealthMetric;
  lower: number;
  upper: number;
  unit: string;
  ageMin: number;
  ageMax: number;
  sourceName: string;
  version: string;
  updatedAt: string;
  level: 'demo' | 'clinical-configured';
}

export interface ObservationTrendSeries {
  metric: HealthMetric;
  unit: string;
  points: ObservationTrendPoint[];
  stats?: ObservationTrendStats;
  referenceRange?: ReferenceRange;
}

export interface ObservationTrendResponse {
  patientId: string;
  patientAge: number;
  from?: string;
  to?: string;
  series: ObservationTrendSeries[];
}
```

- [ ] **Step 4: Run contracts and API type checks**

Run: `npm run typecheck -w @doctor/contracts && npm run typecheck -w @doctor/api`

Expected: contracts pass; API still lacks the route implementation referenced by the failing test.

### Task 2: Pure trend calculation and configurable reference rules

**Files:**

- Create: `apps/api/src/health/trends.ts`
- Create: `apps/api/src/health/reference-ranges.ts`
- Modify: `apps/api/src/health/ports.ts`
- Modify: `apps/api/test/health.test.ts`

**Interfaces:**

- Produces: `calculateTrendSeries(observations, referenceRange, maxPoints): ObservationTrendSeries`
- Produces: `ReferenceRangeProvider.find(metric, age, measuredAt): ReferenceRange | undefined`
- Produces: `ConfiguredReferenceRangeProvider`

- [ ] **Step 1: Add failing unit tests for statistics and sampling**

Cover sorted input, unsorted input, stable rounding, one point, no points, a series over 120 points, and preservation of first, last, minimum, and maximum. For `[120, 126, 118]`, assert `latest=118`, `average=121.33`, `minimum=118`, `maximum=126`, `change=-2`, and `count=3`.

- [ ] **Step 2: Add failing tests for age rule selection**

Create rules whose boundaries include ages 64/65 and assert that the exact matching interval is returned. Assert that unknown metric/unit combinations return `undefined` rather than a neighbouring rule.

- [ ] **Step 3: Run focused calculation tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="trend calculator|reference range"`

Expected: FAIL because the calculator and provider are missing.

- [ ] **Step 4: Implement the provider port and synthetic rules**

Define:

```ts
export interface ReferenceRangeProvider {
  find(metric: HealthMetric, age: number, measuredAt: string): ReferenceRange | undefined;
}
```

Keep rules as injected immutable configuration. Every rule must carry a source name, version, ISO update time, unit, age bounds, and `level: 'demo'`. The configuration may contain realistic-looking synthetic values, but the UI label must prevent them from being presented as clinical guidance.

- [ ] **Step 5: Implement deterministic calculation and bounded sampling**

Sort by `measuredAt`, calculate statistics from all matching observations, then reduce chart points to at most 120 using time buckets that preserve the first, last, bucket minimum, and bucket maximum. Round display statistics to at most two decimal places without mutating source values.

- [ ] **Step 6: Run focused tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="trend calculator|reference range"`

Expected: PASS.

### Task 3: Repository, service, and trend endpoint

**Files:**

- Modify: `apps/api/src/health/repository.ts`
- Modify: `apps/api/src/health/service.ts`
- Modify: `apps/api/src/health/routes.ts`
- Modify: `apps/api/src/health/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/health.test.ts`
- Modify: `apps/api/test/api.test.ts`

**Interfaces:**

- Consumes: `ReferenceRangeProvider`, `calculateTrendSeries`, and `PatientSummaryPort.find`
- Produces: `HealthRepository.listObservationsForTrend(query): Observation[]`
- Produces: `HealthService.observationTrends(query, context): ObservationTrendResponse`

- [ ] **Step 1: Write failing service tests**

Assert access checks run before repository reads, patient age comes from `PatientSummaryPort`, metric/date filters are honored, all four metric series are returned when no metric is supplied, and a missing reference range does not fail the response.

- [ ] **Step 2: Write failing route validation tests**

Cover missing patient ID, unsupported metric, invalid RFC3339 values, `from > to`, and a successful envelope response.

- [ ] **Step 3: Run focused tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="observation trends"`

Expected: FAIL on missing repository/service/route behavior.

- [ ] **Step 4: Implement the repository query**

Select all authorized observations for one patient and optional metric/date bounds ordered by `measured_at ASC, id ASC`. Do not apply table pagination to this method.

- [ ] **Step 5: Implement the service method**

Require patient access, obtain `HealthPatientSummary.age`, group observations by metric, call the provider for each series using the latest measurement time, and return stats calculated from the complete filtered set.

- [ ] **Step 6: Register the endpoint and validation**

Add `GET /api/v1/health/observation-trends` with the same patient, metric, and RFC3339 rules as the observation list. Inject the configured demo provider through `health/index.ts` or the composition root.

- [ ] **Step 7: Run health and API tests**

Run: `npm run test -w @doctor/api`

Expected: all API tests pass.

### Task 4: Query hook and trend UI

**Files:**

- Modify: `apps/web/src/modules/health/queries.ts`
- Create: `apps/web/src/modules/health/ObservationTrendPanel.tsx`
- Modify: `apps/web/src/modules/health/ObservationsPanel.tsx`
- Modify: `apps/web/src/modules/health/health.css`
- Modify: `apps/web/src/modules/health/messages.ts`
- Modify: `apps/web/src/modules/health/health.test.tsx`

**Interfaces:**

- Produces: `healthKeys.observationTrends(patientId, filters)` and `useObservationTrends`
- Produces: `ObservationTrendPanel({ response })`
- Consumes: `ObservationTrendResponse`

- [ ] **Step 1: Write failing UI tests**

Assert the default view is `记录列表`; switching to `趋势图` preserves filters; all-metrics renders blood pressure, glucose, and heart-rate sections; single metric renders one section; numeric labels include latest, reference range, count, average, lowest, highest, and change; missing range shows `暂无适用参考范围`.

- [ ] **Step 2: Add chart accessibility tests**

Assert each SVG has an accessible name, every visible point has a keyboard-focusable equivalent button or list item with value/time/source text, and range/out-of-range meaning is not color-only.

- [ ] **Step 3: Run focused web tests**

Run: `npm run test -w @doctor/web -- health.test.tsx`

Expected: FAIL because the trend view is missing.

- [ ] **Step 4: Add the cached query**

Build the URL from patient ID, optional metric, and ISO date bounds. Use a key containing all filters, `placeholderData: keepPreviousData`, and enable only when a patient exists and trend view is active.

- [ ] **Step 5: Implement the segmented view**

Replace the existing tiny single-series preview with a compact `记录列表 / 趋势图` switch. Keep current filters and add no full-page navigation or refresh.

- [ ] **Step 6: Implement the charts and numeric summaries**

Render vertically stacked panels. Blood pressure shares one SVG with two labelled lines; glucose and heart rate use one line each. Draw the reference band only when the provider returns a unit-compatible range. Show source/version/update copy below each chart.

- [ ] **Step 7: Add loading, empty, and error states**

Keep the current patient and filters visible. Only the trend region changes to skeleton, empty text, or retry action.

- [ ] **Step 8: Run web tests and type checks**

Run: `npm run test -w @doctor/web -- health.test.tsx && npm run typecheck -w @doctor/web`

Expected: PASS.

### Task 5: Slice verification

**Files:**

- Modify only if verification exposes a health-trend defect.

**Interfaces:**

- Consumes: the complete health trend slice.
- Produces: recorded verification evidence in terminal output; no commit.

- [ ] **Step 1: Run boundary, API, web, desktop, type, and build checks**

Run: `npm run check`

Expected: all checks pass.

- [ ] **Step 2: Inspect the desktop flow locally**

Open a synthetic patient, switch between record and trend views, change date and metric filters, inspect a 72-year-old patient reference source, and verify one no-range state without reloading the page.

- [ ] **Step 3: Preserve local-only state**

Run: `git status --short` and verify no commit, push, package output, or non-E module file was added.
