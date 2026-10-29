import { supabase } from './supabase'

export type AttendanceSession = {
  id: string
  event_id: string
  opens_at: string
  closes_at: string
  state: 'closed' | 'open' | 'finalized'
}

export type AttendanceQrToken = {
  token: string
  expires_at: string
  session_id: string
}

export type CheckInResult = {
  status: 'checked_in' | 'already_checked_in'
  event_id: string
  attendance: { id: string; status: string; checked_in_at: string | null }
}

function requireBackend() {
  if (!supabase) throw new Error('The BAC backend is not configured in this deployment.')
  return supabase
}

export async function openAttendance(eventId: string, closesAt?: string) {
  const client = requireBackend()
  const { data, error } = await client.functions.invoke('open-attendance', {
    body: { event_id: eventId, ...(closesAt ? { closes_at: closesAt } : {}) },
  })
  if (error) throw new Error(error.message || 'Could not open attendance.')
  return data as { session: AttendanceSession; server_time: string; event_starts_at: string }
}

export async function getAttendanceQrToken(sessionId: string) {
  const client = requireBackend()
  const { data, error } = await client.functions.invoke('qr-token', { body: { session_id: sessionId } })
  if (error) throw new Error(error.message || 'Could not refresh the attendance code.')
  return data as AttendanceQrToken
}

export async function submitQrCheckIn(token: string) {
  const client = requireBackend()
  const { data, error } = await client.functions.invoke('check-in', { body: { token } })
  if (error) throw new Error(error.message || 'Check-in could not be recorded.')
  return data as CheckInResult
}
