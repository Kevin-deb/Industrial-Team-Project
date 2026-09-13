export interface SocialPreferences { enabled: boolean; notificationsEnabled: boolean; updatedAt: string }
export interface SocialGroup { id: string; name: string; specialty: string; description: string; memberCount: number; postCount: number; joinedByMe: boolean }
export interface SocialMembership { groupId: string; identityId: string; joinedAt: string }
export interface SocialAuthor { id?: string; displayName: string; anonymous: boolean; avatarInitials: string }
export interface SocialPostSummary { id: string; groupId: string; groupName: string; author: SocialAuthor; title: string; excerpt: string; tags: string[]; createdAt: string; lastActivityAt: string; commentCount: number; likeCount: number; bookmarkCount: number; likedByMe: boolean; bookmarkedByMe: boolean }
export interface SocialComment { id: string; postId: string; parentCommentId?: string; author: SocialAuthor; displayMode: 'named' | 'anonymous'; body: string; createdAt: string }
export interface SocialPostDetail extends SocialPostSummary { body: string; comments: SocialComment[]; containsCaseMaterial: boolean; deidentificationConfirmed: boolean }
export interface SocialNotification { id: string; kind: 'comment' | 'reply' | 'like' | 'bookmark'; actorDisplayName: string; postId: string; commentId?: string; createdAt: string; readAt?: string }
export interface SocialConversation { id: string; peer: { id: string; displayName: string; avatarInitials: string }; lastMessage: string; updatedAt: string; unreadCount: number }
export interface SocialDirectMessage { id: string; conversationId: string; senderId: string; recipientId: string; body: string; sentAt: string }
export interface SocialReport { id: string; postId?: string; messageId?: string; reason: 'false-medical-claim' | 'advertising' | 'harassment' | 'other'; status: 'pending'; createdAt: string }
export interface SocialPage<T> { items: T[]; page: number; pageSize: number; total: number }
export interface SocialMessagePage { items: SocialDirectMessage[]; nextCursor?: string }
export interface SocialListQuery { q?: string; tag?: string; sort?: 'latest' | 'latest-reply'; page?: number; pageSize?: number }
export interface CreatePostInput { commandId: string; groupId: string; displayMode: 'named' | 'anonymous'; title: string; body: string; tags: string[]; containsCaseMaterial: boolean; deidentificationConfirmed: boolean }
export interface CreateCommentInput { commandId: string; postId: string; parentCommentId?: string; displayMode: 'named' | 'anonymous'; body: string }
export interface CreateMessageInput { commandId: string; conversationId?: string; recipientId: string; body: string }
export interface CreateReportInput { commandId: string; postId?: string; messageId?: string; reason: SocialReport['reason']; description?: string }
export interface UpdateSocialPreferencesInput { commandId: string; enabled: boolean; notificationsEnabled: boolean }
