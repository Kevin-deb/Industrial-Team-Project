import type { PlannedCommand } from './command-contract.js';

/** Owned by the platform module; other modules only consume the public API. */
export const platformCommands: readonly PlannedCommand[] = [
  {
    method: 'POST',
    path: '/identity/challenges',
    domain: 'platform',
    capability: 'identity',
    tables: ['identities'],
    providers: ['identity'],
  },
  {
    method: 'POST',
    path: '/identity/verify',
    domain: 'platform',
    capability: 'identity',
    tables: ['identities', 'identity_roles'],
    providers: ['identity'],
  },
  {
    method: 'POST',
    path: '/integrations/hospital/import',
    domain: 'platform',
    capability: 'hospital-sync',
    tables: ['patient_archive_versions'],
    providers: ['hospital'],
  },
];
