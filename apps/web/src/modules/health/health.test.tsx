import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../shared/i18n';
import { renderWithEProviders } from '../e-shared/test-utils';
import { HealthPage } from './HealthPage';

const patient = {
  id: 'PAT-001', name: '陈建国', gender: '男', age: 68, phone: '138****0021',
  diagnosis: '高血压', tags: ['慢病管理'], status: 'attention', lastVisit: '2026-09-08',
  nextFollowUp: '2026-09-10', assignedDoctorId: 'doctor-demo-001', allergies: ['青霉素'],
  medicalHistory: ['高血压病史 8 年'], careSummary: '合成演示资料。',
};

function response(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { requestId: 'req-test', mode: 'demo' } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}

describe('HealthPage', () => {
  const requested: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('/patients')) return response([patient]);
      if (url.includes('/observations')) return response({ items: [], page: 1, pageSize: 30, total: 0 });
      return response([]);
    }));
  });

  afterEach(() => {
    requested.length = 0;
    vi.useRealTimers();
  });

  it('searches patients after a 250 ms debounce and shows the selected B-owned summary', async () => {
    renderWithEProviders(<I18nProvider><HealthPage /></I18nProvider>);

    expect(screen.getByRole('heading', { name: '健康管理' })).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: '搜索健康管理患者' });
    fireEvent.change(search, { target: { value: '陈建国' } });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(requested.some((url) => url.includes('q='))).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(requested.some((url) => url.includes('/patients?q='))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /陈建国.*PAT-001/ }));
    expect(screen.getByText('68 岁 · 男')).toBeInTheDocument();
    expect(screen.getByText('138****0021')).toBeInTheDocument();
    expect(screen.getByText('高血压')).toBeInTheDocument();
  });
});
