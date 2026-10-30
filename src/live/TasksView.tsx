import { useState, type FormEvent } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { Identity } from '../AuthGate'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { TEAM_FOR_ROLE } from '../lib/roles'
import { clubDateTime, clubInputToIso } from './datetime'
import { ConfirmDialog, EmptyState, Modal } from './ui'
import type { ClubTask, Profile } from './types'

export function TasksLive({ rows, identity, canManage, onCreate, onStatusChange, onDeleted }: { rows: ClubTask[]; identity: Identity; canManage: boolean; onCreate: () => void; onStatusChange: (taskId: string, status: string, reason?: string) => void; onDeleted: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [pendingCorrection, setPendingCorrection] = useState<{ task: ClubTask; status: string } | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [taskToDelete, setTaskToDelete] = useState<ClubTask | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const statusFor = (task: ClubTask) => canManage ? task.status : task.task_assignments.find((assignment) => assignment.member_id === identity.id)?.status ?? task.status
  const visibleRows = rows.filter((task) => canManage || statusFor(task) !== 'cancelled')
  const active = visibleRows.filter((task) => !['done', 'cancelled'].includes(statusFor(task))).length
  const completed = visibleRows.filter((task) => statusFor(task) === 'done').length
  // Leadership, the responsible team's officer, or the task's creator may
  // manage it; the database enforces the same rule for every action.
  const canManageRow = (task: ClubTask) =>
    ['president', 'vice_president'].includes(identity.role)
    || task.created_by === identity.id
    || (Boolean(task.team) && TEAM_FOR_ROLE[identity.role] === task.team)
  const isBackwardChange = (from: string, to: string) => !(
    (from === 'todo' && ['in_progress', 'blocked', 'done'].includes(to))
    || (from === 'in_progress' && ['blocked', 'done'].includes(to))
    || (from === 'blocked' && to === 'done')
    || from === to
    || to === 'cancelled'
  )
  function requestStatusChange(task: ClubTask, from: string, to: string) {
    const requiresCorrection = canManage
      ? task.task_assignments.some((assignment) => isBackwardChange(assignment.status, to))
      : isBackwardChange(from, to)
    if (requiresCorrection) {
      setPendingCorrection({ task, status: to }); setCorrectionReason(''); setCorrectionError('')
      return
    }
    onStatusChange(task.id, to)
  }
  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingCorrection || correctionReason.trim().length < 4) { setCorrectionError(t('Explain why this task status needs correcting.')); return }
    onStatusChange(pendingCorrection.task.id, pendingCorrection.status, correctionReason.trim())
    setPendingCorrection(null); setCorrectionReason(''); setCorrectionError('')
  }
  async function confirmDelete() {
    if (!supabase || !taskToDelete || deleting) return
    setDeleting(true); setDeleteError('')
    const { error: deleteError } = await supabase.rpc('delete_task', { p_task_id: taskToDelete.id })
    if (deleteError) { setDeleteError(deleteError.message); setDeleting(false); return }
    setDeleting(false); setTaskToDelete(null); await onDeleted()
  }
  return <><section className="live-panel"><div className="live-panel-head"><div><h2>{canManage ? t('Club tasks') : t('My assigned tasks')}</h2><p>{canManage ? t('Work assigned across BAC teams. Member progress is tracked separately.') : t('Your progress is tracked separately for each assigned task.')}</p></div>{canManage && <button className="button button-primary" onClick={onCreate}><Plus size={14} /> {t('Assign task')}</button>}</div><div className="task-summary"><div className="task-summary-card"><span>{t('OPEN TASKS')}</span><strong>{active}</strong></div><div className="task-summary-card"><span>{t('COMPLETED')}</span><strong>{completed}</strong></div><div className="task-summary-card"><span>{t('ASSIGNED TO YOU')}</span><strong>{visibleRows.filter((task) => task.task_assignments?.some((assignment) => assignment.member_id === identity.id)).length}</strong></div></div>{visibleRows.length ? <div className="live-task-list">{visibleRows.map((task) => { const status = statusFor(task); const doneAssignees = task.task_assignments.filter((assignment) => assignment.status === 'done').length; const manageable = canManage; const deletable = canManage && canManageRow(task); return <article className="live-task-row" key={task.id}><div className={`live-task-status status-${status}`}><Check size={15} /></div><div className="live-task-copy"><strong>{task.title}</strong><p>{task.description || t('No details added.')}</p><small>{task.team ? `${t(task.team.replace('_', ' '))} ${t('team')} · ` : ''}{canManage ? `${t('{done}/{total} completed', { done: doneAssignees, total: task.task_assignments?.length ?? 0 })} · ` : ''}{t('{count} assignee(s)', { count: task.task_assignments?.length ?? 0 })}{task.due_at ? ` · ${t('Due {date}', { date: clubDateTime(task.due_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })}` : ''}</small></div><span className={`task-priority priority-${task.priority}`}>{t(task.priority)}</span>{manageable && <select className="task-status-select" aria-label={`${t('Update status for')} ${task.title}`} value={status} onChange={(event) => requestStatusChange(task, status, event.target.value)}>{['todo', 'in_progress', 'blocked', 'done', 'cancelled'].map((value) => <option key={value} value={value}>{t(value.replace('_', ' '))}</option>)}</select>}{!canManage && task.task_assignments.some((assignment) => assignment.member_id === identity.id) && <select className="task-status-select" aria-label={`${t('Update status for')} ${task.title}`} value={status} onChange={(event) => requestStatusChange(task, status, event.target.value)}>{['todo', 'in_progress', 'blocked', 'done'].map((value) => <option key={value} value={value}>{t(value.replace('_', ' '))}</option>)}</select>}{deletable && <button type="button" className="reverse-button" onClick={() => setTaskToDelete(task)} aria-label={`${t('Delete task')}: ${task.title}`}><Trash2 size={14} /></button>}</article> })}</div> : <EmptyState title={t('No tasks yet')} detail={canManage ? t('Assign a task to a member to coordinate the next club activity.') : t('When an officer assigns work to you, it will appear here.')} />}</section>{pendingCorrection && <Modal title={t('Correct task status')} subtitle={t('This moves the task to an earlier status. Explain the mistake so the correction is recorded.')} onClose={() => { setPendingCorrection(null); setCorrectionError('') }}><form className="live-form" onSubmit={submitCorrection}><p><strong>{pendingCorrection.task.title}</strong> · {t(pendingCorrection.task.status.replace('_', ' '))} → {t(pendingCorrection.status.replace('_', ' '))}</p><label>{t('Reason for correction')}<textarea required minLength={4} maxLength={500} rows={3} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder={t('Explain what was changed by mistake')} /></label>{correctionError && <div className="auth-error" role="alert">{correctionError}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={() => { setPendingCorrection(null); setCorrectionError('') }}>{t('Cancel')}</button><button type="submit" className="button button-primary">{t('Save correction')}</button></div></form></Modal>}{taskToDelete && <ConfirmDialog
      title={t('Delete this task?')}
      message={`${t('This permanently removes "{title}" and its assignments from every assignee. The deletion is audit logged.', { title: taskToDelete.title })}`}
      confirmLabel={t('Delete task')}
      busy={deleting}
      onConfirm={() => void confirmDelete()}
      onClose={() => { setTaskToDelete(null); setDeleteError('') }}
    >{deleteError && <div className="auth-error" role="alert">{deleteError}</div>}</ConfirmDialog>}</>
}

