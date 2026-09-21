export const onlineCareRecordsAlignmentMigration = {
  version: 29,
  name: 'online_care_records_alignment',
  sql: `
    INSERT OR IGNORE INTO medical_records(
      id,patient_id,encounter_id,title,diagnosis,status,author_id,updated_at,version,archived_at
    )
      SELECT 'REC-005','PAT-005',NULL,'饮食运动计划随访','糖尿病前期管理','draft','doctor-demo-001','2026-09-02T10:20:00+08:00',1,NULL
      WHERE EXISTS (SELECT 1 FROM patients WHERE id='PAT-005')
        AND EXISTS (SELECT 1 FROM identities WHERE id='doctor-demo-001');

    INSERT OR IGNORE INTO medical_record_versions(
      id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason,
      template_version,title,diagnosis
    )
      SELECT 'version-REC-005','REC-005',1,'followup',
        '{"followUpPurpose":"仅用于演示，非临床病历","healthMonitoringData":"","currentMedicationAndAdherence":"","lifestyleAndCare":"","nextFollowUpArrangement":""}',
        'doctor-demo-001','2026-09-02T10:20:00+08:00',NULL,1,'饮食运动计划随访','糖尿病前期管理'
      WHERE EXISTS (SELECT 1 FROM medical_records WHERE id='REC-005');

    DELETE FROM encounter_history_records;
  `,
};
