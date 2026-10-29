import { authenticatedUser, corsPreflight, hasRole, respond, serviceClient } from '../_shared/http.ts'

const attendanceManagers = ['president', 'vice_president', 'hr', 'vice_hr']

Deno.serve(async (request) => {
  const preflight = corsPreflight(request)
  if (preflight) return preflight
  try {
    const user = await authenticatedUser(request)
    if (!user) return respond({ error: 'Sign in required' }, 401)
    const admin = serviceClient()
    if (!(await hasRole(admin, user.id, attendanceManagers))) return respond({ error: 'Not authorized to manage attendance' }, 403)

    const body = await request.json().catch(() => null) as { event_id?: string; closes_at?: string } | null
    if (!body?.event_id) return respond({ error: 'event_id is required' }, 400)
    const { data: event, error: eventError } = await admin.from('events').select('id,status,starts_at,ends_at').eq('id', body.event_id).maybeSingle()
    if (eventError) throw eventError
    if (!event || !['published', 'in_progress'].includes(event.status)) return respond({ error: 'Event is not available for attendance' }, 404)

    const now = new Date()
    const starts = new Date(event.starts_at)
    const ends = event.ends_at ? new Date(event.ends_at) : null
    if (ends && ends <= now) return respond({ error: 'Attendance cannot be opened after the event has ended.' }, 409)
    if (starts.getTime() - now.getTime() > 30 * 60 * 1000) {
      return respond({ error: 'Attendance can be opened no more than 30 minutes before the event.' }, 409)
    }
    const defaultClose = event.ends_at ? new Date(event.ends_at) : new Date(now.getTime() + 4 * 60 * 60 * 1000)
    const closes = body.closes_at ? new Date(body.closes_at) : defaultClose
    if (!Number.isFinite(closes.getTime()) || closes <= now) return respond({ error: 'Attendance closing time must be in the future' }, 400)
    const opensAt = new Date(Math.max(now.getTime(), starts.getTime() - 15 * 60 * 1000))
    if (closes <= opensAt) return respond({ error: 'Attendance must remain open after its opening time.' }, 400)
    if (ends && closes > ends) return respond({ error: 'Attendance cannot remain open after the event ends.' }, 400)
    if (!ends && closes.getTime() > now.getTime() + 4 * 60 * 60 * 1000) {
      return respond({ error: 'Attendance cannot remain open more than four hours when the event has no scheduled end.' }, 400)
    }

    const { data: session, error } = await admin.from('attendance_sessions').upsert({
      event_id: event.id,
      opens_at: opensAt.toISOString(),
      closes_at: closes.toISOString(),
      state: 'open',
      created_by: user.id,
    }, { onConflict: 'event_id' }).select('id,event_id,opens_at,closes_at,state').single()
    if (error) throw error
    // Event status is moved to in_progress through this authorized server path.
    const { error: eventUpdateError } = await admin.from('events').update({ status: 'in_progress', updated_by: user.id }).eq('id', event.id)
    if (eventUpdateError) throw eventUpdateError
    return respond({ session, server_time: now.toISOString(), event_starts_at: starts.toISOString() }, 201)
  } catch (error) {
    console.error('open-attendance failed', error)
    return respond({ error: 'Unable to open attendance. Please try again or contact the platform administrator.' }, 500)
  }
})
