import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MedicalRecordDetail, MedicalRecordTemplateDefinition } from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { RecordEditor } from './RecordEditor';
import { recognizeRecordImage } from './ocr/recognize-record-image';

vi.mock('./ocr/recognize-record-image', () => ({
  recognizeRecordImage: vi.fn(),
  validateRecordImage: vi.fn(),
}));
const templates: MedicalRecordTemplateDefinition[] = [
  {
    id: 'outpatient',
    version: 1,
    titleKey: '门诊病历',
    subtitleKey: '',
    fields: [{ key: 'chiefComplaint', labelKey: '主诉', maxLength: 5000, requiredOnSubmit: true }],
  },
  {
    id: 'followup',
    version: 1,
    titleKey: '复诊记录',
    subtitleKey: '',
    fields: [
      { key: 'followupReason', labelKey: '复诊原因', maxLength: 5000, requiredOnSubmit: true },
    ],
  },
];
const patients = [
  { id: 'PAT-001', name: '张三' },
  { id: 'PAT-002', name: '李四' },
];
const reviewers = [
  { id: 'doctor-demo-002', name: '审核医生', title: '主任医师', department: '全科医学科' },
];
const saved: MedicalRecordDetail = {
  id: 'REC-OCR',
  patientId: 'PAT-001',
  patientName: '张三',
  title: '手动标题',
  diagnosis: '手动诊断',
  status: 'draft',
  authorName: '医生',
  reviewerId: 'doctor-demo-002',
  reviewerName: '审核医生',
  updatedAt: '2026-09-28T10:00:00Z',
  version: 1,
  orderCount: 0,
  encounterId: null,
  templateId: 'outpatient',
  templateVersion: 1,
  body: { chiefComplaint: '手动主诉' },
  authoredAt: '2026-09-28T10:00:00Z',
  amendmentReason: null,
  latestReview: null,
  availableActions: {
    canEdit: true,
    canSubmit: true,
    canReview: false,
    canArchive: false,
    canCorrect: false,
  },
};
function reply(data: unknown) {
  return new Response(JSON.stringify({ data, meta: { mode: 'demo', requestId: 'test' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function setup(record?: MedicalRecordDetail) {
  const fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const path = String(input);
    if (path.includes('record-templates')) return reply(templates);
    if (path.includes('record-reviewers')) return reply(reviewers);
    if (path.includes('/patients')) return reply(patients);
    if (path.includes('/versions')) return reply([]);
    if (path.endsWith('/records') && options?.method === 'POST') return reply(saved);
    if (record && path.endsWith('/records/' + record.id)) return reply(record);
    return reply([]);
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <I18nProvider>
      <RecordEditor recordId={record?.id} onClose={() => undefined} onSaved={() => undefined} />
    </I18nProvider>,
  );
  return fetch;
}
async function startPendingRecognition() {
  await screen.findByRole('button', { name: '保存草稿' });
  fireEvent.change(screen.getByLabelText('选择患者'), { target: { value: 'PAT-001' } });
  fireEvent.change(screen.getByLabelText('选择审核医师'), {
    target: { value: 'doctor-demo-002' },
  });
  fireEvent.click(screen.getByTestId('record-photo-open'));
  fireEvent.change(screen.getByTestId('record-photo-file'), {
    target: { files: [new File(['image'], 'record.png', { type: 'image/png' })] },
  });
  fireEvent.click(await screen.findByTestId('record-photo-recognize'));
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(recognizeRecordImage).mockReset();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:photo'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

describe('Record editor photo context isolation', () => {
  it.each(['patient', 'template'] as const)(
    'aborts pending recognition when the %s changes and ignores the old text',
    async (context) => {
      let finish!: (result: { text: string; confidence: number }) => void;
      vi.mocked(recognizeRecordImage).mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      setup();
      await startPendingRecognition();
      const signal = vi.mocked(recognizeRecordImage).mock.calls[0]![1]!.signal;
      fireEvent.change(screen.getByLabelText(context === 'patient' ? '选择患者' : '选择病历模板'), {
        target: { value: context === 'patient' ? 'PAT-002' : 'followup' },
      });
      expect(signal?.aborted).toBe(true);
      await act(async () => finish({ text: '主诉：上一份病历', confidence: 95 }));
      expect(screen.queryByTestId('record-photo-raw')).not.toBeInTheDocument();
      expect(screen.getByLabelText(context === 'patient' ? '主诉' : '复诊原因')).toHaveValue('');
      expect(screen.getByTestId('record-photo-open')).toBeEnabled();
    },
  );

  it('preserves the normal manual save API while aborting pending recognition', async () => {
    vi.mocked(recognizeRecordImage).mockImplementation(() => new Promise(() => undefined));
    const fetch = setup();
    await startPendingRecognition();
    fireEvent.change(screen.getByLabelText('病历标题'), { target: { value: '手动标题' } });
    fireEvent.change(screen.getByLabelText('诊断'), { target: { value: '手动诊断' } });
    fireEvent.change(screen.getByLabelText('主诉'), { target: { value: '手动主诉' } });
    const signal = vi.mocked(recognizeRecordImage).mock.calls[0]![1]!.signal;
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    await screen.findByText('草稿已保存到本地数据库。');
    expect(signal?.aborted).toBe(true);
    const posted = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(posted?.[0]).toBe('/api/v1/records');
    expect(JSON.parse(String(posted?.[1]?.body))).toEqual({
      patientId: 'PAT-001',
      reviewerId: 'doctor-demo-002',
      templateId: 'outpatient',
      title: '手动标题',
      diagnosis: '手动诊断',
      body: { chiefComplaint: '手动主诉' },
    });
    expect(screen.queryByTestId('record-photo-raw')).not.toBeInTheDocument();
  });

  it('offers no import entry on a read-only record', async () => {
    setup({
      ...saved,
      status: 'archived',
      availableActions: {
        canEdit: false,
        canSubmit: false,
        canReview: false,
        canArchive: false,
        canCorrect: false,
      },
    });
    await waitFor(() => expect(screen.getByLabelText('病历标题')).toHaveValue('手动标题'));
    expect(screen.getByLabelText('病历标题')).toBeDisabled();
    expect(screen.queryByTestId('record-photo-open')).not.toBeInTheDocument();
  });
});
