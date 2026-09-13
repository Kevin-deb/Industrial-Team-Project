import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreateAssessmentInput,
  CreateCarePlanInput,
  CreateObservationInput,
  CreateReminderInput,
  HealthMetric,
  ObservationQuery,
  UpdateCarePlanInput,
} from '@doctor/contracts';
import type { RequestContext } from '../platform/index.js';
import {
  CommandConflict,
  HealthResourceNotFound,
  HealthService,
  NotificationUnavailable,
  ReminderDeliveryInProgress,
  InvalidReminderState,
  StaleVersion,
} from './service.js';

const commandId = { type: 'string', minLength: 8, maxLength: 120 } as const;
const patientId = { type: 'string', minLength: 1, maxLength: 80 } as const;
const rfc3339Pattern =
  '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$';
const dateTime = { type: 'string', minLength: 20, maxLength: 40, pattern: rfc3339Pattern } as const;

export function registerHealthRoutes(
  app: FastifyInstance,
  service: HealthService,
  getContext: () => RequestContext,
): void {
  const healthReply = <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    work: () => T | Promise<T>,
    status = 200,
  ) => replyHealth(request, reply, getContext().actorId, work, status);
  app.get<{ Querystring: { q?: string } }>(
    '/api/v1/health/patients',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { q: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (request, reply) =>
      healthReply(request, reply, () =>
        service.searchPatients(request.query.q?.trim() ?? '', getContext()),
      ),
  );

  app.get<{ Querystring: { patientId?: string } }>(
    '/api/v1/health/overview',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { patientId },
        },
      },
    },
    async (request, reply) =>
      healthReply(request, reply, () => service.overview(getContext(), request.query.patientId)),
  );

  app.get<{ Querystring: ObservationQuery }>(
    '/api/v1/health/observations',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['patientId'],
          additionalProperties: false,
          properties: {
            patientId,
            metric: { type: 'string', enum: ['systolic', 'diastolic', 'glucose', 'heart-rate'] },
            from: dateTime,
            to: dateTime,
            page: { type: 'integer', minimum: 1, maximum: 100000 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      if (
        (request.query.from && !isValidRfc3339(request.query.from)) ||
        (request.query.to && !isValidRfc3339(request.query.to))
      ) {
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '时间格式无效。',
          getContext().actorId,
        );
      }
      if (
        request.query.from &&
        request.query.to &&
        Date.parse(request.query.from) > Date.parse(request.query.to)
      )
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '开始时间不能晚于结束时间。',
          getContext().actorId,
        );
      return healthReply(request, reply, () =>
        service.listObservations(request.query, getContext()),
      );
    },
  );

  app.post<{ Body: CreateObservationInput }>(
    '/api/v1/health/observations',
    {
      schema: {
        body: {
          type: 'object',
          required: [
            'commandId',
            'patientId',
            'metric',
            'value',
            'unit',
            'measuredAt',
            'source',
            'sourceLabel',
          ],
          additionalProperties: false,
          properties: {
            commandId,
            patientId,
            metric: { type: 'string', enum: ['systolic', 'diastolic', 'glucose', 'heart-rate'] },
            value: { type: 'number', minimum: 0, maximum: 1000 },
            unit: { type: 'string', minLength: 1, maxLength: 20 },
            measuredAt: dateTime,
            source: { type: 'string', enum: ['manual-entry', 'device-simulator'] },
            sourceLabel: { type: 'string', minLength: 1, maxLength: 80 },
            externalObservationId: { type: 'string', minLength: 1, maxLength: 120 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isValidRfc3339(request.body.measuredAt)) {
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '测量时间无效。',
          getContext().actorId,
        );
      }
      if (!validUnit(request.body.metric, request.body.unit)) {
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '计量单位与所选指标不一致。',
          getContext().actorId,
        );
      }
      if (!validObservationValue(request.body.metric, request.body.value)) {
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '测量数值超出可记录范围。',
          getContext().actorId,
        );
      }
      return healthReply(
        request,
        reply,
        () => service.createObservation(request.body, getContext()),
        201,
      );
    },
  );

  app.get<{ Querystring: { patientId: string } }>(
    '/api/v1/health/plans',
    patientQuerySchema,
    async (request, reply) =>
      healthReply(request, reply, () => service.listPlans(request.query.patientId, getContext())),
  );
  app.post<{ Body: CreateCarePlanInput }>(
    '/api/v1/health/plans',
    {
      schema: { body: createPlanSchema },
    },
    async (request, reply) => {
      if (!isValidDateOrDateTime(request.body.nextReview))
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '复核日期无效。',
          getContext().actorId,
        );
      return healthReply(request, reply, () => service.createPlan(request.body, getContext()), 201);
    },
  );
  app.patch<{ Params: { id: string }; Body: UpdateCarePlanInput }>(
    '/api/v1/health/plans/:id',
    {
      schema: { params: idParamsSchema, body: updatePlanSchema },
    },
    async (request, reply) => {
      if (!isValidDateOrDateTime(request.body.nextReview))
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '复核日期无效。',
          getContext().actorId,
        );
      return healthReply(request, reply, () =>
        service.updatePlan(request.params.id, request.body, getContext()),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/health/plans/:id/versions',
    {
      schema: { params: idParamsSchema },
    },
    async (request, reply) =>
      healthReply(request, reply, () => service.listPlanVersions(request.params.id, getContext())),
  );

  app.get<{ Querystring: { patientId: string } }>(
    '/api/v1/health/assessments',
    patientQuerySchema,
    async (request, reply) =>
      healthReply(request, reply, () =>
        service.listAssessments(request.query.patientId, getContext()),
      ),
  );
  app.post<{ Body: CreateAssessmentInput }>(
    '/api/v1/health/assessments',
    {
      schema: {
        body: {
          type: 'object',
          required: ['commandId', 'patientId', 'assessedAt', 'summary', 'recommendations'],
          additionalProperties: false,
          properties: {
            commandId,
            patientId,
            assessedAt: dateTime,
            planId: patientId,
            summary: { type: 'string', minLength: 1, maxLength: 2000 },
            recommendations: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: { type: 'string', minLength: 1, maxLength: 300 },
            },
            nextReview: { type: 'string', minLength: 10, maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      if (
        !isValidRfc3339(request.body.assessedAt) ||
        (request.body.nextReview && !isValidDateOrDateTime(request.body.nextReview))
      )
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '评估日期无效。',
          getContext().actorId,
        );
      return healthReply(
        request,
        reply,
        () => service.createAssessment(request.body, getContext()),
        201,
      );
    },
  );

  app.get<{ Querystring: { patientId: string } }>(
    '/api/v1/health/reminders',
    patientQuerySchema,
    async (request, reply) =>
      healthReply(request, reply, () =>
        service.listReminders(request.query.patientId, getContext()),
      ),
  );
  app.post<{ Body: CreateReminderInput }>(
    '/api/v1/health/reminders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['commandId', 'patientId', 'channel', 'templateId', 'scheduledAt'],
          additionalProperties: false,
          properties: {
            commandId,
            patientId,
            planId: patientId,
            channel: { type: 'string', enum: ['in-app', 'sms', 'email'] },
            templateId: { type: 'string', minLength: 1, maxLength: 100 },
            scheduledAt: dateTime,
            consentReference: { type: 'string', minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isValidRfc3339(request.body.scheduledAt))
        return errorEnvelope(
          request,
          reply,
          400,
          'INVALID_REQUEST',
          '提醒时间无效。',
          getContext().actorId,
        );
      return healthReply(
        request,
        reply,
        () => service.createReminder(request.body, getContext()),
        201,
      );
    },
  );

  for (const action of ['cancel', 'retry'] as const) {
    app.post<{ Params: { id: string }; Body: { commandId: string } }>(
      `/api/v1/health/reminders/:id/${action}`,
      {
        schema: {
          params: idParamsSchema,
          body: {
            type: 'object',
            required: ['commandId'],
            additionalProperties: false,
            properties: { commandId },
          },
        },
      },
      async (request, reply) =>
        healthReply(request, reply, () =>
          action === 'cancel'
            ? service.cancelReminder(request.params.id, request.body.commandId, getContext())
            : service.retryReminder(request.params.id, request.body.commandId, getContext()),
        ),
    );
  }
}

const patientQuerySchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['patientId'],
      additionalProperties: false,
      properties: { patientId },
    },
  },
} as const;

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 120 } },
} as const;

