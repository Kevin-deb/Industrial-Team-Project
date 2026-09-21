import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerificationMessage,
  SmtpEmailDelivery,
  smtpConfigured,
} from '../src/platform/smtp-email.js';

test('SMTP is enabled only with an explicit host and sender', () => {
  assert.equal(smtpConfigured({}), false);
  assert.equal(smtpConfigured({ CARELINK_SMTP_HOST: 'smtp.example.com' }), false);
  assert.equal(
    smtpConfigured({ CARELINK_SMTP_HOST: 'smtp.example.com', CARELINK_SMTP_FROM: 'no-reply@example.com' }),
    true,
  );
});

test('SMTP configuration rejects invalid ports before any connection is attempted', () => {
  assert.throws(
    () =>
      new SmtpEmailDelivery({
        CARELINK_SMTP_HOST: 'smtp.example.com',
        CARELINK_SMTP_FROM: 'no-reply@example.com',
        CARELINK_SMTP_PORT: '70000',
      }),
    /Invalid SMTP port/,
  );
});

test('verification mail is addressed to the registered user email', () => {
  const message = buildVerificationMessage({
    from: 'CareLink <hpppk@qq.com>',
    email: 'registered.doctor@example.com',
    code: '246810',
    expiresAt: '2026-09-21T12:00:00.000Z',
  });

  assert.equal(message.from, 'CareLink <hpppk@qq.com>');
  assert.equal(message.to, 'registered.doctor@example.com');
});
