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

test('grouped directory counts cover all scoped matches, with deterministic paginated rows', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    for (const groupBy of ['disease', 'status']) {
      const all = (
        await app.inject('/api/v1/patients?groupBy=' + groupBy + '&pageSize=100')
      ).json();
      const page = (
        await app.inject('/api/v1/patients?groupBy=' + groupBy + '&pageSize=2&page=2')
      ).json();
      assert.equal(
        all.meta.groups.reduce((sum: number, group: { count: number }) => sum + group.count, 0),
        8,
      );
      assert.deepEqual(page.meta.groups, all.meta.groups);
      assert.deepEqual(page.data, all.data.slice(2, 4));
      assert.ok(
        all.data.every(
          (item: PatientArchive & { groupKey: string }) =>
            item.version && item.canEdit && item.groupKey,
        ),
      );
      assert.equal(
        all.data.some((item: PatientArchive) => item.id === 'PAT-RESTRICTED'),
        false,
      );
    }
    const status = (await app.inject('/api/v1/patients/PAT-001')).json().data.status;
    const filtered = (
      await app.inject('/api/v1/patients?groupBy=status&q=PAT-001&status=' + status)
    ).json();
    assert.deepEqual(filtered.meta.groups, [{ key: status, count: 1 }]);
    assert.equal((await app.inject('/api/v1/patients?groupBy=custom')).statusCode, 400);
  } finally {
    await app.close();
    db.close();
  }
});

test('batch status writes independent immutable versions and audits, skipping unchanged records', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    db.exec("UPDATE patients SET status='stable' WHERE id IN ('PAT-001','PAT-002')");
    const payload = {
      patients: [
        { id: 'PAT-001', expectedVersion: 1 },
        { id: 'PAT-002', expectedVersion: 1 },
      ],
      status: 'attention',
      changeReason: 'Synthetic batch review',
    };
    const batch = (
      await app.inject({ method: 'POST', url: '/api/v1/patients/batch', payload })
    ).json().data;
    assert.equal(batch.committed, true);
    assert.deepEqual(
      batch.results.map((item: { outcome: string; version: number }) => [
        item.outcome,
        item.version,
      ]),
      [
        ['updated', 2],
        ['updated', 2],
      ],
    );
    for (const item of payload.patients) {
      const history = (await app.inject('/api/v1/patients/' + item.id + '/versions')).json().data;
      assert.equal(history[0].snapshot.status, 'attention');
      assert.equal(history[0].snapshot.id, item.id);
      assert.equal(history[0].authoredBy, DEMO_DOCTOR_ID);
      assert.equal(history[0].changeReason, payload.changeReason);
      assert.ok(history[1].snapshotCapturedAt);
    }
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) count FROM audit_events WHERE action='patient.batch-status' AND outcome='success'",
        )
        .get()!.count,
      2,
    );
    const repeat = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/patients/batch',
        payload: {
          ...payload,
          patients: payload.patients.map((item) => ({ ...item, expectedVersion: 2 })),
        },
      })
    ).json().data;
    assert.ok(repeat.results.every((item: { outcome: string }) => item.outcome === 'unchanged'));
    assert.equal(
      db
        .prepare(
          "SELECT MAX(version) version FROM patient_archive_versions WHERE patient_id='PAT-001'",
        )
        .get()!.version,
      2,
    );
    const summary = (await app.inject('/api/v1/patients/summary')).json().data;
    const groups = (await app.inject('/api/v1/patients?groupBy=status')).json().meta.groups;
    assert.equal(
      groups.find((item: { key: string }) => item.key === 'attention').count,
      summary.attention,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test('batch stale, unavailable and temporary read-only patients block the entire batch', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const before = (await app.inject('/api/v1/patients/PAT-001')).json().data;
    const send = (id: string, expectedVersion = 1) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/patients/batch',
        payload: {
          patients: [
            { id: 'PAT-001', expectedVersion: 1 },
            { id, expectedVersion },
          ],
          status: 'attention',
          changeReason: 'Synthetic review',
        },
      });
    assert.equal((await send('PAT-002', 99)).json().data.results[1].outcome, 'stale');
    const unavailable = await send('PAT-RESTRICTED');
    const missing = await send('PAT-NOT-EXISTS');
    assert.equal(unavailable.statusCode, 404);
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(unavailable.json().error, missing.json().error);
    assert.equal(unavailable.body.includes('PAT-RESTRICTED'), false);
    assert.equal(missing.body.includes('PAT-NOT-EXISTS'), false);
    db.prepare('INSERT INTO access_grants VALUES(?,?,?,?,?,?,?,?)').run(
      'batch-read',
      DEMO_DOCTOR_ID,
      'PAT-RESTRICTED',
      'patient:read',
      null,
      '2099-01-01T00:00:00Z',
      null,
      '2026-09-01T00:00:00Z',
    );
    assert.equal((await send('PAT-RESTRICTED')).json().data.results[1].outcome, 'forbidden');
    db.exec("DELETE FROM role_permissions WHERE permission='patient:write'");
    assert.equal((await send('PAT-002')).json().data.committed, false);
    assert.deepEqual((await app.inject('/api/v1/patients/PAT-001')).json().data, {
      ...before,
      canEdit: false,
    });
    assert.equal(
      db
        .prepare(
          "SELECT MAX(version) version FROM patient_archive_versions WHERE patient_id='PAT-001'",
        )
        .get()!.version,
      1,
    );
  } finally {
    await app.close();
    db.close();
  }
});

test('batch validates IDs, reasons, versions and size; late audit failure rolls back all writes', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const payload = {
      patients: [
        { id: 'PAT-001', expectedVersion: 1 },
        { id: 'PAT-002', expectedVersion: 1 },
      ],
      status: 'attention',
      changeReason: 'Synthetic review',
    };
    const send = (body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v1/patients/batch', payload: body });
    assert.equal(
      (await send({ ...payload, patients: [payload.patients[0], payload.patients[0]] })).statusCode,
      422,
    );
    assert.equal((await send({ ...payload, changeReason: '  ' })).statusCode, 422);
    for (const patients of [
      [],
      Array.from({ length: 51 }, (_, index) => ({ id: String(index), expectedVersion: 1 })),
      [{ id: 'PAT-001', expectedVersion: 0 }],
    ])
      assert.equal((await send({ ...payload, patients })).statusCode, 400);
    db.exec(
      "UPDATE patients SET status='stable' WHERE id IN ('PAT-001','PAT-002'); CREATE TRIGGER fail_batch_audit BEFORE INSERT ON audit_events WHEN NEW.action='patient.batch-status' AND NEW.target_id='PAT-002' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
    );
    assert.equal((await send(payload)).statusCode, 503);
    for (const item of payload.patients) {
      assert.equal(
        db.prepare('SELECT status FROM patients WHERE id=?').get(item.id)!.status,
        'stable',
      );
      assert.equal(
        db
          .prepare('SELECT MAX(version) version FROM patient_archive_versions WHERE patient_id=?')
          .get(item.id)!.version,
        1,
      );
    }
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) count FROM audit_events WHERE action='patient.batch-status' AND outcome='success'",
        )
        .get()!.count,
      0,
    );
  } finally {
    await app.close();
    db.close();
  }
});

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
