import type {
  MedicalOrderTemplateDefinition,
  MedicalRecordTemplateDefinition,
} from '@doctor/contracts';

export function emptyRecordBody(template: MedicalRecordTemplateDefinition): Record<string, string> {
  return Object.fromEntries(template.fields.map((field) => [field.key, '']));
}

export function emptyOrderPayload(
  template: MedicalOrderTemplateDefinition,
): Record<string, string> {
  return Object.fromEntries(template.fields.map((field) => [field.key, '']));
}
