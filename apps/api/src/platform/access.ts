import type { DatabaseSync } from 'node:sqlite';

export interface RequestContext {
  actorId: string;
  now: string;
}
export interface PatientAccessPort {
  canReadPatient(patientId: string, context: RequestContext): boolean;
}

/** Internal SQL boundary. All callers use the fixed alias "p"; values are always bound. */
export const patientScopeSql = `
  EXISTS (
    SELECT 1 FROM identity_roles ir JOIN role_permissions rp ON rp.role_id=ir.role_id
    WHERE ir.identity_id=:actorId AND rp.permission='patient:read'
  ) AND (
    p.assigned_doctor_id=:actorId OR EXISTS (
      SELECT 1 FROM access_grants ag WHERE ag.identity_id=:actorId AND ag.patient_id=p.id
      AND ag.scope='patient:read' AND ag.revoked_at IS NULL
      AND (ag.expires_at IS NULL OR julianday(ag.expires_at)>julianday(:now))
      AND (ag.task_id IS NULL OR EXISTS (
        SELECT 1 FROM consultations task WHERE task.id=ag.task_id AND task.patient_id=p.id
        AND task.status IN ('requested','scheduled') AND task.completed_at IS NULL
      ))
    )
  )
`;

export class SqlitePatientAccess implements PatientAccessPort {
  constructor(private readonly db: DatabaseSync) {}
  canReadPatient(patientId: string, context: RequestContext): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM patients p WHERE p.id=:patientId AND ' + patientScopeSql)
      .get({ patientId, ...context });
  }
}
