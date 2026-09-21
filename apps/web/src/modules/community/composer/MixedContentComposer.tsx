import { ImagePlus, Mic, Paperclip, RefreshCw, SmilePlus, Stethoscope, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  CreateSocialContentBlockInput,
  MedicalMetricCard,
  SocialAttachment,
} from '@doctor/contracts';
import { useDeleteTemporaryAttachment, useUploadSocialAttachment } from '../queries';
import { AudioRecorder } from './AudioRecorder';
import { MedicalMetricCardDialog } from './MedicalMetricCardDialog';
import { useI18n } from '../../../shared/i18n';

export type ComposerMediaItem = {
  clientId: string;
  kind: 'image' | 'audio';
  file: File;
  previewUrl: string;
  status: 'uploading' | 'ready' | 'error';
  attachment?: SocialAttachment;
  error?: string;
};
export type ComposerCardItem = {
  clientId: string;
  kind: 'medical-metric-card';
  card: MedicalMetricCard;
};
export type ComposerItem = ComposerMediaItem | ComposerCardItem;
export interface ComposerValue {
  body: string;
  items: ComposerItem[];
}

export function composerContentBlocks(value: ComposerValue): CreateSocialContentBlockInput[] {
  const blocks: CreateSocialContentBlockInput[] = [];
  for (const item of value.items) {
    const order = blocks.length;
    if (item.kind === 'medical-metric-card')
      blocks.push({ kind: item.kind, order, card: item.card });
    else if (item.status === 'ready' && item.attachment)
      blocks.push({ kind: item.kind, order, attachmentId: item.attachment.id });
  }
  return blocks;
}
export function composerHasPending(value: ComposerValue) {
  return value.items.some((item) => item.kind !== 'medical-metric-card' && item.status !== 'ready');
}

