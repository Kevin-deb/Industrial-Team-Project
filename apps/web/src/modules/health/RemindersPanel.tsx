import { BellPlus, RotateCcw, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ReminderTask } from '@doctor/contracts';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui';
import { commandId, FormDialog } from './FormDialog';
import { useCancelReminder, useCreateReminder, useReminders, useRetryReminder } from './queries';

const statusLabels: Record<ReminderTask['status'], string> = {
  planned: '已保存，尚未发送',
  pending: '发送处理中',
  sent: '已发送',
  failed: '发送失败',
  cancelled: '已取消',
};

export function RemindersPanel({ patientId }: { patientId: string }) {
  const { t, formatDate } = useI18n();
  const reminders = useReminders(patientId);
  const create = useCreateReminder(patientId);
  const cancel = useCancelReminder(patientId);
  const retry = useRetryReminder(patientId);
  const [adding, setAdding] = useState(false);
  return (
    <section className="health-panel">
      <header className="health-panel-header">
        <div>
          <h2>{t('随访提醒')}</h2>
          <p>{t('通知接口未接入时，只保存任务，不显示发送成功')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <BellPlus size={15} />
          {t('新增提醒')}
        </Button>
      </header>
      <div className="health-record-list">
        {(reminders.data?.data ?? []).map((item) => (
          <article key={item.id} className="health-reminder-row">
            <div>
              <strong>
                {t(item.templateId === 'followup-demo' ? '随访预约提醒' : '健康记录提醒')}
              </strong>
              <span>
                {formatDate(item.scheduledAt, { dateStyle: 'long', timeStyle: 'short' })} ·{' '}
                {t(channelLabel(item.channel))}
              </span>
            </div>
            <span className={`health-status ${item.status}`}>{t(statusLabels[item.status])}</span>
            <div className="health-row-actions">
              {!['sent', 'cancelled'].includes(item.status) && (
                <button
                  type="button"
                  onClick={() => cancel.mutate({ id: item.id, commandId: commandId() })}
                >
                  <XCircle size={14} />
                  {t('取消任务')}
                </button>
              )}
              {item.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => retry.mutate({ id: item.id, commandId: commandId() })}
                >
                  <RotateCcw size={14} />
                  {t('重试')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(cancel.error || retry.error) && (
        <div className="health-inline-error">{(cancel.error ?? retry.error)?.message}</div>
      )}
      {adding && (
        <ReminderForm
          patientId={patientId}
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

function ReminderForm({
  patientId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  patientId: string;
  busy: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: {
    commandId: string;
    patientId: string;
    channel: ReminderTask['channel'];
    templateId: string;
    scheduledAt: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [channel, setChannel] = useState<ReminderTask['channel']>('in-app');
  const [templateId, setTemplateId] = useState('followup-demo');
  const [scheduledAt, setScheduledAt] = useState('2026-09-16T09:00');
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      commandId: commandId(),
      patientId,
      channel,
      templateId,
      scheduledAt: `${scheduledAt}:00+08:00`,
    }).catch(() => undefined);
  }
  return (
    <FormDialog title="新增随访提醒" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          {t('提醒内容')}
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="followup-demo">{t('随访预约提醒')}</option>
            <option value="health-record-demo">{t('健康记录提醒')}</option>
          </select>
        </label>
        <label>
          {t('提醒方式')}
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value as ReminderTask['channel'])}
          >
            <option value="in-app">{t('应用内')}</option>
            <option value="sms">{t('短信')}</option>
            <option value="email">{t('邮件')}</option>
          </select>
        </label>
        <label>
          {t('计划时间')}
          <input
            type="datetime-local"
            required
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>
        <p className="health-form-note">
          {t('当前没有真实通知服务，保存后状态为“已保存，尚未发送”。')}
        </p>
        {error && <div className="health-inline-error">{error.message}</div>}
        <footer>
          <Button variant="secondary" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('正在保存…') : t('保存提醒')}
          </Button>
        </footer>
      </form>
    </FormDialog>
  );
}

function channelLabel(channel: ReminderTask['channel']) {
  return channel === 'in-app' ? '应用内' : channel === 'sms' ? '短信' : '邮件';
}
