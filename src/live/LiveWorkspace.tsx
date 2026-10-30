import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, CalendarDays, Check, ChevronRight, ClipboardCheck, Coins, LogOut, Menu, MessageCircle, Package, ShieldCheck, Users, Wallet, X } from 'lucide-react'
import type { Identity } from '../AuthGate'
import InstallGuideDialog from '../InstallGuideDialog'
import BrandWordmark from '../BrandWordmark'
import { useI18n } from '../i18n'
import { getAttendanceQrToken, openAttendance, submitQrCheckIn, type AttendanceQrToken, type AttendanceSession } from '../lib/attendance'
import { downloadCsv } from '../lib/csv'
import { supabase } from '../lib/supabase'
import {
  attendanceManagers, commsManagers, communicationInboxManagers, eventManagers, financeDeciders,
  financeManagers, financeViewers, hrCaseManagers, hrManagers, ideaReviewManagers, logisticsManagers,
  memberManagers, pointsViewers, ROLE_LABELS, taskOfficers,
} from '../lib/roles'
import { clubDateTime, clubDateKey, initials, setDateLocale } from './datetime'
import { localeFor } from '../i18n'
import { OverviewLive } from './Overview'
import { CalendarLive } from './CalendarView'
import { CancelEventDialog, CompleteEventDialog, EventDialog } from './EventDialogs'
import { InviteMemberDialog, MemberPasswordResetDialog, MemberProfileDialog, MemberRoleDialog, MembersLive, MemberStatusDialog, StartTermDialog, TemporaryMemberPasswordDialog } from './MembersView'
import { AttendanceLive, AttendanceReviewDialog } from './AttendanceView'
import { FinanceLive } from './FinanceView'
import { MoneyDialog, ReceiptDialog, ReversalDialog } from './FinanceDialogs'
import { PurchaseDecisionDialog, PurchaseRequestDialog } from './Purchases'
import { PointsDialog, PointsLive } from './PointsView'
import { AnnouncementDialog, CommunicationsLive, IdeaDialog, NewCommunicationDialog, ReviewIdeaDialog } from './CommunicationsView'
import { InventoryDialog, InventoryMovementDialog, LogisticsLive } from './LogisticsView'
import { TaskDialog, TasksLive } from './TasksView'
import { MemberCaseDialog, SupportLive, UpdateMemberCaseDialog } from './SupportView'
import { AccountLive, ChangePasswordDialog } from './AccountView'
import { ScannerDialog } from './ScannerDialog'
import type { Announcement, ClubNotification, ClubTask, CommunicationMessage, CommunicationThread, CommunicationsSection, DashboardMetrics, FinancialPeriodClosure, FinancialReconciliation, InventoryItem, InventoryMovement, LiveEvent, LiveView, MemberCase, MemberIdea, MemberIdeaReview, MoneyEntry, PaymentReconciliationRow, PointBalance, PointEntry, Profile, PurchaseRequest } from './types'

