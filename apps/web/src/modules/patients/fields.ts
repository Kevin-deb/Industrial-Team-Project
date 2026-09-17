import type { PatientSnapshot, UpdatePatientRequest } from '@doctor/contracts';

export const patientFields = {
  name: '姓名',
  gender: '性别',
  age: '年龄',
  phone: '联系电话',
  diagnosis: '健康分类',
  tags: '分类标签',
  status: '管理状态',
  symptoms: '症状',
  allergies: '过敏史',
  allergyStatus: '过敏状态',
  medicalHistory: '既往病史',
  careSummary: '照护摘要',
} as const;
export const statusLabels = { stable: '状态平稳', attention: '需要关注', 'follow-up': '待随访' };
export const statusTones = { stable: 'teal', attention: 'amber', 'follow-up': 'blue' } as const;
export const allergyLabels = { unknown: '尚未确认', none: '已确认无过敏', recorded: '有过敏记录' };
export const parseLines = (value: string) => [
  ...new Set(
    value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export function archiveChanges(before: PatientSnapshot, after: PatientSnapshot) {
  return (Object.keys(patientFields) as (keyof typeof patientFields)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}
export function editableFields(
  patient: PatientSnapshot,
): Omit<UpdatePatientRequest, 'changeReason'> {
  return {
    name: patient.name,
    gender: patient.gender,
    age: patient.age,
    phone: patient.phone,
    diagnosis: patient.diagnosis,
    tags: patient.tags,
    status: patient.status,
    symptoms: patient.symptoms,
    allergies: patient.allergies,
    allergyStatus: patient.allergyStatus,
    medicalHistory: patient.medicalHistory,
    careSummary: patient.careSummary,
  };
}
