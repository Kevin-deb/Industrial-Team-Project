import { useI18n } from '../../shared/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Download,
  FileCheck2,
  FilePlus2,
  ImagePlus,
  MessageSquare,
  Network,
  Plus,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
  Search,
} from 'lucide-react';
import type { Consultation } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, Modal, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  ReadOnlyNote,
  SectionTitle,
} from '../ui';

const statuses = { requested: '申请中', scheduled: '已安排', completed: '已完成' };
const tones = { requested: 'amber', scheduled: 'blue', completed: 'teal' } as const;
type ConsultationSetup = {
  materials: string[];
  access: string;
  accessUntil: string;
  report: string;
};
type ConsultationCase = Consultation & { direction?: 'sent' | 'received' };
type ConsultationMessage = {
  id: string;
  author: string;
  body: string;
  imageUrl?: string;
  imageName?: string;
};
const generatedReportText =
  '系统已根据会诊材料和实时讨论生成会诊意见：建议结合患者近期指标、既往病史与当前用药，形成分阶段诊疗和随访计划。联合会诊报告已生成待审核。';
const availableDoctors = [
  { id: 'doc-rehab-wang', name: '王辉', title: '主任医师', specialty: '康复医学科' },
  { id: 'doc-ortho-zhou', name: '周敏', title: '副主任医师', specialty: '骨科' },
  { id: 'doc-cardio-chen', name: '陈晓岚', title: '主任医师', specialty: '心血管内科' },
  { id: 'doc-endo-liu', name: '刘嘉', title: '主治医师', specialty: '内分泌科' },
  { id: 'doc-neuro-sun', name: '孙宁', title: '副主任医师', specialty: '神经内科' },
];
const setups: Record<string, ConsultationSetup> = {
  'CON-001': {
    materials: ['近三个月血压趋势', '心电图摘要', '当前用药清单'],
    access: '共享基础档案、健康监测与本次会诊材料',
    accessUntil: '2026-09-12T18:00:00+08:00',
    report: '报告草稿待联合讨论后生成',
  },
  'CON-002': {
    materials: ['血糖监测记录', '饮食运动记录', '既往随访摘要'],
    access: '仅共享糖尿病随访相关资料',
    accessUntil: '2026-09-11T18:00:00+08:00',
    report: '待专家确认后建立报告模板',
  },
};

function setupFor(item: Consultation) {
  return (
    setups[item.id] ?? {
      materials: ['病情摘要', '检查结果', '用药记录'],
      access: '按本次会诊任务共享必要资料',
      accessUntil: item.scheduledAt,
      report: '会诊结束后生成联合报告',
    }
  );
}

function RequestDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (item: ConsultationCase, setup: ConsultationSetup) => void;
}) {
  const { t } = useI18n();
  const [patientName, setPatientName] = useState('李明华');
  const [patientId, setPatientId] = useState('PAT-008');
  const [title, setTitle] = useState('疑难慢病多学科会诊');
  const [specialty, setSpecialty] = useState('全科医学 · 心血管内科 · 内分泌科');
  const [scheduledAt, setScheduledAt] = useState('2026-09-12T10:30');
  const [materials, setMaterials] = useState(['门诊病历摘要']);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState(['doc-cardio-chen', 'doc-endo-liu']);
  const selectedDoctors = availableDoctors.filter((doctor) => selectedDoctorIds.includes(doctor.id));
  const [doctorQuery, setDoctorQuery] = useState('');
  const filteredDoctors = availableDoctors.filter((doctor) =>
    `${doctor.name} ${doctor.specialty} ${doctor.title}`.includes(doctorQuery.trim()),
  );
  const addDoctor = (id: string) => {
    setSelectedDoctorIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const removeDoctor = (id: string) => {
    setSelectedDoctorIds((current) => current.filter((item) => item !== id));
  };
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setMaterials((current) => [...current, ...Array.from(files).map((file) => file.name)]);
  };
  return (
    <FeatureDialog title={t('发起专家会诊')} subtitle={t('填写会诊申请')} onClose={onClose}>
      <div className="consultation-request-form">
        {[
          ['患者姓名', patientName, setPatientName],
          ['患者编号', patientId, setPatientId],
          ['会诊标题', title, setTitle],
          ['会诊专科', specialty, setSpecialty],
        ].map(([label, value, setter]) => (
          <label key={label as string}>
            <span>{t(label as string)}</span>
            <input
              value={value as string}
              onChange={(event) => (setter as (next: string) => void)(event.target.value)}
            />
          </label>
        ))}
        <label>
          <span>{t('计划时间')}</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>
        <section className="consultation-doctor-picker">
          <div>
            <h3>{t('选择参与医生')}</h3>
            <p>{t('搜索医生姓名、科室或职称，添加参与本次远程会诊的专家。')}</p>
          </div>
          <label className="consultation-doctor-search">
            <Search size={16} />
            <input
              value={doctorQuery}
              onChange={(event) => setDoctorQuery(event.target.value)}
              placeholder={t('搜索医生姓名、科室或职称')}
              aria-label={t('搜索医生姓名、科室或职称')}
            />
          </label>
          <div className="consultation-selected-doctors">
            {selectedDoctors.length ? (
              selectedDoctors.map((doctor) => (
                <span key={doctor.id}>
                  {t(doctor.name)}
                  <button
                    type="button"
                    onClick={() => removeDoctor(doctor.id)}
                    aria-label={t('移除 {name}', { name: doctor.name })}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))
            ) : (
              <p>{t('请至少添加一名参与医生')}</p>
            )}
          </div>
          <div className="consultation-doctor-results">
            {filteredDoctors.map((doctor) => {
              const selected = selectedDoctorIds.includes(doctor.id);
              return (
                <article key={doctor.id}>
                  <div>
                  <strong>{t(doctor.name)}</strong>
                  <small>
                    {t(doctor.specialty)} · {t(doctor.title)}
                  </small>
                  </div>
                  <Button variant="secondary" disabled={selected} onClick={() => addDoctor(doctor.id)}>
                    {t(selected ? '已添加' : '添加')}
                  </Button>
                </article>
              );
            })}
            {!filteredDoctors.length && <p>{t('没有匹配的医生')}</p>}
          </div>
        </section>
        <label className="consultation-upload-box">
          <Upload size={18} />
          <span>{t('上传患者病历、影像等资料')}</span>
          <input type="file" multiple onChange={(event) => addFiles(event.target.files)} />
        </label>
        <div className="consultation-material-list">
          {materials.map((material) => (
            <span key={material}>{material}</span>
          ))}
        </div>
        <Button
          onClick={() => {
            const id = `CON-LOCAL-${Date.now().toString().slice(-4)}`;
            onCreate(
              {
                id,
                patientId,
                patientName,
                title,
                specialty,
                status: 'requested',
                scheduledAt: new Date(scheduledAt).toISOString(),
                participants: ['当前医生', ...selectedDoctors.map((doctor) => doctor.name)],
                summary: '已发起远程会诊申请，等待专家确认参与。',
                direction: 'sent',
              },
              {
                materials,
                access: '按本次会诊任务共享必要资料',
                accessUntil: new Date(scheduledAt).toISOString(),
                report: '待会诊结束后自动生成报告',
              },
            );
            onClose();
          }}
          disabled={!selectedDoctors.length}
        >
          <FilePlus2 size={16} />
          {t('提交会诊申请')}
        </Button>
      </div>
    </FeatureDialog>
  );
}

