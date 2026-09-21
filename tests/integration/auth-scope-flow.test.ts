import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../apps/api/src/app.js';

async function login(app: Awaited<ReturnType<typeof createApp>>, account: string) {
  const start = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { account, password: 'CareLink-Demo-2026' },
  });
  assert.equal(start.statusCode, 202, start.body);
  const challengeId = start.json().data.challengeId;
  const code = (await app.inject('/api/v1/auth/demo-email/' + challengeId)).json().data.code;
  const email = await app.inject({
    method: 'POST', url: '/api/v1/auth/email/verify', payload: { challengeId, code },
  });
  const photo = await app.inject({
    method: 'POST', url: '/api/v1/auth/photo-check',
    payload: {
      ticket: email.json().data.photoTicket,
      captureMethod: 'camera',
      photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    },
  });
  assert.equal(photo.statusCode, 201, photo.body);
  return { authorization: `Bearer ${photo.json().data.token}` };
}

test('real sessions isolate B patients, E health/community and audit metadata', async () => {
  const app = await createApp({ runtime: 'local-demo' });
  try {
    const lin = await login(app, 'lin.zhiyuan');
    const liang = await login(app, 'liang.ruochuan');
    const linPatients = (await app.inject({ url: '/api/v1/patients', headers: lin })).json().data;
    const liangPatients = (await app.inject({ url: '/api/v1/patients', headers: liang })).json().data;
    assert.deepEqual(linPatients.map((p: { id: string }) => p.id), [
      'PAT-001','PAT-002','PAT-003','PAT-004','PAT-005','PAT-006','PAT-007','PAT-008',
    ]);
    assert.deepEqual(liangPatients.map((p: { id: string }) => p.id), ['PAT-006', 'PAT-007']);
    assert.equal((await app.inject({ url: '/api/v1/health/patients/PAT-001', headers: lin })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/health/patients/PAT-001', headers: liang })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/v1/social/preferences', headers: lin })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/social/preferences', headers: liang })).statusCode, 200);
    const audit = (await app.inject({ url: '/api/v1/audit', headers: liang })).json().data;
    assert.ok(audit.some((event: { action: string }) => event.action === 'auth.login'));
    assert.ok(audit.every((event: { actorId: string }) => event.actorId === 'doctor-demo-004'));
    await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: liang });
    assert.equal((await app.inject({ url: '/api/v1/patients', headers: liang })).statusCode, 401);
  } finally {
    await app.close();
  }
});
