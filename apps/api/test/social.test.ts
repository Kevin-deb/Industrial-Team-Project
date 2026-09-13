import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { seedSocialDemo } from '../src/social/fixtures.js';
import { SqliteSocialRepository } from '../src/social/repository.js';
import {
  CommunityDisabled,
  SocialNotFound,
  SocialService,
  SocialValidationFailure,
} from '../src/social/service.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';
import { createApp } from '../src/app.js';

test('social migrations remain clinically isolated and fixtures are idempotent', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get()!.count, 9);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'social_%'")
      .all();
    for (const { name } of tables) {
      const foreign = db.prepare(`PRAGMA foreign_key_list(${String(name)})`).all();
      assert.ok(
        foreign.every(
          (row) => String(row.table) === 'identities' || String(row.table).startsWith('social_'),
        ),
      );
    }
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count) >= 24);
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_comments').get()!.count) >= 60);
    assert.ok(
      Number(db.prepare('SELECT COUNT(*) count FROM social_direct_messages').get()!.count) >= 72,
    );
    const before = Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count);
    db.prepare(
      'UPDATE social_preferences SET enabled=0,notifications_enabled=0 WHERE identity_id=?',
    ).run(DEMO_DOCTOR_ID);
    seedSocialDemo(db);
    assert.equal(
      Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count),
      before,
    );
    const preserved = db
      .prepare('SELECT enabled,notifications_enabled FROM social_preferences WHERE identity_id=?')
      .get(DEMO_DOCTOR_ID);
    assert.equal(preserved?.enabled, 0);
    assert.equal(preserved?.notifications_enabled, 0);
  } finally {
    db.close();
  }
});

test('social HTTP routes expose distinct forum, personal, notification and message workflows', async () => {
  const app = await createApp({ now: () => '2026-09-13T10:30:00+08:00' });
  try {
    const feed = await app.inject('/api/v1/social/feed?pageSize=5');
    assert.equal(feed.statusCode, 200);
    assert.equal(feed.json().data.items.length, 5);
    const groups = await app.inject('/api/v1/social/groups');
    assert.equal(groups.statusCode, 200);
    assert.ok(groups.json().data.items.length >= 6);
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/social/posts',
      payload: {
        commandId: 'cmd-route-post',
        groupId: 'GROUP-GERIATRICS',
        displayMode: 'named',
        title: '门诊健康教育资料如何整理',
        body: '想和同行交流一下资料结构与复核流程。',
        tags: ['健康教育'],
        containsCaseMaterial: false,
        deidentificationConfirmed: false,
      },
    });
    assert.equal(post.statusCode, 201, post.body);
    const comment = await app.inject({
      method: 'POST',
      url: `/api/v1/social/posts/${post.json().data.id}/comments`,
      payload: {
        commandId: 'cmd-route-comment',
        displayMode: 'named',
        body: '可以按主题和使用场景分开整理。',
      },
    });
    assert.equal(comment.statusCode, 201, comment.body);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/social/posts/${post.json().data.id}/likes`,
          payload: { commandId: 'cmd-route-like' },
        })
      ).json().data.likedByMe,
      true,
    );
    assert.equal((await app.inject('/api/v1/social/me/likes')).statusCode, 200);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/social/posts/${post.json().data.id}/bookmarks`,
          payload: { commandId: 'cmd-route-bookmark' },
        })
      ).json().data.bookmarkedByMe,
      true,
    );
    assert.ok(
      (await app.inject('/api/v1/social/me/bookmarks'))
        .json()
        .data.items.some((item: { id: string }) => item.id === post.json().data.id),
    );
    const report = await app.inject({
      method: 'POST',
      url: '/api/v1/social/reports',
      payload: { commandId: 'cmd-route-report', postId: post.json().data.id, reason: 'other' },
    });
    assert.equal(report.statusCode, 201, report.body);
    assert.equal(report.json().data.status, 'pending');
    const notificationList = await app.inject('/api/v1/social/notifications');
    assert.equal(notificationList.statusCode, 200);
    const unread = notificationList.json().data.find((item: { readAt?: string }) => !item.readAt);
    const read = await app.inject({
      method: 'POST',
      url: `/api/v1/social/notifications/${unread.id}/read`,
      payload: { commandId: 'cmd-route-notification-read' },
    });
    assert.equal(read.statusCode, 200, read.body);
    assert.ok(read.json().data.readAt);
    const conversations = await app.inject('/api/v1/social/conversations');
    assert.equal(conversations.statusCode, 200);
    const targetConversation = conversations
      .json()
      .data.find((item: { peer: { id: string } }) => item.peer.id === 'doctor-demo-002');
    const conversationId = targetConversation.id;
    assert.equal(
      (await app.inject(`/api/v1/social/conversations/${conversationId}/messages`)).statusCode,
      200,
    );
    const sent = await app.inject({
      method: 'POST',
      url: '/api/v1/social/messages',
      payload: {
        commandId: 'cmd-route-message',
        conversationId,
        recipientId: 'doctor-demo-002',
        body: '路由层私信测试。',
      },
    });
    assert.equal(sent.statusCode, 201, sent.body);
    assert.equal(sent.json().data.conversationId, conversationId);
  } finally {
    await app.close();
  }
});

