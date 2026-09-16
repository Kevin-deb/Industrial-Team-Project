import { ArrowLeft, Bookmark, Eye, Flag, Heart, Reply, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { ContentBlocks } from './ContentBlocks';
import {
  MixedContentComposer,
  composerContentBlocks,
  composerHasPending,
  type ComposerValue,
} from './composer/MixedContentComposer';
import {
  useCreateComment,
  useCommentReaction,
  usePost,
  usePostReaction,
  useRecordPostView,
  useReportPost,
  useChangeContent,
} from './queries';

const viewedPostIds = new Set<string>();

export function PostPage() {
  const { t, formatDate } = useI18n();
  const { postId = '' } = useParams();
  const post = usePost(postId);
  const comment = useCreateComment(postId);
  const replyReaction = useCommentReaction(postId);
  const like = usePostReaction(postId, 'like');
  const bookmark = usePostReaction(postId, 'bookmark');
  const [reportCommentId, setReportCommentId] = useState<string>();
  const report = useReportPost(postId, reportCommentId);
  const view = useRecordPostView(postId);
  const [replyTo, setReplyTo] = useState('');
  const [content, setContent] = useState<ComposerValue>({ body: '', items: [] });
  const [draftCommandId, setDraftCommandId] = useState(() => crypto.randomUUID());
  const [reporting, setReporting] = useState(false);
  const change = useChangeContent();
  const [editing, setEditing] = useState<{
    kind: 'post' | 'comment';
    id: string;
    title: string;
    body: string;
    action: 'edit' | 'delete';
  } | null>(null);
  const data = post.data?.data;
  useEffect(() => {
    if (!data || data.deleted || viewedPostIds.has(postId)) return;
    viewedPostIds.add(postId);
    view.mutate(undefined, { onError: () => viewedPostIds.delete(postId) });
  }, [data?.id, postId]);
  if (post.isError)
    return (
      <section className="community-view">
        <p role="alert">{t('主题暂不可用，可能已被处理或无权访问。')}</p>
        <Link to="/community/groups">{t('返回论坛')}</Link>
      </section>
    );
  if (!data) return <div className="community-loading">{t('正在加载主题…')}</div>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await comment
      .mutateAsync({
        ...(replyTo ? { parentCommentId: replyTo } : {}),
        displayMode: 'named',
        body: content.body,
        contentBlocks: composerContentBlocks(content),
        commandId: draftCommandId,
      })
      .then(() => {
        setContent({ body: '', items: [] });
        setDraftCommandId(crypto.randomUUID());
        setReplyTo('');
      })
      .catch(() => undefined);
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
        <ContentBlocks blocks={data.contentBlocks ?? []} />
        <div className="community-post-tags">
          {data.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="community-thread-actions">
          {data.canEdit && (
            <button
              onClick={() => {
                setEditing({
                  kind: 'post',
                  id: data.id,
                  title: data.title,
                  body: data.body,
                  action: 'edit',
                });
              }}
            >
              {t('编辑')}
            </button>
          )}
          {data.canDelete && (
            <button
              onClick={() => {
                setEditing({
                  kind: 'post',
                  id: data.id,
                  title: data.title,
                  body: data.body,
                  action: 'delete',
                });
              }}
            >
              {t('删除帖子')}
            </button>
          )}
          <span aria-label={t('浏览量')}>
            <Eye size={16} />
            {t('浏览量')} · {data.viewCount}
          </span>
          <button
            disabled={data.deleted}
            onClick={() => like.mutate(!data.likedByMe)}
            className={data.likedByMe ? 'active' : ''}
          >
            <Heart size={16} />
            {t(data.likedByMe ? '取消点赞' : '点赞')} · {data.likeCount}
          </button>
          <button
            disabled={data.deleted}
            onClick={() => bookmark.mutate(!data.bookmarkedByMe)}
            className={data.bookmarkedByMe ? 'active' : ''}
          >
            <Bookmark size={16} />
            {t(data.bookmarkedByMe ? '取消收藏' : '收藏')}
          </button>
          <button
            onClick={() => {
              setReportCommentId(undefined);
              setReporting(true);
            }}
            disabled={data.deleted}
          >
            <Flag size={16} />
            {t('举报')}
          </button>
        </div>
        {(like.isError || bookmark.isError) && (
          <span className="community-action-error" role="alert">
            {t('操作未保存，请重试。')}
          </span>
        )}
      </article>
      {!data.deleted && (
        <section className="community-comments">
          <h3>
            {t('全部回复')} · {data.commentCount}
          </h3>
          {data.comments.map((item) => (
            <article key={item.id} className={item.parentCommentId ? 'is-reply' : ''}>
              <div>
                <strong>{item.author.displayName}</strong>
                <time>
                  {formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </div>
              <p>{item.body}</p>
              <ContentBlocks blocks={item.contentBlocks ?? []} />
              {!item.deleted && (
                <div className="community-comment-actions">
                  <button onClick={() => setReplyTo(item.id)}>
                    <Reply size={13} />
                    {t('回复')}
                  </button>
                  <button
                    onClick={() => {
                      setReportCommentId(item.id);
                      setReporting(true);
                    }}
                  >
                    <Flag size={13} />
                    {t('举报')}
                  </button>
                  {item.canEdit && (
                    <button
                      onClick={() => {
                        setEditing({
                          kind: 'comment',
                          id: item.id,
                          title: '',
                          body: item.body,
                          action: 'edit',
                        });
                      }}
                    >
                      {t('编辑')}
                    </button>
                  )}
                  {item.canDelete && (
                    <button
                      onClick={() => {
                        setEditing({
                          kind: 'comment',
                          id: item.id,
                          title: '',
                          body: item.body,
                          action: 'delete',
                        });
                      }}
                    >
                      {t('删除')}
                    </button>
                  )}
                  <button
                    disabled={replyReaction.isPending}
                    aria-label={t(item.likedByMe ? '取消点赞回复' : '点赞回复')}
                    onClick={() =>
                      replyReaction.mutate({
                        commentId: item.id,
                        kind: 'like',
                        value: !item.likedByMe,
                      })
                    }
                  >
                    <Heart size={13} />
                    {t(item.likedByMe ? '取消点赞' : '点赞')} · {item.likeCount ?? 0}
                  </button>
                  <button
                    disabled={replyReaction.isPending}
                    aria-label={t(item.bookmarkedByMe ? '取消收藏回复' : '收藏回复')}
                    onClick={() =>
                      replyReaction.mutate({
                        commentId: item.id,
                        kind: 'bookmark',
                        value: !item.bookmarkedByMe,
                      })
                    }
                  >
                    <Bookmark size={13} />
                    {t(item.bookmarkedByMe ? '取消收藏' : '收藏')} · {item.bookmarkCount ?? 0}
                  </button>
                </div>
              )}
            </article>
          ))}
          {replyReaction.isError && (
            <p role="alert" className="community-action-error">
              {t('操作未保存，请重试。')}
            </p>
          )}
          <form className="community-reply-form" onSubmit={submit}>
            {replyTo && (
              <div>
                {t('正在回复一条评论')}
                <button type="button" onClick={() => setReplyTo('')}>
                  <X size={13} />
                </button>
              </div>
            )}
            <MixedContentComposer
              label={t('回复内容')}
              value={content}
              onChange={setContent}
              rows={4}
              disabled={comment.isPending}
            />
            {comment.isError && (
              <p className="community-error">{t('发表失败，内容已保留，请重试。')}</p>
            )}
            <Button
              type="submit"
              disabled={
                comment.isPending ||
                composerHasPending(content) ||
                (!content.body.trim() && !content.items.length)
              }
            >
              {t('发表回复')}
            </Button>
          </form>
        </section>
      )}
      {editing && (
        <div className="community-dialog-backdrop">
          <section
            className="community-dialog community-content-editor"
            role="dialog"
            aria-label={t(editing.action === 'edit' ? '编辑内容' : '删除内容')}
          >
            <header>
              <h2>{t(editing.action === 'edit' ? '编辑内容' : '删除内容')}</h2>
              <button onClick={() => setEditing(null)} aria-label={t('关闭')}>
                <X size={18} />
              </button>
            </header>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await change
                  .mutateAsync(editing)
                  .then(() => setEditing(null))
                  .catch(() => undefined);
              }}
            >
              {editing.action === 'delete' ? (
                <p>
                  {t(
                    editing.kind === 'post'
                      ? '删除后所有评论和回复将不可见，点赞和收藏记录保留删除提示。'
                      : '删除后此评论及下级回复将不可见，原始内容保留审计记录。',
                  )}
                </p>
              ) : (
                <>
                  {editing.kind === 'post' && (
                    <label>
                      {t('主题标题')}
                      <input
                        required
                        maxLength={120}
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      />
                    </label>
                  )}
                  <label>
                    {t('内容')}
                    <textarea
                      aria-label={t('内容')}
                      required
                      rows={5}
                      maxLength={20000}
                      value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                    />
                  </label>
                  <p>{t('已有附件保持不变，修改内容会保留历史版本。')}</p>
                </>
              )}
              {change.isError && <p role="alert">{t('操作失败，内容已保留，请重试。')}</p>}
              <footer>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  {t('取消')}
                </Button>
                <Button type="submit" disabled={change.isPending}>
                  {t('确认')}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      )}
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
