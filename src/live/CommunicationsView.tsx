import { useState, type FormEvent } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { ELECTED_OFFICER_ROLES, ROLE_LABELS } from '../lib/roles'
import { clubDateTime } from './datetime'
import { EmptyState, Modal } from './ui'
import type { Announcement, CommunicationThread, MemberIdea, MemberIdeaReview, Profile } from './types'

function CommunicationInboxPanel({ threads, profiles, canManage, onNew, onOpen, onStartInChannel }: { threads: CommunicationThread[]; profiles: Profile[]; canManage: boolean; onNew: () => void; onOpen: (thread: CommunicationThread) => void; onStartInChannel: (role: string) => void }) {
  const { t } = useI18n()
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
  const memberStatusLabel: Record<string, string> = { open: t('Awaiting club reply'), awaiting_member: t('Club replied'), closed: t('Closed') }
  const boardStatusLabel: Record<string, string> = { open: t('Needs club reply'), awaiting_member: t('Awaiting member'), closed: t('Closed') }
  const statusClass: Record<string, string> = { closed: 'status-done', awaiting_member: 'status-in_progress', open: 'status-todo' }
  if (canManage) {
    return <section className="live-panel communication-inbox"><div className="live-panel-head"><div><h2>{t('Member communication inbox')}</h2><p>{t('Private member messages addressed to your board role.')}</p></div><button className="button button-primary" onClick={onNew}><Plus size={14} /> {t('New message')}</button></div>{threads.length ? <div className="live-task-list">{threads.map((thread) => { const latest = thread.messages[thread.messages.length - 1]; return <article className="live-task-row" key={thread.id}><div className={`live-task-status ${statusClass[thread.status] ?? 'status-todo'}`}><MessageCircle size={15} /></div><div className="live-task-copy"><strong>{thread.subject}</strong><p>{latest?.body ?? t('No messages yet.')}</p><small>{names.get(thread.member_id) ?? t('Member')} · {t('{count} message(s)', { count: thread.messages.length })} · {t('Updated {time}', { time: clubDateTime(thread.updated_at) })}</small></div><span className={`status-pill ${thread.status === 'closed' ? 'status-active' : 'status-pending'}`}><i />{boardStatusLabel[thread.status]}</span><button className="button button-outline" onClick={() => onOpen(thread)}>{t('Open')}</button></article> })}</div> : <EmptyState title={t('No conversations yet')} detail={t('Member messages addressed to your role will appear here.')} />}</section>
  }
  // Member side: every board member's channel, entered directly.
  const channels = ELECTED_OFFICER_ROLES.map((role) => {
    const roleThreads = threads.filter((thread) => thread.target_role === role)
    const active = roleThreads.find((thread) => thread.status !== 'closed') ?? null
    return { role, thread: active ?? roleThreads[0] ?? null, count: roleThreads.length }
  })
  return <section className="live-panel communication-inbox"><div className="live-panel-head"><div><h2>{t('Contact the board')}</h2><p>{t('Choose a board member and chat privately — only you and they see the messages.')}</p></div></div><div className="live-task-list">{channels.map((channel) => { const roleLabel = t(ROLE_LABELS[channel.role] ?? channel.role); const latest = channel.thread?.messages[channel.thread.messages.length - 1]; return <article className="live-task-row" key={channel.role}><div className={`live-task-status ${channel.thread ? statusClass[channel.thread.status] ?? 'status-todo' : 'status-todo'}`}><MessageCircle size={15} /></div><div className="live-task-copy"><strong>{roleLabel}</strong><p>{channel.thread ? latest?.body ?? t('No messages yet.') : t('Start a private conversation with the {role}.', { role: roleLabel })}</p><small>{channel.thread ? `${t('{count} message(s)', { count: channel.thread.messages.length })} · ${t('Updated {time}', { time: clubDateTime(channel.thread.updated_at) })}` : t('Private conversation with the {role}', { role: roleLabel })}</small></div>{channel.thread && <span className={`status-pill ${channel.thread.status === 'closed' ? 'status-active' : 'status-pending'}`}><i />{memberStatusLabel[channel.thread.status]}</span>}{channel.thread && <button className="button button-outline" onClick={() => onOpen(channel.thread!)}>{t('Open')}</button>}<button className={`button ${channel.thread ? 'button-outline' : 'button-primary'}`} onClick={() => onStartInChannel(channel.role)}><Plus size={14} /> {t('New message')}</button></article> })}</div></section>
}

