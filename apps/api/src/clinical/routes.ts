import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreateClinicalMaterialRequest,
  CreateMedicalOrderRequest,
  CreateMedicalRecordRequest,
  CorrectMedicalRecordRequest,
  LinkClinicalMaterialReportRequest,
  MedicalOrderDetail,
  MedicalOrderStatus,
  MedicalRecord,
  MedicalRecordBody,
  MedicalRecordDetail,
  MedicalRecordTemplateId,
  ReviewMedicalRecordRequest,
  StopMedicalOrderRequest,
  UpdateMedicalOrderRequest,
  UpdateMedicalRecordRequest,
} from '@doctor/contracts';
import type { EncounterRepository } from '../encounters/index.js';
import type { PlatformRepository, RequestContext } from '../platform/index.js';
import type {
  ClinicalRepository,
  LifecycleCommandResult,
  MaterialCommandResult,
  OrderCommandResult,
} from './repository.js';
import { medicalOrderTemplates } from './order-templates.js';
import { clinicalTemplateFields, medicalRecordTemplates } from './templates.js';

interface ClinicalRouteDependencies {
  clinical: ClinicalRepository;
  encounters: EncounterRepository;
  platform: PlatformRepository;
  context: () => RequestContext;
}

const envelope = <T>(request: FastifyRequest, data: T) => ({
  data,
  meta: { requestId: request.id, mode: 'demo' as const },
});

const fail = (
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) =>
  reply
    .code(status)
    .send({ error: { code, message }, meta: { requestId: request.id, mode: 'demo' } });

function hasValidBody(templateId: MedicalRecordTemplateId, body: MedicalRecordBody): boolean {
  const expected = clinicalTemplateFields[templateId];
  if (!expected || !body || Array.isArray(body) || typeof body !== 'object') return false;
  const keys = Object.keys(body).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== [...expected].sort()[index])
  )
    return false;
  return Object.values(body).every((value) => typeof value === 'string' && value.length <= 5000);
}

const paramsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 80 } },
} as const;

const versionParamsSchema = {
  type: 'object',
  required: ['id', 'version'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 80 },
    version: { type: 'integer', minimum: 1 },
  },
} as const;

const bodyProperties = {
  title: { type: 'string', minLength: 1, maxLength: 120 },
  diagnosis: { type: 'string', minLength: 1, maxLength: 200 },
  body: {
    type: 'object',
    additionalProperties: { type: 'string', maxLength: 5000 },
  },
} as const;

const idempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readVersion(request: FastifyRequest): number | undefined {
  const match = /^"record-v([1-9]\d*)"$/.exec(request.headers['if-match'] ?? '');
  return match ? Number(match[1]) : undefined;
}

function readIdempotencyKey(request: FastifyRequest): string | undefined {
  const key = request.headers['idempotency-key'];
  return typeof key === 'string' && idempotencyKeyPattern.test(key) ? key.toLowerCase() : undefined;
}

function sendRecord(
  request: FastifyRequest,
  reply: FastifyReply,
  record: MedicalRecordDetail,
  status = 200,
) {
  return reply
    .code(status)
    .header('ETag', `"record-v${record.version}"`)
    .send(envelope(request, record));
}

function sendLifecycle(
  request: FastifyRequest,
  reply: FastifyReply,
  result: LifecycleCommandResult,
  messages: Record<string, string>,
) {
  if (result.kind === 'ok') return sendRecord(request, reply, result.record);
  if (result.kind === 'not-found')
    return fail(request, reply, 404, 'RECORD_NOT_FOUND', messages.notFound);
  if (result.kind === 'stale')
    return reply
      .header('ETag', `"record-v${result.currentVersion}"`)
      .code(412)
      .send({
        error: { code: 'STALE_RECORD_VERSION', message: messages.stale },
        meta: { requestId: request.id, mode: 'demo' },
      });
  if (result.kind === 'conflict')
    return fail(request, reply, 409, 'IDEMPOTENCY_KEY_CONFLICT', messages.conflict);
  if (result.kind === 'incomplete')
    return fail(request, reply, 422, 'RECORD_INCOMPLETE', messages.incomplete);
  if (result.kind === 'forbidden')
    return fail(
      request,
      reply,
      403,
      result.code,
      result.code === 'RECORD_REVIEW_OWN_VERSION' ? messages.ownVersion : messages.reviewDenied,
    );
  return fail(request, reply, 409, result.code, messages[result.code] ?? messages.invalidState);
}

