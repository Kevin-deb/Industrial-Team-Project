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
import type {
  Consultation,
  ConsultationContext,
  ConsultationDoctorOption,
  ConsultationMaterial,
  Patient,
} from '@doctor/contracts';
import { requestApi, useApi } from '../../shared/api';
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
const textEncoder = new TextEncoder();
type DraftMaterial = {
  title: string;
  fileName: string;
  description: string;
  objectUrl?: string;
};

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function dataUrlBytes(dataUrl: string) {
  const [, meta = '', data = ''] = dataUrl.match(/^data:([^,]*),(.*)$/) ?? [];
  if (meta.includes(';base64')) {
    const binary = atob(data);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return textEncoder.encode(decodeURIComponent(data));
}

function dataUrlMime(dataUrl: string) {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] ?? 'application/octet-stream';
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function dosDateTime(date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function uint32(value: number) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function uint16(value: number) {
  return [value & 255, (value >>> 8) & 255];
}

function zipBlob(files: Array<{ name: string; bytes: Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();
  for (const file of files) {
    const name = textEncoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const local = Uint8Array.from([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(dosTime),
      ...uint16(dosDate),
      ...uint32(checksum),
      ...uint32(file.bytes.length),
      ...uint32(file.bytes.length),
      ...uint16(name.length),
      ...uint16(0),
      ...name,
      ...file.bytes,
    ]);
    const central = Uint8Array.from([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(dosTime),
      ...uint16(dosDate),
      ...uint32(checksum),
      ...uint32(file.bytes.length),
      ...uint32(file.bytes.length),
      ...uint16(name.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
      ...name,
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Uint8Array.from([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralSize),
    ...uint32(offset),
    ...uint16(0),
  ]);
  const parts = [...localParts, ...centralParts, end].map((part) => {
    const buffer = new ArrayBuffer(part.byteLength);
    new Uint8Array(buffer).set(part);
    return buffer;
  });
  return new Blob(parts, { type: 'application/zip' });
}

function RequestDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [patientName, setPatientName] = useState('李明华');
  const [patientId, setPatientId] = useState('PAT-008');
  const [patientPicker, setPatientPicker] = useState<'name' | 'id' | null>(null);
  const [title, setTitle] = useState('疑难慢病多学科会诊');
  const [specialty, setSpecialty] = useState('全科医学 · 心血管内科 · 内分泌科');
  const [scheduledAt, setScheduledAt] = useState('2026-09-12T10:30');
  const [materials, setMaterials] = useState<DraftMaterial[]>([
    {
      title: '门诊病历摘要',
      fileName: '门诊病历摘要.txt',
      description: '发起会诊时补充的患者资料。',
    },
  ]);
  const [selectedDoctors, setSelectedDoctors] = useState<ConsultationDoctorOption[]>([]);
  const [doctorQuery, setDoctorQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const patients = useApi<Patient[]>('/patients?pageSize=100');
  const doctors = useApi<ConsultationDoctorOption[]>(
    `/consultation-doctors?q=${encodeURIComponent(doctorQuery.trim())}`,
  );
  const visiblePatients = useMemo(() => {
    const keyword = (patientPicker === 'id' ? patientId : patientName).trim().toLowerCase();
    return (patients.data ?? [])
      .filter((patient) =>
        keyword
          ? `${patient.name} ${patient.id} ${patient.diagnosis}`.toLowerCase().includes(keyword)
          : true,
      )
      .slice(0, 8);
  }, [patientId, patientName, patientPicker, patients.data]);
  const selectedPatient = useMemo(
    () => (patients.data ?? []).find((patient) => patient.id === patientId && patient.name === patientName),
    [patientId, patientName, patients.data],
  );
  const filteredDoctors = doctors.data ?? [];
  const selectPatient = (patient: Patient) => {
    setPatientName(patient.name);
    setPatientId(patient.id);
    setPatientPicker(null);
  };
  const addDoctor = (doctor: ConsultationDoctorOption) => {
    setSelectedDoctors((current) => (current.some((item) => item.id === doctor.id) ? current : [...current, doctor]));
  };
  const removeDoctor = (id: string) => {
    setSelectedDoctors((current) => current.filter((item) => item.id !== id));
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const uploaded = await Promise.all(
      Array.from(files).map(async (file) => ({
        title: file.name,
        fileName: file.name,
        description: '发起会诊时上传的患者资料。',
        objectUrl: await readFileAsDataUrl(file),
      })),
    );
    setMaterials((current) => [...current, ...uploaded]);
  };
  const create = async () => {
    if (!selectedPatient || !selectedDoctors.length || submitting) return;
    setSubmitting(true);
    try {
      await requestApi<Consultation>('/consultations', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          title,
          specialty,
          scheduledAt: new Date(scheduledAt).toISOString(),
          summary: '已发起远程会诊申请，等待专家确认参与。',
          participantIds: selectedDoctors.map((doctor) => doctor.id),
          materials,
        }),
      });
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <FeatureDialog title={t('发起专家会诊')} subtitle={t('填写会诊申请')} onClose={onClose}>
      <div className="consultation-request-form">
        <label className="consultation-patient-picker">
          <span>{t('患者姓名')}</span>
          <input
            value={patientName}
            onFocus={() => setPatientPicker('name')}
            onChange={(event) => {
              setPatientName(event.target.value);
              setPatientPicker('name');
            }}
            onBlur={() => window.setTimeout(() => setPatientPicker(null), 120)}
            placeholder={t('搜索患者姓名')}
          />
          {patientPicker === 'name' && (
            <div className="consultation-patient-results">
              {visiblePatients.map((patient) => (
                <button type="button" key={patient.id} onMouseDown={() => selectPatient(patient)}>
                  <strong>{patient.name}</strong>
                  <span>
                    {patient.id} · {patient.diagnosis}
                  </span>
                </button>
              ))}
              {!visiblePatients.length && <p>{t(patients.loading ? '正在加载患者' : '没有匹配的患者')}</p>}
            </div>
          )}
        </label>
        <label className="consultation-patient-picker">
          <span>{t('患者编号')}</span>
          <input
            value={patientId}
            onFocus={() => setPatientPicker('id')}
            onChange={(event) => {
              setPatientId(event.target.value);
              setPatientPicker('id');
            }}
            onBlur={() => window.setTimeout(() => setPatientPicker(null), 120)}
            placeholder={t('搜索患者编号')}
          />
          {patientPicker === 'id' && (
            <div className="consultation-patient-results">
              {visiblePatients.map((patient) => (
                <button type="button" key={patient.id} onMouseDown={() => selectPatient(patient)}>
                  <strong>{patient.id}</strong>
                  <span>
                    {patient.name} · {patient.diagnosis}
                  </span>
                </button>
              ))}
              {!visiblePatients.length && <p>{t(patients.loading ? '正在加载患者' : '没有匹配的患者')}</p>}
            </div>
          )}
        </label>
        {[
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
              const selected = selectedDoctors.some((item) => item.id === doctor.id);
              return (
                <article key={doctor.id}>
                  <div>
                  <strong>{t(doctor.name)}</strong>
                  <small>
                    {t(doctor.department)} · {t(doctor.title)}
                  </small>
                  </div>
                  <Button variant="secondary" disabled={selected} onClick={() => addDoctor(doctor)}>
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
          <input type="file" multiple onChange={(event) => void addFiles(event.target.files)} />
        </label>
        <div className="consultation-material-list">
          {materials.map((material) => (
            <span key={material.fileName}>{material.title}</span>
          ))}
        </div>
        <Button
          onClick={create}
          disabled={!selectedPatient || !selectedDoctors.length || submitting}
        >
          <FilePlus2 size={16} />
          {t(submitting ? '提交中' : '提交会诊申请')}
        </Button>
      </div>
    </FeatureDialog>
  );
}

function ConsultationRoom({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t, formatDate } = useI18n();
  const contextData = useApi<ConsultationContext>(`/consultations/${encodeURIComponent(id)}/context`);
  const [draft, setDraft] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; name?: string } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(true);
  const room = contextData.data;
  const item = room?.consultation;
  const materials = room?.materials ?? [];
  const messages = room?.messages ?? [];
  const participants = room?.participants ?? [];
  const reportText = room?.report?.body ?? '';
  const isFinished = item?.status === 'completed';
  const downloadText = (filename: string, content: string) => {
    downloadBlob(filename, new Blob([content], { type: 'text/plain;charset=utf-8' }));
  };
  const addFiles = async (files: FileList | null) => {
    if (isFinished) return;
    if (!files?.length) return;
    await Promise.all(
      Array.from(files).map(async (file) =>
        requestApi<ConsultationMaterial>(`/consultations/${encodeURIComponent(id)}/materials`, {
          method: 'POST',
          body: JSON.stringify({
            title: file.name,
            fileName: file.name,
            description: '会诊过程中补充上传的资料。',
            objectUrl: await readFileAsDataUrl(file),
          }),
        }),
      ),
    );
    contextData.reload();
  };
  const send = async () => {
    if (isFinished) return;
    const body = draft.trim();
    if (!body) return;
    await requestApi(`/consultations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    setDraft('');
    contextData.reload();
  };
  const sendImage = (files: FileList | null) => {
    if (isFinished) return;
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await requestApi(`/consultations/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: file.name,
          imageUrl: String(reader.result),
          imageName: file.name,
        }),
      });
      contextData.reload();
    };
    reader.readAsDataURL(file);
  };
  const finish = async () => {
    await requestApi(`/consultations/${encodeURIComponent(id)}/complete`, { method: 'POST' });
    setConfirmFinish(false);
    contextData.reload();
    onChanged();
  };
  const downloadMaterials = () => {
    if (!item) return;
    if (!materials.length) return;
    const files = materials.map((material, index) => ({
      name: material.objectUrl
        ? material.fileName || `${index + 1}-${material.title}`
        : `${String(index + 1).padStart(2, '0')}-${material.fileName.replace(/\.[^.]+$/, '')}.txt`,
      bytes: material.objectUrl
        ? dataUrlBytes(material.objectUrl)
        : textEncoder.encode(
            [`${t('会诊材料')}：${t(material.title)}`, `${item.title} · ${item.patientName}`, '', t(material.description)].join(
              '\n',
            ),
          ),
    }));
    downloadBlob(`${item.id}-materials.zip`, zipBlob(files));
  };
  const downloadMaterial = (material: ConsultationMaterial) => {
    if (!item) return;
    if (material.objectUrl) {
      const bytes = dataUrlBytes(material.objectUrl);
      downloadBlob(
        material.fileName || material.title,
        new Blob([arrayBufferFromBytes(bytes)], { type: dataUrlMime(material.objectUrl) }),
      );
      return;
    }
    downloadText(
      `${item.id}-${material.fileName.replace(/\.[^.]+$/, '')}.txt`,
      [`${t('会诊材料')}：${t(material.title)}`, `${item.title} · ${item.patientName}`, '', t(material.description)].join(
        '\n',
      ),
    );
  };
  const deleteMaterial = async (material: ConsultationMaterial) => {
    if (isFinished) return;
    if (!window.confirm(t('确定删除这份会诊材料吗？'))) return;
    await requestApi(
      `/consultations/${encodeURIComponent(id)}/materials/${encodeURIComponent(material.id)}`,
      { method: 'DELETE' },
    );
    contextData.reload();
  };
  const downloadReport = () => {
    if (!item) return;
    if (!reportText) return;
    downloadText(`${item.id}-consultation-report.txt`, reportText);
  };
  if (contextData.loading || contextData.error || !room || !item)
    return <LoadingState error={contextData.error} onRetry={contextData.reload} />;
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
                {participants.map((participant, index) => (
                  <article key={participant.id}>
                    <span className="consultation-participant-avatar">
                      {t(participant.name).slice(0, 1)}
                    </span>
                    <div>
                      <strong>{t(participant.name)}</strong>
                      <small>{index === 0 ? t('发起医生') : `${t(participant.department)} · ${t(participant.title)}`}</small>
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
                <li className="consultation-material-item" key={material.id}>
                  <span>{t(material.title)}</span>
                  <button
                    type="button"
                    onClick={() => downloadMaterial(material)}
                    aria-label={t('下载 {name}', { name: material.title })}
                  >
                    <Download size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={isFinished}
                    onClick={() => deleteMaterial(material)}
                    aria-label={t('删除 {name}', { name: material.title })}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="consultation-panel-actions">
              <Button variant="secondary" disabled={!materials.length} onClick={downloadMaterials}>
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
            <p>{t(room.access)}</p>
            <span>
              {t('有效期至')}{' '}
              {formatDate(room.accessUntil, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </section>
          <section className="consultation-setting-panel">
            <h3>
              <FileCheck2 size={16} />
              {t('联合会诊报告')}
            </h3>
            <p className="consultation-report-text">{reportText || t('会诊结束后生成联合报告')}</p>
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
                    message.authorName === '林知远'
                      ? 'consultation-message--doctor'
                      : 'consultation-message--expert'
                  }`}
                  key={message.id}
                >
                  <strong>{t(message.authorName === '林知远' ? '我' : message.authorName)}</strong>
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
  const allCases = useMemo<Consultation[]>(() => data ?? [], [data]);
  const selected = allCases.find((item) => item.id === selectedId) ?? null;
  const close = useCallback(() => setSelectedId(null), []);
  const acceptConsultation = useCallback(
    async (id: string) => {
      await requestApi<Consultation>(`/consultations/${encodeURIComponent(id)}/accept`, { method: 'POST' });
      reload();
    },
    [reload],
  );
  const cases = useMemo(
    () => allCases.filter((item) => status === 'all' || item.status === status),
    [allCases, status],
  );
  if (roomId)
    return (
      <ConsultationRoom
        id={roomId}
        onBack={() => setRoomId(null)}
        onChanged={reload}
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
          <Card className="feature-card-pad consultation-workflow-card">
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
          onCreated={reload}
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
