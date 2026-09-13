import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { commandId, FormDialog } from './FormDialog';
import { useAssessments, useCreateAssessment, usePlans } from './queries';

export function AssessmentsPanel({ patientId }: { patientId: string }) {
  const { t, formatDate } = useI18n();
  const assessments = useAssessments(patientId);
  const plans = usePlans(patientId);
  const create = useCreateAssessment(patientId);
  const [adding, setAdding] = useState(false);
  return (
    <section className="health-panel">
      <header className="health-panel-header">
        <div>
          <h2>{t('健康评估')}</h2>
          <p>{t('记录医生评估，不自动生成临床结论')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} />
          {t('新增评估')}
        </Button>
      </header>
      <div className="health-record-list">
        {(assessments.data?.data ?? []).map((item) => (
          <article key={item.id} className="health-record-card health-assessment-card">
            <div className="health-record-title">
              <h3>{formatDate(item.assessedAt, { dateStyle: 'long', timeStyle: 'short' })}</h3>
              {item.planId && (
                <small>
                  {t('关联计划')} · {item.planId}
                </small>
              )}
            </div>
            <p>{item.summary}</p>
            <ul>
              {item.recommendations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            {item.nextReview && (
              <div className="health-record-meta">
                <span>
                  {t('建议复核')}：{formatDate(item.nextReview)}
                </span>
              </div>
            )}
          </article>
        ))}
      </div>
      {adding && (
        <AssessmentForm
          patientId={patientId}
          plans={plans.data?.data ?? []}
          busy={create.isPending}
          error={create.error}
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function AssessmentForm({
  patientId,
  plans,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  patientId: string;
  plans: Array<{ id: string; title: string }>;
  busy: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: {
    commandId: string;
    patientId: string;
    planId?: string;
    assessedAt: string;
    summary: string;
    recommendations: string[];
    nextReview?: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [planId, setPlanId] = useState('');
  const [summary, setSummary] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [nextReview, setNextReview] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      commandId: commandId(),
      patientId,
      ...(planId ? { planId } : {}),
      assessedAt: '2026-09-13T09:30:00+08:00',
      summary,
      recommendations: recommendations
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      ...(nextReview ? { nextReview } : {}),
    }).catch(() => undefined);
  }
  return (
    <FormDialog title="新增健康评估" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          {t('关联计划')}
          <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
            <option value="">{t('不关联计划')}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('评估摘要')}
          <textarea
            required
            rows={4}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <label>
          {t('后续安排')}
          <textarea
            required
            rows={3}
            value={recommendations}
            onChange={(event) => setRecommendations(event.target.value)}
            placeholder={t('每行填写一项')}
          />
        </label>
        <label>
          {t('建议复核日期')}
          <input
            type="date"
            value={nextReview}
            onChange={(event) => setNextReview(event.target.value)}
          />
        </label>
        {error && <div className="health-inline-error">{error.message}</div>}
        <footer>
          <Button variant="secondary" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('正在保存…') : t('保存评估')}
          </Button>
        </footer>
      </form>
    </FormDialog>
  );
}
