import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  CarePlanDetail,
  CarePlanVersion,
  HealthAlert,
  HealthAssessment,
  HealthOverview,
  Observation,
  ObservationQuery,
  Paginated,
  ReminderTask,
} from '@doctor/contracts';
import type { RequestContext } from '../platform/index.js';

type Row = Record<string, string | number | bigint | null | Uint8Array>;

export interface CommandReceipt {
  actorId: string;
  commandId: string;
  operation: string;
  requestDigest: string;
  resourceId: string;
  responseJson: string;
  createdAt: string;
}

export interface HealthRepository {
  transaction<T>(work: () => T): T;
  findReceipt(actorId: string, commandId: string): CommandReceipt | undefined;
  saveReceipt(receipt: CommandReceipt): void;
  overview(context: RequestContext, patientId?: string): HealthOverview;
  listObservations(query: ObservationQuery, context: RequestContext): Paginated<Observation>;
  findObservationByExternal(
    patientId: string,
    source: Observation['source'],
    externalObservationId: string,
  ): Observation | undefined;
  createObservation(record: Observation): void;
  listPlans(patientId: string, context: RequestContext): CarePlanDetail[];
  findPlan(id: string, context: RequestContext): CarePlanDetail | undefined;
  createPlan(plan: CarePlanDetail, version: CarePlanVersion, doctorId: string): void;
  updatePlan(plan: CarePlanDetail, version: CarePlanVersion): boolean;
  listPlanVersions(planId: string, context: RequestContext): CarePlanVersion[];
  listAssessments(patientId: string, context: RequestContext): HealthAssessment[];
  createAssessment(assessment: HealthAssessment): void;
  listReminders(patientId: string, context: RequestContext): ReminderTask[];
  findReminder(id: string, context: RequestContext): ReminderTask | undefined;
  createReminder(reminder: ReminderTask, consentReference?: string): void;
  updateReminder(reminder: ReminderTask, providerMessageId?: string): void;
  claimReminderDelivery(
    actorId: string,
    commandId: string,
    reminderId: string,
    providerIdempotencyKey: string,
    createdAt: string,
  ): boolean;
  completeReminderDelivery(
    actorId: string,
    commandId: string,
    status: 'sent' | 'failed',
    completedAt: string,
  ): void;
}

export class SqliteHealthRepository implements HealthRepository {
  constructor(private readonly db: DatabaseSync) {}

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  findReceipt(actorId: string, commandId: string): CommandReceipt | undefined {
    const row = this.db
      .prepare('SELECT * FROM health_command_receipts WHERE actor_id=? AND command_id=?')
      .get(actorId, commandId) as Row | undefined;
    return row ? mapReceipt(row) : undefined;
  }

  saveReceipt(receipt: CommandReceipt): void {
    this.db
      .prepare(
        `INSERT INTO health_command_receipts(
      actor_id,command_id,operation,request_digest,resource_id,response_json,created_at
    ) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        receipt.actorId,
        receipt.commandId,
        receipt.operation,
        receipt.requestDigest,
        receipt.resourceId,
        receipt.responseJson,
        receipt.createdAt,
      );
  }

  overview(_context: RequestContext, patientId?: string): HealthOverview {
    const patientFilter = patientId ? 'WHERE patient_id=:patientId' : '';
    const params: Record<string, SQLInputValue> = patientId ? { patientId } : {};
    const observations = this.db
      .prepare(
        `SELECT * FROM health_observations ${patientFilter} ORDER BY measured_at DESC,id DESC LIMIT 21`,
      )
      .all(params)
      .map((row) => mapObservation(row as Row));
    const alerts = this.db
      .prepare(`SELECT * FROM health_alerts ${patientFilter} ORDER BY measured_at DESC,id DESC`)
      .all(params)
      .map((row) => mapAlert(row as Row));
    const carePlans = this.db
      .prepare(`SELECT * FROM care_plans ${patientFilter} ORDER BY updated_at DESC,id`)
      .all(params)
      .map((row) => mapPlan(row as Row));
    const reminderWhere = patientId
      ? "WHERE patient_id=:patientId AND status='planned'"
      : "WHERE status='planned'";
    const remindersPlanned = Number(
      this.db.prepare(`SELECT COUNT(*) count FROM reminder_tasks ${reminderWhere}`).get(params)!
        .count,
    );
    return {
      observations,
      alerts,
      carePlans,
      summary: {
        monitoredPatients: new Set(observations.map((item) => item.patientId)).size,
        activePlans: carePlans.filter((item) => item.status === 'active').length,
        needsReview: alerts.length,
        remindersPlanned,
      },
    };
  }

  listObservations(query: ObservationQuery, _context: RequestContext): Paginated<Observation> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const conditions = ['patient_id=:patientId'];
    const params: Record<string, SQLInputValue> = { patientId: query.patientId };
    if (query.metric) {
      conditions.push('metric=:metric');
      params.metric = query.metric;
    }
    if (query.from) {
      conditions.push('measured_at>=:from');
      params.from = query.from;
    }
    if (query.to) {
      conditions.push('measured_at<=:to');
      params.to = query.to;
    }
    const where = conditions.join(' AND ');
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) count FROM health_observations WHERE ${where}`).get(params)!
        .count,
    );
    const items = this.db
      .prepare(
        `SELECT * FROM health_observations WHERE ${where} ORDER BY measured_at DESC,id DESC LIMIT :limit OFFSET :offset`,
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
      .map((row) => mapObservation(row as Row));
    return { items, page, pageSize, total };
  }

