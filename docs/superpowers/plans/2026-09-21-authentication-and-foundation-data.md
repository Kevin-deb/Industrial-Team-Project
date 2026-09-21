# Authentication and Foundation Data Implementation Plan

> **Execution:** inline with `superpowers:executing-plans`; every production change follows RED → GREEN.

**Goal:** Replace the fixed demo actor with database-backed password, Email challenge and demo photo verification sessions; seed five verified clinicians and ten scoped patients; protect all business routes and preserve B/E boundaries.

**Spec:** `docs/superpowers/specs/2026-09-21-authentication-and-foundation-data-design.md`

**Architecture:** Add an authentication migration and repository/service under the platform domain. Fastify request hooks resolve an opaque bearer session into request-local auth context. Existing domain route factories consume request-local context without accepting actor IDs. The renderer owns an AuthProvider and a three-step bilingual login flow. Desktop private-protocol forwarding permits only the Authorization header and rebuilds realtime subscription ownership from the authenticated session.

**Tech Stack:** TypeScript, Fastify 5, Node 24 `node:sqlite` and `crypto.scrypt`, React 19, React Router 7, Vitest, Node test runner, Playwright/Electron.

---

## Global constraints

- Never store or log plaintext passwords, Email codes or session tokens.
- Demo photo verification must never claim face matching or liveness detection.
- The caller can never select `actorId`; every business actor comes from a validated session.
- Unauthorized patient search/detail reveals no patient existence.
- Preserve existing domain ownership and do not import clinical data into community.
- Migrations are append-only and seed operations are idempotent.

## Task 1: Authentication schema, password and challenge service

**Files:**
- Create: `apps/api/src/platform/auth-migration.ts`
- Create: `apps/api/src/platform/auth.ts`
- Modify: `apps/api/src/database/connection.ts`
- Modify: `apps/api/src/platform/index.ts`
- Test: `apps/api/test/auth.test.ts`

**RED:** Add tests proving password hashes differ from plaintext, invalid credentials fail uniformly, Email codes are single-use/expiring, photo-check is required before session issuance, and stored token/code values are hashes.

**GREEN:** Implement migration, `scrypt` helpers, repository and service with injectable code delivery/outbox and clock/random sources.

**Verify:** `npx tsx --test apps/api/test/auth.test.ts`

**Commit:** `feat(auth): add secure local authentication service`

## Task 2: Five-doctor/ten-patient foundation seed and scoped access

**Files:**
- Modify: `apps/api/src/database/seed.ts`
- Modify: `apps/api/src/platform/migration.ts` only through a new migration if required
- Test: `apps/api/test/foundation-seed.test.ts`
- Test: `apps/api/test/patients.test.ts`

**RED:** Add assertions for exactly five doctors, ten normal patients, complete clinician profiles, verified emails, access matrix diversity, and inaccessible search/detail pairs.

**GREEN:** Make seed data idempotently populate clinician profiles, accounts, roles and scoped access while keeping stable IDs used by all modules.

**Verify:** `npx tsx --test apps/api/test/foundation-seed.test.ts apps/api/test/patients.test.ts`

**Commit:** `feat(data): seed clinician accounts and scoped patients`

## Task 3: Protected auth API and request-local identity

**Files:**
- Create: `apps/api/src/platform/auth-routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `packages/contracts/src/platform.ts`
- Test: `apps/api/test/auth-routes.test.ts`
- Update existing API tests to use a test login/session helper.

**RED:** Prove login → Email verify → photo check → session works, logout revokes, `/session` and all business routes require a token, disabled/expired sessions fail, and request headers cannot override identity.

**GREEN:** Register public auth endpoints, authentication hook, request-local context and unified errors. Remove desktop runtime dependence on fixed `actorId` while retaining an explicit test-only helper.

**Verify:** `npm run test -w @doctor/api`

**Commit:** `feat(api): protect routes with authenticated sessions`

## Task 4: Desktop token forwarding and realtime account lifecycle

**Files:**
- Modify: `apps/desktop/src/protocol.ts`
- Modify: `apps/desktop/src/realtime.ts`
- Modify: `apps/desktop/src/main.ts`
- Test: `apps/desktop/test/protocol.test.ts`
- Test: `apps/desktop/test/realtime.test.ts`

**RED:** Prove the private protocol forwards Authorization only, rejects forbidden identity headers, and realtime subscriptions bind/unbind to the authenticated doctor across login/logout.

**GREEN:** Forward the session token, expose no actor-selection channel, and make realtime subscription follow session changes.

**Verify:** `npm run test -w @doctor/desktop`

**Commit:** `feat(desktop): bind protocol and realtime to session`

## Task 5: Bilingual login, Email and demo photo UI

**Files:**
- Create: `apps/web/src/auth/AuthProvider.tsx`
- Create: `apps/web/src/auth/LoginPage.tsx`
- Create: `apps/web/src/auth/auth.css`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/shared/api.ts`
- Modify: `apps/web/src/shared/messages.ts`
- Test: `apps/web/src/auth/LoginPage.test.tsx`
- Test: `apps/web/src/auth/AuthProvider.test.tsx`

**RED:** Prove unauthenticated route protection, three-step login, camera/upload fallback, explicit demo disclaimer, Email error states, session restoration, logout, and bilingual labels.

**GREEN:** Implement compact CareLink login UI and AuthProvider. On logout/401 clear app state and realtime listeners before navigation.

**Verify:** `npm run test -w @doctor/web && npm run typecheck -w @doctor/web`

**Commit:** `feat(web): add verified clinician login flow`

## Task 6: Cross-module integration and audit

**Files:**
- Modify: platform audit/auth service as needed
- Update: relevant API integration tests
- Create: `tests/integration/auth-scope-flow.test.ts`

**RED:** Exercise two real sessions over HTTP: different patient results, denied direct access, E health isolation, E community identity/realtime isolation, logout revocation, and audit events for auth/access outcomes.

**GREEN:** Fix only integration gaps revealed by the test while preserving module interfaces.

**Verify:** `npx tsx --test tests/integration/auth-scope-flow.test.ts && npm run test -w @doctor/api`

**Commit:** `test(auth): cover cross-module identity and scope flow`

## Task 7: Full verification and documentation

**Files:**
- Modify: `docs/API_CONVENTIONS.md`
- Modify: `docs/DELIVERY_STATUS.md`
- Modify: `docs/E_MODULE_HANDOFF.md`
- Modify: `quick-start.md` if login instructions need a demo account note

Update documentation to distinguish implemented Email verification, demo-only photo check, real sessions, seeded accounts and remaining external provider boundaries.

**Verify:** `npm run check` and targeted desktop smoke login if the environment supports Electron.

**Commit:** `docs: document authenticated demo workflow`

## Review focus

- Authentication bypass through public-route matching, static protocol forwarding or WebSocket handshake.
- Plaintext password/code/token leakage in DB, logs, fixtures or responses.
- Session confusion after logout/account switch and cross-user cached clinical/community data.
- Patient existence leakage through counts, search, dashboard, health and direct IDs.
- Misleading claims that demo photo capture is genuine face recognition.
- Migration/seed behavior for both new and existing databases.
