import { Search, Send, X } from 'lucide-react';
import type { SocialPeer } from '@doctor/contracts';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import {
  socialKeys,
  useConversations,
  useMarkConversationRead,
  useMessages,
  usePeerSearch,
  useSendMessage,
} from './queries';
import { useSocialRealtime } from './realtime';
import { ContentBlocks } from './ContentBlocks';
import {
  MixedContentComposer,
  composerContentBlocks,
  composerHasPending,
  type ComposerValue,
} from './composer/MixedContentComposer';

export function DirectMessages() {
  const { t, formatDate } = useI18n();
  const conversations = useConversations();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draftPeer, setDraftPeer] = useState<SocialPeer | null>(null);
  const peerSearch = usePeerSearch(search.trim());
  const active = draftPeer ? '' : (selected ?? '');
  const conversation = conversations.data?.data.find((item) => item.id === active);
  const peer = draftPeer ?? conversation?.peer;
  const messages = useMessages(active);
  const send = useSendMessage(active, peer?.id ?? '');
  const markRead = useMarkConversationRead();
  const [content, setContent] = useState<ComposerValue>({ body: '', items: [] });
  const [draftCommandId, setDraftCommandId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState(false);
  const messageScroll = useRef<HTMLDivElement>(null);
  const loadingEarlier = useRef(false);
  const readRequests = useRef(new Set<string>());
  const messageItems = messages.data
    ? [...messages.data.pages].reverse().flatMap((page) => page.data.items)
    : [];
  useEffect(() => {
    const firstConversationId = conversations.data?.data[0]?.id;
    if (!draftPeer && !selected && firstConversationId) setSelected(firstConversationId);
  }, [conversations.data, draftPeer, selected]);
  useEffect(() => {
    const container = messageScroll.current;
    if (!container) return;
    if (!loadingEarlier.current) container.scrollTop = container.scrollHeight;
  }, [active, messageItems.length]);
  useEffect(() => {
    if (!active || !conversation?.unreadCount || readRequests.current.has(active)) return;
    readRequests.current.add(active);
    void markRead.mutateAsync(active).finally(() => readRequests.current.delete(active));
  }, [active, conversation?.unreadCount, markRead]);
  const handleRealtime = useCallback(
    (event: import('@doctor/contracts').SocialRealtimeEvent) => {
      void queryClient.invalidateQueries({ queryKey: socialKeys.conversations });
      if (event.conversationId === active)
        void queryClient.invalidateQueries({ queryKey: socialKeys.messages(active) });
    },
    [active, queryClient],
  );
  const reconcileRealtime = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: socialKeys.conversations });
    if (active) void queryClient.invalidateQueries({ queryKey: socialKeys.messages(active) });
  }, [active, queryClient]);
  useSocialRealtime(handleRealtime, reconcileRealtime);
  async function loadEarlier() {
    const container = messageScroll.current;
    const previousHeight = container?.scrollHeight ?? 0;
    loadingEarlier.current = true;
    await messages.fetchNextPage();
    requestAnimationFrame(() => {
      if (container) container.scrollTop += container.scrollHeight - previousHeight;
      loadingEarlier.current = false;
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.body.trim() && !content.items.length) return;
    setSaved(false);
    await send
      .mutateAsync({
        body: content.body.trim(),
        contentBlocks: composerContentBlocks(content),
        commandId: draftCommandId,
      })
      .then((result) => {
        setContent({ body: '', items: [] });
        setDraftCommandId(crypto.randomUUID());
        setSaved(true);
        setSelected(result.data.conversationId);
        setDraftPeer(null);
        requestAnimationFrame(() => {
          const container = messageScroll.current;
          if (container) container.scrollTop = container.scrollHeight;
        });
      })
      .catch(() => undefined);
  }
  return (
    <section className="community-view community-dm-view">
      <div className="community-view-heading">
        <div>
          <h2>{t('同行私信')}</h2>
          <p>{t('私信是独立的一对一交流，不属于圈子论坛')}</p>
        </div>
      </div>
      <div className="community-dm-workspace">
        <aside>
          <div className="community-peer-search-area">
            <label className="community-peer-search">
              <Search size={15} />
              <input
                type="search"
                aria-label={t('查找同行医生')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('搜索姓名、科室或职称')}
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label={t('清空搜索')}>
                  <X size={14} />
                </button>
              )}
            </label>
            {search.trim() && (
              <div className="community-peer-results">
                {peerSearch.isFetching && <small>{t('正在查找医生…')}</small>}
                {peerSearch.isError && <small>{t('医生搜索暂时不可用，请重试。')}</small>}
                {!peerSearch.isFetching &&
                  !peerSearch.isError &&
                  !(peerSearch.data?.data.length ?? 0) && <small>{t('没有找到匹配的医生')}</small>}
                {(peerSearch.data?.data ?? []).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-label={`${item.displayName}，${item.title}，${item.department}，${t('开始私信')}`}
                    onClick={() => {
                      setDraftPeer(item);
                      setSelected(null);
                      setSearch('');
                      setContent({ body: '', items: [] });
                      setDraftCommandId(crypto.randomUUID());
                      setSaved(false);
                    }}
                  >
                    <span>{item.avatarInitials}</span>
                    <span>
                      <strong>{item.displayName}</strong>
                      <small>
                        {item.title} · {item.department}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="community-conversation-list">
            <h3>{t('最近私信')}</h3>
            {(conversations.data?.data ?? []).map((item) => (
              <button
                key={item.id}
                className={item.id === active ? 'active' : ''}
                onClick={() => {
                  setDraftPeer(null);
                  setSelected(item.id);
                  setSaved(false);
                }}
              >
                <span>{item.peer.avatarInitials}</span>
                <span>
                  <strong>{item.peer.displayName}</strong>
                  <small>{item.lastMessage}</small>
                </span>
                {item.unreadCount > 0 && <em>{item.unreadCount}</em>}
              </button>
            ))}
          </div>
        </aside>
        <div className="community-chat">
          <header>
            <span className="community-chat-avatar">{peer?.avatarInitials ?? '-'}</span>
            <div>
              <h3>{peer?.displayName ?? t('选择一位同行')}</h3>
              <small>
                {draftPeer ? `${draftPeer.title} · ${draftPeer.department}` : t('一对一同行私信')}
              </small>
            </div>
          </header>
          <div className="community-message-scroll" ref={messageScroll}>
            {draftPeer && !messageItems.length && (
              <div className="community-new-conversation">
                <strong>{t('开始一段新私信')}</strong>
                <span>{t('发送第一条消息后，会自动保存到最近私信。')}</span>
              </div>
            )}
            {messages.hasNextPage && (
              <button
                className="community-load-earlier"
                type="button"
                disabled={messages.isFetchingNextPage}
                onClick={() => void loadEarlier()}
              >
                {messages.isFetchingNextPage ? t('正在加载更早消息…') : t('加载更早消息')}
              </button>
            )}
            {messages.isError && (
              <div className="community-error" role="alert">
                {t('私信加载失败，请重试。')}{' '}
                <button type="button" onClick={() => void messages.refetch()}>
                  {t('重试')}
                </button>
              </div>
            )}
            {messageItems.map((item) => (
              <article key={item.id} className={item.senderId === peer?.id ? 'received' : 'sent'}>
                <p>{item.body}</p>
                <ContentBlocks blocks={item.contentBlocks ?? []} />
                <time>
                  {formatDate(item.sentAt, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </article>
            ))}
          </div>
          <form onSubmit={submit}>
            <MixedContentComposer
              label={t('私信内容')}
              value={content}
              onChange={setContent}
              rows={2}
              disabled={!peer || send.isPending}
            />
            <Button
              type="submit"
              disabled={
                !peer ||
                send.isPending ||
                composerHasPending(content) ||
                (!content.body.trim() && !content.items.length)
              }
            >
              <Send size={15} />
              {t(send.isPending ? '正在发送…' : '发送')}
            </Button>
            {send.isError && (
              <span className="community-send-state error">{t('发送失败，请重试。')}</span>
            )}
            {saved && !send.isPending && !send.isError && (
              <span className="community-send-state">{t('已保存')}</span>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
