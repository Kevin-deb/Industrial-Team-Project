import { createHash, randomUUID } from 'node:crypto';
import type {
  CreateSocialContentBlockInput,
  CreateCommentInput,
  CreateMessageInput,
  CreatePostInput,
  CreateReportInput,
  ConversationReadResult,
  SocialComment,
  SocialDirectMessage,
  SocialListQuery,
  SocialMembership,
  SocialMessagePage,
  SocialNotification,
  SocialPage,
  SocialPostDetail,
  SocialPostSummary,
  SocialPreferences,
  SocialReport,
  UpdateSocialPreferencesInput,
} from '@doctor/contracts';
import type { RequestContext } from '../platform/index.js';
import {
  SocialAttachmentClaimFailure,
  SqliteSocialRepository,
  type SocialCommandReceipt,
} from './repository.js';
import type { SocialAuditPort, SocialPeerDirectoryPort } from './ports.js';
import type { SocialRealtimePort } from './realtime.js';
import type { SocialModerationResult } from './ports.js';
import { validateContentBlocks } from './content-blocks.js';

export class CommunityDisabled extends Error {}
export class SocialNotFound extends Error {}
export class SocialConflict extends Error {}
export class SocialValidationFailure extends Error {}
export class SocialTagNotAllowed extends SocialValidationFailure {}

