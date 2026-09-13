/** Public, opt-in community boundary. It exposes no automatic clinical-data import. */
export { socialMigration } from './migration.js';
export { socialEvolutionMigration } from './evolution-migration.js';
export { seedSocialDemo } from './fixtures.js';
export { SqliteSocialRepository } from './repository.js';
export { CommunityDisabled, SocialConflict, SocialNotFound, SocialService, SocialValidationFailure } from './service.js';
export { registerSocialRoutes } from './routes.js';
export { socialCommands } from './commands.js';
