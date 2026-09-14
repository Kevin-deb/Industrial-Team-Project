import type { SocialRealtimeEvent } from '@doctor/contracts';

export type SocialRealtimeListener = (event: SocialRealtimeEvent) => void;

export interface SocialRealtimePort {
  publish(identityIds: readonly string[], event: SocialRealtimeEvent): void;
}

/** Process-local fan-out. Browser WebSockets and Electron IPC subscribe through adapters. */
export class SocialRealtimeHub implements SocialRealtimePort {
  private readonly listeners = new Map<string, Set<SocialRealtimeListener>>();

  subscribe(identityId: string, listener: SocialRealtimeListener): () => void {
    const bucket = this.listeners.get(identityId) ?? new Set<SocialRealtimeListener>();
    bucket.add(listener);
    this.listeners.set(identityId, bucket);
    return () => {
      bucket.delete(listener);
      if (!bucket.size) this.listeners.delete(identityId);
    };
  }

  publish(identityIds: readonly string[], event: SocialRealtimeEvent): void {
    for (const identityId of new Set(identityIds)) {
      for (const listener of this.listeners.get(identityId) ?? []) {
        try {
          listener(event);
        } catch {
          // Realtime delivery is best-effort and must not roll back a committed command.
        }
      }
    }
  }
}
