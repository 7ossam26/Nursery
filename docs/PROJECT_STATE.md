# Project state

Baseline: 2026-09-13. Phase 21 complete (2026-09-15).

## Active state

- Phase21 — Excel templates, validation preview, and atomic import — COMPLETE (2026-09-15). Versioned scope-filtered templates (PARENTS_CHILDREN/OPENING_BALANCES/EMPLOYEES v1), bounded zip-guarded parsing, staged validation preview with a preview hash, and one atomic `IMPORT_COMMIT` operation that reuses onboarding, ledger, payroll, licensing and staff-assignment services. New delegable `imports.commit` capability and `import_batches` in migration `0022_imports.sql`; bilingual `/administration/imports`. Contract, limits, duplicate policy, credential procedure and evidence: [IMPORTS.md](IMPORTS.md); defaults D49.

- Evidence on the disposable PostgreSQL18.4 cluster (127.0.0.1:55421, fresh isolated schemas): `npm run test:integration -- --maxWorkers=1` passed 31 files/181 tests in 679.92s including `tests/integration/imports.test.ts` (A29 debt-only 250000 piastres with cash unchanged, A30 quota/scope/data drift → STALE_VERSION/revalidation without duplicates, A03/A04 shared-child links and a concurrent final-slot race committing exactly once, A37 formula/forged/oversize/macro/foreign/unauthorized-role rejection, employee/login/assignment import, validation rules) and Phase3/5/18/19/20 upgrades through 0022 with idempotent rerun. Final focused re-run on the final source (imports/children/payroll/organization) 38/38. `tests/e2e/imports.test.tsx` 3/3 bilingual real-HTTP/DOM (template attachment, browser upload, row errors, atomic commit, one-time credentials, working temporary login, axe clean); regression DOM children/organization/payroll/billing 12/12. `npm run test:unit` 24 files/73 tests; workspace typecheck, lint, build and `git diff --check` exit 0 (existing Vite chunk warning only).

- Known non-gate items: expired previews retained as bounded rows; credentials follow the existing 24-hour temporary rule; host Node25.2.1/npm11.6.2 differ from pins; no deployment, performance, manual visual, browser automation or subagent use. The disposable cluster remains running for optional inspection and should be stopped with `pg_ctl -D C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8 stop`. Next phase: 22 — PWA, network recovery, and usability hardening; do not start it automatically.

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
| 11 | Homework assignments and individual completion | COMPLETE | Homework PostgreSQL 8/8; learning/exam/attendance/migration regression 22/22; unit 56/56; bilingual DOM/HTTP 2/2; workspace typecheck/lint/build, fresh migration/rerun and diff passed. See HOMEWORK.md. |
| 12 | Parent hub, announcements, and live notifications | IN PROGRESS | Prerequisites 12/12; PG/regression 24/24 plus final communication 9/9; unit 3/3; final real HTTP/SSE bilingual DOM/publication 3/3; final type/lint/build passed. Required screenshot handoff conflict pending. |
| 13 | Financial records, transactions, and treasury core | COMPLETE | Final PostgreSQL finance 16/16; upgrade/rerun 2/2; focused unit 7/7 plus final finance 1/1; bilingual real HTTP/DOM/lost-response 2/2; final type/lint/build and diff passed. See FINANCIAL_CORE.md. |
| 14 | Billing modes, equal discounts, and recurring charges | COMPLETE | PostgreSQL 33/33; pg-boss restart; migration 0012 upgrade/rerun 2/2; bilingual HTTP/DOM 2/2; focused units 6/6; type/lint/build/diff passed. See BILLING_AND_RECURRENCE.md. |
| 15 | Collections, outstanding balances, receipts, and manual blocks | COMPLETE | PostgreSQL/regression 51/51, final reminders/receipts 5/5 and receipt 1/1; bilingual real HTTP/DOM 4/4; focused units 9/9 plus 4/4; migration upgrade/rerun, worker restart, final A4 Arabic PDF visual/emitted-module smoke, type/lint/build/diff passed. See COLLECTIONS_AND_RECEIPTS.md. |
| 16 | Expenses, transfers, refunds, and daily closing | COMPLETE | A23/A24 and closing/documents checkpoint PG34/34, children10/10, expense/transfer UI4/4, closing UI2/2. A25 backend4/4, combined correction/financial/migration PG36/36, correction/refund UI2/2, final Phase16 UI8/8, units4/4, type/lint/build/diff passed. See EXPENSES_AND_CLOSING.md. |
| 17 | Child branch transfer and outstanding debt ownership | COMPLETE | PostgreSQL56/56 regression + final11/11; bilingual HTTP/DOM2/2; units4/4; migration0017 upgrade/rerun; type/lint/build/diff passed. See CHILD_BRANCH_TRANSFERS.md. |
| 18 | Bus subscriptions, trips, and participation | COMPLETE | PostgreSQL A20/A32/A01/A02/A31 plus atomic cancellation/Phase16 regressions11/11; migration0018–0019 upgrade/rerun2/2; bilingual HTTP/DOM5/5; units4/4; lint/type/build/diff passed. D46/F09. |
| 19 | Employee financials and monthly payroll | COMPLETE | Final PostgreSQL payroll/upgrade-rerun15/15; financial regression checkpoint45/45; final bilingual HTTP/DOM/shared-operation8/8; units3/3; lint/type/build/diff passed. D47; see EMPLOYEE_PAYROLL.md. |
| 20 | Management reports and PDF/Excel exports | COMPLETE | Real PostgreSQL integration 30 files/173 tests; bilingual real-HTTP/DOM 20 files/51 tests; units 22 files/67 tests; fresh migration through 0021, pg-boss lifecycle/security/retry, all 24 report kinds, XLSX/PDF content/visual validation, query plans, workspace type/lint/build and diff check passed. See MANAGEMENT_REPORTS.md. |
| 21 | Excel templates, validation preview, and atomic import | COMPLETE | Full PostgreSQL integration 31 files/181 tests incl. imports A29/A30/A03/A04/A37 and Phase20→0022 upgrade/rerun; bilingual HTTP/DOM imports 3/3 plus regression 12/12; units 24 files/73; final focused re-run 38/38; workspace type/lint/build/diff passed. D49; see IMPORTS.md. |
| 22 | PWA, network recovery, and usability hardening | NOT STARTED | None |
| 23 | Dokploy deployment assets, backup, restore, and support | NOT STARTED | None |
| 24 | Cross-module verification and release fixes | NOT STARTED | None |
| 25 | Operator guides, user walkthrough, and final handoff | NOT STARTED | None |

Valid execution statuses: NOT STARTED, IN PROGRESS, BLOCKED, COMPLETE. COMPLETE requires the phase's real acceptance evidence, not merely a generated implementation.

## Update contract

At each meaningful checkpoint replace the active summary with the current facts. Update the ledger only when evidence changes. Include actual command names after Phase 01 creates them. Link detailed evidence rather than accumulating long logs here.

A new user requirement should update DECISIONS.md and affected rules/phases, then be referenced here. Do not discard unresolved defects or mark failed checks skipped to close a phase.
