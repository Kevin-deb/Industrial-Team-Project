import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, Doctor } from '@doctor/contracts';
export interface PlatformRepository {
  doctor(actorId: string): Doctor;
  ownAudit(actorId: string): AuditEvent[];
  recordAccess(event: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    outcome: 'success' | 'denied';
    description: string;
  }): void;
}
export class SqlitePlatformRepository implements PlatformRepository {
  constructor(private readonly db: DatabaseSync) {}
  doctor(actorId: string): Doctor {
    const r = this.db.prepare(
      `SELECT i.*,u.email,u.email_verified_at,d.phone,d.license_number,d.specialty,
        d.government_id_masked,d.credential_status,d.personnel_status,
        group_concat(ir.role_id) roles
       FROM identities i
       LEFT JOIN users u ON u.identity_id=i.id
       LEFT JOIN doctors d ON d.identity_id=i.id
       LEFT JOIN identity_roles ir ON ir.identity_id=i.id
       WHERE i.id=? GROUP BY i.id`,
    ).get(actorId);
    if (!r) throw new Error('Demo identity unavailable');
    return {
      id: String(r.id),
      name: String(r.display_name),
      title: String(r.title),
      department: String(r.department),
      hospital: String(r.hospital),
      avatarInitials: String(r.avatar_initials),
      ...(r.email ? { email: String(r.email) } : {}),
      ...(r.email_verified_at ? { emailVerifiedAt: String(r.email_verified_at) } : {}),
      ...(r.phone ? { phone: String(r.phone) } : {}),
      ...(r.license_number ? { licenseNumber: String(r.license_number) } : {}),
      ...(r.specialty ? { specialty: String(r.specialty) } : {}),
      ...(r.government_id_masked ? { governmentIdMasked: String(r.government_id_masked) } : {}),
      ...(r.credential_status ? { credentialStatus: r.credential_status as Doctor['credentialStatus'] } : {}),
      ...(r.personnel_status ? { personnelStatus: r.personnel_status as Doctor['personnelStatus'] } : {}),
      roles: r.roles ? String(r.roles).split(',') : [],
    };
  }
  ownAudit(actorId: string): AuditEvent[] {
    return this.db
      .prepare(
        'SELECT a.*,i.display_name actor_name FROM audit_events a JOIN identities i ON i.id=a.actor_id WHERE a.actor_id=? ORDER BY julianday(a.occurred_at) DESC,a.id DESC LIMIT 100',
      )
      .all(actorId)
      .map((r) => ({
        id: String(r.id),
        actorId: String(r.actor_id),
        actorName: String(r.actor_name),
        action: String(r.action),
        targetType: String(r.target_type),
        targetId: String(r.target_id),
        occurredAt: String(r.occurred_at),
        outcome: r.outcome as AuditEvent['outcome'],
        description: String(r.description),
      }));
  }
  recordAccess(event: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    outcome: 'success' | 'denied';
    description: string;
  }): void {
    this.db
      .prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        event.actorId,
        event.action,
        event.targetType,
        event.targetId,
        new Date().toISOString(),
        event.outcome,
        event.description,
      );
  }
}
