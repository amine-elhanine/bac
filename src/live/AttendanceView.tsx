import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'
import { attendanceManagers } from '../lib/roles'
import { downloadCsv } from '../lib/csv'
import type { AttendanceQrToken, AttendanceSession } from '../lib/attendance'
import { clubDateInput, clubDateKey, clubDateTime, isValidDateInput } from './datetime'
import { EmptyState, Modal } from './ui'
import { EventRow } from './CalendarView'
import type { AttendanceCorrection, LiveEvent, MemberAttendance, Profile } from './types'

export function AttendanceLive({ events, role, memberId, session, token, onOpen, onClose, onScan, onReview }: { events: LiveEvent[]; role: string; memberId: string; session: AttendanceSession | null; token: AttendanceQrToken | null; onOpen: (eventId: string) => void; onClose: () => void; onScan: () => void; onReview: (event: LiveEvent) => void }) {
  const { t } = useI18n()
  const canManage = attendanceManagers.includes(role)
  if (!canManage) return <div className="attendance-member-layout"><section className="live-panel attendance-member"><div className="attendance-member-icon"><ClipboardCheck size={24} /></div><h2>{t('Check in to a gathering')}</h2><p>{t('When HR displays the live BAC attendance code, scan it here to record your arrival.')}</p><button className="button button-primary" onClick={onScan}><ClipboardCheck size={16} /> {t('Scan attendance QR')}</button><small>{t('Your check-in is confirmed by the server. A screenshot or expired QR code will not work.')}</small></section><MemberAttendanceHistory memberId={memberId} /></div>
  const selectable = events.filter((event) => ['published', 'in_progress', 'completed'].includes(event.status))
  return <div className="attendance-management-layout"><section className="live-panel"><div className="live-panel-head"><div><h2>{t('Attendance desk')}</h2><p>{t('Open a session to create a rotating, expiring attendance code.')}</p></div></div>{session && token ? <div className="live-qr-session"><div className="qr-frame"><QRCodeSVG value={token.token} size={220} level="M" marginSize={0} /></div><div className="qr-session-details"><span className="connected-state"><i /> {t('SESSION OPEN')}</span><h3>{t('Show this code to members')}</h3><p>{t('The code expires at {time}. It refreshes automatically.', { time: clubDateTime(token.expires_at, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) })}</p><div className="security-reminder"><ShieldCheck size={16} /> {t('Only the hashed token is stored. A scan is limited to one attendance record per member for this session.')}</div><button className="button button-outline" onClick={onClose}>{t('Close session')}</button></div></div> : <div className="live-session-options">{selectable.length ? selectable.map((event) => <div className="live-session-choice" key={event.id}><EventRow event={event} /><div className="attendance-event-actions"><button className="button button-outline" onClick={() => onReview(event)}>{t('Review roster')}</button>{event.status !== 'completed' && <button className="button button-primary" onClick={() => onOpen(event.id)}>{t('Open attendance')} <ArrowRight size={14} /></button>}</div></div>) : <EmptyState title={t('No published events')} detail={t('Publish a meeting or event before opening an attendance session.')} />}</div>}</section><AttendanceReport events={events} /></div>
}

type AttendanceSummaryRow = { event_id: string; title: string; starts_at: string; roster: number; present: number; absent: number; excused: number; pending: number; not_recorded: number }

