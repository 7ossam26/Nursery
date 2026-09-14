# Project state

Baseline: 2026-09-13. Phase 10 is complete (2026-09-14).

## Active state

- Current phase: 10 — Exams, grades, and corrections — COMPLETE; acceptance gate satisfied 2026-09-14.
- Delivered so far: migration 0008 adds append-only `subjects`/`exam_types` catalogs, append-only `exams` definitions (snapshotting subject/type name), and append-only `exam_results`, reusing the EXAM checkpoint already seeded in migration 0006. `/api/v1/exams` provides catalog CRUD (new delegable `exams.catalog` capability), classroom-scoped exam creation, per-exam roster/result publication, reasoned corrections, a No-exam-today action, and per-child history with subject/type/date filters — all on the Phase 08 `ChildService.withPolicy` + `LearningService.operation`/`appendInTransaction` transaction boundary, exactly like attendance. `LearningService.appendInTransaction` gained a narrow, kind-gated `{ aggregateTransition: true }` option so several same-day exams can share one recomputed EXAM checkpoint slot (pending until every applicable exam has an outcome; N/A only if every applicable exam is child-absent; otherwise resolved), including reopening an already-resolved slot when a new exam is scheduled — without weakening the public custom-checkpoint transition rule.
- Evidence: unit 54/54 (50 pre-existing + 4 new exam contract checks). Focused real PostgreSQL exam checks (`tests/integration/exams.test.ts`) pass 7/7: A09 zero-score-is-real/missing-is-not-zero/out-of-range rejection, A10 actor-separated correction race with append-only enforcement on both `exams` and `exam_results`, A02/A03 classroom/child scope (including a guardian denied a child they are not linked to), multi-exam aggregate reopen/resolve across two exams (one numeric, one child-absent), No-exam-today wholly-unpublished/refused-once-scheduled, `exams.catalog` capability separate from `learning.publish` plus immediate `EXAMS` module disable, and child history subject filter with no synthesized numeric/label average. Full `npm run test:integration` (11 files/65 tests) and `npm run test:unit` (13 files/54 tests) both pass.
- UI checkpoint: bilingual teacher task at `/teacher/exams` provides subject/type quick catalog management, exam creation, per-exam roster entry (explicit missing state, numeric or label outcome, optional comment, explicit child-absent), correction, and No-exam-today; guardian child detail includes a filterable exam history panel. D36 and EXAMS.md record the aggregation/catalog/correction defaults.
- UI evidence: `tests/e2e/exams.test.tsx` passed 2/2 (English and Egyptian Arabic) with real HTTP/PostgreSQL, no captured HTTP 5xx, and axe checks (create exam → publish a numeric result → correct it → guardian sees the corrected score). An interim failure traced to the UI unnecessarily reloading the sibling exam list after every result publish, which momentarily unmounted the roster component; removed, since publishing a result never changes the exam list itself. `npm run test:e2e` (all 8 files) shows the unrelated, pre-existing Phase 07 authentication DOM timing failure only (2/19 tests in that one file); every other file, including exams, passed.
- Final evidence: unit 54/54; focused real PostgreSQL exams 7/7 plus full integration regression 65/65; bilingual DOM/HTTP 2/2 with no HTTP 5xx and axe checks; workspace typecheck/lint/build passed for all packages; diff check passed. A pre-existing Phase 08 regression in the Phase 07 safety suite (a hardcoded module-key list missing `CUSTOM_CHECKPOINTS`, never previously run as part of a full-suite pass) was found and corrected narrowly. Exact commands are in HANDOFF.md and EXAMS.md.
- Runtime/migration: pinned Node 24.19.0/npm 11.1.0 at `%TEMP%/nursery-phase07-tools`; disposable PostgreSQL 18.4 restarted at 127.0.0.1:55407 against its existing `nursery_test` database and data directory from prior phases. Migration 0008 applied cleanly after 0007, confirmed idempotent on rerun (no output), and the Phase 04/05 upgrade/rerun regression test (`organization-migration.test.ts`) now expects and passes through 0008. No operator/live migration, environment file, or deployment.
- Limits: reviewed classroom/exam roster pages are bounded to 100 children; exam definitions cannot be edited after creation (only created or, for results, corrected); parent live delivery remains Phase 12; management PDF/Excel exam reports remain Phase 20. Build warns about a 556.27 kB minified main chunk (pre-existing warning, slightly larger with the new feature). No manual browser/visual or performance claim. The unrelated pre-existing Phase 07 auth DOM reset timing issue remains open and unchanged.
- Last completed phase: 10. Next executable phase: 11 — Homework assignments and individual completion — only when requested. Stop; do not continue automatically.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | COMPLETE | Bilingual locale/theme/component/navigation system; workspace lint/type/build, 29 unit/component checks, Vite fallback smoke, audit, production-preview exclusion, and diff check passed. |
| 03 | Authentication, sessions, and account security | COMPLETE | Authentication schema/services/UI; applied and idempotently rerun migration; workspace type/lint/build; 8 focused unit, 12 real PostgreSQL/API/command and 5 scripted UI/startup checks passed. See AUTHENTICATION.md. |
| 04 | Branches, classrooms, and dynamic permissions | COMPLETE | Organization/policy/UI; 9 PostgreSQL/API policy tests, 1 migration upgrade/rerun, 12 auth regression, 7 bilingual DOM/HTTP, 8 unit checks; workspace type/lint/build passed. See ORGANIZATION_AND_POLICY.md. |
| 05 | Superadmin, subscriptions, slots, and nursery settings | COMPLETE | Licensing/seats/settings service and UI; 7 licensing PostgreSQL/API tests plus 30/30 full integration regression, 39/39 unit, 4/4 e2e (organization+startup); workspace type/lint/build passed. See LICENSING_AND_SETTINGS.md. |
| 06 | Children, guardians, onboarding, and documents | COMPLETE | 10 children + 7 licensing + 9 organization + 2 migration PostgreSQL checks (28/28); unit 41/41; bilingual DOM/HTTP 3/3; workspace type/lint/build and audit passed. See CHILDREN_AND_DOCUMENTS.md. |
| 07 | Health notes, authorized pickup, and incidents | COMPLETE | Safety 4 + all suites 45/45 PostgreSQL checks (migration 0005 upgrade/rerun included); unit 47/47; bilingual DOM/HTTP safety 2/2, children 3/3; workspace type/lint/build and audit passed. Pre-existing auth e2e timing failure unchanged. See SAFETY.md. |
| 08 | Versioned checkpoints and publication engine | COMPLETE | Unit 49/49; focused PostgreSQL 9/9 incl. correction race, scope/module checks and migration upgrade/rerun; bilingual DOM/HTTP 2/2; workspace typecheck/lint/build and diff check passed. See CHECKPOINT_ENGINE.md. |
| 09 | Attendance and daily classroom reports | COMPLETE | Unit 50/50; PostgreSQL attendance+migration 8/8 plus learning regression 7/7; bilingual DOM/HTTP 2/2; typecheck/build/changed lint/diff passed. See ATTENDANCE.md. |
| 10 | Exams, grades, and corrections | COMPLETE | Unit 54/54; PostgreSQL exams 7/7 plus full regression 65/65; bilingual DOM/HTTP 2/2; workspace typecheck/lint/build and diff check passed. See EXAMS.md. |
| 11 | Homework assignments and individual completion | NOT STARTED | None |
| 12 | Parent hub, announcements, and live notifications | NOT STARTED | None |
| 13 | Financial records, transactions, and treasury core | NOT STARTED | None |
| 14 | Billing modes, equal discounts, and recurring charges | NOT STARTED | None |
| 15 | Collections, outstanding balances, receipts, and manual blocks | NOT STARTED | None |
| 16 | Expenses, transfers, refunds, and daily closing | NOT STARTED | None |
| 17 | Child branch transfer and outstanding debt ownership | NOT STARTED | None |
| 18 | Bus subscriptions, trips, and participation | NOT STARTED | None |
| 19 | Employee financials and monthly payroll | NOT STARTED | None |
| 20 | Management reports and PDF/Excel exports | NOT STARTED | None |
| 21 | Excel templates, validation preview, and atomic import | NOT STARTED | None |
| 22 | PWA, network recovery, and usability hardening | NOT STARTED | None |
| 23 | Dokploy deployment assets, backup, restore, and support | NOT STARTED | None |
| 24 | Cross-module verification and release fixes | NOT STARTED | None |
| 25 | Operator guides, user walkthrough, and final handoff | NOT STARTED | None |

Valid execution statuses: NOT STARTED, IN PROGRESS, BLOCKED, COMPLETE. COMPLETE requires the phase's real acceptance evidence, not merely a generated implementation.

## Update contract

At each meaningful checkpoint replace the active summary with the current facts. Update the ledger only when evidence changes. Include actual command names after Phase 01 creates them. Link detailed evidence rather than accumulating long logs here.

A new user requirement should update DECISIONS.md and affected rules/phases, then be referenced here. Do not discard unresolved defects or mark failed checks skipped to close a phase.