const createPlanSchema = {
  type: 'object',
  required: ['commandId', 'patientId', 'title', 'goals', 'nextReview'],
  additionalProperties: false,
  properties: {
    commandId,
    patientId,
    title: { type: 'string', minLength: 1, maxLength: 160 },
    goals: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
    nextReview: { type: 'string', minLength: 10, maxLength: 40 },
  },
} as const;

const updatePlanSchema = {
  type: 'object',
  required: [
    'commandId',
    'expectedVersion',
    'title',
    'status',
    'goals',
    'nextReview',
    'completionPercent',
  ],
  additionalProperties: false,
  properties: {
    commandId,
    expectedVersion: { type: 'integer', minimum: 1 },
    title: { type: 'string', minLength: 1, maxLength: 160 },
    status: { type: 'string', enum: ['draft', 'active'] },
    goals: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
    nextReview: { type: 'string', minLength: 10, maxLength: 40 },
    completionPercent: { type: 'integer', minimum: 0, maximum: 100 },
  },
} as const;

async function replyHealth<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  actorId: string,
  work: () => T | Promise<T>,
  status = 200,
) {
  const startedAt = performance.now();
  try {
    const data = await work();
    request.log.info(
      {
        requestId: request.id,
        actorId,
        resourceId: healthResourceId(request),
        operation: request.method,
        route: request.routeOptions.url,
        outcome: 'success',
        durationMs: Math.round(performance.now() - startedAt),
      },
      'E health operation',
    );
    return reply.code(status).send({ data, meta: { requestId: request.id, mode: 'demo' } });
  } catch (error) {
    if (error instanceof HealthResourceNotFound)
      return errorEnvelope(
        request,
        reply,
        404,
        'HEALTH_RESOURCE_NOT_FOUND',
        '未找到该健康管理资料，或当前医生无权查看。',
        actorId,
        startedAt,
      );
    if (error instanceof CommandConflict)
      return errorEnvelope(
        request,
        reply,
        409,
        'COMMAND_CONFLICT',
        '该操作编号已用于另一项修改，请重新操作。',
        actorId,
        startedAt,
      );
    if (error instanceof StaleVersion)
      return errorEnvelope(
        request,
        reply,
        412,
        'STALE_VERSION',
        '这份计划已被修改，请刷新后再试。',
        actorId,
        startedAt,
      );
    if (error instanceof NotificationUnavailable)
      return errorEnvelope(
        request,
        reply,
        503,
        'NOTIFICATION_UNAVAILABLE',
        '通知接口尚未接入，任务未发送。',
        actorId,
        startedAt,
      );
    if (error instanceof ReminderDeliveryInProgress)
      return errorEnvelope(
        request,
        reply,
        409,
        'DELIVERY_IN_PROGRESS',
        '该提醒正在处理中，请勿重复发送。',
        actorId,
        startedAt,
      );
    if (error instanceof InvalidReminderState)
      return errorEnvelope(
        request,
        reply,
        409,
        'INVALID_REMINDER_STATE',
        '当前提醒状态不允许执行该操作。',
        actorId,
        startedAt,
      );
    throw error;
  }
}

