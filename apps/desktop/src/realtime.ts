import type { FastifyInstance } from 'fastify';
import type { SocialRealtimeHub } from '../../api/src/social/index.js';
import type { SocialRealtimeEvent } from '@doctor/contracts';

export async function subscribeCurrentDoctor(
  services: FastifyInstance,
  hub: SocialRealtimeHub,
  listener: (event: SocialRealtimeEvent) => void,
  token?: string,
): Promise<() => void> {
  const response = await services.inject({
    url: '/api/v1/session',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const id: unknown = response.json().data?.doctor?.id;
  if (response.statusCode !== 200 || typeof id !== 'string' || !id)
    throw new Error('Current doctor session unavailable');
  return hub.subscribe(id, listener);
}
