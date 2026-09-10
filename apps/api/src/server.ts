import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createApp } from './app.js';
import { resolveDatabasePath } from './database/config.js';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(sourceDirectory, '../../..');
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535.');
const databasePath = resolveDatabasePath(workspaceRoot, process.env.DATABASE_PATH);
const app = await createApp({
  databasePath,
  webRoot: resolve(workspaceRoot, 'apps/web/dist'),
  logger: true,
});
try {
  await app.listen({ host: '127.0.0.1', port });
  app.log.info(
    { url: 'http://127.0.0.1:' + port },
    'Synthetic doctor-service demo. Never enter real patient information.',
  );
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    app.close().catch((error) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
