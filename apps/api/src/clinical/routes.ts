import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type CreateMedicalRecordRequest,
  type MedicalRecordBody,
  type MedicalRecordTemplateId,
  type UpdateMedicalRecordRequest,
} from '@doctor/contracts';
import type { EncounterRepository } from '../encounters/index.js';
import type { PlatformRepository, RequestContext } from '../platform/index.js';
import type { ClinicalRepository } from './repository.js';
import { clinicalTemplateFields } from './templates.js';

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

const bodyProperties = {
  title: { type: 'string', minLength: 1, maxLength: 120 },
  diagnosis: { type: 'string', minLength: 1, maxLength: 200 },
  body: {
    type: 'object',
    additionalProperties: { type: 'string', maxLength: 5000 },
  },
} as const;

export function registerClinicalRoutes(
  app: FastifyInstance,
  deps: ClinicalRouteDependencies,
): void {
  app.get('/api/v1/records', async (request) =>
    envelope(request, deps.clinical.listRecords(deps.context())),
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
      const match = /^"record-v([1-9]\d*)"$/.exec(request.headers['if-match'] ?? '');
      if (!match)
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
        Number(match[1]),
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
      return reply
        .header('ETag', `"record-v${result.record.version}"`)
        .send(envelope(request, result.record));
    },
  );
}
