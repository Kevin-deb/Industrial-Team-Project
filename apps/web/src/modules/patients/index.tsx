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
  // The records API returns the doctor's scoped collection; filtering by patient is local.
  const { data, loading, error, reload } = useApi<MedicalRecord[]>('/records');
  const records = data?.filter((record) => record.patientId === patientId) ?? [];
  if (loading || error) return <LoadingState error={error} onRetry={reload} />;
  return (
    <div className="feature-timeline">
      {records.map((record) => (
        <div className="feature-timeline-item" key={record.id}>
          <time>{record.updatedAt.replace('T', ' ').slice(0, 16)}</time>
          <h4>{record.title}</h4>
          <p>
            {record.diagnosis} · {record.authorName} · 版本 {record.version}
          </p>
        </div>
      ))}
      {!records.length && (
        <EmptyState title="暂无诊疗记录" description="后续完成的诊疗记录将在这里汇总。" />
      )}
    </div>
  );
}

function PatientDetail({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  // Fetching the detail endpoint rechecks patient scope and records this access in audit.
  const {
    data: patient,
    loading,
    error,
    reload,
  } = useApi<Patient>('/patients/' + encodeURIComponent(patientId));
  const [tab, setTab] = useState('profile');
  return (
    <FeatureDialog title="患者健康档案" subtitle="仅限当前演示医生负责的患者" onClose={onClose}>
      {loading || error || !patient ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-person-header">
            <PersonAvatar name={patient.name} size="large" />
            <div>
              <h3>{patient.name}</h3>
              <p>
                {patient.gender} · {patient.age} 岁 · {patient.id}
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
            label="患者详情分类"
          />
          {tab === 'profile' && (
            <>
              <Badge tone={statusTones[patient.status]}>{statusLabels[patient.status]}</Badge>
              <DetailGrid
                items={[
                  { label: '联系电话', value: patient.phone },
                  { label: '健康分类', value: patient.diagnosis },
                  { label: '最近就诊', value: patient.lastVisit },
                  { label: '下次随访', value: patient.nextFollowUp },
                ]}
              />
              <h4 className="feature-small-heading">照护摘要</h4>
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
              <h4 className="feature-small-heading">既往病史</h4>
              {patient.medicalHistory.map((item, index) => (
                <p className="feature-prose" key={item + index}>
                  {item}
                </p>
              ))}
              {!patient.medicalHistory.length && <p className="feature-prose">暂无既往病史记录</p>}
              <h4 className="feature-small-heading">过敏史</h4>
              <div className="feature-tag-row">
                {patient.allergies.length ? (
                  patient.allergies.map((item) => (
                    <Badge tone="amber" key={item}>
                      {item}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="slate">暂无过敏记录</Badge>
                )}
              </div>
              <div className="feature-notice">
                <ShieldCheck size={17} />
                <span>演示档案不可编辑。患者建档、信息修改与跨医院数据导入将在后续迭代提供。</span>
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
        title="患者管理"
        description="让每一份关注，都有迹可循。管理您负责的患者与连续健康档案。"
        action={
          <Button onClick={() => setShowPlanned(true)}>
            <Plus size={16} />
            患者建档 <span className="feature-mini-label">即将上线</span>
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
              label="我的患者"
              value={
                <>
                  {data?.length ?? 0}
                  <small>人</small>
                </>
              }
              detail="已分配至当前演示医生"
            />
            <Metric
              icon={HeartPulse}
              label="状态平稳"
              value={data?.filter((patient) => patient.status === 'stable').length ?? 0}
              detail="按演示档案标签汇总"
              tone="blue"
            />
            <Metric
              icon={CalendarClock}
              label="待随访患者"
              value={data?.filter((patient) => patient.status === 'follow-up').length ?? 0}
              detail="连续照护，从一次随访开始"
              tone="amber"
            />
            <Metric
              icon={ShieldCheck}
              label="需要关注"
              value={data?.filter((patient) => patient.status === 'attention').length ?? 0}
              detail="演示标记，非临床风险判断"
              tone="rose"
            />
          </div>
          <Card className="feature-card-pad">
            <SectionTitle title="患者档案" subtitle="PATIENT DIRECTORY · 演示数据" />
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
                  aria-label="搜索患者姓名、编号或疾病"
                  placeholder="搜索姓名、编号或疾病"
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
                      <th>患者信息</th>
                      <th>健康分类</th>
                      <th>管理状态</th>
                      <th>最近就诊</th>
                      <th>下次随访</th>
                      <th>档案</th>
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
                                {patient.gender} · {patient.age} 岁 · {patient.id}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{patient.diagnosis}</td>
                        <td>
                          <Badge tone={statusTones[patient.status]}>
                            {statusLabels[patient.status]}
                          </Badge>
                        </td>
                        <td>{patient.lastVisit}</td>
                        <td>{patient.nextFollowUp}</td>
                        <td>
                          <LinkAction onClick={() => setSelected(patient.id)}>查看档案</LinkAction>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="未找到符合条件的患者"
                description="请尝试其他姓名、编号或筛选条件。"
              />
            )}
            <div className="feature-table-footer">
              <span>
                共 {data?.length ?? 0} 位演示患者 · 当前显示 {patients.length} 位
              </span>
              <span className="feature-inline-icon">
                <ShieldCheck size={13} />
                医生数据访问范围已隔离
              </span>
            </div>
          </Card>
          <ReadOnlyNote />
        </>
      )}
      {selected && <PatientDetail patientId={selected} onClose={closePatient} />}
      {showPlanned && (
        <PlannedDialog title="新建患者档案" iteration="Iteration 1" onClose={closePlanned}>
          <p>患者建档将按以下流程接入患者管理模块：</p>
          <ol>
            <li>核验患者身份及数据使用授权。</li>
            <li>填写基本信息、过敏史与既往病史。</li>
            <li>绑定负责医生，生成独立健康档案。</li>
          </ol>
          <p>后端已预留患者档案与医生访问范围的接口边界。</p>
        </PlannedDialog>
      )}
    </div>
  );
}
