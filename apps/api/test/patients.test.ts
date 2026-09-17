import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PatientArchive, UpdatePatientRequest } from '@doctor/contracts';
import { createApp } from '../src/app.js';
import { DatabaseSync } from 'node:sqlite';
import { migrations, openDatabase } from '../src/database/connection.js';
import { DEMO_DOCTOR_ID, seedDemo } from '../src/database/seed.js';

function input(
  patient: PatientArchive,
  overrides: Partial<UpdatePatientRequest> = {},
): UpdatePatientRequest {
  const {
    id: _id,
    version: _version,
    canEdit: _canEdit,
    lastVisit: _lastVisit,
    nextFollowUp: _nextFollowUp,
    assignedDoctorId: _doctor,
    ...fields
  } = patient;
  return { ...fields, changeReason: 'Synthetic archive review', ...overrides };
}

test('version 14 databases upgrade without rewriting legacy archive payloads', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'carelink-patient-upgrade-'));
  const path = join(folder, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(path);
    let payload: unknown;
    try {
      legacy.exec(
        'PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)',
      );
      for (const migration of migrations.filter((item) => item.version < 15)) {
        legacy.exec(migration.sql);
        legacy
          .prepare('INSERT INTO schema_migrations VALUES(?,?,?)')
          .run(migration.version, migration.name, '2026-09-01T00:00:00Z');
      }
      // Reuse current fixtures, then restore the exact pre-upgrade schema for this test.
      legacy.exec("ALTER TABLE patients ADD COLUMN allergy_status TEXT DEFAULT 'unknown'");
      seedDemo(legacy);
      legacy.exec(
        "ALTER TABLE patients DROP COLUMN allergy_status; DELETE FROM role_permissions WHERE permission='patient:write'",
      );
      payload = legacy
        .prepare("SELECT payload_json FROM patient_archive_versions WHERE patient_id='PAT-001'")
        .get()!.payload_json;
    } finally {
      legacy.close();
    }
    const upgraded = openDatabase(path);
    const app = await createApp({ database: upgraded });
    try {
      assert.equal(
        upgraded
          .prepare("SELECT payload_json FROM patient_archive_versions WHERE patient_id='PAT-001'")
          .get()!.payload_json,
        payload,
      );
      const detail = (await app.inject('/api/v1/patients/PAT-001')).json().data;
      assert.equal(detail.canEdit, true);
      assert.equal(detail.allergyStatus, 'recorded');
      const history = (await app.inject('/api/v1/patients/PAT-001/versions')).json().data;
      assert.equal(history[0].snapshot.id, 'PAT-001');
      assert.ok(history[0].snapshotCapturedAt);
    } finally {
      await app.close();
      upgraded.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('patient edits persist across restart with full immutable history and metadata audit', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'carelink-patients-'));
  const databasePath = join(folder, 'patients.sqlite');
  try {
    const app = await createApp({ databasePath });
    const detail = await app.inject('/api/v1/patients/PAT-001');
    const before = detail.json().data as PatientArchive;
    try {
      assert.equal(before.canEdit, true);
      assert.equal(detail.headers.etag, '"patient-v1"');
      const updated = await app.inject({
        method: 'PATCH',
        url: '/api/v1/patients/PAT-001',
        headers: { 'if-match': String(detail.headers.etag) },
        payload: input(before, {
          symptoms: ['Synthetic dizziness'],
          medicalHistory: ['Synthetic history'],
          allergyStatus: 'none',
          allergies: [],
          status: 'attention',
        }),
      });
      assert.equal(updated.statusCode, 200, updated.body);
      assert.equal(updated.headers.etag, '"patient-v2"');
      const history = (await app.inject('/api/v1/patients/PAT-001/versions')).json().data;
      assert.equal(history.length, 2);
      assert.equal(history[0].authoredBy, DEMO_DOCTOR_ID);
      assert.equal(history[0].snapshot.version, 2);
      assert.deepEqual(history[0].snapshot.symptoms, ['Synthetic dizziness']);
      assert.equal(history[0].changeReason, 'Synthetic archive review');
      assert.equal(history[1].snapshot.name, before.name);
      assert.ok(history[1].snapshotCapturedAt);
      const audit = (await app.inject('/api/v1/audit')).json().data;
      assert.ok(
        audit.some(
          (event: { action: string; targetId: string }) =>
            event.action === 'patient.update' && event.targetId === before.id,
        ),
      );
    } finally {
      await app.close();
    }
    const reopened = await createApp({ databasePath });
    try {
      const patient = (await reopened.inject('/api/v1/patients/PAT-001')).json().data;
      assert.equal(patient.version, 2);
      assert.deepEqual(patient.symptoms, ['Synthetic dizziness']);
      assert.equal(
        (await reopened.inject('/api/v1/patients/PAT-001/versions')).json().data.length,
        2,
      );
    } finally {
      await reopened.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('patient edits reject missing/stale versions, no-op changes and invalid fields', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const before = (await app.inject('/api/v1/patients/PAT-001')).json().data as PatientArchive;
    const edit = input(before, { careSummary: 'Synthetic revised summary' });
    const patch = (payload: object, version?: string) =>
      app.inject({
        method: 'PATCH',
        url: '/api/v1/patients/PAT-001',
        headers: version ? { 'if-match': version } : {},
        payload,
      });
    assert.equal((await patch(edit)).statusCode, 428);
    assert.equal(
      (await patch(input(before), '"patient-v1"')).json().error.code,
      'PATIENT_UNCHANGED',
    );
    for (const fields of [
      { name: '   ' },
      { age: 131 },
      { allergies: ['test'], allergyStatus: 'none' },
      { changeReason: '  ' },
      { tags: ['a', ' a'] },
      { phone: 'not-a-phone' },
      { assignedDoctorId: 'doctor-demo-002' },
    ]) {
      const response = await patch({ ...edit, ...fields }, '"patient-v1"');
      assert.ok([400, 422].includes(response.statusCode), response.body);
    }
    assert.equal((await patch(edit, '"patient-v1"')).statusCode, 200);
    const stale = await patch({ ...edit, name: 'Must not overwrite' }, '"patient-v1"');
    assert.equal(stale.statusCode, 412);
    assert.equal(stale.headers.etag, '"patient-v2"');
    assert.equal(
      db
        .prepare('SELECT COUNT(*) total FROM patient_archive_versions WHERE patient_id=?')
        .get(before.id)!.total,
      2,
    );
    assert.equal((await app.inject('/api/v1/patients/PAT-001')).json().data.name, before.name);
  } finally {
    await app.close();
    db.close();
  }
});

test('read scope, write permission and temporary grants are enforced independently', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const before = (await app.inject('/api/v1/patients/PAT-001')).json().data;
    for (const path of ['/patients/PAT-RESTRICTED', '/patients/PAT-RESTRICTED/versions'])
      assert.equal((await app.inject('/api/v1' + path)).statusCode, 404);
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/patients/PAT-RESTRICTED',
          headers: { 'if-match': '"patient-v1"' },
          payload: input(before, { name: 'blocked' }),
        })
      ).statusCode,
      404,
    );
    db.prepare("DELETE FROM role_permissions WHERE permission='patient:write'").run();
    assert.equal((await app.inject('/api/v1/patients/PAT-001')).json().data.canEdit, false);
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/patients/PAT-001',
          headers: { 'if-match': '"patient-v1"' },
          payload: input(before, { name: 'blocked' }),
        })
      ).statusCode,
      403,
    );
    db.prepare("INSERT INTO role_permissions VALUES('attending','patient:write')").run();
    db.prepare('INSERT INTO access_grants VALUES(?,?,?,?,?,?,?,?)').run(
      'read-only',
      DEMO_DOCTOR_ID,
      'PAT-RESTRICTED',
      'patient:read',
      null,
      '2099-01-01T00:00:00Z',
      null,
      '2026-09-01T00:00:00Z',
    );
    const granted = (await app.inject('/api/v1/patients/PAT-RESTRICTED')).json().data;
    assert.equal(granted.canEdit, false);
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/patients/PAT-RESTRICTED',
          headers: { 'if-match': '"patient-v1"' },
          payload: input(granted, { name: 'blocked' }),
        })
      ).statusCode,
      403,
    );
    db.prepare("UPDATE access_grants SET revoked_at='2026-09-01T00:00:00Z'").run();
    assert.equal((await app.inject('/api/v1/patients/PAT-RESTRICTED/versions')).statusCode, 404);
  } finally {
    await app.close();
    db.close();
  }
});

