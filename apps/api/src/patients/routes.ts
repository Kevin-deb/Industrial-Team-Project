import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PatientQuery, UpdatePatientRequest } from '@doctor/contracts';
import type { PlatformRepository, RequestContext } from '../platform/index.js';
import type { SqlitePatientRepository } from './repository.js';

const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 80 } },
};
const text = (maxLength: number, minLength = 0) => ({ type: 'string', maxLength, minLength });
const lines = (maxLength: number) => ({
  type: 'array',
  maxItems: 50,
  uniqueItems: true,
  items: text(maxLength, 1),
});
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
      });
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
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'gender',
            'age',
            'phone',
            'diagnosis',
            'tags',
            'status',
            'symptoms',
            'allergies',
            'allergyStatus',
            'medicalHistory',
            'careSummary',
            'changeReason',
          ],
          properties: {
            name: text(100, 1),
            gender: { type: 'string', enum: ['女', '男'] },
            age: { type: 'integer', minimum: 0, maximum: 130 },
            phone: text(30),
            diagnosis: text(200, 1),
            tags: lines(100),
            status: { type: 'string', enum: ['stable', 'attention', 'follow-up'] },
            symptoms: lines(500),
            allergies: lines(500),
            allergyStatus: { type: 'string', enum: ['unknown', 'none', 'recorded'] },
            medicalHistory: lines(2000),
            careSummary: text(5000),
            changeReason: text(500, 1),
          },
        },
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
      const input = {
        ...request.body,
        name: request.body.name.trim(),
        diagnosis: request.body.diagnosis.trim(),
        phone: request.body.phone.trim(),
        careSummary: request.body.careSummary.trim(),
        changeReason: request.body.changeReason.trim(),
      };
      if (input.phone !== current.phone && !/^[0-9+() -]*$/.test(input.phone))
        return fail(request, reply, 422, 'INVALID_PATIENT_PHONE', '联系电话格式不正确。');
      for (const key of ['tags', 'symptoms', 'allergies', 'medicalHistory'] as const)
        input[key] = input[key].map((value) => value.trim());
      if (
        !input.name ||
        !input.diagnosis ||
        !input.changeReason ||
        ['tags', 'symptoms', 'allergies', 'medicalHistory'].some((key) => {
          const values = input[key as 'tags'];
          return values.some((value) => !value) || new Set(values).size !== values.length;
        })
      )
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
