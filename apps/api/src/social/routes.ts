import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreateMessageInput,
  MarkConversationReadInput,
  CreatePostInput,
  CreateReportInput,
  SocialListQuery,
  UpdateSocialPreferencesInput,
} from '@doctor/contracts';
import type { RequestContext } from '../platform/index.js';
import type { AttachmentService } from './attachment-service.js';
import {
  CommunityDisabled,
  SocialConflict,
  SocialNotFound,
  SocialService,
  SocialTagNotAllowed,
  SocialValidationFailure,
} from './service.js';

const commandId = { type: 'string', minLength: 8, maxLength: 120 } as const;
const idParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 140 } },
} as const;
const listQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', maxLength: 100 },
    tag: { type: 'string', maxLength: 30 },
    tags: { type: 'string', maxLength: 180 },
    sort: {
      type: 'string',
      enum: ['most-liked', 'most-bookmarked', 'most-viewed', 'latest', 'latest-reply'],
    },
    page: { type: 'integer', minimum: 1, maximum: 100000 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

export function registerSocialRoutes(
  app: FastifyInstance,
  service: SocialService,
  context: () => RequestContext,
  attachments?: AttachmentService,
) {
  const socialReply = <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    work: () => T | Promise<T>,
    status = 200,
  ) => replySocial(request, reply, context().actorId, work, status);
  if (attachments) registerAttachmentRoutes(app, attachments, context);
  for (const [resource, kind] of [
    ['posts', 'post'],
    ['comments', 'comment'],
  ] as const) {
    app.patch<{
      Params: { id: string };
      Body: {
        commandId: string;
        action: 'edit' | 'delete';
        body?: string;
        title?: string;
        reason?: string;
      };
    }>(
      `/api/v1/social/${resource}/:id/content`,
      {
        schema: {
          params: idParams,
          body: {
            type: 'object',
            required: ['commandId', 'action'],
            additionalProperties: false,
            properties: {
              commandId,
              action: { type: 'string', enum: ['edit', 'delete'] },
              body: { type: 'string', maxLength: 20000 },
              title: { type: 'string', maxLength: 120 },
              reason: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
        },
      },
      async (request, reply) =>
        socialReply(request, reply, () =>
          service.changeContent(kind, request.params.id, request.body, context()),
        ),
    );
    app.get<{ Params: { id: string } }>(
      `/api/v1/social/${resource}/:id/history`,
      { schema: { params: idParams } },
      async (request, reply) =>
        socialReply(request, reply, () =>
          service.contentHistory(kind, request.params.id, context()),
        ),
    );
  }
  app.get('/api/v1/social/preferences', async (request, reply) =>
    socialReply(request, reply, () => service.getPreferences(context())),
  );
  app.patch<{ Body: UpdateSocialPreferencesInput }>(
    '/api/v1/social/preferences',
    {
      schema: {
        body: {
          type: 'object',
          required: ['commandId', 'enabled', 'notificationsEnabled'],
          additionalProperties: false,
          properties: {
            commandId,
            enabled: { type: 'boolean' },
            notificationsEnabled: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) =>
      socialReply(request, reply, () => service.updatePreferences(request.body, context())),
  );
  app.get<{ Querystring: SocialListQuery }>(
    '/api/v1/social/groups',
    { schema: { querystring: listQuery } },
    async (request, reply) =>
      socialReply(request, reply, () => service.listGroups(request.query, context())),
  );
  app.post<{ Params: { id: string }; Body: { commandId: string } }>(
    '/api/v1/social/groups/:id/join',
    { schema: { params: idParams, body: commandBody } },
    async (request, reply) =>
      socialReply(
        request,
        reply,
        () => service.joinGroup(request.params.id, request.body.commandId, context()),
        201,
      ),
  );
  app.delete<{ Params: { id: string }; Body: { commandId: string } }>(
    '/api/v1/social/groups/:id/membership',
    { schema: { params: idParams, body: commandBody } },
    async (request, reply) =>
      socialReply(request, reply, () =>
        service.leaveGroup(request.params.id, request.body.commandId, context()),
      ),
  );
  app.get<{ Querystring: SocialListQuery }>(
    '/api/v1/social/feed',
    { schema: { querystring: listQuery } },
    async (request, reply) =>
      socialReply(request, reply, () => service.listFeed(request.query, context())),
  );
  app.get<{ Params: { id: string }; Querystring: SocialListQuery }>(
    '/api/v1/social/groups/:id/posts',
    { schema: { params: idParams, querystring: listQuery } },
    async (request, reply) =>
      socialReply(request, reply, () =>
        service.listGroupPosts(request.params.id, request.query, context()),
      ),
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/social/groups/:id/tags',
    { schema: { params: idParams } },
    async (request, reply) =>
      socialReply(request, reply, () => service.listGroupTags(request.params.id, context())),
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/social/posts/:id',
    { schema: { params: idParams } },
    async (request, reply) =>
      socialReply(request, reply, () => service.getPost(request.params.id, context())),
  );
  app.post<{ Params: { id: string }; Body: { commandId: string } }>(
    '/api/v1/social/posts/:id/views',
    { schema: { params: idParams, body: commandBody } },
    async (request, reply) =>
      socialReply(request, reply, () =>
        service.recordView(request.params.id, request.body.commandId, context()),
      ),
  );
  app.post<{ Body: CreatePostInput }>(
    '/api/v1/social/posts',
    { schema: { body: postBody } },
    async (request, reply) =>
      socialReply(request, reply, () => service.createPost(request.body, context()), 201),
  );
  app.post<{
    Params: { id: string };
    Body: {
      commandId: string;
      parentCommentId?: string;
      displayMode: 'named' | 'anonymous';
      body: string;
    };
  }>(
    '/api/v1/social/posts/:id/comments',
    { schema: { params: idParams, body: commentBody } },
    async (request, reply) =>
      socialReply(
        request,
        reply,
        () => service.createComment({ ...request.body, postId: request.params.id }, context()),
        201,
      ),
  );
  for (const [path, action] of [
    ['likes', 'like'],
    ['bookmarks', 'bookmark'],
  ] as const) {
    app.post<{ Params: { id: string }; Body: { commandId: string } }>(
      `/api/v1/social/posts/:id/${path}`,
      { schema: { params: idParams, body: commandBody } },
      async (request, reply) =>
        socialReply(request, reply, () =>
          action === 'like'
            ? service.setLike(request.params.id, true, request.body.commandId, context())
            : service.setBookmark(request.params.id, true, request.body.commandId, context()),
        ),
    );
    app.delete<{ Params: { id: string }; Body: { commandId: string } }>(
      `/api/v1/social/posts/:id/${path}`,
      { schema: { params: idParams, body: commandBody } },
      async (request, reply) =>
        socialReply(request, reply, () =>
          action === 'like'
            ? service.setLike(request.params.id, false, request.body.commandId, context())
            : service.setBookmark(request.params.id, false, request.body.commandId, context()),
        ),
    );
  }
  // Compatibility with the first local E prototype; new callers use plural resource routes above.
  for (const [path, kind] of [
    ['likes', 'like'],
    ['bookmarks', 'bookmark'],
  ] as const) {
    for (const method of ['POST', 'DELETE'] as const) {
      app.route<{ Params: { id: string }; Body: { commandId: string } }>({
        method,
        url: `/api/v1/social/comments/:id/${path}`,
        schema: { params: idParams, body: commandBody },
        handler: async (request, reply) =>
          socialReply(request, reply, () =>
            service.setCommentReaction(
              request.params.id,
              kind,
              method === 'POST',
              request.body.commandId,
              context(),
            ),
          ),
      });
    }
  }
  for (const action of ['like', 'bookmark'] as const)
    app.post<{ Params: { id: string }; Body: { commandId: string; value: boolean } }>(
      `/api/v1/social/posts/:id/${action}`,
      { schema: { params: idParams, body: toggleBody } },
      async (request, reply) =>
        socialReply(request, reply, () =>
          action === 'like'
            ? service.setLike(
                request.params.id,
                request.body.value,
                request.body.commandId,
                context(),
              )
            : service.setBookmark(
                request.params.id,
                request.body.value,
                request.body.commandId,
                context(),
              ),
        ),
    );
  for (const kind of ['posts', 'likes', 'bookmarks'] as const)
    app.get<{ Querystring: SocialListQuery }>(
      `/api/v1/social/me/${kind}`,
      { schema: { querystring: listQuery } },
      async (request, reply) =>
        socialReply(request, reply, () =>
          kind === 'posts'
            ? service.listMyPosts(request.query, context())
            : kind === 'likes'
              ? service.listMyLikes(request.query, context())
              : service.listMyBookmarks(request.query, context()),
        ),
    );
  app.get('/api/v1/social/notifications', async (request, reply) =>
    socialReply(request, reply, () => service.listNotifications(context())),
  );
  app.get('/api/v1/social/me/notifications', async (request, reply) =>
    socialReply(request, reply, () => service.listNotifications(context())),
  );
  app.post<{ Params: { id: string }; Body: { commandId: string } }>(
    '/api/v1/social/notifications/:id/read',
    { schema: { params: idParams, body: commandBody } },
    async (request, reply) =>
      socialReply(request, reply, () =>
        service.markNotificationRead(request.params.id, request.body.commandId, context()),
      ),
  );
  app.get('/api/v1/social/conversations', async (request, reply) =>
    socialReply(request, reply, () => service.listConversations(context())),
  );
  app.get<{ Querystring: { q: string } }>(
    '/api/v1/social/peers',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          additionalProperties: false,
          properties: { q: { type: 'string', minLength: 1, maxLength: 60 } },
        },
      },
    },
    async (request, reply) =>
      socialReply(request, reply, () => service.searchPeers(request.query.q, context())),
  );
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/api/v1/social/conversations/:id/messages',
    {
      schema: {
        params: idParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { cursor: { type: 'string', maxLength: 80 } },
        },
      },
    },
    async (request, reply) =>
      socialReply(request, reply, () =>
        service.listMessages(request.params.id, request.query.cursor, context()),
      ),
  );
  app.post<{ Params: { id: string }; Body: MarkConversationReadInput }>(
    '/api/v1/social/conversations/:id/read',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['commandId'],
          additionalProperties: false,
          properties: { commandId },
        },
      },
    },
    async (request, reply) =>
      socialReply(request, reply, () =>
        service.markConversationRead(request.params.id, request.body.commandId, context()),
      ),
  );
  app.post<{ Body: CreateMessageInput }>(
    '/api/v1/social/messages',
    { schema: { body: messageBody } },
    async (request, reply) =>
      socialReply(request, reply, () => service.sendMessage(request.body, context()), 201),
  );
  app.post<{ Body: CreateReportInput }>(
    '/api/v1/social/reports',
    { schema: { body: reportBody } },
    async (request, reply) =>
      socialReply(request, reply, () => service.createReport(request.body, context()), 201),
  );
}

