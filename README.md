# BAC Club Platform

An installable, responsive Progressive Web App for the Biologists in Action Club. The project follows the zero-cost-first plan in [`PROJECT_PLAN.md`](./PROJECT_PLAN.md): React + TypeScript + Vite, Cloudflare Pages Free, and Supabase Free.

## Development checks

The workspace now runs automated checks locally and in CI:

```sh
npm install
npm run lint    # ESLint (TypeScript + React hooks rules)
npm test        # Vitest unit tests for date, money, and CSV helpers
npm run build   # tsc -b + vite build
```

GitHub Actions runs all three on every push (`.github/workflows/ci.yml`). SQL-side behavior is covered by pgTAP tests in `supabase/tests/` for the financial reversal mirrors, attendance-gated contribution caps, atomic QR check-in, notification write locking, and term handover validation. Run them against a local Supabase project with `supabase test db` (requires Docker). All 16 tests pass locally against the full migration chain (verified 2026-10-31).

The frontend was refactored into `src/live/` modules (one file per workspace view plus shared `datetime`, `csv`, `roles`, and `ui` modules). The interface is available in English, French, and Arabic (right-to-left); the language picker is on the sign-in screen and in **Account**, and date/money formatting follows the selected language. Live updates use Supabase Realtime (migration `202610290035_realtime_workspace.sql` adds the tables to the `supabase_realtime` publication) with the previous 60-second poll kept as a fallback. The demo preview and the QR camera decoder load as separate lazy chunks, so the signed-in bundle is about 45% smaller than before.

## Current state

The app currently contains a responsive BAC interface, PWA install guidance, Supabase Auth sign-in, current-role lookup, and a live workspace. With Supabase configured, President/VP/HR create member accounts in person (email invitation is no longer offered in the UI), handing over a one-time temporary password; event officers can create/edit/cancel published calendar events with reasons and complete ended events with a reason while finalizing attendance; the President and Treasury team manage contribution values and audited expectation adjustments, publish club-wide, officer-wide, or role-team news, open rotating-QR attendance sessions, review and manually correct attendance with a reason, view event-date roster attendance reports for a selected date range and export them with unrecorded members distinguished from absences, manage confidential HR cases, record/reverse finance entries with private PDF/image receipts, generate per-event contribution expectations and review outstanding amounts, route Logistics purchase requests through reasoned officer decisions into linked Treasury payments, record and export manual cash/bank reconciliation snapshots, review date-filtered income/expense totals by transaction type and export the full selected range, close and review completed financial periods, assign tasks within team authority, track per-member progress and receive blocked/completion updates, award/deduct engagement points with a reason, submit/review member ideas with a reasoned status and member-visible note, and manage inventory stock with logged receipts, check-outs, returns, and adjustments. Members can start private, reply-based message threads with the Communications Officer and leadership, who receive in-app notices and can close resolved threads with a note. Point categories are database-validated and the member notice is created in the same transaction as the points entry, respecting point-alert preferences. Finance and attendance exports require role authorization and are logged before downloading. Members can view their profile, permitted calendar, own attendance, assignments and update their task progress, contact HR privately, communications, inventory, points balance/history, and own finance history and attached receipts, submit ideas, scan attendance QR codes, and change their password after confirming the current one. Demo preview uses fictional data only when no Supabase settings are present.

This is an early implementation, not a production release. In-app notifications include task assignment, point changes, first publication of member-facing events/news, and a per-member inbox; members can opt out of optional event, news, and points alerts while task and HR case notifications remain enabled. Members can open notifications to navigate to the relevant BAC section and mark all inbox items read. Members can change their password in-app. Password recovery is in-person: HR, Vice HR, the Vice President, or the President can reset a member's password through an audited, reasoned action that issues a new one-time temporary password shown once and forces the member to set a personal password at next sign-in; the sign-in screen does not offer self-service reset links (the Auth reset-email flow remains available server-side for admin-sent links). Member onboarding is in-person only: the officer creates the member's account, hands over a one-time temporary password shown once, and the member sets a personal password before app access. Email delivery still requires a verified free SMTP sender. Period closing, attendance reports, date-filtered finance reports, and a manual cash/bank reconciliation snapshot are implemented in the UI; the reconciliation records counted balances against posted ledger totals by payment method, but does not connect to a bank or import statements. These workflows depend on migrations that have not been deployed, and none have been verified against a live project. The manual [backup and restore procedure](./docs/BACKUP_RESTORE.md) is documented but has not been rehearsed; do not enter real member or finance records until it has been verified. Member profile, membership status, and current-term role changes use reasoned, restricted server actions and history logs. Browser push notifications are optional future work. The backend schema and Edge Functions have not been deployed or security-reviewed against a live Supabase project.

