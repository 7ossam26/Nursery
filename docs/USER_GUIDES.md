# Role-based user guides

Implements R16/U23 for Phase 25. These guides describe the screens, routes and labels that actually exist in the
repository as of Phase 24 (candidate `f108715f20f3d614643c4f92ad8ef61ceeba6459` plus the Phase 24 diff; schema 0023).
Every route below is registered in [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) and gated by `AuthGate`, which
re-checks capability, scope and license state on the server for every request — nothing here is reachable by simply
knowing the URL. Screen titles quoted below are the actual English strings shipped in
`apps/web/src/features/*/copy.ts`; the Egyptian Arabic string sits next to it in the same file and is selected by the
account's saved language (`/account`).

No screenshots are included. Phase 12's screenshot handoff is still unresolved (see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) M24-01) and this documentation phase does not perform browser automation.

## Bilingual and accessibility notes that apply to every role

- Switch language from **Account security** (`/account`); the choice is saved per account and applied through `AuthProvider`.
- Dates are entered through a dedicated dd/MM/yyyy control; amounts show as EGP with Latin digits regardless of language ([UX_AND_BRANDING.md](UX_AND_BRANDING.md)).
- A blocked account (parent or staff) sees: **"Access is unavailable. Please contact the nursery."** (`auth.contactNursery`), or the reason text an administrator entered when blocking, with a **Back to sign in** button (`apps/web/src/features/auth/screens.tsx:24`).
- Once the nursery's subscription passes its grace period every account sees **"Subscription suspended"** / *"The nursery subscription is past its grace period. Normal access is paused. Please contact the nursery or Superadmin support to renew."* (`licensing.suspendedTitle`/`licensing.suspendedBody`, `apps/web/src/features/auth/screens.tsx:25`) instead of the ordinary screen.
- A destination with no permission shows **"You cannot view this section"** / *"Ask the nursery if you think you should have access."* (`state.noPermissionTitle`/`Body`) rather than a bare 404.

## Superadmin

The Superadmin is the installation's one bootstrap (`SYSTEM`) account, created once per deployment through the private-stdin procedure in [AUTHENTICATION.md](AUTHENTICATION.md) (`npm run auth:bootstrap` or the Dokploy terminal command in [OPERATIONS.md](OPERATIONS.md)). Sign in within 24 hours of bootstrap and change the password immediately from `/change-password`.

**Onboarding a new installation**

1. `/administration/settings` ("Nursery settings") — set the nursery name, logo path, contact phone/email, and the semantic brand colors; the screen checks 4.5:1 contrast before saving and every change is audit-logged (`licensing.branding`, `licensing.contrastFail`/`contrastOk`).
2. `/support/licenses` ("Subscriptions, slots, and support") — set subscription start/validity/grace, purchased parent and employee capacities and unit prices (or an agreed override total and reason), and support contact details. This is also where **Provision new accounts** creates the first staff and parent logins (username plus a temporary password shown once, `licensing.temporaryPassword`).
3. `/administration/organization` ("Organization and access") — add branches, classrooms, age groups and custom role names before handing day-to-day work to a nursery admin.
4. `/administration/settings` → **Module availability** — enable/disable finance, learning, transport/activities modules nursery-wide; disabling pauses dependent actions while keeping history, and re-enabling finance requires reviewing a catch-up preview (`licensing.catchupRequired`).

**Ongoing operator tasks** (all on `/support/licenses` unless noted; ordinary financial/teaching work is described under Administration/Finance below)

| Task | Where |
|---|---|
| Renew the subscription / record a manual renewal payment | `/support/licenses` → Subscription status / Record renewal payment |
| Create a staff or parent login | `/support/licenses` → Provision new accounts |
| Reset a password | `/support/operations` → Account lookup → Reset password (re-enter the SYSTEM password; the temporary password is shown once) |
| Block / unblock a parent account | `/support/licenses` → Account lookup → Block parent account / Unblock parent account (optional message shown to the account and an audited reason) |
| Deactivate / reactivate a staff account | `/support/licenses` → Deactivate staff account / Reactivate staff account |
| Release a reserved seat, or restore a released account | `/support/licenses` → Release seat (Superadmin only) / Restore released account — the only way a parent/employee slot is ever freed |
| Check worker health, queues, last backup age, take a manual backup | `/support/operations` |
| Audit search | `/support/operations` → Audit search |

Deployment, upgrade, backup and restore steps are operator actions, not in-app screens; see [OPERATIONS.md](OPERATIONS.md).

## Nursery administration and finance

Signs in as a branch-wide or system-scoped staff account. The left/bottom navigation groups into **Daily work**,
**Finance**, **Nursery management**, and (only with support capabilities) a separately labeled **Support & setup**
group (`apps/web/src/layout/navigation.ts`).

**Onboarding**

1. `/administration/organization` — branches, classrooms, age groups, custom role names, staff assignments (requires organization capabilities; usually set up once by Superadmin or a delegated admin).
2. `/administration/children` ("Children and families") — **Add a family** walks through guardian accounts, child details, and a review step before creating the family, the child record, and (optionally) a bus period in one onboarding flow (`children.onboard`, `transport.onboarding`).
3. `/administration/billing` ("Billing agreements") — save a draft billing arrangement (monthly / fixed-term with installments / one-time or additional), review the stored per-child amount, then approve it. Approving creates the debt; it does not record cash.

**Daily tasks**

