import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MedicalRecordTemplateDefinition } from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { RecordPhotoImport } from './RecordPhotoImport';
import { recognizeRecordImage, validateRecordImage } from './ocr/recognize-record-image';
import type { RecordOcrDraft } from './ocr/parse-record-text';

vi.mock('./ocr/recognize-record-image', () => ({
  recognizeRecordImage: vi.fn(),
  validateRecordImage: vi.fn(),
}));

const template: MedicalRecordTemplateDefinition = {
  id: 'outpatient',
  version: 1,
  titleKey: '门诊病历',
  subtitleKey: '主诉 · 病史 · 诊疗计划',
  fields: [{ key: 'chiefComplaint', labelKey: '主诉', maxLength: 5000, requiredOnSubmit: true }],
};
const empty: RecordOcrDraft = { title: '', diagnosis: '', body: { chiefComplaint: '' } };
const recognized = {
  text: '病历标题：纸质门诊记录\n诊断：上呼吸道感染\n主诉：咳嗽三天',
  confidence: 86,
};
function component(onApply = vi.fn(), current = empty, patientLabel = '张三 · PAT-001') {
  return (
    <I18nProvider>
      <RecordPhotoImport
        template={template}
        current={current}
        patientLabel={patientLabel}
        onApply={onApply}
      />
    </I18nProvider>
  );
}
async function uploadAndRecognize() {
  fireEvent.click(screen.getByTestId('record-photo-open'));
  fireEvent.change(screen.getByTestId('record-photo-file'), {
    target: { files: [new File(['photo'], 'record.png', { type: 'image/png' })] },
  });
  fireEvent.click(await screen.findByTestId('record-photo-recognize'));
  await screen.findByTestId('record-photo-confirm');
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(recognizeRecordImage).mockReset().mockResolvedValue(recognized);
  vi.mocked(validateRecordImage).mockReset();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:record-photo'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

describe('Record photo import review and field protection', () => {
  it('requires a patient before opening and localizes its entry in English', () => {
    localStorage.setItem('carelink-language', 'en');
    render(component(vi.fn(), empty, ''));
    expect(screen.getByRole('button', { name: 'Import record photo' })).toBeDisabled();
    expect(
      screen.getByText('Select the patient before importing a paper record.'),
    ).toBeInTheDocument();
  });

  it('fills empty fields only after confirmation and keeps existing fields unless individually selected', async () => {
    const apply = vi.fn();
    render(component(apply, { ...empty, title: '手填标题', diagnosis: '手填诊断' }));
    await uploadAndRecognize();
    expect(screen.getByTestId('record-photo-select-title')).not.toBeChecked();
    expect(screen.getByTestId('record-photo-select-diagnosis')).not.toBeChecked();
    expect(screen.getByTestId('record-photo-select-chiefComplaint')).toBeChecked();
    expect(screen.getByTestId('record-photo-apply')).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('record-photo-select-diagnosis'));
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    fireEvent.click(screen.getByTestId('record-photo-apply'));
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      diagnosis: '上呼吸道感染',
      body: { chiefComplaint: '咳嗽三天' },
    });
    expect(screen.queryByTestId('record-photo-raw')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:record-photo');
  });

  it('invalidates a selection and confirmation when the original form value changes during review', async () => {
    const apply = vi.fn();
    const view = render(component(apply));
    await uploadAndRecognize();
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    view.rerender(component(apply, { ...empty, body: { chiefComplaint: '刚刚手动修改' } }));
    expect(screen.getByTestId('record-photo-select-chiefComplaint')).not.toBeChecked();
    expect(screen.getByTestId('record-photo-confirm')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    fireEvent.click(screen.getByTestId('record-photo-apply'));
    expect(apply).toHaveBeenCalledWith({
      title: '纸质门诊记录',
      diagnosis: '上呼吸道感染',
      body: {},
    });
  });

  it('re-extracts corrected text and requires confirmation again after any candidate edit', async () => {
    const apply = vi.fn();
    render(component(apply));
    await uploadAndRecognize();
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    fireEvent.change(screen.getByTestId('record-photo-raw'), {
      target: { value: '主诉：咳嗽两天' },
    });
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    expect(screen.getByTestId('record-photo-apply')).toBeDisabled();
    fireEvent.click(screen.getByTestId('record-photo-reparse'));
    expect(screen.getByTestId('record-photo-field-chiefComplaint')).toHaveValue('咳嗽两天');
    expect(screen.getByTestId('record-photo-confirm')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    fireEvent.change(screen.getByTestId('record-photo-field-chiefComplaint'), {
      target: { value: '核对后内容' },
    });
    expect(screen.getByTestId('record-photo-confirm')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    fireEvent.click(screen.getByTestId('record-photo-apply'));
    expect(apply).toHaveBeenCalledWith({ body: { chiefComplaint: '核对后内容' } });
  });

  it('keeps oversized recognized content visible and blocks filling until reviewed and shortened', async () => {
    const apply = vi.fn();
    vi.mocked(recognizeRecordImage).mockResolvedValue({
      text: '病历标题：' + '长'.repeat(121),
      confidence: 80,
    });
    render(component(apply));
    await uploadAndRecognize();
    expect(screen.getByTestId('record-photo-field-title')).toHaveValue('长'.repeat(121));
    expect(screen.getByRole('alert')).toHaveTextContent('121 / 120');
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    expect(screen.getByTestId('record-photo-apply')).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('record-photo-field-title'), {
      target: { value: '核对后的标题' },
    });
    fireEvent.click(screen.getByTestId('record-photo-confirm'));
    fireEvent.click(screen.getByTestId('record-photo-apply'));
    expect(apply).toHaveBeenCalledWith({ title: '核对后的标题', body: {} });
  });

  it('does not interpret script-looking source as HTML', async () => {
    vi.mocked(recognizeRecordImage).mockResolvedValue({
      text: '主诉：<img src=x onerror=alert(1)>',
      confidence: 20,
    });
    render(component());
    await uploadAndRecognize();
    expect(screen.getByTestId('record-photo-field-chiefComplaint')).toHaveValue(
      '<img src=x onerror=alert(1)>',
    );
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('rejects invalid files before OCR and shows an English retryable failure', async () => {
    localStorage.setItem('carelink-language', 'en');
    vi.mocked(validateRecordImage).mockImplementationOnce(() => {
      throw new Error('图片不能超过 12 MB。');
    });
    render(component());
    fireEvent.click(screen.getByTestId('record-photo-open'));
    fireEvent.change(screen.getByTestId('record-photo-file'), {
      target: { files: [new File(['large'], 'large.png', { type: 'image/png' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Images must not exceed 12 MB.');
    expect(recognizeRecordImage).not.toHaveBeenCalled();
    vi.mocked(recognizeRecordImage).mockRejectedValueOnce(
      new Error('本地识别引擎加载失败，请重启软件后重试。'),
    );
    fireEvent.change(screen.getByTestId('record-photo-file'), {
      target: { files: [new File(['photo'], 'record.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByTestId('record-photo-recognize'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The local recognition engine could not load.',
    );
    expect(screen.getByTestId('record-photo-recognize')).toBeEnabled();
    fireEvent.click(screen.getByTestId('record-photo-recognize'));
    await screen.findByTestId('record-photo-confirm');
  });
});

describe('Record photo asynchronous and camera cleanup', () => {
  it('aborts recognition and ignores a late result after cancellation', async () => {
    let resolve!: (value: typeof recognized) => void;
    vi.mocked(recognizeRecordImage).mockImplementation((_file, options) => {
      options?.onProgress?.(0.42);
      return new Promise((done) => {
        resolve = done;
      });
    });
    render(component());
    fireEvent.click(screen.getByTestId('record-photo-open'));
    fireEvent.change(screen.getByTestId('record-photo-file'), {
      target: { files: [new File(['photo'], 'record.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByTestId('record-photo-recognize'));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0.42');
    const signal = vi.mocked(recognizeRecordImage).mock.calls[0]![1]!.signal;
    fireEvent.click(screen.getByRole('button', { name: '取消识别' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(recognized));
    expect(screen.queryByTestId('record-photo-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-photo-recognize')).toBeEnabled();
  });

  it('aborts and discards a late recognition result after its patient context unmounts', async () => {
    let resolve!: (value: typeof recognized) => void;
    vi.mocked(recognizeRecordImage).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const apply = vi.fn();
    const view = render(component(apply));
    fireEvent.click(screen.getByTestId('record-photo-open'));
    fireEvent.change(screen.getByTestId('record-photo-file'), {
      target: { files: [new File(['photo'], 'record.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByTestId('record-photo-recognize'));
    const signal = vi.mocked(recognizeRecordImage).mock.calls[0]![1]!.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(recognized));
    expect(apply).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:record-photo');
  });

  it('stops a stream granted after the panel was closed without reopening it', async () => {
    let grant!: (stream: MediaStream) => void;
    const stop = vi.fn();
    const media = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    render(component());
    fireEvent.click(screen.getByTestId('record-photo-open'));
    fireEvent.click(screen.getByRole('button', { name: '打开摄像头' }));
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    fireEvent.click(screen.getByTestId('record-photo-close'));
    await act(async () => grant(media));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('病历摄像头预览')).not.toBeInTheDocument();
  });

  it('stops active camera tracks on unmount and falls back to file upload on refusal', async () => {
    const stop = vi.fn();
    const media = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(media)
      .mockRejectedValueOnce(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const view = render(component());
    fireEvent.click(screen.getByTestId('record-photo-open'));
    fireEvent.click(screen.getByRole('button', { name: '打开摄像头' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '拍摄病历' })).toBeEnabled());
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    render(component());
    fireEvent.click(screen.getByTestId('record-photo-open'));
    fireEvent.click(screen.getByRole('button', { name: '打开摄像头' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法使用摄像头，请检查权限或上传图片。',
    );
    expect(screen.getByTestId('record-photo-file')).toBeEnabled();
    expect(screen.getByRole('button', { name: '打开摄像头' })).toBeEnabled();
  });
});
