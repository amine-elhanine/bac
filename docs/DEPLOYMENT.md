# Free-tier setup and deployment

This guide is deliberately restricted to no-cost plans. **Do not add a payment method, enable paid billing, buy a domain, or choose a paid feature.** If a console asks for billing details, stop and use the free alternative or ask the BAC board.

## 1. Local development

1. Install Node.js 20+ and npm.
2. In the repository folder run `npm install`, then `npm run dev`.
3. Run the automated checks before pushing: `npm run lint`, `npm test`, and `npm run build`. CI runs all three on every push.
4. Use sample data only. Do not put member records, receipts, credentials, or production exports in this repository.

### Database tests (pgTAP)

`supabase/tests/` contains pgTAP suites covering the financial reversal mirrors, the attendance-gated contribution caps, the atomic QR check-in, the notification write lock, and term handover validation. They require the Supabase CLI and Docker:

```sh
supabase start          # local stack with migrations applied
supabase test db        # runs every supabase/tests/*.test.sql
```

These suites have been executed locally against the full migration chain — all 16 tests pass (verified 2026-10-31, Supabase CLI 2.122.0). Re-run them after any new migration.

## 2. Supabase Free project

1. Create one Supabase project on the Free plan and do not attach a billing method.
2. Apply every SQL file in `supabase/migrations/` in filename order. This includes the initial schema, inventory-movement, publication-notification, roster role-visibility, private financial-receipt, atomic task-assignment, per-assignee progress, confidential HR case, current-term payment-roster, notification-preferences, event-attendance schedule-lock, published-event update notice, financial-ledger integrity, event cancellation/contribution workflow, audited report-export, point-category/atomic-notification, financial-period-closing, role-scoped task-progress, aged orphan-receipt cleanup, reasoned event-completion, team-audience announcement, member-idea review, Logistics-to-Treasury purchase-request, manual financial-reconciliation, private member-communications, first-login-password-change, attendance-based-contribution, attendee-payment-guard, payment-balance-cap, member finance-notification, notification write lock, atomic attendance check-in, active member access gate, term handover, and realtime workspace migrations. Review each migration first. When using the Supabase CLI, `supabase db push` applies all pending migrations after `supabase link`.

Migration `202610290031_lock_notification_writes.sql` must follow the finance-notification migration. It removes direct authenticated notification insertion and limits member updates to their own `read_at` marker; the trusted database workflows continue creating notices through privileged functions.

Migration `202610290032_atomic_attendance_checkin.sql` must be applied before deploying the updated `check-in` function. It grants the RPC only to `service_role`; the Edge Function validates the member JWT before calling it. The transaction rechecks token expiry and event/session state after acquiring locks and locks the member profile through the attendance insert, rejecting inactive and first-login-pending accounts.

Migration `202610290033_active_member_access_gate.sql` should be applied after all current schema migrations. It adds restrictive membership/workspace policies across club tables and makes officer role checks require an active member who has completed first-login password setup. Shared Edge Function role checks enforce the same profile status. The sign-in flow retains only the self-scoped profile, role, and current-term reads needed to render mandatory password setup. Confirm active officer access, suspended/former denial on the next database request, and temporary-account isolation before entering real data. A signed receipt URL issued before suspension remains a bearer link until its 120-second expiry.

Migration `202610290034_start_club_term.sql` should be applied after 033. From Members, the current President can create the next term and assign its officer roles once the prior term has ended. The operation requires one President, active members, unique role/member assignments, a reason, and explicit confirmation; it changes the active term immediately and is audited.

Later migrations to be aware of when pushing to an existing project:

- `202610300400_custom_club_roles.sql` + `202610300500_detailed_role_permissions.sql` add custom roles and the permission catalog. After applying, re-deploy every Edge Function (they read `club_roles.permissions`).
- `202610300800_authorization_fixes.sql` restores policies dropped by the 0600 rework, collapses the platform-admin bypass to the single `app_metadata.platform_role = 'platform_admin'` claim, and fixes `set_member_role` (a PL/pgSQL variable named `current_role` collided with the SQL keyword, so officer roles were never ended since migration 001). If production ran the earlier migrations, run this diagnostic first and then resolve any dual-role members before assigning new roles:
  `select mp.member_code, mp.full_name, ra.role, ra.term_id from role_assignments ra join member_profiles mp on mp.id = ra.member_id join club_terms t on t.id = ra.term_id where t.is_current and ra.role <> 'member' order by ra.member_id, ra.role;`
