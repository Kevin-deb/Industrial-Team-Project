export const onlineCarePersistenceMigration = {
  version: 25,
  name: 'online_care_persistent_workspace',
  sql: `
    ALTER TABLE encounter_messages ADD COLUMN sender_role TEXT NOT NULL DEFAULT 'doctor'
      CHECK(sender_role IN ('patient','doctor','system'));
    ALTER TABLE encounter_messages ADD COLUMN image_url TEXT;
    ALTER TABLE encounter_messages ADD COLUMN image_name TEXT;

    CREATE TABLE encounter_clinical_briefs (
      encounter_id TEXT PRIMARY KEY REFERENCES encounters(id),
      chief_complaint TEXT NOT NULL,
      present_illness TEXT NOT NULL,
      past_history TEXT NOT NULL,
      surgical_history TEXT NOT NULL,
      medication_history TEXT NOT NULL,
      allergy_history TEXT NOT NULL
    );

    CREATE TABLE encounter_history_records (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      title TEXT NOT NULL,
      record_date TEXT NOT NULL,
      department TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      outcome TEXT NOT NULL
    );
    CREATE INDEX encounter_history_patient_date ON encounter_history_records(patient_id,record_date DESC,id);

    CREATE TABLE encounter_saved_records (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      title TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('text','video')),
      message_count INTEGER NOT NULL CHECK(message_count>=0),
      audio_saved INTEGER NOT NULL CHECK(audio_saved IN (0,1)),
      video_saved INTEGER NOT NULL CHECK(video_saved IN (0,1))
    );
    CREATE INDEX encounter_saved_records_encounter ON encounter_saved_records(encounter_id,saved_at DESC);

    CREATE TABLE encounter_availability_windows (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES identities(id),
      window_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text','video')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity>0),
      booked INTEGER NOT NULL DEFAULT 0 CHECK(booked>=0)
    );
    CREATE INDEX encounter_availability_doctor_date ON encounter_availability_windows(doctor_id,window_date,start_time);

    CREATE TABLE encounter_notices (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      kind TEXT NOT NULL CHECK(kind IN ('资料提醒','按时进入提醒','改期通知')),
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('待患者确认','患者已接受','已发送')),
      proposed_scheduled_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX encounter_notices_encounter_time ON encounter_notices(encounter_id,created_at DESC);
  `,
};