function ConsultationRoom({
  item,
  setup,
  report,
  onBack,
  onFinish,
}: {
  item: ConsultationCase;
  setup: ConsultationSetup;
  report: string;
  onBack: () => void;
  onFinish: (id: string, report: string) => void;
}) {
  const { t, formatDate } = useI18n();
  const [materials, setMaterials] = useState(setup.materials);
  const [draft, setDraft] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; name?: string } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(true);
  const [messages, setMessages] = useState<ConsultationMessage[]>([
    {
      id: 'm1',
      author: item.participants[0] ?? '会诊专家',
      body: '建议先核对近期指标和当前用药，再形成联合意见。',
    },
    { id: 'm2', author: '我', body: '已打开本次会诊材料，等待各专科补充意见。' },
  ]);
  const isFinished = item.status === 'completed';
  const reportText = report || (isFinished ? generatedReportText : '');
  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const addFiles = (files: FileList | null) => {
    if (isFinished) return;
    if (!files?.length) return;
    setMaterials((current) => [...current, ...Array.from(files).map((file) => file.name)]);
  };
  const send = () => {
    if (isFinished) return;
    const body = draft.trim();
    if (!body) return;
    setMessages((current) => [...current, { id: `m${current.length + 1}`, author: '我', body }]);
    setDraft('');
  };
  const sendImage = (files: FileList | null) => {
    if (isFinished) return;
    const file = files?.[0];
    if (!file) return;
    setMessages((current) => [
      ...current,
      {
        id: `m${current.length + 1}`,
        author: '我',
        body: file.name,
        imageUrl: URL.createObjectURL(file),
        imageName: file.name,
      },
    ]);
  };
  const finish = () => {
    onFinish(item.id, generatedReportText);
    setConfirmFinish(false);
  };
  const downloadMaterials = () => {
    downloadText(
      `${item.id}-materials.txt`,
      [`${item.title} · ${item.patientName}`, '', ...materials.map((material) => `- ${material}`)].join('\n'),
    );
  };
  const downloadMaterial = (material: string) => {
    downloadText(
      `${item.id}-${material}.txt`,
      [`${t('会诊材料')}：${t(material)}`, `${item.title} · ${item.patientName}`, '', t(material)].join(
        '\n',
      ),
    );
  };
  const downloadReport = () => {
    if (!reportText) return;
    downloadText(`${item.id}-consultation-report.txt`, reportText);
  };
  return (
    <div className="consultation-room-page">
      <header className="encounter-room-header">
        <button className="feature-icon-button" onClick={onBack} aria-label={t('返回会诊列表')}>
          <Network size={18} />
        </button>
        <div>
          <strong>{t(item.title)}</strong>
          <small>
            {item.patientName} · {item.patientId} · {item.id}
          </small>
        </div>
        <div className="encounter-room-header-meta">
          <Badge tone={tones[item.status]}>{t(statuses[item.status])}</Badge>
          <span>{formatDate(item.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </header>
      <div className="consultation-room-layout">
        <aside className="consultation-room-sidebar">
          <section className="consultation-setting-panel consultation-participant-panel">
            <button
              className="consultation-panel-toggle"
              type="button"
              onClick={() => setParticipantsOpen((open) => !open)}
              aria-expanded={participantsOpen}
            >
              <span>
                <UsersRound size={16} />
                {t('参与人员')}
              </span>
              <span>
                <Badge tone="slate">{item.participants.length}</Badge>
                <ChevronDown size={16} />
              </span>
            </button>
            {participantsOpen && (
              <div className="consultation-participant-list">
                {item.participants.map((name, index) => (
                  <article key={`${name}-${index}`}>
                    <span className="consultation-participant-avatar">
                      {t(name).slice(0, 1)}
                    </span>
                    <div>
                      <strong>{t(name)}</strong>
                      <small>{index === 0 ? t('发起医生') : t('参与专家')}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="consultation-setting-panel">
            <h3>
              <ClipboardList size={16} />
              {t('会诊材料')}
            </h3>
            <ul>
              {materials.map((material) => (
                <li className="consultation-material-item" key={material}>
                  <span>{t(material)}</span>
                  <button
                    type="button"
                    onClick={() => downloadMaterial(material)}
                    aria-label={t('下载 {name}', { name: material })}
                  >
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="consultation-panel-actions">
              <Button variant="secondary" onClick={downloadMaterials}>
                <Download size={15} />
                {t('下载全部材料')}
              </Button>
            </div>
            <label className={`consultation-upload-inline ${isFinished ? 'is-disabled' : ''}`}>
              <Upload size={15} />
              {t('上传资料')}
              <input
                type="file"
                multiple
                disabled={isFinished}
                onChange={(event) => addFiles(event.target.files)}
              />
            </label>
          </section>
          <section className="consultation-setting-panel">
            <h3>
              <ShieldCheck size={16} />
              {t('临时访问授权')}
            </h3>
            <p>{t(setup.access)}</p>
            <span>
              {t('有效期至')}{' '}
              {formatDate(setup.accessUntil, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </section>
          <section className="consultation-setting-panel">
            <h3>
              <FileCheck2 size={16} />
              {t('联合会诊报告')}
            </h3>
            <p>{reportText ? t(reportText) : t(setup.report)}</p>
            <div className="consultation-panel-actions">
              <Button variant="secondary" disabled={!reportText} onClick={downloadReport}>
                <Download size={15} />
                {t('下载报告')}
              </Button>
            </div>
          </section>
        </aside>
        <main className="consultation-room-main">
          <section className="consultation-stage">
            <div className="consultation-discussion">
              <h3>{t('会诊讨论')}</h3>
              {messages.map((message) => (
                <div
                  className={`consultation-message ${
                    message.author === '我'
                      ? 'consultation-message--doctor'
                      : 'consultation-message--expert'
                  }`}
                  key={message.id}
                >
                  <strong>{t(message.author)}</strong>
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
                </div>
              ))}
            </div>
            <div className="consultation-room-controls">
              {isFinished && (
                <div className="consultation-ended-banner">{t('会诊已结束，讨论和上传已锁定。')}</div>
              )}
              <label className={`message-image-button ${isFinished ? 'is-disabled' : ''}`}>
                <ImagePlus size={17} />
                {t('图片')}
                <input
                  type="file"
                  accept="image/*"
                  disabled={isFinished}
                  onChange={(event) => {
                    sendImage(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <input
                className="consultation-discussion-input"
                value={draft}
                disabled={isFinished}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') send();
                }}
                placeholder={t(isFinished ? '会诊已结束，不能继续发送消息' : '输入会诊讨论意见')}
              />
              <Button variant="secondary" disabled={isFinished} onClick={send}>
                <MessageSquare size={16} />
                {t('发送讨论消息')}
              </Button>
              <Button
                className="encounter-end-button"
                variant="secondary"
                disabled={isFinished}
                onClick={() => setConfirmFinish(true)}
              >
                <FileCheck2 size={16} />
                {t('结束并生成报告')}
              </Button>
            </div>
          </section>
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
      {confirmFinish && (
        <Modal title="确认结束会诊" onClose={() => setConfirmFinish(false)}>
          <div className="consultation-confirm-dialog">
            <p>{t('结束后系统会生成联合会诊报告，并锁定本次会诊讨论和资料上传。')}</p>
            <div>
              <Button variant="secondary" onClick={() => setConfirmFinish(false)}>
                {t('取消')}
              </Button>
              <Button className="encounter-end-button" variant="secondary" onClick={finish}>
                <FileCheck2 size={16} />
                {t('确认结束')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ConsultationsPage() {
  const { t, formatDate, language } = useI18n();
  const { data, loading, error, reload } = useApi<Consultation[]>('/consultations');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [localCases, setLocalCases] = useState<ConsultationCase[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Consultation['status']>>(
    {},
  );
  const [reportsByCase, setReportsByCase] = useState<Record<string, string>>({});
  const [incomingCases, setIncomingCases] = useState<ConsultationCase[]>([
    {
      id: 'CON-IN-001',
      patientId: 'PAT-009',
      patientName: '赵雅琴',
      title: '术后康复联合评估',
      specialty: '康复医学科 · 骨科 · 全科医学',
      status: 'requested',
      scheduledAt: '2026-09-12T15:30:00+08:00',
      participants: ['康复医学科王医生', '骨科周医生', '当前医生'],
      summary: '其他医生发来的会诊申请，需要确认是否参与并查看患者资料。',
      direction: 'received',
    },
  ]);
  const [localSetups, setLocalSetups] = useState<Record<string, ConsultationSetup>>({});
  const allCases = useMemo<ConsultationCase[]>(
    () => [
      ...localCases,
      ...incomingCases,
      ...((data ?? []).map((item) => ({ ...item, direction: 'sent' as const })) ?? []),
    ].map((item) => ({ ...item, status: statusOverrides[item.id] ?? item.status })),
    [data, incomingCases, localCases, statusOverrides],
  );
  const setupOf = useCallback(
    (item: ConsultationCase) => localSetups[item.id] ?? setupFor(item),
    [localSetups],
  );
  const selected = allCases.find((item) => item.id === selectedId) ?? null;
  const activeRoom = allCases.find((item) => item.id === roomId) ?? null;
  const close = useCallback(() => setSelectedId(null), []);
  const acceptConsultation = useCallback((id: string) => {
    setStatusOverrides((current) => ({ ...current, [id]: 'scheduled' }));
    setIncomingCases((current) =>
      current.map((row) => (row.id === id ? { ...row, status: 'scheduled' } : row)),
    );
  }, []);
  const finishConsultation = useCallback((id: string, report: string) => {
    setStatusOverrides((current) => ({ ...current, [id]: 'completed' }));
    setReportsByCase((current) => ({ ...current, [id]: report }));
  }, []);
  const cases = useMemo(
    () => allCases.filter((item) => status === 'all' || item.status === status),
    [allCases, status],
  );
  if (activeRoom)
    return (
      <ConsultationRoom
        item={activeRoom}
        setup={setupOf(activeRoom)}
        report={reportsByCase[activeRoom.id] ?? ''}
        onBack={() => setRoomId(null)}
        onFinish={finishConsultation}
      />
    );
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="MULTIDISCIPLINARY CARE"
        title={t('专家会诊')}
        description={t('汇聚不同专科的经验，为复杂的照护需求找到更完整的解答。')}
        action={
          <Button onClick={() => setRequestOpen(true)}>
            <Plus size={16} />
            {t('发起会诊')}
          </Button>
        }
      />
      <div className="feature-hero-note">
        <div>
          <span className="feature-eyebrow">BETTER CARE, TOGETHER</span>
          <h2>{t('以患者为中心，让协作更有序')}</h2>
          <p>
            {t(
              '从会诊申请、专家邀请到综合意见归档，每个环节都围绕同一份照护需求展开。当前提供演示会诊目录与流程预览。',
            )}
          </p>
        </div>
        <Network size={60} />
      </div>
      {loading || error ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="feature-toolbar">
            <FilterTabs
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: '全部会诊', count: allCases.length },
                { value: 'requested', label: '申请中' },
                { value: 'scheduled', label: '已安排' },
                { value: 'completed', label: '已完成' },
              ]}
            />
            <span className="feature-mini-label">{t('当前医生相关的会诊安排')}</span>
          </div>
          <div className="feature-card-grid">
            {cases.map((item) => {
              return (
                <Card className="mdt-case" key={item.id}>
                  <div className="mdt-case-heading">
                    <span className="feature-symbol blue">
                      <UsersRound size={20} />
                    </span>
                    <Badge tone={tones[item.status]}>{t(statuses[item.status])}</Badge>
                  </div>
                  <span className="feature-eyebrow">{item.id}</span>
                  <h3>{t(item.title)}</h3>
                  <p>
                    {item.patientName} · {item.patientId}
                    {item.direction && (
                      <Badge tone={item.direction === 'received' ? 'amber' : 'slate'}>
                        {t(item.direction === 'received' ? '收到的申请' : '我发起的')}
                      </Badge>
                    )}
                  </p>
                  <div className="mdt-specialties">
                    <span>{item.specialty}</span>
                    <span>{t('{count} 位参与医生', { count: item.participants.length })}</span>
                  </div>
                  <p className="feature-inline-icon">
                    <CalendarClock size={13} />
                    {formatDate(item.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <div className="mdt-footer" style={{ marginTop: 18 }}>
                    <span>{t('演示会诊')}</span>
                    <div className="consultation-card-actions">
                      {item.direction === 'received' && item.status === 'requested' && (
                        <Button
                          className="consultation-accept-button"
                          variant="secondary"
                          onClick={() => acceptConsultation(item.id)}
                        >
                          {t('接受申请')}
                        </Button>
                      )}
                      {item.direction === 'received' && item.status !== 'requested' && (
                        <Badge tone="teal">{t('已接受')}</Badge>
                      )}
                      <LinkAction onClick={() => setSelectedId(item.id)}>
                        {t('查看详情')}
                      </LinkAction>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {!cases.length && (
            <EmptyState
              title={t('此状态下暂无会诊')}
              description={t('查看其他分类，或浏览下方的会诊流程规划。')}
            />
          )}
          <Card className="feature-card-pad">
            <div style={{ marginTop: 8 }}>
              <SectionTitle
                title={t('会诊协作流程')}
                subtitle={t('WORKFLOW PREVIEW · 以下步骤将在后续迭代接入')}
              />
              <div className="feature-workflow">
                {[
                  { title: '提出需求', note: '整理病情与问题' },
                  { title: '授权共享', note: '限定病历访问范围' },
                  { title: '邀请专家', note: '确认参与时间' },
                  { title: '联合讨论', note: '记录专科意见' },
                  { title: '出具报告', note: '审核后归档' },
                ].map((item, index) => (
                  <div className="feature-workflow-step" key={item.title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <h4>{t(item.title)}</h4>
                    <p>{t(item.note)}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <ReadOnlyNote />
        </>
      )}
      {requestOpen && (
        <RequestDialog
          onClose={() => setRequestOpen(false)}
          onCreate={(item, setup) => {
            setLocalCases((current) => [item, ...current]);
            setLocalSetups((current) => ({ ...current, [item.id]: setup }));
          }}
        />
      )}
      {selected && (
        <FeatureDialog
          title={t(selected.title)}
          subtitle={t('{value0} · 会诊详情预览', { value0: selected.id })}
          onClose={close}
        >
          <Badge tone={tones[selected.status]}>{t(statuses[selected.status])}</Badge>
          <DetailGrid
            items={[
              { label: '患者', value: selected.patientName },
              { label: '会诊专科', value: selected.specialty },
              {
                label: '计划时间',
                value: formatDate(selected.scheduledAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              },
              {
                label: '参与医生',
                value: selected.participants.join(language === 'en' ? ', ' : '、'),
              },
            ]}
          />
          <h4 className="feature-small-heading">{t('会诊摘要')}</h4>
          <p className="feature-prose">{selected.summary}</p>
          <div className="encounter-room-action consultation-detail-actions">
            {selected.direction === 'received' && selected.status === 'requested' && (
              <Button
                className="consultation-accept-button consultation-accept-button--detail"
                variant="secondary"
                onClick={() => acceptConsultation(selected.id)}
              >
                {t('接受申请')}
              </Button>
            )}
            <Button
              className="consultation-enter-room-button"
              variant="secondary"
              disabled={selected.status === 'requested'}
              onClick={() => {
                setRoomId(selected.id);
                close();
              }}
            >
              <Network size={16} />
              {t('进入诊室')}
            </Button>
          </div>
          {selected.status === 'requested' && (
            <p className="feature-prose consultation-room-locked-note">
              {t('申请尚未接受，不能进入诊室。')}
            </p>
          )}
          <div className="feature-document">
            <div className="feature-document-head">
              <h3>{t('联合会诊报告')}</h3>
              <p>{t('报告编辑、专科意见与签署 · 尚未上线')}</p>
            </div>
            <div className="feature-document-field">
              <span>{t('报告预留内容')}</span>
              <p>{t('病情摘要 · 会诊目的 · 专科意见 · 综合结论 · 随访安排 · 医生签署')}</p>
            </div>
          </div>
          <ReadOnlyNote>{t('会诊摘要来自虚构演示数据，不作为真实诊断或治疗依据。')}</ReadOnlyNote>
        </FeatureDialog>
      )}
    </div>
  );
}
