import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { seedHealthDemo } from '../src/health/fixtures.js';

test('health migration 7 and fixtures are additive and idempotent', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(
      db.prepare('SELECT COUNT(*) count FROM schema_migrations WHERE version=7').get()!.count,
      1,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(
      db.prepare('SELECT COUNT(DISTINCT patient_id) count FROM health_observations').get()!.count,
      8,
    );

    db.prepare(`INSERT INTO health_observations(
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      'OBS-MANUAL-TEST',
      'PAT-001',
      'heart-rate',
      72,
      'bpm',
      '2026-09-10T09:00:00+08:00',
      '2026-09-10T09:00:05+08:00',
      'manual-entry',
      '医生手动录入',
    );

    const before = db.prepare('SELECT COUNT(*) count FROM health_observations').get()!.count;
    seedHealthDemo(db);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM health_observations').get()!.count, before);
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM care_plans').get()!.count) >= 8);
    assert.ok(
      Number(db.prepare('SELECT COUNT(*) count FROM health_assessments').get()!.count) >= 12,
    );
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM reminder_tasks').get()!.count) >= 20);
  } finally {
    db.close();
  }
});
