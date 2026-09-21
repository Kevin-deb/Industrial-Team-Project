import type { PlannedCommand } from '../platform/index.js';

/** Owned by the encounters module; other modules only consume the public API. */
export const encountersCommands: readonly PlannedCommand[] = [
  {
    method: 'POST',
    path: '/encounters',
    domain: 'encounters',
    capability: 'encounter-chat',
    tables: ['encounters'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/encounters/:id/accept',
    domain: 'encounters',
    capability: 'encounter-chat',
    tables: ['encounters'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/encounters/:id/rtc-room',
    domain: 'encounters',
    capability: 'rtc',
    tables: ['encounters'],
    providers: ['rtc'],
  },
  {
    method: 'POST',
    path: '/encounters/:id/recordings',
    domain: 'encounters',
    capability: 'rtc',
    tables: ['recordings'],
    providers: ['recording', 'objectStorage'],
  },
  {
    method: 'POST',
    path: '/encounters/:id/export',
    domain: 'encounters',
    capability: 'encounter-chat',
    tables: ['encounters', 'audit_events'],
    providers: ['objectStorage'],
  },
  {
    method: 'POST',
    path: '/consultations/:id/attachments',
    domain: 'encounters',
    capability: 'remote-consultation',
    tables: ['attachments'],
    providers: ['objectStorage'],
  },
  {
    method: 'POST',
    path: '/consultations/:id/reports',
    domain: 'encounters',
    capability: 'remote-consultation',
    tables: ['consultation_reports'],
    providers: [],
  },
];
