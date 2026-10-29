# BAC Club Management Platform — Project Plan

**Biologists in Action Club (BAC), FST Settat — Hassan I University**  
**Version:** 1.0 · **Date:** October 29, 2026
> **Zero-cost-first implementation decision:** The implementation baseline is an installable Progressive Web App (PWA), not native store apps. Host the static client on Cloudflare Pages using its free `*.pages.dev` address, and use Supabase Free for authentication, PostgreSQL, storage, and server functions within its published quotas. Do not require a paid domain, paid developer account, paid app store listing, credit card, or paid third-party service. See Section 14 for quotas, operational caveats, and the coding-agent handoff. This replaces Flutter/native-store delivery as the MVP implementation path; the core product requirements in earlier sections remain in force.

## 1. Vision

Build a single platform to manage BAC club life: members, meetings and events, QR attendance, contributions and expenses, engagement points, calendar, tasks, news, and notifications. The application must be available on **iOS, Android, Windows, and the Web**, with interfaces adapted to members and club officers.

The system supports the club’s operations and keeps a verifiable record of actions. In the first version, payments are **recorded by the treasurer** (cash, bank transfer, or another method); the application does not process bank payments directly.

## 2. Objectives and success criteria

- A member can view their profile, calendar, tasks, points, and notifications from every platform.
- Attendance at a meeting is recorded by scanning a temporary QR code and then confirmed in the system.
- The treasurer can reconcile expected and received contributions by meeting/event and view an exportable history.
- The HR and vice-HR can manage members, verify/correct attendance with a reason, and award or deduct points with a reason.
- The president has a cross-club view and can access dashboards and audit logs.
- Sensitive actions are attributed to a user and timestamped; corrections do not erase history.
- Officers can distinguish “not recorded,” “absent,” and “present but unpaid”: a missing record must never imply absence or debt.

## 3. Users, roles, and access

The club’s elected/operational roles are the President, Vice President, Communications Officer, Treasurer, Vice Treasurer, HR, Vice HR, General Secretary, Logistics Officer, and Vice Logistics Officer. Regular members have the member role. Officers may also be members. Assign roles by club term/academic year, support role handover, and enforce permissions on the server as well as in the interface.

The **President is responsible for the whole club** and has access to all club modules and dashboards. The **Vice President helps lead and animate the club**, coordinates across teams, and acts as the President’s deputy. Give the Vice President broad operational visibility; sensitive authority changes and final accountability remain with the President.

| Role | Responsibilities and system access |
|---|---|
| **President** | Leads and animates the club; overall responsibility and access to all members, events, attendance, finances, points, tasks, news, logistics, settings, dashboards, and reports. Can review and approve sensitive operations. |
| **Vice President** | Supports the President in leading and coordinating all club teams; broad read and operational access across modules, acts as deputy, and can follow up on cross-team work. Preserve the President’s ultimate responsibility for the club. |
| **Communications Officer** | Main communication link between members and the administration/club leadership. Publishes official member communications and routes questions/feedback to the right officer. Can manage communication announcements and related notifications. |
| **Treasurer / Vice Treasurer** | Manage all money: collect and record contributions for gatherings/events and location/venue costs, record income and expenses, purchase club items, pay purchases, attach receipts, reconcile cash, and prepare financial reports. The Vice Treasurer can perform the Treasurer’s operational work. All transactions require audit history. |
| **HR / Vice HR** | Manage member records and membership status, meeting/event attendance, points based on attendance and participation, and member-related problems/conflicts. Record sensitive interventions with restricted access and a minimal factual audit trail. The Vice HR can perform HR’s operational work. |
| **General Secretary** | Collects and organizes members’ ideas and proposals, prepares/maintains meeting notes and decisions, publishes club news, and maintains the official information/announcement record. Coordinates with the Communications Officer so official messages are consistent. |
| **Logistics Officer / Vice Logistics Officer** | Manage club tools, equipment, and materials: inventory, check-in/check-out, condition, storage, availability, event logistics, and purchase requests. They manage the items and logistics; the Treasurer controls and records the money, purchase payment, and receipt. The Vice Logistics Officer can perform the Logistics Officer’s operational work. |
| **Member** | Views permitted club information, calendar, news, own attendance, own payment/points history, assigned tasks, and notifications; scans the attendance QR code and submits ideas or questions through the appropriate channel. |
| **Technical account owner (non-club role)** | Maintains hosting, secrets, migrations, and account recovery. This is a technical responsibility, not an elected club role; access to member and financial data must be minimized and audited. The President remains the club-level owner of access decisions. |

Role boundaries and approval rules:

