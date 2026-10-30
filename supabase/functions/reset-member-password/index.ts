import { authenticatedUser, corsPreflight, hasPermission, respond, serviceClient } from '../_shared/http.ts'


// In-person password recovery: an authorized officer replaces a member's
// password with a one-time temporary value handed over personally. The member
// must set a personal password before the next workspace access.
Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const actor = await authenticatedUser(request)
    if (!actor) return respond({ error: 'Sign in required' }, 401)
    const admin = serviceClient()
    if (!(await hasPermission(admin, actor, 'members.account.manage'))) return respond({ error: 'Not authorized to reset member passwords' }, 403)

    const body = await request.json().catch(() => null) as { member_id?: string; reason?: string } | null
    const memberId = body?.member_id ?? ''
    const reason = body?.reason?.trim() ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
      return respond({ error: 'A member is required' }, 400)
    }
    if (reason.length < 4 || reason.length > 500) {
      return respond({ error: 'Add a short reason for this password reset.' }, 400)
    }

    const { data: profile, error: profileError } = await admin
      .from('member_profiles').select('id,status').eq('id', memberId).maybeSingle()
    if (profileError) throw profileError
    if (!profile) return respond({ error: 'Member not found.' }, 404)
    if (profile.status !== 'active') return respond({ error: 'Only active members can have a password reset.' }, 409)

    const raw = new Uint8Array(32)
    crypto.getRandomValues(raw)
    const temporaryPassword = Array.from(raw, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const { error: passwordError } = await admin.auth.admin.updateUserById(memberId, { password: temporaryPassword })
    if (passwordError) {
      console.warn('member password reset failed', passwordError.message)
      return respond({ error: 'The password could not be reset. Try again in a moment.' }, 500)
    }

    // Force the first-login password setup screen on the member's next sign-in.
    const { error: flagError } = await admin.from('member_profiles')
      .update({ must_change_password: true, updated_at: new Date().toISOString() })
      .eq('id', memberId)
    if (flagError) throw flagError

    const { error: auditError } = await admin.from('audit_log').insert({
      actor_id: actor.id,
      action: 'password_reset',
      table_name: 'member_profiles',
      record_id: memberId,
      changed_fields: ['password', 'must_change_password'],
      reason,
    })
    if (auditError) throw auditError

    return respond({ member_id: memberId, temporary_password: temporaryPassword }, 201)
  } catch (error) {
    console.error('reset-member-password failed', error)
    return respond({ error: 'Password reset could not be completed. Please try again or contact the platform administrator.' }, 500)
  }
})
