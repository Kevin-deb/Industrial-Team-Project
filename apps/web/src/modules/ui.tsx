import { useI18n } from '../shared/i18n';
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
  const { t } = useI18n();
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
            <h2 id={titleId}>{t(title)}</h2>
            {subtitle && <p>{t(subtitle)}</p>}
          </div>
          <button className="feature-icon-button" onClick={onClose} aria-label={t('关闭详情')}>
            <X size={20} />
          </button>
        </header>
        <div className="feature-dialog-body">
          {typeof children === 'string' ? t(children) : children}
        </div>
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
  const { t } = useI18n();
  return (
    <FeatureDialog title={t(title)} subtitle={t('功能设计预览')} onClose={onClose}>
      <div className="planned-dialog-icon">
        <CalendarDays size={30} />
      </div>
      <Badge tone="amber">
        {t(iteration)} {t('· 尚未上线')}
      </Badge>
      <div className="planned-dialog-copy">
        {typeof children === 'string' ? t(children) : children}
      </div>
      <div className="feature-notice">
        <CircleHelp size={17} />
        <span>{t('当前为框架演示版本，此操作不会创建诊疗记录、发送消息或修改患者数据。')}</span>
      </div>
      <Button variant="secondary" onClick={onClose}>
        {t('了解了')}
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
  const { t } = useI18n();
  return (
    <div className="feature-tabs" role="group" aria-label={t(label)}>
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {t(option.label)}
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
  const { t } = useI18n();
  return (
    <Card className="feature-metric">
      <div className="feature-metric-top">
        <span className={`feature-symbol ${tone}`}>
          <Icon size={20} />
        </span>
        <span>{t(label)}</span>
      </div>
      <div className="feature-metric-value">{value}</div>
      <p>{t(detail)}</p>
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
  const { t } = useI18n();
  return (
    <div className="feature-section-title">
      <div>
        <h2>{t(title)}</h2>
        {subtitle && <p>{t(subtitle)}</p>}
      </div>
      {typeof children === 'string' ? t(children) : children}
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
  const { t } = useI18n();
  return (
    <dl className="feature-detail-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{t(item.label)}</dt>
          <dd>
            {typeof item.value === 'string'
              ? t(item.value || '暂无记录')
              : item.value || t('暂无记录')}
          </dd>
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
  const { t } = useI18n();
  return (
    <p className="feature-readonly">
      <CircleHelp size={14} />
      {typeof children === 'string' ? t(children) : children}
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
  const { t } = useI18n();
  return (
    <button className="feature-link" onClick={onClick}>
      {typeof children === 'string' ? t(children) : children}
      {external ? <ArrowUpRight size={15} /> : <ChevronRight size={15} />}
    </button>
  );
}