  findObservationByExternal(
    patientId: string,
    source: Observation['source'],
    externalObservationId: string,
  ): Observation | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM health_observations
         WHERE patient_id=? AND source=? AND external_observation_id=?`,
      )
      .get(patientId, source, externalObservationId) as Row | undefined;
    return row ? mapObservation(row) : undefined;
  }

  createObservation(record: Observation): void {
    this.db
      .prepare(
        `INSERT INTO health_observations(
      id,patient_id,metric,value,unit,measured_at,received_at,source,source_label,external_observation_id,quality_status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        record.id,
        record.patientId,
        record.metric,
        record.value,
        record.unit,
        record.measuredAt,
        record.receivedAt,
        record.source,
        record.sourceLabel,
        record.externalObservationId ?? null,
        record.qualityStatus,
      );
  }

  listPlans(patientId: string, _context: RequestContext): CarePlanDetail[] {
    return this.db
      .prepare('SELECT * FROM care_plans WHERE patient_id=? ORDER BY updated_at DESC,id')
      .all(patientId)
      .map((row) => mapPlan(row as Row));
  }

  findPlan(id: string, _context: RequestContext): CarePlanDetail | undefined {
    const row = this.db.prepare('SELECT * FROM care_plans WHERE id=?').get(id) as Row | undefined;
    return row ? mapPlan(row) : undefined;
  }

  createPlan(plan: CarePlanDetail, version: CarePlanVersion, doctorId: string): void {
    this.db
      .prepare(
        `INSERT INTO care_plans(
      id,patient_id,doctor_id,title,status,goals_json,next_review,completion_percent,current_version,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        plan.id,
        plan.patientId,
        doctorId,
        plan.title,
        plan.status,
        JSON.stringify(plan.goals),
        plan.nextReview,
        plan.completionPercent,
        plan.version,
        plan.createdAt,
        plan.updatedAt,
      );
    this.insertPlanVersion(version);
  }

  updatePlan(plan: CarePlanDetail, version: CarePlanVersion): boolean {
    const result = this.db
      .prepare(
        `UPDATE care_plans SET
      title=?,status=?,goals_json=?,next_review=?,completion_percent=?,current_version=?,updated_at=?
      WHERE id=? AND current_version=?`,
      )
      .run(
        plan.title,
        plan.status,
        JSON.stringify(plan.goals),
        plan.nextReview,
        plan.completionPercent,
        plan.version,
        plan.updatedAt,
        plan.id,
        plan.version - 1,
      );
    if (result.changes === 0) return false;
    this.insertPlanVersion(version);
    return true;
  }

  listPlanVersions(planId: string, _context: RequestContext): CarePlanVersion[] {
    return this.db
      .prepare('SELECT * FROM care_plan_versions WHERE plan_id=? ORDER BY version DESC')
      .all(planId)
      .map((row) => mapPlanVersion(row as Row));
  }

  listAssessments(patientId: string, _context: RequestContext): HealthAssessment[] {
    return this.db
      .prepare(
        'SELECT * FROM health_assessments WHERE patient_id=? ORDER BY assessed_at DESC,id DESC',
      )
      .all(patientId)
      .map((row) => mapAssessment(row as Row));
  }

  createAssessment(assessment: HealthAssessment): void {
    this.db
      .prepare(
        `INSERT INTO health_assessments(
      id,patient_id,plan_id,assessor_id,assessed_at,summary,recommendations_json,next_review
    ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        assessment.id,
        assessment.patientId,
        assessment.planId ?? null,
        assessment.assessorId,
        assessment.assessedAt,
        assessment.summary,
        JSON.stringify(assessment.recommendations),
        assessment.nextReview ?? null,
      );
  }

  listReminders(patientId: string, _context: RequestContext): ReminderTask[] {
    return this.db
      .prepare('SELECT * FROM reminder_tasks WHERE patient_id=? ORDER BY scheduled_at DESC,id DESC')
      .all(patientId)
      .map((row) => mapReminder(row as Row));
  }

  findReminder(id: string, _context: RequestContext): ReminderTask | undefined {
    const row = this.db.prepare('SELECT * FROM reminder_tasks WHERE id=?').get(id) as
      Row | undefined;
    return row ? mapReminder(row) : undefined;
  }

  createReminder(reminder: ReminderTask, consentReference?: string): void {
    this.db
      .prepare(
        `INSERT INTO reminder_tasks(
      id,patient_id,plan_id,channel,template_id,scheduled_at,status,consent_reference,
      provider_message_id,attempts,last_error,idempotency_key
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        reminder.id,
        reminder.patientId,
        reminder.planId ?? null,
        reminder.channel,
        reminder.templateId,
        reminder.scheduledAt,
        reminder.status,
        consentReference ?? null,
        null,
        reminder.attempts,
        reminder.lastError ?? null,
        `health-service-${reminder.id}`,
      );
  }

  updateReminder(reminder: ReminderTask, providerMessageId?: string): void {
    this.db
      .prepare(
        `UPDATE reminder_tasks SET status=?,attempts=?,last_error=?,provider_message_id=?
      WHERE id=?`,
      )
      .run(
        reminder.status,
        reminder.attempts,
        reminder.lastError ?? null,
        providerMessageId ?? null,
        reminder.id,
      );
  }

  claimReminderDelivery(
    actorId: string,
    commandId: string,
    reminderId: string,
    providerIdempotencyKey: string,
    createdAt: string,
  ): boolean {
    return (
      this.db
        .prepare(
          `INSERT OR IGNORE INTO health_reminder_delivery_attempts(
            actor_id,command_id,reminder_id,provider_idempotency_key,status,created_at
          ) VALUES(?,?,?,?,?,?)`,
        )
        .run(actorId, commandId, reminderId, providerIdempotencyKey, 'pending', createdAt).changes >
      0
    );
  }

  completeReminderDelivery(
    actorId: string,
    commandId: string,
    status: 'sent' | 'failed',
    completedAt: string,
  ): void {
    this.db
      .prepare(
        `UPDATE health_reminder_delivery_attempts
         SET status=?,completed_at=? WHERE actor_id=? AND command_id=?`,
      )
      .run(status, completedAt, actorId, commandId);
  }

  private insertPlanVersion(version: CarePlanVersion): void {
    this.db
      .prepare(
        `INSERT INTO care_plan_versions(
      id,plan_id,version,payload_json,authored_by,created_at
    ) VALUES(?,?,?,?,?,?)`,
      )
      .run(
        version.id,
        version.planId,
        version.version,
        JSON.stringify(version.snapshot),
        version.authoredBy,
        version.createdAt,
      );
  }
}

function mapObservation(row: Row): Observation {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    metric: row.metric as Observation['metric'],
    value: Number(row.value),
    unit: String(row.unit),
    measuredAt: String(row.measured_at),
    receivedAt: String(row.received_at),
    source: row.source as Observation['source'],
    sourceLabel: String(row.source_label),
    ...(row.external_observation_id
      ? { externalObservationId: String(row.external_observation_id) }
      : {}),
    qualityStatus: row.quality_status as Observation['qualityStatus'],
  };
}

function mapAlert(row: Row): HealthAlert {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patientName: '',
    metric: String(row.metric),
    value: String(row.value),
    severity: row.severity as HealthAlert['severity'],
    measuredAt: String(row.measured_at),
    sourceLabel: String(row.source_label),
    description: String(row.description),
  };
}

function mapPlan(row: Row): CarePlanDetail {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patientName: '',
    title: String(row.title),
    status: row.status as CarePlanDetail['status'],
    goals: JSON.parse(String(row.goals_json)) as string[],
    nextReview: String(row.next_review),
    completionPercent: Number(row.completion_percent),
    version: Number(row.current_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPlanVersion(row: Row): CarePlanVersion {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    version: Number(row.version),
    snapshot: JSON.parse(String(row.payload_json)) as CarePlanVersion['snapshot'],
    authoredBy: String(row.authored_by),
    createdAt: String(row.created_at),
  };
}

function mapAssessment(row: Row): HealthAssessment {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    ...(row.plan_id ? { planId: String(row.plan_id) } : {}),
    assessorId: String(row.assessor_id),
    assessedAt: String(row.assessed_at),
    summary: String(row.summary),
    recommendations: JSON.parse(String(row.recommendations_json)) as string[],
    ...(row.next_review ? { nextReview: String(row.next_review) } : {}),
  };
}

function mapReminder(row: Row): ReminderTask {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    ...(row.plan_id ? { planId: String(row.plan_id) } : {}),
    channel: row.channel as ReminderTask['channel'],
    templateId: String(row.template_id),
    scheduledAt: String(row.scheduled_at),
    status: row.status as ReminderTask['status'],
    attempts: Number(row.attempts),
    ...(row.last_error ? { lastError: String(row.last_error) } : {}),
  };
}

function mapReceipt(row: Row): CommandReceipt {
  return {
    actorId: String(row.actor_id),
    commandId: String(row.command_id),
    operation: String(row.operation),
    requestDigest: String(row.request_digest),
    resourceId: String(row.resource_id),
    responseJson: String(row.response_json),
    createdAt: String(row.created_at),
  };
}