function errorEnvelope(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  actorId = 'unknown',
  startedAt = performance.now(),
) {
  request.log.warn(
    {
      requestId: request.id,
      actorId,
      resourceId: healthResourceId(request),
      operation: request.method,
      route: request.routeOptions.url,
      outcome: code,
      durationMs: Math.round(performance.now() - startedAt),
    },
    'E health operation rejected',
  );
  return reply
    .code(status)
    .send({ error: { code, message }, meta: { requestId: request.id, mode: 'demo' } });
}

function healthResourceId(request: FastifyRequest): string {
  const params = request.params as { id?: string } | undefined;
  const query = request.query as { patientId?: string } | undefined;
  const body = request.body as { patientId?: string } | undefined;
  return params?.id ?? query?.patientId ?? body?.patientId ?? 'collection';
}

function validUnit(metric: HealthMetric, unit: string): boolean {
  return (
    { systolic: 'mmHg', diastolic: 'mmHg', glucose: 'mmol/L', 'heart-rate': 'bpm' }[metric] === unit
  );
}

function validObservationValue(metric: HealthMetric, value: number): boolean {
  const ranges: Record<HealthMetric, readonly [number, number]> = {
    systolic: [40, 300],
    diastolic: [20, 200],
    glucose: [0.5, 50],
    'heart-rate': [20, 300],
  };
  const [minimum, maximum] = ranges[metric];
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isValidRfc3339(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match || !isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])))
    return false;
  return (
    Number(match[4]) <= 23 &&
    Number(match[5]) <= 59 &&
    Number(match[6]) <= 59 &&
    Number(match[7] ?? 0) <= 23 &&
    Number(match[8] ?? 0) <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

function isValidDateOrDateTime(value: string): boolean {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return date
    ? isValidCalendarDate(Number(date[1]), Number(date[2]), Number(date[3]))
    : isValidRfc3339(value);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}
