import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardPlus,
  Clock3,
  HeartPulse,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Stethoscope,
  Users,
  Video,
} from 'lucide-react';
import type { DashboardData, DoctorSession, HealthOverview } from '@doctor/contracts';
import { useApi } from '../shared/api';
import { Badge, Card, LoadingState, PageHeader } from '../shared/ui';

const patientStatus = { stable: '管理中', attention: '待关注', 'follow-up': '待随访' } as const;
export function DashboardPage() {
  const { data, loading, error, reload } = useApi<DashboardData>('/dashboard');
  const { data: session } = useApi<DoctorSession>('/session');
  const { data: health } = useApi<HealthOverview>('/health/overview');
  const [scheduleTab, setScheduleTab] = useState('全部');
  if (loading || error || !data) return <LoadingState error={error} onRetry={reload} />;
  const stats = [
    {
      name: '管理患者',
      value: data.stats.patients,
      unit: '人',
      icon: Users,
      tone: 'teal',
      detail: '我的患者档案',
      to: '/patients',
    },
    {
      name: '待处理问诊',
      value: data.stats.pendingEncounters,
      unit: '项',
      icon: MessageSquareText,
      tone: 'blue',
      detail: '有序安排每一次接诊',
      to: '/encounters',
    },
    {
      name: '待审核病历',
      value: data.stats.pendingReviews,
      unit: '份',
      icon: ClipboardCheck,
      tone: 'violet',
      detail: '让每一份记录更完整',
      to: '/records',
    },
    {
      name: '健康关注',
      value: data.stats.healthAlerts,
      unit: '项',
      icon: HeartPulse,
      tone: 'amber',
      detail: '留意患者的健康变化',
      to: '/health',
    },
  ];
  const schedule = data.schedule.filter(
    (item) => scheduleTab === '全部' || item.status === 'waiting',
  );
  return (
    <div className="dashboard">
      <PageHeader
        eyebrow="YOUR DAY, AT A GLANCE"
        title="工作台概览"
        description="每一次用心连接，都是更好的照护。"
        action={
          <div className="date-chip">
            <CalendarDays size={16} />
            <span>2026 年 9 月 10 日</span>
            <span className="date-separator" />
            星期四 <Badge tone="slate">演示日期</Badge>
          </div>
        }
      />
      <section className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-kicker">
            <span className="status-dot" /> CARE THAT CONNECTS
          </div>
          <h2>
            欢迎回来，{session?.doctor.name ?? '演示医生'}
            <span>。</span>
          </h2>
          <p>今天也一起，让专业的诊疗与温暖的关怀同行。</p>
          <div className="welcome-bottom">
            <Link to="/encounters" className="button button-primary">
              查看问诊安排 <ArrowRight size={16} />
            </Link>
            <span>
              <ShieldCheck size={15} /> 当前为框架演示，数据均为虚构
            </span>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-dot dot-one" />
          <div className="art-dot dot-two" />
          <div className="art-plus plus-one">+</div>
          <div className="art-plus plus-two">+</div>
          <div className="health-orb">
            <Stethoscope size={79} strokeWidth={1.25} />
          </div>
          <div className="art-floating art-heart">
            <span>
              <HeartPulse size={22} />
            </span>
            <div>
              <small>用心守护</small>
              <strong>每一份健康</strong>
            </div>
          </div>
          <div className="art-floating art-check">
            <div className="art-check-icon">
              <Check size={17} />
            </div>
            关怀，始终在线
          </div>
        </div>
      </section>
      <div className="metric-grid">
        {stats.map((stat) => (
          <Link to={stat.to} className={`metric-card metric-${stat.tone}`} key={stat.name}>
            <div className="metric-top">
              <span>{stat.name}</span>
              <div className="metric-icon">
                <stat.icon size={20} />
              </div>
            </div>
            <div className="metric-value">
              {stat.value.toString().padStart(2, '0')}
              <span>{stat.unit}</span>
            </div>
            <div className="metric-bottom">
              <span>{stat.detail}</span>
              <ArrowUpRight size={15} />
            </div>
          </Link>
        ))}
      </div>
      <div className="dashboard-middle">
        <Card className="schedule-card">
          <div className="card-heading">
            <div>
              <h2>
                今日问诊安排 <span className="count-pill">{data.schedule.length}</span>
              </h2>
              <p>从一次沟通，开启持续的照护</p>
            </div>
            <Link className="text-link" to="/encounters">
              查看全部 <ChevronRight size={14} />
            </Link>
          </div>
          <div className="schedule-tabs" role="tablist" aria-label="问诊状态">
            {['全部', '待接诊'].map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={scheduleTab === tab}
                className={scheduleTab === tab ? 'selected' : ''}
                onClick={() => setScheduleTab(tab)}
              >
                {tab}
                {tab === '待接诊' && (
                  <span>{data.schedule.filter((item) => item.status === 'waiting').length}</span>
                )}
              </button>
            ))}
            <span className="muted schedule-note">
              <Clock3 size={13} /> 演示日程
            </span>
          </div>
          <div className="schedule-list">
            {schedule.length ? (
              schedule.slice(0, 4).map((item, i) => (
                <div className="schedule-row" key={item.id}>
                  <div className="schedule-time">
                    {new Date(item.scheduledAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Shanghai',
                    })}
                    <span>{item.durationMinutes} 分钟</span>
                  </div>
                  <div className={`avatar avatar-${['mint', 'peach', 'blue', 'lilac'][i % 4]}`}>
                    {item.patientName.slice(0, 1)}
                  </div>
                  <div className="schedule-patient">
                    <strong>
                      {item.patientName}
                      <Badge tone={item.status === 'waiting' ? 'amber' : 'slate'}>
                        {item.status === 'waiting'
                          ? '待接诊'
                          : item.status === 'completed'
                            ? '已完成'
                            : '已预约'}
                      </Badge>
                    </strong>
                    <p>{item.reason}</p>
                  </div>
                  <div className="schedule-kind">
                    {item.type === 'video' ? <Video size={15} /> : <MessageSquareText size={15} />}
                    <span>{item.type === 'video' ? '视频问诊' : '图文问诊'}</span>
                  </div>
                  <Link
                    to="/encounters"
                    className="schedule-open"
                    aria-label={`查看${item.patientName}的问诊`}
                  >
                    <ChevronRight size={17} />
                  </Link>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>当前没有待接诊的演示安排。</p>
              </div>
            )}
          </div>
          <div className="schedule-footer">
            <span>
              <span className="status-dot" /> 演示日程可浏览，实际接诊待上线
            </span>
            <Link to="/encounters">
              前往问诊中心 <ArrowRight size={14} />
            </Link>
          </div>
        </Card>
        <Card className="health-preview">
          <div className="card-heading">
            <div>
              <h2>健康关注</h2>
              <p>关注变化，让照护更及时</p>
            </div>
            <Link className="text-link" to="/health">
              <span>查看</span>
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="health-preview-metric">
            <div className="pulse-icon">
              <Activity size={20} />
            </div>
            <div>
              <span>血压趋势示例</span>
              <strong>
                {health?.observations
                  .filter(
                    (item) =>
                      item.metric === 'systolic' &&
                      item.patientId ===
                        health.observations.find((row) => row.metric === 'systolic')?.patientId,
                  )
                  .at(-1)?.value ?? '—'}
                <small>mmHg</small>
              </strong>
            </div>
            <Badge tone="teal">模拟读数</Badge>
          </div>
          <Trend observations={health?.observations ?? []} />
          <div className="health-alert-list">
            {data.healthAlerts.slice(0, 2).map((alert) => (
              <Link to="/health" className="health-alert-row" key={alert.id}>
                <div className={`alert-dot ${alert.severity}`} />
                <div>
                  <strong>
                    {alert.patientName}
                    <span>
                      {alert.metric} {alert.value}
                    </span>
                  </strong>
                  <p>{alert.description}</p>
                </div>
                <ChevronRight size={15} />
              </Link>
            ))}
          </div>
          <div className="health-data-caption">虚构设备数据 · 仅展示界面与数据结构</div>
        </Card>
      </div>
      <div className="dashboard-lower">
        <Card className="recent-patients">
          <div className="card-heading">
            <div>
              <h2>近期关注的患者</h2>
              <p>把每一份健康档案，放在心上</p>
            </div>
            <Link to="/patients" className="text-link">
              患者管理 <ChevronRight size={14} />
            </Link>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>患者信息</th>
                  <th>健康状况</th>
                  <th>管理状态</th>
                  <th>最近就诊</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {data.recentPatients.slice(0, 4).map((patient, i) => (
                  <tr key={patient.id}>
                    <td>
                      <Link
                        to={`/patients?q=${encodeURIComponent(patient.name)}`}
                        className="table-patient"
                      >
                        <div
                          className={`avatar avatar-${['mint', 'peach', 'blue', 'lilac'][i % 4]} small`}
                        >
                          {patient.name[0]}
                        </div>
                        <div>
                          <strong>{patient.name}</strong>
                          <span>
                            {patient.gender} · {patient.age} 岁
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td>{patient.diagnosis}</td>
                    <td>
                      <Badge
                        tone={
                          patient.status === 'attention'
                            ? 'amber'
                            : patient.status === 'follow-up'
                              ? 'blue'
                              : 'teal'
                        }
                      >
                        {patientStatus[patient.status]}
                      </Badge>
                    </td>
                    <td className="muted">{patient.lastVisit.slice(5).replace('-', ' / ')}</td>
                    <td>
                      <Link
                        className="table-detail"
                        to={`/patients?q=${encodeURIComponent(patient.name)}`}
                        aria-label={`查看${patient.name}档案`}
                      >
                        <ArrowUpRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="quick-actions">
          <div className="card-heading">
            <div>
              <h2>常用功能</h2>
              <p>让工作，更从容一点</p>
            </div>
            <Plus size={18} className="muted" />
          </div>
          <div className="quick-grid">
            {[
              {
                icon: ClipboardPlus,
                label: '病历模板',
                note: '结构化诊疗记录',
                to: '/records',
                tone: 'blue',
              },
              {
                icon: Video,
                label: '发起会诊',
                note: '连接多学科专家',
                to: '/consultations',
                tone: 'violet',
              },
              {
                icon: HeartPulse,
                label: '健康计划',
                note: '延续患者关怀',
                to: '/health',
                tone: 'teal',
              },
              {
                icon: ShieldCheck,
                label: '我的操作',
                note: '每一步都有迹可循',
                to: '/audit',
                tone: 'amber',
              },
            ].map((action) => (
              <Link className={`quick-action metric-${action.tone}`} key={action.to} to={action.to}>
                <div className="metric-icon">
                  <action.icon size={22} />
                </div>
                <strong>{action.label}</strong>
                <small>{action.note}</small>
              </Link>
            ))}
          </div>
          <div className="quick-note">
            <span className="tiny-spark">✦</span> 从专业出发，让医养服务更有温度
          </div>
        </Card>
      </div>
    </div>
  );
}

function Trend({ observations }: { observations: HealthOverview['observations'] }) {
  const firstPatient = observations.find((item) => item.metric === 'systolic')?.patientId;
  const rows = observations
    .filter((item) => item.patientId === firstPatient && item.metric === 'systolic')
    .slice(-7);
  if (rows.length < 2) return <div className="trend-empty">趋势数据加载中</div>;
  const width = 330;
  const height = 83;
  const min = Math.min(...rows.map((item) => item.value)) - 8;
  const max = Math.max(...rows.map((item) => item.value)) + 8;
  const points = rows.map(
    (item, i) =>
      `${5 + i * ((width - 10) / (rows.length - 1))},${height - ((item.value - min) / (max - min)) * 62 - 10}`,
  );
  return (
    <div className="mini-trend">
      <svg viewBox={`0 0 ${width} 96`} role="img" aria-label="患者最近七次模拟收缩压趋势">
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#42b2a1" stopOpacity=".2" />
            <stop offset="100%" stopColor="#42b2a1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="25" x2={width} y2="25" stroke="#eaf0f1" strokeDasharray="4 4" />
        <line x1="0" y1="60" x2={width} y2="60" stroke="#eaf0f1" strokeDasharray="4 4" />
        <polygon points={`5,93 ${points.join(' ')} ${width - 5},93`} fill="url(#trend-fill)" />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#42a997"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, i) => {
          const [cx, cy] = point.split(',');
          return (
            <circle key={i} cx={cx} cy={cy} r="3" fill="white" stroke="#42a997" strokeWidth="2" />
          );
        })}
      </svg>
      <div className="trend-dates">
        {rows.map((row) => (
          <span key={row.id}>{row.measuredAt.slice(5, 10).replace('-', '/')}</span>
        ))}
      </div>
    </div>
  );
}
