import { History, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CarePlanDetail } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { EApiError } from '../e-shared';
import { commandId, FormDialog } from './FormDialog';
import { useCreatePlan, usePlanVersions, usePlans, useUpdatePlan } from './queries';

export function PlansPanel({ patientId }: { patientId: string }) {
  const { t, formatDate } = useI18n();
  const plans = usePlans(patientId);
  const create = useCreatePlan(patientId);
  const update = useUpdatePlan(patientId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState('');
  const editing = (plans.data?.data ?? []).find((plan) => plan.id === editingId) ?? null;
  const [historyId, setHistoryId] = useState('');
  const history = usePlanVersions(historyId);
  return (
    <section className="health-panel">
      <header className="health-panel-header">
        <div>
          <h2>{t('管理计划')}</h2>
          <p>{t('计划修改会保留版本记录')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} />
          {t('新建计划')}
        </Button>
      </header>
      <div className="health-record-list">
        {(plans.data?.data ?? []).map((plan) => (
          <article key={plan.id} className="health-record-card">
            <div className="health-record-title">
              <div>
                <h3>{plan.title}</h3>
                <span className={`health-status ${plan.status}`}>
                  {t(plan.status === 'active' ? '进行中' : '草稿')}
                </span>
              </div>
              <small>{t('版本 {version}', { version: plan.version })}</small>
            </div>
            <ul>
              {plan.goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
            <div className="health-record-meta">
              <span>
                {t('下次复核')}：{formatDate(plan.nextReview)}
              </span>
              <span>
                {t('完成度')}：{plan.completionPercent}%
              </span>
            </div>
            <footer>
              <button type="button" onClick={() => setEditingId(plan.id)}>
                <Pencil size={14} />
                {t('编辑')}
              </button>
              <button
                type="button"
                onClick={() => setHistoryId(historyId === plan.id ? '' : plan.id)}
              >
                <History size={14} />
                {t('版本记录')}
              </button>
            </footer>
            {historyId === plan.id && (
              <div className="health-version-list">
                {history.isLoading
                  ? t('正在加载记录…')
                  : (history.data?.data ?? []).map((version) => (
                      <span key={version.id}>
                        v{version.version} ·{' '}
                        {formatDate(version.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    ))}
              </div>
            )}
          </article>
        ))}
        {!plans.isLoading && !plans.data?.data.length && (
          <div className="health-empty">{t('暂无管理计划')}</div>
        )}
      </div>
      {adding && (
        <PlanForm
          patientId={patientId}
          busy={create.isPending}
          error={create.error}
          onClose={() => setAdding(false)}
          onSubmit={async ({ status: _status, completionPercent: _completion, ...input }) => {
            await create.mutateAsync(input);
            setAdding(false);
          }}
        />
      )}
      {editing && (
        <PlanForm
          patientId={patientId}
          plan={editing}
          busy={update.isPending}
          error={update.error}
          onClose={() => setEditingId('')}
          onSubmit={async ({ patientId: _patientId, ...input }) => {
            await update.mutateAsync({
              id: editing.id,
              input: {
                ...input,
                expectedVersion: editing.version,
              },
            });
            setEditingId('');
          }}
        />
      )}
    </section>
  );
}

function PlanForm({
  patientId,
  plan,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  patientId: string;
  plan?: CarePlanDetail;
  busy: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: {
    commandId: string;
    patientId: string;
    title: string;
    goals: string[];
    nextReview: string;
    status: CarePlanDetail['status'];
    completionPercent: number;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(plan?.title ?? '');
  const [goals, setGoals] = useState(plan?.goals.join('\n') ?? '');
  const [nextReview, setNextReview] = useState(plan?.nextReview ?? '2026-09-24');
  const [status, setStatus] = useState<CarePlanDetail['status']>(plan?.status ?? 'draft');
  const [completionPercent, setCompletionPercent] = useState(plan?.completionPercent ?? 0);
  const stale = error instanceof EApiError && error.code === 'STALE_VERSION';
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      commandId: commandId(),
      patientId,
      title,
      goals: goals
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      nextReview,
      status,
      completionPercent,
    }).catch(() => undefined);
  }
  return (
    <FormDialog title={plan ? '编辑管理计划' : '新建管理计划'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          {t('计划名称')}
          <input
            required
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {plan && (
          <div className="health-plan-form-row">
            <label>
              {t('计划状态')}
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as CarePlanDetail['status'])}
              >
                <option value="draft">{t('草稿')}</option>
                <option value="active">{t('进行中')}</option>
              </select>
            </label>
            <label>
              {t('完成度')}
              <div className="health-completion-control">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={completionPercent}
                  onChange={(event) => setCompletionPercent(Number(event.target.value))}
                />
                <span>{completionPercent}%</span>
              </div>
            </label>
          </div>
        )}
        <label>
          {t('计划目标')}
          <textarea
            required
            rows={4}
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            placeholder={t('每行填写一个目标')}
          />
        </label>
        <label>
          {t('下次复核')}
          <input
            type="date"
            required
            value={nextReview}
            onChange={(event) => setNextReview(event.target.value)}
          />
        </label>
        {error && (
          <div className="health-inline-error">
            {stale ? t('计划已刷新到最新版本，已填写内容仍保留，请再次保存。') : error.message}
          </div>
        )}
        <footer>
          <Button variant="secondary" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('正在保存…') : t('保存计划')}
          </Button>
        </footer>
      </form>
    </FormDialog>
  );
}
