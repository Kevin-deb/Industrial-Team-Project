import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../shared/i18n';
import { renderWithEProviders } from '../e-shared/test-utils';
import { CommunityPage } from './CommunityPage';

const post = {
  id: 'POST-001',
  groupId: 'GROUP-GERIATRICS',
  groupName: '老年医学与连续照护',
  author: { id: 'doctor-demo-002', displayName: '周明', anonymous: false, avatarInitials: '周' },
  title: '门诊随访记录如何更清楚：老年医学',
  excerpt:
    '结合日常工作整理了一份老年医学交流提纲，主要想听听大家在记录、沟通和后续安排方面的做法。内容为合成讨论文本，不含真实患者资料。',
  tags: ['随访管理'],
  createdAt: '2026-09-01T09:00:00+08:00',
  lastActivityAt: '2026-09-10T09:00:00+08:00',
  commentCount: 3,
  likeCount: 2,
  bookmarkCount: 1,
  likedByMe: false,
  bookmarkedByMe: false,
};
function envelope(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { requestId: 'test', mode: 'demo' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CommunityPage', () => {
  beforeEach(() => {
    localStorage.setItem('carelink-language', 'zh-CN');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/preferences'))
          return envelope({ enabled: true, notificationsEnabled: true, updatedAt: '2026-09-10' });
        if (url.includes('/groups'))
          return envelope({
            items: [
              {
                id: 'GROUP-GERIATRICS',
                name: '老年医学与连续照护',
                specialty: '老年医学',
                description: '连续照护讨论。',
                memberCount: 3,
                postCount: 4,
                joinedByMe: true,
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
          });
        if (url.includes('/notifications'))
          return envelope([
            {
              id: 'NOTICE-1',
              kind: 'comment',
              actorDisplayName: '周明',
              postId: 'POST-001',
              createdAt: '2026-09-10',
            },
          ]);
        if (url.includes('/conversations/') && url.includes('/messages'))
          return envelope({
            items: [
              {
                id: 'DM-1',
                conversationId: 'CONVERSATION-1',
                senderId: 'doctor-demo-002',
                recipientId: 'doctor-demo-001',
                body: '方便交流吗？',
                sentAt: '2026-09-10',
              },
            ],
          });
        if (url.includes('/conversations'))
          return envelope([
            {
              id: 'CONVERSATION-1',
              peer: { id: 'doctor-demo-002', displayName: '周明', avatarInitials: '周' },
              lastMessage: '方便交流吗？',
              updatedAt: '2026-09-10',
              unreadCount: 1,
            },
          ]);
        if (url.includes('/feed') || url.includes('/me/'))
          return envelope({ items: [post], page: 1, pageSize: 20, total: 1 });
        return envelope(post);
      }),
    );
  });

  it('separates the post feed, specialty groups, personal pages, notifications and private messages', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { name: '社区首页' })).toBeInTheDocument();
    expect(await screen.findByText('门诊随访记录如何更清楚：老年医学')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '专科圈子' }));
    expect(await screen.findByRole('heading', { name: '专科圈子' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '我的社区' }));
    for (const name of ['我的点赞', '我的收藏', '我的帖子', '我的消息'])
      expect(await screen.findByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /我的消息/ }));
    expect(await screen.findByRole('dialog', { name: '我的消息' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('link', { name: '同行私信' }));
    expect(await screen.findByRole('heading', { name: '同行私信' })).toBeInTheDocument();
    expect(document.querySelector('.community-message-scroll')).toBeInTheDocument();
  });

  it('localizes synthetic community records when English is selected', async () => {
    localStorage.setItem('carelink-language', 'en');
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Community home' })).toBeInTheDocument();
    expect(
      await screen.findByText('Clearer outpatient follow-up records: Geriatrics'),
    ).toBeInTheDocument();
    expect(screen.queryByText('门诊随访记录如何更清楚：老年医学')).not.toBeInTheDocument();
  });
});
