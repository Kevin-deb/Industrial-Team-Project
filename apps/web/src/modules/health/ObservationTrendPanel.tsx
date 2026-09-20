import type {
  HealthMetric,
  ObservationTrendPoint,
  ObservationTrendResponse,
  ObservationTrendSeries,
  ReferenceRange,
} from '@doctor/contracts';
import { RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
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
              <i className="is-line" />{' '}
              {t('{metric}每日平均', { metric: t(labels[item.metric]) })}
            </span>
          ))}
          <span className="health-legend-reading">
            <i className="is-point" /> {t('单次测量')}
          </span>
          <span className="health-legend-outside">
            <i className="is-point is-outside" /> {t('超出参考范围')}
          </span>
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
  const { t, formatDate } = useI18n();
  const tooltipId = useId();
  const [active, setActive] = useState<{
    metric: HealthMetric;
    point: ObservationTrendPoint;
    index: number;
    x: number;
    y: number;
  }>();
  const [activeAverage, setActiveAverage] = useState<{
    metric: HealthMetric;
    point: ReturnType<typeof dailyTrendPoints>[number];
    x: number;
    y: number;
    unit: string;
  }>();
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
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const activeSeries = active && series.find((item) => item.metric === active.metric);
  const activeRange = activeSeries?.referenceRange;
  const previousPoint = activeSeries && active && activeSeries.points[active.index - 1];
  const pairedSeries =
    active?.metric === 'systolic'
      ? series.find((item) => item.metric === 'diastolic')
      : active?.metric === 'diastolic'
        ? series.find((item) => item.metric === 'systolic')
        : undefined;
  const pairedPoint =
    active &&
    pairedSeries?.points.find((point) => point.measuredAt === active.point.measuredAt);
  const systolicValue =
    active?.metric === 'systolic'
      ? active.point.value
      : active?.metric === 'diastolic'
        ? pairedPoint?.value
        : undefined;
  const diastolicValue =
    active?.metric === 'diastolic'
      ? active.point.value
      : active?.metric === 'systolic'
        ? pairedPoint?.value
        : undefined;
  return (
    <div className="health-trend-chart-wrap">
      <svg
        viewBox="0 0 700 205"
        role="img"
        aria-label={t('{title}，包含数值与演示参考范围', { title })}
      >
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
        {xTicks.map((ratio) => {
          const tickX = 44 + ratio * 616;
          const tickTime = firstTime + ratio * (lastTime - firstTime);
          return (
            <g key={`time-${ratio}`}>
              {ratio > 0 && ratio < 1 && (
                <line x1={tickX} x2={tickX} y1="20" y2="170" className="health-chart-time-grid" />
              )}
              <text
                x={tickX}
                y="198"
                textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}
                className="health-chart-axis"
              >
                {formatDate(new Date(tickTime).toISOString(), { month: 'short', day: 'numeric' })}
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
        {(active || activeAverage) && (
          <line
            x1={(active ?? activeAverage)!.x}
            x2={(active ?? activeAverage)!.x}
            y1="20"
            y2="170"
            className="health-chart-cursor"
          />
        )}
        {series.map((item) => {
          const dailyPoints = dailyTrendPoints(item.points);
          const points = dailyPoints
            .map((point) => `${x(point)},${y(point.value)}`)
            .join(' ');
          return (
            <g key={item.metric} className={`health-chart-series ${item.metric}`}>
              {dailyPoints.length > 1 && <polyline points={points} />}
              {dailyPoints.map((point) => {
                const pointX = x(point);
                const pointY = y(point.value);
                const label = t(
                  '{metric} {date} 每日平均 {value} {unit}，{count} 次测量',
                  {
                    metric: t(labels[item.metric]),
                    date: formatDate(point.measuredAt, { dateStyle: 'medium' }),
                    value: formatValue(point.value),
                    unit: item.unit,
                    count: point.sampleCount,
                  },
                );
                return (
                  <circle
                    key={`${item.metric}-${point.day}-average`}
                    className="health-chart-average-target"
                    cx={pointX}
                    cy={pointY}
                    r="9"
                    tabIndex={0}
                    role="button"
                    aria-label={label}
                    onMouseEnter={() => {
                      setActive(undefined);
                      setActiveAverage({ metric: item.metric, point, x: pointX, y: pointY, unit: item.unit });
                    }}
                    onMouseLeave={() => setActiveAverage(undefined)}
                    onFocus={() => {
                      setActive(undefined);
                      setActiveAverage({ metric: item.metric, point, x: pointX, y: pointY, unit: item.unit });
                    }}
                    onBlur={() => setActiveAverage(undefined)}
                  />
                );
              })}
              {item.points.map((point, index) => {
                const outside = isOutside(point.value, item.referenceRange);
                const label = t(
                  '{metric} {value} {unit}，测量时间 {measuredAt}，接收时间 {receivedAt}，来源 {source}{status}',
                  {
                    metric: t(labels[item.metric]),
                    value: formatValue(point.value),
                    unit: item.unit,
                    measuredAt: formatDate(point.measuredAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                    receivedAt: formatDate(point.receivedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                    source: t(point.sourceLabel),
                    status: outside ? t('，超出演示参考区间') : '',
                  },
                );
                const pointX = spreadPointX(point, item.points, x);
                const pointY = y(point.value);
                const isActive = active?.metric === item.metric && active.point.id === point.id;
                return (
                  <g
                    key={point.id}
                    tabIndex={0}
                    role="button"
                    aria-label={label}
                    aria-describedby={isActive ? tooltipId : undefined}
                    className={isActive ? 'is-active' : undefined}
                    onMouseEnter={() => {
                      setActiveAverage(undefined);
                      setActive({ metric: item.metric, point, index, x: pointX, y: pointY });
                    }}
                    onMouseLeave={() => setActive(undefined)}
                    onFocus={() => {
                      setActiveAverage(undefined);
                      setActive({ metric: item.metric, point, index, x: pointX, y: pointY });
                    }}
                    onBlur={() => setActive(undefined)}
                    onClick={() => setActive({ metric: item.metric, point, index, x: pointX, y: pointY })}
                  >
                    <circle className="health-chart-hit-area" cx={pointX} cy={pointY} r="10" />
                    {outside ? (
                      <circle
                        className="health-chart-point is-outside"
                        cx={pointX}
                        cy={pointY}
                        r="4.2"
                      />
                    ) : (
                      <circle
                        className="health-chart-point"
                        cx={pointX}
                        cy={pointY}
                        r="3.5"
                      />
                    )}
                    <title>{label}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {activeAverage && (
        <aside
          role="tooltip"
          className={`health-trend-tooltip is-average ${activeAverage.x > 510 ? 'align-right' : ''} ${activeAverage.y < 70 ? 'below-point' : ''}`}
          style={{ left: `${(activeAverage.x / 700) * 100}%`, top: `${(activeAverage.y / 205) * 100}%` }}
          data-metric={activeAverage.metric}
        >
          <div className="health-tooltip-heading">
            <span>{t('{metric}当日平均', { metric: t(labels[activeAverage.metric]) })}</span>
            <strong>
              {formatValue(activeAverage.point.value)} <small>{activeAverage.unit}</small>
            </strong>
          </div>
          <dl>
            <div>
              <dt>{t('日期')}</dt>
              <dd>{formatDate(activeAverage.point.measuredAt, { dateStyle: 'medium' })}</dd>
            </div>
            <div>
              <dt>{t('测量次数')}</dt>
              <dd>{t('{count} 次测量', { count: activeAverage.point.sampleCount })}</dd>
            </div>
            <div>
              <dt>{t('当日范围')}</dt>
              <dd>
                {formatValue(activeAverage.point.minimum)}–{formatValue(activeAverage.point.maximum)} {activeAverage.unit}
              </dd>
            </div>
            <div>
              <dt>{t('趋势口径')}</dt>
              <dd>{t('当日全部记录的算术平均')}</dd>
            </div>
          </dl>
          <p>{t('圆点为单次测量，折线仅表示每日平均趋势')}</p>
        </aside>
      )}
      {active && activeSeries && (
        <aside
          id={tooltipId}
          role="tooltip"
          className={`health-trend-tooltip ${active.x > 510 ? 'align-right' : ''} ${active.y < 70 ? 'below-point' : ''}`}
          style={{ left: `${(active.x / 700) * 100}%`, top: `${(active.y / 205) * 100}%` }}
          data-metric={active.metric}
        >
          <div className="health-tooltip-heading">
            <span>{t(labels[active.metric])}</span>
            <strong>
              {formatValue(active.point.value)} <small>{activeSeries.unit}</small>
            </strong>
          </div>
          <dl>
            {systolicValue !== undefined && diastolicValue !== undefined && (
              <>
                <div>
                  <dt>{t('同次血压')}</dt>
                  <dd>
                    {formatValue(systolicValue)}/{formatValue(diastolicValue)} mmHg
                  </dd>
                </div>
                <div>
                  <dt>{t('脉压')}</dt>
                  <dd>{formatValue(systolicValue - diastolicValue)} mmHg</dd>
                </div>
              </>
            )}
            <div>
              <dt>{t('参考判断')}</dt>
              <dd className={isOutside(active.point.value, activeRange) ? 'is-outside' : 'is-within'}>
                {t(rangeStatus(active.point.value, activeRange))}
              </dd>
            </div>
            <div>
              <dt>{t('演示参考范围')}</dt>
              <dd>
                {activeRange
                  ? `${formatValue(activeRange.lower)}–${formatValue(activeRange.upper)} ${activeSeries.unit}`
                  : t('暂无适用参考范围')}
              </dd>
            </div>
            {activeRange && (
              <div>
                <dt>{t('偏离程度')}</dt>
                <dd>{rangeDistance(active.point.value, activeRange, activeSeries.unit, t)}</dd>
              </div>
            )}
            <div>
              <dt>{t('较前次')}</dt>
              <dd>
                {previousPoint
                  ? `${signedValue(active.point.value - previousPoint.value)} ${activeSeries.unit}`
                  : t('首条记录')}
              </dd>
            </div>
            <div>
              <dt>{t('测量时间')}</dt>
              <dd>{formatDate(active.point.measuredAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            </div>
            <div>
              <dt>{t('接收时间')}</dt>
              <dd>{formatDate(active.point.receivedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            </div>
            <div className="health-tooltip-source">
              <dt>{t('数据来源')}</dt>
              <dd>{active.point.sourceLabel}</dd>
            </div>
          </dl>
          <p>{t('仅用于趋势查看，不构成诊断')}</p>
        </aside>
      )}
    </div>
  );
}

function ReferenceNote({ metric, range }: { metric: HealthMetric; range?: ReferenceRange }) {
  const { t, formatDate } = useI18n();
  return range ? (
    <p className="health-reference-note">
      <strong>{t('{metric}：', { metric: t(labels[metric]) })}</strong>
      <span>{t(range.sourceName)}</span>
      <span>{t('版本 {version}', { version: range.version })}</span>
      <span>{t('更新于 {date}', { date: formatDate(range.updatedAt) })}</span>
    </p>
  ) : (
    <p className="health-reference-note is-missing">
      <strong>{t('{metric}：', { metric: t(labels[metric]) })}</strong>
      {t('暂无适用参考范围')}
    </p>
  );
}

function isOutside(value: number, range?: ReferenceRange) {
  return Boolean(range && (value < range.lower || value > range.upper));
}

function rangeStatus(value: number, range: ReferenceRange | undefined) {
  if (!range) return '暂无参考判断';
  if (value < range.lower) return '低于演示参考范围';
  if (value > range.upper) return '高于演示参考范围';
  return '参考范围内';
}

function signedValue(value: number) {
  const formatted = formatValue(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function rangeDistance(
  value: number,
  range: ReferenceRange,
  unit: string,
  t: (source: string, values?: Record<string, string | number>) => string,
) {
  if (value < range.lower)
    return t('低于下限 {distance} {unit}', {
      distance: formatValue(range.lower - value),
      unit,
    });
  if (value > range.upper)
    return t('高于上限 {distance} {unit}', {
      distance: formatValue(value - range.upper),
      unit,
    });
  return t('距最近界限 {distance} {unit}', {
    distance: formatValue(Math.min(value - range.lower, range.upper - value)),
    unit,
  });
}

function dailyTrendPoints(points: ObservationTrendPoint[]) {
  const days = new Map<string, ObservationTrendPoint[]>();
  for (const point of points) {
    const day = point.measuredAt.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), point]);
  }
  return [...days.values()]
    .map((dayPoints) => ({
      ...dayPoints[0],
      day: dayPoints[0].measuredAt.slice(0, 10),
      value: dayPoints.reduce((sum, point) => sum + point.value, 0) / dayPoints.length,
      minimum: Math.min(...dayPoints.map((point) => point.value)),
      maximum: Math.max(...dayPoints.map((point) => point.value)),
      sampleCount: dayPoints.length,
    }))
    .sort((left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt));
}

function spreadPointX(
  point: ObservationTrendPoint,
  points: ObservationTrendPoint[],
  position: (point: ObservationTrendPoint) => number,
) {
  const peers = points.filter((candidate) => candidate.measuredAt === point.measuredAt);
  if (peers.length < 2) return position(point);
  const peerIndex = peers.findIndex((candidate) => candidate.id === point.id);
  const offset = (peerIndex - (peers.length - 1) / 2) * 5;
  return Math.max(44, Math.min(660, position(point) + offset));
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
