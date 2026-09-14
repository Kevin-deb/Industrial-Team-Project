import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ApiResponse,
  ConversationReadResult,
  CreateCommentInput,
  CreateMessageInput,
  CreatePostInput,
  SocialConversation,
  SocialAttachment,
  SocialDirectMessage,
  SocialGroup,
  SocialGroupTags,
  SocialMessagePage,
  SocialNotification,
  SocialPage,
  SocialPeer,
  SocialPostDetail,
  SocialPostSort,
  SocialPostSummary,
  SocialPreferences,
  UpdateSocialPreferencesInput,
} from '@doctor/contracts';
import { requestEApi, useLocalizedEQuery } from '../e-shared';

export const socialKeys = {
  all: ['social'] as const,
  preferences: ['social', 'preferences'] as const,
  feed: (q = '') => ['social', 'feed', q] as const,
  groups: (q = '') => ['social', 'groups', q] as const,
  groupTags: (id: string) => ['social', 'group-tags', id] as const,
  groupPosts: (id: string, sort = 'latest-reply', q = '', tags: readonly string[] = []) =>
    ['social', 'group-posts', id, sort, q, ...tags] as const,
  post: (id: string) => ['social', 'post', id] as const,
  personal: (kind: string) => ['social', 'personal', kind] as const,
  notifications: ['social', 'notifications'] as const,
  conversations: ['social', 'conversations'] as const,
  peers: (q: string) => ['social', 'peers', q] as const,
  messages: (id: string) => ['social', 'messages', id] as const,
};
const commandId = () => globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now()}-${Math.random()}`;
export const useSocialPreferences = () =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.preferences,
      queryFn: () => requestEApi<SocialPreferences>('/social/preferences'),
    }),
  );
export function useUpdateSocialPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UpdateSocialPreferencesInput, 'commandId'>) =>
      requestEApi<SocialPreferences>('/social/preferences', {
        method: 'PATCH',
        body: { ...input, commandId: commandId() },
      }),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: socialKeys.preferences });
      const previous = client.getQueryData<ApiResponse<SocialPreferences>>(socialKeys.preferences);
      client.setQueryData<ApiResponse<SocialPreferences>>(socialKeys.preferences, {
        data: {
          enabled: input.enabled,
          notificationsEnabled: input.enabled && input.notificationsEnabled,
          updatedAt: new Date().toISOString(),
        },
        meta: previous?.meta ?? { requestId: 'local-optimistic', mode: 'demo' },
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(socialKeys.preferences, context.previous);
    },
    onSuccess: async (result) => {
      client.setQueryData(socialKeys.preferences, result);
      if (!result.data.enabled) {
        await client.cancelQueries({
          predicate: (query) =>
            query.queryKey[0] === 'social' && query.queryKey[1] !== 'preferences',
        });
        client.removeQueries({
          predicate: (query) =>
            query.queryKey[0] === 'social' && query.queryKey[1] !== 'preferences',
        });
      }
    },
    onSettled: async () => client.invalidateQueries({ queryKey: socialKeys.preferences }),
  });
}
export const useFeed = (q = '') =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.feed(q),
      queryFn: () =>
        requestEApi<SocialPage<SocialPostSummary>>(
          `/social/feed?sort=latest-reply${q ? `&q=${encodeURIComponent(q)}` : ''}`,
        ),
      placeholderData: keepPreviousData,
    }),
  );
export const useGroups = (q = '') =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.groups(q),
      queryFn: () =>
        requestEApi<SocialPage<SocialGroup>>(
          `/social/groups${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        ),
    }),
  );
export const useGroupPosts = (
  id: string,
  sort: SocialPostSort,
  q = '',
  tags: readonly string[] = [],
) =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.groupPosts(id, sort, q, tags),
      queryFn: () =>
        requestEApi<SocialPage<SocialPostSummary>>(
          `/social/groups/${encodeURIComponent(id)}/posts?sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}${tags.length ? `&tags=${encodeURIComponent(tags.join(','))}` : ''}`,
        ),
      enabled: Boolean(id),
    }),
  );
