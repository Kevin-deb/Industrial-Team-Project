import type { DatabaseSync } from 'node:sqlite';

export const DEMO_DOCTOR_ID = 'doctor-demo-001';
export const DEMO_DATE = '2026-09-10';

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
      'clinical:read',
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
      '2026-09-10T09:30:00+08:00',
      '血压监测随访',
      20,
    );
    encounter.run(
      'ENC-002',
      'PAT-002',
      DEMO_DOCTOR_ID,
      'text',
      'waiting',
      '2026-09-10T10:00:00+08:00',
      '血糖数据复核',
      15,
    );
    encounter.run(
      'ENC-003',
      'PAT-006',
      DEMO_DOCTOR_ID,
      'video',
      'scheduled',
      '2026-09-10T14:00:00+08:00',
      '呼吸健康随访',
      20,
    );
    encounter.run(
      'ENC-004',
      'PAT-003',
      DEMO_DOCTOR_ID,
      'text',
      'completed',
      '2026-09-09T15:30:00+08:00',
      '常规健康随访',
      15,
    );
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
    ];
    for (const r of records) {
      record.run(...r, 1, r[4] === 'archived' ? r[6]! : null);
      db.prepare('INSERT INTO medical_record_versions VALUES(?,?,?,?,?,?,?,?)').run(
        'version-' + r[0],
        r[0]!,
        1,
        'general-followup-v1',
        JSON.stringify({ chiefComplaint: '仅用于演示，非临床病历', synthetic: true }),
        r[5]!,
        r[6]!,
        null,
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
    db.prepare('INSERT INTO medical_order_versions VALUES(?,?,?,?,?,?,?)').run(
      'ORDV-001',
      'ORD-001',
      1,
      JSON.stringify({ label: '检查医嘱占位示例', synthetic: true }),
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
    const plan = db.prepare('INSERT INTO care_plans VALUES(?,?,?,?,?,?,?,?)');
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
      0,
      0,
      '2026-09-10T00:00:00+08:00',
    );
    for (const id of ['community', 'rtc', 'identity', 'notifications', 'hospital-sync'])
      db.prepare('INSERT INTO feature_settings(id,enabled,updated_at) VALUES(?,?,?)').run(
        id,
        0,
        '2026-09-10T00:00:00+08:00',
      );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
