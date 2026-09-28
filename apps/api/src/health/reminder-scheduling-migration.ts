export const healthReminderSchedulingMigration = {
  version: 36,
  name: 'health_reminder_creator_and_schedule_attempts',
  sql: `
    ALTER TABLE reminder_tasks ADD COLUMN created_by TEXT REFERENCES identities(id);
    ALTER TABLE reminder_tasks ADD COLUMN last_attempt_at TEXT;
    UPDATE reminder_tasks SET created_by=COALESCE(
      (SELECT actor_id FROM health_command_receipts
       WHERE resource_id=reminder_tasks.id AND operation='health.reminder.create' LIMIT 1),
      (SELECT doctor_id FROM care_plans WHERE id=reminder_tasks.plan_id),
      (SELECT assigned_doctor_id FROM patients WHERE id=reminder_tasks.patient_id)
    );
    CREATE INDEX health_reminders_due ON reminder_tasks(status,scheduled_at,attempts);
  `,
};
