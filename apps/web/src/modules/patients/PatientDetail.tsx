import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PatientArchive, MedicalRecord } from '@doctor/contracts';
import { requestApi, useApi } from '../../shared/api';
import { localizeDemoData, useI18n } from '../../shared/i18n';
import { Badge, Button, EmptyState, LoadingState } from '../../shared/ui';
import { DetailGrid, FeatureDialog, FilterTabs, PersonAvatar } from '../ui';
import { PatientEditor } from './PatientEditor';
import { PatientHistory } from './PatientHistory';
import { allergyLabels, statusLabels, statusTones } from './fields';

function PatientRecords({ patientId }: { patientId: string }) {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<MedicalRecord[]>('/records');
  if (loading || error) return <LoadingState error={error} onRetry={reload} />;
  const records = data?.filter((item) => item.patientId === patientId) ?? [];
  return (
    <div className="feature-timeline">
      {records.map((item) => (
        <div className="feature-timeline-item" key={item.id}>
          <time>{formatDate(item.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
          <h4>{item.title}</h4>
          <p>
            {item.diagnosis} · {item.authorName} · {t('版本 {version}', { version: item.version })}
          </p>
        </div>
      ))}
      {!records.length && (
        <EmptyState title={t('暂无诊疗记录')} description={t('后续完成的诊疗记录将在这里汇总。')} />
      )}
    </div>
  );
}

export function PatientDetail({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, formatDate, language } = useI18n();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientArchive | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [section, setSection] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const shown = localizeDemoData(patient, language);
  // Editing uses original server values, never translated demo display values.
  useEffect(() => {
    const controller = new AbortController();
    setPatient(null);
    setError(null);
    requestApi<PatientArchive>('/patients/' + encodeURIComponent(patientId), {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setPatient(result.data);
          setEtag(result.etag);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '无法连接服务');
      });
    return () => controller.abort();
  }, [patientId, revision]);
  const canDiscard = useCallback(
    () => !dirty || window.confirm(t('放弃尚未保存的档案修改？')),
    [dirty, t],
  );
  const close = useCallback(() => {
    if (!busy && canDiscard()) onClose();
  }, [busy, canDiscard, onClose]);
  function cancel() {
    if (canDiscard()) {
      setEditing(false);
      setDirty(false);
    }
  }
  function reload() {
    if (canDiscard()) {
      setEditing(false);
      setDirty(false);
      setSaved(false);
      setRevision((value) => value + 1);
    }
  }
  return (
    <FeatureDialog title={t('患者健康档案')} subtitle={patientId} onClose={close} wide>
      {!patient || !shown || error ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="patients-detail-heading">
            <div className="feature-person-header">
              <PersonAvatar name={shown.name} size="large" />
              <div>
                <h3>{shown.name}</h3>
                <p>
                  {t(patient.gender)} · {t('{age} 岁', { age: patient.age })} ·{' '}
                  {t('版本 {version}', { version: patient.version })}
                </p>
              </div>
            </div>
            {patient.canEdit && !editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(true);
                  setSaved(false);
                }}
              >
                <Pencil size={16} />
                {t('编辑档案')}
              </Button>
            )}
            {!editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  onClose();
                  navigate('/health?patientId=' + encodeURIComponent(patient.id));
                }}
              >
                {t('健康管理')}
              </Button>
            )}
          </div>
          {saved && (
            <p className="patients-success" role="status">
              {t('档案已保存')}
            </p>
          )}
          {editing ? (
            <PatientEditor
              patient={patient}
              etag={etag}
              onDirty={setDirty}
              onBusy={setBusy}
              onCancel={cancel}
              onReload={reload}
              onSaved={(next, nextEtag) => {
                setPatient(next);
                setEtag(nextEtag);
                setEditing(false);
                setDirty(false);
                setSaved(true);
                onSaved();
              }}
            />
          ) : (
            <>
              <FilterTabs
                value={section}
                onChange={setSection}
                label={t('患者详情分类')}
                options={[
                  { value: 'profile', label: '基本资料' },
                  { value: 'history', label: '病史与过敏' },
                  { value: 'versions', label: '修改历史' },
                  { value: 'records', label: '诊疗记录' },
                ]}
              />
              {section === 'profile' && (
                <>
                  <Badge tone={statusTones[patient.status]}>
                    {t(statusLabels[patient.status])}
                  </Badge>
                  <DetailGrid
                    items={[
                      { label: '联系电话', value: patient.phone || t('未记录') },
                      { label: '健康分类', value: shown.diagnosis },
                      {
                        label: '最近就诊',
                        value: patient.lastVisit ? formatDate(patient.lastVisit) : t('未记录'),
                      },
                      {
                        label: '下次随访',
                        value: patient.nextFollowUp
                          ? formatDate(patient.nextFollowUp)
                          : t('未记录'),
                      },
                    ]}
                  />
                  <h4 className="feature-small-heading">{t('照护摘要')}</h4>
                  <p className="feature-prose">{shown.careSummary || t('未记录')}</p>
                  <div className="feature-tag-row">
                    {shown.tags.map((tag) => (
                      <Badge key={tag} tone="slate">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <h4 className="feature-small-heading">{t('症状')}</h4>
                  {shown.symptoms.map((item) => (
                    <p className="feature-prose" key={item}>
                      {item}
                    </p>
                  ))}
                  {!patient.symptoms.length && <p>{t('未记录')}</p>}
                </>
              )}
              {section === 'history' && (
                <>
                  <h4>{t('既往病史')}</h4>
                  {shown.medicalHistory.map((item, index) => (
                    <p className="feature-prose" key={index}>
                      {item}
                    </p>
                  ))}
                  {!patient.medicalHistory.length && <p>{t('暂无既往病史记录')}</p>}
                  <h4>{t('过敏史')}</h4>
                  <Badge tone={patient.allergyStatus === 'recorded' ? 'amber' : 'slate'}>
                    {t(allergyLabels[patient.allergyStatus])}
                  </Badge>
                  {shown.allergies.map((item) => (
                    <p className="feature-prose" key={item}>
                      {item}
                    </p>
                  ))}
                </>
              )}
              {section === 'versions' && (
                <PatientHistory key={patient.version} patientId={patient.id} />
              )}
              {section === 'records' && <PatientRecords patientId={patient.id} />}
            </>
          )}
        </>
      )}
    </FeatureDialog>
  );
}