- President has cross-module access. Vice President has broad operational access as the deputy. The board should configure any final-approval limits explicitly before launch.
- Treasurer and Vice Treasurer can create, reconcile, correct by reversal, and report financial entries. HR cannot edit the financial ledger; the Treasurer cannot change attendance or points.
- HR and Vice HR can manage attendance and points with a reason on every correction. Sensitive member-problem records are visible only to President and HR roles, not to all officers by default.
- The Communications Officer manages member-facing communications and message delivery. The General Secretary owns collecting ideas, meeting notes, decisions, and publishing official news. Both can coordinate on an announcement without gaining treasury/HR permissions.
- Logistics officers manage inventory and event readiness. Purchase requests may be created by Logistics, but only Treasurer roles record/pay the purchase and attach the financial entry. The President can review both sides.
- Give each vice-role equivalent operational permissions within that team and record which person performed each action. Role assignment changes are made by the President or delegated authorized administrator and are audit-logged.
- Do not create a generic event-lead business role in the MVP. Event access is assigned to the relevant officer/team for that event; club-wide role permissions remain as above.

Simplified permissions matrix (vice roles follow their corresponding role):

| Area | Member | President | Vice President | Communications | Treasurer | HR | General Secretary | Logistics |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| View public club calendar/news | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Manage members and membership status | Own profile | Yes | Yes | No | No | Yes | No | No |
| Attendance and points | View own | Yes | Yes | No | Read attendance only if needed | Yes | No | No |
| Record/reconcile money and expenses | View own | Yes | Oversight | No | Yes | No | No | No |
| Manage communications and member notices | Submit feedback | Yes | Yes | Yes | No | HR notices only | News/official record | Logistics notices only |
| Collect ideas, minutes, publish news | Submit ideas | Yes | Yes | Coordinate | No | No | Yes | No |
| Manage tools/materials inventory | No | Yes | Oversight | No | Purchase/payment record only | No | Yes |
| Assigned tasks | Own tasks | All | Cross-team | Communications | Finance | HR | Secretary/news | Logistics |
| Settings/role assignments | No | Yes | Limited/deputy | No | No | No | No | No |
## 4. Functional modules

### 4.1 Members and club terms

- Create/invite members, approve membership, manage status (applicant, active, suspended, former), study program/year, and useful contact details.
- Member profile with only necessary information, participation history, and past club positions.
- Controlled initial CSV import; duplicate detection; exports subject to permissions.
- Deactivate or archive at the end of a term without deleting financial or audit history.

### 4.2 Meetings, events, and attendance

- Create a meeting or event with date/time, location, description, organizers, category, expected contribution, and applicable rules.
- States: draft, published, in progress, completed, cancelled. Filterable calendar and notifications when details change.
- Server-signed, random QR code that rotates periodically (for example, every 30–60 seconds), is tied to one session, and has a defined attendance window.
- The member must be signed in and scan from their device. The API checks the signature, expiry, eligibility, session, and uniqueness, then returns a clear status.
- Prevent duplicate scans; store server time, member, session, and result. Keep an HR manual-entry fallback with reason and author.
- Attendance states: pending confirmation, present, absent, excused, corrected. QR check-in requires a network connection because a short-lived server challenge cannot be safely validated while offline; if a gathering loses connectivity, HR records a paper roster later as reasoned manual attendance. No offline scan is represented as present or silently queued for server confirmation.
- Do not use geolocation by default. Introduce it only if the club has a genuine need and after a privacy review.

### 4.3 Contributions and cash ledger

- Expected amount per meeting/event (fixed, optional, or set individually according to club rules).
- Treasurer records: member, session, amount, currency (MAD), method, date, receipt/reference, comment, and author.
- Partial payment, overpayment, waiver/discount with reason and approval according to agreed thresholds.
- Calculated status: due, partially paid, paid, waived, needs review. Reconcile by session, period, member, and method.
- Expenses: category, amount, payee, date, receipt, event/project, author, and status (draft, submitted, approved, paid). A person cannot approve their own expense above the agreed threshold.
- Append-only history: reverse/offset an entry instead of deleting a posted transaction. CSV/PDF exports and period closing.
- Receipts may contain sensitive data: private storage, restricted access, and a defined retention period.

### 4.4 Points and engagement

- Configurable scoring rules: attendance, participation, event role, completed task, exceptional contribution.
- Every award/deduction has a value, category, reason, event/task reference, author, date, and optional approver.
- Transaction history; balance is calculated from transactions. No direct editing of a balance.
- Make the rules visible and let members report a possible error.

### 4.5 Calendar, news, tasks, and notifications

