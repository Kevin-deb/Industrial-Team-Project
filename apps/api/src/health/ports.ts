import type { HealthPatientSummary, ReminderTask } from '@doctor/contracts';
import type { PatientAccessPort, RequestContext } from '../platform/index.js';

export interface HealthAuditEvent {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'denied' | 'planned' | 'failed';
  occurredAt: string;
}

export interface HealthAuditPort {
  record(event: HealthAuditEvent): void | Promise<void>;
}

export interface HealthNotificationPort {
  send(
    task: ReminderTask,
    options: { idempotencyKey: string },
  ): Promise<{ providerMessageId: string }>;
}

export interface PatientSummaryPort {
  find(patientId: string, context: RequestContext): { id: string; name: string } | undefined;
  search(query: string, context: RequestContext): HealthPatientSummary[];
}

export type { PatientAccessPort, RequestContext };
