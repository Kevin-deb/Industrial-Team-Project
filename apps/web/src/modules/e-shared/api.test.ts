import { afterEach, describe, expect, it, vi } from 'vitest';
import { EApiError, requestEApi } from './api';

describe('requestEApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a successful CareLink API envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { id: 'plan-1', status: 'draft' },
            meta: { requestId: 'req-ok', mode: 'demo' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      requestEApi<{ id: string; status: string }>('/health/plans/plan-1'),
    ).resolves.toEqual({
      data: { id: 'plan-1', status: 'draft' },
      meta: { requestId: 'req-ok', mode: 'demo' },
    });
  });

  it('throws a typed API error without losing the request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'STALE_VERSION', message: '计划已被修改。' },
            meta: { requestId: 'req-1', mode: 'demo' },
          }),
          { status: 412, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>gateway error</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    await expect(requestEApi('/health/observations')).rejects.toMatchObject({
      status: 502,
      code: 'REQUEST_FAILED',
      requestId: 'unknown',
      message: 'Request failed. Please try again.',
    });
  });

  it('passes FormData through without forcing a JSON content type', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _options?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: { id: 'ATTACHMENT-1' },
            meta: { requestId: 'test', mode: 'demo' },
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.append('file', new File(['image'], 'demo.png', { type: 'image/png' }));

    await requestEApi('/social/attachments', { method: 'POST', body: form });

    const [, options] = fetchMock.mock.calls[0]!;
    expect(options?.body).toBe(form);
    const headers = new Headers(options?.headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('Accept')).toBe('application/json');
  });
});