- `202610310000_delete_event.sql` adds permanent event deletion (cancelled/completed events without financial records only, reasoned and audited).
- `202610310100_scope_and_visibility_fixes.sql` scopes task deletion to the creator, the responsible team's officer, or leadership, and restores officer-wide news access for the Communications Officer and Treasury team.
3. Create and confirm the first President’s Auth account through the dashboard. Then use [`INITIAL_SETUP.sql`](./INITIAL_SETUP.sql) as a placeholder-only template to create the initial club term, President profile, role assignment, and bootstrap audit entries. Replace values only in a private SQL editor copy, never in source control. Run it after all migrations, and first practice with a separate test account/project; invitations need an existing current-term President/VP/HR role.
4. Keep public self-registration disabled. If free University SMTP is unavailable, HR can activate a verified member in person and hand over a one-time temporary password; the app forces the member to replace it before access. If a member forgets their password, HR, Vice HR, the Vice President, or the President can reset it in person through the Members screen; the reset is reasoned and audited, the new one-time temporary password is shown once, and the member must set a personal password at next sign-in. Do not send temporary credentials in a public group chat.
5. Add only the project URL and publishable/anon key to local `.env.local` or Cloudflare’s public build variables. Never expose the service-role key. It is not needed by the browser. Configure Supabase Auth redirect allow-lists for the deployed HTTPS address and verify password-recovery delivery through a free University SMTP provider or another board-approved free sender before relying on email recovery.
6. Check RLS behavior with separate member/officer test accounts before entering real data. Run role changes and finance operations with audit review.
7. Follow [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md) to schedule encrypted Supabase CLI dumps on BAC-controlled equipment or existing University storage, separately preserve Auth identities and receipt files, and rehearse a restore before recording real funds. Keep receipt storage within the active free quota and periodically verify private-object access and retention.

### Attendance Edge Functions

