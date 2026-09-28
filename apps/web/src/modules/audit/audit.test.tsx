import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../shared/i18n';
import { AuditPage } from './index';

function response(page = 1) {
  return new Response(
    JSON.stringify({
      data: [
        {
          id: 'event-' + page,
          actorId: 'doctor-demo-001',
          actorName: 'Demo doctor',
          action: 'patient.update.' + page,
          targetType: 'patient',
          targetId: 'PAT-001',
          occurredAt: '2026-09-28T08:00:00Z',
          outcome: 'failed',
          description: 'Metadata only',
        },
      ],
      meta: {
        requestId: 'test',
        mode: 'demo',
        page,
        pageSize: 20,
        total: 125,
        summary: { success: 100, denied: 5, planned: 0, failed: 20 },
        domains: ['patient'],
      },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
function mount() {
  return render(
    <I18nProvider>
      <AuditPage />
    </I18nProvider>,
  );
}

describe('Audit query and export', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('carelink-language', 'en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses server totals and requests later pages rather than filtering the first 100 records', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      response(Number(new URL(String(url), 'http://localhost').searchParams.get('page'))),
    );
    vi.stubGlobal('fetch', fetcher);
    mount();
    expect(await screen.findByText('patient.update.1')).toBeInTheDocument();
    expect(screen.getByText('125 events · Showing 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('patient.update.2')).toBeInTheDocument();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('page=2');
  });

  it('applies query filters on the server and exports all matching rows with the session', async () => {
    localStorage.setItem('carelink-session-token', 'test-session');
    const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).includes('/export')
        ? new Response('id,action\n1,patient.update', { headers: { 'Content-Type': 'text/csv' } })
        : response(),
    );
    vi.stubGlobal('fetch', fetcher);
    const createObjectURL = vi.fn(() => 'blob:audit-test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    mount();
    await screen.findByText('patient.update.1');
    fireEvent.change(screen.getByLabelText('Action name'), { target: { value: 'patient.update' } });
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('outcome=failed'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export logs' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Export logs' }));
    await screen.findByText(
      'A file containing all events matching the applied filters has been generated.',
    );
    const exported = fetcher.mock.calls.find(([url]) => String(url).includes('/export'))!;
    expect(String(exported[0])).toContain('action=patient.update');
    expect(String(exported[0])).toContain('outcome=failed');
    expect(String(exported[0])).not.toContain('page=');
    expect(exported[1]?.headers).toMatchObject({ Authorization: 'Bearer test-session' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('shows an export failure without reporting a successful download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) =>
        String(url).includes('/export')
          ? new Response(JSON.stringify({ error: { message: '导出失败，请稍后重试。' } }), {
              status: 500,
            })
          : response(),
      ),
    );
    mount();
    await screen.findByText('patient.update.1');
    fireEvent.click(screen.getByRole('button', { name: 'Export logs' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed. Please try again.');
    expect(
      screen.queryByText(
        'A file containing all events matching the applied filters has been generated.',
      ),
    ).not.toBeInTheDocument();
  });
});
