import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/connection.js';
import { SqlitePatientRepository } from '../src/patients/repository.js';

test('patient DTO explains ownership and collaborative read-only access', async () => {
  const db = openDatabase(':memory:');
  try {
    const patients = new SqlitePatientRepository(db);
    const now = '2026-09-24T08:00:00Z';
    const owner = patients.archive('PAT-009', { actorId: 'doctor-demo-003', now })!;
    assert.equal(owner.responsibleDoctorName, '许清');
    assert.equal(owner.accessRole, 'responsible');
    assert.equal(owner.canBatch, true);
    const collaborator = patients.archive('PAT-002', { actorId: 'doctor-demo-003', now })!;
    assert.equal(collaborator.accessRole, 'collaborative-readonly');
    assert.equal(collaborator.canBatch, false);
    assert.match(collaborator.batchDisabledReason!, /协作只读/);
  } finally {
    db.close();
  }
});

test('archive retains history and linked data while blocking future mutation', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const beforeVersions = Number(
      db
        .prepare("SELECT COUNT(*) n FROM patient_archive_versions WHERE patient_id='PAT-001'")
        .get()!.n,
    );
    const linked = Number(
      db.prepare("SELECT COUNT(*) n FROM medical_records WHERE patient_id='PAT-001'").get()!.n,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/patients/PAT-001/archive',
      payload: { expectedVersion: 1, changeReason: 'Synthetic lifecycle test' },
    });
    assert.equal(response.statusCode, 200, response.body);
    const patient = (await app.inject('/api/v1/patients/PAT-001')).json().data;
    assert.equal(patient.lifecycleStatus, 'archived');
    assert.equal(patient.canEdit, false);
    assert.equal(
      Number(
        db
          .prepare("SELECT COUNT(*) n FROM patient_archive_versions WHERE patient_id='PAT-001'")
          .get()!.n,
      ),
      beforeVersions + 1,
    );
    assert.equal(
      Number(
        db.prepare("SELECT COUNT(*) n FROM medical_records WHERE patient_id='PAT-001'").get()!.n,
      ),
      linked,
    );
    assert.equal(
      db
        .prepare("SELECT operation FROM patient_management_history WHERE patient_id='PAT-001'")
        .get()!.operation,
      'archive',
    );
  } finally {
    await app.close();
    db.close();
  }
});

test('release and transfer are audited, versioned and never delete the patient', async () => {
  for (const operation of ['release', 'transfer'] as const) {
    const db = openDatabase(':memory:');
    const app = await createApp({ database: db });
    try {
      const payload =
        operation === 'transfer'
          ? {
              expectedVersion: 1,
              changeReason: 'Synthetic transfer',
              newResponsibleDoctorId: 'doctor-demo-002',
            }
          : { expectedVersion: 1, changeReason: 'Synthetic release' };
      const result = await app.inject({
        method: 'POST',
        url: `/api/v1/patients/PAT-001/${operation}`,
        payload,
      });
      assert.equal(result.statusCode, 200, result.body);
      const row = db
        .prepare("SELECT assigned_doctor_id,lifecycle_status FROM patients WHERE id='PAT-001'")
        .get()!;
      assert.equal(row.lifecycle_status, operation === 'release' ? 'released' : 'active');
      if (operation === 'transfer') assert.equal(row.assigned_doctor_id, 'doctor-demo-002');
      assert.equal(
        db
          .prepare("SELECT operation FROM patient_management_history WHERE patient_id='PAT-001'")
          .get()!.operation,
        operation,
      );
      assert.equal((await app.inject('/api/v1/patients/PAT-001')).statusCode, 404);
    } finally {
      await app.close();
      db.close();
    }
  }
});
