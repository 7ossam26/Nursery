# Current handoff

Updated: 2026-09-14 — Phase 09 complete.

## Next executable action

Stop. Begin Phase 10 — Exams, grades, and corrections — only when requested. Read AGENTS.md, PROJECT_STATE.md, this handoff, the Phase 10 file, and only its named references. Reuse the built-in adapter transaction protocol in CHECKPOINT_ENGINE.md and the concrete attendance example in ATTENDANCE.md. All Phase 09 changes are uncommitted; the worktree was clean before Phase 09.

## Delivered behavior and contracts

Attendance classroom/date drafts use date-effective retained placement/lifecycle data plus current server scope. Only active assigned children appear. A row remains visibly missing until explicitly selected and published; bulk present is an explicit UI action over unpublished reviewed rows. The page boundary is 100 children, matching D34. Absence reasons are optional and accepted only for ABSENT.

Attendance publications and corrections use `ChildService.withPolicy`, `LearningService.operation`, `authorizePublications`, and `appendInTransaction` in one transaction. The adapter maps only snapshotted status outcomes, writes one immutable `attendance_records` payload per learning event, and atomically commits audit, operation result, learning outbox, and any unexpected-absence alert. Corrections require expected revision and a nonblank reason; originals remain queryable. A same-operation retry reauthorizes and returns its original result; stale/new writers cannot overwrite.

NO_CLASS is a distinct NOT_APPLICABLE attendance status introduced in a new immutable configuration version effective no earlier than the next Cairo date. The explicit no-class action refuses to replace any prior row and publishes N/A for the wholly unpublished reviewed roster page. Daily detail returns attendance plus the Phase 08 snapshotted slots/progress; staff-only history includes the append-only chain. No arrival/departure, check-in/out, bus, employee-attendance, or end-of-day visibility fields exist.

Guardian planned absence accepts a current/future inclusive range up to 366 days and optional reason. It normalizes to one guardian/child/date row; identical repeats do not add rows, and changed reasons update only dates without confirmed attendance. It is advisory only. An actual ABSENT without any matching notice creates one append-only `attendance_absence_alerts` row for that effective event. Phase 12 owns dispatch and recipient revalidation; `learning_change_outbox` remains the payload-free invalidation boundary.

API paths are under `/api/v1/attendance`: classroom draft, classroom publication, correction, no-class, child daily, staff child history, and guardian planned absence. The teacher UI is `/teacher/today`; guardian child detail includes current attendance/progress and the planned-absence form. Copy is English and Egyptian Arabic. D35, ATTENDANCE.md, DAILY_LEARNING.md, and API_AND_DATA_CONTRACTS.md record the decisions/contracts.

## Changed files

- `packages/contracts/src/attendance.ts`, `learning.ts`, `index.ts`, and `learning.unit.test.ts`: strict inputs/types, NO_CLASS semantic mapping, exports, and unit coverage.
- `packages/db/src/migrations/0007_attendance.sql`: new immutable configuration version/status and attendance/notices/alert tables with append-only triggers.
- `apps/api/src/modules/attendance/{service,routes}.ts`, `apps/api/src/app.ts`, and `apps/api/src/modules/learning/service.ts`: attendance adapter/routes and transaction-scoped daily/snapshot access for the adapter.
- `apps/web/src/features/attendance/{copy,screens}.tsx/ts`, `App.tsx`, auth/children screens, and i18n catalogs: bilingual teacher and guardian workflows.
- `tests/helpers/learning.ts`, `tests/integration/attendance.test.ts`, `tests/e2e/attendance.test.tsx`, and `tests/integration/organization-migration.test.ts`: fixture, PostgreSQL/API/DOM coverage, and migration expectations.
- `docs/ATTENDANCE.md`, `DECISIONS.md` (D35), `DAILY_LEARNING.md`, `API_AND_DATA_CONTRACTS.md`, `PROJECT_STATE.md`, and this handoff.

## Actual verification

Pinned Node 24.19.0/npm 11.1.0 from `%TEMP%/nursery-phase07-tools`. Commands used the pinned `node.exe` directly for Vitest and `%TEMP%/nursery-phase07-tools/npm.cmd` for workspace scripts. `DATABASE_URL=postgresql://postgres@127.0.0.1:55407/nursery_test`. Disposable PostgreSQL 18.4 at that address remains running (PID 19720 at final check). Fixtures create/drop isolated schemas and private temporary files; no `.env` was created.

- Direct pinned Vitest, `--config vitest.unit.config.ts`: 12 files, 50/50 passed after attendance contract additions.
- Direct pinned Vitest, `--config vitest.integration.config.ts tests/integration/attendance.test.ts tests/integration/organization-migration.test.ts`: final 8/8 passed in 51.48 s. Attendance 6/6 covers explicit missing/present/absent, optional reason, planned notice dedupe, unexpected alert, actor-separated correction race/stale result, A02/A06/A08/A09/A10/A31, no-class N/A/replay, date-effective roster, append-only triggers, and injected alert failure rollback across detailed record/event/audit/operation/outbox. Migration 2/2 upgrades actual Phase 03/05 schemas through 0007 and reruns idempotently.
- Direct pinned Vitest, `--config vitest.integration.config.ts tests/integration/learning.test.ts`: 7/7 directly affected Phase 08 regression passed after adding required NO_CLASS mapping and the adapter transaction accessors.
- Direct pinned Vitest, `--config vitest.e2e.config.ts tests/e2e/attendance.test.tsx`: final 2/2 in 32.90 s, English and Egyptian Arabic with real HTTP/PostgreSQL. Guardian notice, missing rows, explicit selected publication, absence reason, correction, direction, and axe checks passed; teardown asserted no HTTP 5xx.
- `npm run typecheck`: all workspaces passed after final UI changes.
- Changed-package lint (`@nursery/api`, `@nursery/web`, `@nursery/contracts`): passed after final code changes. A separate broad direct ESLint invocation was invalid because the repository project-service config intentionally excludes root test/vite files; it was not treated as gate evidence.
- `npm run build`: all workspaces passed after final code changes. Vite emitted a non-failing 536.03 kB minified / 153.22 kB gzip main-chunk warning.
- `git -c core.whitespace=cr-at-eol diff --check`: passed after final diff.

Interim failures were corrected and rerun: two licensing fixture method/input-shape mistakes; a test cleanup import and missing guardian locale setup; invalid nested HTML forms; an exact-label DOM query; and an atomic-rollback assertion that initially counted the fixture's configuration audit rather than filtering the target child. An early npm output/session capture was replaced with direct pinned Vitest evidence. No failure was marked skipped or passed.

## Migration and remaining limits

Apply `0007_attendance.sql` after `0006_learning.sql`. It has only been applied in disposable verification schemas, never an operator/live nursery database. It grants no role capabilities; assign existing `learning.read`/`learning.publish` deliberately. Because configuration changes follow D15, NO_CLASS becomes available no earlier than the next Cairo business date and never rewrites existing snapshots.

No Phase 09 gate blocker remains. A classroom page is capped at 100 reviewed children; larger rosters require subsequent pages under D34, and the current teacher screen derives classroom options from the first learning-roster page. Phase 12 still must implement delivery/acknowledgment and recipient revalidation; no five-second live-delivery claim is made. No manual browser/responsive visual review or performance measurement was performed. The prior authentication DOM assisted-reset timing defect remains outside scope. No deployment, dependency change, model change, browser automation, subagent, or later-phase work occurred.
