import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ClinicalMaterialReference,
  CreateClinicalMaterialRequest,
  CreateMedicalOrderRequest,
  CreateMedicalRecordRequest,
  MedicalOrder,
  MedicalOrderDetail,
  MedicalOrderStatus,
  MedicalOrderTemplateId,
  MedicalOrderVersion,
  MedicalRecord,
  MedicalRecordDetail,
  MedicalRecordTemplateId,
  MedicalRecordVersion,
  ReviewMedicalRecordRequest,
  UpdateMedicalOrderRequest,
  UpdateMedicalRecordRequest,
} from '@doctor/contracts';
import type { EncounterRepository } from '../encounters/index.js';
import { patientScopeSql, type PermissionPort, type RequestContext } from '../platform/index.js';
import {
  hasValidOrderPayload,
  orderTemplateFields,
  orderTemplateVersions,
} from './order-templates.js';
import {
  clinicalTemplateFields,
  clinicalTemplateVersions,
  isRecordReadyToSubmit,
} from './templates.js';

type Row = Record<string, string | number | bigint | null | Uint8Array>;
export type UpdateDraftResult =
  | { kind: 'updated'; record: MedicalRecordDetail }
  | { kind: 'not-found' }
  | { kind: 'not-draft' }
  | { kind: 'stale'; currentVersion: number };

export type LifecycleCommandResult =
  | { kind: 'ok'; record: MedicalRecordDetail; replayed: boolean }
  | { kind: 'not-found' }
  | { kind: 'stale'; currentVersion: number }
  | { kind: 'conflict' }
  | { kind: 'incomplete' }
  | { kind: 'forbidden'; code: 'RECORD_REVIEW_DENIED' | 'RECORD_REVIEW_OWN_VERSION' }
  | {
      kind: 'invalid-state';
      code:
        | 'RECORD_NOT_SUBMITTABLE'
        | 'RECORD_NOT_REVIEWABLE'
        | 'RECORD_NOT_ARCHIVABLE'
        | 'RECORD_NOT_CORRECTABLE';
    };

type CommandOperation = 'submit' | 'review' | 'archive' | 'correct';

export interface RecordFilters {
  patientId?: string;
  encounterId?: string;
  status?: MedicalRecord['status'];
}

export interface OrderFilters {
  recordId?: string;
  patientId?: string;
  status?: MedicalOrderStatus;
}

export type OrderCommandResult =
  | { kind: 'ok'; order: MedicalOrderDetail; replayed: boolean }
  | { kind: 'not-found' }
  | { kind: 'stale'; currentVersion: number }
  | { kind: 'conflict' }
  | { kind: 'unconfirmed' }
  | { kind: 'invalid-payload' }
  | { kind: 'invalid-state'; code: 'ORDER_NOT_ACTIVE' };

export type MaterialCommandResult =
  | { kind: 'ok'; material: ClinicalMaterialReference; replayed: boolean }
  | { kind: 'not-found' }
  | { kind: 'conflict' }
  | { kind: 'forbidden' }
  | { kind: 'invalid-sections' }
  | {
      kind: 'invalid-state';
      code:
        | 'RECORD_VERSION_NOT_SHAREABLE'
        | 'CONSULTATION_NOT_ACTIVE'
        | 'MATERIAL_ALREADY_LINKED'
        | 'REPORT_NOT_CONFIRMED';
    };