Supabase schema and row-level policy migrations are in `supabase/migrations/`; apply all migration files in filename order, including `202610290023_purchase_requests.sql` for Logistics-to-Treasury purchase routing, `202610290024_financial_reconciliation.sql` for Treasury balance snapshots, `202610290025_member_communications.sql` for private member conversations, and `202610290026_first_login_password_change.sql` for temporary-password onboarding, plus `202610290027_attendance_based_contributions.sql` so payment expectations include only recorded attendees, and `202610290028_guard_attendee_contributions.sql` to reject fixed event payments for non-attendees, plus `202610290029_cap_attendee_payments_to_due.sql` to prevent duplicate or excess payments, and `202610290030_finance_member_notifications.sql` for private member notices when contributions are posted or reversed. Edge Functions in `supabase/functions/` support attendance, member invites, and secure first-login password changes. Neither the schema nor functions have been deployed to a project.

Migration `202610290031_lock_notification_writes.sql` hardens the inbox: trusted database workflows create notices, while signed-in users can only update the `read_at` field on their own notices. Apply it after migration 030.

Migration `202610290032_atomic_attendance_checkin.sql` moves check-in validation and recording into one database transaction to prevent stale-session/cancellation races. Apply it before deploying the updated `check-in` Edge Function.

Migration `202610290033_active_member_access_gate.sql` makes suspension/former status effective on the next authenticated database request, including existing sessions. Previously issued signed receipt links remain usable until their short expiry (currently 120 seconds). Apply the migration after all current schema migrations.

Migration `202610290034_start_club_term.sql` adds an audited, President-only term handover. It activates a new term and assigns its elected officers in one transaction after the current term has ended; failed assignments leave the prior term active. Apply it after migration 033.

Migration `202610290035_realtime_workspace.sql` adds the notifications, events, tasks, task assignments, and announcements tables to the `supabase_realtime` publication so the open workspace refreshes the moment data changes. Row-level security still applies to each realtime subscriber. Apply it after migration 034.

Migration `202610290037_member_chat_redesign.sql` retargets conversations to a board role (chat cadence, role-holder notifications, closure notes); the latest one, `202610300000_private_board_channels.sql`, makes those conversations strictly private — only the member and the current holder of the targeted board role can read, reply to, or close them (leadership oversight removed) — and `202610300100_communication_chat_realtime.sql` adds the two communication tables to the realtime publication. The Communications screen is now a WhatsApp-style two-pane chat: members see every board member in the list, click one, and send messages there; the board answers in the same view ("Member communication inbox"). Apply the migrations after migration 037.

The workspace address mirrors the open page (`/members`, `/communications`, …) with internal navigation via `history`, so a reload or a shared link restores the same view. Communications is split into three sub-pages with their own addresses — Messages (`/communications`), News (`/communications/news`), and Member ideas (`/communications/ideas`) — Logistics into Purchase requests / Club inventory / Movement history, Finance into Ledger / Contributions / Purchases / Reports, and Attendance into Desk / Reports for officers — and the browser back/forward buttons move between them. Cloudflare Workers serves the app shell for every path through its built-in SPA handling (`wrangler.jsonc`: `assets.not_found_handling = "single-page-application"`), and restricted modules fall back to Overview.

## Roles, permissions, and authorization

Access is permission-based, not hardcoded to role names. A permission catalog (migration `202610300500_detailed_role_permissions.sql`) maps each built-in role to fine-grained keys such as `members.account.manage`, `finance.view`, or `tasks.delete`, and `has_club_permission(key)` / `has_club_role(roles[])` gate every SECURITY DEFINER RPC and row-level policy. The President manages **custom roles** from the Roles & Permissions screen (migration `202610300400_custom_club_roles.sql`): create a named role, pick its permission set, and assign it to a member for the current term. Audit and admin paths recognize exactly one platform claim — `app_metadata.platform_role = 'platform_admin'` — checked first in `has_club_role`, `has_club_permission`, and the Edge Functions' shared `isPlatformAdmin()`.

