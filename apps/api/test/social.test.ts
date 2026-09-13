import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { seedSocialDemo } from '../src/social/fixtures.js';
import { SqliteSocialRepository } from '../src/social/repository.js';
import { CommunityDisabled, SocialService, SocialValidationFailure } from '../src/social/service.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';

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
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_direct_messages').get()!.count) >= 72);
    const before = Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count);
    seedSocialDemo(db);
    assert.equal(Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count), before);
  } finally { db.close(); }
});

test('social service enforces opt-in, membership, de-identification, interactions and private-message scope', async () => {
  const db = openDatabase(':memory:');
  try {
    const service = new SocialService(new SqliteSocialRepository(db));
    const context = { actorId: DEMO_DOCTOR_ID, now: '2026-09-13T10:00:00+08:00' };
    const disabled = service.updatePreferences({ commandId: 'cmd-pref-off', enabled: false, notificationsEnabled: true }, context);
    assert.deepEqual(disabled, { enabled: false, notificationsEnabled: false, updatedAt: context.now });
    assert.throws(() => service.listGroups({}, context), CommunityDisabled);
    service.updatePreferences({ commandId: 'cmd-pref-on', enabled: true, notificationsEnabled: true }, context);

    const membership = service.joinGroup('GROUP-GERIATRICS', 'cmd-join-1', context);
    assert.equal(service.joinGroup('GROUP-GERIATRICS', 'cmd-join-1', context).joinedAt, membership.joinedAt);
    assert.throws(() => service.createPost({
      commandId: 'cmd-post-case', groupId: 'GROUP-GERIATRICS', displayMode: 'anonymous',
      title: '连续照护讨论', body: '手工整理后的讨论文本', tags: ['连续照护'],
      containsCaseMaterial: true, deidentificationConfirmed: false,
    }, context), SocialValidationFailure);
    const post = service.createPost({
      commandId: 'cmd-post-ok', groupId: 'GROUP-GERIATRICS', displayMode: 'anonymous',
      title: '连续照护记录方式', body: '这是一段已经人工去标识化的合成讨论文本。', tags: ['连续照护'],
      containsCaseMaterial: true, deidentificationConfirmed: true,
    }, context);
    assert.equal(post.author.anonymous, true);
    assert.equal(post.author.id, undefined);
    assert.equal(post.author.displayName, '匿名医生');
    const liked = service.setLike(post.id, true, 'cmd-like-1', context);
    assert.equal(liked.likedByMe, true);
    const bookmarked = service.setBookmark(post.id, true, 'cmd-bookmark-1', context);
    assert.equal(bookmarked.bookmarkedByMe, true);

    const message = await service.sendMessage({ commandId: 'cmd-dm-1', recipientId: 'doctor-demo-002', body: '方便交流一下科室工作安排吗？' }, context);
    assert.equal(message.recipientId, 'doctor-demo-002');
    assert.equal((await service.sendMessage({ commandId: 'cmd-dm-1', recipientId: 'doctor-demo-002', body: '方便交流一下科室工作安排吗？' }, context)).id, message.id);
    assert.ok(service.listMessages(message.conversationId, undefined, context).items.some((item) => item.id === message.id));
  } finally { db.close(); }
});
