export const authMigration = {
  version: 17,
  name: 'platform_authentication_and_clinician_profiles',
  sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL UNIQUE REFERENCES identities(id),
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email_verified_at TEXT,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','locked')),
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE doctors (
      identity_id TEXT PRIMARY KEY REFERENCES identities(id),
      license_number TEXT NOT NULL UNIQUE,
      specialty TEXT NOT NULL,
      phone TEXT NOT NULL,
      government_id_type TEXT NOT NULL,
      government_id_masked TEXT NOT NULL,
      credential_status TEXT NOT NULL CHECK(credential_status IN ('pending','verified','rejected')),
      personnel_status TEXT NOT NULL CHECK(personnel_status IN ('pending','verified','suspended')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE email_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      purpose TEXT NOT NULL DEFAULT 'login',
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      photo_ticket_hash TEXT,
      photo_ticket_expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX email_challenges_user_time ON email_challenges(user_id,created_at DESC);
    CREATE TABLE identity_photo_checks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      photo_object_key TEXT NOT NULL,
      capture_method TEXT NOT NULL CHECK(capture_method IN ('camera','upload')),
      status TEXT NOT NULL DEFAULT 'demo-accepted' CHECK(status IN ('demo-accepted','rejected')),
      demo_only INTEGER NOT NULL DEFAULT 1 CHECK(demo_only=1),
      checked_at TEXT NOT NULL,
      reviewer_note TEXT NOT NULL DEFAULT 'Course demonstration only; no biometric comparison performed.'
    );
    CREATE TABLE user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      client_type TEXT NOT NULL DEFAULT 'desktop',
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      photo_check_id TEXT NOT NULL REFERENCES identity_photo_checks(id)
    );
    CREATE INDEX user_sessions_user_active ON user_sessions(user_id,expires_at,revoked_at);
  `,
};
