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
        if (url.includes('/observations'))
          return response({ items: [], page: 1, pageSize: 30, total: 0 });
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
    expect(screen.getByText('68 岁 · 男')).toBeInTheDocument();
    expect(screen.queryByText('138****0021')).not.toBeInTheDocument();
    expect(screen.getByText('高血压')).toBeInTheDocument();
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
});
