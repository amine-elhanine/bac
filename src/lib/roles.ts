/**
 * Single client-side source of truth for club roles and the module permission
 * lists. The database remains the authority: every sensitive action is
 * re-checked inside its SECURITY DEFINER function or RLS policy. Keep these
 * lists aligned with the role checks in `supabase/migrations/` when club rules
 * change — a mismatch shows up as a visible button whose server action rejects.
 */

export const ALL_ROLES = [
  'president', 'vice_president', 'communications_officer', 'treasurer', 'vice_treasurer',
  'hr', 'vice_hr', 'general_secretary', 'logistics_officer', 'vice_logistics_officer', 'member',
] as const

export type ClubRole = (typeof ALL_ROLES)[number]

export const ELECTED_OFFICER_ROLES = ALL_ROLES.filter((role) => role !== 'member') as ClubRole[]

/** Highest authority first; AuthGate picks the first role a member currently holds. */
export const ROLE_PRECEDENCE: readonly string[] = ALL_ROLES

/** English display labels; pass through t() so role names follow the active language. */
export const ROLE_LABELS: Record<string, string> = {
  president: 'President', vice_president: 'Vice President', communications_officer: 'Communications Officer',
  treasurer: 'Treasurer', vice_treasurer: 'Vice Treasurer', hr: 'HR', vice_hr: 'Vice HR',
  general_secretary: 'General Secretary', logistics_officer: 'Logistics Officer',
  vice_logistics_officer: 'Vice Logistics Officer', member: 'Member',
}

export const eventManagers = ['president', 'vice_president', 'hr', 'vice_hr']
export const attendanceManagers = ['president', 'vice_president', 'hr', 'vice_hr']
export const financeViewers = ['president', 'vice_president', 'treasurer', 'vice_treasurer']
export const financeManagers = ['president', 'treasurer', 'vice_treasurer']
export const financeDeciders = ['president', 'vice_president', 'treasurer', 'vice_treasurer']
export const hrManagers = ['president', 'hr', 'vice_hr']
export const hrCaseManagers = ['president', 'vice_president', 'hr', 'vice_hr']
export const memberManagers = ['president', 'vice_president', 'hr', 'vice_hr']
export const commsManagers = ['president', 'vice_president', 'communications_officer', 'general_secretary']
export const communicationInboxManagers = ['president', 'vice_president', 'communications_officer']
export const ideaReviewManagers = ['president', 'vice_president', 'general_secretary']
export const logisticsManagers = ['president', 'vice_president', 'logistics_officer', 'vice_logistics_officer']
export const taskOfficers = [
  'president', 'vice_president', 'communications_officer', 'treasurer', 'vice_treasurer',
  'hr', 'vice_hr', 'general_secretary', 'logistics_officer', 'vice_logistics_officer',
]
export const pointsViewers = ['president', 'vice_president', 'hr', 'vice_hr']

/** Database validation error raised when an officer role is already held. */
export const UNIQUE_VIOLATION = '23505'
