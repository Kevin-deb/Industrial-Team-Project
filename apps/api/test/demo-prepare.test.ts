import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareDemoProfile } from '../../../scripts/prepare-demo.js';
import { openDatabase } from '../src/database/connection.js';
import { SqliteEncounterRepository } from '../src/encounters/repository.js';

async function temporaryRoot(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'carelink-demo-prepare-'));
  t.after(async () => {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('carelink-demo-prepare-'));
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}

test('demo preparation creates a separate dated profile with valid grants and preserves completed history', async (t) => {
  const directory = await temporaryRoot(t);
  const target = join(directory, 'new-profile');
  const when = new Date('2026-10-05T01:30:00.000Z');
  const baseline = openDatabase(':memory:');
  const completed = baseline
    .prepare("SELECT * FROM encounters WHERE status='completed' ORDER BY id")
    .all();
  assert.ok(completed.length > 0, 'the seed must exercise completed history preservation');
  baseline.close();
  const prepared = await prepareDemoProfile(target, when);
  assert.equal(prepared.profilePath, resolve(target));
  assert.equal(prepared.databasePath, join(resolve(target), 'data', 'doctor.sqlite'));
  assert.ok(prepared.accounts.some((account) => account.username === 'lin.zhiyuan'));
  assert.ok(prepared.accounts.some((account) => account.username === 'zhou.ming'));
  assert.ok(prepared.refreshed.encounters > 0);
  assert.ok(prepared.refreshed.consultations > 0);
  assert.ok(prepared.refreshed.availabilityWindows > 0);
  const db = new DatabaseSync(prepared.databasePath, { readOnly: true });
  try {
    assert.deepEqual(
      db.prepare("SELECT * FROM encounters WHERE status='completed' ORDER BY id").all(),
      completed,
    );
    const active = db.prepare("SELECT * FROM encounters WHERE status!='completed'").all();
    for (const row of active) {
      const relative = Date.parse(String(row.scheduled_at)) - when.getTime();
      assert.ok(row.type === 'text' ? relative <= 0 && relative > -48 * 60 * 60_000 : relative > 0);
    }
    assert.ok(
      db
        .prepare('SELECT 1 FROM encounter_availability_windows WHERE window_date=?')
        .get(prepared.localDate),
    );
    const tasks = db
      .prepare("SELECT * FROM consultations WHERE status IN ('requested','scheduled')")
      .all();
    for (const row of tasks) assert.ok(Date.parse(String(row.scheduled_at)) > when.getTime());
    const grants = db
      .prepare(
        `SELECT ag.*,c.patient_id task_patient,c.scheduled_at FROM access_grants ag
      JOIN consultations c ON c.id=ag.task_id WHERE c.status IN ('requested','scheduled') AND ag.revoked_at IS NULL`,
      )
      .all();
    assert.ok(grants.length > 0);
    for (const row of grants) {
      assert.equal(row.patient_id, row.task_patient);
      assert.equal(
        Date.parse(String(row.expires_at)) - Date.parse(String(row.scheduled_at)),
        4 * 60 * 60_000,
      );
    }
    const repository = new SqliteEncounterRepository(db);
    assert.ok(
      repository.listConsultations({ actorId: 'doctor-demo-001', now: when.toISOString() }).length >
        0,
    );
    assert.ok(
      repository.listConsultations({ actorId: 'doctor-demo-002', now: when.toISOString() }).length >
        0,
    );
    assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
  const manifest = await readFile(join(target, 'demo-manifest.json'), 'utf8');
  assert.deepEqual(JSON.parse(manifest), prepared);
  assert.ok(!/token|password_hash|session_token/i.test(manifest));
});

test('demo preparation refuses a nonempty directory and never changes its existing files', async (t) => {
  const directory = await temporaryRoot(t);
  const target = join(directory, 'occupied');
  await mkdir(target);
  await writeFile(join(target, 'keep.txt'), 'Do not overwrite');
  await assert.rejects(prepareDemoProfile(target), /非空/);
  assert.equal(await readFile(join(target, 'keep.txt'), 'utf8'), 'Do not overwrite');
  assert.deepEqual(await readdir(target), ['keep.txt']);
  const fileTarget = join(directory, 'file.sqlite');
  await writeFile(fileTarget, 'Existing file');
  await assert.rejects(prepareDemoProfile(fileTarget), /普通目录/);
  assert.equal(await readFile(fileTarget, 'utf8'), 'Existing file');
});

test('an empty profile is allowed but preparing it again cannot reset the database', async (t) => {
  const directory = await temporaryRoot(t);
  const target = join(directory, 'empty-profile');
  await mkdir(target);
  const prepared = await prepareDemoProfile(target, new Date('2026-10-05T01:30:00Z'));
  const before = await readFile(prepared.databasePath);
  await assert.rejects(prepareDemoProfile(target, new Date('2026-10-06T01:30:00Z')), /非空/);
  assert.deepEqual(await readFile(prepared.databasePath), before);
});

test('demo preparation CLI requires an explicit target and prints only synthetic accounts and paths', async (t) => {
  const directory = await temporaryRoot(t);
  const script = fileURLToPath(new URL('../../../scripts/prepare-demo.ts', import.meta.url));
  const run = promisify(execFile);
  const result = await run(process.execPath, [
    '--import',
    'tsx',
    script,
    '--profile',
    join(directory, 'cli-profile'),
  ]);
  assert.match(result.stdout, /lin.zhiyuan/);
  assert.match(result.stdout, /CARELINK_PROFILE_PATH/);
  assert.ok(!/token|password_hash|session_token/i.test(result.stdout));
  await assert.rejects(run(process.execPath, ['--import', 'tsx', script]), /用法/);
});
