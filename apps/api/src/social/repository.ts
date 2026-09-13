import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  SocialComment,
  SocialConversation,
  SocialDirectMessage,
  SocialGroup,
  SocialListQuery,
  SocialMembership,
  SocialMessagePage,
  SocialNotification,
  SocialPage,
  SocialPostDetail,
  SocialPostSummary,
  SocialPreferences,
  SocialReport,
} from '@doctor/contracts';

type Row = Record<string, string | number | bigint | null | Uint8Array>;
export interface SocialCommandReceipt {
  actorId: string;
  commandId: string;
  operation: string;
  requestDigest: string;
  resourceId: string;
  responseJson: string;
  createdAt: string;
}

export class SqliteSocialRepository {
  constructor(private readonly db: DatabaseSync) {}
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  findReceipt(actorId: string, commandId: string) {
    const row = this.db
      .prepare('SELECT * FROM social_command_receipts WHERE actor_id=? AND command_id=?')
      .get(actorId, commandId) as Row | undefined;
    return row ? mapReceipt(row) : undefined;
  }
  saveReceipt(item: SocialCommandReceipt) {
    this.db
      .prepare('INSERT INTO social_command_receipts VALUES(?,?,?,?,?,?,?)')
      .run(
        item.actorId,
        item.commandId,
        item.operation,
        item.requestDigest,
        item.resourceId,
        item.responseJson,
        item.createdAt,
      );
  }
  getPreferences(actorId: string): SocialPreferences {
    const row = this.db
      .prepare('SELECT * FROM social_preferences WHERE identity_id=?')
      .get(actorId);
    return row
      ? {
          enabled: Boolean(row.enabled),
          notificationsEnabled: Boolean(row.notifications_enabled),
          updatedAt: String(row.updated_at),
        }
      : { enabled: false, notificationsEnabled: false, updatedAt: '' };
  }
  updatePreferences(actorId: string, item: SocialPreferences) {
    this.db
      .prepare(
        `INSERT INTO social_preferences(identity_id,enabled,notifications_enabled,updated_at) VALUES(?,?,?,?) ON CONFLICT(identity_id) DO UPDATE SET enabled=excluded.enabled,notifications_enabled=excluded.notifications_enabled,updated_at=excluded.updated_at`,
      )
      .run(actorId, Number(item.enabled), Number(item.notificationsEnabled), item.updatedAt);
  }
  listGroups(query: SocialListQuery, actorId: string): SocialPage<SocialGroup> {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const params: Record<string, SQLInputValue> = {
      actorId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
    const where = query.q
      ? "WHERE instr(lower(g.name||' '||g.specialty||' '||g.description),lower(:q))>0"
      : '';
    if (query.q) params.q = query.q;
    const total = Number(
      this.db
        .prepare(`SELECT COUNT(*) count FROM social_groups g ${where}`)
        .get(query.q ? { q: query.q } : {})!.count,
    );
    const items = this.db
      .prepare(
        `SELECT g.*,(SELECT COUNT(*) FROM social_memberships m WHERE m.group_id=g.id) member_count,(SELECT COUNT(*) FROM social_posts p WHERE p.group_id=g.id AND p.moderation_status='published') post_count,EXISTS(SELECT 1 FROM social_memberships me WHERE me.group_id=g.id AND me.identity_id=:actorId) joined_by_me FROM social_groups g ${where} ORDER BY joined_by_me DESC,g.name LIMIT :limit OFFSET :offset`,
      )
      .all(params)
      .map((row) => mapGroup(row as Row));
    return { items, page, pageSize, total };
  }
  hasGroup(groupId: string) {
    return Boolean(this.db.prepare('SELECT 1 FROM social_groups WHERE id=?').get(groupId));
  }
  isMember(groupId: string, actorId: string) {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM social_memberships WHERE group_id=? AND identity_id=?')
        .get(groupId, actorId),
    );
  }
  joinGroup(item: SocialMembership) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO social_memberships(group_id,identity_id,joined_at) VALUES(?,?,?)',
      )
      .run(item.groupId, item.identityId, item.joinedAt);
  }
  leaveGroup(groupId: string, actorId: string) {
    this.db
      .prepare('DELETE FROM social_memberships WHERE group_id=? AND identity_id=?')
      .run(groupId, actorId);
  }
  listFeed(query: SocialListQuery, actorId: string) {
    return this.listPosts(undefined, query, actorId);
  }
  listGroupPosts(groupId: string, query: SocialListQuery, actorId: string) {
    return this.listPosts(groupId, query, actorId);
  }
  private listPosts(
    groupId: string | undefined,
    query: SocialListQuery,
    actorId: string,
  ): SocialPage<SocialPostSummary> {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const conditions = ["p.moderation_status='published'"];
    const params: Record<string, SQLInputValue> = {
      actorId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
    if (groupId) {
      conditions.push('p.group_id=:groupId');
      params.groupId = groupId;
    }
    if (query.q) {
      conditions.push("instr(lower(p.title||' '||p.body),lower(:q))>0");
      params.q = query.q;
    }
    if (query.tag) {
      conditions.push('instr(p.tags_json,:tag)>0');
      params.tag = `\"${query.tag}\"`;
    }
    const where = conditions.join(' AND ');
    const countParams: Record<string, SQLInputValue> = {};
    if (groupId) countParams.groupId = groupId;
    if (query.q) countParams.q = query.q;
    if (query.tag) countParams.tag = `\"${query.tag}\"`;
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) count FROM social_posts p WHERE ${where}`).get(countParams)!
        .count,
    );
    const order =
      query.sort === 'latest' ? 'p.created_at DESC,p.id DESC' : 'p.last_activity_at DESC,p.id DESC';
    const items = this.db
      .prepare(`${postSelect()} WHERE ${where} ORDER BY ${order} LIMIT :limit OFFSET :offset`)
      .all(params)
      .map((row) => mapPost(row as Row));
    return { items, page, pageSize, total };
  }
  findPost(id: string, actorId: string): SocialPostDetail | undefined {
    const row = this.db
      .prepare(`${postSelect()} WHERE p.id=:id AND p.moderation_status='published'`)
      .get({ id, actorId }) as Row | undefined;
    if (!row) return undefined;
    const comments = this.db
      .prepare(`${commentSelect()} WHERE c.post_id=? ORDER BY c.created_at,c.id`)
      .all(id)
      .map((item) => mapComment(item as Row));
    return {
      ...mapPost(row),
      body: String(row.body),
      comments,
      containsCaseMaterial: Boolean(row.contains_case_material),
      deidentificationConfirmed: Boolean(row.deidentification_confirmed_at),
    };
  }
  findPostAuthor(id: string) {
    const row = this.db.prepare('SELECT author_id FROM social_posts WHERE id=?').get(id);
    return row ? String(row.author_id) : undefined;
  }
  findCommentAuthor(id: string) {
    const row = this.db.prepare('SELECT author_id,post_id FROM social_comments WHERE id=?').get(id);
    return row ? { authorId: String(row.author_id), postId: String(row.post_id) } : undefined;
  }
  createPost(post: SocialPostDetail, authorId: string) {
    this.db
      .prepare(
        `INSERT INTO social_posts(id,group_id,author_id,display_mode,title,body,tags_json,contains_case_material,deidentification_confirmed_at,moderation_status,created_at,last_activity_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        post.id,
        post.groupId,
        authorId,
        post.author.anonymous ? 'anonymous' : 'named',
        post.title,
        post.body,
        JSON.stringify(post.tags),
        Number(post.containsCaseMaterial),
        post.deidentificationConfirmed ? post.createdAt : null,
        'published',
        post.createdAt,
        post.lastActivityAt,
      );
  }
  createComment(item: SocialComment, authorId: string) {
    this.db
      .prepare(
        'INSERT INTO social_comments(id,post_id,parent_comment_id,author_id,display_mode,body,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        item.id,
        item.postId,
        item.parentCommentId ?? null,
        authorId,
        item.displayMode,
        item.body,
        item.createdAt,
      );
    this.db
      .prepare('UPDATE social_posts SET last_activity_at=? WHERE id=?')
      .run(item.createdAt, item.postId);
  }
  setLike(postId: string, actorId: string, liked: boolean, at: string) {
    liked
      ? this.db.prepare('INSERT OR IGNORE INTO social_likes VALUES(?,?,?)').run(postId, actorId, at)
      : this.db
          .prepare('DELETE FROM social_likes WHERE post_id=? AND identity_id=?')
          .run(postId, actorId);
  }
  setBookmark(postId: string, actorId: string, value: boolean, at: string) {
    value
      ? this.db
          .prepare('INSERT OR IGNORE INTO social_bookmarks VALUES(?,?,?)')
          .run(postId, actorId, at)
      : this.db
          .prepare('DELETE FROM social_bookmarks WHERE post_id=? AND identity_id=?')
          .run(postId, actorId);
  }
  listMyPosts(query: SocialListQuery, actorId: string) {
    return this.listPersonal('author', query, actorId);
  }
  listMyLikes(query: SocialListQuery, actorId: string) {
    return this.listPersonal('like', query, actorId);
  }
  listMyBookmarks(query: SocialListQuery, actorId: string) {
    return this.listPersonal('bookmark', query, actorId);
  }
  private listPersonal(
    kind: 'author' | 'like' | 'bookmark',
    query: SocialListQuery,
    actorId: string,
  ): SocialPage<SocialPostSummary> {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const condition =
      kind === 'author'
        ? 'p.author_id=:actorId'
        : kind === 'like'
          ? 'EXISTS(SELECT 1 FROM social_likes mine WHERE mine.post_id=p.id AND mine.identity_id=:actorId)'
          : 'EXISTS(SELECT 1 FROM social_bookmarks mine WHERE mine.post_id=p.id AND mine.identity_id=:actorId)';
    const params = { actorId, limit: pageSize, offset: (page - 1) * pageSize };
    const total = Number(
      this.db
        .prepare(
          `SELECT COUNT(*) count FROM social_posts p WHERE p.moderation_status='published' AND ${condition}`,
        )
        .get({ actorId })!.count,
    );
    const items = this.db
      .prepare(
        `${postSelect()} WHERE p.moderation_status='published' AND ${condition} ORDER BY p.last_activity_at DESC LIMIT :limit OFFSET :offset`,
      )
      .all(params)
      .map((row) => mapPost(row as Row));
    return { items, page, pageSize, total };
  }
  listNotifications(actorId: string): SocialNotification[] {
    return this.db
      .prepare(
        `${notificationSelect()} WHERE n.recipient_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 100`,
      )
      .all(actorId)
      .map((row) => mapNotification(row as Row));
  }
  findNotification(id: string, actorId: string) {
    const row = this.db
      .prepare(`${notificationSelect()} WHERE n.id=? AND n.recipient_id=?`)
      .get(id, actorId) as Row | undefined;
    return row ? mapNotification(row) : undefined;
  }
  markNotificationRead(id: string, actorId: string, readAt: string) {
    return (
      this.db
        .prepare('UPDATE social_notifications SET read_at=? WHERE id=? AND recipient_id=?')
        .run(readAt, id, actorId).changes > 0
    );
  }
  createNotification(item: SocialNotification, recipientId: string, actorId: string) {
    this.db
      .prepare(
        'INSERT INTO social_notifications(id,recipient_id,actor_id,post_id,comment_id,kind,created_at,read_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        item.id,
        recipientId,
        actorId,
        item.postId,
        item.commentId ?? null,
        item.kind,
        item.createdAt,
        null,
      );
  }
  listConversations(actorId: string): SocialConversation[] {
    return this.db
      .prepare(
        `SELECT c.*,peer.id peer_id,peer.display_name peer_name,peer.avatar_initials peer_avatar,(SELECT body FROM social_direct_messages m WHERE m.conversation_id=c.id ORDER BY m.sent_at DESC,m.id DESC LIMIT 1) last_message,(SELECT COUNT(*) FROM social_direct_messages m WHERE m.conversation_id=c.id AND m.recipient_id=:actorId AND m.read_at IS NULL) unread_count FROM social_conversations c JOIN social_conversation_members mine ON mine.conversation_id=c.id AND mine.identity_id=:actorId JOIN social_conversation_members other ON other.conversation_id=c.id AND other.identity_id<>:actorId JOIN identities peer ON peer.id=other.identity_id ORDER BY c.updated_at DESC`,
      )
      .all({ actorId })
      .map((row) => ({
        id: String(row.id),
        peer: {
          id: String(row.peer_id),
          displayName: String(row.peer_name),
          avatarInitials: String(row.peer_avatar),
        },
        lastMessage: String(row.last_message ?? ''),
        updatedAt: String(row.updated_at),
        unreadCount: Number(row.unread_count),
      }));
  }
  listMessages(conversationId: string, actorId: string, cursor?: string): SocialMessagePage {
    if (
      !this.db
        .prepare(
          'SELECT 1 FROM social_conversation_members WHERE conversation_id=? AND identity_id=?',
        )
        .get(conversationId, actorId)
    )
      return { items: [] };
    const params: Record<string, SQLInputValue> = { conversationId, limit: 30 };
    const condition = cursor ? 'AND (sent_at < :cursor)' : '';
    if (cursor) params.cursor = cursor;
    const rows = this.db
      .prepare(
        `SELECT * FROM social_direct_messages WHERE conversation_id=:conversationId ${condition} ORDER BY sent_at DESC,id DESC LIMIT :limit`,
      )
      .all(params) as Row[];
    const items = rows.map(mapMessage).reverse();
    const oldest = rows.at(-1);
    const hasOlder = oldest
      ? Boolean(
          this.db
            .prepare(
              'SELECT 1 FROM social_direct_messages WHERE conversation_id=? AND sent_at<? LIMIT 1',
            )
            .get(conversationId, oldest.sent_at as SQLInputValue),
        )
      : false;
    return { items, ...(hasOlder && oldest ? { nextCursor: String(oldest.sent_at) } : {}) };
  }
  findDirectConversation(actorId: string, recipientId: string) {
    const row = this.db
      .prepare(
        `SELECT c.id FROM social_conversations c WHERE (SELECT COUNT(*) FROM social_conversation_members allm WHERE allm.conversation_id=c.id)=2 AND EXISTS(SELECT 1 FROM social_conversation_members m WHERE m.conversation_id=c.id AND m.identity_id=?) AND EXISTS(SELECT 1 FROM social_conversation_members m WHERE m.conversation_id=c.id AND m.identity_id=?) LIMIT 1`,
      )
      .get(actorId, recipientId);
    return row ? String(row.id) : undefined;
  }
  identityExists(id: string) {
    return Boolean(this.db.prepare('SELECT 1 FROM identities WHERE id=?').get(id));
  }
  canAccessMessage(messageId: string, actorId: string) {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1
      FROM social_direct_messages message
      JOIN social_conversation_members member
        ON member.conversation_id=message.conversation_id
      WHERE message.id=? AND member.identity_id=?`,
        )
        .get(messageId, actorId),
    );
  }
  createDirectConversation(id: string, actorId: string, recipientId: string, at: string) {
    this.db.prepare('INSERT INTO social_conversations VALUES(?,?,?)').run(id, at, at);
    this.db
      .prepare('INSERT INTO social_conversation_members VALUES(?,?),(?,?)')
      .run(id, actorId, id, recipientId);
  }
  createMessage(item: SocialDirectMessage) {
    this.db
      .prepare(
        'INSERT INTO social_direct_messages(id,sender_id,recipient_id,body,sent_at,conversation_id,read_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        item.id,
        item.senderId,
        item.recipientId,
        item.body,
        item.sentAt,
        item.conversationId,
        null,
      );
    this.db
      .prepare('UPDATE social_conversations SET updated_at=? WHERE id=?')
      .run(item.sentAt, item.conversationId);
  }
  createReport(item: SocialReport, reporterId: string, description?: string) {
    this.db
      .prepare(
        'INSERT INTO social_reports(id,post_id,reported_message_id,reporter_id,reason,description,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        item.id,
        item.postId ?? null,
        item.messageId ?? null,
        reporterId,
        item.reason,
        description ?? null,
        item.status,
        item.createdAt,
      );
  }
}

function postSelect() {
  return `SELECT p.*,g.name group_name,i.display_name author_name,i.avatar_initials author_avatar,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id) comment_count,(SELECT COUNT(*) FROM social_likes l WHERE l.post_id=p.id) like_count,(SELECT COUNT(*) FROM social_bookmarks b WHERE b.post_id=p.id) bookmark_count,EXISTS(SELECT 1 FROM social_likes me WHERE me.post_id=p.id AND me.identity_id=:actorId) liked_by_me,EXISTS(SELECT 1 FROM social_bookmarks me WHERE me.post_id=p.id AND me.identity_id=:actorId) bookmarked_by_me FROM social_posts p JOIN social_groups g ON g.id=p.group_id JOIN identities i ON i.id=p.author_id`;
}
function commentSelect() {
  return `SELECT c.*,i.display_name author_name,i.avatar_initials author_avatar FROM social_comments c JOIN identities i ON i.id=c.author_id`;
}
function notificationSelect() {
  return `SELECT n.*,COALESCE(i.display_name,'系统') actor_name FROM social_notifications n LEFT JOIN identities i ON i.id=n.actor_id`;
}
function mapGroup(r: Row): SocialGroup {
  return {
    id: String(r.id),
    name: String(r.name),
    specialty: String(r.specialty),
    description: String(r.description),
    memberCount: Number(r.member_count),
    postCount: Number(r.post_count),
    joinedByMe: Boolean(r.joined_by_me),
  };
}
function author(r: Row) {
  const anonymous = String(r.display_mode) === 'anonymous';
  return {
    ...(anonymous ? {} : { id: String(r.author_id) }),
    displayName: anonymous ? '匿名医生' : String(r.author_name),
    anonymous,
    avatarInitials: anonymous ? '匿' : String(r.author_avatar),
  };
}
function mapPost(r: Row): SocialPostSummary {
  return {
    id: String(r.id),
    groupId: String(r.group_id),
    groupName: String(r.group_name),
    author: author(r),
    title: String(r.title),
    excerpt: String(r.body).slice(0, 180),
    tags: JSON.parse(String(r.tags_json)),
    createdAt: String(r.created_at),
    lastActivityAt: String(r.last_activity_at),
    commentCount: Number(r.comment_count),
    likeCount: Number(r.like_count),
    bookmarkCount: Number(r.bookmark_count),
    likedByMe: Boolean(r.liked_by_me),
    bookmarkedByMe: Boolean(r.bookmarked_by_me),
  };
}
function mapComment(r: Row): SocialComment {
  return {
    id: String(r.id),
    postId: String(r.post_id),
    ...(r.parent_comment_id ? { parentCommentId: String(r.parent_comment_id) } : {}),
    author: author(r),
    displayMode: r.display_mode as SocialComment['displayMode'],
    body: String(r.body),
    createdAt: String(r.created_at),
  };
}
function mapNotification(r: Row): SocialNotification {
  return {
    id: String(r.id),
    kind: r.kind as SocialNotification['kind'],
    actorDisplayName: String(r.actor_name),
    postId: String(r.post_id),
    ...(r.comment_id ? { commentId: String(r.comment_id) } : {}),
    createdAt: String(r.created_at),
    ...(r.read_at ? { readAt: String(r.read_at) } : {}),
  };
}
function mapMessage(r: Row): SocialDirectMessage {
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    senderId: String(r.sender_id),
    recipientId: String(r.recipient_id),
    body: String(r.body),
    sentAt: String(r.sent_at),
  };
}
function mapReceipt(r: Row): SocialCommandReceipt {
  return {
    actorId: String(r.actor_id),
    commandId: String(r.command_id),
    operation: String(r.operation),
    requestDigest: String(r.request_digest),
    resourceId: String(r.resource_id),
    responseJson: String(r.response_json),
    createdAt: String(r.created_at),
  };
}
