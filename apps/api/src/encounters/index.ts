/** Public encounter and remote-consultation boundary. */
export { encountersMigration } from './migration.js';
export { onlineCarePersistenceMigration } from './online-care-migration.js';
export { onlineCareFixturesMigration } from './online-care-fixtures-migration.js';
export { encountersCommands } from './commands.js';
export { SqliteEncounterRepository } from './repository.js';
export type { EncounterRepository, ConsultationTask } from './repository.js';
