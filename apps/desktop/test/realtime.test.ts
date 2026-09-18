import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../api/src/app.js';
import { SocialRealtimeHub } from '../../api/src/social/index.js';
import { subscribeCurrentDoctor } from '../src/realtime.js';

test('desktop IPC subscribes to A session doctor instead of a hard-coded demo doctor', async () => {
  const hub = new SocialRealtimeHub();
  const app = await createApp({ identity: { actorId: 'doctor-demo-002' }, socialRealtime: hub });
  const events: string[] = [];
  const stop = await subscribeCurrentDoctor(app, hub, (event) => events.push(event.occurredAt));
  try {
    hub.publish(['doctor-demo-001'], { type: 'social.notifications.changed', occurredAt: 'wrong' });
    hub.publish(['doctor-demo-002'], { type: 'social.notifications.changed', occurredAt: 'right' });
    assert.deepEqual(events, ['right']);
    stop();
    hub.publish(['doctor-demo-002'], {
      type: 'social.notifications.changed',
      occurredAt: 'closed',
    });
    assert.deepEqual(events, ['right']);
  } finally {
    stop();
    await app.close();
  }
});
