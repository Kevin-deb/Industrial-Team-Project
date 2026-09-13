export interface CommandInput {
  commandId: string;
}

export interface VersionedCommandInput extends CommandInput {
  expectedVersion: number;
}

export type ObservationSource = 'synthetic-demo' | 'manual-entry' | 'device-simulator';

export type HealthMetric = 'systolic' | 'diastolic' | 'glucose' | 'heart-rate';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Observation {
  id: string;
  patientId: string;
  metric: HealthMetric;
  value: number;
  unit: string;
  measuredAt: string;
  receivedAt: string;
  source: ObservationSource;
  sourceLabel: string;
}

export interface ObservationQuery {
  patientId: string;
  metric?: HealthMetric;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export type ObservationList = Paginated<Observation>;

export interface CreateObservationInput extends CommandInput {
  patientId: string;
  metric: HealthMetric;
  value: number;
  unit: string;
  measuredAt: string;
  source: 'manual-entry' | 'device-simulator';
  sourceLabel: string;
  externalObservationId?: string;
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

export interface CarePlanDetail extends CarePlan {
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlanVersion {
  id: string;
  planId: string;
  version: number;
  snapshot: Omit<CarePlanDetail, 'patientName'>;
  authoredBy: string;
  createdAt: string;
}

export interface CreateCarePlanInput extends CommandInput {
  patientId: string;
  title: string;
  goals: string[];
  nextReview: string;
}

export interface UpdateCarePlanInput extends VersionedCommandInput {
  title: string;
  status: 'draft' | 'active';
  goals: string[];
  nextReview: string;
  completionPercent: number;
}

export interface HealthAssessment {
  id: string;
  patientId: string;
  planId?: string;
  assessorId: string;
  assessedAt: string;
  summary: string;
  recommendations: string[];
  nextReview?: string;
}

export interface CreateAssessmentInput extends CommandInput {
  patientId: string;
  planId?: string;
  assessedAt: string;
  summary: string;
  recommendations: string[];
  nextReview?: string;
}

export interface ReminderTask {
  id: string;
  patientId: string;
  planId?: string;
  channel: 'in-app' | 'sms' | 'email';
  templateId: string;
  scheduledAt: string;
  status: 'planned' | 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  lastError?: string;
}

export interface CreateReminderInput extends CommandInput {
  patientId: string;
  planId?: string;
  channel: ReminderTask['channel'];
  templateId: string;
  scheduledAt: string;
  consentReference?: string;
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
