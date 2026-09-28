import { useCallback, useState, type FormEvent } from 'react';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSearch,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { AuditEvent, AuditPageMeta } from '@doctor/contracts';
import { sessionToken, useApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import { DetailGrid, FeatureDialog, LinkAction, Metric, SectionTitle } from '../ui';
import './audit.css';

const outcomes = { success: '成功', denied: '已拒绝', planned: '预留操作', failed: '失败' };
const tones = { success: 'teal', denied: 'rose', planned: 'amber', failed: 'rose' } as const;
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
  plan: '健康计划',
  observation: '健康观测',
  assessment: '健康评估',
  reminder: '随访提醒',
  system: '系统',
  identity: '身份验证',
  audit: '操作审计',
  order: '医嘱',
  medical_order: '医嘱',
  clinical_material: '会诊材料',
  social: '同行社区',
};
const emptyFilters = { q: '', action: '', domain: '', outcome: '', from: '', to: '' };

export function AuditPage() {
  const { t, formatDate } = useI18n();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const query = new URLSearchParams(filters);
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));
  const { data, meta, loading, error, reload } = useApi<AuditEvent[]>('/audit?' + query.toString());
  const pagination = meta as AuditPageMeta | null;
  const events = data ?? [];
  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const close = useCallback(() => setSelected(null), []);
  function search(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
      setNotice({ text: '开始时间不能晚于结束时间。', error: true });
      return;
    }
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(draft)) {
      if (!value.trim()) continue;
      next.set(key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value.trim());
    }
    setFilters(next.toString());
    setPage(1);
    setNotice(null);
  }
  async function exportLogs() {
    setExporting(true);
    setNotice(null);
    try {
      const token = sessionToken();
      const response = await fetch('/api/v1/audit/export' + (filters ? '?' + filters : ''), {
        headers: { Accept: 'text/csv', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      });
      if (response.status === 401) window.dispatchEvent(new Event('carelink:auth-required'));
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? '导出失败，请稍后重试。');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'carelink-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ text: '已生成符合当前查询条件的全部日志文件。', error: false });
      reload();
    } catch (cause) {
      setNotice({
        text:
          cause instanceof TypeError
            ? '无法连接本地服务'
            : cause instanceof Error
              ? cause.message
              : '导出失败，请稍后重试。',
        error: true,
      });
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="feature-page audit-page">
      <PageHeader
        eyebrow="ACTIVITY & AUDIT"
        title={t('操作审计')}
        description={t('查询自己的访问和操作记录，按时间、操作及结果导出。')}
        action={
          <Button
            variant="secondary"
            onClick={() => void exportLogs()}
            disabled={exporting || loading || Boolean(error)}
          >
            <Download size={15} />
            {t(exporting ? '正在导出' : '导出日志')}
          </Button>
        }
      />
      <div className="audit-protection">
        <ShieldCheck size={24} />
        <div>
          <h3>{t('您正在查看自己的操作记录')}</h3>
          <p>{t('查询和导出仅包含当前账号的记录；导出行为也会留下审计记录。')}</p>
        </div>
      </div>
      <Card className="feature-card-pad">
        <SectionTitle title={t('操作日志')} subtitle={t('AUDIT TRAIL · 按发生时间查看')} />
        <form className="audit-filters" onSubmit={search}>
          <label>
            {t('搜索操作、对象编号或描述')}
            <input
              maxLength={200}
              value={draft.q}
              onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            />
          </label>
          <label>
            {t('操作名称')}
            <input
              maxLength={100}
              value={draft.action}
              placeholder="patient.update"
              onChange={(event) => setDraft({ ...draft, action: event.target.value })}
            />
          </label>
          <label>
            {t('对象类型')}
            <select
              value={draft.domain}
              onChange={(event) => setDraft({ ...draft, domain: event.target.value })}
            >
              <option value="">{t('全部对象类型')}</option>
              {(pagination?.domains ?? []).map((item) => (
                <option key={item} value={item}>
                  {t(domainLabels[item] ?? item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('结果')}
            <select
              value={draft.outcome}
              onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}
            >
              <option value="">{t('全部状态')}</option>
              {Object.entries(outcomes).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('开始时间')}
            <input
              type="datetime-local"
              step="1"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label>
            {t('结束时间')}
            <input
              type="datetime-local"
              step="1"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <div className="audit-filter-actions">
            <Button type="submit">
              <Search size={15} />
              {t('查询')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(emptyFilters);
                setFilters('');
                setPage(1);
                setNotice(null);
              }}
            >
              {t('重置')}
            </Button>
          </div>
        </form>
        <p className="audit-query-note">
          {t('时间按本机时区输入。导出使用已查询的条件，包含全部匹配记录。')}
        </p>
        {notice && (
          <p
            role={notice.error ? 'alert' : 'status'}
            className={notice.error ? 'audit-notice-error' : 'audit-notice'}
          >
            {t(notice.text)}
          </p>
        )}
        {loading || error ? (
          <LoadingState error={error} onRetry={reload} />
        ) : (
          <>
            <div className="feature-metrics audit-metrics">
              <Metric
                icon={FileSearch}
                label={t('审计记录')}
                value={total}
                detail={t('当前筛选范围的总数')}
              />
              <Metric
                icon={CheckCheck}
                label={t('成功操作')}
                value={pagination?.summary?.success ?? 0}
                detail={t('当前筛选范围')}
                tone="blue"
              />
              <Metric
                icon={ShieldCheck}
                label={t('拒绝操作')}
                value={pagination?.summary?.denied ?? 0}
                detail={t('当前筛选范围')}
                tone="rose"
              />
              <Metric
                icon={TriangleAlert}
                label={t('失败操作')}
                value={pagination?.summary?.failed ?? 0}
                detail={t('当前筛选范围')}
                tone="amber"
              />
            </div>
            {events.length ? (
              <div className="feature-table-wrap">
                <table className="feature-table">
                  <thead>
                    <tr>
                      {['发生时间', '操作内容', '对象类型', '关联对象', '结果', '详情'].map(
                        (label) => (
                          <th key={label}>{t(label)}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>
                          {formatDate(event.occurredAt, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td>
                          <strong style={{ fontWeight: 500 }}>{event.action}</strong>
                          <div className="audit-code" style={{ marginTop: 6 }}>
                            {event.id}
                          </div>
                        </td>
                        <td>{t(domainLabels[event.targetType] ?? event.targetType)}</td>
                        <td>
                          <span className="audit-code">{event.targetId}</span>
                        </td>
                        <td>
                          <Badge tone={tones[event.outcome]}>{t(outcomes[event.outcome])}</Badge>
                        </td>
                        <td>
                          <LinkAction onClick={() => setSelected(event)}>{t('查看')}</LinkAction>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={t('未找到符合条件的日志')}
                description={t('调整时间、操作状态、对象类型或搜索关键词。')}
              />
            )}
            <div className="feature-table-footer audit-pagination">
              <span>
                {t('共 {total} 条记录 · 当前显示 {count} 条', { total, count: events.length })}
              </span>
              <label>
                {t('每页记录数')}
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {[20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={16} />
                  {t('上一页')}
                </Button>
                <span>{t('第 {page} / {pages} 页', { page, pages: totalPages })}</span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('下一页')}
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
      {selected && (
        <FeatureDialog title={t('审计记录详情')} subtitle={selected.id} onClose={close}>
          <Badge tone={tones[selected.outcome]}>{t(outcomes[selected.outcome])}</Badge>
          <DetailGrid
            items={[
              { label: '操作者', value: selected.actorName },
              { label: '医生编号', value: selected.actorId },
              { label: '操作内容', value: selected.action },
              {
                label: '对象类型',
                value: t(domainLabels[selected.targetType] ?? selected.targetType),
              },
              { label: '关联对象', value: selected.targetId },
              {
                label: '发生时间',
                value: formatDate(selected.occurredAt, { dateStyle: 'medium', timeStyle: 'short' }),
              },
            ]}
          />
          <h4 className="feature-small-heading">{t('事件描述')}</h4>
          <p className="feature-prose">{t(selected.description)}</p>
          <p>{t('此页面不会修改或删除操作日志。')}</p>
        </FeatureDialog>
      )}
    </div>
  );
}
