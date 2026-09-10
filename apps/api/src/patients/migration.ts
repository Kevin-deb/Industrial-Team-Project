export const patientsMigration = {
  version: 2,
  name: 'patients_profiles_and_archive_versions',
  sql: `
    CREATE TABLE patients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT NOT NULL CHECK(gender IN ('女','男')),
      age INTEGER NOT NULL CHECK(age BETWEEN 0 AND 130), phone TEXT NOT NULL,
      diagnosis TEXT NOT NULL, tags_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('stable','attention','follow-up')),
      last_visit TEXT NOT NULL, next_follow_up TEXT NOT NULL,
      assigned_doctor_id TEXT NOT NULL REFERENCES identities(id), allergies_json TEXT NOT NULL,
      medical_history_json TEXT NOT NULL, care_summary TEXT NOT NULL,
      is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK(is_synthetic=1)
    );
    CREATE INDEX patients_doctor_status ON patients(assigned_doctor_id,status);
    CREATE TABLE patient_archive_versions (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), version INTEGER NOT NULL CHECK(version>0),
      payload_json TEXT NOT NULL, authored_by TEXT NOT NULL REFERENCES identities(id), created_at TEXT NOT NULL,
      change_reason TEXT NOT NULL, UNIQUE(patient_id,version)
    );
  `,
};
