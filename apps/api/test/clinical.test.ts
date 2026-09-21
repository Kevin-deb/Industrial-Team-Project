import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  type CreateMedicalRecordRequest,
  type MedicalRecordTemplateId,
  type MedicalRecordVersion,
} from '@doctor/contracts';
import { createApp } from '../src/app.js';
import { migrations, openDatabase } from '../src/database/connection.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';
import { medicalOrderTemplates } from '../src/clinical/order-templates.js';
import { clinicalTemplateFields, medicalRecordTemplates } from '../src/clinical/templates.js';

function body(templateId: MedicalRecordTemplateId, value = ''): Record<string, string> {
  return Object.fromEntries(clinicalTemplateFields[templateId].map((key) => [key, value]));
}

function draft(
  templateId: MedicalRecordTemplateId,
  overrides: Partial<CreateMedicalRecordRequest> = {},
): CreateMedicalRecordRequest {
  return {
    patientId: 'PAT-001',
    encounterId: 'ENC-001',
    templateId,
    title: `${templateId} draft`,
    diagnosis: 'Synthetic diagnosis',
    body: body(templateId),
    ...overrides,
  };
}

test('all structured templates create durable drafts and expose compatible summaries', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'carelink-clinical-'));
  const databasePath = join(folder, 'clinical.sqlite');
  const ids: string[] = [];
  try {
    const app = await createApp({ databasePath, now: () => '2026-09-13T10:00:00.000Z' });
    try {
      for (const templateId of Object.keys(clinicalTemplateFields) as MedicalRecordTemplateId[]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/records',
          payload: draft(templateId, { encounterId: undefined }),
        });
        assert.equal(response.statusCode, 201, response.body);
        assert.equal(response.headers.etag, '"record-v1"');
        assert.equal(response.json().data.templateId, templateId);
        ids.push(response.json().data.id);
      }
      const list = (await app.inject('/api/v1/records')).json().data;
      assert.ok(ids.every((id) => list.some((record: { id: string }) => record.id === id)));
    } finally {
      await app.close();
    }
    const reopened = await createApp({ databasePath });
    try {
      for (const id of ids)
        assert.equal((await reopened.inject(`/api/v1/records/${id}`)).statusCode, 200);
    } finally {
      await reopened.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('template catalogue and scoped record filters expose one stable public boundary', async () => {
  const app = await createApp();
  try {
    const templates = await app.inject('/api/v1/record-templates');
    assert.equal(templates.statusCode, 200);
    assert.deepEqual(templates.json().data, medicalRecordTemplates);
    const orderTemplates = await app.inject('/api/v1/order-templates');
    assert.equal(orderTemplates.statusCode, 200);
    assert.deepEqual(orderTemplates.json().data, medicalOrderTemplates);

    const patient = (await app.inject('/api/v1/records?patientId=PAT-001')).json().data;
    assert.ok(patient.length > 0);
    assert.ok(patient.every((record: { patientId: string }) => record.patientId === 'PAT-001'));

    const linkedDraft = await app.inject({
      method: 'POST',
      url: '/api/v1/records',
      payload: draft('outpatient'),
    });
    assert.equal(linkedDraft.statusCode, 201, linkedDraft.body);
    const encounter = (await app.inject('/api/v1/records?encounterId=ENC-001')).json().data;
    assert.deepEqual(
      encounter.map((record: { id: string }) => record.id),
      [linkedDraft.json().data.id],
    );

    const archived = (await app.inject('/api/v1/records?status=archived')).json().data;
    assert.ok(archived.length > 0);
    assert.ok(archived.every((record: { status: string }) => record.status === 'archived'));

    assert.deepEqual(
      (await app.inject('/api/v1/records?patientId=PAT-RESTRICTED')).json().data,
      [],
    );
    for (const query of ['status=unknown', 'unknown=value', `patientId=${'x'.repeat(81)}`]) {
      const response = await app.inject('/api/v1/records?' + query);
      assert.equal(response.statusCode, 400, query);
      assert.equal(response.json().error.code, 'INVALID_REQUEST');
    }

    const seeded = (await app.inject('/api/v1/records/REC-001')).json().data;
    assert.equal(seeded.templateId, 'followup');
    assert.equal(seeded.templateVersion, 1);
    assert.deepEqual(Object.keys(seeded.body), clinicalTemplateFields.followup);
    assert.equal(seeded.availableActions.canEdit, true);
    assert.equal(seeded.availableActions.canSubmit, false);
  } finally {
    await app.close();
  }
});

test('version 16 databases upgrade legacy record templates without rewriting migration 4', () => {
  const legacy = new DatabaseSync(':memory:');
  try {
    legacy.exec('PRAGMA foreign_keys=ON');
    legacy.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const migration of migrations.filter((item) => item.version < 17)) {
      legacy.exec(migration.sql);
      legacy
        .prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)')
        .run(migration.version, migration.name, '2026-09-13T00:00:00.000Z');
    }
    legacy
      .prepare(
        'INSERT INTO identities(id,display_name,title,department,hospital,avatar_initials) VALUES(?,?,?,?,?,?)',
      )
      .run(DEMO_DOCTOR_ID, '林知远', '主任医师', '全科医学科', '演示机构', '林');
    legacy
      .prepare(
        `INSERT INTO patients(
        id,name,gender,age,phone,diagnosis,tags_json,status,last_visit,next_follow_up,
        assigned_doctor_id,allergies_json,medical_history_json,care_summary
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'PAT-001',
        '陈建国',
        '男',
        68,
        '138****0021',
        '高血压',
        '[]',
        'stable',
        '2026-09-10',
        '2026-09-20',
        DEMO_DOCTOR_ID,
        '[]',
        '[]',
        'Synthetic',
      );
    legacy
      .prepare(
        `INSERT INTO medical_records(
        id,patient_id,title,diagnosis,status,author_id,updated_at,version,archived_at
      ) VALUES(?,?,?,?,?,?,?,?,NULL)`,
      )
      .run(
        'REC-001',
        'PAT-001',
        '高血压随访记录',
        '高血压',
        'draft',
        DEMO_DOCTOR_ID,
        '2026-09-10T08:45:00+08:00',
        1,
      );
    legacy
      .prepare(
        `INSERT INTO medical_record_versions(
        id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason
      ) VALUES(?,?,?,?,?,?,?,NULL)`,
      )
      .run(
        'version-REC-001',
        'REC-001',
        1,
        'general-followup-v1',
        JSON.stringify({ chiefComplaint: 'Legacy synthetic text', synthetic: true }),
        DEMO_DOCTOR_ID,
        '2026-09-10T08:45:00+08:00',
      );
    const evolution = migrations.find((item) => item.version === 17)!;
    legacy.exec(evolution.sql);
    legacy
      .prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)')
      .run(evolution.version, evolution.name, '2026-09-13T01:00:00.000Z');

    const row = legacy
      .prepare(
        "SELECT template_id,template_version,title,diagnosis,body_json FROM medical_record_versions WHERE record_id='REC-001'",
      )
      .get()!;
    assert.equal(row.template_id, 'followup');
    assert.equal(row.template_version, 1);
    assert.equal(row.title, '高血压随访记录');
    assert.equal(row.diagnosis, '高血压');
    assert.deepEqual(
      Object.keys(JSON.parse(String(row.body_json))),
      clinicalTemplateFields.followup,
    );
    assert.equal(
      legacy.prepare('SELECT name FROM schema_migrations WHERE version=4').get()!.name,
      'clinical_records_orders_and_hierarchical_reviews',
    );
  } finally {
    legacy.close();
  }
});

test('draft updates append versions and reject missing or stale preconditions', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db, now: () => '2026-09-13T11:00:00.000Z' });
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/records',
      payload: draft('outpatient'),
    });
    const record = created.json().data;
    const payload = {
      title: 'Revised draft',
      diagnosis: 'Revised synthetic diagnosis',
      body: body('outpatient', 'updated'),
    };
    const missing = await app.inject({
      method: 'PATCH',
      url: `/api/v1/records/${record.id}`,
      payload,
    });
    assert.equal(missing.statusCode, 428);
    assert.equal(missing.json().error.code, 'VERSION_REQUIRED');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/records/${record.id}`,
      headers: { 'if-match': '"record-v1"' },
      payload,
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.headers.etag, '"record-v2"');
    assert.equal(updated.json().data.version, 2);

    const historyResponse = await app.inject(`/api/v1/records/${record.id}/versions`);
    assert.equal(historyResponse.statusCode, 200, historyResponse.body);
    const history = historyResponse.json().data as MedicalRecordVersion[];
    assert.deepEqual(
      history.map((item) => [item.version, item.title, item.diagnosis, item.templateVersion]),
      [
        [2, payload.title, payload.diagnosis, 1],
        [1, 'outpatient draft', 'Synthetic diagnosis', 1],
      ],
    );
    assert.equal(history[0]!.body.chiefComplaint, 'updated');
    const firstVersion = await app.inject(`/api/v1/records/${record.id}/versions/1`);
    assert.equal(firstVersion.statusCode, 200);
    assert.equal(firstVersion.headers.etag, '"record-v1"');
    assert.equal(firstVersion.json().data.title, 'outpatient draft');

    const beforeStale = db.prepare('SELECT total_changes() changes').get()!.changes;
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/records/${record.id}`,
      headers: { 'if-match': '"record-v1"' },
      payload,
    });
    assert.equal(stale.statusCode, 412);
    assert.equal(stale.headers.etag, '"record-v2"');
    assert.equal(stale.json().error.code, 'STALE_RECORD_VERSION');
    assert.equal(db.prepare('SELECT total_changes() changes').get()!.changes, beforeStale);

    const versions = db
      .prepare(
        'SELECT version,authored_by FROM medical_record_versions WHERE record_id=? ORDER BY version',
      )
      .all(record.id);
    assert.deepEqual(
      versions.map((version) => [version.version, version.authored_by]),
      [
        [1, DEMO_DOCTOR_ID],
        [2, DEMO_DOCTOR_ID],
      ],
    );
  } finally {
    await app.close();
    db.close();
  }
});

test('clinical writes enforce patient scope, encounter ownership and template shape', async () => {
  const app = await createApp();
  try {
    const cases = [
      {
        payload: draft('outpatient', { patientId: 'PAT-RESTRICTED', encounterId: undefined }),
        status: 404,
        code: 'PATIENT_NOT_FOUND',
      },
      {
        payload: draft('outpatient', { encounterId: 'ENC-002' }),
        status: 404,
        code: 'ENCOUNTER_NOT_FOUND',
      },
      {
        payload: draft('outpatient', { title: '   ', encounterId: undefined }),
        status: 422,
        code: 'INVALID_RECORD_FIELDS',
      },
      {
        payload: draft('outpatient', {
          encounterId: undefined,
          body: { ...body('outpatient'), unexpected: 'not allowed' },
        }),
        status: 422,
        code: 'INVALID_RECORD_BODY',
      },
      {
        payload: draft('outpatient', {
          encounterId: undefined,
          body: { ...body('outpatient'), chiefComplaint: 'x'.repeat(5001) },
        }),
        status: 400,
        code: 'INVALID_REQUEST',
      },
    ];
    for (const item of cases) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/records',
        payload: item.payload,
      });
      assert.equal(response.statusCode, item.status, response.body);
      assert.equal(response.json().error.code, item.code);
    }
  } finally {
    await app.close();
  }
});

test('non-draft records stay read-only and order writes require an idempotency key', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    db.prepare("UPDATE medical_records SET status='pending-review' WHERE id='REC-001'").run();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/records/REC-001',
      headers: { 'if-match': '"record-v1"' },
      payload: {
        title: 'Cannot edit',
        diagnosis: 'Synthetic',
        body: body('followup'),
      },
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().error.code, 'RECORD_NOT_EDITABLE');
    const missingKey = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-001/orders',
      payload: { templateId: 'examination', payload: {}, confirmed: true },
    });
    assert.equal(missingKey.statusCode, 428);
    assert.equal(missingKey.json().error.code, 'IDEMPOTENCY_KEY_REQUIRED');
  } finally {
    await app.close();
    db.close();
  }
});

function lifecycleHeaders(version: number, key = randomUUID()) {
  return { 'if-match': `"record-v${version}"`, 'idempotency-key': key };
}

test('record submit, review, archive and correction follow the local lifecycle', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db, now: () => '2026-09-21T10:00:00.000Z' });
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/records',
      payload: draft('outpatient', {
        encounterId: undefined,
        body: body('outpatient', 'complete'),
      }),
    });
    assert.equal(created.statusCode, 201, created.body);
    const record = created.json().data;
    assert.equal(record.availableActions.canSubmit, true);

    const missingKey = await app.inject({
      method: 'POST',
      url: `/api/v1/records/${record.id}/submit`,
      headers: { 'if-match': '"record-v1"' },
      payload: {},
    });
    assert.equal(missingKey.statusCode, 428);
    assert.equal(missingKey.json().error.code, 'IDEMPOTENCY_KEY_REQUIRED');

    const incomplete = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-001/submit',
      headers: lifecycleHeaders(1),
      payload: {},
    });
    assert.equal(incomplete.statusCode, 422);
    assert.equal(incomplete.json().error.code, 'RECORD_INCOMPLETE');

    const submitKey = randomUUID();
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/records/${record.id}/submit`,
      headers: lifecycleHeaders(1, submitKey),
      payload: {},
    });
    assert.equal(submitted.statusCode, 200, submitted.body);
    assert.equal(submitted.json().data.status, 'pending-review');
    assert.equal(submitted.json().data.availableActions.canEdit, false);
    assert.equal(submitted.json().data.availableActions.canReview, false);

    const replayed = await app.inject({
      method: 'POST',
      url: `/api/v1/records/${record.id}/submit`,
      headers: lifecycleHeaders(1, submitKey),
      payload: {},
    });
    assert.equal(replayed.statusCode, 200);
    assert.equal(replayed.json().data.status, 'pending-review');

    const selfReview = await app.inject({
      method: 'POST',
      url: `/api/v1/records/${record.id}/reviews`,
      headers: lifecycleHeaders(1),
      payload: { decision: 'approved', comment: 'should fail' },
    });
    assert.equal(selfReview.statusCode, 403);
    assert.equal(selfReview.json().error.code, 'RECORD_REVIEW_OWN_VERSION');

    const reviewed = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-002/reviews',
      headers: lifecycleHeaders(1),
      payload: { decision: 'returned', comment: '请补充监测数据' },
    });
    assert.equal(reviewed.statusCode, 200, reviewed.body);
    assert.equal(reviewed.json().data.status, 'draft');
    assert.equal(reviewed.json().data.latestReview.decision, 'returned');
    assert.equal(reviewed.json().data.availableActions.canEdit, false);

    const reviewKey = randomUUID();
    const approved = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-003/reviews',
      headers: lifecycleHeaders(1, reviewKey),
      payload: { decision: 'approved', comment: '合成批准' },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(approved.json().data.status, 'pending-review');
    assert.equal(approved.json().data.latestReview.decision, 'approved');
    assert.equal(approved.json().data.availableActions.canArchive, true);
    assert.equal(approved.json().data.availableActions.canReview, false);

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-003/reviews',
      headers: lifecycleHeaders(1, reviewKey),
      payload: { decision: 'returned', comment: '不同意见' },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'IDEMPOTENCY_KEY_CONFLICT');

    const ordersBefore = db.prepare('SELECT id,status FROM medical_orders ORDER BY id').all();
    const archived = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-003/archive',
      headers: lifecycleHeaders(1),
      payload: {},
    });
    assert.equal(archived.statusCode, 200, archived.body);
    assert.equal(archived.json().data.status, 'archived');
    assert.deepEqual(
      db.prepare('SELECT id,status FROM medical_orders ORDER BY id').all(),
      ordersBefore,
    );

    const unapprovedArchive = await app.inject({
      method: 'POST',
      url: `/api/v1/records/${record.id}/archive`,
      headers: lifecycleHeaders(1),
      payload: {},
    });
    assert.equal(unapprovedArchive.statusCode, 409);
    assert.equal(unapprovedArchive.json().error.code, 'RECORD_NOT_ARCHIVABLE');

    const corrected = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-004/corrections',
      headers: lifecycleHeaders(1),
      payload: { reason: '归档后补充随访安排' },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    assert.equal(corrected.json().data.status, 'draft');
    assert.equal(corrected.json().data.version, 2);
    assert.equal(corrected.json().data.amendmentReason, '归档后补充随访安排');
    assert.equal(corrected.json().data.availableActions.canEdit, true);
    const archivedVersion = await app.inject('/api/v1/records/REC-004/versions/1');
    assert.equal(archivedVersion.statusCode, 200);
    assert.equal(archivedVersion.json().data.amendmentReason, null);
    assert.equal(
      db.prepare("SELECT status FROM medical_records WHERE id='REC-004'").get()!.status,
      'draft',
    );
  } finally {
    await app.close();
    db.close();
  }
});

