import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CreateMedicalRecordRequest, type MedicalRecordTemplateId } from '@doctor/contracts';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/connection.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';
import { clinicalTemplateFields } from '../src/clinical/templates.js';

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

test('only drafts are editable while later clinical commands remain unavailable', async () => {
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
        body: body('outpatient'),
      },
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().error.code, 'RECORD_NOT_EDITABLE');
    for (const path of [
      '/records/REC-001/submit',
      '/records/REC-001/reviews',
      '/records/REC-001/archive',
      '/records/REC-001/orders',
      '/orders/ORD-001/stop',
    ]) {
      const planned = await app.inject({ method: 'POST', url: '/api/v1' + path, payload: {} });
      assert.equal(planned.statusCode, 501, path);
    }
  } finally {
    await app.close();
    db.close();
  }
});
