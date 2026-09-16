import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { createApp } from '../src/app.js';
import { SqliteSocialRepository } from '../src/social/repository.js';
import { SocialService, SocialValidationFailure } from '../src/social/service.js';
import { SocialRealtimeHub } from '../src/social/realtime.js';
import { HealthService, HealthResourceNotFound } from '../src/health/service.js';
import { SqliteHealthRepository } from '../src/health/repository.js';
import { SqlitePatientRepository } from '../src/patients/repository.js';
import { SqlitePatientAccess } from '../src/platform/access.js';
import type { PatientSummaryPort, HealthNotificationPort } from '../src/health/ports.js';
import type { ReminderTask, SocialRealtimeEvent } from '@doctor/contracts';

const doctorA = { actorId: 'doctor-demo-001', now: '2026-09-16T12:00:00+08:00' };
const doctorB = { actorId: 'doctor-demo-002', now: '2026-09-16T12:01:00+08:00' };
test('content ownership, retained revisions and deletion tombstones', () => {
  const db = openDatabase(':memory:');
  try {
    const service = new SocialService(new SqliteSocialRepository(db));
    const post = service.createPost(
      {
        commandId: 'history-create-post',
        groupId: 'GROUP-GERIATRICS',
        displayMode: 'anonymous',
        title: '版本测试',
        body: '原始内容',
        tags: ['随访管理'],
        containsCaseMaterial: false,
        deidentificationConfirmed: false,
      },
      doctorA,
    );
    const comment = service.createComment(
      {
        commandId: 'history-create-comment',
        postId: post.id,
        displayMode: 'named',
        body: '评论原文',
      },
      doctorB,
    );
    service.createComment(
      {
        commandId: 'history-create-reply',
        postId: post.id,
        parentCommentId: comment.id,
        displayMode: 'named',
        body: '下级回复',
      },
      doctorA,
    );
    service.setLike(post.id, true, 'history-like-post', doctorB);
    service.setCommentReaction(comment.id, 'like', true, 'history-like-comment', doctorB);
    service.changeContent(
      'comment',
      comment.id,
      { commandId: 'history-edit-comment', action: 'edit', body: '评论新版', reason: '本人更正' },
      doctorB,
    );
    assert.equal(
      service.getPost(post.id, doctorB).comments.find((c) => c.id === comment.id)!.body,
      '评论新版',
    );
    assert.throws(() =>
      service.changeContent(
        'post',
        post.id,
        {
          commandId: 'history-forbidden-edit',
          action: 'edit',
          body: '越权',
          title: '越权',
          reason: '测试',
        },
        doctorB,
      ),
    );
    service.changeContent(
      'post',
      post.id,
      {
        commandId: 'history-edit-post',
        action: 'edit',
        body: '新版内容',
        title: '新版标题',
        reason: '更正',
      },
      doctorA,
    );
    assert.equal(service.getPost(post.id, doctorA).body, '新版内容');
    const history = service.contentHistory('post', post.id, doctorA);
    assert.ok(String(history[0].before_json).includes('原始内容'));
    assert.throws(() => service.contentHistory('post', post.id, doctorB));
    service.changeContent(
      'comment',
      comment.id,
      { commandId: 'history-delete-comment', action: 'delete', reason: '帖主移除' },
      doctorA,
    );
    assert.equal(
      db
        .prepare(
          'SELECT COUNT(*) n FROM social_comments WHERE post_id=? AND deleted_at IS NOT NULL',
        )
        .get(post.id)!.n,
      2,
    );
    assert.equal(service.getPost(post.id, doctorA).comments.length, 0);
    assert.ok(
      service
        .getPost(post.id, doctorB)
        .comments.every(
          (c) => c.deleted && c.body === '该评论已被删除' && c.contentBlocks.length === 0,
        ),
    );
    assert.throws(() =>
      service.setCommentReaction(comment.id, 'like', true, 'history-like-deleted', doctorB),
    );
    service.changeContent(
      'post',
      post.id,
      { commandId: 'history-delete-post', action: 'delete', reason: '撤回' },
      doctorA,
    );
    service.changeContent(
      'post',
      post.id,
      { commandId: 'history-delete-post', action: 'delete', reason: '撤回' },
      doctorA,
    );
    assert.equal(service.contentHistory('post', post.id, doctorA).length, 2);
    const removed = service.getPost(post.id, doctorB);
    assert.equal(removed.title, '该帖子已被删除');
    assert.equal(removed.body, '');
    assert.equal(removed.comments.length, 0);
    assert.ok(service.listMyLikes({}, doctorB).items.some((p) => p.id === post.id && p.deleted));
    assert.throws(() =>
      service.createComment(
        {
          commandId: 'history-reply-deleted',
          postId: post.id,
          displayMode: 'named',
          body: '不可回复',
        },
        doctorB,
      ),
    );
  } finally {
    db.close();
  }
});

