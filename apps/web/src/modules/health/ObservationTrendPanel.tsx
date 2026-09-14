import type {
  HealthMetric,
  ObservationTrendPoint,
  ObservationTrendResponse,
  ObservationTrendSeries,
  ReferenceRange,
} from '@doctor/contracts';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../shared/i18n';

interface ObservationTrendPanelProps {
  data?: ObservationTrendResponse;
  loading: boolean;
  fetching: boolean;
  error: boolean;
  onRetry: () => void;
}

const labels: Record<HealthMetric, string> = {
  systolic: '收缩压',
  diastolic: '舒张压',
  glucose: '血糖',
  'heart-rate': '心率',
};

export function ObservationTrendPanel({
  data,
  loading,
  fetching,
  error,
  onRetry,
}: ObservationTrendPanelProps) {
  const { t } = useI18n();
  if (loading && !data) return <TrendSkeleton />;
  if (error && !data) {
    return (
      <div className="health-trend-state" role="alert">
        <span>{t('趋势数据加载失败，请重试。')}</span>
        <button type="button" onClick={onRetry}>
          <RefreshCw size={13} />
          {t('重试')}
        </button>
      </div>
    );
  }
  if (!data) return null;
  const systolic = data.series.find((item) => item.metric === 'systolic');
  const diastolic = data.series.find((item) => item.metric === 'diastolic');
  const glucose = data.series.find((item) => item.metric === 'glucose');
  const heartRate = data.series.find((item) => item.metric === 'heart-rate');
  const panels = [
    ...(systolic || diastolic
      ? [
          {
            key: 'blood-pressure',
            title: '血压趋势',
            series: [systolic, diastolic].filter(Boolean) as ObservationTrendSeries[],
          },
        ]
      : []),
    ...(glucose ? [{ key: 'glucose', title: '血糖趋势', series: [glucose] }] : []),
    ...(heartRate ? [{ key: 'heart-rate', title: '心率趋势', series: [heartRate] }] : []),
  ];
  return (
    <div className={`health-trends ${fetching ? 'is-refreshing' : ''}`} aria-busy={fetching}>
      <div className="health-trend-context">
        <strong>{t('按 {age} 岁匹配', { age: data.patientAge })}</strong>
        <span>{t('参考范围为演示配置，仅供随访查看，不用于诊断。')}</span>
      </div>
      {panels.map((panel) => (
        <TrendGroup key={panel.key} title={t(panel.title)} series={panel.series} />
      ))}
      {!panels.length && (
        <div className="health-trend-state">{t('当前筛选条件下没有趋势记录')}</div>
      )}
    </div>
  );
}

function TrendGroup({ title, series }: { title: string; series: ObservationTrendSeries[] }) {
  const { t } = useI18n();
  const withData = series.filter((item) => item.stats && item.points.length);
  return (
    <section className="health-trend-card">
      <header>
        <h3>{title}</h3>
        <div className="health-trend-legend">
          {series.map((item) => (
            <span key={item.metric} data-metric={item.metric}>
              <i /> {t(labels[item.metric])}
            </span>
          ))}
        </div>
      </header>
      <div className="health-trend-summary-grid">
        {series.map((item) => (
          <SeriesSummary key={item.metric} series={item} />
        ))}
      </div>
      {withData.length ? (
        <TrendChart series={withData} title={title} />
      ) : (
        <div className="health-trend-empty">{t('当前筛选条件下没有趋势记录')}</div>
      )}
      {series.map((item) => (
        <ReferenceNote key={item.metric} metric={item.metric} range={item.referenceRange} />
      ))}
    </section>
  );
}

function SeriesSummary({ series }: { series: ObservationTrendSeries }) {
  const { t } = useI18n();
  const stats = series.stats;
  return (
    <div className="health-series-summary" data-metric={series.metric}>
      <strong>{t(labels[series.metric])}</strong>
      {stats ? (
        <dl>
          <div className="health-stat-primary">
            <dt>{t('最新值')}</dt>
            <dd>
              {formatValue(stats.latest)} {series.unit}
            </dd>
          </div>
          <div>
            <dt>{t('参考范围')}</dt>
            <dd>
              {series.referenceRange
                ? `${formatValue(series.referenceRange.lower)}-${formatValue(series.referenceRange.upper)} ${series.unit}`
                : t('暂无适用参考范围')}
            </dd>
          </div>
          <div>
            <dt>{t('平均')}</dt>
            <dd>
              {formatValue(stats.average)} {series.unit}
            </dd>
          </div>
          <div>
            <dt>{t('最低 / 最高')}</dt>
            <dd>
              {formatValue(stats.minimum)} / {formatValue(stats.maximum)}
            </dd>
          </div>
          <div>
            <dt>{t('记录数')}</dt>
            <dd>{stats.count}</dd>
          </div>
          <div>
            <dt>{t('首尾变化')}</dt>
            <dd>
              {stats.change > 0 ? '+' : ''}
              {formatValue(stats.change)} {series.unit}
            </dd>
          </div>
        </dl>
      ) : (
        <span>{t('暂无数据')}</span>
      )}
    </div>
  );
}

