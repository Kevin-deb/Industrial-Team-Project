import { lstat, mkdir, open, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrations } from '../apps/api/src/database/connection.js';
import { consultationAccessUntil } from '../apps/api/src/platform/consultation-access.js';

export interface PreparedDemoProfile {
  mode: 'synthetic-local-demo';
  profilePath: string;
  databasePath: string;
  preparedAt: string;
  localDate: string;
  schemaVersion: number;
  accounts: Array<{ username: string; name: string; identityId: string }>;
  refreshed: { encounters: number; consultations: number; availabilityWindows: number };
}
function dateInLocalTime(now: Date, offsetDays = 0): string {
  const local = new Date(now);
  local.setDate(local.getDate() + offsetDays);
  return new Date(local.getTime() - local.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Creates a separate demo profile only. Existing data is never reset, deleted or overwritten. */
export async function prepareDemoProfile(
  profile: string,
  now = new Date(),
): Promise<PreparedDemoProfile> {
  if (!profile.trim()) throw new Error('必须指定 --profile 新演示目录。');
  if (!Number.isFinite(now.getTime())) throw new Error('演示准备时间无效。');
  const profilePath = resolve(profile);
  if (!isAbsolute(profilePath) || dirname(profilePath) === profilePath)
    throw new Error('不能把磁盘根目录作为演示目录。');
  const existing = await lstat(profilePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink()))
    throw new Error('演示目录必须是普通目录，不能是文件或符号链接。');
  if (existing && (await readdir(profilePath)).length)
    throw new Error('演示目录非空，已拒绝准备；现有数据没有修改。请选择新的或空目录。');
  if (!existing) await mkdir(profilePath, { recursive: true });
  // Exclusive files/directories make concurrent preparation fail instead of reusing another run's database.
  const markerPath = join(profilePath, '.carelink-demo-preparation.json');
  await writeFile(
    markerPath,
    JSON.stringify({ state: 'preparing', preparedAt: now.toISOString() }),
    { flag: 'wx' },
  );
  const dataPath = join(profilePath, 'data');
  await mkdir(dataPath);
  const databasePath = join(dataPath, 'doctor.sqlite');
  const reservation = await open(databasePath, 'wx');
  await reservation.close();
  const db = openDatabase(databasePath);
  let result: PreparedDemoProfile;
  try {
    const minute = Math.floor(now.getTime() / 60_000) * 60_000;
    const encounters = db
      .prepare(
        "SELECT id,type FROM encounters WHERE status IN ('waiting','scheduled') AND ended_at IS NULL ORDER BY scheduled_at,id",
      )
      .all();
    const consultations = db
      .prepare(
        "SELECT id,patient_id,requested_by FROM consultations WHERE status IN ('requested','scheduled') AND completed_at IS NULL ORDER BY scheduled_at,id",
      )
      .all();
    const windows = db
      .prepare('SELECT id,window_date FROM encounter_availability_windows ORDER BY window_date,id')
      .all();
    const windowDates = [...new Set(windows.map((row) => String(row.window_date)))];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [index, encounter] of encounters.entries()) {
        // Text visits are already within their 48-hour service window; video visits remain upcoming.
        const at = new Date(
          minute + (encounter.type === 'text' ? -30 : 30 + index * 15) * 60_000,
        ).toISOString();
        db.prepare('UPDATE encounters SET scheduled_at=? WHERE id=?').run(at, encounter.id);
      }
      for (const window of windows) {
        const at = dateInLocalTime(now, windowDates.indexOf(String(window.window_date)));
        db.prepare('UPDATE encounter_availability_windows SET window_date=? WHERE id=?').run(
          at,
          window.id,
        );
      }
      for (const [index, task] of consultations.entries()) {
        const at = new Date(minute + (60 + index * 30) * 60_000).toISOString();
        const until = consultationAccessUntil(at);
        db.prepare('UPDATE consultations SET scheduled_at=? WHERE id=?').run(at, task.id);
        // Correct old synthetic fixture patient/date drift only inside this newly created database.
        db.prepare(
          `UPDATE access_grants SET patient_id=?,expires_at=? WHERE task_id=?
          AND revoked_at IS NULL AND scope='patient:read'`,
        ).run(task.patient_id, until, task.id);
        const participants = db
          .prepare(
            `SELECT identity_id FROM consultation_participants
          WHERE consultation_id=? AND left_at IS NULL`,
          )
          .all(task.id);
        const identities = new Set([
          String(task.requested_by),
          ...participants.map((row) => String(row.identity_id)),
        ]);
        for (const actorId of identities) {
          const grant = db
            .prepare(
              `SELECT id FROM access_grants WHERE task_id=? AND identity_id=? AND scope='patient:read'`,
            )
            .get(task.id, actorId);
          // Existing revoked grants are deliberately retained; preparing must never undo revocation.
          if (!grant)
            db.prepare(
              `INSERT INTO access_grants(
            id,identity_id,patient_id,scope,task_id,expires_at,revoked_at,created_at
          ) VALUES(?,?,?,'patient:read',?,?,NULL,?)`,
            ).run(
              'demo-prepared-' + task.id + '-' + actorId,
              actorId,
              task.patient_id,
              task.id,
              until,
              now.toISOString(),
            );
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const accounts = db
      .prepare(
        `SELECT u.username,u.identity_id,i.display_name FROM users u
      JOIN identities i ON i.id=u.identity_id WHERE i.is_synthetic=1 ORDER BY u.username`,
      )
      .all()
      .map((row) => ({
        username: String(row.username),
        name: String(row.display_name),
        identityId: String(row.identity_id),
      }));
    result = {
      mode: 'synthetic-local-demo',
      profilePath,
      databasePath,
      preparedAt: now.toISOString(),
      localDate: dateInLocalTime(now),
      schemaVersion: migrations.at(-1)!.version,
      accounts,
      refreshed: {
        encounters: encounters.length,
        consultations: consultations.length,
        availabilityWindows: windows.length,
      },
    };
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
  await writeFile(join(profilePath, 'demo-manifest.json'), JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  });
  await writeFile(
    markerPath,
    JSON.stringify({ state: 'complete', preparedAt: now.toISOString() }) + '\n',
  );
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--profile' || !args[1]?.trim())
    throw new Error('用法：npm run demo:prepare -- --profile <新的或空的演示目录>');
  const result = await prepareDemoProfile(args[1]);
  console.log('已准备独立的合成演示数据。现有工作目录和已有患者数据未修改。');
  console.log('演示目录：' + result.profilePath);
  console.log('数据库：' + result.databasePath);
  console.log('本地演示日期：' + result.localDate);
  console.log('设置 CARELINK_PROFILE_PATH 为以上演示目录后启动桌面端。');
  console.log('合成演示账号（初始密码均为 123456）：');
  for (const account of result.accounts)
    console.log('  ' + account.username + ' / ' + account.name);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '演示准备失败。');
    process.exitCode = 1;
  });
}
