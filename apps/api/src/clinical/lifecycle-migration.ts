export const clinicalLifecycleMigration = {
  version: 18,
  name: 'clinical_record_lifecycle_commands',
  sql: `
    CREATE TABLE clinical_command_receipts (
      actor_id TEXT NOT NULL REFERENCES identities(id),
      operation TEXT NOT NULL,
      record_id TEXT NOT NULL REFERENCES medical_records(id),
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id, operation, record_id, request_key)
    );
    INSERT OR IGNORE INTO role_permissions(role_id,permission)
      SELECT DISTINCT role_id,'clinical:review' FROM role_permissions
      WHERE permission='clinical:read' AND role_id='attending';
  `,
};
