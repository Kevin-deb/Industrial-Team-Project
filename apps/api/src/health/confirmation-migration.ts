export const healthObservationConfirmationMigration = {
  version: 23,
  name: 'health_observation_responsible_doctor_confirmation',
  sql: `
    ALTER TABLE health_observations RENAME TO health_observations_v18;
    CREATE TABLE health_observations (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      metric TEXT NOT NULL CHECK(metric IN ('systolic','diastolic','glucose','heart-rate')),
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      measured_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('synthetic-demo','manual-entry','device-simulator','patient-upload')),
      source_label TEXT NOT NULL,
      external_observation_id TEXT,
      quality_status TEXT NOT NULL DEFAULT 'demo',
      recorded_by TEXT REFERENCES identities(id),
      confirmed_by TEXT REFERENCES identities(id),
      confirmed_at TEXT,
      UNIQUE(patient_id,source,external_observation_id)
    );
    INSERT INTO health_observations(
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,
      external_observation_id,quality_status
    )
    SELECT id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,
      external_observation_id,
      CASE
        WHEN quality_status='reviewed' THEN 'confirmed'
        WHEN source='manual-entry' THEN 'recorded'
        WHEN quality_status='unreviewed' THEN 'pending-confirmation'
        ELSE quality_status
      END
    FROM health_observations_v18;
    DROP TABLE health_observations_v18;
    CREATE INDEX health_observations_patient_time
      ON health_observations(patient_id,measured_at);

    CREATE TABLE health_observation_confirmations (
      id TEXT PRIMARY KEY,
      observation_id TEXT NOT NULL REFERENCES health_observations(id),
      confirmed_by TEXT NOT NULL REFERENCES identities(id),
      confirmed_at TEXT NOT NULL,
      note TEXT,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL
    );
    CREATE INDEX health_observation_confirmations_observation
      ON health_observation_confirmations(observation_id,confirmed_at,id);
  `,
};
