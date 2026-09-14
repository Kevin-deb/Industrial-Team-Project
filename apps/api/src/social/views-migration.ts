/** Additive post-view counter used only by the opt-in peer community. */
export const socialViewsMigration = {
  version: 10,
  name: 'social_post_views_and_sorting',
  sql: `
    ALTER TABLE social_posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count >= 0);
    UPDATE social_posts
      SET view_count = 37 + ((CAST(substr(id,6) AS INTEGER) * 17) % 126)
      WHERE id GLOB 'POST-[0-9][0-9][0-9]';
    CREATE INDEX social_posts_views ON social_posts(view_count DESC,last_activity_at DESC,id);
  `,
};
