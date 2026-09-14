import { ArrowLeft, Plus, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocialPostSort } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { PostRow } from './PostRow';
import { useCreatePost, useGroupPosts, useGroups } from './queries';
import {
  MixedContentComposer,
  composerContentBlocks,
  composerHasPending,
  type ComposerValue,
} from './composer/MixedContentComposer';

export function ForumPage() {
  const { t } = useI18n();
  const { groupId = '' } = useParams();
  const [sort, setSort] = useState<SocialPostSort>('latest-reply');
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const groups = useGroups();
  const group = groups.data?.data.items.find((item) => item.id === groupId);
  const tagOptions = Array.from(
    new Set([group?.specialty, '随访管理', '同行经验', '健康教育'].filter(Boolean) as string[]),
  );
  const posts = useGroupPosts(groupId, sort, search.trim(), tags);
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
        <label className="community-forum-search">
          {t('搜索本圈主题')}
          <span>
            <Search size={15} />
            <input
              type="search"
              aria-label={t('搜索本圈主题')}
              placeholder={t('搜索标题、内容或标签')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <label>
          {t('主题排序')}
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="most-liked">{t('点赞最多')}</option>
            <option value="most-bookmarked">{t('收藏最多')}</option>
            <option value="most-viewed">{t('浏览最多')}</option>
            <option value="latest">{t('最新发布')}</option>
            <option value="latest-reply">{t('最新回复')}</option>
          </select>
        </label>
        {posts.isFetching && <span>{t('正在更新主题…')}</span>}
        <div className="community-forum-tags-row">
          <fieldset className="community-tag-filters">
            <legend>{t('标签筛选')}</legend>
            <div>
              {tagOptions.map((tag) => (
                <label key={tag} className={tags.includes(tag) ? 'selected' : ''}>
                  <input
                    type="checkbox"
                    checked={tags.includes(tag)}
                    onChange={() =>
                      setTags((current) =>
                        current.includes(tag)
                          ? current.filter((item) => item !== tag)
                          : [...current, tag],
                      )
                    }
                  />
                  {t(tag)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
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
    contentBlocks?: import('@doctor/contracts').CreateSocialContentBlockInput[];
    commandId?: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<ComposerValue>({ body: '', items: [] });
  const [draftCommandId] = useState(() => crypto.randomUUID());
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
      body: content.body,
      tags: tags
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      containsCaseMaterial: caseMaterial,
      deidentificationConfirmed: confirmed,
      contentBlocks: composerContentBlocks(content),
      commandId: draftCommandId,
    }).catch(() => undefined);
  }
  return (
    <div className="community-dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('发布主题')}
        className="community-dialog community-post-dialog"
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
          <MixedContentComposer
            label={t('讨论内容')}
            value={content}
            onChange={setContent}
            rows={7}
            disabled={busy}
          />
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
          <div className="community-confirm-slot">
            <label className={`community-check community-confirm${caseMaterial ? '' : ' hidden'}`}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required={caseMaterial}
              />
              {t('我已手工去除患者身份及可重新识别的信息')}
            </label>
          </div>
          {error && <p className="community-error">{error.message}</p>}
          <footer>
            <Button variant="secondary" onClick={onClose}>
              {t('取消')}
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                composerHasPending(content) ||
                (!content.body.trim() && !content.items.length) ||
                (caseMaterial && !confirmed)
              }
            >
              {busy ? t('正在发布…') : t('确认发布')}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
