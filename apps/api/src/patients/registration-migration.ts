export const patientsRegistrationMigration = {
  version: 16,
  name: 'patients_registration_requests',
  sql: `CREATE TABLE patient_registration_requests (
    actor_id TEXT NOT NULL REFERENCES identities(id),
    request_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY(actor_id,request_key)
  );`,
};
