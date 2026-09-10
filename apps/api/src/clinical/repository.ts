import type { DatabaseSync } from 'node:sqlite';
import type { MedicalRecord } from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';
export interface ClinicalRepository {
  listRecords(context: RequestContext): MedicalRecord[];
}
export class SqliteClinicalRepository implements ClinicalRepository {
  constructor(private readonly db: DatabaseSync) {}
  listRecords(context: RequestContext): MedicalRecord[] {
    return this.db
      .prepare(
        `SELECT r.*,p.name patient_name,i.display_name author_name,
      (SELECT COUNT(*) FROM medical_orders o WHERE o.record_id=r.id) order_count
      FROM medical_records r JOIN patients p ON p.id=r.patient_id JOIN identities i ON i.id=r.author_id
      WHERE ${patientScopeSql} ORDER BY r.updated_at DESC`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        title: String(r.title),
        diagnosis: String(r.diagnosis),
        status: r.status as MedicalRecord['status'],
        authorName: String(r.author_name),
        updatedAt: String(r.updated_at),
        version: Number(r.version),
        orderCount: Number(r.order_count),
      }));
  }
}
