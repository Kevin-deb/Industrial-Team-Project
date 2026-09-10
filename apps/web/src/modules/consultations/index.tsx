import { useCallback, useMemo, useState } from 'react';
import {
  CalendarClock,
  ClipboardList,
  FileCheck2,
  Network,
  Plus,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import type { Consultation } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../../shared/ui';
import {
  DetailGrid,
  FeatureDialog,
  FilterTabs,
  LinkAction,
  PlannedDialog,
  ReadOnlyNote,
  SectionTitle,
} from '../ui';

const statuses = { requested: '申请中', scheduled: '已安排', completed: '已完成' };
const tones = { requested: 'amber', scheduled: 'blue', completed: 'teal' } as const;

export function ConsultationsPage() {
  const { data, loading, error, reload } = useApi<Consultation[]>('/consultations');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Consultation | null>(null);
  const [planned, setPlanned] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const closePlanned = useCallback(() => setPlanned(null), []);
  const cases = useMemo(
    () => (data ?? []).filter((item) => status === 'all' || item.status === status),
    [data, status],
  );
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="MULTIDISCIPLINARY CARE"
        title="专家会诊"
        description="汇聚不同专科的经验，为复杂的照护需求找到更完整的解答。"
        action={
          <Button onClick={() => setPlanned('发起专家会诊')}>
            <Plus size={16} />
            发起会诊
          </Button>
        }
      />
      <div className="feature-hero-note">
        <div>
          <span className="feature-eyebrow">BETTER CARE, TOGETHER</span>
          <h2>以患者为中心，让协作更有序</h2>
          <p>
            从会诊申请、专家邀请到综合意见归档，每个环节都围绕同一份照护需求展开。当前提供演示会诊目录与流程预览。
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
                { value: 'all', label: '全部会诊', count: data?.length },
                { value: 'requested', label: '申请中' },
                { value: 'scheduled', label: '已安排' },
                { value: 'completed', label: '已完成' },
              ]}
            />
            <span className="feature-mini-label">当前医生相关的会诊安排</span>
          </div>
          <div className="feature-card-grid">
            {cases.map((item) => (
              <Card className="mdt-case" key={item.id}>
                <div className="mdt-case-heading">
                  <span className="feature-symbol blue">
                    <UsersRound size={20} />
                  </span>
                  <Badge tone={tones[item.status]}>{statuses[item.status]}</Badge>
                </div>
                <span className="feature-eyebrow">{item.id}</span>
                <h3>{item.title}</h3>
                <p>
                  {item.patientName} · {item.patientId}
                </p>
                <div className="mdt-specialties">
                  <span>{item.specialty}</span>
                  <span>{item.participants.length} 位参与医生</span>
                </div>
                <p className="feature-inline-icon">
                  <CalendarClock size={13} />
                  {item.scheduledAt.replace('T', ' ').slice(0, 16)}
                </p>
                <div className="mdt-footer" style={{ marginTop: 18 }}>
                  <span>演示会诊</span>
                  <LinkAction onClick={() => setSelected(item)}>查看详情</LinkAction>
                </div>
              </Card>
            ))}
          </div>
          {!cases.length && (
            <EmptyState
              title="此状态下暂无会诊"
              description="查看其他分类，或浏览下方的会诊流程规划。"
            />
          )}
          <Card className="feature-card-pad">
            <div style={{ marginTop: 8 }}>
              <SectionTitle
                title="会诊协作流程"
                subtitle="WORKFLOW PREVIEW · 以下步骤将在后续迭代接入"
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
                    <h4>{item.title}</h4>
                    <p>{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <div className="feature-card-grid" style={{ marginTop: 20 }}>
            {[
              {
                icon: ClipboardList,
                title: '会诊材料',
                copy: '按会诊任务共享必要材料，附件访问单独授权。',
              },
              {
                icon: ShieldCheck,
                title: '临时访问授权',
                copy: '仅参与专家可查看授权范围内的患者信息。',
              },
              {
                icon: FileCheck2,
                title: '联合会诊报告',
                copy: '整合专科意见，审核签署后关联患者病历。',
              },
            ].map((item) => (
              <Card className="feature-service-card" key={item.title}>
                <div className="feature-service-top">
                  <span className="feature-symbol">
                    <item.icon size={19} />
                  </span>
                  <Badge tone="slate">规划中</Badge>
                </div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <LinkAction onClick={() => setPlanned(item.title)}>了解设计</LinkAction>
              </Card>
            ))}
          </div>
          <ReadOnlyNote />
        </>
      )}
      {selected && (
        <FeatureDialog
          title={selected.title}
          subtitle={`${selected.id} · 会诊详情预览`}
          onClose={close}
        >
          <Badge tone={tones[selected.status]}>{statuses[selected.status]}</Badge>
          <DetailGrid
            items={[
              { label: '患者', value: selected.patientName },
              { label: '会诊专科', value: selected.specialty },
              { label: '计划时间', value: selected.scheduledAt.replace('T', ' ').slice(0, 16) },
              { label: '参与医生', value: selected.participants.join('、') },
            ]}
          />
          <h4 className="feature-small-heading">会诊摘要</h4>
          <p className="feature-prose">{selected.summary}</p>
          <div className="feature-document">
            <div className="feature-document-head">
              <h3>联合会诊报告</h3>
              <p>报告编辑、专科意见与签署 · 尚未上线</p>
            </div>
            <div className="feature-document-field">
              <span>报告预留内容</span>
              <p>病情摘要 · 会诊目的 · 专科意见 · 综合结论 · 随访安排 · 医生签署</p>
            </div>
          </div>
          <ReadOnlyNote>会诊摘要来自虚构演示数据，不作为真实诊断或治疗依据。</ReadOnlyNote>
        </FeatureDialog>
      )}
      {planned && (
        <PlannedDialog title={planned} iteration="Iteration 3" onClose={closePlanned}>
          <p>专家会诊将支持申请、邀请、患者授权、跨专科讨论及会诊报告审核归档。</p>
          <p>
            共享权限按会诊任务设置范围和有效期。专家邀请、实时讨论及报告提交尚未接入，此预览不会发送邀请或共享患者档案。
          </p>
        </PlannedDialog>
      )}
    </div>
  );
}
