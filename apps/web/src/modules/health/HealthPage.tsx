import { useState } from 'react';
import type { Patient } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { PatientSearch } from './PatientSearch';
import { ObservationsPanel } from './ObservationsPanel';
import { PlansPanel } from './PlansPanel';
import { AssessmentsPanel } from './AssessmentsPanel';
import { RemindersPanel } from './RemindersPanel';
import './health.css';

type HealthTab = 'observations' | 'plans' | 'assessments' | 'reminders';

export function HealthPage() {
  const { t } = useI18n();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tab, setTab] = useState<HealthTab>('observations');
  const tabs: Array<{ id: HealthTab; label: string }> = [
    { id: 'observations', label: '健康观测' },
    { id: 'plans', label: '管理计划' },
    { id: 'assessments', label: '健康评估' },
    { id: 'reminders', label: '随访提醒' },
  ];
  return (
    <div className="health-workspace">
      <header className="health-page-heading">
        <h1>{t('健康管理')}</h1>
        <p>{t('按患者查找并维护健康观测、管理计划、评估和提醒。')}</p>
      </header>
      <PatientSearch
        selected={patient}
        onSelect={(next) => {
          setPatient(next);
          setTab('observations');
        }}
      />
      {patient ? (
        <>
          <nav className="health-tabs" aria-label={t('健康管理内容')}>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'active' : ''}
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </nav>
          {tab === 'observations' && <ObservationsPanel patientId={patient.id} />}
          {tab === 'plans' && <PlansPanel patientId={patient.id} />}
          {tab === 'assessments' && <AssessmentsPanel patientId={patient.id} />}
          {tab === 'reminders' && <RemindersPanel patientId={patient.id} />}
        </>
      ) : (
        <section className="health-patient-prompt">
          <h2>{t('先查找并选择一位患者')}</h2>
          <p>{t('选择后，页面会在同一位置显示该患者的健康管理资料。')}</p>
        </section>
      )}
    </div>
  );
}
