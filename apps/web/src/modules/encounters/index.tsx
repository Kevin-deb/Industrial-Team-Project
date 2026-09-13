import { useI18n } from '../../shared/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  History,
  ImagePlus,
  Mic,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  Search,
  Send,
  Square,
  Video,
  X,
} from 'lucide-react';
import type { Encounter } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  Metric,
  PersonAvatar,
  PlannedDialog,
  ReadOnlyNote,
} from '../ui';

const statuses = { waiting: '待接诊', scheduled: '待接诊', completed: '已完成' };
const tones = { waiting: 'amber', scheduled: 'amber', completed: 'teal' } as const;
const isPendingEncounter = (status: Encounter['status']) =>
  status === 'waiting' || status === 'scheduled';
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
const clinicalBriefs: Record<string, ClinicalBrief> = {
  'ENC-001': {
    chiefComplaint: '近两日反复偏头痛',
    presentIllness: '患者自述右侧颞部搏动性疼痛，午后明显，偶有恶心，无肢体麻木或言语不清。',
    pastHistory: '高血压病史3年，平时血压控制尚可。',
    surgicalHistory: '否认重大手术史。',
    medicationHistory: '间断服用苯磺酸氨氯地平片。',
    allergyHistory: '否认药物及食物过敏史。',
  },
  'ENC-002': {
    chiefComplaint: '餐后血糖波动一周',
    presentIllness: '近一周餐后2小时血糖多次升高，伴口干，无明显乏力、胸闷或意识异常。',
    pastHistory: '2型糖尿病病史5年。',
    surgicalHistory: '阑尾切除术后多年，恢复良好。',
    medicationHistory: '规律服用二甲双胍，近期饮食控制不稳定。',
    allergyHistory: '青霉素过敏史。',
  },
  'ENC-003': {
    chiefComplaint: '咳嗽气短三天',
    presentIllness: '受凉后出现阵发性咳嗽，活动后轻度气短，无高热，无咯血。',
    pastHistory: '慢性支气管炎病史，季节变化时易反复。',
    surgicalHistory: '否认重大手术史。',
    medicationHistory: '偶用吸入支气管舒张剂。',
    allergyHistory: '花粉过敏史。',
  },
  'ENC-004': {
    chiefComplaint: '常规健康随访',
    presentIllness: '近期总体平稳，睡眠一般，偶有头晕，未诉明显胸痛、气促。',
    pastHistory: '高脂血症病史。',
    surgicalHistory: '胆囊切除术后。',
    medicationHistory: '规律服用他汀类降脂药。',
    allergyHistory: '否认明确过敏史。',
  },
};
const patientHistories: Record<string, HistoryRecord[]> = {
  'PAT-001': [
    {
      id: 'MR-PAT001-01',
      title: '高血压复诊',
      date: '2026-08-21',
      department: '全科医学科',
      diagnosis: '原发性高血压',
      outcome: '调整家庭血压监测频率，继续规律用药。',
    },
    {
      id: 'MR-PAT001-02',
      title: '头痛门诊咨询',
      date: '2026-06-13',
      department: '神经内科',
      diagnosis: '偏头痛待随访',
      outcome: '建议记录诱因，必要时完善影像检查。',
    },
  ],
  'PAT-002': [
    {
      id: 'MR-PAT002-01',
      title: '糖尿病随访',
      date: '2026-08-30',
      department: '内分泌科',
      diagnosis: '2型糖尿病',
      outcome: '评估餐后血糖，强调饮食与运动管理。',
    },
  ],
  'PAT-006': [
    {
      id: 'MR-PAT006-01',
      title: '呼吸道症状复诊',
      date: '2026-07-18',
      department: '呼吸内科',
      diagnosis: '慢性支气管炎',
      outcome: '季节变化时加强观察，按需使用吸入药物。',
    },
  ],
  'PAT-003': [
    {
      id: 'MR-PAT003-01',
      title: '慢病管理随访',
      date: '2026-08-03',
      department: '全科医学科',
      diagnosis: '高脂血症',
      outcome: '继续降脂治疗，三个月后复查血脂。',
    },
  ],
};

