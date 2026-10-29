import { authenticatedUser, corsPreflight, respond, serviceClient, sha256Hex } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const user = await authenticatedUser(request)
    if (!user) return respond({ error: 'Sign in required' }, 401)
    const body = await request.json().catch(() => null) as { token?: string } | null
    if (!body?.token || !/^[a-f0-9]{64}$/.test(body.token)) return respond({ error: 'Invalid QR code' }, 400)

    const admin = serviceClient()
    const { data: result, error: checkInError } = await admin.rpc('record_attendance_check_in', {
      p_token_hash: await sha256Hex(body.token),
      p_member_id: user.id,
    })
    if (checkInError) throw checkInError
    if (result?.error === 'invalid_token') return respond({ error: 'QR code expired or invalid. Ask HR to show the current code.' }, 410)
    if (result?.error === 'inactive_member') return respond({ error: 'An active member account with completed first-login setup is required' }, 403)
    if (result?.error === 'event_closed') return respond({ error: 'The event is no longer accepting attendance' }, 409)
    if (result?.error === 'closed_session') return respond({ error: 'Attendance session is closed' }, 409)
    if (result?.status === 'checked_in') return respond(result, 201)
    if (result?.status === 'already_checked_in') return respond(result)
    throw new Error('Unexpected check-in result')
  } catch (error) {
    console.error('check-in failed', error)
    return respond({ error: 'Check-in could not be recorded. Please try again or ask HR for help.' }, 500)
  }
})
