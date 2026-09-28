export const consultationGrantExpiryMigration = {
  version: 37,
  name: 'consultation_grants_expire_after_session_start',
  sql: `
    UPDATE access_grants
    SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',expires_at,'+4 hours')
    WHERE revoked_at IS NULL AND task_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM consultations c WHERE c.id=access_grants.task_id
      AND c.status IN ('requested','scheduled') AND c.completed_at IS NULL
      AND julianday(c.scheduled_at)=julianday(access_grants.expires_at)
    );
  `,
};
