import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backup, DatabaseSync } from 'node:sqlite';
import { acquireProfileLock } from '../apps/desktop/src/profile-lock.js';

type ManifestFile = { path: string; bytes: number; sha256: string };
type BackupManifest = {
  format: 'carelink-profile-backup';
  version: 1;
  createdAt: string;
  applicationVersion: string;
  scope: 'database-and-social-media';
  files: ManifestFile[];
};
const DATABASE_FILE = 'data/doctor.sqlite';

async function canonicalPath(input: string): Promise<string> {
  const path = resolve(input);
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error('Symbolic-link targets are not supported.');
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await canonicalPath(parent), basename(path));
  }
}

function contains(root: string, target: string): boolean {
  const difference = relative(root, target);
  return (
    difference === '' ||
    (!difference.startsWith('..' + sep) && difference !== '..' && !isAbsolute(difference))
  );
}

function requireSeparate(source: string, target: string) {
  if (contains(source, target) || contains(target, source))
    throw new Error('Source and destination must be separate directories, never nested.');
}

async function requireEmptyTarget(target: string): Promise<boolean> {
  try {
    const info = await lstat(target);
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(target)).length)
      throw new Error(
        'Destination must not exist or must be an empty directory. Existing data is never overwritten.',
      );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function regularFiles(root: string, prefix = ''): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const child = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Backup paths must not contain symbolic links.');
    if (entry.isDirectory()) paths.push(...(await regularFiles(root, child)));
    else if (entry.isFile()) paths.push(child);
    else throw new Error('Backup paths must contain only ordinary files and directories.');
  }
  return paths.sort();
}

function permittedPath(path: string): boolean {
  return (
    path === DATABASE_FILE ||
    (/^data\/social-media\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) &&
      path.split('/').every((part) => part !== '..' && part !== '.' && part.length > 0))
  );
}

async function fingerprint(root: string, path: string): Promise<ManifestFile> {
  if (!permittedPath(path) || !contains(root, resolve(root, path)))
    throw new Error('Invalid backup file path.');
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(resolve(root, path))) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { path, bytes, sha256: hash.digest('hex') };
}

function checkDatabase(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok')
      throw new Error('SQLite integrity validation failed.');
    if (database.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('SQLite foreign-key validation failed.');
    database.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all();
    return database
      .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='social_attachments'")
      .get()
      ? (database.prepare('SELECT storage_key,byte_size FROM social_attachments').all() as Array<{
          storage_key: string;
          byte_size: number;
        }>)
      : [];
  } finally {
    database.close();
  }
}

async function deleteStaging(stage: string, parent: string) {
  if (dirname(stage) !== parent || !basename(stage).startsWith('.carelink-recovery-'))
    throw new Error('Unsafe staging cleanup path.');
  await rm(stage, { recursive: true, force: true });
}

async function publishStage(stage: string, destination: string) {
  // Recheck after verification; do not merge into an existing profile.
  const existingEmpty = await requireEmptyTarget(destination);
  if (existingEmpty) await rmdir(destination); // Nonrecursive: refuses any newly-created file.
  await rename(stage, destination);
}

export async function verifyProfileBackup(input: string): Promise<BackupManifest> {
  const root = await canonicalPath(input);
  const raw: unknown = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (!raw || typeof raw !== 'object') throw new Error('Invalid backup manifest.');
  const manifest = raw as BackupManifest;
  if (
    manifest.format !== 'carelink-profile-backup' ||
    manifest.version !== 1 ||
    manifest.scope !== 'database-and-social-media' ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  )
    throw new Error('Unsupported backup manifest.');
  const listed = new Set<string>();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      !permittedPath(file.path) ||
      listed.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('Invalid or duplicate backup manifest entry.');
    listed.add(file.path);
  }
  if (!listed.has(DATABASE_FILE)) throw new Error('Backup database is missing.');
  const actual = await regularFiles(root);
  const expected = [...listed, 'manifest.json'].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Backup files do not match the manifest.');
  for (const file of manifest.files) {
    const actualFile = await fingerprint(root, file.path);
    if (actualFile.bytes !== file.bytes || actualFile.sha256 !== file.sha256)
      throw new Error('Backup checksum mismatch: ' + file.path);
  }
  for (const attachment of checkDatabase(resolve(root, DATABASE_FILE))) {
    const saved = manifest.files.find(
      (file) => file.path === 'data/social-media/' + attachment.storage_key,
    );
    if (!saved || saved.bytes !== attachment.byte_size)
      throw new Error('An attachment referenced by the database is missing or incomplete.');
  }
  return manifest;
}

