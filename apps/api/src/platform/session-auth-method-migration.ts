export const sessionAuthMethodMigration = {
  version: 24,
  name: 'independent_password_email_and_face_sessions',
  sql: `
    ALTER TABLE user_sessions RENAME TO user_sessions_v19;
    CREATE TABLE user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      client_type TEXT NOT NULL DEFAULT 'desktop',
      auth_method TEXT NOT NULL DEFAULT 'face' CHECK(auth_method IN ('password','email','face')),
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      photo_check_id TEXT REFERENCES identity_photo_checks(id)
    );
    INSERT INTO user_sessions(
      id,user_id,token_hash,client_type,auth_method,created_at,last_used_at,expires_at,revoked_at,photo_check_id
    )
    SELECT id,user_id,token_hash,client_type,'face',created_at,last_used_at,expires_at,revoked_at,photo_check_id
    FROM user_sessions_v19;
    DROP TABLE user_sessions_v19;
    CREATE INDEX user_sessions_user_active ON user_sessions(user_id,expires_at,revoked_at);
  `,
};
