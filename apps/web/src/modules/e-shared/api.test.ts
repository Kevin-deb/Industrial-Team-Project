import { describe, expect, it, vi } from 'vitest';
import { EApiError, requestEApi } from './api';

describe('requestEApi', () => {
  it('parses a successful CareLink API envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: 'plan-1', status: 'draft' },
      meta: { requestId: 'req-ok', mode: 'demo' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(requestEApi<{ id: string; status: string }>('/health/plans/plan-1'))
      .resolves.toEqual({
        data: { id: 'plan-1', status: 'draft' },
        meta: { requestId: 'req-ok', mode: 'demo' },
      });
  });

  it('throws a typed API error without losing the request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'STALE_VERSION', message: '计划已被修改。' },
      meta: { requestId: 'req-1', mode: 'demo' },
    }), { status: 412, headers: { 'content-type': 'application/json' } })));

    const error = await requestEApi('/health/plans/PLAN-001').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(EApiError);
    expect(error).toMatchObject({
      status: 412,
      code: 'STALE_VERSION',
      requestId: 'req-1',
      message: '计划已被修改。',
    });
  });

  it('uses a safe fallback when the server returns non-JSON content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>gateway error</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })));

    await expect(requestEApi('/health/observations')).rejects.toMatchObject({
      status: 502,
      code: 'REQUEST_FAILED',
      requestId: 'unknown',
      message: 'Request failed. Please try again.',
    });
  });
});
