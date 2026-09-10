export const clinicalMigration = {
  version: 4,
  name: 'clinical_records_orders_and_hierarchical_reviews',
  sql: `
    CREATE TABLE medical_records (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT REFERENCES encounters(id),
      title TEXT NOT NULL, diagnosis TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','pending-review','archived')),
      author_id TEXT NOT NULL REFERENCES identities(id), updated_at TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version>0), archived_at TEXT
    );
    CREATE TABLE medical_record_versions (
      id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES medical_records(id), version INTEGER NOT NULL CHECK(version>0),
      template_id TEXT NOT NULL, body_json TEXT NOT NULL, authored_by TEXT NOT NULL REFERENCES identities(id),
      authored_at TEXT NOT NULL, amendment_reason TEXT, UNIQUE(record_id,version)
    );
    CREATE TABLE record_reviews (
      id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES medical_records(id), record_version INTEGER NOT NULL,
      reviewer_id TEXT NOT NULL REFERENCES identities(id), decision TEXT NOT NULL CHECK(decision IN ('approved','returned')),
      comment TEXT NOT NULL, reviewed_at TEXT NOT NULL,
      FOREIGN KEY(record_id,record_version) REFERENCES medical_record_versions(record_id,version)
    );
    CREATE TABLE medical_orders (
      id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES medical_records(id), patient_id TEXT NOT NULL REFERENCES patients(id),
      type TEXT NOT NULL CHECK(type IN ('medication','examination','laboratory')),
      status TEXT NOT NULL CHECK(status IN ('draft','active','stopped')),
      current_version INTEGER NOT NULL CHECK(current_version>0), created_by TEXT NOT NULL REFERENCES identities(id),
      created_at TEXT NOT NULL, stopped_at TEXT, stop_reason TEXT
    );
    CREATE TABLE medical_order_versions (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES medical_orders(id), version INTEGER NOT NULL CHECK(version>0),
      payload_json TEXT NOT NULL, authored_by TEXT NOT NULL REFERENCES identities(id), authored_at TEXT NOT NULL,
      change_reason TEXT NOT NULL, UNIQUE(order_id,version)
    );
  `,
};
