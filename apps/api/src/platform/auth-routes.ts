import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthError, AuthService, type EmailDeliveryPort } from './auth.js';

export class DemoEmailOutbox implements EmailDeliveryPort {
  private readonly messages = new Map<string, { email: string; code: string; expiresAt: string }>();

  async sendVerificationCode(input: { email: string; code: string; expiresAt: string }) {
    this.messages.set(input.email, input);
  }

  find(email: string) {
    return this.messages.get(email);
  }
}

type Envelope = <T>(request: FastifyRequest, data: T) => unknown;
type Failure = (
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) => unknown;

function replyAuthError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  fail: Failure,
) {
  if (!(error instanceof AuthError)) throw error;
  const details: Record<string, [number, string]> = {
    INVALID_CREDENTIALS: [401, '账号或验证信息不正确。'],
    ACCOUNT_DISABLED: [403, '账号当前不可用。'],
    INVALID_EMAIL_CODE: [401, '邮箱验证码不正确。'],
    EMAIL_CODE_EXPIRED: [401, '邮箱验证码已过期。'],
    EMAIL_CODE_USED: [409, '邮箱验证码已使用。'],
    PHOTO_CHECK_REQUIRED: [401, '请先完成邮箱验证和演示拍照核验。'],
  };
  const [status, message] = details[error.code] ?? [401, '身份验证失败。'];
  return fail(request, reply, status, error.code, message);
}

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
  outbox: DemoEmailOutbox,
  envelope: Envelope,
  fail: Failure,
) {
  app.post(
    '/api/v1/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['account', 'password'],
          properties: {
            account: { type: 'string', minLength: 3, maxLength: 160 },
            password: { type: 'string', minLength: 8, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await auth.beginLogin(request.body as { account: string; password: string });
        return reply.code(202).send(envelope(request, data));
      } catch (error) {
        return replyAuthError(error, request, reply, fail);
      }
    },
  );

  app.get('/api/v1/auth/demo-email/:challengeId', async (request, reply) => {
    const account = auth.challengeEmail(String((request.params as { challengeId: string }).challengeId));
    const message = account ? outbox.find(account) : undefined;
    if (!message) return fail(request, reply, 404, 'NOT_FOUND', '未找到演示邮件。');
    return envelope(request, { code: message.code, emailHint: maskEmail(message.email), expiresAt: message.expiresAt });
  });

  app.post(
    '/api/v1/auth/email/verify',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['challengeId', 'code'],
          properties: {
            challengeId: { type: 'string', minLength: 1, maxLength: 256 },
            code: { type: 'string', pattern: '^[0-9]{6}$' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return envelope(
          request,
          auth.verifyEmail(request.body as { challengeId: string; code: string }),
        );
      } catch (error) {
        return replyAuthError(error, request, reply, fail);
      }
    },
  );

  app.post(
    '/api/v1/auth/photo-check',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['ticket', 'captureMethod', 'photoDataUrl'],
          properties: {
            ticket: { type: 'string', minLength: 1, maxLength: 256 },
            captureMethod: { type: 'string', enum: ['camera', 'upload'] },
            photoDataUrl: { type: 'string', minLength: 24, maxLength: 2_800_000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as {
          ticket: string;
          captureMethod: 'camera' | 'upload';
          photoDataUrl: string;
        };
        if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(body.photoDataUrl))
          return fail(request, reply, 422, 'INVALID_PHOTO', '请拍摄或上传 PNG/JPEG 图片。');
        const digest = createHash('sha256').update(body.photoDataUrl).digest('hex');
        const data = auth.completePhotoCheck({
          ticket: body.ticket,
          captureMethod: body.captureMethod,
          photoObjectKey: `auth-photo/${digest}`,
        });
        return reply.code(201).send(envelope(request, data));
      } catch (error) {
        return replyAuthError(error, request, reply, fail);
      }
    },
  );

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (token) auth.logout(token);
    return reply.code(204).send();
  });
}

export function bearerToken(value: string | undefined): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_-]{4,})$/.exec(value ?? '');
  return match?.[1];
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}
