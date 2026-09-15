# User acceptance walkthrough

Implements R16/U23, phase acceptance-gate item 5. This is a **manual** scenario for the tech lead to execute by hand
against real running screens — either the local development servers ([README.md](../README.md)) or a deployed
installation ([OPERATIONS.md](OPERATIONS.md)). It is not pre-filled with results. Phase 24's automated evidence
([ACCEPTANCE_EVIDENCE.md](ACCEPTANCE_EVIDENCE.md)) exercises the same business rules through PostgreSQL integration
tests and scripted bilingual DOM/HTTP checks; this walkthrough exists for what those scripts structurally cannot
observe — actual visual layout, real browser behavior, and a human's judgment that the product feels usable.

**Do not mark a row Pass without actually performing the step.** Leave a row Blocked with a reason if the environment
does not allow it (for example, no Docker/VPS host — see Known issues below). A failed step is not a reason to skip
the rest of the walkthrough; record it and continue where possible.

**Post-Phase-25 update:** every row that can be exercised without a rendered browser has already been executed as
real HTTP requests against the real running application and real PostgreSQL — see
[evidence/final/WALKTHROUGH_RESULTS.md](evidence/final/WALKTHROUGH_RESULTS.md) (88 PASS, 0 FAIL, 5 rows correctly
left NOT EXECUTED because they require a rendered browser/device). This blank template below remains in force for
the tech lead's own device/browser pass — sections 7 and the visual rows of section 4 in particular — which that
script-driven execution cannot replace.

## Before you start

| Field | Value |
|---|---|
| Environment (local dev servers / staging / deployed installation) | ______ |
| Release candidate / commit | ______ |
| Browser(s) and OS used | ______ |
| Date(s) performed | ______ |
| Tech lead name | ______ |

Setup: for local development, follow [README.md](../README.md) "Local setup" (`.env`, `npm ci`, `npm run db:migrate`,
then `npm run dev -w @nursery/api`, `-w @nursery/web`, `-w @nursery/worker`) and bootstrap the SYSTEM account per
[AUTHENTICATION.md](AUTHENTICATION.md). For a deployed installation, follow the Dokploy steps in
[OPERATIONS.md](OPERATIONS.md). Do not reuse a real nursery's data or credentials for this walkthrough
(OPERATIONS.md "Keep separate nonproduction demo data").

## 1. Superadmin setup

| # | Step | Screen | Result (Pass/Fail/Blocked) | Notes |
|---|---|---|---|---|
| 1.1 | Sign in with the bootstrapped SYSTEM account; change the temporary password | `/login`, `/change-password` | ___ | |
| 1.2 | Set nursery name, logo path, contact details, and brand colors; confirm the contrast check blocks an unreadable pair | `/administration/settings` | ___ | |
| 1.3 | Set subscription validity/grace and parent/employee capacities and prices | `/support/licenses` | ___ | |
| 1.4 | Create a custom role name and confirm reserved capability keys are not user-editable | `/administration/organization` → Roles | ___ | |
| 1.5 | Create the first nursery-admin login; confirm the one-time temporary password is shown once and works | `/support/licenses` → Provision new accounts | ___ | |

## 2. Nursery admin setup

| # | Step | Screen | Result | Notes |
|---|---|---|---|---|
| 2.1 | Add two branches and at least one classroom/age group per branch | `/administration/organization` | ___ | |
| 2.2 | Create a teacher account scoped to one classroom and confirm they see only that classroom | `/administration/organization`, then sign in as the teacher | ___ | |
| 2.3 | Onboard a family: guardian account(s) plus one or more children, through the review step | `/administration/children` → Add a family | ___ | |
| 2.4 | Create a monthly billing agreement for the new child; approve it and confirm it creates debt, not cash | `/administration/billing` | ___ | |
| 2.5 | Add a bus subscription with a service period and administrative permission for the child | `/administration/transport` | ___ | |
| 2.6 | Create a trip/activity and select the child | `/administration/transport` | ___ | |

## 3. Teacher daily work

