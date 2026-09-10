import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/connection.js';
import { resolveDatabasePath } from '../src/database/config.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';
import { SqlitePatientAccess } from '../src/platform/access.js';
import { plannedCommands } from '../src/platform/planned-commands.js';

test('migrations create every domain and coherent synthetic clinical relationships', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get()!.count, 6);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM patients').get()!.count, 9);
    const archive = db
      .prepare(
        "SELECT r.author_id,v.version,rv.reviewer_id FROM medical_records r JOIN medical_record_versions v ON v.record_id=r.id JOIN record_reviews rv ON rv.record_id=r.id AND rv.record_version=v.version WHERE r.status='archived'",
      )
      .get()!;
    assert.equal(archive.version, 1);
    assert.notEqual(archive.author_id, archive.reviewer_id);
    const socialForeignKeys = db.prepare('PRAGMA foreign_key_list(social_posts)').all();
    assert.ok(
      !socialForeignKeys.some((r) => ['patients', 'medical_records'].includes(String(r.table))),
    );
    assert.equal(db.prepare('SELECT COUNT(*) count FROM recordings').get()!.count, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) count FROM reminder_tasks WHERE status='sent'").get()!.count,
      0,
    );
  } finally {
    db.close();
  }
});

test('read APIs use consistent envelopes and dashboard counts are derived from scoped data', async () => {
  const app = await createApp();
  try {
    for (const path of [
      'session',
      'dashboard',
      'patients',
      'encounters',
      'records',
      'consultations',
      'health/overview',
      'audit',
      'features',
      'health',
    ]) {
      const response = await app.inject({ method: 'GET', url: '/api/v1/' + path });
      assert.equal(response.statusCode, 200, path + ': ' + response.body);
      assert.equal(response.json().meta.mode, 'demo');
      assert.match(response.json().meta.requestId, /^[0-9a-f-]{36}$/);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const data = (await app.inject('/api/v1/dashboard')).json().data;
    assert.deepEqual(data.stats, {
      patients: 8,
      pendingEncounters: 2,
      pendingReviews: 2,
      healthAlerts: 2,
    });
    const health = (await app.inject('/api/v1/health/overview')).json().data;
    assert.equal(health.observations.length, 21);
    assert.ok(
      health.observations.every(
        (o: { source: string; measuredAt: string; receivedAt: string }) =>
          o.source === 'synthetic-demo' && o.measuredAt && o.receivedAt,
      ),
    );
    const flags = (await app.inject('/api/v1/features')).json().data;
    assert.equal(flags.find((f: { id: string }) => f.id === 'community').status, 'disabled');
  } finally {
    await app.close();
  }
});

test('patient query validates filters, literal searches, pagination and unknown parameters', async () => {
  const app = await createApp();
  try {
    const symptom = (await app.inject('/api/v1/patients?q=' + encodeURIComponent('头晕'))).json();
    assert.deepEqual(
      symptom.data.map((p: { id: string }) => p.id),
      ['PAT-001'],
    );
    const filtered = (
      await app.inject('/api/v1/patients?status=stable&disease=' + encodeURIComponent('高血压'))
    ).json();
    assert.deepEqual(
      filtered.data.map((p: { id: string }) => p.id),
      ['PAT-003'],
    );
    const page = (await app.inject('/api/v1/patients?page=2&pageSize=2')).json();
    assert.equal(page.meta.total, 8);
    assert.deepEqual(
      page.data.map((p: { id: string }) => p.id),
      ['PAT-003', 'PAT-004'],
    );
    assert.equal(
      (await app.inject('/api/v1/patients?q=' + encodeURIComponent("' OR 1=1 --"))).json().data
        .length,
      0,
    );
    for (const query of [
      'page=0',
      'pageSize=101',
      'status=invalid',
      'unknown=value',
      'q=' + 'a'.repeat(101),
    ]) {
      const response = await app.inject('/api/v1/patients?' + query);
      assert.equal(response.statusCode, 400, query);
      assert.equal(response.json().error.code, 'INVALID_REQUEST');
    }
  } finally {
    await app.close();
  }
});

test('patient scope hides unknown and unauthorized records alike; audit is self-only', async () => {
  const app = await createApp();
  try {
    for (const id of ['PAT-RESTRICTED', 'PAT-MISSING']) {
      const response = await app.inject('/api/v1/patients/' + id);
      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error.code, 'PATIENT_NOT_FOUND');
    }
    assert.equal((await app.inject('/api/v1/patients?q=RESTRICTED')).json().data.length, 0);
    const audit = (await app.inject('/api/v1/audit')).json().data;
    assert.ok(audit.every((e: { actorId: string }) => e.actorId === DEMO_DOCTOR_ID));
    assert.equal(audit.filter((e: { outcome: string }) => e.outcome === 'denied').length, 2);
  } finally {
    await app.close();
  }
});

