import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Video,
} from 'lucide-react';
import type { DoctorSession } from '@doctor/contracts';
import { useApi } from './shared/api';
import { Badge, Button, Modal } from './shared/ui';
import { DashboardPage } from './dashboard/DashboardPage';
import {
  AuditPage,
  CommunityPage,
  ConsultationsPage,
  EncountersPage,
  HealthPage,
  PatientsPage,
  RecordsPage,
  SettingsPage,
} from './modules';

const navigation = [
  { path: '/', label: '工作台', en: 'Overview', icon: LayoutDashboard },
  { path: '/patients', label: '患者管理', en: 'Patients', icon: Users },
  { path: '/encounters', label: '在线问诊', en: 'Encounters', icon: MessageSquareText },
  { path: '/records', label: '电子病历', en: 'Medical records', icon: ClipboardList },
  { path: '/consultations', label: '远程会诊', en: 'Consultations', icon: Video },
  { path: '/health', label: '健康管理', en: 'Health management', icon: HeartPulse },
];

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="CareLink 首页">
      <div className="brand-mark">
        <Stethoscope size={25} strokeWidth={2.1} />
        <span />
      </div>
      <div>
        <strong>
          Care<span>Link</span>
        </strong>
        <small>智慧医养 · 医生工作台</small>
      </div>
    </Link>
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = useApi<DoctorSession>('/session');
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState<'notifications' | 'help' | null>(null);
  const [communityEnabled, setCommunityEnabled] = useState(
    localStorage.getItem('carelink-community-enabled') !== 'false',
  );
  useEffect(() => {
    const listener = () =>
      setCommunityEnabled(localStorage.getItem('carelink-community-enabled') !== 'false');
    window.addEventListener('carelink-preferences-changed', listener);
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener('carelink-preferences-changed', listener);
      window.removeEventListener('storage', listener);
    };
  }, []);
  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const title =
    navigation.find((item) => item.path === location.pathname)?.label ??
    ({ '/audit': '操作审计', '/community': '同行协作', '/settings': '设置中心' }[
      location.pathname
    ] ||
      '页面');
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="收起导航"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-icon">
            <Activity size={19} />
          </div>
          <div>
            <strong>医生服务中心</strong>
            <span>医养协同服务平台</span>
          </div>
          <ChevronDown size={16} />
        </div>
        <nav aria-label="主导航">
          <p className="nav-label">诊疗工作</p>
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.path === '/' && <span className="nav-current-dot" />}
            </NavLink>
          ))}
          <p className="nav-label nav-label-second">协作与管理</p>
          {communityEnabled && (
            <NavLink to="/community" className="nav-item">
              <BookOpen size={19} />
              <span>同行协作</span>
              <span className="nav-soon">规划中</span>
            </NavLink>
          )}
          <NavLink to="/audit" className="nav-item">
            <ShieldCheck size={19} />
            <span>操作审计</span>
          </NavLink>
          <NavLink to="/settings" className="nav-item">
            <Settings size={19} />
            <span>设置中心</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="sidebar-note-icon">
              <HeartPulse size={21} />
            </div>
            <strong>让关怀，更有连接</strong>
            <p>
              连接每一次诊疗，
              <br />
              守护每一段健康旅程。
            </p>
            <button onClick={() => setDialog('help')}>
              了解工作台 <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="sidebar-profile" onClick={() => navigate('/settings')}>
            <div className="avatar avatar-teal">{session?.doctor.avatarInitials ?? '医'}</div>
            <div>
              <strong>
                {session?.doctor.name ?? '演示医生'} <span>医生</span>
              </strong>
              <small>{session?.doctor.department ?? '医生服务中心'}</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="展开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>医生服务中心</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/patients?q=${encodeURIComponent(query)}`);
              }}
            >
              <Search size={17} />
              <input
                aria-label="全局患者搜索"
                placeholder="搜索患者、患者编号…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <button
              className="icon-button help-button"
              aria-label="使用帮助"
              onClick={() => setDialog('help')}
            >
              <CircleHelp size={20} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="通知中心"
              onClick={() => setDialog('notifications')}
            >
              <Bell size={20} />
              <span />
            </button>
            <div className="topbar-divider" />
            <button
              className="topbar-profile"
              onClick={() => navigate('/settings')}
              aria-label="打开个人设置"
            >
              <div className="avatar avatar-teal small">
                {session?.doctor.avatarInitials ?? '医'}
              </div>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/encounters" element={<EncountersPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/consultations" element={<ConsultationsPage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <div className="empty-state">
                  <h1>页面暂未收录</h1>
                  <p>请通过侧边导航访问医生工作台。</p>
                  <Link className="button button-primary" to="/">
                    返回工作台
                  </Link>
                </div>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>
              CareLink 医生服务系统 <span className="footer-dot">·</span> Iteration 0
            </span>
            <span>
              <span className="status-dot" /> 框架演示 · 仅使用虚构数据
            </span>
          </footer>
        </main>
      </div>
      {dialog && (
        <Modal
          title={dialog === 'notifications' ? '通知中心' : '欢迎使用 CareLink'}
          onClose={() => setDialog(null)}
        >
          {dialog === 'notifications' ? (
            <>
              <div className="notice-row">
                <div className="notice-symbol">
                  <Bell size={21} />
                </div>
                <div>
                  <h3>工作台框架已就绪</h3>
                  <p>现在可以浏览患者档案、问诊安排与健康趋势示例。</p>
                  <Badge tone="teal">本地演示通知</Badge>
                </div>
              </div>
              <div className="notice-row">
                <div className="notice-symbol amber">
                  <CalendarDays size={21} />
                </div>
                <div>
                  <h3>消息推送将在后续迭代上线</h3>
                  <p>目前没有连接患者端或消息服务，也不会发送临床提醒。</p>
                  <Badge tone="amber">待上线 · 后续迭代</Badge>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="modal-lead">把患者信息、诊疗协作与持续健康管理，连接在同一个工作台。</p>
              <div className="help-grid">
                <Info
                  title="浏览演示"
                  text="查看左侧业务模块，通过搜索、筛选和详情面板了解计划中的工作流程。"
                />
                <Info
                  title="功能状态"
                  text="标记「待上线」的操作尚未接入真实业务，所有演示人物和数据均为虚构。"
                />
                <Info
                  title="开发边界"
                  text="当前提供前后端框架与本地数据库。真实认证、业务写入、视频与消息将在后续迭代开发。"
                />
              </div>
              <Button onClick={() => setDialog(null)}>
                开始浏览 <ChevronRight size={16} />
              </Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function Info({ title, text }: { title: string; text: ReactNode }) {
  return (
    <div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
