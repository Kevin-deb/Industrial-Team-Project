import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createApp } from '../../api/src/app.js';
import { createProtocolHandler, isApplicationUrl } from '../src/protocol.js';

test('private application protocol serves offline UI routes and keeps API contracts intact', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'carelink-protocol-'));
  writeFileSync(resolve(root, 'index.html'), '<h1>CareLink</h1>');
  writeFileSync(resolve(root, 'app.js'), 'console.log("carelink")');
  const app = await createApp({ runtime: 'desktop-demo' });
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
  const app = await createApp({ runtime: 'desktop-demo' });
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
  const app = await createApp({ runtime: 'desktop-demo' });
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
    const app = await createApp({ runtime: 'desktop-demo' });
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
