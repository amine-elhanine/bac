export type LiveEvent = {
  id: string; title: string; description: string; event_type: string; starts_at: string; ends_at: string | null
  location: string | null; status: string; expected_contribution_minor: number; currency: string
  cancellation_reason: string | null; attendance_sessions?: { id: string }[]
}
export type Profile = { id: string; member_code: string; full_name: string; email: string | null; phone_number: string | null; study_program: string | null; cohort: string | null; status: string }
export type ClubRoleDefinition = { role_key: string; display_name: string; permission_roles: string[]; permissions: string[]; is_custom: boolean }
export type ClubPermissionDefinition = { permission_key: string; module_name: string; display_name: string; description: string; built_in_roles: string[] }
export type ProfileHistory = { id: string; summary: string; reason: string; changed_by: string; actor_name: string; created_at: string }
export type MoneyEntry = {
  id: string; transaction_type: string; amount_minor: number; direction: string; currency: string
  description: string; created_at: string; status: string; event_id: string | null; member_id: string | null
  reverses_transaction_id: string | null; purchase_request_id: string | null; receipt_path: string | null
}
export type FinancialPeriodClosure = {
  id: string; start_date: string; end_date: string; transaction_count: number; income_minor: number
  expenses_minor: number; net_minor: number; reason: string; closed_by: string; closed_at: string
}
export type FinancialReconciliation = {
  id: string; as_of_date: string; payment_method: string; transaction_count: number; ledger_balance_minor: number
  actual_balance_minor: number; variance_minor: number; reason: string; reconciled_by: string; reconciled_at: string
}
export type PaymentReconciliationRow = {
  event_id: string; member_id: string; expected_minor: number; waiver_minor: number; waiver_reason: string | null
  received_minor: number; due_minor: number; payment_status: string
}
export type Announcement = { id: string; title: string; body: string; audience: string; target_team: string | null; published_at: string | null; created_at: string }
export type MemberIdea = { id: string; title: string; description: string; status: string; submitted_by: string; review_note: string; reviewed_at: string | null; created_at: string }
export type MemberIdeaReview = { id: string; idea_id: string; previous_status: string; new_status: string; review_note: string; changed_by: string; created_at: string }
export type CommunicationMessage = { id: string; thread_id: string; sender_id: string; sender_side: 'member' | 'club_team'; body: string; created_at: string }
/** The three sub-pages of the Communications module. */
export type CommunicationsSection = 'messages' | 'news' | 'ideas'
export type LogisticsSection = 'requests' | 'inventory' | 'movements'
export type FinanceSection = 'ledger' | 'contributions' | 'purchases' | 'reports'
export type AttendanceSection = 'desk' | 'reports'
export type CommunicationThread = {
  id: string; member_id: string; subject: string; status: 'open' | 'awaiting_member' | 'closed'
  target_role?: string | null; closure_note: string | null; created_at: string; updated_at: string; messages: CommunicationMessage[]
}
export type InventoryItem = { id: string; name: string; category: string; quantity: number; condition: string; storage_location: string | null }
export type PurchaseRequest = {
  id: string; item_description: string; category: string; quantity: number; estimated_amount_minor: number | null
  reason: string; event_id: string | null; requested_by: string; status: string; decision_note: string | null
  reviewed_by: string | null; reviewed_at: string | null; paid_transaction_id: string | null; created_at: string
}
export type InventoryMovement = { id: string; item_id: string; member_id: string | null; event_id: string | null; quantity: number; movement_type: string; reason: string; created_by: string; created_at: string }
export type ClubTask = {
  id: string; title: string; description: string; team: string | null; priority: string; status: string
  due_at: string | null; created_by?: string; task_assignments: { member_id: string; status: string }[]
}
export type ClubNotification = { id: string; title: string; body: string; category: string; target_path: string | null; read_at: string | null; created_at: string }
export type PointEntry = { id: string; member_id: string; event_id: string | null; points_delta: number; category: string; reason: string; created_by: string; created_at: string }
export type PointBalance = { member_id: string; points_balance: number }
export type DashboardMetrics = {
  openTasks: number; unreadNotifications: number; activeMembers: number | null; balanceMinor: number | null
  inventoryItems: number | null; attendanceRate: number | null; attendanceDetail: string | null
}
export type MemberCase = {
  id: string; submitted_by: string; title: string; description: string; people_involved: string
  status: string; response: string; created_at: string; updated_at: string
}
export type AttendanceCorrection = { id: string; member_id: string; previous_status: string | null; new_status: string; reason: string; changed_by: string; created_at: string }
export type MemberAttendance = {
  id: string; status: string; source: string; checked_in_at: string | null; correction_reason: string | null
  attendance_sessions: { events: { title: string; starts_at: string } }
}
export type LiveView = 'Overview' | 'Members' | 'Attendance' | 'Finance' | 'Points' | 'Calendar' | 'Tasks' | 'Communications' | 'Logistics' | 'Support' | 'Roles & Permissions' | 'Account'
