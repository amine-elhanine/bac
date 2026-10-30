import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronLeft, MessageCircle, Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { ELECTED_OFFICER_ROLES, ROLE_LABELS } from '../lib/roles'
import { clubDateTime, initials } from './datetime'
import { EmptyState, Modal } from './ui'
import type { Announcement, CommunicationThread, MemberIdea, MemberIdeaReview, Profile } from './types'

/** WhatsApp-style two-pane chat in Communications: a conversation list beside
 *  the open conversation, bubbles, and an input row. Replies arrive in place
 *  through the workspace realtime refresh. Members chat with each board
 *  member directly; the board sees the conversations addressed to its role. */
function CommunicationChatPanel({ threads, profiles, canManage, onNew, onRefresh, onNotify }: { threads: CommunicationThread[]; profiles: Profile[]; canManage: boolean; onNew: () => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void }) {
  const { t } = useI18n()
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [newChannelRole, setNewChannelRole] = useState<string | null>(null)
  const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [closing, setClosing] = useState(false); const [closureNote, setClosureNote] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const memberStatusLabel: Record<string, string> = { open: t('Awaiting club reply'), awaiting_member: t('Club replied'), closed: t('Closed') }
  type ChatListItem = { key: string; role: string | null; thread: CommunicationThread | null; name: string; preview: string; time: string | null }
  const listItems: ChatListItem[] = canManage
    ? threads.map((thread) => { const latest = thread.messages[thread.messages.length - 1]; return { key: thread.id, role: null, thread, name: names.get(thread.member_id) ?? t('Member'), preview: latest?.body ?? t('No messages yet.'), time: clubDateTime(thread.updated_at) } })
    : ELECTED_OFFICER_ROLES.map((role) => {
        const roleThreads = threads.filter((thread) => thread.target_role === role)
        const thread = roleThreads.find((item) => item.status !== 'closed') ?? null
        const name = t(ROLE_LABELS[role] ?? role)
        const latest = thread?.messages[thread.messages.length - 1]
        return { key: role, role, thread, name, preview: thread ? latest?.body ?? t('No messages yet.') : t('Start a private conversation with the {role}.', { role: name }), time: thread ? clubDateTime(thread.updated_at) : null }
      })
  const openItem = (item: ChatListItem) => { if (item.thread) { setSelectedThreadId(item.thread.id); setNewChannelRole(null) } else { setNewChannelRole(item.role ?? item.key); setSelectedThreadId(null) } }
  const selected = selectedThreadId ? threads.find((thread) => thread.id === selectedThreadId) ?? null : null
  const startingNew = !canManage && !selected && Boolean(newChannelRole)
  const roleLabel = selected?.target_role ? t(ROLE_LABELS[selected.target_role] ?? selected.target_role) : newChannelRole ? t(ROLE_LABELS[newChannelRole] ?? newChannelRole) : null
  const memberName = selected ? names.get(selected.member_id) ?? t('Member') : null
  const chatName = canManage ? memberName : roleLabel
  useEffect(() => { setBody(''); setError(''); setClosing(false); setClosureNote('') }, [selectedThreadId, newChannelRole])
  // Keep the newest message in view whenever a message lands.
  useEffect(() => { const log = logRef.current; if (log) log.scrollTop = log.scrollHeight }, [selectedThreadId, newChannelRole, selected?.messages.length, threads])
  async function send(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase || busy || !body.trim()) return
    const trimmed = body.trim()
    setBusy(true); setError('')
    if (startingNew) {
      // First message of a conversation with a board member: the subject is
      // derived from the message so no separate subject field is needed.
      if (trimmed.length < 2) { setError(t('Enter a subject and a message of up to 4,000 characters.')); setBusy(false); return }
      const { data, error: sendError } = await supabase.rpc('start_member_communication', { p_subject: trimmed.slice(0, 140), p_body: trimmed, p_target_role: newChannelRole, p_member_id: null })
      if (sendError) { setError(sendError.message); setBusy(false); return }
      setBody(''); setBusy(false); setNewChannelRole(null); if (typeof data === 'string') setSelectedThreadId(data); onNotify(t('Message sent.')); await onRefresh(); return
    }
    if (!selected) { setBusy(false); return }
    const { error: sendError } = await supabase.rpc('send_member_communication_message', { p_thread_id: selected.id, p_body: trimmed })
    if (sendError) { setError(sendError.message); setBusy(false); return }
    setBody(''); setBusy(false); onNotify(t('Message sent.')); await onRefresh()
  }
  async function closeThread() {
    if (!supabase || busy || !selected || closureNote.trim().length < 4) return
    setBusy(true); setError('')
    const { error: closeError } = await supabase.rpc('close_member_communication', { p_thread_id: selected.id, p_reason: closureNote.trim() })
    if (closeError) { setError(closeError.message); setBusy(false); return }
    setBusy(false); setClosing(false); await onRefresh()
  }
  return <section className="live-panel chat-app-panel">
    <div className={`chat-app${selected || startingNew ? ' chat-app-open' : ''}`}>
      <aside className="chat-app-list">
        <header className="chat-app-list-head"><div><h2>{canManage ? t('Member communication inbox') : t('Contact the board')}</h2><p>{canManage ? t('Private member messages addressed to your board role.') : t('Choose a board member and chat privately — only you and they see the messages.')}</p></div>{canManage && <button type="button" className="button button-primary" onClick={onNew} aria-label={t('New message')}><Plus size={15} /></button>}</header>
        <div className="chat-app-scroll">{listItems.map((item) => {
          const needsReply = item.thread ? (canManage ? item.thread.status === 'open' : item.thread.status === 'awaiting_member') : false
          const active = item.thread ? selectedThreadId === item.thread.id : newChannelRole === item.role
          return <button type="button" key={item.key} className={`chat-app-item${active ? ' chat-app-item-active' : ''}`} onClick={() => openItem(item)}>
            <span className="chat-app-avatar">{initials(item.name)}</span>
            <span className="chat-app-item-copy"><strong>{item.name}</strong><p>{item.preview}</p></span>
            <span className="chat-app-item-meta">{item.time && <small>{item.time}</small>}{needsReply && <i aria-hidden="true" />}</span>
          </button>
        })}{canManage && !listItems.length && <p className="chat-app-note">{t('Member messages addressed to your role will appear here.')}</p>}</div>
      </aside>
      <section className="chat-app-window">
        {selected || startingNew ? <>
          <header className="chat-app-head">
            <button type="button" className="chat-back button button-outline" onClick={() => { setSelectedThreadId(null); setNewChannelRole(null) }} aria-label={t('Back')}><ChevronLeft size={16} /></button>
            <span className="chat-app-avatar">{chatName ? initials(chatName) : ''}</span>
            <div className="chat-app-head-copy"><strong>{chatName}</strong><small>{canManage ? selected ? selected.status === 'closed' ? `${t('Conversation closed')}: ${selected.closure_note}` : selected.subject : '' : startingNew ? t('Board member') : selected ? memberStatusLabel[selected.status] ?? '' : ''}</small></div>
          </header>
          <div className="chat-app-log" ref={logRef}>
            {(selected?.messages ?? []).map((message) => { const mine = canManage ? message.sender_side === 'club_team' : message.sender_side === 'member'; const authorName = canManage ? (mine ? t('You') : memberName ?? t('Member')) : mine ? t('You') : `${roleLabel ?? ''} · ${t('BAC team')}`; return <article className={`chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}`} key={message.id}><p>{message.body}</p><small>{authorName} · {clubDateTime(message.created_at)}</small></article> })}
            {!selected && <div className="chat-app-note">{t('Start a private conversation with the {role}.', { role: roleLabel ?? '' })}</div>}
            {selected?.status === 'closed' && <div className="chat-closed">{t('Conversation closed')}: {selected.closure_note}</div>}
          </div>
          {(!selected || selected.status !== 'closed') && <footer className="chat-app-foot"><form className="chat-input-row" onSubmit={(formEvent) => void send(formEvent)}><input required maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={startingNew ? t('Write your first message…') : t('Write a message…')} aria-label={t('Your reply')} /><button type="submit" className="button button-primary" disabled={busy || !body.trim()} aria-label={t('Send message')}>{busy ? '…' : <MessageCircle size={16} />}</button></form>{error && <div className="auth-error chat-app-error" role="alert">{error}</div>}</footer>}
          {canManage && selected && selected.status !== 'closed' && (!closing
            ? <div className="chat-app-close-slot"><button type="button" className="chat-close-toggle" onClick={() => setClosing(true)}>{t('Close this conversation')}</button></div>
            : <div className="chat-app-close-slot"><div className="chat-close-form"><input className="communication-close-note" required minLength={4} maxLength={500} value={closureNote} onChange={(event) => setClosureNote(event.target.value)} placeholder={t('Closure note')} aria-label={t('Closure note')} /><button type="button" className="button button-danger" onClick={() => void closeThread()}>{t('Confirm close')}</button></div></div>)}
        </> : <div className="chat-app-empty"><MessageCircle size={30} /><strong>{canManage ? t('Member communication inbox') : t('Contact the board')}</strong><p>{canManage ? t('Open a conversation from the list, or start a new one.') : t('Choose a board member and chat privately — only you and they see the messages.')}</p></div>}
      </section>
    </div>
  </section>
}

