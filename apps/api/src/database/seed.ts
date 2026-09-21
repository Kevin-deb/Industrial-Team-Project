import type { DatabaseSync } from 'node:sqlite';
import { hashSecret } from '../platform/auth.js';

export const DEMO_DOCTOR_ID = 'doctor-demo-001';
export const DEMO_DATE = '2026-09-10';

function hasTable(db: DatabaseSync, table: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

/** Fixed synthetic fixtures; never call provider adapters or imply that notifications were sent. */
export function seedDemo(db: DatabaseSync): void {
  if (db.prepare('SELECT id FROM identities WHERE id=?').get(DEMO_DOCTOR_ID)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const identity = db.prepare(
      'INSERT INTO identities(id,display_name,title,department,hospital,avatar_initials) VALUES(?,?,?,?,?,?)',
    );
    identity.run(DEMO_DOCTOR_ID, '林知远', '主任医师', '全科医学科', '云栖医养示范中心', '林');
    identity.run('doctor-demo-002', '周明', '副主任医师', '心血管内科', '云栖医养示范中心', '周');
    identity.run('doctor-demo-003', '许清', '主治医师', '内分泌科', '云栖医养示范中心', '许');
    db.prepare('INSERT INTO roles VALUES(?,?)').run('attending', 'demo-attending');
    db.prepare('INSERT INTO identity_roles VALUES(?,?)').run(DEMO_DOCTOR_ID, 'attending');
    for (const permission of [
      'patient:read',
      'patient:write',
      'clinical:read',
      'clinical:review',
      'encounter:read',
      'health:read',
      'audit:self',
    ])
      db.prepare('INSERT INTO role_permissions VALUES(?,?)').run('attending', permission);
    const insertPatient = db.prepare(`INSERT INTO patients(
      id,name,gender,age,phone,diagnosis,tags_json,status,last_visit,next_follow_up,assigned_doctor_id,allergies_json,medical_history_json,care_summary
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const patients = [
      [
        'PAT-001',
        '陈建国',
        '男',
        68,
        '138****0021',
        '高血压',
        ['慢病管理', '高血压'],
        'attention',
        '2026-09-08',
        '2026-09-10',
        ['青霉素'],
        ['高血压病史 8 年', '近两日自述头晕'],
        '监测数据待医生复核；本条为合成演示资料。',
      ],
      [
        'PAT-002',
        '王秀英',
        '女',
        72,
        '139****0316',
        '2 型糖尿病',
        ['糖尿病', '定期随访'],
        'follow-up',
        '2026-09-07',
        '2026-09-10',
        [],
        ['2 型糖尿病病史 6 年', '近期自述乏力'],
        '随访与健康数据评估待开展；本条为合成演示资料。',
      ],
      [
        'PAT-003',
        '李志明',
        '男',
        65,
        '137****1809',
        '高血压',
        ['高血压', '健康监测'],
        'stable',
        '2026-09-09',
        '2026-09-17',
        [],
        ['高血压病史 3 年'],
        '健康趋势展示案例；本条为合成演示资料。',
      ],
      [
        'PAT-004',
        '张淑兰',
        '女',
        76,
        '136****0718',
        '冠心病',
        ['冠心病', '重点关注'],
        'attention',
        '2026-09-06',
        '2026-09-11',
        ['磺胺类'],
        ['冠心病病史 5 年', '间歇性胸闷待评估'],
        '拟多学科资料讨论；本条为合成演示资料。',
      ],
      [
        'PAT-005',
        '刘桂芬',
        '女',
        63,
        '135****0425',
        '2 型糖尿病',
        ['糖尿病', '健康计划'],
        'stable',
        '2026-09-08',
        '2026-09-18',
        [],
        ['2 型糖尿病病史 2 年'],
        '健康计划页面示例；本条为合成演示资料。',
      ],
      [
        'PAT-006',
        '赵德华',
        '男',
        70,
        '138****0652',
        '慢性阻塞性肺疾病',
        ['呼吸健康', '定期随访'],
        'follow-up',
        '2026-09-05',
        '2026-09-12',
        [],
        ['慢性阻塞性肺疾病病史 4 年', '偶有咳嗽'],
        '图文问诊排期示例；本条为合成演示资料。',
      ],
      [
        'PAT-007',
        '孙雅琴',
        '女',
        67,
        '139****0723',
        '骨关节炎',
        ['康复管理', '健康计划'],
        'stable',
        '2026-09-04',
        '2026-09-19',
        [],
        ['膝骨关节炎病史 3 年'],
        '康复资料占位案例；本条为合成演示资料。',
      ],
      [
        'PAT-008',
        '黄文海',
        '男',
        74,
        '137****0809',
        '高血压',
        ['高血压', '定期随访'],
        'follow-up',
        '2026-09-03',
        '2026-09-13',
        [],
        ['高血压病史 10 年'],
        '常规复查排期示例；本条为合成演示资料。',
      ],
    ] as const;
    for (const p of patients) {
      insertPatient.run(
        p[0],
        p[1],
        p[2],
        p[3],
        p[4],
        p[5],
        JSON.stringify(p[6]),
        p[7],
        p[8],
        p[9],
        DEMO_DOCTOR_ID,
        JSON.stringify(p[10]),
        JSON.stringify(p[11]),
        p[12],
      );
      db.prepare('INSERT INTO patient_archive_versions VALUES(?,?,?,?,?,?,?)').run(
        'archive-' + p[0],
        p[0],
        1,
        JSON.stringify({ diagnosis: p[5], synthetic: true }),
        DEMO_DOCTOR_ID,
        '2026-09-01T00:00:00.000Z',
        'Synthetic demonstration baseline',
      );
    }
    insertPatient.run(
      'PAT-RESTRICTED',
      '范围外演示患者',
      '女',
      60,
      '***',
      '范围隔离测试',
      '[]',
      'stable',
      '2026-09-01',
      '2026-09-20',
      'doctor-demo-002',
      '[]',
      '[]',
      '仅用于验证数据权限。',
    );
    const encounter = db.prepare(
      'INSERT INTO encounters(id,patient_id,doctor_id,type,status,scheduled_at,reason,duration_minutes) VALUES(?,?,?,?,?,?,?,?)',
    );
    encounter.run(
      'ENC-001',
      'PAT-001',
      DEMO_DOCTOR_ID,
      'video',
      'waiting',
      '2026-09-22T08:30:00+08:00',
      '血压监测随访',
      20,
    );
    encounter.run(
      'ENC-005',
      'PAT-004',
      DEMO_DOCTOR_ID,
      'video',
      'waiting',
      '2026-09-22T09:30:00+08:00',
      '胸闷症状复查',
      20,
    );
    encounter.run(
      'ENC-006',
      'PAT-005',
      DEMO_DOCTOR_ID,
      'text',
      'waiting',
      '2026-09-23T09:20:00+08:00',
      '饮食运动计划调整',
      15,
    );
    encounter.run(
      'ENC-008',
      'PAT-001',
      DEMO_DOCTOR_ID,
      'text',
      'completed',
      '2026-09-08T16:00:00+08:00',
      '家庭血压记录复核',
      15,
    );
    encounter.run(
      'ENC-011',
      'PAT-003',
      DEMO_DOCTOR_ID,
      'video',
      'completed',
      '2026-09-07T09:00:00+08:00',
      '头晕症状随访',
      20,
    );
    encounter.run(
      'ENC-012',
      'PAT-004',
      DEMO_DOCTOR_ID,
      'text',
      'waiting',
      '2026-09-21T08:00:00+08:00',
      '冠心病用药答疑',
      15,
    );
    seedOnlineCareDemo(db);
    const record = db.prepare(
      'INSERT INTO medical_records(id,patient_id,title,diagnosis,status,author_id,updated_at,version,archived_at) VALUES(?,?,?,?,?,?,?,?,?)',
    );
    const records = [
      [
        'REC-001',
        'PAT-001',
        '高血压随访记录',
        '高血压',
        'draft',
        DEMO_DOCTOR_ID,
        '2026-09-10T08:45:00+08:00',
      ],
      [
        'REC-002',
        'PAT-002',
        '血糖复查记录',
        '2 型糖尿病',
        'pending-review',
        'doctor-demo-003',
        '2026-09-09T16:20:00+08:00',
      ],
      [
        'REC-003',
        'PAT-004',
        '心血管专科病历',
        '冠心病',
        'pending-review',
        'doctor-demo-002',
        '2026-09-09T14:10:00+08:00',
      ],
      [
        'REC-004',
        'PAT-003',
        '慢病随访归档',
        '高血压',
        'archived',
        'doctor-demo-003',
        '2026-09-08T11:00:00+08:00',
      ],
      [
        'REC-005',
        'PAT-005',
        '饮食运动计划随访',
        '糖尿病前期管理',
        'draft',
        DEMO_DOCTOR_ID,
        '2026-09-02T10:20:00+08:00',
      ],
    ];
    const hasClinicalTemplateVersion = !!db
      .prepare(
        "SELECT 1 FROM pragma_table_info('medical_record_versions') WHERE name='template_version'",
      )
      .get();
    for (const r of records) {
      record.run(...r, 1, r[4] === 'archived' ? r[6]! : null);
      if (hasClinicalTemplateVersion)
        db.prepare(
          `INSERT INTO medical_record_versions(
            id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason,
            template_version,title,diagnosis
          ) VALUES(?,?,?,?,?,?,?,NULL,1,?,?)`,
        ).run(
          'version-' + r[0],
          r[0]!,
          1,
          'followup',
          JSON.stringify({
            followUpPurpose: '仅用于演示，非临床病历',
            healthMonitoringData: '',
            currentMedicationAndAdherence: '',
            lifestyleAndCare: '',
            nextFollowUpArrangement: '',
          }),
          r[5]!,
          r[6]!,
          r[2]!,
          r[3]!,
        );
      else
        db.prepare(
          `INSERT INTO medical_record_versions(
            id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason
          ) VALUES(?,?,?,?,?,?,?,NULL)`,
        ).run(
          'version-' + r[0],
          r[0]!,
          1,
          'general-followup-v1',
          JSON.stringify({ chiefComplaint: '仅用于演示，非临床病历', synthetic: true }),
          r[5]!,
          r[6]!,
        );
    }
    db.prepare('INSERT INTO record_reviews VALUES(?,?,?,?,?,?,?)').run(
      'REV-001',
      'REC-004',
      1,
      DEMO_DOCTOR_ID,
      'approved',
      '合成归档示例',
      '2026-09-08T11:00:00+08:00',
    );
    db.prepare('INSERT INTO medical_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(
      'ORD-001',
      'REC-001',
      'PAT-001',
      'examination',
      'draft',
      1,
      DEMO_DOCTOR_ID,
      '2026-09-10T08:45:00+08:00',
      null,
      null,
    );
    const hasOrderTemplateColumns = !!db
      .prepare("SELECT 1 FROM pragma_table_info('medical_order_versions') WHERE name='template_id'")
      .get();
    const orderPayload = JSON.stringify({
      examName: '检查医嘱占位示例',
      bodySite: '',
      indication: '仅用于演示，非临床医嘱',
      notes: '',
    });
    if (hasOrderTemplateColumns)
      db.prepare(
        `INSERT INTO medical_order_versions(
          id,order_id,version,payload_json,authored_by,authored_at,change_reason,template_id,template_version
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        'ORDV-001',
        'ORD-001',
        1,
        orderPayload,
        DEMO_DOCTOR_ID,
        '2026-09-10T08:45:00+08:00',
        'Synthetic scaffold',
        'examination',
        1,
      );
    else
      db.prepare('INSERT INTO medical_order_versions VALUES(?,?,?,?,?,?,?)').run(
        'ORDV-001',
        'ORD-001',
        1,
        orderPayload,
        DEMO_DOCTOR_ID,
        '2026-09-10T08:45:00+08:00',
        'Synthetic scaffold',
      );
    const consultation = db.prepare(
      'INSERT INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary) VALUES(?,?,?,?,?,?,?,?)',
    );
    consultation.run(
      'CON-001',
      'PAT-004',
      DEMO_DOCTOR_ID,
      '老年心血管多学科会诊',
      '心血管内科 · 全科医学',
      'scheduled',
      '2026-09-10T15:00:00+08:00',
      '展示会诊资料、专家协作与报告草稿的未来工作流程。',
    );
    consultation.run(
      'CON-002',
      'PAT-002',
      DEMO_DOCTOR_ID,
      '糖尿病综合健康评估',
      '内分泌科 · 全科医学',
      'requested',
      '2026-09-11T10:00:00+08:00',
      '申请、临时授权和专家确认将在后续迭代实现。',
    );
    for (const pair of [
      ['CON-001', DEMO_DOCTOR_ID],
      ['CON-001', 'doctor-demo-002'],
      ['CON-002', DEMO_DOCTOR_ID],
      ['CON-002', 'doctor-demo-003'],
    ])
      db.prepare(
        'INSERT INTO consultation_participants(consultation_id,identity_id,participant_role) VALUES(?,?,?)',
      ).run(pair[0]!, pair[1]!, 'expert');
    if (hasTable(db, 'consultation_material_uploads')) {
      const consultationMaterial = db.prepare(
        `INSERT OR IGNORE INTO consultation_material_uploads(
          id,consultation_id,title,description,file_name,uploaded_by,uploaded_at
        ) VALUES(?,?,?,?,?,?,?)`,
      );
      for (const material of [
        ['CMU-001', 'CON-001', '近三个月血压趋势', '患者家庭血压监测汇总。', '近三个月血压趋势.txt', DEMO_DOCTOR_ID, '2026-09-10T09:00:00+08:00'],
        ['CMU-002', 'CON-001', '心电图摘要', '近期心电图核心结论。', '心电图摘要.txt', DEMO_DOCTOR_ID, '2026-09-10T09:05:00+08:00'],
        ['CMU-003', 'CON-001', '当前用药清单', '患者现用药物与剂量。', '当前用药清单.txt', DEMO_DOCTOR_ID, '2026-09-10T09:10:00+08:00'],
        ['CMU-004', 'CON-002', '血糖监测记录', '近两周空腹与餐后血糖。', '血糖监测记录.txt', DEMO_DOCTOR_ID, '2026-09-10T10:00:00+08:00'],
        ['CMU-005', 'CON-002', '饮食运动记录', '患者近期饮食与运动摘要。', '饮食运动记录.txt', DEMO_DOCTOR_ID, '2026-09-10T10:05:00+08:00'],
      ])
        consultationMaterial.run(...material);
    }
    if (hasTable(db, 'consultation_messages')) {
      const consultationMessage = db.prepare(
        'INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at) VALUES(?,?,?,?,?)',
      );
      consultationMessage.run(
        'CMSG-001',
        'CON-001',
        'doctor-demo-002',
        '建议先核对近期指标和当前用药，再形成联合意见。',
        '2026-09-10T15:05:00+08:00',
      );
      consultationMessage.run(
        'CMSG-002',
        'CON-001',
        DEMO_DOCTOR_ID,
        '已打开本次会诊材料，等待各专科补充意见。',
        '2026-09-10T15:07:00+08:00',
      );
    }
    const obs = db.prepare(
      'INSERT INTO health_observations(id,patient_id,metric,value,unit,measured_at,received_at,source,source_label) VALUES(?,?,?,?,?,?,?,?,?)',
    );
    const systolic = [138, 142, 136, 145, 141, 148, 152];
    const diastolic = [82, 85, 81, 86, 84, 89, 92];
    for (let day = 0; day < 7; day++) {
      const date = '2026-09-' + String(4 + day).padStart(2, '0');
      obs.run(
        'OBS-S-' + day,
        'PAT-001',
        'systolic',
        systolic[day]!,
        'mmHg',
        date + 'T07:30:00+08:00',
        date + 'T07:31:00+08:00',
        'synthetic-demo',
        '模拟家用设备 · 合成数据',
      );
      obs.run(
        'OBS-D-' + day,
        'PAT-001',
        'diastolic',
        diastolic[day]!,
        'mmHg',
        date + 'T07:30:00+08:00',
        date + 'T07:31:00+08:00',
        'synthetic-demo',
        '模拟家用设备 · 合成数据',
      );
      obs.run(
        'OBS-G-' + day,
        'PAT-002',
        'glucose',
        [6.8, 7.1, 6.9, 7.3, 7.6, 7.2, 7.8][day]!,
        'mmol/L',
        date + 'T07:00:00+08:00',
        date + 'T07:01:00+08:00',
        'synthetic-demo',
        '模拟患者上传 · 合成数据',
      );
    }
    const alert = db.prepare(
      'INSERT INTO health_alerts(id,patient_id,metric,value,severity,measured_at,source_label,description) VALUES(?,?,?,?,?,?,?,?)',
    );
    alert.run(
      'ALT-001',
      'PAT-001',
      '血压',
      '152/92 mmHg',
      'attention',
      '2026-09-10T07:30:00+08:00',
      '模拟家用设备 · 合成数据',
      '演示关注项，阈值规则与临床评估尚未启用。',
    );
    alert.run(
      'ALT-002',
      'PAT-002',
      '空腹血糖',
      '7.8 mmol/L',
      'review',
      '2026-09-10T07:00:00+08:00',
      '模拟患者上传 · 合成数据',
      '演示待复核项，不构成自动诊断或治疗建议。',
    );
    const plan = db.prepare(`INSERT INTO care_plans(
      id,patient_id,doctor_id,title,status,goals_json,next_review,completion_percent
    ) VALUES(?,?,?,?,?,?,?,?)`);
    plan.run(
      'PLAN-001',
      'PAT-001',
      DEMO_DOCTOR_ID,
      '血压随访管理',
      'active',
      JSON.stringify(['监测记录示例', '医生定期评估']),
      '2026-09-17',
      71,
    );
    plan.run(
      'PLAN-002',
      'PAT-002',
      DEMO_DOCTOR_ID,
      '血糖健康管理',
      'active',
      JSON.stringify(['健康打卡示例', '随访安排示例']),
      '2026-09-15',
      57,
    );
    plan.run(
      'PLAN-003',
      'PAT-007',
      DEMO_DOCTOR_ID,
      '康复随访计划',
      'draft',
      JSON.stringify(['待医生制定个性化目标']),
      '2026-09-19',
      0,
    );
    for (const [index, pid] of ['PAT-001', 'PAT-002', 'PAT-006'].entries())
      db.prepare(
        'INSERT INTO reminder_tasks(id,patient_id,channel,template_id,scheduled_at,status,idempotency_key) VALUES(?,?,?,?,?,?,?)',
      ).run(
        'REM-' + index,
        pid,
        'in-app',
        'followup-demo',
        '2026-09-11T09:00:00+08:00',
        'planned',
        'demo-reminder-' + index,
      );
    const audit = db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?)');
    audit.run(
      'AUD-001',
      DEMO_DOCTOR_ID,
      'demo.record.view',
      'medical-record',
      'REC-001',
      '2026-09-10T08:45:00+08:00',
      'success',
      '演示事件：查看病历草稿',
    );
    audit.run(
      'AUD-002',
      DEMO_DOCTOR_ID,
      'demo.patient.view',
      'patient',
      'PAT-001',
      '2026-09-10T08:30:00+08:00',
      'success',
      '演示事件：查看患者档案',
    );
    audit.run(
      'AUD-003',
      DEMO_DOCTOR_ID,
      'demo.consultation.preview',
      'consultation',
      'CON-001',
      '2026-09-10T08:15:00+08:00',
      'planned',
      '演示事件：远程会诊流程待上线',
    );
    audit.run(
      'AUD-PRIVATE',
      'doctor-demo-002',
      'demo.patient.view',
      'patient',
      'PAT-RESTRICTED',
      '2026-09-10T08:00:00+08:00',
      'success',
      '其他医生的演示事件，不应返回当前会话',
    );
    db.prepare('INSERT INTO social_preferences VALUES(?,?,?,?)').run(
      DEMO_DOCTOR_ID,
      1,
      1,
      '2026-09-10T00:00:00+08:00',
    );
    for (const id of ['community', 'rtc', 'identity', 'notifications', 'hospital-sync'])
      db.prepare('INSERT INTO feature_settings(id,enabled,updated_at) VALUES(?,?,?)').run(
        id,
        0,
        '2026-09-10T00:00:00+08:00',
      );
    db.exec(
      "UPDATE patients SET allergy_status='recorded' WHERE json_array_length(allergies_json)>0",
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function seedOnlineCareDemo(db: DatabaseSync): void {
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='encounter_clinical_briefs'").get())
    return;
  db.exec(`
    INSERT OR IGNORE INTO encounter_clinical_briefs VALUES
      ('ENC-001','近两日反复偏头痛','患者自述右侧颞部搏动性疼痛，午后明显，偶有恶心，无肢体麻木或言语不清。','高血压病史3年，平时血压控制尚可。','否认重大手术史。','间断服用苯磺酸氨氯地平片。','否认药物及食物过敏史。'),
      ('ENC-005','胸闷症状复查','患者近一周活动后偶有胸闷，休息后可缓解，无明显出汗或晕厥。','冠心病病史5年。','否认近期手术史。','规律服用抗血小板及降脂药物。','磺胺类过敏史。'),
      ('ENC-006','饮食运动计划调整','近期餐后血糖较前波动，患者希望调整饮食和步行计划。','糖尿病前期管理中。','否认重大手术史。','暂未使用降糖药。','否认明确过敏史。'),
      ('ENC-008','家庭血压记录复核','患者提交一周家庭血压记录，晨起血压偶有升高。','高血压病史8年。','否认重大手术史。','规律服用降压药。','青霉素过敏史。'),
      ('ENC-011','头晕症状随访','患者偶有头晕，改变体位时明显，无肢体无力或言语不清。','高脂血症病史。','胆囊切除术后。','规律服用他汀类药物。','否认明确过敏史。'),
      ('ENC-012','冠心病用药答疑','患者咨询抗血小板药物服用注意事项，近期无黑便或明显出血。','冠心病病史5年。','否认近期手术史。','服用阿司匹林及他汀类药物。','磺胺类过敏史。');

    INSERT OR IGNORE INTO encounter_saved_records VALUES
      ('ESR-ENC-008-001','ENC-008','本次问诊记录','2026-09-08T16:40:00+08:00','text',12,1,0),
      ('ESR-ENC-011-001','ENC-011','本次问诊记录','2026-09-07T09:25:00+08:00','video',6,1,1);

    INSERT OR IGNORE INTO encounter_availability_windows VALUES
      ('AW-001','doctor-demo-001','2026-09-21','text','08:00','20:00',8,3),
      ('AW-002','doctor-demo-001','2026-09-21','video','09:00','11:30',6,2),
      ('AW-003','doctor-demo-001','2026-09-22','video','14:00','17:00',5,1);

    INSERT OR IGNORE INTO encounter_notices VALUES
      ('NOTICE-001','ENC-012','按时进入提醒','已提醒患者在服务窗口内保持在线。','已发送',NULL,'2026-09-21T09:00:00+08:00');

    INSERT OR IGNORE INTO encounter_messages(id,encounter_id,sender_identity_id,sender_patient_id,body,sent_at,sender_role,image_url,image_name)
    SELECT 'MSG-' || id || '-P1', id, NULL, patient_id,
      CASE WHEN type='text' THEN '医生您好，我想咨询一下：' || reason || '。' ELSE '医生您好，我已准备好视频问诊。' END,
      scheduled_at, 'patient', NULL, NULL
    FROM encounters;

    INSERT OR IGNORE INTO encounter_messages(id,encounter_id,sender_identity_id,sender_patient_id,body,sent_at,sender_role,image_url,image_name)
    SELECT 'MSG-' || id || '-S1', id, doctor_id, NULL,
      CASE WHEN type='text' THEN '图文问诊已开始，本次服务窗口为48h。' ELSE '视频问诊待呼叫，系统将同时连接医生与患者。' END,
      scheduled_at, 'system', NULL, NULL
    FROM encounters;
  `);
}

/** Additive login/profile fixtures run after social identities exist; safe for upgraded databases. */
export function seedAuthFoundation(db: DatabaseSync): void {
  const at = '2026-09-01T00:00:00.000Z';
  const clinicians = [
    ['doctor-demo-001', 'lin.zhiyuan', 'lin.zhiyuan@carelink.demo', 'DEMO-LIC-001', '全科医学', '13800000001', '1001'],
    ['doctor-demo-002', 'zhou.ming', 'zhou.ming@carelink.demo', 'DEMO-LIC-002', '心血管内科', '13800000002', '1002'],
    ['doctor-demo-003', 'xu.qing', 'xu.qing@carelink.demo', 'DEMO-LIC-003', '内分泌科', '13800000003', '1003'],
    ['doctor-demo-004', 'liang.ruochuan', 'liang.ruochuan@carelink.demo', 'DEMO-LIC-004', '老年医学', '13800000004', '1004'],
    ['doctor-demo-005', 'shen.anning', 'shen.anning@carelink.demo', 'DEMO-LIC-005', '呼吸与重症医学', '13800000005', '1005'],
  ] as const;
  db.exec('BEGIN IMMEDIATE');
  try {
    const doctor = db.prepare(
      `INSERT OR IGNORE INTO doctors(identity_id,license_number,specialty,phone,government_id_type,government_id_masked,credential_status,personnel_status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    );
    const user = db.prepare(
      `INSERT OR IGNORE INTO users(id,identity_id,username,email,email_verified_at,password_hash,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    );
    for (const [identityId, username, email, license, specialty, phone, suffix] of clinicians) {
      doctor.run(
        identityId,
        license,
        specialty,
        phone,
        '居民身份证',
        '**************' + suffix,
        'verified',
        'verified',
        at,
        at,
      );
      user.run(
        'user-' + identityId,
        identityId,
        username,
        email,
        at,
        hashSecret('123456', 'carelink-' + identityId),
        at,
        at,
      );
    }

    db.prepare('INSERT OR IGNORE INTO roles VALUES(?,?)').run('expert', 'demo-expert');
    db.prepare('INSERT OR IGNORE INTO roles VALUES(?,?)').run('admin', 'demo-admin');
    for (const permission of ['patient:read', 'clinical:read', 'encounter:read', 'health:read', 'audit:self'])
      db.prepare('INSERT OR IGNORE INTO role_permissions VALUES(?,?)').run('expert', permission);
    db.prepare('INSERT OR IGNORE INTO role_permissions VALUES(?,?)').run('admin', 'accounts:manage');
    for (const identityId of ['doctor-demo-002', 'doctor-demo-003', 'doctor-demo-004'])
      db.prepare('INSERT OR IGNORE INTO identity_roles VALUES(?,?)').run(identityId, 'attending');
    db.prepare('INSERT OR IGNORE INTO identity_roles VALUES(?,?)').run('doctor-demo-005', 'expert');
    db.prepare('INSERT OR IGNORE INTO identity_roles VALUES(?,?)').run('doctor-demo-005', 'admin');

    db.prepare(
      `INSERT OR IGNORE INTO patients(
        id,name,gender,age,phone,diagnosis,tags_json,status,last_visit,next_follow_up,assigned_doctor_id,allergies_json,medical_history_json,care_summary
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      'PAT-009',
      '郭瑞芳',
      '女',
      69,
      '136****0919',
      '慢性心力衰竭',
      JSON.stringify(['心血管', '重点随访']),
      'attention',
      '2026-09-09',
      '2026-09-16',
      'doctor-demo-003',
      JSON.stringify([]),
      JSON.stringify(['慢性心力衰竭病史 2 年']),
      '跨专科协作与权限范围演示；本条为合成资料。',
    );
    db.prepare('INSERT OR IGNORE INTO patient_archive_versions VALUES(?,?,?,?,?,?,?)').run(
      'archive-PAT-009',
      'PAT-009',
      1,
      JSON.stringify({ diagnosis: '慢性心力衰竭', synthetic: true }),
      'doctor-demo-003',
      at,
      'Synthetic demonstration baseline',
    );

    db.prepare(
      'INSERT OR IGNORE INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'CON-IN-001',
      'PAT-004',
      'doctor-demo-002',
      '术后康复联合评估',
      '康复医学科 · 骨科 · 全科医学',
      'requested',
      '2026-09-12T15:30:00+08:00',
      '其他医生发来的会诊申请，需要确认是否参与并查看患者资料。',
    );
    db.prepare(
      'INSERT OR IGNORE INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'CON-IN-002',
      'PAT-005',
      'doctor-demo-003',
      '糖尿病足风险联合会诊',
      '内分泌科 · 全科医学 · 护理管理',
      'requested',
      '2026-09-13T09:30:00+08:00',
      '其他医生邀请当前医生参与糖尿病足风险评估，需要查看资料后确认是否参会。',
    );
    for (const pair of [
      [DEMO_DOCTOR_ID, 'invited'],
      ['doctor-demo-002', 'requester'],
      ['doctor-demo-003', 'expert'],
    ])
      db.prepare(
        'INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role) VALUES(?,?,?)',
      ).run('CON-IN-001', pair[0]!, pair[1]!);
    for (const pair of [
      [DEMO_DOCTOR_ID, 'invited'],
      ['doctor-demo-003', 'requester'],
      ['doctor-demo-002', 'expert'],
    ])
      db.prepare(
        'INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role) VALUES(?,?,?)',
      ).run('CON-IN-002', pair[0]!, pair[1]!);
    for (const material of [
      ['CMU-006', '病情摘要', '术后康复会诊病情摘要。', '病情摘要.txt'],
      ['CMU-007', '检查结果', '影像与实验室检查摘要。', '检查结果.txt'],
      ['CMU-008', '用药记录', '围术期及当前用药记录。', '用药记录.txt'],
    ])
      db.prepare(
        `INSERT OR IGNORE INTO consultation_material_uploads(
          id,consultation_id,title,description,file_name,uploaded_by,uploaded_at
        ) VALUES(?,?,?,?,?,?,?)`,
      ).run(material[0]!, 'CON-IN-001', material[1]!, material[2]!, material[3]!, 'doctor-demo-002', at);
    for (const material of [
      ['CMU-009', '足部照片摘要', '患者足部皮肤状态与破溃风险摘要。', '足部照片摘要.txt'],
      ['CMU-010', '血糖波动记录', '近两周空腹及餐后血糖波动。', '血糖波动记录.txt'],
      ['CMU-011', '护理评估表', '居家足部护理执行情况。', '护理评估表.txt'],
    ])
      db.prepare(
        `INSERT OR IGNORE INTO consultation_material_uploads(
          id,consultation_id,title,description,file_name,uploaded_by,uploaded_at
        ) VALUES(?,?,?,?,?,?,?)`,
      ).run(material[0]!, 'CON-IN-002', material[1]!, material[2]!, material[3]!, 'doctor-demo-003', at);
    db.prepare(
      'INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at) VALUES(?,?,?,?,?)',
    ).run(
      'CMSG-003',
      'CON-IN-001',
      'doctor-demo-002',
      '已提交术后康复资料，请全科协助评估随访计划。',
      '2026-09-11T15:20:00+08:00',
    );
    db.prepare(
      'INSERT OR IGNORE INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at) VALUES(?,?,?,?,?)',
    ).run(
      'CMSG-004',
      'CON-IN-002',
      'doctor-demo-003',
      '患者近期足部麻木加重，邀请全科一起评估综合干预方案。',
      '2026-09-12T16:40:00+08:00',
    );

    const grants = [
      ['grant-d2-p9', 'doctor-demo-002', 'PAT-009'],
      ['grant-d2-p5', 'doctor-demo-002', 'PAT-005'],
      ['grant-d3-p2', 'doctor-demo-003', 'PAT-002'],
      ['grant-d3-p5', 'doctor-demo-003', 'PAT-005'],
      ['grant-d4-p6', 'doctor-demo-004', 'PAT-006'],
      ['grant-d4-p7', 'doctor-demo-004', 'PAT-007'],
      ['grant-d5-p3', 'doctor-demo-005', 'PAT-003'],
      ['grant-d5-p8', 'doctor-demo-005', 'PAT-008'],
    ] as const;
    const grant = db.prepare(
      `INSERT OR IGNORE INTO access_grants(id,identity_id,patient_id,scope,task_id,expires_at,revoked_at,created_at)
       VALUES(?,?,?,'patient:read',NULL,NULL,NULL,?)`,
    );
    for (const [id, identityId, patientId] of grants) grant.run(id, identityId, patientId, at);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
