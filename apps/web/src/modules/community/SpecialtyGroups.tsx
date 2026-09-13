import { ArrowRight, LogOut, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { useGroups, useJoinGroup, useLeaveGroup } from './queries';

export function SpecialtyGroups() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const groups = useGroups(query.trim());
  const join = useJoinGroup();
  const leave = useLeaveGroup();
  return (
    <section className="community-view">
      <div className="community-view-heading">
        <div>
          <h2>{t('专科圈子')}</h2>
          <p>{t('圈子是按专科组织的论坛，每个圈子都有独立主题列表')}</p>
        </div>
        <label className="community-search">
          <Search size={15} />
          <input
            aria-label={t('搜索专科圈子')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('输入圈子名称或专科')}
          />
        </label>
      </div>
      <div className="community-group-list">
        {(groups.data?.data.items ?? []).map((group) => (
          <article key={group.id}>
            <div className="community-group-icon">
              <Users size={18} />
            </div>
            <div>
              <h3>{group.name}</h3>
              <p>{group.description}</p>
              <small>
                {group.memberCount} {t('位成员')} · {group.postCount} {t('个主题')}
              </small>
            </div>
            <div className="community-group-actions">
              {group.joinedByMe ? (
                <button type="button" onClick={() => leave.mutate(group.id)}>
                  <LogOut size={13} />
                  {t('退出圈子')}
                </button>
              ) : (
                <button type="button" onClick={() => join.mutate(group.id)}>
                  {t('加入圈子')}
                </button>
              )}
              {group.joinedByMe && (
                <Link to={`/community/groups/${group.id}`}>
                  {t('进入论坛')}
                  <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
