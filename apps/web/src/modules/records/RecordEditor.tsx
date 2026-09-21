import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, RotateCcw, Save, Send, ShieldCheck } from 'lucide-react';
import type {
  Consultation,
  CreateMedicalRecordRequest,
  Encounter,
  MedicalOrder,
  MedicalOrderTemplateDefinition,
  MedicalOrderTemplateId,
  MedicalRecordDetail,
  MedicalRecordTemplateDefinition,
  MedicalRecordTemplateId,
  MedicalRecordVersion,
  Patient,
  ReviewMedicalRecordRequest,
  UpdateMedicalRecordRequest,
} from '@doctor/contracts';
import { ApiRequestError, requestApi, useApi } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Badge, Button, LoadingState } from '../../shared/ui';
import { FeatureDialog, ReadOnlyNote } from '../ui';
import { emptyOrderPayload, emptyRecordBody } from './templates';

interface EditorProps {
  recordId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  patientId: string;
  encounterId: string;
  templateId: MedicalRecordTemplateId;
  title: string;
  diagnosis: string;
  body: Record<string, string>;
}

const blankForm = (): FormState => ({
  patientId: '',
  encounterId: '',
  templateId: 'outpatient',
  title: '',
  diagnosis: '',
  body: {},
});

function formFromRecord(record: MedicalRecordDetail): FormState {
  return {
    patientId: record.patientId,
    encounterId: record.encounterId ?? '',
    templateId: record.templateId,
    title: record.title,
    diagnosis: record.diagnosis,
    body: record.body,
  };
}

