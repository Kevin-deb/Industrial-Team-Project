# Social Rich Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let posts, replies, and direct messages send and reload text, Emoji, images, direct recordings, uploaded audio, and de-identified medical metric cards through one reusable composer.

**Architecture:** Existing text columns remain backward compatible. Ordered content blocks reference attachment metadata stored in SQLite while binary files live behind an injected local storage port; temporary uploads are atomically claimed when their owning social entity is created.

**Tech Stack:** TypeScript 5.9, Fastify 5 multipart streams, SQLite, React 19, TanStack Query 5, Chromium MediaRecorder, Vitest, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-13-e-rich-content-and-health-trends-design.md`

## Global Constraints

- Only E-owned social/community contracts, migration, storage, services, routes, UI, CSS, translations, fixtures, and tests may change, plus the narrow application composition needed to register them.
- Keep posts/comments/messages free of patient, clinical, encounter, prescription, or consultation foreign keys.
- Medical cards are manual, structured, de-identified data in this iteration; only a read-only provider port is reserved for future B integration.
- Images: JPEG/PNG/WebP, at most 4, each at most 5 MiB.
- Audio: direct recording or uploaded MP3/M4A/WAV/WebM/Ogg, at most 1, at most 10 MiB and 3 minutes.
- Medical cards: at most 2 per item, each with 1-4 metrics from one measurement time.
- Keep current compact CareLink UI, local persistence, partial query refresh, and Windows/macOS source compatibility.
- Do not package, commit, or push.

---

### Task 1: Contracts and backward-compatible content blocks

**Files:**

- Modify: `packages/contracts/src/social.ts`
- Modify: `apps/api/test/social.test.ts`
- Modify: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**

- Produces: `SocialContentBlock`, `SocialAttachment`, `MedicalMetricCard`, `MedicalMetricItem`, `CreateSocialContentBlockInput`
- Extends: `SocialPostDetail`, `SocialComment`, `SocialDirectMessage`, `CreatePostInput`, `CreateCommentInput`, `CreateMessageInput`

- [ ] **Step 1: Write failing compatibility tests**

Assert old DTOs with only `body` remain valid and API responses return `contentBlocks: []`. Add mixed-input assertions for one image, one audio, and one medical card.

- [ ] **Step 2: Run focused tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="content block"`

Expected: FAIL because the new shapes are missing.

- [ ] **Step 3: Add exact discriminated unions**

Use stable shapes:

```ts
export interface MedicalMetricItem {
  metricCode: string;
  displayName: string;
  value: number;
  unit: string;
}

export interface MedicalMetricCard {
  schemaVersion: 1;
  sourceType: 'manual' | 'provider';
  measuredAt: string;
  metrics: MedicalMetricItem[];
  sourceLabel: string;
  note?: string;
  deidentificationConfirmed: boolean;
}

export interface SocialAttachment {
  id: string;
  kind: 'image' | 'audio';
  mediaType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
  contentUrl: string;
}

export type SocialContentBlock =
  | { id: string; kind: 'image'; order: number; attachment: SocialAttachment }
  | { id: string; kind: 'audio'; order: number; attachment: SocialAttachment }
  | { id: string; kind: 'medical-metric-card'; order: number; card: MedicalMetricCard };

export type CreateSocialContentBlockInput =
  | { kind: 'image'; order: number; attachmentId: string }
  | { kind: 'audio'; order: number; attachmentId: string }
  | { kind: 'medical-metric-card'; order: number; card: MedicalMetricCard };
```

Add `contentBlocks: SocialContentBlock[]` to returned post detail, comments, and messages. Add optional `contentBlocks?: CreateSocialContentBlockInput[]` to all three creation DTOs.

- [ ] **Step 4: Run workspace type checks**

Run: `npm run typecheck -w @doctor/contracts && npm run typecheck -w @doctor/api && npm run typecheck -w @doctor/web`

Expected: reveal each repository/UI location that must populate `contentBlocks`; do not silence errors with unsafe casts.

### Task 2: Append-only attachment/content-block migration

**Files:**