test('record review requires the public clinical:review permission', async () => {
  const db = openDatabase(':memory:');
  db.prepare("DELETE FROM role_permissions WHERE permission='clinical:review'").run();
  const app = await createApp({ database: db });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-002/reviews',
      headers: lifecycleHeaders(1),
      payload: { decision: 'approved', comment: 'no permission' },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'RECORD_REVIEW_DENIED');
  } finally {
    await app.close();
    db.close();
  }
});

function orderHeaders(key = randomUUID(), version?: number) {
  return {
    'idempotency-key': key,
    ...(version ? { 'if-match': `"order-v${version}"` } : {}),
  };
}

function orderPayload(templateId: 'medication' | 'examination' | 'laboratory') {
  if (templateId === 'medication')
    return {
      drugName: '阿司匹林',
      dose: '100mg',
      frequency: 'qd',
      route: 'po',
      duration: '7d',
      instructions: '',
    };
  if (templateId === 'laboratory')
    return {
      testName: '血常规',
      specimen: '静脉血',
      indication: '随访复查',
      notes: '',
    };
  return {
    examName: '心电图',
    bodySite: '胸部',
    indication: '胸痛评估',
    notes: '',
  };
}

test('orders issue from independent templates, version on change, and stop without restart', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const listed = await app.inject('/api/v1/orders?recordId=REC-001');
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().data[0].id, 'ORD-001');
    assert.equal(listed.json().data[0].status, 'draft');
    const seeded = await app.inject('/api/v1/orders/ORD-001');
    assert.equal(seeded.statusCode, 200);
    assert.equal(seeded.headers.etag, '"order-v1"');
    assert.equal(seeded.json().data.templateId, 'examination');
    assert.deepEqual(Object.keys(seeded.json().data.payload), [
      'examName',
      'bodySite',
      'indication',
      'notes',
    ]);

    const unconfirmed = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-001/orders',
      headers: orderHeaders(),
      payload: {
        templateId: 'examination',
        payload: orderPayload('examination'),
        confirmed: false,
      },
    });
    assert.equal(unconfirmed.statusCode, 422);
    assert.equal(unconfirmed.json().error.code, 'ORDER_NOT_CONFIRMED');

    const created: { id: string; type: string }[] = [];
    for (const templateId of ['medication', 'examination', 'laboratory'] as const) {
      const key = randomUUID();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/records/REC-001/orders',
        headers: orderHeaders(key),
        payload: { templateId, payload: orderPayload(templateId), confirmed: true },
      });
      assert.equal(response.statusCode, 201, response.body);
      assert.equal(response.headers.etag, '"order-v1"');
      assert.equal(response.json().data.status, 'active');
      assert.equal(response.json().data.type, templateId);
      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/records/REC-001/orders',
        headers: orderHeaders(key),
        payload: { templateId, payload: orderPayload(templateId), confirmed: true },
      });
      assert.equal(replay.statusCode, 200);
      assert.equal(replay.json().data.id, response.json().data.id);
      const conflict = await app.inject({
        method: 'POST',
        url: '/api/v1/records/REC-001/orders',
        headers: orderHeaders(key),
        payload: {
          templateId,
          payload: {
            ...orderPayload(templateId),
            ...(templateId === 'medication' ? { dose: '999mg' } : { notes: 'changed' }),
          },
          confirmed: true,
        },
      });
      assert.equal(conflict.statusCode, 409, conflict.body);
      created.push(response.json().data);
    }

    const medication = created.find((item) => item.type === 'medication')!;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${medication.id}`,
      headers: { 'if-match': '"order-v1"' },
      payload: {
        payload: { ...orderPayload('medication'), dose: '200mg' },
        changeReason: '调整剂量',
      },
    });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(patched.headers.etag, '"order-v2"');
    assert.equal(patched.json().data.payload.dose, '200mg');
    const history = await app.inject(`/api/v1/orders/${medication.id}/versions`);
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().data.length, 2);

    const draftPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/orders/ORD-001',
      headers: { 'if-match': '"order-v1"' },
      payload: { payload: orderPayload('examination'), changeReason: 'seed' },
    });
    assert.equal(draftPatch.statusCode, 409);
    assert.equal(draftPatch.json().error.code, 'ORDER_NOT_ACTIVE');

    const stopKey = randomUUID();
    const stopped = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${medication.id}/stop`,
      headers: orderHeaders(stopKey, 2),
      payload: { reason: '患者拒服' },
    });
    assert.equal(stopped.statusCode, 200, stopped.body);
    assert.equal(stopped.json().data.status, 'stopped');
    const restart = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${medication.id}`,
      headers: { 'if-match': '"order-v2"' },
      payload: { payload: orderPayload('medication'), changeReason: 'restart' },
    });
    assert.equal(restart.statusCode, 409);
    assert.equal(restart.json().error.code, 'ORDER_NOT_ACTIVE');
    const restop = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${medication.id}/stop`,
      headers: orderHeaders(randomUUID(), 2),
      payload: { reason: '再次停止' },
    });
    assert.equal(restop.statusCode, 409);
    const stopConflict = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${medication.id}/stop`,
      headers: orderHeaders(stopKey, 2),
      payload: { reason: '不同原因' },
    });
    assert.equal(stopConflict.statusCode, 409);
    assert.equal(stopConflict.json().error.code, 'IDEMPOTENCY_KEY_CONFLICT');

    const active = (await app.inject('/api/v1/orders?patientId=PAT-001&status=active')).json().data;
    assert.ok(active.every((item: { status: string }) => item.status === 'active'));
    assert.deepEqual((await app.inject('/api/v1/orders?patientId=PAT-RESTRICTED')).json().data, []);
  } finally {
    await app.close();
    db.close();
  }
});

test('clinical materials reference approved record versions through C consultation ports', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db, now: () => '2026-09-21T10:00:00.000Z' });
  try {
    const unapproved = await app.inject({
      method: 'POST',
      url: '/api/v1/clinical-materials',
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        consultationId: 'CON-002',
        recordId: 'REC-002',
        recordVersion: 1,
        sharedSections: ['followUpPurpose'],
        purpose: '会诊摘要',
      },
    });
    assert.equal(unapproved.statusCode, 409, unapproved.body);
    assert.equal(unapproved.json().error.code, 'RECORD_VERSION_NOT_SHAREABLE');

    const approved = await app.inject({
      method: 'POST',
      url: '/api/v1/records/REC-003/reviews',
      headers: lifecycleHeaders(1),
      payload: { decision: 'approved', comment: '合成批准' },
    });
    assert.equal(approved.statusCode, 200, approved.body);

    const invalidSections = await app.inject({
      method: 'POST',
      url: '/api/v1/clinical-materials',
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        consultationId: 'CON-001',
        recordId: 'REC-003',
        recordVersion: 1,
        sharedSections: ['notAField'],
        purpose: '会诊摘要',
      },
    });
    assert.equal(invalidSections.statusCode, 422);
    assert.equal(invalidSections.json().error.code, 'INVALID_SHARED_SECTIONS');

    const createKey = randomUUID();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/clinical-materials',
      headers: { 'idempotency-key': createKey },
      payload: {
        consultationId: 'CON-001',
        recordId: 'REC-003',
        recordVersion: 1,
        sharedSections: ['followUpPurpose'],
        purpose: '会诊摘要',
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.recordVersion, 1);
    assert.equal(created.json().data.reportId, null);
    const replayed = await app.inject({
      method: 'POST',
      url: '/api/v1/clinical-materials',
      headers: { 'idempotency-key': createKey },
      payload: {
        consultationId: 'CON-001',
        recordId: 'REC-003',
        recordVersion: 1,
        sharedSections: ['followUpPurpose'],
        purpose: '会诊摘要',
      },
    });
    assert.equal(replayed.statusCode, 200);
    assert.equal(replayed.json().data.id, created.json().data.id);
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/clinical-materials',
      headers: { 'idempotency-key': createKey },
      payload: {
        consultationId: 'CON-001',
        recordId: 'REC-003',
        recordVersion: 1,
        sharedSections: ['healthMonitoringData'],
        purpose: '会诊摘要',
      },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, 'IDEMPOTENCY_KEY_CONFLICT');

    db.prepare(
      `INSERT INTO consultation_reports(
        id,consultation_id,version,body_json,status,confirmed_by,confirmed_at,created_at
      ) VALUES(?,?,?,?,?,?,?,?)`,
    ).run(
      'RPT-001',
      'CON-001',
      1,
      '{}',
      'confirmed',
      'doctor-demo-001',
      '2026-09-21T10:00:00.000Z',
      '2026-09-21T10:00:00.000Z',
    );
    db.prepare(
      `INSERT INTO consultation_reports(
        id,consultation_id,version,body_json,status,confirmed_by,confirmed_at,created_at
      ) VALUES(?,?,?,?,?,?,?,?)`,
    ).run('RPT-DRAFT', 'CON-001', 2, '{}', 'draft', null, null, '2026-09-21T10:00:00.000Z');

    const draftLink = await app.inject({
      method: 'POST',
      url: `/api/v1/clinical-materials/${created.json().data.id}/report-link`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { reportId: 'RPT-DRAFT' },
    });
    assert.equal(draftLink.statusCode, 409);
    assert.equal(draftLink.json().error.code, 'REPORT_NOT_CONFIRMED');
    const linked = await app.inject({
      method: 'POST',
      url: `/api/v1/clinical-materials/${created.json().data.id}/report-link`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { reportId: 'RPT-001' },
    });
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().data.reportId, 'RPT-001');

    const listed = await app.inject('/api/v1/clinical-materials?consultationId=CON-001');
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().data[0].id, created.json().data.id);

    const consultationWrite = await app.inject({
      method: 'POST',
      url: '/api/v1/consultations',
      payload: {},
    });
    assert.equal(consultationWrite.statusCode, 501);

    db.prepare("INSERT OR IGNORE INTO identity_roles VALUES('doctor-demo-002','attending')").run();
    db.prepare(
      `INSERT INTO access_grants(id,identity_id,patient_id,scope,task_id,expires_at,created_at)
       VALUES(?,?,?,?,?,?,?)`,
    ).run(
      'GRANT-MAT',
      'doctor-demo-002',
      'PAT-004',
      'patient:read',
      'CON-001',
      '2026-09-21T18:00:00.000Z',
      '2026-09-21T09:00:00.000Z',
    );
  } finally {
    await app.close();
  }

  const granted = await createApp({
    database: db,
    identity: { actorId: 'doctor-demo-002' },
    now: () => '2026-09-21T10:00:00.000Z',
  });
  try {
    const visible = await granted.inject('/api/v1/clinical-materials?consultationId=CON-001');
    assert.equal(visible.statusCode, 200);
    assert.equal(visible.json().data.length, 1);
  } finally {
    await granted.close();
  }

  db.prepare(
    "UPDATE access_grants SET revoked_at='2026-09-21T10:01:00.000Z' WHERE id='GRANT-MAT'",
  ).run();
  const revoked = await createApp({
    database: db,
    identity: { actorId: 'doctor-demo-002' },
    now: () => '2026-09-21T10:02:00.000Z',
  });
  try {
    const hidden = await revoked.inject('/api/v1/clinical-materials?consultationId=CON-001');
    assert.equal(hidden.statusCode, 200);
    assert.equal(hidden.json().data.length, 0);
    const detail = await revoked.inject(
      `/api/v1/clinical-materials/${db.prepare('SELECT id FROM clinical_materials').get()!.id}`,
    );
    assert.equal(detail.statusCode, 404);
  } finally {
    await revoked.close();
  }

  db.prepare("UPDATE access_grants SET revoked_at=NULL WHERE id='GRANT-MAT'").run();
  const expired = await createApp({
    database: db,
    identity: { actorId: 'doctor-demo-002' },
    now: () => '2026-09-21T18:00:00.000Z',
  });
  try {
    assert.equal(
      (await expired.inject('/api/v1/clinical-materials?consultationId=CON-001')).json().data
        .length,
      0,
    );
  } finally {
    await expired.close();
    db.close();
  }
});
