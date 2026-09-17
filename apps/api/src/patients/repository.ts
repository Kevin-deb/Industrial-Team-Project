import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  Patient,
  PatientQuery,
  PatientArchive,
  PatientArchiveVersion,
  PatientSnapshot,
  UpdatePatientRequest,
  BatchPatientStatusRequest,
  BatchPatientStatusResult,
  PatientGroup,
} from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';

export interface PatientRepository {
  list(
    query: PatientQuery,
    context: RequestContext,
  ): { items: Patient[]; total: number; page: number; pageSize: number };
  findById(id: string, context: RequestContext): Patient | undefined;
}
type Row = Record<string, SQLOutput>;
type SQLOutput = string | number | bigint | null | Uint8Array;
function map(row: Row): Patient {
  return {
    id: String(row.id),
    name: String(row.name),
    gender: row.gender as Patient['gender'],
    age: Number(row.age),
    phone: String(row.phone),
    diagnosis: String(row.diagnosis),
    tags: JSON.parse(String(row.tags_json)) as string[],
    status: row.status as Patient['status'],
    lastVisit: String(row.last_visit),
    nextFollowUp: String(row.next_follow_up),
    assignedDoctorId: String(row.assigned_doctor_id),
    allergies: JSON.parse(String(row.allergies_json)) as string[],
    medicalHistory: JSON.parse(String(row.medical_history_json)) as string[],
    careSummary: String(row.care_summary),
  };
}
export class SqlitePatientRepository implements PatientRepository {
  constructor(private readonly db: DatabaseSync) {}
  list(query: PatientQuery, context: RequestContext) {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const conditions = [patientScopeSql];
    const params: Record<string, SQLInputValue> = { ...context };
    if (query.q) {
      conditions.push(
        "instr(lower(p.name || ' ' || p.id || ' ' || p.diagnosis || ' ' || p.tags_json || ' ' || p.symptoms_json || ' ' || p.medical_history_json || ' ' || p.care_summary),lower(:q))>0",
      );
      params.q = query.q.trim();
    }
    if (query.status) {
      conditions.push('p.status=:status');
      params.status = query.status;
    }
    if (query.disease) {
      conditions.push('instr(lower(p.diagnosis),lower(:disease))>0');
      params.disease = query.disease.trim();
    }
    const where = conditions.join(' AND ');
    const groupColumn = query.groupBy === 'disease' ? 'p.diagnosis' : 'p.status';
    const groups: PatientGroup[] = query.groupBy
      ? this.db
          .prepare(
            `SELECT ${groupColumn} AS key, COUNT(*) AS count FROM patients p WHERE ${where} GROUP BY ${groupColumn} ORDER BY ${groupColumn}`,
          )
          .all(params)
          .map((row) => ({ key: String(row.key), count: Number(row.count) }))
      : [];
    const total = Number(
      this.db.prepare('SELECT COUNT(*) AS total FROM patients p WHERE ' + where).get(params)!.total,
    );
    const items = this.db
      .prepare(
        'SELECT p.* FROM patients p WHERE ' +
          where +
          ' ORDER BY ' +
          (query.groupBy ? groupColumn + ',' : '') +
          'p.id LIMIT :limit OFFSET :offset',
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
      .map((row) => {
        const archive = this.archive(String(row.id), context)!;
        return {
          ...map(row),
          version: archive.version,
          canEdit: archive.canEdit,
          ...(query.groupBy
            ? { groupKey: String(query.groupBy === 'disease' ? row.diagnosis : row.status) }
            : {}),
        };
      });
    return { items, total, page, pageSize, groups };
  }
  findById(id: string, context: RequestContext): Patient | undefined {
    const row = this.db
      .prepare('SELECT p.* FROM patients p WHERE p.id=:id AND ' + patientScopeSql)
      .get({ ...context, id });
    return row ? map(row) : undefined;
  }

  archive(id: string, context: RequestContext): PatientArchive | undefined {
    const row = this.db
      .prepare('SELECT p.* FROM patients p WHERE p.id=:id AND ' + patientScopeSql)
      .get({ ...context, id });
    if (!row) return undefined;
    const version = Number(
      this.db
        .prepare(
          'SELECT COALESCE(MAX(version),1) version FROM patient_archive_versions WHERE patient_id=?',
        )
        .get(id)!.version,
    );
    return {
      ...map(row),
      version,
      symptoms: JSON.parse(String(row.symptoms_json)),
      allergyStatus: row.allergy_status as PatientArchive['allergyStatus'],
      canEdit: this.canEdit(id, context),
    };
  }

  canEdit(id: string, context: RequestContext): boolean {
    // Read-only temporary consultation access must never imply archive write access.
    return !!this.db
      .prepare(
        `SELECT 1 FROM patients p WHERE p.id=:id AND p.assigned_doctor_id=:actorId
      AND ${patientScopeSql} AND EXISTS (
        SELECT 1 FROM identity_roles ir JOIN role_permissions rp ON rp.role_id=ir.role_id
        WHERE ir.identity_id=:actorId AND rp.permission='patient:write'
      )`,
      )
      .get({ id, ...context });
  }

  stats(context: RequestContext) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) total,
      COALESCE(SUM(p.status='stable'),0) stable, COALESCE(SUM(p.status='attention'),0) attention,
      COALESCE(SUM(p.status='follow-up'),0) followUp FROM patients p WHERE ${patientScopeSql}`,
      )
      .get({ ...context })!;
    return {
      total: Number(row.total),
      stable: Number(row.stable),
      attention: Number(row.attention),
      followUp: Number(row.followUp),
    };
  }

  versions(id: string, context: RequestContext): PatientArchiveVersion[] | undefined {
    if (!this.findById(id, context)) return undefined;
    const baseline = this.db
      .prepare('SELECT * FROM patient_archive_baselines WHERE patient_id=?')
      .get(id);
    return this.db
      .prepare(
        `SELECT v.*,i.display_name author_name FROM patient_archive_versions v
      JOIN identities i ON i.id=v.authored_by WHERE v.patient_id=? ORDER BY v.version DESC`,
      )
      .all(id)
      .map((row) => {
        const payload = JSON.parse(String(row.payload_json)) as Partial<PatientSnapshot>;
        const captured = !payload.id && baseline?.version === row.version;
        return {
          version: Number(row.version),
          authoredBy: String(row.authored_by),
          authorName: String(row.author_name),
          createdAt: String(row.created_at),
          changeReason: String(row.change_reason),
          snapshot: payload.id
            ? (payload as PatientSnapshot)
            : captured
              ? (JSON.parse(String(baseline!.payload_json)) as PatientSnapshot)
              : null,
          ...(captured ? { snapshotCapturedAt: String(baseline!.captured_at) } : {}),
        };
      });
  }

  update(
    id: string,
    expectedVersion: number,
    input: UpdatePatientRequest,
    context: RequestContext,
    recordAudit: () => void,
  ) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.updateInTransaction(id, expectedVersion, input, context, recordAudit);
      this.db.exec(result.kind === 'saved' ? 'COMMIT' : 'ROLLBACK');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  batchStatus(
    input: BatchPatientStatusRequest,
    context: RequestContext,
    recordAudit: (id: string) => void,
  ): BatchPatientStatusResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const originals = input.patients.map((item) => this.archive(item.id, context));
      const results: BatchPatientStatusResult['results'] = input.patients.map((item, index) => {
        const patient = originals[index];
        if (!patient) return { id: item.id, outcome: 'unavailable' };
        if (!patient.canEdit) return { id: item.id, outcome: 'forbidden' };
        if (patient.version !== item.expectedVersion)
          return { id: item.id, outcome: 'stale', version: patient.version };
        return {
          id: item.id,
          outcome: patient.status === input.status ? 'unchanged' : 'not-applied',
        };
      });
      if (results.some((item) => ['unavailable', 'forbidden', 'stale'].includes(item.outcome))) {
        this.db.exec('ROLLBACK');
        return { committed: false, results };
      }
      for (let index = 0; index < results.length; index++) {
        if (results[index].outcome === 'unchanged') continue;
        const {
          id,
          version,
          canEdit: _canEdit,
          lastVisit: _lastVisit,
          nextFollowUp: _nextFollowUp,
          assignedDoctorId: _doctor,
          ...fields
        } = originals[index]!;
        const saved = this.updateInTransaction(
          id,
          version,
          { ...fields, status: input.status, changeReason: input.changeReason },
          context,
          () => recordAudit(id),
        );
        if (saved.kind !== 'saved') throw new Error('Batch patient invariant failed');
        results[index] = { id, outcome: 'updated', version: saved.patient.version };
      }
      this.db.exec('COMMIT');
      return { committed: true, results };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private updateInTransaction(
    id: string,
    expectedVersion: number,
    input: UpdatePatientRequest,
    context: RequestContext,
    recordAudit: () => void,
  ):
    | { kind: 'saved'; patient: PatientArchive }
    | { kind: 'not-found' }
    | { kind: 'forbidden' }
    | { kind: 'unchanged' }
    | { kind: 'stale'; version: number } {
    const current = this.archive(id, context);
    if (!current) {
      return { kind: 'not-found' };
    }
    if (!current.canEdit) {
      return { kind: 'forbidden' };
    }
    if (current.version !== expectedVersion) {
      return { kind: 'stale', version: current.version };
    }
    const { changeReason, ...fields } = input;
    if (
      Object.entries(fields).every(
        ([key, value]) =>
          JSON.stringify(current[key as keyof PatientArchive]) === JSON.stringify(value),
      )
    ) {
      return { kind: 'unchanged' };
    }
    const { canEdit: _canEdit, ...before } = current;
    // Legacy seed versions were partial. Capture a labelled baseline without rewriting history.
    this.db
      .prepare('INSERT OR IGNORE INTO patient_archive_baselines VALUES(?,?,?,?)')
      .run(id, current.version, JSON.stringify(before), context.now);
    const next: PatientSnapshot = { ...before, ...fields, version: current.version + 1 };
    this.db
      .prepare(
        `UPDATE patients SET name=?,gender=?,age=?,phone=?,diagnosis=?,tags_json=?,status=?,
        allergies_json=?,medical_history_json=?,care_summary=?,symptoms_json=?,allergy_status=? WHERE id=?`,
      )
      .run(
        next.name,
        next.gender,
        next.age,
        next.phone,
        next.diagnosis,
        JSON.stringify(next.tags),
        next.status,
        JSON.stringify(next.allergies),
        JSON.stringify(next.medicalHistory),
        next.careSummary,
        JSON.stringify(next.symptoms),
        next.allergyStatus,
        id,
      );
    this.db
      .prepare('INSERT INTO patient_archive_versions VALUES(?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        id,
        next.version,
        JSON.stringify(next),
        context.actorId,
        context.now,
        changeReason,
      );
    recordAudit();
    return { kind: 'saved', patient: { ...next, canEdit: true } };
  }
}
