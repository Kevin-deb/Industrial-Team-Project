export const onlineCareTrimMigration = {
  version: 27,
  name: 'online_care_typical_fixture_trim',
  sql: `
    DELETE FROM encounter_notices
    WHERE encounter_id NOT IN ('ENC-001','ENC-005','ENC-006','ENC-008','ENC-011','ENC-012');

    DELETE FROM encounter_saved_records
    WHERE encounter_id NOT IN ('ENC-001','ENC-005','ENC-006','ENC-008','ENC-011','ENC-012');

    DELETE FROM encounter_messages
    WHERE encounter_id NOT IN ('ENC-001','ENC-005','ENC-006','ENC-008','ENC-011','ENC-012');

    DELETE FROM encounter_clinical_briefs
    WHERE encounter_id NOT IN ('ENC-001','ENC-005','ENC-006','ENC-008','ENC-011','ENC-012');

    DELETE FROM encounters
    WHERE id NOT IN ('ENC-001','ENC-005','ENC-006','ENC-008','ENC-011','ENC-012');

    UPDATE encounters
    SET scheduled_at='2026-09-22T08:30:00+08:00'
    WHERE id='ENC-001';

    UPDATE encounters
    SET scheduled_at='2026-09-22T09:30:00+08:00'
    WHERE id='ENC-005';

    UPDATE encounters
    SET scheduled_at='2026-09-23T09:20:00+08:00'
    WHERE id='ENC-006';
  `,
};
