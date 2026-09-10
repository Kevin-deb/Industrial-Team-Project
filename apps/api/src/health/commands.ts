import type { PlannedCommand } from '../platform/index.js';

/** Owned by the health module; other modules only consume the public API. */
export const healthCommands: readonly PlannedCommand[] = [
  {
    method: 'POST',
    path: '/health/observations',
    domain: 'health',
    capability: 'health-monitoring',
    tables: ['health_observations'],
    providers: ['devices'],
  },
  {
    method: 'POST',
    path: '/health/plans',
    domain: 'health',
    capability: 'health-monitoring',
    tables: ['care_plans', 'care_plan_versions'],
    providers: [],
  },
  {
    method: 'PATCH',
    path: '/health/plans/:id',
    domain: 'health',
    capability: 'health-monitoring',
    tables: ['care_plans', 'care_plan_versions'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/health/assessments',
    domain: 'health',
    capability: 'health-monitoring',
    tables: ['health_assessments'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/health/reminders',
    domain: 'health',
    capability: 'notifications',
    tables: ['reminder_tasks', 'outbox_events'],
    providers: ['notifications'],
  },
];
