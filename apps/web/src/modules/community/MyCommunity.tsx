import { Bell, Bookmark, FileText, Heart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { CommunityNotifications } from './CommunityNotifications';

export function MyCommunity() { const { t } = useI18n(); const navigate = useNavigate(); const [notices, setNotices] = useState(false); const entries = [{ label: '我的点赞', icon: Heart, path: '/community/me/likes' }, { label: '我的收藏', icon: Bookmark, path: '/community/me/bookmarks' }, { label: '我的帖子', icon: FileText, path: '/community/me/posts' }, { label: '我的消息', icon: Bell, path: '' }] as const; return <section className="community-view"><div className="community-view-heading"><div><h2>{t('我的社区')}</h2><p>{t('集中查看自己在社区中的内容与互动')}</p></div></div><div className="community-personal-menu">{entries.map((item) => <button key={item.label} onClick={() => item.path ? navigate(item.path) : setNotices(true)}><item.icon size={18} /><span><strong>{t(item.label)}</strong><small>{t(item.label === '我的消息' ? '查看别人对你内容的评论、回复、点赞和收藏' : '进入完整列表')}</small></span></button>)}</div>{notices && <CommunityNotifications onClose={() => setNotices(false)} />}</section>; }
