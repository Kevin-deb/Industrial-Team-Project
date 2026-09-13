import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateMedicalRecordRequest,
  MedicalRecord,
  MedicalRecordDetail,
  UpdateMedicalRecordRequest,
} from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';
import { clinicalTemplateFields } from './templates.js';

type Row = Record<string, string | number | bigint | null | Uint8Array>;
export type UpdateDraftResult =
  | { kind: 'updated'; record: MedicalRecordDetail }
  | { kind: 'not-found' }
  | { kind: 'not-draft' }
  | { kind: 'stale'; currentVersion: number };

export interface ClinicalRepository {
  listRecords(context: RequestContext): MedicalRecord[];
  findRecord(id: string, context: RequestContext): MedicalRecordDetail | undefined;
  canAccessPatient(patientId: string, context: RequestContext): boolean;
  createDraft(input: CreateMedicalRecordRequest, context: RequestContext): MedicalRecordDetail;
  updateDraft(
    id: string,
    expectedVersion: number,
    input: UpdateMedicalRecordRequest,
    context: RequestContext,
  ): UpdateDraftResult;
}

function mapSummary(row: Row): MedicalRecord {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    title: String(row.title),
    diagnosis: String(row.diagnosis),
    status: row.status as MedicalRecord['status'],
    authorName: String(row.author_name),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
    orderCount: Number(row.order_count),
  };
}

function mapDetail(row: Row): MedicalRecordDetail {
  const storedTemplate = String(row.template_id);
  const templateId = (
    storedTemplate in clinicalTemplateFields ? storedTemplate : 'outpatient'
  ) as MedicalRecordDetail['templateId'];
  const storedBody = JSON.parse(String(row.body_json)) as Record<string, unknown>;
  const body = Object.fromEntries(
    clinicalTemplateFields[templateId].map((key) => [
      key,
      typeof storedBody[key] === 'string' ? storedBody[key] : '',
    ]),
  );
  return {
    ...mapSummary(row),
    encounterId: row.encounter_id === null ? null : String(row.encounter_id),
    templateId,
    body,
    authoredAt: String(row.authored_at),
    amendmentReason: row.amendment_reason === null ? null : String(row.amendment_reason),
  };
}

const recordSelect = `SELECT r.*,p.name patient_name,i.display_name author_name,
  v.template_id,v.body_json,v.authored_at,v.amendment_reason,
  (SELECT COUNT(*) FROM medical_orders o WHERE o.record_id=r.id) order_count
  FROM medical_records r
  JOIN patients p ON p.id=r.patient_id
  JOIN identities i ON i.id=r.author_id
  JOIN medical_record_versions v ON v.record_id=r.id AND v.version=r.version`;

export class SqliteClinicalRepository implements ClinicalRepository {
  constructor(private readonly db: DatabaseSync) {}

  listRecords(context: RequestContext): MedicalRecord[] {
    return this.db
      .prepare(`${recordSelect} WHERE ${patientScopeSql} ORDER BY r.updated_at DESC`)
      .all({ ...context })
      .map((row) => mapSummary(row as Row));
  }

  findRecord(id: string, context: RequestContext): MedicalRecordDetail | undefined {
    const row = this.db
      .prepare(`${recordSelect} WHERE r.id=:id AND ${patientScopeSql}`)
      .get({ id, ...context });
    return row ? mapDetail(row as Row) : undefined;
  }

  canAccessPatient(patientId: string, context: RequestContext): boolean {
    return !!this.db
      .prepare(`SELECT 1 FROM patients p WHERE p.id=:patientId AND ${patientScopeSql}`)
      .get({ patientId, ...context });
  }

  createDraft(input: CreateMedicalRecordRequest, context: RequestContext): MedicalRecordDetail {
    const id = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO medical_records(
            id,patient_id,encounter_id,title,diagnosis,status,author_id,updated_at,version,archived_at
          ) VALUES(?,?,?,?,?,'draft',?,?,1,NULL)`,
        )
        .run(
          id,
          input.patientId,
          input.encounterId ?? null,
          input.title,
          input.diagnosis,
          context.actorId,
          context.now,
        );
      this.db
        .prepare(
          `INSERT INTO medical_record_versions(
            id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason
          ) VALUES(?,?,1,?,?,?,?,NULL)`,
        )
        .run(
          randomUUID(),
          id,
          input.templateId,
          JSON.stringify(input.body),
          context.actorId,
          context.now,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.findRecord(id, context)!;
  }

  updateDraft(
    id: string,
    expectedVersion: number,
    input: UpdateMedicalRecordRequest,
    context: RequestContext,
  ): UpdateDraftResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db
        .prepare(
          `SELECT r.status,r.version FROM medical_records r JOIN patients p ON p.id=r.patient_id
           WHERE r.id=:id AND r.author_id=:actorId AND ${patientScopeSql}`,
        )
        .get({ id, ...context });
      if (!current) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      if (String(current.status) !== 'draft') {
        this.db.exec('ROLLBACK');
        return { kind: 'not-draft' };
      }
      const currentVersion = Number(current.version);
      if (currentVersion !== expectedVersion) {
        this.db.exec('ROLLBACK');
        return { kind: 'stale', currentVersion };
      }
      const nextVersion = currentVersion + 1;
      const template = this.db
        .prepare('SELECT template_id FROM medical_record_versions WHERE record_id=? AND version=?')
        .get(id, currentVersion)!;
      const storedTemplate = String(template.template_id);
      const templateId = storedTemplate in clinicalTemplateFields ? storedTemplate : 'outpatient';
      this.db
        .prepare(
          `INSERT INTO medical_record_versions(
            id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason
          ) VALUES(?,?,?,?,?,?,?,NULL)`,
        )
        .run(
          randomUUID(),
          id,
          nextVersion,
          templateId,
          JSON.stringify(input.body),
          context.actorId,
          context.now,
        );
      this.db
        .prepare('UPDATE medical_records SET title=?,diagnosis=?,updated_at=?,version=? WHERE id=?')
        .run(input.title, input.diagnosis, context.now, nextVersion, id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { kind: 'updated', record: this.findRecord(id, context)! };
  }
}
