import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/database/connection.js';

const databaseDir = fileURLToPath(new URL('../../../database/', import.meta.url));

function schemaObjects(database: DatabaseSync): string[] {
  return database
    .prepare(
      `SELECT type || ':' || name AS object
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type,name`,
    )
    .all()
    .map((row) => String(row.object));
}

test('standalone SQL recreates the application schema and synthetic baseline', () => {
  const schemaSql = readFileSync(databaseDir + 'schema.sql', 'utf8');
  const seedSql = readFileSync(databaseDir + 'seed.sql', 'utf8');
  const exported = new DatabaseSync(':memory:');
  exported.exec(schemaSql);
  exported.exec(seedSql);

  const runtime = openDatabase(':memory:');
  assert.deepEqual(schemaObjects(exported), schemaObjects(runtime));
  assert.equal(
    exported.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()?.count,
    24,
  );
  assert.equal(exported.prepare('SELECT COUNT(*) AS count FROM doctors').get()?.count, 5);
  assert.equal(exported.prepare('SELECT COUNT(*) AS count FROM patients').get()?.count, 10);
  assert.deepEqual(exported.prepare('PRAGMA foreign_key_check').all(), []);

  runtime.close();
  exported.close();
});
