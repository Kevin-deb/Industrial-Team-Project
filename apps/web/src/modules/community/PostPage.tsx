import { ArrowLeft, Bookmark, Flag, Heart, Reply, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { useCreateComment, usePost, usePostReaction, useReportPost } from './queries';

export function PostPage() {
  const { t, formatDate } = useI18n();
  const { postId = '' } = useParams();
  const post = usePost(postId);
  const comment = useCreateComment(postId);
  const like = usePostReaction(postId, 'like');
  const bookmark = usePostReaction(postId, 'bookmark');
  const report = useReportPost(postId);
  const [replyTo, setReplyTo] = useState('');
  const [body, setBody] = useState('');
  const [reporting, setReporting] = useState(false);
  const data = post.data?.data;
  if (!data) return <div className="community-loading">{t('正在加载主题…')}</div>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await comment
      .mutateAsync({ ...(replyTo ? { parentCommentId: replyTo } : {}), displayMode: 'named', body })
      .then(() => {
        setBody('');
        setReplyTo('');
      });
  }
  return (
    <section className="community-view community-thread">
      <Link className="community-back" to={`/community/groups/${data.groupId}`}>
        <ArrowLeft size={14} />
        {t('返回论坛')}
      </Link>
      <article className="community-thread-post">
        <div className="community-thread-meta">
          <span>{data.groupName}</span>
          <span>{data.author.displayName}</span>
          <time>{formatDate(data.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </div>
        <h2>{data.title}</h2>
        <p>{data.body}</p>
        <div className="community-post-tags">
          {data.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="community-thread-actions">
          <button
            onClick={() => like.mutate(!data.likedByMe)}
            className={data.likedByMe ? 'active' : ''}
          >
            <Heart size={16} />
            {t(data.likedByMe ? '取消点赞' : '点赞')} · {data.likeCount}
          </button>
          <button
            onClick={() => bookmark.mutate(!data.bookmarkedByMe)}
            className={data.bookmarkedByMe ? 'active' : ''}
          >
            <Bookmark size={16} />
            {t(data.bookmarkedByMe ? '取消收藏' : '收藏')}
          </button>
          <button onClick={() => setReporting(true)}>
            <Flag size={16} />
            {t('举报')}
          </button>
        </div>
      </article>
      <section className="community-comments">
        <h3>
          {t('全部回复')} · {data.commentCount}
        </h3>
        {data.comments.map((item) => (
          <article key={item.id} className={item.parentCommentId ? 'is-reply' : ''}>
            <div>
              <strong>{item.author.displayName}</strong>
              <time>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            </div>
            <p>{item.body}</p>
            <button onClick={() => setReplyTo(item.id)}>
              <Reply size={13} />
              {t('回复')}
            </button>
          </article>
        ))}
        <form className="community-reply-form" onSubmit={submit}>
          {replyTo && (
            <div>
              {t('正在回复一条评论')}
              <button type="button" onClick={() => setReplyTo('')}>
                <X size={13} />
              </button>
            </div>
          )}
          <textarea
            aria-label={t('回复内容')}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('写下专业、友善的回复…')}
          />
          <Button type="submit" disabled={comment.isPending}>
            {t('发表回复')}
          </Button>
        </form>
      </section>
      {reporting && (
        <ReportDialog
          busy={report.isPending}
          onClose={() => setReporting(false)}
          onSubmit={async (reason) => {
            await report.mutateAsync(reason);
            setReporting(false);
          }}
        />
      )}
    </section>
  );
}
function ReportDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('false-medical-claim');
  return (
    <div className="community-dialog-backdrop">
      <section role="dialog" aria-label={t('举报主题')} className="community-dialog">
        <header>
          <h2>{t('举报主题')}</h2>
          <button onClick={onClose} aria-label={t('关闭')}>
            <X size={18} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(reason);
          }}
        >
          <label>
            {t('举报原因')}
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="false-medical-claim">{t('疑似错误医疗信息')}</option>
              <option value="advertising">{t('广告')}</option>
              <option value="harassment">{t('不友善内容')}</option>
              <option value="other">{t('其他')}</option>
            </select>
          </label>
          <footer>
            <Button variant="secondary" onClick={onClose}>
              {t('取消')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('提交举报')}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
