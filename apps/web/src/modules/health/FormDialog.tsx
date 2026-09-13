import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../shared/i18n';

export function FormDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return <div className="health-dialog-backdrop" role="presentation"><section className="health-dialog" role="dialog" aria-modal="true" aria-label={t(title)}>
    <header><h2>{t(title)}</h2><button type="button" onClick={onClose} aria-label={t('关闭')}><X size={18} /></button></header>
    {children}
  </section></div>;
}

export function commandId() {
  return globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
