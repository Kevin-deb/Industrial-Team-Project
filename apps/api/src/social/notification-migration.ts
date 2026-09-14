/** Expand community notifications without coupling E to a moderation admin UI. */
export const socialNotificationMigration = {
  version: 12,
  name: 'social_notification_events',
  sql: `
    ALTER TABLE social_notifications RENAME TO social_notifications_v12;
    CREATE TABLE social_notifications (
      id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES identities(id),
      actor_id TEXT REFERENCES identities(id), post_id TEXT REFERENCES social_posts(id),
      comment_id TEXT REFERENCES social_comments(id),
      kind TEXT NOT NULL CHECK(kind IN ('comment','reply','like','bookmark','report-accepted','report-upheld','report-rejected','content-moderated')),
      created_at TEXT NOT NULL, read_at TEXT
    );
    INSERT INTO social_notifications(id,recipient_id,actor_id,post_id,comment_id,kind,created_at,read_at)
      SELECT id,recipient_id,actor_id,post_id,comment_id,kind,created_at,read_at FROM social_notifications_v12;
    DROP TABLE social_notifications_v12;
    CREATE INDEX social_notifications_recipient_time ON social_notifications(recipient_id,created_at DESC,id);
  `,
};
