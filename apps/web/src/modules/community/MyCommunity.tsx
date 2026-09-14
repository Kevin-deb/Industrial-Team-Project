import { Bell, Bookmark, FileText, Heart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { CommunityNotifications } from './CommunityNotifications';
import { useNotifications, usePersonalPosts } from './queries';

export function MyCommunity() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [notices, setNotices] = useState(false);
  const likes = usePersonalPosts('likes');
  const bookmarks = usePersonalPosts('bookmarks');
  const posts = usePersonalPosts('posts');
  const notifications = useNotifications();
  const entries = [
    { label: '我的点赞', icon: Heart, path: '/community/me/likes', count: likes.data?.data.total },
    {
      label: '我的收藏',
      icon: Bookmark,
      path: '/community/me/bookmarks',
      count: bookmarks.data?.data.total,
    },
    {
      label: '我的帖子',
      icon: FileText,
      path: '/community/me/posts',
      count: posts.data?.data.total,
    },
    {
      label: '我的消息',
      icon: Bell,
      path: '',
      count: notifications.data?.data.filter((item) => !item.readAt).length,
    },
  ] as const;
  return (
    <section className="community-view">
      <div className="community-view-heading">
        <div>
          <h2>{t('社区首页')}</h2>
          <p>{t('查看自己的帖子、收藏和社区互动')}</p>
        </div>
      </div>
      <div className="community-personal-menu">
        {entries.map((item) => (
          <button
            key={item.label}
            onClick={() => (item.path ? navigate(item.path) : setNotices(true))}
          >
            <item.icon size={18} />
            <span>
              <strong>{t(item.label)}</strong>
              <small>
                {t(
                  item.label === '我的消息'
                    ? '查看互动消息和举报处理进度'
                    : '进入完整列表',
                )}
              </small>
            </span>
            <b>{item.count ?? '…'}</b>
          </button>
        ))}
      </div>
      {notices && <CommunityNotifications onClose={() => setNotices(false)} />}
    </section>
  );
}