- Shared calendar with filters; details are visible according to the target audience.
- News published by officers, with attachments and an audience (everyone, team, event).
- Task fields: title, description, assignee(s), due date, priority, status, linked event, attachments, and comments.
- In-app notifications for everyone; configurable push and email, with an optional digest. Avoid personal or financial details in push previews.
- Member preferences for notification types, language, and time zone.

### 4.6 Dashboard and reports

- President: active members, next activity, recent attendance, engagement, overdue tasks, income/expenses by period, and items awaiting approval.
- HR: membership counts, attendance and absences by session, members to follow up with, and pending corrections.
- Treasurer: expected/received amounts, unpaid records to review, partial payments, submitted expenses, and cash balance based on recorded entries.
- Every report displays its period, filters, and generation time. Exported data is limited to the requester’s permissions.

## 5. Key workflows

### Meeting and QR scan

1. HR creates the meeting, sets the attendance window, and publishes the amount due; the General Secretary/Communications Officer may publish the related member notice.
2. The system publishes it to the calendar and notifies the selected members.
3. HR/vice-HR opens attendance mode; the screen displays a rotating QR code.
4. The member signs in, scans, and receives confirmation. The API creates one unique attendance record.
5. HR monitors statuses and handles exceptions. After closing, HR finalizes the attendance list.
6. The treasurer views attendees and records payments. Attendance and payment remain separate ledgers.
7. The system calculates points according to the scoring rules; officers can correct them with a reason and audit trail.

### Expense

1. Treasurer enters the expense, category, event, amount, and receipt.
2. An expense above a threshold is sent to the president/designated approver.
3. After approval, the treasurer marks it as paid and provides the reference.
4. The transaction appears in the ledger and reports; any correction creates a reversing entry.

## 6. Recommended architecture

### Practical technology choices

> **Implementation decision:** Section 14 defines the current zero-cost-first stack and overrides any earlier native-app assumptions. The MVP is a TypeScript/React/Vite installable PWA hosted on Cloudflare Pages Free, backed by Supabase Free. Do not scaffold Flutter or native iOS/Android/Windows binaries for the MVP.

- **Application: TypeScript + React + Vite PWA** to share the interface across iOS, Android, Windows, and Web without app-store distribution. Isolate camera, notifications, and local storage behind browser-capability checks.
- **Backend: Supabase** (PostgreSQL, Auth, private Storage, Edge Functions, and RLS policies). QR validation and financial writes use transactional server-side functions; never expose a privileged secret in the client.
- **Notifications:** in-app notifications are the MVP source of truth. Add standard Web Push via VAPID as an optional later phase; do not rely on paid push or email providers.
- **Hosting:** Cloudflare Pages Free with the `pages.dev` host name; separate preview and production configurations where available. Follow Section 14's manual backup/restore and free-tier caveats.
- **Observability:** use provider dashboards and privacy-conscious client/server error logging within free quotas; no paid monitoring dependency.

### Logical view

```text
React + TypeScript PWA (iOS Safari / Android Chrome / Windows Edge / Web)
        │ HTTPS, authenticated session, Supabase client + Edge Functions
        ▼
Supabase backend (authentication + database authorization + business rules)
   ├── PostgreSQL: members, events, attendance, ledger, tasks, audit
   ├── Private Storage: receipts and attachments (short-lived signed URLs)
   ├── Server functions: QR, closing, calculations, exports, notifications
   └── External services: push, email, backups, monitoring
```

### Architecture principles

- PostgreSQL is the single source of truth; use transactions and unique constraints to prevent duplicate scans and inconsistent records.
- Use RLS as an additional layer of defense, and verify permissions in every endpoint/function.
- Version the business API; the client never decides permissions or authoritative balances.
- Financial and points operations are immutable entries/reversals. Store timestamps in UTC and display them in the club’s time zone.
- Use idempotency for scans, payments, and notifications to prevent duplicates during network retries.
- Degraded/offline mode must say clearly that live club data may be stale and attendance, finance, and member changes require a connection; use the auditable manual attendance correction flow when connectivity is unavailable.

## 7. Initial data model

- `users`: authentication identifier, preferences, account state.
- `members`: user, BAC identifier, name, minimal contact details, study program/year, status, membership dates.
- `roles`, `role_assignments`: role, member, term, scope, effective dates.
- `events`: type, title, dates, location, audience, status, organizers, contribution rules.
- `attendance_sessions`: event, opening/closing window, QR configuration.
- `attendance_records`: session, member, status, scan time, source, correction author, reason; unique constraint on (session, member).
- `payment_expectations`: member/session, expected amount, discount/waiver and approval.
- `payments`: member, event/session, amount, currency, method, reference, receipt, author, status; linked correcting entries.
- `expenses`, `expense_approvals`: expense and approval steps.
- `point_transactions`: member, delta, reason, source, author, optional approver.
- `tasks`, `task_assignments`, `task_comments`, `announcements`, `attachments`.
- `notifications`, `notification_preferences`.
- `audit_log`: actor, action, object, timestamp, changed fields, reason, and limited technical context.