- Create: `apps/api/src/social/rich-content-migration.ts`
- Modify: `apps/api/src/database/connection.ts`
- Modify: `apps/api/test/social.test.ts`
- Modify: `apps/api/test/api.test.ts`

**Interfaces:**

- Produces: next append-only schema version after the existing view-count migration
- Produces tables: `social_attachments`, `social_content_blocks`

- [ ] **Step 1: Write a failing migration test**

Start from a database containing existing text posts/messages, run all migrations, assert the two new tables and required indexes exist, and assert the old rows remain unchanged.

- [ ] **Step 2: Run the migration test**

Run: `npm run test -w @doctor/api -- --test-name-pattern="rich content migration"`

Expected: FAIL because the migration is not registered.

- [ ] **Step 3: Add the migration**

Create attachment columns for owner identity, kind, media type, storage key, byte size, optional dimensions/duration, state, and timestamps. Create content-block columns for entity type, entity ID, order, kind, optional attachment ID, optional card JSON, schema version, and timestamp. Add unique `(entity_type, entity_id, display_order)` and attachment/state indexes.

- [ ] **Step 4: Register without editing prior migrations**

Append the migration in `connection.ts` after the existing social view-count migration. Never renumber or modify an already published migration.

- [ ] **Step 5: Run migration and API tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="migration|legacy text"`

Expected: PASS.

### Task 3: Local attachment storage and multipart API

**Files:**

- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/social/attachment-storage.ts`
- Create: `apps/api/src/social/attachment-service.ts`
- Modify: `apps/api/src/social/ports.ts`
- Modify: `apps/api/src/social/routes.ts`
- Modify: `apps/api/src/social/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/social.test.ts`
- Modify: `apps/api/test/api.test.ts`

**Interfaces:**

- Produces: `AttachmentStoragePort.writeTemporary`, `open`, `remove`, `exists`
- Produces: `AttachmentService.upload`, `read`, `removeTemporary`, `cleanupExpired`
- Produces routes: `POST /api/v1/social/attachments`, `GET /api/v1/social/attachments/:id/content`, `DELETE /api/v1/social/attachments/:id`

- [ ] **Step 1: Add failing storage tests**

Use a unique temporary directory. Assert generated storage keys cannot escape it, writes are atomic, reads return exact bytes, deletes are idempotent, and no absolute path appears in returned contracts.

- [ ] **Step 2: Add failing media-validation tests**

Cover valid JPEG/PNG/WebP and MP3/M4A/WAV/WebM/Ogg fixtures, mismatched claimed MIME, SVG rejection, image over 5 MiB, audio over 10 MiB, audio over 180 seconds, and unreadable audio.

- [ ] **Step 3: Add failing route tests**

Assert multipart upload returns metadata, `GET` streams it, audio Range returns `206` with `Content-Range`, only the owner can delete a temporary attachment, and an attached file cannot be deleted through the temporary route.

- [ ] **Step 4: Run focused tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="attachment|multipart|media range"`

Expected: FAIL because storage and routes are missing.

- [ ] **Step 5: Add narrowly scoped dependencies**

Install `@fastify/multipart` for bounded streaming uploads, `music-metadata` for server-side audio duration/type inspection, and `image-size` for image metadata. Register multipart only once with the 10 MiB upper bound and one file per request.

- [ ] **Step 6: Implement the storage port**

Resolve the E media root from the same application-writable parent as the SQLite database. Write to a generated temporary name, fsync/close, then rename to the generated storage key. Never join a user filename into a filesystem path.

- [ ] **Step 7: Implement service validation and cleanup**

Inspect bytes/metadata after upload, persist `temporary` metadata, delete invalid files, and remove expired unclaimed files older than 24 hours. Log attachment ID, kind, bytes, and result only.

- [ ] **Step 8: Implement the three routes**

Use the existing response/error envelope for metadata routes. Stream content with exact media type and safe headers. Implement bounded single-range audio responses and reject malformed/multiple ranges with a stable error.

- [ ] **Step 9: Run focused and full API tests**

Run: `npm run test -w @doctor/api`

Expected: PASS.

### Task 4: Repository transactions and entity creation

**Files:**

- Modify: `apps/api/src/social/repository.ts`
- Modify: `apps/api/src/social/service.ts`
- Modify: `apps/api/src/social/routes.ts`
- Modify: `apps/api/src/social/fixtures.ts`
- Modify: `apps/api/test/social.test.ts`

**Interfaces:**

- Produces: `SocialRepository.listContentBlocks(entityType, entityId)`
- Produces: `SocialRepository.createEntityWithBlocks(entity, blocks, actorId)` through focused post/comment/message methods
- Consumes: `CreateSocialContentBlockInput[]`

- [ ] **Step 1: Write failing service tests**

Cover old empty-block creation, mixed blocks, order preservation, ownership rejection, duplicate attachment rejection, already-attached rejection, maximum counts, one audio only, card metric limit, invalid time, missing de-identification confirmation, and idempotent repeated `commandId`.

- [ ] **Step 2: Write failing persistence tests**

Create a post/comment/message with blocks, reopen the repository, and assert all blocks and attachment metadata reload. Force entity insertion failure and assert attachments remain temporary.

- [ ] **Step 3: Run focused tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="mixed content|content block claim"`

