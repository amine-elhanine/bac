import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import LiveWorkspace from './live/LiveWorkspace'
import BrandWordmark from './BrandWordmark'
import { LANGUAGES, I18nProvider, useI18n, type Language } from './i18n'
import { backendReady, supabase } from './lib/supabase'

export type Identity = { id: string; name: string; email: string; role: string; roleName: string; isCustomRole: boolean; permissions: string[]; status: string; mustChangePassword: boolean }

// The demo workspace ships only when a member without a configured backend
// opens the app; the chunk is not part of the signed-in bundle.
const DemoApp = lazy(() => import('./App'))

function AuthGateInner() {
  const { t } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!backendReady)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [identityError, setIdentityError] = useState('')
  const [loadingIdentity, setLoadingIdentity] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setReady(true)
    }).catch(() => { if (alive) setReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (!nextSession) { setIdentity(null); setIdentityError(''); setRecoveryMode(false) }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  // The identity lookup runs once per signed-in user. Session objects are
  // replaced by routine token refreshes; re-running on those would flash the
  // whole workspace back to the loading screen and reset the current view.
  const sessionUserId = session?.user?.id ?? null
  useEffect(() => {
    if (!supabase || !sessionUserId) return
    const client = supabase
    let alive = true
    setLoadingIdentity(true)
    setIdentityError('')
    void (async () => {
      const { data: profile, error: profileError } = await client
        .from('member_profiles').select('id,full_name,email,status,must_change_password').eq('id', sessionUserId).maybeSingle()
      if (profileError) throw profileError
      if (!profile) throw new Error(t('Your account is signed in, but its BAC member profile has not been set up. Contact HR.'))
      const { data: assignments, error: rolesError } = await client
        .from('role_assignments').select('role,club_roles!role_assignments_role_fkey(display_name,permissions,is_custom),club_terms!inner(is_current)')
        .eq('member_id', sessionUserId).eq('club_terms.is_current', true)
        .lte('starts_at', new Date().toISOString())
        .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      if (rolesError) throw rolesError
      const assignment = (assignments ?? []).find((row) => row.role !== 'member')
      const roleMeta = assignment?.club_roles as unknown as { display_name?: string; permissions?: string[]; is_custom?: boolean } | null
      const isCustomRole = Boolean(roleMeta?.is_custom)
      const permissions = [...new Set([...(assignment && !isCustomRole ? [assignment.role as string] : []), ...(roleMeta?.permissions ?? [])])]
      const role = assignment && !isCustomRole ? assignment.role as string : 'member'
      const roleName = isCustomRole && roleMeta?.display_name ? roleMeta.display_name : role
      if (alive) setIdentity({ id: profile.id, name: profile.full_name, email: profile.email ?? session?.user?.email ?? '', role, roleName, isCustomRole, permissions, status: profile.status, mustChangePassword: profile.must_change_password })
    })().catch((error: unknown) => {
      if (alive) setIdentityError(error instanceof Error ? error.message : t('Could not load your BAC account.'))
    }).finally(() => { if (alive) setLoadingIdentity(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity is loaded once per signed-in user
  }, [sessionUserId])

  if (!backendReady || !supabase) return <Suspense fallback={null}><DemoApp /></Suspense>
  const client = supabase
  const signOut = () => void client.auth.signOut()
  if (!ready) return <div className="auth-screen"><div className="auth-card auth-loading"><img src="/bac-logo.png" alt={t('Biologists in Action Club')} className="brand-mark brand-logo-image" /><p>{t('Opening your BAC workspace…')}</p></div></div>
  if (recoveryMode && session) return <PasswordRecovery onComplete={() => { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); setRecoveryMode(false) }} />
  if (!session) return <SignIn />
  if (loadingIdentity) return <div className="auth-screen"><div className="auth-card auth-loading"><img src="/bac-logo.png" alt={t('Biologists in Action Club')} className="brand-mark brand-logo-image" /><p>{t('Checking your club access…')}</p></div></div>
  if (identityError || !identity) return <AccountIssue message={identityError || t('Your BAC account could not be loaded.')} onSignOut={signOut} />
  if (identity.status !== 'active') return <AccountIssue message={t('This account is not currently active. Contact HR if you think this is an error.')} onSignOut={signOut} />
  if (identity.mustChangePassword) return <FirstLoginPasswordChange onComplete={() => setIdentity((current) => current ? { ...current, mustChangePassword: false } : current)} onSignOut={signOut} />
  return <LiveWorkspace identity={identity} onSignOut={signOut} />
}

function LanguagePicker() {
  const { t, language, setLanguage } = useI18n()
  return <label className="auth-language-picker"><span>{t('Language')}</span><select aria-label={t('Language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

function SignIn() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) setError(t('We couldn’t sign in with those details. Check your email and password, or contact HR for account help.'))
    } catch {
      setError(t('Sign-in is temporarily unavailable. Check your connection and try again.'))
    } finally { setBusy(false) }
  }

  return <div className="auth-screen"><section className="auth-card">
    <div className="auth-brand"><img src="/bac-logo.png" alt={t('Biologists in Action Club')} className="brand-mark brand-logo-image" /><div><BrandWordmark /><small>{t('CLUB PLATFORM')}</small></div></div>
    <LanguagePicker />
    <div className="eyebrow">{t('WELCOME BACK TO YOUR CLUB')}</div><h1>{t('Sign in to BAC')}</h1><p className="auth-subtitle">{t('Your people, plans, and shared work in one place.')}</p>
    <form onSubmit={submit} className="auth-form"><label>{t('Email address')}<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>{t('Password')}<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Enter your password')} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? t('Hide password') : t('Show password')}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? t('Signing in…') : t('Sign in')} {!busy && <ArrowRight size={16} />}</button></form>
    <div className="auth-recovery"><LockKeyhole size={14} /><span>{t('Need access, or forgot your password? Contact HR or a club officer; they can reset your password in person.')}</span></div>
    <div className="auth-security"><ShieldCheck size={14} /> {t('Member access is managed by the BAC team')}</div>
  </section><div className="auth-side-note">{t('BIOLOGISTS IN ACTION')} <i>✳</i> FST SETTAT</div></div>
}

function FirstLoginPasswordChange({ onComplete, onSignOut }: { onComplete: () => void; onSignOut: () => void }) {
  const { t } = useI18n()
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || busy) return
    if (password.length < 12 || password.length > 128) { setError(t('Choose a password between 12 and 128 characters.')); return }
    if (password !== confirmation) { setError(t('The password entries do not match.')); return }
    setBusy(true); setError('')
    const { data, error: changeError } = await supabase.functions.invoke('complete-initial-password', { body: { password } })
    if (changeError || !data?.completed) { setError(data?.error ?? t('The new password could not be saved. Check your connection and try again.')); setBusy(false); return }
    setPassword(''); setConfirmation(''); setBusy(false); onComplete()
  }
  return <div className="auth-screen"><section className="auth-card"><div className="auth-brand"><img src="/bac-logo.png" alt={t('Biologists in Action Club')} className="brand-mark brand-logo-image" /><div><BrandWordmark /><small>{t('CLUB PLATFORM')}</small></div></div><LanguagePicker /><div className="eyebrow">{t('FIRST SIGN IN')}</div><h1>{t('Set your personal password')}</h1><p className="auth-subtitle">{t('Create a private password before opening your club account. Use at least 12 characters and do not share it with club officers.')}</p><form onSubmit={(formEvent) => void submit(formEvent)} className="auth-form"><label>{t('New password')}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>{t('Confirm new password')}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? t('Saving password…') : t('Save password')} {!busy && <ArrowRight size={16} />}</button></form><button type="button" className="auth-text-button auth-signout-button" onClick={onSignOut}>{t('Sign out')}</button><div className="auth-security"><ShieldCheck size={14} /> {t('Your password is private and cannot be viewed by BAC officers')}</div></section></div>
}

