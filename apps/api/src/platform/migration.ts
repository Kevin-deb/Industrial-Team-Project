export const platformMigration = {
  version: 1,
  name: 'platform_identity_permissions_audit_outbox',
  sql: `
    CREATE TABLE identities (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, title TEXT NOT NULL,
      department TEXT NOT NULL, hospital TEXT NOT NULL, avatar_initials TEXT NOT NULL,
      identity_provider_subject TEXT UNIQUE, is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK(is_synthetic=1)
    );
    CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE identity_roles (
      identity_id TEXT NOT NULL REFERENCES identities(id), role_id TEXT NOT NULL REFERENCES roles(id),
      PRIMARY KEY(identity_id, role_id)
    );
    CREATE TABLE role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id), permission TEXT NOT NULL,
      PRIMARY KEY(role_id, permission)
    );
    CREATE TABLE access_grants (
      id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES identities(id), patient_id TEXT NOT NULL REFERENCES patients(id),
      scope TEXT NOT NULL, task_id TEXT REFERENCES consultations(id), expires_at TEXT, revoked_at TEXT,
      created_at TEXT NOT NULL, CHECK(task_id IS NULL OR expires_at IS NOT NULL)
    );
    CREATE INDEX access_grants_actor_patient ON access_grants(identity_id, patient_id);
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES identities(id), action TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('success','denied','planned')), description TEXT NOT NULL
    );
    CREATE INDEX audit_events_actor_time ON audit_events(actor_id, occurred_at DESC);
    CREATE TABLE outbox_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1,
      aggregate_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
      processed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      idempotency_key TEXT NOT NULL UNIQUE
    );
    CREATE TABLE feature_settings (
      id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      configured_by TEXT REFERENCES identities(id), updated_at TEXT NOT NULL
    );
  `,
};