Expected: FAIL on missing transaction and hydration behavior.

- [ ] **Step 4: Implement one shared block validator**

Validate kind-specific fields, unique contiguous order values, 4-image/1-audio/2-card limits, 1-4 card metrics, finite numeric values, RFC3339 measurement time, non-empty source, and `deidentificationConfirmed === true`.

- [ ] **Step 5: Implement transactional claims**

Within the same SQLite transaction as entity insertion, verify every attachment belongs to the actor and is `temporary`, insert content blocks, and mark attachments `attached`. Repeated `commandId` returns the original hydrated entity and does not claim again.

- [ ] **Step 6: Hydrate all detail/message responses**

Batch-load content blocks for post details, comments, and message pages to avoid one SQL query per row. Legacy rows return an empty array.

- [ ] **Step 7: Add mixed synthetic fixtures**

Seed small local media/card examples through repository-safe paths. Fixtures must remain synthetic and must not contain real patient identifiers.

- [ ] **Step 8: Run social tests**

Run: `npm run test -w @doctor/api -- --test-name-pattern="social|mixed content|legacy text"`

Expected: PASS.

### Task 5: Reusable React composer and media hooks

**Files:**

- Create: `apps/web/src/modules/community/composer/MixedContentComposer.tsx`
- Create: `apps/web/src/modules/community/composer/AudioRecorder.tsx`
- Create: `apps/web/src/modules/community/composer/AttachmentTray.tsx`
- Create: `apps/web/src/modules/community/composer/MedicalMetricCardDialog.tsx`
- Create: `apps/web/src/modules/community/ContentBlocks.tsx`
- Modify: `apps/web/src/modules/community/queries.ts`
- Modify: `apps/web/src/modules/community/messages.ts`
- Modify: `apps/web/src/modules/community/community.css`
- Modify: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**

- Produces: `ComposerValue { body: string; contentBlocks: CreateSocialContentBlockInput[] }`
- Produces: `MixedContentComposer` with controlled value, limits, disabled state, and `onChange`
- Produces: `useUploadSocialAttachment`, `useDeleteTemporaryAttachment`
- Produces: `ContentBlocks({ blocks })`

- [ ] **Step 1: Write failing shared-composer tests**

Test text and Emoji entry, image selection/preview/delete, limit messages, medical card validation, ordered blocks, upload progress/failure/retry, and preservation of all successful content when one upload fails.

- [ ] **Step 2: Write failing recorder tests with mocked MediaRecorder**

Cover permission grant/deny, unsupported browser, start, running timer, automatic stop at 3 minutes, manual stop, preview URL, play, delete, re-record, upload, and unmount track cleanup.

- [ ] **Step 3: Run focused web tests**

Run: `npm run test -w @doctor/web -- community.test.tsx`

Expected: FAIL because the common components are missing.

- [ ] **Step 4: Implement upload hooks**

