# Decisions and explicit defaults

Baseline 2026-09-13. U = explicit user decision; D = engineering/product default chosen to make implementation deterministic. Defaults are reviewable and are not claimed to have been individually answered by the user. A later user change supersedes this file and must be logged.

## Confirmed decisions

| ID | Decision |
|---|---|
| U01 | Separate nursery deployments, each with local Superadmin; shared branch feature availability |
| U02 | Dynamic roles; staff branch scope and teacher classroom scope; multiple assignments |
| U03 | Username/password; recovery through Superadmin; admin can block parents |
| U04 | Independent parent/employee reserved-slot counters; only Superadmin explicitly releases slots |
| U05 | Monthly/yearly platform subscription, manually managed, with grace and renewal warning |
| U06 | English docs/code; English and Egyptian Arabic UI; EGP; simple responsive PWA |
| U07 | Superadmin-customizable theme using the supplied pink/peach/yellow palette |
| U08 | Parent/child onboarding, generic documents, multiple guardians and children |
| U09 | Live daily checkpoints; configurable statuses; defaults Attendance/Exam/Homework |
| U10 | Additional checkpoints use status plus optional note; no generic field builder |
| U11 | Teachers publish and track individual homework completion; parents view |
| U12 | Exams have name, subject, type, grade, optional comment |
| U13 | Published records retained; teachers can issue reasoned corrections |
| U14 | Three billing arrangements: recurring monthly, fixed term/year installments, separate additional charge |
| U15 | Agreed family tuition entered manually; final tuition split equally among included children |
| U16 | External collection recorded in app; bus charges require full payment |
| U17 | Outstanding debt follows a child across branches; old receipts remain at source |
| U18 | Fixed monthly employee salary; advances/deductions; full final payout; no automatic cross-month carry |
| U19 | Health notes/allergies/emergency contacts only; pickup name/phone/relationship and guardian confirmation call |
| U20 | In-app notifications and WhatsApp chat links; trips paid/permission recorded by staff |
| U21 | Initial imports: parents/children, opening unpaid child balances, employees/salaries |
| U22 | Complaints removed entirely; other exclusions are listed in R17 |
| U23 | Implement via separate phase files and per-phase prompts with model guidance and durable handoffs |
| U24 | All phase verification uses repository script test files only; do not use Playwright or browser automation unless the user explicitly reverses this instruction. |

## Defaults that make the plan executable

