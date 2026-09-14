/** Additive rich-content storage. Binary bytes remain outside SQLite. */
export const socialRichContentMigration = {
  version: 11,
  name: 'social_rich_content_attachments',
  sql: `
    CREATE TABLE social_attachments (
      id TEXT PRIMARY KEY,
      owner_identity_id TEXT NOT NULL REFERENCES identities(id),
      kind TEXT NOT NULL CHECK(kind IN ('image','audio')),
      media_type TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
      width INTEGER CHECK(width IS NULL OR width > 0),
      height INTEGER CHECK(height IS NULL OR height > 0),
      duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms >= 0),
      state TEXT NOT NULL CHECK(state IN ('temporary','attached')),
      created_at TEXT NOT NULL,
      attached_at TEXT
    );
    CREATE TABLE social_content_blocks (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('post','comment','message')),
      entity_id TEXT NOT NULL,
      display_order INTEGER NOT NULL CHECK(display_order >= 0),
      kind TEXT NOT NULL CHECK(kind IN ('image','audio','medical-metric-card')),
      attachment_id TEXT REFERENCES social_attachments(id),
      card_json TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1),
      created_at TEXT NOT NULL,
      UNIQUE(entity_type,entity_id,display_order),
      CHECK(
        (kind IN ('image','audio') AND attachment_id IS NOT NULL AND card_json IS NULL)
        OR
        (kind='medical-metric-card' AND attachment_id IS NULL AND card_json IS NOT NULL)
      )
    );
    CREATE INDEX social_attachments_owner_state
      ON social_attachments(owner_identity_id,state,created_at);
    CREATE INDEX social_content_blocks_entity
      ON social_content_blocks(entity_type,entity_id,display_order);
  `,
};
