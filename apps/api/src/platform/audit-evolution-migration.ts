/** Preserve existing events while adding a distinct failed outcome. */
export const auditEvolutionMigration = {
  version: 34,
  name: 'audit_failed_outcome_and_scoped_query_index',
  sql: `
    CREATE TABLE audit_events_next (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES identities(id), action TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('success','denied','planned','failed')), description TEXT NOT NULL
    );
    INSERT INTO audit_events_next SELECT id,actor_id,action,target_type,target_id,occurred_at,outcome,description FROM audit_events;
    DROP TABLE audit_events;
    ALTER TABLE audit_events_next RENAME TO audit_events;
    CREATE INDEX audit_events_actor_time ON audit_events(actor_id, occurred_at DESC);
    CREATE INDEX audit_events_actor_instant ON audit_events(actor_id, julianday(occurred_at) DESC, id DESC);
    CREATE INDEX audit_events_actor_domain ON audit_events(actor_id, target_type);
  `,
};
