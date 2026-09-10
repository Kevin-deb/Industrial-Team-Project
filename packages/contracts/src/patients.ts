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
