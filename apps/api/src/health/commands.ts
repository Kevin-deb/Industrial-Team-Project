import type { PlannedCommand } from '../platform/index.js';

/** Owned by the health module; other modules only consume the public API. */
export const healthCommands: readonly PlannedCommand[] = [];