test('social service enforces opt-in, membership, de-identification, interactions and private-message scope', async () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new SqliteSocialRepository(db);
    const auditEvents: unknown[] = [];
    const service = new SocialService(repository, {
      record(event) {
        auditEvents.push(event);
      },
    });
    const context = { actorId: DEMO_DOCTOR_ID, now: '2026-09-13T10:00:00+08:00' };
    const disabled = service.updatePreferences(
      { commandId: 'cmd-pref-off', enabled: false, notificationsEnabled: true },
      context,
    );
    assert.deepEqual(disabled, {
      enabled: false,
      notificationsEnabled: false,
      updatedAt: context.now,
    });
    assert.throws(() => service.listGroups({}, context), CommunityDisabled);
    service.updatePreferences(
      { commandId: 'cmd-pref-on', enabled: true, notificationsEnabled: true },
      context,
    );

    const anonymousComment = service.createComment(
      {
        commandId: 'cmd-anonymous-notification',
        postId: 'POST-003',
        displayMode: 'anonymous',
        body: '匿名回复不应在消息中心暴露身份。',
      },
      { actorId: 'doctor-demo-002', now: '2026-09-13T10:01:00+08:00' },
    );
    assert.equal(
      service.listNotifications(context).find((item) => item.commentId === anonymousComment.id)
        ?.actorDisplayName,
      '匿名医生',
    );
    const secondDoctorFeed = service.listFeed({}, { actorId: 'doctor-demo-002', now: context.now });
    assert.equal(secondDoctorFeed.total, 16);
    assert.ok(
      secondDoctorFeed.items.every(
        (item) => item.groupId !== 'GROUP-RESPIRATORY' && item.groupId !== 'GROUP-REHAB',
      ),
    );

    const membership = service.joinGroup('GROUP-REHAB', 'cmd-join-1', context);
    assert.equal(
      service.joinGroup('GROUP-REHAB', 'cmd-join-1', context).joinedAt,
      membership.joinedAt,
    );
    assert.throws(
      () =>
        service.createPost(
          {
            commandId: 'cmd-post-case',
            groupId: 'GROUP-GERIATRICS',
            displayMode: 'anonymous',
            title: '连续照护讨论',
            body: '手工整理后的讨论文本',
            tags: ['连续照护'],
            containsCaseMaterial: true,
            deidentificationConfirmed: false,
          },
          context,
        ),
      SocialValidationFailure,
    );
    const post = service.createPost(
      {
        commandId: 'cmd-post-ok',
        groupId: 'GROUP-GERIATRICS',
        displayMode: 'anonymous',
        title: '连续照护记录方式',
        body: '这是一段已经人工去标识化的合成讨论文本。',
        tags: ['连续照护'],
        containsCaseMaterial: true,
        deidentificationConfirmed: true,
      },
      context,
    );
    assert.equal(post.author.anonymous, true);
    assert.equal(post.author.id, undefined);
    assert.equal(post.author.displayName, '匿名医生');
    const liked = service.setLike(post.id, true, 'cmd-like-1', context);
    assert.equal(liked.likedByMe, true);
    const bookmarked = service.setBookmark(post.id, true, 'cmd-bookmark-1', context);
    assert.equal(bookmarked.bookmarkedByMe, true);

    const message = await service.sendMessage(
      {
        commandId: 'cmd-dm-1',
        recipientId: 'doctor-demo-002',
        body: '方便交流一下科室工作安排吗？',
      },
      context,
    );
    assert.equal(message.recipientId, 'doctor-demo-002');
    assert.equal(
      (
        await service.sendMessage(
          {
            commandId: 'cmd-dm-1',
            recipientId: 'doctor-demo-002',
            body: '方便交流一下科室工作安排吗？',
          },
          context,
        )
      ).id,
      message.id,
    );
    assert.ok(
      service
        .listMessages(message.conversationId, undefined, context)
        .items.some((item) => item.id === message.id),
    );
    for (let index = 1; index <= 35; index += 1) {
      repository.createMessage({
        id: `DM-SAME-${String(index).padStart(2, '0')}`,
        conversationId: 'CONVERSATION-1',
        senderId: DEMO_DOCTOR_ID,
        recipientId: 'doctor-demo-002',
        body: `同一时间消息 ${index}`,
        sentAt: '2026-09-13T11:00:00+08:00',
      });
    }
    const newestPage = service.listMessages('CONVERSATION-1', undefined, context);
    assert.equal(newestPage.items.length, 30);
    assert.ok(newestPage.nextCursor);
    const olderPage = service.listMessages('CONVERSATION-1', newestPage.nextCursor, context);
    const sameTimeIds = [...newestPage.items, ...olderPage.items]
      .filter((item) => item.id.startsWith('DM-SAME-'))
      .map((item) => item.id);
    assert.equal(sameTimeIds.length, 35);
    assert.equal(new Set(sameTimeIds).size, 35);
    await assert.rejects(
      service.sendMessage(
        {
          commandId: 'cmd-dm-wrong-conversation',
          conversationId: 'CONVERSATION-2',
          recipientId: 'doctor-demo-002',
          body: '不应进入另一组会话。',
        },
        context,
      ),
      SocialValidationFailure,
    );
    assert.throws(
      () =>
        service.createReport(
          {
            commandId: 'cmd-report-inaccessible-message',
            messageId: 'DM-3-01',
            reason: 'harassment',
          },
          context,
        ),
      SocialNotFound,
    );
    assert.ok(auditEvents.length > 0);
    assert.ok(!JSON.stringify(auditEvents).includes('方便交流一下科室工作安排吗？'));
  } finally {
    db.close();
  }
});
