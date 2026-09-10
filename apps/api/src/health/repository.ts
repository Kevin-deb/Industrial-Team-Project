import type { DatabaseSync } from 'node:sqlite';
import type { Observation, HealthAlert, CarePlan, HealthOverview } from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';

export interface HealthRepository {
  overview(context: RequestContext): HealthOverview;
}
export class SqliteHealthRepository implements HealthRepository {
  constructor(private readonly db: DatabaseSync) {}
  overview(context: RequestContext): HealthOverview {
    const observations: Observation[] = this.db
      .prepare(
        `SELECT o.* FROM health_observations o JOIN patients p ON p.id=o.patient_id WHERE ${patientScopeSql} ORDER BY o.measured_at,o.id`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        metric: r.metric as Observation['metric'],
        value: Number(r.value),
        unit: String(r.unit),
        measuredAt: String(r.measured_at),
        receivedAt: String(r.received_at),
        source: 'synthetic-demo',
        sourceLabel: String(r.source_label),
      }));
    const alerts: HealthAlert[] = this.db
      .prepare(
        `SELECT a.*,p.name patient_name FROM health_alerts a JOIN patients p ON p.id=a.patient_id WHERE ${patientScopeSql} ORDER BY a.measured_at DESC`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        metric: String(r.metric),
        value: String(r.value),
        severity: r.severity as HealthAlert['severity'],
        measuredAt: String(r.measured_at),
        sourceLabel: String(r.source_label),
        description: String(r.description),
      }));
    const carePlans: CarePlan[] = this.db
      .prepare(
        `SELECT cp.*,p.name patient_name FROM care_plans cp JOIN patients p ON p.id=cp.patient_id WHERE ${patientScopeSql} ORDER BY cp.id`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        title: String(r.title),
        status: r.status as CarePlan['status'],
        goals: JSON.parse(String(r.goals_json)) as string[],
        nextReview: String(r.next_review),
        completionPercent: Number(r.completion_percent),
      }));
    const remindersPlanned = Number(
      this.db
        .prepare(
          `SELECT COUNT(*) count FROM reminder_tasks r JOIN patients p ON p.id=r.patient_id WHERE ${patientScopeSql} AND r.status='planned'`,
        )
        .get({ ...context })!.count,
    );
    return {
      observations,
      alerts,
      carePlans,
      summary: {
        monitoredPatients: new Set(observations.map((o) => o.patientId)).size,
        activePlans: carePlans.filter((p) => p.status === 'active').length,
        needsReview: alerts.length,
        remindersPlanned,
      },
    };
  }
}
