import type { DatabaseSync } from 'node:sqlite';
import type {
  Encounter,
  Consultation,
  EncounterAvailabilityWindow,
  EncounterClinicalBrief,
  EncounterContext,
  EncounterHistoryRecord,
  EncounterMessage,
  EncounterNotice,
  SavedEncounterRecord,
} from '@doctor/contracts';
import { patientScopeSql, type RequestContext } from '../platform/index.js';

export interface ConsultationTask {
  id: string;
  patientId: string;
  status: Consultation['status'];
  completedAt: string | null;
  requestedBy: string;
  isParticipant: boolean;
}

export interface EncounterRepository {
  list(context: RequestContext): Encounter[];
  context(id: string, context: RequestContext): EncounterContext | undefined;
  addMessage(
    id: string,
    input: { body: string; imageUrl?: string; imageName?: string },
    context: RequestContext,
  ): EncounterMessage | undefined;
  complete(
    id: string,
    input: { mode: 'text' | 'video'; messageCount: number; audioSaved: boolean; videoSaved: boolean },
    context: RequestContext,
  ): SavedEncounterRecord | undefined;
  listAvailability(context: RequestContext): EncounterAvailabilityWindow[];
  createAvailability(
    input: Omit<EncounterAvailabilityWindow, 'id' | 'booked'>,
    context: RequestContext,
  ): EncounterAvailabilityWindow;
  updateAvailabilityCapacity(
    id: string,
    capacity: number,
    context: RequestContext,
  ): EncounterAvailabilityWindow | undefined;
  listNotices(context: RequestContext): EncounterNotice[];
  createNotice(
    input: { encounterId: string; kind: EncounterNotice['kind']; content: string; proposedScheduledAt?: string },
    context: RequestContext,
  ): EncounterNotice | undefined;
  acceptNotice(id: string, context: RequestContext): EncounterNotice | undefined;
  listConsultations(context: RequestContext): Consultation[];
  findReference(id: string, context: RequestContext): { id: string; patientId: string } | undefined;
  findConsultationTask(id: string, context: RequestContext): ConsultationTask | undefined;
  findConfirmedReport(
    consultationId: string,
    reportId: string,
    context: RequestContext,
  ): { id: string } | undefined;
}
export class SqliteEncounterRepository implements EncounterRepository {
  constructor(private readonly db: DatabaseSync) {}
  list(context: RequestContext): Encounter[] {
    return this.db
      .prepare(
        `SELECT e.*,p.name patient_name FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE ${patientScopeSql} ORDER BY e.scheduled_at`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        type: r.type as Encounter['type'],
        status: r.status as Encounter['status'],
        scheduledAt: String(r.scheduled_at),
        reason: String(r.reason),
        durationMinutes: Number(r.duration_minutes),
      }));
  }

  context(id: string, context: RequestContext): EncounterContext | undefined {
    const encounter = this.findEncounterRow(id, context);
    if (!encounter) return undefined;
    return {
      brief: this.brief(id, String(encounter.reason)),
      historyRecords: this.historyRecords(String(encounter.patient_id)),
      savedRecords: this.savedRecords(id),
      messages: this.messages(id),
    };
  }

  addMessage(
    id: string,
    input: { body: string; imageUrl?: string; imageName?: string },
    context: RequestContext,
  ): EncounterMessage | undefined {
    const encounter = this.findEncounterRow(id, context);
    if (!encounter || String(encounter.status) === 'completed') return undefined;
    const message = {
      id: `MSG-${id}-${Date.now()}`,
      sender: 'doctor' as const,
      body: input.body,
      sentAt: context.now,
      imageUrl: input.imageUrl,
      imageName: input.imageName,
    };
    this.db
      .prepare(
        `INSERT INTO encounter_messages(
          id,encounter_id,sender_identity_id,sender_patient_id,body,sent_at,sender_role,image_url,image_name
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        message.id,
        id,
        context.actorId,
        null,
        message.body,
        message.sentAt,
        message.sender,
        message.imageUrl ?? null,
        message.imageName ?? null,
      );
    return message;
  }

  complete(
    id: string,
    input: { mode: 'text' | 'video'; messageCount: number; audioSaved: boolean; videoSaved: boolean },
    context: RequestContext,
  ): SavedEncounterRecord | undefined {
    const encounter = this.findEncounterRow(id, context);
    if (!encounter) return undefined;
    const existing = this.db
      .prepare('SELECT * FROM encounter_saved_records WHERE encounter_id=? ORDER BY saved_at DESC LIMIT 1')
      .get(id);
    this.db.prepare("UPDATE encounters SET status='completed',ended_at=? WHERE id=?").run(context.now, id);
    if (existing) return this.mapSavedRecord(existing);
    const record: SavedEncounterRecord = {
      id: `ESR-${id}-${Date.now()}`,
      title: '本次问诊记录',
      savedAt: context.now,
      mode: input.mode,
      messageCount: input.messageCount,
      audioSaved: input.audioSaved,
      videoSaved: input.videoSaved,
    };
    this.db
      .prepare(
        `INSERT INTO encounter_saved_records(
          id,encounter_id,title,saved_at,mode,message_count,audio_saved,video_saved
        ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        record.id,
        id,
        record.title,
        record.savedAt,
        record.mode,
        record.messageCount,
        record.audioSaved ? 1 : 0,
        record.videoSaved ? 1 : 0,
      );
    return record;
  }

  listAvailability(context: RequestContext): EncounterAvailabilityWindow[] {
    return this.db
      .prepare(
        `SELECT * FROM encounter_availability_windows
         WHERE doctor_id=:actorId ORDER BY window_date,start_time,id`,
      )
      .all({ actorId: context.actorId })
      .map((row) => this.mapAvailability(row));
  }

  createAvailability(
    input: Omit<EncounterAvailabilityWindow, 'id' | 'booked'>,
    context: RequestContext,
  ): EncounterAvailabilityWindow {
    const id = `AW-${Date.now()}`;
    this.db
      .prepare(
        `INSERT INTO encounter_availability_windows(
          id,doctor_id,window_date,type,start_time,end_time,capacity,booked
        ) VALUES(?,?,?,?,?,?,?,0)`,
      )
      .run(id, context.actorId, input.date, input.type, input.start, input.end, input.capacity);
    return {
      id,
      date: input.date,
      type: input.type,
      start: input.start,
      end: input.end,
      capacity: input.capacity,
      booked: 0,
    };
  }

  updateAvailabilityCapacity(
    id: string,
    capacity: number,
    context: RequestContext,
  ): EncounterAvailabilityWindow | undefined {
    const row = this.db
      .prepare('SELECT * FROM encounter_availability_windows WHERE id=? AND doctor_id=?')
      .get(id, context.actorId);
    if (!row || capacity < Number(row.booked)) return undefined;
    this.db.prepare('UPDATE encounter_availability_windows SET capacity=? WHERE id=?').run(capacity, id);
    return this.mapAvailability({ ...row, capacity });
  }

  listNotices(context: RequestContext): EncounterNotice[] {
    return this.db
      .prepare(
        `SELECT n.*,p.name patient_name FROM encounter_notices n
         JOIN encounters e ON e.id=n.encounter_id
         JOIN patients p ON p.id=e.patient_id
         WHERE ${patientScopeSql}
         ORDER BY n.created_at DESC,n.id`,
      )
      .all({ ...context })
      .map((row) => this.mapNotice(row));
  }

  createNotice(
    input: { encounterId: string; kind: EncounterNotice['kind']; content: string; proposedScheduledAt?: string },
    context: RequestContext,
  ): EncounterNotice | undefined {
    const encounter = this.findEncounterRow(input.encounterId, context);
    if (!encounter || String(encounter.status) === 'completed') return undefined;
    const id = `NOTICE-${Date.now()}`;
    const status = input.kind === '改期通知' ? '待患者确认' : '已发送';
    this.db
      .prepare(
        `INSERT INTO encounter_notices(
          id,encounter_id,kind,content,status,proposed_scheduled_at,created_at
        ) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.encounterId,
        input.kind,
        input.content,
        status,
        input.proposedScheduledAt ?? null,
        context.now,
      );
    const row = this.db
      .prepare(
        `SELECT n.*,p.name patient_name FROM encounter_notices n
         JOIN encounters e ON e.id=n.encounter_id
         JOIN patients p ON p.id=e.patient_id WHERE n.id=?`,
      )
      .get(id)!;
    return this.mapNotice(row);
  }

  acceptNotice(id: string, context: RequestContext): EncounterNotice | undefined {
    const row = this.db
      .prepare(
        `SELECT n.*,e.patient_id,p.name patient_name FROM encounter_notices n
         JOIN encounters e ON e.id=n.encounter_id
         JOIN patients p ON p.id=e.patient_id
         WHERE n.id=:id AND n.kind='改期通知' AND n.status='待患者确认' AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
    if (!row) return undefined;
    if (row.proposed_scheduled_at)
      this.db
        .prepare("UPDATE encounters SET scheduled_at=?,status='waiting' WHERE id=?")
        .run(String(row.proposed_scheduled_at), String(row.encounter_id));
    this.db
      .prepare("UPDATE encounter_notices SET status='患者已接受',content=content || ' 平台已自动调整接诊时段。' WHERE id=?")
      .run(id);
    return this.mapNotice({ ...row, status: '患者已接受', content: `${row.content} 平台已自动调整接诊时段。` });
  }
  listConsultations(context: RequestContext): Consultation[] {
    return this.db
      .prepare(
        `SELECT c.*,p.name patient_name FROM consultations c JOIN patients p ON p.id=c.patient_id WHERE ${patientScopeSql} ORDER BY c.scheduled_at`,
      )
      .all({ ...context })
      .map((r) => ({
        id: String(r.id),
        patientId: String(r.patient_id),
        patientName: String(r.patient_name),
        title: String(r.title),
        specialty: String(r.specialty),
        status: r.status as Consultation['status'],
        scheduledAt: String(r.scheduled_at),
        summary: String(r.summary),
        participants: this.db
          .prepare(
            'SELECT i.display_name FROM consultation_participants cp JOIN identities i ON i.id=cp.identity_id WHERE cp.consultation_id=? ORDER BY i.id',
          )
          .all(String(r.id))
          .map((p) => String(p.display_name)),
      }));
  }

  findReference(id: string, context: RequestContext) {
    const row = this.db
      .prepare(
        `SELECT e.id,e.patient_id FROM encounters e JOIN patients p ON p.id=e.patient_id
         WHERE e.id=:id AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
    return row ? { id: String(row.id), patientId: String(row.patient_id) } : undefined;
  }

  findConsultationTask(id: string, context: RequestContext): ConsultationTask | undefined {
    const row = this.db
      .prepare(
        `SELECT c.id,c.patient_id,c.status,c.completed_at,c.requested_by,
          (EXISTS(
            SELECT 1 FROM consultation_participants cp
            WHERE cp.consultation_id=c.id AND cp.identity_id=:actorId
          ) OR c.requested_by=:actorId) is_participant
         FROM consultations c JOIN patients p ON p.id=c.patient_id
         WHERE c.id=:id AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
    if (!row) return undefined;
    return {
      id: String(row.id),
      patientId: String(row.patient_id),
      status: row.status as Consultation['status'],
      completedAt: row.completed_at === null ? null : String(row.completed_at),
      requestedBy: String(row.requested_by),
      isParticipant: Number(row.is_participant) === 1,
    };
  }

  findConfirmedReport(
    consultationId: string,
    reportId: string,
    context: RequestContext,
  ): { id: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT r.id FROM consultation_reports r
         JOIN consultations c ON c.id=r.consultation_id
         JOIN patients p ON p.id=c.patient_id
         WHERE r.consultation_id=:consultationId AND r.id=:reportId AND r.status='confirmed'
           AND ${patientScopeSql}`,
      )
      .get({ consultationId, reportId, ...context });
    return row ? { id: String(row.id) } : undefined;
  }

  private findEncounterRow(id: string, context: RequestContext) {
    return this.db
      .prepare(
        `SELECT e.*,p.name patient_name FROM encounters e JOIN patients p ON p.id=e.patient_id
         WHERE e.id=:id AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
  }

  private brief(encounterId: string, reason: string): EncounterClinicalBrief {
    const row = this.db
      .prepare('SELECT * FROM encounter_clinical_briefs WHERE encounter_id=?')
      .get(encounterId);
    if (!row)
      return {
        chiefComplaint: reason,
        presentIllness: '患者已提交在线问诊资料，详细病情需进入诊间后进一步核对。',
        pastHistory: '暂无补充记录。',
        surgicalHistory: '暂无补充记录。',
        medicationHistory: '暂无补充记录。',
        allergyHistory: '暂无补充记录。',
      };
    return {
      chiefComplaint: String(row.chief_complaint),
      presentIllness: String(row.present_illness),
      pastHistory: String(row.past_history),
      surgicalHistory: String(row.surgical_history),
      medicationHistory: String(row.medication_history),
      allergyHistory: String(row.allergy_history),
    };
  }

  private historyRecords(patientId: string): EncounterHistoryRecord[] {
    return this.db
      .prepare(
        `SELECT r.id,r.title,r.updated_at,i.department,r.diagnosis,r.status
         FROM medical_records r
         JOIN identities i ON i.id=r.author_id
         WHERE r.patient_id=?
         ORDER BY r.updated_at DESC,r.id`,
      )
      .all(patientId)
      .map((row) => ({
        id: String(row.id),
        title: String(row.title),
        date: String(row.updated_at),
        department: String(row.department),
        diagnosis: String(row.diagnosis),
        outcome: `电子病历状态：${this.recordStatusLabel(String(row.status))}`,
      }));
  }

  private recordStatusLabel(status: string): string {
    if (status === 'draft') return '草稿';
    if (status === 'pending-review') return '待审核';
    if (status === 'archived') return '已归档';
    return status;
  }

  private savedRecords(encounterId: string): SavedEncounterRecord[] {
    return this.db
      .prepare('SELECT * FROM encounter_saved_records WHERE encounter_id=? ORDER BY saved_at DESC,id')
      .all(encounterId)
      .map((row) => this.mapSavedRecord(row));
  }

  private messages(encounterId: string): EncounterMessage[] {
    return this.db
      .prepare('SELECT * FROM encounter_messages WHERE encounter_id=? ORDER BY sent_at,id')
      .all(encounterId)
      .map((row) => ({
        id: String(row.id),
        sender: String(row.sender_role) as EncounterMessage['sender'],
        body: String(row.body),
        sentAt: String(row.sent_at),
        imageUrl: row.image_url === null ? undefined : String(row.image_url),
        imageName: row.image_name === null ? undefined : String(row.image_name),
      }));
  }

  private mapSavedRecord(row: Record<string, unknown>): SavedEncounterRecord {
    return {
      id: String(row.id),
      title: String(row.title),
      savedAt: String(row.saved_at),
      mode: String(row.mode) as SavedEncounterRecord['mode'],
      messageCount: Number(row.message_count),
      audioSaved: Number(row.audio_saved) === 1,
      videoSaved: Number(row.video_saved) === 1,
    };
  }

  private mapAvailability(row: Record<string, unknown>): EncounterAvailabilityWindow {
    return {
      id: String(row.id),
      date: String(row.window_date),
      type: String(row.type) as EncounterAvailabilityWindow['type'],
      start: String(row.start_time),
      end: String(row.end_time),
      capacity: Number(row.capacity),
      booked: Number(row.booked),
    };
  }

  private mapNotice(row: Record<string, unknown>): EncounterNotice {
    return {
      id: String(row.id),
      encounterId: String(row.encounter_id),
      patientName: String(row.patient_name),
      kind: String(row.kind) as EncounterNotice['kind'],
      content: String(row.content),
      status: String(row.status) as EncounterNotice['status'],
      createdAt: String(row.created_at),
    };
  }
}
