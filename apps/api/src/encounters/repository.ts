import type { DatabaseSync } from 'node:sqlite';
import type { Encounter, Consultation } from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';

export interface EncounterRepository {
  list(context: RequestContext): Encounter[];
  listConsultations(context: RequestContext): Consultation[];
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
}