export function MixedContentComposer({
  label,
  value,
  onChange,
  rows = 5,
  disabled,
}: {
  label: string;
  value: ComposerValue;
  onChange: (value: ComposerValue) => void;
  rows?: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const upload = useUploadSocialAttachment();
  const removeUpload = useDeleteTemporaryAttachment();
  const imageInput = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAudio, setShowAudio] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(
    () => () => {
      for (const item of valueRef.current.items)
        if (item.kind !== 'medical-metric-card' && item.previewUrl.startsWith('blob:'))
          URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  function emit(next: ComposerValue) {
    valueRef.current = next;
    onChange(next);
  }
  function replaceItem(clientId: string, update: (item: ComposerItem) => ComposerItem) {
    emit({
      ...valueRef.current,
      items: valueRef.current.items.map((item) =>
        item.clientId === clientId ? update(item) : item,
      ),
    });
  }
  async function addMedia(file: File, expectedKind: 'image' | 'audio') {
    setNotice('');
    if (expectedKind === 'image' && file.size > 5 * 1024 * 1024) {
      setNotice(t('图片不能超过 5 MB。'));
      return;
    }
    if (expectedKind === 'audio' && file.size > 10 * 1024 * 1024) {
      setNotice(t('音频不能超过 10 MB。'));
      return;
    }
    const current = valueRef.current.items;
    const sameKind = current.filter((item) => item.kind === expectedKind).length;
    if (
      (expectedKind === 'image' && sameKind >= 4) ||
      (expectedKind === 'audio' && sameKind >= 1)
    ) {
      setNotice(
        t(expectedKind === 'image' ? '每条内容最多添加 4 张图片。' : '每条内容只能添加 1 条音频。'),
      );
      return;
    }
    const clientId = crypto.randomUUID();
    const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
    const draft: ComposerMediaItem = {
      clientId,
      kind: expectedKind,
      file,
      previewUrl,
      status: 'uploading',
    };
    emit({ ...valueRef.current, items: [...current, draft] });
    try {
      const response = await upload.mutateAsync(file);
      replaceItem(clientId, (item) => ({ ...item, status: 'ready', attachment: response.data }));
    } catch (error) {
      replaceItem(clientId, (item) => ({
        ...item,
        status: 'error',
        error: error instanceof Error ? error.message : t('上传失败'),
      }));
    }
  }
  async function retry(item: ComposerMediaItem) {
    replaceItem(item.clientId, (current) => ({
      ...current,
      status: 'uploading',
      error: undefined,
    }));
    try {
      const response = await upload.mutateAsync(item.file);
      replaceItem(item.clientId, (current) => ({
        ...current,
        status: 'ready',
        attachment: response.data,
      }));
    } catch (error) {
      replaceItem(item.clientId, (current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : t('上传失败'),
      }));
    }
  }
  function remove(item: ComposerItem) {
    if (item.kind !== 'medical-metric-card') {
      if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      if (item.attachment) removeUpload.mutate(item.attachment.id);
    }
    emit({
      ...valueRef.current,
      items: valueRef.current.items.filter((entry) => entry.clientId !== item.clientId),
    });
  }

  return (
    <div className="community-mixed-composer">
      <textarea
        aria-label={label}
        rows={rows}
        maxLength={10000}
        disabled={disabled}
        value={value.body}
        onChange={(event) => emit({ ...valueRef.current, body: event.target.value })}
        placeholder={t('输入文字，或添加图片、语音和去标识化医学数据…')}
      />
      <div className="community-composer-toolbar" aria-label={t('内容工具')}>
        <button
          type="button"
          aria-label={t('添加图片')}
          disabled={disabled}
          onClick={() => imageInput.current?.click()}
        >
          <ImagePlus size={15} /> {t('图片')}
        </button>
        <input
          ref={imageInput}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? []).slice(0, 4))
              void addMedia(file, 'image');
            event.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          aria-label={t('录音或上传音频')}
          disabled={disabled}
          onClick={() => setShowAudio((open) => !open)}
        >
          <Mic size={15} /> {t('语音')}
        </button>
        <button
          type="button"
          aria-label={t('添加表情')}
          disabled={disabled}
          onClick={() => setShowEmoji((open) => !open)}
        >
          <SmilePlus size={15} /> {t('表情')}
        </button>
        <button
          type="button"
          aria-label={t('添加医学数据')}
          disabled={
            disabled ||
            value.items.filter((item) => item.kind === 'medical-metric-card').length >= 2
          }
          onClick={() => setShowMedical(true)}
        >
          <Stethoscope size={15} /> {t('医学数据')}
        </button>
        <span>
          <Paperclip size={13} /> {t('图片数')} {value.items.filter((item) => item.kind === 'image').length}
          /4 · {t('音频')} {value.items.filter((item) => item.kind === 'audio').length}/1 · {t('数据卡')}{' '}
          {value.items.filter((item) => item.kind === 'medical-metric-card').length}/2
        </span>
      </div>
      {showEmoji && (
        <div className="community-emoji-picker">
          {['🙂', '👍', '🙏', '✅', '💡', '👏', '❤️', '📌'].map((emoji) => (
            <button
              type="button"
              key={emoji}
              aria-label={emoji}
              onClick={() => {
                emit({ ...valueRef.current, body: valueRef.current.body + emoji });
                setShowEmoji(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {showAudio && (
        <AudioRecorder
          disabled={disabled || value.items.some((item) => item.kind === 'audio')}
          onSelect={(file) => {
            void addMedia(file, 'audio');
            setShowAudio(false);
          }}
          onClose={() => setShowAudio(false)}
        />
      )}
      {notice && (
        <p className="community-composer-notice" role="alert">
          {notice}
        </p>
      )}
      {!!value.items.length && (
        <div className="community-attachment-tray">
          {value.items.map((item) => (
            <article key={item.clientId}>
              {item.kind === 'image' && <img src={item.previewUrl} alt={t('待发送图片')} />}
              {item.kind === 'audio' && <audio controls preload="metadata" src={item.previewUrl} />}
              {item.kind === 'medical-metric-card' && (
                <div className="community-draft-card">
                  <Stethoscope size={16} />
                  <span>
                    <strong>{t('医学数据 · {count} 项', { count: item.card.metrics.length })}</strong>
                    <small>
                      {item.card.metrics
                        .map((metric) => `${t(metric.displayName)} ${metric.value} ${metric.unit}`)
                        .join(' · ')}
                    </small>
                  </span>
                </div>
              )}
              {item.kind !== 'medical-metric-card' && item.status === 'uploading' && (
                <small>{t('正在上传…')}</small>
              )}
              {item.kind !== 'medical-metric-card' && item.status === 'error' && (
                <small className="error">{item.error ?? t('上传失败')}</small>
              )}
              <div>
                {item.kind !== 'medical-metric-card' && item.status === 'error' && (
                  <button type="button" aria-label={t('重试上传')} onClick={() => void retry(item)}>
                    <RefreshCw size={14} /> {t('重试')}
                  </button>
                )}
                <button type="button" aria-label={t('删除附件')} onClick={() => remove(item)}>
                  <Trash2 size={14} /> {t('删除')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {showMedical && (
        <MedicalMetricCardDialog
          onClose={() => setShowMedical(false)}
          onAdd={(card) => {
            emit({
              ...valueRef.current,
              items: [
                ...valueRef.current.items,
                { clientId: crypto.randomUUID(), kind: 'medical-metric-card', card },
              ],
            });
            setShowMedical(false);
          }}
        />
      )}
    </div>
  );
}
