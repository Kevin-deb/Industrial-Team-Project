export const platformNotificationsMigration = {
  version: 35,
  name: 'platform_local_test_notification_receipts',
  sql: `
    CREATE TABLE platform_demo_deliveries (
      id TEXT PRIMARY KEY,
      reminder_id TEXT NOT NULL UNIQUE REFERENCES reminder_tasks(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      channel TEXT NOT NULL CHECK(channel IN ('in-app','sms','email')),
      template_id TEXT NOT NULL,
      body TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      delivered_at TEXT NOT NULL
    );
    CREATE INDEX platform_demo_deliveries_patient_time
      ON platform_demo_deliveries(patient_id, delivered_at DESC);
  `,
};
