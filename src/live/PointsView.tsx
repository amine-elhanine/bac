import { useState, type FormEvent } from 'react'
import { Award, Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { clubDateTime } from './datetime'
import { EmptyState, Modal } from './ui'
import type { LiveEvent, PointBalance, PointEntry, Profile } from './types'

export function PointsLive({ entries, balances, profiles, memberId, canViewAll, canManage, onAdd }: { entries: PointEntry[]; balances: PointBalance[]; profiles: Profile[]; memberId: string; canViewAll: boolean; canManage: boolean; onAdd: () => void }) {
  const { t } = useI18n()
  const total = canViewAll ? balances.reduce((sum, row) => sum + Number(row.points_balance), 0) : Number(balances.find((row) => row.member_id === memberId)?.points_balance ?? 0)
  const names = new Map(profiles.map((person) => [person.id, person.full_name]))
  return <section className="live-panel"><div className="live-panel-head"><div><h2>{canManage ? t('Member engagement points') : canViewAll ? t('Club engagement points') : t('My points history')}</h2><p>{canViewAll ? t('Every award and deduction has a reason and a responsible officer.') : t('Your point balance is calculated from the recorded history.')}</p></div>{canManage && <button className="button button-primary" onClick={onAdd}><Plus size={14} /> {t('Add points')}</button>}</div><div className="ledger-balance"><div><span>{canViewAll ? t('TOTAL IN THIS LEDGER') : t('YOUR POINT BALANCE')}</span><strong>{total} pts</strong></div><div className="ledger-icon"><Award size={20} /></div></div>{entries.length ? <div className="live-money-list">{entries.map((entry) => <div className="live-money-row" key={entry.id}><span className={`money-direction ${entry.points_delta > 0 ? 'money-in' : 'money-out'}`}><Award size={16} /></span><div><strong>{canViewAll ? names.get(entry.member_id) ?? t('Member') : t(entry.category.replace('_', ' '))}</strong><small>{t(entry.category.replace('_', ' '))} · {clubDateTime(entry.created_at, { dateStyle: 'medium' })} · {entry.reason}</small></div><b className={entry.points_delta > 0 ? 'amount-positive' : ''}>{entry.points_delta > 0 ? '+' : ''}{entry.points_delta} pts</b></div>)}</div> : <EmptyState title={t('No points recorded')} detail={canManage ? t('Record a reasoned award or deduction for a member.') : t('Your engagement history will appear here.')} />}</section>
}

export function PointsDialog({ userId, profiles, events, onClose, onSaved }: { userId: string; profiles: Profile[]; events: LiveEvent[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [memberId, setMemberId] = useState(''); const [kind, setKind] = useState('award'); const [points, setPoints] = useState('1'); const [category, setCategory] = useState('event_participation'); const [reason, setReason] = useState(''); const [eventId, setEventId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    const value = Math.floor(Number(points))
    if (!memberId) { setError(t('Choose a member.')); return }
    if (!Number.isFinite(value) || value <= 0) { setError(t('Points must be a positive whole number.')); return }
    if (reason.trim().length < 4) { setError(t('Add a clear reason for this points entry.')); return }
    setBusy(true); setError('')
    const delta = kind === 'award' ? value : -value
    const { error: insertError } = await supabase.from('point_transactions').insert({ member_id: memberId, event_id: eventId || null, points_delta: delta, category, reason: reason.trim(), created_by: userId })
    if (insertError) { setError(t('Could not record this points entry. Check your HR access and try again.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Record member points')} subtitle={t('Awards and deductions are permanent ledger entries; explain the reason clearly.')} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('Member')}<select required value={memberId} onChange={(change) => setMemberId(change.target.value)}><option value="">{t('Choose an active member')}</option>{profiles.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.member_code}</option>)}</select></label><div className="live-form-grid"><label>{t('Entry')}<select value={kind} onChange={(change) => setKind(change.target.value)}><option value="award">{t('Award points')}</option><option value="deduction">{t('Deduct points')}</option></select></label><label>{t('Points')}<input required type="number" min="1" step="1" value={points} onChange={(change) => setPoints(change.target.value)} /></label></div><div className="live-form-grid"><label>{t('Category')}<select value={category} onChange={(change) => setCategory(change.target.value)}><option value="attendance">{t('Attendance')}</option><option value="event_participation">{t('Event participation')}</option><option value="task_completion">{t('Task completion')}</option><option value="volunteering">{t('Volunteering')}</option><option value="correction">{t('Correction')}</option><option value="other">{t('Other')}</option></select></label><label>{t('Linked event')}<select value={eventId} onChange={(change) => setEventId(change.target.value)}><option value="">{t('No linked event')}</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label></div><label>{t('Reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(change) => setReason(change.target.value)} placeholder={t('Explain the contribution or reason for a deduction')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy || !profiles.length}>{busy ? t('Recording…') : t('Record points')}</button></div></form></Modal>
}