| Task | Where |
|---|---|
| Attendance / today's classroom work (admin acting for a classroom) | `/teacher/today` |
| Publish an announcement | `/administration/announcements` |
| Configure checkpoint labels (Present/Absent/N/A-style statuses) | `/administration/checkpoints` |
| View children and open a child's record | `/administration/children`, `/administration/children/:id` |
| Management reports (financial, attendance, exam, custom exports) | `/administration/reports` → choose a report kind, filter, **Create export**, then **Download private file** (PDF/Excel, expires after 24 hours) |
| Excel import (parents/children, opening balances, employees) | `/administration/imports` → download template, upload for a validation preview, then commit |

**Payment and receipt workflow**

1. `/administration/collections` ("Collections and balances") — filter outstanding balances by branch/classroom/category/status/due date; open a child to record a payment against the actual outstanding installments.
2. A successful payment produces a receipt; a payment whose confirmation was lost is safely retried with the same idempotency key rather than double-charged (A18).
3. `/administration/treasury` ("Treasury accounts") — create/view the cash, bank, and wallet accounts that collections and expenses post to. This screen is only reachable to branch-wide/system staff with `finance.read` (`branchWide` guard in `navigation.ts`); classroom-scoped staff never see it.
4. `/administration/expenses` ("Expenses") — record a pending expense, then its actual payment once money leaves the account; pending expenses move no cash.
5. `/administration/transfers` ("Account transfers") — record an already-completed transfer between two treasury accounts (source −, destination +; no income/expense entry).
6. `/administration/closing` ("Daily cash closing") — enter the physical count; the screen reports the difference and never moves cash itself.
7. `/administration/corrections` ("Financial corrections and refunds") — append a reasoned reversal/replacement or an actual refund limited to available source-linked credit, for the current Cairo business date only. Originals stay visible.
8. `/administration/child-transfers` ("Child branch transfers") — move a child and their remaining debt to another branch today; original charges/receipts and prior treasury attribution are unchanged, and this creates no cash movement.

**Bus and trips**

- `/administration/transport` ("Transport and activities") — add bus subscriptions (fee, service period, administrative permission) and create activities/trips; the eligibility rule (active child + current period + full settlement or an explicit zero fee + latest permission) is enforced by the shared ledger, so a partial bus payment is rejected.
- Teachers see the same data filtered to their classroom at `/teacher/activities` (read-mostly roster).

**Payroll**

- `/administration/payroll` ("Employee financials and payroll") — each employee-month keeps its own salary and paying account; advances move cash immediately, and the final payout pays the full remaining amount once. A prior unpaid month stays separately represented rather than being folded into the current one.

**Access control**

- Block/unblock a parent from `/support/licenses` (see Superadmin table above; most nursery admins hold the same capability locally if granted it). Overdue fees alone never block a parent — blocking is always this explicit action, and a blocked parent's session, SSE stream, exports and downloads stop immediately while billing keeps running in the background (A06).

## Teacher

Signs in as a classroom-scoped staff account; the navigation shows only **Today, Learning, Homework, Exams, More**
(`shellRoleFor` assigns the teacher shell to any `STAFF` account whose scope is `CLASSROOM`).

| Task | Where |
|---|---|
| Record attendance for an assigned classroom and date | `/teacher/today` ("Attendance") |
| Review/adjust the classroom's configured checkpoint types (read access) | `/teacher/learning` ("Learning") |
| Publish homework, review individual completion, issue a correction | `/teacher/homework` ("Homework") |
| Record exam results (Present/Absent/N/A/score), reopen a result, correct a published grade | `/teacher/exams` ("Exams") |
| See children selected for an activity/trip in an assigned classroom | `/teacher/activities` |

Only the classrooms actually assigned to the signed-in teacher appear anywhere in these screens (A02); publishing a
checkpoint is immediate and immutable — a correction appends a new reasoned version and keeps the original
(`homework.corrected`, `exams` correction history).

## Parent

Signs in as a guardian account; navigation is **Home (Today), My children, Payments (when permitted), Notifications,
More**. `/` redirects a guardian straight to `/parent/today`.

| Task | Where |
|---|---|
| See today's updates for the selected child (attendance, exam, homework state) | `/parent/today` |
| Switch between children, open a child's ongoing record/history | `/parent/children`, `/parent/children/:id` |
| See permitted balances and payment history | `/parent/payments` — only shown when the account has parent-finance permission (`parentFinance` in `NavigationContext`); otherwise the item is hidden and the route falls back to the no-permission screen |
| Read notices/announcements and acknowledge one that requires it | `/parent/notices`, `/parent/notices/:id` |
| Read notifications | `/parent/notifications` |
| Change password / language | `/account` |

Live updates (a newly published attendance/exam/homework record, a new notice) arrive over the same connection
`ParentLive` maintains in the background; reconnecting after a network drop or a permission change always re-fetches a
fresh, permitted snapshot rather than replaying stale events (A12). If the parent's own access is blocked mid-session,
the in-memory child data and the live connection are cleared before the access message is shown (`UX_AND_BRANDING.md`
"Mandatory UI states").

## What these guides intentionally leave out

No camera feeds, chat, complaints, meal/media tracking, employee attendance/HRM, online payment gateway, or offline
mutation queue exist in V1 (AGENTS.md invariants) — do not describe or promise them to nursery staff. No child
arrival/departure time field exists by design.
