export type PatientStatus = 'stable' | 'attention' | 'follow-up';

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
}

export type AllergyStatus = 'unknown' | 'none' | 'recorded';

/** Additional detail fields keep the existing patient summary contract compatible. */
export interface PatientArchive extends Patient {
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

export type PatientSnapshot = Omit<PatientArchive, 'canEdit'>;
export interface PatientArchiveVersion {
  version: number;
  authoredBy: string;
  authorName: string;
  createdAt: string;
  changeReason: string;
  snapshot: PatientSnapshot | null;
  snapshotCapturedAt?: string;
}
