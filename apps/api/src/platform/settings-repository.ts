import type { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
  type DoctorNotificationPreferences,
  type DoctorProfile,
  type UpdateDoctorProfileInput,
} from '@doctor/contracts';
import type { RequestContext } from './access.js';
import { SqlitePlatformRepository } from './repository.js';

export class SettingsProfileNotFound extends Error {}
export class InvalidSettingsInput extends Error {}

export class SqliteSettingsRepository {
  private readonly audit: SqlitePlatformRepository;

  constructor(private readonly db: DatabaseSync) {
    this.audit = new SqlitePlatformRepository(db);
  }

  profile(actorId: string): DoctorProfile {
    const row = this.db
      .prepare(
        `SELECT d.identity_id,d.phone,d.specialty,d.outpatient_location,d.bio,d.updated_at,
              u.email,u.email_verified_at
       FROM doctors d JOIN users u ON u.identity_id=d.identity_id WHERE d.identity_id=?`,
      )
      .get(actorId);
    if (!row) throw new SettingsProfileNotFound();
    return {
      identityId: String(row.identity_id),
      email: String(row.email),
      emailVerifiedAt: row.email_verified_at ? String(row.email_verified_at) : null,
      phone: String(row.phone),
      specialty: String(row.specialty),
      outpatientLocation: String(row.outpatient_location),
      bio: String(row.bio),
      updatedAt: String(row.updated_at),
    };
  }

  updateProfile(input: UpdateDoctorProfileInput, context: RequestContext): DoctorProfile {
    const next = {
      phone: input.phone.trim(),
      specialty: input.specialty.trim(),
      outpatientLocation: input.outpatientLocation.trim(),
      bio: input.bio.trim(),
    };
    if (
      (next.phone && !/^[0-9+\-\s]{6,20}$/.test(next.phone)) ||
      !next.specialty ||
      next.specialty.length > 120 ||
      next.outpatientLocation.length > 200 ||
      next.bio.length > 2000
    )
      throw new InvalidSettingsInput('请检查联系电话、专业方向和资料长度。');
    this.profile(context.actorId);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `UPDATE doctors SET phone=?,specialty=?,outpatient_location=?,bio=?,updated_at=?
         WHERE identity_id=?`,
        )
        .run(
          next.phone,
          next.specialty,
          next.outpatientLocation,
          next.bio,
          context.now,
          context.actorId,
        );
      this.record(context.actorId, 'settings.profile.update');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.profile(context.actorId);
  }

  notificationPreferences(actorId: string): DoctorNotificationPreferences {
    this.profile(actorId);
    const row = this.db
      .prepare('SELECT * FROM doctor_notification_preferences WHERE identity_id=?')
      .get(actorId);
    if (!row) return { ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES };
    return {
      encounter: row.encounter === 1,
      followUp: row.follow_up === 1,
      browser: row.browser === 1,
      quietHours: row.quiet_hours === 1,
      quietStart: String(row.quiet_start),
      quietEnd: String(row.quiet_end),
    };
  }

  updateNotificationPreferences(
    input: DoctorNotificationPreferences,
    context: RequestContext,
  ): DoctorNotificationPreferences {
    if (
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.quietStart) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.quietEnd) ||
      [input.encounter, input.followUp, input.browser, input.quietHours].some(
        (value) => typeof value !== 'boolean',
      )
    )
      throw new InvalidSettingsInput('请检查通知开关和免打扰时间。');
    this.profile(context.actorId);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO doctor_notification_preferences(
          identity_id,encounter,follow_up,browser,quiet_hours,quiet_start,quiet_end,updated_at
        ) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(identity_id) DO UPDATE SET
          encounter=excluded.encounter,follow_up=excluded.follow_up,browser=excluded.browser,
          quiet_hours=excluded.quiet_hours,quiet_start=excluded.quiet_start,
          quiet_end=excluded.quiet_end,updated_at=excluded.updated_at`,
        )
        .run(
          context.actorId,
          Number(input.encounter),
          Number(input.followUp),
          Number(input.browser),
          Number(input.quietHours),
          input.quietStart,
          input.quietEnd,
          context.now,
        );
      this.record(context.actorId, 'settings.notifications.update');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.notificationPreferences(context.actorId);
  }

  private record(actorId: string, action: string) {
    this.audit.recordAccess({
      actorId,
      action,
      targetType: 'doctor_settings',
      targetId: actorId,
      outcome: 'success',
      description: 'Doctor settings updated; profile content omitted.',
    });
  }
}