test('two doctors exchange messages, read receipts and complete a forum interaction chain', async () => {
  const db = openDatabase(':memory:');
  try {
    const hub = new SocialRealtimeHub();
    const events: SocialRealtimeEvent[] = [];
    hub.subscribe(doctorA.actorId, (event) => events.push(event));
    const service = new SocialService(new SqliteSocialRepository(db), undefined, undefined, hub);
    service.markConversationRead('CONVERSATION-1', 'integration-read-baseline', doctorA);
    const sent = await service.sendMessage(
      {
        commandId: 'integration-message-B-A',
        recipientId: doctorA.actorId,
        body: '明天下午方便讨论随访表吗？🙂',
      },
      doctorB,
    );
    assert.equal(
      service.listConversations(doctorA).find((c) => c.id === sent.conversationId)!.unreadCount,
      1,
    );
    assert.ok(events.some((e) => e.type === 'social.message.created' && e.messageId === sent.id));
    assert.ok(
      service
        .listMessages(sent.conversationId, undefined, doctorA)
        .items.some((m) => m.id === sent.id && m.body.includes('🙂')),
    );
    service.markConversationRead(sent.conversationId, 'integration-read-after-message', doctorA);
    assert.equal(
      service.listConversations(doctorA).find((c) => c.id === sent.conversationId)!.unreadCount,
      0,
    );
    const answer = await service.sendMessage(
      {
        commandId: 'integration-message-A-B',
        recipientId: doctorB.actorId,
        body: '可以，三点见。',
      },
      doctorA,
    );
    assert.ok(
      service
        .listMessages(answer.conversationId, undefined, doctorB)
        .items.some((m) => m.id === answer.id),
    );

    const post = service.createPost(
      {
        commandId: 'integration-post-A',
        groupId: 'GROUP-GERIATRICS',
        displayMode: 'named',
        title: '随访记录的字段如何简化',
        body: '合成交流资料，请大家讨论字段设计。',
        tags: ['随访管理'],
        containsCaseMaterial: false,
        deidentificationConfirmed: false,
      },
      doctorA,
    );
    const comment = service.createComment(
      {
        commandId: 'integration-comment-B',
        postId: post.id,
        displayMode: 'named',
        body: '建议把测量时间单独列出来。',
      },
      doctorB,
    );
    const reply = service.createComment(
      {
        commandId: 'integration-reply-A',
        postId: post.id,
        parentCommentId: comment.id,
        displayMode: 'named',
        body: '采纳这个建议，谢谢。',
      },
      doctorA,
    );
    service.setLike(post.id, true, 'integration-post-like-B', doctorB);
    service.setBookmark(post.id, true, 'integration-post-bookmark-B', doctorB);
    service.setCommentReaction(reply.id, 'like', true, 'integration-reply-like-B', doctorB);
    service.setCommentReaction(reply.id, 'bookmark', true, 'integration-reply-bookmark-B', doctorB);
    service.recordView(post.id, 'integration-view-B', doctorB);
    service.recordView(post.id, 'integration-view-B', doctorB);
    const updated = service.getPost(post.id, doctorA);
    assert.equal(updated.commentCount, 2);
    assert.equal(updated.likeCount, 1);
    assert.equal(updated.bookmarkCount, 1);
    assert.equal(updated.viewCount, 1);
    assert.equal(updated.comments.find((c) => c.id === reply.id)!.likeCount, 1);
    const noticesA = service.listNotifications(doctorA).filter((n) => n.postId === post.id);
    for (const kind of ['comment', 'like', 'bookmark'])
      assert.ok(noticesA.some((n) => n.kind === kind));
    assert.ok(noticesA.some((n) => n.commentId === reply.id && n.kind === 'like'));
    assert.ok(
      service
        .listNotifications(doctorB)
        .some((n) => n.commentId === reply.id && n.kind === 'reply'),
    );
    service.markNotificationRead(noticesA[0]!.id, 'integration-notice-read', doctorA);
    assert.ok(service.listNotifications(doctorA).find((n) => n.id === noticesA[0]!.id)!.readAt);
    assert.ok(service.listMyLikes({}, doctorB).items.some((p) => p.id === post.id));
    assert.ok(service.listMyBookmarks({}, doctorB).items.some((p) => p.id === post.id));
  } finally {
    db.close();
  }
});

