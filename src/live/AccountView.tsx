import { useEffect, useState, type FormEvent } from 'react'
import { Download, Moon, ShieldCheck } from 'lucide-react'
import type { Identity } from '../AuthGate'
import { LANGUAGES, useI18n, type Language } from '../i18n'
import { applyTheme, type Theme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { initials } from './datetime'
import { ROLE_LABELS } from '../lib/roles'
import { Modal } from './ui'

export function AccountLive({ identity, onChangePassword, onInstall }: { identity: Identity; onChangePassword: () => void; onInstall: () => void }) {
  const { t, language, setLanguage } = useI18n()
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  function changeTheme(next: Theme) { setTheme(next); applyTheme(next) }
  const [preferences, setPreferences] = useState({ event_updates: true, news_updates: true, point_updates: true })
  const [loadingPreferences, setLoadingPreferences] = useState(true)
  const [savingPreference, setSavingPreference] = useState('')
  const [preferenceError, setPreferenceError] = useState('')
  useEffect(() => {
    let active = true
    if (!supabase) { setLoadingPreferences(false); return () => { active = false } }
    const client = supabase
    void (async () => {
      const { data, error } = await client.from('notification_preferences').select('event_updates,news_updates,point_updates').eq('member_id', identity.id).maybeSingle()
      if (!active) return
      if (error) setPreferenceError(t('Notification settings are unavailable. Apply the latest database migration and try again.'))
      else if (data) setPreferences({ event_updates: data.event_updates, news_updates: data.news_updates, point_updates: data.point_updates })
      setLoadingPreferences(false)
    })().catch(() => { if (active) { setPreferenceError(t('Could not load notification preferences.')); setLoadingPreferences(false) } })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- member-scoped load
  }, [identity.id])
  async function togglePreference(key: 'event_updates' | 'news_updates' | 'point_updates', enabled: boolean) {
    if (!supabase || savingPreference) return
    const previous = preferences; const next = { ...preferences, [key]: enabled }
    setPreferences(next); setSavingPreference(key); setPreferenceError('')
    try {
      const { error } = await supabase.from('notification_preferences').upsert({ member_id: identity.id, ...next, updated_at: new Date().toISOString() }, { onConflict: 'member_id' })
      if (error) { setPreferences(previous); setPreferenceError(t('Could not save this notification setting. Please try again.')) }
    } catch {
      setPreferences(previous); setPreferenceError(t('Could not save this notification setting. Please try again.'))
    } finally { setSavingPreference('') }
  }
  return <div className="account-layout"><section className="live-panel account-card"><div className="account-avatar">{initials(identity.name)}</div><div><span className="eyebrow">{t('BAC MEMBER ACCOUNT')}</span><h2>{identity.name}</h2><p>{t(ROLE_LABELS[identity.roleName] ?? identity.roleName)} · {t(identity.status)}</p></div></section><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Language')}</h2><p>{t('Choose the language of the BAC interface.')}</p></div></div><div className="account-security-row"><div><strong>{t('Interface language')}</strong><p>{LANGUAGES.find((option) => option.value === language)?.label}</p></div><select aria-label={t('Interface language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="task-status-select" style={{ maxWidth: 160, height: 34, fontSize: 11 }}>{LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="account-security-note"><ShieldCheck size={16} /><span>{t('Arabic switches the layout to right-to-left. French and Arabic translations are being added view by view; untranslated text stays in English.')}</span></div></section><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Appearance')}</h2><p>{t('Choose light or dark interface colors.')}</p></div></div><div className="account-security-row"><div><strong>{t('Theme')}</strong><p>{theme === 'dark' ? t('Dark') : t('Light')}</p></div><button className="button button-outline" onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}><Moon size={15} /> {theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}</button></div><div className="account-security-note"><ShieldCheck size={16} /><span>{t('Your choice is saved on this device. Dark mode keeps the BAC green and gold identity on a dark background.')}</span></div></section><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Install BAC on your device')}</h2><p>{t('Add the free web app to your phone or Windows home screen.')}</p></div><button className="button button-outline" onClick={onInstall}><Download size={15} /> {t('Install guide')}</button></div><div className="account-security-note"><ShieldCheck size={16} /><span>{t('On iPhone, open BAC in Safari and use Share → Add to Home Screen. Android and Windows browsers offer installation from their menu. No App Store account or paid distribution is needed.')}</span></div></section><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Sign-in and security')}</h2><p>{t('Keep your account access private and up to date.')}</p></div></div><div className="account-security-row"><div><strong>{t('Password')}</strong><p>{t('Change the password used to sign in to BAC.')}</p></div><button className="button button-outline" onClick={onChangePassword}>{t('Change password')}</button></div><div className="account-security-note"><ShieldCheck size={16} /><span>{t('Your email address and club role are maintained by the BAC leadership team. Contact HR if either needs correction.')}</span></div></section><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Notification preferences')}</h2><p>{t('Choose which optional updates appear in your BAC inbox. Task and HR case alerts always stay on.')}</p></div></div>{loadingPreferences ? <div className="live-loading">{t('Loading your preferences…')}</div> : <div className="account-preference-list">{([['event_updates', 'Event announcements'], ['news_updates', 'Club news'], ['point_updates', 'Points updates']] as const).map(([key, label]) => <label className="account-preference-row" key={key}><span><strong>{t(label)}</strong><small>{preferences[key] ? t('On') : t('Muted')}</small></span><input type="checkbox" checked={preferences[key]} disabled={Boolean(savingPreference)} onChange={(event) => void togglePreference(key, event.target.checked)} aria-label={`${t(label)} ${t('notifications')}`} /></label>)}</div>}{preferenceError && <p className="account-preference-error" role="alert">{preferenceError}</p>}</section></div>
}

export function ChangePasswordDialog({ email, onClose, onSaved }: { email: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    setError('')
    if (newPassword.length < 12) { setError(t('Choose a new password with at least 12 characters.')); return }
    if (newPassword !== confirmation) { setError(t('The new password entries do not match.')); return }
    setBusy(true)
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
      if (verifyError) { setError(t('The current password could not be verified.')); setBusy(false); return }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) { setError(updateError.message); setBusy(false); return }
      onSaved()
    } catch {
      setError(t('Password change is temporarily unavailable. Please try again.'))
      setBusy(false)
    }
  }
  return <Modal title={t('Change your password')} subtitle={t('Confirm your current password, then choose a new one.')} onClose={onClose}><form className="live-form" onSubmit={(formEvent) => void submit(formEvent)}><label>{t('Current password')}<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>{t('New password')}<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small>{t('Use at least 12 characters.')}</small></label><label>{t('Confirm new password')}<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? t('Updating…') : t('Update password')}</button></div></form></Modal>
}
