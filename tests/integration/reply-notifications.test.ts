import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../../apps/api/src/app.js';
import { openDatabase } from '../../apps/api/src/database/connection.js';
import { SocialRealtimeHub } from '../../apps/api/src/social/realtime.js';

// Catches wrong recipients, missing committed events, self notifications and
// ignored recipient preferences, using real routes, storage and browser clients.
test(
  'comment/reply notification matrix across two real browser clients',
  { timeout: 120000 },
  async (t) => {
    const browser = await chromium.launch();
    try {
      for (const kind of ['comment', 'reply'] as const) {
        for (const mode of ['normal', 'self', 'community-off', 'notifications-off'] as const) {
          await t.test(`${kind}: ${mode}`, async () => {
            const db = openDatabase(':memory:');
            const hub = new SocialRealtimeHub();
            const apps = await Promise.all(
              ['doctor-demo-001', 'doctor-demo-002'].map((actorId) =>
                createApp({
                  database: db,
                  identity: { actorId },
                  socialRealtime: hub,
                  webRoot: resolve('apps/web/dist'),
                }),
              ),
            );
            const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
            try {
              const urls = await Promise.all(
                apps.map((app) => app.listen({ host: '127.0.0.1', port: 0 })),
              );
              async function command(index: number, path: string, data: unknown, method = 'POST') {
                const response = await fetch(urls[index] + '/api/v1/social/' + path, {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                });
                assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`);
                return (await response.json()).data;
              }
              async function notices(index: number) {
                const response = await fetch(urls[index] + '/api/v1/social/notifications');
                assert.equal(response.status, 200);
                return (await response.json()).data as Array<{
                  id: string;
                  kind: string;
                  postId: string;
                  commentId?: string;
                  readAt?: string;
                }>;
              }
              const post = await command(0, 'posts', {
                commandId: randomUUID(),
                groupId: 'GROUP-GERIATRICS',
                displayMode: 'named',
                title: '隔离测试：通知接收对象',
                body: '纯合成数据',
                tags: ['随访管理'],
                containsCaseMaterial: false,
                deidentificationConfirmed: false,
              });
              let parentId: string | undefined;
              if (kind === 'reply')
                parentId = (
                  await command(1, `posts/${post.id}/comments`, {
                    commandId: randomUUID(),
                    displayMode: 'named',
                    body: '被回复的原评论',
                  })
                ).id;
              const receiver = kind === 'comment' ? 0 : 1;
              const sender = mode === 'self' ? receiver : 1 - receiver;
              const before = await notices(receiver);
              const otherBefore = await notices(1 - receiver);
              const page = await contexts[receiver].newPage();
              const frames: string[] = [];
              let connected = false;
              page.on('websocket', (ws) => {
                if (ws.url().includes('/social/events')) {
                  ws.on('framereceived', (event) => frames.push(String(event.payload)));
                  connected = true;
                }
              });
              await page.goto(urls[receiver] + '/community');
              const entry = page.getByRole('button', { name: /我的消息/ });
              const unread = before.filter((n) => !n.readAt).length;
              await expect(entry.locator('b')).toHaveText(String(unread));
              await expect.poll(() => connected).toBe(true);
              if (mode === 'community-off' || mode === 'notifications-off') {
                await command(
                  receiver,
                  'preferences',
                  {
                    commandId: randomUUID(),
                    enabled: mode !== 'community-off',
                    notificationsEnabled: false,
                  },
                  'PATCH',
                );
              }
              const body = `隔离${kind}测试 ${randomUUID()}`;
              let commentId: string;
              if (mode === 'normal') {
                const author = await contexts[sender].newPage();
                await author.goto(urls[sender] + `/community/posts/${post.id}`);
                if (parentId) {
                  const article = author
                    .locator('article')
                    .filter({ hasText: '被回复的原评论' })
                    .last();
                  await article.getByRole('button', { name: '回复', exact: true }).click();
                }
                await author.getByRole('textbox', { name: '回复内容' }).fill(body);
                const created = author.waitForResponse(
                  (r) =>
                    r.url().endsWith(`/posts/${post.id}/comments`) &&
                    r.request().method() === 'POST',
                );
                await author.getByRole('button', { name: '发表回复', exact: true }).click();
                const response = await created;
                assert.equal(response.status(), 201);
                commentId = (await response.json()).data.id;
                await expect(entry.locator('b')).toHaveText(String(unread + 1));
                await entry.click();
                await expect(page.getByRole('dialog', { name: '我的消息' })).toContainText(
                  kind === 'comment' ? '评论了你的帖子' : '回复了你的评论',
                );
                assert.ok(
                  frames.some((f) => JSON.parse(f).type === 'social.notifications.changed'),
                );
                assert.ok(
                  frames.every((f) => !f.includes(body)),
                  'message text must not leak into realtime frames',
                );
                await page.screenshot({ path: `test-results/reply-notification-${kind}.png` });
              } else {
                commentId = (
                  await command(sender, `posts/${post.id}/comments`, {
                    commandId: randomUUID(),
                    displayMode: 'named',
                    body,
                    ...(parentId ? { parentCommentId: parentId } : {}),
                  })
                ).id;
                // A bounded quiet window catches incorrectly delivered asynchronous frames.
                await page.waitForTimeout(250);
                assert.equal(
                  frames.filter((f) => JSON.parse(f).type === 'social.notifications.changed')
                    .length,
                  0,
                );
                await expect(entry.locator('b')).toHaveText(String(unread));
              }
              const persisted = await fetch(urls[sender] + `/api/v1/social/posts/${post.id}`);
              assert.equal(persisted.status, 200);
              assert.ok(
                (await persisted.json()).data.comments.some(
                  (c: { id: string; body: string }) => c.id === commentId && c.body === body,
                ),
                'negative notification cases must still save the comment',
              );
              if (mode === 'community-off') {
                // Read API refuses disabled doctors; inspect notices through the
                // existing authorized HTTP API only after re-enabling.
                await command(
                  receiver,
                  'preferences',
                  { commandId: randomUUID(), enabled: true, notificationsEnabled: true },
                  'PATCH',
                );
              }
              const after = await notices(receiver);
              const added = after.filter((n) => !before.some((old) => old.id === n.id));
              assert.equal(added.length, mode === 'normal' ? 1 : 0);
              if (mode === 'normal') {
                assert.equal(added[0].kind, kind);
                assert.equal(added[0].commentId, commentId);
                assert.equal(added[0].postId, post.id);
                await page
                  .getByRole('dialog', { name: '我的消息' })
                  .getByRole('button', {
                    name: new RegExp(kind === 'comment' ? '评论了你的帖子' : '回复了你的评论'),
                  })
                  .first()
                  .click();
                await expect(page).toHaveURL(urls[receiver] + `/community/posts/${post.id}`);
                await expect
                  .poll(
                    async () => (await notices(receiver)).find((n) => n.id === added[0].id)?.readAt,
                  )
                  .toBeTruthy();
              }
              assert.deepEqual(
                (await notices(1 - receiver)).map((n) => n.id),
                otherBefore.map((n) => n.id),
                'must not notify an unrelated doctor or the sender',
              );
            } finally {
              await Promise.all(contexts.map((context) => context.close()));
              await Promise.all(apps.map((app) => app.close()));
              db.close();
            }
          });
        }
      }
    } finally {
      await browser.close();
    }
  },
);
