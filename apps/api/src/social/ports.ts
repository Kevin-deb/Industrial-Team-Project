import type { MedicalMetricCard, SocialPeer } from '@doctor/contracts';

export interface SocialAuditEvent {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'success';
  occurredAt: string;
}

/** Metadata-only port. Community content and message bodies must never enter audit events. */
export interface SocialAuditPort {
  record(event: SocialAuditEvent): void | Promise<void>;
}

/** Narrow read-only adapter to the platform-owned clinician directory. */
export interface SocialPeerDirectoryPort {
  search(query: string, actorId: string): SocialPeer[];
}

/**
 * Reserved seam for a future B-module picker. Implementations may expose only
 * already-sanitized card data; E never receives patient, encounter or record IDs.
 */
export interface SocialMedicalMetricCardSourcePort {
  listSanitizedCards(
    query: string,
    actorId: string,
  ): Array<
    Omit<MedicalMetricCard, 'sourceType' | 'deidentificationConfirmed'> & {
      selectionToken: string;
    }
  >;
}
