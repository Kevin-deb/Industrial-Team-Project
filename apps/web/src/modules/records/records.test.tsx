import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type {
  Consultation,
  MedicalOrder,
  MedicalOrderTemplateDefinition,
  MedicalRecordDetail,
  MedicalRecordTemplateDefinition,
  MedicalRecordVersion,
} from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { RecordsPage } from './index';
import { RecordEditor } from './RecordEditor';

const templateFixture: MedicalRecordTemplateDefinition[] = [
  {
    id: 'outpatient',
    version: 1,
    titleKey: '门诊病历',
    subtitleKey: '主诉 · 病史 · 诊疗计划',
    fields: [{ key: 'chiefComplaint', labelKey: '主诉', maxLength: 5000, requiredOnSubmit: true }],
  },
];

function apiResponse(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { mode: 'demo', requestId: 'test' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderRecords() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      apiResponse(String(input).includes('record-templates') ? templateFixture : []),
    ),
  );
  return render(
    <I18nProvider>
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Records template catalogue', () => {
  beforeEach(() => localStorage.clear());

  it('renders the shared catalogue in Chinese without duplicating field definitions', async () => {
    renderRecords();
    fireEvent.click(await screen.findByRole('button', { name: '模板预览' }));
    expect(screen.getAllByText('门诊病历')).toHaveLength(2);
    expect(screen.getByText('主诉')).toBeInTheDocument();
    expect(templateFixture[0]!.fields[0]!.maxLength).toBe(5000);
  });

  it('localizes the same shared catalogue in English', async () => {
    localStorage.setItem('carelink-language', 'en');
    renderRecords();
    fireEvent.click(await screen.findByRole('button', { name: 'Templates' }));
    expect(screen.getAllByText('Outpatient record')).toHaveLength(2);
    expect(screen.getByText('Chief complaint')).toBeInTheDocument();
    expect(
      screen.getByText('Structure preview · Select this template when creating a draft'),
    ).toBeInTheDocument();
  });

  it('describes the local review workflow instead of a read-only placeholder', async () => {
    renderRecords();
    fireEvent.click(await screen.findByRole('button', { name: '诊疗流程' }));
    expect(
      screen.getByText('当前本地演示支持提交、退回、批准、归档和修订留痕。'),
    ).toBeInTheDocument();
  });
});

const reviewRecord: MedicalRecordDetail = {
  id: 'REC-002',
  patientId: 'PAT-002',
  patientName: '王秀英',
  title: '血糖复查记录',
  diagnosis: '2 型糖尿病',
  status: 'pending-review',
  authorName: '许清',
  updatedAt: '2026-09-09T16:20:00+08:00',
  version: 1,
  orderCount: 0,
  encounterId: null,
  templateId: 'outpatient',
  templateVersion: 1,
  body: { chiefComplaint: 'synthetic' },
  authoredAt: '2026-09-09T16:20:00+08:00',
  amendmentReason: null,
  latestReview: null,
  availableActions: {
    canEdit: false,
    canSubmit: false,
    canReview: true,
    canArchive: false,
    canCorrect: false,
  },
};

const historyFixture: MedicalRecordVersion[] = [
  {
    recordId: 'REC-002',
    version: 1,
    title: '血糖复查记录',
    diagnosis: '2 型糖尿病',
    templateId: 'outpatient',
    templateVersion: 1,
    body: { chiefComplaint: 'synthetic' },
    authorName: '许清',
    authoredAt: '2026-09-09T16:20:00+08:00',
    amendmentReason: null,
  },
];

describe('Record editor lifecycle actions', () => {
  beforeEach(() => localStorage.clear());

  it('shows review actions and version history from the public record detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('record-templates')) return apiResponse(templateFixture);
        if (url.includes('/patients')) return apiResponse([]);
        if (url.includes('/encounters')) return apiResponse([]);
        if (url.includes('/versions')) return apiResponse(historyFixture);
        if (url.includes('/records/REC-002')) return apiResponse(reviewRecord);
        return apiResponse([]);
      }),
    );
    render(
      <I18nProvider>
        <RecordEditor recordId="REC-002" onClose={() => undefined} onSaved={() => undefined} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('button', { name: '批准此版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退回修改' })).toBeDisabled();
    expect(screen.getByText('版本历史')).toBeInTheDocument();
    expect(screen.getByText(/许清/)).toBeInTheDocument();
  });

  it('localizes review actions in English', async () => {
    localStorage.setItem('carelink-language', 'en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('record-templates')) return apiResponse(templateFixture);
        if (url.includes('/patients')) return apiResponse([]);
        if (url.includes('/encounters')) return apiResponse([]);
        if (url.includes('/versions')) return apiResponse(historyFixture);
        if (url.includes('/records/REC-002')) return apiResponse(reviewRecord);
        return apiResponse([]);
      }),
    );
    render(
      <I18nProvider>
        <RecordEditor recordId="REC-002" onClose={() => undefined} onSaved={() => undefined} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Approve this version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return for edits' })).toBeInTheDocument();
    expect(screen.getByText('Version history')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Review comment')).toBeInTheDocument());
  });
});

