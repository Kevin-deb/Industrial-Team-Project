import test from 'node:test';
import assert from 'node:assert/strict';
import type { SocialRealtimeEvent } from '@doctor/contracts';
import { createApp } from '../../api/src/app.js';
import { SocialRealtimeHub } from '../../api/src/social/index.js';
import { createRealtimeSessionController, subscribeCurrentDoctor } from '../src/realtime.js';

class TrackingHub extends SocialRealtimeHub {
  active = 0;
  override subscribe(identityId: string, listener: (event: SocialRealtimeEvent) => void) {
    this.active++;
    const unsubscribe = super.subscribe(identityId, listener);
    let active = true;
    return () => {
      if (active) this.active--;
      active = false;
      unsubscribe();
    };
  }
}
const event = (occurredAt: string): SocialRealtimeEvent => ({
  type: 'social.notifications.changed',
  occurredAt,
});
async function login(app: Awaited<ReturnType<typeof createApp>>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-login',
    payload: { account: 'lin.zhiyuan', password: '123456' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data.token as string;
}

test('desktop IPC subscribes to the current doctor and checks each queued delivery', async () => {
  const hub = new TrackingHub();
  const app = await createApp({ identity: { actorId: 'doctor-demo-002' }, socialRealtime: hub });
  const events: string[] = [];
  const stop = await subscribeCurrentDoctor(app, hub, (value) => events.push(value.occurredAt));
  try {
    hub.publish(['doctor-demo-001'], event('wrong'));
    hub.publish(['doctor-demo-002'], event('right'));
    await stop.settled();
    assert.deepEqual(events, ['right']);
    stop();
    assert.equal(hub.active, 0);
    hub.publish(['doctor-demo-002'], event('closed'));
    await stop.settled();
    assert.deepEqual(events, ['right']);
  } finally {
    stop();
    await app.close();
  }
});

for (const invalidation of ['logout', 'password-change', 'expiration'] as const) {
  test('desktop event delivery stops and unsubscribes after session ' + invalidation, async () => {
    let now = '2026-09-28T08:00:00.000Z';
    const hub = new TrackingHub();
    const app = await createApp({ runtime: 'desktop-demo', socialRealtime: hub, now: () => now });
    const received: string[] = [];
    let stop: Awaited<ReturnType<typeof subscribeCurrentDoctor>> | undefined;
    try {
      await assert.rejects(
        subscribeCurrentDoctor(app, hub, () => {}),
        /session unavailable/,
      );
      const token = await login(app);
      const headers = { authorization: 'Bearer ' + token };
      stop = await subscribeCurrentDoctor(
        app,
        hub,
        (value) => received.push(value.occurredAt),
        token,
      );
      assert.equal(hub.active, 1);
      hub.publish(['doctor-demo-001'], event('valid'));
      await stop.settled();
      assert.deepEqual(received, ['valid']);

      if (invalidation === 'logout') {
        assert.equal(
          (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })).statusCode,
          204,
        );
      } else if (invalidation === 'password-change') {
        const started = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password/change-password/start',
          headers,
          payload: { currentPassword: '123456', method: 'photo' },
        });
        assert.equal(started.statusCode, 202, started.body);
        const completed = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password/change-password/complete',
          headers,
          payload: {
            challengeId: started.json().data.challengeId,
            newPassword: 'Desktop-Changed9!',
            photoDataUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
        });
        assert.equal(completed.statusCode, 200, completed.body);
      } else {
        now = '2026-09-28T21:00:00.000Z';
      }
      hub.publish(['doctor-demo-001'], event('must-not-deliver'));
      hub.publish(['doctor-demo-001'], event('queued-must-not-deliver'));
      await stop.settled();
      assert.deepEqual(received, ['valid']);
      assert.equal(hub.active, 0, 'invalid sessions must be removed from the hub');
      hub.publish(['doctor-demo-001'], event('after-unsubscribe'));
      await stop.settled();
      assert.deepEqual(received, ['valid']);
    } finally {
      stop?.();
      await app.close();
    }
  });
}

test('rapid account switches keep only the newest subscription and ignore stale callbacks', async () => {
  const pending = new Map<
    string,
    { emit: (event: SocialRealtimeEvent) => void; resolve: (stop: () => void) => void }
  >();
  const stops: string[] = [];
  const received: string[] = [];
  const controller = createRealtimeSessionController(
    (token, emit) => new Promise<() => void>((resolve) => pending.set(token, { emit, resolve })),
    (value) => received.push(value.occurredAt),
  );
  const first = controller.setSessionToken('first-token');
  const second = controller.setSessionToken('second-token');
  pending.get('second-token')!.resolve(() => stops.push('second'));
  assert.deepEqual(await second, { subscribed: true });
  pending.get('second-token')!.emit(event('second'));
  pending.get('first-token')!.emit(event('stale-before-resolution'));
  pending.get('first-token')!.resolve(() => stops.push('first'));
  assert.deepEqual(await first, { subscribed: false });
  pending.get('first-token')!.emit(event('stale-after-resolution'));
  pending.get('second-token')!.emit(event('still-second'));
  assert.deepEqual(received, ['second', 'still-second']);
  assert.deepEqual(stops, ['first']);

  const third = controller.setSessionToken('third-token');
  assert.deepEqual(stops, ['first', 'second']);
  assert.deepEqual(await controller.setSessionToken(null), { subscribed: false });
  pending.get('third-token')!.emit(event('signed-out'));
  pending.get('third-token')!.resolve(() => stops.push('third'));
  assert.deepEqual(await third, { subscribed: false });
  assert.deepEqual(stops, ['first', 'second', 'third']);
  assert.deepEqual(received, ['second', 'still-second']);
  controller.stop();
});