test('temporary patient access requires role, patient match, active task and unexpired unrevoked grant', () => {
  const db = openDatabase(':memory:');
  try {
    const access = new SqlitePatientAccess(db);
    const context = { actorId: DEMO_DOCTOR_ID, now: '2026-09-10T09:00:00.000Z' };
    assert.equal(access.canReadPatient('PAT-RESTRICTED', context), false);
    db.prepare(
      'INSERT INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'CON-SCOPE',
      'PAT-RESTRICTED',
      'doctor-demo-002',
      'Scope test',
      'Demo',
      'scheduled',
      '2026-09-10T09:00:00.000Z',
      'Synthetic',
    );
    db.prepare(
      'INSERT INTO access_grants(id,identity_id,patient_id,scope,task_id,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      'GRANT-SCOPE',
      DEMO_DOCTOR_ID,
      'PAT-RESTRICTED',
      'patient:read',
      'CON-SCOPE',
      '2026-09-10T10:00:00.000Z',
      '2026-09-10T08:00:00.000Z',
    );
    assert.equal(access.canReadPatient('PAT-RESTRICTED', context), true);
    assert.equal(
      access.canReadPatient('PAT-RESTRICTED', { ...context, now: '2026-09-10T10:00:00.000Z' }),
      false,
      'exact expiry revokes',
    );
    db.prepare("UPDATE consultations SET status='completed' WHERE id='CON-SCOPE'").run();
    assert.equal(
      access.canReadPatient('PAT-RESTRICTED', context),
      false,
      'completion revokes even without timestamp',
    );
    db.prepare(
      "UPDATE consultations SET status='scheduled',completed_at='2026-09-10T08:59:00.000Z' WHERE id='CON-SCOPE'",
    ).run();
    assert.equal(
      access.canReadPatient('PAT-RESTRICTED', context),
      false,
      'completion timestamp is defensive guard',
    );
    db.prepare("UPDATE consultations SET completed_at=NULL WHERE id='CON-SCOPE'").run();
    db.prepare("UPDATE access_grants SET task_id='CON-001' WHERE id='GRANT-SCOPE'").run();
    assert.equal(
      access.canReadPatient('PAT-RESTRICTED', context),
      false,
      'another patient task cannot grant access',
    );
    db.prepare(
      "UPDATE access_grants SET task_id='CON-SCOPE',revoked_at='2026-09-10T08:59:00.000Z' WHERE id='GRANT-SCOPE'",
    ).run();
    assert.equal(access.canReadPatient('PAT-RESTRICTED', context), false);
    db.prepare("DELETE FROM role_permissions WHERE permission='patient:read'").run();
    assert.equal(
      access.canReadPatient('PAT-001', context),
      false,
      'assignment still requires role permission',
    );
  } finally {
    db.close();
  }
});

test('every reserved command returns 501 without mutating clinical data or contacting providers', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const before = db.prepare('SELECT total_changes() changes').get()!.changes;
    for (const command of plannedCommands) {
      const response = await app.inject({
        method: command.method,
        url: '/api/v1' + command.path.replace(':id', 'demo'),
        payload: command.method === 'DELETE' ? undefined : {},
      });
      assert.equal(response.statusCode, 501, command.method + ' ' + command.path);
      assert.equal(response.json().error.code, 'FEATURE_NOT_IMPLEMENTED');
    }
    assert.equal(db.prepare('SELECT total_changes() changes').get()!.changes, before);
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/not-a-real-command',
      payload: {},
    });
    assert.equal(unknown.statusCode, 404);
  } finally {
    await app.close();
    db.close();
  }
});

