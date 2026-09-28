import type { RequestContext } from './access.js';
/** SQL aliases c/p and named context parameters are required. Patient scope is checked separately. */
export const consultationMemberSql = `(
  c.requested_by=:actorId OR EXISTS (
    SELECT 1 FROM consultation_participants member
    WHERE member.consultation_id=c.id AND member.identity_id=:actorId AND member.left_at IS NULL
    AND c.status IN ('requested','scheduled') AND c.completed_at IS NULL
  )
)`;

export function consultationAccessUntil(scheduledAt: string): string {
  const start = Date.parse(scheduledAt);
  if (!Number.isFinite(start)) throw new Error('Invalid consultation start time');
  return new Date(start + 4 * 60 * 60 * 1000).toISOString();
}

export function canCompleteConsultation(
  task: { requestedBy: string; reviewerId?: string },
  context: RequestContext,
): boolean {
  return task.requestedBy === context.actorId || task.reviewerId === context.actorId;
}