function AttendanceReport({ events }: { events: LiveEvent[] }) {
  const { t } = useI18n()
  const now = new Date()
  const initialEnd = clubDateInput(now)
  const initialStart = clubDateInput(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([])
  const [busy, setBusy] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    try {
      if (!isValidDateInput(startDate) || !isValidDateInput(endDate) || startDate > endDate) throw new Error(t('Choose a valid date range.'))
      const sessions = events.filter((event) => { const eventDate = clubDateInput(new Date(event.starts_at)); return Boolean(event.attendance_sessions?.length) && eventDate >= startDate && eventDate <= endDate })
      if (!sessions.length) { setRows([]); return }
      const sessionIds = sessions.flatMap((event) => (event.attendance_sessions ?? []).map((session) => session.id))
      const pageSize = 1000
      const [assignments, records] = await Promise.all([
        (async () => { const all: { member_id: string; starts_at: string; ends_at: string | null }[] = []; for (let offset = 0; ; offset += pageSize) { const { data, error } = await supabase.from('role_assignments').select('member_id,starts_at,ends_at').range(offset, offset + pageSize - 1); if (error) throw error; const page = data ?? []; all.push(...page); if (page.length < pageSize) break } return all })(),
        (async () => { const all: { session_id: string; member_id: string; status: string }[] = []; for (let offset = 0; ; offset += pageSize) { const { data, error } = await supabase.from('attendance_records').select('session_id,member_id,status').in('session_id', sessionIds).range(offset, offset + pageSize - 1); if (error) throw error; const page = data ?? []; all.push(...page); if (page.length < pageSize) break } return all })(),
      ])
      const nextRows = sessions.map((event) => {
        const eventTime = new Date(event.starts_at).getTime()
        const roster = new Set(assignments.filter((assignment) => new Date(assignment.starts_at).getTime() <= eventTime && (!assignment.ends_at || new Date(assignment.ends_at).getTime() > eventTime)).map((assignment) => assignment.member_id))
        const eventSessionIds = new Set((event.attendance_sessions ?? []).map((session) => session.id))
        const eventRecords = records.filter((record) => eventSessionIds.has(record.session_id) && roster.has(record.member_id))
        const byMember = new Map(eventRecords.map((record) => [record.member_id, record.status]))
        const present = [...byMember.values()].filter((status) => status === 'present').length
        const absent = [...byMember.values()].filter((status) => status === 'absent').length
        const excused = [...byMember.values()].filter((status) => status === 'excused').length
        const pending = [...byMember.values()].filter((status) => status === 'pending_confirmation').length
        return { event_id: event.id, title: event.title, starts_at: event.starts_at, roster: roster.size, present, absent, excused, pending, not_recorded: Math.max(0, roster.size - byMember.size) }
      }).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      setRows(nextRows)
    } catch (cause) {
      setRows([]); setError(cause instanceof Error ? cause.message : t('Could not load attendance reports.'))
    } finally { setBusy(false) }
  }, [events, startDate, endDate, t])

  useEffect(() => { void load() }, [load])

  async function exportReport() {
    if (!supabase || exporting || !rows.length) return
    setExporting(true); setError('')
    try {
      const { error: auditError } = await supabase.rpc('audit_report_export', { p_report_type: 'attendance', p_scope_id: `${startDate}:${endDate}` })
      if (auditError) throw auditError
      downloadCsv(`bac-attendance-report-${startDate}-to-${endDate}.csv`,
        [t('Event'), t('Date'), t('Roster size'), t('Present'), t('Absent recorded'), t('Excused'), t('Pending confirmation'), t('Not recorded'), t('Attendance rate')],
        rows.map((row) => [row.title, new Date(row.starts_at).toISOString(), row.roster, row.present, row.absent, row.excused, row.pending, row.not_recorded, row.roster ? `${Math.round(row.present / row.roster * 100)}%` : '0%']))
    } catch { setError(t('Could not record this report export. No download was started.')) }
    finally { setExporting(false) }
  }

  return <section className="live-panel attendance-report"><div className="live-panel-head"><div><h2>{t('Attendance reports')}</h2><p>{t('Event-date roster comparisons for sessions in the selected period. Missing records are not counted as absences.')}</p></div><button type="button" className="button button-outline" onClick={() => void exportReport()} disabled={exporting || !rows.length}>{exporting ? t('Preparing…') : t('Export CSV')}</button></div><div className="attendance-report-filters"><label>{t('From')}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>{t('To')}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button type="button" className="button button-outline" onClick={() => void load()} disabled={busy}>{busy ? t('Loading…') : t('Refresh report')}</button></div>{error && <div className="auth-error attendance-report-error" role="alert">{error}</div>}{busy ? <div className="live-loading">{t('Calculating attendance…')}</div> : rows.length ? <div className="table-scroll attendance-report-table"><table><thead><tr><th>{t('EVENT')}</th><th>{t('DATE')}</th><th>{t('ROSTER')}</th><th>{t('PRESENT')}</th><th>{t('ABSENT')}</th><th>{t('EXCUSED')}</th><th>{t('PENDING')}</th><th>{t('NOT RECORDED')}</th><th>{t('RATE')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.event_id}><td>{row.title}</td><td>{clubDateTime(row.starts_at, { dateStyle: 'medium' })}</td><td>{row.roster}</td><td>{row.present}</td><td>{row.absent}</td><td>{row.excused}</td><td>{row.pending}</td><td>{row.not_recorded}</td><td>{row.roster ? Math.round(row.present / row.roster * 100) : 0}%</td></tr>)}</tbody></table></div> : <EmptyState title={t('No attendance sessions in this period')} detail={t('Create and record attendance sessions to see an event-by-event report.')} />}</section>
}