Use `FormData` with the existing authenticated E request path while allowing a multipart body without forcing JSON headers. Expose per-file pending/error/success state and delete temporary server attachments when removed.

- [ ] **Step 5: Implement `AudioRecorder`**

Choose the first supported WebM/Opus or Ogg/Opus MIME using `MediaRecorder.isTypeSupported`; retain chunks only for the active recording; stop tracks after completion/cancel/unmount; produce a preview blob; upload only after the user keeps it.

- [ ] **Step 6: Implement medical-card editing**

Allow 1-4 rows with stable metric codes, numeric values, units, one measurement time, source description, optional note, and mandatory de-identification checkbox. Return a version-1 manual card only after validation.

- [ ] **Step 7: Implement the shared tray and renderer**

Show actual thumbnails, audio player/time, card content, upload state, delete/retry actions, and accessible labels. Revoke object URLs when no longer needed.

- [ ] **Step 8: Run focused tests and type checks**

Run: `npm run test -w @doctor/web -- community.test.tsx && npm run typecheck -w @doctor/web`

Expected: PASS for the isolated common components.

### Task 6: Integrate posts, replies, and direct messages

**Files:**

- Modify: `apps/web/src/modules/community/ForumPage.tsx`
- Modify: `apps/web/src/modules/community/PostPage.tsx`
- Modify: `apps/web/src/modules/community/DirectMessages.tsx`
- Modify: `apps/web/src/modules/community/community.css`
- Modify: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**

- Consumes: `MixedContentComposer`, `ContentBlocks`, and extended create mutation inputs
- Produces: the three complete user flows

- [ ] **Step 1: Write failing scenario tests**

For each of post, reply, and direct message, compose text plus image/audio/card, submit, assert the correct DTO, then return hydrated API data and assert the blocks render in order.

- [ ] **Step 2: Add draft-preservation tests**

Force send failure and assert text, previews, card, and attachment IDs remain. Retry and assert the same `commandId` is reused by the mutation rather than duplicating the item.

- [ ] **Step 3: Run scenario tests**

Run: `npm run test -w @doctor/web -- community.test.tsx`

Expected: FAIL because existing forms only submit `body`.

- [ ] **Step 4: Integrate the post form**

Keep title, tags, group, display mode, case-material and de-identification fields outside the common composer. Disable final submit while any attachment upload is pending or failed.

- [ ] **Step 5: Integrate post content and replies**

Render content blocks after the text body for the main post and every comment. Reply mode keeps the selected parent comment while media is added or retried.

- [ ] **Step 6: Integrate fixed direct-message composition**

Keep the conversation header and composer fixed within the chat card and only scroll `.community-message-scroll`. Starting a new peer conversation and sending mixed content must add it to recent conversations without a page reload.

- [ ] **Step 7: Run community tests and type checks**

Run: `npm run test -w @doctor/web -- community.test.tsx && npm run typecheck -w @doctor/web`

Expected: PASS.

### Task 7: Full verification and local desktop inspection

**Files:**

- Modify only if verification exposes a defect in this rich-content slice.

**Interfaces:**

- Consumes: the complete social rich-content slice.
- Produces: recorded terminal and visual evidence; no commit.

- [ ] **Step 1: Run the complete repository gate**

Run: `npm run check`

Expected: boundary checks, types, API tests, web tests, desktop tests, and builds all pass.

- [ ] **Step 2: Launch locally**

Run the normal desktop start command without packaging. Verify a new post, reply, and private message using text/Emoji, an image, a direct recording, an uploaded audio file, and a manual medical card.

- [ ] **Step 3: Verify recovery behavior**

Deny microphone permission and confirm the upload alternative; simulate one failed media upload and one failed send; verify drafts remain and retry succeeds without duplication.

- [ ] **Step 4: Verify privacy and storage**

Confirm community rows have no patient foreign keys, media lives under the application data directory rather than the repository, logs contain no body/card/file-name/path content, and refresh reloads the same API data.

- [ ] **Step 5: Preserve local-only state**

Run `git status --short`; confirm no commit, push, package, or unrelated module change occurred.
