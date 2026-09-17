import type { PlannedCommand } from '../platform/index.js';

/** Owned by the patients module; other modules only consume the public API. */
export const patientsCommands: readonly PlannedCommand[] = [
  {
    method: 'POST',
    path: '/patients',
    domain: 'patients',
    capability: 'patient-edit',
    tables: ['patients', 'patient_archive_versions'],
    providers: [],
  },
  {
    method: 'POST',
    path: '/patients/batch',
    domain: 'patients',
    capability: 'patient-edit',
    tables: ['patients', 'audit_events'],
    providers: [],
  },
];