test('server search covers stored symptoms, categories and tags with correct scoped pagination', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    db.prepare(
      "UPDATE patients SET symptoms_json='[\"unique-symptom\"]',tags_json='[\"unique-tag\"]',diagnosis='unique-condition' WHERE id='PAT-001'",
    ).run();
    for (const q of ['unique-symptom', 'unique-tag', 'unique-condition', 'PAT-001']) {
      const result = (await app.inject('/api/v1/patients?q=' + q)).json();
      assert.equal(result.meta.total, 1);
      assert.equal(result.data[0].id, 'PAT-001');
    }
    const all = (await app.inject('/api/v1/patients?pageSize=100')).json();
    const second = (await app.inject('/api/v1/patients?page=2&pageSize=2')).json();
    assert.equal(second.meta.total, 8);
    assert.deepEqual(
      second.data.map((p: PatientArchive) => p.id),
      all.data.slice(2, 4).map((p: PatientArchive) => p.id),
    );
    const status = all.data[0].status;
    const combined = (
      await app.inject(
        '/api/v1/patients?q=unique-symptom&disease=unique-condition&status=' + status,
      )
    ).json();
    assert.equal(combined.meta.total, 1);
    assert.equal((await app.inject('/api/v1/patients?q=RESTRICTED')).json().meta.total, 0);
    assert.equal((await app.inject('/api/v1/patients/summary')).json().data.total, 8);
  } finally {
    await app.close();
    db.close();
  }
});

test('audit failure rolls back patient data and archive version together', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const before = (await app.inject('/api/v1/patients/PAT-001')).json().data;
    db.exec(
      "CREATE TRIGGER fail_patient_audit BEFORE INSERT ON audit_events WHEN NEW.action='patient.update' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
    );
    const failed = await app.inject({
      method: 'PATCH',
      url: '/api/v1/patients/PAT-001',
      headers: { 'if-match': '"patient-v1"' },
      payload: input(before, { name: 'Not committed' }),
    });
    assert.equal(failed.statusCode, 503);
    assert.equal(
      db.prepare('SELECT name FROM patients WHERE id=?').get(before.id)!.name,
      before.name,
    );
    assert.equal(
      db
        .prepare('SELECT COUNT(*) total FROM patient_archive_versions WHERE patient_id=?')
        .get(before.id)!.total,
      1,
    );
  } finally {
    await app.close();
    db.close();
  }
});
