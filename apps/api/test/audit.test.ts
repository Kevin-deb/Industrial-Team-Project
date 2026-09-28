import test from 'node:test';
import { createApp } from '../src/app.js';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { openDatabase } from '../src/database/connection.js';
import { SqlitePlatformRepository } from '../src/platform/repository.js';
import { auditCsv, registerAuditRoutes } from '../src/platform/audit-routes.js';
import { auditEvolutionMigration } from '../src/platform/audit-evolution-migration.js';
import type { AuditEvent } from '@doctor/contracts';

function fixture(actorId = 'doctor-demo-001') {
  const db = openDatabase(':memory:');
  const platform = new SqlitePlatformRepository(db);
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  registerAuditRoutes(app, {
    platform,
    context: () => ({ actorId, now: '2026-09-28T08:00:00.000Z' }),
  });
  app.addHook('onClose', async () => db.close());
  return { app, db, platform };
}

test('audit query pages beyond 100 events with exact counts, UTC ranges and self-only scope', async () => {
  const { app, platform } = fixture();
  try {
    for (let i = 0; i < 125; i++)
      platform.recordAccess({
        actorId: 'doctor-demo-001',
        action: 'test.audit.' + String(i).padStart(3, '0'),
        targetType: 'audit-test',
        targetId: 'event-' + i,
        outcome: i % 2 ? 'failed' : 'success',
        description: 'Metadata only',
        occurredAt: new Date(Date.UTC(2026, 8, 28, 0, i)).toISOString(),
      });
    platform.recordAccess({
      actorId: 'doctor-demo-002',
      action: 'test.audit.hidden',
      targetType: 'other-only',
      targetId: 'SECRET-OTHER',
      outcome: 'success',
      description: 'Other account event',
    });
    const response = await app.inject('/api/v1/audit?action=test.audit.&page=7&pageSize=20');
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.meta.total, 125);
    assert.equal(body.data.length, 5);
    assert.equal(body.meta.summary.failed, 62);
    assert.equal(body.meta.summary.success, 63);
    assert.equal(body.data.at(-1).action, 'test.audit.000');
    assert.ok(!body.meta.domains.includes('other-only'));
    assert.ok(body.data.every((event: AuditEvent) => event.actorId === 'doctor-demo-001'));
    const query = new URLSearchParams({
      action: 'test.audit.',
      domain: 'audit-test',
      outcome: 'failed',
      from: '2026-09-28T08:01:00+08:00',
      to: '2026-09-28T00:03:00Z',
    });
    const filtered = (await app.inject('/api/v1/audit?' + query)).json();
    assert.equal(filtered.meta.total, 2);
    assert.deepEqual(
      filtered.data.map((event: AuditEvent) => event.action),
      ['test.audit.003', 'test.audit.001'],
    );
    assert.equal(
      (await app.inject('/api/v1/audit?q=%25')).json().meta.total,
      0,
      'percent is a literal search term',
    );
    assert.equal((await app.inject('/api/v1/audit?q=SECRET-OTHER')).json().meta.total, 0);
  } finally {
    await app.close();
  }
});

test('audit routes reject actor injection, unknown filters, invalid dates and unbounded pages', async () => {
  const { app } = fixture();
  try {
    for (const query of [
      'actorId=doctor-demo-002',
      'pageSize=101',
      'page=0',
      'outcome=unknown',
      'from=2026-02-30T00:00:00Z',
      'from=2026-09-29T00:00:00Z&to=2026-09-28T00:00:00Z',
      'from=2026-09-28',
    ])
      assert.equal((await app.inject('/api/v1/audit?' + query)).statusCode, 400, query);
    assert.equal(
      (await app.inject('/api/v1/audit/export?actorId=doctor-demo-002')).statusCode,
      400,
    );
    assert.equal((await app.inject('/api/v1/audit/export?page=1')).statusCode, 400);
  } finally {
    await app.close();
  }
});

test('audit CSV exports all matching rows, escapes spreadsheet formulas and audits preparation', async () => {
  const { app, platform } = fixture();
  try {
    for (let i = 0; i < 125; i++)
      platform.recordAccess({
        actorId: 'doctor-demo-001',
        action: 'export.case',
        targetType: 'audit-test',
        targetId: i === 0 ? '=1+1' : 'safe-' + i,
        outcome: 'success',
        description: i === 0 ? 'line one,"quoted"\nline two' : 'Metadata only',
      });
    platform.recordAccess({
      actorId: 'doctor-demo-002',
      action: 'export.case',
      targetType: 'audit-test',
      targetId: 'DO-NOT-EXPORT',
      outcome: 'success',
      description: 'Private',
    });
    const exported = await app.inject('/api/v1/audit/export?action=export.case');
    assert.equal(exported.statusCode, 200);
    assert.match(exported.headers['content-type']!, /text\/csv/);
    assert.match(exported.headers['content-disposition']!, /attachment/);
    assert.equal(exported.headers['cache-control'], 'no-store');
    assert.equal((exported.body.match(/"export.case"/g) ?? []).length, 125);
    assert.ok(exported.body.includes(`"'=1+1"`));
    assert.ok(exported.body.includes('"line one,""quoted""\nline two"'));
    assert.ok(!exported.body.includes('DO-NOT-EXPORT'));
    const audit = (await app.inject('/api/v1/audit?action=audit.export')).json();
    assert.equal(audit.meta.total, 1);
    assert.equal(audit.data[0].outcome, 'success');
    assert.match(audit.data[0].description, /rows=125/);
    assert.ok(
      !exported.body.includes('"audit.export"'),
      'audit receipt is written after export snapshot',
    );
  } finally {
    await app.close();
  }
});

