export const socialEvolutionMigration = {
  version: 8,
  name: 'social_forums_bookmarks_notifications_and_conversations',
  sql: `
    ALTER TABLE social_groups ADD COLUMN description TEXT NOT NULL DEFAULT '';

    ALTER TABLE social_reports RENAME TO social_reports_v6;
    ALTER TABLE social_likes RENAME TO social_likes_v6;
    ALTER TABLE social_comments RENAME TO social_comments_v6;
    ALTER TABLE social_posts RENAME TO social_posts_v6;

    CREATE TABLE social_posts (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES social_groups(id), author_id TEXT NOT NULL REFERENCES identities(id),
      display_mode TEXT NOT NULL CHECK(display_mode IN ('named','anonymous')), title TEXT NOT NULL, body TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]', contains_case_material INTEGER NOT NULL DEFAULT 0 CHECK(contains_case_material IN (0,1)),
      deidentification_confirmed_at TEXT, moderation_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL, last_activity_at TEXT NOT NULL
    );
    INSERT INTO social_posts(id,group_id,author_id,display_mode,title,body,tags_json,contains_case_material,deidentification_confirmed_at,moderation_status,created_at,last_activity_at)
      SELECT id,group_id,author_id,display_mode,'未命名主题',body,'[]',1,deidentification_confirmed_at,moderation_status,created_at,created_at FROM social_posts_v6;

    CREATE TABLE social_comments (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES social_posts(id), parent_comment_id TEXT REFERENCES social_comments(id),
      author_id TEXT NOT NULL REFERENCES identities(id), display_mode TEXT NOT NULL DEFAULT 'named' CHECK(display_mode IN ('named','anonymous')),
      body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO social_comments(id,post_id,author_id,display_mode,body,created_at)
      SELECT id,post_id,author_id,'named',body,created_at FROM social_comments_v6;
    CREATE TABLE social_likes (
      post_id TEXT NOT NULL REFERENCES social_posts(id), identity_id TEXT NOT NULL REFERENCES identities(id),
      created_at TEXT NOT NULL, PRIMARY KEY(post_id,identity_id)
    );
    INSERT INTO social_likes SELECT * FROM social_likes_v6;
    CREATE TABLE social_reports (
      id TEXT PRIMARY KEY, post_id TEXT REFERENCES social_posts(id), reported_message_id TEXT REFERENCES social_direct_messages(id),
      reporter_id TEXT NOT NULL REFERENCES identities(id), reason TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT REFERENCES identities(id), reviewed_at TEXT, created_at TEXT NOT NULL
    );
    INSERT INTO social_reports(id,post_id,reported_message_id,reporter_id,reason,status,reviewed_by,reviewed_at,created_at)
      SELECT id,post_id,reported_message_id,reporter_id,reason,status,reviewed_by,reviewed_at,created_at FROM social_reports_v6;
    DROP TABLE social_reports_v6;
    DROP TABLE social_likes_v6;
    DROP TABLE social_comments_v6;
    DROP TABLE social_posts_v6;

    CREATE TABLE social_bookmarks (
      post_id TEXT NOT NULL REFERENCES social_posts(id), identity_id TEXT NOT NULL REFERENCES identities(id),
      created_at TEXT NOT NULL, PRIMARY KEY(post_id,identity_id)
    );
    CREATE TABLE social_notifications (
      id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES identities(id), actor_id TEXT REFERENCES identities(id),
      post_id TEXT REFERENCES social_posts(id), comment_id TEXT REFERENCES social_comments(id),
      kind TEXT NOT NULL CHECK(kind IN ('comment','reply','like','bookmark')), created_at TEXT NOT NULL, read_at TEXT
    );
    CREATE TABLE social_conversations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE social_conversation_members (
      conversation_id TEXT NOT NULL REFERENCES social_conversations(id), identity_id TEXT NOT NULL REFERENCES identities(id),
      PRIMARY KEY(conversation_id,identity_id)
    );
    ALTER TABLE social_direct_messages ADD COLUMN conversation_id TEXT REFERENCES social_conversations(id);
    ALTER TABLE social_direct_messages ADD COLUMN read_at TEXT;
    CREATE TABLE social_command_receipts (
      actor_id TEXT NOT NULL, command_id TEXT NOT NULL, operation TEXT NOT NULL, request_digest TEXT NOT NULL,
      resource_id TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id,command_id)
    );
    CREATE INDEX social_posts_activity ON social_posts(last_activity_at DESC,id);
    CREATE INDEX social_comments_post_time ON social_comments(post_id,created_at,id);
    CREATE INDEX social_messages_conversation_time ON social_direct_messages(conversation_id,sent_at,id);
  `,
};
