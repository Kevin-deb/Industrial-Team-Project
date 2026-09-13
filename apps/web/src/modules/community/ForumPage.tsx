import { ArrowLeft, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { PostRow } from './PostRow';
import { useCreatePost, useGroupPosts, useGroups } from './queries';

export function ForumPage() {
  const { t } = useI18n();
  const { groupId = '' } = useParams();
  const [sort, setSort] = useState<'latest' | 'latest-reply'>('latest-reply');
  const [tag, setTag] = useState('');
  const posts = useGroupPosts(groupId, sort, tag.trim());
  const groups = useGroups();
  const group = groups.data?.data.items.find((item) => item.id === groupId);
  const create = useCreatePost(groupId);
  const [open, setOpen] = useState(false);
  return (
    <section className="community-view">
      <Link className="community-back" to="/community/groups">
        <ArrowLeft size={14} />
        {t('返回专科圈子')}
      </Link>
      <div className="community-view-heading">
        <div>
          <h2>{group?.name ?? t('专科论坛')}</h2>
          <p>{group?.description ?? t('按主题发帖并进行同行回复')}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} />
          {t('发布主题')}
        </Button>
      </div>
      <div className="community-forum-toolbar">
        <label>
          {t('主题排序')}
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="latest-reply">{t('最新回复')}</option>
            <option value="latest">{t('最新发布')}</option>
          </select>
        </label>
        <label>
          {t('标签筛选')}
          <input value={tag} onChange={(event) => setTag(event.target.value)} />
        </label>
        {posts.isFetching && <span>{t('正在更新主题…')}</span>}
      </div>
      <div className="community-post-list">
        {(posts.data?.data.items ?? []).map((post) => (
          <PostRow key={post.id} post={post} />
        ))}
        {posts.isError && <div className="community-error">{t('主题加载失败，请重试。')}</div>}
      </div>
      {open && (
        <PostComposer
          groupId={groupId}
          busy={create.isPending}
          error={create.error}
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function PostComposer({
  groupId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  groupId: string;
  busy: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: {
    groupId: string;
    displayMode: 'named' | 'anonymous';
    title: string;
    body: string;
    tags: string[];
    containsCaseMaterial: boolean;
    deidentificationConfirmed: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [caseMaterial, setCaseMaterial] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (caseMaterial && !confirmed) return;
    await onSubmit({
      groupId,
      displayMode: anonymous ? 'anonymous' : 'named',
      title,
      body,
      tags: tags
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      containsCaseMaterial: caseMaterial,
      deidentificationConfirmed: confirmed,
    }).catch(() => undefined);
  }
  return (
    <div className="community-dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('发布主题')}
        className="community-dialog"
      >
        <header>
          <h2>{t('发布主题')}</h2>
          <button onClick={onClose} aria-label={t('关闭')}>
            <X size={18} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            {t('主题标题')}
            <input
              required
              minLength={2}
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            {t('讨论内容')}
            <textarea
              required
              minLength={2}
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <label>
            {t('标签')}
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t('用逗号分隔，最多 5 个')}
            />
          </label>
          <label className="community-check">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
            />
            {t('匿名发布')}
          </label>
          <label className="community-check">
            <input
              type="checkbox"
              checked={caseMaterial}
              onChange={(event) => setCaseMaterial(event.target.checked)}
            />
            {t('内容包含病例材料')}
          </label>
          {caseMaterial && (
            <label className="community-check community-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              {t('我已手工去除患者身份及可重新识别的信息')}
            </label>
          )}
          {error && <p className="community-error">{error.message}</p>}
          <footer>
            <Button variant="secondary" onClick={onClose}>
              {t('取消')}
            </Button>
            <Button type="submit" disabled={busy || (caseMaterial && !confirmed)}>
              {busy ? t('正在发布…') : t('确认发布')}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
