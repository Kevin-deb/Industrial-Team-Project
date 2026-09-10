import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] === 'dir' ? ['--dir'] : ['nsis'];
const cache = resolve(root, 'runtime/cache/electron-builder');
await mkdir(cache, { recursive: true });
const child = spawn(
  process.execPath,
  [
    resolve(root, 'node_modules/electron-builder/cli.js'),
    '--win',
    ...target,
    '--x64',
    '--publish',
    'never',
  ],
  {
    cwd: resolve(root, 'apps/desktop'),
    env: { ...process.env, ELECTRON_BUILDER_CACHE: cache },
    stdio: 'inherit',
    windowsHide: true,
  },
);
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
