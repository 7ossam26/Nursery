# Homework assignments and individual completion

Phase 11 runtime contract — 2026-09-14. See D37 and PROJECT_STATE/HANDOFF for current execution evidence.

## Assignment and recipient contract

POST /api/v1/homework takes classroomId, title (1–160 chars), instructions (1–4000 plain-text chars), assignedOn, dueOn, 1–100 unique explicitly reviewed childIds and operationId UUID. Assigned date must not be future; due date defaults to assigned date in the UI and cannot precede it. Server verifies current active child/classroom authorization and date-effective placement/lifecycle using the existing learning snapshot service. Recipient IDs and identifying names are frozen at publication; later admissions/transfers never become implicit recipients.

One homework_assignments identity has immutable original classroom/branch/date attribution. homework_versions stores title/instructions once for version 1. POST /homework/:id/corrections takes expectedVersion, title, instructions, required reason, operationId; appends a content version and leaves dates/placement/recipients intact. GET /homework/:id/versions is staff-only original-classroom-scoped version history. Current parent history explicitly marks corrected content and always shows the effective instructions. No draft server store, date-changing endpoint, file, submission or automated grading exists.

GET /homework?classroomId&date&overdue=false lists assignments assigned or due that date, up to 100; overdue=true lists earlier due assignments with missing/noncompleted recipients. GET /homework/:id/roster?date returns frozen recipient names, current per-child outcome (as of review date), canRecord and configurable outcome options. Teachers use the existing learning roster in reviewed 100-child pages; each shared publication contains only selected children on that page. Larger groups use further pages, never an unreviewed implicit bulk operation.

## Individual outcomes and correction

POST /homework/outcomes takes assignmentId, review date, operationId and up to 100 unique entries {childId,statusId,expectedVersion,note?}. Only mapped COMPLETED, NOT_COMPLETED or EXCUSED statuses from that child's frozen date configuration are accepted. Status labels/colors are data; infrastructure mapping keys drive rules. Missing is null, never synthesized Not completed; absence never infers any outcome. Notes are optional, normalized empty to null, max 2000 plain-text chars. Each initial outcome requires expectedVersion 0.

POST /homework/outcomes/corrections takes one entry plus assignmentId/date/operationId/reason. Each assignment/child has its own revision and previous-record chain, independent of other children and of the aggregate slot revision. Required reason and stale-version rejection protect all corrections, including note-only or unchanged-status corrections. Correction date cannot precede its predecessor. Both content and outcome tables are protected by append-only database triggers and chain uniqueness/FKs. Learning event, adapter outcome, audit/outbox and idempotency result share one PostgreSQL transaction. A late review can start a new day's aggregate PUBLISH without incorrectly attaching a CORRECTION-only reason; that reason remains on the independent outcome correction chain.

## Exact daily progress rule

All tasks share one HOMEWORK slot, never one bar slot per assignment. For child/date D, relevant due tasks are snapshotted-recipient assignments with dueOn=D, assignedOn<=D. Effective outcomes include only outcome events recorded on/before D, so a late review does not rewrite a prior day's effective report.

- Any due task missing an explicit outcome: pending, with count of missing/due tasks.
- All due tasks recorded: resolved (Completed and Not completed both resolve reporting); all Excused: explicit N/A. Aggregate label Not completed when any due task has that outcome, otherwise Completed/Excused as appropriate.
- Assignment published on D with a later due date: content is visible immediately. If no work is due D, today's assignment-reporting requirement resolves and displays Assigned for later. Its original AWAITING_REVIEW mapping remains pending; contextual reporting meaning is explicit, not a status-configuration rewrite.
- On the due date, lazy authoritative reads find the persisted task and show pending until reviewed. They create no synthetic publication/outbox event. The usual lazy daily snapshot is allowed.
- Earlier overdue work is a separate review/history list, not an extra pending task in today's bar. Overdue means dueOn before review date and latest outcome missing or Not completed; Completed or Excused clears it.
- Nothing assigned or due: pending until an explicit No homework today publication. Unrelated early/late outcomes do not silently fulfill that requirement.

DailySlot adds optional homework {reported,meaning,outcome,due,missing,future}. LearningService.dailyInTransaction projects this from persisted adapter records within the current child lock and original assignment scope; learningProgress counts this contextual meaning for HOMEWORK only. Other kinds retain the existing event-based formula. Frozen definitions/status meanings/labels and historical configuration rows are untouched; no extra configuration version or status reseed is required. Existing EXAM aggregateTransition support is narrowly extended to HOMEWORK; STATUS_NOTE transition validation remains unchanged.

POST /homework/no-homework-day takes classroomId/date/operationId and reviewed child entries with expected aggregate version, mapped NO_HOMEWORK or EXCUSED, optional note. Explicit per-child exclusions are represented by leaving those children out of the reviewed entries; Excused is a distinct exception. Refused for selected children assigned or due work; one no-day record per child/date. New later assignment may legitimately reopen the slot through a new appended transition, retaining the earlier no-day publication.

## Scope, parent display, module disable and outbox

