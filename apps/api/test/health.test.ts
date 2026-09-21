import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { seedHealthDemo } from '../src/health/fixtures.js';
import { SqliteHealthRepository } from '../src/health/repository.js';
import {
  CommandConflict,
  HealthResourceNotFound,
  HealthService,
  InvalidReminderState,
  StaleVersion,
} from '../src/health/service.js';
import type { HealthAuditEvent, PatientSummaryPort } from '../src/health/ports.js';
import { SqlitePatientAccess } from '../src/platform/access.js';
import { SqlitePatientRepository } from '../src/patients/repository.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';
import { createApp } from '../src/app.js';

test('health migrations and fixtures are additive and idempotent', () => {
  const db = openDatabase(':memory:');
  try {
    const access = new SqlitePatientAccess(db);
    assert.equal(
      access.isResponsibleDoctor('PAT-001', {
        actorId: DEMO_DOCTOR_ID,
        now: '2026-09-13T09:00:00+08:00',
      }),
      true,
    );
    assert.equal(
      access.isResponsibleDoctor('PAT-001', {
        actorId: 'doctor-demo-002',
        now: '2026-09-13T09:00:00+08:00',
      }),
      false,
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) count FROM schema_migrations WHERE version=7').get()!.count,
      1,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(
      db.prepare('SELECT COUNT(DISTINCT patient_id) count FROM health_observations').get()!.count,
      8,
    );

    db.prepare(
      `INSERT INTO health_observations(
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label
    ) VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(
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

test('health HTTP routes persist writes, replay commands and reject stale or invalid input', async () => {
  const app = await createApp({ now: () => '2026-09-13T09:15:00+08:00' });
  try {
    const observationInput = {
      commandId: 'cmd-obs-route-1',
      patientId: 'PAT-001',
      metric: 'systolic',
      value: 132,
      unit: 'mmHg',
      measuredAt: '2026-09-13T08:00:00+08:00',
      source: 'manual-entry',
      sourceLabel: '医生手工录入',
      externalObservationId: 'manual-device-reading-001',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: observationInput,
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.qualityStatus, 'recorded');
    assert.equal(created.json().data.recordedBy, DEMO_DOCTOR_ID);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: observationInput,
    });
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.json().data.id, created.json().data.id);
    assert.equal(created.json().data.externalObservationId, 'manual-device-reading-001');
    const sourceDuplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: { ...observationInput, commandId: 'cmd-obs-route-duplicate-source' },
    });
    assert.equal(sourceDuplicate.statusCode, 201, sourceDuplicate.body);
    assert.equal(sourceDuplicate.json().data.id, created.json().data.id);
    const list = await app.inject('/api/v1/health/observations?patientId=PAT-001&metric=systolic');
    assert.ok(
      list.json().data.items.some((item: { id: string }) => item.id === created.json().data.id),
    );

    const deviceCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: {
        ...observationInput,
        commandId: 'cmd-obs-device-1',
        value: 148,
        measuredAt: '2026-09-13T08:30:00+08:00',
        source: 'device-simulator',
        sourceLabel: '患者家用血压计',
        externalObservationId: 'device-reading-001',
      },
    });
    assert.equal(deviceCreated.statusCode, 201, deviceCreated.body);
    assert.equal(deviceCreated.json().data.qualityStatus, 'pending-confirmation');

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/health/observations/${deviceCreated.json().data.id}/confirm`,
      payload: {
        commandId: 'cmd-obs-confirm-1',
        value: 142,
        measuredAt: '2026-09-13T08:31:00+08:00',
        note: '与患者核对后更正录入值',
      },
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    assert.equal(confirmed.json().data.value, 142);
    assert.equal(confirmed.json().data.qualityStatus, 'confirmed');
    assert.equal(confirmed.json().data.confirmedBy, DEMO_DOCTOR_ID);
    assert.equal(confirmed.json().data.confirmedAt, '2026-09-13T09:15:00+08:00');

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/health/observations/${deviceCreated.json().data.id}/confirmations`,
    });
    assert.equal(history.statusCode, 200, history.body);
    assert.equal(history.json().data.length, 1);
    assert.equal(history.json().data[0].before.value, 148);
    assert.equal(history.json().data[0].after.value, 142);
    assert.equal(history.json().data[0].confirmedBy, DEMO_DOCTOR_ID);

    const invalidUnit = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: { ...observationInput, commandId: 'cmd-obs-route-2', unit: 'kg' },
    });
    assert.equal(invalidUnit.statusCode, 400);
    assert.equal(invalidUnit.json().error.code, 'INVALID_REQUEST');
    const invalidDate = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: {
        ...observationInput,
        commandId: 'cmd-obs-route-invalid-date',
        externalObservationId: 'invalid-date-reading',
        measuredAt: 'not-a-date',
      },
    });
    assert.equal(invalidDate.statusCode, 400);
    const impossibleDate = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: {
        ...observationInput,
        commandId: 'cmd-obs-route-impossible-date',
        externalObservationId: 'impossible-date-reading',
        measuredAt: '2026-02-30T08:00:00+08:00',
      },
    });
    assert.equal(impossibleDate.statusCode, 400);
    const invalidValue = await app.inject({
      method: 'POST',
      url: '/api/v1/health/observations',
      payload: {
        ...observationInput,
        commandId: 'cmd-obs-route-invalid-value',
        externalObservationId: 'invalid-value-reading',
        value: 999,
      },
    });
    assert.equal(invalidValue.statusCode, 400);
    assert.equal(
      (await app.inject('/api/v1/health/observations?patientId=PAT-001&from=not-a-date'))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject(
          '/api/v1/health/observations?patientId=PAT-001&from=2026-02-30T08%3A00%3A00%2B08%3A00',
        )
      ).statusCode,
      400,
    );
    const scopedOverview = await app.inject('/api/v1/health/overview?patientId=PAT-001');
    assert.equal(scopedOverview.statusCode, 200, scopedOverview.body);
    assert.ok(
      scopedOverview
        .json()
        .data.observations.every((item: { patientId: string }) => item.patientId === 'PAT-001'),
    );
    assert.equal(
      (await app.inject('/api/v1/health/overview?patientId=PAT-RESTRICTED')).statusCode,
      404,
    );
    const healthPatients = await app.inject('/api/v1/health/patients?q=PAT-001');
    assert.equal(healthPatients.statusCode, 200, healthPatients.body);
    assert.deepEqual(Object.keys(healthPatients.json().data[0]).sort(), [
      'age',
      'avatarInitials',
      'diagnosis',
      'gender',
      'id',
      'name',
      'nextFollowUp',
    ]);

    const planInput = {
      commandId: 'cmd-plan-route-1',
      patientId: 'PAT-001',
      title: '居家记录计划',
      goals: ['每天记录一次'],
      nextReview: '2026-09-24',
    };
    const plan = await app.inject({
      method: 'POST',
      url: '/api/v1/health/plans',
      payload: planInput,
    });
    assert.equal(plan.statusCode, 201, plan.body);
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/plans/${plan.json().data.id}`,
      payload: {
        commandId: 'cmd-plan-route-2',
        expectedVersion: 99,
        title: '修订计划',
        status: 'active',
        goals: ['复核记录'],
        nextReview: '2026-09-25',
        completionPercent: 20,
      },
    });
    assert.equal(stale.statusCode, 412);
    assert.equal(stale.json().error.code, 'STALE_VERSION');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/plans/${plan.json().data.id}`,
      payload: {
        commandId: 'cmd-plan-route-update',
        expectedVersion: 1,
        title: '居家记录计划（已复核）',
        status: 'active',
        goals: ['每天记录一次', '复诊时核对'],
        nextReview: '2026-09-26',
        completionPercent: 20,
      },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.version, 2);
    const versions = await app.inject(`/api/v1/health/plans/${plan.json().data.id}/versions`);
    assert.equal(versions.statusCode, 200);
    assert.equal(versions.json().data.length, 2);

    const assessment = await app.inject({
      method: 'POST',
      url: '/api/v1/health/assessments',
      payload: {
        commandId: 'cmd-assessment-route-1',
        patientId: 'PAT-001',
        planId: plan.json().data.id,
        assessedAt: '2026-09-13T09:30:00+08:00',
        summary: '医生手工评估记录。',
        recommendations: ['保持记录', '复诊时复核'],
        nextReview: '2026-09-26',
      },
    });
    assert.equal(assessment.statusCode, 201, assessment.body);
    const assessments = await app.inject('/api/v1/health/assessments?patientId=PAT-001');
    assert.ok(
      assessments.json().data.some((item: { id: string }) => item.id === assessment.json().data.id),
    );

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/health/plans',
      payload: { ...planInput, title: '不能复用命令号' },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'COMMAND_CONFLICT');

    const reminder = await app.inject({
      method: 'POST',
      url: '/api/v1/health/reminders',
      payload: {
        commandId: 'cmd-rem-route-1',
        patientId: 'PAT-001',
        channel: 'in-app',
        templateId: 'followup-demo',
        scheduledAt: '2026-09-16T09:00:00+08:00',
      },
    });
    assert.equal(reminder.statusCode, 201);
    assert.equal(reminder.json().data.status, 'planned');
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/health/reminders/${reminder.json().data.id}/cancel`,
      payload: { commandId: 'cmd-rem-route-2' },
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().data.status, 'cancelled');
  } finally {
    await app.close();
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
        return patient
          ? {
              id: patient.id,
              name: patient.name,
              gender: patient.gender,
              age: patient.age,
              diagnosis: patient.diagnosis,
              nextFollowUp: patient.nextFollowUp,
              avatarInitials: patient.name.slice(0, 1),
            }
          : undefined;
      },
      search(query, context) {
        return patients
          .list({ q: query || undefined, pageSize: 8 }, context)
          .items.map((patient) => ({
            id: patient.id,
            name: patient.name,
            gender: patient.gender,
            age: patient.age,
            diagnosis: patient.diagnosis,
            nextFollowUp: patient.nextFollowUp,
            avatarInitials: patient.name.slice(0, 1),
          }));
      },
    };
    const service = new HealthService(
      new SqliteHealthRepository(db),
      new SqlitePatientAccess(db),
      patientSummaries,
      {
        record(event) {
          auditEvents.push(event);
        },
      },
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
      () =>
        service.updatePlan(
          created.id,
          {
            commandId: 'cmd-plan-2',
            expectedVersion: 99,
            title: '修订',
            goals: ['复核'],
            nextReview: '2026-09-21',
            status: 'active',
            completionPercent: 10,
          },
          context,
        ),
      StaleVersion,
    );
    assert.throws(() => service.listPlans('PAT-RESTRICTED', context), HealthResourceNotFound);
    assert.throws(() => service.listPlans('PAT-MISSING', context), HealthResourceNotFound);
    assert.ok(
      auditEvents.some(
        (event) => event.outcome === 'denied' && event.resourceId === 'PAT-RESTRICTED',
      ),
    );
    assert.deepEqual(Object.keys(auditEvents[0]!).sort(), [
      'action',
      'actorId',
      'occurredAt',
      'outcome',
      'resourceId',
      'resourceType',
    ]);
    assert.ok(!JSON.stringify(auditEvents).includes('家庭血压随访'));
  } finally {
    db.close();
  }
});

