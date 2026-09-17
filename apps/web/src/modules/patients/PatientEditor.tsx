import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import type { PatientArchive, UpdatePatientRequest } from '@doctor/contracts';
import { ApiRequestError, requestApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { allergyLabels, editableFields, parseLines, patientFields, statusLabels } from './fields';

export function PatientEditor({
  patient,
  etag,
  onSaved,
  onCancel,
  onReload,
  onDirty,
  onBusy,
}: {
  patient: PatientArchive;
  etag: string | null;
  onSaved: (patient: PatientArchive, etag: string | null) => void;
  onCancel: () => void;
  onReload: () => void;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [fields, setFields] = useState(editableFields(patient));
  const [arrays, setArrays] = useState({
    tags: patient.tags.join('\n'),
    symptoms: patient.symptoms.join('\n'),
    allergies: patient.allergies.join('\n'),
    medicalHistory: patient.medicalHistory.join('\n'),
  });
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const input: UpdatePatientRequest = {
    ...fields,
    ...Object.fromEntries(Object.entries(arrays).map(([key, value]) => [key, parseLines(value)])),
    changeReason: reason.trim(),
  };
  const dirty =
    JSON.stringify({ ...fields, ...arrays, reason }) !==
    JSON.stringify({
      ...editableFields(patient),
      tags: patient.tags.join('\n'),
      symptoms: patient.symptoms.join('\n'),
      allergies: patient.allergies.join('\n'),
      medicalHistory: patient.medicalHistory.join('\n'),
      reason: '',
    });
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const changed = Object.keys(editableFields(patient)).some(
    (key) =>
      JSON.stringify(input[key as keyof UpdatePatientRequest]) !==
      JSON.stringify(patient[key as keyof PatientArchive]),
  );
  const update = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((previous) => ({ ...previous, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !changed || conflict) return;
    if (!reason.trim()) {
      setReasonError(true);
      reasonInput.current?.focus();
      return;
    }
    if ((input.allergyStatus === 'recorded') !== input.allergies.length > 0) {
      setError('过敏状态与过敏记录不一致。');
      return;
    }
    setSaving(true);
    onBusy(true);
    setError(null);
    try {
      const result = await requestApi<PatientArchive>(
        '/patients/' + encodeURIComponent(patient.id),
        { method: 'PATCH', headers: { 'If-Match': etag ?? '' }, body: JSON.stringify(input) },
      );
      onDirty(false);
      onSaved(result.data, result.etag);
    } catch (cause) {
      const stale = cause instanceof ApiRequestError && cause.status === 412;
      setConflict(stale);
      setError(
        stale
          ? '档案已被其他保存更新，请重新加载后核对。'
          : cause instanceof Error
            ? cause.message
            : '保存档案失败，请重试。',
      );
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <form className="patients-editor" onSubmit={save}>
      <fieldset disabled={saving}>
        <div className="patients-form-grid">
          <label>
            {t('姓名')}
            <input
              required
              maxLength={100}
              value={fields.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            {t('性别')}
            <select
              value={fields.gender}
              onChange={(event) => update('gender', event.target.value as PatientArchive['gender'])}
            >
              {['女', '男'].map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('年龄')}
            <input
              type="number"
              required
              min={0}
              max={130}
              step={1}
              value={Number.isNaN(fields.age) ? '' : fields.age}
              onChange={(event) => update('age', event.target.valueAsNumber)}
            />
          </label>
          <label>
            {t('联系电话')}
            <input
              type="tel"
              maxLength={30}
              value={fields.phone}
              onChange={(event) => update('phone', event.target.value)}
            />
          </label>
          <label>
            {t('健康分类')}
            <input
              required
              maxLength={200}
              value={fields.diagnosis}
              onChange={(event) => update('diagnosis', event.target.value)}
            />
          </label>
          <label>
            {t('管理状态')}
            <select
              value={fields.status}
              onChange={(event) => update('status', event.target.value as PatientArchive['status'])}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          {(['tags', 'symptoms', 'medicalHistory', 'allergies'] as const).map((key) => (
            <label key={key}>
              {t(patientFields[key])}
              <textarea
                rows={3}
                value={arrays[key]}
                onChange={(event) =>
                  setArrays((previous) => ({ ...previous, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <label>
            {t('过敏状态')}
            <select
              value={fields.allergyStatus}
              onChange={(event) =>
                update('allergyStatus', event.target.value as PatientArchive['allergyStatus'])
              }
            >
              {Object.entries(allergyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label className="patients-full-width">
            {t('照护摘要')}
            <textarea
              rows={3}
              maxLength={5000}
              value={fields.careSummary}
              onChange={(event) => update('careSummary', event.target.value)}
            />
          </label>
          <label className="patients-full-width">
            {t('修改原因')}
            <textarea
              ref={reasonInput}
              aria-label={t('修改原因')}
              required
              rows={2}
              maxLength={500}
              aria-invalid={reasonError || undefined}
              aria-describedby={reasonError ? 'patient-change-reason-error' : undefined}
              value={reason}
              onInvalid={(event) => {
                event.preventDefault();
                setReasonError(true);
                event.currentTarget.focus();
              }}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setReasonError(false);
              }}
            />
            {reasonError && (
              <span id="patient-change-reason-error" className="patients-error" role="alert">
                {t('修改原因不能为空')}
              </span>
            )}
          </label>
        </div>
      </fieldset>
      {error && (
        <div className="patients-error" role="alert">
          {t(error)}
          {conflict && (
            <Button variant="secondary" onClick={onReload}>
              {t('重新加载档案')}
            </Button>
          )}
        </div>
      )}
      <div className="patients-actions">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          <X size={16} />
          {t('取消编辑')}
        </Button>
        <Button type="submit" disabled={saving || !changed || conflict}>
          <Save size={16} />
          {t(saving ? '正在保存' : '保存档案')}
        </Button>
      </div>
    </form>
  );
}
