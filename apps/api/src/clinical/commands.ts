import type { PlannedCommand } from '../platform/index.js';

/** Owned by the clinical module; other modules only consume the public API. */
export const clinicalCommands: readonly PlannedCommand[] = [
  {
    method: 'POST',
    path: '/records',
    domain: 'clinical',
    capability: 'records',
    tables: ['medical_records', 'medical_record_versions'],
    providers: [],
  },
  {
    method: 'PATCH',
    path: '/records/:id',
    domain: 'clinical',
    capability: 'records',
    tables: ['medical_record_versions', 'audit_events'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/records/:id/submit',
    domain: 'clinical',
    capability: 'records',
    tables: ['medical_records'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/records/:id/reviews',
    domain: 'clinical',
    capability: 'records',
    tables: ['record_reviews', 'medical_records'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/records/:id/archive',
    domain: 'clinical',
    capability: 'records',
    tables: ['record_reviews', 'medical_records'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/records/:id/orders',
    domain: 'clinical',
    capability: 'records',
    tables: ['medical_orders', 'medical_order_versions'],
    providers: [],
  },
  {
    method: 'PATCH',
    path: '/orders/:id',
    domain: 'clinical',
    capability: 'records',
    tables: ['medical_order_versions'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/orders/:id/stop',
    domain: 'clinical',
    capability: 'records',
    tables: ['medical_orders', 'medical_order_versions'],
    providers: [],
  },
];
