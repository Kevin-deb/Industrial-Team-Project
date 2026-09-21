import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SocialRealtimeEvent } from '@doctor/contracts';
import { socialKeys, useConversations, useNotifications } from './queries';
import { useSocialRealtime } from './realtime';

export function useSocialUnread(enabled = true) {
  const notifications = useNotifications(enabled);
  const conversations = useConversations(enabled);
  const notificationItems = Array.isArray(notifications.data?.data)
    ? notifications.data.data
    : [];
  const conversationItems = Array.isArray(conversations.data?.data)
    ? conversations.data.data
    : [];
  const interactionUnread = notificationItems.filter(
    (notification) => !notification.readAt,
  ).length;
  const directUnread = conversationItems.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
  return {
    interactionUnread,
    directUnread,
    totalUnread: interactionUnread + directUnread,
  };
}

export function GlobalSocialLiveUpdates() {
  const client = useQueryClient();
  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: socialKeys.notifications });
    void client.invalidateQueries({ queryKey: socialKeys.conversations });
    void client.invalidateQueries({ queryKey: ['social', 'messages'] });
  }, [client]);
  const receive = useCallback(
    (event: SocialRealtimeEvent) => {
      if (event.type === 'social.notifications.changed') {
        void client.invalidateQueries({ queryKey: socialKeys.notifications });
        return;
      }
      void client.invalidateQueries({ queryKey: socialKeys.conversations });
      void client.invalidateQueries({ queryKey: socialKeys.messages(event.conversationId) });
    },
    [client],
  );
  useSocialRealtime(receive, reconcile);
  return null;
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="unread-count-badge">{count > 99 ? '99+' : count}</span>;
}
