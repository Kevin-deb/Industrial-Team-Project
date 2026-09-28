import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/connection.js';
import { SqliteSettingsRepository } from '../src/platform/settings-repository.js';
import { DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES } from '@doctor/contracts';

type App = Awaited<ReturnType<typeof createApp>>;
async function login(app: App, account = 'lin.zhiyuan') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-login',
    payload: { account, password: '123456' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return { authorization: `Bearer ${response.json().data.token}` };
}

test('settings use the authenticated doctor, reject identity/email edits, and survive a restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'carelink-settings-'));
  const databasePath = join(directory, 'doctor.sqlite');
  let app = await createApp({ runtime: 'local-demo', databasePath, reminderPollingMs: 0 });
  try {
    assert.equal((await app.inject('/api/v1/settings/profile')).statusCode, 401);
    assert.equal((await app.inject('/api/v1/settings/notifications')).statusCode, 401);
    const lin = await login(app);
    const liang = await login(app, 'liang.ruochuan');
    const first = (await app.inject({ url: '/api/v1/settings/profile', headers: lin })).json().data;
    const otherBefore = (
      await app.inject({ url: '/api/v1/settings/profile', headers: liang })
    ).json().data;
    const payload = {
      phone: '+86 13800000099',
      specialty: '  心血管慢病管理  ',
      outpatientLocation: 'Room 9',
      bio: 'Synthetic profile revision',
    };
    const changed = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { ...lin, 'x-actor-id': otherBefore.identityId },
      payload,
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(changed.json().data.identityId, first.identityId);
    assert.equal(changed.json().data.email, first.email);
    assert.equal(changed.json().data.specialty, '心血管慢病管理');
    assert.deepEqual(
      (await app.inject({ url: '/api/v1/settings/profile', headers: liang })).json().data,
      otherBefore,
    );
    for (const invalid of [
      { ...payload, identityId: otherBefore.identityId },
      { ...payload, email: 'replacement@example.test' },
      { ...payload, specialty: '   ' },
      { ...payload, phone: 'not-a-phone' },
      { ...payload, bio: 'x'.repeat(2001) },
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings/profile',
        headers: lin,
        payload: invalid,
      });
      assert.equal(response.statusCode, 400, response.body);
    }
    const persistedPreferences = { ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES, encounter: false };
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/settings/notifications',
          headers: lin,
          payload: persistedPreferences,
        })
      ).statusCode,
      200,
    );
    await app.close();
    app = await createApp({ runtime: 'local-demo', databasePath, reminderPollingMs: 0 });
    const persisted = await app.inject({ url: '/api/v1/settings/profile', headers: lin });
    assert.equal(persisted.statusCode, 200, persisted.body);
    assert.equal(persisted.json().data.phone, payload.phone);
    assert.equal(persisted.json().data.bio, payload.bio);
    assert.equal(persisted.json().data.email, first.email);
    assert.deepEqual(
      (await app.inject({ url: '/api/v1/settings/notifications', headers: lin })).json().data,
      persistedPreferences,
    );
  } finally {
    await app.close();
    assert.equal(dirname(directory), resolve(tmpdir()), 'Only remove the isolated test directory');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('notification settings are account-scoped, validate times, and persist without changing patient reminders', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ runtime: 'local-demo', database: db, reminderPollingMs: 0 });
  try {
    const lin = await login(app);
    const liang = await login(app, 'liang.ruochuan');
    const beforeTasks = db.prepare('SELECT * FROM reminder_tasks ORDER BY id').all();
    const preferences = {
      encounter: false,
      followUp: false,
      browser: true,
      quietHours: true,
      quietStart: '23:00',
      quietEnd: '06:30',
    };
    assert.deepEqual(
      (await app.inject({ url: '/api/v1/settings/notifications', headers: lin })).json().data,
      DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
    );
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/notifications',
      headers: lin,
      payload: preferences,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json().data, preferences);
    assert.deepEqual(
      (await app.inject({ url: '/api/v1/settings/notifications', headers: liang })).json().data,
      DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
    );
    const repository = new SqliteSettingsRepository(db);
    assert.deepEqual(repository.notificationPreferences('doctor-demo-001'), preferences);
    assert.deepEqual(db.prepare('SELECT * FROM reminder_tasks ORDER BY id').all(), beforeTasks);
    for (const invalid of [
      { ...preferences, quietStart: '24:00' },
      { ...preferences, quietEnd: '8:30' },
      { ...preferences, quietEnd: '08:70' },
      { ...preferences, identityId: 'doctor-demo-004' },
      { ...preferences, browser: 'yes' },
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings/notifications',
        headers: lin,
        payload: invalid,
      });
      assert.equal(response.statusCode, 400, response.body);
    }
    assert.deepEqual(repository.notificationPreferences('doctor-demo-001'), preferences);
    const events = db
      .prepare(
        "SELECT actor_id,action,target_id,description FROM audit_events WHERE action LIKE 'settings.%'",
      )
      .all();
    assert.equal(events.length, 1);
    assert.equal(events[0]!.actor_id, 'doctor-demo-001');
    assert.equal(events[0]!.action, 'settings.notifications.update');
    assert.equal(events[0]!.target_id, 'doctor-demo-001');
  } finally {
    await app.close();
    db.close();
  }
});

test('profile and notification writes roll back if their audit event cannot be saved', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new SqliteSettingsRepository(db);
    const context = { actorId: 'doctor-demo-001', now: '2026-09-28T06:00:00.000Z' };
    const beforeProfile = repository.profile(context.actorId);
    const beforePreferences = repository.notificationPreferences(context.actorId);
    db.exec(`CREATE TRIGGER reject_settings_audit BEFORE INSERT ON audit_events
      WHEN NEW.action LIKE 'settings.%' BEGIN SELECT RAISE(ABORT, 'test audit unavailable'); END`);
    assert.throws(
      () =>
        repository.updateProfile(
          {
            phone: '13800000077',
            specialty: 'Revised specialty',
            outpatientLocation: 'Room 7',
            bio: 'Change',
          },
          context,
        ),
      /test audit unavailable/,
    );
    assert.deepEqual(repository.profile(context.actorId), beforeProfile);
    assert.throws(
      () =>
        repository.updateNotificationPreferences(
          {
            ...beforePreferences,
            encounter: false,
          },
          context,
        ),
      /test audit unavailable/,
    );
    assert.deepEqual(repository.notificationPreferences(context.actorId), beforePreferences);
    db.exec('DROP TRIGGER reject_settings_audit');
    repository.updateProfile(
      {
        phone: beforeProfile.phone,
        specialty: beforeProfile.specialty,
        outpatientLocation: 'Room 7',
        bio: 'Private profile content excluded from audit',
      },
      context,
    );
    const audit = db
      .prepare("SELECT description FROM audit_events WHERE action='settings.profile.update'")
      .get();
    assert.ok(audit);
    assert.doesNotMatch(String(audit.description), /Private profile content/);
  } finally {
    db.close();
  }
});
