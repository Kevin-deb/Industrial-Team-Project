import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database/connection.js';
import { DEMO_DOCTOR_ID } from '../src/database/seed.js';

const payload = {
  name: 'Synthetic registration',
  gender: '男',
  age: 40,
  phone: '',
  diagnosis: 'Synthetic condition',
  tags: [],
  status: 'follow-up',
  symptoms: [],
  allergies: [],
  allergyStatus: 'unknown',
  medicalHistory: [],
  careSummary: '',
  changeReason: 'Synthetic initial registration',
};

test('registration persists an atomic first version and durable idempotency across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'carelink-registration-'));
  const path = join(dir, 'test.sqlite');
  const key = randomUUID();
  let db = openDatabase(path);
  let app = await createApp({ database: db });
  try {
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/patients',
        headers: { 'Idempotency-Key': key },
        payload,
      });
    const created = await send();
    assert.equal(created.statusCode, 201);
    const patient = created.json().data;
    assert.match(patient.id, /^PAT-[a-f0-9-]{36}$/);
    assert.equal(patient.assignedDoctorId, DEMO_DOCTOR_ID);
    assert.equal(patient.version, 1);
    assert.equal(patient.lastVisit, '');
    assert.equal(patient.nextFollowUp, '');
    assert.equal(created.headers.etag, '"patient-v1"');
    assert.equal(
      db.prepare('SELECT is_synthetic FROM patients WHERE id=?').get(patient.id)!.is_synthetic,
      1,
    );
    const history = (await app.inject('/api/v1/patients/' + patient.id + '/versions')).json().data;
    assert.equal(history.length, 1);
    assert.equal(history[0].authoredBy, DEMO_DOCTOR_ID);
    assert.equal(history[0].changeReason, payload.changeReason);
    assert.equal(history[0].snapshot.name, payload.name);
    assert.equal((await send()).json().data.id, patient.id);
    const edited = await app.inject({
      method: 'PATCH',
      url: '/api/v1/patients/' + patient.id,
      headers: { 'If-Match': '"patient-v1"' },
      payload: { ...payload, careSummary: 'Synthetic update', changeReason: 'Review' },
    });
    assert.equal(edited.statusCode, 200);
    await app.close();
    db.close();
    db = openDatabase(path);
    app = await createApp({ database: db });
    const replay = await send();
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().data.id, patient.id);
    assert.equal(replay.json().data.version, 2);
    assert.equal(replay.headers.etag, '"patient-v2"');
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM audit_events WHERE action='patient.register' AND outcome='success'",
        )
        .get()!.n,
      1,
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM patient_registration_requests').get()!.n, 1);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/patients',
          headers: { 'Idempotency-Key': key },
          payload: { ...payload, name: 'Different' },
        })
      ).statusCode,
      409,
    );
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('registration rejects invalid inputs, caller-owned identifiers and revoked permissions', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const send = (body: Record<string, unknown>, key: string = randomUUID()) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/patients',
        headers: { 'Idempotency-Key': key },
        payload: body,
      });
    assert.equal((await send(payload, 'invalid')).statusCode, 428);
    for (const extra of [
      { id: 'caller' },
      { assignedDoctorId: 'caller' },
      { version: 9 },
      { age: 131 },
    ])
      assert.equal((await send({ ...payload, ...extra })).statusCode, 400);
    for (const extra of [
      { changeReason: '  ' },
      { diagnosis: '  ' },
      { tags: ['a', ' a '] },
      { phone: 'abc' },
      { allergies: ['Synthetic allergy'] },
      { lastVisit: '2026-02-30' },
      { lastVisit: '2026-09-20', nextFollowUp: '2026-09-19' },
    ])
      assert.equal((await send({ ...payload, ...extra })).statusCode, 422);
    assert.equal((await app.inject('/api/v1/patients/summary')).json().data.canRegister, true);
    db.exec("DELETE FROM role_permissions WHERE permission='patient:write'");
    assert.equal((await send(payload)).statusCode, 403);
    assert.equal((await app.inject('/api/v1/patients/summary')).json().data.canRegister, false);
  } finally {
    await app.close();
    db.close();
  }
});

test('registration rolls back the patient, history and retry key when auditing fails', async () => {
  const db = openDatabase(':memory:');
  const app = await createApp({ database: db });
  try {
    const count = () => db.prepare('SELECT COUNT(*) n FROM patients').get()!.n;
    const before = count();
    const key = randomUUID();
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/patients',
        headers: { 'Idempotency-Key': key },
        payload,
      });
    db.exec(
      "CREATE TRIGGER fail_registration BEFORE INSERT ON audit_events WHEN NEW.action='patient.register' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
    );
    assert.equal((await send()).statusCode, 503);
    assert.equal(count(), before);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM patient_registration_requests').get()!.n, 0);
    db.exec('DROP TRIGGER fail_registration');
    assert.equal((await send()).statusCode, 201);
    assert.equal(count(), Number(before) + 1);
  } finally {
    await app.close();
    db.close();
  }
});
