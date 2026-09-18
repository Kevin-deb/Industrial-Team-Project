import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('A identity drives B scope and E exact patient selection without caller impersonation', async () => {
  const identity = { actorId: 'doctor-demo-002' };
  const app = await createApp({ identity });
  identity.actorId = 'doctor-demo-001';
  try {
    const session = (await app.inject('/api/v1/session')).json().data;
    assert.equal(session.doctor.id, 'doctor-demo-002');
    assert.equal((await app.inject('/api/v1/health/patients/PAT-001')).statusCode, 404);
    assert.equal(
      (
        await app.inject({
          url: '/api/v1/patients/PAT-001',
          headers: { 'x-doctor-id': 'doctor-demo-001' },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test('E patient summary resolves exact B patient ID and hides missing or forbidden patients', async () => {
  const app = await createApp();
  try {
    const b = (await app.inject('/api/v1/patients/PAT-001')).json().data;
    const e = await app.inject('/api/v1/health/patients/PAT-001');
    assert.equal(e.statusCode, 200);
    assert.equal(e.json().data.name, b.name);
    for (const id of ['PAT-RESTRICTED', 'missing'])
      assert.equal((await app.inject('/api/v1/health/patients/' + id)).statusCode, 404);
  } finally {
    await app.close();
  }
});
