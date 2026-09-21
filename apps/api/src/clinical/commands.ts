import type { PlannedCommand } from '../platform/index.js';

/** Owned by the clinical module; other modules only consume the public API. */
export const clinicalCommands: readonly PlannedCommand[] = [];
