import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { clubDateTime, clubDatePart, formatMoney } from './datetime'
import { downloadEventIcs } from './ics'
import { Modal } from './ui'
import type { LiveEvent } from './types'

export function CalendarLive({ events, canCreate, canEdit, canCancel, canComplete, canDelete, onCreate, onEdit, onCancel, onComplete, onDelete }: { events: LiveEvent[]; canCreate: boolean; canEdit: boolean; canCancel: boolean; canComplete: boolean; canDelete: boolean; onCreate: () => void; onEdit: (event: LiveEvent) => void; onCancel: (event: LiveEvent) => void; onComplete: (event: LiveEvent) => void; onDelete: (event: LiveEvent) => void }) {
  const { t } = useI18n()
  const now = Date.now()
  const upcoming = events.filter((event) => new Date(event.ends_at ?? event.starts_at).getTime() >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const past = events.filter((event) => new Date(event.ends_at ?? event.starts_at).getTime() < now).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  const renderEvents = (list: LiveEvent[]) => <div className="live-event-list">{list.map((event) => { const ended = new Date(event.ends_at ?? event.starts_at).getTime() <= now; return <div className="event-row-wrap" key={event.id}><EventRow event={event} /><div className="event-row-actions"><button type="button" className="button button-outline" onClick={() => downloadEventIcs(event)}><CalendarDays size={14} /> {t('Add to calendar')}</button>{event.status !== 'cancelled' && <>{canEdit && <button className="button button-outline event-edit-button" onClick={() => onEdit(event)} aria-label={`${t('Edit')} ${event.title}`}><Pencil size={14} /> {t('Edit')}</button>}{canComplete && ['published', 'in_progress'].includes(event.status) && ended && <button className="button button-outline" onClick={() => onComplete(event)}>{t('Complete')}</button>}{canCancel && ['published', 'in_progress'].includes(event.status) && <button className="button button-outline event-cancel-button" onClick={() => onCancel(event)}>{t('Cancel')}</button>}</>}{canDelete && ['cancelled', 'completed'].includes(event.status) && <button type="button" className="button button-outline event-cancel-button" onClick={() => onDelete(event)} aria-label={`${t('Delete event')}: ${event.title}`}><Trash2 size={14} /> {t('Delete')}</button>}</div></div> })}</div>
  return <section className="live-panel"><div className="live-panel-head"><div><h2>{t('Club calendar')}</h2><p>{t('Published activities for BAC members.')}</p></div>{canCreate && <button className="button button-primary" onClick={onCreate}><Plus size={15} /> {t('Create event')}</button>}</div>{!events.length ? <div className="live-empty"><div className="live-empty-icon"><CalendarDays size={20} /></div><strong>{t('No events have been published')}</strong><p>{canCreate ? t('Create an event to add the first activity to the calendar.') : t('The club team has not published an upcoming activity yet.')}</p></div> : <>{upcoming.length ? <>{renderEvents(upcoming)}</> : <p className="reconciliation-empty">{t('No upcoming activities are scheduled.')}</p>}{past.length > 0 && <><div className="live-section-head calendar-history-heading"><div><h2>{t('Past events')}</h2><p>{t('Most recent first')}</p></div></div>{renderEvents(past)}</>}</>}</section>
}

export function EventRow({ event }: { event: LiveEvent }) {
  const { t } = useI18n()
  return <div className="live-event-row"><div className="live-event-date"><strong>{clubDatePart(event.starts_at, 'day')}</strong><span>{clubDatePart(event.starts_at, 'month').toUpperCase()}</span></div><div className="live-event-copy"><span className="live-event-type">{t(event.event_type.replace('_', ' ').toUpperCase())} · {t(event.status.replace('_', ' ').toUpperCase())}</span><h3>{event.title}</h3><p><CalendarDays size={13} />{clubDateTime(event.starts_at, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{event.location && <> · {event.location}</>}</p>{event.description && <p className="event-description">{event.description}</p>}{event.status === 'cancelled' && event.cancellation_reason && <p className="event-cancellation-reason"><strong>{t('Cancellation reason')}:</strong> {event.cancellation_reason}</p>}</div>{event.expected_contribution_minor > 0 && <span className="event-price">{formatMoney(event.expected_contribution_minor, event.currency)}</span>}</div>
}

export function DeleteEventDialog({ event, onClose, onSaved }: { event: LiveEvent; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || busy) return
    if (reason.trim().length < 4) { setError(t('Add a deletion reason of at least four characters.')); return }
    setBusy(true); setError('')
    const { error: deleteError } = await supabase.rpc('delete_event', { p_event_id: event.id, p_reason: reason.trim() })
    if (deleteError) { setError(deleteError.message); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Delete this event permanently?')} subtitle={`${event.title} · ${t('This removes the event, its attendance records, and its payment expectations. Events with financial records cannot be deleted — keep those cancelled. The deletion is audit logged.')}`} onClose={onClose}><form className="live-form" onSubmit={(formEvent) => void submit(formEvent)}><label>{t('Reason for deletion')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(formEvent) => setReason(formEvent.target.value)} placeholder={t('For example: duplicate event created by mistake')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-danger" disabled={busy}>{busy ? t('Deleting…') : t('Delete event permanently')}</button></div></form></Modal>
}