function clinicalBrief(encounter: Encounter) {
  return (
    clinicalBriefs[encounter.id] ?? {
      chiefComplaint: encounter.reason,
      presentIllness: '患者已提交在线问诊资料，详细病情需进入诊间后进一步核对。',
      pastHistory: '暂无补充记录。',
      surgicalHistory: '暂无补充记录。',
      medicationHistory: '暂无补充记录。',
      allergyHistory: '暂无补充记录。',
    }
  );
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

function initialMessages(encounter: Encounter, brief: ClinicalBrief): RoomMessage[] {
  return [
    {
      id: `${encounter.id}-patient-1`,
      sender: 'patient',
      body:
        encounter.type === 'text'
          ? `医生您好，我想咨询一下：${brief.chiefComplaint}。`
          : '医生您好，我已准备好视频问诊。',
      time: '09:12',
    },
    {
      id: `${encounter.id}-system-1`,
      sender: 'system',
      body:
        encounter.type === 'text'
          ? '图文问诊已开始，本次服务窗口为48h。'
          : '视频问诊待呼叫，系统将同时连接医生与患者。',
      time: '09:13',
    },
  ];
}

function briefDiagnosis(encounter: Encounter) {
  if (encounter.reason.includes('血压')) return '血压管理';
  if (encounter.reason.includes('血糖')) return '血糖管理';
  if (encounter.reason.includes('呼吸')) return '呼吸健康随访';
  return '常规健康随访';
}

function historyRecords(encounter: Encounter) {
  return (
    patientHistories[encounter.patientId] ?? [
      {
        id: `${encounter.patientId}-MR-01`,
        title: '既往在线随访',
        date: '2026-07-24',
        department: '全科医学科',
        diagnosis: briefDiagnosis(encounter),
        outcome: '已完成线上评估，建议按计划复诊。',
      },
    ]
  );
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

function EncounterRoom({ encounter, onBack }: { encounter: Encounter; onBack: () => void }) {
  const { t, formatDate } = useI18n();
  const brief = clinicalBrief(encounter);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<RoomMessage[]>(() => initialMessages(encounter, brief));
  const [callStarted, setCallStarted] = useState(false);
  const [folderOpen, setFolderOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [savedRecords, setSavedRecords] = useState<SavedEncounterRecord[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; name?: string } | null>(null);
  const isVideo = encounter.type === 'video';
  const priorRecords = useMemo(() => historyRecords(encounter), [encounter]);
  const sendMessage = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    setMessages((current) => [
      ...current,
      {
        id: `${encounter.id}-doctor-${current.length + 1}`,
        sender: 'doctor',
        body,
        time: formatDate(new Date().toISOString(), { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setDraft('');
  }, [draft, encounter.id, formatDate]);
  const sendImage = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setMessages((current) => [
        ...current,
        {
          id: `${encounter.id}-doctor-image-${current.length + 1}`,
          sender: 'doctor',
          body: file.name,
          imageUrl: URL.createObjectURL(file),
          imageName: file.name,
          time: formatDate(new Date().toISOString(), { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    },
    [encounter.id, formatDate],
  );
  const endEncounter = useCallback(() => {
    setCallStarted(false);
    setSavedRecords((current) => {
      if (current.some((record) => record.id === `${encounter.id}-saved`)) return current;
      return [
        {
          id: `${encounter.id}-saved`,
          title: '本次问诊记录',
          savedAt: new Date().toISOString(),
          mode: encounter.type,
          messageCount: messages.filter((message) => message.sender !== 'system').length,
          audioSaved: encounter.type === 'video',
          videoSaved: encounter.type === 'video',
        },
        ...current,
      ];
    });
    setRecordsOpen(true);
  }, [encounter.id, encounter.type, messages]);
  const exportRecord = useCallback(() => {
    const record = savedRecords[0];
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
  }, [brief, encounter, formatDate, messages, savedRecords]);
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
          <Badge tone={tones[encounter.status]}>{t(statuses[encounter.status])}</Badge>
          <span>{isVideo ? t('视频接诊') : t('图文接诊')}</span>
        </div>
      </header>
      <div className="encounter-room-layout">
        <aside className="encounter-room-sidebar">
          <div className="encounter-room-actions">
            <Button className="encounter-end-button" variant="secondary" onClick={endEncounter}>
              <Square size={14} />
              {t('结束问诊')}
            </Button>
            <Button variant="secondary" onClick={exportRecord} disabled={!savedRecords.length}>
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
            records={savedRecords}
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
                  <span>{callStarted ? t('患者已接入视频') : t('等待系统呼叫患者')}</span>
                </div>
                <div className="encounter-video-tile encounter-video-tile--doctor">
                  <div className="encounter-video-avatar">{t('我')}</div>
                  <span>{t(callStarted ? '医生画面' : '本机摄像头待开启')}</span>
                </div>
              </div>
              <div className="encounter-call-status">
                <strong>{t(callStarted ? '视频接诊中' : '等待呼叫')}</strong>
                <span>
                  {t(callStarted ? '双方已进入视频诊间' : '点击开始呼叫后进入视频接诊流程')}
                </span>
              </div>
              <div className="encounter-call-controls">
                <button aria-label={t('麦克风')}>
                  <Mic size={18} />
                </button>
                <button aria-label={t('摄像头')}>
                  <Camera size={18} />
                </button>
                <Button
                  className={callStarted ? 'encounter-danger-button' : ''}
                  variant={callStarted ? 'secondary' : 'primary'}
                  onClick={() => setCallStarted((value) => !value)}
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
                <Badge tone="blue">{t('进行中')}</Badge>
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
                <label className="message-image-button">
                  <ImagePlus size={17} />
                  {t('图片')}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      sendImage(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t('输入回复患者的内容')}
                  aria-label={t('输入回复患者的内容')}
                />
                <Button onClick={sendMessage}>
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
    </div>
  );
}

export function EncountersPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<Encounter[]>('/encounters');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const selected = data?.find((item) => item.id === selectedId) ?? null;
  const activeRoom = data?.find((item) => item.id === roomId) ?? null;
  const selectedBrief = selected ? clinicalBrief(selected) : null;
  const [planned, setPlanned] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const closePlanned = useCallback(() => setPlanned(null), []);
  const encounters = useMemo(
    () =>
      (data ?? []).filter(
        (item) =>
          (status === 'all' ||
            (status === 'pending' ? isPendingEncounter(item.status) : item.status === status)) &&
          `${item.patientName} ${item.patientId} ${item.id}`.includes(query.trim()),
      ),
    [data, query, status],
  );
  if (activeRoom) return <EncounterRoom encounter={activeRoom} onBack={() => setRoomId(null)} />;
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="CONSULTATION WORKSPACE"
        title={t('在线诊疗')}
        description={t('有序接诊，从容沟通。让优质的医疗服务跨越距离。')}
        action={
          <Button onClick={() => setPlanned('预约管理')}>
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
              value={data?.length ?? 0}
              detail={t('查看当前工作队列')}
            />
            <Metric
              icon={Clock3}
              label={t('等待接诊')}
              value={data?.filter((item) => isPendingEncounter(item.status)).length ?? 0}
              detail={t('包含待响应与已约定时段')}
              tone="amber"
            />
            <Metric
              icon={Video}
              label={t('视频预约')}
              value={data?.filter((item) => item.type === 'video').length ?? 0}
              detail={t('音视频服务将在后续接入')}
              tone="blue"
            />
            <Metric
              icon={CheckCheck}
              label={t('已完成记录')}
              value={data?.filter((item) => item.status === 'completed').length ?? 0}
              detail={t('虚构历史诊疗安排')}
            />
          </div>
          <div className="feature-toolbar">
            <FilterTabs
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: '全部接诊', count: data?.length },
                {
                  value: 'pending',
                  label: '待接诊',
                  count: data?.filter((item) => isPendingEncounter(item.status)).length,
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
                placeholder={t('搜索患者或接诊编号')}
              />
            </label>
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
                <Badge tone={tones[encounter.status]}>{t(statuses[encounter.status])}</Badge>
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
          <div className="feature-coming-panel">
            <Video size={26} />
            <div>
              <h3>{t('更自然的在线沟通，即将到来')}</h3>
              <p>
                {t(
                  '图文消息、视频通话、经授权的录音录像及诊后随访已纳入开发计划。当前可浏览演示接诊安排。',
                )}
              </p>
            </div>
          </div>
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
            <Badge tone={tones[selected.status]}>{t(statuses[selected.status])}</Badge>
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
          {selectedBrief && <ClinicalSummary brief={selectedBrief} />}
          <div className="feature-coming-panel">
            {selected.type === 'video' ? <Video size={25} /> : <MessageSquare size={25} />}
            <div>
              <h3>
                {selected.type === 'video' ? t('视频诊室') : t('图文诊室')}
                {t('· 尚未上线')}
              </h3>
              <p>
                {selected.type === 'video'
                  ? t('RTC 服务、设备检测、患者知情同意与诊室访问控制将在后续接入。')
                  : t('消息发送、附件上传、送达状态与离线提醒将在后续接入。')}
              </p>
            </div>
          </div>
          <ReadOnlyNote>{t('当前页面用于浏览预约信息，不会发起通话或发送诊疗消息。')}</ReadOnlyNote>
        </FeatureDialog>
      )}
      {planned && (
        <PlannedDialog title={planned} iteration="Iteration 1–3" onClose={closePlanned}>
          <p>
            {t(
              'Iteration 1 实现基础图文接诊，Iteration 3 接入图像、视频与会诊协作。预约管理聚焦设置可接诊时段、患者通知与改期确认；医生不确认预约人选。',
            )}
          </p>
          <p>
            {t(
              '医生发起改期通知后，由患者确认是否接受；双方达成一致后，平台自动调整接诊时段并留下审计记录。',
            )}
          </p>
        </PlannedDialog>
      )}
    </div>
  );
}
