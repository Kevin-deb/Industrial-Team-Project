import type { DatabaseSync } from 'node:sqlite';

export const patientsSearchAliasesMigration = {
  version: 39,
  name: 'patients_localized_search_aliases',
  sql: `
    CREATE TABLE patient_search_aliases (
      patient_id TEXT NOT NULL REFERENCES patients(id),
      locale TEXT NOT NULL,
      name TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      search_text TEXT NOT NULL,
      PRIMARY KEY(patient_id, locale)
    );
    CREATE INDEX patient_search_aliases_lookup
      ON patient_search_aliases(locale, patient_id);
  `,
};

const englishAliases = [
  [
    'PAT-001',
    'Chen Jianguo',
    'Hypertension',
    'chronic care hypertension penicillin history of hypertension dizziness self-reported dizziness blood pressure monitoring',
  ],
  [
    'PAT-002',
    'Wang Xiuying',
    'Type 2 diabetes',
    'diabetes regular follow-up fatigue glucose health data review',
  ],
  [
    'PAT-003',
    'Li Zhiming',
    'Hypertension',
    'hypertension health monitoring history of hypertension health trends',
  ],
  [
    'PAT-004',
    'Zhang Shulan',
    'Coronary heart disease',
    'coronary heart disease attention needed sulfonamides chest tightness cardiovascular',
  ],
  ['PAT-005', 'Liu Guifen', 'Type 2 diabetes', 'diabetes care plan health plan glucose'],
  [
    'PAT-006',
    'Zhao Dehua',
    'COPD',
    'chronic obstructive pulmonary disease COPD respiratory health cough regular follow-up',
  ],
  [
    'PAT-007',
    'Sun Yaqin',
    'Osteoarthritis',
    'osteoarthritis knee osteoarthritis rehabilitation care plan',
  ],
  [
    'PAT-008',
    'Huang Wenhai',
    'Hypertension',
    'hypertension regular follow-up history of hypertension routine review',
  ],
  [
    'PAT-009',
    'Guo Ruifang',
    'Chronic heart failure',
    'chronic heart failure cardiovascular follow-up multidisciplinary care',
  ],
] as const;

export function seedPatientSearchAliases(database: DatabaseSync): void {
  const insert = database.prepare(
    `INSERT OR REPLACE INTO patient_search_aliases(patient_id,locale,name,diagnosis,search_text)
     SELECT ?, 'en', ?, ?, ? WHERE EXISTS(SELECT 1 FROM patients WHERE id=?)`,
  );
  for (const [patientId, name, diagnosis, searchText] of englishAliases)
    insert.run(patientId, name, diagnosis, searchText, patientId);
}
