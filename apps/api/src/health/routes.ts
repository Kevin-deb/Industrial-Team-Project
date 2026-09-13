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
  StaleVersion,
} from './service.js';

const commandId = { type: 'string', minLength: 8, maxLength: 120 } as const;
const patientId = { type: 'string', minLength: 1, maxLength: 80 } as const;
const dateTime = { type: 'string', minLength: 10, maxLength: 40 } as const;

export function registerHealthRoutes(
  app: FastifyInstance,
  service: HealthService,
  getContext: () => RequestContext,
): void {
  app.get<{ Querystring: ObservationQuery }>('/api/v1/health/observations', {
    schema: {
      querystring: {
        type: 'object', required: ['patientId'], additionalProperties: false,
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
  }, async (request, reply) => healthReply(request, reply, () =>
    service.listObservations(request.query, getContext())));

  app.post<{ Body: CreateObservationInput }>('/api/v1/health/observations', {
    schema: {
      body: {
        type: 'object',
        required: ['commandId', 'patientId', 'metric', 'value', 'unit', 'measuredAt', 'source', 'sourceLabel'],
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
  }, async (request, reply) => {
    if (!validUnit(request.body.metric, request.body.unit)) {
      return errorEnvelope(request, reply, 400, 'INVALID_REQUEST', '计量单位与所选指标不一致。');
    }
    return healthReply(request, reply, () => service.createObservation(request.body, getContext()), 201);
  });

  app.get<{ Querystring: { patientId: string } }>('/api/v1/health/plans', patientQuerySchema,
    async (request, reply) => healthReply(request, reply, () =>
      service.listPlans(request.query.patientId, getContext())));
  app.post<{ Body: CreateCarePlanInput }>('/api/v1/health/plans', {
    schema: { body: createPlanSchema },
  }, async (request, reply) => healthReply(request, reply, () =>
    service.createPlan(request.body, getContext()), 201));
  app.patch<{ Params: { id: string }; Body: UpdateCarePlanInput }>('/api/v1/health/plans/:id', {
    schema: { params: idParamsSchema, body: updatePlanSchema },
  }, async (request, reply) => healthReply(request, reply, () =>
    service.updatePlan(request.params.id, request.body, getContext())));
  app.get<{ Params: { id: string } }>('/api/v1/health/plans/:id/versions', {
    schema: { params: idParamsSchema },
  }, async (request, reply) => healthReply(request, reply, () =>
    service.listPlanVersions(request.params.id, getContext())));

  app.get<{ Querystring: { patientId: string } }>('/api/v1/health/assessments', patientQuerySchema,
    async (request, reply) => healthReply(request, reply, () =>
      service.listAssessments(request.query.patientId, getContext())));
  app.post<{ Body: CreateAssessmentInput }>('/api/v1/health/assessments', {
    schema: {
      body: {
        type: 'object',
        required: ['commandId', 'patientId', 'assessedAt', 'summary', 'recommendations'],
        additionalProperties: false,
        properties: {
          commandId, patientId, assessedAt: dateTime,
          planId: patientId,
          summary: { type: 'string', minLength: 1, maxLength: 2000 },
          recommendations: {
            type: 'array', minItems: 1, maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 300 },
          },
          nextReview: { type: 'string', minLength: 10, maxLength: 40 },
        },
      },
    },
  }, async (request, reply) => healthReply(request, reply, () =>
    service.createAssessment(request.body, getContext()), 201));

  app.get<{ Querystring: { patientId: string } }>('/api/v1/health/reminders', patientQuerySchema,
    async (request, reply) => healthReply(request, reply, () =>
      service.listReminders(request.query.patientId, getContext())));
  app.post<{ Body: CreateReminderInput }>('/api/v1/health/reminders', {
    schema: {
      body: {
        type: 'object',
        required: ['commandId', 'patientId', 'channel', 'templateId', 'scheduledAt'],
        additionalProperties: false,
        properties: {
          commandId, patientId, planId: patientId,
          channel: { type: 'string', enum: ['in-app', 'sms', 'email'] },
          templateId: { type: 'string', minLength: 1, maxLength: 100 },
          scheduledAt: dateTime,
          consentReference: { type: 'string', minLength: 1, maxLength: 160 },
        },
      },
    },
  }, async (request, reply) => healthReply(request, reply, () =>
    service.createReminder(request.body, getContext()), 201));

  for (const action of ['cancel', 'retry'] as const) {
    app.post<{ Params: { id: string }; Body: { commandId: string } }>(
      `/api/v1/health/reminders/:id/${action}`,
      {
        schema: {
          params: idParamsSchema,
          body: {
            type: 'object', required: ['commandId'], additionalProperties: false,
            properties: { commandId },
          },
        },
      },
      async (request, reply) => healthReply(request, reply, () => action === 'cancel'
        ? service.cancelReminder(request.params.id, request.body.commandId, getContext())
        : service.retryReminder(request.params.id, request.body.commandId, getContext())),
    );
  }
}

const patientQuerySchema = {
  schema: {
    querystring: {
      type: 'object', required: ['patientId'], additionalProperties: false,
      properties: { patientId },
    },
  },
} as const;

const idParamsSchema = {
  type: 'object', required: ['id'], additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 120 } },
} as const;

const createPlanSchema = {
  type: 'object', required: ['commandId', 'patientId', 'title', 'goals', 'nextReview'],
  additionalProperties: false,
  properties: {
    commandId, patientId,
    title: { type: 'string', minLength: 1, maxLength: 160 },
    goals: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 300 } },
    nextReview: { type: 'string', minLength: 10, maxLength: 40 },
  },
} as const;