export function TaskDialog({ profiles, role, onClose, onSaved }: { profiles: Profile[]; role: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const teamForRole: Record<string, string> = { communications_officer: 'communications', treasurer: 'treasury', vice_treasurer: 'treasury', hr: 'hr', vice_hr: 'hr', general_secretary: 'secretariat', logistics_officer: 'logistics', vice_logistics_officer: 'logistics' }
  const allowedTeams = role === 'president' || role === 'vice_president' ? ['club', 'president', 'communications', 'treasury', 'hr', 'secretariat', 'logistics'] : [teamForRole[role] ?? 'club']
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [team, setTeam] = useState(allowedTeams[0]); const [priority, setPriority] = useState('normal'); const [due, setDue] = useState(''); const [assigneeIds, setAssigneeIds] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (!assigneeIds.length) { setError(t('Choose at least one member for this task.')); return }
    setBusy(true); setError('')
    const dueIso = due ? clubInputToIso(due) : null
    if (due && !dueIso) { setError(t('Choose a valid deadline in Morocco time.')); setBusy(false); return }
    const { error: taskError } = await supabase.rpc('create_assigned_task', { p_title: title.trim(), p_description: description.trim(), p_team: team, p_priority: priority, p_due_at: dueIso, p_member_ids: assigneeIds })
    if (taskError) { setError(taskError.message || t('Could not create and assign this task. Check your role and active member list.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Assign a club task')} subtitle={t('Choose a BAC team, set a deadline, and assign one task to multiple active members.')} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('Task title')}<input required maxLength={140} value={title} onChange={(change) => setTitle(change.target.value)} /></label><label>{t('Description')}<textarea rows={3} maxLength={2000} value={description} onChange={(change) => setDescription(change.target.value)} /></label><div className="live-form-grid"><label>{t('Team')}<select value={team} onChange={(change) => setTeam(change.target.value)}>{allowedTeams.map((item) => <option key={item} value={item}>{t(item.replace('_', ' '))}</option>)}</select></label><label>{t('Priority')}<select value={priority} onChange={(change) => setPriority(change.target.value)}><option value="low">{t('Low')}</option><option value="normal">{t('Normal')}</option><option value="high">{t('High')}</option><option value="urgent">{t('Urgent')}</option></select></label></div><div className="assignee-picker-field"><span>{t('Assign to active members')}</span><div className="assignee-picker">{profiles.filter((person) => person.status === 'active').map((person) => <label className="assignee-option" key={person.id}><input type="checkbox" checked={assigneeIds.includes(person.id)} onChange={(event) => { const checked = event.currentTarget.checked; setAssigneeIds((current) => checked ? [...current, person.id] : current.filter((id) => id !== person.id)) }} /><span>{person.full_name} · {person.member_code}</span></label>)}</div><small>{t('{count} selected', { count: assigneeIds.length })}</small></div><label>{t('Due date and time (Morocco)')}<input type="datetime-local" value={due} onChange={(change) => setDue(change.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Assigning…') : t('Create task')}</button></div></form></Modal>
}