| # | Step | Screen | Result | Notes |
|---|---|---|---|---|
| 3.1 | Record attendance for the assigned classroom and today's date | `/teacher/today` | ___ | |
| 3.2 | Record an exam result including a zero score and a missing score; confirm missing does not display as zero | `/teacher/exams` | ___ | |
| 3.3 | Publish a homework assignment and mark individual completion | `/teacher/homework` | ___ | |
| 3.4 | Issue a correction to a published result; confirm the original stays visible in history | `/teacher/exams` or `/teacher/homework` | ___ | |

## 4. Parent experience

| # | Step | Screen | Result | Notes |
|---|---|---|---|---|
| 4.1 | Sign in as the child's guardian; confirm today's updates (attendance/exam/homework) appear live without a manual refresh | `/parent/today` | ___ | |
| 4.2 | Switch language (English ⇄ Egyptian Arabic) and confirm dates stay dd/MM/yyyy and amounts stay EGP with Latin digits | `/account` | ___ | |
| 4.3 | Open the child's permitted balance / payment history | `/parent/payments` | ___ | |
| 4.4 | Open and, if required, acknowledge a notice | `/parent/notices` | ___ | |

## 5. Finance operations

| # | Step | Screen | Result | Notes |
|---|---|---|---|---|
| 5.1 | Collect a tuition installment against the child's outstanding balance; confirm a receipt is produced | `/administration/collections` | ___ | |
| 5.2 | Attempt a partial bus-fee payment and confirm it is rejected (bus accepts full settlement only) | `/administration/transport` → collection | ___ | |
| 5.3 | Record a pending expense, then its actual payment | `/administration/expenses` | ___ | |
| 5.4 | Record a treasury account transfer | `/administration/transfers` | ___ | |
| 5.5 | Record a salary advance, then the full remaining monthly payout for an employee | `/administration/payroll` | ___ | |
| 5.6 | Transfer the onboarded child to the second branch with outstanding debt; confirm no cash moves and the debt now belongs to the new branch | `/administration/child-transfers` | ___ | |
| 5.7 | Perform a daily cash closing with an actual physical count | `/administration/closing` | ___ | |
| 5.8 | Generate a PDF and an Excel export from Management reports and open both files | `/administration/reports` | ___ | |

## 6. Access blocking

| # | Step | Screen | Result | Notes |
|---|---|---|---|---|
| 6.1 | Block the parent account used in section 4, with a stated reason | `/support/licenses` (or `/administration/settings` if delegated) | ___ | |
| 6.2 | Confirm the blocked parent's existing session stops (sign-in blocked, or, if already signed in, the next action shows "Access is unavailable. Please contact the nursery.") and that billing for their child is unaffected | Parent browser session | ___ | |
| 6.3 | Unblock the account and confirm normal access returns | `/support/licenses` | ___ | |

## 7. Responsive layout, RTL/LTR, and accessibility (M24-01 — not covered by scripted tests)

| # | Step | Result | Notes |
|---|---|---|---|
| 7.1 | Resize/emulate a 360px-wide device in both languages; confirm no horizontal page overflow and tables become cards or scroll within their own container | ___ | |
| 7.2 | Tab through a form (e.g. billing agreement or child onboarding) using only the keyboard; confirm visible focus and a logical order | ___ | |
| 7.3 | Enable "prefers-reduced-motion" and confirm icon/transition animation is reduced accordingly | ___ | |
| 7.4 | Confirm monetary values and dates stay left-to-right inside the Arabic (RTL) layout | ___ | |

## 8. Import and restore

| # | Step | Screen | Result | Notes |
|---|---|---|---|---|
| 8.1 | Download an import template, fill a small batch, upload for a validation preview, and commit | `/administration/imports` | ___ | |
| 8.2 | Perform a restore validation into an isolated target (staging/CLI) and review the report | `/support/operations` → Restore validation, or `npm run backup:restore -- --mode validate ...` | ___ | |

## Acceptance fixtures cross-reference (A01–A38)

