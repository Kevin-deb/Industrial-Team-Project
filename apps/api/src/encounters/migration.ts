export const encountersMigration = {
  version: 3,
  name: 'encounters_remote_consultations_and_media',
  sql: `
    CREATE TABLE encounters (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), doctor_id TEXT NOT NULL REFERENCES identities(id),
      type TEXT NOT NULL CHECK(type IN ('video','text')), status TEXT NOT NULL CHECK(status IN ('waiting','scheduled','completed')),
      scheduled_at TEXT NOT NULL, reason TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes>=0),
      rtc_room_id TEXT, ended_at TEXT, archived_at TEXT
    );
    CREATE TABLE encounter_messages (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), sender_identity_id TEXT REFERENCES identities(id),
      sender_patient_id TEXT REFERENCES patients(id), body TEXT NOT NULL, sent_at TEXT NOT NULL,
      CHECK((sender_identity_id IS NOT NULL) != (sender_patient_id IS NOT NULL))
    );
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT REFERENCES encounters(id),
      consultation_id TEXT REFERENCES consultations(id), object_key TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length>=0),
      uploaded_by TEXT REFERENCES identities(id), uploaded_at TEXT NOT NULL, scan_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE recordings (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), provider_recording_id TEXT,
      object_key TEXT, consent_reference TEXT NOT NULL, consented_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('requested','recording','processing','available','failed')),
      started_at TEXT, stopped_at TEXT, retention_until TEXT, failure_reason TEXT
    );
    CREATE TABLE consultations (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), requested_by TEXT NOT NULL REFERENCES identities(id),
      title TEXT NOT NULL, specialty TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('requested','scheduled','completed')),
      scheduled_at TEXT NOT NULL, summary TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE consultation_participants (
      consultation_id TEXT NOT NULL REFERENCES consultations(id), identity_id TEXT NOT NULL REFERENCES identities(id),
      participant_role TEXT NOT NULL, joined_at TEXT, left_at TEXT,
      PRIMARY KEY(consultation_id,identity_id)
    );
    CREATE TABLE consultation_reports (
      id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id), version INTEGER NOT NULL CHECK(version>0),
      body_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','confirmed','archived')),
      confirmed_by TEXT REFERENCES identities(id), confirmed_at TEXT, created_at TEXT NOT NULL,
      UNIQUE(consultation_id,version), CHECK(status='draft' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
    );
  `,
};
