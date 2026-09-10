import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Patient, PatientQuery } from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';

export interface PatientRepository {
  list(
    query: PatientQuery,
    context: RequestContext,
  ): { items: Patient[]; total: number; page: number; pageSize: number };
  findById(id: string, context: RequestContext): Patient | undefined;
}
type Row = Record<string, SQLOutput>;
type SQLOutput = string | number | bigint | null | Uint8Array;
function map(row: Row): Patient {
  return {
    id: String(row.id),
    name: String(row.name),
    gender: row.gender as Patient['gender'],
    age: Number(row.age),
    phone: String(row.phone),
    diagnosis: String(row.diagnosis),
    tags: JSON.parse(String(row.tags_json)) as string[],
    status: row.status as Patient['status'],
    lastVisit: String(row.last_visit),
    nextFollowUp: String(row.next_follow_up),
    assignedDoctorId: String(row.assigned_doctor_id),
    allergies: JSON.parse(String(row.allergies_json)) as string[],
    medicalHistory: JSON.parse(String(row.medical_history_json)) as string[],
    careSummary: String(row.care_summary),
  };
}
export class SqlitePatientRepository implements PatientRepository {
  constructor(private readonly db: DatabaseSync) {}
  list(query: PatientQuery, context: RequestContext) {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const conditions = [patientScopeSql];
    const params: Record<string, SQLInputValue> = { ...context };
    if (query.q) {
      conditions.push(
        "instr(lower(p.name || ' ' || p.id || ' ' || p.medical_history_json || ' ' || p.care_summary),lower(:q))>0",
      );
      params.q = query.q.trim();
    }
    if (query.status) {
      conditions.push('p.status=:status');
      params.status = query.status;
    }
    if (query.disease) {
      conditions.push('instr(lower(p.diagnosis),lower(:disease))>0');
      params.disease = query.disease.trim();
    }
    const where = conditions.join(' AND ');
    const total = Number(
      this.db.prepare('SELECT COUNT(*) AS total FROM patients p WHERE ' + where).get(params)!.total,
    );
    const items = this.db
      .prepare(
        'SELECT p.* FROM patients p WHERE ' + where + ' ORDER BY p.id LIMIT :limit OFFSET :offset',
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
      .map(map);
    return { items, total, page, pageSize };
  }
  findById(id: string, context: RequestContext): Patient | undefined {
    const row = this.db
      .prepare('SELECT p.* FROM patients p WHERE p.id=:id AND ' + patientScopeSql)
      .get({ ...context, id });
    return row ? map(row) : undefined;
  }
}
