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
} from '../ui';

const statuses = { waiting: '待接诊', scheduled: '已预约', completed: '已完成' };
const tones = { waiting: 'amber', scheduled: 'blue', completed: 'teal' } as const;
function dateTime(date: string) {
  return date.replace('T', ' ').slice(0, 16);
}

export function EncountersPage() {
  const { data, loading, error, reload } = useApi<Encounter[]>('/encounters');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Encounter | null>(null);
  const [planned, setPlanned] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const closePlanned = useCallback(() => setPlanned(null), []);
  const encounters = useMemo(
    () =>
      (data ?? []).filter(
        (item) =>
          (status === 'all' || item.status === status) &&
          `${item.patientName} ${item.reason}`.includes(query.trim()),
      ),
    [data, query, status],
  );
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="CONSULTATION WORKSPACE"
        title="在线诊疗"
        description="有序接诊，从容沟通。让优质的医疗服务跨越距离。"
        action={
          <Button onClick={() => setPlanned('预约管理')}>
            <CalendarPlus size={16} />
            预约管理
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
              label="演示接诊安排"
              value={data?.length ?? 0}
              detail="查看当前工作队列"
            />
            <Metric
              icon={Clock3}
              label="等待接诊"
              value={data?.filter((item) => item.status === 'waiting').length ?? 0}
              detail="接诊功能尚未接入"
              tone="amber"
            />
            <Metric
              icon={Video}
              label="视频预约"
              value={data?.filter((item) => item.type === 'video').length ?? 0}
              detail="音视频服务将在后续接入"
              tone="blue"
            />
            <Metric
              icon={CheckCheck}
              label="已完成记录"
              value={data?.filter((item) => item.status === 'completed').length ?? 0}
              detail="虚构历史诊疗安排"
            />
          </div>
          <div className="feature-toolbar">
            <FilterTabs
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: '全部接诊', count: data?.length },
                { value: 'waiting', label: '待接诊' },
                { value: 'scheduled', label: '已预约' },
                { value: 'completed', label: '已完成' },
              ]}
            />
            <label className="feature-search">
              <Search size={16} />
              <input
                aria-label="搜索患者或就诊原因"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索患者或就诊原因"
              />
            </label>
          </div>
          <div className="encounter-grid">
            {encounters.map((encounter, index) => (
              <Card className="encounter-card" key={encounter.id}>
                <div className="encounter-card-top">
                  <div className="feature-person">
                    <PersonAvatar name={encounter.patientName} tone={index} />
                    <div>
                      <strong>{encounter.patientName}</strong>
                      <small>
                        {encounter.patientId} · {encounter.id}
                      </small>
                    </div>
                  </div>
                  <Badge tone={tones[encounter.status]}>{statuses[encounter.status]}</Badge>
                </div>
                <DetailGrid
                  items={[
                    {
                      label: '就诊方式',
                      value: (
                        <span className="feature-inline-icon">
                          {encounter.type === 'video' ? (
                            <Video size={14} />
                          ) : (
                            <MessageSquare size={14} />
                          )}
                          {encounter.type === 'video' ? '视频问诊' : '图文问诊'}
                        </span>
                      ),
                    },
                    { label: '预约时间', value: dateTime(encounter.scheduledAt) },
                  ]}
                />
                <p className="encounter-note">就诊事由：{encounter.reason}</p>
                <div className="encounter-card-bottom">
                  <span>
                    <Clock3 size={13} />
                    预计 {encounter.durationMinutes} 分钟
                  </span>
                  <LinkAction onClick={() => setSelected(encounter)}>查看接诊详情</LinkAction>
                </div>
              </Card>
            ))}
          </div>
          {!encounters.length && (
            <EmptyState
              title="没有符合条件的接诊安排"
              description="调整筛选条件查看其他演示记录。"
            />
          )}
          <div className="feature-coming-panel">
            <Video size={26} />
            <div>
              <h3>更自然的在线沟通，即将到来</h3>
              <p>
                图文消息、视频通话、经授权的录音录像及诊后随访已纳入开发计划。当前可浏览演示接诊安排。
              </p>
            </div>
          </div>
          <ReadOnlyNote />
        </>
      )}
      {selected && (
        <FeatureDialog title="接诊详情" subtitle={`${selected.id} · 演示安排`} onClose={close}>
          <div className="feature-person-header">
            <PersonAvatar name={selected.patientName} size="large" />
            <div>
              <h3>{selected.patientName}</h3>
              <p>{selected.patientId}</p>
            </div>
            <Badge tone={tones[selected.status]}>{statuses[selected.status]}</Badge>
          </div>
          <DetailGrid
            items={[
              { label: '就诊方式', value: selected.type === 'video' ? '视频问诊' : '图文问诊' },
              { label: '预约时长', value: `${selected.durationMinutes} 分钟` },
              { label: '预约日期', value: selected.scheduledAt.slice(0, 10) },
              { label: '预约时间', value: selected.scheduledAt.slice(11, 16) },
            ]}
          />
          <h4 className="feature-small-heading">就诊事由</h4>
          <p className="feature-prose">{selected.reason}</p>
          <div className="feature-coming-panel">
            {selected.type === 'video' ? <Video size={25} /> : <MessageSquare size={25} />}
            <div>
              <h3>{selected.type === 'video' ? '视频诊室' : '图文诊室'} · 尚未上线</h3>
              <p>
                {selected.type === 'video'
                  ? 'RTC 服务、设备检测、患者知情同意与诊室访问控制将在后续接入。'
                  : '消息发送、附件上传、送达状态与离线提醒将在后续接入。'}
              </p>
            </div>
          </div>
          <ReadOnlyNote>当前页面用于浏览预约信息，不会发起通话或发送诊疗消息。</ReadOnlyNote>
        </FeatureDialog>
      )}
      {planned && (
        <PlannedDialog title={planned} iteration="Iteration 1–3" onClose={closePlanned}>
          <p>
            Iteration 1 实现基础图文接诊，Iteration 3
            接入图像、视频与会诊协作。预约管理将支持设置可接诊时段、确认预约、调整排班和患者通知。
          </p>
          <p>
            图文与视频诊疗使用统一接诊编号，与病历、知情同意及审计记录关联。第三方通信服务通过独立适配器接入。
          </p>
        </PlannedDialog>
      )}
    </div>
  );
}