function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const { t } = useI18n()
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [complete, setComplete] = useState(false)
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!supabase) return
    if (password.length < 12) { setError(t('Choose a password with at least 12 characters.')); return }
    if (password !== confirmation) { setError(t('The password entries do not match.')); return }
    setBusy(true); setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) { setError(t('This reset link may have expired. Request a new link or contact HR.')); setBusy(false); return }
      setComplete(true)
      setBusy(false)
    } catch {
      setError(t('Password recovery is temporarily unavailable. Request a new link or contact HR.'))
      setBusy(false)
    }
  }
  return <div className="auth-screen"><section className="auth-card"><div className="auth-brand"><img src="/bac-logo.png" alt={t('Biologists in Action Club')} className="brand-mark brand-logo-image" /><div><BrandWordmark /><small>{t('CLUB PLATFORM')}</small></div></div><div className="eyebrow">{t('ACCOUNT RECOVERY')}</div><h1>{t('Choose a new password')}</h1><p className="auth-subtitle">{t('Use at least 12 characters to secure your BAC account.')}</p>{complete ? <><div className="auth-recovery-success" role="status">{t('Your password has been updated.')}</div><button type="button" className="button button-primary auth-submit" onClick={onComplete}>{t('Continue to BAC')} <ArrowRight size={16} /></button></> : <form onSubmit={(formEvent) => void submit(formEvent)} className="auth-form"><label>{t('New password')}<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>{t('Confirm new password')}<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? t('Updating…') : t('Update password')} {!busy && <ArrowRight size={16} />}</button></form>}<div className="auth-security"><ShieldCheck size={14} /> {t('Your recovery link works only for a limited time')}</div></section></div>
}

function AccountIssue({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  const { t } = useI18n()
  return <div className="auth-screen"><section className="auth-card auth-issue"><div className="dialog-mark"><ShieldCheck size={21} /></div><div className="eyebrow">{t('ACCOUNT ACCESS')}</div><h1>{t('We couldn’t open your workspace')}</h1><p className="auth-subtitle">{message}</p><button className="button button-primary auth-submit" onClick={onSignOut}>{t('Sign out')}</button><div className="auth-recovery"><span>{t('Contact the President or HR to check your membership and current club role.')}</span></div></section></div>
}

export default function AuthGate() {
  return <I18nProvider><AuthGateInner /></I18nProvider>
}