export interface ClinicalRepository {
  listRecords(filters: RecordFilters, context: RequestContext): MedicalRecord[];
  findRecord(id: string, context: RequestContext): MedicalRecordDetail | undefined;
  listVersions(id: string, context: RequestContext): MedicalRecordVersion[] | undefined;
  findVersion(
    id: string,
    version: number,
    context: RequestContext,
  ): MedicalRecordVersion | undefined;
  canAccessPatient(patientId: string, context: RequestContext): boolean;
  createDraft(input: CreateMedicalRecordRequest, context: RequestContext): MedicalRecordDetail;
  updateDraft(
    id: string,
    expectedVersion: number,
    input: UpdateMedicalRecordRequest,
    context: RequestContext,
  ): UpdateDraftResult;
  submit(
    id: string,
    expectedVersion: number,
    requestKey: string,
    context: RequestContext,
  ): LifecycleCommandResult;
  review(
    id: string,
    expectedVersion: number,
    requestKey: string,
    input: ReviewMedicalRecordRequest,
    context: RequestContext,
  ): LifecycleCommandResult;
  archive(
    id: string,
    expectedVersion: number,
    requestKey: string,
    context: RequestContext,
  ): LifecycleCommandResult;
  correct(
    id: string,
    expectedVersion: number,
    requestKey: string,
    reason: string,
    context: RequestContext,
  ): LifecycleCommandResult;
  listOrders(filters: OrderFilters, context: RequestContext): MedicalOrder[];
  findOrder(id: string, context: RequestContext): MedicalOrderDetail | undefined;
  listOrderVersions(id: string, context: RequestContext): MedicalOrderVersion[] | undefined;
  findOrderVersion(
    id: string,
    version: number,
    context: RequestContext,
  ): MedicalOrderVersion | undefined;
  createOrder(
    recordId: string,
    requestKey: string,
    input: CreateMedicalOrderRequest,
    context: RequestContext,
  ): OrderCommandResult;
  updateOrder(
    id: string,
    expectedVersion: number,
    input: UpdateMedicalOrderRequest,
    context: RequestContext,
  ): OrderCommandResult;
  stopOrder(
    id: string,
    expectedVersion: number,
    requestKey: string,
    reason: string,
    context: RequestContext,
  ): OrderCommandResult;
  listMaterials(consultationId: string, context: RequestContext): ClinicalMaterialReference[];
  findMaterial(id: string, context: RequestContext): ClinicalMaterialReference | undefined;
  createMaterial(
    requestKey: string,
    input: CreateClinicalMaterialRequest,
    context: RequestContext,
  ): MaterialCommandResult;
  linkMaterialReport(
    id: string,
    requestKey: string,
    reportId: string,
    context: RequestContext,
  ): MaterialCommandResult;
}

function resolveTemplateId(value: string): MedicalRecordTemplateId {
  if (value in clinicalTemplateFields) return value as MedicalRecordTemplateId;
  // Explicit compatibility for databases created before the structured catalogue.
  if (value === 'general-followup-v1') return 'followup';
  throw new Error(`Unsupported medical record template: ${value}`);
}