function registerAttachmentRoutes(
  app: FastifyInstance,
  attachments: AttachmentService,
  context: () => RequestContext,
) {
  app.post('/api/v1/social/attachments', async (request, reply) =>
    replySocial(
      request,
      reply,
      context().actorId,
      async () => {
        try {
          const file = await request.file({ limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
          if (!file) throw new SocialValidationFailure();
          const content = await file.toBuffer();
          if (file.file.truncated) throw new SocialValidationFailure();
          return await attachments.upload(content, file.mimetype, context());
        } catch (error) {
          if (
            error instanceof CommunityDisabled ||
            error instanceof SocialNotFound ||
            error instanceof SocialValidationFailure
          )
            throw error;
          throw new SocialValidationFailure();
        }
      },
      201,
    ),
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/social/attachments/:id/content',
    { schema: { params: idParams } },
    async (request, reply) => {
      try {
        const { attachment, content } = await attachments.read(request.params.id, context());
        reply
          .header('Accept-Ranges', attachment.kind === 'audio' ? 'bytes' : 'none')
          .header('Content-Type', attachment.mediaType)
          .header('Content-Disposition', 'inline')
          .header('Cache-Control', 'private, max-age=300');
        if (attachment.kind === 'audio' && request.headers.range) {
          const range = parseSingleRange(request.headers.range, content.byteLength);
          if (!range)
            return reply.code(416).header('Content-Range', `bytes */${content.byteLength}`).send();
          const chunk = content.subarray(range.start, range.end + 1);
          return reply
            .code(206)
            .header('Content-Range', `bytes ${range.start}-${range.end}/${content.byteLength}`)
            .header('Content-Length', String(chunk.byteLength))
            .send(chunk);
        }
        return reply.header('Content-Length', String(content.byteLength)).send(content);
      } catch (error) {
        return replySocial(request, reply, context().actorId, async () => {
          throw error;
        });
      }
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/api/v1/social/attachments/:id',
    { schema: { params: idParams } },
    async (request, reply) =>
      replySocial(request, reply, context().actorId, () =>
        attachments.removeTemporary(request.params.id, context()),
      ),
  );
}

function parseSingleRange(value: string, size: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size < 1) return undefined;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return undefined;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return undefined;
  return { start, end: Math.min(end, size - 1) };
}

const commandBody = {
  type: 'object',
  required: ['commandId'],
  additionalProperties: false,
  properties: { commandId },
} as const;
const toggleBody = {
  type: 'object',
  required: ['commandId', 'value'],
  additionalProperties: false,
  properties: { commandId, value: { type: 'boolean' } },
} as const;
const metricSchema = {
  type: 'object',
  required: ['metricCode', 'displayName', 'value', 'unit'],
  additionalProperties: false,
  properties: {
    metricCode: { type: 'string', enum: ['systolic', 'diastolic', 'heart-rate', 'glucose'] },
    displayName: { type: 'string', minLength: 1, maxLength: 30 },
    value: { type: 'number' },
    unit: { type: 'string', minLength: 1, maxLength: 20 },
  },
} as const;
const cardSchema = {
  type: 'object',
  required: [
    'schemaVersion',
    'sourceType',
    'measuredAt',
    'metrics',
    'sourceLabel',
    'deidentificationConfirmed',
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    sourceType: { type: 'string', enum: ['manual', 'provider'] },
    measuredAt: { type: 'string', minLength: 16, maxLength: 40 },
    metrics: { type: 'array', minItems: 1, maxItems: 4, items: metricSchema },
    sourceLabel: { type: 'string', minLength: 1, maxLength: 100 },
    note: { type: 'string', maxLength: 300 },
    deidentificationConfirmed: { type: 'boolean' },
  },
} as const;
const contentBlocksSchema = {
  type: 'array',
  maxItems: 7,
  items: {
    oneOf: [
      {
        type: 'object',
        required: ['kind', 'order', 'attachmentId'],
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['image'] },
          order: { type: 'integer', minimum: 0, maximum: 6 },
          attachmentId: { type: 'string', minLength: 1, maxLength: 140 },
        },
      },
      {
        type: 'object',
        required: ['kind', 'order', 'attachmentId'],
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['audio'] },
          order: { type: 'integer', minimum: 0, maximum: 6 },
          attachmentId: { type: 'string', minLength: 1, maxLength: 140 },
        },
      },
      {
        type: 'object',
        required: ['kind', 'order', 'card'],
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['medical-metric-card'] },
          order: { type: 'integer', minimum: 0, maximum: 6 },
          card: cardSchema,
        },
      },
    ],
  },
} as const;
const postBody = {
  type: 'object',
  required: [
    'commandId',
    'groupId',
    'displayMode',
    'title',
    'body',
    'tags',
    'containsCaseMaterial',
    'deidentificationConfirmed',
  ],
  additionalProperties: false,
  properties: {
    commandId,
    groupId: { type: 'string', minLength: 1, maxLength: 100 },
    displayMode: { type: 'string', enum: ['named', 'anonymous'] },
    title: { type: 'string', minLength: 2, maxLength: 120 },
    body: { type: 'string', maxLength: 10000 },
    tags: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 30 } },
    containsCaseMaterial: { type: 'boolean' },
    deidentificationConfirmed: { type: 'boolean' },
    contentBlocks: contentBlocksSchema,
  },
} as const;
const commentBody = {
  type: 'object',
  required: ['commandId', 'displayMode', 'body'],
  additionalProperties: false,
  properties: {
    commandId,
    parentCommentId: { type: 'string', maxLength: 140 },
    displayMode: { type: 'string', enum: ['named', 'anonymous'] },
    body: { type: 'string', maxLength: 4000 },
    contentBlocks: contentBlocksSchema,
  },
} as const;
const messageBody = {
  type: 'object',
  required: ['commandId', 'recipientId', 'body'],
  additionalProperties: false,
  properties: {
    commandId,
    conversationId: { type: 'string', maxLength: 140 },
    recipientId: { type: 'string', minLength: 1, maxLength: 100 },
    body: { type: 'string', maxLength: 4000 },
    contentBlocks: contentBlocksSchema,
  },
} as const;
const reportBody = {
  type: 'object',
  required: ['commandId', 'reason'],
  additionalProperties: false,
  properties: {
    commentId: { type: 'string', maxLength: 140 },
    commandId,
    postId: { type: 'string', maxLength: 140 },
    messageId: { type: 'string', maxLength: 140 },
    reason: { type: 'string', enum: ['false-medical-claim', 'advertising', 'harassment', 'other'] },
    description: { type: 'string', maxLength: 1000 },
  },
} as const;

