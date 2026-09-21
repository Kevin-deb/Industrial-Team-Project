import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { SocialRealtimeEvent } from '@doctor/contracts';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { I18nProvider } from './shared/i18n';
import { renderWithEProviders } from './modules/e-shared/test-utils';

vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({
    session: {
      doctor: {
        id: 'doctor-demo-001',
        name: '林知远',
        department: '全科医学科',
        avatarInitials: '林',
      },
    },
    logout: vi.fn(),
  }),
}));

function envelope(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { requestId: 'test', mode: 'demo' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('global community unread indicators', () => {
  let listener: ((event: SocialRealtimeEvent) => void) | undefined;
  let interactionUnread = 2;
  let directUnread = 3;

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    window.scrollTo = vi.fn();
    localStorage.setItem('carelink-language', 'zh-CN');
    interactionUnread = 2;
    directUnread = 3;
    window.carelinkRealtime = {
      subscribe(callback) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/social/preferences'))
          return envelope({ enabled: true, notificationsEnabled: true, updatedAt: '2026-09-21' });
        if (url.includes('/social/me/notifications'))
          return envelope(
            Array.from({ length: interactionUnread }, (_, index) => ({
              id: `NOTICE-${index}`,
              kind: 'like',
              actorDisplayName: '周明',
              postId: 'POST-1',
              createdAt: '2026-09-21T12:00:00+08:00',
            })),
          );
        if (url.includes('/social/conversations'))
          return envelope([
            {
              id: 'CONVERSATION-1',
              peer: { id: 'doctor-demo-002', displayName: '周明', avatarInitials: '周' },
              lastMessage: '新的私信',
              updatedAt: '2026-09-21T12:00:00+08:00',
              unreadCount: directUnread,
            },
          ]);
        return envelope({});
      }),
    );
  });

  it('shows real totals outside community and refreshes them from realtime events', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/missing']}>
          <App />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByRole('link', { name: /同行协作.*5/ })).toBeInTheDocument();
    const bell = screen.getByRole('button', { name: /通知中心.*5 条未读/ });
    fireEvent.click(bell);
    expect(await screen.findByRole('button', { name: /社区互动.*2 条未读/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /同行私信.*3 条未读/ })).toBeInTheDocument();

    interactionUnread = 3;
    listener?.({
      type: 'social.notifications.changed',
      occurredAt: '2026-09-21T12:01:00+08:00',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /通知中心.*6 条未读/ })).toBeInTheDocument(),
    );
  });
});
