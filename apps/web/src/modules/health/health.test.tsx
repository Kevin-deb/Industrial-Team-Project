import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../shared/i18n';
import { renderWithEProviders } from '../e-shared/test-utils';
import { HealthPage } from './HealthPage';
import { MemoryRouter } from 'react-router-dom';

const patient = {
  id: 'PAT-001',
  name: '陈建国',
  gender: '男',
  age: 68,
  diagnosis: '高血压',
  nextFollowUp: '2026-09-10',
  avatarInitials: '陈',
};

const trendResponse = {
  patientId: 'PAT-001',
  patientAge: 68,
  from: '2026-08-01T00:00:00+08:00',
  to: '2026-09-13T23:59:59+08:00',
  series: [
    trendSeries('systolic', 'mmHg', [128, 132, 126], 90, 139),
    trendSeries('diastolic', 'mmHg', [78, 82, 76], 60, 89),
    trendSeries('glucose', 'mmol/L', [6.2, 7.1, 6.6], 3.9, 7.8),
    trendSeries('heart-rate', 'bpm', [70, 74, 72], 55, 95),
  ],
};

trendResponse.series[0].points.push({
  id: 'systolic-extra-same-time',
  value: 145,
  measuredAt: '2026-09-03T08:00:00+08:00',
  receivedAt: '2026-09-03T08:02:00+08:00',
  sourceLabel: '模拟家用设备',
});

