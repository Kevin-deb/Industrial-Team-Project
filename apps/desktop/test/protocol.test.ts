import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createApp } from '../../api/src/app.js';
import {
  CONTENT_SECURITY_POLICY,
  canGrantMediaCapture,
  canGrantApplicationPermission,
  createProtocolHandler,
  isApplicationUrl,
} from '../src/protocol.js';

async function login(app: Awaited<ReturnType<typeof createApp>>) {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-login',
    payload: { account: 'lin.zhiyuan', password: '123456' },
  });
  assert.equal(result.statusCode, 201, result.body);
  return result.json().data.token as string;
}

test('private protocol forwards the authenticated session but never caller identity headers', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-auth-protocol-'));
  const app = await createApp({ runtime: 'desktop-demo' });
  const handler = createProtocolHandler(app, root);
  try {
    const token = await login(app);
    const response = await handler(
      new Request('carelink://app/api/v1/session', {
        headers: { authorization: `Bearer ${token}`, 'x-actor-id': 'doctor-demo-004' },
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).data.doctor.id, 'doctor-demo-001');
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('desktop registration forwards the submission key and replays without duplicates', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-registration-protocol-'));
  const app = await createApp({
    runtime: 'desktop-demo',
    identity: { actorId: 'doctor-demo-001' },
  });
  const handler = createProtocolHandler(app, root);
  const key = randomUUID();
  const body = JSON.stringify({
    name: 'Synthetic desktop registration',
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
    changeReason: 'Synthetic registration',
  });
  const send = () =>
    handler(
      new Request('carelink://app/api/v1/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
        body,
      }),
    );
  try {
    const first = await send();
    assert.equal(first.status, 201);
    const patient = (await first.json()).data;
    const retry = await send();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).data.id, patient.id);
    assert.equal(retry.headers.get('etag'), '"patient-v1"');
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('private application protocol serves offline UI routes and keeps API contracts intact', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-protocol-'));
  writeFileSync(resolve(root, 'index.html'), '<h1>CareLink</h1>');
  writeFileSync(resolve(root, 'app.js'), 'console.log("carelink")');
  const app = await createApp({
    runtime: 'desktop-demo',
    identity: { actorId: 'doctor-demo-001' },
  });
  const handler = createProtocolHandler(app, root);
  try {
    for (const path of ['/', '/patients', '/records']) {
      const result = await handler(new Request(`carelink://app${path}`));
      assert.equal(result.status, 200);
      assert.equal(await result.text(), '<h1>CareLink</h1>');
      assert.match(result.headers.get('content-security-policy')!, /script-src 'self'/);
    }
    const asset = await handler(new Request('carelink://app/app.js'));
    assert.match(asset.headers.get('content-type')!, /javascript/);
    const result = await handler(new Request('carelink://app/api/v1/dashboard'));
    assert.equal(result.status, 200);
    const dashboard = await result.json();
    assert.equal(dashboard.meta.mode, 'demo');
    assert.equal(typeof dashboard.data.stats.patients, 'number');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const missing = await handler(new Request('carelink://app/api/v1/nonexistent'));
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('private protocol rejects foreign origins, path escapes, oversized requests and asset mutations', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-security-'));
  const app = await createApp({
    runtime: 'desktop-demo',
    identity: { actorId: 'doctor-demo-001' },
  });
  const handler = createProtocolHandler(app, root);
  try {
    for (const value of [
      'https://app/',
      'carelink://evil/',
      'carelink://app:8080/',
      'carelink://user@app/',
    ])
      assert.equal(isApplicationUrl(value), false);
    assert.equal((await handler(new Request('https://example.com/api/v1/health'))).status, 403);
    assert.equal(
      (
        await handler(
          new Request('carelink://app/api/v1/health', {
            headers: { origin: 'https://evil.example' },
          }),
        )
      ).status,
      403,
    );
    assert.equal((await handler(new Request('carelink://app/%2e%2e%2fsecret.txt'))).status, 403);
    assert.equal((await handler(new Request('carelink://app/%5csecret.txt'))).status, 400);
    assert.equal(
      (await handler(new Request('carelink://app/app.js', { method: 'POST', body: 'x' }))).status,
      405,
    );
    assert.equal(
      (
        await handler(
          new Request('carelink://app/api/v1/patients', {
            method: 'POST',
            body: 'x'.repeat(1024 * 1024 + 1),
          }),
        )
      ).status,
      413,
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('private protocol forwards medical-record concurrency preconditions', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-record-protocol-'));
  const app = await createApp({
    runtime: 'desktop-demo',
    identity: { actorId: 'doctor-demo-001' },
  });
  const handler = createProtocolHandler(app, root);
  const recordBody = {
    chiefComplaint: 'Synthetic protocol test',
    presentIllness: '',
    medicalAndAllergyHistory: '',
    examinationAndInvestigations: '',
    assessmentAndPlan: '',
  };
  try {
    const created = await handler(
      new Request('carelink://app/api/v1/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patientId: 'PAT-001',
          templateId: 'outpatient',
          title: 'Protocol draft',
          diagnosis: 'Synthetic diagnosis',
          body: recordBody,
        }),
      }),
    );
    assert.equal(created.status, 201);
    const record = (await created.json()).data;
    const updated = await handler(
      new Request(`carelink://app/api/v1/records/${record.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': '"record-v1"' },
        body: JSON.stringify({
          title: 'Protocol draft v2',
          diagnosis: 'Synthetic diagnosis',
          body: recordBody,
        }),
      }),
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.headers.get('etag'), '"record-v2"');
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production environment still refuses standalone demo but permits explicit desktop demo', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(createApp(), /refuses NODE_ENV=production/);
    const app = await createApp({
      runtime: 'desktop-demo',
      identity: { actorId: 'doctor-demo-001' },
    });
    try {
      const result = await app.inject('/api/v1/health');
      assert.equal(result.json().data.mode, 'demo');
    } finally {
      await app.close();
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('desktop protocol carries social media bytes but keeps the generic one MiB request limit', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-media-protocol-'));
  const app = await createApp({
    runtime: 'desktop-demo',
    identity: { actorId: 'doctor-demo-001' },
    mediaRoot: resolve(root, 'media'),
  });
  const handler = createProtocolHandler(app, root);
  try {
    const png = Buffer.concat([
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      Buffer.alloc(2 * 1024 * 1024),
    ]);
    const boundary = '----carelink-desktop-media';
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="demo.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const uploaded = await handler(
      new Request('carelink://app/api/v1/social/attachments', {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body: multipart,
      }),
    );
    const uploadedBody = await uploaded.text();
    assert.equal(uploaded.status, 201, uploadedBody);
    const attachment = JSON.parse(uploadedBody).data;
    const content = await handler(new Request(`carelink://app${attachment.contentUrl}`));
    assert.equal(content.status, 200);
    assert.equal(content.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await content.arrayBuffer()), png);

    const generic = await handler(
      new Request('carelink://app/api/v1/patients', {
        method: 'POST',
        body: Buffer.alloc(1024 * 1024 + 1),
      }),
    );
    assert.equal(generic.status, 413);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('desktop allows microphone and camera capture only for the bundled application origin', () => {
  assert.equal(canGrantMediaCapture('media', 'carelink://app/', ['audio']), true);
  assert.equal(canGrantMediaCapture('media', 'carelink://app/', ['video']), true);
  assert.equal(canGrantMediaCapture('media', 'carelink://app/', ['audio', 'video']), true);
  assert.equal(canGrantMediaCapture('media', 'https://example.com/', ['audio']), false);
  assert.equal(canGrantMediaCapture('notifications', 'carelink://app/', ['audio']), false);
  assert.match(CONTENT_SECURITY_POLICY, /img-src 'self' data: blob:/);
  assert.match(CONTENT_SECURITY_POLICY, /media-src 'self' blob:/);
});

test('only authentication photo routes accept the bounded large-photo request', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-photo-protocol-'));
  const app = await createApp({ runtime: 'desktop-demo' });
  const handler = createProtocolHandler(app, root);
  try {
    const start = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/photo-login/start',
      payload: { account: 'lin.zhiyuan' },
    });
    assert.equal(start.statusCode, 202, start.body);
    const png = Buffer.concat([
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      Buffer.alloc(1100 * 1024),
    ]);
    const body = JSON.stringify({
      ticket: start.json().data.photoTicket,
      captureMethod: 'upload',
      photoDataUrl: 'data:image/png;base64,' + png.toString('base64'),
    });
    assert.ok(Buffer.byteLength(body) > 1024 * 1024);
    const accepted = await handler(
      new Request('carelink://app/api/v1/auth/photo-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    );
    assert.equal(accepted.status, 201, await accepted.clone().text());
    assert.ok((await accepted.json()).data.token);
    for (const path of [
      '/api/v1/auth/photo-check',
      '/api/v1/auth/password/recover-password/complete',
      '/api/v1/auth/password/change-password/complete',
    ]) {
      const tooLarge = await handler(
        new Request('carelink://app' + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'x'.repeat(3 * 1024 * 1024),
        }),
      );
      assert.equal(tooLarge.status, 413, path);
    }
    const generic = await handler(
      new Request('carelink://app/api/v1/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    );
    assert.equal(generic.status, 413);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('desktop grants user-requested notifications only to its bundled renderer', () => {
  assert.equal(canGrantApplicationPermission('notifications', 'carelink://app/settings'), true);
  assert.equal(canGrantApplicationPermission('notifications', 'https://example.com/'), false);
  assert.equal(canGrantApplicationPermission('notifications', 'carelink://app.evil/'), false);
  assert.equal(canGrantApplicationPermission('geolocation', 'carelink://app/'), false);
  assert.equal(canGrantApplicationPermission('media', 'carelink://app/', ['audio']), true);
  assert.equal(canGrantApplicationPermission('media', 'https://example.com/', ['video']), false);
});
