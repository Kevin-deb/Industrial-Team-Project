import type { PlannedCommand } from '../platform/index.js';

/** Owned by the social module; other modules only consume the public API. */
export const socialCommands: readonly PlannedCommand[] = [
  {
    method: 'PATCH',
    path: '/social/preferences',
    domain: 'social',
    capability: 'community',
    tables: ['social_preferences'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/social/groups/:id/join',
    domain: 'social',
    capability: 'community',
    tables: ['social_memberships'],
    providers: [],
  },
  {
    method: 'DELETE',
    path: '/social/groups/:id/membership',
    domain: 'social',
    capability: 'community',
    tables: ['social_memberships'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/social/posts',
    domain: 'social',
    capability: 'community',
    tables: ['social_posts'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/social/posts/:id/comments',
    domain: 'social',
    capability: 'community',
    tables: ['social_comments'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/social/posts/:id/likes',
    domain: 'social',
    capability: 'community',
    tables: ['social_likes'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/social/messages',
    domain: 'social',
    capability: 'community',
    tables: ['social_direct_messages'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/social/reports',
    domain: 'social',
    capability: 'community',
    tables: ['social_reports'],
    providers: [],
  },
];
