import type { DatabaseSync } from 'node:sqlite';
import type { Encounter, Consultation } from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';

export interface ConsultationTask {
  id: string;
  patientId: string;
  status: Consultation['status'];
  completedAt: string | null;
  requestedBy: string;
  isParticipant: boolean;
}

export interface EncounterRepository {
  list(context: RequestContext): Encounter[];
  listConsultations(context: RequestContext): Consultation[];
  findReference(id: string, context: RequestContext): { id: string; patientId: string } | undefined;
  findConsultationTask(id: string, context: RequestContext): ConsultationTask | undefined;
  findConfirmedReport(
    consultationId: string,
    reportId: string,
    context: RequestContext,
  ): { id: string } | undefined;
}
export class SqliteEncounterRepository implements EncounterRepository {
  constructor(private readonly db: DatabaseSync) {}
  list(context: RequestContext): Encounter[] {
    return this.db
      .prepare(
        `SELECT e.*,p.name patient_name FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE ${patientScopeSql} ORDER BY e.scheduled_at`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        type: r.type as Encounter['type'],
        status: r.status as Encounter['status'],
        scheduledAt: String(r.scheduled_at),
        reason: String(r.reason),
        durationMinutes: Number(r.duration_minutes),
      }));
  }
  listConsultations(context: RequestContext): Consultation[] {
    return this.db
      .prepare(
        `SELECT c.*,p.name patient_name FROM consultations c JOIN patients p ON p.id=c.patient_id WHERE ${patientScopeSql} ORDER BY c.scheduled_at`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        title: String(r.title),
        specialty: String(r.specialty),
        status: r.status as Consultation['status'],
        scheduledAt: String(r.scheduled_at),
        summary: String(r.summary),
        participants: this.db
          .prepare(
            'SELECT i.display_name FROM consultation_participants cp JOIN identities i ON i.id=cp.identity_id WHERE cp.consultation_id=? ORDER BY i.id',
          )
          .all(String(r.id))
          .map((p) => String(p.display_name)),
      }));
  }

  findReference(id: string, context: RequestContext) {
    const row = this.db
      .prepare(
        `SELECT e.id,e.patient_id FROM encounters e JOIN patients p ON p.id=e.patient_id
         WHERE e.id=:id AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
    return row ? { id: String(row.id), patientId: String(row.patient_id) } : undefined;
  }

  findConsultationTask(id: string, context: RequestContext): ConsultationTask | undefined {
    const row = this.db
      .prepare(
        `SELECT c.id,c.patient_id,c.status,c.completed_at,c.requested_by,
          (EXISTS(
            SELECT 1 FROM consultation_participants cp
            WHERE cp.consultation_id=c.id AND cp.identity_id=:actorId
          ) OR c.requested_by=:actorId) is_participant
         FROM consultations c JOIN patients p ON p.id=c.patient_id
         WHERE c.id=:id AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
    if (!row) return undefined;
    return {
      id: String(row.id),
      patientId: String(row.patient_id),
      status: row.status as Consultation['status'],
      completedAt: row.completed_at === null ? null : String(row.completed_at),
      requestedBy: String(row.requested_by),
      isParticipant: Number(row.is_participant) === 1,
    };
  }

  findConfirmedReport(
    consultationId: string,
    reportId: string,
    context: RequestContext,
  ): { id: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT r.id FROM consultation_reports r
         JOIN consultations c ON c.id=r.consultation_id
         JOIN patients p ON p.id=c.patient_id
         WHERE r.consultation_id=:consultationId AND r.id=:reportId AND r.status='confirmed'
           AND ${patientScopeSql}`,
      )
      .get({ consultationId, reportId, ...context });
    return row ? { id: String(row.id) } : undefined;
  }
}
