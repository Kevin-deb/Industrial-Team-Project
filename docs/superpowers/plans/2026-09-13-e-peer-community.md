# E Peer Community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an optional, persistent, single-column doctor community with specialty forums, posts and replies, likes, bookmarks, notifications, private messages, reports, and a server-backed opt-out.

**Architecture:** The social domain uses public contracts, isolated `social_*` SQLite tables, a repository and service with no clinical dependencies, validated Fastify routes, and route-aware React views under `/community/*`. It consumes the E query/API foundation delivered by the health plan. Community preferences are canonical on the server; local storage is only a small navigation mirror for the existing A-owned shell.

**Tech Stack:** TypeScript 5.9, React 19, React Router 7, TanStack Query, Fastify 5, Node 24 built-in SQLite, Vitest, Testing Library, Node test runner, Playwright, Electron.

**Spec:** `docs/superpowers/specs/2026-09-13-e-module-design.md`

**Prerequisite:** Complete `docs/superpowers/plans/2026-09-13-e-health-management.md` Task 1 so `requestEApi`, `EQueryProvider`, and component-test utilities exist.

## Global Constraints

- Use Node `>=24.14.0 <25`.
- Support Windows and macOS source execution; do not package, sign, publish, or configure auto-update.
- Work only on `codex/e-module-local`; never push, create a remote branch, or create a PR.
- Keep the CareLink shell and teal palette. Community views use one main column, compact navigation, standard lists, and restrained dialogs.
- Community and health remain different pages and different data domains.
- Do not import patient, records, clinical, encounters, or health repositories into `apps/api/src/social`.
- Do not add patient IDs, record IDs, encounter IDs, or consultation IDs to social DTOs or tables.
- Shared cases are manually typed text and require explicit de-identification confirmation; no clinical prefill or event subscription exists.
- Community content is for professional discussion only and cannot be used directly for clinical treatment.
- Business data lives in SQLite and comes through the API; React files contain no post, comment, message, or notification fixtures.
- All mutations are local asynchronous operations with query-scoped invalidation; never reload the document.
- Private message history scrolls inside its component and is not stored with encounter messages.
- Logs never contain post bodies, comment bodies, private message bodies, identity credentials, or full request bodies.
- Every visible community string exists in both Chinese and English.

---

## File Structure

- `packages/contracts/src/social.ts`: social DTOs, commands, pagination, and preference states.
- `packages/contracts/src/index.ts`: public export for social contracts.
- `apps/api/src/social/evolution-migration.ts`: migration 8 for bookmarks, notifications, conversations, replies, and receipts.
- `apps/api/src/social/fixtures.ts`: rich, deterministic, idempotent community data.
- `apps/api/src/social/ports.ts`: social audit and capability seams only.
- `apps/api/src/social/repository.ts`: isolated `social_*` persistence.
- `apps/api/src/social/service.ts`: enablement, membership, publishing, interaction, messaging, and reporting rules.
- `apps/api/src/social/routes.ts`: validated `/api/v1/social` HTTP interface and safe request logs.
- `apps/api/src/social/index.ts`: social public exports.
- `apps/api/src/database/connection.ts`: composition-only migration 8 and social fixture registration.
- `apps/api/src/app.ts`: composition-only social route registration.
- `apps/api/test/social.test.ts`: migration, isolation, service, API, privacy, and logging tests.
- `apps/web/src/modules/community/queries.ts`: social query keys and mutations.
- `apps/web/src/modules/community/CommunityPage.tsx`: route-aware one-column community shell.
- `apps/web/src/modules/community/CommunityFeed.tsx`: main feed and filters.
- `apps/web/src/modules/community/SpecialtyGroups.tsx`: joined/available group lists.
- `apps/web/src/modules/community/ForumPage.tsx`: group topic list and post composer.
- `apps/web/src/modules/community/PostPage.tsx`: post detail, chronological comments, replies, reactions, and report dialog.
- `apps/web/src/modules/community/MyCommunity.tsx`: four personal entry points.
- `apps/web/src/modules/community/PersonalListPage.tsx`: likes, bookmarks, and own-post lists.
- `apps/web/src/modules/community/CommunityNotifications.tsx`: “我的消息” dialog.
- `apps/web/src/modules/community/DirectMessages.tsx`: internally scrolling direct-message workspace.
- `apps/web/src/modules/community/CommunityPreferences.tsx`: server preference controls.
- `apps/web/src/modules/community/community.css`: community-only styles.
- `apps/web/src/modules/community/messages.ts`: bilingual catalog.
- `apps/web/src/modules/community/community.test.tsx`: view and cache behavior tests.
- `apps/web/src/modules/preferences.ts`: server-backed preference hook plus local navigation mirror.
- `apps/web/src/App.tsx`: one route-pattern change from `/community` to `/community/*`.
- `tests/e2e/community.spec.ts`: full community browser workflow.
- `scripts/check-boundaries.mjs`: explicit prohibition on every social import from patient, clinical, encounter, and health domains.
- `docs/E_MODULE_HANDOFF.md`: append community capability, moderation, and navigation seams.

