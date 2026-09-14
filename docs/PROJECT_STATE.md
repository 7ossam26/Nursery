# Project state

Baseline: 2026-09-13. Phase 09 is complete (2026-09-14).

## Active state

- Current phase: 09 — Attendance and daily classroom reports — COMPLETE; acceptance gate satisfied 2026-09-14.
- Delivered so far: migration 0007 adds explicit snapshotted NO_CLASS semantics, append-only attendance payloads, editable/deduplicated per-day guardian notices, and unexpected-absence alert staging. Strict contracts and `/api/v1/attendance` routes use the Phase 08 operation/authorization/append transaction boundary. Classroom drafts publish only selected children; corrections append; current day/detail/history and explicit no-class actions are implemented.
- Evidence: unit 50/50 passed via direct pinned Node/Vitest. Focused real PostgreSQL attendance checks pass individually, including explicit missing/absent/present, advisory notice dedupe, outbox-linked absence staging, A10 separate-actor correction race, A02 scope, A06 blocked guardian, A31 module disable, and no-class N/A. Migration upgrade/rerun passed 2/2 alongside the first attendance run. Two interim fixture API-shape errors were corrected and rerun; the affected A02/A06/A31 test now passes.
- UI checkpoint: bilingual teacher classroom task at `/teacher/today` provides explicit bulk selection, per-child status/reason review, missing-state progress, no-class action, correction/history; guardian child detail includes authoritative current attendance and advisory date-range notice. D35 and ATTENDANCE.md record calendar/publication defaults and the Phase 12 boundary.
- UI evidence: `tests/e2e/attendance.test.tsx` passed 2/2 (English and Egyptian Arabic) with real HTTP/PostgreSQL, no captured HTTP 5xx, and axe checks. Interim failures exposed and corrected a test cleanup import, test account locale setup, invalid nested forms, and an exact-label query; final rerun passed.
- Final evidence: unit 50/50; focused real PostgreSQL attendance+migration 8/8; directly affected Phase 08 learning regression 7/7; bilingual DOM/HTTP 2/2 with no HTTP 5xx and axe checks; workspace typecheck and build passed; changed API/web/contracts lint passed; diff check passed. Exact commands and corrected interim failures are in HANDOFF.md and ATTENDANCE.md.
- Runtime/migration: pinned Node 24.19.0/npm 11.1.0; disposable PostgreSQL 18.4 remains listening at 127.0.0.1:55407 (PID 19720 at final check). Migration 0007 was tested only in isolated schemas; no operator/live migration, environment file, or deployment.
- Limits: reviewed classroom pages are bounded to 100 children; parent live delivery remains Phase 12. Build warns about a 536.03 kB minified main chunk. No manual browser/visual or performance claim. The unrelated prior auth DOM reset timing issue remains open.
- Last completed phase: 09. Next executable phase: 10 — Exams, grades, and corrections — only when requested. Stop; do not continue automatically.

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
| 10 | Exams, grades, and corrections | NOT STARTED | None |
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
