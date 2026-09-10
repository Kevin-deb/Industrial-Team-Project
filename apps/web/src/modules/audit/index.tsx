import { useCallback, useMemo, useState } from 'react';
import { CheckCheck, Clock3, Download, FileSearch, Search, ShieldCheck } from 'lucide-react';
import type { AuditEvent } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  Metric,
  PlannedDialog,
  ReadOnlyNote,
  SectionTitle,
} from '../ui';

const outcomes = { success: '成功', denied: '已拒绝', planned: '尚未上线' };
const tones = { success: 'teal', denied: 'rose', planned: 'amber' } as const;
const domainLabels: Record<string, string> = {
  patient: '患者档案',
  patients: '患者档案',
  record: '电子病历',
  medical_record: '电子病历',
  encounter: '在线诊疗',
  consultation: '专家会诊',
  session: '账号会话',
  health: '健康管理',
  care_plan: '健康计划',
  system: '系统',
  identity: '身份验证',
};

export function AuditPage() {
  const { data, loading, error, reload } = useApi<AuditEvent[]>('/audit');
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [domain, setDomain] = useState('all');
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [planned, setPlanned] = useState(false);
  const close = useCallback(() => setSelected(null), []);
  const closePlanned = useCallback(() => setPlanned(false), []);
  const events = useMemo(
    () =>
      (data ?? []).filter(
        (item) =>
          (outcome === 'all' || item.outcome === outcome) &&
          (domain === 'all' || item.targetType === domain) &&
          `${item.action} ${item.description} ${item.targetId} ${item.id}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [data, domain, outcome, query],
  );
  const domains = Array.from(new Set((data ?? []).map((item) => item.targetType)));
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="ACTIVITY & AUDIT"
        title="操作审计"
        description="每一次访问都有记录，让数据使用透明、可信、可追溯。"
        action={
          <Button variant="secondary" onClick={() => setPlanned(true)}>
            <Download size={15} />
            导出日志
          </Button>
        }
      />
      {loading || error ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-metrics">
            <Metric
              icon={FileSearch}
              label="审计记录"
              value={data?.length ?? 0}
              detail="仅展示当前演示医生的记录"
            />
            <Metric
              icon={CheckCheck}
              label="成功操作"
              value={data?.filter((item) => item.outcome === 'success').length ?? 0}
              detail="样本记录及本机可审计操作"
              tone="blue"
            />
            <Metric
              icon={ShieldCheck}
              label="拒绝操作"
              value={data?.filter((item) => item.outcome === 'denied').length ?? 0}
              detail="访问权限或资源范围不符"
              tone="rose"
            />
            <Metric
              icon={Clock3}
              label="预留操作"
              value={data?.filter((item) => item.outcome === 'planned').length ?? 0}
              detail="功能尚未上线，未执行变更"
              tone="amber"
            />
          </div>
          <div className="audit-protection">
            <ShieldCheck size={24} />
            <div>
              <h3>您正在查看自己的操作记录</h3>
              <p>
                记录按医生身份隔离。跨医生检索、机构级审计、日志留存策略及审计导出将在权限体系完善后接入。
              </p>
            </div>
          </div>
          <Card className="feature-card-pad">
            <SectionTitle title="操作日志" subtitle="AUDIT TRAIL · 按发生时间查看" />
            <div className="feature-toolbar">
              <FilterTabs
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: 'all', label: '全部状态', count: data?.length },
                  { value: 'success', label: '成功' },
                  { value: 'denied', label: '已拒绝' },
                  { value: 'planned', label: '预留操作' },
                ]}
              />
              <select
                className="feature-select"
                aria-label="筛选审计对象类型"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              >
                <option value="all">全部对象类型</option>
                {domains.map((item) => (
                  <option key={item} value={item}>
                    {domainLabels[item] ?? item}
                  </option>
                ))}
              </select>
            </div>
            <label className="feature-search" style={{ marginBottom: 20, maxWidth: 350 }}>
              <Search size={16} />
              <input
                aria-label="搜索审计操作、对象编号或描述"
                placeholder="搜索操作、对象编号或描述"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {events.length ? (
              <div className="feature-table-wrap">
                <table className="feature-table">
                  <thead>
                    <tr>
                      <th>发生时间</th>
                      <th>操作内容</th>
                      <th>对象类型</th>
                      <th>关联对象</th>
                      <th>结果</th>
                      <th>详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{event.occurredAt.replace('T', ' ').slice(0, 16)}</td>
                        <td>
                          <strong style={{ fontWeight: 500 }}>{event.action}</strong>
                          <div className="audit-code" style={{ marginTop: 6 }}>
                            {event.id}
                          </div>
                        </td>
                        <td>{domainLabels[event.targetType] ?? event.targetType}</td>
                        <td>
                          <span className="audit-code">{event.targetId}</span>
                        </td>
                        <td>
                          <Badge tone={tones[event.outcome]}>{outcomes[event.outcome]}</Badge>
                        </td>
                        <td>
                          <LinkAction onClick={() => setSelected(event)}>查看</LinkAction>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="未找到符合条件的日志"
                description="调整操作状态、对象类型或搜索关键词。"
              />
            )}
            <div className="feature-table-footer">
              <span>
                共 {data?.length ?? 0} 条记录 · 当前显示 {events.length} 条
              </span>
              <span>当前页面仅供浏览</span>
            </div>
          </Card>
          <ReadOnlyNote />
        </>
      )}
      {selected && (
        <FeatureDialog title="审计记录详情" subtitle={selected.id} onClose={close}>
          <Badge tone={tones[selected.outcome]}>{outcomes[selected.outcome]}</Badge>
          <DetailGrid
            items={[
              { label: '操作者', value: selected.actorName },
              { label: '医生编号', value: selected.actorId },
              { label: '操作内容', value: selected.action },
              {
                label: '对象类型',
                value: domainLabels[selected.targetType] ?? selected.targetType,
              },
              { label: '关联对象', value: selected.targetId },
              { label: '发生时间', value: selected.occurredAt.replace('T', ' ').slice(0, 19) },
            ]}
          />
          <h4 className="feature-small-heading">事件描述</h4>
          <p className="feature-prose">{selected.description}</p>
          <ReadOnlyNote>此页面不会修改或删除操作日志。</ReadOnlyNote>
        </FeatureDialog>
      )}
      {planned && (
        <PlannedDialog title="导出审计日志" iteration="Iteration 2" onClose={closePlanned}>
          <p>审计导出将支持时间范围、操作类别与权限范围筛选，并记录导出申请和结果。</p>
          <p>导出格式、保留周期和机构审查要求需要在正式环境中配置。当前没有生成或下载日志文件。</p>
        </PlannedDialog>
      )}
    </div>
  );
}
