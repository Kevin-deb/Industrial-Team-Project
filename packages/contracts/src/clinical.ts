export interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  diagnosis: string;
  status: 'draft' | 'pending-review' | 'archived';
  authorName: string;
  updatedAt: string;
  version: number;
  orderCount: number;
}

export type MedicalRecordTemplateId = 'outpatient' | 'followup' | 'consult';
export type MedicalRecordBody = Record<string, string>;

export interface MedicalRecordDetail extends MedicalRecord {
  encounterId: string | null;
  templateId: MedicalRecordTemplateId;
  body: MedicalRecordBody;
  authoredAt: string;
  amendmentReason: string | null;
}

export interface CreateMedicalRecordRequest {
  patientId: string;
  encounterId?: string;
  templateId: MedicalRecordTemplateId;
  title: string;
  diagnosis: string;
  body: MedicalRecordBody;
}

export interface UpdateMedicalRecordRequest {
  title: string;
  diagnosis: string;
  body: MedicalRecordBody;
}
