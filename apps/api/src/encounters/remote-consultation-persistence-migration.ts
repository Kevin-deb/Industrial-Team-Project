export const remoteConsultationPersistenceMigration = {
  version: 30,
  name: 'remote_consultation_persistence',
  sql: `
    CREATE TABLE consultation_messages (
      id TEXT PRIMARY KEY,
      consultation_id TEXT NOT NULL REFERENCES consultations(id),
      sender_identity_id TEXT NOT NULL REFERENCES identities(id),
      body TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      image_url TEXT,
      image_name TEXT
    );
    CREATE INDEX consultation_messages_time ON consultation_messages(consultation_id,sent_at,id);

    CREATE TABLE consultation_material_uploads (
      id TEXT PRIMARY KEY,
      consultation_id TEXT NOT NULL REFERENCES consultations(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      file_name TEXT NOT NULL,
      object_url TEXT,
      uploaded_by TEXT NOT NULL REFERENCES identities(id),
      uploaded_at TEXT NOT NULL
    );
    CREATE INDEX consultation_material_uploads_task ON consultation_material_uploads(consultation_id,uploaded_at DESC,id);

    INSERT OR IGNORE INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary)
    SELECT 'CON-IN-001','PAT-004','doctor-demo-002','术后康复联合评估','康复医学科 · 骨科 · 全科医学','requested','2026-09-12T15:30:00+08:00','其他医生发来的会诊申请，需要确认是否参与并查看患者资料。'
    WHERE EXISTS(SELECT 1 FROM patients WHERE id='PAT-004');

    INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role)
    SELECT 'CON-IN-001','doctor-demo-001','invited'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');
    INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role)
    SELECT 'CON-IN-001','doctor-demo-002','reviewer'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');
    INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role)
    SELECT 'CON-IN-001','doctor-demo-003','expert'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');

    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-001','CON-001','近三个月血压趋势','患者家庭血压监测汇总。','近三个月血压趋势.txt','doctor-demo-001','2026-09-10T09:00:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-001');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-002','CON-001','心电图摘要','近期心电图核心结论。','心电图摘要.txt','doctor-demo-001','2026-09-10T09:05:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-001');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-003','CON-001','当前用药清单','患者现用药物与剂量。','当前用药清单.txt','doctor-demo-001','2026-09-10T09:10:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-001');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-004','CON-002','血糖监测记录','近两周空腹与餐后血糖。','血糖监测记录.txt','doctor-demo-001','2026-09-10T10:00:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-002');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-005','CON-002','饮食运动记录','患者近期饮食与运动摘要。','饮食运动记录.txt','doctor-demo-001','2026-09-10T10:05:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-002');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-006','CON-IN-001','病情摘要','术后康复会诊病情摘要。','病情摘要.txt','doctor-demo-002','2026-09-11T15:00:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-007','CON-IN-001','检查结果','影像与实验室检查摘要。','检查结果.txt','doctor-demo-002','2026-09-11T15:05:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-008','CON-IN-001','用药记录','围术期及当前用药记录。','用药记录.txt','doctor-demo-002','2026-09-11T15:10:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');

    INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at)
    SELECT 'CMSG-001','CON-001','doctor-demo-002','建议先核对近期指标和当前用药，再形成联合意见。','2026-09-10T15:05:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-001');
    INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at)
    SELECT 'CMSG-002','CON-001','doctor-demo-001','已打开本次会诊材料，等待各专科补充意见。','2026-09-10T15:07:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-001');
    INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at)
    SELECT 'CMSG-003','CON-IN-001','doctor-demo-002','已提交术后康复资料，请全科协助评估随访计划。','2026-09-11T15:20:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-001');
  `,
};
