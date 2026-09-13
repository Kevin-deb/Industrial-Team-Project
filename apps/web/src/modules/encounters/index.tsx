import { useI18n } from '../../shared/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  Clock3,
  MessageSquare,
  Search,
  Video,
} from 'lucide-react';
import type { Encounter } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  Metric,
  PersonAvatar,
  PlannedDialog,
  ReadOnlyNote,
} from '../ui';

const statuses = { waiting: '待接诊', scheduled: '待接诊', completed: '已完成' };
const tones = { waiting: 'amber', scheduled: 'amber', completed: 'teal' } as const;
const isPendingEncounter = (status: Encounter['status']) =>
  status === 'waiting' || status === 'scheduled';

function addMinutes(value: string, minutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function encounterDate(
  encounter: Encounter,
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string,
) {
  return formatDate(encounter.scheduledAt, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function encounterTime(
  encounter: Encounter,
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string,
) {
  if (encounter.type === 'text') return '48h';
  const end = addMinutes(encounter.scheduledAt, encounter.durationMinutes);
  return `${formatDate(encounter.scheduledAt, {
    hour: '2-digit',
    minute: '2-digit',
  })}-${formatDate(end, { hour: '2-digit', minute: '2-digit' })}`;
}

export function EncountersPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<Encounter[]>('/encounters');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data?.find((item) => item.id === selectedId) ?? null;
  const [planned, setPlanned] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const closePlanned = useCallback(() => setPlanned(null), []);
  const encounters = useMemo(
    () =>
      (data ?? []).filter(
        (item) =>
          (status === 'all' ||
            (status === 'pending' ? isPendingEncounter(item.status) : item.status === status)) &&
          `${item.patientName} ${item.patientId} ${item.id}`.includes(query.trim()),
      ),
    [data, query, status],
  );
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="CONSULTATION WORKSPACE"
        title={t('在线诊疗')}
        description={t('有序接诊，从容沟通。让优质的医疗服务跨越距离。')}
        action={
          <Button onClick={() => setPlanned('预约管理')}>
            <CalendarPlus size={16} />
            {t('预约管理')}
          </Button>
        }
      />
      {loading || error ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-metrics">
            <Metric
              icon={CalendarDays}
              label={t('演示接诊安排')}
              value={data?.length ?? 0}
              detail={t('查看当前工作队列')}
            />
            <Metric
              icon={Clock3}
              label={t('等待接诊')}
              value={data?.filter((item) => isPendingEncounter(item.status)).length ?? 0}
              detail={t('包含待响应与已约定时段')}
              tone="amber"
            />
            <Metric
              icon={Video}
              label={t('视频预约')}
              value={data?.filter((item) => item.type === 'video').length ?? 0}
              detail={t('音视频服务将在后续接入')}
              tone="blue"
            />
            <Metric
              icon={CheckCheck}
              label={t('已完成记录')}
              value={data?.filter((item) => item.status === 'completed').length ?? 0}
              detail={t('虚构历史诊疗安排')}
            />
          </div>
          <div className="feature-toolbar">
            <FilterTabs
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: '全部接诊', count: data?.length },
                {
                  value: 'pending',
                  label: '待接诊',
                  count: data?.filter((item) => isPendingEncounter(item.status)).length,
                },
                { value: 'completed', label: '已完成' },
              ]}
            />
            <label className="feature-search">
              <Search size={16} />
              <input
                aria-label={t('搜索患者或接诊编号')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('搜索患者或接诊编号')}
              />
            </label>
          </div>
          <div className="encounter-grid">
            {encounters.map((encounter, index) => (
              <article className="encounter-row" key={encounter.id}>
                <div className="feature-person encounter-row-person">
                  <PersonAvatar name={encounter.patientName} tone={index} />
                  <div>
                    <strong>{encounter.patientName}</strong>
                    <small>
                      {encounter.patientId} · {encounter.id}
                    </small>
                  </div>
                </div>
                <div className="encounter-row-meta">
                  <span className="encounter-row-type">
                    {encounter.type === 'video' ? <Video size={14} /> : <MessageSquare size={14} />}
                    {encounter.type === 'video' ? t('视频问诊') : t('图文问诊')}
                  </span>
                  <span>
                    <small>{t('接诊日期')}</small>
                    {encounterDate(encounter, formatDate)}
                  </span>
                  <span>
                    <small>{t('接诊时间')}</small>
                    {encounterTime(encounter, formatDate)}
                  </span>
                </div>
                <Badge tone={tones[encounter.status]}>{t(statuses[encounter.status])}</Badge>
                <LinkAction onClick={() => setSelectedId(encounter.id)}>
                  {t('查看接诊详情')}
                </LinkAction>
              </article>
            ))}
          </div>
          {!encounters.length && (
            <EmptyState
              title={t('没有符合条件的接诊安排')}
              description={t('调整筛选条件查看其他演示记录。')}
            />
          )}
          <div className="feature-coming-panel">
            <Video size={26} />
            <div>
              <h3>{t('更自然的在线沟通，即将到来')}</h3>
              <p>
                {t(
                  '图文消息、视频通话、经授权的录音录像及诊后随访已纳入开发计划。当前可浏览演示接诊安排。',
                )}
              </p>
            </div>
          </div>
          <ReadOnlyNote />
        </>
      )}
      {selected && (
        <FeatureDialog
          title={t('接诊详情')}
          subtitle={t('{value0} · 演示安排', { value0: selected.id })}
          onClose={close}
        >
          <div className="feature-person-header">
            <PersonAvatar name={selected.patientName} size="large" />
            <div>
              <h3>{selected.patientName}</h3>
              <p>{selected.patientId}</p>
            </div>
            <Badge tone={tones[selected.status]}>{t(statuses[selected.status])}</Badge>
          </div>
          <DetailGrid
            items={[
              {
                label: '就诊方式',
                value: selected.type === 'video' ? t('视频问诊') : t('图文问诊'),
              },
              {
                label: '接诊日期',
                value: encounterDate(selected, formatDate),
              },
              {
                label: '接诊时间',
                value: encounterTime(selected, formatDate),
              },
            ]}
          />
          <div className="feature-coming-panel">
            {selected.type === 'video' ? <Video size={25} /> : <MessageSquare size={25} />}
            <div>
              <h3>
                {selected.type === 'video' ? t('视频诊室') : t('图文诊室')}
                {t('· 尚未上线')}
              </h3>
              <p>
                {selected.type === 'video'
                  ? t('RTC 服务、设备检测、患者知情同意与诊室访问控制将在后续接入。')
                  : t('消息发送、附件上传、送达状态与离线提醒将在后续接入。')}
              </p>
            </div>
          </div>
          <ReadOnlyNote>{t('当前页面用于浏览预约信息，不会发起通话或发送诊疗消息。')}</ReadOnlyNote>
        </FeatureDialog>
      )}
      {planned && (
        <PlannedDialog title={planned} iteration="Iteration 1–3" onClose={closePlanned}>
          <p>
            {t(
              'Iteration 1 实现基础图文接诊，Iteration 3 接入图像、视频与会诊协作。预约管理聚焦设置可接诊时段、患者通知与改期确认；医生不确认预约人选。',
            )}
          </p>
          <p>
            {t(
              '医生发起改期通知后，由患者确认是否接受；双方达成一致后，平台自动调整接诊时段并留下审计记录。',
            )}
          </p>
        </PlannedDialog>
      )}
    </div>
  );
}
