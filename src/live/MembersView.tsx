import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, Search, Shield, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { ELECTED_OFFICER_ROLES, ROLE_LABELS, UNIQUE_VIOLATION } from '../lib/roles'
import { clubDateInput, clubDateOnly, clubDateTime, initials } from './datetime'
import { ConfirmDialog, EmptyState, Modal } from './ui'
import type { ClubRoleDefinition, Profile, ProfileHistory } from './types'

export function MembersLive({ profiles, roles, roleCatalog, search, setSearch, canManage, canManageRoles, onInvite, onStartNewTerm, onChangeStatus, onEdit, onManageRole, onResetPassword, onDeleted, onRoleCreated }: { profiles: Profile[]; roles: Record<string, string>; roleCatalog: ClubRoleDefinition[]; search: string; setSearch: (value: string) => void; canManage: boolean; canManageRoles: boolean; onInvite: () => void; onStartNewTerm: () => void; onChangeStatus: (member: Profile, nextStatus: string) => void; onEdit: (member: Profile) => void; onManageRole: (member: Profile, nextRole: string) => void; onResetPassword: (member: Profile) => void; onDeleted: () => void | Promise<void>; onRoleCreated: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [manageRolesOpen, setManageRolesOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Profile | null>(null)
  const [deletionReason, setDeletionReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  async function confirmDelete() {
    if (!supabase || !memberToDelete || deleting) return
    if (deletionReason.trim().length < 4) { setDeleteError(t('Add a short reason for this deletion.')); return }
    setDeleting(true); setDeleteError('')
    const { data, error: deleteError } = await supabase.functions.invoke('delete-member', { body: { member_id: memberToDelete.id, reason: deletionReason.trim() } })
    if (deleteError || !data?.deleted) {
      let detail = data?.error
      if (!detail && deleteError?.context instanceof Response) {
        const responseBody = await deleteError.context.clone().json().catch(() => null) as { error?: string } | null
        if (responseBody?.error) detail = t(responseBody.error)
      }
      setDeleteError(detail ?? deleteError?.message ?? t('Member deletion could not be completed. Please try again.'))
      setDeleting(false); return
    }
    setDeleting(false); setMemberToDelete(null); setDeletionReason(''); await onDeleted()
  }
  return <>
    <section className="live-panel"><div className="live-panel-head"><div><h2>{t('Member directory')}</h2><p>{canManage ? t('Roster access follows your current club role. Member and role changes are reasoned and logged.') : t('Your member profile.')}</p></div><div className="live-panel-actions">{canManageRoles && <><button className="button button-outline" onClick={() => setManageRolesOpen(true)}><Shield size={14} /> {t('Manage roles')}</button><button className="button button-outline" onClick={onStartNewTerm}>{t('Start new term')}</button></>}{canManage && <button className="button button-primary" onClick={onInvite}><Plus size={14} /> {t('Invite member')}</button>}<label className="live-search"><Search size={15} /><input placeholder={t('Search members')} value={search} onChange={(event) => setSearch(event.target.value)} /></label></div></div>{profiles.length ? <div className="table-scroll"><table><thead><tr><th>{t('MEMBER')}</th><th>{t('PHONE')}</th><th>{t('PROGRAM')}</th><th>{t('STATUS')}</th><th>{t('CLUB ROLE')}</th>{canManage && <th>{t('MEMBERSHIP')}</th>}</tr></thead><tbody>{profiles.map((person) => <tr key={person.id}><td><div className="member-cell"><div className="avatar avatar-mint">{initials(person.full_name)}</div><div className="member-cell-copy"><div className="member-cell-name"><strong>{person.full_name}</strong><span className="member-code-tag">{person.member_code}</span></div><small>{person.email ?? t('No email on profile')}</small></div></div></td><td>{person.phone_number ? <a href={`tel:${person.phone_number}`} dir="ltr">{person.phone_number}</a> : <span className="reconciliation-empty">—</span>}</td><td>{person.study_program ?? '—'}{person.cohort ? ` · ${person.cohort}` : ''}</td><td>{canManage ? <select className={`member-inline-select ${person.status === 'active' ? 'member-status-active' : 'member-status-pending'}`} value={person.status} aria-label={`${t('Membership status')}: ${person.full_name}`} onChange={(event) => { const nextStatus = event.target.value; if (nextStatus !== person.status) onChangeStatus(person, nextStatus) }}><option value="applicant">{t('Applicant')}</option><option value="active">{t('Active')}</option><option value="suspended">{t('Suspended')}</option><option value="former">{t('Former member')}</option></select> : <span className={`status-pill ${person.status === 'active' ? 'status-active' : 'status-pending'}`}><i />{t(person.status)}</span>}</td><td>{canManageRoles ? <select className="member-inline-select member-inline-role" value={roles[person.id] ?? 'member'} aria-label={`${t('Club role')}: ${person.full_name}`} onChange={(event) => { const nextRole = event.target.value; if (nextRole !== (roles[person.id] ?? 'member')) onManageRole(person, nextRole) }}>{roleCatalog.map((role) => <option key={role.role_key} value={role.role_key}>{t(ROLE_LABELS[role.role_key] ?? role.display_name)}</option>)}</select> : t(ROLE_LABELS[roles[person.id] ?? 'member'] ?? roleCatalog.find((role) => role.role_key === roles[person.id])?.display_name ?? 'Member')}</td>{canManage && <td><div className="member-actions"><button type="button" className="member-icon-button" onClick={() => onResetPassword(person)} aria-label={`${t('Reset password')}: ${person.full_name}`} title={t('Reset password')}><KeyRound size={15} /></button><button type="button" className="member-icon-button" onClick={() => onEdit(person)} aria-label={`${t('Edit details')}: ${person.full_name}`} title={t('Edit details')}><Pencil size={15} /></button><button type="button" className="member-icon-button member-icon-danger" onClick={() => { setMemberToDelete(person); setDeletionReason(''); setDeleteError('') }} aria-label={`${t('Delete member')}: ${person.full_name}`} title={t('Delete member')}><Trash2 size={15} /></button></div></td>}</tr>)}</tbody></table></div> : <EmptyState title={t('No members found')} detail={t('The member list may be empty or restricted by your club role.')} />}</section>
    {manageRolesOpen && <ClubRoleManagerDialog roles={roleCatalog} onClose={() => setManageRolesOpen(false)} onSaved={async () => { setManageRolesOpen(false); await onRoleCreated() }} />}
    {memberToDelete && <ConfirmDialog
      title={t('Delete this member?')}
      message={`${t('This permanently removes the account and profile of {name} ({code}). Members with attendance, finance, or points history cannot be deleted; set their status to Former instead. The deletion is audit logged.', { name: memberToDelete.full_name, code: memberToDelete.member_code })}`}
      confirmLabel={t('Delete member')}
      busy={deleting}
      onConfirm={() => void confirmDelete()}
      onClose={() => { setMemberToDelete(null); setDeleteError('') }}
    >
      <label>{t('Reason for deletion')}<textarea required minLength={4} maxLength={500} rows={2} value={deletionReason} onChange={(change) => setDeletionReason(change.target.value)} placeholder={t('For example: duplicate account created by mistake')} /></label>
      {deleteError && <div className="auth-error" role="alert">{deleteError}</div>}
    </ConfirmDialog>}
  </>
}

export function InviteMemberDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (memberCode: string, email: string, temporaryPassword: string | null) => void | Promise<void> }) {
  const { t } = useI18n()
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [phoneNumber, setPhoneNumber] = useState(''); const [memberCode, setMemberCode] = useState(''); const [program, setProgram] = useState(''); const [cohort, setCohort] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const { data, error: inviteError } = await supabase.functions.invoke('invite-member', { body: { full_name: fullName.trim(), email: email.trim(), phone_number: phoneNumber.trim(), member_code: memberCode.trim().toUpperCase(), study_program: program.trim(), cohort: cohort.trim(), delivery_method: 'manual' } })
    if (inviteError || !data?.member_id) {
      let detail = data?.error
      if (!detail && inviteError?.context instanceof Response) {
        const responseBody = await inviteError.context.clone().json().catch(() => null) as { error?: string } | null
        if (responseBody?.error) detail = t(responseBody.error)
      }
      setError(detail ?? inviteError?.message ?? t('Member onboarding could not be completed. Check the current club term and try again.'))
      setBusy(false); return
    }
    setBusy(false); await onSaved(data.member_code ?? memberCode.trim().toUpperCase(), email.trim(), typeof data.temporary_password === 'string' ? data.temporary_password : null)
  }
  return <Modal title={t('Add an accepted member')} subtitle={t('Create the member’s account with a one-time temporary password for verified, in-person onboarding.')} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="role-transfer-note">{t('Use only after verifying the member in person. BAC confirms the email for account setup, displays a random password once, and requires the member to replace it before accessing the app. Do not send the temporary password in a public group chat.')}</div><label>{t('Full name')}<input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>{t('Email address')}<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>{t('Phone number')}<input type="tel" maxLength={32} pattern="[+0-9() .-]*" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+212 6 12 34 56 78" /></label><label>{t('Member code')}<input required minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]+" value={memberCode} onChange={(event) => setMemberCode(event.target.value.toUpperCase())} placeholder="e.g. BAC-2026-042" /></label><div className="live-form-grid"><label>{t('Study program')}<input maxLength={150} value={program} onChange={(event) => setProgram(event.target.value)} /></label><label>{t('Cohort / academic year')}<input maxLength={80} value={cohort} onChange={(event) => setCohort(event.target.value)} /></label></div><div className="role-transfer-note">{t('Use this for members whose BAC membership has already been accepted. New members start with the Member role; only the President can assign officer roles.')}</div>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Creating account…') : t('Create temporary credentials')}</button></div></form></Modal>
}

