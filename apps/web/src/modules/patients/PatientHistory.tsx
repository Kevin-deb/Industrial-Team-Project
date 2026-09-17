import { useEffect, useState } from 'react';
import type { PatientArchiveVersion, PatientSnapshot } from '@doctor/contracts';
import { requestApi } from '../../shared/api';
import { localizeDemoData, useI18n } from '../../shared/i18n';
import { EmptyState, LoadingState } from '../../shared/ui';
import { allergyLabels, archiveChanges, patientFields, statusLabels } from './fields';

export function PatientHistory({ patientId }: { patientId: string }) {
  const { t, formatDate, language } = useI18n();
  const [versions, setVersions] = useState<PatientArchiveVersion[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setVersions(null);
    setError(null);
    requestApi<PatientArchiveVersion[]>(
      '/patients/' + encodeURIComponent(patientId) + '/versions',
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setVersions(result.data);
          setSelected(result.data[0]?.version ?? null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '无法连接服务');
      });
    return () => controller.abort();
  }, [patientId, revision]);
  if (error || !versions)
    return <LoadingState error={error} onRetry={() => setRevision((value) => value + 1)} />;
  if (!versions.length)
    return <EmptyState title={t('暂无修改历史')} description={t('暂无修改历史')} />;
  const current = versions.find((item) => item.version === selected) ?? versions[0];
  const previous = versions.find((item) => item.version === current.version - 1);
  function value(snapshot: PatientSnapshot, key: keyof typeof patientFields) {
    const data = localizeDemoData(snapshot, language)[key];
    if (key === 'status') return t(statusLabels[snapshot.status]);
    if (key === 'allergyStatus') return t(allergyLabels[snapshot.allergyStatus]);
    if (key === 'gender') return t(String(data));
    return Array.isArray(data) ? data.join('\n') || t('未记录') : String(data) || t('未记录');
  }
  return (
    <div className="patients-history">
      <label>
        {t('选择档案版本')}
        <select
          value={current.version}
          onChange={(event) => setSelected(Number(event.target.value))}
        >
          {versions.map((item) => (
            <option value={item.version} key={item.version}>
              {t('版本 {version}', { version: item.version })} · {item.authorName}
            </option>
          ))}
        </select>
      </label>
      <dl className="patients-history-meta">
        <div>
          <dt>{t('修改人')}</dt>
          <dd>{current.authorName}</dd>
        </div>
        <div>
          <dt>{t('修改时间')}</dt>
          <dd>{formatDate(current.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </div>
        <div>
          <dt>{t('修改原因')}</dt>
          <dd>{current.changeReason}</dd>
        </div>
      </dl>
      {current.snapshotCapturedAt && (
        <p className="patients-baseline">
          {t('此版本为旧档案基线，完整资料于 {time} 捕获，不代表当时的完整历史快照。', {
            time: formatDate(current.snapshotCapturedAt, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      )}
      {current.snapshot && previous?.snapshot ? (
        <>
          <h4>{t('相较上一版本的修改')}</h4>
          {previous.snapshotCapturedAt && (
            <p className="patients-baseline">
              {t('上一版本使用迁移时捕获的基线，差异以该基线为准。')}
            </p>
          )}
          <div className="feature-table-wrap">
            <table className="feature-table patients-diff">
              <thead>
                <tr>
                  <th>{t('字段')}</th>
                  <th>{t('修改前')}</th>
                  <th>{t('修改后')}</th>
                </tr>
              </thead>
              <tbody>
                {archiveChanges(previous.snapshot, current.snapshot).map((key) => (
                  <tr key={key}>
                    <td>{t(patientFields[key])}</td>
                    <td>{value(previous.snapshot!, key)}</td>
                    <td>{value(current.snapshot!, key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>{t('旧版本缺少完整快照，无法还原完整差异。')}</p>
      )}
      {current.snapshot && (
        <>
          <h4>{t('版本档案')}</h4>
          <dl className="patients-snapshot">
            {(Object.keys(patientFields) as (keyof typeof patientFields)[]).map((key) => (
              <div key={key}>
                <dt>{t(patientFields[key])}</dt>
                <dd>{value(current.snapshot!, key)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