function MemberAttendanceHistory({ memberId }: { memberId: string }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<MemberAttendance[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    void (async () => {
      const { data, error: queryError } = await client.from('attendance_records').select('id,status,source,checked_in_at,correction_reason,attendance_sessions!inner(event_id,events!inner(title,starts_at))').eq('member_id', memberId).order('checked_in_at', { ascending: false, nullsFirst: false }).limit(50)
      if (queryError) setError(t('Could not load your attendance history.'))
      else setRows((data ?? []) as unknown as MemberAttendance[])
    })().catch(() => setError(t('Could not load your attendance history.')))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- member-scoped load
  }, [memberId])
  return <section className="live-panel member-attendance-history"><div className="live-panel-head"><div><h2>{t('My attendance history')}</h2><p>{t('Only sessions with a recorded status appear here. Missing records are not marked as absences.')}</p></div></div>{busy ? <div className="live-loading">{t('Loading your records…')}</div> : error ? <div className="auth-error">{error}</div> : rows.length ? <div className="live-attendance-list">{rows.map((row) => <article key={row.id}><div><strong>{row.attendance_sessions.events.title}</strong><small>{clubDateTime(row.attendance_sessions.events.starts_at)} · {row.source === 'qr' ? t('QR check-in') : t('HR manual entry')}</small>{row.correction_reason && <small>{row.correction_reason}</small>}</div><span className={`status-pill ${row.status === 'present' ? 'status-active' : 'status-pending'}`}><i />{t(row.status.replace('_', ' '))}</span></article>)}</div> : <EmptyState title={t('No attendance recorded')} detail={t('Your attendance history will appear after a check-in or HR record.')} />}</section>
}