### Task 1: Add social contracts, migration 8, and rich isolated fixtures

**Files:**
- Create: `packages/contracts/src/social.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/social/evolution-migration.ts`
- Create: `apps/api/src/social/fixtures.ts`
- Modify: `apps/api/src/social/index.ts`
- Modify: `apps/api/src/database/connection.ts`
- Modify: `apps/api/test/api.test.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `SocialPreferences`, `SocialGroup`, `SocialMembership`, `SocialPostSummary`, `SocialPostDetail`, `SocialComment`, `SocialNotification`, `SocialConversation`, `SocialDirectMessage`, and `SocialReport`.
- Produces: `CreatePostInput`, `CreateCommentInput`, `CreateMessageInput`, `CreateReportInput`, and `UpdateSocialPreferencesInput`, all with `commandId` for retriable writes.
- Produces: `socialEvolutionMigration` version `8` and `seedSocialDemo(db)`.

- [ ] **Step 1: Write failing migration and isolation tests**

Assert migration 8 exists, social foreign keys reference only identities and `social_*` tables, fixture counts are rich, and repeated fixture execution does not add rows:

```ts
test('social migration 8 remains clinically isolated and fixtures are idempotent', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get()!.count, 8);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'social_%'").all();
    for (const { name } of tables) {
      const foreign = db.prepare(`PRAGMA foreign_key_list(${String(name)})`).all();
      assert.ok(foreign.every((row) => String(row.table) === 'identities' || String(row.table).startsWith('social_')));
    }
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count) >= 24);
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_comments').get()!.count) >= 60);
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: FAIL because migration 8 and social fixtures do not exist.

- [ ] **Step 3: Define exact contracts**

Use only social identifiers:

