/** Public encounter and remote-consultation boundary. */
export { encountersMigration } from './migration.js';
export { onlineCarePersistenceMigration } from './online-care-migration.js';
export { onlineCareFixturesMigration } from './online-care-fixtures-migration.js';
export { onlineCareTrimMigration } from './online-care-trim-migration.js';
export { onlineCareTypicalLinkMigration } from './online-care-typical-link-migration.js';
export { onlineCareRecordsAlignmentMigration } from './online-care-records-alignment-migration.js';
export { remoteConsultationPersistenceMigration } from './remote-consultation-persistence-migration.js';
export { remoteConsultationInvitedCaseMigration } from './remote-consultation-invited-case-migration.js';
export { encountersCommands } from './commands.js';
export { SqliteEncounterRepository } from './repository.js';
export type { EncounterRepository, ConsultationTask } from './repository.js';
