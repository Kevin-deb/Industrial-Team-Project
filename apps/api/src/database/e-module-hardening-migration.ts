/** Additive upgrade for E-module data integrity and legacy community messages. */
export const eModuleHardeningMigration = {
  version: 9,
  name: 'e_module_integrity_and_delivery_outbox',
  sql: `
    ALTER TABLE health_observations RENAME TO health_observations_v7;
    CREATE TABLE health_observations (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), metric TEXT NOT NULL CHECK(metric IN ('systolic','diastolic','glucose','heart-rate')),
      value REAL NOT NULL, unit TEXT NOT NULL, measured_at TEXT NOT NULL, received_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('synthetic-demo','manual-entry','device-simulator')), source_label TEXT NOT NULL,
      external_observation_id TEXT, quality_status TEXT NOT NULL DEFAULT 'demo',
      UNIQUE(patient_id,source,external_observation_id)
    );
    INSERT INTO health_observations(
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,external_observation_id,quality_status
    ) SELECT
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,external_observation_id,quality_status
    FROM health_observations_v7;
    DROP TABLE health_observations_v7;
    CREATE INDEX health_observations_patient_time ON health_observations(patient_id,measured_at);

    CREATE TABLE health_reminder_delivery_attempts (
      actor_id TEXT NOT NULL REFERENCES identities(id), command_id TEXT NOT NULL,
      reminder_id TEXT NOT NULL REFERENCES reminder_tasks(id), provider_idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')), created_at TEXT NOT NULL,
      completed_at TEXT, PRIMARY KEY(actor_id,command_id)
    );

    INSERT OR IGNORE INTO social_conversations(id,created_at,updated_at)
      SELECT
        'CONVERSATION-LEGACY-' ||
          CASE WHEN sender_id < recipient_id
            THEN sender_id || '-' || recipient_id
            ELSE recipient_id || '-' || sender_id END,
        MIN(sent_at), MAX(sent_at)
      FROM social_direct_messages
      WHERE conversation_id IS NULL
      GROUP BY CASE WHEN sender_id < recipient_id
        THEN sender_id || '-' || recipient_id
        ELSE recipient_id || '-' || sender_id END;
    INSERT OR IGNORE INTO social_conversation_members(conversation_id,identity_id)
      SELECT
        'CONVERSATION-LEGACY-' ||
          CASE WHEN sender_id < recipient_id
            THEN sender_id || '-' || recipient_id
            ELSE recipient_id || '-' || sender_id END,
        sender_id
      FROM social_direct_messages WHERE conversation_id IS NULL
      UNION
      SELECT
        'CONVERSATION-LEGACY-' ||
          CASE WHEN sender_id < recipient_id
            THEN sender_id || '-' || recipient_id
            ELSE recipient_id || '-' || sender_id END,
        recipient_id
      FROM social_direct_messages WHERE conversation_id IS NULL;
    UPDATE social_direct_messages
      SET conversation_id = 'CONVERSATION-LEGACY-' ||
        CASE WHEN sender_id < recipient_id
          THEN sender_id || '-' || recipient_id
          ELSE recipient_id || '-' || sender_id END
      WHERE conversation_id IS NULL;
  `,
};
