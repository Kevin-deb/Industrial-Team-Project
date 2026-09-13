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
