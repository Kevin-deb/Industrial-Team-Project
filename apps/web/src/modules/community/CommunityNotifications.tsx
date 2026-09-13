import { Bell, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { useNotifications, useReadNotification } from './queries';

export function CommunityNotifications({ onClose }: { onClose: () => void }) { const { t, formatDate } = useI18n(); const notices = useNotifications(); const read = useReadNotification(); return <div className="community-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label={t('我的消息')} className="community-dialog community-notice-dialog"><header><h2>{t('我的消息')}</h2><button onClick={onClose} aria-label={t('关闭')}><X size={18} /></button></header><div className="community-notice-scroll">{(notices.data?.data ?? []).map((item) => <button key={item.id} className={item.readAt ? '' : 'unread'} onClick={() => { if (!item.readAt) read.mutate(item.id); }}><Bell size={16} /><span><strong>{item.actorDisplayName} {t(noticeText(item.kind))}</strong><small>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></span></button>)}</div></section></div>; }
function noticeText(kind: string) { return kind === 'comment' ? '评论了你的帖子' : kind === 'reply' ? '回复了你的评论' : kind === 'like' ? '点赞了你的帖子' : '收藏了你的帖子'; }