| ID | Default and reason |
|---|---|
| D01 | TypeScript modular monolith: Node 24 LTS, React 19/Vite, Fastify 5, PostgreSQL 18, Drizzle. Exact compatible patches are pinned and recorded in Phase 01. |
| D02 | Separate database/storage namespace per installation on the VPS; no shared tenant router. Same release artifact/configuration format serves all customers. |
| D03 | Staff login accounts including nursery admin reserve employee slots; Superadmin does not. Financial employee profiles without login do not reserve an account slot until a login is created. No mixed staff/guardian identity in V1. |
| D04 | Grace days are configurable, initial default 7. During grace warn nursery staff. After grace block normal use; keep Superadmin support access. Parent copy asks them to contact the nursery, staff copy supplies renewal support. |
| D05 | Overdue debt never automatically blocks a parent. A parent block does not alter the child's attendance, billing agreement, other guardian access, or seat reservation. |
| D06 | Cairo business timezone, Latin digits, dd/MM/yyyy display, integer EGP piastres. Store date-only business dates separately from UTC audit timestamps. |
| D07 | Paused child: no daily roster/parent child view; existing agreements remain unchanged until finance pauses them explicitly. Archive ends future monthly generation from the effective date and retains all issued obligations. Warn about financial effects in the action. |
| D08 | New monthly agreement stores amount, start/end dates, due day and first period. Generate first approved period immediately, later periods at Cairo month start. Due day clamps to month end. No automatic first-month proration. |
| D09 | One billing obligation per child/agreement/service period/category; installment schedule is subordinate to one fixed agreement, not another charge. Additional period-labeled fees never auto-repeat. |
| D10 | Equal split uses integer division; leftover piastres are assigned in stable child-ID order. Discount applies to selected tuition only; bus/trip/additional fees stay separate. New agreement requires renewed pricing confirmation. |
| D11 | Partial tuition installment collection is allowed; mark-paid shortcut defaults to full outstanding installment. Bus and final salary payments are all-or-nothing. |
| D12 | Current bus eligibility requires subscription + current period fully settled + admin permission enabled + active child. A manual permission block can prohibit a paid child; it cannot authorize an unpaid bus charge. This rule is reviewable. |
| D13 | Initial reminder once per overdue installment to each eligible recipient; deduplicated. Staff can explicitly resend. No daily notification storm or automatic late fees. |
| D14 | Daily progress uses one slot per enabled checkpoint definition. Recorded and explicitly not-applicable statuses resolve the slot; labels distinguish N/A. Unknown remains unresolved. Zero enabled checkpoints hides the bar. |
| D15 | Configuration changes take effect on the next Cairo date for new daily snapshots. Existing published days keep their definitions/labels/counts. Emergency module disable immediately hides that module from parent/current operations while preserving authorized history. |
| D16 | Multiple exams/homework tasks remain separate records inside their checkpoint. Exam slot resolves after results for all published applicable exams are recorded or explicitly N/A. Homework assignment is visible live while completion remains pending until each due task has an outcome. Future-due homework does not block today's completion. |
| D17 | Teachers may append corrections only for children currently in their assigned scope; scope loss requires an authorized manager to correct. Ordinary progress transitions are appended events, not destructive edits. |
| D18 | Published No exam today / No homework today can be applied once per classroom, with child exceptions. Absence does not silently create zero grades or infer homework failure. |
| D19 | Only valid current recipient links can read notification targets, files, histories, or live events. A shared family balance is shown only when the guardian can view all included child finance lines; otherwise show allowed children only. |
| D20 | Files are private outside the web root; generic child/expense documents can be PDF/JPEG/PNG after validation, logo PNG/JPEG/WebP. No daily-photo feature. |
| D21 | Payroll adjustments are scoped to their original month. Prior unpaid months remain visible and can be settled separately; no automatic rollover or partial final settlement. |
| D22 | Financial corrections use auditable reversals/replacements internally. Closed periods require an authorized reopen or a current-date adjustment; never rewrite a counted closing invisibly. |
| D23 | Backup target: daily plus before migrations/restores; initial retention 7 daily + 4 weekly, configurable. Encrypted off-host copy is a deployment requirement with destination supplied at deployment. RPO/RTO are targets, not measured promises. |
| D24 | In-app live updates use authenticated SSE invalidation and fresh scoped reads, with bounded polling fallback. Native push/WhatsApp API sends are excluded. |
| D25 | No claims that the program is built, tested, or deployed until actual evidence exists. VPS sizing is deferred to measured installation checks. |
| D26 | Disabling Health removes ordinary entry/tasks and parent sections, while previously recorded emergency information remains in a restricted staff emergency view. The disable dialog explains this exception. |
| D27 | Each payroll month has one explicit paying branch/account. Operational multi-branch assignments do not split salary automatically; a staff move changes future payroll attribution when authorized, without rewriting existing months. |
| D28 | Superadmin records purchased parent/employee capacities, a unit price for each for the chosen subscription period, and an optional agreed subscription total override with reason. Estimate uses purchased capacities, not active logins. Capacity changes do not silently prorate or charge money. |

## Change procedure

### 2026-09-13 — Phase 05 licensing, module-dependency, and branding defaults (D31)

R01–R05/U04/U05/U07: seat reservation is a single active `seat_reservations` row per account (append-only ledger, partial unique index on `released_at is null`), allocated by locking `license_limits` and counting active rows for that kind inside the same transaction as the new account row — never a coarser subsystem-wide lock. Only `seats.release` (reserved, SYSTEM-only) ends a reservation; `restoreAccount` (same capability) is the sole path back from `RELEASED`, re-reserving a seat and issuing a fresh one-time credential for the *same* account identity, since nothing in the requirements distinguishes "restore" from "recreate" and the account/audit trail is more useful preserved. Ordinary deactivate/reactivate (staff) and block/unblock (parent) explicitly refuse a `RELEASED` target so a delegated admin without `seats.release` cannot silently reinstate login access outside the seat ledger.

The only structural inter-module dependency implemented is FINANCE's re-enable-after-disable catch-up gate (`POST /modules/:key/preview` then `catchupAcknowledged: true`); no other dependency between FINANCE/ATTENDANCE/EXAMS/HOMEWORK/HEALTH is stated in ACCESS_AND_LICENSING.md, so none is fabricated. The catch-up preview honestly reports zero missing periods pending Phase 14's billing engine; `moduleChangeImpacts` is the named integration point for that phase. `module_settings` has no branch column — "identical across every branch" holds by construction, not by a runtime check.

