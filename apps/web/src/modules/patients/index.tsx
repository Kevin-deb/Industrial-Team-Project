import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { PatientDirectoryItem, PatientGroup } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Badge, Button, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import { FilterTabs, LinkAction, Metric, PersonAvatar } from '../ui';
import { PatientDetail } from './PatientDetail';
import { BatchStatus } from './BatchStatus';
import { PatientRegistration } from './PatientRegistration';
import { statusLabels, statusTones } from './fields';
import './patients.css';
const emptyPatients: PatientDirectoryItem[] = [];

export function PatientsPage() {
  const { t, formatDate } = useI18n();
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').slice(0, 100);
  const disease = (params.get('disease') ?? '').slice(0, 100);
  const status = ['stable', 'attention', 'follow-up'].includes(params.get('status') ?? '')
    ? params.get('status')!
    : 'all';
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const pageSize = [10, 20, 50].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 20;
  const request = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const groupBy = ['disease', 'status'].includes(params.get('groupBy') ?? '')
    ? params.get('groupBy')!
    : 'none';
  if (groupBy !== 'none') request.set('groupBy', groupBy);
  if (query.trim()) request.set('q', query.trim());
  if (disease.trim()) request.set('disease', disease.trim());
  if (status !== 'all') request.set('status', status);
  const { data, meta, loading, error, reload } = useApi<PatientDirectoryItem[]>(
    '/patients?' + request.toString(),
  );
  const summary = useApi<{
    total: number;
    stable: number;
    attention: number;
    followUp: number;
    canRegister: boolean;
  }>('/patients/summary');
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftDisease, setDraftDisease] = useState(disease);
  useEffect(() => {
    setDraftQuery(query);
    setDraftDisease(disease);
  }, [query, disease]);
  const [selected, setSelected] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  useEffect(() => {
    setChecked([]);
  }, [data]);
  const groups = (meta as typeof meta & { groups?: PatientGroup[] })?.groups ?? [];
  const editable = data?.filter((patient) => patient.canBatch) ?? [];
  const close = useCallback(() => setSelected(null), []);
  const updateParams = (fields: Record<string, string>, resetPage = true) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(fields)) {
          if (value && value !== 'all') next.set(key, value);
          else next.delete(key);
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  function search(event: FormEvent) {
    event.preventDefault();
    updateParams({ q: draftQuery.trim(), disease: draftDisease.trim() });
  }
  const total = meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const afterSave = () => {
    reload();
    summary.reload();
  };
  return (
    <div className="feature-page patients-page">
      <PageHeader
        eyebrow="PATIENT MANAGEMENT"
        title={t('患者管理')}
        action={
          <Button
            variant="secondary"
            disabled={summary.loading || !summary.data?.canRegister || batchBusy}
            title={
              summary.data?.canRegister === false ? t('当前医生没有患者建档权限。') : undefined
            }
            onClick={() => setPlanned(true)}
          >
            <Plus size={16} />
            {t('患者建档')}
          </Button>
        }
      />
      <div className="feature-metrics">
        {[
          { icon: Users, label: '我的患者', value: summary.data?.total },
          { icon: HeartPulse, label: '状态平稳', value: summary.data?.stable },
          { icon: CalendarClock, label: '待随访患者', value: summary.data?.followUp },
          { icon: ShieldCheck, label: '需要关注', value: summary.data?.attention },
        ].map((item) => (
          <Metric
            key={item.label}
            icon={item.icon}
            label={t(item.label)}
            value={item.value ?? '--'}
            detail={t('当前医生授权范围内的演示档案')}
          />
        ))}
      </div>
      {summary.error && (
        <p className="patients-error" role="alert">
          {summary.error}
          <Button variant="secondary" onClick={summary.reload}>
            {t('重新加载')}
          </Button>
        </p>
      )}
      <section className="patients-directory" aria-label={t('患者档案')}>
        <fieldset className="patients-directory-controls" disabled={batchBusy}>
          <FilterTabs
            value={status}
            onChange={(value) =>
              updateParams({ status: value, q: draftQuery.trim(), disease: draftDisease.trim() })
            }
            options={[
              { value: 'all', label: '全部患者' },
              { value: 'stable', label: '状态平稳' },
              { value: 'follow-up', label: '待随访' },
              { value: 'attention', label: '需要关注' },
            ]}
          />
          <form className="patients-search-form" onSubmit={search}>
            <label>
              {t('查找患者')}
              <input
                aria-label={t('搜索患者姓名、编号或症状')}
                maxLength={100}
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </label>
            <label>
              {t('疾病筛选')}
              <input
                maxLength={100}
                value={draftDisease}
                onChange={(event) => setDraftDisease(event.target.value)}
              />
            </label>
            <Button type="submit">
              <Search size={16} />
              {t('查询')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraftQuery('');
                setDraftDisease('');
                updateParams({ q: '', disease: '', status: 'all' });
              }}
            >
              {t('清除筛选')}
            </Button>
          </form>
          <FilterTabs
            value={groupBy}
            onChange={(value) => updateParams({ groupBy: value === 'none' ? '' : value })}
            options={[
              { value: 'none', label: '不分组' },
              { value: 'disease', label: '按病种分组' },
              { value: 'status', label: '按状态分组' },
            ]}
          />
          <BatchStatus
            items={data ?? emptyPatients}
            selected={checked}
            onBusy={setBatchBusy}
            onReload={afterSave}
          />
          <p className="patients-access-note">
            {t('批量选择仅适用于您负责且处于管理中的患者；协作授权只能查看。')}
          </p>
          {loading || error ? (
            <LoadingState error={error} onRetry={reload} />
          ) : (
            <>
              {data?.length ? (
                <div className="feature-table-wrap">
                  <table className="feature-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label={t('全选当前页可编辑患者')}
                            disabled={!editable.length}
                            checked={editable.length > 0 && checked.length === editable.length}
                            ref={(element) => {
                              if (element)
                                element.indeterminate =
                                  checked.length > 0 && checked.length < editable.length;
                            }}
                            onChange={(event) =>
                              setChecked(
                                event.target.checked ? editable.map((patient) => patient.id) : [],
                              )
                            }
                          />
                        </th>
                        {[
                          '患者信息',
                          '健康分类',
                          '管理状态',
                          '责任与权限',
                          '最近就诊',
                          '下次随访',
                          '档案',
                        ].map((label) => (
                          <th key={label}>{t(label)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((patient, index) => (
                        <Fragment key={patient.id}>
                          {groupBy !== 'none' &&
                            (index === 0 || patient.groupKey !== data[index - 1].groupKey) && (
                              <tr className="patients-group-heading">
                                <th colSpan={8} scope="colgroup">
                                  {groupBy === 'status'
                                    ? t(statusLabels[patient.status])
                                    : patient.diagnosis}
                                  <span>
                                    {t('匹配 {total} 位 · 本页 {count} 位', {
                                      total:
                                        groups.find((group) => group.key === patient.groupKey)
                                          ?.count ?? 0,
                                      count: data.filter(
                                        (item) => item.groupKey === patient.groupKey,
                                      ).length,
                                    })}
                                  </span>
                                </th>
                              </tr>
                            )}
                          <tr key={patient.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={t('选择患者 {id}', { id: patient.id })}
                                disabled={!patient.canBatch}
                                title={
                                  patient.batchDisabledReason
                                    ? t(patient.batchDisabledReason)
                                    : undefined
                                }
                                checked={checked.includes(patient.id)}
                                onChange={(event) =>
                                  setChecked((previous) =>
                                    event.target.checked
                                      ? [...previous, patient.id]
                                      : previous.filter((id) => id !== patient.id),
                                  )
                                }
                              />
                            </td>
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
                            <td className="patients-access-cell">
                              <strong>{patient.responsibleDoctorName ?? t('暂未分配')}</strong>
                              <Badge tone={patient.accessRole === 'responsible' ? 'teal' : 'slate'}>
                                {t(patient.accessRole === 'responsible' ? '责任医生' : '协作只读')}
                              </Badge>
                              <small
                                className="patients-access-detail"
                                title={
                                  patient.lifecycleStatus !== 'active'
                                    ? t(
                                        patient.lifecycleStatus === 'archived'
                                          ? '已归档'
                                          : '已解除管理',
                                      )
                                    : !patient.canBatch && patient.batchDisabledReason
                                      ? t(patient.batchDisabledReason)
                                      : undefined
                                }
                                aria-hidden={
                                  patient.lifecycleStatus === 'active' &&
                                  (patient.canBatch || !patient.batchDisabledReason)
                                }
                              >
                                {patient.lifecycleStatus !== 'active'
                                  ? t(
                                      patient.lifecycleStatus === 'archived'
                                        ? '已归档'
                                        : '已解除管理',
                                    )
                                  : !patient.canBatch && patient.batchDisabledReason
                                    ? t(patient.batchDisabledReason)
                                    : '\u00a0'}
                              </small>
                            </td>
                            <td>
                              {patient.lastVisit ? formatDate(patient.lastVisit) : t('未记录')}
                            </td>
                            <td>
                              {patient.nextFollowUp
                                ? formatDate(patient.nextFollowUp)
                                : t('未记录')}
                            </td>
                            <td>
                              <LinkAction onClick={() => setSelected(patient.id)}>
                                {t('查看档案')}
                              </LinkAction>
                            </td>
                          </tr>
                        </Fragment>
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
              <div className="patients-pagination">
                <span>
                  {t('共 {total} 位患者 · 当前显示 {count} 位', {
                    total,
                    count: data?.length ?? 0,
                  })}
                </span>
                <label>
                  {t('每页条数')}
                  <select
                    value={pageSize}
                    onChange={(event) => updateParams({ pageSize: event.target.value })}
                  >
                    {[10, 20, 50].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="patients-page-controls">
                  <Button
                    variant="secondary"
                    aria-label={t('上一页')}
                    title={t('上一页')}
                    disabled={page <= 1}
                    onClick={() => updateParams({ page: String(page - 1) }, false)}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span>{t('第 {page} 页 / 共 {pages} 页', { page, pages: totalPages })}</span>
                  <Button
                    variant="secondary"
                    aria-label={t('下一页')}
                    title={t('下一页')}
                    disabled={page >= totalPages}
                    onClick={() => updateParams({ page: String(page + 1) }, false)}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </fieldset>
      </section>
      {selected && <PatientDetail patientId={selected} onClose={close} onSaved={afterSave} />}
      {planned && (
        <PatientRegistration
          onClose={() => setPlanned(false)}
          onCreated={(patient) => {
            setPlanned(false);
            updateParams({ q: patient.id, disease: '', status: 'all' });
            afterSave();
            setSelected(patient.id);
          }}
        />
      )}
    </div>
  );
}
