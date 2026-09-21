const { DatabaseSync } = require('node:sqlite');

for (const path of ['runtime/data/doctor.sqlite', 'database/carelink.sqlite']) {
  const db = new DatabaseSync(path);
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = db
      .prepare(
        `SELECT c.id consultation_id,c.patient_id,c.scheduled_at,cp.identity_id,c.requested_by
         FROM consultations c
         JOIN consultation_participants cp ON cp.consultation_id=c.id
         WHERE cp.identity_id<>c.requested_by`,
      )
      .all();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO access_grants(
        id,identity_id,patient_id,scope,task_id,expires_at,revoked_at,created_at
      ) VALUES(?,?,?,?,?,?,?,?)`,
    );
    for (const row of rows) {
      insert.run(
        `grant-${row.consultation_id}-${row.identity_id}`,
        row.identity_id,
        row.patient_id,
        'patient:read',
        row.consultation_id,
        row.scheduled_at,
        null,
        '2026-09-22T00:00:00.000Z',
      );
    }
    db.exec('COMMIT');
    console.log(path, 'backfilled grants:', rows.length);
    console.table(
      db
        .prepare(
          "SELECT id,identity_id,patient_id,task_id,expires_at FROM access_grants WHERE task_id IS NOT NULL ORDER BY task_id,identity_id",
        )
        .all(),
    );
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