export function registerClinicalRoutes(
  app: FastifyInstance,
  deps: ClinicalRouteDependencies,
): void {
  app.get('/api/v1/record-templates', async (request) => envelope(request, medicalRecordTemplates));

  app.get<{
    Querystring: { patientId?: string; encounterId?: string; status?: MedicalRecord['status'] };
  }>(
    '/api/v1/records',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            patientId: { type: 'string', minLength: 1, maxLength: 80 },
            encounterId: { type: 'string', minLength: 1, maxLength: 80 },
            status: { type: 'string', enum: ['draft', 'pending-review', 'archived'] },
          },
        },
      },
    },
    async (request) => envelope(request, deps.clinical.listRecords(request.query, deps.context())),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/records/:id/versions',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const versions = deps.clinical.listVersions(request.params.id, deps.context());
      if (!versions)
        return fail(
          request,
          reply,
          404,
          'RECORD_NOT_FOUND',
          '未找到病历，或该病历不在当前医生的授权范围。',
        );
      return envelope(request, versions);
    },
  );

  app.get<{ Params: { id: string; version: number } }>(
    '/api/v1/records/:id/versions/:version',
    { schema: { params: versionParamsSchema } },
    async (request, reply) => {
      const version = deps.clinical.findVersion(
        request.params.id,
        request.params.version,
        deps.context(),
      );
      if (!version)
        return fail(
          request,
          reply,
          404,
          'RECORD_VERSION_NOT_FOUND',
          '未找到病历版本，或该病历不在当前医生的授权范围。',
        );
      return reply.header('ETag', `"record-v${version.version}"`).send(envelope(request, version));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/records/:id',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const record = deps.clinical.findRecord(request.params.id, deps.context());
      if (!record)
        return fail(
          request,
          reply,
          404,
          'RECORD_NOT_FOUND',
          '未找到病历，或该病历不在当前医生的授权范围。',
        );
      return reply.header('ETag', `"record-v${record.version}"`).send(envelope(request, record));
    },
  );

  app.post<{ Body: CreateMedicalRecordRequest }>(
    '/api/v1/records',
    {
      schema: {
        body: {
          type: 'object',
          required: ['patientId', 'templateId', 'title', 'diagnosis', 'body'],
          additionalProperties: false,
          properties: {
            patientId: { type: 'string', minLength: 1, maxLength: 80 },
            encounterId: { type: 'string', minLength: 1, maxLength: 80 },
            templateId: { type: 'string', enum: Object.keys(clinicalTemplateFields) },
            ...bodyProperties,
          },
        },
      },
    },
    async (request, reply) => {
      const context = deps.context();
      const title = request.body.title.trim();
      const diagnosis = request.body.diagnosis.trim();
      if (!title || !diagnosis)
        return fail(request, reply, 422, 'INVALID_RECORD_FIELDS', '请填写病历标题和诊断。');
      if (!deps.clinical.canAccessPatient(request.body.patientId, context))
        return fail(
          request,
          reply,
          404,
          'PATIENT_NOT_FOUND',
          '未找到患者，或该患者不在当前医生的授权范围。',
        );
      if (request.body.encounterId) {
        const encounter = deps.encounters.findReference(request.body.encounterId, context);
        if (!encounter || encounter.patientId !== request.body.patientId)
          return fail(
            request,
            reply,
            404,
            'ENCOUNTER_NOT_FOUND',
            '未找到可关联的问诊，或问诊与所选患者不匹配。',
          );
      }
      if (!hasValidBody(request.body.templateId, request.body.body))
        return fail(request, reply, 422, 'INVALID_RECORD_BODY', '病历正文与所选模板不匹配。');
      const record = deps.clinical.createDraft({ ...request.body, title, diagnosis }, context);
      deps.platform.recordAccess({
        actorId: context.actorId,
        action: 'record.create',
        targetType: 'medical-record',
        targetId: record.id,
        outcome: 'success',
        description: '创建本机演示病历草稿',
      });
      return reply
        .code(201)
        .header('ETag', `"record-v${record.version}"`)
        .send(envelope(request, record));
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateMedicalRecordRequest }>(
    '/api/v1/records/:id',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['title', 'diagnosis', 'body'],
          additionalProperties: false,
          properties: bodyProperties,
        },
      },
    },
    async (request, reply) => {
      const expectedVersion = readVersion(request);
      if (!expectedVersion)
        return fail(request, reply, 428, 'VERSION_REQUIRED', '保存病历前必须携带当前版本。');
      const context = deps.context();
      const title = request.body.title.trim();
      const diagnosis = request.body.diagnosis.trim();
      if (!title || !diagnosis)
        return fail(request, reply, 422, 'INVALID_RECORD_FIELDS', '请填写病历标题和诊断。');
      const current = deps.clinical.findRecord(request.params.id, context);
      if (!current)
        return fail(
          request,
          reply,
          404,
          'RECORD_NOT_FOUND',
          '未找到病历，或该病历不在当前医生的授权范围。',
        );
      if (!hasValidBody(current.templateId, request.body.body))
        return fail(request, reply, 422, 'INVALID_RECORD_BODY', '病历正文与所选模板不匹配。');
      const result = deps.clinical.updateDraft(
        request.params.id,
        expectedVersion,
        { ...request.body, title, diagnosis },
        context,
      );
      if (result.kind === 'not-found')
        return fail(request, reply, 404, 'RECORD_NOT_FOUND', '未找到可编辑的病历草稿。');
      if (result.kind === 'not-draft')
        return fail(request, reply, 409, 'RECORD_NOT_EDITABLE', '只能修改草稿状态的病历。');
      if (result.kind === 'stale')
        return reply
          .header('ETag', `"record-v${result.currentVersion}"`)
          .code(412)
          .send({
            error: { code: 'STALE_RECORD_VERSION', message: '病历已被其他保存更新，请重新加载。' },
            meta: { requestId: request.id, mode: 'demo' },
          });
      deps.platform.recordAccess({
        actorId: context.actorId,
        action: 'record.update',
        targetType: 'medical-record',
        targetId: result.record.id,
        outcome: 'success',
        description: '保存本机演示病历草稿新版本',
      });
      return sendRecord(request, reply, result.record);
    },
  );

  const lifecycleMessages = {
    notFound: '未找到病历，或该病历不在当前医生的授权范围。',
    stale: '病历已被其他保存更新，请重新加载。',
    conflict: '该提交标识已用于其他病历操作，请先核对当前状态。',
    incomplete: '提交审核前请完整填写标题、诊断和模板必填正文。',
    ownVersion: '不能审核自己撰写的当前病历版本。',
    reviewDenied: '当前医生没有病历审核权限。',
    invalidState: '当前病历状态不允许执行该操作。',
    RECORD_NOT_SUBMITTABLE: '只有当前医生可编辑的草稿才能提交审核。',
    RECORD_NOT_REVIEWABLE: '只有待审核且尚未批准的病历版本可以审核。',
    RECORD_NOT_ARCHIVABLE: '只有当前版本已批准的病历可以归档。',
    RECORD_NOT_CORRECTABLE: '只有已归档的病历可以发起修订。',
  };

  const requireLifecycleHeaders = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): { expectedVersion: number; requestKey: string } | undefined => {
    const expectedVersion = readVersion(request);
    if (!expectedVersion) {
      fail(request, reply, 428, 'VERSION_REQUIRED', '状态变更前必须携带当前版本。');
      return undefined;
    }
    const requestKey = readIdempotencyKey(request);
    if (!requestKey) {
      fail(request, reply, 428, 'IDEMPOTENCY_KEY_REQUIRED', '状态变更必须携带有效的提交标识。');
      return undefined;
    }
    return { expectedVersion, requestKey };
  };

  app.post<{ Params: { id: string } }>(
    '/api/v1/records/:id/submit',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const headers = requireLifecycleHeaders(request, reply);
      if (!headers) return;
      const context = deps.context();
      const result = deps.clinical.submit(
        request.params.id,
        headers.expectedVersion,
        headers.requestKey,
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'record.submit',
          targetType: 'medical-record',
          targetId: result.record.id,
          outcome: 'success',
          description: '提交本机演示病历审核',
        });
      return sendLifecycle(request, reply, result, lifecycleMessages);
    },
  );

  app.post<{ Params: { id: string }; Body: ReviewMedicalRecordRequest }>(
    '/api/v1/records/:id/reviews',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['decision', 'comment'],
          additionalProperties: false,
          properties: {
            decision: { type: 'string', enum: ['approved', 'returned'] },
            comment: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const headers = requireLifecycleHeaders(request, reply);
      if (!headers) return;
      const comment = request.body.comment.trim();
      if (request.body.decision === 'returned' && !comment)
        return fail(request, reply, 422, 'INVALID_REVIEW_COMMENT', '退回病历必须填写审核意见。');
      const context = deps.context();
      const result = deps.clinical.review(
        request.params.id,
        headers.expectedVersion,
        headers.requestKey,
        { decision: request.body.decision, comment },
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'record.review',
          targetType: 'medical-record',
          targetId: result.record.id,
          outcome: 'success',
          description:
            request.body.decision === 'approved' ? '批准本机演示病历版本' : '退回本机演示病历草稿',
        });
      if (result.kind === 'forbidden')
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'record.review',
          targetType: 'medical-record',
          targetId: request.params.id,
          outcome: 'denied',
          description: '拒绝未授权或自我审核的病历操作',
        });
      return sendLifecycle(request, reply, result, lifecycleMessages);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/records/:id/archive',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const headers = requireLifecycleHeaders(request, reply);
      if (!headers) return;
      const context = deps.context();
      const result = deps.clinical.archive(
        request.params.id,
        headers.expectedVersion,
        headers.requestKey,
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'record.archive',
          targetType: 'medical-record',
          targetId: result.record.id,
          outcome: 'success',
          description: '归档本机演示病历版本',
        });
      return sendLifecycle(request, reply, result, lifecycleMessages);
    },
  );

  app.post<{ Params: { id: string }; Body: CorrectMedicalRecordRequest }>(
    '/api/v1/records/:id/corrections',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      const headers = requireLifecycleHeaders(request, reply);
      if (!headers) return;
      const reason = request.body.reason.trim();
      if (!reason)
        return fail(request, reply, 422, 'INVALID_CORRECTION_REASON', '归档修订必须填写修订原因。');
      const context = deps.context();
      const result = deps.clinical.correct(
        request.params.id,
        headers.expectedVersion,
        headers.requestKey,
        reason,
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'record.correct',
          targetType: 'medical-record',
          targetId: result.record.id,
          outcome: 'success',
          description: '从归档病历复制新的演示修订草稿',
        });
      return sendLifecycle(request, reply, result, lifecycleMessages);
    },
  );

  const sendOrder = (
    request: FastifyRequest,
    reply: FastifyReply,
    order: MedicalOrderDetail,
    status = 200,
  ) =>
    reply.code(status).header('ETag', `"order-v${order.version}"`).send(envelope(request, order));

  const sendOrderResult = (
    request: FastifyRequest,
    reply: FastifyReply,
    result: OrderCommandResult,
  ) => {
    if (result.kind === 'ok')
      return sendOrder(request, reply, result.order, result.replayed ? 200 : 200);
    if (result.kind === 'not-found')
      return fail(
        request,
        reply,
        404,
        'ORDER_NOT_FOUND',
        '未找到医嘱，或该医嘱不在当前医生的授权范围。',
      );
    if (result.kind === 'stale')
      return reply
        .header('ETag', `"order-v${result.currentVersion}"`)
        .code(412)
        .send({
          error: { code: 'STALE_ORDER_VERSION', message: '医嘱已被其他保存更新，请重新加载。' },
          meta: { requestId: request.id, mode: 'demo' },
        });
    if (result.kind === 'conflict')
      return fail(
        request,
        reply,
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        '该提交标识已用于其他医嘱操作，请先核对当前状态。',
      );
    if (result.kind === 'unconfirmed')
      return fail(request, reply, 422, 'ORDER_NOT_CONFIRMED', '开立医嘱前必须确认模板预填内容。');
    if (result.kind === 'invalid-payload')
      return fail(request, reply, 422, 'INVALID_ORDER_PAYLOAD', '医嘱内容与所选开单模板不匹配。');
    return fail(request, reply, 409, result.code, '只有进行中的医嘱可以修改或停止。');
  };

  const readOrderVersion = (request: FastifyRequest): number | undefined => {
    const match = /^"order-v([1-9]\d*)"$/.exec(request.headers['if-match'] ?? '');
    return match ? Number(match[1]) : undefined;
  };

  const payloadSchema = {
    type: 'object',
    additionalProperties: { type: 'string', maxLength: 2000 },
  } as const;

  app.get('/api/v1/order-templates', async (request) => envelope(request, medicalOrderTemplates));

  app.get<{
    Querystring: { recordId?: string; patientId?: string; status?: MedicalOrderStatus };
  }>(
    '/api/v1/orders',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            recordId: { type: 'string', minLength: 1, maxLength: 80 },
            patientId: { type: 'string', minLength: 1, maxLength: 80 },
            status: { type: 'string', enum: ['draft', 'active', 'stopped'] },
          },
        },
      },
    },
    async (request) => envelope(request, deps.clinical.listOrders(request.query, deps.context())),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/orders/:id/versions',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const versions = deps.clinical.listOrderVersions(request.params.id, deps.context());
      if (!versions)
        return fail(
          request,
          reply,
          404,
          'ORDER_NOT_FOUND',
          '未找到医嘱，或该医嘱不在当前医生的授权范围。',
        );
      return envelope(request, versions);
    },
  );

  app.get<{ Params: { id: string; version: number } }>(
    '/api/v1/orders/:id/versions/:version',
    { schema: { params: versionParamsSchema } },
    async (request, reply) => {
      const version = deps.clinical.findOrderVersion(
        request.params.id,
        request.params.version,
        deps.context(),
      );
      if (!version)
        return fail(
          request,
          reply,
          404,
          'ORDER_VERSION_NOT_FOUND',
          '未找到医嘱版本，或该医嘱不在当前医生的授权范围。',
        );
      return reply.header('ETag', `"order-v${version.version}"`).send(envelope(request, version));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/orders/:id',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const order = deps.clinical.findOrder(request.params.id, deps.context());
      if (!order)
        return fail(
          request,
          reply,
          404,
          'ORDER_NOT_FOUND',
          '未找到医嘱，或该医嘱不在当前医生的授权范围。',
        );
      return sendOrder(request, reply, order);
    },
  );

  app.post<{ Params: { id: string }; Body: CreateMedicalOrderRequest }>(
    '/api/v1/records/:id/orders',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['templateId', 'payload', 'confirmed'],
          additionalProperties: false,
          properties: {
            templateId: { type: 'string', enum: ['medication', 'examination', 'laboratory'] },
            payload: payloadSchema,
            confirmed: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const requestKey = readIdempotencyKey(request);
      if (!requestKey)
        return fail(
          request,
          reply,
          428,
          'IDEMPOTENCY_KEY_REQUIRED',
          '开立医嘱必须携带有效的提交标识。',
        );
      const context = deps.context();
      const result = deps.clinical.createOrder(
        request.params.id,
        requestKey,
        request.body,
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'order.create',
          targetType: 'medical-order',
          targetId: result.order.id,
          outcome: 'success',
          description: '确认后开立本机演示医嘱',
        });
      if (result.kind === 'ok' && !result.replayed)
        return sendOrder(request, reply, result.order, 201);
      return sendOrderResult(request, reply, result);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateMedicalOrderRequest }>(
    '/api/v1/orders/:id',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['payload', 'changeReason'],
          additionalProperties: false,
          properties: {
            payload: payloadSchema,
            changeReason: { type: 'string', minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const expectedVersion = readOrderVersion(request);
      if (!expectedVersion)
        return fail(request, reply, 428, 'VERSION_REQUIRED', '修改医嘱前必须携带当前版本。');
      const changeReason = request.body.changeReason.trim();
      if (!changeReason)
        return fail(request, reply, 422, 'INVALID_ORDER_REASON', '修改医嘱必须填写变更原因。');
      const context = deps.context();
      const result = deps.clinical.updateOrder(
        request.params.id,
        expectedVersion,
        { payload: request.body.payload, changeReason },
        context,
      );
      if (result.kind === 'ok')
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'order.update',
          targetType: 'medical-order',
          targetId: result.order.id,
          outcome: 'success',
          description: '保存本机演示医嘱新版本',
        });
      return sendOrderResult(request, reply, result);
    },
  );

  app.post<{ Params: { id: string }; Body: StopMedicalOrderRequest }>(
    '/api/v1/orders/:id/stop',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      const expectedVersion = readOrderVersion(request);
      if (!expectedVersion)
        return fail(request, reply, 428, 'VERSION_REQUIRED', '停止医嘱前必须携带当前版本。');
      const requestKey = readIdempotencyKey(request);
      if (!requestKey)
        return fail(
          request,
          reply,
          428,
          'IDEMPOTENCY_KEY_REQUIRED',
          '停止医嘱必须携带有效的提交标识。',
        );
      const reason = request.body.reason.trim();
      if (!reason)
        return fail(request, reply, 422, 'INVALID_ORDER_REASON', '停止医嘱必须填写原因。');
      const context = deps.context();
      const result = deps.clinical.stopOrder(
        request.params.id,
        expectedVersion,
        requestKey,
        reason,
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'order.stop',
          targetType: 'medical-order',
          targetId: result.order.id,
          outcome: 'success',
          description: '停止本机演示医嘱',
        });
      return sendOrderResult(request, reply, result);
    },
  );

  const sendMaterialResult = (
    request: FastifyRequest,
    reply: FastifyReply,
    result: MaterialCommandResult,
    created = false,
  ) => {
    if (result.kind === 'ok')
      return reply
        .code(created && !result.replayed ? 201 : 200)
        .send(envelope(request, result.material));
    if (result.kind === 'not-found')
      return fail(
        request,
        reply,
        404,
        'CLINICAL_MATERIAL_NOT_FOUND',
        '未找到会诊材料，或不在当前授权范围。',
      );
    if (result.kind === 'conflict')
      return fail(
        request,
        reply,
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        '该提交标识已用于其他材料操作，请先核对当前状态。',
      );
    if (result.kind === 'forbidden')
      return fail(request, reply, 403, 'CLINICAL_MATERIAL_DENIED', '当前医生不是该会诊的参与者。');
    if (result.kind === 'invalid-sections')
      return fail(
        request,
        reply,
        422,
        'INVALID_SHARED_SECTIONS',
        '共享区段必须属于该病历模板版本的字段。',
      );
    const messages: Record<string, string> = {
      RECORD_VERSION_NOT_SHAREABLE: '远程会诊只能引用已批准或已归档的病历版本。',
      CONSULTATION_NOT_ACTIVE: '只能向进行中的会诊引用病历材料。',
      MATERIAL_ALREADY_LINKED: '该会诊材料已绑定报告。',
      REPORT_NOT_CONFIRMED: '只能回链已确认的会诊报告。',
    };
    return fail(
      request,
      reply,
      409,
      result.code,
      messages[result.code] ?? '当前状态不允许该材料操作。',
    );
  };

  app.get<{ Querystring: { consultationId?: string } }>(
    '/api/v1/clinical-materials',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['consultationId'],
          additionalProperties: false,
          properties: { consultationId: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request) =>
      envelope(request, deps.clinical.listMaterials(request.query.consultationId!, deps.context())),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/clinical-materials/:id',
    { schema: { params: paramsSchema } },
    async (request, reply) => {
      const material = deps.clinical.findMaterial(request.params.id, deps.context());
      if (!material)
        return fail(
          request,
          reply,
          404,
          'CLINICAL_MATERIAL_NOT_FOUND',
          '未找到会诊材料，或不在当前授权范围。',
        );
      return envelope(request, material);
    },
  );

  app.post<{ Body: CreateClinicalMaterialRequest }>(
    '/api/v1/clinical-materials',
    {
      schema: {
        body: {
          type: 'object',
          required: ['consultationId', 'recordId', 'recordVersion', 'sharedSections', 'purpose'],
          additionalProperties: false,
          properties: {
            consultationId: { type: 'string', minLength: 1, maxLength: 80 },
            recordId: { type: 'string', minLength: 1, maxLength: 80 },
            recordVersion: { type: 'integer', minimum: 1 },
            sharedSections: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1, maxLength: 80 },
            },
            purpose: { type: 'string', minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const requestKey = readIdempotencyKey(request);
      if (!requestKey)
        return fail(
          request,
          reply,
          428,
          'IDEMPOTENCY_KEY_REQUIRED',
          '引用会诊材料必须携带有效的提交标识。',
        );
      const purpose = request.body.purpose.trim();
      if (!purpose)
        return fail(request, reply, 422, 'INVALID_MATERIAL_PURPOSE', '引用会诊材料必须填写用途。');
      const context = deps.context();
      const result = deps.clinical.createMaterial(
        requestKey,
        { ...request.body, purpose },
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'clinical-material.create',
          targetType: 'clinical-material',
          targetId: result.material.id,
          outcome: 'success',
          description: '引用固定病历版本作为会诊材料',
        });
      return sendMaterialResult(request, reply, result, true);
    },
  );

  app.post<{ Params: { id: string }; Body: LinkClinicalMaterialReportRequest }>(
    '/api/v1/clinical-materials/:id/report-link',
    {
      schema: {
        params: paramsSchema,
        body: {
          type: 'object',
          required: ['reportId'],
          additionalProperties: false,
          properties: { reportId: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request, reply) => {
      const requestKey = readIdempotencyKey(request);
      if (!requestKey)
        return fail(
          request,
          reply,
          428,
          'IDEMPOTENCY_KEY_REQUIRED',
          '回链会诊报告必须携带有效的提交标识。',
        );
      const context = deps.context();
      const result = deps.clinical.linkMaterialReport(
        request.params.id,
        requestKey,
        request.body.reportId,
        context,
      );
      if (result.kind === 'ok' && !result.replayed)
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'clinical-material.link-report',
          targetType: 'clinical-material',
          targetId: result.material.id,
          outcome: 'success',
          description: '回链已确认的会诊报告',
        });
      return sendMaterialResult(request, reply, result);
    },
  );
}
