import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { DatabaseSync } from 'node:sqlite';
import type { Dashboard, PatientQuery } from '@doctor/contracts';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './database/connection.js';
import { DEMO_DOCTOR_ID, DEMO_DATE } from './database/seed.js';
import { SqlitePatientRepository } from './patients/index.js';
import { SqliteEncounterRepository } from './encounters/index.js';
import { SqliteClinicalRepository } from './clinical/index.js';
import { SqliteHealthRepository } from './health/index.js';
import { SqlitePlatformRepository } from './platform/index.js';
import { features } from './platform/index.js';
import { registerPlannedCommands } from './platform/index.js';

export interface AppOptions {
  databasePath?: string;
  database?: DatabaseSync;
  webRoot?: string;
  logger?: boolean;
  now?: () => string;
}
const envelope = <T>(request: FastifyRequest, data: T, extra: Record<string, number> = {}) => ({
  data,
  meta: { requestId: request.id, mode: 'demo' as const, ...extra },
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

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Construct without listening; dependency injection supports isolated, repeatable integration tests. */
export async function createApp(options: AppOptions = {}) {
  if (process.env.NODE_ENV === 'production')
    throw new Error(
      'The synthetic demo refuses NODE_ENV=production. Configure real identity, authorization and approved integrations before a production deployment.',
    );
  const db = options.database ?? openDatabase(options.databasePath ?? ':memory:');
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    ajv: { customOptions: { removeAdditional: false } },
  });
  const patients = new SqlitePatientRepository(db);
  const encounters = new SqliteEncounterRepository(db);
  const clinical = new SqliteClinicalRepository(db);
  const health = new SqliteHealthRepository(db);
  const platform = new SqlitePlatformRepository(db);
  const context = () => ({
    actorId: DEMO_DOCTOR_ID,
    now: options.now?.() ?? new Date().toISOString(),
  });
  app.addHook('onClose', async () => {
    if (!options.database) db.close();
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (!isLocalUrl('http://' + request.headers.host))
      return fail(request, reply, 421, 'LOCAL_DEMO_ONLY', '此演示服务仅接受本机地址。');
    const origin = request.headers.origin;
    if (origin && !isLocalUrl(origin))
      return fail(request, reply, 403, 'ORIGIN_NOT_ALLOWED', '此演示服务不接受外部网页请求。');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error && typeof error === 'object' && 'validation' in error)
      return fail(
        request,
        reply,
        400,
        'INVALID_REQUEST',
        '请求参数不符合 API 规范，请检查筛选条件和分页范围。',
      );
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    )
      return fail(request, reply, error.statusCode, 'INVALID_REQUEST', '无法解析该请求。');
    request.log.error({ err: error, requestId: request.id }, 'Request failed');
    return fail(request, reply, 503, 'SERVICE_UNAVAILABLE', '服务暂时不可用，请稍后重试。');
  });
  app.get('/api/v1/health', async (request) => {
    db.prepare('SELECT 1').get();
    return envelope(request, {
      status: 'ok',
      mode: 'demo',
      database: 'connected',
      demoDate: DEMO_DATE,
    });
  });
  app.get('/api/v1/session', async (request) =>
    envelope(request, {
      doctor: platform.doctor(DEMO_DOCTOR_ID),
      mode: 'demo',
      demoDate: DEMO_DATE,
      disclaimer: '仅供项目演示：全部患者及临床资料均为合成数据，当前无真实登录与诊疗功能。',
    }),
  );
  app.get<{ Querystring: PatientQuery }>(
    '/api/v1/patients',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: { type: 'string', maxLength: 100 },
            status: { type: 'string', enum: ['stable', 'attention', 'follow-up'] },
            disease: { type: 'string', maxLength: 100 },
            page: { type: 'integer', minimum: 1, maximum: 100000 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request) => {
      const result = patients.list(request.query, context());
      platform.recordAccess({
        actorId: DEMO_DOCTOR_ID,
        action: 'patient.list',
        targetType: 'patient-collection',
        targetId: 'scoped',
        outcome: 'success',
        description: '访问本机演示患者列表',
      });
      return envelope(request, result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/patients/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request, reply) => {
      const patient = patients.findById(request.params.id, context());
      platform.recordAccess({
        actorId: DEMO_DOCTOR_ID,
        action: 'patient.view',
        targetType: 'patient',
        targetId: request.params.id,
        outcome: patient ? 'success' : 'denied',
        description: patient ? '访问本机演示患者档案' : '请求的患者不存在或不在演示身份授权范围',
      });
      if (!patient)
        return fail(
          request,
          reply,
          404,
          'PATIENT_NOT_FOUND',
          '未找到患者，或该患者不在当前医生的授权范围。',
        );
      return envelope(request, patient);
    },
  );
  app.get('/api/v1/encounters', async (request) => envelope(request, encounters.list(context())));
  app.get('/api/v1/records', async (request) => envelope(request, clinical.listRecords(context())));
  app.get('/api/v1/consultations', async (request) =>
    envelope(request, encounters.listConsultations(context())),
  );
  app.get('/api/v1/health/overview', async (request) =>
    envelope(request, health.overview(context())),
  );
  app.get('/api/v1/audit', async (request) => envelope(request, platform.ownAudit(DEMO_DOCTOR_ID)));
  app.get('/api/v1/features', async (request) => envelope(request, features));
  app.get('/api/v1/dashboard', async (request) => {
    const current = context();
    const people = patients.list({ pageSize: 6 }, current);
    const schedule = encounters.list(current);
    const records = clinical.listRecords(current);
    const healthData = health.overview(current);
    const data: Dashboard = {
      stats: {
        patients: people.total,
        pendingEncounters: schedule.filter((e) => e.status === 'waiting').length,
        pendingReviews: records.filter((r) => r.status === 'pending-review').length,
        healthAlerts: healthData.alerts.length,
      },
      schedule: schedule.filter((e) => e.status !== 'completed'),
      recentPatients: people.items,
      healthAlerts: healthData.alerts,
      activity: platform.ownAudit(DEMO_DOCTOR_ID).slice(0, 5),
    };
    return envelope(request, data);
  });
  registerPlannedCommands(app);
  if (options.webRoot && existsSync(options.webRoot + '/index.html')) {
    await app.register(fastifyStatic, { root: options.webRoot, prefix: '/', index: 'index.html' });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !request.url.includes('.')
      )
        return reply.type('text/html').sendFile('index.html');
      return fail(request, reply, 404, 'NOT_FOUND', '请求的资源不存在。');
    });
  } else {
    app.setNotFoundHandler((request, reply) =>
      fail(request, reply, 404, 'NOT_FOUND', '请求的资源不存在。'),
    );
  }
  await app.ready();
  return app;
}