export function AttendanceReviewDialog({ event, userId, onClose }: { event: LiveEvent; userId: string; onClose: () => void }) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [records, setRecords] = useState<Record<string, { status: string; source: string; checked_in_at: string | null; correction_reason: string | null }>>({})
  const [history, setHistory] = useState<AttendanceCorrection[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState('')
  const [status, setStatus] = useState('present')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const [{ data: sessionRow, error: sessionError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        supabase.from('attendance_sessions').select('id').eq('event_id', event.id).maybeSingle(),
        supabase.from('role_assignments').select('member_id').lte('starts_at', event.starts_at).or(`ends_at.is.null,ends_at.gt.${event.starts_at}`),
      ])
      if (sessionError) throw sessionError
      if (assignmentsError) throw assignmentsError
      const rosterIds = [...new Set((assignments ?? []).map((assignment) => assignment.member_id))]
      const { data: members, error: memberError } = rosterIds.length
        ? await supabase.from('member_profiles').select('id,member_code,full_name,email,study_program,cohort,status').in('id', rosterIds).order('full_name').limit(300)
        : { data: [], error: null }
      if (memberError) throw memberError
      const sid = sessionRow?.id ?? null
      setSessionId(sid)
      setProfiles((members ?? []) as Profile[])
      if (sid) {
        const { data, error: recordError } = await supabase.from('attendance_records').select('member_id,status,source,checked_in_at,correction_reason').eq('session_id', sid)
        if (recordError) throw recordError
        setRecords(Object.fromEntries((data ?? []).map((row) => [row.member_id, { status: row.status, source: row.source, checked_in_at: row.checked_in_at, correction_reason: row.correction_reason }])))
        const { data: historyRows, error: historyError } = await supabase.from('attendance_correction_history').select('id,member_id,previous_status,new_status,reason,changed_by,created_at').eq('session_id', sid).order('created_at', { ascending: false }).limit(30)
        if (historyError) throw historyError
        setHistory((historyRows ?? []) as AttendanceCorrection[])
      } else { setRecords({}); setHistory([]) }
      setMemberId((current) => rosterIds.includes(current) ? current : (members?.[0]?.id ?? ''))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not load the attendance roster.')) }
    finally { setBusy(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event-scoped load
  }, [event.id])

  useEffect(() => { void load() }, [load])

  async function createManualSession() {
    if (!supabase) return
    setSaving(true); setError('')
    const startsAt = new Date(event.starts_at)
    const endsAt = event.ends_at ? new Date(event.ends_at) : new Date(startsAt.getTime() + 4 * 60 * 60 * 1000)
    const { data, error: insertError } = await supabase.from('attendance_sessions').insert({ event_id: event.id, opens_at: startsAt.toISOString(), closes_at: endsAt.toISOString(), state: 'closed', created_by: userId }).select('id').single()
    if (insertError || !data) { setError(t('Could not create the manual attendance record. A session may already exist; reload the roster.')); setSaving(false); return }
    setSessionId(data.id); setRecords({}); setSaving(false)
  }

  async function saveCorrection(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!supabase || !sessionId || !memberId) return
    if (reason.trim().length < 4) { setError(t('Enter a short reason for the manual attendance entry.')); return }
    setSaving(true); setError('')
    const { error: writeError } = await supabase.rpc('record_manual_attendance', { p_session_id: sessionId, p_member_id: memberId, p_status: status, p_reason: reason.trim() })
    if (writeError) { setError(t('Could not save the manual attendance change. Refresh and try again.')); setSaving(false); return }
    setReason(''); await load(); setSaving(false)
  }

  async function exportRoster() {
    if (!supabase || exporting || !profiles.length) return
    setExporting(true); setError('')
    try {
      const { error: auditError } = await supabase.rpc('audit_report_export', { p_report_type: 'attendance', p_scope_id: event.id })
      if (auditError) throw auditError
      downloadCsv(`bac-attendance-${event.id}-${clubDateKey(event.starts_at)}${sessionId ? '-report' : '-paper-roster'}.csv`,
        [t('Member code'), t('Member name'), t('Attendance status'), t('Record type'), t('Recorded at'), t('Correction reason'), t('Paper signature / notes')],
        profiles.map((person) => {
          const record = records[person.id]
          return [person.member_code, person.full_name, record?.status ?? (sessionId ? t('Not recorded') : ''), record?.source ?? '', record?.checked_in_at ?? '', record?.correction_reason ?? '', '']
        }))
    } catch {
      setError(t('Could not record the export in the audit log, so no download was started.'))
    } finally {
      setExporting(false)
    }
  }

  return <Modal title={t('Review attendance roster')} subtitle={`${event.title} · ${t('manual entries and corrections require a reason.')}`} onClose={onClose}><div className="attendance-review-content">{error && <div className="auth-error" role="alert">{error}</div>}{busy ? <div className="live-loading">{t('Loading member roster…')}</div> : <>{!sessionId ? <div className="review-no-session"><p>{t('No attendance session exists for this event yet. Create a closed manual record to enter verified presence, absence, or excused status. You can also download this event’s roster in advance for a paper sign-in sheet.')}</p><div className="review-no-session-actions"><button type="button" className="button button-outline" onClick={() => void exportRoster()} disabled={exporting}>{exporting ? t('Preparing…') : t('Download paper roster')}</button><button className="button button-primary" onClick={() => void createManualSession()} disabled={saving}>{saving ? t('Creating…') : t('Create manual record')}</button></div></div> : <><div className="live-panel-head"><div><h3>{t('Event roster')}</h3><p>{t('Unrecorded members remain marked “Not recorded,” not absent.')}</p></div><button type="button" className="button button-outline" onClick={() => void exportRoster()} disabled={exporting}>{exporting ? t('Preparing…') : t('Export CSV')}</button></div><div className="table-scroll review-roster-table"><table><thead><tr><th>{t('MEMBER')}</th><th>{t('STATUS')}</th><th>{t('RECORD TYPE')}</th></tr></thead><tbody>{profiles.map((person) => { const record = records[person.id]; return <tr key={person.id}><td>{person.full_name}<small className="review-member-code">{person.member_code}</small></td><td>{record?.status ?? t('Not recorded')}</td><td>{record ? record.source : '—'}</td></tr> })}</tbody></table></div>{history.length > 0 && <section className="attendance-correction-history"><h3>{t('Recent corrections')}</h3>{history.map((item) => <div key={item.id}><strong>{profiles.find((person) => person.id === item.member_id)?.full_name ?? t('Member')}</strong><span>{item.previous_status ? `${t(item.previous_status)} → ` : `${t('No previous record')} → `}{t(item.new_status)}</span><small>{item.reason} · {clubDateTime(item.created_at)}</small></div>)}</section>}<form className="live-form review-form" onSubmit={saveCorrection}><h3>{t('Record or correct one member')}</h3><label>{t('Member')}<select required value={memberId} onChange={(change) => setMemberId(change.target.value)}><option value="">{t('Choose a member')}</option>{profiles.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.member_code}</option>)}</select></label><div className="live-form-grid"><label>{t('Attendance status')}<select value={status} onChange={(change) => setStatus(change.target.value)}><option value="present">{t('Present')}</option><option value="absent">{t('Absent')}</option><option value="excused">{t('Excused')}</option></select></label><label>{t('Reason')}<input required minLength={4} maxLength={300} value={reason} onChange={(change) => setReason(change.target.value)} placeholder={t('e.g. HR verified paper sign-in')} /></label></div><div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>{t('Close')}</button><button type="submit" className="button button-primary" disabled={saving || !profiles.length}>{saving ? t('Saving…') : t('Save attendance')}</button></div></form></>}</>}</div></Modal>
}
