# Community Workspace Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the agreed personal community home, add five real forum sort modes, make doctor discovery start a direct message, and keep community navigation and the Teams-like chat workspace fixed while their own lists scroll.

**Architecture:** Keep the existing CareLink shell and React Query partial-refresh model. Extend only the E-owned social contract, repository, service, routes, fixtures, and community React views; discover doctors through an injected narrow directory port so E does not own platform identity management. Add an append-only migration for durable post views and use the existing direct-message command to create a conversation on first send.

**Tech Stack:** React 19, React Router, TanStack Query, Fastify, Node SQLite, TypeScript, Vitest, Playwright, Electron

**Spec:** `docs/superpowers/specs/2026-09-13-e-module-design.md`, overridden by the user's approved community correction on 2026-09-13.

## Global Constraints

- Work only on E-owned community/social code and narrow shared contracts.
- Keep the existing white, light-grey, and teal CareLink palette; do not add a second design system.
- Keep one content column, compact typography, low motion, visible loading/error/empty states, and no whole-page refreshes.
- Do not upload, push, create a PR, or package the application.
- Preserve Windows and macOS source compatibility.
- Do not implement platform account management; expose a narrow peer-directory port and local adapter only.
- Do not place patient, record, encounter, consultation, or health identifiers in social tables or APIs.

---

### Task 1: Restore the agreed community home and sticky navigation

**Files:**

- Modify: `apps/web/src/modules/community/CommunityPage.tsx`
- Modify: `apps/web/src/modules/community/MyCommunity.tsx`
- Modify: `apps/web/src/modules/community/PersonalListPage.tsx`
- Modify: `apps/web/src/modules/community/community.css`
- Modify: `apps/web/src/modules/community/messages.ts`
- Test: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**

- Consumes: existing `usePersonalPosts()` and `useNotifications()` queries.
- Produces: `/community` as the four-entry personal home; top-level routes `/community/groups`, `/community/messages`, and `/community/settings`; `.community-sticky-header` as the compact sticky E navigation shell.

- [ ] **Step 1: Write the failing tests**

Add assertions that `/community` renders `我的点赞`, `我的收藏`, `我的帖子`, and `我的消息`, that there is no duplicate top-level `我的社区` link, that the first three entries navigate to their lists, and that `我的消息` opens a dialog.

```tsx
expect(await screen.findByRole('heading', { name: '社区首页' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /我的消息/ })).toBeInTheDocument();
expect(screen.queryByRole('link', { name: '我的社区' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused web test and verify RED**

Run: `npm test -w @doctor/web -- community.test.tsx`

Expected: FAIL because the current index route renders the joined-group post feed and exposes a separate `我的社区` tab.

- [ ] **Step 3: Implement the minimal route and layout change**

Render `MyCommunity` at the index route, remove the duplicate `me` top-level route and link, route personal lists under `/community/me/:kind`, fetch their real totals, and wrap the title plus tabs in `.community-sticky-header`. Keep the boundary note outside the sticky block.

- [ ] **Step 4: Run the focused web test and verify GREEN**

Run: `npm test -w @doctor/web -- community.test.tsx`

Expected: PASS.

### Task 2: Add five durable forum sort modes and views

**Files:**

- Modify: `packages/contracts/src/social.ts`
- Create: `apps/api/src/social/views-migration.ts`
- Modify: `apps/api/src/database/index.ts`
- Modify: `apps/api/src/social/fixtures.ts`
- Modify: `apps/api/src/social/repository.ts`
- Modify: `apps/api/src/social/service.ts`
- Modify: `apps/api/src/social/routes.ts`
- Modify: `apps/web/src/modules/community/ForumPage.tsx`
- Modify: `apps/web/src/modules/community/PostPage.tsx`
- Modify: `apps/web/src/modules/community/PostRow.tsx`
- Modify: `apps/web/src/modules/community/queries.ts`
- Modify: `apps/web/src/modules/community/messages.ts`
- Test: `apps/api/test/social.test.ts`
- Test: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**

- Produces: `SocialPostSort = 'most-liked' | 'most-bookmarked' | 'most-viewed' | 'latest' | 'latest-reply'` and `SocialPostSummary.viewCount`.
- Produces: `POST /api/v1/social/posts/:id/views` with `{ commandId }`, deduplicated by the existing command-receipt mechanism.

- [ ] **Step 1: Write failing API tests for each order and idempotent views**

```ts
for (const sort of ['most-liked', 'most-bookmarked', 'most-viewed', 'latest', 'latest-reply']) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/social/groups/GROUP-GENERAL/posts?sort=${sort}`,
  });
  expect(response.statusCode).toBe(200);
}
expect(afterSecondView.viewCount).toBe(afterFirstView.viewCount);
```

