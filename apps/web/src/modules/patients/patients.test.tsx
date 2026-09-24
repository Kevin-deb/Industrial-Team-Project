import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PatientArchive } from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { PatientsPage } from './index';
import { PatientDetail } from './PatientDetail';
import { PatientRegistration } from './PatientRegistration';
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
  responsibleDoctorName: '林知远',
  lifecycleStatus: 'active',
  accessRole: 'responsible',
  canBatch: true,
  canArchive: true,
  canRelease: true,
  canTransfer: true,
  batchDisabledReason: null,
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
      <MemoryRouter>
        <PatientDetail patientId={patient.id} onClose={vi.fn()} onSaved={vi.fn()} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Patients workflows', () => {
  it('keeps name input focused when the first character makes registration dirty', async () => {
    const close = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <I18nProvider>
        <PatientRegistration onClose={close} onCreated={vi.fn()} />
      </I18nProvider>,
    );
    const name = screen.getByLabelText('姓名');
    name.focus();
    fireEvent.change(name, { target: { value: 'S' } });
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: 'Synthetic' } });
    expect(name).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(confirm).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(name).toHaveFocus();
  });

  it('keeps the registration draft and submission key when saving fails', async () => {
    const saved = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Try again' } }), { status: 503 }),
      )
      .mockResolvedValueOnce(response(patient));
    vi.stubGlobal('fetch', fetch);
    render(
      <I18nProvider>
        <PatientRegistration onClose={vi.fn()} onCreated={saved} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('姓名'), {
      target: { value: 'Synthetic registration' },
    });
    fireEvent.change(screen.getByLabelText('性别'), { target: { value: '男' } });
    fireEvent.change(screen.getByLabelText('年龄'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('健康分类'), {
      target: { value: 'Synthetic condition' },
    });
    fireEvent.change(screen.getByLabelText('建档原因'), {
      target: { value: 'Initial registration' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建档案' }));
    await screen.findByText('Try again');
    expect(screen.getByLabelText('姓名')).toHaveValue('Synthetic registration');
    fireEvent.click(screen.getByRole('button', { name: '创建档案' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      fetch.mock.calls[1][1].headers['Idempotency-Key'],
    );
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body).lastVisit).toBe('');
  });

  it('protects a dirty registration draft when cancellation is declined', async () => {
    const close = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <I18nProvider>
        <PatientRegistration onClose={close} onCreated={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'Synthetic draft' } });
    fireEvent.click(screen.getByRole('button', { name: '取消建档' }));
    expect(confirm).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('姓名')).toHaveValue('Synthetic draft');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '取消建档' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows generic unavailable feedback without listing inaccessible IDs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (init?.method === 'POST')
          return new Response(
            JSON.stringify({
              error: { code: 'PATIENT_BATCH_UNAVAILABLE', message: 'unavailable' },
            }),
            { status: 404 },
          );
        return path.endsWith('/summary')
          ? response({ total: 1 })
          : response([patient], { total: 1 });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <I18nProvider>
        <MemoryRouter>
          <PatientsPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByLabelText('选择患者 PAT-001'));
    fireEvent.change(screen.getByLabelText('批量修改原因'), { target: { value: 'Review' } });
    fireEvent.click(screen.getByRole('button', { name: '批量更新状态' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('部分患者已不可用或超出当前授权范围');
    expect(alert).not.toHaveTextContent('PAT-001');
    expect(screen.getByRole('button', { name: '批量更新状态' })).toBeDisabled();
    expect(screen.getByLabelText('选择患者 PAT-001')).toBeChecked();
  });

  it('groups server results and submits only editable selected patients with their versions', async () => {
    const fetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return response({
          committed: true,
          results: [{ id: patient.id, outcome: 'updated', version: 2 }],
        });
      if (path.endsWith('/summary'))
        return response({ total: 8, stable: 8, attention: 0, followUp: 0 });
      return response(
        [
          { ...patient, groupKey: '高血压' },
          {
            ...patient,
            id: 'PAT-002',
            canEdit: false,
            canBatch: false,
            accessRole: 'collaborative-readonly',
            responsibleDoctorName: '周明',
            batchDisabledReason: '当前为协作只读权限，只有责任医生可以修改。',
            groupKey: '高血压',
          },
        ],
        { total: 8, groups: [{ key: '高血压', count: 8 }] },
      );
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/patients?groupBy=disease']}>
          <PatientsPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    await screen.findByText('匹配 8 位 · 本页 2 位');
    expect(screen.getByLabelText('选择患者 PAT-002')).toBeDisabled();
    expect(screen.getByText('当前为协作只读权限，只有责任医生可以修改。')).toHaveAttribute(
      'title',
      '当前为协作只读权限，只有责任医生可以修改。',
    );
    expect(document.querySelectorAll('.patients-access-detail')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('全选当前页可编辑患者'));
    expect(screen.getByText('已选择 1 位患者')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '批量更新状态' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('修改原因不能为空');
    fireEvent.change(screen.getByLabelText('批量修改原因'), { target: { value: 'Review' } });
    fireEvent.change(screen.getByLabelText('目标管理状态'), { target: { value: 'attention' } });
    fireEvent.click(screen.getByRole('button', { name: '批量更新状态' }));
    await screen.findByText('批量更新完成');
    const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      patients: [{ id: patient.id, expectedVersion: 1 }],
      status: 'attention',
      changeReason: 'Review',
    });
    await screen.findByText('已选择 0 位患者');
    fireEvent.click(screen.getByLabelText('选择患者 PAT-001'));
    fireEvent.click(screen.getByRole('button', { name: '按状态分组' }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([path]) => path.includes('groupBy=status'))).toBe(true),
    );
    await screen.findByText('已选择 0 位患者');
  });

  it('preserves batch selection and reason on a stale batch and requires refresh', async () => {
    const fetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return response({
          committed: false,
          results: [{ id: patient.id, outcome: 'stale', version: 2 }],
        });
      if (path.endsWith('/summary')) return response({ total: 1 });
      return response([patient], { total: 1 });
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <I18nProvider>
        <MemoryRouter>
          <PatientsPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByLabelText('选择患者 PAT-001'));
    fireEvent.change(screen.getByLabelText('批量修改原因'), { target: { value: 'Draft reason' } });
    fireEvent.click(screen.getByRole('button', { name: '批量更新状态' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('本批次未保存任何修改');
    expect(screen.getByLabelText('选择患者 PAT-001')).toBeChecked();
    expect(screen.getByLabelText('批量修改原因')).toHaveValue('Draft reason');
    expect(screen.getByRole('button', { name: '批量更新状态' })).toBeDisabled();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '刷新患者列表' }));
    await screen.findByText('已选择 0 位患者');
  });

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
