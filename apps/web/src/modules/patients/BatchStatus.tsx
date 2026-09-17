import { useEffect, useState, type FormEvent } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type {
  BatchPatientStatusResult,
  PatientDirectoryItem,
  PatientStatus,
} from '@doctor/contracts';
import { ApiRequestError, requestApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { statusLabels } from './fields';

const outcomes = {
  updated: '已更新',
  unchanged: '状态未改变',
  stale: '版本已更新',
  unavailable: '患者不可访问',
  forbidden: '没有修改权限',
  'not-applied': '未执行',
};

export function BatchStatus({
  items,
  selected,
  onReload,
  onBusy,
}: {
  items: PatientDirectoryItem[];
  selected: string[];
  onReload: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PatientStatus>('follow-up');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchPatientStatusResult | null>(null);
  useEffect(() => {
    setBlocked(false);
  }, [items]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || blocked || !selected.length) return;
    if (!reason.trim()) {
      setError('修改原因不能为空');
      return;
    }
    if (
      !window.confirm(
        t('确认将 {count} 位患者更新为“{status}”？', {
          count: selected.length,
          status: t(statusLabels[status]),
        }),
      )
    )
      return;
    setBusy(true);
    onBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await requestApi<BatchPatientStatusResult>('/patients/batch', {
        method: 'POST',
        body: JSON.stringify({
          patients: items
            .filter((patient) => selected.includes(patient.id))
            .map((patient) => ({ id: patient.id, expectedVersion: patient.version })),
          status,
          changeReason: reason.trim(),
        }),
      });
      setResult(response.data);
      if (response.data.committed) {
        setReason('');
        onReload();
      } else setBlocked(true);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError && cause.code === 'PATIENT_BATCH_UNAVAILABLE'
          ? '部分患者已不可用或超出当前授权范围，请刷新后重新选择。'
          : '批量更新未确认成功，请刷新档案后核对。',
      );
      setBlocked(true);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="patients-batch">
      <form className="patients-batch-form" onSubmit={submit}>
        <strong>{t('已选择 {count} 位患者', { count: selected.length })}</strong>
        <label>
          {t('目标管理状态')}
          <select
            value={status}
            disabled={busy}
            onChange={(event) => setStatus(event.target.value as PatientStatus)}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('批量修改原因')}
          <input
            value={reason}
            maxLength={500}
            disabled={busy}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
        </label>
        <Button type="submit" disabled={busy || blocked || !selected.length}>
          <Check size={16} />
          {t(busy ? '正在保存' : '批量更新状态')}
        </Button>
      </form>
      {error && (
        <p className="patients-error" role="alert">
          {t(error)}
        </p>
      )}
      {result && (
        <div role={result.committed ? 'status' : 'alert'}>
          <p className={result.committed ? 'patients-success' : 'patients-error'}>
            {t(result.committed ? '批量更新完成' : '本批次未保存任何修改，请刷新后重新选择。')}
          </p>
          <ul className="patients-batch-results">
            {result.results.map((item) => (
              <li key={item.id}>
                {item.id} · {t(outcomes[item.outcome])}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blocked && (
        <Button variant="secondary" onClick={onReload}>
          <RefreshCw size={16} />
          {t('刷新患者列表')}
        </Button>
      )}
    </div>
  );
}
