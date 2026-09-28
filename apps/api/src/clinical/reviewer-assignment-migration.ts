export const clinicalReviewerAssignmentMigration = {
  version: 38,
  name: 'clinical_record_assigned_reviewers',
  sql: `
    ALTER TABLE medical_records ADD COLUMN reviewer_id TEXT REFERENCES identities(id);
    UPDATE medical_records
    SET reviewer_id=(
      SELECT i.id
      FROM identities i
      JOIN identity_roles ir ON ir.identity_id=i.id
      JOIN role_permissions rp ON rp.role_id=ir.role_id
      WHERE rp.permission='clinical:review' AND i.id<>medical_records.author_id
      ORDER BY i.display_name
      LIMIT 1
    )
    WHERE reviewer_id IS NULL;
    CREATE INDEX clinical_records_reviewer_status ON medical_records(reviewer_id,status,updated_at DESC);
  `,
};