test('two patients upload independent observations and receive reminders in a test inbox', async () => {
  const db = openDatabase(':memory:');
  try {
    const patients = new SqlitePatientRepository(db);
    const summaries: PatientSummaryPort = {
      find(id, context) {
        const p = patients.findById(id, context);
        return p
          ? {
              id: p.id,
              name: p.name,
              age: p.age,
              gender: p.gender,
              diagnosis: p.diagnosis,
              nextFollowUp: p.nextFollowUp,
              avatarInitials: p.name.slice(0, 1),
            }
          : undefined;
      },
      search() {
        return [];
      },
    };
    const inbox = new Map<string, ReminderTask[]>();
    const delivered = new Set<string>();
    const provider: HealthNotificationPort = {
      async send(task, options) {
        if (!delivered.has(options.idempotencyKey)) {
          inbox.set(task.patientId, [...(inbox.get(task.patientId) ?? []), structuredClone(task)]);
          delivered.add(options.idempotencyKey);
        }
        return { providerMessageId: `test-inbox:${options.idempotencyKey}` };
      },
    };
    const health = new HealthService(
      new SqliteHealthRepository(db),
      new SqlitePatientAccess(db),
      summaries,
      undefined,
      provider,
    );
    for (const [id, value] of [
      ['PAT-001', 121],
      ['PAT-002', 128],
    ] as const) {
      const input = {
        commandId: `integration-upload-${id}`,
        patientId: id,
        metric: 'systolic' as const,
        value,
        unit: 'mmHg',
        measuredAt: doctorA.now,
        source: 'device-simulator' as const,
        sourceLabel: '集成测试设备',
        externalObservationId: `test-device-${id}-001`,
      };
      const uploaded = health.createObservation(input, doctorA);
      const duplicate = health.createObservation(
        { ...input, commandId: `${input.commandId}-retry` },
        doctorA,
      );
      assert.equal(duplicate.id, uploaded.id);
      const reloaded = new HealthService(
        new SqliteHealthRepository(db),
        new SqlitePatientAccess(db),
        summaries,
        undefined,
        provider,
      );
      assert.ok(
        reloaded
          .listObservations({ patientId: id }, doctorA)
          .items.some((o) => o.id === uploaded.id && o.value === value),
      );
      const reminder = health.createReminder(
        {
          commandId: `integration-reminder-${id}`,
          patientId: id,
          channel: 'in-app',
          templateId: 'followup-demo',
          scheduledAt: '2026-09-16T11:00:00+08:00',
        },
        doctorA,
      );
      const sent = await health.retryReminder(reminder.id, `integration-deliver-${id}`, doctorA);
      await health.retryReminder(reminder.id, `integration-deliver-${id}`, doctorA);
      assert.equal(sent.status, 'sent');
      assert.equal(inbox.get(id)!.length, 1);
      assert.equal(inbox.get(id)![0]!.id, reminder.id);
      assert.equal(
        reloaded.listReminders(id, doctorA).find((r) => r.id === reminder.id)!.status,
        'sent',
      );
    }
    assert.equal(inbox.size, 2);
    assert.throws(
      () =>
        health.createObservation(
          {
            commandId: 'integration-unauthorized-upload',
            patientId: 'PAT-001',
            metric: 'systolic',
            value: 125,
            unit: 'mmHg',
            measuredAt: doctorB.now,
            source: 'manual-entry',
            sourceLabel: 'test',
          },
          doctorB,
        ),
      HealthResourceNotFound,
    );
  } finally {
    db.close();
  }
});