Notable hardening in `202610300800_authorization_fixes.sql` and `202610310100_scope_and_visibility_fixes.sql`: restrictive active-member policies gate every table; the JWT admin bypass collapsed to the single platform claim; `set_member_role` correctly ends prior officer roles (a PL/pgSQL variable named `current_role` silently collided with the SQL keyword before this); task deletion is scoped to the creator, the responsible team's officer, or leadership — a `tasks.delete` permission alone cannot delete another team's task; permanent event deletion (`delete_event`) is restricted to cancelled/completed events without financial records and is audit-logged; and officer-wide news is visible to officers holding members/finance/logistics visibility, restoring the Communications Officer and Treasury team.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

Vite prints a local URL. For camera APIs and installability, deploy over HTTPS or use `localhost` during local development. The app is usable in a browser and can be installed from supported browsers after deployment.

## Environment

Copy `.env.example` to `.env.local` only when connecting a Supabase project. Fill in the project URL and publishable/anon key. These are public client settings; **never put a Supabase service-role key in `VITE_*`, the browser, source control, or client build.**

`src/AuthGate.tsx` handles sign-in and current-role lookup when Supabase is configured. Live modules use row-level policies and the attendance Edge Functions. The schema and functions are not yet deployed or reviewed against a live Supabase project; do not enter real club data until those steps, dependency installation, and an access/backup review are complete.

## Install on devices

- iPhone/iPad: open the HTTPS URL in Safari → Share → Add to Home Screen → enable Open as Web App → Add.
- Android: open in a supported browser → browser menu → Install app / Add to Home Screen.
- Windows: open in Edge → app/install icon in the address bar or menu → Install.

When a supported Android or Windows browser exposes its install prompt, the in-app install guide offers an **Install BAC** button that opens the browser’s native prompt. iPhone/iPad users continue through Safari’s Share menu; iOS does not use the Android/Windows prompt.

The service worker keeps only the public app shell available for offline launch. Member records, notifications, finance data, and QR check-ins require an internet connection; the live workspace displays an offline notice when the device loses network access. Offline attendance is not queued for later, to avoid silently recording a late check-in. While online, HR can download a paper sign-in roster and Treasury can download an event cash collection sheet. During an outage, record attendance and any approved amount adjustments on paper; after reconnecting, HR records verified attendance with a reason and Treasury reconciles the sheet against that roster before posting each payment. Treat exported collection sheets as private member/finance data.

The currently open live screen refreshes quietly once per minute while the app is visible and online, and when a member returns to the app or reconnects. Notifications refresh independently. This keeps calendar, news, tasks, and club records current without requiring a full page reload.

Members and officers can download an individual calendar event as an `.ics` file from the club calendar to add it to a phone or desktop calendar. Times are exported in UTC so calendar apps display them in the device’s local time zone.

Signed-in members can open **Account → Install guide** for device-specific steps. iOS installation is through Safari’s Add to Home Screen flow; Android and Windows use the browser’s install menu when supported.

## Project files

- `src/live/`: the live workspace, split one module per view (`MembersView`, `AttendanceView`, `FinanceView`, …) with the shell in `live/LiveWorkspace.tsx`; shared date/time/money formatting in `live/datetime.ts`, translations in `src/i18n/`.
- `src/lib/`: Supabase client, attendance Edge Function calls, PWA install state, role constants (`lib/roles.ts`), and CSV export helpers (`lib/csv.ts`).
- `src/App.tsx`, `src/styles.css`: demo preview interface (lazy-loaded) and BAC theme.
- `public/bac-logo.png`, `public/bac-icon-*.png`, `public/apple-touch-icon.png`: supplied BAC artwork and generated platform icon sizes.
- `public/manifest.webmanifest`, `public/sw.js`: PWA metadata and static-shell caching for the current icon set.
- `supabase/migrations/`: database schema and access policy changes.
- `supabase/tests/`: pgTAP tests for the critical database functions.
- `.github/workflows/ci.yml`: lint, unit tests, and build on every push.
- `.env.example`: placeholder environment variable names only.
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md): free-tier setup and deployment guardrails.
- [`docs/INITIAL_SETUP.sql`](./docs/INITIAL_SETUP.sql): guarded placeholder template for the first club term and President account; replace values only in the private Supabase SQL editor.

## Cost and data safeguards

No billing account, paid plan, custom domain, App Store membership, or paid messaging service is part of the MVP. Free tiers have quotas and can change; Supabase Free projects can pause and do not provide downloadable managed backups. See Section 14 of the plan. Use only fake data until a controlled pilot, access review, and encrypted backup/restore process are in place.
