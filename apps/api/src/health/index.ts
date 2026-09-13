/** Public observation, care-plan and reminder boundary. */
export { healthMigration } from './migration.js';
export { healthEvolutionMigration } from './evolution-migration.js';
export { seedHealthDemo } from './fixtures.js';
export { healthCommands } from './commands.js';
export { SqliteHealthRepository } from './repository.js';
export type { HealthRepository } from './repository.js';
export {
  CommandConflict,
  HealthResourceNotFound,
  HealthService,
  NotificationUnavailable,
  ReminderDeliveryInProgress,
  InvalidReminderState,
  StaleVersion,
} from './service.js';
export type {
  HealthAuditEvent,
  HealthAuditPort,
  HealthNotificationPort,
  PatientSummaryPort,
} from './ports.js';
export { registerHealthRoutes } from './routes.js';
