import { resolve } from 'node:path';

/** Keep SQLite's memory sentinel intact; resolve file paths from the repository root on every OS. */
export function resolveDatabasePath(workspaceRoot: string, configuredPath?: string): string {
  if (configuredPath === ':memory:') return ':memory:';
  return resolve(workspaceRoot, configuredPath || 'runtime/data/doctor.sqlite');
}
