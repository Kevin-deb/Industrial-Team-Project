import { useEffect, useId, useRef, type ReactNode } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, Card } from '../shared/ui';

export function FeatureDialog({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const focusable = dialog.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex="0"]',
        );
        if (!focusable?.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="feature-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`feature-dialog ${wide ? 'feature-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="feature-dialog-header">
          <div>
            <span className="feature-eyebrow">CARELINK · PREVIEW</span>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="feature-icon-button" onClick={onClose} aria-label="关闭详情">
            <X size={20} />
          </button>
        </header>
        <div className="feature-dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function PlannedDialog({
  title,
  onClose,
  children,
  iteration = '后续迭代',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  iteration?: string;
}) {
  return (
    <FeatureDialog title={title} subtitle="功能设计预览" onClose={onClose}>
      <div className="planned-dialog-icon">
        <CalendarDays size={30} />
      </div>
      <Badge tone="amber">{iteration} · 尚未上线</Badge>
      <div className="planned-dialog-copy">{children}</div>
      <div className="feature-notice">
        <CircleHelp size={17} />
        <span>当前为框架演示版本，此操作不会创建诊疗记录、发送消息或修改患者数据。</span>
      </div>
      <Button variant="secondary" onClick={onClose}>
        了解了
      </Button>
    </FeatureDialog>
  );
}

export function FilterTabs({
  options,
  value,
  onChange,
  label = '筛选列表',
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="feature-tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'teal',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: 'teal' | 'blue' | 'amber' | 'rose';
}) {
  return (
    <Card className="feature-metric">
      <div className="feature-metric-top">
        <span className={`feature-symbol ${tone}`}>
          <Icon size={20} />
        </span>
        <span>{label}</span>
      </div>
      <div className="feature-metric-value">{value}</div>
      <p>{detail}</p>
    </Card>
  );
}

export function SectionTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="feature-section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function PersonAvatar({
  name,
  tone = 0,
  size = 'normal',
}: {
  name: string;
  tone?: number;
  size?: 'normal' | 'large';
}) {
  return (
    <span
      aria-hidden="true"
      className={`person-avatar person-avatar--${tone % 4} ${size === 'large' ? 'person-avatar--large' : ''}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function DetailGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="feature-detail-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value || '暂无记录'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReadOnlyNote({
  children = '此处展示虚构演示数据，仅用于验证系统界面与模块连接。',
}: {
  children?: ReactNode;
}) {
  return (
    <p className="feature-readonly">
      <CircleHelp size={14} />
      {children}
    </p>
  );
}

export function LinkAction({
  children,
  onClick,
  external = false,
}: {
  children: ReactNode;
  onClick: () => void;
  external?: boolean;
}) {
  return (
    <button className="feature-link" onClick={onClick}>
      {children}
      {external ? <ArrowUpRight size={15} /> : <ChevronRight size={15} />}
    </button>
  );
}
