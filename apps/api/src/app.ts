import Fastify, { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import type { DatabaseSync } from 'node:sqlite';
import type { Dashboard } from '@doctor/contracts';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from './database/connection.js';
import { DEMO_DOCTOR_ID, DEMO_DATE } from './database/seed.js';
import { SqlitePatientRepository, registerPatientRoutes } from './patients/index.js';
import { SqliteEncounterRepository } from './encounters/index.js';
import { registerClinicalRoutes, SqliteClinicalRepository } from './clinical/index.js';
import { HealthService, registerHealthRoutes, SqliteHealthRepository } from './health/index.js';
import {
  SqlitePatientAccess,
  SqlitePermissionAccess,
  SqlitePlatformRepository,
} from './platform/index.js';
import { features } from './platform/index.js';
import { registerPlannedCommands } from './platform/index.js';
import {
  registerSocialRoutes,
  SocialService,
  SqliteSocialPeerDirectory,
  SqliteSocialRepository,
  AttachmentService,
  LocalAttachmentStorage,
  SocialRealtimeHub,
  type SocialRealtimePort,
} from './social/index.js';

export interface AppOptions {
  /** Trusted composition-root identity. Never obtained from caller-supplied IDs. */
  identity?: { actorId: string };
  /** Desktop packages remain synthetic demos even when packaged with NODE_ENV=production. */
  runtime?: 'local-demo' | 'desktop-demo';
  databasePath?: string;
  database?: DatabaseSync;
  webRoot?: string;
  logger?: boolean;
  now?: () => string;
  mediaRoot?: string;
  socialRealtime?: SocialRealtimePort & {
    subscribe(
      identityId: string,
      listener: (event: import('@doctor/contracts').SocialRealtimeEvent) => void,
    ): () => void;
  };
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
  if (process.env.NODE_ENV === 'production' && options.runtime !== 'desktop-demo')
    throw new Error(
      'The synthetic demo refuses NODE_ENV=production. Configure real identity, authorization and approved integrations before a production deployment.',
    );
  const db = options.database ?? openDatabase(options.databasePath ?? ':memory:');
  const app = Fastify({
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, parts: 1 },
  });
  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 } });
  const patients = new SqlitePatientRepository(db);
  const encounters = new SqliteEncounterRepository(db);
  const clinical = new SqliteClinicalRepository(db, new SqlitePermissionAccess(db), encounters);
  const healthRepository = new SqliteHealthRepository(db);
  const platform = new SqlitePlatformRepository(db);
  const ephemeralMediaRoot =
    !options.mediaRoot && (!options.databasePath || options.databasePath === ':memory:')
      ? mkdtempSync(resolve(tmpdir(), 'carelink-social-media-'))
      : undefined;
  const mediaRoot =
    options.mediaRoot ??
    ephemeralMediaRoot ??
    resolve(dirname(options.databasePath!), 'social-media');
  const socialRepository = new SqliteSocialRepository(db);
  const socialRealtime = options.socialRealtime ?? new SocialRealtimeHub();
  const actorId = options.identity?.actorId ?? DEMO_DOCTOR_ID;
  const context = () => ({
    actorId,
    now: options.now?.() ?? new Date().toISOString(),
  });
  const health = new HealthService(
    healthRepository,
    new SqlitePatientAccess(db),
    {
      find(patientId, requestContext) {
        const patient = patients.findById(patientId, requestContext);
        return patient
          ? {
              id: patient.id,
              name: patient.name,
              gender: patient.gender,
              age: patient.age,
              diagnosis: patient.diagnosis,
              nextFollowUp: patient.nextFollowUp,
              avatarInitials: patient.name.slice(0, 1),
            }
          : undefined;
      },
      search(query, requestContext) {
        return patients
          .list({ q: query || undefined, pageSize: 8 }, requestContext)
          .items.map((patient) => ({
            id: patient.id,
            name: patient.name,
            gender: patient.gender,
            age: patient.age,
            diagnosis: patient.diagnosis,
            nextFollowUp: patient.nextFollowUp,
            avatarInitials: patient.name.slice(0, 1),
          }));
      },
    },
    {
      record(event) {
        if (event.outcome === 'failed') return;
        platform.recordAccess({
          actorId: event.actorId,
          action: event.action,
          targetType: event.resourceType,
          targetId: event.resourceId,
          outcome: event.outcome === 'denied' ? 'denied' : 'success',
          description: `E health ${event.outcome} metadata event`,
        });
      },
    },
  );
  app.addHook('onClose', async () => {
    if (!options.database) db.close();
    if (ephemeralMediaRoot) rmSync(ephemeralMediaRoot, { recursive: true, force: true });
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
      doctor: platform.doctor(context().actorId),
      mode: 'demo',
      demoDate: DEMO_DATE,
      disclaimer: '仅供项目演示：全部患者及临床资料均为合成数据，当前无真实登录与诊疗功能。',
    }),
  );
  registerPatientRoutes(app, { patients, platform, context });
  app.get('/api/v1/encounters', async (request) => envelope(request, encounters.list(context())));
  registerClinicalRoutes(app, { clinical, encounters, platform, context });
  app.get('/api/v1/consultations', async (request) =>
    envelope(request, encounters.listConsultations(context())),
  );
  registerHealthRoutes(app, health, context);
  registerSocialRoutes(
    app,
    new SocialService(
      socialRepository,
      {
        record(event) {
          platform.recordAccess({
            actorId: event.actorId,
            action: event.action,
            targetType: event.resourceType,
            targetId: event.resourceId,
            outcome: 'success',
            description: 'E social success metadata event',
          });
        },
      },
      new SqliteSocialPeerDirectory(db),
      socialRealtime,
    ),
    context,
    new AttachmentService(socialRepository, new LocalAttachmentStorage(mediaRoot)),
  );
  app.get('/api/v1/social/events', { websocket: true }, (socket) => {
    const unsubscribe = socialRealtime.subscribe(context().actorId, (event) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(event));
    });
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
  app.get('/api/v1/audit', async (request) =>
    envelope(request, platform.ownAudit(context().actorId)),
  );
  app.get('/api/v1/features', async (request) => envelope(request, features));
  app.get('/api/v1/dashboard', async (request) => {
    const current = context();
    const people = patients.list({ pageSize: 6 }, current);
    const schedule = encounters.list(current);
    const records = clinical.listRecords({}, current);
    const healthData = health.overview(current);
    const data: Dashboard = {
      stats: {
        patients: people.total,
        pendingEncounters: schedule.filter(
          (e) => e.status === 'waiting' || e.status === 'scheduled',
        ).length,
        pendingReviews: records.filter((r) => r.status === 'pending-review').length,
        healthAlerts: healthData.alerts.length,
      },
      schedule: schedule.filter((e) => e.status !== 'completed'),
      recentPatients: people.items,
      healthAlerts: healthData.alerts,
      activity: platform.ownAudit(current.actorId).slice(0, 5),
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
