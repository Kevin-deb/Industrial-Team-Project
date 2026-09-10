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
    const r = this.db.prepare('SELECT * FROM identities WHERE id=?').get(actorId);
    if (!r) throw new Error('Demo identity unavailable');
    return {
      id: String(r.id),
      name: String(r.display_name),
      title: String(r.title),
      department: String(r.department),
      hospital: String(r.hospital),
      avatarInitials: String(r.avatar_initials),
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