async function replySocial<T>(
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
        domain: 'social',
        resourceId: resourceId(request),
        route: request.routeOptions.url,
        action: request.method,
        outcome: 'success',
        durationMs: Math.round(performance.now() - startedAt),
      },
      'social operation',
    );
    return reply.code(status).send({ data, meta: { requestId: request.id, mode: 'demo' } });
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (error instanceof CommunityDisabled)
      return fail(
        request,
        reply,
        actorId,
        durationMs,
        403,
        'COMMUNITY_DISABLED',
        '同行社区已关闭，可在偏好设置中重新开启。',
      );
    if (error instanceof SocialNotFound)
      return fail(
        request,
        reply,
        actorId,
        durationMs,
        404,
        'SOCIAL_RESOURCE_NOT_FOUND',
        '未找到该社区内容。',
      );
    if (error instanceof SocialConflict)
      return fail(
        request,
        reply,
        actorId,
        durationMs,
        409,
        'COMMAND_CONFLICT',
        '该操作编号已用于另一项修改，请重新操作。',
      );
    if (error instanceof SocialTagNotAllowed)
      return fail(
        request,
        reply,
        actorId,
        durationMs,
        400,
        'SOCIAL_TAG_NOT_ALLOWED',
        '只能选择本圈子已有的标签。',
      );
    if (error instanceof SocialValidationFailure)
      return fail(
        request,
        reply,
        actorId,
        durationMs,
        400,
        'INVALID_SOCIAL_CONTENT',
        '请检查内容、圈子成员身份或去标识化确认。',
      );
    throw error;
  }
}
function fail(
  request: FastifyRequest,
  reply: FastifyReply,
  actorId: string,
  durationMs: number,
  status: number,
  code: string,
  message: string,
) {
  request.log.warn(
    {
      requestId: request.id,
      actorId,
      domain: 'social',
      resourceId: resourceId(request),
      route: request.routeOptions.url,
      action: request.method,
      outcome: code,
      durationMs,
    },
    'social operation rejected',
  );
  return reply
    .code(status)
    .send({ error: { code, message }, meta: { requestId: request.id, mode: 'demo' } });
}
function resourceId(request: FastifyRequest): string {
  const params = request.params as { id?: string } | undefined;
  const body = request.body as
    | {
        groupId?: string;
        postId?: string;
        conversationId?: string;
        messageId?: string;
      }
    | undefined;
  return (
    params?.id ??
    body?.postId ??
    body?.groupId ??
    body?.conversationId ??
    body?.messageId ??
    'collection'
  );
}
