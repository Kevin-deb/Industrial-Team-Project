import type { FastifyInstance } from 'fastify';
import type { PlannedCommand } from './command-contract.js';
import { platformCommands } from './commands.js';
import { patientsCommands } from '../patients/index.js';
import { encountersCommands } from '../encounters/index.js';
import { clinicalCommands } from '../clinical/index.js';
import { healthCommands } from '../health/index.js';
import { socialCommands } from '../social/index.js';

/** Composition-only registry; domain owners edit their own commands.ts. */
export const plannedCommands: readonly PlannedCommand[] = [
  ...platformCommands,
  ...patientsCommands,
  ...encountersCommands,
  ...clinicalCommands,
  ...healthCommands,
  ...socialCommands,
];

export function registerPlannedCommands(app: FastifyInstance): void {
  for (const command of plannedCommands)
    app.route({
      method: command.method,
      url: '/api/v1' + command.path,
      handler:
        command.handler ??
        (async (request, reply) =>
          reply.code(501).send({
            error: {
              code: 'FEATURE_NOT_IMPLEMENTED',
              message: '该功能尚未上线。当前为只读演示框架，未保存任何业务更改。',
            },
            meta: { requestId: request.id, mode: 'demo' },
          })),
    });
}
