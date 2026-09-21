export const authMigration = {
  version: 21,
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

/** One-time demo credential migration. It does not run again after a user changes a password. */
export const demoInitialPasswordMigration = {
  version: 22,
  name: 'demo_clinician_initial_password_123456',
  sql: `
    UPDATE users SET password_hash='scrypt$carelink-doctor-demo-001$d62bc96f011692cea59ab0cbe46116276bb6792ed8580eb64df83f2d6c368c05',updated_at='2026-09-21T00:00:00.000Z' WHERE identity_id='doctor-demo-001';
    UPDATE users SET password_hash='scrypt$carelink-doctor-demo-002$d92680697b346308fe1764371077e2cdf44fc0011a369857e5f3cfb07798cbe9',updated_at='2026-09-21T00:00:00.000Z' WHERE identity_id='doctor-demo-002';
    UPDATE users SET password_hash='scrypt$carelink-doctor-demo-003$d68b7ae8f638a13d406065f3098027d99e9507df7dcc3cf7e873a210a0f8d515',updated_at='2026-09-21T00:00:00.000Z' WHERE identity_id='doctor-demo-003';
    UPDATE users SET password_hash='scrypt$carelink-doctor-demo-004$c4e21f3c7f44342e7ff03093c72660cadac6c0dc96e071db38f19bdcf9e07ea8',updated_at='2026-09-21T00:00:00.000Z' WHERE identity_id='doctor-demo-004';
    UPDATE users SET password_hash='scrypt$carelink-doctor-demo-005$943f6aeb811e9b20a7ca7d3d87595dfe1c1fd29c44e69a5af957e10abc13bebf',updated_at='2026-09-21T00:00:00.000Z' WHERE identity_id='doctor-demo-005';
  `,
};
