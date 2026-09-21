import type { MedicalRecordTemplateDefinition, MedicalRecordTemplateId } from '@doctor/contracts';

/** The API catalogue is the source of truth consumed by every renderer module. */
export const medicalRecordTemplates = [
  {
    id: 'outpatient',
    version: 1,
    titleKey: '门诊病历',
    subtitleKey: '主诉 · 病史 · 诊疗计划',
    fields: [
      { key: 'chiefComplaint', labelKey: '主诉', maxLength: 5000, requiredOnSubmit: true },
      { key: 'presentIllness', labelKey: '现病史', maxLength: 5000, requiredOnSubmit: true },
      {
        key: 'medicalAndAllergyHistory',
        labelKey: '既往史与过敏史',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      {
        key: 'examinationAndInvestigations',
        labelKey: '查体与辅助检查',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      {
        key: 'assessmentAndPlan',
        labelKey: '评估及诊疗计划',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
    ],
  },
  {
    id: 'followup',
    version: 1,
    titleKey: '慢病随访记录',
    subtitleKey: '健康指标 · 依从性 · 随访',
    fields: [
      { key: 'followUpPurpose', labelKey: '本次随访目的', maxLength: 5000, requiredOnSubmit: true },
      {
        key: 'healthMonitoringData',
        labelKey: '健康监测数据',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      {
        key: 'currentMedicationAndAdherence',
        labelKey: '当前用药与依从性',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      {
        key: 'lifestyleAndCare',
        labelKey: '生活方式与照护情况',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      {
        key: 'nextFollowUpArrangement',
        labelKey: '下次随访安排',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
    ],
  },
  {
    id: 'consult',
    version: 1,
    titleKey: '会诊记录',
    subtitleKey: '会诊目的 · 讨论 · 结论',
    fields: [
      {
        key: 'consultationRequestAndPurpose',
        labelKey: '会诊申请与目的',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      {
        key: 'participatingClinicians',
        labelKey: '参与科室与医生',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
      { key: 'caseSummary', labelKey: '病情摘要', maxLength: 5000, requiredOnSubmit: true },
      { key: 'discussionNotes', labelKey: '会诊讨论记录', maxLength: 5000, requiredOnSubmit: true },
      {
        key: 'combinedOpinionAndNextSteps',
        labelKey: '综合意见与后续安排',
        maxLength: 5000,
        requiredOnSubmit: true,
      },
    ],
  },
] as const satisfies readonly MedicalRecordTemplateDefinition[];

export const clinicalTemplateFields = Object.fromEntries(
  medicalRecordTemplates.map((template) => [
    template.id,
    template.fields.map((field) => field.key),
  ]),
) as unknown as Record<MedicalRecordTemplateId, readonly string[]>;

export const clinicalTemplateVersions = Object.fromEntries(
  medicalRecordTemplates.map((template) => [template.id, template.version]),
) as unknown as Record<MedicalRecordTemplateId, number>;

export function isRecordReadyToSubmit(
  templateId: MedicalRecordTemplateId,
  title: string,
  diagnosis: string,
  body: Record<string, string>,
): boolean {
  if (!title.trim() || !diagnosis.trim()) return false;
  const template = medicalRecordTemplates.find((item) => item.id === templateId);
  if (!template) return false;
  return template.fields.every(
    (field) => !field.requiredOnSubmit || Boolean(body[field.key]?.trim()),
  );
}