```ts
export interface SocialPostSummary {
  id: string;
  groupId: string;
  groupName: string;
  author: { id?: string; displayName: string; anonymous: boolean; avatarInitials: string };
  title: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
  commentCount: number;
  likeCount: number;
  bookmarkCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}

export interface CreatePostInput {
  commandId: string;
  groupId: string;
  displayMode: 'named' | 'anonymous';
  title: string;
  body: string;
  tags: string[];
  containsCaseMaterial: boolean;
  deidentificationConfirmed: boolean;
}

export interface SocialPreferences {
  enabled: boolean;
  notificationsEnabled: boolean;
  updatedAt: string;
}

export interface SocialGroup {
  id: string;
  name: string;
  specialty: string;
  description: string;
  memberCount: number;
  postCount: number;
  joinedByMe: boolean;
}

export interface SocialMembership {
  groupId: string;
  identityId: string;
  joinedAt: string;
}

export interface SocialPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SocialListQuery {
  q?: string;
  tag?: string;
  sort?: 'latest' | 'latest-reply';
  page?: number;
  pageSize?: number;
}

export interface SocialMessagePage {
  items: SocialDirectMessage[];
  nextCursor?: string;
}

export interface SocialComment {
  id: string;
  postId: string;
  parentCommentId?: string;
  author: { id?: string; displayName: string; anonymous: boolean; avatarInitials: string };
  displayMode: 'named' | 'anonymous';
  body: string;
  createdAt: string;
}

export interface SocialPostDetail extends SocialPostSummary {
  body: string;
  comments: SocialComment[];
  containsCaseMaterial: boolean;
  deidentificationConfirmed: boolean;
}

export interface SocialNotification {
  id: string;
  kind: 'comment' | 'reply' | 'like' | 'bookmark';
  actorDisplayName: string;
  postId: string;
  commentId?: string;
  createdAt: string;
  readAt?: string;
}

export interface SocialConversation {
  id: string;
  peer: { id: string; displayName: string; avatarInitials: string };
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
}

export interface SocialDirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  sentAt: string;
}

export interface SocialReport {
  id: string;
  postId?: string;
  messageId?: string;
  reason: 'false-medical-claim' | 'advertising' | 'harassment' | 'other';
  status: 'pending';
  createdAt: string;
}

export interface CreateCommentInput {
  commandId: string;
  postId: string;
  parentCommentId?: string;
  displayMode: 'named' | 'anonymous';
  body: string;
}

export interface CreateMessageInput {
  commandId: string;
  conversationId?: string;
  recipientId: string;
  body: string;
}

export interface CreateReportInput {
  commandId: string;
  postId?: string;
  messageId?: string;
  reason: SocialReport['reason'];
  description?: string;
}

export interface UpdateSocialPreferencesInput {
  commandId: string;
  enabled: boolean;
  notificationsEnabled: boolean;
}
```

Define `SocialNotification.kind` as `comment | reply | like | bookmark`; private messages use separate DTOs.

- [ ] **Step 4: Implement additive migration 8**

Create:

```sql
CREATE TABLE social_bookmarks (
  post_id TEXT NOT NULL REFERENCES social_posts(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(post_id, identity_id)
);

CREATE TABLE social_notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES identities(id),
  actor_id TEXT REFERENCES identities(id),
  post_id TEXT REFERENCES social_posts(id),
  comment_id TEXT REFERENCES social_comments(id),
  kind TEXT NOT NULL CHECK(kind IN ('comment','reply','like','bookmark')),
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE social_conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE social_conversation_members (
  conversation_id TEXT NOT NULL REFERENCES social_conversations(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  PRIMARY KEY(conversation_id, identity_id)
);

CREATE TABLE social_command_receipts (
  actor_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, command_id)
);
```

Rebuild `social_posts` to make its de-identification timestamp nullable and add `title`, `tags_json`, `last_activity_at`, and `contains_case_material`. Add `parent_comment_id` and `display_mode` to comments. Add `conversation_id` and `read_at` to direct messages. Add `description` to groups. Preserve all migration 6 rows.

- [ ] **Step 5: Seed deterministic social data**

Seed 6 groups, at least 24 posts, 60 comments/replies, 30 likes, 20 bookmarks, 20 notifications, and the 3 possible pairwise conversations among the existing synthetic doctors with 24 to 40 messages each. Use the existing doctor identities only. Enable the demonstration doctor's community preference while leaving the control available.

- [ ] **Step 6: Register migration and fixtures**

Append migration 8 after health migration 7 and call `seedSocialDemo(database)` after `seedHealthDemo(database)`. Update both exact migration-count assertions in `apps/api/test/api.test.ts` from 7 to 8. Do not modify platform, patient, encounter, clinical, health, or original social migration SQL.

- [ ] **Step 7: Run tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: PASS.

Run: `npm run typecheck -w @doctor/contracts`

Expected: PASS.

Run: `npm run typecheck -w @doctor/api`

Expected: PASS.

```bash
git add packages/contracts/src apps/api/src/social apps/api/src/database/connection.ts apps/api/test/social.test.ts
git commit -m "feat(social): add isolated community contracts and data"
```

### Task 2: Implement preferences, groups, repository isolation, and capability enforcement