The repo includes `open-attendance`, `qr-token`, `check-in`, `invite-member`, `complete-initial-password`, `reset-member-password`, and `delete-member`. Deploy only after all migrations are applied and test accounts/roles exist:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy open-attendance
supabase functions deploy qr-token
supabase functions deploy check-in
supabase functions deploy invite-member
supabase functions deploy complete-initial-password
supabase functions deploy reset-member-password
supabase functions deploy delete-member
```

All seven functions verify the caller's JWT and authorize through the shared `_shared/http.ts` helpers, which check the single `app_metadata.platform_role = 'platform_admin'` platform claim first and then the caller's permission keys (`members.account.manage` for `invite-member`, `reset-member-password`, and `delete-member`).

The functions require a valid Supabase user JWT. Supabase's Edge runtime supplies the project URL and server keys; if the dashboard/CLI asks you to configure secrets, set them only as Edge Function secrets. Never put `SUPABASE_SERVICE_ROLE_KEY` into `.env.local`, `VITE_*`, a browser, GitHub source, or a public build. The QR challenge table has RLS enabled and deliberately has no authenticated client policies. The server stores only a hash of each short-lived token; the raw token is returned to the authorized HR screen for rendering.

`invite-member` lets only President, Vice President, HR, and Vice HR create accepted member accounts. The Members dialog uses the in-person manual activation path that creates a confirmed account with a cryptographically random temporary password; the function also retains an email-invitation path for when a verified SMTP sender is configured later. HR must verify the person before choosing manual activation, deliver the credential directly, and ensure the member replaces it on first sign-in. The password is returned once to the officer’s browser, is not stored in the profile or application logs, and is not recoverable from the app after the dialog is closed. Deploy `complete-initial-password` with JWT verification enabled; it changes the Auth password server-side and clears the member’s first-login gate only after the password update succeeds. `reset-member-password` serves the same in-person recovery when a member forgets their password: President, Vice President, HR, and Vice HR replace a member’s password with a one-time temporary value, re-arm the first-login gate, and write a reasoned entry to the audit log; the action is verified end-to-end locally (unauthorized members are rejected with 403, the previous password stops working, and the new temporary password signs in only through the forced setup screen). Note that resetting a password does not force-sign-out sessions that are already open on other devices. Configure Supabase Auth’s Site URL and allowed redirect URLs to include the deployed HTTPS PWA address before testing email invitations. Supabase’s default email sender has strict limits; use a University-provided SMTP service if available.

The authenticated sign-in, QR rendering/scanning, and a short-lived QR refresh throttle are implemented. QR issuance opportunistically deletes expired token rows before writing a new token; this does not require a separate cleanup policy, but rows can remain until the next QR is issued. Check-in rejects expired tokens regardless of cleanup. Exercise attendance with President/HR, ordinary member, expired-token, wrong-session, and repeated-scan accounts before live use. Exercise email and manual member onboarding with duplicate email/member code, missing current term, authorized and unauthorized roles, successful/failed first-password change, and email redirect configuration. Confirm the temporary credential is shown only once and that a manual account cannot enter the workspace before replacing it. For each event contribution, confirm the Treasurer’s reconciliation includes only members with attendance recorded as Present; after an HR correction, use “Sync attendees” and confirm absent members no longer have an outstanding amount. Confirm a second or over-balance payment is rejected, and a partial payment reduces the selectable balance.

The `open-attendance` Edge Function rejects close times after the event’s scheduled end; if an event has no scheduled end, the session is capped at four hours. The QR issuance function rechecks event status and scheduled end time, while the updated check-in function validates event/session/member state and records attendance atomically. Keep event end times accurate and redeploy all three attendance functions after changes.

The application’s database client is initialized in `src/lib/supabase.ts`. `src/AuthGate.tsx` supports password sign-in, profile/current-role lookup, and the forced first-login password setup. The live workspace currently includes member invitations, event creation/editing, reasoned cancellation with automatic session closure, Treasury-controlled contribution setting and audited expectation updates, attendance QR sessions and member check-in/history, HR attendance roster review/manual corrections with reasons, event-date membership-based attendance summaries by selected date range, and CSV exports that distinguish “Not recorded” from absence, audited member status/profile/current-term role changes, a confidential HR case channel, finance entry/reversal with database-enforced direction, MAD-only currency, and mirror checks, immutable close-period snapshots that prevent backdated transactions, private PDF/image receipt upload and permission-scoped viewing, date-filtered income/expense totals grouped by transaction type with an audited range CSV, paginated finance ledger CSV export, event contribution reconciliation, manual counted cash/bank/card/other reconciliation snapshots against posted ledger totals, Logistics purchase requests and linked Treasury payments, atomic multi-member task assignment with team-scoped officer updates, per-assignee progress, and in-app notices for assignment, cancellation, blocked work, or completion, points awards/deductions with database-validated categories and transactionally generated preference-aware member notices, club news, member ideas, and inventory creation plus immutable receipt/check-out/return/adjustment movements with stock enforcement. Finance and attendance CSV downloads write a permission-checked report-export entry to the President-visible audit log before the data is downloaded. Member-facing event and news first publications create durable in-app notices; event detail changes respect event preferences, while cancellations always notify members. Members can change passwords after confirming the current password and manage optional event/news/points notice preferences. Password recovery is in-person: HR, Vice HR, the Vice President, or the President resets the member's password through the reasoned, audited action (see `reset-member-password`); the sign-in screen does not offer self-service reset links, and the Auth reset-email flow remains available only for admin-sent links, which require verified SMTP delivery and an allowed redirect URL. Cash/bank reconciliation is a manual snapshot only; no bank API or statement import is included. The UI does not fall back to sample records after a live sign-in.

## 2b. Alternative: Cloudflare Workers static assets

Cloudflare's dashboard may offer the newer **Workers** flow (Git-connected Worker) instead of Pages. It is equally free and works with this project, with two differences:

- The SPA fallback comes from `wrangler.jsonc` (`assets.not_found_handling: "single-page-application"`), not from `public/_redirects`. A `_redirects` file must NOT be present — the Workers asset pipeline rejects `/* /index.html 200` as an infinite loop.
- Build-time variables (the two `VITE_` values) are set in Worker → Settings → Variables and Secrets, and are read during the build.

**Never use “Retry deployment” to pick up a fix.** Workers Builds retries the same commit with its cached build output, so a failed deployment keeps replaying the broken bundle even after `main` moves on. Trigger a build from the new commit instead (push again, or use “Deploy latest commit”). If the Git build stays stuck, deploy from the `deploy.yml` GitHub Actions workflow, which builds the exact pushed commit and needs the repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.

## 3. Cloudflare Pages Free

1. Push the private repository to GitHub Free.
2. In Cloudflare Pages, create a Pages project connected to that repository and select the Vite build preset (or configure build command `npm run build` and output directory `dist`).
3. Deploy to the free `*.pages.dev` address. Do not add a custom domain.
4. Configure only public Supabase URL/key variables if and when the app’s backend integration is ready.
5. Keep deployment within the published Free plan. The current Pages documentation lists build limits; review them before relying on the deployment for a live gathering.

## 4. GitHub and secrets

- Keep the source repository private by default. Do not commit `.env.local`, production data, storage receipts, or exports.
- GitHub Actions may build the app within its free monthly allowance. Avoid publishing secrets in build logs or artifacts.
- Do not configure a card or billing escalation for quota overages. Free-tier quota exhaustion should stop the affected optional feature without risking unexpected spend.

## 5. Rollout checklist

- Test the install flow on physical iPhone/Safari, Android/Chrome, and Windows/Edge devices, including the signed-in Account → Install guide and standalone relaunch.
- Verify that an offline launch serves the app shell without substituting HTML for missing scripts/styles, and confirm the live app clearly warns that member data and attendance check-in require a network connection.
- Verify HTTPS camera permission and the attendance fallback before a real gathering.
- Download an event `.ics` file from the member calendar and import it on iOS, Android, and Windows; confirm start/end times, location, Unicode event text, and cancellation status display correctly in each calendar app.
- As HR, download a paper roster for an upcoming event before creating an attendance session; confirm it includes only the event-date roster and has blank sign-in/status fields. Use it during a simulated network outage, then enter verified outcomes as reasoned manual attendance records after reconnecting.
- As Treasury, download the paper cash collection sheet before an event; confirm only active members are listed, synced attendees show their prior payments and remaining due, and paper-entry fields are blank. During an outage, record collections on paper, then compare against HR’s verified attendance and approved adjustments before posting individual ledger entries; protect the exported file as private finance data.
- Confirm each account has only its intended role and RLS boundaries.
- Verify new-term handover with the current President and an unauthorized officer: reject future/overlapping dates, a missing or duplicate President, duplicate role/member assignments, inactive or first-login-pending officers, and missing reasons; on success, confirm the previous term becomes inactive, all selected roles belong to the new term, access reflects the new assignments after reload, and the audit trail records the handover.
- Verify task permissions with President, Vice President, each team’s officer, an officer from a different team, and an ordinary member. Confirm team officers can manage only their own team’s tasks, assignees can change only their own progress, and blocked/completed/cancelled updates create the intended in-app notices.
- Verify period closing with Treasurer, Vice Treasurer, President, and unauthorized accounts; reject open/future dates, overlapping closes, non-MAD entries, and backdated writes, then compare the frozen totals with the ledger.
- Verify event completion with President/HR and unauthorized accounts; completion must be rejected before the scheduled end and must finalize any existing attendance session while recording the reason in the audit log.
- Verify announcements as a regular member, each officer team, and an unrelated team; members must see only club-wide posts while targeted posts and their optional news alerts are limited to the selected audience.
- Verify idea review transitions with a member, General Secretary, President, and unauthorized officer; notes/status must be visible to the submitter, history retained, and member notification written atomically with each review.
- Verify purchase requests with Logistics, President/VP, Treasury, and ordinary member accounts: logistics requests and estimate should reach the responsible officers; approve/decline requires a note; only an approved request can be linked to an outgoing posted purchase entry; the transaction should mark it paid atomically; unauthorized members must not read other members’ requests or decide/pay requests.
- Verify manual financial reconciliation with President, Treasurer, Vice Treasurer, Vice President, and ordinary member accounts: the ledger snapshot should include only posted transactions through the selected Morocco-local date and selected payment method; actual minus ledger must equal the stored variance; future dates, invalid methods, and unauthorized writes must be rejected; snapshots must remain immutable and visible only to Finance officers. This is a manual comparison and does not connect to a bank API or import statements.
- Verify reconciliation CSV export with Finance and non-Finance accounts: export must be audited before the download, include every visible snapshot across pages, and reject unauthorized report types or roles.
- Verify member communications with an ordinary member, Communications Officer, President, Vice President, General Secretary, unrelated officer, and inactive account: only the member and Communications leadership can read a thread; member and officer messages alternate, each side receives an in-app notice, closure requires a reason, messages cannot be edited/deleted, and unrelated officers cannot read or reply.
- Verify receipt cleanup with President/Treasurer, an unauthorized role, a linked receipt, an upload younger than 24 hours, and an aged unlinked upload; only the last case should be discoverable and removable, with an audit entry.
- Follow [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md), rehearse a database/Auth/receipt restore into a separate project, export a ledger snapshot, and make a recovery owner known to the board.
- Train the incoming officers to transfer platform ownership at board turnover.
- Start with a small pilot and fictional/test records. Only use real member/payment data after the board approves privacy, backup, access, and retention procedures.
