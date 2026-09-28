import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/connection.js';
import { SqliteHealthRepository } from '../src/health/index.js';
import { LocalDemoNotifications, isQuietTime } from '../src/platform/index.js';
import { DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES, MAX_PHOTO_BYTES } from '@doctor/contracts';

async function login(app: Awaited<ReturnType<typeof createApp>>, account = 'lin.zhiyuan') {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-login',
    payload: { account, password: '123456' },
  });
  assert.equal(result.statusCode, 201, result.body);
  return { authorization: 'Bearer ' + result.json().data.token };
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('due reminders reach a durable scoped local inbox once, independently of doctor notification preferences', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'carelink-notify-'));
  let now = '2026-09-29T02:00:00.000Z';
  const dbPath = join(dir, 'doctor.sqlite');
  let app = await createApp({
    databasePath: dbPath,
    runtime: 'local-demo',
    now: () => now,
    reminderPollingMs: 25,
  });
  try {
    const headers = await login(app);
    const other = await login(app, 'liang.ruochuan');
    const preferences = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/notifications',
      headers,
      payload: { ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES, followUp: false },
    });
    assert.equal(preferences.statusCode, 200, preferences.body);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/health/reminders',
      headers,
      payload: {
        commandId: 'notification-test-create',
        patientId: 'PAT-001',
        channel: 'sms',
        templateId: 'followup-demo',
        scheduledAt: '2026-09-29T02:00:01.000Z',
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id;
    const before = (await app.inject({ url: '/api/v1/notifications', headers })).json().data;
    assert.equal(
      before.inbox.some((x: { reminderId: string }) => x.reminderId === id),
      false,
    );
    now = '2026-09-29T02:00:02.000Z';
    let receipt: any;
    for (let n = 0; n < 80; n++) {
      await pause(25);
      receipt = (await app.inject({ url: '/api/v1/notifications', headers })).json().data;
      if (receipt.inbox.some((x: { reminderId: string }) => x.reminderId === id)) break;
    }
    assert.equal(
      receipt.inbox.filter((x: { reminderId: string }) => x.reminderId === id).length,
      1,
    );
    assert.equal(
      receipt.inbox.find((x: { reminderId: string }) => x.reminderId === id).mode,
      'local-test',
    );
    assert.match(
      receipt.inbox.find((x: { reminderId: string }) => x.reminderId === id).body,
      /随访/,
    );
    assert.deepEqual(
      receipt.reminders,
      [],
      'doctor preference hides doctor notices but does not cancel patient delivery',
    );
    const outside = (await app.inject({ url: '/api/v1/notifications', headers: other })).json()
      .data;
    assert.equal(
      outside.inbox.some((x: { reminderId: string }) => x.reminderId === id),
      false,
    );
    await app.close();
    app = await createApp({
      databasePath: dbPath,
      runtime: 'local-demo',
      now: () => now,
      reminderPollingMs: 25,
    });
    const again = await login(app);
    await pause(60);
    const restored = (await app.inject({ url: '/api/v1/notifications', headers: again })).json()
      .data;
    assert.equal(
      restored.inbox.filter((x: { reminderId: string }) => x.reminderId === id).length,
      1,
    );
    const tasks = (
      await app.inject({ url: '/api/v1/health/reminders?patientId=PAT-001', headers: again })
    ).json().data;
    assert.equal(tasks.find((x: { id: string }) => x.id === id).status, 'sent');
    const audit = (
      await app.inject({ url: '/api/v1/audit?action=health.reminder.retry', headers: again })
    ).json();
    assert.ok(
      audit.data.some(
        (x: { targetId: string; outcome: string }) => x.targetId === id && x.outcome === 'success',
      ),
    );
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('local provider deduplicates by task even across command retries', async () => {
  const db = openDatabase(':memory:');
  try {
    const row = db.prepare('SELECT * FROM reminder_tasks LIMIT 1').get()!;
    const adapter = new LocalDemoNotifications(db, () => '2026-09-29T02:00:00.000Z');
    const task = {
      id: String(row.id),
      patientId: String(row.patient_id),
      channel: 'in-app' as const,
      templateId: String(row.template_id),
      scheduledAt: String(row.scheduled_at),
      status: 'pending' as const,
      attempts: 1,
    };
    const first = await adapter.send(task, { idempotencyKey: 'first' });
    const second = await adapter.send(task, { idempotencyKey: 'retry-after-restart' });
    assert.equal(first.providerMessageId, second.providerMessageId);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_demo_deliveries').get()!.n, 1);
  } finally {
    db.close();
  }
});

test('quiet hours use Shanghai time and handle midnight and daytime windows', () => {
  const preference = { ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES };
  assert.equal(isQuietTime(preference, '2026-09-29T14:00:00Z'), true);
  assert.equal(isQuietTime(preference, '2026-09-29T02:00:00Z'), false);
  assert.equal(isQuietTime({ ...preference, quietHours: false }, '2026-09-29T14:00:00Z'), false);
  assert.equal(
    isQuietTime({ ...preference, quietStart: '09:00', quietEnd: '11:00' }, '2026-09-29T02:00:00Z'),
    true,
  );
});

test('photo validation rejects a decoded image beyond the shared limit', async () => {
  const app = await createApp({ runtime: 'local-demo', reminderPollingMs: 0 });
  try {
    const begun = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/photo-login/start',
      payload: { account: 'lin.zhiyuan' },
    });
    assert.equal(begun.statusCode, 202, begun.body);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/photo-check',
      payload: {
        ticket: begun.json().data.photoTicket,
        captureMethod: 'upload',
        photoDataUrl:
          'data:image/png;base64,' + Buffer.alloc(MAX_PHOTO_BYTES + 1).toString('base64'),
      },
    });
    assert.equal(response.statusCode, 422, response.body);
  } finally {
    await app.close();
  }
});

test('ineligible overdue tasks do not starve authorized tasks behind the batch limit', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new SqliteHealthRepository(db);
    for (let index = 0; index < 30; index++) {
      repository.createReminder(
        {
          id: 'REM-BLOCKED-' + index,
          patientId: 'PAT-001',
          channel: 'in-app',
          templateId: 'followup-demo',
          scheduledAt: '2026-09-01T00:00:00Z',
          status: 'planned',
          attempts: 0,
        },
        undefined,
        'doctor-demo-004',
      );
    }
    repository.createReminder(
      {
        id: 'REM-ELIGIBLE',
        patientId: 'PAT-001',
        channel: 'in-app',
        templateId: 'followup-demo',
        scheduledAt: '2026-09-28T00:00:00Z',
        status: 'planned',
        attempts: 0,
      },
      undefined,
      'doctor-demo-001',
    );
    const due = repository.dueReminders('2026-09-29T02:00:00Z');
    assert.ok(due.some((item) => item.task.id === 'REM-ELIGIBLE'));
    assert.ok(!due.some((item) => item.task.id.startsWith('REM-BLOCKED')));
  } finally {
    db.close();
  }
});

test('an unsupported local template fails delivery without creating a false receipt', async () => {
  const db = openDatabase(':memory:');
  try {
    const adapter = new LocalDemoNotifications(db, () => '2026-09-29T02:00:00Z');
    await assert.rejects(
      adapter.send(
        {
          id: 'unsupported',
          patientId: 'PAT-001',
          channel: 'email',
          templateId: 'unconfigured',
          scheduledAt: '2026-09-29T00:00:00Z',
          status: 'pending',
          attempts: 1,
        },
        { idempotencyKey: 'unsupported-template' },
      ),
      /Unsupported/,
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_demo_deliveries').get()!.n, 0);
  } finally {
    db.close();
  }
});