Store amounts as integer minor units (centimes) with an explicit currency. Physical deletion is reserved for drafts or valid deletion requests; closed ledgers are retained according to a defined policy.

## 8. Security, privacy, and continuity

- Authentication with verified email and a strong password; institutional sign-in if available. Require or strongly recommend MFA for treasury/admin functions.
- Role- and scope-based access control, rapid officer revocation at board turnover, rate limiting, and abuse protection.
- Server-signed QR code, short validity, rotation, session binding, and single-use validation; no URLs containing permanent secrets.
- TLS in transit, hosting-provided encryption at rest, separate secrets, private attachments, encrypted backups.
- Audit changes to roles, members, attendance, points, and finances; review permissions periodically.
- Minimize collected data; define retention and correction/deletion procedures. Before production, verify applicable requirements in Morocco with the University and relevant authorities, especially for personal data and hosting.
- Incident response for compromised accounts, lost devices, document leaks, or accounting errors; daily backups and defined recovery objectives; test restoration before launch.

## 9. UX, brand colors, and accessibility

- French and Arabic from the start (right-to-left layout), with the option to add English; formats for dates and amounts appropriate to Morocco.
- Use the BAC club palette throughout the UI: **green, black, white, and gold**. Suggested design tokens:
  - Primary green: `#166534` for primary buttons, active navigation, and key actions.
  - Deep green: `#14532D` for hover/pressed states and dark green surfaces.
  - Black/near-black: `#111827` for primary text, icons, and headings.
  - White: `#FFFFFF` for page backgrounds and text on dark green.
  - Gold: `#D4AF37` for small highlights, badges, borders, decorative details, and selected emphasis; use near-black text on gold-filled controls. Do not use gold as small text on white.
  - Neutral gray: `#F3F4F6` and `#6B7280` for secondary surfaces and secondary text where contrast remains sufficient.
- Treat these as theme tokens, not one-off values. Keep layouts calm and readable; reserve gold for accents so it does not compete with green primary actions.
- Meet WCAG AA contrast for normal text and controls; check every foreground/background pair. Do not communicate status by color alone—pair colors with labels/icons (for example, “Paid,” “Due,” or “Needs review”).
- Clear, readable interface in bright light, explicit scan/confirmation buttons, and understandable error messages.
- Simple member experience: “Scan,” calendar, tasks, profile, notifications.
- Officer experience: module-based navigation, quick filters, search, and tables usable on small screens and Windows/Web.
- Accessibility: text scaling, screen readers, visible focus states, and keyboard navigation on Web/Windows.

## 10. Delivery plan

### Phase 0 — Decisions and discovery (1–2 weeks)

Confirm member count, contribution/points rules, approval process, payment methods, languages, connectivity at meeting locations, retention policy, and hosting budget. Produce mockups for QR, payment, and correction flows, plus a requirements register.

### Phase 1 — Foundations (2–3 weeks)

Repository, CI/CD, environments, React/Vite responsive PWA theme, authentication, members, roles, audit, database, migrations, backups, and access policies. Prototype the installed PWA in iOS Safari, Android Chrome, Windows Edge, and desktop browsers.

### Phase 2 — Operational MVP (3–5 weeks)

Events/calendar, QR and attendance, HR manual fallback, contributions and payment recording, president/vice-president, communications, treasurer/vice-treasurer, HR/vice-HR, general secretary, logistics/vice-logistics, and member roles, basic dashboard, in-app notifications, CSV exports.

### Phase 3 — Engagement and full finances (2–4 weeks)

Points, tasks, news, expenses/approvals, private receipts, detailed reports, push/email notifications, and import tools. Period-close code is present; deployment and verification remain a release gate.

### Phase 4 — Pilot and launch (2–3 weeks)

Pilot at real meetings, train officers, fix issues, test restoration and security, publish the HTTPS PWA to the free `pages.dev` address, prepare device installation instructions, and hand over to the incoming board.

**Indicative estimate: 10–17 weeks** for a small experienced team, excluding rule gathering and university/club formalities. A smaller MVP can ship sooner by deferring advanced expenses, imports, and optional push features.

