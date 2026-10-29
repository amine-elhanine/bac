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

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onClose, children }: { title: string; message: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  const { t } = useI18n()
  return <Modal title={title} onClose={onClose}><p className="case-dialog-description">{message}</p>{children}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="button" className="button button-danger" onClick={onConfirm} disabled={busy}>{busy ? t('Deleting…') : confirmLabel}</button></div></Modal>
}
