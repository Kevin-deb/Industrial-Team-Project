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