The scenarios below are defined in [TESTING_AND_ACCEPTANCE.md](TESTING_AND_ACCEPTANCE.md) and were exercised by
automated PostgreSQL/DOM/HTTP checks as recorded in [ACCEPTANCE_EVIDENCE.md](ACCEPTANCE_EVIDENCE.md). List them here
so the tech lead can see full coverage in one place; re-running an already-passing scripted check by hand is optional.
The rows marked **manual required** are exactly the ones no script in this repository can verify.

| ID | Scenario | Automated evidence | Manual confirmation needed here |
|---|---|---|---|
| A01–A34, A37–A38 | See TESTING_AND_ACCEPTANCE.md | PASS — see ACCEPTANCE_EVIDENCE.md | Optional spot-check during sections 1–6, 8 above |
| A35 | Theme mutation, 360px RTL, keyboard, reduced motion | PARTIAL — scripted contrast/axe/CSS checks passed; physical device layout not run (M24-01) | **Required** — section 7 |
| A36 | Offline after form input or payment submission | PASS (scripted network-recovery DOM/HTTP) | Optional real-device offline check |

## Known issues carried forward from Phase 24 and Phase 25

Copied from [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for visibility in this walkthrough; that file is authoritative. None of
these authorizes a live deployment, and none should be re-marked resolved without new evidence.

| ID | Status | Summary |
|---|---|---|
| B24-01 | BLOCKED | No Docker on the build host; Docker image build, Compose startup/entrypoints, and Dokploy/Traefik TLS/SSE remain unexecuted. |
| B24-02 | NOT RUN | No real VPS/domain/off-host backup service supplied; target capacity and off-host failure recovery are unmeasured. |
| M24-01 | NOT RUN | Physical 360px/RTL/LTR/keyboard/screenshot/PWA install-update-offline checks are this walkthrough's section 7 and section 4.2; Phase 12's screenshot handoff (below) remains separately unresolved. |
| E24-01 | NOT RUN | Host Node/npm versions differ from the pinned Linux target; SIGTERM graceful-drain semantics untested on Windows. |
| L24-01 | Known limit | Local performance fixture is small (one staff/guardian session, 100-row attendance); re-measure at real installation scale. |
| S24-01 | OPEN | `npm audit` reports 2 moderate ExcelJS→uuid findings (0 high/critical); installed ExcelJS does not call the affected path per source review, but the audit itself is not clean. |
| N25-01 | FIXED (found in Phase 25, fixed in the post-Phase-25 release-closure session) | The "Treasury accounts" link on Daily cash closing and Financial corrections/refunds pointed at a non-existent route (`/administration/finance`) instead of `/administration/treasury`; both now link to `/administration/treasury`, with regression coverage in `navigation.unit.test.ts` and the closing/corrections e2e suites. See KNOWN_ISSUES.md. |

**Phase 12 (parent hub/live notifications) is still recorded IN PROGRESS**, not COMPLETE, in
[PROJECT_STATE.md](PROJECT_STATE.md): its screenshot handoff was never resolved because this repository's instructions
prohibit browser automation and no explicit waiver/authorization was given (see
[PARENT_HUB_AND_NOTIFICATIONS.md](PARENT_HUB_AND_NOTIFICATIONS.md)). A post-Phase-25 conflict analysis in
[DECISIONS.md](DECISIONS.md) ("Phase 12 screenshot handoff conflict analysis") confirms this cannot be resolved from
existing repository evidence and names the exact manual capture action (guardian sign-in on a real phone/browser at
~360px, English and Egyptian Arabic, `/parent/today`/`/parent/children/:id`/`/parent/notices`/`/parent/notifications`,
stored under `docs/evidence/phase12/`). This walkthrough's sections 4 and 7 are the closest available scripted
substitute; completing them does not by itself close Phase 12 — that requires the tech lead to actually perform that
capture (or explicitly waive it) and record the result in DECISIONS.md and PROJECT_STATE.md's ledger.

## Sign-off

| Field | Value |
|---|---|
| Overall result (Pass / Pass with recorded issues / Blocked) | ______ |
| Issues opened as a result of this walkthrough | ______ |
| Tech lead signature/date | ______ |
| Next action | ______ |
