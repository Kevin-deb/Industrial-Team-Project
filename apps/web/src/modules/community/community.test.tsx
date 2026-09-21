import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { SocialRealtimeEvent } from '@doctor/contracts';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../shared/i18n';
import { renderWithEProviders } from '../e-shared/test-utils';
import { CommunityPage } from './CommunityPage';
import { PostPage } from './PostPage';
import { GlobalSocialLiveUpdates } from './unread';

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
  viewCount: 48,
  likedByMe: false,
  bookmarkedByMe: false,
};
let availableTags = ['老年医学', '随访管理', '同行经验', '健康教育'];
function envelope(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { requestId: 'test', mode: 'demo' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CommunityPage', () => {
  it('refreshes unread notifications on a realtime event without leaving community home', async () => {
    let listener: ((event: SocialRealtimeEvent) => void) | undefined;
    window.carelinkRealtime = { subscribe(callback) { listener = callback; return () => { listener = undefined; }; } };
    let count = 1;
    const readIds = new Set<string>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/preferences')) return envelope({ enabled: true, notificationsEnabled: true });
      if (url.endsWith('/notifications/read') && init?.method === 'POST') {
        Array.from({ length: count }, (_, index) => readIds.add(`LIVE-${index}`));
        return envelope({ readAt: '2026-09-16T12:01:00+08:00', updatedCount: count });
      }
      if (url.includes('/notifications/') && url.endsWith('/read') && init?.method === 'POST') {
        readIds.add(url.split('/').at(-2) ?? '');
        return envelope({ readAt: '2026-09-16T12:01:00+08:00' });
      }
      if (url.includes('/notifications')) return envelope(Array.from({ length: count }, (_, index) => ({ id: `LIVE-${index}`, kind: 'like', postId: '', actorDisplayName: '周明', createdAt: post.createdAt, readAt: readIds.has(`LIVE-${index}`) ? '2026-09-16T12:01:00+08:00' : undefined })));
      return envelope({ items: [], total: 0, page: 1, pageSize: 20 });
    }));
    renderWithEProviders(<I18nProvider><MemoryRouter initialEntries={['/community']}><Routes><Route path="/community/*" element={<><GlobalSocialLiveUpdates /><CommunityPage /></>} /></Routes></MemoryRouter></I18nProvider>);
    const entry = await screen.findByRole('button', { name: /我的消息/ });
    await waitFor(() => expect(entry).toHaveTextContent('1'));
    count = 2;
    listener?.({ type: 'social.notifications.changed', occurredAt: '2026-09-16T12:00:00+08:00' } as SocialRealtimeEvent);
    await waitFor(() => expect(entry).toHaveTextContent('2'));
    fireEvent.click(entry);
    expect(await screen.findByRole('dialog', { name: '我的消息' })).toBeInTheDocument();
    await waitFor(() => expect(entry.querySelector('.unread-count-badge')).not.toBeInTheDocument());
    expect(entry).toHaveTextContent('2');
    delete window.carelinkRealtime;
  });
  it('shows unavailable content rather than loading forever after moderation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'SOCIAL_RESOURCE_NOT_FOUND', message: '未找到该社区内容。' } }), { status: 404 })));
    renderWithEProviders(<I18nProvider><MemoryRouter initialEntries={['/posts/POST-001']}>
      <Routes><Route path="/posts/:postId" element={<PostPage />} /></Routes>
    </MemoryRouter></I18nProvider>);
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('主题暂不可用，可能已被处理或无权访问。');
  });
  it('offers compact reply reactions and updates from the API', async () => {
    const reply = { id: 'COMMENT-1', postId: post.id, body: '回复测试内容', author: post.author,
      displayMode: 'named', contentBlocks: [], createdAt: post.createdAt,
      likeCount: 0, bookmarkCount: 0, likedByMe: false, bookmarkedByMe: false };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/comments/COMMENT-1/likes')) reply.likedByMe = true;
      return envelope({ ...post, body: '主题正文', contentBlocks: [], comments: [reply] });
    }));
    renderWithEProviders(<I18nProvider><MemoryRouter initialEntries={['/posts/POST-001']}>
      <Routes><Route path="/posts/:postId" element={<PostPage />} /></Routes>
    </MemoryRouter></I18nProvider>);
    const body = await screen.findByText('回复测试内容');
    const article = body.closest('article')!;
    fireEvent.click(within(article).getByRole('button', { name: '点赞回复' }));
    await waitFor(() => expect(within(article).getByRole('button', { name: '取消点赞回复' })).toBeInTheDocument());
    expect(within(article).getByRole('button', { name: '收藏回复' })).toBeInTheDocument();
  });
  it('renders a reply immediately below the comment it targets', async () => {
    const comments = [
      {
        id: 'COMMENT-A', postId: post.id, body: 'A 的评论', author: post.author,
        displayMode: 'named', contentBlocks: [], createdAt: '2026-09-01T10:00:00+08:00',
      },
      {
        id: 'COMMENT-B', postId: post.id, body: 'B 的评论', author: post.author,
        displayMode: 'named', contentBlocks: [], createdAt: '2026-09-01T11:00:00+08:00',
      },
      {
        id: 'COMMENT-C', postId: post.id, body: '另一条最新评论', author: post.author,
        displayMode: 'named', contentBlocks: [], createdAt: '2026-09-01T12:00:00+08:00',
      },
      {
        id: 'COMMENT-B-REPLY', postId: post.id, parentCommentId: 'COMMENT-B',
        body: 'A 回复 B', author: post.author, displayMode: 'named', contentBlocks: [],
        createdAt: '2026-09-01T13:00:00+08:00',
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => envelope({
      ...post,
      body: '主题正文',
      contentBlocks: [],
      comments,
    })));
    renderWithEProviders(<I18nProvider><MemoryRouter initialEntries={['/posts/POST-001']}>
      <Routes><Route path="/posts/:postId" element={<PostPage />} /></Routes>
    </MemoryRouter></I18nProvider>);

    const bodies = await screen.findAllByText(/A 的评论|B 的评论|另一条最新评论|A 回复 B/);
    expect(bodies.map((node) => node.textContent)).toEqual([
      'A 的评论',
      'B 的评论',
      'A 回复 B',
      '另一条最新评论',
    ]);
  });
  beforeEach(() => {
    availableTags = ['老年医学', '随访管理', '同行经验', '健康教育'];
    localStorage.setItem('carelink-language', 'zh-CN');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/preferences'))
          return envelope({ enabled: true, notificationsEnabled: true, updatedAt: '2026-09-10' });
        if (url.includes('/groups/') && url.endsWith('/tags'))
          return envelope({ groupId: 'GROUP-GERIATRICS', tags: availableTags });
        if (url.endsWith('/social/posts') && init?.method === 'POST') {
          const submitted = JSON.parse(String(init.body)) as { tags: string[] };
          availableTags = [...new Set([...availableTags, ...submitted.tags])];
          return new Response(JSON.stringify({ data: { ...post, tags: submitted.tags } }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/groups/') && url.includes('/posts'))
          return envelope({ items: [post], page: 1, pageSize: 20, total: 1 });
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
        if (url.includes('/peers'))
          return envelope([
            {
              id: 'doctor-demo-004',
              displayName: '梁若川',
              title: '主任医师',
              department: '老年医学科',
              hospital: '云栖医养示范中心',
              avatarInitials: '梁',
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

  it('uses the agreed four-entry personal hub as the community home', async () => {
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
    for (const name of ['我的点赞', '我的收藏', '我的帖子', '我的消息'])
      expect(await screen.findByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    const messageEntry = screen.getByRole('button', { name: /我的消息/ });
    expect(messageEntry).toHaveTextContent('1');
    expect(messageEntry.querySelector('.unread-count-badge')).toHaveTextContent('1');
    expect(screen.queryByRole('link', { name: '我的社区' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /同行私信.*1/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /我的点赞/ }));
    expect(await screen.findByRole('heading', { name: '我的点赞' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '返回社区首页' }));

    fireEvent.click(screen.getByRole('link', { name: '专科圈子' }));
    expect(await screen.findByRole('heading', { name: '专科圈子' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '社区首页' }));
    fireEvent.click(screen.getByRole('button', { name: /我的消息/ }));
    expect(await screen.findByRole('dialog', { name: '我的消息' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('link', { name: /同行私信/ }));
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
    expect(await screen.findByRole('button', { name: /My likes/ })).toBeInTheDocument();
    expect(screen.queryByText('门诊随访记录如何更清楚：老年医学')).not.toBeInTheDocument();
  });

  it('offers all five server-backed forum sort modes and shows post views', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByRole('heading', { name: '老年医学与连续照护' })).toBeInTheDocument();
    for (const label of ['点赞最多', '收藏最多', '浏览最多', '最新发布', '最新回复'])
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    expect(await screen.findByLabelText('浏览量')).toHaveTextContent('48');
  });

  it('searches inside a circle and offers flat multi-select tag filters', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    const search = await screen.findByRole('searchbox', { name: '搜索本圈主题' });
    fireEvent.change(search, { target: { value: '随访' } });
    expect(screen.getByRole('checkbox', { name: '随访管理' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '老年医学' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '随访管理' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '老年医学' }));
    await vi.waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('q=%E9%9A%8F%E8%AE%BF'),
        expect.anything(),
      ),
    );
  });

  it('keeps tag filter values stable when the English label is displayed', async () => {
    localStorage.setItem('carelink-language', 'en');
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Peer experience' }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining(`tags=${encodeURIComponent('同行经验')}`),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Clearer outpatient follow-up records: Geriatrics')).toBeVisible();
  });

  it('keeps a dedicated fixed-height post composer when case material is toggled', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '发布主题' }));
    const dialog = screen.getByRole('dialog', { name: '发布主题' });
    expect(dialog).toHaveClass('community-post-dialog');
    fireEvent.click(screen.getByRole('checkbox', { name: '内容包含病例材料' }));
    expect(dialog).toHaveClass('community-post-dialog');
    expect(screen.getByRole('checkbox', { name: /我已手工去除患者身份/ })).toBeVisible();
  });

  it('uses the same mixed-content tools for posts and direct messages', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '发布主题' }));
    for (const tool of ['添加图片', '录音或上传音频', '添加表情', '添加医学数据'])
      expect(screen.getByRole('button', { name: tool })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加表情' }));
    fireEvent.click(screen.getByRole('button', { name: '🙂' }));
    expect(screen.getByLabelText('讨论内容')).toHaveValue('🙂');
  });

  it('searches the clinician directory and starts a new direct message', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/messages']}>
          <Routes>
            <Route
              path="/community/*"
              element={
                <>
                  <GlobalSocialLiveUpdates />
                  <CommunityPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    const search = await screen.findByRole('searchbox', { name: '查找同行医生' });
    fireEvent.change(search, { target: { value: '老年医学' } });
    const result = await screen.findByRole('button', { name: /梁若川.*开始私信/ });
    fireEvent.click(result);
    expect(await screen.findByRole('heading', { name: '梁若川' })).toBeInTheDocument();
    expect(screen.getByText('主任医师 · 老年医学科')).toBeInTheDocument();
    expect(screen.getByLabelText('私信内容')).toBeEnabled();
  });

  it('keeps an automatically displayed conversation unread until the recipient opens it', async () => {
    let unreadCount = 8;
    let readRequests = 0;
    const realtime = {
      listener: undefined as ((event: SocialRealtimeEvent) => void) | undefined,
    };
    Object.defineProperty(window, 'carelinkRealtime', {
      configurable: true,
      value: {
        subscribe(listener: (event: SocialRealtimeEvent) => void) {
          realtime.listener = listener;
          return () => undefined;
        },
      },
    });
    let messages = [
      {
        id: 'DM-1',
        conversationId: 'CONVERSATION-1',
        senderId: 'doctor-demo-002',
        recipientId: 'doctor-demo-001',
        body: '原消息',
        contentBlocks: [],
        sentAt: '2026-09-10T08:00:00+08:00',
      },
    ];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/preferences'))
        return envelope({ enabled: true, notificationsEnabled: true, updatedAt: '2026-09-10' });
      if (url.endsWith('/conversations/CONVERSATION-1/read')) {
        readRequests += 1;
        unreadCount = 0;
        return envelope({
          conversationId: 'CONVERSATION-1',
          unreadCount: 0,
          readAt: '2026-09-14T09:30:00+08:00',
        });
      }
      if (url.includes('/conversations/CONVERSATION-1/messages'))
        return envelope({ items: messages });
      if (url.endsWith('/social/conversations'))
        return envelope([
          {
            id: 'CONVERSATION-1',
            peer: { id: 'doctor-demo-002', displayName: '周明', avatarInitials: '周' },
            lastMessage: messages.at(-1)?.body ?? '',
            updatedAt: messages.at(-1)?.sentAt ?? '',
            unreadCount,
          },
        ]);
      if (url.endsWith('/social/messages') && init?.method === 'POST') {
        const sent = {
          id: 'DM-SENT',
          conversationId: 'CONVERSATION-1',
          senderId: 'doctor-demo-001',
          recipientId: 'doctor-demo-002',
          body: '新消息',
          contentBlocks: [],
          sentAt: '2026-09-14T09:31:00+08:00',
        };
        messages = [...messages, sent];
        return new Response(
          JSON.stringify({ data: sent, meta: { requestId: 'test', mode: 'demo' } }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return envelope({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/messages']}>
          <Routes>
            <Route
              path="/community/*"
              element={
                <>
                  <GlobalSocialLiveUpdates />
                  <CommunityPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByRole('heading', { name: '周明' })).toBeInTheDocument();
    expect(readRequests).toBe(0);
    expect(screen.getAllByText('8')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /周明.*原消息/ }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/social/conversations/CONVERSATION-1/read',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(screen.queryByText('8')).not.toBeInTheDocument();

    unreadCount = 1;
    realtime.listener?.({
      type: 'social.message.created',
      conversationId: 'CONVERSATION-1',
      messageId: 'DM-INCOMING-2',
      occurredAt: '2026-09-14T09:30:30+08:00',
    });
    await waitFor(() => expect(readRequests).toBe(2));

    const scroll = document.querySelector('.community-message-scroll') as HTMLDivElement;
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 640 });
    fireEvent.change(screen.getByLabelText('私信内容'), { target: { value: '新消息' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('新消息')).toBeInTheDocument();
    await waitFor(() => expect(scroll.scrollTop).toBe(640));
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    delete window.carelinkRealtime;
  });

  it('places compact multi-select tags on their own toolbar row', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    const fieldset = await screen.findByRole('group', { name: '标签筛选' });
    expect(fieldset).toHaveClass('community-tag-filters');
    expect(fieldset.parentElement).toHaveClass('community-forum-tags-row');
  });

  it('allows existing tags but offers no user-created tag control', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter initialEntries={['/community/groups/GROUP-GERIATRICS']}>
          <Routes>
            <Route path="/community/*" element={<CommunityPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '发布主题' }));
    const dialog = screen.getByRole('dialog', { name: '发布主题' });
    const composer = within(dialog);
    fireEvent.change(composer.getByLabelText('主题标题'), { target: { value: '标签测试' } });
    fireEvent.change(composer.getByLabelText('讨论内容'), { target: { value: '测试新标签。' } });
    fireEvent.click(composer.getByRole('button', { name: '随访管理' }));
    expect(composer.queryByRole('textbox', { name: '新建标签' })).not.toBeInTheDocument();
    expect(composer.queryByRole('button', { name: '新建' })).not.toBeInTheDocument();
    expect(composer.getByRole('button', { name: '随访管理' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(composer.getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
