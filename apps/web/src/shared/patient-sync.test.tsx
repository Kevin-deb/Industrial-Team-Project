import { test, expect, vi } from 'vitest';
import { requestApi } from './api';
import { createEQueryClient } from '../modules/e-shared/query';
import { connectPatientCache } from './patient-sync';

test('successful B writes invalidate patient read models only; failed writes preserve caches', async () => {
  const client = createEQueryClient();
  client.setQueryData(['health', 'patient-summary', 'PAT-001'], { name: 'old' });
  client.setQueryData(['health', 'patient-summary', 'PAT-002'], { name: 'unrelated' });
  client.setQueryData(['social', 'notifications'], []);
  const disconnect = connectPatientCache(client);
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { id: 'PAT-001' } }), { status: 200 })),
    );
    await requestApi('/patients/PAT-001', { method: 'PATCH', body: '{}' });
    expect(client.getQueryState(['health', 'patient-summary', 'PAT-001'])?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(['health', 'patient-summary', 'PAT-002'])?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(['social', 'notifications'])?.isInvalidated).toBe(false);
    client.setQueryData(['health', 'patient-summary', 'PAT-001'], { name: 'new' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 412 })),
    );
    await expect(
      requestApi('/patients/PAT-001', { method: 'PATCH', body: '{}' }),
    ).rejects.toThrow();
    expect(client.getQueryState(['health', 'patient-summary', 'PAT-001'])?.isInvalidated).toBe(
      false,
    );
  } finally {
    disconnect();
    client.clear();
    vi.unstubAllGlobals();
  }
});
