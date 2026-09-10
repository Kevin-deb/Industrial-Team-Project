export interface Observation {
  id: string;
  patientId: string;
  metric: 'systolic' | 'diastolic' | 'glucose' | 'heart-rate';
  value: number;
  unit: string;
  measuredAt: string;
  receivedAt: string;
  source: 'synthetic-demo';
  sourceLabel: string;
}

export interface HealthAlert {
  id: string;
  patientId: string;
  patientName: string;
  metric: string;
  value: string;
  severity: 'attention' | 'review';
  measuredAt: string;
  sourceLabel: string;
  description: string;
}

export interface CarePlan {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  status: 'active' | 'draft';
  goals: string[];
  nextReview: string;
  completionPercent: number;
}

export interface HealthOverview {
  observations: Observation[];
  alerts: HealthAlert[];
  carePlans: CarePlan[];
  summary: {
    monitoredPatients: number;
    activePlans: number;
    needsReview: number;
    remindersPlanned: number;
  };
}
