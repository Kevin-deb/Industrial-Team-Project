import { useI18n } from './i18n';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowUpRight, CalendarClock, CircleAlert, LoaderCircle, X } from 'lucide-react';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <button className={`button button-${variant} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Badge({
  children,
  tone = 'teal',
}: {
  children: ReactNode;
  tone?: 'teal' | 'blue' | 'amber' | 'rose' | 'slate';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { t, language, setLanguage, formatDate } = useI18n();

  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{t(title)}</h1>
        {description && <p>{t(description)}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  const { t, language, setLanguage, formatDate } = useI18n();

  return (
    <div className="empty-state">
      <div className="empty-icon">
        <CalendarClock size={28} />
      </div>
      <h3>{t(title)}</h3>
      <p>{t(description)}</p>
    </div>
  );
}
export function ComingSoon({
  title,
  description,
  iteration = '后续迭代',
}: {
  title: string;
  description: string;
  iteration?: string;
}) {
  const { t, language, setLanguage, formatDate } = useI18n();

  return (
    <div className="coming-soon">
      <div className="coming-icon">
        <CalendarClock size={22} />
      </div>
      <div>
        <div className="coming-title">
          <h3>{t(title)}</h3>
          <Badge tone="amber">
            {t('待上线 ·')}
            {t(iteration)}
          </Badge>
        </div>
        <p>{t(description)}</p>
      </div>
      <ArrowUpRight size={20} aria-hidden="true" />
    </div>
  );
}
export function LoadingState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const { t, language, setLanguage, formatDate } = useI18n();

  return (
    <div className="loading-state" role="status">
      {error ? (
        <>
          <CircleAlert size={28} />
          <h3>{t('暂时无法加载数据')}</h3>
          <p>{t(error)}</p>
          <Button onClick={onRetry} variant="secondary">
            {t('重新加载')}
          </Button>
        </>
      ) : (
        <>
          <LoaderCircle className="spin" size={28} />
          <p>{t('正在载入工作台…')}</p>
        </>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t, language, setLanguage, formatDate } = useI18n();

  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{t(title)}</h2>
        <button className="icon-button" aria-label={t('关闭')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
