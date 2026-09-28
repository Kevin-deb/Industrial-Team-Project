import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DoctorNotificationPreferences, UpdateDoctorProfileInput } from '@doctor/contracts';
import type { RequestContext } from './access.js';
import {
  InvalidSettingsInput,
  SettingsProfileNotFound,
  SqliteSettingsRepository,
} from './settings-repository.js';

const profileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['phone', 'specialty', 'outpatientLocation', 'bio'],
  properties: {
    phone: { type: 'string', maxLength: 20 },
    specialty: { type: 'string', minLength: 1, maxLength: 120 },
    outpatientLocation: { type: 'string', maxLength: 200 },
    bio: { type: 'string', maxLength: 2000 },
  },
} as const;

const clockTime = { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' } as const;
const notificationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['encounter', 'followUp', 'browser', 'quietHours', 'quietStart', 'quietEnd'],
  properties: {
    encounter: { type: 'boolean' },
    followUp: { type: 'boolean' },
    browser: { type: 'boolean' },
    quietHours: { type: 'boolean' },
    quietStart: clockTime,
    quietEnd: clockTime,
  },
} as const;

/** Authentication is supplied by the application hook; caller-selected identity fields are rejected. */
export function registerSettingsRoutes(
  app: FastifyInstance,
  repository: SqliteSettingsRepository,
  getContext: () => RequestContext,
): void {
  app.get('/api/v1/settings/profile', async (request, reply) =>
    settingsReply(request, reply, () => repository.profile(getContext().actorId)),
  );
  app.put<{ Body: UpdateDoctorProfileInput }>(
    '/api/v1/settings/profile',
    { schema: { body: profileSchema } },
    async (request, reply) =>
      settingsReply(request, reply, () => repository.updateProfile(request.body, getContext())),
  );
  app.get('/api/v1/settings/notifications', async (request, reply) =>
    settingsReply(request, reply, () => repository.notificationPreferences(getContext().actorId)),
  );
  app.put<{ Body: DoctorNotificationPreferences }>(
    '/api/v1/settings/notifications',
    { schema: { body: notificationSchema } },
    async (request, reply) =>
      settingsReply(request, reply, () =>
        repository.updateNotificationPreferences(request.body, getContext()),
      ),
  );
}

function settingsReply<T>(request: FastifyRequest, reply: FastifyReply, work: () => T) {
  try {
    return { data: work(), meta: { requestId: request.id, mode: 'demo' } };
  } catch (error) {
    if (error instanceof SettingsProfileNotFound)
      return reply.code(404).send({
        error: { code: 'SETTINGS_NOT_FOUND', message: '未找到当前医生资料。' },
        meta: { requestId: request.id, mode: 'demo' },
      });
    if (error instanceof InvalidSettingsInput)
      return reply.code(400).send({
        error: { code: 'INVALID_SETTINGS', message: error.message },
        meta: { requestId: request.id, mode: 'demo' },
      });
    throw error;
  }
}
