import type { MedicalOrderTemplateDefinition, MedicalOrderTemplateId } from '@doctor/contracts';

/** Independent of medical-record templates; prefill only, never auto-issued. */
export const medicalOrderTemplates = [
  {
    id: 'medication',
    version: 1,
    titleKey: '用药医嘱',
    subtitleKey: '药品 · 剂量 · 疗程',
    fields: [
      { key: 'drugName', labelKey: '药品名称', maxLength: 200, required: true },
      { key: 'dose', labelKey: '剂量', maxLength: 120, required: true },
      { key: 'frequency', labelKey: '频次', maxLength: 120, required: true },
      { key: 'route', labelKey: '给药途径', maxLength: 120, required: true },
      { key: 'duration', labelKey: '疗程', maxLength: 120, required: true },
      { key: 'instructions', labelKey: '用药说明', maxLength: 2000, required: false },
    ],
  },
  {
    id: 'examination',
    version: 1,
    titleKey: '检查医嘱',
    subtitleKey: '检查项目 · 部位 · 指征',
    fields: [
      { key: 'examName', labelKey: '检查项目', maxLength: 200, required: true },
      { key: 'bodySite', labelKey: '检查部位', maxLength: 200, required: true },
      { key: 'indication', labelKey: '检查指征', maxLength: 2000, required: true },
      { key: 'notes', labelKey: '备注', maxLength: 2000, required: false },
    ],
  },
  {
    id: 'laboratory',
    version: 1,
    titleKey: '检验医嘱',
    subtitleKey: '检验项目 · 标本 · 指征',
    fields: [
      { key: 'testName', labelKey: '检验项目', maxLength: 200, required: true },
      { key: 'specimen', labelKey: '标本类型', maxLength: 120, required: true },
      { key: 'indication', labelKey: '检验指征', maxLength: 2000, required: true },
      { key: 'notes', labelKey: '备注', maxLength: 2000, required: false },
    ],
  },
] as const satisfies readonly MedicalOrderTemplateDefinition[];

export const orderTemplateFields = Object.fromEntries(
  medicalOrderTemplates.map((template) => [template.id, template.fields.map((field) => field.key)]),
) as unknown as Record<MedicalOrderTemplateId, readonly string[]>;

export const orderTemplateVersions = Object.fromEntries(
  medicalOrderTemplates.map((template) => [template.id, template.version]),
) as unknown as Record<MedicalOrderTemplateId, number>;

export function hasValidOrderPayload(
  templateId: MedicalOrderTemplateId,
  payload: Record<string, string>,
): boolean {
  const template = medicalOrderTemplates.find((item) => item.id === templateId);
  if (!template || !payload || Array.isArray(payload) || typeof payload !== 'object') return false;
  const expected = [...template.fields.map((field) => field.key)].sort();
  const keys = Object.keys(payload).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]))
    return false;
  return template.fields.every((field) => {
    const value = payload[field.key];
    if (typeof value !== 'string' || value.length > field.maxLength) return false;
    return !field.required || Boolean(value.trim());
  });
}
