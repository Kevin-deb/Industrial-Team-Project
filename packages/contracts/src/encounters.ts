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
}
