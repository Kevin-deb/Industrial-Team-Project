import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCommentInput,
  CreateMessageInput,
  CreatePostInput,
  SocialConversation,
  SocialDirectMessage,
  SocialGroup,
  SocialMessagePage,
  SocialNotification,
  SocialPage,
  SocialPostDetail,
  SocialPostSummary,
  SocialPreferences,
  UpdateSocialPreferencesInput,
} from '@doctor/contracts';
import { requestEApi } from '../e-shared';

export const socialKeys = {
  all: ['social'] as const,
  preferences: ['social', 'preferences'] as const,
  feed: (q = '') => ['social', 'feed', q] as const,
  groups: ['social', 'groups'] as const,
  groupPosts: (id: string) => ['social', 'group-posts', id] as const,
  post: (id: string) => ['social', 'post', id] as const,
  personal: (kind: string) => ['social', 'personal', kind] as const,
  notifications: ['social', 'notifications'] as const,
  conversations: ['social', 'conversations'] as const,
  messages: (id: string) => ['social', 'messages', id] as const,
};
const commandId = () => globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now()}-${Math.random()}`;
export const useSocialPreferences = () =>
  useQuery({
    queryKey: socialKeys.preferences,
    queryFn: () => requestEApi<SocialPreferences>('/social/preferences'),
  });
export function useUpdateSocialPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UpdateSocialPreferencesInput, 'commandId'>) =>
      requestEApi<SocialPreferences>('/social/preferences', {
        method: 'PATCH',
        body: { ...input, commandId: commandId() },
      }),
    onSuccess: (result) => client.setQueryData(socialKeys.preferences, result),
  });
}
export const useFeed = (q = '') =>
  useQuery({
    queryKey: socialKeys.feed(q),
    queryFn: () =>
      requestEApi<SocialPage<SocialPostSummary>>(
        `/social/feed?sort=latest-reply${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
export const useGroups = () =>
  useQuery({
    queryKey: socialKeys.groups,
    queryFn: () => requestEApi<SocialPage<SocialGroup>>('/social/groups'),
  });
export const useGroupPosts = (id: string) =>
  useQuery({
    queryKey: socialKeys.groupPosts(id),
    queryFn: () =>
      requestEApi<SocialPage<SocialPostSummary>>(
        `/social/groups/${encodeURIComponent(id)}/posts?sort=latest-reply`,
      ),
    enabled: Boolean(id),
  });
export const usePost = (id: string) =>
  useQuery({
    queryKey: socialKeys.post(id),
    queryFn: () => requestEApi<SocialPostDetail>(`/social/posts/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
export function useJoinGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestEApi(`/social/groups/${encodeURIComponent(id)}/join`, {
        method: 'POST',
        body: { commandId: commandId() },
      }),
    onSuccess: async () => client.invalidateQueries({ queryKey: socialKeys.groups }),
  });
}
export function useCreatePost(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreatePostInput, 'commandId'>) =>
      requestEApi<SocialPostDetail>('/social/posts', {
        method: 'POST',
        body: { ...input, commandId: commandId() },
      }),
    onSuccess: async (result) =>
      Promise.all([
        client.invalidateQueries({ queryKey: socialKeys.groupPosts(groupId) }),
        client.invalidateQueries({ queryKey: ['social', 'feed'] }),
        client.setQueryData(socialKeys.post(result.data.id), result),
      ]),
  });
}
export function useCreateComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateCommentInput, 'commandId' | 'postId'>) =>
      requestEApi(`/social/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        body: { ...input, commandId: commandId() },
      }),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: socialKeys.post(postId) }),
        client.invalidateQueries({ queryKey: ['social', 'feed'] }),
      ]),
  });
}
export function usePostReaction(postId: string, kind: 'like' | 'bookmark') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) =>
      requestEApi<SocialPostDetail>(`/social/posts/${encodeURIComponent(postId)}/${kind}`, {
        method: 'POST',
        body: { commandId: commandId(), value },
      }),
    onSuccess: (result) => client.setQueryData(socialKeys.post(postId), result),
    onSettled: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['social', 'feed'] }),
        client.invalidateQueries({ queryKey: ['social', 'personal'] }),
      ]),
  });
}
export const usePersonalPosts = (kind: 'posts' | 'likes' | 'bookmarks') =>
  useQuery({
    queryKey: socialKeys.personal(kind),
    queryFn: () => requestEApi<SocialPage<SocialPostSummary>>(`/social/me/${kind}`),
  });
export const useNotifications = () =>
  useQuery({
    queryKey: socialKeys.notifications,
    queryFn: () => requestEApi<SocialNotification[]>('/social/notifications'),
  });
export function useReadNotification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestEApi(`/social/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        body: { commandId: commandId() },
      }),
    onSuccess: async () => client.invalidateQueries({ queryKey: socialKeys.notifications }),
  });
}
export const useConversations = () =>
  useQuery({
    queryKey: socialKeys.conversations,
    queryFn: () => requestEApi<SocialConversation[]>('/social/conversations'),
  });
export const useMessages = (id: string) =>
  useQuery({
    queryKey: socialKeys.messages(id),
    queryFn: () =>
      requestEApi<SocialMessagePage>(`/social/conversations/${encodeURIComponent(id)}/messages`),
    enabled: Boolean(id),
  });
export function useSendMessage(conversationId: string, recipientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      requestEApi<SocialDirectMessage>('/social/messages', {
        method: 'POST',
        body: {
          commandId: commandId(),
          conversationId,
          recipientId,
          body,
        } satisfies CreateMessageInput,
      }),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: socialKeys.messages(conversationId) }),
        client.invalidateQueries({ queryKey: socialKeys.conversations }),
      ]),
  });
}
export function useReportPost(postId: string) {
  return useMutation({
    mutationFn: (reason: string) =>
      requestEApi('/social/reports', {
        method: 'POST',
        body: { commandId: commandId(), postId, reason },
      }),
  });
}
