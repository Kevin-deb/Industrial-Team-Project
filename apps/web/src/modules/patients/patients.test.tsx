import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PatientArchive } from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { PatientsPage } from './index';
import { PatientDetail } from './PatientDetail';
import { editableFields } from './fields';

const patient: PatientArchive = {
  id: 'PAT-001',
  name: '陈建国',
  gender: '男',
  age: 68,
  phone: '138****0021',
  diagnosis: '高血压',
  tags: ['高血压'],
  status: 'stable',
  lastVisit: '2026-09-10',
  nextFollowUp: '2026-09-20',
  assignedDoctorId: 'doctor-demo-001',
  allergies: [],
  allergyStatus: 'unknown',
  medicalHistory: ['Original synthetic history'],
  careSummary: 'Original summary',
  symptoms: [],
  version: 1,
  canEdit: true,
};
function response(data: unknown, extra = {}, etag = '"patient-v1"') {
  return new Response(
    JSON.stringify({ data, meta: { mode: 'demo', requestId: 'test', ...extra } }),
    { status: 200, headers: { 'Content-Type': 'application/json', ETag: etag } },
  );
}
beforeEach(() => localStorage.clear());
function detail() {
  return render(
    <I18nProvider>
      <PatientDetail patientId={patient.id} onClose={vi.fn()} onSaved={vi.fn()} />
    </I18nProvider>,
  );
}

describe('Patients workflows', () => {
  it('uses server search, metadata pagination and resets the page when filtering', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        requested.push(path);
        if (path.endsWith('/summary'))
          return response({ total: 42, stable: 42, attention: 0, followUp: 0 });
        return response([patient], { total: 42, page: 2, pageSize: 20 });
      }),
    );
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/patients?page=2']}>
          <PatientsPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await screen.findByText('共 42 位患者 · 当前显示 1 位');
    expect(requested.some((path) => path.includes('page=2&pageSize=20'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(requested.some((path) => path.includes('page=3'))).toBe(true));
    fireEvent.change(screen.getByLabelText('搜索患者姓名、编号或症状'), {
      target: { value: 'dizziness' },
    });
    fireEvent.change(screen.getByLabelText('疾病筛选'), { target: { value: 'hypertension' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() =>
      expect(
        requested.some(
          (path) =>
            path.includes('page=1') &&
            path.includes('q=dizziness') &&
            path.includes('disease=hypertension'),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: '需要关注' }));
    await waitFor(() =>
      expect(
        requested.some(
          (path) =>
            path.includes('page=1') &&
            path.includes('status=attention') &&
            path.includes('disease=hypertension'),
        ),
      ).toBe(true),
    );
  });

  it('saves original values with If-Match even in English and renders successful persistence', async () => {
    localStorage.setItem('carelink-language', 'en');
    const fetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH')
        return response(
          { ...patient, ...JSON.parse(String(init.body)), version: 2 },
          {},
          '"patient-v2"',
        );
      return response(patient);
    });
    vi.stubGlobal('fetch', fetch);
    detail();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit record' }));
    expect(screen.getByLabelText('Name')).toHaveValue('陈建国');
    expect(screen.getByLabelText('Health category')).toHaveValue('高血压');
    fireEvent.change(screen.getByLabelText('Care summary'), {
      target: { value: 'Revised summary' },
    });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Synthetic correction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
    await screen.findByText('Record saved');
    const call = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(call[1]?.headers).toMatchObject({ 'If-Match': '"patient-v1"' });
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      ...editableFields(patient),
      careSummary: 'Revised summary',
      changeReason: 'Synthetic correction',
    });
  });

  it('focuses the required reason instead of silently disabling save', async () => {
    const fetch = vi.fn(async () => response(patient));
    vi.stubGlobal('fetch', fetch);
    detail();
    fireEvent.click(await screen.findByRole('button', { name: '编辑档案' }));
    fireEvent.change(screen.getByLabelText('照护摘要'), { target: { value: 'Updated summary' } });
    expect(screen.getByRole('button', { name: '保存档案' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '保存档案' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('修改原因不能为空');
    expect(screen.getByLabelText('修改原因')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('修改原因'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: '保存档案' }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('修改原因不能为空');
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('修改原因'), { target: { value: 'Correction' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserves the draft on 412 and waits for explicit discard before reload', async () => {
    const fetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH')
        return new Response(
          JSON.stringify({ error: { code: 'STALE_PATIENT_VERSION', message: 'conflict' } }),
          { status: 412 },
        );
      return response(patient);
    });
    vi.stubGlobal('fetch', fetch);
    detail();
    fireEvent.click(await screen.findByRole('button', { name: '编辑档案' }));
    fireEvent.change(screen.getByLabelText('照护摘要'), {
      target: { value: 'Unsaved local draft' },
    });
    fireEvent.change(screen.getByLabelText('修改原因'), { target: { value: 'Correction' } });
    fireEvent.click(screen.getByRole('button', { name: '保存档案' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('照护摘要')).toHaveValue('Unsaved local draft');
    expect(screen.getByRole('button', { name: '保存档案' })).toBeDisabled();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '重新加载档案' }));
    expect(screen.getByLabelText('照护摘要')).toHaveValue('Unsaved local draft');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '重新加载档案' }));
    await screen.findByRole('button', { name: '编辑档案' });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
  });

  it('displays the author, reason, complete field changes and legacy baseline label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path.endsWith('/versions')
          ? response([
              {
                version: 2,
                authoredBy: 'doctor-demo-001',
                authorName: 'Demo doctor',
                createdAt: '2026-09-17',
                changeReason: 'Corrected summary',
                snapshot: { ...patient, version: 2, careSummary: 'New summary' },
              },
              {
                version: 1,
                authoredBy: 'doctor-demo-001',
                authorName: 'Demo doctor',
                createdAt: '2026-09-01',
                changeReason: 'Legacy baseline',
                snapshot: patient,
                snapshotCapturedAt: '2026-09-17',
              },
            ])
          : response({ ...patient, version: 2 }),
      ),
    );
    detail();
    fireEvent.click(await screen.findByRole('button', { name: '修改历史' }));
    await screen.findByText('Corrected summary');
    expect(screen.getByText('Original summary')).toBeInTheDocument();
    expect(screen.getAllByText('New summary').length).toBeGreaterThan(0);
    expect(
      screen.getByText('上一版本使用迁移时捕获的基线，差异以该基线为准。'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('选择档案版本'), { target: { value: '1' } });
    expect(screen.getByText(/此版本为旧档案基线/)).toBeInTheDocument();
  });

  it('does not show editing for a read-only archive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ ...patient, canEdit: false })),
    );
    detail();
    await screen.findByRole('heading', { name: patient.name });
    expect(screen.queryByRole('button', { name: '编辑档案' })).not.toBeInTheDocument();
  });
});
