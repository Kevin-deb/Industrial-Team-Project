import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  DemoNotificationReceipt,
  DoctorNotificationPreferences,
  ReminderTask,
} from '@doctor/contracts';
import type { HealthNotificationPort } from '../health/index.js';
import { patientScopeSql, type RequestContext } from './access.js';

/** A real durable local test inbox; no external SMS/email delivery is claimed. */
export class LocalDemoNotifications implements HealthNotificationPort {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => string,
  ) {}
  async send(task: ReminderTask, options: { idempotencyKey: string }) {
    const existing = this.db
      .prepare('SELECT id FROM platform_demo_deliveries WHERE reminder_id=?')
      .get(task.id);
    if (existing) return { providerMessageId: String(existing.id) };
    const body =
      task.templateId === 'followup-demo'
        ? '您有一条随访提醒，请与负责医生确认后续随访安排。'
        : task.templateId === 'health-record-demo'
          ? '请按既定健康计划记录本次健康数据，并在需要时联系负责医生。'
          : null;
    if (!body) throw new Error('Unsupported local reminder template');
    const id = 'LOCAL-' + randomUUID();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO platform_demo_deliveries
      (id,reminder_id,patient_id,channel,template_id,body,idempotency_key,delivered_at)
      VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        task.id,
        task.patientId,
        task.channel,
        task.templateId,
        body,
        options.idempotencyKey,
        this.now(),
      );
    const saved = this.db
      .prepare('SELECT id FROM platform_demo_deliveries WHERE reminder_id=?')
      .get(task.id)!;
    return { providerMessageId: String(saved.id) };
  }
  list(context: RequestContext): DemoNotificationReceipt[] {
    return this.db
      .prepare(
        `SELECT d.* FROM platform_demo_deliveries d
      JOIN patients p ON p.id=d.patient_id WHERE ${patientScopeSql}
      ORDER BY julianday(d.delivered_at) DESC,d.id DESC LIMIT 100`,
      )
      .all({ ...context })
      .map((row) => ({
        id: String(row.id),
        reminderId: String(row.reminder_id),
        patientId: String(row.patient_id),
        channel: row.channel as DemoNotificationReceipt['channel'],
        templateId: String(row.template_id),
        body: String(row.body),
        deliveredAt: String(row.delivered_at),
        mode: 'local-test' as const,
      }));
  }
}
export function isQuietTime(preferences: DoctorNotificationPreferences, now: string): boolean {
  if (!preferences.quietHours) return false;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(now));
  const { quietStart: from, quietEnd: to } = preferences;
  if (from === to) return true;
  return from < to ? time >= from && time < to : time >= from || time < to;
}
