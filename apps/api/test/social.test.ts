import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { seedSocialDemo } from '../src/social/fixtures.js';

test('social migration 8 remains clinically isolated and fixtures are idempotent', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get()!.count, 8);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'social_%'").all();
    for (const { name } of tables) {
      const foreign = db.prepare(`PRAGMA foreign_key_list(${String(name)})`).all();
      assert.ok(foreign.every((row) => String(row.table) === 'identities' || String(row.table).startsWith('social_')));
    }
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count) >= 24);
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_comments').get()!.count) >= 60);
    assert.ok(Number(db.prepare('SELECT COUNT(*) count FROM social_direct_messages').get()!.count) >= 72);
    const before = Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count);
    seedSocialDemo(db);
    assert.equal(Number(db.prepare('SELECT COUNT(*) count FROM social_posts').get()!.count), before);
  } finally { db.close(); }
});
