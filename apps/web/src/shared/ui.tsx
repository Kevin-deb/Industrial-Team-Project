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
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <CalendarClock size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
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
  return (
    <div className="coming-soon">
      <div className="coming-icon">
        <CalendarClock size={22} />
      </div>
      <div>
        <div className="coming-title">
          <h3>{title}</h3>
          <Badge tone="amber">待上线 · {iteration}</Badge>
        </div>
        <p>{description}</p>
      </div>
      <ArrowUpRight size={20} aria-hidden="true" />
    </div>
  );
}
export function LoadingState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="loading-state" role="status">
      {error ? (
        <>
          <CircleAlert size={28} />
          <h3>暂时无法加载数据</h3>
          <p>{error}</p>
          <Button onClick={onRetry} variant="secondary">
            重新加载
          </Button>
        </>
      ) : (
        <>
          <LoaderCircle className="spin" size={28} />
          <p>正在载入工作台…</p>
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
        <h2 id={id}>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
