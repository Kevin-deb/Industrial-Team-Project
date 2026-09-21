export type EncounterStatus = 'waiting' | 'scheduled' | 'completed';

export interface Encounter {
  id: string;
  patientId: string;
  patientName: string;
  type: 'video' | 'text';
  status: EncounterStatus;
  scheduledAt: string;
  reason: string;
  durationMinutes: number;
}

export interface EncounterClinicalBrief {
  chiefComplaint: string;
  presentIllness: string;
  pastHistory: string;
  surgicalHistory: string;
  medicationHistory: string;
  allergyHistory: string;
}

export interface EncounterHistoryRecord {
  id: string;
  title: string;
  date: string;
  department: string;
  diagnosis: string;
  outcome: string;
}

export interface EncounterMessage {
  id: string;
  sender: 'patient' | 'doctor' | 'system';
  body: string;
  sentAt: string;
  imageUrl?: string;
  imageName?: string;
}

export interface SavedEncounterRecord {
  id: string;
  title: string;
  savedAt: string;
  mode: 'text' | 'video';
  messageCount: number;
  audioSaved: boolean;
  videoSaved: boolean;
}

export interface EncounterContext {
  brief: EncounterClinicalBrief;
  historyRecords: EncounterHistoryRecord[];
  savedRecords: SavedEncounterRecord[];
  messages: EncounterMessage[];
}

export interface EncounterAvailabilityWindow {
  id: string;
  date: string;
  type: 'text' | 'video';
  start: string;
  end: string;
  capacity: number;
  booked: number;
}

export interface EncounterNotice {
  id: string;
  encounterId: string;
  patientName: string;
  kind: '资料提醒' | '按时进入提醒' | '改期通知';
  content: string;
  status: '待患者确认' | '患者已接受' | '已发送';
  createdAt: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  specialty: string;
  status: 'requested' | 'scheduled' | 'completed';
  scheduledAt: string;
  participants: string[];
  summary: string;
  direction?: 'sent' | 'received';
  reviewerId?: string;
  reviewerName?: string;
  canReview?: boolean;
}

export interface ConsultationParticipant {
  id: string;
  name: string;
  title: string;
  department: string;
  role: string;
}

export interface ConsultationMaterial {
  id: string;
  title: string;
  description: string;
  fileName: string;
  uploadedAt: string;
  objectUrl?: string;
}

export interface ConsultationMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  sentAt: string;
  imageUrl?: string;
  imageName?: string;
}

export interface ConsultationReport {
  id: string;
  body: string;
  status: 'draft' | 'confirmed' | 'archived';
  createdAt: string;
}

export interface ConsultationContext {
  consultation: Consultation;
  participants: ConsultationParticipant[];
  materials: ConsultationMaterial[];
  messages: ConsultationMessage[];
  report: ConsultationReport | null;
  access: string;
  accessUntil: string;
}

export interface ConsultationDoctorOption {
  id: string;
  name: string;
  title: string;
  department: string;
}