export const useGroupTags = (id: string) =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.groupTags(id),
      queryFn: () => requestEApi<SocialGroupTags>(`/social/groups/${encodeURIComponent(id)}/tags`),
      enabled: Boolean(id),
    }),
  );
export const usePost = (id: string) =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.post(id),
      queryFn: () => requestEApi<SocialPostDetail>(`/social/posts/${encodeURIComponent(id)}`),
      enabled: Boolean(id),
    }),
  );
export function useRecordPostView(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestEApi<SocialPostDetail>(`/social/posts/${encodeURIComponent(postId)}/views`, {
        method: 'POST',
        body: { commandId: commandId() },
      }),
    onSuccess: async (result) => {
      client.setQueryData(socialKeys.post(postId), result);
      await client.invalidateQueries({ queryKey: ['social', 'group-posts'] });
    },
  });
}
export function useJoinGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestEApi(`/social/groups/${encodeURIComponent(id)}/join`, {
        method: 'POST',
        body: { commandId: commandId() },
      }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['social', 'groups'] }),
  });
}
export function useLeaveGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestEApi(`/social/groups/${encodeURIComponent(id)}/membership`, {
        method: 'DELETE',
        body: { commandId: commandId() },
      }),
    onSuccess: async (_, id) =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['social', 'groups'] }),
        client.invalidateQueries({ queryKey: ['social', 'feed'] }),
        client.removeQueries({ queryKey: ['social', 'group-posts', id] }),
      ]),
  });
}
export function useCreatePost(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreatePostInput, 'commandId'> & { commandId?: string }) =>
      requestEApi<SocialPostDetail>('/social/posts', {
        method: 'POST',
        body: { ...input, commandId: input.commandId ?? commandId() },
      }),
    onSuccess: async (result) =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['social', 'group-posts', groupId] }),
        client.invalidateQueries({ queryKey: socialKeys.groupTags(groupId) }),
        client.invalidateQueries({ queryKey: ['social', 'feed'] }),
        client.setQueryData(socialKeys.post(result.data.id), result),
      ]),
  });
}
export function useCreateComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Omit<CreateCommentInput, 'commandId' | 'postId'> & { commandId?: string },
    ) =>
      requestEApi(`/social/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        body: { ...input, commandId: input.commandId ?? commandId() },
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
      requestEApi<SocialPostDetail>(
        `/social/posts/${encodeURIComponent(postId)}/${kind === 'like' ? 'likes' : 'bookmarks'}`,
        {
          method: value ? 'POST' : 'DELETE',
          body: { commandId: commandId() },
        },
      ),
    onMutate: async (value) => {
      await client.cancelQueries({ queryKey: socialKeys.all });
      const previous = client.getQueriesData({ queryKey: socialKeys.all });
      client.setQueriesData({ queryKey: socialKeys.all }, (current) =>
        updateReactionCache(current, postId, kind, value),
      );
      return { previous };
    },
    onError: (_error, _value, context) => {
      for (const [key, value] of context?.previous ?? []) client.setQueryData(key, value);
    },
    onSuccess: (result) => client.setQueryData(socialKeys.post(postId), result),
    onSettled: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['social', 'feed'] }),
        client.invalidateQueries({ queryKey: ['social', 'personal'] }),
      ]),
  });
}

function updateReactionCache(
  current: unknown,
  postId: string,
  kind: 'like' | 'bookmark',
  value: boolean,
): unknown {
  if (!current || typeof current !== 'object' || !('data' in current)) return current;
  const envelope = current as { data: unknown };
  const updatePost = (post: unknown) => {
    if (!post || typeof post !== 'object' || !('id' in post) || post.id !== postId) return post;
    const item = post as SocialPostSummary;
    const flag = kind === 'like' ? 'likedByMe' : 'bookmarkedByMe';
    const count = kind === 'like' ? 'likeCount' : 'bookmarkCount';
    if (item[flag] === value) return item;
    return {
      ...item,
      [flag]: value,
      [count]: Math.max(0, item[count] + (value ? 1 : -1)),
    };
  };
  if (Array.isArray((envelope.data as { items?: unknown[] })?.items)) {
    const page = envelope.data as { items: unknown[] };
    return { ...current, data: { ...page, items: page.items.map(updatePost) } };
  }
  return { ...current, data: updatePost(envelope.data) };
}
export const usePersonalPosts = (kind: 'posts' | 'likes' | 'bookmarks') =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.personal(kind),
      queryFn: () => requestEApi<SocialPage<SocialPostSummary>>(`/social/me/${kind}`),
    }),
  );
export const useNotifications = () =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.notifications,
      queryFn: () => requestEApi<SocialNotification[]>('/social/me/notifications'),
    }),
  );
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
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.conversations,
      queryFn: () => requestEApi<SocialConversation[]>('/social/conversations'),
    }),
  );
export const usePeerSearch = (q: string) =>
  useLocalizedEQuery(
    useQuery({
      queryKey: socialKeys.peers(q),
      queryFn: () => requestEApi<SocialPeer[]>(`/social/peers?q=${encodeURIComponent(q)}`),
      enabled: Boolean(q.trim()),
    }),
  );
export const useMessages = (id: string) =>
  useLocalizedEQuery(
    useInfiniteQuery({
      queryKey: socialKeys.messages(id),
      initialPageParam: '',
      queryFn: ({ pageParam }) =>
        requestEApi<SocialMessagePage>(
          `/social/conversations/${encodeURIComponent(id)}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        ),
      getNextPageParam: (lastPage) => lastPage.data.nextCursor,
      enabled: Boolean(id),
    }),
  );
