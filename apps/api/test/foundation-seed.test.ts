import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { SqlitePatientRepository } from '../src/patients/index.js';

test('foundation seed contains five verified clinicians and ten coherent patients', () => {
  const db = openDatabase(':memory:');
  try {
    assert.ok(Number(db.prepare('SELECT COUNT(*) n FROM identities').get()!.n) >= 5);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM doctors').get()!.n, 5);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get()!.n, 5);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM patients').get()!.n, 10);
    assert.equal(
      db
        .prepare(
          `SELECT COUNT(*) n FROM doctors
           WHERE license_number<>'' AND specialty<>'' AND phone<>''
             AND government_id_masked<>'' AND credential_status='verified'
             AND personnel_status='verified' AND enabled=1`,
        )
        .get()!.n,
      5,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM users WHERE email_verified_at IS NOT NULL AND status='active'").get()!
        .n,
      5,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('different doctors receive different patient scopes without unrestricted discovery', () => {
  const db = openDatabase(':memory:');
  try {
    const patients = new SqlitePatientRepository(db);
    const at = '2026-09-10T08:00:00.000Z';
    const ids = (doctorId: string) =>
      patients.list({ pageSize: 100 }, { actorId: doctorId, now: at }).items.map((p) => p.id);
    const doctor1 = ids('doctor-demo-001');
    const doctor2 = ids('doctor-demo-002');
    const doctor3 = ids('doctor-demo-003');
    const doctor4 = ids('doctor-demo-004');
    const doctor5 = ids('doctor-demo-005');
    assert.equal(doctor1.length, 8);
    assert.ok(doctor2.length >= 2 && doctor2.length < 10);
    assert.ok(doctor3.length >= 2 && doctor3.length < 10);
    assert.ok(doctor4.length >= 2 && doctor4.length < 10);
    assert.ok(doctor5.length >= 1 && doctor5.length < 10);
    assert.notDeepEqual(doctor2, doctor3);
    assert.equal(
      patients.list({ q: '王秀英', pageSize: 10 }, { actorId: 'doctor-demo-004', now: at }).total,
      0,
    );
    assert.equal(patients.findById('PAT-002', { actorId: 'doctor-demo-004', now: at }), undefined);
  } finally {
    db.close();
  }
});
