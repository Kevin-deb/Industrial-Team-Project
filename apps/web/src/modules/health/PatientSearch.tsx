import { Search, UserRound } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { HealthPatientSummary } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { usePatientSearch } from './queries';

export function PatientSearch({
  selected,
  onSelect,
}: {
  selected: HealthPatientSummary | null;
  onSelect: (patient: HealthPatientSummary) => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [input]);
  const patients = usePatientSearch(query);
  return (
    <section className="health-patient-search" aria-labelledby="health-patient-label">
      <label id="health-patient-label" htmlFor="health-patient-input">
        {t('查找患者')}
      </label>
      <p>{t('输入姓名、患者编号或病史关键词')}</p>
      <div className="health-search-control">
        <Search size={17} aria-hidden="true" />
        <input
          id="health-patient-input"
          type="search"
          role="searchbox"
          aria-label={t('搜索健康管理患者')}
          aria-controls={listId}
          autoComplete="off"
          value={input}
          placeholder={t('例如：陈建国、PAT-001')}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setInput(event.target.value);
            setOpen(true);
          }}
        />
        {patients.isFetching && <span className="health-search-loading">{t('正在查找…')}</span>}
      </div>
      {open && patients.data && (
        <div className="health-search-results" id={listId}>
          {patients.data.data.map((patient) => (
            <button
              type="button"
              key={patient.id}
              aria-label={`${patient.name} · ${patient.id}`}
              onClick={() => {
                onSelect(patient);
                setInput('');
                setOpen(false);
              }}
            >
              <span className="health-result-avatar">
                {patient.avatarInitials || <UserRound size={17} />}
              </span>
              <span>
                <strong>{patient.name}</strong>
                <small>
                  {patient.id} · {patient.age} {t('岁')}
                </small>
              </span>
              <em>{patient.diagnosis}</em>
            </button>
          ))}
          {!patients.data.data.length && (
            <div className="health-search-empty">{t('没有找到匹配的患者')}</div>
          )}
        </div>
      )}
      {patients.isError && (
        <div className="health-inline-error">{t('患者列表暂时无法加载，请稍后重试。')}</div>
      )}
      {selected && (
        <div className="health-patient-summary">
          <span className="health-patient-avatar">{selected.avatarInitials}</span>
          <div className="health-patient-name">
            <strong>{selected.name}</strong>
            <span>{selected.id}</span>
          </div>
          <dl>
            <div>
              <dt>{t('基本信息')}</dt>
              <dd>
                {selected.age} {t('岁')} · {t(selected.gender)}
              </dd>
            </div>
            <div>
              <dt>{t('当前诊断')}</dt>
              <dd>{selected.diagnosis}</dd>
            </div>
            <div>
              <dt>{t('下次随访')}</dt>
              <dd>{selected.nextFollowUp}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
