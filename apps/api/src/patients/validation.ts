import type { UpdatePatientRequest } from '@doctor/contracts';

const text = (maxLength: number, minLength = 0) => ({ type: 'string', maxLength, minLength });
const lines = (maxLength: number) => ({
  type: 'array',
  maxItems: 50,
  uniqueItems: true,
  items: text(maxLength, 1),
});
export const archiveBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'gender',
    'age',
    'phone',
    'diagnosis',
    'tags',
    'status',
    'symptoms',
    'allergies',
    'allergyStatus',
    'medicalHistory',
    'careSummary',
    'changeReason',
  ],
  properties: {
    name: text(100, 1),
    gender: { type: 'string', enum: ['女', '男'] },
    age: { type: 'integer', minimum: 0, maximum: 130 },
    phone: text(30),
    diagnosis: text(200, 1),
    tags: lines(100),
    status: { type: 'string', enum: ['stable', 'attention', 'follow-up'] },
    symptoms: lines(500),
    allergies: lines(500),
    allergyStatus: { type: 'string', enum: ['unknown', 'none', 'recorded'] },
    medicalHistory: lines(2000),
    careSummary: text(5000),
    changeReason: text(500, 1),
  },
};
export function normalizeArchive<T extends UpdatePatientRequest>(body: T): T {
  return {
    ...body,
    name: body.name.trim(),
    diagnosis: body.diagnosis.trim(),
    phone: body.phone.trim(),
    careSummary: body.careSummary.trim(),
    changeReason: body.changeReason.trim(),
    ...Object.fromEntries(
      ['tags', 'symptoms', 'allergies', 'medicalHistory'].map((key) => [
        key,
        body[key as 'tags'].map((value) => value.trim()),
      ]),
    ),
  };
}
export function invalidArchive(input: UpdatePatientRequest): boolean {
  return (
    !input.name ||
    !input.diagnosis ||
    !input.changeReason ||
    ['tags', 'symptoms', 'allergies', 'medicalHistory'].some((key) => {
      const values = input[key as 'tags'];
      return values.some((value) => !value) || new Set(values).size !== values.length;
    })
  );
}
export function validOptionalDate(value: string): boolean {
  return (
    value === '' ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value.slice(0, 4) !== '0000' &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value)
  );
}
