import { commonMessages } from './common-messages';
import { auditMessages } from './audit/messages';
import { communityMessages } from './community/messages';
import { consultationsMessages } from './consultations/messages';
import { encountersMessages } from './encounters/messages';
import { healthMessages } from './health/messages';
import { patientsMessages } from './patients/messages';
import { recordsMessages } from './records/messages';
import { settingsMessages } from './settings/messages';

/** Stable integration point. Add feature copy in its owning module catalog. */
export const moduleMessages: Record<string, string> = {
  ...commonMessages,
  ...auditMessages,
  ...communityMessages,
  ...consultationsMessages,
  ...encountersMessages,
  ...healthMessages,
  ...patientsMessages,
  ...recordsMessages,
  ...settingsMessages,
};
