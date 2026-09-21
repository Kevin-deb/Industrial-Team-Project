export const onlineCareTypicalLinkMigration = {
  version: 28,
  name: 'online_care_typical_clinical_link',
  sql: `
    INSERT OR IGNORE INTO encounters(id,patient_id,doctor_id,type,status,scheduled_at,reason,duration_minutes)
      SELECT 'ENC-001','PAT-001','doctor-demo-001','video','waiting','2026-09-22T08:30:00+08:00','血压监测随访',20
      WHERE EXISTS (SELECT 1 FROM patients WHERE id='PAT-001')
        AND EXISTS (SELECT 1 FROM identities WHERE id='doctor-demo-001');

    INSERT OR IGNORE INTO encounter_clinical_briefs
      SELECT 'ENC-001','近两日反复偏头痛','患者自述右侧颞部搏动性疼痛，午后明显，偶有恶心，无肢体麻木或言语不清。','高血压病史3年，平时血压控制尚可。','否认重大手术史。','间断服用苯磺酸氨氯地平片。','否认药物及食物过敏史。'
      WHERE EXISTS (SELECT 1 FROM encounters WHERE id='ENC-001');

    INSERT OR IGNORE INTO encounter_messages(
      id,encounter_id,sender_identity_id,sender_patient_id,body,sent_at,sender_role,image_url,image_name
    )
      SELECT 'MSG-ENC-001-P1','ENC-001',NULL,'PAT-001','医生您好，我已准备好视频问诊。','2026-09-22T08:30:00+08:00','patient',NULL,NULL
      WHERE EXISTS (SELECT 1 FROM encounters WHERE id='ENC-001');

    INSERT OR IGNORE INTO encounter_messages(
      id,encounter_id,sender_identity_id,sender_patient_id,body,sent_at,sender_role,image_url,image_name
    )
      SELECT 'MSG-ENC-001-S1','ENC-001','doctor-demo-001',NULL,'视频问诊待呼叫，系统将同时连接医生与患者。','2026-09-22T08:30:00+08:00','system',NULL,NULL
      WHERE EXISTS (SELECT 1 FROM encounters WHERE id='ENC-001');
  `,
};
