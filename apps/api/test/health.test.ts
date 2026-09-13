import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { seedHealthDemo } from '../src/health/fixtures.js';
import { SqliteHealthRepository } from '../src/health/repository.js';
import {
  CommandConflict,
  HealthResourceNotFound,
  HealthService,
  StaleVersion,
} from '../src/health/service.js';
import type { HealthAuditEvent, PatientSummaryPort } from '../src/health/ports.js';
import { SqlitePatientAccess } from '../src/platform/access.js';
import { SqlitePatientRepository } from '../src/patients/repository.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';

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

test('health service scopes patients and enforces idempotent versioned plan writes', () => {
  const db = openDatabase(':memory:');
  const auditEvents: HealthAuditEvent[] = [];
  try {
    const patients = new SqlitePatientRepository(db);
    const patientSummaries: PatientSummaryPort = {
      find(patientId, context) {
        const patient = patients.findById(patientId, context);
        return patient ? { id: patient.id, name: patient.name } : undefined;
      },
    };
    const service = new HealthService(
      new SqliteHealthRepository(db),
      new SqlitePatientAccess(db),
      patientSummaries,
      { record(event) { auditEvents.push(event); } },
    );
    const context = { actorId: DEMO_DOCTOR_ID, now: '2026-09-13T09:00:00+08:00' };
    const input = {
      commandId: 'cmd-plan-1',
      patientId: 'PAT-001',
      title: '家庭血压随访',
      goals: ['每日记录'],
      nextReview: '2026-09-20',
    };

    const created = service.createPlan(input, context);
    assert.equal(service.createPlan(input, context).id, created.id);
    assert.throws(
      () => service.createPlan({ ...input, title: '不同内容' }, context),
      CommandConflict,
    );
    assert.throws(
      () => service.updatePlan(created.id, {
        commandId: 'cmd-plan-2',
        expectedVersion: 99,
        title: '修订',
        goals: ['复核'],
        nextReview: '2026-09-21',
        status: 'active',
        completionPercent: 10,
      }, context),
      StaleVersion,
    );
    assert.throws(() => service.listPlans('PAT-RESTRICTED', context), HealthResourceNotFound);
    assert.throws(() => service.listPlans('PAT-MISSING', context), HealthResourceNotFound);
    assert.deepEqual(Object.keys(auditEvents[0]!).sort(), [
      'action', 'actorId', 'occurredAt', 'outcome', 'resourceId', 'resourceType',
    ]);
    assert.ok(!JSON.stringify(auditEvents).includes('家庭血压随访'));
  } finally {
    db.close();
  }
});
