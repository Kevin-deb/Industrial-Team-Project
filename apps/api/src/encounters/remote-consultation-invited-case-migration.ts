export const remoteConsultationInvitedCaseMigration = {
  version: 31,
  name: 'remote_consultation_invited_case',
  sql: `
    INSERT OR IGNORE INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary)
    SELECT 'CON-IN-002','PAT-005','doctor-demo-003','糖尿病足风险联合会诊','内分泌科 · 全科医学 · 护理管理','requested','2026-09-13T09:30:00+08:00','其他医生邀请当前医生参与糖尿病足风险评估，需要查看资料后确认是否参会。'
    WHERE EXISTS(SELECT 1 FROM patients WHERE id='PAT-005');

    INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role)
    SELECT 'CON-IN-002','doctor-demo-001','invited'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');
    INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role)
    SELECT 'CON-IN-002','doctor-demo-003','requester'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');
    INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role)
    SELECT 'CON-IN-002','doctor-demo-002','reviewer'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');

    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-009','CON-IN-002','足部照片摘要','患者足部皮肤状态与破溃风险摘要。','足部照片摘要.txt','doctor-demo-003','2026-09-12T16:20:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-010','CON-IN-002','血糖波动记录','近两周空腹及餐后血糖波动。','血糖波动记录.txt','doctor-demo-003','2026-09-12T16:25:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');
    INSERT OR IGNORE INTO consultation_material_uploads(id,consultation_id,title,description,file_name,uploaded_by,uploaded_at)
    SELECT 'CMU-011','CON-IN-002','护理评估表','居家足部护理执行情况。','护理评估表.txt','doctor-demo-003','2026-09-12T16:30:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');

    INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at)
    SELECT 'CMSG-004','CON-IN-002','doctor-demo-003','患者近期足部麻木加重，邀请全科一起评估综合干预方案。','2026-09-12T16:40:00+08:00'
    WHERE EXISTS(SELECT 1 FROM consultations WHERE id='CON-IN-002');
  `,
};
