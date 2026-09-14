# Project state

Baseline: 2026-09-13. Phase 20 complete (2026-09-14).

## Active state

- Phase20 — Management reports and PDF/Excel exports — COMPLETE. `npm run test:integration -- --maxWorkers=1` passed 30 files/173 real-PostgreSQL tests in 693.26s, including fresh complete migrations through `0021_reports_exports`, Phase19→0021 upgrade/rerun, A21/A24/A26 reconciliation, all 24 report kinds, scope isolation, pg-boss retry/restart, creator-only private downloads, expiry cleanup, row-cap failure, and formula injection defense. `npm run test:e2e -- --maxWorkers=1` passed 20 files/51 bilingual real-HTTP/DOM tests in 503.10s; `npm run test:unit` passed 22 files/67 tests in 8.50s; workspace typecheck, lint, build, and diff check passed. Detailed commands, raw plan data, and render validation: [MANAGEMENT_REPORTS.md](MANAGEMENT_REPORTS.md).

- Query evidence uses `EXPLAIN ANALYZE BUFFERS FORMAT JSON`: a populated fixture (101 obligations, 81 receipts, 85 treasury movements, one payroll advance) measured cash 4.524ms, collections 2.509ms, outstanding 4.340ms, accounts 0.369ms, payroll 0.806ms, unpaid payroll 0.220ms. A 10,031-child fixture measured selective child scope 0.45ms using `children_scope`, capacity 3.28ms, cash 0.66ms, outstanding 0.18ms and payroll 0.62ms. These are local fixture observations, not deployment guarantees.

- Final artifacts were regenerated in ignored `output/phase20`: ExcelJS reopened English/Arabic workbooks and asserted sheet, localized headers, typed dates, exact piastres, numeric EGP, RTL and no formulas. PDFDocument and `pdfinfo` verified PDF 1.7, A4, unencrypted, no forms/JavaScript, correct metadata; Poppler rendering and visual review verified one-page collection reports and six-page 30-row long-text reports without clipping. Disposable PostgreSQL18.4 was safely stopped after verification; no live nursery was touched.

- Known non-gate warnings: the existing pg client deprecation warning, Vite >500kB chunk warning, and observed Node/npm version mismatch versus package pins. No deployment, browser automation, subagents, or Phase21 work occurred. Next phase: 21 — Excel templates, validation preview, and atomic import.

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
| 21 | Excel templates, validation preview, and atomic import | NOT STARTED | None |
| 22 | PWA, network recovery, and usability hardening | NOT STARTED | None |
| 23 | Dokploy deployment assets, backup, restore, and support | NOT STARTED | None |
| 24 | Cross-module verification and release fixes | NOT STARTED | None |
| 25 | Operator guides, user walkthrough, and final handoff | NOT STARTED | None |

Valid execution statuses: NOT STARTED, IN PROGRESS, BLOCKED, COMPLETE. COMPLETE requires the phase's real acceptance evidence, not merely a generated implementation.

## Update contract

At each meaningful checkpoint replace the active summary with the current facts. Update the ledger only when evidence changes. Include actual command names after Phase 01 creates them. Link detailed evidence rather than accumulating long logs here.

A new user requirement should update DECISIONS.md and affected rules/phases, then be referenced here. Do not discard unresolved defects or mark failed checks skipped to close a phase.