- [ ] **Step 2: Run the focused API test and verify RED**

Run: `npm test -w @doctor/api -- social.test.ts`

Expected: FAIL because only `latest` and `latest-reply` are accepted and posts do not expose `viewCount`.

- [ ] **Step 3: Implement schema, migration, repository ordering, and view command**

Add `view_count INTEGER NOT NULL DEFAULT 0` in an append-only migration, seed varied non-perfect counts, select/map the field, and order by the requested aggregate with `last_activity_at DESC, id DESC` tie-breakers. Increment through a command-idempotent service method and never from a GET request.

- [ ] **Step 4: Add failing UI assertions for all five labels and displayed views**

```tsx
for (const label of ['点赞最多', '收藏最多', '浏览最多', '最新发布', '最新回复']) {
  expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
}
```

- [ ] **Step 5: Run the focused web test and verify RED**

Run: `npm test -w @doctor/web -- community.test.tsx`

Expected: FAIL because the select currently has two options and rows omit views.

- [ ] **Step 6: Implement the five-option control and one-view-per-session behavior**

Use the shared `SocialPostSort`, include sort in the query key, show view count in post rows, and call the view command once per post per renderer session before refetching that detail.

- [ ] **Step 7: Run focused API and web tests and verify GREEN**

Run: `npm test -w @doctor/api -- social.test.ts && npm test -w @doctor/web -- community.test.tsx`

Expected: PASS.

### Task 3: Add narrow doctor search and new direct conversations

**Files:**

- Modify: `packages/contracts/src/social.ts`
- Modify: `apps/api/src/social/ports.ts`
- Create: `apps/api/src/social/peer-directory-adapter.ts`
- Modify: `apps/api/src/social/service.ts`
- Modify: `apps/api/src/social/routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/database/seed.ts`
- Modify: `apps/web/src/modules/community/queries.ts`
- Modify: `apps/web/src/modules/community/DirectMessages.tsx`
- Modify: `apps/web/src/modules/community/messages.ts`
- Test: `apps/api/test/social.test.ts`
- Test: `apps/web/src/modules/community/community.test.tsx`

**Interfaces:**

- Produces: `SocialPeerDirectoryPort.search(query: string, actorId: string): SocialPeer[]`.
- Produces: `GET /api/v1/social/peers?q=...` returning `{ id, displayName, title, department, hospital, avatarInitials }[]` without patient fields.
- Consumes: existing `POST /api/v1/social/messages`; omit `conversationId` for the first message and select the returned `conversationId` after success.

- [ ] **Step 1: Write failing API tests for searching by name and department**

```ts
expect((await getPeers('周')).data[0].displayName).toContain('周');
expect((await getPeers('心血管')).data.some((peer) => peer.department.includes('心血管'))).toBe(
  true,
);
expect((await getPeers('林知远')).data).toHaveLength(0);
```

- [ ] **Step 2: Run the focused API test and verify RED**

Run: `npm test -w @doctor/api -- social.test.ts`

Expected: FAIL with 404 because `/social/peers` does not exist.

- [ ] **Step 3: Implement the port, local adapter, route, and synthetic directory rows**

Keep the SQL identity lookup in the composition adapter rather than the social repository. Limit the normalized query to 60 characters, exclude the current actor, cap results at 12, and add realistic local-only doctors for search coverage.

