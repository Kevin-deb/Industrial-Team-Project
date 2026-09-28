import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, AuditOutcome, AuditPage, AuditQuery, Doctor } from '@doctor/contracts';
export interface PlatformRepository {
  doctor(actorId: string): Doctor;
  ownAudit(actorId: string): AuditEvent[];
  queryAudit(actorId: string, query: AuditQuery): AuditPage;
  exportAudit(actorId: string, query: AuditQuery, limit: number): AuditEvent[];
  recordAccess(event: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    outcome: AuditOutcome;
    occurredAt?: string;
    description: string;
  }): void;
}
export class SqlitePlatformRepository implements PlatformRepository {
  constructor(private readonly db: DatabaseSync) {}
  doctor(actorId: string): Doctor {
    const r = this.db
      .prepare(
        `SELECT i.*,u.email,u.email_verified_at,d.phone,d.license_number,d.specialty,
        d.government_id_masked,d.credential_status,d.personnel_status,
        group_concat(ir.role_id) roles
       FROM identities i
       LEFT JOIN users u ON u.identity_id=i.id
       LEFT JOIN doctors d ON d.identity_id=i.id
       LEFT JOIN identity_roles ir ON ir.identity_id=i.id
       WHERE i.id=? GROUP BY i.id`,
      )
      .get(actorId);
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
      ...(r.credential_status
        ? { credentialStatus: r.credential_status as Doctor['credentialStatus'] }
        : {}),
      ...(r.personnel_status
        ? { personnelStatus: r.personnel_status as Doctor['personnelStatus'] }
        : {}),
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
  queryAudit(actorId: string, query: AuditQuery): AuditPage {
    const { where, params } = auditFilter(actorId, query);
    const counts = this.db
      .prepare(
        `
      SELECT COUNT(*) total,
        COALESCE(SUM(a.outcome='success'),0) success,
        COALESCE(SUM(a.outcome='denied'),0) denied,
        COALESCE(SUM(a.outcome='planned'),0) planned,
        COALESCE(SUM(a.outcome='failed'),0) failed
      FROM audit_events a WHERE ${where}
    `,
      )
      .get(params)!;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const items = this.db
      .prepare(
        `
      SELECT a.*,i.display_name actor_name FROM audit_events a
      JOIN identities i ON i.id=a.actor_id WHERE ${where}
      ORDER BY julianday(a.occurred_at) DESC,a.id DESC LIMIT :limit OFFSET :offset
    `,
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
      .map(mapAuditEvent);
    const domains = this.db
      .prepare(
        'SELECT DISTINCT target_type FROM audit_events WHERE actor_id=? ORDER BY target_type',
      )
      .all(actorId)
      .map((row) => String(row.target_type));
    return {
      items,
      page,
      pageSize,
      total: Number(counts.total),
      domains,
      summary: {
        success: Number(counts.success),
        denied: Number(counts.denied),
        planned: Number(counts.planned),
        failed: Number(counts.failed),
      },
    };
  }
  exportAudit(actorId: string, query: AuditQuery, limit: number): AuditEvent[] {
    const { where, params } = auditFilter(actorId, query);
    // One extra row lets the route reject oversized exports without silently truncating them.
    return this.db
      .prepare(
        `
      SELECT a.*,i.display_name actor_name FROM audit_events a
      JOIN identities i ON i.id=a.actor_id WHERE ${where}
      ORDER BY julianday(a.occurred_at) DESC,a.id DESC LIMIT :limit
    `,
      )
      .all({ ...params, limit: limit + 1 })
      .map(mapAuditEvent);
  }
  recordAccess(event: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    outcome: AuditOutcome;
    occurredAt?: string;
    description: string;
  }): void {
    this.db
      .prepare(
        'INSERT INTO audit_events(id,actor_id,action,target_type,target_id,occurred_at,outcome,description) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        event.actorId,
        event.action,
        event.targetType,
        event.targetId,
        event.occurredAt ?? new Date().toISOString(),
        event.outcome,
        event.description,
      );
  }
}

function mapAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    occurredAt: String(row.occurred_at),
    outcome: row.outcome as AuditEvent['outcome'],
    description: String(row.description),
  };
}

function auditFilter(actorId: string, query: AuditQuery) {
  const conditions = ['a.actor_id=:actorId'];
  const params: Record<string, string> = { actorId };
  if (query.q?.trim()) {
    conditions.push(`(instr(lower(a.action),lower(:q))>0 OR instr(lower(a.target_id),lower(:q))>0
      OR instr(lower(a.id),lower(:q))>0 OR instr(lower(a.description),lower(:q))>0)`);
    params.q = query.q.trim();
  }
  if (query.action?.trim()) {
    conditions.push('instr(lower(a.action),lower(:action))>0');
    params.action = query.action.trim();
  }
  if (query.domain) {
    conditions.push('a.target_type=:domain');
    params.domain = query.domain;
  }
  if (query.outcome) {
    conditions.push('a.outcome=:outcome');
    params.outcome = query.outcome;
  }
  if (query.from) {
    conditions.push('julianday(a.occurred_at)>=julianday(:from)');
    params.from = query.from;
  }
  if (query.to) {
    conditions.push('julianday(a.occurred_at)<=julianday(:to)');
    params.to = query.to;
  }
  return { where: conditions.join(' AND '), params };
}