export function TemporaryMemberPasswordDialog({ credentials, onClose }: { credentials: { email: string; password: string }; onClose: () => void }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  async function copy() { try { await navigator.clipboard.writeText(`${credentials.email}\n${credentials.password}`); setCopied(true) } catch { setCopied(false) } }
  return <Modal title={t('Temporary member credentials')} subtitle={t('Shown once. Give these directly to the verified member in person and ask them to set a personal password immediately.')} onClose={onClose}><div className="live-form"><label>{t('Account email')}<input readOnly value={credentials.email} /></label><label>{t('Temporary password')}<input readOnly type="text" autoComplete="off" value={credentials.password} /></label><div className="role-transfer-note">{t('This temporary password is not stored by BAC. Closing this window discards it; if it is lost, use the member’s account recovery process.')}</div><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => void copy()}>{copied ? t('Copied') : t('Copy credentials')}</button><button type="button" className="button button-primary" onClick={onClose}>{t('Done')}</button></div></div></Modal>
}

export function MemberStatusDialog({ member, nextStatus, onClose, onSaved }: { member: Profile; nextStatus: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (reason.trim().length < 4) { setError(t('Enter a short reason for this membership status change.')); return }
    setBusy(true); setError('')
    const { error: updateError } = await supabase.rpc('change_member_status', { p_member_id: member.id, p_new_status: nextStatus, p_reason: reason.trim() })
    if (updateError) { setError(t('Could not update this member. Confirm your current role and try again.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Confirm membership status change')} subtitle={`${member.full_name} · ${t(member.status)} → ${t(nextStatus)}`} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="role-transfer-note">{t('This status change is saved to the restricted HR history and the member is notified.')}</div><label>{t('Reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(change) => setReason(change.target.value)} placeholder={t('Record the reason for this change')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving…') : t('Save status change')}</button></div></form></Modal>
}

export function MemberRoleDialog({ member, currentRole, nextRole, roleCatalog, onClose, onSaved }: { member: Profile; currentRole: string; nextRole: string; roleCatalog: ClubRoleDefinition[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (reason.trim().length < 4) { setError(t('Enter a reason for this role change.')); return }
    setBusy(true); setError('')
    const { error: roleError } = await supabase.rpc('set_member_role', { p_member_id: member.id, p_new_role: nextRole, p_reason: reason.trim() })
    if (roleError) { setError(roleError.code === UNIQUE_VIOLATION ? t('That role is already assigned. Check the current officer list.') : t('Could not change this role. Confirm there is another President before transferring that role.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  const roleName = (key: string) => t(ROLE_LABELS[key] ?? roleCatalog.find((role) => role.role_key === key)?.display_name ?? key)
  return <Modal title={t('Confirm club role change')} subtitle={`${member.full_name} · ${roleName(currentRole)} → ${roleName(nextRole)}`} onClose={onClose}><form className="live-form" onSubmit={submit}>{nextRole === 'president' && currentRole !== 'president' && <div className="role-transfer-note">{t('Assigning President transfers the current President role to this member in one audited operation.')}</div>}<label>{t('Reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(change) => setReason(change.target.value)} placeholder={t('For example, approved officer election or handover')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving…') : t('Save role change')}</button></div></form></Modal>
}

export function ClubRoleManagerDialog({ roles, onClose, onSaved }: { roles: ClubRoleDefinition[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const permissionOptions = roles.filter((role) => !role.is_custom && !['president','vice_president','member'].includes(role.role_key))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    if (!permissions.length) { setError(t('Choose at least one permission group.')); return }
    if (reason.trim().length < 4) { setError(t('Enter a reason for creating this role.')); return }
    setBusy(true); setError('')
    const { error: createError } = await supabase.rpc('create_club_role', { p_name: name.trim(), p_permission_roles: permissions, p_reason: reason.trim() })
    if (createError) { setError(createError.code === UNIQUE_VIOLATION ? t('A role already uses that name. Choose another name.') : t('Could not create this role. Check the name and permissions.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Create a club role')} subtitle={t('Give the role a name and choose which existing permission groups it includes. The President role stays exclusive.')} onClose={onClose}><form className="live-form" onSubmit={(event) => void submit(event)}><label>{t('Role name')}<input required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('For example: Events Coordinator')} /></label><div className="assignee-picker-field"><span>{t('Permission groups')}</span><div className="assignee-picker">{permissionOptions.map((role) => <label className="assignee-option" key={role.role_key}><input type="checkbox" checked={permissions.includes(role.role_key)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, role.role_key] : current.filter((item) => item !== role.role_key))} /><span>{t(ROLE_LABELS[role.role_key] ?? role.display_name)}</span></label>)}</div><small>{t('A role receives the combined access of the selected groups.')}</small></div><label>{t('Reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('Explain why this role is being created')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Creating role…') : t('Create role')}</button></div></form></Modal>
}

export function StartTermDialog({ profiles, currentTermName, currentTermEndsOn, onClose, onSaved }: { profiles: Profile[]; currentTermName: string; currentTermEndsOn: string | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const startDefault = clubDateInput(new Date())
  const minimumStartOn = currentTermEndsOn ? new Date(Date.parse(`${currentTermEndsOn}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : ''
  const canStartAfterCurrentTerm = Boolean(minimumStartOn) && minimumStartOn <= startDefault
  const endDefaultDate = new Date(`${startDefault}T12:00:00`)
  endDefaultDate.setFullYear(endDefaultDate.getFullYear() + 1)
  endDefaultDate.setDate(endDefaultDate.getDate() - 1)
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState(startDefault)
  const [endsOn, setEndsOn] = useState(clubDateInput(endDefaultDate))
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeProfiles = profiles.filter((profile) => profile.status === 'active').sort((a, b) => a.full_name.localeCompare(b.full_name))

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || busy) return
    if (!canStartAfterCurrentTerm || startsOn < minimumStartOn || startsOn > startDefault || endsOn < startsOn || endsOn < startDefault) { setError(currentTermEndsOn ? t('The new term can start only from {date}, and it cannot be dated in the future.', { date: clubDateOnly(currentTermEndsOn) }) : t('Could not load the current term end date. Reload and try again.')); return }
    if (!assignments.president) { setError(t('Assign exactly one President to the new term.')); return }
    const assignedMemberIds = Object.values(assignments).filter(Boolean)
    if (new Set(assignedMemberIds).size !== assignedMemberIds.length) { setError(t('Each member can hold only one officer role in a term.')); return }
    if (!confirmed) { setError(t('Confirm that you understand this switches active roles immediately.')); return }
    setBusy(true); setError('')
    const p_assignments = ELECTED_OFFICER_ROLES.filter((role) => assignments[role]).map((role) => ({ role, member_id: assignments[role] }))
    const { error: saveError } = await supabase.rpc('start_club_term', { p_term_name: name.trim(), p_starts_on: startsOn, p_ends_on: endsOn, p_assignments, p_reason: reason.trim() })
    if (saveError) { setError(saveError.message || t('Could not start the new term. Check the dates, roster, and current President role.')); setBusy(false); return }
    await onSaved()
  }

  return <Modal title={t('Start a new club term')} subtitle={`${t('Current term')}: ${currentTermName} · ${t('ends')} ${currentTermEndsOn ? clubDateOnly(currentTermEndsOn) : t('date unavailable')}. ${t('This replaces the active term and its officer assignments.')}`} onClose={onClose}><form className="live-form" onSubmit={(formEvent) => void submit(formEvent)}><label>{t('New term name')}<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('For example, 2027–2028')} /></label><div className="live-form-grid"><label>{t('Term starts')}<input required type="date" min={minimumStartOn || undefined} max={startDefault} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label><label>{t('Term ends')}<input required type="date" min={startsOn > startDefault ? startsOn : startDefault} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label></div>{canStartAfterCurrentTerm ? <p className="reconciliation-empty">{t('The new term must start after {date} and cannot be dated in the future.', { date: clubDateOnly(currentTermEndsOn ?? '') })}</p> : <p className="reconciliation-empty">{t('The current term ends {date}. You can activate its successor starting {next}, once that date arrives.', { date: currentTermEndsOn ? clubDateOnly(currentTermEndsOn) : t('date unavailable'), next: minimumStartOn || t('after the current term end') })}</p>}<h3>{t('Officer assignments')}</h3><p className="reconciliation-empty">{t('Assign one active member per role. The President is required; other roles may remain vacant.')}</p>{ELECTED_OFFICER_ROLES.map((role) => <label key={role}>{t(ROLE_LABELS[role])}{role === 'president' && ' *'}<select required={role === 'president'} value={assignments[role] ?? ''} onChange={(event) => setAssignments((current) => ({ ...current, [role]: event.target.value }))}><option value="">{role === 'president' ? t('Choose President') : t('Unassigned')}</option>{activeProfiles.map((member) => <option key={member.id} value={member.id} disabled={Object.entries(assignments).some(([assignedRole, memberId]) => assignedRole !== role && memberId === member.id)}>{member.full_name} · {member.member_code}</option>)}</select></label>)}<label>{t('Election / handover reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('For example, elected board for the 2027–2028 academic year')} /></label><label className="account-preference-row"><span><strong>{t('Immediate role change')}</strong><small>{t('I understand that submitting makes this term and its officer assignments active immediately.')}</small></span><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy || !confirmed || !canStartAfterCurrentTerm}>{busy ? t('Starting term…') : t('Start new term')}</button></div></form></Modal>
}

export function MemberProfileDialog({ member, onClose, onSaved }: { member: Profile; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState(member.full_name)
  const [email, setEmail] = useState(member.email ?? '')
  const [phoneNumber, setPhoneNumber] = useState(member.phone_number ?? '')
  const [program, setProgram] = useState(member.study_program ?? '')
  const [cohort, setCohort] = useState(member.cohort ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<ProfileHistory[]>([])
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    void Promise.all([
      client.from('member_profile_history').select('id,previous_full_name,new_full_name,previous_email,new_email,previous_study_program,new_study_program,previous_cohort,new_cohort,previous_phone_number,new_phone_number,reason,changed_by,created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(10),
      client.from('member_status_history').select('id,old_status,new_status,reason,changed_by,created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(10),
    ]).then(async ([profileResult, statusResult]) => {
      if (profileResult.error || statusResult.error) return
      const profileRows = (profileResult.data ?? []).map((row) => ({ id: row.id, summary: t('Profile details updated'), reason: row.reason, changed_by: row.changed_by, created_at: row.created_at }))
      const statusRows = (statusResult.data ?? []).map((row) => ({ id: row.id, summary: `${t('Status changed')}: ${t(row.old_status)} → ${t(row.new_status)}`, reason: row.reason, changed_by: row.changed_by, created_at: row.created_at }))
      const combined = [...profileRows, ...statusRows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10)
      const actorIds = [...new Set(combined.map((item) => item.changed_by))]
      const { data: actors } = actorIds.length ? await client.from('member_profiles').select('id,full_name').in('id', actorIds) : { data: [] }
      const names = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]))
      setHistory(combined.map((item) => ({ ...item, actor_name: names.get(item.changed_by) ?? t('Club officer') })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- member-scoped load; re-running on language change would refetch pointlessly
  }, [member.id])
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (reason.trim().length < 4) { setError(t('Add a reason for the profile update.')); return }
    setBusy(true); setError('')
    const { error: updateError } = await supabase.rpc('update_member_profile', { p_member_id: member.id, p_full_name: name.trim(), p_email: email.trim() || null, p_study_program: program.trim() || null, p_cohort: cohort.trim() || null, p_reason: reason.trim(), p_phone_number: phoneNumber.trim() || null })
    if (updateError) { setError(t('Could not save this profile. Check your access and the entered details.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={t('Edit member details')} subtitle={`${member.member_code} · ${t('profile changes are saved to the restricted HR history.')}`} onClose={onClose}><form className="live-form" onSubmit={submit}><label>{t('Full name')}<input required minLength={2} maxLength={120} value={name} onChange={(change) => setName(change.target.value)} /></label><label>{t('Email')}<input type="email" maxLength={254} value={email} onChange={(change) => setEmail(change.target.value)} /></label><label>{t('Phone number')}<input type="tel" maxLength={32} pattern="[+0-9() .-]*" value={phoneNumber} onChange={(change) => setPhoneNumber(change.target.value)} placeholder="+212 6 12 34 56 78" /></label><div className="live-form-grid"><label>{t('Study program')}<input maxLength={150} value={program} onChange={(change) => setProgram(change.target.value)} /></label><label>{t('Cohort / academic year')}<input maxLength={80} value={cohort} onChange={(change) => setCohort(change.target.value)} /></label></div><label>{t('Reason for update')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(change) => setReason(change.target.value)} placeholder={t('For example, member confirmed a study-program change')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}{history.length > 0 && <div className="profile-history"><strong>{t('Recent membership changes')}</strong>{history.map((item) => <div key={item.id}><span>{item.summary}</span><small>{item.reason} · {t('By {name}', { name: item.actor_name })} · {clubDateTime(item.created_at)}</small></div>)}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving…') : t('Save profile')}</button></div></form></Modal>
}

export function MemberPasswordResetDialog({ member, onClose, onSaved }: { member: Profile; onClose: () => void; onSaved: (email: string, temporaryPassword: string) => void | Promise<void> }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || busy) return
    if (reason.trim().length < 4) { setError(t('Add a short reason for this password reset.')); return }
    setBusy(true); setError('')
    const { data, error: resetError } = await supabase.functions.invoke('reset-member-password', { body: { member_id: member.id, reason: reason.trim() } })
    if (resetError || !data?.temporary_password) {
      let detail = data?.error
      if (!detail && resetError?.context instanceof Response) {
        const responseBody = await resetError.context.clone().json().catch(() => null) as { error?: string } | null
        if (responseBody?.error) detail = t(responseBody.error)
      }
      setError(detail ?? resetError?.message ?? t('The password could not be reset. Try again in a moment.'))
      setBusy(false); return
    }
    setBusy(false); await onSaved(member.email ?? '', data.temporary_password)
  }
  return <Modal title={t('Reset member password')} subtitle={`${member.full_name} · ${t('a new one-time temporary password replaces the old one; the member must set a personal password at next sign-in.')}`} onClose={onClose}><form className="live-form" onSubmit={submit}><div className="role-transfer-note">{t('Use this when a member forgot their password. Give the new temporary password to the member in person; it is shown once and is not stored.')}</div><label>{t('Reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(change) => setReason(change.target.value)} placeholder={t('For example: member forgot their password; verified in person')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Resetting…') : t('Reset password')}</button></div></form></Modal>
}
