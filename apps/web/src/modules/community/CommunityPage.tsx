import { Bell, BookOpen, MessageCircle, Settings, UserRound } from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useI18n } from '../../shared/i18n';
import { CommunityFeed } from './CommunityFeed';
import { CommunityPreferences } from './CommunityPreferences';
import { DirectMessages } from './DirectMessages';
import { ForumPage } from './ForumPage';
import { MyCommunity } from './MyCommunity';
import { PersonalListPage } from './PersonalListPage';
import { PostPage } from './PostPage';
import { SpecialtyGroups } from './SpecialtyGroups';
import './community.css';
import { useSocialPreferences } from './queries';

export function CommunityPage() {
  const { t } = useI18n();
  const preferences = useSocialPreferences();
  const links = [
    { to: '/community', label: '社区首页', icon: BookOpen, end: true },
    { to: '/community/groups', label: '专科圈子', icon: UserRound },
    { to: '/community/me', label: '我的社区', icon: Bell },
    { to: '/community/messages', label: '同行私信', icon: MessageCircle },
    { to: '/community/settings', label: '社区设置', icon: Settings },
  ] as const;
  if (!preferences.data) return <div className="community-loading">{t('正在加载设置…')}</div>;
  if (!preferences.data.data.enabled)
    return (
      <div className="community-workspace">
        <header className="community-page-heading">
          <h1>{t('同行社区')}</h1>
          <p>{t('社区入口已关闭，可在下方重新开启，不影响诊疗工作。')}</p>
        </header>
        <CommunityPreferences />
      </div>
    );
  return (
    <div className="community-workspace">
      <header className="community-page-heading">
        <h1>{t('同行社区')}</h1>
        <p>{t('面向医生的专业论坛与同行私信，和患者临床资料严格分开。')}</p>
      </header>
      <nav className="community-tabs" aria-label={t('同行社区导航')}>
        {links.map((item) => (
          <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false}>
            <item.icon size={15} />
            {t(item.label)}
          </NavLink>
        ))}
      </nav>
      <div className="community-boundary-note">
        {t('请勿发布可识别患者身份的信息；社区讨论不能直接用于临床决策。')}
      </div>
      <Routes>
        <Route index element={<CommunityFeed />} />
        <Route path="groups" element={<SpecialtyGroups />} />
        <Route path="groups/:groupId" element={<ForumPage />} />
        <Route path="posts/:postId" element={<PostPage />} />
        <Route path="me" element={<MyCommunity />} />
        <Route path="me/:kind" element={<PersonalListPage />} />
        <Route path="messages" element={<DirectMessages />} />
        <Route path="settings" element={<CommunityPreferences />} />
      </Routes>
    </div>
  );
}
