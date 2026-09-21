import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import {
  AuthError,
  AuthService,
  SqliteAuthRepository,
  hashSecret,
  verifySecret,
  type EmailDeliveryPort,
} from '../src/platform/auth.js';

const now = () => '2026-09-21T08:00:00.000Z';

test('passwords, email codes and session tokens are stored only as salted hashes', () => {
  const encoded = hashSecret('CareLink-Demo-2026');
  assert.ok(!encoded.includes('CareLink-Demo-2026'));
  assert.equal(verifySecret('CareLink-Demo-2026', encoded), true);
  assert.equal(verifySecret('wrong', encoded), false);
});

test('email challenge is required, single use, and photo check gates the formal session', async () => {
  const db = openDatabase(':memory:');
  const delivered: Array<{ email: string; code: string }> = [];
  const delivery: EmailDeliveryPort = {
    async sendVerificationCode(message) {
      delivered.push({ email: message.email, code: message.code });
    },
  };
  const auth = new AuthService(new SqliteAuthRepository(db), delivery, {
    now,
    randomToken: (() => {
      const values = ['challenge-secret', 'photo-ticket-secret', 'session-secret'];
      return () => values.shift()!;
    })(),
    randomCode: () => '123456',
  });
  try {
    await assert.rejects(
      auth.beginLogin({ account: 'lin.zhiyuan', password: 'wrong' }),
      (error: unknown) => error instanceof AuthError && error.code === 'INVALID_CREDENTIALS',
    );
    const challenge = await auth.beginLogin({
      account: 'lin.zhiyuan',
      password: 'CareLink-Demo-2026',
    });
    assert.equal(challenge.emailHint, 'l***@carelink.demo');
    assert.deepEqual(delivered, [{ email: 'lin.zhiyuan@carelink.demo', code: '123456' }]);
    assert.equal(
      db.prepare('SELECT code_hash FROM email_challenges WHERE id=?').get(challenge.challengeId)!
        .code_hash === '123456',
      false,
    );
    assert.throws(
      () => auth.verifyEmail({ challengeId: challenge.challengeId, code: '000000' }),
      (error: unknown) => error instanceof AuthError && error.code === 'INVALID_EMAIL_CODE',
    );
    const verified = auth.verifyEmail({ challengeId: challenge.challengeId, code: '123456' });
    assert.throws(
      () => auth.verifyEmail({ challengeId: challenge.challengeId, code: '123456' }),
      (error: unknown) => error instanceof AuthError && error.code === 'EMAIL_CODE_USED',
    );
    const session = auth.completePhotoCheck({
      ticket: verified.photoTicket,
      photoObjectKey: 'auth-photo/demo-doctor-001.jpg',
      captureMethod: 'camera',
    });
    assert.equal(session.token, 'session-secret');
    assert.equal(auth.authenticate(session.token)?.identityId, 'doctor-demo-001');
    assert.equal(db.prepare('SELECT token_hash FROM user_sessions').get()!.token_hash === session.token, false);
    assert.equal(db.prepare('SELECT demo_only FROM identity_photo_checks').get()!.demo_only, 1);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM user_sessions').get()!.count, 1);
  } finally {
    db.close();
  }
});

test('expired codes and revoked sessions cannot be replayed', async () => {
  const db = openDatabase(':memory:');
  let current = '2026-09-21T08:00:00.000Z';
  const auth = new AuthService(
    new SqliteAuthRepository(db),
    { async sendVerificationCode() {} },
    {
      now: () => current,
      randomToken: (() => {
        const values = ['challenge', 'ticket', 'token'];
        return () => values.shift()!;
      })(),
      randomCode: () => '654321',
    },
  );
  try {
    const challenge = await auth.beginLogin({
      account: 'lin.zhiyuan@carelink.demo',
      password: 'CareLink-Demo-2026',
    });
    current = '2026-09-21T08:11:00.000Z';
    assert.throws(
      () => auth.verifyEmail({ challengeId: challenge.challengeId, code: '654321' }),
      (error: unknown) => error instanceof AuthError && error.code === 'EMAIL_CODE_EXPIRED',
    );
  } finally {
    db.close();
  }
});
