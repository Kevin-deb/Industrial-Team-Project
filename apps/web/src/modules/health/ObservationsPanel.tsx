import { Plus, RefreshCw, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { CreateObservationInput, HealthMetric } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { EApiError } from '../e-shared';
import { ObservationTrendPanel } from './ObservationTrendPanel';
import {
  useCreateObservation,
  useObservations,
  useObservationTrends,
  type ObservationFilters,
} from './queries';

const metricOptions: Array<{ value: HealthMetric; label: string; unit: string }> = [
  { value: 'systolic', label: '收缩压', unit: 'mmHg' },
  { value: 'diastolic', label: '舒张压', unit: 'mmHg' },
  { value: 'glucose', label: '血糖', unit: 'mmol/L' },
  { value: 'heart-rate', label: '心率', unit: 'bpm' },
];

export function ObservationsPanel({ patientId }: { patientId: string }) {
  const { t, formatDate } = useI18n();
  const [metric, setMetric] = useState<HealthMetric | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'records' | 'trends'>('records');
  const filters = useMemo<ObservationFilters>(
    () => ({
      ...(metric ? { metric } : {}),
      ...(from ? { from: `${from}T00:00:00+08:00` } : {}),
      ...(to ? { to: `${to}T23:59:59+08:00` } : {}),
      page,
    }),
    [from, metric, page, to],
  );
  const query = useObservations(patientId, filters);
  const trends = useObservationTrends(patientId, filters, view === 'trends');
  const create = useCreateObservation(patientId);
  const items = query.data?.data.items ?? [];
  return (
    <section className="health-panel" aria-labelledby="observations-title">
      <header className="health-panel-header">
        <div>
          <h2 id="observations-title">{t('健康观测')}</h2>
          <p>{t('查看测量时间、接收时间和数据来源')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} />
          {t('新增观测')}
        </Button>
      </header>
      <div className="health-observation-view-switch" aria-label={t('观测显示方式')}>
        <button type="button" aria-pressed={view === 'records'} onClick={() => setView('records')}>
          {t('记录列表')}
        </button>
        <button type="button" aria-pressed={view === 'trends'} onClick={() => setView('trends')}>
          {t('趋势图')}
        </button>
      </div>
      <div className="health-panel-toolbar">
        <label>
          {t('指标')}
          <select
            value={metric}
            onChange={(event) => {
              setMetric(event.target.value as HealthMetric | '');
              setPage(1);
            }}
          >
            <option value="">{t('全部指标')}</option>
            {metricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('开始日期')}
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t('结束日期')}
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          type="button"
          className="health-refresh-button"
          onClick={() => void (view === 'records' ? query.refetch() : trends.refetch())}
          disabled={view === 'records' ? query.isFetching : trends.isFetching}
        >
          <RefreshCw size={13} />
          {t('刷新')}
        </button>
        <span>
          {view === 'records'
            ? query.data
              ? t('共 {count} 条记录', { count: query.data.data.total })
              : t('正在加载记录…')
            : trends.data
              ? t('共 {count} 个趋势点', {
                  count: trends.data.data.series.reduce((sum, item) => sum + item.points.length, 0),
                })
              : t('正在加载趋势…')}
        </span>
      </div>
      {view === 'trends' ? (
        <ObservationTrendPanel
          data={trends.data?.data}
          loading={trends.isLoading}
          fetching={trends.isFetching}
          error={trends.isError}
          onRetry={() => void trends.refetch()}
        />
      ) : query.isError ? (
        <div className="health-inline-error">
          {t('观测记录加载失败，请重试。')}{' '}
          <button type="button" onClick={() => void query.refetch()}>
            {t('重试')}
          </button>
        </div>
      ) : (
        <div
          className={`health-table-wrap ${query.isFetching ? 'is-refreshing' : ''}`}
          aria-busy={query.isFetching}
        >
          <table>
            <thead>
              <tr>
                <th>{t('指标')}</th>
                <th>{t('数值')}</th>
                <th>{t('测量时间')}</th>
                <th>{t('接收时间')}</th>
                <th>{t('数据来源')}</th>
                <th>{t('数据状态')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {t(
                      metricOptions.find((option) => option.value === item.metric)?.label ??
                        item.metric,
                    )}
                  </td>
                  <td>
                    <strong>{formatObservationValue(item.metric, item.value)}</strong> {item.unit}
                  </td>
                  <td>
                    {formatDate(item.measuredAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td>
                    {formatDate(item.receivedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td>
                    <span className="health-source">{item.sourceLabel}</span>
                  </td>
                  <td>{t(qualityText(item.qualityStatus))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && !query.isLoading && (
            <div className="health-empty">{t('当前筛选条件下没有观测记录')}</div>
          )}
          {query.isLoading && <TableSkeleton />}
        </div>
      )}
      {view === 'records' && query.data && query.data.data.total > query.data.data.pageSize && (
        <div className="health-pagination">
          <Button
            variant="secondary"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t('上一页')}
          </Button>
          <span>
            {t('第 {page} / {pages} 页', {
              page,
              pages: Math.ceil(query.data.data.total / query.data.data.pageSize),
            })}
          </span>
          <Button
            variant="secondary"
            disabled={
              page >= Math.ceil(query.data.data.total / query.data.data.pageSize) ||
              query.isFetching
            }
            onClick={() => setPage((current) => current + 1)}
          >
            {t('下一页')}
          </Button>
        </div>
      )}
      <p className="health-safety-note">
        {t('这里只记录和展示数据，不提供自动诊断、分级或治疗建议。')}
      </p>
      {adding && (
        <ObservationForm
          patientId={patientId}
          busy={create.isPending}
          error={create.error}
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function qualityText(status: 'demo' | 'unreviewed' | 'reviewed') {
  return status === 'demo' ? '合成演示' : status === 'reviewed' ? '已复核' : '待复核';
}

function formatObservationValue(metric: HealthMetric, value: number) {
  return metric === 'glucose'
    ? Number(value.toFixed(1)).toString()
    : Number(value.toFixed(0)).toString();
}

function ObservationForm({
  patientId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  patientId: string;
  busy: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: CreateObservationInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<HealthMetric>('systolic');
  const [value, setValue] = useState('');
  const [measuredAt, setMeasuredAt] = useState('2026-09-13T08:00');
  const option = metricOptions.find((item) => item.value === metric)!;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      commandId: globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now()}`,
      patientId,
      metric,
      value: Number(value),
      unit: option.unit,
      measuredAt: `${measuredAt}:00+08:00`,
      source: 'manual-entry',
      sourceLabel: '医生手工录入',
    }).catch(() => undefined);
  }
  return (
    <div className="health-dialog-backdrop" role="presentation">
      <section
        className="health-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="observation-dialog-title"
      >
        <header>
          <h2 id="observation-dialog-title">{t('新增健康观测')}</h2>
          <button type="button" onClick={onClose} aria-label={t('关闭')}>
            <X size={18} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            {t('指标')}
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as HealthMetric)}
            >
              {metricOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('测量数值')}
            <div className="health-value-input">
              <input
                type="number"
                min="0"
                max="1000"
                step="0.1"
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <span>{option.unit}</span>
            </div>
          </label>
          <label>
            {t('测量时间')}
            <input
              type="datetime-local"
              required
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
            />
          </label>
          <p className="health-form-note">{t('数据来源将标记为“医生手工录入”。')}</p>
          {error && (
            <div className="health-inline-error">
              {error instanceof EApiError ? error.message : t('保存失败，请稍后重试。')}
            </div>
          )}
          <footer>
            <Button variant="secondary" onClick={onClose}>
              {t('取消')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('正在保存…') : t('保存观测记录')}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="health-table-skeleton" role="status" aria-label="loading">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
