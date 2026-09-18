import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  BatchPatientStatusRequest,
  PatientQuery,
  UpdatePatientRequest,
  CreatePatientRequest,
} from '@doctor/contracts';
import type { PlatformRepository, RequestContext } from '../platform/index.js';
import type { SqlitePatientRepository } from './repository.js';
import {
  archiveBodySchema,
  invalidArchive,
  normalizeArchive,
  validOptionalDate,
} from './validation.js';

const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 80 } },
};
const text = (maxLength: number, minLength = 0) => ({ type: 'string', maxLength, minLength });
const envelope = <T>(request: FastifyRequest, data: T, extra = {}) => ({
  data,
  meta: { requestId: request.id, mode: 'demo', ...extra },
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

export function registerPatientRoutes(
  app: FastifyInstance,
  deps: {
    patients: SqlitePatientRepository;
    platform: PlatformRepository;
    context: () => RequestContext;
  },
) {
  const audit = (
    context: RequestContext,
    action: string,
    id: string,
    outcome: 'success' | 'denied',
  ) =>
    deps.platform.recordAccess({
      actorId: context.actorId,
      action,
      targetType: 'patient',
      targetId: id,
      outcome,
      description: 'Patient archive metadata event',
    });
  app.get('/api/v1/patients/summary', async (request) =>
    envelope(request, deps.patients.stats(deps.context())),
  );
  app.post<{ Body: CreatePatientRequest }>(
    '/api/v1/patients',
    {
      schema: {
        body: {
          ...archiveBodySchema,
          properties: {
            ...archiveBodySchema.properties,
            lastVisit: text(10),
            nextFollowUp: text(10),
          },
        },
      },
    },
    async (request, reply) => {
      const context = deps.context();
      if (!deps.patients.canRegister(context)) {
        audit(context, 'patient.register', 'new', 'denied');
        return fail(request, reply, 403, 'PATIENT_REGISTER_DENIED', '当前医生没有患者建档权限。');
      }
      const key = request.headers['idempotency-key'];
      if (
        typeof key !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
      )
        return fail(
          request,
          reply,
          428,
          'REGISTRATION_KEY_REQUIRED',
          '患者建档必须携带有效的提交标识。',
        );
      const input = {
        ...normalizeArchive(request.body),
        lastVisit: request.body.lastVisit ?? '',
        nextFollowUp: request.body.nextFollowUp ?? '',
      };
      if (invalidArchive(input))
        return fail(
          request,
          reply,
          422,
          'INVALID_PATIENT_FIELDS',
          '请填写有效的姓名、健康分类和修改原因，列表项目不能为空或重复。',
        );
      if (!/^[0-9+() -]*$/.test(input.phone))
        return fail(request, reply, 422, 'INVALID_PATIENT_PHONE', '联系电话格式不正确。');
      if ((input.allergyStatus === 'recorded') !== input.allergies.length > 0)
        return fail(request, reply, 422, 'INVALID_ALLERGY_STATUS', '过敏状态与过敏记录不一致。');
      if (
        !validOptionalDate(input.lastVisit) ||
        !validOptionalDate(input.nextFollowUp) ||
        (input.lastVisit && input.nextFollowUp && input.nextFollowUp < input.lastVisit)
      )
        return fail(
          request,
          reply,
          422,
          'INVALID_PATIENT_DATES',
          '请填写有效日期，下次随访不能早于最近就诊。',
        );
      const result = deps.patients.create(input, key.toLowerCase(), context, (id) =>
        audit(context, 'patient.register', id, 'success'),
      );
      if (result.kind === 'forbidden')
        return fail(request, reply, 403, 'PATIENT_REGISTER_DENIED', '当前医生没有患者建档权限。');
      if (result.kind === 'conflict')
        return fail(
          request,
          reply,
          409,
          'REGISTRATION_KEY_CONFLICT',
          '该提交标识已用于其他建档内容，请先核对是否已建档。',
        );
      return reply
        .code(result.kind === 'created' ? 201 : 200)
        .header('ETag', `"patient-v${result.patient.version}"`)
        .header('Location', '/api/v1/patients/' + encodeURIComponent(result.patient.id))
        .send(envelope(request, result.patient));
    },
  );
  app.get<{ Querystring: PatientQuery }>(
    '/api/v1/patients',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: text(100),
            disease: text(100),
            status: { type: 'string', enum: ['stable', 'attention', 'follow-up'] },
            page: { type: 'integer', minimum: 1, maximum: 100000 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
            groupBy: { type: 'string', enum: ['disease', 'status'] },
          },
        },
      },
    },
    async (request) => {
      const context = deps.context();
      const result = deps.patients.list(request.query, context);
      audit(context, 'patient.list', 'scoped', 'success');
      return envelope(request, result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        groups: result.groups,
      });
    },
  );
  app.post<{ Body: BatchPatientStatusRequest }>(
    '/api/v1/patients/batch',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['patients', 'status', 'changeReason'],
          properties: {
            patients: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'expectedVersion'],
                properties: {
                  id: text(80, 1),
                  expectedVersion: {
                    type: 'integer',
                    minimum: 1,
                    maximum: Number.MAX_SAFE_INTEGER,
                  },
                },
              },
            },
            status: { type: 'string', enum: ['stable', 'attention', 'follow-up'] },
            changeReason: text(500, 1),
          },
        },
      },
    },
    async (request, reply) => {
      const input = { ...request.body, changeReason: request.body.changeReason.trim() };
      if (
        !input.changeReason ||
        new Set(input.patients.map((item) => item.id)).size !== input.patients.length
      )
        return fail(
          request,
          reply,
          422,
          'INVALID_PATIENT_BATCH',
          '修改原因不能为空，患者不能重复。',
        );
      const context = deps.context();
      const result = deps.patients.batchStatus(input, context, (id) =>
        audit(context, 'patient.batch-status', id, 'success'),
      );
      if (!result.committed)
        for (const item of result.results)
          if (item.outcome === 'unavailable' || item.outcome === 'forbidden')
            audit(context, 'patient.batch-status', item.id, 'denied');
      if (result.results.some((item) => item.outcome === 'unavailable'))
        return fail(
          request,
          reply,
          404,
          'PATIENT_BATCH_UNAVAILABLE',
          '部分患者已不可用或超出当前授权范围，请刷新后重新选择。',
        );
      return envelope(request, result);
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/patients/:id',
    { schema: { params } },
    async (request, reply) => {
      const context = deps.context();
      const patient = deps.patients.archive(request.params.id, context);
      audit(context, 'patient.view', request.params.id, patient ? 'success' : 'denied');
      if (!patient)
        return fail(
          request,
          reply,
          404,
          'PATIENT_NOT_FOUND',
          '未找到患者，或该患者不在当前医生的授权范围。',
        );
      return reply.header('ETag', `"patient-v${patient.version}"`).send(envelope(request, patient));
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/patients/:id/versions',
    { schema: { params } },
    async (request, reply) => {
      const context = deps.context();
      const versions = deps.patients.versions(request.params.id, context);
      audit(context, 'patient.history', request.params.id, versions ? 'success' : 'denied');
      if (!versions)
        return fail(
          request,
          reply,
          404,
          'PATIENT_NOT_FOUND',
          '未找到患者，或该患者不在当前医生的授权范围。',
        );
      return envelope(request, versions);
    },
  );
  app.patch<{ Params: { id: string }; Body: UpdatePatientRequest }>(
    '/api/v1/patients/:id',
    {
      schema: {
        params,
        body: archiveBodySchema,
      },
    },
    async (request, reply) => {
      const context = deps.context();
      const current = deps.patients.archive(request.params.id, context);
      if (!current) {
        audit(context, 'patient.update', request.params.id, 'denied');
        return fail(
          request,
          reply,
          404,
          'PATIENT_NOT_FOUND',
          '未找到患者，或该患者不在当前医生的授权范围。',
        );
      }
      if (!current.canEdit) {
        audit(context, 'patient.update', request.params.id, 'denied');
        return fail(
          request,
          reply,
          403,
          'PATIENT_WRITE_DENIED',
          '当前医生没有修改该患者档案的权限。',
        );
      }
      const match = /^"patient-v([1-9]\d*)"$/.exec(request.headers['if-match'] ?? '');
      if (!match || !Number.isSafeInteger(Number(match[1])))
        return fail(request, reply, 428, 'VERSION_REQUIRED', '保存档案前必须携带当前版本。');
      const input = normalizeArchive(request.body);
      if (input.phone !== current.phone && !/^[0-9+() -]*$/.test(input.phone))
        return fail(request, reply, 422, 'INVALID_PATIENT_PHONE', '联系电话格式不正确。');
      if (invalidArchive(input))
        return fail(
          request,
          reply,
          422,
          'INVALID_PATIENT_FIELDS',
          '请填写有效的姓名、健康分类和修改原因，列表项目不能为空或重复。',
        );
      if ((input.allergyStatus === 'recorded') !== input.allergies.length > 0)
        return fail(request, reply, 422, 'INVALID_ALLERGY_STATUS', '过敏状态与过敏记录不一致。');
      const result = deps.patients.update(request.params.id, Number(match[1]), input, context, () =>
        audit(context, 'patient.update', request.params.id, 'success'),
      );
      if (result.kind === 'not-found')
        return fail(
          request,
          reply,
          404,
          'PATIENT_NOT_FOUND',
          '未找到患者，或该患者不在当前医生的授权范围。',
        );
      if (result.kind === 'forbidden')
        return fail(
          request,
          reply,
          403,
          'PATIENT_WRITE_DENIED',
          '当前医生没有修改该患者档案的权限。',
        );
      if (result.kind === 'unchanged')
        return fail(request, reply, 422, 'PATIENT_UNCHANGED', '档案内容没有变化。');
      if (result.kind === 'stale')
        return reply
          .header('ETag', `"patient-v${result.version}"`)
          .code(412)
          .send({
            error: {
              code: 'STALE_PATIENT_VERSION',
              message: '档案已被其他保存更新，请重新加载后核对。',
            },
            meta: { requestId: request.id, mode: 'demo' },
          });
      return reply
        .header('ETag', `"patient-v${result.patient.version}"`)
        .send(envelope(request, result.patient));
    },
  );
}
