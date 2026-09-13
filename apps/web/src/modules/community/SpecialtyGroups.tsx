import { ArrowRight, Check, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { useGroups, useJoinGroup } from './queries';

export function SpecialtyGroups() { const { t } = useI18n(); const groups = useGroups(); const join = useJoinGroup(); return <section className="community-view"><div className="community-view-heading"><div><h2>{t('专科圈子')}</h2><p>{t('圈子是按专科组织的论坛，每个圈子都有独立主题列表')}</p></div></div><div className="community-group-list">{(groups.data?.data.items ?? []).map((group) => <article key={group.id}><div className="community-group-icon"><Users size={18} /></div><div><h3>{group.name}</h3><p>{group.description}</p><small>{group.memberCount} {t('位成员')} · {group.postCount} {t('个主题')}</small></div><div className="community-group-actions">{group.joinedByMe ? <span><Check size={14} />{t('已加入')}</span> : <button type="button" onClick={() => join.mutate(group.id)}>{t('加入圈子')}</button>}<Link to={`/community/groups/${group.id}`}>{t('进入论坛')}<ArrowRight size={14} /></Link></div></article>)}</div></section>; }
