import { useI18n } from '../../shared/i18n';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, HeartPulse, Plus, Search, ShieldCheck, Users } from 'lucide-react';
import type { Patient, MedicalRecord } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  Metric,
  PersonAvatar,
  PlannedDialog,
  ReadOnlyNote,
  SectionTitle,
} from '../ui';

const statusLabels: Record<Patient['status'], string> = {
  stable: '状态平稳',
  attention: '需要关注',
  'follow-up': '待随访',
};
const statusTones = { stable: 'teal', attention: 'amber', 'follow-up': 'blue' } as const;

function PatientRecords({ patientId }: { patientId: string }) {
  const { t, formatDate } = useI18n();
  // The records API returns the doctor's scoped collection; filtering by patient is local.
  const { data, loading, error, reload } = useApi<MedicalRecord[]>('/records');
  const records = data?.filter((record) => record.patientId === patientId) ?? [];
  if (loading || error) return <LoadingState error={error} onRetry={reload} />;
  return (
    <div className="feature-timeline">
      {records.map((record) => (
        <div className="feature-timeline-item" key={record.id}>
          <time>{formatDate(record.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
          <h4>{record.title}</h4>
          <p>
            {record.diagnosis} · {record.authorName} ·{' '}
            {t('版本 {version}', { version: record.version })}
          </p>
        </div>
      ))}
      {!records.length && (
        <EmptyState title={t('暂无诊疗记录')} description={t('后续完成的诊疗记录将在这里汇总。')} />
      )}
    </div>
  );
}

function PatientDetail({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { t, formatDate } = useI18n();
  // Fetching the detail endpoint rechecks patient scope and records this access in audit.
  const {
    data: patient,
    loading,
    error,
    reload,
  } = useApi<Patient>('/patients/' + encodeURIComponent(patientId));
  const [tab, setTab] = useState('profile');
  return (
    <FeatureDialog
      title={t('患者健康档案')}
      subtitle={t('仅限当前演示医生负责的患者')}
      onClose={onClose}
    >
      {loading || error || !patient ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-person-header">
            <PersonAvatar name={patient.name} size="large" />
            <div>
              <h3>{patient.name}</h3>
              <p>
                {t(patient.gender)} · {t('{age} 岁', { age: patient.age })} · {patient.id}
              </p>
            </div>
          </div>
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'profile', label: '基本资料' },
              { value: 'history', label: '病史与过敏' },
              { value: 'records', label: '诊疗记录' },
            ]}
            label={t('患者详情分类')}
          />
          {tab === 'profile' && (
            <>
              <Badge tone={statusTones[patient.status]}>{t(statusLabels[patient.status])}</Badge>
              <DetailGrid
                items={[
                  { label: '联系电话', value: patient.phone },
                  { label: '健康分类', value: patient.diagnosis },
                  { label: '最近就诊', value: formatDate(patient.lastVisit) },
                  { label: '下次随访', value: formatDate(patient.nextFollowUp) },
                ]}
              />
              <h4 className="feature-small-heading">{t('照护摘要')}</h4>
              <p className="feature-prose">{patient.careSummary}</p>
              <div className="feature-tag-row">
                {patient.tags.map((tag) => (
                  <Badge key={tag} tone="slate">
                    {tag}
                  </Badge>
                ))}
              </div>
            </>
          )}
          {tab === 'history' && (
            <>
              <h4 className="feature-small-heading">{t('既往病史')}</h4>
              {patient.medicalHistory.map((item, index) => (
                <p className="feature-prose" key={item + index}>
                  {item}
                </p>
              ))}
              {!patient.medicalHistory.length && (
                <p className="feature-prose">{t('暂无既往病史记录')}</p>
              )}
              <h4 className="feature-small-heading">{t('过敏史')}</h4>
              <div className="feature-tag-row">
                {patient.allergies.length ? (
                  patient.allergies.map((item) => (
                    <Badge tone="amber" key={item}>
                      {item}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="slate">{t('暂无过敏记录')}</Badge>
                )}
              </div>
              <div className="feature-notice">
                <ShieldCheck size={17} />
                <span>
                  {t('演示档案不可编辑。患者建档、信息修改与跨医院数据导入将在后续迭代提供。')}
                </span>
              </div>
            </>
          )}
          {tab === 'records' && <PatientRecords patientId={patient.id} />}
          <ReadOnlyNote />
        </>
      )}
    </FeatureDialog>
  );
}

export function PatientsPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<Patient[]>('/patients?pageSize=100');
  const [searchParams, setSearchParams] = useSearchParams();
  // URL parameters are the source of truth, including same-route searches from the shell.
  const query = searchParams.get('q') ?? '';
  const requestedStatus = searchParams.get('status') ?? 'all';
  const status = ['stable', 'attention', 'follow-up'].includes(requestedStatus)
    ? requestedStatus
    : 'all';
  const setQuery = (value: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  const setStatus = (value: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === 'all') next.delete('status');
        else next.set('status', value);
        return next;
      },
      { replace: true },
    );
  const [selected, setSelected] = useState<string | null>(null);
  const [showPlanned, setShowPlanned] = useState(false);
  const closePatient = useCallback(() => setSelected(null), []);
  const closePlanned = useCallback(() => setShowPlanned(false), []);
  const patients = useMemo(
    () =>
      (data ?? []).filter(
        (patient) =>
          (status === 'all' || patient.status === status) &&
          [patient.name, patient.id, patient.diagnosis, ...patient.tags]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
      ),
    [data, query, status],
  );
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="PATIENT MANAGEMENT"
        title={t('患者管理')}
        description={t('让每一份关注，都有迹可循。管理您负责的患者与连续健康档案。')}
        action={
          <Button onClick={() => setShowPlanned(true)}>
            <Plus size={16} />
            {t('患者建档')}
            <span className="feature-mini-label">{t('即将上线')}</span>
          </Button>
        }
      />
      {loading || error ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-metrics">
            <Metric
              icon={Users}
              label={t('我的患者')}
              value={
                <>
                  {data?.length ?? 0}
                  <small>{t('人')}</small>
                </>
              }
              detail={t('已分配至当前演示医生')}
            />
            <Metric
              icon={HeartPulse}
              label={t('状态平稳')}
              value={data?.filter((patient) => patient.status === 'stable').length ?? 0}
              detail={t('按演示档案标签汇总')}
              tone="blue"
            />
            <Metric
              icon={CalendarClock}
              label={t('待随访患者')}
              value={data?.filter((patient) => patient.status === 'follow-up').length ?? 0}
              detail={t('连续照护，从一次随访开始')}
              tone="amber"
            />
            <Metric
              icon={ShieldCheck}
              label={t('需要关注')}
              value={data?.filter((patient) => patient.status === 'attention').length ?? 0}
              detail={t('演示标记，非临床风险判断')}
              tone="rose"
            />
          </div>
          <Card className="feature-card-pad">
            <SectionTitle title={t('患者档案')} subtitle={t('PATIENT DIRECTORY · 演示数据')} />
            <div className="feature-toolbar">
              <FilterTabs
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: '全部患者', count: data?.length },
                  { value: 'stable', label: '状态平稳' },
                  { value: 'follow-up', label: '待随访' },
                  { value: 'attention', label: '需要关注' },
                ]}
              />
              <label className="feature-search">
                <Search size={16} />
                <input
                  aria-label={t('搜索患者姓名、编号或疾病')}
                  placeholder={t('搜索姓名、编号或疾病')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            {patients.length ? (
              <div className="feature-table-wrap">
                <table className="feature-table">
                  <thead>
                    <tr>
                      <th>{t('患者信息')}</th>
                      <th>{t('健康分类')}</th>
                      <th>{t('管理状态')}</th>
                      <th>{t('最近就诊')}</th>
                      <th>{t('下次随访')}</th>
                      <th>{t('档案')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((patient, index) => (
                      <tr key={patient.id}>
                        <td>
                          <div className="feature-person">
                            <PersonAvatar name={patient.name} tone={index} />
                            <div>
                              <strong>{patient.name}</strong>
                              <small>
                                {t(patient.gender)} · {t('{age} 岁', { age: patient.age })} ·{' '}
                                {patient.id}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{patient.diagnosis}</td>
                        <td>
                          <Badge tone={statusTones[patient.status]}>
                            {t(statusLabels[patient.status])}
                          </Badge>
                        </td>
                        <td>{formatDate(patient.lastVisit)}</td>
                        <td>{formatDate(patient.nextFollowUp)}</td>
                        <td>
                          <LinkAction onClick={() => setSelected(patient.id)}>
                            {t('查看档案')}
                          </LinkAction>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={t('未找到符合条件的患者')}
                description={t('请尝试其他姓名、编号或筛选条件。')}
              />
            )}
            <div className="feature-table-footer">
              <span>
                {t('共 {total} 位演示患者 · 当前显示 {count} 位', {
                  total: data?.length ?? 0,
                  count: patients.length,
                })}
              </span>
              <span className="feature-inline-icon">
                <ShieldCheck size={13} />
                {t('医生数据访问范围已隔离')}
              </span>
            </div>
          </Card>
          <ReadOnlyNote />
        </>
      )}
      {selected && <PatientDetail patientId={selected} onClose={closePatient} />}
      {showPlanned && (
        <PlannedDialog title={t('新建患者档案')} iteration="Iteration 1" onClose={closePlanned}>
          <p>{t('患者建档将按以下流程接入患者管理模块：')}</p>
          <ol>
            <li>{t('核验患者身份及数据使用授权。')}</li>
            <li>{t('填写基本信息、过敏史与既往病史。')}</li>
            <li>{t('绑定负责医生，生成独立健康档案。')}</li>
          </ol>
          <p>{t('后端已预留患者档案与医生访问范围的接口边界。')}</p>
        </PlannedDialog>
      )}
    </div>
  );
}
