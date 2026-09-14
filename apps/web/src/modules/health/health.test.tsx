import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../shared/i18n';
import { renderWithEProviders } from '../e-shared/test-utils';
import { HealthPage } from './HealthPage';

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

function response(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { requestId: 'req-test', mode: 'demo' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HealthPage', () => {
  const requested: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
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
            ],
            page: 1,
            pageSize: 30,
            total: 1,
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
        <HealthPage />
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
        <HealthPage />
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: '搜索健康管理患者' }));
    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));

    fireEvent.click(screen.getByRole('button', { name: '管理计划' }));
    expect(screen.getByRole('button', { name: '新建计划' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '健康评估' }));
    expect(screen.getByRole('button', { name: '新增评估' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '随访提醒' }));
    expect(screen.getByRole('button', { name: '新增提醒' })).toBeInTheDocument();
  });

  it('switches locally to complete age-referenced trend summaries without losing filters', async () => {
    renderWithEProviders(
      <I18nProvider>
        <HealthPage />
      </I18nProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.focus(screen.getByRole('searchbox', { name: '搜索健康管理患者' }));
    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));

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
