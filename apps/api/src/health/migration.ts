export const healthMigration = {
  version: 5,
  name: 'health_observations_plans_assessments_and_reminders',
  sql: `
    CREATE TABLE health_observations (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), metric TEXT NOT NULL CHECK(metric IN ('systolic','diastolic','glucose','heart-rate')),
      value REAL NOT NULL, unit TEXT NOT NULL, measured_at TEXT NOT NULL, received_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source='synthetic-demo'), source_label TEXT NOT NULL,
      external_observation_id TEXT UNIQUE, quality_status TEXT NOT NULL DEFAULT 'demo'
    );
    CREATE INDEX health_observations_patient_time ON health_observations(patient_id,measured_at);
    CREATE TABLE health_alerts (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), metric TEXT NOT NULL, value TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('attention','review')), measured_at TEXT NOT NULL,
      source_label TEXT NOT NULL, description TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT REFERENCES identities(id)
    );
    CREATE TABLE care_plans (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), doctor_id TEXT NOT NULL REFERENCES identities(id),
      title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','draft')), goals_json TEXT NOT NULL,
      next_review TEXT NOT NULL, completion_percent INTEGER NOT NULL CHECK(completion_percent BETWEEN 0 AND 100)
    );
    CREATE TABLE care_plan_versions (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES care_plans(id), version INTEGER NOT NULL CHECK(version>0),
      payload_json TEXT NOT NULL, authored_by TEXT NOT NULL REFERENCES identities(id), created_at TEXT NOT NULL,
      UNIQUE(plan_id,version)
    );
    CREATE TABLE health_assessments (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), plan_id TEXT REFERENCES care_plans(id),
      assessor_id TEXT NOT NULL REFERENCES identities(id), assessed_at TEXT NOT NULL, summary TEXT NOT NULL,
      recommendations_json TEXT NOT NULL, next_review TEXT
    );
    CREATE TABLE reminder_tasks (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), plan_id TEXT REFERENCES care_plans(id),
      channel TEXT NOT NULL CHECK(channel IN ('in-app','sms','email')), template_id TEXT NOT NULL, scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','pending','sent','failed','cancelled')), consent_reference TEXT,
      provider_message_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, idempotency_key TEXT NOT NULL UNIQUE
    );
  `,
};