### Indicative team

- 1 product owner representing the BAC board.
- 1 part-time product designer.
- 1–2 React/TypeScript developers with PWA experience.
- 1 part-time backend/database developer with PostgreSQL/RLS experience if the frontend team lacks it.
- 1 part-time quality/security specialist; BAC officers handle acceptance and initial data.

## 11. Pre-launch verification

Do not launch before verifying these workflows and rules:

- Deny access to another member’s data and enforce server-side authorization.
- Expired, forged, reused, out-of-session, and duplicate QR scans; intermittent connectivity.
- Resume a queued scan and use the manual appeal/fallback process.
- Partial payment, duplicate payment, cancellation, waiver, rejected expense, and reversing entry.
- Board turnover, archived member, revoked officer, and lost account.
- Export, private receipt links, time zone, Arabic/RTL, and small screens.
- Restore a backup in an isolated environment and ensure logs contain no secrets.

## 12. Decisions for the board

1. Is the amount the same at every meeting, set per event, or variable by member?
2. Does attendance award points automatically? What is the scoring system and appeal process?
3. Who approves waivers, refunds, and expenses, and above what amount?
4. Do former members retain read-only access to their history? For how long?
5. Which address/identifier is used to invite members, and who approves a new membership?
6. Is offline mode needed at meeting locations? Can a signed manual list be used as a fallback?
7. Which languages are priorities at launch: French, Arabic, English?
8. What is the recurring budget, and who takes over technical administration when the board changes?

## 13. Recommended MVP scope

To deliver a reliable tool quickly, start with: sign-in, members and roles, calendar/events, QR attendance, audited HR corrections, expected amount, treasurer payment entry, event statements, basic points, in-app notifications, and a dashboard. Add advanced expenses, tasks, richer news, multi-platform push, and PDF exports afterward.

This separation keeps club rules configurable and lets the team validate the real meeting workflow before investing in secondary features.

## 14. Zero-cost-first implementation plan (coding-agent baseline)

### 14.1 Firm cost and distribution requirements

The project must be usable by members without charging them and must have a deployment path with **$0 recurring service spend**. A zero-cost deployment is a best-effort fit within free plans, not a guarantee of unlimited capacity, uptime, or support. Never enable a paid plan, attach a billing method, buy a domain, create a paid Apple/Google developer membership, or use a feature that can incur charges without explicit approval from the BAC board.

Members install the application as a PWA from a link:

- **iPhone/iPad:** Open the HTTPS link in Safari, tap Share, choose Add to Home Screen, enable Open as Web App, and tap Add. Web Push is available for Home Screen web apps on iOS/iPadOS 16.4 and newer.
- **Android:** Open the link in a supported browser and choose Install app / Add to Home Screen.
- **Windows:** Open the link in Edge or another supported browser and choose Install this site as an app.
- The web app must remain fully usable in the browser if a member does not install it. A PWA is not an App Store native binary.

