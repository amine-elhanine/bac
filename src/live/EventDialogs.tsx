import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { clubDateTime, clubDateTimeInput, clubInputToIso, formatMoney } from './datetime'
import { Modal } from './ui'
import type { LiveEvent } from './types'

export function EventDialog({ event, canSetContribution, onClose, onSaved }: { event: LiveEvent | null; canSetContribution: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [title, setTitle] = useState(event?.title ?? ''); const [type, setType] = useState(event?.event_type ?? 'meeting'); const [starts, setStarts] = useState(event ? clubDateTimeInput(event.starts_at) : ''); const [location, setLocation] = useState(event?.location ?? ''); const [description, setDescription] = useState(event?.description ?? ''); const [amount, setAmount] = useState(event ? (event.expected_contribution_minor / 100).toFixed(2) : '0'); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const start = starts ? clubInputToIso(starts) : null
    if (!start) { setError(t('Choose a valid date and time in Morocco.')); setBusy(false); return }
    const expected = Math.round(Number(amount || 0) * 100)
    if (title.trim().length < 2 || !Number.isFinite(expected) || expected < 0) { setError(t('Enter an event title and a valid non-negative contribution.')); setBusy(false); return }
    const changes = { title: title.trim(), description: description.trim(), event_type: type, starts_at: event?.attendance_sessions?.length ? event.starts_at : start, location: location.trim() || null }
    const saveError = event
      ? (await supabase.from('events').update(changes).eq('id', event.id).select('id').single()).error
      : (await supabase.rpc('create_club_event', { p_title: title.trim(), p_description: description.trim(), p_event_type: type, p_starts_at: start, p_location: location.trim() || null, p_expected_contribution_minor: canSetContribution ? expected : 0 })).error
    if (saveError) { setError(saveError.message); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={event ? t('Edit a club event') : t('Create a club event')} subtitle={event ? t('Changes will appear on the member calendar.') : t('Published events appear in the member calendar.')} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('Event title')}<input required minLength={2} maxLength={120} value={title} onChange={(change) => setTitle(change.target.value)} /></label><div className="live-form-grid"><label>{t('Type')}<select value={type} onChange={(change) => setType(change.target.value)}><option value="meeting">{t('Member gathering')}</option><option value="event">{t('Club event')}</option><option value="workshop">{t('Workshop')}</option><option value="caravan">{t('Humanitarian caravan')}</option><option value="other">{t('Other')}</option></select></label>{!event && canSetContribution && <label>{t('Expected contribution (MAD)')}<input type="number" min="0" step="0.01" value={amount} onChange={(change) => setAmount(change.target.value)} /></label>}</div>{event && <div className="event-fee-note"><strong>{t('Expected contribution')}:</strong> {formatMoney(event.expected_contribution_minor, event.currency)}<small>{t('This financial amount is preserved when editing event details. Ask the Treasurer to coordinate contribution changes.')}</small></div>}{!event && !canSetContribution && <div className="event-fee-note">{t('No contribution is set on this event. The Treasurer can coordinate collection details.')}</div>}{event?.attendance_sessions?.length ? <div className="event-fee-note">{t('Attendance has already been opened for this event, so its date and time cannot be changed here.')}</div> : <label>{t('Date and time (Morocco)')}<input required type="datetime-local" value={starts} onChange={(change) => setStarts(change.target.value)} /></label>}<label>{t('Location')}<input maxLength={160} value={location} onChange={(change) => setLocation(change.target.value)} /></label><label>{t('Description')}<textarea rows={3} maxLength={1500} value={description} onChange={(change) => setDescription(change.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving…') : event ? t('Save changes') : t('Publish event')}</button></div></form></Modal>
}

export function CancelEventDialog({ event, onClose, onSaved }: { event: LiveEvent; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (reason.trim().length < 4) { setError(t('Add a short reason so members understand why the event was cancelled.')); return }
    setBusy(true); setError('')
    try {
      const { error: cancelError } = await supabase.rpc('cancel_club_event', { p_event_id: event.id, p_reason: reason.trim() })
      if (cancelError) { setError(cancelError.message); setBusy(false); return }
      setBusy(false); await onSaved()
    } catch {
      setError(t('The event could not be cancelled. Please try again.'))
      setBusy(false)
    }
  }
  return <Modal title={t('Cancel this event?')} subtitle={`${event.title} · ${t('Members will receive a notification and can see your reason on the calendar.')}`} onClose={onClose}><form className="live-form" onSubmit={(formEvent) => void submit(formEvent)}><div className="reversal-summary"><strong>{clubDateTime(event.starts_at)}</strong><span>{event.location ?? t('Location not set')}</span></div><label>{t('Reason for cancellation')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(formEvent) => setReason(formEvent.target.value)} placeholder={t('Explain the cancellation for club members')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Keep event')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Cancelling…') : t('Cancel event')}</button></div></form></Modal>
}

export function CompleteEventDialog({ event, onClose, onSaved }: { event: LiveEvent; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const { error: completeError } = await supabase.rpc('complete_club_event', { p_event_id: event.id, p_reason: reason.trim() })
      if (completeError) { setError(completeError.message); setBusy(false); return }
      setBusy(false); await onSaved()
    } catch {
      setError(t('The event could not be completed. Please try again.'))
      setBusy(false)
    }
  }
  return <Modal title={t('Complete this event?')} subtitle={`${event.title} · ${t('This finalizes attendance and adds a reasoned entry to the audit log.')}`} onClose={onClose}><form className="live-form" onSubmit={(formEvent) => void submit(formEvent)}><div className="reversal-summary"><strong>{clubDateTime(event.starts_at)}</strong><span>{event.location ?? t('Location not set')}</span></div><label>{t('Completion note')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(formEvent) => setReason(formEvent.target.value)} placeholder={t('For example: gathering completed and attendance reviewed')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Keep event open')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Completing…') : t('Complete event')}</button></div></form></Modal>
}
