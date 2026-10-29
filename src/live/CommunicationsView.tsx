import { useState, type FormEvent } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { clubDateTime } from './datetime'
import { EmptyState, Modal } from './ui'
import type { Announcement, CommunicationThread, MemberIdea, MemberIdeaReview, Profile } from './types'

function CommunicationInboxPanel({ threads, profiles, canManage, onNew, onOpen }: { threads: CommunicationThread[]; profiles: Profile[]; canManage: boolean; onNew: () => void; onOpen: (thread: CommunicationThread) => void }) {
  const { t } = useI18n()
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
  const statusLabel: Record<string, string> = canManage
    ? { open: t('Needs club reply'), awaiting_member: t('Awaiting member'), closed: t('Closed') }
    : { open: t('Awaiting club reply'), awaiting_member: t('Club replied'), closed: t('Closed') }
  return <section className="live-panel communication-inbox"><div className="live-panel-head"><div><h2>{canManage ? t('Member communication inbox') : t('Contact the Communications team')}</h2><p>{canManage ? t('Private member messages for the Communications Officer and club leadership.') : t('Send a message to the Communications Officer and leadership, then follow the reply here.')}</p></div><button className="button button-primary" onClick={onNew}><Plus size={14} /> {canManage ? t('New message') : t('New message')}</button></div>{threads.length ? <div className="live-task-list">{threads.map((thread) => { const latest = thread.messages[thread.messages.length - 1]; return <article className="live-task-row" key={thread.id}><div className={`live-task-status ${thread.status === 'closed' ? 'status-done' : thread.status === 'awaiting_member' ? 'status-in_progress' : 'status-todo'}`}><MessageCircle size={15} /></div><div className="live-task-copy"><strong>{thread.subject}</strong><p>{latest?.body ?? t('No messages yet.')}</p><small>{canManage ? `${names.get(thread.member_id) ?? t('Member')} · ` : ''}{t('{count} message(s)', { count: thread.messages.length })} · {t('Updated {time}', { time: clubDateTime(thread.updated_at) })}</small></div><span className={`status-pill ${thread.status === 'closed' ? 'status-active' : 'status-pending'}`}><i />{statusLabel[thread.status]}</span><button className="button button-outline" onClick={() => onOpen(thread)}>{t('Open')}</button></article> })}</div> : <EmptyState title={t('No conversations yet')} detail={canManage ? t('Member messages to the Communications team will appear here.') : t('Start a private conversation with the BAC Communications team.')} />}</section>
}