Apple’s standard Developer Program currently costs $99/year, while web installation does not require it. Apple’s website distribution for native apps is restricted to eligible regions, currently the EU; it is not the distribution route for BAC in Morocco. Sources: [Apple Developer Program pricing](https://developer.apple.com/programs/), [Apple iPhone Home Screen web app instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27), [WebKit: Web Push for Home Screen apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple regional web distribution](https://developer.apple.com/documentation/marketplacekit/distributing-your-app-from-your-website).

### 14.2 Selected $0 stack

| Layer | MVP choice | $0 operating approach | Main constraint |
|---|---|---|---|
| Client | TypeScript + React + Vite PWA | Open-source toolchain; install from browser; one responsive codebase for phone, Windows, and Web | Browser APIs vary; not every native API is available. |
| PWA | Web App Manifest + Service Worker + HTTPS | Cloudflare provides the deployment URL and HTTPS; no store account | iOS users must manually add the app to Home Screen; offline writes are not authoritative. |
| Static hosting | Cloudflare Pages Free | Use the free `project.pages.dev` URL; skip a custom domain | Free-plan limits and service terms apply. Limits include 500 builds/month, one concurrent build, 20-minute build timeout, and 20,000 files/site. |
| Database/Auth/Storage/API | Supabase Free (PostgreSQL, Auth, Storage, Edge Functions, RLS) | One project, no upgrade or billing method | Current free allowances include 500 MB database, 50,000 MAU, 1 GB file storage, 5 GB uncached + 5 GB cached egress, 500,000 Edge Function calls, and 2 million Realtime messages. Free projects may pause after 7 days of low activity; no downloadable database backups are provided on Free. |
| Source control/CI | GitHub Free, private repository | Free private repository and included Actions quota | GitHub Free includes 2,000 Actions minutes/month; public repository Actions are free, but keep finance-related implementation private by default. |
| Push notifications | Standard Web Push (VAPID) through a Supabase Edge Function; in-app notifications always available | No Apple Developer membership or separate push SaaS required | Permission is opt-in; on iOS the PWA must be added to Home Screen and run iOS/iPadOS 16.4+. Implement as a later phase; never make core workflows depend on push. |
| Domain | None purchased | Use Cloudflare’s `pages.dev` hostname | A custom BAC domain costs money unless the club/university already owns one and grants use. |
| Email | No paid email provider in MVP | Use admin-provisioned accounts and in-person activation/recovery; use in-app notifications | Supabase’s built-in email service is not production-ready: it only sends to authorized team addresses and is currently limited to 2 emails/hour. Do not depend on email sign-up, magic links, or password reset until a free SMTP provider is selected and verified or the University supplies one. |
| QR scanning | Browser camera via `getUserMedia` on HTTPS | Native browser capability | Ask camera permission at scan time; offer HR manual attendance entry as fallback. Test on real iOS and Android devices. |

Quotas are a snapshot researched on **October 29, 2026** and can change. Check linked provider documentation during deployment. Sources: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Supabase pricing](https://supabase.com/pricing), [Supabase Free plan/billing limits](https://supabase.com/docs/guides/platform/billing-on-supabase), [Supabase Edge Function quotas](https://supabase.com/docs/guides/functions/pricing), [Supabase email restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [GitHub Free pricing](https://github.com/pricing), [GitHub Actions quotas](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

### 14.3 Cost guardrails

- Keep all accounts on the no-cost tier. Do not add a payment card or enable metered/paid billing for the deployment project.
- Configure project-level usage alerts and review usage monthly. Where a provider cannot hard-cap at $0, do not connect billing; document that quota exhaustion may pause/disable a feature until the next cycle.
- Avoid paid domains, paid email/SMS, maps/geolocation APIs, analytics with a paid threshold, app-store listings, and paid file/image processing.
- Use in-app notification records as the guaranteed notification channel. Push is an optional convenience and should degrade gracefully if permission, browser support, or free quotas are unavailable.
- Keep uploads small and restrict attachments to necessary formats/size. Store receipts privately, not in public buckets; do not upload unnecessary photos or video.
- Provide regular CSV exports for financial review. Supabase Free projects should use the CLI for logical database dumps; those dumps omit Auth users and Storage file contents. [`docs/BACKUP_RESTORE.md`](./docs/BACKUP_RESTORE.md) documents encrypted SQL, identity, and private-receipt recovery steps. This procedure has not been rehearsed: verify a complete restore before recording real funds. If nobody can own backups, do not treat the free cloud setup as the authoritative financial ledger; use an existing University-hosted database/server instead, if available at no charge.
- Do not promise zero costs forever: free tiers and provider terms can change. If a quota is reached, stop optional uploads/push/preview deployments, preserve core records, and ask the board before any paid upgrade.

### 14.4 Authentication approach that works without paid email

- President-designated technical account owner provisions approved member accounts with HR roster approval; public self-sign-up is disabled.
- During MVP, issue accounts using a one-time activation process agreed with the board. Do not share a permanent password in a group chat. Require a personal password on first use, and allow password changes in-app.
- Account recovery is handled by HR after checking identity against the club roster, then the administrator issues a short-lived one-time reset/activation code. Audit the recovery action.
- Never disable email confirmation while allowing arbitrary public sign-up; that would let unverified people create accounts.
- Keep authentication behind Supabase Auth. Keep the service-role key only in protected server-side secrets; never include it in browser code, repository files, CI logs, or screenshots.
- Before broader rollout, verify a legitimate no-cost SMTP option or ask the University to provide an authenticated sending service. Do not build around an unverified free-email quota.

### 14.5 Coding-agent implementation brief

The implementation agent should work in the existing project workspace and deliver code, not just another design document. Treat this plan as the product specification. Implement in vertical slices, preserving all stated role and money rules.

**Build order**

1. Inspect the repository and its instructions. Create a concise technical README, environment variable example containing placeholders only, and deployment guide. Do not commit credentials or real member data.
2. Scaffold a TypeScript/React/Vite responsive PWA with manifest, icons, service worker, install guidance, French and Arabic RTL-ready localization, BAC green/black/white/gold design tokens, keyboard access, and a usable browser fallback.
3. Add Supabase migrations for members, role assignments/terms, events, attendance sessions/records, expected contributions, payments, expenses/approvals, point transactions, tasks, announcements, notifications, and audit log. Add foreign keys, constraints, indexes, RLS policies, and seed data that is clearly fake.
4. Add sign-in and role-aware navigation for member, president, vice president, communications officer, treasurer/vice treasurer, HR/vice HR, general secretary, and logistics/vice logistics. Enforce access in RLS and server functions, not only in UI.
5. Implement member and event management, calendar, QR session opening, rotating signed QR tokens, camera scan, server-side validation, unique attendance, HR manual correction with mandatory reason, and clear scan confirmation.
6. Implement expected contributions and treasurer payment entry with partial payments, correction/reversal trail, private receipt storage, and a reconciliation view. Keep attendance and money records separate.
7. Implement point transaction history, member task assignment/status, news, in-app notifications, and dashboards filtered by permissions.
8. Add CSV exports and a documented manual backup/restore workflow. Add Web Push only after the in-app workflows work; push failure must not lose the notification.
9. Deploy a staging build to a free Cloudflare Pages project and Supabase Free project only after the owner configures secrets. Use `pages.dev`; do not ask for or configure a paid domain, billing card, store account, or paid service.
10. Provide a short handover: local run instructions, Supabase setup/migrations, Cloudflare deployment, platform install steps, quota dashboard locations, known free-tier limits, and admin turnover/recovery checklist.

**Required implementation gates**

- Never treat an unvalidated/offline scan as confirmed attendance. The PWA caches only its public shell; HR may use a paper roster as a fallback and enter verified attendance later with a reason.
- Reject expired, forged, wrong-session, replayed, and duplicate QR submissions; make scan submission idempotent.
- A member can see only their own restricted profile, payments, attendance, points, assigned tasks, and intended club-wide content.
- HR cannot create or change money records; treasurer cannot change attendance/points; president has cross-functional access; every sensitive operation has an audit record.
- No financial balance is directly overwritten. Use immutable payment/point entries and linked correction entries.
- No secrets, real member data, receipts, or production exports in source control.
- Provide a manual attendance and finance workflow if camera, network, push, or free-tier quota is unavailable.
- Test responsive behavior on iOS Safari, Android Chrome, and Windows desktop browsers; test install steps and camera permission on physical phones.

### 14.6 Revised delivery milestones

The existing phases remain useful, but the implementation agent should prioritize a **PWA MVP**. Phase 1 should prove iPhone Home Screen installation, Android installation, Windows browser installation, sign-in, and a camera scan over HTTPS before building advanced modules. Phase 2 should deliver member/event management, QR attendance, HR correction, contribution entry, and audit. Phase 3 adds points, tasks, news, dashboards, exports, and optional web push. Phase 4 pilots at real gatherings, performs backup/restore, and hands off account ownership. Release native App Store/Play Store binaries only if the board later approves the recurring costs and distribution work.

### 14.7 Current repository implementation snapshot

This plan is the specification; it does not mean the application is already production-ready. The workspace currently has a React/Vite PWA shell, BAC green/near-black/white/gold theme, demo preview when no backend is configured, Supabase password sign-in, current-term role lookup, initial schema/RLS/audit migration, and Edge Function scaffolds for attendance session opening, expiring QR token issuance, and check-in.

Live workspace slices currently include President/VP/HR member onboarding by email or verified in-person temporary credentials with forced first-login password change, published event calendar with officer editing and reasoned cancellation; Treasury-only, audited contribution updates with refreshed outstanding expectations, rotating QR attendance and member camera check-in/history, HR attendance roster review/manual corrections with mandatory reasons and retained correction history plus an event-roster CSV export that preserves “Not recorded” as distinct from absence, event-date membership-based attendance summaries by selected date range with audited CSV export, reasoned/audited member profile and status changes, President-only current-term role handovers, treasurer entries with database-enforced MAD-only currency, income/expense directions and exact linked reversals, immutable non-overlapping period-close snapshots that prevent backdated/future-dated transactions, private receipt attachments and permission-scoped viewing, per-event expected/received/due reconciliation plus permission-scoped paginated CSV export, date-filtered income/expense report grouped by transaction type, role-checked finance and attendance report exports logged before download, atomic team-scoped multi-member task assignment with role-scoped officer progress actions, independent member progress and blocked/completion/cancellation notices, database-validated point categories and preference-aware notices created atomically with points ledger entries, reasoned point awards/deductions with a security-invoker balance view, announcements, member ideas, inventory item creation and stock receipt/check-out/return/adjustment movements with an immutable ledger, a private HR support case channel with status and response history, member self-service password changes after current-password verification and an email reset flow pending SMTP configuration, a per-member in-app notification inbox with destination navigation, bulk read, and optional event/news/points preferences, and a role-aware overview of active current-term members, latest attendance measured against the event-date membership roster, recorded balance, inventory items, open tasks, unread notices, and upcoming events where each role’s access permits. Task assignments, points entries, and first publications of member-facing news/events and updates or cancellations of published events create in-app notices for affected members.

Recent platform work adds an age-gated Treasurer cleanup workflow for private receipts, reasoned event completion, team-targeted news, a retained General Secretary idea-review history, and a Logistics purchase-request flow linked to Treasury ledger payments. Migration `202610290023_purchase_requests.sql` adds the purchase workflow. Manual reconciliation records immutable counted cash/bank/card/other snapshots against posted ledger totals by Morocco-local date, and migration `202610290024_financial_reconciliation.sql` adds the secure operation, audit trail, and audited export. A new private member-to-Communications thread workflow supports append-only replies, role-limited access, in-app notices, and reasoned closure; migration `202610290025_member_communications.sql` adds its database protections. Migration `202610290027_attendance_based_contributions.sql` limits event contribution reconciliation to members with attendance marked present and provides an audited Treasurer action to refresh that set after HR records or corrects attendance. Migration `202610290028_guard_attendee_contributions.sql` and the payment form now restrict fixed event contributions to that synchronized attendee set. Migration `202610290029_cap_attendee_payments_to_due.sql` caps each post to the remaining due amount and locks the attendee balance to prevent concurrent overpayment. These workflows have not been deployed or verified against a live Supabase project. Remaining production work includes email recovery configuration and delivery verification, deployment and security review of recent migrations and report queries, optional bank integrations if wanted, privacy/retention controls, and a tested backup/restore procedure. Email invitations still require configuration and verification on a free Supabase/University sender; HR can use the verified in-person temporary credential path when email delivery is unavailable. Dependencies are not installed in this workspace, no build has been verified, and the Supabase migrations/functions have not been deployed or reviewed on a live project. Continue in small vertical slices; do not enter real member or finance data until the security and recovery gates above are complete.




Finance notification slice: migration 202610290030_finance_member_notifications.sql creates an in-app notice for the affected member when their contribution is posted or reversed. Notices route to Finance and do not reveal another member's transactions. They remain enabled regardless of optional event/news/points preferences. This migration is not deployed or verified against a live Supabase project.

Notification integrity slice: migration `202610290031_lock_notification_writes.sql` revokes direct authenticated notice inserts and broad row updates. The client can only change its own notification `read_at` field; notification creation remains inside trusted SECURITY DEFINER database workflows. The migration is not deployed or verified against a live Supabase project.

Attendance window slice: `open-attendance` rejects QR session close times beyond an event’s scheduled end and limits events without an end time to four hours. Migration `202610290032_atomic_attendance_checkin.sql` adds a service-role-only transaction that locks and rechecks the event/session/member before recording a scan, including refreshed token/session timing after lock waits; it rejects inactive and first-login-pending accounts. The updated `check-in` function calls it after authenticating the member JWT. These changes take effect after migration and function deployment and have not been exercised against a live project.

Live data refresh: the currently open screen now silently reloads while visible/online every 60 seconds and on return to the app or network reconnection. This updates member calendars, communications, assignments, and officer views without forcing a page reload; the feature has not been exercised against live Supabase data.

Dashboard attendance accuracy: the metric selects the latest non-draft, non-cancelled event by scheduled date, selects the club term covering its Morocco-local date, and reconstructs each candidate member’s status from HR status history at event time. This avoids a recent cancelled-event backlog hiding earlier attendance and excludes former/suspended members from events after their status changed while keeping them in earlier event rosters.

Membership access gate: migration `202610290033_active_member_access_gate.sql` applies restrictive RLS policies across club tables and requires an active member who completed first-login setup for workspace access and officer-role checks. The shared Edge Function role checker applies the same status gate to service-role operations. The migration preserves only self-scoped profile/role/current-term reads needed to render mandatory password setup. Database access is denied on the next request after suspension; a previously issued signed receipt URL remains usable until its 120-second expiry. Validate active, inactive, and temporary accounts before production; the migration is not deployed.

Term handover: migration `202610290034_start_club_term.sql` and the President-only Members workflow switch to a new club term and assign elected officers atomically, with a reasoned audit record and validation that exactly one active President is assigned. The transition is allowed only after the prior term ends and becomes active immediately; members with suspended/former status or pending first-login setup cannot be elected. Apply the migration and validate handover permissions before the next academic-year transition.
