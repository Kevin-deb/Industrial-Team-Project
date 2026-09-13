import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CreateMessageInput, CreatePostInput, CreateReportInput, SocialListQuery, UpdateSocialPreferencesInput } from '@doctor/contracts';
import type { RequestContext } from '../platform/index.js';
import { CommunityDisabled, SocialConflict, SocialNotFound, SocialService, SocialValidationFailure } from './service.js';

const commandId = { type: 'string', minLength: 8, maxLength: 120 } as const;
const idParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 1, maxLength: 140 } } } as const;
const listQuery = { type: 'object', additionalProperties: false, properties: { q: { type: 'string', maxLength: 100 }, tag: { type: 'string', maxLength: 30 }, sort: { type: 'string', enum: ['latest', 'latest-reply'] }, page: { type: 'integer', minimum: 1, maximum: 100000 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } } as const;

export function registerSocialRoutes(app: FastifyInstance, service: SocialService, context: () => RequestContext) {
  app.get('/api/v1/social/preferences', async (request, reply) => socialReply(request, reply, () => service.getPreferences(context())));
  app.patch<{ Body: UpdateSocialPreferencesInput }>('/api/v1/social/preferences', { schema: { body: { type: 'object', required: ['commandId', 'enabled', 'notificationsEnabled'], additionalProperties: false, properties: { commandId, enabled: { type: 'boolean' }, notificationsEnabled: { type: 'boolean' } } } } }, async (request, reply) => socialReply(request, reply, () => service.updatePreferences(request.body, context())));
  app.get<{ Querystring: SocialListQuery }>('/api/v1/social/groups', { schema: { querystring: listQuery } }, async (request, reply) => socialReply(request, reply, () => service.listGroups(request.query, context())));
  app.post<{ Params: { id: string }; Body: { commandId: string } }>('/api/v1/social/groups/:id/join', { schema: { params: idParams, body: commandBody } }, async (request, reply) => socialReply(request, reply, () => service.joinGroup(request.params.id, request.body.commandId, context()), 201));
  app.delete<{ Params: { id: string }; Body: { commandId: string } }>('/api/v1/social/groups/:id/membership', { schema: { params: idParams, body: commandBody } }, async (request, reply) => socialReply(request, reply, () => service.leaveGroup(request.params.id, request.body.commandId, context())));
  app.get<{ Querystring: SocialListQuery }>('/api/v1/social/feed', { schema: { querystring: listQuery } }, async (request, reply) => socialReply(request, reply, () => service.listFeed(request.query, context())));
  app.get<{ Params: { id: string }; Querystring: SocialListQuery }>('/api/v1/social/groups/:id/posts', { schema: { params: idParams, querystring: listQuery } }, async (request, reply) => socialReply(request, reply, () => service.listGroupPosts(request.params.id, request.query, context())));
  app.get<{ Params: { id: string } }>('/api/v1/social/posts/:id', { schema: { params: idParams } }, async (request, reply) => socialReply(request, reply, () => service.getPost(request.params.id, context())));
  app.post<{ Body: CreatePostInput }>('/api/v1/social/posts', { schema: { body: postBody } }, async (request, reply) => socialReply(request, reply, () => service.createPost(request.body, context()), 201));
  app.post<{ Params: { id: string }; Body: { commandId: string; parentCommentId?: string; displayMode: 'named' | 'anonymous'; body: string } }>('/api/v1/social/posts/:id/comments', { schema: { params: idParams, body: commentBody } }, async (request, reply) => socialReply(request, reply, () => service.createComment({ ...request.body, postId: request.params.id }, context()), 201));
  for (const action of ['like', 'bookmark'] as const) app.post<{ Params: { id: string }; Body: { commandId: string; value: boolean } }>(`/api/v1/social/posts/:id/${action}`, { schema: { params: idParams, body: toggleBody } }, async (request, reply) => socialReply(request, reply, () => action === 'like' ? service.setLike(request.params.id, request.body.value, request.body.commandId, context()) : service.setBookmark(request.params.id, request.body.value, request.body.commandId, context())));
  for (const kind of ['posts', 'likes', 'bookmarks'] as const) app.get<{ Querystring: SocialListQuery }>(`/api/v1/social/me/${kind}`, { schema: { querystring: listQuery } }, async (request, reply) => socialReply(request, reply, () => kind === 'posts' ? service.listMyPosts(request.query, context()) : kind === 'likes' ? service.listMyLikes(request.query, context()) : service.listMyBookmarks(request.query, context())));
  app.get('/api/v1/social/notifications', async (request, reply) => socialReply(request, reply, () => service.listNotifications(context())));
  app.post<{ Params: { id: string }; Body: { commandId: string } }>('/api/v1/social/notifications/:id/read', { schema: { params: idParams, body: commandBody } }, async (request, reply) => socialReply(request, reply, () => service.markNotificationRead(request.params.id, request.body.commandId, context())));
  app.get('/api/v1/social/conversations', async (request, reply) => socialReply(request, reply, () => service.listConversations(context())));
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>('/api/v1/social/conversations/:id/messages', { schema: { params: idParams, querystring: { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 80 } } } } }, async (request, reply) => socialReply(request, reply, () => service.listMessages(request.params.id, request.query.cursor, context())));
  app.post<{ Body: CreateMessageInput }>('/api/v1/social/messages', { schema: { body: messageBody } }, async (request, reply) => socialReply(request, reply, () => service.sendMessage(request.body, context()), 201));
  app.post<{ Body: CreateReportInput }>('/api/v1/social/reports', { schema: { body: reportBody } }, async (request, reply) => socialReply(request, reply, () => service.createReport(request.body, context()), 201));
}