export function NewCommunicationDialog({ profiles, canManage, onClose, onSaved }: { profiles: Profile[]; canManage: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [memberId, setMemberId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase || busy) return
    if (canManage && !memberId) { setError(t('Choose a member.')); return }
    setBusy(true); setError('')
    const { error: sendError } = await supabase.rpc('start_member_communication', { p_subject: subject.trim(), p_body: body.trim(), p_member_id: canManage ? memberId : null })
    if (sendError) { setError(sendError.message); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('New message')} subtitle={canManage ? t('Start a private conversation with an active member; they are notified immediately.') : t('Your conversation is private to you and the Communications Officer and club leadership. For a sensitive personal issue, use HR Support instead.')} onClose={onClose}><form className="live-form" onSubmit={submit}>{canManage && <label>{t('Member')}<select required value={memberId} onChange={(change) => setMemberId(change.target.value)}><option value="">{t('Choose an active member')}</option>{profiles.filter((profile) => profile.status === 'active').map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {profile.member_code}</option>)}</select></label>}<label>{t('Subject')}<input required minLength={2} maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>{t('Message')}<textarea required minLength={1} maxLength={4000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Sending…') : t('Send message')}</button></div></form></Modal>
}

export function CommunicationThreadDialog({ thread, profiles, memberId, canManage, onClose, onSaved }: { thread: CommunicationThread; profiles: Profile[]; memberId: string; canManage: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [body, setBody] = useState(''); const [closureNote, setClosureNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const memberName = profiles.find((profile) => profile.id === thread.member_id)?.full_name ?? t('Member')
  const ownIsMember = thread.member_id === memberId
  const canSend = thread.status !== 'closed' && (!canManage || thread.status === 'open')
  async function send(formEvent: FormEvent<HTMLFormElement>) { formEvent.preventDefault(); if (!supabase || busy || !body.trim()) return; setBusy(true); setError(''); const { error: sendError } = await supabase.rpc('send_member_communication_message', { p_thread_id: thread.id, p_body: body.trim() }); if (sendError) { setError(sendError.message); setBusy(false); return } setBody(''); setBusy(false); await onSaved() }
  async function closeThread() { if (!supabase || busy || closureNote.trim().length < 4) return; setBusy(true); setError(''); const { error: closeError } = await supabase.rpc('close_member_communication', { p_thread_id: thread.id, p_reason: closureNote.trim() }); if (closeError) { setError(closeError.message); setBusy(false); return } setBusy(false); await onSaved() }
  return <Modal title={thread.subject} subtitle={canManage ? `${t('Private member conversation')} · ${memberName}` : t('Private conversation with the BAC Communications team')} onClose={onClose}><div className="communication-thread-history">{thread.messages.map((message) => <article className={`communication-message ${message.sender_side === 'member' ? 'communication-message-member' : ''}`} key={message.id}><strong>{message.sender_side === 'member' ? (ownIsMember ? t('You') : memberName) : (message.sender_id === memberId ? `${t('You')} · ${t('BAC team')}` : profiles.find((profile) => profile.id === message.sender_id)?.full_name ?? t('BAC Communications team'))}</strong><p>{message.body}</p><small>{clubDateTime(message.created_at)}</small></article>)}</div>{thread.status === 'closed' && <div className="notification-empty">{t('Closed')}: {thread.closure_note}</div>}{thread.status !== 'closed' && <>{canManage && thread.status === 'awaiting_member' && <p className="communication-awaiting-note">{t('Waiting for the member to reply before the next club response.')}</p>}{!canSend && <p className="communication-awaiting-note">{t('The club team will reply here when your message is reviewed.')}</p>}<form className="live-form communication-reply-form" onSubmit={(formEvent) => void send(formEvent)}><label>{t('Your reply')}<textarea required maxLength={4000} rows={4} value={body} onChange={(event) => setBody(event.target.value)} disabled={!canSend || busy} placeholder={canSend ? t('Write a reply…') : t('Waiting for the other side to respond.')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions">{canManage && <><input className="communication-close-note" aria-label={t('Closure note')} placeholder={`${t('Closure note')} (${t('required')})`} minLength={4} maxLength={500} value={closureNote} onChange={(event) => setClosureNote(event.target.value)} /><button type="button" className="button button-outline" onClick={() => void closeThread()} disabled={busy || closureNote.trim().length < 4}>{t('Close conversation')}</button></>}<button type="submit" className="button button-primary" disabled={!canSend || busy || !body.trim()}>{busy ? t('Sending…') : t('Send reply')}</button></div></form></>}</Modal>
}

export function CommunicationsLive({ rows, ideas, ideaReviews, threads, profiles, canManage, canReviewIdeas, canManageInbox, onPublish, onSubmitIdea, onReviewIdea, onNewCommunication, onOpenCommunication }: { rows: Announcement[]; ideas: MemberIdea[]; ideaReviews: MemberIdeaReview[]; threads: CommunicationThread[]; profiles: Profile[]; canManage: boolean; canReviewIdeas: boolean; canManageInbox: boolean; onPublish: () => void; onSubmitIdea: () => void; onReviewIdea: (idea: MemberIdea) => void; onNewCommunication: () => void; onOpenCommunication: (thread: CommunicationThread) => void }) {
  const { t } = useI18n()
  const authorNames = new Map(profiles.map((profile) => [profile.id, `${profile.full_name} · ${profile.member_code}`]))
  const reviewsByIdea = new Map<string, MemberIdeaReview[]>()
  for (const review of ideaReviews) reviewsByIdea.set(review.idea_id, [...(reviewsByIdea.get(review.idea_id) ?? []), review])
  return <div className="communication-layout"><CommunicationInboxPanel threads={threads} profiles={profiles} canManage={canManageInbox} onNew={onNewCommunication} onOpen={onOpenCommunication} /><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Club news')}</h2><p>{canManage ? t('Publish official information for the club or a specific officer team.') : t('Updates published by the BAC team.')}</p></div>{canManage && <button className="button button-primary" onClick={onPublish}><Plus size={14} /> {t('Publish news')}</button>}</div>{rows.length ? rows.map((item) => <article className="live-news-item" key={item.id}><div className="live-news-icon"><MessageCircle size={17} /></div><div><span>{clubDateTime(item.published_at ?? item.created_at, { dateStyle: 'medium' })} · {item.audience === 'team' ? `${t(item.target_team?.replace('_', ' ') ?? '')} ${t('team')}` : item.audience === 'officers' ? t('All officers') : t('All members')}</span><h3>{item.title}</h3><p>{item.body}</p></div></article>) : <EmptyState title={t('No news published yet')} detail={t('Official club updates will appear here.')} />}</section><section className="live-panel ideas-panel"><div className="live-panel-head"><div><h2>{canReviewIdeas ? t('Member ideas') : t('Share an idea')}</h2><p>{canReviewIdeas ? t('Review suggestions and keep the member informed.') : t('Your idea goes to the General Secretary.')}</p></div>{!canReviewIdeas && <button className="button button-outline" onClick={onSubmitIdea}><Plus size={14} /> {t('Send an idea')}</button>}</div>{ideas.length ? ideas.map((idea) => { const history = reviewsByIdea.get(idea.id) ?? []; return <article className="idea-row" key={idea.id}><div><strong>{idea.title}</strong><p>{idea.description}</p><small>{canReviewIdeas ? authorNames.get(idea.submitted_by) ?? t('Member') : t('Your idea')} · {clubDateTime(idea.created_at, { dateStyle: 'medium' })}</small>{idea.review_note && <p className="idea-review-note"><strong>{t('Club update')}:</strong> {idea.review_note}</p>}{history.length > 0 && <details className="idea-review-history"><summary>{t('Review history')} · {history.length}</summary>{history.map((review) => <div key={review.id}><strong>{t(review.previous_status.replace('_', ' '))} → {t(review.new_status.replace('_', ' '))}</strong><span>{review.review_note}</span><small>{clubDateTime(review.created_at)}</small></div>)}</details>}</div><span className={`status-pill ${['accepted', 'implemented'].includes(idea.status) ? 'status-active' : 'status-pending'}`}><i />{t(idea.status.replace('_', ' '))}</span>{canReviewIdeas && !['declined', 'implemented'].includes(idea.status) && <button className="button button-outline idea-review-button" onClick={() => onReviewIdea(idea)}>{t('Review')}</button>}</article> }) : <EmptyState title={t('No ideas submitted yet')} detail={canReviewIdeas ? t('Member suggestions will appear here for review.') : t('Share an idea for an activity, project, or club improvement.')} />}{canReviewIdeas && <button className="card-bottom-link" onClick={onSubmitIdea}>{t('Submit a member idea')} <Plus size={13} /></button>}</section></div>
}

export function AnnouncementDialog({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [audience, setAudience] = useState('members'); const [targetTeam, setTargetTeam] = useState('communications')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const { error: insertError } = await supabase.from('announcements').insert({ title: title.trim(), body: body.trim(), audience, target_team: audience === 'team' ? targetTeam : null, published_at: new Date().toISOString(), created_by: userId })
    if (insertError) { setError(t('Could not publish the update. Check your role and try again.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Publish club news')} subtitle={t('Choose who can read this update. Team access is enforced by database policies.')} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('Audience')}<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="members">{t('All members')}</option><option value="officers">{t('All officers')}</option><option value="team">{t('A specific officer team')}</option></select></label>{audience === 'team' && <label>{t('Officer team')}<select value={targetTeam} onChange={(event) => setTargetTeam(event.target.value)}><option value="leadership">{t('President & Vice President')}</option><option value="communications">{t('Communications')}</option><option value="treasury">{t('Treasury')}</option><option value="hr">{t('HR')}</option><option value="secretariat">{t('General Secretariat')}</option><option value="logistics">{t('Logistics')}</option></select></label>}<label>{t('Headline')}<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{t('Update')}<textarea required minLength={3} maxLength={5000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Publishing…') : t('Publish update')}</button></div></form></Modal>
}

export function IdeaDialog({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const { error: insertError } = await supabase.from('member_ideas').insert({ title: title.trim(), description: description.trim(), submitted_by: userId })
    if (insertError) { setError(t('Could not send your idea. Please try again.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Share an idea with BAC')} subtitle={t('The General Secretary and club leadership can review your suggestion.')} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('Idea title')}<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('What should the club try?')} /></label><label>{t('Tell us more')}<textarea required minLength={5} maxLength={3000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Sending…') : t('Send to the club')}</button></div></form></Modal>
}

export function ReviewIdeaDialog({ idea, onClose, onSaved }: { idea: MemberIdea; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const allowedNext = idea.status === 'new' ? ['reviewing', 'accepted', 'declined'] : idea.status === 'reviewing' ? ['accepted', 'declined'] : idea.status === 'accepted' ? ['implemented'] : []
  const [status, setStatus] = useState(allowedNext[0] ?? 'reviewing')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase) return
    if (note.trim().length < 4) { setError(t('Add a note of at least four characters for the member.')); return }
    setBusy(true); setError('')
    try {
      const { error: reviewError } = await supabase.rpc('review_member_idea', { p_idea_id: idea.id, p_new_status: status, p_review_note: note.trim() })
      if (reviewError) { setError(reviewError.message); setBusy(false); return }
      setBusy(false); await onSaved()
    } catch {
      setError(t('The idea review could not be saved. Please try again.'))
      setBusy(false)
    }
  }
  return <Modal title={t('Review a member idea')} subtitle={t('Record the decision and a note the member can see. Every change is retained in the review history.')} onClose={onClose}><div className="reversal-summary"><strong>{idea.title}</strong><span>{idea.description}</span></div><form className="live-form" onSubmit={(formEvent) => void submit(formEvent)}><label>{t('New status')}<select value={status} onChange={(event) => setStatus(event.target.value)}>{allowedNext.map((value) => <option value={value} key={value}>{t(value.replace('_', ' '))}</option>)}</select></label><label>{t('Note for the member')}<textarea required minLength={4} maxLength={1000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('Explain the next step or decision')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy || !allowedNext.length}>{busy ? t('Saving…') : t('Save review')}</button></div></form></Modal>
}
