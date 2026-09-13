import { createHash, randomUUID } from 'node:crypto';
import type {
  CarePlanDetail,
  CarePlanVersion,
  CreateAssessmentInput,
  CreateCarePlanInput,
  CreateObservationInput,
  CreateReminderInput,
  HealthAssessment,
  HealthOverview,
  Observation,
  ObservationQuery,
  Paginated,
  ReminderTask,
  UpdateCarePlanInput,
} from '@doctor/contracts';
import type { CommandReceipt, HealthRepository } from './repository.js';
import type {
  HealthAuditPort,
  HealthNotificationPort,
  PatientAccessPort,
  PatientSummaryPort,
  RequestContext,
} from './ports.js';

export class HealthResourceNotFound extends Error {}
export class CommandConflict extends Error {}
export class StaleVersion extends Error {}
export class NotificationUnavailable extends Error {}

export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly patientAccess: PatientAccessPort,
    private readonly patientSummaries: PatientSummaryPort,
    private readonly audit?: HealthAuditPort,
    private readonly notifications?: HealthNotificationPort,
  ) {}

  overview(context: RequestContext, patientId?: string): HealthOverview {
    if (patientId) this.requirePatient(patientId, context);
    const raw = this.repository.overview(context, patientId);
    const allIds = [...new Set([
      ...raw.observations.map((item) => item.patientId),
      ...raw.alerts.map((item) => item.patientId),
      ...raw.carePlans.map((item) => item.patientId),
    ])];
    const allowedIds = new Set(allIds.filter((id) => this.patientAccess.canReadPatient(id, context)));
    const names = new Map<string, string>();
    for (const id of allowedIds) {
      const summary = this.patientSummaries.find(id, context);
      if (summary) names.set(id, summary.name);
    }
    const observations = raw.observations.filter((item) => allowedIds.has(item.patientId));
    const alerts = raw.alerts.filter((item) => allowedIds.has(item.patientId))
      .map((item) => ({ ...item, patientName: names.get(item.patientId) ?? '' }));
    const carePlans = raw.carePlans.filter((item) => allowedIds.has(item.patientId))
      .map((item) => ({ ...item, patientName: names.get(item.patientId) ?? '' }));
    return {
      observations,
      alerts,
      carePlans,
      summary: {
        monitoredPatients: new Set(observations.map((item) => item.patientId)).size,
        activePlans: carePlans.filter((item) => item.status === 'active').length,
        needsReview: alerts.length,
        remindersPlanned: raw.summary.remindersPlanned,
      },
    };
  }

  listObservations(query: ObservationQuery, context: RequestContext): Paginated<Observation> {
    this.requirePatient(query.patientId, context);
    return this.repository.listObservations(query, context);
  }

  createObservation(input: CreateObservationInput, context: RequestContext): Observation {
    this.requirePatient(input.patientId, context);
    return this.execute('health.observation.create', input.commandId, input, context, () => {
      const observation: Observation = {
        id: `OBS-${randomUUID()}`,
        patientId: input.patientId,
        metric: input.metric,
        value: input.value,
        unit: input.unit,
        measuredAt: input.measuredAt,
        receivedAt: context.now,
        source: input.source,
        sourceLabel: input.sourceLabel,
      };
      this.repository.createObservation(observation);
      return observation;
    }, 'observation');
  }

  listPlans(patientId: string, context: RequestContext): CarePlanDetail[] {
    const patient = this.requirePatient(patientId, context);
    return this.repository.listPlans(patientId, context)
      .map((plan) => ({ ...plan, patientName: patient.name }));
  }

  createPlan(input: CreateCarePlanInput, context: RequestContext): CarePlanDetail {
    const patient = this.requirePatient(input.patientId, context);
    return this.execute('health.plan.create', input.commandId, input, context, () => {
      const plan: CarePlanDetail = {
        id: `PLAN-${randomUUID()}`,
        patientId: input.patientId,
        patientName: patient.name,
        title: input.title,
        status: 'draft',
        goals: input.goals,
        nextReview: input.nextReview,
        completionPercent: 0,
        version: 1,
        createdAt: context.now,
        updatedAt: context.now,
      };
      this.repository.createPlan(plan, createPlanVersion(plan, context.actorId), context.actorId);
      return plan;
    }, 'care-plan');
  }

  updatePlan(id: string, input: UpdateCarePlanInput, context: RequestContext): CarePlanDetail {
    const current = this.repository.findPlan(id, context);
    if (!current) throw new HealthResourceNotFound();
    const patient = this.requirePatient(current.patientId, context);
    return this.execute('health.plan.update', input.commandId, { id, ...input }, context, () => {
      const latest = this.repository.findPlan(id, context);
      if (!latest) throw new HealthResourceNotFound();
      if (latest.version !== input.expectedVersion) throw new StaleVersion();
      const updated: CarePlanDetail = {
        ...latest,
        patientName: patient.name,
        title: input.title,
        status: input.status,
        goals: input.goals,
        nextReview: input.nextReview,
        completionPercent: input.completionPercent,
        version: latest.version + 1,
        updatedAt: context.now,
      };
      if (!this.repository.updatePlan(updated, createPlanVersion(updated, context.actorId))) {
        throw new StaleVersion();
      }
      return updated;
    }, 'care-plan');
  }

  listPlanVersions(id: string, context: RequestContext): CarePlanVersion[] {
    const plan = this.repository.findPlan(id, context);
    if (!plan) throw new HealthResourceNotFound();
    this.requirePatient(plan.patientId, context);
    return this.repository.listPlanVersions(id, context);
  }

  listAssessments(patientId: string, context: RequestContext): HealthAssessment[] {
    this.requirePatient(patientId, context);
    return this.repository.listAssessments(patientId, context);
  }

  createAssessment(input: CreateAssessmentInput, context: RequestContext): HealthAssessment {
    this.requirePatient(input.patientId, context);
    if (input.planId) {
      const plan = this.repository.findPlan(input.planId, context);
      if (!plan || plan.patientId !== input.patientId) throw new HealthResourceNotFound();
    }
    return this.execute('health.assessment.create', input.commandId, input, context, () => {
      const assessment: HealthAssessment = {
        id: `ASM-${randomUUID()}`,
        patientId: input.patientId,
        ...(input.planId ? { planId: input.planId } : {}),
        assessorId: context.actorId,
        assessedAt: input.assessedAt,
        summary: input.summary,
        recommendations: input.recommendations,
        ...(input.nextReview ? { nextReview: input.nextReview } : {}),
      };
      this.repository.createAssessment(assessment);
      return assessment;
    }, 'assessment');
  }

  listReminders(patientId: string, context: RequestContext): ReminderTask[] {
    this.requirePatient(patientId, context);
    return this.repository.listReminders(patientId, context);
  }

  createReminder(input: CreateReminderInput, context: RequestContext): ReminderTask {
    this.requirePatient(input.patientId, context);
    if (input.planId) {
      const plan = this.repository.findPlan(input.planId, context);
      if (!plan || plan.patientId !== input.patientId) throw new HealthResourceNotFound();
    }
    return this.execute('health.reminder.create', input.commandId, input, context, () => {
      const reminder: ReminderTask = {
        id: `REM-${randomUUID()}`,
        patientId: input.patientId,
        ...(input.planId ? { planId: input.planId } : {}),
        channel: input.channel,
        templateId: input.templateId,
        scheduledAt: input.scheduledAt,
        status: 'planned',
        attempts: 0,
      };
      this.repository.createReminder(reminder, input.consentReference);
      return reminder;
    }, 'reminder', 'planned');
  }

  cancelReminder(id: string, commandId: string, context: RequestContext): ReminderTask {
    const reminder = this.requireReminder(id, context);
    return this.execute('health.reminder.cancel', commandId, { id, commandId }, context, () => {
      const cancelled: ReminderTask = { ...reminder, status: 'cancelled' };
      this.repository.updateReminder(cancelled);
      return cancelled;
    }, 'reminder');
  }

  async retryReminder(id: string, commandId: string, context: RequestContext): Promise<ReminderTask> {
    const reminder = this.requireReminder(id, context);
    const operation = 'health.reminder.retry';
    const digest = requestDigest(operation, { id, commandId });
    const existing = this.repository.findReceipt(context.actorId, commandId);
    if (existing) return this.replay<ReminderTask>(existing, digest, operation);
    if (!this.notifications) throw new NotificationUnavailable();

    const pending: ReminderTask = {
      ...reminder,
      status: 'pending',
      attempts: reminder.attempts + 1,
    };
    this.repository.updateReminder(pending);
    let completed: ReminderTask;
    let providerMessageId: string | undefined;
    try {
      const sent = await this.notifications.send(pending);
      providerMessageId = sent.providerMessageId;
      completed = { ...pending, status: 'sent' };
    } catch {
      completed = { ...pending, status: 'failed', lastError: 'NOTIFICATION_DELIVERY_FAILED' };
    }
    this.repository.transaction(() => {
      this.repository.updateReminder(completed, providerMessageId);
      this.repository.saveReceipt(makeReceipt(
        context, commandId, operation, digest, completed.id, completed,
      ));
    });
    this.recordAudit(
      context,
      operation,
      'reminder',
      completed.id,
      completed.status === 'sent' ? 'success' : 'failed',
    );
    return completed;
  }

  private requirePatient(patientId: string, context: RequestContext) {
    if (!this.patientAccess.canReadPatient(patientId, context)) throw new HealthResourceNotFound();
    const patient = this.patientSummaries.find(patientId, context);
    if (!patient) throw new HealthResourceNotFound();
    return patient;
  }

  private requireReminder(id: string, context: RequestContext): ReminderTask {
    const reminder = this.repository.findReminder(id, context);
    if (!reminder) throw new HealthResourceNotFound();
    this.requirePatient(reminder.patientId, context);
    return reminder;
  }

  private execute<T extends { id: string }>(
    operation: string,
    commandId: string,
    input: unknown,
    context: RequestContext,
    work: () => T,
    resourceType: string,
    outcome: 'success' | 'planned' = 'success',
  ): T {
    const digest = requestDigest(operation, input);
    let replayed = false;
    const result = this.repository.transaction(() => {
      const existing = this.repository.findReceipt(context.actorId, commandId);
      if (existing) {
        replayed = true;
        return this.replay<T>(existing, digest, operation);
      }
      const created = work();
      this.repository.saveReceipt(makeReceipt(
        context, commandId, operation, digest, created.id, created,
      ));
      return created;
    });
    if (!replayed) this.recordAudit(context, operation, resourceType, result.id, outcome);
    return result;
  }

  private replay<T>(receipt: CommandReceipt, digest: string, operation: string): T {
    if (receipt.operation !== operation || receipt.requestDigest !== digest) throw new CommandConflict();
    return JSON.parse(receipt.responseJson) as T;
  }

  private recordAudit(
    context: RequestContext,
    action: string,
    resourceType: string,
    resourceId: string,
    outcome: 'success' | 'planned' | 'failed',
  ): void {
    void this.audit?.record({
      actorId: context.actorId,
      action,
      resourceType,
      resourceId,
      outcome,
      occurredAt: context.now,
    });
  }
}

function createPlanVersion(plan: CarePlanDetail, actorId: string): CarePlanVersion {
  const { patientName: _patientName, ...snapshot } = plan;
  return {
    id: `PLANV-${randomUUID()}`,
    planId: plan.id,
    version: plan.version,
    snapshot,
    authoredBy: actorId,
    createdAt: plan.updatedAt,
  };
}

function makeReceipt<T>(
  context: RequestContext,
  commandId: string,
  operation: string,
  digest: string,
  resourceId: string,
  response: T,
): CommandReceipt {
  return {
    actorId: context.actorId,
    commandId,
    operation,
    requestDigest: digest,
    resourceId,
    responseJson: JSON.stringify(response),
    createdAt: context.now,
  };
}

function requestDigest(operation: string, input: unknown): string {
  return createHash('sha256').update(stableJson({ operation, input })).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