export function useSendMessage(conversationId: string, recipientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Pick<CreateMessageInput, 'body' | 'contentBlocks'> & { commandId?: string },
    ) =>
      requestEApi<SocialDirectMessage>('/social/messages', {
        method: 'POST',
        body: {
          commandId: input.commandId ?? commandId(),
          ...(conversationId ? { conversationId } : {}),
          recipientId,
          body: input.body,
          contentBlocks: input.contentBlocks,
        } satisfies CreateMessageInput,
      }),
    onSuccess: async (result) => {
      client.setQueryData(
        socialKeys.messages(result.data.conversationId),
        (
          current:
            | import('@tanstack/react-query').InfiniteData<ApiResponse<SocialMessagePage>>
            | undefined,
        ) => {
          if (!current?.pages.length) return current;
          if (
            current.pages.some((page) => page.data.items.some((item) => item.id === result.data.id))
          )
            return current;
          const pages = [...current.pages];
          pages[0] = {
            ...pages[0],
            data: { ...pages[0].data, items: [...pages[0].data.items, result.data] },
          };
          return { ...current, pages };
        },
      );
      await client.invalidateQueries({ queryKey: socialKeys.conversations });
    },
  });
}
export function useMarkConversationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      requestEApi<ConversationReadResult>(
        `/social/conversations/${encodeURIComponent(conversationId)}/read`,
        { method: 'POST', body: { commandId: commandId() } },
      ),
    onSuccess: (result) => {
      client.setQueryData<ApiResponse<SocialConversation[]>>(socialKeys.conversations, (current) =>
        current
          ? {
              ...current,
              data: current.data.map((item) =>
                item.id === result.data.conversationId ? { ...item, unreadCount: 0 } : item,
              ),
            }
          : current,
      );
    },
  });
}
export function useUploadSocialAttachment() {
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return requestEApi<SocialAttachment>('/social/attachments', { method: 'POST', body });
    },
  });
}
export function useDeleteTemporaryAttachment() {
  return useMutation({
    mutationFn: (id: string) =>
      requestEApi<{ id: string }>(`/social/attachments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
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
