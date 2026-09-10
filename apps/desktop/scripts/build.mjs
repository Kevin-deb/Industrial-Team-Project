import { build } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererRoot = resolve(desktopRoot, '../web/dist');
const rendererOutput = resolve(desktopRoot, 'dist/renderer');
await import('./build-icon.mjs');
await readFile(resolve(rendererRoot, 'index.html'));
await mkdir(resolve(desktopRoot, 'dist'), { recursive: true });
await build({
  entryPoints: [resolve(desktopRoot, 'src/main.ts')],
  outfile: resolve(desktopRoot, 'dist/main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
});
if (dirname(rendererOutput) !== resolve(desktopRoot, 'dist'))
  throw new Error('Unsafe renderer output path.');
await rm(rendererOutput, { recursive: true, force: true });
await cp(rendererRoot, rendererOutput, { recursive: true });
console.log('Desktop application built with its renderer and local services.');
