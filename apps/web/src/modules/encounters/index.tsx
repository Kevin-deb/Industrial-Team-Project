import { useI18n } from '../../shared/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  History,
  ImagePlus,
  Mic,
  MessageSquare,
  Plus,
  PhoneCall,
  PhoneOff,
  Search,
  Send,
  Square,
  Video,
  X,
} from 'lucide-react';
import type {
  CreateMedicalRecordRequest,
  Encounter,
  EncounterAvailabilityWindow,
  EncounterContext,
  EncounterNotice,
  EncounterMessage as ApiEncounterMessage,
  MedicalRecordDetail,
  MedicalRecordTemplateDefinition,
  MedicalRecordTemplateId,
} from '@doctor/contracts';
import { requestApi, useApi } from '../../shared/api';
import { Badge, Button, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  Metric,
  PersonAvatar,
  ReadOnlyNote,
} from '../ui';

type EncounterDisplayStatus = 'waiting' | 'active' | 'completed';
const textServiceWindowMs = 48 * 60 * 60 * 1000;
const statuses: Record<EncounterDisplayStatus, string> = {
  waiting: '待接诊',
  active: '接诊中',
  completed: '已完成',
};
const tones: Record<EncounterDisplayStatus, 'amber' | 'blue' | 'teal'> = {
  waiting: 'amber',
  active: 'blue',
  completed: 'teal',
};
function encounterDisplayStatus(encounter: Encounter, nowMs = Date.now()): EncounterDisplayStatus {
  if (encounter.status === 'completed') return 'completed';
  if (encounter.type === 'text') {
    const start = Date.parse(encounter.scheduledAt);
    if (Number.isFinite(start) && nowMs >= start && nowMs <= start + textServiceWindowMs) {
      return 'active';
    }
  }
  return 'waiting';
}
type ClinicalBrief = {
  chiefComplaint: string;
  presentIllness: string;
  pastHistory: string;
  surgicalHistory: string;
  medicationHistory: string;
  allergyHistory: string;
};
type HistoryRecord = {
  id: string;
  title: string;
  date: string;
  department: string;
  diagnosis: string;
  outcome: string;
};
type SavedEncounterRecord = {
  id: string;
  title: string;
  savedAt: string;
  mode: 'text' | 'video';
  messageCount: number;
  audioSaved: boolean;
  videoSaved: boolean;
};
type AvailabilityWindow = EncounterAvailabilityWindow;
type NoticeLog = EncounterNotice;

function emptyClinicalBrief(encounter: Encounter): ClinicalBrief {
  return {
    chiefComplaint: encounter.reason,
    presentIllness: '正在加载患者提交的问诊资料。',
    pastHistory: '正在加载',
    surgicalHistory: '正在加载',
    medicationHistory: '正在加载',
    allergyHistory: '正在加载',
  };
}

