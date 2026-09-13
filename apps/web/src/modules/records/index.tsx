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
import type { MedicalRecord } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import { FilterTabs, LinkAction, Metric, PlannedDialog, ReadOnlyNote, SectionTitle } from '../ui';
import { RecordEditor } from './RecordEditor';
import { recordTemplates as templates } from './templates';

const labels = { draft: '草稿', 'pending-review': '待审核', archived: '已归档' };
const tones = { draft: 'slate', 'pending-review': 'amber', archived: 'teal' } as const;
export function RecordsPage() {
  const { t, formatDate } = useI18n();
  const { data, loading, error, reload } = useApi<MedicalRecord[]>('/records');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState('outpatient');
  const [tab, setTab] = useState('records');
  const [planned, setPlanned] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const closePlanned = useCallback(() => setPlanned(null), []);
  const records = useMemo(
    () =>
      (data ?? []).filter(
        (record) =>
          (status === 'all' || record.status === status) &&
          `${record.patientName} ${record.title} ${record.id}`.includes(query.trim()),
      ),
    [data, query, status],
  );
  const currentTemplate = templates.find((item) => item.id === template)!;
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
      {loading || error ? (
        <LoadingState error={error} onRetry={reload} />
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
              detail={t('审核及签名流程已规划')}
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
                      {t(item.title)}
                      <small>{t(item.subtitle)}</small>
                    </button>
                  ))}
                </div>
                <div className="feature-document">
                  <div className="feature-document-head">
                    <h3>{t(currentTemplate.title)}</h3>
                    <p>{t('结构预览 · 文本录入、保存及签名尚未上线')}</p>
                  </div>
                  {currentTemplate.fields.map((field) => (
                    <div className="feature-document-field" key={field.key}>
                      <span>{t(field.label)}</span>
                      <p>{t('正式开发后，由具备权限的医生在此填写并审核相关信息。')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'workflow' && (
              <>
                <SectionTitle
                  title={t('从记录到归档，每一步都有依据')}
                  subtitle={t('以下展示计划中的状态流转；当前仅提供只读元数据。')}
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
                      '处方、医嘱、检查申请、历史版本和签名归档均预留独立数据模型及服务接口。正式诊疗操作需在权限、审计与临床规则验证后启用。',
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
                title: '电子处方与医嘱',
                description: '处方内容、用药记录、审核状态与医嘱执行进度。',
              },
              {
                icon: Layers3,
                title: '版本与修订记录',
                description: '保留病历变更历史，将每次修订关联至操作者。',
              },
              {
                icon: ShieldCheck,
                title: '签名与归档',
                description: '完整性验证、分级审核、签名及归档流程。',
              },
            ].map((item) => (
              <Card className="feature-service-card" key={item.title}>
                <div className="feature-service-top">
                  <span className="feature-symbol">
                    <item.icon size={19} />
                  </span>
                  <Badge tone="slate">{t('尚未上线')}</Badge>
                </div>
                <h3>{t(item.title)}</h3>
                <p>{t(item.description)}</p>
                <LinkAction onClick={() => setPlanned(item.title)}>{t('查看功能规划')}</LinkAction>
              </Card>
            ))}
          </div>
          <ReadOnlyNote />
        </>
      )}
      {selectedId && <RecordEditor recordId={selectedId} onClose={close} onSaved={reload} />}
      {creating && <RecordEditor onClose={() => setCreating(false)} onSaved={reload} />}
      {planned && (
        <PlannedDialog title={planned} iteration="Iteration 2" onClose={closePlanned}>
          <p>
            {t(
              'Iteration 1 建立草稿基础，Iteration 2 完成结构化病历、医嘱、审核与归档。此功能将基于统一患者编号与病历版本模型开发，支持权限校验、草稿保存、内容校验、审核和操作留痕。',
            )}
          </p>
          <p>{t('当前框架已预留病历、处方、医嘱及修订记录的后端边界，页面展示设计流程。')}</p>
        </PlannedDialog>
      )}
    </div>
  );
}
