export const patientsArchiveMigration = {
  version: 15,
  name: 'patients_editable_archives',
  sql: `
    ALTER TABLE patients ADD COLUMN symptoms_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE patients ADD COLUMN allergy_status TEXT NOT NULL DEFAULT 'unknown'
      CHECK(allergy_status IN ('unknown','none','recorded'));
    UPDATE patients SET allergy_status='recorded' WHERE json_array_length(allergies_json)>0;
    CREATE TABLE patient_archive_baselines (
      patient_id TEXT PRIMARY KEY REFERENCES patients(id),
      version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      captured_at TEXT NOT NULL
    );
    INSERT INTO patient_archive_baselines
    SELECT p.id, COALESCE((SELECT MAX(version) FROM patient_archive_versions v WHERE v.patient_id=p.id),1),
      json_object('id',p.id,'name',p.name,'gender',p.gender,'age',p.age,'phone',p.phone,
        'diagnosis',p.diagnosis,'tags',json(p.tags_json),'status',p.status,
        'lastVisit',p.last_visit,'nextFollowUp',p.next_follow_up,'assignedDoctorId',p.assigned_doctor_id,
        'allergies',json(p.allergies_json),'medicalHistory',json(p.medical_history_json),
        'careSummary',p.care_summary,'symptoms',json(p.symptoms_json),'allergyStatus',p.allergy_status,
        'version',COALESCE((SELECT MAX(version) FROM patient_archive_versions v WHERE v.patient_id=p.id),1)),
      strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM patients p;
    INSERT OR IGNORE INTO role_permissions(role_id,permission)
      SELECT DISTINCT role_id,'patient:write' FROM role_permissions
      WHERE permission='patient:read' AND role_id='attending';
  `,
};
