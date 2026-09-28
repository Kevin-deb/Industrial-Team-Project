import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCK_NAME = '.carelink-profile-operation.lock';

/** Shared by the desktop and recovery tool: a profile has only one writer/backup operation. */
export function acquireProfileLock(profile: string): () => void {
  const lockPath = resolve(profile, LOCK_NAME);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = openSync(lockPath, 'wx', 0o600);
      const value = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
      try {
        writeFileSync(descriptor, value);
      } finally {
        closeSync(descriptor);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (existsSync(lockPath) && readFileSync(lockPath, 'utf8') === value) unlinkSync(lockPath);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let owner: { pid?: number };
      try {
        owner = JSON.parse(readFileSync(lockPath, 'utf8'));
      } catch {
        throw new Error(
          'The profile lock cannot be verified. Close CareLink before checking the lock file.',
        );
      }
      if (!Number.isInteger(owner.pid) || owner.pid! <= 0)
        throw new Error('The profile lock is invalid; refusing to access this profile.');
      try {
        process.kill(owner.pid!, 0);
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code === 'ESRCH') {
          // Only remove the exact stale lock we inspected.
          const latest = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: number };
          if (latest.pid === owner.pid) unlinkSync(lockPath);
          continue;
        }
        throw new Error('The profile owner cannot be checked. Close CareLink before recovery.');
      }
      throw new Error(
        'This profile is in use. Close CareLink and retry the backup or recovery operation.',
      );
    }
  }
  throw new Error('Could not acquire the profile lock.');
}
