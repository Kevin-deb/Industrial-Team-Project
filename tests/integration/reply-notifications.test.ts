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
              [0, 1].map(() =>
                createApp({
                  database: db,
                  runtime: 'local-demo',
                  reminderPollingMs: 0,
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
              const tokens = await Promise.all(
                apps.map(async (app, index) => {
                  const login = await app.inject({
                    method: 'POST',
                    url: '/api/v1/auth/password-login',
                    payload: {
                      account: index === 0 ? 'lin.zhiyuan' : 'zhou.ming',
                      password: '123456',
                    },
                  });
                  assert.equal(login.statusCode, 201, login.body);
                  return login.json().data.token as string;
                }),
              );
              await Promise.all(
                contexts.map((context, index) =>
                  context.addInitScript((token) => {
                    localStorage.setItem('carelink-session-token', token);
                    localStorage.setItem('carelink-language', 'zh-CN');
                  }, tokens[index]),
                ),
              );
              async function command(index: number, path: string, data: unknown, method = 'POST') {
                const response = await fetch(urls[index] + '/api/v1/social/' + path, {
                  method,
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokens[index]}`,
                  },
                  body: JSON.stringify(data),
                });
                assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`);
                return (await response.json()).data;
              }
              async function notices(index: number) {
                const response = await fetch(urls[index] + '/api/v1/social/notifications', {
                  headers: { Authorization: `Bearer ${tokens[index]}` },
                });
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
              async function expectUnread(count: number) {
                const badge = entry.locator('.unread-count-badge');
                if (count === 0) await expect(badge).toHaveCount(0);
                else await expect(badge).toHaveText(String(count));
              }
              await expect(entry.locator('.community-entry-count > span').first()).toHaveText(
                String(before.length),
              );
              await expectUnread(unread);
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
                await expectUnread(unread + 1);
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
                await expectUnread(unread);
              }
              const persisted = await fetch(urls[sender] + `/api/v1/social/posts/${post.id}`, {
                headers: { Authorization: `Bearer ${tokens[sender]}` },
              });
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

test(
  'browser realtime rejects anonymous clients and closes revoked sessions without further events',
  { timeout: 30000 },
  async () => {
    const db = openDatabase(':memory:');
    const hub = new SocialRealtimeHub();
    const app = await createApp({
      database: db,
      runtime: 'local-demo',
      reminderPollingMs: 0,
      socialRealtime: hub,
      webRoot: resolve('apps/web/dist'),
    });
    const browser = await chromium.launch();
    try {
      const url = await app.listen({ host: '127.0.0.1', port: 0 });
      const page = await browser.newPage();
      await page.goto(url + '/');
      const socketUrl = url.replace(/^http/, 'ws') + '/api/v1/social/events';
      const anonymous = await page.evaluate(
        (address) =>
          new Promise<{ opened: boolean; messages: number; code: number }>((resolve, reject) => {
            const socket = new WebSocket(address, ['carelink']);
            let opened = false;
            let messages = 0;
            const timeout = setTimeout(() => {
              socket.close();
              reject(new Error('Anonymous socket did not close'));
            }, 5000);
            socket.onopen = () => {
              opened = true;
            };
            socket.onmessage = () => {
              messages += 1;
            };
            socket.onclose = (event) => {
              clearTimeout(timeout);
              resolve({ opened, messages, code: event.code });
            };
          }),
        socketUrl,
      );
      assert.equal(
        anonymous.opened,
        false,
        'an anonymous browser must not complete the WebSocket handshake',
      );
      assert.equal(anonymous.messages, 0);
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/password-login',
        payload: { account: 'lin.zhiyuan', password: '123456' },
      });
      assert.equal(login.statusCode, 201, login.body);
      const { token, identityId } = login.json().data as { token: string; identityId: string };
      await page.evaluate(
        ({ address, token }) =>
          new Promise<void>((resolve, reject) => {
            const target = window as typeof window & {
              socketProbe: { messages: string[]; closeCode: number | null; protocol: string };
            };
            const probe = (target.socketProbe = { messages: [], closeCode: null, protocol: '' });
            const socket = new WebSocket(address, ['carelink', 'bearer.' + token]);
            const timeout = setTimeout(() => {
              socket.close();
              reject(new Error('Authenticated socket did not open'));
            }, 5000);
            socket.onopen = () => {
              clearTimeout(timeout);
              probe.protocol = socket.protocol;
              resolve();
            };
            socket.onmessage = (event) => {
              probe.messages.push(String(event.data));
            };
            socket.onclose = (event) => {
              probe.closeCode = event.code;
            };
            socket.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('Authenticated WebSocket failed'));
            };
          }),
        { address: socketUrl, token },
      );
      const inspect = () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                socketProbe: { messages: string[]; closeCode: number | null; protocol: string };
              }
            ).socketProbe,
        );
      assert.equal(
        (await inspect()).protocol,
        'carelink',
        'the selected public protocol must not echo the credential',
      );
      hub.publish([identityId], {
        type: 'social.notifications.changed',
        occurredAt: '2026-09-28T08:00:00.000Z',
      });
      await expect.poll(async () => (await inspect()).messages.length).toBe(1);
      const logout = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: 'Bearer ' + token },
      });
      assert.equal(logout.statusCode, 204);
      // No event is needed to trigger revocation: an idle connection must close too.
      await expect.poll(async () => (await inspect()).closeCode, { timeout: 5000 }).toBe(1008);
      hub.publish([identityId], {
        type: 'social.notifications.changed',
        occurredAt: '2026-09-28T08:01:00.000Z',
      });
      await page.waitForTimeout(100);
      assert.equal(
        (await inspect()).messages.length,
        1,
        'a revoked session must receive no later event',
      );
      const unauthorized = await app.inject({
        method: 'GET',
        url: '/api/v1/social/notifications',
        headers: { authorization: 'Bearer ' + token },
      });
      assert.equal(unauthorized.statusCode, 401);
    } finally {
      await browser.close();
      await app.close();
      db.close();
    }
  },
);
