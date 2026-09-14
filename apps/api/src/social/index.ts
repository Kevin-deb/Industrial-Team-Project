/** Public, opt-in community boundary. It exposes no automatic clinical-data import. */
export { socialMigration } from './migration.js';
export { socialEvolutionMigration } from './evolution-migration.js';
export { socialViewsMigration } from './views-migration.js';
export { socialRichContentMigration } from './rich-content-migration.js';
export { socialNotificationMigration } from './notification-migration.js';
export { seedSocialDemo } from './fixtures.js';
export { SqliteSocialRepository } from './repository.js';
export { SqliteSocialPeerDirectory } from './peer-directory-adapter.js';
export { LocalAttachmentStorage } from './attachment-storage.js';
export { AttachmentService } from './attachment-service.js';
export {
  CommunityDisabled,
  SocialConflict,
  SocialNotFound,
  SocialService,
  SocialValidationFailure,
} from './service.js';
export { registerSocialRoutes } from './routes.js';
export { SocialRealtimeHub } from './realtime.js';
export { socialCommands } from './commands.js';
export type {
  SocialAuditEvent,
  SocialAuditPort,
  SocialMedicalMetricCardSourcePort,
  SocialPeerDirectoryPort,
} from './ports.js';
export type { SocialRealtimeListener, SocialRealtimePort } from './realtime.js';
