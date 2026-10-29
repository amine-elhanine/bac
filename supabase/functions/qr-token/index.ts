import { authenticatedUser, corsPreflight, hasRole, respond, serviceClient, sha256Hex } from '../_shared/http.ts'

const attendanceManagers = ['president', 'vice_president', 'hr', 'vice_hr']

Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const user = await authenticatedUser(request)
    if (!user) return respond({ error: 'Sign in required' }, 401)
    const admin = serviceClient()
    if (!(await hasRole(admin, user.id, attendanceManagers))) return respond({ error: 'Not authorized to issue attendance codes' }, 403)
    const body = await request.json().catch(() => null) as { session_id?: string } | null
    if (!body?.session_id) return respond({ error: 'session_id is required' }, 400)

    const now = new Date()
    const { data: session, error: sessionError } = await admin.from('attendance_sessions')
      .select('id,event_id,state,opens_at,closes_at').eq('id', body.session_id).maybeSingle()
    if (sessionError) throw sessionError
    if (!session || session.state !== 'open' || new Date(session.opens_at) > now || new Date(session.closes_at) <= now) {
      return respond({ error: 'Attendance session is not open' }, 409)
    }
    const { data: event, error: eventError } = await admin.from('events')
      .select('id,status,ends_at').eq('id', session.event_id).maybeSingle()
    if (eventError) throw eventError
    if (!event || !['published','in_progress'].includes(event.status) || (event.ends_at && new Date(event.ends_at) <= now)) {
      return respond({ error: 'The event is no longer accepting attendance' }, 409)
    }

    const refreshFloor = new Date(now.getTime() - 5_000).toISOString()
    const { data: recent, error: recentError } = await admin.from('attendance_qr_tokens')
      .select('id').eq('session_id', session.id).eq('issued_by', user.id)
      .gt('created_at', refreshFloor).limit(1)
    if (recentError) throw recentError
    if (recent?.length) return respond({ error: 'Please wait a few seconds before refreshing the code.' }, 429)

    const raw = new Uint8Array(32)
    crypto.getRandomValues(raw)
    const token = Array.from(raw, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const expiresAt = new Date(now.getTime() + 45_000)
    const { error: deleteError } = await admin.from('attendance_qr_tokens').delete().lt('expires_at', now.toISOString())
    if (deleteError) throw deleteError
    const { error: insertError } = await admin.from('attendance_qr_tokens').insert({
      session_id: session.id,
      token_hash: await sha256Hex(token),
      expires_at: expiresAt.toISOString(),
      issued_by: user.id,
    })
    if (insertError) throw insertError
    return respond({ token, expires_at: expiresAt.toISOString(), session_id: session.id })
  } catch (error) {
    console.error('qr-token failed', error)
    return respond({ error: 'Unable to create the attendance code. Please try again.' }, 500)
  }
})
