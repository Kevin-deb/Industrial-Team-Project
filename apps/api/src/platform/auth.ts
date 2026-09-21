import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'INVALID_EMAIL_CODE'
  | 'EMAIL_CODE_EXPIRED'
  | 'EMAIL_CODE_USED'
  | 'PHOTO_CHECK_REQUIRED'
  | 'CURRENT_PASSWORD_INVALID'
  | 'WEAK_PASSWORD';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}

export interface EmailDeliveryPort {
  sendVerificationCode(input: { email: string; code: string; expiresAt: string }): Promise<void>;
}

export function hashSecret(secret: string, salt = randomBytes(16).toString('hex')): string {
  const digest = scryptSync(secret, salt, 32).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifySecret(secret: string, encoded: string): boolean {
  const [algorithm, salt, digest] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const actual = scryptSync(secret, salt, 32);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function addMinutes(value: string, minutes: number): string {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function addHours(value: string, hours: number): string {
  return new Date(new Date(value).getTime() + hours * 3_600_000).toISOString();
}

type Row = Record<string, unknown>;

export class SqliteAuthRepository {
  constructor(private readonly db: DatabaseSync) {}

  findUser(account: string): Row | undefined {
    return this.db
      .prepare(
        `SELECT u.*,d.enabled doctor_enabled,d.personnel_status,d.credential_status
         FROM users u JOIN doctors d ON d.identity_id=u.identity_id
         WHERE lower(u.username)=lower(?) OR lower(u.email)=lower(?)`,
      )
      .get(account.trim(), account.trim()) as Row | undefined;
  }

  updateLoginFailure(userId: string, failedCount: number, lockedUntil?: string) {
    this.db
      .prepare('UPDATE users SET failed_login_count=?,locked_until=?,updated_at=? WHERE id=?')
      .run(failedCount, lockedUntil ?? null, new Date().toISOString(), userId);
  }

  clearLoginFailures(userId: string, at: string) {
    this.db
      .prepare('UPDATE users SET failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?')
      .run(at, userId);
  }

  createChallenge(input: {
    id: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
    purpose?: string;
  }) {
    this.db
      .prepare(
        'INSERT INTO email_challenges(id,user_id,code_hash,expires_at,created_at,purpose) VALUES(?,?,?,?,?,?)',
      )
      .run(input.id, input.userId, input.codeHash, input.expiresAt, input.createdAt, input.purpose ?? 'login');
  }

  findUserById(id: string): Row | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as Row | undefined;
  }

  findChallenge(id: string): Row | undefined {
    return this.db.prepare('SELECT * FROM email_challenges WHERE id=?').get(id) as Row | undefined;
  }

  challengeEmail(id: string): string | undefined {
    const row = this.db
      .prepare('SELECT u.email FROM email_challenges c JOIN users u ON u.id=c.user_id WHERE c.id=?')
      .get(id) as Row | undefined;
    return row ? String(row.email) : undefined;
  }

  incrementChallengeAttempt(id: string) {
    this.db.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE id=?').run(id);
  }

  consumeChallenge(id: string, consumedAt: string, ticketHash: string, ticketExpiresAt: string) {
    this.db
      .prepare(
        `UPDATE email_challenges SET consumed_at=?,photo_ticket_hash=?,photo_ticket_expires_at=?
         WHERE id=? AND consumed_at IS NULL`,
      )
      .run(consumedAt, ticketHash, ticketExpiresAt, id);
  }

  markChallengeConsumed(id: string, consumedAt: string) {
    this.db.prepare('UPDATE email_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(consumedAt, id);
  }

  updatePassword(userId: string, passwordHash: string, at: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE users SET password_hash=?,failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?').run(passwordHash, at, userId);
      this.db.prepare('UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(at, userId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  findPhotoTicket(hash: string, now: string): Row | undefined {
    return this.db
      .prepare(
        `SELECT c.*,u.identity_id FROM email_challenges c JOIN users u ON u.id=c.user_id
         WHERE c.photo_ticket_hash=? AND c.consumed_at IS NOT NULL AND c.photo_ticket_expires_at>?`,
      )
      .get(hash, now) as Row | undefined;
  }

  consumePhotoTicketAndCreateSession(input: {
    challengeId: string;
    userId: string;
    photoObjectKey: string;
    captureMethod: 'camera' | 'upload';
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
  }): string {
    const photoId = randomUUID();
    const sessionId = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO identity_photo_checks(id,user_id,photo_object_key,capture_method,checked_at)
           VALUES(?,?,?,?,?)`,
        )
        .run(photoId, input.userId, input.photoObjectKey, input.captureMethod, input.createdAt);
      this.db
        .prepare(
          `INSERT INTO user_sessions(id,user_id,token_hash,created_at,last_used_at,expires_at,photo_check_id)
           VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          sessionId,
          input.userId,
          input.tokenHash,
          input.createdAt,
          input.createdAt,
          input.expiresAt,
          photoId,
        );
      this.db.prepare('UPDATE email_challenges SET photo_ticket_hash=NULL WHERE id=?').run(input.challengeId);
      this.db.exec('COMMIT');
      return sessionId;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  authenticate(hash: string, now: string): Row | undefined {
    return this.db
      .prepare(
        `SELECT s.id session_id,s.user_id,s.expires_at,u.identity_id
         FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN doctors d ON d.identity_id=u.identity_id
         WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
           AND u.status='active' AND d.enabled=1 AND d.personnel_status='verified' AND d.credential_status='verified'`,
      )
      .get(hash, now) as Row | undefined;
  }

  touchSession(sessionId: string, at: string) {
    this.db.prepare('UPDATE user_sessions SET last_used_at=? WHERE id=?').run(at, sessionId);
  }

  revoke(hash: string, at: string): boolean {
    return (
      this.db
        .prepare('UPDATE user_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL')
        .run(at, hash).changes > 0
    );
  }
}

export class AuthService {
  private readonly now: () => string;
  private readonly randomToken: () => string;
  private readonly randomCode: () => string;
  private readonly audit?: (event: { actorId: string; action: string; outcome: 'success' | 'denied'; targetId: string }) => void;

  constructor(
    private readonly repository: SqliteAuthRepository,
    private readonly email: EmailDeliveryPort,
    options: {
      now?: () => string;
      randomToken?: () => string;
      randomCode?: () => string;
      audit?: (event: { actorId: string; action: string; outcome: 'success' | 'denied'; targetId: string }) => void;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
    this.randomCode = options.randomCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
    this.audit = options.audit;
  }

  async beginLogin(input: { account: string; password: string }) {
    const at = this.now();
    const user = this.repository.findUser(input.account);
    if (
      !user ||
      user.status !== 'active' ||
      Number(user.doctor_enabled) !== 1 ||
      user.personnel_status !== 'verified' ||
      user.credential_status !== 'verified' ||
      (user.locked_until && String(user.locked_until) > at) ||
      !verifySecret(input.password, String(user.password_hash))
    ) {
      if (user) {
        const count = Number(user.failed_login_count) + 1;
        this.repository.updateLoginFailure(
          String(user.id),
          count,
          count >= 5 ? addMinutes(at, 15) : undefined,
        );
        this.audit?.({ actorId: String(user.identity_id), action: 'auth.login', outcome: 'denied', targetId: String(user.id) });
      }
      throw new AuthError('INVALID_CREDENTIALS');
    }
    this.repository.clearLoginFailures(String(user.id), at);
    const challengeId = this.randomToken();
    const code = this.randomCode();
    const expiresAt = addMinutes(at, 10);
    this.repository.createChallenge({
      id: challengeId,
      userId: String(user.id),
      codeHash: hashSecret(code),
      expiresAt,
      createdAt: at,
    });
    await this.email.sendVerificationCode({ email: String(user.email), code, expiresAt });
    this.audit?.({ actorId: String(user.identity_id), action: 'auth.email.challenge', outcome: 'success', targetId: String(user.id) });
    const [local, domain] = String(user.email).split('@');
    return { challengeId, emailHint: `${local[0]}***@${domain}`, expiresAt };
  }

  beginPhotoLogin(input: { account: string }) {
    const at = this.now();
    const user = this.repository.findUser(input.account);
    if (
      !user ||
      user.status !== 'active' ||
      Number(user.doctor_enabled) !== 1 ||
      user.personnel_status !== 'verified' ||
      user.credential_status !== 'verified'
    ) {
      throw new AuthError('INVALID_CREDENTIALS');
    }
    const challengeId = this.randomToken();
    const photoTicket = this.randomToken();
    const expiresAt = addMinutes(at, 10);
    this.repository.createChallenge({
      id: challengeId,
      userId: String(user.id),
      codeHash: hashSecret(this.randomCode()),
      expiresAt,
      createdAt: at,
      purpose: 'login:photo',
    });
    this.repository.consumeChallenge(challengeId, at, tokenHash(photoTicket), expiresAt);
    this.audit?.({
      actorId: String(user.identity_id),
      action: 'auth.photo.challenge',
      outcome: 'success',
      targetId: String(user.id),
    });
    return { photoTicket, expiresAt, demoOnly: true as const };
  }

  async beginPasswordOperation(input: {
    account?: string;
    sessionToken?: string;
    currentPassword?: string;
    method: 'email' | 'photo';
    purpose: 'change-password' | 'recover-password';
  }) {
    const at = this.now();
    let user: Row | undefined;
    if (input.purpose === 'change-password') {
      const session = this.authenticate(input.sessionToken ?? '');
      user = session ? this.repository.findUserById(session.userId) : undefined;
      if (!user || !verifySecret(input.currentPassword ?? '', String(user.password_hash)))
        throw new AuthError('CURRENT_PASSWORD_INVALID');
    } else {
      user = input.account ? this.repository.findUser(input.account) : undefined;
      if (!user || user.status !== 'active') throw new AuthError('INVALID_CREDENTIALS');
    }
    const challengeId = this.randomToken();
    const code = this.randomCode();
    const expiresAt = addMinutes(at, 10);
    this.repository.createChallenge({
      id: challengeId,
      userId: String(user.id),
      codeHash: hashSecret(code),
      expiresAt,
      createdAt: at,
      purpose: `${input.purpose}:${input.method}`,
    });
    if (input.method === 'email')
      await this.email.sendVerificationCode({ email: String(user.email), code, expiresAt });
    const [local, domain] = String(user.email).split('@');
    return { challengeId, method: input.method, emailHint: `${local[0]}***@${domain}`, expiresAt };
  }

  completePasswordOperation(input: {
    challengeId: string;
    purpose: 'change-password' | 'recover-password';
    code?: string;
    photoAccepted?: boolean;
    newPassword: string;
  }) {
    const at = this.now();
    const challenge = this.repository.findChallenge(input.challengeId);
    if (!challenge || !String(challenge.purpose).startsWith(`${input.purpose}:`))
      throw new AuthError('INVALID_EMAIL_CODE');
    if (challenge.consumed_at) throw new AuthError('EMAIL_CODE_USED');
    if (String(challenge.expires_at) <= at) throw new AuthError('EMAIL_CODE_EXPIRED');
    const method = String(challenge.purpose).split(':')[1];
    if (method === 'email') {
      if (Number(challenge.attempts) >= 5 || !verifySecret(input.code ?? '', String(challenge.code_hash))) {
        this.repository.incrementChallengeAttempt(input.challengeId);
        throw new AuthError('INVALID_EMAIL_CODE');
      }
    } else if (!input.photoAccepted) throw new AuthError('PHOTO_CHECK_REQUIRED');
    validateNewPassword(input.newPassword);
    const user = this.repository.findUserById(String(challenge.user_id));
    if (!user || verifySecret(input.newPassword, String(user.password_hash))) throw new AuthError('WEAK_PASSWORD');
    this.repository.markChallengeConsumed(input.challengeId, at);
    this.repository.updatePassword(String(challenge.user_id), hashSecret(input.newPassword), at);
    this.audit?.({ actorId: String(user.identity_id), action: `auth.${input.purpose}`, outcome: 'success', targetId: String(user.id) });
    return { changed: true as const, sessionsRevoked: true as const };
  }

  verifyEmail(input: { challengeId: string; code: string }) {
    const at = this.now();
    const challenge = this.repository.findChallenge(input.challengeId);
    if (!challenge) throw new AuthError('INVALID_EMAIL_CODE');
    if (challenge.consumed_at) throw new AuthError('EMAIL_CODE_USED');
    if (String(challenge.expires_at) <= at) throw new AuthError('EMAIL_CODE_EXPIRED');
    if (Number(challenge.attempts) >= 5 || !verifySecret(input.code, String(challenge.code_hash))) {
      this.repository.incrementChallengeAttempt(input.challengeId);
      throw new AuthError('INVALID_EMAIL_CODE');
    }
    const photoTicket = this.randomToken();
    const expiresAt = addMinutes(at, 10);
    this.repository.consumeChallenge(input.challengeId, at, tokenHash(photoTicket), expiresAt);
    return { photoTicket, expiresAt, demoOnly: true as const };
  }

  challengeEmail(challengeId: string) {
    return this.repository.challengeEmail(challengeId);
  }

  completePhotoCheck(input: {
    ticket: string;
    photoObjectKey: string;
    captureMethod: 'camera' | 'upload';
  }) {
    const at = this.now();
    const ticket = this.repository.findPhotoTicket(tokenHash(input.ticket), at);
    if (!ticket) throw new AuthError('PHOTO_CHECK_REQUIRED');
    const token = this.randomToken();
    const expiresAt = addHours(at, 12);
    const sessionId = this.repository.consumePhotoTicketAndCreateSession({
      challengeId: String(ticket.id),
      userId: String(ticket.user_id),
      photoObjectKey: input.photoObjectKey,
      captureMethod: input.captureMethod,
      tokenHash: tokenHash(token),
      createdAt: at,
      expiresAt,
    });
    this.audit?.({ actorId: String(ticket.identity_id), action: 'auth.login', outcome: 'success', targetId: sessionId });
    return { token, sessionId, expiresAt, identityId: String(ticket.identity_id) };
  }

  authenticate(token: string) {
    if (!token) return undefined;
    const at = this.now();
    const row = this.repository.authenticate(tokenHash(token), at);
    if (!row) return undefined;
    this.repository.touchSession(String(row.session_id), at);
    return {
      sessionId: String(row.session_id),
      userId: String(row.user_id),
      identityId: String(row.identity_id),
      expiresAt: String(row.expires_at),
    };
  }

  logout(token: string) {
    const session = this.authenticate(token);
    const revoked = this.repository.revoke(tokenHash(token), this.now());
    if (revoked && session)
      this.audit?.({ actorId: session.identityId, action: 'auth.logout', outcome: 'success', targetId: session.sessionId });
    return revoked;
  }
}

export function validateNewPassword(password: string) {
  if (
    password.length < 10 ||
    password.length > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password) ||
    /123456|password|qwerty/i.test(password)
  )
    throw new AuthError('WEAK_PASSWORD');
}