export function NewCommunicationDialog({ profiles, canManage, onClose, onSaved }: { profiles: Profile[]; canManage: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [memberId, setMemberId] = useState(''); const [targetRole, setTargetRole] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase || busy) return
    if (canManage && !memberId) { setError(t('Choose a member.')); return }
    if (!canManage && !targetRole) { setError(t('Choose the board member you want to talk to.')); return }
    setBusy(true); setError('')
    const { error: sendError } = await supabase.rpc('start_member_communication', { p_subject: subject.trim(), p_body: body.trim(), p_target_role: canManage ? null : targetRole, p_member_id: canManage ? memberId : null })
    if (sendError) { setError(sendError.message); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('New message')} subtitle={canManage ? t('Start a private conversation with an active member; they are notified immediately.') : t('Pick the board member you want to talk to — your conversation stays with that role even if the board changes. For a sensitive personal issue, you can also use HR Support.')} onClose={onClose}><form className="live-form" onSubmit={submit}>{canManage
    ? <label>{t('Member')}<select required value={memberId} onChange={(change) => setMemberId(change.target.value)}><option value="">{t('Choose an active member')}</option>{profiles.filter((profile) => profile.status === 'active').map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {profile.member_code}</option>)}</select></label>
    : <label>{t('Board member')}<select required value={targetRole} onChange={(change) => setTargetRole(change.target.value)}><option value="">{t('Choose the board member you want to talk to.')}</option>{ELECTED_OFFICER_ROLES.map((role) => <option key={role} value={role}>{t(ROLE_LABELS[role])}</option>)}</select><small>{t('Your conversation is with the current holder of this role and stays with the role at the next election.')}</small></label>}<label>{t('Subject')}<input required minLength={2} maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>{t('Message')}<textarea required minLength={1} maxLength={4000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Sending…') : t('Send message')}</button></div></form></Modal>
}

/** Member side: opens a conversation directly from a board member's channel —
 *  the role is fixed by the channel that was clicked, no pick-list. */
export function MemberChannelComposer({ targetRole, onClose, onStarted }: { targetRole: string; onClose: () => void; onStarted: (threadId: string | null) => void | Promise<void> }) {
  const { t } = useI18n()
  const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const roleLabel = t(ROLE_LABELS[targetRole] ?? targetRole)
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase || busy) return
    setBusy(true); setError('')
    const { data, error: sendError } = await supabase.rpc('start_member_communication', { p_subject: subject.trim(), p_body: body.trim(), p_target_role: targetRole, p_member_id: null })
    if (sendError) { setError(sendError.message); setBusy(false); return }
    setBusy(false); await onStarted(typeof data === 'string' ? data : null)
  }
  return <Modal title={t('New message')} subtitle={t('You are writing to the {role}. Only the two of you see this conversation.', { role: roleLabel })} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="reversal-summary"><strong>{roleLabel}</strong><span>{t('Board member')}</span></div><label>{t('Subject')}<input required minLength={2} maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>{t('Message')}<textarea required minLength={1} maxLength={4000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Sending…') : t('Send message')}</button></div></form></Modal>
}

