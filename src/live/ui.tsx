import type { ReactNode } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { useI18n } from '../i18n'

export function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  const { t } = useI18n()
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="install-dialog live-modal" role="dialog" aria-modal="true" aria-label={title}><button className="icon-button dialog-close" onClick={onClose} aria-label={t('Close')}><X size={18} /></button><div className="eyebrow">{t('BAC CLUB PLATFORM')}</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}{children}</section></div>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="live-empty"><div className="live-empty-icon"><CalendarDays size={20} /></div><strong>{title}</strong><p>{detail}</p></div>
}
