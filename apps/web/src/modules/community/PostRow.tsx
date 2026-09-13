import { Bookmark, Heart, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SocialPostSummary } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { usePostReaction } from './queries';

export function PostRow({ post }: { post: SocialPostSummary }) {
  const { t, formatDate } = useI18n();
  const like = usePostReaction(post.id, 'like'), bookmark = usePostReaction(post.id, 'bookmark');
  return <article className="community-post-row">
    <div className="community-author-avatar">{post.author.avatarInitials}</div>
    <div className="community-post-main">
      <div className="community-post-context"><span>{post.groupName}</span><span>{post.author.displayName}</span><time>{formatDate(post.lastActivityAt, { month: 'short', day: 'numeric' })}</time></div>
      <Link to={`/community/posts/${post.id}`}><h3>{post.title}</h3></Link>
      <p>{post.excerpt}</p>
      <div className="community-post-tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="community-post-actions">
        <button type="button" onClick={() => like.mutate(!post.likedByMe)} aria-label={t(post.likedByMe ? '取消点赞' : '点赞')} className={post.likedByMe ? 'active' : ''}><Heart size={15} fill={post.likedByMe ? 'currentColor' : 'none'} />{post.likeCount}</button>
        <Link to={`/community/posts/${post.id}`} aria-label={t('查看评论')}><MessageCircle size={15} />{post.commentCount}</Link>
        <button type="button" onClick={() => bookmark.mutate(!post.bookmarkedByMe)} aria-label={t(post.bookmarkedByMe ? '取消收藏' : '收藏')} className={post.bookmarkedByMe ? 'active' : ''}><Bookmark size={15} fill={post.bookmarkedByMe ? 'currentColor' : 'none'} />{post.bookmarkCount}</button>
      </div>
    </div>
  </article>;
}
