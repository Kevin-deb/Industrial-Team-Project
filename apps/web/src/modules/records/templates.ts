import type { MedicalRecordTemplateId } from '@doctor/contracts';

export const recordTemplates: {
  id: MedicalRecordTemplateId;
  title: string;
  subtitle: string;
  fields: { key: string; label: string }[];
}[] = [
  {
    id: 'outpatient',
    title: '门诊病历',
    subtitle: '主诉 · 病史 · 诊疗计划',
    fields: [
      { key: 'chiefComplaint', label: '主诉' },
      { key: 'presentIllness', label: '现病史' },
      { key: 'medicalAndAllergyHistory', label: '既往史与过敏史' },
      { key: 'examinationAndInvestigations', label: '查体与辅助检查' },
      { key: 'assessmentAndPlan', label: '评估及诊疗计划' },
    ],
  },
  {
    id: 'followup',
    title: '慢病随访记录',
    subtitle: '健康指标 · 依从性 · 随访',
    fields: [
      { key: 'followUpPurpose', label: '本次随访目的' },
      { key: 'healthMonitoringData', label: '健康监测数据' },
      { key: 'currentMedicationAndAdherence', label: '当前用药与依从性' },
      { key: 'lifestyleAndCare', label: '生活方式与照护情况' },
      { key: 'nextFollowUpArrangement', label: '下次随访安排' },
    ],
  },
  {
    id: 'consult',
    title: '会诊记录',
    subtitle: '会诊目的 · 讨论 · 结论',
    fields: [
      { key: 'consultationRequestAndPurpose', label: '会诊申请与目的' },
      { key: 'participatingClinicians', label: '参与科室与医生' },
      { key: 'caseSummary', label: '病情摘要' },
      { key: 'discussionNotes', label: '会诊讨论记录' },
      { key: 'combinedOpinionAndNextSteps', label: '综合意见与后续安排' },
    ],
  },
];

export function emptyRecordBody(templateId: MedicalRecordTemplateId): Record<string, string> {
  return Object.fromEntries(
    recordTemplates
      .find((template) => template.id === templateId)!
      .fields.map((field) => [field.key, '']),
  );
}