- [ ] **Step 4: Write failing UI tests for the Teams-like search-to-chat flow**

```tsx
fireEvent.change(screen.getByRole('searchbox', { name: '查找同行医生' }), {
  target: { value: '心血管' },
});
fireEvent.click(await screen.findByRole('button', { name: /周明.*开始私信/ }));
expect(screen.getByRole('heading', { name: '周明' })).toBeInTheDocument();
```

- [ ] **Step 5: Run the focused web test and verify RED**

Run: `npm test -w @doctor/web -- community.test.tsx`

Expected: FAIL because the private-message view has no peer searchbox.

- [ ] **Step 6: Implement debounced search, empty draft thread, and first-send selection**

Keep search above the left conversation list, render compact result rows, clear the result panel after choosing a peer, allow the composer with no conversation id, then select and cache the returned conversation after the first successful message.

- [ ] **Step 7: Run focused API and web tests and verify GREEN**

Run: `npm test -w @doctor/api -- social.test.ts && npm test -w @doctor/web -- community.test.tsx`

Expected: PASS.

### Task 4: Constrain the Teams-like chat viewport and verify the application

**Files:**

- Modify: `apps/web/src/modules/community/DirectMessages.tsx`
- Modify: `apps/web/src/modules/community/community.css`
- Modify: `tests/e-module.spec.ts`
- Modify: `tests/desktop.spec.ts`
- Modify: `docs/E_MODULE_HANDOFF.md`
- Test: `apps/web/src/modules/community/community.test.tsx`
- Test: `tests/e-module.spec.ts`
- Test: `tests/desktop.spec.ts`

**Interfaces:**

- Produces: `.community-dm-workspace` with a bounded available-viewport height, `min-height: 0`, `overflow: hidden`, a left internal scroll container, a middle message scroll container, and a fixed composer row.

- [ ] **Step 1: Add failing component and browser assertions for scroll ownership**

Assert the conversation list, message log, and composer have stable selectors; in Playwright compare the composer bounding box before and after scrolling the message log and verify the page scroll position does not change.

```ts
await messageLog.evaluate((node) => {
  node.scrollTop = node.scrollHeight;
});
expect((await composer.boundingBox())?.y).toBe(before?.y);
expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
```

- [ ] **Step 2: Run focused web and browser tests and verify RED**

Run: `npm test -w @doctor/web -- community.test.tsx && npm run test:e2e -- --grep "private message workspace"`

Expected: FAIL because the existing work area can extend below the visible viewport and the selectors/search workflow are absent.

- [ ] **Step 3: Implement the fixed three-row chat canvas and responsive fallback**

Use a bounded `height: calc(100dvh - var(--community-fixed-offset))`, `grid-template-rows: auto minmax(0, 1fr) auto`, and `overflow: hidden`; put overflow only on `.community-conversation-scroll` and `.community-message-scroll`. At narrow widths, retain a bounded message log and keep the composer visible.

- [ ] **Step 4: Run the design pre-flight audit**

Check the E pages for the existing single teal accent, consistent 6-9px radii, button and input contrast, compact typography, no new decorative cards, no em-dash characters, visible loading/error/empty states, keyboard focus, and reduced-motion compatibility.

- [ ] **Step 5: Run full verification**

Run: `npm run check`

Run: `npm run test:e2e`

Run: `npm run test:desktop`

Expected: all commands PASS with no warnings from the changed E code.

- [ ] **Step 6: Update the local handoff and commit locally**

Document the restored home, sort contract, peer-directory seam, view migration, and fixed chat behavior in `docs/E_MODULE_HANDOFF.md`, then create a local commit without pushing.

```bash
git add packages/contracts/src/social.ts apps/api/src/social apps/api/src/app.ts apps/api/src/database apps/api/test/social.test.ts apps/web/src/modules/community tests docs/E_MODULE_HANDOFF.md docs/superpowers/plans/2026-09-13-community-workspace-corrections.md
git commit -m "feat(e): refine community navigation and messaging"
```
