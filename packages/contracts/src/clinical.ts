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

export interface MedicalRecordTemplateField {
  key: string;
  labelKey: string;
  maxLength: number;
  requiredOnSubmit: boolean;
}

export interface MedicalRecordTemplateDefinition {
  id: MedicalRecordTemplateId;
  version: number;
  titleKey: string;
  subtitleKey: string;
  fields: readonly MedicalRecordTemplateField[];
}

export interface MedicalRecordReviewSummary {
  recordVersion: number;
  decision: 'approved' | 'returned';
  comment: string;
  reviewerName: string;
  reviewedAt: string;
}

export interface MedicalRecordAvailableActions {
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canArchive: boolean;
  canCorrect: boolean;
}

export interface MedicalRecordDetail extends MedicalRecord {
  encounterId: string | null;
  templateId: MedicalRecordTemplateId;
  templateVersion: number;
  body: MedicalRecordBody;
  authoredAt: string;
  amendmentReason: string | null;
  latestReview: MedicalRecordReviewSummary | null;
  availableActions: MedicalRecordAvailableActions;
}

export interface MedicalRecordVersion {
  recordId: string;
  version: number;
  title: string;
  diagnosis: string;
  templateId: MedicalRecordTemplateId;
  templateVersion: number;
  body: MedicalRecordBody;
  authorName: string;
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

export interface ReviewMedicalRecordRequest {
  decision: 'approved' | 'returned';
  comment: string;
}

export interface CorrectMedicalRecordRequest {
  reason: string;
}

export type MedicalOrderType = 'medication' | 'examination' | 'laboratory';
export type MedicalOrderStatus = 'draft' | 'active' | 'stopped';
export type MedicalOrderTemplateId = MedicalOrderType;
export type MedicalOrderPayload = Record<string, string>;

export interface MedicalOrderTemplateField {
  key: string;
  labelKey: string;
  maxLength: number;
  required: boolean;
}

export interface MedicalOrderTemplateDefinition {
  id: MedicalOrderTemplateId;
  version: number;
  titleKey: string;
  subtitleKey: string;
  fields: readonly MedicalOrderTemplateField[];
}

export interface MedicalOrder {
  id: string;
  recordId: string;
  patientId: string;
  type: MedicalOrderType;
  status: MedicalOrderStatus;
  version: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
}

export interface MedicalOrderDetail extends MedicalOrder {
  templateId: MedicalOrderTemplateId;
  templateVersion: number;
  payload: MedicalOrderPayload;
  changeReason: string;
}

export interface MedicalOrderVersion {
  orderId: string;
  version: number;
  templateId: MedicalOrderTemplateId;
  templateVersion: number;
  payload: MedicalOrderPayload;
  authorName: string;
  authoredAt: string;
  changeReason: string;
}

export interface CreateMedicalOrderRequest {
  templateId: MedicalOrderTemplateId;
  payload: MedicalOrderPayload;
  confirmed: boolean;
}

export interface UpdateMedicalOrderRequest {
  payload: MedicalOrderPayload;
  changeReason: string;
}

export interface StopMedicalOrderRequest {
  reason: string;
}

export interface ClinicalMaterialReference {
  id: string;
  consultationId: string;
  patientId: string;
  recordId: string;
  recordVersion: number;
  sharedSections: string[];
  purpose: string;
  createdByName: string;
  createdAt: string;
  reportId: string | null;
  linkedAt: string | null;
}

export interface CreateClinicalMaterialRequest {
  consultationId: string;
  recordId: string;
  recordVersion: number;
  sharedSections: string[];
  purpose: string;
}

export interface LinkClinicalMaterialReportRequest {
  reportId: string;
}
