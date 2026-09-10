export const socialMigration = {
  version: 6,
  name: 'isolated_opt_in_peer_community',
  sql: `
    CREATE TABLE social_preferences (
      identity_id TEXT PRIMARY KEY REFERENCES identities(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK(notifications_enabled IN (0,1)),
      updated_at TEXT NOT NULL, CHECK(enabled=1 OR notifications_enabled=0)
    );
    CREATE TABLE social_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL);
    CREATE TABLE social_memberships (
      group_id TEXT NOT NULL REFERENCES social_groups(id), identity_id TEXT NOT NULL REFERENCES identities(id),
      joined_at TEXT NOT NULL, PRIMARY KEY(group_id,identity_id)
    );
    -- No patient or clinical record foreign key: sharing is manual and de-identified.
    CREATE TABLE social_posts (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES social_groups(id), author_id TEXT NOT NULL REFERENCES identities(id),
      display_mode TEXT NOT NULL CHECK(display_mode IN ('named','anonymous')), body TEXT NOT NULL,
      deidentification_confirmed_at TEXT NOT NULL, moderation_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
    );
    CREATE TABLE social_comments (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES social_posts(id), author_id TEXT NOT NULL REFERENCES identities(id),
      body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE social_likes (
      post_id TEXT NOT NULL REFERENCES social_posts(id), identity_id TEXT NOT NULL REFERENCES identities(id),
      created_at TEXT NOT NULL, PRIMARY KEY(post_id,identity_id)
    );
    CREATE TABLE social_direct_messages (
      id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES identities(id), recipient_id TEXT NOT NULL REFERENCES identities(id),
      body TEXT NOT NULL, sent_at TEXT NOT NULL
    );
    CREATE TABLE social_reports (
      id TEXT PRIMARY KEY, post_id TEXT REFERENCES social_posts(id), reported_message_id TEXT REFERENCES social_direct_messages(id),
      reporter_id TEXT NOT NULL REFERENCES identities(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT REFERENCES identities(id), reviewed_at TEXT, created_at TEXT NOT NULL
    );
  `,
};
