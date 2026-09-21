import type { DatabaseSync } from 'node:sqlite';
import type {
  Encounter,
  Consultation,
  ConsultationContext,
  ConsultationDoctorOption,
  ConsultationMaterial,
  ConsultationMessage,
  ConsultationParticipant,
  ConsultationReport,
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
  consultationContext(id: string, context: RequestContext): ConsultationContext | undefined;
  listConsultationDoctors(query: string, context: RequestContext): ConsultationDoctorOption[];
  createConsultation(
    input: {
      patientId: string;
      title: string;
      specialty: string;
      scheduledAt: string;
      summary: string;
      participantIds: string[];
      materials: string[];
    },
    context: RequestContext,
  ): Consultation | undefined;
  acceptConsultation(id: string, context: RequestContext): Consultation | undefined;
  addConsultationMessage(
    id: string,
    input: { body: string; imageUrl?: string; imageName?: string },
    context: RequestContext,
  ): ConsultationMessage | undefined;
  addConsultationMaterial(
    id: string,
    input: { title: string; description?: string; fileName?: string; objectUrl?: string },
    context: RequestContext,
  ): ConsultationMaterial | undefined;
  deleteConsultationMaterial(id: string, materialId: string, context: RequestContext): boolean;
  completeConsultation(id: string, context: RequestContext): ConsultationReport | undefined;
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
        `SELECT c.*,p.name patient_name FROM consultations c JOIN patients p ON p.id=c.patient_id
         WHERE ${patientScopeSql}
           AND (
             c.requested_by=:actorId OR EXISTS (
               SELECT 1 FROM consultation_participants cp
               WHERE cp.consultation_id=c.id AND cp.identity_id=:actorId
             )
           )
         ORDER BY c.scheduled_at`,
      )
      .all({ ...context })
      .map((row) => this.mapConsultation(row, context));
  }

  consultationContext(id: string, context: RequestContext): ConsultationContext | undefined {
    const row = this.findConsultationRow(id, context);
    if (!row) return undefined;
    const consultation = this.mapConsultation(row, context);
    return {
      consultation,
      participants: this.consultationParticipants(id),
      materials: this.consultationMaterials(id),
      messages: this.consultationMessages(id),
      report: this.consultationReport(id),
      access: '按本次会诊任务共享必要资料',
      accessUntil: String(row.scheduled_at),
    };
  }

  listConsultationDoctors(query: string, context: RequestContext): ConsultationDoctorOption[] {
    const pattern = `%${query.trim()}%`;
    return this.db
      .prepare(
        `SELECT id,display_name,title,department FROM identities
         WHERE id<>:actorId AND (:query='' OR display_name LIKE :pattern OR department LIKE :pattern OR title LIKE :pattern)
         ORDER BY department,display_name LIMIT 20`,
      )
      .all({ actorId: context.actorId, query: query.trim(), pattern })
      .map((row) => ({
        id: String(row.id),
        name: String(row.display_name),
        title: String(row.title),
        department: String(row.department),
      }));
  }

  createConsultation(
    input: {
      patientId: string;
      title: string;
      specialty: string;
      scheduledAt: string;
      summary: string;
      participantIds: string[];
      materials: string[];
    },
    context: RequestContext,
  ): Consultation | undefined {
    const patient = this.db
      .prepare(`SELECT p.id,p.name FROM patients p WHERE p.id=:patientId AND ${patientScopeSql}`)
      .get({ patientId: input.patientId, ...context });
    if (!patient) return undefined;
    const id = `CON-${Date.now()}`;
    const participants = Array.from(new Set([context.actorId, ...input.participantIds])).filter(Boolean);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'INSERT INTO consultations(id,patient_id,requested_by,title,specialty,status,scheduled_at,summary) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(id, input.patientId, context.actorId, input.title, input.specialty, 'requested', input.scheduledAt, input.summary);
      for (const participantId of participants)
        this.db
          .prepare('INSERT OR IGNORE INTO consultation_participants(consultation_id,identity_id,participant_role) VALUES(?,?,?)')
          .run(id, participantId, participantId === context.actorId ? 'requester' : 'expert');
      input.materials.forEach((material, index) => {
        this.db
          .prepare(
            `INSERT INTO consultation_material_uploads(
              id,consultation_id,title,description,file_name,uploaded_by,uploaded_at
            ) VALUES(?,?,?,?,?,?,?)`,
          )
          .run(
            `CMU-${id}-${index + 1}`,
            id,
            material,
            '发起会诊时上传的患者资料。',
            material,
            context.actorId,
            context.now,
          );
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.mapConsultation(
      {
        id,
        patient_id: input.patientId,
        patient_name: String(patient.name),
        requested_by: context.actorId,
        title: input.title,
        specialty: input.specialty,
        status: 'requested',
        scheduled_at: input.scheduledAt,
        summary: input.summary,
      },
      context,
    );
  }

  acceptConsultation(id: string, context: RequestContext): Consultation | undefined {
    const row = this.findConsultationRow(id, context);
    if (!row || String(row.status) === 'completed') return undefined;
    this.db.prepare("UPDATE consultations SET status='scheduled' WHERE id=?").run(id);
    this.db
      .prepare('UPDATE consultation_participants SET joined_at=? WHERE consultation_id=? AND identity_id=?')
      .run(context.now, id, context.actorId);
    return this.mapConsultation({ ...row, status: 'scheduled' }, context);
  }

  addConsultationMessage(
    id: string,
    input: { body: string; imageUrl?: string; imageName?: string },
    context: RequestContext,
  ): ConsultationMessage | undefined {
    const row = this.findConsultationRow(id, context);
    if (!row || String(row.status) === 'requested' || String(row.status) === 'completed') return undefined;
    const message = {
      id: `CMSG-${id}-${Date.now()}`,
      authorId: context.actorId,
      authorName: this.identityName(context.actorId),
      body: input.body,
      sentAt: context.now,
      imageUrl: input.imageUrl,
      imageName: input.imageName,
    };
    this.db
      .prepare(
        'INSERT INTO consultation_messages(id,consultation_id,sender_identity_id,body,sent_at,image_url,image_name) VALUES(?,?,?,?,?,?,?)',
      )
      .run(message.id, id, context.actorId, message.body, message.sentAt, message.imageUrl ?? null, message.imageName ?? null);
    return message;
  }

  addConsultationMaterial(
    id: string,
    input: { title: string; description?: string; fileName?: string; objectUrl?: string },
    context: RequestContext,
  ): ConsultationMaterial | undefined {
    const row = this.findConsultationRow(id, context);
    if (!row || String(row.status) === 'requested' || String(row.status) === 'completed') return undefined;
    const material = {
      id: `CMU-${id}-${Date.now()}`,
      title: input.title,
      description: input.description ?? '会诊过程中补充上传的资料。',
      fileName: input.fileName ?? input.title,
      uploadedAt: context.now,
    };
    this.db
      .prepare(
        `INSERT INTO consultation_material_uploads(
          id,consultation_id,title,description,file_name,object_url,uploaded_by,uploaded_at
        ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        material.id,
        id,
        material.title,
        material.description,
        material.fileName,
        input.objectUrl ?? null,
        context.actorId,
        material.uploadedAt,
      );
    return material;
  }

  deleteConsultationMaterial(id: string, materialId: string, context: RequestContext): boolean {
    const row = this.findConsultationRow(id, context);
    if (!row || String(row.status) === 'requested' || String(row.status) === 'completed') return false;
    const upload = this.db
      .prepare('SELECT 1 FROM consultation_material_uploads WHERE id=? AND consultation_id=?')
      .get(materialId, id);
    if (upload) {
      this.db.prepare('DELETE FROM consultation_material_uploads WHERE id=? AND consultation_id=?').run(materialId, id);
      return true;
    }
    const material = this.db
      .prepare('SELECT 1 FROM clinical_materials WHERE id=? AND consultation_id=?')
      .get(materialId, id);
    if (!material) return false;
    this.db.prepare('DELETE FROM clinical_materials WHERE id=? AND consultation_id=?').run(materialId, id);
    return true;
  }

  completeConsultation(id: string, context: RequestContext): ConsultationReport | undefined {
    const row = this.findConsultationRow(id, context);
    if (!row || String(row.status) === 'requested') return undefined;
    const existing = this.consultationReport(id);
    this.db.prepare("UPDATE consultations SET status='completed',completed_at=? WHERE id=?").run(context.now, id);
    if (existing) return existing;
    const report: ConsultationReport = {
      id: `CR-${id}-${Date.now()}`,
      body: '系统已根据会诊材料和实时讨论生成会诊意见：建议结合患者近期指标、既往病史与当前用药，形成分阶段诊疗和随访计划。联合会诊报告已生成待审核。',
      status: 'confirmed',
      createdAt: context.now,
    };
    this.db
      .prepare(
        `INSERT INTO consultation_reports(
          id,consultation_id,version,body_json,status,confirmed_by,confirmed_at,created_at
        ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        report.id,
        id,
        1,
        JSON.stringify({ body: report.body }),
        report.status,
        context.actorId,
        context.now,
        report.createdAt,
      );
    return report;
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

  private findConsultationRow(id: string, context: RequestContext) {
    return this.db
      .prepare(
        `SELECT c.*,p.name patient_name FROM consultations c JOIN patients p ON p.id=c.patient_id
         WHERE c.id=:id AND ${patientScopeSql}`,
      )
      .get({ id, ...context });
  }

  private mapConsultation(row: Record<string, unknown>, context: RequestContext): Consultation {
    const id = String(row.id);
    return {
      id,
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      title: String(row.title),
      specialty: String(row.specialty),
      status: row.status as Consultation['status'],
      scheduledAt: String(row.scheduled_at),
      summary: String(row.summary),
      participants: this.consultationParticipants(id).map((participant) => participant.name),
      direction: String(row.requested_by) === context.actorId ? 'sent' : 'received',
    };
  }

  private consultationParticipants(id: string): ConsultationParticipant[] {
    return this.db
      .prepare(
        `SELECT i.id,i.display_name,i.title,i.department,cp.participant_role
         FROM consultation_participants cp JOIN identities i ON i.id=cp.identity_id
         WHERE cp.consultation_id=? ORDER BY cp.participant_role DESC,i.id`,
      )
      .all(id)
      .map((row) => ({
        id: String(row.id),
        name: String(row.display_name),
        title: String(row.title),
        department: String(row.department),
        role: String(row.participant_role),
      }));
  }

  private consultationMaterials(id: string): ConsultationMaterial[] {
    const uploads = this.db
      .prepare('SELECT * FROM consultation_material_uploads WHERE consultation_id=? ORDER BY uploaded_at,id')
      .all(id)
      .map((row) => ({
        id: String(row.id),
        title: String(row.title),
        description: String(row.description),
        fileName: String(row.file_name),
        uploadedAt: String(row.uploaded_at),
        objectUrl: row.object_url === null ? undefined : String(row.object_url),
      }));
    const recordMaterials = this.db
      .prepare(
        `SELECT m.*,r.title record_title,r.diagnosis
         FROM clinical_materials m
         JOIN medical_records r ON r.id=m.record_id
         WHERE m.consultation_id=?
         ORDER BY m.created_at DESC,m.id`,
      )
      .all(id)
      .map((row) => ({
        id: String(row.id),
        title: `电子病历：${String(row.record_title)} v${Number(row.record_version)}`,
        description: `${String(row.purpose)}；共享区段：${(JSON.parse(String(row.shared_sections_json)) as string[]).join('、')}`,
        fileName: `${String(row.record_id)}-v${Number(row.record_version)}.txt`,
        uploadedAt: String(row.created_at),
      }));
    return [...recordMaterials, ...uploads].sort((left, right) =>
      left.uploadedAt === right.uploadedAt
        ? left.id.localeCompare(right.id)
        : left.uploadedAt.localeCompare(right.uploadedAt),
    );
  }

  private consultationMessages(id: string): ConsultationMessage[] {
    return this.db
      .prepare(
        `SELECT m.*,i.display_name FROM consultation_messages m
         JOIN identities i ON i.id=m.sender_identity_id
         WHERE m.consultation_id=? ORDER BY m.sent_at,m.id`,
      )
      .all(id)
      .map((row) => ({
        id: String(row.id),
        authorId: String(row.sender_identity_id),
        authorName: String(row.display_name),
        body: String(row.body),
        sentAt: String(row.sent_at),
        imageUrl: row.image_url === null ? undefined : String(row.image_url),
        imageName: row.image_name === null ? undefined : String(row.image_name),
      }));
  }

  private consultationReport(id: string): ConsultationReport | null {
    const row = this.db
      .prepare('SELECT * FROM consultation_reports WHERE consultation_id=? ORDER BY version DESC LIMIT 1')
      .get(id);
    if (!row) return null;
    let body = String(row.body_json);
    try {
      const parsed = JSON.parse(body) as { body?: string; conclusion?: string };
      body = parsed.body ?? parsed.conclusion ?? body;
    } catch {
      // Legacy demo records may contain plain text instead of JSON.
    }
    return {
      id: String(row.id),
      body,
      status: String(row.status) as ConsultationReport['status'],
      createdAt: String(row.created_at),
    };
  }

  private identityName(id: string): string {
    const row = this.db.prepare('SELECT display_name FROM identities WHERE id=?').get(id);
    return row ? String(row.display_name) : '我';
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
