export const healthEvolutionMigration = {
  version: 7,
  name: 'health_workflow_provenance_versions_and_receipts',
  sql: `
    ALTER TABLE health_observations RENAME TO health_observations_v5;
    CREATE TABLE health_observations (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), metric TEXT NOT NULL CHECK(metric IN ('systolic','diastolic','glucose','heart-rate')),
      value REAL NOT NULL, unit TEXT NOT NULL, measured_at TEXT NOT NULL, received_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('synthetic-demo','manual-entry','device-simulator')), source_label TEXT NOT NULL,
      external_observation_id TEXT UNIQUE, quality_status TEXT NOT NULL DEFAULT 'demo'
    );
    INSERT INTO health_observations(
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,external_observation_id,quality_status
    ) SELECT
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,external_observation_id,quality_status
    FROM health_observations_v5;
    DROP TABLE health_observations_v5;
    CREATE INDEX health_observations_patient_time ON health_observations(patient_id,measured_at);

    ALTER TABLE care_plans ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1 CHECK(current_version > 0);
    ALTER TABLE care_plans ADD COLUMN created_at TEXT NOT NULL DEFAULT '2026-09-01T00:00:00+08:00';
    ALTER TABLE care_plans ADD COLUMN updated_at TEXT NOT NULL DEFAULT '2026-09-01T00:00:00+08:00';

    CREATE TABLE health_command_receipts (
      actor_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_digest TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id,command_id)
    );

    CREATE TABLE health_notification_preferences (
      patient_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      updated_at TEXT NOT NULL
    );
  `,
};
