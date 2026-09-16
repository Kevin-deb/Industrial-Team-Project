export const socialCommentReactionsMigration = {
  version: 13,
  name: 'social_comment_reactions',
  sql: `CREATE TABLE social_comment_reactions (
    comment_id TEXT NOT NULL REFERENCES social_comments(id),
    identity_id TEXT NOT NULL REFERENCES identities(id),
    kind TEXT NOT NULL CHECK(kind IN ('like','bookmark')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(comment_id,identity_id,kind)
  );`,
};
