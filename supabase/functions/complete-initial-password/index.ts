import { authenticatedUser, corsPreflight, respond, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const actor = await authenticatedUser(request)
    if (!actor) return respond({ error: 'Sign in required' }, 401)
    const body = await request.json().catch(() => null) as { password?: string } | null
    const password = body?.password ?? ''
    if (password.length < 12 || password.length > 128) {
      return respond({ error: 'Choose a password between 12 and 128 characters.' }, 400)
    }

    const admin = serviceClient()
    const { data: profile, error: profileError } = await admin
      .from('member_profiles').select('id,must_change_password').eq('id', actor.id).maybeSingle()
    if (profileError) throw profileError
    if (!profile?.must_change_password) return respond({ error: 'No temporary password change is pending.' }, 409)

    const { error: passwordError } = await admin.auth.admin.updateUserById(actor.id, { password })
    if (passwordError) {
      console.warn('initial password update failed', passwordError.message)
      return respond({ error: 'The new password could not be saved. Check the password requirements and try again.' }, 400)
    }
    const { error: completionError } = await admin.rpc('complete_member_first_login', { p_member_id: actor.id })
    if (completionError) {
      console.error('first-login completion audit failed', completionError.message)
      return respond({ error: 'Your new password was set, but account setup could not be finalized. Submit the same new password again or contact HR.' }, 503)
    }
    return respond({ completed: true })
  } catch (error) {
    console.error('complete-initial-password failed', error)
    return respond({ error: 'Account setup could not be completed. Please try again or contact HR.' }, 500)
  }
})