function mapBody(templateId: MedicalRecordTemplateId, value: string): Record<string, string> {
  const storedBody = JSON.parse(value) as Record<string, unknown>;
  return Object.fromEntries(
    clinicalTemplateFields[templateId].map((key) => [
      key,
      typeof storedBody[key] === 'string' ? storedBody[key] : '',
    ]),
  );
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function mapVersion(row: Row): MedicalRecordVersion {
  const templateId = resolveTemplateId(String(row.template_id));
  return {
    recordId: String(row.record_id),
    version: Number(row.version),
    title: String(row.version_title),
    diagnosis: String(row.version_diagnosis),
    templateId,
    templateVersion: Number(row.template_version),
    body: mapBody(templateId, String(row.body_json)),
    authorName: String(row.author_name),
    authoredAt: String(row.authored_at),
    amendmentReason: row.amendment_reason === null ? null : String(row.amendment_reason),
  };
}

function resolveOrderTemplateId(value: string): MedicalOrderTemplateId {
  if (value in orderTemplateFields) return value as MedicalOrderTemplateId;
  return 'examination';
}

function mapOrderPayload(
  templateId: MedicalOrderTemplateId,
  value: string,
): Record<string, string> {
  const stored = JSON.parse(value) as Record<string, unknown>;
  return Object.fromEntries(
    orderTemplateFields[templateId].map((key) => [
      key,
      typeof stored[key] === 'string' ? stored[key] : '',
    ]),
  );
}

function mapOrder(row: Row): MedicalOrder {
  return {
    id: String(row.id),
    recordId: String(row.record_id),
    patientId: String(row.patient_id),
    type: row.type as MedicalOrder['type'],
    status: row.status as MedicalOrderStatus,
    version: Number(row.current_version),
    authorName: String(row.author_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.authored_at),
    stoppedAt: row.stopped_at === null ? null : String(row.stopped_at),
    stopReason: row.stop_reason === null ? null : String(row.stop_reason),
  };
}

function mapOrderDetail(row: Row): MedicalOrderDetail {
  const templateId = resolveOrderTemplateId(String(row.template_id));
  return {
    ...mapOrder(row),
    templateId,
    templateVersion: Number(row.template_version),
    payload: mapOrderPayload(templateId, String(row.payload_json)),
    changeReason: String(row.change_reason),
  };
}

function mapOrderVersion(row: Row): MedicalOrderVersion {
  const templateId = resolveOrderTemplateId(String(row.template_id));
  return {
    orderId: String(row.order_id),
    version: Number(row.version),
    templateId,
    templateVersion: Number(row.template_version),
    payload: mapOrderPayload(templateId, String(row.payload_json)),
    authorName: String(row.author_name),
    authoredAt: String(row.authored_at),
    changeReason: String(row.change_reason),
  };
}

function mapMaterial(row: Row): ClinicalMaterialReference {
  return {
    id: String(row.id),
    consultationId: String(row.consultation_id),
    patientId: String(row.patient_id),
    recordId: String(row.record_id),
    recordVersion: Number(row.record_version),
    sharedSections: JSON.parse(String(row.shared_sections_json)) as string[],
    purpose: String(row.purpose),
    createdByName: String(row.created_by_name),
    createdAt: String(row.created_at),
    reportId: row.report_id === null ? null : String(row.report_id),
    linkedAt: row.linked_at === null ? null : String(row.linked_at),
  };
}

const recordSelect = `SELECT r.*,p.name patient_name,i.display_name author_name,
  v.template_id,v.template_version,v.body_json,v.authored_at,v.amendment_reason,
  v.authored_by version_authored_by,
  rv.record_version review_record_version,rv.decision review_decision,
  rv.comment review_comment,rv.reviewed_at,reviewer.display_name reviewer_name,
  (SELECT COUNT(*) FROM medical_orders o WHERE o.record_id=r.id) order_count
  FROM medical_records r
  JOIN patients p ON p.id=r.patient_id
  JOIN identities i ON i.id=r.author_id
  JOIN medical_record_versions v ON v.record_id=r.id AND v.version=r.version
  LEFT JOIN record_reviews rv ON rv.id=(
    SELECT latest.id FROM record_reviews latest WHERE latest.record_id=r.id
    ORDER BY julianday(latest.reviewed_at) DESC,latest.id DESC LIMIT 1
  )
  LEFT JOIN identities reviewer ON reviewer.id=rv.reviewer_id`;

const versionSelect = `SELECT v.*,v.title version_title,v.diagnosis version_diagnosis,
  i.display_name author_name
  FROM medical_record_versions v
  JOIN medical_records r ON r.id=v.record_id
  JOIN patients p ON p.id=r.patient_id
  JOIN identities i ON i.id=v.authored_by`;

const orderSelect = `SELECT o.*,i.display_name author_name,v.template_id,v.template_version,
  v.payload_json,v.authored_at,v.change_reason
  FROM medical_orders o
  JOIN patients p ON p.id=o.patient_id
  JOIN identities i ON i.id=o.created_by
  JOIN medical_order_versions v ON v.order_id=o.id AND v.version=o.current_version`;

const orderVersionSelect = `SELECT v.*,i.display_name author_name
  FROM medical_order_versions v
  JOIN medical_orders o ON o.id=v.order_id
  JOIN patients p ON p.id=o.patient_id
  JOIN identities i ON i.id=v.authored_by`;

const materialSelect = `SELECT m.*,i.display_name created_by_name
  FROM clinical_materials m
  JOIN patients p ON p.id=m.patient_id
  JOIN identities i ON i.id=m.created_by`;

export class SqliteClinicalRepository implements ClinicalRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly permissions: PermissionPort,
    private readonly consultations: Pick<
      EncounterRepository,
      'findConsultationTask' | 'findConfirmedReport'
    >,
  ) {}

  listRecords(filters: RecordFilters, context: RequestContext): MedicalRecord[] {
    const clauses = [patientScopeSql];
    if (filters.patientId) clauses.push('r.patient_id=:patientId');
    if (filters.encounterId) clauses.push('r.encounter_id=:encounterId');
    if (filters.status) clauses.push('r.status=:status');
    return this.db
      .prepare(`${recordSelect} WHERE ${clauses.join(' AND ')} ORDER BY r.updated_at DESC,r.id`)
      .all({ ...context, ...filters })
      .map((row) => mapSummary(row as Row));
  }

  findRecord(id: string, context: RequestContext): MedicalRecordDetail | undefined {
    const row = this.db
      .prepare(`${recordSelect} WHERE r.id=:id AND ${patientScopeSql}`)
      .get({ id, ...context });
    return row ? this.mapDetail(row as Row, context) : undefined;
  }

  listVersions(id: string, context: RequestContext): MedicalRecordVersion[] | undefined {
    if (!this.findRecord(id, context)) return undefined;
    return this.db
      .prepare(`${versionSelect} WHERE r.id=:id AND ${patientScopeSql} ORDER BY v.version DESC`)
      .all({ id, ...context })
      .map((row) => mapVersion(row as Row));
  }

  findVersion(
    id: string,
    version: number,
    context: RequestContext,
  ): MedicalRecordVersion | undefined {
    const row = this.db
      .prepare(`${versionSelect} WHERE r.id=:id AND v.version=:version AND ${patientScopeSql}`)
      .get({ id, version, ...context });
    return row ? mapVersion(row as Row) : undefined;
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
            id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason,
            template_version,title,diagnosis
          ) VALUES(?,?,1,?,?,?,?,NULL,?,?,?)`,
        )
        .run(
          randomUUID(),
          id,
          input.templateId,
          JSON.stringify(input.body),
          context.actorId,
          context.now,
          clinicalTemplateVersions[input.templateId],
          input.title,
          input.diagnosis,
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
      const current = this.lockRecord(id, context);
      if (!current) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      if (String(current.status) !== 'draft' || !this.canEditLocked(current, context)) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-draft' };
      }
      const currentVersion = Number(current.version);
      if (currentVersion !== expectedVersion) {
        this.db.exec('ROLLBACK');
        return { kind: 'stale', currentVersion };
      }
      const nextVersion = currentVersion + 1;
      const templateId = resolveTemplateId(String(current.template_id));
      this.db
        .prepare(
          `INSERT INTO medical_record_versions(
            id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason,
            template_version,title,diagnosis
          ) VALUES(?,?,?,?,?,?,?,NULL,?,?,?)`,
        )
        .run(
          randomUUID(),
          id,
          nextVersion,
          templateId,
          JSON.stringify(input.body),
          context.actorId,
          context.now,
          Number(current.template_version),
          input.title,
          input.diagnosis,
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

  submit(
    id: string,
    expectedVersion: number,
    requestKey: string,
    context: RequestContext,
  ): LifecycleCommandResult {
    return this.runCommand(
      id,
      'submit',
      expectedVersion,
      requestKey,
      ['submit'],
      context,
      (current) => {
        if (String(current.status) !== 'draft' || !this.canEditLocked(current, context))
          return { kind: 'invalid-state', code: 'RECORD_NOT_SUBMITTABLE' };
        const templateId = resolveTemplateId(String(current.template_id));
        const body = mapBody(templateId, String(current.body_json));
        if (
          !isRecordReadyToSubmit(templateId, String(current.title), String(current.diagnosis), body)
        )
          return { kind: 'incomplete' };
        this.db
          .prepare("UPDATE medical_records SET status='pending-review',updated_at=? WHERE id=?")
          .run(context.now, id);
        return undefined;
      },
    );
  }

  review(
    id: string,
    expectedVersion: number,
    requestKey: string,
    input: ReviewMedicalRecordRequest,
    context: RequestContext,
  ): LifecycleCommandResult {
    return this.runCommand(
      id,
      'review',
      expectedVersion,
      requestKey,
      ['review', input.decision, input.comment],
      context,
      (current) => {
        if (!this.permissions.hasPermission(context.actorId, 'clinical:review'))
          return { kind: 'forbidden', code: 'RECORD_REVIEW_DENIED' };
        if (String(current.version_authored_by) === context.actorId)
          return { kind: 'forbidden', code: 'RECORD_REVIEW_OWN_VERSION' };
        if (String(current.status) !== 'pending-review' || this.isCurrentVersionApproved(current))
          return { kind: 'invalid-state', code: 'RECORD_NOT_REVIEWABLE' };
        this.db
          .prepare(
            `INSERT INTO record_reviews(id,record_id,record_version,reviewer_id,decision,comment,reviewed_at)
             VALUES(?,?,?,?,?,?,?)`,
          )
          .run(
            randomUUID(),
            id,
            Number(current.version),
            context.actorId,
            input.decision,
            input.comment,
            context.now,
          );
        this.db
          .prepare(`UPDATE medical_records SET status=?,updated_at=? WHERE id=?`)
          .run(input.decision === 'returned' ? 'draft' : 'pending-review', context.now, id);
        return undefined;
      },
    );
  }

  archive(
    id: string,
    expectedVersion: number,
    requestKey: string,
    context: RequestContext,
  ): LifecycleCommandResult {
    return this.runCommand(
      id,
      'archive',
      expectedVersion,
      requestKey,
      ['archive'],
      context,
      (current) => {
        if (String(current.status) !== 'pending-review' || !this.isCurrentVersionApproved(current))
          return { kind: 'invalid-state', code: 'RECORD_NOT_ARCHIVABLE' };
        this.db
          .prepare(
            "UPDATE medical_records SET status='archived',archived_at=?,updated_at=? WHERE id=?",
          )
          .run(context.now, context.now, id);
        return undefined;
      },
    );
  }

  correct(
    id: string,
    expectedVersion: number,
    requestKey: string,
    reason: string,
    context: RequestContext,
  ): LifecycleCommandResult {
    return this.runCommand(
      id,
      'correct',
      expectedVersion,
      requestKey,
      ['correct', reason],
      context,
      (current) => {
        if (String(current.status) !== 'archived')
          return { kind: 'invalid-state', code: 'RECORD_NOT_CORRECTABLE' };
        const nextVersion = Number(current.version) + 1;
        const templateId = resolveTemplateId(String(current.template_id));
        this.db
          .prepare(
            `INSERT INTO medical_record_versions(
              id,record_id,version,template_id,body_json,authored_by,authored_at,amendment_reason,
              template_version,title,diagnosis
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            randomUUID(),
            id,
            nextVersion,
            templateId,
            String(current.body_json),
            context.actorId,
            context.now,
            reason,
            Number(current.template_version),
            String(current.title),
            String(current.diagnosis),
          );
        this.db
          .prepare(
            `UPDATE medical_records SET status='draft',archived_at=NULL,updated_at=?,version=? WHERE id=?`,
          )
          .run(context.now, nextVersion, id);
        return undefined;
      },
    );
  }

  listOrders(filters: OrderFilters, context: RequestContext): MedicalOrder[] {
    const clauses = [patientScopeSql];
    if (filters.recordId) clauses.push('o.record_id=:recordId');
    if (filters.patientId) clauses.push('o.patient_id=:patientId');
    if (filters.status) clauses.push('o.status=:status');
    return this.db
      .prepare(`${orderSelect} WHERE ${clauses.join(' AND ')} ORDER BY o.created_at DESC,o.id`)
      .all({ ...context, ...filters })
      .map((row) => mapOrder(row as Row));
  }

  findOrder(id: string, context: RequestContext): MedicalOrderDetail | undefined {
    const row = this.db
      .prepare(`${orderSelect} WHERE o.id=:id AND ${patientScopeSql}`)
      .get({ id, ...context });
    return row ? mapOrderDetail(row as Row) : undefined;
  }

  listOrderVersions(id: string, context: RequestContext): MedicalOrderVersion[] | undefined {
    if (!this.findOrder(id, context)) return undefined;
    return this.db
      .prepare(
        `${orderVersionSelect} WHERE o.id=:id AND ${patientScopeSql} ORDER BY v.version DESC`,
      )
      .all({ id, ...context })
      .map((row) => mapOrderVersion(row as Row));
  }

  findOrderVersion(
    id: string,
    version: number,
    context: RequestContext,
  ): MedicalOrderVersion | undefined {
    const row = this.db
      .prepare(`${orderVersionSelect} WHERE o.id=:id AND v.version=:version AND ${patientScopeSql}`)
      .get({ id, version, ...context });
    return row ? mapOrderVersion(row as Row) : undefined;
  }

  createOrder(
    recordId: string,
    requestKey: string,
    input: CreateMedicalOrderRequest,
    context: RequestContext,
  ): OrderCommandResult {
    if (!input.confirmed) return { kind: 'unconfirmed' };
    if (!hasValidOrderPayload(input.templateId, input.payload)) return { kind: 'invalid-payload' };
    const requestHash = fingerprint(['create', input.templateId, input.payload]);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const record = this.lockRecord(recordId, context);
      if (!record) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      const existing = this.db
        .prepare(
          `SELECT request_hash,order_id FROM clinical_order_receipts
           WHERE actor_id=? AND operation=? AND resource_id=? AND request_key=?`,
        )
        .get(context.actorId, 'create', recordId, requestKey) as
        { request_hash: string; order_id: string } | undefined;
      if (existing) {
        this.db.exec('ROLLBACK');
        return existing.request_hash === requestHash
          ? { kind: 'ok', order: this.findOrder(existing.order_id, context)!, replayed: true }
          : { kind: 'conflict' };
      }
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO medical_orders(
            id,record_id,patient_id,type,status,current_version,created_by,created_at,stopped_at,stop_reason
          ) VALUES(?,?,?,?,'active',1,?,?,NULL,NULL)`,
        )
        .run(
          id,
          recordId,
          String(record.patient_id),
          input.templateId,
          context.actorId,
          context.now,
        );
      this.db
        .prepare(
          `INSERT INTO medical_order_versions(
            id,order_id,version,payload_json,authored_by,authored_at,change_reason,template_id,template_version
          ) VALUES(?,?,1,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          id,
          JSON.stringify(input.payload),
          context.actorId,
          context.now,
          '初诊开立',
          input.templateId,
          orderTemplateVersions[input.templateId],
        );
      this.db
        .prepare(
          `INSERT INTO clinical_order_receipts(
            actor_id,operation,resource_id,request_key,request_hash,order_id,created_at
          ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(context.actorId, 'create', recordId, requestKey, requestHash, id, context.now);
      this.db.exec('COMMIT');
      return { kind: 'ok', order: this.findOrder(id, context)!, replayed: false };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  updateOrder(
    id: string,
    expectedVersion: number,
    input: UpdateMedicalOrderRequest,
    context: RequestContext,
  ): OrderCommandResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.lockOrder(id, context);
      if (!current) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      if (String(current.status) !== 'active') {
        this.db.exec('ROLLBACK');
        return { kind: 'invalid-state', code: 'ORDER_NOT_ACTIVE' };
      }
      const currentVersion = Number(current.current_version);
      if (currentVersion !== expectedVersion) {
        this.db.exec('ROLLBACK');
        return { kind: 'stale', currentVersion };
      }
      const templateId = resolveOrderTemplateId(String(current.template_id));
      if (!hasValidOrderPayload(templateId, input.payload)) {
        this.db.exec('ROLLBACK');
        return { kind: 'invalid-payload' };
      }
      const nextVersion = currentVersion + 1;
      this.db
        .prepare(
          `INSERT INTO medical_order_versions(
            id,order_id,version,payload_json,authored_by,authored_at,change_reason,template_id,template_version
          ) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          id,
          nextVersion,
          JSON.stringify(input.payload),
          context.actorId,
          context.now,
          input.changeReason,
          templateId,
          Number(current.template_version),
        );
      this.db
        .prepare('UPDATE medical_orders SET current_version=? WHERE id=?')
        .run(nextVersion, id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { kind: 'ok', order: this.findOrder(id, context)!, replayed: false };
  }

  stopOrder(
    id: string,
    expectedVersion: number,
    requestKey: string,
    reason: string,
    context: RequestContext,
  ): OrderCommandResult {
    const requestHash = fingerprint(['stop', reason]);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.lockOrder(id, context);
      if (!current) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      const existing = this.db
        .prepare(
          `SELECT request_hash FROM clinical_order_receipts
           WHERE actor_id=? AND operation=? AND resource_id=? AND request_key=?`,
        )
        .get(context.actorId, 'stop', id, requestKey) as { request_hash: string } | undefined;
      if (existing) {
        this.db.exec('ROLLBACK');
        return existing.request_hash === requestHash
          ? { kind: 'ok', order: this.findOrder(id, context)!, replayed: true }
          : { kind: 'conflict' };
      }
      if (Number(current.current_version) !== expectedVersion) {
        const currentVersion = Number(current.current_version);
        this.db.exec('ROLLBACK');
        return { kind: 'stale', currentVersion };
      }
      if (String(current.status) !== 'active') {
        this.db.exec('ROLLBACK');
        return { kind: 'invalid-state', code: 'ORDER_NOT_ACTIVE' };
      }
      this.db
        .prepare("UPDATE medical_orders SET status='stopped',stopped_at=?,stop_reason=? WHERE id=?")
        .run(context.now, reason, id);
      this.db
        .prepare(
          `INSERT INTO clinical_order_receipts(
            actor_id,operation,resource_id,request_key,request_hash,order_id,created_at
          ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(context.actorId, 'stop', id, requestKey, requestHash, id, context.now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { kind: 'ok', order: this.findOrder(id, context)!, replayed: false };
  }

  listMaterials(consultationId: string, context: RequestContext): ClinicalMaterialReference[] {
    const task = this.consultations.findConsultationTask(consultationId, context);
    if (!task?.isParticipant || !this.isActiveConsultation(task)) return [];
    return this.db
      .prepare(
        `${materialSelect} WHERE m.consultation_id=:consultationId AND ${patientScopeSql}
         ORDER BY m.created_at DESC,m.id`,
      )
      .all({ consultationId, ...context })
      .map((row) => mapMaterial(row as Row));
  }

  findMaterial(id: string, context: RequestContext): ClinicalMaterialReference | undefined {
    const row = this.db
      .prepare(`${materialSelect} WHERE m.id=:id AND ${patientScopeSql}`)
      .get({ id, ...context });
    if (!row) return undefined;
    const material = mapMaterial(row as Row);
    const task = this.consultations.findConsultationTask(material.consultationId, context);
    return task?.isParticipant && this.isActiveConsultation(task) ? material : undefined;
  }

  createMaterial(
    requestKey: string,
    input: CreateClinicalMaterialRequest,
    context: RequestContext,
  ): MaterialCommandResult {
    const requestHash = fingerprint([
      'create',
      input.consultationId,
      input.recordId,
      input.recordVersion,
      input.sharedSections,
      input.purpose,
    ]);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db
        .prepare(
          `SELECT request_hash,material_id FROM clinical_material_receipts
           WHERE actor_id=? AND operation=? AND resource_id=? AND request_key=?`,
        )
        .get(context.actorId, 'create', input.consultationId, requestKey) as
        { request_hash: string; material_id: string } | undefined;
      if (existing) {
        this.db.exec('ROLLBACK');
        return existing.request_hash === requestHash
          ? {
              kind: 'ok',
              material: this.findMaterial(existing.material_id, context)!,
              replayed: true,
            }
          : { kind: 'conflict' };
      }
      const gate = this.materialWriteGate(input, context);
      if (gate) {
        this.db.exec('ROLLBACK');
        return gate;
      }
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO clinical_materials(
            id,consultation_id,patient_id,record_id,record_version,shared_sections_json,purpose,
            created_by,created_at,report_id,linked_at
          ) VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL)`,
        )
        .run(
          id,
          input.consultationId,
          this.consultations.findConsultationTask(input.consultationId, context)!.patientId,
          input.recordId,
          input.recordVersion,
          JSON.stringify(input.sharedSections),
          input.purpose,
          context.actorId,
          context.now,
        );
      this.db
        .prepare(
          `INSERT INTO clinical_material_receipts(
            actor_id,operation,resource_id,request_key,request_hash,material_id,created_at
          ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          context.actorId,
          'create',
          input.consultationId,
          requestKey,
          requestHash,
          id,
          context.now,
        );
      this.db.exec('COMMIT');
      return { kind: 'ok', material: this.findMaterial(id, context)!, replayed: false };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  linkMaterialReport(
    id: string,
    requestKey: string,
    reportId: string,
    context: RequestContext,
  ): MaterialCommandResult {
    const requestHash = fingerprint(['link', reportId]);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db
        .prepare(`${materialSelect} WHERE m.id=:id AND ${patientScopeSql}`)
        .get({ id, ...context }) as Row | undefined;
      if (!current) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      const existing = this.db
        .prepare(
          `SELECT request_hash FROM clinical_material_receipts
           WHERE actor_id=? AND operation=? AND resource_id=? AND request_key=?`,
        )
        .get(context.actorId, 'link', id, requestKey) as { request_hash: string } | undefined;
      if (existing) {
        this.db.exec('ROLLBACK');
        return existing.request_hash === requestHash
          ? { kind: 'ok', material: this.findMaterial(id, context)!, replayed: true }
          : { kind: 'conflict' };
      }
      const task = this.consultations.findConsultationTask(
        String(current.consultation_id),
        context,
      );
      if (!task) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      if (!task.isParticipant) {
        this.db.exec('ROLLBACK');
        return { kind: 'forbidden' };
      }
      if (!this.isActiveConsultation(task)) {
        this.db.exec('ROLLBACK');
        return { kind: 'invalid-state', code: 'CONSULTATION_NOT_ACTIVE' };
      }
      if (current.report_id !== null) {
        this.db.exec('ROLLBACK');
        return { kind: 'invalid-state', code: 'MATERIAL_ALREADY_LINKED' };
      }
      if (!this.consultations.findConfirmedReport(task.id, reportId, context)) {
        this.db.exec('ROLLBACK');
        return { kind: 'invalid-state', code: 'REPORT_NOT_CONFIRMED' };
      }
      this.db
        .prepare('UPDATE clinical_materials SET report_id=?,linked_at=? WHERE id=?')
        .run(reportId, context.now, id);
      this.db
        .prepare(
          `INSERT INTO clinical_material_receipts(
            actor_id,operation,resource_id,request_key,request_hash,material_id,created_at
          ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(context.actorId, 'link', id, requestKey, requestHash, id, context.now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { kind: 'ok', material: this.findMaterial(id, context)!, replayed: false };
  }

  private mapDetail(row: Row, context: RequestContext): MedicalRecordDetail {
    const templateId = resolveTemplateId(String(row.template_id));
    const body = mapBody(templateId, String(row.body_json));
    const status = row.status as MedicalRecord['status'];
    const version = Number(row.version);
    const canReviewPermission = this.permissions.hasPermission(context.actorId, 'clinical:review');
    const approvedCurrent = this.isCurrentVersionApproved(row);
    return {
      ...mapSummary(row),
      encounterId: row.encounter_id === null ? null : String(row.encounter_id),
      templateId,
      templateVersion: Number(row.template_version),
      body,
      authoredAt: String(row.authored_at),
      amendmentReason: row.amendment_reason === null ? null : String(row.amendment_reason),
      latestReview:
        row.review_decision === null
          ? null
          : {
              recordVersion: Number(row.review_record_version),
              decision: row.review_decision as 'approved' | 'returned',
              comment: String(row.review_comment),
              reviewerName: String(row.reviewer_name),
              reviewedAt: String(row.reviewed_at),
            },
      availableActions: {
        canEdit: status === 'draft' && this.canEditLocked(row, context),
        canSubmit:
          status === 'draft' &&
          this.canEditLocked(row, context) &&
          isRecordReadyToSubmit(templateId, String(row.title), String(row.diagnosis), body),
        canReview:
          status === 'pending-review' &&
          canReviewPermission &&
          String(row.version_authored_by) !== context.actorId &&
          !approvedCurrent,
        canArchive: status === 'pending-review' && approvedCurrent,
        canCorrect: status === 'archived',
      },
    };
  }

  private canEditLocked(row: Row, context: RequestContext): boolean {
    return (
      String(row.author_id) === context.actorId ||
      String(row.version_authored_by) === context.actorId
    );
  }

  private isCurrentVersionApproved(row: Row): boolean {
    return (
      row.review_decision === 'approved' &&
      Number(row.review_record_version) === Number(row.version)
    );
  }

  private lockRecord(id: string, context: RequestContext): Row | undefined {
    const row = this.db
      .prepare(`${recordSelect} WHERE r.id=:id AND ${patientScopeSql}`)
      .get({ id, ...context });
    return row ? (row as Row) : undefined;
  }

  private lockOrder(id: string, context: RequestContext): Row | undefined {
    const row = this.db
      .prepare(`${orderSelect} WHERE o.id=:id AND ${patientScopeSql}`)
      .get({ id, ...context });
    return row ? (row as Row) : undefined;
  }

  private isActiveConsultation(
    task: ReturnType<EncounterRepository['findConsultationTask']>,
  ): task is NonNullable<ReturnType<EncounterRepository['findConsultationTask']>> {
    return (
      !!task &&
      (task.status === 'requested' || task.status === 'scheduled') &&
      task.completedAt === null
    );
  }

  private isShareableVersion(recordId: string, version: number): boolean {
    return !!this.db
      .prepare(
        `SELECT 1 FROM record_reviews WHERE record_id=? AND record_version=? AND decision='approved'`,
      )
      .get(recordId, version);
  }

  private materialWriteGate(
    input: CreateClinicalMaterialRequest,
    context: RequestContext,
  ): Exclude<MaterialCommandResult, { kind: 'ok' }> | undefined {
    const task = this.consultations.findConsultationTask(input.consultationId, context);
    if (!task) return { kind: 'not-found' };
    if (!this.isActiveConsultation(task))
      return { kind: 'invalid-state', code: 'CONSULTATION_NOT_ACTIVE' };
    if (!task.isParticipant) return { kind: 'forbidden' };
    const version = this.findVersion(input.recordId, input.recordVersion, context);
    if (!version) return { kind: 'not-found' };
    const record = this.findRecord(input.recordId, context);
    if (!record || record.patientId !== task.patientId) return { kind: 'not-found' };
    if (!this.isShareableVersion(input.recordId, input.recordVersion))
      return { kind: 'invalid-state', code: 'RECORD_VERSION_NOT_SHAREABLE' };
    const allowed = new Set(clinicalTemplateFields[version.templateId]);
    if (
      !Array.isArray(input.sharedSections) ||
      input.sharedSections.length === 0 ||
      input.sharedSections.some((key) => !allowed.has(key))
    )
      return { kind: 'invalid-sections' };
    return undefined;
  }

  private runCommand(
    id: string,
    operation: CommandOperation,
    expectedVersion: number,
    requestKey: string,
    payload: unknown,
    context: RequestContext,
    execute: (
      current: Row,
    ) =>
      | Exclude<
          LifecycleCommandResult,
          { kind: 'ok' } | { kind: 'not-found' } | { kind: 'stale' } | { kind: 'conflict' }
        >
      | undefined,
  ): LifecycleCommandResult {
    const requestHash = fingerprint(payload);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.lockRecord(id, context);
      if (!current) {
        this.db.exec('ROLLBACK');
        return { kind: 'not-found' };
      }
      const existing = this.db
        .prepare(
          `SELECT request_hash FROM clinical_command_receipts
           WHERE actor_id=? AND operation=? AND record_id=? AND request_key=?`,
        )
        .get(context.actorId, operation, id, requestKey) as { request_hash: string } | undefined;
      if (existing) {
        this.db.exec('ROLLBACK');
        return existing.request_hash === requestHash
          ? { kind: 'ok', record: this.findRecord(id, context)!, replayed: true }
          : { kind: 'conflict' };
      }
      if (Number(current.version) !== expectedVersion) {
        const currentVersion = Number(current.version);
        this.db.exec('ROLLBACK');
        return { kind: 'stale', currentVersion };
      }
      const failure = execute(current);
      if (failure) {
        this.db.exec('ROLLBACK');
        return failure;
      }
      this.db
        .prepare(
          `INSERT INTO clinical_command_receipts(
            actor_id,operation,record_id,request_key,request_hash,created_at
          ) VALUES(?,?,?,?,?,?)`,
        )
        .run(context.actorId, operation, id, requestKey, requestHash, context.now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { kind: 'ok', record: this.findRecord(id, context)!, replayed: false };
  }
}
