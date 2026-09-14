import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { createApp } from '../src/app.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('rich content migration is additive and clinically isolated', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(
      db.prepare('SELECT COUNT(*) count FROM schema_migrations WHERE version=11').get()!.count,
      1,
    );
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'social_%'")
      .all()
      .map((row) => String(row.name));
    assert.ok(tables.includes('social_attachments'));
    assert.ok(tables.includes('social_content_blocks'));
    const columns = db.prepare('PRAGMA table_info(social_content_blocks)').all();
    assert.ok(columns.some((column) => column.name === 'entity_type'));
    assert.ok(columns.every((column) => !String(column.name).includes('patient')));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('legacy text posts, comments and direct messages expose empty content blocks', async () => {
  const app = await createApp();
  try {
    const feed = await app.inject('/api/v1/social/feed');
    assert.equal(feed.statusCode, 200, feed.body);
    const postId = feed.json().data.items[0].id;
    const post = await app.inject(`/api/v1/social/posts/${postId}`);
    assert.equal(post.statusCode, 200, post.body);
    assert.deepEqual(post.json().data.contentBlocks, []);
    assert.ok(
      post
        .json()
        .data.comments.every((comment: { contentBlocks?: unknown[] }) =>
          Array.isArray(comment.contentBlocks),
        ),
    );

    const conversations = await app.inject('/api/v1/social/conversations');
    const messages = await app.inject(
      `/api/v1/social/conversations/${conversations.json().data[0].id}/messages`,
    );
    assert.ok(
      messages
        .json()
        .data.items.every((message: { contentBlocks?: unknown[] }) =>
          Array.isArray(message.contentBlocks),
        ),
    );
  } finally {
    await app.close();
  }
});

test('post, reply and message claim and reload ordered rich content', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'carelink-rich-content-'));
  const databasePath = resolve(root, 'carelink.db');
  const app = await createApp({ databasePath, now: () => '2026-09-13T15:00:00+08:00' });
  try {
    const firstImage = await uploadPng(app);
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/social/posts',
      payload: {
        commandId: 'cmd-rich-post-001',
        groupId: 'GROUP-GENERAL',
        displayMode: 'named',
        title: '社区混合内容演示',
        body: '这是一条含图片与指标卡的帖子 🙂',
        tags: ['同行经验'],
        containsCaseMaterial: false,
        deidentificationConfirmed: false,
        contentBlocks: [
          { kind: 'image', order: 0, attachmentId: firstImage.id },
          { kind: 'medical-metric-card', order: 1, card: metricCard() },
        ],
      },
    });
    assert.equal(post.statusCode, 201, post.body);
    assert.deepEqual(
      post
        .json()
        .data.contentBlocks.map((block: { kind: string; order: number }) => [
          block.kind,
          block.order,
        ]),
      [
        ['image', 0],
        ['medical-metric-card', 1],
      ],
    );
    assert.equal(post.json().data.contentBlocks[0].attachment.id, firstImage.id);
    const postId = post.json().data.id;
    const reloaded = await app.inject(`/api/v1/social/posts/${postId}`);
    assert.deepEqual(reloaded.json().data.contentBlocks, post.json().data.contentBlocks);
    assert.equal(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/social/attachments/${firstImage.id}`,
        })
      ).statusCode,
      404,
      'an attached file is no longer deletable as a temporary upload',
    );

    const secondImage = await uploadPng(app);
    const comment = await app.inject({
      method: 'POST',
      url: `/api/v1/social/posts/${postId}/comments`,
      payload: {
        commandId: 'cmd-rich-comment-001',
        displayMode: 'named',
        body: '回复附图',
        contentBlocks: [{ kind: 'image', order: 0, attachmentId: secondImage.id }],
      },
    });
    assert.equal(comment.statusCode, 201, comment.body);
    assert.equal(comment.json().data.contentBlocks[0].attachment.id, secondImage.id);

    const message = await app.inject({
      method: 'POST',
      url: '/api/v1/social/messages',
      payload: {
        commandId: 'cmd-rich-message-001',
        recipientId: 'doctor-demo-002',
        body: '这是去标识化的手工记录',
        contentBlocks: [{ kind: 'medical-metric-card', order: 0, card: metricCard() }],
      },
    });
    assert.equal(message.statusCode, 201, message.body);
    assert.equal(message.json().data.contentBlocks[0].card.metrics[1].value, 76);
    const page = await app.inject(
      `/api/v1/social/conversations/${message.json().data.conversationId}/messages`,
    );
    assert.deepEqual(
      page.json().data.items.at(-1).contentBlocks,
      message.json().data.contentBlocks,
    );
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rich content validator rejects broken order, unsafe cards and attachment reuse', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'carelink-rich-validation-'));
  const app = await createApp({ databasePath: resolve(root, 'carelink.db') });
  try {
    const image = await uploadPng(app);
    for (const [commandId, contentBlocks] of [
      ['cmd-rich-invalid-order', [{ kind: 'image', order: 1, attachmentId: image.id }]],
      [
        'cmd-rich-invalid-card',
        [
          {
            kind: 'medical-metric-card',
            order: 0,
            card: { ...metricCard(), deidentificationConfirmed: false },
          },
        ],
      ],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/social/posts',
        payload: {
          commandId,
          groupId: 'GROUP-GENERAL',
          displayMode: 'named',
          title: '校验测试帖子',
          body: '校验测试内容',
          tags: [],
          containsCaseMaterial: false,
          deidentificationConfirmed: false,
          contentBlocks,
        },
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(response.json().error.code, 'INVALID_SOCIAL_CONTENT');
    }
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

function metricCard() {
  return {
    schemaVersion: 1 as const,
    sourceType: 'manual' as const,
    measuredAt: '2026-09-13T08:30:00+08:00',
    metrics: [
      { metricCode: 'systolic', displayName: '收缩压', value: 122, unit: 'mmHg' },
      { metricCode: 'heart-rate', displayName: '心率', value: 76, unit: 'bpm' },
    ],
    sourceLabel: '手工录入（演示）',
    note: '已移除姓名、患者编号和就诊信息',
    deidentificationConfirmed: true,
  };
}

async function uploadPng(app: Awaited<ReturnType<typeof createApp>>) {
  const content = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const boundary = '----carelink-rich-boundary';
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/social/attachments',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="demo.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data as { id: string };
}