export function CommunicationThreadDialog({ thread, profiles, memberId, canManage, onClose, onSaved }: { thread: CommunicationThread; profiles: Profile[]; memberId: string; canManage: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [body, setBody] = useState(''); const [closing, setClosing] = useState(false); const [closureNote, setClosureNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const memberName = profiles.find((profile) => profile.id === thread.member_id)?.full_name ?? t('Member')
  const isMemberSide = thread.member_id === memberId
  const roleLabel = thread.target_role ? t(ROLE_LABELS[thread.target_role] ?? thread.target_role) : null
  async function send(formEvent: FormEvent<HTMLFormElement>) { formEvent.preventDefault(); if (!supabase || busy || !body.trim()) return; setBusy(true); setError(''); const { error: sendError } = await supabase.rpc('send_member_communication_message', { p_thread_id: thread.id, p_body: body.trim() }); if (sendError) { setError(sendError.message); setBusy(false); return } setBody(''); setBusy(false); await onSaved() }
  async function closeThread() { if (!supabase || busy || closureNote.trim().length < 4) return; setBusy(true); setError(''); const { error: closeError } = await supabase.rpc('close_member_communication', { p_thread_id: thread.id, p_reason: closureNote.trim() }); if (closeError) { setError(closeError.message); setBusy(false); return } setBusy(false); setClosing(false); await onSaved() }
  return <Modal title={thread.subject} subtitle={isMemberSide ? `${t('Private conversation with the board member you chose')}${roleLabel ? `: ${roleLabel}` : ''}` : `${t('Private conversation with')} ${memberName}`} onClose={onClose}><div className="chat-log">{thread.messages.map((message) => { const mine = message.sender_side === 'member' && isMemberSide; const authorName = message.sender_side === 'member' ? (isMemberSide ? t('You') : memberName) : (message.sender_id === memberId ? `${t('You')} · ${t('BAC team')}` : profiles.find((profile) => profile.id === message.sender_id)?.full_name ?? t('BAC Communications team')); return <article className={`chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}`} key={message.id}><p>{message.body}</p><small>{authorName} · {clubDateTime(message.created_at)}</small></article> })}{thread.status === 'closed' && <div className="chat-closed">{t('Conversation closed')}: {thread.closure_note}</div>}</div>{thread.status !== 'closed' && <><form className="chat-input-row" onSubmit={(formEvent) => void send(formEvent)}><input required maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('Write a message…')} aria-label={t('Your reply')} /><button type="submit" className="button button-primary" disabled={busy || !body.trim()} aria-label={t('Send message')}>{busy ? '…' : <MessageCircle size={16} />}</button></form>{error && <div className="auth-error" role="alert">{error}</div>}{!closing && canManage && <button type="button" className="chat-close-toggle" onClick={() => setClosing(true)}>{t('Close this conversation')}</button>}{closing && canManage && <div className="chat-close-form"><input className="communication-close-note" required minLength={4} maxLength={500} value={closureNote} onChange={(event) => setClosureNote(event.target.value)} placeholder={t('Closure note')} aria-label={t('Closure note')} /><button type="button" className="button button-danger" onClick={() => void closeThread()} disabled={busy || closureNote.trim().length < 4}>{busy ? t('Saving…') : t('Confirm close')}</button><button type="button" className="button button-outline" onClick={() => setClosing(false)}>{t('Cancel')}</button></div>}{!closing && canManage && thread.status === 'awaiting_member' && <p className="chat-waiting">{t('Waiting for the member to reply.')}</p>}</>}{thread.status === 'closed' && <p className="chat-waiting">{t('This conversation is closed. Start a new one if you need anything else.')}</p>}</Modal>
}

export function CommunicationsLive({ rows, ideas, ideaReviews, threads, profiles, canManage, canReviewIdeas, canManageInbox, onPublish, onSubmitIdea, onReviewIdea, onNewCommunication, onOpenCommunication, onStartInChannel }: { rows: Announcement[]; ideas: MemberIdea[]; ideaReviews: MemberIdeaReview[]; threads: CommunicationThread[]; profiles: Profile[]; canManage: boolean; canReviewIdeas: boolean; canManageInbox: boolean; onPublish: () => void; onSubmitIdea: () => void; onReviewIdea: (idea: MemberIdea) => void; onNewCommunication: () => void; onOpenCommunication: (thread: CommunicationThread) => void; onStartInChannel: (role: string) => void }) {
  const { t } = useI18n()
  const authorNames = new Map(profiles.map((profile) => [profile.id, `${profile.full_name} · ${profile.member_code}`]))
  const reviewsByIdea = new Map<string, MemberIdeaReview[]>()
  for (const review of ideaReviews) reviewsByIdea.set(review.idea_id, [...(reviewsByIdea.get(review.idea_id) ?? []), review])
  return <div className="communication-layout"><CommunicationInboxPanel threads={threads} profiles={profiles} canManage={canManageInbox} onNew={onNewCommunication} onOpen={onOpenCommunication} onStartInChannel={onStartInChannel} /><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Club news')}</h2><p>{canManage ? t('Publish official information for the club or a specific officer team.') : t('Updates published by the BAC team.')}</p></div>{canManage && <button className="button button-primary" onClick={onPublish}><Plus size={14} /> {t('Publish news')}</button>}</div>{rows.length ? rows.map((item) => <article className="live-news-item" key={item.id}><div className="live-news-icon"><MessageCircle size={17} /></div><div><span>{clubDateTime(item.published_at ?? item.created_at, { dateStyle: 'medium' })} · {item.audience === 'team' ? `${t(item.target_team?.replace('_', ' ') ?? '')} ${t('team')}` : item.audience === 'officers' ? t('All officers') : t('All members')}</span><h3>{item.title}</h3><p>{item.body}</p></div></article>) : <EmptyState title={t('No news published yet')} detail={t('Official club updates will appear here.')} />}</section><section className="live-panel ideas-panel"><div className="live-panel-head"><div><h2>{canReviewIdeas ? t('Member ideas') : t('Share an idea')}</h2><p>{canReviewIdeas ? t('Review suggestions and keep the member informed.') : t('Your idea goes to the General Secretary.')}</p></div>{!canReviewIdeas && <button className="button button-outline" onClick={onSubmitIdea}><Plus size={14} /> {t('Send an idea')}</button>}</div>{ideas.length ? ideas.map((idea) => { const history = reviewsByIdea.get(idea.id) ?? []; return <article className="idea-row" key={idea.id}><div><strong>{idea.title}</strong><p>{idea.description}</p><small>{canReviewIdeas ? authorNames.get(idea.submitted_by) ?? t('Member') : t('Your idea')} · {clubDateTime(idea.created_at, { dateStyle: 'medium' })}</small>{idea.review_note && <p className="idea-review-note"><strong>{t('Club update')}:</strong> {idea.review_note}</p>}{history.length > 0 && <details className="idea-review-history"><summary>{t('Review history')} · {history.length}</summary>{history.map((review) => <div key={review.id}><strong>{t(review.previous_status.replace('_', ' '))} → {t(review.new_status.replace('_', ' '))}</strong><span>{review.review_note}</span><small>{clubDateTime(review.created_at)}</small></div>)}</details>}</div><span className={`status-pill ${['accepted', 'implemented'].includes(idea.status) ? 'status-active' : 'status-pending'}`}><i />{t(idea.status.replace('_', ' '))}</span>{canReviewIdeas && !['declined', 'implemented'].includes(idea.status) && <button className="button button-outline idea-review-button" onClick={() => onReviewIdea(idea)}>{t('Review')}</button>}</article> }) : <EmptyState title={t('No ideas submitted yet')} detail={canReviewIdeas ? t('Member suggestions will appear here for review.') : t('Share an idea for an activity, project, or club improvement.')} />}{canReviewIdeas && <button className="card-bottom-link" onClick={onSubmitIdea}>{t('Submit a member idea')} <Plus size={13} /></button>}</section></div>
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