test('audit CSV neutralises formula markers after whitespace and preserves quoted newlines', () => {
  for (const value of ['=1+1', '+1', '-1', '@SUM(A1)', '  =1', '\tvalue', '\rvalue', '\nvalue']) {
    const event: AuditEvent = {
      id: 'id',
      actorId: 'actor',
      actorName: value,
      action: 'action',
      targetType: 'test',
      targetId: 'target',
      occurredAt: '2026-09-28T00:00:00Z',
      outcome: 'success',
      description: 'description',
    };
    assert.ok(
      auditCsv([event]).includes(String.fromCharCode(34, 39) + value + String.fromCharCode(34)),
      JSON.stringify(value),
    );
  }
});

test('audit migration preserves old event content and enables failed outcomes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE identities(id TEXT PRIMARY KEY);
      INSERT INTO identities VALUES('actor');
      CREATE TABLE audit_events(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES identities(id),action TEXT,
        target_type TEXT,target_id TEXT,occurred_at TEXT,outcome TEXT CHECK(outcome IN ('success','denied','planned')),description TEXT);
      INSERT INTO audit_events VALUES('old','actor','read','patient','PAT-001','2026-09-28T00:00:00Z','denied','Keep this event');
    `);
    const before = db.prepare('SELECT * FROM audit_events').get();
    db.exec(auditEvolutionMigration.sql);
    assert.deepEqual(db.prepare("SELECT * FROM audit_events WHERE id='old'").get(), before);
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?)').run(
      'new',
      'actor',
      'write',
      'patient',
      'PAT-001',
      '2026-09-28T00:01:00Z',
      'failed',
      'Metadata only',
    );
    assert.equal(db.prepare('SELECT COUNT(*) total FROM audit_events').get()!.total, 2);
    assert.ok(
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='index' AND name='audit_events_actor_instant'",
        )
        .get(),
    );
  } finally {
    db.close();
  }
});

test('oversized audit exports are rejected and audited without silently truncating data', async () => {
  const { app, db } = fixture();
  try {
    const insert = db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?)');
    db.exec('BEGIN');
    for (let i = 0; i < 50_001; i++)
      insert.run(
        'bulk-' + i,
        'doctor-demo-001',
        'bulk.export',
        'audit-test',
        'target',
        '2026-09-28T00:00:00Z',
        'success',
        'Metadata only',
      );
    db.exec('COMMIT');
    const response = await app.inject('/api/v1/audit/export?action=bulk.export');
    assert.equal(response.statusCode, 413);
    assert.equal(response.json().error.code, 'AUDIT_EXPORT_TOO_LARGE');
    assert.equal(response.headers['content-disposition'], undefined);
    const logged = (await app.inject('/api/v1/audit?action=audit.export')).json();
    assert.equal(logged.data[0].outcome, 'denied');
  } finally {
    await app.close();
  }
});

test('audit query and export require a live session and ignore caller identity headers', async () => {
  const db = openDatabase(':memory:');
  const platform = new SqlitePlatformRepository(db);
  platform.recordAccess({
    actorId: 'doctor-demo-001',
    action: 'isolation.case',
    targetType: 'audit-test',
    targetId: 'ONLY-LIN',
    outcome: 'success',
    description: 'Metadata only',
  });
  platform.recordAccess({
    actorId: 'doctor-demo-002',
    action: 'isolation.case',
    targetType: 'audit-test',
    targetId: 'ONLY-ZHOU',
    outcome: 'failed',
    description: 'Metadata only',
  });
  const app = await createApp({ runtime: 'local-demo', database: db, reminderPollingMs: 0 });
  try {
    assert.equal((await app.inject('/api/v1/audit')).statusCode, 401);
    assert.equal((await app.inject('/api/v1/audit/export')).statusCode, 401);
    const loggedIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-login',
      payload: { account: 'lin.zhiyuan', password: '123456' },
    });
    assert.equal(loggedIn.statusCode, 201, loggedIn.body);
    const headers = {
      authorization: 'Bearer ' + loggedIn.json().data.token,
      'x-doctor-id': 'doctor-demo-002',
    };
    const query = await app.inject({ url: '/api/v1/audit?action=isolation.case', headers });
    assert.equal(query.statusCode, 200, query.body);
    assert.equal(query.json().meta.total, 1);
    assert.equal(query.json().data[0].targetId, 'ONLY-LIN');
    const csv = await app.inject({ url: '/api/v1/audit/export?action=isolation.case', headers });
    assert.equal(csv.statusCode, 200, csv.body);
    assert.ok(csv.body.includes('ONLY-LIN'));
    assert.ok(!csv.body.includes('ONLY-ZHOU'));
    await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers });
    assert.equal((await app.inject({ url: '/api/v1/audit/export', headers })).statusCode, 401);
  } finally {
    await app.close();
    db.close();
  }
});
