import type { FastifyInstance } from 'fastify';
import type { SocialRealtimeHub } from '../../api/src/social/index.js';
import type { SocialRealtimeEvent } from '@doctor/contracts';

export type DoctorRealtimeSubscription = (() => void) & { settled(): Promise<void> };

export async function subscribeCurrentDoctor(
  services: FastifyInstance,
  hub: SocialRealtimeHub,
  listener: (event: SocialRealtimeEvent) => void,
  token?: string,
): Promise<DoctorRealtimeSubscription> {
  async function currentDoctor(): Promise<string | undefined> {
    const response = await services.inject({
      url: '/api/v1/session',
      headers: token ? { authorization: 'Bearer ' + token } : undefined,
    });
    if (response.statusCode !== 200) return undefined;
    const id: unknown = response.json().data?.doctor?.id;
    return typeof id === 'string' && id ? id : undefined;
  }
  const id = await currentDoctor();
  if (!id) throw new Error('Current doctor session unavailable');

  let active = true;
  let pending = Promise.resolve();
  let unsubscribe = () => {};
  const stop = Object.assign(
    () => {
      if (!active) return;
      active = false;
      unsubscribe();
    },
    { settled: () => pending },
  );
  unsubscribe = hub.subscribe(id, (event) => {
    // Recheck immediately before each delivery. A valid subscription never extends token lifetime.
    pending = pending
      .then(async () => {
        if (!active) return;
        const current = await currentDoctor();
        if (!active) return;
        if (current !== id) {
          stop();
          return;
        }
        listener(event);
      })
      .catch(() => stop());
  });
  return stop;
}

type Connect = (
  token: string,
  listener: (event: SocialRealtimeEvent) => void,
) => Promise<() => void>;

/** Only the latest renderer account selection may retain or deliver a subscription. */
export function createRealtimeSessionController(
  connect: Connect,
  listener: (event: SocialRealtimeEvent) => void,
) {
  let generation = 0;
  let disconnect: (() => void) | undefined;
  const stop = () => {
    generation++;
    disconnect?.();
    disconnect = undefined;
  };
  return {
    stop,
    async setSessionToken(token: unknown): Promise<{ subscribed: boolean }> {
      stop();
      const currentGeneration = generation;
      if (typeof token !== 'string' || !token) return { subscribed: false };
      try {
        const nextDisconnect = await connect(token, (event) => {
          if (currentGeneration === generation) listener(event);
        });
        if (currentGeneration !== generation) {
          nextDisconnect();
          return { subscribed: false };
        }
        disconnect = nextDisconnect;
        return { subscribed: true };
      } catch (error) {
        if (currentGeneration !== generation) return { subscribed: false };
        throw error;
      }
    },
  };
}