const updatePlanSchema = {
  type: 'object',
  required: ['commandId', 'expectedVersion', 'title', 'status', 'goals', 'nextReview', 'completionPercent'],
  additionalProperties: false,
  properties: {
    commandId,
    expectedVersion: { type: 'integer', minimum: 1 },
    title: { type: 'string', minLength: 1, maxLength: 160 },
    status: { type: 'string', enum: ['draft', 'active'] },
    goals: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 300 } },
    nextReview: { type: 'string', minLength: 10, maxLength: 40 },
    completionPercent: { type: 'integer', minimum: 0, maximum: 100 },
  },
} as const;

async function healthReply<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  work: () => T | Promise<T>,
  status = 200,
) {
  try {
    const data = await work();
    request.log.info({ requestId: request.id, operation: request.method, route: request.routeOptions.url, outcome: 'success' }, 'E health operation');
    return reply.code(status).send({ data, meta: { requestId: request.id, mode: 'demo' } });
  } catch (error) {
    if (error instanceof HealthResourceNotFound)
      return errorEnvelope(request, reply, 404, 'HEALTH_RESOURCE_NOT_FOUND', '未找到该健康管理资料，或当前医生无权查看。');
    if (error instanceof CommandConflict)
      return errorEnvelope(request, reply, 409, 'COMMAND_CONFLICT', '该操作编号已用于另一项修改，请重新操作。');
    if (error instanceof StaleVersion)
      return errorEnvelope(request, reply, 412, 'STALE_VERSION', '这份计划已被修改，请刷新后再试。');
    if (error instanceof NotificationUnavailable)
      return errorEnvelope(request, reply, 503, 'NOTIFICATION_UNAVAILABLE', '通知接口尚未接入，任务未发送。');
    throw error;
  }
}

function errorEnvelope(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) {
  request.log.warn({ requestId: request.id, operation: request.method, route: request.routeOptions.url, outcome: code }, 'E health operation rejected');
  return reply.code(status).send({ error: { code, message }, meta: { requestId: request.id, mode: 'demo' } });
}

function validUnit(metric: HealthMetric, unit: string): boolean {
  return ({ systolic: 'mmHg', diastolic: 'mmHg', glucose: 'mmol/L', 'heart-rate': 'bpm' })[metric] === unit;
}