export function NewCommunicationDialog({ userId, profiles, canManage, onClose, onSaved }: { userId: string; profiles: Profile[]; canManage: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
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
    ? <label>{t('Member')}<select required value={memberId} onChange={(change) => setMemberId(change.target.value)}><option value="">{t('Choose an active member')}</option>{profiles.filter((profile) => profile.status === 'active' && profile.id !== userId).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {profile.member_code}</option>)}</select></label>
    : <label>{t('Board member')}<select required value={targetRole} onChange={(change) => setTargetRole(change.target.value)}><option value="">{t('Choose the board member you want to talk to.')}</option>{ELECTED_OFFICER_ROLES.map((role) => <option key={role} value={role}>{t(ROLE_LABELS[role])}</option>)}</select><small>{t('Your conversation is with the current holder of this role and stays with the role at the next election.')}</small></label>}<label>{t('Subject')}<input required minLength={2} maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>{t('Message')}<textarea required minLength={1} maxLength={4000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Sending…') : t('Send message')}</button></div></form></Modal>
}

export function CommunicationsLive({ rows, ideas, ideaReviews, threads, profiles, canManage, canReviewIdeas, canManageInbox, onPublish, onSubmitIdea, onReviewIdea, onNewCommunication, onRefresh, onNotify }: { rows: Announcement[]; ideas: MemberIdea[]; ideaReviews: MemberIdeaReview[]; threads: CommunicationThread[]; profiles: Profile[]; canManage: boolean; canReviewIdeas: boolean; canManageInbox: boolean; onPublish: () => void; onSubmitIdea: () => void; onReviewIdea: (idea: MemberIdea) => void; onNewCommunication: () => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void }) {
  const { t } = useI18n()
  const authorNames = new Map(profiles.map((profile) => [profile.id, `${profile.full_name} · ${profile.member_code}`]))
  const reviewsByIdea = new Map<string, MemberIdeaReview[]>()
  for (const review of ideaReviews) reviewsByIdea.set(review.idea_id, [...(reviewsByIdea.get(review.idea_id) ?? []), review])
  return <div className="communication-layout"><CommunicationChatPanel threads={threads} profiles={profiles} canManage={canManageInbox} onNew={onNewCommunication} onRefresh={onRefresh} onNotify={onNotify} /><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Club news')}</h2><p>{canManage ? t('Publish official information for the club or a specific officer team.') : t('Updates published by the BAC team.')}</p></div>{canManage && <button className="button button-primary" onClick={onPublish}><Plus size={14} /> {t('Publish news')}</button>}</div>{rows.length ? rows.map((item) => <article className="live-news-item" key={item.id}><div className="live-news-icon"><MessageCircle size={17} /></div><div><span>{clubDateTime(item.published_at ?? item.created_at, { dateStyle: 'medium' })} · {item.audience === 'team' ? `${t(item.target_team?.replace('_', ' ') ?? '')} ${t('team')}` : item.audience === 'officers' ? t('All officers') : t('All members')}</span><h3>{item.title}</h3><p>{item.body}</p></div></article>) : <EmptyState title={t('No news published yet')} detail={t('Official club updates will appear here.')} />}</section><section className="live-panel ideas-panel"><div className="live-panel-head"><div><h2>{canReviewIdeas ? t('Member ideas') : t('Share an idea')}</h2><p>{canReviewIdeas ? t('Review suggestions and keep the member informed.') : t('Your idea goes to the General Secretary.')}</p></div>{!canReviewIdeas && <button className="button button-outline" onClick={onSubmitIdea}><Plus size={14} /> {t('Send an idea')}</button>}</div>{ideas.length ? ideas.map((idea) => { const history = reviewsByIdea.get(idea.id) ?? []; return <article className="idea-row" key={idea.id}><div><strong>{idea.title}</strong><p>{idea.description}</p><small>{canReviewIdeas ? authorNames.get(idea.submitted_by) ?? t('Member') : t('Your idea')} · {clubDateTime(idea.created_at, { dateStyle: 'medium' })}</small>{idea.review_note && <p className="idea-review-note"><strong>{t('Club update')}:</strong> {idea.review_note}</p>}{history.length > 0 && <details className="idea-review-history"><summary>{t('Review history')} · {history.length}</summary>{history.map((review) => <div key={review.id}><strong>{t(review.previous_status.replace('_', ' '))} → {t(review.new_status.replace('_', ' '))}</strong><span>{review.review_note}</span><small>{clubDateTime(review.created_at)}</small></div>)}</details>}</div><span className={`status-pill ${['accepted', 'implemented'].includes(idea.status) ? 'status-active' : 'status-pending'}`}><i />{t(idea.status.replace('_', ' '))}</span>{canReviewIdeas && !['declined', 'implemented'].includes(idea.status) && <button className="button button-outline idea-review-button" onClick={() => onReviewIdea(idea)}>{t('Review')}</button>}</article> }) : <EmptyState title={t('No ideas submitted yet')} detail={canReviewIdeas ? t('Member suggestions will appear here for review.') : t('Share an idea for an activity, project, or club improvement.')} />}{canReviewIdeas && <button className="card-bottom-link" onClick={onSubmitIdea}>{t('Submit a member idea')} <Plus size={13} /></button>}</section></div>
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