function response(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { requestId: 'req-test', mode: 'demo' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HealthPage', () => {
  const requested: string[] = [];

  beforeEach(() => {
    localStorage.setItem('carelink-language', 'zh-CN');
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.includes('/patients/')) return response(patient);
        if (url.includes('/patients')) return response([patient]);
        if (url.includes('/observation-trends')) return response(trendResponse);
        if (url.includes('/observations'))
          return response({
            items: [
              {
                id: 'OBS-GLUCOSE-001',
                patientId: 'PAT-001',
                metric: 'glucose',
                value: 6.699999999999999,
                unit: 'mmol/L',
                measuredAt: '2026-09-10T07:00:00+08:00',
                receivedAt: '2026-09-10T07:01:00+08:00',
                source: 'synthetic-demo',
                sourceLabel: '模拟患者上传 · 合成数据',
                qualityStatus: 'demo',
              },
              {
                id: 'OBS-DEVICE-001',
                patientId: 'PAT-001',
                metric: 'systolic',
                value: 148,
                unit: 'mmHg',
                measuredAt: '2026-09-10T08:00:00+08:00',
                receivedAt: '2026-09-10T08:01:00+08:00',
                source: 'device-simulator',
                sourceLabel: '患者家用血压计',
                qualityStatus: 'pending-confirmation',
              },
              {
                id: 'OBS-MANUAL-001',
                patientId: 'PAT-001',
                metric: 'heart-rate',
                value: 72,
                unit: 'bpm',
                measuredAt: '2026-09-10T09:00:00+08:00',
                receivedAt: '2026-09-10T09:01:00+08:00',
                source: 'manual-entry',
                sourceLabel: '医生手工录入',
                qualityStatus: 'recorded',
                recordedBy: 'doctor-demo-001',
              },
            ],
            page: 1,
            pageSize: 30,
            total: 3,
          });
        return response([]);
      }),
    );
  });

  afterEach(() => {
    requested.length = 0;
    vi.useRealTimers();
  });

  it('searches patients after a 250 ms debounce and shows the selected B-owned summary', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter>
          <HealthPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: '健康管理' })).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: '搜索健康管理患者' });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByRole('button', { name: /陈建国.*PAT-001/ })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: '陈建国' } });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(requested.some((url) => url.includes('q='))).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(requested.some((url) => url.includes('/health/patients?q='))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('68 岁 · 男')).toBeInTheDocument();
    expect(screen.queryByText('138****0021')).not.toBeInTheDocument();
    expect(screen.getByText('高血压')).toBeInTheDocument();
    expect(screen.getByText('6.7')).toBeInTheDocument();
    expect(screen.queryByText('6.699999999999999')).not.toBeInTheDocument();
  });

  it('keeps plans, assessments, and reminders inside the same patient workspace', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter>
          <HealthPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: '搜索健康管理患者' }));
    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));
    await act(() => vi.advanceTimersByTimeAsync(10));

    fireEvent.click(screen.getByRole('button', { name: '管理计划' }));
    expect(screen.getByRole('button', { name: '新建计划' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '健康评估' }));
    expect(screen.getByRole('button', { name: '新增评估' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '随访提醒' }));
    expect(screen.getByRole('button', { name: '新增提醒' })).toBeInTheDocument();
  });

  it('lets the responsible doctor confirm pending device data while manual data stays recorded', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter>
          <HealthPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: '搜索健康管理患者' }));
    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));
    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(screen.getByText('已录入')).toBeInTheDocument();
    expect(screen.getByText('待责任医生确认')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认数据' }));
    expect(screen.getByRole('dialog', { name: '确认观测数据' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('148')).toBeInTheDocument();
  });

  it('switches locally to complete age-referenced trend summaries without losing filters', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter>
          <HealthPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: '搜索健康管理患者' }));
    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));
    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(screen.getByRole('button', { name: '记录列表' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '趋势图' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(requested.some((url) => url.includes('/health/observation-trends?'))).toBe(true);
    expect(screen.getByRole('heading', { name: '血压趋势' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '血糖趋势' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '心率趋势' })).toBeInTheDocument();
    expect(screen.getAllByText('最新值').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('按 68 岁匹配')).toBeInTheDocument();
    expect(screen.getAllByText('CareLink 演示参考配置（非临床指南）').length).toBeGreaterThan(0);
    expect(screen.getByText('126 mmHg')).toBeInTheDocument();
    expect(screen.getByText('90-139 mmHg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '记录列表' }));
    expect(screen.getByRole('columnheader', { name: '测量时间' })).toBeInTheDocument();
  });

  it('shows a detailed clinical reading card when a trend point is hovered or focused', async () => {
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter>
          <HealthPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: '搜索健康管理患者' }));
    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    fireEvent.click(screen.getByRole('button', { name: '趋势图' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByText('收缩压每日平均')).toBeInTheDocument();
    expect(screen.getByText('舒张压每日平均')).toBeInTheDocument();
    expect(screen.getAllByText('单次测量').length).toBeGreaterThan(0);
    expect(screen.getAllByText('超出参考范围').length).toBeGreaterThan(0);

    const systolicTrend = document.querySelector('.health-chart-series.systolic polyline');
    expect(systolicTrend?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(3);
    expect(
      document.querySelectorAll('.health-chart-series.systolic .health-chart-point'),
    ).toHaveLength(4);

    const dailyAverage = screen.getByRole('button', {
      name: /收缩压.*9月3日.*每日平均 135.5 mmHg.*2 次测量/,
    });
    fireEvent.mouseEnter(dailyAverage);
    expect(screen.getByRole('tooltip')).toHaveTextContent('当日平均');
    expect(screen.getByRole('tooltip')).toHaveTextContent('135.5 mmHg');
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 次测量');
    expect(screen.getByRole('tooltip')).toHaveTextContent('126–145 mmHg');
    fireEvent.mouseLeave(dailyAverage);

    const point = screen.getByRole('button', { name: /收缩压 126 mmHg/ });
    fireEvent.mouseEnter(point);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('收缩压');
    expect(tooltip).toHaveTextContent('126 mmHg');
    expect(tooltip).toHaveTextContent('同次血压');
    expect(tooltip).toHaveTextContent('126/76 mmHg');
    expect(tooltip).toHaveTextContent('脉压');
    expect(tooltip).toHaveTextContent('50 mmHg');
    expect(tooltip).toHaveTextContent('参考范围内');
    expect(tooltip).toHaveTextContent('90–139 mmHg');
    expect(tooltip).toHaveTextContent('距最近界限 13 mmHg');
    expect(tooltip).toHaveTextContent('较前次');
    expect(tooltip).toHaveTextContent('-6 mmHg');
    expect(tooltip).toHaveTextContent('2026年9月3日 08:00');
    expect(tooltip).toHaveTextContent('2026年9月3日 08:01');
    expect(tooltip).toHaveTextContent('模拟居家设备');
    expect(tooltip).toHaveTextContent('仅用于趋势查看，不构成诊断');

    fireEvent.mouseLeave(point);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(point);
    expect(screen.getByRole('tooltip')).toHaveTextContent('126 mmHg');
  });

  it('uses the shared platform language for trend legends and hover details', async () => {
    localStorage.setItem('carelink-language', 'en');
    renderWithEProviders(
      <I18nProvider>
        <MemoryRouter>
          <HealthPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: 'Search health management patients' }));
    fireEvent.click(screen.getByRole('button', { name: /Chen Jianguo.*PAT-001/ }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    fireEvent.click(screen.getByRole('button', { name: 'Trends' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByText('Systolic daily average')).toBeInTheDocument();
    expect(screen.getByText('Diastolic daily average')).toBeInTheDocument();
    expect(screen.getAllByText('Individual reading').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Outside reference range').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('CareLink demo reference configuration (not clinical guidance)').length,
    ).toBeGreaterThan(0);

    const dailyAverage = screen.getByRole('button', {
      name: /Systolic.*3 Sept 2026.*daily average 135.5 mmHg.*2 readings/,
    });
    fireEvent.mouseEnter(dailyAverage);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Systolic daily average');
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 readings');
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Arithmetic mean of all readings that day',
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Dots are individual readings; the line shows the daily average only',
    );
    fireEvent.mouseLeave(dailyAverage);

    const point = screen.getByRole('button', { name: /Systolic 126 mmHg.*Measured at/ });
    fireEvent.mouseEnter(point);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Within reference range');
    expect(screen.getByRole('tooltip')).toHaveTextContent('13 mmHg from the nearest limit');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Simulated home device');
  });
});

function trendSeries(
  metric: 'systolic' | 'diastolic' | 'glucose' | 'heart-rate',
  unit: string,
  values: number[],
  lower: number,
  upper: number,
) {
  return {
    metric,
    unit,
    points: values.map((value, index) => ({
      id: `${metric}-${index}`,
      value,
      measuredAt: `2026-09-${String(index + 1).padStart(2, '0')}T08:00:00+08:00`,
      receivedAt: `2026-09-${String(index + 1).padStart(2, '0')}T08:01:00+08:00`,
      sourceLabel: '模拟居家设备',
    })),
    stats: {
      latest: values.at(-1),
      average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      change: Number((values.at(-1)! - values[0]!).toFixed(2)),
      count: values.length,
    },
    referenceRange: {
      metric,
      lower,
      upper,
      unit,
      ageMin: 65,
      ageMax: 79,
      sourceName: 'CareLink 演示参考配置（非临床指南）',
      version: 'demo-2026.09',
      updatedAt: '2026-09-01T00:00:00+08:00',
      level: 'demo',
    },
  };
}