function addMinutes(value: string, minutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function encounterDate(
  encounter: Encounter,
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string,
) {
  return formatDate(encounter.scheduledAt, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function encounterTime(
  encounter: Encounter,
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string,
) {
  if (encounter.type === 'text') return '48h';
  const end = addMinutes(encounter.scheduledAt, encounter.durationMinutes);
  return `${formatDate(encounter.scheduledAt, {
    hour: '2-digit',
    minute: '2-digit',
  })}-${formatDate(end, { hour: '2-digit', minute: '2-digit' })}`;
}

type RoomMessage = {
  id: string;
  sender: 'patient' | 'doctor' | 'system';
  body: string;
  time: string;
  imageUrl?: string;
  imageName?: string;
};

function roomMessageFromApi(
  message: ApiEncounterMessage,
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string,
): RoomMessage {
  return {
    id: message.id,
    sender: message.sender,
    body: message.body,
    imageUrl: message.imageUrl,
    imageName: message.imageName,
    time: formatDate(message.sentAt, { hour: '2-digit', minute: '2-digit' }),
  };
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ClinicalSummary({ brief }: { brief: ClinicalBrief }) {
  const { t } = useI18n();
  return (
    <section className="encounter-clinical-summary">
      <h4>{t('患者信息')}</h4>
      <dl>
        {[
          ['主诉', brief.chiefComplaint],
          ['现病史', brief.presentIllness],
          ['既往病史', brief.pastHistory],
          ['手术史', brief.surgicalHistory],
          ['用药史', brief.medicationHistory],
          ['过敏史', brief.allergyHistory],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{t(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function emptyRecordBody(template: MedicalRecordTemplateDefinition) {
  return Object.fromEntries(template.fields.map((field) => [field.key, ''])) as Record<string, string>;
}

function bodyFromBrief(template: MedicalRecordTemplateDefinition, brief: ClinicalBrief, encounter: Encounter) {
  const body = emptyRecordBody(template);
  if (template.id === 'outpatient') {
    body.chiefComplaint = brief.chiefComplaint;
    body.presentIllness = brief.presentIllness;
    body.medicalAndAllergyHistory = [
      `既往史：${brief.pastHistory}`,
      `手术史：${brief.surgicalHistory}`,
      `用药史：${brief.medicationHistory}`,
      `过敏史：${brief.allergyHistory}`,
    ].join('\n');
    body.examinationAndInvestigations = '在线问诊资料待医生补充，必要时建议线下查体或完善辅助检查。';
    body.assessmentAndPlan = `围绕“${encounter.reason}”继续评估，结合沟通记录完善诊疗计划。`;
  } else if (template.id === 'followup') {
    body.followUpPurpose = encounter.reason;
    body.healthMonitoringData = '患者通过在线诊疗提交资料，待医生结合健康数据补充。';
    body.currentMedicationAndAdherence = brief.medicationHistory;
    body.lifestyleAndCare = '生活方式与照护情况待问诊过程中补充。';
    body.nextFollowUpArrangement = '根据本次问诊结果安排后续随访。';
  } else if (template.id === 'consult') {
    body.consultationRequestAndPurpose = encounter.reason;
    body.participatingClinicians = '在线诊疗医生';
    body.caseSummary = `${brief.chiefComplaint}\n${brief.presentIllness}`;
    body.discussionNotes = '诊间沟通后补充。';
    body.combinedOpinionAndNextSteps = '待医生形成综合意见。';
  }
  return body;
}

function EncounterRecordDialog({
  encounter,
  brief,
  onClose,
  onSaved,
}: {
  encounter: Encounter;
  brief: ClinicalBrief;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { data: templates, loading, error } = useApi<MedicalRecordTemplateDefinition[]>('/record-templates');
  const [templateId, setTemplateId] = useState<MedicalRecordTemplateId>('outpatient');
  const [title, setTitle] = useState(`${encounter.patientName}在线问诊病历`);
  const [diagnosis, setDiagnosis] = useState(encounter.reason);
  const [body, setBody] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const template = templates?.find((item) => item.id === templateId) ?? templates?.[0];

  useEffect(() => {
    if (!template || Object.keys(body).length) return;
    setTemplateId(template.id);
    setBody(bodyFromBrief(template, brief, encounter));
  }, [body, brief, encounter, template]);

  function changeTemplate(nextId: MedicalRecordTemplateId) {
    const nextTemplate = templates?.find((item) => item.id === nextId);
    if (!nextTemplate) return;
    setTemplateId(nextId);
    setBody(bodyFromBrief(nextTemplate, brief, encounter));
  }

  async function saveRecord() {
    if (!template) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload: CreateMedicalRecordRequest = {
        patientId: encounter.patientId,
        encounterId: encounter.id,
        templateId: template.id,
        title: title.trim(),
        diagnosis: diagnosis.trim(),
        body,
      };
      const saved = await requestApi<MedicalRecordDetail>('/records', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNotice({ tone: 'success', text: `病历已保存：${saved.data.id}` });
      onSaved();
    } catch (reason) {
      setNotice({
        tone: 'error',
        text: reason instanceof Error ? reason.message : '保存病历失败，请稍后重试。',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FeatureDialog
      title={t('开立电子病历')}
      subtitle={`${encounter.patientName} · ${encounter.id}`}
      onClose={onClose}
      wide
    >
      {loading || error || !template ? (
        <LoadingState error={error || (!loading ? '无法加载病历模板' : null)} />
      ) : (
        <form
          className="record-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRecord();
          }}
        >
          <div className="record-editor-grid">
            <label>
              <span>{t('患者')}</span>
              <input value={`${encounter.patientName} · ${encounter.patientId}`} disabled readOnly />
            </label>
            <label>
              <span>{t('关联问诊')}</span>
              <input value={`${encounter.id} · ${encounter.reason}`} disabled readOnly />
            </label>
            <label>
              <span>{t('病历模板')}</span>
              <select
                aria-label={t('选择病历模板')}
                value={template.id}
                onChange={(event) => changeTemplate(event.target.value as MedicalRecordTemplateId)}
              >
                {(templates ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.titleKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('病历标题')}</span>
              <input
                aria-label={t('病历标题')}
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="record-editor-span">
              <span>{t('诊断')}</span>
              <input
                aria-label={t('诊断')}
                maxLength={200}
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
              />
            </label>
          </div>
          <div className="record-editor-fields">
            <div className="record-editor-section-title">
              <div>
                <strong>{t(template.titleKey)}</strong>
                <span>{t(template.subtitleKey)}</span>
              </div>
              <Badge tone="blue">{t('来自电子病历模板')}</Badge>
            </div>
            {template.fields.map((field) => (
              <label key={field.key}>
                <span>
                  {t(field.labelKey)}
                  {field.requiredOnSubmit ? t('（提交必填）') : ''}
                </span>
                <textarea
                  aria-label={t(field.labelKey)}
                  maxLength={field.maxLength}
                  rows={4}
                  value={body[field.key] ?? ''}
                  onChange={(event) =>
                    setBody((value) => ({ ...value, [field.key]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          {notice && (
            <div className={`record-editor-notice ${notice.tone}`} role="status">
              {t(notice.text)}
            </div>
          )}
          <div className="record-editor-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              {t('关闭')}
            </Button>
            <Button type="submit" disabled={saving || !title.trim() || !diagnosis.trim()}>
              <FileText size={16} />
              {t(saving ? '保存中' : '保存到电子病历')}
            </Button>
          </div>
        </form>
      )}
    </FeatureDialog>
  );
}

function EncounterDetailClinical({ encounter }: { encounter: Encounter }) {
  const { data } = useApi<EncounterContext>(`/encounters/${encodeURIComponent(encounter.id)}/context`);
  return <ClinicalSummary brief={data?.brief ?? emptyClinicalBrief(encounter)} />;
}

function PatientFolder({
  records,
  open,
  onToggle,
}: {
  records: HistoryRecord[];
  open: boolean;
  onToggle: () => void;
}) {
  const { t, formatDate } = useI18n();
  return (
    <section className="encounter-room-panel encounter-folder">
      <button className="encounter-panel-toggle" onClick={onToggle} aria-expanded={open}>
        <span>
          <FolderOpen size={16} />
          {t('病历夹')}
        </span>
        <Badge tone="slate">{records.length}</Badge>
      </button>
      {open && (
        <div className="encounter-history-list">
          {records.map((record) => (
            <article key={record.id}>
              <h4>{t(record.title)}</h4>
              <p>
                {formatDate(record.date)} · {t(record.department)}
              </p>
              <dl>
                <div>
                  <dt>{t('诊断')}</dt>
                  <dd>{t(record.diagnosis)}</dd>
                </div>
                <div>
                  <dt>{t('处理意见')}</dt>
                  <dd>{t(record.outcome)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SavedRecordsPanel({
  records,
  open,
  onToggle,
  onExport,
}: {
  records: SavedEncounterRecord[];
  open: boolean;
  onToggle: () => void;
  onExport: () => void;
}) {
  const { t, formatDate } = useI18n();
  return (
    <section className="encounter-room-panel encounter-folder">
      <button className="encounter-panel-toggle" onClick={onToggle} aria-expanded={open}>
        <span>
          <History size={16} />
          {t('历史问诊记录')}
        </span>
        <Badge tone={records.length ? 'teal' : 'slate'}>{records.length}</Badge>
      </button>
      {open && (
        <div className="encounter-saved-records">
          {records.length ? (
            <>
              {records.map((record) => (
                <article key={record.id}>
                  <h4>{t(record.title)}</h4>
                  <p>
                    {formatDate(record.savedAt, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                    {t(record.mode === 'video' ? '视频接诊' : '图文接诊')}
                  </p>
                  <span>
                    {t('消息 {count} 条', { count: record.messageCount })} ·{' '}
                    {record.audioSaved ? t('录音已留存') : t('未录音')} ·{' '}
                    {record.videoSaved ? t('录像已留存') : t('未录像')}
                  </span>
                </article>
              ))}
              <Button variant="secondary" onClick={onExport}>
                <Download size={15} />
                {t('导出记录')}
              </Button>
            </>
          ) : (
            <p>{t('结束问诊后，系统会自动保存本次问诊记录。')}</p>
          )}
        </div>
      )}
    </section>
  );
}

function AppointmentManagementDialog({
  encounters,
  nowMs,
  onClose,
  onRescheduleAccepted,
}: {
  encounters: Encounter[];
  nowMs: number;
  onClose: () => void;
  onRescheduleAccepted: (id: string) => void;
}) {
  const { t, formatDate } = useI18n();
  const availability = useApi<AvailabilityWindow[]>('/encounter-availability');
  const noticeData = useApi<NoticeLog[]>('/encounter-notices');
  const firstWaiting = encounters.find((item) => encounterDisplayStatus(item, nowMs) !== 'completed');
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [newWindow, setNewWindow] = useState({
    date: '2026-09-22',
    type: 'video' as Encounter['type'],
    start: '09:00',
    end: '09:20',
    capacity: 4,
  });
  const [selectedEncounterId, setSelectedEncounterId] = useState(firstWaiting?.id ?? '');
  const [nextDate, setNextDate] = useState('2026-09-22');
  const [nextTime, setNextTime] = useState('10:00');
  const [noticeText, setNoticeText] = useState('请患者在问诊前补充近期检查结果和当前用药。');
  const [noticeFeedback, setNoticeFeedback] = useState('');
  const [notices, setNotices] = useState<NoticeLog[]>([]);
  useEffect(() => {
    setWindows(availability.data ?? []);
  }, [availability.data]);
  useEffect(() => {
    setNotices(noticeData.data ?? []);
  }, [noticeData.data]);
  const selectedEncounter = encounters.find((item) => item.id === selectedEncounterId);
  const addWindow = useCallback(() => {
    void requestApi<AvailabilityWindow>('/encounter-availability', {
      method: 'POST',
      body: JSON.stringify(newWindow),
    }).then((response) => {
      setWindows((current) => [response.data, ...current]);
      availability.reload();
    });
  }, [newWindow]);
  const sendNotice = useCallback(
    (kind: NoticeLog['kind']) => {
      if (!selectedEncounter) return;
      const proposedScheduledAt = kind === '改期通知' ? `${nextDate}T${nextTime}:00+08:00` : undefined;
      void requestApi<NoticeLog>('/encounter-notices', {
        method: 'POST',
        body: JSON.stringify({
          encounterId: selectedEncounter.id,
          kind,
          content:
            kind === '改期通知'
              ? `建议改至 ${nextDate} ${nextTime}，等待患者确认。`
              : noticeText,
          proposedScheduledAt,
        }),
      }).then((response) => {
        setNotices((current) => [response.data, ...current]);
        noticeData.reload();
        if (kind !== '改期通知') setNoticeFeedback('已通知患者');
      });
    },
    [nextDate, nextTime, noticeData, noticeText, selectedEncounter],
  );
  useEffect(() => {
    if (!noticeFeedback) return undefined;
    const timer = window.setTimeout(() => setNoticeFeedback(''), 2600);
    return () => window.clearTimeout(timer);
  }, [noticeFeedback]);
  const acceptReschedule = useCallback(
    (notice: NoticeLog) => {
      void requestApi<NoticeLog>(`/encounter-notices/${encodeURIComponent(notice.id)}/accept`, {
        method: 'POST',
      }).then((response) => {
        setNotices((current) =>
          current.map((item) => (item.id === notice.id ? response.data : item)),
        );
        onRescheduleAccepted(response.data.encounterId);
        noticeData.reload();
      });
    },
    [noticeData, onRescheduleAccepted],
  );
  const pendingCount = encounters.filter(
    (item) => encounterDisplayStatus(item, nowMs) === 'waiting',
  ).length;
  const activeTextCount = encounters.filter(
    (item) => encounterDisplayStatus(item, nowMs) === 'active',
  ).length;
  return (
    <FeatureDialog
      title="预约管理"
      subtitle="管理可接诊时段、排班容量、患者提醒与改期确认"
      onClose={onClose}
      wide
    >
      <div className="appointment-manager">
        <div className="appointment-summary">
          <div>
            <span>{t('待接诊')}</span>
            <strong>{pendingCount}</strong>
          </div>
          <div>
            <span>{t('接诊中')}</span>
            <strong>{activeTextCount}</strong>
          </div>
          <div>
            <span>{t('今日可接诊容量')}</span>
            <strong>
              {windows
                .filter((item) => item.date === '2026-09-21')
                .reduce((total, item) => total + item.capacity, 0)}
            </strong>
          </div>
        </div>

        <section className="appointment-section">
          <div className="appointment-section-title">
            <h3>{t('设置可接诊时段')}</h3>
            <p>{t('医生只维护自己的可服务时间，不确认患者人选。')}</p>
          </div>
          <div className="appointment-form-row">
            <label>
              <span>{t('日期')}</span>
              <input
                type="date"
                value={newWindow.date}
                onChange={(event) => setNewWindow((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label>
              <span>{t('方式')}</span>
              <select
                value={newWindow.type}
                onChange={(event) =>
                  setNewWindow((current) => ({
                    ...current,
                    type: event.target.value as Encounter['type'],
                  }))
                }
              >
                <option value="text">{t('图文问诊')}</option>
                <option value="video">{t('视频问诊')}</option>
              </select>
            </label>
            <label>
              <span>{t('开始')}</span>
              <input
                type="time"
                value={newWindow.start}
                onChange={(event) => setNewWindow((current) => ({ ...current, start: event.target.value }))}
              />
            </label>
            <label>
              <span>{t('结束')}</span>
              <input
                type="time"
                value={newWindow.end}
                onChange={(event) => setNewWindow((current) => ({ ...current, end: event.target.value }))}
              />
            </label>
            <label>
              <span>{t('容量')}</span>
              <input
                type="number"
                min="1"
                max="20"
                value={newWindow.capacity}
                onChange={(event) =>
                  setNewWindow((current) => ({
                    ...current,
                    capacity: Number(event.target.value) || 1,
                  }))
                }
              />
            </label>
            <Button onClick={addWindow}>
              <Plus size={16} />
              {t('添加时段')}
            </Button>
          </div>
          <div className="appointment-window-list">
            {windows.map((window) => (
              <article key={window.id}>
                <div>
                  <strong>{formatDate(window.date)}</strong>
                  <span>
                    {window.start}-{window.end} ·{' '}
                    {window.type === 'video' ? t('视频问诊') : t('图文问诊')}
                  </span>
                </div>
                <label>
                  <span>{t('容量')}</span>
                  <input
                    type="number"
                    min={window.booked}
                    value={window.capacity}
                    onChange={(event) => {
                      const capacity = Math.max(window.booked, Number(event.target.value) || 1);
                      setWindows((current) =>
                        current.map((item) =>
                          item.id === window.id
                            ? { ...item, capacity }
                            : item,
                        ),
                      );
                      void requestApi<AvailabilityWindow>(
                        `/encounter-availability/${encodeURIComponent(window.id)}`,
                        {
                          method: 'PATCH',
                          body: JSON.stringify({ capacity }),
                        },
                      ).then(() => availability.reload());
                    }}
                  />
                </label>
                <Badge tone={window.booked >= window.capacity ? 'amber' : 'teal'}>
                  {t('已约 {booked}/{capacity}', {
                    booked: window.booked,
                    capacity: window.capacity,
                  })}
                </Badge>
              </article>
            ))}
          </div>
        </section>

        <section className="appointment-section">
          <div className="appointment-section-title">
            <h3>{t('查看预约排班')}</h3>
            <p>{t('按当前接诊队列展示图文 48h 窗口和视频固定时段。')}</p>
          </div>
          <div className="appointment-schedule-list">
            {encounters.slice(0, 8).map((encounter) => {
              const displayStatus = encounterDisplayStatus(encounter, nowMs);
              return (
                <article key={encounter.id}>
                  <div>
                    <strong>{encounter.patientName}</strong>
                    <span>
                      {encounter.id} ·{' '}
                      {encounter.type === 'video' ? t('视频问诊') : t('图文问诊')}
                    </span>
                  </div>
                  <span>
                    {encounterDate(encounter, formatDate)} · {encounterTime(encounter, formatDate)}
                  </span>
                  <Badge tone={tones[displayStatus]}>{t(statuses[displayStatus])}</Badge>
                </article>
              );
            })}
          </div>
        </section>

        <section className="appointment-section">
          <div className="appointment-section-title">
            <h3>{t('患者通知与改期')}</h3>
            <p>{t('医生发起通知，患者接受改期后平台自动更新时间。')}</p>
          </div>
          <div className="appointment-notice-grid">
            <label>
              <span>{t('选择接诊')}</span>
              <select
                value={selectedEncounterId}
                onChange={(event) => setSelectedEncounterId(event.target.value)}
              >
                {encounters
                  .filter((item) => encounterDisplayStatus(item, nowMs) !== 'completed')
                  .map((encounter) => (
                    <option value={encounter.id} key={encounter.id}>
                      {encounter.patientName} · {encounter.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="appointment-notice-text">
              <span>{t('提醒内容')}</span>
              <textarea
                value={noticeText}
                onChange={(event) => setNoticeText(event.target.value)}
              />
            </label>
            <div className="appointment-notice-actions">
              <Button
                className="appointment-notice-button appointment-notice-button--material"
                variant="secondary"
                onClick={() => sendNotice('资料提醒')}
              >
                {t('提醒补充资料')}
              </Button>
              <Button
                className="appointment-notice-button appointment-notice-button--entry"
                variant="secondary"
                onClick={() => sendNotice('按时进入提醒')}
              >
                {t('提醒按时进入')}
              </Button>
              {noticeFeedback && (
                <span className="appointment-notice-feedback">{t(noticeFeedback)}</span>
              )}
            </div>
            <div className="appointment-reschedule">
              <label>
                <span>{t('改期日期')}</span>
                <input
                  type="date"
                  value={nextDate}
                  onChange={(event) => setNextDate(event.target.value)}
                />
              </label>
              <label>
                <span>{t('改期时间')}</span>
                <input
                  type="time"
                  value={nextTime}
                  onChange={(event) => setNextTime(event.target.value)}
                />
              </label>
              <Button onClick={() => sendNotice('改期通知')}>{t('发送改期通知')}</Button>
            </div>
          </div>
          <div className="appointment-notice-list">
            {notices.map((notice) => (
              <article key={notice.id}>
                <div>
                  <strong>
                    {notice.patientName} · {t(notice.kind)}
                  </strong>
                  <p>{t(notice.content)}</p>
                </div>
                <div>
                  <Badge tone={notice.status === '患者已接受' ? 'teal' : 'amber'}>
                    {t(notice.status)}
                  </Badge>
                  {notice.kind === '改期通知' && notice.status === '待患者确认' && (
                    <Button variant="secondary" onClick={() => acceptReschedule(notice)}>
                      {t('模拟患者接受')}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </FeatureDialog>
  );
}

function EncounterRoom({
  encounter,
  savedRecords,
  onBack,
  onComplete,
}: {
  encounter: Encounter;
  savedRecords: SavedEncounterRecord[];
  onBack: () => void;
  onComplete: (id: string, record: SavedEncounterRecord) => void;
}) {
  const { t, formatDate } = useI18n();
  const roomContext = useApi<EncounterContext>(`/encounters/${encodeURIComponent(encounter.id)}/context`);
  const brief = roomContext.data?.brief ?? emptyClinicalBrief(encounter);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [callStarted, setCallStarted] = useState(false);
  const [folderOpen, setFolderOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name?: string } | null>(null);
  const [doctorStream, setDoctorStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const doctorVideoRef = useRef<HTMLVideoElement | null>(null);
  const doctorStreamRef = useRef<MediaStream | null>(null);
  const isVideo = encounter.type === 'video';
  const isCompleted = encounter.status === 'completed';
  const displayStatus = encounterDisplayStatus(encounter);
  const priorRecords = roomContext.data?.historyRecords ?? [];
  const roomSavedRecords = roomContext.data?.savedRecords ?? savedRecords;
  useEffect(() => {
    if (!roomContext.data) return;
    setMessages(roomContext.data.messages.map((message) => roomMessageFromApi(message, formatDate)));
  }, [formatDate, roomContext.data]);
  const playDoctorVideo = useCallback(
    (node: HTMLVideoElement | null = doctorVideoRef.current) => {
      if (!node || !doctorStream) return;
      if (node.srcObject !== doctorStream) {
        node.srcObject = doctorStream;
      }
      void node.play().catch(() => {
        setCameraError('摄像头已连接，请点击摄像头画面播放预览');
      });
    },
    [doctorStream],
  );
  const attachDoctorVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      doctorVideoRef.current = node;
      playDoctorVideo(node);
    },
    [playDoctorVideo],
  );
  useEffect(() => {
    playDoctorVideo();
  }, [playDoctorVideo]);
  useEffect(() => {
    return () => {
      doctorStreamRef.current?.getTracks().forEach((track) => track.stop());
      doctorStreamRef.current = null;
    };
  }, []);
  const replaceDoctorStream = useCallback((stream: MediaStream | null) => {
    if (doctorStreamRef.current !== stream) {
      doctorStreamRef.current?.getTracks().forEach((track) => track.stop());
    }
    doctorStreamRef.current = stream;
    setDoctorStream(stream);
  }, []);
  const startCamera = useCallback(async () => {
    if (isCompleted) return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('当前浏览器不支持摄像头预览');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      replaceDoctorStream(stream);
      setCameraError('');
      return true;
    } catch {
      setCameraError('摄像头未开启，请允许浏览器访问摄像头');
      return false;
    }
  }, [isCompleted, replaceDoctorStream]);
  const stopCamera = useCallback(() => {
    replaceDoctorStream(null);
    setCameraError('');
  }, [replaceDoctorStream]);
  const toggleCall = useCallback(async () => {
    if (callStarted) {
      setCallStarted(false);
      stopCamera();
      return;
    }
    if (isCompleted) return;
    await startCamera();
    setCallStarted(true);
  }, [callStarted, isCompleted, startCamera, stopCamera]);
  const sendMessage = useCallback(() => {
    if (isCompleted) return;
    const body = draft.trim();
    if (!body) return;
    void requestApi<ApiEncounterMessage>(`/encounters/${encodeURIComponent(encounter.id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then((response) => {
      setMessages((current) => [...current, roomMessageFromApi(response.data, formatDate)]);
      setDraft('');
      roomContext.reload();
    });
  }, [draft, encounter.id, formatDate, isCompleted, roomContext]);
  const sendImage = useCallback(
    (files: FileList | null) => {
      if (isCompleted) return;
      const file = files?.[0];
      if (!file) return;
      void readImageAsDataUrl(file)
        .then((imageUrl) =>
          requestApi<ApiEncounterMessage>(
            `/encounters/${encodeURIComponent(encounter.id)}/messages`,
            {
              method: 'POST',
              body: JSON.stringify({ body: file.name, imageUrl, imageName: file.name }),
            },
          ),
        )
        .then((response) => {
          setMessages((current) => [...current, roomMessageFromApi(response.data, formatDate)]);
          roomContext.reload();
        });
    },
    [encounter.id, formatDate, isCompleted, roomContext],
  );
  const endEncounter = useCallback(() => {
    if (isCompleted) return;
    setCallStarted(false);
    stopCamera();
    void requestApi<SavedEncounterRecord>(
      `/encounters/${encodeURIComponent(encounter.id)}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          mode: encounter.type,
          messageCount: messages.filter((message) => message.sender !== 'system').length,
          audioSaved: encounter.type === 'video',
          videoSaved: encounter.type === 'video',
        }),
      },
    ).then((response) => {
      onComplete(encounter.id, response.data);
      roomContext.reload();
      setRecordsOpen(true);
    });
  }, [encounter.id, encounter.type, isCompleted, messages, onComplete, roomContext, stopCamera]);
  const exportRecord = useCallback(() => {
    const record =
      roomSavedRecords[0] ??
      (isCompleted
        ? {
            id: `${encounter.id}-completed-export`,
            title: '本次问诊记录',
            savedAt: new Date().toISOString(),
            mode: encounter.type,
            messageCount: messages.filter((message) => message.sender !== 'system').length,
            audioSaved: encounter.type === 'video',
            videoSaved: encounter.type === 'video',
          }
        : null);
    if (!record) return;
    const content = [
      `问诊编号：${encounter.id}`,
      `患者：${encounter.patientName}（${encounter.patientId}）`,
      `类型：${encounter.type === 'video' ? '视频接诊' : '图文接诊'}`,
      `保存时间：${formatDate(record.savedAt, { dateStyle: 'medium', timeStyle: 'short' })}`,
      `录音留存：${record.audioSaved ? '是' : '否'}`,
      `录像留存：${record.videoSaved ? '是' : '否'}`,
      '',
      '患者信息',
      `主诉：${brief.chiefComplaint}`,
      `现病史：${brief.presentIllness}`,
      `既往病史：${brief.pastHistory}`,
      `手术史：${brief.surgicalHistory}`,
      `用药史：${brief.medicationHistory}`,
      `过敏史：${brief.allergyHistory}`,
      '',
      '沟通记录',
      ...messages.map((message) => `[${message.time}] ${message.sender}: ${message.body}`),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${encounter.id}-consultation-record.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [brief, encounter, formatDate, isCompleted, messages, roomSavedRecords]);
  return (
    <div className="encounter-room-page">
      <header className="encounter-room-header">
        <button className="feature-icon-button" onClick={onBack} aria-label={t('返回接诊列表')}>
          <ArrowLeft size={19} />
        </button>
        <div className="feature-person">
          <PersonAvatar name={encounter.patientName} />
          <div>
            <strong>{encounter.patientName}</strong>
            <small>
              {encounter.patientId} · {encounter.id}
            </small>
          </div>
        </div>
        <div className="encounter-room-header-meta">
          <Badge tone={tones[displayStatus]}>{t(statuses[displayStatus])}</Badge>
          <span>{isVideo ? t('视频接诊') : t('图文接诊')}</span>
        </div>
      </header>
      <div className="encounter-room-layout">
        <aside className="encounter-room-sidebar">
          <div className="encounter-room-actions">
            <Button variant="secondary" onClick={() => setRecordDialogOpen(true)}>
              <ClipboardList size={14} />
              {t('开病历')}
            </Button>
            <Button
              className="encounter-end-button"
              variant="secondary"
              onClick={endEncounter}
              disabled={isCompleted}
            >
              <Square size={14} />
              {t(isCompleted ? '问诊已结束' : '结束问诊')}
            </Button>
            <Button
              variant="secondary"
              onClick={exportRecord}
              disabled={!roomSavedRecords.length && !isCompleted}
            >
              <Download size={14} />
              {t('导出记录')}
            </Button>
          </div>
          <div className="encounter-room-panel">
            <h3>
              <FileText size={16} />
              {t('问诊资料')}
            </h3>
            <div className="encounter-room-facts">
              <span>
                <small>{t('接诊日期')}</small>
                {encounterDate(encounter, formatDate)}
              </span>
              <span>
                <small>{t('接诊时间')}</small>
                {encounterTime(encounter, formatDate)}
              </span>
            </div>
          </div>
          <PatientFolder
            records={priorRecords}
            open={folderOpen}
            onToggle={() => setFolderOpen((value) => !value)}
          />
          <SavedRecordsPanel
            records={roomSavedRecords}
            open={recordsOpen}
            onToggle={() => setRecordsOpen((value) => !value)}
            onExport={exportRecord}
          />
          <ClinicalSummary brief={brief} />
        </aside>
        <main className="encounter-room-main">
          {isVideo ? (
            <section className="encounter-video-room">
              <div className="encounter-video-grid">
                <div className="encounter-video-tile encounter-video-tile--patient">
                  <PersonAvatar name={encounter.patientName} size="large" />
                  <span>
                    {t(
                      isCompleted
                        ? '问诊已结束，视频通话不可继续'
                        : callStarted
                          ? '患者已接入视频'
                          : '等待系统呼叫患者',
                    )}
                  </span>
                </div>
                <div className="encounter-video-tile encounter-video-tile--doctor">
                  {doctorStream ? (
                    <video
                      className="encounter-doctor-video"
                      ref={attachDoctorVideo}
                      autoPlay
                      muted
                      playsInline
                      onLoadedMetadata={(event) => {
                        void event.currentTarget.play();
                      }}
                      onClick={(event) => {
                        void event.currentTarget.play();
                      }}
                    />
                  ) : (
                    <div className="encounter-video-avatar">{t('我')}</div>
                  )}
                  <span>
                    {cameraError
                      ? t(cameraError)
                      : t(doctorStream ? '医生摄像头已开启' : '本机摄像头待开启')}
                  </span>
                </div>
              </div>
              <div className="encounter-call-status">
                <strong>
                  {t(isCompleted ? '问诊已完成' : callStarted ? '视频接诊中' : '等待呼叫')}
                </strong>
                <span>
                  {t(
                    isCompleted
                      ? '本次问诊记录已保存，诊间已锁定'
                      : callStarted
                        ? '双方已进入视频诊间'
                        : '点击开始呼叫后进入视频接诊流程',
                  )}
                </span>
              </div>
              <div className="encounter-call-controls">
                <button aria-label={t('麦克风')} disabled={isCompleted}>
                  <Mic size={18} />
                </button>
                <button
                  type="button"
                  className={doctorStream ? 'is-active' : ''}
                  aria-label={t('摄像头')}
                  disabled={isCompleted}
                  onClick={() => {
                    if (doctorStream) {
                      stopCamera();
                    } else {
                      void startCamera();
                    }
                  }}
                >
                  <Camera size={18} />
                </button>
                <Button
                  className={callStarted ? 'encounter-danger-button' : ''}
                  variant={callStarted ? 'secondary' : 'primary'}
                  disabled={isCompleted}
                  onClick={() => {
                    void toggleCall();
                  }}
                >
                  {callStarted ? <PhoneOff size={17} /> : <PhoneCall size={17} />}
                  {t(callStarted ? '结束通话' : '开始视频接诊')}
                </Button>
              </div>
            </section>
          ) : (
            <section className="encounter-chat-room">
              <div className="encounter-chat-header">
                <div>
                  <h3>{t('图文诊间')}</h3>
                  <p>{t('48h服务窗口 · 最多20条消息')}</p>
                </div>
                <Badge tone={isCompleted ? 'teal' : 'blue'}>
                  {t(isCompleted ? '已完成' : '进行中')}
                </Badge>
              </div>
              <div className="encounter-message-list" aria-live="polite">
                {messages.map((message) => (
                  <div
                    className={`encounter-message encounter-message--${message.sender}`}
                    key={message.id}
                  >
                    {message.sender !== 'system' && (
                      <small>{t(message.sender === 'doctor' ? '我' : encounter.patientName)}</small>
                    )}
                    {message.imageUrl ? (
                      <figure className="encounter-message-image">
                        <button
                          className="message-image-preview"
                          type="button"
                          onClick={() =>
                            setPreviewImage({
                              url: message.imageUrl as string,
                              name: message.imageName,
                            })
                          }
                          aria-label={t('查看大图')}
                        >
                          <img src={message.imageUrl} alt={message.imageName || t('图片消息')} />
                        </button>
                        <figcaption>{message.imageName}</figcaption>
                      </figure>
                    ) : (
                      <p>{t(message.body)}</p>
                    )}
                    <time>{message.time}</time>
                  </div>
                ))}
              </div>
              <div className="encounter-compose">
                <label
                  className={`message-image-button ${isCompleted ? 'is-disabled' : ''}`}
                  aria-disabled={isCompleted}
                >
                  <ImagePlus size={17} />
                  {t('图片')}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isCompleted}
                    onChange={(event) => {
                      sendImage(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <textarea
                  value={draft}
                  disabled={isCompleted}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t(
                    isCompleted ? '问诊已结束，不能继续发送消息' : '输入回复患者的内容',
                  )}
                  aria-label={t('输入回复患者的内容')}
                />
                <Button onClick={sendMessage} disabled={isCompleted}>
                  <Send size={16} />
                  {t('发送')}
                </Button>
              </div>
            </section>
          )}
        </main>
      </div>
      {previewImage && (
        <div
          className="image-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('查看大图')}
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="image-preview-close"
            type="button"
            onClick={() => setPreviewImage(null)}
            aria-label={t('关闭')}
          >
            <X size={20} />
          </button>
          <figure className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <img src={previewImage.url} alt={previewImage.name || t('图片消息')} />
            {previewImage.name && <figcaption>{previewImage.name}</figcaption>}
          </figure>
        </div>
      )}
      {recordDialogOpen && (
        <EncounterRecordDialog
          encounter={encounter}
          brief={brief}
          onClose={() => setRecordDialogOpen(false)}
          onSaved={() => {
            roomContext.reload();
            setFolderOpen(true);
          }}
        />
      )}
    </div>
  );
}

export function EncountersPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<Encounter[]>('/encounters');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Encounter['type']>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Encounter['status']>>({});
  const [savedRecordsByEncounter, setSavedRecordsByEncounter] = useState<
    Record<string, SavedEncounterRecord[]>
  >({});
  const encounterRows = useMemo(() => {
    const byId = new Map<string, Encounter>();
    (data ?? []).forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
    return Array.from(byId.values())
      .map((item) => ({
        ...item,
        status: statusOverrides[item.id] ?? (item.status === 'scheduled' ? 'waiting' : item.status),
      }))
      .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
  }, [data, statusOverrides]);
  const nowMs = Date.now();
  const selected = encounterRows.find((item) => item.id === selectedId) ?? null;
  const activeRoom = encounterRows.find((item) => item.id === roomId) ?? null;
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const close = useCallback(() => setSelectedId(null), []);
  const completeEncounter = useCallback((id: string, record: SavedEncounterRecord) => {
    setStatusOverrides((current) => ({ ...current, [id]: 'completed' }));
    setSavedRecordsByEncounter((current) => {
      const records = current[id] ?? [];
      if (records.some((item) => item.id === record.id)) return current;
      return { ...current, [id]: [record, ...records] };
    });
    reload();
  }, [reload]);
  const applyReschedule = useCallback((id: string) => {
    setStatusOverrides((current) => ({ ...current, [id]: 'waiting' }));
    reload();
  }, [reload]);
  const encounters = useMemo(
    () =>
      encounterRows.filter((item) => {
        const displayStatus = encounterDisplayStatus(item, nowMs);
        return (
          (status === 'all' || displayStatus === status) &&
          (typeFilter === 'all' || item.type === typeFilter) &&
          (!dateFrom || item.scheduledAt.slice(0, 10) >= dateFrom) &&
          (!dateTo || item.scheduledAt.slice(0, 10) <= dateTo) &&
          `${item.patientName} ${item.patientId} ${item.id}`.includes(query.trim())
        );
      }),
    [dateFrom, dateTo, encounterRows, nowMs, query, status, typeFilter],
  );
  if (activeRoom)
    return (
      <EncounterRoom
        encounter={activeRoom}
        savedRecords={savedRecordsByEncounter[activeRoom.id] ?? []}
        onBack={() => setRoomId(null)}
        onComplete={completeEncounter}
      />
    );
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="CONSULTATION WORKSPACE"
        title={t('在线诊疗')}
        description={t('有序接诊，从容沟通。让优质的医疗服务跨越距离。')}
        action={
          <Button onClick={() => setAppointmentOpen(true)}>
            <CalendarPlus size={16} />
            {t('预约管理')}
          </Button>
        }
      />
      {loading || error ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-metrics">
            <Metric
              icon={CalendarDays}
              label={t('演示接诊安排')}
              value={encounterRows.length}
              detail={t('查看当前工作队列')}
            />
            <Metric
              icon={Clock3}
              label={t('等待接诊')}
              value={
                encounterRows.filter((item) => encounterDisplayStatus(item, nowMs) === 'waiting')
                  .length
              }
              detail={t('包含待响应的图文与视频接诊')}
              tone="amber"
            />
            <Metric
              icon={Video}
              label={t('视频预约')}
              value={encounterRows.filter((item) => item.type === 'video').length}
              detail={t('音视频服务将在后续接入')}
              tone="blue"
            />
            <Metric
              icon={CheckCheck}
              label={t('已完成记录')}
              value={
                encounterRows.filter((item) => encounterDisplayStatus(item, nowMs) === 'completed')
                  .length
              }
              detail={t('虚构历史诊疗安排')}
            />
          </div>
          <div className="feature-toolbar">
            <FilterTabs
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: '全部接诊', count: encounterRows.length },
                {
                  value: 'waiting',
                  label: '待接诊',
                  count: encounterRows.filter(
                    (item) => encounterDisplayStatus(item, nowMs) === 'waiting',
                  ).length,
                },
                {
                  value: 'active',
                  label: '接诊中',
                  count: encounterRows.filter(
                    (item) => encounterDisplayStatus(item, nowMs) === 'active',
                  ).length,
                },
                { value: 'completed', label: '已完成' },
              ]}
            />
            <label className="feature-search">
              <Search size={16} />
              <input
                aria-label={t('搜索患者或接诊编号')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('搜索患者姓名或接诊编号')}
              />
            </label>
            <label className="encounter-filter-field">
              <span>{t('就诊方式')}</span>
              <select
                className="feature-select"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'all' | Encounter['type'])}
              >
                <option value="all">{t('全部方式')}</option>
                <option value="text">{t('图文问诊')}</option>
                <option value="video">{t('视频问诊')}</option>
              </select>
            </label>
            <div className="encounter-filter-field encounter-filter-field--range">
              <span>{t('接诊日期')}</span>
              <input
                className="feature-select"
                type="date"
                value={dateFrom}
                aria-label={t('开始日期')}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <span className="encounter-filter-separator">{t('至')}</span>
              <input
                className="feature-select"
                type="date"
                value={dateTo}
                aria-label={t('结束日期')}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>
          <div className="encounter-grid">
            {encounters.map((encounter, index) => (
              <article className="encounter-row" key={encounter.id}>
                <div className="feature-person encounter-row-person">
                  <PersonAvatar name={encounter.patientName} tone={index} />
                  <div>
                    <strong>{encounter.patientName}</strong>
                    <small>
                      {encounter.patientId} · {encounter.id}
                    </small>
                  </div>
                </div>
                <div className="encounter-row-meta">
                  <span className="encounter-row-type">
                    {encounter.type === 'video' ? <Video size={14} /> : <MessageSquare size={14} />}
                    {encounter.type === 'video' ? t('视频问诊') : t('图文问诊')}
                  </span>
                  <span>
                    <small>{t('接诊日期')}</small>
                    {encounterDate(encounter, formatDate)}
                  </span>
                  <span>
                    <small>{t('接诊时间')}</small>
                    {encounterTime(encounter, formatDate)}
                  </span>
                </div>
                {(() => {
                  const displayStatus = encounterDisplayStatus(encounter, nowMs);
                  return <Badge tone={tones[displayStatus]}>{t(statuses[displayStatus])}</Badge>;
                })()}
                <LinkAction onClick={() => setSelectedId(encounter.id)}>
                  {t('查看接诊详情')}
                </LinkAction>
              </article>
            ))}
          </div>
          {!encounters.length && (
            <EmptyState
              title={t('没有符合条件的接诊安排')}
              description={t('调整筛选条件查看其他演示记录。')}
            />
          )}
          <ReadOnlyNote />
        </>
      )}
      {selected && (
        <FeatureDialog
          title={t('接诊详情')}
          subtitle={t('{value0} · 演示安排', { value0: selected.id })}
          onClose={close}
        >
          <div className="feature-person-header">
            <PersonAvatar name={selected.patientName} size="large" />
            <div>
              <h3>{selected.patientName}</h3>
              <p>{selected.patientId}</p>
            </div>
            {(() => {
              const displayStatus = encounterDisplayStatus(selected, nowMs);
              return <Badge tone={tones[displayStatus]}>{t(statuses[displayStatus])}</Badge>;
            })()}
          </div>
          <DetailGrid
            items={[
              {
                label: '就诊方式',
                value: selected.type === 'video' ? t('视频问诊') : t('图文问诊'),
              },
              {
                label: '接诊日期',
                value: encounterDate(selected, formatDate),
              },
              {
                label: '接诊时间',
                value: encounterTime(selected, formatDate),
              },
            ]}
          />
          <div className="encounter-room-action">
            <Button
              onClick={() => {
                setRoomId(selected.id);
                close();
              }}
            >
              {selected.type === 'video' ? <Video size={16} /> : <MessageSquare size={16} />}
              {t('进入诊间')}
            </Button>
          </div>
          <EncounterDetailClinical encounter={selected} />
        </FeatureDialog>
      )}
      {appointmentOpen && (
        <AppointmentManagementDialog
          encounters={encounterRows}
          nowMs={nowMs}
          onClose={() => setAppointmentOpen(false)}
          onRescheduleAccepted={applyReschedule}
        />
      )}
    </div>
  );
}
