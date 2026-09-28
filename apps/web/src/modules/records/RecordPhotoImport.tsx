import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCw, ScanText, X } from 'lucide-react';
import type { MedicalRecordTemplateDefinition } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { parseRecordText, type RecordOcrDraft } from './ocr/parse-record-text';
import { recognizeRecordImage, validateRecordImage } from './ocr/recognize-record-image';
import { recordPhotoMessages } from './record-photo-messages';
import './record-photo-import.css';

export interface RecordPhotoPatch {
  title?: string;
  diagnosis?: string;
  body: Record<string, string>;
}

interface RecordPhotoImportProps {
  template: MedicalRecordTemplateDefinition;
  current: RecordOcrDraft;
  patientLabel: string;
  onApply: (patch: RecordPhotoPatch) => void;
}

type CameraState = 'off' | 'requesting' | 'ready';
const maxRawText = 60_000;

function canvasPhoto(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], 'record-photo.jpg', { type: 'image/jpeg' }))
          : reject(new Error('无法处理图片，请重新拍摄或上传图片。')),
      'image/jpeg',
      0.92,
    );
  });
}

/** Imports only reviewed clinical fields; patient identity and saving stay in RecordEditor. */
export function RecordPhotoImport({
  template,
  current,
  patientLabel,
  onApply,
}: RecordPhotoImportProps) {
  const { language, t } = useI18n();
  const tr = (source: string) =>
    language === 'en' ? (recordPhotoMessages[source] ?? t(source)) : source;
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [cameraState, setCameraState] = useState<CameraState>('off');
  const [processing, setProcessing] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rawText, setRawText] = useState('');
  const [parsedText, setParsedText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [candidate, setCandidate] = useState<RecordOcrDraft | null>(null);
  // A selection is valid only for the exact value the doctor chose to replace.
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const cameraGeneration = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controller = useRef<AbortController | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const fields = [
    { key: 'title', labelKey: '病历标题', maxLength: 120 },
    { key: 'diagnosis', labelKey: '诊断', maxLength: 200 },
    ...template.fields,
  ];
  const valueOf = (draft: RecordOcrDraft, key: string) =>
    key === 'title' ? draft.title : key === 'diagnosis' ? draft.diagnosis : (draft.body[key] ?? '');
  const errorText = (cause: unknown, fallback: string) =>
    cause instanceof Error && recordPhotoMessages[cause.message] ? cause.message : fallback;

  function stopCamera() {
    cameraGeneration.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraState('off');
  }

  function cancelRecognition() {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    setRecognizing(false);
    setProcessing(false);
    setProgress(0);
  }

  function clearResult() {
    setRawText('');
    setParsedText('');
    setConfidence(null);
    setCandidate(null);
    setSelected({});
    setConfirmed(false);
  }

  function close() {
    cancelRecognition();
    stopCamera();
    clearResult();
    setPhoto(null);
    setError('');
    setOpen(false);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      cameraGeneration.current += 1;
      controller.current?.abort();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Manual edits during preview require the doctor to confirm the content again.
  const currentSignature = JSON.stringify(current);
  useEffect(() => setConfirmed(false), [currentSignature]);

  function selectPhoto(file: File) {
    try {
      validateRecordImage(file);
      cancelRecognition();
      stopCamera();
      clearResult();
      setPhoto(file);
      setError('');
      setApplied(false);
    } catch (cause) {
      stopCamera();
      setError(errorText(cause, '无法读取图片，请换用清晰的 JPG、PNG 或 WebP 图片。'));
    }
  }

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('此环境无法打开摄像头，请上传已拍摄的图片。');
      return;
    }
    stopCamera();
    const token = cameraGeneration.current;
    setCameraState('requesting');
    clearResult();
    setPhoto(null);
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (!mounted.current || token !== cameraGeneration.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      if (!video.current) throw new Error('camera preview unavailable');
      video.current.srcObject = acquired;
      await video.current.play();
      if (!mounted.current || token !== cameraGeneration.current) return;
      setCameraState('ready');
    } catch {
      if (!mounted.current || token !== cameraGeneration.current) return;
      stopCamera();
      setError('无法使用摄像头，请检查权限或上传图片。');
    }
  }

  async function takePhoto() {
    const element = video.current;
    if (!element?.videoWidth || !element.videoHeight) {
      setError('画面尚未准备好，请稍候再拍摄。');
      return;
    }
    const token = ++generation.current;
    setProcessing(true);
    setError('');
    try {
      const scale = Math.min(1, 2400 / Math.max(element.videoWidth, element.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const file = await canvasPhoto(canvas);
      if (mounted.current && token === generation.current) selectPhoto(file);
    } catch {
      if (mounted.current && token === generation.current) {
        stopCamera();
        setError('无法处理图片，请重新拍摄或上传图片。');
      }
    } finally {
      if (mounted.current && token === generation.current) setProcessing(false);
    }
  }

  async function rotatePhoto() {
    if (!photo || recognizing || processing) return;
    const token = ++generation.current;
    setProcessing(true);
    setError('');
    const url = URL.createObjectURL(photo);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error('无法读取图片，请换用清晰的 JPG、PNG 或 WebP 图片。'));
        image.src = url;
      });
      if (!mounted.current || token !== generation.current) return;
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 40_000_000
      ) {
        throw new Error('图片尺寸过大，请缩小后重试。');
      }
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = height;
      canvas.height = width;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.translate(height, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0, width, height);
      const rotated = await canvasPhoto(canvas);
      if (mounted.current && token === generation.current) selectPhoto(rotated);
    } catch (cause) {
      if (mounted.current && token === generation.current)
        setError(errorText(cause, '无法处理图片，请重新拍摄或上传图片。'));
    } finally {
      URL.revokeObjectURL(url);
      if (mounted.current && token === generation.current) setProcessing(false);
    }
  }

  function extract(text: string) {
    const next = parseRecordText(text, template);
    setParsedText(text);
    setCandidate(next);
    setSelected(
      Object.fromEntries(
        fields
          .filter(
            (field) =>
              !valueOf(currentRef.current, field.key).trim() && valueOf(next, field.key).trim(),
          )
          .map((field) => [field.key, valueOf(currentRef.current, field.key)]),
      ),
    );
    setConfirmed(false);
  }

  async function recognize() {
    if (!photo || recognizing || processing) return;
    stopCamera();
    cancelRecognition();
    const token = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setRecognizing(true);
    setError('');
    clearResult();
    try {
      const result = await recognizeRecordImage(photo, {
        signal: abort.signal,
        onProgress: (value) => {
          if (mounted.current && token === generation.current)
            setProgress(Math.min(1, Math.max(0, value)));
        },
      });
      if (!mounted.current || token !== generation.current || abort.signal.aborted) return;
      const text = result.text;
      setRawText(text);
      setConfidence(result.confidence);
      extract(text);
      if (!text.trim()) setError('没有识别出文字，请调整方向、光线或重新拍摄。');
    } catch (cause) {
      if (mounted.current && token === generation.current && !abort.signal.aborted)
        setError(errorText(cause, '识别失败，请重试或换一张清晰图片。'));
    } finally {
      if (mounted.current && token === generation.current) {
        controller.current = null;
        setRecognizing(false);
      }
    }
  }

  const chosenFields = candidate
    ? fields.filter(
        (field) =>
          Object.hasOwn(selected, field.key) &&
          selected[field.key] === valueOf(current, field.key) &&
          valueOf(candidate, field.key).trim(),
      )
    : [];
  const oversizedSelection =
    !!candidate &&
    chosenFields.some((field) => valueOf(candidate, field.key).trim().length > field.maxLength);

  function apply() {
    if (
      !confirmed ||
      !candidate ||
      !chosenFields.length ||
      recognizing ||
      processing ||
      rawText !== parsedText ||
      oversizedSelection
    )
      return;
    const patch: RecordPhotoPatch = { body: {} };
    for (const field of chosenFields) {
      const value = valueOf(candidate, field.key).trim();
      if (field.key === 'title' || field.key === 'diagnosis') patch[field.key] = value;
      else patch.body[field.key] = value;
    }
    onApply(patch);
    close();
    setApplied(true);
  }

  return (
    <section className="record-photo-import" aria-label={tr('拍照识别病历')}>
      {!open ? (
        <>
          <Button
            data-testid="record-photo-open"
            type="button"
            variant="secondary"
            disabled={!patientLabel}
            onClick={() => {
              setOpen(true);
              setApplied(false);
            }}
          >
            <ScanText size={17} /> {tr('拍照识别病历')}
          </Button>
          {!patientLabel && <p>{tr('请先选择患者，再识别纸质病历。')}</p>}
          {applied && <p role="status">{tr('所选内容已填入草稿，请核对后保存。')}</p>}
        </>
      ) : (
        <div className="record-photo-panel">
          <header className="record-photo-header">
            <strong>{tr('拍照识别病历')}</strong>
            <Button data-testid="record-photo-close" type="button" variant="ghost" onClick={close}>
              <X size={16} /> {tr('关闭识别')}
            </Button>
          </header>
          <p className="record-photo-patient">
            <strong>{tr('当前患者')}：</strong>
            {patientLabel}
          </p>
          <p>{tr('在本机识别图片，不上传到云端。识别后请对照原图核对，再填入草稿。')}</p>
          <p>{tr('支持清晰的中英文印刷病历；手写、模糊或复杂表格可能无法准确识别。')}</p>
          <div className="record-photo-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={recognizing || processing || cameraState !== 'off'}
              onClick={() => void startCamera()}
            >
              <Camera size={17} /> {tr('打开摄像头')}
            </Button>
            <label className="record-photo-file">
              <span>{tr('上传病历图片')}</span>
              <input
                data-testid="record-photo-file"
                aria-label={tr('上传病历图片')}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={recognizing || processing}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) selectPhoto(file);
                }}
              />
            </label>
          </div>
          <small>{tr('JPG / PNG / WebP，最大 12 MB。手机可直接选择拍摄的照片。')}</small>
          {cameraState !== 'off' && (
            <div className="record-photo-camera">
              <video ref={video} aria-label={tr('病历摄像头预览')} muted playsInline />
              <div className="record-photo-actions">
                {cameraState === 'requesting' && <span role="status">{tr('正在请求摄像头…')}</span>}
                <Button
                  type="button"
                  disabled={cameraState !== 'ready' || processing}
                  onClick={() => void takePhoto()}
                >
                  {tr('拍摄病历')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    cancelRecognition();
                    stopCamera();
                  }}
                >
                  {tr('关闭摄像头')}
                </Button>
              </div>
            </div>
          )}
          {photoUrl && (
            <div className="record-photo-preview">
              <img src={photoUrl} alt={tr('病历原图')} />
              <div className="record-photo-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={recognizing || processing}
                  onClick={() => void rotatePhoto()}
                >
                  <RotateCw size={16} />
                  {tr('顺时针旋转 90°')}
                </Button>
                <Button
                  data-testid="record-photo-recognize"
                  type="button"
                  disabled={recognizing || processing}
                  onClick={() => void recognize()}
                >
                  {tr(candidate ? '重新识别' : '开始识别')}
                </Button>
              </div>
            </div>
          )}
          {processing && <p role="status">{tr('正在处理图片…')}</p>}
          {recognizing && (
            <div className="record-photo-progress" role="status">
              <span>
                {tr('正在本机识别…')} {Math.round(progress * 100)}%
              </span>
              <progress aria-label={tr('识别进度')} value={progress} max={1} />
              <small>{tr('首次加载本地模型可能需要一些时间。')}</small>
              <Button type="button" variant="secondary" onClick={cancelRecognition}>
                {tr('取消识别')}
              </Button>
            </div>
          )}
          {error && (
            <p className="record-photo-error" role="alert">
              {tr(error)}
            </p>
          )}
          {candidate && (
            <>
              <label>
                <span>{tr('识别原文')}</span>
                <textarea
                  data-testid="record-photo-raw"
                  aria-label={tr('识别原文')}
                  rows={6}
                  maxLength={maxRawText}
                  value={rawText}
                  onChange={(event) => {
                    setRawText(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <small>{tr('可修正原文后重新提取字段；未匹配到标题的内容仍保留在这里。')}</small>
              <div className="record-photo-actions">
                <Button
                  data-testid="record-photo-reparse"
                  type="button"
                  variant="secondary"
                  onClick={() => extract(rawText)}
                >
                  {tr('重新提取字段')}
                </Button>
              </div>
              {rawText !== parsedText && (
                <p role="status">{tr('原文已修改，请先重新提取字段。')}</p>
              )}
              {confidence !== null && (
                <p>
                  {tr('识别置信度')}：{Math.round(Math.min(100, Math.max(0, confidence)))} / 100 ·{' '}
                  {tr('该数值不代表内容准确率，请逐项核对。')}
                </p>
              )}
              <h3>{tr('待填入内容')}</h3>
              <p>{tr('仅勾选的非空内容会填入。已有内容默认保留，需逐项勾选才能替换。')}</p>
              <div className="record-photo-fields">
                {fields.map((field) => {
                  const previous = valueOf(current, field.key);
                  const next = valueOf(candidate, field.key);
                  const checked =
                    Object.hasOwn(selected, field.key) &&
                    selected[field.key] === previous &&
                    !!next.trim();
                  return (
                    <div className="record-photo-field" key={field.key}>
                      <label className="record-photo-check">
                        <input
                          data-testid={'record-photo-select-' + field.key}
                          type="checkbox"
                          checked={checked}
                          disabled={!next.trim()}
                          onChange={(event) => {
                            setSelected((values) => {
                              const result = { ...values };
                              if (event.target.checked) result[field.key] = previous;
                              else delete result[field.key];
                              return result;
                            });
                            setConfirmed(false);
                          }}
                        />
                        <span>
                          {tr('填入')} · {t(field.labelKey)}
                        </span>
                      </label>
                      {previous.trim() && (
                        <details>
                          <summary>{tr(checked ? '将替换已有内容' : '已有内容')}</summary>
                          <p>{previous}</p>
                        </details>
                      )}
                      {next.trim().length > field.maxLength && (
                        <p className="record-photo-error" role="alert">
                          {tr('内容超过字段长度限制，请核对并缩短后再填入。')} ({next.trim().length}{' '}
                          / {field.maxLength})
                        </p>
                      )}
                      <textarea
                        data-testid={'record-photo-field-' + field.key}
                        aria-label={tr('待填入内容') + ' · ' + t(field.labelKey)}
                        maxLength={field.maxLength}
                        rows={field.key === 'title' || field.key === 'diagnosis' ? 2 : 3}
                        value={next}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCandidate((draft) =>
                            !draft
                              ? null
                              : field.key === 'title' || field.key === 'diagnosis'
                                ? { ...draft, [field.key]: value }
                                : { ...draft, body: { ...draft.body, [field.key]: value } },
                          );
                          setConfirmed(false);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <label className="record-photo-check record-photo-confirm">
                <input
                  data-testid="record-photo-confirm"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>{tr('我已核对当前患者及识别内容')}</span>
              </label>
              <div className="record-photo-actions">
                <Button
                  data-testid="record-photo-apply"
                  type="button"
                  disabled={
                    !confirmed ||
                    !chosenFields.length ||
                    recognizing ||
                    processing ||
                    rawText !== parsedText ||
                    oversizedSelection
                  }
                  onClick={apply}
                >
                  {tr('填入病历草稿')}
                </Button>
              </div>
              <small>{tr('填入后仍需点击“保存草稿”；不会自动提交病历或开立医嘱。')}</small>
            </>
          )}
        </div>
      )}
    </section>
  );
}
