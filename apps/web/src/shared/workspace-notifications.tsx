import { useEffect, useState } from 'react';
import type { WorkspaceNotifications } from '@doctor/contracts';
import { requestApi } from './api';
import { useI18n } from './i18n';

export function useWorkspaceNotifications(identityId: string) {
  const [data, setData] = useState<WorkspaceNotifications | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    setError('');
    const controller = new AbortController();
    let busy = false;
    let queued = false;
    let seen: Set<string> | undefined;
    const refresh = async () => {
      if (controller.signal.aborted) return;
      if (busy) {
        queued = true;
        return;
      }
      busy = true;
      try {
        const result = await requestApi<WorkspaceNotifications>('/notifications', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const next = result.data;
        const ids = [
          ...next.reminders.map((item) => item.id),
          ...next.encounters.map((item) => item.id),
        ];
        const arrived = seen && ids.some((id) => !seen!.has(id));
        seen = new Set(ids);
        setData(next);
        setError('');
        if (
          arrived &&
          next.preferences.browser &&
          !next.quietNow &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          // A denied/unsupported device popup must not discard the in-app data.
          try {
            const notice = new Notification('CareLink', {
              body:
                document.documentElement.lang === 'en'
                  ? 'New work notifications. Open CareLink to view.'
                  : '您有新的工作提醒，请在 CareLink 中查看。',
            });
            notice.onclick = () => {
              window.focus();
              notice.close();
            };
          } catch {
            /* The fetched notices remain available in the application. */
          }
        }
      } catch {
        if (!controller.signal.aborted) setError('工作提醒暂时无法加载');
      } finally {
        busy = false;
        if (queued && !controller.signal.aborted) {
          queued = false;
          void refresh();
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const changed = () => void refresh();
    window.addEventListener('carelink-notification-preferences-changed', changed);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('carelink-notification-preferences-changed', changed);
    };
  }, [identityId]);
  return { data, error };
}

export function WorkspaceNotificationPanel({
  data,
  error,
  navigate,
}: {
  data: WorkspaceNotifications | null;
  error: string;
  navigate: (path: string) => void;
}) {
  const { t, formatDate } = useI18n();
  const [inboxOpen, setInboxOpen] = useState(false);
  return (
    <section className="notification-center-section" aria-label={t('诊疗工作提醒')}>
      <header>
        <strong>{t('诊疗工作提醒')}</strong>
      </header>
      {error && <p role="alert">{t(error)}</p>}
      {!data && !error && <p>{t('正在加载…')}</p>}
      {data && (
        <>
          {data.quietNow && <p>{t('当前为免打扰时段，站内提醒仍保留。')}</p>}
          {data.encounters.length === 0 && data.reminders.length === 0 && (
            <p>{t('暂无诊疗工作提醒')}</p>
          )}
          {data.encounters.slice(0, 10).map((item) => (
            <button key={item.id} onClick={() => navigate('/encounters')}>
              <span>
                <strong>
                  {t('待处理问诊')} · {item.patientName}
                </strong>
                <small>
                  {formatDate(item.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </small>
              </span>
            </button>
          ))}
          {data.reminders.slice(0, 10).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate('/health?patientId=' + encodeURIComponent(item.patientId))}
            >
              <span>
                <strong>
                  {t('本地提醒已送达')} · {item.patientId}
                </strong>
                <small>
                  {formatDate(item.deliveredAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </small>
              </span>
            </button>
          ))}
          <button onClick={() => setInboxOpen((value) => !value)} aria-expanded={inboxOpen}>
            {t('患者测试收件箱')} ({data.inbox.length})
          </button>
          {inboxOpen && (
            <div>
              <p>
                {t('仅在本机投递，不向真实患者发送短信或邮件。医生提醒开关不影响患者任务投递。')}
              </p>
              {data.inbox.length === 0 && <p>{t('测试收件箱暂无消息')}</p>}
              {data.inbox.map((item) => (
                <article
                  key={item.id}
                  style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}
                >
                  <strong>
                    {item.patientId} ·{' '}
                    {t(item.templateId === 'followup-demo' ? '随访预约提醒' : '健康记录提醒')}
                  </strong>
                  <p>{t(item.body)}</p>
                  <p>
                    {t('模拟通道')}：
                    {t(
                      item.channel === 'sms'
                        ? '短信'
                        : item.channel === 'email'
                          ? '邮件'
                          : '应用内',
                    )}
                  </p>
                  <small>
                    {formatDate(item.deliveredAt, { dateStyle: 'medium', timeStyle: 'medium' })} ·{' '}
                    {item.id}
                  </small>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
