import { useI18n } from '../../shared/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  Layers3,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { MedicalRecord, MedicalRecordTemplateDefinition } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import { FilterTabs, LinkAction, Metric, ReadOnlyNote, SectionTitle } from '../ui';
import { RecordEditor } from './RecordEditor';

const labels = { draft: '草稿', 'pending-review': '待审核', archived: '已归档' };
const tones = { draft: 'slate', 'pending-review': 'amber', archived: 'teal' } as const;
export function RecordsPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<MedicalRecord[]>('/records');
  const templateCatalogue = useApi<MedicalRecordTemplateDefinition[]>('/record-templates');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState('outpatient');
  const [tab, setTab] = useState('records');
  const close = useCallback(() => setSelectedId(null), []);
  const records = useMemo(
    () =>
      (data ?? []).filter(
        (record) =>
          (status === 'all' || record.status === status) &&
          `${record.patientName} ${record.title} ${record.id}`.includes(query.trim()),
      ),
    [data, query, status],
  );
  const templates = templateCatalogue.data ?? [];
  const currentTemplate = templates.find((item) => item.id === template) ?? templates[0];
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="ELECTRONIC MEDICAL RECORDS"
        title={t('电子病历')}
        description={t('规范记录每一次诊疗，让患者照护连贯、清晰且可追溯。')}
        action={
          <Button onClick={() => setCreating(true)}>
            <FilePlus2 size={16} />
            {t('新建病历')}
          </Button>
        }
      />
      {loading || templateCatalogue.loading || error || templateCatalogue.error ? (
        <LoadingState
          error={error || templateCatalogue.error}
          onRetry={() => {
            reload();
            templateCatalogue.reload();
          }}
        />
      ) : (
        <>
          <div className="feature-metrics">
            <Metric
              icon={FileText}
              label={t('病历总数')}
              value={data?.length ?? 0}
              detail={t('当前医生的演示病历')}
            />
            <Metric
              icon={FileClock}
              label={t('草稿病历')}
              value={data?.filter((record) => record.status === 'draft').length ?? 0}
              detail={t('可编辑并保存到本地')}
              tone="blue"
            />
            <Metric
              icon={ClipboardCheck}
              label={t('等待审核')}
              value={data?.filter((record) => record.status === 'pending-review').length ?? 0}
              detail={t('本地可提交、审核、归档和修订')}
              tone="amber"
            />
            <Metric
              icon={FileCheck2}
              label={t('已归档')}
              value={data?.filter((record) => record.status === 'archived').length ?? 0}
              detail={t('版本与归档元数据预览')}
            />
          </div>
          <Card className="feature-card-pad">
            <div className="feature-toolbar">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'records', label: '病历管理' },
                  { value: 'templates', label: '模板预览' },
                  { value: 'workflow', label: '诊疗流程' },
                ]}
                label={t('病历模块视图')}
              />
              <Badge tone="blue">{t('本地草稿')}</Badge>
            </div>
            {tab === 'records' && (
              <>
                <div className="feature-toolbar">
                  <FilterTabs
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: 'all', label: '全部', count: data?.length },
                      { value: 'draft', label: '草稿' },
                      { value: 'pending-review', label: '待审核' },
                      { value: 'archived', label: '已归档' },
                    ]}
                  />
                  <label className="feature-search">
                    <Search size={16} />
                    <input
                      aria-label={t('搜索患者、病历编号或标题')}
                      placeholder={t('搜索患者、病历编号或标题')}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                {records.length ? (
                  <div className="feature-table-wrap">
                    <table className="feature-table">
                      <thead>
                        <tr>
                          <th>{t('病历名称')}</th>
                          <th>{t('患者')}</th>
                          <th>{t('更新时间')}</th>
                          <th>{t('版本')}</th>
                          <th>{t('状态')}</th>
                          <th>{t('操作')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record) => (
                          <tr key={record.id}>
                            <td>
                              <div className="feature-person">
                                <span className="feature-symbol">
                                  <FileText size={17} />
                                </span>
                                <div>
                                  <strong>{record.title}</strong>
                                  <small>{record.id}</small>
                                </div>
                              </div>
                            </td>
                            <td>{record.patientName}</td>
                            <td>
                              {formatDate(record.updatedAt, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </td>
                            <td>
                              <span className="audit-code">v{record.version}.0</span>
                            </td>
                            <td>
                              <Badge tone={tones[record.status]}>{t(labels[record.status])}</Badge>
                            </td>
                            <td>
                              <LinkAction onClick={() => setSelectedId(record.id)}>
                                {t('查看记录')}
                              </LinkAction>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title={t('没有符合条件的病历')}
                    description={t('请调整搜索关键词或状态筛选。')}
                  />
                )}
              </>
            )}
            {tab === 'templates' && (
              <div className="feature-template-layout">
                <div className="feature-template-menu">
                  {templates.map((item) => (
                    <button
                      key={item.id}
                      className={`feature-template-button ${template === item.id ? 'active' : ''}`}
                      onClick={() => setTemplate(item.id)}
                      aria-pressed={template === item.id}
                    >
                      {t(item.titleKey)}
                      <small>{t(item.subtitleKey)}</small>
                    </button>
                  ))}
                </div>
                <div className="feature-document">
                  <div className="feature-document-head">
                    <h3>{t(currentTemplate!.titleKey)}</h3>
                    <p>{t('结构预览 · 新建草稿时可选择此模板')}</p>
                  </div>
                  {currentTemplate!.fields.map((field) => (
                    <div className="feature-document-field" key={field.key}>
                      <span>{t(field.labelKey)}</span>
                      <p>{t('创建病历草稿后，由当前医生填写此字段。')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'workflow' && (
              <>
                <SectionTitle
                  title={t('从记录到归档，每一步都有依据')}
                  subtitle={t('当前本地演示支持提交、退回、批准、归档和修订留痕。')}
                />
                <div className="feature-workflow">
                  {[
                    { title: '创建草稿', note: '医生编辑' },
                    { title: '提交审核', note: '完整性检查' },
                    { title: '审核签名', note: '权限校验' },
                    { title: '病历归档', note: '锁定版本' },
                    { title: '修订留痕', note: '新增版本' },
                  ].map((item, index) => (
                    <div className="feature-workflow-step" key={item.title}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <h4>{t(item.title)}</h4>
                      <p>{t(item.note)}</p>
                    </div>
                  ))}
                </div>
                <div className="feature-notice">
                  <ShieldCheck size={18} />
                  <span>
                    {t(
                      '本地演示已支持病历提交、审核、归档、修订和确认式开立医嘱。电子处方、正式签名与临床规则认证仍待启用。',
                    )}
                  </span>
                </div>
              </>
            )}
          </Card>
          <div className="feature-card-grid" style={{ marginTop: 22 }}>
            {[
              {
                icon: ClipboardCheck,
                title: '结构化医嘱',
                description: '打开病历即可按模板确认开立、修改和停止医嘱。电子处方尚未上线。',
              },
              {
                icon: Layers3,
                title: '版本与修订记录',
                description: '打开病历即可查看版本历史、作者、时间和修订原因。',
              },
              {
                icon: ShieldCheck,
                title: '审核与归档',
                description: '本地演示已支持审核、归档和修订；正式签名与临床规则仍待启用。',
              },
            ].map((item) => (
              <Card className="feature-service-card" key={item.title}>
                <div className="feature-service-top">
                  <span className="feature-symbol">
                    <item.icon size={19} />
                  </span>
                  <Badge tone="teal">{t('本地演示')}</Badge>
                </div>
                <h3>{t(item.title)}</h3>
                <p>{t(item.description)}</p>
                <LinkAction onClick={() => setSelectedId(data?.[0]?.id ?? null)}>
                  {t('打开病历查看')}
                </LinkAction>
              </Card>
            ))}
          </div>
          <ReadOnlyNote />
        </>
      )}
      {selectedId && <RecordEditor recordId={selectedId} onClose={close} onSaved={reload} />}
      {creating && <RecordEditor onClose={() => setCreating(false)} onSaved={reload} />}
    </div>
  );
}
