import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../../apps/api/src/app.js';
import {
  backupProfile,
  restoreProfile,
  verifyProfileBackup,
} from '../../scripts/backup-profile.js';
import { acquireProfileLock } from '../../apps/desktop/src/profile-lock.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const execute = promisify(execFile);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'carelink-recovery-test-'));
  const profile = join(root, 'source');
  await mkdir(join(profile, 'data/social-media'), { recursive: true });
  const database = new DatabaseSync(join(profile, 'data/doctor.sqlite'));
  database.exec(
    'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT); CREATE TABLE records(id INTEGER PRIMARY KEY, note TEXT); CREATE TABLE social_attachments(storage_key TEXT,byte_size INTEGER);',
  );
  database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(1, 'recovery-test');
  database.prepare('INSERT INTO records VALUES(?,?)').run(1, 'Committed content still in WAL');
  await writeFile(join(profile, 'data/social-media/abc-123.png'), 'synthetic attachment bytes');
  database
    .prepare('INSERT INTO social_attachments VALUES(?,?)')
    .run('abc-123.png', Buffer.byteLength('synthetic attachment bytes'));
  return {
    root,
    profile,
    database,
    async close() {
      database.close();
      assert.equal(dirname(root), tmpdir());
      assert.ok(root.includes('carelink-recovery-test-'));
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('CLI round trip includes committed WAL data and media without changing the original profile', async () => {
  const fixtureData = await fixture();
  const { root, profile, database } = fixtureData;
  try {
    const output = join(root, 'backup');
    const target = join(root, 'restored');
    assert.ok((await stat(join(profile, 'data/doctor.sqlite-wal'))).size > 0);
    for (const args of [
      ['backup', '--profile', profile, '--output', output],
      ['verify', '--backup', output],
      ['restore', '--backup', output, '--target', target],
    ]) {
      const result = await execute(
        process.execPath,
        ['--import', 'tsx', 'scripts/backup-profile.ts', ...args],
        {
          cwd: repository,
          windowsHide: true,
          timeout: 30000,
        },
      );
      assert.equal(JSON.parse(result.stdout).status, 'verified');
    }
    const restored = new DatabaseSync(join(target, 'data/doctor.sqlite'), { readOnly: true });
    try {
      assert.equal(
        restored.prepare('SELECT note FROM records WHERE id=1').get()!.note,
        'Committed content still in WAL',
      );
      assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      restored.close();
    }
    assert.equal(
      database.prepare('SELECT note FROM records WHERE id=1').get()!.note,
      'Committed content still in WAL',
    );
    assert.equal(
      await readFile(join(target, 'data/social-media/abc-123.png'), 'utf8'),
      'synthetic attachment bytes',
    );
    const manifest = await verifyProfileBackup(output);
    assert.equal(manifest.files.length, 2);
  } finally {
    await fixtureData.close();
  }
});

test('recovery refuses nonempty, nested, modified and path-traversal targets', async () => {
  const fixtureData = await fixture();
  const { root, profile } = fixtureData;
  try {
    const output = join(root, 'backup');
    await backupProfile(profile, output);
    await assert.rejects(restoreProfile(output, profile), /empty directory/);
    await assert.rejects(backupProfile(profile, join(profile, 'nested')), /separate directories/);
    await assert.rejects(restoreProfile(output, join(output, 'nested')), /separate directories/);
    const target = join(root, 'empty-restored');
    await mkdir(target);
    await restoreProfile(output, target);
    assert.ok((await stat(join(target, 'data/doctor.sqlite'))).size > 0);
    const manifestPath = join(output, 'manifest.json');
    const originalManifest = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(originalManifest);
    manifest.files[0].path = '../outside.sqlite';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(restoreProfile(output, join(root, 'unsafe')), /Invalid/);
    await writeFile(manifestPath, originalManifest);
    await writeFile(join(output, 'data/social-media/abc-123.png'), 'tampered');
    await assert.rejects(restoreProfile(output, join(root, 'corrupt')), /checksum mismatch/);
    await assert.rejects(stat(join(root, 'corrupt')), { code: 'ENOENT' });
  } finally {
    await fixtureData.close();
  }
});

test('desktop profile lock blocks backups until the application has closed', async () => {
  const fixtureData = await fixture();
  try {
    const release = acquireProfileLock(fixtureData.profile);
    try {
      assert.throws(() => acquireProfileLock(fixtureData.profile), /in use/);
      await assert.rejects(
        backupProfile(fixtureData.profile, join(fixtureData.root, 'busy-backup')),
        /in use/,
      );
    } finally {
      release();
    }
    await backupProfile(fixtureData.profile, join(fixtureData.root, 'closed-backup'));
  } finally {
    await fixtureData.close();
  }
});

test('backup refuses a profile whose database references missing media', async () => {
  const fixtureData = await fixture();
  try {
    await rm(join(fixtureData.profile, 'data/social-media/abc-123.png'));
    await assert.rejects(
      backupProfile(fixtureData.profile, join(fixtureData.root, 'incomplete')),
      /attachment referenced/,
    );
    await assert.rejects(stat(join(fixtureData.root, 'incomplete')), { code: 'ENOENT' });
  } finally {
    await fixtureData.close();
  }
});

test('a complete CareLink profile restores real login, saved settings and protected media', async () => {
  const root = await mkdtemp(join(tmpdir(), 'carelink-recovery-test-'));
  const profile = join(root, 'source');
  const restoredProfile = join(root, 'restored');
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const open = (directory: string) =>
    createApp({
      databasePath: join(directory, 'data/doctor.sqlite'),
      mediaRoot: join(directory, 'data/social-media'),
      runtime: 'desktop-demo',
      reminderPollingMs: 0,
    });
  const headersFor = async (application: Awaited<ReturnType<typeof createApp>>) => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/v1/auth/password-login',
      payload: { account: 'lin.zhiyuan', password: '123456' },
    });
    assert.equal(response.statusCode, 201, response.body);
    return { authorization: 'Bearer ' + response.json().data.token };
  };
  let application: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    application = await open(profile);
    const headers = await headersFor(application);
    const changed = await application.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers,
      payload: {
        phone: '13800008888',
        specialty: 'Synthetic recovery',
        outpatientLocation: 'Recovery room',
        bio: 'Synthetic recovery check',
      },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const boundary = '----carelink-backup-test';
    const mediaBody = Buffer.concat([
      Buffer.from(
        '--' +
          boundary +
          '\r\nContent-Disposition: form-data; name="file"; filename="demo.png"\r\nContent-Type: image/png\r\n\r\n',
      ),
      image,
      Buffer.from('\r\n--' + boundary + '--\r\n'),
    ]);
    const uploaded = await application.inject({
      method: 'POST',
      url: '/api/v1/social/attachments',
      headers: { ...headers, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: mediaBody,
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const contentUrl = uploaded.json().data.contentUrl;
    await application.close();
    application = undefined;
    const backupPath = join(root, 'backup');
    await backupProfile(profile, backupPath);
    await restoreProfile(backupPath, restoredProfile);
    application = await open(restoredProfile);
    const restoredHeaders = await headersFor(application);
    const savedProfile = await application.inject({
      url: '/api/v1/settings/profile',
      headers: restoredHeaders,
    });
    assert.equal(savedProfile.json().data.phone, '13800008888');
    const patients = await application.inject({
      url: '/api/v1/patients',
      headers: restoredHeaders,
    });
    assert.equal(patients.statusCode, 200);
    assert.equal(patients.json().data.length, 8);
    const restoredMedia = await application.inject({ url: contentUrl, headers: restoredHeaders });
    assert.equal(restoredMedia.statusCode, 200, restoredMedia.body);
    assert.deepEqual(restoredMedia.rawPayload, image);
    assert.ok((await stat(join(profile, 'data/doctor.sqlite'))).size > 0);
  } finally {
    await application?.close();
    assert.equal(dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true });
  }
});