**Files:**
- Create: `apps/api/src/social/ports.ts`
- Create: `apps/api/src/social/repository.ts`
- Create: `apps/api/src/social/service.ts`
- Modify: `apps/api/src/social/index.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `SocialAuditEvent` as `{ actorId, action, resourceType, resourceId, outcome, occurredAt }` and `SocialAuditPort.record(event)` with metadata-only events.
- Produces: `SocialRepository` methods for preferences, groups, memberships, receipts, posts, interactions, notifications, conversations, messages, and reports.
- Produces: `SocialService.getPreferences`, `updatePreferences`, `listGroups`, `joinGroup`, and `leaveGroup` in this task.
- Produces: `CommunityDisabled`, `SocialNotFound`, `SocialConflict`, and `SocialValidationFailure` domain errors.

- [ ] **Step 1: Write failing enablement and membership tests**

Assert join is idempotent by `commandId`, leave removes only the current actor's membership, closing the community also disables notifications, and all community reads except preferences fail while disabled:

```ts
const disabled = service.updatePreferences({ commandId: 'pref-1', enabled: false, notificationsEnabled: true }, context);
assert.deepEqual(disabled, { enabled: false, notificationsEnabled: false, updatedAt: context.now });
assert.throws(() => service.listGroups({}, context), CommunityDisabled);
```

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: FAIL because the repository and service do not exist.

- [ ] **Step 3: Implement the repository without cross-domain SQL**

Every SQL statement in `repository.ts` may reference `identities` and `social_*` only. Read models aggregate counts with subqueries and always bind actor IDs. Provide pagination with page `1..100000` and page size `1..100`.

Use this repository surface; `SocialCommandReceipt` is the internal shape `{ actorId, commandId, operation, requestDigest, resourceId, responseJson, createdAt }`:

```ts
export interface SocialRepository {
  transaction<T>(work: () => T): T;
  findReceipt(actorId: string, commandId: string): SocialCommandReceipt | undefined;
  saveReceipt(receipt: SocialCommandReceipt): void;
  getPreferences(actorId: string): SocialPreferences;
  updatePreferences(actorId: string, preferences: SocialPreferences): void;
  listGroups(query: SocialListQuery, actorId: string): SocialPage<SocialGroup>;
  isMember(groupId: string, actorId: string): boolean;
  joinGroup(membership: SocialMembership): void;
  leaveGroup(groupId: string, actorId: string): void;
  listFeed(query: SocialListQuery, actorId: string): SocialPage<SocialPostSummary>;
  listGroupPosts(groupId: string, query: SocialListQuery, actorId: string): SocialPage<SocialPostSummary>;
  findPost(id: string, actorId: string): SocialPostDetail | undefined;
  createPost(post: SocialPostDetail, authorId: string): void;
  createComment(comment: SocialComment, authorId: string): void;
  setLike(postId: string, actorId: string, liked: boolean, createdAt: string): void;
  setBookmark(postId: string, actorId: string, bookmarked: boolean, createdAt: string): void;
  listMyPosts(query: SocialListQuery, actorId: string): SocialPage<SocialPostSummary>;
  listMyLikes(query: SocialListQuery, actorId: string): SocialPage<SocialPostSummary>;
  listMyBookmarks(query: SocialListQuery, actorId: string): SocialPage<SocialPostSummary>;
  listNotifications(actorId: string): SocialNotification[];
  markNotificationRead(id: string, actorId: string, readAt: string): boolean;
  createNotification(notification: SocialNotification, recipientId: string): void;
  listConversations(actorId: string): SocialConversation[];
  listMessages(conversationId: string, actorId: string, cursor?: string): SocialMessagePage;
  findDirectConversation(actorId: string, recipientId: string): string | undefined;
  createDirectConversation(conversationId: string, actorId: string, recipientId: string, at: string): void;
  createMessage(message: SocialDirectMessage): void;
  createReport(report: SocialReport, reporterId: string, description?: string): void;
}
```

- [ ] **Step 4: Implement preferences and membership rules**

All non-preference service methods call `assertEnabled(actorId)` first. Preference disable stores both flags as false in one transaction. Join and leave use command receipts and emit metadata-only audit events after commit.

Expose this service surface and implement it across Tasks 2 through 4:

```ts
export interface SocialService {
  getPreferences(context: RequestContext): SocialPreferences;
  updatePreferences(input: UpdateSocialPreferencesInput, context: RequestContext): SocialPreferences;
  listGroups(query: SocialListQuery, context: RequestContext): SocialPage<SocialGroup>;
  joinGroup(groupId: string, commandId: string, context: RequestContext): SocialMembership;
  leaveGroup(groupId: string, commandId: string, context: RequestContext): void;
  listFeed(query: SocialListQuery, context: RequestContext): SocialPage<SocialPostSummary>;
  listGroupPosts(groupId: string, query: SocialListQuery, context: RequestContext): SocialPage<SocialPostSummary>;
  getPost(id: string, context: RequestContext): SocialPostDetail;
  createPost(input: CreatePostInput, context: RequestContext): SocialPostDetail;
  createComment(input: CreateCommentInput, context: RequestContext): SocialComment;
  setLike(postId: string, liked: boolean, commandId: string, context: RequestContext): SocialPostDetail;
  setBookmark(postId: string, bookmarked: boolean, commandId: string, context: RequestContext): SocialPostDetail;
  listMyPosts(query: SocialListQuery, context: RequestContext): SocialPage<SocialPostSummary>;
  listMyLikes(query: SocialListQuery, context: RequestContext): SocialPage<SocialPostSummary>;
  listMyBookmarks(query: SocialListQuery, context: RequestContext): SocialPage<SocialPostSummary>;
  listNotifications(context: RequestContext): SocialNotification[];
  markNotificationRead(id: string, commandId: string, context: RequestContext): SocialNotification;
  listConversations(context: RequestContext): SocialConversation[];
  listMessages(conversationId: string, cursor: string | undefined, context: RequestContext): SocialMessagePage;
  sendMessage(input: CreateMessageInput, context: RequestContext): SocialDirectMessage;
  createReport(input: CreateReportInput, context: RequestContext): SocialReport;
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: PASS.

```bash
git add apps/api/src/social apps/api/test/social.test.ts
git commit -m "feat(social): implement preferences and groups"
```

### Task 3: Implement forum posts, comments, likes, bookmarks, notifications, and reports

**Files:**
- Modify: `apps/api/src/social/repository.ts`
- Modify: `apps/api/src/social/service.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `SocialService.listFeed`, `listGroupPosts`, `getPost`, `createPost`, `createComment`, `likePost`, `unlikePost`, `bookmarkPost`, `unbookmarkPost`, `listMyLikes`, `listMyBookmarks`, `listMyPosts`, `listNotifications`, `markNotificationRead`, and `createReport`.

- [ ] **Step 1: Write failing forum interaction tests**

Cover membership-required posting, anonymous projection, case confirmation, comment replies, count changes, duplicate likes/bookmarks, personal lists, recipient notifications, and reports:

```ts
assert.throws(() => service.createPost({
  commandId: 'post-case-1', groupId: 'GROUP-GERIATRICS', displayMode: 'anonymous',
  title: '连续照护讨论', body: '手工整理后的讨论文本', tags: ['连续照护'],
  containsCaseMaterial: true, deidentificationConfirmed: false,
}, context), SocialValidationFailure);
```

Assert an anonymous post omits the author's ID and real display name from both feed and detail responses.

- [ ] **Step 2: Run focused tests and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: FAIL because forum service methods are absent.

- [ ] **Step 3: Implement transactional forum writes**

Posting requires membership. Migration 8 rebuilds `social_posts` so `deidentification_confirmed_at` becomes nullable while preserving existing rows. A case-material post requires `deidentificationConfirmed === true`; non-case posts store a null confirmation timestamp. Comments may reference one parent comment from the same post. Like and bookmark creation use primary-key uniqueness and return the existing state on duplicate identical commands.

Create notifications only for another actor's post or comment. Never notify the actor about their own action. Notification payloads reference social IDs and kind only; the UI derives display text from safe social summaries.

- [ ] **Step 4: Implement report creation without moderation powers**

Accept reasons `false-medical-claim | advertising | harassment | other`. Ordinary E routes create and return a pending report only. Do not add approve, reject, delete-content, or moderator-list endpoints.

- [ ] **Step 5: Run tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: PASS.

```bash
git add apps/api/src/social apps/api/test/social.test.ts
git commit -m "feat(social): implement forum interactions"
```

### Task 4: Implement isolated direct-message conversations

**Files:**
- Modify: `apps/api/src/social/repository.ts`
- Modify: `apps/api/src/social/service.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `SocialService.listConversations(context)`, `listMessages(conversationId, cursor, context)`, and `sendMessage(input, context)`.
- `CreateMessageInput`: `{ commandId, conversationId?, recipientId, body }`.

- [ ] **Step 1: Write failing conversation tests**

Assert only conversation members can read messages, a first message creates one deterministic two-member conversation, repeated command IDs do not duplicate messages, cursor loading returns older rows, and no message row contains a patient or encounter reference.

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: FAIL because conversation service methods are absent.

- [ ] **Step 3: Implement conversation reads and sends**

For two actors, find an existing conversation whose exact member set matches or create one. Store body text only in `social_direct_messages`. Order newest-page queries by `sent_at DESC, id DESC`, return results chronologically within each page, and return `nextCursor` for older messages.

- [ ] **Step 4: Run tests and commit**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: PASS.

```bash
git add apps/api/src/social apps/api/test/social.test.ts
git commit -m "feat(social): add isolated direct messages"
```

### Task 5: Register validated social routes and safe logs

**Files:**
- Create: `apps/api/src/social/routes.ts`
- Modify: `apps/api/src/social/commands.ts`
- Modify: `apps/api/src/social/index.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Consumes: `SocialService` from Tasks 2 through 4.
- Produces: `registerSocialRoutes(app, service): void`.
- Produces: HTTP codes `COMMUNITY_DISABLED`, `SOCIAL_RESOURCE_NOT_FOUND`, `COMMAND_CONFLICT`, and `INVALID_SOCIAL_CONTENT` in the existing envelope.

- [ ] **Step 1: Write failing API route tests**

Exercise every route from the spec, including feed pagination, group membership, post detail, comment reply, like and bookmark add/remove, personal lists, notification read, conversation cursor paging, report creation, and preference disable.

- [ ] **Step 2: Run the route tests and confirm the red state**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: FAIL with current `501 FEATURE_NOT_IMPLEMENTED` or route-not-found responses.

- [ ] **Step 3: Implement runtime schemas and route mapping**

Use `additionalProperties: false`, title length `2..120`, body length `2..10000`, comment/message length `1..4000`, at most 5 tags of at most 30 characters, and bounded pagination. Register routes from `app.ts` and remove now-implemented entries from the planned-command array to prevent duplicate registration.

- [ ] **Step 4: Add safe request logs**

Log `requestId`, `domain: 'social'`, action, actor ID, social resource type/ID, outcome, and duration. Do not log titles, bodies, tags, report descriptions, or message content.

- [ ] **Step 5: Run the social and full API tests**

Run: `npm exec -w @doctor/api -- tsx --test test/social.test.ts`

Expected: PASS.

Run: `npm test -w @doctor/api`

Expected: PASS after the 501 registry test is limited to still-reserved commands.

- [ ] **Step 6: Commit the social API**

```bash
git add apps/api/src/social apps/api/src/app.ts apps/api/test
git commit -m "feat(api): expose peer community routes"
```

### Task 6: Build the single-column community shell, feed, groups, and real forum pages

**Files:**
- Create: `apps/web/src/modules/community/queries.ts`
- Create: `apps/web/src/modules/community/CommunityPage.tsx`
- Create: `apps/web/src/modules/community/CommunityFeed.tsx`
- Create: `apps/web/src/modules/community/SpecialtyGroups.tsx`
- Create: `apps/web/src/modules/community/ForumPage.tsx`
- Create: `apps/web/src/modules/community/PostPage.tsx`
- Create: `apps/web/src/modules/community/community.css`
- Modify: `apps/web/src/modules/community/index.tsx`
- Modify: `apps/web/src/modules/community/messages.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**
- Consumes: `requestEApi` and E query provider from the health foundation.
- Produces: `socialKeys.feed`, `groups`, `groupPosts`, `post`, `myLikes`, `myBookmarks`, `myPosts`, `notifications`, `conversations`, `messages`, and `preferences`.
- Produces: `/community`, `/community/groups`, `/community/groups/:groupId`, and `/community/posts/:postId` views under one `/community/*` route.

- [ ] **Step 1: Write failing view and cache tests**

Assert community home is a post feed, groups are a distinct screen, entering a group shows its own forum list, posting requires the de-identification checkbox when case material is selected, and likes/bookmarks update immediately then roll back on failure.

```ts
await user.click(screen.getByRole('button', { name: '点赞' }));
expect(screen.getByRole('button', { name: '取消点赞' })).toBeInTheDocument();
rejectLikeRequest();
await waitFor(() => expect(screen.getByRole('button', { name: '点赞' })).toBeInTheDocument());
```

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm test -w @doctor/web -- src/modules/community/community.test.tsx`

Expected: FAIL because the new views and queries do not exist.

- [ ] **Step 3: Implement query keys and optimistic interactions**

Use exact keys and update both feed and detail caches for like/bookmark actions. Capture previous cache values in `onMutate`, restore them in `onError`, and invalidate only the affected post, feed/personal list, and notification keys in `onSettled`.

- [ ] **Step 4: Implement route-aware single-column views**

Replace the current promotional feature grid, decorative English eyebrow, hero block, and planning dialogs. Use compact tabs and divided rows. Update the A composition route only from `path="/community"` to `path="/community/*"`; keep all nested route decisions inside `CommunityPage`.

The forum composer uses normal-sized form controls and a modal or side drawer. Post detail shows the main post, interaction row, comments, reply buttons, and report dialog. Restore focus to the opening button when dialogs close.

- [ ] **Step 5: Run component tests and commit**

Run: `npm test -w @doctor/web -- src/modules/community/community.test.tsx`

Expected: PASS.

```bash
git add apps/web/src/modules/community apps/web/src/App.tsx
git commit -m "feat(web): add specialty forum workflow"
```

### Task 7: Add My Community pages, notification dialog, direct-message scrolling, and preferences

**Files:**
- Create: `apps/web/src/modules/community/MyCommunity.tsx`
- Create: `apps/web/src/modules/community/PersonalListPage.tsx`
- Create: `apps/web/src/modules/community/CommunityNotifications.tsx`
- Create: `apps/web/src/modules/community/DirectMessages.tsx`
- Create: `apps/web/src/modules/community/CommunityPreferences.tsx`
- Modify: `apps/web/src/modules/community/queries.ts`
- Modify: `apps/web/src/modules/community/CommunityPage.tsx`
- Modify: `apps/web/src/modules/community/community.css`
- Modify: `apps/web/src/modules/community/messages.ts`
- Modify: `apps/web/src/modules/preferences.ts`
- Test: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**
- Produces: `/community/me`, `/community/me/likes`, `/community/me/bookmarks`, `/community/me/posts`, and `/community/messages` views.
- Produces: `CommunityNotifications` dialog for interaction notifications only.
- Produces: `DirectMessages` for private conversations only.

- [ ] **Step 1: Write failing personal-area tests**

Assert the four entries are exactly `我的点赞`, `我的收藏`, `我的帖子`, and `我的消息`; the first three navigate to their list views; My Messages opens a dialog; private messages remain a separate tab; message history has an internal scroll container; prepending older messages preserves the user's visible position.

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm test -w @doctor/web -- src/modules/community/community.test.tsx`

Expected: FAIL because personal, notification, and direct-message components are absent.

- [ ] **Step 3: Implement My Community and notification dialog**

Use four compact row or segmented entries rather than metric cards. Personal lists reuse the post-row component and API data. The notification dialog uses `role="dialog"`, traps focus, restores focus on close, marks a notification read only after the user opens it, and has an internally scrollable list.

- [ ] **Step 4: Implement the direct-message workspace**

Use one bounded component with a conversation selector, `overflow-y: auto` message history, and a composer fixed to the component bottom. Before fetching older messages capture `scrollHeight` and `scrollTop`; after prepend set `scrollTop += newScrollHeight - oldScrollHeight`. Sending uses a temporary client row, replaces it with the server row on success, and offers retry on failure.

- [ ] **Step 5: Make server preferences canonical**

Change `useCommunityPreference` to read and mutate `/social/preferences`. Mirror the confirmed `enabled` value to `carelink-community-enabled` and dispatch the existing preference event only after a successful response so the A-owned navigation remains consistent. On disable, cancel in-flight social queries and remove cached social data.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -w @doctor/web -- src/modules/community/community.test.tsx`

Expected: PASS.

```bash
git add apps/web/src/modules/community apps/web/src/modules/preferences.ts
git commit -m "feat(web): complete personal community and messages"
```

### Task 8: Prove isolation, persistence, local refresh, and dual-platform source compatibility

**Files:**
- Create: `tests/e2e/community.spec.ts`
- Modify: `scripts/check-boundaries.mjs`
- Modify: `docs/E_MODULE_HANDOFF.md`
- Modify: `apps/api/test/social.test.ts`

**Interfaces:**
- Consumes: completed social vertical slice.
- Produces: executable isolation checks and A/C/D handoff notes without their implementations.

- [ ] **Step 1: Extend the boundary checker first**

Add a rule that fails when a file under `apps/api/src/social` imports any public or internal path from `patients`, `clinical`, `encounters`, or `health`. Run the updated checker against the real source tree with `npm run check:boundaries`; the existing checker has no separate fixture harness.

- [ ] **Step 2: Write the failing browser journey**

The journey joins a group, publishes a manually typed de-identified discussion, comments, likes, bookmarks, opens each personal list, checks My Messages, sends a private message, reloads only by navigating between views, and disables the module. Track document navigation count and assert all mutations are local asynchronous updates.

- [ ] **Step 3: Run the browser test and confirm any remaining red state**

Run: `npm run build`

Expected: PASS.

Run: `npm run test:e2e -- community.spec.ts`

Expected before final fixes: at least one assertion fails if persistence, cache invalidation, focus, scrolling, or disable behavior is incomplete.

- [ ] **Step 4: Fix only observed social integration gaps**

Keep fixes inside E files except the single `/community/*` route and composition registrations. Add handoff entries for A's organization-level capability, audit sink, and navigation control; C's future community-only transport review; and D/A's moderation UI. Do not implement any of them.

- [ ] **Step 5: Run complete verification**

Run: `npm run check:boundaries`

Expected: PASS with explicit social isolation.

Run: `npm test -w @doctor/web`

Expected: PASS.

Run: `npm test -w @doctor/api`

Expected: PASS.

Run: `npm run test:e2e -- community.spec.ts`

Expected: PASS.

Run: `npm run check`

Expected: boundary checks, workspace typechecks, API/desktop tests, and Web/API/Desktop builds PASS on macOS without packaging.

- [ ] **Step 6: Inspect cross-platform source and content safety**

Search E source for hard-coded user paths, OS-specific separators, shell commands, clinical repository imports, clinical identifiers in social contracts, `window.location.reload`, and logs that include body/title/message fields. Expected: no unsafe matches.

- [ ] **Step 7: Commit the verified community slice**

```bash
git add tests/e2e/community.spec.ts scripts/check-boundaries.mjs docs/E_MODULE_HANDOFF.md apps/api/test/social.test.ts
git commit -m "test(social): verify isolated community workflow"
```
