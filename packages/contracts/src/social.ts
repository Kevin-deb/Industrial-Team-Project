export interface SocialPreferences {
  enabled: boolean;
  notificationsEnabled: boolean;
  updatedAt: string;
}
export interface SocialGroup {
  id: string;
  name: string;
  specialty: string;
  description: string;
  memberCount: number;
  postCount: number;
  joinedByMe: boolean;
}
export interface SocialMembership {
  groupId: string;
  identityId: string;
  joinedAt: string;
}
export interface SocialAuthor {
  id?: string;
  displayName: string;
  anonymous: boolean;
  avatarInitials: string;
}
export interface SocialPostSummary {
  deleted?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  id: string;
  groupId: string;
  groupName: string;
  author: SocialAuthor;
  title: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
  commentCount: number;
  likeCount: number;
  bookmarkCount: number;
  viewCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}
export interface SocialComment {
  deleted?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  likeCount?: number;
  bookmarkCount?: number;
  likedByMe?: boolean;
  bookmarkedByMe?: boolean;
  id: string;
  postId: string;
  parentCommentId?: string;
  author: SocialAuthor;
  displayMode: 'named' | 'anonymous';
  body: string;
  contentBlocks: SocialContentBlock[];
  createdAt: string;
}
export interface SocialPostDetail extends SocialPostSummary {
  body: string;
  contentBlocks: SocialContentBlock[];
  comments: SocialComment[];
  containsCaseMaterial: boolean;
  deidentificationConfirmed: boolean;
}
export interface SocialNotification {
  id: string;
  kind:
    | 'comment'
    | 'reply'
    | 'like'
    | 'bookmark'
    | 'report-accepted'
    | 'report-upheld'
    | 'report-rejected'
    | 'content-moderated';
  actorDisplayName: string;
  postId: string;
  commentId?: string;
  createdAt: string;
  readAt?: string;
}
export interface SocialConversation {
  id: string;
  peer: { id: string; displayName: string; avatarInitials: string };
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
}
export interface SocialPeer {
  id: string;
  displayName: string;
  title: string;
  department: string;
  hospital: string;
  avatarInitials: string;
}
export interface SocialDirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  contentBlocks: SocialContentBlock[];
  sentAt: string;
}

export interface MarkConversationReadInput {
  commandId: string;
}

export interface ConversationReadResult {
  conversationId: string;
  unreadCount: 0;
  readAt: string;
}

export interface NotificationReadResult {
  updatedCount: number;
  readAt: string;
}

export type SocialRealtimeEvent =
  | {
      type: 'social.notifications.changed';
      occurredAt: string;
    }
  | {
      type: 'social.message.created';
      conversationId: string;
      messageId: string;
      occurredAt: string;
    }
  | {
      type: 'social.conversation.read';
      conversationId: string;
      occurredAt: string;
    };

export interface MedicalMetricItem {
  metricCode: string;
  displayName: string;
  value: number;
  unit: string;
}

export interface MedicalMetricCard {
  schemaVersion: 1;
  sourceType: 'manual' | 'provider';
  measuredAt: string;
  metrics: MedicalMetricItem[];
  sourceLabel: string;
  note?: string;
  deidentificationConfirmed: boolean;
}

export interface SocialAttachment {
  id: string;
  kind: 'image' | 'audio';
  mediaType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
  contentUrl: string;
}

export type SocialContentBlock =
  | { id: string; kind: 'image'; order: number; attachment: SocialAttachment }
  | { id: string; kind: 'audio'; order: number; attachment: SocialAttachment }
  | { id: string; kind: 'medical-metric-card'; order: number; card: MedicalMetricCard };

export type CreateSocialContentBlockInput =
  | { kind: 'image'; order: number; attachmentId: string }
  | { kind: 'audio'; order: number; attachmentId: string }
  | { kind: 'medical-metric-card'; order: number; card: MedicalMetricCard };
export interface SocialReport {
  id: string;
  postId?: string;
  messageId?: string;
  reason: 'false-medical-claim' | 'advertising' | 'harassment' | 'other';
  status: 'pending';
  createdAt: string;
}
export interface SocialPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface SocialMessagePage {
  items: SocialDirectMessage[];
  nextCursor?: string;
}
export interface SocialGroupTags {
  groupId: string;
  tags: string[];
}
export type SocialPostSort =
  'most-liked' | 'most-bookmarked' | 'most-viewed' | 'latest' | 'latest-reply';
export interface SocialListQuery {
  q?: string;
  tag?: string;
  /** Comma-separated tags. A post matching any selected tag is returned. */
  tags?: string;
  sort?: SocialPostSort;
  page?: number;
  pageSize?: number;
}
export interface CreatePostInput {
  commandId: string;
  groupId: string;
  displayMode: 'named' | 'anonymous';
  title: string;
  body: string;
  tags: string[];
  containsCaseMaterial: boolean;
  deidentificationConfirmed: boolean;
  contentBlocks?: CreateSocialContentBlockInput[];
}
export interface CreateCommentInput {
  commandId: string;
  postId: string;
  parentCommentId?: string;
  displayMode: 'named' | 'anonymous';
  body: string;
  contentBlocks?: CreateSocialContentBlockInput[];
}
export interface CreateMessageInput {
  commandId: string;
  conversationId?: string;
  recipientId: string;
  body: string;
  contentBlocks?: CreateSocialContentBlockInput[];
}
export interface CreateReportInput {
  commentId?: string;
  commandId: string;
  postId?: string;
  messageId?: string;
  reason: SocialReport['reason'];
  description?: string;
}
export interface UpdateSocialPreferencesInput {
  commandId: string;
  enabled: boolean;
  notificationsEnabled: boolean;
}
