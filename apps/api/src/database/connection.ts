import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { platformMigration } from '../platform/index.js';
import {
  authMigration,
  demoInitialPasswordMigration,
  sessionAuthMethodMigration,
} from '../platform/index.js';
import {
  patientsMigration,
  patientsArchiveMigration,
  patientsRegistrationMigration,
} from '../patients/index.js';
import { encountersMigration } from '../encounters/index.js';
import { clinicalMigration } from '../clinical/index.js';
import {
  healthEvolutionMigration,
  healthMigration,
  healthObservationConfirmationMigration,
  seedHealthDemo,
} from '../health/index.js';
import { socialMigration } from '../social/index.js';
import {
  seedSocialDemo,
  socialEvolutionMigration,
  socialRichContentMigration,
  socialNotificationMigration,
  socialCommentReactionsMigration,
  socialViewsMigration,
} from '../social/index.js';
import { seedAuthFoundation, seedDemo } from './seed.js';
import { eModuleHardeningMigration } from './e-module-hardening-migration.js';

export const migrations = [
  platformMigration,
  patientsMigration,
  encountersMigration,
  clinicalMigration,
  healthMigration,
  socialMigration,
  healthEvolutionMigration,
  socialEvolutionMigration,
  eModuleHardeningMigration,
  socialViewsMigration,
  socialRichContentMigration,
  socialNotificationMigration,
  socialCommentReactionsMigration,
  {
    version: 14,
    name: 'social_content_history_and_soft_deletion',
    sql: `
    ALTER TABLE social_comments ADD COLUMN deleted_at TEXT;
    ALTER TABLE social_reports ADD COLUMN comment_id TEXT REFERENCES social_comments(id);
    CREATE TABLE social_content_history (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      actor_id TEXT NOT NULL REFERENCES identities(id), action TEXT NOT NULL,
      reason TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX social_history_entity ON social_content_history(entity_type,entity_id,created_at);
  `,
  },
  patientsArchiveMigration,
  patientsRegistrationMigration,
  authMigration,
  demoInitialPasswordMigration,
  healthObservationConfirmationMigration,
  sessionAuthMethodMigration,
];

/** Refuse a newer or inconsistent migration history instead of silently running incompatible code. */
export function validateMigrationHistory(database: DatabaseSync): void {
  const applied = database
    .prepare('SELECT version,name FROM schema_migrations ORDER BY version')
    .all();
  for (const [index, row] of applied.entries()) {
    const expected = migrations[index];
    if (!expected || row.version !== expected.version || row.name !== expected.name) {
      throw new Error(
        'Database migration history is incompatible with this application. Restore the matching software version or a compatible backup.',
      );
    }
  }
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  try {
    database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    database.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    validateMigrationHistory(database);
    for (const migration of migrations) {
      const applied = database
        .prepare('SELECT version FROM schema_migrations WHERE version=?')
        .get(migration.version);
      if (applied) continue;
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(migration.sql);
        database
          .prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)')
          .run(migration.version, migration.name, new Date().toISOString());
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
    seedDemo(database);
    seedHealthDemo(database);
    seedSocialDemo(database);
    seedAuthFoundation(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