const commandBody = { type: 'object', required: ['commandId'], additionalProperties: false, properties: { commandId } } as const;
const toggleBody = { type: 'object', required: ['commandId', 'value'], additionalProperties: false, properties: { commandId, value: { type: 'boolean' } } } as const;
const postBody = { type: 'object', required: ['commandId', 'groupId', 'displayMode', 'title', 'body', 'tags', 'containsCaseMaterial', 'deidentificationConfirmed'], additionalProperties: false, properties: { commandId, groupId: { type: 'string', minLength: 1, maxLength: 100 }, displayMode: { type: 'string', enum: ['named', 'anonymous'] }, title: { type: 'string', minLength: 2, maxLength: 120 }, body: { type: 'string', minLength: 2, maxLength: 10000 }, tags: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 30 } }, containsCaseMaterial: { type: 'boolean' }, deidentificationConfirmed: { type: 'boolean' } } } as const;
const commentBody = { type: 'object', required: ['commandId', 'displayMode', 'body'], additionalProperties: false, properties: { commandId, parentCommentId: { type: 'string', maxLength: 140 }, displayMode: { type: 'string', enum: ['named', 'anonymous'] }, body: { type: 'string', minLength: 1, maxLength: 4000 } } } as const;
const messageBody = { type: 'object', required: ['commandId', 'recipientId', 'body'], additionalProperties: false, properties: { commandId, conversationId: { type: 'string', maxLength: 140 }, recipientId: { type: 'string', minLength: 1, maxLength: 100 }, body: { type: 'string', minLength: 1, maxLength: 4000 } } } as const;
const reportBody = { type: 'object', required: ['commandId', 'reason'], additionalProperties: false, properties: { commandId, postId: { type: 'string', maxLength: 140 }, messageId: { type: 'string', maxLength: 140 }, reason: { type: 'string', enum: ['false-medical-claim', 'advertising', 'harassment', 'other'] }, description: { type: 'string', maxLength: 1000 } } } as const;

async function socialReply<T>(request: FastifyRequest, reply: FastifyReply, work: () => T | Promise<T>, status = 200) {
  try { const data = await work(); request.log.info({ requestId: request.id, domain: 'social', route: request.routeOptions.url, action: request.method, outcome: 'success' }, 'social operation'); return reply.code(status).send({ data, meta: { requestId: request.id, mode: 'demo' } }); }
  catch (error) {
    if (error instanceof CommunityDisabled) return fail(request, reply, 403, 'COMMUNITY_DISABLED', '同行社区已关闭，可在偏好设置中重新开启。');
    if (error instanceof SocialNotFound) return fail(request, reply, 404, 'SOCIAL_RESOURCE_NOT_FOUND', '未找到该社区内容。');
    if (error instanceof SocialConflict) return fail(request, reply, 409, 'COMMAND_CONFLICT', '该操作编号已用于另一项修改，请重新操作。');
    if (error instanceof SocialValidationFailure) return fail(request, reply, 400, 'INVALID_SOCIAL_CONTENT', '请检查内容、圈子成员身份或去标识化确认。');
    throw error;
  }
}
function fail(request: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) { request.log.warn({ requestId: request.id, domain: 'social', route: request.routeOptions.url, action: request.method, outcome: code }, 'social operation rejected'); return reply.code(status).send({ error: { code, message }, meta: { requestId: request.id, mode: 'demo' } }); }
