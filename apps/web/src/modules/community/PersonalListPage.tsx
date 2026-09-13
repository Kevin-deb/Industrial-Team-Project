import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { PostRow } from './PostRow';
import { usePersonalPosts } from './queries';

export function PersonalListPage() { const { t } = useI18n(); const { kind = 'posts' } = useParams(); const safeKind = (['posts', 'likes', 'bookmarks'].includes(kind) ? kind : 'posts') as 'posts' | 'likes' | 'bookmarks'; const query = usePersonalPosts(safeKind); const title = safeKind === 'likes' ? '我的点赞' : safeKind === 'bookmarks' ? '我的收藏' : '我的帖子'; return <section className="community-view"><Link className="community-back" to="/community/me"><ArrowLeft size={14} />{t('返回我的社区')}</Link><div className="community-view-heading"><div><h2>{t(title)}</h2><p>{t('这里显示完整记录')}</p></div></div><div className="community-post-list">{(query.data?.data.items ?? []).map((post) => <PostRow key={post.id} post={post} />)}</div></section>; }
