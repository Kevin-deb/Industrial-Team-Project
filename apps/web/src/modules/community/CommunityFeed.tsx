import { Search } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../shared/i18n';
import { PostRow } from './PostRow';
import { useFeed } from './queries';

export function CommunityFeed() {
  const { t } = useI18n(); const [query, setQuery] = useState(''); const feed = useFeed(query);
  return <section className="community-view"><div className="community-view-heading"><div><h2>{t('社区首页')}</h2><p>{t('查看已加入圈子中的最新主题和回复')}</p></div><label className="community-search"><Search size={15} /><input aria-label={t('搜索社区帖子')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜索标题或内容')} /></label></div>
    <div className="community-post-list">{(feed.data?.data.items ?? []).map((post) => <PostRow key={post.id} post={post} />)}{feed.isLoading && <div className="community-loading">{t('正在加载主题…')}</div>}</div>
  </section>;
}