function TrendChart({ series, title }: { series: ObservationTrendSeries[]; title: string }) {
  const { formatDate } = useI18n();
  const allPoints = series.flatMap((item) => item.points);
  const ranges = series.flatMap((item) => (item.referenceRange ? [item.referenceRange] : []));
  const values = [
    ...allPoints.map((point) => point.value),
    ...ranges.flatMap((range) => [range.lower, range.upper]),
  ];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.12, 1);
  const low = minimum - padding;
  const high = maximum + padding;
  const timestamps = allPoints.map((point) => Date.parse(point.measuredAt));
  const firstTime = Math.min(...timestamps);
  const lastTime = Math.max(...timestamps);
  const x = (point: ObservationTrendPoint) =>
    44 + ((Date.parse(point.measuredAt) - firstTime) / Math.max(1, lastTime - firstTime)) * 616;
  const y = (value: number) => 20 + ((high - value) / Math.max(1, high - low)) * 150;
  return (
    <div className="health-trend-chart-wrap">
      <svg viewBox="0 0 700 205" role="img" aria-label={`${title}，包含数值与演示参考范围`}>
        {[0, 0.5, 1].map((ratio) => {
          const value = high - (high - low) * ratio;
          const lineY = y(value);
          return (
            <g key={ratio}>
              <line x1="44" x2="660" y1={lineY} y2={lineY} className="health-chart-grid" />
              <text x="4" y={lineY + 4} className="health-chart-axis">
                {formatValue(value)}
              </text>
            </g>
          );
        })}
        {series.map(
          (item) =>
            item.referenceRange && (
              <rect
                key={`${item.metric}-range`}
                x="44"
                width="616"
                y={y(item.referenceRange.upper)}
                height={Math.max(2, y(item.referenceRange.lower) - y(item.referenceRange.upper))}
                className={`health-reference-band ${item.metric}`}
              />
            ),
        )}
        {series.map((item) => {
          const points = item.points.map((point) => `${x(point)},${y(point.value)}`).join(' ');
          return (
            <g key={item.metric} className={`health-chart-series ${item.metric}`}>
              {item.points.length > 1 && <polyline points={points} />}
              {item.points.map((point) => {
                const outside = isOutside(point.value, item.referenceRange);
                const label = `${labels[item.metric]} ${formatValue(point.value)} ${item.unit}，测量时间 ${formatDate(point.measuredAt, { dateStyle: 'medium', timeStyle: 'short' })}，接收时间 ${formatDate(point.receivedAt, { dateStyle: 'medium', timeStyle: 'short' })}，来源 ${point.sourceLabel}${outside ? '，超出演示参考区间' : ''}`;
                return outside ? (
                  <rect
                    key={point.id}
                    x={x(point) - 4}
                    y={y(point.value) - 4}
                    width="8"
                    height="8"
                    tabIndex={0}
                    role="button"
                    aria-label={label}
                  >
                    <title>{label}</title>
                  </rect>
                ) : (
                  <circle
                    key={point.id}
                    cx={x(point)}
                    cy={y(point.value)}
                    r="3.7"
                    tabIndex={0}
                    role="button"
                    aria-label={label}
                  >
                    <title>{label}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
        <text x="44" y="198" className="health-chart-axis">
          {formatDate(new Date(firstTime).toISOString(), { month: 'short', day: 'numeric' })}
        </text>
        <text x="620" y="198" className="health-chart-axis">
          {formatDate(new Date(lastTime).toISOString(), { month: 'short', day: 'numeric' })}
        </text>
      </svg>
    </div>
  );
}

function ReferenceNote({ metric, range }: { metric: HealthMetric; range?: ReferenceRange }) {
  const { t, formatDate } = useI18n();
  return range ? (
    <p className="health-reference-note">
      <strong>{t(labels[metric])}：</strong>
      <span>{range.sourceName}</span>
      <span>{t('版本 {version}', { version: range.version })}</span>
      <span>{t('更新于 {date}', { date: formatDate(range.updatedAt) })}</span>
    </p>
  ) : (
    <p className="health-reference-note is-missing">
      <strong>{t(labels[metric])}：</strong>
      {t('暂无适用参考范围')}
    </p>
  );
}

function isOutside(value: number, range?: ReferenceRange) {
  return Boolean(range && (value < range.lower || value > range.upper));
}

function formatValue(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function TrendSkeleton() {
  return (
    <div className="health-trend-skeleton" role="status" aria-label="loading">
      {Array.from({ length: 3 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
