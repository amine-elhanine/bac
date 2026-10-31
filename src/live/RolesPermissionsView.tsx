import { useState, type FormEvent } from 'react'
import { Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { EmptyState, Modal } from './ui'
import type { ClubPermissionDefinition, ClubRoleDefinition } from './types'

export function RolesPermissionsLive({ roles, permissions, canManage, canView, onChanged }: { roles: ClubRoleDefinition[]; permissions: ClubPermissionDefinition[]; canManage: boolean; canView: boolean; onChanged: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<ClubRoleDefinition | 'new' | null>(null)
  return <section className="live-panel roles-permissions-panel"><div className="live-panel-head"><div><h2>{t('Roles & Permissions')}</h2><p>{t('Edit existing roles or create custom ones by selecting the exact actions they can perform. The President role stays fixed so access management is never lost.')}</p></div>{canManage && <button className="button button-primary" onClick={() => setEditing('new')}><Plus size={14} /> {t('Create role')}</button>}</div>{canView && roles.length ? <div className="roles-card-list">{roles.filter((role) => !role.is_custom || canView || canManage).map((role) => { const granted = permissions.filter((permission) => role.permissions.includes(permission.permission_key)); return <article className="role-summary-card" key={role.role_key}><div className="role-summary-icon"><ShieldCheck size={17} /></div><div className="role-summary-content"><div className="role-summary-title"><strong>{role.display_name}</strong>{role.is_custom && <span className="member-code-tag">{t('Custom')}</span>}</div><p>{granted.length ? granted.map((permission) => permission.display_name).join(' · ') : t('No permissions')}</p><small>{t('{count} permissions', { count: granted.length })}</small></div>{canManage && role.role_key !== 'president' && <button className="button button-outline" onClick={() => setEditing(role)}><Pencil size={14} /> {t('Edit role')}</button>}</article> })}</div> : <EmptyState title={t('Role list unavailable')} detail={t('You need permission to view role definitions.')} />}{editing && <RolePermissionDialog role={editing === 'new' ? null : editing} permissions={permissions.filter((permission) => permission.permission_key !== 'roles.manage')} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged() }} />}</section>
}

function RolePermissionDialog({ role, permissions, onClose, onSaved }: { role: ClubRoleDefinition | null; permissions: ClubPermissionDefinition[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState(role?.display_name ?? '')
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? [])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const groups = [...new Set(permissions.map((permission) => permission.module_name))]
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    if (reason.trim().length < 4) { setError(t('Enter a reason for this role change.')); return }
    setBusy(true); setError('')
    const result = role
      ? await supabase.rpc('update_club_role', { p_role_key: role.role_key, p_display_name: name.trim(), p_permissions: selected, p_reason: reason.trim() })
      : await supabase.rpc('create_club_role', { p_name: name.trim(), p_permissions: selected, p_reason: reason.trim() })
    if (result.error) { setError(result.error.code === '23505' ? t('A role already uses that name. Choose another name.') : t('Could not save this role. Check its name and permissions.')); setBusy(false); return }
    setBusy(false); await onSaved()
  }
  return <Modal title={role ? t('Edit role') : t('Create a club role')} subtitle={t('Rename the role and select its individual view and action permissions. A role with no permissions will have standard member access only.')} onClose={onClose}><form className="live-form role-permission-form" onSubmit={(event) => void submit(event)}><label>{t('Role name')}<input required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('For example: HR Viewer')} /></label><div className="role-permission-groups">{groups.map((group) => <section className="role-permission-group" key={group}><h3>{t(group)}</h3><div className="role-permission-options">{permissions.filter((permission) => permission.module_name === group).map((permission) => <label className="role-permission-option" key={permission.permission_key}><input type="checkbox" checked={selected.includes(permission.permission_key)} onChange={(change) => setSelected((current) => change.target.checked ? [...current, permission.permission_key] : current.filter((key) => key !== permission.permission_key))} /><span><strong>{t(permission.display_name)}</strong><small>{t(permission.description)}</small></span></label>)}</div></section>)}</div><label>{t('Reason')}<textarea required minLength={4} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('Explain why these role permissions are being changed')} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Saving role…') : role ? t('Save role') : t('Create role')}</button></div></form></Modal>
}
