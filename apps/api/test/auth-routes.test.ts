import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function login(app: Awaited<ReturnType<typeof createApp>>, account = 'lin.zhiyuan') {
  const started = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { account, password: 'CareLink-Demo-2026' },
  });
  assert.equal(started.statusCode, 202, started.body);
  const { challengeId } = started.json().data;
  const mail = await app.inject('/api/v1/auth/demo-email/' + encodeURIComponent(challengeId));
  assert.equal(mail.statusCode, 200, mail.body);
  const verified = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/email/verify',
    payload: { challengeId, code: mail.json().data.code },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  const completed = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/photo-check',
    payload: {
      ticket: verified.json().data.photoTicket,
      captureMethod: 'camera',
      photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    },
  });
  assert.equal(completed.statusCode, 201, completed.body);
  return completed.json().data.token as string;
}

test('business APIs require a verified session and session identity controls patient scope', async () => {
  const app = await createApp({ runtime: 'local-demo' });
  try {
    assert.equal((await app.inject('/api/v1/patients')).statusCode, 401);
    assert.equal((await app.inject('/api/v1/session')).statusCode, 401);
    const token = await login(app, 'liang.ruochuan');
    const headers = { authorization: `Bearer ${token}`, 'x-actor-id': 'doctor-demo-001' };
    const session = await app.inject({ url: '/api/v1/session', headers });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json().data.doctor.id, 'doctor-demo-004');
    const patients = await app.inject({ url: '/api/v1/patients', headers });
    assert.equal(patients.statusCode, 200, patients.body);
    assert.deepEqual(
      patients.json().data.map((patient: { id: string }) => patient.id),
      ['PAT-006', 'PAT-007'],
    );
    assert.equal(
      (await app.inject({ url: '/api/v1/patients/PAT-002', headers })).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test('logout revokes the session and photo verification cannot be skipped', async () => {
  const app = await createApp({ runtime: 'local-demo' });
  try {
    const token = await login(app);
    const headers = { authorization: `Bearer ${token}` };
    assert.equal((await app.inject({ url: '/api/v1/session', headers })).statusCode, 200);
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })).statusCode,
      204,
    );
    assert.equal((await app.inject({ url: '/api/v1/session', headers })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/photo-check',
          payload: {
            ticket: 'unverified',
            captureMethod: 'upload',
            photoDataUrl: 'data:image/jpeg;base64,/9j/',
          },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
