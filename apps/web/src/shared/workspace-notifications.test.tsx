import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
  type WorkspaceNotifications,
} from '@doctor/contracts';
import { I18nProvider } from './i18n';
import { useWorkspaceNotifications, WorkspaceNotificationPanel } from './workspace-notifications';

function data(
  id: string,
  options: { browser?: boolean; quiet?: boolean } = {},
): WorkspaceNotifications {
  const receipt = {
    id,
    reminderId: 'task-' + id,
    patientId: 'PAT-' + id,
    channel: 'in-app' as const,
    templateId: 'followup-demo',
    body: 'Synthetic reminder ' + id,
    deliveredAt: '2026-09-28T08:00:00.000Z',
    mode: 'local-test' as const,
  };
  return {
    preferences: { ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES, browser: options.browser ?? true },
    quietNow: options.quiet ?? false,
    encounters: [],
    reminders: [receipt],
    inbox: [receipt],
  };
}
function reply(value: WorkspaceNotifications) {
  return new Response(JSON.stringify({ data: value, meta: { mode: 'demo', requestId: 'test' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Probe({ identityId }: { identityId: string }) {
  const current = useWorkspaceNotifications(identityId);
  return (
    <I18nProvider>
      <output data-testid="payload">{JSON.stringify(current.data)}</output>
      <WorkspaceNotificationPanel {...current} navigate={() => undefined} />
    </I18nProvider>
  );
}
function changed() {
  window.dispatchEvent(new Event('carelink-notification-preferences-changed'));
}

describe('Workspace notification lifecycle', () => {
  beforeEach(() => localStorage.clear());

  it('clears the previous account and ignores its late asynchronous response', async () => {
    const oldRequest = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply(data('doctor-a')))
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(reply(data('doctor-b')));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<Probe identityId="a" />);
    await waitFor(() => expect(screen.getByTestId('payload')).toHaveTextContent('doctor-a'));
    act(changed);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const oldSignal = (fetcher.mock.calls[1]![1] as RequestInit).signal!;
    view.rerender(<Probe identityId="b" />);
    expect(oldSignal.aborted).toBe(true);
    expect(screen.getByTestId('payload')).not.toHaveTextContent('doctor-a');
    await waitFor(() => expect(screen.getByTestId('payload')).toHaveTextContent('doctor-b'));
    await act(async () => {
      oldRequest.resolve(reply(data('late-private-a')));
    });
    expect(screen.getByTestId('payload')).toHaveTextContent('doctor-b');
    expect(screen.getByTestId('payload')).not.toHaveTextContent('late-private-a');
  });

  it('refreshes preferences immediately, including a change received while a request is busy', async () => {
    const pending = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(reply(data('saved-preferences', { browser: false })));
    vi.stubGlobal('fetch', fetcher);
    render(<Probe identityId="a" />);
    act(changed);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(reply(data('stale-preferences')));
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('payload')).toHaveTextContent('saved-preferences');
    expect(screen.getByTestId('payload')).toHaveTextContent('"browser":false');
  });

  it.each([
    { label: 'quiet hours', browser: true, quiet: true },
    { label: 'browser disabled', browser: false, quiet: false },
  ])('keeps the in-app inbox when $label suppresses device alerts', async ({ browser, quiet }) => {
    const popup = vi.fn(function () {
      return { close: vi.fn() };
    });
    Object.defineProperty(popup, 'permission', { value: 'granted' });
    vi.stubGlobal('Notification', popup);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply(data('old', { browser, quiet })))
        .mockResolvedValueOnce(reply(data('arrived', { browser, quiet }))),
    );
    render(<Probe identityId="a" />);
    await waitFor(() => expect(screen.getByTestId('payload')).toHaveTextContent('old'));
    act(changed);
    await waitFor(() => expect(screen.getByTestId('payload')).toHaveTextContent('arrived'));
    expect(popup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /患者测试收件箱/ }));
    expect(screen.getByText('Synthetic reminder arrived')).toBeInTheDocument();
  });

  it('keeps successful in-app data when the device Notification constructor fails', async () => {
    const popup = vi.fn(function () {
      throw new Error('Device notifications unavailable');
    });
    Object.defineProperty(popup, 'permission', { value: 'granted' });
    vi.stubGlobal('Notification', popup);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply(data('old')))
        .mockResolvedValueOnce(reply(data('arrived'))),
    );
    render(<Probe identityId="a" />);
    await waitFor(() => expect(screen.getByTestId('payload')).toHaveTextContent('old'));
    act(changed);
    await waitFor(() => expect(popup).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('payload')).toHaveTextContent('arrived');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /患者测试收件箱/ }));
    expect(screen.getByText('Synthetic reminder arrived')).toBeInTheDocument();
  });
});
