import { Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { useConversations, useMessages, useSendMessage } from './queries';

export function DirectMessages() {
  const { t, formatDate } = useI18n();
  const conversations = useConversations();
  const [selected, setSelected] = useState('');
  const active = selected || conversations.data?.data[0]?.id || '';
  const conversation = conversations.data?.data.find((item) => item.id === active);
  const messages = useMessages(active);
  const send = useSendMessage(active, conversation?.peer.id ?? '');
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);
  const messageScroll = useRef<HTMLDivElement>(null);
  const loadingEarlier = useRef(false);
  const messageItems = messages.data
    ? [...messages.data.pages].reverse().flatMap((page) => page.data.items)
    : [];
  useEffect(() => {
    if (!selected && conversations.data?.data[0]) setSelected(conversations.data.data[0].id);
  }, [conversations.data, selected]);
  useEffect(() => {
    const container = messageScroll.current;
    if (!container) return;
    if (!loadingEarlier.current) container.scrollTop = container.scrollHeight;
  }, [active, messageItems.length]);
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
    if (!body.trim()) return;
    setSaved(false);
    await send
      .mutateAsync(body.trim())
      .then(() => {
        setBody('');
        setSaved(true);
      })
      .catch(() => undefined);
  }
  return (
    <section className="community-view">
      <div className="community-view-heading">
        <div>
          <h2>{t('同行私信')}</h2>
          <p>{t('私信是独立的一对一交流，不属于圈子论坛')}</p>
        </div>
      </div>
      <div className="community-dm-workspace">
        <aside>
          {(conversations.data?.data ?? []).map((item) => (
            <button
              key={item.id}
              className={item.id === active ? 'active' : ''}
              onClick={() => setSelected(item.id)}
            >
              <span>{item.peer.avatarInitials}</span>
              <span>
                <strong>{item.peer.displayName}</strong>
                <small>{item.lastMessage}</small>
              </span>
              {item.unreadCount > 0 && <em>{item.unreadCount}</em>}
            </button>
          ))}
        </aside>
        <div className="community-chat">
          <header>
            <strong>{conversation?.peer.displayName ?? t('选择一位同行')}</strong>
          </header>
          <div className="community-message-scroll" ref={messageScroll}>
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
              <article
                key={item.id}
                className={item.senderId === conversation?.peer.id ? 'received' : 'sent'}
              >
                <p>{item.body}</p>
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
            <textarea
              aria-label={t('私信内容')}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('输入私信内容…')}
            />
            <Button type="submit" disabled={!conversation || send.isPending}>
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