export async function backupProfile(
  profileInput: string,
  outputInput: string,
): Promise<BackupManifest> {
  const profile = await canonicalPath(profileInput);
  const output = await canonicalPath(outputInput);
  requireSeparate(profile, output);
  await requireEmptyTarget(output);
  if ((await lstat(resolve(profile, 'data'))).isSymbolicLink())
    throw new Error('Profile data directories must not be symbolic links.');
  const databasePath = resolve(profile, DATABASE_FILE);
  if (!(await lstat(databasePath)).isFile()) throw new Error('Profile database is missing.');
  await mkdir(dirname(output), { recursive: true });
  const releaseLock = acquireProfileLock(profile);
  let stage: string | undefined;
  try {
    stage = await mkdtemp(resolve(dirname(output), '.carelink-recovery-'));
    await mkdir(resolve(stage, 'data/social-media'), { recursive: true });
    // SQLite's online backup API includes committed WAL data; never copy the live main file.
    const source = new DatabaseSync(databasePath, { readOnly: true });
    try {
      await backup(source, resolve(stage, DATABASE_FILE));
    } finally {
      source.close();
    }
    // A portable snapshot must not retain WAL mode or create sidecar files during verification.
    const snapshot = new DatabaseSync(resolve(stage, DATABASE_FILE));
    try {
      snapshot.exec('PRAGMA journal_mode=DELETE;');
    } finally {
      snapshot.close();
    }
    const media = resolve(profile, 'data/social-media');
    let hasMedia = true;
    try {
      if (!(await lstat(media)).isDirectory()) throw new Error('Invalid media directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      hasMedia = false;
    }
    if (hasMedia) {
      for (const file of await regularFiles(media)) {
        const target = resolve(stage, 'data/social-media', file);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(resolve(media, file), target, constants.COPYFILE_EXCL);
      }
    }
    const files = await regularFiles(stage);
    const manifestFiles: ManifestFile[] = [];
    for (const file of files) manifestFiles.push(await fingerprint(stage, file));
    const applicationPackage = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const manifest: BackupManifest = {
      format: 'carelink-profile-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      applicationVersion: applicationPackage.version,
      scope: 'database-and-social-media',
      files: manifestFiles,
    };
    await writeFile(resolve(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
      flag: 'wx',
    });
    await verifyProfileBackup(stage);
    await publishStage(stage, output);
    return manifest;
  } finally {
    releaseLock();
    if (stage) await deleteStaging(stage, dirname(output));
  }
}

export async function restoreProfile(
  backupInput: string,
  targetInput: string,
): Promise<BackupManifest> {
  const source = await canonicalPath(backupInput);
  const target = await canonicalPath(targetInput);
  requireSeparate(source, target);
  await requireEmptyTarget(target);
  // Validate before creating anything at the requested destination.
  const manifest = await verifyProfileBackup(source);
  await mkdir(dirname(target), { recursive: true });
  const stage = await mkdtemp(resolve(dirname(target), '.carelink-recovery-'));
  try {
    for (const file of manifest.files) {
      const destination = resolve(stage, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(source, file.path), destination, constants.COPYFILE_EXCL);
      const copied = await fingerprint(stage, file.path);
      if (copied.sha256 !== file.sha256 || copied.bytes !== file.bytes)
        throw new Error('Backup changed while restoring: ' + file.path);
    }
    checkDatabase(resolve(stage, DATABASE_FILE));
    await publishStage(stage, target);
    return manifest;
  } finally {
    await deleteStaging(stage, dirname(target));
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || !value || options.has(flag))
      throw new Error('Invalid arguments.');
    options.set(flag, value);
  }
  const requireOption = (name: string) => {
    const value = options.get(name);
    if (!value) throw new Error('Required argument: ' + name);
    return value;
  };
  let result: BackupManifest;
  if (command === 'backup' && options.size === 2)
    result = await backupProfile(requireOption('--profile'), requireOption('--output'));
  else if (command === 'restore' && options.size === 2)
    result = await restoreProfile(requireOption('--backup'), requireOption('--target'));
  else if (command === 'verify' && options.size === 1)
    result = await verifyProfileBackup(requireOption('--backup'));
  else
    throw new Error(
      'Usage: backup --profile PATH --output PATH | verify --backup PATH | restore --backup PATH --target EMPTY_PATH',
    );
  console.log(
    JSON.stringify(
      {
        operation: command,
        status: 'verified',
        files: result.files.length,
        createdAt: result.createdAt,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Recovery operation failed.');
    process.exitCode = 1;
  });
}
