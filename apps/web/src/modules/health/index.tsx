import { useI18n } from '../../shared/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  CalendarCheck2,
  ClipboardList,
  Droplets,
  HeartPulse,
  Plus,
  Radio,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { HealthOverview, Observation } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  LinkAction,
  Metric,
  PlannedDialog,
  ReadOnlyNote,
  SectionTitle,
} from '../ui';

function TrendChart({ observations }: { observations: Observation[] }) {
  const { t, formatDate } = useI18n();
  const systolic = observations
    .filter((item) => item.metric === 'systolic')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const diastolic = observations
    .filter((item) => item.metric === 'diastolic')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const all = [...systolic, ...diastolic];
  if (!all.length)
    return (
      <EmptyState
        title={t('该患者暂无血压趋势数据')}
        description={t('设备连接功能尚未启用；这里只显示已有演示观测记录。')}
      />
    );
  const dates = Array.from(new Set(all.map((item) => item.measuredAt.slice(0, 10)))).sort();
  const min = Math.floor((Math.min(...all.map((item) => item.value)) - 10) / 20) * 20;
  const max = Math.ceil((Math.max(...all.map((item) => item.value)) + 10) / 20) * 20;
  const x = (item: Observation) =>
    50 + (dates.indexOf(item.measuredAt.slice(0, 10)) / Math.max(dates.length - 1, 1)) * 490;
  const y = (value: number) => 182 - ((value - min) / (max - min)) * 155;
  const line = (items: Observation[]) =>
    items.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(item)} ${y(item.value)}`).join(' ');
  return (
    <>
      <div className="health-chart">
        <svg
          viewBox="0 0 570 215"
          role="img"
          aria-label={t('演示血压趋势，{value0} 个日期；下方可查看各次观测的具体数据。', {
            value0: dates.length,
          })}
        >
          <defs>
            <linearGradient id="health-bp-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5bb5a1" stopOpacity=".15" />
              <stop offset="100%" stopColor="#5bb5a1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((index) => {
            const value = min + ((max - min) * index) / 4;
            return (
              <g key={index}>
                <line
                  x1="43"
                  x2="550"
                  y1={y(value)}
                  y2={y(value)}
                  stroke="#e9eff0"
                  strokeDasharray="3 5"
                />
                <text x="7" y={y(value) + 3} fontSize="9" fill="#a7b5bb">
                  {Math.round(value)}
                </text>
              </g>
            );
          })}
          {systolic.length > 1 && (
            <path
              d={`${line(systolic)} L ${x(systolic[systolic.length - 1])} 182 L ${x(systolic[0])} 182 Z`}
              fill="url(#health-bp-fill)"
            />
          )}
          <path
            d={line(systolic)}
            fill="none"
            stroke="#4aa993"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d={line(diastolic)}
            fill="none"
            stroke="#a4bcdc"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {all.map((item) => (
            <circle
              key={item.id}
              cx={x(item)}
              cy={y(item.value)}
              r="3.5"
              fill="white"
              stroke={item.metric === 'systolic' ? '#4aa993' : '#a4bcdc'}
              strokeWidth="2"
            >
              <title>
                {formatDate(item.measuredAt)}{' '}
                {item.metric === 'systolic' ? t('收缩压') : t('舒张压')}：{item.value} {item.unit}
              </title>
            </circle>
          ))}
          {dates.map((date) => (
            <text
              key={date}
              x={50 + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * 490}
              y="207"
              textAnchor="middle"
              fontSize="9"
              fill="#a0aeb5"
            >
              {formatDate(date, { month: 'numeric', day: 'numeric' })}
            </text>
          ))}
        </svg>
      </div>
      <div className="health-chart-legend">
        <span>
          <i />
          {t('收缩压 · mmHg')}
        </span>
        <span>
          <i />
          {t('舒张压 · mmHg')}
        </span>
      </div>
    </>
  );
}

const metricLabels: Record<Observation['metric'], string> = {
  systolic: '收缩压',
  diastolic: '舒张压',
  glucose: '血糖',
  'heart-rate': '心率',
};

export function HealthPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<HealthOverview>('/health/overview');
  const [patientId, setPatientId] = useState('');
  const [planned, setPlanned] = useState<string | null>(null);
  const [showReadings, setShowReadings] = useState(false);
  const closePlanned = useCallback(() => setPlanned(null), []);
  const closeReadings = useCallback(() => setShowReadings(false), []);
  const patients = useMemo(() => {
    const names = new Map<string, string>();
    data?.carePlans.forEach((plan) => names.set(plan.patientId, plan.patientName));
    data?.alerts.forEach((alert) => names.set(alert.patientId, alert.patientName));
    data?.observations.forEach((item) => {
      if (!names.has(item.patientId)) names.set(item.patientId, item.patientId);
    });
    return [...names].map(([id, name]) => ({ id, name }));
  }, [data]);
  const activePatient = patientId || patients[0]?.id || '';
  const observations = useMemo(
    () => (data?.observations ?? []).filter((item) => item.patientId === activePatient),
    [activePatient, data],
  );
  const latest = (metric: Observation['metric']) =>
    observations
      .filter((item) => item.metric === metric)
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const plans = (data?.carePlans ?? []).filter((plan) => plan.patientId === activePatient);
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="CONTINUOUS HEALTH MANAGEMENT"
        title={t('健康管理')}
        description={t('关注日常健康变化，让照护从诊室延伸到每一天。')}
        action={
          <Button onClick={() => setPlanned('新建健康管理计划')}>
            <Plus size={16} />
            {t('新建管理计划')}
          </Button>
        }
      />
      {loading || error || !data ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-metrics">
            <Metric
              icon={HeartPulse}
              label={t('纳入健康管理')}
              value={
                <>
                  {data.summary.monitoredPatients}
                  <small>{t('人')}</small>
                </>
              }
              detail={t('虚构患者健康数据')}
            />
            <Metric
              icon={ClipboardList}
              label={t('进行中的计划')}
              value={data.summary.activePlans}
              detail={t('健康管理计划演示')}
              tone="blue"
            />
            <Metric
              icon={Activity}
              label={t('待医生查看')}
              value={data.summary.needsReview}
              detail={t('演示提醒，不构成临床预警')}
              tone="amber"
            />
            <Metric
              icon={BellRing}
              label={t('计划中的提醒')}
              value={data.summary.remindersPlanned}
              detail={t('提醒发送功能尚未上线')}
              tone="rose"
            />
          </div>
          <div className="feature-toolbar">
            <SectionTitle
              title={t('患者健康概览')}
              subtitle={t('数据来自本地合成样本，未连接任何真实设备')}
            />
            <select
              aria-label={t('选择健康管理患者')}
              className="feature-select"
              value={activePatient}
              onChange={(event) => setPatientId(event.target.value)}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.id}
                </option>
              ))}
            </select>
          </div>
          <div className="feature-columns">
            <Card className="feature-card-pad">
              <SectionTitle title={t('血压变化趋势')} subtitle={t('BLOOD PRESSURE · 合成演示观测')}>
                <LinkAction onClick={() => setShowReadings(true)}>{t('查看观测数据')}</LinkAction>
              </SectionTitle>
              <TrendChart observations={observations} />
              <ReadOnlyNote>{t('此图不显示临床正常范围，不作诊断、分级或治疗建议。')}</ReadOnlyNote>
            </Card>
            <Card className="feature-card-pad">
              <SectionTitle title={t('最近一次观测')} subtitle={t('按指标展示最新合成读数')} />
              {(
                [
                  { metric: 'systolic', icon: HeartPulse, tone: 'teal' },
                  { metric: 'glucose', icon: Droplets, tone: 'blue' },
                  { metric: 'heart-rate', icon: Activity, tone: 'rose' },
                ] as const
              ).map((item) => {
                const reading = latest(item.metric);
                return (
                  <div className="health-reading" key={item.metric}>
                    <span className={`feature-symbol ${item.tone}`}>
                      <item.icon size={19} />
                    </span>
                    <div>
                      <h3>{t(metricLabels[item.metric])}</h3>
                      <p>
                        {reading?.value ?? '—'}
                        <small>{reading?.unit ?? ''}</small>
                      </p>
                    </div>
                    <span className="feature-mini-label">
                      {reading
                        ? formatDate(reading.measuredAt, { month: 'short', day: 'numeric' })
                        : t('暂无数据')}
                    </span>
                  </div>
                );
              })}
              <div className="feature-notice">
                <Radio size={17} />
                <span>
                  {t('尚未连接可穿戴设备')}
                  <br />
                  {t('设备厂商接口将在后续迭代接入')}
                </span>
              </div>
            </Card>
          </div>
          <div className="feature-columns" style={{ marginTop: 22 }}>
            <Card className="feature-card-pad">
              <SectionTitle title={t('连续照护计划')} subtitle={t('CARE PLANS · 仅展示演示计划')} />
              {plans.length ? (
                plans.map((plan) => (
                  <div className="health-plan" key={plan.id}>
                    <span className="feature-symbol">
                      <Target size={19} />
                    </span>
                    <div>
                      <h3>{t(plan.title)}</h3>
                      <p>{plan.goals.join(' · ')}</p>
                      <div className="feature-mini-label" style={{ marginTop: 10 }}>
                        {t('下次复核：{date} · 演示完成进度 {progress}%', {
                          date: formatDate(plan.nextReview),
                          progress: plan.completionPercent,
                        })}
                      </div>
                    </div>
                    <Badge tone={plan.status === 'active' ? 'teal' : 'slate'}>
                      {plan.status === 'active' ? t('进行中') : t('草稿')}
                    </Badge>
                  </div>
                ))
              ) : (
                <EmptyState
                  title={t('暂无关联的照护计划')}
                  description={t('选择其他患者浏览演示计划。')}
                />
              )}
              <LinkAction onClick={() => setPlanned('健康管理计划与复核')}>
                {t('查看计划功能规划')}
              </LinkAction>
            </Card>
            <Card className="feature-card-pad">
              <SectionTitle title={t('关注事项')} subtitle={t('仅列出当前患者的演示标记')} />
              {data.alerts
                .filter((alert) => alert.patientId === activePatient)
                .map((alert) => (
                  <div className="feature-alert-box" key={alert.id}>
                    <strong>
                      {t(alert.metric)} · {alert.value}
                    </strong>
                    <p style={{ margin: '7px 0' }}>{alert.description}</p>
                    <span style={{ fontSize: 10 }}>
                      {alert.sourceLabel} · {formatDate(alert.measuredAt)}
                    </span>
                  </div>
                ))}
              {!data.alerts.some((alert) => alert.patientId === activePatient) && (
                <div className="feature-info-card">
                  <ShieldCheck size={22} />
                  <h3>{t('当前无演示关注事项')}</h3>
                  <p>{t('此状态仅反映样本标签，不代表对患者健康状态的判断。')}</p>
                </div>
              )}
              <div className="feature-coming-panel">
                <CalendarCheck2 size={22} />
                <div>
                  <h3>{t('随访与提醒 · 规划中')}</h3>
                  <p>{t('量表评估、健康报告、自动提醒与家属协同将分步接入。')}</p>
                </div>
              </div>
            </Card>
          </div>
          <ReadOnlyNote />
        </>
      )}
      {showReadings && (
        <FeatureDialog
          title={t('健康观测记录')}
          subtitle={t('{value0} · 合成演示数据', {
            value0: patients.find((patient) => patient.id === activePatient)?.name ?? '',
          })}
          onClose={closeReadings}
          wide
        >
          <div className="feature-table-wrap">
            <table className="feature-table">
              <thead>
                <tr>
                  <th>{t('指标')}</th>
                  <th>{t('数值')}</th>
                  <th>{t('测量时间')}</th>
                  <th>{t('数据来源')}</th>
                </tr>
              </thead>
              <tbody>
                {[...observations]
                  .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{t(metricLabels[item.metric])}</td>
                      <td>
                        {item.value} {item.unit}
                      </td>
                      <td>
                        {formatDate(item.measuredAt, { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td>{item.sourceLabel}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!observations.length && (
            <EmptyState title={t('暂无观测记录')} description={t('该演示患者尚未配置合成读数。')} />
          )}
          <DetailGrid
            items={[
              { label: '数据模式', value: 'synthetic-demo' },
              { label: '真实设备', value: '未连接' },
            ]}
          />
        </FeatureDialog>
      )}
      {planned && (
        <PlannedDialog title={planned} iteration="Iteration 2–4" onClose={closePlanned}>
          <p>
            {t(
              'Iteration 2 完成人工健康计划和随访提醒，Iteration 4 接入医院及设备数据。健康管理将支持目标设定、计划复核、量表评估、设备数据接入和随访提醒。',
            )}
          </p>
          <p>
            {t(
              '观测记录保留测量时间、接收时间、来源与授权信息。提醒规则与临床评估需要单独验证，当前不会生成或发送健康建议。',
            )}
          </p>
        </PlannedDialog>
      )}
    </div>
  );
}
