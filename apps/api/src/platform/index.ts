/** Public platform boundary. Other domains must import this entry point. */
export { platformMigration } from './migration.js';
export { authMigration, demoInitialPasswordMigration } from './auth-migration.js';
export {
  AuthError,
  AuthService,
  SqliteAuthRepository,
  hashSecret,
  verifySecret,
} from './auth.js';
export type { EmailDeliveryPort, AuthErrorCode } from './auth.js';
export { bearerToken, DemoEmailOutbox, registerAuthRoutes } from './auth-routes.js';
export { SmtpEmailDelivery, smtpConfigured } from './smtp-email.js';
export { platformCommands } from './commands.js';
export { patientScopeSql, SqlitePatientAccess } from './access.js';
export type { RequestContext, PatientAccessPort } from './access.js';
export { SqlitePlatformRepository } from './repository.js';
export type { PlatformRepository } from './repository.js';
export { features } from './features.js';
export { demoProviders } from './providers.js';
export type { ExternalProviders } from './providers.js';
export type { PlannedCommand } from './command-contract.js';
export { registerPlannedCommands, plannedCommands } from './planned-commands.js';
