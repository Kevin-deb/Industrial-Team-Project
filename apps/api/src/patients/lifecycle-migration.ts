export const patientsLifecycleMigration = {
  version: 32,
  name: 'patients_lifecycle_management',
  sql: `
    ALTER TABLE patients ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'
      CHECK(lifecycle_status IN ('active','released','archived'));
    CREATE TABLE patient_management_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      operation TEXT NOT NULL CHECK(operation IN ('archive','release','transfer')),
      previous_doctor_id TEXT REFERENCES identities(id),
      new_doctor_id TEXT REFERENCES identities(id),
      actor_id TEXT NOT NULL REFERENCES identities(id),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resulting_version INTEGER NOT NULL
    );
    CREATE INDEX patient_management_history_patient ON patient_management_history(patient_id,created_at);
  `,
};
