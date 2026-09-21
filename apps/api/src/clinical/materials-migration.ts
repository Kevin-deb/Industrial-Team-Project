export const clinicalMaterialsMigration = {
  version: 20,
  name: 'clinical_material_references',
  sql: `
    CREATE TABLE clinical_materials (
      id TEXT PRIMARY KEY,
      consultation_id TEXT NOT NULL REFERENCES consultations(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      record_id TEXT NOT NULL REFERENCES medical_records(id),
      record_version INTEGER NOT NULL CHECK(record_version>0),
      shared_sections_json TEXT NOT NULL,
      purpose TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES identities(id),
      created_at TEXT NOT NULL,
      report_id TEXT,
      linked_at TEXT,
      FOREIGN KEY(record_id, record_version) REFERENCES medical_record_versions(record_id, version)
    );
    CREATE INDEX clinical_materials_consultation ON clinical_materials(consultation_id, created_at DESC);
    CREATE TABLE clinical_material_receipts (
      actor_id TEXT NOT NULL REFERENCES identities(id),
      operation TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      material_id TEXT NOT NULL REFERENCES clinical_materials(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id, operation, resource_id, request_key)
    );
  `,
};
