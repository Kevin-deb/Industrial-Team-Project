import { useEffect, useState, type FormEvent } from 'react';
import type { PatientArchive, TransferDoctor } from '@doctor/contracts';
import { requestApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';

export function PatientLifecycle({
  patient,
  onComplete,
}: {
  patient: PatientArchive;
  onComplete: (losesAccess: boolean) => void;
}) {
  const { t } = useI18n();
  const [doctors, setDoctors] = useState<TransferDoctor[]>([]);
  const [operation, setOperation] = useState<'archive' | 'release' | 'transfer'>('archive');
  const [reason, setReason] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (operation === 'transfer' && !doctors.length)
      requestApi<TransferDoctor[]>('/patients/transfer-targets')
        .then((result) => setDoctors(result.data))
        .catch((cause) => setError(cause instanceof Error ? cause.message : '无法加载医生列表。'));
  }, [operation, doctors.length]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || (operation === 'transfer' && !doctorId)) return;
    if (
      !window.confirm(
        t(
          operation === 'archive'
            ? '确认归档该患者？档案和历史记录仍会保留。'
            : operation === 'release'
              ? '确认解除管理？您可能无法继续查看该患者。'
              : '确认转交责任医生？转交后您可能无法继续查看该患者。',
        ),
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await requestApi(`/patients/${encodeURIComponent(patient.id)}/${operation}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: patient.version,
          changeReason: reason.trim(),
          ...(operation === 'transfer' ? { newResponsibleDoctorId: doctorId } : {}),
        }),
      });
      onComplete(operation !== 'archive');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  if (!patient.canArchive && !patient.canRelease && !patient.canTransfer) return null;
  return (
    <form className="patients-lifecycle" onSubmit={submit}>
      <h4>{t('患者生命周期管理')}</h4>
      <div className="patients-lifecycle-options">
        {[
          ['archive', '归档患者'],
          ['release', '解除管理'],
          ['transfer', '转交责任医生'],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="lifecycle"
              value={value}
              checked={operation === value}
              onChange={() => setOperation(value as typeof operation)}
            />{' '}
            {t(label)}
          </label>
        ))}
      </div>
      {operation === 'transfer' && (
        <label>
          {t('新的责任医生')}
          <select required value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
            <option value="">{t('请选择医生')}</option>
            {doctors.map((doctor) => (
              <option value={doctor.id} key={doctor.id}>
                {doctor.name} · {doctor.department}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('操作原因')}
        <textarea
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error && (
        <p className="patients-error" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={busy || !reason.trim() || (operation === 'transfer' && !doctorId)}
      >
        {busy ? t('处理中…') : t('确认操作')}
      </Button>
    </form>
  );
}