export class SocialService {
  constructor(
    private readonly repository: SqliteSocialRepository,
    private readonly audit?: SocialAuditPort,
    private readonly peerDirectory?: SocialPeerDirectoryPort,
    private readonly realtime?: SocialRealtimePort,
  ) {}
  getPreferences(context: RequestContext) {
    return this.repository.getPreferences(context.actorId);
  }
  updatePreferences(
    input: UpdateSocialPreferencesInput,
    context: RequestContext,
  ): SocialPreferences {
    return this.execute(
      'social.preferences.update',
      input.commandId,
      input,
      context,
      () => {
        const item = {
          enabled: input.enabled,
          notificationsEnabled: input.enabled && input.notificationsEnabled,
          updatedAt: context.now,
        };
        this.repository.updatePreferences(context.actorId, item);
        return item;
      },
      'preferences',
    );
  }
  listGroups(query: SocialListQuery, context: RequestContext) {
    this.assertEnabled(context);
    return this.repository.listGroups(query, context.actorId);
  }
  joinGroup(groupId: string, commandId: string, context: RequestContext): SocialMembership {
    this.assertEnabled(context);
    if (!this.repository.hasGroup(groupId)) throw new SocialNotFound();
    return this.execute(
      'social.group.join',
      commandId,
      { groupId, commandId },
      context,
      () => {
        const item = { groupId, identityId: context.actorId, joinedAt: context.now };
        this.repository.joinGroup(item);
        return item;
      },
      groupId,
    );
  }
  leaveGroup(groupId: string, commandId: string, context: RequestContext): { id: string } {
    this.assertEnabled(context);
    if (!this.repository.hasGroup(groupId)) throw new SocialNotFound();
    return this.execute(
      'social.group.leave',
      commandId,
      { groupId, commandId },
      context,
      () => {
        this.repository.leaveGroup(groupId, context.actorId);
        return { id: groupId };
      },
      groupId,
    );
  }
  listFeed(query: SocialListQuery, context: RequestContext): SocialPage<SocialPostSummary> {
    this.assertEnabled(context);
    return this.repository.listFeed(query, context.actorId);
  }
  listGroupPosts(groupId: string, query: SocialListQuery, context: RequestContext) {
    this.assertEnabled(context);
    if (!this.repository.hasGroup(groupId)) throw new SocialNotFound();
    if (!this.repository.isMember(groupId, context.actorId)) throw new SocialNotFound();
    return this.repository.listGroupPosts(groupId, query, context.actorId);
  }
  listGroupTags(groupId: string, context: RequestContext) {
    this.assertEnabled(context);
    if (!this.repository.hasGroup(groupId)) throw new SocialNotFound();
    if (!this.repository.isMember(groupId, context.actorId)) throw new SocialNotFound();
    return { groupId, tags: this.repository.listGroupTags(groupId) };
  }
  getPost(id: string, context: RequestContext) {
    this.assertEnabled(context);
    const item = this.repository.findPost(id, context.actorId);
    if (!item) throw new SocialNotFound();
    if (!this.repository.isMember(item.groupId, context.actorId)) throw new SocialNotFound();
    return item;
  }
  createPost(input: CreatePostInput, context: RequestContext): SocialPostDetail {
    this.assertEnabled(context);
    if (!this.repository.isMember(input.groupId, context.actorId))
      throw new SocialValidationFailure();
    const allowedTags = new Set(this.repository.listGroupTags(input.groupId));
    if (input.tags.some((tag) => !allowedTags.has(tag))) throw new SocialTagNotAllowed();
    if (input.containsCaseMaterial && !input.deidentificationConfirmed)
      throw new SocialValidationFailure();
    const blocks = validateContentBlocks(input.contentBlocks);
    this.assertBodyOrBlocks(input.body, blocks);
    return this.execute(
      'social.post.create',
      input.commandId,
      input,
      context,
      () => {
        const id = `POST-${randomUUID()}`,
          anonymous = input.displayMode === 'anonymous';
        const item: SocialPostDetail = {
          id,
          groupId: input.groupId,
          groupName: '',
          author: {
            ...(anonymous ? {} : { id: context.actorId }),
            displayName: anonymous ? '匿名医生' : '',
            anonymous,
            avatarInitials: anonymous ? '匿' : '',
          },
          title: input.title,
          excerpt: input.body.slice(0, 180),
          body: input.body,
          contentBlocks: [],
          tags: input.tags,
          createdAt: context.now,
          lastActivityAt: context.now,
          commentCount: 0,
          likeCount: 0,
          bookmarkCount: 0,
          viewCount: 0,
          likedByMe: false,
          bookmarkedByMe: false,
          comments: [],
          containsCaseMaterial: input.containsCaseMaterial,
          deidentificationConfirmed: input.deidentificationConfirmed,
        };
        this.repository.createPost(item, context.actorId);
        this.claimContentBlocks('post', id, blocks, context);
        return this.repository.findPost(id, context.actorId)!;
      },
      'post',
    );
  }
  createComment(input: CreateCommentInput, context: RequestContext): SocialComment {
    this.assertEnabled(context);
    const post = this.getPost(input.postId, context);
    if (input.parentCommentId && !post.comments.some((item) => item.id === input.parentCommentId))
      throw new SocialValidationFailure();
    const blocks = validateContentBlocks(input.contentBlocks);
    this.assertBodyOrBlocks(input.body, blocks);
    return this.execute(
      'social.comment.create',
      input.commandId,
      input,
      context,
      () => {
        const anonymous = input.displayMode === 'anonymous';
        const item: SocialComment = {
          id: `COMMENT-${randomUUID()}`,
          postId: input.postId,
          ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
          author: {
            ...(anonymous ? {} : { id: context.actorId }),
            displayName: anonymous ? '匿名医生' : '',
            anonymous,
            avatarInitials: anonymous ? '匿' : '',
          },
          displayMode: input.displayMode,
          body: input.body,
          contentBlocks: [],
          createdAt: context.now,
        };
        this.repository.createComment(item, context.actorId);
        this.claimContentBlocks('comment', item.id, blocks, context);
        const recipient = input.parentCommentId
          ? this.repository.findCommentAuthor(input.parentCommentId)?.authorId
          : this.repository.findPostAuthor(input.postId);
        if (recipient && recipient !== context.actorId)
          this.notify(
            recipient,
            context.actorId,
            input.postId,
            input.parentCommentId ? 'reply' : 'comment',
            context.now,
            item.id,
          );
        return this.repository
          .findPost(input.postId, context.actorId)!
          .comments.find((comment) => comment.id === item.id)!;
      },
      'comment',
    );
  }
  setLike(postId: string, liked: boolean, commandId: string, context: RequestContext) {
    return this.setReaction(postId, liked, commandId, context, 'like');
  }
  setBookmark(postId: string, bookmarked: boolean, commandId: string, context: RequestContext) {
    return this.setReaction(postId, bookmarked, commandId, context, 'bookmark');
  }
  setCommentReaction(commentId: string, kind: 'like' | 'bookmark', value: boolean, commandId: string, context: RequestContext): SocialPostDetail {
    this.assertEnabled(context);
    const target = this.repository.findCommentAuthor(commentId);
    if (!target) throw new SocialNotFound();
    this.getPost(target.postId, context);
    return this.execute('social.comment.reaction', commandId, { commentId, kind, value }, context, () => {
      const changed = this.repository.setCommentReaction(commentId, context.actorId, kind, value, context.now);
      if (changed && value && target.authorId !== context.actorId)
        this.notify(target.authorId, context.actorId, target.postId, kind, context.now, commentId);
      return this.repository.findPost(target.postId, context.actorId)!;
    }, commentId);
  }
  recordView(postId: string, commandId: string, context: RequestContext): SocialPostDetail {
    this.assertEnabled(context);
    this.getPost(postId, context);
    return this.execute(
      'social.post.view',
      commandId,
      { postId, commandId },
      context,
      () => {
        this.repository.incrementPostView(postId);
        return this.repository.findPost(postId, context.actorId)!;
      },
      postId,
    );
  }
  private setReaction(
    postId: string,
    value: boolean,
    commandId: string,
    context: RequestContext,
    kind: 'like' | 'bookmark',
  ): SocialPostDetail {
    this.assertEnabled(context);
    this.getPost(postId, context);
    return this.execute(
      `social.${kind}.set`,
      commandId,
      { postId, value, commandId },
      context,
      () => {
        kind === 'like'
          ? this.repository.setLike(postId, context.actorId, value, context.now)
          : this.repository.setBookmark(postId, context.actorId, value, context.now);
        const recipient = this.repository.findPostAuthor(postId);
        if (value && recipient && recipient !== context.actorId)
          this.notify(recipient, context.actorId, postId, kind, context.now);
        return this.repository.findPost(postId, context.actorId)!;
      },
      postId,
    );
  }
  listMyPosts(query: SocialListQuery, context: RequestContext) {
    this.assertEnabled(context);
    return this.repository.listMyPosts(query, context.actorId);
  }
  listMyLikes(query: SocialListQuery, context: RequestContext) {
    this.assertEnabled(context);
    return this.repository.listMyLikes(query, context.actorId);
  }
  listMyBookmarks(query: SocialListQuery, context: RequestContext) {
    this.assertEnabled(context);
    return this.repository.listMyBookmarks(query, context.actorId);
  }
  listNotifications(context: RequestContext) {
    this.assertEnabled(context);
    return this.repository.listNotifications(context.actorId);
  }
  markNotificationRead(id: string, commandId: string, context: RequestContext): SocialNotification {
    this.assertEnabled(context);
    const current = this.repository.findNotification(id, context.actorId);
    if (!current) throw new SocialNotFound();
    return this.execute(
      'social.notification.read',
      commandId,
      { id, commandId },
      context,
      () => {
        this.repository.markNotificationRead(id, context.actorId, context.now);
        return this.repository.findNotification(id, context.actorId)!;
      },
      id,
    );
  }
  listConversations(context: RequestContext) {
    this.assertEnabled(context);
    return this.repository.listConversations(context.actorId);
  }
  searchPeers(query: string, context: RequestContext) {
    this.assertEnabled(context);
    return this.peerDirectory?.search(query, context.actorId) ?? [];
  }
  listMessages(
    conversationId: string,
    cursor: string | undefined,
    context: RequestContext,
  ): SocialMessagePage {
    this.assertEnabled(context);
    const page = this.repository.listMessages(conversationId, context.actorId, cursor);
    if (
      !page.items.length &&
      !this.repository.listConversations(context.actorId).some((item) => item.id === conversationId)
    )
      throw new SocialNotFound();
    return page;
  }
  markConversationRead(
    conversationId: string,
    commandId: string,
    context: RequestContext,
  ): ConversationReadResult {
    this.assertEnabled(context);
    const result = this.execute(
      'social.conversation.read',
      commandId,
      { conversationId, commandId },
      context,
      () => {
        if (!this.repository.markConversationRead(conversationId, context.actorId, context.now))
          throw new SocialNotFound();
        return { conversationId, unreadCount: 0 as const, readAt: context.now };
      },
      'conversation',
    );
    this.realtime?.publish([context.actorId], {
      type: 'social.conversation.read',
      conversationId,
      occurredAt: context.now,
    });
    return result;
  }
  async sendMessage(
    input: CreateMessageInput,
    context: RequestContext,
  ): Promise<SocialDirectMessage> {
    this.assertEnabled(context);
    if (input.recipientId === context.actorId || !this.repository.identityExists(input.recipientId))
      throw new SocialValidationFailure();
    const blocks = validateContentBlocks(input.contentBlocks);
    this.assertBodyOrBlocks(input.body, blocks);
    const result = this.execute(
      'social.message.send',
      input.commandId,
      input,
      context,
      () => {
        const existingConversation = this.repository.findDirectConversation(
          context.actorId,
          input.recipientId,
        );
        if (input.conversationId && input.conversationId !== existingConversation)
          throw new SocialValidationFailure();
        const conversationId = existingConversation ?? `CONVERSATION-${randomUUID()}`;
        if (!existingConversation)
          this.repository.createDirectConversation(
            conversationId,
            context.actorId,
            input.recipientId,
            context.now,
          );
        const item = {
          id: `DM-${randomUUID()}`,
          conversationId,
          senderId: context.actorId,
          recipientId: input.recipientId,
          body: input.body,
          contentBlocks: [],
          sentAt: context.now,
        };
        this.repository.createMessage(item);
        this.claimContentBlocks('message', item.id, blocks, context);
        return this.repository.findMessage(item.id, context.actorId)!;
      },
      'message',
    );
    this.realtime?.publish([result.senderId, result.recipientId], {
      type: 'social.message.created',
      conversationId: result.conversationId,
      messageId: result.id,
      occurredAt: result.sentAt,
    });
    return result;
  }
  createReport(input: CreateReportInput, context: RequestContext): SocialReport {
    this.assertEnabled(context);
    if ((!input.postId && !input.messageId) || (input.postId && input.messageId))
      throw new SocialValidationFailure();
    if (input.postId && !this.repository.findPost(input.postId, context.actorId))
      throw new SocialNotFound();
    if (input.messageId && !this.repository.canAccessMessage(input.messageId, context.actorId))
      throw new SocialNotFound();
    return this.execute(
      'social.report.create',
      input.commandId,
      input,
      context,
      () => {
        const item: SocialReport = {
          id: `REPORT-${randomUUID()}`,
          ...(input.postId ? { postId: input.postId } : {}),
          ...(input.messageId ? { messageId: input.messageId } : {}),
          reason: input.reason,
          status: 'pending',
          createdAt: context.now,
        };
        this.repository.createReport(item, context.actorId, input.description);
        this.notify(
          context.actorId,
          context.actorId,
          input.postId ?? '',
          'report-accepted',
          context.now,
        );
        return item;
      },
      'report',
    );
  }
  /** Adapter-owned callback; ordinary doctors cannot submit moderation decisions. */
  receiveModerationResult(input: SocialModerationResult): void {
    if (!input.eventId.trim() || !['upheld', 'rejected'].includes(input.outcome) || !Number.isFinite(Date.parse(input.reviewedAt)))
      throw new SocialValidationFailure();
    const report = this.repository.findReportForModeration(input.reportId);
    if (!report) throw new SocialNotFound();
    const reporterId = String(report.reporter_id);
    this.execute('social.report.result', input.eventId, input, { actorId: reporterId, now: input.reviewedAt }, () => {
      if (report.status !== 'pending') throw new SocialConflict('Moderation result conflict');
      this.repository.applyReportOutcome(input.reportId, input.outcome, input.reviewedAt);
      const postId = report.post_id ? String(report.post_id) : '';
      this.notify(reporterId, reporterId, postId, input.outcome === 'upheld' ? 'report-upheld' : 'report-rejected', input.reviewedAt);
      if (input.outcome === 'upheld') {
        const authorId = postId ? this.repository.findPostAuthor(postId) : this.repository.findMessageAuthorForModeration(String(report.reported_message_id));
        if (authorId) this.notify(authorId, authorId, postId, 'content-moderated', input.reviewedAt);
      }
      return { id: input.reportId, status: input.outcome };
    }, input.reportId);
  }
  private assertEnabled(context: RequestContext) {
    if (!this.repository.getPreferences(context.actorId).enabled) throw new CommunityDisabled();
  }
  private assertBodyOrBlocks(body: string, blocks: readonly CreateSocialContentBlockInput[]) {
    if (!body.trim() && !blocks.length) throw new SocialValidationFailure();
  }
  private claimContentBlocks(
    entityType: 'post' | 'comment' | 'message',
    entityId: string,
    blocks: readonly CreateSocialContentBlockInput[],
    context: RequestContext,
  ) {
    try {
      this.repository.createContentBlocks(
        entityType,
        entityId,
        blocks,
        context.actorId,
        context.now,
      );
    } catch (error) {
      if (error instanceof SocialAttachmentClaimFailure) throw new SocialValidationFailure();
      throw error;
    }
  }
  private notify(
    recipientId: string,
    actorId: string,
    postId: string,
    kind: SocialNotification['kind'],
    createdAt: string,
    commentId?: string,
  ) {
    const preferences = this.repository.getPreferences(recipientId);
    if (!preferences.enabled || !preferences.notificationsEnabled) return;
    this.repository.createNotification(
      {
        id: `NOTICE-${randomUUID()}`,
        kind,
        actorDisplayName: '',
        postId,
        ...(commentId ? { commentId } : {}),
        createdAt,
      },
      recipientId,
      actorId,
    );
  }
  private execute<T>(
    operation: string,
    commandId: string,
    input: unknown,
    context: RequestContext,
    work: () => T,
    resourceId: string,
  ): T {
    const digest = createHash('sha256').update(stableJson({ operation, input })).digest('hex');
    let replayed = false;
    const result = this.repository.transaction(() => {
      const receipt = this.repository.findReceipt(context.actorId, commandId);
      if (receipt) {
        replayed = true;
        return replay<T>(receipt, operation, digest);
      }
      const result = work();
      this.repository.saveReceipt({
        actorId: context.actorId,
        commandId,
        operation,
        requestDigest: digest,
        resourceId: objectId(result, resourceId),
        responseJson: JSON.stringify(result),
        createdAt: context.now,
      });
      return result;
    });
    if (!replayed) {
      void this.audit?.record({
        actorId: context.actorId,
        action: operation,
        resourceType: resourceId,
        resourceId: objectId(result, resourceId),
        outcome: 'success',
        occurredAt: context.now,
      });
    }
    return result;
  }
}

function replay<T>(receipt: SocialCommandReceipt, operation: string, digest: string): T {
  if (receipt.operation !== operation || receipt.requestDigest !== digest)
    throw new SocialConflict();
  return JSON.parse(receipt.responseJson) as T;
}
function objectId(value: unknown, fallback: string) {
  return value && typeof value === 'object' && 'id' in value ? String(value.id) : fallback;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