Nursery brand/theme (`branding.manage`) stays reserved (SYSTEM-only), matching the settings-ownership table exactly; there is no delegable branding capability. Contrast validation runs the same WCAG formula (`packages/domain`) on both server (blocking save) and client (live preview) using the exact worked examples in UX_AND_BRANDING.md. `GET /api/v1/licensing/branding` is the one public, pre-authentication API surface added this phase, deliberately isolated behind its own `AuthClient` instance from the authenticated app (see LICENSING_AND_SETTINGS.md's verification notes for why). See [LICENSING_AND_SETTINGS.md](LICENSING_AND_SETTINGS.md) for services, route contracts, capability catalog additions, migration `0003_licensing_settings.sql`, and detailed evidence.

### 2026-09-13 — Phase 04 scope and delegation defaults (D30)

R02/R03/R05/U02: scope mode is explicit account data (`BRANCH` or `CLASSROOM`), independent of editable role names. Existing staff default to CLASSROOM with no assignments. Capabilities union across roles; classroom restrictions never disappear merely because a second role is attached. SYSTEM controls role definitions, per-account delegated assignable role IDs, and the separate sensitive-financial-edit entitlement. Reserved capabilities cannot be attached to editable roles.

Delegated staff administrators require BRANCH scope and authority over every existing/requested target branch. Both existing and requested roles must be explicitly delegated and their capabilities must remain a subset of the actor's capabilities. Staff cannot edit themselves, unassigned accounts, partly inaccessible accounts, or sensitive-entitled accounts. SYSTEM performs initial scope assignment. General account creation remains Phase 05/06 and must reserve slots through its domain service; this phase adds no provisioning shortcut.

Authorized branch creation assigns only the newly created branch to its creator. Staff may add age-group options; SYSTEM alone edits existing shared age groups because such edits affect all branches. Classroom branch identity stays immutable; staff assignment moves preserve original audit ownership. Capacity is advisory and no child occupancy is fabricated before Phase 06. Strict version checks protect mutable records/assignments. Transactional policy locks and a global revision invalidate current access, with five-second in-memory UI revalidation and immediate server checks. See ORGANIZATION_AND_POLICY.md for services, route contracts, permission fixtures, and migration `0002_organization_policy.sql`. No later-phase financial or guardian actions are enabled by the capability catalog.

### 2026-09-13 — Phase 03 authentication defaults (D29)

R02/U03: normalize usernames with NFKC, trim outer whitespace, and locale-independent lowercase; accept 3–64 Unicode letters/numbers or `.`, `_`, `-` without internal whitespace. Passwords are 15–128 characters without trimming or composition rules. Use Node scrypt (N=131072, r=8, p=1, random 16-byte salt, 64-byte key), following the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Sessions have a 12-hour absolute limit and 30-minute sliding idle limit. Explicit rotation invalidates the prior token without extending the absolute limit; password changes issue a new session and revoke every previous session. Temporary credentials expire after 24 hours, can sign in once, and create a restricted 15-minute setup session. An abandoned setup requires another Superadmin reset (or local SYSTEM recovery). Login is limited to 10 attempts per normalized identity and 30 per direct peer IP per 15 minutes, shared in PostgreSQL. Password/reset attempts use the same limiter by actor ID. Proxy headers are untrusted until narrowly configured in the deployment phase.

Bootstrap is single-use under a transaction lock and persistent marker; SYSTEM recovery updates the existing reserved account, never creates another. Both local commands consume bounded JSON through private stdin and never print credentials. Assisted reset requires the reserved SYSTEM identity and its current password, returns a random temporary password once, and does not activate or unblock the target. Public account messages are shown only after valid credentials or an existing session; internal status reasons are never public. General provisioning, block UI, roles, slots, and license policy remain their planned phases. Migration: `0001_authentication.sql`; API namespace: `/api/v1/auth`; current-account responses explicitly report `policyReady: false` and no unimplemented business capabilities.

Append a dated decision with reason, affected requirement IDs, migrations/API impact, and affected phase files. Update canonical rules and acceptance fixtures together. Never silently replace an equal split with a proportional split, revive removed complaints/media, or turn manual blocking into automatic debt enforcement.