test('reopening the file database preserves data and does not reseed or rerun migrations', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'doctor-api-'));
  const path = join(folder, 'demo.sqlite');
  try {
    const first = await createApp({ databasePath: path });
    await first.inject('/api/v1/patients/PAT-001');
    const countBefore = (await first.inject('/api/v1/audit')).json().data.length;
    await first.close();
    const second = await createApp({ databasePath: path });
    try {
      assert.equal((await second.inject('/api/v1/patients')).json().meta.total, 8);
      assert.equal((await second.inject('/api/v1/audit')).json().data.length, countBefore + 1);
    } finally {
      await second.close();
    }
    const db = openDatabase(path);
    try {
      assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get()!.count, 6);
    } finally {
      db.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('database failure returns a safe error envelope and local host/origin protections are enforced', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    assert.equal(
      (await app.inject({ url: '/api/v1/session', headers: { host: 'evil.example' } })).statusCode,
      421,
    );
    assert.equal(
      (await app.inject({ url: '/api/v1/session', headers: { origin: 'https://evil.example' } }))
        .statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url: '/api/v1/session', headers: { origin: 'http://localhost:5173' } }))
        .statusCode,
      200,
    );
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/patients',
      headers: { 'content-type': 'application/json' },
      payload: '{"',
    });
    assert.equal(malformed.statusCode, 400);
    db.close();
    const failed = await app.inject('/api/v1/health');
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.json().error.code, 'SERVICE_UNAVAILABLE');
    assert.ok(!failed.body.includes('sqlite'));
  } finally {
    await app.close();
  }
});

test('production mode is refused before opening a demo database', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(createApp(), /refuses NODE_ENV=production/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('database configuration preserves SQLite memory mode and resolves file paths consistently', () => {
  const workspace = join(tmpdir(), 'doctor-config-test');
  assert.equal(resolveDatabasePath(workspace, ':memory:'), ':memory:');
  assert.equal(resolveDatabasePath(workspace), join(workspace, 'runtime', 'data', 'doctor.sqlite'));
  assert.equal(resolveDatabasePath(workspace, 'demo.sqlite'), join(workspace, 'demo.sqlite'));
  const absolute = join(tmpdir(), 'absolute-doctor.sqlite');
  assert.equal(resolveDatabasePath(workspace, absolute), absolute);
});

test('startup refuses mismatched, incomplete and future database migration histories', () => {
  const folder = mkdtempSync(join(tmpdir(), 'doctor-migrations-'));
  try {
    const mutations = [
      "UPDATE schema_migrations SET name='unexpected' WHERE version=2",
      'DELETE FROM schema_migrations WHERE version=2',
      "INSERT INTO schema_migrations VALUES(7,'future','2026-09-10T00:00:00Z')",
    ];
    for (const [index, mutation] of mutations.entries()) {
      const path = join(folder, 'invalid-' + index + '.sqlite');
      const db = openDatabase(path);
      db.exec(mutation);
      db.close();
      assert.throws(() => openDatabase(path), /migration history is incompatible/);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('static UI serving supports direct navigation while preserving API errors and file boundaries', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'doctor-static-'));
  const webRoot = join(folder, 'web');
  mkdirSync(webRoot);
  writeFileSync(
    join(webRoot, 'index.html'),
    '<!doctype html><html><body>Doctor demo shell</body></html>',
  );
  writeFileSync(join(webRoot, 'app.js'), 'window.demo = true;');
  writeFileSync(join(folder, 'private.txt'), 'outside-web-root');
  const app = await createApp({ webRoot });
  try {
    for (const path of ['/', '/patients', '/patients/PAT-001']) {
      const response = await app.inject(path);
      assert.equal(response.statusCode, 200, path);
      assert.match(response.body, /Doctor demo shell/);
    }
    assert.equal((await app.inject('/app.js')).statusCode, 200);
    assert.equal((await app.inject('/api/v1/unknown')).json().error.code, 'NOT_FOUND');
    assert.equal((await app.inject('/missing.js')).statusCode, 404);
    const outside = await app.inject('/%2e%2e/private.txt');
    assert.notEqual(outside.statusCode, 200);
    assert.ok(!outside.body.includes('outside-web-root'));
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