test('a doctor who disabled community cannot be sent a new private message', async () => {
  const db = openDatabase(':memory:');
  try {
    const service = new SocialService(new SqliteSocialRepository(db));
    const before = db.prepare('SELECT COUNT(*) n FROM social_direct_messages').get()!.n;
    service.updatePreferences(
      { commandId: 'integration-disable-B', enabled: false, notificationsEnabled: false },
      doctorB,
    );
    await assert.rejects(
      () =>
        service.sendMessage(
          {
            commandId: 'integration-send-disabled-B',
            recipientId: doctorB.actorId,
            body: '此消息应该被拒绝。',
          },
          doctorA,
        ),
      SocialValidationFailure,
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM social_direct_messages').get()!.n, before);
  } finally {
    db.close();
  }
});

test('failed transactions do not publish notifications and command replays publish only once', () => {
  const db = openDatabase(':memory:');
  try {
    const hub = new SocialRealtimeHub();
    const events: SocialRealtimeEvent[] = [];
    hub.subscribe(doctorA.actorId, (event) => events.push(event));
    const service = new SocialService(new SqliteSocialRepository(db), undefined, undefined, hub);
    const post = service.createPost(
      {
        commandId: 'integration-atomic-post',
        groupId: 'GROUP-GERIATRICS',
        displayMode: 'named',
        title: '事务测试',
        body: '合成测试',
        tags: ['随访管理'],
        containsCaseMaterial: false,
        deidentificationConfirmed: false,
      },
      doctorA,
    );
    db.exec(
      "CREATE TRIGGER fail_test_receipt BEFORE INSERT ON social_command_receipts WHEN NEW.command_id='integration-rollback-like' BEGIN SELECT RAISE(ABORT, 'test receipt failure'); END;",
    );
    assert.throws(
      () => service.setLike(post.id, true, 'integration-rollback-like', doctorB),
      /test receipt failure/,
    );
    assert.equal(service.getPost(post.id, doctorA).likeCount, 0);
    assert.equal(service.listNotifications(doctorA).filter((n) => n.postId === post.id).length, 0);
    assert.equal(events.length, 0);
    service.setLike(post.id, true, 'integration-commit-like', doctorB);
    service.setLike(post.id, true, 'integration-commit-like', doctorB);
    assert.equal(events.filter((e) => e.type === 'social.notifications.changed').length, 1);
  } finally {
    db.close();
  }
});

test(
  'websocket delivers the committed notification event without content or patient data',
  { timeout: 3000 },
  async () => {
    const db = openDatabase(':memory:');
    const hub = new SocialRealtimeHub();
    const app = await createApp({ database: db, socialRealtime: hub });
    const socket = await app.injectWS('/api/v1/social/events', {
      headers: { host: '127.0.0.1', origin: 'http://127.0.0.1' },
    });
    try {
      const service = new SocialService(new SqliteSocialRepository(db), undefined, undefined, hub);
      const post = service.createPost(
        {
          commandId: 'integration-ws-post',
          groupId: 'GROUP-GERIATRICS',
          displayMode: 'named',
          title: '不应进入实时帧的标题',
          body: '不应进入实时帧的正文',
          tags: ['随访管理'],
          containsCaseMaterial: false,
          deidentificationConfirmed: false,
        },
        doctorA,
      );
      const received = new Promise<string>((resolve) =>
        socket.once('message', (data: { toString(): string }) => resolve(data.toString())),
      );
      service.setLike(post.id, true, 'integration-ws-like', doctorB);
      assert.deepEqual(JSON.parse(await received), {
        type: 'social.notifications.changed',
        occurredAt: doctorB.now,
      });
    } finally {
      socket.terminate();
      await app.close();
      db.close();
    }
  },
);

test('a new post reaction actively signals the author to refresh notifications', () => {
  const db = openDatabase(':memory:');
  try {
    const hub = new SocialRealtimeHub();
    const events: SocialRealtimeEvent[] = [];
    hub.subscribe(doctorA.actorId, (event) => events.push(event));
    const service = new SocialService(new SqliteSocialRepository(db), undefined, undefined, hub);
    const post = service.createPost(
      {
        commandId: 'integration-live-notice-post',
        groupId: 'GROUP-GERIATRICS',
        displayMode: 'named',
        title: '实时提醒测试',
        body: '合成测试帖子',
        tags: ['随访管理'],
        containsCaseMaterial: false,
        deidentificationConfirmed: false,
      },
      doctorA,
    );
    service.setLike(post.id, true, 'integration-live-notice-like', doctorB);
    assert.ok(
      service.listNotifications(doctorA).some((n) => n.postId === post.id && n.kind === 'like'),
    );
    assert.ok(
      events.some((event) => String(event.type) === 'social.notifications.changed'),
      '通知已入库，但没有通知作者刷新消息的实时事件',
    );
  } finally {
    db.close();
  }
});
