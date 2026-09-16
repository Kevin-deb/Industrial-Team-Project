import { Bell, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { useNotifications, useReadNotification } from './queries';

export function CommunityNotifications({ onClose }: { onClose: () => void }) {
  const { t, formatDate } = useI18n();
  const notices = useNotifications();
  const read = useReadNotification();
  const navigate = useNavigate();
  return (
    <div className="community-dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('我的消息')}
        className="community-dialog community-notice-dialog"
      >
        <header>
          <h2>{t('我的消息')}</h2>
          <button onClick={onClose} aria-label={t('关闭')}>
            <X size={18} />
          </button>
        </header>
        <div className="community-notice-scroll">
          {(notices.data?.data ?? []).map((item) => (
            <button
              key={item.id}
              className={item.readAt ? '' : 'unread'}
              onClick={() => {
                void (async () => {
                  if (!item.readAt) await read.mutateAsync(item.id).catch(() => undefined);
                  onClose();
                  if (item.postId) navigate(`/community/posts/${item.postId}`);
                })();
              }}
            >
              <Bell size={16} />
              <span>
                <strong>
                  {item.kind.startsWith('report-') || item.kind === 'content-moderated'
                    ? t(noticeText(item.kind))
                    : `${item.actorDisplayName} ${t(item.commentId && item.kind === 'like' ? '点赞了你的回复' : item.commentId && item.kind === 'bookmark' ? '收藏了你的回复' : noticeText(item.kind))}`}
                </strong>
                <small>
                  {formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
function noticeText(kind: string) {
  const messages: Record<string, string> = {
    comment: '评论了你的帖子', reply: '回复了你的评论',
    like: '点赞了你的帖子', bookmark: '收藏了你的帖子',
    'report-accepted': '你提交的举报已受理', 'report-upheld': '你提交的举报处理成功',
    'report-rejected': '你提交的举报未通过',
    'content-moderated': '你的内容因举报成立已被处理',
  };
  return messages[kind] ?? '有一条新的社区消息';
}
