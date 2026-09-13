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
  const messageScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected && conversations.data?.data[0]) setSelected(conversations.data.data[0].id);
  }, [conversations.data, selected]);
  useEffect(() => {
    const container = messageScroll.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [active, messages.data?.data.items.length]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    await send.mutateAsync(body.trim());
    setBody('');
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
            {(messages.data?.data.items ?? []).map((item) => (
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
              {t('发送')}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
