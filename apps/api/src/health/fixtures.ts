import type { DatabaseSync } from 'node:sqlite';
import { DEMO_DOCTOR_ID } from '../database/seed.js';

const PATIENT_IDS = Array.from(
  { length: 8 },
  (_, index) => `PAT-${String(index + 1).padStart(3, '0')}`,
);
const FIXTURE_NOW = '2026-09-10T12:00:00+08:00';

/** Deterministic, additive E-module fixtures. They never create or update patient records. */
export function seedHealthDemo(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    seedObservations(db);
    seedPlans(db);
    seedAssessments(db);
    seedReminders(db);
    const preference = db.prepare(
      'INSERT OR IGNORE INTO health_notification_preferences(patient_id,enabled,updated_at) VALUES(?,?,?)',
    );
    for (const patientId of PATIENT_IDS) preference.run(patientId, 1, FIXTURE_NOW);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function seedObservations(db: DatabaseSync): void {
  const insert = db.prepare(`INSERT OR IGNORE INTO health_observations(
    id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,external_observation_id,quality_status
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);

  for (const [patientIndex, patientId] of PATIENT_IDS.entries()) {
    for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
      const date = new Date(Date.UTC(2026, 7, 12 + dayIndex)).toISOString().slice(0, 10);
      const suffix = `${patientId}-${String(dayIndex + 1).padStart(2, '0')}`;
      insert.run(
        `OBS-FX-S-${suffix}`,
        patientId,
        'systolic',
        118 + patientIndex * 2 + (dayIndex % 7),
        'mmHg',
        `${date}T07:30:00+08:00`,
        `${date}T07:31:00+08:00`,
        'synthetic-demo',
        '模拟居家设备 · 合成数据',
        `demo-systolic-${suffix}`,
        'demo',
      );
      insert.run(
        `OBS-FX-D-${suffix}`,
        patientId,
        'diastolic',
        72 + patientIndex + (dayIndex % 5),
        'mmHg',
        `${date}T07:30:00+08:00`,
        `${date}T07:31:00+08:00`,
        'synthetic-demo',
        '模拟居家设备 · 合成数据',
        `demo-diastolic-${suffix}`,
        'demo',
      );
      insert.run(
        `OBS-FX-H-${suffix}`,
        patientId,
        'heart-rate',
        66 + patientIndex + (dayIndex % 6),
        'bpm',
        `${date}T07:30:00+08:00`,
        `${date}T07:31:00+08:00`,
        'synthetic-demo',
        '模拟居家设备 · 合成数据',
        `demo-heart-rate-${suffix}`,
        'demo',
      );
      if (patientId === 'PAT-002' || patientId === 'PAT-005') {
        insert.run(
          `OBS-FX-G-${suffix}`,
          patientId,
          'glucose',
          5.8 + patientIndex * 0.1 + (dayIndex % 5) * 0.2,
          'mmol/L',
          `${date}T07:00:00+08:00`,
          `${date}T07:01:00+08:00`,
          'synthetic-demo',
          '模拟患者上传 · 合成数据',
          `demo-glucose-${suffix}`,
          'demo',
        );
      }
    }
  }
}

function seedPlans(db: DatabaseSync): void {
  const planFixtures = [
    [
      'PLAN-004',
      'PAT-003',
      '家庭监测记录',
      'active',
      ['按计划记录', '复诊前整理记录'],
      '2026-09-21',
      45,
    ],
    [
      'PLAN-005',
      'PAT-004',
      '日常健康随访',
      'draft',
      ['完善近期情况', '确认随访时间'],
      '2026-09-22',
      10,
    ],
    [
      'PLAN-006',
      'PAT-005',
      '健康数据回顾',
      'active',
      ['完成健康打卡', '随访时共同回顾'],
      '2026-09-24',
      62,
    ],
    [
      'PLAN-007',
      'PAT-006',
      '呼吸健康记录',
      'active',
      ['记录日常活动情况', '按时参加随访'],
      '2026-09-20',
      50,
    ],
    [
      'PLAN-008',
      'PAT-008',
      '定期随访安排',
      'draft',
      ['确认复查资料', '记录居家测量'],
      '2026-09-25',
      20,
    ],
  ] as const;
  const insertPlan = db.prepare(`INSERT OR IGNORE INTO care_plans(
    id,patient_id,doctor_id,title,status,goals_json,next_review,completion_percent,current_version,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  for (const fixture of planFixtures) {
    insertPlan.run(
      fixture[0],
      fixture[1],
      DEMO_DOCTOR_ID,
      fixture[2],
      fixture[3],
      JSON.stringify(fixture[4]),
      fixture[5],
      fixture[6],
      1,
      '2026-09-01T09:00:00+08:00',
      FIXTURE_NOW,
    );
  }

  const insertVersion = db.prepare(`INSERT OR IGNORE INTO care_plan_versions(
    id,plan_id,version,payload_json,authored_by,created_at
  ) VALUES(?,?,?,?,?,?)`);
  const plans = db
    .prepare(
      `SELECT id,patient_id,title,status,goals_json,next_review,completion_percent,current_version,
    created_at,updated_at FROM care_plans ORDER BY id`,
    )
    .all();
  for (const row of plans) {
    const snapshot = {
      id: String(row.id),
      patientId: String(row.patient_id),
      title: String(row.title),
      status: String(row.status),
      goals: JSON.parse(String(row.goals_json)),
      nextReview: String(row.next_review),
      completionPercent: Number(row.completion_percent),
      version: Number(row.current_version),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
    insertVersion.run(
      `PLANV-${row.id}-1`,
      row.id,
      1,
      JSON.stringify(snapshot),
      DEMO_DOCTOR_ID,
      row.created_at,
    );
  }
}

function seedAssessments(db: DatabaseSync): void {
  const insert = db.prepare(`INSERT OR IGNORE INTO health_assessments(
    id,patient_id,plan_id,assessor_id,assessed_at,summary,recommendations_json,next_review
  ) VALUES(?,?,?,?,?,?,?,?)`);
  const planByPatient = new Map<string, string>(
    db
      .prepare('SELECT patient_id,id FROM care_plans ORDER BY id')
      .all()
      .map((row) => [String(row.patient_id), String(row.id)]),
  );
  for (const [patientIndex, patientId] of PATIENT_IDS.entries()) {
    for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
      const day = String(2 + patientIndex + itemIndex).padStart(2, '0');
      insert.run(
        `ASM-FX-${patientId}-${itemIndex + 1}`,
        patientId,
        planByPatient.get(patientId) ?? null,
        DEMO_DOCTOR_ID,
        `2026-09-${day}T10:00:00+08:00`,
        itemIndex === 0
          ? '已核对近期健康记录，留待下次随访继续观察。'
          : '已与患者确认当前计划执行情况。',
        JSON.stringify(itemIndex === 0 ? ['继续按计划记录健康数据'] : ['按预约时间复诊并携带记录']),
        `2026-09-${String(18 + itemIndex).padStart(2, '0')}`,
      );
    }
  }
}

function seedReminders(db: DatabaseSync): void {
  const insert = db.prepare(`INSERT OR IGNORE INTO reminder_tasks(
    id,patient_id,plan_id,channel,template_id,scheduled_at,status,consent_reference,
    provider_message_id,attempts,last_error,idempotency_key
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const planByPatient = new Map<string, string>(
    db
      .prepare('SELECT patient_id,id FROM care_plans ORDER BY id')
      .all()
      .map((row) => [String(row.patient_id), String(row.id)]),
  );
  for (const [patientIndex, patientId] of PATIENT_IDS.entries()) {
    for (let itemIndex = 0; itemIndex < 3; itemIndex += 1) {
      insert.run(
        `REM-FX-${patientId}-${itemIndex + 1}`,
        patientId,
        planByPatient.get(patientId) ?? null,
        'in-app',
        itemIndex === 0 ? 'followup-demo' : 'health-record-demo',
        `2026-09-${String(14 + itemIndex).padStart(2, '0')}T${String(9 + (patientIndex % 3)).padStart(2, '0')}:00:00+08:00`,
        'planned',
        'synthetic-consent-reference',
        null,
        0,
        null,
        `fixture-reminder-${patientId}-${itemIndex + 1}`,
      );
    }
  }
}