export function RecordEditor({ recordId, onClose, onSaved }: EditorProps) {
  const { t, formatDate } = useI18n();
  const {
    data: patients,
    loading: patientsLoading,
    error: patientsError,
  } = useApi<Patient[]>('/patients?pageSize=100');
  const {
    data: encounters,
    loading: encountersLoading,
    error: encountersError,
  } = useApi<Encounter[]>('/encounters');
  const {
    data: templates,
    loading: templatesLoading,
    error: templatesError,
  } = useApi<MedicalRecordTemplateDefinition[]>('/record-templates');
  const {
    data: orderTemplates,
    loading: orderTemplatesLoading,
    error: orderTemplatesError,
  } = useApi<MedicalOrderTemplateDefinition[]>('/order-templates');
  const {
    data: consultations,
    loading: consultationsLoading,
    error: consultationsError,
  } = useApi<Consultation[]>('/consultations');
  const [record, setRecord] = useState<MedicalRecordDetail | null>(null);
  const [versions, setVersions] = useState<MedicalRecordVersion[]>([]);
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [orderTemplateId, setOrderTemplateId] = useState<MedicalOrderTemplateId>('medication');
  const [orderPayload, setOrderPayload] = useState<Record<string, string>>({});
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [stopReasons, setStopReasons] = useState<Record<string, string>>({});
  const [changeReasons, setChangeReasons] = useState<Record<string, string>>({});
  const [consultationId, setConsultationId] = useState('');
  const [materialPurpose, setMaterialPurpose] = useState('');
  const [sharedSections, setSharedSections] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(blankForm);
  const [initial, setInitial] = useState(JSON.stringify(blankForm()));
  const [reviewComment, setReviewComment] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [loadingRecord, setLoadingRecord] = useState(!!recordId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const commandKeys = useRef<Record<string, string>>({});

  const adopt = useCallback((nextRecord: MedicalRecordDetail) => {
    const next = formFromRecord(nextRecord);
    setRecord(nextRecord);
    setForm(next);
    setInitial(JSON.stringify(next));
  }, []);

  const loadRecord = useCallback(async () => {
    if (!recordId) return;
    setLoadingRecord(true);
    setLoadError(null);
    try {
      const [detail, history, linkedOrders] = await Promise.all([
        requestApi<MedicalRecordDetail>(`/records/${recordId}`),
        requestApi<MedicalRecordVersion[]>(`/records/${recordId}/versions`),
        requestApi<MedicalOrder[]>(`/orders?recordId=${encodeURIComponent(recordId)}`),
      ]);
      adopt(detail.data);
      setVersions(history.data);
      setOrders(linkedOrders.data);
      setNotice(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法加载病历');
    } finally {
      setLoadingRecord(false);
    }
  }, [adopt, recordId]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    if (recordId || !templates?.length || Object.keys(form.body).length) return;
    const template = templates.find((item) => item.id === form.templateId) ?? templates[0];
    const next = { ...form, templateId: template.id, body: emptyRecordBody(template) };
    setForm(next);
    setInitial(JSON.stringify(next));
  }, [form, recordId, templates]);

  useEffect(() => {
    const current =
      orderTemplates?.find((item) => item.id === orderTemplateId) ?? orderTemplates?.[0];
    if (!current || Object.keys(orderPayload).length) return;
    setOrderTemplateId(current.id);
    setOrderPayload(emptyOrderPayload(current));
  }, [orderPayload, orderTemplateId, orderTemplates]);

  const dirty = JSON.stringify(form) !== initial;
  const editable = !record || Boolean(record.availableActions.canEdit);
  const template = templates?.find((item) => item.id === form.templateId);
  const matchingEncounters = useMemo(
    () => (encounters ?? []).filter((item) => item.patientId === form.patientId),
    [encounters, form.patientId],
  );
  const complete = Boolean(
    template &&
    form.title.trim() &&
    form.diagnosis.trim() &&
    template.fields.every((field) => !field.requiredOnSubmit || form.body[field.key]?.trim()),
  );

  function closeSafely() {
    if (dirty && !window.confirm(t('尚有未保存的更改，确定要关闭吗？'))) return;
    onClose();
  }

  async function save() {
    if (!form.patientId || !form.title.trim() || !form.diagnosis.trim()) {
      setNotice({ tone: 'error', text: '请填写患者、病历标题和诊断。' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      let saved: MedicalRecordDetail;
      if (record) {
        const payload: UpdateMedicalRecordRequest = {
          title: form.title.trim(),
          diagnosis: form.diagnosis.trim(),
          body: form.body,
        };
        saved = (
          await requestApi<MedicalRecordDetail>(`/records/${record.id}`, {
            method: 'PATCH',
            headers: { 'If-Match': `"record-v${record.version}"` },
            body: JSON.stringify(payload),
          })
        ).data;
      } else {
        const payload: CreateMedicalRecordRequest = {
          patientId: form.patientId,
          ...(form.encounterId ? { encounterId: form.encounterId } : {}),
          templateId: form.templateId,
          title: form.title.trim(),
          diagnosis: form.diagnosis.trim(),
          body: form.body,
        };
        saved = (
          await requestApi<MedicalRecordDetail>('/records', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        ).data;
      }
      adopt(saved);
      const history = await requestApi<MedicalRecordVersion[]>(`/records/${saved.id}/versions`);
      setVersions(history.data);
      setNotice({ tone: 'success', text: '草稿已保存到本地数据库。' });
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 412)
        setNotice({
          tone: 'error',
          text: '该病历已有新版本。你的输入已保留，请重新加载后再编辑。',
        });
      else
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : '保存失败，请稍后重试。',
        });
    } finally {
      setSaving(false);
    }
  }

  async function runCommand(path: string, successText: string, body: object = {}) {
    if (!record) return;
    if (dirty) {
      setNotice({ tone: 'error', text: '请先保存当前修改再继续。' });
      return;
    }
    const key = commandKeys.current[path] ?? crypto.randomUUID();
    commandKeys.current[path] = key;
    setSaving(true);
    setNotice(null);
    try {
      const saved = (
        await requestApi<MedicalRecordDetail>(path, {
          method: 'POST',
          headers: {
            'If-Match': `"record-v${record.version}"`,
            'Idempotency-Key': key,
          },
          body: JSON.stringify(body),
        })
      ).data;
      delete commandKeys.current[path];
      adopt(saved);
      const history = await requestApi<MedicalRecordVersion[]>(`/records/${saved.id}/versions`);
      setVersions(history.data);
      setNotice({ tone: 'success', text: successText });
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 412)
        setNotice({
          tone: 'error',
          text: '该病历已有新版本。你的输入已保留，请重新加载后再编辑。',
        });
      else
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : '操作失败，请稍后重试。',
        });
    } finally {
      setSaving(false);
    }
  }

  async function reloadOrders(id: string) {
    const linked = await requestApi<MedicalOrder[]>(`/orders?recordId=${encodeURIComponent(id)}`);
    setOrders(linked.data);
  }

  async function createOrder() {
    if (!record) return;
    const currentTemplate =
      orderTemplates?.find((item) => item.id === orderTemplateId) ?? orderTemplates?.[0];
    if (!currentTemplate) return;
    const key = commandKeys.current['create-order'] ?? crypto.randomUUID();
    commandKeys.current['create-order'] = key;
    setSaving(true);
    setNotice(null);
    try {
      await requestApi(`/records/${record.id}/orders`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({
          templateId: currentTemplate.id,
          payload: orderPayload,
          confirmed: orderConfirmed,
        }),
      });
      delete commandKeys.current['create-order'];
      setOrderConfirmed(false);
      await reloadOrders(record.id);
      setNotice({ tone: 'success', text: '医嘱已确认开立。' });
      onSaved();
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '开立医嘱失败，请稍后重试。',
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateOrder(order: MedicalOrder) {
    const currentTemplate =
      orderTemplates?.find((item) => item.id === orderTemplateId) ?? orderTemplates?.[0];
    if (!currentTemplate || currentTemplate.id !== order.type) {
      setNotice({ tone: 'error', text: '请先选择与该医嘱相同的开单模板。' });
      return;
    }
    const changeReason = changeReasons[order.id]?.trim();
    if (!changeReason) {
      setNotice({ tone: 'error', text: '修改医嘱必须填写变更原因。' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await requestApi(`/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': `"order-v${order.version}"` },
        body: JSON.stringify({ payload: orderPayload, changeReason }),
      });
      await reloadOrders(record!.id);
      setNotice({ tone: 'success', text: '医嘱已保存新版本。' });
      onSaved();
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '修改医嘱失败，请稍后重试。',
      });
    } finally {
      setSaving(false);
    }
  }

  async function stopOrder(order: MedicalOrder) {
    const reason = stopReasons[order.id]?.trim();
    if (!reason) {
      setNotice({ tone: 'error', text: '停止医嘱必须填写原因。' });
      return;
    }
    const path = `stop-${order.id}`;
    const key = commandKeys.current[path] ?? crypto.randomUUID();
    commandKeys.current[path] = key;
    setSaving(true);
    setNotice(null);
    try {
      await requestApi(`/orders/${order.id}/stop`, {
        method: 'POST',
        headers: { 'If-Match': `"order-v${order.version}"`, 'Idempotency-Key': key },
        body: JSON.stringify({ reason }),
      });
      delete commandKeys.current[path];
      await reloadOrders(record!.id);
      setNotice({ tone: 'success', text: '医嘱已停止。' });
      onSaved();
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '停止医嘱失败，请稍后重试。',
      });
    } finally {
      setSaving(false);
    }
  }

  async function shareMaterial() {
    if (!record) return;
    const key = commandKeys.current['share-material'] ?? crypto.randomUUID();
    commandKeys.current['share-material'] = key;
    setSaving(true);
    setNotice(null);
    try {
      await requestApi('/clinical-materials', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({
          consultationId,
          recordId: record.id,
          recordVersion: record.version,
          sharedSections,
          purpose: materialPurpose.trim(),
        }),
      });
      delete commandKeys.current['share-material'];
      setNotice({ tone: 'success', text: '已将当前病历版本引用到会诊。' });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '引用会诊材料失败，请稍后重试。',
      });
    } finally {
      setSaving(false);
    }
  }

  const loading =
    loadingRecord ||
    patientsLoading ||
    encountersLoading ||
    templatesLoading ||
    orderTemplatesLoading ||
    consultationsLoading;
  const error =
    loadError ||
    patientsError ||
    encountersError ||
    templatesError ||
    orderTemplatesError ||
    consultationsError ||
    (!templatesLoading && !template ? '无法加载病历模板' : null);
  const currentOrderTemplate =
    orderTemplates?.find((item) => item.id === orderTemplateId) ?? orderTemplates?.[0];
  return (
    <FeatureDialog
      title={record ? record.title : '新建电子病历'}
      subtitle={record ? `${record.id} · v${record.version}.0` : '结构化病历草稿'}
      onClose={closeSafely}
      wide
    >
      {loading || error ? (
        <LoadingState error={error} onRetry={recordId ? loadRecord : undefined} />
      ) : (
        <form
          className="record-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="record-editor-grid">
            <label>
              <span>{t('患者')}</span>
              <select
                aria-label={t('选择患者')}
                value={form.patientId}
                disabled={!!record || !editable}
                onChange={(event) =>
                  setForm((value) => ({ ...value, patientId: event.target.value, encounterId: '' }))
                }
              >
                <option value="">{t('请选择患者')}</option>
                {(patients ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('关联问诊')}</span>
              <select
                aria-label={t('选择关联问诊')}
                value={form.encounterId}
                disabled={!!record || !editable || !form.patientId}
                onChange={(event) =>
                  setForm((value) => ({ ...value, encounterId: event.target.value }))
                }
              >
                <option value="">{t('不关联问诊')}</option>
                {matchingEncounters.map((encounter) => (
                  <option key={encounter.id} value={encounter.id}>
                    {encounter.id} · {encounter.reason}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('病历模板')}</span>
              <select
                aria-label={t('选择病历模板')}
                value={form.templateId}
                disabled={!!record || !editable}
                onChange={(event) => {
                  const templateId = event.target.value as MedicalRecordTemplateId;
                  const nextTemplate = templates?.find((item) => item.id === templateId);
                  if (!nextTemplate) return;
                  setForm((value) => ({
                    ...value,
                    templateId,
                    body: emptyRecordBody(nextTemplate),
                  }));
                }}
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
                value={form.title}
                disabled={!editable}
                onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
              />
            </label>
            <label className="record-editor-span">
              <span>{t('诊断')}</span>
              <input
                aria-label={t('诊断')}
                maxLength={200}
                value={form.diagnosis}
                disabled={!editable}
                onChange={(event) =>
                  setForm((value) => ({ ...value, diagnosis: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="record-editor-fields">
            <div className="record-editor-section-title">
              <div>
                <strong>{t(template!.titleKey)}</strong>
                <span>{t(template!.subtitleKey)}</span>
              </div>
              <Badge tone={editable ? 'blue' : record?.status === 'archived' ? 'teal' : 'amber'}>
                {t(
                  editable
                    ? '可编辑草稿'
                    : record?.latestReview?.decision === 'approved'
                      ? '已批准待归档'
                      : '只读病历',
                )}
              </Badge>
            </div>
            {template!.fields.map((field) => (
              <label key={field.key}>
                <span>
                  {t(field.labelKey)}
                  {field.requiredOnSubmit ? t('（提交必填）') : ''}
                </span>
                <textarea
                  aria-label={t(field.labelKey)}
                  maxLength={field.maxLength}
                  rows={4}
                  value={form.body[field.key] ?? ''}
                  disabled={!editable}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      body: { ...value.body, [field.key]: event.target.value },
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {record?.latestReview && (
            <section className="record-editor-review">
              <strong>{t('最近审核')}</strong>
              <p>
                {t(record.latestReview.decision === 'approved' ? '已批准' : '已退回')}
                {' · '}
                {record.latestReview.reviewerName}
                {' · v'}
                {record.latestReview.recordVersion}
                {' · '}
                {formatDate(record.latestReview.reviewedAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
              {record.latestReview.comment && <p>{record.latestReview.comment}</p>}
            </section>
          )}
          {versions.length > 0 && (
            <section className="record-editor-history">
              <strong>{t('版本历史')}</strong>
              <ol>
                {versions.map((item) => (
                  <li key={item.version}>
                    <span>
                      v{item.version}.0 · {item.authorName} ·{' '}
                      {formatDate(item.authoredAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    {item.amendmentReason ? <small>{item.amendmentReason}</small> : null}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {record?.availableActions.canReview && (
            <label>
              <span>{t('审核意见')}</span>
              <textarea
                aria-label={t('审核意见')}
                maxLength={500}
                rows={3}
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
              />
            </label>
          )}
          {record?.availableActions.canCorrect && (
            <label>
              <span>{t('修订原因')}</span>
              <input
                aria-label={t('修订原因')}
                maxLength={500}
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
              />
            </label>
          )}
          {record && currentOrderTemplate && (
            <section className="record-editor-history">
              <strong>{t('医嘱')}</strong>
              <p>{t('模板只预填内容，确认后才会开立；停止后不可修改或重启。')}</p>
              <div className="record-editor-grid">
                <label>
                  <span>{t('开单模板')}</span>
                  <select
                    aria-label={t('开单模板')}
                    value={currentOrderTemplate.id}
                    onChange={(event) => {
                      const templateId = event.target.value as MedicalOrderTemplateId;
                      const next = orderTemplates?.find((item) => item.id === templateId);
                      if (!next) return;
                      setOrderTemplateId(templateId);
                      setOrderPayload(emptyOrderPayload(next));
                      setOrderConfirmed(false);
                    }}
                  >
                    {(orderTemplates ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {t(item.titleKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {currentOrderTemplate.fields.map((field) => (
                <label key={field.key}>
                  <span>
                    {t(field.labelKey)}
                    {field.required ? t('（提交必填）') : ''}
                  </span>
                  <input
                    aria-label={t(field.labelKey)}
                    maxLength={field.maxLength}
                    value={orderPayload[field.key] ?? ''}
                    onChange={(event) =>
                      setOrderPayload((value) => ({ ...value, [field.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="record-editor-confirm">
                <input
                  type="checkbox"
                  checked={orderConfirmed}
                  onChange={(event) => setOrderConfirmed(event.target.checked)}
                />
                <span>{t('我已核对模板预填内容，确认开立此医嘱')}</span>
              </label>
              <div className="record-editor-actions">
                <Button
                  type="button"
                  disabled={saving || !orderConfirmed}
                  onClick={() => void createOrder()}
                >
                  {t('确认开立医嘱')}
                </Button>
              </div>
              {orders.length ? (
                <ol>
                  {orders.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.id} ·{' '}
                        {t(
                          item.type === 'medication'
                            ? '用药医嘱'
                            : item.type === 'laboratory'
                              ? '检验医嘱'
                              : '检查医嘱',
                        )}{' '}
                        ·{' '}
                        {t(
                          item.status === 'active'
                            ? '进行中医嘱'
                            : item.status === 'stopped'
                              ? '已停止'
                              : '草稿医嘱',
                        )}{' '}
                        · v{item.version}
                      </span>
                      {item.status === 'active' ? (
                        <div className="record-editor-order-stop">
                          <input
                            aria-label={t('变更原因')}
                            placeholder={t('变更原因')}
                            value={changeReasons[item.id] ?? ''}
                            onChange={(event) =>
                              setChangeReasons((value) => ({
                                ...value,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={saving}
                            onClick={() => void updateOrder(item)}
                          >
                            {t('保存修改')}
                          </Button>
                          <input
                            aria-label={t('停止原因')}
                            placeholder={t('停止原因')}
                            value={stopReasons[item.id] ?? ''}
                            onChange={(event) =>
                              setStopReasons((value) => ({
                                ...value,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={saving}
                            onClick={() => void stopOrder(item)}
                          >
                            {t('停止医嘱')}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{t('当前病历尚无医嘱')}</p>
              )}
            </section>
          )}
          {record && (
            <section className="record-editor-history">
              <strong>{t('引用到会诊')}</strong>
              <p>{t('仅已批准或已归档版本可被远程会诊引用。')}</p>
              <label>
                <span>{t('会诊任务')}</span>
                <select
                  aria-label={t('会诊任务')}
                  value={consultationId}
                  onChange={(event) => setConsultationId(event.target.value)}
                >
                  <option value="">{t('选择会诊')}</option>
                  {(consultations ?? [])
                    .filter((item) => item.patientId === record.patientId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {item.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>{t('引用用途')}</span>
                <input
                  aria-label={t('引用用途')}
                  maxLength={500}
                  value={materialPurpose}
                  onChange={(event) => setMaterialPurpose(event.target.value)}
                />
              </label>
              <div className="record-editor-sections">
                {template!.fields.map((field) => (
                  <label key={field.key} className="record-editor-confirm">
                    <input
                      type="checkbox"
                      checked={sharedSections.includes(field.key)}
                      onChange={(event) =>
                        setSharedSections((current) =>
                          event.target.checked
                            ? [...current, field.key]
                            : current.filter((key) => key !== field.key),
                        )
                      }
                    />
                    <span>{t(field.labelKey)}</span>
                  </label>
                ))}
              </div>
              <div className="record-editor-actions">
                <Button
                  type="button"
                  disabled={
                    saving || !consultationId || !materialPurpose.trim() || !sharedSections.length
                  }
                  onClick={() => void shareMaterial()}
                >
                  {t('引用当前版本')}
                </Button>
              </div>
            </section>
          )}
          {notice && (
            <div className={`record-editor-notice ${notice.tone}`} role="status">
              <span>{t(notice.text)}</span>
              {notice.tone === 'error' && record && (
                <button type="button" onClick={() => void loadRecord()}>
                  {t('重新加载服务器版本')}
                </button>
              )}
            </div>
          )}
          <ReadOnlyNote>{t('当前仅保存虚构演示病历，不可用于真实诊疗。')}</ReadOnlyNote>
          <div className="record-editor-actions">
            <Button type="button" variant="secondary" onClick={closeSafely}>
              {t('关闭')}
            </Button>
            {editable && (
              <Button type="submit" disabled={saving || !dirty}>
                <Save size={16} />
                {t(saving ? '正在保存…' : '保存草稿')}
              </Button>
            )}
            {record?.availableActions.canSubmit && (
              <Button
                type="button"
                disabled={saving || dirty || !complete}
                onClick={() => void runCommand(`/records/${record.id}/submit`, '病历已提交审核。')}
              >
                <Send size={16} />
                {t('提交审核')}
              </Button>
            )}
            {record?.availableActions.canReview && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving || dirty || !reviewComment.trim()}
                  onClick={() =>
                    void runCommand(`/records/${record.id}/reviews`, '病历已退回修改。', {
                      decision: 'returned',
                      comment: reviewComment.trim(),
                    } satisfies ReviewMedicalRecordRequest)
                  }
                >
                  <RotateCcw size={16} />
                  {t('退回修改')}
                </Button>
                <Button
                  type="button"
                  disabled={saving || dirty}
                  onClick={() =>
                    void runCommand(`/records/${record.id}/reviews`, '已批准当前病历版本。', {
                      decision: 'approved',
                      comment: reviewComment.trim(),
                    } satisfies ReviewMedicalRecordRequest)
                  }
                >
                  <ShieldCheck size={16} />
                  {t('批准此版本')}
                </Button>
              </>
            )}
            {record?.availableActions.canArchive && (
              <Button
                type="button"
                disabled={saving || dirty}
                onClick={() => void runCommand(`/records/${record.id}/archive`, '病历已归档。')}
              >
                <Archive size={16} />
                {t('归档此版本')}
              </Button>
            )}
            {record?.availableActions.canCorrect && (
              <Button
                type="button"
                disabled={saving || dirty || !correctionReason.trim()}
                onClick={() =>
                  void runCommand(`/records/${record.id}/corrections`, '已从归档版本创建新草稿。', {
                    reason: correctionReason.trim(),
                  })
                }
              >
                {t('发起修订')}
              </Button>
            )}
          </div>
        </form>
      )}
    </FeatureDialog>
  );
}
