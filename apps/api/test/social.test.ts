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
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get()!.count, 12);
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

test('forum supports five deterministic sort modes and idempotent view recording', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db, now: () => '2026-09-13T12:00:00+08:00' });
  try {
    db.prepare(
      `UPDATE social_posts SET view_count=CASE id
      WHEN 'POST-013' THEN 17 WHEN 'POST-014' THEN 63 WHEN 'POST-015' THEN 29 ELSE view_count END
      WHERE group_id='GROUP-GENERAL'`,
    ).run();
    db.prepare(
      "DELETE FROM social_likes WHERE post_id IN ('POST-013','POST-014','POST-015','POST-016')",
    ).run();
    db.prepare(
      "DELETE FROM social_bookmarks WHERE post_id IN ('POST-013','POST-014','POST-015','POST-016')",
    ).run();
    const like = db.prepare(
      'INSERT INTO social_likes(post_id,identity_id,created_at) VALUES(?,?,?)',
    );
    like.run('POST-013', 'doctor-demo-001', '2026-09-13T10:00:00+08:00');
    like.run('POST-013', 'doctor-demo-002', '2026-09-13T10:00:00+08:00');
    like.run('POST-014', 'doctor-demo-001', '2026-09-13T10:00:00+08:00');
    const bookmark = db.prepare(
      'INSERT INTO social_bookmarks(post_id,identity_id,created_at) VALUES(?,?,?)',
    );
    bookmark.run('POST-015', 'doctor-demo-001', '2026-09-13T10:00:00+08:00');
    bookmark.run('POST-015', 'doctor-demo-002', '2026-09-13T10:00:00+08:00');
    bookmark.run('POST-015', 'doctor-demo-003', '2026-09-13T10:00:00+08:00');
    bookmark.run('POST-014', 'doctor-demo-001', '2026-09-13T10:00:00+08:00');

    const expectedFirst: Record<string, string> = {
      'most-liked': 'POST-013',
      'most-bookmarked': 'POST-015',
      'most-viewed': 'POST-014',
      latest: 'POST-016',
      'latest-reply': 'POST-016',
    };
    for (const [sort, firstId] of Object.entries(expectedFirst)) {
      const response = await app.inject(`/api/v1/social/groups/GROUP-GENERAL/posts?sort=${sort}`);
      assert.equal(response.statusCode, 200, `${sort}: ${response.body}`);
      assert.equal(response.json().data.items[0].id, firstId, sort);
      assert.equal(typeof response.json().data.items[0].viewCount, 'number');
    }

    const before = (await app.inject('/api/v1/social/posts/POST-013')).json().data.viewCount;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const viewed = await app.inject({
        method: 'POST',
        url: '/api/v1/social/posts/POST-013/views',
        payload: { commandId: 'cmd-view-post-013' },
      });
      assert.equal(viewed.statusCode, 200, viewed.body);
      assert.equal(viewed.json().data.viewCount, before + 1);
    }
  } finally {
    await app.close();
    db.close();
  }
});

test('forum search includes tags and multiple selected tags use OR semantics', async () => {
  const app = await createApp();
  try {
    const response = await app.inject(
      '/api/v1/social/groups/GROUP-GERIATRICS/posts?q=%E9%9A%8F%E8%AE%BF&tags=%E9%9A%8F%E8%AE%BF%E7%AE%A1%E7%90%86,%E5%81%A5%E5%BA%B7%E6%95%99%E8%82%B2',
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.json().data.items.length > 0);
    assert.ok(
      response.json().data.items.every((item: { title: string; excerpt: string; tags: string[] }) =>
        `${item.title} ${item.excerpt} ${item.tags.join(' ')}`.includes('随访'),
      ),
    );
    assert.ok(
      response.json().data.items.every((item: { tags: string[] }) =>
        item.tags.some((tag) => ['随访管理', '健康教育'].includes(tag)),
      ),
    );
  } finally {
    await app.close();
  }
});

test('creating a report immediately adds an accepted notification for the reporter', () => {
  const db = openDatabase(':memory:');
  const service = new SocialService(new SqliteSocialRepository(db));
  try {
    service.createReport(
      { commandId: 'report-notice', postId: 'POST-001', reason: 'other' },
      { actorId: DEMO_DOCTOR_ID, now: '2026-09-14T08:30:00+08:00' },
    );
    const notice = service
      .listNotifications({ actorId: DEMO_DOCTOR_ID, now: '2026-09-14T08:30:00+08:00' })
      .find((item) => item.kind === 'report-accepted');
    assert.ok(notice);
    assert.equal(notice.postId, 'POST-001');
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
    const peers = await app.inject('/api/v1/social/peers?q=%E5%BF%83%E8%A1%80%E7%AE%A1');
    assert.equal(peers.statusCode, 200, peers.body);
    assert.ok(peers.json().data.length >= 1);
    assert.ok(
      peers
        .json()
        .data.every(
          (item: { id: string; department: string }) =>
            item.id !== DEMO_DOCTOR_ID && item.department.includes('心血管'),
        ),
    );
    assert.equal(
      (await app.inject('/api/v1/social/peers?q=%E6%9E%97%E7%9F%A5%E8%BF%9C')).json().data.length,
      0,
    );
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
        contentBlocks: [],
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
