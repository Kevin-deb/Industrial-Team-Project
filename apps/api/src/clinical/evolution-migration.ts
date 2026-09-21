export const clinicalEvolutionMigration = {
  version: 17,
  name: 'clinical_template_catalogue_and_record_history',
  sql: `
    ALTER TABLE medical_record_versions ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1 CHECK(template_version>0);
    ALTER TABLE medical_record_versions ADD COLUMN title TEXT;
    ALTER TABLE medical_record_versions ADD COLUMN diagnosis TEXT;

    UPDATE medical_record_versions
    SET template_id='followup',
        body_json='{"followUpPurpose":"仅用于演示，非临床病历","healthMonitoringData":"","currentMedicationAndAdherence":"","lifestyleAndCare":"","nextFollowUpArrangement":""}'
    WHERE template_id='general-followup-v1';

    UPDATE medical_record_versions
    SET title=(SELECT r.title FROM medical_records r WHERE r.id=medical_record_versions.record_id),
        diagnosis=(SELECT r.diagnosis FROM medical_records r WHERE r.id=medical_record_versions.record_id)
    WHERE title IS NULL OR diagnosis IS NULL;

    CREATE INDEX clinical_records_patient_updated ON medical_records(patient_id,updated_at DESC);
    CREATE INDEX clinical_records_encounter ON medical_records(encounter_id) WHERE encounter_id IS NOT NULL;
    CREATE INDEX clinical_records_status_updated ON medical_records(status,updated_at DESC);
  `,
};
