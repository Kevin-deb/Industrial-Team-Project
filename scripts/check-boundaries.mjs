import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist'].includes(entry.name)) await visit(file);
    } else if (/\.[cm]?[jt]sx?$/.test(file)) {
      const content = await readFile(file, 'utf8');
      const relative = path.relative(root, file).replaceAll('\\', '/');
      for (const match of content.matchAll(/(?:from\s*|import\s*\(?)['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        const resolved = specifier.startsWith('.')
          ? path.relative(root, path.resolve(path.dirname(file), specifier)).replaceAll('\\', '/')
          : specifier;
        if (
          relative.startsWith('apps/web/') &&
          (resolved.startsWith('apps/api/') ||
            resolved.startsWith('apps/desktop/') ||
            specifier === '@doctor/api' ||
            specifier === 'electron' ||
            specifier.startsWith('node:'))
        )
          failures.push(
            `${relative}: Renderer cannot import backend or desktop privileges (${specifier})`,
          );
        if (
          relative.startsWith('apps/api/') &&
          (resolved.startsWith('apps/web/') || specifier === '@doctor/web')
        )
          failures.push(`${relative}: backend cannot import UI code (${specifier})`);
        if (
          relative.startsWith('packages/contracts/') &&
          (resolved.startsWith('apps/') || /^(fastify|react|node:sqlite)$/.test(specifier))
        )
          failures.push(
            `${relative}: contracts must not depend on application implementation (${specifier})`,
          );
        const apiCurrent = relative.match(
          /^apps\/api\/src\/(patients|encounters|clinical|health|social)\//,
        );
        const apiTarget = resolved.match(
          /^apps\/api\/src\/(patients|encounters|clinical|health|social)(?:\/(.*))?$/,
        );
        if (
          apiCurrent &&
          apiTarget &&
          apiCurrent[1] !== apiTarget[1] &&
          apiTarget[2] &&
          !/^index(?:\.[cm]?[jt]sx?)?$/.test(apiTarget[2])
        )
          failures.push(`${relative}: use another backend domain's public index (${specifier})`);
        const current = relative.match(/^apps\/(web|api)\/src\/modules\/([^/]+)\//);
        const target = resolved.match(/^apps\/(web|api)\/src\/modules\/([^/]+)(?:\/(.*))?$/);
        if (
          current &&
          target &&
          current[1] === target[1] &&
          current[2] !== target[2] &&
          target[2] !== 'shared' &&
          target[3] &&
          !/^index(?:\.[cm]?[jt]sx?)?$/.test(target[3])
        )
          failures.push(
            `${relative}: consume a module's public index, not its internal file (${specifier})`,
          );
      }
    }
  }
}
for (const folder of ['apps', 'packages']) await visit(path.join(root, folder));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Module boundaries verified: UI/API separation, independent contracts, public domain imports.',
  );