Reuse learning.read/learning.publish capabilities and the HOMEWORK module; no new implicit role grant or business-role string checks. Every write runs inside ChildService.withPolicy and LearningService.operation with fresh authorization/module checks even on replay. Homework's adapter policy lock 7191101 comes after existing license/organization/guardian/account policy locks and before sorted child locks. Distinct actors can race for a content/outcome revision; the loser gets STALE_VERSION. Same business operation UUID replays its original committed result; conflicting request reuse remains IDEMPOTENCY_CONFLICT.

Staff need original assignment classroom/branch and current child scope. Shared content correction checks all recipients' current scopes, including retained inactive child records; qualified management can correct after a transfer when a source teacher has lost child access. Destination teachers cannot read unrelated original-classroom work through the moved child's history. Authorized source staff retain the original assignment roster/name snapshot, with canRecord=false where current child scope is lost. No new teacher is granted original-classroom scope automatically.

Guardians only use GET /homework/children/:id/history (bounded pagination/filter) after current linked-child read authorization. Recipient snapshot further filters actual assignments. Parents can see the linked child's effective content/outcome, dates, optional note and correction indication; no other children/recipients or technical timestamps. The child overview adds read-only homework history/current status; no mutation/upload control exists. Module disable removes operational forms and guardian homework payload/panel; daily bar filters the HOMEWORK slot immediately. Five-second in-memory scoped polling and focus revalidation reuse existing behavior. SSE/notification delivery remains Phase 12.

Initial publication/outcome stage existing learning_change_outbox records. homework_content_outbox additionally references immutable content version per snapshotted child with original branch/classroom and read+notify guardian recipient snapshot; shared content is never duplicated per guardian. Phase 12 must revalidate current child/guardian links/module state and keep independent delivery cursors. No actual notification sender is implemented here.

## Migration, actual verification and limitations

Apply 0009_homework.sql after 0008. Six new append-only homework adapter tables and indexes; no finance/seat changes, role grants or historical configuration mutation. Fresh disposable database migration 0000–0009 and rerun were actually executed successfully; upgrade regression checks include 0009/count10 and preserve prior identities/reservations/edited roles.

Phase 11 gate satisfied. Actual commands with pinned runtime and DATABASE_URL=postgresql://postgres@127.0.0.1:55411/nursery_test:

- Prerequisite npm run test:integration -- tests/integration/exams.test.ts: 7/7 passed before adapter edits.
- npm run test:integration -- tests/integration/homework.test.ts --maxWorkers=1: 8/8 passed on final code, including assignment/outcome idempotent replay, optional notes, independent guardian read/mutation denial, future/lazy due behavior and two due tasks, actor-separated content/outcome correction races, frozen mapped labels, No homework/Excused distinctions, retained recipient/transfer scopes, publication/audit rollback, guardian module disable and overdue/late review.
- npm run test:integration -- tests/integration/learning.test.ts tests/integration/exams.test.ts tests/integration/attendance.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1: 22/22 passed. These cover the concrete risk from changing LearningService.daily/learningProgress and the built-in aggregation gate; unrelated suites were not repeated.
- npm run test:unit -- --maxWorkers=1: 56/56 passed (14 files), including the two new strict homework contract/due-rule checks.
- npm run test:e2e -- tests/e2e/homework.test.tsx --maxWorkers=1: 2/2 passed on final code, English/Egyptian Arabic shared publication, individual reviews, outcome/content corrections, read-only guardian display, RTL, axe structural checks and no captured HTTP 5xx. Color contrast excluded because jsdom cannot measure it; existing contrast service unchanged. No Playwright/browser automation.
- npm run typecheck; npm run lint; npm run build: all workspaces passed on final code. Main JS chunk 574.69 kB / 160.86 kB gzip; non-failing existing >500 kB warning pattern.
- npm run db:migrate: fresh isolated database applied 0000–0009; rerun applied nothing. Migration upgrade/rerun regression expects 0009/count10 and preserves previous identity, reservations and edited roles.
- git -c core.whitespace=cr-at-eol diff --check: passed. Disposable PostgreSQL 18.6 stopped with pg_ctl -D %TEMP%/nursery-phase11-pg stop -m fast.

Interim failures corrected and rerun, never skipped: late outcome correction reason was sent to a new day's initial PUBLISH schema (fixed while keeping independent outcome reason); stray JSX closing brace (fixed); DOM test read a content control before refreshed markup after the committed outcome (now awaits it). A shell quoting error in an attempted UI edit ran no edits/checks; the edit was subsequently applied via patch and final checks passed.

Environment: pinned Node 24.19.0/npm 11.1.0 reused from %TEMP%/nursery-phase04-tools; PostgreSQL 18.6 isolated loopback 55411/nursery_test, cluster %TEMP%/nursery-phase11-pg. No dependency, live data/environment file/model/deployment/subagent change. No Playwright or browser automation. Existing Phase 10 authentication DOM timing defect remains outside scope, not rerun/claimed fixed. Actual-browser visual/responsive and production performance/notification delivery are not claimed. Main bundle has the existing >500 kB warning pattern.
