import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import type {
  CreateMedicalRecordRequest,
  Encounter,
  MedicalRecordDetail,
  MedicalRecordTemplateId,
  Patient,
  UpdateMedicalRecordRequest,
} from '@doctor/contracts';
import { ApiRequestError, requestApi, useApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Badge, Button, LoadingState } from '../../shared/ui';
import { FeatureDialog, ReadOnlyNote } from '../ui';
import { emptyRecordBody, recordTemplates } from './templates';

interface EditorProps {
  recordId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  patientId: string;
  encounterId: string;
  templateId: MedicalRecordTemplateId;
  title: string;
  diagnosis: string;
  body: Record<string, string>;
}

const blankForm = (): FormState => ({
  patientId: '',
  encounterId: '',
  templateId: 'outpatient',
  title: '',
  diagnosis: '',
  body: emptyRecordBody('outpatient'),
});

function formFromRecord(record: MedicalRecordDetail): FormState {
  return {
    patientId: record.patientId,
    encounterId: record.encounterId ?? '',
    templateId: record.templateId,
    title: record.title,
    diagnosis: record.diagnosis,
    body: record.body,
  };
}

export function RecordEditor({ recordId, onClose, onSaved }: EditorProps) {
  const { t } = useI18n();
  const {
    data: patients,
    loading: patientsLoading,
    error: patientsError,
  } = useApi<Patient[]>('/patients?pageSize=100');
  const {
    data: encounters,
    loading: encountersLoading,
    error: encountersError,
  } = useApi<Encounter[]>('/encounters');
  const [record, setRecord] = useState<MedicalRecordDetail | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [initial, setInitial] = useState(JSON.stringify(blankForm()));
  const [loadingRecord, setLoadingRecord] = useState(!!recordId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadRecord = useCallback(async () => {
    if (!recordId) return;
    setLoadingRecord(true);
    setLoadError(null);
    try {
      const response = await requestApi<MedicalRecordDetail>(`/records/${recordId}`);
      const next = formFromRecord(response.data);
      setRecord(response.data);
      setForm(next);
      setInitial(JSON.stringify(next));
      setNotice(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法加载病历');
    } finally {
      setLoadingRecord(false);
    }
  }, [recordId]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const dirty = JSON.stringify(form) !== initial;
  const editable = !record || record.status === 'draft';
  const template = recordTemplates.find((item) => item.id === form.templateId)!;
  const matchingEncounters = useMemo(
    () => (encounters ?? []).filter((item) => item.patientId === form.patientId),
    [encounters, form.patientId],
  );

  function closeSafely() {
    if (dirty && !window.confirm(t('尚有未保存的更改，确定要关闭吗？'))) return;
    onClose();
  }

  async function save() {
    if (!form.patientId || !form.title.trim() || !form.diagnosis.trim()) {
      setNotice({ tone: 'error', text: '请填写患者、病历标题和诊断。' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      let saved: MedicalRecordDetail;
      if (record) {
        const payload: UpdateMedicalRecordRequest = {
          title: form.title.trim(),
          diagnosis: form.diagnosis.trim(),
          body: form.body,
        };
        saved = (
          await requestApi<MedicalRecordDetail>(`/records/${record.id}`, {
            method: 'PATCH',
            headers: { 'If-Match': `"record-v${record.version}"` },
            body: JSON.stringify(payload),
          })
        ).data;
      } else {
        const payload: CreateMedicalRecordRequest = {
          patientId: form.patientId,
          ...(form.encounterId ? { encounterId: form.encounterId } : {}),
          templateId: form.templateId,
          title: form.title.trim(),
          diagnosis: form.diagnosis.trim(),
          body: form.body,
        };
        saved = (
          await requestApi<MedicalRecordDetail>('/records', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        ).data;
      }
      const next = formFromRecord(saved);
      setRecord(saved);
      setForm(next);
      setInitial(JSON.stringify(next));
      setNotice({ tone: 'success', text: '草稿已保存到本地数据库。' });
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 412)
        setNotice({
          tone: 'error',
          text: '该病历已有新版本。你的输入已保留，请重新加载后再编辑。',
        });
      else
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : '保存失败，请稍后重试。',
        });
    } finally {
      setSaving(false);
    }
  }

  const loading = loadingRecord || patientsLoading || encountersLoading;
  const error = loadError || patientsError || encountersError;
  return (
    <FeatureDialog
      title={record ? record.title : '新建电子病历'}
      subtitle={record ? `${record.id} · v${record.version}.0` : '结构化病历草稿'}
      onClose={closeSafely}
      wide
    >
      {loading || error ? (
        <LoadingState error={error} onRetry={recordId ? loadRecord : undefined} />
      ) : (
        <form
          className="record-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="record-editor-grid">
            <label>
              <span>{t('患者')}</span>
              <select
                aria-label={t('选择患者')}
                value={form.patientId}
                disabled={!!record || !editable}
                onChange={(event) =>
                  setForm((value) => ({ ...value, patientId: event.target.value, encounterId: '' }))
                }
              >
                <option value="">{t('请选择患者')}</option>
                {(patients ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('关联问诊')}</span>
              <select
                aria-label={t('选择关联问诊')}
                value={form.encounterId}
                disabled={!!record || !editable || !form.patientId}
                onChange={(event) =>
                  setForm((value) => ({ ...value, encounterId: event.target.value }))
                }
              >
                <option value="">{t('不关联问诊')}</option>
                {matchingEncounters.map((encounter) => (
                  <option key={encounter.id} value={encounter.id}>
                    {encounter.id} · {encounter.reason}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('病历模板')}</span>
              <select
                aria-label={t('选择病历模板')}
                value={form.templateId}
                disabled={!!record || !editable}
                onChange={(event) => {
                  const templateId = event.target.value as MedicalRecordTemplateId;
                  setForm((value) => ({
                    ...value,
                    templateId,
                    body: emptyRecordBody(templateId),
                  }));
                }}
              >
                {recordTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.title)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('病历标题')}</span>
              <input
                aria-label={t('病历标题')}
                maxLength={120}
                value={form.title}
                disabled={!editable}
                onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
              />
            </label>
            <label className="record-editor-span">
              <span>{t('诊断')}</span>
              <input
                aria-label={t('诊断')}
                maxLength={200}
                value={form.diagnosis}
                disabled={!editable}
                onChange={(event) =>
                  setForm((value) => ({ ...value, diagnosis: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="record-editor-fields">
            <div className="record-editor-section-title">
              <div>
                <strong>{t(template.title)}</strong>
                <span>{t(template.subtitle)}</span>
              </div>
              <Badge tone={editable ? 'blue' : 'slate'}>
                {t(editable ? '可编辑草稿' : '只读病历')}
              </Badge>
            </div>
            {template.fields.map((field) => (
              <label key={field.key}>
                <span>{t(field.label)}</span>
                <textarea
                  aria-label={t(field.label)}
                  maxLength={5000}
                  rows={4}
                  value={form.body[field.key] ?? ''}
                  disabled={!editable}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      body: { ...value.body, [field.key]: event.target.value },
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {notice && (
            <div className={`record-editor-notice ${notice.tone}`} role="status">
              <span>{t(notice.text)}</span>
              {notice.tone === 'error' && record && (
                <button type="button" onClick={() => void loadRecord()}>
                  {t('重新加载服务器版本')}
                </button>
              )}
            </div>
          )}
          <ReadOnlyNote>{t('当前仅保存虚构演示病历，不可用于真实诊疗。')}</ReadOnlyNote>
          <div className="record-editor-actions">
            <Button type="button" variant="secondary" onClick={closeSafely}>
              {t('关闭')}
            </Button>
            {editable && (
              <Button type="submit" disabled={saving || !dirty}>
                <Save size={16} />
                {t(saving ? '正在保存…' : '保存草稿')}
              </Button>
            )}
          </div>
        </form>
      )}
    </FeatureDialog>
  );
}