const modules: { view: LiveView; label: string; icon: typeof CalendarDays; roles: string[] }[] = [
  { view: 'Overview', label: 'Overview', icon: CalendarDays, roles: ['all'] },
  { view: 'Members', label: 'Members', icon: Users, roles: memberManagers },
  { view: 'Attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['all'] },
  { view: 'Finance', label: 'Finance', icon: Wallet, roles: ['all'] },
  { view: 'Points', label: 'Points', icon: Coins, roles: ['all'] },
  { view: 'Calendar', label: 'Calendar', icon: CalendarDays, roles: ['all'] },
  { view: 'Tasks', label: 'Tasks', icon: Check, roles: ['all'] },
  { view: 'Communications', label: 'Communications', icon: MessageCircle, roles: ['all'] },
  { view: 'Logistics', label: 'Logistics', icon: Package, roles: ['president', 'vice_president', 'logistics_officer', 'vice_logistics_officer'] },
  { view: 'Support', label: 'HR Support', icon: ShieldCheck, roles: ['all'] },
]

const notificationDestinations: Partial<Record<string, LiveView>> = {
  '/calendar': 'Calendar', '/communications': 'Communications', '/tasks': 'Tasks',
  '/points': 'Points', '/support': 'Support', '/finance': 'Finance',
  '/attendance': 'Attendance', '/logistics': 'Logistics',
}

/** The browser address always carries the open page, so a reload (or a shared
 *  link) restores the same view. These paths match the notification ones to
 *  keep the numbering consistent. */
const viewPaths: Record<LiveView, string> = {
  Overview: '/', Members: '/members', Attendance: '/attendance', Finance: '/finance',
  Points: '/points', Calendar: '/calendar', Tasks: '/tasks', Communications: '/communications',
  Logistics: '/logistics', Support: '/support', Account: '/account',
}

const viewsByPath: Record<string, LiveView> = Object.fromEntries(
  Object.entries(viewPaths).map(([viewName, path]) => [path, viewName as LiveView])
)

/** Communications holds three sub-pages, each with its own address so a
 *  reload (or a shared link) reopens the same one. */
const communicationsSectionPaths: Record<CommunicationsSection, string> = {
  messages: '/communications',
  news: '/communications/news',
  ideas: '/communications/ideas',
}

const communicationsSectionsByPath: Record<string, CommunicationsSection> = Object.fromEntries(
  Object.entries(communicationsSectionPaths).map(([section, path]) => [path, section as CommunicationsSection])
)

function locationPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

/** The view encoded in the current URL, or Overview for unknown paths. */
function viewFromLocation(): LiveView {
  const path = locationPath()
  if (communicationsSectionsByPath[path]) return 'Communications'
  return viewsByPath[path] ?? 'Overview'
}

/** The Communications tab encoded in the current URL (messages by default). */
function communicationsSectionFromLocation(): CommunicationsSection {
  return communicationsSectionsByPath[locationPath()] ?? 'messages'
}

/** The sidebar only shows modules the role can open; enforce that for URLs too. */
function normalizedView(candidate: LiveView, role: string): LiveView {
  if (candidate === 'Account') return candidate
  const module = modules.find((item) => item.view === candidate)
  if (!module) return 'Overview'
  return module.roles.includes('all') || module.roles.includes(role) ? candidate : 'Overview'
}

export default function LiveWorkspace({ identity, onSignOut }: { identity: Identity; onSignOut: () => void }) {
  const { t, language } = useI18n()
  const [view, setViewState] = useState<LiveView>(() => {
    const fromUrl = normalizedView(viewFromLocation(), identity.role)
    // Keep a deep Communications link (/communications/news) when it is allowed.
    window.history.replaceState({}, '', fromUrl === 'Communications'
      ? communicationsSectionPaths[communicationsSectionFromLocation()]
      : viewPaths[fromUrl])
    return fromUrl
  })
  const [communicationsSection, setCommunicationsSection] = useState<CommunicationsSection>(communicationsSectionFromLocation)

  /** Every navigation pushes its path so the address shows the open page. */
  function setView(nextView: LiveView) {
    const next = normalizedView(nextView, identity.role)
    setViewState(next)
    const path = next === 'Communications' ? communicationsSectionPaths[communicationsSection] : viewPaths[next]
    if (locationPath() !== path) window.history.pushState({}, '', path)
  }

  /** Switch between the three Communications sub-pages. */
  function openCommunicationsSection(section: CommunicationsSection) {
    setCommunicationsSection(section)
    setViewState('Communications')
    const path = communicationsSectionPaths[section]
    if (locationPath() !== path) window.history.pushState({}, '', path)
  }
  const [currentTermName, setCurrentTermName] = useState('Current term')
  const [currentTermEndsOn, setCurrentTermEndsOn] = useState<string | null>(null)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({})
  const [entries, setEntries] = useState<MoneyEntry[]>([])
  const [periodClosures, setPeriodClosures] = useState<FinancialPeriodClosure[]>([])
  const [financialReconciliations, setFinancialReconciliations] = useState<FinancialReconciliation[]>([])
  const [financeBalanceMinor, setFinanceBalanceMinor] = useState(0)
  const [reconciliation, setReconciliation] = useState<PaymentReconciliationRow[]>([])
  const [pointEntries, setPointEntries] = useState<PointEntry[]>([])
  const [pointBalances, setPointBalances] = useState<PointBalance[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [ideas, setIdeas] = useState<MemberIdea[]>([])
  const [ideaReviews, setIdeaReviews] = useState<MemberIdeaReview[]>([])
  const [communicationThreads, setCommunicationThreads] = useState<CommunicationThread[]>([])
  const [memberCases, setMemberCases] = useState<MemberCase[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({ openTasks: 0, unreadNotifications: 0, activeMembers: null, balanceMinor: null, inventoryItems: null, attendanceRate: null, attendanceDetail: null })
  const [tasks, setTasks] = useState<ClubTask[]>([])
  const [notifications, setNotifications] = useState<ClubNotification[]>([])
  const [busy, setBusy] = useState(true)
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [eventModal, setEventModal] = useState(false)
  const [eventToEdit, setEventToEdit] = useState<LiveEvent | null>(null)
  const [eventToCancel, setEventToCancel] = useState<LiveEvent | null>(null)
  const [eventToComplete, setEventToComplete] = useState<LiveEvent | null>(null)
  const [moneyModal, setMoneyModal] = useState(false)
  const [purchaseRequestModal, setPurchaseRequestModal] = useState(false)
  const [purchaseRequestToPay, setPurchaseRequestToPay] = useState<PurchaseRequest | null>(null)
  const [purchaseRequestToDecide, setPurchaseRequestToDecide] = useState<{ request: PurchaseRequest; decision: 'approved' | 'declined' } | null>(null)
  const [pointsModal, setPointsModal] = useState(false)
  const [reversalEntry, setReversalEntry] = useState<MoneyEntry | null>(null)
  const [receiptPreviewPath, setReceiptPreviewPath] = useState<string | null>(null)
  const [announcementModal, setAnnouncementModal] = useState(false)
  const [ideaModal, setIdeaModal] = useState(false)
  const [ideaToReview, setIdeaToReview] = useState<MemberIdea | null>(null)
  const [communicationFormOpen, setCommunicationFormOpen] = useState(false)
  const [inventoryModal, setInventoryModal] = useState(false)
  const [inviteMemberModal, setInviteMemberModal] = useState(false)
  const [temporaryMemberCredentials, setTemporaryMemberCredentials] = useState<{ email: string; password: string } | null>(null)
  const [supportModal, setSupportModal] = useState(false)
  const [caseToUpdate, setCaseToUpdate] = useState<MemberCase | null>(null)
  const [passwordModal, setPasswordModal] = useState(false)
  const [inventoryMovementItem, setInventoryMovementItem] = useState<InventoryItem | null>(null)
  const [taskModal, setTaskModal] = useState(false)
  const [statusMember, setStatusMember] = useState<{ member: Profile; nextStatus: string } | null>(null)
  const [editMember, setEditMember] = useState<Profile | null>(null)
  const [roleMember, setRoleMember] = useState<{ member: Profile; nextRole: string } | null>(null)
  const [passwordResetMember, setPasswordResetMember] = useState<Profile | null>(null)
  const [termHandoverOpen, setTermHandoverOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null)
  const [attendanceReviewEvent, setAttendanceReviewEvent] = useState<LiveEvent | null>(null)
  const [qrToken, setQrToken] = useState<AttendanceQrToken | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const viewRefreshInFlight = useRef(false)
  const viewLoadInFlight = useRef(0)
  // Views that already have data on screen. Once a view is loaded, later
  // refreshes (after a save, a realtime event, or a return visit) update it in
  // place instead of unmounting it behind the blocking "Loading" screen.
  const loadedViews = useRef<Set<LiveView>>(new Set())

  // Date, time, and money formatters follow the active interface language.
  useEffect(() => { setDateLocale(localeFor(language)) }, [language])

  const canEvents = eventManagers.includes(identity.role)
  const canViewFinance = financeViewers.includes(identity.role)
  const canFinance = financeManagers.includes(identity.role)
  const canDecidePurchase = financeDeciders.includes(identity.role)
  const canHR = hrManagers.includes(identity.role)
  const canComms = commsManagers.includes(identity.role)
  const canManageCommunicationInbox = communicationInboxManagers.includes(identity.role)
  const canReviewIdeas = ideaReviewManagers.includes(identity.role)
  const canLogistics = logisticsManagers.includes(identity.role)
  const visibleModules = modules.filter((item) => item.roles.includes('all') || item.roles.includes(identity.role))

  const notify = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3000)
  }, [])

  const loadEvents = useCallback(async () => {
    if (!supabase) return
    const now = new Date().toISOString()
    const select = 'id,title,description,event_type,starts_at,ends_at,location,status,expected_contribution_minor,currency,cancellation_reason,attendance_sessions(id)'
    const [upcomingResult, historyResult] = await Promise.all([
      supabase.from('events').select(select).gte('starts_at', now).order('starts_at', { ascending: true }).limit(300),
      supabase.from('events').select(select).lt('starts_at', now).order('starts_at', { ascending: false }).limit(300),
    ])
    if (upcomingResult.error) throw upcomingResult.error
    if (historyResult.error) throw historyResult.error
    setEvents([...(upcomingResult.data ?? []), ...(historyResult.data ?? [])] as LiveEvent[])
  }, [])

  const loadViewData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!supabase) return
    // Only the first visit to a view gets the blocking loading screen; every
    // later refresh keeps the current screen (and its state) mounted.
    const showSpinner = !silent && !loadedViews.current.has(view)
    if (showSpinner) { setBusy(true); setError('') }
    viewLoadInFlight.current += 1
    try {
      if (view === 'Overview' || view === 'Calendar' || view === 'Attendance' || view === 'Points' || view === 'Finance') await loadEvents()
      if (view === 'Overview') {
        const [{ count: taskCount, error: taskError }, { count: unreadCount, error: unreadError }] = await Promise.all([
          identity.role === 'member'
            ? supabase.from('task_assignments').select('task_id', { count: 'exact', head: true }).eq('member_id', identity.id).in('status', ['todo', 'in_progress', 'blocked'])
            : supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['todo', 'in_progress', 'blocked']),
          supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
        ])
        if (taskError) throw taskError
        if (unreadError) throw unreadError
        const next: DashboardMetrics = { openTasks: taskCount ?? 0, unreadNotifications: unreadCount ?? 0, activeMembers: null, balanceMinor: null, inventoryItems: null, attendanceRate: null, attendanceDetail: null }
        let activeRosterIds: string[] = []
        if (['president', 'vice_president', 'hr', 'vice_hr'].includes(identity.role)) {
          const now = new Date().toISOString()
          const [{ data: profileRows, error: membersError }, { data: assignmentRows, error: assignmentsError }] = await Promise.all([
            supabase.from('member_profiles').select('id').eq('status', 'active'),
            supabase.from('role_assignments').select('member_id,club_terms!inner(is_current)').eq('club_terms.is_current', true).lte('starts_at', now).or(`ends_at.is.null,ends_at.gt.${now}`),
          ])
          if (membersError) throw membersError
          if (assignmentsError) throw assignmentsError
          const activeProfileIds = new Set((profileRows ?? []).map((profile) => profile.id))
          activeRosterIds = [...new Set((assignmentRows ?? []).map((assignment) => assignment.member_id).filter((memberId) => activeProfileIds.has(memberId)))]
          next.activeMembers = activeRosterIds.length
        }
        if (canViewFinance) {
          const { data: balanceRows, error: balanceError } = await supabase.from('recorded_financial_balance').select('balance_minor').limit(1)
          if (balanceError) throw balanceError
          next.balanceMinor = Number(balanceRows?.[0]?.balance_minor ?? 0)
        }
        if (attendanceManagers.includes(identity.role)) {
          const { data: candidateEvents, error: candidateEventsError } = await supabase.from('events')
            .select('id,title,starts_at,status').in('status', ['published', 'in_progress', 'completed'])
            .order('starts_at', { ascending: false }).limit(300)
          if (candidateEventsError) throw candidateEventsError
          const eventsById = new Map((candidateEvents ?? []).map((event) => [event.id, event]))
          const candidateEventIds = [...eventsById.keys()]
          let candidateSessions: Array<{ id: string; event_id: string }> = []
          if (candidateEventIds.length) {
            const { data, error: sessionError } = await supabase.from('attendance_sessions')
              .select('id,event_id').in('event_id', candidateEventIds).limit(500)
            if (sessionError) throw sessionError
            candidateSessions = data ?? []
          }
          const sessionRow = candidateSessions.sort((left, right) =>
            new Date(eventsById.get(right.event_id)?.starts_at ?? 0).getTime()
            - new Date(eventsById.get(left.event_id)?.starts_at ?? 0).getTime()
          )[0]
          if (sessionRow) {
            const eventRow = eventsById.get(sessionRow.event_id)
            const { data: presentRows, error: attendanceError } = await supabase.from('attendance_records').select('member_id').eq('session_id', sessionRow.id).eq('status', 'present')
            if (attendanceError) throw attendanceError
            let eventRoster = new Set(activeRosterIds)
            if (eventRow?.starts_at) {
              const eventDate = clubDateKey(eventRow.starts_at)
              const { data: term, error: termError } = await supabase.from('club_terms').select('id')
                .lte('starts_on', eventDate).gte('ends_on', eventDate).order('starts_on', { ascending: false }).limit(1).maybeSingle()
              if (termError) throw termError
              let assignmentQuery = supabase.from('role_assignments').select('member_id,starts_at')
                .lte('starts_at', eventRow.starts_at).or(`ends_at.is.null,ends_at.gt.${eventRow.starts_at}`)
              if (term?.id) assignmentQuery = assignmentQuery.eq('term_id', term.id)
              const { data: eventAssignments, error: assignmentsError } = await assignmentQuery
              if (assignmentsError) throw assignmentsError
              const assignedIds = [...new Set((eventAssignments ?? []).map((assignment) => assignment.member_id))]
              if (assignedIds.length) {
                const [{ data: eventProfiles, error: profilesError }, { data: statusHistory, error: historyError }] = await Promise.all([
                  supabase.from('member_profiles').select('id,status,joined_on').in('id', assignedIds),
                  supabase.from('member_status_history').select('member_id,old_status,new_status,created_at').in('member_id', assignedIds).order('created_at', { ascending: true }),
                ])
                if (profilesError) throw profilesError
                if (historyError) throw historyError
                const historyByMember = new Map<string, typeof statusHistory>()
                for (const change of statusHistory ?? []) historyByMember.set(change.member_id, [...(historyByMember.get(change.member_id) ?? []), change])
                const eventTime = new Date(eventRow.starts_at).getTime()
                eventRoster = new Set((eventProfiles ?? []).filter((profile) => {
                  if (profile.joined_on && profile.joined_on > eventDate) return false
                  const history = historyByMember.get(profile.id) ?? []
                  const priorChanges = history.filter((change) => new Date(change.created_at).getTime() <= eventTime)
                  const statusAtEvent = priorChanges.length
                    ? priorChanges[priorChanges.length - 1].new_status
                    : history.length ? history[0].old_status : profile.status
                  return statusAtEvent === 'active'
                }).map((profile) => profile.id))
              } else eventRoster = new Set()
            }
            const presentCount = (presentRows ?? []).filter((record) => eventRoster.has(record.member_id)).length
            const memberCount = eventRoster.size
            next.attendanceRate = memberCount ? Math.round(presentCount / memberCount * 100) : 0
            next.attendanceDetail = `${presentCount} ${t('present')}${eventRow?.title ? ` · ${eventRow.title}` : ''}`
          }
        }
        if (canLogistics) {
          const { count, error: inventoryError } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true })
          if (inventoryError) throw inventoryError
          next.inventoryItems = count ?? 0
        }
        setDashboardMetrics(next)
      }
      if (view === 'Members') {
        const { data, error: queryError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').order('full_name').limit(250)
        if (queryError) throw queryError
        setProfiles((data ?? []) as Profile[])
        const now = new Date().toISOString()
        const { data: assignments, error: roleError } = await supabase.from('role_assignments').select('member_id,role,club_terms!inner(is_current)').eq('club_terms.is_current', true).lte('starts_at', now).or(`ends_at.is.null,ends_at.gt.${now}`)
        if (roleError) throw roleError
        setMemberRoles(Object.fromEntries((assignments ?? []).filter((assignment) => assignment.role !== 'member').map((assignment) => [assignment.member_id, assignment.role])))
      }
      if (view === 'Finance') {
        const [{ data, error: queryError }, { data: reconciliationRows, error: reconciliationError }, { data: balanceRows, error: balanceError }, { data: periodRows, error: periodError }, { data: requestRows, error: requestError }, { data: cashRows, error: cashError }] = await Promise.all([
          supabase.from('financial_transactions').select('id,transaction_type,amount_minor,direction,currency,description,created_at,status,event_id,member_id,reverses_transaction_id,purchase_request_id,receipt_path').order('created_at', { ascending: false }).limit(500),
          supabase.from('event_payment_reconciliation').select('event_id,member_id,expected_minor,waiver_minor,waiver_reason,received_minor,due_minor,payment_status'),
          supabase.from('recorded_financial_balance').select('balance_minor').limit(1),
          supabase.from('financial_period_closures').select('id,start_date,end_date,transaction_count,income_minor,expenses_minor,net_minor,reason,closed_by,closed_at').order('start_date', { ascending: false }),
          supabase.from('purchase_requests').select('id,item_description,category,quantity,estimated_amount_minor,reason,event_id,requested_by,status,decision_note,reviewed_by,reviewed_at,paid_transaction_id,created_at').order('created_at', { ascending: false }).limit(150),
          supabase.from('financial_reconciliations').select('id,as_of_date,payment_method,transaction_count,ledger_balance_minor,actual_balance_minor,variance_minor,reason,reconciled_by,reconciled_at').order('as_of_date', { ascending: false }).order('reconciled_at', { ascending: false }).limit(100),
        ])
        if (queryError) throw queryError
        if (reconciliationError) throw reconciliationError
        if (balanceError) throw balanceError
        if (periodError) throw periodError
        if (requestError) throw requestError
        if (cashError) throw cashError
        setEntries((data ?? []) as MoneyEntry[])
        setReconciliation((reconciliationRows ?? []) as PaymentReconciliationRow[])
        setFinanceBalanceMinor(Number(balanceRows?.[0]?.balance_minor ?? 0))
        setPeriodClosures((periodRows ?? []) as FinancialPeriodClosure[])
        setPurchaseRequests((requestRows ?? []) as PurchaseRequest[])
        setFinancialReconciliations((cashRows ?? []) as FinancialReconciliation[])
        if (canViewFinance) {
          const { data: memberRows, error: memberError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').order('full_name').limit(1000)
          if (memberError) throw memberError
          setProfiles((memberRows ?? []) as Profile[])
        }
      }
      if (view === 'Points') {
        const [{ data, error: queryError }, { data: balances, error: balanceError }] = await Promise.all([
          supabase.from('point_transactions').select('id,member_id,event_id,points_delta,category,reason,created_by,created_at').order('created_at', { ascending: false }).limit(200),
          supabase.from('member_point_balances').select('member_id,points_balance'),
        ])
        if (queryError) throw queryError
        if (balanceError) throw balanceError
        setPointEntries((data ?? []) as PointEntry[])
        setPointBalances((balances ?? []) as PointBalance[])
        if (canHR) {
          const { data: memberRows, error: memberError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').eq('status', 'active').order('full_name').limit(250)
          if (memberError) throw memberError
          setProfiles((memberRows ?? []) as Profile[])
        }
      }
      if (view === 'Communications') {
        const { data, error: queryError } = await supabase.from('announcements').select('id,title,body,audience,target_team,published_at,created_at').order('created_at', { ascending: false }).limit(50)
        if (queryError) throw queryError
        setAnnouncements((data ?? []) as Announcement[])
        const { data: ideaRows, error: ideasError } = await supabase.from('member_ideas').select('id,title,description,status,submitted_by,review_note,reviewed_at,created_at').order('created_at', { ascending: false }).limit(50)
        if (ideasError) throw ideasError
        setIdeas((ideaRows ?? []) as MemberIdea[])
        const ideaIds = (ideaRows ?? []).map((idea) => idea.id)
        if (ideaIds.length) {
          const { data: reviewRows, error: reviewError } = await supabase.from('member_idea_review_history').select('id,idea_id,previous_status,new_status,review_note,changed_by,created_at').in('idea_id', ideaIds).order('created_at', { ascending: false }).limit(500)
          if (reviewError) throw reviewError
          setIdeaReviews((reviewRows ?? []) as MemberIdeaReview[])
        } else setIdeaReviews([])
        const { data: threadRows, error: threadError } = await supabase.from('member_communication_threads').select('id,member_id,subject,status,target_role,closure_note,created_at,updated_at').order('updated_at', { ascending: false }).limit(100)
        if (threadError) throw threadError
        const threadIds = (threadRows ?? []).map((thread) => thread.id)
        let messageRows: CommunicationMessage[] = []
        if (threadIds.length) {
          const { data: messages, error: messagesError } = await supabase.from('member_communication_messages').select('id,thread_id,sender_id,sender_side,body,created_at').in('thread_id', threadIds).order('created_at', { ascending: true }).limit(2000)
          if (messagesError) throw messagesError
          messageRows = (messages ?? []) as CommunicationMessage[]
        }
        const messagesByThread = new Map<string, typeof messageRows>()
        for (const message of messageRows) messagesByThread.set(message.thread_id, [...(messagesByThread.get(message.thread_id) ?? []), message])
        const mappedThreads = (threadRows ?? []).map((thread) => ({ ...thread, messages: messagesByThread.get(thread.id) ?? [] })) as CommunicationThread[]
        setCommunicationThreads(mappedThreads)
        if (canReviewIdeas || canManageCommunicationInbox) {
          const profileIds = new Set<string>()
          if (canReviewIdeas) for (const idea of (ideaRows ?? [])) profileIds.add(idea.submitted_by)
          if (canManageCommunicationInbox) for (const thread of mappedThreads) { profileIds.add(thread.member_id); for (const message of thread.messages) profileIds.add(message.sender_id) }
          if (canManageCommunicationInbox) {
            // Managers need the full active roster to start new conversations.
            const { data: roster, error: rosterError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').eq('status', 'active').order('full_name').limit(500)
            if (rosterError) throw rosterError
            for (const member of (roster ?? []) as Profile[]) profileIds.add(member.id)
          }
          if (profileIds.size) {
            const { data: authors, error: authorError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').in('id', [...profileIds])
            if (authorError) throw authorError
            setProfiles((authors ?? []) as Profile[])
          } else setProfiles([])
        }
      }
      if (view === 'Support') {
        const { data, error: queryError } = await supabase.from('member_cases').select('id,submitted_by,title,description,people_involved,status,response,created_at,updated_at').order('created_at', { ascending: false }).limit(200)
        if (queryError) throw queryError
        setMemberCases((data ?? []) as MemberCase[])
        if (hrCaseManagers.includes(identity.role)) {
          const { data: memberRows, error: memberError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').order('full_name').limit(250)
          if (memberError) throw memberError
          setProfiles((memberRows ?? []) as Profile[])
        }
      }
      if (view === 'Logistics') {
        const [{ data, error: queryError }, { data: movementRows, error: movementError }, { data: requestRows, error: requestError }] = await Promise.all([
          supabase.from('inventory_items').select('id,name,category,quantity,condition,storage_location').order('name').limit(200),
          supabase.from('inventory_movements').select('id,item_id,member_id,event_id,quantity,movement_type,reason,created_by,created_at').order('created_at', { ascending: false }).limit(150),
          supabase.from('purchase_requests').select('id,item_description,category,quantity,estimated_amount_minor,reason,event_id,requested_by,status,decision_note,reviewed_by,reviewed_at,paid_transaction_id,created_at').order('created_at', { ascending: false }).limit(150),
        ])
        if (queryError) throw queryError
        if (movementError) throw movementError
        if (requestError) throw requestError
        setInventory((data ?? []) as InventoryItem[])
        setInventoryMovements((movementRows ?? []) as InventoryMovement[])
        setPurchaseRequests((requestRows ?? []) as PurchaseRequest[])
        if (canLogistics) {
          const [{ data: memberRows, error: memberError }, { data: eventRows, error: eventsError }] = await Promise.all([
            supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').eq('status', 'active').order('full_name').limit(250),
            supabase.from('events').select('id,title,description,event_type,starts_at,ends_at,location,status,expected_contribution_minor,currency,cancellation_reason,attendance_sessions(id)').order('starts_at', { ascending: false }).limit(100),
          ])
          if (memberError) throw memberError
          if (eventsError) throw eventsError
          setProfiles((memberRows ?? []) as Profile[])
          setEvents((eventRows ?? []) as LiveEvent[])
        }
      }
      if (view === 'Tasks') {
        const { data, error: queryError } = await supabase.from('tasks').select('id,title,description,team,priority,status,due_at,created_by,task_assignments(member_id,status)').order('due_at', { ascending: true, nullsFirst: false }).limit(100)
        if (queryError) throw queryError
        setTasks((data ?? []) as ClubTask[])
        if (taskOfficers.includes(identity.role)) {
          const { data: memberRows, error: memberError } = await supabase.from('member_profiles').select('id,member_code,full_name,email,phone_number,study_program,cohort,status').eq('status', 'active').order('full_name').limit(250)
          if (memberError) throw memberError
          setProfiles((memberRows ?? []) as Profile[])
        }
      }
      loadedViews.current.add(view)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not load this workspace. Check your connection and access.'))
    } finally { viewLoadInFlight.current -= 1; if (showSpinner) setBusy(false) }
  }, [view, identity.role, identity.id, canHR, canViewFinance, canLogistics, canReviewIdeas, canManageCommunicationInbox, loadEvents, t])

  async function recordInventoryMovement(input: { itemId: string; movementType: string; quantity: number; memberId: string | null; eventId: string | null; reason: string }) {
    if (!supabase) return
    const { error: movementError } = await supabase.rpc('record_inventory_movement', { p_item_id: input.itemId, p_movement_type: input.movementType, p_quantity: input.quantity, p_member_id: input.memberId, p_event_id: input.eventId, p_reason: input.reason })
    if (movementError) throw movementError
    setInventoryMovementItem(null)
    await loadViewData()
    notify(t('Inventory movement recorded and stock updated.'))
  }

  useEffect(() => { void loadViewData() }, [loadViewData])

  const silentRefresh = useCallback(() => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || busy || viewLoadInFlight.current > 0 || viewRefreshInFlight.current) return
    viewRefreshInFlight.current = true
    void loadViewData({ silent: true }).finally(() => { viewRefreshInFlight.current = false })
  }, [busy, loadViewData])

  useEffect(() => {
    const timer = window.setInterval(silentRefresh, 60_000)
    window.addEventListener('focus', silentRefresh)
    window.addEventListener('online', silentRefresh)
    document.addEventListener('visibilitychange', silentRefresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', silentRefresh)
      window.removeEventListener('online', silentRefresh)
      document.removeEventListener('visibilitychange', silentRefresh)
    }
  }, [silentRefresh])

  const loadNotifications = useCallback(async () => {
    if (!supabase) return
    const { data, error: queryError } = await supabase.from('notifications').select('id,title,body,category,target_path,read_at,created_at').order('created_at', { ascending: false }).limit(30)
    if (queryError) { setError(t('Could not load your notifications.')); return }
    setNotifications((data ?? []) as ClubNotification[])
  }, [t])

  useEffect(() => {
    const refreshWhenAvailable = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void loadNotifications()
    }
    void loadNotifications()
    const timer = window.setInterval(refreshWhenAvailable, 60_000)
    window.addEventListener('focus', refreshWhenAvailable)
    window.addEventListener('online', refreshWhenAvailable)
    document.addEventListener('visibilitychange', refreshWhenAvailable)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenAvailable)
      window.removeEventListener('online', refreshWhenAvailable)
      document.removeEventListener('visibilitychange', refreshWhenAvailable)
    }
  }, [loadNotifications])

  // Supabase Realtime: refresh affected views and notices the moment data
  // changes server-side. The 60-second poll above remains as a fallback.
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const channel = client.channel('bac-workspace-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${identity.id}` }, () => { void loadNotifications() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, silentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, silentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignments' }, silentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, silentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_communication_threads' }, silentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_communication_messages' }, silentRefresh)
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [identity.id, loadNotifications, silentRefresh])

  // Browser back/forward moves between the workspace pages and Communications tabs.
  useEffect(() => {
    const onPop = () => {
      setViewState(normalizedView(viewFromLocation(), identity.role))
      setCommunicationsSection(communicationsSectionFromLocation())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [identity.role])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.from('club_terms').select('name,ends_on').eq('is_current', true).maybeSingle()
      .then(({ data, error: queryError }) => {
        if (alive && !queryError && data?.name) { setCurrentTermName(data.name); setCurrentTermEndsOn(data.ends_on) }
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const online = () => setNetworkOnline(true)
    const offline = () => setNetworkOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  useEffect(() => {
    if (!activeSession) { setQrToken(null); return }
    let alive = true
    const refresh = async () => {
      try { const next = await getAttendanceQrToken(activeSession.id); if (alive) setQrToken(next) }
      catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : t('Could not refresh the QR code.')) }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [activeSession, t])

  const filteredProfiles = profiles.filter((person) => `${person.full_name} ${person.member_code} ${person.study_program ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const upcomingEvents = events.filter((event) => !['cancelled', 'completed'].includes(event.status) && new Date(event.starts_at).getTime() >= Date.now()).slice(0, 5)

  async function startAttendance(eventId: string) {
    setError('')
    try { const result = await openAttendance(eventId); setActiveSession(result.session); notify(t('Attendance opened. The QR code will rotate automatically.')) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not open attendance.')) }
  }

  async function closeAttendance() {
    if (!supabase || !activeSession) return
    const { error: closeError } = await supabase.from('attendance_sessions').update({ state: 'closed' }).eq('id', activeSession.id)
    if (closeError) { setError(closeError.message); return }
    setActiveSession(null)
    notify(t('Attendance session closed.'))
  }

  async function handleScannedToken(token: string) {
    if (scanBusy) return
    setScanBusy(true); setError('')
    try {
      const result = await submitQrCheckIn(token)
      setScannerOpen(false)
      notify(result.status === 'checked_in' ? t('You’re checked in. Your attendance is recorded.') : t('You’re already checked in for this session.'))
    } catch (cause) {
      setScannerOpen(false)
      setError(cause instanceof Error ? cause.message : t('Check-in failed. Ask HR for help.'))
    }
    finally { setScanBusy(false) }
  }

  async function markNotificationRead(item: ClubNotification) {
    if (!supabase || item.read_at) return
    const readAt = new Date().toISOString()
    const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', item.id)
    if (updateError) { setError(t('Could not update this notification.')); return }
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read_at: readAt } : row))
  }

  async function markAllNotificationsRead() {
    if (!supabase || !notifications.some((item) => !item.read_at)) return
    const readAt = new Date().toISOString()
    const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).is('read_at', null)
    if (updateError) { setError(t('Could not update your notifications.')); return }
    setNotifications((current) => current.map((row) => row.read_at ? row : { ...row, read_at: readAt }))
  }

  async function openNotification(item: ClubNotification) {
    await markNotificationRead(item)
    const nextView = item.target_path ? notificationDestinations[item.target_path] : undefined
    if (nextView) setView(nextView)
    setNotificationsOpen(false)
  }

  async function changeTaskStatus(taskId: string, status: string) {
    if (!supabase) return
    const { error: updateError } = await supabase.rpc('update_assigned_task_status', { p_task_id: taskId, p_new_status: status })
    if (updateError) { setError(t('Could not update this task status. Refresh and check your assignment.')); return }
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task
      if (identity.role !== 'member') return { ...task, status, task_assignments: task.task_assignments.map((assignment) => ({ ...assignment, status })) }
      return { ...task, task_assignments: task.task_assignments.map((assignment) => assignment.member_id === identity.id ? { ...assignment, status } : assignment) }
    }))
    notify(t('Task status updated.'))
  }

  async function generatePaymentExpectations(eventId: string) {
    if (!supabase) return
    const { data, error: expectationError } = await supabase.rpc('generate_event_payment_expectations', { p_event_id: eventId })
    if (expectationError) { setError(t('Could not sync attendee contributions. Check the event attendance, contribution amount, and Treasurer access.')); return }
    await loadViewData()
    const attendeeCount = Number(data ?? 0)
    notify(attendeeCount ? t('Contribution expectations synced for {count} attendees.', { count: attendeeCount }) : t('No present attendees were recorded for this event.'))
  }

  async function exportFinanceLedger() {
    if (!supabase || exportBusy) return
    setExportBusy(true); setError('')
    try {
      const { error: auditError } = await supabase.rpc('audit_report_export', { p_report_type: 'finance', p_scope_id: canViewFinance ? null : identity.id })
      if (auditError) throw auditError
      const allRows: MoneyEntry[] = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: exportError } = await supabase.from('financial_transactions')
          .select('id,transaction_type,amount_minor,direction,currency,description,created_at,status,event_id,member_id,reverses_transaction_id,purchase_request_id,receipt_path')
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize - 1)
        if (exportError) throw exportError
        const page = (data ?? []) as MoneyEntry[]
        allRows.push(...page)
        if (page.length < pageSize) break
      }
      if (!allRows.length) { notify(t('There are no finance records available to export.')); return }
      const eventNames = new Map(events.map((event) => [event.id, event.title]))
      const memberNames = new Map(profiles.map((profile) => [profile.id, `${profile.member_code} · ${profile.full_name}`]))
      downloadCsv(`bac-finance-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
        [t('Transaction ID'), t('Date'), t('Type'), t('Direction'), t('Amount (minor units)'), t('Currency'), t('Description'), t('Event'), t('Member'), t('Status'), t('Reversal of'), t('Purchase request ID'), t('Receipt path')],
        allRows.map((entry) => [entry.id, new Date(entry.created_at).toISOString(), entry.transaction_type, entry.direction, entry.amount_minor, entry.currency, entry.description, entry.event_id ? eventNames.get(entry.event_id) ?? entry.event_id : '', entry.member_id ? memberNames.get(entry.member_id) ?? entry.member_id : '', entry.status, entry.reverses_transaction_id ?? '', entry.purchase_request_id ?? '', entry.receipt_path ?? '']))
      notify(t('Exported {count} finance records.', { count: allRows.length }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not export the finance ledger.')) }
    finally { setExportBusy(false) }
  }

  const viewTitles: Record<LiveView, string> = {
    Overview: t('Overview'), Members: t('Members'), Attendance: t('Attendance'), Finance: t('Club finances'),
    Points: t('Engagement points'), Calendar: t('Calendar'), Tasks: t('Tasks'), Communications: t('Club news'),
    Logistics: t('Tools & logistics'), Support: t('HR Support'), Account: t('My account'),
  }
  const viewSubtitles: Record<LiveView, string> = {
    Overview: t('Your live club workspace.'),
    Members: `${t('Member access and roster management')} · ${t(ROLE_LABELS[identity.role] ?? 'Member')}`,
    Attendance: t('Record presence at gatherings and events.'),
    Finance: t('Contributions and club purchases, recorded with care.'),
    Points: t('A clear, reasoned history of club participation points.'),
    Calendar: t('Meetings and events shared by the BAC team.'),
    Tasks: t('Your assigned work and club priorities.'),
    Communications: t('Announcements, ideas, and member updates.'),
    Logistics: t('The tools and materials that support club activities.'),
    Support: t('A confidential channel for members to contact HR.'),
    Account: t('Your BAC access and sign-in security.'),
  }

  const communicationsSubtitles: Record<CommunicationsSection, string> = {
    messages: t('Private conversations between members and the board.'),
    news: t('Official club news and updates.'),
    ideas: t('Member suggestions and their review status.'),
  }

  return <div className="live-shell">
    <aside className={`live-sidebar${mobileNavOpen ? ' live-sidebar-open' : ''}`}><div className="brand-lockup"><img src="/bac-logo.png" alt={t('Biologists in Action Club')} className="brand-mark brand-logo-image" /><div><BrandWordmark /><small>{t('CLUB PLATFORM')}</small></div></div><div className="club-switch"><div className="club-name"><strong>{t('Biologists in Action')}</strong><small>FST Settat · {currentTermName}</small></div></div><div className="nav-caption">{t('YOUR CLUB')}</div><nav>{visibleModules.map(({ view: destination, label, icon: Icon }) => <button key={destination} className={`nav-item ${view === destination ? 'selected' : ''}`} onClick={() => { setView(destination); setSearch(''); setMobileNavOpen(false) }}><Icon size={17} /><span>{t(label)}</span></button>)}</nav><div className="live-profile"><button className={`profile-open${view === 'Account' ? ' active' : ''}`} onClick={() => { setView('Account'); setMobileNavOpen(false) }} aria-label={t('My account')}><div className="avatar avatar-dark">{initials(identity.name)}</div><div><strong>{identity.name}</strong><small>{t(ROLE_LABELS[identity.role] ?? 'Member')}</small></div></button><button className="icon-button" onClick={onSignOut} aria-label={t('Sign out')}><LogOut size={16} /></button></div></aside>
    {mobileNavOpen && <button className="scrim" aria-label={t('Close menu')} onClick={() => setMobileNavOpen(false)} />}
    <main className="live-main"><header className="live-topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label={t('Open menu')}><Menu size={20} /></button><div><span>{t('Club')}</span><ChevronRight size={13} /><strong>{viewTitles[view]}</strong></div><div className="live-top-actions"><span className={`connected-state ${networkOnline ? '' : 'network-offline'}`} role="status"><i /> {networkOnline ? t('Network online') : t('Offline')}</span><div className="notification-anchor"><button className="icon-button notification-trigger" onClick={() => { setNotificationsOpen((open) => !open); if (!notificationsOpen) void loadNotifications() }} aria-label={`${t('Notifications')}${notifications.some((item) => !item.read_at) ? `, ${t('unread items')}` : ''}`}><Bell size={18} />{notifications.some((item) => !item.read_at) && <i />}</button>{notificationsOpen && <div className="notification-popover"><div className="notification-popover-head"><strong>{t('Notifications')}</strong><span>{t('{count} unread', { count: notifications.filter((item) => !item.read_at).length })}</span>{notifications.some((item) => !item.read_at) && <button type="button" className="notification-mark-all" onClick={() => void markAllNotificationsRead()}>{t('Mark all read')}</button>}</div>{notifications.length ? notifications.map((item) => <button className={`notification-item ${item.read_at ? '' : 'notification-unread'}`} key={item.id} onClick={() => void openNotification(item)}><strong>{item.title}</strong><span>{item.body}</span><small>{clubDateTime(item.created_at)}</small></button>) : <p className="notification-empty">{t('You’re all caught up.')}</p>}</div>}</div></div></header>
      <div className="live-content"><div className="live-title-row"><div><span className="eyebrow">{t('BIOLOGISTS IN ACTION · FST SETTAT')}</span><h1>{view === 'Overview' ? `${t('Welcome, {name}', { name: identity.name.split(' ')[0] })}` : viewTitles[view]}</h1><p>{view === 'Communications' ? communicationsSubtitles[communicationsSection] : viewSubtitles[view]}</p></div>{view === 'Account' && <button className="button button-outline" onClick={() => setView('Overview')}><ArrowLeft size={15} /> {t('Back')}</button>}</div>
        {error && <div className="live-error" role="alert"><ShieldCheck size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label={t('Dismiss')}><X size={15} /></button></div>}
        {!networkOnline && <div className="live-offline-notice" role="status">{t('You’re offline. Displayed data may be out of date, and live actions such as attendance check-in need a connection.')}</div>}
        {busy && <div className="live-loading">{t('Loading club data…')}</div>}
        {!busy && view === 'Overview' && <OverviewLive identity={identity} upcoming={upcomingEvents} metrics={dashboardMetrics} onNavigate={setView} onOpenNotifications={() => { setNotificationsOpen(true); void loadNotifications() }} />}
        {!busy && view === 'Calendar' && <CalendarLive events={events} canManage={canEvents} onCreate={() => { setEventToEdit(null); setEventModal(true) }} onEdit={(event) => { setEventToEdit(event); setEventModal(true) }} onCancel={setEventToCancel} onComplete={setEventToComplete} />}
        {!busy && view === 'Members' && <MembersLive profiles={filteredProfiles} roles={memberRoles} search={search} setSearch={setSearch} canManage={canHR || identity.role === 'president' || identity.role === 'vice_president'} canManageRoles={identity.role === 'president'} onInvite={() => setInviteMemberModal(true)} onStartNewTerm={() => setTermHandoverOpen(true)} onChangeStatus={(member, nextStatus) => setStatusMember({ member, nextStatus })} onEdit={setEditMember} onManageRole={(member, nextRole) => setRoleMember({ member, nextRole })} onResetPassword={setPasswordResetMember} onDeleted={() => loadViewData()} />}
        {!busy && view === 'Attendance' && <AttendanceLive events={events} role={identity.role} memberId={identity.id} session={activeSession} token={qrToken} onOpen={startAttendance} onClose={closeAttendance} onScan={() => setScannerOpen(true)} onReview={setAttendanceReviewEvent} />}
        {!busy && view === 'Finance' && <FinanceLive entries={entries} balanceMinor={financeBalanceMinor} reconciliation={reconciliation} closures={periodClosures} financialReconciliations={financialReconciliations} purchaseRequests={purchaseRequests} events={events} profiles={profiles} canManage={canViewFinance} canRecord={canFinance} canDecidePurchase={canDecidePurchase} exporting={exportBusy} onExport={() => void exportFinanceLedger()} onOpenReceipt={setReceiptPreviewPath} onCreate={() => { setPurchaseRequestToPay(null); setMoneyModal(true) }} onDecidePurchase={(request, decision) => setPurchaseRequestToDecide({ request, decision })} onPayPurchase={(request) => { setPurchaseRequestToPay(request); setMoneyModal(true) }} onReverse={setReversalEntry} onGenerate={generatePaymentExpectations} onContributionChanged={async () => { await loadViewData(); notify(t('Finance records refreshed.')) }} onPeriodClosed={async () => { await loadViewData(); notify(t('Financial period closed and recorded in the audit log.')) }} onReconciled={async () => { await loadViewData(); await loadNotifications(); notify(t('Financial reconciliation recorded in the audit log.')) }} />}
        {!busy && view === 'Points' && <PointsLive entries={pointEntries} balances={pointBalances} profiles={profiles} memberId={identity.id} canViewAll={pointsViewers.includes(identity.role)} canManage={canHR} onAdd={() => setPointsModal(true)} />}
        {!busy && view === 'Communications' && <CommunicationsLive section={communicationsSection} onSectionChange={openCommunicationsSection} rows={announcements} ideas={ideas} ideaReviews={ideaReviews} threads={communicationThreads} profiles={profiles} canManage={canComms} canReviewIdeas={canReviewIdeas} canManageInbox={canManageCommunicationInbox} onPublish={() => setAnnouncementModal(true)} onSubmitIdea={() => setIdeaModal(true)} onReviewIdea={setIdeaToReview} onNewCommunication={() => setCommunicationFormOpen(true)} onRefresh={async () => { await loadViewData(); await loadNotifications() }} onNotify={notify} />}
        {!busy && view === 'Logistics' && <LogisticsLive rows={inventory} movements={inventoryMovements} purchaseRequests={purchaseRequests} profiles={profiles} events={events} canManage={canLogistics} canDecidePurchase={canDecidePurchase} onRequestPurchase={() => setPurchaseRequestModal(true)} onDecidePurchase={(request, decision) => setPurchaseRequestToDecide({ request, decision })} onAdd={() => setInventoryModal(true)} onMove={setInventoryMovementItem} />}
        {!busy && view === 'Support' && <SupportLive rows={memberCases} profiles={profiles} canManage={hrCaseManagers.includes(identity.role)} onSubmit={() => setSupportModal(true)} onReview={setCaseToUpdate} />}
        {!busy && view === 'Account' && <AccountLive identity={identity} onChangePassword={() => setPasswordModal(true)} onInstall={() => setInstallGuideOpen(true)} />}
        {!busy && view === 'Tasks' && <TasksLive rows={tasks} identity={identity} canManage={identity.role !== 'member'} onCreate={() => setTaskModal(true)} onStatusChange={changeTaskStatus} onDeleted={() => loadViewData()} />}
      </div>
    </main>
    {eventModal && <EventDialog event={eventToEdit} canSetContribution={canFinance} onClose={() => { setEventModal(false); setEventToEdit(null) }} onSaved={async () => { const wasEdit = Boolean(eventToEdit); setEventModal(false); setEventToEdit(null); await loadEvents(); setView('Calendar'); notify(wasEdit ? t('Event details updated.') : t('Event published to the club calendar.')) }} />}
    {eventToCancel && <CancelEventDialog event={eventToCancel} onClose={() => setEventToCancel(null)} onSaved={async () => { if (activeSession?.event_id === eventToCancel.id) { setActiveSession(null); setQrToken(null) } setEventToCancel(null); await loadEvents(); notify(t('Event cancelled and members notified.')) }} />}
    {eventToComplete && <CompleteEventDialog event={eventToComplete} onClose={() => setEventToComplete(null)} onSaved={async () => { if (activeSession?.event_id === eventToComplete.id) { setActiveSession(null); setQrToken(null) } setEventToComplete(null); await loadEvents(); notify(t('Event completed and attendance finalized.')) }} />}
    {moneyModal && canFinance && <MoneyDialog userId={identity.id} events={events} profiles={profiles} reconciliation={reconciliation} purchaseRequest={purchaseRequestToPay} onClose={() => { setMoneyModal(false); setPurchaseRequestToPay(null) }} onSaved={async () => { const linkedRequest = Boolean(purchaseRequestToPay); setMoneyModal(false); setPurchaseRequestToPay(null); setView('Finance'); await loadViewData(); await loadNotifications(); notify(linkedRequest ? t('Purchase recorded and request marked paid.') : t('Transaction recorded.')) }} />}
    {purchaseRequestModal && canLogistics && <PurchaseRequestDialog events={events} onClose={() => setPurchaseRequestModal(false)} onSaved={async () => { setPurchaseRequestModal(false); await loadViewData(); await loadNotifications(); notify(t('Purchase request sent to Treasury.')) }} />}
    {purchaseRequestToDecide && canDecidePurchase && <PurchaseDecisionDialog request={purchaseRequestToDecide.request} decision={purchaseRequestToDecide.decision} onClose={() => setPurchaseRequestToDecide(null)} onSaved={async () => { setPurchaseRequestToDecide(null); await loadViewData(); await loadNotifications(); notify(t('Purchase request decision recorded and the requester was notified.')) }} />}
    {pointsModal && canHR && <PointsDialog userId={identity.id} profiles={profiles} events={events} onClose={() => setPointsModal(false)} onSaved={async () => { setPointsModal(false); await loadViewData(); notify(t('Points entry recorded.')) }} />}
    {reversalEntry && canFinance && <ReversalDialog userId={identity.id} entry={reversalEntry} onClose={() => setReversalEntry(null)} onSaved={async () => { setReversalEntry(null); await loadViewData(); notify(t('Reversal recorded. The original entry remains in the ledger.')) }} />}
    {receiptPreviewPath && <ReceiptDialog path={receiptPreviewPath} onClose={() => setReceiptPreviewPath(null)} />}
    {announcementModal && canComms && <AnnouncementDialog userId={identity.id} onClose={() => setAnnouncementModal(false)} onSaved={async () => { setAnnouncementModal(false); await loadViewData(); notify(t('Club news published.')) }} />}
    {ideaModal && <IdeaDialog userId={identity.id} onClose={() => setIdeaModal(false)} onSaved={async () => { setIdeaModal(false); await loadViewData(); notify(t('Your idea was sent to the General Secretary.')) }} />}
    {ideaToReview && canReviewIdeas && <ReviewIdeaDialog idea={ideaToReview} onClose={() => setIdeaToReview(null)} onSaved={async () => { setIdeaToReview(null); await loadViewData(); await loadNotifications(); notify(t('Idea review saved and the member was notified.')) }} />}
    {communicationFormOpen && canManageCommunicationInbox && <NewCommunicationDialog userId={identity.id} profiles={profiles} canManage={canManageCommunicationInbox} onClose={() => setCommunicationFormOpen(false)} onSaved={async () => { setCommunicationFormOpen(false); await loadViewData(); await loadNotifications(); notify(t('Message sent.')) }} />}
    {inventoryModal && canLogistics && <InventoryDialog userId={identity.id} onClose={() => setInventoryModal(false)} onSaved={async (itemId, count) => { setInventoryModal(false); if (count > 0) { try { await recordInventoryMovement({ itemId, movementType: 'received', quantity: count, memberId: null, eventId: null, reason: 'Initial stock' }) } catch (cause) { setError(cause instanceof Error ? cause.message : t('Initial stock could not be recorded. The item remains at zero stock.')); await loadViewData() } } else { await loadViewData(); notify(t('Item added to club inventory.')) } }} />}
    {inventoryMovementItem && canLogistics && <InventoryMovementDialog item={inventoryMovementItem} profiles={profiles} events={events} onClose={() => setInventoryMovementItem(null)} onSave={recordInventoryMovement} />}
    {inviteMemberModal && (canHR || identity.role === 'president' || identity.role === 'vice_president') && <InviteMemberDialog onClose={() => setInviteMemberModal(false)} onSaved={async (memberCode, email, temporaryPassword) => { setInviteMemberModal(false); if (temporaryPassword) setTemporaryMemberCredentials({ email, password: temporaryPassword }); await loadViewData(); notify(t('Member {code} activated for in-person onboarding.', { code: memberCode })) }} />}
    {temporaryMemberCredentials && <TemporaryMemberPasswordDialog credentials={temporaryMemberCredentials} onClose={() => setTemporaryMemberCredentials(null)} />}
    {supportModal && <MemberCaseDialog onClose={() => setSupportModal(false)} onSaved={async () => { setSupportModal(false); await loadViewData(); notify(t('Your confidential report was sent to HR.')) }} />}
    {passwordModal && <ChangePasswordDialog email={identity.email} onClose={() => setPasswordModal(false)} onSaved={() => { setPasswordModal(false); notify(t('Your password has been changed.')) }} />}
    {installGuideOpen && <InstallGuideDialog onClose={() => setInstallGuideOpen(false)} />}
    {caseToUpdate && hrCaseManagers.includes(identity.role) && <UpdateMemberCaseDialog item={caseToUpdate} onClose={() => setCaseToUpdate(null)} onSaved={async () => { setCaseToUpdate(null); await loadViewData(); notify(t('HR support case updated.')) }} />}
    {taskModal && identity.role !== 'member' && <TaskDialog profiles={profiles} role={identity.role} onClose={() => setTaskModal(false)} onSaved={async () => { setTaskModal(false); await loadViewData(); notify(t('Task assigned.')) }} />}
    {attendanceReviewEvent && attendanceManagers.includes(identity.role) && <AttendanceReviewDialog event={attendanceReviewEvent} userId={identity.id} onClose={() => setAttendanceReviewEvent(null)} />}
    {statusMember && (canHR || identity.role === 'president' || identity.role === 'vice_president') && <MemberStatusDialog member={statusMember.member} nextStatus={statusMember.nextStatus} onClose={() => setStatusMember(null)} onSaved={async () => { setStatusMember(null); await loadViewData(); notify(t('Member status updated and logged.')) }} />}
    {editMember && (canHR || identity.role === 'president' || identity.role === 'vice_president') && <MemberProfileDialog member={editMember} onClose={() => setEditMember(null)} onSaved={async () => { setEditMember(null); await loadViewData(); notify(t('Member profile updated and logged.')) }} />}
    {roleMember && identity.role === 'president' && <MemberRoleDialog member={roleMember.member} currentRole={memberRoles[roleMember.member.id] ?? 'member'} nextRole={roleMember.nextRole} onClose={() => setRoleMember(null)} onSaved={async () => { setRoleMember(null); await loadViewData(); notify(t('Club role changed and logged.')) }} />}
    {passwordResetMember && memberManagers.includes(identity.role) && <MemberPasswordResetDialog member={passwordResetMember} onClose={() => setPasswordResetMember(null)} onSaved={(email, temporaryPassword) => { setPasswordResetMember(null); setTemporaryMemberCredentials({ email, password: temporaryPassword }); notify(t('Temporary password created. It is shown once.')) }} />}
    {termHandoverOpen && identity.role === 'president' && <StartTermDialog profiles={profiles.filter((profile) => profile.status === 'active')} currentTermName={currentTermName} currentTermEndsOn={currentTermEndsOn} onClose={() => setTermHandoverOpen(false)} onSaved={() => { setTermHandoverOpen(false); window.location.reload() }} />}
    {scannerOpen && <ScannerDialog busy={scanBusy} onClose={() => setScannerOpen(false)} onToken={handleScannedToken} />}
    {notice && <div className="toast"><Check size={16} />{notice}</div>}
  </div>
}
