import type { DatabaseSync } from 'node:sqlite';
import type { SocialPeer } from '@doctor/contracts';
import type { SocialPeerDirectoryPort } from './ports.js';

/**
 * Composition adapter only: the community domain can search platform identities,
 * but it does not own, edit or replicate the clinician directory.
 */
export class SqliteSocialPeerDirectory implements SocialPeerDirectoryPort {
  constructor(private readonly db: DatabaseSync) {}

  search(query: string, actorId: string): SocialPeer[] {
    const literal = query.trim().toLocaleLowerCase();
    if (!literal) return [];
    return this.db
      .prepare(
        `SELECT i.id,i.display_name,i.title,i.department,i.hospital,i.avatar_initials
         FROM identities i
         JOIN social_preferences p ON p.identity_id=i.id AND p.enabled=1
         WHERE i.id<>?
           AND (instr(lower(i.display_name),?)>0 OR instr(lower(i.title),?)>0
             OR instr(lower(i.department),?)>0 OR instr(lower(i.hospital),?)>0)
         ORDER BY CASE WHEN instr(lower(i.display_name),?)=1 THEN 0 ELSE 1 END,
           i.display_name ASC,i.id ASC
         LIMIT 12`,
      )
      .all(actorId, literal, literal, literal, literal, literal)
      .map((row) => {
        const item = row as Record<string, string>;
        return {
          id: item.id,
          displayName: item.display_name,
          title: item.title,
          department: item.department,
          hospital: item.hospital,
          avatarInitials: item.avatar_initials,
        };
      });
  }
}
