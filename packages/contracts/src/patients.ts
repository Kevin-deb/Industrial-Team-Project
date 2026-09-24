export type PatientStatus = 'stable' | 'attention' | 'follow-up';
export type PatientLifecycleStatus = 'active' | 'released' | 'archived';
export type PatientAccessRole = 'responsible' | 'collaborative-readonly';

export interface PatientAccessMetadata {
  responsibleDoctorName: string | null;
  lifecycleStatus: PatientLifecycleStatus;
  accessRole: PatientAccessRole;
  canBatch: boolean;
  canArchive: boolean;
  canRelease: boolean;
  canTransfer: boolean;
  batchDisabledReason: string | null;
}

export interface Patient {
  id: string;
  name: string;
  gender: '女' | '男';
  age: number;
  phone: string;
  diagnosis: string;
  tags: string[];
  status: PatientStatus;
  lastVisit: string;
  nextFollowUp: string;
  assignedDoctorId: string;
  allergies: string[];
  medicalHistory: string[];
  careSummary: string;
}

export interface PatientQuery {
  q?: string;
  status?: PatientStatus;
  disease?: string;
  page?: number;
  pageSize?: number;
  groupBy?: 'disease' | 'status';
}

export interface PatientDirectoryItem extends Patient, PatientAccessMetadata {
  version: number;
  canEdit: boolean;
  groupKey?: string;
}
export interface PatientGroup {
  key: string;
  count: number;
}
export interface BatchPatientStatusRequest {
  patients: { id: string; expectedVersion: number }[];
  status: PatientStatus;
  changeReason: string;
}
export interface BatchPatientStatusResult {
  committed: boolean;
  results: {
    id: string;
    outcome: 'updated' | 'unchanged' | 'stale' | 'unavailable' | 'forbidden' | 'not-applied';
    version?: number;
  }[];
}

export type AllergyStatus = 'unknown' | 'none' | 'recorded';

/** Additional detail fields keep the existing patient summary contract compatible. */
export interface PatientArchive extends Patient, PatientAccessMetadata {
  symptoms: string[];
  allergyStatus: AllergyStatus;
  version: number;
  canEdit: boolean;
}

export interface UpdatePatientRequest {
  name: string;
  gender: Patient['gender'];
  age: number;
  phone: string;
  diagnosis: string;
  tags: string[];
  status: PatientStatus;
  symptoms: string[];
  allergies: string[];
  allergyStatus: AllergyStatus;
  medicalHistory: string[];
  careSummary: string;
  changeReason: string;
}

export interface CreatePatientRequest extends UpdatePatientRequest {
  lastVisit?: string;
  nextFollowUp?: string;
}

export interface PatientLifecycleRequest {
  expectedVersion: number;
  changeReason: string;
}
export interface TransferPatientRequest extends PatientLifecycleRequest {
  newResponsibleDoctorId: string;
}
export interface TransferDoctor {
  id: string;
  name: string;
  department: string;
}

export type PatientSnapshot = Omit<
  PatientArchive,
  | 'canEdit'
  | 'responsibleDoctorName'
  | 'accessRole'
  | 'canBatch'
  | 'canArchive'
  | 'canRelease'
  | 'canTransfer'
  | 'batchDisabledReason'
>;
export interface PatientArchiveVersion {
  version: number;
  authoredBy: string;
  authorName: string;
  createdAt: string;
  changeReason: string;
  snapshot: PatientSnapshot | null;
  snapshotCapturedAt?: string;
}