const orderTemplateFixture: MedicalOrderTemplateDefinition[] = [
  {
    id: 'medication',
    version: 1,
    titleKey: '用药医嘱',
    subtitleKey: '药品 · 剂量 · 疗程',
    fields: [{ key: 'drugName', labelKey: '药品名称', maxLength: 200, required: true }],
  },
];

const consultationFixture: Consultation[] = [
  {
    id: 'CON-001',
    patientId: 'PAT-002',
    patientName: '王秀英',
    title: '糖尿病综合健康评估',
    specialty: '内分泌科',
    status: 'scheduled',
    scheduledAt: '2026-09-11T10:00:00+08:00',
    summary: 'synthetic',
    participants: ['林知远'],
  },
];

const orderFixture: MedicalOrder[] = [
  {
    id: 'ORD-100',
    recordId: 'REC-002',
    patientId: 'PAT-002',
    type: 'medication',
    status: 'active',
    version: 1,
    authorName: '许清',
    createdAt: '2026-09-09T16:20:00+08:00',
    updatedAt: '2026-09-09T16:20:00+08:00',
    stoppedAt: null,
    stopReason: null,
  },
];

describe('Record editor orders and consultation materials', () => {
  beforeEach(() => localStorage.clear());

  it('renders order templates, confirmation, stop and consultation sharing in Chinese', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('order-templates')) return apiResponse(orderTemplateFixture);
        if (url.includes('/consultations')) return apiResponse(consultationFixture);
        if (url.includes('/orders')) return apiResponse(orderFixture);
        if (url.includes('record-templates')) return apiResponse(templateFixture);
        if (url.includes('/patients')) return apiResponse([]);
        if (url.includes('/encounters')) return apiResponse([]);
        if (url.includes('/versions')) return apiResponse(historyFixture);
        if (url.includes('/records/REC-002')) return apiResponse(reviewRecord);
        return apiResponse([]);
      }),
    );
    render(
      <I18nProvider>
        <RecordEditor recordId="REC-002" onClose={() => undefined} onSaved={() => undefined} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('button', { name: '确认开立医嘱' })).toBeDisabled();
    expect(screen.getByLabelText('开单模板')).toBeInTheDocument();
    expect(screen.getByText('我已核对模板预填内容，确认开立此医嘱')).toBeInTheDocument();
    expect(screen.getByLabelText('停止原因')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止医嘱' })).toBeInTheDocument();
    expect(screen.getByText('引用到会诊')).toBeInTheDocument();
    expect(screen.getByLabelText('会诊任务')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '引用当前版本' })).toBeDisabled();
  });

  it('localizes order and material actions in English', async () => {
    localStorage.setItem('carelink-language', 'en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('order-templates')) return apiResponse(orderTemplateFixture);
        if (url.includes('/consultations')) return apiResponse(consultationFixture);
        if (url.includes('/orders')) return apiResponse(orderFixture);
        if (url.includes('record-templates')) return apiResponse(templateFixture);
        if (url.includes('/patients')) return apiResponse([]);
        if (url.includes('/encounters')) return apiResponse([]);
        if (url.includes('/versions')) return apiResponse(historyFixture);
        if (url.includes('/records/REC-002')) return apiResponse(reviewRecord);
        return apiResponse([]);
      }),
    );
    render(
      <I18nProvider>
        <RecordEditor recordId="REC-002" onClose={() => undefined} onSaved={() => undefined} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Confirm and issue order' })).toBeDisabled();
    expect(screen.getByLabelText('Order template')).toBeInTheDocument();
    expect(
      screen.getByText('I have reviewed the prefilled template and confirm this order'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop order' })).toBeInTheDocument();
    expect(screen.getByText('Share with consultation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reference this version' })).toBeDisabled();
  });
});