test('reminder delivery uses a durable claim and a stable provider idempotency key', async () => {
  const db = openDatabase(':memory:');
  try {
    const patients = new SqlitePatientRepository(db);
    const summaries: PatientSummaryPort = {
      find(patientId, context) {
        const patient = patients.findById(patientId, context);
        return patient
          ? {
              id: patient.id,
              name: patient.name,
              gender: patient.gender,
              age: patient.age,
              diagnosis: patient.diagnosis,
              nextFollowUp: patient.nextFollowUp,
              avatarInitials: patient.name.slice(0, 1),
            }
          : undefined;
      },
      search() {
        return [];
      },
    };
    let sends = 0;
    let providerKey = '';
    const service = new HealthService(
      new SqliteHealthRepository(db),
      new SqlitePatientAccess(db),
      summaries,
      undefined,
      {
        async send(_task, options) {
          sends += 1;
          providerKey = options.idempotencyKey;
          return { providerMessageId: 'provider-demo-001' };
        },
      },
    );
    const context = { actorId: DEMO_DOCTOR_ID, now: '2026-09-13T12:00:00+08:00' };
    const reminder = service.createReminder(
      {
        commandId: 'cmd-delivery-create',
        patientId: 'PAT-001',
        channel: 'in-app',
        templateId: 'followup-demo',
        scheduledAt: '2026-09-14T09:00:00+08:00',
      },
      context,
    );
    const sent = await service.retryReminder(reminder.id, 'cmd-delivery-retry', context);
    assert.equal(sent.status, 'sent');
    assert.equal(providerKey, `health-reminder:${DEMO_DOCTOR_ID}:cmd-delivery-retry`);
    assert.equal(
      (await service.retryReminder(reminder.id, 'cmd-delivery-retry', context)).id,
      sent.id,
    );
    assert.equal(sends, 1);
    assert.throws(
      () => service.cancelReminder(reminder.id, 'cmd-delivery-cancel-sent', context),
      InvalidReminderState,
    );
  } finally {
    db.close();
  }
});
