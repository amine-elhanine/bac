import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { clubDateTime } from './datetime'
import { EmptyState, Modal } from './ui'
import type { MemberCase, Profile } from './types'

export function SupportLive({ rows, profiles, canManage, onSubmit, onReview }: { rows: MemberCase[]; profiles: Profile[]; canManage: boolean; onSubmit: () => void; onReview: (item: MemberCase) => void }) {
  const { t } = useI18n()
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
  return <section className="live-panel"><div className="live-panel-head"><div><h2>{canManage ? t('Confidential HR cases') : t('Contact HR privately')}</h2><p>{canManage ? t('Only the submitter and authorized club leadership can see a case. Your response is visible to the submitter.') : t('Reports are visible only to you and the President, Vice President, HR, and Vice HR.')}</p></div><button className="button button-primary" onClick={onSubmit}><Plus size={14} /> {canManage ? t('Submit a case') : t('Ask HR for help')}</button></div>{rows.length ? <div className="case-list">{rows.map((item) => <article className="case-card" key={item.id}><div className="case-card-head"><div><span className="eyebrow">{canManage ? names.get(item.submitted_by) ?? t('Member report') : t('YOUR REPORT')} · {clubDateTime(item.created_at)}</span><h3>{item.title}</h3></div><span className={`status-pill ${['resolved', 'closed'].includes(item.status) ? 'status-active' : 'status-pending'}`}><i />{t(item.status.replace('_', ' '))}</span></div>{canManage && item.people_involved && <p className="case-involved"><strong>{t('People involved')}:</strong> {item.people_involved}</p>}<p className="case-description">{item.description}</p>{item.response && <div className="case-response"><strong>{t('HR response')}</strong><p>{item.response}</p></div>}{canManage && <button className="button button-outline" onClick={() => onReview(item)}>{t('Review case')}</button>}</article>)}</div> : <EmptyState title={canManage ? t('No HR cases to review') : t('No reports submitted')} detail={canManage ? t('Member requests for confidential support will appear here.') : t('Use this private channel to ask HR for help with a club concern.')} />}</section>
}

export function MemberCaseDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [people, setPeople] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const { error: submitError } = await supabase.rpc('submit_member_case', { p_title: title.trim(), p_description: description.trim(), p_people_involved: people.trim() })
    if (submitError) { setError(submitError.message); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Ask HR for private support')} subtitle={t('Only you and authorized club leadership can read this report. HR’s response will be visible to you.')} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('What do you need help with?')}<input required minLength={4} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('A short, clear subject')} /></label><label>{t('People involved (optional)')}<input maxLength={300} value={people} onChange={(event) => setPeople(event.target.value)} placeholder={t('Names or roles, if relevant')} /></label><label>{t('Describe what happened')}<textarea required minLength={10} maxLength={5000} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('Share the details HR needs to understand the concern.')} /></label><div className="role-transfer-note">{t('Do not use this channel for emergencies. Keep the report factual and share only details HR needs to help.')}</div>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Sending…') : t('Send private report')}</button></div></form></Modal>
}

export function UpdateMemberCaseDialog({ item, onClose, onSaved }: { item: MemberCase; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [status, setStatus] = useState(item.status); const [response, setResponse] = useState(item.response); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (['resolved', 'closed'].includes(status) && response.trim().length < 4) { setError(t('Add a short response before resolving or closing this case.')); return }
    setBusy(true); setError('')
    const { error: updateError } = await supabase.rpc('update_member_case', { p_case_id: item.id, p_new_status: status, p_response: response.trim() })
    if (updateError) { setError(updateError.message); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Review confidential case')} subtitle={`${item.title} · ${t('your response is shared with the member who submitted it.')}`} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="case-description case-dialog-description">{item.description}{item.people_involved && <p><strong>{t('People involved')}:</strong> {item.people_involved}</p>}</div><label>{t('Case status')}<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="new">{t('New')}</option><option value="reviewing">{t('Reviewing')}</option><option value="resolved">{t('Resolved')}</option><option value="closed">{t('Closed')}</option></select></label><label>{t('Response to the member')}<textarea maxLength={3000} rows={5} value={response} onChange={(event) => setResponse(event.target.value)} placeholder={t('Your response will appear in the member’s private HR Support view.')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving…') : t('Save case update')}</button></div></form></Modal>
}
